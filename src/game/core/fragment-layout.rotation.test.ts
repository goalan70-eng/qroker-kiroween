// Task 17.4: `rotationChangesCorners(card)` for all 52 cards.
// Evidence class: model (pure function, Node). The expectation below is an independent literal, not derived from
// FRAGMENT_LAYOUT: clubs and spades change their printed corners when turned by 180 degrees, hearts and diamonds
// do not (qroker-game Requirement 14).
import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from './cards';
import { FRAGMENT_LAYOUT, rotationChangesCorners } from './fragment-layout';
import type { CardId } from './types';

const EXPECTED: Readonly<Record<string, boolean>> = { H: false, D: false, C: true, S: true };

describe('rotationChangesCorners', () => {
  it('covers all 52 cards', () => {
    expect(ALL_CARDS).toHaveLength(52);
  });

  it.each(ALL_CARDS.map((card): [CardId] => [card]))('%s matches the literal expectation by suit letter', (card) => {
    expect(rotationChangesCorners(card)).toBe(EXPECTED[card.charAt(0)]);
  });

  it('is true for exactly the 26 clubs and spades', () => {
    const turning = ALL_CARDS.filter((card) => rotationChangesCorners(card));
    expect(turning).toHaveLength(26);
    expect(turning.every((card) => card.startsWith('C-') || card.startsWith('S-'))).toBe(true);
  });

  it('reads the table: the corner sets of H and D are equal at 0 and 180, those of C and S are not', () => {
    const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((c) => b.includes(c));
    expect(same(FRAGMENT_LAYOUT.H[0], FRAGMENT_LAYOUT.H[180])).toBe(true);
    expect(same(FRAGMENT_LAYOUT.D[0], FRAGMENT_LAYOUT.D[180])).toBe(true);
    expect(same(FRAGMENT_LAYOUT.C[0], FRAGMENT_LAYOUT.C[180])).toBe(false);
    expect(same(FRAGMENT_LAYOUT.S[0], FRAGMENT_LAYOUT.S[180])).toBe(false);
  });
});
