// Property tests for scoring, guess validation and ranking (task 6.3): Properties 15, 16 and 20 of
// .kiro/specs/qroker-playable-game/design.md. Requirements 7.2, 8.1, 8.2, 8.3, 9.4, 9.5.
//
// Each property is ONE test with ONE fc.assert, a fixed seed and at least 200 runs, so a run is reproducible.
// On failure fast-check prints the seed, the shrunk counterexample and the replay path.
//
// All oracles are written here, independent of the modules under test:
// - Property 15: `oracleScore` reads the table with its own search for the index, `violatedRules` states the
//   rules of requirement 8.3 one by one over any value, and every candidate carries the label of the rule it was
//   built to violate; the test checks that the label is true (the rule is among the violated ones) before it checks
//   `validateScoreConfig`.
// - Property 16: `oracleGuess` decides with `Math.floor` and finiteness instead of `Number.isInteger`.
// - Property 20: `oracleRank` counts strictly higher scores over its own copy of the four values.
//
// Coverage assertions at the end of each test fail the run if a case class was not reached, so a property cannot
// pass vacuously. Observed hit rates are stated in the HIT-RATES comments above them.
//
// No numeric value of the provisional placeholder configuration is asserted anywhere in this file.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEV_PLACEHOLDER_SCORE_CONFIG, score, validateGuess, validateScoreConfig } from "./score";
import { rankPlayers } from "./ranking";
import type { RankEntry } from "./ranking";
import type { PlayerId, ScoreConfig } from "./types";
import {
  arbGuessInputOfKind,
  arbHiddenSum,
  arbInvalidScoreConfigOfKind,
  arbRandomScoreCandidate,
  arbScoreVector,
  arbSeatPermutation,
  arbValidScoreConfig,
  GUESS_INPUT_KINDS,
  INVALID_SCORE_KINDS,
  SEAT_ORDER,
} from "./testing/score-generators";
import type { GuessInputKind, InvalidScoreKind } from "./testing/score-generators";

const SEED_P15 = 20260515;
const SEED_P16 = 20260516;
const SEED_P20 = 20260520;
const RUNS_P15 = 600;
const RUNS_P16 = 500;
const RUNS_P20 = 400;

const pct = (n: number, total: number): string => `${((100 * n) / total).toFixed(1)}%`;

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Reflect.ownKeys(value)) deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  }
  return value;
}

// ---------------------------------------------------------------------------------------------------------
// Property 15
// ---------------------------------------------------------------------------------------------------------

/** The rules of requirement 8.3, one name per rule. */
type Rule =
  | "not-object"
  | "table-not-array"
  | "table-empty"
  | "entry-not-finite-number"
  | "entry-negative"
  | "first-not-positive"
  | "table-increases"
  | "bonus-not-finite-number"
  | "bonus-negative";

/** The rule each rejection kind of the generator is built to violate. */
const RULE_OF_KIND: Readonly<Record<InvalidScoreKind, Rule>> = {
  NOT_OBJECT: "not-object",
  TABLE_NOT_ARRAY: "table-not-array",
  TABLE_EMPTY: "table-empty",
  ENTRY_NEGATIVE: "entry-negative",
  ENTRY_NAN: "entry-not-finite-number",
  ENTRY_INFINITY: "entry-not-finite-number",
  ENTRY_WRONG_TYPE: "entry-not-finite-number",
  FIRST_NOT_POSITIVE: "first-not-positive",
  TABLE_INCREASES: "table-increases",
  BONUS_NEGATIVE: "bonus-negative",
  BONUS_NON_FINITE: "bonus-not-finite-number",
  BONUS_WRONG_TYPE: "bonus-not-finite-number",
};

/** Every rule that `candidate` violates. Empty exactly for the configurations requirement 8.3 accepts. */
function violatedRules(candidate: unknown): Set<Rule> {
  const out = new Set<Rule>();
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    out.add("not-object");
    return out;
  }
  const record = candidate as Record<string, unknown>;
  const table = record["rewardByError"];
  if (!Array.isArray(table)) {
    out.add("table-not-array");
  } else {
    if (table.length === 0) out.add("table-empty");
    const entries: unknown[] = [];
    for (let i = 0; i < table.length; i++) entries.push(table[i]);
    for (const v of entries) {
      if (typeof v !== "number" || !Number.isFinite(v)) out.add("entry-not-finite-number");
      else if (v < 0) out.add("entry-negative");
    }
    const first = entries[0];
    if (typeof first === "number" && !(first > 0)) out.add("first-not-positive");
    for (let i = 1; i < entries.length; i++) {
      const before = entries[i - 1];
      const here = entries[i];
      if (typeof before === "number" && typeof here === "number" && here > before) out.add("table-increases");
    }
  }
  const bonus = record["handEmptyBonus"];
  if (typeof bonus !== "number" || !Number.isFinite(bonus)) out.add("bonus-not-finite-number");
  else if (bonus < 0) out.add("bonus-negative");
  return out;
}

/** Expected score by reading the table with a search for the index, not by indexing. */
function oracleScore(guess: number, hidden: number, table: readonly number[]): number {
  const error = guess > hidden ? guess - hidden : hidden - guess;
  for (let k = 0; k < table.length; k++) if (k === error) return table[k] as number;
  return 0;
}

type CandidateLabel = "VALID" | "RANDOM" | InvalidScoreKind;

interface Candidate {
  readonly label: CandidateLabel;
  readonly value: unknown;
}

const label = (tag: CandidateLabel) => (value: unknown): Candidate => ({ label: tag, value });

/** Valid configurations (weight 8), each rejection kind (weight 1 each) and unlabelled small candidates (weight 3). */
const arbCandidate: fc.Arbitrary<Candidate> = fc.oneof(
  { weight: 8, arbitrary: arbValidScoreConfig.map(label("VALID")) },
  ...INVALID_SCORE_KINDS.map((kind) => ({ weight: 1, arbitrary: arbInvalidScoreConfigOfKind[kind].map(label(kind)) })),
  { weight: 3, arbitrary: arbRandomScoreCandidate.map(label("RANDOM")) },
);

describe("Property 15: Score function and configuration validation", () => {
  it("scores by table with symmetry, monotonicity, cutoff and no bonus; accepts exactly the valid tables and rejects every rejection kind", () => {
    // Feature: qroker-playable-game, Property 15: Score function and configuration validation
    const seen = new Map<CandidateLabel, number>();
    const tally = {
      runs: 0,
      valid: 0,
      randomValid: 0,
      randomInvalid: 0,
      plateau: 0,
      zeroTail: 0,
      cutoffReached: 0,
      noCutoff: 0,
      fractional: 0,
      singleEntry: 0,
    };

    fc.assert(
      fc.property(arbCandidate, arbHiddenSum, ({ label: tag, value }, hidden) => {
        tally.runs++;
        seen.set(tag, (seen.get(tag) ?? 0) + 1);
        const problems: string[] = [];
        const ensure = (ok: boolean, message: string): void => {
          if (!ok) problems.push(message);
        };

        // The generator label is true: the rule it names is violated, and valid ones violate nothing.
        const violated = violatedRules(value);
        if (tag === "VALID") ensure(violated.size === 0, `VALID candidate violates ${[...violated].join(",")}`);
        else if (tag !== "RANDOM") ensure(violated.has(RULE_OF_KIND[tag]), `${tag} does not violate ${RULE_OF_KIND[tag]}`);
        const expectValid = violated.size === 0;

        // validateScoreConfig accepts if and only if no rule is violated; the input is frozen and stays unchanged.
        deepFreeze(value);
        const before = structuredClone(value);
        const verdict = validateScoreConfig(value);
        ensure(verdict.ok === expectValid, `validateScoreConfig ok=${String(verdict.ok)}, rules violated: ${[...violated].join(",") || "none"}`);
        if (!verdict.ok) ensure(verdict.error.code === "INVALID_SCORE_CONFIG", `error code ${verdict.error.code}`);
        expect(value, "validateScoreConfig left its input unchanged").toStrictEqual(before);
        if (verdict.ok && expectValid) expect(verdict.value, "accepted configuration is returned unchanged").toStrictEqual(before);
        if (tag === "RANDOM") tally[expectValid ? "randomValid" : "randomInvalid"]++;

        if (expectValid) {
          const config = value as ScoreConfig;
          const table = config.rewardByError;
          tally.valid++;
          if (table.some((v, i) => i > 0 && v === table[i - 1])) tally.plateau++;
          if (table.length > 1 && table[table.length - 1] === 0) tally.zeroTail++;
          if (Math.max(hidden - 4, 52 - hidden) >= table.length) tally.cutoffReached++;
          if (table.length >= 49) tally.noCutoff++;
          if (table.some((v) => !Number.isInteger(v))) tally.fractional++;
          if (table.length === 1) tally.singleEntry++;

          // No completion bonus: the function takes (guess, hiddenSum, config) and nothing else, and the
          // hand-empty bonus of the configuration has no effect on a prediction score.
          ensure(score.length === 3, `score takes ${score.length} parameters`);
          const otherBonus: ScoreConfig = { rewardByError: table, handEmptyBonus: config.handEmptyBonus + 7 };

          // Every guess in range against this Hidden_Sum.
          const byGuess = new Map<number, number>();
          for (let guess = 4; guess <= 52; guess++) {
            const got = score(guess, hidden, config);
            byGuess.set(guess, got);
            const want = oracleScore(guess, hidden, table);
            ensure(Object.is(got, want), `score(${guess}, ${hidden}) = ${got}, table says ${want}`);
            ensure(got >= 0 && Number.isFinite(got), `score(${guess}, ${hidden}) = ${got} is not finite and non-negative`);
            ensure(Math.abs(guess - hidden) < table.length || got === 0, `score beyond the table length is ${got}`);
            ensure(score(guess, hidden, otherBonus) === got, `score(${guess}, ${hidden}) depends on handEmptyBonus`);
          }
          const at = (guess: number): number => byGuess.get(guess) as number;

          // Exact guess gives the table's first value, the maximum of all guesses.
          ensure(at(hidden) === table[0], `score of the exact guess ${at(hidden)} is not the first entry ${String(table[0])}`);
          ensure([...byGuess.values()].every((v) => v <= at(hidden)), "a guess scores more than the exact guess");

          // Symmetry and monotonicity in the absolute error, on both sides of the Hidden_Sum.
          for (let e = 0; hidden + e <= 52 || hidden - e >= 4; e++) {
            const up = hidden + e;
            const down = hidden - e;
            if (up <= 52 && down >= 4) ensure(at(up) === at(down), `score(${up}) != score(${down}) for hidden ${hidden}`);
            if (up + 1 <= 52) ensure(at(up + 1) <= at(up), `score rises from error ${e} to ${e + 1} above`);
            if (down - 1 >= 4) ensure(at(down - 1) <= at(down), `score rises from error ${e} to ${e + 1} below`);
          }
          ensure(score(hidden, hidden, config) === score(hidden, hidden, config), "score is deterministic");
          ensure(
            (score as (...args: unknown[]) => number)(hidden, hidden, config, 999) === at(hidden),
            "an extra argument changed the score",
          );
        }

        expect(problems, `candidate ${tag}`).toEqual([]);
      }),
      { seed: SEED_P15, numRuns: RUNS_P15 },
    );

    // HIT-RATES (seed 20260515, 600 runs): valid configurations 198 (33.0%), each of the 12 rejection kinds 18 to 34
    // times, unlabelled candidates 66 (10 valid, 56 invalid). Of the 208 valid configurations scored: plateau 177,
    // zero tail 182, cutoff reached 187, no cutoff possible (length >= 49) 21, fractional values 137, single entry 7.
    // The thresholds below are well under these values.
    const n = tally.runs;
    expect(n, "property executed numRuns times").toBe(RUNS_P15);
    // Every rejection kind, the valid population and the unlabelled population each occurred.
    for (const kind of INVALID_SCORE_KINDS) {
      expect(seen.get(kind) ?? 0, `rejection kind ${kind} occurred`).toBeGreaterThanOrEqual(10);
    }
    expect(seen.get("VALID") ?? 0, "valid configurations").toBeGreaterThanOrEqual(0.2 * n);
    expect(seen.get("RANDOM") ?? 0, "unlabelled candidates").toBeGreaterThanOrEqual(0.05 * n);
    expect(tally.randomValid, "unlabelled candidates that are valid").toBeGreaterThanOrEqual(3);
    expect(tally.randomInvalid, "unlabelled candidates that are invalid").toBeGreaterThanOrEqual(3);
    // The score checks ran on a varied valid population.
    expect(tally.valid, `valid configurations scored ${pct(tally.valid, n)}`).toBeGreaterThanOrEqual(100);
    expect(tally.plateau, "tables with a plateau").toBeGreaterThanOrEqual(10);
    expect(tally.zeroTail, "tables ending in zero").toBeGreaterThanOrEqual(10);
    expect(tally.cutoffReached, "runs where the reward range cutoff applies").toBeGreaterThanOrEqual(50);
    expect(tally.noCutoff, "tables longer than every possible error").toBeGreaterThanOrEqual(1);
    expect(tally.fractional, "tables with fractional values").toBeGreaterThanOrEqual(10);
    expect(tally.singleEntry, "single-entry tables").toBeGreaterThanOrEqual(1);
  });

  it("accepts the development placeholder configuration and marks it provisional", () => {
    // Example assertion, no numeric value of the placeholder is checked.
    expect(DEV_PLACEHOLDER_SCORE_CONFIG.provisional).toBe(true);
    const verdict = validateScoreConfig(DEV_PLACEHOLDER_SCORE_CONFIG.config);
    expect(verdict.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Property 16
// ---------------------------------------------------------------------------------------------------------

type Outcome = "ok" | "GUESS_NOT_INTEGER" | "GUESS_OUT_OF_RANGE";

/** Expected verdict for any value, decided without `Number.isInteger`. */
function oracleGuess(value: unknown): Outcome {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.floor(value) !== value) return "GUESS_NOT_INTEGER";
  return value >= 4 && value <= 52 ? "ok" : "GUESS_OUT_OF_RANGE";
}

/** The verdict each generator kind is built to produce. */
const OUTCOME_OF_KIND: Readonly<Record<GuessInputKind, Outcome>> = {
  VALID_INTEGER: "ok",
  INTEGER_BELOW_RANGE: "GUESS_OUT_OF_RANGE",
  INTEGER_ABOVE_RANGE: "GUESS_OUT_OF_RANGE",
  FRACTION_IN_RANGE: "GUESS_NOT_INTEGER",
  FRACTION_OUT_OF_RANGE: "GUESS_NOT_INTEGER",
  NAN: "GUESS_NOT_INTEGER",
  INFINITY: "GUESS_NOT_INTEGER",
  STRING: "GUESS_NOT_INTEGER",
  NULLISH: "GUESS_NOT_INTEGER",
  BOOLEAN: "GUESS_NOT_INTEGER",
  OBJECT: "GUESS_NOT_INTEGER",
  ARRAY: "GUESS_NOT_INTEGER",
  BIGINT: "GUESS_NOT_INTEGER",
  OTHER: "GUESS_NOT_INTEGER",
};

const arbGuessInput: fc.Arbitrary<{ kind: GuessInputKind; value: unknown }> = fc.oneof(
  ...GUESS_INPUT_KINDS.map((kind) => ({
    weight: kind === "VALID_INTEGER" ? 3 : 1,
    arbitrary: arbGuessInputOfKind[kind].map((value) => ({ kind, value })),
  })),
);

describe("Property 16: Guess validation", () => {
  it("accepts exactly the integers 4 to 52 and names GUESS_NOT_INTEGER before GUESS_OUT_OF_RANGE for everything else", () => {
    // Feature: qroker-playable-game, Property 16: Guess validation
    const seen = new Map<GuessInputKind, number>();
    let runs = 0;
    let accepted = 0;
    let precedence = 0; // non-integer outside [4, 52] (as a number): not an integer must win

    fc.assert(
      fc.property(arbGuessInput, ({ kind, value }) => {
        runs++;
        seen.set(kind, (seen.get(kind) ?? 0) + 1);
        const want = oracleGuess(value);
        // The generator label is true.
        expect(want, `kind ${kind}`).toBe(OUTCOME_OF_KIND[kind]);

        const got = validateGuess(value);
        if (want === "ok") {
          accepted++;
          expect(got.ok, `accepts ${fc.stringify(value)}`).toBe(true);
          if (got.ok) expect(Object.is(got.value, value), "returns the same value").toBe(true);
        } else {
          expect(got.ok, `rejects ${fc.stringify(value)}`).toBe(false);
          if (!got.ok) expect(got.error.code, `code for ${kind}`).toBe(want);
        }
        if (kind === "FRACTION_OUT_OF_RANGE") precedence++;
      }),
      { seed: SEED_P16, numRuns: RUNS_P16 },
    );

    // HIT-RATES (seed 20260516, 500 runs): each of the 14 input kinds 22 to 93 times, accepted 93 (18.6%), non-integers
    // outside [4, 52] 33. The thresholds below are well under these values.
    expect(runs, "property executed numRuns times").toBe(RUNS_P16);
    // No vacuous pass: every kind of input was drawn, and both outcomes of the integer branch occur.
    for (const kind of GUESS_INPUT_KINDS) {
      expect(seen.get(kind) ?? 0, `input kind ${kind} occurred`).toBeGreaterThanOrEqual(10);
    }
    expect(accepted, `accepted ${pct(accepted, runs)}`).toBeGreaterThanOrEqual(0.1 * runs);
    expect(precedence, "non-integers outside the range").toBeGreaterThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Property 20
// ---------------------------------------------------------------------------------------------------------

type Scores = Record<PlayerId, number>;

/** rank = 1 + number of strictly higher scores, over the four values in seat order. */
function oracleRank(values: readonly number[], index: number): number {
  let higher = 0;
  for (const other of values) if (other > (values[index] as number)) higher++;
  return 1 + higher;
}

/** Scores object whose keys are inserted in `keyOrder` (indexes into seat order). */
function scoresObject(values: readonly number[], keyOrder: readonly number[]): Scores {
  const out: Partial<Scores> = {};
  for (const k of keyOrder) out[SEAT_ORDER[k] as PlayerId] = values[k] as number;
  return out as Scores;
}

const NATURAL_ORDER: readonly number[] = [0, 1, 2, 3];

const arbRankCase = fc.tuple(arbScoreVector, arbSeatPermutation, arbSeatPermutation);

describe("Property 20: Ranking", () => {
  it("gives competition ranks (1 + strictly higher scores), equal ranks to equal scores, rank 1 to a best seat, sorted output, regardless of key order and seat permutation", () => {
    // Feature: qroker-playable-game, Property 20: Ranking
    const distinct: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const tally = { runs: 0, negative: 0, fraction: 0, zeroSigns: 0, keyOrderChanged: 0, seatsPermuted: 0, gap: 0 };

    fc.assert(
      fc.property(arbRankCase, ([vector, seatPermutation, keyOrder]) => {
        tally.runs++;
        const values: readonly number[] = [...vector];
        const problems: string[] = [];
        const ensure = (ok: boolean, message: string): void => {
          if (!ok) problems.push(message);
        };

        // The same scores in natural key order (A), in a shuffled key order (C), and moved to other seats (B).
        const a = deepFreeze(scoresObject(values, NATURAL_ORDER));
        const c = deepFreeze(scoresObject(values, keyOrder));
        const permuted = seatPermutation.map((from) => values[from] as number);
        const b = deepFreeze(scoresObject(permuted, NATURAL_ORDER));
        const snapshots = [a, b, c].map((s) => SEAT_ORDER.map((p) => s[p]));

        // Case statistics.
        const distinctCount = new Set(values.map((v) => (Object.is(v, -0) ? 0 : v))).size;
        distinct[distinctCount] = (distinct[distinctCount] ?? 0) + 1;
        if (values.some((v) => v < 0)) tally.negative++;
        if (values.some((v) => !Number.isInteger(v))) tally.fraction++;
        if (values.some((v) => Object.is(v, -0)) && values.some((v) => Object.is(v, 0))) tally.zeroSigns++;
        if (Object.keys(c).join() !== Object.keys(a).join()) tally.keyOrderChanged++;
        if (seatPermutation.some((from, to) => from !== to) && new Set(values).size > 1) tally.seatsPermuted++;

        const resultA = rankPlayers(a);
        const resultB = rankPlayers(b);
        const resultC = rankPlayers(c);

        const check = (name: string, scores: readonly number[], result: readonly RankEntry[]): void => {
          ensure(result.length === 4, `${name}: ${result.length} entries`);
          ensure(new Set(result.map((e) => e.player)).size === 4, `${name}: seats not all present once`);
          const seatIndex = (e: RankEntry): number => SEAT_ORDER.indexOf(e.player);
          // Each entry: the given score, bit for bit, and the competition rank.
          for (const e of result) {
            const i = seatIndex(e);
            ensure(Object.is(e.score, scores[i]), `${name}: ${e.player} carries score ${e.score}, given ${String(scores[i])}`);
            ensure(e.rank === oracleRank(scores, i), `${name}: ${e.player} has rank ${e.rank}, oracle ${oracleRank(scores, i)}`);
          }
          // At least one seat has rank 1, and no rank is below 1.
          ensure(result.some((e) => e.rank === 1), `${name}: no seat has rank 1`);
          ensure(result.every((e) => Number.isInteger(e.rank) && e.rank >= 1 && e.rank <= 4), `${name}: rank outside 1..4`);
          // Order: by rank, then by seat.
          for (let k = 1; k < result.length; k++) {
            const before = result[k - 1] as RankEntry;
            const here = result[k] as RankEntry;
            ensure(
              before.rank < here.rank || (before.rank === here.rank && seatIndex(before) < seatIndex(here)),
              `${name}: ${before.player}(${before.rank}) before ${here.player}(${here.rank}) breaks rank-then-seat order`,
            );
          }
          // Competition numbering read from the sorted output: the first entry is 1, an entry with the same score as
          // its predecessor shares its rank, any other entry has rank = its 1-based position (gaps follow ties).
          result.forEach((e, position) => {
            const previous = position > 0 ? (result[position - 1] as RankEntry) : undefined;
            const expected = previous !== undefined && previous.score === e.score ? previous.rank : position + 1;
            ensure(e.rank === expected, `${name}: position ${position + 1} has rank ${e.rank}, expected ${expected}`);
          });
          // Pairwise: equal scores share a rank (no tiebreak ever separates them), a higher score has a lower rank.
          for (const x of result) {
            for (const y of result) {
              if (x.score === y.score) ensure(x.rank === y.rank, `${name}: equal scores ${x.player}/${y.player} have ranks ${x.rank}/${y.rank}`);
              if (x.score > y.score) ensure(x.rank < y.rank, `${name}: higher score ${x.player} does not rank above ${y.player}`);
            }
          }
          // A group of k seats strictly above a seat gives it rank k + 1, and the ranks that occur are exactly the
          // positions at which a new score value starts.
          const starts = new Set(result.filter((e, position) => position === 0 || (result[position - 1] as RankEntry).score !== e.score).map((e) => e.rank));
          ensure(new Set(result.map((e) => e.rank)).size === starts.size, `${name}: ranks do not start at group starts`);
          // Results are frozen.
          ensure(Object.isFrozen(result) && result.every((e) => Object.isFrozen(e)), `${name}: result not frozen`);
        };
        check("A", values, resultA);
        check("B", permuted, resultB);
        check("C", values, resultC);
        if (resultA.some((e, i) => i > 0 && e.rank > (resultA[i - 1] as RankEntry).rank + 1)) tally.gap++;

        // Key order does not matter: the shuffled-key input gives the same result as the natural one, and calling
        // again gives the same result (deterministic).
        expect(resultC, "key order changed the result").toStrictEqual(resultA);
        expect(rankPlayers(a), "second call differs").toStrictEqual(resultA);

        // Seat permutation: moving scores between seats moves ranks with them; equal scores keep equal ranks.
        const rankIn = (result: readonly RankEntry[], seat: number): number =>
          (result.find((e) => e.player === SEAT_ORDER[seat]) as RankEntry).rank;
        permuted.forEach((_, to) => {
          const from = seatPermutation[to] as number;
          ensure(rankIn(resultB, to) === rankIn(resultA, from), `seat ${to} (from ${from}): rank ${rankIn(resultB, to)} != ${rankIn(resultA, from)}`);
        });

        // Inputs unchanged, bit for bit.
        [a, b, c].forEach((s, i) => {
          ensure(SEAT_ORDER.every((p, k) => Object.is(s[p], (snapshots[i] as number[])[k])), `input ${i} changed`);
        });

        expect(problems).toEqual([]);
      }),
      { seed: SEED_P20, numRuns: RUNS_P20 },
    );

    // HIT-RATES (seed 20260520, 400 runs): 1 / 2 / 3 / 4 distinct scores in 88 / 115 / 80 / 117 runs, a negative score 189,
    // a fraction 54, 0 together with -0 36, shuffled key order 393, seats permuted 297, a gap after a tie 140.
    // The thresholds below are well under these values.
    const n = tally.runs;
    expect(n, "property executed numRuns times").toBe(RUNS_P20);
    // No vacuous pass: every tie pattern, signs, fractions and both reorderings occurred.
    for (const k of [1, 2, 3, 4]) expect(distinct[k] ?? 0, `vectors with ${k} distinct scores`).toBeGreaterThanOrEqual(10);
    expect(tally.negative, "vectors with a negative score").toBeGreaterThanOrEqual(10);
    expect(tally.fraction, "vectors with a fractional score").toBeGreaterThanOrEqual(10);
    expect(tally.zeroSigns, "vectors holding both 0 and -0").toBeGreaterThanOrEqual(3);
    expect(tally.keyOrderChanged, "inputs with a shuffled key order").toBeGreaterThanOrEqual(0.5 * n);
    expect(tally.seatsPermuted, "seat permutations that move distinct scores").toBeGreaterThanOrEqual(0.5 * n);
    expect(tally.gap, "rankings with a gap after a tie").toBeGreaterThanOrEqual(10);
  });
});
