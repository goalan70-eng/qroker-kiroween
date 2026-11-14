/**
 * Rules constants and game configuration validation of the QRoker game engine (task 8.1).
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "GameState and Rules (`core/state.ts`, `core/rules.ts`)"
 * and the Error Handling table (`INVALID_CONFIG`, `INVALID_SCORE_CONFIG`).
 * Requirements: 8.3 (a ScoreConfig supplied to `newGame` is validated), 8.4 (the ScoreConfig enters only
 * through the configuration), 12.1 (`newGame` is pure), 12.6 (`RULES_VERSION` is part of every configuration).
 *
 * Pure module: no DOM, no node, no randomness, no clock, no import from `src/optical`. Constants that
 * already exist in another core module are re-exported here, never redefined, so there is one definition
 * of each value (`RULES_VERSION` in score.ts, `SEATS` in turn.ts, the deal sizes in deck.ts).
 *
 * PROVISIONAL decisions are isolated in this file, each in one named constant:
 * - `STARTING_GROUP_SCORING` (OQ-3): the 2x2 group of the four Neutral_Cards is never scored.
 * - `DEFAULT_IDENTITY_VISIBILITY` (OQ-1): the default visibility option of a new game is `OWNER_ONLY`.
 *   This module only stores and validates the value. No visibility logic exists here or in `state.ts`;
 *   the view layer (task 9) is the only reader that acts on it.
 * - `DEFAULT_AI_DIFFICULTIES`: the design does not state default tiers. See the constant.
 * The orientation of the Neutral_Cards (OQ-2) is set by `initialBoard` in board.ts (orientation 0, owner
 * `NEUTRAL`); it is not duplicated here.
 */

import { DECK_SIZE_AFTER_DEAL, HAND_SIZE, NEUTRAL_COUNT } from './deck';
import { RULES_VERSION, validateScoreConfig } from './score';
import { SEATS } from './turn';
import type {
  Difficulty,
  GameConfig,
  IdentityVisibility,
  NamedScoreConfig,
  PlayerId,
  Result,
  SeatConfig,
} from './types';

export { DECK_SIZE_AFTER_DEAL, HAND_SIZE, NEUTRAL_COUNT, RULES_VERSION, SEATS };

/**
 * Policy for the 2x2 group of the four Neutral_Cards (OQ-3, PROVISIONAL, requirement 5.7).
 *
 * `'NEVER_SCORED'`: the starting group never becomes eligible for scoring and there is no redeal. The
 * detector examines only the 2x2 regions that contain a newly placed cell, and no placement forms the
 * starting group, so nothing has to be recorded for it: `startingScoredGroups` returns an empty list.
 * To change this policy later (adjust the start, or redeal), change this constant and
 * `startingScoredGroups`, then review `newGame`. Nothing else in the engine hard-codes the policy.
 */
export type StartingGroupScoring = 'NEVER_SCORED';
export const STARTING_GROUP_SCORING: StartingGroupScoring = 'NEVER_SCORED';

/**
 * The initial `scoredGroups` record of a new game under `STARTING_GROUP_SCORING`. Under `'NEVER_SCORED'`
 * it is empty: the starting group is not examined by the detector, so it needs no entry.
 */
export function startingScoredGroups(): readonly string[] {
  switch (STARTING_GROUP_SCORING) {
    case 'NEVER_SCORED':
      return Object.freeze([]);
    default: {
      const unreachable: never = STARTING_GROUP_SCORING;
      throw new Error(`unknown starting group policy: ${String(unreachable)}`);
    }
  }
}

/** The Difficulty_Labels, the closed set accepted for an AI seat. */
export const DIFFICULTIES: readonly Difficulty[] = Object.freeze(['BEGINNER', 'ADVANCED', 'EXPERT'] as const);

/** The Identity_Visibility values, the closed set accepted in a configuration. */
export const IDENTITY_VISIBILITIES: readonly IdentityVisibility[] = Object.freeze(['OWNER_ONLY', 'FACE_UP'] as const);

/**
 * Default Identity_Visibility of a new game (OQ-1, PROVISIONAL, decision D10). This is only the default
 * stored in `defaultConfig`; the engine does not interpret the value.
 */
export const DEFAULT_IDENTITY_VISIBILITY: IdentityVisibility = 'OWNER_ONLY';

/**
 * Default tiers of the AI seats P1, P2, P3 in `defaultConfig`. The design says "1 human + 3 AI" and gives
 * no default tiers (its save example shows `BEGINNER` for P1 only), so this is an implementation choice
 * that claims nothing about strength: every default AI seat is `BEGINNER`, the tier that milestone P1
 * always ships. The setup screen (task 19.1) lets the user choose per seat.
 */
export const DEFAULT_AI_DIFFICULTIES: readonly [Difficulty, Difficulty, Difficulty] = Object.freeze([
  'BEGINNER',
  'BEGINNER',
  'BEGINNER',
] as const) as readonly [Difficulty, Difficulty, Difficulty];

function invalidConfig(detail: string): Result<never> {
  return { ok: false, error: { code: 'INVALID_CONFIG', detail } };
}

function invalidScoreConfig(detail: string): Result<never> {
  return { ok: false, error: { code: 'INVALID_SCORE_CONFIG', detail } };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The normalized seat, or an `INVALID_CONFIG` error. `index` is the position in the seat list. */
function validateSeat(raw: unknown, index: number): Result<SeatConfig> {
  if (!isRecord(raw)) return invalidConfig(`seats[${index}] must be an object`);
  const expectedId = SEATS[index] as PlayerId;
  if (raw.id !== expectedId) {
    return invalidConfig(`seats[${index}].id must be ${expectedId}, got ${JSON.stringify(raw.id) ?? String(raw.id)}`);
  }
  if (typeof raw.name !== 'string') return invalidConfig(`seats[${index}].name must be a string`);
  if (raw.kind === 'HUMAN') {
    if (raw.difficulty !== undefined) return invalidConfig(`seats[${index}] is HUMAN and must not have a difficulty`);
    return { ok: true, value: Object.freeze({ id: expectedId, kind: 'HUMAN', name: raw.name }) };
  }
  if (raw.kind === 'AI') {
    const difficulty = raw.difficulty;
    if (typeof difficulty !== 'string' || !(DIFFICULTIES as readonly string[]).includes(difficulty)) {
      return invalidConfig(`seats[${index}].difficulty must be one of ${DIFFICULTIES.join(', ')} for an AI seat`);
    }
    return {
      ok: true,
      value: Object.freeze({ id: expectedId, kind: 'AI', difficulty: difficulty as Difficulty, name: raw.name }),
    };
  }
  return invalidConfig(`seats[${index}].kind must be HUMAN or AI`);
}

/** The normalized, frozen NamedScoreConfig, or an `INVALID_SCORE_CONFIG` error. */
function validateNamedScoreConfig(raw: unknown): Result<NamedScoreConfig> {
  if (!isRecord(raw)) return invalidScoreConfig('scoreConfig must be an object');
  if (typeof raw.id !== 'string') return invalidScoreConfig('scoreConfig.id must be a string');
  if (typeof raw.provisional !== 'boolean') return invalidScoreConfig('scoreConfig.provisional must be a boolean');
  const checked = validateScoreConfig(raw.config);
  if (!checked.ok) return checked;
  const table = Object.freeze([...checked.value.rewardByError]);
  const config = Object.freeze({ rewardByError: table, handEmptyBonus: checked.value.handEmptyBonus });
  return { ok: true, value: Object.freeze({ id: raw.id, provisional: raw.provisional, config }) };
}

/**
 * Validates a game configuration and returns a NORMALIZED, deeply frozen COPY of it. The input is read
 * only, never mutated and never frozen; unknown extra fields are ignored and are not copied, so the
 * stored configuration (and with it a save file) holds exactly the fields of `GameConfig`.
 *
 * Accepts any value, so it can check data that comes from outside (UI, save files, untyped tests).
 * Checks, in this order, with the first failure returned:
 * 1. `INVALID_CONFIG`: the value is not an object.
 * 2. `INVALID_CONFIG`: `rulesVersion` is not `RULES_VERSION` (requirement 12.6; a configuration of another
 *    rules version would replay under different rules).
 * 3. `INVALID_CONFIG`: `seats` is not an array of exactly four seats whose ids are `P0`, `P1`, `P2`, `P3`
 *    in this order (each exactly once; a missing, extra, duplicate or misplaced seat id is rejected), each
 *    with `kind` `HUMAN` or `AI`, a string `name`, and a `difficulty` that is one of `DIFFICULTIES` for an
 *    AI seat and absent for a human seat.
 * 4. `INVALID_CONFIG`: `identityVisibility` is not one of `IDENTITY_VISIBILITIES`.
 * 5. `INVALID_SCORE_CONFIG`: `scoreConfig` is not `{ id: string, provisional: boolean, config }` or its
 *    `config` is rejected by `validateScoreConfig` (requirement 8.3).
 */
export function validateGameConfig(raw: unknown): Result<GameConfig> {
  if (!isRecord(raw)) return invalidConfig('config must be an object');
  if (raw.rulesVersion !== RULES_VERSION) {
    return invalidConfig(`rulesVersion must be ${RULES_VERSION}, got ${String(raw.rulesVersion)}`);
  }
  const rawSeats = raw.seats;
  if (!Array.isArray(rawSeats)) return invalidConfig('seats must be an array');
  if (rawSeats.length !== SEATS.length) {
    return invalidConfig(`seats must hold exactly ${SEATS.length} entries, got ${rawSeats.length}`);
  }
  const seats: SeatConfig[] = [];
  for (let i = 0; i < SEATS.length; i++) {
    const seat = validateSeat(rawSeats[i], i);
    if (!seat.ok) return seat;
    seats.push(seat.value);
  }
  const visibility = raw.identityVisibility;
  if (typeof visibility !== 'string' || !(IDENTITY_VISIBILITIES as readonly string[]).includes(visibility)) {
    return invalidConfig(`identityVisibility must be one of ${IDENTITY_VISIBILITIES.join(', ')}`);
  }
  const scoreConfig = validateNamedScoreConfig(raw.scoreConfig);
  if (!scoreConfig.ok) return scoreConfig;
  return {
    ok: true,
    value: Object.freeze({
      rulesVersion: RULES_VERSION,
      seats: Object.freeze(seats) as unknown as GameConfig['seats'],
      scoreConfig: scoreConfig.value,
      identityVisibility: visibility as IdentityVisibility,
    }),
  };
}
