// fast-check arbitraries for scoring, guess validation and ranking tests (task 6.3). Test support only: imported
// by tests, never by engine code. Pure and deterministic: no Math.random, clock or crypto; all randomness comes
// from fast-check.
//
// Source: .kiro/specs/qroker-playable-game/design.md, "Testing Strategy > Generators" and Properties 15, 16, 20.
//
// Boundary rule 'score-table' (src/game/boundaries.test.ts): this file is scanned, and no numeric score table may be
// written outside core/score.ts. Every table here is therefore computed (sorted, mapped, appended) and travels in
// a variable; the config key is only ever followed by a variable name, never by an array literal.
//
// Nothing here knows or assumes the provisional placeholder values: tables are generated from the rules of the
// design (non-empty, finite, non-negative, first value positive, non-increasing), not from a balance decision.

import fc from "fast-check";
import type { PlayerId, ScoreConfig } from "../types";

// ---------------------------------------------------------------------------------------------------------
// Valid ScoreConfig
// ---------------------------------------------------------------------------------------------------------

/** A finite non-negative value: small integers (many plateaus and zeros) or a fraction. */
const arbReward: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 6 }) },
  { weight: 1, arbitrary: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }).map((v) => Math.abs(v)) },
);

/** Number of entries after the first. Mostly short tables; sometimes a table too long to ever cut off (>= 49). */
const arbBody: fc.Arbitrary<number[]> = fc.oneof(
  { weight: 9, arbitrary: fc.array(arbReward, { minLength: 0, maxLength: 13 }) },
  { weight: 1, arbitrary: fc.array(arbReward, { minLength: 48, maxLength: 59 }) },
);

/**
 * A table the rules of requirement 8.3 accept: non-empty, finite, non-negative, first value > 0, non-increasing.
 * Built by sorting a body in descending order and putting a first value that is at least the largest body value in
 * front of it. Small-integer entries produce plateaus (equal neighbours); the explicit zero tail and small integers
 * produce tables that end in zeros. Length 1 to 60.
 */
export const arbValidScoreTable: fc.Arbitrary<number[]> = fc
  .tuple(
    fc.oneof(fc.integer({ min: 1, max: 20 }), fc.double({ min: 0.001, max: 100, noNaN: true, noDefaultInfinity: true })),
    arbBody,
    fc.integer({ min: 0, max: 4 }),
  )
  .map(([firstRaw, body, zeros]) => {
    const sorted = body.slice().sort((a, b) => b - a);
    const first = Math.max(firstRaw, sorted[0] ?? 0);
    const tail: number[] = Array.from({ length: zeros }, () => 0);
    return [first, ...sorted, ...tail];
  });

/** A bonus that is finite and non-negative. */
export const arbValidBonus: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: 0, max: 20 }),
  fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }).map((v) => Math.abs(v)),
);

/** Builds a configuration object. The table travels in a variable (see the boundary note at the top). */
function configOf(table: unknown, bonus: unknown): unknown {
  return { rewardByError: table, handEmptyBonus: bonus };
}

/** A configuration that must be accepted by `validateScoreConfig`. */
export const arbValidScoreConfig: fc.Arbitrary<ScoreConfig> = fc
  .tuple(arbValidScoreTable, arbValidBonus)
  .map(([table, bonus]) => configOf(table, bonus) as ScoreConfig);

// ---------------------------------------------------------------------------------------------------------
// Invalid ScoreConfig, one generator per rejection kind. Each kind violates the rule named next to it, whatever
// else it may also violate.
// ---------------------------------------------------------------------------------------------------------

export const INVALID_SCORE_KINDS = [
  "NOT_OBJECT", // the candidate is not a plain object (null, undefined, number, string, boolean, bigint, array)
  "TABLE_NOT_ARRAY", // rewardByError is missing or not an array
  "TABLE_EMPTY", // rewardByError is an empty array
  "ENTRY_NEGATIVE", // some table entry is negative (finite)
  "ENTRY_NAN", // some table entry is NaN
  "ENTRY_INFINITY", // some table entry is +Infinity or -Infinity
  "ENTRY_WRONG_TYPE", // some table entry is not a number (string, null, undefined, boolean, object, array, bigint)
  "FIRST_NOT_POSITIVE", // the first entry is 0 (or -0), the rest is zero too
  "TABLE_INCREASES", // some entry is strictly larger than its predecessor
  "BONUS_NEGATIVE", // handEmptyBonus is negative (finite)
  "BONUS_NON_FINITE", // handEmptyBonus is NaN, +Infinity or -Infinity
  "BONUS_WRONG_TYPE", // handEmptyBonus is missing or not a number
] as const;

export type InvalidScoreKind = (typeof INVALID_SCORE_KINDS)[number];

const arbNonNumber: fc.Arbitrary<unknown> = fc.constantFrom<unknown>(
  "3",
  "",
  null,
  undefined,
  true,
  false,
  {},
  [],
  [3],
  3n,
);

/** Replaces entry `index % length` of a copy of `table`. */
function withEntry(table: readonly unknown[], index: number, value: unknown): unknown[] {
  const copy = table.slice();
  copy[index % copy.length] = value;
  return copy;
}

/** Valid table plus a position, shared by the single-entry mutations. */
const arbTableAndIndex: fc.Arbitrary<[number[], number, number]> = fc.tuple(
  arbValidScoreTable,
  fc.nat({ max: 1000 }),
  arbValidBonus,
);

export const arbInvalidScoreConfigOfKind: Readonly<Record<InvalidScoreKind, fc.Arbitrary<unknown>>> = {
  NOT_OBJECT: fc.constantFrom<unknown>(null, undefined, 0, 7, "config", "", true, false, 5n, [], [1, 2, 3]),

  TABLE_NOT_ARRAY: fc
    .tuple(
      fc.constantFrom<unknown>("1,2,3", 5, null, true, {}, { length: 3 }, { 0: 3, length: 1 }, undefined),
      arbValidBonus,
      fc.boolean(),
    )
    .map(([value, bonus, omitKey]) => (omitKey ? { handEmptyBonus: bonus } : configOf(value, bonus))),

  TABLE_EMPTY: arbValidBonus.map((bonus) => {
    const empty: number[] = [];
    return configOf(empty, bonus);
  }),

  ENTRY_NEGATIVE: fc
    .tuple(arbTableAndIndex, fc.oneof(fc.integer({ min: -50, max: -1 }), fc.double({ min: -1000, max: -0.001, noNaN: true })))
    .map(([[table, index, bonus], negative]) => configOf(withEntry(table, index, negative), bonus)),

  ENTRY_NAN: arbTableAndIndex.map(([table, index, bonus]) => configOf(withEntry(table, index, Number.NaN), bonus)),

  ENTRY_INFINITY: fc
    .tuple(arbTableAndIndex, fc.constantFrom(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY))
    .map(([[table, index, bonus], infinite]) => configOf(withEntry(table, index, infinite), bonus)),

  ENTRY_WRONG_TYPE: fc
    .tuple(arbTableAndIndex, arbNonNumber)
    .map(([[table, index, bonus], other]) => configOf(withEntry(table, index, other), bonus)),

  FIRST_NOT_POSITIVE: fc
    .tuple(fc.integer({ min: 1, max: 8 }), fc.constantFrom(0, -0), arbValidBonus)
    .map(([length, zero, bonus]) => {
      const table: number[] = Array.from({ length }, () => 0);
      table[0] = zero;
      return configOf(table, bonus);
    }),

  TABLE_INCREASES: fc
    .tuple(
      arbValidScoreTable.filter((t) => t.length >= 2),
      fc.nat({ max: 1000 }),
      fc.integer({ min: 1, max: 10 }),
      arbValidBonus,
    )
    .map(([table, position, step, bonus]) => {
      const index = 1 + (position % (table.length - 1));
      const raised = table.slice();
      raised[index] = (raised[index - 1] as number) + step;
      return configOf(raised, bonus);
    }),

  BONUS_NEGATIVE: fc
    .tuple(arbValidScoreTable, fc.oneof(fc.integer({ min: -50, max: -1 }), fc.double({ min: -1000, max: -0.001, noNaN: true })))
    .map(([table, bonus]) => configOf(table, bonus)),

  BONUS_NON_FINITE: fc
    .tuple(arbValidScoreTable, fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY))
    .map(([table, bonus]) => configOf(table, bonus)),

  BONUS_WRONG_TYPE: fc
    .tuple(arbValidScoreTable, arbNonNumber, fc.boolean())
    .map(([table, other, omitKey]) => (omitKey ? { rewardByError: table } : configOf(table, other))),
};

/**
 * Unlabelled candidates from a small value range: negatives, zeros, plateaus, increases and valid tables all
 * occur. Whether one is valid is decided by the oracle in the test, which makes the accept/reject rule an
 * "if and only if" over a mixed population.
 */
export const arbRandomScoreCandidate: fc.Arbitrary<unknown> = fc
  .tuple(
    fc.array(fc.integer({ min: -1, max: 3 }), { minLength: 0, maxLength: 5 }),
    fc.integer({ min: -1, max: 3 }),
  )
  .map(([table, bonus]) => configOf(table, bonus));

// ---------------------------------------------------------------------------------------------------------
// Guesses and Hidden_Sums
// ---------------------------------------------------------------------------------------------------------

/** A Hidden_Sum: the sum of 4 distinct cards, 4 to 52. */
export const arbHiddenSum: fc.Arbitrary<number> = fc.integer({ min: 4, max: 52 });

export const GUESS_INPUT_KINDS = [
  "VALID_INTEGER", // integer in [4, 52]
  "INTEGER_BELOW_RANGE", // integer < 4, including 0 and -0
  "INTEGER_ABOVE_RANGE", // integer > 52, including very large integers
  "FRACTION_IN_RANGE", // non-integer number between 4 and 52
  "FRACTION_OUT_OF_RANGE", // non-integer number outside [4, 52] (precedence: not an integer wins)
  "NAN", // NaN
  "INFINITY", // +Infinity or -Infinity
  "STRING", // any string, including the decimal text of a valid integer
  "NULLISH", // null or undefined
  "BOOLEAN", // true or false
  "OBJECT", // plain objects and boxed numbers
  "ARRAY", // arrays, including [10]
  "BIGINT", // bigint, including 10n
  "OTHER", // symbol and function
] as const;

export type GuessInputKind = (typeof GUESS_INPUT_KINDS)[number];

const isFraction = (v: number): boolean => Number.isFinite(v) && !Number.isInteger(v);

export const arbGuessInputOfKind: Readonly<Record<GuessInputKind, fc.Arbitrary<unknown>>> = {
  VALID_INTEGER: fc.integer({ min: 4, max: 52 }),

  INTEGER_BELOW_RANGE: fc.oneof(
    fc.integer({ min: -1000, max: 3 }),
    fc.constantFrom(0, -0, 3, -1, Number.MIN_SAFE_INTEGER, -Number.MAX_VALUE),
  ),

  INTEGER_ABOVE_RANGE: fc.oneof(
    fc.integer({ min: 53, max: 1000 }),
    fc.constantFrom(53, 100, Number.MAX_SAFE_INTEGER, 2 ** 53, Number.MAX_VALUE),
  ),

  FRACTION_IN_RANGE: fc.oneof(
    fc.tuple(fc.integer({ min: 4, max: 51 }), fc.constantFrom(0.5, 0.25, 0.001, 0.999)).map(([n, f]) => n + f),
    fc.double({ min: 4, max: 52, noNaN: true }).filter(isFraction),
  ),

  FRACTION_OUT_OF_RANGE: fc.oneof(
    fc.constantFrom(60.5, 3.5, -0.5, 52.0001, 3.9999, 0.1),
    fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }).filter((v) => isFraction(v) && (v < 4 || v > 52)),
  ),

  NAN: fc.constant(Number.NaN),

  INFINITY: fc.constantFrom(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),

  STRING: fc.oneof(
    fc.string({ maxLength: 12 }),
    fc.integer({ min: 4, max: 52 }).map((n) => String(n)),
    fc.constantFrom("10", " 10", "10 ", "1e1", "0x10", "10.0", "NaN", "Infinity"),
  ),

  NULLISH: fc.constantFrom<unknown>(null, undefined),

  BOOLEAN: fc.boolean(),

  OBJECT: fc.oneof(
    fc.constant<unknown>({}),
    fc.constant<unknown>({ valueOf: 10 }),
    fc.integer({ min: 4, max: 52 }).map((n) => new Number(n)),
    fc.dictionary(fc.string({ maxLength: 4 }), fc.integer({ min: 4, max: 52 }), { maxKeys: 3 }),
  ),

  ARRAY: fc.oneof(
    fc.constant<unknown>([]),
    fc.integer({ min: 4, max: 52 }).map((n) => [n]),
    fc.array(fc.integer({ min: 4, max: 52 }), { minLength: 0, maxLength: 4 }),
  ),

  BIGINT: fc.oneof(fc.constantFrom(10n, 0n, -1n, 52n), fc.bigInt({ min: -1000n, max: 1000n })),

  OTHER: fc.constantFrom<unknown>(Symbol("guess"), () => 10),
};

// ---------------------------------------------------------------------------------------------------------
// Score vectors for the four Seats
// ---------------------------------------------------------------------------------------------------------

/** The four Seats in seat order. */
export const SEAT_ORDER: readonly PlayerId[] = ["P0", "P1", "P2", "P3"];

export type ScoreVector = readonly [number, number, number, number];

const arbScoreValue: fc.Arbitrary<number> = fc.oneof(
  { weight: 4, arbitrary: fc.integer({ min: -3, max: 12 }) },
  { weight: 1, arbitrary: fc.constantFrom(0, -0, 0.5, 1.5, 2.25, -0.5, 1e-9, 100.125) },
  { weight: 1, arbitrary: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }) },
);

/**
 * Four scores with many ties. Branches:
 * - pooled: draws 1 to 4 pool values and lets each Seat pick one, so every pattern of equal scores occurs;
 * - distinct: four different integers;
 * - all equal;
 * - zero signs: only 0, -0, 1, -1, so 0 and -0 meet on different Seats;
 * - game-like: non-negative integers 0 to 6.
 */
export const arbScoreVector: fc.Arbitrary<ScoreVector> = fc.oneof(
  fc
    .tuple(fc.array(arbScoreValue, { minLength: 1, maxLength: 4 }), fc.tuple(fc.nat(3), fc.nat(3), fc.nat(3), fc.nat(3)))
    .map(([pool, picks]): ScoreVector => {
      const at = (i: number): number => pool[i % pool.length] as number;
      return [at(picks[0]), at(picks[1]), at(picks[2]), at(picks[3])];
    }),
  fc
    .uniqueArray(fc.integer({ min: -100, max: 100 }), { minLength: 4, maxLength: 4 })
    .map((v): ScoreVector => [v[0] as number, v[1] as number, v[2] as number, v[3] as number]),
  arbScoreValue.map((v): ScoreVector => [v, v, v, v]),
  fc.tuple(
    fc.constantFrom(0, -0, 1, -1),
    fc.constantFrom(0, -0, 1, -1),
    fc.constantFrom(0, -0, 1, -1),
    fc.constantFrom(0, -0, 1, -1),
  ),
  fc.tuple(fc.nat(6), fc.nat(6), fc.nat(6), fc.nat(6)),
);

/** A permutation of the indexes 0..3 (which score goes to which Seat), and an order in which to insert the keys. */
export const arbSeatPermutation: fc.Arbitrary<number[]> = fc.shuffledSubarray([0, 1, 2, 3], { minLength: 4, maxLength: 4 });
