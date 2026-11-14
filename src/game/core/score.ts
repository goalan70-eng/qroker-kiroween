/**
 * Score engine (task 6.1).
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "ScoreEngine and Ranking".
 * Requirements: 7.2 (guess validation), 8.1 (score by error), 8.3 (configuration validation),
 * 8.4 (no numeric score value outside this file), 8.5 (provisional placeholder);
 * qroker-game Requirement 2 (score calculation).
 *
 * Pure and deterministic: no DOM, no node:, no randomness, no clock, no src/optical import.
 * No function here mutates its arguments.
 *
 * Rules implemented:
 * - A prediction scores `rewardByError[|guess - hiddenSum|]`, and 0 when the error is not smaller
 *   than the table length (reward range cutoff). The error is symmetric: over- and under-estimates
 *   by the same amount score the same.
 * - There is NO separate completion bonus for forming a Composite_Code (qroker-game 2.5). A
 *   prediction score depends only on the Guess, the Hidden_Sum and the ScoreConfig (qroker-game 2.6).
 * - `handEmptyBonus` is part of the ScoreConfig and is read by the reducer (task 8), which adds it
 *   exactly once to the Seat whose Hand became empty, after the last batch is scored. The design
 *   names no helper for it, so this module only validates it.
 */

import type { NamedScoreConfig, Result, ScoreConfig } from './types';

/**
 * Integer version of the rules. Incremented whenever a change alters the outcome of replaying an
 * existing Action_Log (requirement 12.6). It is part of every configuration and Save_Envelope.
 */
export const RULES_VERSION = 1;

/** Smallest and largest accepted Guess: the sum of 4 cards of value 1..13 lies in 4..52. */
export const GUESS_MIN = 4;
export const GUESS_MAX = 52;

/**
 * Development placeholder, no balance claim.
 *
 * The numbers below are provisional and undecided. They exist only so that scores are visible and
 * differ by accuracy during development. They are not a balance decision and must not be read as
 * balanced or final. The final values are to be determined by simulation (docs/open-decisions.md
 * item 7, milestone P3). Nothing may depend on these values; tests derive expectations from the
 * configuration they pass in.
 *
 * This is the only place in the game code where a numeric score table is written
 * (checked by the 'score-table' rule of src/game/boundaries.test.ts).
 */
export const DEV_PLACEHOLDER_SCORE_CONFIG: NamedScoreConfig = {
  id: 'DEV_PLACEHOLDER',
  provisional: true,
  config: {
    rewardByError: [6, 4, 3, 2, 1],
    handEmptyBonus: 3,
  },
};

function invalid(detail: string): Result<ScoreConfig> {
  return { ok: false, error: { code: 'INVALID_SCORE_CONFIG', detail } };
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Validates a ScoreConfig (requirement 8.3). Accepts any value, so it can be used on data that
 * comes from outside (save files, configuration input).
 *
 * Rejects with `INVALID_SCORE_CONFIG` and a `detail` naming the violated rule when:
 * - the value is not an object, or `rewardByError` is not an array, or `handEmptyBonus` is missing;
 * - the table is empty;
 * - a table entry is not a finite number (this also rejects holes, NaN, Infinity and strings);
 * - a table entry is negative;
 * - the first entry is not greater than 0;
 * - the table increases anywhere (it must be non-increasing; equal neighbours are allowed);
 * - `handEmptyBonus` is not a finite number, or is negative.
 *
 * Table entries need not be integers (the design requires only "finite and non-negative").
 * Unknown extra properties are ignored. On success the same object is returned, unchanged.
 */
export function validateScoreConfig(c: unknown): Result<ScoreConfig> {
  if (typeof c !== 'object' || c === null || Array.isArray(c)) {
    return invalid('config must be an object');
  }
  const record = c as Record<string, unknown>;
  const table = record.rewardByError;
  if (!Array.isArray(table)) return invalid('rewardByError must be an array');
  if (table.length === 0) return invalid('rewardByError must not be empty');
  for (let i = 0; i < table.length; i++) {
    const v: unknown = table[i];
    if (!isFiniteNumber(v)) return invalid(`rewardByError[${i}] must be a finite number`);
    if (v < 0) return invalid(`rewardByError[${i}] must not be negative`);
  }
  if (!((table[0] as number) > 0)) return invalid('rewardByError[0] must be greater than 0');
  for (let i = 1; i < table.length; i++) {
    if ((table[i] as number) > (table[i - 1] as number)) {
      return invalid(`rewardByError must not increase (rewardByError[${i}] > rewardByError[${i - 1}])`);
    }
  }
  const bonus = record.handEmptyBonus;
  if (!isFiniteNumber(bonus)) return invalid('handEmptyBonus must be a finite number');
  if (bonus < 0) return invalid('handEmptyBonus must not be negative');
  return { ok: true, value: c as unknown as ScoreConfig };
}

/**
 * Score of one prediction: `rewardByError[|guess - hiddenSum|]`, or 0 when the error is not a valid
 * table index (error >= table length: reward range cutoff). Symmetric in the sign of the error.
 * Contains no completion bonus.
 *
 * Precondition: `c` passed `validateScoreConfig` (the engine validates once in `newGame`) and
 * `guess` passed `validateGuess`. The function is total: for a non-integer error it returns 0
 * instead of reading outside the table.
 */
export function score(guess: number, hiddenSum: number, c: ScoreConfig): number {
  const error = Math.abs(guess - hiddenSum);
  if (!Number.isInteger(error) || error >= c.rewardByError.length) return 0;
  return c.rewardByError[error] as number;
}

/**
 * Validates a Guess (requirement 7.2). Accepts exactly the integers 4..52.
 * Precedence: the integer check comes first. Any value that is not an integer number (3.5, NaN,
 * Infinity, a string, null, undefined, an object) gives `GUESS_NOT_INTEGER`; an integer outside
 * 4..52 (including -0 and 0) gives `GUESS_OUT_OF_RANGE`.
 */
export function validateGuess(g: unknown): Result<number> {
  if (typeof g !== 'number' || !Number.isInteger(g)) {
    return { ok: false, error: { code: 'GUESS_NOT_INTEGER', detail: 'guess must be an integer' } };
  }
  if (g < GUESS_MIN || g > GUESS_MAX) {
    return {
      ok: false,
      error: { code: 'GUESS_OUT_OF_RANGE', detail: `guess must be from ${GUESS_MIN} to ${GUESS_MAX}` },
    };
  }
  return { ok: true, value: g };
}
