import { describe, expect, it } from 'vitest';
import {
  ALL_CARDS,
  RANKS,
  SUITS,
  cardValue,
  groupIdOf,
  hiddenSum,
  parseCardId,
  rankOf,
  suitOf,
} from './cards';
import type { CardId, Rank } from './types';

describe('card catalog', () => {
  it('has 52 distinct cards in canonical order (suit-major H, D, C, S; rank A..K)', () => {
    expect(SUITS).toEqual(['H', 'D', 'C', 'S']);
    expect(RANKS).toEqual(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
    expect(ALL_CARDS).toEqual([
      'H-A', 'H-2', 'H-3', 'H-4', 'H-5', 'H-6', 'H-7', 'H-8', 'H-9', 'H-10', 'H-J', 'H-Q', 'H-K',
      'D-A', 'D-2', 'D-3', 'D-4', 'D-5', 'D-6', 'D-7', 'D-8', 'D-9', 'D-10', 'D-J', 'D-Q', 'D-K',
      'C-A', 'C-2', 'C-3', 'C-4', 'C-5', 'C-6', 'C-7', 'C-8', 'C-9', 'C-10', 'C-J', 'C-Q', 'C-K',
      'S-A', 'S-2', 'S-3', 'S-4', 'S-5', 'S-6', 'S-7', 'S-8', 'S-9', 'S-10', 'S-J', 'S-Q', 'S-K',
    ]);
    expect(new Set(ALL_CARDS).size).toBe(52);
  });

  it('maps the 13 ranks to A=1, 2-10 face value, J=11, Q=12, K=13 in every suit', () => {
    const expected: Record<Rank, number> = {
      A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
      '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
    };
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        expect(cardValue(`${suit}-${rank}`)).toBe(expected[rank]);
      }
    }
  });

  it('suitOf and rankOf invert the CardId form, including the two-character rank 10', () => {
    expect(suitOf('S-10')).toBe('S');
    expect(rankOf('S-10')).toBe('10');
    for (const card of ALL_CARDS) {
      expect(`${suitOf(card)}-${rankOf(card)}`).toBe(card);
    }
  });
});

describe('parseCardId', () => {
  it('accepts all 52 CardIds and returns the same string', () => {
    for (const card of ALL_CARDS) {
      expect(parseCardId(card)).toEqual({ ok: true, value: card });
    }
  });

  it('rejects everything else with INVALID_CARD_ID', () => {
    const rejected: unknown[] = [
      '', ' ', 'H-1', 'H-14', 'H-0', 'X-7', 'h-7', 'H-a', 'H-j', 'H-07', 'H-7 ', ' H-7',
      'H 7', 'H7', 'H_7', 'H-', '-7', 'H-7-', 'HH-7', 'JOKER', 'Joker', 'H-10 ', 'H-A\n',
      '♥-7', 'constructor', '__proto__',
      undefined, null, 7, {}, [], ['H-7'],
    ];
    for (const value of rejected) {
      const result = parseCardId(value as string);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('INVALID_CARD_ID');
    }
  });
});

describe('hiddenSum', () => {
  it('is 4 for the four aces and 52 for the four kings (boundary sums)', () => {
    expect(hiddenSum(['H-A', 'D-A', 'C-A', 'S-A'])).toBe(4);
    expect(hiddenSum(['H-K', 'D-K', 'C-K', 'S-K'])).toBe(52);
  });

  it('does not depend on the order of the cards', () => {
    expect(hiddenSum(['H-10', 'D-J', 'C-2', 'S-Q'])).toBe(35);
    expect(hiddenSum(['S-Q', 'C-2', 'D-J', 'H-10'])).toBe(35);
  });
});

describe('groupIdOf', () => {
  it('joins the sorted CardIds with "|" regardless of input order', () => {
    const a = groupIdOf(['S-Q', 'C-2', 'D-J', 'H-10']);
    const b = groupIdOf(['H-10', 'D-J', 'S-Q', 'C-2']);
    expect(a).toBe('C-2|D-J|H-10|S-Q');
    expect(b).toBe(a);
  });

  it('does not mutate its input', () => {
    const cards: readonly CardId[] = Object.freeze(['S-Q', 'C-2', 'D-J', 'H-10'] as CardId[]);
    expect(() => groupIdOf(cards)).not.toThrow();
    expect(cards).toEqual(['S-Q', 'C-2', 'D-J', 'H-10']);
  });
});
