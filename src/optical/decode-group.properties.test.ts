/**
 * Task 5.3: property-level tests that were missing from decode-group.test.ts and reference-check.test.ts
 * (Properties 20, 23, 25, 26). Everything here uses real rendered pixels; no mocks. Synthetic images only,
 * so none of this is real-camera validation.
 *
 * Reproducibility: every random case is generated from ONE integer seed (`makeCase(seed, mode)`), and every
 * failure message starts with `reproTag(case)` = seed + arrangement + image transform + camera angle.
 */
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { decodeGroup, type DecodeGroupOptions, type GroupDecodeResult } from './decode-group';
import { compareWithReference } from './reference-check';
import { mulberry32 } from './prng';
import type { GrayImage } from './render';
import { TRANSFORM_NAMES, type TransformName } from './transforms';
import {
  RANKS,
  SLOT_NAMES,
  composeGroup,
  rotateImage,
  slotChoices,
  transformImage,
  type Arrangement,
  type Placement,
} from './testing/group-compose';

vi.setConfig({ testTimeout: 600_000 });

const BASE_SEED = 20251126;
const MODULE_PX = 6;
const CHOICES = slotChoices();

// ---------------------------------------------------------------------------------------------
// Independent oracles (no import from decode-group's tables)
// ---------------------------------------------------------------------------------------------

/** Card_Value from the rank's position in A,2..10,J,Q,K: A=1 .. K=13. Independent of any module table. */
const rankValue = (card: string): number => RANKS.indexOf(card.split('-')[1] as (typeof RANKS)[number]) + 1;
const sumOf = (cards: readonly string[]): number => cards.reduce((t, c) => t + rankValue(c), 0);

/**
 * Determinant of the linear part of an image transform, measured on a real 3x3 raster: where do the unit
 * steps "one column right" and "one row down" go relative to the centre pixel? det < 0 means reflection.
 */
function determinant(g: TransformName): number {
  const img: GrayImage = { width: 3, height: 3, data: Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8]) };
  const out = transformImage(img, g);
  const at = (v: number): [number, number] => {
    const i = Array.from(out.data).indexOf(v);
    return [(i % 3) - 1, Math.floor(i / 3) - 1]; // [dx, dy] from the centre
  };
  const [ax, ay] = at(5); // was (+1, 0)
  const [bx, by] = at(7); // was (0, +1)
  return ax * by - bx * ay;
}
const isReflection = (g: TransformName): boolean => determinant(g) < 0;

/** h composed with a half turn, written out by hand and proven against real rasters in a test below. */
const PARTNER: Record<TransformName, TransformName> = {
  I: 'R180', R180: 'I', R90: 'R270', R270: 'R90', Fh: 'Fv', Fv: 'Fh', Dm: 'Da', Da: 'Dm',
};

// ---------------------------------------------------------------------------------------------
// Seeded case generation
// ---------------------------------------------------------------------------------------------

type Mode = 'any' | 'red' | 'cs';
interface Case {
  seed: number;
  mode: Mode;
  arr: Arrangement;
  t: TransformName;
  angle: number;
}

const cardsOf = (a: Arrangement): string[] => SLOT_NAMES.map((s) => a[s].card).sort();
const hasRed = (a: Arrangement): boolean => SLOT_NAMES.some((s) => 'HD'.includes(a[s].card.charAt(0)));

function genArrangement(rng: () => number, mode: Mode): Arrangement {
  for (;;) {
    const arr = {} as Arrangement;
    for (const s of SLOT_NAMES) {
      const pool: Placement[] = (CHOICES[s] as Placement[]).filter((c) => mode !== 'cs' || 'CS'.includes(c.card.charAt(0)));
      const pick = pool[Math.floor(rng() * pool.length)] as Placement;
      const rank = RANKS[Math.floor(rng() * 13)] as string;
      arr[s] = { card: `${pick.card.charAt(0)}-${rank}`, orientation: pick.orientation };
    }
    const ids = cardsOf(arr);
    if (new Set(ids).size !== 4) continue; // four DISTINCT cards of the real 52-card deck
    if (mode === 'red' && !hasRed(arr)) continue;
    return arr;
  }
}

/** The whole case, including transform and angle, is a function of (seed, mode) (and optionally a forced transform). */
function makeCase(seed: number, mode: Mode, forceT?: TransformName): Case {
  const rng = mulberry32(seed);
  const arr = genArrangement(rng, mode);
  const t = (TRANSFORM_NAMES[Math.floor(rng() * 8)] as TransformName);
  const angle = rng() * 360;
  return { seed, mode, arr, t: forceT ?? t, angle };
}

const arrText = (a: Arrangement): string => SLOT_NAMES.map((s) => `${s}:${a[s].card}@${a[s].orientation}`).join(' ');
const reproTag = (c: Case): string =>
  `[seed=${c.seed} mode=${c.mode} transform=${c.t} angle=${c.angle.toFixed(6)} arrangement=${arrText(c.arr)}]`;

function renderCase(c: Case): GrayImage {
  return rotateImage(transformImage(composeGroup(c.arr, { modulePx: MODULE_PX }).image, c.t), c.angle);
}

interface Want {
  cards: string[];
  hiddenSum: number;
  reflection: 'NOT_REFLECTED' | 'REFLECTED' | 'AMBIGUOUS';
  interpretations: number;
}
function wantOf(c: Case): Want {
  const cards = cardsOf(c.arr);
  return {
    cards,
    hiddenSum: sumOf(cards),
    reflection: hasRed(c.arr) ? (isReflection(c.t) ? 'REFLECTED' : 'NOT_REFLECTED') : 'AMBIGUOUS',
    interpretations: hasRed(c.arr) ? 2 : 4,
  };
}

/** Every deviation from `want`, each prefixed with the reproduction tag. Empty array = case passes. */
function check(c: Case, r: GroupDecodeResult, want: Want = wantOf(c)): string[] {
  const tag = reproTag(c);
  if (r.kind !== 'IDENTIFIED') return [`${tag} kind ${r.kind}`];
  const out: string[] = [];
  if ([...r.cards].sort().join() !== want.cards.join()) out.push(`${tag} cards ${r.cards.join()} != ${want.cards.join()}`);
  if (r.hiddenSum !== want.hiddenSum) out.push(`${tag} hiddenSum ${r.hiddenSum} != ${want.hiddenSum}`);
  if (r.reflection !== want.reflection) out.push(`${tag} reflection ${r.reflection} != ${want.reflection}`);
  if (r.interpretations.length !== want.interpretations) out.push(`${tag} interpretations ${r.interpretations.length} != ${want.interpretations}`);
  return out;
}

function ident(r: GroupDecodeResult, c: Case) {
  if (r.kind !== 'IDENTIFIED') throw new Error(`${reproTag(c)} expected IDENTIFIED, got ${r.kind}`);
  return r;
}

// ---------------------------------------------------------------------------------------------
// Oracle self-checks
// ---------------------------------------------------------------------------------------------

describe('oracle self-checks', () => {
  it('determinant marks exactly Fh, Fv, Dm, Da as reflections', () => {
    expect(TRANSFORM_NAMES.filter(isReflection).sort()).toEqual(['Da', 'Dm', 'Fh', 'Fv']);
  });

  it('PARTNER[h] is "h then a half turn", proven on a real raster', () => {
    const img: GrayImage = { width: 3, height: 2, data: Uint8Array.from([1, 2, 3, 4, 5, 6]) };
    for (const h of TRANSFORM_NAMES) {
      expect(Array.from(transformImage(transformImage(img, h), 'R180').data)).toEqual(Array.from(transformImage(img, PARTNER[h]).data));
    }
  });

  it('the independent rank table gives A=1, 10=10, K=13 and the two boundary sums', () => {
    expect(['H-A', 'D-10', 'C-J', 'S-K'].map(rankValue)).toEqual([1, 10, 11, 13]);
    expect(sumOf(['H-A', 'D-A', 'C-A', 'S-A'])).toBe(4);
    expect(sumOf(['H-K', 'D-K', 'C-K', 'S-K'])).toBe(52);
  });

  it('generator: 4 distinct deck cards, mode constraints hold, same seed gives the same case', () => {
    for (let i = 0; i < 60; i++) {
      for (const mode of ['any', 'red', 'cs'] as const) {
        const c = makeCase(BASE_SEED + i, mode);
        expect(new Set(cardsOf(c.arr)).size).toBe(4);
        if (mode === 'red') expect(hasRed(c.arr)).toBe(true);
        if (mode === 'cs') expect(hasRed(c.arr)).toBe(false);
        expect(makeCase(BASE_SEED + i, mode)).toEqual(c);
      }
    }
  });
});

/**
 * The group frame is only defined modulo a quarter turn, so a camera rotation of ngle degrees changes the
 * reported hypothesis by q = round(angle / 90) quarter turns: h = (R90^q after t), named by matching rasters.
 * Within 3 degrees of a +-45 boundary either neighbouring q is accepted.
 */
function expectedHypotheses(c: Case): TransformName[] {
  const probe: GrayImage = { width: 3, height: 3, data: Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8]) };
  const nameOf = (img: GrayImage): TransformName =>
    TRANSFORM_NAMES.find((g) => Array.from(transformImage(probe, g).data).join() === Array.from(img.data).join()) as TransformName;
  const out = new Set<TransformName>();
  for (const q of new Set([Math.round((c.angle - 3) / 90), Math.round((c.angle + 3) / 90)])) {
    let img = transformImage(probe, c.t);
    for (let k = 0; k < ((q % 4) + 4) % 4; k++) img = transformImage(img, 'R90');
    out.add(nameOf(img));
  }
  return [...out];
}

// ---------------------------------------------------------------------------------------------
// P-A  Property 23: interpretation structure
// ---------------------------------------------------------------------------------------------

describe('P-A. Property 23: interpretation structure (hypotheses h and h∘R180)', () => {
  const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && [...a].sort().join() === [...b].sort().join();

  it('groups with a heart or diamond: exactly the hypotheses {t, t∘R180}, one reflected value, same card set', () => {
    const failures: string[] = [];
    for (let i = 0; i < 160; i++) {
      const c = makeCase(BASE_SEED + 1000 + i, 'red');
      const id = ident(decodeGroup(renderCase(c)), c);
      const hyps = id.interpretations.map((x) => x.hypothesis);
      if (!expectedHypotheses(c).some((h) => sameSet(hyps, [h, PARTNER[h]]))) failures.push(`${reproTag(c)} hypotheses ${hyps.join()}`);
      const refl = new Set(id.interpretations.map((x) => x.reflected));
      if (refl.size !== 1 || !refl.has(isReflection(c.t))) failures.push(`${reproTag(c)} reflected values ${[...refl].join()}`);
      for (const x of id.interpretations) {
        const set = SLOT_NAMES.map((s) => x.slots[s].card).sort();
        if (set.join() !== cardsOf(c.arr).join()) failures.push(`${reproTag(c)} interpretation ${x.hypothesis} cards ${set.join()}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('clubs/spades-only groups: 4 interpretations = 2 non-reflected + 2 reflected, each pair {h, h∘R180}, one contains t', () => {
    const failures: string[] = [];
    for (let i = 0; i < 80; i++) {
      const c = makeCase(BASE_SEED + 2000 + i, 'cs');
      const id = ident(decodeGroup(renderCase(c)), c);
      const plain = id.interpretations.filter((x) => !x.reflected).map((x) => x.hypothesis);
      const mirrored = id.interpretations.filter((x) => x.reflected).map((x) => x.hypothesis);
      if (plain.length !== 2 || mirrored.length !== 2) failures.push(`${reproTag(c)} split ${plain.length}+${mirrored.length}`);
      for (const pair of [plain, mirrored]) {
        if (pair.length === 2 && PARTNER[pair[0] as TransformName] !== pair[1]) failures.push(`${reproTag(c)} pair ${pair.join()} is not {h, h∘R180}`);
      }
      for (const x of id.interpretations) {
        if (x.reflected !== isReflection(x.hypothesis)) failures.push(`${reproTag(c)} hypothesis ${x.hypothesis} reflected=${x.reflected}`);
      }
      if (!expectedHypotheses(c).some((h) => plain.includes(h) || mirrored.includes(h))) failures.push(`${reproTag(c)} true transform missing`);
    }
    expect(failures).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// P-B  Property 26: per transform, reflection derived by determinant
// ---------------------------------------------------------------------------------------------

describe('P-B. Property 26: reflection per image transform (determinant oracle)', () => {
  for (const h of TRANSFORM_NAMES) {
    it(`transform ${h} (${isReflection(h) ? 'reflection' : 'rotation'}): red groups ${isReflection(h) ? 'REFLECTED' : 'NOT_REFLECTED'}, clubs/spades-only AMBIGUOUS`, () => {
      const failures: string[] = [];
      const jobs: Array<[number, Mode]> = [];
      for (let i = 0; i < 6; i++) jobs.push([BASE_SEED + 3000 + i, 'red']);
      for (let i = 0; i < 3; i++) jobs.push([BASE_SEED + 3100 + i, 'cs']);
      for (const [seed, mode] of jobs) {
        const c = makeCase(seed, mode, h);
        const r = ident(decodeGroup(renderCase(c)), c);
        const want: Want['reflection'] = mode === 'cs' ? 'AMBIGUOUS' : isReflection(h) ? 'REFLECTED' : 'NOT_REFLECTED';
        if (r.reflection !== want) failures.push(`${reproTag(c)} reflection ${r.reflection} != ${want}`);
        // The two forbidden outcomes, stated separately.
        if (isReflection(h) && r.reflection === 'NOT_REFLECTED') failures.push(`${reproTag(c)} reflected image reported NOT_REFLECTED`);
        if (mode === 'cs' && r.reflection !== 'AMBIGUOUS') failures.push(`${reproTag(c)} ambiguous group reported ${r.reflection}`);
      }
      expect(failures).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// P-C  Property 20 + 23: deck-wide seeded random groups
// ---------------------------------------------------------------------------------------------

describe('P-C. deck-wide seeded random groups (Property 20 sum, Property 23 identification)', () => {
  it('300 random groups: IDENTIFIED, card set, independent rank-table sum in [4, 52], reflection, interpretation count', () => {
    const failures: string[] = [];
    const seen = { sums: new Set<number>(), cards: new Set<string>(), modes: { red: 0, cs: 0 } };
    const N = 300;
    for (let i = 0; i < N; i++) {
      const c = makeCase(BASE_SEED + 5000 + i, 'any');
      const r = decodeGroup(renderCase(c));
      failures.push(...check(c, r));
      if (r.kind === 'IDENTIFIED') {
        const indep = sumOf(cardsOf(c.arr));
        if (indep < 4 || indep > 52) failures.push(`${reproTag(c)} independent sum ${indep} outside [4, 52]`);
        if (r.hiddenSum < 4 || r.hiddenSum > 52) failures.push(`${reproTag(c)} decoded sum ${r.hiddenSum} outside [4, 52]`);
        seen.sums.add(r.hiddenSum);
        r.cards.forEach((x) => seen.cards.add(x));
      }
      seen.modes[hasRed(c.arr) ? 'red' : 'cs']++;
    }
    expect(failures).toEqual([]);
    // The sample is not degenerate: it contains both group kinds and many distinct sums and cards.
    expect(seen.modes.red).toBeGreaterThan(30);
    expect(seen.modes.cs).toBeGreaterThan(5);
    expect(seen.sums.size).toBeGreaterThan(20);
    expect(seen.cards.size).toBeGreaterThan(30);
  });
});

// ---------------------------------------------------------------------------------------------
// P-D  Property 25: the decoder has no board parameter (type level)
// ---------------------------------------------------------------------------------------------

describe('P-D. Property 25: no board-state input (type level)', () => {
  it('parameters are exactly [image, optional tuning options]; neither type names a board, expected value or reference', () => {
    expectTypeOf(decodeGroup).parameters.toEqualTypeOf<[GrayImage, DecodeGroupOptions?]>();
    expectTypeOf<keyof GrayImage>().toEqualTypeOf<'width' | 'height' | 'data'>();
    type Suspicious = Extract<
      Lowercase<keyof DecodeGroupOptions & string>,
      `${string}board${string}` | `${string}expected${string}` | `${string}reference${string}` | `${string}state${string}` | `${string}hand${string}` | `${string}cards${string}`
    >;
    expectTypeOf<Suspicious>().toBeNever();
    expectTypeOf<Parameters<typeof decodeGroup>['length']>().toEqualTypeOf<1 | 2>();
  });

  it('the compiler rejects a board object as option or as an extra argument', () => {
    const probe = (img: GrayImage): void => {
      // @ts-expect-error a board record is not a decoder option
      decodeGroup(img, { board: ['H-A', 'D-A', 'C-A', 'S-A'] });
      // @ts-expect-error expected cards are not a decoder option
      decodeGroup(img, { expectedCards: ['H-A', 'D-A', 'C-A', 'S-A'] });
      // @ts-expect-error a third argument cannot carry board state
      decodeGroup(img, {}, ['H-A', 'D-A', 'C-A', 'S-A']);
    };
    expect(typeof probe).toBe('function'); // compile-time test; never executed
  });

  it('the reference comparison is a separate function and takes the decoded result plus the reference cards only', () => {
    expectTypeOf(compareWithReference).parameters.toEqualTypeOf<[GroupDecodeResult, unknown]>();
  });
});

// ---------------------------------------------------------------------------------------------
// P-E  Property 25: comparing with a reference never influences decoding
// ---------------------------------------------------------------------------------------------

describe('P-E. Property 25: reference comparison does not influence decoding', () => {
  const snapshot = (r: GroupDecodeResult): string => JSON.stringify(r);

  it('decoding before / after / between comparisons (match, mismatch, invalid reference) gives identical results', () => {
    const failures: string[] = [];
    for (let i = 0; i < 12; i++) {
      const a = makeCase(BASE_SEED + 7000 + i, 'any');
      const b = makeCase(BASE_SEED + 7100 + i, 'any');
      const imgA = renderCase(a);
      const imgB = renderCase(b);
      const aloneB = snapshot(decodeGroup(imgB));
      const resA = ident(decodeGroup(imgA), a);
      const before = snapshot(resA);

      const refs: unknown[] = [cardsOf(a.arr), cardsOf(b.arr), ['H-A', 'D-A', 'C-A', 'S-A'], ['H-K', 'D-K', 'C-K', 'S-K'], ['nonsense']];
      for (const ref of refs) {
        const cmp = compareWithReference(resA, ref);
        if (cmp.kind === 'REFERENCE_MISMATCH') {
          // The decoder's own identities stay in `decoded`; the reference identities are only reported as such.
          if (cmp.decoded !== resA) failures.push(`${reproTag(a)} mismatch.decoded is not the original object`);
          if ([...cmp.decodedCards].sort().join() !== cardsOf(a.arr).join()) failures.push(`${reproTag(a)} decodedCards replaced: ${cmp.decodedCards.join()}`);
          if (cmp.decoded.kind === 'IDENTIFIED' && cmp.decoded.hiddenSum !== sumOf(cardsOf(a.arr))) failures.push(`${reproTag(a)} sum replaced`);
        }
        // fresh decode of the same pixels is unchanged by the comparison
        const again = snapshot(decodeGroup(imgA));
        if (again !== before) failures.push(`${reproTag(a)} decode changed after comparing with ${JSON.stringify(ref)}`);
        if (snapshot(resA) !== before) failures.push(`${reproTag(a)} result object mutated by comparison`);
      }
      // a different group decoded after comparing group A against B's cards equals B decoded in isolation
      compareWithReference(resA, cardsOf(b.arr));
      if (snapshot(decodeGroup(imgB)) !== aloneB) failures.push(`${reproTag(b)} decode of B depends on earlier comparisons`);
    }
    expect(failures).toEqual([]);
  });

  it('a wrong reference with the SAME sum is still REFERENCE_MISMATCH and the decoded cards are kept', () => {
    let tested = 0;
    for (let i = 0; i < 40 && tested < 5; i++) {
      const c = makeCase(BASE_SEED + 7500 + i, 'any');
      const r = ident(decodeGroup(renderCase(c)), c);
      // swap two cards for two others with the same total: A+K -> 2+Q style (rank sums equal), different suits
      const cards = cardsOf(c.arr);
      const alt = cards.map((x) => x);
      const k = alt.findIndex((x) => rankValue(x) <= 12);
      const j = alt.findIndex((x, n) => n !== k && rankValue(x) >= 2);
      if (k < 0 || j < 0) continue;
      const suitK = (alt[k] as string).charAt(0);
      const suitJ = (alt[j] as string).charAt(0);
      const nk = `${suitK}-${RANKS[rankValue(alt[k] as string)]}`; // rank + 1
      const nj = `${suitJ}-${RANKS[rankValue(alt[j] as string) - 2]}`; // rank - 1
      if (alt.includes(nk) || alt.includes(nj) || nk === nj) continue;
      alt[k] = nk;
      alt[j] = nj;
      if (sumOf(alt) !== sumOf(cards)) continue;
      const cmp = compareWithReference(r, alt);
      expect(cmp.kind, reproTag(c)).toBe('REFERENCE_MISMATCH');
      if (cmp.kind === 'REFERENCE_MISMATCH') {
        expect(cmp.reasons, reproTag(c)).toContain('CARD_SET_DIFFERS');
        expect([...cmp.decodedCards].sort(), reproTag(c)).toEqual(cards);
        expect(cmp.decoded, reproTag(c)).toBe(r);
      }
      tested++;
    }
    expect(tested).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
// P-F  Reproducible failure messages
// ---------------------------------------------------------------------------------------------

describe('P-F. failure messages are reproducible', () => {
  it('a deliberately wrong expectation yields messages carrying seed, arrangement, transform and angle', () => {
    const c = makeCase(BASE_SEED + 9000, 'red', 'Fh');
    const r = decodeGroup(renderCase(c));
    const wrong: Want = { ...wantOf(c), hiddenSum: wantOf(c).hiddenSum + 1, reflection: 'NOT_REFLECTED' };
    const msgs = check(c, r, wrong);
    expect(msgs.length).toBe(2);
    for (const m of msgs) {
      expect(m).toContain(`seed=${c.seed}`);
      expect(m).toContain('transform=Fh');
      expect(m).toContain(`angle=${c.angle.toFixed(6)}`);
      for (const s of SLOT_NAMES) expect(m).toContain(`${s}:${c.arr[s].card}@${c.arr[s].orientation}`);
    }
    expect(check(c, r)).toEqual([]); // the right expectation passes
  });

  it('a non-IDENTIFIED outcome is also reported with the tag', () => {
    const c = makeCase(BASE_SEED + 9001, 'any');
    const blank = { width: 64, height: 64, data: new Uint8Array(64 * 64).fill(255) };
    const [m] = check(c, decodeGroup(blank));
    expect(m).toContain(`seed=${c.seed}`);
    expect(m).toContain('NOT_DETECTED');
  });

  it('the tag is enough to rebuild the case: same seed gives the same arrangement, transform, angle, pixels and result', () => {
    for (const mode of ['any', 'red', 'cs'] as const) {
      const c = makeCase(BASE_SEED + 9100, mode);
      const again = makeCase(c.seed, c.mode);
      expect(reproTag(again)).toBe(reproTag(c));
      const i1 = renderCase(c);
      const i2 = renderCase(again);
      expect(Array.from(i2.data)).toEqual(Array.from(i1.data));
      expect(JSON.stringify(decodeGroup(i2))).toBe(JSON.stringify(decodeGroup(i1)));
    }
  });
});
