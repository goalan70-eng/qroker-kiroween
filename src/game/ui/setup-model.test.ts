// Tests of the pure setup model (task 19.1). Evidence class: model (Node, no DOM).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../core/state';
import type { Difficulty } from '../core/types';
import {
  aiSeatIds,
  DEFAULT_SETUP_PREFS,
  MAX_HUMANS,
  MIN_HUMANS,
  sanitizeSetupPrefs,
  SETUP_DIFFICULTIES,
  SETUP_VISIBILITIES,
  seatsFor,
  validateSetup,
} from './setup-model';
import type { SetupOptions } from './setup-model';

const options = (patch: Record<string, unknown> = {}): unknown => ({ ...DEFAULT_SETUP_PREFS, seedText: '12345', ...patch });
const problemFields = (value: unknown): string[] => {
  const result = validateSetup(value);
  return result.ok ? [] : result.problems.map((p) => `${p.field}${p.seat === undefined ? '' : `:${p.seat}`}`);
};

describe('constants', () => {
  it('offers BEGINNER and ADVANCED, both visibilities, and 1 to 4 humans', () => {
    expect([...SETUP_DIFFICULTIES]).toEqual(['BEGINNER', 'ADVANCED']);
    expect([...SETUP_VISIBILITIES]).toEqual(['OWNER_ONLY', 'BLIND', 'BLIND_SCORE_ONLY']);
    expect([MIN_HUMANS, MAX_HUMANS]).toEqual([1, 4]);
    expect(SETUP_DIFFICULTIES).not.toContain('EXPERT');
  });
  it('has frozen defaults: 1 human, BEGINNER everywhere, OWNER_ONLY', () => {
    expect(DEFAULT_SETUP_PREFS).toEqual({ humanCount: 1, difficulties: ['BEGINNER', 'BEGINNER', 'BEGINNER', 'BEGINNER'], identityVisibility: 'OWNER_ONLY' });
    expect(Object.isFrozen(DEFAULT_SETUP_PREFS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SETUP_PREFS.difficulties)).toBe(true);
  });
});

describe('seatsFor', () => {
  it('equals the seats and visibility of defaultConfig() for DEFAULT_SETUP_PREFS', () => {
    const config = defaultConfig();
    expect(seatsFor(DEFAULT_SETUP_PREFS)).toEqual(config.seats);
    expect(DEFAULT_SETUP_PREFS.identityVisibility).toBe(config.identityVisibility);
  });

  it('makes P0..P(k-1) human and the rest AI, with the names of the design', () => {
    const names = (k: number): string[] => seatsFor({ ...DEFAULT_SETUP_PREFS, humanCount: k }).map((s) => s.name);
    expect(names(1)).toEqual(['You', 'AI 1', 'AI 2', 'AI 3']);
    expect(names(2)).toEqual(['Player 1', 'Player 2', 'AI 1', 'AI 2']);
    expect(names(3)).toEqual(['Player 1', 'Player 2', 'Player 3', 'AI 1']);
    expect(names(4)).toEqual(['Player 1', 'Player 2', 'Player 3', 'Player 4']);
    for (let k = 1; k <= 4; k++) {
      const seats = seatsFor({ ...DEFAULT_SETUP_PREFS, humanCount: k });
      expect(seats.map((s) => s.id)).toEqual(['P0', 'P1', 'P2', 'P3']);
      expect(seats.map((s) => s.kind)).toEqual(['P0', 'P1', 'P2', 'P3'].map((_, i) => (i < k ? 'HUMAN' : 'AI')));
      for (const seat of seats) expect('difficulty' in seat, `${k} ${seat.id}`).toBe(seat.kind === 'AI');
    }
  });

  it('applies the difficulty of each AI seat by seat index and ignores those of human seats', () => {
    const tiers: [Difficulty, Difficulty, Difficulty, Difficulty] = ['ADVANCED', 'BEGINNER', 'ADVANCED', 'BEGINNER'];
    const seats = seatsFor({ ...DEFAULT_SETUP_PREFS, humanCount: 2, difficulties: tiers });
    expect(seats.map((s) => s.difficulty)).toEqual([undefined, undefined, 'ADVANCED', 'BEGINNER']);
  });

  it('returns frozen seats', () => {
    const seats = seatsFor(DEFAULT_SETUP_PREFS);
    expect(Object.isFrozen(seats)).toBe(true);
    for (const seat of seats) expect(Object.isFrozen(seat)).toBe(true);
  });
});

describe('aiSeatIds', () => {
  it('lists the seats after the humans and none for an invalid count', () => {
    expect(aiSeatIds(1)).toEqual(['P1', 'P2', 'P3']);
    expect(aiSeatIds(2)).toEqual(['P2', 'P3']);
    expect(aiSeatIds(3)).toEqual(['P3']);
    expect(aiSeatIds(4)).toEqual([]);
    for (const bad of [0, 5, 2.5, Number.NaN, -1]) expect(aiSeatIds(bad), String(bad)).toEqual([]);
  });
});

describe('validateSetup', () => {
  it('accepts each human count with the default and with mixed difficulties, and freezes the result', () => {
    for (let k = 1; k <= 4; k++) {
      for (const difficulties of [DEFAULT_SETUP_PREFS.difficulties, ['ADVANCED', 'BEGINNER', 'ADVANCED', 'BEGINNER']]) {
        const result = validateSetup(options({ humanCount: k, difficulties }));
        expect(result.ok, `${k}`).toBe(true);
        if (!result.ok) continue;
        expect(result.value.humanCount).toBe(k);
        expect(result.value.seedText).toBe('12345');
        expect(Object.isFrozen(result.value)).toBe(true);
        expect(Object.isFrozen(result.value.difficulties)).toBe(true);
        for (let i = k; i < 4; i++) expect(result.value.difficulties[i]).toBe(difficulties[i]);
      }
    }
  });

  it('normalizes the entries of human seats to the default tier and does not check them', () => {
    const result = validateSetup(options({ humanCount: 2, difficulties: ['EXPERT', 'nope', 'ADVANCED', 'ADVANCED'] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect([...result.value.difficulties]).toEqual(['BEGINNER', 'BEGINNER', 'ADVANCED', 'ADVANCED']);
  });

  it('rejects an invalid human count with INVALID_CONFIG', () => {
    for (const bad of [0, 5, 2.5, Number.NaN, Infinity, -1, '2', null, undefined, true, [], {}]) {
      const result = validateSetup(options({ humanCount: bad }));
      expect(result.ok, String(bad)).toBe(false);
      if (!result.ok) expect(result.problems, String(bad)).toContainEqual({ field: 'humanCount', code: 'INVALID_CONFIG' });
    }
  });

  it('rejects EXPERT and unknown difficulties of an AI seat, naming the seat', () => {
    expect(problemFields(options({ difficulties: ['BEGINNER', 'EXPERT', 'BEGINNER', 'BEGINNER'] }))).toEqual(['difficulties:P1']);
    expect(problemFields(options({ difficulties: ['BEGINNER', 'BEGINNER', 'master', 'BEGINNER'] }))).toEqual(['difficulties:P2']);
    expect(problemFields(options({ difficulties: ['BEGINNER', 'BEGINNER', 'BEGINNER', 3] }))).toEqual(['difficulties:P3']);
    expect(problemFields(options({ humanCount: 4, difficulties: ['EXPERT', 'EXPERT', 'EXPERT', 'EXPERT'] }))).toEqual([]); // no AI seat
  });

  it('rejects a difficulty list that is not an array of four', () => {
    for (const bad of [undefined, null, 'BEGINNER', ['BEGINNER'], ['BEGINNER', 'BEGINNER', 'BEGINNER'], {}]) {
      expect(problemFields(options({ difficulties: bad })), JSON.stringify(bad)).toEqual(['difficulties']);
    }
  });

  it('rejects an unknown visibility and a seed text that is not a string', () => {
    for (const bad of ['FACE_DOWN', 'owner_only', '', undefined, null, 1]) {
      expect(problemFields(options({ identityVisibility: bad })), String(bad)).toEqual(['identityVisibility']);
    }
    for (const bad of [undefined, null, 5, {}]) expect(problemFields(options({ seedText: bad })), String(bad)).toEqual(['seedText']);
  });

  it('does not examine the seed text: empty text is the controller\'s SEED_EMPTY, not a setup problem', () => {
    expect(validateSetup(options({ seedText: '' })).ok).toBe(true);
    expect(validateSetup(options({ seedText: '   ' })).ok).toBe(true);
  });

  it('never throws for garbage and reports problems for non-objects', () => {
    for (const garbage of [null, undefined, 0, 'x', [], [1, 2], () => 1, Symbol('s'), Number.NaN]) {
      expect(() => validateSetup(garbage), String(garbage)).not.toThrow();
      expect(validateSetup(garbage).ok).toBe(false);
    }
  });

  it('collects several problems at once', () => {
    expect(problemFields(options({ humanCount: 9, identityVisibility: 'x', seedText: 1 }))).toEqual(['seedText', 'humanCount', 'identityVisibility']);
  });
});

describe('sanitizeSetupPrefs', () => {
  it('returns the defaults for garbage and never throws', () => {
    for (const garbage of [null, undefined, [], ['a'], 'x', 7, true, Number.NaN, () => 1, {}, { humanCount: {} }]) {
      expect(() => sanitizeSetupPrefs(garbage)).not.toThrow();
      expect(sanitizeSetupPrefs(garbage), String(garbage)).toEqual(DEFAULT_SETUP_PREFS);
    }
  });

  it('keeps valid fields and falls back field by field', () => {
    expect(sanitizeSetupPrefs({ identityVisibility: 'FACE_UP' })).toEqual(DEFAULT_SETUP_PREFS);
    expect(sanitizeSetupPrefs({ humanCount: 3 })).toEqual({ ...DEFAULT_SETUP_PREFS, humanCount: 3 });
    expect(sanitizeSetupPrefs({ identityVisibility: 'BLIND' })).toEqual({ ...DEFAULT_SETUP_PREFS, identityVisibility: 'BLIND' });
    expect(sanitizeSetupPrefs({ humanCount: 5, identityVisibility: 'BLIND' })).toEqual({ ...DEFAULT_SETUP_PREFS, identityVisibility: 'BLIND' });
    expect(sanitizeSetupPrefs({ humanCount: 2.5 }).humanCount).toBe(1);
    expect(sanitizeSetupPrefs({ humanCount: '2' }).humanCount).toBe(1);
    expect([...sanitizeSetupPrefs({ difficulties: ['ADVANCED', 'EXPERT', 'ADVANCED'] }).difficulties]).toEqual(['ADVANCED', 'BEGINNER', 'ADVANCED', 'BEGINNER']);
    expect([...sanitizeSetupPrefs({ difficulties: 'ADVANCED' }).difficulties]).toEqual(['BEGINNER', 'BEGINNER', 'BEGINNER', 'BEGINNER']);
  });

  it('drops unknown fields (a stored seed or extra data is not carried over) and returns frozen data', () => {
    const result = sanitizeSetupPrefs({ humanCount: 2, seedText: 'secret', extra: 1 });
    expect(Object.keys(result).sort()).toEqual(['difficulties', 'humanCount', 'identityVisibility']);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.difficulties)).toBe(true);
  });

  it('is idempotent and survives a JSON round trip', () => {
    const prefs = sanitizeSetupPrefs({ humanCount: 3, difficulties: ['BEGINNER', 'ADVANCED', 'ADVANCED', 'BEGINNER'], identityVisibility: 'BLIND' });
    expect(sanitizeSetupPrefs(prefs)).toEqual(prefs);
    expect(sanitizeSetupPrefs(JSON.parse(JSON.stringify(prefs)))).toEqual(prefs);
  });

  it('accepts a validated SetupOptions as input (the screen passes its prefs on)', () => {
    const typed: SetupOptions = { ...DEFAULT_SETUP_PREFS, seedText: 'x' };
    expect(sanitizeSetupPrefs(typed)).toEqual(DEFAULT_SETUP_PREFS);
  });
});

describe('source', () => {
  it('imports core/types only and uses no storage, console or global', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'setup-model.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['../core/types']);
    expect(source).not.toMatch(/\b(?:localStorage|sessionStorage|console|globalThis|window|document|Math\s*\.\s*random|Date|crypto)\b/);
  });
});
