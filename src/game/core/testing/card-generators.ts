// fast-check arbitraries for cards and seeds (task 2.5). Test support only: imported by tests, never by
// engine code. Pure and deterministic: no Math.random, clock or crypto; all randomness comes from fast-check.
//
// Source: .kiro/specs/qroker-playable-game/design.md, "Testing Strategy > Generators".

import fc from "fast-check";
import { ALL_CARDS } from "../cards";
import type { CardId } from "../types";

/** A Seed: an unsigned 32-bit integer (fast-check biases towards the edges 0 and 4294967295). */
export const arbSeed: fc.Arbitrary<number> = fc.integer({ min: 0, max: 0xffffffff });

/**
 * Seed text accepted by `parseSeed`: either the decimal form of a Seed or arbitrary non-blank unicode text
 * (any UTF-16 code unit, including lone surrogates, and grapheme clusters). Never empty or whitespace-only.
 */
export const arbSeedText: fc.Arbitrary<string> = fc.oneof(
  arbSeed.map((n) => String(n)),
  fc.string({ unit: "binary", minLength: 1, maxLength: 40 }),
  fc.string({ unit: "grapheme", minLength: 1, maxLength: 20 }),
).filter((s) => s.trim().length > 0);

/** One card of the 52-card catalog. */
export const arbCard: fc.Arbitrary<CardId> = fc.constantFrom(...ALL_CARDS);

/** Four pairwise distinct cards in a random order (the members of one Composite_Code). */
export const arbFourDistinctCards: fc.Arbitrary<[CardId, CardId, CardId, CardId]> = fc
  .uniqueArray(arbCard, { minLength: 4, maxLength: 4 })
  .map((cards) => cards as [CardId, CardId, CardId, CardId]);
