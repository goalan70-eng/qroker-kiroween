import { describe, expect, it } from 'vitest';
import {
  BOARD_SIZE,
  candidateQuads,
  fromNotation,
  inBounds,
  orthogonalNeighbors,
  quadCells,
  quadKey,
  slotOf,
  toNotation,
} from './geometry';
import type { GridPosition } from './types';

const ALL_CELLS: GridPosition[] = [];
for (let row = 0; row < BOARD_SIZE; row++) {
  for (let col = 0; col < BOARD_SIZE; col++) ALL_CELLS.push({ row, col });
}

describe('notation', () => {
  it('maps D4 to {row:3,col:3} with row 1 at the top and column A at the left', () => {
    expect(BOARD_SIZE).toBe(8);
    expect(fromNotation('D4')).toEqual({ ok: true, value: { row: 3, col: 3 } });
    expect(fromNotation('A1')).toEqual({ ok: true, value: { row: 0, col: 0 } });
    expect(fromNotation('H8')).toEqual({ ok: true, value: { row: 7, col: 7 } });
    expect(toNotation({ row: 3, col: 3 })).toBe('D4');
    expect(toNotation({ row: 0, col: 7 })).toBe('H1');
    expect(toNotation({ row: 7, col: 0 })).toBe('A8');
  });

  it('round-trips all 64 cells', () => {
    expect(ALL_CELLS).toHaveLength(64);
    const seen = new Set<string>();
    for (const p of ALL_CELLS) {
      const text = toNotation(p);
      seen.add(text);
      expect(fromNotation(text)).toEqual({ ok: true, value: p });
    }
    expect(seen.size).toBe(64);
  });

  it.each(['A0', 'A9', 'I1', 'a1', 'd4', '', 'AA', '11', 'A10', 'A', '4', ' D4', 'D4 ', 'D 4', 'D4\n', 'D-4', 'D４'])(
    'rejects %j',
    (text) => {
      const r = fromNotation(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('OUT_OF_BOUNDS');
    },
  );

  it('throws RangeError for toNotation on an off-board position', () => {
    expect(() => toNotation({ row: -1, col: 0 })).toThrow(RangeError);
    expect(() => toNotation({ row: 0, col: 8 })).toThrow(RangeError);
    expect(() => toNotation({ row: 0.5, col: 0 })).toThrow(RangeError);
  });
});

describe('inBounds', () => {
  it('accepts exactly the 64 cells', () => {
    for (const p of ALL_CELLS) expect(inBounds(p)).toBe(true);
    expect(inBounds({ row: -1, col: 0 })).toBe(false);
    expect(inBounds({ row: 0, col: -1 })).toBe(false);
    expect(inBounds({ row: 8, col: 0 })).toBe(false);
    expect(inBounds({ row: 0, col: 8 })).toBe(false);
    expect(inBounds({ row: 1.5, col: 1 })).toBe(false);
    expect(inBounds({ row: Number.NaN, col: 1 })).toBe(false);
  });
});

describe('orthogonalNeighbors', () => {
  it('returns 2 for corners, 3 for edges, 4 for interior cells', () => {
    expect(orthogonalNeighbors({ row: 0, col: 0 })).toHaveLength(2);
    expect(orthogonalNeighbors({ row: 7, col: 7 })).toHaveLength(2);
    expect(orthogonalNeighbors({ row: 0, col: 3 })).toHaveLength(3);
    expect(orthogonalNeighbors({ row: 4, col: 7 })).toHaveLength(3);
    expect(orthogonalNeighbors({ row: 3, col: 3 })).toHaveLength(4);
  });

  it('uses the fixed order up, left, right, down', () => {
    expect(orthogonalNeighbors({ row: 3, col: 3 }).map(toNotation)).toEqual(['D3', 'C4', 'E4', 'D5']);
    expect(orthogonalNeighbors({ row: 0, col: 0 }).map(toNotation)).toEqual(['B1', 'A2']);
  });

  it('only returns in-bounds orthogonally adjacent cells', () => {
    for (const p of ALL_CELLS) {
      for (const n of orthogonalNeighbors(p)) {
        expect(inBounds(n)).toBe(true);
        expect(Math.abs(n.row - p.row) + Math.abs(n.col - p.col)).toBe(1);
      }
    }
  });
});

describe('candidateQuads', () => {
  it('returns 4 quads for an interior cell, in row-major top-left order', () => {
    const quads = candidateQuads({ row: 3, col: 3 });
    expect(quads.map(quadKey)).toEqual(['C3', 'D3', 'C4', 'D4']);
  });

  it('returns 1 quad for each corner', () => {
    expect(candidateQuads({ row: 0, col: 0 }).map(quadKey)).toEqual(['A1']);
    expect(candidateQuads({ row: 0, col: 7 }).map(quadKey)).toEqual(['G1']);
    expect(candidateQuads({ row: 7, col: 0 }).map(quadKey)).toEqual(['A7']);
    expect(candidateQuads({ row: 7, col: 7 }).map(quadKey)).toEqual(['G7']);
  });

  it('returns 2 quads for edge cells', () => {
    expect(candidateQuads({ row: 0, col: 3 }).map(quadKey)).toEqual(['C1', 'D1']);
    expect(candidateQuads({ row: 3, col: 0 }).map(quadKey)).toEqual(['A3', 'A4']);
    expect(candidateQuads({ row: 7, col: 3 }).map(quadKey)).toEqual(['C7', 'D7']);
    expect(candidateQuads({ row: 3, col: 7 }).map(quadKey)).toEqual(['G3', 'G4']);
  });

  it('yields 4/2/1 by cell class and every quad is on the board and contains the cell', () => {
    for (const p of ALL_CELLS) {
      const edgeRow = p.row === 0 || p.row === 7;
      const edgeCol = p.col === 0 || p.col === 7;
      const expected = (edgeRow ? 1 : 2) * (edgeCol ? 1 : 2);
      const quads = candidateQuads(p);
      expect(quads).toHaveLength(expected);
      for (const tl of quads) {
        const cells = quadCells(tl);
        expect(cells.every(inBounds)).toBe(true);
        expect(cells).toContainEqual(p);
      }
    }
  });
});

describe('quadCells, quadKey and slotOf', () => {
  it('lists the cells in the order TL, TR, BL, BR', () => {
    expect(quadCells({ row: 3, col: 3 })).toEqual([
      { row: 3, col: 3 },
      { row: 3, col: 4 },
      { row: 4, col: 3 },
      { row: 4, col: 4 },
    ]);
    expect(quadCells({ row: 3, col: 3 }).map(toNotation)).toEqual(['D4', 'E4', 'D5', 'E5']);
  });

  it('uses the notation of the top-left cell as the quad key', () => {
    expect(quadKey({ row: 3, col: 3 })).toBe('D4');
    expect(quadKey({ row: 0, col: 0 })).toBe('A1');
    expect(quadKey({ row: 6, col: 6 })).toBe('G7');
  });

  it('reports slot TL, TR, BL, BR for the four cells of a quad', () => {
    const tl = { row: 3, col: 3 };
    expect(slotOf(tl, { row: 3, col: 3 })).toBe('TL');
    expect(slotOf(tl, { row: 3, col: 4 })).toBe('TR');
    expect(slotOf(tl, { row: 4, col: 3 })).toBe('BL');
    expect(slotOf(tl, { row: 4, col: 4 })).toBe('BR');
  });

  it('is consistent: slotOf follows the quadCells order for every valid quad', () => {
    const slots = ['TL', 'TR', 'BL', 'BR'] as const;
    for (let row = 0; row < BOARD_SIZE - 1; row++) {
      for (let col = 0; col < BOARD_SIZE - 1; col++) {
        const tl = { row, col };
        quadCells(tl).forEach((cell, i) => expect(slotOf(tl, cell)).toBe(slots[i]));
      }
    }
  });

  it('throws RangeError for cells outside the quad or quads not fully on the board', () => {
    expect(() => slotOf({ row: 3, col: 3 }, { row: 5, col: 3 })).toThrow(RangeError);
    expect(() => slotOf({ row: 3, col: 3 }, { row: 2, col: 3 })).toThrow(RangeError);
    expect(() => quadCells({ row: 7, col: 0 })).toThrow(RangeError);
    expect(() => quadCells({ row: 0, col: 7 })).toThrow(RangeError);
    expect(() => quadKey({ row: 7, col: 7 })).toThrow(RangeError);
    expect(() => quadKey({ row: -1, col: 0 })).toThrow(RangeError);
  });
});
