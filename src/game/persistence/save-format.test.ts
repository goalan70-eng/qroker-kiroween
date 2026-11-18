// Tests of the save format (task 20.1): serialization, parsing, versions, migrations, robustness.
// Deterministic: seeded local PRNG only, no clock, no storage.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_CARDS, RANKS } from '../core/cards';
import { reduce } from '../core/engine';
import { quadKey } from '../core/geometry';
import { mulberry32 } from '../core/prng';
import { isReplayRejection, replay, stateEquals } from '../core/replay';
import { RULES_VERSION } from '../core/score';
import { defaultConfig, newGame } from '../core/state';
import type { GameState } from '../core/state';
import type { Action, Difficulty, GameConfig, IdentityVisibility, PlayerId } from '../core/types';
import { playGame, strategiesFor } from '../sim/play-game';
import {
  MAX_ACTIONS,
  MAX_SAVE_TEXT_LENGTH,
  MIGRATIONS,
  SAVE_FORMAT,
  SAVE_VERSION,
  parseSave,
  parseSaveWith,
  serializeSave,
} from './save-format';
import type { ParsedSave, SaveEnvelope } from './save-format';

const SEATS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];
const NOW = '2025-01-02T03:04:05.678Z';
const KINDS = ['OK', 'MIGRATED', 'INCOMPATIBLE', 'CORRUPT'];

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
  const difficulties = Object.fromEntries(
    config.seats.map((s) => [s.id, s.difficulty ?? 'BEGINNER']),
  ) as Record<PlayerId, Difficulty>;
  return playGame({ seed, config, strategies: strategiesFor(difficulties), checkInvariants: false });
}

const envelope = (seed: number, config: GameConfig, actions: readonly Action[], iso = NOW): SaveEnvelope => ({
  format: SAVE_FORMAT,
  saveVersion: SAVE_VERSION,
  rulesVersion: RULES_VERSION,
  savedAtIso: iso,
  seed,
  config,
  actions,
});

function stateByReduce(seed: number, config: GameConfig, actions: readonly Action[]): GameState {
  const created = newGame({ seed, config });
  if (!created.ok) throw new Error('newGame failed');
  let state = created.value;
  for (const a of actions) {
    const next = reduce(state, a);
    if (!next.ok) throw new Error(`reduce rejected ${next.error.code}`);
    state = next.value;
  }
  return state;
}

// Fixtures (computed once).
const GAME_A = play(1, makeConfig(['H', 'BEGINNER', 'BEGINNER', 'BEGINNER']));
// The first batch: the log up to the first ACK_REVEAL plus the next PLACE (holds all three action types).
const FIRST_ACK = GAME_A.log.findIndex((a) => a.type === 'ACK_REVEAL');
const SMALL = envelope(1, GAME_A.final.config, GAME_A.log.slice(0, FIRST_ACK + 2));
const SMALL_TEXT = serializeSave(SMALL);
const SMALL_OBJ = (): Record<string, unknown> => JSON.parse(SMALL_TEXT) as Record<string, unknown>;
const text = (o: unknown): string => JSON.stringify(o);

const kindOf = (r: ParsedSave): string => r.kind;

describe('constants and production migrations', () => {
  it('has version 1, the format string and an empty frozen MIGRATIONS', () => {
    expect(SAVE_VERSION).toBe(1);
    expect(SAVE_FORMAT).toBe('qroker-save');
    expect(Object.keys(MIGRATIONS)).toEqual([]);
    expect(Object.isFrozen(MIGRATIONS)).toBe(true);
  });
});

describe('serializeSave', () => {
  it('is deterministic and independent of property insertion order', () => {
    const a = serializeSave(SMALL);
    expect(serializeSave(SMALL)).toBe(a);
    const reversed = Object.fromEntries(Object.entries(SMALL).reverse()) as unknown as SaveEnvelope;
    expect(serializeSave(reversed)).toBe(a);
    expect(Object.keys(JSON.parse(a))).toEqual(['format', 'saveVersion', 'rulesVersion', 'savedAtIso', 'seed', 'config', 'actions']);
    expect(Object.keys(JSON.parse(a).config)).toEqual(['rulesVersion', 'seats', 'scoreConfig', 'identityVisibility']);
    expect(Object.keys(JSON.parse(a).config.seats[1])).toEqual(['id', 'kind', 'difficulty', 'name']);
    expect(a).not.toContain('\n');
    expect(a).not.toContain('  ');
  });

  it('uses a fixed key order per action type and sorts Guess keys', () => {
    const e = envelope(3, makeConfig(['H', 'H', 'H', 'H']), [
      { orientation: 180, pos: { col: 2, row: 1 }, card: 'H-7', player: 'P1', type: 'PLACE' },
      { guesses: { D4: 10, A1: 5 }, player: 'P2', type: 'SUBMIT_GUESSES' },
      { type: 'ACK_REVEAL' },
    ]);
    expect(serializeSave(e)).toContain(
      '"actions":[{"type":"PLACE","player":"P1","card":"H-7","pos":{"row":1,"col":2},"orientation":180},' +
        '{"type":"SUBMIT_GUESSES","player":"P2","guesses":{"A1":5,"D4":10}},{"type":"ACK_REVEAL"}]',
    );
  });

  it('never writes extra properties and never contains state keys', () => {
    const dirty = {
      ...SMALL,
      deck: ['H-1'],
      hands: {},
      extra: 1,
      config: { ...SMALL.config, board: [], seats: SMALL.config.seats.map((s) => ({ ...s, hand: ['H-2'] })) },
      actions: SMALL.actions.map((a) => ({ ...a, pending: 1 })),
    } as unknown as SaveEnvelope;
    expect(serializeSave(dirty)).toBe(SMALL_TEXT);
    const keys = new Set<string>();
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (typeof v === 'object' && v !== null) {
        for (const [k, c] of Object.entries(v)) {
          keys.add(k);
          walk(c);
        }
      }
    };
    walk(JSON.parse(serializeSave(envelope(1, GAME_A.final.config, GAME_A.log))));
    for (const forbidden of ['deck', 'hands', 'hand', 'pending', 'scoredGroups', 'board', 'log', 'placements']) {
      expect(keys.has(forbidden), forbidden).toBe(false);
    }
  });
});

describe('valid envelopes', () => {
  const configs: [string, GameConfig][] = [
    ['one human', makeConfig(['H', 'BEGINNER', 'ADVANCED', 'EXPERT'])],
    ['two humans', makeConfig(['H', 'H', 'ADVANCED', 'BEGINNER'])],
    ['three humans', makeConfig(['H', 'H', 'H', 'EXPERT'])],
    ['four humans', makeConfig(['H', 'H', 'H', 'H'])],
    ['all AI, face up', makeConfig(['BEGINNER', 'ADVANCED', 'EXPERT', 'BEGINNER'], 'FACE_UP')],
    ['humans, face up', makeConfig(['H', 'H', 'BEGINNER', 'BEGINNER'], 'FACE_UP')],
  ];

  it.each(configs)('round-trips %s with an empty log', (_name, config) => {
    const e = envelope(7, config, []);
    const r = parseSave(serializeSave(e));
    expect(r).toEqual({ kind: 'OK', envelope: e });
  });

  it('round-trips a full log and accepts seed bounds', () => {
    for (const seed of [0, 1, 4294967295]) {
      const e = envelope(seed, GAME_A.final.config, GAME_A.log);
      expect(parseSave(serializeSave(e))).toEqual({ kind: 'OK', envelope: e });
    }
  });

  it('accepts the ISO forms with and without milliseconds', () => {
    for (const iso of ['2025-12-31T23:59:59Z', '2025-01-01T00:00:00.5Z', '2025-01-01T00:00:00.123Z']) {
      expect(kindOf(parseSave(serializeSave(envelope(1, SMALL.config, [], iso))))).toBe('OK');
    }
  });

  it('rejects malformed ISO strings', () => {
    for (const iso of ['', 'now', '2025-01-01', '2025-01-01T00:00:00', '2025-01-01T00:00:00+09:00', '2025-13-01T00:00:00Z',
      '2025-01-32T00:00:00Z', '2025-01-01T24:00:00Z', '2025-01-01T00:60:00Z', '2025-01-01T00:00:00.1234Z', ' 2025-01-01T00:00:00Z',
      '2025-01-01T00:00:00Z\n', `2025-01-01T00:00:00Z${' '.repeat(40)}`]) {
      expect(kindOf(parseSave(serializeSave(envelope(1, SMALL.config, [], iso)))), JSON.stringify(iso)).toBe('CORRUPT');
    }
  });

  it('returns frozen, fresh objects that share nothing with the parsed JSON', () => {
    const parsed: unknown[] = [];
    const original = JSON.parse;
    const spy = vi.spyOn(JSON, 'parse').mockImplementation((t, r) => {
      const v = original(t, r) as unknown;
      parsed.push(v);
      return v;
    });
    let r: ParsedSave;
    try {
      r = parseSave(SMALL_TEXT);
    } finally {
      spy.mockRestore();
    }
    expect(r.kind).toBe('OK');
    if (r.kind !== 'OK') return;
    const theirs = new Set<object>();
    const collect = (v: unknown): void => {
      if (typeof v === 'object' && v !== null) {
        theirs.add(v);
        Object.values(v).forEach(collect);
      }
    };
    parsed.forEach(collect);
    expect(theirs.size).toBeGreaterThan(10);
    const check = (v: unknown, path: string): void => {
      if (typeof v === 'object' && v !== null) {
        expect(Object.isFrozen(v), path).toBe(true);
        expect(theirs.has(v), path).toBe(false);
        Object.entries(v).forEach(([k, c]) => check(c, `${path}.${k}`));
      }
    };
    check(r.envelope, 'envelope');
  });
});

describe('garbage text', () => {
  it('rejects non-strings, empty, whitespace and invalid JSON', () => {
    for (const t of [undefined, null, 5, {}, [], '', ' ', '\n\t ', '\uFEFF', '{', '}', 'nul', 'undefined', '{"a":}', "{'a':1}", '{"a":1,}']) {
      expect(parseSave(t as unknown as string), String(t)).toEqual({ kind: 'CORRUPT' });
    }
  });

  it('rejects JSON of the wrong top-level type', () => {
    for (const t of ['null', '5', '"qroker-save"', '[]', '[1,2]', 'true', 'false', '[{"format":"qroker-save"}]']) {
      expect(parseSave(t), t).toEqual({ kind: 'CORRUPT' });
    }
  });

  it('never throws and is never OK for any strict prefix of a valid save', () => {
    expect(kindOf(parseSave(SMALL_TEXT))).toBe('OK');
    for (let i = 0; i < SMALL_TEXT.length; i++) {
      expect(parseSave(SMALL_TEXT.slice(0, i)).kind, `prefix ${i}`).toBe('CORRUPT');
    }
  });

  it('rejects trailing garbage', () => {
    expect(kindOf(parseSave(`${SMALL_TEXT}x`))).toBe('CORRUPT');
    expect(kindOf(parseSave(`${SMALL_TEXT}${SMALL_TEXT}`))).toBe('CORRUPT');
  });

  it('accepts surrounding whitespace', () => {
    expect(kindOf(parseSave(`\n  ${SMALL_TEXT}\t\n`))).toBe('OK');
  });

  it('bounds the text length', () => {
    const padded = (n: number): string => SMALL_TEXT + ' '.repeat(n - SMALL_TEXT.length);
    expect(kindOf(parseSave(padded(MAX_SAVE_TEXT_LENGTH)))).toBe('OK');
    expect(kindOf(parseSave(padded(MAX_SAVE_TEXT_LENGTH + 1)))).toBe('CORRUPT');
  });

  it('survives deeply nested garbage', () => {
    const deep = (n: number): string => '['.repeat(n) + ']'.repeat(n);
    expect(parseSave(deep(100_000))).toEqual({ kind: 'CORRUPT' });
    expect(parseSave(`{"format":"qroker-save","saveVersion":1,"x":${deep(100_000)}}`)).toEqual({ kind: 'CORRUPT' });
    const entry = `{"type":"SUBMIT_GUESSES","player":"P0","guesses":{"D4":${deep(5000)}}},`;
    const nested = SMALL_TEXT.replace('"actions":[', `"actions":[${entry}`);
    expect(nested).not.toBe(SMALL_TEXT);
    expect(parseSave(nested)).toEqual({ kind: 'CORRUPT' });
  });

  it('never echoes the input', () => {
    const marker = 'SECRET-MARKER-123';
    const results = [
      parseSave(`{"format":"${marker}"}`),
      parseSave(`{"format":"qroker-save","saveVersion":1,"rulesVersion":${RULES_VERSION},"note":"${marker}"}`),
      parseSave(`{"format":"qroker-save","saveVersion":99,"note":"${marker}"}`),
      parseSave(`{"format":"qroker-save","saveVersion":1,"rulesVersion":77,"note":"${marker}"}`),
      parseSave(marker),
    ];
    for (const r of results) expect(JSON.stringify(r)).not.toContain(marker);
    expect(results.map(kindOf)).toEqual(['CORRUPT', 'CORRUPT', 'INCOMPATIBLE', 'INCOMPATIBLE', 'CORRUPT']);
    expect(Object.keys(results[2] as object)).toEqual(['kind', 'reason']);
  });
});

describe('format and versions', () => {
  const withField = (field: string, value: unknown): string => text({ ...SMALL_OBJ(), [field]: value });

  it('rejects a wrong or missing format', () => {
    for (const v of ['qroker', 'QROKER-SAVE', 'qroker-save ', '', null, 1, true, [], {}]) {
      expect(parseSave(withField('format', v)).kind, JSON.stringify(v)).toBe('CORRUPT');
    }
    const o = SMALL_OBJ();
    delete o.format;
    expect(parseSave(text(o)).kind).toBe('CORRUPT');
  });

  it('classifies saveVersion', () => {
    for (const v of [2, 3, 99, Number.MAX_SAFE_INTEGER, 0]) {
      expect(parseSave(withField('saveVersion', v)), String(v)).toEqual({ kind: 'INCOMPATIBLE', reason: 'SAVE_VERSION' });
    }
    for (const v of [-1, 1.5, '1', null, NaN, Infinity, true, [], {}, 2 ** 60, -0.5]) {
      expect(parseSave(withField('saveVersion', v)).kind, String(v)).toBe('CORRUPT');
    }
    const o = SMALL_OBJ();
    delete o.saveVersion;
    expect(parseSave(text(o)).kind).toBe('CORRUPT');
  });

  it('checks the rules version before the structure', () => {
    const legacy = SMALL_OBJ();
    legacy.rulesVersion = 1;
    (legacy.config as Record<string, unknown>).rulesVersion = 1;
    expect(parseSave(text(legacy))).toEqual({ kind: 'INCOMPATIBLE', reason: 'RULES_VERSION' });
    const other = RULES_VERSION + 1;
    expect(parseSave(withField('rulesVersion', other))).toEqual({ kind: 'INCOMPATIBLE', reason: 'RULES_VERSION' });
    expect(parseSave(withField('rulesVersion', 0))).toEqual({ kind: 'INCOMPATIBLE', reason: 'RULES_VERSION' });
    expect(parseSave(withField('rulesVersion', -3))).toEqual({ kind: 'INCOMPATIBLE', reason: 'RULES_VERSION' });
    const garbage = { format: SAVE_FORMAT, saveVersion: 1, rulesVersion: other, seed: 'x', config: 5, actions: null };
    expect(parseSave(text(garbage))).toEqual({ kind: 'INCOMPATIBLE', reason: 'RULES_VERSION' });
    for (const v of [1.5, '1', null, true, [], {}, NaN, 2 ** 60]) {
      expect(parseSave(withField('rulesVersion', v)).kind, String(v)).toBe('CORRUPT');
    }
    const o = SMALL_OBJ();
    delete o.rulesVersion;
    expect(parseSave(text(o)).kind).toBe('CORRUPT');
    // A future save version wins over the rules version (decision order).
    expect(parseSave(text({ ...garbage, saveVersion: 2 }))).toEqual({ kind: 'INCOMPATIBLE', reason: 'SAVE_VERSION' });
  });

  it('rejects a config whose rulesVersion differs from the envelope', () => {
    const o = SMALL_OBJ();
    (o.config as Record<string, unknown>).rulesVersion = RULES_VERSION + 1;
    expect(parseSave(text(o)).kind).toBe('CORRUPT');
  });
});

describe('seed', () => {
  const withSeed = (v: unknown): string => text({ ...SMALL_OBJ(), seed: v });
  it('accepts only integers 0..4294967295', () => {
    for (const v of [0, 1, 12345, 4294967295]) expect(parseSave(withSeed(v)).kind, String(v)).toBe('OK');
    for (const v of [-1, 1.5, 2 ** 32, 2 ** 53, 1e21, '5', null, NaN, Infinity, true, [], {}, [5]]) {
      expect(parseSave(withSeed(v)).kind, String(v)).toBe('CORRUPT');
    }
    const o = SMALL_OBJ();
    delete o.seed;
    expect(parseSave(text(o)).kind).toBe('CORRUPT');
  });
  it('rejects -0 and an overflowing literal in the raw text', () => {
    expect(parseSave(SMALL_TEXT.replace(/"seed":\d+/, '"seed":-0')).kind).toBe('CORRUPT');
    expect(parseSave(SMALL_TEXT.replace(/"seed":\d+/, '"seed":1e400')).kind).toBe('CORRUPT');
    expect(parseSave(SMALL_TEXT.replace(/"seed":\d+/, '"seed":4294967296')).kind).toBe('CORRUPT');
  });
});

describe('config', () => {
  const mutate = (f: (o: Record<string, any>) => void): ParsedSave => {
    const o = SMALL_OBJ();
    f(o);
    return parseSave(text(o));
  };
  const corrupt = (name: string, f: (o: Record<string, any>) => void): void => {
    it(name, () => expect(mutate(f)).toEqual({ kind: 'CORRUPT' }));
  };

  corrupt('3 seats', (o) => o.config.seats.pop());
  corrupt('5 seats', (o) => o.config.seats.push({ ...o.config.seats[0], id: 'P4' }));
  corrupt('wrong order', (o) => o.config.seats.reverse());
  corrupt('duplicate ids', (o) => (o.config.seats[1].id = 'P0'));
  corrupt('unknown id', (o) => (o.config.seats[3].id = 'P4'));
  corrupt('bad kind', (o) => (o.config.seats[0].kind = 'BOT'));
  corrupt('lowercase kind', (o) => (o.config.seats[0].kind = 'human'));
  corrupt('bad difficulty', (o) => (o.config.seats[1].difficulty = 'HARD'));
  corrupt('AI without difficulty', (o) => delete o.config.seats[1].difficulty);
  corrupt('HUMAN with difficulty', (o) => (o.config.seats[0].difficulty = 'BEGINNER'));
  corrupt('name not a string', (o) => (o.config.seats[0].name = 5));
  corrupt('name too long', (o) => (o.config.seats[0].name = 'x'.repeat(201)));
  corrupt('seats not an array', (o) => (o.config.seats = { 0: o.config.seats[0] }));
  corrupt('bad visibility', (o) => (o.config.identityVisibility = 'PUBLIC'));
  corrupt('scoreConfig null', (o) => (o.config.scoreConfig = null));
  corrupt('scoreConfig.id number', (o) => (o.config.scoreConfig.id = 1));
  corrupt('scoreConfig.provisional string', (o) => (o.config.scoreConfig.provisional = 'true'));
  corrupt('rewardByError null element', (o) => (o.config.scoreConfig.config.rewardByError[0] = null));
  corrupt('rewardByError string element', (o) => (o.config.scoreConfig.config.rewardByError[1] = '5'));
  corrupt('rewardByError not an array', (o) => (o.config.scoreConfig.config.rewardByError = 5));
  corrupt('rewardByError too long', (o) => (o.config.scoreConfig.config.rewardByError = new Array(65).fill(1)));
  corrupt('handEmptyBonus string', (o) => (o.config.scoreConfig.config.handEmptyBonus = '1'));
  corrupt('unknown config key', (o) => (o.config.extra = 1));
  corrupt('unknown seat key', (o) => (o.config.seats[2].hand = []));
  corrupt('unknown scoreConfig key', (o) => (o.config.scoreConfig.extra = 1));
  corrupt('unknown score config key', (o) => (o.config.scoreConfig.config.extra = 1));
  corrupt('unknown envelope key', (o) => (o.extra = 1));
  corrupt('config is an array', (o) => (o.config = []));
  corrupt('missing config', (o) => delete o.config);

  it('keeps score semantics for the engine: an empty reward table parses', () => {
    expect(mutate((o) => (o.config.scoreConfig.config.rewardByError = [])).kind).toBe('OK');
  });
});

describe('actions', () => {
  const place = (): Record<string, any> => ({ type: 'PLACE', player: 'P0', card: 'H-7', pos: { row: 3, col: 4 }, orientation: 180 });
  const submit = (): Record<string, any> => ({ type: 'SUBMIT_GUESSES', player: 'P1', guesses: { D4: 10, E4: 20 } });
  const withActions = (actions: unknown): ParsedSave => parseSave(text({ ...SMALL_OBJ(), actions }));
  const bad = (name: string, a: unknown): void => {
    it(name, () => expect(withActions([a])).toEqual({ kind: 'CORRUPT' }));
  };

  it('accepts the three action shapes', () => {
    expect(withActions([place(), submit(), { type: 'ACK_REVEAL' }]).kind).toBe('OK');
    expect(withActions([]).kind).toBe('OK');
  });

  bad('unknown type', { type: 'PASS' });
  bad('missing type', { player: 'P0' });
  bad('type not a string', { type: 1 });
  bad('null action', null);
  bad('array action', []);
  bad('string action', 'ACK_REVEAL');
  bad('PLACE without player', (({ player, ...r }) => r)(place()));
  bad('PLACE bad player', { ...place(), player: 'P4' });
  bad('PLACE lowercase player', { ...place(), player: 'p0' });
  bad('PLACE bad card', { ...place(), card: 'H-11' });
  bad('PLACE non-string card', { ...place(), card: 7 });
  for (const pos of [{ row: 1.5, col: 0 }, { row: -1, col: 0 }, { row: 8, col: 0 }, { row: '1', col: 0 }, { row: 0, col: 8 }, { row: 0 }, { row: 0, col: 0, z: 1 }, null, [], 'A1']) {
    bad(`PLACE bad pos ${JSON.stringify(pos)}`, { ...place(), pos });
  }
  for (const orientation of [90, '180', null, -0.5, 360, '0', true]) bad(`PLACE bad orientation ${String(orientation)}`, { ...place(), orientation });
  bad('PLACE extra key', { ...place(), extra: 1 });
  bad('PLACE missing orientation', (({ orientation, ...r }) => r)(place()));
  bad('guesses as array', { ...submit(), guesses: [10] });
  bad('guesses null', { ...submit(), guesses: null });
  bad('guesses missing', (({ guesses, ...r }) => r)(submit()));
  bad('guess bad key lowercase', { ...submit(), guesses: { d4: 10 } });
  bad('guess bad key H8', { ...submit(), guesses: { H8: 10 } });
  bad('guess bad key A8', { ...submit(), guesses: { A8: 10 } });
  bad('guess bad key empty', { ...submit(), guesses: { '': 10 } });
  bad('guess non-number', { ...submit(), guesses: { D4: '10' } });
  bad('guess null', { ...submit(), guesses: { D4: null } });
  bad('guess object', { ...submit(), guesses: { D4: {} } });
  bad('SUBMIT bad player', { ...submit(), player: 'P9' });
  bad('SUBMIT extra key', { ...submit(), extra: 1 });
  bad('ACK_REVEAL with extra field', { type: 'ACK_REVEAL', player: 'P0' });

  it('rejects __proto__, constructor and prototype in guesses', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const g = { D4: 10 };
      Object.defineProperty(g, key, { value: 5, enumerable: true, configurable: true, writable: true });
      expect(withActions([{ ...submit(), guesses: g }]).kind, key).toBe('CORRUPT');
    }
  });

  it('rejects an actions field that is not an array', () => {
    for (const v of [null, {}, 'x', 5, true, { length: 0 }]) expect(withActions(v).kind, JSON.stringify(v)).toBe('CORRUPT');
    const o = SMALL_OBJ();
    delete o.actions;
    expect(parseSave(text(o)).kind).toBe('CORRUPT');
  });

  it('bounds the number of actions', () => {
    const ack = { type: 'ACK_REVEAL' };
    expect(withActions(new Array(MAX_ACTIONS).fill(ack)).kind).toBe('OK');
    expect(withActions(new Array(MAX_ACTIONS + 1).fill(ack)).kind).toBe('CORRUPT');
  });

  it('keeps value ranges for the engine: 3.5, 99 and 0 parse, replay rejects them', () => {
    for (const g of [3.5, 99, 0, -7]) {
      const r = withActions([{ ...submit(), guesses: { D4: g } }]);
      expect(r.kind, String(g)).toBe('OK');
    }
  });
});

describe('patterns mirror the engine', () => {
  const placeText = (card: unknown, pos: unknown = { row: 0, col: 0 }): string =>
    text({ ...SMALL_OBJ(), actions: [{ type: 'PLACE', player: 'P0', card, pos, orientation: 0 }] });
  const guessText = (key: string): string =>
    text({ ...SMALL_OBJ(), actions: [{ type: 'SUBMIT_GUESSES', player: 'P0', guesses: { [key]: 10 } }] });

  it('accepts exactly the 52 CardIds among near misses', () => {
    const candidates = new Set<string>(ALL_CARDS);
    const ranks = [...RANKS, '0', '1', '11', '14', '01', '1O', 'a', 'j', 'B', '', '10 ', ' 2', '2\n', '١'];
    for (const suit of ['H', 'D', 'C', 'S', 'h', 'X', '', 'HH', 'Ｈ']) {
      for (const sep of ['-', '_', '', ' ', '–']) for (const rank of ranks) candidates.add(`${suit}${sep}${rank}`);
    }
    candidates.add('H-7\n');
    candidates.add('H-7\0');
    const accepted = [...candidates].filter((c) => parseSave(placeText(c)).kind === 'OK').sort();
    expect(accepted).toEqual([...ALL_CARDS].sort());
  });

  it('accepts exactly the Quad_Keys of core/geometry among near misses', () => {
    const expected = new Set<string>();
    for (let row = 0; row <= 6; row++) for (let col = 0; col <= 6; col++) expected.add(quadKey({ row, col }));
    expect(expected.size).toBe(49);
    const candidates = new Set<string>(['', 'A', '1', 'A11', ' A1', 'A1 ', 'A1\n', 'a1', 'AA', 'A-1', '１']);
    for (const c of 'ABCDEFGHIa') for (const d of '0123456789') candidates.add(`${c}${d}`);
    const accepted = [...candidates].filter((k) => parseSave(guessText(k)).kind === 'OK').sort();
    expect(accepted).toEqual([...expected].sort());
  });

  it('accepts exactly the grid indices 0..7', () => {
    const values: unknown[] = [-1, 0, 1, 7, 8, 9, 1.5, '3', null, true, [], {}, 1e21, -0];
    const accepted = values.filter((v) => parseSave(placeText('H-7', { row: v, col: 3 })).kind === 'OK');
    expect(accepted).toEqual([0, 1, 7, -0]);
    const accepted2 = values.filter((v) => parseSave(placeText('H-7', { row: 3, col: v })).kind === 'OK');
    expect(accepted2).toEqual([0, 1, 7, -0]);
  });
});

describe('every required field, every wrong type', () => {
  type Path = (string | number)[];
  const paths: Path[] = [];
  const rich = envelope(1, makeConfig(['H', 'BEGINNER', 'ADVANCED', 'EXPERT']), GAME_A.log.slice(0, FIRST_ACK + 2));
  const richObj = JSON.parse(serializeSave(rich)) as Record<string, unknown>;
  const collect = (v: unknown, p: Path): void => {
    if (p.length > 0) paths.push(p);
    if (Array.isArray(v)) v.forEach((c, i) => collect(c, [...p, i]));
    else if (typeof v === 'object' && v !== null) for (const [k, c] of Object.entries(v)) collect(c, [...p, k]);
  };
  collect(richObj, []);

  const clone = (): Record<string, any> => JSON.parse(text(richObj)) as Record<string, any>;
  const parentOf = (root: any, p: Path): any => p.slice(0, -1).reduce((n, k) => n[k], root);
  const dotted = (p: Path): string => p.join('.');

  it('covers all action types and nested objects', () => {
    const names = paths.map(dotted);
    for (const needle of ['format', 'config.seats.1.difficulty', 'config.scoreConfig.config.rewardByError.0', 'actions.0.pos.row']) {
      expect(names.some((n) => n.startsWith(needle)), needle).toBe(true);
    }
    expect(names.some((n) => /^actions\.\d+\.guesses\.[A-G][1-7]$/.test(n))).toBe(true);
    const types = new Set((richObj.actions as { type: string }[]).map((a) => a.type));
    expect([...types].sort()).toEqual(['ACK_REVEAL', 'PLACE', 'SUBMIT_GUESSES']);
    expect(paths.length).toBeGreaterThan(60);
  });

  it('removing any object key is CORRUPT', () => {
    let removed = 0;
    for (const p of paths) {
      const root = clone();
      const parent = parentOf(root, p);
      const key = p[p.length - 1] as string | number;
      if (Array.isArray(parent)) continue;
      // A Guess entry is not a required field (the engine checks the key set): skip the guesses members.
      if (p.includes('guesses') && p[p.length - 1] !== 'guesses') continue;
      delete parent[key];
      removed++;
      expect(parseSave(text(root)), `remove ${dotted(p)}`).toEqual({ kind: 'CORRUPT' });
    }
    expect(removed).toBeGreaterThan(40);
  });

  const replacements: unknown[] = [null, 'x', -12345.5, true, [], {}, [1], { a: 1 }];
  const accepted = (p: Path, original: unknown, r: unknown): boolean => {
    const name = dotted(p);
    if (JSON.stringify(original) === JSON.stringify(r)) return true;
    if (/(\.name|scoreConfig\.id)$/.test(name) && typeof r === 'string') return true;
    if (/provisional$/.test(name) && typeof r === 'boolean') return true;
    if (/(rewardByError\.\d+|handEmptyBonus|guesses\.[A-G][1-7])$/.test(name) && typeof r === 'number') return true;
    if (/rewardByError$/.test(name) && Array.isArray(r) && r.every((x) => typeof x === 'number')) return true;
    if (/(^actions|guesses)$/.test(name) && ((Array.isArray(r) && r.length === 0 && name === 'actions') || (!Array.isArray(r) && typeof r === 'object' && r !== null && Object.keys(r).length === 0 && name !== 'actions'))) return true;
    return false;
  };

  it('replacing any value by a value of another type is never OK, and never throws', () => {
    let checked = 0;
    for (const p of paths) {
      for (const r of replacements) {
        const root = clone();
        const parent = parentOf(root, p);
        const key = p[p.length - 1] as string | number;
        const original = parent[key];
        parent[key] = r;
        const result = parseSave(text(root));
        expect(KINDS).toContain(result.kind);
        if (!accepted(p, original, r)) {
          expect(result.kind, `${dotted(p)} <- ${JSON.stringify(r)}`).not.toBe('OK');
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(400);
  });
});

describe('prototype pollution', () => {
  it('rejects __proto__, constructor and prototype keys at every object level, without touching Object.prototype', () => {
    const base = SMALL_OBJ();
    const nodes: Path[] = [];
    type Path = (string | number)[];
    const collect = (v: unknown, p: Path): void => {
      if (Array.isArray(v)) v.forEach((c, i) => collect(c, [...p, i]));
      else if (typeof v === 'object' && v !== null) {
        nodes.push(p);
        for (const [k, c] of Object.entries(v)) collect(c, [...p, k]);
      }
    };
    collect(base, []);
    expect(nodes.length).toBeGreaterThan(20);
    for (const p of nodes) {
      for (const key of ['__proto__', 'constructor', 'prototype']) {
        const root = SMALL_OBJ();
        const node = p.reduce<any>((n, k) => n[k], root);
        Object.defineProperty(node, key, { value: { polluted: 'yes' }, enumerable: true, configurable: true, writable: true });
        const t = text(root);
        expect(t).toContain(`"${key}"`);
        expect(parseSave(t), `${p.join('.')}.${key}`).toEqual({ kind: 'CORRUPT' });
      }
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(Object.prototype)).toEqual([]);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(Object.getOwnPropertyNames(Object.prototype).includes('polluted')).toBe(false);
  });

  it('does not pollute through a raw __proto__ text either', () => {
    const t = SMALL_TEXT.replace('{"format"', '{"__proto__":{"polluted":1},"format"');
    expect(parseSave(t)).toEqual({ kind: 'CORRUPT' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('seeded mutation fuzz', () => {
  it('always returns one of the four kinds, never throws, and OK results re-serialize stably', () => {
    const rand = mulberry32(20250102);
    const pick = (n: number): number => Math.floor(rand() * n);
    const alphabet = '{}[]",:0123456789-.eEtfnulabcPH \\';
    const counts: Record<string, number> = { OK: 0, MIGRATED: 0, INCOMPATIBLE: 0, CORRUPT: 0 };
    const paths: (string | number)[][] = [];
    const collect = (v: unknown, p: (string | number)[]): void => {
      if (p.length > 0) paths.push(p);
      if (Array.isArray(v)) v.forEach((c, i) => collect(c, [...p, i]));
      else if (typeof v === 'object' && v !== null) for (const [k, c] of Object.entries(v)) collect(c, [...p, k]);
    };
    collect(SMALL_OBJ(), []);
    const values: unknown[] = [null, 0, -1, 1.5, 2 ** 40, 'x', '', true, [], {}, [null], { a: null }, 'P9', 'H-99'];

    for (let i = 0; i < 300; i++) {
      let mutated: string;
      const mode = i % 5;
      if (mode < 3) {
        const pos = pick(SMALL_TEXT.length);
        const ch = alphabet.charAt(pick(alphabet.length));
        if (mode === 0) mutated = SMALL_TEXT.slice(0, pos) + SMALL_TEXT.slice(pos + 1);
        else if (mode === 1) mutated = SMALL_TEXT.slice(0, pos) + ch + SMALL_TEXT.slice(pos + 1);
        else mutated = SMALL_TEXT.slice(0, pos) + ch + SMALL_TEXT.slice(pos);
      } else {
        const root = SMALL_OBJ() as any;
        const p = paths[pick(paths.length)] as (string | number)[];
        const parent = p.slice(0, -1).reduce((n, k) => n[k], root);
        const key = p[p.length - 1] as string | number;
        if (mode === 3) {
          if (Array.isArray(parent)) parent.splice(key as number, 1);
          else delete parent[key];
        } else parent[key] = values[pick(values.length)];
        mutated = text(root);
      }
      const r = parseSave(mutated);
      expect(KINDS).toContain(r.kind);
      counts[r.kind] = (counts[r.kind] ?? 0) + 1;
      if (r.kind === 'OK') expect(parseSave(serializeSave(r.envelope))).toEqual(r);
    }
    expect(counts.CORRUPT).toBeGreaterThan(150);
  });
});

describe('migrations (test-only functions through parseSaveWith)', () => {
  const current = { saveVersion: 1, rulesVersion: RULES_VERSION };
  /** An invented old shape, used only as a fixture: the seed is called `seedValue`. */
  const oldShape = (version: number): string => {
    const { seed, ...rest } = SMALL_OBJ();
    return text({ ...rest, saveVersion: version, seedValue: seed });
  };
  const rename = (next: number) => (old: unknown): unknown => {
    const { seedValue, ...rest } = old as Record<string, unknown>;
    return { ...rest, seed: seedValue, saveVersion: next };
  };

  it('without a migration an older version is INCOMPATIBLE', () => {
    expect(parseSaveWith(oldShape(0), { ...current, migrations: {} })).toEqual({ kind: 'INCOMPATIBLE', reason: 'SAVE_VERSION' });
    expect(parseSave(oldShape(0))).toEqual({ kind: 'INCOMPATIBLE', reason: 'SAVE_VERSION' });
  });

  it('migrates version 0 to 1', () => {
    const r = parseSaveWith(oldShape(0), { ...current, migrations: { 0: rename(1) } });
    expect(r).toEqual({ kind: 'MIGRATED', envelope: SMALL, fromVersion: 0 });
    if (r.kind === 'MIGRATED') expect(Object.isFrozen(r.envelope.config.seats)).toBe(true);
  });

  it('chains two steps', () => {
    const migrations = { 0: rename(1), 1: (o: unknown) => ({ ...(o as object), saveVersion: 2 }) };
    const options = { saveVersion: 2, rulesVersion: RULES_VERSION, migrations };
    const r = parseSaveWith(oldShape(0), options);
    expect(r.kind).toBe('MIGRATED');
    if (r.kind === 'MIGRATED') {
      expect(r.fromVersion).toBe(0);
      expect(r.envelope.saveVersion).toBe(2);
      expect(r.envelope.seed).toBe(1);
    }
    const second = parseSaveWith(text({ ...SMALL_OBJ(), saveVersion: 1 }), options);
    expect(second).toMatchObject({ kind: 'MIGRATED', fromVersion: 1 });
    expect(parseSaveWith(text({ ...SMALL_OBJ(), saveVersion: 2 }), options).kind).toBe('OK');
    expect(parseSaveWith(text({ ...SMALL_OBJ(), saveVersion: 3 }), options)).toEqual({ kind: 'INCOMPATIBLE', reason: 'SAVE_VERSION' });
  });

  it('a missing middle step is INCOMPATIBLE', () => {
    const options = { saveVersion: 3, rulesVersion: RULES_VERSION, migrations: { 0: rename(1), 2: (o: unknown) => o } };
    expect(parseSaveWith(oldShape(0), options)).toEqual({ kind: 'INCOMPATIBLE', reason: 'SAVE_VERSION' });
  });

  it('ignores inherited migration entries', () => {
    const inherited = Object.create({ 0: rename(1) }) as Record<number, (o: unknown) => unknown>;
    expect(parseSaveWith(oldShape(0), { ...current, migrations: inherited })).toEqual({ kind: 'INCOMPATIBLE', reason: 'SAVE_VERSION' });
  });

  it('a throwing migration is CORRUPT', () => {
    const migrations = { 0: () => { throw new Error('boom'); } };
    expect(parseSaveWith(oldShape(0), { ...current, migrations })).toEqual({ kind: 'CORRUPT' });
  });

  it('a migration returning garbage or the wrong version is CORRUPT', () => {
    for (const out of [null, undefined, 5, 'x', [], true, { saveVersion: 7 }, { saveVersion: 0 }, { saveVersion: '1' }, {}]) {
      const r = parseSaveWith(oldShape(0), { ...current, migrations: { 0: () => out } });
      expect(r, JSON.stringify(out)).toEqual({ kind: 'CORRUPT' });
    }
  });

  it('migration output goes through the same guards', () => {
    const base = (mod: (o: Record<string, any>) => void) => (old: unknown): unknown => {
      const o = rename(1)(old) as Record<string, any>;
      mod(o);
      return o;
    };
    const run = (mod: (o: Record<string, any>) => void): ParsedSave => parseSaveWith(oldShape(0), { ...current, migrations: { 0: base(mod) } });
    expect(run(() => undefined).kind).toBe('MIGRATED');
    expect(run((o) => (o.seed = -1))).toEqual({ kind: 'CORRUPT' });
    expect(run((o) => (o.seedValue = 5))).toEqual({ kind: 'CORRUPT' });
    expect(run((o) => (o.config.seats.pop()))).toEqual({ kind: 'CORRUPT' });
    expect(run((o) => (o.actions = [{ type: 'PASS' }]))).toEqual({ kind: 'CORRUPT' });
    expect(run((o) => (o.format = 'other'))).toEqual({ kind: 'CORRUPT' });
    expect(run((o) => delete o.rulesVersion)).toEqual({ kind: 'CORRUPT' });
    expect(run((o) => (o.rulesVersion = RULES_VERSION + 1))).toEqual({ kind: 'INCOMPATIBLE', reason: 'RULES_VERSION' });
  });

  it('does not migrate when the format is wrong', () => {
    let called = false;
    const migrations = { 0: (o: unknown) => { called = true; return rename(1)(o); } };
    expect(parseSaveWith(text({ ...JSON.parse(oldShape(0)), format: 'x' }), { ...current, migrations })).toEqual({ kind: 'CORRUPT' });
    expect(called).toBe(false);
  });
});

describe('real games: round trip and replay', () => {
  const games: [string, number, GameConfig][] = [
    ['1 human, OWNER_ONLY', 1, makeConfig(['H', 'BEGINNER', 'BEGINNER', 'BEGINNER'])],
    ['2 humans, FACE_UP', 2, makeConfig(['H', 'H', 'ADVANCED', 'BEGINNER'], 'FACE_UP')],
    ['4 humans', 3, makeConfig(['H', 'H', 'H', 'H'])],
    ['mixed AI', 4294967295, makeConfig(['BEGINNER', 'ADVANCED', 'BEGINNER', 'ADVANCED'], 'FACE_UP')],
  ];

  it.each(games)('%s: parse(serialize) is OK and replays to the original final state', (_n, seed, config) => {
    const { final, log } = play(seed, config);
    const e = envelope(seed, final.config, log);
    const r = parseSave(serializeSave(e));
    expect(r).toEqual({ kind: 'OK', envelope: e });
    if (r.kind !== 'OK') return;
    const replayed = replay(r.envelope.seed, r.envelope.config, r.envelope.actions);
    expect(replayed.ok).toBe(true);
    if (replayed.ok) expect(stateEquals(replayed.value, final)).toBe(true);
    expect(serializeSave(r.envelope)).toBe(serializeSave(e));
  });

  it('every cut of the log (after a PLACE, a partial batch, the last Guess, an ACK) round-trips and replays', () => {
    const config = makeConfig(['H', 'H', 'ADVANCED', 'BEGINNER'], 'FACE_UP');
    const { final, log } = play(5, config);
    const cuts = new Set<number>();
    const firstAck = log.findIndex((a) => a.type === 'ACK_REVEAL');
    for (let n = 0; n <= Math.min(log.length, firstAck + 4); n++) cuts.add(n);
    cuts.add(log.length);
    let sawPartialBatch = false;
    for (const n of cuts) {
      const actions = log.slice(0, n);
      const r = parseSave(serializeSave(envelope(5, final.config, actions)));
      expect(r.kind, `cut ${n}`).toBe('OK');
      if (r.kind !== 'OK') continue;
      const replayed = replay(5, r.envelope.config, r.envelope.actions);
      expect(replayed.ok, `cut ${n}`).toBe(true);
      if (!replayed.ok) continue;
      expect(stateEquals(replayed.value, stateByReduce(5, final.config, actions)), `cut ${n}`).toBe(true);
      if (replayed.value.phase === 'GUESS_COLLECT' && replayed.value.pending !== null && actions.length > 0) sawPartialBatch = true;
    }
    expect(sawPartialBatch).toBe(true);
  });

  it('parser-accepted but engine-invalid logs are rejected by replay without throwing', () => {
    const { final, log } = play(1, makeConfig(['H', 'BEGINNER', 'BEGINNER', 'BEGINNER']));
    const firstSubmit = log.findIndex((a) => a.type === 'SUBMIT_GUESSES');
    expect(firstSubmit).toBeGreaterThan(0);
    const pre = log.slice(0, firstSubmit); // legal prefix, ends in GUESS_COLLECT
    const n = pre.length;
    const submit = log[firstSubmit] as Extract<Action, { type: 'SUBMIT_GUESSES' }>;
    const first = log[0] as Extract<Action, { type: 'PLACE' }>;
    const last = pre[n - 1] as Extract<Action, { type: 'PLACE' }>;
    const firstKey = Object.keys(submit.guesses)[0] as string;
    const otherCard = ALL_CARDS.find((c) => c !== first.card) as (typeof ALL_CARDS)[number];
    const cases: [string, Action[], number][] = [
      ['wrong card', [{ ...first, card: otherCard }, ...log.slice(1, n)], 0],
      ['PLACE during GUESS_COLLECT', [...pre, last], n],
      ['guess 3.5', [...pre, { ...submit, guesses: { ...submit.guesses, [firstKey]: 3.5 } }], n],
      ['guess 99', [...pre, { ...submit, guesses: { ...submit.guesses, [firstKey]: 99 } }], n],
      ['duplicate submission', [...pre, submit, submit], n + 1],
      ['empty guesses', [...pre, { ...submit, guesses: {} }], n],
      ['ACK too early', [...pre, { type: 'ACK_REVEAL' }], n],
      ['wrong seat in first PLACE', [{ ...first, player: 'P1' }], 0],
      ['actions after the end', [...log, { type: 'ACK_REVEAL' }], log.length],
    ];
    for (const [name, actions, index] of cases) {
      const parsed = parseSave(serializeSave(envelope(1, final.config, actions)));
      expect(parsed.kind, name).toBe('OK');
      if (parsed.kind !== 'OK') continue;
      const replayed = replay(1, parsed.envelope.config, parsed.envelope.actions);
      expect(replayed.ok, name).toBe(false);
      if (!replayed.ok) {
        expect(isReplayRejection(replayed.error), name).toBe(true);
        if (isReplayRejection(replayed.error)) expect(replayed.error.index, name).toBe(index);
      }
    }
  });
});

describe('source scan of save-format.ts', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(dir, 'save-format.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

  it('imports exactly core/score and core/types', () => {
    const imports = [...code.matchAll(/\bfrom\s+'([^']+)'/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(['../core/score', '../core/types']);
    expect(code).not.toMatch(/\bimport\s*\(|\brequire\s*\(/);
  });

  it('uses no storage, DOM, console, clock, randomness, node or network', () => {
    for (const word of ['localStorage', 'sessionStorage', 'console', 'window', 'document', 'globalThis', 'Date', 'fetch', 'performance', 'crypto', 'process']) {
      expect(code, word).not.toMatch(new RegExp(`\\b${word}\\b`));
    }
    expect(code).not.toMatch(/Math\s*\.\s*random/);
    expect(code).not.toContain('node:');
  });

  it('has no replay, loadGame, saveGame or store functions (tasks 20.2 to 20.4)', () => {
    expect(code).not.toMatch(/\b(loadGame|saveGame|memoryStore|browserStore|KeyValueStore|SAVE_KEY|PREFS_KEY)\b/);
  });
});

afterEach(() => vi.restoreAllMocks());
