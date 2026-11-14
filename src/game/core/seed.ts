// Seed parsing (task 2.2, requirements 2.5).
//
// Pure and deterministic: no Math.random, Date, performance.now, crypto, DOM or node: imports.

import type { Result } from "./types";

/** Largest Seed: the maximum unsigned 32-bit integer. */
export const MAX_SEED = 4294967295;

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a, 32 bit, over the UTF-16 code units of `text` (not UTF-8 bytes):
 *   h = 0x811C9DC5
 *   for each code unit c: h = imul(h ^ c, 0x01000193)
 * The whole 16-bit unit is XORed in one step. For text with only code units below 0x80 this equals the
 * standard byte-wise FNV-1a. Characters outside the BMP contribute two code units (surrogate pair).
 * Returns an unsigned 32-bit integer.
 */
export function fnv1a32(text: string): number {
  let h = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), FNV_PRIME);
  }
  return h >>> 0;
}

const DECIMAL_DIGITS = /^[0-9]+$/;

/**
 * Parses user seed text into a Seed (unsigned 32-bit integer).
 *
 * Reading of the design, in order:
 *  1. The text is trimmed with String.prototype.trim (ECMAScript WhiteSpace and LineTerminator, so
 *     ASCII and Unicode spaces, tabs, newlines, NBSP and BOM). Trimmed-empty text, which includes
 *     whitespace-only text, returns { ok: false, error: { code: 'SEED_EMPTY' } }.
 *  2. If the trimmed text consists only of ASCII digits 0-9 and its numeric value is within
 *     0..4294967295, the result is that number. Leading zeros are allowed and do not change the value
 *     ("007" is 7, "0000" is 0), also for arbitrarily long zero padding.
 *  3. Any other non-empty text gets the FNV-1a 32 hash of the TRIMMED text, so " abc " and "abc"
 *     give the same Seed. This covers: a sign ("-5", "+5"), a decimal point or exponent ("1.5", "1e3"),
 *     digits above 4294967295 ("4294967296", "99999999999999999999"), non-ASCII digits (full-width
 *     "１２３"), hex ("0x10") and any ordinary text. The text is not Unicode-normalized, so
 *     composed and decomposed forms of the same character give different Seeds (UTF-16 code units
 *     are hashed as they are).
 *
 * Note: a text such as "4294967296" hashes, so it does not equal the number 4294967296 nor 0.
 */
export function parseSeed(text: string): Result<number> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: { code: "SEED_EMPTY" } };
  }
  if (DECIMAL_DIGITS.test(trimmed)) {
    const digits = trimmed.replace(/^0+/, "");
    if (digits.length === 0) return { ok: true, value: 0 };
    // At most 10 significant digits are needed for a value up to 4294967295; Number() is exact there.
    if (digits.length <= 10) {
      const value = Number(digits);
      if (value <= MAX_SEED) return { ok: true, value };
    }
  }
  return { ok: true, value: fnv1a32(trimmed) };
}
