/**
 * Save format, validation and migration (task 20.1; requirements 18.2, 18.4, 18.5, 2.5).
 *
 * A save is a replay log, not a snapshot: the envelope holds the Seed, the configuration and the accepted Actions,
 * never the GameState (design D5). `parseSave` checks STRUCTURE and VERSION only. Engine semantics (is this PLACE
 * legal, is this Guess in range, does the log replay) belong to `core/replay`, which the loader of task 20.2 calls.
 * So a text can be `OK` here and still be rejected by `replay`; that is intended (see docs/game/save-format.md).
 *
 * Imports (design table row `persistence/`: `core/replay`, `core/types`): this module imports only the TYPES of
 * `core/types` and the constant `RULES_VERSION` from `core/score`. DOCUMENTED DEVIATION from the design table text:
 * `core/score` is not listed for `persistence/`, but no enforced boundary rule forbids it (boundaries.test.ts only
 * bans `node:` here) and the constant has one home. It does not use `core/replay` (20.2 does).
 *
 * Decisions (also in the tests):
 * - Unknown keys are rejected as CORRUPT at every level (envelope, config, seat, scoreConfig, action, pos): a
 *   tampered or damaged nested object is never half-accepted. Nothing is lenient.
 * - `__proto__`, `constructor` and `prototype` keys are rejected (JSON.parse creates an OWN `__proto__` key). No
 *   parsed object is ever returned or copied wholesale: the envelope is rebuilt from explicit fields and deep-frozen.
 * - Seed: integer 0..4294967295. The text `-0` parses to -0 and is rejected (the serializer never writes it).
 *   Other numbers (Guesses, rewards): `-0` is normalised to 0.
 * - Guess values are only checked to be finite numbers. The 4..52 integer rule is the engine's (`validateGuess`);
 *   20.2 maps a replay rejection to DISCARDED.
 * - Seat structure mirrors `validateGameConfig` (ids P0..P3 in order, HUMAN without difficulty, AI with one); the
 *   score-table semantics (non-empty, non-increasing, non-negative) stay with the engine.
 * - `savedAtIso` is caller-supplied: strict UTC pattern `YYYY-MM-DDTHH:MM:SS[.fff]Z` with month, day, hour, minute
 *   and second ranges but no calendar check (2025-02-31 passes). No `Date` is used.
 *
 * Pure: no DOM, no storage, no `node:`, no clock, no randomness, no console, never throws from `parseSave`.
 */

import { RULES_VERSION } from '../core/score';
import type {
  Action,
  CardId,
  Difficulty,
  GameConfig,
  IdentityVisibility,
  NamedScoreConfig,
  Orientation,
  PlayerId,
  QuadKey,
  SeatConfig,
} from '../core/types';

export const SAVE_FORMAT = 'qroker-save';
export const SAVE_VERSION = 1;

export interface SaveEnvelope {
  readonly format: 'qroker-save';
  readonly saveVersion: number;
  readonly rulesVersion: number;
  /** Supplied by the caller's clock; this module never reads time. */
  readonly savedAtIso: string;
  readonly seed: number;
  readonly config: GameConfig;
  readonly actions: readonly Action[];
}

export type ParsedSave =
  | { kind: 'OK'; envelope: SaveEnvelope }
  | { kind: 'MIGRATED'; envelope: SaveEnvelope; fromVersion: number }
  | { kind: 'INCOMPATIBLE'; reason: 'SAVE_VERSION' | 'RULES_VERSION' }
  | { kind: 'CORRUPT' };

type Migrations = Readonly<Record<number, (old: unknown) => unknown>>;

/** Migration steps by source version (`MIGRATIONS[v]` turns version v into v + 1). Empty at version 1. */
export const MIGRATIONS: Migrations = Object.freeze({});

/**
 * Longest accepted save text. A game has at most 48 PLACE Actions (52 cards minus 4 Neutral_Cards), and each placement
 * is followed by 4 SUBMIT_GUESSES and 1 ACK_REVEAL, so at most 48 * 6 = 288 Actions of under 250 characters each
 * (about 70,000 characters), plus the configuration (under 2,000). 1,000,000 is far above that and still cheap to scan.
 */
export const MAX_SAVE_TEXT_LENGTH = 1_000_000;
/** Longest accepted `actions` array (288 legal Actions at most, see above). */
export const MAX_ACTIONS = 1000;
/** Longest seat name and score id, in UTF-16 code units. */
const MAX_NAME_LENGTH = 200;
/** Longest `rewardByError` table (a Guess error is at most 48). */
const MAX_REWARD_TABLE_LENGTH = 64;
const MAX_SAVED_AT_LENGTH = 30;
const MAX_SEED = 4294967295;

const SEAT_IDS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];
const DIFFICULTIES: readonly string[] = ['BEGINNER', 'ADVANCED', 'EXPERT'] satisfies readonly Difficulty[];
const VISIBILITIES: readonly string[] = ['OWNER_ONLY', 'FACE_UP', 'BLIND', 'BLIND_SCORE_ONLY'] satisfies readonly IdentityVisibility[];
/** `<Suit>-<Rank>`: suits H D C S, ranks A 2..10 J Q K (the 52 CardIds of core/cards). */
const CARD_ID_PATTERN = /^[HDCS]-(?:A|10|[2-9]|J|Q|K)$/;
/** Notation of the top-left cell of a 2x2 region: columns A-G, rows 1-7 (core/geometry `quadKey`). */
const QUAD_KEY_PATTERN = /^[A-G][1-7]$/;
const ISO_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/;
const FORBIDDEN_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype'];

// ---------------------------------------------------------------------------------------------------------
// Guards (each returns a fresh plain value or undefined; undefined means "invalid")
// ---------------------------------------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** True when `o` has exactly the keys of `required` plus any of `optional`, all own, none forbidden. */
function hasKeys(o: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(o);
  if (keys.some((k) => FORBIDDEN_KEYS.includes(k))) return false;
  if (!required.every((k) => Object.hasOwn(o, k))) return false;
  return keys.every((k) => required.includes(k) || optional.includes(k));
}

const isSafeInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const isFinite_ = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const normalizeZero = (n: number): number => (n === 0 ? 0 : n);
const isPlayerId = (v: unknown): v is PlayerId => typeof v === 'string' && (SEAT_IDS as readonly string[]).includes(v);

function readSeat(raw: unknown, index: number): SeatConfig | undefined {
  if (!isRecord(raw) || !hasKeys(raw, ['id', 'kind', 'name'], ['difficulty'])) return undefined;
  const { id, kind, name, difficulty } = raw;
  if (id !== SEAT_IDS[index]) return undefined;
  if (typeof name !== 'string' || name.length > MAX_NAME_LENGTH) return undefined;
  if (kind === 'HUMAN') {
    if (Object.hasOwn(raw, 'difficulty')) return undefined;
    return { id: SEAT_IDS[index] as PlayerId, kind: 'HUMAN', name };
  }
  if (kind === 'AI') {
    if (typeof difficulty !== 'string' || !DIFFICULTIES.includes(difficulty)) return undefined;
    return { id: SEAT_IDS[index] as PlayerId, kind: 'AI', difficulty: difficulty as Difficulty, name };
  }
  return undefined;
}

function readScoreConfig(raw: unknown): NamedScoreConfig | undefined {
  if (!isRecord(raw) || !hasKeys(raw, ['id', 'provisional', 'config'])) return undefined;
  if (typeof raw.id !== 'string' || raw.id.length > MAX_NAME_LENGTH || typeof raw.provisional !== 'boolean') return undefined;
  const c = raw.config;
  if (!isRecord(c) || !hasKeys(c, ['rewardByError', 'handEmptyBonus'])) return undefined;
  const table = c.rewardByError;
  if (!Array.isArray(table) || table.length > MAX_REWARD_TABLE_LENGTH) return undefined;
  const rewards: number[] = [];
  for (const v of table as unknown[]) {
    if (!isFinite_(v)) return undefined;
    rewards.push(normalizeZero(v));
  }
  if (!isFinite_(c.handEmptyBonus)) return undefined;
  return {
    id: raw.id,
    provisional: raw.provisional,
    config: { rewardByError: rewards, handEmptyBonus: normalizeZero(c.handEmptyBonus) },
  };
}

function readConfig(raw: unknown, rulesVersion: number): GameConfig | undefined {
  if (!isRecord(raw) || !hasKeys(raw, ['rulesVersion', 'seats', 'scoreConfig', 'identityVisibility'])) return undefined;
  if (raw.rulesVersion !== rulesVersion) return undefined;
  const rawSeats = raw.seats;
  if (!Array.isArray(rawSeats) || rawSeats.length !== SEAT_IDS.length) return undefined;
  const seats: SeatConfig[] = [];
  for (let i = 0; i < SEAT_IDS.length; i++) {
    const seat = readSeat(rawSeats[i], i);
    if (seat === undefined) return undefined;
    seats.push(seat);
  }
  const visibility = raw.identityVisibility;
  if (typeof visibility !== 'string' || !VISIBILITIES.includes(visibility)) return undefined;
  const scoreConfig = readScoreConfig(raw.scoreConfig);
  if (scoreConfig === undefined) return undefined;
  return {
    rulesVersion,
    seats: seats as unknown as GameConfig['seats'],
    scoreConfig,
    identityVisibility: visibility as IdentityVisibility,
  };
}

function readGridIndex(v: unknown): number | undefined {
  return isSafeInt(v) && v >= 0 && v <= 7 ? normalizeZero(v) : undefined;
}

function readAction(raw: unknown): Action | undefined {
  if (!isRecord(raw) || typeof raw.type !== 'string') return undefined;
  if (raw.type === 'ACK_REVEAL') return hasKeys(raw, ['type']) ? { type: 'ACK_REVEAL' } : undefined;
  if (raw.type === 'PLACE') {
    if (!hasKeys(raw, ['type', 'player', 'card', 'pos', 'orientation'])) return undefined;
    const { player, card, pos, orientation } = raw;
    if (!isPlayerId(player) || typeof card !== 'string' || !CARD_ID_PATTERN.test(card)) return undefined;
    if (!isRecord(pos) || !hasKeys(pos, ['row', 'col'])) return undefined;
    const row = readGridIndex(pos.row);
    const col = readGridIndex(pos.col);
    if (row === undefined || col === undefined) return undefined;
    if (orientation !== 0 && orientation !== 180) return undefined;
    return { type: 'PLACE', player, card: card as CardId, pos: { row, col }, orientation: (orientation === 0 ? 0 : 180) as Orientation };
  }
  if (raw.type === 'SUBMIT_GUESSES') {
    if (!hasKeys(raw, ['type', 'player', 'guesses']) || !isPlayerId(raw.player)) return undefined;
    const g = raw.guesses;
    if (!isRecord(g)) return undefined;
    const guesses: Record<QuadKey, number> = {};
    for (const key of Object.keys(g)) {
      if (FORBIDDEN_KEYS.includes(key) || !QUAD_KEY_PATTERN.test(key)) return undefined;
      const value = g[key];
      if (!isFinite_(value)) return undefined;
      guesses[key] = normalizeZero(value);
    }
    return { type: 'SUBMIT_GUESSES', player: raw.player, guesses };
  }
  return undefined;
}

/** Builds the envelope from a candidate whose `rulesVersion` was already checked, or undefined when invalid. */
function readEnvelope(raw: Record<string, unknown>, saveVersion: number, rulesVersion: number): SaveEnvelope | undefined {
  if (!hasKeys(raw, ['format', 'saveVersion', 'rulesVersion', 'savedAtIso', 'seed', 'config', 'actions'])) return undefined;
  if (raw.format !== SAVE_FORMAT || raw.saveVersion !== saveVersion || raw.rulesVersion !== rulesVersion) return undefined;
  const savedAtIso = raw.savedAtIso;
  if (typeof savedAtIso !== 'string' || savedAtIso.length > MAX_SAVED_AT_LENGTH || !ISO_PATTERN.test(savedAtIso)) return undefined;
  const seed = raw.seed;
  if (!isSafeInt(seed) || Object.is(seed, -0) || seed < 0 || seed > MAX_SEED) return undefined;
  const config = readConfig(raw.config, rulesVersion);
  if (config === undefined) return undefined;
  const rawActions = raw.actions;
  if (!Array.isArray(rawActions) || rawActions.length > MAX_ACTIONS) return undefined;
  const actions: Action[] = [];
  for (const a of rawActions as unknown[]) {
    const action = readAction(a);
    if (action === undefined) return undefined;
    actions.push(action);
  }
  return { format: SAVE_FORMAT, saveVersion, rulesVersion, savedAtIso, seed, config, actions };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------------------

interface ParseOptions {
  readonly saveVersion: number;
  readonly rulesVersion: number;
  readonly migrations: Migrations;
}

/**
 * `parseSave` with explicit versions and migrations (internal; exported so tests can use test-only migrations).
 * Never throws and never echoes the input text.
 */
export function parseSaveWith(text: string, options: ParseOptions): ParsedSave {
  try {
    return parseUnsafe(text, options);
  } catch {
    return { kind: 'CORRUPT' };
  }
}

function parseUnsafe(text: unknown, o: ParseOptions): ParsedSave {
  const corrupt: ParsedSave = { kind: 'CORRUPT' };
  if (typeof text !== 'string' || text.trim().length === 0 || text.length > MAX_SAVE_TEXT_LENGTH) return corrupt;
  let value: unknown = JSON.parse(text);
  if (!isRecord(value) || value.format !== SAVE_FORMAT) return corrupt;
  const stored = value.saveVersion;
  if (!isSafeInt(stored) || stored < 0) return corrupt;
  if (stored > o.saveVersion) return { kind: 'INCOMPATIBLE', reason: 'SAVE_VERSION' };
  for (let v = stored; v < o.saveVersion; v++) {
    const step = Object.hasOwn(o.migrations, v) ? o.migrations[v] : undefined;
    if (typeof step !== 'function') return { kind: 'INCOMPATIBLE', reason: 'SAVE_VERSION' };
    value = step(value);
    if (!isRecord(value) || value.saveVersion !== v + 1) return corrupt;
  }
  if (!isRecord(value)) return corrupt;
  // The rules version is checked before the deep structure: another rules version may have another shape.
  const rulesVersion = value.rulesVersion;
  if (!isSafeInt(rulesVersion)) return corrupt;
  if (rulesVersion !== o.rulesVersion) return { kind: 'INCOMPATIBLE', reason: 'RULES_VERSION' };
  const envelope = readEnvelope(value, o.saveVersion, rulesVersion);
  if (envelope === undefined) return corrupt;
  deepFreeze(envelope);
  return stored === o.saveVersion ? { kind: 'OK', envelope } : { kind: 'MIGRATED', envelope, fromVersion: stored };
}

/** Parses saved text. Never throws; the result carries no text of the input. */
export function parseSave(text: string): ParsedSave {
  return parseSaveWith(text, { saveVersion: SAVE_VERSION, rulesVersion: RULES_VERSION, migrations: MIGRATIONS });
}

// ---------------------------------------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------------------------------------

function serializeAction(a: Action): unknown {
  switch (a.type) {
    case 'PLACE':
      return { type: 'PLACE', player: a.player, card: a.card, pos: { row: a.pos.row, col: a.pos.col }, orientation: a.orientation };
    case 'SUBMIT_GUESSES': {
      const guesses: Record<string, number> = {};
      for (const key of Object.keys(a.guesses).sort()) guesses[key] = a.guesses[key] as number;
      return { type: 'SUBMIT_GUESSES', player: a.player, guesses };
    }
    case 'ACK_REVEAL':
      return { type: 'ACK_REVEAL' };
  }
}

/**
 * Deterministic text of an envelope: fixed key order, explicit fields only (extra properties of the input are never
 * written), Guess keys sorted, no indentation. It never contains the GameState.
 */
export function serializeSave(e: SaveEnvelope): string {
  const c = e.config;
  return JSON.stringify({
    format: e.format,
    saveVersion: e.saveVersion,
    rulesVersion: e.rulesVersion,
    savedAtIso: e.savedAtIso,
    seed: e.seed,
    config: {
      rulesVersion: c.rulesVersion,
      seats: c.seats.map((s) =>
        s.difficulty === undefined
          ? { id: s.id, kind: s.kind, name: s.name }
          : { id: s.id, kind: s.kind, difficulty: s.difficulty, name: s.name },
      ),
      scoreConfig: {
        id: c.scoreConfig.id,
        provisional: c.scoreConfig.provisional,
        config: {
          rewardByError: Array.from(c.scoreConfig.config.rewardByError), // a copy, not a literal table (boundary scan)
          handEmptyBonus: c.scoreConfig.config.handEmptyBonus,
        },
      },
      identityVisibility: c.identityVisibility,
    },
    actions: e.actions.map(serializeAction),
  });
}
