/**
 * Deterministic replay and structural state comparison of the QRoker game engine (task 10.1).
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "Replay (`core/replay.ts`)" and Property 26.
 * Requirements: 12.1 (pure engine), 12.4 (replay returns the same state or the index of the first rejected
 * Action), 12.5 (the Action_Log holds every Action, so replay needs no AI computation), 20.3 (a log produced by
 * a driver replays to the driver's final state).
 *
 * `replay(seed, config, actions)` starts from `newGame({ seed, config })` and applies the actions one by one with
 * `reduce`. It adds no rule of its own: whatever `reduce` accepts, replay accepts.
 *
 * Result shape
 * - Success: `{ ok: true, value }`, the state after the last action. It is the object the reducer built (or the
 *   `newGame` state for an empty log), so it is deeply frozen, and its `log` is the list of accepted actions as the
 *   reducer normalized them. Compare it with the `log` of the original game, not with the raw input actions.
 * - A rejected action at zero-based position `index` of `actions`:
 *   `{ ok: false, error: { code: 'REPLAY_REJECTED', index, cause } }`, where `cause` is the exact `EngineError` that
 *   `reduce` returned for that action (`code` and `detail`). This is the shape the design gives
 *   (`{ code: 'REPLAY_REJECTED'; index: number; cause: EngineError }`); it is structurally an `EngineError`
 *   (`code`, optional `detail`) with two extra fields, so `types.ts` needs no change. No `detail` is added: the
 *   index and the cause are structured fields. Only the FIRST rejected action is reported, and no partial state is
 *   returned: a failed replay carries no state.
 * - Initialization failure: when `newGame` rejects `seed` or `config`, that `newGame` error is returned AS IS
 *   (`INVALID_CONFIG`, `INVALID_SCORE_CONFIG`). It is not a `REPLAY_REJECTED` and has no `index`, because no action
 *   was processed. `isReplayRejection` tells the two apart.
 * - `actions` that is not an array: `INVALID_CONFIG` with a detail text (the closest existing code; the closed
 *   `ErrorCode` set offers nothing more specific and may not grow). It is checked AFTER the initialization, so an
 *   invalid seed or configuration is reported first.
 * - Elements that are not valid actions (null, wrong `type`, holes of a sparse array) are rejected by `reduce`
 *   and therefore reported as `REPLAY_REJECTED` at their index.
 *
 * Trailing actions after the game has ended are rejected by `reduce` with `GAME_ENDED`, so replay returns
 * `REPLAY_REJECTED` with that action's index and `cause.code = 'GAME_ENDED'`.
 *
 * Purity: `seed`, `config` and `actions` are never mutated, frozen or retained (the log entries of the result are
 * the reducer's own copies). Deep-frozen inputs are accepted.
 *
 * Boundaries: this module belongs to `core/`. The AI modules must not import it (boundary test): AI code gets a
 * `PlayerView`, and the log is not part of the view.
 *
 * Pure and deterministic: no DOM, no node, no randomness, no clock, no import from `src/optical`.
 */

import { reduce } from './engine';
import { deepFreeze, newGame } from './state';
import type { GameState } from './state';
import type { Action, EngineError, GameConfig, Result } from './types';

/** The error of a replay that hit a rejected action (design: `{ code, index, cause }`). */
export interface ReplayRejection {
  readonly code: 'REPLAY_REJECTED';
  /** Zero-based position, in the `actions` argument, of the first rejected action. */
  readonly index: number;
  /** The error `reduce` returned for that action. */
  readonly cause: EngineError;
}

/** Everything `replay` can fail with: a rejected action, or the `newGame` / argument error (no index). */
export type ReplayError = ReplayRejection | EngineError;

/** True when `error` is the `REPLAY_REJECTED` error of `replay` (it carries `index` and `cause`). */
export function isReplayRejection(error: ReplayError): error is ReplayRejection {
  return error.code === 'REPLAY_REJECTED' && 'index' in error && typeof error.index === 'number';
}

/**
 * Rebuilds a game from its seed, configuration and action log. See the module comment for the result shape.
 */
export function replay(seed: number, config: GameConfig, actions: readonly Action[]): Result<GameState, ReplayError> {
  const created = newGame({ seed, config });
  if (!created.ok) return created;
  if (!Array.isArray(actions)) {
    return { ok: false, error: { code: 'INVALID_CONFIG', detail: 'actions must be an array' } };
  }
  let state = created.value;
  for (let index = 0; index < actions.length; index++) {
    const next = reduce(state, actions[index] as Action);
    if (!next.ok) {
      return { ok: false, error: deepFreeze({ code: 'REPLAY_REJECTED' as const, index, cause: { ...next.error } }) };
    }
    state = next.value;
  }
  return { ok: true, value: state };
}

function deepEqual(a: unknown, b: unknown): boolean {
  // `===` treats -0 and 0 as equal; NaN is the only value that differs from itself.
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return a !== a && b !== b;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (Array.isArray(a)) {
    const other = b as readonly unknown[];
    if (a.length !== other.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], other[i])) return false;
    return true;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(right, key) || !deepEqual(left[key], right[key])) return false;
  }
  return true;
}

/**
 * Deep structural equality of two game states, for tests and for the save round trip.
 *
 * - Independent of object identity and of the insertion order of object keys (the key sets must be equal; no
 *   `JSON.stringify` is involved). Arrays are compared element by element in the given order, so a different hand,
 *   deck or log order is a difference.
 * - Every field of the state counts: configuration, seed, phase, board, deck, hands, turn, scores, pending batch with
 *   its guesses, history, last reveal, bonus, log and placements. An extra or missing property is a difference, also
 *   when its value is `undefined` (`{ a: undefined }` is not equal to `{}`).
 * - `NaN` equals `NaN`; `-0` equals `0` (the engine stores `0` and never produces `-0`, so this only keeps the
 *   comparison total).
 * - Values with different prototypes are different (a plain object is not equal to an array or a `Map`). Only own
 *   enumerable string keys are compared. Cyclic structures are not supported (game states have none).
 *
 * Reflexive, symmetric and transitive on game states. Never throws for such states.
 */
export function stateEquals(a: GameState, b: GameState): boolean {
  return deepEqual(a, b);
}
