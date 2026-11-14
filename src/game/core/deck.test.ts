// Unit tests for core/deck.ts (task 3.2). Requirements 2.2, 2.3, 2.8, 6.6.
//
// 1. Golden deals. The deals of seed 1 and seed 20260601 were recorded by running `dealGame` once and are
//    frozen below as explicit arrays (not Vitest snapshots). A change to the shuffle order, the shuffle
//    algorithm, the PRNG or the deal order changes these values and fails the golden tests.
// 2. Independent reference. To avoid a circular check, the same deals are re-derived here with code that
//    shares nothing with the engine: its own mulberry32 (Math.imul), its own Fisher-Yates and a literal
//    list of the 52 cards. The golden arrays must equal the reference output.
// 3. Mutation-style sanity check. The reference dealer takes "wrong" variants (forward shuffle, deal from
//    the end, reversed deck, different slicing). Each wrong variant must differ from the golden deal, which
//    shows that the golden test is sensitive to the shuffle order and the deal order.
//
// Not decided here: whether the starting 2x2 neutral group is scored (OQ-3, provisional: it is not) and
// which cards are visible to whom (the visibility decisions). This file only tests the partition of cards.

import { describe, expect, it } from "vitest";
import { dealGame, drawTop, isValidSeed, tryDealGame } from "./deck";
import type { CardId, PlayerId } from "./types";

const SEATS: readonly PlayerId[] = ["P0", "P1", "P2", "P3"];

// ---------------------------------------------------------------------------------------------
// Golden values (recorded from the first run of dealGame, then frozen)
// ---------------------------------------------------------------------------------------------

interface Golden {
  readonly neutral: readonly string[];
  readonly hands: Readonly<Record<PlayerId, readonly string[]>>;
  readonly deck: readonly string[];
}

const GOLDEN_SEED_1: Golden = {
  neutral: ["D-Q", "S-6", "D-J", "H-J"],
  hands: {
    P0: ["S-5", "C-6", "S-Q", "S-3"],
    P1: ["H-7", "C-4", "C-10", "D-10"],
    P2: ["S-2", "C-9", "H-Q", "H-4"],
    P3: ["S-J", "C-8", "H-9", "D-2"],
  },
  deck: [
    "H-5", "C-2", "S-7", "C-K", "C-5", "H-8", "D-9", "D-4", "H-K", "H-2", "C-J", "C-Q", "D-K", "S-9", "H-3", "D-5",
    "S-A", "H-10", "D-3", "H-6", "D-8", "D-7", "S-4", "D-6", "S-K", "C-3", "D-A", "S-8", "S-10", "C-A", "H-A", "C-7",
  ],
};

const GOLDEN_SEED_20260601: Golden = {
  neutral: ["H-6", "D-A", "C-8", "C-6"],
  hands: {
    P0: ["S-5", "C-9", "C-3", "D-8"],
    P1: ["H-Q", "C-7", "H-5", "H-4"],
    P2: ["S-10", "C-J", "D-4", "D-6"],
    P3: ["S-8", "C-5", "H-3", "D-7"],
  },
  deck: [
    "D-Q", "S-4", "H-A", "H-10", "C-4", "H-9", "D-10", "C-2", "D-5", "S-9", "H-8", "S-J", "C-A", "S-3", "H-K", "S-6",
    "S-K", "S-2", "H-J", "D-9", "H-7", "C-Q", "C-K", "C-10", "S-A", "D-J", "S-7", "D-2", "D-K", "H-2", "D-3", "S-Q",
  ],
};

const GOLDENS: readonly { readonly seed: number; readonly golden: Golden }[] = [
  { seed: 1, golden: GOLDEN_SEED_1 },
  { seed: 20260601, golden: GOLDEN_SEED_20260601 },
];

// ---------------------------------------------------------------------------------------------
// Independent reference implementation (shares no code with the engine)
// ---------------------------------------------------------------------------------------------

/** The 52 cards in canonical order (suit-major H, D, C, S; rank A..K), written out as a literal list. */
const CANONICAL: readonly string[] = [
  "H-A", "H-2", "H-3", "H-4", "H-5", "H-6", "H-7", "H-8", "H-9", "H-10", "H-J", "H-Q", "H-K",
  "D-A", "D-2", "D-3", "D-4", "D-5", "D-6", "D-7", "D-8", "D-9", "D-10", "D-J", "D-Q", "D-K",
  "C-A", "C-2", "C-3", "C-4", "C-5", "C-6", "C-7", "C-8", "C-9", "C-10", "C-J", "C-Q", "C-K",
  "S-A", "S-2", "S-3", "S-4", "S-5", "S-6", "S-7", "S-8", "S-9", "S-10", "S-J", "S-Q", "S-K",
];

/** mulberry32 written out independently with Math.imul. */
function refMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Documented Fisher-Yates: for i = n-1 down to 1, j = floor(rng() * (i+1)), swap a[i] and a[j]. */
function refShuffleDescending(cards: readonly string[], rng: () => number): string[] {
  const a = [...cards];
  for (let i = a.length - 1; i >= 1; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as string, a[i] as string];
  }
  return a;
}

/** WRONG variant: forward iteration, for i = 0 to n-2, j = i + floor(rng() * (n-i)). */
function refShuffleForward(cards: readonly string[], rng: () => number): string[] {
  const a = [...cards];
  for (let i = 0; i <= a.length - 2; i++) {
    const j = i + Math.floor(rng() * (a.length - i));
    [a[i], a[j]] = [a[j] as string, a[i] as string];
  }
  return a;
}

type ReferenceDeal = { neutral: string[]; hands: Record<PlayerId, string[]>; deck: string[] };

/**
 * Deals with the documented procedure (neutral = first 4, hand of Pk = 4+4k .. 7+4k, deck = remaining 32).
 * `wrong` selects a deliberately wrong variant for the mutation-style check.
 */
type WrongVariant =
  | "none"
  | "forward-shuffle"
  | "hands-from-end"
  | "reversed-deck"
  | "reversed-seat-order"
  | "hands-before-neutral"
  | "neutral-from-end";

function refDeal(seed: number, wrong: WrongVariant = "none"): ReferenceDeal {
  const rng = refMulberry32(seed);
  const s = wrong === "forward-shuffle" ? refShuffleForward(CANONICAL, rng) : refShuffleDescending(CANONICAL, rng);
  let neutral = s.slice(0, 4);
  let handStart = 4;
  let deck = s.slice(20);
  let seatOrder: PlayerId[] = ["P0", "P1", "P2", "P3"];
  if (wrong === "hands-from-end") {
    // Hands are the LAST 16 cards, the deck is the middle.
    handStart = 36;
    deck = s.slice(4, 36);
  }
  if (wrong === "reversed-deck") deck = [...deck].reverse();
  if (wrong === "reversed-seat-order") seatOrder = ["P3", "P2", "P1", "P0"];
  if (wrong === "hands-before-neutral") {
    // Hands take the first 16 cards, neutral takes the next 4.
    handStart = 0;
    neutral = s.slice(16, 20);
  }
  if (wrong === "neutral-from-end") neutral = s.slice(48, 52).reverse();
  const hands = {} as Record<PlayerId, string[]>;
  seatOrder.forEach((seat, k) => {
    hands[seat] = s.slice(handStart + 4 * k, handStart + 4 * k + 4);
  });
  return { neutral, hands, deck };
}

const asPlain = (d: { neutral: readonly string[]; hands: Readonly<Record<PlayerId, readonly string[]>>; deck: readonly string[] }) => ({
  neutral: [...d.neutral],
  hands: { P0: [...d.hands.P0], P1: [...d.hands.P1], P2: [...d.hands.P2], P3: [...d.hands.P3] },
  deck: [...d.deck],
});

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

describe("golden initial deals", () => {
  it("the frozen golden values themselves are well formed (4 + 16 + 32 distinct catalog cards)", () => {
    for (const { golden } of GOLDENS) {
      const all = [...golden.neutral, ...SEATS.flatMap((s) => golden.hands[s]), ...golden.deck];
      expect(golden.neutral).toHaveLength(4);
      for (const s of SEATS) expect(golden.hands[s]).toHaveLength(4);
      expect(golden.deck).toHaveLength(32);
      expect(new Set(all).size).toBe(52);
      expect([...all].sort()).toEqual([...CANONICAL].sort());
    }
  });

  for (const { seed, golden } of GOLDENS) {
    it(`dealGame(${seed}) equals the frozen golden deal`, () => {
      const deal = dealGame(seed);
      expect(deal.neutral).toEqual(golden.neutral);
      expect(deal.hands.P0).toEqual(golden.hands.P0);
      expect(deal.hands.P1).toEqual(golden.hands.P1);
      expect(deal.hands.P2).toEqual(golden.hands.P2);
      expect(deal.hands.P3).toEqual(golden.hands.P3);
      expect(deal.deck).toEqual(golden.deck);
      expect(Object.keys(deal.hands).sort()).toEqual(["P0", "P1", "P2", "P3"]);
    });

    it(`the independent reference deal for seed ${seed} equals the golden deal`, () => {
      expect(refDeal(seed)).toEqual(golden);
    });

    it(`tryDealGame(${seed}) returns the golden deal`, () => {
      const r = tryDealGame(seed);
      expect(r.ok).toBe(true);
      if (r.ok) expect(asPlain(r.value)).toEqual(golden);
    });
  }

  it("the top of the deck of seed 1 is its LAST element, C-7", () => {
    const deck = dealGame(1).deck;
    expect(deck[deck.length - 1]).toBe("C-7");
    expect(drawTop(deck).card).toBe("C-7");
  });
});

describe("mutation-style sanity check: a wrong shuffle or deal order fails the golden comparison", () => {
  const WRONG: readonly WrongVariant[] = [
    "forward-shuffle",
    "hands-from-end",
    "reversed-deck",
    "reversed-seat-order",
    "hands-before-neutral",
    "neutral-from-end",
  ];
  for (const { seed, golden } of GOLDENS) {
    for (const variant of WRONG) {
      it(`seed ${seed}: variant "${variant}" differs from the golden deal`, () => {
        const wrong = refDeal(seed, variant);
        expect(wrong).not.toEqual(golden);
        // The variant still deals a valid partition, so only the order tells it apart from the golden deal.
        const all = [...wrong.neutral, ...SEATS.flatMap((s) => wrong.hands[s]), ...wrong.deck];
        if (variant !== "hands-before-neutral" && variant !== "neutral-from-end" && variant !== "hands-from-end") {
          expect([...all].sort()).toEqual([...CANONICAL].sort());
        }
      });
    }
  }
});

describe("different seeds", () => {
  it("seeds 1 and 2 produce a different neutral group, different hands and a different deck", () => {
    const a = dealGame(1);
    const b = dealGame(2);
    expect(a.neutral).not.toEqual(b.neutral);
    for (const s of SEATS) expect(a.hands[s]).not.toEqual(b.hands[s]);
    expect(a.deck).not.toEqual(b.deck);
  });

  it("seed 1 and seed 20260601 produce different deals", () => {
    expect(dealGame(1)).not.toEqual(dealGame(20260601));
  });

  it("the same seed gives deeply equal deals on repeated calls", () => {
    expect(dealGame(1)).toEqual(dealGame(1));
    expect(dealGame(4294967295)).toEqual(dealGame(4294967295));
  });
});

describe("tryDealGame with invalid input", () => {
  const INVALID: readonly unknown[] = [NaN, Infinity, -Infinity, 1.5, -1, 4294967296, 2 ** 53, "1", null, undefined, {}, [], true];

  it("returns INVALID_CONFIG for every invalid seed", () => {
    for (const bad of INVALID) {
      expect(isValidSeed(bad)).toBe(false);
      const r = tryDealGame(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.code).toBe("INVALID_CONFIG");
        expect(r.error.detail).toBeTypeOf("string");
      }
    }
  });

  it("accepts the boundary seeds 0 and 4294967295", () => {
    for (const seed of [0, 4294967295]) {
      expect(isValidSeed(seed)).toBe(true);
      const r = tryDealGame(seed);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual(dealGame(seed));
    }
  });
});

describe("drawTop", () => {
  it("draws the last element of a non-empty deck and returns a new deck without it", () => {
    const deck: readonly CardId[] = ["H-A", "D-2", "S-K"];
    const r = drawTop(deck);
    expect(r.card).toBe("S-K");
    expect(r.deck).toEqual(["H-A", "D-2"]);
    expect(r.deck).not.toBe(deck);
    expect(deck).toEqual(["H-A", "D-2", "S-K"]);
  });

  it("draws the only card of a one-card deck and leaves an empty deck", () => {
    const r = drawTop(["C-7"]);
    expect(r.card).toBe("C-7");
    expect(r.deck).toEqual([]);
  });

  it("returns card null and the same deck reference when the deck is exhausted", () => {
    const empty: readonly CardId[] = [];
    const r = drawTop(empty);
    expect(r.card).toBeNull();
    expect(r.deck).toBe(empty);
    expect(r.deck).toEqual([]);
  });

  it("drawing the 32 cards of a dealt deck gives the reverse of the stored order, then null with the deck unchanged", () => {
    const original = [...dealGame(1).deck];
    let deck: readonly CardId[] = dealGame(1).deck;
    const drawn: (CardId | null)[] = [];
    for (let i = 0; i < 32; i++) {
      const r = drawTop(deck);
      drawn.push(r.card);
      deck = r.deck;
      expect(deck).toHaveLength(31 - i);
    }
    expect(drawn).toEqual([...original].reverse());
    expect(drawn).toEqual([...GOLDEN_SEED_1.deck].reverse());

    const after = drawTop(deck);
    expect(after.card).toBeNull();
    expect(after.deck).toBe(deck);
    expect(deck).toEqual([]);
  });
});

describe("input immutability", () => {
  it("dealGame, tryDealGame and drawTop work on deeply frozen deals and decks without mutating them", () => {
    for (const seed of [1, 20260601]) {
      const frozen = deepFreeze(dealGame(seed));
      const copy = asPlain(frozen);
      // drawTop on a frozen deck must not throw (strict mode would throw on any write) and must not change it.
      let deck: readonly CardId[] = frozen.deck;
      for (let i = 0; i < 33; i++) deck = drawTop(deck).deck;
      expect(deck).toEqual([]);
      expect(asPlain(frozen)).toEqual(copy);
      expect(Object.isFrozen(frozen.deck)).toBe(true);
      // A second deal of the same seed is unaffected by the frozen first deal (no shared mutable state).
      expect(asPlain(dealGame(seed))).toEqual(copy);
      const r = tryDealGame(seed);
      expect(r.ok && asPlain(r.value)).toEqual(copy);
    }
  });

  it("dealGame does not modify the card catalog: repeated deals stay equal to the golden values", () => {
    dealGame(1);
    dealGame(2);
    expect(asPlain(dealGame(1))).toEqual(GOLDEN_SEED_1);
  });

  it("returns fresh arrays: mutating one deal does not change the next deal of the same seed", () => {
    const first = dealGame(1) as unknown as { neutral: CardId[]; hands: Record<PlayerId, CardId[]>; deck: CardId[] };
    first.deck.length = 0;
    first.hands.P0.length = 0;
    first.neutral.length = 0;
    expect(asPlain(dealGame(1))).toEqual(GOLDEN_SEED_1);
  });
});
