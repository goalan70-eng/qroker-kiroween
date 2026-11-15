// Tests of the AI framework (task 12.1): enumeration order and count, work-budget truncation, seeded tie-break,
// labels, and the type-level information-isolation check (no function of the framework takes a GameState).
//
// Test files may import any core module. The enumeration is compared with independent constructions that use the
// engine's own board helpers (`legalCells`, `reduce`, `legalPlacements`), not `view.legalCellsFor`.

import fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";
import { legalCells } from "../core/board";
import { ALL_CARDS } from "../core/cards";
import { reduce } from "../core/engine";
import { mix32, mulberry32 } from "../core/prng";
import { defaultConfig } from "../core/state";
import type { GameState } from "../core/state";
import { legalPlacements, playToEnd } from "../core/testing/state-generators";
import type { Reachable } from "../core/testing/state-generators";
import { FIXTURE_NEUTRAL, makeState } from "../core/testing/state-fixtures";
import type { Action, CardId, Difficulty, GameConfig, GridPosition, Orientation, PlayerId } from "../core/types";
import { viewFor } from "../core/view";
import type { PlayerView } from "../core/view";
import {
  DIFFICULTY_LABELS,
  chooseSeeded,
  decisionRng,
  effectiveBudget,
  enumeratePlacements,
  pickIndex,
  takeBudget,
  toPlaceAction,
} from "./strategy";
import type { AIStrategy, AiContext, BudgetedCandidates, PlacementCandidate } from "./strategy";

// ---------------------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------------------

const CHOICES = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3, 8, 4, 6, 2, 6, 4, 3, 3, 8, 3, 2, 7, 9, 5];
const FACE_UP_CONFIG: GameConfig = { ...defaultConfig(), identityVisibility: "FACE_UP" };

/** A few PLACEMENT states of a real game, spread over its length (turn seat = the viewer). */
function placementStates(game: Reachable, count: number): GameState[] {
  const all = game.states.filter((s) => s.phase === "PLACEMENT");
  const step = Math.max(1, Math.floor(all.length / count));
  return all.filter((_, i) => i % step === 0).slice(0, count);
}

const GAME_A = playToEnd(11, defaultConfig(), CHOICES);
const GAME_B = playToEnd(2024, defaultConfig(), CHOICES.slice().reverse());

/** The same construction as the contract, built from the engine's own board helpers. */
function independentCandidates(state: GameState, viewer: PlayerId): PlacementCandidate[] {
  const hand = ALL_CARDS.filter((card) => state.hands[viewer].includes(card));
  const out: PlacementCandidate[] = [];
  for (const card of hand) {
    for (const pos of legalCells(state.board)) {
      for (const orientation of [0, 180] as Orientation[]) out.push({ card, pos: { row: pos.row, col: pos.col }, orientation });
    }
  }
  return out;
}

const plain = (cs: readonly PlacementCandidate[]): PlacementCandidate[] => JSON.parse(JSON.stringify(cs)) as PlacementCandidate[];

// ---------------------------------------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------------------------------------

describe("enumeratePlacements", () => {
  it("equals the independent construction (hand canonical x row-major cells x [0, 180]) at reachable views", () => {
    const states = [...placementStates(GAME_A, 8), ...placementStates(GAME_B, 8)];
    expect(states.length).toBeGreaterThanOrEqual(10);
    for (const state of states) {
      const view = viewFor(state, state.turn);
      expect(plain(enumeratePlacements(view)), `phase ${state.phase} turn ${state.turn}`).toEqual(independentCandidates(state, state.turn));
    }
  });

  it("has |hand| x |legal cells| x 2 elements", () => {
    for (const state of [...placementStates(GAME_A, 8), ...placementStates(GAME_B, 8)]) {
      const view = viewFor(state, state.turn);
      const expected = state.hands[state.turn].length * legalCells(state.board).length * 2;
      expect(enumeratePlacements(view)).toHaveLength(expected);
      expect(expected).toBeGreaterThan(0);
    }
  });

  it("is ordered by hand card, then row-major cell, then orientation 0 before 180", () => {
    const state = placementStates(GAME_A, 4)[2] as GameState;
    const view = viewFor(state, state.turn);
    const candidates = enumeratePlacements(view);
    const cells = legalCells(state.board);
    const perCard = cells.length * 2;
    candidates.forEach((c, i) => {
      expect(c.card).toBe(view.myHand[Math.floor(i / perCard)]);
      const cell = cells[Math.floor((i % perCard) / 2)] as GridPosition;
      expect(c.pos).toEqual({ row: cell.row, col: cell.col });
      expect(c.orientation).toBe(i % 2 === 0 ? 0 : 180);
    });
    // canonical hand order
    const canonical = view.myHand.map((card) => ALL_CARDS.indexOf(card));
    expect(canonical).toEqual([...canonical].sort((a, b) => a - b));
  });

  it("is stable: repeated calls and an equal view built again give deeply equal results", () => {
    const state = placementStates(GAME_B, 4)[1] as GameState;
    const a = enumeratePlacements(viewFor(state, state.turn));
    const b = enumeratePlacements(viewFor(state, state.turn));
    expect(a).toEqual(b);
    expect(new Set(a.map((c) => `${c.card}|${c.pos.row},${c.pos.col}|${c.orientation}`)).size).toBe(a.length);
  });

  it("returns frozen data", () => {
    const state = placementStates(GAME_A, 2)[1] as GameState;
    const candidates = enumeratePlacements(viewFor(state, state.turn));
    expect(Object.isFrozen(candidates)).toBe(true);
    expect(Object.isFrozen(candidates[0])).toBe(true);
    expect(Object.isFrozen((candidates[0] as PlacementCandidate).pos)).toBe(true);
  });

  it("returns [] when it is not the viewer's turn", () => {
    for (const state of placementStates(GAME_A, 6)) {
      for (const seat of ["P0", "P1", "P2", "P3"] as PlayerId[]) {
        if (seat === state.turn) continue;
        expect(enumeratePlacements(viewFor(state, seat))).toEqual([]);
      }
    }
  });

  it("returns [] outside the PLACEMENT phase", () => {
    const phases = new Set<string>();
    for (const state of [...GAME_A.states, ...GAME_B.states]) {
      if (state.phase === "PLACEMENT") continue;
      phases.add(state.phase);
      expect(enumeratePlacements(viewFor(state, state.turn)), state.phase).toEqual([]);
    }
    expect(phases.has("GUESS_COLLECT")).toBe(true);
    expect(phases.has("ENDED")).toBe(true);
  });

  it("has the same candidates under OWNER_ONLY and FACE_UP for the same game", () => {
    const owner = playToEnd(11, defaultConfig(), CHOICES);
    const faceUp = playToEnd(11, FACE_UP_CONFIG, CHOICES);
    expect(faceUp.actions).toEqual(owner.actions); // same trajectory, so the states differ only in the config
    let hiddenViews = 0;
    owner.states.forEach((state, i) => {
      if (state.phase !== "PLACEMENT") return;
      const hidden = viewFor(state, state.turn);
      const open = viewFor(faceUp.states[i] as GameState, state.turn);
      if (hidden.board.some((cell) => cell !== null && cell.card === null)) hiddenViews++;
      expect(open.board.every((cell) => cell === null || cell.card !== null)).toBe(true);
      expect(enumeratePlacements(open)).toEqual(enumeratePlacements(hidden));
    });
    expect(hiddenViews).toBeGreaterThan(0); // the comparison saw views with hidden identities
  });

  it("includes edge and corner cells when they are legal", () => {
    const used = new Set<CardId>([...FIXTURE_NEUTRAL, "H-A", "S-2", "D-5"]);
    const spare = ALL_CARDS.filter((card) => !used.has(card));
    // D3 D2 D1 C1 B1 reach the top edge and the corner A1; E6 E7 E8 F8 G8 reach the bottom edge and the corner H8.
    const notations = ["D3", "D2", "D1", "C1", "B1", "E6", "E7", "E8", "F8", "G8"];
    const state = makeState({
      cells: notations.map((at, i) => ({ at, card: spare[i] as CardId })),
      hands: { P0: ["H-A", "S-2", "D-5"] },
      turn: "P0",
    });
    const view = viewFor(state, "P0");
    const cells = new Set(enumeratePlacements(view).map((c) => `${c.pos.row},${c.pos.col}`));
    for (const corner of ["0,0", "7,7"]) expect(cells.has(corner), `corner ${corner}`).toBe(true);
    for (const edge of ["0,4", "7,3"]) expect(cells.has(edge), `edge ${edge}`).toBe(true);
    const candidates = enumeratePlacements(view);
    expect(candidates).toHaveLength(3 * legalCells(state.board).length * 2);
    expect(plain(candidates)).toEqual(independentCandidates(state, "P0"));
  });

  it("agrees with the engine: every candidate is accepted by reduce, and the set equals legalPlacements", () => {
    for (const state of placementStates(GAME_A, 3)) {
      const view = viewFor(state, state.turn);
      const candidates = enumeratePlacements(view);
      const actions = candidates.map((c) => toPlaceAction(view, c));
      for (const action of actions) expect(reduce(state, action).ok, JSON.stringify(action)).toBe(true);
      const key = (a: Extract<Action, { type: "PLACE" }>): string => `${a.card}|${a.pos.row},${a.pos.col}|${a.orientation}`;
      expect(new Set(actions.map(key))).toEqual(new Set(legalPlacements(state).map((p) => key(p.action))));
    }
  });

  it("toPlaceAction builds a PLACE of the viewer with a copy of the position", () => {
    const state = placementStates(GAME_A, 2)[1] as GameState;
    const view = viewFor(state, state.turn);
    const first = enumeratePlacements(view)[0] as PlacementCandidate;
    const action = toPlaceAction(view, first);
    expect(action).toEqual({ type: "PLACE", player: state.turn, card: first.card, pos: first.pos, orientation: first.orientation });
    expect(action.pos).not.toBe(first.pos);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Work budget
// ---------------------------------------------------------------------------------------------------------

describe("takeBudget", () => {
  const list = [10, 20, 30, 40, 50];

  it("keeps the first N candidates and flags the truncation", () => {
    expect(takeBudget(list, 3)).toEqual({ items: [10, 20, 30], evaluated: 3, truncated: true });
    expect(takeBudget(list, 1)).toEqual({ items: [10], evaluated: 1, truncated: true });
  });
  it("returns everything, not truncated, when the budget is at least the length", () => {
    expect(takeBudget(list, 5)).toEqual({ items: list, evaluated: 5, truncated: false });
    expect(takeBudget(list, 500)).toEqual({ items: list, evaluated: 5, truncated: false });
    expect(takeBudget(list, Infinity)).toEqual({ items: list, evaluated: 5, truncated: false });
    expect(takeBudget([], 4)).toEqual({ items: [], evaluated: 0, truncated: false });
  });
  it("evaluates nothing for a budget of 0, a negative budget, -Infinity and NaN", () => {
    for (const budget of [0, -0, -1, -1000, -Infinity, NaN]) {
      expect(takeBudget(list, budget), String(budget)).toEqual({ items: [], evaluated: 0, truncated: true });
      expect(effectiveBudget(budget, list.length), String(budget)).toBe(0);
    }
    expect(takeBudget([], 0)).toEqual({ items: [], evaluated: 0, truncated: false });
  });
  it("rounds a fractional budget down", () => {
    expect(takeBudget(list, 2.9).items).toEqual([10, 20]);
    expect(takeBudget(list, 0.9)).toEqual({ items: [], evaluated: 0, truncated: true });
  });
  it("is deterministic and does not change or alias its input", () => {
    const input = [1, 2, 3, 4];
    const a = takeBudget(input, 2);
    const b = takeBudget(input, 2);
    expect(a).toEqual(b);
    expect(input).toEqual([1, 2, 3, 4]);
    expect(a.items).not.toBe(input);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.items)).toBe(true);
  });
  it("truncates the real enumeration to an exact prefix", () => {
    const state = placementStates(GAME_A, 3)[1] as GameState;
    const all = enumeratePlacements(viewFor(state, state.turn));
    const cut = takeBudget(all, 25);
    expect(cut.items).toEqual(all.slice(0, 25));
    expect(cut.truncated).toBe(true);
    expect(cut.evaluated).toBe(25);
  });

  it("property: result is the prefix of length min(floor(budget), n), truncated iff candidates are dropped", () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 40 }), fc.oneof(fc.integer({ min: -5, max: 60 }), fc.double({ min: -5, max: 60, noNaN: true })), (items, budget) => {
        const r: BudgetedCandidates<number> = takeBudget(items, budget);
        const n = Math.min(Math.max(Math.floor(budget), 0), items.length);
        expect(r.items).toEqual(items.slice(0, n));
        expect(r.evaluated).toBe(n);
        expect(r.truncated).toBe(n < items.length);
        expect(takeBudget(items, budget)).toEqual(r);
      }),
    );
  });
});

// ---------------------------------------------------------------------------------------------------------
// Seeded tie-break
// ---------------------------------------------------------------------------------------------------------

describe("pickIndex, chooseSeeded and decisionRng", () => {
  it("decisionRng is mulberry32 of the decision seed: same seed, same stream", () => {
    const a = decisionRng({ decisionSeed: 12345 });
    const b = mulberry32(12345);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
    expect(decisionRng({ decisionSeed: 1 })()).not.toBe(decisionRng({ decisionSeed: 2 })());
  });
  it("pickIndex is deterministic for one seed and consumes exactly one draw", () => {
    let draws = 0;
    const counting = (): number => {
      draws++;
      return 0.5;
    };
    expect(pickIndex(1, counting)).toBe(0);
    expect(draws).toBe(1);
    expect(pickIndex(10, counting)).toBe(5);
    expect(draws).toBe(2);
    for (const seed of [0, 1, 99, 4294967295]) {
      expect(pickIndex(37, mulberry32(seed))).toBe(pickIndex(37, mulberry32(seed)));
    }
  });
  it("pickIndex stays in [0, n) at the ends of the generator range", () => {
    expect(pickIndex(7, () => 0)).toBe(0);
    expect(pickIndex(7, () => 0.9999999999999999)).toBe(6);
  });
  it("pickIndex rejects an invalid n", () => {
    for (const n of [0, -1, 1.5, NaN, Infinity]) expect(() => pickIndex(n, () => 0.5), String(n)).toThrow(RangeError);
  });
  it("chooseSeeded picks an element deterministically and rejects an empty list", () => {
    const items = ["a", "b", "c", "d"];
    for (const seed of [3, 4, 5]) {
      const first = chooseSeeded(items, mulberry32(seed));
      expect(items).toContain(first);
      expect(chooseSeeded(items, mulberry32(seed))).toBe(first);
    }
    expect(chooseSeeded(["only"], mulberry32(1))).toBe("only");
    expect(() => chooseSeeded([], mulberry32(1))).toThrow(RangeError);
  });

  /** Pearson chi-square statistic of `counts` against a uniform distribution. */
  const chiSquare = (counts: readonly number[]): number => {
    const total = counts.reduce((a, b) => a + b, 0);
    const expected = total / counts.length;
    return counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
  };

  it("is approximately uniform over many fixed seeds (loose chi-square bound)", () => {
    // df = n - 1; the 99.99th percentile is about 23.5 (df 6) and 29.6 (df 9). The bound 40 is loose and the seeds
    // are fixed, so the outcome is deterministic.
    for (const n of [2, 5, 7, 10]) {
      const counts = new Array<number>(n).fill(0);
      for (let seed = 0; seed < 20000; seed++) counts[pickIndex(n, mulberry32(mix32(777, seed)))]!++;
      expect(Math.min(...counts), `n=${n} counts=${counts.join(",")}`).toBeGreaterThan(0);
      expect(chiSquare(counts), `n=${n} counts=${counts.join(",")}`).toBeLessThan(40);
    }
  });
  it("is approximately uniform over one stream and over decision seeds built from AiContext", () => {
    const rng = mulberry32(2024);
    const stream = new Array<number>(8).fill(0);
    for (let i = 0; i < 16000; i++) stream[pickIndex(8, rng)]!++;
    expect(chiSquare(stream)).toBeLessThan(40);

    const items = ["w", "x", "y", "z"];
    const seen: Record<string, number> = { w: 0, x: 0, y: 0, z: 0 };
    for (let action = 0; action < 8000; action++) {
      const ctx: AiContext = { decisionSeed: mix32(99, 1 * 100000 + action) };
      seen[chooseSeeded(items, decisionRng(ctx))]!++;
    }
    expect(chiSquare(Object.values(seen))).toBeLessThan(40);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------------------------------------

describe("DIFFICULTY_LABELS", () => {
  // A compile-time exhaustiveness check: this record has a key for every Difficulty and no other.
  const TIERS: Record<Difficulty, true> = { BEGINNER: true, ADVANCED: true, EXPERT: true };

  it("covers every declared tier, and only those", () => {
    expect(Object.keys(DIFFICULTY_LABELS).sort()).toEqual(Object.keys(TIERS).sort());
    expectTypeOf<keyof typeof DIFFICULTY_LABELS>().toEqualTypeOf<Difficulty>();
  });
  it("has a non-empty Korean and English label for each tier", () => {
    for (const tier of Object.keys(TIERS) as Difficulty[]) {
      const label = DIFFICULTY_LABELS[tier];
      expect(label.en.trim(), tier).not.toBe("");
      expect(label.ko.trim(), tier).not.toBe("");
      expect(label.ko, tier).toMatch(/[가-힣]/);
      expect(label.en, tier).toMatch(/^[A-Za-z]+$/);
    }
    expect(new Set(Object.values(DIFFICULTY_LABELS).map((l) => l.en)).size).toBe(3);
    expect(new Set(Object.values(DIFFICULTY_LABELS).map((l) => l.ko)).size).toBe(3);
  });
  it("has the labels of the design", () => {
    expect(DIFFICULTY_LABELS).toEqual({
      BEGINNER: { en: "Beginner", ko: "초급" },
      ADVANCED: { en: "Advanced", ko: "고급" },
      EXPERT: { en: "Expert", ko: "전문가" },
    });
  });
  it("is frozen", () => {
    expect(Object.isFrozen(DIFFICULTY_LABELS)).toBe(true);
    for (const label of Object.values(DIFFICULTY_LABELS)) expect(Object.isFrozen(label)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Information isolation at the type level (IC-1)
// ---------------------------------------------------------------------------------------------------------

describe("framework signatures take no GameState", () => {
  /** `true` when a GameState could be passed as any parameter of `F`. */
  type TakesState<F> = F extends (...args: infer A) => unknown ? (GameState extends A[number] ? true : false) : never;

  it("has the planned parameter lists", () => {
    expectTypeOf<Parameters<typeof enumeratePlacements>>().toEqualTypeOf<[view: PlayerView]>();
    expectTypeOf<Parameters<typeof toPlaceAction>>().toEqualTypeOf<[view: PlayerView, candidate: PlacementCandidate]>();
    expectTypeOf<Parameters<AIStrategy["choosePlacement"]>>().toEqualTypeOf<[view: PlayerView, ctx: AiContext]>();
    expectTypeOf<Parameters<AIStrategy["chooseGuesses"]>>().toEqualTypeOf<[view: PlayerView, ctx: AiContext]>();
    expectTypeOf<Parameters<typeof decisionRng>>().toEqualTypeOf<[ctx: AiContext]>();
  });
  it("accepts a PlayerView or plain data in every exported function and strategy method", () => {
    expectTypeOf<TakesState<typeof enumeratePlacements>>().toEqualTypeOf<false>();
    expectTypeOf<TakesState<typeof toPlaceAction>>().toEqualTypeOf<false>();
    expectTypeOf<TakesState<typeof decisionRng>>().toEqualTypeOf<false>();
    expectTypeOf<TakesState<typeof pickIndex>>().toEqualTypeOf<false>();
    expectTypeOf<TakesState<typeof effectiveBudget>>().toEqualTypeOf<false>();
    expectTypeOf<TakesState<typeof takeBudget<number>>>().toEqualTypeOf<false>();
    expectTypeOf<TakesState<typeof chooseSeeded<number>>>().toEqualTypeOf<false>();
    expectTypeOf<TakesState<AIStrategy["choosePlacement"]>>().toEqualTypeOf<false>();
    expectTypeOf<TakesState<AIStrategy["chooseGuesses"]>>().toEqualTypeOf<false>();
  });
  it("has an AiContext of plain data (the decision seed) and a strategy id of a Difficulty", () => {
    expectTypeOf<AiContext>().toEqualTypeOf<{ readonly decisionSeed: number }>();
    expectTypeOf<AIStrategy["id"]>().toEqualTypeOf<Difficulty>();
    // The deck is not an argument: only the view and the context.
    expectTypeOf<Parameters<AIStrategy["choosePlacement"]>["length"]>().toEqualTypeOf<2>();
  });
  it("returns the Action shapes of the engine", () => {
    expectTypeOf<ReturnType<AIStrategy["choosePlacement"]>>().toEqualTypeOf<Extract<Action, { type: "PLACE" }>>();
    expectTypeOf<ReturnType<AIStrategy["chooseGuesses"]>>().toEqualTypeOf<Extract<Action, { type: "SUBMIT_GUESSES" }>>();
  });
});
