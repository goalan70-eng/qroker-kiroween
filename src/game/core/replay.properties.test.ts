// Property test for replay and purity (task 10.2): Property 26 of .kiro/specs/qroker-playable-game/design.md.
// Requirements 12.1 (pure engine), 12.4 (replay returns the same state or the index of the first rejected Action),
// 12.5 (the Action_Log holds every Action), 20.3 (a log produced by a driver replays to the driver's final state).
//
// ONE property (ONE fc.assert, fixed seed, NUM_RUNS runs). Failures are reproducible: the message names the game
// seed, the configuration, the complete action list and, for a corruption, its kind and position; fast-check prints
// its own seed and path. `replayActions` (testing/state-generators.ts) rebuilds the states from the printed actions.
//
// ---------------------------------------------------------------------------------------------------------
// Games under test (all LEGAL by construction)
// ---------------------------------------------------------------------------------------------------------
// A game is a seed, a configuration and an action list. Its states come ONLY from `newGame` followed by accepted
// `reduce` calls (`sequential` below, a loop of this file; a rejection of a generated action is a defect of the
// generator and throws). The base game is `arbReachableState()` (a random legal player, 0..300 steps). With a fixed
// share of the runs it is extended by further legal play (choosing legal actions with the generators; the engine
// validates and applies them): to the end of the game, to a GUESS_COLLECT with 0..3 submissions, to REVEAL, or to a
// batch of two codes (a steered driver, a copy of the idea in view.properties.test.ts) with 0..3 submissions.
//
// ---------------------------------------------------------------------------------------------------------
// Oracles (written in this file; `replay` is not used to compute any expectation)
// ---------------------------------------------------------------------------------------------------------
//  - `sequential`: newGame + one `reduce` per action, stopping at the first rejection (index and error code).
//  - `same`: an independent structural comparison (key sets, array order, NaN == NaN, -0 == 0), and `canon`: a
//    canonical JSON with sorted keys. A state is compared with BOTH, and with `stateEquals` (never alone).
//  - The log: `state.log` of the original state (the accepted, normalized sequence) equals the raw actions of the
//    driver, and the replayed log equals it element by element.
//
// What each run checks
//  (1)-(3) replay of the full log, on deep-frozen copies of the configuration and the actions, equals the original
//          state (stateEquals, same, canon) and its log equals the original log element by element.
//  (4)     replay twice gives equal results; replay of sampled PREFIXES gives the intermediate states (0, n, random
//          positions and positions chosen by phase: PLACEMENT, GUESS_COLLECT with 0..3 submissions, REVEAL, ENDED,
//          a batch of two codes).
//  (5)     frozen inputs are neither mutated nor cause an exception; the original state is unchanged by replay.
//  (6)     CORRUPTION of the log (kinds in INLINE_KINDS / APPEND_KINDS): the expectation comes from the sequential
//          loop on the corrupted sequence: rejected at index j with error e => replay returns REPLAY_REJECTED with
//          index j and cause e; accepted => replay's state equals the loop's final state and differs from the
//          original. A corruption that stays legal is therefore counted, not skipped.
//  (7)     a failed replay carries no state (exactly the keys `ok` and `error`; error keys `code`, `index`, `cause`).
//  (8)     invalid seed or configuration: replay returns the `newGame` error as is, with no index. The empty log, a
//          log ending in a partial batch, in REVEAL and in ENDED are covered by the coverage guards below.
//  Privacy: the log holds private guesses (decision D5). No assertion exposes it through a PlayerView; the only view
//  check is that no view of the replayed state has a property named `log`.
//
// Coverage guards: after the assertion the test checks that every kind of case occurred a minimum number of times.
// QROKER_COVERAGE_LOG=1 prints the live numbers; the observed numbers are in the notes at the end of this file.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cellAt, placeOnBoard } from "./board";
import type { Board } from "./board";
import { reduce } from "./engine";
import { isValidMember } from "./fragment-layout";
import { quadCells } from "./geometry";
import { isReplayRejection, replay, stateEquals } from "./replay";
import { defaultConfig, newGame } from "./state";
import type { GameState } from "./state";
import {
  advanceUntil,
  arbReachableState,
  choiceFrom,
  configSummary,
  describeReachable,
  legalPlacements,
  randomLegalAction,
} from "./testing/state-generators";
import type { Choice, PlayStyle, Reachable } from "./testing/state-generators";
import type { Action, EngineError, GameConfig, PlayerId, Slot } from "./types";
import { viewFor } from "./view";

// ---------------------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------------------

const SEED_P26 = 20261026;
const NUM_RUNS_P26 = 200;
const TIMEOUT_MS = 180_000;
const MAX_DURATION_MS = 60_000;
const LOG_COVERAGE = process.env.QROKER_COVERAGE_LOG === "1";

const SEAT_IDS: readonly PlayerId[] = ["P0", "P1", "P2", "P3"];
const CATALOG: readonly string[] = ["H", "D", "C", "S"].flatMap((suit) =>
  ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].map((rank) => `${suit}-${rank}`),
);

type PlaceAction = Extract<Action, { type: "PLACE" }>;
type SubmitAction = Extract<Action, { type: "SUBMIT_GUESSES" }>;
type ActionType = Action["type"];

// ---------------------------------------------------------------------------------------------------------
// Helpers: comparison, freezing, failure messages
// ---------------------------------------------------------------------------------------------------------

function fail(message: string): never {
  throw new Error(message);
}

/** A cheap check for hot loops (an `expect` per comparison is needlessly slow). */
function must(condition: boolean, message: () => string): void {
  if (!condition) fail(message());
}

/** Independent deep structural equality: key sets, array order, NaN equals NaN, -0 equals 0. */
function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return a === b || (Number.isNaN(a) && Number.isNaN(b));
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return a === b;
  const arrayA = Array.isArray(a);
  if (arrayA !== Array.isArray(b)) return false;
  if (arrayA) {
    const other = b as readonly unknown[];
    return a.length === other.length && a.every((x, i) => same(x, other[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left).sort();
  const otherKeys = Object.keys(right).sort();
  return keys.length === otherKeys.length && keys.every((key, i) => key === otherKeys[i] && same(left[key], right[key]));
}

/** Canonical text: object keys sorted, `undefined`, `NaN` and the sign of zero kept apart or unified as `same` does. */
function canon(value: unknown): string {
  if (typeof value === "number") return Number.isNaN(value) ? "NaN" : Object.is(value, -0) ? "0" : String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value !== "object" || value === null) return String(value);
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canon(record[key])}`)
    .join(",")}}`;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

/** Property names of every non-array object of a tree. */
function hasKeyNamed(value: unknown, name: string): boolean {
  if (typeof value !== "object" || value === null) return false;
  if (Array.isArray(value)) return value.some((child) => hasKeyNamed(child, name));
  return Object.entries(value).some(([key, child]) => key === name || hasKeyNamed(child, name));
}

// ---------------------------------------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------------------------------------

type Category = "PLACEMENT" | "GC0" | "GC1" | "GC2" | "GC3" | "REVEAL" | "ENDED";
const CATEGORIES: readonly Category[] = ["PLACEMENT", "GC0", "GC1", "GC2", "GC3", "REVEAL", "ENDED"];
type Target = Category | "TWO";
const TARGETS: readonly Target[] = [...CATEGORIES, "TWO"];

function categoryOf(state: GameState): Category {
  switch (state.phase) {
    case "PLACEMENT":
      return "PLACEMENT";
    case "GUESS_COLLECT":
      return `GC${Object.keys((state.pending as NonNullable<GameState["pending"]>).guesses).length}` as Category;
    case "REVEAL":
      return "REVEAL";
    case "ENDED":
      return "ENDED";
  }
}

const isTwoCodeBatch = (state: GameState): boolean => state.phase === "GUESS_COLLECT" && (state.pending?.codes.length ?? 0) === 2;
const matches = (state: GameState, target: Target): boolean => (target === "TWO" ? isTwoCodeBatch(state) : categoryOf(state) === target);

type Sequence =
  | { readonly ok: true; readonly states: readonly GameState[] }
  | { readonly ok: false; readonly index: number; readonly error: EngineError; readonly states: readonly GameState[] };

/** newGame, then one `reduce` per action; stops at the first rejection. `states[i]` is the state before action i. */
function sequential(seed: number, config: GameConfig, actions: readonly unknown[]): Sequence {
  const created = newGame({ seed, config });
  if (!created.ok) return fail(`newGame rejected a generated configuration: ${created.error.code}`);
  let state = created.value;
  const states: GameState[] = [state];
  for (let index = 0; index < actions.length; index++) {
    const next = reduce(state, actions[index] as Action);
    if (!next.ok) return { ok: false, index, error: next.error, states };
    state = next.value;
    states.push(state);
  }
  return { ok: true, states };
}

interface Game {
  readonly seed: number;
  readonly config: GameConfig;
  readonly actions: readonly Action[];
  readonly states: readonly GameState[];
  readonly origin: string;
  readonly reach: Reachable;
}

const describeGame = (g: { seed: number; config: GameConfig; actions: readonly unknown[]; origin?: string }): string =>
  `seed=${g.seed} ${configSummary(g.config)} origin=${g.origin ?? "?"} config=${JSON.stringify(g.config)} actions=${JSON.stringify(g.actions)}`;

function applyOk(state: GameState, action: Action): GameState {
  const result = reduce(state, action);
  if (!result.ok) return fail(`legal action rejected with ${result.error.code}: ${JSON.stringify(action)}`);
  return result.value;
}

const SLOT_NAMES: readonly Slot[] = ["TL", "TR", "BL", "BR"];
const POTENTIAL_BY_VALID_CELLS: readonly number[] = [0, 0.2, 1, 6];

/** Steering value of a board for the two-code driver (a heuristic, not a rule of the game). */
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

/**
 * Actions that lead from the start of `reach` to a fresh batch of exactly two codes (GUESS_COLLECT, nobody has
 * submitted): the generated prefix when it holds one, else further legal play steered with `potential` from the
 * prefix state at `pick`. Only CHOOSES legal actions; `reduce` applies them. `undefined` when none is found.
 */
function twoCodeActions(reach: Reachable, pick: number, numbers: readonly number[], cap = 300): Action[] | undefined {
  const n = reach.states.length;
  for (let k = 0; k < n; k++) {
    const at = (Math.abs(pick) + k) % n;
    const s = reach.states[at] as GameState;
    if (isTwoCodeBatch(s) && Object.keys((s.pending as NonNullable<GameState["pending"]>).guesses).length === 0) {
      return reach.actions.slice(0, at) as Action[];
    }
  }
  const choice: Choice = choiceFrom(numbers);
  const from = Math.abs(pick) % n;
  const startAt = (reach.states[from] as GameState).phase === "ENDED" ? 0 : from;
  const taken: Action[] = reach.actions.slice(0, startAt) as Action[];
  let state = reach.states[startAt] as GameState;
  const filler: PlayStyle = { codeBias: 0, submitOrder: "RANDOM" };
  for (let step = 0; step < cap; step++) {
    if (state.phase === "ENDED") return undefined;
    if (state.phase !== "PLACEMENT") {
      const action = randomLegalAction(state, choice, filler);
      if (action === null) return undefined;
      state = applyOk(state, action);
      taken.push(action);
      continue;
    }
    const all = legalPlacements(state);
    const two = all.filter((p) => p.newCodes === 2);
    if (two.length > 0) {
      const action = (two[choice(two.length)] as { action: Action }).action;
      const next = applyOk(state, action);
      taken.push(action);
      return isTwoCodeBatch(next) ? taken : fail("the detector announced two codes but the placement gave another batch");
    }
    const quiet = all.filter((p) => p.newCodes === 0);
    const pool = quiet.length > 0 ? quiet : all;
    const scored = pool.map((p) => {
      const placed = placeOnBoard(state.board, p.action.pos, { card: p.action.card, orientation: p.action.orientation, owner: state.turn });
      return { action: p.action as Action, value: placed.ok ? potential(placed.value) : -1 };
    });
    scored.sort((a, b) => b.value - a.value);
    const top = scored.slice(0, 3);
    const action = (top[choice(top.length)] as { action: Action }).action;
    state = applyOk(state, action);
    taken.push(action);
  }
  return undefined;
}

const ORIGINS = ["NONE", "NONE", "END", "END", "GC", "REVEAL", "TWO", "TWO", "EMPTY"] as const;
type Origin = (typeof ORIGINS)[number];

interface GameInput {
  readonly reach: Reachable;
  readonly origin: Origin;
  readonly subs: number;
  readonly pick: number;
  readonly numbers: readonly number[];
}

/** The base game, optionally extended by legal play (see the file comment). The states come from `sequential`. */
function buildGame({ reach, origin, subs, pick, numbers }: GameInput): Game {
  let actions: Action[] = [...reach.actions];
  let label: string = origin;
  const steer: PlayStyle = { codeBias: 90, submitOrder: reach.style.submitOrder };
  if (origin === "EMPTY") {
    actions = [];
  } else if (origin === "END") {
    actions = [...actions, ...advanceUntil(reach.state, (s) => s.phase === "ENDED", numbers, reach.style, 600).actions];
  } else if (origin === "GC") {
    actions = [...actions, ...advanceUntil(reach.state, (s) => categoryOf(s) === `GC${subs}`, numbers, steer, 400).actions];
  } else if (origin === "REVEAL") {
    actions = [...actions, ...advanceUntil(reach.state, (s) => s.phase === "REVEAL", numbers, steer, 400).actions];
  } else if (origin === "TWO") {
    const two = twoCodeActions(reach, pick, numbers);
    if (two === undefined) {
      label = "TWO-fallback";
    } else {
      actions = two;
      const batch = sequential(reach.seed, reach.config, actions);
      const choice = choiceFrom(numbers.slice(7));
      let state = (batch.states[batch.states.length - 1] as GameState);
      for (let i = 0; i < subs && state.phase === "GUESS_COLLECT"; i++) {
        const action = randomLegalAction(state, choice, { codeBias: 0, submitOrder: reach.style.submitOrder }) as Action;
        state = applyOk(state, action);
        actions.push(action);
      }
    }
  }
  const seq = sequential(reach.seed, reach.config, actions);
  if (!seq.ok) return fail(`a generated game was rejected at ${seq.index} (${seq.error.code}): ${describeReachable(reach)}`);
  return { seed: reach.seed, config: reach.config, actions, states: seq.states, origin: label, reach };
}

// ---------------------------------------------------------------------------------------------------------
// Corruptions
// ---------------------------------------------------------------------------------------------------------

interface View {
  readonly actions: readonly Action[];
  readonly states: readonly GameState[];
}

const put = (actions: readonly unknown[], k: number, value: unknown): unknown[] => actions.map((a, i) => (i === k ? value : a));

/** A PLACE that is never legal in a phase other than PLACEMENT (used as a wrong-phase action). */
const MADE_UP_PLACE: PlaceAction = { type: "PLACE", player: "P0", card: "H-A", pos: { row: 3, col: 3 }, orientation: 0 };
const MADE_UP_SUBMIT: SubmitAction = { type: "SUBMIT_GUESSES", player: "P0", guesses: { A1: 10 } };

interface Kind {
  readonly name: string;
  /** Action types at the corrupted position that the kind applies to. */
  readonly on: readonly ActionType[];
  /** The corrupted sequence, or `undefined` when the kind does not apply at `k` with this `salt`. */
  readonly build: (g: View, k: number, salt: number) => unknown[] | undefined;
}

const ANY_TYPE: readonly ActionType[] = ["PLACE", "SUBMIT_GUESSES", "ACK_REVEAL"];

const INLINE_KINDS: readonly Kind[] = [
  {
    name: "WRONG_PLAYER",
    on: ["PLACE", "SUBMIT_GUESSES"],
    build: (g, k, salt) => {
      const a = g.actions[k] as PlaceAction | SubmitAction;
      const others = SEAT_IDS.filter((seat) => seat !== a.player);
      const player = salt % 4 === 3 ? "P9" : (others[salt % 3] as PlayerId);
      return put(g.actions, k, { ...a, player });
    },
  },
  {
    name: "CARD_NOT_IN_HAND",
    on: ["PLACE"],
    build: (g, k, salt) => {
      const a = g.actions[k] as PlaceAction;
      const hand = (g.states[k] as GameState).hands[a.player];
      const pool = CATALOG.filter((card) => !hand.includes(card as never));
      const card = salt % 6 === 5 ? "Z-99" : (pool[salt % pool.length] as string);
      return put(g.actions, k, { ...a, card });
    },
  },
  {
    name: "BAD_CELL",
    on: ["PLACE"],
    build: (g, k, salt) => {
      const a = g.actions[k] as PlaceAction;
      const board = (g.states[k] as GameState).board;
      const occupied: number[] = [];
      const empty: number[] = [];
      const lonely: number[] = [];
      board.forEach((cell, i) => {
        if (cell !== null) return occupied.push(i);
        empty.push(i);
        const row = Math.floor(i / 8);
        const col = i % 8;
        const alone = [[-1, 0], [1, 0], [0, -1], [0, 1]].every(([dr, dc]) => {
          const r = row + (dr as number);
          const c = col + (dc as number);
          return r < 0 || r > 7 || c < 0 || c > 7 || board[r * 8 + c] === null;
        });
        if (alone) lonely.push(i);
      });
      const at = (i: number): { row: number; col: number } => ({ row: Math.floor(i / 8), col: i % 8 });
      const pickFrom = (list: readonly number[]): { row: number; col: number } | undefined => (list.length === 0 ? undefined : at(list[salt % list.length] as number));
      const variants: ({ row: number; col: number } | undefined)[] = [
        { row: -1, col: salt % 8 },
        { row: salt % 8, col: 8 },
        pickFrom(occupied),
        pickFrom(lonely) ?? { row: 9, col: 9 },
        pickFrom(empty),
        { row: 2.5, col: 3 },
      ];
      const pos = variants[salt % variants.length];
      return pos === undefined ? undefined : put(g.actions, k, { ...a, pos });
    },
  },
  {
    name: "BAD_ORIENTATION",
    on: ["PLACE"],
    build: (g, k, salt) => put(g.actions, k, { ...(g.actions[k] as PlaceAction), orientation: [90, 360, -180, 1, "0"][salt % 5] }),
  },
  {
    name: "BAD_GUESS",
    on: ["SUBMIT_GUESSES"],
    build: (g, k, salt) => {
      const a = g.actions[k] as SubmitAction;
      const keys = Object.keys(a.guesses);
      const key = keys[salt % keys.length] as string;
      const value = [3, 53, 7.5, Number.NaN, -1, 1000, Number.POSITIVE_INFINITY, "20"][salt % 8];
      return put(g.actions, k, { ...a, guesses: { ...a.guesses, [key]: value } });
    },
  },
  {
    name: "GUESS_KEYS",
    on: ["SUBMIT_GUESSES"],
    build: (g, k, salt) => {
      const a = g.actions[k] as SubmitAction;
      const keys = Object.keys(a.guesses);
      const key = keys[salt % keys.length] as string;
      const { [key]: dropped, ...rest } = a.guesses;
      const variants: unknown[] = [rest, { ...a.guesses, Z9: dropped }, { ...rest, Z9: dropped }, null];
      return put(g.actions, k, { ...a, guesses: variants[salt % 4] });
    },
  },
  {
    name: "TWEAK_GUESS_VALID",
    on: ["SUBMIT_GUESSES"],
    build: (g, k, salt) => {
      const a = g.actions[k] as SubmitAction;
      const keys = Object.keys(a.guesses);
      const key = keys[salt % keys.length] as string;
      const old = a.guesses[key] as number;
      return put(g.actions, k, { ...a, guesses: { ...a.guesses, [key]: 4 + ((old - 4 + 1 + (salt % 48)) % 49) } });
    },
  },
  {
    name: "SWAP_ADJACENT_SUBMITS",
    on: ["SUBMIT_GUESSES"],
    build: (g, k) => {
      const next = g.actions[k + 1];
      if (next === undefined || next.type !== "SUBMIT_GUESSES") return undefined;
      return g.actions.map((a, i) => (i === k ? next : i === k + 1 ? (g.actions[k] as Action) : a));
    },
  },
  {
    name: "DUPLICATE",
    on: ANY_TYPE,
    build: (g, k) => [...g.actions.slice(0, k + 1), g.actions[k], ...g.actions.slice(k + 1)],
  },
  {
    name: "WRONG_PHASE",
    on: ANY_TYPE,
    build: (g, k, salt) => {
      const phase = (g.states[k] as GameState).phase;
      const ack: Action = { type: "ACK_REVEAL" };
      const replacement = phase === "PLACEMENT" ? (salt % 2 === 0 ? ack : MADE_UP_SUBMIT) : phase === "GUESS_COLLECT" ? (salt % 2 === 0 ? ack : MADE_UP_PLACE) : salt % 2 === 0 ? MADE_UP_PLACE : MADE_UP_SUBMIT;
      return put(g.actions, k, replacement);
    },
  },
  {
    name: "GARBAGE",
    on: ANY_TYPE,
    build: (g, k, salt) => put(g.actions, k, [null, undefined, 7, "PLACE", { type: "NOPE" }, { type: "place" }, []][salt % 7]),
  },
  {
    name: "SWAP_LEGAL_PLACE",
    on: ["PLACE"],
    build: (g, k, salt) => {
      const original = canon(g.actions[k]);
      const options = legalPlacements(g.states[k] as GameState).filter((p) => canon(p.action) !== original);
      return options.length === 0 ? undefined : put(g.actions, k, (options[salt % options.length] as { action: Action }).action);
    },
  },
];

/** Corruptions at the END of the log (`k = n`): extra actions after the last one. */
const APPEND_KINDS: readonly Kind[] = [
  {
    name: "APPEND_EXTRA",
    on: ANY_TYPE,
    build: (g, _k, salt) => {
      const variants: Action[][] = [[{ type: "ACK_REVEAL" }], [MADE_UP_PLACE], [{ type: "ACK_REVEAL" }, { type: "ACK_REVEAL" }], [MADE_UP_SUBMIT]];
      return [...g.actions, ...(variants[salt % 4] as Action[])];
    },
  },
  {
    name: "APPEND_LEGAL",
    on: ANY_TYPE,
    build: (g, _k, salt) => {
      const last = g.states[g.states.length - 1] as GameState;
      const action = randomLegalAction(last, choiceFrom([salt, salt + 3, salt + 11, salt + 17, salt + 29, salt + 31]), { codeBias: 30, submitOrder: "SEAT_ORDER" });
      return action === null ? undefined : [...g.actions, action];
    },
  },
];

type Where = "FIRST" | "LAST" | "ANY" | "APPEND";
const WHERES: readonly Where[] = ["FIRST", "LAST", "ANY", "ANY", "APPEND"];

interface Corruption {
  readonly kind: string;
  readonly k: number;
  readonly actions: unknown[];
}

/** Chooses the kind and the position (rotating to the next applicable kind / position) and builds the corrupted log. */
function corrupt(g: View, where: Where, kNat: number, kindNat: number, salt: number): Corruption | undefined {
  const n = g.actions.length;
  const appending = where === "APPEND" || n === 0;
  const kinds = appending ? APPEND_KINDS : INLINE_KINDS;
  for (let t = 0; t < kinds.length; t++) {
    const kind = kinds[(kindNat + t) % kinds.length] as Kind;
    const positions = appending ? [n] : where === "FIRST" ? [0] : where === "LAST" ? [n - 1] : Array.from({ length: n }, (_, i) => (kNat + i) % n);
    for (const k of positions) {
      if (!appending && !kind.on.includes((g.actions[k] as Action).type)) continue;
      const built = kind.build(g, k, salt);
      if (built !== undefined) return { kind: kind.name, k, actions: built };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------
// Invalid seeds and configurations
// ---------------------------------------------------------------------------------------------------------

const arbBadSeed: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: -100_000, max: -1 }),
  fc.integer({ min: 2 ** 32, max: 2 ** 40 }),
  fc.double({ min: 0, max: 1_000_000, noNaN: true }).filter((x) => !Number.isInteger(x)),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
);

const BAD_CONFIGS: readonly ((c: GameConfig) => unknown)[] = [
  () => null,
  () => ({}),
  (c) => ({ ...c, identityVisibility: "SIDEWAYS" }),
  (c) => ({ ...c, seats: c.seats.slice(0, 3) }),
  (c) => ({ ...c, scoreConfig: { ...c.scoreConfig, config: { rewardByError: [], handEmptyBonus: 1 } } }),
  (c) => ({ ...c, rulesVersion: c.rulesVersion + 1 }),
];

// ---------------------------------------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------------------------------------

const zeroBy = <K extends string>(keys: readonly K[]): Record<K, number> => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
const bump = (table: Record<string, number>, key: string): void => {
  table[key] = (table[key] ?? 0) + 1;
};

interface Coverage {
  runs: number;
  emptyGames: number;
  maxActions: number;
  byOrigin: Record<string, number>;
  byMode: Record<string, number>;
  finalByCat: Record<Category, number>;
  finalTwo: number;
  prefixes: number;
  prefixByCat: Record<Category, number>;
  prefixTwo: number;
  prefixBatch1: number;
  prefixBatch2: number;
  prefixEmpty: number;
  corruptions: number;
  noCorruption: number;
  byKind: Record<string, number>;
  rejected: number;
  rejectedAtFirst: number;
  rejectedAtMiddle: number;
  rejectedAtLast: number;
  rejectedAfterEnd: number;
  accepted: number;
  acceptedByKind: Record<string, number>;
  byCause: Record<string, number>;
  badSeeds: number;
  badConfigs: number;
  viewChecks: number;
}

function newCoverage(): Coverage {
  return {
    runs: 0, emptyGames: 0, maxActions: 0, byOrigin: {}, byMode: {}, finalByCat: zeroBy(CATEGORIES), finalTwo: 0,
    prefixes: 0, prefixByCat: zeroBy(CATEGORIES), prefixTwo: 0, prefixBatch1: 0, prefixBatch2: 0, prefixEmpty: 0,
    corruptions: 0, noCorruption: 0, byKind: {}, rejected: 0, rejectedAtFirst: 0, rejectedAtMiddle: 0, rejectedAtLast: 0,
    rejectedAfterEnd: 0, accepted: 0, acceptedByKind: {}, byCause: {}, badSeeds: 0, badConfigs: 0, viewChecks: 0,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Checks of one run
// ---------------------------------------------------------------------------------------------------------

interface RunInput {
  readonly game: GameInput;
  readonly prefixPicks: readonly number[];
  readonly prefixTargets: readonly Target[];
  readonly prefixPick: number;
  readonly corruptions: readonly { readonly where: Where; readonly kNat: number; readonly kindNat: number; readonly salt: number }[];
  readonly badSeed: number;
  readonly badConfig: number;
}

/** Replay of `actions` on deep-frozen copies of the inputs; asserts that the inputs are neither changed nor thawed. */
function replayFrozen(seed: number, config: GameConfig, actions: readonly unknown[]): ReturnType<typeof replay> {
  const frozenConfig = deepFreeze(structuredClone(config));
  const frozenActions = deepFreeze(structuredClone(actions)) as readonly Action[];
  const configBefore = canon(frozenConfig);
  const actionsBefore = canon(frozenActions);
  const result = replay(seed, frozenConfig, frozenActions);
  must(canon(frozenConfig) === configBefore && isDeepFrozen(frozenConfig), () => "replay changed the frozen configuration");
  must(canon(frozenActions) === actionsBefore && isDeepFrozen(frozenActions), () => "replay changed the frozen actions");
  return result;
}

function checkRun(input: RunInput, cov: Coverage): void {
  cov.runs++;
  const game = buildGame(input.game);
  const { seed, config, actions, states } = game;
  const n = actions.length;
  const orig = states[n] as GameState;
  const where = `${describeGame({ seed, config, actions, origin: game.origin })}`;
  cov.emptyGames += n === 0 ? 1 : 0;
  cov.maxActions = Math.max(cov.maxActions, n);
  bump(cov.byOrigin, game.origin);
  bump(cov.byMode, config.identityVisibility);
  cov.finalByCat[categoryOf(orig)]++;
  if (isTwoCodeBatch(orig)) cov.finalTwo++;

  // The generator's own bookkeeping: the original state is the state the driver reached, and the log of an original
  // state is the accepted action sequence.
  if (game.origin === "NONE") must(same(orig, game.reach.state), () => `the sequential loop differs from the driver: ${where}`);
  must(orig.log.length === n && canon(orig.log) === canon(actions), () => `original log differs from the actions: ${where}`);
  const origClone = structuredClone(orig);
  const origCanon = canon(orig);

  // (1)-(3), (5): replay of the full log on deep-frozen inputs.
  const createdFrozen = newGame({ seed, config: deepFreeze(structuredClone(config)) });
  must(createdFrozen.ok && same(createdFrozen.value, states[0]), () => `newGame on a frozen configuration differs: ${where}`);
  const first = replayFrozen(seed, config, actions);
  if (!first.ok) return fail(`replay of a legal log failed: ${JSON.stringify(first.error)}\n${where}`);
  const done = first.value;
  must(stateEquals(done, orig), () => `stateEquals(replay, original) is false: ${where}`);
  must(same(done, orig) && canon(done) === origCanon, () => `replayed state differs from the original: ${where}`);
  must(done.log.length === orig.log.length, () => `replayed log length ${done.log.length} != ${orig.log.length}: ${where}`);
  for (let i = 0; i < n; i++) {
    must(same(done.log[i], orig.log[i]) && canon(done.log[i]) === canon(orig.log[i]), () => `log entry ${i} differs: ${where}`);
    must(same(done.log[i], actions[i]), () => `log entry ${i} differs from the raw action: ${where}`);
  }
  // (4): determinism.
  const second = replay(seed, deepFreeze(structuredClone(config)), deepFreeze(structuredClone(actions)));
  must(second.ok && stateEquals(second.value, done) && same(second.value, done), () => `two replays differ: ${where}`);
  // (5): the original state is unchanged.
  must(canon(orig) === origCanon && same(orig, origClone), () => `the original state changed: ${where}`);
  must(typeof seed === "number", () => "seed is not a primitive");
  // Privacy: no view of the replayed state carries the log.
  for (const seat of SEAT_IDS) {
    must(!hasKeyNamed(viewFor(done, seat), "log"), () => `a view of ${seat} has a log property: seed=${seed}`);
    cov.viewChecks++;
  }

  // (4): prefixes.
  const indices = new Set<number>([0, n, ...input.prefixPicks.map((p) => p % (n + 1))]);
  input.prefixTargets.forEach((target, t) => {
    for (let j = 0; j <= n; j++) {
      const at = (input.prefixPick + t + j) % (n + 1);
      if (matches(states[at] as GameState, target)) {
        indices.add(at);
        break;
      }
    }
  });
  for (const i of indices) {
    const expected = states[i] as GameState;
    const result = replayFrozen(seed, config, actions.slice(0, i));
    if (!result.ok) return fail(`replay of the prefix ${i} failed: ${JSON.stringify(result.error)}\n${where}`);
    must(stateEquals(result.value, expected) && same(result.value, expected) && canon(result.value) === canon(expected), () => `prefix ${i} differs: ${where}`);
    must(same(result.value.log, expected.log) && result.value.log.length === i, () => `prefix ${i} log differs: ${where}`);
    cov.prefixes++;
    cov.prefixByCat[categoryOf(expected)]++;
    if (isTwoCodeBatch(expected)) {
      cov.prefixTwo++;
      cov.prefixBatch2++;
    } else if (expected.phase === "GUESS_COLLECT") cov.prefixBatch1++;
    if (i === 0) cov.prefixEmpty++;
  }

  // (6), (7): corruptions.
  for (const c of input.corruptions) {
    const made = corrupt({ actions, states }, c.where, c.kNat, c.kindNat, c.salt);
    if (made === undefined) {
      cov.noCorruption++;
      continue;
    }
    cov.corruptions++;
    bump(cov.byKind, made.kind);
    const label = `corruption ${made.kind} at ${made.k} (${c.where}): ${describeGame({ seed, config, actions: made.actions, origin: game.origin })}`;
    const expected = sequential(seed, config, structuredClone(made.actions));
    const result = replayFrozen(seed, config, made.actions);
    if (!expected.ok) {
      must(!result.ok, () => `replay accepted a log that the engine rejects at ${expected.index} (${expected.error.code}): ${label}`);
      if (result.ok) return;
      const error = result.error;
      must(isReplayRejection(error), () => `not a REPLAY_REJECTED error: ${JSON.stringify(error)}: ${label}`);
      if (!isReplayRejection(error)) return;
      must(error.code === "REPLAY_REJECTED", () => `error code ${error.code}: ${label}`);
      must(error.index === expected.index, () => `index ${error.index}, expected ${expected.index} (${expected.error.code}): ${label}`);
      must(error.cause.code === expected.error.code && same(error.cause, expected.error), () => `cause ${JSON.stringify(error.cause)}, expected ${JSON.stringify(expected.error)}: ${label}`);
      must(expected.index >= made.k || made.kind === "SWAP_ADJACENT_SUBMITS", () => `rejected before the corrupted position ${made.k}: ${label}`);
      must(same(Object.keys(result).sort(), ["error", "ok"]) && !("value" in result), () => `a failed replay carries more than ok and error: ${label}`);
      must(same(Object.keys(error).sort(), ["cause", "code", "index"]), () => `unexpected keys of the rejection: ${Object.keys(error).join(",")}: ${label}`);
      cov.rejected++;
      bump(cov.byCause, expected.error.code);
      const last = made.actions.length - 1;
      if (expected.index === 0) cov.rejectedAtFirst++;
      else if (expected.index === last) cov.rejectedAtLast++;
      else cov.rejectedAtMiddle++;
      if (made.kind.startsWith("APPEND") && expected.index >= n) cov.rejectedAfterEnd++;
    } else {
      must(result.ok, () => `replay rejected a log that the engine accepts: ${JSON.stringify(result.ok ? null : result.error)}: ${label}`);
      if (!result.ok) return;
      const final = expected.states[expected.states.length - 1] as GameState;
      must(stateEquals(result.value, final) && same(result.value, final) && canon(result.value) === canon(final), () => `accepted corruption: replayed state differs from the loop's: ${label}`);
      must(canon(result.value) !== origCanon && !stateEquals(result.value, orig), () => `accepted corruption left the state unchanged: ${label}`);
      cov.accepted++;
      bump(cov.acceptedByKind, made.kind);
    }
  }

  // (8): invalid seed and configuration.
  {
    const expectedSeed = newGame({ seed: input.badSeed, config });
    must(!expectedSeed.ok, () => `newGame accepted the invalid seed ${input.badSeed}`);
    const result = replay(input.badSeed, config, actions);
    must(!result.ok && !expectedSeed.ok && same(result.error, expectedSeed.error), () => `replay with the invalid seed ${input.badSeed}: ${JSON.stringify(result)}`);
    if (!result.ok) must(!isReplayRejection(result.error) && !("index" in result.error), () => `seed error has an index: ${JSON.stringify(result.error)}`);
    cov.badSeeds++;
    const bad = (BAD_CONFIGS[input.badConfig % BAD_CONFIGS.length] as (c: GameConfig) => unknown)(config) as GameConfig;
    const expectedConfig = newGame({ seed, config: bad });
    must(!expectedConfig.ok, () => `newGame accepted the invalid configuration #${input.badConfig}`);
    const configResult = replay(seed, bad, actions);
    must(!configResult.ok && !expectedConfig.ok && same(configResult.error, expectedConfig.error), () => `replay with the invalid configuration #${input.badConfig}: ${JSON.stringify(configResult)}`);
    if (!configResult.ok) must(!isReplayRejection(configResult.error) && !("index" in configResult.error), () => "configuration error has an index");
    cov.badConfigs++;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Property 26
// ---------------------------------------------------------------------------------------------------------

const arbNumbers = (length: number): fc.Arbitrary<number[]> => fc.array(fc.nat({ max: 1_000_000 }), { minLength: length, maxLength: length });

const arbRun: fc.Arbitrary<RunInput> = fc.record({
  game: fc.record({
    reach: arbReachableState(),
    origin: fc.constantFrom<Origin>(...ORIGINS),
    subs: fc.nat({ max: 3 }),
    pick: fc.nat({ max: 1_000_000 }),
    numbers: arbNumbers(400),
  }),
  prefixPicks: fc.array(fc.nat({ max: 1_000_000 }), { minLength: 3, maxLength: 3 }),
  prefixTargets: fc.array(fc.constantFrom<Target>(...TARGETS), { minLength: 2, maxLength: 2 }),
  prefixPick: fc.nat({ max: 1_000_000 }),
  corruptions: fc.array(
    fc.record({
      where: fc.constantFrom<Where>(...WHERES),
      kNat: fc.nat({ max: 1_000_000 }),
      kindNat: fc.nat({ max: 1_000 }),
      salt: fc.nat({ max: 1_000_000 }),
    }),
    { minLength: 3, maxLength: 3 },
  ),
  badSeed: arbBadSeed,
  badConfig: fc.nat({ max: 1_000 }),
});

describe("Property 26: replay determinism and purity", () => {
  it(
    "replay rebuilds the game from seed, configuration and log, purely, and rejects a corrupted log at the engine's index",
    { timeout: TIMEOUT_MS },
    () => {
      // Feature: qroker-playable-game, Property 26: Replay determinism and purity
      // Validates: Requirements 12.1, 12.4, 12.5, 20.3
      const cov = newCoverage();
      const started = Date.now();

      fc.assert(
        fc.property(arbRun, (input) => {
          try {
            checkRun(input, cov);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`${message}\n(base game: ${describeReachable(input.game.reach)})`);
          }
        }),
        { seed: SEED_P26, numRuns: NUM_RUNS_P26 },
      );

      const elapsed = Date.now() - started;
      if (LOG_COVERAGE) console.info("P26 coverage", JSON.stringify(cov), `${elapsed} ms`);

      expect(cov.runs, "runs").toBe(NUM_RUNS_P26);
      // Games: the empty log, every phase and partial batches as the END of a log, both visibility modes.
      expect(cov.emptyGames, "empty logs").toBeGreaterThanOrEqual(10);
      expect(cov.finalByCat.PLACEMENT, "logs ending in PLACEMENT").toBeGreaterThanOrEqual(5);
      expect(cov.finalByCat.GC0, "logs ending in GUESS_COLLECT, 0 submissions").toBeGreaterThanOrEqual(5);
      expect(cov.finalByCat.GC1, "logs ending in GUESS_COLLECT, 1 submission").toBeGreaterThanOrEqual(5);
      expect(cov.finalByCat.GC2, "logs ending in GUESS_COLLECT, 2 submissions").toBeGreaterThanOrEqual(5);
      expect(cov.finalByCat.GC3, "logs ending in GUESS_COLLECT, 3 submissions").toBeGreaterThanOrEqual(5);
      expect(cov.finalByCat.REVEAL, "logs ending in REVEAL").toBeGreaterThanOrEqual(5);
      expect(cov.finalByCat.ENDED, "logs ending in ENDED").toBeGreaterThanOrEqual(15);
      expect(cov.finalTwo, "logs ending in a batch of two codes").toBeGreaterThanOrEqual(5);
      expect(cov.byMode.OWNER_ONLY ?? 0, "OWNER_ONLY games").toBeGreaterThanOrEqual(30);
      expect(cov.byMode.FACE_UP ?? 0, "FACE_UP games").toBeGreaterThanOrEqual(30);
      // Prefixes: every phase, 0..3 submissions, batches of one and two codes, the empty prefix.
      expect(cov.prefixes, "prefixes replayed").toBeGreaterThanOrEqual(600);
      for (const category of CATEGORIES) expect(cov.prefixByCat[category], `prefixes in ${category}`).toBeGreaterThanOrEqual(30);
      expect(cov.prefixBatch1, "prefixes in a batch of one code").toBeGreaterThanOrEqual(60);
      expect(cov.prefixBatch2, "prefixes in a batch of two codes").toBeGreaterThanOrEqual(15);
      expect(cov.prefixEmpty, "empty prefixes").toBe(cov.runs);
      // Corruptions: every kind, rejection positions, accepted-but-different, every cause.
      expect(cov.corruptions, "corruptions made").toBeGreaterThanOrEqual(400);
      for (const kind of [...INLINE_KINDS, ...APPEND_KINDS]) expect(cov.byKind[kind.name] ?? 0, `corruptions of kind ${kind.name}`).toBeGreaterThanOrEqual(10);
      expect(cov.rejectedAtFirst, "rejections at index 0").toBeGreaterThanOrEqual(30);
      expect(cov.rejectedAtMiddle, "rejections in the middle").toBeGreaterThanOrEqual(100);
      expect(cov.rejectedAtLast, "rejections at the last index").toBeGreaterThanOrEqual(30);
      expect(cov.rejectedAfterEnd, "extra actions rejected after the last action").toBeGreaterThanOrEqual(20);
      expect(cov.accepted, "corrupted logs that stay legal (accepted, different state)").toBeGreaterThanOrEqual(20);
      for (const code of [
        "WRONG_PHASE", "NOT_YOUR_TURN", "CARD_NOT_IN_HAND", "OUT_OF_BOUNDS", "OCCUPIED", "NOT_ADJACENT", "INVALID_ORIENTATION",
        "GUESS_OUT_OF_RANGE", "GUESS_NOT_INTEGER", "GUESS_KEYS_MISMATCH", "DUPLICATE_SUBMISSION", "GAME_ENDED", "UNKNOWN_PLAYER",
      ]) {
        expect(cov.byCause[code] ?? 0, `rejections with ${code}`).toBeGreaterThanOrEqual(5);
      }
      expect(cov.badSeeds, "invalid seeds").toBe(cov.runs);
      expect(cov.badConfigs, "invalid configurations").toBe(cov.runs);
      expect(cov.viewChecks, "view checks").toBe(cov.runs * 4);
      expect(elapsed, "duration").toBeLessThan(MAX_DURATION_MS);
    },
  );
});

// ---------------------------------------------------------------------------------------------------------
// Examples (not generated)
// ---------------------------------------------------------------------------------------------------------

describe("Property 26: examples of the edge cases", () => {
  it("EXAMPLE: an empty log replays to the initial state, and a wrong-phase first action is rejected at index 0", () => {
    const config = deepFreeze(defaultConfig());
    const created = newGame({ seed: 7, config });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const empty = replay(7, config, deepFreeze([]));
    expect(empty.ok).toBe(true);
    if (empty.ok) {
      expect(stateEquals(empty.value, created.value)).toBe(true);
      expect(same(empty.value, created.value)).toBe(true);
      expect(empty.value.log).toEqual([]);
    }
    const rejected = replay(7, config, deepFreeze<Action[]>([{ type: "ACK_REVEAL" }]));
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(isReplayRejection(rejected.error)).toBe(true);
      if (isReplayRejection(rejected.error)) {
        expect(rejected.error.index).toBe(0);
        expect(rejected.error.cause.code).toBe("WRONG_PHASE");
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// Notes (observed with SEED_P26 and NUM_RUNS_P26 = 200; QROKER_COVERAGE_LOG=1 prints the live numbers)
// ---------------------------------------------------------------------------------------------------------
// Duration about 6 s alone. Games (origin): NONE 39, END 44, GC 22, REVEAL 26, TWO 47 (+1 fallback), EMPTY 21; both
// visibility modes about 100 each; at most 80 actions per log (the base generator's size limit, the extensions end
// the game earlier than 300 steps because only the first placement and codes draw cards).
// Final phase of the log: PLACEMENT 33, GUESS_COLLECT with 0/1/2/3 submissions 13/16/22/18, REVEAL 13, ENDED 85, batch
// of two codes 47, empty log 23. Prefixes replayed: 1054 (PLACEMENT 595, GC0..GC3 90/75/69/77, REVEAL 63, ENDED 85;
// batch of one code 231, of two codes 80; the empty prefix in every run).
// Corruptions: 600 made, 491 rejected (index 0: 102, middle: 216, last: 173; after the last action: 121), 109 accepted
// with a different state (APPEND_LEGAL 71, TWEAK_GUESS_VALID 15, SWAP_ADJACENT_SUBMITS 14, SWAP_LEGAL_PLACE 5,
// WRONG_PLAYER 4). Causes: WRONG_PHASE 110, NOT_YOUR_TURN 88, GAME_ENDED 73, CARD_NOT_IN_HAND 48, DUPLICATE_SUBMISSION
// 26, GUESS_NOT_INTEGER 22, NOT_ADJACENT 21, GUESS_KEYS_MISMATCH 20, OUT_OF_BOUNDS 20, INVALID_ORIENTATION 19,
// GUESS_OUT_OF_RANGE 17, UNKNOWN_PLAYER 14, OCCUPIED 13.
