/**
 * Board geometry of the QRoker game engine.
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "Geometry (`core/geometry.ts`)".
 * Requirements: 3.1 (notation conversion), 5.1 and 5.8 (2x2 candidate regions).
 *
 * Conventions:
 * - The board is 8x8 with columns A-H and rows 1-8. Row 1 is the TOP row.
 * - `GridPosition` is 0-based (IC-3): D4 is `{ row: 3, col: 3 }`, A1 is `{ row: 0, col: 0 }`,
 *   H8 is `{ row: 7, col: 7 }`.
 * - A 2x2 region ("quad") is identified by its top-left cell. Its public identifier, the
 *   `QuadKey`, is the notation of that cell, for example `'D4'` (IC-4).
 *
 * Deterministic orders (all results are in row-major order unless noted):
 * - `orthogonalNeighbors`: up (row-1), left (col-1), right (col+1), down (row+1).
 * - `candidateQuads`: top-left cells in row-major order, i.e. (row-1,col-1), (row-1,col),
 *   (row,col-1), (row,col), keeping only the quads that lie fully on the board.
 * - `quadCells`: TL, TR, BL, BR.
 *
 * Pure module: no DOM, no node:*, no Math.random / Date, no import from src/optical.
 */

import type { GridPosition, QuadKey, Result, Slot } from './types';

export const BOARD_SIZE = 8;

const COLUMN_LETTERS = 'ABCDEFGH';

/** Exactly one column letter A-H (upper case only) followed by one row digit 1-8. */
const NOTATION_PATTERN = /^[A-H][1-8]$/;

function isCoordinate(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n < BOARD_SIZE;
}

/** True when `p` is an integer cell position inside the 8x8 board. */
export function inBounds(p: GridPosition): boolean {
  return isCoordinate(p.row) && isCoordinate(p.col);
}

/**
 * Notation of a cell, for example `{row:3,col:3}` -> `'D4'`.
 * @throws RangeError if `p` is not on the board (a caller bug; use `inBounds` first).
 */
export function toNotation(p: GridPosition): string {
  if (!inBounds(p)) {
    throw new RangeError(`toNotation: position (${p.row}, ${p.col}) is outside the board`);
  }
  return `${COLUMN_LETTERS[p.col]}${p.row + 1}`;
}

/**
 * Parses a cell notation such as `'D4'`. Accepts exactly an upper-case column letter A-H
 * followed by a digit 1-8. Anything else (`''`, `'a1'`, `'A0'`, `'A9'`, `'I1'`, `'AA'`,
 * `'A10'`, whitespace) returns `{ ok: false }` with the code `OUT_OF_BOUNDS`
 * ("cell outside A1-H8") and the offending text in `detail`.
 */
export function fromNotation(s: string): Result<GridPosition> {
  if (typeof s !== 'string' || !NOTATION_PATTERN.test(s)) {
    return { ok: false, error: { code: 'OUT_OF_BOUNDS', detail: `invalid cell notation: ${JSON.stringify(s)}` } };
  }
  return {
    ok: true,
    value: { row: s.charCodeAt(1) - '1'.charCodeAt(0), col: s.charCodeAt(0) - 'A'.charCodeAt(0) },
  };
}

/**
 * The in-bounds orthogonal neighbors of `p` (2 for corners, 3 for edges, 4 for interior
 * cells) in the order up, left, right, down.
 */
export function orthogonalNeighbors(p: GridPosition): GridPosition[] {
  const candidates: GridPosition[] = [
    { row: p.row - 1, col: p.col },
    { row: p.row, col: p.col - 1 },
    { row: p.row, col: p.col + 1 },
    { row: p.row + 1, col: p.col },
  ];
  return candidates.filter(inBounds);
}

/**
 * Top-left cells of the 2x2 regions that lie fully on the board and contain `p`:
 * 4 for interior cells, 2 for edge cells, 1 for corner cells. Row-major order.
 */
export function candidateQuads(p: GridPosition): GridPosition[] {
  const result: GridPosition[] = [];
  for (let row = p.row - 1; row <= p.row; row++) {
    for (let col = p.col - 1; col <= p.col; col++) {
      if (isCoordinate(row) && isCoordinate(col) && isCoordinate(row + 1) && isCoordinate(col + 1)) {
        result.push({ row, col });
      }
    }
  }
  return result;
}

function assertQuadTopLeft(topLeft: GridPosition): void {
  if (!isCoordinate(topLeft.row + 1) || !isCoordinate(topLeft.col + 1) || !inBounds(topLeft)) {
    throw new RangeError(`quad top-left (${topLeft.row}, ${topLeft.col}) does not give a 2x2 region on the board`);
  }
}

/**
 * The 4 cells of the 2x2 region whose top-left cell is `topLeft`, in the order TL, TR, BL, BR.
 * @throws RangeError if the region does not lie fully on the board.
 */
export function quadCells(topLeft: GridPosition): [GridPosition, GridPosition, GridPosition, GridPosition] {
  assertQuadTopLeft(topLeft);
  const { row, col } = topLeft;
  return [
    { row, col },
    { row, col: col + 1 },
    { row: row + 1, col },
    { row: row + 1, col: col + 1 },
  ];
}

/**
 * Public identifier of the quad: the notation of its top-left cell (IC-4).
 * @throws RangeError if the region does not lie fully on the board.
 */
export function quadKey(topLeft: GridPosition): QuadKey {
  assertQuadTopLeft(topLeft);
  return toNotation(topLeft);
}

/**
 * The slot (TL, TR, BL, BR) that cell `p` occupies in the quad with top-left `topLeft`.
 * @throws RangeError if `p` is not one of the 4 cells of that quad.
 */
export function slotOf(topLeft: GridPosition, p: GridPosition): Slot {
  const dRow = p.row - topLeft.row;
  const dCol = p.col - topLeft.col;
  if ((dRow !== 0 && dRow !== 1) || (dCol !== 0 && dCol !== 1)) {
    throw new RangeError(
      `slotOf: cell (${p.row}, ${p.col}) is not in the quad with top-left (${topLeft.row}, ${topLeft.col})`,
    );
  }
  if (dRow === 0) return dCol === 0 ? 'TL' : 'TR';
  return dCol === 0 ? 'BL' : 'BR';
}
