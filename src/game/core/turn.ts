/**
 * Turn order of the QRoker game engine (task 7.1).
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "DrawManager and TurnManager (`core/draw.ts`,
 * `core/turn.ts`)". Requirement 6.1 (P0 first, then P0, P1, P2, P3, P0, ...; Open Question OQ-5).
 *
 * Pure module: no DOM, no node, no randomness, no clock, no import from `src/optical`. It takes and returns
 * seat ids only. It reads no hand, deck or guess.
 *
 * Scope: only the cyclic successor of a seat. Which seats may act in which phase (`actingSeats`) and the
 * reducer's use of `nextSeat` after a PLACE or an ACK_REVEAL belong to the reducer (task 8.2).
 *
 * Invalid input: the design gives `nextSeat` no error value and the closed `ErrorCode` union has no code for
 * it. A value that is not one of the four seat ids can only come from an engine bug or from untyped data that
 * was not validated at the boundary (the reducer reports `UNKNOWN_PLAYER` before it gets here). `nextSeat`
 * therefore throws a `RangeError` instead of guessing a seat.
 */

import type { PlayerId } from './types';

/** The four seats in turn order. */
export const SEATS: readonly [PlayerId, PlayerId, PlayerId, PlayerId] = Object.freeze([
  'P0',
  'P1',
  'P2',
  'P3',
] as const) as readonly [PlayerId, PlayerId, PlayerId, PlayerId];

/** True if `value` is one of the four seat ids `'P0'`, `'P1'`, `'P2'`, `'P3'`. Accepts any runtime value. */
export function isPlayerId(value: unknown): value is PlayerId {
  return typeof value === 'string' && (SEATS as readonly string[]).includes(value);
}

/**
 * The seat that follows `current` in the fixed cyclic order P0 -> P1 -> P2 -> P3 -> P0.
 *
 * Throws a `RangeError` if `current` is not one of the four seat ids (see the module comment).
 */
export function nextSeat(current: PlayerId): PlayerId {
  const index = (SEATS as readonly unknown[]).indexOf(current);
  if (index < 0) {
    throw new RangeError(`nextSeat: not a seat id: ${describe(current)}`);
  }
  return SEATS[(index + 1) % SEATS.length] as PlayerId;
}

function describe(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : `${typeof value} ${String(value)}`;
}
