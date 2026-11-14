// Unit tests for core/ranking.ts (task 6.2). Property 20 as a property test is task 6.3.
// Requirements: 9.4, 9.5 (competition ranking, OQ-6; no tiebreak).

import { describe, expect, it } from "vitest";
import { rankPlayers } from "./ranking";
import type { RankEntry } from "./ranking";
import type { PlayerId } from "./types";

const SEATS: readonly PlayerId[] = ["P0", "P1", "P2", "P3"];

type Scores = Record<PlayerId, number>;

/** Scores by seat order: scoresOf([5, 5, 3, 0]) gives P0=5, P1=5, P2=3, P3=0. */
const scoresOf = (v: readonly [number, number, number, number]): Scores => ({ P0: v[0], P1: v[1], P2: v[2], P3: v[3] });

/** Ranks listed in seat order P0..P3 (independent of the order of the result). */
const ranksBySeat = (entries: readonly RankEntry[]): number[] =>
  SEATS.map((p) => (entries.find((e) => e.player === p) as RankEntry).rank);

/** Independent oracle: rank = 1 + number of Seats with a strictly higher score. */
const oracleRank = (scores: Scores, p: PlayerId): number => 1 + SEATS.filter((q) => scores[q] > scores[p]).length;

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]));
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe("rankPlayers: acceptance examples", () => {
  it("[5,5,3,0] gives ranks [1,1,3,4]", () => {
    expect(ranksBySeat(rankPlayers(scoresOf([5, 5, 3, 0])))).toEqual([1, 1, 3, 4]);
  });

  it("all equal scores give ranks [1,1,1,1]", () => {
    expect(ranksBySeat(rankPlayers(scoresOf([6, 6, 6, 6])))).toEqual([1, 1, 1, 1]);
    expect(ranksBySeat(rankPlayers(scoresOf([0, 0, 0, 0])))).toEqual([1, 1, 1, 1]);
  });

  it("returns player, score and rank for each entry", () => {
    expect(rankPlayers(scoresOf([5, 5, 3, 0]))).toEqual([
      { player: "P0", score: 5, rank: 1 },
      { player: "P1", score: 5, rank: 1 },
      { player: "P2", score: 3, rank: 3 },
      { player: "P3", score: 0, rank: 4 },
    ]);
  });
});

describe("rankPlayers: tie shapes", () => {
  it("three-way tie at the top: [7,7,7,2] gives [1,1,1,4]", () => {
    expect(ranksBySeat(rankPlayers(scoresOf([7, 7, 7, 2])))).toEqual([1, 1, 1, 4]);
  });

  it("three-way tie at the bottom: [9,2,2,2] gives [1,2,2,2]", () => {
    expect(ranksBySeat(rankPlayers(scoresOf([9, 2, 2, 2])))).toEqual([1, 2, 2, 2]);
  });

  it("two separate ties: [4,9,9,4] gives P1, P2 at rank 1, then P0, P3 at rank 3", () => {
    expect(rankPlayers(scoresOf([4, 9, 9, 4]))).toEqual([
      { player: "P1", score: 9, rank: 1 },
      { player: "P2", score: 9, rank: 1 },
      { player: "P0", score: 4, rank: 3 },
      { player: "P3", score: 4, rank: 3 },
    ]);
  });

  it("tie in the middle: [8,5,5,1] gives [1,2,2,4]", () => {
    expect(ranksBySeat(rankPlayers(scoresOf([8, 5, 5, 1])))).toEqual([1, 2, 2, 4]);
  });

  it("single winner with a tie behind: [1,12,3,3] gives [4,1,2,2]", () => {
    expect(ranksBySeat(rankPlayers(scoresOf([1, 12, 3, 3])))).toEqual([4, 1, 2, 2]);
  });

  it("all distinct scores give ranks 1..4, higher score first", () => {
    expect(ranksBySeat(rankPlayers(scoresOf([10, 30, 20, 0])))).toEqual([3, 1, 2, 4]);
    expect(rankPlayers(scoresOf([10, 30, 20, 0])).map((e) => e.player)).toEqual(["P1", "P2", "P0", "P3"]);
  });

  it("descending input gives ranks [1,2,3,4] and ascending input gives [4,3,2,1]", () => {
    expect(ranksBySeat(rankPlayers(scoresOf([9, 6, 3, 0])))).toEqual([1, 2, 3, 4]);
    expect(ranksBySeat(rankPlayers(scoresOf([0, 3, 6, 9])))).toEqual([4, 3, 2, 1]);
  });

  it("the last Seat can win alone", () => {
    expect(ranksBySeat(rankPlayers(scoresOf([0, 0, 0, 1])))).toEqual([2, 2, 2, 1]);
  });
});

describe("rankPlayers: scores that are negative or fractional", () => {
  it("compares by value only, so negative scores rank below non-negative ones", () => {
    expect(ranksBySeat(rankPlayers(scoresOf([-3, 0, -3, 2])))).toEqual([3, 2, 3, 1]);
  });

  it("treats -0 and 0 as equal and keeps the score as given", () => {
    const entries = rankPlayers(scoresOf([-0, 0, 1, 0]));
    expect(ranksBySeat(entries)).toEqual([2, 2, 1, 2]);
    expect(entries.map((e) => e.score)).toEqual([1, -0, 0, 0]);
  });

  it("works for non-integer finite scores", () => {
    expect(ranksBySeat(rankPlayers(scoresOf([1.5, 1.25, 1.5, 0.5])))).toEqual([1, 3, 1, 4]);
  });
});

describe("rankPlayers: independence from input order", () => {
  // Score multisets covering all tie shapes of four Seats.
  const MULTISETS: readonly (readonly [number, number, number, number])[] = [
    [5, 5, 3, 0],
    [7, 7, 7, 2],
    [4, 9, 9, 4],
    [6, 6, 6, 6],
    [9, 6, 3, 0],
    [9, 2, 2, 2],
    [0, 0, 0, 1],
  ];

  it("for all 24 seat assignments of a multiset, every rank equals the oracle and the order is rank then seat", () => {
    let checked = 0;
    for (const multiset of MULTISETS) {
      for (const assignment of permutations(multiset)) {
        const scores = scoresOf(assignment as unknown as [number, number, number, number]);
        const result = rankPlayers(scores);
        expect(result).toHaveLength(4);
        expect(result.map((e) => e.player).sort()).toEqual([...SEATS]);
        for (const e of result) {
          expect(e.score).toBe(scores[e.player]);
          expect(e.rank).toBe(oracleRank(scores, e.player));
        }
        // Output order: rank ascending, then seat P0..P3.
        for (let i = 1; i < result.length; i++) {
          const a = result[i - 1] as RankEntry;
          const b = result[i] as RankEntry;
          expect(a.rank < b.rank || (a.rank === b.rank && a.player < b.player)).toBe(true);
        }
        checked++;
      }
    }
    expect(checked).toBe(MULTISETS.length * 24);
  });

  it("gives the same result for objects built with every key insertion order", () => {
    const values: Scores = { P0: 4, P1: 9, P2: 9, P3: 4 };
    const expected = rankPlayers(scoresOf([4, 9, 9, 4]));
    for (const order of permutations(SEATS)) {
      const scores = {} as Scores;
      for (const p of order) scores[p] = values[p];
      expect(Object.keys(scores)).toEqual(order);
      expect(rankPlayers(scores)).toEqual(expected);
    }
  });

  it("is repeatable", () => {
    const scores = scoresOf([5, 5, 3, 0]);
    expect(rankPlayers(scores)).toEqual(rankPlayers(scores));
  });
});

describe("rankPlayers: purity", () => {
  it("accepts a deeply frozen input and leaves it unchanged", () => {
    const scores = deepFreeze(scoresOf([5, 5, 3, 0]));
    expect(() => rankPlayers(scores)).not.toThrow();
    expect(scores).toEqual({ P0: 5, P1: 5, P2: 3, P3: 0 });
    expect(Object.keys(scores)).toEqual(["P0", "P1", "P2", "P3"]);
  });

  it("returns a frozen array of frozen entries, a new one on each call", () => {
    const scores = scoresOf([5, 5, 3, 0]);
    const a = rankPlayers(scores);
    const b = rankPlayers(scores);
    expect(Object.isFrozen(a)).toBe(true);
    expect(a.every((e) => Object.isFrozen(e))).toBe(true);
    expect(a).not.toBe(b);
  });

  it("is not affected by later changes to the input object", () => {
    const scores = scoresOf([5, 5, 3, 0]);
    const result = rankPlayers(scores);
    scores.P2 = 100;
    expect(ranksBySeat(result)).toEqual([1, 1, 3, 4]);
  });
});
