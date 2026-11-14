/**
 * Composite Code detector of the QRoker game engine.
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "CompositeCodeDetector (`core/composite-code.ts`)".
 * Requirements: 5.1 (examine only the 2x2 regions that contain the placed cell), 5.2 (occupancy alone is
 * not a code), 5.3 (Hidden_Sum), 5.4 (Group_Id), 5.5 (eligibility: newly formed and not yet recorded),
 * 5.7 (starting group), 5.8 (public identity is the Quad_Key); member validity is Requirement 4.4.
 *
 * Vocabulary used in this module (three different things):
 * 1. Quad_Group: a 2x2 region whose 4 cells are all occupied. Occupancy alone proves nothing.
 * 2. Composite_Code: a Quad_Group whose 4 members are all valid for their slot with their stored
 *    orientation (`isValidMember`), and whose 4 cards are pairwise distinct.
 * 3. Eligible (newly completed) code: a Composite_Code that contains the just-placed cell and whose
 *    `groupId` is not in the scored-groups record. `detect` returns ONLY these.
 *
 * What `detect` does and does not do:
 * - It examines only the quads from `affectedQuads(placedAt)` (1 to 4 quads that contain `placedAt`).
 *   A quad is therefore "newly formed" by construction: it was incomplete before the placement.
 *   Because a card is a valid member in exactly 2 of the 4 slots (at a given orientation), one placement
 *   can complete at most 2 codes, although up to 4 quads are examined.
 * - It does not mutate the board or `scoredGroups`. The caller (engine, task 8) adds the returned
 *   `groupId`s to the record in the same reducer step.
 * - It does not score, reveal, collect guesses or advance turns.
 * - It does not know about the starting group. The starting 2x2 (Neutral_Cards) is never returned because
 *   no placement forms it: it is not examined unless a caller passes one of its cells as `placedAt`.
 *   There is deliberately no special case for owner `NEUTRAL` here. The policy "the starting group is
 *   never scored" is provisional (OQ-3, design Open Questions) and is applied by the engine (task 8.1)
 *   when it decides which cell to pass; see `startingQuadIsExcluded`.
 *
 * Result order: results are ordered by `quadKey`, as the design specifies, using plain code-unit string
 * comparison (not `localeCompare`). Every key has two characters ([A-H][1-8]), so this is a total,
 * deterministic order. On the notation it is column-major: the column letter decides first, then the row
 * digit ('C4' comes before 'D3'). This intentionally differs from the row-major order of `legalCells` and
 * `candidateQuads`; that difference is per design.md and is not a bug.
 *
 * `groupId` is SEALED: it is the sorted CardIds joined by '|', so it reveals the Hidden_Sum. It exists
 * for the engine's scored-groups record only and must never be put in a PlayerView or any public
 * structure. Public structures identify a code by `quadKey` (IC-4).
 *
 * Error behaviour: a `placedAt` outside the board (including non-integer coordinates) or on an empty cell
 * returns `[]`. `detect` never throws for such input; validating the placement is the board's job.
 *
 * Pure and deterministic: no DOM, no node:*, no randomness, no clock, no import from src/optical.
 */

import { affectedQuads, cellAt } from './board';
import type { Board, PlacedCard } from './board';
import { groupIdOf, hiddenSum } from './cards';
import { isValidMember } from './fragment-layout';
import { inBounds, quadCells, quadKey, slotOf } from './geometry';
import type { CardId, GridPosition, Orientation, QuadKey } from './types';

/** A newly completed, eligible Composite_Code (see the module comment for the vocabulary). */
export interface CompositeCodeResult {
  /** Public identifier of the code (notation of the top-left cell, for example 'D4'). */
  readonly quadKey: QuadKey;
  readonly topLeft: GridPosition;
  /** The 4 cards in the order TL, TR, BL, BR. Pairwise distinct. */
  readonly cards: readonly [CardId, CardId, CardId, CardId];
  /** The stored orientations of the 4 cards in the order TL, TR, BL, BR. */
  readonly orientations: readonly [Orientation, Orientation, Orientation, Orientation];
  /** Sum of the 4 Card_Values, an integer from 4 to 52. */
  readonly hiddenSum: number;
  /** SEALED (engine use only): sorted CardIds joined by '|'. Never put in a PlayerView or any public structure. */
  readonly groupId: string;
}

/** The occupied cell of `p` when it is a valid member of its slot in the quad at `topLeft`, otherwise null. */
function validMemberAt(board: Board, topLeft: GridPosition, p: GridPosition): PlacedCard | null {
  const placed = cellAt(board, p);
  if (placed === null) return null;
  return isValidMember(placed.card, placed.orientation, slotOf(topLeft, p)) ? placed : null;
}

/**
 * The Composite_Code formed by the quad at `topLeft`, or null when a cell is empty, a member is invalid,
 * or the cards are not pairwise distinct. Does not look at `scoredGroups`.
 */
function codeOfQuad(board: Board, topLeft: GridPosition): CompositeCodeResult | null {
  const [pTL, pTR, pBL, pBR] = quadCells(topLeft);
  const tl = validMemberAt(board, topLeft, pTL);
  const tr = validMemberAt(board, topLeft, pTR);
  const bl = validMemberAt(board, topLeft, pBL);
  const br = validMemberAt(board, topLeft, pBR);
  if (tl === null || tr === null || bl === null || br === null) return null;

  const cards: [CardId, CardId, CardId, CardId] = [tl.card, tr.card, bl.card, br.card];
  // The board holds distinct cards by construction; the guard keeps hiddenSum and groupId meaningful anyway.
  if (new Set<CardId>(cards).size !== 4) return null;

  return Object.freeze({
    quadKey: quadKey(topLeft),
    topLeft: Object.freeze({ row: topLeft.row, col: topLeft.col }),
    cards: Object.freeze(cards),
    orientations: Object.freeze([tl.orientation, tr.orientation, bl.orientation, br.orientation] as [
      Orientation,
      Orientation,
      Orientation,
      Orientation,
    ]),
    hiddenSum: hiddenSum(cards),
    groupId: groupIdOf(cards),
  });
}

/** Plain code-unit comparison of the quadKey strings (no locale rules). */
function compareByQuadKey(a: CompositeCodeResult, b: CompositeCodeResult): number {
  return a.quadKey < b.quadKey ? -1 : a.quadKey > b.quadKey ? 1 : 0;
}

/**
 * The Composite_Codes completed by the card just placed at `placedAt` whose `groupId` is not in
 * `scoredGroups`, ordered by `quadKey` (see the module comment). Returns `[]` when
 * `placedAt` is outside the board or empty. Does not modify `board` or `scoredGroups`.
 */
export function detect(
  board: Board,
  placedAt: GridPosition,
  scoredGroups: ReadonlySet<string>,
): CompositeCodeResult[] {
  if (!inBounds(placedAt) || cellAt(board, placedAt) === null) return [];

  const found: CompositeCodeResult[] = [];
  for (const topLeft of affectedQuads(placedAt)) {
    const code = codeOfQuad(board, topLeft);
    if (code !== null && !scoredGroups.has(code.groupId)) found.push(code);
  }
  return found.sort(compareByQuadKey);
}

/**
 * Documentation marker required by the design: the starting 2x2 of Neutral_Cards is never made eligible
 * (Requirement 5.7, OQ-3). `detect` has no special case for it. The engine (task 8.1) never passes a cell
 * of the starting group as a newly placed cell, so the group is never examined.
 */
export function startingQuadIsExcluded(): true {
  return true;
}
