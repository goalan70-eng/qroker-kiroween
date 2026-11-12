import { describe, expect, it } from "vitest";
import { computeBound, flatten, flattenExpected } from "./verify-bound";

describe("codebook capacity bound (exhaustive 2^25 enumeration)", () => {
  it("measured values equal the stated claims and bound >= 52", () => {
    const r = computeBound();
    const measured = flatten(r);
    const expected = flattenExpected();
    const diffs = Object.keys(expected)
      .filter((k) => measured[k] !== expected[k])
      .map((k) => `${k}: expected ${expected[k]}, measured ${measured[k]}`);
    if (diffs.length > 0) console.error("DISCREPANCIES:\n" + diffs.join("\n"));
    expect(diffs).toEqual([]);
    expect(r.bound).toBeGreaterThanOrEqual(52);
  }, 120_000);
});
