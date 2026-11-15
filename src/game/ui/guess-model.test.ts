// Tests of the Guess input model (task 18.1). Evidence class: model (pure functions over real `PlayerView`s produced by
// the real controller and engine; no DOM). The stale-form tests need views with 1 and 2 pending codes, so the fixture
// plays real games to the first batch with that many codes.
import { describe, expect, it } from 'vitest';
import { getStrategy } from '../ai/registry';
import { GUESS_MAX as SCORE_MAX, GUESS_MIN as SCORE_MIN } from '../core/score';
import { defaultConfig } from '../core/state';
import type { Action, ErrorCode, GameConfig, PlayerId } from '../core/types';
import type { PlayerView } from '../core/view';
import { errorMessageKey, setLanguage, t, resetLanguage } from '../i18n';
import { createController } from './controller';
import type { Controller, Schedule } from './controller';
import { buildGuesses, GUESS_MAX, GUESS_MIN, guessFormToken, isBlankGuessText, isGuessFormStale, parseGuessText, regionCells } from './guess-model';

// ---------------------------------------------------------------------------------------------------------
// Fixture: real games driven to the first batch with a wanted number of pending codes
// ---------------------------------------------------------------------------------------------------------

const SEAT_IDS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];

class Queue {
  readonly fns: (() => void)[] = [];
  readonly schedule: Schedule = (fn) => {
    this.fns.push(fn);
    return {
      cancel: () => {
        const i = this.fns.indexOf(fn);
        if (i >= 0) this.fns.splice(i, 1);
      },
    };
  };
  step(): boolean {
    const fn = this.fns.shift();
    if (fn === undefined) return false;
    fn();
    return true;
  }
}

interface Game {
  readonly ctl: Controller;
  readonly queue: Queue;
  readonly humans: readonly PlayerId[];
}

function startGame(kinds: readonly ('HUMAN' | 'AI')[], seed: number): Game {
  const queue = new Queue();
  const ctl = createController({ schedule: queue.schedule, renderer: () => undefined, randomSeed: () => seed, language: () => 'en' });
  const seats = kinds.map((kind, i) =>
    kind === 'HUMAN'
      ? { id: SEAT_IDS[i], kind, name: `Human ${i}` }
      : { id: SEAT_IDS[i], kind, difficulty: 'BEGINNER', name: `Bot ${i}` },
  ) as unknown as GameConfig['seats'];
  ctl.startGame({ config: { ...defaultConfig(), seats }, seed });
  const humans = SEAT_IDS.filter((_, i) => kinds[i] === 'HUMAN');
  return { ctl, queue, humans };
}

const viewOf = (g: Game, seat: PlayerId): PlayerView => g.ctl.getView(seat) as PlayerView;

/** Plays until the first GUESS_COLLECT batch with `wanted` pending codes in which nobody has submitted. */
function advanceToBatch(g: Game, wanted: number): boolean {
  for (let i = 0; i < 3000; i++) {
    const view = viewOf(g, g.humans[0] as PlayerId);
    if (view.phase === 'ENDED') return false;
    if (view.phase === 'GUESS_COLLECT') {
      if (view.pendingQuadKeys.length === wanted && SEAT_IDS.every((s) => !view.guessSubmitted[s])) return true;
      for (const seat of g.humans) {
        const v = viewOf(g, seat);
        if (v.guessSubmitted[seat]) continue;
        const guesses = Object.fromEntries(v.pendingQuadKeys.map((k) => [k, 20]));
        g.ctl.dispatchHuman({ type: 'SUBMIT_GUESSES', player: seat, guesses });
      }
      while (g.queue.step()) {
        /* AI Seats submit */
      }
    } else if (view.phase === 'REVEAL') {
      g.ctl.dispatchHuman({ type: 'ACK_REVEAL' });
    } else if (g.humans.includes(view.turn)) {
      const own = viewOf(g, view.turn);
      g.ctl.dispatchHuman(getStrategy('BEGINNER').choosePlacement(own, { decisionSeed: i }) as Action);
    } else if (!g.queue.step()) {
      throw new Error('AI turn without a scheduled step');
    }
  }
  throw new Error('no end');
}

function findBatch(kinds: readonly ('HUMAN' | 'AI')[], wanted: number): Game {
  for (let seed = 1; seed <= 200; seed++) {
    const g = startGame(kinds, seed);
    if (advanceToBatch(g, wanted)) return g;
  }
  throw new Error(`no seed gives a batch with ${wanted} codes`);
}

// ---------------------------------------------------------------------------------------------------------
// parseGuessText
// ---------------------------------------------------------------------------------------------------------

describe('parseGuessText', () => {
  it('uses the range of core/score (no copy of 4 and 52)', () => {
    expect([GUESS_MIN, GUESS_MAX]).toEqual([SCORE_MIN, SCORE_MAX]);
    expect([GUESS_MIN, GUESS_MAX]).toEqual([4, 52]);
  });

  it('accepts the bounds and everything between, with surrounding whitespace and leading zeros', () => {
    for (let n = 4; n <= 52; n++) expect(parseGuessText(String(n))).toEqual({ ok: true, value: n });
    expect(parseGuessText(' 4 ')).toEqual({ ok: true, value: 4 });
    expect(parseGuessText('\t52\n')).toEqual({ ok: true, value: 52 });
    expect(parseGuessText('007')).toEqual({ ok: true, value: 7 });
  });

  it('rejects out-of-range integers with GUESS_OUT_OF_RANGE', () => {
    for (const text of ['3', '53', '0', '-0', '-3', '-52', '100', '99999999999999999999', '-99999999999999999999']) {
      const r = parseGuessText(text);
      expect(r.ok, text).toBe(false);
      if (!r.ok) expect(r.error.code, text).toBe('GUESS_OUT_OF_RANGE');
    }
  });

  it('rejects blank and malformed text with GUESS_NOT_INTEGER', () => {
    const bad = [
      '', ' ', '   ', '\t', '4.0', '4.5', '.5', '1e1', '1E1', '0x10', '+', '+5', '-', '--3', '3-', '1 2', '4,0', 'NaN', 'Infinity',
      '-Infinity', 'abc', '12a', '٤', '４', '²', '1_0',
      '9'.repeat(400), // overflows to Infinity
    ];
    for (const text of bad) {
      const r = parseGuessText(text);
      expect(r.ok, JSON.stringify(text)).toBe(false);
      if (!r.ok) expect(r.error.code, JSON.stringify(text)).toBe('GUESS_NOT_INTEGER');
    }
  });

  it('treats a non-string (an unchecked caller) as not an integer', () => {
    for (const value of [undefined, null, 5, {}] as unknown[]) {
      const r = parseGuessText(value as string);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('GUESS_NOT_INTEGER');
    }
  });

  it('every code it can return has an existing localized message in both languages', () => {
    const codes: ErrorCode[] = ['GUESS_NOT_INTEGER', 'GUESS_OUT_OF_RANGE'];
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      for (const code of codes) {
        const key = errorMessageKey(code);
        expect(t(key), `${lang} ${code}`).not.toBe(key);
      }
    }
    resetLanguage();
  });

  it('isBlankGuessText', () => {
    expect([isBlankGuessText(''), isBlankGuessText(' \t\n'), isBlankGuessText(undefined), isBlankGuessText(null)]).toEqual([true, true, true, true]);
    expect([isBlankGuessText('0'), isBlankGuessText(' x ')]).toEqual([false, false]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// buildGuesses
// ---------------------------------------------------------------------------------------------------------

describe('buildGuesses', () => {
  it('builds exactly the key set, for one code and for two codes', () => {
    expect(buildGuesses(['D4'], { D4: '4' })).toEqual({ ok: true, guesses: { D4: 4 } });
    expect(buildGuesses(['B2', 'D4'], { B2: ' 52 ', D4: '30' })).toEqual({ ok: true, guesses: { B2: 52, D4: 30 } });
  });

  it('ignores texts of keys that are not requested', () => {
    const r = buildGuesses(['D4'], { D4: '9', E5: 'junk', Z9: '1' });
    expect(r).toEqual({ ok: true, guesses: { D4: 9 } });
  });

  it('reports every invalid key at once and builds nothing', () => {
    const r = buildGuesses(['A1', 'B2', 'C3', 'D4'], { A1: '3', B2: '4.0', C3: '10', D4: '' });
    expect(r).toEqual({
      ok: false,
      errors: { A1: 'GUESS_OUT_OF_RANGE', B2: 'GUESS_NOT_INTEGER', D4: 'GUESS_NOT_INTEGER' },
      missing: ['D4'],
    });
    expect('guesses' in r).toBe(false);
  });

  it('reports a missing key (absent, blank, spaces only) as missing, never as a number', () => {
    const r = buildGuesses(['A1', 'B2', 'C3'], { A1: '', B2: '   ' });
    expect(r).toEqual({
      ok: false,
      errors: { A1: 'GUESS_NOT_INTEGER', B2: 'GUESS_NOT_INTEGER', C3: 'GUESS_NOT_INTEGER' },
      missing: ['A1', 'B2', 'C3'],
    });
  });

  it('does not read inherited properties as texts', () => {
    const r = buildGuesses(['constructor'], {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(['constructor']);
  });

  it('an empty key set is not submittable', () => {
    expect(buildGuesses([], {}).ok).toBe(false);
  });

  it('returns frozen results and does not change its inputs', () => {
    const texts = Object.freeze({ A1: '5' });
    const keys = Object.freeze(['A1']);
    const ok = buildGuesses(keys, texts);
    expect(Object.isFrozen(ok)).toBe(true);
    if (ok.ok) expect(Object.isFrozen(ok.guesses)).toBe(true);
    const bad = buildGuesses(keys, { A1: 'x' });
    expect(Object.isFrozen(bad)).toBe(true);
    if (!bad.ok) {
      expect(Object.isFrozen(bad.errors)).toBe(true);
      expect(Object.isFrozen(bad.missing)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// regionCells
// ---------------------------------------------------------------------------------------------------------

describe('regionCells', () => {
  it('names the four cells of the 2x2 region of a Quad_Key', () => {
    expect(regionCells('D4')).toEqual(['D4', 'E4', 'D5', 'E5']);
    expect(regionCells('A1')).toEqual(['A1', 'B1', 'A2', 'B2']);
    expect(regionCells('G7')).toEqual(['G7', 'H7', 'G8', 'H8']);
  });
  it('gives nothing for a malformed key or a region that leaves the board', () => {
    for (const key of ['', 'H1', 'A8', 'H8', 'Z9', 'a1', 'D44', 'D']) expect(regionCells(key), key).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Stale form (real views)
// ---------------------------------------------------------------------------------------------------------

describe('guessFormToken and isGuessFormStale on real views', () => {
  for (const wanted of [1, 2]) {
    describe(`a batch with ${wanted} pending code(s), one person and three AI Seats`, () => {
      const g = findBatch(['HUMAN', 'AI', 'AI', 'AI'], wanted);
      const view = viewOf(g, 'P0');
      const count = g.ctl.getModel().actionCount;

      it('captures viewer, phase, keys and actionCount, frozen, public data only', () => {
        const token = guessFormToken(view, count);
        expect(token).toMatchObject({ viewer: 'P0', phase: 'GUESS_COLLECT', actionCount: count, keys: view.pendingQuadKeys });
        expect(token.keys).toHaveLength(wanted);
        expect(Object.isFrozen(token)).toBe(true);
        expect(Object.isFrozen(token.keys)).toBe(true);
        expect(isGuessFormStale(token, view, count)).toBeNull();
      });

      it('is stale for another viewer, another phase, another key set and another actionCount', () => {
        const token = guessFormToken(view, count);
        expect(isGuessFormStale(token, null, count)).toBe('NO_VIEW');
        expect(isGuessFormStale(token, { ...view, viewer: 'P1' }, count)).toBe('VIEWER');
        expect(isGuessFormStale(token, { ...view, phase: 'REVEAL' }, count)).toBe('PHASE');
        expect(isGuessFormStale(token, { ...view, phase: 'PLACEMENT' }, count)).toBe('PHASE');
        expect(isGuessFormStale(token, { ...view, pendingQuadKeys: [...view.pendingQuadKeys, 'A1'] }, count)).toBe('BATCH');
        expect(isGuessFormStale(token, { ...view, pendingQuadKeys: [] }, count)).toBe('BATCH');
        expect(isGuessFormStale(token, view, count + 1)).toBe('ACTION_COUNT');
        expect(isGuessFormStale(token, view, count - 1)).toBe('ACTION_COUNT');
      });

      it('is stale after the viewer submitted (guessSubmitted and myGuesses)', () => {
        const token = guessFormToken(view, count);
        expect(isGuessFormStale(token, { ...view, guessSubmitted: { ...view.guessSubmitted, P0: true } }, count + 1)).toBe('SUBMITTED');
        // `myGuesses` alone (a view that says the viewer submitted) closes the form too
        expect(isGuessFormStale(token, { ...view, myGuesses: {} }, count)).toBe('SUBMITTED');
      });
    });
  }

  it('an AI Seat that submits while a person types does not make the form stale (actionCount minus submitted Seats)', () => {
    const g = findBatch(['HUMAN', 'AI', 'AI', 'AI'], 1);
    const before = viewOf(g, 'P0');
    const token = guessFormToken(before, g.ctl.getModel().actionCount);
    expect(before.guessSubmitted).toEqual({ P0: false, P1: false, P2: false, P3: false });
    expect(g.queue.step()).toBe(true); // the AI Seats of the batch submit in one scheduled step
    const after = viewOf(g, 'P0');
    expect(after.phase).toBe('GUESS_COLLECT');
    expect(after.guessSubmitted).toEqual({ P0: false, P1: true, P2: true, P3: true });
    expect(g.ctl.getModel().actionCount).toBe(token.actionCount + 3);
    expect(isGuessFormStale(token, after, g.ctl.getModel().actionCount)).toBeNull();
  });

  it('the viewer\'s own accepted submission makes the form stale as SUBMITTED, not as ACTION_COUNT', () => {
    const g = findBatch(['HUMAN', 'AI', 'AI', 'AI'], 2);
    const view = viewOf(g, 'P0');
    const token = guessFormToken(view, g.ctl.getModel().actionCount);
    const guesses = Object.fromEntries(view.pendingQuadKeys.map((k) => [k, 12]));
    expect(g.ctl.dispatchHuman({ type: 'SUBMIT_GUESSES', player: 'P0', guesses })).toEqual({ ok: true });
    const after = viewOf(g, 'P0');
    expect(after.phase).toBe('GUESS_COLLECT');
    expect(isGuessFormStale(token, after, g.ctl.getModel().actionCount)).toBe('SUBMITTED');
  });

  it('two human Seats: the view of the other human Seat is stale for this form (VIEWER)', () => {
    const g = findBatch(['HUMAN', 'HUMAN', 'AI', 'AI'], 1);
    const token = guessFormToken(viewOf(g, 'P0'), g.ctl.getModel().actionCount);
    expect(isGuessFormStale(token, viewOf(g, 'P1'), g.ctl.getModel().actionCount)).toBe('VIEWER');
  });
});
