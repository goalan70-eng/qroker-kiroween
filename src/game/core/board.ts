/**
 * Board and PlacementValidator of the QRoker game engine.
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "Board and PlacementValidator (`core/board.ts`)".
 * Requirements: 3.1 (8x8 grid, 0-based coordinates), 3.2 and 3.3 (placement validation and error codes),
 * 3.5 (no swap/move/remove), 3.6 (rejected placement leaves the input unchanged), 3.8 (legal cell list).
 *
 * Representation:
 * - A `Board` is a readonly, frozen array of exactly 64 entries in row-major order,
 *   `index = row * 8 + col` (row 0 is the top row "1", col 0 is column "A"; D4 is `{row:3,col:3}`).
 * - Each entry is `null` (empty) or a frozen `PlacedCard` `{ card, orientation, owner }`.
 * - Every function returns new frozen values and never mutates its input. A placed card is never
 *   moved, replaced or removed: this module has no swap, move or remove function (Requirement 3.5).
 *
 * Validation precedence of `validatePlacement` (design.md): `INVALID_ORIENTATION`, then `OUT_OF_BOUNDS`,
 * then `OCCUPIED`, then `NOT_ADJACENT`. Adjacency is orthogonal only; a diagonal neighbor does not count.
 * Only the orientations 0 and 180 are accepted (`-0` compares equal to 0 and is accepted; it is stored
 * as `0`). Any other value, including 90, 270, `NaN`, strings and non-numbers, is `INVALID_ORIENTATION`.
 * The orientation check works on arbitrary runtime input (the parameter type is `number` by design, but
 * values from a UI, a save file or a test may be anything).
 *
 * Starting group (provisional, OQ-2): the four Neutral_Cards go on D4, E4, D5, E5 at orientation 0 with
 * owner `NEUTRAL`. `initialBoard` builds that group. The design assigns this step to `newGame`
 * (task 8.1); the helper lives here so that the board contents are defined in one place. OQ-2 is a
 * PROVISIONAL default and may change.
 *
 * Information visibility is NOT decided here (OQ-1). The board stores the real card of every cell. Which
 * identities a viewer may see is decided by the view layer (`core/view.ts`, task 9).
 *
 * This module does not compute scores, does not detect Composite Codes, and does not import the deck,
 * state or engine modules. Pure and deterministic: no DOM, no node:*, no Math.random / Date / crypto,
 * no import from src/optical.
 */

import { BOARD_SIZE, candidateQuads, inBounds, orthogonalNeighbors } from './geometry';
import type { CardId, GridPosition, Orientation, Owner, Result } from './types';

/** One occupied cell. Always frozen when it is stored in a `Board`. */
export interface PlacedCard {
  readonly card: CardId;
  readonly orientation: Orientation;
  readonly owner: Owner;
}

/** 64 entries, row-major, `index = row * 8 + col`; `null` is an empty cell. Frozen at runtime. */
export type Board = readonly (PlacedCard | null)[];

/** Number of cells on the board (8 x 8). */
const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

/**
 * The starting group cells in the order of `Deal.neutral` (design.md, Deck): D4, E4, D5, E5.
 * Zero-based positions.
 */
export const STARTING_POSITIONS: readonly GridPosition[] = Object.freeze([
  Object.freeze({ row: 3, col: 3 }), // D4
  Object.freeze({ row: 3, col: 4 }), // E4
  Object.freeze({ row: 4, col: 3 }), // D5
  Object.freeze({ row: 4, col: 4 }), // E5
]);

function indexOf(p: GridPosition): number {
  return p.row * BOARD_SIZE + p.col;
}

function freezeBoard(cells: (PlacedCard | null)[]): Board {
  return Object.freeze(cells);
}

function freezeCell(pc: PlacedCard): PlacedCard {
  // Normalize the orientation so that `-0` is never stored.
  const orientation: Orientation = pc.orientation === 180 ? 180 : 0;
  return Object.freeze({ card: pc.card, orientation, owner: pc.owner });
}

/** A new, frozen board with 64 empty cells. */
export function emptyBoard(): Board {
  return freezeBoard(new Array<PlacedCard | null>(CELL_COUNT).fill(null));
}

/**
 * The starting board: the four Neutral_Cards on D4, E4, D5, E5 (in this order) at orientation 0 with
 * owner `NEUTRAL`. PROVISIONAL default for OQ-2 (orientation 0 and owner NEUTRAL); see the module comment.
 */
export function initialBoard(neutral: readonly [CardId, CardId, CardId, CardId]): Board {
  const cells = new Array<PlacedCard | null>(CELL_COUNT).fill(null);
  STARTING_POSITIONS.forEach((pos, i) => {
    cells[indexOf(pos)] = freezeCell({ card: neutral[i] as CardId, orientation: 0, owner: 'NEUTRAL' });
  });
  return freezeBoard(cells);
}

/** The card at `p`, or `null` when the cell is empty or `p` is outside the board. */
export function cellAt(b: Board, p: GridPosition): PlacedCard | null {
  if (!inBounds(p)) return null;
  return b[indexOf(p)] ?? null;
}

/** Number of occupied cells. */
export function cardCount(b: Board): number {
  let n = 0;
  for (const cell of b) {
    if (cell !== null) n++;
  }
  return n;
}

function hasOccupiedNeighbor(b: Board, p: GridPosition): boolean {
  return orthogonalNeighbors(p).some((q) => b[indexOf(q)] != null);
}

function fail(code: 'INVALID_ORIENTATION' | 'OUT_OF_BOUNDS' | 'OCCUPIED' | 'NOT_ADJACENT', detail: string): Result<never> {
  return { ok: false, error: { code, detail } };
}

/**
 * Validates a placement without changing anything. Precedence of the error codes:
 * `INVALID_ORIENTATION`, `OUT_OF_BOUNDS`, `OCCUPIED`, `NOT_ADJACENT` (Requirements 3.2, 3.3).
 *
 * `orientation` is typed `number` as in the design, but any runtime value is accepted as input; only the
 * numbers 0 and 180 pass.
 */
export function validatePlacement(b: Board, pos: GridPosition, orientation: number): Result<true> {
  if (orientation !== 0 && orientation !== 180) {
    return fail('INVALID_ORIENTATION', `orientation must be 0 or 180, got ${String(orientation)}`);
  }
  if (!inBounds(pos)) {
    return fail('OUT_OF_BOUNDS', `cell (${String(pos.row)}, ${String(pos.col)}) is outside the board`);
  }
  if (b[indexOf(pos)] != null) {
    return fail('OCCUPIED', `cell (${pos.row}, ${pos.col}) already holds a card`);
  }
  if (!hasOccupiedNeighbor(b, pos)) {
    return fail('NOT_ADJACENT', `cell (${pos.row}, ${pos.col}) has no orthogonal neighbor card`);
  }
  return { ok: true, value: true };
}

/**
 * Validates and places `pc` at `pos`. On success returns a NEW frozen board (the input is untouched and
 * every other cell keeps the same object); on failure returns the validation error and creates nothing.
 * The stored cell is a frozen copy of `pc`.
 *
 * Design choice: the result carries only the board (design.md `Result<Board>`). The 2x2 regions affected
 * by the placement are available from `affectedQuads(pos)`, which the engine passes to the detector.
 */
export function placeOnBoard(b: Board, pos: GridPosition, pc: PlacedCard): Result<Board> {
  const valid = validatePlacement(b, pos, pc.orientation);
  if (!valid.ok) return valid;
  const cells = b.slice();
  cells[indexOf(pos)] = freezeCell(pc);
  return { ok: true, value: freezeBoard(cells) };
}

/**
 * Top-left cells of the in-bounds 2x2 regions that contain `pos` (1 to 4 of them, row-major). A thin
 * delegate to `geometry.candidateQuads`: these are the only regions a placement at `pos` can complete.
 */
export function affectedQuads(pos: GridPosition): GridPosition[] {
  return candidateQuads(pos);
}

/**
 * All empty cells that have an orthogonally adjacent occupied cell, in row-major order. Equals
 * `{ p : validatePlacement(b, p, 0).ok }`. An empty board and a full board give an empty list.
 */
export function legalCells(b: Board): GridPosition[] {
  const result: GridPosition[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const p = { row, col };
      if (b[indexOf(p)] == null && hasOccupiedNeighbor(b, p)) result.push(p);
    }
  }
  return result;
}
