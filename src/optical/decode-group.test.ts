/**
 * Tests for decode-group.ts (task 5.1; overlaps with task 5.3). Every image is built from real pixels with
 * renderMarker / renderCardLayer. Expected content comes from fragments.placedFragments, and the validity
 * oracle below is written independently of decode-group.ts (brute force over the 8 image transforms and
 * the set of all placeable patterns per slot).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  ALLOWED_PLACEMENTS,
  SLOTS,
  composeTransforms,
  decodeGroup,
  inverseTransform,
  mapCell,
  type DecodeGroupOptions,
  type GroupDecodeResult,
} from './decode-group';
import { detectMarkers } from './detect';
import { ALL_CARDS, placedFragments, type Corner } from './fragments';
import { mulberry32 } from './prng';
import { FOOTPRINT_MOD, renderMarker, type GrayImage } from './render';
import { CELL_MAPS, TRANSFORM_NAMES, applyTransform, type TransformName } from './transforms';
import {
  FACING,
  RANKS,
  SLOT_NAMES,
  composeGroup,
  facingPattern,
  flatPatch,
  referenceSum,
  rotateImage,
  slotChoices,
  transformImage,
  type Arrangement,
  type Placement,
  type SlotName,
} from './testing/group-compose';
import {
  blankImage,
  fillRect,
  pasteImage,
  rotationMatrix,
  scaleMatrix,
  tiltMatrix,
  compose,
  uniformNoiseImage,
  warpImage,
} from './testing/warp';

vi.setConfig({ testTimeout: 600_000 });
const SEED = 20251112;
const PLAIN: TransformName[] = ['I', 'R90', 'R180', 'R270'];
const MIRROR: TransformName[] = ['Fh', 'Fv', 'Dm', 'Da'];

// ---------------------------------------------------------------------------------------------
// Independent helpers
// ---------------------------------------------------------------------------------------------

const CHOICES = slotChoices();

function shuffledRanks(rng: () => number): string[] {
  const a = [...RANKS] as string[];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as string, a[i] as string];
  }
  return a;
}

/** Arrangement number 0..80 (base-3 digits pick the observed class per slot) with 4 distinct ranks. */
function arrangementOf(idx: number, rng: () => number): Arrangement {
  const ranks = shuffledRanks(rng);
  const out = {} as Arrangement;
  let n = idx;
  SLOT_NAMES.forEach((s, k) => {
    const list = CHOICES[s];
    const c = list[n % 3] as Placement;
    n = Math.floor(n / 3);
    out[s] = { card: `${c.card.charAt(0)}-${ranks[k]}`, orientation: c.orientation };
  });
  return out;
}

const cardsOf = (a: Arrangement): string[] => SLOT_NAMES.map((s) => a[s].card).sort();
const hasRedSuit = (a: Arrangement): boolean => SLOT_NAMES.some((s) => 'HD'.includes(a[s].card.charAt(0)));

function expectedReflection(a: Arrangement, t: TransformName): string {
  if (!hasRedSuit(a)) return 'AMBIGUOUS';
  return MIRROR.includes(t) ? 'REFLECTED' : 'NOT_REFLECTED';
}

/** Marker patterns that can be placed at each slot (all 52 cards x orientations), for the oracle. */
const PLACEABLE: Record<SlotName, Set<number>> = { TL: new Set(), TR: new Set(), BL: new Set(), BR: new Set() };
for (const c of ALL_CARDS) {
  for (const o of [0, 180] as const) {
    for (const s of SLOT_NAMES) {
      const p = facingPattern(s, { card: c, orientation: o });
      if (p !== undefined) PLACEABLE[s].add(p);
    }
  }
}

/** For an image transform g, where does each slot of a 2x2 go? Found by transforming a real 2x2 raster. */
function slotMap(g: TransformName): Record<SlotName, SlotName> {
  const img: GrayImage = { width: 2, height: 2, data: Uint8Array.from([0, 1, 2, 3]) };
  const t = transformImage(img, g);
  const out = {} as Record<SlotName, SlotName>;
  t.data.forEach((v, pos) => {
    out[SLOT_NAMES[v] as SlotName] = SLOT_NAMES[pos] as SlotName;
  });
  return out;
}

const PROBE = 0x0a3c5e1;
function inverseName(g: TransformName): TransformName {
  const hit = TRANSFORM_NAMES.find((h) => applyTransform(h, applyTransform(g, PROBE)) === PROBE);
  if (!hit) throw new Error('no inverse');
  return hit;
}

/** Brute-force count of image transforms t for which the observation is a transformed valid arrangement. */
function oracle(obs: Record<SlotName, number>): { plain: number; mirrored: number } {
  let plain = 0;
  let mirrored = 0;
  for (const t of TRANSFORM_NAMES) {
    const forward = slotMap(t);
    const back = {} as Record<SlotName, SlotName>;
    for (const s of SLOT_NAMES) back[forward[s]] = s;
    const inv = inverseName(t);
    const ok = SLOT_NAMES.every((s) => PLACEABLE[back[s] as SlotName].has(applyTransform(inv, obs[s])));
    if (ok) (MIRROR.includes(t) ? mirrored++ : plain++);
  }
  return { plain, mirrored };
}

function ident(r: GroupDecodeResult) {
  if (r.kind !== 'IDENTIFIED') throw new Error(`expected IDENTIFIED, got ${r.kind}`);
  return r;
}

/** Returns null when the result is exactly right for arrangement `a` seen through image transform `t`. */
function problem(r: GroupDecodeResult, a: Arrangement, t: TransformName | null): string | null {
  if (r.kind !== 'IDENTIFIED') return `kind ${r.kind}`;
  const want = cardsOf(a);
  if ([...r.cards].sort().join() !== want.join()) return `cards ${r.cards.join()}`;
  if (r.hiddenSum !== referenceSum(want)) return `sum ${r.hiddenSum}`;
  const n = hasRedSuit(a) ? 2 : 4;
  if (r.interpretations.length !== n) return `interpretations ${r.interpretations.length}`;
  if (t !== null && r.reflection !== expectedReflection(a, t)) return `reflection ${r.reflection}`;
  return null;
}

const strip = (r: GroupDecodeResult): unknown => {
  if (r.kind !== 'IDENTIFIED') return r.kind;
  return { cards: r.cards, sum: r.hiddenSum, reflection: r.reflection, n: r.interpretations.length };
};

// ---------------------------------------------------------------------------------------------
// 1. Table
// ---------------------------------------------------------------------------------------------

describe('1. allowed-placement table', () => {
  const literal: Record<string, Partial<Record<SlotName, TransformName>>> = {
    H: { TL: 'R180', BR: 'I' },
    D: { TR: 'R180', BL: 'I' },
    C: { TL: 'Fh', TR: 'R180', BL: 'I', BR: 'Fv' },
    S: { TL: 'R180', TR: 'Fh', BL: 'Fv', BR: 'I' },
  };

  it('the derived table equals the literal design table (section 5)', () => {
    const derived: Record<string, Partial<Record<SlotName, TransformName>>> = {};
    for (const suit of ['H', 'D', 'C', 'S'] as const) {
      derived[suit] = {};
      for (const s of SLOTS) {
        const list = ALLOWED_PLACEMENTS[suit][s];
        expect(list.length).toBeLessThanOrEqual(1);
        if (list.length === 1) derived[suit]![s] = list[0]!.transform;
      }
    }
    expect(derived).toEqual(literal);
  });

  it('hearts and diamonds accept both orientations, clubs and spades exactly one', () => {
    for (const suit of ['H', 'D', 'C', 'S'] as const) {
      for (const s of SLOTS) {
        const list = ALLOWED_PLACEMENTS[suit][s];
        if (list.length === 0) continue;
        expect((list[0]!.orientations as number[]).length).toBe('HD'.includes(suit) ? 2 : 1);
      }
    }
  });

  it('equals what placedFragments produces (transform of the base pattern, orientation set)', () => {
    for (const card of ALL_CARDS) {
      const suit = card.charAt(0) as 'H' | 'D' | 'C' | 'S';
      const base = (placedFragments(card, 0)[FRAGMENT_BASE[suit]] as number);
      for (const s of SLOTS) {
        const found = new Map<TransformName, number[]>();
        for (const o of [0, 180] as const) {
          const p = placedFragments(card, o)[FACING[s] as Corner];
          if (p === undefined) continue;
          const ts = TRANSFORM_NAMES.filter((g) => applyTransform(g, base) === p);
          expect(ts.length).toBe(1);
          found.set(ts[0] as TransformName, [...(found.get(ts[0] as TransformName) ?? []), o]);
        }
        const list = ALLOWED_PLACEMENTS[suit][s];
        expect(list.map((e) => e.transform).sort()).toEqual([...found.keys()].sort());
        for (const e of list) expect([...e.orientations].sort()).toEqual((found.get(e.transform) ?? []).sort());
      }
    }
  });

  it('D4 helpers: composition and inverses agree with applyTransform; slot maps agree with a real raster; cell maps agree', () => {
    for (const a of TRANSFORM_NAMES) {
      expect(composeTransforms(a, inverseTransform(a))).toBe('I');
      expect(inverseTransform(a)).toBe(inverseName(a));
      for (const b of TRANSFORM_NAMES) {
        expect(applyTransform(composeTransforms(a, b), PROBE)).toBe(applyTransform(a, applyTransform(b, PROBE)));
      }
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) expect(mapCell(a, r, c, 4)).toEqual(CELL_MAPS[a](r, c));
    }
    // slot map from mapCell(.., 1) equals the raster-derived map
    const rc: Record<SlotName, [number, number]> = { TL: [0, 0], TR: [0, 1], BL: [1, 0], BR: [1, 1] };
    for (const g of TRANSFORM_NAMES) {
      const m = slotMap(g);
      for (const s of SLOT_NAMES) expect(mapCell(g, ...rc[s], 1)).toEqual(rc[m[s]]);
    }
  });
});

const FRAGMENT_BASE: Record<'H' | 'D' | 'C' | 'S', Corner> = { H: 'TL', D: 'TR', C: 'TR', S: 'TL' };

// ---------------------------------------------------------------------------------------------
// 2. Exhaustive 81 x 8
// ---------------------------------------------------------------------------------------------

describe('2. all 81 observed arrangements x 8 image transforms', () => {
  it('has 81 arrangements', () => {
    expect(SLOT_NAMES.map((s) => CHOICES[s].length)).toEqual([3, 3, 3, 3]);
  });

  it('648 images: IDENTIFIED, right cards/sum/interpretation count, reflection 260 / 260 / 128', () => {
    const counts = { NOT_REFLECTED: 0, REFLECTED: 0, AMBIGUOUS: 0, interp2: 0, interp4: 0 };
    const failures: string[] = [];
    let total = 0;
    for (let idx = 0; idx < 81; idx++) {
      const arr = arrangementOf(idx, mulberry32(SEED + idx));
      const base = composeGroup(arr, { modulePx: 4 }).image;
      for (const t of TRANSFORM_NAMES) {
        total++;
        const r = decodeGroup(transformImage(base, t));
        const bad = problem(r, arr, t);
        if (bad) {
          failures.push(`${idx}/${t}: ${bad}`);
          continue;
        }
        const id = ident(r);
        counts[id.reflection]++;
        counts[id.interpretations.length === 2 ? 'interp2' : 'interp4']++;
        // the interpretation with hypothesis t must describe the true arrangement
        const mine = id.interpretations.find((i) => i.hypothesis === t);
        if (!mine) {
          failures.push(`${idx}/${t}: no interpretation with hypothesis ${t}`);
          continue;
        }
        for (const s of SLOT_NAMES) {
          const got = mine.slots[s];
          const o = arr[s].orientation;
          const exp = 'HD'.includes(arr[s].card.charAt(0)) ? 'EITHER' : o;
          if (got.card !== arr[s].card || got.orientation !== exp) failures.push(`${idx}/${t}: slot ${s} ${JSON.stringify(got)}`);
        }
        // card set / sum identical across interpretations
        const sets = new Set(id.interpretations.map((i) => SLOT_NAMES.map((s) => i.slots[s].card).sort().join()));
        if (sets.size !== 1) failures.push(`${idx}/${t}: interpretations disagree on cards`);
        // never NOT_REFLECTED for a mirrored image, never REFLECTED for a plain one
        if (MIRROR.includes(t) && id.reflection === 'NOT_REFLECTED') failures.push(`${idx}/${t}: mirrored reported NOT_REFLECTED`);
        if (PLAIN.includes(t) && id.reflection === 'REFLECTED') failures.push(`${idx}/${t}: plain reported REFLECTED`);
        if (id.reflection === 'AMBIGUOUS' && hasRedSuit(arr)) failures.push(`${idx}/${t}: AMBIGUOUS with a red suit`);
        // cards identical across mirror / non-mirror (compared with idx-level base)
        const plainRes = ident(decodeGroup(base));
        if (id.cards.join() !== plainRes.cards.join()) failures.push(`${idx}/${t}: cards differ from unmirrored`);
      }
    }
    expect(failures).toEqual([]);
    expect(total).toBe(648);
    // Item 10: summary of the exhaustive run (seed list SEED + 0..80), for later milestones to compare.
    const summary = { images: total, ...counts };
    console.log(`decode-group exhaustive summary: ${JSON.stringify(summary)}`);
    expect(summary).toEqual({ images: 648, NOT_REFLECTED: 260, REFLECTED: 260, AMBIGUOUS: 128, interp2: 520, interp4: 128 });
  });

  it('the pattern-level oracle agrees with the decoder on every one of the 648 observations', () => {
    for (let idx = 0; idx < 81; idx++) {
      const arr = arrangementOf(idx, mulberry32(SEED + idx));
      for (const t of TRANSFORM_NAMES) {
        const r = ident(decodeGroup(transformImage(composeGroup(arr, { modulePx: 4 }).image, t)));
        const obs = {} as Record<SlotName, number>;
        for (const m of r.members) obs[m.slot] = m.marker.bits;
        // member bits are in the detector frame; the oracle needs the group frame
        for (const m of r.members) {
          let b = m.marker.bits;
          for (let k = 0; k < m.quarterTurns; k++) b = applyTransform('R90', b);
          obs[m.slot] = b;
        }
        const o = oracle(obs);
        expect(o.plain + o.mirrored).toBe(r.interpretations.length);
        expect(o.mirrored).toBe(r.interpretations.filter((i) => i.reflected).length);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 3. Boundary sums
// ---------------------------------------------------------------------------------------------

describe('3. boundary sums', () => {
  // slot -> suit pairs that are valid: TL {H,C,S}, TR {D,C,S}, BL {D,C,S}, BR {H,C,S}. Four distinct suits: TL H, TR D, BL C, BR S.
  const make = (rank: string): Arrangement => ({
    TL: { card: `H-${rank}`, orientation: 0 },
    TR: { card: `D-${rank}`, orientation: 0 },
    BL: { card: `C-${rank}`, orientation: CHOICES.BL.find((c) => c.card[0] === 'C')!.orientation },
    BR: { card: `S-${rank}`, orientation: CHOICES.BR.find((c) => c.card[0] === 'S')!.orientation },
  });

  it('{A-H, A-D, A-C, A-S} sums to 4 and {K-H, K-D, K-C, K-S} to 52 (all 8 image transforms, mirror-invariant ids)', () => {
    for (const [rank, sum] of [['A', 4], ['K', 52]] as const) {
      const arr = make(rank);
      const base = composeGroup(arr, { modulePx: 6 }).image;
      for (const t of TRANSFORM_NAMES) {
        const r = ident(decodeGroup(transformImage(base, t)));
        expect([...r.cards].sort()).toEqual(['C', 'D', 'H', 'S'].map((s) => `${s}-${rank}`));
        expect(r.hiddenSum).toBe(sum);
        expect(r.reflection).toBe(MIRROR.includes(t) ? 'REFLECTED' : 'NOT_REFLECTED');
        expect(r.interpretations.length).toBe(2);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 4/5. Camera rotation, scale, perspective, reflections
// ---------------------------------------------------------------------------------------------

const study = (n = 10): Arrangement[] => {
  const rng = mulberry32(SEED + 1000);
  return Array.from({ length: n }, () => arrangementOf(Math.floor(rng() * 81), rng));
};

describe('4. camera rotation', () => {
  it('every 5 degrees 0..355 and every degree through the +-45 canonical boundaries: same cards, sum, reflection', () => {
    const angles: number[] = [];
    for (let a = 0; a < 360; a += 5) angles.push(a);
    for (const lo of [40, 130, 220, 310]) for (let a = lo; a <= lo + 10; a++) if (a % 5 !== 0) angles.push(a);
    const failures: string[] = [];
    let total = 0;
    study().forEach((arr, gi) => {
      const base = composeGroup(arr, { modulePx: 6 }).image;
      for (const a of angles) {
        total++;
        const bad = problem(decodeGroup(rotateImage(base, a)), arr, 'I');
        if (bad) failures.push(`group ${gi} angle ${a}: ${bad}`);
      }
    });
    console.log(`rotation: ${total - failures.length}/${total} exact`);
    expect(failures).toEqual([]);
  });

  it('boundary proof: members straddling the canonical +-45 boundary (different quarter turns) still give the exact result', () => {
    // A slight perspective tilt makes the per-marker angles scatter by a few tenths of a degree, so that
    // some markers of one group land at about +45 and others at about -45 in the detector's canonical frame.
    // If the re-framing direction were wrong, those groups would be mis-decoded.
    const rng = mulberry32(SEED + 7000);
    let mixed = 0;
    let total = 0;
    const failures: string[] = [];
    for (let g = 0; g < 8; g++) {
      const arr = arrangementOf(Math.floor(rng() * 81), rng);
      const base = composeGroup(arr, { modulePx: 8, canvasModules: 40 }).image;
      const cx = base.width / 2;
      const cy = base.height / 2;
      for (const centre of [45, 135, 225, 315]) {
        for (let a = centre - 1; a <= centre + 1.0001; a += 0.1) {
          const H = compose(rotationMatrix(a, cx, cy), tiltMatrix({ cx, cy, tiltDeg: 8, axisDeg: g * 20, distancePx: 4 * base.width }));
          const r = decodeGroup(warpImage(base, H, base.width, base.height));
          total++;
          const bad = problem(r, arr, 'I');
          if (bad) failures.push(`group ${g} angle ${a.toFixed(2)}: ${bad}`);
          if (r.kind === 'IDENTIFIED' && new Set(r.members.map((m) => m.quarterTurns)).size > 1) mixed++;
        }
      }
    }
    console.log(`boundary sweep: ${total - failures.length}/${total} exact, ${mixed} images with mixed quarter turns`);
    expect(failures).toEqual([]);
    expect(mixed).toBeGreaterThan(0);
  });
  it('observed transforms are rotation-consistent: rotating by 90k and mirroring give the matching hypothesis', () => {
    const arr = arrangementOf(13, mulberry32(3));
    const base = composeGroup(arr, { modulePx: 6 }).image;
    for (const [a, h] of [[0, 'I'], [90, 'R90'], [180, 'R180'], [270, 'R270']] as const) {
      const id = ident(decodeGroup(rotateImage(base, a)));
      expect(id.interpretations.map((i) => i.hypothesis)).toContain(h);
    }
  });
});

describe('4b. scale and perspective (measured)', () => {
  it('module sizes 4, 6, 8, 10 px (crisp) are all exact', () => {
    let ok = 0;
    let total = 0;
    study().forEach((arr) => {
      for (const mp of [4, 6, 8, 10]) {
        total++;
        if (problem(decodeGroup(composeGroup(arr, { modulePx: mp }).image), arr, 'I') === null) ok++;
      }
    });
    console.log(`integer scale: ${ok}/${total}`);
    expect(ok).toBe(total);
  });

  it('non-integer scales 0.7..1.5 of an 8 px module render: rate recorded, no wrong IDENTIFIED', () => {
    let ok = 0;
    let total = 0;
    let wrong = 0;
    const scales = [0.7, 0.8, 0.9, 1.1, 1.2, 1.3, 1.4, 1.5];
    study().forEach((arr) => {
      const base = composeGroup(arr, { modulePx: 8, canvasModules: 40 }).image;
      for (const s of scales) {
        total++;
        const img = warpImage(base, scaleMatrix(s, s, base.width / 2, base.height / 2), base.width, base.height);
        const r = decodeGroup(img);
        if (problem(r, arr, 'I') === null) ok++;
        else if (r.kind === 'IDENTIFIED') wrong++;
      }
    });
    console.log(`fractional scale 0.7..1.5: ${ok}/${total} exact, ${wrong} wrong IDENTIFIED`);
    expect(wrong).toBe(0);
    expect(ok).toBe(total);
  });

  it('perspective tilt 10, 20, 30 degrees with random in-plane rotation: measured rates, no wrong IDENTIFIED', () => {
    // Measured (seed 20251112, 30 trials per tilt): default tolerance 1.0 module is exact at 10 and 20 degrees,
    // 15/30 at 30 degrees (all four markers are detected, the cluster test rejects the foreshortened spacing);
    // positionToleranceModules 1.25 makes tilt 30 exact (30/30).
    const run = (tilt: number, opts: DecodeGroupOptions) => {
      const rng = mulberry32(SEED + 2000 + tilt);
      let ok = 0;
      let total = 0;
      let wrong = 0;
      const kinds: Record<string, number> = {};
      study().forEach((arr) => {
        const base = composeGroup(arr, { modulePx: 8, canvasModules: 40 }).image;
        const cx = base.width / 2;
        const cy = base.height / 2;
        for (let k = 0; k < 3; k++) {
          total++;
          const H = compose(
            rotationMatrix(rng() * 360, cx, cy),
            tiltMatrix({ cx, cy, tiltDeg: tilt, axisDeg: rng() * 180, distancePx: 4 * base.width }),
          );
          const r = decodeGroup(warpImage(base, H, base.width, base.height), opts);
          kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
          if (problem(r, arr, 'I') === null) ok++;
          else if (r.kind === 'IDENTIFIED') wrong++;
        }
      });
      console.log(`perspective tilt ${tilt} ${JSON.stringify(opts)}: ${ok}/${total} exact, kinds ${JSON.stringify(kinds)}`);
      return { ok, total, wrong };
    };
    for (const tilt of [10, 20]) {
      const r = run(tilt, {});
      expect(r.wrong).toBe(0);
      expect(r.ok).toBe(r.total);
    }
    const t30 = run(30, {});
    expect(t30.wrong).toBe(0);
    expect(t30.ok).toBeLessThan(t30.total); // recorded limitation of the default tolerance
    const t30wide = run(30, { positionToleranceModules: 1.25 });
    expect(t30wide.wrong).toBe(0);
    expect(t30wide.ok).toBe(t30wide.total);
  });
});
describe('5. reflections', () => {
  it('horizontal / vertical mirrors with arbitrary rotations keep card ids; reflection and interpretation counts follow the suits', () => {
    const rng = mulberry32(SEED + 3000);
    const failures: string[] = [];
    let total = 0;
    study().forEach((arr, gi) => {
      const base = composeGroup(arr, { modulePx: 6 }).image;
      for (const m of ['Fh', 'Fv'] as const) {
        for (let k = 0; k < 6; k++) {
          total++;
          const angle = rng() * 360;
          const r = decodeGroup(rotateImage(transformImage(base, m), angle));
          const bad = problem(r, arr, 'Fh');
          if (bad) failures.push(`group ${gi} ${m} ${angle.toFixed(1)}: ${bad}`);
        }
      }
    });
    console.log(`mirrored + rotated: ${total - failures.length}/${total} exact`);
    expect(failures).toEqual([]);
  });

  it('property: random group, random D4 element, random angle gives the exact result (seed 20251112)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 80 }), fc.integer({ min: 0, max: 7 }), fc.double({ min: 0, max: 360, noNaN: true }), fc.integer({ min: 1, max: 1_000_000 }), (idx, ti, angle, rs) => {
        const arr = arrangementOf(idx, mulberry32(rs));
        const t = TRANSFORM_NAMES[ti] as TransformName;
        const img = rotateImage(transformImage(composeGroup(arr, { modulePx: 6 }).image, t), angle);
        expect(problem(decodeGroup(img), arr, t)).toBeNull();
      }),
      { seed: SEED, numRuns: 60 },
    );
  });
});

// ---------------------------------------------------------------------------------------------
// 6. Errors
// ---------------------------------------------------------------------------------------------

describe('6. errors from real pixels', () => {
  const arr: Arrangement = {
    TL: { card: 'H-5', orientation: 0 },
    TR: { card: 'D-9', orientation: 0 },
    BL: { card: 'C-J', orientation: 0 },
    BR: { card: 'S-2', orientation: 0 },
  };
  const pat = (s: SlotName): number => facingPattern(s, arr[s]) as number;

  it('the base arrangement is valid', () => {
    expect(problem(decodeGroup(composeGroup(arr, { modulePx: 6 }).image), arr, 'I')).toBeNull();
  });

  it('missing fragments: erase 1, 2 or 3 markers (every subset) gives INCOMPLETE_GROUP with detected 3, 2, 1', () => {
    for (let mask = 1; mask < 15; mask++) {
      const erased = SLOT_NAMES.filter((_, i) => (mask >> i) & 1);
      const override: Partial<Record<SlotName, null>> = {};
      for (const s of erased) override[s] = null;
      const r = decodeGroup(composeGroup(arr, { modulePx: 6, override }).image);
      expect(r).toEqual({ kind: 'INCOMPLETE_GROUP', detected: 4 - erased.length, markers: 4 - erased.length });
    }
  });

  it('erasing all four markers is NOT_DETECTED', () => {
    const r = decodeGroup(composeGroup(arr, { modulePx: 6, override: { TL: null, TR: null, BL: null, BR: null } }).image);
    expect(r.kind).toBe('NOT_DETECTED');
  });

  it('a heart in the TR slot has no inward fragment: only 3 markers, INCOMPLETE_GROUP detected 3', () => {
    const bad: Arrangement = { ...arr, TR: { card: 'H-5', orientation: 0 } };
    expect(facingPattern('TR', bad.TR)).toBeUndefined();
    expect(facingPattern('TR', { card: 'H-5', orientation: 180 })).toBeUndefined();
    const r = decodeGroup(composeGroup(bad, { modulePx: 6 }).image);
    expect(r).toEqual({ kind: 'INCOMPLETE_GROUP', detected: 3, markers: 3 });
  });

  it('duplicate card: the same pattern, or another transform of it, in two slots gives DUPLICATE_CARD', () => {
    for (const [other, p] of [
      ['BR', pat('TL')],
      ['TR', applyTransform('R90', pat('TL'))],
      ['BL', applyTransform('Dm', pat('TL'))],
    ] as const) {
      const r = decodeGroup(composeGroup(arr, { modulePx: 6, override: { [other]: p } }).image);
      expect(r.kind).toBe('DUPLICATE_CARD');
      if (r.kind === 'DUPLICATE_CARD') expect(r.card).toBe('H-5');
    }
  });

  it('invalid arrangements are never IDENTIFIED (oracle says no hypothesis)', () => {
    const heartInTR = placedFragments('H-7', 0).TL as number;
    const cases: Array<[string, Partial<Record<SlotName, number>>]> = [
      ['heart content in the TR slot', { TR: heartInTR }],
      ['90-degree rotated fragment', { TL: applyTransform('R90', pat('TL')) }],
      ['content not in the slot table (Dm of BL)', { BL: applyTransform('Dm', pat('BL')) }],
      ['content not in the slot table (Fv of BR)', { BR: applyTransform('Fv', pat('BR')) }],
      ['TL and BR swapped contents', { TL: pat('BR'), BR: pat('TL') }],
    ];
    for (const [name, override] of cases) {
      const obs = { TL: pat('TL'), TR: pat('TR'), BL: pat('BL'), BR: pat('BR'), ...override } as Record<SlotName, number>;
      const o = oracle(obs);
      const r = decodeGroup(composeGroup(arr, { modulePx: 6, override }).image);
      if (o.plain + o.mirrored === 0) {
        expect(r.kind, name).toBe('INVALID_ARRANGEMENT');
        if (r.kind === 'INVALID_ARRANGEMENT') expect(r.reason).toBe('NO_CONSISTENT_HYPOTHESIS');
      } else {
        // The oracle found a consistent image transform: the pixels really are another valid arrangement.
        expect(r.kind, name).toMatch(/IDENTIFIED|DUPLICATE_CARD/);
      }
    }
    // the first three are invalid per the oracle
    const hb = { TL: pat('TL'), TR: heartInTR, BL: pat('BL'), BR: pat('BR') } as Record<SlotName, number>;
    expect(oracle(hb)).toEqual({ plain: 0, mirrored: 0 });
    expect(oracle({ ...hb, TR: pat('TR'), TL: applyTransform('R90', pat('TL')) })).toEqual({ plain: 0, mirrored: 0 });
  });

  it('corrupted member: 2 or 3 flipped bits (radius 1) and a solid black marker give CORRUPTED_FRAGMENT', () => {
    for (const s of SLOT_NAMES) {
      for (const mask of [0b11, 0b10101, (1 << 24) | (1 << 12) | 1, 0x1ffffff]) {
        const r = decodeGroup(composeGroup(arr, { modulePx: 6, override: { [s]: (pat(s) ^ mask) >>> 0 } }).image);
        expect(r.kind).toBe('CORRUPTED_FRAGMENT');
        if (r.kind === 'CORRUPTED_FRAGMENT') expect(Object.keys(r.nearestDistances)).toEqual([s]);
      }
      const solid = decodeGroup(composeGroup(arr, { modulePx: 6, override: { [s]: 0x1ffffff } }).image);
      expect(solid.kind).toBe('CORRUPTED_FRAGMENT');
    }
  });

  it('one flipped bit is corrected at radius 1 (still IDENTIFIED)', () => {
    const r = decodeGroup(composeGroup(arr, { modulePx: 6, override: { TL: (pat('TL') ^ (1 << 7)) >>> 0 } }).image);
    expect(problem(r, arr, 'I')).toBeNull();
  });

  it('blank and noise images are NOT_DETECTED', () => {
    expect(decodeGroup(blankImage(200, 200, 255)).kind).toBe('NOT_DETECTED');
    expect(decodeGroup(blankImage(200, 200, 0)).kind).toBe('NOT_DETECTED');
    const rng = mulberry32(SEED);
    for (let i = 0; i < 5; i++) expect(decodeGroup(uniformNoiseImage(200, 200, rng)).kind).toBe('NOT_DETECTED');
  });

  it('an image with only a broken-border marker passes INVALID_MARKER through', () => {
    const m = renderMarker(pat('TL'), 8);
    fillRect(m, 3 * 8, 1 * 8, 8, 8, 255); // one non-corner border cell white
    const c = blankImage(200, 200, 255);
    pasteImage(c, m, 60, 60);
    const r = decodeGroup(c);
    expect(r.kind).toBe('INVALID_MARKER');
  });

  it('a single isolated valid marker is INCOMPLETE_GROUP with detected 1', () => {
    const c = blankImage(200, 200, 255);
    pasteImage(c, renderMarker(pat('TL'), 8), 60, 60);
    expect(decodeGroup(c)).toEqual({ kind: 'INCOMPLETE_GROUP', detected: 1, markers: 1 });
  });
});

// ---------------------------------------------------------------------------------------------
// 7. Distractors
// ---------------------------------------------------------------------------------------------

describe('7. unrelated markers and distractors', () => {
  const MP = 4;
  const rng = mulberry32(SEED + 4000);

  it('2x2 flat card patches: the centre vertex is decoded, outward fragments are DISTRACTOR_FRAGMENT', () => {
    for (let idx = 0; idx < 81; idx += 4) {
      const arr = arrangementOf(idx, mulberry32(SEED + 5000 + idx));
      const { image } = flatPatch([[arr.TL, arr.TR], [arr.BL, arr.BR]], MP, { w: 96, h: 128 }, [0, 0]);
      const r = decodeGroup(image);
      expect(problem(r, arr, 'I'), `arrangement ${idx}`).toBeNull();
      const id = ident(r);
      expect(id.alternativeClusters).toBe(0);
      expect(id.others.length).toBe(4);
      for (const o of id.others) {
        expect(o.classification).toBe('DISTRACTOR_FRAGMENT');
        expect(o.outcome.status).toBe('IDENTIFIED');
        if (o.outcome.status === 'IDENTIFIED') expect(cardsOf(arr)).toContain(o.outcome.card);
      }
      // a member is never listed as other
      const memberKeys = new Set(id.members.map((m) => `${m.marker.center.x},${m.marker.center.y}`));
      for (const o of id.others) expect(memberKeys.has(`${o.marker.center.x},${o.marker.center.y}`)).toBe(false);
    }
  });

  it('2x2 patch rotated by 37 degrees and mirrored still decodes the centre group', () => {
    const arr = arrangementOf(30, mulberry32(11));
    const { image } = flatPatch([[arr.TL, arr.TR], [arr.BL, arr.BR]], MP, { w: 160, h: 160 }, [0, 0]);
    const r = decodeGroup(rotateImage(transformImage(image, 'Fv'), 37));
    expect(problem(r, arr, 'Fv')).toBeNull();
  });

  /** Random 3x3 grid of distinct cards where the focus vertex and at least one other vertex are complete. */
  function find3x3(focus: [number, number], minComplete: number) {
    for (let tries = 0; tries < 20000; tries++) {
      const r = mulberry32(SEED + 6000 + tries * 7 + focus[0] * 3 + focus[1]);
      const cards = shuffledCards(r).slice(0, 9);
      const grid: Placement[][] = [0, 1, 2].map((i) => [0, 1, 2].map((j) => ({ card: cards[i * 3 + j] as string, orientation: r() < 0.5 ? 0 : 180 })));
      const complete = completeVertices(grid);
      if (complete.some((v) => v[0] === focus[0] && v[1] === focus[1]) && complete.length >= minComplete) return { grid, complete };
    }
    throw new Error('no grid found');
  }

  const shuffledCards = (r: () => number): string[] => {
    const a = [...ALL_CARDS];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j] as string, a[i] as string];
    }
    return a;
  };

  /** Independent: vertex (i,j) is complete iff all four facing corners hold a fragment. */
  function completeVertices(grid: Placement[][]): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const ok =
          facingPattern('TL', grid[i]![j]!) !== undefined &&
          facingPattern('TR', grid[i]![j + 1]!) !== undefined &&
          facingPattern('BL', grid[i + 1]![j]!) !== undefined &&
          facingPattern('BR', grid[i + 1]![j + 1]!) !== undefined;
        if (ok) out.push([i, j]);
      }
    }
    return out;
  }

  it('3x3 patches with several complete vertices: the one nearest the image centre wins, the others are counted', () => {
    for (const focus of [[0, 0], [0, 1], [1, 0], [1, 1]] as Array<[number, number]>) {
      const { grid, complete } = find3x3(focus, 2);
      const { image } = flatPatch(grid, MP, { w: 176, h: 240 }, focus);
      const r = ident(decodeGroup(image));
      const i = focus[0];
      const j = focus[1];
      const want = [grid[i]![j]!, grid[i]![j + 1]!, grid[i + 1]![j]!, grid[i + 1]![j + 1]!].map((p) => p.card).sort();
      expect([...r.cards].sort()).toEqual(want);
      expect(r.hiddenSum).toBe(referenceSum(want));
      expect(r.alternativeClusters).toBe(complete.length - 1);
      expect(r.others.length).toBeGreaterThan(0);
      expect(r.others.every((o) => o.classification === 'DISTRACTOR_FRAGMENT')).toBe(true);
    }
  });

  it('valid-pattern markers scattered far away never change the result', () => {
    const arr = arrangementOf(55, mulberry32(5));
    const base = composeGroup(arr, { modulePx: 6, canvasModules: 32 });
    const baseRes = strip(decodeGroup(base.image));
    const S = 96 * 6;
    const canvas = blankImage(S, S, 255);
    pasteImage(canvas, base.image, (S - base.image.width) / 2, (S - base.image.height) / 2);
    const spots = [[2, 2], [40, 2], [78, 2], [2, 40], [85, 45], [2, 78], [40, 85], [80, 82]];
    let k = 0;
    for (const [mx, my] of spots) {
      const pat = k % 2 === 0 ? (placedFragments(ALL_CARDS[k * 5] as string, 0).TL ?? placedFragments(ALL_CARDS[k * 5] as string, 0).TR) : Math.floor(rng() * 2 ** 25);
      pasteImage(canvas, renderMarker(pat as number, 6), mx! * 6, my! * 6);
      k++;
    }
    const r = ident(decodeGroup(canvas));
    expect(strip(r)).toEqual(baseRes);
    expect(r.others.length).toBe(spots.length);
    expect(r.alternativeClusters).toBe(0);
    expect(r.others.some((o) => o.classification === 'DISTRACTOR_FRAGMENT')).toBe(true);
  });

  it('fragments at other vertices with only 2-3 markers never form a group', () => {
    const a1 = arrangementOf(20, mulberry32(1));
    const a2 = arrangementOf(61, mulberry32(2));
    const g1 = composeGroup(a1, { modulePx: 6, override: { BL: null } }).image; // 3 markers
    const g2 = composeGroup(a2, { modulePx: 6, override: { TL: null, BR: null } }).image; // 2 markers
    const canvas = blankImage(g1.width * 2 + 120, g1.height, 255);
    pasteImage(canvas, g1, 0, 0);
    pasteImage(canvas, g2, g1.width + 120, 0);
    expect(decodeGroup(canvas)).toEqual({ kind: 'INCOMPLETE_GROUP', detected: 3, markers: 5 });
  });
});

// ---------------------------------------------------------------------------------------------
// 8. Spurious markers
// ---------------------------------------------------------------------------------------------

describe('8. spurious markers (the documented 0x5AC54 case)', () => {
  const MP = 10;
  const arr: Arrangement = {
    TL: { card: 'H-5', orientation: 0 },
    TR: { card: 'D-9', orientation: 0 },
    BL: { card: 'C-J', orientation: 0 },
    BR: { card: 'S-2', orientation: 0 },
  };
  const BAD = 0x5ac54;

  it('precondition: the detector returns the real marker plus a small 0x1FFFFFF blob', () => {
    const c = blankImage(120, 120, 255);
    pasteImage(c, renderMarker(BAD, MP), 17, 13);
    const d = detectMarkers2(c);
    expect(d.map((m) => m.bits).sort()).toEqual([0x1ffffff, BAD].sort());
    const blob = d.find((m) => m.bits === 0x1ffffff)!;
    expect(blob.sizePx).toBeLessThan(20);
  });

  it('(a) as one member of an otherwise valid group: CORRUPTED_FRAGMENT, blob is not a member', () => {
    for (const s of SLOT_NAMES) {
      const { image, centers } = composeGroup(arr, { modulePx: MP, override: { [s]: BAD } });
      const r = decodeGroup(image);
      expect(r.kind, s).toBe('CORRUPTED_FRAGMENT');
      if (r.kind !== 'CORRUPTED_FRAGMENT') continue;
      expect(r.members.length).toBe(4);
      for (const m of r.members) expect(m.marker.sizePx).toBeGreaterThan(60);
      const bad = r.members.find((m) => m.slot === s)!;
      expect(Math.hypot(bad.marker.center.x - centers[s].x, bad.marker.center.y - centers[s].y)).toBeLessThan(2);
      expect(r.others.every((o) => o.classification === 'SPURIOUS_CANDIDATE')).toBe(true);
      expect(r.others.length).toBe(1);
      expect(r.others[0]!.marker.sizePx).toBeLessThan(20);
    }
  });

  it('(b) far from a valid group: the group is still IDENTIFIED; marker and blob are SPURIOUS_CANDIDATE', () => {
    const g = composeGroup(arr, { modulePx: MP, canvasModules: 32 });
    const S = 80 * MP;
    const canvas = blankImage(S, S, 255);
    pasteImage(canvas, g.image, (S - g.image.width) / 2, (S - g.image.height) / 2);
    pasteImage(canvas, renderMarker(BAD, MP), 17, 13);
    const r = ident(decodeGroup(canvas));
    expect(problem(r, arr, 'I')).toBeNull();
    expect(r.others.length).toBe(2);
    expect(r.others.every((o) => o.classification === 'SPURIOUS_CANDIDATE')).toBe(true);
  });

  it('(c) a small solid blob in the Central_Void region changes nothing', () => {
    const g = composeGroup(arr, { modulePx: MP });
    const base = strip(decodeGroup(g.image));
    const copy = (): GrayImage => ({ width: g.image.width, height: g.image.height, data: Uint8Array.from(g.image.data) });
    const check = (img: GrayImage, name: string): void => {
      const r = decodeGroup(img);
      expect(strip(r), name).toEqual(base);
      if (r.kind === 'IDENTIFIED') {
        expect(r.others.every((o) => o.classification === 'SPURIOUS_CANDIDATE')).toBe(true);
        for (const m of r.members) expect(m.marker.sizePx).toBeGreaterThan(60);
      }
    };
    // squares up to +-1 module and discs up to radius 2 modules (the void extends about 2 modules along the seams)
    for (const half of [3, 5, 10]) {
      const img = copy();
      fillRect(img, g.vertex.x - half, g.vertex.y - half, 2 * half, 2 * half, 0);
      check(img, 'square ' + 2 * half + 'px');
    }
    for (const rad of [5, 10, 15, 20]) {
      const img = copy();
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          if (Math.hypot(x + 0.5 - g.vertex.x, y + 0.5 - g.vertex.y) <= rad) img.data[y * img.width + x] = 0;
        }
      }
      check(img, 'disc radius ' + rad + 'px');
    }
  });

  it('(c2) characterisation: a 4 x 4 module black square at the vertex touches all four marker corners and merges them (INVALID_MARKER, never IDENTIFIED)', () => {
    const g = composeGroup(arr, { modulePx: MP });
    const img: GrayImage = { width: g.image.width, height: g.image.height, data: Uint8Array.from(g.image.data) };
    fillRect(img, g.vertex.x - 2 * MP, g.vertex.y - 2 * MP, 4 * MP, 4 * MP, 0);
    expect(decodeGroup(img).kind).toBe('INVALID_MARKER');
  });
});
function detectMarkers2(img: GrayImage) {
  const r = detectMarkers(img);
  return r.kind === 'DETECTED' ? r.markers : [];
}

// ---------------------------------------------------------------------------------------------
// 9. Safety
// ---------------------------------------------------------------------------------------------

describe('9. safety and API', () => {
  const arr = arrangementOf(44, mulberry32(9));
  const img = composeGroup(arr, { modulePx: 6 }).image;

  it('static scan: only allowed imports, no board / expected / score / game identifiers', () => {
    const src = readFileSync(fileURLToPath(new URL('./decode-group.ts', import.meta.url)), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
    const mods = [...code.matchAll(/(?:^|\n)\s*import\s+(?:type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect([...new Set(mods)].sort()).toEqual(['./decode-fragment', './detect', './fragments', './render', './transforms']);
    expect(code).not.toMatch(/\brequire\s*\(|\bimport\s*\(/);
    expect(code).not.toMatch(/\b\w*(board|expected|score|game|hand|reference|mismatch)\w*\b/i);
    expect(decodeGroup.length).toBeLessThanOrEqual(2);
  });

  it('type level: only an image and optional tuning options', () => {
    expectTypeOf(decodeGroup).parameters.toEqualTypeOf<[GrayImage, DecodeGroupOptions?]>();
    expectTypeOf(decodeGroup).returns.toEqualTypeOf<GroupDecodeResult>();
  });

  it('is deterministic and does not mutate a frozen input', () => {
    const copy = Uint8Array.from(img.data);
    const frozen = Object.freeze({ width: img.width, height: img.height, data: img.data });
    const a = decodeGroup(frozen, Object.freeze({ detect: Object.freeze({}) }));
    const b = decodeGroup(frozen);
    expect(a).toEqual(b);
    expect(Array.from(img.data)).toEqual(Array.from(copy));
  });

  it('radius 2 works; invalid radius throws RangeError (also on a blank image)', () => {
    expect(problem(decodeGroup(img, { radius: 2 }), arr, 'I')).toBeNull();
    for (const bad of [0, 3, 1.5, NaN]) {
      expect(() => decodeGroup(img, { radius: bad as never })).toThrow(RangeError);
      expect(() => decodeGroup(blankImage(10, 10), { radius: bad as never })).toThrow(RangeError);
    }
    expect(() => decodeGroup(img, { centerOffsetModules: -1 })).toThrow(RangeError);
    expect(() => decodeGroup(img, { sizeRatioRange: [2, 1] })).toThrow(RangeError);
  });

  it('tiny, blank and odd images do not throw', () => {
    for (const [w, h] of [[0, 0], [1, 1], [2, 2], [3, 3], [5, 40], [40, 5]] as Array<[number, number]>) {
      expect(decodeGroup({ width: w, height: h, data: new Uint8Array(w * h) }).kind).toBe('NOT_DETECTED');
    }
    expect(decodeGroup(blankImage(64, 64, 128)).kind).toBe('NOT_DETECTED');
  });

  it('malformed GrayImage throws RangeError', () => {
    expect(() => decodeGroup({ width: 4, height: 4, data: new Uint8Array(3) })).toThrow(RangeError);
    expect(() => decodeGroup({ width: -1, height: 4, data: new Uint8Array(0) })).toThrow(RangeError);
    expect(() => decodeGroup({ width: 1.5, height: 2, data: new Uint8Array(3) })).toThrow(RangeError);
    expect(() => decodeGroup(null as never)).toThrow(RangeError);
  });

  it('result carries no expected-value or reference fields', () => {
    const r = ident(decodeGroup(img));
    expect(Object.keys(r)).not.toContain('referenceMismatch');
    expect(JSON.stringify(Object.keys(r))).not.toMatch(/expected|reference|mismatch/i);
    expect(r.members.length).toBe(4);
    expect(FOOTPRINT_MOD).toBe(9);
  });
});
