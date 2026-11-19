/**
 * Isolated experimental headless driver for rule comparisons.
 *
 * This module deliberately leaves the production deck, reducer, configuration, save format,
 * UI and replay protocol unchanged. Only the initial shuffled partition and an additional
 * post-reveal stopping boundary may differ from the published four-card rules.
 *
 * A CODE_LIMIT result is a fully scored REVEAL snapshot, not a core ENDED state. It must NOT
 * be passed to standard save/replay as a finished game. The simulator decides ranking from
 * the public scores at that boundary without forging a reducer Action or a hand-empty bonus.
 */
import type { AIStrategy, AiContext } from '../ai/strategy';
import { ALL_CARDS } from '../core/cards';
import { HAND_SIZE, NEUTRAL_COUNT } from '../core/deck';
import { actingSeats, reduce } from '../core/engine';
import { mulberry32, shuffle } from '../core/prng';
import { rankPlayers } from '../core/ranking';
import { deepFreeze, newGame } from '../core/state';
import type { GameState } from '../core/state';
import { SEATS } from '../core/turn';
import type { Action, CardId, GameConfig, PlayerId } from '../core/types';
import { viewFor } from '../core/view';
import {
  ActionLimitError, AiStrategyError, DEFAULT_MAX_ACTIONS, IllegalAiActionError,
  InvariantViolation, checkStateInvariants, decisionSeed,
} from './play-game';
import type { DecisionContext } from './play-game';

export type ExperimentalStopReason = 'HAND_EMPTY' | 'CODE_LIMIT' | 'BOTH';

export interface ExperimentalOptions {
  readonly seed: number;
  readonly config: GameConfig;
  readonly strategies: Readonly<Record<PlayerId, AIStrategy>>;
  /** 1..4. The published game and core invariant checker support a maximum hand of four. Default: 4. */
  readonly handSize?: number;
  /** Newly completed codes across all seats, not prediction submissions/batches. null = no extra limit. */
  readonly codeLimit?: number | null;
  readonly checkInvariants?: boolean;
  readonly maxActions?: number;
}

export interface ExperimentalResult {
  readonly seed: number;
  readonly handSize: number;
  readonly codeLimit: number | null;
  readonly stopReason: ExperimentalStopReason;
  /** Last reducer state; phase REVEAL on CODE_LIMIT (never artificially coerced to ENDED). */
  readonly snapshot: GameState;
  readonly actions: readonly Action[];
  readonly placements: number;
  readonly completedCodes: number;
  readonly predictionBatches: number;
  readonly scores: Readonly<Record<PlayerId, number>>;
  readonly ranks: Readonly<Record<PlayerId, number>>;
  readonly bonusSeat: PlayerId | null;
}

const MAX_CODE_LIMIT = (8 - 1) * (8 - 1) - 1; // 49 quads, excluding the starting neutral 2x2

/** Validation shared by initial-deal experiments and full matches. */
export function validateExperimentalHandSize(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > HAND_SIZE) {
    throw new RangeError('handSize must be an integer from 1 to ' + HAND_SIZE);
  }
  return value;
}

export function validateExperimentalCodeLimit(value: number | null): number | null {
  if (value !== null && (!Number.isInteger(value) || value < 1 || value > MAX_CODE_LIMIT)) {
    throw new RangeError('codeLimit must be null or an integer from 1 to ' + MAX_CODE_LIMIT);
  }
  return value;
}

/**
 * Use the identical, seeded shuffle as core/deck.ts but repartition it into the requested
 * smaller hands. Original 4-card deals are returned untouched, protecting baseline parity.
 * The 52 cards remain conserved: 4 neutral + 4 * handSize + remaining deck.
 */
export function experimentalInitialState(
  seed: number, config: GameConfig, handSize: number = HAND_SIZE,
): GameState {
  validateExperimentalHandSize(handSize);
  const created = newGame({ seed, config });
  if (!created.ok) {
    throw new RangeError('experimental newGame rejected options: ' + created.error.code);
  }
  if (handSize === HAND_SIZE) return created.value;

  const shuffled = shuffle(ALL_CARDS, mulberry32(seed));
  const neutral = created.value.board.filter((cell) => cell?.owner === 'NEUTRAL').map((cell) => cell?.card);
  if (JSON.stringify(neutral) !== JSON.stringify(shuffled.slice(0, NEUTRAL_COUNT))) {
    throw new Error('experimental shuffle no longer matches production neutral deal');
  }

  const hands = {} as Record<PlayerId, readonly CardId[]>;
  SEATS.forEach((seat, i) => {
    const from = NEUTRAL_COUNT + i * handSize;
    hands[seat] = shuffled.slice(from, from + handSize);
  });
  const deck = shuffled.slice(NEUTRAL_COUNT + SEATS.length * handSize);
  return deepFreeze({ ...created.value, hands, deck });
}

function countCodes(state: GameState): number {
  return state.history.reduce((sum, record) => sum + record.codes.length, 0);
}

/**
 * Reuses core/engine.reduce for every real action. The extra code-count ending occurs only
 * after all four guesses have been scored, at the public REVEAL boundary. No bonus is given
 * for a code-count-only ending. If a hand empties on that same batch, the existing engine
 * awards the bonus and the stop reason records BOTH.
 */
export function runExperimentalGame(o: ExperimentalOptions): ExperimentalResult {
  if (typeof o !== 'object' || o === null) throw new RangeError('experimental options required');
  const handSize = validateExperimentalHandSize(o.handSize ?? HAND_SIZE);
  const codeLimit = validateExperimentalCodeLimit(o.codeLimit ?? null);
  const maxActions = o.maxActions ?? DEFAULT_MAX_ACTIONS;
  if (!Number.isSafeInteger(maxActions) || maxActions < 1) {
    throw new RangeError('maxActions must be a positive integer');
  }
  for (const seat of SEATS) {
    const strategy = o.strategies?.[seat];
    if (!strategy || typeof strategy.choosePlacement !== 'function' || typeof strategy.chooseGuesses !== 'function') {
      throw new RangeError('missing strategy for ' + seat);
    }
  }

  let state = experimentalInitialState(o.seed, o.config, handSize);
  const check = o.checkInvariants !== false;
  if (check) checkStateInvariants(state);

  while (state.phase !== 'ENDED') {
    // A code threshold never interrupts private guesses, nor a multi-code batch.
    if (codeLimit !== null && state.phase === 'REVEAL' && countCodes(state) >= codeLimit) break;
    if (state.log.length >= maxActions) throw new ActionLimitError(maxActions, state);

    const phase = state.phase;
    const actionIndex = state.log.length;
    let action: Action;
    let seat: PlayerId | null = null;
    let tier: AIStrategy['id'] | null = null;

    if (phase === 'REVEAL') {
      action = { type: 'ACK_REVEAL' };
    } else {
      seat = actingSeats(state)[0] ?? null;
      if (seat === null) throw new Error('no acting seat in experimental phase ' + phase);
      const strategy = o.strategies[seat];
      tier = strategy.id;
      const context: DecisionContext = { seed: state.seed, seat, tier, phase, actionIndex };
      const ctx: AiContext = Object.freeze({ decisionSeed: decisionSeed(state.seed, seat, actionIndex) });
      const view = viewFor(state, seat);
      try {
        action = phase === 'PLACEMENT' ? strategy.choosePlacement(view, ctx) : strategy.chooseGuesses(view, ctx);
      } catch (error) {
        throw new AiStrategyError(error, context);
      }
    }

    const context: DecisionContext = { seed: state.seed, seat, tier, phase, actionIndex };
    const before = check ? JSON.stringify(state) : '';
    const next = reduce(state, action);
    if (!next.ok) throw new IllegalAiActionError(next.error.code, next.error.detail, action, context);
    if (seat !== null && action.type !== 'ACK_REVEAL' && action.player !== seat) {
      throw new IllegalAiActionError('NOT_YOUR_TURN', 'strategy submitted for another seat', action, context);
    }
    if (check) {
      if (JSON.stringify(state) !== before) {
        throw new InvariantViolation([{ invariant: 'PREVIOUS_STATE_MUTATED', detail: 'reducer mutated prior state' }], state);
      }
      checkStateInvariants(next.value, state);
    }
    state = next.value;
  }

  const completedCodes = countCodes(state);
  const reachedCodeLimit = codeLimit !== null && completedCodes >= codeLimit;
  const stoppedByEmptyHand = state.phase === 'ENDED';
  if (!reachedCodeLimit && !stoppedByEmptyHand) throw new Error('experimental run ended without a stop reason');
  const stopReason: ExperimentalStopReason = stoppedByEmptyHand
    ? (reachedCodeLimit ? 'BOTH' : 'HAND_EMPTY')
    : 'CODE_LIMIT';
  if (stopReason === 'CODE_LIMIT' && (state.pending !== null || state.phase !== 'REVEAL' || state.bonusAwarded !== null)) {
    throw new Error('code limit must stop at a fully scored, unbonused reveal');
  }
  const rankEntries = rankPlayers(state.scores);
  const ranks = {} as Record<PlayerId, number>;
  for (const entry of rankEntries) ranks[entry.player] = entry.rank;

  return Object.freeze({
    seed: o.seed, handSize, codeLimit, stopReason,
    snapshot: state, actions: Object.freeze([...state.log]), placements: state.placements,
    completedCodes, predictionBatches: state.history.length,
    scores: state.scores, ranks: Object.freeze(ranks), bonusSeat: state.bonusAwarded,
  });
}
