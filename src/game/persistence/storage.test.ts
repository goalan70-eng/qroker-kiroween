// Tests of the storage adapters, game saving/loading and preferences (task 20.2).
// Deterministic: no clock, no real storage, no network. Real games come from sim/play-game.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reduce } from '../core/engine';
import { stateEquals } from '../core/replay';
import { RULES_VERSION } from '../core/score';
import { defaultConfig, newGame } from '../core/state';
import type { GameState } from '../core/state';
import type { Action, Difficulty, GameConfig, IdentityVisibility, PlayerId } from '../core/types';
import { playGame, strategiesFor } from '../sim/play-game';
import { SAVE_FORMAT, SAVE_VERSION, parseSave, serializeSave } from './save-format';
import type { SaveEnvelope } from './save-format';
import {
  MAX_PREFS_LENGTH,
  PREFS_KEY,
  SAVE_KEY,
  browserStore,
  clearSave,
  loadGame,
  memoryStore,
  readPrefs,
  saveGame,
  writePrefs,
} from './storage';
import type { KeyValueStore, LoadResult } from './storage';

const SEATS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];
const NOW = '2025-01-02T03:04:05.678Z';
const SEED = 4242424242;

type Slot = 'H' | Difficulty;

function makeConfig(slots: readonly Slot[], visibility: IdentityVisibility = 'OWNER_ONLY'): GameConfig {
  const seats = slots.map((s, i) =>
    s === 'H'
      ? { id: SEATS[i] as PlayerId, kind: 'HUMAN' as const, name: `Player ${i + 1}` }
      : { id: SEATS[i] as PlayerId, kind: 'AI' as const, difficulty: s, name: `AI ${i}` },
  );
  return { ...defaultConfig(), seats: seats as unknown as GameConfig['seats'], identityVisibility: visibility };
}

function play(seed: number, config: GameConfig): { final: GameState; log: readonly Action[] } {
  // EXPERT has no registered strategy yet (task 23.1): ADVANCED plays its seat; the saved config keeps EXPERT.
  const difficulties = Object.fromEntries(
    config.seats.map((s) => [s.id, s.difficulty === undefined || s.difficulty === 'EXPERT' ? (s.difficulty === 'EXPERT' ? 'ADVANCED' : 'BEGINNER') : s.difficulty]),
  ) as Record<PlayerId, Difficulty>;
  return playGame({ seed, config, strategies: strategiesFor(difficulties), checkInvariants: false });
}

/** states[k] is the state after the first k actions of `log`. */
function prefixStates(seed: number, config: GameConfig, log: readonly Action[]): GameState[] {
  const created = newGame({ seed, config });
  if (!created.ok) throw new Error('newGame failed');
  const out: GameState[] = [created.value];
  for (const a of log) {
    const next = reduce(out[out.length - 1] as GameState, a);
    if (!next.ok) throw new Error(`reduce rejected ${next.error.code}`);
    out.push(next.value);
  }
  return out;
}

const envelopeOf = (seed: number, config: GameConfig, actions: readonly Action[]): SaveEnvelope => ({
  format: SAVE_FORMAT,
  saveVersion: SAVE_VERSION,
  rulesVersion: RULES_VERSION,
  savedAtIso: NOW,
  seed,
  config,
  actions,
});

const storeWith = (text: string): KeyValueStore => memoryStore({ [SAVE_KEY]: text });

const GAME = play(SEED, makeConfig(['H', 'BEGINNER', 'ADVANCED', 'EXPERT']));
const STATES = prefixStates(SEED, GAME.final.config, GAME.log);
const LOG = GAME.log;
const FIRST_ACK = LOG.findIndex((a) => a.type === 'ACK_REVEAL');
const PARTIAL = STATES.findIndex((s) => s.phase === 'GUESS_COLLECT' && s.pending !== null && Object.keys(s.pending.guesses).length === 2);
const OTHER_KEY = 'unrelated.key';

const consoleSpies: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  for (const m of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table'] as const) {
    consoleSpies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
  }
});
afterEach(() => {
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  consoleSpies.length = 0;
});

function recordingStore(initial: Record<string, string> = {}): KeyValueStore & { calls: string[]; inner: KeyValueStore } {
  const inner = memoryStore(initial);
  const calls: string[] = [];
  return {
    calls,
    inner,
    durable: true,
    getItem: (k) => (calls.push(`get ${k}`), inner.getItem(k)),
    setItem: (k, v) => (calls.push(`set ${k}`), inner.setItem(k, v)),
    removeItem: (k) => (calls.push(`remove ${k}`), inner.removeItem(k)),
  };
}

const throwing = (over: Partial<Record<'getItem' | 'setItem' | 'removeItem', () => never>>, base?: KeyValueStore): KeyValueStore => {
  const inner = base ?? memoryStore();
  return {
    durable: true,
    getItem: (k) => (over.getItem ? over.getItem() : inner.getItem(k)),
    setItem: (k, v) => (over.setItem ? over.setItem() : inner.setItem(k, v)),
    removeItem: (k) => (over.removeItem ? over.removeItem() : inner.removeItem(k)),
  };
};
const fail = (): never => {
  throw new Error('boom');
};
const quota = (): never => {
  throw new DOMException('full', 'QuotaExceededError');
};

describe('memoryStore', () => {
  it('is deterministic, isolated and not durable', () => {
    const initial = { a: '1' };
    const s1 = memoryStore(initial);
    const s2 = memoryStore(initial);
    expect(s1.durable).toBe(false);
    expect(s1.getItem('missing')).toBeNull();
    expect(s1.getItem('a')).toBe('1');
    s1.setItem('a', '2');
    s1.setItem('b', '3');
    s1.removeItem('missing');
    expect(s2.getItem('a')).toBe('1');
    expect(s2.getItem('b')).toBeNull();
    expect(initial).toEqual({ a: '1' });
    s1.removeItem('a');
    expect(s1.getItem('a')).toBeNull();
    expect(memoryStore().getItem('a')).toBeNull();
  });
});

describe('saveGame and loadGame round trip', () => {
  it('returns NONE for an empty store', () => {
    expect(loadGame(memoryStore())).toEqual({ kind: 'NONE' });
  });

  it('has usable cut points', () => {
    expect(FIRST_ACK).toBeGreaterThan(0);
    expect(PARTIAL).toBeGreaterThan(0);
  });

  const cuts: [string, number][] = [
    ['empty log', 0],
    ['right after the first placement', 1],
    ['partial GUESS_COLLECT', PARTIAL],
    ['right after the first reveal', FIRST_ACK + 1],
    ['mid game', Math.floor(LOG.length / 2)],
    ['one action before the end', LOG.length - 1],
  ];
  for (const [name, k] of cuts) {
    it(`restores the state: ${name}`, () => {
      const state = STATES[k] as GameState;
      if (state.phase === 'ENDED') return;
      const store = memoryStore();
      expect(saveGame(store, state, NOW)).toEqual({ ok: true, durable: false });
      const loaded = loadGame(store);
      expect(loaded.kind).toBe('RESUMABLE');
      if (loaded.kind !== 'RESUMABLE') return;
      expect(stateEquals(state, loaded.state)).toBe(true);
      expect(loaded.envelope).toEqual(envelopeOf(SEED, state.config, state.log));
      expect(store.getItem(SAVE_KEY)).toBe(serializeSave(loaded.envelope));
    });
  }

  it('restores partial GUESS_COLLECT with the submitted guesses', () => {
    const state = STATES[PARTIAL] as GameState;
    expect(Object.keys((state.pending as NonNullable<GameState['pending']>).guesses)).toHaveLength(2);
    const store = memoryStore();
    saveGame(store, state, NOW);
    const loaded = loadGame(store);
    expect(loaded.kind === 'RESUMABLE' && stateEquals(state, loaded.state)).toBe(true);
  });

  const configs: [string, GameConfig][] = [
    ['1 human, OWNER_ONLY', makeConfig(['H', 'BEGINNER', 'ADVANCED', 'EXPERT'])],
    ['2 humans, FACE_UP', makeConfig(['H', 'H', 'ADVANCED', 'BEGINNER'], 'FACE_UP')],
    ['3 humans, OWNER_ONLY', makeConfig(['H', 'H', 'H', 'EXPERT'])],
    ['4 humans, FACE_UP', makeConfig(['H', 'H', 'H', 'H'], 'FACE_UP')],
  ];
  for (const [name, config] of configs) {
    for (const seed of [0, 7, 99]) {
      it(`restores mid-game states: ${name}, seed ${seed}`, () => {
        const g = play(seed, config);
        const states = prefixStates(seed, config, g.log);
        for (const k of [0, 1, Math.floor(g.log.length / 3), Math.floor(g.log.length / 2)]) {
          const state = states[k] as GameState;
          const store = memoryStore();
          expect(saveGame(store, state, NOW).ok).toBe(true);
          const loaded = loadGame(store);
          expect(loaded.kind).toBe('RESUMABLE');
          expect(loaded.kind === 'RESUMABLE' && stateEquals(state, loaded.state)).toBe(true);
        }
      });
    }
  }

  it('overwrites on a second save and writes the exact serializeSave text', () => {
    const store = memoryStore();
    saveGame(store, STATES[1] as GameState, NOW);
    const second = STATES[PARTIAL] as GameState;
    saveGame(store, second, '2025-02-03T04:05:06Z');
    expect(store.getItem(SAVE_KEY)).toBe(
      serializeSave({ ...envelopeOf(SEED, second.config, second.log), savedAtIso: '2025-02-03T04:05:06Z' }),
    );
    const loaded = loadGame(store);
    expect(loaded.kind === 'RESUMABLE' && stateEquals(second, loaded.state)).toBe(true);
  });

  it('uses the configuration rules version and writes no state keys', () => {
    const store = memoryStore();
    const state = STATES[PARTIAL] as GameState;
    saveGame(store, state, NOW);
    const text = store.getItem(SAVE_KEY) as string;
    expect((JSON.parse(text) as { rulesVersion: number }).rulesVersion).toBe(state.config.rulesVersion);
    expect(parseSave(text).kind).toBe('OK');
    for (const key of ['deck', 'hands', 'pending', 'board', 'scoredGroups', 'history']) {
      expect(text).not.toContain(`"${key}"`);
    }
  });

  it('does not mutate a frozen state', () => {
    const state = STATES[PARTIAL] as GameState; // deeply frozen by the engine
    const before = JSON.stringify(state);
    saveGame(memoryStore(), state, NOW);
    expect(JSON.stringify(state)).toBe(before);
    expect(Object.isFrozen(state.log)).toBe(true);
  });

  it('loads twice with equal states, no removal and no write', () => {
    const rec = recordingStore();
    saveGame(rec, STATES[PARTIAL] as GameState, NOW);
    rec.calls.length = 0;
    const a = loadGame(rec);
    const b = loadGame(rec);
    expect(a.kind === 'RESUMABLE' && b.kind === 'RESUMABLE' && stateEquals(a.state, b.state)).toBe(true);
    expect(rec.calls).toEqual([`get ${SAVE_KEY}`, `get ${SAVE_KEY}`]);
    expect(rec.inner.getItem(SAVE_KEY)).not.toBeNull();
  });
});

describe('durability', () => {
  it('reports durable from the store flag; a store without the member is not durable', () => {
    const state = STATES[1] as GameState;
    const plain: KeyValueStore = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
    expect(saveGame(plain, state, NOW)).toEqual({ ok: true, durable: false });
    expect(saveGame({ ...plain, durable: true }, state, NOW)).toEqual({ ok: true, durable: true });
    expect(saveGame(memoryStore(), state, NOW)).toEqual({ ok: true, durable: false });
  });
});

describe('saveGame failures', () => {
  it('reports STORAGE_ERROR for generic and quota errors', () => {
    const state = STATES[1] as GameState;
    expect(saveGame(throwing({ setItem: fail }), state, NOW)).toEqual({ ok: false, reason: 'STORAGE_ERROR' });
    expect(saveGame(throwing({ setItem: quota }), state, NOW)).toEqual({ ok: false, reason: 'STORAGE_ERROR' });
    expect(saveGame(throwing({ setItem: () => { throw { name: 'QuotaExceededError' }; } }), state, NOW)).toEqual({
      ok: false,
      reason: 'STORAGE_ERROR',
    });
  });

  it('reports INVALID_STATE for a malformed state or timestamp and writes nothing', () => {
    const store = memoryStore();
    expect(saveGame(store, {} as unknown as GameState, NOW)).toEqual({ ok: false, reason: 'INVALID_STATE' });
    expect(saveGame(store, null as unknown as GameState, NOW)).toEqual({ ok: false, reason: 'INVALID_STATE' });
    expect(saveGame(store, STATES[1] as GameState, 'yesterday')).toEqual({ ok: false, reason: 'INVALID_STATE' });
    expect(store.getItem(SAVE_KEY)).toBeNull();
  });

  it('never throws when every operation throws', () => {
    const all = throwing({ getItem: fail, setItem: fail, removeItem: fail });
    expect(saveGame(all, STATES[1] as GameState, NOW).ok).toBe(false);
    expect(clearSave(all)).toEqual({ ok: false });
    expect(loadGame(all)).toEqual({ kind: 'NONE', readFailed: true });
    expect(readPrefs(all)).toEqual({ language: null, setup: null });
    expect(writePrefs(all, { language: 'en', setup: null })).toEqual({ ok: false });
  });
});

describe('ENDED games (requirement 18.8)', () => {
  const ended = GAME.final;
  it('is an ended state', () => {
    expect(ended.phase).toBe('ENDED');
  });

  it('saveGame removes the save, writes nothing and keeps prefs', () => {
    const rec = recordingStore();
    saveGame(rec, STATES[PARTIAL] as GameState, NOW);
    writePrefs(rec, { language: 'en', setup: { humans: 2 } });
    rec.calls.length = 0;
    expect(saveGame(rec, ended, NOW)).toEqual({ ok: true, durable: true });
    expect(rec.calls).toEqual([`remove ${SAVE_KEY}`]);
    expect(rec.inner.getItem(SAVE_KEY)).toBeNull();
    expect(readPrefs(rec)).toEqual({ language: 'en', setup: { humans: 2 } });
  });

  it('reports STORAGE_ERROR when the stale save cannot be removed', () => {
    expect(saveGame(throwing({ removeItem: fail }), ended, NOW)).toEqual({ ok: false, reason: 'STORAGE_ERROR' });
  });

  it('a log that replays to ENDED is discarded with GAME_ENDED', () => {
    const store = storeWith(serializeSave(envelopeOf(SEED, ended.config, ended.log)));
    expect(loadGame(store)).toEqual({ kind: 'DISCARDED', reason: 'GAME_ENDED', removed: true });
    expect(store.getItem(SAVE_KEY)).toBeNull();
  });
});

describe('clearSave and preferences survival', () => {
  it('removes only SAVE_KEY', () => {
    const rec = recordingStore({ [OTHER_KEY]: 'x' });
    writePrefs(rec, { language: 'ko', setup: [1, 2] });
    saveGame(rec, STATES[1] as GameState, NOW);
    expect(clearSave(rec)).toEqual({ ok: true });
    expect(rec.inner.getItem(SAVE_KEY)).toBeNull();
    expect(readPrefs(rec)).toEqual({ language: 'ko', setup: [1, 2] });
    expect(rec.inner.getItem(OTHER_KEY)).toBe('x');
  });

  it('prefs survive a DISCARDED load', () => {
    const store = memoryStore({ [SAVE_KEY]: '{bad' });
    writePrefs(store, { language: 'en', setup: { a: 1 } });
    expect(loadGame(store).kind).toBe('DISCARDED');
    expect(readPrefs(store)).toEqual({ language: 'en', setup: { a: 1 } });
  });

  it('never reads, writes or removes unrelated keys', () => {
    const rec = recordingStore({ [OTHER_KEY]: 'x' });
    saveGame(rec, STATES[1] as GameState, NOW);
    loadGame(rec);
    writePrefs(rec, { language: 'en', setup: null });
    readPrefs(rec);
    clearSave(rec);
    saveGame(rec, GAME.final, NOW);
    expect(rec.calls.filter((c) => c.endsWith(OTHER_KEY))).toEqual([]);
    expect(rec.calls.every((c) => c.endsWith(SAVE_KEY) || c.endsWith(PREFS_KEY))).toBe(true);
  });
});

describe('loadGame discards', () => {
  const first = LOG[0] as Action & { type: 'PLACE' };
  const firstSubmitIdx = LOG.findIndex((a) => a.type === 'SUBMIT_GUESSES');
  const submit = LOG[firstSubmitIdx] as Extract<Action, { type: 'SUBMIT_GUESSES' }>;
  const config = GAME.final.config;
  const prefix = LOG.slice(0, firstSubmitIdx); // up to and including the first PLACE batch start
  const env = (actions: readonly Action[], cfg: GameConfig = config): string => serializeSave(envelopeOf(SEED, cfg, actions));
  const reasonOf = (r: LoadResult): string => (r.kind === 'DISCARDED' ? r.reason : r.kind);

  const withGuess = (value: number): Action => {
    const key = Object.keys(submit.guesses)[0] as string;
    return { ...submit, guesses: { ...submit.guesses, [key]: value } };
  };
  const other = (SEATS.find((p) => p !== first.player) ?? 'P1') as PlayerId;
  const outsideCard = (STATES[0] as GameState).hands[other][0];

  const engineInvalid: [string, string][] = [
    ['wrong player PLACE', env([{ ...first, player: other }])],
    ['wrong card', env([{ ...first, card: outsideCard as typeof first.card }])],
    ['illegal cell', env([{ ...first, pos: { row: 0, col: 0 } }])],
    ['guess 3.5', env([...prefix, withGuess(3.5)])],
    ['guess 99', env([...prefix, withGuess(99)])],
    ['duplicate submission', env([...prefix, submit, submit])],
    ['empty guesses', env([...prefix, { ...submit, guesses: {} }])],
    ['early ACK', env([{ type: 'ACK_REVEAL' }])],
    ['actions after the end', env([...LOG, { type: 'ACK_REVEAL' }])],
    ['empty reward table', env(prefix, { ...config, scoreConfig: { ...config.scoreConfig, config: { ...config.scoreConfig.config, rewardByError: [] } } })],
    ['non-monotone reward table', env(prefix, { ...config, scoreConfig: { ...config.scoreConfig, config: { ...config.scoreConfig.config, rewardByError: [1, 5] } } })],
  ];
  for (const [name, text] of engineInvalid) {
    it(`REPLAY_REJECTED: ${name}`, () => {
      expect(parseSave(text).kind).toBe('OK'); // structurally valid
      const store = storeWith(text);
      expect(loadGame(store)).toEqual({ kind: 'DISCARDED', reason: 'REPLAY_REJECTED', removed: true });
      expect(store.getItem(SAVE_KEY)).toBeNull();
    });
  }

  const good = serializeSave(envelopeOf(SEED, config, LOG.slice(0, FIRST_ACK + 2)));
  const obj = (): Record<string, unknown> => JSON.parse(good) as Record<string, unknown>;
  const corrupt: [string, string][] = [
    ['not JSON', '{not json'],
    ['empty string', ''],
    ['JSON array', '[]'],
    ...[1, 10, 50, 200, good.length - 1].map((n): [string, string] => [`truncated at ${n}`, good.slice(0, n)]),
    ['extra key', JSON.stringify({ ...obj(), extra: 1 })],
  ];
  for (const [name, text] of corrupt) {
    it(`CORRUPT: ${name}`, () => {
      const store = storeWith(text);
      expect(loadGame(store)).toEqual({ kind: 'DISCARDED', reason: 'CORRUPT', removed: true });
      expect(store.getItem(SAVE_KEY)).toBeNull();
    });
  }

  it('maps versions: future and old save versions, unsupported rules version', () => {
    for (const v of [SAVE_VERSION + 1, 99, 0]) {
      const store = storeWith(JSON.stringify({ ...obj(), saveVersion: v }));
      expect(loadGame(store)).toEqual({ kind: 'DISCARDED', reason: 'SAVE_VERSION', removed: true });
      expect(store.getItem(SAVE_KEY)).toBeNull();
    }
    const store = storeWith(JSON.stringify({ ...obj(), rulesVersion: RULES_VERSION + 1 }));
    expect(loadGame(store)).toEqual({ kind: 'DISCARDED', reason: 'RULES_VERSION', removed: true });
  });

  it('maps a non-string stored value to INVALID_VALUE and removes it', () => {
    for (const v of [42, {}, undefined, true]) {
      const inner = memoryStore();
      inner.setItem(SAVE_KEY, 'x');
      const store: KeyValueStore = { ...inner, getItem: () => v as unknown as string };
      expect(reasonOf(loadGame(store))).toBe('INVALID_VALUE');
      expect(inner.getItem(SAVE_KEY)).toBeNull();
    }
  });

  it('reports removed:false when removal throws, without throwing', () => {
    const store = throwing({ removeItem: fail }, memoryStore({ [SAVE_KEY]: '{bad' }));
    expect(loadGame(store)).toEqual({ kind: 'DISCARDED', reason: 'CORRUPT', removed: false });
  });

  it('a read failure is NONE with readFailed and removes nothing', () => {
    const rec = recordingStore({ [SAVE_KEY]: good });
    const store = { ...rec, getItem: fail };
    expect(loadGame(store)).toEqual({ kind: 'NONE', readFailed: true });
    expect(rec.calls).toEqual([]);
    expect(rec.inner.getItem(SAVE_KEY)).toBe(good);
  });

  it('never writes during a load', () => {
    const rec = recordingStore({ [SAVE_KEY]: '{bad' });
    loadGame(rec);
    expect(rec.calls.some((c) => c.startsWith('set'))).toBe(false);
  });
});

describe('browserStore', () => {
  class FakeStorage {
    readonly map = new Map<string, string>();
    broken = false;
    getItem(k: string): string | null {
      if (this.broken) throw new Error('disabled');
      return this.map.get(k) ?? null;
    }
    setItem(k: string, v: string): void {
      if (this.broken) throw new Error('disabled');
      this.map.set(k, v);
    }
    removeItem(k: string): void {
      if (this.broken) throw new Error('disabled');
      this.map.delete(k);
    }
  }

  const fallbackCases: [string, () => unknown][] = [
    ['provider throws', () => { throw new DOMException('denied', 'SecurityError'); }],
    ['undefined', () => undefined],
    ['null', () => null],
    ['no functions', () => ({})],
    ['one function missing', () => ({ getItem: () => null, setItem: () => undefined })],
    ['probe quota', () => ({ getItem: () => null, setItem: quota, removeItem: () => undefined })],
    ['probe remove throws', () => ({ getItem: () => null, setItem: () => undefined, removeItem: fail })],
  ];
  for (const [name, provider] of fallbackCases) {
    it(`falls back to a working memory store: ${name}`, () => {
      const s = browserStore(provider);
      expect(s.durable).toBe(false);
      expect(saveGame(s, STATES[PARTIAL] as GameState, NOW)).toEqual({ ok: true, durable: false });
      expect(loadGame(s).kind).toBe('RESUMABLE');
    });
  }

  it('default provider does not throw outside a browser and yields a usable store', () => {
    const s = browserStore();
    expect(typeof s.getItem).toBe('function');
    expect(saveGame(s, STATES[1] as GameState, NOW).ok).toBe(true);
  });

  it('wraps a working storage as durable and round-trips', () => {
    const fake = new FakeStorage();
    const s = browserStore(() => fake);
    expect(s.durable).toBe(true);
    expect(fake.map.size).toBe(0); // the probe key is removed
    expect(saveGame(s, STATES[PARTIAL] as GameState, NOW)).toEqual({ ok: true, durable: true });
    expect(fake.map.has(SAVE_KEY)).toBe(true);
    const loaded = loadGame(s);
    expect(loaded.kind === 'RESUMABLE' && stateEquals(STATES[PARTIAL] as GameState, loaded.state)).toBe(true);
  });

  it('operations that throw after creation are caught', () => {
    const fake = new FakeStorage();
    const s = browserStore(() => fake);
    saveGame(s, STATES[1] as GameState, NOW);
    fake.broken = true;
    expect(saveGame(s, STATES[1] as GameState, NOW)).toEqual({ ok: false, reason: 'STORAGE_ERROR' });
    expect(loadGame(s)).toEqual({ kind: 'NONE', readFailed: true });
    expect(clearSave(s)).toEqual({ ok: false });
    expect(readPrefs(s)).toEqual({ language: null, setup: null });
    expect(writePrefs(s, { language: 'en', setup: null })).toEqual({ ok: false });
    expect(fake.map.has(SAVE_KEY)).toBe(true);
  });

  it('treats a getItem that returns undefined as a missing key', () => {
    const s = browserStore(() => ({ getItem: () => undefined, setItem: () => undefined, removeItem: () => undefined }));
    expect(s.durable).toBe(true);
    expect(s.getItem('x')).toBeNull();
    expect(loadGame(s)).toEqual({ kind: 'NONE' });
  });
});

describe('preferences', () => {
  const setup = { humans: 2, difficulty: ['BEGINNER', 'EXPERT'], visibility: 'FACE_UP', nested: { a: [1, 2, { b: null }] } };

  it('round trips a setup-shaped object and a language, with the fixed stored shape', () => {
    const store = memoryStore();
    expect(writePrefs(store, { language: 'ko', setup })).toEqual({ ok: true });
    expect(store.getItem(PREFS_KEY)).toBe(JSON.stringify({ prefsVersion: 1, language: 'ko', setup }));
    expect(readPrefs(store)).toEqual({ language: 'ko', setup });
    expect(store.getItem(SAVE_KEY)).toBeNull();
  });

  it('does not touch SAVE_KEY when writing', () => {
    const store = memoryStore({ [SAVE_KEY]: 'keep' });
    writePrefs(store, { language: 'en', setup });
    expect(store.getItem(SAVE_KEY)).toBe('keep');
  });

  const none = { language: null, setup: null };
  const fallbacks: [string, string | null][] = [
    ['missing key', null],
    ['invalid JSON', '{x'],
    ['array', '[]'],
    ['number', '5'],
    ['null', 'null'],
    ['wrong version', JSON.stringify({ prefsVersion: 2, language: 'en', setup: {} })],
    ['missing version', JSON.stringify({ language: 'en', setup: {} })],
    ['oversized text', JSON.stringify({ prefsVersion: 1, language: 'en', setup: 'x'.repeat(MAX_PREFS_LENGTH) })],
  ];
  for (const [name, text] of fallbacks) {
    it(`falls back: ${name}`, () => {
      expect(readPrefs(text === null ? memoryStore() : memoryStore({ [PREFS_KEY]: text }))).toEqual(none);
    });
  }

  it('falls back when getItem throws or returns a non-string', () => {
    expect(readPrefs(throwing({ getItem: fail }))).toEqual(none);
    expect(readPrefs({ ...memoryStore(), getItem: () => 5 as unknown as string })).toEqual(none);
  });

  it('nulls a bad language and ignores unknown keys', () => {
    const s = (language: unknown): KeyValueStore =>
      memoryStore({ [PREFS_KEY]: JSON.stringify({ prefsVersion: 1, language, setup: { a: 1 }, extra: 'x' }) });
    expect(readPrefs(s(5))).toEqual({ language: null, setup: { a: 1 } });
    expect(readPrefs(s('x'.repeat(17)))).toEqual({ language: null, setup: { a: 1 } });
    expect(readPrefs(s('en'))).toEqual({ language: 'en', setup: { a: 1 } });
  });

  it('rejects oversized, unserializable and non-plain input on write', () => {
    const store = memoryStore();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const deep = ((): unknown => { let v: unknown = 1; for (let i = 0; i < 20; i++) v = [v]; return v; })();
    const bad: unknown[] = [
      'x'.repeat(MAX_PREFS_LENGTH),
      cyclic,
      deep,
      undefined,
      () => 1,
      Number.NaN,
      new Date(0),
      new Map(),
      { get a() { return 1; } },
      { a: undefined },
    ];
    for (const b of bad) expect(writePrefs(store, { language: 'en', setup: b }), String(b)).toEqual({ ok: false });
    expect(writePrefs(store, { language: 'x'.repeat(17), setup: null })).toEqual({ ok: false });
    expect(store.getItem(PREFS_KEY)).toBeNull();
  });

  it('rejects write failures without throwing', () => {
    expect(writePrefs(throwing({ setItem: fail }), { language: 'en', setup: null })).toEqual({ ok: false });
    expect(writePrefs(throwing({ setItem: quota }), { language: 'en', setup: null })).toEqual({ ok: false });
  });

  it('never copies __proto__, constructor or prototype keys and does not pollute Object.prototype', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const text = `{"prefsVersion":1,"language":"en","setup":{"ok":1,"n":{"${key}":{"polluted":true}}}}`;
      expect(readPrefs(memoryStore({ [PREFS_KEY]: text }))).toEqual({ language: 'en', setup: null });
      const store = memoryStore();
      const evil = JSON.parse(`{"${key}":{"polluted":true}}`) as unknown;
      expect(writePrefs(store, { language: 'en', setup: evil })).toEqual({ ok: false });
      expect(store.getItem(PREFS_KEY)).toBeNull();
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
  });

  it('returns a fresh copy that does not alias the input', () => {
    const store = memoryStore();
    const input = { a: [1] };
    writePrefs(store, { language: 'en', setup: input });
    input.a.push(2);
    expect(readPrefs(store).setup).toEqual({ a: [1] });
  });
});

describe('privacy and fixed codes', () => {
  const results: unknown[] = [];
  const config = GAME.final.config;

  it('results of every scenario hold only fixed codes, no card, guess, seed or text', () => {
    const state = STATES[PARTIAL] as GameState;
    const goodText = serializeSave(envelopeOf(SEED, config, state.log));
    const submit = LOG.find((a) => a.type === 'SUBMIT_GUESSES') as Extract<Action, { type: 'SUBMIT_GUESSES' }>;
    const tampered = serializeSave(
      envelopeOf(SEED, config, [LOG[0] as Action, { ...submit, guesses: Object.fromEntries(Object.keys(submit.guesses).map((k) => [k, 4242424242])) }]),
    );
    const marker = '{"secret":"17/43"';
    for (const text of [tampered, marker, goodText.slice(0, 120), '']) {
      const store = storeWith(text);
      results.push(loadGame(store));
    }
    results.push(saveGame(memoryStore(), state, NOW), saveGame(throwing({ setItem: fail }), state, NOW), saveGame(memoryStore(), {} as unknown as GameState, NOW));
    results.push(clearSave(memoryStore()), writePrefs(memoryStore(), { language: 'en', setup: { x: 1 } }));
    const json = JSON.stringify(results);
    const cards = Object.values(state.hands).flat();
    for (const card of cards) expect(json).not.toContain(card);
    for (const needle of ['4242424242', '17/43', 'secret', '"seed"', '"actions"', '"guesses"', 'PLACE', 'detail', 'index', 'cause']) {
      expect(json).not.toContain(needle);
    }
    const codes = new Set(['CORRUPT', 'SAVE_VERSION', 'RULES_VERSION', 'REPLAY_REJECTED', 'GAME_ENDED', 'INVALID_VALUE']);
    for (const r of results as { kind?: string; reason?: string }[]) {
      if (r.kind === 'DISCARDED') expect(codes.has(r.reason as string)).toBe(true);
    }
    expect(json).toContain('REPLAY_REJECTED');
  });
});

describe('source scan', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, 'storage.ts'), 'utf8');
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');

  it('mentions the browser global only inside browserStore', () => {
    const start = code.indexOf('export function browserStore');
    const end = code.indexOf('const isDurable');
    const outside = code.slice(0, start) + code.slice(end);
    expect(outside).not.toMatch(/localStorage|globalThis/);
    expect(code.slice(start, end)).toMatch(/globalThis/);
  });

  it('has none of the forbidden constructs', () => {
    for (const re of [/\bwindow\b/, /\bdocument\b/, /\bconsole\b/, /\bDate\b/, /Math\s*\.\s*random/, /node:/, /\bfetch\b/, /\bXMLHttpRequest\b/, /\bperformance\b/]) {
      expect(code, String(re)).not.toMatch(re);
    }
  });

  it('has the exact import list', () => {
    const imports = [...raw.matchAll(/^import (type )?[^;]*? from '([^']+)';$/gm)].map((m) => `${m[1] ?? ''}${m[2]}`);
    expect(imports).toEqual(['./save-format', 'type ./save-format', '../core/replay', 'type ../core/state']);
  });
});
