import { describe, expect, it } from 'vitest';
import { ALL_CARDS, suitOf } from './cards';
import {
  FRAGMENT_LAYOUT,
  INWARD_CORNER,
  isValidMember,
  isValidSuitMember,
  validOrientations,
  validSuitOrientations,
} from './fragment-layout';
import type { Corner, Orientation, Slot, Suit } from './types';

const SUIT_LIST: readonly Suit[] = ['H', 'D', 'C', 'S'];
const SLOT_LIST: readonly Slot[] = ['TL', 'TR', 'BL', 'BR'];

// Literal copies of the approved table (qroker-game Requirement 14.1, 14.5, 14.6).
const TABLE: ReadonlyArray<readonly [Suit, Orientation, readonly [Corner, Corner]]> = [
  ['H', 0, ['TL', 'BR']],
  ['H', 180, ['TL', 'BR']],
  ['D', 0, ['TR', 'BL']],
  ['D', 180, ['TR', 'BL']],
  ['C', 0, ['TR', 'BR']],
  ['C', 180, ['TL', 'BL']],
  ['S', 0, ['TL', 'BL']],
  ['S', 180, ['TR', 'BR']],
];

// Literal validity matrix, written by hand from the table above and the Inward_Corner rule
// (TL slot needs BR, TR slot needs BL, BL slot needs TR, BR slot needs TL).
// Each entry is [valid at 0 degrees, valid at 180 degrees].
const VALIDITY: Readonly<Record<Slot, Readonly<Record<Suit, readonly [boolean, boolean]>>>> = {
  TL: { H: [true, true], D: [false, false], C: [true, false], S: [false, true] },
  TR: { H: [false, false], D: [true, true], C: [false, true], S: [true, false] },
  BL: { H: [false, false], D: [true, true], C: [true, false], S: [false, true] },
  BR: { H: [true, true], D: [false, false], C: [false, true], S: [true, false] },
};

describe('FRAGMENT_LAYOUT', () => {
  it.each(TABLE)('suit %s at %i degrees has the printed corners %j', (suit, orientation, corners) => {
    expect([...FRAGMENT_LAYOUT[suit][orientation]].sort()).toEqual([...corners].sort());
  });

  it('covers exactly 4 suits and the 2 orientations 0 and 180', () => {
    expect(Object.keys(FRAGMENT_LAYOUT).sort()).toEqual(['C', 'D', 'H', 'S']);
    for (const suit of SUIT_LIST) {
      expect(Object.keys(FRAGMENT_LAYOUT[suit]).sort()).toEqual(['0', '180']);
    }
  });
});

describe('INWARD_CORNER', () => {
  it('maps TL->BR, TR->BL, BL->TR, BR->TL', () => {
    expect(INWARD_CORNER).toEqual({ TL: 'BR', TR: 'BL', BL: 'TR', BR: 'TL' });
  });
});

describe('the four examples of qroker-game Requirement 14.4', () => {
  it('a Heart at the top-left position is valid (BR matches)', () => {
    expect(isValidMember('H-7', 0, 'TL')).toBe(true);
  });

  it('a Club at the top-left position is valid (BR matches)', () => {
    expect(isValidMember('C-7', 0, 'TL')).toBe(true);
  });

  it('a Spade at the bottom-left position at 0 degrees is invalid', () => {
    expect(isValidMember('S-7', 0, 'BL')).toBe(false);
  });

  it('a Diamond at the top-left position is invalid at both orientations', () => {
    expect(isValidMember('D-7', 0, 'TL')).toBe(false);
    expect(isValidMember('D-7', 180, 'TL')).toBe(false);
  });
});

describe('member validity matrix (4 slots x 4 suits x 2 orientations)', () => {
  const cases = SLOT_LIST.flatMap((slot) =>
    SUIT_LIST.flatMap((suit) =>
      ([0, 180] as const).map((o, i) => [slot, suit, o, VALIDITY[slot][suit][i] as boolean] as const),
    ),
  );

  it('has 32 cases', () => {
    expect(cases).toHaveLength(32);
  });

  it.each(cases)('slot %s, suit %s, %i degrees -> %s', (slot, suit, orientation, expected) => {
    expect(isValidSuitMember(suit, orientation, slot)).toBe(expected);
    expect(isValidMember(`${suit}-5`, orientation, slot)).toBe(expected);
  });

  it('gives the same answer for every card of a suit', () => {
    for (const card of ALL_CARDS) {
      for (const slot of SLOT_LIST) {
        for (const o of [0, 180] as const) {
          expect(isValidMember(card, o, slot)).toBe(isValidSuitMember(suitOf(card), o, slot));
        }
      }
    }
  });

  it('Hearts and Diamonds have the same validity at 0 and 180 degrees in every slot', () => {
    for (const suit of ['H', 'D'] as const) {
      for (const slot of SLOT_LIST) {
        expect(isValidSuitMember(suit, 0, slot)).toBe(isValidSuitMember(suit, 180, slot));
      }
    }
  });

  it('Hearts are valid only in TL and BR, Diamonds only in TR and BL', () => {
    expect(SLOT_LIST.filter((s) => isValidSuitMember('H', 0, s))).toEqual(['TL', 'BR']);
    expect(SLOT_LIST.filter((s) => isValidSuitMember('D', 0, s))).toEqual(['TR', 'BL']);
  });
});

describe('validOrientations', () => {
  it.each(SLOT_LIST.flatMap((slot) => SUIT_LIST.map((suit) => [slot, suit] as const)))(
    'slot %s, suit %s lists exactly the valid orientations, ascending',
    (slot, suit) => {
      const [at0, at180] = VALIDITY[slot][suit];
      const expected: Orientation[] = [];
      if (at0) expected.push(0);
      if (at180) expected.push(180);
      expect(validSuitOrientations(suit, slot)).toEqual(expected);
      expect(validOrientations(`${suit}-K`, slot)).toEqual(expected);
    },
  );

  it('returns [0, 180] for a Heart in TL and [] for a Heart in TR', () => {
    expect(validOrientations('H-A', 'TL')).toEqual([0, 180]);
    expect(validOrientations('H-A', 'TR')).toEqual([]);
  });

  it('returns [0] for a Club in TL and [180] for a Spade in TL', () => {
    expect(validOrientations('C-2', 'TL')).toEqual([0]);
    expect(validOrientations('S-2', 'TL')).toEqual([180]);
  });
});
