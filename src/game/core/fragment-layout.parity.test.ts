// Parity test (task 2.4, requirement 4.6): the game's fragment table equals the corner sets implied by the
// optical module, and the per-slot validity equals the optical slot table. This is the ONLY file under
// src/game that may import src/optical (see boundaries.test.ts). The optical module is read, never edited.
//
// Naming and coordinate convention (checked against src/optical/fragments.ts and decode-group.ts):
// - Suits 'H' | 'D' | 'C' | 'S' and corners 'TL' | 'TR' | 'BL' | 'BR' have the same spelling on both sides,
//   and orientation is 0 | 180 on both sides. The names are still mapped explicitly below, so that a
//   rename on either side fails this test instead of passing by accident.
// - Corners are positions in the card frame with the card lying at the given orientation.
// - Card keys such as 'H-7' and 'S-10' are the same text in both modules.

import { describe, expect, it } from 'vitest';
import { ALL_CARDS as OPTICAL_CARDS, visibleCorners } from '../../optical/fragments';
import { ALLOWED_PLACEMENTS } from '../../optical/decode-group';
import { ALL_CARDS, suitOf } from './cards';
import { FRAGMENT_LAYOUT, isValidSuitMember, validSuitOrientations } from './fragment-layout';
import type { Corner, Orientation, Slot, Suit } from './types';

const SUIT_NAME = { H: 'H', D: 'D', C: 'C', S: 'S' } as const satisfies Record<Suit, string>;
const CORNER_NAME = { TL: 'TL', TR: 'TR', BL: 'BL', BR: 'BR' } as const satisfies Record<Corner, string>;
const ORIENTATIONS: readonly Orientation[] = [0, 180];
const SLOTS: readonly Slot[] = ['TL', 'TR', 'BL', 'BR'];
const SUITS: readonly Suit[] = ['H', 'D', 'C', 'S'];

// Same sort order on both sides; the optical function returns corners in TL, TR, BL, BR order.
const CORNER_ORDER: readonly string[] = ['TL', 'TR', 'BL', 'BR'];
const sortCorners = (cs: readonly string[]): string[] =>
  [...cs].sort((a, b) => CORNER_ORDER.indexOf(a) - CORNER_ORDER.indexOf(b));

describe('fragment layout parity with src/optical', () => {
  it('both catalogs hold the same 52 card keys', () => {
    expect(ALL_CARDS).toHaveLength(52);
    expect([...ALL_CARDS].sort()).toEqual([...OPTICAL_CARDS].sort());
  });

  it('FRAGMENT_LAYOUT[suit][orientation] equals visibleCorners for all 52 cards and both orientations', () => {
    for (const card of ALL_CARDS) {
      const suit = suitOf(card);
      for (const orientation of ORIENTATIONS) {
        const optical = visibleCorners(card, orientation).map((c) => CORNER_NAME[c]);
        const game = FRAGMENT_LAYOUT[suit][orientation].map((c) => CORNER_NAME[c]);
        expect(sortCorners(game), `${card} at ${orientation}`).toEqual(sortCorners(optical));
        expect(optical, `${card} at ${orientation}`).toHaveLength(2);
      }
    }
  });

  it('the optical module uses the same suit letters as the game', () => {
    for (const card of OPTICAL_CARDS) {
      expect(Object.values(SUIT_NAME)).toContain(card.charAt(0));
    }
  });

  it('per-slot validity equals the optical slot table (ALLOWED_PLACEMENTS) for all suits, slots and orientations', () => {
    for (const suit of SUITS) {
      for (const slot of SLOTS) {
        const opticalOrientations = new Set<Orientation>(
          ALLOWED_PLACEMENTS[SUIT_NAME[suit]][slot].flatMap((p) => p.orientations),
        );
        for (const orientation of ORIENTATIONS) {
          expect(isValidSuitMember(suit, orientation, slot), `${suit} ${slot} ${orientation}`).toBe(
            opticalOrientations.has(orientation),
          );
        }
        expect([...validSuitOrientations(suit, slot)], `${suit} ${slot}`).toEqual(
          ORIENTATIONS.filter((o) => opticalOrientations.has(o)),
        );
      }
    }
  });
});
