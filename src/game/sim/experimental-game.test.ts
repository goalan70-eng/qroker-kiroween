import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../core/cards';
import { HAND_SIZE } from '../core/deck';
import { defaultConfig } from '../core/state';
import { reduce } from '../core/engine';
import { viewFor } from '../core/view';
import { SEATS } from '../core/turn';
import type { Difficulty, PlayerId } from '../core/types';
import { playGame, strategiesFor, checkStateInvariants, ActionLimitError, decisionSeed } from './play-game';
import {
  experimentalInitialState, runExperimentalGame,
  validateExperimentalCodeLimit, validateExperimentalHandSize,
} from './experimental-game';

const beginner = strategiesFor({ P0: 'BEGINNER', P1: 'BEGINNER', P2: 'BEGINNER', P3: 'BEGINNER' });
const advanced = strategiesFor({ P0: 'ADVANCED', P1: 'ADVANCED', P2: 'ADVANCED', P3: 'ADVANCED' });
const mixed = strategiesFor({ P0: 'ADVANCED', P1: 'BEGINNER', P2: 'ADVANCED', P3: 'BEGINNER' });
const config = defaultConfig();

function assertScoreAccounting(result: ReturnType<typeof runExperimentalGame>): void {
  const { snapshot, scores, bonusSeat } = result;
  for (const seat of SEATS) {
    const prediction = snapshot.history.reduce((sum, record) => {
      const entry = record.perPlayer.find((p) => p.player === seat);
      if (entry === undefined) throw Error('missing seat in score record');
      return sum + entry.earned;
    }, 0);
    expect(scores[seat]).toBe(prediction + (bonusSeat === seat ? config.scoreConfig.config.handEmptyBonus : 0));
    expect(result.ranks[seat]).toBe(1 + SEATS.filter((other) => scores[other] > scores[seat]).length);
  }
}

describe('experimental hand partition and input validation', () => {
  it('preserves the official four-card initial deal byte-for-byte', () => {
    for (const seed of [0, 1, 7, 123456]) {
      const a = experimentalInitialState(seed, config, HAND_SIZE);
      const b = experimentalInitialState(seed, config);
      expect(a).toEqual(b);
      checkStateInvariants(a);
      for (const seat of SEATS) expect(a.hands[seat]).toHaveLength(4);
      expect(a.deck).toHaveLength(32);
    }
  });

  it.each([1, 2, 3, 4])('deals %i cards per seat without losing or duplicating cards', (handSize) => {
    const start = experimentalInitialState(73, config, handSize);
    const cards = [
      ...start.board.flatMap((c) => c === null ? [] : [c.card]),
      ...SEATS.flatMap((seat) => start.hands[seat]),
      ...start.deck,
    ];
    expect(cards).toHaveLength(52);
    expect(new Set(cards).size).toBe(52);
    expect(new Set(cards)).toEqual(new Set(ALL_CARDS));
    expect(start.deck).toHaveLength(48 - 4 * handSize);
    expect(start.history).toHaveLength(0);
    expect(start.scoredGroups).toHaveLength(0);
    expect(start.phase).toBe('PLACEMENT');
    for (const seat of SEATS) expect(start.hands[seat]).toHaveLength(handSize);
    checkStateInvariants(start);
  });

  it('rejects invalid hand counts, code limits, action limits and seeds', () => {
    for (const value of [0, -1, 5, 1.1, Number.NaN, Infinity]) {
      expect(() => validateExperimentalHandSize(value)).toThrow(RangeError);
    }
    for (const value of [0, -1, 49, 1.1, Number.NaN, Infinity]) {
      expect(() => validateExperimentalCodeLimit(value)).toThrow(RangeError);
    }
    expect(validateExperimentalCodeLimit(null)).toBeNull();
    expect(validateExperimentalCodeLimit(5)).toBe(5);
    expect(() => experimentalInitialState(-1, config, 3)).toThrow(RangeError);
    expect(() => runExperimentalGame({ seed: 1, config, strategies: beginner, maxActions: 0 })).toThrow(RangeError);
    expect(() => runExperimentalGame({ seed: 1, config, strategies: beginner, maxActions: 1 })).toThrow(ActionLimitError);
  });
});

describe('experimental driver preserves published rule behavior', () => {
  it('matches the official playGame state and action log when hand=4 and codes=none', { timeout: 25000 }, () => {
    for (const [seed, strategies] of [[1, beginner], [7, advanced], [16, mixed]] as const) {
      const original = playGame({ seed, config, strategies, checkInvariants: true });
      const experiment = runExperimentalGame({ seed, config, strategies, handSize: 4, codeLimit: null });
      expect(experiment.snapshot).toEqual(original.final);
      expect(experiment.actions).toEqual(original.log);
      expect(experiment.stopReason).toBe('HAND_EMPTY');
      expect(experiment.bonusSeat).toBe(original.final.bonusAwarded);
      assertScoreAccounting(experiment);
    }
  });

  it('a first no-code placement with one card draws from a non-empty deck instead of ending', () => {
    let checked = false;
    for (let seed = 0; seed < 40 && !checked; seed++) {
      const start = experimentalInitialState(seed, config, 1);
      const action = beginner.P0.choosePlacement(viewFor(start, 'P0'), {
        decisionSeed: decisionSeed(start.seed, 'P0', start.log.length),
      });
      const next = reduce(start, action);
      expect(next.ok).toBe(true);
      if (!next.ok || next.value.phase !== 'PLACEMENT') continue;
      expect(next.value.hands.P0).toHaveLength(1);
      expect(next.value.deck).toHaveLength(start.deck.length - 1);
      expect(next.value.bonusAwarded).toBeNull();
      checkStateInvariants(next.value);
      checked = true;
    }
    expect(checked, 'a deterministic seed should produce a first no-code placement').toBe(true);
  });

  it('stops only AFTER four guesses, records every code in the last batch, and does not invent an end bonus', { timeout: 25000 }, () => {
    let limited: ReturnType<typeof runExperimentalGame> | null = null;
    for (let seed = 0; seed < 12; seed++) {
      const result = runExperimentalGame({ seed, config, strategies: advanced, handSize: 4, codeLimit: 1 });
      if (result.stopReason === 'CODE_LIMIT') {
        limited = result;
        break;
      }
    }
    expect(limited, 'an advanced seed should reach a code before emptying a hand').not.toBeNull();
    const result = limited!;
    expect(result.snapshot.phase).toBe('REVEAL');
    expect(result.snapshot.pending).toBeNull();
    expect(result.bonusSeat).toBeNull();
    expect(result.completedCodes).toBeGreaterThanOrEqual(1);
    expect(result.completedCodes).toBe(result.snapshot.history.reduce((n, batch) => n + batch.codes.length, 0));
    const tail = result.actions.slice(-4);
    expect(tail.map((a) => a.type)).toEqual(Array(4).fill('SUBMIT_GUESSES'));
    expect(tail.filter((a) => a.type === 'SUBMIT_GUESSES').map((a) => (a as { player: PlayerId }).player)).toEqual([...SEATS]);
    checkStateInvariants(result.snapshot);
    assertScoreAccounting(result);
  });

  it('runs the proposed 3-card / 5-code scenario without changing official rules', { timeout: 25000 }, () => {
    for (const seed of [0, 1, 3, 7]) {
      const options = { seed, config, strategies: mixed, handSize: 3, codeLimit: 5 };
      const result = runExperimentalGame(options);
      const repeated = runExperimentalGame(options);
      expect(result.stopReason).toBe(repeated.stopReason);
      expect(result.snapshot).toEqual(repeated.snapshot);
      expect(result.actions).toEqual(repeated.actions);
      expect(result.placements).toBeLessThanOrEqual(48);
      expect(result.completedCodes).toBe(result.snapshot.history.reduce((n, record) => n + record.codes.length, 0));
      if (result.stopReason === 'CODE_LIMIT') {
        expect(result.completedCodes).toBeGreaterThanOrEqual(5);
        expect(result.snapshot.phase).toBe('REVEAL');
        expect(result.bonusSeat).toBeNull();
      } else {
        expect(result.snapshot.phase).toBe('ENDED');
        expect(result.bonusSeat).not.toBeNull();
      }
      assertScoreAccounting(result);
    }
  });
});
