import { describe, expect, it } from 'vitest';
import type { CardId } from '../../src/game/core/types';
import { markerMask, pickMarkerPlacement } from './marker-placement';
import type { Tier } from './marker-placement';

// Three marked cards point into the same junction. The missing top-left
// card needs a bottom-right mark; a heart fits and a diamond cannot fit.
const board = Array<number>(36).fill(0);
board[2 * 6 + 3] = markerMask('D-5', 0);
board[3 * 6 + 2] = markerMask('D-8', 0);
board[3 * 6 + 3] = markerMask('H-2', 0);
const gap = { row: 2, col: 2 };
const elsewhere = { row: 4, col: 3 };

function pick(tier: Tier, card: CardId, next: CardId, seed: number) {
  const table = { side: 6, board, myHand: [card], nextHand: [markerMask(next, 0)] };
  const candidates = [gap, elsewhere].map(pos => ({ pos, card, orientation: 0 as const }));
  return pickMarkerPlacement(table, candidates, tier, seed).pos;
}

describe('experimental public-marker tactics', () => {
  for (const tier of ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const) {
    it(tier + ' takes an immediate completion even if a different cell is available', () => {
      for (let seed = 0; seed < 24; seed++) expect(pick(tier, 'H-7', 'H-9', seed)).toEqual(gap);
    });
  }
  for (const tier of ['INTERMEDIATE', 'ADVANCED'] as const) {
    it(tier + ' blocks a playable opponent marker and ignores changes of hidden rank', () => {
      const whenSafe = [];
      for (let seed = 0; seed < 24; seed++) {
        expect(pick(tier, 'D-7', 'H-9', seed)).toEqual(gap);
        expect(pick(tier, 'D-7', 'H-A', seed)).toEqual(gap);
        whenSafe.push(pick(tier, 'D-7', 'D-9', seed));
      }
      expect(whenSafe).toContainEqual(elsewhere);
    });
  }
});
