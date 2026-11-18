// Unit tests for the draw rule (task 7.1). Requirements 6.3, 6.4, 6.5, 6.6.
// The reducer-level draw property (Property 12) is tested in task 8.3.
import { describe, expect, it } from "vitest";
import { ALL_CARDS } from "./cards";
import { applyDraw, shouldDraw } from "./draw";
import { dealGame } from "./deck";
import type { CardId } from "./types";

const deepFreeze = <T>(a: T[]): readonly T[] => Object.freeze(a);
const sorted = (cards: readonly CardId[]): CardId[] => [...cards].sort();

describe("shouldDraw: every placement follows the same code-count rule", () => {
  it.each([0, -0])("zero newly completed codes requires a draw (%s)", (newCodes) => {
    expect(shouldDraw(newCodes)).toBe(true);
  });

  it.each([1, 2, 3, 4])("%i newly completed code(s) cancel the draw", (newCodes) => {
    expect(shouldDraw(newCodes)).toBe(false);
  });

  it("has no player, turn-count or first-placement exception", () => {
    // The rule receives only the number of codes: a first placement and a later placement
    // with zero codes have the same draw verdict.
    expect(shouldDraw(0)).toBe(true);
    expect(shouldDraw(0)).toBe(true);
    expect(shouldDraw(1)).toBe(false);
  });

  it("is deterministic and does not mutate anything", () => {
    expect(shouldDraw(0)).toBe(true);
    expect(shouldDraw(0)).toBe(true);
    expect(shouldDraw(2)).toBe(false);
  });

  it("throws RangeError for a code count that is not a non-negative integer", () => {
    for (const bad of [-1, -0.5, 0.5, 1.5, NaN, Infinity, -Infinity]) {
      expect(() => shouldDraw(bad), String(bad)).toThrow(RangeError);
    }
    expect(() => shouldDraw("0" as unknown as number)).toThrow(RangeError);
    expect(() => shouldDraw(undefined as unknown as number)).toThrow(RangeError);
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

  it("empty deck, draw true: the draw is skipped and no card is made up", () => {
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
