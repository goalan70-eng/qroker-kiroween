// Tests of the headless driver (task 13.1): complete four-AI games, determinism, replay, illegal and throwing
// strategies, the invariant checker (including injected corruption), AI isolation, the finite-execution guard and the
// decision-seed derivation. The end-to-end run over many seeds is task 13.2 (sim/e2e.test.ts), not here.
//
// Test files may import any module. The checker is exercised on corrupted copies of REAL states: a copy is made with
// `structuredClone` (which drops the frozen flags), changed in exactly one place, and frozen again with `deepFreeze`,
// so that only the targeted invariant is expected to fire.

import { describe, expect, it } from "vitest";
import type { AIStrategy, AiContext, PlaceAction, SubmitGuessesAction } from "../ai/strategy";
import { ALL_CARDS } from "../core/cards";
import { reduce } from "../core/engine";
import { mix32 } from "../core/prng";
import { replay, stateEquals } from "../core/replay";
import { deepFreeze, defaultConfig, newGame } from "../core/state";
import type { GamePhase, GameState } from "../core/state";
import { SEATS } from "../core/turn";
import type { Action, Difficulty, GameConfig, IdentityVisibility, Orientation, PlayerId } from "../core/types";
import { viewFor } from "../core/view";
import type { PlayerView } from "../core/view";
import {
  AiStrategyError,
  ActionLimitError,
  DEFAULT_MAX_ACTIONS,
  IllegalAiActionError,
  InvariantViolation,
  MAX_LEGAL_ACTIONS,
  checkStateInvariants,
  decisionSeed,
  listInvariantViolations,
  playGame,
  strategiesFor,
  summarizeGame,
} from "./play-game";
import type { InvariantName } from "./play-game";
import type { PlayGameOptions, PlayGameResult } from "./types";

// ---------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------

type Tiers = readonly [Difficulty, Difficulty, Difficulty, Difficulty];

const ALL_BEGINNER: Tiers = ["BEGINNER", "BEGINNER", "BEGINNER", "BEGINNER"];
const ALL_ADVANCED: Tiers = ["ADVANCED", "ADVANCED", "ADVANCED", "ADVANCED"];
const MIXED: Tiers = ["ADVANCED", "BEGINNER", "ADVANCED", "BEGINNER"];

const strategiesOf = (tiers: Tiers): Record<PlayerId, AIStrategy> =>
  strategiesFor({ P0: tiers[0], P1: tiers[1], P2: tiers[2], P3: tiers[3] });

const configOf = (visibility: IdentityVisibility): GameConfig => ({ ...defaultConfig(), identityVisibility: visibility });

/** A configuration whose four seats are all HUMAN (the driver assigns AI strategies anyway). */
function allHumanConfig(visibility: IdentityVisibility): GameConfig {
  const base = defaultConfig();
  const seats = base.seats.map((s) => ({ id: s.id, kind: "HUMAN" as const, name: s.name })) as unknown as GameConfig["seats"];
  return { ...base, seats, identityVisibility: visibility };
}

const play = (seed: number, tiers: Tiers, visibility: IdentityVisibility = "OWNER_ONLY", extra: Partial<PlayGameOptions> = {}): PlayGameResult =>
  playGame({ seed, config: configOf(visibility), strategies: strategiesOf(tiers), ...extra });

const json = (value: unknown): string => JSON.stringify(value);

/** The states of a game: `newGame` and the state after each log entry. */
function statesOf(seed: number, config: GameConfig, log: readonly Action[]): GameState[] {
  const created = newGame({ seed, config });
  if (!created.ok) throw new Error("newGame failed");
  const states: GameState[] = [created.value];
  for (const action of log) {
    const next = reduce(states[states.length - 1] as GameState, action);
    if (!next.ok) throw new Error(`replay rejected ${next.error.code}`);
    states.push(next.value);
  }
  return states;
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

function allKeys(value: unknown, out: Set<string> = new Set<string>()): Set<string> {
  if (typeof value !== "object" || value === null) return out;
  if (!Array.isArray(value)) for (const key of Object.keys(value)) out.add(key);
  for (const child of Object.values(value)) allKeys(child, out);
  return out;
}

interface Call {
  readonly kind: "place" | "guess";
  readonly seat: PlayerId;
  readonly args: readonly unknown[];
  readonly view: PlayerView;
  readonly ctx: AiContext;
}

/** Wraps a strategy: records every call (with its raw argument list) and forwards it. */
function spy(seat: PlayerId, inner: AIStrategy, calls: Call[]): AIStrategy {
  return {
    id: inner.id,
    choosePlacement: (...args: [PlayerView, AiContext]) => {
      calls.push({ kind: "place", seat, args, view: args[0], ctx: args[1] });
      return inner.choosePlacement(...args);
    },
    chooseGuesses: (...args: [PlayerView, AiContext]) => {
      calls.push({ kind: "guess", seat, args, view: args[0], ctx: args[1] });
      return inner.chooseGuesses(...args);
    },
  };
}

function spies(tiers: Tiers, calls: Call[]): Record<PlayerId, AIStrategy> {
  const base = strategiesOf(tiers);
  return { P0: spy("P0", base.P0, calls), P1: spy("P1", base.P1, calls), P2: spy("P2", base.P2, calls), P3: spy("P3", base.P3, calls) };
}

/** A strategy that plays like `inner` but returns `guess(view)` for every pending code. */
function forcedGuesses(inner: AIStrategy, guess: (view: PlayerView) => number): AIStrategy {
  return {
    id: inner.id,
    choosePlacement: (view, ctx) => inner.choosePlacement(view, ctx),
    chooseGuesses: (view, ctx): SubmitGuessesAction => ({
      type: "SUBMIT_GUESSES",
      player: view.viewer,
      guesses: Object.fromEntries(view.pendingQuadKeys.map((key) => [key, guess(view)])),
    }),
  };
}

/** A strategy that returns `change(action, view)` instead of the legal placement. */
function badPlacement(inner: AIStrategy, change: (a: PlaceAction, v: PlayerView) => unknown): AIStrategy {
  return { ...inner, id: inner.id, choosePlacement: (view, ctx) => change(inner.choosePlacement(view, ctx), view) as PlaceAction, chooseGuesses: inner.chooseGuesses };
}

function badGuesses(inner: AIStrategy, change: (a: SubmitGuessesAction, v: PlayerView) => unknown): AIStrategy {
  return { id: inner.id, choosePlacement: inner.choosePlacement, chooseGuesses: (view, ctx) => change(inner.chooseGuesses(view, ctx), view) as SubmitGuessesAction };
}

const withSeat = (base: Record<PlayerId, AIStrategy>, seat: PlayerId, s: AIStrategy): Record<PlayerId, AIStrategy> => ({ ...base, [seat]: s });

function catchError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
}

// ---------------------------------------------------------------------------------------------------------
// Complete games
// ---------------------------------------------------------------------------------------------------------

describe("playGame: complete four-AI games", () => {
  const cases: [string, Tiers][] = [
    ["all BEGINNER", ALL_BEGINNER],
    ["all ADVANCED", ALL_ADVANCED],
    ["mixed ADVANCED/BEGINNER", MIXED],
  ];
  for (const visibility of ["OWNER_ONLY", "FACE_UP"] as const) {
    for (const [name, tiers] of cases) {
      it(`${name}, ${visibility}: reaches ENDED within the bounds with every invariant checked`, () => {
        for (const seed of [0, 7, 12345]) {
          const result = play(seed, tiers, visibility, { checkInvariants: true });
          const s = summarizeGame(result);
          expect(result.final.phase).toBe("ENDED");
          expect(result.final.bonusAwarded !== null || result.final.scoredGroups.length >= 5).toBe(true);
          expect(s.placements).toBe(result.final.placements);
          expect(s.placements).toBeLessThanOrEqual(48);
          expect(s.batches).toBe(result.final.history.length);
          expect(s.submissions).toBe(4 * s.batches);
          expect(s.acknowledgements).toBeGreaterThanOrEqual(s.batches - 1);
          expect(s.acknowledgements).toBeLessThanOrEqual(s.batches);
          expect(s.actions).toBe(s.placements + s.submissions + s.acknowledgements);
          expect(result.final.config.identityVisibility).toBe(visibility);
        }
      });
    }
  }

  it("plays seats configured as HUMAN with the assigned AI strategies (the seat kind is ignored)", () => {
    for (const visibility of ["OWNER_ONLY", "FACE_UP"] as const) {
      const config = allHumanConfig(visibility);
      expect(config.seats.every((s) => s.kind === "HUMAN")).toBe(true);
      const result = playGame({ seed: 3, config, strategies: strategiesOf(MIXED) });
      expect(result.final.phase).toBe("ENDED");
      // Same game as with the default AI kinds: the kinds are not read by the driver.
      const sameTiers = play(3, MIXED, visibility);
      expect(json(result.log)).toBe(json(sameTiers.log));
    }
  });

  it("returns exactly the design's fields: final (deeply frozen) and a log copy equal to final.log", () => {
    const result = play(5, MIXED);
    expect(Object.keys(result).sort()).toEqual(["final", "log"]);
    expect(isDeepFrozen(result.final)).toBe(true);
    expect(result.log).toEqual(result.final.log);
    expect(result.log).not.toBe(result.final.log);
    expect(Object.isFrozen(result.log)).toBe(true);
  });

  it("exercises the GUESS_COLLECT and REVEAL phases, and the driver issues ACK_REVEAL itself", () => {
    const seen = new Set<GamePhase>();
    let acks = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const result = play(seed, ALL_ADVANCED);
      for (const state of statesOf(seed, result.final.config, result.log)) seen.add(state.phase);
      acks += summarizeGame(result).acknowledgements;
    }
    expect([...seen].sort()).toEqual(["ENDED", "GUESS_COLLECT", "PLACEMENT", "REVEAL"]);
    expect(acks).toBeGreaterThan(0);
  });

  it("summarizeGame counts codes and multi-code batches from the history", () => {
    const result = play(2, ALL_ADVANCED);
    const s = summarizeGame(result);
    expect(s.codes).toBe(result.final.history.reduce((n, r) => n + r.codes.length, 0));
    expect(s.multiCodeBatches).toBe(result.final.history.filter((r) => r.codes.length > 1).length);
    expect(s.codes).toBeGreaterThanOrEqual(s.batches);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Determinism and replay
// ---------------------------------------------------------------------------------------------------------

describe("playGame: determinism and replay", () => {
  it("repeating the same seed, configuration and strategies gives a deep-equal final state and log", () => {
    for (const tiers of [ALL_BEGINNER, ALL_ADVANCED, MIXED]) {
      const a = play(11, tiers);
      const b = play(11, tiers);
      expect(stateEquals(a.final, b.final)).toBe(true);
      expect(json(a.final)).toBe(json(b.final));
      expect(json(a.log)).toBe(json(b.log));
    }
  });

  it("different seeds give different games", () => {
    const logs = new Set([1, 2, 3, 4, 5].map((seed) => json(play(seed, MIXED).log)));
    expect(logs.size).toBe(5);
    expect(stateEquals(play(1, MIXED).final, play(2, MIXED).final)).toBe(false);
  });

  it("the invariant checks do not change the game", () => {
    expect(json(play(9, MIXED, "OWNER_ONLY", { checkInvariants: false }).log)).toBe(json(play(9, MIXED, "OWNER_ONLY", { checkInvariants: true }).log));
  });

  it("the log replays to the identical final state", () => {
    for (const visibility of ["OWNER_ONLY", "FACE_UP"] as const) {
      for (const tiers of [ALL_BEGINNER, ALL_ADVANCED, MIXED]) {
        const result = play(21, tiers, visibility);
        const replayed = replay(21, result.final.config, result.log);
        expect(replayed.ok).toBe(true);
        if (replayed.ok) expect(stateEquals(replayed.value, result.final)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// Failures: illegal actions, throwing strategies, invalid options
// ---------------------------------------------------------------------------------------------------------

describe("playGame: illegal AI actions are visible errors", () => {
  const base = strategiesOf(ALL_ADVANCED);
  const config = configOf("OWNER_ONLY");

  const placeCases: [string, (a: PlaceAction, v: PlayerView) => unknown, string][] = [
    ["a card that is not in the hand", (a, v) => ({ ...a, card: ALL_CARDS.find((c) => !v.myHand.includes(c)) }), "CARD_NOT_IN_HAND"],
    ["an occupied cell", (a) => ({ ...a, pos: { row: 3, col: 3 } }), "OCCUPIED"],
    ["orientation 90", (a) => ({ ...a, orientation: 90 as unknown as Orientation }), "INVALID_ORIENTATION"],
    ["a cell outside the board", (a) => ({ ...a, pos: { row: 8, col: 0 } }), "OUT_OF_BOUNDS"],
    ["a cell that is not adjacent", (a) => ({ ...a, pos: { row: 0, col: 0 } }), "NOT_ADJACENT"],
    ["the wrong action type", () => ({ type: "ACK_REVEAL" }), "WRONG_PHASE"],
  ];
  for (const [name, change, code] of placeCases) {
    it(`PLACE with ${name} throws IllegalAiActionError ${code} with the action, seat and index`, () => {
      const bad = badPlacement(base.P0, change);
      const error = catchError(() => playGame({ seed: 4, config, strategies: withSeat(base, "P0", bad) })) as IllegalAiActionError;
      expect(error).toBeInstanceOf(IllegalAiActionError);
      expect(error.code).toBe(code);
      expect(error.context).toMatchObject({ seed: 4, seat: "P0", tier: "ADVANCED", actionIndex: 0, phase: "PLACEMENT" });
      expect(error.action).toEqual(change(base.P0.choosePlacement(viewFor(newGameState(4), "P0"), { decisionSeed: decisionSeed(4, "P0", 0) }), viewFor(newGameState(4), "P0")));
      expect(error.message).toContain(code);
    });
  }

  const firstSubmit = play(4, ALL_ADVANCED).log.findIndex((a) => a.type === "SUBMIT_GUESSES");
  const guessCases: [string, (a: SubmitGuessesAction) => unknown, string][] = [
    ["a missing key", (a) => ({ type: "SUBMIT_GUESSES", player: a.player, guesses: {} }), "GUESS_KEYS_MISMATCH"],
    ["an extra key", (a) => ({ ...a, guesses: { ...a.guesses, ZZ: 10 } }), "GUESS_KEYS_MISMATCH"],
    ["a guess above 52", (a) => ({ ...a, guesses: Object.fromEntries(Object.keys(a.guesses).map((k) => [k, 53])) }), "GUESS_OUT_OF_RANGE"],
    ["a guess below 4", (a) => ({ ...a, guesses: Object.fromEntries(Object.keys(a.guesses).map((k) => [k, 3])) }), "GUESS_OUT_OF_RANGE"],
    ["a fractional guess", (a) => ({ ...a, guesses: Object.fromEntries(Object.keys(a.guesses).map((k) => [k, 7.5])) }), "GUESS_NOT_INTEGER"],
  ];
  it("the reference game reaches a guess collection", () => {
    expect(firstSubmit).toBeGreaterThan(0);
  });
  for (const [name, change, code] of guessCases) {
    it(`SUBMIT_GUESSES with ${name} throws IllegalAiActionError ${code}`, () => {
      for (const [seat, offset] of [["P0", 0], ["P2", 2]] as const) {
        const bad = badGuesses(base[seat], change);
        const error = catchError(() => playGame({ seed: 4, config, strategies: withSeat(base, seat, bad) })) as IllegalAiActionError;
        expect(error).toBeInstanceOf(IllegalAiActionError);
        expect(error.code).toBe(code);
        expect(error.context).toMatchObject({ seed: 4, seat, tier: "ADVANCED", actionIndex: firstSubmit + offset, phase: "GUESS_COLLECT" });
        expect((error.action as { type: string }).type).toBe("SUBMIT_GUESSES");
      }
    });
  }

  it("a second submission is not possible: a strategy that answers for another seat is reported (NOT_YOUR_TURN)", () => {
    const spoof = badGuesses(base.P1, (a) => ({ ...a, player: "P2" }));
    const error = catchError(() => playGame({ seed: 4, config, strategies: withSeat(base, "P1", spoof) })) as IllegalAiActionError;
    expect(error).toBeInstanceOf(IllegalAiActionError);
    expect(error.code).toBe("NOT_YOUR_TURN");
    expect(error.context).toMatchObject({ seat: "P1", actionIndex: firstSubmit + 1 });
  });

  it("an illegal action is not retried and not replaced: exactly one call per decision, then the error", () => {
    const calls: Call[] = [];
    const strategies = spies(ALL_ADVANCED, calls);
    const bad = badPlacement(strategies.P0, (a) => ({ ...a, pos: { row: 3, col: 3 } }));
    expect(() => playGame({ seed: 4, config, strategies: withSeat(strategies, "P0", bad) })).toThrow(IllegalAiActionError);
    expect(calls).toHaveLength(1);
  });

  it("a strategy that throws is reported with its context and cause, and is not called again", () => {
    let count = 0;
    const boom = new RangeError("boom");
    const throwing: AIStrategy = {
      id: "BEGINNER",
      choosePlacement: () => {
        count++;
        throw boom;
      },
      chooseGuesses: () => {
        throw boom;
      },
    };
    const error = catchError(() => playGame({ seed: 6, config, strategies: withSeat(base, "P0", throwing) })) as AiStrategyError;
    expect(error).toBeInstanceOf(AiStrategyError);
    expect(error.cause).toBe(boom);
    expect(error.context).toMatchObject({ seed: 6, seat: "P0", tier: "BEGINNER", actionIndex: 0, phase: "PLACEMENT" });
    expect(error.message).toContain("boom");
    expect(count).toBe(1);
  });

  it("rejects invalid options with a RangeError", () => {
    const strategies = strategiesOf(ALL_BEGINNER);
    expect(() => playGame({ seed: -1, config, strategies })).toThrow(RangeError);
    expect(() => playGame({ seed: 1.5, config, strategies })).toThrow(RangeError);
    expect(() => playGame({ seed: 1, config: { ...config, rulesVersion: 99 }, strategies })).toThrow(RangeError);
    expect(() => playGame({ seed: 1, config, strategies: { ...strategies, P3: undefined as unknown as AIStrategy } })).toThrow(RangeError);
    expect(() => playGame({ seed: 1, config, strategies, maxActions: 0 })).toThrow(RangeError);
    expect(() => playGame({ seed: 1, config, strategies, maxActions: 2.5 })).toThrow(RangeError);
  });
});

function newGameState(seed: number): GameState {
  const created = newGame({ seed, config: configOf("OWNER_ONLY") });
  if (!created.ok) throw new Error("newGame failed");
  return created.value;
}

// ---------------------------------------------------------------------------------------------------------
// The invariant checker
// ---------------------------------------------------------------------------------------------------------

describe("checkStateInvariants", () => {
  const seed = 2;
  const config = configOf("OWNER_ONLY");
  const result = play(seed, ALL_ADVANCED);
  const states = statesOf(seed, config, result.log);
  const midPlacement = states.find((s, i) => i > 8 && s.phase === "PLACEMENT" && s.placements > 3) as GameState;
  const guessState = states.find((s) => s.phase === "GUESS_COLLECT") as GameState;
  const revealIndex = states.findIndex((s) => s.phase === "REVEAL");
  const revealState = states[revealIndex] as GameState;

  /** A frozen, independently modified copy of `state`. */
  const corrupt = (state: GameState, change: (draft: any) => void): GameState => {
    const draft = structuredClone(state) as any;
    change(draft);
    return deepFreeze(draft as GameState);
  };
  const names = (state: GameState, previous?: GameState): InvariantName[] => listInvariantViolations(state, previous).map((f) => f.invariant);

  it("holds on every state of real games, with the previous state", () => {
    for (const [s, tiers, visibility] of [[1, MIXED, "OWNER_ONLY"], [2, ALL_ADVANCED, "FACE_UP"], [3, ALL_BEGINNER, "OWNER_ONLY"]] as const) {
      const game = play(s, tiers, visibility);
      const all = statesOf(s, game.final.config, game.log);
      all.forEach((state, i) => {
        expect(listInvariantViolations(state, all[i - 1])).toEqual([]);
      });
    }
  });

  it("the fixtures of the corruption tests contain the phases they need", () => {
    expect(midPlacement).toBeDefined();
    expect(guessState.pending).not.toBeNull();
    expect(revealIndex).toBeGreaterThan(0);
    expect(names(midPlacement)).toEqual([]);
    expect(names(guessState)).toEqual([]);
    expect(names(revealState)).toEqual([]);
  });

  it("detects a duplicated card", () => {
    const bad = corrupt(midPlacement, (d) => {
      d.hands.P1[0] = d.hands.P0[0];
    });
    expect(names(bad)).toEqual(["CARD_CONSERVATION"]);
    const error = catchError(() => checkStateInvariants(bad)) as InvariantViolation;
    expect(error).toBeInstanceOf(InvariantViolation);
    expect(error.invariant).toBe("CARD_CONSERVATION");
    expect(error.detail).toContain("duplicated");
  });

  it("detects a missing card", () => {
    const bad = corrupt(midPlacement, (d) => {
      d.deck.pop();
    });
    expect(names(bad)).toEqual(["CARD_CONSERVATION"]);
  });

  it("detects a card outside the catalog", () => {
    const bad = corrupt(midPlacement, (d) => {
      d.deck[0] = "X-9";
    });
    expect(names(bad)).toEqual(["CARD_CONSERVATION"]);
  });

  it("detects a board count that does not match the placements", () => {
    const bad = corrupt(midPlacement, (d) => {
      const index = (d.board as (any | null)[]).findIndex((cell) => cell !== null && cell.owner !== "NEUTRAL");
      d.deck.push(d.board[index].card);
      d.board[index] = null;
    });
    expect(names(bad)).toEqual(["BOARD_COUNT"]);
  });

  it("detects a pending batch in the wrong phase", () => {
    const bad = corrupt(guessState, (d) => {
      d.phase = "PLACEMENT";
    });
    expect(names(bad)).toContain("PENDING_PHASE");
    const missing = corrupt(guessState, (d) => {
      d.pending = null;
    });
    expect(names(missing)).toContain("PENDING_PHASE");
  });

  it("detects a duplicated scored group", () => {
    const bad = corrupt(guessState, (d) => {
      d.scoredGroups.push(d.scoredGroups[0]);
    });
    expect(names(bad)).toContain("SCORED_GROUPS_UNIQUE");
  });

  it("detects a backwards phase transition and a falling score", () => {
    // `revealState` is the state after the last submission of a batch; its predecessor is still GUESS_COLLECT.
    const before = states[revealIndex - 1] as GameState;
    expect(names(revealState, before)).toEqual([]);
    const found = names(before, revealState);
    expect(found).toContain("PHASE_TRANSITION");
    expect(found).toContain("LOG_CONSISTENCY");
    const withEarned = states.find((s) => SEATS.some((p) => s.scores[p] > 0)) as GameState;
    const seatWithScore = SEATS.find((p) => withEarned.scores[p] > 0) as PlayerId;
    const lowered = corrupt(withEarned, (d) => {
      d.scores[seatWithScore] = 0;
    });
    expect(names(lowered, withEarned)).toContain("SCORES_MONOTONIC");
  });

  it("detects an invalid turn, an oversized hand and a negative score", () => {
    expect(names(corrupt(midPlacement, (d) => (d.turn = "P9")))).toContain("TURN_VALID");
    const big = corrupt(midPlacement, (d) => {
      for (let i = 0; i < 5; i++) d.hands.P0.push(d.deck.pop());
    });
    expect(names(big)).toEqual(["HAND_SIZE"]);
    expect(names(corrupt(midPlacement, (d) => (d.scores.P2 = -1)))).toContain("SCORES_NON_NEGATIVE");
  });

  it("detects a bonus that is missing, applied twice or inconsistent at ENDED", () => {
    const final = play(0, ALL_BEGINNER, "OWNER_ONLY").final;
    expect(names(final)).toEqual([]);
    expect(names(corrupt(final, (d) => (d.bonusAwarded = null)))).toContain("BONUS");
    const doubled = corrupt(final, (d) => {
      d.scores[d.bonusAwarded] += d.config.scoreConfig.config.handEmptyBonus;
    });
    expect(names(doubled)).toEqual(["SCORE_CONSISTENCY"]);
    const early = corrupt(midPlacement, (d) => (d.bonusAwarded = "P0"));
    expect(names(early)).toContain("BONUS");
    const changed = corrupt(final, (d) => (d.bonusAwarded = d.bonusAwarded === "P0" ? "P1" : "P0"));
    expect(names(changed, final)).toContain("BONUS");
  });

  it("detects a log that does not match the placements and a state that is not deeply frozen", () => {
    expect(names(corrupt(midPlacement, (d) => d.log.splice(d.log.findIndex((e: Action) => e.type === "PLACE"), 1)))).toContain("LOG_CONSISTENCY");
    const thawed = structuredClone(midPlacement) as GameState;
    expect(names(thawed)).toEqual(["FROZEN"]);
    const partlyFrozen = structuredClone(midPlacement) as any;
    deepFreeze(partlyFrozen.board);
    expect(names(partlyFrozen)).toEqual(["FROZEN"]);
  });

  it("detects a broken reveal history", () => {
    const bad = corrupt(revealState, (d) => (d.history[0].batchIndex = 5));
    expect(names(bad)).toContain("HISTORY_CONSISTENCY");
  });

  it("throws InvariantViolation carrying every finding", () => {
    const bad = corrupt(midPlacement, (d) => {
      d.hands.P1[0] = d.hands.P0[0];
      d.turn = "P9";
    });
    const error = catchError(() => checkStateInvariants(bad)) as InvariantViolation;
    expect(error.findings.map((f) => f.invariant).sort()).toEqual(["CARD_CONSERVATION", "TURN_VALID"]);
    expect(error.seed).toBe(seed);
    expect(error.message).toContain("CARD_CONSERVATION");
  });
});

// ---------------------------------------------------------------------------------------------------------
// AI isolation
// ---------------------------------------------------------------------------------------------------------

describe("playGame: AI isolation", () => {
  const VIEW_KEYS = [
    "board", "deckCount", "guessSubmitted", "handCounts", "history", "lastReveal", "myGuesses", "myHand",
    "pendingQuadKeys", "phase", "ranking", "rules", "scores", "turn", "viewer",
  ];
  const FORBIDDEN_KEYS = ["seed", "deck", "hands", "log", "pending", "groupId", "scoredGroups", "guesses", "revealedCards"];

  it("every call receives exactly (PlayerView, { decisionSeed }): frozen, for the asked seat, without sealed keys", () => {
    for (const visibility of ["OWNER_ONLY", "FACE_UP"] as const) {
      const calls: Call[] = [];
      const result = playGame({ seed: 8, config: configOf(visibility), strategies: spies(MIXED, calls) });
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.args).toHaveLength(2);
        expect(Object.keys(call.ctx)).toEqual(["decisionSeed"]);
        expect(typeof call.ctx.decisionSeed).toBe("number");
        expect(Object.isFrozen(call.ctx)).toBe(true);
        expect(isDeepFrozen(call.view)).toBe(true);
        expect(Object.keys(call.view).sort()).toEqual(VIEW_KEYS);
        expect(call.view.viewer).toBe(call.seat);
        const keys = allKeys(call.view);
        for (const forbidden of FORBIDDEN_KEYS) expect(keys.has(forbidden), forbidden).toBe(false);
        if (call.kind === "place") {
          expect(call.view.phase).toBe("PLACEMENT");
          expect(call.view.turn).toBe(call.seat);
        } else {
          expect(call.view.phase).toBe("GUESS_COLLECT");
          expect(call.view.guessSubmitted[call.seat]).toBe(false);
          expect(call.view.myGuesses).toBeNull();
        }
      }
      expect(result.final.phase).toBe("ENDED");
    }
  });

  it("the guess views hold no other seat's guess: own submissions only, and no dependence on earlier guesses", () => {
    const UNIQUE: Record<PlayerId, number> = { P0: 47, P1: 41, P2: 43, P3: 51 };
    const run = (p0Guess: number): Call[] => {
      const calls: Call[] = [];
      const base = spies(ALL_ADVANCED, calls);
      const strategies: Record<PlayerId, AIStrategy> = {
        P0: forcedGuesses(base.P0, () => p0Guess),
        P1: forcedGuesses(base.P1, () => UNIQUE.P1),
        P2: forcedGuesses(base.P2, () => UNIQUE.P2),
        P3: forcedGuesses(base.P3, () => UNIQUE.P3),
      };
      // The forced strategies bypass the spies for guesses, so record the guess views through a second layer.
      const layered = Object.fromEntries(
        SEATS.map((seat) => {
          const inner = strategies[seat];
          return [seat, { id: inner.id, choosePlacement: inner.choosePlacement, chooseGuesses: (v: PlayerView, c: AiContext) => {
            calls.push({ kind: "guess", seat, args: [v, c], view: v, ctx: c });
            return inner.chooseGuesses(v, c);
          } }];
        }),
      ) as Record<PlayerId, AIStrategy>;
      playGame({ seed: 4, config: configOf("OWNER_ONLY"), strategies: layered });
      return calls.filter((c) => c.kind === "guess");
    };
    const first = run(UNIQUE.P0);
    const second = run(8);
    expect(first.length).toBeGreaterThanOrEqual(4);
    const firstBatch = SEATS.map((seat, i) => ({ one: first[i] as Call, two: second[i] as Call, seat }));
    firstBatch.forEach(({ one, two, seat }, i) => {
      expect(one.seat).toBe(seat);
      // Seat i sees which earlier seats submitted, but never what they guessed.
      expect(SEATS.map((s) => one.view.guessSubmitted[s])).toEqual(SEATS.map((_, k) => k < i));
      expect(one.view.myGuesses).toBeNull();
      // P0 guessed 47 in one run and 8 in the other: the views of P1..P3 in the first batch are identical.
      expect(json(one.view)).toBe(json(two.view));
    });
  });
});

// ---------------------------------------------------------------------------------------------------------
// Calls, guard, decision seeds
// ---------------------------------------------------------------------------------------------------------

describe("playGame: calls per decision", () => {
  it("asks exactly once per PLACE and once per seat and batch; the driver issues the acknowledgements", () => {
    const calls: Call[] = [];
    const result = playGame({ seed: 14, config: configOf("OWNER_ONLY"), strategies: spies(MIXED, calls) });
    const s = summarizeGame(result);
    expect(calls.filter((c) => c.kind === "place")).toHaveLength(s.placements);
    expect(calls.filter((c) => c.kind === "guess")).toHaveLength(s.submissions);
    expect(calls.length + s.acknowledgements).toBe(s.actions);
    // The asked seat is the acting seat: the calls come in the order of the non-ACK log entries.
    const decided = result.log.filter((a) => a.type !== "ACK_REVEAL");
    expect(calls.map((c) => c.seat)).toEqual(decided.map((a) => (a as { player: PlayerId }).player));
    expect(calls.map((c) => c.kind)).toEqual(decided.map((a) => (a.type === "PLACE" ? "place" : "guess")));
  });
});

describe("playGame: finite-execution guard", () => {
  it("documents the bound: 48 placements x (1 + 4 + 1) actions, plus slack", () => {
    expect(MAX_LEGAL_ACTIONS).toBe(288);
    expect(DEFAULT_MAX_ACTIONS).toBe(300);
  });

  it("the default guard exceeds the longest of 30 observed games and a game fits a guard of exactly its length", () => {
    let longest = 0;
    for (let seed = 0; seed < 30; seed++) {
      const tiers = seed % 3 === 0 ? ALL_BEGINNER : seed % 3 === 1 ? ALL_ADVANCED : MIXED;
      const result = play(seed, tiers, seed % 2 === 0 ? "OWNER_ONLY" : "FACE_UP", { checkInvariants: false });
      longest = Math.max(longest, result.log.length);
      expect(result.log.length).toBeLessThan(DEFAULT_MAX_ACTIONS);
    }
    expect(longest).toBeGreaterThan(40);
    const exact = play(3, MIXED);
    expect(play(3, MIXED, "OWNER_ONLY", { maxActions: exact.log.length }).log.length).toBe(exact.log.length);
  });

  it("throws ActionLimitError with the state context when the limit is smaller than the game", () => {
    const exact = play(3, MIXED);
    const error = catchError(() => play(3, MIXED, "OWNER_ONLY", { maxActions: exact.log.length - 1 })) as ActionLimitError;
    expect(error).toBeInstanceOf(ActionLimitError);
    expect(error.limit).toBe(exact.log.length - 1);
    expect(error.actionIndex).toBe(exact.log.length - 1);
    expect(error.seed).toBe(3);
    expect(error.message).toContain("seed 3");
    expect(() => play(3, MIXED, "OWNER_ONLY", { maxActions: 5 })).toThrow(ActionLimitError);
  });
});

describe("playGame: decision seeds", () => {
  it("follows mix32(gameSeed, seatIndex * 100000 + actionIndex) with actionIndex = log length before the decision", () => {
    const calls: Call[] = [];
    const seed = 31;
    const result = playGame({ seed, config: configOf("FACE_UP"), strategies: spies(ALL_ADVANCED, calls) });
    const decided = result.log.map((action, index) => ({ action, index })).filter((e) => e.action.type !== "ACK_REVEAL");
    expect(calls).toHaveLength(decided.length);
    decided.forEach(({ action, index }, k) => {
      const seat = (action as { player: PlayerId }).player;
      const expected = mix32(seed, SEATS.indexOf(seat) * 100000 + index);
      expect((calls[k] as Call).ctx.decisionSeed).toBe(expected);
      expect(decisionSeed(seed, seat, index)).toBe(expected);
    });
    expect(new Set(calls.map((c) => c.ctx.decisionSeed)).size).toBe(calls.length);
  });

  it("the first decision of the game is P0 at action 0", () => {
    const calls: Call[] = [];
    playGame({ seed: 77, config: configOf("OWNER_ONLY"), strategies: spies(ALL_BEGINNER, calls) });
    expect((calls[0] as Call).seat).toBe("P0");
    expect((calls[0] as Call).ctx.decisionSeed).toBe(mix32(77, 0));
  });
});
