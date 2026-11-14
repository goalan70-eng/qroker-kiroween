// fast-check arbitraries for Composite_Code detection tests (task 5.2). Test support only: imported by tests,
// never by engine code. Pure and deterministic: no Math.random, clock or crypto; all randomness comes from
// fast-check.
//
// Source: .kiro/specs/qroker-playable-game/design.md, "Testing Strategy > Generators".
//
// Why a dedicated generator: boards from `arbBoard` (random legal placements, random orientation) hold a valid
// code at the just-placed cell only occasionally, and almost never two codes at once. `arbCodeScenario` mixes
//   - "legal" scenarios: an `arbBoard` board plus a cell to examine (realistic, reachable positions), and
//   - "planted" scenarios: a board in which one or two of the 2x2 regions that contain the cell T are built
//     from members that are valid for their slot, sometimes with exactly one member spoiled (a complete but
//     invalid quad), plus random noise cards. Planted boards are NOT claimed to be reachable by legal play
//     (they need not contain the starting group); `detect` only looks at occupancy, card and orientation.
//
// Pairs of regions that can both be valid at once. A card is a valid member in exactly 2 of the 4 slots, and
// every suit prints two corners that lie on a diagonal (H, D) or in one column (C, S), never in one row.
// Hence two regions that contain T and share a column of cells (UL+UR, DL+DR) can never both be valid, and the
// pairs UL+DR, UR+DL, UL+DL and UR+DR can. Only those pairs are planted as doubles.
//
// The generator uses `isValidMember` to choose members. That only steers the hit rate; the properties compare
// `detect` with oracles written inside the test, so a defect in `isValidMember` cannot hide behind it.
// Every card on a generated board is distinct.

import fc from "fast-check";
import { ALL_CARDS } from "../cards";
import { isValidMember } from "../fragment-layout";
import type { Board, PlacedCard } from "../board";
import type { CardId, GridPosition, Orientation, Slot } from "../types";
import { arbBoard } from "./board-generators";

/** A board together with the cell that was "just placed". */
export interface CodeScenario {
  readonly board: Board;
  readonly placedAt: GridPosition;
  /** Which generator branch produced it (for coverage statistics only). */
  readonly kind: "legal" | "planted";
}

const SLOTS: readonly Slot[] = ["TL", "TR", "BL", "BR"];
/** Row and column offsets of TL, TR, BL, BR from the top-left cell of a quad. */
const SLOT_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
];

interface Constraint {
  readonly slot: Slot;
  readonly valid: boolean;
}

interface QuadOrigin {
  readonly row: number;
  readonly col: number;
}

/** The planned quads (1 or 2 top-left cells) for a target cell, chosen by `planPick`. */
function plannedQuads(tRow: number, tCol: number, planPick: number): QuadOrigin[] {
  const ul = { row: tRow - 1, col: tCol - 1 };
  const ur = { row: tRow - 1, col: tCol };
  const dl = { row: tRow, col: tCol - 1 };
  const dr = { row: tRow, col: tCol };
  const inside = (q: QuadOrigin): boolean => q.row >= 0 && q.col >= 0 && q.row <= 6 && q.col <= 6;
  const options: QuadOrigin[][] = [];
  for (const q of [ul, ur, dl, dr]) if (inside(q)) options.push([q]);
  const pairs: [QuadOrigin, QuadOrigin][] = [
    [ul, dr],
    [ur, dl],
    [ul, dl],
    [ur, dr],
  ];
  // Each compatible pair is listed three times so that doubles are more frequent than singles.
  for (const pair of pairs) if (inside(pair[0]) && inside(pair[1])) options.push(pair, pair, pair);
  return options[planPick % options.length] as QuadOrigin[];
}

export interface PlantedSpec {
  readonly tRow: number;
  readonly tCol: number;
  readonly planPick: number;
  readonly spoils: readonly { readonly spoil: number; readonly cell: number }[];
  readonly order: readonly CardId[];
  readonly flips: readonly boolean[];
  readonly noise: readonly { readonly pick: number; readonly flip: boolean }[];
  readonly placedPick: number;
  readonly placedPick2: number;
}

/** Builds a planted scenario from a spec. Deterministic. */
export function buildPlanted(spec: PlantedSpec): CodeScenario {
  const quads = plannedQuads(spec.tRow, spec.tCol, spec.planPick);

  // Constraints per cell index: valid for the slot it has in each planned quad, except one spoiled member.
  const constraints = new Map<number, Constraint[]>();
  quads.forEach((q, qi) => {
    const sp = spec.spoils[qi] ?? { spoil: 9, cell: 0 };
    const spoiled = sp.spoil < 2 ? sp.cell : -1;
    SLOT_OFFSETS.forEach(([dr, dc], i) => {
      const idx = (q.row + dr) * 8 + (q.col + dc);
      const list = constraints.get(idx) ?? [];
      list.push({ slot: SLOTS[i] as Slot, valid: i !== spoiled });
      constraints.set(idx, list);
    });
  });

  const cells: (PlacedCard | null)[] = new Array<PlacedCard | null>(64).fill(null);
  const used = new Set<CardId>();
  let flipIndex = 0;

  const take = (cs: readonly Constraint[], preferFlip: boolean): { card: CardId; orientation: Orientation } => {
    const orientations: Orientation[] = preferFlip ? [180, 0] : [0, 180];
    // Full constraints first, then only the first one, then none (always satisfiable).
    for (const attempt of [cs, cs.slice(0, 1), [] as Constraint[]]) {
      for (const card of spec.order) {
        if (used.has(card)) continue;
        for (const orientation of orientations) {
          if (attempt.every((c) => isValidMember(card, orientation, c.slot) === c.valid)) return { card, orientation };
        }
      }
    }
    throw new Error("buildPlanted: no unused card left");
  };

  for (const [idx, cs] of [...constraints.entries()].sort((a, b) => a[0] - b[0])) {
    const { card, orientation } = take(cs, spec.flips[flipIndex++ % spec.flips.length] ?? false);
    used.add(card);
    cells[idx] = Object.freeze({ card, orientation, owner: "P0" as const });
  }

  // Noise: more cards on random empty cells, random orientation.
  for (const n of spec.noise) {
    const empties: number[] = [];
    for (let i = 0; i < 64; i++) if (cells[i] === null) empties.push(i);
    if (empties.length === 0) break;
    const idx = empties[n.pick % empties.length] as number;
    const card = spec.order.find((c) => !used.has(c));
    if (card === undefined) break;
    used.add(card);
    cells[idx] = Object.freeze({ card, orientation: n.flip ? (180 as const) : (0 as const), owner: "P0" as const });
  }

  const board: Board = Object.freeze(cells);
  const occupied: number[] = [];
  for (let i = 0; i < 64; i++) if (cells[i] !== null) occupied.push(i);

  let placedAt: GridPosition;
  if (spec.placedPick < 8) placedAt = { row: spec.tRow, col: spec.tCol };
  else if (spec.placedPick < 9) {
    const i = occupied[spec.placedPick2 % occupied.length] as number;
    placedAt = { row: Math.floor(i / 8), col: i % 8 };
  } else {
    const i = spec.placedPick2 % 64;
    placedAt = { row: Math.floor(i / 8), col: i % 8 };
  }
  return { board, placedAt, kind: "planted" };
}

const arbCardOrder: fc.Arbitrary<CardId[]> = fc.shuffledSubarray([...ALL_CARDS], {
  minLength: ALL_CARDS.length,
  maxLength: ALL_CARDS.length,
});

const arbTargetIndex: fc.Arbitrary<number> = fc.oneof(
  { weight: 5, arbitrary: fc.integer({ min: 1, max: 6 }) },
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 7 }) },
);

/** Planted scenarios (see the file comment). */
export const arbPlantedScenario: fc.Arbitrary<CodeScenario> = fc
  .record({
    tRow: arbTargetIndex,
    tCol: arbTargetIndex,
    planPick: fc.nat({ max: 99 }),
    spoils: fc.array(fc.record({ spoil: fc.integer({ min: 0, max: 9 }), cell: fc.integer({ min: 0, max: 3 }) }), {
      minLength: 2,
      maxLength: 2,
    }),
    order: arbCardOrder,
    flips: fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }),
    noise: fc.array(fc.record({ pick: fc.nat({ max: 63 }), flip: fc.boolean() }), { maxLength: 30 }),
    placedPick: fc.nat({ max: 9 }),
    placedPick2: fc.nat({ max: 63 }),
  })
  .map(buildPlanted);

/**
 * Legal scenarios: a board reached by legal placements (`arbBoard`) and a cell to examine: usually an occupied
 * cell, sometimes any in-range cell (possibly empty), rarely a coordinate from -1 to 8 (possibly off the board).
 */
export const arbLegalScenario: fc.Arbitrary<CodeScenario> = fc
  .tuple(arbBoard, fc.nat({ max: 99 }), fc.nat({ max: 63 }), fc.integer({ min: -1, max: 8 }), fc.integer({ min: -1, max: 8 }))
  .map(([board, pick, pick2, row, col]): CodeScenario => {
    const occupied: number[] = [];
    for (let i = 0; i < 64; i++) if (board[i] !== null) occupied.push(i);
    let placedAt: GridPosition;
    if (pick < 85) {
      const i = occupied[pick2 % occupied.length] as number;
      placedAt = { row: Math.floor(i / 8), col: i % 8 };
    } else if (pick < 95) {
      placedAt = { row: Math.floor(pick2 / 8), col: pick2 % 8 };
    } else {
      placedAt = { row, col };
    }
    return { board, placedAt, kind: "legal" };
  });

/** A mix of planted (4 parts) and legal (2 parts) scenarios. */
export const arbCodeScenario: fc.Arbitrary<CodeScenario> = fc.oneof(
  { weight: 4, arbitrary: arbPlantedScenario },
  { weight: 2, arbitrary: arbLegalScenario },
);
