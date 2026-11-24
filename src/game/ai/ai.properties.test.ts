// Property tests for the AI opponents (task 12.4): Property 24 (AI action validity and determinism), Property 25 (AI
// non-interference) of .kiro/specs/qroker-playable-game/design.md, and the recorded decision time (requirement 11.5).
// Requirements 10.7, 11.2, 11.3, 11.4, 11.5.
//
// Every test iterates over `registeredDifficulties()` at test time, so the EXPERT tier of task 23.1 is covered by the
// same properties as soon as it is registered (task 23.3 does not duplicate them). The ONLY place that names the
// current tiers is the example test "the registry holds at least BEGINNER and ADVANCED" (task 23.3: extend it there).
//
// Each property is ONE test with ONE fc.assert and a fixed seed (SEED_*, NUM_RUNS_*). A failing case prints, through
// `withContext`: the game seed, the configuration, the tier, the viewer, the action index (`state.log.length`), the
// decision seed and the complete accepted action list of the failing state, and fast-check prints its own seed.
// `replayActions(seed, config, actions)` rebuilds the state.
//
// Reachability: every BASE state comes from `newGame` followed by accepted `reduce` calls (`arbReachableState`,
// `pickState`, `advanceUntil`, and a hand-picked board whose two-code batch is opened by the real `reduce`, then
// partly submitted through `reduce`). Nothing is built by hand inside a property except the board of that fixture
// (random play rarely forms a batch of two codes). The perturbed states of Property 25 are valid-consistent, NOT
// claimed to be reachable by play (see core/testing/perturb.ts); only the base states are.
//
// ---------------------------------------------------------------------------------------------------------
// Property 24: oracles (all independent of the strategy and of its helpers)
// ---------------------------------------------------------------------------------------------------------
//  - (a) determinism: a repeated call on the same frozen view, and a call on a structurally cloned and deep-frozen
//    copy with a fresh context object, return deeply equal actions (strict equality);
//  - (b) PLACE: the card is in the acting seat's hand of the STATE, the cell is in bounds, empty and has an occupied
//    orthogonal neighbour (a scan written here over `state.board`, not `legalCells`, not the view), the orientation is
//    0 or 180, the player is the seat on turn, the action has exactly the keys of a PLACE; and `reduce` accepts it;
//  - (c) SUBMIT_GUESSES: the key set equals the quad keys of `state.pending.codes` (read from the state, not from the
//    view), every value is an integer in 4..52, the player is the acting seat that has not submitted yet; `reduce`
//    accepts it;
//  - (d) the view and the context are not changed: the view is frozen (a write would throw in a module) and equals a
//    `structuredClone` taken before the calls; the frozen context still holds its seed;
//  - (e) `strategy.id` equals the registry key;
//  - work budget (design wording of Property 24): the number of candidates a placement decision evaluates is at most
//    the strategy's WORK_BUDGET. BEGINNER evaluates all candidates (`enumeratePlacements(view).length`), ADVANCED
//    evaluates `evaluatePlacements(view).evaluated`. A tier without an entry in WORK_BUDGETS (EXPERT, until task 23.3
//    adds it) is bounded by the hard bound of the game, 48 hand cards x 60 legal cells x 2 orientations;
//  - (f) ADVANCED: for every pending code whose four members are all visible in the view, the guess equals the exact
//    hidden sum computed from the STATE with a literal rank table; the sealed `hiddenSum` of the state is asserted to
//    equal that sum first (so the oracle itself is checked). FACE_UP: every code qualifies. OWNER_ONLY: the codes whose
//    four cards the viewer placed, or that are neutral or revealed;
//  - (g) BEGINNER versus ADVANCED over the whole run (a sanity guard, not a per-state claim): every FACE_UP guess of
//    ADVANCED is the exact sum while BEGINNER's guesses (uniform in 4..52 by the task contract of 12.2) hit it in only
//    a small fraction; placements and guesses of the two tiers differ on many states.
//
// Property 25: for a reachable base state S, an acting seat V and a perturbed S' (core/testing/perturb.ts: deck order,
// exchange of other seats' hands and deck, other seats' private guesses with the matching log entries, internal fields,
// pending secrets, and, OWNER_ONLY only, consistent swaps of hidden board identities), the test first asserts the
// preconditions of Property 23 (conservation, the viewer's hand, counts, scores, phase, turn, the public records, the
// board occupancy/owner/orientation and the identities visible to V by an independent oracle are identical, the
// viewer's own guess is identical, FACE_UP boards are untouched) and `viewFor(S', V)` strictly equals `viewFor(S, V)`;
// then, for every registered strategy and two decision seeds, the decisions for the two views are deeply equal.
// FACE_UP perturbs only the non-board kinds (as in Property 23).
// The NEGATIVE CONTROLS are separate example tests: changing something the viewer CAN see changes the view and, for
// some seeds, the decision. Without them Property 25 could pass because no strategy reads anything the perturbations
// touch. The sanity mutation made for this task is recorded in the notes at the end of this file.
//
// Coverage guards: after each assertion the test checks that every kind of case occurred a minimum number of times.
// The observed numbers of the fixed-seed runs are in the notes at the end of this file.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { reduce } from "../core/engine";
import { mix32, mulberry32 } from "../core/prng";
import { defaultConfig, deepFreeze } from "../core/state";
import type { GameState, PendingBatch } from "../core/state";
import { arbHiddenPerturbation, applicableKinds, withBoardCards, withDeck, withHand } from "../core/testing/perturb";
import type { HiddenPerturbation, PerturbationKind } from "../core/testing/perturb";
import { boardOf, conservationProblem, makeState } from "../core/testing/state-fixtures";
import { advanceUntil, arbReachableState, configSummary, describeReachable, pickState, playToEnd } from "../core/testing/state-generators";
import type { PlayStyle, Reachable } from "../core/testing/state-generators";
import { SEATS } from "../core/turn";
import type { Action, CardId, Difficulty, GameConfig, IdentityVisibility, PlayerId } from "../core/types";
import { viewFor } from "../core/view";
import type { PlayerView } from "../core/view";
import { WORK_BUDGET as ADVANCED_WORK_BUDGET, evaluatePlacements } from "./heuristic";
import { WORK_BUDGET as BEGINNER_WORK_BUDGET } from "./random";
import { getStrategy, registeredDifficulties } from "./registry";
import { enumeratePlacements } from "./strategy";
import type { AIStrategy, AiContext } from "./strategy";

// ---------------------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------------------

const SEED_P24 = 20261224;
const SEED_P25 = 20261225;
const NUM_RUNS_P24 = 160;
const NUM_RUNS_P25 = 200;
const TIMEOUT_MS = 180_000;

/** The specification's limit for one AI decision (requirement 11.5; design: "checked against 3000 ms"). */
const DECISION_LIMIT_MS = 3000;

/** 48 hand cards x 60 legal cells x 2 orientations: the hard bound of one placement decision's candidates. */
const GAME_BOUND_CANDIDATES = 48 * 60 * 2;

/** WORK_BUDGET of every tier that exports one. EXPERT (task 23.1) is added here by task 23.3. */
const WORK_BUDGETS: Readonly<Partial<Record<Difficulty, number>>> = {
  BEGINNER: BEGINNER_WORK_BUDGET,
  ADVANCED: ADVANCED_WORK_BUDGET,
};

type PlaceAction = Extract<Action, { type: "PLACE" }>;
type SubmitAction = Extract<Action, { type: "SUBMIT_GUESSES" }>;

// ---------------------------------------------------------------------------------------------------------
// Independent oracles and small helpers
// ---------------------------------------------------------------------------------------------------------

/** Card_Value by rank (A = 1 .. K = 13), written out; not read from core/cards. */
const RANK_VALUE: Readonly<Record<string, number>> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
};
const valueOf = (card: string): number => RANK_VALUE[card.slice(2)] as number;

const COLUMN_LETTERS = "ABCDEFGH";

/** Board indexes of the quad with Quad_Key `key` (letter = column of the top-left cell, digit = its row), TL, TR, BL, BR. */
function quadIndexes(key: string): [number, number, number, number] {
  const col = COLUMN_LETTERS.indexOf(key.charAt(0));
  const row = Number(key.slice(1)) - 1;
  if (col < 0 || !Number.isInteger(row) || row < 0 || row > 7) throw new Error(`bad quad key ${key}`);
  return [row * 8 + col, row * 8 + col + 1, (row + 1) * 8 + col, (row + 1) * 8 + col + 1];
}

/** A legal cell by an independent scan: in bounds, empty, with an occupied orthogonal neighbour. */
function legalCellOracle(board: GameState["board"], row: number, col: number): boolean {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 7 || col < 0 || col > 7) return false;
  if (board[row * 8 + col] !== null) return false;
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const r = row + dr;
    const c = col + dc;
    if (r >= 0 && r <= 7 && c >= 0 && c <= 7 && board[r * 8 + c] !== null) return true;
  }
  return false;
}

/** The seats that must act: the seat on turn in PLACEMENT, the seats that have not submitted in GUESS_COLLECT. */
function actingOracle(state: GameState): PlayerId[] {
  if (state.phase === "PLACEMENT") return [state.turn];
  if (state.phase === "GUESS_COLLECT") {
    const pending = state.pending as PendingBatch;
    return SEATS.filter((seat) => pending.guesses[seat] === undefined);
  }
  return [];
}

function fail(message: string): never {
  throw new Error(message);
}

/** A cheap check for hot loops (an `expect` per cell is needlessly slow). */
function must(condition: boolean, message: () => string): void {
  if (!condition) fail(message());
}

function withContext(context: () => string, body: () => void): void {
  try {
    body();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n--- reproduce: replayActions(seed, config, actions) ---\n${context()}`);
  }
}

const stateContext = (state: GameState): string =>
  `seed=${state.seed} ${configSummary(state.config)} config=${JSON.stringify(state.config)} actions=${JSON.stringify(state.log)}`;

/** The decision of `strategy` for `view`: `choosePlacement` in PLACEMENT, else `chooseGuesses`. */
function decideWith(strategy: AIStrategy, view: PlayerView, ctx: AiContext): Action {
  return view.phase === "PLACEMENT" ? strategy.choosePlacement(view, ctx) : strategy.chooseGuesses(view, ctx);
}

/** The decision seeds used for one decision: the derived one (as the smoke test of 12.2 does) and the raw base value. */
function decisionSeeds(base: number, state: GameState, seat: PlayerId): number[] {
  return [mix32(base, SEATS.indexOf(seat) * 100000 + state.log.length), base];
}

const countHidden = (view: PlayerView): number => view.board.filter((cell) => cell !== null && cell.card === null).length;

const arbNumbers = (length: number): fc.Arbitrary<number[]> => fc.array(fc.nat({ max: 1_000_000 }), { minLength: length, maxLength: length });
const arbDecisionSeed: fc.Arbitrary<number> = fc.oneof(
  { weight: 8, arbitrary: fc.integer({ min: 0, max: 0xffffffff }) },
  { weight: 1, arbitrary: fc.constantFrom(0, 1, 0xffffffff, 0x7fffffff, 0x80000000) },
);

// ---------------------------------------------------------------------------------------------------------
// Reaching the cases
// ---------------------------------------------------------------------------------------------------------

type Category = "PLACEMENT" | "GC0" | "GC1" | "GC2" | "GC3" | "OTHER";
const ACTING_CATEGORIES = ["PLACEMENT", "GC0", "GC1", "GC2", "GC3"] as const satisfies readonly Category[];

function categoryOf(state: GameState): Category {
  if (state.phase === "PLACEMENT") return "PLACEMENT";
  if (state.phase === "GUESS_COLLECT") return `GC${Object.keys((state.pending as PendingBatch).guesses).length}` as Category;
  return "OTHER";
}

/** A prefix state of `reach` in `category` (scanned from `pick`), else a state reached by further legal play, else `undefined`. */
function selectState(reach: Reachable, category: Category, pick: number, numbers: readonly number[]): GameState | undefined {
  const found = pickState(reach, (s) => categoryOf(s) === category, pick);
  if (found !== undefined) return found;
  const n = reach.states.length;
  const at = reach.states[Math.abs(pick) % n] as GameState;
  const start = at.phase === "ENDED" ? (reach.states[0] as GameState) : at;
  const steer: PlayStyle = { codeBias: 90, submitOrder: "SEAT_ORDER" };
  const { state } = advanceUntil(start, (s) => categoryOf(s) === category, numbers, steer, 250);
  return categoryOf(state) === category ? state : undefined;
}

function applyOk(state: GameState, action: Action): GameState {
  const result = reduce(state, action);
  if (!result.ok) return fail(`legal action rejected with ${result.error.code}: ${JSON.stringify(action)}`);
  return result.value;
}

/**
 * The hand-picked board of the two-code fixture, before the placement. `placer` is on turn with H-A, S-2, C-3. The cells
 * F3 H-2, G3 D-3, F4 D-4 and H4 D-5, G5 D-6, H5 H-7 are owned by the seats of `owners` (six seats; `ownersFor` decides whether the placer owns some).
 * Placing H-A at G4 (row 3, col 6), orientation 0, completes TWO codes (F3 as BR member, G4 as TL member).
 */
function twoCodeStart(visibility: IdentityVisibility, placer: PlayerId, owners: readonly PlayerId[]): GameState {
  const config: GameConfig = { ...defaultConfig(), identityVisibility: visibility };
  const at = ["F3", "G3", "F4", "H4", "G5", "H5"] as const;
  const cards = ["H-2", "D-3", "D-4", "D-5", "D-6", "H-7"] as const;
  const board = boardOf(at.map((cell, i) => ({ at: cell, card: cards[i] as CardId, owner: owners[i] as PlayerId })));
  return makeState({ config, board, hands: { [placer]: ["H-A", "S-2", "C-3"] }, turn: placer });
}

const TWO_CODE_PLACE = (placer: PlayerId): PlaceAction => ({
  type: "PLACE", player: placer, card: "H-A", pos: { row: 3, col: 6 }, orientation: 0,
});

/** The batch of two codes opened by the real `reduce`, then `k` submissions (seats in a rotated order, distinct values). */
function twoCodeBatch(
  visibility: IdentityVisibility,
  placer: PlayerId,
  owners: readonly PlayerId[],
  k: number,
  rot: number,
  valueK: number,
): GameState {
  let state = applyOk(twoCodeStart(visibility, placer, owners), TWO_CODE_PLACE(placer));
  const pending = state.pending;
  if (state.phase !== "GUESS_COLLECT" || pending === null || pending.codes.length !== 2) fail("the two-code fixture did not open a two-code batch");
  for (let t = 0; t < k; t++) {
    const seat = SEATS[(t + rot) % 4] as PlayerId;
    const guesses: Record<string, number> = {};
    pending.codes.forEach((code, j) => {
      guesses[code.quadKey] = 4 + ((valueK + 11 * SEATS.indexOf(seat) + 17 * j) % 49);
    });
    state = applyOk(state, { type: "SUBMIT_GUESSES", player: seat, guesses });
  }
  return state;
}

/** Owners of the six fixture cells when the placer is P0 (used by the examples). */
const FIXTURE_OWNERS: readonly PlayerId[] = ["P1", "P2", "P3", "P1", "P2", "P3"];

type OwnerPlan = "OTHERS" | "PLACER_F3" | "PLACER_ALL";

/**
 * The six cell owners of the fixture. OTHERS: three other seats (picks index into them), the placer sees none of the
 * cards. PLACER_F3: the placer also owns the three cells of the code F3, so under OWNER_ONLY it sees all four cards of F3
 * (its own H-A completes it) but not those of G4. PLACER_ALL: the placer owns all six cells and sees both codes.
 */
function ownersFor(plan: OwnerPlan, placer: PlayerId, picks: readonly number[]): PlayerId[] {
  const others = SEATS.filter((seat) => seat !== placer);
  const other = (i: number): PlayerId => others[(picks[i] as number) % others.length] as PlayerId;
  return [0, 1, 2, 3, 4, 5].map((i) => (plan === "PLACER_ALL" || (plan === "PLACER_F3" && i < 3) ? placer : other(i)));
}

const arbFixture = fc.record({
  use: fc.constantFrom(true, true, false),
  visibility: fc.constantFrom<IdentityVisibility>("OWNER_ONLY", "FACE_UP"),
  placer: fc.constantFrom<PlayerId>(...SEATS),
  plan: fc.constantFrom<OwnerPlan>("OTHERS", "OTHERS", "PLACER_F3", "PLACER_ALL"),
  ownerPicks: fc.array(fc.nat({ max: 2 }), { minLength: 6, maxLength: 6 }),
  k: fc.nat({ max: 3 }),
  rot: fc.nat({ max: 3 }),
  valueK: fc.nat({ max: 48 }),
});

// ---------------------------------------------------------------------------------------------------------
// Property 24
// ---------------------------------------------------------------------------------------------------------

interface Coverage24 {
  runs: number;
  states: number;
  fixtureStates: number;
  decisions: Record<string, number>;
  byPhase: Record<"PLACEMENT" | "GUESS_COLLECT", number>;
  byMode: Record<IdentityVisibility, number>;
  bySeat: Record<PlayerId, number>;
  byPriorSubmissions: [number, number, number, number];
  batchOfOne: number;
  batchOfTwo: number;
  withHiddenCells: number;
  hiddenCellsMax: number;
  candidatesMax: number;
  candidatesOver100: number;
  advancedExactCodes: Record<IdentityVisibility, number>;
  advancedCodesTotal: Record<IdentityVisibility, number>;
  beginnerFaceUpCodes: number;
  beginnerFaceUpExact: number;
  placementCompared: number;
  placementDiffer: number;
  guessCompared: number;
  guessDiffer: number;
}

/** (b) the independent legality oracle of a PLACE. */
function checkPlace(state: GameState, seat: PlayerId, action: PlaceAction): void {
  must(action.type === "PLACE", () => `not a PLACE: ${JSON.stringify(action)}`);
  expect(Object.keys(action).sort(), "PLACE keys").toEqual(["card", "orientation", "player", "pos", "type"]);
  expect(Object.keys(action.pos).sort(), "pos keys").toEqual(["col", "row"]);
  must(action.player === seat && state.turn === seat, () => `player ${action.player} is not the seat on turn ${state.turn}`);
  must(state.hands[seat].includes(action.card), () => `card ${action.card} is not in the hand of ${seat}`);
  must(action.orientation === 0 || action.orientation === 180, () => `orientation ${String(action.orientation)}`);
  must(legalCellOracle(state.board, action.pos.row, action.pos.col), () => `cell ${JSON.stringify(action.pos)} is not legal by the adjacency scan`);
}

/** (c) the independent oracle of a SUBMIT_GUESSES. */
function checkSubmit(state: GameState, seat: PlayerId, action: SubmitAction): void {
  must(action.type === "SUBMIT_GUESSES", () => `not a SUBMIT_GUESSES: ${JSON.stringify(action)}`);
  expect(Object.keys(action).sort(), "SUBMIT_GUESSES keys").toEqual(["guesses", "player", "type"]);
  const pending = state.pending as PendingBatch;
  must(action.player === seat && pending.guesses[seat] === undefined, () => `player ${action.player} is not an acting seat (${seat})`);
  const expectedKeys = pending.codes.map((code) => code.quadKey).sort();
  expect(Object.keys(action.guesses).sort(), "exactly the Quad_Keys of the batch").toEqual(expectedKeys);
  for (const [key, value] of Object.entries(action.guesses)) {
    must(Number.isInteger(value) && value >= 4 && value <= 52, () => `guess ${key}=${String(value)} is not an integer in 4..52`);
  }
}

/** One decision of one tier at one state: every check of Property 24 and the coverage counters. Returns the action of the first seed. */
function checkDecision24(
  tier: Difficulty,
  state: GameState,
  seat: PlayerId,
  decisionSeed: number,
  cov: Coverage24,
  exactCounts: boolean,
): Action {
  const strategy = getStrategy(tier);
  must(strategy.id === tier, () => `strategy.id ${strategy.id} differs from the registry key ${tier}`); // (e)
  const view = viewFor(state, seat);
  const snapshot = structuredClone(view);
  const ctx: AiContext = Object.freeze({ decisionSeed });

  const first = decideWith(strategy, view, ctx);
  // (a) determinism: repeated call, and a cloned deep-frozen view with a fresh context.
  const second = decideWith(strategy, view, ctx);
  const clone = deepFreeze(structuredClone(view));
  must(clone !== view, () => "the clone is the same object");
  const third = decideWith(strategy, clone, Object.freeze({ decisionSeed }));
  expect(second, "repeated call on the same view").toStrictEqual(first);
  expect(third, "call on a cloned deep-frozen view").toStrictEqual(first);

  // (d) no mutation of the view or the context.
  must(Object.isFrozen(view) && Object.isFrozen(ctx), () => "view or context is not frozen");
  expect(view, "the view is unchanged").toStrictEqual(snapshot);
  must(ctx.decisionSeed === decisionSeed, () => "the context changed");

  // (b) and (c): the independent oracles, then the engine.
  if (state.phase === "PLACEMENT") {
    checkPlace(state, seat, first as PlaceAction);
    const budget = WORK_BUDGETS[tier] ?? GAME_BOUND_CANDIDATES;
    const candidates = enumeratePlacements(view).length;
    const evaluated = tier === "ADVANCED" ? evaluatePlacements(view).evaluated : candidates;
    must(evaluated >= 1 && evaluated <= budget, () => `evaluated ${evaluated} candidates, WORK_BUDGET ${budget}`);
    must(candidates <= GAME_BOUND_CANDIDATES, () => `${candidates} candidates exceed the bound of the game`);
    cov.candidatesMax = Math.max(cov.candidatesMax, candidates);
    if (candidates > 100) cov.candidatesOver100++;
  } else {
    checkSubmit(state, seat, first as SubmitAction);
  }
  const accepted = reduce(state, first);
  must(accepted.ok, () => `reduce rejected the action: ${accepted.ok ? "" : `${accepted.error.code} ${accepted.error.detail ?? ""}`} ${JSON.stringify(first)}`);

  // (f) ADVANCED: the exact sum when all four members of a code are visible.
  const mode = state.config.identityVisibility;
  if (state.phase === "GUESS_COLLECT" && exactCounts) {
    const guesses = (first as SubmitAction).guesses;
    for (const code of (state.pending as PendingBatch).codes) {
      const indexes = quadIndexes(code.quadKey);
      const trueSum = indexes.reduce((sum, index) => sum + valueOf((state.board[index] as NonNullable<GameState["board"][number]>).card), 0);
      must(trueSum === code.hiddenSum, () => `oracle check: the sealed hiddenSum ${code.hiddenSum} differs from the card sum ${trueSum} (${code.quadKey})`);
      const allVisible = indexes.every((index) => view.board[index]?.card !== null && view.board[index]?.card !== undefined);
      if (tier === "ADVANCED") {
        cov.advancedCodesTotal[mode]++;
        if (allVisible) {
          cov.advancedExactCodes[mode]++;
          must(guesses[code.quadKey] === trueSum, () => `ADVANCED guessed ${String(guesses[code.quadKey])} for ${code.quadKey}, the exact sum of the visible cards is ${trueSum}`);
        }
        if (mode === "FACE_UP") must(allVisible, () => `FACE_UP: code ${code.quadKey} is not fully visible`);
      }
      if (tier === "BEGINNER" && mode === "FACE_UP") {
        cov.beginnerFaceUpCodes++;
        if (guesses[code.quadKey] === trueSum) cov.beginnerFaceUpExact++;
      }
    }
  }

  cov.decisions[tier] = (cov.decisions[tier] ?? 0) + 1;
  if (tier === registeredDifficulties()[0]) {
    // The state-level counters are taken once per (state, seat, seed), at the first registered tier.
    cov.byPhase[state.phase as "PLACEMENT" | "GUESS_COLLECT"]++;
    cov.byMode[mode]++;
    cov.bySeat[seat]++;
    if (state.phase === "GUESS_COLLECT") {
      const pending = state.pending as PendingBatch;
      const prior = Math.min(3, Object.keys(pending.guesses).length);
      cov.byPriorSubmissions[prior] = (cov.byPriorSubmissions[prior] as number) + 1;
      if (pending.codes.length === 1) cov.batchOfOne++;
      else cov.batchOfTwo++;
    }
    const hidden = countHidden(view);
    if (hidden > 0) cov.withHiddenCells++;
    cov.hiddenCellsMax = Math.max(cov.hiddenCellsMax, hidden);
  }
  return first;
}

describe("Property 24: AI action validity and determinism", () => {
  it(
    "for every registered strategy, every reachable acting state and every decision seed the action is valid, deterministic and pure",
    { timeout: TIMEOUT_MS },
    () => {
      // Feature: qroker-playable-game, Property 24: AI action validity and determinism
      // Validates: Requirements 11.2, 11.3, 11.4
      const cov: Coverage24 = {
        runs: 0, states: 0, fixtureStates: 0, decisions: {}, byPhase: { PLACEMENT: 0, GUESS_COLLECT: 0 },
        byMode: { OWNER_ONLY: 0, FACE_UP: 0, BLIND: 0, BLIND_SCORE_ONLY: 0 }, bySeat: { P0: 0, P1: 0, P2: 0, P3: 0 }, byPriorSubmissions: [0, 0, 0, 0],
        batchOfOne: 0, batchOfTwo: 0, withHiddenCells: 0, hiddenCellsMax: 0, candidatesMax: 0, candidatesOver100: 0,
        advancedExactCodes: { OWNER_ONLY: 0, FACE_UP: 0, BLIND: 0, BLIND_SCORE_ONLY: 0 }, advancedCodesTotal: { OWNER_ONLY: 0, FACE_UP: 0, BLIND: 0, BLIND_SCORE_ONLY: 0 },
        beginnerFaceUpCodes: 0, beginnerFaceUpExact: 0, placementCompared: 0, placementDiffer: 0, guessCompared: 0, guessDiffer: 0,
      };
      const started = Date.now();
      const tiers = registeredDifficulties();

      fc.assert(
        fc.property(
          fc.record({
            reach: arbReachableState(),
            cats: fc.subarray([...ACTING_CATEGORIES], { minLength: 2, maxLength: 5 }),
            pick: fc.nat({ max: 1_000_000 }),
            numbers: arbNumbers(300),
            seedBase: arbDecisionSeed,
            fixture: arbFixture,
          }),
          ({ reach, cats, pick, numbers, seedBase, fixture }) => {
            cov.runs++;
            const chosen = new Set<GameState>();
            for (const category of cats) {
              const state = selectState(reach, category, pick + ACTING_CATEGORIES.indexOf(category as (typeof ACTING_CATEGORIES)[number]), numbers);
              if (state !== undefined) chosen.add(state);
            }
            if (fixture.use) {
              const owners = ownersFor(fixture.plan, fixture.placer, fixture.ownerPicks);
              chosen.add(twoCodeBatch(fixture.visibility, fixture.placer, owners, fixture.k, fixture.rot, fixture.valueK));
              cov.fixtureStates++;
              // The fixture's own pre-placement state is a PLACEMENT decision too (the placer is on turn).
              chosen.add(twoCodeStart(fixture.visibility, fixture.placer, owners));
            }
            if (chosen.size === 0) chosen.add(reach.states[0] as GameState);
            for (const state of chosen) {
              cov.states++;
              for (const seat of actingOracle(state)) {
                for (const [seedIndex, decisionSeed] of decisionSeeds(seedBase, state, seat).entries()) {
                  const byTier: Record<string, Action> = {};
                  for (const tier of tiers) {
                    withContext(
                      () => `tier=${tier} viewer=${seat} actionIndex=${state.log.length} decisionSeed=${decisionSeed} phase=${state.phase} ${stateContext(state)} (run: ${describeReachable(reach)})`,
                      () => {
                        byTier[tier] = checkDecision24(tier, state, seat, decisionSeed, seedIndex === 0 ? cov : scratchCoverage(), tier === "ADVANCED" || tier === "BEGINNER");
                      },
                    );
                  }
                  // (g) the two known tiers behave differently.
                  const beginner = byTier.BEGINNER;
                  const advanced = byTier.ADVANCED;
                  if (seedIndex === 0 && beginner !== undefined && advanced !== undefined) {
                    if (state.phase === "PLACEMENT") {
                      cov.placementCompared++;
                      if (JSON.stringify(beginner) !== JSON.stringify(advanced)) cov.placementDiffer++;
                    } else {
                      cov.guessCompared++;
                      if (JSON.stringify(beginner) !== JSON.stringify(advanced)) cov.guessDiffer++;
                    }
                  }
                }
              }
            }
          },
        ),
        { seed: SEED_P24, numRuns: NUM_RUNS_P24 },
      );

      const elapsed = Date.now() - started;
      // eslint-disable-next-line no-console
      console.log(`[12.4 P24 coverage] ${JSON.stringify(cov)} ${elapsed} ms`);
      expect(tiers.length, "registered tiers").toBeGreaterThanOrEqual(2);
      for (const tier of tiers) expect(cov.decisions[tier] ?? 0, `decisions of ${tier}`).toBeGreaterThanOrEqual(1200);
      const perTier = cov.decisions[tiers[0] as Difficulty] as number;
      for (const tier of tiers) expect(cov.decisions[tier], `${tier} decides the same cases as ${tiers[0]}`).toBe(perTier);
      expect(cov.byPhase.PLACEMENT, "PLACEMENT decisions").toBeGreaterThanOrEqual(150);
      expect(cov.byPhase.GUESS_COLLECT, "GUESS_COLLECT decisions").toBeGreaterThanOrEqual(800);
      expect(cov.byMode.OWNER_ONLY, "OWNER_ONLY decisions").toBeGreaterThanOrEqual(500);
      expect(cov.byMode.FACE_UP, "FACE_UP decisions").toBeGreaterThanOrEqual(400);
      for (const seat of SEATS) expect(cov.bySeat[seat], `decisions of ${seat}`).toBeGreaterThanOrEqual(200);
      for (const [k, count] of cov.byPriorSubmissions.entries()) expect(count, `GUESS_COLLECT decisions after ${k} submissions`).toBeGreaterThanOrEqual(100);
      expect(cov.batchOfOne, "decisions on a batch of one code").toBeGreaterThanOrEqual(300);
      expect(cov.batchOfTwo, "decisions on a batch of two codes").toBeGreaterThanOrEqual(150);
      expect(cov.fixtureStates, "two-code fixture states").toBeGreaterThanOrEqual(80);
      expect(cov.withHiddenCells, "decisions with hidden cells in the view").toBeGreaterThanOrEqual(500);
      expect(cov.hiddenCellsMax, "largest number of hidden cells").toBeGreaterThanOrEqual(10);
      expect(cov.candidatesMax, "largest enumeration").toBeGreaterThanOrEqual(60);
      expect(cov.candidatesOver100, "placement decisions with more than 100 candidates").toBeGreaterThanOrEqual(5);
      expect(elapsed, "duration").toBeLessThan(120_000);

      // (f) and (g): only when both known tiers are registered (they are; the example test below asserts it).
      expect(tiers).toEqual(expect.arrayContaining(["BEGINNER", "ADVANCED"]));
      expect(cov.advancedExactCodes.FACE_UP, "ADVANCED exact-sum codes under FACE_UP").toBeGreaterThanOrEqual(200);
      expect(cov.advancedExactCodes.FACE_UP, "every FACE_UP code is fully visible").toBe(cov.advancedCodesTotal.FACE_UP);
      expect(cov.advancedExactCodes.OWNER_ONLY, "ADVANCED exact-sum codes under OWNER_ONLY (fully visible by ownership)").toBeGreaterThanOrEqual(20);
      expect(cov.advancedCodesTotal.OWNER_ONLY, "OWNER_ONLY codes that are not fully visible").toBeGreaterThan(cov.advancedExactCodes.OWNER_ONLY);
      expect(cov.beginnerFaceUpCodes, "BEGINNER FACE_UP codes").toBeGreaterThanOrEqual(200);
      expect(cov.beginnerFaceUpExact / cov.beginnerFaceUpCodes, "BEGINNER hits the exact sum rarely (uniform guess)").toBeLessThan(0.15);
      expect(cov.placementCompared, "placements compared across tiers").toBeGreaterThanOrEqual(150);
      expect(cov.placementDiffer / cov.placementCompared, "share of placements on which the tiers differ").toBeGreaterThan(0.3);
      expect(cov.guessDiffer / cov.guessCompared, "share of guess decisions on which the tiers differ").toBeGreaterThan(0.8);
    },
  );
});

/** Counters for the second decision seed (not counted twice). */
function scratchCoverage(): Coverage24 {
  return {
    runs: 0, states: 0, fixtureStates: 0, decisions: {}, byPhase: { PLACEMENT: 0, GUESS_COLLECT: 0 },
    byMode: { OWNER_ONLY: 0, FACE_UP: 0, BLIND: 0, BLIND_SCORE_ONLY: 0 }, bySeat: { P0: 0, P1: 0, P2: 0, P3: 0 }, byPriorSubmissions: [0, 0, 0, 0],
    batchOfOne: 0, batchOfTwo: 0, withHiddenCells: 0, hiddenCellsMax: 0, candidatesMax: 0, candidatesOver100: 0,
    advancedExactCodes: { OWNER_ONLY: 0, FACE_UP: 0, BLIND: 0, BLIND_SCORE_ONLY: 0 }, advancedCodesTotal: { OWNER_ONLY: 0, FACE_UP: 0, BLIND: 0, BLIND_SCORE_ONLY: 0 },
    beginnerFaceUpCodes: 0, beginnerFaceUpExact: 0, placementCompared: 0, placementDiffer: 0, guessCompared: 0, guessDiffer: 0,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Property 25
// ---------------------------------------------------------------------------------------------------------

type Cell = GameState["board"][number];

/** Cards of revealed codes, from the sealed `revealedCards` and the public history. */
function oracleRevealed(state: GameState): Set<string> {
  const cards = new Set<string>(state.revealedCards);
  for (const record of state.history) for (const code of record.codes) for (const card of code.cards) cards.add(card);
  return cards;
}

/** Per cell `owner/orientation/card-or-?` as `viewer` may see it (the visibility table of design.md, written here). */
function oracleVisibleBoard(state: GameState, viewer: PlayerId): (string | null)[] {
  const revealed = oracleRevealed(state);
  const visible = (cell: NonNullable<Cell>): boolean =>
    state.config.identityVisibility === "FACE_UP" || cell.owner === "NEUTRAL" || cell.owner === viewer || revealed.has(cell.card);
  return state.board.map((cell) => (cell === null ? null : `${cell.owner}/${cell.orientation}/${visible(cell) ? cell.card : "?"}`));
}

/** The preconditions of Property 23 for one pair, then the view equality itself. */
function checkPairPreconditions(p: HiddenPerturbation): void {
  const { before: s, after: t, viewer } = p;
  const mode = s.config.identityVisibility;
  const problem = conservationProblem(t);
  must(problem === null, () => `S' breaks card conservation: ${problem}`);
  must(conservationProblem(s) === null, () => "S breaks card conservation");
  expect(t.hands[viewer], "the viewer's hand is identical").toStrictEqual(s.hands[viewer]);
  for (const seat of SEATS) must(t.hands[seat].length === s.hands[seat].length, () => `hand size of ${seat} changed`);
  must(t.deck.length === s.deck.length, () => "deck size changed");
  expect(t.scores).toStrictEqual(s.scores);
  must(t.phase === s.phase && t.turn === s.turn, () => "phase or turn changed");
  expect(t.config).toStrictEqual(s.config);
  expect(t.history).toStrictEqual(s.history);
  expect(t.lastReveal).toStrictEqual(s.lastReveal);
  expect(t.revealedCards).toStrictEqual(s.revealedCards);
  expect(oracleVisibleBoard(t, viewer), "the identities visible to the viewer are identical").toStrictEqual(oracleVisibleBoard(s, viewer));
  s.board.forEach((cell, i) => {
    const other = t.board[i] ?? null;
    must((cell === null) === (other === null), () => `occupancy of cell ${i} changed`);
    if (cell !== null && other !== null) must(cell.owner === other.owner && cell.orientation === other.orientation, () => `owner or orientation of cell ${i} changed`);
  });
  if (mode === "FACE_UP") expect(t.board, "FACE_UP: board identities are public and never touched").toStrictEqual(s.board);
  if (s.pending !== null && t.pending !== null) {
    expect(t.pending.codes.map((c) => c.quadKey)).toStrictEqual(s.pending.codes.map((c) => c.quadKey));
    expect(Object.keys(t.pending.guesses).sort()).toStrictEqual(Object.keys(s.pending.guesses).sort());
    expect(t.pending.guesses[viewer]).toStrictEqual(s.pending.guesses[viewer]);
  } else must(s.pending === null && t.pending === null, () => "pending presence changed");
  must(p.effective.every((kind) => p.requested.includes(kind)), () => "an effective kind was not requested");
  if (mode === "FACE_UP") must(!p.effective.includes("BOARD_SWAP"), () => "FACE_UP: BOARD_SWAP was applied");
}

const zeroKinds = (): Record<PerturbationKind, number> => ({
  DECK_ORDER: 0, HAND_EXCHANGE: 0, PENDING_GUESSES: 0, INTERNAL_FIELDS: 0, PENDING_SECRETS: 0, BOARD_SWAP: 0,
});

interface Coverage25 {
  runs: number;
  pairs: number;
  decisions: Record<string, number>;
  byPhase: Record<"PLACEMENT" | "GUESS_COLLECT", number>;
  byMode: Record<IdentityVisibility, number>;
  byViewer: Record<PlayerId, number>;
  byCategory: Record<Category, number>;
  byKind: Record<PerturbationKind, number>;
  byKindPlacement: Record<PerturbationKind, number>;
  byKindGuess: Record<PerturbationKind, number>;
  multiKindPairs: number;
  nonInternalPairs: number;
  handContentChanged: number;
  swapApplicable: number;
  swapNotApplicable: number;
  viewsWithHiddenCells: number;
  fallbackBases: number;
}

describe("Property 25: AI non-interference", () => {
  it(
    "for every registered strategy, states that differ only in information hidden from the acting seat give equal decisions",
    { timeout: TIMEOUT_MS },
    () => {
      // Feature: qroker-playable-game, Property 25: AI non-interference
      // Validates: Requirements 10.7, 11.3
      const cov: Coverage25 = {
        runs: 0, pairs: 0, decisions: {}, byPhase: { PLACEMENT: 0, GUESS_COLLECT: 0 }, byMode: { OWNER_ONLY: 0, FACE_UP: 0, BLIND: 0, BLIND_SCORE_ONLY: 0 },
        byViewer: { P0: 0, P1: 0, P2: 0, P3: 0 },
        byCategory: { PLACEMENT: 0, GC0: 0, GC1: 0, GC2: 0, GC3: 0, OTHER: 0 }, byKind: zeroKinds(), byKindPlacement: zeroKinds(),
        byKindGuess: zeroKinds(), multiKindPairs: 0, nonInternalPairs: 0, handContentChanged: 0, swapApplicable: 0,
        swapNotApplicable: 0, viewsWithHiddenCells: 0, fallbackBases: 0,
      };
      const started = Date.now();
      const tiers = registeredDifficulties();

      const arbCase = fc
        .record({
          reach: arbReachableState(),
          category: fc.constantFrom<Category>("PLACEMENT", "PLACEMENT", "PLACEMENT", "GC0", "GC1", "GC1", "GC2", "GC2", "GC3", "GC3"),
          pick: fc.nat({ max: 1_000_000 }),
          numbers: arbNumbers(300),
          seatPick: fc.nat({ max: 3 }),
          seedBase: arbDecisionSeed,
        })
        .chain(({ reach, category, pick, numbers, seatPick, seedBase }) => {
          const selected = selectState(reach, category, pick, numbers);
          const base = selected ?? (reach.states[0] as GameState); // the first state is a PLACEMENT state
          const acting = actingOracle(base);
          const viewer = acting[seatPick % acting.length] as PlayerId;
          return arbHiddenPerturbation(base, viewer).map((perturbation) => ({ reach, perturbation, seedBase, fallback: selected === undefined }));
        });

      fc.assert(
        fc.property(arbCase, ({ reach, perturbation: p, seedBase, fallback }) => {
          cov.runs++;
          const { before: s, after: t, viewer } = p;
          const mode = s.config.identityVisibility;
          const phase = s.phase as "PLACEMENT" | "GUESS_COLLECT";
          if (fallback) cov.fallbackBases++;
          withContext(
            () => `viewer=${viewer} actionIndex=${s.log.length} phase=${s.phase} requested=${p.requested.join(",")} effective=${p.effective.join(",")} swapped=${JSON.stringify(p.swappedCells)} spec=${JSON.stringify(p.spec)} ${stateContext(s)} (run: ${describeReachable(reach)})`,
            () => {
              checkPairPreconditions(p);
              const viewS = viewFor(s, viewer);
              const viewT = viewFor(t, viewer);
              expect(viewT, "viewFor(S', V) deep-equals viewFor(S, V)").toStrictEqual(viewS);
              must(JSON.stringify(viewT) === JSON.stringify(viewS), () => "the serializations of the two views differ");
              must(viewT !== viewS, () => "the two views are the same object");

              for (const tier of tiers) {
                const strategy = getStrategy(tier);
                for (const decisionSeed of decisionSeeds(seedBase, s, viewer)) {
                  const ctx: AiContext = Object.freeze({ decisionSeed });
                  const decisionS = decideWith(strategy, viewS, ctx);
                  const decisionT = decideWith(strategy, viewT, Object.freeze({ decisionSeed }));
                  expect(decisionT, `tier ${tier}: decision for S' equals the decision for S (seed ${decisionSeed})`).toStrictEqual(decisionS);
                }
                cov.decisions[tier] = (cov.decisions[tier] ?? 0) + 1;
              }

              // Coverage of the pair.
              cov.pairs++;
              cov.byPhase[phase]++;
              cov.byMode[mode]++;
              cov.byViewer[viewer]++;
              cov.byCategory[categoryOf(s)]++;
              if (countHidden(viewS) > 0) cov.viewsWithHiddenCells++;
              for (const kind of p.effective) {
                cov.byKind[kind]++;
                if (phase === "PLACEMENT") cov.byKindPlacement[kind]++;
                else cov.byKindGuess[kind]++;
              }
              if (p.effective.length >= 2) cov.multiKindPairs++;
              if (p.effective.some((kind) => kind !== "INTERNAL_FIELDS")) cov.nonInternalPairs++;
              if (p.otherHandCardsChanged) cov.handContentChanged++;
              if (mode === "OWNER_ONLY") {
                if (applicableKinds(s, viewer).includes("BOARD_SWAP")) cov.swapApplicable++;
                else cov.swapNotApplicable++;
              }
            },
          );
        }),
        { seed: SEED_P25, numRuns: NUM_RUNS_P25 },
      );

      const elapsed = Date.now() - started;
      // eslint-disable-next-line no-console
      console.log(`[12.4 P25 coverage] ${JSON.stringify(cov)} ${elapsed} ms`);
      expect(cov.pairs, "pairs checked").toBe(cov.runs);
      for (const tier of tiers) expect(cov.decisions[tier], `pairs decided by ${tier}`).toBe(cov.pairs);
      expect(cov.byPhase.PLACEMENT, "PLACEMENT pairs").toBeGreaterThanOrEqual(40);
      expect(cov.byPhase.GUESS_COLLECT, "GUESS_COLLECT pairs").toBeGreaterThanOrEqual(80);
      expect(cov.byMode.OWNER_ONLY, "OWNER_ONLY pairs").toBeGreaterThanOrEqual(80);
      expect(cov.byMode.FACE_UP, "FACE_UP pairs").toBeGreaterThanOrEqual(60);
      for (const seat of SEATS) expect(cov.byViewer[seat], `pairs of viewer ${seat}`).toBeGreaterThanOrEqual(20);
      for (const category of ACTING_CATEGORIES) expect(cov.byCategory[category], `base states in ${category}`).toBeGreaterThanOrEqual(category === "PLACEMENT" ? 40 : 15);
      for (const kind of ["DECK_ORDER", "HAND_EXCHANGE", "INTERNAL_FIELDS"] as const) {
        expect(cov.byKindPlacement[kind], `${kind} in PLACEMENT`).toBeGreaterThanOrEqual(15);
        expect(cov.byKindGuess[kind], `${kind} in GUESS_COLLECT`).toBeGreaterThanOrEqual(25);
      }
      expect(cov.byKindPlacement.BOARD_SWAP, "BOARD_SWAP in PLACEMENT").toBeGreaterThanOrEqual(8);
      expect(cov.byKindGuess.BOARD_SWAP, "BOARD_SWAP in GUESS_COLLECT").toBeGreaterThanOrEqual(10);
      expect(cov.byKind.PENDING_GUESSES, "other seats' private guesses perturbed").toBeGreaterThanOrEqual(30);
      expect(cov.byKind.PENDING_SECRETS, "pending secrets perturbed").toBeGreaterThanOrEqual(30);
      for (const kind of ["PENDING_GUESSES", "PENDING_SECRETS"] as const) {
        expect(cov.byKindPlacement[kind], `${kind} never occurs in PLACEMENT`).toBe(0);
        expect(cov.byKindGuess[kind], `${kind} occurs in GUESS_COLLECT`).toBe(cov.byKind[kind]);
      }
      expect(cov.multiKindPairs, "pairs with two or more effective kinds").toBeGreaterThanOrEqual(100);
      expect(cov.nonInternalPairs, "pairs that change more than the internal fields").toBeGreaterThanOrEqual(150);
      expect(cov.handContentChanged, "pairs where another seat's hand holds different cards").toBeGreaterThanOrEqual(80);
      expect(cov.swapApplicable, "OWNER_ONLY pairs where a consistent swap exists").toBeGreaterThanOrEqual(50);
      expect(cov.viewsWithHiddenCells, "pairs whose view has hidden cells").toBeGreaterThanOrEqual(80);
      expect(cov.fallbackBases, "bases that fell back to the first state").toBeLessThanOrEqual(cov.runs * 0.1);
      expect(elapsed, "duration").toBeLessThan(120_000);
    },
  );

  // NEGATIVE CONTROLS (examples, not properties): perturbing something the viewer CAN see changes the view and, for some
  // seeds, the decision. They show that the comparison above is able to detect a dependence. The own already-visible
  // guess is not an input of any strategy (`myGuesses` is not read), so it has no control here.
  describe("negative controls", () => {
    const SEEDS = Array.from({ length: 200 }, (_, i) => mix32(0xc0de, i));
    const differs = (a: unknown, b: unknown): boolean => JSON.stringify(a) !== JSON.stringify(b);
    /** H-A at G4 (row 3, col 6): the placement that completes both codes of the fixture, in either orientation. */
    const isCompleting = (a: PlaceAction): boolean => a.card === "H-A" && a.pos.row === 3 && a.pos.col === 6;
    const sameKey = (a: PlaceAction, b: PlaceAction): boolean => JSON.stringify(a) === JSON.stringify(b);
    const placeFor = (tier: Difficulty, view: PlayerView, seed: number): PlaceAction => decideWith(getStrategy(tier), view, { decisionSeed: seed }) as PlaceAction;
    const guessFor = (tier: Difficulty, view: PlayerView, seed: number): SubmitAction => decideWith(getStrategy(tier), view, { decisionSeed: seed }) as SubmitAction;

    it("the viewer's own hand: the view changes, and BEGINNER (placement) and ADVANCED (completing card removed) change their decisions", () => {
      for (const visibility of ["OWNER_ONLY", "FACE_UP"] as const) {
        const s = twoCodeStart(visibility, "P0", FIXTURE_OWNERS);
        const replacement = s.deck[0] as CardId;
        // S-2 of the hand is exchanged with a deck card (conservation kept).
        const t = withDeck(withHand(s, "P0", ["H-A", replacement, "C-3"]), ["S-2", ...s.deck.slice(1)]);
        expect(conservationProblem(t)).toBeNull();
        const viewS = viewFor(s, "P0");
        const viewT = viewFor(t, "P0");
        expect(differs(viewS, viewT), `${visibility}: the view changes`).toBe(true);
        expect(viewS.myHand).not.toContain(replacement);
        expect(viewT.myHand).toContain(replacement);

        const chosenS = SEEDS.map((seed) => placeFor("BEGINNER", viewS, seed));
        const chosenT = SEEDS.map((seed) => placeFor("BEGINNER", viewT, seed));
        expect(new Set(chosenS.map((a) => a.card)), `${visibility}: S uses only its hand`).toEqual(new Set(["H-A", "S-2", "C-3"]));
        expect(new Set(chosenT.map((a) => a.card)), `${visibility}: S' uses only its hand`).toEqual(new Set(["H-A", replacement, "C-3"]));
        const changed = chosenS.filter((a, i) => !sameKey(a, chosenT[i] as PlaceAction)).length;
        expect(changed, `${visibility}: BEGINNER decisions that changed`).toBeGreaterThanOrEqual(30);

        if (visibility === "FACE_UP") {
          // ADVANCED completes both codes with H-A; without H-A in the hand it cannot.
          const withoutCompleting = withDeck(withHand(s, "P0", [replacement, "S-2", "C-3"]), ["H-A", ...s.deck.slice(1)]);
          const viewNoH = viewFor(withoutCompleting, "P0");
          const completing = SEEDS.map((seed) => placeFor("ADVANCED", viewS, seed));
          expect(completing.every(isCompleting), "ADVANCED completes two codes (H-A at G4; both orientations are valid for H)").toBe(true);
          const without = SEEDS.map((seed) => placeFor("ADVANCED", viewNoH, seed));
          expect(without.some((a) => a.card === "H-A"), "H-A is not in the hand any more").toBe(false);
          expect(without.some(isCompleting), "no completing placement is left").toBe(false);
          expect(without.filter((a, i) => !sameKey(a, completing[i] as PlaceAction)).length, "ADVANCED decisions that changed").toBe(SEEDS.length);
        }
      }
    });

    it("FACE_UP: changing visible board identities that spoil both quads changes the ADVANCED placement", () => {
      const s = twoCodeStart("FACE_UP", "P0", FIXTURE_OWNERS);
      const before = SEEDS.map((seed) => placeFor("ADVANCED", viewFor(s, "P0"), seed));
      expect(before.every(isCompleting), "completes two codes").toBe(true);
      // G3 (TR of F3) and H4 (TR of G4) hold D cards (valid at TR, orientation 0). H and C cards are invalid at TR.
      const spoilers = s.deck.filter((card) => card.startsWith("H-") || card.startsWith("C-")).slice(0, 2);
      expect(spoilers).toHaveLength(2);
      const g3 = 2 * 8 + 6;
      const h4 = 3 * 8 + 7;
      const swapped = new Map<number, CardId>([[g3, spoilers[0] as CardId], [h4, spoilers[1] as CardId]]);
      const t = withDeck(withBoardCards(s, swapped), [...s.deck.filter((card) => !spoilers.includes(card)), "D-3", "D-5"]);
      expect(conservationProblem(t)).toBeNull();
      const viewT = viewFor(t, "P0");
      expect(differs(viewFor(s, "P0"), viewT)).toBe(true);
      const after = SEEDS.map((seed) => placeFor("ADVANCED", viewT, seed));
      const stillChosen = after.filter(isCompleting).length;
      expect(stillChosen, "H-A at G4 completes no code any more, so it is no longer chosen").toBe(0);
    });

    it("ADVANCED guesses follow visible identities: FACE_UP exact sum of a changed card; OWNER_ONLY the viewer's own placed card", () => {
      const placer = "P0";
      // FACE_UP: viewer P1, F3 = H-2 + D-3 + D-4 + H-A. Replace D-3 (G3) by a deck card of another value.
      const faceUp = twoCodeBatch("FACE_UP", placer, FIXTURE_OWNERS, 0, 0, 0);
      const g3 = 2 * 8 + 6;
      const card = faceUp.deck.find((c) => valueOf(c) !== 3) as CardId;
      const changedFaceUp = withDeck(withBoardCards(faceUp, new Map([[g3, card]])), ["D-3", ...faceUp.deck.filter((c) => c !== card)]);
      expect(conservationProblem(changedFaceUp)).toBeNull();
      const exact = (state: GameState, key: string): number => quadIndexes(key).reduce((sum, i) => sum + valueOf((state.board[i] as NonNullable<Cell>).card), 0);
      const oldGuess = guessFor("ADVANCED", viewFor(faceUp, "P1"), 1).guesses;
      const newGuess = guessFor("ADVANCED", viewFor(changedFaceUp, "P1"), 1).guesses;
      expect(oldGuess.F3).toBe(exact(faceUp, "F3"));
      expect(newGuess.F3).toBe(exact(changedFaceUp, "F3"));
      expect(newGuess.F3).not.toBe(oldGuess.F3);
      expect(newGuess.G4, "the other code does not contain G3").toBe(oldGuess.G4);

      // OWNER_ONLY: P0 sees only its own H-A (G4, a member of both codes) and the neutral cards.
      const ownerOnly = twoCodeBatch("OWNER_ONLY", placer, FIXTURE_OWNERS, 0, 0, 0);
      const g4 = 3 * 8 + 6;
      const other = ownerOnly.deck.find((c) => valueOf(c) !== 1) as CardId;
      const changedOwner = withDeck(withBoardCards(ownerOnly, new Map([[g4, other]])), ["H-A", ...ownerOnly.deck.filter((c) => c !== other)]);
      expect(conservationProblem(changedOwner)).toBeNull();
      const viewA = viewFor(ownerOnly, "P0");
      const viewB = viewFor(changedOwner, "P0");
      expect(viewA.board[g4]?.card).toBe("H-A");
      expect(viewB.board[g4]?.card).toBe(other);
      expect(differs(viewA, viewB)).toBe(true);
      const a = guessFor("ADVANCED", viewA, 5).guesses;
      const b = guessFor("ADVANCED", viewB, 5).guesses;
      expect(differs(a, b), "the guesses depend on the viewer's own visible card").toBe(true);
      // A card hidden from P0 (G3, owned by another seat) may change without any effect on the view or the guess.
      const f3 = 2 * 8 + 5;
      const hiddenSwap = withBoardCards(
        ownerOnly,
        new Map<number, CardId>([[g3, (ownerOnly.board[f3] as NonNullable<Cell>).card], [f3, (ownerOnly.board[g3] as NonNullable<Cell>).card]]),
      );
      expect(conservationProblem(hiddenSwap)).toBeNull();
      expect(differs(viewFor(hiddenSwap, "P0"), viewA), "a hidden identity is not in the view").toBe(false);
      expect(guessFor("ADVANCED", viewFor(hiddenSwap, "P0"), 5).guesses).toEqual(a);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------------------------------------

describe("registry coverage of the property tests", () => {
  // The ONE place that names the current tiers. Task 23.3: when EXPERT is registered, add it here and add its
  // WORK_BUDGET to WORK_BUDGETS above; the properties and the timing test pick it up through registeredDifficulties().
  it("the registry holds at least BEGINNER and ADVANCED, and every id maps to a strategy that declares it", () => {
    const tiers = registeredDifficulties();
    expect(tiers).toEqual(expect.arrayContaining(["BEGINNER", "ADVANCED"]));
    for (const tier of tiers) expect(getStrategy(tier).id).toBe(tier);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Decision time (requirement 11.5): an example test, not a property
// ---------------------------------------------------------------------------------------------------------
//
// SCOPE OF THE LIMIT. Requirement 11.5: "WHEN a test measures the elapsed time of one AI decision on the test machine,
// THE test SHALL record the elapsed time and SHALL fail if one decision takes longer than 3000 ms." It is not limited
// to one tier, so the limit applies to every registered tier (task 23.3 repeats it for EXPERT: "below 3000 ms").
//
// WHAT IS MEASURED. Wall-clock time of ONE `choosePlacement` or `chooseGuesses` call (the view is built before the
// clock starts; the engine is not part of a decision), with `performance.now()` in this test file. No warm-up pass,
// no repetition, no delay: the first call of a tier includes JIT cost. The samples are the largest placement
// enumerations of the corpus (both visibility modes, mid and late game) and guess decisions, including batches of two
// codes. These are synthetic headless Node measurements on the development machine, not real user gameplay and not
// browser or mobile measurements. If the limit is exceeded under heavy CPU load by other processes, the failure is
// environmental and must be recorded as such with the idle result; the assertion is never weakened.

/** Median and p95 (nearest rank) of a list of durations. */
function summarize(values: readonly number[]): { n: number; max: number; median: number; p95: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const median = n % 2 === 1 ? (sorted[(n - 1) / 2] as number) : ((sorted[n / 2 - 1] as number) + (sorted[n / 2] as number)) / 2;
  return { n, max: sorted[n - 1] as number, median, p95: sorted[Math.ceil(0.95 * n) - 1] as number };
}

const fmt = (ms: number): string => ms.toFixed(3);

describe("AI decision time", () => {
  it("every registered strategy decides in under 3000 ms on at least 50 representative decisions per strategy", { timeout: TIMEOUT_MS }, () => {
    interface Sample {
      readonly kind: "PLACE" | "GUESS";
      readonly state: GameState;
      readonly seat: PlayerId;
      readonly view: PlayerView;
      readonly candidates: number;
    }
    // Corpus: 16 complete games (8 per visibility mode, several code biases), fixed seeds.
    const placementPool: Sample[] = [];
    const guessPool: Sample[] = [];
    const BIASES = [30, 60, 90, 50] as const;
    for (let g = 0; g < 16; g++) {
      const visibility: IdentityVisibility = g % 2 === 0 ? "OWNER_ONLY" : "FACE_UP";
      const config: GameConfig = { ...defaultConfig(), identityVisibility: visibility };
      const rng = mulberry32(mix32(0x7131, g));
      const choices = Array.from({ length: 600 }, () => Math.floor(rng() * 1_000_000));
      const style: PlayStyle = { codeBias: BIASES[g % BIASES.length] as number, submitOrder: g % 3 === 0 ? "RANDOM" : "SEAT_ORDER" };
      const game = playToEnd(5000 + g, config, choices, style);
      const mine: Sample[] = [];
      for (const state of game.states) {
        if (state.phase === "PLACEMENT") {
          const view = viewFor(state, state.turn);
          mine.push({ kind: "PLACE", state, seat: state.turn, view, candidates: enumeratePlacements(view).length });
        } else if (state.phase === "GUESS_COLLECT") {
          for (const seat of actingOracle(state)) guessPool.push({ kind: "GUESS", state, seat, view: viewFor(state, seat), candidates: 0 });
        }
      }
      // the four largest enumerations of each game (mid and late game)
      mine.sort((a, b) => b.candidates - a.candidates);
      placementPool.push(...mine.slice(0, 4));
    }
    const perMode = (mode: IdentityVisibility): Sample[] =>
      placementPool.filter((s) => s.state.config.identityVisibility === mode).sort((a, b) => b.candidates - a.candidates).slice(0, 25);
    const placements = [...perMode("OWNER_ONLY"), ...perMode("FACE_UP")];

    // Guess decisions: batches of two codes (fixtures, both modes, every acting seat, with 0 and 2 earlier submissions)
    // plus every 40th guess state of the corpus and every two-key batch of random play.
    const guesses: Sample[] = [];
    for (const visibility of ["OWNER_ONLY", "FACE_UP"] as const) {
      for (const k of [0, 2]) {
        const state = twoCodeBatch(visibility, "P0", FIXTURE_OWNERS, k, 1, 9);
        for (const seat of actingOracle(state)) guesses.push({ kind: "GUESS", state, seat, view: viewFor(state, seat), candidates: 0 });
      }
    }
    const twoKeyRandom = guessPool.filter((s) => (s.state.pending?.codes.length ?? 0) === 2);
    guesses.push(...twoKeyRandom.slice(0, 12));
    guesses.push(...guessPool.filter((_, i) => i % 40 === 0));

    const samples = [...placements, ...guesses];
    expect(placements.length, "placement samples").toBe(50);
    expect(guesses.length, "guess samples").toBeGreaterThanOrEqual(30);
    expect(new Set(guesses.map((s) => s.state.config.identityVisibility)).size, "both modes among the guesses").toBe(2);
    expect(guesses.some((s) => s.state.pending?.codes.length === 2), "a batch of two codes").toBe(true);
    const biggest = Math.max(...placements.map((s) => s.candidates));

    const report: string[] = [];
    for (const tier of registeredDifficulties()) {
      const strategy = getStrategy(tier);
      const timesAll: number[] = [];
      const timesPlace: number[] = [];
      const timesGuess: number[] = [];
      for (const [i, sample] of samples.entries()) {
        const ctx: AiContext = { decisionSeed: mix32(0x71e, i) };
        const t0 = performance.now();
        const action = decideWith(strategy, sample.view, ctx);
        const elapsed = performance.now() - t0;
        // keep the decision honest: it must be a legal action (checked outside the timed region)
        must(reduce(sample.state, action).ok, () => `tier ${tier}: the timed decision ${i} was rejected`);
        timesAll.push(elapsed);
        (sample.kind === "PLACE" ? timesPlace : timesGuess).push(elapsed);
      }
      const all = summarize(timesAll);
      const place = summarize(timesPlace);
      const guess = summarize(timesGuess);
      const line = `[12.4 timing] tier=${tier} n=${all.n} max=${fmt(all.max)} ms median=${fmt(all.median)} ms p95=${fmt(all.p95)} ms | placement n=${place.n} max=${fmt(place.max)} median=${fmt(place.median)} p95=${fmt(place.p95)} | guess n=${guess.n} max=${fmt(guess.max)} median=${fmt(guess.median)} p95=${fmt(guess.p95)} | largest enumeration ${biggest} candidates | limit ${DECISION_LIMIT_MS} ms`;
      report.push(line);
      // eslint-disable-next-line no-console
      console.log(line);
      expect(all.n, `${tier}: decisions measured`).toBeGreaterThanOrEqual(50);
      expect(all.max, `${tier}: slowest decision (ms)`).toBeLessThan(DECISION_LIMIT_MS);
    }
    expect(report.length).toBe(registeredDifficulties().length);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Notes (observed with the fixed seeds, tiers BEGINNER and ADVANCED; the coverage lines are printed by the tests)
// ---------------------------------------------------------------------------------------------------------
//
// Property 24 (seed 20261224, 160 runs, about 3.7 s): 704 base states (93 of them two-code fixtures, plus their
// pre-placement states), 1451 decisions per tier, each checked with two decision seeds (the mix32-derived one and the raw
// one), so 2902 checked decisions per tier. PLACEMENT 200, GUESS_COLLECT 1251. OWNER_ONLY 938, FACE_UP 513. Acting seats
// P0 256, P1 339, P2 387, P3 469. Prior submissions 0: 492, 1: 402, 2: 220, 3: 137. Batches of one code 1014, of two codes
// 237. Decisions whose view has hidden cells 908 (at most 34 hidden cells). Largest enumeration 132 candidates (70
// placement decisions above 100). ADVANCED exact-sum checks: FACE_UP 533 of 533 codes fully visible, every guess equal to
// the sum; OWNER_ONLY 33 of 955 codes fully visible (owned by the viewer or neutral), every guess equal to the sum.
// BEGINNER hit the exact sum on 4 of 533 FACE_UP codes (0.7 %; uniform guess, expected 2 %). The tiers chose different
// placements on 196 of 200 states and different guesses on 1231 of 1251 decisions.
// Property 25 (seed 20261225, 200 runs = 200 pairs, about 1.8 s): PLACEMENT 52, GUESS_COLLECT 148; OWNER_ONLY 101, FACE_UP
// 99; viewers P0 37, P1 37, P2 63, P3 63; base states PLACEMENT 52, GC0 25, GC1 44, GC2 46, GC3 33 (one fell back to the
// first state). Effective kinds: DECK_ORDER 96 (31 in PLACEMENT), HAND_EXCHANGE 108 (32), PENDING_GUESSES 56 (all in
// GUESS_COLLECT), INTERNAL_FIELDS 115 (29), PENDING_SECRETS 81 (all in GUESS_COLLECT), BOARD_SWAP 43 (8 in PLACEMENT, 35 in
// GUESS_COLLECT; OWNER_ONLY only). 135 pairs combine two or more kinds, 181 change more than the internal fields, 108 give
// another seat different hand cards. Both strategies decide every pair with two seeds.
// Sanity mutations (not kept, files restored with git checkout): (1) random.ts drew the placement index from
// `Math.random` instead of `decisionRng(ctx)`: Property 24 failed after 1 run (determinism) and Property 25 after 2 runs.
// (2) heuristic.ts `estimateQuadSum` added 1 when all four members are visible: Property 24 failed after 2 runs (exact
// sum of a visible code) and the ADVANCED negative control failed. A mutation that reads hidden state is impossible by the
// types (the strategies receive a `PlayerView` only), so Property 25 is exercised by mutation (1) and by the controls.
// Decision time: see docs/game/ai-decision-time.md (reproduce with the command given there).
