// Property tests for the deck (task 3.2): Property 4 of .kiro/specs/qroker-playable-game/design.md.
// Requirements 2.2, 2.3, 2.4, 5.7.
//
// Property 4 in the design is stated for `newGame`, which does not exist yet (task 8.1). This file tests the
// part that `core/deck.ts` owns: the deterministic deal and the partition of the 52 cards. The placement of
// the neutral cards on D4, E4, D5, E5 and the full-state equality belong to the reducer tests (task 8.3).
// Not decided here: whether the starting 2x2 group is scored (OQ-3, provisional: it is not) and visibility.
//
// Each property is ONE test with ONE fc.assert, fixed seed and at least 200 runs, so a run is reproducible.
// fast-check prints "seed", the shrunk counterexample and the replay path on failure. The expected sizes and
// the expected card set are written out here and are not taken from the constants of the module under test.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { dealGame, drawTop, tryDealGame } from "./deck";
import { arbSeed } from "./testing/card-generators";
import type { CardId, PlayerId } from "./types";

const NUM_RUNS = 200;
const SEED_P4 = 20260104;
const SEED_DRAW = 20260204;

const SEATS: readonly PlayerId[] = ["P0", "P1", "P2", "P3"];

/** The 52 cards, generated here by an independent rule (suit letter + rank label). */
const EXPECTED_CARDS: readonly string[] = ["H", "D", "C", "S"].flatMap((s) =>
  ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].map((r) => `${s}-${r}`),
);
const EXPECTED_SORTED: readonly string[] = [...EXPECTED_CARDS].sort();

const allCardsOf = (d: ReturnType<typeof dealGame>): CardId[] => [
  ...d.neutral,
  ...SEATS.flatMap((s) => d.hands[s]),
  ...d.deck,
];

describe("Property 4: Deterministic deal partition", () => {
  it("deals the same partition of the 52-card catalog (4 neutral, 4 hands of 4, 32 deck) on every call", () => {
    // Feature: qroker-playable-game, Property 4: Deterministic deal partition
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const deal = dealGame(seed);

        // Same Seed gives deeply equal deals (requirement 2.4), also through the validating entry point.
        expect(dealGame(seed)).toEqual(deal);
        const checked = tryDealGame(seed);
        expect(checked.ok).toBe(true);
        if (checked.ok) expect(checked.value).toEqual(deal);

        // Sizes 4 + 4x4 + 32 (requirement 2.2).
        expect(deal.neutral).toHaveLength(4);
        expect(Object.keys(deal.hands).sort()).toEqual(["P0", "P1", "P2", "P3"]);
        for (const s of SEATS) expect(deal.hands[s]).toHaveLength(4);
        expect(deal.deck).toHaveLength(32);

        // The 20 dealt cards (neutral plus hands) are pairwise distinct (requirement 2.3).
        const dealt = [...deal.neutral, ...SEATS.flatMap((s) => deal.hands[s])];
        expect(dealt).toHaveLength(20);
        expect(new Set(dealt).size).toBe(20);

        // Neutral, hands and deck together are the catalog exactly: 52 cards, all distinct, same set.
        const all = allCardsOf(deal);
        expect(all).toHaveLength(52);
        expect(new Set(all).size).toBe(52);
        expect([...all].sort()).toEqual(EXPECTED_SORTED);
      }),
      { seed: SEED_P4, numRuns: NUM_RUNS },
    );
  });
});

// Supplementary checks of the deck module (task 3.2). They are not numbered design properties: the draw rule
// of the reducer is Property 12 and is tested in task 8.3. They check `drawTop` on dealt decks.
describe("drawTop on dealt decks (supplementary to Property 4)", () => {
  it("conserves the cards of the deck across 32 draws and keeps the input deck unchanged", () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const input = dealGame(seed).deck;
        const clone = [...input];

        let deck: readonly CardId[] = input;
        const drawn: CardId[] = [];
        for (let i = 0; i < 32; i++) {
          const r = drawTop(deck);
          expect(r.card).not.toBeNull();
          drawn.push(r.card as CardId);
          // drawn + remaining is the original deck, with no card lost or duplicated.
          expect(r.deck).toHaveLength(31 - i);
          expect([...drawn, ...r.deck].sort()).toEqual([...clone].sort());
          expect(new Set([...drawn, ...r.deck]).size).toBe(32);
          // The remaining deck is the original without its last i + 1 cards.
          expect(r.deck).toEqual(clone.slice(0, 31 - i));
          deck = r.deck;
        }

        // The cards come out in the reverse of the stored order, and the input deck was never changed.
        expect(drawn).toEqual([...clone].reverse());
        expect(input).toEqual(clone);

        // Exhausted: extra draws return null and the same (empty) deck.
        for (let extra = 0; extra < 3; extra++) {
          const r = drawTop(deck);
          expect(r.card).toBeNull();
          expect(r.deck).toBe(deck);
          expect(r.deck).toHaveLength(0);
        }
      }),
      { seed: SEED_DRAW, numRuns: NUM_RUNS },
    );
  });
});

describe("different seeds (statistical, deterministic)", () => {
  it("at least 99% of the 255 adjacent-seed pairs among seeds 0..255 give different decks", () => {
    // Statistic: for the fixed seeds 0..255 (256 distinct seeds) compare the deck of seed i with the deck of
    // seed i + 1, which is 255 pairs. The loop is deterministic, so the result is the same on every run.
    // The test requires at least 99% of the pairs to differ (ceil(0.99 * 255) = 253). It does NOT claim that
    // different seeds always give different decks: that cannot hold for 2^32 seeds and 52! orders in general.
    const pairs = 255;
    let different = 0;
    let previous = dealGame(0).deck;
    for (let seed = 1; seed <= pairs; seed++) {
      const current = dealGame(seed).deck;
      if (current.join(",") !== previous.join(",")) different++;
      previous = current;
    }
    expect(different).toBeGreaterThanOrEqual(Math.ceil(0.99 * pairs));
  });
});
