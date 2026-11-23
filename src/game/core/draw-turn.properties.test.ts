// Supplementary property tests for draw and turn primitives (task 7.1).
// The draw verdict depends only on new code count; reducer-level behaviour is Property 12.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyDraw, shouldDraw } from "./draw";
import { dealGame } from "./deck";
import { arbSeed } from "./testing/card-generators";
import { nextSeat } from "./turn";
import type { CardId, PlayerId } from "./types";

const NUM_RUNS = 200;
const SEED_SHOULD_DRAW = 20260701;
const SEED_APPLY_DRAW = 20260702;
const SEED_NEXT_SEAT = 20260703;
const SEATS: readonly PlayerId[] = ["P0", "P1", "P2", "P3"];
const arbSeat: fc.Arbitrary<PlayerId> = fc.constantFrom(...SEATS);
const arbCodes = fc.integer({ min: 0, max: 4 });
const sorted = (cards: readonly CardId[]): CardId[] => [...cards].sort();

const arbDeckAndHand = fc
  .record({ seed: arbSeed, deckLen: fc.integer({ min: 0, max: 36 }), handLen: fc.integer({ min: 0, max: 3 }) })
  .map(({ seed, deckLen, handLen }) => {
    const deal = dealGame(seed);
    return { deck: deal.deck.slice(0, deckLen), hand: deal.hands.P0.slice(0, handLen) };
  });

describe("supplementary: draw/turn primitives", () => {
  it("shouldDraw equals the independent oracle newCodes === 0", () => {
    fc.assert(
      fc.property(arbCodes, (newCodes) => { expect(shouldDraw(newCodes)).toBe(newCodes === 0); }),
      { seed: SEED_SHOULD_DRAW, numRuns: NUM_RUNS },
    );
  });

  it("applyDraw conserves cards and moves at most one card from the top", () => {
    fc.assert(
      fc.property(arbDeckAndHand, fc.boolean(), ({ deck, hand }, draw) => {
        const deckBefore = [...deck];
        const handBefore = [...hand];
        const r = applyDraw(deck, hand, draw);
        expect(deck).toEqual(deckBefore);
        expect(hand).toEqual(handBefore);
        expect(sorted([...r.hand, ...r.deck])).toEqual(sorted([...handBefore, ...deckBefore]));
        expect(new Set([...r.hand, ...r.deck]).size).toBe(handBefore.length + deckBefore.length);
        const moved = draw && deckBefore.length > 0;
        if (moved) {
          const top = deckBefore[deckBefore.length - 1] as CardId;
          expect(r.drawn).toBe(top);
          expect(r.hand).toEqual([...handBefore, top]);
          expect(r.deck).toEqual(deckBefore.slice(0, -1));
        } else {
          expect(r.drawn).toBeNull();
          expect(r.hand).toEqual(handBefore);
          expect(r.deck).toEqual(deckBefore);
        }
        expect(r.hand.length - handBefore.length).toBe(moved ? 1 : 0);
        expect(deckBefore.length - r.deck.length).toBe(moved ? 1 : 0);
        expect(Object.isFrozen(r.hand)).toBe(true);
        expect(Object.isFrozen(r.deck)).toBe(true);
      }),
      { seed: SEED_APPLY_DRAW, numRuns: NUM_RUNS },
    );
  });

  it("every no-code placement draws while the deck lasts", () => {
    fc.assert(
      fc.property(arbDeckAndHand, arbCodes, ({ deck, hand }, newCodes) => {
        const r = applyDraw(deck, hand, shouldDraw(newCodes));
        const oracle = newCodes === 0 && deck.length > 0;
        expect(r.hand.length - hand.length).toBe(oracle ? 1 : 0);
      }),
      { seed: SEED_APPLY_DRAW + 1, numRuns: NUM_RUNS },
    );
  });

  it("nextSeat cycles all four seats", () => {
    fc.assert(
      fc.property(arbSeat, fc.integer({ min: 0, max: 40 }), (start, steps) => {
        expect(nextSeat(start)).not.toBe(start);
        expect(nextSeat(nextSeat(nextSeat(nextSeat(start))))).toBe(start);
        const orbit: PlayerId[] = [];
        let seat = start;
        for (let i = 0; i < 4; i++) { orbit.push(seat); seat = nextSeat(seat); }
        expect(new Set(orbit).size).toBe(4);
        expect([...orbit].sort()).toEqual(["P0", "P1", "P2", "P3"]);
        let walked = start;
        for (let i = 0; i < steps; i++) walked = nextSeat(walked);
        expect(walked).toBe(SEATS[(SEATS.indexOf(start) + steps) % 4]);
      }),
      { seed: SEED_NEXT_SEAT, numRuns: NUM_RUNS },
    );
  });
});
