// Guess input model (task 18.1; design.md "Task 18 interaction contracts", "Guess entry"). Pure: no DOM, no clock,
// no randomness, no global. It turns the text of the Guess inputs into the `Record<QuadKey, number>` of one
// `SUBMIT_GUESSES` Action, or into one error per invalid key, and it decides whether a Guess form is stale.
//
// Boundary: this is the only ui/ file besides controller.ts with a special core import (`core/score`:
// `validateGuess`, `GUESS_MIN`, `GUESS_MAX`; one additive allow-list entry in boundaries.test.ts). The range 4..52
// is NOT repeated here; screens read it through the re-export below.
//
// Rules
//   * `parseGuessText` trims the text and accepts only `/^-?[0-9]+$/` (ASCII digits). Everything else
//     (`4.0`, `1e1`, `0x10`, `+`, `--3`, `NaN`, `Infinity`, Unicode digits, inner spaces) is `GUESS_NOT_INTEGER`.
//     A digit string that overflows to `Infinity` is `GUESS_NOT_INTEGER` too (`validateGuess` decides). The number
//     then goes through `validateGuess`, so the engine's own rule is the only one: an integer outside 4..52
//     (including `-0` and `0`) is `GUESS_OUT_OF_RANGE`. Leading zeros are accepted (`007` is 7).
//   * Blank or whitespace-only text (and an absent key) is "missing": `buildGuesses` lists it in `missing` and in
//     `errors` with `GUESS_NOT_INTEGER`, and nothing is built.
//   * `buildGuesses` builds the record for EXACTLY `keys`; keys of `texts` that are not in `keys` are ignored.
//
// Stale form (`isGuessFormStale`). A token captures viewer, phase, key set and `actionCount` when the form is shown.
// Decision of this implementation (the design lists `actionCount` without saying how AI submissions count): inside
// one GUESS_COLLECT batch the only accepted Actions are `SUBMIT_GUESSES`, and each one raises both `actionCount` and
// the number of seats with `guessSubmitted`. The form therefore compares `actionCount - submittedCount`, which is
// constant for a batch: an AI Seat that submits while a person types does not make the form stale, but any other
// accepted Action (or a new batch) does. The token also stores `submittedCount` for that reason.

import { GUESS_MAX, GUESS_MIN, validateGuess } from '../core/score';
import type { ErrorCode, PlayerId, QuadKey, Result } from '../core/types';
import type { GamePhase, PlayerView } from '../core/view';

export { GUESS_MAX, GUESS_MIN };

const INTEGER_TEXT = /^-?[0-9]+$/;

const hasOwn = (record: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(record, key);

/** True for text that counts as "nothing entered": a non-string, empty or whitespace-only value. */
export function isBlankGuessText(text: unknown): boolean {
  return typeof text !== 'string' || text.trim() === '';
}

/**
 * Parses the text of one Guess input. `ok` carries the validated integer; otherwise the error code is
 * `GUESS_NOT_INTEGER` (malformed, blank or not finite) or `GUESS_OUT_OF_RANGE` (an integer outside 4..52).
 */
export function parseGuessText(text: string): Result<number> {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!INTEGER_TEXT.test(trimmed)) {
    return { ok: false, error: { code: 'GUESS_NOT_INTEGER', detail: 'guess text is not an integer' } };
  }
  return validateGuess(Number(trimmed));
}

export type BuildGuessesResult =
  | { readonly ok: true; readonly guesses: Readonly<Record<QuadKey, number>> }
  | {
      readonly ok: false;
      /** One entry per invalid or missing key, in no particular order. */
      readonly errors: Readonly<Record<QuadKey, ErrorCode>>;
      /** The keys whose text is blank or absent (a subset of the keys of `errors`; their code is `GUESS_NOT_INTEGER`). */
      readonly missing: readonly QuadKey[];
    };

/** Builds the submission for exactly `keys` from the input texts, or reports every invalid key and sends nothing. */
export function buildGuesses(keys: readonly QuadKey[], texts: Readonly<Record<QuadKey, string>>): BuildGuessesResult {
  const guesses: Record<QuadKey, number> = {};
  const errors: Record<QuadKey, ErrorCode> = {};
  const missing: QuadKey[] = [];
  for (const key of keys) {
    const text = hasOwn(texts, key) ? texts[key] : undefined;
    if (isBlankGuessText(text)) {
      errors[key] = 'GUESS_NOT_INTEGER';
      missing.push(key);
      continue;
    }
    const parsed = parseGuessText(text as string);
    if (parsed.ok) guesses[key] = parsed.value;
    else errors[key] = parsed.error.code;
  }
  if (Object.keys(errors).length > 0 || keys.length === 0) {
    // An empty key set is never submittable: there is nothing to guess.
    return Object.freeze({ ok: false, errors: Object.freeze(errors), missing: Object.freeze(missing) });
  }
  return Object.freeze({ ok: true, guesses: Object.freeze(guesses) });
}

// ---------------------------------------------------------------------------------------------------------
// Stale form
// ---------------------------------------------------------------------------------------------------------

export interface GuessFormToken {
  readonly viewer: PlayerId;
  readonly actionCount: number;
  readonly phase: GamePhase;
  readonly keys: readonly QuadKey[];
  /** Number of Seats with a submitted Guess when the form was shown (see the module comment). */
  readonly submittedCount: number;
}

export type GuessFormStaleReason = 'NO_VIEW' | 'VIEWER' | 'PHASE' | 'BATCH' | 'ACTION_COUNT' | 'SUBMITTED';

const submittedSeats = (view: PlayerView): number => Object.values(view.guessSubmitted).filter((s) => s).length;

/** The token of the form for `view` at `actionCount`. Frozen; holds public data only. */
export function guessFormToken(view: PlayerView, actionCount: number): GuessFormToken {
  return Object.freeze({
    viewer: view.viewer,
    actionCount,
    phase: view.phase,
    keys: Object.freeze([...view.pendingQuadKeys]),
    submittedCount: submittedSeats(view),
  });
}

/**
 * Why a form made with `token` may no longer submit against `view` at `actionCount`, or `null` when it may. The
 * `SUBMITTED` reason covers the viewer's own submission (`guessSubmitted` or `myGuesses`).
 */
export function isGuessFormStale(
  token: GuessFormToken,
  view: PlayerView | null,
  actionCount: number,
): GuessFormStaleReason | null {
  if (view === null) return 'NO_VIEW';
  if (view.viewer !== token.viewer) return 'VIEWER';
  if (view.phase !== token.phase || view.phase !== 'GUESS_COLLECT') return 'PHASE';
  if (view.pendingQuadKeys.length !== token.keys.length || view.pendingQuadKeys.some((k, i) => k !== token.keys[i])) return 'BATCH';
  if (actionCount - submittedSeats(view) !== token.actionCount - token.submittedCount) return 'ACTION_COUNT';
  if (view.guessSubmitted[view.viewer] === true || view.myGuesses !== null) return 'SUBMITTED';
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Public region of a code
// ---------------------------------------------------------------------------------------------------------

const COLUMN_LETTERS = 'ABCDEFGH';
const QUAD_KEY = /^([A-H])([1-8])$/;

/**
 * The notations of the four cells of the 2x2 region whose top-left cell is the public Quad_Key `key`
 * (`'D4'` gives `['D4', 'E4', 'D5', 'E5']`), or an empty list for a malformed key or one whose region leaves the
 * board. Positions only: no card identity.
 */
export function regionCells(key: QuadKey): readonly string[] {
  const m = QUAD_KEY.exec(key);
  if (m === null) return [];
  const col = COLUMN_LETTERS.indexOf(m[1] as string);
  const row = Number(m[2]);
  if (col > 6 || row > 7) return [];
  const at = (c: number, r: number): string => `${COLUMN_LETTERS[c] as string}${r}`;
  return Object.freeze([at(col, row), at(col + 1, row), at(col, row + 1), at(col + 1, row + 1)]);
}
