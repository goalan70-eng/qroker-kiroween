// Tests for core/prng.ts (task 2.2). Requirements 2.1 and 2.6.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mix32, mulberry32, shuffle } from "./prng";

// Independent reference of the published mulberry32, written with BigInt and explicit 32-bit masks
// (no Math.imul, no `| 0` tricks), so that it shares no arithmetic with the implementation.
const M32 = 0xffffffffn;
function referenceMulberry32(seed: number): () => number {
  let a = BigInt(seed >>> 0);
  const mul = (x: bigint, y: bigint): bigint => (x * y) & M32;
  return () => {
    a = (a + 0x6d2b79f5n) & M32;
    let t = mul(a ^ (a >> 15n), a | 1n);
    t = ((t + mul(t ^ (t >> 7n), t | 61n)) & M32) ^ t;
    return Number((t ^ (t >> 14n)) & M32) / 4294967296;
  };
}

const first = (rng: () => number, n: number): number[] => Array.from({ length: n }, () => rng());

// Golden values: recorded by running the implementation once; the reference above confirms them.
const GOLDEN_FIRST_5: ReadonlyArray<readonly [number, readonly number[]]> = [
  [0, [0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111, 0.46732782293111086]],
  [1, [0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741, 0.9683778982143849]],
  [42, [0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693, 0.17481389874592423]],
  [123456789, [0.2577907438389957, 0.9707721115555614, 0.7853280142880976, 0.20616457983851433, 0.30307188746519387]],
  [4294967295, [0.8964226141106337, 0.189478256739676, 0.7156526781618595, 0.9440599093213677, 0.8452364315744489]],
];

describe("mulberry32", () => {
  it.each(GOLDEN_FIRST_5)("seed %i gives the recorded first 5 outputs", (seed, expected) => {
    expect(first(mulberry32(seed), 5)).toEqual(expected);
  });

  it.each(GOLDEN_FIRST_5)("seed %i matches the independent BigInt reference for 1000 outputs", (seed) => {
    expect(first(mulberry32(seed), 1000)).toEqual(first(referenceMulberry32(seed), 1000));
  });

  it("gives identical sequences for the same seed and different ones for different seeds", () => {
    expect(first(mulberry32(7), 50)).toEqual(first(mulberry32(7), 50));
    expect(first(mulberry32(7), 5)).not.toEqual(first(mulberry32(8), 5));
  });

  it("keeps generators independent of each other", () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    a();
    a();
    expect(b()).toBe(first(mulberry32(5), 1)[0]);
  });

  it("coerces the seed to uint32", () => {
    expect(first(mulberry32(-1), 5)).toEqual(first(mulberry32(4294967295), 5));
    expect(first(mulberry32(4294967296 + 42), 5)).toEqual(first(mulberry32(42), 5));
    expect(first(mulberry32(42.9), 5)).toEqual(first(mulberry32(42), 5));
    expect(first(mulberry32(Number.NaN), 5)).toEqual(first(mulberry32(0), 5));
  });

  it("property: outputs are in [0, 1) and reproducible for any seed", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4294967295 }), (seed) => {
        const xs = first(mulberry32(seed), 100);
        expect(xs).toEqual(first(mulberry32(seed), 100));
        for (const x of xs) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(1);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("shuffle", () => {
  const TEN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  it("matches the recorded permutations for fixed seeds", () => {
    expect(shuffle(TEN, mulberry32(42))).toEqual([0, 7, 3, 5, 2, 1, 8, 9, 4, 6]);
    expect(shuffle(TEN, mulberry32(2024))).toEqual([9, 2, 0, 1, 7, 3, 4, 5, 6, 8]);
  });

  it("follows the documented procedure: i = n-1 down to 1, j = floor(rng() * (i + 1)), swap", () => {
    // Independent re-statement using the BigInt reference generator.
    const rng = referenceMulberry32(42);
    const expected = TEN.slice();
    for (let i = expected.length - 1; i >= 1; i--) {
      const j = Math.floor(rng() * (i + 1));
      [expected[i], expected[j]] = [expected[j] as number, expected[i] as number];
    }
    expect(expected).toEqual(shuffle(TEN, mulberry32(42)));
  });

  it("consumes exactly n - 1 draws (none for length 0 or 1)", () => {
    const count = (n: number): number => {
      let calls = 0;
      shuffle(Array.from({ length: n }, (_, k) => k), () => {
        calls++;
        return 0.5;
      });
      return calls;
    };
    expect(count(0)).toBe(0);
    expect(count(1)).toBe(0);
    expect(count(52)).toBe(51);
  });

  it("returns a new array and does not mutate the input", () => {
    const input = Object.freeze([3, 1, 2]) as readonly number[];
    const out = shuffle(input, mulberry32(1));
    expect(out).not.toBe(input);
    expect(input).toEqual([3, 1, 2]);
    expect(shuffle([], mulberry32(1))).toEqual([]);
    expect(shuffle(["x"], mulberry32(1))).toEqual(["x"]);
  });

  it("property: the result is a permutation, deterministic per seed, input untouched", () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 60 }), fc.integer({ min: 0, max: 4294967295 }), (items, seed) => {
        const copy = items.slice();
        const out = shuffle(items, mulberry32(seed));
        expect(items).toEqual(copy);
        expect(out).toHaveLength(items.length);
        expect(out.slice().sort((a, b) => a - b)).toEqual(items.slice().sort((a, b) => a - b));
        expect(shuffle(items, mulberry32(seed))).toEqual(out);
      }),
      { numRuns: 100 },
    );
  });

  it("shuffles 52 distinct items into a permutation that differs between seeds", () => {
    const deck = Array.from({ length: 52 }, (_, k) => k);
    const a = shuffle(deck, mulberry32(1));
    const b = shuffle(deck, mulberry32(2));
    expect(new Set(a).size).toBe(52);
    expect(a).not.toEqual(b);
  });
});

describe("mix32", () => {
  it("returns recorded values (golden)", () => {
    expect(mix32(0, 0)).toBe(2856213345);
    expect(mix32(1, 0)).toBe(2571226413);
    expect(mix32(0, 1)).toBe(1863002342);
    expect(mix32(12345, 100007)).toBe(3309606127);
    expect(mix32(100007, 12345)).toBe(2589396245);
  });

  it("is deterministic, order sensitive and always a uint32", () => {
    expect(mix32(12345, 100007)).not.toBe(mix32(100007, 12345));
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        const v = mix32(a, b);
        expect(v).toBe(mix32(a, b));
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(4294967295);
      }),
      { numRuns: 100 },
    );
  });

  it("gives distinct decision seeds over a seat x action grid for one game seed", () => {
    const seen = new Set<number>();
    for (let seat = 0; seat < 4; seat++) for (let action = 0; action < 200; action++) seen.add(mix32(777, seat * 100000 + action));
    expect(seen.size).toBe(800);
  });
});
