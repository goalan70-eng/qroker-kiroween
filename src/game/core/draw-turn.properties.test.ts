// Supplementary property tests for the draw and turn primitives (task 7.1): shouldDraw, markFirstPlacement,
// applyDraw and nextSeat. Requirements 6.1, 6.3, 6.4, 6.5, 6.6.
//
// These are NOT the design's Property 12 (draw rule at reducer level), which is tested in task 8.3 against the
// reducer. Each property is ONE test with ONE fc.assert, a fixed seed and at least 200 runs.
// Oracles are written here independently of the modules under test.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyDraw, markFirstPlacement, shouldDraw } from "./draw";
import { dealGame } from "./deck";
import { arbSeed } from "./testing/card-generators";
import { nextSeat } from "./turn";
import type { CardId, PlayerId } from "./types";

const NUM_RUNS = 200;
const SEED_SHOULD_DRAW = 20260701;
const SEED_APPLY_DRAW = 20260702;
const SEED_NEXT_SEAT = 20260703;
const SEED_MARK = 20260704;

const SEATS: readonly PlayerId[] = ["P0", "P1", "P2", "P3"];
const arbSeat: fc.Arbitrary<PlayerId> = fc.constantFrom(...SEATS);
/** Any subset of the seats, in any order (the list may also repeat seats). */
const arbDone: fc.Arbitrary<PlayerId[]> = fc.array(arbSeat, { maxLength: 6 });
/** Codes formed by one placement: a 2x2 grid around one cell holds at most 4 regions. */
const arbCodes = fc.integer({ min: 0, max: 4 });

const sorted = (cards: readonly CardId[]): CardId[] => [...cards].sort();

/** A dealt deck cut to a random length 0..32 and a hand of random size 0..4, disjoint by construction. */
const arbDeckAndHand = fc
  .record({ seed: arbSeed, deckLen: fc.integer({ min: 0, max: 32 }), handLen: fc.integer({ min: 0, max: 4 }) })
  .map(({ seed, deckLen, handLen }) => {
    const deal = dealGame(seed);
    return { deck: deal.deck.slice(0, deckLen), hand: deal.hands.P0.slice(0, handLen) };
  });

describe("supplementary: draw/turn primitives", () => {
  it("shouldDraw equals the oracle `done.has(p) && n === 0`, and is false at the first placement or with any code", () => {
    // Feature: qroker-playable-game, supplementary: draw/turn primitives (shouldDraw)
    // Validates: Requirements 6.3, 6.4, 6.5
    fc.assert(
      fc.property(arbSeat, arbDone, arbCodes, (player, done, n) => {
        const before = [...done];
        const expected = new Set(done).has(player) && n === 0;
        expect(shouldDraw(player, done, n)).toBe(expected);
        // the list is not changed
        expect(done).toEqual(before);
        // first placement is exempt whatever the codes are
        if (!done.includes(player)) expect(shouldDraw(player, done, n)).toBe(false);
        // any new code cancels the draw whatever the history is
        if (n >= 1) expect(shouldDraw(player, done, n)).toBe(false);
      }),
      { seed: SEED_SHOULD_DRAW, numRuns: NUM_RUNS },
    );
  });

  it("shouldDraw for one seat does not depend on whether the other seats are in the list", () => {
    // Feature: qroker-playable-game, supplementary: draw/turn primitives (per-seat independence)
    fc.assert(
      fc.property(arbSeat, arbDone, arbCodes, (player, done, n) => {
        const withoutOthers = done.filter((s) => s === player);
        const withAllOthers = [...done, ...SEATS.filter((s) => s !== player)];
        expect(shouldDraw(player, withoutOthers, n)).toBe(shouldDraw(player, withAllOthers, n));
      }),
      { seed: SEED_SHOULD_DRAW + 1, numRuns: NUM_RUNS },
    );
  });

  it("markFirstPlacement adds exactly the seat, keeps seat order, never duplicates, and makes shouldDraw(player, ., 0) true", () => {
    // Feature: qroker-playable-game, supplementary: draw/turn primitives (markFirstPlacement)
    fc.assert(
      fc.property(arbSeat, arbDone, (player, done) => {
        const before = [...done];
        const out = markFirstPlacement(done, player);
        expect(done).toEqual(before);
        expect(new Set(out)).toEqual(new Set([...done, player]));
        expect(out).toHaveLength(new Set(out).size);
        expect([...out]).toEqual(SEATS.filter((s) => out.includes(s)));
        expect(shouldDraw(player, out, 0)).toBe(true);
        // idempotent
        expect(markFirstPlacement(out, player)).toEqual(out);
      }),
      { seed: SEED_MARK, numRuns: NUM_RUNS },
    );
  });

  it("applyDraw conserves cards, moves at most one card from the top, and moves none when draw is false or the deck is empty", () => {
    // Feature: qroker-playable-game, supplementary: draw/turn primitives (applyDraw)
    // Validates: Requirements 6.3, 6.6
    fc.assert(
      fc.property(arbDeckAndHand, fc.boolean(), ({ deck, hand }, draw) => {
        const deckBefore = [...deck];
        const handBefore = [...hand];
        const r = applyDraw(deck, hand, draw);

        // inputs unchanged
        expect(deck).toEqual(deckBefore);
        expect(hand).toEqual(handBefore);

        // multiset conservation, checked independently of the module under test
        expect(sorted([...r.hand, ...r.deck])).toEqual(sorted([...handBefore, ...deckBefore]));
        expect(new Set([...r.hand, ...r.deck]).size).toBe(handBefore.length + deckBefore.length);

        const moved = draw && deckBefore.length > 0;
        if (moved) {
          const top = deckBefore[deckBefore.length - 1] as CardId;
          expect(r.drawn).toBe(top);
          expect(r.hand).toEqual([...handBefore, top]);
          expect(r.deck).toEqual(deckBefore.slice(0, -1));
        } else {
          // no draw requested, or deck exhausted: nothing moves and nothing is made up
          expect(r.drawn).toBeNull();
          expect(r.hand).toEqual(handBefore);
          expect(r.deck).toEqual(deckBefore);
        }

        // at most one card per call
        expect(r.hand.length - handBefore.length).toBe(moved ? 1 : 0);
        expect(deckBefore.length - r.deck.length).toBe(moved ? 1 : 0);
        // results are frozen
        expect(Object.isFrozen(r.hand)).toBe(true);
        expect(Object.isFrozen(r.deck)).toBe(true);
      }),
      { seed: SEED_APPLY_DRAW, numRuns: NUM_RUNS },
    );
  });

  it("shouldDraw feeding applyDraw: only a seat past its first placement with no new code gains a card (while the deck lasts)", () => {
    // Feature: qroker-playable-game, supplementary: draw/turn primitives (shouldDraw + applyDraw)
    // Validates: Requirements 6.3, 6.4, 6.5, 6.6
    fc.assert(
      fc.property(arbDeckAndHand, arbSeat, arbDone, arbCodes, ({ deck, hand }, player, done, n) => {
        const r = applyDraw(deck, hand, shouldDraw(player, done, n));
        const oracle = new Set(done).has(player) && n === 0 && deck.length > 0;
        expect(r.hand.length - hand.length).toBe(oracle ? 1 : 0);
      }),
      { seed: SEED_APPLY_DRAW + 1, numRuns: NUM_RUNS },
    );
  });

  it("nextSeat: never the same seat, four steps are the identity, and the orbit of any seat covers all four seats once", () => {
    // Feature: qroker-playable-game, supplementary: draw/turn primitives (nextSeat)
    // Validates: Requirement 6.1
    fc.assert(
      fc.property(arbSeat, fc.integer({ min: 0, max: 40 }), (start, steps) => {
        expect(nextSeat(start)).not.toBe(start);
        expect(nextSeat(nextSeat(nextSeat(nextSeat(start))))).toBe(start);

        const orbit: PlayerId[] = [];
        let seat = start;
        for (let i = 0; i < 4; i++) {
          orbit.push(seat);
          seat = nextSeat(seat);
        }
        expect(new Set(orbit).size).toBe(4);
        expect([...orbit].sort()).toEqual(["P0", "P1", "P2", "P3"]);

        // independent oracle: successor is index + 1 modulo 4, so `steps` steps advance by steps mod 4
        let walked = start;
        for (let i = 0; i < steps; i++) walked = nextSeat(walked);
        expect(walked).toBe(SEATS[(SEATS.indexOf(start) + steps) % 4]);
      }),
      { seed: SEED_NEXT_SEAT, numRuns: NUM_RUNS },
    );
  });
});
