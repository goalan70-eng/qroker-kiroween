/**
 * Ranking of the QRoker game engine (task 6.2).
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "ScoreEngine and Ranking (`core/score.ts`,
 * `core/ranking.ts`)" and Property 20.
 * Requirements: 9.4 (rank by descending final Score, equal Scores share a rank, no further tiebreak;
 * qroker-game Requirement 3.9, Open Question OQ-6), 9.5 (equal Scores have equal ranks, a higher Score
 * has a lower rank number, at least one Seat has rank 1; qroker-game design Property 19).
 *
 * Pure module: no DOM, no node, no randomness, no clock, no import from `src/optical`.
 *
 * Numbering (OQ-6, option (a), "competition ranking", 1-2-2-4 style):
 *   rank(seat) = 1 + (number of Seats whose Score is strictly higher than the Score of `seat`)
 * so the Scores [5, 5, 3, 0] give the ranks [1, 1, 3, 4] and four equal Scores give [1, 1, 1, 1].
 *
 * There is NO tiebreak. Seats with equal Scores share a rank. The only ordering inside a group of
 * equal rank is the Seat order P0, P1, P2, P3. That order exists to make the output deterministic; it
 * is not a ranking criterion and no consumer may read it as one.
 *
 * Scope: only the ranking. This module has no helper that computes final Scores (the design places
 * none here); the Scores come from the reducer.
 */

import type { PlayerId } from './types';

/** One line of the final ranking. Matches design.md (`RankEntry`). */
export interface RankEntry {
  readonly player: PlayerId;
  readonly score: number;
  readonly rank: number;
}

const SEATS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];

/**
 * Competition ranking of the four Seats by descending Score.
 *
 * Returns the four entries ordered by rank ascending, then by Seat (P0..P3). The result depends only on
 * the four Score values and their Seats, never on the key order or insertion order of `scores`.
 * Higher Score ranks better. Negative Scores are allowed (the function only compares Scores), so it is
 * total over finite numbers; the game itself only produces non-negative integers. `-0` and `0` are equal.
 * Each entry carries the Score exactly as given.
 *
 * Precondition (the design gives this function no error result): `scores` has all four keys P0..P3 and
 * every value is a finite number. The behaviour for a missing Seat, `NaN` or an infinite value is
 * unspecified and not tested; keys other than P0..P3 are ignored. Callers pass the Scores of
 * `GameState`, which satisfy the precondition.
 *
 * Pure: the input is not read beyond the four Seat keys and is never mutated. The returned array and
 * its entries are frozen, so a caller that stores them in a `GameState` cannot alter them by accident.
 */
export function rankPlayers(scores: Readonly<Record<PlayerId, number>>): readonly RankEntry[] {
  const entries = SEATS.map((player, seat) => {
    const score = scores[player];
    let higher = 0;
    for (const other of SEATS) if (scores[other] > score) higher++;
    return { seat, entry: Object.freeze({ player, score, rank: 1 + higher }) as RankEntry };
  });
  entries.sort((a, b) => a.entry.rank - b.entry.rank || a.seat - b.seat);
  return Object.freeze(entries.map((e) => e.entry));
}
