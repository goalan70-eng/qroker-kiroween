/**
 * Draw rule of the QRoker game engine (task 7.1).
 *
 * A placement draws one card when it completes no new eligible Composite_Code.
 * Completing one or more new codes suppresses the draw. This applies to every placement,
 * including each player's first placement.
 *
 * Pure module: no DOM, node, randomness, clock, deck, hand or Guess access.
 */
import { drawTop } from './deck';
import type { CardId } from './types';

/** Zero new codes means draw; one or more new codes means no draw. */
export function shouldDraw(newCodes: number): boolean {
  if (!Number.isInteger(newCodes) || newCodes < 0) {
    throw new RangeError(`shouldDraw: newCodes must be a non-negative integer, got ${String(newCodes)}`);
  }
  return newCodes === 0;
}

export interface DrawResult {
  readonly hand: readonly CardId[];
  readonly deck: readonly CardId[];
  readonly drawn: CardId | null;
}

/**
 * Apply the draw verdict. If the deck is empty, skip the required draw without manufacturing a card.
 * Inputs are not mutated; returned arrays and the result are frozen.
 */
export function applyDraw(deck: readonly CardId[], hand: readonly CardId[], draw: boolean): DrawResult {
  if (!draw) return freezeResult(hand.slice(), deck.slice(), null);
  const top = drawTop(deck);
  if (top.card === null) return freezeResult(hand.slice(), deck.slice(), null);
  return freezeResult([...hand, top.card], top.deck.slice(), top.card);
}

function freezeResult(hand: CardId[], deck: CardId[], drawn: CardId | null): DrawResult {
  return Object.freeze({ hand: Object.freeze(hand), deck: Object.freeze(deck), drawn });
}
