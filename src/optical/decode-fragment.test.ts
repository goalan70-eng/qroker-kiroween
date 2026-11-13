/**
 * Focused validation of decode-fragment.ts (task 4.2). SYNTHETIC images and a synthetic bit-flip model,
 * not real cameras. The reference code in this file (D4 as 2x2 integer matrices, brute-force matcher,
 * flip-ball enumeration) shares nothing with src/optical/transforms.ts or decode-fragment.ts.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeExactStatistics, type ExactStatistics } from '../../scripts/measure-decode-fragment';
import {
  createFragmentMatcher,
  decodeDetection,
  decodeFragment,
  getDefaultFragmentMatcher,
  type FragmentOutcome,
} from './decode-fragment';
import { detectMarkers, type DetectedMarker } from './detect';
import { mulberry32 } from './prng';
import { renderCardLayer, renderMarker, type GrayImage } from './render';
import { blankImage, compose, fillRect, mat3Apply, pasteImage, rotationMatrix, similarityMatrix, tiltMatrix, translationMatrix, warpImage } from './testing/warp';
import type { TransformName } from './transforms';

const SEED = 20251112;
const FC = { seed: SEED, numRuns: 300 };
const NAMES: readonly TransformName[] = ['I', 'R90', 'R180', 'R270', 'Fh', 'Fv', 'Dm', 'Da'];

// ---------------------------------------------------------------------------------------------
// Independent reference
// ---------------------------------------------------------------------------------------------

/** 2x2 integer matrices [m00, m01, m10, m11] acting on centred cell coordinates (r - 2, c - 2). */
type Mat = readonly [number, number, number, number];
const MAT: Record<TransformName, Mat> = {
  I: [1, 0, 0, 1],
  R90: [0, 1, -1, 0],
  R180: [-1, 0, 0, -1],
  R270: [0, -1, 1, 0],
  Fh: [-1, 0, 0, 1],
  Fv: [1, 0, 0, -1],
  Dm: [0, 1, 1, 0],
  Da: [0, -1, -1, 0],
};
/** A . B (B is applied first). */
const mul = (A: Mat, B: Mat): Mat => [
  A[0] * B[0] + A[1] * B[2],
  A[0] * B[1] + A[1] * B[3],
  A[2] * B[0] + A[3] * B[2],
  A[2] * B[1] + A[3] * B[3],
];
const nameOf = (M: Mat): TransformName => {
  const hit = NAMES.find((n) => MAT[n].every((v, i) => v === M[i]));
  if (!hit) throw new Error('matrix is not in D4');
  return hit;
};
function refApply(M: Mat, p: number): number {
  let out = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (!((p >>> (5 * r + c)) & 1)) continue;
      const a = r - 2;
      const b = c - 2;
      const r2 = M[0] * a + M[1] * b + 2;
      const c2 = M[2] * a + M[3] * b + 2;
      out |= 1 << (5 * r2 + c2);
    }
  }
  return out >>> 0;
}
const pc = (x: number): number => {
  let n = 0;
  for (let v = x >>> 0; v; v &= v - 1) n++;
  return n;
};

const FROZEN = JSON.parse(readFileSync(fileURLToPath(new URL('./codebook.v1.json', import.meta.url)), 'utf8')) as {
  cardOrder: string[];
  patterns: Record<string, number>;
};
const CARDS = FROZEN.cardOrder;
const BASE = CARDS.map((k) => FROZEN.patterns[k] as number);
interface RefT {
  card: number;
  g: TransformName;
  bits: number;
}
const REF_T: RefT[] = [];
BASE.forEach((p, card) => {
  for (const g of NAMES) REF_T.push({ card, g, bits: refApply(MAT[g], p) });
});

type RefResult =
  | { status: 'IDENTIFIED'; card: number; distance: number }
  | { status: 'CORRUPTED_FRAGMENT'; nearest: number }
  | { status: 'AMBIGUOUS'; cards: number[] };

/** Brute force over the 416 reference templates. */
function refClassify(bits: number, radius: number): RefResult {
  let nearest = 26;
  const best = new Map<number, number>();
  for (const t of REF_T) {
    const d = pc(bits ^ t.bits);
    if (d < nearest) nearest = d;
    if (d <= radius) best.set(t.card, Math.min(best.get(t.card) ?? 99, d));
  }
  if (best.size === 0) return { status: 'CORRUPTED_FRAGMENT', nearest };
  if (best.size === 1) {
    const [card, distance] = [...best.entries()][0] as [number, number];
    return { status: 'IDENTIFIED', card, distance };
  }
  return { status: 'AMBIGUOUS', cards: [...best.keys()].sort((a, b) => a - b) };
}

/** Flip-ball enumeration: word -> {card (or -1 when ambiguous), distance}. */
function flipBall(radius: number): Map<number, { card: number; distance: number }> {
  const masks: Array<[number, number]> = [[0, 0]];
  for (let i = 0; i < 25; i++) masks.push([1 << i, 1]);
  if (radius >= 2) for (let i = 0; i < 25; i++) for (let j = i + 1; j < 25; j++) masks.push([(1 << i) | (1 << j), 2]);
  const map = new Map<number, { card: number; distance: number }>();
  for (const t of REF_T) {
    for (const [m, w] of masks) {
      const word = (t.bits ^ m) >>> 0;
      const cur = map.get(word);
      if (!cur) map.set(word, { card: t.card, distance: w });
      else if (cur.card !== t.card) cur.card = -1;
      else cur.distance = Math.min(cur.distance, w);
    }
  }
  return map;
}

function pickK(rng: () => number, k: number, pool: number[] = Array.from({ length: 25 }, (_, i) => i)): number {
  const a = [...pool];
  let mask = 0;
  for (let j = 0; j < k; j++) {
    const idx = Math.floor(rng() * a.length);
    mask |= 1 << (a[idx] as number);
    a.splice(idx, 1);
  }
  return mask >>> 0;
}

// ---------------------------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------------------------

function markerCanvas(pattern: number, mp: number, pad = 12): GrayImage {
  const F = 9 * mp;
  const c = blankImage(F + 2 * pad, F + 2 * pad);
  pasteImage(c, renderMarker(pattern, mp), pad, pad);
  return c;
}

function decodeImage(img: GrayImage, radius: 1 | 2 = 1) {
  return decodeDetection(detectMarkers(img), { radius });
}

function single(res: ReturnType<typeof decodeDetection>): { marker: DetectedMarker; outcome: FragmentOutcome } | null {
  return res.kind === 'DECODED' && res.fragments.length === 1 ? (res.fragments[0] as { marker: DetectedMarker; outcome: FragmentOutcome }) : null;
}

/** Quarter turns k such that a marker rotated clockwise by angleDeg is read as R90^k . P. */
const quarterTurns = (angleDeg: number): number => ((Math.ceil((angleDeg - 45) / 90) % 4) + 4) % 4;
const distToBoundary = (a: number): number => Math.abs((((a % 90) + 90) % 90) - 45);

const STATS: { v?: ExactStatistics } = {};
const stats = (): ExactStatistics => (STATS.v ??= computeExactStatistics());

// ---------------------------------------------------------------------------------------------

describe('1. clean bit patterns', () => {
  it('416 templates x radius 1 and 2: IDENTIFIED with the right card, transform and distance 0', () => {
    const bad: string[] = [];
    let n = 0;
    for (const radius of [1, 2] as const) {
      BASE.forEach((p, ci) => {
        for (const g of NAMES) {
          n++;
          const o = decodeFragment(refApply(MAT[g], p), { radius });
          if (o.status !== 'IDENTIFIED' || o.card !== CARDS[ci] || o.transform !== g || o.distance !== 0 || o.transformCandidates.length !== 1) {
            bad.push(`${CARDS[ci]} ${g} r=${radius}: ${JSON.stringify(o)}`);
          }
        }
      });
    }
    expect(n).toBe(832);
    expect(bad).toEqual([]);
  });
});

describe('2. image path (rotation 0)', () => {
  it('52 cards x 8 transforms, modulePx 4..8: render -> detect -> decode gives the exact card and transform', () => {
    const bad: string[] = [];
    let n = 0;
    BASE.forEach((p, ci) => {
      NAMES.forEach((g, gi) => {
        const mp = 4 + ((ci + gi) % 5);
        const radius = ((ci + gi) % 2 === 0 ? 1 : 2) as 1 | 2;
        const bits = refApply(MAT[g], p);
        const f = single(decodeImage(markerCanvas(bits, mp), radius));
        n++;
        const o = f?.outcome;
        if (!f || !o || o.status !== 'IDENTIFIED' || o.card !== CARDS[ci] || o.transform !== g || o.distance !== 0 || f.marker.bits !== bits) {
          bad.push(`${CARDS[ci]} ${g} mp=${mp}: ${JSON.stringify(o)}`);
        }
      });
    });
    expect(n).toBe(416);
    expect(bad).toEqual([]);
  });

  it('52 card layers x orientation 0/180: two fragments, both decode to the source card', () => {
    const bad: string[] = [];
    for (const [ci, card] of CARDS.entries()) {
      for (const o of [0, 180] as const) {
        const res = decodeImage(renderCardLayer(card, o, { modulePx: 4 }));
        if (res.kind !== 'DECODED' || res.fragments.length !== 2) {
          bad.push(`${card}/${o}: ${res.kind}`);
          continue;
        }
        for (const f of res.fragments) {
          const out = f.outcome;
          const consistent = out.status === 'IDENTIFIED' && refApply(MAT[out.transform], BASE[ci] as number) === f.marker.bits;
          if (out.status !== 'IDENTIFIED' || out.card !== card || !consistent) bad.push(`${card}/${o}: ${JSON.stringify(out)}`);
        }
        const cardsSeen = new Set(res.fragments.map((f) => (f.outcome.status === 'IDENTIFIED' ? f.outcome.card : '?')));
        if (cardsSeen.size !== 1) bad.push(`${card}/${o}: fragments disagree`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('3. rotated, scaled and tilted images', () => {
  /** Observed transform must be R90^k . g (g applied first), k from the analytic canonical-frame rule. */
  function expectedTransform(g: TransformName, k: number): TransformName {
    let M = MAT[g];
    for (let i = 0; i < k; i++) M = mul(MAT.R90, M);
    return nameOf(M);
  }

  it('rotation + scale + subpixel shift (24 seeded cases): card equals the source, transform = R90^k . g', () => {
    const rng = mulberry32(SEED + 7);
    const bad: string[] = [];
    for (let i = 0; i < 24; i++) {
      const ci = Math.floor(rng() * 52);
      const g = NAMES[Math.floor(rng() * 8)] as TransformName;
      let theta = Math.floor(rng() * 3600) / 10;
      while (distToBoundary(theta) < 5) theta = Math.floor(rng() * 3600) / 10;
      const s = 0.5 + 0.7 * rng();
      const S = 160;
      const bits = refApply(MAT[g], BASE[ci] as number);
      const src = blankImage(S, S);
      pasteImage(src, renderMarker(bits, 8), 44, 44);
      const H = compose(similarityMatrix({ cx: S / 2, cy: S / 2, rotationDeg: theta, scale: s }), translationMatrix(20 + rng(), 20 + rng()));
      const img = warpImage(src, H, 200, 200, { supersample: 3 });
      const f = single(decodeDetection(detectMarkers(img)));
      const k = quarterTurns(theta);
      const want = expectedTransform(g, k);
      const o = f?.outcome;
      if (!o || o.status !== 'IDENTIFIED' || o.card !== CARDS[ci] || o.transform !== want || o.distance !== 0) {
        bad.push(`case ${i}: card=${CARDS[ci]} g=${g} theta=${theta} scale=${s.toFixed(3)} k=${k} want=${want} got=${JSON.stringify(o)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('perspective tilt 10..40 deg with random in-plane rotation (12 seeded cases): same relation', () => {
    const bad: string[] = [];
    const S = 220;
    const mp = 8;
    const o0 = (S - 9 * mp) / 2;
    for (let i = 0; i < 12; i++) {
      const rng = mulberry32(SEED + 100 + i);
      const tilt = 10 + 10 * (i % 4);
      const ci = Math.floor(rng() * 52);
      const g = NAMES[Math.floor(rng() * 8)] as TransformName;
      const axis = Math.floor(rng() * 3600) / 10;
      let rot = Math.floor(rng() * 3600) / 10;
      const build = (r: number) =>
        compose(rotationMatrix(r, S / 2, S / 2), tiltMatrix({ cx: S / 2, cy: S / 2, tiltDeg: tilt, axisDeg: axis, distancePx: 5 * 7 * mp }));
      // True grid x-axis angle: circular mean of the four true projected edge directions.
      const trueAngle = (H: number[]): number => {
        const g0 = o0 + mp;
        const cs = [[0, 0], [7, 0], [7, 7], [0, 7]].map(([u, v]) => mat3Apply(H, g0 + (u as number) * mp, g0 + (v as number) * mp));
        let sS = 0;
        let sC = 0;
        for (let j = 0; j < 4; j++) {
          const a = cs[j] as { x: number; y: number };
          const b = cs[(j + 1) % 4] as { x: number; y: number };
          const t = Math.atan2(b.y - a.y, b.x - a.x) - (j * Math.PI) / 2;
          sS += Math.sin(t);
          sC += Math.cos(t);
        }
        return (Math.atan2(sS, sC) * 180) / Math.PI;
      };
      let H = build(rot);
      let ang = trueAngle(H);
      while (distToBoundary(ang) < 5) {
        rot = (rot + 7) % 360;
        H = build(rot);
        ang = trueAngle(H);
      }
      const bits = refApply(MAT[g], BASE[ci] as number);
      const src = blankImage(S, S);
      pasteImage(src, renderMarker(bits, mp), o0, o0);
      const f = single(decodeDetection(detectMarkers(warpImage(src, H, S, S, { supersample: 3 }))));
      const want = expectedTransform(g, quarterTurns(ang));
      const o = f?.outcome;
      if (!o || o.status !== 'IDENTIFIED' || o.card !== CARDS[ci] || o.transform !== want) {
        bad.push(`case ${i}: card=${CARDS[ci]} g=${g} tilt=${tilt} rot=${rot} ang=${ang.toFixed(1)} want=${want} got=${JSON.stringify(o)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('4. corrupted data', () => {
  const log: string[] = [];
  /** Compares decodeFragment with the brute-force reference and applies the guaranteed assertions. */
  function check(bits: number, radius: 1 | 2, k: number | null, orig: { ci: number; g: TransformName } | null, tag: string, fa: Record<string, number>): string[] {
    const bad: string[] = [];
    const o = decodeFragment(bits, { radius });
    const r = refClassify(bits, radius);
    if (o.status === 'AMBIGUOUS') bad.push(`${tag}: AMBIGUOUS with the frozen codebook`);
    if (o.status === 'IDENTIFIED') {
      if (r.status !== 'IDENTIFIED' || CARDS[r.card] !== o.card || r.distance !== o.distance) bad.push(`${tag}: ref ${JSON.stringify(r)} vs ${JSON.stringify(o)}`);
    } else if (o.status === 'CORRUPTED_FRAGMENT') {
      if (r.status !== 'CORRUPTED_FRAGMENT' || r.nearest !== o.nearestDistance) bad.push(`${tag}: ref ${JSON.stringify(r)} vs ${JSON.stringify(o)}`);
    } else if (r.status !== 'AMBIGUOUS') bad.push(`${tag}: ref ${JSON.stringify(r)} vs AMBIGUOUS`);
    if (k !== null && orig) {
      if (k <= radius && !(o.status === 'IDENTIFIED' && o.card === CARDS[orig.ci] && o.transform === orig.g && o.distance === k)) {
        bad.push(`${tag}: guaranteed correction failed: ${JSON.stringify(o)}`);
      }
      if (radius === 1 && (k === 2 || k === 3) && o.status !== 'CORRUPTED_FRAGMENT') bad.push(`${tag}: guaranteed rejection failed: ${JSON.stringify(o)}`);
      const key = `r${radius}k${k}`;
      fa[key] = (fa[key] ?? 0) + (o.status === 'IDENTIFIED' && o.card !== CARDS[orig.ci] ? 1 : 0);
    }
    return bad;
  }

  it('direct bit flips k = 0..8 (random templates): guaranteed regions exact, rest agrees with brute force', () => {
    const rng = mulberry32(SEED + 11);
    const fa: Record<string, number> = {};
    const bad: string[] = [];
    let n = 0;
    for (const radius of [1, 2] as const) {
      for (let k = 0; k <= 8; k++) {
        for (let t = 0; t < 40; t++) {
          const ci = Math.floor(rng() * 52);
          const g = NAMES[Math.floor(rng() * 8)] as TransformName;
          const bits = (refApply(MAT[g], BASE[ci] as number) ^ pickK(rng, k)) >>> 0;
          bad.push(...check(bits, radius, k, { ci, g }, `direct r=${radius} k=${k} ${CARDS[ci]} ${g}`, fa));
          n++;
        }
      }
    }
    // Targeted: flip k of the bits in which a template differs from a near template of ANOTHER card,
    // so that false acceptances actually occur. Compared with the reference, not asserted per status.
    const near: Array<[RefT, RefT, number]> = [];
    for (const a of REF_T) for (const b of REF_T) if (a.card !== b.card) { const d = pc(a.bits ^ b.bits); if (d <= 7) near.push([a, b, d]); }
    const targeted: Record<string, number> = {};
    for (const radius of [1, 2] as const) {
      for (let k = 2; k <= 8; k++) {
        for (let t = 0; t < 60; t++) {
          const [a, b, d] = near[Math.floor(rng() * near.length)] as [RefT, RefT, number];
          if (k > d) continue;
          const diff = Array.from({ length: 25 }, (_, i) => i).filter((i) => ((a.bits ^ b.bits) >>> i) & 1);
          const bits = (a.bits ^ pickK(rng, k, diff)) >>> 0;
          bad.push(...check(bits, radius, k, { ci: a.card, g: a.g }, `targeted r=${radius} k=${k}`, targeted));
          n++;
        }
      }
    }
    expect(bad).toEqual([]);
    expect(Object.values(targeted).reduce((s, v) => s + v, 0)).toBeGreaterThan(0); // generator is not vacuous
    log.push(`direct false acceptances (random): ${JSON.stringify(fa)}`, `targeted false acceptances: ${JSON.stringify(targeted)} of ${n} checked`);
    console.info(log.join('\n'));
  });

  it('property: up to r flips of any template are corrected (seed 20251112)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 51 }), fc.integer({ min: 0, max: 7 }), fc.integer({ min: 1, max: 2 }), fc.integer({ min: 0, max: 2 }), fc.infiniteStream(fc.integer({ min: 0, max: 24 })), (ci, gi, radius, k, stream) => {
        const kk = Math.min(k, radius);
        const g = NAMES[gi] as TransformName;
        const positions = new Set<number>();
        const it = stream[Symbol.iterator]();
        while (positions.size < kk) positions.add(it.next().value as number);
        let mask = 0;
        for (const p of positions) mask |= 1 << p;
        const o = decodeFragment((refApply(MAT[g], BASE[ci] as number) ^ mask) >>> 0, { radius: radius as 1 | 2 });
        return o.status === 'IDENTIFIED' && o.card === CARDS[ci] && o.transform === g && o.distance === kk;
      }),
      FC,
    );
  });

  it('image path: corrupted patterns rendered, detected and decoded (k = 0..8)', () => {
    const rng = mulberry32(SEED + 13);
    const fa: Record<string, number> = {};
    const bad: string[] = [];
    let images = 0;
    for (let k = 0; k <= 8; k++) {
      for (let t = 0; t < 10; t++) {
        const ci = Math.floor(rng() * 52);
        const g = NAMES[Math.floor(rng() * 8)] as TransformName;
        const bits = (refApply(MAT[g], BASE[ci] as number) ^ pickK(rng, k)) >>> 0;
        const det = detectMarkers(markerCanvas(bits, 6));
        images++;
        if (det.kind !== 'DETECTED' || det.markers.length !== 1 || det.markers[0]?.bits !== bits) {
          bad.push(`k=${k} ${CARDS[ci]} ${g}: detector did not read the corrupted pattern exactly`);
          continue;
        }
        for (const radius of [1, 2] as const) {
          const res = decodeDetection(det, { radius });
          const f = single(res);
          if (!f) { bad.push(`k=${k}: no single fragment`); continue; }
          bad.push(...check(f.marker.bits, radius, k, { ci, g }, `image r=${radius} k=${k} ${CARDS[ci]} ${g}`, fa));
        }
      }
    }
    expect(images).toBe(90);
    expect(bad).toEqual([]);
    console.info(`image-path false acceptances: ${JSON.stringify(fa)}`);
  });
});

describe('5. agreement with the exact enumeration', () => {
  const stat = () => stats();
  for (const radius of [1, 2] as const) {
    it(`radius ${radius}: every accepted word is IDENTIFIED with the reference card and distance`, () => {
      const ball = flipBall(radius);
      const s = stat().radii[radius - 1]!;
      let accepted = 0;
      let ambiguous = 0;
      const bad: string[] = [];
      for (const [w, v] of ball) {
        if (v.card === -1) { ambiguous++; continue; }
        accepted++;
        const o = decodeFragment(w, { radius });
        if (o.status !== 'IDENTIFIED' || o.card !== CARDS[v.card] || o.distance !== v.distance) {
          if (bad.length < 20) bad.push(`${w}: ${JSON.stringify(o)} vs ${JSON.stringify(v)}`);
        }
      }
      expect(bad).toEqual([]);
      expect(accepted).toBe(s.acceptedWords);
      expect(ambiguous).toBe(0);
      expect(s.ambiguousWords).toBe(0);
    });
  }

  it('200,000 uniform words + 20,000 template-plus-k-flips (k = 0..12): classification equals the reference', () => {
    const rng = mulberry32(SEED + 17);
    const balls = [flipBall(1), flipBall(2)];
    const words: number[] = [];
    for (let i = 0; i < 200_000; i++) words.push(Math.floor(rng() * 2 ** 25));
    for (let i = 0; i < 20_000; i++) {
      const t = REF_T[Math.floor(rng() * 416)] as RefT;
      words.push((t.bits ^ pickK(rng, i % 13)) >>> 0);
    }
    const bad: string[] = [];
    let accepted1 = 0;
    let accepted2 = 0;
    words.forEach((w, i) => {
      for (const radius of [1, 2] as const) {
        const ref = balls[radius - 1]!.get(w);
        const o = decodeFragment(w, { radius });
        const refCard = ref && ref.card >= 0 ? CARDS[ref.card] : undefined;
        const got = o.status === 'IDENTIFIED' ? o.card : undefined;
        if (got !== refCard && bad.length < 20) bad.push(`#${i} r=${radius} w=${w}: ${JSON.stringify(o)} vs ${String(refCard)}`);
        if (got) (radius === 1 ? accepted1++ : accepted2++);
      }
    });
    expect(bad).toEqual([]);
    // A brute-force cross-check of the flip-ball reference itself on a subset.
    for (let i = 0; i < 3000; i++) {
      const w = words[i * 73 % words.length] as number;
      for (const radius of [1, 2] as const) {
        const r = refClassify(w, radius);
        const ref = balls[radius - 1]!.get(w);
        expect(r.status === 'IDENTIFIED' ? r.card : undefined).toBe(ref && ref.card >= 0 ? ref.card : undefined);
      }
    }
    console.info(`sample of ${words.length} words: accepted r1=${accepted1}, r2=${accepted2}`);
  });

  it('exact statistics satisfy the guarantees', () => {
    const [r1, r2] = stat().radii as [ExactStatistics['radii'][number], ExactStatistics['radii'][number]];
    expect(stat().codebookMatchesFrozenHash).toBe(true);
    for (const r of [r1, r2]) {
      expect(r.ambiguousWords).toBe(0);
      expect(r.guarantees.allCorrectUpToRadius).toBe(true);
      for (const row of r.rows) expect(row.correct + row.falseAccept + row.rejected).toBe(row.total);
    }
    expect(r1.guarantees.k2and3AllRejected).toBe(true);
    // The first false acceptance lies beyond the guaranteed region.
    expect(r1.firstFalseAcceptanceK).toBeGreaterThan(3);
    expect(r2.firstFalseAcceptanceK).toBeGreaterThan(2);
  });
});

describe('6. invalid, solid and odd markers', () => {
  it('solid black 7x7 marker: DETECTED 0x1FFFFFF, decoded as CORRUPTED_FRAGMENT with the reference nearest distance', () => {
    const det = detectMarkers(markerCanvas(0x1ffffff, 6));
    expect(det.kind).toBe('DETECTED');
    if (det.kind !== 'DETECTED') return;
    expect(det.markers[0]?.bits).toBe(0x1ffffff);
    const ref = Math.min(...REF_T.map((t) => pc(0x1ffffff ^ t.bits)));
    for (const radius of [1, 2] as const) {
      const f = single(decodeDetection(det, { radius }));
      expect(f?.outcome.status).toBe('CORRUPTED_FRAGMENT');
      if (f?.outcome.status === 'CORRUPTED_FRAGMENT') expect(f.outcome.nearestDistance).toBe(ref);
    }
    expect(ref).toBeGreaterThan(2);
  });

  it('all-white data (bits 0) is CORRUPTED_FRAGMENT', () => {
    const det = detectMarkers(markerCanvas(0, 6));
    expect(det.kind).toBe('DETECTED');
    const f = single(decodeDetection(det));
    expect(f?.marker.bits).toBe(0);
    expect(f?.outcome.status).toBe('CORRUPTED_FRAGMENT');
    if (f?.outcome.status === 'CORRUPTED_FRAGMENT') expect(f.outcome.nearestDistance).toBe(Math.min(...REF_T.map((t) => pc(t.bits))));
  });

  const brokenBorder = (pattern: number, mp: number): GrayImage => {
    const m = renderMarker(pattern, mp);
    fillRect(m, 4 * mp, 1 * mp, mp, mp, 255); // border module (3, 0) of the 7x7 square
    return m;
  };

  it('a marker with one non-corner border cell white is INVALID_MARKER (passed through, no identity)', () => {
    const c = blankImage(9 * 6 + 24, 9 * 6 + 24);
    pasteImage(c, brokenBorder(BASE[5] as number, 6), 12, 12);
    const det = detectMarkers(c);
    expect(det.kind).toBe('INVALID_MARKER');
    const res = decodeDetection(det);
    expect(res.kind).toBe('INVALID_MARKER');
    expect(res).toEqual({ kind: 'INVALID_MARKER', rejected: det.kind === 'INVALID_MARKER' ? det.rejected : [] });
    expect(JSON.stringify(res)).not.toContain('CORRUPTED_FRAGMENT');
  });

  it('a blank image is NOT_DETECTED (not CORRUPTED_FRAGMENT)', () => {
    const res = decodeDetection(detectMarkers(blankImage(120, 90)));
    expect(res).toEqual({ kind: 'NOT_DETECTED' });
  });

  it('valid + invalid marker in one image: DECODED with the valid fragment, the invalid one only in rejected', () => {
    const mp = 6;
    const F = 9 * mp;
    const c = blankImage(2 * F + 60, F + 40);
    pasteImage(c, renderMarker(BASE[9] as number, mp), 14, 14);
    pasteImage(c, brokenBorder(BASE[20] as number, mp), F + 40, 14);
    const res = decodeDetection(detectMarkers(c));
    expect(res.kind).toBe('DECODED');
    if (res.kind !== 'DECODED') return;
    expect(res.fragments).toHaveLength(1);
    const o = res.fragments[0]?.outcome;
    expect(o?.status === 'IDENTIFIED' ? o.card : null).toBe(CARDS[9]);
    expect(res.rejected.length).toBeGreaterThanOrEqual(1);
  });
});

describe('7. injected custom codebooks', () => {
  const A = BASE[0] as number;
  const B = (A ^ (1 << 3) ^ (1 << 12)) >>> 0; // distance 2 from A
  const near = createFragmentMatcher({ A, B });

  it('(a) observation at distance 1 from two cards is AMBIGUOUS with both candidates (radius 1 and 2)', () => {
    const w = (A ^ (1 << 3)) >>> 0;
    for (const radius of [1, 2] as const) {
      const o = decodeFragment(w, { matcher: near, radius });
      expect(o.status).toBe('AMBIGUOUS');
      if (o.status !== 'AMBIGUOUS') continue;
      expect(o.candidates.map((c) => c.card).sort()).toEqual(['A', 'B']);
      expect(o.candidates.every((c) => c.distance === 1)).toBe(true);
    }
  });

  it('(a2) an exact template of A with B at distance 2: radius 1 identifies A, radius 2 refuses to pick the closer card', () => {
    const o1 = decodeFragment(A, { matcher: near, radius: 1 });
    expect(o1.status === 'IDENTIFIED' ? o1.card : null).toBe('A');
    const o2 = decodeFragment(A, { matcher: near, radius: 2 });
    expect(o2.status).toBe('AMBIGUOUS');
    if (o2.status === 'AMBIGUOUS') expect(o2.candidates).toEqual([{ card: 'A', transform: 'I', distance: 0 }, { card: 'B', transform: 'I', distance: 2 }]);
  });

  it('(b) R180-symmetric base pattern: IDENTIFIED with every tied transform, not AMBIGUOUS', () => {
    let p = 1 << 12;
    for (const i of [0, 2, 3, 6, 9, 10, 11]) p |= (1 << i) | (1 << (24 - i));
    p >>>= 0;
    expect(refApply(MAT.R180, p)).toBe(p);
    const other = BASE[3] as number;
    const m = createFragmentMatcher({ SYM: p, OTHER: other });
    const tied = NAMES.filter((g) => refApply(MAT[g], p) === p);
    expect(tied).toContain('I');
    expect(tied).toContain('R180');
    for (const bits of [p, (p ^ (1 << 7)) >>> 0]) {
      const o = decodeFragment(bits, { matcher: m, radius: 1 });
      expect(o.status).toBe('IDENTIFIED');
      if (o.status !== 'IDENTIFIED') continue;
      expect(o.card).toBe('SYM');
      expect(o.transform).toBe('I');
      expect(o.transformCandidates).toEqual(NAMES.filter((g) => pc(bits ^ refApply(MAT[g], p)) === Math.min(...NAMES.map((h) => pc(bits ^ refApply(MAT[h], p))))));
      expect(o.transformCandidates).toContain('R180');
    }
  });

  it('(c) two different cards with an identical template throw RangeError', () => {
    expect(() => createFragmentMatcher({ A, B: refApply(MAT.R90, A) })).toThrow(RangeError);
    expect(() => createFragmentMatcher({ A, B: A })).toThrow(RangeError);
  });

  it('(d) a distant pair behaves like the frozen codebook', () => {
    const X = BASE[0] as number;
    const Y = BASE[1] as number;
    const m = createFragmentMatcher({ X, Y });
    const rng = mulberry32(SEED + 19);
    for (let t = 0; t < 300; t++) {
      const base = REF_T[(t % 2) * 8 + Math.floor(rng() * 8)] as RefT; // cards 0 or 1
      for (const [radius, kmax] of [[1, 3], [2, 2]] as const) {
        const k = Math.floor(rng() * (kmax + 1));
        const w = (base.bits ^ pickK(rng, k)) >>> 0;
        const a = decodeFragment(w, { matcher: m, radius });
        const b = decodeFragment(w, { radius });
        expect(a.status).toBe(b.status);
        if (a.status === 'IDENTIFIED' && b.status === 'IDENTIFIED') {
          expect([a.card, a.transform, a.distance]).toEqual([b.card === CARDS[0] ? 'X' : 'Y', b.transform, b.distance]);
        }
      }
    }
  });
});

describe('8. options and safety', () => {
  it('invalid radius throws RangeError; default is 1', () => {
    for (const bad of [0, 3, 1.5, Number.NaN, '1', null, -1]) {
      expect(() => decodeFragment(0, { radius: bad as never }), String(bad)).toThrow(RangeError);
      expect(() => createFragmentMatcher({ A: 1 }, { radius: bad as never }), String(bad)).toThrow(RangeError);
    }
    const t = REF_T[10] as RefT;
    const w = (t.bits ^ 0b11) >>> 0; // two flips
    const d = decodeFragment(w);
    expect(d.radius).toBe(1);
    expect(d.status).toBe('CORRUPTED_FRAGMENT');
    const o2 = decodeFragment(w, { radius: 2 });
    expect(o2.status).toBe('IDENTIFIED');
    expect(getDefaultFragmentMatcher().templates).toHaveLength(416);
    expect(() => decodeFragment(-1)).toThrow(RangeError);
    expect(() => decodeFragment(2 ** 25)).toThrow(RangeError);
    expect(() => decodeFragment(1.5)).toThrow(RangeError);
  });

  it('does not mutate its input and is deterministic', () => {
    const det = detectMarkers(markerCanvas(BASE[7] as number, 6));
    if (det.kind !== 'DETECTED') throw new Error('setup');
    const marker = det.markers[0] as DetectedMarker;
    const before = JSON.stringify(marker);
    const frozen = structuredClone(marker);
    Object.freeze(frozen);
    Object.freeze(frozen.cellDarkness);
    Object.freeze(frozen.corners);
    const a = decodeFragment(frozen);
    const b = decodeFragment(marker);
    expect(JSON.stringify(marker)).toBe(before);
    expect(a).toEqual(b);
    expect(decodeFragment(marker)).toEqual(b);
    expect(decodeDetection(det)).toEqual(decodeDetection(det));
  });

  it('static scan: only ./transforms, ./detect (types) and node:fs / node:url; no board or game inputs', () => {
    const src = readFileSync(fileURLToPath(new URL('./decode-fragment.ts', import.meta.url)), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
    const mods = [...code.matchAll(/(?:^|\n)\s*import\s+(?:type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(mods.sort()).toEqual(['./detect', './transforms', 'node:fs', 'node:url']);
    expect(code).not.toMatch(/\brequire\s*\(|\bimport\s*\(/);
    expect(code).not.toMatch(/\b\w*(board|expected|score|game|hand|reference|slot)\w*\b/i);
    expect(src).toMatch(/import type \{[^}]*\} from '\.\/detect'/);
    expect(decodeFragment.length).toBeLessThanOrEqual(2);
  });

  it('NOT_DETECTED and INVALID_MARKER are passed through, never converted', () => {
    expect(decodeDetection({ kind: 'NOT_DETECTED' })).toEqual({ kind: 'NOT_DETECTED' });
    const rej = [{ reason: 'BORDER_NOT_BLACK' as const, center: { x: 1, y: 2 }, bbox: { x0: 0, y0: 0, x1: 3, y1: 4 } }];
    const r = decodeDetection({ kind: 'INVALID_MARKER', rejected: rej });
    expect(r).toEqual({ kind: 'INVALID_MARKER', rejected: rej });
  });
});

describe('9. cell confidence (reported only)', () => {
  const P = BASE[2] as number;
  const mp = 8;
  const whiteCell = Array.from({ length: 25 }, (_, i) => i).find((i) => !((P >>> i) & 1)) as number;
  const blackCell = Array.from({ length: 25 }, (_, i) => i).find((i) => (P >>> i) & 1) as number;
  const cellRect = (img: GrayImage, i: number, value: number): void => {
    const r = Math.floor(i / 5);
    const c = i % 5;
    fillRect(img, (2 + c) * mp, (2 + r) * mp, mp, mp, value);
  };
  const decodeMarker = (m: GrayImage) => {
    const c = blankImage(9 * mp + 24, 9 * mp + 24);
    pasteImage(c, m, 12, 12);
    return single(decodeDetection(detectMarkers(c)));
  };

  it('a mid-gray data cell is flagged and the status is unchanged', () => {
    const clean = decodeMarker(renderMarker(P, mp));
    expect(clean?.outcome.status).toBe('IDENTIFIED');
    expect(clean?.outcome.uncertainCells).toEqual([]);
    expect(clean?.outcome.minCellConfidence).toBeGreaterThan(0.9);

    const gw = renderMarker(P, mp);
    cellRect(gw, whiteCell, 128);
    const a = decodeMarker(gw);
    expect(a?.outcome.uncertainCells).toContain(whiteCell);
    expect(a?.outcome.status).toBe('IDENTIFIED');
    expect(a?.outcome.status === 'IDENTIFIED' && clean?.outcome.status === 'IDENTIFIED' ? [a.outcome.card, a.outcome.transform, a.outcome.distance] : null).toEqual([CARDS[2], 'I', 0]);

    const gb = renderMarker(P, mp);
    cellRect(gb, blackCell, 120);
    const b = decodeMarker(gb);
    expect(b?.outcome.uncertainCells).toContain(blackCell);
    expect(b?.outcome.status).toBe('IDENTIFIED');
    expect(b?.outcome.cellConfidence?.[blackCell]).toBeLessThan(0.3);
  });

  it('blur lowers cell confidence, a looser threshold flags the weakest cell, status unchanged', () => {
    const blur = (img: GrayImage, r: number): GrayImage => {
      const w = img.width;
      const tmp = new Float64Array(w * w);
      const out = blankImage(w, w);
      for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { let s = 0; for (let d = -r; d <= r; d++) s += img.data[y * w + Math.min(w - 1, Math.max(0, x + d))] as number; tmp[y * w + x] = s / (2 * r + 1); }
      for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { let s = 0; for (let d = -r; d <= r; d++) s += tmp[Math.min(w - 1, Math.max(0, y + d)) * w + x] as number; out.data[y * w + x] = Math.round(s / (2 * r + 1)); }
      return out;
    };
    const clean = decodeMarker(renderMarker(P, mp));
    // Box width 7 on an 8 px module is the strongest blur (of 1..4 tried) that detect.ts still accepts.
    const bm = decodeMarker(blur(renderMarker(P, mp), 3));
    expect(bm?.outcome.status).toBe('IDENTIFIED');
    expect(bm?.outcome.status === 'IDENTIFIED' ? [bm.outcome.card, bm.outcome.transform, bm.outcome.distance] : null).toEqual([CARDS[2], 'I', 0]);
    const minC = bm?.outcome.minCellConfidence as number;
    expect(minC).toBeLessThan(clean?.outcome.minCellConfidence as number);
    // MEASURED: at this blur the least confident cell is still above the default threshold 0.3, so the
    // default flags nothing; a looser threshold flags the least confident cell and the status is unchanged.
    console.info(`blur r=3, modulePx 8: minCellConfidence ${minC.toFixed(3)}, uncertain at default threshold: ${JSON.stringify(bm?.outcome.uncertainCells)}`);
    const marker = bm?.marker as DetectedMarker;
    const loose = decodeFragment(marker, { uncertainThreshold: 0.5 });
    const argMin = (loose.cellConfidence as number[]).indexOf(minC);
    expect(loose.uncertainCells).toContain(argMin);
    expect(loose.status).toBe('IDENTIFIED');
  });

  it('raw number input has no confidence; threshold option moves the flagged set', () => {
    const o = decodeFragment(P);
    expect(o.cellConfidence).toBeNull();
    expect(o.minCellConfidence).toBeNull();
    expect(o.uncertainCells).toEqual([]);
    const f = decodeMarker(renderMarker(P, mp));
    const marker = f?.marker as DetectedMarker;
    expect(decodeFragment(marker, { uncertainThreshold: 0 }).uncertainCells).toEqual([]);
    expect(decodeFragment(marker, { uncertainThreshold: 1.01 }).uncertainCells).toHaveLength(25);
    expect(() => decodeFragment(marker, { uncertainThreshold: Number.NaN })).toThrow(RangeError);
  });
});
