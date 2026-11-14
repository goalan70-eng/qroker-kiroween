// Unit tests for the draw rule (task 7.1). Requirements 6.3, 6.4, 6.5, 6.6; qroker-game 3.5, 3.6, 3.8.
// The reducer-level draw property (Property 12) is tested in task 8.3, not here.
import { describe, expect, it } from "vitest";
import { ALL_CARDS } from "./cards";
import { applyDraw, markFirstPlacement, shouldDraw } from "./draw";
import { dealGame } from "./deck";
import type { CardId, PlayerId } from "./types";

const SEATS: readonly PlayerId[] = ["P0", "P1", "P2", "P3"];

const deepFreeze = <T>(a: T[]): readonly T[] => Object.freeze(a);
const sorted = (cards: readonly CardId[]): CardId[] => [...cards].sort();

describe("shouldDraw: full truth table (first placement x new codes)", () => {
  // first placement: the seat is NOT yet in firstPlacementDone (requirement 6.4)
  it("first placement, 0 new codes: no draw", () => expect(shouldDraw("P0", [], 0)).toBe(false));
  it("first placement, 1 new code: no draw", () => expect(shouldDraw("P0", [], 1)).toBe(false));
  it("first placement, 2 new codes: no draw", () => expect(shouldDraw("P0", [], 2)).toBe(false));
  // later placement: the seat is in firstPlacementDone (requirements 6.3 and 6.5)
  it("later placement, 0 new codes: draw", () => expect(shouldDraw("P0", ["P0"], 0)).toBe(true));
  it("later placement, 1 new code: no draw", () => expect(shouldDraw("P0", ["P0"], 1)).toBe(false));
  it("later placement, 2 new codes: no draw", () => expect(shouldDraw("P0", ["P0"], 2)).toBe(false));

  it("more than 2 codes (a placement can form up to 4) never draws", () => {
    expect(shouldDraw("P2", ["P2"], 3)).toBe(false);
    expect(shouldDraw("P2", ["P2"], 4)).toBe(false);
    expect(shouldDraw("P2", [], 4)).toBe(false);
  });

  it("is a boolean, so a placement draws at most one card", () => {
    for (const n of [0, 1, 2]) {
      expect(typeof shouldDraw("P1", ["P1"], n)).toBe("boolean");
    }
  });
});

describe("shouldDraw: first placement is tracked per seat", () => {
  it("P0 done, P1 not: P1 does not draw at 0 codes while P0 does", () => {
    expect(shouldDraw("P1", ["P0"], 0)).toBe(false);
    expect(shouldDraw("P0", ["P0"], 0)).toBe(true);
  });

  it("each of the four seats: draws at 0 codes only once it is in the list", () => {
    for (const seat of SEATS) {
      const others = SEATS.filter((s) => s !== seat);
      expect(shouldDraw(seat, others, 0), `${seat} not done`).toBe(false);
      expect(shouldDraw(seat, [seat], 0), `${seat} done`).toBe(true);
      expect(shouldDraw(seat, SEATS, 0), `${seat} all done`).toBe(true);
      expect(shouldDraw(seat, SEATS, 1), `${seat} all done, 1 code`).toBe(false);
    }
  });

  it("does not depend on the order or repetition of the list", () => {
    expect(shouldDraw("P2", ["P3", "P2", "P0"], 0)).toBe(true);
    expect(shouldDraw("P2", ["P2", "P2"], 0)).toBe(true);
  });
});

describe("shouldDraw: purity and invalid input", () => {
  it("does not mutate the list and is deterministic", () => {
    const done = deepFreeze<PlayerId>(["P1", "P3"]);
    expect(shouldDraw("P3", done, 0)).toBe(true);
    expect(shouldDraw("P3", done, 0)).toBe(true);
    expect(done).toEqual(["P1", "P3"]);
  });

  it("throws RangeError for a newCodes that is not a non-negative integer (documented deviation: the design would answer true)", () => {
    for (const bad of [-1, -0.5, 0.5, 1.5, NaN, Infinity, -Infinity]) {
      expect(() => shouldDraw("P0", ["P0"], bad), String(bad)).toThrow(RangeError);
    }
    expect(() => shouldDraw("P0", ["P0"], "0" as unknown as number)).toThrow(RangeError);
    expect(() => shouldDraw("P0", ["P0"], undefined as unknown as number)).toThrow(RangeError);
  });

  it("accepts -0 as zero codes", () => {
    expect(shouldDraw("P0", ["P0"], -0)).toBe(true);
  });

  it("throws RangeError for a player that is not a seat id", () => {
    for (const bad of ["P4", "", null, undefined, 0]) {
      expect(() => shouldDraw(bad as unknown as PlayerId, ["P0"], 0), String(bad)).toThrow(RangeError);
    }
  });
});

describe("markFirstPlacement", () => {
  it("adds the seat to an empty list", () => {
    expect(markFirstPlacement([], "P0")).toEqual(["P0"]);
  });

  it("returns a new list in seat order without duplicates", () => {
    expect(markFirstPlacement(["P0", "P1"], "P2")).toEqual(["P0", "P1", "P2"]);
    expect(markFirstPlacement(["P0", "P1"], "P1")).toEqual(["P0", "P1"]);
    expect(markFirstPlacement(["P3", "P0"], "P1")).toEqual(["P0", "P1", "P3"]);
  });

  it("does not mutate its input and returns a frozen new array", () => {
    const input = deepFreeze<PlayerId>(["P0"]);
    const out = markFirstPlacement(input, "P1");
    expect(out).not.toBe(input);
    expect(input).toEqual(["P0"]);
    expect(Object.isFrozen(out)).toBe(true);
  });

  it("feeds shouldDraw: the seat draws at its second placement but not at its first", () => {
    let done: readonly PlayerId[] = [];
    expect(shouldDraw("P0", done, 0)).toBe(false);
    done = markFirstPlacement(done, "P0");
    expect(shouldDraw("P0", done, 0)).toBe(true);
    expect(shouldDraw("P1", done, 0)).toBe(false);
  });

  it("throws RangeError for a player that is not a seat id", () => {
    expect(() => markFirstPlacement([], "P4" as unknown as PlayerId)).toThrow(RangeError);
  });
});

describe("applyDraw", () => {
  const deck = deepFreeze<CardId>(["H-A", "D-2", "C-3", "S-4"]); // top = last = "S-4"
  const hand = deepFreeze<CardId>(["H-7", "S-10"]);

  it("draw true, non-empty deck: the TOP (last) card goes to the END of the hand", () => {
    const r = applyDraw(deck, hand, true);
    expect(r.drawn).toBe("S-4");
    expect(r.hand).toEqual(["H-7", "S-10", "S-4"]);
    expect(r.deck).toEqual(["H-A", "D-2", "C-3"]);
  });

  it("draws exactly one card: the hand grows by one and the deck shrinks by one", () => {
    const r = applyDraw(deck, hand, true);
    expect(r.hand).toHaveLength(hand.length + 1);
    expect(r.deck).toHaveLength(deck.length - 1);
  });

  it("conserves cards: hand + deck of the result equal hand + deck of the input as multisets", () => {
    const r = applyDraw(deck, hand, true);
    expect(sorted([...r.hand, ...r.deck])).toEqual(sorted([...hand, ...deck]));
    expect(new Set([...r.hand, ...r.deck]).size).toBe(hand.length + deck.length);
  });

  it("draw false: nothing moves", () => {
    const r = applyDraw(deck, hand, false);
    expect(r.drawn).toBeNull();
    expect(r.hand).toEqual(hand);
    expect(r.deck).toEqual(deck);
  });

  it("empty deck, draw true: the draw is skipped and no card is made up (requirement 6.6)", () => {
    const r = applyDraw([], hand, true);
    expect(r.drawn).toBeNull();
    expect(r.hand).toEqual(["H-7", "S-10"]);
    expect(r.deck).toEqual([]);
  });

  it("works with an empty hand", () => {
    const r = applyDraw(deck, [], true);
    expect(r.hand).toEqual(["S-4"]);
  });

  it("does not mutate frozen inputs and returns new frozen arrays", () => {
    const r = applyDraw(deck, hand, true);
    expect(deck).toEqual(["H-A", "D-2", "C-3", "S-4"]);
    expect(hand).toEqual(["H-7", "S-10"]);
    expect(r.hand).not.toBe(hand);
    expect(r.deck).not.toBe(deck);
    expect(Object.isFrozen(r.hand)).toBe(true);
    expect(Object.isFrozen(r.deck)).toBe(true);
    expect(Object.isFrozen(r)).toBe(true);
    // also new arrays when nothing moves
    const same = applyDraw(deck, hand, false);
    expect(same.hand).not.toBe(hand);
    expect(same.deck).not.toBe(deck);
    const skipped = applyDraw([], hand, true);
    expect(skipped.hand).not.toBe(hand);
  });

  it("is deterministic", () => {
    expect(applyDraw(deck, hand, true)).toEqual(applyDraw(deck, hand, true));
  });

  it("exhausting a dealt 32-card deck: 32 draws move every card once, the 33rd is skipped", () => {
    const deal = dealGame(12345);
    let curDeck: readonly CardId[] = deal.deck;
    let curHand: readonly CardId[] = deal.hands.P0;
    const drawn: CardId[] = [];
    for (let i = 0; i < 32; i++) {
      const r = applyDraw(curDeck, curHand, true);
      expect(r.drawn).not.toBeNull();
      drawn.push(r.drawn as CardId);
      expect(r.hand).toHaveLength(4 + i + 1);
      expect(r.deck).toHaveLength(31 - i);
      curDeck = r.deck;
      curHand = r.hand;
    }
    expect(drawn).toEqual([...deal.deck].reverse());
    expect(sorted([...curHand, ...curDeck])).toEqual(sorted([...deal.hands.P0, ...deal.deck]));
    expect(curDeck).toEqual([]);

    const extra = applyDraw(curDeck, curHand, true);
    expect(extra.drawn).toBeNull();
    expect(extra.hand).toEqual(curHand);
    expect(extra.deck).toEqual([]);
    expect(new Set(extra.hand).size).toBe(36);
  });

  it("never fabricates a card: the drawn card always comes from the input deck", () => {
    const r = applyDraw(deck, hand, true);
    expect(deck).toContain(r.drawn);
    expect(ALL_CARDS).toContain(r.drawn);
  });
});
