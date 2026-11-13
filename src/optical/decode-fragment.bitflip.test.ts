/**
 * Task 4.3: exhaustive and adversarial bit-flip verification of decode-fragment.ts (Property 24).
 * SYNTHETIC images and a synthetic independent-bit-flip model, not real cameras.
 *
 * Mathematically guaranteed (frozen codebook, template distance d_id >= 5):
 *  - up to `radius` flips are always corrected to the original card and transform (radius <= 2);
 *  - radius 1: 2 and 3 flips are always CORRUPTED_FRAGMENT;
 *  - a false acceptance needs at least d_id - radius flips (triangle inequality).
 * Measured only (not guaranteed): false-acceptance rates, wrong-transform rates, image-level samples.
 * The false acceptances exercised below document an INHERENT LIMIT of a distance-5 code, not a defect:
 * the decoder cannot tell such a word from a genuine reading of another card.
 *
 * The reference code (D4 as 2x2 integer matrices, brute-force matcher, flip-ball enumeration) shares nothing
 * with src/optical/transforms.ts or decode-fragment.ts.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildReport, renderJson, renderMarkdown, type FalseAcceptance, type Report } from '../../scripts/collect-decode-counterexamples';
import { computeExactStatistics, type ExactStatistics } from '../../scripts/measure-decode-fragment';
import { createFragmentMatcher, decodeDetection, decodeFragment, type DecodeDetectionResult, type FragmentOutcome } from './decode-fragment';
import { detectMarkers } from './detect';
import { mulberry32 } from './prng';
import { renderMarker, type GrayImage } from './render';
import { blankImage, fillRect, pasteImage, rotationMatrix, translationMatrix, uniformNoiseImage, warpImage, compose } from './testing/warp';
import type { TransformName } from './transforms';

const SEED = 20251112;
const NAMES: readonly TransformName[] = ['I', 'R90', 'R180', 'R270', 'Fh', 'Fv', 'Dm', 'Da'];

// ---------------------------------------------------------------------------------------------
// Independent reference
// ---------------------------------------------------------------------------------------------
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
function refApply(M: Mat, p: number): number {
  let out = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (!((p >>> (5 * r + c)) & 1)) continue;
      const a = r - 2;
      const b = c - 2;
      out |= 1 << (5 * (M[0] * a + M[1] * b + 2) + (M[2] * a + M[3] * b + 2));
    }
  }
  return out >>> 0;
}
const pc = (x: number): number => {
  let v = x >>> 0;
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return Math.imul(v, 0x01010101) >>> 24;
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
const TBITS = Uint32Array.from(REF_T, (t) => t.bits);

type RefResult =
  | { status: 'IDENTIFIED'; card: number; distance: number }
  | { status: 'CORRUPTED_FRAGMENT'; nearest: number }
  | { status: 'AMBIGUOUS' };

/** Brute force over the 416 reference templates. */
function refClassify(bits: number, radius: number): RefResult {
  let nearest = 26;
  let card = -1;
  let dist = 99;
  let ambiguous = false;
  for (let i = 0; i < TBITS.length; i++) {
    const d = pc(bits ^ (TBITS[i] as number));
    if (d < nearest) nearest = d;
    if (d > radius) continue;
    const c = (i / 8) | 0;
    if (card === -1) {
      card = c;
      dist = d;
    } else if (c !== card) ambiguous = true;
    else if (d < dist) dist = d;
  }
  if (card === -1) return { status: 'CORRUPTED_FRAGMENT', nearest };
  if (ambiguous) return { status: 'AMBIGUOUS' };
  return { status: 'IDENTIFIED', card, distance: dist };
}

/** Word -> {card (-1 when within radius of two cards), distance}, over all words within `radius` of a template. */
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

/** Every k-subset of `pool` as a bit mask (deterministic, lexicographic). */
function subsetMasks(pool: readonly number[], k: number): number[] {
  const out: number[] = [];
  const rec = (start: number, left: number, mask: number): void => {
    if (left === 0) {
      out.push(mask >>> 0);
      return;
    }
    for (let i = start; i <= pool.length - left; i++) rec(i + 1, left - 1, mask | (1 << (pool[i] as number)));
  };
  rec(0, k, 0);
  return out;
}
const ALL25 = Array.from({ length: 25 }, (_, i) => i);

/** Independent d_id: minimum distance between templates of different cards. */
const D_ID = (() => {
  let d = 99;
  for (const a of REF_T) for (const b of REF_T) if (a.card !== b.card) d = Math.min(d, pc(a.bits ^ b.bits));
  return d;
})();

const STATS: { v?: ExactStatistics } = {};
const stats = (): ExactStatistics => (STATS.v ??= computeExactStatistics());

// ---------------------------------------------------------------------------------------------
// G1: exhaustive guaranteed regions through decodeFragment
// ---------------------------------------------------------------------------------------------
interface G1Result {
  cases: number;
  /** [radius][weight] -> cross-card IDENTIFIED count */
  crossAccepted: number[][];
  /** [radius][weight] -> {correct, falseAccept, rejected} */
  counts: Array<Array<{ events: number; correct: number; falseAccept: number; rejected: number }>>;
  r2w3: { falseAccept: number; correct: number; rejected: number; referenceMismatches: string[] };
  violations: string[];
}
const G1: { v?: G1Result } = {};
function runG1(): G1Result {
  if (G1.v) return G1.v;
  const masksByWeight: number[][] = [0, 1, 2, 3].map((w) => subsetMasks(ALL25, w));
  const res: G1Result = {
    cases: 0,
    crossAccepted: [[], [0, 0, 0, 0], [0, 0, 0, 0]],
    counts: [[], [], []],
    r2w3: { falseAccept: 0, correct: 0, rejected: 0, referenceMismatches: [] },
    violations: [],
  };
  for (const radius of [1, 2] as const) {
    res.counts[radius] = [0, 1, 2, 3].map(() => ({ events: 0, correct: 0, falseAccept: 0, rejected: 0 }));
    for (let ti = 0; ti < REF_T.length; ti++) {
      const t = REF_T[ti] as RefT;
      for (let w = 0; w <= 3; w++) {
        for (const mask of masksByWeight[w] as number[]) {
          const word = (t.bits ^ mask) >>> 0;
          const o = decodeFragment(word, { radius });
          res.cases++;
          const row = (res.counts[radius] as G1Result['counts'][number])[w] as G1Result['counts'][number][number];
          row.events++;
          if (o.status === 'AMBIGUOUS') {
            if (res.violations.length < 20) res.violations.push(`AMBIGUOUS r=${radius} ${CARDS[t.card]} ${t.g} mask=${mask}`);
            row.rejected++;
            continue;
          }
          if (o.status === 'IDENTIFIED') {
            if (o.card === CARDS[t.card]) row.correct++;
            else {
              row.falseAccept++;
              (res.crossAccepted[radius] as number[])[w]!++;
            }
          } else row.rejected++;

          if (w <= radius) {
            if (!(o.status === 'IDENTIFIED' && o.card === CARDS[t.card] && o.transform === t.g && o.distance === w)) {
              if (res.violations.length < 20) res.violations.push(`correction failed r=${radius} w=${w} ${CARDS[t.card]} ${t.g} mask=${mask}: ${o.status}`);
            }
          }
          if (radius === 1 && w >= 2 && o.status !== 'CORRUPTED_FRAGMENT') {
            if (res.violations.length < 20) res.violations.push(`radius-1 rejection failed w=${w} ${CARDS[t.card]} ${t.g} mask=${mask}: ${o.status}`);
          }
          if (radius === 2 && w === 3) {
            const r = refClassify(word, 2);
            const agree =
              o.status === 'IDENTIFIED'
                ? r.status === 'IDENTIFIED' && CARDS[r.card] === o.card && r.distance === o.distance
                : r.status === 'CORRUPTED_FRAGMENT' && r.nearest === (o as Extract<FragmentOutcome, { status: 'CORRUPTED_FRAGMENT' }>).nearestDistance;
            if (!agree && res.r2w3.referenceMismatches.length < 20) res.r2w3.referenceMismatches.push(`${CARDS[t.card]} ${t.g} mask=${mask}: ${JSON.stringify(o)} vs ${JSON.stringify(r)}`);
            if (o.status === 'IDENTIFIED') {
              if (o.card === CARDS[t.card]) res.r2w3.correct++;
              else res.r2w3.falseAccept++;
            } else res.r2w3.rejected++;
          }
        }
      }
    }
  }
  G1.v = res;
  return res;
}

describe('G1. exhaustive guaranteed regions through decodeFragment', () => {
  it('all 416 templates x all flip masks of weight 0..3 (2,626 per template), radius 1 and 2', () => {
    const t0 = Date.now();
    const g = runG1();
    console.info(`G1: ${g.cases} decodeFragment calls in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    expect(g.cases).toBe(416 * 2626 * 2);
    expect(g.violations).toEqual([]);
    const s = stats();
    // Event counts per (radius, weight) agree with the exact enumeration of the 4.2 script.
    for (const radius of [1, 2] as const) {
      for (let w = 0; w <= 3; w++) {
        const row = (g.counts[radius] as G1Result['counts'][number])[w] as G1Result['counts'][number][number];
        const ex = (s.radii[radius - 1] as ExactStatistics['radii'][number]).rows[w] as ExactStatistics['radii'][number]['rows'][number];
        expect(row.events, `r${radius} w${w} events`).toBe(ex.total);
        expect(row.correct, `r${radius} w${w} correct`).toBe(ex.correct);
        expect(row.falseAccept, `r${radius} w${w} falseAccept`).toBe(ex.falseAccept);
        expect(row.rejected, `r${radius} w${w} rejected`).toBe(ex.rejected);
        if (w <= radius) expect(row.correct).toBe(row.events);
        if (radius === 1 && w >= 2) expect(row.rejected).toBe(row.events);
      }
    }
  }, 300_000);

  it('radius 2, weight 3: no status is asserted; decodeFragment equals the brute-force reference in all 956,800 cases', () => {
    const g = runG1();
    const ex = (stats().radii[1] as ExactStatistics['radii'][number]).rows[3] as ExactStatistics['radii'][number]['rows'][number];
    expect(g.r2w3.referenceMismatches).toEqual([]);
    expect(g.r2w3.correct + g.r2w3.falseAccept + g.r2w3.rejected).toBe(956_800);
    // MEASURED: counts equal the exact-enumeration statistics (m4-2).
    expect(g.r2w3.falseAccept).toBe(ex.falseAccept);
    expect(g.r2w3.correct).toBe(ex.correct);
    expect(g.r2w3.rejected).toBe(ex.rejected);
    console.info(`G1 radius 2 weight 3: false acceptances ${g.r2w3.falseAccept} of 956800 (exact enumeration: ${ex.falseAccept}), correct ${g.r2w3.correct}, rejected ${g.r2w3.rejected}`);
  }, 300_000);
});

// ---------------------------------------------------------------------------------------------
// G2: adversarial constructive false acceptance at the triangle-inequality bound
// ---------------------------------------------------------------------------------------------
describe('G2. false acceptance needs at least d_id - radius flips (inherent limit of the code)', () => {
  it('independent d_id is at least 5 and agrees with the generator report', () => {
    expect(D_ID).toBeGreaterThanOrEqual(5);
    expect(D_ID).toBe(5);
  });

  it('(i) lower bound: no cross-card IDENTIFIED below d_id - radius flips (exhaustive, from G1)', () => {
    const g = runG1();
    for (const radius of [1, 2] as const) {
      const bound = D_ID - radius;
      // G1 covers weights 0..3; the bound must lie inside or at the edge of that range for the claim to be exhaustive.
      expect(bound - 1).toBeLessThanOrEqual(3);
      for (let w = 0; w < bound; w++) expect((g.crossAccepted[radius] as number[])[w], `r${radius} w${w}`).toBe(0);
    }
  }, 300_000);

  it('(ii) attainment: flipping d_id - radius of the differing bits toward another card yields IDENTIFIED as that other card', () => {
    const totals: Record<number, { pairs: number; choices: number }> = {};
    const bad: string[] = [];
    // Documentation of an inherent limit: such a word lies within `radius` of the other card's template and
    // is at least d_id - 2 * radius > radius from every template of the source card.
    for (const radius of [1, 2] as const) {
      let pairs = 0;
      let choices = 0;
      const k = D_ID - radius;
      for (let i = 0; i < REF_T.length; i++) {
        const s = REF_T[i] as RefT;
        for (let j = 0; j < REF_T.length; j++) {
          const t = REF_T[j] as RefT;
          if (s.card === t.card) continue;
          const diffMask = (s.bits ^ t.bits) >>> 0;
          if (pc(diffMask) !== D_ID) continue;
          pairs++;
          const diff = ALL25.filter((b) => (diffMask >>> b) & 1);
          for (const mask of subsetMasks(diff, k)) {
            choices++;
            const o = decodeFragment((s.bits ^ mask) >>> 0, { radius });
            if (!(o.status === 'IDENTIFIED' && o.card === CARDS[t.card] && o.distance <= radius)) {
              if (bad.length < 20) bad.push(`r=${radius} ${CARDS[s.card]} ${s.g} -> ${CARDS[t.card]} ${t.g} mask=${mask}: ${JSON.stringify(o)}`);
            }
          }
        }
      }
      totals[radius] = { pairs, choices };
    }
    expect(bad).toEqual([]);
    expect((totals[1] as { pairs: number }).pairs).toBeGreaterThan(0);
    expect((totals[2] as { pairs: number }).pairs).toBe((totals[1] as { pairs: number }).pairs);
    console.info(`G2 attainment: ${JSON.stringify(totals)} (ordered template pairs of different cards at distance ${D_ID}; all choices decode as the other card)`);
  }, 300_000);
});

// ---------------------------------------------------------------------------------------------
// G3: transformation correctness vs transformation ambiguity
// ---------------------------------------------------------------------------------------------
describe('G3. same card, different transform beyond the guaranteed radius', () => {
  for (const radius of [1, 2] as const) {
    it(`radius ${radius}: enumerated wrong-transform cases; first 50 decode as same card, other unique transform; counts per weight equal the exact statistics`, () => {
      const ball = flipBall(radius);
      const counts = new Array<number>(26).fill(0);
      const cases: Array<[number, number, number]> = [];
      for (const [word, v] of ball) {
        if (v.card < 0) continue;
        const base = v.card * 8;
        let nearest = 99;
        for (let g = 0; g < 8; g++) nearest = Math.min(nearest, pc(word ^ (TBITS[base + g] as number)));
        for (let g = 0; g < 8; g++) {
          const d = pc(word ^ (TBITS[base + g] as number));
          if (d > nearest) {
            counts[d]!++;
            cases.push([d, base + g, word]);
          }
        }
      }
      cases.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
      expect(cases.length).toBeGreaterThan(50);
      expect(cases[0]?.[0]).toBeGreaterThan(radius);

      const bad: string[] = [];
      for (const [d, ti, word] of cases.slice(0, 50)) {
        const src = REF_T[ti] as RefT;
        const o = decodeFragment(word, { radius });
        let nearestG: TransformName = 'I';
        let nd = 99;
        for (let g = 0; g < 8; g++) {
          const dd = pc(word ^ (TBITS[src.card * 8 + g] as number));
          if (dd < nd) {
            nd = dd;
            nearestG = NAMES[g] as TransformName;
          }
        }
        const ok = o.status === 'IDENTIFIED' && o.card === CARDS[src.card] && o.transform !== src.g && o.transform === nearestG && o.transformCandidates.length === 1 && o.distance === nd && nd < d;
        if (!ok) bad.push(`${CARDS[src.card]} ${src.g} word=${word}: ${JSON.stringify(o)}`);
      }
      expect(bad).toEqual([]);

      const rows = (stats().radii[radius - 1] as ExactStatistics['radii'][number]).rows;
      for (let k = 0; k <= 25; k++) expect(counts[k], `weight ${k}`).toBe((rows[k] as ExactStatistics['radii'][number]['rows'][number]).correctOtherTransform);
      console.info(`G3 radius ${radius}: ${cases.length} wrong-transform events; first weight ${cases[0]?.[0]}`);
    }, 300_000);
  }

  it('symmetric pattern: flips keep every tied transform listed, never AMBIGUOUS', () => {
    let p = 1 << 12;
    for (const i of [0, 2, 3, 6, 9, 10, 11]) p |= (1 << i) | (1 << (24 - i));
    p >>>= 0;
    const stabilizer = NAMES.filter((g) => refApply(MAT[g], p) === p);
    expect(stabilizer).toContain('I');
    expect(stabilizer).toContain('R180');
    const other = BASE[3] as number;
    // Precondition: the two cards are far enough apart that the interaction is only about transforms.
    let minCross = 99;
    for (const g of NAMES) for (const h of NAMES) minCross = Math.min(minCross, pc(refApply(MAT[g], p) ^ refApply(MAT[h], other)));
    expect(minCross).toBeGreaterThanOrEqual(5);
    const m = createFragmentMatcher({ SYM: p, OTHER: other });
    let multi = 0;
    const check = (radius: 1 | 2, mask: number): void => {
      const word = (p ^ mask) >>> 0;
      const o = decodeFragment(word, { matcher: m, radius });
      expect(o.status).toBe('IDENTIFIED');
      if (o.status !== 'IDENTIFIED') return;
      const ds = NAMES.map((g) => pc(word ^ refApply(MAT[g], p)));
      const min = Math.min(...ds);
      const ties = NAMES.filter((_, i) => ds[i] === min);
      expect(o.card).toBe('SYM');
      expect(o.distance).toBe(min);
      expect(o.transformCandidates).toEqual(ties);
      expect(o.transform).toBe(ties[0]);
      for (const s of stabilizer) expect(o.transformCandidates).toContain(s);
      if (o.transformCandidates.length > 1) multi++;
    };
    for (const mask of subsetMasks(ALL25, 1)) check(1, mask);
    for (const mask of subsetMasks(ALL25, 1)) check(2, mask);
    for (const mask of subsetMasks(ALL25, 2)) check(2, mask);
    expect(multi).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
// G4: five outcomes end to end through render -> detect -> decode
// ---------------------------------------------------------------------------------------------
interface Variation {
  mp: number;
  ox: number;
  oy: number;
  rot: number;
}
const VARIATIONS: Variation[] = [
  { mp: 4, ox: 12, oy: 12, rot: 0 },
  { mp: 5, ox: 20, oy: 15, rot: 90 },
  { mp: 6, ox: 14, oy: 28, rot: 180 },
  { mp: 7, ox: 30, oy: 12, rot: 270 },
  { mp: 8, ox: 25, oy: 25, rot: 0 },
  { mp: 9, ox: 18, oy: 33, rot: 90 },
  { mp: 10, ox: 33, oy: 21, rot: 180 },
  { mp: 8, ox: 22, oy: 26, rot: 23.5 },
  { mp: 8, ox: 26, oy: 20, rot: 61 },
  { mp: 10, ox: 24, oy: 24, rot: 143.7 },
];

/** Places `render` (a 9*mp square marker image, or null for an empty scene) in a scene for the variation. */
function scene(marker: GrayImage | null, v: Variation, noiseSeed?: number): GrayImage {
  if (v.rot === 0) {
    const W = 9 * v.mp + 60;
    const c = noiseSeed === undefined ? blankImage(W, W) : uniformNoiseImage(W, W, mulberry32(noiseSeed));
    if (marker) pasteImage(c, marker, v.ox, v.oy);
    return c;
  }
  const S = 18 * v.mp;
  const c = noiseSeed === undefined ? blankImage(S, S) : uniformNoiseImage(S, S, mulberry32(noiseSeed));
  const centre = Math.floor((S - 9 * v.mp) / 2); // integer: pasteImage ignores fractional offsets
  if (marker) pasteImage(c, marker, centre, centre);
  if (noiseSeed !== undefined) return c;
  const H = compose(rotationMatrix(v.rot, S / 2, S / 2), translationMatrix((v.ox - 24) / 4, (v.oy - 24) / 4));
  return warpImage(c, H, S, S, { supersample: 3 });
}

type Label = 'NOT_DETECTED' | 'INVALID_MARKER' | 'CORRUPTED_FRAGMENT' | 'AMBIGUOUS' | 'IDENTIFIED';
const LABELS: Label[] = ['NOT_DETECTED', 'INVALID_MARKER', 'CORRUPTED_FRAGMENT', 'AMBIGUOUS', 'IDENTIFIED'];

function labelsOf(res: DecodeDetectionResult): Label[] {
  const out: Label[] = [];
  if (res.kind === 'NOT_DETECTED') out.push('NOT_DETECTED');
  if (res.kind === 'INVALID_MARKER') out.push('INVALID_MARKER');
  if (res.kind === 'DECODED') for (const f of res.fragments) out.push(f.outcome.status);
  return out;
}

/** Applies the mutual-exclusion and identity-field rules and returns the single label. */
function expectSingleOutcome(res: DecodeDetectionResult, want: Label, tag: string): void {
  const labels = labelsOf(res);
  expect(labels, tag).toEqual([want]);
  expect(LABELS.filter((l) => labels.includes(l)), tag).toEqual([want]);
  const json = JSON.stringify(res);
  if (res.kind === 'NOT_DETECTED') expect(Object.keys(res), tag).toEqual(['kind']);
  if (res.kind === 'INVALID_MARKER') {
    expect(Object.keys(res).sort(), tag).toEqual(['kind', 'rejected']);
    expect(json, tag).not.toContain('"card"');
  }
  if (res.kind === 'DECODED') {
    const o = (res.fragments[0] as { outcome: FragmentOutcome }).outcome;
    if (o.status === 'CORRUPTED_FRAGMENT' || o.status === 'AMBIGUOUS') {
      for (const field of ['card', 'transform', 'transformCandidates', 'distance']) expect(field in o, `${tag}: ${field}`).toBe(false);
      // AMBIGUOUS lists its candidates by design; CORRUPTED_FRAGMENT mentions no card at all.
      if (o.status === 'CORRUPTED_FRAGMENT') expect(JSON.stringify(o), tag).not.toContain('"card"');
    } else {
      expect(typeof o.card, tag).toBe('string');
    }
  }
}

describe('G4. five outcomes are distinct end to end through the image pipeline', () => {
  const tpl = REF_T[37] as RefT;
  const A = BASE[0] as number;
  const B = (A ^ (1 << 3) ^ (1 << 12)) >>> 0; // distance 2 from A
  const near = createFragmentMatcher({ A, B });

  it.each(VARIATIONS.map((v, i) => [i, v] as const))('variation %i: modulePx/offset/rotation %o', (i, v) => {
    const tag = (s: string): string => `${s} mp=${v.mp} rot=${v.rot} off=${v.ox},${v.oy}`;
    const twoFlips = (tpl.bits ^ (1 << 4) ^ (1 << 19)) >>> 0;
    const run = (bits: number | null, opts: Parameters<typeof decodeDetection>[1], noise?: number) =>
      decodeDetection(detectMarkers(scene(bits === null ? null : renderMarker(bits, v.mp), v, noise)), opts);

    // NOT_DETECTED: blank and noise scenes
    expectSingleOutcomeOrNone(run(null, {}), 'NOT_DETECTED', tag('blank'));
    expectSingleOutcomeOrNone(run(null, {}, SEED + i), 'NOT_DETECTED', tag('noise'));

    // INVALID_MARKER: one non-corner border module white
    const broken = renderMarker(BASE[5] as number, v.mp);
    fillRect(broken, 4 * v.mp, 1 * v.mp, v.mp, v.mp, 255);
    expectSingleOutcome(decodeDetection(detectMarkers(scene(broken, v))), 'INVALID_MARKER', tag('broken border'));

    // CORRUPTED_FRAGMENT: radius 1 with 2 flips, and a solid black marker
    expectSingleOutcome(run(twoFlips, { radius: 1 }), 'CORRUPTED_FRAGMENT', tag('2 flips r1'));
    expectSingleOutcome(run(0x1ffffff, { radius: 1 }), 'CORRUPTED_FRAGMENT', tag('solid r1'));
    expectSingleOutcome(run(0x1ffffff, { radius: 2 }), 'CORRUPTED_FRAGMENT', tag('solid r2'));

    // IDENTIFIED: clean template and one flip
    expectSingleOutcome(run(tpl.bits, { radius: 1 }), 'IDENTIFIED', tag('clean'));
    expectSingleOutcome(run((tpl.bits ^ (1 << 9)) >>> 0, { radius: 1 }), 'IDENTIFIED', tag('1 flip'));

    // AMBIGUOUS: injected matcher, observation at distance 1 from both A and B
    expectSingleOutcome(run((A ^ (1 << 3)) >>> 0, { radius: 1, matcher: near }), 'AMBIGUOUS', tag('ambiguous'));
  });
});

/** NOT_DETECTED scenes produce no fragments, so labelsOf is the kind itself. */
function expectSingleOutcomeOrNone(res: DecodeDetectionResult, want: 'NOT_DETECTED', tag: string): void {
  expectSingleOutcome(res, want, tag);
}

// ---------------------------------------------------------------------------------------------
// G5: recorded counterexamples are executable regression data
// ---------------------------------------------------------------------------------------------
describe('G5. recorded counterexamples', () => {
  const JSON_URL = new URL('../../docs/optical/results/m4-3-counterexamples.json', import.meta.url);
  const MD_URL = new URL('../../docs/optical/results/m4-3-counterexamples.md', import.meta.url);
  const onDisk = (): Report => JSON.parse(readFileSync(fileURLToPath(JSON_URL), 'utf8')) as Report;

  function replay(radius: 1 | 2, rec: FalseAcceptance, kind: 'FALSE_ACCEPT' | 'WRONG_TRANSFORM', i: number): string[] {
    const bad: string[] = [];
    const ci = CARDS.indexOf(rec.sourceCard);
    const src = REF_T.find((t) => t.card === ci && t.g === rec.sourceTransform) as RefT;
    let mask = 0;
    for (const b of rec.flippedBits) mask |= 1 << b;
    mask >>>= 0;
    const bits = (src.bits ^ mask) >>> 0;
    const tag = `r${radius} ${kind} #${i} ${rec.sourceCard} ${rec.sourceTransform}`;
    if (new Set(rec.flippedBits).size !== rec.flippedBits.length || pc(mask) !== rec.weight) bad.push(`${tag}: flip list inconsistent`);
    if ('0x' + bits.toString(16).toUpperCase().padStart(7, '0') !== rec.observedBits) bad.push(`${tag}: observed bits differ`);
    const expectCard = kind === 'FALSE_ACCEPT' ? rec.decodedCard !== rec.sourceCard : rec.decodedCard === rec.sourceCard && rec.decodedTransform !== rec.sourceTransform;
    if (!expectCard) bad.push(`${tag}: record is not of kind ${kind}`);

    const direct = decodeFragment(bits, { radius });
    if (!(direct.status === 'IDENTIFIED' && direct.card === rec.decodedCard && direct.transform === rec.decodedTransform && direct.distance === rec.distance)) bad.push(`${tag}: direct ${JSON.stringify(direct)}`);

    const mp = 4 + (i % 7);
    const canvas = blankImage(9 * mp + 60, 9 * mp + 60);
    pasteImage(canvas, renderMarker(bits, mp), 12 + (i % 5) * 4, 12 + (i % 3) * 7);
    const res = decodeDetection(detectMarkers(canvas), { radius });
    const f = res.kind === 'DECODED' && res.fragments.length === 1 ? res.fragments[0] : undefined;
    const o = f?.outcome;
    if (!f || f.marker.bits !== bits || !(o?.status === 'IDENTIFIED' && o.card === rec.decodedCard && o.transform === rec.decodedTransform && o.distance === rec.distance)) {
      bad.push(`${tag}: image path ${JSON.stringify(o ?? res.kind)}`);
    }
    return bad;
  }

  it('every recorded counterexample reproduces through decodeFragment and render -> detect -> decode', () => {
    const rep = onDisk();
    expect(rep.codebookSha256).toBe('515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4');
    expect(rep.idDistance).toBe(D_ID);
    expect(rep.radii.map((r) => r.radius)).toEqual([1, 2]);
    const bad: string[] = [];
    let n = 0;
    for (const r of rep.radii) {
      const radius = r.radius as 1 | 2;
      expect(r.falseAcceptances).toHaveLength(25);
      expect(r.wrongTransforms).toHaveLength(25);
      // The smallest-weight list starts at the bound d_id - radius and never decreases.
      expect(r.falseAcceptances[0]?.weight).toBe(D_ID - radius);
      for (const list of [r.falseAcceptances, r.wrongTransforms]) for (let i = 1; i < list.length; i++) expect((list[i] as FalseAcceptance).weight).toBeGreaterThanOrEqual((list[i - 1] as FalseAcceptance).weight);
      r.falseAcceptances.forEach((rec, i) => { bad.push(...replay(radius, rec, 'FALSE_ACCEPT', i)); n++; });
      r.wrongTransforms.forEach((rec, i) => { bad.push(...replay(radius, rec, 'WRONG_TRANSFORM', i)); n++; });
    }
    expect(n).toBe(100);
    expect(bad).toEqual([]);
  }, 120_000);

  it('the files on disk are byte-identical to a fresh regeneration; image cells are consistent', () => {
    const fresh = buildReport(stats());
    expect(readFileSync(fileURLToPath(JSON_URL), 'utf8')).toBe(renderJson(fresh));
    expect(readFileSync(fileURLToPath(MD_URL), 'utf8')).toBe(renderMarkdown(fresh));
    expect(renderJson(fresh)).not.toContain('\r');

    expect(fresh.imageCells).toHaveLength(18);
    const rows = fresh.imageCells.map((c) => `r${c.radius} k${c.k}: n=${c.n} correct=${c.correct} falseAccept=${c.falseAccept} rejected=${c.rejected} upper95=${c.falseAcceptUpper95}`);
    console.info(rows.join('\n'));
    for (const c of fresh.imageCells) {
      const b = c.rejectedByKind;
      expect(c.n).toBe(300);
      expect(c.correct + c.sameCardOtherTransform + c.falseAccept + c.rejected).toBe(300);
      expect(b.CORRUPTED_FRAGMENT + b.AMBIGUOUS + b.NOT_DETECTED + b.INVALID_MARKER).toBe(c.rejected);
      if (c.falseAccept === 0) expect(c.falseAcceptUpper95).toBeCloseTo(1 - Math.pow(0.05, 1 / 300), 5);
      else expect(c.falseAcceptUpper95).toBeNull();
      // Guaranteed regions hold at image level whenever the detector read the intended bits.
      if (c.k <= c.radius) {
        expect(c.correct, `r${c.radius} k${c.k}`).toBe(300);
      }
      if (c.radius === 1 && (c.k === 2 || c.k === 3)) {
        expect(c.falseAccept).toBe(0);
        expect(c.correct + c.sameCardOtherTransform).toBe(0);
      }
    }
  }, 300_000);
});

// ---------------------------------------------------------------------------------------------
// G6: agreement with the independent reference under adversarial inputs
// ---------------------------------------------------------------------------------------------
describe('G6. adversarial agreement with the brute-force reference (seed 20251112)', () => {
  const NEAR: Array<[number, number]> = [];
  for (let i = 0; i < REF_T.length; i++) for (let j = 0; j < REF_T.length; j++) if ((REF_T[i] as RefT).card !== (REF_T[j] as RefT).card && pc(TBITS[i]! ^ TBITS[j]!) <= 8) NEAR.push([i, j]);

  it('template + flips toward another card + random extra flips: status, card and distance equal the reference', () => {
    let falseAccepted = 0;
    let runs = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: NEAR.length - 1 }),
        fc.array(fc.integer({ min: 0, max: 24 }), { maxLength: 8 }),
        fc.array(fc.integer({ min: 0, max: 24 }), { maxLength: 3 }),
        fc.constantFrom(1, 2),
        (pair, picks, extra, radius) => {
          const [si, ti] = NEAR[pair] as [number, number];
          const diff = ALL25.filter((b) => ((TBITS[si]! ^ TBITS[ti]!) >>> b) & 1);
          let mask = 0;
          for (const p of picks) mask ^= 1 << (diff[p % diff.length] as number);
          for (const e of extra) mask ^= 1 << e;
          const word = (TBITS[si]! ^ mask) >>> 0;
          const o = decodeFragment(word, { radius: radius as 1 | 2 });
          const r = refClassify(word, radius);
          runs++;
          if (o.status === 'IDENTIFIED' && o.card !== CARDS[(REF_T[si] as RefT).card]) falseAccepted++;
          if (o.status === 'IDENTIFIED') return r.status === 'IDENTIFIED' && CARDS[r.card] === o.card && r.distance === o.distance;
          if (o.status === 'CORRUPTED_FRAGMENT') return r.status === 'CORRUPTED_FRAGMENT' && r.nearest === o.nearestDistance;
          return r.status === 'AMBIGUOUS';
        },
      ),
      { seed: SEED, numRuns: 2000 },
    );
    // The generator reaches false acceptances (it is not vacuous).
    expect(falseAccepted).toBeGreaterThan(0);
    console.info(`G6: ${runs} property evaluations (including shrinking), ${falseAccepted} false acceptances reached`);
  }, 120_000);
});
