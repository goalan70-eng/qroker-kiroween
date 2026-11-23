// Tests of the BEGINNER strategy (task 12.2): flat uniform placement, uniform guesses, determinism, legality
// against the engine, edge and corner cells, information isolation, and a full four-seat smoke game.
//
// Test files may import any core module. The production strategy is checked against INDEPENDENT constructions:
// the candidate list is built here from `state.hands` and the engine's own `legalCells`, and acceptance is judged by
// `reduce`, never by the strategy's own helpers.
//
// Uniformity of the flat draw: the legal set of this game is product-shaped (every hand card is legal at every
// legal cell with either orientation, `board.validatePlacement` ignores the card), so a nested draw "card, then
// cell, then orientation" would have the same distribution as the flat draw. The implementation is flat by
// construction; the tests therefore check the flat triple distribution AND the three marginals against the
// expected proportions 1/|hand|, 1/|cells|, 1/2. Bounds are loose chi-square bounds (df + 8 * sqrt(2 df)) over
// fixed seeds, so the result is deterministic.
//
// Corpus: 30 complete games of a random legal player (fixed seeds, both visibility modes, several code biases and
// both submit orders). Observed coverage is recorded next to the guards in "coverage guards".

import fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";
import { legalCells } from "../core/board";
import { actingSeats, reduce } from "../core/engine";
import { mix32, mulberry32 } from "../core/prng";
import { GUESS_MAX, GUESS_MIN } from "../core/score";
import { defaultConfig, newGame } from "../core/state";
import type { GamePhase, GameState } from "../core/state";
import { arbHiddenPerturbation } from "../core/testing/perturb";
import { boardOf, conservationProblem, makeState } from "../core/testing/state-fixtures";
import { playToEnd } from "../core/testing/state-generators";
import type { PlayStyle } from "../core/testing/state-generators";
import { SEATS } from "../core/turn";
import type { Action, GameConfig, IdentityVisibility, Orientation, PlayerId } from "../core/types";
import { viewFor } from "../core/view";
import type { PlayerView } from "../core/view";
import { BEGINNER_STRATEGY, WORK_BUDGET } from "./random";
import { DIFFICULTY_LABELS, enumeratePlacements } from "./strategy";
import type { AIStrategy, AiContext, PlaceAction, SubmitGuessesAction } from "./strategy";

type Place = Extract<Action, { type: "PLACE" }>;
type Submit = Extract<Action, { type: "SUBMIT_GUESSES" }>;

const choosePlacement = (view: PlayerView, seed: number): PlaceAction => BEGINNER_STRATEGY.choosePlacement(view, { decisionSeed: seed });
const chooseGuesses = (view: PlayerView, seed: number): SubmitGuessesAction => BEGINNER_STRATEGY.chooseGuesses(view, { decisionSeed: seed });

/** Well-mixed fixed decision seeds: `seedAt(i)` for i = 0, 1, 2, ... */
const seedAt = (i: number, salt = 0x5eed): number => mix32(salt, i);

// ---------------------------------------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------------------------------------

const GAME_COUNT = 30;
const BIASES = [5, 30, 60, 90] as const;

interface Sample {
  readonly state: GameState;
  readonly seat: PlayerId;
  readonly visibility: IdentityVisibility;
  readonly game: number;
}

const placementSamples: Sample[] = [];
const guessSamples: Sample[] = [];
const gameStates: GameState[][] = [];

function buildCorpus(): void {
  // Include a reachable two-code batch.
  for (const g of [...Array.from({ length: GAME_COUNT }, (_, i) => i), 68]) {
    const visibility: IdentityVisibility = g % 2 === 0 ? "OWNER_ONLY" : "FACE_UP";
    const config: GameConfig = { ...defaultConfig(), identityVisibility: visibility };
    const style: PlayStyle = { codeBias: BIASES[g % BIASES.length] as number, submitOrder: g % 3 === 0 ? "RANDOM" : "SEAT_ORDER" };
    const rng = mulberry32(seedAt(g, 0xc0ffee));
    const choices = Array.from({ length: 600 }, () => Math.floor(rng() * 1_000_000));
    const game = playToEnd(1000 + g, config, choices, style);
    gameStates.push([...game.states]);
    for (const state of game.states) {
      if (state.phase === "PLACEMENT") placementSamples.push({ state, seat: state.turn, visibility, game: g });
      if (state.phase === "GUESS_COLLECT") {
        for (const seat of actingSeats(state)) guessSamples.push({ state, seat, visibility, game: g });
      }
    }
  }
}
buildCorpus();

const every = <T>(items: readonly T[], stride: number): T[] => items.filter((_, i) => i % stride === 0);

// ---------------------------------------------------------------------------------------------------------
// Fixtures: a two-code batch, and a board with a legal cell in every corner
// ---------------------------------------------------------------------------------------------------------

/**
 * P0 places H-A at G4 (row 3, col 6). It is the BR member of the quad F3 (F3 H-2, G3 D-3, F4 D-4) and the TL member
 * of the quad G4 (H4 D-5, G5 D-6, H5 H-7), so one placement forms TWO codes and opens one batch with the keys F3 and
 * G4. Random play rarely offers such a placement, so the batch is built from a hand-picked board and the real
 * `reduce`.
 */
function twoCodeBatch(visibility: IdentityVisibility): GameState {
  const config: GameConfig = { ...defaultConfig(), identityVisibility: visibility };
  const board = boardOf([
    { at: "F3", card: "H-2", owner: "P1" },
    { at: "G3", card: "D-3", owner: "P2" },
    { at: "F4", card: "D-4", owner: "P3" },
    { at: "H4", card: "D-5", owner: "P1" },
    { at: "G5", card: "D-6", owner: "P2" },
    { at: "H5", card: "H-7", owner: "P3" },
  ]);
  const start = makeState({ config, board, hands: { P0: ["H-A", "S-2", "C-3"] }, turn: "P0" });
  const placed = reduce(start, { type: "PLACE", player: "P0", card: "H-A", pos: { row: 3, col: 6 }, orientation: 0 });
  if (!placed.ok) throw new Error(`two-code fixture rejected: ${placed.error.code}`);
  const state = placed.value;
  if (state.phase !== "GUESS_COLLECT" || state.pending === null || state.pending.codes.length !== 2) {
    throw new Error("two-code fixture did not open a two-code batch");
  }
  return state;
}

/** A board with one card next to each corner (B1, G1, A7, H7), so A1, H1, A8 and H8 are legal cells. */
function cornerState(visibility: IdentityVisibility): GameState {
  const config: GameConfig = { ...defaultConfig(), identityVisibility: visibility };
  const board = boardOf([
    { at: "B1", card: "H-2", owner: "P1" },
    { at: "G1", card: "D-3", owner: "P2" },
    { at: "A7", card: "C-4", owner: "P3" },
    { at: "H7", card: "S-5", owner: "P1" },
  ]);
  return makeState({ config, board, hands: { P0: ["H-A", "S-2", "C-3"] }, turn: "P0" });
}

const TWO_CODE = { OWNER_ONLY: twoCodeBatch("OWNER_ONLY"), FACE_UP: twoCodeBatch("FACE_UP") } as const;

// ---------------------------------------------------------------------------------------------------------
// Independent helpers
// ---------------------------------------------------------------------------------------------------------

/** The triples of the game rules: hand x engine legal cells x orientations, as sorted string keys. */
function triplesOf(state: GameState, seat: PlayerId): string[] {
  const keys: string[] = [];
  for (const card of state.hands[seat]) {
    for (const pos of legalCells(state.board)) for (const o of [0, 180] as Orientation[]) keys.push(tripleKey(card, pos.row, pos.col, o));
  }
  return keys.sort();
}
const tripleKey = (card: string, row: number, col: number, o: number): string => `${card}@${row},${col}/${o}`;
const keyOfAction = (a: Place): string => tripleKey(a.card, a.pos.row, a.pos.col, a.orientation);

function chiSquare(counts: readonly number[], total: number): number {
  const expected = total / counts.length;
  return counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
}
/** A loose upper bound for a chi-square statistic with `df` degrees of freedom (about 8 standard deviations). */
const chiBound = (df: number): number => df + 8 * Math.sqrt(2 * df);

function tally<K>(keys: readonly K[], values: readonly K[]): number[] {
  const index = new Map<K, number>(keys.map((k, i) => [k, i] as const));
  const counts = new Array<number>(keys.length).fill(0);
  for (const v of values) {
    const at = index.get(v) as number;
    counts[at] = (counts[at] as number) + 1;
  }
  return counts;
}

const accepted = (state: GameState, action: Action): boolean => reduce(state, action).ok;

// ---------------------------------------------------------------------------------------------------------
// Placement: membership and uniformity
// ---------------------------------------------------------------------------------------------------------

describe("BEGINNER placement: one uniform draw over the full triple list", () => {
  const N = 6000;
  // Three states of different size: the smallest with >= 24 triples, a middle one, the largest with <= 400.
  const sized = placementSamples
    .map((s) => ({ s, n: triplesOf(s.state, s.seat).length }))
    .filter((e) => e.n >= 24 && e.n <= 400 && e.s.state.hands[e.s.seat].length >= 2)
    .sort((a, b) => a.n - b.n);
  const picks = [sized[0], sized[Math.floor(sized.length / 2)], sized[sized.length - 1]] as { s: Sample; n: number }[];

  it("has three different sizes to test", () => {
    expect(new Set(picks.map((p) => p.n)).size).toBe(3);
  });

  for (const [i, pick] of picks.entries()) {
    it(`state ${i} (${pick.n} triples): every choice is a member, the flat distribution and the three marginals are uniform`, () => {
      const { state, seat } = pick.s;
      const view = viewFor(state, seat);
      const all = triplesOf(state, seat);
      expect(all).toHaveLength(pick.n);
      const hand = [...state.hands[seat]];
      const cells = legalCells(state.board).map((p) => `${p.row},${p.col}`);
      const chosen: Place[] = [];
      for (let k = 0; k < N; k++) chosen.push(choosePlacement(view, seedAt(k)));

      const member = new Set(all);
      for (const a of chosen) expect(member.has(keyOfAction(a)), keyOfAction(a)).toBe(true);

      const flat = tally(all, chosen.map(keyOfAction));
      expect(Math.min(...flat), "every triple occurs").toBeGreaterThan(0);
      expect(chiSquare(flat, N), "flat chi-square").toBeLessThan(chiBound(all.length - 1));

      const byCard = tally(hand, chosen.map((a) => a.card));
      expect(chiSquare(byCard, N), "card marginal").toBeLessThan(chiBound(hand.length - 1));
      const byCell = tally(cells, chosen.map((a) => `${a.pos.row},${a.pos.col}`));
      expect(chiSquare(byCell, N), "cell marginal").toBeLessThan(chiBound(cells.length - 1));
      const byOrientation = tally<number>([0, 180], chosen.map((a) => a.orientation));
      expect(chiSquare(byOrientation, N), "orientation marginal").toBeLessThan(chiBound(1));
      for (const share of byOrientation) expect(Math.abs(share / N - 0.5)).toBeLessThan(0.03);
    });
  }

  it("uses a single draw: the result is the triple at index floor(mulberry32(seed)() * n) of the enumeration", () => {
    const { state, seat } = picks[1]!.s;
    const view = viewFor(state, seat);
    const list = enumeratePlacements(view);
    for (let k = 0; k < 200; k++) {
      const seed = seedAt(k, 77);
      const expected = list[Math.floor(mulberry32(seed)() * list.length)]!;
      const action = choosePlacement(view, seed);
      expect(keyOfAction(action)).toBe(tripleKey(expected.card, expected.pos.row, expected.pos.col, expected.orientation));
    }
  });

  it("different seeds give different actions", () => {
    const { state, seat } = picks[1]!.s;
    const view = viewFor(state, seat);
    const distinct = new Set<string>();
    for (let k = 0; k < 60; k++) distinct.add(keyOfAction(choosePlacement(view, seedAt(k, 5))));
    expect(distinct.size).toBeGreaterThan(30);
  });

  it("never evaluates more candidates than WORK_BUDGET (largest observed enumeration is recorded in the guards)", () => {
    for (const s of placementSamples) expect(enumeratePlacements(viewFor(s.state, s.seat)).length).toBeLessThanOrEqual(WORK_BUDGET);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Determinism and purity
// ---------------------------------------------------------------------------------------------------------

describe("BEGINNER determinism and purity", () => {
  it("same view and seed give a deeply equal action, on repeated calls and on fresh view objects", () => {
    const seeds = [0, 1, 0xffffffff, seedAt(3), seedAt(4)];
    for (const s of every(placementSamples, 13)) {
      const view = viewFor(s.state, s.seat);
      for (const seed of seeds) {
        const first = choosePlacement(view, seed);
        expect(choosePlacement(view, seed)).toEqual(first);
        expect(choosePlacement(viewFor(s.state, s.seat), seed)).toEqual(first);
      }
    }
    for (const s of every(guessSamples, 13)) {
      const view = viewFor(s.state, s.seat);
      for (const seed of seeds) {
        const first = chooseGuesses(view, seed);
        expect(chooseGuesses(view, seed)).toEqual(first);
        expect(chooseGuesses(viewFor(s.state, s.seat), seed)).toEqual(first);
      }
    }
  });

  it("does not mutate the view or the context, and returns fresh objects", () => {
    const s = placementSamples[40] as Sample;
    const view = viewFor(s.state, s.seat); // deeply frozen by the projector
    const ctx: AiContext = Object.freeze({ decisionSeed: 12345 });
    const before = JSON.stringify(view);
    const a = BEGINNER_STRATEGY.choosePlacement(view, ctx);
    const b = BEGINNER_STRATEGY.choosePlacement(view, ctx);
    expect(JSON.stringify(view)).toBe(before);
    expect(ctx).toEqual({ decisionSeed: 12345 });
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.pos).not.toBe(b.pos);
    expect(Object.isFrozen(view)).toBe(true);

    const g = guessSamples[10] as Sample;
    const gv = viewFor(g.state, g.seat);
    const gBefore = JSON.stringify(gv);
    const ga = BEGINNER_STRATEGY.chooseGuesses(gv, ctx);
    expect(JSON.stringify(gv)).toBe(gBefore);
    expect(ga.guesses).not.toBe(BEGINNER_STRATEGY.chooseGuesses(gv, ctx).guesses);
  });

  it("is a frozen strategy of tier BEGINNER with a label", () => {
    expect(BEGINNER_STRATEGY.id).toBe("BEGINNER");
    expect(Object.isFrozen(BEGINNER_STRATEGY)).toBe(true);
    expect(DIFFICULTY_LABELS.BEGINNER).toEqual({ en: "Beginner", ko: "초급" });
  });

  it("takes only a PlayerView and an AiContext (type level)", () => {
    expectTypeOf(BEGINNER_STRATEGY).toEqualTypeOf<AIStrategy>();
    expectTypeOf(BEGINNER_STRATEGY.choosePlacement).parameters.toEqualTypeOf<[PlayerView, AiContext]>();
    expectTypeOf(BEGINNER_STRATEGY.chooseGuesses).parameters.toEqualTypeOf<[PlayerView, AiContext]>();
    expectTypeOf(BEGINNER_STRATEGY.choosePlacement).returns.toEqualTypeOf<Place>();
    expectTypeOf(BEGINNER_STRATEGY.chooseGuesses).returns.toEqualTypeOf<Submit>();
  });
});

// ---------------------------------------------------------------------------------------------------------
// Legality against the engine
// ---------------------------------------------------------------------------------------------------------

describe("BEGINNER placements are accepted by reduce", () => {
  it("in every sampled reachable PLACEMENT state, for every seat and both visibility modes (2 seeds per state)", () => {
    const samples = every(placementSamples, 3);
    expect(samples.length).toBeGreaterThanOrEqual(100);
    let checked = 0;
    for (const [i, s] of samples.entries()) {
      const view = viewFor(s.state, s.seat);
      for (const salt of [1, 2]) {
        const action = choosePlacement(view, seedAt(i, salt));
        expect(action.player).toBe(s.seat);
        const result = reduce(s.state, action);
        expect(result.ok, `game ${s.game} seat ${s.seat} ${JSON.stringify(action)}`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBe(samples.length * 2);
  });

  it("also at the extreme decision seeds 0 and 4294967295 and for out-of-range seeds", () => {
    for (const s of every(placementSamples, 29)) {
      const view = viewFor(s.state, s.seat);
      for (const seed of [0, 0xffffffff, -1, 2 ** 40, 1.5]) expect(accepted(s.state, choosePlacement(view, seed))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// Guesses
// ---------------------------------------------------------------------------------------------------------

describe("BEGINNER guesses", () => {
  it("cover exactly the pending keys, are integers in 4..52 and are accepted by reduce (every acting seat, 3 seeds)", () => {
    const samples = [...guessSamples, ...(["OWNER_ONLY", "FACE_UP"] as const).flatMap((v) => actingSeats(TWO_CODE[v]).map((seat) => ({ state: TWO_CODE[v], seat })))];
    expect(guessSamples.length).toBeGreaterThanOrEqual(100);
    for (const [i, s] of samples.entries()) {
      const view = viewFor(s.state, s.seat);
      const expectedKeys = [...(s.state.pending?.codes ?? []).map((c) => c.quadKey)].sort();
      expect(view.pendingQuadKeys).toEqual(expectedKeys);
      for (const salt of [1, 2, 3]) {
        const action = chooseGuesses(view, seedAt(i, salt));
        expect(action.type).toBe("SUBMIT_GUESSES");
        expect(action.player).toBe(s.seat);
        expect(Object.keys(action.guesses).sort()).toEqual(expectedKeys);
        for (const value of Object.values(action.guesses)) {
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(GUESS_MIN);
          expect(value).toBeLessThanOrEqual(GUESS_MAX);
        }
        expect(accepted(s.state, action), `game ${(s as Sample).game ?? "fixture"} seat ${s.seat}`).toBe(true);
      }
    }
  });

  it("draws one value per key in key order from mulberry32(decisionSeed)", () => {
    for (const v of ["OWNER_ONLY", "FACE_UP"] as const) {
      const view = viewFor(TWO_CODE[v], "P1");
      expect(view.pendingQuadKeys).toEqual(["F3", "G4"]);
      for (let k = 0; k < 100; k++) {
        const seed = seedAt(k, 9);
        const rng = mulberry32(seed);
        const first = GUESS_MIN + Math.floor(rng() * 49);
        const second = GUESS_MIN + Math.floor(rng() * 49);
        expect(chooseGuesses(view, seed).guesses).toEqual({ F3: first, G4: second });
      }
    }
  });

  it("are uniform over 4..52 for each key, all 49 values occur, and the keys are not tied together", () => {
    const N = 49 * 100;
    const view = viewFor(TWO_CODE.OWNER_ONLY, "P2");
    const values = Array.from({ length: 49 }, (_, i) => GUESS_MIN + i);
    const first: number[] = [];
    const second: number[] = [];
    let equalPairs = 0;
    for (let k = 0; k < N; k++) {
      const g = chooseGuesses(view, seedAt(k, 31)).guesses;
      first.push(g.F3 as number);
      second.push(g.G4 as number);
      if (g.F3 === g.G4) equalPairs++;
    }
    for (const sample of [first, second]) {
      const counts = tally(values, sample);
      expect(Math.min(...counts), "every value 4..52 occurs").toBeGreaterThan(0);
      expect(chiSquare(counts, N), "guess chi-square").toBeLessThan(chiBound(48));
    }
    // two independent uniform draws agree with probability 1/49 (about 100 of 4900)
    expect(equalPairs).toBeGreaterThan(40);
    expect(equalPairs).toBeLessThan(200);
  });

  it("do not read any card: FACE_UP and OWNER_ONLY views of the same decision seed give the same Guesses", () => {
    for (let k = 0; k < 50; k++) {
      const seed = seedAt(k, 3);
      expect(chooseGuesses(viewFor(TWO_CODE.FACE_UP, "P3"), seed)).toEqual(chooseGuesses(viewFor(TWO_CODE.OWNER_ONLY, "P3"), seed));
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// Edge and corner cells, both orientations
// ---------------------------------------------------------------------------------------------------------

describe("BEGINNER reaches edge and corner cells and both orientations", () => {
  const isEdge = (row: number, col: number): boolean => row === 0 || col === 0 || row === 7 || col === 7;
  const isCorner = (row: number, col: number): boolean => (row === 0 || row === 7) && (col === 0 || col === 7);

  it("corner fixture: all four corners are legal, are chosen over many seeds and the placements are accepted", () => {
    for (const v of ["OWNER_ONLY", "FACE_UP"] as const) {
      const state = cornerState(v);
      const cells = legalCells(state.board);
      for (const [row, col] of [[0, 0], [0, 7], [7, 0], [7, 7]] as const) {
        expect(cells.some((p) => p.row === row && p.col === col), `corner ${row},${col} legal`).toBe(true);
      }
      const view = viewFor(state, "P0");
      const hits = new Map<string, number>();
      const orientationsAtCorner = new Set<number>();
      for (let k = 0; k < 3000; k++) {
        const action = choosePlacement(view, seedAt(k, 11));
        expect(accepted(state, action)).toBe(true);
        if (isCorner(action.pos.row, action.pos.col)) {
          const id = `${action.pos.row},${action.pos.col}`;
          hits.set(id, (hits.get(id) ?? 0) + 1);
          orientationsAtCorner.add(action.orientation);
        }
      }
      expect([...hits.keys()].sort()).toEqual(["0,0", "0,7", "7,0", "7,7"]);
      expect([...orientationsAtCorner].sort()).toEqual([0, 180]);
    }
  });

  it("long-game states with an edge legal cell: edge placements are chosen and accepted, in both orientations", () => {
    const edgeStates = placementSamples.filter((s) => legalCells(s.state.board).some((p) => isEdge(p.row, p.col)));
    expect(edgeStates.length).toBeGreaterThanOrEqual(5);
    let edgeChosen = 0;
    const orientations = new Set<number>();
    const visibilities = new Set<string>();
    for (const [i, s] of every(edgeStates, Math.max(1, Math.floor(edgeStates.length / 40))).entries()) {
      const view = viewFor(s.state, s.seat);
      let hit = false;
      for (let k = 0; k < 300 && !hit; k++) {
        const action = choosePlacement(view, seedAt(k, 100 + i));
        if (isEdge(action.pos.row, action.pos.col)) {
          expect(accepted(s.state, action)).toBe(true);
          hit = true;
          orientations.add(action.orientation);
          visibilities.add(s.visibility);
        }
      }
      if (hit) edgeChosen++;
    }
    expect(edgeChosen).toBeGreaterThanOrEqual(5);
    expect([...orientations].sort()).toEqual([0, 180]);
    expect([...visibilities].sort()).toEqual(["FACE_UP", "OWNER_ONLY"]);
  });

  it("orientation 180 and 0 both occur and are accepted in reachable states", () => {
    const seen = new Set<number>();
    for (const [i, s] of every(placementSamples, 17).entries()) {
      const action = choosePlacement(viewFor(s.state, s.seat), seedAt(i, 4));
      expect(accepted(s.state, action)).toBe(true);
      seen.add(action.orientation);
    }
    expect([...seen].sort()).toEqual([0, 180]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Information isolation
// ---------------------------------------------------------------------------------------------------------

describe("BEGINNER reads no hidden information", () => {
  it("states that differ only in hidden information (deck order, other hands, other guesses) give identical actions", () => {
    let pairs = 0;
    let changedPlacement = 0;
    let changedGuess = 0;
    const samples = [...every(placementSamples, 23), ...every(guessSamples, 11)];
    for (const [i, s] of samples.entries()) {
      const before = viewFor(s.state, s.seat);
      const perturbations = fc.sample(arbHiddenPerturbation(s.state, s.seat), { numRuns: 3, seed: 20260512 + i });
      for (const p of perturbations) {
        const after = viewFor(p.after, s.seat);
        const seed = seedAt(i, 6);
        if (s.state.phase === "PLACEMENT") {
          expect(choosePlacement(after, seed)).toEqual(choosePlacement(before, seed));
          if (p.effective.some((k) => k === "DECK_ORDER" || k === "HAND_EXCHANGE")) changedPlacement++;
        } else {
          expect(chooseGuesses(after, seed)).toEqual(chooseGuesses(before, seed));
          if (p.effective.some((k) => k === "PENDING_GUESSES" || k === "PENDING_SECRETS" || k === "HAND_EXCHANGE")) changedGuess++;
        }
        pairs++;
      }
    }
    expect(pairs).toBeGreaterThanOrEqual(100);
    expect(changedPlacement).toBeGreaterThanOrEqual(20);
    expect(changedGuess).toBeGreaterThanOrEqual(20);
  });

  it("ignores everything of the view except the hand, the occupancy, phase, turn and pending keys", () => {
    // Strip card identities, scores, history and counts: the decision must not change.
    const strip = (view: PlayerView): PlayerView => ({
      ...view,
      board: view.board.map((cell) => (cell === null ? null : { owner: cell.owner, orientation: cell.orientation, card: null })),
      scores: { P0: 0, P1: 0, P2: 0, P3: 0 },
      handCounts: { P0: 0, P1: 0, P2: 0, P3: 0 },
      deckCount: 0,
      history: [],
      lastReveal: null,
    });
    for (const [i, s] of [...every(placementSamples, 19), ...every(guessSamples, 9)].entries()) {
      const view = viewFor(s.state, s.seat);
      const bare = strip(view);
      const seed = seedAt(i, 8);
      if (s.state.phase === "PLACEMENT") expect(choosePlacement(bare, seed)).toEqual(choosePlacement(view, seed));
      else expect(chooseGuesses(bare, seed)).toEqual(chooseGuesses(view, seed));
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// Calls outside the seat's turn (documented RangeError)
// ---------------------------------------------------------------------------------------------------------

describe("BEGINNER refuses a call when the seat must not act", () => {
  const ctx: AiContext = { decisionSeed: 7 };
  it("choosePlacement: not the viewer's turn, GUESS_COLLECT, REVEAL, ENDED", () => {
    const s = placementSamples[30] as Sample;
    const other = SEATS.find((seat) => seat !== s.seat) as PlayerId;
    expect(() => BEGINNER_STRATEGY.choosePlacement(viewFor(s.state, other), ctx)).toThrow(RangeError);
    const phases = new Set<GamePhase>();
    for (const states of gameStates) {
      for (const state of states) {
        if (state.phase === "PLACEMENT" || phases.has(state.phase)) continue;
        phases.add(state.phase);
        expect(() => BEGINNER_STRATEGY.choosePlacement(viewFor(state, state.turn), ctx), state.phase).toThrow(RangeError);
      }
    }
    expect([...phases].sort()).toEqual(["ENDED", "GUESS_COLLECT", "REVEAL"]);
  });

  it("chooseGuesses: PLACEMENT, REVEAL, ENDED, and a seat that has already submitted", () => {
    const phases = new Set<GamePhase>();
    for (const states of gameStates) {
      for (const state of states) {
        if (state.phase === "GUESS_COLLECT" || phases.has(state.phase)) continue;
        phases.add(state.phase);
        expect(() => BEGINNER_STRATEGY.chooseGuesses(viewFor(state, state.turn), ctx), state.phase).toThrow(RangeError);
      }
    }
    expect([...phases].sort()).toEqual(["ENDED", "PLACEMENT", "REVEAL"]);

    const batch = TWO_CODE.OWNER_ONLY;
    const submitted = reduce(batch, { type: "SUBMIT_GUESSES", player: "P0", guesses: { F3: 20, G4: 30 } });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(() => BEGINNER_STRATEGY.chooseGuesses(viewFor(submitted.value, "P0"), ctx)).toThrow(RangeError);
    const next = chooseGuesses(viewFor(submitted.value, "P1"), 1);
    expect(accepted(submitted.value, next)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Full-game smoke: four BEGINNER seats through the engine
// ---------------------------------------------------------------------------------------------------------

interface SmokeResult {
  readonly ended: boolean;
  readonly steps: number;
  readonly placements: number;
  readonly batches: number;
  readonly problem: string | null;
  readonly state: GameState;
}

/** Plays one complete game with BEGINNER on all four seats; `decisionSeed = mix32(gameSeed, seatIndex * 100000 + actionIndex)`. */
function smokeGame(gameSeed: number, visibility: IdentityVisibility): SmokeResult {
  const config: GameConfig = { ...defaultConfig(), identityVisibility: visibility };
  const created = newGame({ seed: gameSeed, config });
  if (!created.ok) throw new Error(`newGame failed: ${created.error.code}`);
  let state = created.value;
  let actionIndex = 0;
  let placements = 0;
  let batches = 0;
  const cap = 2000;
  for (let step = 0; step < cap && state.phase !== "ENDED"; step++) {
    let action: Action;
    if (state.phase === "PLACEMENT") {
      const seat = state.turn;
      const ctx: AiContext = { decisionSeed: mix32(gameSeed, SEATS.indexOf(seat) * 100000 + actionIndex) };
      action = BEGINNER_STRATEGY.choosePlacement(viewFor(state, seat), ctx);
      placements++;
    } else if (state.phase === "GUESS_COLLECT") {
      const seat = actingSeats(state)[0] as PlayerId; // seat order
      const ctx: AiContext = { decisionSeed: mix32(gameSeed, SEATS.indexOf(seat) * 100000 + actionIndex) };
      action = BEGINNER_STRATEGY.chooseGuesses(viewFor(state, seat), ctx);
      if (actingSeats(state).length === 4) batches++;
    } else {
      action = { type: "ACK_REVEAL" };
    }
    actionIndex++;
    const result = reduce(state, action);
    if (!result.ok) {
      return { ended: false, steps: step, placements, batches, problem: `rejected ${result.error.code}: ${JSON.stringify(action)}`, state };
    }
    state = result.value;
    const problem = conservationProblem(state);
    if (problem !== null) return { ended: false, steps: step, placements, batches, problem, state };
  }
  return { ended: state.phase === "ENDED", steps: actionIndex, placements, batches, problem: null, state };
}

describe("full game with BEGINNER on all four seats", () => {
  const SEEDS = 24;
  const results: { seed: number; visibility: IdentityVisibility; result: SmokeResult }[] = [];
  for (let i = 0; i < SEEDS; i++) {
    const visibility: IdentityVisibility = i % 2 === 0 ? "OWNER_ONLY" : "FACE_UP";
    results.push({ seed: 7000 + i, visibility, result: smokeGame(7000 + i, visibility) });
  }

  it("never has an action rejected, keeps the 52 cards, and every game ends within the step cap", () => {
    for (const { seed, visibility, result } of results) {
      expect(result.problem, `seed ${seed} ${visibility}`).toBeNull();
      expect(result.ended, `seed ${seed} ${visibility} ended after ${result.steps} steps`).toBe(true);
      expect(result.steps).toBeLessThan(2000);
    }
  });

  it("awards the hand-empty bonus exactly once, and the final scores are the earned points plus that bonus", () => {
    for (const { seed, result } of results) {
      const state = result.state;
      expect(state.bonusAwarded, `seed ${seed}`).not.toBeNull();
      const bonus = state.config.scoreConfig.config.handEmptyBonus;
      for (const seat of SEATS) {
        const earned = state.history.reduce((sum, record) => sum + (record.perPlayer.find((e) => e.player === seat)?.earned ?? 0), 0);
        expect(state.scores[seat], `seed ${seed} ${seat}`).toBe(earned + (state.bonusAwarded === seat ? bonus : 0));
      }
      expect(state.hands[state.bonusAwarded as PlayerId], "the bonus seat emptied its hand").toHaveLength(0);
    }
  });

  // OBSERVED (24 seeds 7000..7023, alternating visibility): 1049 placements (about 44 per game), 42 batches opened,
  // 45 to 66 engine actions per game, and all four seats won the bonus at least once.
  it("plays real games: placements, batches and several winners-of-the-bonus across the seeds", () => {
    const totalPlacements = results.reduce((n, r) => n + r.result.placements, 0);
    const totalBatches = results.reduce((n, r) => n + r.result.batches, 0);
    const bonusSeats = new Set(results.map((r) => r.result.state.bonusAwarded));
    expect(totalPlacements).toBeGreaterThan(SEEDS * 30);
    expect(totalBatches).toBeGreaterThan(0);
    expect(totalBatches).toBeGreaterThanOrEqual(20);
    expect(bonusSeats.size).toBeGreaterThanOrEqual(2);
    expect(new Set(results.map((r) => JSON.stringify(r.result.state.log))).size).toBe(SEEDS);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Coverage guards
// ---------------------------------------------------------------------------------------------------------

describe("coverage guards of the corpus", () => {
  it("covers phases, visibility modes, seats, partial submissions, 2-code batches and edge cells", () => {
    const edge = placementSamples.filter((s) => legalCells(s.state.board).some((p) => p.row === 0 || p.col === 0 || p.row === 7 || p.col === 7));
    const corner = placementSamples.filter((s) =>
      legalCells(s.state.board).some((p) => (p.row === 0 || p.row === 7) && (p.col === 0 || p.col === 7)),
    );
    const partial = guessSamples.filter((s) => SEATS.some((seat) => s.state.pending?.guesses[seat] !== undefined));
    const twoKey = guessSamples.filter((s) => (s.state.pending?.codes.length ?? 0) === 2);
    const biggest = Math.max(...placementSamples.map((s) => enumeratePlacements(viewFor(s.state, s.seat)).length));
    const stats = {
      placement: placementSamples.length,
      placementOwnerOnly: placementSamples.filter((s) => s.visibility === "OWNER_ONLY").length,
      placementFaceUp: placementSamples.filter((s) => s.visibility === "FACE_UP").length,
      guess: guessSamples.length,
      guessOwnerOnly: guessSamples.filter((s) => s.visibility === "OWNER_ONLY").length,
      guessFaceUp: guessSamples.filter((s) => s.visibility === "FACE_UP").length,
      partial: partial.length,
      twoKeyRandomPlay: twoKey.length,
      edge: edge.length,
      corner: corner.length,
      biggest,
    };
    // OBSERVED (30 games, fixed seeds): placement states 1260 (OWNER_ONLY 644, FACE_UP 616), guess samples 1140
    // (OWNER_ONLY 500, FACE_UP 640; one sample per acting seat), samples with a submission already made 684, samples
    // of a 2-code batch in random play 10 (the fixtures add 2 x 4 more), placement states with an edge legal cell
    // 1116, with a corner legal cell 472, largest enumeration 150 triples (WORK_BUDGET is 5760). The guards sit well
    // below the observed values.
    expect(stats.twoKeyRandomPlay).toBeGreaterThanOrEqual(3);
    expect(stats.corner).toBeGreaterThanOrEqual(100);
    expect(stats.placement).toBeGreaterThanOrEqual(600);
    expect(stats.placementOwnerOnly).toBeGreaterThanOrEqual(250);
    expect(stats.placementFaceUp).toBeGreaterThanOrEqual(250);
    expect(stats.guess).toBeGreaterThanOrEqual(150);
    expect(stats.guessOwnerOnly).toBeGreaterThanOrEqual(60);
    expect(stats.guessFaceUp).toBeGreaterThanOrEqual(60);
    expect(stats.partial).toBeGreaterThanOrEqual(60);
    expect(stats.edge).toBeGreaterThanOrEqual(5);
    for (const seat of SEATS) {
      expect(placementSamples.filter((s) => s.seat === seat).length, `placements of ${seat}`).toBeGreaterThanOrEqual(100);
      expect(guessSamples.filter((s) => s.seat === seat).length, `guesses of ${seat}`).toBeGreaterThanOrEqual(30);
    }
    expect(stats.biggest).toBeLessThanOrEqual(WORK_BUDGET);
    // eslint-disable-next-line no-console
    console.log(`[12.2 coverage] ${JSON.stringify(stats)}`);
    // The fixtures supply what random play rarely does: two-code batches and corner cells.
    for (const v of ["OWNER_ONLY", "FACE_UP"] as const) expect(TWO_CODE[v].pending?.codes.map((c) => c.quadKey)).toEqual(["F3", "G4"]);
  });
});
