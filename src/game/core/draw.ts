/**
 * Draw rule of the QRoker game engine.
 *
 * A successful placement draws exactly one card when it completes no new Composite_Code.
 * There is no first-placement or first-round exemption. A placement that completes one or
 * more new codes never draws. An empty deck simply skips a required draw.
 *
 * Pure module: no DOM, no node, no randomness, no clock, no import from src/optical.
 */
import { drawTop } from './deck';
import type { CardId } from './types';

/**
 * True when a placement formed no new eligible Composite_Code.
 * The reducer calls this with codes.length, so every seat and every placement uses the same rule.
 */
export function shouldDraw(newCodes: number): boolean {
  if (!Number.isInteger(newCodes) || newCodes < 0) {
    throw new RangeError('shouldDraw: newCodes must be a non-negative integer, got ' + String(newCodes));
  }
  return newCodes === 0;
}

/** Result of applyDraw: new frozen hand and deck, and the card that moved (null if none moved). */
export interface DrawResult {
  readonly hand: readonly CardId[];
  readonly deck: readonly CardId[];
  readonly drawn: CardId | null;
}

/**
 * Apply the draw verdict from shouldDraw.
 * - false: nothing moves.
 * - true with a non-empty deck: the top card (the LAST deck element) is appended to the hand.
 * - true with an empty deck: the draw is skipped; no card is fabricated.
 *
 * Inputs are not mutated. Result arrays and the result object are frozen.
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
