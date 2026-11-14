/**
 * Draw rule of the QRoker game engine (task 7.1).
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "DrawManager and TurnManager (`core/draw.ts`,
 * `core/turn.ts`)" and the PLACE step 6 of the reducer. Requirements 6.3, 6.4, 6.5, 6.6; qroker-game
 * Requirements 3.5 (the first placement of each seat is exempt), 3.6 (no draw after a new code) and 3.8
 * (empty deck: skip the draw).
 *
 * Pure module: no DOM, no node, no randomness, no clock, no import from `src/optical`. `shouldDraw` takes
 * only a seat id, the list of seats that have placed, and a count. It reads no deck, hand or guess.
 *
 * Reducer-level behaviour (Property 12, task 8.3) is NOT tested or decided here. This module owns the draw
 * decision and two tiny helpers that task 8 calls in PLACE step 6.
 */

import { drawTop } from './deck';
import { SEATS, isPlayerId } from './turn';
import type { CardId, PlayerId } from './types';

/**
 * True if a placement by `player` obliges that seat to draw one card: the seat has already made its first
 * placement (`firstPlacementDone` contains it) AND the placement completed no new Composite_Code
 * (`newCodes === 0`).
 *
 * The first placement of each seat is exempt whatever `newCodes` is (requirement 6.4), and any new code
 * cancels the draw (requirement 6.5). A single placement draws at most one card, so the result is a boolean.
 *
 * `firstPlacementDone` is the state before this placement; the reducer adds `player` to it afterwards
 * (see `markFirstPlacement`). The list is not mutated.
 *
 * `newCodes` is the number of newly completed eligible codes, `codes.length` in the reducer. The design
 * defines the result as "false if newCodes >= 1, true otherwise", which for NaN, a negative number or a
 * fraction would answer `true` and draw a card. Those values are not counts, so this function throws a
 * `RangeError` for them (and for a `player` that is not a seat id) instead of returning a verdict. The
 * reducer never passes such values.
 */
export function shouldDraw(player: PlayerId, firstPlacementDone: readonly PlayerId[], newCodes: number): boolean {
  if (!isPlayerId(player)) {
    throw new RangeError(`shouldDraw: not a seat id: ${String(player)}`);
  }
  if (!Number.isInteger(newCodes) || newCodes < 0) {
    throw new RangeError(`shouldDraw: newCodes must be a non-negative integer, got ${String(newCodes)}`);
  }
  return firstPlacementDone.includes(player) && newCodes === 0;
}

/**
 * Helper for task 8 (PLACE step 6, "add `player` to `firstPlacementDone`"). Returns a NEW frozen list that
 * holds the seats of `firstPlacementDone` and `player`, without duplicates, in seat order P0..P3. The input
 * is not mutated. Seat order is also the order in which seats make their first placement, because turns
 * go P0, P1, P2, P3.
 */
export function markFirstPlacement(firstPlacementDone: readonly PlayerId[], player: PlayerId): readonly PlayerId[] {
  if (!isPlayerId(player)) {
    throw new RangeError(`markFirstPlacement: not a seat id: ${String(player)}`);
  }
  return Object.freeze(SEATS.filter((seat) => seat === player || firstPlacementDone.includes(seat)));
}

/** Result of `applyDraw`: new frozen `hand` and `deck`, and the card that moved (`null` if none moved). */
export interface DrawResult {
  readonly hand: readonly CardId[];
  readonly deck: readonly CardId[];
  readonly drawn: CardId | null;
}

/**
 * Helper for task 8 (PLACE step 6, "if `draw`, `drawTop` and append to the Hand when a card exists").
 * `draw` is the verdict of `shouldDraw`.
 *
 * - `draw` false: nothing moves.
 * - `draw` true and the deck is not empty: the top card of the deck (its LAST element, via `drawTop`)
 *   is appended to the END of the hand and removed from the deck. `drawn` is that card.
 * - `draw` true and the deck is empty: the draw is skipped (requirement 6.6). No card is made up; hand and
 *   deck are unchanged and `drawn` is `null`.
 *
 * At most one card moves. The inputs are not mutated; `hand` and `deck` of the result are new frozen arrays,
 * and together they hold the same cards as the inputs together.
 */
export function applyDraw(deck: readonly CardId[], hand: readonly CardId[], draw: boolean): DrawResult {
  if (!draw) {
    return freezeResult(hand.slice(), deck.slice(), null);
  }
  const top = drawTop(deck);
  if (top.card === null) {
    return freezeResult(hand.slice(), deck.slice(), null);
  }
  return freezeResult([...hand, top.card], top.deck.slice(), top.card);
}

function freezeResult(hand: CardId[], deck: CardId[], drawn: CardId | null): DrawResult {
  return Object.freeze({ hand: Object.freeze(hand), deck: Object.freeze(deck), drawn });
}
