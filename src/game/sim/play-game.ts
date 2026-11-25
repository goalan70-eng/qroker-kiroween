/**
 * The headless driver of the QRoker game (task 13.1): plays a complete game with AI strategies on every seat.
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "Headless Driver and Simulation Interface (`sim/`)", the
 * "Invariants" list and Property 21. Requirements: 20.1 (driver that asks each strategy for its Actions through the
 * Player_View, applies them with `reduce`, and returns the final state and the log), 20.2 (ends in `ENDED`, rejects
 * no Action, keeps every invariant after every Action), 20.3 (the log replays to the final state), 9.6 and 9.7 (at
 * most 48 PLACE Actions, every placement succeeds), 11.2 (a strategy only returns Actions the engine accepts),
 * 12.4 and 12.5 (the log holds the AI Actions, so replay needs no AI computation).
 *
 * Algorithm (`playGame`):
 *
 *   state = newGame({ seed, config })
 *   while state.phase !== 'ENDED':
 *     PLACEMENT      seat = the acting seat; strategies[seat].choosePlacement(viewFor(state, seat), ctx)
 *     GUESS_COLLECT  seat = the FIRST seat in `actingSeats(state)` (seat order, so the seats that have not submitted
 *                    yet); strategies[seat].chooseGuesses(viewFor(state, seat), ctx). The view is computed from the
 *                    CURRENT state, after the earlier submissions of the same batch. By construction a view holds no
 *                    other seat's guess (`myGuesses` is the viewer's own only), so the order is not significant
 *                    (design: Property 15).
 *     REVEAL         the driver issues `{ type: 'ACK_REVEAL' }` itself. The AI interface has no acknowledgement.
 *     state = reduce(state, action)   (a rejection is a bug and throws, see below)
 *
 * Every Action, whoever produced it, goes through `reduce`. The driver adds no rule of its own and has exactly one
 * check that the engine cannot make: an accepted Action must carry the `player` of the seat that was asked
 * (see `IllegalAiActionError`).
 *
 * Decision seed (design: `AiContext.decisionSeed = mix32(gameSeed, seatIndex * 100000 + actionIndex)`):
 *   decisionSeed = mix32(gameSeed, SEATS.indexOf(seat) * 100000 + actionIndex)
 * where `actionIndex = state.log.length`, the number of Actions accepted before this decision. Every decision of a
 * game has its own pair (seat, actionIndex), because one decision becomes exactly one accepted Action and the log
 * grows by one. `mix32` is a bijection in its second argument, so the seeds of one game are pairwise distinct as
 * long as `actionIndex < 100000`, which the guard guarantees (see `DEFAULT_MAX_ACTIONS`). The same seed, configuration
 * and strategy assignment therefore always give the same game. `decisionSeed(...)` below is the one place of the formula.
 *
 * AI isolation: a strategy receives exactly two arguments, a deeply frozen `PlayerView` (`viewFor`) and a frozen
 * `{ decisionSeed }`. The driver never passes the `GameState`, the deck, a hand, the log, or any other seat's guess.
 * It does not retry, repair or replace an Action. An illegal Action is a strategy defect and is reported, never hidden.
 *
 * Seats and kinds: `config.seats[i].kind` and `difficulty` are not read. The strategy of a seat is whatever
 * `options.strategies[seat]` is, so an automated test or a simulation may let an AI play a seat that is configured as
 * HUMAN. This is for headless testing only: the application controller asks a person for a HUMAN seat.
 *
 * Failures (all are bugs or misuse, never a game outcome):
 * - `RangeError`: invalid options (seed or configuration rejected by `newGame`, a seat without a strategy,
 *   `maxActions` that is not a positive integer).
 * - `IllegalAiActionError`: `reduce` rejected an Action of a strategy. Carries the engine `ErrorCode`.
 * - `AiStrategyError`: a strategy threw. Wraps the thrown value (`cause`) with the decision context.
 * - `InvariantViolation`: an invariant failed after an accepted Action (only when `checkInvariants` is true).
 * - `ActionLimitError`: the finite-execution guard (`DEFAULT_MAX_ACTIONS` or `options.maxActions`) was exceeded.
 *
 * Deterministic: no randomness, no clock (callers and tests measure time), no DOM, no `node:`, no `src/optical`.
 * `sim/` may import `core/` and `ai/` (README, allowed imports per folder); it imports no `core/testing/*` module.
 */

import { getStrategy } from '../ai/registry';
import type { AIStrategy, AiContext } from '../ai/strategy';
import { cardCount } from '../core/board';
import { ALL_CARDS } from '../core/cards';
import { COMPLETED_CODE_LIMIT } from '../core/rules';
import { HAND_SIZE } from '../core/deck';
import { actingSeats, reduce } from '../core/engine';
import { mix32 } from '../core/prng';
import { NEUTRAL_COUNT, startingScoredGroups } from '../core/rules';
import { GUESS_MAX, GUESS_MIN } from '../core/score';
import { newGame } from '../core/state';
import type { GamePhase, GameState } from '../core/state';
import { SEATS, isPlayerId } from '../core/turn';
import type { Action, CardId, Difficulty, ErrorCode, PlayerId } from '../core/types';
import { viewFor } from '../core/view';
import type { PlayGameOptions, PlayGameResult } from './types';

// ---------------------------------------------------------------------------------------------------------
// Finite-execution guard
// ---------------------------------------------------------------------------------------------------------

/** At most 48 PLACE Actions exist: 52 cards minus the 4 Neutral_Cards (requirement 9.6). */
export const MAX_PLACEMENTS: number = ALL_CARDS.length - NEUTRAL_COUNT;

/**
 * Accepted Actions that can follow one PLACE: one `SUBMIT_GUESSES` per seat (4) and one `ACK_REVEAL` (1), plus the
 * PLACE itself: 1 + 4 + 1 = 6.
 */
export const MAX_ACTIONS_PER_PLACEMENT: number = 1 + SEATS.length + 1;

/** The most Actions any legal game can contain: 48 * 6 = 288 (a loose bound; real games are much shorter). */
export const MAX_LEGAL_ACTIONS: number = MAX_PLACEMENTS * MAX_ACTIONS_PER_PLACEMENT;

/** Slack on top of `MAX_LEGAL_ACTIONS`, so the guard can never reject a legal game even if the bound is off by a few. */
export const ACTION_GUARD_SLACK = 12;

/**
 * The default finite-execution guard: 288 + 12 = 300 accepted Actions. `playGame` throws `ActionLimitError` when a
 * game is not `ENDED` after this many accepted Actions. With a correct engine the guard is unreachable (the
 * termination argument of design.md: every PLACE fills one of at most 48 cells, and each batch needs exactly 4
 * submissions and one acknowledgement). It stays far below 100000, the stride of the seat part of the decision seed.
 */
export const DEFAULT_MAX_ACTIONS: number = MAX_LEGAL_ACTIONS + ACTION_GUARD_SLACK;

/** Seat part of the decision seed: `seatIndex * DECISION_SEED_SEAT_STRIDE + actionIndex` (design.md, AI section). */
export const DECISION_SEED_SEAT_STRIDE = 100000;

/**
 * The seed of one AI decision: `mix32(gameSeed, SEATS.indexOf(seat) * 100000 + actionIndex)`, with `actionIndex` the
 * number of Actions accepted before the decision (`state.log.length`).
 */
export function decisionSeed(gameSeed: number, seat: PlayerId, actionIndex: number): number {
  return mix32(gameSeed, SEATS.indexOf(seat) * DECISION_SEED_SEAT_STRIDE + actionIndex);
}

// ---------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------

/** Where a decision happened. Carried by the errors of the driver. */
export interface DecisionContext {
  readonly seed: number;
  /** The seat that was asked, or `null` for an Action of the driver itself (`ACK_REVEAL`). */
  readonly seat: PlayerId | null;
  /** `strategy.id` of the asked strategy, or `null` for an Action of the driver. */
  readonly tier: Difficulty | null;
  /** Number of Actions accepted before this decision (`state.log.length`). */
  readonly actionIndex: number;
  readonly phase: GamePhase;
}

const describeContext = (c: DecisionContext): string =>
  `seed ${c.seed}, action #${c.actionIndex}, phase ${c.phase}, seat ${c.seat ?? '(driver)'}, tier ${c.tier ?? '(driver)'}`;

/**
 * `reduce` rejected an Action. A strategy must only return Actions the engine accepts (requirement 11.2), so this is a
 * defect of the strategy (or of the engine). The driver does not retry and does not substitute another Action.
 *
 * `code` is the engine `ErrorCode`. One rejection is made by the driver and not by the engine: a strategy that
 * returns an Action which the engine accepts but which names another seat than the one that was asked gets
 * `code = 'NOT_YOUR_TURN'` (the engine's code for acting for another seat) and a `detail` that says so.
 */
export class IllegalAiActionError extends Error {
  readonly code: ErrorCode;
  readonly detail: string | undefined;
  readonly action: unknown;
  readonly context: DecisionContext;

  constructor(code: ErrorCode, detail: string | undefined, action: unknown, context: DecisionContext) {
    super(
      `illegal AI action rejected with ${code}${detail === undefined ? '' : ` (${detail})`} at ${describeContext(context)}: ${safeJson(action)}`,
    );
    this.name = 'IllegalAiActionError';
    this.code = code;
    this.detail = detail;
    this.action = action;
    this.context = context;
  }
}

/** A strategy threw while deciding. `cause` is the thrown value; the message adds the decision context. */
export class AiStrategyError extends Error {
  readonly context: DecisionContext;

  constructor(cause: unknown, context: DecisionContext) {
    super(`AI strategy threw at ${describeContext(context)}: ${cause instanceof Error ? cause.message : String(cause)}`, {
      cause,
    });
    this.name = 'AiStrategyError';
    this.context = context;
  }
}

/** The finite-execution guard was exceeded: the game was not `ENDED` after `limit` accepted Actions. */
export class ActionLimitError extends Error {
  readonly limit: number;
  readonly seed: number;
  readonly phase: GamePhase;
  readonly placements: number;
  readonly actionIndex: number;

  constructor(limit: number, state: GameState) {
    super(
      `game not ended after ${limit} accepted actions: seed ${state.seed}, phase ${state.phase}, ${state.placements} placements, ` +
        `turn ${state.turn}, log length ${state.log.length}`,
    );
    this.name = 'ActionLimitError';
    this.limit = limit;
    this.seed = state.seed;
    this.phase = state.phase;
    this.placements = state.placements;
    this.actionIndex = state.log.length;
  }
}

function safeJson(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text;
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------------------------------------

/**
 * The invariants that `checkStateInvariants` knows, by name.
 *
 * - `CARD_CONSERVATION`: the board, the four hands and the deck hold exactly the 52 catalog cards, each once.
 * - `BOARD_COUNT`: the board has 64 cells, `cardCount(board) = placements + 4`, 4 cells are Neutral and `placements`
 *   cells are owned by a seat.
 * - `SCORED_GROUPS_UNIQUE`: `scoredGroups` has no duplicate.
 * - `SCORED_GROUPS_COUNT`: `scoredGroups.length` = codes ever revealed + codes pending (+ the starting-group policy).
 * - `PENDING_PHASE`: `phase = GUESS_COLLECT` if and only if `pending` is non-null.
 * - `PENDING_BATCH`: a pending batch belongs to the turn seat, has fewer than 4 submissions, each with exactly the
 *   batch's Quad_Keys and Guesses that are integers in 4..52, and `endsGame` agrees with the placer's hand.
 * - `PHASE_VALID`: `phase` is one of the four phases.
 * - `TURN_VALID`: `turn` is one of P0..P3.
 * - `PHASE_SHAPE`: `REVEAL` has `lastReveal` of the turn seat and a non-empty hand; `ENDED` has no pending batch.
 * - `PHASE_TRANSITION`: (with a previous state) only PLACEMENT to PLACEMENT, GUESS_COLLECT or ENDED; GUESS_COLLECT to
 *   GUESS_COLLECT, REVEAL or ENDED; REVEAL to PLACEMENT; nothing leaves ENDED.
 * - `HAND_SIZE`: every hand has 0 to 3 cards (a hand starts with 3 and the draw rule never exceeds that).
 * - `SCORES_NON_NEGATIVE`: every score is a finite number of at least 0.
 * - `SCORES_MONOTONIC`: (with a previous state) no score decreases.
 * - `SCORE_CONSISTENCY`: every score equals the cumulative of the last reveal record (0 before the first) plus, for
 *   the bonus seat only, `handEmptyBonus`; the cumulative values chain from record to record.
 * - `HISTORY_CONSISTENCY`: `history[i].batchIndex = i`, `lastReveal` is the last record (or null when empty).
 * - `BONUS`: `bonusAwarded` is set only when an empty hand ended the game; a code-only finish has no bonus. With a
 *   previous state, an awarded bonus never changes: the bonus is applied exactly once.
 * - `LOG_CONSISTENCY`: `placements` = the number of PLACE entries of `log`; (with a previous state) `log` grew by one.
 * - `FROZEN`: the state is deeply frozen.
 */
export type InvariantName =
  | 'CARD_CONSERVATION'
  | 'BOARD_COUNT'
  | 'SCORED_GROUPS_UNIQUE'
  | 'SCORED_GROUPS_COUNT'
  | 'PENDING_PHASE'
  | 'PENDING_BATCH'
  | 'PHASE_VALID'
  | 'TURN_VALID'
  | 'PHASE_SHAPE'
  | 'PHASE_TRANSITION'
  | 'HAND_SIZE'
  | 'SCORES_NON_NEGATIVE'
  | 'SCORES_MONOTONIC'
  | 'SCORE_CONSISTENCY'
  | 'HISTORY_CONSISTENCY'
  | 'BONUS'
  | 'LOG_CONSISTENCY'
  | 'FROZEN'
  | 'PREVIOUS_STATE_MUTATED';

export interface InvariantFinding {
  readonly invariant: InvariantName;
  readonly detail: string;
}

/** An invariant failed. `invariant` names the first failed one; `findings` lists all that failed on that state. */
export class InvariantViolation extends Error {
  readonly invariant: InvariantName;
  readonly detail: string;
  readonly findings: readonly InvariantFinding[];
  readonly seed: number;
  readonly actionIndex: number;
  readonly phase: GamePhase;

  constructor(findings: readonly InvariantFinding[], state: GameState) {
    const first = findings[0] as InvariantFinding;
    super(
      `invariant ${first.invariant} violated: ${first.detail} (seed ${state.seed}, after ${state.log.length} actions, phase ${state.phase})` +
        (findings.length > 1 ? `; also: ${findings.slice(1).map((f) => f.invariant).join(', ')}` : ''),
    );
    this.name = 'InvariantViolation';
    this.invariant = first.invariant;
    this.detail = first.detail;
    this.findings = findings;
    this.seed = state.seed;
    this.actionIndex = state.log.length;
    this.phase = state.phase;
  }
}

const ALLOWED_TRANSITIONS: Readonly<Record<GamePhase, readonly GamePhase[]>> = {
  PLACEMENT: ['PLACEMENT', 'GUESS_COLLECT', 'ENDED'],
  GUESS_COLLECT: ['GUESS_COLLECT', 'REVEAL', 'ENDED'],
  REVEAL: ['PLACEMENT'],
  ENDED: [],
};

const CATALOG: ReadonlySet<string> = new Set<string>(ALL_CARDS);
const BOARD_CELLS = 64;

function isDeepFrozen(value: unknown, seen: WeakSet<object> = new WeakSet<object>()): boolean {
  if (typeof value !== 'object' || value === null) return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  for (const child of Object.values(value)) if (!isDeepFrozen(child, seen)) return false;
  return true;
}

/**
 * Every invariant that fails on `state` (empty array when all hold). Independent assertions over the state, not a second
 * engine. With `previous` (the state before the last accepted Action) the transition invariants are checked as well.
 * Pure; never throws for a structurally complete state. See `InvariantName` for the list.
 */
export function listInvariantViolations(state: GameState, previous?: GameState): InvariantFinding[] {
  const found: InvariantFinding[] = [];
  const add = (invariant: InvariantName, detail: string): void => {
    found.push({ invariant, detail });
  };

  // CARD_CONSERVATION and BOARD_COUNT.
  const onBoard: CardId[] = [];
  let neutralCells = 0;
  let seatCells = 0;
  for (const cell of state.board) {
    if (cell === null) continue;
    onBoard.push(cell.card);
    if (cell.owner === 'NEUTRAL') neutralCells++;
    else seatCells++;
  }
  const everyCard: CardId[] = [...onBoard, ...SEATS.flatMap((seat) => state.hands[seat] ?? []), ...state.deck];
  const counts = new Map<string, number>();
  for (const card of everyCard) counts.set(card, (counts.get(card) ?? 0) + 1);
  const duplicated = [...counts].filter(([, n]) => n > 1).map(([card]) => card);
  const missing = ALL_CARDS.filter((card) => !counts.has(card));
  const unknown = [...counts.keys()].filter((card) => !CATALOG.has(card));
  if (everyCard.length !== ALL_CARDS.length || duplicated.length > 0 || missing.length > 0 || unknown.length > 0) {
    add(
      'CARD_CONSERVATION',
      `${everyCard.length} cards instead of ${ALL_CARDS.length}; duplicated [${duplicated.join(' ')}]; missing [${missing.join(' ')}]; unknown [${unknown.join(' ')}]`,
    );
  }
  const occupied = cardCount(state.board);
  if (
    state.board.length !== BOARD_CELLS ||
    occupied !== state.placements + NEUTRAL_COUNT ||
    neutralCells !== NEUTRAL_COUNT ||
    seatCells !== state.placements
  ) {
    add(
      'BOARD_COUNT',
      `${state.board.length} cells, ${occupied} occupied (${neutralCells} neutral, ${seatCells} placed) with placements ${state.placements}`,
    );
  }

  // scoredGroups.
  if (new Set(state.scoredGroups).size !== state.scoredGroups.length) {
    add('SCORED_GROUPS_UNIQUE', `scoredGroups has duplicates (${state.scoredGroups.length} entries)`);
  }
  const revealedCodes = state.history.reduce((n, record) => n + record.codes.length, 0);
  const pendingCodes = state.pending === null ? 0 : state.pending.codes.length;
  const expectedGroups = startingScoredGroups().length + revealedCodes + pendingCodes;
  if (state.scoredGroups.length !== expectedGroups) {
    add(
      'SCORED_GROUPS_COUNT',
      `scoredGroups has ${state.scoredGroups.length} entries, expected ${expectedGroups} (${revealedCodes} revealed + ${pendingCodes} pending)`,
    );
  }

  // Phase, turn, pending.
  const phaseKnown = Object.hasOwn(ALLOWED_TRANSITIONS, state.phase);
  if (!phaseKnown) add('PHASE_VALID', `unknown phase ${String(state.phase)}`);
  if (!isPlayerId(state.turn)) add('TURN_VALID', `turn is ${String(state.turn)}`);
  if ((state.pending !== null) !== (state.phase === 'GUESS_COLLECT')) {
    add('PENDING_PHASE', `phase ${state.phase} with pending ${state.pending === null ? 'null' : 'set'}`);
  }
  if (state.pending !== null) {
    const batch = state.pending;
    const keys = batch.codes.map((code) => code.quadKey).sort();
    const submitted = SEATS.filter((seat) => batch.guesses[seat] !== undefined);
    const problems: string[] = [];
    if (batch.codes.length === 0) problems.push('no codes');
    if (batch.placer !== state.turn) problems.push(`placer ${batch.placer} is not the turn seat ${state.turn}`);
    if (submitted.length >= SEATS.length) problems.push('all seats submitted but the batch is still pending');
    const shouldEnd = state.hands[batch.placer]?.length === 0 || state.scoredGroups.length >= COMPLETED_CODE_LIMIT;
    if (batch.endsGame !== shouldEnd) problems.push('endsGame disagrees with the hand and code limit');
    for (const seat of submitted) {
      const guesses = batch.guesses[seat] as Readonly<Record<string, number>>;
      if (JSON.stringify(Object.keys(guesses).sort()) !== JSON.stringify(keys)) problems.push(`${seat} guess keys differ from the batch`);
      for (const value of Object.values(guesses)) {
        if (!Number.isInteger(value) || value < GUESS_MIN || value > GUESS_MAX) problems.push(`${seat} guess ${String(value)} out of range`);
      }
    }
    if (problems.length > 0) add('PENDING_BATCH', problems.join('; '));
  }
  if (state.phase === 'REVEAL') {
    if (state.lastReveal === null || state.lastReveal.placer !== state.turn || (state.hands[state.turn]?.length ?? 0) === 0) {
      add('PHASE_SHAPE', 'REVEAL needs lastReveal of the turn seat and a non-empty hand of that seat');
    }
  }

  // Hands.
  for (const seat of SEATS) {
    const size = state.hands[seat]?.length;
    if (size === undefined || size < 0 || size > HAND_SIZE) add('HAND_SIZE', `${seat} holds ${String(size)} cards`);
  }

  // Scores.
  for (const seat of SEATS) {
    const value = state.scores[seat];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      add('SCORES_NON_NEGATIVE', `${seat} has score ${String(value)}`);
    }
  }
  let chainOk = true;
  let cumulative: Record<PlayerId, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (let index = 0; index < state.history.length; index++) {
    const record = state.history[index] as (typeof state.history)[number];
    const next = { ...cumulative };
    for (const seat of SEATS) {
      const entry = record.perPlayer.find((p) => p.player === seat);
      if (entry === undefined || entry.cumulative !== cumulative[seat] + entry.earned) chainOk = false;
      else next[seat] = entry.cumulative;
    }
    cumulative = next;
    if (record.batchIndex !== index) add('HISTORY_CONSISTENCY', `history[${index}].batchIndex is ${record.batchIndex}`);
  }
  const lastRecord = state.history[state.history.length - 1] ?? null;
  if (state.lastReveal !== lastRecord && JSON.stringify(state.lastReveal) !== JSON.stringify(lastRecord)) {
    add('HISTORY_CONSISTENCY', 'lastReveal is not the last history record');
  }
  if (!chainOk) add('SCORE_CONSISTENCY', 'cumulative values of the reveal records do not chain from earned values');
  const bonus = state.config.scoreConfig.config.handEmptyBonus;
  for (const seat of SEATS) {
    const expected = cumulative[seat] + (state.bonusAwarded === seat ? bonus : 0);
    if (state.scores[seat] !== expected) {
      add('SCORE_CONSISTENCY', `${seat} has score ${state.scores[seat]}, history and bonus give ${expected}`);
    }
  }

  // Bonus applied exactly once, at ENDED.
  const emptyHand = SEATS.find((seat) => state.hands[seat]?.length === 0);
  if (state.deck.length === 0 && state.phase !== 'ENDED') add('PHASE_SHAPE', 'empty deck before ENDED');
  if (state.phase === 'ENDED' && !emptyHand && state.deck.length > 0 && state.scoredGroups.length < COMPLETED_CODE_LIMIT) {
    add('PHASE_SHAPE', 'ENDED without an empty hand, an empty deck or five codes');
  }
  if (state.bonusAwarded !== (state.phase === 'ENDED' ? emptyHand ?? null : null)) {
    add('BONUS', `phase ${state.phase} with bonusAwarded ${String(state.bonusAwarded)}`);
  }
  if (state.phase === 'ENDED' && state.pending !== null) add('PHASE_SHAPE', 'ENDED with a pending batch');

  // Log.
  const placeEntries = state.log.filter((entry) => entry.type === 'PLACE').length;
  if (placeEntries !== state.placements) {
    add('LOG_CONSISTENCY', `placements ${state.placements} but the log has ${placeEntries} PLACE entries`);
  }

  // Immutability.
  if (!isDeepFrozen(state)) add('FROZEN', 'the state is not deeply frozen');

  // Transition invariants.
  if (previous !== undefined) {
    if (!(ALLOWED_TRANSITIONS[previous.phase] ?? []).includes(state.phase)) {
      add('PHASE_TRANSITION', `${previous.phase} to ${state.phase} is not a legal transition`);
    }
    for (const seat of SEATS) {
      if (state.scores[seat] < previous.scores[seat]) {
        add('SCORES_MONOTONIC', `${seat} score fell from ${previous.scores[seat]} to ${state.scores[seat]}`);
      }
    }
    if (previous.bonusAwarded !== null && state.bonusAwarded !== previous.bonusAwarded) {
      add('BONUS', `bonusAwarded changed from ${previous.bonusAwarded} to ${String(state.bonusAwarded)}`);
    }
    if (state.log.length !== previous.log.length + 1) {
      add('LOG_CONSISTENCY', `log grew from ${previous.log.length} to ${state.log.length} entries instead of by one`);
    }
  }
  return found;
}

/**
 * Throws `InvariantViolation` (first failed invariant in `.invariant`, all in `.findings`) when `state` breaks an
 * invariant of design.md "Invariants" (see `InvariantName`). With `previous` the transition invariants are included.
 * Exported for the end-to-end test (task 13.2).
 */
export function checkStateInvariants(state: GameState, previous?: GameState): void {
  const findings = listInvariantViolations(state, previous);
  if (findings.length > 0) throw new InvariantViolation(findings, state);
}

// ---------------------------------------------------------------------------------------------------------
// The driver
// ---------------------------------------------------------------------------------------------------------

/** Helper for tests and simulations: the strategies of a difficulty assignment, from the registry. */
export function strategiesFor(difficulties: Readonly<Record<PlayerId, Difficulty>>): Record<PlayerId, AIStrategy> {
  return {
    P0: getStrategy(difficulties.P0),
    P1: getStrategy(difficulties.P1),
    P2: getStrategy(difficulties.P2),
    P3: getStrategy(difficulties.P3),
  };
}

function validateOptions(o: PlayGameOptions): number {
  if (typeof o !== 'object' || o === null) throw new RangeError('playGame: options must be an object');
  for (const seat of SEATS) {
    const strategy = (o.strategies as Partial<Record<PlayerId, AIStrategy>> | undefined)?.[seat];
    if (
      typeof strategy !== 'object' ||
      strategy === null ||
      typeof strategy.choosePlacement !== 'function' ||
      typeof strategy.chooseGuesses !== 'function'
    ) {
      throw new RangeError(`playGame: no strategy for seat ${seat}`);
    }
  }
  const limit = o.maxActions ?? DEFAULT_MAX_ACTIONS;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError(`playGame: maxActions must be a positive integer, got ${String(o.maxActions)}`);
  }
  return limit;
}

/**
 * Plays one complete game headless. See the module comment for the algorithm, the decision seed, the guard and the
 * errors. Returns the final state (`ENDED`) and a copy of its log.
 *
 * Options: `seed`, `config`, `strategies` (one per seat), `checkInvariants` (default true) and `maxActions` (default
 * `DEFAULT_MAX_ACTIONS`).
 *
 * @throws RangeError, IllegalAiActionError, AiStrategyError, InvariantViolation, ActionLimitError
 */
export function playGame(o: PlayGameOptions): PlayGameResult {
  const limit = validateOptions(o);
  const created = newGame({ seed: o.seed, config: o.config });
  if (!created.ok) {
    throw new RangeError(`playGame: newGame rejected the seed or configuration: ${created.error.code} ${created.error.detail ?? ''}`.trim());
  }
  const check = o.checkInvariants !== false;
  let state: GameState = created.value;
  if (check) checkStateInvariants(state);

  while (state.phase !== 'ENDED') {
    if (state.log.length >= limit) throw new ActionLimitError(limit, state);

    let action: unknown;
    let seat: PlayerId | null = null;
    let tier: Difficulty | null = null;
    const phase = state.phase;
    const actionIndex = state.log.length;

    if (phase === 'REVEAL') {
      action = { type: 'ACK_REVEAL' } satisfies Action;
    } else {
      seat = actingSeats(state)[0] ?? null;
      if (seat === null) throw new Error(`playGame: no acting seat in phase ${phase} (seed ${state.seed}, action #${actionIndex})`);
      const strategy = o.strategies[seat];
      tier = strategy.id;
      const context: DecisionContext = { seed: state.seed, seat, tier, actionIndex, phase };
      const ctx: AiContext = Object.freeze({ decisionSeed: decisionSeed(state.seed, seat, actionIndex) });
      const view = viewFor(state, seat);
      try {
        action = phase === 'PLACEMENT' ? strategy.choosePlacement(view, ctx) : strategy.chooseGuesses(view, ctx);
      } catch (thrown) {
        throw new AiStrategyError(thrown, context);
      }
    }

    const context: DecisionContext = { seed: state.seed, seat, tier, actionIndex, phase };
    const fingerprint = check ? JSON.stringify(state) : '';
    const next = reduce(state, action as Action);
    if (!next.ok) throw new IllegalAiActionError(next.error.code, next.error.detail, action, context);
    const actor = (action as { readonly player?: unknown }).player;
    if (seat !== null && actor !== seat) {
      throw new IllegalAiActionError('NOT_YOUR_TURN', `the strategy of ${seat} returned an action for ${String(actor)}`, action, context);
    }
    if (check) {
      if (JSON.stringify(state) !== fingerprint) {
        throw new InvariantViolation([{ invariant: 'PREVIOUS_STATE_MUTATED', detail: 'reduce changed the state it was given' }], state);
      }
      checkStateInvariants(next.value, state);
    }
    state = next.value;
  }

  return { final: state, log: Object.freeze([...state.log]) };
}

// ---------------------------------------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------------------------------------

/** Numbers derived from a finished game, for tests and simulations. Not part of `PlayGameResult`. */
export interface GameSummary {
  /** Accepted PLACE Actions (at most 48). */
  readonly placements: number;
  /** Prediction_Batches, equal to the number of `history` records. */
  readonly batches: number;
  /** Composite_Codes revealed. */
  readonly codes: number;
  /** Batches with two or more codes. */
  readonly multiCodeBatches: number;
  /** `SUBMIT_GUESSES` Actions (4 per batch). */
  readonly submissions: number;
  /** `ACK_REVEAL` Actions issued by the driver (a batch that ends the game needs none). */
  readonly acknowledgements: number;
  /** All accepted Actions. */
  readonly actions: number;
  readonly bonusSeat: PlayerId | null;
}

/** Derives the counts of a finished game from its final state and log. Pure. */
export function summarizeGame(result: PlayGameResult): GameSummary {
  const { final, log } = result;
  return {
    placements: log.filter((a) => a.type === 'PLACE').length,
    batches: final.history.length,
    codes: final.history.reduce((n, record) => n + record.codes.length, 0),
    multiCodeBatches: final.history.filter((record) => record.codes.length >= 2).length,
    submissions: log.filter((a) => a.type === 'SUBMIT_GUESSES').length,
    acknowledgements: log.filter((a) => a.type === 'ACK_REVEAL').length,
    actions: log.length,
    bonusSeat: final.bonusAwarded,
  };
}
