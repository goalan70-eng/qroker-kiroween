// Property tests for the primitives (task 2.5): Properties 1, 2, 3 and 5 of
// .kiro/specs/qroker-playable-game/design.md. Requirements 1.2 to 1.5, 2.5, 3.1, 5.3, 5.4.
//
// Each property is ONE test with ONE fc.assert and at least 100 runs. Every assert uses a fixed seed, so a
// run is reproducible, and fast-check prints "seed", the shrunk counterexample and the replay path when a
// property fails. To explore other inputs, change the seed constant of that property.
//
// The oracles below are written independently of the modules under test (own rank table, own catalog,
// own BigInt FNV-1a, own notation rule), so a defect in a module cannot hide behind the same defect in
// the oracle.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ALL_CARDS, cardValue, groupIdOf, hiddenSum, parseCardId, rankOf, suitOf } from "./cards";
import { fromNotation, toNotation } from "./geometry";
import { parseSeed } from "./seed";
import { arbCard, arbFourDistinctCards, arbSeed, arbSeedText } from "./testing/card-generators";
import type { CardId } from "./types";

const NUM_RUNS = 200;
const SEED_P1 = 20260101;
const SEED_P2 = 20260102;
const SEED_P3 = 20260103;
const SEED_P5 = 20260105;

// ---------------------------------------------------------------------------------------------
// Independent oracles
// ---------------------------------------------------------------------------------------------

const SUIT_LETTERS = ["H", "D", "C", "S"] as const;
const RANK_LABELS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

/** The 52 canonical ids, suit-major then rank A..K, written out here. */
const CANONICAL: readonly string[] = SUIT_LETTERS.flatMap((s) => RANK_LABELS.map((r) => `${s}-${r}`));
const CANONICAL_SET: ReadonlySet<string> = new Set(CANONICAL);

/** Card_Value by rank label (requirement 1.3): A=1, 2..10 face value, J=11, Q=12, K=13. */
const RANK_TABLE: Readonly<Record<string, number>> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
};
const tableValue = (card: string): number => {
  const rank = card.slice(card.indexOf("-") + 1);
  const v = RANK_TABLE[rank];
  if (v === undefined) throw new Error(`oracle: unknown rank in ${card}`);
  return v;
};

/** FNV-1a 32 over UTF-16 code units with BigInt arithmetic and an explicit mask (no Math.imul). */
function fnvReference(text: string): number {
  let h = 0x811c9dc5n;
  for (let i = 0; i < text.length; i++) h = ((h ^ BigInt(text.charCodeAt(i))) * 0x01000193n) & 0xffffffffn;
  return Number(h);
}

/** Expected `parseSeed` outcome: `null` for SEED_EMPTY, otherwise the Seed (requirement 2.5). */
function expectedSeed(text: string): number | null {
  const t = text.trim(); // the module documents trimming; the hash is taken over the trimmed text
  if (t === "") return null;
  if (/^[0-9]+$/.test(t) && BigInt(t) <= 4294967295n) return Number(BigInt(t));
  return fnvReference(t);
}

/** The 8x8 notation rule: one letter A..H followed by one digit 1..8, nothing else. */
const isCellNotation = (s: string): boolean => s.length === 2 && "ABCDEFGH".includes(s[0] as string) && "12345678".includes(s[1] as string);

/** All 24 orderings of a 4-element tuple. */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]));
}

// ---------------------------------------------------------------------------------------------
// Property 1
// ---------------------------------------------------------------------------------------------

/** Strings derived from a valid id by one edit, plus suit/separator/rank recombinations. */
const arbMutatedCardText: fc.Arbitrary<string> = fc.oneof(
  fc.tuple(arbCard, fc.nat(4)).map(([c, i]) => c.slice(0, i) + c.slice(i + 1)), // delete a character
  fc.tuple(arbCard, fc.nat(4), fc.constantFrom(" ", "0", "-", "H", "1", "x", "\u0000", "\u00a0")).map(([c, i, ch]) => c.slice(0, i) + ch + c.slice(i)), // insert
  fc.tuple(arbCard, fc.nat(3), fc.constantFrom("h", "x", "7", "_", " ", "\u0661")).map(([c, i, ch]) => c.slice(0, i) + ch + c.slice(i + 1)), // replace
  arbCard.map((c) => c.toLowerCase()),
  arbCard.map((c) => ` ${c}`),
  arbCard.map((c) => `${c} `),
  arbCard.map((c) => c.replace("-", "_")),
  arbCard.map((c) => c.replace("-", "-0")),
  fc.tuple(fc.constantFrom(...SUIT_LETTERS), fc.constantFrom("", "_", " ", ":", "-", "--"), fc.constantFrom(...RANK_LABELS, "0", "1", "11", "14", "a", "B", "T")).map(([s, sep, r]) => `${s}${sep}${r}`),
);

const arbCardText: fc.Arbitrary<string> = fc.oneof(
  arbCard,
  arbMutatedCardText,
  fc.string({ unit: "binary", maxLength: 8 }),
  fc.string({ unit: "grapheme", maxLength: 6 }),
);

describe("Property 1: Card catalog and CardId round trip", () => {
  it("accepts exactly the 52 canonical ids, round-trips them and rejects every other string", () => {
    // Catalog: 52 pairwise distinct ids in the canonical suit-major order (requirements 1.1, 1.6).
    expect(ALL_CARDS).toHaveLength(52);
    expect(new Set<string>(ALL_CARDS).size).toBe(52);
    expect([...ALL_CARDS]).toEqual(CANONICAL);

    // Feature: qroker-playable-game, Property 1: Card catalog and CardId round trip
    fc.assert(
      fc.property(arbCardText, (text) => {
        const result = parseCardId(text);
        if (CANONICAL_SET.has(text)) {
          // Requirement 1.4 (accept) and 1.5 (formatting suit and rank reproduces the id).
          expect(result).toEqual({ ok: true, value: text });
          if (!result.ok) return;
          expect(`${suitOf(result.value)}-${rankOf(result.value)}`).toBe(text);
        } else {
          // Requirement 1.4 (reject): any other string, including every mutated id.
          expect(result.ok).toBe(false);
          if (result.ok) return;
          expect(result.error.code).toBe("INVALID_CARD_ID");
        }
      }),
      { seed: SEED_P1, numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Property 2
// ---------------------------------------------------------------------------------------------

describe("Property 2: Card_Value and Hidden_Sum", () => {
  it("keeps Card_Value on the rank table and Hidden_Sum equal to the table sum, in 4..52, for every order", () => {
    // Feature: qroker-playable-game, Property 2: Card_Value and Hidden_Sum
    fc.assert(
      fc.property(arbCard, arbFourDistinctCards, (card, four) => {
        // Requirement 1.3: integer in 1..13 equal to the independent rank-table lookup.
        const v = cardValue(card);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(13);
        expect(v).toBe(tableValue(card));

        // Requirement 5.3: Hidden_Sum is the sum of the 4 Card_Values, an integer in 4..52.
        const expected = four.reduce((total, c) => total + tableValue(c), 0);
        const sum = hiddenSum(four);
        expect(Number.isInteger(sum)).toBe(true);
        expect(sum).toBeGreaterThanOrEqual(4);
        expect(sum).toBeLessThanOrEqual(52);
        expect(sum).toBe(expected);

        // Requirements 5.3 and 5.4: the same Hidden_Sum and Group_Id for all 24 orderings.
        const group = groupIdOf(four);
        expect([...group.split("|")].sort()).toEqual([...four].sort());
        for (const order of permutations<CardId>(four)) {
          expect(hiddenSum(order as [CardId, CardId, CardId, CardId])).toBe(expected);
          expect(groupIdOf(order)).toBe(group);
        }
      }),
      { seed: SEED_P2, numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Property 3
// ---------------------------------------------------------------------------------------------

const WHITESPACE = [" ", "\t", "\n", "\r", "\u000b", "\u000c", "\u00a0", "\u2003", "\u3000", "\ufeff", "\u2028"] as const;
const arbWhitespace: fc.Arbitrary<string> = fc.array(fc.constantFrom(...WHITESPACE), { maxLength: 8 }).map((a) => a.join(""));

type SeedCase =
  | { readonly kind: "in-range"; readonly n: number }
  | { readonly kind: "blank"; readonly text: string }
  | { readonly kind: "other"; readonly text: string };

const arbSeedCase: fc.Arbitrary<SeedCase> = fc.oneof(
  arbSeed.map((n): SeedCase => ({ kind: "in-range", n })),
  arbWhitespace.map((text): SeedCase => ({ kind: "blank", text })),
  arbSeedText.map((text): SeedCase => ({ kind: "other", text })),
  // decimal text above the range, with signs, a decimal point, or padded with zeros or spaces
  fc.bigInt({ min: 4294967296n, max: 10n ** 25n }).map((b): SeedCase => ({ kind: "other", text: String(b) })),
  fc.integer({ min: 0, max: 0xffffffff }).map((n): SeedCase => ({ kind: "other", text: `-${n}` })),
  fc.integer({ min: 0, max: 0xffffffff }).map((n): SeedCase => ({ kind: "other", text: `+${n}` })),
  fc.integer({ min: 0, max: 0xffffffff }).map((n): SeedCase => ({ kind: "other", text: `${n}.5` })),
  fc.tuple(arbWhitespace, arbSeedText, arbWhitespace).map(([a, t, b]): SeedCase => ({ kind: "other", text: a + t + b })),
);

describe("Property 3: Seed parsing", () => {
  it("maps in-range decimals to themselves, other text to a stable FNV-1a uint32, blank text to SEED_EMPTY", () => {
    // Feature: qroker-playable-game, Property 3: Seed parsing
    fc.assert(
      fc.property(arbSeedCase, (c) => {
        if (c.kind === "in-range") {
          // Requirement 2.5: a decimal integer in 0..4294967295 maps to itself.
          expect(parseSeed(String(c.n))).toEqual({ ok: true, value: c.n });
          expect(parseSeed(String(c.n))).toEqual({ ok: true, value: c.n });
        } else if (c.kind === "blank") {
          // Requirement 2.5: empty or whitespace-only text is SEED_EMPTY.
          const r = parseSeed(c.text);
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.error.code).toBe("SEED_EMPTY");
        } else {
          // Requirement 2.5: any other non-empty text gives the same documented uint32 on every call.
          const first = parseSeed(c.text);
          const second = parseSeed(c.text);
          expect(second).toEqual(first);
          const expected = expectedSeed(c.text);
          expect(expected).not.toBeNull();
          expect(first).toEqual({ ok: true, value: expected });
          if (!first.ok) return;
          expect(Number.isInteger(first.value)).toBe(true);
          expect(first.value).toBeGreaterThanOrEqual(0);
          expect(first.value).toBeLessThanOrEqual(4294967295);
        }
      }),
      { seed: SEED_P3, numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Property 5
// ---------------------------------------------------------------------------------------------

const arbCell = fc.record({ row: fc.integer({ min: 0, max: 7 }), col: fc.integer({ min: 0, max: 7 }) });

/** Notations and near misses: out-of-board letters/digits, wrong case, wrong length, padding. */
const arbNotationText: fc.Arbitrary<string> = fc.oneof(
  arbCell.map((p) => `${"ABCDEFGH"[p.col]}${p.row + 1}`),
  fc.tuple(fc.constantFrom(..."ABCDEFGHIJZaz0 "), fc.constantFrom(..."012345678956 a")).map(([l, d]) => `${l}${d}`),
  fc.tuple(arbCell, fc.constantFrom("", "0", "1", " ", "\n", "\u00a0")).map(([p, extra]) => `${"ABCDEFGH"[p.col]}${p.row + 1}${extra}`),
  fc.tuple(fc.constantFrom("", " ", "0"), arbCell).map(([pre, p]) => `${pre}${"ABCDEFGH"[p.col]}${p.row + 1}`),
  arbCell.map((p) => `${"abcdefgh"[p.col]}${p.row + 1}`),
  fc.string({ unit: "binary", maxLength: 4 }),
  fc.string({ unit: "grapheme", maxLength: 3 }),
);

describe("Property 5: Board notation round trip", () => {
  it("round-trips all 64 cells and rejects every string that is not a cell notation", () => {
    // All 64 cells exactly once: distinct notations that match the independent rule.
    const seen = new Set<string>();
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const text = toNotation({ row, col });
        expect(text).toBe(`${"ABCDEFGH"[col]}${row + 1}`);
        expect(fromNotation(text)).toEqual({ ok: true, value: { row, col } });
        seen.add(text);
      }
    }
    expect(seen.size).toBe(64);

    // Feature: qroker-playable-game, Property 5: Board notation round trip
    fc.assert(
      fc.property(arbCell, arbNotationText, (cell, text) => {
        // Requirement 3.1: fromNotation(toNotation(p)) equals p for every cell.
        expect(fromNotation(toNotation(cell))).toEqual({ ok: true, value: cell });

        // Requirement 3.1: a string that is not a cell notation is an error, a cell notation parses.
        const parsed = fromNotation(text);
        if (isCellNotation(text)) {
          expect(parsed.ok).toBe(true);
          if (!parsed.ok) return;
          expect(toNotation(parsed.value)).toBe(text);
        } else {
          expect(parsed.ok).toBe(false);
        }
      }),
      { seed: SEED_P5, numRuns: NUM_RUNS },
    );
  });
});
