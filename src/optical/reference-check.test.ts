/**
 * Tests for reference-check.ts (task 5.2; requirements 5.7, 13.2, 13.3, 13.9; Properties 20 and 25).
 * Decoder results come from REAL synthetic pixels (testing/group-compose.ts, same arrangement logic as
 * decode-group.test.ts). Hand-built objects are used only where marked "hand-built". The Card_Value
 * table in this file is independent of reference-check.ts and of the decoder.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { decodeGroup, type GroupDecodeResult } from './decode-group';
import { ALL_CARDS, placedFragments } from './fragments';
import { mulberry32 } from './prng';
import { renderMarker } from './render';
import {
  ReferenceCheck,
  compareWithReference,
  referenceHiddenSum,
  type InvalidReference,
  type ReferenceMismatch,
} from './reference-check';
import { TRANSFORM_NAMES, type TransformName } from './transforms';
import {
  RANKS,
  SLOT_NAMES,
  composeGroup,
  facingPattern,
  rotateImage,
  slotChoices,
  transformImage,
  type Arrangement,
  type Placement,
  type SlotName,
} from './testing/group-compose';
import { blankImage, fillRect, pasteImage } from './testing/warp';

vi.setConfig({ testTimeout: 600_000 });
const SEED = 20251112;

// ---------------------------------------------------------------------------------------------
// Helpers (own Card_Value table, arrangement builder, result access)
// ---------------------------------------------------------------------------------------------

const TEST_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
/** Independent table: value = position in the rank list + 1. */
const VALUE: Record<string, number> = Object.fromEntries(TEST_RANKS.map((r, i) => [r, i + 1]));
const valueOf = (card: string): number => VALUE[card.slice(2)] as number;
const sumOf = (cards: readonly string[]): number => cards.reduce((t, c) => t + valueOf(c), 0);
const sortedCopy = (a: readonly string[]): string[] => [...a].sort();
const sameSet = (a: readonly string[], b: readonly string[]): boolean => sortedCopy(a).join() === sortedCopy(b).join();

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
    const c = CHOICES[s][n % 3] as Placement;
    n = Math.floor(n / 3);
    out[s] = { card: `${c.card.charAt(0)}-${ranks[k]}`, orientation: c.orientation };
  });
  return out;
}
const cardsOf = (a: Arrangement): string[] => SLOT_NAMES.map((s) => a[s].card).sort();

function ident(r: GroupDecodeResult) {
  if (r.kind !== 'IDENTIFIED') throw new Error(`expected IDENTIFIED, got ${r.kind}`);
  return r;
}

function mismatch(r: unknown): ReferenceMismatch {
  const m = r as ReferenceMismatch;
  expect(m.kind).toBe('REFERENCE_MISMATCH');
  return m;
}
function invalid(r: unknown): InvalidReference {
  const m = r as InvalidReference;
  expect(m.kind).toBe('INVALID_REFERENCE');
  return m;
}

const asObject = (c: string): { suit: string; rank: string } => ({ suit: c.charAt(0), rank: c.slice(2) });

function permutations<T>(a: readonly T[]): T[][] {
  if (a.length <= 1) return [[...a]];
  return a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
}

function deepFreeze<T>(o: T): T {
  if (typeof o !== 'object' || o === null || Object.isFrozen(o) || ArrayBuffer.isView(o)) return o;
  for (const v of Object.values(o as object)) deepFreeze(v);
  return Object.freeze(o);
}

// ---------------------------------------------------------------------------------------------
// Real decoded results (computed once)
// ---------------------------------------------------------------------------------------------

interface Decoded {
  arr: Arrangement;
  t: TransformName;
  result: GroupDecodeResult;
}
let exhaustiveMemo: Decoded[] | null = null;
function exhaustive(): Decoded[] {
  if (exhaustiveMemo) return exhaustiveMemo;
  const out: Decoded[] = [];
  for (let idx = 0; idx < 81; idx++) {
    const arr = arrangementOf(idx, mulberry32(SEED + idx));
    const base = composeGroup(arr, { modulePx: 4 }).image;
    for (const t of TRANSFORM_NAMES) out.push({ arr, t, result: decodeGroup(transformImage(base, t)) });
  }
  exhaustiveMemo = out;
  return out;
}
/** The 81 identity-image results. */
const identityResults = (): Decoded[] => exhaustive().filter((d) => d.t === 'I');

// Non-identified results, same constructions as decode-group.test.ts section 6.
const BASE: Arrangement = {
  TL: { card: 'H-5', orientation: 0 },
  TR: { card: 'D-9', orientation: 0 },
  BL: { card: 'C-J', orientation: 0 },
  BR: { card: 'S-2', orientation: 0 },
};
const pat = (s: SlotName): number => facingPattern(s, BASE[s]) as number;
function nonIdentified(): Record<string, GroupDecodeResult> {
  const out: Record<string, GroupDecodeResult> = {};
  out.NOT_DETECTED = decodeGroup(blankImage(200, 200, 255));
  const m = renderMarker(pat('TL'), 8);
  fillRect(m, 3 * 8, 1 * 8, 8, 8, 255);
  const c = blankImage(200, 200, 255);
  pasteImage(c, m, 60, 60);
  out.INVALID_MARKER = decodeGroup(c);
  out.INCOMPLETE_GROUP = decodeGroup(composeGroup(BASE, { modulePx: 6, override: { TL: null } }).image);
  out.CORRUPTED_FRAGMENT = decodeGroup(composeGroup(BASE, { modulePx: 6, override: { TL: (pat('TL') ^ 0b11) >>> 0 } }).image);
  out.DUPLICATE_CARD = decodeGroup(composeGroup(BASE, { modulePx: 6, override: { BR: pat('TL') } }).image);
  out.INVALID_ARRANGEMENT = decodeGroup(composeGroup(BASE, { modulePx: 6, override: { TR: placedFragments('H-7', 0).TL as number } }).image);
  return out;
}

const REF_OK = ['H-5', 'D-9', 'C-J', 'S-2'];

// ---------------------------------------------------------------------------------------------
// 1. Exact match
// ---------------------------------------------------------------------------------------------

describe('1. exact match returns the same object', () => {
  it('all 81 observed arrangements (identity image)', () => {
    let n = 0;
    for (const d of identityResults()) {
      const r = compareWithReference(d.result, cardsOf(d.arr));
      expect(r).toBe(d.result);
      expect(r.kind).toBe('IDENTIFIED');
      n++;
    }
    expect(n).toBe(81);
  });

  it('a seeded sample of image transforms and camera rotations', () => {
    const rng = mulberry32(SEED + 1);
    let n = 0;
    for (let k = 0; k < 40; k++) {
      const idx = Math.floor(rng() * 81);
      const t = TRANSFORM_NAMES[Math.floor(rng() * 8)] as TransformName;
      const angle = k < 20 ? 0 : rng() * 360;
      const arr = arrangementOf(idx, mulberry32(SEED + idx));
      const base = transformImage(composeGroup(arr, { modulePx: 6 }).image, t);
      const result = decodeGroup(angle === 0 ? base : rotateImage(base, angle));
      const r = ReferenceCheck.compare(result, cardsOf(arr));
      expect(r, `idx ${idx} ${t} ${angle.toFixed(1)}`).toBe(result);
      expect(r.kind).toBe('IDENTIFIED');
      n++;
    }
    expect(n).toBe(40);
  });

  it('ReferenceCheck.compare is compareWithReference', () => {
    expect(ReferenceCheck.compare).toBe(compareWithReference);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Permutations and spellings
// ---------------------------------------------------------------------------------------------

describe('2. permutations of the reference', () => {
  it('all 24 orders, as strings, objects and mixed, still match', () => {
    let n = 0;
    for (const idx of [0, 40, 80]) {
      const { arr, result } = identityResults()[idx] as Decoded;
      const cards = cardsOf(arr);
      for (const p of permutations(cards)) {
        const forms: unknown[][] = [
          p,
          p.map(asObject),
          p.map((c, i) => (i % 2 === 0 ? asObject(c) : c)),
          p.map((c, i) => (i % 2 === 1 ? asObject(c) : c)),
        ];
        for (const ref of forms) {
          expect(compareWithReference(result, ref)).toBe(result);
          n++;
        }
      }
    }
    expect(n).toBe(3 * 24 * 4);
  });
});

// ---------------------------------------------------------------------------------------------
// 3. Different sets
// ---------------------------------------------------------------------------------------------

describe('3. different card sets are mismatches', () => {
  const samples = [3, 27, 55, 70, 12, 80].map((i) => identityResults()[i] as Decoded);

  function expectMismatch(result: GroupDecodeResult, decodedCards: string[], ref: string[], label: string): ReferenceMismatch {
    const out = ReferenceCheck.compare(result, ref);
    const m = mismatch(out);
    expect(m.reasons, label).toContain('CARD_SET_DIFFERS');
    expect(m.decoded, label).toBe(result);
    expect(sortedCopy(m.decodedCards), label).toEqual(sortedCopy(decodedCards));
    expect(sortedCopy(m.referenceCards), label).toEqual(sortedCopy(ref));
    expect(m.onlyInDecoded.slice().sort(), label).toEqual(decodedCards.filter((c) => !ref.includes(c)).sort());
    expect(m.onlyInReference.slice().sort(), label).toEqual(ref.filter((c) => !decodedCards.includes(c)).sort());
    expect(m.referenceSum, label).toBe(sumOf(ref));
    expect(m.decodedSumReported).toBe(ident(result).hiddenSum);
    expect(m.decodedSumRecomputed).toBe(sumOf(decodedCards));
    expect(m.reasons).not.toContain('DECODED_SUM_INCONSISTENT');
    expect(out.kind).not.toBe('IDENTIFIED');
    return m;
  }

  it('(a) same suit, different rank; (b) same rank, different suit; per position', () => {
    for (const { arr, result } of samples) {
      const cards = cardsOf(arr);
      for (let i = 0; i < 4; i++) {
        const c = cards[i] as string;
        const sameSuit = ALL_CARDS.find((x) => x.charAt(0) === c.charAt(0) && x !== c && !cards.includes(x)) as string;
        const sameRank = ALL_CARDS.find((x) => x.slice(2) === c.slice(2) && x !== c && !cards.includes(x)) as string;
        for (const [label, repl] of [['a', sameSuit], ['b', sameRank]] as const) {
          const ref = cards.map((x, k) => (k === i ? repl : x));
          const m = expectMismatch(result, cards, ref, `${label}${i}`);
          expect(m.onlyInDecoded).toEqual([c]);
          expect(m.onlyInReference).toEqual([repl]);
        }
      }
    }
  });

  it('(c) different cards with the SAME total sum are still a mismatch', () => {
    let tested = 0;
    for (const { arr, result } of samples) {
      const cards = cardsOf(arr);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        const keep = cards.filter((_, k) => k !== i && k !== j);
        const target = valueOf(cards[i] as string) + valueOf(cards[j] as string);
        // deterministic search for a different pair with the same sum
        let found: [string, string] | null = null;
        for (const p of ALL_CARDS) {
          for (const q of ALL_CARDS) {
            if (p >= q || [p, q].some((x) => cards.includes(x))) continue;
            if (valueOf(p) + valueOf(q) === target) {
              found = [p, q];
              break;
            }
          }
          if (found) break;
        }
        expect(found).not.toBeNull();
        const ref = [...keep, ...(found as [string, string])];
        expect(sumOf(ref)).toBe(sumOf(cards));
        const m = expectMismatch(result, cards, ref, `c${i}`);
        expect(m.referenceSum).toBe(ident(result).hiddenSum);
        tested++;
      }
      // single-card variant: another suit of the same rank has the same value
      const c = cards[0] as string;
      const twin = ALL_CARDS.find((x) => x.slice(2) === c.slice(2) && x !== c && !cards.includes(x)) as string;
      const ref = [twin, ...cards.slice(1)];
      expect(sumOf(ref)).toBe(sumOf(cards));
      expectMismatch(result, cards, ref, 'c-twin');
    }
    expect(tested).toBe(24);
  });

  it('(d) a completely different set, and a partially overlapping one', () => {
    for (const { arr, result } of samples) {
      const cards = cardsOf(arr);
      const others = ALL_CARDS.filter((x) => !cards.includes(x));
      const ref = [others[0], others[7], others[19], others[30]] as string[];
      const m = expectMismatch(result, cards, ref, 'd');
      expect(m.onlyInDecoded.slice().sort()).toEqual(cards);
      expect(m.onlyInReference.slice().sort()).toEqual(sortedCopy(ref));
      const half = [cards[0], cards[1], others[3], others[4]] as string[];
      expectMismatch(result, cards, half, 'd-half');
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 4. Independent sum
// ---------------------------------------------------------------------------------------------

describe('4. independent sum', () => {
  it('referenceHiddenSum equals the test table for each of the 52 cards', () => {
    expect(ALL_CARDS.length).toBe(52);
    for (const c of ALL_CARDS) expect(referenceHiddenSum([c])).toBe(valueOf(c));
  });

  it('2,000 random 4-sets (seed 20251112)', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.constantFrom(...ALL_CARDS), { minLength: 4, maxLength: 4 }), (cards) => {
        expect(referenceHiddenSum(cards)).toBe(sumOf(cards));
        expect(referenceHiddenSum(cards)).toBeGreaterThanOrEqual(4);
        expect(referenceHiddenSum(cards)).toBeLessThanOrEqual(52);
      }),
      { seed: SEED, numRuns: 2000 },
    );
  });

  it('rejects ids outside the deck with RangeError', () => {
    expect(() => referenceHiddenSum(['H-11'])).toThrow(RangeError);
  });

  it('boundary groups: sum 4 and sum 52 (pure and from real decoded images)', () => {
    expect(referenceHiddenSum(['H-A', 'D-A', 'C-A', 'S-A'])).toBe(4);
    expect(referenceHiddenSum(['H-K', 'D-K', 'C-K', 'S-K'])).toBe(52);
    const make = (rank: string): Arrangement => ({
      TL: { card: `H-${rank}`, orientation: 0 },
      TR: { card: `D-${rank}`, orientation: 0 },
      BL: { card: `C-${rank}`, orientation: CHOICES.BL.find((c) => c.card[0] === 'C')!.orientation },
      BR: { card: `S-${rank}`, orientation: CHOICES.BR.find((c) => c.card[0] === 'S')!.orientation },
    });
    for (const [rank, sum] of [['A', 4], ['K', 52]] as const) {
      const base = composeGroup(make(rank), { modulePx: 6 }).image;
      for (const t of TRANSFORM_NAMES) {
        const result = decodeGroup(transformImage(base, t));
        expect(ident(result).hiddenSum).toBe(sum);
        const ref = ['H', 'D', 'C', 'S'].map((s) => `${s}-${rank}`);
        expect(compareWithReference(result, ref)).toBe(result);
        expect(compareWithReference(result, ref.map(asObject))).toBe(result);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 5. Tampering
// ---------------------------------------------------------------------------------------------

describe('5. tampered IDENTIFIED results', () => {
  const real = ident(identityResults()[41]!.result);
  const refCards = [...real.cards];
  const snapshot = JSON.stringify(real);

  it('(i) hiddenSum + 1 with unchanged cards: DECODED_SUM_INCONSISTENT, not CARD_SET_DIFFERS', () => {
    const tampered = { ...real, hiddenSum: real.hiddenSum + 1 } as GroupDecodeResult;
    const m = mismatch(compareWithReference(tampered, refCards));
    expect(m.reasons).toContain('DECODED_SUM_INCONSISTENT');
    expect(m.reasons).not.toContain('CARD_SET_DIFFERS');
    expect(m.reasons).not.toContain('DECODED_RESULT_MALFORMED');
    expect(m.decodedSumReported).toBe(real.hiddenSum + 1);
    expect(m.decodedSumRecomputed).toBe(sumOf(real.cards));
    expect(m.referenceSum).toBe(sumOf(refCards));
    expect(m.decoded).toBe(tampered);
    expect(sortedCopy(m.decodedCards)).toEqual(sortedCopy(real.cards));
  });

  it('(ii) one card changed, hiddenSum kept: mismatch (set differs and sum inconsistent)', () => {
    const other = ALL_CARDS.find((c) => !real.cards.includes(c) && valueOf(c) !== valueOf(real.cards[0] as string)) as string;
    const tampered = { ...real, cards: [other, ...real.cards.slice(1)] } as GroupDecodeResult;
    const m = mismatch(compareWithReference(tampered, refCards));
    expect(m.reasons).toContain('CARD_SET_DIFFERS');
    expect(m.reasons).toContain('DECODED_SUM_INCONSISTENT');
    expect(m.onlyInDecoded).toEqual([other]);
    expect(m.onlyInReference).toEqual([real.cards[0]]);
    // the same tampered result against a reference that equals its cards: only the sum is inconsistent
    const m2 = mismatch(compareWithReference(tampered, [other, ...real.cards.slice(1)]));
    expect(m2.reasons).toEqual(['DECODED_SUM_INCONSISTENT']);
  });

  it('(iii) malformed cards / sums: DECODED_RESULT_MALFORMED, no throw', () => {
    const dupe = [real.cards[0], real.cards[0], real.cards[2], real.cards[3]];
    const cases: Array<[string, Record<string, unknown>]> = [
      ['3 cards', { cards: real.cards.slice(0, 3) }],
      ['5 cards', { cards: [...real.cards, 'H-2'] }],
      ['duplicate cards', { cards: dupe }],
      ['invalid id', { cards: [real.cards[0], real.cards[1], real.cards[2], 'Z-9'] }],
      ['non-string card', { cards: [real.cards[0], real.cards[1], real.cards[2], 7] }],
      ['cards missing', { cards: undefined }],
      ['cards not an array', { cards: 'H-A,D-A,C-A,S-A' }],
      ['hiddenSum missing', { hiddenSum: undefined }],
      ['hiddenSum string', { hiddenSum: String(real.hiddenSum) }],
      ['hiddenSum NaN', { hiddenSum: Number.NaN }],
      ['hiddenSum Infinity', { hiddenSum: Number.POSITIVE_INFINITY }],
      ['hiddenSum fractional', { hiddenSum: real.hiddenSum + 0.5 }],
    ];
    for (const [label, patch] of cases) {
      const tampered = { ...real, ...patch } as unknown as GroupDecodeResult;
      let out: ReturnType<typeof compareWithReference> | undefined;
      expect(() => {
        out = compareWithReference(tampered, refCards);
      }, label).not.toThrow();
      const m = mismatch(out);
      expect(m.reasons, label).toContain('DECODED_RESULT_MALFORMED');
      expect(m.decoded, label).toBe(tampered);
      expect(m.referenceCards, label).toEqual(sortedCopy(refCards));
      expect(m.referenceSum, label).toBe(sumOf(refCards));
    }
  });

  it('the original real result was never mutated by building the clones', () => {
    expect(JSON.stringify(real)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------------------------
// 6. Non-identified results from real pixels
// ---------------------------------------------------------------------------------------------

describe('6. non-identified results pass through unchanged', () => {
  const results = nonIdentified();

  it('the constructions produce the intended kinds', () => {
    for (const [kind, r] of Object.entries(results)) expect(r.kind).toBe(kind);
    expect(Object.keys(results).length).toBe(6);
  });

  it('valid reference: the same object comes back; invalid reference: INVALID_REFERENCE carrying the original', () => {
    for (const [kind, r] of Object.entries(results)) {
      const before = JSON.stringify(r);
      const out = compareWithReference(r, REF_OK);
      expect(out, kind).toBe(r);
      expect(out.kind, kind).toBe(kind);
      for (const bad of [REF_OK.slice(0, 3), ['H-5', 'H-5', 'C-J', 'S-2'], undefined, ['JOKER', 'D-9', 'C-J', 'S-2']]) {
        const o = invalid(compareWithReference(r, bad));
        expect(o.decoded, kind).toBe(r);
        expect(o.kind).not.toBe('IDENTIFIED');
      }
      expect(JSON.stringify(r)).toBe(before);
    }
  });

  it('a mismatching but valid reference does not turn a non-identified result into anything else', () => {
    for (const r of Object.values(results)) expect(compareWithReference(r, ['H-A', 'D-A', 'C-A', 'S-A'])).toBe(r);
  });

  it('hand-built: AMBIGUOUS_FRAGMENT and an unknown kind are also returned unchanged', () => {
    const a = { kind: 'AMBIGUOUS_FRAGMENT', members: [] } as unknown as GroupDecodeResult;
    const u = { kind: 'SOMETHING_ELSE' } as unknown as GroupDecodeResult;
    expect(compareWithReference(a, REF_OK)).toBe(a);
    expect(compareWithReference(u, REF_OK)).toBe(u);
    expect(invalid(compareWithReference(u, null)).decoded).toBe(u);
  });
});

// ---------------------------------------------------------------------------------------------
// 7. Invalid references
// ---------------------------------------------------------------------------------------------

describe('7. invalid references', () => {
  const { result } = identityResults()[20] as Decoded;
  const good = ['H-A', 'D-2', 'C-3', 'S-4'];
  type Case = [string, unknown, string, number | null];
  const cases: Case[] = [
    ['empty', [], 'WRONG_LENGTH', null],
    ['one card', ['H-A'], 'WRONG_LENGTH', null],
    ['three cards', good.slice(0, 3), 'WRONG_LENGTH', null],
    ['five cards', [...good, 'S-5'], 'WRONG_LENGTH', null],
    ['duplicate string', ['H-A', 'H-A', 'C-3', 'S-4'], 'DUPLICATE_CARD', 1],
    ['duplicate string/object', ['H-A', { suit: 'H', rank: 'A' }, 'C-3', 'S-4'], 'DUPLICATE_CARD', 1],
    ['duplicate object/string', [{ suit: 'S', rank: '10' }, 'D-2', 'C-3', 'S-10'], 'DUPLICATE_CARD', 3],
    ['joker JK', ['JK', 'D-2', 'C-3', 'S-4'], 'JOKER', 0],
    ['joker JOKER', ['H-A', 'JOKER', 'C-3', 'S-4'], 'JOKER', 1],
    ['joker X-JOKER', ['H-A', 'D-2', 'X-JOKER', 'S-4'], 'JOKER', 2],
    ['joker Joker', ['H-A', 'D-2', 'C-3', 'Joker'], 'JOKER', 3],
    ['joker object key', ['H-A', 'D-2', 'C-3', { joker: true }], 'JOKER', 3],
    ['joker object value', ['H-A', 'D-2', 'C-3', { suit: 'X', rank: 'JOKER' }], 'JOKER', 3],
    ['H-1', ['H-1', 'D-2', 'C-3', 'S-4'], 'UNKNOWN_CARD', 0],
    ['H-11', ['H-11', 'D-2', 'C-3', 'S-4'], 'UNKNOWN_CARD', 0],
    ['X-A', ['X-A', 'D-2', 'C-3', 'S-4'], 'UNKNOWN_CARD', 0],
    ['h-a', ['h-a', 'D-2', 'C-3', 'S-4'], 'UNKNOWN_CARD', 0],
    ['10-H', ['10-H', 'D-2', 'C-3', 'S-4'], 'UNKNOWN_CARD', 0],
    ['trailing space', ['H-10 ', 'D-2', 'C-3', 'S-4'], 'NOT_A_CARD', 0],
    ['empty string', ['', 'D-2', 'C-3', 'S-4'], 'NOT_A_CARD', 0],
    ['rank number 10', [{ suit: 'H', rank: 10 }, 'D-2', 'C-3', 'S-4'], 'NOT_A_CARD', 0],
    ['null entry', [null, 'D-2', 'C-3', 'S-4'], 'NOT_A_CARD', 0],
    ['undefined entry', [undefined, 'D-2', 'C-3', 'S-4'], 'NOT_A_CARD', 0],
    ['number entry', [10, 'D-2', 'C-3', 'S-4'], 'NOT_A_CARD', 0],
    ['nested array', [['H', 'A'], 'D-2', 'C-3', 'S-4'], 'NOT_A_CARD', 0],
    ['object missing rank', [{ suit: 'H' }, 'D-2', 'C-3', 'S-4'], 'NOT_A_CARD', 0],
    ['object missing suit', [{ rank: 'A' }, 'D-2', 'C-3', 'S-4'], 'NOT_A_CARD', 0],
    ['object with extra key', [{ suit: 'H', rank: 'A', extra: 1 }, 'D-2', 'C-3', 'S-4'], 'NOT_A_CARD', 0],
    ['object weird values', [{ suit: {}, rank: [] }, 'D-2', 'C-3', 'S-4'], 'NOT_A_CARD', 0],
    ['object unknown suit', [{ suit: 'Z', rank: 'A' }, 'D-2', 'C-3', 'S-4'], 'UNKNOWN_CARD', 0],
    ['object unknown rank', [{ suit: 'H', rank: '1' }, 'D-2', 'C-3', 'S-4'], 'UNKNOWN_CARD', 0],
    ['object lowercase suit', [{ suit: 'h', rank: 'A' }, 'D-2', 'C-3', 'S-4'], 'UNKNOWN_CARD', 0],
    ['undefined', undefined, 'NOT_AN_ARRAY', null],
    ['null', null, 'NOT_AN_ARRAY', null],
    ['comma string', 'H-A,D-A,C-A,S-A', 'NOT_AN_ARRAY', null],
    ['Set', new Set(good), 'NOT_AN_ARRAY', null],
    ['plain object', { 0: 'H-A', 1: 'D-2', 2: 'C-3', 3: 'S-4', length: 4 }, 'NOT_AN_ARRAY', null],
    ['number', 4, 'NOT_AN_ARRAY', null],
  ];

  it('each case: INVALID_REFERENCE with the right problem, the original result, never IDENTIFIED, no throw', () => {
    expect(compareWithReference(result, good).kind).toBe('REFERENCE_MISMATCH'); // `good` is a valid reference
    for (const [label, ref, reason, index] of cases) {
      let out: ReturnType<typeof compareWithReference> | undefined;
      expect(() => {
        out = compareWithReference(result, ref);
      }, label).not.toThrow();
      const inv = invalid(out);
      expect(inv.decoded, label).toBe(result);
      expect(out!.kind, label).not.toBe('IDENTIFIED');
      const hit = inv.problems.find((p) => p.reason === reason);
      expect(hit, `${label}: ${JSON.stringify(inv.problems.map((p) => p.reason))}`).toBeDefined();
      expect(hit!.index, label).toBe(index);
    }
  });

  it('the correct card set written with an invalid shape never yields IDENTIFIED', () => {
    const { arr, result: r } = identityResults()[5] as Decoded;
    const cards = cardsOf(arr);
    for (const ref of [cards.slice(0, 3), [...cards, cards[0]], [...cards, 'H-A'], cards.join(','), new Set(cards)]) {
      expect(compareWithReference(r, ref).kind).toBe('INVALID_REFERENCE');
    }
    expect(compareWithReference(r, cards)).toBe(r);
  });

  it('a throwing getter in the reference is reported as a problem, not thrown', () => {
    const ref = [good[0], good[1], good[2], {}];
    Object.defineProperty(ref[3] as object, 'suit', { enumerable: true, get() { throw new Error('boom'); } });
    Object.defineProperty(ref[3] as object, 'rank', { enumerable: true, value: 'A' });
    expect(() => compareWithReference(result, ref)).not.toThrow();
    expect(compareWithReference(result, ref).kind).toBe('INVALID_REFERENCE');
  });
});

// ---------------------------------------------------------------------------------------------
// 8. Invariant over a seeded mix
// ---------------------------------------------------------------------------------------------

describe('8. IDENTIFIED if and only if identified result + valid + set-equal reference', () => {
  it('500 seeded (result, reference) pairs', () => {
    const rng = mulberry32(SEED + 8);
    const pool: GroupDecodeResult[] = [...exhaustive().map((d) => d.result), ...Object.values(nonIdentified())];
    const arrs = new Map<GroupDecodeResult, Arrangement>(exhaustive().map((d) => [d.result, d.arr]));
    const counts = { matched: 0, mismatch: 0, invalid: 0, passthrough: 0 };
    for (let i = 0; i < 500; i++) {
      const result = pool[Math.floor(rng() * pool.length)] as GroupDecodeResult;
      const arr = arrs.get(result);
      const decodedCards = result.kind === 'IDENTIFIED' ? [...result.cards] : REF_OK;
      const roll = rng();
      let ref: unknown;
      let valid = true;
      let equal = false;
      if (roll < 0.35) {
        ref = permutations(decodedCards)[Math.floor(rng() * 24)]!.map((c) => (rng() < 0.5 ? c : asObject(c)));
        equal = true;
      } else if (roll < 0.7) {
        const idx = Math.floor(rng() * 4);
        const repl = ALL_CARDS.filter((c) => !decodedCards.includes(c))[Math.floor(rng() * 48)] as string;
        ref = decodedCards.map((c, k) => (k === idx ? repl : c));
      } else {
        valid = false;
        const bads: unknown[] = [decodedCards.slice(0, 3), [...decodedCards.slice(0, 3), decodedCards[0]], null, 'H-A', [...decodedCards.slice(0, 3), 'JK']];
        ref = bads[Math.floor(rng() * bads.length)];
      }
      const out = compareWithReference(result, ref);
      const shouldBeIdentified = result.kind === 'IDENTIFIED' && valid && equal;
      expect(out.kind === 'IDENTIFIED', `pair ${i}`).toBe(shouldBeIdentified);
      if (shouldBeIdentified) {
        expect(out).toBe(result);
        counts.matched++;
        expect(arr).toBeDefined();
      } else if (result.kind !== 'IDENTIFIED' && valid) {
        expect(out).toBe(result);
        counts.passthrough++;
      } else if (!valid) {
        expect((out as InvalidReference).decoded).toBe(result);
        counts.invalid++;
      } else {
        expect(mismatch(out).decoded).toBe(result);
        counts.mismatch++;
      }
    }
    expect(counts.matched + counts.mismatch + counts.invalid + counts.passthrough).toBe(500);
    expect(counts.matched).toBeGreaterThan(20);
    expect(counts.mismatch).toBeGreaterThan(20);
    expect(counts.invalid).toBeGreaterThan(20);
    expect(counts.passthrough).toBeGreaterThan(0);
  });

  it('property: over random mismatching sets the decoded and reference identities are never swapped', () => {
    const results = identityResults();
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 80 }),
        fc.uniqueArray(fc.constantFrom(...ALL_CARDS), { minLength: 4, maxLength: 4 }),
        (idx, ref) => {
          const { result } = results[idx] as Decoded;
          const decoded = [...ident(result).cards];
          fc.pre(!sameSet(decoded, ref));
          const m = mismatch(compareWithReference(result, ref));
          expect(sortedCopy(m.decodedCards)).toEqual(sortedCopy(decoded));
          expect(sortedCopy(m.referenceCards)).toEqual(sortedCopy(ref));
          expect(m.decoded).toBe(result);
          expect(m.onlyInDecoded.every((c) => decoded.includes(c) && !ref.includes(c))).toBe(true);
          expect(m.onlyInReference.every((c) => ref.includes(c) && !decoded.includes(c))).toBe(true);
          expect(ident(result).cards).toEqual(decoded);
          expect(m.reasons).toContain('CARD_SET_DIFFERS');
        },
      ),
      { seed: SEED, numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------------------------
// 9. Purity and safety
// ---------------------------------------------------------------------------------------------

describe('9. purity and safety', () => {
  it('deeply frozen result and reference are accepted and unchanged (match and mismatch)', () => {
    const real = ident(identityResults()[9]!.result);
    const frozen = deepFreeze(structuredClone(real)) as GroupDecodeResult;
    const refMatch = deepFreeze(real.cards.map(asObject));
    expect(compareWithReference(frozen, refMatch)).toBe(frozen);
    const refOther = deepFreeze(ALL_CARDS.filter((c) => !real.cards.includes(c)).slice(0, 4));
    const m = mismatch(compareWithReference(frozen, refOther));
    expect(m.decoded).toBe(frozen);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(frozen).toEqual(real);
    // frozen invalid reference
    expect(compareWithReference(frozen, deepFreeze(['JK']))).toMatchObject({ kind: 'INVALID_REFERENCE' });
  });

  it('deterministic and idempotent', () => {
    const { arr, result } = identityResults()[33] as Decoded;
    const ref = cardsOf(arr);
    const other = ALL_CARDS.filter((c) => !ref.includes(c)).slice(0, 4);
    expect(compareWithReference(result, other)).toEqual(compareWithReference(result, other));
    const once = compareWithReference(result, ref);
    expect(compareWithReference(once as GroupDecodeResult, ref)).toBe(once);
    expect(once).toBe(result);
    // the reference array is not retained or mutated
    const mutable = [...other];
    const m = mismatch(compareWithReference(result, mutable));
    expect(mutable).toEqual(other);
    mutable[0] = 'H-A';
    expect(sortedCopy(m.referenceCards)).toEqual(sortedCopy(other));
  });

  it('a result that is not an object throws TypeError', () => {
    for (const bad of [null, undefined, 5, 'IDENTIFIED', true]) {
      expect(() => compareWithReference(bad as unknown as GroupDecodeResult, REF_OK)).toThrow(TypeError);
      expect(() => ReferenceCheck.compare(bad as unknown as GroupDecodeResult, null)).toThrow(TypeError);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 10. Boundaries
// ---------------------------------------------------------------------------------------------

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
}
const read = (name: string): string => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

describe('10. module boundaries', () => {
  const code = stripComments(read('./reference-check.ts'));

  it('reference-check.ts imports only types from ./decode-group', () => {
    const imports = code.match(/^\s*import\b[^;]*;/gm) ?? [];
    expect(imports.length).toBe(1);
    expect(imports[0]).toMatch(/^\s*import type \{[^}]*\} from '\.\/decode-group';$/);
    expect(code).not.toMatch(/\brequire\s*\(/);
    expect(code).not.toMatch(/\bimport\s*\(/);
    for (const m of ['decode-fragment', 'detect', 'transforms', 'fragments', 'render', 'codebook', 'node:fs', 'prng']) {
      expect(code).not.toContain(m);
    }
  });

  it('has no board, expected-value, score or game identifiers (comments excluded)', () => {
    expect(code).not.toMatch(/board|expected|scor(e|ing)|game/i);
  });

  it('keeps its own Card_Value table (not imported)', () => {
    expect(code).toMatch(/const CARD_VALUE_BY_RANK/);
    expect(code).not.toMatch(/from '\.\/(?!decode-group)/);
  });

  it('decode-group.ts neither imports nor uses reference-check, and takes at most 2 parameters', () => {
    const dg = stripComments(read('./decode-group.ts'));
    expect(dg).not.toMatch(/reference-check|ReferenceCheck|compareWithReference|referenceHiddenSum|INVALID_REFERENCE/);
    expect(dg).not.toContain('REFERENCE_MISMATCH');
    expect(decodeGroup.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------------------------
// 11. End to end over the 648 images
// ---------------------------------------------------------------------------------------------

describe('11. end to end over the exhaustive 648 images', () => {
  it('the correct reference matches (same object); one wrong card mismatches; identities never change', () => {
    const rng = mulberry32(SEED + 11);
    const counts = { images: 0, matched: 0, mismatched: 0 };
    const failures: string[] = [];
    exhaustive().forEach(({ arr, t, result }, i) => {
      counts.images++;
      const label = `${i}/${t}`;
      const cards = cardsOf(arr);
      const idr = ident(result);
      const cardsBefore = [...idr.cards];
      const cardsRef = idr.cards;

      const ok = compareWithReference(result, cards);
      if (ok === result && ok.kind === 'IDENTIFIED') counts.matched++;
      else failures.push(`${label}: no match (${ok.kind})`);

      const pos = i % 4;
      const repl = ALL_CARDS.filter((c) => !cards.includes(c))[Math.floor(rng() * 48)] as string;
      const wrong = cards.map((c, k) => (k === pos ? repl : c));
      const bad = compareWithReference(result, wrong);
      if (bad.kind === 'REFERENCE_MISMATCH' && bad.decoded === result && sameSet(bad.decodedCards, cardsBefore) && sameSet(bad.referenceCards, wrong)) {
        counts.mismatched++;
      } else failures.push(`${label}: wrong-card reference gave ${bad.kind}`);

      if (idr.cards !== cardsRef || idr.cards.join() !== cardsBefore.join()) failures.push(`${label}: decoded identities changed`);
    });
    console.log(`reference-check end to end: ${JSON.stringify(counts)}`);
    expect(failures).toEqual([]);
    expect(counts).toEqual({ images: 648, matched: 648, mismatched: 648 });
  });
});
