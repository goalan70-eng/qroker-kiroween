// Tests for core/seed.ts (task 2.2). Requirement 2.5.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fnv1a32, parseSeed } from "./seed";

// Independent reference FNV-1a 32 with BigInt (explicit mask, no Math.imul), over UTF-16 code units.
function referenceFnv1a32(units: readonly number[]): number {
  let h = 0x811c9dc5n;
  for (const u of units) h = ((h ^ BigInt(u)) * 0x01000193n) & 0xffffffffn;
  return Number(h);
}
const unitsOf = (s: string): number[] => Array.from({ length: s.length }, (_, i) => s.charCodeAt(i));
// Byte-wise reference for ASCII only: published test vectors of the standard FNV-1a 32.
const asciiBytes = (s: string): number[] => Array.from(new TextEncoder().encode(s));

const value = (text: string): number => {
  const r = parseSeed(text);
  if (!r.ok) throw new Error(`unexpected ${r.error.code} for ${JSON.stringify(text)}`);
  return r.value;
};

describe("fnv1a32", () => {
  it("matches the published FNV-1a 32 test vectors", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
  });

  it("matches the independent BigInt reference for ASCII (bytes = code units)", () => {
    for (const s of ["", "a", "foobar", "abc", "Hello, World!", "0x10"]) {
      expect(fnv1a32(s)).toBe(referenceFnv1a32(asciiBytes(s)));
      expect(fnv1a32(s)).toBe(referenceFnv1a32(unitsOf(s)));
    }
  });

  it("hashes UTF-16 code units, not UTF-8 bytes", () => {
    expect(fnv1a32("é")).toBe(referenceFnv1a32([0xe9]));
    expect(fnv1a32("é")).not.toBe(referenceFnv1a32(asciiBytes("é")));
    // U+1F600 is the surrogate pair D83D DE00: two code units.
    expect(fnv1a32("😀")).toBe(referenceFnv1a32([0xd83d, 0xde00]));
  });

  it("property: equals the reference for any string and is a uint32", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 40 }), (s) => {
        const h = fnv1a32(s);
        expect(h).toBe(referenceFnv1a32(unitsOf(s)));
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(4294967295);
      }),
      { numRuns: 100 },
    );
  });
});

describe("parseSeed: empty text", () => {
  it.each(["", " ", "   ", "\t", "\n", " \t\r\n ", "\u00a0", "\u3000", "\ufeff"])("rejects %j with SEED_EMPTY", (text) => {
    expect(parseSeed(text)).toEqual({ ok: false, error: { code: "SEED_EMPTY" } });
  });
});

describe("parseSeed: decimal integers in 0..4294967295", () => {
  it("returns the number itself, including the bounds", () => {
    expect(parseSeed("0")).toEqual({ ok: true, value: 0 });
    expect(parseSeed("1")).toEqual({ ok: true, value: 1 });
    expect(parseSeed("42")).toEqual({ ok: true, value: 42 });
    expect(parseSeed("2147483648")).toEqual({ ok: true, value: 2147483648 });
    expect(parseSeed("4294967295")).toEqual({ ok: true, value: 4294967295 });
  });

  it("ignores surrounding whitespace", () => {
    expect(value("  42  ")).toBe(42);
    expect(value("\n4294967295\t")).toBe(4294967295);
  });

  it("accepts leading zeros as the same number, also with long zero padding", () => {
    expect(value("007")).toBe(7);
    expect(value("0000")).toBe(0);
    expect(value("0004294967295")).toBe(4294967295);
    expect(value("0".repeat(50) + "5")).toBe(5);
  });

  it("property: any integer in range maps to itself", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4294967295 }), (n) => {
        expect(parseSeed(String(n))).toEqual({ ok: true, value: n });
      }),
      { numRuns: 200 },
    );
  });
});

describe("parseSeed: other non-empty text is hashed", () => {
  it("hashes ordinary text with FNV-1a 32", () => {
    expect(value("a")).toBe(0xe40c292c);
    expect(value("foobar")).toBe(0xbf9cf968);
    expect(value("abc")).toBe(440920331);
    expect(value("한글")).toBe(3076352705);
  });

  it("hashes the trimmed text, so surrounding whitespace does not change the Seed", () => {
    expect(value("  abc \n")).toBe(value("abc"));
    expect(value("a b")).not.toBe(value("ab")); // inner whitespace is kept
  });

  it("hashes numbers outside the range instead of clamping or wrapping", () => {
    for (const text of ["4294967296", "99999999999999999999", "10000000000"]) {
      expect(value(text)).toBe(fnv1a32(text));
    }
    expect(value("4294967296")).not.toBe(0);
  });

  it("hashes negative numbers, signed numbers, decimals, exponents and hex", () => {
    for (const text of ["-1", "-0", "+5", "1.5", "1e3", "0x10", "12a", "1 2", "１２３"]) {
      expect(value(text), text).toBe(fnv1a32(text));
    }
    expect(value("-1")).not.toBe(value("1"));
  });

  it("does not Unicode-normalize: composed and decomposed forms differ", () => {
    expect(value("\u00e9")).not.toBe(value("e\u0301"));
  });

  it("property: non-numeric text always gives a stable uint32", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", minLength: 1, maxLength: 30 }), (s) => {
        fc.pre(s.trim().length > 0 && !/^[0-9]+$/.test(s.trim()));
        const r = parseSeed(s);
        expect(r).toEqual(parseSeed(s));
        expect(r.ok).toBe(true);
        if (r.ok) {
          expect(Number.isInteger(r.value)).toBe(true);
          expect(r.value).toBeGreaterThanOrEqual(0);
          expect(r.value).toBeLessThanOrEqual(4294967295);
        }
      }),
      { numRuns: 100 },
    );
  });
});
