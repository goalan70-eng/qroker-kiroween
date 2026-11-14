/**
 * Deck and dealing of the QRoker game engine (task 3.1).
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "Deck (`core/deck.ts`)" and "DrawManager".
 * Requirements: 2.2 and 2.3 (seeded shuffle, 4 neutral + 4x4 hand cards + 32 deck cards, partition of
 * the catalog), 6.6 (a draw on an empty deck is skipped). qroker-game Requirement 3.
 *
 * Pure module: no DOM, no node, no randomness except the seeded generator, no clock, no import from
 * `src/optical`. Every function returns new arrays and never mutates its input.
 *
 * Deal procedure (frozen by the golden test of task 3.2; changing it changes every game):
 *   shuffled = shuffle(ALL_CARDS, mulberry32(seed))      // ALL_CARDS in canonical order
 *   neutral  = shuffled[0..3]                            // placed later on D4, E4, D5, E5 in this order
 *   hands[Pk] = shuffled[4+4k .. 7+4k], k = 0..3         // P0..P3, stored in DEAL ORDER (not sorted)
 *   deck     = shuffled[20..51]                          // 32 cards, TOP = LAST element
 *
 * The Hand is stored in deal order, as the design states ("4 cards each, in deal order"). The
 * canonical (sorted) order is applied only by the ViewProjector (task 9.1) when it builds a view.
 *
 * Scope: this module only partitions the cards. It does not decide the orientation of the neutral
 * cards (OQ-2, task 8.1), the visibility of any card, or scoring. Provisional policy for the starting
 * 2x2 group: it is never scored because no placement forms it (OQ-3 and requirement 4.7). That policy
 * is NOT implemented here; it belongs to the composite code detector.
 */

import { ALL_CARDS } from './cards';
import { mulberry32, shuffle } from './prng';
import { MAX_SEED } from './seed';
import type { CardId, PlayerId, Result } from './types';

/** Result of the initial deal. Matches design.md (`Deal`). */
export interface Deal {
  /** D4, E4, D5, E5 in this order. */
  readonly neutral: readonly [CardId, CardId, CardId, CardId];
  /** 4 cards each, in deal order. */
  readonly hands: Readonly<Record<PlayerId, readonly CardId[]>>;
  /** 32 cards, top = last element. */
  readonly deck: readonly CardId[];
}

/** Number of neutral cards on the board at the start. */
export const NEUTRAL_COUNT = 4;
/** Number of cards in each starting Hand. */
export const HAND_SIZE = 4;
/** Number of cards in the deck after the deal (52 - 4 - 4 * 4). */
export const DECK_SIZE_AFTER_DEAL = 32;

const SEATS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];

/**
 * Deals a game from a Seed. Total function: it cannot fail and returns a plain value, as in the design.
 *
 * `seed` must be an unsigned 32-bit integer, as returned by `parseSeed`. This function does not
 * validate it: like `mulberry32` it maps any other number with `seed >>> 0`. Callers that receive a
 * seed from outside the engine (UI, saved games, untyped input) must use `tryDealGame`, which
 * rejects invalid seeds instead of coercing them.
 */
export function dealGame(seed: number): Deal {
  const shuffled = shuffle(ALL_CARDS, mulberry32(seed));
  const neutral = [shuffled[0], shuffled[1], shuffled[2], shuffled[3]] as [CardId, CardId, CardId, CardId];
  const start = NEUTRAL_COUNT;
  const hands = {} as Record<PlayerId, readonly CardId[]>;
  SEATS.forEach((seat, k) => {
    const from = start + HAND_SIZE * k;
    hands[seat] = shuffled.slice(from, from + HAND_SIZE);
  });
  const deck = shuffled.slice(start + HAND_SIZE * SEATS.length);
  return { neutral, hands, deck };
}

/**
 * True if `seed` is a valid Seed: a number that is an integer in 0..4294967295 (a `parseSeed` result).
 * NaN, Infinity, fractions, negative numbers, values above 2^32 - 1 and non-numbers are invalid.
 */
export function isValidSeed(seed: unknown): seed is number {
  return typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= MAX_SEED;
}

/**
 * Validating variant of `dealGame` for seeds from outside the engine. An invalid seed returns
 * `{ ok: false, error: { code: 'INVALID_CONFIG', detail } }` and is never coerced.
 *
 * Error code: the closed ErrorCode union of design.md has no dedicated invalid-seed code
 * (`SEED_EMPTY` covers only empty seed text, in `parseSeed`). `INVALID_CONFIG` ("seats or options
 * invalid, no game created") is the closest existing code: a seed is a game option. Adding a
 * dedicated code would need a design change.
 */
export function tryDealGame(seed: unknown): Result<Deal> {
  if (!isValidSeed(seed)) {
    const shown = typeof seed === 'number' ? String(seed) : `non-number value (${typeof seed})`;
    return { ok: false, error: { code: 'INVALID_CONFIG', detail: `invalid seed: ${shown}` } };
  }
  return { ok: true, value: dealGame(seed) };
}

/**
 * Draws the top card, which is the LAST element of `deck`. Returns the card and a NEW deck without it;
 * `deck` is not mutated.
 *
 * On an empty deck it returns `card: null` and the SAME deck (same reference). No card is made up and
 * nothing is thrown; the reducer then leaves the Hand unchanged (requirement 6.6, qroker-game 3.8).
 */
export function drawTop(deck: readonly CardId[]): { card: CardId | null; deck: readonly CardId[] } {
  if (deck.length === 0) {
    return { card: null, deck };
  }
  return { card: deck[deck.length - 1] as CardId, deck: deck.slice(0, -1) };
}
