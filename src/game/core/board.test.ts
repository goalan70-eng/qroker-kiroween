// Unit tests for core/board.ts (task 4.1). Requirements 3.1, 3.2, 3.3, 3.5, 3.6, 3.8.
//
// Expected values are written as literals or computed here with naive code that does not use the
// module's helpers (no geometry import): cell notation is converted by a local function and adjacency is
// computed with explicit coordinate differences.
//
// Not decided here: card identity visibility (OQ-1) and the starting-group orientation/owner (OQ-2,
// provisional: orientation 0, owner NEUTRAL). The tests only check what board.ts stores.

import { describe, expect, it } from "vitest";
import {
  affectedQuads,
  cardCount,
  cellAt,
  emptyBoard,
  initialBoard,
  legalCells,
  placeOnBoard,
  STARTING_POSITIONS,
  validatePlacement,
  type Board,
  type PlacedCard,
} from "./board";
import type { CardId, ErrorCode, GridPosition, Owner } from "./types";

// ---------------------------------------------------------------------------------------------
// Local helpers (independent of the module under test)
// ---------------------------------------------------------------------------------------------

const NEUTRAL_CARDS: readonly [CardId, CardId, CardId, CardId] = ["H-A", "D-2", "C-3", "S-4"];

/** 'D4' -> { row: 3, col: 3 } */
function at(notation: string): GridPosition {
  return { row: Number(notation.slice(1)) - 1, col: notation.charCodeAt(0) - 65 };
}

/** { row: 3, col: 3 } -> 'D4' */
function note(p: GridPosition): string {
  return `${String.fromCharCode(65 + p.col)}${p.row + 1}`;
}

function pc(card: CardId = "H-7", orientation: 0 | 180 = 0, owner: Owner = "P0"): PlacedCard {
  return { card, orientation, owner };
}

function errorCode(r: { ok: boolean; error?: { code: ErrorCode } }): ErrorCode | "OK" {
  return r.ok ? "OK" : (r.error as { code: ErrorCode }).code;
}

function validate(b: Board, p: GridPosition, o: unknown): ErrorCode | "OK" {
  return errorCode(validatePlacement(b, p, o as number));
}

function start(): Board {
  return initialBoard(NEUTRAL_CARDS);
}

function place(b: Board, notation: string, card: CardId = "H-7", orientation: 0 | 180 = 0): Board {
  const r = placeOnBoard(b, at(notation), pc(card, orientation));
  if (!r.ok) throw new Error(`placement at ${notation} rejected: ${r.error.code}`);
  return r.value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as object)) deepFreeze(v);
  }
  return value;
}

/** Naive reference: occupied cell coordinates as strings, independent of the module. */
function occupied(b: Board): Set<string> {
  const s = new Set<string>();
  b.forEach((cell, i) => {
    if (cell !== null) s.add(`${Math.floor(i / 8)},${i % 8}`);
  });
  return s;
}

/** Naive reference for "empty and orthogonally adjacent to an occupied cell". */
function naiveLegal(b: Board): string[] {
  const occ = occupied(b);
  const out: string[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (occ.has(`${row},${col}`)) continue;
      const adjacent =
        occ.has(`${row - 1},${col}`) || occ.has(`${row + 1},${col}`) || occ.has(`${row},${col - 1}`) || occ.has(`${row},${col + 1}`);
      if (adjacent) out.push(note({ row, col }));
    }
  }
  return out;
}

const ALL_CELLS: string[] = [];
for (let row = 1; row <= 8; row++) for (const col of "ABCDEFGH") ALL_CELLS.push(`${col}${row}`);

// ---------------------------------------------------------------------------------------------
// Representation
// ---------------------------------------------------------------------------------------------

describe("board representation", () => {
  it("emptyBoard is a frozen 64-element array of nulls, new on every call", () => {
    const a = emptyBoard();
    expect(a).toHaveLength(64);
    expect(a.every((c) => c === null)).toBe(true);
    expect(Object.isFrozen(a)).toBe(true);
    expect(emptyBoard()).not.toBe(a);
    expect(cardCount(a)).toBe(0);
  });

  it("initialBoard holds the 4 neutral cards on D4, E4, D5, E5 at orientation 0, owner NEUTRAL", () => {
    const b = start();
    expect(b).toHaveLength(64);
    expect(cardCount(b)).toBe(4);
    expect(Object.isFrozen(b)).toBe(true);
    expect(STARTING_POSITIONS.map(note)).toEqual(["D4", "E4", "D5", "E5"]);
    // Row-major index = row * 8 + col, checked with literal indexes: D4 = 27, E4 = 28, D5 = 35, E5 = 36.
    expect(b[27]).toEqual({ card: "H-A", orientation: 0, owner: "NEUTRAL" });
    expect(b[28]).toEqual({ card: "D-2", orientation: 0, owner: "NEUTRAL" });
    expect(b[35]).toEqual({ card: "C-3", orientation: 0, owner: "NEUTRAL" });
    expect(b[36]).toEqual({ card: "S-4", orientation: 0, owner: "NEUTRAL" });
    expect(b.filter((c) => c !== null)).toHaveLength(4);
    for (const cell of b) if (cell !== null) expect(Object.isFrozen(cell)).toBe(true);
  });

  it("cellAt reads by 0-based position and returns null for empty or out-of-bounds cells", () => {
    const b = start();
    expect(cellAt(b, { row: 3, col: 3 })?.card).toBe("H-A");
    expect(cellAt(b, at("E5"))?.card).toBe("S-4");
    expect(cellAt(b, at("A1"))).toBeNull();
    expect(cellAt(b, { row: -1, col: 0 })).toBeNull();
    expect(cellAt(b, { row: 0, col: 8 })).toBeNull();
    expect(cellAt(b, { row: 1.5, col: 1 })).toBeNull();
  });

  it("mutation attempts on a board or a cell are rejected in strict mode", () => {
    const b = start() as unknown as (PlacedCard | null)[];
    expect(() => {
      b[0] = pc();
    }).toThrow(TypeError);
    expect(() => b.push(null)).toThrow(TypeError);
    expect(() => {
      (b[27] as { orientation: number }).orientation = 180;
    }).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------------------------
// Validation: each error code
// ---------------------------------------------------------------------------------------------

describe("validatePlacement error codes", () => {
  const b = start();

  it("accepts an adjacent empty cell with orientation 0 and 180", () => {
    expect(validate(b, at("C4"), 0)).toBe("OK");
    expect(validate(b, at("C4"), 180)).toBe("OK");
    const r = validatePlacement(b, at("C4"), 0);
    expect(r).toEqual({ ok: true, value: true });
  });

  it("INVALID_ORIENTATION for 90, 270 and other numbers", () => {
    for (const o of [90, 270, 45, 360, -180, 1, 180.5, Infinity, -Infinity, NaN]) {
      expect(validate(b, at("C4"), o), `orientation ${o}`).toBe("INVALID_ORIENTATION");
    }
  });

  it("INVALID_ORIENTATION for non-number runtime values", () => {
    for (const o of ["0", "180", "", null, undefined, true, false, [], [0], {}, 0n, 180n]) {
      expect(validate(b, at("C4"), o), `orientation ${String(o)}`).toBe("INVALID_ORIENTATION");
    }
  });

  it("-0 equals 0 and is accepted; the stored orientation is +0", () => {
    expect(validate(b, at("C4"), -0)).toBe("OK");
    const r = placeOnBoard(b, at("C4"), { card: "H-7", orientation: -0 as 0, owner: "P0" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.is(cellAt(r.value, at("C4"))?.orientation, 0)).toBe(true);
  });

  it("OUT_OF_BOUNDS for cells outside A1-H8, including non-integer and NaN coordinates", () => {
    const bad: GridPosition[] = [
      { row: -1, col: 3 },
      { row: 8, col: 3 },
      { row: 3, col: -1 },
      { row: 3, col: 8 },
      { row: -1, col: -1 },
      { row: 8, col: 8 },
      { row: 3.5, col: 3 },
      { row: 3, col: Number.NaN },
      { row: Infinity, col: 3 },
    ];
    for (const p of bad) expect(validate(b, p, 0), `${p.row},${p.col}`).toBe("OUT_OF_BOUNDS");
  });

  it("OCCUPIED for each of the four starting cells and for a later placed cell", () => {
    for (const n of ["D4", "E4", "D5", "E5"]) expect(validate(b, at(n), 0), n).toBe("OCCUPIED");
    const b2 = place(b, "C4");
    expect(validate(b2, at("C4"), 180)).toBe("OCCUPIED");
  });

  it("NOT_ADJACENT for empty cells without an orthogonal neighbor", () => {
    expect(validate(b, at("A1"), 0)).toBe("NOT_ADJACENT");
    expect(validate(b, at("H8"), 0)).toBe("NOT_ADJACENT");
    expect(validate(b, at("D2"), 0)).toBe("NOT_ADJACENT");
    expect(validate(b, at("C3"), 0)).toBe("NOT_ADJACENT"); // diagonal of D4
    expect(validate(b, at("F6"), 0)).toBe("NOT_ADJACENT"); // diagonal of E5
    expect(validate(b, at("F3"), 0)).toBe("NOT_ADJACENT"); // diagonal of E4
    expect(validate(b, at("C6"), 0)).toBe("NOT_ADJACENT"); // diagonal of D5
  });

  it("on an empty board every cell is NOT_ADJACENT", () => {
    const e = emptyBoard();
    for (const n of ALL_CELLS) expect(validate(e, at(n), 0), n).toBe("NOT_ADJACENT");
    expect(legalCells(e)).toEqual([]);
  });

  it("precedence: invalid orientation beats out of bounds, occupied and not adjacent", () => {
    expect(validate(b, { row: -1, col: 0 }, 90)).toBe("INVALID_ORIENTATION"); // + out of bounds
    expect(validate(b, at("D4"), 90)).toBe("INVALID_ORIENTATION"); // + occupied
    expect(validate(b, at("A1"), 270)).toBe("INVALID_ORIENTATION"); // + not adjacent
    expect(validate(b, { row: 9, col: 9 }, "180")).toBe("INVALID_ORIENTATION");
  });

  it("precedence: out of bounds beats occupied and not adjacent", () => {
    // Out-of-bounds cells have no board entry, so only the not-adjacent check could compete; the code
    // must still be OUT_OF_BOUNDS, also for cells next to the board edge that has placed cards.
    let edge = start();
    edge = place(edge, "E3");
    edge = place(edge, "E2");
    edge = place(edge, "E1");
    expect(validate(edge, { row: -1, col: 4 }, 0)).toBe("OUT_OF_BOUNDS"); // above E1, adjacent in a sense
    expect(validate(b, { row: 3, col: 8 }, 0)).toBe("OUT_OF_BOUNDS");
    expect(validate(b, { row: 0, col: -1 }, 0)).toBe("OUT_OF_BOUNDS");
  });

  it("precedence: occupied beats not adjacent", () => {
    // A single card with no neighbor: its own cell is occupied and has no occupied neighbor.
    // Built by hand, because placing on an empty board is NOT_ADJACENT.
    const cells = emptyBoard().slice();
    cells[0] = pc();
    const loneBoard = Object.freeze(cells) as Board;
    expect(validate(loneBoard, at("A1"), 0)).toBe("OCCUPIED");
  });

  it("validatePlacement does not mutate a deep-frozen board and returns the same result twice", () => {
    const frozen = deepFreeze(start());
    const before = JSON.stringify(frozen);
    const r1 = validatePlacement(frozen, at("C4"), 0);
    const r2 = validatePlacement(frozen, at("C4"), 0);
    expect(r1).toEqual(r2);
    expect(validate(frozen, at("A1"), 0)).toBe("NOT_ADJACENT");
    expect(JSON.stringify(frozen)).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------
// Adjacency on the starting board
// ---------------------------------------------------------------------------------------------

describe("starting group adjacency", () => {
  const ADJACENT = ["C4", "C5", "F4", "F5", "D3", "E3", "D6", "E6"];

  it("accepts exactly the 8 cells orthogonally adjacent to the starting 2x2", () => {
    const b = start();
    for (const n of ADJACENT) expect(validate(b, at(n), 0), n).toBe("OK");
  });

  it("rejects every other empty cell (52 - 8 = 48 cells) as NOT_ADJACENT", () => {
    const b = start();
    const startCells = new Set(["D4", "E4", "D5", "E5"]);
    const rejected = ALL_CELLS.filter((n) => !startCells.has(n) && !ADJACENT.includes(n));
    expect(rejected).toHaveLength(64 - 4 - 8);
    for (const n of rejected) expect(validate(b, at(n), 0), n).toBe("NOT_ADJACENT");
  });

  it("agrees with a naive adjacency computation for every cell and both orientations", () => {
    const b = start();
    const legal = new Set(naiveLegal(b));
    for (const n of ALL_CELLS) {
      const expected = b[at(n).row * 8 + at(n).col] !== null ? "OCCUPIED" : legal.has(n) ? "OK" : "NOT_ADJACENT";
      expect(validate(b, at(n), 0), n).toBe(expected);
      expect(validate(b, at(n), 180), n).toBe(expected);
    }
  });

  it("corner, edge and central cells follow the same rule after a chain reaches them", () => {
    // Build a chain from D4 to the top-left corner: C4, B4, A4, A3, A2, A1.
    let b = start();
    expect(validate(b, at("A1"), 0)).toBe("NOT_ADJACENT");
    for (const n of ["C4", "B4", "A4", "A3", "A2"]) b = place(b, n);
    expect(validate(b, at("A1"), 0)).toBe("OK"); // corner, one neighbor (A2)
    expect(validate(b, at("B1"), 0)).toBe("NOT_ADJACENT"); // diagonal of A2 only
    expect(validate(b, at("B2"), 0)).toBe("OK"); // interior-ish, neighbor A2
    expect(validate(b, at("B3"), 0)).toBe("OK"); // neighbors A3 and B4
    b = place(b, "A1");
    expect(cellAt(b, at("A1"))?.card).toBe("H-7");
    expect(validate(b, at("B1"), 0)).toBe("OK"); // now adjacent to A1
  });
});

// ---------------------------------------------------------------------------------------------
// placeOnBoard
// ---------------------------------------------------------------------------------------------

describe("placeOnBoard", () => {
  it("returns a NEW frozen board and leaves the input unchanged", () => {
    const b = start();
    const before = [...b];
    const r = placeOnBoard(b, at("C4"), pc("S-K", 180, "P2"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).not.toBe(b);
    expect(Object.isFrozen(r.value)).toBe(true);
    expect(r.value).toHaveLength(64);
    expect(cellAt(r.value, at("C4"))).toEqual({ card: "S-K", orientation: 180, owner: "P2" });
    expect(Object.isFrozen(cellAt(r.value, at("C4")))).toBe(true);
    expect(cardCount(r.value)).toBe(5);
    expect(cardCount(b)).toBe(4);
    expect([...b]).toEqual(before);
    expect(cellAt(b, at("C4"))).toBeNull();
  });

  it("stores a copy of the PlacedCard, not the caller's object", () => {
    const mine: PlacedCard = { card: "H-7", orientation: 0, owner: "P1" };
    const r = placeOnBoard(start(), at("C4"), mine);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(cellAt(r.value, at("C4"))).not.toBe(mine);
    expect(Object.isFrozen(mine)).toBe(false);
  });

  it("failed placements return the error code, create no board and leave the input identical", () => {
    const b = start();
    const snapshot = [...b];
    const cases: [GridPosition, number, ErrorCode][] = [
      [at("C4"), 90, "INVALID_ORIENTATION"],
      [{ row: 8, col: 0 }, 0, "OUT_OF_BOUNDS"],
      [at("D4"), 0, "OCCUPIED"],
      [at("A1"), 0, "NOT_ADJACENT"],
    ];
    for (const [pos, orientation, code] of cases) {
      const r = placeOnBoard(b, pos, { card: "H-7", orientation: orientation as 0, owner: "P0" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe(code);
      expect(b).toHaveLength(64);
      expect([...b]).toEqual(snapshot);
      b.forEach((cell, i) => expect(cell).toBe(snapshot[i]));
    }
  });

  it("works on deep-frozen input boards (successful and failed placements)", () => {
    const frozen = deepFreeze(start());
    const ok = placeOnBoard(frozen, at("D3"), pc());
    expect(ok.ok).toBe(true);
    const bad = placeOnBoard(frozen, at("A1"), pc());
    expect(bad.ok).toBe(false);
    expect(cardCount(frozen)).toBe(4);
  });

  it("increases cardCount by exactly one per placement and keeps every earlier cell unchanged", () => {
    const sequence: [string, CardId, 0 | 180][] = [
      ["C4", "H-2", 0],
      ["B4", "D-3", 180],
      ["B5", "C-4", 0],
      ["B6", "S-5", 180],
      ["C6", "H-6", 0],
      ["F4", "D-7", 180],
      ["F3", "C-8", 0],
    ];
    let b = start();
    const history: { n: string; card: CardId; o: 0 | 180 }[] = [];
    let count = 4;
    for (const [n, card, o] of sequence) {
      const prev = b;
      b = place(b, n, card, o);
      count++;
      history.push({ n, card, o });
      expect(cardCount(b)).toBe(count);
      expect(b).not.toBe(prev);
      // every cell of the previous board is the same object (cards are never moved or replaced)
      prev.forEach((cell, i) => {
        if (cell !== null) expect(b[i]).toBe(cell);
      });
      // exactly one cell differs
      const changed = b.filter((cell, i) => cell !== prev[i]);
      expect(changed).toHaveLength(1);
      // all earlier placements still hold
      for (const h of history) expect(cellAt(b, at(h.n))).toEqual({ card: h.card, orientation: h.o, owner: "P0" });
    }
    expect(["D4", "E4", "D5", "E5"].map((n) => cellAt(b, at(n))?.card)).toEqual(["H-A", "D-2", "C-3", "S-4"]);
  });

  it("a placed cell cannot be overwritten (no swap): placing on it is OCCUPIED", () => {
    const b = place(start(), "C4", "H-2");
    const r = placeOnBoard(b, at("C4"), pc("S-K"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("OCCUPIED");
    expect(cellAt(b, at("C4"))?.card).toBe("H-2");
  });
});

// ---------------------------------------------------------------------------------------------
// affectedQuads
// ---------------------------------------------------------------------------------------------

describe("affectedQuads", () => {
  it("lists the in-bounds 2x2 regions containing the cell, as top-left cells in row-major order", () => {
    expect(affectedQuads(at("D4")).map(note)).toEqual(["C3", "D3", "C4", "D4"]);
    expect(affectedQuads(at("A1")).map(note)).toEqual(["A1"]);
    expect(affectedQuads(at("H8")).map(note)).toEqual(["G7"]);
    expect(affectedQuads(at("A4")).map(note)).toEqual(["A3", "A4"]);
    expect(affectedQuads(at("E8")).map(note)).toEqual(["D7", "E7"]);
  });
});

// ---------------------------------------------------------------------------------------------
// legalCells
// ---------------------------------------------------------------------------------------------

describe("legalCells", () => {
  it("on the starting board returns the 8 adjacent cells in row-major order", () => {
    // Row-major: row 3 (D3, E3), row 4 (C4, F4), row 5 (C5, F5), row 6 (D6, E6)
    expect(legalCells(start()).map(note)).toEqual(["D3", "E3", "C4", "F4", "C5", "F5", "D6", "E6"]);
  });

  it("returns 0-based positions", () => {
    expect(legalCells(start())[0]).toEqual({ row: 2, col: 3 });
  });

  it("is empty for an empty board", () => {
    expect(legalCells(emptyBoard())).toEqual([]);
  });

  it("after chained placements equals the naive computation, in row-major order", () => {
    let b = start();
    const chain = ["C4", "B4", "B3", "C3", "D3", "D6", "E6", "F6", "F5", "F4", "G4"];
    for (const n of chain) {
      b = place(b, n);
      expect(legalCells(b).map(note)).toEqual(naiveLegal(b));
    }
    // Hand-derived from the 15 occupied cells (D4 E4 D5 E5 C4 B4 B3 C3 D3 D6 E6 F6 F5 F4 G4), row-major:
    expect(legalCells(b).map(note)).toEqual([
      "B2", "C2", "D2", "A3", "E3", "F3", "G3", "A4", "H4", "B5", "C5", "G5", "C6", "G6", "D7", "E7", "F7",
    ]);
  });

  it("each listed cell passes validatePlacement and every other cell fails", () => {
    let b = start();
    for (const n of ["C4", "C5", "D6"]) b = place(b, n);
    const legal = new Set(legalCells(b).map(note));
    for (const n of ALL_CELLS) expect(validate(b, at(n), 0) === "OK", n).toBe(legal.has(n));
  });

  it("does not mutate a deep-frozen board", () => {
    const frozen = deepFreeze(start());
    const before = JSON.stringify(frozen);
    legalCells(frozen);
    expect(JSON.stringify(frozen)).toBe(before);
  });

  it("is empty for a full 64-card board, reached by legal placements in several orders", () => {
    const strategies: Record<string, (cells: GridPosition[], step: number) => GridPosition> = {
      first: (cells) => cells[0] as GridPosition,
      last: (cells) => cells[cells.length - 1] as GridPosition,
      pseudoRandom: (cells, step) => cells[(step * 2654435761) % cells.length] as GridPosition,
    };
    for (const [name, pick] of Object.entries(strategies)) {
      let b = start();
      let step = 0;
      for (;;) {
        const cells = legalCells(b);
        if (cells.length === 0) break;
        // at least one legal cell exists while the board is not full (Requirement 3.9)
        expect(cardCount(b), name).toBeLessThan(64);
        const p = pick(cells, step++);
        const r = placeOnBoard(b, p, pc("H-7", step % 2 === 0 ? 0 : 180));
        expect(r.ok, `${name} step ${step}`).toBe(true);
        if (!r.ok) return;
        expect(cardCount(r.value)).toBe(cardCount(b) + 1);
        b = r.value;
      }
      expect(cardCount(b), name).toBe(64);
      expect(step, name).toBe(60);
      expect(legalCells(b), name).toEqual([]);
      for (const n of ALL_CELLS) expect(validate(b, at(n), 0), n).toBe("OCCUPIED");
    }
  });
});
