/**
 * Fragment layout of the QRoker game engine.
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "FragmentLayout (`core/fragment-layout.ts`)";
 * qroker-game Requirement 14 (Fragment_Layout, Inward_Corner, validity rule) and Requirements 4.1 to 4.6.
 *
 * Pure data and pure functions. This module has no dependency on the optical pipeline: equality with the
 * optical layout is asserted by the test-only parity test, never by an import here.
 *
 * Convention: a corner name is a position in the card frame as the card lies on the table, seen from
 * above, for the given orientation. Turning a card by 180 degrees maps TL<->BR and TR<->BL.
 */

import { suitOf } from './cards';
import type { CardId, Corner, Orientation, Slot, Suit } from './types';

/**
 * The two corners that carry a printed fragment, per suit and orientation.
 * Hearts and Diamonds are 180-degree point symmetric, so both orientations give the same set.
 * Clubs and Spades are mirror symmetric, so a 180-degree turn moves the fragments to the other side.
 */
export const FRAGMENT_LAYOUT: Readonly<Record<Suit, Readonly<Record<Orientation, readonly Corner[]>>>> = {
  H: { 0: ['TL', 'BR'], 180: ['TL', 'BR'] },
  D: { 0: ['TR', 'BL'], 180: ['TR', 'BL'] },
  C: { 0: ['TR', 'BR'], 180: ['TL', 'BL'] },
  S: { 0: ['TL', 'BL'], 180: ['TR', 'BR'] },
};

/** The corner of a card that faces the centre of its 2x2 group, by slot of the card in the group. */
export const INWARD_CORNER: Readonly<Record<Slot, Corner>> = { TL: 'BR', TR: 'BL', BL: 'TR', BR: 'TL' };

const ORIENTATIONS: readonly Orientation[] = [0, 180];

/** Suit-level form of {@link isValidMember}: the inward corner of the slot is a printed corner. */
export function isValidSuitMember(suit: Suit, orientation: Orientation, slot: Slot): boolean {
  return FRAGMENT_LAYOUT[suit][orientation].includes(INWARD_CORNER[slot]);
}

/** Suit-level form of {@link validOrientations}, in ascending order (0 before 180). */
export function validSuitOrientations(suit: Suit, slot: Slot): readonly Orientation[] {
  return ORIENTATIONS.filter((o) => isValidSuitMember(suit, o, slot));
}

/**
 * A card at `orientation` in `slot` of a 2x2 group is a valid member of a Composite_Code if and only if
 * the Inward_Corner of the slot is one of the card's printed corners for that orientation.
 */
export function isValidMember(card: CardId, orientation: Orientation, slot: Slot): boolean {
  return isValidSuitMember(suitOf(card), orientation, slot);
}

/** The orientations in {0, 180} (ascending) for which the card is a valid member of `slot`. */
export function validOrientations(card: CardId, slot: Slot): readonly Orientation[] {
  return validSuitOrientations(suitOf(card), slot);
}

/**
 * Whether turning the card by 180 degrees changes WHICH corners carry a printed fragment ("Meaningful_Rotation",
 * placement interaction, task 17.4). Derived from `FRAGMENT_LAYOUT`: true iff the corner sets at 0 and at 180
 * differ. With the current table that is true for clubs and spades and false for hearts and diamonds.
 *
 * Pure and additive: the table and every other export are unchanged. The UI controller is the only `ui/` module
 * allowed to call it; it hands screens a boolean per card of the viewer's own Hand and never the table.
 */
export function rotationChangesCorners(card: CardId): boolean {
  const layout = FRAGMENT_LAYOUT[suitOf(card)];
  const upright = layout[0];
  const turned = layout[180];
  return upright.length !== turned.length || upright.some((corner) => !turned.includes(corner));
}
