// Unit tests of `replay` and `stateEquals` (task 10.1). The property test of Property 26 is task 10.2.
//
// Games are driven by the engine's own legal-play driver (testing/state-generators.ts) with a fixed choice stream
// (a small LCG, no Math.random), so every scenario is reproducible. Corrupted logs are made from a real game's
// action list by replacing one action at a known index.

import { describe, expect, it } from "vitest";
import { reduce } from "./engine";
import { isReplayRejection, replay, stateEquals } from "./replay";
import type { ReplayRejection } from "./replay";
import { defaultConfig, newGame } from "./state";
import type { GameState } from "./state";
import { SEATS, nextSeat } from "./turn";
import type { Action, ErrorCode, GameConfig, PlayerId } from "./types";
import { DEFAULT_STYLE, playToEnd, replayActions } from "./testing/state-generators";
import type { Reachable } from "./testing/state-generators";

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const CONFIG: GameConfig = defaultConfig();

/** Deterministic non-negative integers (LCG), used as the driver's choice stream. */
function numbers(count: number, seed: number): number[] {
  const out: number[] = [];
  let x = seed >>> 0;
  for (let i = 0; i < count; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out.push(x >>> 8);
  }
  return out;
}

const STYLE = { ...DEFAULT_STYLE, codeBias: 90 };

function game(seed: number, style = STYLE): Reachable {
  return playToEnd(seed, CONFIG, numbers(2000, seed * 7 + 1), style);
}

/** The first generated game (seeds 1, 2, ...) with an index `k` for which `pick(states[k], actions[k], k)` holds. */
function findGame(pick: (r: Reachable, k: number) => boolean): { r: Reachable; k: number } {
  for (let seed = 1; seed <= 300; seed++) {
    const r = game(seed);
    for (let k = 0; k < r.actions.length; k++) if (pick(r, k)) return { r, k };
  }
  throw new Error("no generated game has the wanted position");
}

function mustReplay(seed: number, config: GameConfig, actions: readonly Action[]): GameState {
  const result = replay(seed, config, actions);
  if (!result.ok) throw new Error(`replay failed: ${JSON.stringify(result.error)}`);
  return result.value;
}

function mustFail(seed: number, config: GameConfig, actions: readonly Action[]): ReplayRejection {
  const result = replay(seed, config, actions);
  if (result.ok) throw new Error("replay unexpectedly succeeded");
  if (!isReplayRejection(result.error)) throw new Error(`not a REPLAY_REJECTED: ${JSON.stringify(result.error)}`);
  return result.error;
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

const withAction = (actions: readonly Action[], k: number, action: Action): Action[] =>
  actions.map((a, i) => (i === k ? action : a));

// ---------------------------------------------------------------------------------------------
// replay: success
// ---------------------------------------------------------------------------------------------

describe("replay of legal logs", () => {
  it("an empty log returns the initial state", () => {
    const created = newGame({ seed: 12345, config: CONFIG });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const state = mustReplay(12345, CONFIG, []);
    expect(state).toEqual(created.value);
    expect(stateEquals(state, created.value)).toBe(true);
    expect(state.log).toEqual([]);
    expect(state.phase).toBe("PLACEMENT");
  });

  it("reproduces every prefix state of a complete game: placements, partial guesses, reveals and the end", () => {
    const r = game(3);
    const phases = new Set<string>();
    const partial = new Set<number>();
    r.states.forEach((expected, i) => {
      const state = mustReplay(r.seed, r.config, r.actions.slice(0, i));
      expect(state).toEqual(expected);
      expect(stateEquals(state, expected)).toBe(true);
      expect(state.log).toEqual(expected.log);
      phases.add(state.phase);
      if (state.pending !== null) partial.add(Object.keys(state.pending.guesses).length);
    });
    expect([...phases].sort()).toEqual(["ENDED", "GUESS_COLLECT", "PLACEMENT", "REVEAL"]);
    // GUESS_COLLECT was replayed with 0, 1, 2 and 3 of the 4 submissions made.
    expect([...partial].sort()).toEqual([0, 1, 2, 3]);
  });

  it("replays many seeds to the state of the original game", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const r = game(seed, seed % 2 === 0 ? STYLE : { codeBias: 20, submitOrder: "RANDOM" });
      const state = mustReplay(r.seed, r.config, r.actions);
      expect(state.phase).toBe("ENDED");
      expect(stateEquals(state, r.state)).toBe(true);
      expect(state).toEqual(r.state);
      expect(state.log).toEqual(r.state.log);
      expect(state.log).toHaveLength(r.actions.length);
    }
  });

  it("is deterministic: two replays are equal and equal the step-by-step states", () => {
    const r = game(5);
    const a = mustReplay(r.seed, r.config, r.actions);
    const b = mustReplay(r.seed, r.config, r.actions);
    expect(a).toEqual(b);
    expect(stateEquals(a, b)).toBe(true);
    const stepwise = replayActions(r.seed, r.config, r.actions);
    expect(stateEquals(a, stepwise[stepwise.length - 1] as GameState)).toBe(true);
  });

  it("returns a deeply frozen state", () => {
    const r = game(4);
    const state = mustReplay(r.seed, r.config, r.actions);
    expect(isDeepFrozen(state)).toBe(true);
    expect(isDeepFrozen(mustReplay(r.seed, r.config, []))).toBe(true);
    expect(isDeepFrozen(mustReplay(r.seed, r.config, r.actions.slice(0, 3)))).toBe(true);
  });

  it("the log of the result is the accepted actions as the reducer normalizes them", () => {
    const r = game(6);
    // Extra properties on the raw actions are not kept in the log.
    const noisy = r.actions.map((a) => ({ ...a, note: "x" }) as unknown as Action);
    const state = mustReplay(r.seed, r.config, noisy);
    expect(state.log).toEqual(r.state.log);
    expect(JSON.stringify(state.log)).not.toContain("note");
    expect(stateEquals(state, r.state)).toBe(true);
  });

  it("accepts deep-frozen seed, configuration and actions and leaves them unchanged", () => {
    const r = game(7);
    const config = deepFreeze(structuredClone(r.config));
    const actions = deepFreeze(structuredClone(r.actions) as Action[]);
    const configBefore = structuredClone(config);
    const actionsBefore = structuredClone(actions);
    const state = mustReplay(r.seed, config, actions);
    expect(stateEquals(state, r.state)).toBe(true);
    expect(config).toEqual(configBefore);
    expect(actions).toEqual(actionsBefore);
    // A failing replay does not mutate frozen inputs either.
    const broken = deepFreeze(withAction(actionsBefore, 2, { type: "ACK_REVEAL" }));
    expect(mustFail(r.seed, config, broken).index).toBe(2);
  });

  it("the result does not share mutable references with the inputs (log entries are copies)", () => {
    const r = game(8);
    const actions = structuredClone(r.actions) as Action[];
    const state = mustReplay(r.seed, r.config, actions);
    expect(state.log[0]).not.toBe(actions[0]);
  });
});

// ---------------------------------------------------------------------------------------------
// replay: rejections
// ---------------------------------------------------------------------------------------------

describe("replay of corrupted logs", () => {
  function expectRejectedAt(
    r: Reachable,
    k: number,
    corrupted: readonly Action[],
    code: ErrorCode,
    index = k,
  ): void {
    const result = replay(r.seed, r.config, corrupted);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const error = result.error;
    expect(isReplayRejection(error)).toBe(true);
    if (!isReplayRejection(error)) return;
    expect(error.code).toBe("REPLAY_REJECTED");
    expect(error.index).toBe(index);
    expect(error.cause.code).toBe(code);
    // The cause is exactly what the reducer says for that action on the state before it.
    const direct = reduce(r.states[index] as GameState, corrupted[index] as Action);
    expect(direct.ok).toBe(false);
    if (!direct.ok) expect(error.cause).toEqual(direct.error);
    // No state is returned on failure.
    expect(Object.keys(result).sort()).toEqual(["error", "ok"]);
  }

  const isPlace = (r: Reachable, k: number): boolean => (r.actions[k] as Action).type === "PLACE";

  it("wrong player at index k", () => {
    const { r, k } = findGame((g, i) => i >= 3 && isPlace(g, i) && g.states[i]?.phase === "PLACEMENT");
    const original = r.actions[k] as Extract<Action, { type: "PLACE" }>;
    const wrong = { ...original, player: nextSeat(original.player) };
    expectRejectedAt(r, k, withAction(r.actions, k, wrong), "NOT_YOUR_TURN");
  });

  it("card not in the hand", () => {
    const { r, k } = findGame((g, i) => i >= 2 && isPlace(g, i));
    const original = r.actions[k] as Extract<Action, { type: "PLACE" }>;
    const state = r.states[k] as GameState;
    const other = SEATS.find((s) => s !== original.player) as PlayerId;
    const foreign = state.hands[other][0];
    expectRejectedAt(r, k, withAction(r.actions, k, { ...original, card: foreign as typeof original.card }), "CARD_NOT_IN_HAND");
  });

  it("illegal cells: out of bounds, occupied, not adjacent", () => {
    const { r, k } = findGame((g, i) => i >= 1 && isPlace(g, i));
    const original = r.actions[k] as Extract<Action, { type: "PLACE" }>;
    const at = (row: number, col: number): Action => ({ ...original, pos: { row, col } });
    expectRejectedAt(r, k, withAction(r.actions, k, at(-1, 0)), "OUT_OF_BOUNDS");
    expectRejectedAt(r, k, withAction(r.actions, k, at(3, 3)), "OCCUPIED");
    // A cell that is empty and not next to any card at that point of the game.
    const state = r.states[k] as GameState;
    const lonely = state.board.findIndex((cell, i) => {
      if (cell !== null) return false;
      const row = Math.floor(i / 8);
      const col = i % 8;
      return [[-1, 0], [1, 0], [0, -1], [0, 1]].every(([dr, dc]) => {
        const rr = row + (dr as number);
        const cc = col + (dc as number);
        return rr < 0 || rr > 7 || cc < 0 || cc > 7 || state.board[rr * 8 + cc] === null;
      });
    });
    expect(lonely).toBeGreaterThanOrEqual(0);
    expectRejectedAt(r, k, withAction(r.actions, k, at(Math.floor(lonely / 8), lonely % 8)), "NOT_ADJACENT");
  });

  it("invalid guess", () => {
    const { r, k } = findGame((g, i) => (g.actions[i] as Action).type === "SUBMIT_GUESSES");
    const original = r.actions[k] as Extract<Action, { type: "SUBMIT_GUESSES" }>;
    const key = Object.keys(original.guesses)[0] as string;
    const guess = (value: number): Action => ({ ...original, guesses: { ...original.guesses, [key]: value } });
    expectRejectedAt(r, k, withAction(r.actions, k, guess(1000)), "GUESS_OUT_OF_RANGE");
    expectRejectedAt(r, k, withAction(r.actions, k, guess(7.5)), "GUESS_NOT_INTEGER");
    expectRejectedAt(r, k, withAction(r.actions, k, { ...original, guesses: {} }), "GUESS_KEYS_MISMATCH");
  });

  it("action of the wrong phase", () => {
    const place = findGame((g, i) => isPlace(g, i));
    expectRejectedAt(place.r, place.k, withAction(place.r.actions, place.k, { type: "ACK_REVEAL" }), "WRONG_PHASE");
    const submit = findGame((g, i) => (g.actions[i] as Action).type === "SUBMIT_GUESSES");
    const aPlace = place.r.actions[place.k] as Action;
    expectRejectedAt(submit.r, submit.k, withAction(submit.r.actions, submit.k, aPlace), "WRONG_PHASE");
    const ack = findGame((g, i) => (g.actions[i] as Action).type === "ACK_REVEAL");
    expectRejectedAt(ack.r, ack.k, withAction(ack.r.actions, ack.k, aPlace), "WRONG_PHASE");
  });

  it("unknown action types and non-object elements are rejected at their index", () => {
    const r = game(9);
    const bad: unknown[] = [null, undefined, 5, "PLACE", [], { type: "NOPE" }];
    for (const item of bad) {
      const corrupted = withAction(r.actions, 4, item as Action);
      expectRejectedAt(r, 4, corrupted, "WRONG_PHASE");
    }
    // A hole of a sparse array reads as undefined.
    const sparse = [...r.actions.slice(0, 3)] as Action[];
    sparse.length = 5;
    expect(mustFail(r.seed, r.config, sparse).index).toBe(3);
  });

  it("duplicate submission", () => {
    const { r, k } = findGame(
      (g, i) => (g.actions[i] as Action).type === "SUBMIT_GUESSES" && (g.actions[i - 1] as Action | undefined)?.type === "SUBMIT_GUESSES",
    );
    const previous = r.actions[k - 1] as Action;
    expectRejectedAt(r, k, withAction(r.actions, k, previous), "DUPLICATE_SUBMISSION");
  });

  it("an extra action after ENDED is rejected with GAME_ENDED at the first trailing index", () => {
    const r = game(10);
    const n = r.actions.length;
    expectRejectedAt(r, n, [...r.actions, { type: "ACK_REVEAL" }], "GAME_ENDED", n);
    const first = mustFail(r.seed, r.config, [...r.actions, { type: "ACK_REVEAL" }, { type: "ACK_REVEAL" }]);
    expect(first.index).toBe(n);
    expect(first.cause.code).toBe("GAME_ENDED");
  });

  it("reports the first failing index when there are two corruptions", () => {
    const r = game(11);
    const early = 5;
    const late = 20;
    expect(r.actions.length).toBeGreaterThan(late);
    const bad = { type: "NOPE" } as unknown as Action;
    const twice = withAction(withAction(r.actions, late, bad), early, bad);
    expect(mustFail(r.seed, r.config, twice).index).toBe(early);
    expect(mustFail(r.seed, r.config, withAction(withAction(r.actions, early, bad), late, bad)).index).toBe(early);
  });

  it("index 0 and the last index are reported exactly", () => {
    const r = game(12);
    const bad = { type: "NOPE" } as unknown as Action;
    expect(mustFail(r.seed, r.config, withAction(r.actions, 0, bad)).index).toBe(0);
    const last = r.actions.length - 1;
    expect(mustFail(r.seed, r.config, withAction(r.actions, last, bad)).index).toBe(last);
  });

  it("a failed replay does not mutate its inputs and a later replay of the good log still works", () => {
    const r = game(13);
    const actions = structuredClone(r.actions) as Action[];
    const corrupted = withAction(actions, 6, { type: "NOPE" } as unknown as Action);
    const before = structuredClone(corrupted);
    mustFail(r.seed, r.config, corrupted);
    expect(corrupted).toEqual(before);
    expect(stateEquals(mustReplay(r.seed, r.config, actions), r.state)).toBe(true);
  });
});

describe("replay argument and initialization errors", () => {
  it("returns the newGame error as is, without an index, for an invalid seed", () => {
    for (const seed of [-1, 1.5, Number.NaN, 2 ** 32, Number.POSITIVE_INFINITY, "7" as unknown as number]) {
      const expected = newGame({ seed, config: CONFIG });
      expect(expected.ok).toBe(false);
      const result = replay(seed, CONFIG, []);
      expect(result.ok).toBe(false);
      if (result.ok || expected.ok) continue;
      expect(result.error).toEqual(expected.error);
      expect(isReplayRejection(result.error)).toBe(false);
      expect("index" in result.error).toBe(false);
      expect(result.error.code).not.toBe("REPLAY_REJECTED");
    }
  });

  it("returns the newGame error as is for an invalid configuration", () => {
    const badScore = { ...CONFIG, scoreConfig: { ...CONFIG.scoreConfig, config: { rewardByError: [], handEmptyBonus: 1 } } };
    for (const config of [null, undefined, {}, badScore] as unknown as GameConfig[]) {
      const expected = newGame({ seed: 1, config });
      expect(expected.ok).toBe(false);
      const result = replay(1, config, []);
      expect(result.ok).toBe(false);
      if (result.ok || expected.ok) continue;
      expect(result.error).toEqual(expected.error);
      expect(["INVALID_CONFIG", "INVALID_SCORE_CONFIG"]).toContain(result.error.code);
      expect("index" in result.error).toBe(false);
    }
  });

  it("an invalid seed is reported before the actions are looked at", () => {
    const result = replay(-1, CONFIG, [{ type: "NOPE" } as unknown as Action]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(isReplayRejection(result.error)).toBe(false);
  });

  it("actions that is not an array is INVALID_CONFIG", () => {
    for (const actions of [null, undefined, {}, "abc", 3, { length: 0 }] as unknown as Action[][]) {
      const result = replay(1, CONFIG, actions);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe("INVALID_CONFIG");
      expect(isReplayRejection(result.error)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// stateEquals
// ---------------------------------------------------------------------------------------------

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = (state: GameState): Loose => structuredClone(state) as unknown as Loose;
const asState = (value: Loose): GameState => value as unknown as GameState;

/** Rebuilds `value` with the keys of every object inserted in reverse order. */
function reverseKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reverseKeys) as unknown as T;
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).reverse()) out[key] = reverseKeys((value as Record<string, unknown>)[key]);
    return out as T;
  }
  return value;
}

/** A mid-game state with a partly submitted batch, a non-empty history and a reveal record. */
function findMid(): GameState {
  for (let seed = 1; seed <= 300; seed++) {
    const r = game(seed);
    const found = r.states.find(
      (s) =>
        s.phase === "GUESS_COLLECT" &&
        s.pending !== null &&
        Object.keys(s.pending.guesses).length >= 1 &&
        s.history.length >= 1 &&
        s.scoredGroups.length >= 1 &&
        SEATS.every((seat) => s.hands[seat].length >= 2) &&
        s.deck.length >= 2 &&
        s.log.length >= 2,
    );
    if (found) return found;
  }
  throw new Error("no mid-game state found");
}

describe("stateEquals", () => {
  const mid = findMid();
  const ended = game(3).state;

  it("is true for the same object and for separately built equal states", () => {
    expect(stateEquals(mid, mid)).toBe(true);
    const a = game(2).state;
    const b = game(2).state;
    expect(a).not.toBe(b);
    expect(stateEquals(a, b)).toBe(true);
    expect(stateEquals(b, a)).toBe(true);
  });

  it("is true for a deep clone and for a clone with reversed key insertion order", () => {
    for (const state of [mid, ended]) {
      expect(stateEquals(state, asState(clone(state)))).toBe(true);
      const shuffled = reverseKeys(state);
      // The key order really differs, so JSON.stringify would not match.
      expect(JSON.stringify(shuffled)).not.toBe(JSON.stringify(state));
      expect(stateEquals(state, shuffled)).toBe(true);
      expect(stateEquals(shuffled, state)).toBe(true);
    }
  });

  it("is false for different games", () => {
    expect(stateEquals(game(2).state, game(3).state)).toBe(false);
    expect(stateEquals(mid, ended)).toBe(false);
    expect(stateEquals(asState(clone(mid)), ended)).toBe(false);
  });

  const mutations: readonly { name: string; base: GameState; mutate: (s: Loose) => void }[] = [
    { name: "seed", base: mid, mutate: (s) => void (s.seed += 1) },
    { name: "config seat name", base: mid, mutate: (s) => void (s.config.seats[1].name += "!") },
    { name: "config score table", base: mid, mutate: (s) => void (s.config.scoreConfig.config.handEmptyBonus += 1) },
    { name: "config identityVisibility", base: mid, mutate: (s) => void (s.config.identityVisibility = s.config.identityVisibility === "FACE_UP" ? "OWNER_ONLY" : "FACE_UP") },
    { name: "phase", base: mid, mutate: (s) => void (s.phase = "REVEAL") },
    { name: "turn", base: mid, mutate: (s) => void (s.turn = nextSeat(s.turn)) },
    {
      name: "board cell card",
      base: mid,
      mutate: (s) => {
        const i = s.board.findIndex((c: Loose | null, idx: number) => c !== null && idx !== 27);
        s.board[i].card = s.board[i].card === "H-A" ? "H-2" : "H-A";
      },
    },
    {
      name: "board cell orientation",
      base: mid,
      mutate: (s) => {
        const i = s.board.findIndex((c: Loose | null) => c !== null);
        s.board[i].orientation = s.board[i].orientation === 0 ? 180 : 0;
      },
    },
    {
      name: "board cell owner",
      base: mid,
      mutate: (s) => {
        const i = s.board.findIndex((c: Loose | null) => c !== null);
        s.board[i].owner = s.board[i].owner === "P0" ? "P1" : "P0";
      },
    },
    { name: "board cell emptied", base: mid, mutate: (s) => void (s.board[s.board.findIndex((c: Loose | null) => c !== null)] = null) },
    { name: "hand order", base: mid, mutate: (s) => void s.hands.P2.reverse() },
    { name: "hand card removed", base: mid, mutate: (s) => void s.hands.P1.pop() },
    { name: "deck order", base: mid, mutate: (s) => void s.deck.reverse() },
    { name: "deck card removed", base: mid, mutate: (s) => void s.deck.pop() },
    { name: "scoredGroups element", base: mid, mutate: (s) => void (s.scoredGroups[0] += "x") },
    { name: "scoredGroups extra", base: mid, mutate: (s) => void s.scoredGroups.push("zzz") },
    { name: "revealedCards", base: ended, mutate: (s) => void s.revealedCards.pop() },
    { name: "score", base: mid, mutate: (s) => void (s.scores.P3 += 1) },
    { name: "placements", base: mid, mutate: (s) => void (s.placements += 1) },
    {
      name: "pending guess value",
      base: mid,
      mutate: (s) => {
        const seat = Object.keys(s.pending.guesses)[0] as string;
        const key = Object.keys(s.pending.guesses[seat])[0] as string;
        s.pending.guesses[seat][key] += 1;
      },
    },
    { name: "pending guess removed", base: mid, mutate: (s) => void delete s.pending.guesses[Object.keys(s.pending.guesses)[0] as string] },
    { name: "pending placer", base: mid, mutate: (s) => void (s.pending.placer = nextSeat(s.pending.placer)) },
    { name: "pending hidden sum", base: mid, mutate: (s) => void (s.pending.codes[0].hiddenSum += 1) },
    { name: "pending endsGame", base: mid, mutate: (s) => void (s.pending.endsGame = !s.pending.endsGame) },
    { name: "pending cleared", base: mid, mutate: (s) => void (s.pending = null) },
    { name: "history record", base: mid, mutate: (s) => void (s.history[0].perPlayer[0].earned += 1) },
    { name: "history removed", base: mid, mutate: (s) => void s.history.pop() },
    { name: "lastReveal", base: ended, mutate: (s) => void (s.lastReveal.codes[0].hiddenSum += 1) },
    { name: "lastReveal cleared", base: ended, mutate: (s) => void (s.lastReveal = null) },
    { name: "bonusAwarded", base: ended, mutate: (s) => void (s.bonusAwarded = nextSeat(s.bonusAwarded)) },
    { name: "bonusAwarded cleared", base: ended, mutate: (s) => void (s.bonusAwarded = null) },
    { name: "log entry field", base: mid, mutate: (s) => void (s.log[0].player = nextSeat(s.log[0].player)) },
    {
      name: "log entry position",
      base: mid,
      mutate: (s) => {
        const place = s.log.find((a: Loose) => a.type === "PLACE");
        place.pos.col = (place.pos.col + 1) % 8;
      },
    },
    { name: "log entry order", base: mid, mutate: (s) => void s.log.reverse() },
    { name: "log entry removed", base: mid, mutate: (s) => void s.log.pop() },
    { name: "log entry extra property", base: mid, mutate: (s) => void (s.log[0].extra = 1) },
    { name: "extra property", base: mid, mutate: (s) => void (s.extra = 1) },
    { name: "extra property with value undefined", base: mid, mutate: (s) => void (s.extra = undefined) },
    { name: "extra nested property", base: mid, mutate: (s) => void (s.scores.P9 = 0) },
    { name: "missing property", base: mid, mutate: (s) => void delete s.bonusAwarded },
    { name: "array replaced by object", base: mid, mutate: (s) => void (s.deck = { ...s.deck }) },
  ];

  for (const { name, base, mutate } of mutations) {
    it(`detects a change of: ${name}`, () => {
      const changed = clone(base);
      mutate(changed);
      expect(stateEquals(base, asState(changed))).toBe(false);
      expect(stateEquals(asState(changed), base)).toBe(false);
      // The unchanged clone of the same base is still equal (the mutation is the only difference).
      expect(stateEquals(base, asState(clone(base)))).toBe(true);
    });
  }

  it("is reflexive and symmetric over all states of a game and over the mutated clones", () => {
    const r = game(4);
    for (const a of r.states) expect(stateEquals(a, a)).toBe(true);
    for (let i = 0; i < r.states.length; i += 7) {
      for (let j = 0; j < r.states.length; j += 11) {
        const a = r.states[i] as GameState;
        const b = r.states[j] as GameState;
        expect(stateEquals(a, b)).toBe(stateEquals(b, a));
        expect(stateEquals(a, b)).toBe(i === j);
      }
    }
  });

  it("treats NaN as equal to NaN, -0 as equal to 0, and NaN as different from 0", () => {
    const withScore = (value: number): GameState => {
      const s = clone(mid);
      s.scores.P0 = value;
      return asState(s);
    };
    expect(stateEquals(withScore(Number.NaN), withScore(Number.NaN))).toBe(true);
    expect(stateEquals(withScore(-0), withScore(0))).toBe(true);
    expect(stateEquals(withScore(0), withScore(-0))).toBe(true);
    expect(stateEquals(withScore(Number.NaN), withScore(0))).toBe(false);
    expect(stateEquals(withScore(0), withScore(Number.NaN))).toBe(false);
    expect(stateEquals(withScore(1), withScore(2))).toBe(false);
    expect(stateEquals(withScore(Number.POSITIVE_INFINITY), withScore(Number.NEGATIVE_INFINITY))).toBe(false);
  });

  it("compares by value, not by type coercion", () => {
    const withScore = (value: unknown): GameState => {
      const s = clone(mid);
      s.scores.P0 = value;
      return asState(s);
    };
    expect(stateEquals(withScore(1), withScore("1"))).toBe(false);
    expect(stateEquals(withScore(0), withScore(false))).toBe(false);
    expect(stateEquals(withScore(0), withScore(null))).toBe(false);
    expect(stateEquals(withScore(undefined), withScore(null))).toBe(false);
  });
});
