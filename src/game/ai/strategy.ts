/**
 * AI framework of the QRoker game (task 12.1): the strategy interface, the work-budget helper, the shared
 * candidate enumeration, the seeded tie-break helpers and the difficulty labels.
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "AI Strategies (`ai/`)" and IC-1 (the AI receives only the
 * `PlayerView`, never the deck). Requirements: 11.3 (a decision is deterministic for one view and one
 * `decisionSeed`), 11.4 (a decision is bounded by a work budget), 11.7 and 11.8 (tiers and labels), 10.7 (the AI
 * reads only what the viewer may know).
 *
 * Imports (the design's allow-list for `ai/`, enforced by the rule `ai-allow-list` of boundaries.test.ts): only
 * `core/types` (types), `core/prng` (`mulberry32`) and `core/view` (the `PlayerView` type and `legalCellsFor`).
 * Nothing here can reach the `GameState`, the deck, the deal or the reducer. No DOM, no node:, no `Math.random`,
 * no clock.
 *
 * Deviations from the wording of the task text, both from design.md (the design is authoritative):
 * - The two strategy methods are `choosePlacement` and `chooseGuesses` (the qroker-game design called them
 *   `selectPlacement` and `submitGuess`; design.md lists the deviation and the reason, IC-1).
 * - `AiContext` has the single field `decisionSeed`. The design gives no other field: the tier is the strategy's
 *   `id`, the seat is `view.viewer`, and each strategy owns its `WORK_BUDGET` constant (tasks 12.2 and later).
 *
 * Enumeration order (stable, the contract of `enumeratePlacements`): hand cards in the view's canonical
 * (`ALL_CARDS`) order, then legal cells row-major, then orientations ascending (0, then 180). Orientation is
 * independent of the card: `board.validatePlacement` checks only orientation, bounds, occupancy and adjacency, so
 * every card is legal at every legal cell with either orientation. Whether a placement forms a valid code is a
 * matter of scoring, not of legality.
 *
 * Work budget: `takeBudget` keeps the FIRST `budget` candidates of an ordered list (a prefix). The truncation is a
 * pure function of the list and the budget. A strategy that must choose uniformly among ALL legal placements
 * (BEGINNER, design: "Uniform choice among all legal triples") must NOT use `takeBudget`: truncating would bias
 * the choice toward the first hand cards. `enumeratePlacements` itself never truncates.
 */

import { mulberry32 } from '../core/prng';
import type { Action, CardId, Difficulty, GridPosition, Orientation } from '../core/types';
import { legalCellsFor } from '../core/view';
import type { PlayerView } from '../core/view';

// ---------------------------------------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------------------------------------

/**
 * Plain data a caller supplies with every decision. `decisionSeed` is derived by the caller from the game seed:
 * `mix32(gameSeed, seatIndex * 100000 + actionIndex)`. The strategy derives all of its randomness from it.
 */
export interface AiContext {
  readonly decisionSeed: number;
}

/** The `PLACE` action a strategy returns. */
export type PlaceAction = Extract<Action, { type: 'PLACE' }>;
/** The `SUBMIT_GUESSES` action a strategy returns. */
export type SubmitGuessesAction = Extract<Action, { type: 'SUBMIT_GUESSES' }>;

/**
 * A strategy decides from the `PlayerView` and the `AiContext` ONLY (IC-1: no deck argument; no function of this
 * module takes a `GameState`). For one view and one `decisionSeed` the result is deeply equal on every call.
 */
export interface AIStrategy {
  readonly id: Difficulty;
  /** Called when `view.phase === 'PLACEMENT'` and `view.turn === view.viewer`. */
  choosePlacement(view: PlayerView, ctx: AiContext): PlaceAction;
  /** Called in `GUESS_COLLECT`; one Guess in 4..52 for exactly the keys of `view.pendingQuadKeys`. */
  chooseGuesses(view: PlayerView, ctx: AiContext): SubmitGuessesAction;
}

// ---------------------------------------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------------------------------------

export interface DifficultyLabel {
  readonly en: string;
  readonly ko: string;
}

const LABELS = {
  BEGINNER: Object.freeze({ en: 'Beginner', ko: '초급' }),
  ADVANCED: Object.freeze({ en: 'Advanced', ko: '고급' }),
  EXPERT: Object.freeze({ en: 'Expert', ko: '전문가' }),
} satisfies Record<Difficulty, DifficultyLabel>;

/** English and Korean label of every tier declared by `Difficulty` (design.md, AI Strategies). */
export const DIFFICULTY_LABELS: Readonly<Record<Difficulty, DifficultyLabel>> = Object.freeze(LABELS);

// ---------------------------------------------------------------------------------------------------------
// Work budget
// ---------------------------------------------------------------------------------------------------------

/** The result of `takeBudget`. */
export interface BudgetedCandidates<T> {
  /** The first `evaluated` candidates of the input, in input order. Frozen. */
  readonly items: readonly T[];
  /** How many candidates the caller may evaluate: `items.length`. */
  readonly evaluated: number;
  /** True when candidates were left out, that is when the input had more than `evaluated` entries. */
  readonly truncated: boolean;
}

/**
 * The effective number of candidates a budget allows for a list of `length` candidates:
 * - a finite budget is rounded down (2.9 gives 2); a budget of 0 or below gives 0;
 * - `NaN` gives 0 (an unusable budget does no work rather than unbounded work);
 * - `Infinity` gives `length` (no limit);
 * - a budget above `length` gives `length`.
 */
export function effectiveBudget(budget: number, length: number): number {
  if (typeof budget !== 'number' || Number.isNaN(budget) || budget <= 0) return 0;
  return Math.min(Math.floor(budget), length);
}

/**
 * Deterministic work-budget truncation: returns the first `effectiveBudget(budget, candidates.length)` candidates.
 * Same list and same budget give the same result; the input is not changed and is not required to be frozen.
 *
 * The prefix is a pure function of the fixed enumeration order, so a decision never depends on timing or on
 * randomness. The cost of a decision is bounded by `evaluated`, the number of candidates the caller evaluates.
 */
export function takeBudget<T>(candidates: readonly T[], budget: number): BudgetedCandidates<T> {
  const evaluated = effectiveBudget(budget, candidates.length);
  return Object.freeze({
    items: Object.freeze(candidates.slice(0, evaluated)),
    evaluated,
    truncated: evaluated < candidates.length,
  });
}

// ---------------------------------------------------------------------------------------------------------
// Candidate enumeration
// ---------------------------------------------------------------------------------------------------------

/** One legal placement as plain data: a card of the viewer's Hand, an empty adjacent cell and an orientation. */
export interface PlacementCandidate {
  readonly card: CardId;
  readonly pos: GridPosition;
  readonly orientation: Orientation;
}

const ORIENTATIONS: readonly Orientation[] = [0, 180];

/**
 * Every legal placement of the viewer, in the fixed order described in the module comment (hand cards in
 * canonical order x legal cells row-major x orientations 0, 180). The count is
 * `|myHand| x |legal cells| x 2`.
 *
 * Returns `[]` when it is not the viewer's turn in the `PLACEMENT` phase (then `legalCellsFor` is empty). It
 * reads the occupancy of the view's board only, so hidden card identities do not change it: the same state gives
 * the same candidates under `OWNER_ONLY` and `FACE_UP`. Never truncated; apply `takeBudget` explicitly if a
 * strategy wants a bound. The result and its elements are frozen.
 */
export function enumeratePlacements(view: PlayerView): readonly PlacementCandidate[] {
  const cells = legalCellsFor(view).map((cell) => Object.freeze({ row: cell.row, col: cell.col }));
  const out: PlacementCandidate[] = [];
  for (const card of view.myHand) {
    for (const pos of cells) {
      for (const orientation of ORIENTATIONS) {
        out.push(Object.freeze({ card, pos, orientation }));
      }
    }
  }
  return Object.freeze(out);
}

/** The `PLACE` action of a candidate, for the viewer of `view`. */
export function toPlaceAction(view: PlayerView, candidate: PlacementCandidate): PlaceAction {
  return {
    type: 'PLACE',
    player: view.viewer,
    card: candidate.card,
    pos: { row: candidate.pos.row, col: candidate.pos.col },
    orientation: candidate.orientation,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Seeded tie-break
// ---------------------------------------------------------------------------------------------------------

/** The generator of a decision: `mulberry32(ctx.decisionSeed)`. Every call returns a float in [0, 1). */
export function decisionRng(ctx: AiContext): () => number {
  return mulberry32(ctx.decisionSeed);
}

/**
 * A uniform index in `[0, n)`: `Math.floor(rng() * n)`. Consumes exactly one `rng()` call (also for `n === 1`),
 * so the number of draws never depends on the data. `rng()` is in [0, 1), so the index is below `n`; the bias of
 * the multiplication is below 2^-32 per index for the supported `n` (at most a few thousand).
 *
 * @throws RangeError if `n` is not a positive safe integer.
 */
export function pickIndex(n: number, rng: () => number): number {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new RangeError(`pickIndex: n must be a positive integer, got ${String(n)}`);
  }
  return Math.floor(rng() * n);
}

/**
 * A uniformly chosen element of `items` (one `rng()` call). Use it to break ties, passing the tied candidates in
 * their enumeration order so that the result is a function of the view and the seed only.
 *
 * @throws RangeError if `items` is empty.
 */
export function chooseSeeded<T>(items: readonly T[], rng: () => number): T {
  if (items.length === 0) throw new RangeError('chooseSeeded: items must not be empty');
  return items[pickIndex(items.length, rng)] as T;
}
