import { describe, expect, it } from 'vitest';
import { cellAt, emptyBoard, initialBoard, placeOnBoard } from './board';
import type { Board, PlacedCard } from './board';
import { detect, startingQuadIsExcluded } from './composite-code';
import type { CompositeCodeResult } from './composite-code';
import { fromNotation } from './geometry';
import type { CardId, GridPosition, Orientation, Slot, Suit } from './types';

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

type Entry = readonly [cell: string, card: CardId, orientation: Orientation];

function pos(notation: string): GridPosition {
  const r = fromNotation(notation);
  if (!r.ok) throw new Error(`bad notation ${notation}`);
  return r.value;
}

/** Builds a deep-frozen board directly from entries, bypassing adjacency rules (hand-built fixture). */
function boardOf(entries: readonly Entry[]): Board {
  const cells: (PlacedCard | null)[] = new Array<PlacedCard | null>(64).fill(null);
  for (const [cell, card, orientation] of entries) {
    const p = pos(cell);
    cells[p.row * 8 + p.col] = Object.freeze({ card, orientation, owner: 'P0' as const });
  }
  return Object.freeze(cells);
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>();
const SLOTS: readonly Slot[] = ['TL', 'TR', 'BL', 'BR'];
const SUITS: readonly Suit[] = ['H', 'D', 'C', 'S'];

/** Cells of the quad whose top-left cell is D4: TL=D4, TR=E4, BL=D5, BR=E5. */
const D4_QUAD: Readonly<Record<Slot, string>> = { TL: 'D4', TR: 'E4', BL: 'D5', BR: 'E5' };

/** Independent literal validity matrix (copied from fragment-layout.test.ts): [valid at 0, valid at 180]. */
const VALIDITY: Readonly<Record<Slot, Readonly<Record<Suit, readonly [boolean, boolean]>>>> = {
  TL: { H: [true, true], D: [false, false], C: [true, false], S: [false, true] },
  TR: { H: [false, false], D: [true, true], C: [false, true], S: [true, false] },
  BL: { H: [false, false], D: [true, true], C: [true, false], S: [false, true] },
  BR: { H: [true, true], D: [false, false], C: [false, true], S: [true, false] },
};

/** Valid filler members (orientation 0) for each slot; distinct from any rank-9 card. */
const FILLER: Readonly<Record<Slot, readonly [CardId, Orientation]>> = {
  TL: ['H-2', 0],
  TR: ['D-3', 0],
  BL: ['D-4', 0],
  BR: ['H-5', 0],
};

/** The D4 quad with `card` at `orientation` in `slot` and valid fillers in the other three slots. */
function quadWith(slot: Slot, card: CardId, orientation: Orientation): Board {
  return boardOf(
    SLOTS.map((s): Entry => {
      if (s === slot) return [D4_QUAD[s], card, orientation];
      const [c, o] = FILLER[s];
      return [D4_QUAD[s], c, o];
    }),
  );
}

/** Sum of the card values of the fillers outside `slot`. */
function fillerSum(slot: Slot): number {
  const values: Record<string, number> = { 'H-2': 2, 'D-3': 3, 'D-4': 4, 'H-5': 5 };
  return SLOTS.filter((s) => s !== slot).reduce((sum, s) => sum + (values[FILLER[s][0]] as number), 0);
}

const keys = (r: readonly CompositeCodeResult[]): string[] => r.map((c) => c.quadKey);

// ---------------------------------------------------------------------------------------------
// qroker-game Requirement 14.4: the four valid/invalid examples
// ---------------------------------------------------------------------------------------------

describe('the four examples of qroker-game Requirement 14.4 as complete 2x2 fixtures', () => {
  it('a Heart at the top-left position is valid: the quad is a code', () => {
    const board = quadWith('TL', 'H-7', 0);
    const result = detect(board, pos('D4'), EMPTY_SET);
    expect(keys(result)).toEqual(['D4']);
    expect(result[0]?.hiddenSum).toBe(7 + 3 + 4 + 5);
  });

  it('a Club at the top-left position (0 degrees) is valid: the quad is a code', () => {
    const board = quadWith('TL', 'C-7', 0);
    const result = detect(board, pos('D4'), EMPTY_SET);
    expect(keys(result)).toEqual(['D4']);
    expect(result[0]?.hiddenSum).toBe(7 + 3 + 4 + 5);
  });

  it('a Spade at the bottom-left position at 0 degrees is invalid: no code', () => {
    const board = quadWith('BL', 'S-7', 0);
    expect(detect(board, pos('D5'), EMPTY_SET)).toEqual([]);
    // the same Spade turned by 180 degrees is valid there
    expect(keys(detect(quadWith('BL', 'S-7', 180), pos('D5'), EMPTY_SET))).toEqual(['D4']);
  });

  it('a Diamond at the top-left position is invalid at both orientations: no code', () => {
    expect(detect(quadWith('TL', 'D-7', 0), pos('D4'), EMPTY_SET)).toEqual([]);
    expect(detect(quadWith('TL', 'D-7', 180), pos('D4'), EMPTY_SET)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Member validity per slot, suit and orientation (independent literal matrix)
// ---------------------------------------------------------------------------------------------

describe('a fully occupied quad is a code if and only if the member is valid (4 slots x 4 suits x 2 orientations)', () => {
  const cases = SLOTS.flatMap((slot) =>
    SUITS.flatMap((suit) =>
      ([0, 180] as const).map((o, i) => [slot, suit, o, VALIDITY[slot][suit][i] as boolean] as const),
    ),
  );

  it('has 32 cases', () => {
    expect(cases).toHaveLength(32);
  });

  it.each(cases)('slot %s, suit %s, %i degrees -> code: %s', (slot, suit, orientation, expected) => {
    const card: CardId = `${suit}-9`;
    const board = quadWith(slot, card, orientation);
    const placedAt = pos(D4_QUAD[slot]);
    const result = detect(board, placedAt, EMPTY_SET);
    if (expected) {
      expect(keys(result)).toEqual(['D4']);
      expect(result[0]?.hiddenSum).toBe(9 + fillerSum(slot));
    } else {
      expect(result).toEqual([]);
    }
  });

  it('the result does not depend on which cell of the quad is the placed cell', () => {
    const board = quadWith('TL', 'C-9', 0);
    for (const slot of SLOTS) {
      expect(keys(detect(board, pos(D4_QUAD[slot]), EMPTY_SET))).toEqual(['D4']);
    }
    const invalid = quadWith('TL', 'D-9', 0);
    for (const slot of SLOTS) {
      expect(detect(invalid, pos(D4_QUAD[slot]), EMPTY_SET)).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Result content, Hidden_Sum and boundary sums
// ---------------------------------------------------------------------------------------------

describe('result content', () => {
  const board = boardOf([
    ['D4', 'H-2', 180],
    ['E4', 'D-3', 0],
    ['D5', 'D-9', 180],
    ['E5', 'H-4', 0],
  ]);

  it('returns exactly one code with cards and orientations in the order TL, TR, BL, BR', () => {
    const result = detect(board, pos('E5'), EMPTY_SET);
    expect(result).toHaveLength(1);
    const code = result[0] as CompositeCodeResult;
    expect(code.quadKey).toBe('D4');
    expect(code.topLeft).toEqual({ row: 3, col: 3 });
    expect(code.cards).toEqual(['H-2', 'D-3', 'D-9', 'H-4']);
    expect(code.orientations).toEqual([180, 0, 180, 0]);
  });

  it('computes the Hidden_Sum by hand: 2 + 3 + 9 + 4 = 18', () => {
    expect(detect(board, pos('E5'), EMPTY_SET)[0]?.hiddenSum).toBe(18);
  });

  it('the groupId is the sorted card ids joined by "|"', () => {
    expect(detect(board, pos('E5'), EMPTY_SET)[0]?.groupId).toBe('D-3|D-9|H-2|H-4');
  });
});

describe('boundary Hidden_Sums', () => {
  /** All valid arrangements of one card per suit (given rank) over the 4 slots and 16 orientation choices. */
  function validArrangements(rank: 'A' | 'K'): Entry[][] {
    const out: Entry[][] = [];
    const perms = (items: readonly Suit[]): Suit[][] =>
      items.length <= 1
        ? [[...items]]
        : items.flatMap((x, i) => perms([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]));
    for (const perm of perms(SUITS)) {
      for (let mask = 0; mask < 16; mask++) {
        const entries = perm.map((suit, i): Entry => {
          const slot = SLOTS[i] as Slot;
          const orientation: Orientation = (mask >> i) & 1 ? 180 : 0;
          return [D4_QUAD[slot], `${suit}-${rank}`, orientation];
        });
        const valid = entries.every(([cell, card, o]) => {
          const slot = SLOTS.find((s) => D4_QUAD[s] === cell) as Slot;
          return VALIDITY[slot][card[0] as Suit][o === 0 ? 0 : 1];
        });
        if (valid) out.push(entries);
      }
    }
    return out;
  }

  it.each([
    ['A', 4],
    ['K', 52],
  ] as const)('four %s cards, one per suit, in a valid arrangement give the Hidden_Sum %i', (rank, sum) => {
    const arrangements = validArrangements(rank);
    expect(arrangements.length).toBeGreaterThan(0);
    for (const entries of arrangements) {
      const result = detect(boardOf(entries), pos('D4'), EMPTY_SET);
      expect(result).toHaveLength(1);
      expect(result[0]?.hiddenSum).toBe(sum);
    }
  });

  it('detect finds a code in exactly the valid arrangements of the 384 (24 suit orders x 16 orientation choices)', () => {
    const all = 24 * 16;
    const validCount = validArrangements('A').length;
    expect(validCount).toBeLessThan(all);
    let detected = 0;
    const suitsPerm = (items: readonly Suit[]): Suit[][] =>
      items.length <= 1
        ? [[...items]]
        : items.flatMap((x, i) => suitsPerm([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]));
    for (const perm of suitsPerm(SUITS)) {
      for (let mask = 0; mask < 16; mask++) {
        const entries = perm.map((suit, i): Entry => [
          D4_QUAD[SLOTS[i] as Slot],
          `${suit}-A` as CardId,
          (mask >> i) & 1 ? 180 : 0,
        ]);
        if (detect(boardOf(entries), pos('D4'), EMPTY_SET).length === 1) detected++;
      }
    }
    expect(detected).toBe(validCount);
  });
});

// ---------------------------------------------------------------------------------------------
// Incomplete quads, scope of examination
// ---------------------------------------------------------------------------------------------

describe('incomplete quads and scope', () => {
  const full: readonly Entry[] = [
    ['D4', 'H-2', 0],
    ['E4', 'D-3', 0],
    ['D5', 'D-4', 0],
    ['E5', 'H-5', 0],
  ];

  it('three of four cells occupied gives no code (each missing cell)', () => {
    for (let missing = 0; missing < 4; missing++) {
      const entries = full.filter((_, i) => i !== missing);
      for (const [cell] of entries) {
        expect(detect(boardOf(entries), pos(cell), EMPTY_SET)).toEqual([]);
      }
    }
  });

  it('a complete valid quad is not examined when the placed cell is not in it', () => {
    const board = boardOf([...full, ['F4', 'S-9', 0], ['F6', 'C-9', 0]]);
    expect(detect(board, pos('F4'), EMPTY_SET)).toEqual([]);
    expect(detect(board, pos('F6'), EMPTY_SET)).toEqual([]);
    expect(keys(detect(board, pos('E4'), EMPTY_SET))).toEqual(['D4']);
  });

  it('only quads containing the placed cell are examined: a valid quad at a diagonal is ignored', () => {
    // valid quad at D4 and a second valid quad at F6 (TL=F6 .. BR=G7); placing at E5 sees only D4.
    const board = boardOf([
      ...full,
      ['F6', 'H-6', 0],
      ['G6', 'D-6', 0],
      ['F7', 'D-7', 0],
      ['G7', 'H-7', 0],
    ]);
    expect(keys(detect(board, pos('E5'), EMPTY_SET))).toEqual(['D4']);
    expect(keys(detect(board, pos('G7'), EMPTY_SET))).toEqual(['F6']);
  });

  it('returns [] when the placed cell is empty', () => {
    const board = boardOf(full);
    expect(detect(board, pos('F4'), EMPTY_SET)).toEqual([]);
    expect(detect(emptyBoard(), pos('D4'), EMPTY_SET)).toEqual([]);
  });

  it('returns [] when the placed cell is outside the board or not an integer cell', () => {
    const board = boardOf(full);
    for (const p of [
      { row: -1, col: 0 },
      { row: 0, col: -1 },
      { row: 8, col: 3 },
      { row: 3, col: 8 },
      { row: 3.5, col: 3 },
      { row: Number.NaN, col: 3 },
    ]) {
      expect(detect(board, p, EMPTY_SET)).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Board edges and corners
// ---------------------------------------------------------------------------------------------

describe('quads clipped at the board boundary', () => {
  it('top-left corner A1 belongs to one quad only (key A1)', () => {
    const board = boardOf([
      ['A1', 'H-A', 0],
      ['B1', 'D-2', 0],
      ['A2', 'D-3', 0],
      ['B2', 'H-4', 0],
    ]);
    const result = detect(board, pos('A1'), EMPTY_SET);
    expect(keys(result)).toEqual(['A1']);
    expect(result[0]?.hiddenSum).toBe(1 + 2 + 3 + 4);
  });

  it('bottom-right corner H8 belongs to one quad only (key G7, H8 is its BR member)', () => {
    const board = boardOf([
      ['G7', 'H-A', 0],
      ['H7', 'D-2', 0],
      ['G8', 'D-3', 0],
      ['H8', 'H-4', 0],
    ]);
    expect(keys(detect(board, pos('H8'), EMPTY_SET))).toEqual(['G7']);
  });

  it('corner H1 and corner A8 each belong to one quad (keys G1 and A7)', () => {
    const topRight = boardOf([
      ['G1', 'H-A', 0],
      ['H1', 'D-2', 0],
      ['G2', 'D-3', 0],
      ['H2', 'H-4', 0],
    ]);
    expect(keys(detect(topRight, pos('H1'), EMPTY_SET))).toEqual(['G1']);
    const bottomLeft = boardOf([
      ['A7', 'H-A', 0],
      ['B7', 'D-2', 0],
      ['A8', 'D-3', 0],
      ['B8', 'H-4', 0],
    ]);
    expect(keys(detect(bottomLeft, pos('A8'), EMPTY_SET))).toEqual(['A7']);
  });

  it('an invalid member in a corner quad gives no code', () => {
    const board = boardOf([
      ['A1', 'D-A', 0], // Diamond at TL is never valid
      ['B1', 'D-2', 0],
      ['A2', 'D-3', 0],
      ['B2', 'H-4', 0],
    ]);
    expect(detect(board, pos('A1'), EMPTY_SET)).toEqual([]);
  });

  it('an edge cell has two candidate quads; only the complete valid one is returned', () => {
    // A4 (row 3, col 0): quads A3 (above) and A4 (below). Only the quad A4 is complete.
    const board = boardOf([
      ['A4', 'H-A', 0],
      ['B4', 'D-2', 0],
      ['A5', 'D-3', 0],
      ['B5', 'H-4', 0],
      ['B3', 'S-9', 0],
    ]);
    expect(keys(detect(board, pos('A4'), EMPTY_SET))).toEqual(['A4']);
  });
});

// ---------------------------------------------------------------------------------------------
// Two codes at once, ordering, groupId skip
// ---------------------------------------------------------------------------------------------

describe('a single placement that completes two codes', () => {
  // The Diamond D-9 at D4 (row 3, col 3) is the BL member of the quad D3 (above, top-left at D3)
  // and the TR member of the quad C4 (left, top-left at C4). A Diamond is valid in TR and BL only.
  //   quad D3: TL=D3 H-2, TR=E3 D-3, BL=D4 D-9, BR=E4 H-4
  //   quad C4: TL=C4 H-5, TR=D4 D-9, BL=C5 D-6, BR=D5 H-7
  const entries: readonly Entry[] = [
    ['D3', 'H-2', 0],
    ['E3', 'D-3', 0],
    ['D4', 'D-9', 0],
    ['E4', 'H-4', 0],
    ['C4', 'H-5', 0],
    ['C5', 'D-6', 0],
    ['D5', 'H-7', 0],
  ];
  const board = boardOf(entries);
  const idD3 = 'D-3|D-9|H-2|H-4';
  const idC4 = 'D-6|D-9|H-5|H-7';

  it('returns both codes with their own Hidden_Sums', () => {
    const result = detect(board, pos('D4'), EMPTY_SET);
    expect(result).toHaveLength(2);
    const byKey = Object.fromEntries(result.map((c) => [c.quadKey, c]));
    expect(byKey['D3']?.hiddenSum).toBe(2 + 3 + 9 + 4);
    expect(byKey['D3']?.groupId).toBe(idD3);
    expect(byKey['C4']?.hiddenSum).toBe(5 + 9 + 6 + 7);
    expect(byKey['C4']?.groupId).toBe(idC4);
  });

  it('orders the results by quadKey (design.md): C4 before D3', () => {
    // Column-major on the notation; differs from the row-major order of legalCells/candidateQuads.
    const result = keys(detect(board, pos('D4'), EMPTY_SET));
    expect(result).toEqual(['C4', 'D3']);
    // Independent expectation: the default string sort of the same keys.
    expect(result).toEqual([...result].sort());
  });

  it('a recorded groupId is skipped: only the other code is returned', () => {
    expect(keys(detect(board, pos('D4'), new Set([idD3])))).toEqual(['C4']);
    expect(keys(detect(board, pos('D4'), new Set([idC4])))).toEqual(['D3']);
  });

  it('both groupIds recorded gives []', () => {
    expect(detect(board, pos('D4'), new Set([idD3, idC4]))).toEqual([]);
  });

  it('an unrelated recorded groupId skips nothing', () => {
    expect(detect(board, pos('D4'), new Set(['H-A|H-2|H-3|H-4']))).toHaveLength(2);
  });

  it('a Heart shared by two diagonal quads also completes two codes (BR of one, TL of the other)', () => {
    // H-A at D4 is the BR member of quad C3 and the TL member of quad D4.
    const b = boardOf([
      ['C3', 'H-2', 0],
      ['D3', 'D-3', 0],
      ['C4', 'D-4', 0],
      ['D4', 'H-A', 0],
      ['E4', 'D-5', 0],
      ['D5', 'D-6', 0],
      ['E5', 'H-7', 0],
    ]);
    const result = detect(b, pos('D4'), EMPTY_SET);
    expect(keys(result)).toEqual(['C3', 'D4']);
    expect(result.map((c) => c.hiddenSum)).toEqual([2 + 3 + 4 + 1, 1 + 5 + 6 + 7]);
  });

  it('a single card is a valid member in exactly two slots, so at most two codes are completed at once', () => {
    // A Heart fills TL and BR of its four quads; a Diamond TR and BL. No arrangement gives three codes.
    for (const suit of SUITS) {
      for (const o of [0, 180] as const) {
        const validSlots = SLOTS.filter((s) => VALIDITY[s][suit][o === 0 ? 0 : 1]);
        expect(validSlots).toHaveLength(2);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// groupId and Hidden_Sum independence of arrangement and placement order
// ---------------------------------------------------------------------------------------------

describe('groupId and Hidden_Sum are independent of arrangement and placement order', () => {
  it('swapping the two Hearts (TL <-> BR) gives the same groupId and Hidden_Sum', () => {
    const a = boardOf([
      ['D4', 'H-2', 0],
      ['E4', 'D-3', 0],
      ['D5', 'D-9', 0],
      ['E5', 'H-4', 0],
    ]);
    const b = boardOf([
      ['D4', 'H-4', 180],
      ['E4', 'D-9', 0],
      ['D5', 'D-3', 180],
      ['E5', 'H-2', 0],
    ]);
    const ra = detect(a, pos('D4'), EMPTY_SET)[0] as CompositeCodeResult;
    const rb = detect(b, pos('D4'), EMPTY_SET)[0] as CompositeCodeResult;
    expect(ra.groupId).toBe(rb.groupId);
    expect(ra.hiddenSum).toBe(rb.hiddenSum);
    expect(ra.cards).not.toEqual(rb.cards);
  });

  it('the same four cards at another location give the same groupId and another quadKey', () => {
    const at = (cells: readonly [string, string, string, string]): Board =>
      boardOf([
        [cells[0], 'H-2', 0],
        [cells[1], 'D-3', 0],
        [cells[2], 'D-9', 0],
        [cells[3], 'H-4', 0],
      ]);
    const r1 = detect(at(['D4', 'E4', 'D5', 'E5']), pos('E5'), EMPTY_SET)[0] as CompositeCodeResult;
    const r2 = detect(at(['A1', 'B1', 'A2', 'B2']), pos('B2'), EMPTY_SET)[0] as CompositeCodeResult;
    expect(r1.groupId).toBe(r2.groupId);
    expect(r1.quadKey).toBe('D4');
    expect(r2.quadKey).toBe('A1');
  });

  it('the cell placed last does not change the result (every order of the 4 placements)', () => {
    // Build the quad by real placements on a board that starts with one card, in several orders.
    const cards: ReadonlyArray<readonly [string, CardId]> = [
      ['D4', 'H-2'],
      ['E4', 'D-3'],
      ['D5', 'D-9'],
      ['E5', 'H-4'],
    ];
    const orders: ReadonlyArray<readonly number[]> = [
      [0, 1, 2, 3],
      [3, 2, 1, 0],
      [1, 0, 3, 2],
      [2, 3, 0, 1],
    ];
    const seen = new Set<string>();
    for (const order of orders) {
      let board: Board = emptyBoard();
      let last: CompositeCodeResult[] = [];
      order.forEach((idx, step) => {
        const [cell, card] = cards[idx] as readonly [string, CardId];
        const p = pos(cell);
        if (step === 0) {
          const cellsArr = board.slice() as (PlacedCard | null)[];
          cellsArr[p.row * 8 + p.col] = Object.freeze({ card, orientation: 0 as const, owner: 'P0' as const });
          board = Object.freeze(cellsArr);
        } else {
          const placed = placeOnBoard(board, p, { card, orientation: 0, owner: 'P1' });
          if (!placed.ok) throw new Error(`placement failed: ${placed.error.code}`);
          board = placed.value;
        }
        last = detect(board, p, EMPTY_SET);
        if (step < 3) expect(last).toEqual([]);
      });
      expect(last).toHaveLength(1);
      seen.add(JSON.stringify(last[0]));
    }
    expect(seen.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Idempotence, purity, starting group
// ---------------------------------------------------------------------------------------------

describe('idempotence and purity', () => {
  const board = boardOf([
    ['D3', 'H-2', 0],
    ['E3', 'D-3', 0],
    ['D4', 'D-9', 0],
    ['E4', 'H-4', 0],
    ['C4', 'H-5', 0],
    ['C5', 'D-6', 0],
    ['D5', 'H-7', 0],
  ]);

  it('calling detect twice with the same inputs gives deep-equal results', () => {
    const first = detect(board, pos('D4'), EMPTY_SET);
    const second = detect(board, pos('D4'), EMPTY_SET);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  it('after recording the groupIds of the first result, a second run returns no code', () => {
    const first = detect(board, pos('D4'), EMPTY_SET);
    const recorded = new Set(first.map((c) => c.groupId));
    expect(first).toHaveLength(2);
    expect(detect(board, pos('D4'), recorded)).toEqual([]);
  });

  it('does not mutate a deep-frozen board or the scored-groups record', () => {
    const snapshot = JSON.stringify(board);
    const record = new Set(['X|Y|Z|W']);
    const trap = (): never => {
      throw new Error('scoredGroups was mutated');
    };
    Object.assign(record, { add: trap, delete: trap, clear: trap });
    expect(Object.isFrozen(board)).toBe(true);
    expect(() => detect(board, pos('D4'), record)).not.toThrow();
    expect(JSON.stringify(board)).toBe(snapshot);
    expect([...record]).toEqual(['X|Y|Z|W']);
    // results are frozen too, so a caller cannot change the cards that were read from the board
    const result = detect(board, pos('D4'), record)[0] as CompositeCodeResult;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.cards)).toBe(true);
  });
});

describe('the starting 2x2', () => {
  // Valid, distinct starting cards at orientation 0 so that the starting quad is a code by shape.
  const neutral = ['H-2', 'D-3', 'D-4', 'H-5'] as const;
  const start = initialBoard(neutral);

  it('is not returned when the placed cell is outside the starting quad (not examined)', () => {
    // Place a card next to the starting group: no quad containing F4 includes the 4 neutral cells.
    const placed = placeOnBoard(start, pos('F4'), { card: 'S-9', orientation: 0, owner: 'P0' });
    if (!placed.ok) throw new Error('placement failed');
    expect(detect(placed.value, pos('F4'), EMPTY_SET)).toEqual([]);
    const placed2 = placeOnBoard(start, pos('D6'), { card: 'C-9', orientation: 0, owner: 'P0' });
    if (!placed2.ok) throw new Error('placement failed');
    expect(detect(placed2.value, pos('D6'), EMPTY_SET)).toEqual([]);
  });

  it('is not special-cased: it is returned only if a caller passes one of its own cells as placedAt', () => {
    // detect has no NEUTRAL rule (OQ-3 is applied by the engine, task 8); examining it is the caller's choice.
    expect(keys(detect(start, pos('D4'), EMPTY_SET))).toEqual(['D4']);
    expect(cellAt(start, pos('D4'))?.owner).toBe('NEUTRAL');
  });

  it('documents the exclusion through startingQuadIsExcluded', () => {
    expect(startingQuadIsExcluded()).toBe(true);
  });
});
