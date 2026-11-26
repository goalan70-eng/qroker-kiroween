import { suitOf } from '../../src/game/core/cards';
import { FRAGMENT_LAYOUT } from '../../src/game/core/fragment-layout';
import type { CardId, Corner, Orientation } from '../../src/game/core/types';
import { chooseSeeded, decisionRng } from '../../src/game/ai/strategy';
import type { PlacementCandidate } from '../../src/game/ai/strategy';

export type Tier = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
// TL, TR, BL, BR in board coordinates. Zero is an empty cell.
const cornerBit: Record<Corner, number> = { TL: 1, TR: 2, BL: 4, BR: 8 };
const inward = [8, 4, 2, 1] as const;
const rotate = (m: number) => ((m & 1) << 3) | ((m & 2) << 1) | ((m & 4) >> 1) | ((m & 8) >> 3);
export const markerMask = (card: CardId, orientation: Orientation) =>
  FRAGMENT_LAYOUT[suitOf(card)][orientation].reduce((mask, corner) => mask | cornerBit[corner], 0);

export interface MarkerTable {
  readonly side: number;
  readonly board: readonly number[];
  // Upright board-coordinate patterns of the next player's publicly marked backs.
  readonly nextHand: readonly number[];
  readonly myHand: readonly CardId[];
}

function squares(side: number): number[][] {
  const result = [];
  for (let row = 0; row < side - 1; row++) {
    for (let col = 0; col < side - 1; col++) {
      const i = row * side + col;
      result.push([i, i + 1, i + side, i + side + 1]);
    }
  }
  return result;
}

function orientations(masks: readonly number[]): number[] {
  return [...new Set(masks.flatMap(m => [m, rotate(m)]))];
}

function matches(mask: number, required: number): number {
  let bits = mask & required;
  let count = 0;
  while (bits) { count++; bits &= bits - 1; }
  return count;
}

// A gap can finish several squares at once; their inward corners at this cell differ.
function threats(board: readonly number[], quads: readonly number[][], placed: number) {
  const gaps = new Map<number, number>();
  const pairs: number[] = [];
  let completed = 0;
  for (const cells of quads) {
    let empty = -1;
    let emptyCount = 0;
    let needed = 0;
    let valid = true;
    for (const [slot, index] of cells.entries()) {
      const mask = board[index]!;
      const bit = inward[slot]!;
      if (mask === 0) { empty = index; emptyCount++; needed |= bit; }
      else if ((mask & bit) === 0) { valid = false; break; }
    }
    if (!valid) continue;
    if (emptyCount === 1) gaps.set(empty, (gaps.get(empty) ?? 0) | needed);
    else if (cells.includes(placed)) {
      if (emptyCount === 0) completed++;
      if (emptyCount === 2) pairs.push(needed);
    }
  }
  return { completed, gaps, pairs };
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return 0;
}

export function pickMarkerPlacement(
  table: MarkerTable, candidates: readonly PlacementCandidate[], tier: Tier, seed: number,
): PlacementCandidate {
  if (!candidates.length) throw new RangeError('No legal marker placement');
  const board = [...table.board];
  const quads = squares(table.side);
  const opponent = orientations(table.nextHand);
  const byShape = new Map<string, number[]>();
  let best: number[] | undefined;
  let tied: PlacementCandidate[] = [];
  for (const move of candidates) {
    const cell = move.pos.row * table.side + move.pos.col;
    const pattern = markerMask(move.card, move.orientation);
    // Both orientation and the upright pattern matter: the latter determines
    // which marker pair remains in our hand when two cards fit the same slot.
    const key = [cell, pattern, markerMask(move.card, 0)].join('/');
    let score = byShape.get(key);
    if (!score) {
      board[cell] = pattern;
      const { completed, gaps, pairs } = threats(board, quads, cell);
      board[cell] = 0;
      score = [completed];
      if (tier !== 'BEGINNER') {
        const retained = orientations(table.myHand.filter(c => c !== move.card).map(c => markerMask(c, 0)));
        const setups = pairs.filter(bits => retained.some(m => (m & bits) !== 0)).length;
        let strongestReply = 0;
        let threateningCells = 0;
        let followups = 0;
        let survivingFollowups = Infinity;
        const replies: { strength: number; mine: number }[] = [];
        for (const needed of gaps.values()) {
          const strength = Math.max(0, ...opponent.map(m => matches(m, needed)));
          const mine = Math.max(0, ...retained.map(m => matches(m, needed)));
          strongestReply = Math.max(strongestReply, strength);
          if (strength) threateningCells++;
          followups += mine;
          replies.push({ strength, mine });
        }
        // Intermediate avoids giving the next seat a finish, then builds its own threats.
        if (tier === 'INTERMEDIATE') score.push(-Number(strongestReply > 0), followups, setups);
        else {
          // Assume the opponent takes its strongest finish and, on a tie, occupies
          // our best follow-up gap. Other intervening turns and future draws are unknown.
          for (const reply of replies) {
            if (reply.strength === strongestReply)
              survivingFollowups = Math.min(survivingFollowups, followups - reply.mine);
          }
          score.push(-strongestReply, -threateningCells,
            Number.isFinite(survivingFollowups) ? survivingFollowups : followups, followups, setups);
        }
      }
      byShape.set(key, score);
    }
    const order = best ? compare(score, best) : 1;
    if (order > 0) { best = score; tied = [move]; }
    else if (!order) tied.push(move);
  }
  return chooseSeeded(tied, decisionRng({ decisionSeed: seed }));
}
