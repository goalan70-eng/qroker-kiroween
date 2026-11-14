// Property tests for the board (task 4.2): Properties 6, 7 and 8 of .kiro/specs/qroker-playable-game/design.md.
// Requirements 3.2, 3.3, 3.6, 3.7, 3.8, 3.9.
//
// Each property is ONE test with ONE fc.assert, a fixed seed and 200 runs, so a run is reproducible. On failure
// fast-check prints "seed", the shrunk counterexample and the replay path; every assertion message also carries
// the card count of the board under test.
//
// The oracles below are written independently of board.ts: naive loops over rows and columns, the 4 neighbour
// offsets written out, and an own occupancy reader. They do not call validatePlacement, legalCells, cardCount,
// cellAt or any geometry function. The board layout (row-major, index = row * 8 + col) is the documented
// representation of the design.
//
// Notes on the generator (testing/board-generators.ts): boards come from legal placements of PAIRWISE DISTINCT
// cards, so they hold 4..52 cards. A 64-card board cannot be reached with 52 distinct cards; the 64-card case
// of Property 8 is therefore checked on `fullBoardNonDistinct()`, which repeats cards (occupancy only).
// Property 7's second clause ("for any reachable GameState, cardCount(board) equals placements + 4") needs
// `newGame` and the reducer and is tested with them (task 8.3); here it is checked as "count = 4 + placements"
// along chains of placements.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cardCount, legalCells, placeOnBoard, validatePlacement } from "./board";
import type { Board, PlacedCard } from "./board";
import { ALL_CARDS } from "./cards";
import type { CardId, ErrorCode, GridPosition, Orientation, Owner } from "./types";
import {
  arbBoard,
  arbBoardWithCount,
  deterministicBoard,
  fullBoardNonDistinct,
} from "./testing/board-generators";
import { arbCard } from "./testing/card-generators";

const NUM_RUNS = 200;
const SEED_P6 = 20260406;
const SEED_P7 = 20260407;
const SEED_P8 = 20260408;

const OWNERS: readonly Owner[] = ["P0", "P1", "P2", "P3", "NEUTRAL"];

// ---------------------------------------------------------------------------------------------------------
// Independent oracles
// ---------------------------------------------------------------------------------------------------------

/** Occupancy of an in-range cell, read straight from the 64-entry array. */
function occupied(board: Board, row: number, col: number): boolean {
  return board[row * 8 + col] !== null;
}

/** Naive card count: loop over all 64 entries. */
function countCards(board: Board): number {
  let n = 0;
  for (let i = 0; i < 64; i++) if (board[i] !== null) n++;
  return n;
}

function isIndex(v: number): boolean {
  return Number.isInteger(v) && v >= 0 && v <= 7;
}

function hasOccupiedNeighbour(board: Board, row: number, col: number): boolean {
  const offsets: readonly (readonly [number, number])[] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dr, dc] of offsets) {
    const r = row + dr;
    const c = col + dc;
    if (isIndex(r) && isIndex(c) && occupied(board, r, c)) return true;
  }
  return false;
}

type Verdict = "OK" | ErrorCode;

/** Orientation, then bounds, then occupied, then adjacency, in this precedence. */
function oracleVerdict(board: Board, row: number, col: number, orientation: number): Verdict {
  if (!(orientation === 0 || orientation === 180)) return "INVALID_ORIENTATION";
  if (!isIndex(row) || !isIndex(col)) return "OUT_OF_BOUNDS";
  if (occupied(board, row, col)) return "OCCUPIED";
  if (!hasOccupiedNeighbour(board, row, col)) return "NOT_ADJACENT";
  return "OK";
}

/** Empty cells with an occupied orthogonal neighbour, row-major. */
function naiveLegal(board: Board): GridPosition[] {
  const out: GridPosition[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (!occupied(board, row, col) && hasOccupiedNeighbour(board, row, col)) out.push({ row, col });
    }
  }
  return out;
}

const keyOf = (p: GridPosition): string => `${p.row},${p.col}`;

/** Cards of the board in cell order. */
function cardsOf(board: Board): CardId[] {
  const out: CardId[] = [];
  for (let i = 0; i < 64; i++) {
    const cell = board[i];
    if (cell !== null && cell !== undefined) out.push(cell.card);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Property 6
// ---------------------------------------------------------------------------------------------------------

/** Row or column: mostly on the board, often just outside it, sometimes a non-integer or non-finite value. */
const arbCoordinate: fc.Arbitrary<number> = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: 0, max: 7 }) },
  { weight: 3, arbitrary: fc.integer({ min: -3, max: 11 }) },
  { weight: 1, arbitrary: fc.constantFrom(0.5, 7.5, -0.5, 3.0000001, Number.NaN, Number.POSITIVE_INFINITY, -1e9) },
);

/** Orientation: mostly 0 and 180, then the other quarter turns and arbitrary numbers. */
const arbOrientation: fc.Arbitrary<number> = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom(0, 180) },
  { weight: 2, arbitrary: fc.constantFrom(90, 270, -90, 360, 1, -0, Number.NaN, 0.5) },
  { weight: 1, arbitrary: fc.integer({ min: -720, max: 720 }) },
  { weight: 1, arbitrary: fc.double({ noNaN: true }) },
);

describe("Property 6: Placement validation completeness and board immutability", () => {
  it("accepts a placement exactly when the oracle does, reports the first failing code, and never changes the input board", () => {
    // Feature: qroker-playable-game, Property 6: Placement validation completeness and board immutability
    const tally = new Map<Verdict, number>();
    const sizes = new Set<number>();

    fc.assert(
      fc.property(
        arbBoard,
        arbCoordinate,
        arbCoordinate,
        arbOrientation,
        arbCard,
        fc.constantFrom(...OWNERS),
        (board, row, col, orientation, card, owner) => {
          const n = countCards(board);
          sizes.add(n);
          const where = `cards=${n} pos=(${String(row)},${String(col)}) orientation=${String(orientation)}`;
          const pos: GridPosition = { row, col };
          const expected = oracleVerdict(board, row, col, orientation);
          tally.set(expected, (tally.get(expected) ?? 0) + 1);

          const snapshot = structuredClone(board) as Board;
          const refs = [...board];

          // validatePlacement agrees with the oracle: success, and the error code by precedence.
          const verdict = validatePlacement(board, pos, orientation);
          expect(verdict.ok, `${where}: ok (oracle ${expected})`).toBe(expected === "OK");
          if (!verdict.ok) expect(verdict.error.code, `${where}: code`).toBe(expected);

          // placeOnBoard gives the same verdict.
          const pc: PlacedCard = { card, orientation: orientation as Orientation, owner };
          const placed = placeOnBoard(board, pos, pc);
          expect(placed.ok, `${where}: placeOnBoard ok (oracle ${expected})`).toBe(expected === "OK");

          // The input board is never modified: same length, same entries (deep and by reference), same object.
          expect(board, `${where}: input board deep-equal to its snapshot`).toEqual(snapshot);
          expect(board.length, `${where}: length`).toBe(64);
          for (let i = 0; i < 64; i++) expect(board[i] === refs[i], `${where}: entry ${i} same reference`).toBe(true);

          if (placed.ok) {
            const next = placed.value;
            expect(next, `${where}: new board object`).not.toBe(board);
            expect(next.length, `${where}: new board length`).toBe(64);
            const target = row * 8 + col;
            for (let i = 0; i < 64; i++) {
              if (i === target) continue;
              expect(next[i], `${where}: cell ${i} unchanged`).toEqual(snapshot[i]);
            }
            expect(next[target], `${where}: target cell`).toEqual({
              card,
              orientation: orientation === 180 ? 180 : 0,
              owner,
            });
            expect(countCards(next), `${where}: count`).toBe(n + 1);
          } else {
            expect(placed.error.code, `${where}: placeOnBoard code`).toBe(expected);
          }
        },
      ),
      { seed: SEED_P6, numRuns: NUM_RUNS },
    );

    // The generators reach the success case and every error code (the run is not vacuous).
    for (const v of ["OK", "INVALID_ORIENTATION", "OUT_OF_BOUNDS", "OCCUPIED", "NOT_ADJACENT"] as const) {
      expect(tally.get(v) ?? 0, `verdict ${v} was generated`).toBeGreaterThan(0);
    }
    expect(Math.min(...sizes)).toBeLessThanOrEqual(8);
    expect(Math.max(...sizes)).toBeGreaterThanOrEqual(40);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Property 7
// ---------------------------------------------------------------------------------------------------------

const arbChainStep = fc.record({
  cellPick: fc.nat({ max: 63 }),
  cardPick: fc.nat({ max: 51 }),
  flip: fc.boolean(),
  owner: fc.constantFrom(...OWNERS),
});

describe("Property 7: Board card count increases by one", () => {
  it("raises the card count by exactly 1 per successful placement and keeps every earlier card, orientation and owner", () => {
    // Feature: qroker-playable-game, Property 7: Board card count increases by one
    let placements = 0;
    let reachedFull = 0;
    let skippedFull = 0;

    fc.assert(
      fc.property(arbBoard, fc.array(arbChainStep, { minLength: 1, maxLength: 4 }), (start, steps) => {
        let board = start;
        const startCount = countCards(start);
        let done = 0;

        for (const step of steps) {
          const before = countCards(board);
          const where = `startCards=${startCount} cards=${before} step=${done}`;
          const beforeCards = cardsOf(board);
          const snapshot = structuredClone(board) as Board;

          // A card that is not on the board yet. When all 52 are placed there is none: skip.
          const used = new Set(beforeCards);
          const remaining = ALL_CARDS.filter((c) => !used.has(c));
          if (remaining.length === 0) {
            expect(before, `${where}: 52 cards on the board`).toBe(52);
            skippedFull++;
            break;
          }
          const legal = naiveLegal(board);
          // Non-empty because fewer than 64 cards are on the board.
          expect(legal.length, `${where}: a legal cell exists`).toBeGreaterThan(0);

          const card = remaining[step.cardPick % remaining.length] as CardId;
          const pos = legal[step.cellPick % legal.length] as GridPosition;
          const pc: PlacedCard = { card, orientation: step.flip ? 180 : 0, owner: step.owner };
          const r = placeOnBoard(board, pos, pc);
          expect(r.ok, `${where}: placement at (${pos.row},${pos.col}) succeeds`).toBe(true);
          if (!r.ok) return;
          const next = r.value;
          placements++;
          done++;

          // Count + 1, counted independently.
          expect(countCards(next), `${where}: count after`).toBe(before + 1);

          // Every earlier card keeps its cell, orientation and owner; the new card is where it was put.
          for (let i = 0; i < 64; i++) {
            if (i === pos.row * 8 + pos.col) continue;
            expect(next[i], `${where}: cell ${i} preserved`).toEqual(snapshot[i]);
          }
          expect(next[pos.row * 8 + pos.col], `${where}: new cell`).toEqual(pc);

          // No card is duplicated or removed: the cards after are the cards before plus the new one.
          const afterCards = cardsOf(next);
          expect(afterCards.length, `${where}: card list length`).toBe(before + 1);
          expect(new Set(afterCards).size, `${where}: all cards distinct`).toBe(before + 1);
          expect([...afterCards].sort(), `${where}: cards before + new card`).toEqual([...beforeCards, card].sort());

          // The input of the step is untouched.
          expect(board, `${where}: input unchanged`).toEqual(snapshot);
          board = next;
        }

        // Count = starting count + number of successful placements, along the whole chain.
        expect(countCards(board), `startCards=${startCount}: chain count`).toBe(startCount + done);
        if (countCards(board) === 52) reachedFull++;
      }),
      { seed: SEED_P7, numRuns: NUM_RUNS },
    );

    expect(placements, "placements were made").toBeGreaterThan(0);
    expect(reachedFull, "boards reached 52 cards").toBeGreaterThan(0);
    expect(skippedFull, "52-card boards were met").toBeGreaterThan(0);

    // From the starting 2x2 (4 cards) with n successful placements the board holds 4 + n cards.
    const four = deterministicBoard(4);
    expect(countCards(four)).toBe(4);
    let b = four;
    for (let k = 1; k <= 48; k++) {
      const card = ALL_CARDS[3 + k] as CardId;
      const pos = naiveLegal(b)[0] as GridPosition;
      const r = placeOnBoard(b, pos, { card, orientation: 0, owner: "P0" });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      b = r.value;
      expect(countCards(b), `after ${k} placements`).toBe(4 + k);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// Property 8
// ---------------------------------------------------------------------------------------------------------

/** Checks Property 8 on one board. `label` names the source in failure messages. */
function checkLegalCells(board: Board, label: string): void {
  const n = countCards(board);
  const where = `${label} cards=${n}`;
  const actual = legalCells(board);
  const expected = naiveLegal(board);

  // Same cells, same (row-major) order.
  expect(actual.map(keyOf), `${where}: legalCells`).toEqual(expected.map(keyOf));
  // No duplicates.
  expect(new Set(actual.map(keyOf)).size, `${where}: no duplicates`).toBe(actual.length);
  // Non-empty whenever fewer than 64 cards; empty on a full board.
  if (n < 64) expect(actual.length, `${where}: non-empty below 64 cards`).toBeGreaterThan(0);
  else expect(actual, `${where}: empty on a full board`).toEqual([]);

  // Every listed cell passes validatePlacement; every other in-bounds cell fails (orientation 0).
  const listed = new Set(actual.map(keyOf));
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const v = validatePlacement(board, { row, col }, 0);
      if (listed.has(`${row},${col}`)) {
        expect(v.ok, `${where}: (${row},${col}) listed and valid`).toBe(true);
      } else {
        expect(v.ok, `${where}: (${row},${col}) not listed so invalid`).toBe(false);
        if (!v.ok) {
          expect(v.error.code, `${where}: (${row},${col}) code`).toBe(occupied(board, row, col) ? "OCCUPIED" : "NOT_ADJACENT");
        }
      }
    }
  }
}

describe("Property 8: Legal cell enumeration", () => {
  it("lists exactly the empty cells next to a card, in row-major order, on every board including 51 and 52 cards", () => {
    // Feature: qroker-playable-game, Property 8: Legal cell enumeration
    const sizes = new Map<number, number>();

    fc.assert(
      fc.property(
        fc.oneof(
          { weight: 3, arbitrary: arbBoard },
          { weight: 1, arbitrary: arbBoardWithCount(51) },
          { weight: 1, arbitrary: arbBoardWithCount(52) },
        ),
        (board) => {
          const n = countCards(board);
          sizes.set(n, (sizes.get(n) ?? 0) + 1);
          checkLegalCells(board, "generated");
        },
      ),
      { seed: SEED_P8, numRuns: NUM_RUNS },
    );

    // The run covered the size range, including exactly 51 and 52 cards.
    expect(sizes.get(51) ?? 0, "51-card boards generated").toBeGreaterThan(0);
    expect(sizes.get(52) ?? 0, "52-card boards generated").toBeGreaterThan(0);
    expect(Math.min(...sizes.keys())).toBeLessThanOrEqual(8);

    // Explicit deterministic boards at the deck-exhaustion end: 51 and 52 cards, and the full 64-card board.
    checkLegalCells(deterministicBoard(51), "deterministic");
    checkLegalCells(deterministicBoard(52), "deterministic");
    const full = fullBoardNonDistinct();
    expect(countCards(full)).toBe(64);
    checkLegalCells(full, "full 64-card board");
    expect(legalCells(full)).toEqual([]);
  });
});
