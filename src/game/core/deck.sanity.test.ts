// Minimal sanity tests for core/deck.ts (task 3.1). The golden deal and the full deck test suite
// belong to task 3.2 (deck.test.ts, deck.properties.test.ts).

import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from './cards';
import { dealGame, drawTop, isValidSeed, tryDealGame } from './deck';
import { mulberry32, shuffle } from './prng';
import type { CardId, PlayerId } from './types';

const SEATS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];

function allDealt(seed: number): CardId[] {
  const d = dealGame(seed);
  return [...d.neutral, ...SEATS.flatMap((s) => d.hands[s]), ...d.deck];
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe('dealGame', () => {
  it('has the sizes 4 neutral, 4 hands of 4, 32 deck', () => {
    for (const seed of [0, 1, 42, 4294967295]) {
      const d = dealGame(seed);
      expect(d.neutral).toHaveLength(4);
      for (const s of SEATS) expect(d.hands[s]).toHaveLength(4);
      expect(d.deck).toHaveLength(32);
    }
  });

  it('partitions the 52 cards without duplicates', () => {
    for (const seed of [0, 1, 42, 4294967295]) {
      const cards = allDealt(seed);
      expect(cards).toHaveLength(52);
      expect(new Set(cards).size).toBe(52);
      expect([...cards].sort()).toEqual([...ALL_CARDS].sort());
    }
  });

  it('follows the documented slicing of the seeded shuffle', () => {
    const shuffled = shuffle(ALL_CARDS, mulberry32(7));
    const d = dealGame(7);
    expect(d.neutral).toEqual(shuffled.slice(0, 4));
    SEATS.forEach((s, k) => expect(d.hands[s]).toEqual(shuffled.slice(4 + 4 * k, 8 + 4 * k)));
    expect(d.deck).toEqual(shuffled.slice(20));
  });

  it('is deterministic', () => {
    expect(dealGame(123)).toEqual(dealGame(123));
  });
});

describe('tryDealGame', () => {
  it('accepts a uint32 seed and equals dealGame', () => {
    expect(tryDealGame(5)).toEqual({ ok: true, value: dealGame(5) });
  });

  it('rejects invalid seeds with INVALID_CONFIG instead of coercing them', () => {
    for (const bad of [NaN, Infinity, 1.5, -1, 4294967296, '5', null, undefined]) {
      expect(isValidSeed(bad)).toBe(false);
      const r = tryDealGame(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('INVALID_CONFIG');
    }
  });
});

describe('drawTop', () => {
  it('returns the last element and a new deck without it, leaving the input unchanged', () => {
    const deck = deepFreeze<readonly CardId[]>(['H-A', 'D-2', 'S-K']);
    const r = drawTop(deck);
    expect(r.card).toBe('S-K');
    expect(r.deck).toEqual(['H-A', 'D-2']);
    expect(r.deck).not.toBe(deck);
    expect(deck).toEqual(['H-A', 'D-2', 'S-K']);
  });

  it('returns card null and the same deck when the deck is empty', () => {
    const deck = deepFreeze<readonly CardId[]>([]);
    const r = drawTop(deck);
    expect(r.card).toBeNull();
    expect(r.deck).toBe(deck);
  });

  it('draws all 32 cards of a dealt deck from last to first, then null', () => {
    let deck = dealGame(9).deck;
    const original = [...deck];
    const drawn: CardId[] = [];
    for (let i = 0; i < 32; i++) {
      const r = drawTop(deck);
      expect(r.card).not.toBeNull();
      drawn.push(r.card as CardId);
      deck = r.deck;
    }
    expect(drawn).toEqual([...original].reverse());
    expect(drawTop(deck).card).toBeNull();
  });
});
