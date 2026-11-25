/**
 * Storage adapters, game saving/loading and preferences (task 20.2; requirements 18.1-18.8).
 *
 * A save is the replay log (see save-format.ts), never the GameState. `loadGame` rebuilds the state with
 * `core/replay`; nothing here runs UI code, AI code, a scheduler or a browser API, except `browserStore`.
 *
 * Imports: `./save-format`, `../core/replay`, and the type `GameState` of `../core/state`. Nothing from `ui/`,
 * `i18n/` or `core/engine` (no layering inversion, no second source of truth for languages or setup).
 *
 * Throwing: `memoryStore`, `browserStore`, `saveGame`, `clearSave`, `loadGame`, `readPrefs` and `writePrefs` never
 * throw, whatever the store does. Results carry fixed codes only: no save text, no card, no Guess, no engine detail.
 *
 * DURABILITY. The design interface `KeyValueStore` cannot tell a durable browser store from a memory-only fallback.
 * This module adds ONE optional member, `durable`. A store without it counts as NOT durable. `memoryStore()` is
 * not durable; a working `browserStore()` is; its in-memory fallback is not. `saveGame` reports it, so the UI can
 * show "this game cannot be saved" when `ok === false` or `durable === false` (task 20.4).
 *
 * ENDED GAMES (requirement 18.8). `saveGame` of an ENDED state writes nothing and removes the in-progress save.
 * `loadGame` of a log that replays to ENDED discards it (`GAME_ENDED`). An ended game is never resumable.
 *
 * NO READ-BACK. A write is not read back: a store that drops a write silently, without an exception, cannot be
 * detected here.
 *
 * `loadGame` never writes. A MIGRATED envelope is returned as the migrated envelope but is not re-saved; the
 * caller's next `saveGame` writes the current version.
 *
 * PREFERENCES (`PREFS_KEY`). Stored shape: `{"prefsVersion":1,"language":<string|null>,"setup":<JSON value>}`.
 * This layer does not know `Lang` or `SetupPrefs`: `StoredPrefs.language` is a short string and `setup` is the JSON
 * value that was stored. The caller (task 20.4) validates `language` with `isLang` and `setup` with
 * `sanitizeSetupPrefs`. The setup prefs shape has no seed (the `onPrefsChange` payload of the setup screen excludes
 * `seedText`), and `writePrefs` accepts only plain JSON data. Reading is lenient: unknown top-level keys are
 * ignored. Objects are rebuilt fresh by a bounded JSON clone; any `__proto__`, `constructor` or `prototype` key
 * makes the whole `setup` value invalid (null on read, `ok: false` on write), never copied.
 *
 * Only `browserStore`'s default provider touches a browser global. No clock, no randomness, no console, no network.
 */

import { parseSave, serializeSave, SAVE_FORMAT, SAVE_VERSION } from './save-format';
import type { SaveEnvelope } from './save-format';
import { replay } from '../core/replay';
import type { GameState } from '../core/state';

export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  /** True only for a store that really persists (a working browser storage). Absent means not durable. */
  readonly durable?: boolean;
}

export const SAVE_KEY = 'qroker.practice.save.rules4';
export const PREFS_KEY = 'qroker.practice.prefs';
const PROBE_KEY = 'qroker.practice.probe';

/** Longest stored preferences text, in UTF-16 code units. */
export const MAX_PREFS_LENGTH = 4096;
/** Longest accepted language code. */
const MAX_LANGUAGE_LENGTH = 16;
/** Deepest accepted nesting of the `setup` value. */
const MAX_PREFS_DEPTH = 8;
const PREFS_VERSION = 1;
const FORBIDDEN_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype'];

// ---------------------------------------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------------------------------------

/** Deterministic Map-backed store. Not durable. Instances are isolated from each other and from `initial`. */
export function memoryStore(initial?: Readonly<Record<string, string>>): KeyValueStore {
  const map = new Map<string, string>(initial === undefined ? [] : Object.entries(initial));
  return {
    durable: false,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

/**
 * A store over the browser's persistent storage, or a memory fallback. NEVER throws. The fallback is used when the
 * storage is missing, its access throws, it lacks the three functions, or a probe write fails (quota, private mode).
 * After creation the operations of the returned durable store may still throw; callers here catch that.
 */
export function browserStore(getStorage?: () => unknown): KeyValueStore {
  try {
    const provider = getStorage ?? ((): unknown => (globalThis as { localStorage?: unknown }).localStorage);
    const s = provider() as Partial<Record<'getItem' | 'setItem' | 'removeItem', unknown>> | null | undefined;
    if (
      (typeof s !== 'object' && typeof s !== 'function') ||
      s === null ||
      typeof s.getItem !== 'function' ||
      typeof s.setItem !== 'function' ||
      typeof s.removeItem !== 'function'
    ) {
      return memoryStore();
    }
    const storage = s as unknown as { getItem(k: string): unknown; setItem(k: string, v: string): void; removeItem(k: string): void };
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return {
      durable: true,
      getItem: (k) => {
        const v = storage.getItem(k);
        return v === undefined ? null : (v as string | null);
      },
      setItem: (k, v) => storage.setItem(k, v),
      removeItem: (k) => storage.removeItem(k),
    };
  } catch {
    return memoryStore();
  }
}

const isDurable = (store: KeyValueStore): boolean => {
  try {
    return store.durable === true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------------------------------------

export type SaveResult =
  | { ok: true; durable: boolean }
  | { ok: false; reason: 'STORAGE_ERROR' | 'INVALID_STATE' };

/** Removes ONLY the in-progress save. Never throws; `ok` is false when the store refused. */
export function clearSave(store: KeyValueStore): { ok: boolean } {
  try {
    store.removeItem(SAVE_KEY);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Writes the replay log of `state` under `SAVE_KEY`. `nowIso` is supplied by the caller (no clock here). Never
 * mutates `state`. An ENDED state is not written: the in-progress save is removed instead, and the result is
 * `ok: true` unless that removal failed (then `STORAGE_ERROR`: a stale save would resume an old game).
 * The text written is checked with `parseSave` first, so a malformed state or timestamp is `INVALID_STATE` and
 * nothing unloadable is ever stored.
 */
export function saveGame(store: KeyValueStore, state: GameState, nowIso: string): SaveResult {
  try {
    const durable = isDurable(store);
    if (state.phase === 'ENDED') {
      return clearSave(store).ok ? { ok: true, durable } : { ok: false, reason: 'STORAGE_ERROR' };
    }
    let text: string;
    try {
      const envelope: SaveEnvelope = {
        format: SAVE_FORMAT,
        saveVersion: SAVE_VERSION,
        rulesVersion: state.config.rulesVersion,
        savedAtIso: nowIso,
        seed: state.seed,
        config: state.config,
        actions: state.log,
      };
      text = serializeSave(envelope);
      if (parseSave(text).kind !== 'OK') return { ok: false, reason: 'INVALID_STATE' };
    } catch {
      return { ok: false, reason: 'INVALID_STATE' };
    }
    try {
      store.setItem(SAVE_KEY, text);
    } catch {
      return { ok: false, reason: 'STORAGE_ERROR' };
    }
    return { ok: true, durable };
  } catch {
    return { ok: false, reason: 'INVALID_STATE' };
  }
}

// ---------------------------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------------------------

export type DiscardReason = 'CORRUPT' | 'SAVE_VERSION' | 'RULES_VERSION' | 'REPLAY_REJECTED' | 'GAME_ENDED' | 'INVALID_VALUE';

export type LoadResult =
  | { kind: 'NONE'; readFailed?: true }
  | { kind: 'RESUMABLE'; state: GameState; envelope: SaveEnvelope }
  | { kind: 'DISCARDED'; reason: DiscardReason; removed: boolean };

function discard(store: KeyValueStore, reason: DiscardReason): LoadResult {
  return { kind: 'DISCARDED', reason, removed: clearSave(store).ok };
}

/**
 * Reads the in-progress save. A failed READ is not an invalid save: nothing is removed (`NONE`, `readFailed`).
 * Every invalid save is discarded: removed from the store (`removed` tells whether that worked) and reported by a
 * fixed code. Never writes, never touches `PREFS_KEY`, never throws.
 */
export function loadGame(store: KeyValueStore): LoadResult {
  try {
    let raw: unknown;
    try {
      raw = store.getItem(SAVE_KEY);
    } catch {
      return { kind: 'NONE', readFailed: true };
    }
    if (raw === null) return { kind: 'NONE' };
    if (typeof raw !== 'string') return discard(store, 'INVALID_VALUE');
    const parsed = parseSave(raw);
    if (parsed.kind === 'CORRUPT') return discard(store, 'CORRUPT');
    if (parsed.kind === 'INCOMPATIBLE') return discard(store, parsed.reason);
    const envelope = parsed.envelope;
    let state: GameState;
    try {
      const replayed = replay(envelope.seed, envelope.config, envelope.actions);
      if (!replayed.ok) return discard(store, 'REPLAY_REJECTED');
      state = replayed.value;
    } catch {
      return discard(store, 'REPLAY_REJECTED');
    }
    if (state.phase === 'ENDED') return discard(store, 'GAME_ENDED');
    return { kind: 'RESUMABLE', state, envelope };
  } catch {
    return { kind: 'DISCARDED', reason: 'CORRUPT', removed: false };
  }
}

// ---------------------------------------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------------------------------------

export interface StoredPrefs {
  /** A short string as stored (validate with `isLang`), or null. */
  readonly language: string | null;
  /** The stored JSON value (validate with `sanitizeSetupPrefs`), or null. */
  readonly setup: unknown;
}

const NO_PREFS: StoredPrefs = Object.freeze({ language: null, setup: null });

/** Bounded deep copy of plain JSON data. `undefined` means invalid (type, depth, accessor, forbidden key). */
function cloneJson(v: unknown, depth: number): { value: unknown } | undefined {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return { value: v };
  if (typeof v === 'number') return Number.isFinite(v) ? { value: v === 0 ? 0 : v } : undefined;
  if (typeof v !== 'object' || depth >= MAX_PREFS_DEPTH) return undefined;
  if (Array.isArray(v)) {
    const out: unknown[] = [];
    for (let i = 0; i < v.length; i++) {
      const desc = Object.getOwnPropertyDescriptor(v, i);
      if (desc === undefined || !('value' in desc)) return undefined;
      const c = cloneJson(desc.value, depth + 1);
      if (c === undefined) return undefined;
      out.push(c.value);
    }
    return { value: out };
  }
  const proto = Object.getPrototypeOf(v) as unknown;
  if (proto !== Object.prototype && proto !== null) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(v)) {
    if (FORBIDDEN_KEYS.includes(key)) return undefined;
    const desc = Object.getOwnPropertyDescriptor(v, key);
    if (desc === undefined || !('value' in desc)) return undefined;
    const c = cloneJson(desc.value, depth + 1);
    if (c === undefined) return undefined;
    out[key] = c.value;
  }
  return { value: out };
}

const validLanguage = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_LANGUAGE_LENGTH;

/** Reads the preferences. Never throws; any problem gives `{ language: null, setup: null }` (or null per part). */
export function readPrefs(store: KeyValueStore): StoredPrefs {
  try {
    const raw = store.getItem(PREFS_KEY);
    if (typeof raw !== 'string' || raw.length > MAX_PREFS_LENGTH) return NO_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return NO_PREFS;
    const o = parsed as Record<string, unknown>;
    if (!Object.hasOwn(o, 'prefsVersion') || o.prefsVersion !== PREFS_VERSION) return NO_PREFS;
    const language = Object.hasOwn(o, 'language') && validLanguage(o.language) ? o.language : null;
    const cloned = Object.hasOwn(o, 'setup') ? cloneJson(o.setup, 0) : undefined;
    return { language, setup: cloned === undefined ? null : cloned.value };
  } catch {
    return NO_PREFS;
  }
}

/** Writes the preferences under `PREFS_KEY` only. Invalid, oversized or unserializable input writes nothing. */
export function writePrefs(store: KeyValueStore, prefs: StoredPrefs): { ok: boolean } {
  try {
    const { language, setup } = prefs;
    if (language !== null && !validLanguage(language)) return { ok: false };
    const cloned = cloneJson(setup, 0);
    if (cloned === undefined) return { ok: false };
    const text = JSON.stringify({ prefsVersion: PREFS_VERSION, language, setup: cloned.value });
    if (text.length > MAX_PREFS_LENGTH) return { ok: false };
    store.setItem(PREFS_KEY, text);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
