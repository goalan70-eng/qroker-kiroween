/**
 * The BEGINNER strategy (`RandomStrategy`) of the QRoker game (task 12.2).
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "AI Strategies (`ai/`)", table row BEGINNER: placement is a
 * "uniform choice among all legal (card, cell, orientation) triples", the Guess is a "uniform integer in 4..52 per
 * code". Requirements: 11.1 (BEGINNER = random legal placement and random Guess), 11.2 (only accepted `PLACE` and
 * `SUBMIT_GUESSES` actions), 11.3 (same view and same `decisionSeed` give the same decision), 11.4 (named work
 * constant), 10.7 (the AI reads the `PlayerView` only); qroker-game Requirement 7 (AI players).
 *
 * Imports: `./strategy`, `core/prng` (through `decisionRng`, see strategy.ts), `core/score` (the Guess bounds
 * `GUESS_MIN` and `GUESS_MAX`, so the range is defined in one place) and `core/types` (types). All four are inside
 * the allow-list for `ai/`. Pure and deterministic: no DOM, no node:, no `Math.random`, no clock.
 *
 * Random streams (the contract that makes a decision a function of the view and the seed):
 * - `choosePlacement` creates `decisionRng(ctx)` = `mulberry32(ctx.decisionSeed)` and draws EXACTLY ONE number: a
 *   single uniform index over the COMPLETE flat list of legal triples returned by `enumeratePlacements(view)`.
 *   The choice is flat by construction (not card, then cell, then orientation) and the list is never truncated
 *   (`takeBudget` is not used, a prefix would favour the first hand cards). In this game every hand card is legal
 *   at every legal cell with either orientation (`board.validatePlacement` does not look at the card), so the legal
 *   set is a product `hand x cells x {0, 180}` and a nested draw would have the same distribution. The flat draw
 *   stays correct if that ever stops being true.
 * - `chooseGuesses` creates its OWN generator `mulberry32(ctx.decisionSeed)` and draws one number per pending
 *   Quad_Key, in the order of `view.pendingQuadKeys` (code-unit order of the keys, as the view lists them): the
 *   i-th key gets `GUESS_MIN + pickIndex(49, rng)` from the i-th draw. A placement decision and a guess decision
 *   use independent contexts (the caller derives `decisionSeed` per decision), so reusing one seed for both would
 *   only repeat the first number of the stream and is harmless.
 *
 * Work: the placement decision evaluates every candidate once, which is at most `WORK_BUDGET`. `WORK_BUDGET` is a
 * documented upper bound of the candidate count and never truncates anything: the candidates are
 * |hand| x |legal cells| x 2, with |hand| <= 48 (52 cards minus the 4 neutral cards) and |legal cells| <= 60 (64
 * cells minus at least the 4 starting cells), that is at most 5760. Real hands are far smaller (a few cards).
 *
 * Errors (documented, `RangeError`, like `chooseSeeded` and `viewFor` in this code base): the strategies are
 * called only when the seat must act. A call in any other situation is a caller bug, and a decision cannot be
 * invented, so it throws instead of returning an action the engine would reject:
 * - `choosePlacement`: no legal triple, that is it is not the viewer's turn, the phase is not `PLACEMENT`, or the
 *   hand is empty.
 * - `chooseGuesses`: the phase is not `GUESS_COLLECT`, there is no pending Quad_Key, or the viewer has already
 *   submitted (`view.guessSubmitted[view.viewer]`).
 *
 * Information: the strategy reads only `view.myHand`, the board occupancy (through `enumeratePlacements`),
 * `view.viewer`, `view.phase`, `view.pendingQuadKeys` and `view.guessSubmitted`. It never reads `view.board` card
 * identities, `unseenCards`, `view.scores` or the history, and a view has no hidden sums before the reveal.
 *
 * DESIGN INCONSISTENCY (recorded as required by the task contract): design.md says, in the paragraph after the
 * tier table, "Under `FACE_UP` every card is known and all tiers compute the exact sum." The explicit Task 12.2
 * contract and the design's own BEGINNER row ("Uniform integer in 4..52 per code") say that BEGINNER draws its Guess
 * uniformly at random. This module follows the task contract and the BEGINNER row: BEGINNER is NOT a
 * perfect-information solver, also under `FACE_UP`. The sentence about the exact sum holds for ADVANCED (task 12.3)
 * and EXPERT (task 23.x), which compute the Guess from the known cards.
 */

import { GUESS_MAX, GUESS_MIN } from '../core/score';
import { decisionRng, enumeratePlacements, pickIndex, toPlaceAction } from './strategy';
import type { AIStrategy, AiContext, PlaceAction, SubmitGuessesAction } from './strategy';
import type { PlayerView } from '../core/view';

/** Number of distinct Guess values, 4..52 inclusive. */
const GUESS_VALUES = GUESS_MAX - GUESS_MIN + 1;

/**
 * Work constant of BEGINNER (requirement 11.4): an upper bound of the candidates one placement decision evaluates,
 * 48 hand cards x 60 legal cells x 2 orientations. It is a hard bound of the game, not a truncation point: BEGINNER
 * evaluates ALL candidates.
 */
export const WORK_BUDGET = 48 * 60 * 2;

/**
 * Uniformly random legal placement: one draw over the whole list of (card, cell, orientation) triples.
 *
 * @throws RangeError if the viewer has no legal placement (see the module comment).
 */
function choosePlacement(view: PlayerView, ctx: AiContext): PlaceAction {
  const candidates = enumeratePlacements(view);
  if (candidates.length === 0) {
    throw new RangeError(
      `BEGINNER.choosePlacement: no legal placement for ${view.viewer} (phase ${view.phase}, turn ${view.turn}, hand ${view.myHand.length})`,
    );
  }
  const candidate = candidates[pickIndex(candidates.length, decisionRng(ctx))];
  return toPlaceAction(view, candidate as (typeof candidates)[number]);
}

/**
 * Uniform Guess in 4..52 for every pending Quad_Key, one draw per key in key order (see the module comment).
 *
 * @throws RangeError if the viewer must not or cannot submit now (see the module comment).
 */
function chooseGuesses(view: PlayerView, ctx: AiContext): SubmitGuessesAction {
  if (view.phase !== 'GUESS_COLLECT') {
    throw new RangeError(`BEGINNER.chooseGuesses: phase is ${view.phase}, not GUESS_COLLECT`);
  }
  if (view.pendingQuadKeys.length === 0) {
    throw new RangeError('BEGINNER.chooseGuesses: no pending Quad_Key');
  }
  if (view.guessSubmitted[view.viewer]) {
    throw new RangeError(`BEGINNER.chooseGuesses: ${view.viewer} has already submitted`);
  }
  const rng = decisionRng(ctx);
  const guesses: Record<string, number> = {};
  for (const key of view.pendingQuadKeys) {
    guesses[key] = GUESS_MIN + pickIndex(GUESS_VALUES, rng);
  }
  return { type: 'SUBMIT_GUESSES', player: view.viewer, guesses };
}

/** The BEGINNER strategy. Stateless and frozen: one shared instance is safe. */
export const BEGINNER_STRATEGY: AIStrategy = Object.freeze({
  id: 'BEGINNER',
  choosePlacement,
  chooseGuesses,
});
