// fast-check arbitraries for boards (task 4.2). Test support only: imported by tests, never by engine code.
// Pure and deterministic: no Math.random, clock or crypto; all randomness comes from fast-check.
//
// Source: .kiro/specs/qroker-playable-game/design.md, "Testing Strategy > Generators" ("arbBoard by repeated
// legal placements from the starting 2x2").
//
// A generated board is built from the starting group (`initialBoard` with four distinct cards) by repeated
// LEGAL placements: every step picks one cell of `legalCells(board)` and places the next card of a shuffled
// permutation of the 52-card catalog with `placeOnBoard`. Cards are therefore pairwise distinct, so a board
// holds at most 52 cards (4 starting + 48 placements). A board with 53..64 cards cannot be built from distinct
// cards. `fullBoardNonDistinct` builds a 64-card board by repeating cards, for geometry checks only.
//
// Everything is a pure function of the fast-check input (a card order and a list of steps), so a failing
// case is reproduced from the seed and path that fast-check prints, and shrinks to fewer placements.

import fc from "fast-check";
import { ALL_CARDS } from "../cards";
import { initialBoard, legalCells, placeOnBoard } from "../board";
import type { Board } from "../board";
import type { CardId, Owner } from "../types";

/** Starting group size. */
export const START_CARDS = 4;
/** Largest number of placements with distinct cards: 52 catalog cards minus the 4 starting cards. */
export const MAX_PLACEMENTS = ALL_CARDS.length - START_CARDS;
/** Largest card count of a generated board (all 52 distinct cards on the board). */
export const MAX_DISTINCT_CARDS = ALL_CARDS.length;
/** Upper end of the requested placement range of `arbBoard`; values above `MAX_PLACEMENTS` are capped. */
export const REQUESTED_PLACEMENTS_MAX = 60;

const OWNERS: readonly Owner[] = ["P0", "P1", "P2", "P3", "NEUTRAL"];

/** One placement decision: which legal cell (index modulo the number of legal cells), orientation, owner. */
export interface PlacementStep {
  readonly pick: number;
  readonly flip: boolean;
  readonly owner: Owner;
}

const arbStep: fc.Arbitrary<PlacementStep> = fc.record({
  pick: fc.nat({ max: 63 }),
  flip: fc.boolean(),
  owner: fc.constantFrom(...OWNERS),
});

/** The 52 catalog cards in a random order (shrinks towards fewer swaps). */
const arbCardOrder: fc.Arbitrary<CardId[]> = fc.shuffledSubarray([...ALL_CARDS], {
  minLength: ALL_CARDS.length,
  maxLength: ALL_CARDS.length,
});

/**
 * Builds a board from a card order and steps by legal placements: the first four cards form the starting
 * group, then `min(placements, MAX_PLACEMENTS, steps.length)` cards are placed. Deterministic.
 * @throws Error if a legal cell is rejected by `placeOnBoard` (a defect in board.ts, not a generator case).
 */
export function buildBoard(cards: readonly CardId[], steps: readonly PlacementStep[], placements: number): Board {
  let board = initialBoard([cards[0] as CardId, cards[1] as CardId, cards[2] as CardId, cards[3] as CardId]);
  const n = Math.min(placements, MAX_PLACEMENTS, steps.length);
  for (let i = 0; i < n; i++) {
    const cells = legalCells(board);
    if (cells.length === 0) throw new Error(`buildBoard: no legal cell after ${START_CARDS + i} cards`);
    const step = steps[i] as PlacementStep;
    const pos = cells[step.pick % cells.length] as (typeof cells)[number];
    const placed = placeOnBoard(board, pos, {
      card: cards[START_CARDS + i] as CardId,
      orientation: step.flip ? 180 : 0,
      owner: step.owner,
    });
    if (!placed.ok) {
      throw new Error(`buildBoard: legal cell (${pos.row}, ${pos.col}) rejected with ${placed.error.code}`);
    }
    board = placed.value;
  }
  return board;
}

function arbBoardOf(placements: fc.Arbitrary<number>): fc.Arbitrary<Board> {
  return fc
    .tuple(arbCardOrder, fc.array(arbStep, { minLength: MAX_PLACEMENTS, maxLength: MAX_PLACEMENTS }), placements)
    .map(([cards, steps, n]) => buildBoard(cards, steps, n));
}

/**
 * A board with exactly `count` cards (4..52) built by `count - 4` legal placements of distinct cards.
 * @throws RangeError if `count` is not an integer from 4 to 52.
 */
export function arbBoardWithCount(count: number): fc.Arbitrary<Board> {
  if (!Number.isInteger(count) || count < START_CARDS || count > MAX_DISTINCT_CARDS) {
    throw new RangeError(`arbBoardWithCount: count must be an integer from ${START_CARDS} to ${MAX_DISTINCT_CARDS}`);
  }
  return arbBoardOf(fc.constant(count - START_CARDS));
}

/**
 * A board reached by 0..60 requested legal placements from the starting 2x2 (4 to 52 cards, because the
 * placements are capped at 48 by the 52 distinct cards). The request is biased so that 51-card and 52-card
 * boards occur often: 47 and 48 placements each have their own weight, and every request of 48 or more
 * gives the 52-card board.
 */
export const arbBoard: fc.Arbitrary<Board> = arbBoardOf(
  fc.oneof(
    { weight: 8, arbitrary: fc.integer({ min: 0, max: REQUESTED_PLACEMENTS_MAX }) },
    { weight: 1, arbitrary: fc.constant(MAX_PLACEMENTS - 1) },
    { weight: 1, arbitrary: fc.constant(MAX_PLACEMENTS) },
  ),
);

/**
 * Deterministic board with exactly `count` cards (4..52): catalog order, always the first legal cell in
 * row-major order, orientation 0, owner P0 (the starting group is NEUTRAL).
 */
export function deterministicBoard(count: number): Board {
  if (!Number.isInteger(count) || count < START_CARDS || count > MAX_DISTINCT_CARDS) {
    throw new RangeError(`deterministicBoard: count must be an integer from ${START_CARDS} to ${MAX_DISTINCT_CARDS}`);
  }
  const steps: PlacementStep[] = Array.from({ length: MAX_PLACEMENTS }, () => ({ pick: 0, flip: false, owner: "P0" }));
  return buildBoard(ALL_CARDS, steps, count - START_CARDS);
}

/**
 * A full 64-card board for geometry checks. The 52 catalog cards are reused (card i is `ALL_CARDS[i % 52]`),
 * so the cards are NOT pairwise distinct. It is never a reachable game position; use it only where the
 * property concerns occupancy, not card identity.
 */
export function fullBoardNonDistinct(): Board {
  let board = initialBoard([ALL_CARDS[0] as CardId, ALL_CARDS[1] as CardId, ALL_CARDS[2] as CardId, ALL_CARDS[3] as CardId]);
  for (let i = START_CARDS; i < 64; i++) {
    const cells = legalCells(board);
    const pos = cells[0];
    if (pos === undefined) throw new Error(`fullBoardNonDistinct: no legal cell at ${i} cards`);
    const placed = placeOnBoard(board, pos, { card: ALL_CARDS[i % ALL_CARDS.length] as CardId, orientation: 0, owner: "P0" });
    if (!placed.ok) throw new Error(`fullBoardNonDistinct: ${placed.error.code}`);
    board = placed.value;
  }
  return board;
}
