/**
 * Game state and `newGame` of the QRoker game engine (task 8.1).
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "GameState and Rules (`core/state.ts`, `core/rules.ts`)".
 * Requirements: 2.2 (deterministic deal), 3.1 (neutral cards on D4, E4, D5, E5), 5.7 (the starting group
 * is not scored), 6.1 (P0 moves first), 8.3 and 8.4 (score configuration validated, enters only through the
 * configuration), 12.1 (`newGame` is pure), 12.6 (rules version in the configuration).
 *
 * `GameState` is SEALED: it holds the deck, every hand, the seed and the pending guesses, so it never
 * leaves `core/engine` and the ViewProjector (decision D1, IC-1). Consumers read a `PlayerView`.
 * The type is defined here and not in `types.ts`, as the design places it in `core/state.ts`.
 *
 * Immutability: every value of a state returned by `newGame` is frozen recursively (`deepFreeze`), so a
 * mutation attempt throws a `TypeError` in strict mode. `newGame` never mutates, freezes or keeps a
 * reference to its options: the configuration is validated and copied (see `validateGameConfig`).
 *
 * Phase: a new game starts in `PLACEMENT`. There is no `INIT` phase (IC-10): `newGame` already returns a
 * dealt state.
 *
 * Pure and deterministic: no DOM, no node, no randomness except the seeded deal, no clock, no import
 * from `src/optical`.
 */

import { initialBoard } from './board';
import type { Board } from './board';
import type { CompositeCodeResult } from './composite-code';
import { tryDealGame } from './deck';
import {
  DEFAULT_AI_DIFFICULTIES,
  DEFAULT_IDENTITY_VISIBILITY,
  RULES_VERSION,
  SEATS,
  startingScoredGroups,
  validateGameConfig,
} from './rules';
import { DEV_PLACEHOLDER_SCORE_CONFIG } from './score';
import type { Action, CardId, GameConfig, PlayerId, QuadKey, Result } from './types';

export type GamePhase = 'PLACEMENT' | 'GUESS_COLLECT' | 'REVEAL' | 'ENDED';

/** A Prediction_Batch awaiting guesses. SEALED: it holds the Hidden_Sums and the guesses. */
export interface PendingBatch {
  readonly placer: PlayerId;
  readonly codes: readonly CompositeCodeResult[];
  /** SEALED: guesses submitted so far, by seat. */
  readonly guesses: Readonly<Partial<Record<PlayerId, Readonly<Record<QuadKey, number>>>>>;
  /** True when the placement emptied the placer's hand (the game ends after the reveal). */
  readonly endsGame: boolean;
}

/** Public once created. Contains no guess value. */
export interface RevealRecord {
  readonly batchIndex: number;
  readonly placer: PlayerId;
  readonly codes: readonly { readonly quadKey: QuadKey; readonly cards: readonly CardId[]; readonly hiddenSum: number }[];
  readonly perPlayer: readonly { readonly player: PlayerId; readonly earned: number; readonly cumulative: number }[];
}

/** The sealed game state. Matches design.md field for field. */
export interface GameState {
  readonly config: GameConfig;
  readonly seed: number;
  readonly phase: GamePhase;
  readonly board: Board;
  /** Top of the deck is the LAST element. */
  readonly deck: readonly CardId[];
  readonly hands: Readonly<Record<PlayerId, readonly CardId[]>>;
  readonly turn: PlayerId;
  readonly firstPlacementDone: readonly PlayerId[];
  /** Sorted groupIds of every code that was ever revealed or is pending. SEALED. */
  readonly scoredGroups: readonly string[];
  /** Cards of revealed codes (public). */
  readonly revealedCards: readonly CardId[];
  readonly pending: PendingBatch | null;
  readonly scores: Readonly<Record<PlayerId, number>>;
  /** Number of accepted PLACE actions. */
  readonly placements: number;
  readonly history: readonly RevealRecord[];
  readonly lastReveal: RevealRecord | null;
  readonly bonusAwarded: PlayerId | null;
  /** Accepted actions, in order. */
  readonly log: readonly Action[];
}

export interface NewGameOptions {
  /** A Seed as returned by `parseSeed`: an integer in 0..4294967295. */
  readonly seed: number;
  readonly config: GameConfig;
}

/**
 * Freezes `value` and everything reachable through its own enumerable properties (arrays and plain
 * objects) and returns it. Exported for the reducer (task 8.2), which builds each next state and freezes
 * it the same way. Not safe for cyclic structures; game states have none.
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * The default configuration: seat P0 is human, P1 to P3 are AI seats (`DEFAULT_AI_DIFFICULTIES`),
 * `DEV_PLACEHOLDER_SCORE_CONFIG` (provisional) and `DEFAULT_IDENTITY_VISIBILITY` (`OWNER_ONLY`, OQ-1).
 * Returns a new deeply frozen configuration on every call; it is always valid.
 */
export function defaultConfig(): GameConfig {
  const [d1, d2, d3] = DEFAULT_AI_DIFFICULTIES;
  const checked = validateGameConfig({
    rulesVersion: RULES_VERSION,
    seats: [
      { id: 'P0', kind: 'HUMAN', name: 'You' },
      { id: 'P1', kind: 'AI', difficulty: d1, name: 'AI 1' },
      { id: 'P2', kind: 'AI', difficulty: d2, name: 'AI 2' },
      { id: 'P3', kind: 'AI', difficulty: d3, name: 'AI 3' },
    ],
    scoreConfig: DEV_PLACEHOLDER_SCORE_CONFIG,
    identityVisibility: DEFAULT_IDENTITY_VISIBILITY,
  });
  if (!checked.ok) {
    // Cannot happen: every value above is a module constant that `validateGameConfig` accepts.
    throw new Error(`defaultConfig is invalid: ${checked.error.code} ${checked.error.detail ?? ''}`);
  }
  return checked.value;
}

/**
 * Creates a dealt game, or returns an error and creates nothing.
 *
 * Validation, in this order, first failure returned:
 * 1. `INVALID_CONFIG`: `options` is not an object.
 * 2. `validateGameConfig(options.config)`: `INVALID_CONFIG` or `INVALID_SCORE_CONFIG`.
 * 3. `INVALID_CONFIG`: `options.seed` is not an integer in 0..4294967295 (`tryDealGame`; an invalid seed is
 *    never coerced). The design's `newGame` takes a numeric Seed, so there is no `SEED_EMPTY` here: empty
 *    seed text is rejected by `parseSeed` before it can reach this function.
 *
 * Initial state (all values frozen):
 * - the four Neutral_Cards of `dealGame(seed)` on D4, E4, D5, E5 at orientation 0 with owner `NEUTRAL`
 *   (OQ-2, via `initialBoard`), hands P0..P3 of 4 cards each in deal order, a 32-card deck (top = last);
 * - `phase = 'PLACEMENT'`, `turn = 'P0'` (requirement 6.1), `placements = 0`, all scores 0;
 * - nothing pending, nothing revealed, no `firstPlacementDone`, `bonusAwarded = null`, empty `log`;
 * - `scoredGroups = startingScoredGroups()`: empty under the provisional policy that the starting group is
 *   never scored (`STARTING_GROUP_SCORING`, OQ-3, requirement 5.7). No score, no pending batch and no
 *   reveal record exist at the start.
 *
 * Deterministic: equal options give deeply equal states.
 */
export function newGame(options: NewGameOptions): Result<GameState> {
  if (typeof options !== 'object' || options === null) {
    return { ok: false, error: { code: 'INVALID_CONFIG', detail: 'options must be an object' } };
  }
  const config = validateGameConfig(options.config);
  if (!config.ok) return config;
  const dealt = tryDealGame(options.seed);
  if (!dealt.ok) return dealt;
  const deal = dealt.value;

  const hands = {} as Record<PlayerId, readonly CardId[]>;
  const scores = {} as Record<PlayerId, number>;
  for (const seat of SEATS) {
    hands[seat] = [...deal.hands[seat]];
    scores[seat] = 0;
  }

  const state: GameState = {
    config: config.value,
    seed: options.seed,
    phase: 'PLACEMENT',
    board: initialBoard(deal.neutral),
    deck: [...deal.deck],
    hands,
    turn: 'P0',
    firstPlacementDone: [],
    scoredGroups: startingScoredGroups(),
    revealedCards: [],
    pending: null,
    scores,
    placements: 0,
    history: [],
    lastReveal: null,
    bonusAwarded: null,
    log: [],
  };
  return { ok: true, value: deepFreeze(state) };
}
