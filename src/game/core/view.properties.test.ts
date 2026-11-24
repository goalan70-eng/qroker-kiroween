// Property tests for the player views (task 9.2): Property 22 (no leakage of pending or hidden information in views)
// and Property 23 (view non-interference) of .kiro/specs/qroker-playable-game/design.md.
// Requirements 5.8, 7.5, 7.8, 10.3, 10.4, 10.5, 10.6.
//
// Each property is ONE test with ONE fc.assert and a fixed seed (SEED_*, NUM_RUNS_*). A failing case is reproducible:
// the failure message names the game seed, the configuration and the complete accepted action list of the failing
// state (`state.log`), the viewer, and fast-check prints its own seed; `replayActions` rebuilds the state from them.
//
// Reachability: every BASE state comes from `newGame` followed by accepted `reduce` calls (`arbReachableState`,
// `pickState`, `advanceUntil`, and a targeted driver for batches of two codes that only CHOOSES legal actions; the
// engine validates and applies every one of them). Nothing is built by hand in the properties.
//
// ---------------------------------------------------------------------------------------------------------
// Property 22: oracles and what is searched
// ---------------------------------------------------------------------------------------------------------
// PRIMARY oracle (structural and identity-set, nothing is found by a loose text search):
//  (a) the exact key set of the PlayerView, every CellView, the PublicRules (and its seats, score configuration),
//      every RevealRecord copy (and its codes and per-player lines) and every RankEntry equals a whitelist, and no
//      property name of the whole tree is one of the sealed names (seed, groupId, scoredGroups, log, deck, pending,
//      hands, guesses, ...). `hiddenSum` exists only inside reveal records and its count equals the number of codes of
//      the (public) history plus lastReveal, so the Hidden_Sum of a pending code has no place to be.
//  (b) identity sets: the cards in CardId-typed positions of the view (board cells, myHand, the cards of the reveal
//      records) are a subset of the cards this viewer MAY know, computed by an independent oracle from the sealed state
//      (OWNER_ONLY: neutral cells + own placed cells + cells whose card belongs to a revealed code + own hand;
//      FACE_UP: every occupied cell + own hand), and are disjoint from the cards of the other seats' hands and the
//      deck.
//  (c) every board cell equals the oracle cell: same owner and orientation, and `card` is the real card exactly
//      where the oracle says it is visible and `null` everywhere else.
//  (d) `myGuesses` is the viewer's own pending submission (null before it submitted, and null outside GUESS_COLLECT, so
//      null in REVEAL and ENDED); `guessSubmitted` is the booleans of the pending submissions (all false outside
//      GUESS_COLLECT); no per-seat guess map exists. The text of the view contains the pattern `"QUADKEY":NUMBER` only
//      for the viewer's own submission.
//  (e) `pendingQuadKeys` are Quad_Keys (letter A-H, digit 1-8) equal to those of the pending batch in GUESS_COLLECT and
//      empty otherwise; `history` and `lastReveal` equal the state's public records (a pending batch has none).
//  (f) `ranking` is null unless the phase is ENDED, and then equals an independent competition ranking.
//  (g) the view shares no object with the state, every object of the view is frozen, it is plain JSON data
//      (`JSON.parse(JSON.stringify(view))` deep-equals it) and two calls give equal, distinct views.
//
// SUPPLEMENTARY searches on the serialization (never the only evidence). The serialization used for them is the view
// WITHOUT `rules`: the rules hold free text (seat names, score-configuration id; arbitrary strings of the generator),
// which could coincide with a needle. `rules` is checked structurally and by deep equality with the configuration.
//   - group ids: every real group id of the state (scoredGroups, the groupId of each pending code, and the sorted
//     card join of every revealed code). They contain '|', which occurs in no other serialized value.
//   - card tokens: every card of another seat's hand and of the deck, as the JSON token `"X-Y"`. Card ids occur only
//     in CardId positions, so a hit is a real leak.
//   - the log: `state.log` holds every accepted SUBMIT_GUESSES (private guess values by design, decision D5). For
//     every (seat, quad key, value) of the log the pattern `"KEY":VALUE` is searched in the views of the other three
//     seats and in the views after the reveal / after the game ended. HOW COINCIDENCES ARE AVOIDED: a guess value
//     such as 13 also occurs as a score or a hidden sum, so the bare number is never searched. Only the object entry
//     `"KEY":VALUE` is, and in the whole view the only object keyed by Quad_Keys is `myGuesses` (the check above
//     asserts that the set of such patterns equals the viewer's own submission, nothing else). A needle can only
//     collide with the viewer's own entry of the same key and value; such needles are skipped and counted
//     (`logNeedlesSkippedOwn`). In the batches that the test drives itself, the four seats get four DIFFERENT values
//     per code, so there no needle of another seat collides. After the reveal `myGuesses` is null, so no collision is
//     possible at all.
//   - the word `guess` appears only as the two key names `myGuesses` and `guessSubmitted` and the phase name `GUESS_COLLECT`.
//   The seed is checked by the absence of the key `seed` (the bare number is coincidence-prone and is never searched).
// POSITIVE CONTROLS keep the searches honest: in GUESS_COLLECT the viewer's own log needles are FOUND in its own view,
// and every card of the viewer's hand is found as a token.
//
// ---------------------------------------------------------------------------------------------------------
// Property 23
// ---------------------------------------------------------------------------------------------------------
// `arbHiddenPerturbation` (testing/perturb.ts, which documents each kind) derives S' from a reachable S and a viewer V
// by changing only what V cannot see. For each pair the test first asserts the preconditions (52 unique cards in S',
// V's hand, the hand counts, deck count, scores, phase and turn, the public records, the board occupancy, owners and
// orientations, and the identities visible to V - computed by the test's own oracle - are identical; in FACE_UP the
// whole board is identical), then that `viewFor(S', V)` strictly deep-equals `viewFor(S, V)`. A SENSITIVITY check in
// the same property proves the changes are real: the seat that owns a swapped board cell sees the change in its own
// view, a seat whose hand changed sees it in `myHand`, a seat whose pending guess changed sees it in `myGuesses`.
// The pairs are valid-consistent states, not claimed to be reachable by play (see perturb.ts).
// The NEGATIVE CONTROL is a separate example test: perturbing something the viewer CAN see changes the view.
//
// Coverage guards: after each assertion the test checks that every kind of case occurred a minimum number of times.
// The observed numbers of the fixed-seed runs are in the notes at the end of this file.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cellAt, placeOnBoard } from "./board";
import type { Board } from "./board";
import { reduce } from "./engine";
import { isValidMember } from "./fragment-layout";
import { quadCells } from "./geometry";
import { defaultConfig, newGame } from "./state";
import type { GameState, PendingBatch } from "./state";
import {
  PERTURBATION_KINDS,
  applicableKinds,
  arbHiddenPerturbation,
  withBoardCards,
  withDeck,
  withHand,
  withSubmission,
} from "./testing/perturb";
import type { HiddenPerturbation, PerturbationKind } from "./testing/perturb";
import {
  advanceUntil,
  arbReachableState,
  choiceFrom,
  describeReachable,
  legalPlacements,
  pickState,
  randomLegalAction,
} from "./testing/state-generators";
import type { Choice, PlayStyle, Reachable } from "./testing/state-generators";
import type { Action, CardId, GameConfig, IdentityVisibility, PlayerId, Slot } from "./types";
import { viewFor } from "./view";
import type { PlayerView } from "./view";

// ---------------------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------------------

const SEED_P22 = 20260922;
const SEED_P23 = 20260923;
const NUM_RUNS_P22 = 200;
const NUM_RUNS_P23 = 300;
const TIMEOUT_MS = 180_000;
const LOG_COVERAGE = process.env.QROKER_COVERAGE_LOG === "1";

const SEAT_IDS: readonly PlayerId[] = ["P0", "P1", "P2", "P3"];

// ---------------------------------------------------------------------------------------------------------
// Independent oracles
// ---------------------------------------------------------------------------------------------------------

/** The 52 cards in canonical order (suit-major H, D, C, S; rank A..K), written out. */
const CANONICAL: readonly string[] = [
  "H-A", "H-2", "H-3", "H-4", "H-5", "H-6", "H-7", "H-8", "H-9", "H-10", "H-J", "H-Q", "H-K",
  "D-A", "D-2", "D-3", "D-4", "D-5", "D-6", "D-7", "D-8", "D-9", "D-10", "D-J", "D-Q", "D-K",
  "C-A", "C-2", "C-3", "C-4", "C-5", "C-6", "C-7", "C-8", "C-9", "C-10", "C-J", "C-Q", "C-K",
  "S-A", "S-2", "S-3", "S-4", "S-5", "S-6", "S-7", "S-8", "S-9", "S-10", "S-J", "S-Q", "S-K",
];
const CATALOG_SORTED: readonly string[] = [...CANONICAL].sort();

type Cell = GameState["board"][number];

function fail(message: string): never {
  throw new Error(message);
}

/** A cheap check for hot loops (an `expect` per cell is needlessly slow). */
function must(condition: boolean, message: () => string): void {
  if (!condition) fail(message());
}

/** Cards of revealed codes, from the sealed `revealedCards` and the public history. */
function oracleRevealed(state: GameState): Set<string> {
  const cards = new Set<string>(state.revealedCards);
  for (const record of state.history) for (const code of record.codes) for (const card of code.cards) cards.add(card);
  return cards;
}

/** The card of `cell` that `viewer` may see, or null (the visibility table of design.md, written independently). */
function oracleCard(state: GameState, viewer: PlayerId, cell: NonNullable<Cell>, revealed: ReadonlySet<string>): string | null {
  if (state.config.identityVisibility === "FACE_UP") return cell.card;
  return cell.owner === "NEUTRAL" || cell.owner === viewer || revealed.has(cell.card) ? cell.card : null;
}

/** Per cell `owner/orientation/card-or-null` as seen by `viewer` according to the oracle (null for an empty cell). */
function oracleVisibleBoard(state: GameState, viewer: PlayerId): (string | null)[] {
  const revealed = oracleRevealed(state);
  return state.board.map((cell) => (cell === null ? null : `${cell.owner}/${cell.orientation}/${oracleCard(state, viewer, cell, revealed) ?? "?"}`));
}

/** Every card the viewer may know: visible board identities and its own hand. */
function oracleAllowed(state: GameState, viewer: PlayerId): Set<string> {
  const revealed = oracleRevealed(state);
  const allowed = new Set<string>(state.hands[viewer]);
  for (const cell of state.board) {
    if (cell === null) continue;
    const card = oracleCard(state, viewer, cell, revealed);
    if (card !== null) allowed.add(card);
  }
  return allowed;
}

/** The cards of the other seats' hands and of the deck. */
function oracleForbidden(state: GameState, viewer: PlayerId): string[] {
  return [...SEAT_IDS.filter((seat) => seat !== viewer).flatMap((seat) => state.hands[seat] as readonly string[]), ...state.deck];
}

/** Competition ranking: rank = 1 + number of strictly higher scores; ordered by rank, then seat. */
function oracleRanking(scores: Readonly<Record<PlayerId, number>>): { player: PlayerId; score: number; rank: number }[] {
  return SEAT_IDS.map((player) => ({ player, score: scores[player], rank: 1 + SEAT_IDS.filter((other) => scores[other] > scores[player]).length })).sort(
    (a, b) => a.rank - b.rank || SEAT_IDS.indexOf(a.player) - SEAT_IDS.indexOf(b.player),
  );
}

function allCards(state: GameState): string[] {
  const onBoard = state.board.flatMap((cell) => (cell === null ? [] : [cell.card as string]));
  return [...onBoard, ...SEAT_IDS.flatMap((seat) => state.hands[seat] as readonly string[]), ...state.deck];
}

function conservationProblem(state: GameState): string | null {
  const cards = allCards(state);
  if (cards.length !== 52) return `${cards.length} cards`;
  const sorted = [...cards].sort();
  return sorted.every((card, i) => card === CATALOG_SORTED[i]) ? null : "cards are not the 52 catalog cards exactly once";
}

// ---------------------------------------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------------------------------------

/** Every object and array reachable from `value` (including `value`). */
function objectsIn(value: unknown, into: Set<object> = new Set<object>()): Set<object> {
  if (typeof value === "object" && value !== null && !into.has(value)) {
    into.add(value);
    for (const child of Object.values(value)) objectsIn(child, into);
  }
  return into;
}

/** Property names of every non-array object of the tree, with the path of their parent. */
function propertyNames(value: unknown, path = "$", into: { path: string; key: string }[] = []): { path: string; key: string }[] {
  if (typeof value !== "object" || value === null) return into;
  if (Array.isArray(value)) {
    value.forEach((child, i) => propertyNames(child, `${path}[${i}]`, into));
    return into;
  }
  for (const [key, child] of Object.entries(value)) {
    into.push({ path, key });
    propertyNames(child, `${path}.${key}`, into);
  }
  return into;
}

const SEALED_NAMES: ReadonlySet<string> = new Set([
  "seed", "groupId", "groupIds", "scoredGroups", "log", "deck", "pending", "hands", "guesses", "guess", "revealedCards",
  "firstPlacementDone", "placements", "bonusAwarded", "endsGame",
]);

function exactKeys(value: unknown, keys: readonly string[], path: string): void {
  must(typeof value === "object" && value !== null && !Array.isArray(value), () => `${path} is not an object`);
  const actual = Object.keys(value as object).sort();
  const expected = [...keys].sort();
  must(actual.length === expected.length && actual.every((k, i) => k === expected[i]), () => `keys at ${path}: [${actual.join(",")}] instead of [${expected.join(",")}]`);
}

const QUAD_KEY = /^[A-H][1-8]$/;

function checkRecordShape(record: unknown, path: string): void {
  exactKeys(record, ["batchIndex", "placer", "codes", "perPlayer"], path);
  const r = record as { codes: unknown[]; perPlayer: unknown[] };
  must(Array.isArray(r.codes) && Array.isArray(r.perPlayer), () => `${path}: codes/perPlayer are not arrays`);
  r.codes.forEach((code, i) => {
    exactKeys(code, ["quadKey", "cards", "hiddenSum"], `${path}.codes[${i}]`);
    must(QUAD_KEY.test((code as { quadKey: string }).quadKey), () => `${path}.codes[${i}].quadKey is not a Quad_Key`);
  });
  r.perPlayer.forEach((line, i) => exactKeys(line, ["player", "earned", "cumulative"], `${path}.perPlayer[${i}]`));
}

/** (a): exact key sets and no sealed property name anywhere in the tree. */
function checkShape(view: PlayerView): void {
  exactKeys(view, [
    "viewer", "rules", "phase", "turn", "board", "myHand", "handCounts", "deckCount", "scores", "pendingQuadKeys",
    "guessSubmitted", "myGuesses", "lastReveal", "history", "ranking",
  ], "view");
  exactKeys(view.rules, ["rulesVersion", "seats", "scoreConfig", "identityVisibility"], "view.rules");
  view.rules.seats.forEach((seat, i) => {
    const keys = ["id", "kind", "name"].concat(seat.kind === "AI" ? ["difficulty"] : []);
    exactKeys(seat, keys, `view.rules.seats[${i}]`);
  });
  exactKeys(view.rules.scoreConfig, ["id", "provisional", "config"], "view.rules.scoreConfig");
  exactKeys(view.rules.scoreConfig.config, ["rewardByError", "handEmptyBonus"], "view.rules.scoreConfig.config");
  must(view.board.length === 64, () => `board has ${view.board.length} entries`);
  view.board.forEach((cell, i) => {
    if (cell !== null) exactKeys(cell, ["owner", "orientation", "card"], `view.board[${i}]`);
  });
  for (const name of ["handCounts", "scores", "guessSubmitted"] as const) exactKeys(view[name], SEAT_IDS, `view.${name}`);
  if (view.myGuesses !== null) {
    for (const key of Object.keys(view.myGuesses)) must(QUAD_KEY.test(key), () => `myGuesses key ${key} is not a Quad_Key`);
  }
  if (view.lastReveal !== null) checkRecordShape(view.lastReveal, "view.lastReveal");
  view.history.forEach((record, i) => checkRecordShape(record, `view.history[${i}]`));
  if (view.ranking !== null) {
    must(view.ranking.length === 4, () => "ranking does not have four lines");
    view.ranking.forEach((line, i) => exactKeys(line, ["player", "score", "rank"], `view.ranking[${i}]`));
  }
  for (const { path, key } of propertyNames(view)) {
    must(!SEALED_NAMES.has(key), () => `sealed property name "${key}" at ${path}`);
    if (key === "hiddenSum") must(/^\$\.(lastReveal|history\[\d+\])\.codes\[\d+\]$/.test(path), () => `hiddenSum outside a reveal record: ${path}`);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Reaching the cases: categories, driven batches
// ---------------------------------------------------------------------------------------------------------

type Category = "PLACEMENT" | "GC0" | "GC1" | "GC2" | "GC3" | "REVEAL" | "ENDED";
const CATEGORIES: readonly Category[] = ["PLACEMENT", "GC0", "GC1", "GC2", "GC3", "REVEAL", "ENDED"];

function categoryOf(state: GameState): Category {
  switch (state.phase) {
    case "PLACEMENT":
      return "PLACEMENT";
    case "GUESS_COLLECT":
      return `GC${Object.keys((state.pending as PendingBatch).guesses).length}` as Category;
    case "REVEAL":
      return "REVEAL";
    case "ENDED":
      return "ENDED";
  }
}

/**
 * A state of the category: first a prefix state of `reach` (scanned from `pick`), else the state reached by further legal
 * play (a code-seeking style) from a prefix state, else `undefined`.
 */
function selectState(reach: Reachable, category: Category, pick: number, numbers: readonly number[]): GameState | undefined {
  const found = pickState(reach, (s) => categoryOf(s) === category, pick);
  if (found !== undefined) return found;
  const n = reach.states.length;
  const at = reach.states[Math.abs(pick) % n] as GameState;
  const start = at.phase === "ENDED" ? (reach.states[0] as GameState) : at;
  const steer: PlayStyle = { codeBias: category === "ENDED" ? 30 : 90, submitOrder: "SEAT_ORDER" };
  const { state } = advanceUntil(start, (s) => categoryOf(s) === category, numbers, steer, 250);
  return categoryOf(state) === category ? state : undefined;
}

type PlaceAction = Extract<Action, { type: "PLACE" }>;
const SLOT_NAMES: readonly Slot[] = ["TL", "TR", "BL", "BR"];
const POTENTIAL_BY_VALID_CELLS: readonly number[] = [0, 0.2, 1, 6];

/** Steering value of a board for the two-code driver (a heuristic, not a rule of the game); see engine.reveal.properties.test.ts. */
function potential(board: Board): number {
  let total = 0;
  for (let row = 0; row <= 6; row++) {
    for (let col = 0; col <= 6; col++) {
      let valid = 0;
      let occupied = 0;
      let spoiled = false;
      quadCells({ row, col }).forEach((pos, i) => {
        const placed = cellAt(board, pos);
        if (placed === null) return;
        occupied++;
        if (isValidMember(placed.card, placed.orientation, SLOT_NAMES[i] as Slot)) valid++;
        else spoiled = true;
      });
      if (!spoiled && occupied < 4) total += POTENTIAL_BY_VALID_CELLS[valid] as number;
    }
  }
  return total;
}

function applyOk(state: GameState, action: Action): GameState {
  const result = reduce(state, action);
  if (!result.ok) return fail(`legal action rejected with ${result.error.code}: ${JSON.stringify(action)}`);
  return result.value;
}

/**
 * A fresh batch of exactly two codes (GUESS_COLLECT, nobody submitted): from the generated prefix when it holds one,
 * else by further legal play steered with `potential` (two-code batches are rare in random play). Only chooses legal
 * actions; `reduce` applies them. `undefined` when the cap is reached or the game ends first.
 */
function driveToTwoCodeBatch(reach: Reachable, pick: number, numbers: readonly number[], cap = 300): GameState | undefined {
  const states = reach.states;
  const n = states.length;
  for (let k = 0; k < n; k++) {
    const s = states[(Math.abs(pick) + k) % n] as GameState;
    if (s.phase === "GUESS_COLLECT" && s.pending !== null && s.pending.codes.length === 2 && Object.keys(s.pending.guesses).length === 0) return s;
  }
  const choice: Choice = choiceFrom(numbers);
  const at = states[Math.abs(pick) % n] as GameState;
  let state: GameState = at.phase === "ENDED" ? (states[0] as GameState) : at;
  const filler: PlayStyle = { codeBias: 0, submitOrder: "RANDOM" };
  for (let step = 0; step < cap; step++) {
    if (state.phase === "ENDED") return undefined;
    if (state.phase !== "PLACEMENT") {
      const action = randomLegalAction(state, choice, filler);
      if (action === null) return undefined;
      state = applyOk(state, action);
      continue;
    }
    const all = legalPlacements(state);
    const matching = all.filter((p) => p.newCodes === 2);
    if (matching.length > 0) {
      const next = applyOk(state, (matching[choice(matching.length)] as { action: PlaceAction }).action);
      if (next.phase === "GUESS_COLLECT" && next.pending?.codes.length === 2) return next;
      return fail("the detector announced two codes but the placement gave another batch");
    }
    const quiet = all.filter((p) => p.newCodes === 0);
    const pool = quiet.length > 0 ? quiet : all;
    const scored = pool.map((p) => {
      const placed = placeOnBoard(state.board, p.action.pos, { card: p.action.card, orientation: p.action.orientation, owner: state.turn });
      return { p, value: placed.ok ? potential(placed.value) : -1 };
    });
    scored.sort((a, b) => b.value - a.value);
    const top = scored.slice(0, 3);
    state = applyOk(state, (top[choice(top.length)] as { p: { action: Action } }).p.action);
  }
  return undefined;
}

/**
 * Submissions of the four seats (a rotated seat order) with four DIFFERENT values per code ((k + 11 * seat + 17 * code) mod 49
 * is injective in the seat). Returns the states after 0, 1, 2, 3 and 4 submissions.
 */
function submitAllDistinct(batch: GameState, rot: number, valueK: number): GameState[] {
  const pending = batch.pending as PendingBatch;
  const states: GameState[] = [batch];
  let state = batch;
  for (let t = 0; t < 4; t++) {
    const seat = SEAT_IDS[(t + rot) % 4] as PlayerId;
    const guesses: Record<string, number> = {};
    pending.codes.forEach((code, j) => {
      guesses[code.quadKey] = 4 + ((valueK + 11 * SEAT_IDS.indexOf(seat) + 17 * j) % 49);
    });
    state = applyOk(state, { type: "SUBMIT_GUESSES", player: seat, guesses });
    states.push(state);
  }
  return states;
}

const contextOf = (state: GameState, viewer: PlayerId): string =>
  `seed=${state.seed} viewer=${viewer} config=${JSON.stringify(state.config)} actions=${JSON.stringify(state.log)}`;

function withContext(context: () => string, body: () => void): void {
  try {
    body();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n--- reproduce: replayActions(seed, config, actions) ---\n${context()}`);
  }
}

const arbNumbers = (length: number): fc.Arbitrary<number[]> => fc.array(fc.nat({ max: 1_000_000 }), { minLength: length, maxLength: length });

// ---------------------------------------------------------------------------------------------------------
// Property 22
// ---------------------------------------------------------------------------------------------------------

interface Coverage22 {
  runs: number;
  twoCodeAttempts: number;
  twoCodeBatches: number;
  states: number;
  views: number;
  byCategory: Record<Category, number>;
  byMode: Record<IdentityVisibility, number>;
  byViewer: Record<PlayerId, number>;
  gcBatchOfTwo: number;
  gcBatchOfOne: number;
  viewsWithHiddenCells: number;
  viewsWithHiddenCellsInGc: number;
  groupIdNeedles: number;
  cardTokenNeedles: number;
  logNeedlesChecked: number;
  logNeedlesSkippedOwn: number;
  ownNeedleControls: number;
  handTokenControls: number;
  rankingTies: number;
  statesWithHistory: number;
}

const zeroCategories = (): Record<Category, number> => ({ PLACEMENT: 0, GC0: 0, GC1: 0, GC2: 0, GC3: 0, REVEAL: 0, ENDED: 0 });

/** Group ids of the sealed state: scoredGroups, the pending codes, and the sorted card join of each revealed code. */
function realGroupIds(state: GameState): string[] {
  const ids = new Set<string>(state.scoredGroups);
  for (const code of state.pending?.codes ?? []) ids.add(code.groupId);
  for (const record of state.history) for (const code of record.codes) ids.add([...code.cards].sort().join("|"));
  return [...ids];
}

function checkView(state: GameState, viewer: PlayerId, stateObjects: ReadonlySet<object>, cov: Coverage22): void {
  const view = viewFor(state, viewer);
  const mode = state.config.identityVisibility;
  const pending = state.phase === "GUESS_COLLECT" ? state.pending : null;

  // (g) references, frozen, plain JSON, deterministic.
  const viewObjects = objectsIn(view);
  for (const o of viewObjects) {
    must(!stateObjects.has(o), () => "the view shares an object with the state");
    must(Object.isFrozen(o), () => "an object of the view is not frozen");
  }
  const json = JSON.stringify(view);
  expect(JSON.parse(json), "the view is plain JSON data").toStrictEqual(view);
  const again = viewFor(state, viewer);
  must(again !== view, () => "two calls return the same object");
  expect(again, "viewFor is deterministic").toStrictEqual(view);

  // (a) shape and sealed names.
  checkShape(view);

  // Basic facts.
  must(view.viewer === viewer && view.phase === state.phase && view.turn === state.turn, () => "viewer, phase or turn differ from the state");
  expect(view.rules, "rules equal the configuration").toStrictEqual({
    rulesVersion: state.config.rulesVersion,
    seats: state.config.seats,
    scoreConfig: state.config.scoreConfig,
    identityVisibility: state.config.identityVisibility,
  });
  expect(view.handCounts).toStrictEqual({ P0: state.hands.P0.length, P1: state.hands.P1.length, P2: state.hands.P2.length, P3: state.hands.P3.length });
  must(view.deckCount === state.deck.length, () => "deckCount differs");
  expect(view.scores).toStrictEqual({ P0: state.scores.P0, P1: state.scores.P1, P2: state.scores.P2, P3: state.scores.P3 });
  must(
    view.myHand.length === state.hands[viewer].length && view.myHand.every((card, i) => card === [...state.hands[viewer]].sort((a, b) => CANONICAL.indexOf(a) - CANONICAL.indexOf(b))[i]),
    () => "myHand is not the viewer's hand in canonical order",
  );

  // (b) and (c): identity sets and cells.
  const revealed = oracleRevealed(state);
  const allowed = oracleAllowed(state, viewer);
  const forbidden = oracleForbidden(state, viewer);
  const inView: string[] = [];
  let hiddenCells = 0;
  state.board.forEach((cell, i) => {
    const seen = view.board[i] ?? null;
    if (cell === null) {
      must(seen === null, () => `cell ${i} is empty in the state but not in the view`);
      return;
    }
    must(seen !== null && seen.owner === cell.owner && seen.orientation === cell.orientation, () => `cell ${i}: owner or orientation differ`);
    const expectedCard = oracleCard(state, viewer, cell, revealed);
    must((seen as NonNullable<typeof seen>).card === expectedCard, () => `cell ${i}: card ${String(seen?.card)} instead of ${String(expectedCard)} (owner ${cell.owner}, viewer ${viewer}, ${mode})`);
    if (expectedCard === null) hiddenCells++;
    else inView.push(expectedCard);
  });
  inView.push(...view.myHand);
  must(new Set(inView).size === inView.length, () => "a card appears twice among the board identities and the hand");
  const positions = [...inView, ...[view.lastReveal, ...view.history].flatMap((record) => (record === null ? [] : record.codes.flatMap((code) => code.cards)))];
  for (const card of positions) must(allowed.has(card), () => `card ${card} is in the view but the viewer may not know it`);
  for (const card of forbidden) must(!positions.includes(card as CardId), () => `card ${card} (another hand or the deck) is in the view`);
  if (mode === "FACE_UP") must(hiddenCells === 0, () => "FACE_UP hides a cell");
  if (hiddenCells > 0) {
    cov.viewsWithHiddenCells++;
    if (pending !== null) cov.viewsWithHiddenCellsInGc++;
  }

  // (d) guesses.
  const own = pending?.guesses[viewer];
  if (own === undefined) must(view.myGuesses === null, () => "myGuesses is not null without a submission");
  else expect(view.myGuesses, "myGuesses is the viewer's own submission").toStrictEqual(own);
  expect(view.guessSubmitted).toStrictEqual({
    P0: pending?.guesses.P0 !== undefined, P1: pending?.guesses.P1 !== undefined, P2: pending?.guesses.P2 !== undefined, P3: pending?.guesses.P3 !== undefined,
  });
  if (state.phase !== "GUESS_COLLECT") must(view.myGuesses === null && SEAT_IDS.every((seat) => !view.guessSubmitted[seat]), () => `a guess is present in phase ${state.phase}`);

  // (e) pending keys and public records.
  const expectedKeys = pending === null ? [] : pending.codes.map((code) => code.quadKey).sort();
  expect(view.pendingQuadKeys, "pendingQuadKeys").toStrictEqual(expectedKeys);
  expect(view.history, "history equals the public records").toStrictEqual(state.history);
  expect(view.lastReveal, "lastReveal equals the public record").toStrictEqual(state.lastReveal);
  const recordCodes = state.history.reduce((sum, record) => sum + record.codes.length, 0) + (state.lastReveal?.codes.length ?? 0);
  const noRules = JSON.stringify({ ...view, rules: null });
  must((noRules.match(/"hiddenSum"/g) ?? []).length === recordCodes, () => "the number of hiddenSum fields differs from the number of revealed codes");
  must(pending === null || state.history.length === view.history.length, () => "a pending batch has a record in the history");

  // (f) ranking.
  if (state.phase === "ENDED") {
    expect(view.ranking, "ranking is the competition ranking").toStrictEqual(oracleRanking(state.scores));
    if (new Set(SEAT_IDS.map((seat) => state.scores[seat])).size < 4) cov.rankingTies++;
  } else must(view.ranking === null, () => "ranking exists before the end of the game");

  // Supplementary searches (on the serialization without `rules`).
  for (const id of realGroupIds(state)) {
    cov.groupIdNeedles++;
    must(!noRules.includes(id), () => `group id ${id} found in the view`);
  }
  for (const card of forbidden) {
    cov.cardTokenNeedles++;
    must(!noRules.includes(`"${card}"`), () => `token "${card}" (another hand or the deck) found in the view`);
  }
  for (const card of state.hands[viewer]) {
    cov.handTokenControls++;
    must(noRules.includes(`"${card}"`), () => `control: own hand card ${card} not found as a token`);
  }
  must(!/guess/i.test(noRules.replace(/"myGuesses"|"guessSubmitted"|"GUESS_COLLECT"/g, "")), () => 'the word "guess" occurs outside myGuesses, guessSubmitted and the phase name');
  must(!/"seed"/.test(noRules), () => "a seed field is in the view");

  // The only `"QUADKEY":NUMBER` patterns are the viewer's own submission; log needles of other seats are absent.
  const patterns = new Set([...noRules.matchAll(/"([A-H][1-8])":(\d+)(?![\d.])/g)].map((m) => `${m[1]}:${m[2]}`));
  const ownPatterns = new Set(Object.entries(view.myGuesses ?? {}).map(([key, value]) => `${key}:${value}`));
  expect([...patterns].sort(), "QUADKEY:NUMBER patterns of the view are the viewer's own entries").toEqual([...ownPatterns].sort());
  for (const action of state.log) {
    if (action.type !== "SUBMIT_GUESSES") continue;
    for (const [key, value] of Object.entries(action.guesses)) {
      const needle = `${key}:${value}`;
      if (action.player === viewer) {
        if (pending !== null && own !== undefined && own[key] === value) {
          cov.ownNeedleControls++;
          must(patterns.has(needle), () => `control: own needle ${needle} not found in the own view`);
        }
        continue;
      }
      if (ownPatterns.has(needle)) {
        cov.logNeedlesSkippedOwn++;
        continue;
      }
      cov.logNeedlesChecked++;
      must(!patterns.has(needle), () => `guess ${needle} of ${action.player} found in the view of ${viewer}`);
    }
  }
  cov.views++;
  cov.byViewer[viewer]++;
}

function checkState(state: GameState, cov: Coverage22): void {
  const stateObjects = objectsIn(state);
  const category = categoryOf(state);
  cov.states++;
  cov.byCategory[category]++;
  cov.byMode[state.config.identityVisibility]++;
  if (state.phase === "GUESS_COLLECT") {
    if ((state.pending as PendingBatch).codes.length >= 2) cov.gcBatchOfTwo++;
    else cov.gcBatchOfOne++;
  }
  if (state.history.length > 0) cov.statesWithHistory++;
  for (const viewer of SEAT_IDS) withContext(() => contextOf(state, viewer), () => checkView(state, viewer, stateObjects, cov));
}

describe("Property 22: no leakage of pending or hidden information in views", () => {
  it(
    "every viewer's view of reachable states in every phase holds only what that viewer may know",
    { timeout: TIMEOUT_MS },
    () => {
      // Feature: qroker-playable-game, Property 22: No leakage of pending or hidden information in views
      // Validates: Requirements 5.8, 7.5, 7.8, 10.3, 10.4, 10.5
      const cov: Coverage22 = {
        runs: 0, twoCodeAttempts: 0, twoCodeBatches: 0, states: 0, views: 0, byCategory: zeroCategories(),
        byMode: { OWNER_ONLY: 0, FACE_UP: 0, BLIND: 0, BLIND_SCORE_ONLY: 0 }, byViewer: { P0: 0, P1: 0, P2: 0, P3: 0 }, gcBatchOfTwo: 0, gcBatchOfOne: 0,
        viewsWithHiddenCells: 0, viewsWithHiddenCellsInGc: 0, groupIdNeedles: 0, cardTokenNeedles: 0, logNeedlesChecked: 0,
        logNeedlesSkippedOwn: 0, ownNeedleControls: 0, handTokenControls: 0, rankingTies: 0, statesWithHistory: 0,
      };
      const started = Date.now();

      fc.assert(
        fc.property(
          fc.record({
            reach: arbReachableState(),
            cats: fc.subarray([...CATEGORIES], { minLength: 3, maxLength: 5 }),
            pick: fc.nat({ max: 1_000_000 }),
            numbers: arbNumbers(300),
            wantTwo: fc.constantFrom(false, false, true),
            rot: fc.nat({ max: 3 }),
            valueK: fc.nat({ max: 48 }),
          }),
          ({ reach, cats, pick, numbers, wantTwo, rot, valueK }) => {
            cov.runs++;
            const chosen = new Set<GameState>();
            for (const category of cats) {
              const state = selectState(reach, category, pick + CATEGORIES.indexOf(category), numbers);
              if (state !== undefined) chosen.add(state);
            }
            if (wantTwo) {
              cov.twoCodeAttempts++;
              const batch = driveToTwoCodeBatch(reach, pick, numbers);
              if (batch !== undefined) {
                cov.twoCodeBatches++;
                for (const s of submitAllDistinct(batch, rot, valueK)) chosen.add(s);
              }
            }
            if (chosen.size === 0) chosen.add(reach.state);
            try {
              for (const state of chosen) checkState(state, cov);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              throw new Error(`${message}\n(run: ${describeReachable(reach)})`);
            }
          },
        ),
        { seed: SEED_P22, numRuns: NUM_RUNS_P22 },
      );

      const elapsed = Date.now() - started;
      if (LOG_COVERAGE) console.info("P22 coverage", JSON.stringify(cov), `${elapsed} ms`);
      expect(cov.byCategory.PLACEMENT, "PLACEMENT states").toBeGreaterThanOrEqual(60);
      expect(cov.byCategory.GC0, "GUESS_COLLECT states with 0 submissions").toBeGreaterThanOrEqual(80);
      expect(cov.byCategory.GC1, "GUESS_COLLECT states with 1 submission").toBeGreaterThanOrEqual(80);
      expect(cov.byCategory.GC2, "GUESS_COLLECT states with 2 submissions").toBeGreaterThanOrEqual(80);
      expect(cov.byCategory.GC3, "GUESS_COLLECT states with 3 submissions").toBeGreaterThanOrEqual(80);
      expect(cov.byCategory.REVEAL, "REVEAL states").toBeGreaterThanOrEqual(80);
      expect(cov.byCategory.ENDED, "ENDED states").toBeGreaterThanOrEqual(50);
      expect(cov.byMode.OWNER_ONLY, "OWNER_ONLY states").toBeGreaterThanOrEqual(300);
      expect(cov.byMode.FACE_UP, "FACE_UP states").toBeGreaterThanOrEqual(200);
      for (const seat of SEAT_IDS) expect(cov.byViewer[seat], `views of ${seat}`).toBe(cov.states);
      expect(cov.gcBatchOfTwo, "GUESS_COLLECT states with a batch of two codes").toBeGreaterThanOrEqual(100);
      expect(cov.gcBatchOfOne, "GUESS_COLLECT states with a batch of one code").toBeGreaterThanOrEqual(200);
      expect(cov.twoCodeBatches, "two-code batches reached").toBeGreaterThanOrEqual(30);
      expect(cov.viewsWithHiddenCells, "views with a hidden cell").toBeGreaterThanOrEqual(1200);
      expect(cov.viewsWithHiddenCellsInGc, "GUESS_COLLECT views with a hidden cell").toBeGreaterThanOrEqual(800);
      expect(cov.logNeedlesChecked, "guess needles searched").toBeGreaterThanOrEqual(8000);
      expect(cov.ownNeedleControls, "own-needle positive controls").toBeGreaterThanOrEqual(600);
      expect(cov.rankingTies, "ENDED states with tied scores").toBeGreaterThanOrEqual(80);
      expect(cov.statesWithHistory, "states with a reveal history").toBeGreaterThanOrEqual(250);
      expect(elapsed, "duration").toBeLessThan(120_000);
    },
  );
});

// ---------------------------------------------------------------------------------------------------------
// Property 23
// ---------------------------------------------------------------------------------------------------------

interface Coverage23 {
  runs: number;
  pairs: number;
  byKind: Record<PerturbationKind, number>;
  requestedByKind: Record<PerturbationKind, number>;
  byMode: Record<IdentityVisibility, number>;
  byCategory: Record<Category, number>;
  byViewer: Record<PlayerId, number>;
  ownerOnlyBases: number;
  swapApplicable: number;
  swapNotApplicable: number;
  handContentChanged: number;
  multiKindPairs: number;
  sensitivitySwapOwner: number;
  sensitivityHand: number;
  sensitivityGuess: number;
}

const zeroKinds = (): Record<PerturbationKind, number> => ({
  DECK_ORDER: 0, HAND_EXCHANGE: 0, PENDING_GUESSES: 0, INTERNAL_FIELDS: 0, PENDING_SECRETS: 0, BOARD_SWAP: 0,
});

const differs = (a: unknown, b: unknown): boolean => JSON.stringify(a) !== JSON.stringify(b);

function checkPair(p: HiddenPerturbation, cov: Coverage23): void {
  const { before: s, after: t, viewer } = p;
  const mode = s.config.identityVisibility;

  // Preconditions: valid-consistent S', and nothing visible to the viewer was touched.
  const problem = conservationProblem(t);
  must(problem === null, () => `S' breaks card conservation: ${problem}`);
  must(conservationProblem(s) === null, () => "S breaks card conservation");
  expect(t.hands[viewer], "the viewer's hand is identical").toStrictEqual(s.hands[viewer]);
  for (const seat of SEAT_IDS) must(t.hands[seat].length === s.hands[seat].length, () => `hand size of ${seat} changed`);
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

  // The property.
  const viewS = viewFor(s, viewer);
  const viewT = viewFor(t, viewer);
  expect(viewT, "viewFor(S', V) deep-equals viewFor(S, V)").toStrictEqual(viewS);
  must(JSON.stringify(viewT) === JSON.stringify(viewS), () => "the serializations of the two views differ");

  // Sensitivity: the changes are real, the seats that own the changed information do see them.
  if (p.swappedCells !== null) {
    for (const index of p.swappedCells) {
      const owner = (s.board[index] as NonNullable<Cell>).owner as PlayerId;
      must(viewFor(t, owner).board[index]?.card !== viewFor(s, owner).board[index]?.card, () => `the owner ${owner} does not see the swap at cell ${index}`);
      cov.sensitivitySwapOwner++;
    }
  }
  if (p.effective.includes("HAND_EXCHANGE")) {
    for (const seat of SEAT_IDS.filter((x) => x !== viewer)) {
      const changed = [...s.hands[seat]].sort().join() !== [...t.hands[seat]].sort().join();
      if (!changed) continue;
      must(differs(viewFor(t, seat).myHand, viewFor(s, seat).myHand), () => `seat ${seat} does not see its changed hand`);
      cov.sensitivityHand++;
    }
  }
  if (p.effective.includes("PENDING_GUESSES")) {
    for (const seat of SEAT_IDS.filter((x) => x !== viewer)) {
      if (s.pending?.guesses[seat] === undefined) continue;
      must(differs(viewFor(t, seat).myGuesses, viewFor(s, seat).myGuesses), () => `seat ${seat} does not see its changed guess`);
      cov.sensitivityGuess++;
    }
  }

  cov.pairs++;
  cov.byMode[mode]++;
  cov.byViewer[viewer]++;
  for (const kind of p.effective) cov.byKind[kind]++;
  for (const kind of p.requested) cov.requestedByKind[kind]++;
  if (p.effective.length >= 2) cov.multiKindPairs++;
  if (p.otherHandCardsChanged) cov.handContentChanged++;
}

describe("Property 23: view non-interference", () => {
  it(
    "changing only information hidden from a viewer does not change that viewer's view, in both visibility modes",
    { timeout: TIMEOUT_MS },
    () => {
      // Feature: qroker-playable-game, Property 23: View non-interference
      // Validates: Requirements 10.4, 10.5, 10.6
      const cov: Coverage23 = {
        runs: 0, pairs: 0, byKind: zeroKinds(), requestedByKind: zeroKinds(), byMode: { OWNER_ONLY: 0, FACE_UP: 0, BLIND: 0, BLIND_SCORE_ONLY: 0 },
        byCategory: zeroCategories(), byViewer: { P0: 0, P1: 0, P2: 0, P3: 0 }, ownerOnlyBases: 0, swapApplicable: 0,
        swapNotApplicable: 0, handContentChanged: 0, multiKindPairs: 0, sensitivitySwapOwner: 0, sensitivityHand: 0, sensitivityGuess: 0,
      };
      const started = Date.now();

      const arbCase = fc
        .record({
          reach: arbReachableState(),
          category: fc.constantFrom<Category>("PLACEMENT", "GC0", "GC1", "GC1", "GC2", "GC2", "GC3", "GC3", "REVEAL", "ENDED"),
          pick: fc.nat({ max: 1_000_000 }),
          numbers: arbNumbers(300),
        })
        .chain(({ reach, category, pick, numbers }) => {
          const base = selectState(reach, category, pick, numbers) ?? reach.state;
          return fc
            .tuple(arbHiddenPerturbation(base, "P0"), arbHiddenPerturbation(base, "P1"), arbHiddenPerturbation(base, "P2"), arbHiddenPerturbation(base, "P3"))
            .map((perturbations) => ({ reach, perturbations }));
        });

      fc.assert(
        fc.property(arbCase, ({ reach, perturbations }) => {
          cov.runs++;
          const base = (perturbations[0] as HiddenPerturbation).before;
          cov.byCategory[categoryOf(base)]++;
          if (base.config.identityVisibility === "OWNER_ONLY") cov.ownerOnlyBases++;
          for (const p of perturbations) {
            if (base.config.identityVisibility === "OWNER_ONLY") {
              if (applicableKinds(base, p.viewer).includes("BOARD_SWAP")) cov.swapApplicable++;
              else cov.swapNotApplicable++;
            }
            withContext(
              () => `${contextOf(p.before, p.viewer)} requested=${p.requested.join(",")} effective=${p.effective.join(",")} swapped=${JSON.stringify(p.swappedCells)} spec=${JSON.stringify(p.spec)} (run: ${describeReachable(reach)})`,
              () => checkPair(p, cov),
            );
          }
        }),
        { seed: SEED_P23, numRuns: NUM_RUNS_P23 },
      );

      const elapsed = Date.now() - started;
      if (LOG_COVERAGE) console.info("P23 coverage", JSON.stringify(cov), `${elapsed} ms`);
      expect(cov.pairs, "pairs checked").toBe(cov.runs * 4);
      for (const kind of PERTURBATION_KINDS) expect(cov.byKind[kind], `effective perturbations of kind ${kind}`).toBeGreaterThanOrEqual(kind === "BOARD_SWAP" ? 200 : 250);
      expect(cov.byMode.OWNER_ONLY, "OWNER_ONLY pairs").toBeGreaterThanOrEqual(500);
      expect(cov.byMode.FACE_UP, "FACE_UP pairs").toBeGreaterThanOrEqual(400);
      for (const seat of SEAT_IDS) expect(cov.byViewer[seat], `pairs of viewer ${seat}`).toBe(cov.runs);
      for (const category of CATEGORIES) expect(cov.byCategory[category], `base states in ${category}`).toBeGreaterThanOrEqual(category === "ENDED" ? 8 : 15);
      expect(cov.multiKindPairs, "pairs with two or more effective kinds").toBeGreaterThanOrEqual(500);
      expect(cov.handContentChanged, "pairs where another seat's hand holds different cards").toBeGreaterThanOrEqual(400);
      expect(cov.swapApplicable, "OWNER_ONLY pairs where a consistent swap exists").toBeGreaterThanOrEqual(300);
      expect(cov.sensitivitySwapOwner, "sensitivity checks of swapped cells").toBeGreaterThanOrEqual(300);
      expect(cov.sensitivityHand, "sensitivity checks of exchanged hands").toBeGreaterThanOrEqual(800);
      expect(cov.sensitivityGuess, "sensitivity checks of changed guesses").toBeGreaterThanOrEqual(300);
      expect(elapsed, "duration").toBeLessThan(120_000);
    },
  );

  // NEGATIVE CONTROL (an example, not a property): perturbing something the viewer CAN see changes the view. Without it
  // the property above could pass because the perturbations touch nothing that any view reads.
  it("negative control: changing something the viewer can see changes the view", () => {
    const choices = Array.from({ length: 400 }, (_, i) => (i * 7919 + 13) % 1009);
    const steer: PlayStyle = { codeBias: 90, submitOrder: "SEAT_ORDER" };
    const gcTwo = (visibility: IdentityVisibility): GameState => {
      const config: GameConfig = { ...defaultConfig(), identityVisibility: visibility };
      for (let seed = 1; seed <= 80; seed++) {
        const created = newGame({ seed, config });
        if (!created.ok) return fail(`newGame failed: ${created.error.code}`);
        const { state } = advanceUntil(created.value, (s) => categoryOf(s) === "GC2", choices, steer, 400);
        // A hidden cell of another seat must exist for the OWNER_ONLY comparison.
        const revealed = oracleRevealed(state);
        if (categoryOf(state) === "GC2" && state.board.some((c) => c !== null && c.owner !== "NEUTRAL" && !revealed.has(c.card))) return state;
      }
      return fail("no GC2 state found for the negative control");
    };

    for (const visibility of ["OWNER_ONLY", "FACE_UP"] as const) {
      const s = gcTwo(visibility);
      expect(categoryOf(s)).toBe("GC2");
      const pending = s.pending as PendingBatch;
      const submitted = SEAT_IDS.filter((seat) => pending.guesses[seat] !== undefined);
      expect(submitted).toHaveLength(2);
      const views = (state: GameState): Record<PlayerId, PlayerView> => ({
        P0: viewFor(state, "P0"), P1: viewFor(state, "P1"), P2: viewFor(state, "P2"), P3: viewFor(state, "P3"),
      });
      const before = views(s);
      const deckTop = s.deck[0] as CardId;

      // 1. The viewer's own hand: V's view changes, nobody else's does.
      for (const v of SEAT_IDS) {
        const handCard = s.hands[v][0] as CardId;
        const t = withDeck(withHand(s, v, [deckTop, ...s.hands[v].slice(1)]), [handCard, ...s.deck.slice(1)]);
        expect(conservationProblem(t)).toBeNull();
        const after = views(t);
        expect(differs(after[v], before[v]), `${visibility}: own hand of ${v}`).toBe(true);
        for (const w of SEAT_IDS.filter((x) => x !== v)) expect(after[w], `${visibility}: hand of ${v} is hidden from ${w}`).toStrictEqual(before[w]);
      }

      // 2. A neutral cell (visible to everybody) and a placed cell (visible to its owner; to everybody in FACE_UP).
      const neutralIndex = s.board.findIndex((c) => c !== null && c.owner === "NEUTRAL");
      const revealedCards = oracleRevealed(s);
      const placedIndex = s.board.findIndex((c) => c !== null && c.owner !== "NEUTRAL" && !revealedCards.has(c.card));
      const swapWithDeck = (index: number): GameState => {
        const old = (s.board[index] as NonNullable<Cell>).card;
        return withDeck(withBoardCards(s, new Map([[index, deckTop]])), [old, ...s.deck.slice(1)]);
      };
      const neutralChanged = views(swapWithDeck(neutralIndex));
      for (const v of SEAT_IDS) expect(differs(neutralChanged[v], before[v]), `${visibility}: neutral cell, viewer ${v}`).toBe(true);
      const placedOwner = (s.board[placedIndex] as NonNullable<Cell>).owner as PlayerId;
      const placedChanged = views(swapWithDeck(placedIndex));
      for (const v of SEAT_IDS) {
        const visible = visibility === "FACE_UP" || v === placedOwner;
        expect(differs(placedChanged[v], before[v]), `${visibility}: placed cell of ${placedOwner}, viewer ${v}`).toBe(visible);
      }

      // 3. A guess: the submitter's own view changes; the views of the others do not.
      for (const submitter of submitted) {
        const own = pending.guesses[submitter] as Record<string, number>;
        const changed = Object.fromEntries(Object.entries(own).map(([key, value]) => [key, value === 52 ? 4 : value + 1]));
        const after = views(withSubmission(s, submitter, changed));
        expect(differs(after[submitter], before[submitter]), `${visibility}: own guess of ${submitter}`).toBe(true);
        for (const w of SEAT_IDS.filter((x) => x !== submitter)) expect(after[w], `${visibility}: guess of ${submitter} is hidden from ${w}`).toStrictEqual(before[w]);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// Notes (observed with the fixed seeds; QROKER_COVERAGE_LOG=1 prints the live numbers)
// ---------------------------------------------------------------------------------------------------------
//
// Property 22 (seed 20260922, 200 runs, about 13 s): 1066 states, 4264 views. Per category PLACEMENT 110, GC0 169,
// GC1 171, GC2 168, GC3 169, REVEAL 169, ENDED 110. OWNER_ONLY 636 states, FACE_UP 430. Each seat is the viewer of
// every checked state. GUESS_COLLECT batches: 438 of one code, 239 of two codes (59 two-code batches were driven by the
// test, the rest come from random play). Views with at least one hidden cell: 2500 (1636 of them during GUESS_COLLECT).
// Searches: 7860 group-id needles, 104111 card-token needles, 16660 log guess needles (50 skipped because they
// equal the viewer's own entry), 1374 own-needle controls, 10813 own-hand-token controls. 232 ENDED states have tied
// scores (the ranking oracle is exercised on shared ranks).
// Property 23 (seed 20260923, 300 runs = 1200 pairs, about 6 s): effective perturbations DECK_ORDER 555,
// HAND_EXCHANGE 677, PENDING_GUESSES 355, INTERNAL_FIELDS 661, PENDING_SECRETS 456, BOARD_SWAP 315; 842 pairs combine two
// or more kinds; 670 pairs change the set of cards of another seat's hand. OWNER_ONLY 688 pairs, FACE_UP 512 (no
// BOARD_SWAP there, asserted). A consistent swap existed for 596 of the 688 OWNER_ONLY pairs (87 %); the other 92 had
// fewer than two swappable hidden cells (early game, or hidden cells inside committed codes). Base states per category:
// PLACEMENT 28, GC0 23, GC1 55, GC2 68, GC3 62, REVEAL 35, ENDED 29; 300 pairs per viewer. Sensitivity checks: 630 swapped
// cells seen by their owner, 1959 changed hands seen by their seats, 583 changed guesses seen by their seats.
// Sanity mutation (not kept): in view.ts `showCard` additionally returned true for owner P1. Property 22 failed
// ("cell N: card X instead of null") and Property 23 failed ("viewFor(S', V) deep-equals viewFor(S, V)").
