// Unit tests for core/score.ts (task 6.1). Requirements 7.2, 8.1, 8.3, 8.4, 8.5.
//
// Expectations are derived from the configuration passed in, never from the provisional placeholder
// values. Only the two placeholder tests below read DEV_PLACEHOLDER_SCORE_CONFIG.
import { describe, expect, it } from "vitest";
import {
  DEV_PLACEHOLDER_SCORE_CONFIG,
  GUESS_MAX,
  GUESS_MIN,
  RULES_VERSION,
  score,
  validateGuess,
  validateScoreConfig,
} from "./score";
import type { ScoreConfig } from "./types";

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

// A custom valid table, deliberately different from the placeholder, with a flat step and a zero tail.
const CUSTOM_TABLE: readonly number[] = [10, 7, 7, 5, 0];
const CUSTOM: ScoreConfig = { rewardByError: CUSTOM_TABLE, handEmptyBonus: 2.5 };

// Independent reference scorer: linear lookup that never indexes the table with the error.
function referenceScore(table: readonly number[], guess: number, hidden: number): number {
  let reward = 0;
  table.forEach((value, index) => {
    if (index === Math.max(guess, hidden) - Math.min(guess, hidden)) reward = value;
  });
  return reward;
}

const cfgWith = (patch: Record<string, unknown>): unknown => ({ ...CUSTOM, ...patch });

describe("RULES_VERSION", () => {
  it("is a positive integer", () => {
    expect(Number.isInteger(RULES_VERSION)).toBe(true);
    expect(RULES_VERSION).toBeGreaterThan(0);
  });
});

describe("DEV_PLACEHOLDER_SCORE_CONFIG", () => {
  it("passes validateScoreConfig", () => {
    const result = validateScoreConfig(DEV_PLACEHOLDER_SCORE_CONFIG.config);
    expect(result.ok).toBe(true);
  });

  it("is flagged provisional and named", () => {
    expect(DEV_PLACEHOLDER_SCORE_CONFIG.provisional).toBe(true);
    expect(DEV_PLACEHOLDER_SCORE_CONFIG.id).toBe("DEV_PLACEHOLDER");
  });
});

describe("validateScoreConfig", () => {
  it("accepts a valid custom config and returns the same object", () => {
    const result = validateScoreConfig(CUSTOM);
    expect(result).toEqual({ ok: true, value: CUSTOM });
    if (result.ok) expect(result.value).toBe(CUSTOM);
  });

  it("accepts equal neighbours, a zero tail, a zero bonus and a single positive entry", () => {
    expect(validateScoreConfig({ rewardByError: [3, 3, 3], handEmptyBonus: 0 }).ok).toBe(true);
    expect(validateScoreConfig({ rewardByError: [1], handEmptyBonus: 0 }).ok).toBe(true);
    expect(validateScoreConfig({ rewardByError: [2, 0, 0], handEmptyBonus: 1 }).ok).toBe(true);
  });

  it("accepts non-integer finite entries (design requires only finite and non-negative)", () => {
    expect(validateScoreConfig({ rewardByError: [1.5, 0.25], handEmptyBonus: 0.5 }).ok).toBe(true);
  });

  const invalidConfigs: [string, unknown, RegExp][] = [
    ["empty table", { rewardByError: [], handEmptyBonus: 1 }, /empty/],
    ["negative entry", { rewardByError: [5, 3, -1], handEmptyBonus: 1 }, /negative/],
    ["negative first entry", { rewardByError: [-1], handEmptyBonus: 1 }, /negative/],
    ["increasing table", { rewardByError: [5, 3, 4], handEmptyBonus: 1 }, /increase/],
    ["increasing from zero", { rewardByError: [0, 1], handEmptyBonus: 1 }, /(increase|greater than 0)/],
    ["first value 0", { rewardByError: [0, 0], handEmptyBonus: 1 }, /greater than 0/],
    ["single zero entry", { rewardByError: [0], handEmptyBonus: 1 }, /greater than 0/],
    ["NaN entry", { rewardByError: [5, Number.NaN], handEmptyBonus: 1 }, /finite/],
    ["NaN first entry", { rewardByError: [Number.NaN], handEmptyBonus: 1 }, /finite/],
    ["Infinity entry", { rewardByError: [Number.POSITIVE_INFINITY], handEmptyBonus: 1 }, /finite/],
    ["-Infinity entry", { rewardByError: [5, Number.NEGATIVE_INFINITY], handEmptyBonus: 1 }, /finite/],
    ["string entry", { rewardByError: [5, "3"], handEmptyBonus: 1 }, /finite/],
    ["null entry", { rewardByError: [5, null], handEmptyBonus: 1 }, /finite/],
    // eslint-disable-next-line no-sparse-arrays
    ["sparse array", { rewardByError: [5, , 3], handEmptyBonus: 1 }, /finite/],
    ["negative bonus", { rewardByError: [5, 3], handEmptyBonus: -1 }, /handEmptyBonus/],
    ["NaN bonus", { rewardByError: [5, 3], handEmptyBonus: Number.NaN }, /handEmptyBonus/],
    ["Infinity bonus", { rewardByError: [5, 3], handEmptyBonus: Number.POSITIVE_INFINITY }, /handEmptyBonus/],
    ["string bonus", { rewardByError: [5, 3], handEmptyBonus: "3" }, /handEmptyBonus/],
    ["missing bonus", { rewardByError: [5, 3] }, /handEmptyBonus/],
    ["missing table", { handEmptyBonus: 1 }, /rewardByError/],
    ["non-array table", { rewardByError: "5,3", handEmptyBonus: 1 }, /rewardByError/],
    ["object table", { rewardByError: { 0: 5, length: 1 }, handEmptyBonus: 1 }, /rewardByError/],
    ["empty object", {}, /rewardByError/],
    ["null", null, /object/],
    ["undefined", undefined, /object/],
    ["number", 7, /object/],
    ["string", "config", /object/],
    ["array", [5, 3], /object/],
  ];

  it.each(invalidConfigs)("rejects %s with INVALID_SCORE_CONFIG and a detail", (_name, value, detail) => {
    const result = validateScoreConfig(value);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_SCORE_CONFIG");
      expect(result.error.detail).toMatch(detail);
    }
  });

  it("does not mutate a deep-frozen config", () => {
    const frozen = deepFreeze({ rewardByError: [9, 5, 5, 1], handEmptyBonus: 4 });
    const snapshot = JSON.stringify(frozen);
    expect(validateScoreConfig(frozen).ok).toBe(true);
    expect(JSON.stringify(frozen)).toBe(snapshot);
    const bad = deepFreeze({ rewardByError: [1, 2], handEmptyBonus: 4 });
    expect(validateScoreConfig(bad).ok).toBe(false);
    expect(bad.rewardByError).toEqual([1, 2]);
  });
});

describe("score", () => {
  const length = CUSTOM_TABLE.length;
  const hidden = 30;

  it("returns rewardByError[0] for an exact guess", () => {
    expect(score(hidden, hidden, CUSTOM)).toBe(CUSTOM_TABLE[0]);
  });

  it("reads the table at the error for every index", () => {
    for (let e = 0; e < length; e++) expect(score(hidden + e, hidden, CUSTOM)).toBe(CUSTOM_TABLE[e]);
  });

  it("handles the boundary errors length - 1, length and length + 1", () => {
    expect(score(hidden + length - 1, hidden, CUSTOM)).toBe(CUSTOM_TABLE[length - 1]);
    expect(score(hidden + length, hidden, CUSTOM)).toBe(0);
    expect(score(hidden + length + 1, hidden, CUSTOM)).toBe(0);
    expect(score(hidden - length, hidden, CUSTOM)).toBe(0);
    expect(score(hidden - length - 1, hidden, CUSTOM)).toBe(0);
  });

  it("uses the last non-zero entry at e = length - 1 of a table with a positive tail", () => {
    const tail: ScoreConfig = { rewardByError: [4, 2, 1], handEmptyBonus: 0 };
    expect(score(10, 10, tail)).toBe(4);
    expect(score(12, 10, tail)).toBe(1);
    expect(score(13, 10, tail)).toBe(0);
    expect(score(14, 10, tail)).toBe(0);
  });

  it("is symmetric: guess = hidden + e and hidden - e score the same", () => {
    for (let e = 0; e <= 10; e++) {
      expect(score(hidden + e, hidden, CUSTOM)).toBe(score(hidden - e, hidden, CUSTOM));
    }
  });

  it("matches an independent reference scorer over all guesses and hidden sums in 4..52", () => {
    for (let h = GUESS_MIN; h <= GUESS_MAX; h++) {
      for (let g = GUESS_MIN; g <= GUESS_MAX; g++) {
        expect(score(g, h, CUSTOM)).toBe(referenceScore(CUSTOM_TABLE, g, h));
      }
    }
  });

  it("covers a maximum error of 48 for guesses and hidden sums in 4..52", () => {
    expect(Math.abs(GUESS_MIN - GUESS_MAX)).toBe(48);
    expect(score(GUESS_MIN, GUESS_MAX, CUSTOM)).toBe(0);
    expect(score(GUESS_MAX, GUESS_MIN, CUSTOM)).toBe(0);
    const longTable: ScoreConfig = { rewardByError: Array.from({ length: 49 }, (_, i) => 49 - i), handEmptyBonus: 0 };
    expect(score(GUESS_MIN, GUESS_MAX, longTable)).toBe(1); // e = 48 = length - 1
  });

  it("does not increase as the error grows", () => {
    for (let e = 1; e <= 48; e++) {
      expect(score(hidden + e, hidden, CUSTOM)).toBeLessThanOrEqual(score(hidden + e - 1, hidden, CUSTOM));
    }
  });

  it("returns 0 instead of reading outside the table for a non-integer error", () => {
    expect(score(30.5, 30, CUSTOM)).toBe(0);
    expect(score(Number.NaN, 30, CUSTOM)).toBe(0);
  });

  it("awards no completion bonus: the result depends only on guess, hidden sum and table", () => {
    const withBonus: ScoreConfig = { rewardByError: CUSTOM_TABLE, handEmptyBonus: 1000 };
    expect(score(hidden, hidden, withBonus)).toBe(CUSTOM_TABLE[0]);
    expect(score(hidden + 2, hidden, withBonus)).toBe(CUSTOM_TABLE[2]);
  });

  it("does not mutate a deep-frozen config", () => {
    const frozen = deepFreeze({ rewardByError: [10, 7, 7, 5, 0], handEmptyBonus: 2.5 });
    const snapshot = JSON.stringify(frozen);
    expect(score(31, 30, frozen)).toBe(7);
    expect(JSON.stringify(frozen)).toBe(snapshot);
  });

  it("scores with the placeholder config without relying on its values", () => {
    const table = DEV_PLACEHOLDER_SCORE_CONFIG.config.rewardByError;
    expect(score(20, 20, DEV_PLACEHOLDER_SCORE_CONFIG.config)).toBe(table[0]);
    expect(score(20 + table.length, 20, DEV_PLACEHOLDER_SCORE_CONFIG.config)).toBe(0);
  });
});

describe("validateGuess", () => {
  it("accepts every integer from 4 to 52", () => {
    for (let g = 4; g <= 52; g++) expect(validateGuess(g)).toEqual({ ok: true, value: g });
    expect(GUESS_MIN).toBe(4);
    expect(GUESS_MAX).toBe(52);
  });

  it.each([3, 53, 0, 1, -1, -100, 1000])("rejects the integer %s as GUESS_OUT_OF_RANGE", (g) => {
    const result = validateGuess(g);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("GUESS_OUT_OF_RANGE");
  });

  it("rejects -0 as GUESS_OUT_OF_RANGE (an integer outside the range)", () => {
    const result = validateGuess(-0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("GUESS_OUT_OF_RANGE");
  });

  const notIntegers: [string, unknown][] = [
    ["3.5", 3.5],
    ["10.0001", 10.0001],
    ["-3.5", -3.5],
    ["60.5 (non-integer and out of range)", 60.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["string '7'", "7"],
    ["empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["true", true],
    ["bigint 7n", 7n],
    ["array [7]", [7]],
    ["object", { value: 7 }],
  ];

  it.each(notIntegers)("rejects %s as GUESS_NOT_INTEGER (integer check before range check)", (_name, g) => {
    const result = validateGuess(g);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("GUESS_NOT_INTEGER");
  });
});
