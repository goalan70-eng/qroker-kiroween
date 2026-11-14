// Unit tests for core/rules.ts (task 8.1). Requirements 5.7, 8.3, 12.6.
//
// The configuration error cases are driven through `newGame` in state.test.ts. This file tests the module
// itself: re-exported constants are the same values as in their home modules, the provisional policy
// constants (OQ-1, OQ-3) are isolated here, and `validateGameConfig` returns a normalized frozen copy.

import { describe, expect, it } from "vitest";
import { DECK_SIZE_AFTER_DEAL, HAND_SIZE, NEUTRAL_COUNT } from "./deck";
import {
  DECK_SIZE_AFTER_DEAL as RULES_DECK_SIZE,
  DEFAULT_AI_DIFFICULTIES,
  DEFAULT_IDENTITY_VISIBILITY,
  DIFFICULTIES,
  HAND_SIZE as RULES_HAND_SIZE,
  IDENTITY_VISIBILITIES,
  NEUTRAL_COUNT as RULES_NEUTRAL_COUNT,
  RULES_VERSION,
  SEATS,
  STARTING_GROUP_SCORING,
  startingScoredGroups,
  validateGameConfig,
} from "./rules";
import { RULES_VERSION as SCORE_RULES_VERSION } from "./score";
import { defaultConfig } from "./state";
import { SEATS as TURN_SEATS } from "./turn";

describe("re-exported constants are the originals", () => {
  it("has one definition of each value", () => {
    expect(RULES_VERSION).toBe(SCORE_RULES_VERSION);
    expect(SEATS).toBe(TURN_SEATS);
    expect(RULES_HAND_SIZE).toBe(HAND_SIZE);
    expect(RULES_NEUTRAL_COUNT).toBe(NEUTRAL_COUNT);
    expect(RULES_DECK_SIZE).toBe(DECK_SIZE_AFTER_DEAL);
    expect(NEUTRAL_COUNT + SEATS.length * HAND_SIZE + DECK_SIZE_AFTER_DEAL).toBe(52);
  });
});

describe("provisional policy constants", () => {
  it("OQ-3: the starting group is never scored, so no group is recorded at the start", () => {
    expect(STARTING_GROUP_SCORING).toBe("NEVER_SCORED");
    expect(startingScoredGroups()).toEqual([]);
    expect(Object.isFrozen(startingScoredGroups())).toBe(true);
  });

  it("OQ-1: the default visibility is OWNER_ONLY and both values are accepted", () => {
    expect(DEFAULT_IDENTITY_VISIBILITY).toBe("OWNER_ONLY");
    expect([...IDENTITY_VISIBILITIES]).toEqual(["OWNER_ONLY", "FACE_UP"]);
  });

  it("the default AI tiers are valid difficulty labels, one per AI seat", () => {
    expect([...DIFFICULTIES]).toEqual(["BEGINNER", "ADVANCED", "EXPERT"]);
    expect(DEFAULT_AI_DIFFICULTIES).toHaveLength(3);
    for (const d of DEFAULT_AI_DIFFICULTIES) expect(DIFFICULTIES).toContain(d);
  });
});

describe("validateGameConfig", () => {
  it("returns a deeply frozen copy that is deeply equal to a valid input", () => {
    const input = JSON.parse(JSON.stringify(defaultConfig())) as unknown;
    const r = validateGameConfig(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual(input);
    expect(r.value).not.toBe(input);
    expect(Object.isFrozen(r.value)).toBe(true);
    expect(Object.isFrozen(r.value.seats)).toBe(true);
    expect(Object.isFrozen(r.value.seats[0])).toBe(true);
    expect(Object.isFrozen(r.value.scoreConfig)).toBe(true);
    expect(Object.isFrozen(r.value.scoreConfig.config)).toBe(true);
    expect(Object.isFrozen(r.value.scoreConfig.config.rewardByError)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
  });

  it("stores a human seat without a difficulty key and an AI seat with one", () => {
    const config = defaultConfig();
    expect("difficulty" in config.seats[0]).toBe(false);
    expect("difficulty" in config.seats[1]).toBe(true);
  });

  it("checks the structure before the score configuration", () => {
    const bad = JSON.parse(JSON.stringify(defaultConfig())) as { seats: unknown[]; scoreConfig: { config: { rewardByError: number[] } } };
    bad.seats = [];
    bad.scoreConfig.config.rewardByError = [];
    const r = validateGameConfig(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVALID_CONFIG");
  });

  it("reports the violated rule in the detail", () => {
    const bad = JSON.parse(JSON.stringify(defaultConfig())) as { seats: { id: string }[] };
    bad.seats[2]!.id = "P1";
    const r = validateGameConfig(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detail).toContain("seats[2].id");
  });
});
