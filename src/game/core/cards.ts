/**
 * Card catalog of the QRoker game engine.
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "Cards, PRNG and Seed".
 * Requirements: 1.1 to 1.4 and 1.6 (catalog, CardId, Card_Value, parsing, canonical order),
 * 5.3 (Hidden_Sum), 5.4 (Group_Id).
 *
 * Pure module: no DOM, no node, no randomness, no clock, no import from `src/optical`.
 * The canonical order is suit-major (H, D, C, S), then rank A to K. It must not change
 * without a rules-version increment (requirement 1.6).
 */

import type { CardId, Rank, Result, Suit } from './types';

export const SUITS: readonly Suit[] = ['H', 'D', 'C', 'S'];

export const RANKS: readonly Rank[] = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
];

/** The 52 cards in canonical order: suit-major (H, D, C, S), rank A..K. */
export const ALL_CARDS: readonly CardId[] = SUITS.flatMap((suit) =>
  RANKS.map((rank): CardId => `${suit}-${rank}`),
);

const CARD_ID_SET: ReadonlySet<string> = new Set<string>(ALL_CARDS);

const CARD_VALUES: Readonly<Record<Rank, number>> = {
  A: 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
};

/**
 * Accepts a string if and only if it equals one of the 52 CardIds exactly
 * (case-sensitive, no surrounding whitespace, no leading zeros).
 * Anything else, including non-string values passed through an untyped boundary,
 * returns `INVALID_CARD_ID`.
 */
export function parseCardId(s: string): Result<CardId> {
  if (typeof s === 'string' && CARD_ID_SET.has(s)) {
    return { ok: true, value: s as CardId };
  }
  return {
    ok: false,
    error: {
      code: 'INVALID_CARD_ID',
      detail: typeof s === 'string' ? s : `non-string value (${typeof s})`,
    },
  };
}

export function suitOf(card: CardId): Suit {
  return card.slice(0, card.indexOf('-')) as Suit;
}

export function rankOf(card: CardId): Rank {
  return card.slice(card.indexOf('-') + 1) as Rank;
}

/** A=1, 2 to 10 = face value, J=11, Q=12, K=13. */
export function cardValue(card: CardId): number {
  return CARD_VALUES[rankOf(card)];
}

/** Sum of the 4 Card_Values of a Composite_Code, an integer from 4 to 52. */
export function hiddenSum(cards: readonly [CardId, CardId, CardId, CardId]): number {
  return cardValue(cards[0]) + cardValue(cards[1]) + cardValue(cards[2]) + cardValue(cards[3]);
}

/**
 * Sorted CardIds joined by '|'. Sealed for engine use only: it reveals the Hidden_Sum,
 * so it must never appear in a public structure (design D7). Does not mutate its input.
 */
export function groupIdOf(cards: readonly CardId[]): string {
  return [...cards].sort().join('|');
}
