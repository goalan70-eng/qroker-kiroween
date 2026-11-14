/**
 * The reducer of the QRoker game engine (task 8.2).
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "Reducer (`core/engine.ts`)", the Game Phase State
 * Machine and the Error Handling table.
 * Requirements: 3.2 to 3.7 (placement, turn ownership, hand), 6.2 to 6.6 (turn order, draw rule), 7.1 to 7.4,
 * 7.6, 7.9 (guess collection, simultaneous reveal), 8.1, 8.6 to 8.8 (scoring, hand-empty bonus), 9.1 to 9.3, 9.7
 * (game end, no action after `ENDED`).
 *
 * `reduce(state, action)` is pure and deterministic. It never mutates, freezes or keeps a reference to its
 * arguments. A rejected action returns `{ ok: false, error }` and creates no new state (the caller keeps the
 * input state, which is unchanged). An accepted action returns a NEW state that is deeply frozen and whose `log`
 * ends with a normalized copy of the action.
 *
 * Phase machine (design.md):
 *   PLACEMENT    --PLACE, no code, hand not empty-->        PLACEMENT (turn = nextSeat)
 *   PLACEMENT    --PLACE, no code, hand reaches 0-->        ENDED (bonus)
 *   PLACEMENT    --PLACE, 1 or more new codes-->            GUESS_COLLECT (pending batch)
 *   GUESS_COLLECT--SUBMIT_GUESSES, not all 4 seats yet-->   GUESS_COLLECT
 *   GUESS_COLLECT--last SUBMIT_GUESSES, placer hand > 0-->  REVEAL
 *   GUESS_COLLECT--last SUBMIT_GUESSES, placer hand = 0-->  ENDED (reveal, then bonus; no ACK_REVEAL needed)
 *   REVEAL       --ACK_REVEAL-->                            PLACEMENT (turn = nextSeat(placer))
 *   ENDED        --any action-->                            rejected with GAME_ENDED
 *
 * Validation order of every action: `GAME_ENDED` (phase `ENDED`), `WRONG_PHASE`, then the action's own checks.
 * PLACE: `UNKNOWN_PLAYER`, `NOT_YOUR_TURN`, `CARD_NOT_IN_HAND`, then the board's `INVALID_ORIENTATION`,
 * `OUT_OF_BOUNDS`, `OCCUPIED`, `NOT_ADJACENT`. SUBMIT_GUESSES: `UNKNOWN_PLAYER`, `DUPLICATE_SUBMISSION`, the
 * per-value `GUESS_NOT_INTEGER` / `GUESS_OUT_OF_RANGE`, then `GUESS_KEYS_MISMATCH`.
 *
 * Interpretation notes (where the design text is ambiguous):
 * - The design lists the `UNKNOWN_PLAYER` check after `NOT_YOUR_TURN` in PLACE; that order would make
 *   `UNKNOWN_PLAYER` unreachable (an unknown id is never the turn seat), so the unknown-player check comes first.
 * - A second submission by a seat is `DUPLICATE_SUBMISSION` whatever its content (requirement 7.3); the design
 *   text lists the duplicate check last, which would hide it behind a content error of the second submission.
 * - `RevealRecord.perPlayer[].cumulative` is the score after the batch's prediction scores and BEFORE the
 *   hand-empty bonus. The bonus is added to `state.scores` after the reveal (requirement 9.1); the record holds
 *   no bonus.
 * - `actingSeats(state)` takes the whole state (design signature), because the seats that still have to submit
 *   are part of the pending batch.
 *
 * Privacy: guess values live only in `pending.guesses` (sealed, cleared at the reveal) and in the `log` entries of
 * the accepted `SUBMIT_GUESSES` actions. `RevealRecord`, `history`, `lastReveal` and every other field of the state
 * hold no guess value. The log is internal (D5: saves are replay logs); a view must never expose it.
 *
 * Score values enter only through `state.config.scoreConfig` (requirement 8.4). The starting-group policy
 * (OQ-3) is applied by `newGame` through `scoredGroups`; the reducer has no special case for the neutral cards.
 *
 * Pure: no DOM, no node, no randomness, no clock, no import from `src/optical`.
 */

import { placeOnBoard } from './board';
import { detect } from './composite-code';
import { applyDraw, markFirstPlacement, shouldDraw } from './draw';
import { score, validateGuess } from './score';
import { deepFreeze } from './state';
import type { GameState, PendingBatch, RevealRecord } from './state';
import { SEATS, isPlayerId, nextSeat } from './turn';
import type { Action, CardId, ErrorCode, GridPosition, Orientation, PlayerId, QuadKey, Result } from './types';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function fail(code: ErrorCode, detail: string): Result<never> {
  return { ok: false, error: { code, detail } };
}

function ok(state: GameState): Result<GameState> {
  return { ok: true, value: deepFreeze(state) };
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The seats that may act now (design: "turn seat; unsubmitted seats; none when ENDED").
 * - `PLACEMENT`: the turn seat.
 * - `GUESS_COLLECT`: every seat that has not submitted yet, in seat order (all four at the start of a batch).
 * - `REVEAL`: the placing seat (still `state.turn`). `ACK_REVEAL` carries no seat, so `reduce` accepts it from the
 *   caller whatever the seat; the list tells a controller whose acknowledgement it is waiting for.
 * - `ENDED`: nobody.
 */
export function actingSeats(state: GameState): readonly PlayerId[] {
  switch (state.phase) {
    case 'PLACEMENT':
      return [state.turn];
    case 'GUESS_COLLECT': {
      const submitted = state.pending?.guesses ?? {};
      return SEATS.filter((seat) => submitted[seat] === undefined);
    }
    case 'REVEAL':
      return [state.lastReveal?.placer ?? state.turn];
    case 'ENDED':
      return [];
  }
}

/** Adds `handEmptyBonus` to `seat` once. Returns the scores unchanged when a bonus was already awarded. */
function withBonus(state: GameState, scores: Record<PlayerId, number>, seat: PlayerId): Record<PlayerId, number> {
  if (state.bonusAwarded !== null) return scores;
  return { ...scores, [seat]: scores[seat] + state.config.scoreConfig.config.handEmptyBonus };
}

function reducePlace(state: GameState, action: Extract<Action, { type: 'PLACE' }>): Result<GameState> {
  if (state.phase !== 'PLACEMENT') return fail('WRONG_PHASE', `PLACE is not available in phase ${state.phase}`);
  const player: unknown = action.player;
  if (!isPlayerId(player)) return fail('UNKNOWN_PLAYER', `unknown player ${String(player)}`);
  if (player !== state.turn) return fail('NOT_YOUR_TURN', `it is the turn of ${state.turn}, not ${player}`);
  const hand = state.hands[player];
  const card: CardId = action.card;
  if (!hand.includes(card)) return fail('CARD_NOT_IN_HAND', `card ${String(card)} is not in the hand of ${player}`);

  // A position that is not an object is treated as a cell outside the board (after the orientation check).
  const rawPos: unknown = action.pos;
  const pos: GridPosition = isRecord(rawPos)
    ? { row: rawPos.row as number, col: rawPos.col as number }
    : { row: Number.NaN, col: Number.NaN };

  // `placeOnBoard` validates in the design's precedence: orientation, bounds, occupancy, adjacency.
  const placed = placeOnBoard(state.board, pos, { card, orientation: action.orientation, owner: player });
  if (!placed.ok) return { ok: false, error: placed.error };
  const board = placed.value;
  const orientation: Orientation = action.orientation === 180 ? 180 : 0;

  // Step 5: newly completed, not yet scored codes (ordered by quadKey).
  const codes = detect(board, pos, new Set(state.scoredGroups));
  const scoredGroups = [...new Set([...state.scoredGroups, ...codes.map((code) => code.groupId)])].sort(compareText);

  // Step 6: the draw verdict uses `firstPlacementDone` BEFORE this placement is recorded.
  const draw = shouldDraw(player, state.firstPlacementDone, codes.length);
  const firstPlacementDone = markFirstPlacement(state.firstPlacementDone, player);
  const drawn = applyDraw(
    state.deck,
    hand.filter((c) => c !== card),
    draw,
  );

  const logEntry: Action = { type: 'PLACE', player, card, pos: { row: pos.row, col: pos.col }, orientation };
  const next = {
    ...state,
    board,
    deck: drawn.deck,
    hands: { ...state.hands, [player]: drawn.hand } as Record<PlayerId, readonly CardId[]>,
    firstPlacementDone,
    scoredGroups,
    placements: state.placements + 1,
    log: [...state.log, logEntry],
  };

  // Step 7: one or more codes open a prediction batch.
  if (codes.length >= 1) {
    const pending: PendingBatch = { placer: player, codes, guesses: {}, endsGame: drawn.hand.length === 0 };
    return ok({ ...next, phase: 'GUESS_COLLECT', pending });
  }
  // Step 8: a hand-emptying placement without a code ends the game at once.
  if (drawn.hand.length === 0) {
    return ok({
      ...next,
      phase: 'ENDED',
      scores: withBonus(state, { ...state.scores }, player),
      bonusAwarded: state.bonusAwarded ?? player,
    });
  }
  // Step 9: the turn passes on.
  return ok({ ...next, turn: nextSeat(player) });
}

/** Validates one submission against the batch. Returns the normalized guesses (one per Quad_Key, batch order). */
function checkGuesses(pending: PendingBatch, raw: unknown): Result<Record<QuadKey, number>> {
  if (!isRecord(raw)) return fail('GUESS_KEYS_MISMATCH', 'guesses must be an object keyed by Quad_Key');
  const keys = Object.keys(raw);
  for (const key of keys) {
    const checked = validateGuess(raw[key]);
    if (!checked.ok) return { ok: false, error: { code: checked.error.code, detail: `${key}: ${checked.error.detail ?? ''}` } };
  }
  const expected = pending.codes.map((code) => code.quadKey);
  const sameKeys = keys.length === expected.length && expected.every((key) => Object.hasOwn(raw, key));
  if (!sameKeys) {
    return fail('GUESS_KEYS_MISMATCH', `a guess is required for exactly these codes: ${expected.join(', ')}`);
  }
  const normalized: Record<QuadKey, number> = {};
  for (const key of expected) normalized[key] = raw[key] as number;
  return { ok: true, value: normalized };
}

function reduceSubmit(state: GameState, action: Extract<Action, { type: 'SUBMIT_GUESSES' }>): Result<GameState> {
  const pending = state.pending;
  if (state.phase !== 'GUESS_COLLECT' || pending === null) {
    return fail('WRONG_PHASE', `SUBMIT_GUESSES is not available in phase ${state.phase}`);
  }
  const player: unknown = action.player;
  if (!isPlayerId(player)) return fail('UNKNOWN_PLAYER', `unknown player ${String(player)}`);
  if (pending.guesses[player] !== undefined) return fail('DUPLICATE_SUBMISSION', `${player} has already submitted`);
  const checked = checkGuesses(pending, action.guesses);
  if (!checked.ok) return checked;

  const guesses = { ...pending.guesses, [player]: checked.value } as PendingBatch['guesses'];
  const log: readonly Action[] = [...state.log, { type: 'SUBMIT_GUESSES', player, guesses: checked.value }];

  if (!SEATS.every((seat) => guesses[seat] !== undefined)) {
    return ok({ ...state, pending: { ...pending, guesses }, log });
  }
  return ok(revealBatch(state, pending, guesses, log));
}

/**
 * All four seats have submitted: scores every guess against its Hidden_Sum, adds the earned points to the
 * cumulative scores, publishes one guess-free `RevealRecord`, clears the sealed batch and moves to `REVEAL`
 * (or to `ENDED` with the hand-empty bonus when the placement emptied the placer's hand).
 */
function revealBatch(
  state: GameState,
  pending: PendingBatch,
  guesses: PendingBatch['guesses'],
  log: readonly Action[],
): GameState {
  const table = state.config.scoreConfig.config;
  let scores = { ...state.scores };
  const perPlayer: { player: PlayerId; earned: number; cumulative: number }[] = [];
  for (const seat of SEATS) {
    const seatGuesses = guesses[seat] as Readonly<Record<QuadKey, number>>;
    let earned = 0;
    for (const code of pending.codes) earned += score(seatGuesses[code.quadKey] as number, code.hiddenSum, table);
    scores = { ...scores, [seat]: scores[seat] + earned };
    perPlayer.push({ player: seat, earned, cumulative: scores[seat] });
  }
  const record: RevealRecord = {
    batchIndex: state.history.length,
    placer: pending.placer,
    codes: pending.codes.map((code) => ({ quadKey: code.quadKey, cards: [...code.cards], hiddenSum: code.hiddenSum })),
    perPlayer,
  };
  const next = {
    ...state,
    pending: null,
    history: [...state.history, record],
    lastReveal: record,
    revealedCards: [...state.revealedCards, ...pending.codes.flatMap((code) => code.cards)],
    log,
  };
  if (pending.endsGame) {
    return {
      ...next,
      phase: 'ENDED',
      scores: withBonus(state, scores, pending.placer),
      bonusAwarded: state.bonusAwarded ?? pending.placer,
    };
  }
  return { ...next, phase: 'REVEAL', scores };
}

function reduceAck(state: GameState): Result<GameState> {
  if (state.phase !== 'REVEAL') return fail('WRONG_PHASE', `ACK_REVEAL is not available in phase ${state.phase}`);
  const placer = state.lastReveal?.placer ?? state.turn;
  const log: readonly Action[] = [...state.log, { type: 'ACK_REVEAL' }];
  return ok({ ...state, phase: 'PLACEMENT', turn: nextSeat(placer), log });
}

/**
 * Applies one action. See the module comment for the phase machine and the validation order.
 * Any rejection returns the error and nothing else; the input state is never touched.
 */
export function reduce(state: GameState, action: Action): Result<GameState> {
  if (state.phase === 'ENDED') return fail('GAME_ENDED', 'the game has ended');
  const type: unknown = isRecord(action) ? action.type : undefined;
  switch (type) {
    case 'PLACE':
      return reducePlace(state, action as Extract<Action, { type: 'PLACE' }>);
    case 'SUBMIT_GUESSES':
      return reduceSubmit(state, action as Extract<Action, { type: 'SUBMIT_GUESSES' }>);
    case 'ACK_REVEAL':
      return reduceAck(state);
    default:
      return fail('WRONG_PHASE', `unknown action type ${String(type)}`);
  }
}
