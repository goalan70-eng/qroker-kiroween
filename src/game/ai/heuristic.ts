/**
 * The ADVANCED strategy (`HeuristicStrategy`) of the QRoker game (task 12.3).
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "AI Strategies (`ai/`)", table row ADVANCED. Requirements:
 * 11.1 (ADVANCED = heuristic placement that maximizes the likelihood of completing a Quad_Group, and a Guess from
 * the visible cards plus the mean of the unseen cards), 11.2 (only accepted `PLACE` and `SUBMIT_GUESSES`
 * actions), 11.3 (same view and same `decisionSeed` give the same decision), 11.4 (named work constant), 11.7 and
 * 11.8 (registry entry, imports limited to the `ai/` allow-list), 10.7 (the AI reads the `PlayerView` only).
 *
 * Imports: `./strategy` and, from `core/`, only `types`, `cards`, `geometry`, `fragment-layout`, `score` and `view`,
 * all inside the allow-list of the rule `ai-allow-list` of boundaries.test.ts. Pure and deterministic: no DOM, no
 * node:, no `Math.random`, no clock, no module-level mutable state. The AI receives a `PlayerView` and an
 * `AiContext` and nothing else: no `GameState`, no reducer, no deck, no other Hand, no hidden identity, no hidden
 * sum, no `groupId`, no log.
 *
 * DOCUMENTATION INCONSISTENCY (recorded as required; decided by the user, nothing was changed in the boundary
 * test): the design's dependency diagram has an arrow from `ai/` to `core/composite-code` (CCD), but the table
 * that DEFINES the `ai/` import rule does not list `core/composite-code`, and `AI_ALLOWED_CORE_MODULES` follows
 * the table. `composite-code` also works on a full `Board` of `PlacedCard`s with hidden-free identities, which an
 * AI never has. This module therefore does NOT import it. It computes the probability that a quad becomes a
 * valid code itself, from `isValidMember` (the same predicate `detect` uses) and the unseen pool.
 *
 * ---------------------------------------------------------------------------------------------------------
 * PLACEMENT
 * ---------------------------------------------------------------------------------------------------------
 * Candidates are `enumeratePlacements(view)` (hand x legal cells x orientations, fixed order). The work budget
 * `WORK_BUDGET` is applied through `takeBudget`, which keeps a PREFIX of that order; it does nothing unless the
 * candidate count exceeds the budget. A prefix would favour the first hand cards, so the budget is set above the
 * largest possible enumeration (see `WORK_BUDGET`): in every reachable game state ALL candidates are evaluated.
 *
 * Score of a candidate (card c at cell p with orientation o) = SUM over the quads Q that contain p (1, 2 or 4 of
 * them, `candidateQuads(p)`) of
 *
 *     score(Q) = weight(k) * PRODUCT over the occupied members m of Q (after the placement) of P(m valid)
 *
 * where k is the number of occupied cells of Q AFTER the placement, and
 * - weight(4) = W_COMPLETE (the placement completes the quad), weight(2) = W_PARTIAL[2], weight(3) =
 *   W_PARTIAL[3], weight(1) = W_PARTIAL[1] = 0 (the new card alone is no region);
 * - P(m valid) is a member's validity for ITS slot in Q and ITS orientation:
 *   - the placed card c: exactly 1 or 0, `isValidMember(c, o, slot)`;
 *   - an occupied cell whose identity is visible in the view (`card !== null`): exactly 1 or 0, `isValidMember`;
 *   - an occupied cell whose identity is hidden (`card === null`): its orientation is public, its identity is not.
 *     P = (number of unseen cards u with `isValidMember(u, orientation, slot)`) / |unseen|, `unseen =
 *     unseenCards(view)`. When |unseen| = 0 the fraction is defined as 0 (never NaN).
 *
 * Consequences: a quad with ANY visible invalid member is dead (score 0, a known-bad region is not rewarded); a
 * fully visible valid completion scores exactly W_COMPLETE; a hidden member scales the value by its probability.
 *
 * Stated approximation (no accuracy claim): the product treats the hidden members as independent, and every
 * hidden member's probability uses the same pool, so it ignores that distinct hidden cells are different cards
 * drawn without replacement. It also ignores that the cards of other empty cells of Q will be placed later, and
 * who will place them. A region is scored the same whether the placing seat or another seat is likely to finish
 * it (that is the EXPERT tier's `W_GIVE`, task 23). The weights are NOT tuned and NOT simulated; they are
 * monotone placeholders with the ordering the design states (complete > 3 filled > 2 filled).
 *
 * Choice: the candidate(s) with the maximum score. Scores are floating point sums of products, so "equal" means
 * within `SCORE_EPSILON` (1e-9) of the maximum, far above rounding error (scores are below 4 x W_COMPLETE) and far
 * below the smallest real difference (a probability step is at least 1/52^4 of a weight). All tied candidates are
 * collected in enumeration order and one is chosen with `chooseSeeded(tied, decisionRng(ctx))`: exactly one
 * generator draw per decision, a function of the view and the seed only.
 *
 * ---------------------------------------------------------------------------------------------------------
 * GUESS
 * ---------------------------------------------------------------------------------------------------------
 * For each pending Quad_Key, in the order of `view.pendingQuadKeys`, the four cells are `quadCells(fromNotation(key))`
 * (TL, TR, BL, BR). The estimate is the conditional-mean approximation of the design:
 *
 *     estimate = SUM of cardValue over visible members
 *              + SUM over hidden members of mean(cardValue(u) for unseen u with isValidMember(u, orientation, slot))
 *
 * The pending code is public and valid, so a hidden member's card is one of the unseen cards that are valid for its
 * slot and orientation. Each hidden member is treated on its own: the means ignore that the hidden cards of one
 * code are distinct cards drawn without replacement. No posterior and no expected-score optimization (that is the
 * EXPERT tier). Rounding: the sum of rationals is computed EXACTLY in integers (common denominator = product of
 * the candidate counts, at most 52^4), then rounded to the nearest integer with an exact half rounding UP
 * (toward the larger sum), then clamped to [GUESS_MIN, GUESS_MAX] = [4, 52]. If a hidden member has no compatible
 * unseen card (impossible for a real pending code, defined for synthetic input), its mean is taken over ALL unseen
 * cards, and when the pool is empty it is `MIDDLE_CARD_VALUE` (7). When all four members are visible the estimate
 * is exactly the Hidden_Sum. The decision has no randomness: `ctx` is not used by `chooseGuesses`.
 *
 * Under `FACE_UP` every card is visible, so ADVANCED's Guess is the exact Hidden_Sum (design: "all tiers compute the
 * exact sum"; BEGINNER stays uniformly random by the task contract of 12.2, see random.ts).
 *
 * Errors (documented `RangeError`, as BEGINNER): `choosePlacement` with no legal placement (not the viewer's turn,
 * wrong phase, empty Hand); `chooseGuesses` outside `GUESS_COLLECT`, with no pending Quad_Key, or when the viewer
 * has already submitted; also a pending key that is not a cell notation or whose cells are not all occupied in the
 * view (an inconsistent view, never produced by `viewFor`).
 */

import { cardValue } from '../core/cards';
import { isValidMember } from '../core/fragment-layout';
import { BOARD_SIZE, candidateQuads, fromNotation, quadCells, slotOf } from '../core/geometry';
import { GUESS_MAX, GUESS_MIN } from '../core/score';
import type { CardId, GridPosition, Orientation, Slot } from '../core/types';
import { unseenCards } from '../core/view';
import type { PlayerView } from '../core/view';
import { chooseSeeded, decisionRng, enumeratePlacements, takeBudget, toPlaceAction } from './strategy';
import type { AIStrategy, AiContext, PlaceAction, PlacementCandidate, SubmitGuessesAction } from './strategy';

// ---------------------------------------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------------------------------------

/**
 * Value of a quad that the placement completes with all members valid. Dimensionless weight. NOT tuned, NOT
 * simulated.
 */
export const W_COMPLETE = 100;

/**
 * Value of a quad with k occupied cells after the placement, indexed by k = 0..3 (k = 4 uses `W_COMPLETE`). Indexes
 * 0 and 1 are 0: a quad holding only the new card is no region. The values 5 and 15 are monotone placeholders
 * (2 filled < 3 filled < complete): NOT tuned, NOT simulated, no claim about their quality.
 *
 * One structural constraint IS deliberate: `W_COMPLETE > 4 * W_PARTIAL[3]`. A placement lies in at most 4 quads, so
 * a placement that completes no valid quad scores at most `4 * W_PARTIAL[3]` when every identity is visible. With
 * the constraint, under full information (`FACE_UP`) a placement that completes a valid code always outscores one
 * that does not, and a placement that completes two codes (200+) always outscores one that completes one (at most
 * `W_COMPLETE + 3 * W_PARTIAL[3]`).
 */
export const W_PARTIAL: readonly number[] = Object.freeze([0, 0, 5, 15]);

/**
 * Work constant of ADVANCED (requirement 11.4): the maximum number of candidates one placement decision evaluates.
 * It is set to the hard bound of the game, 48 hand cards (52 cards minus the 4 neutral cards) x 60 legal cells
 * (64 cells minus at least the 4 starting cells) x 2 orientations = 5760, so it never truncates a real decision (the
 * observed maximum in games is a few hundred). If a smaller budget were used, `takeBudget` would keep the PREFIX
 * of the enumeration (the first hand cards in canonical order), which is deterministic but biased toward them.
 */
export const WORK_BUDGET = 48 * 60 * 2;

/** Scores within this distance of the maximum are tied (see the module comment). */
export const SCORE_EPSILON = 1e-9;

/** The Guess of a hidden member when there is no unseen card at all: the middle Card_Value (A=1 .. K=13). */
export const MIDDLE_CARD_VALUE = 7;

// ---------------------------------------------------------------------------------------------------------
// Hidden-member validity
// ---------------------------------------------------------------------------------------------------------

/** Probability of validity of a hidden member, by its (public) orientation and its slot. */
export type ValidityTable = Readonly<Record<Orientation, Readonly<Record<Slot, number>>>>;

/**
 * The fraction of `pool` that is a valid member of `slot` at `orientation`: `count / pool.length`, 0 for an empty
 * pool. Exact rational value of the double `count / length`.
 */
export function validFraction(pool: readonly CardId[], orientation: Orientation, slot: Slot): number {
  if (pool.length === 0) return 0;
  let count = 0;
  for (const card of pool) if (isValidMember(card, orientation, slot)) count++;
  return count / pool.length;
}

/** `validFraction(unseenCards(view), o, s)` for every orientation and slot (8 entries). A new frozen object. */
export function validityTable(view: PlayerView): ValidityTable {
  const pool = unseenCards(view);
  const entry = (orientation: Orientation): Readonly<Record<Slot, number>> =>
    Object.freeze({
      TL: validFraction(pool, orientation, 'TL'),
      TR: validFraction(pool, orientation, 'TR'),
      BL: validFraction(pool, orientation, 'BL'),
      BR: validFraction(pool, orientation, 'BR'),
    });
  return Object.freeze({ 0: entry(0), 180: entry(180) });
}

// ---------------------------------------------------------------------------------------------------------
// Placement scoring
// ---------------------------------------------------------------------------------------------------------

const cellIndex = (p: GridPosition): number => p.row * BOARD_SIZE + p.col;

/** The weight of a quad with `occupied` cells after the placement. */
function weightOf(occupied: number): number {
  if (occupied >= 4) return W_COMPLETE;
  return W_PARTIAL[occupied] ?? 0;
}

/** Score of the quad with top-left `topLeft` after `candidate` is placed (see the module comment). */
function scoreQuad(
  view: PlayerView,
  topLeft: GridPosition,
  candidate: PlacementCandidate,
  table: ValidityTable,
): number {
  let occupied = 0;
  let product = 1;
  for (const cell of quadCells(topLeft)) {
    const slot = slotOf(topLeft, cell);
    if (cell.row === candidate.pos.row && cell.col === candidate.pos.col) {
      occupied++;
      if (!isValidMember(candidate.card, candidate.orientation, slot)) return 0;
      continue;
    }
    const seen = view.board[cellIndex(cell)];
    if (seen === null || seen === undefined) continue;
    occupied++;
    if (seen.card !== null) {
      if (!isValidMember(seen.card, seen.orientation, slot)) return 0;
    } else {
      product *= table[seen.orientation][slot];
      if (product === 0) return 0;
    }
  }
  return weightOf(occupied) * product;
}

/**
 * The score of one placement candidate: the sum over the quads that contain its cell (see the module comment).
 * `table` defaults to `validityTable(view)`; pass it when scoring many candidates of one view. The candidate is
 * expected to be legal (an empty cell); the function only reads the view.
 */
export function scoreCandidate(
  view: PlayerView,
  candidate: PlacementCandidate,
  table: ValidityTable = validityTable(view),
): number {
  let total = 0;
  for (const topLeft of candidateQuads(candidate.pos)) total += scoreQuad(view, topLeft, candidate, table);
  return total;
}

/** A candidate with its score. */
export interface ScoredCandidate {
  readonly candidate: PlacementCandidate;
  readonly score: number;
}

/** The result of evaluating the candidates of a view under a work budget. */
export interface PlacementEvaluation {
  /** Size of the full enumeration. */
  readonly candidates: number;
  /** Number of candidates scored: `min(floor(budget), candidates)`, at most `WORK_BUDGET` by default. */
  readonly evaluated: number;
  /** True when the budget cut the enumeration (the scored ones are a prefix of the enumeration order). */
  readonly truncated: boolean;
  /** The evaluated candidates in enumeration order, with their scores. */
  readonly scored: readonly ScoredCandidate[];
}

/**
 * Scores the first `budget` candidates (`takeBudget`, a prefix of the stable enumeration) of `view`. The default
 * budget is `WORK_BUDGET`, which never truncates a real decision.
 */
export function evaluatePlacements(view: PlayerView, budget: number = WORK_BUDGET): PlacementEvaluation {
  const all = enumeratePlacements(view);
  const taken = takeBudget(all, budget);
  const table = validityTable(view);
  const scored = taken.items.map(
    (candidate): ScoredCandidate => Object.freeze({ candidate, score: scoreCandidate(view, candidate, table) }),
  );
  return Object.freeze({
    candidates: all.length,
    evaluated: taken.evaluated,
    truncated: taken.truncated,
    scored: Object.freeze(scored),
  });
}

/** The scored candidates whose score is within `SCORE_EPSILON` of the maximum, in input order. `[]` for `[]`. */
export function bestCandidates(scored: readonly ScoredCandidate[]): readonly ScoredCandidate[] {
  if (scored.length === 0) return [];
  let best = -Infinity;
  for (const entry of scored) if (entry.score > best) best = entry.score;
  return scored.filter((entry) => entry.score >= best - SCORE_EPSILON);
}

// ---------------------------------------------------------------------------------------------------------
// Guess estimation
// ---------------------------------------------------------------------------------------------------------

/** One member of a quad as the AI sees it: the identity is `null` when hidden; orientation and slot are public. */
export interface QuadMember {
  readonly card: CardId | null;
  readonly orientation: Orientation;
  readonly slot: Slot;
}

/** A non-negative rational number with integer parts. */
interface Fraction {
  readonly numerator: number;
  readonly denominator: number;
}

/** The mean Card_Value of the pool cards valid for the member, with the documented fallbacks. */
function hiddenMean(member: QuadMember, pool: readonly CardId[]): Fraction {
  let sum = 0;
  let count = 0;
  for (const card of pool) {
    if (isValidMember(card, member.orientation, member.slot)) {
      sum += cardValue(card);
      count++;
    }
  }
  if (count > 0) return { numerator: sum, denominator: count };
  if (pool.length === 0) return { numerator: MIDDLE_CARD_VALUE, denominator: 1 };
  return { numerator: pool.reduce((total, card) => total + cardValue(card), 0), denominator: pool.length };
}

/** The exact sum of the known values and the hidden means, as one fraction (common denominator). */
function exactEstimate(members: readonly QuadMember[], pool: readonly CardId[]): Fraction {
  let known = 0;
  const means: Fraction[] = [];
  for (const member of members) {
    if (member.card !== null) known += cardValue(member.card);
    else means.push(hiddenMean(member, pool));
  }
  let denominator = 1;
  for (const mean of means) denominator *= mean.denominator;
  let numerator = known * denominator;
  for (const mean of means) numerator += mean.numerator * (denominator / mean.denominator);
  return { numerator, denominator };
}

/**
 * The unrounded conditional-mean estimate of the Hidden_Sum of a code: the sum of the visible Card_Values plus,
 * for each hidden member, the mean Card_Value of the cards of `pool` that are valid for its slot and orientation
 * (all of `pool` if none is valid, 7 if `pool` is empty). Exact when every member is visible.
 */
export function expectedQuadSum(members: readonly QuadMember[], pool: readonly CardId[]): number {
  const { numerator, denominator } = exactEstimate(members, pool);
  return numerator / denominator;
}

/**
 * `expectedQuadSum` rounded to the nearest integer, an exact half rounding up, and clamped to [GUESS_MIN,
 * GUESS_MAX]. The rounding is done on the exact fraction, so a value such as 10.5 is never misread because of
 * floating point error.
 */
export function estimateQuadSum(members: readonly QuadMember[], pool: readonly CardId[]): number {
  const { numerator, denominator } = exactEstimate(members, pool);
  const doubled = 2 * numerator + denominator;
  const step = 2 * denominator;
  const rounded = (doubled - (doubled % step)) / step; // floor(numerator / denominator + 1/2) in integers
  return Math.min(GUESS_MAX, Math.max(GUESS_MIN, rounded));
}

/** The four members (TL, TR, BL, BR) of the pending code with key `key`, read from the view. */
function membersOfKey(view: PlayerView, key: string): QuadMember[] {
  const topLeft = fromNotation(key);
  if (!topLeft.ok) throw new RangeError(`ADVANCED.chooseGuesses: pending key ${JSON.stringify(key)} is not a cell`);
  return quadCells(topLeft.value).map((cell): QuadMember => {
    const seen = view.board[cellIndex(cell)];
    if (seen === null || seen === undefined) {
      throw new RangeError(`ADVANCED.chooseGuesses: pending code ${key} has an empty cell in the view`);
    }
    return { card: seen.card, orientation: seen.orientation, slot: slotOf(topLeft.value, cell) };
  });
}

// ---------------------------------------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------------------------------------

/**
 * Highest-scoring legal placement; ties are broken by one draw of `mulberry32(ctx.decisionSeed)` over the tied
 * candidates in enumeration order.
 *
 * @throws RangeError if the viewer has no legal placement (see the module comment).
 */
function choosePlacement(view: PlayerView, ctx: AiContext): PlaceAction {
  const evaluation = evaluatePlacements(view);
  const tied = bestCandidates(evaluation.scored);
  if (tied.length === 0) {
    throw new RangeError(
      `ADVANCED.choosePlacement: no legal placement for ${view.viewer} (phase ${view.phase}, turn ${view.turn}, hand ${view.myHand.length})`,
    );
  }
  const chosen = chooseSeeded(tied, decisionRng(ctx));
  return toPlaceAction(view, chosen.candidate);
}

/**
 * The conditional-mean Guess for every pending Quad_Key, rounded and clamped (see the module comment). No
 * randomness: `ctx` is unused.
 *
 * @throws RangeError if the viewer must not or cannot submit now (see the module comment).
 */
function chooseGuesses(view: PlayerView, _ctx: AiContext): SubmitGuessesAction {
  if (view.phase !== 'GUESS_COLLECT') {
    throw new RangeError(`ADVANCED.chooseGuesses: phase is ${view.phase}, not GUESS_COLLECT`);
  }
  if (view.pendingQuadKeys.length === 0) {
    throw new RangeError('ADVANCED.chooseGuesses: no pending Quad_Key');
  }
  if (view.guessSubmitted[view.viewer]) {
    throw new RangeError(`ADVANCED.chooseGuesses: ${view.viewer} has already submitted`);
  }
  const pool = unseenCards(view);
  const guesses: Record<string, number> = {};
  for (const key of view.pendingQuadKeys) {
    guesses[key] = estimateQuadSum(membersOfKey(view, key), pool);
  }
  return { type: 'SUBMIT_GUESSES', player: view.viewer, guesses };
}

/** The ADVANCED strategy. Stateless and frozen: one shared instance is safe. */
export const ADVANCED_STRATEGY: AIStrategy = Object.freeze({
  id: 'ADVANCED',
  choosePlacement,
  chooseGuesses,
});
