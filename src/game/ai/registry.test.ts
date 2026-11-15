// Tests of the strategy registry (task 12.2): the BEGINNER entry, the documented failure for tiers that are declared
// but not registered yet (EXPERT: task 23.1; ADVANCED is registered by task 12.3), the rejection of invalid input, and the labels.

import { describe, expect, expectTypeOf, it } from "vitest";
import { reduce } from "../core/engine";
import { defaultConfig, newGame } from "../core/state";
import type { Difficulty } from "../core/types";
import { viewFor } from "../core/view";
import { ADVANCED_STRATEGY } from "./heuristic";
import { BEGINNER_STRATEGY } from "./random";
import { getStrategy, registeredDifficulties } from "./registry";
import { DIFFICULTY_LABELS } from "./strategy";
import type { AIStrategy } from "./strategy";

describe("getStrategy", () => {
  it("returns the BEGINNER strategy, with both methods, as one shared instance", () => {
    const strategy = getStrategy("BEGINNER");
    expect(strategy.id).toBe("BEGINNER");
    expect(typeof strategy.choosePlacement).toBe("function");
    expect(typeof strategy.chooseGuesses).toBe("function");
    expect(strategy).toBe(BEGINNER_STRATEGY);
    expect(getStrategy("BEGINNER")).toBe(strategy);
  });

  it("returns a strategy that plays through the engine (one decision of each kind is accepted)", () => {
    const created = newGame({ seed: 5, config: defaultConfig() });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const state = created.value;
    const place = getStrategy("BEGINNER").choosePlacement(viewFor(state, state.turn), { decisionSeed: 99 });
    expect(reduce(state, place).ok).toBe(true);
    expectTypeOf(getStrategy).parameters.toEqualTypeOf<[Difficulty]>();
    expectTypeOf(getStrategy).returns.toEqualTypeOf<AIStrategy>();
  });

  it("returns the ADVANCED strategy (task 12.3) as one shared instance with its own id", () => {
    const strategy = getStrategy("ADVANCED");
    expect(strategy.id).toBe("ADVANCED");
    expect(strategy).toBe(ADVANCED_STRATEGY);
    expect(getStrategy("ADVANCED")).toBe(strategy);
    expect(strategy).not.toBe(BEGINNER_STRATEGY);
  });

  it("throws a RangeError that names the tier for EXPERT, which is not registered yet", () => {
    for (const tier of ["EXPERT"] as const) {
      expect(() => getStrategy(tier), tier).toThrow(RangeError);
      expect(() => getStrategy(tier), tier).toThrow(new RegExp(`${tier}.*not registered`));
    }
  });

  it("rejects unknown and invalid inputs with a RangeError that says it is not a difficulty", () => {
    const invalid: unknown[] = [
      "EXPERT2",
      "beginner",
      "",
      " BEGINNER",
      "BEGINNER ",
      "toString",
      "constructor",
      "__proto__",
      "hasOwnProperty",
      null,
      undefined,
      0,
      1,
      NaN,
      true,
      {},
      [],
      ["BEGINNER"],
      { toString: () => "BEGINNER" },
      Symbol("BEGINNER"),
    ];
    for (const value of invalid) {
      expect(() => getStrategy(value as Difficulty), String(typeof value)).toThrow(RangeError);
      expect(() => getStrategy(value as Difficulty), String(typeof value)).toThrow(/not a difficulty/);
    }
  });

  it("does not depend on prior calls (a failed look-up changes nothing)", () => {
    expect(() => getStrategy("EXPERT")).toThrow(RangeError);
    expect(getStrategy("BEGINNER")).toBe(BEGINNER_STRATEGY);
    expect(getStrategy("ADVANCED")).toBe(ADVANCED_STRATEGY);
    expect(getStrategy("BEGINNER")).toBe(BEGINNER_STRATEGY);
  });
});

describe("registeredDifficulties", () => {
  it("lists exactly the registered tiers in the order of Difficulty (BEGINNER and ADVANCED until task 23.1)", () => {
    expect(registeredDifficulties()).toEqual(["BEGINNER", "ADVANCED"]);
  });

  it("lists only tiers that getStrategy returns, each with its own id and a Korean and English label", () => {
    const declared = Object.keys(DIFFICULTY_LABELS);
    expect(declared).toEqual(["BEGINNER", "ADVANCED", "EXPERT"]);
    for (const tier of registeredDifficulties()) {
      expect(getStrategy(tier).id).toBe(tier);
      expect(DIFFICULTY_LABELS[tier].en.length).toBeGreaterThan(0);
      expect(DIFFICULTY_LABELS[tier].ko.length).toBeGreaterThan(0);
    }
    for (const tier of declared as Difficulty[]) {
      const listed = registeredDifficulties().includes(tier);
      if (listed) expect(() => getStrategy(tier)).not.toThrow();
      else expect(() => getStrategy(tier)).toThrow(RangeError);
    }
  });

  it("returns a new frozen array on each call, so a caller cannot change the registry", () => {
    const a = registeredDifficulties();
    const b = registeredDifficulties();
    expect(a).not.toBe(b);
    expect(Object.isFrozen(a)).toBe(true);
    expect(() => (a as Difficulty[]).push("EXPERT")).toThrow(TypeError);
    expect(registeredDifficulties()).toEqual(["BEGINNER", "ADVANCED"]);
  });
});

describe("labels", () => {
  it("BEGINNER has the English and Korean names of the design", () => {
    expect(DIFFICULTY_LABELS.BEGINNER).toEqual({ en: "Beginner", ko: "초급" });
  });
});
