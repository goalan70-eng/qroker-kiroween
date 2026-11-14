// Example scenarios of the reducer (task 8.2). The property tests of Properties 12-14 and 17-19 are tasks 8.3 and
// 8.4 and are not written here.
//
// Scenario states are built with `makeState` (testing/state-fixtures.ts) from hand-picked cards. Score
// expectations come from the `TEST_TABLE` / `TEST_BONUS` constants of this file, which are injected through the
// game configuration; no placeholder constant of the engine is used.
//
// Board used by the code scenarios (0-based row, col; notation in brackets), valid members per slot:
//   one code  : F4 H-A (TL), G4 D-2 (TR), F5 D-3 (BL) are on the board; P0 holds H-4, which is valid at BR (G5).
//               The completed quad has the Quad_Key F4 and the Hidden_Sum 1 + 2 + 3 + 4 = 10.
//   two codes : F4 H-A, G4 D-2, F5 C-3 (0 degrees), F6 D-4, G6 H-5 are on the board; P0 places C-6 at 180 degrees on
//               G5. C at 180 is valid at TR and BR, so it completes the quad F4 (BR slot, Hidden_Sum 1+2+3+6 = 12)
//               and the quad F5 (TR slot, Hidden_Sum 3+6+4+5 = 18) at once. C-3 at 0 degrees is valid at BL and TL.

import { describe, expect, it } from "vitest";
import { legalCells, placeOnBoard } from "./board";
import { detect } from "./composite-code";
import { ALL_CARDS, groupIdOf } from "./cards";
import { actingSeats, reduce } from "./engine";
import { defaultConfig, newGame } from "./state";
import type { GameState } from "./state";
import { SEATS, nextSeat } from "./turn";
import type { Action, CardId, ErrorCode, GameConfig, Orientation, PlayerId } from "./types";
import { FIXTURE_NEUTRAL, conservationProblem, makeState } from "./testing/state-fixtures";
import type { BoardCell, StateParts } from "./testing/state-fixtures";

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const TEST_TABLE: readonly number[] = [30, 19, 8, 2];
const TEST_BONUS = 50;
const TEST_CONFIG: GameConfig = {
  ...defaultConfig(),
  scoreConfig: { id: "TEST", provisional: false, config: { rewardByError: TEST_TABLE, handEmptyBonus: TEST_BONUS } },
};
const points = (guess: number, hiddenSum: number): number => TEST_TABLE[Math.abs(guess - hiddenSum)] ?? 0;

const place = (player: string, card: string, row: number, col: number, orientation = 0): Action =>
  ({ type: "PLACE", player, card, pos: { row, col }, orientation }) as unknown as Action;
const submit = (player: string, guesses: Record<string, unknown>): Action =>
  ({ type: "SUBMIT_GUESSES", player, guesses }) as unknown as Action;
const ack: Action = { type: "ACK_REVEAL" };

const seenCodes = new Set<ErrorCode>();

function step(state: GameState, action: Action): GameState {
  const result = reduce(state, action);
  if (!result.ok) throw new Error(`unexpected rejection ${result.error.code}: ${result.error.detail ?? ""}`);
  expect(conservationProblem(result.value)).toBeNull();
  return result.value;
}

/** Asserts the rejection code and that the input state is untouched (same reference, deep-equal to a clone). */
function expectRejected(state: GameState, action: Action, code: ErrorCode): void {
  const before = structuredClone(state);
  const result = reduce(state, action);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe(code);
  seenCodes.add(result.error.code);
  expect(state).toEqual(before);
}

const withoutLog = (state: GameState) => ({ ...state, log: [] });

// Fixture builders -------------------------------------------------------------------------------

const ONE_CODE_CELLS: BoardCell[] = [
  { at: "F4", card: "H-A", owner: "P1" },
  { at: "G4", card: "D-2", owner: "P1" },
  { at: "F5", card: "D-3", owner: "P1" },
];
const TWO_CODE_CELLS: BoardCell[] = [
  { at: "F4", card: "H-A", owner: "P1" },
  { at: "G4", card: "D-2", owner: "P1" },
  { at: "F5", card: "C-3", owner: "P1" },
  { at: "F6", card: "D-4", owner: "P1" },
  { at: "G6", card: "H-5", owner: "P1" },
];
const PLACE_ONE_CODE = place("P0", "H-4", 4, 6);
const PLACE_TWO_CODES = place("P0", "C-6", 4, 6, 180);
const PLACE_NO_CODE = place("P0", "S-9", 3, 2); // C4, next to the neutral D4

const oneCode = (extra: StateParts = {}): GameState =>
  makeState({ config: TEST_CONFIG, cells: ONE_CODE_CELLS, hands: { P0: ["H-4", "S-9", "S-10", "S-J"] }, ...extra });
const twoCodes = (extra: StateParts = {}): GameState =>
  makeState({ config: TEST_CONFIG, cells: TWO_CODE_CELLS, hands: { P0: ["C-6", "S-9", "S-10", "S-J"] }, ...extra });
const plain = (extra: StateParts = {}): GameState =>
  makeState({ config: TEST_CONFIG, hands: { P0: ["S-9", "S-10", "S-J", "S-Q"] }, ...extra });

/** Hands for a state with an empty deck: P0 as given, the other cards spread over P1..P3, board = neutral cards. */
function handsWithEmptyDeck(p0: readonly CardId[]): Partial<Record<PlayerId, readonly CardId[]>> {
  const rest = ALL_CARDS.filter((c) => !FIXTURE_NEUTRAL.includes(c) && !p0.includes(c));
  const third = Math.ceil(rest.length / 3);
  return { P0: p0, P1: rest.slice(0, third), P2: rest.slice(third, 2 * third), P3: rest.slice(2 * third) };
}

/** Every seat submits `guesses[seat]` in the given order. */
function submitAll(state: GameState, order: readonly PlayerId[], guesses: Record<PlayerId, Record<string, number>>): GameState {
  return order.reduce((s, seat) => step(s, submit(seat, guesses[seat])), state);
}

const ONE_CODE_GUESSES: Record<PlayerId, Record<string, number>> = {
  P0: { F4: 10 },
  P1: { F4: 11 },
  P2: { F4: 8 },
  P3: { F4: 20 },
};
const TWO_CODE_GUESSES: Record<PlayerId, Record<string, number>> = {
  P0: { F4: 12, F5: 18 },
  P1: { F4: 13, F5: 16 },
  P2: { F4: 30, F5: 19 },
  P3: { F4: 10, F5: 4 },
};

// ---------------------------------------------------------------------------------------------
// PLACE scenarios
// ---------------------------------------------------------------------------------------------

describe("PLACE: draw rule and phase transitions", () => {
  it("first placement without a code: no draw, hand shrinks, turn advances", () => {
    const state = plain();
    const next = step(state, PLACE_NO_CODE);
    expect(next.phase).toBe("PLACEMENT");
    expect(next.hands.P0).toEqual(["S-10", "S-J", "S-Q"]);
    expect(next.deck).toEqual(state.deck);
    expect(next.turn).toBe("P1");
    expect(next.firstPlacementDone).toEqual(["P0"]);
    expect(next.placements).toBe(1);
    expect(next.board[3 * 8 + 2]).toEqual({ card: "S-9", orientation: 0, owner: "P0" });
    expect(next.pending).toBeNull();
    expect(next.scoredGroups).toEqual([]);
    expect(next.log).toEqual([PLACE_NO_CODE]);
  });

  it("first placement with a code: no draw, GUESS_COLLECT with one pending batch", () => {
    const state = oneCode();
    const next = step(state, PLACE_ONE_CODE);
    expect(next.phase).toBe("GUESS_COLLECT");
    expect(next.hands.P0).toEqual(["S-9", "S-10", "S-J"]);
    expect(next.deck).toEqual(state.deck);
    expect(next.turn).toBe("P0");
    expect(next.firstPlacementDone).toEqual(["P0"]);
    const pending = next.pending;
    expect(pending).not.toBeNull();
    expect(pending?.placer).toBe("P0");
    expect(pending?.endsGame).toBe(false);
    expect(pending?.guesses).toEqual({});
    expect(pending?.codes.map((c) => [c.quadKey, c.hiddenSum])).toEqual([["F4", 10]]);
    expect(next.scoredGroups).toEqual([groupIdOf(["H-A", "D-2", "D-3", "H-4"])]);
    expect(actingSeats(next)).toEqual(["P0", "P1", "P2", "P3"]);
  });

  it("non-first placement without a code: draws the top deck card, hand size is unchanged", () => {
    const state = plain({ firstPlacementDone: ["P0"] });
    const top = state.deck[state.deck.length - 1] as CardId;
    const next = step(state, PLACE_NO_CODE);
    expect(next.hands.P0).toEqual(["S-10", "S-J", "S-Q", top]);
    expect(next.deck).toEqual(state.deck.slice(0, -1));
    expect(next.deck.length).toBe(state.deck.length - 1);
    expect(next.turn).toBe("P1");
    expect(next.phase).toBe("PLACEMENT");
  });

  it("non-first placement with a code: no draw", () => {
    const state = oneCode({ firstPlacementDone: ["P0"] });
    const next = step(state, PLACE_ONE_CODE);
    expect(next.hands.P0).toEqual(["S-9", "S-10", "S-J"]);
    expect(next.deck).toEqual(state.deck);
    expect(next.phase).toBe("GUESS_COLLECT");
  });

  it("a placement with two codes opens one batch with two entries in quadKey order", () => {
    const state = twoCodes({ firstPlacementDone: ["P0"] });
    const next = step(state, PLACE_TWO_CODES);
    expect(next.phase).toBe("GUESS_COLLECT");
    expect(next.pending?.codes.map((c) => [c.quadKey, c.hiddenSum])).toEqual([
      ["F4", 12],
      ["F5", 18],
    ]);
    const ids = next.pending?.codes.map((c) => c.groupId) ?? [];
    expect(next.scoredGroups).toEqual([...ids].sort());
    expect(new Set(next.scoredGroups).size).toBe(2);
    expect(next.hands.P0.length).toBe(3);
    expect(next.board[4 * 8 + 6]).toEqual({ card: "C-6", orientation: 180, owner: "P0" });
  });

  it("deck exhaustion: the required draw is skipped, the hand shrinks and no card is manufactured", () => {
    const state = makeState({
      config: TEST_CONFIG,
      hands: handsWithEmptyDeck(["S-9", "S-10", "S-J", "S-Q"]),
      deck: [],
      firstPlacementDone: ["P0"],
    });
    const next = step(state, PLACE_NO_CODE);
    expect(next.hands.P0).toEqual(["S-10", "S-J", "S-Q"]);
    expect(next.deck).toEqual([]);
    expect(next.phase).toBe("PLACEMENT");
    expect(next.turn).toBe("P1");
  });

  it("hand-emptying placement without a code ends the game at once with the bonus (first placement)", () => {
    const state = plain({ hands: { P0: ["S-9"] } });
    const next = step(state, PLACE_NO_CODE);
    expect(next.phase).toBe("ENDED");
    expect(next.hands.P0).toEqual([]);
    expect(next.bonusAwarded).toBe("P0");
    expect(next.scores).toEqual({ P0: TEST_BONUS, P1: 0, P2: 0, P3: 0 });
    expect(next.history).toEqual([]);
    expect(actingSeats(next)).toEqual([]);
  });

  it("hand-emptying placement without a code ends the game when the deck is empty (draw skipped)", () => {
    const state = makeState({ config: TEST_CONFIG, hands: handsWithEmptyDeck(["S-9"]), deck: [], firstPlacementDone: ["P0"] });
    const next = step(state, PLACE_NO_CODE);
    expect(next.phase).toBe("ENDED");
    expect(next.bonusAwarded).toBe("P0");
    expect(next.scores.P0).toBe(TEST_BONUS);
  });

  it("a non-first placement that empties the hand with a non-empty deck draws and the game goes on", () => {
    const state = plain({ hands: { P0: ["S-9"] }, firstPlacementDone: ["P0"] });
    const next = step(state, PLACE_NO_CODE);
    expect(next.phase).toBe("PLACEMENT");
    expect(next.hands.P0.length).toBe(1);
    expect(next.bonusAwarded).toBeNull();
  });

  it("hand-emptying placement with a code: guesses, reveal, then ENDED with the bonus exactly once", () => {
    const state = oneCode({ hands: { P0: ["H-4"] }, firstPlacementDone: ["P0"] });
    const placed = step(state, PLACE_ONE_CODE);
    expect(placed.phase).toBe("GUESS_COLLECT");
    expect(placed.pending?.endsGame).toBe(true);
    expect(placed.bonusAwarded).toBeNull();
    expect(placed.scores).toEqual({ P0: 0, P1: 0, P2: 0, P3: 0 });

    const ended = submitAll(placed, ["P2", "P0", "P3", "P1"], ONE_CODE_GUESSES);
    // The design ends the game with the last submission (reveal, then bonus); no ACK_REVEAL is needed.
    expect(ended.phase).toBe("ENDED");
    expect(ended.bonusAwarded).toBe("P0");
    expect(ended.pending).toBeNull();
    expect(ended.scores).toEqual({
      P0: points(10, 10) + TEST_BONUS,
      P1: points(11, 10),
      P2: points(8, 10),
      P3: points(20, 10),
    });
    // The record holds the prediction scores only; the bonus is added to `scores` after the reveal.
    expect(ended.lastReveal?.perPlayer.find((p) => p.player === "P0")).toEqual({
      player: "P0",
      earned: points(10, 10),
      cumulative: points(10, 10),
    });
    expect(ended.history.length).toBe(1);
    for (const action of [ack, place("P0", "S-9", 0, 0), submit("P0", { F4: 10 })]) {
      expectRejected(ended, action, "GAME_ENDED");
    }
  });
});

// ---------------------------------------------------------------------------------------------
// SUBMIT_GUESSES, reveal, ACK_REVEAL
// ---------------------------------------------------------------------------------------------

describe("SUBMIT_GUESSES and ACK_REVEAL", () => {
  it("collects submissions without revealing until the fourth seat has submitted", () => {
    let state = step(oneCode(), PLACE_ONE_CODE);
    state = step(state, submit("P2", ONE_CODE_GUESSES.P2));
    expect(state.phase).toBe("GUESS_COLLECT");
    expect(state.pending?.guesses.P2).toEqual({ F4: 8 });
    expect(actingSeats(state)).toEqual(["P0", "P1", "P3"]);
    expect(state.scores).toEqual({ P0: 0, P1: 0, P2: 0, P3: 0 });
    expect(state.history).toEqual([]);
    expect(state.lastReveal).toBeNull();
    state = step(state, submit("P0", ONE_CODE_GUESSES.P0));
    state = step(state, submit("P1", ONE_CODE_GUESSES.P1));
    expect(state.phase).toBe("GUESS_COLLECT");
    expect(actingSeats(state)).toEqual(["P3"]);
  });

  it("reveals all seats at once, scores from the injected table, then ACK_REVEAL passes the turn", () => {
    const placed = step(oneCode(), PLACE_ONE_CODE);
    const revealed = submitAll(placed, ["P0", "P1", "P2", "P3"], ONE_CODE_GUESSES);
    expect(revealed.phase).toBe("REVEAL");
    expect(revealed.pending).toBeNull();
    expect(revealed.scores).toEqual({
      P0: points(10, 10),
      P1: points(11, 10),
      P2: points(8, 10),
      P3: points(20, 10),
    });
    expect(revealed.scores).toEqual({ P0: 30, P1: 19, P2: 8, P3: 0 });
    expect(revealed.lastReveal).toEqual({
      batchIndex: 0,
      placer: "P0",
      codes: [{ quadKey: "F4", cards: ["H-A", "D-2", "D-3", "H-4"], hiddenSum: 10 }],
      perPlayer: [
        { player: "P0", earned: 30, cumulative: 30 },
        { player: "P1", earned: 19, cumulative: 19 },
        { player: "P2", earned: 8, cumulative: 8 },
        { player: "P3", earned: 0, cumulative: 0 },
      ],
    });
    expect(revealed.history).toEqual([revealed.lastReveal]);
    expect(revealed.revealedCards).toEqual(["H-A", "D-2", "D-3", "H-4"]);
    expect(revealed.bonusAwarded).toBeNull();
    expect(actingSeats(revealed)).toEqual(["P0"]);

    const next = step(revealed, ack);
    expect(next.phase).toBe("PLACEMENT");
    expect(next.turn).toBe(nextSeat("P0"));
    expect(next.scores).toEqual(revealed.scores);
    expect(actingSeats(next)).toEqual(["P1"]);
  });

  it("scores a two-code batch as the per-code sum", () => {
    const placed = step(twoCodes(), PLACE_TWO_CODES);
    const revealed = submitAll(placed, SEATS, TWO_CODE_GUESSES);
    expect(revealed.phase).toBe("REVEAL");
    for (const seat of SEATS) {
      const g = TWO_CODE_GUESSES[seat];
      const expected = points(g.F4 as number, 12) + points(g.F5 as number, 18);
      expect(revealed.scores[seat]).toBe(expected);
      expect(revealed.lastReveal?.perPlayer.find((p) => p.player === seat)?.earned).toBe(expected);
    }
    expect(revealed.lastReveal?.codes.map((c) => [c.quadKey, c.hiddenSum])).toEqual([
      ["F4", 12],
      ["F5", 18],
    ]);
    expect(revealed.revealedCards.length).toBe(8);
    expect(revealed.history.length).toBe(1);
  });

  it("gives the same state for every submission order, apart from the log order", () => {
    const placed = step(twoCodes(), PLACE_TWO_CODES);
    const permutations = (items: readonly PlayerId[]): PlayerId[][] =>
      items.length <= 1
        ? [[...items]]
        : items.flatMap((item, i) =>
            permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
          );
    const orders = permutations(SEATS);
    expect(orders.length).toBe(24);
    const baseline = submitAll(placed, SEATS, TWO_CODE_GUESSES);
    for (const order of orders) {
      const state = submitAll(placed, order, TWO_CODE_GUESSES);
      expect(withoutLog(state)).toEqual(withoutLog(baseline));
      expect(state.log.slice(1).map((a) => (a.type === "SUBMIT_GUESSES" ? a.player : a.type))).toEqual(order);
    }
  });

  it("is all-or-nothing per submission across several codes", () => {
    const placed = step(twoCodes(), PLACE_TWO_CODES);
    expectRejected(placed, submit("P1", { F4: 12, F5: 3.5 }), "GUESS_NOT_INTEGER");
    expectRejected(placed, submit("P1", { F4: 12, F5: 99 }), "GUESS_OUT_OF_RANGE");
    expectRejected(placed, submit("P1", { F4: 12 }), "GUESS_KEYS_MISMATCH");
    expect(placed.pending?.guesses).toEqual({});
  });

  it("keeps guess values out of the public state and the reveal records (unique values 13..43)", () => {
    const guesses: Record<PlayerId, Record<string, number>> = {
      P0: { F4: 13, F5: 17 },
      P1: { F4: 23, F5: 29 },
      P2: { F4: 31, F5: 37 },
      P3: { F4: 41, F5: 43 },
    };
    const values = [13, 17, 23, 29, 31, 37, 41, 43];
    const containsNumber = (json: string, n: number): boolean => new RegExp(`(?<![\\w.-])${n}(?![\\w.])`).test(json);
    const placed = step(twoCodes(), PLACE_TWO_CODES);

    // Positive controls: while the batch is pending the sealed guesses and the log hold the values.
    const partial = step(placed, submit("P0", guesses.P0));
    expect(containsNumber(JSON.stringify(partial.pending), 13)).toBe(true);
    expect(containsNumber(JSON.stringify(partial.log), 13)).toBe(true);

    const revealed = submitAll(placed, SEATS, guesses);
    const publicJson = {
      lastReveal: JSON.stringify(revealed.lastReveal),
      history: JSON.stringify(revealed.history),
      stateWithoutLog: JSON.stringify(withoutLog(revealed)),
    };
    for (const [name, json] of Object.entries(publicJson)) {
      for (const value of values) expect(containsNumber(json, value), `${name} contains ${value}`).toBe(false);
    }
    expect(revealed.pending).toBeNull();
    // The internal log necessarily holds the submitted actions (saves are replay logs); views must never expose it.
    for (const value of values) expect(containsNumber(JSON.stringify(revealed.log), value)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

describe("rejections leave the state unchanged", () => {
  it("PLACE: phase, player, turn and hand checks in the design's order", () => {
    const state = plain();
    expectRejected(state, place("P1", "S-9", 3, 2), "NOT_YOUR_TURN");
    expectRejected(state, place("P9", "S-9", 3, 2), "UNKNOWN_PLAYER");
    expectRejected(state, place("P0", "H-2", 3, 2), "CARD_NOT_IN_HAND");
    expectRejected(state, place("P0", "not-a-card", 3, 2), "CARD_NOT_IN_HAND");
    // turn ownership before hand membership, hand membership before the board errors
    expectRejected(state, place("P1", "H-2", 3, 2), "NOT_YOUR_TURN");
    expectRejected(state, place("P0", "H-2", -1, 0, 90), "CARD_NOT_IN_HAND");
    // a card of another seat's hand is not in the acting seat's hand
    expectRejected(state, place("P0", state.hands.P1[0] as string, 3, 2), "CARD_NOT_IN_HAND");
  });

  it("PLACE: board errors with their precedence", () => {
    const state = plain();
    expectRejected(state, place("P0", "S-9", -1, 0, 90), "INVALID_ORIENTATION");
    expectRejected(state, place("P0", "S-9", 3, 2, 90), "INVALID_ORIENTATION");
    expectRejected(state, place("P0", "S-9", 3, 2, Number.NaN), "INVALID_ORIENTATION");
    expectRejected(state, place("P0", "S-9", -1, 0), "OUT_OF_BOUNDS");
    expectRejected(state, place("P0", "S-9", 8, 3), "OUT_OF_BOUNDS");
    expectRejected(state, place("P0", "S-9", 3.5, 3), "OUT_OF_BOUNDS");
    expectRejected(state, { type: "PLACE", player: "P0", card: "S-9", pos: null, orientation: 0 } as unknown as Action, "OUT_OF_BOUNDS");
    expectRejected(state, place("P0", "S-9", 3, 3), "OCCUPIED");
    expectRejected(state, place("P0", "S-9", 0, 0), "NOT_ADJACENT");
    expectRejected(state, place("P0", "S-9", 2, 2), "NOT_ADJACENT"); // diagonal neighbor only
  });

  it("WRONG_PHASE in every phase, for every action type", () => {
    const placement = plain();
    const collecting = step(oneCode(), PLACE_ONE_CODE);
    const revealing = submitAll(collecting, SEATS, ONE_CODE_GUESSES);
    expect(placement.phase).toBe("PLACEMENT");
    expect(collecting.phase).toBe("GUESS_COLLECT");
    expect(revealing.phase).toBe("REVEAL");

    expectRejected(placement, submit("P0", { F4: 10 }), "WRONG_PHASE");
    expectRejected(placement, ack, "WRONG_PHASE");
    expectRejected(collecting, PLACE_NO_CODE, "WRONG_PHASE");
    expectRejected(collecting, ack, "WRONG_PHASE");
    expectRejected(revealing, PLACE_NO_CODE, "WRONG_PHASE");
    expectRejected(revealing, submit("P0", { F4: 10 }), "WRONG_PHASE");
    // the phase check comes before the player checks
    expectRejected(collecting, place("P9", "S-9", 3, 2), "WRONG_PHASE");
    expectRejected(placement, { type: "SWAP" } as unknown as Action, "WRONG_PHASE");
    expectRejected(placement, null as unknown as Action, "WRONG_PHASE");
  });

  it("SUBMIT_GUESSES: unknown player, duplicate, value errors and key mismatch", () => {
    const state = step(oneCode(), PLACE_ONE_CODE);
    expectRejected(state, submit("P9", { F4: 10 }), "UNKNOWN_PLAYER");
    expectRejected(state, submit("P0", { F4: 3.5 }), "GUESS_NOT_INTEGER");
    expectRejected(state, submit("P0", { F4: "10" }), "GUESS_NOT_INTEGER");
    expectRejected(state, submit("P0", { F4: Number.NaN }), "GUESS_NOT_INTEGER");
    expectRejected(state, submit("P0", { F4: null }), "GUESS_NOT_INTEGER");
    expectRejected(state, submit("P0", { F4: 3 }), "GUESS_OUT_OF_RANGE");
    expectRejected(state, submit("P0", { F4: 53 }), "GUESS_OUT_OF_RANGE");
    expectRejected(state, submit("P0", {}), "GUESS_KEYS_MISMATCH");
    expectRejected(state, submit("P0", { G4: 10 }), "GUESS_KEYS_MISMATCH");
    expectRejected(state, submit("P0", { F4: 10, G4: 10 }), "GUESS_KEYS_MISMATCH");
    expectRejected(state, submit("P0", null as unknown as Record<string, unknown>), "GUESS_KEYS_MISMATCH");
    expectRejected(state, submit("P0", [10] as unknown as Record<string, unknown>), "GUESS_KEYS_MISMATCH");

    const afterFirst = step(state, submit("P0", { F4: 10 }));
    expectRejected(afterFirst, submit("P0", { F4: 11 }), "DUPLICATE_SUBMISSION");
    expectRejected(afterFirst, submit("P0", { F4: 3.5 }), "DUPLICATE_SUBMISSION");
    expect(afterFirst.pending?.guesses.P0).toEqual({ F4: 10 });
    // a rejected submission does not block the seat: it can still submit a valid one
    const afterRejection = reduce(state, submit("P1", { F4: 3 }));
    expect(afterRejection.ok).toBe(false);
    expect(step(state, submit("P1", { F4: 11 })).pending?.guesses.P1).toEqual({ F4: 11 });
  });

  it("GAME_ENDED comes before every other check", () => {
    const ended = step(plain({ hands: { P0: ["S-9"] } }), PLACE_NO_CODE);
    expect(ended.phase).toBe("ENDED");
    expectRejected(ended, PLACE_NO_CODE, "GAME_ENDED");
    expectRejected(ended, place("P9", "H-2", -1, 0, 90), "GAME_ENDED");
    expectRejected(ended, submit("P0", {}), "GAME_ENDED");
    expectRejected(ended, ack, "GAME_ENDED");
    expectRejected(ended, { type: "SWAP" } as unknown as Action, "GAME_ENDED");
  });

  it("covers every error code the reducer can return", () => {
    // INVALID_CARD_ID, SEED_EMPTY, INVALID_SCORE_CONFIG, INVALID_CONFIG and REPLAY_REJECTED come from parseCardId,
    // parseSeed, newGame and replay; the reducer never returns them.
    const reducerCodes: ErrorCode[] = [
      "INVALID_ORIENTATION", "OUT_OF_BOUNDS", "OCCUPIED", "NOT_ADJACENT", "CARD_NOT_IN_HAND", "NOT_YOUR_TURN",
      "WRONG_PHASE", "GAME_ENDED", "GUESS_NOT_INTEGER", "GUESS_OUT_OF_RANGE", "DUPLICATE_SUBMISSION",
      "GUESS_KEYS_MISMATCH", "UNKNOWN_PLAYER",
    ];
    expect([...seenCodes].sort()).toEqual([...reducerCodes].sort());
  });
});

// ---------------------------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------------------------

describe("purity", () => {
  it("is deterministic: the same state and action give deep-equal results", () => {
    const state = twoCodes({ firstPlacementDone: ["P0"] });
    const a = reduce(state, PLACE_TWO_CODES);
    const b = reduce(state, PLACE_TWO_CODES);
    expect(a.ok && b.ok).toBe(true);
    expect(a).toEqual(b);
  });

  it("never mutates a frozen input and returns deeply frozen states", () => {
    const state = oneCode();
    const before = structuredClone(state);
    const action = PLACE_ONE_CODE;
    const next = step(state, action);
    expect(state).toEqual(before);
    expect(Object.isFrozen(action)).toBe(false);
    expect(next.log[0]).not.toBe(action);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.board)).toBe(true);
    expect(Object.isFrozen(next.hands.P0)).toBe(true);
    expect(Object.isFrozen(next.deck)).toBe(true);
    expect(Object.isFrozen(next.log)).toBe(true);
    expect(Object.isFrozen(next.pending?.codes)).toBe(true);
    expect(() => (next.hands.P0 as CardId[]).push("H-2")).toThrow(TypeError);
    const submitted = step(next, submit("P0", { F4: 10 }));
    expect(Object.isFrozen(submitted.pending?.guesses.P0)).toBe(true);
    const revealed = submitAll(submitted, ["P1", "P2", "P3"], ONE_CODE_GUESSES);
    expect(Object.isFrozen(revealed.lastReveal?.perPlayer)).toBe(true);
    expect(Object.isFrozen(revealed.history)).toBe(true);
  });

  it("does not alias or freeze the guesses object of the caller", () => {
    const guesses = { F4: 10 };
    const next = step(step(oneCode(), PLACE_ONE_CODE), submit("P0", guesses));
    expect(Object.isFrozen(guesses)).toBe(false);
    expect(next.pending?.guesses.P0).not.toBe(guesses);
    guesses.F4 = 52;
    expect(next.pending?.guesses.P0).toEqual({ F4: 10 });
  });
});

// ---------------------------------------------------------------------------------------------
// Full-game smoke
// ---------------------------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  PLACEMENT: ["PLACEMENT", "GUESS_COLLECT", "ENDED"],
  GUESS_COLLECT: ["GUESS_COLLECT", "REVEAL", "ENDED"],
  REVEAL: ["PLACEMENT"],
  ENDED: [],
};

/** Deterministic legal-move picker: prefers a placement that completes a code, otherwise the first legal move. */
function chooseAction(state: GameState): Action {
  if (state.phase === "PLACEMENT") {
    const seat = state.turn;
    const hand = state.hands[seat];
    const cells = legalCells(state.board);
    const scored = new Set(state.scoredGroups);
    for (const card of hand) {
      for (const pos of cells) {
        for (const orientation of [0, 180] as Orientation[]) {
          const placed = placeOnBoard(state.board, pos, { card, orientation, owner: seat });
          if (placed.ok && detect(placed.value, pos, scored).length > 0) {
            return { type: "PLACE", player: seat, card, pos, orientation };
          }
        }
      }
    }
    return { type: "PLACE", player: seat, card: hand[0] as CardId, pos: cells[0] as (typeof cells)[number], orientation: 0 };
  }
  if (state.phase === "GUESS_COLLECT") {
    const seat = actingSeats(state)[0] as PlayerId;
    const guesses: Record<string, number> = {};
    (state.pending?.codes ?? []).forEach((code, i) => {
      guesses[code.quadKey] = 10 + 4 * SEATS.indexOf(seat) + i;
    });
    return { type: "SUBMIT_GUESSES", player: seat, guesses };
  }
  return ack;
}

describe("full-game smoke", () => {
  it("plays a complete game from newGame(seed 1) with every invariant intact", () => {
    const created = newGame({ seed: 1, config: TEST_CONFIG });
    if (!created.ok) throw new Error("newGame failed");
    let state = created.value;
    const startSnapshot = state;
    let bonuses = 0;
    let steps = 0;
    const STEP_CAP = 1000;

    while (state.phase !== "ENDED" && steps < STEP_CAP) {
      const action = chooseAction(state);
      const previous = state;
      const result = reduce(state, action);
      if (!result.ok) throw new Error(`step ${steps}: ${action.type} rejected with ${result.error.code}`);
      state = result.value;
      steps++;

      expect(ALLOWED_TRANSITIONS[previous.phase]).toContain(state.phase);
      expect(conservationProblem(state)).toBeNull();
      expect(state.board.filter((c) => c !== null).length).toBe(state.placements + 4);
      expect(state.log.length).toBe(steps);
      expect(state.log[steps - 1]?.type).toBe(action.type);
      expect(new Set(state.scoredGroups).size).toBe(state.scoredGroups.length);
      expect([...state.scoredGroups]).toEqual([...state.scoredGroups].sort());
      expect(state.phase === "GUESS_COLLECT").toBe(state.pending !== null);
      expect(state.scoredGroups.length).toBe(
        state.history.reduce((n, r) => n + r.codes.length, 0) + (state.pending?.codes.length ?? 0),
      );
      if (previous.bonusAwarded === null && state.bonusAwarded !== null) bonuses++;
      if (previous.phase === "PLACEMENT" && state.phase === "PLACEMENT") expect(state.turn).toBe(nextSeat(previous.turn));
    }

    expect(state.phase).toBe("ENDED");
    expect(steps).toBeLessThan(STEP_CAP);
    expect(state.placements).toBeLessThanOrEqual(48);
    expect(state.history.length).toBeGreaterThan(0);
    expect(bonuses).toBe(1);
    expect(state.bonusAwarded).not.toBeNull();
    expect(state.hands[state.bonusAwarded as PlayerId]).toEqual([]);
    expect(actingSeats(state)).toEqual([]);

    // Final score = sum of earned prediction scores, plus the bonus for the seat that emptied its hand.
    for (const seat of SEATS) {
      const earned = state.history.reduce((n, r) => n + (r.perPlayer.find((p) => p.player === seat)?.earned ?? 0), 0);
      expect(state.scores[seat]).toBe(earned + (seat === state.bonusAwarded ? TEST_BONUS : 0));
    }
    expectRejected(state, ack, "GAME_ENDED");

    // Replaying the log from the same new game gives the same state.
    const replayed = state.log.reduce<GameState>((s, action) => step(s, action), startSnapshot);
    expect(replayed).toEqual(state);
  });
});
