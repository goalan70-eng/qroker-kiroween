// Unit tests for core/state.ts (task 8.1). Requirements 2.2, 3.1, 5.7, 6.1, 8.3, 8.4, 12.1, 12.6.
//
// Covered: the initial state of `newGame` (literal values for seed 1, taken from the golden deal frozen in
// deck.test.ts), the partition of the 52 cards (checked with an independent literal catalog), determinism,
// immutability, `defaultConfig`, and every rejected configuration and seed.
//
// Not covered here: the reducer (task 8.2), reducer properties (task 8.3), views (task 9). The provisional
// policies are tested as stored values only: OQ-1 is a config field, OQ-2 is the board content, OQ-3 is
// "the starting group yields no score, no pending batch and no reveal record".

import { describe, expect, it } from "vitest";
import { cardCount, cellAt, STARTING_POSITIONS } from "./board";
import { isValidMember } from "./fragment-layout";
import { toNotation } from "./geometry";
import { DEV_PLACEHOLDER_SCORE_CONFIG, RULES_VERSION } from "./score";
import { deepFreeze, defaultConfig, newGame } from "./state";
import type { GameState } from "./state";
import type { CardId, GameConfig, PlayerId } from "./types";

const SEATS: readonly PlayerId[] = ["P0", "P1", "P2", "P3"];

// Independent catalog: written out literally, not derived from cards.ts.
const CATALOG: readonly string[] = ["H", "D", "C", "S"].flatMap((suit) =>
  ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].map((rank) => `${suit}-${rank}`),
);

// Golden deal of seed 1 (copied from deck.test.ts, which freezes it against the shuffle).
const SEED_1 = {
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

/** A plain mutable copy of the default configuration, for building invalid variants. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;
const raw = (): Raw => JSON.parse(JSON.stringify(defaultConfig()));
const start = (seed: number, config: unknown = defaultConfig()) => newGame({ seed, config: config as GameConfig });

function ok(seed: number, config: unknown = defaultConfig()): GameState {
  const r = start(seed, config);
  if (!r.ok) throw new Error(`newGame failed: ${r.error.code} ${r.error.detail ?? ""}`);
  return r.value;
}

function boardCards(state: GameState): string[] {
  return state.board.flatMap((cell) => (cell === null ? [] : [cell.card]));
}

function allCards(state: GameState): string[] {
  return [...boardCards(state), ...SEATS.flatMap((s) => state.hands[s]), ...state.deck];
}

describe("initial state of seed 1 (literal expected values)", () => {
  const state = ok(1);

  it("stores the seed, the phase and the turn", () => {
    expect(state.seed).toBe(1);
    expect(state.phase).toBe("PLACEMENT"); // no INIT phase is observable (IC-10)
    expect(state.phase).not.toBe("INIT");
    expect(state.turn).toBe("P0"); // requirement 6.1
  });

  it("puts the neutral cards on D4, E4, D5, E5 in deal order, orientation 0, owner NEUTRAL", () => {
    // initialBoard assigns neutral[i] to STARTING_POSITIONS[i] = D4, E4, D5, E5.
    expect(STARTING_POSITIONS.map(toNotation)).toEqual(["D4", "E4", "D5", "E5"]);
    expect(state.board).toHaveLength(64);
    expect(state.board[3 * 8 + 3]).toEqual({ card: "D-Q", orientation: 0, owner: "NEUTRAL" }); // D4
    expect(state.board[3 * 8 + 4]).toEqual({ card: "S-6", orientation: 0, owner: "NEUTRAL" }); // E4
    expect(state.board[4 * 8 + 3]).toEqual({ card: "D-J", orientation: 0, owner: "NEUTRAL" }); // D5
    expect(state.board[4 * 8 + 4]).toEqual({ card: "H-J", orientation: 0, owner: "NEUTRAL" }); // E5
    expect(cardCount(state.board)).toBe(4);
    const occupied = state.board.flatMap((cell, index) => (cell === null ? [] : [index]));
    expect(occupied).toEqual([27, 28, 35, 36]);
  });

  it("deals 4 cards to each seat in deal order and a 32-card deck with the top last", () => {
    expect(state.hands).toEqual(SEED_1.hands);
    expect(Object.keys(state.hands)).toEqual(["P0", "P1", "P2", "P3"]);
    expect(state.deck).toEqual(SEED_1.deck);
    expect(state.deck).toHaveLength(32);
    expect(state.deck[state.deck.length - 1]).toBe("C-7");
  });

  it("starts with no placements, no scores, nothing pending, nothing revealed and an empty log", () => {
    expect(state.placements).toBe(0);
    expect(state.scores).toEqual({ P0: 0, P1: 0, P2: 0, P3: 0 });
    expect(state.firstPlacementDone).toEqual([]);
    expect(state.scoredGroups).toEqual([]);
    expect(state.revealedCards).toEqual([]);
    expect(state.pending).toBeNull(); // no code is pending at the start
    expect(state.history).toEqual([]);
    expect(state.lastReveal).toBeNull();
    expect(state.bonusAwarded).toBeNull();
    expect(state.log).toEqual([]);
  });

  it("has exactly the fields of the design's GameState", () => {
    expect(Object.keys(state).sort()).toEqual(
      [
        "board", "bonusAwarded", "config", "deck", "firstPlacementDone", "hands", "history", "lastReveal", "log",
        "pending", "phase", "placements", "revealedCards", "scoredGroups", "scores", "seed", "turn",
      ].sort(),
    );
  });

  it("stores a copy of the configuration with the rules version", () => {
    expect(state.config).toEqual(defaultConfig());
    expect(state.config.rulesVersion).toBe(RULES_VERSION);
  });
});

describe("deal partition (independent check)", () => {
  const seeds = [0, 1, 2, 3, 20260601, 123456789, 4294967294, 4294967295, ...Array.from({ length: 40 }, (_, i) => 100 + i)];

  it("holds 20 dealt cards (4 neutral + 4 x 4 hands) and a 32-card deck, 52 distinct catalog cards in total", () => {
    for (const seed of seeds) {
      const state = ok(seed);
      const neutral = boardCards(state);
      expect(neutral, `seed ${seed}`).toHaveLength(4);
      for (const seat of SEATS) expect(state.hands[seat], `seed ${seed} ${seat}`).toHaveLength(4);
      expect(state.deck, `seed ${seed}`).toHaveLength(32);
      const dealt = [...neutral, ...SEATS.flatMap((s) => state.hands[s])];
      expect(dealt, `seed ${seed}`).toHaveLength(20);
      expect(new Set(dealt).size, `seed ${seed}`).toBe(20);
      const all = allCards(state);
      expect(all, `seed ${seed}`).toHaveLength(52);
      expect(new Set(all).size, `seed ${seed}`).toBe(52);
      expect([...all].sort(), `seed ${seed}`).toEqual([...CATALOG].sort());
    }
  });

  it("puts 4 cards on D4, E4, D5, E5 at orientation 0 with owner NEUTRAL, and nothing else on the board", () => {
    for (const seed of seeds) {
      const state = ok(seed);
      expect(cardCount(state.board), `seed ${seed}`).toBe(4);
      for (const [i, pos] of STARTING_POSITIONS.entries()) {
        const cell = cellAt(state.board, pos);
        expect(cell?.owner, `seed ${seed} ${toNotation(pos)}`).toBe("NEUTRAL");
        expect(cell?.orientation, `seed ${seed} ${toNotation(pos)}`).toBe(0);
        expect(cell?.card, `seed ${seed} cell ${i}`).toBeDefined();
      }
      expect(state.board.every((c) => c === null || c.owner === "NEUTRAL")).toBe(true);
    }
  });
});

describe("determinism", () => {
  it("equal options give deeply equal states", () => {
    expect(ok(1)).toEqual(ok(1));
    expect(ok(20260601)).toEqual(ok(20260601));
    expect(JSON.stringify(ok(7))).toBe(JSON.stringify(ok(7)));
  });

  it("different seeds give different deals", () => {
    const a = ok(1);
    const b = ok(2);
    const c = ok(20260601);
    expect(a.seed).not.toBe(b.seed);
    expect(a.hands).not.toEqual(b.hands);
    expect(a.deck).not.toEqual(b.deck);
    expect(a.deck).not.toEqual(c.deck);
  });

  it("the configuration does not change the deal", () => {
    const config = raw();
    config.identityVisibility = "FACE_UP";
    config.seats[1].difficulty = "ADVANCED";
    const a = ok(5);
    const b = ok(5, config);
    expect(b.hands).toEqual(a.hands);
    expect(b.deck).toEqual(a.deck);
    expect(b.board).toEqual(a.board);
    expect(b.config.identityVisibility).toBe("FACE_UP");
  });
});

describe("starting group policy (OQ-3, provisional: never scored, no redeal)", () => {
  it("a new game has no score, no pending batch, no reveal record and no scored group", () => {
    for (const seed of [0, 1, 2, 3, 4, 5, 20260601]) {
      const state = ok(seed);
      expect(state.scores).toEqual({ P0: 0, P1: 0, P2: 0, P3: 0 });
      expect(state.pending).toBeNull();
      expect(state.history).toEqual([]);
      expect(state.lastReveal).toBeNull();
      expect(state.revealedCards).toEqual([]);
      expect(state.scoredGroups).toEqual([]);
      expect(state.phase).toBe("PLACEMENT");
    }
  });

  it("holds even when the four neutral cards happen to form a valid Composite_Code (no redeal, no score)", () => {
    // Independent search: a seed whose neutral cards are valid members of slots TL, TR, BL, BR at orientation 0.
    const slots = ["TL", "TR", "BL", "BR"] as const;
    let found: number | null = null;
    for (let seed = 0; seed < 3000 && found === null; seed++) {
      const neutral = STARTING_POSITIONS.map((p) => cellAt(ok(seed).board, p)?.card as CardId);
      if (neutral.every((card, i) => isValidMember(card, 0, slots[i] as (typeof slots)[number]))) found = seed;
    }
    expect(found, "a seed with a valid starting group exists in 0..2999").not.toBeNull();
    const seed = found as number;
    const state = ok(seed);
    // The deal is unchanged (no redeal): the same seed deals the same cards whatever the quad looks like.
    expect(boardCards(state)).toHaveLength(4);
    expect(state.scores).toEqual({ P0: 0, P1: 0, P2: 0, P3: 0 });
    expect(state.pending).toBeNull();
    expect(state.history).toEqual([]);
    expect(state.lastReveal).toBeNull();
    expect(state.scoredGroups).toEqual([]);
    expect(state.phase).toBe("PLACEMENT");
  });
});

describe("immutability", () => {
  it("returns a deeply frozen state: mutation attempts throw", () => {
    const state = ok(1);
    const mutable = state as unknown as Record<string, unknown>;
    expect(() => {
      mutable.phase = "ENDED";
    }).toThrow(TypeError);
    expect(() => (state.hands.P0 as CardId[]).push("H-A")).toThrow(TypeError);
    expect(() => {
      (state.hands as Record<string, unknown>).P0 = [];
    }).toThrow(TypeError);
    expect(() => (state.deck as CardId[]).pop()).toThrow(TypeError);
    expect(() => (state.log as unknown[]).push({ type: "ACK_REVEAL" })).toThrow(TypeError);
    expect(() => {
      (state.scores as Record<string, number>).P0 = 5;
    }).toThrow(TypeError);
    expect(() => {
      (state.board as unknown[])[0] = null;
    }).toThrow(TypeError);
    expect(() => {
      (state.board[27] as { owner: string }).owner = "P0";
    }).toThrow(TypeError);
    expect(() => {
      (state.config.seats[0] as { name: string }).name = "x";
    }).toThrow(TypeError);
    expect(() => (state.config.scoreConfig.config.rewardByError as number[]).push(1)).toThrow(TypeError);
    expect(() => (state.scoredGroups as string[]).push("x")).toThrow(TypeError);
  });

  it("freezes every object and array of the state recursively", () => {
    const state = ok(1);
    const seen: unknown[] = [];
    const visit = (value: unknown, path: string): void => {
      if (typeof value !== "object" || value === null) return;
      expect(Object.isFrozen(value), path).toBe(true);
      seen.push(value);
      for (const [k, v] of Object.entries(value)) visit(v, `${path}.${k}`);
    };
    visit(state, "state");
    // state, config + seats(1+4) + score config(3), board + 4 cells, hands(1+4), deck, 6 other arrays, scores...
    expect(seen.length).toBeGreaterThanOrEqual(25);
  });

  it("accepts deeply frozen options, does not mutate or freeze them, and keeps no reference to them", () => {
    const frozenConfig = deepFreeze(raw()) as GameConfig;
    const before = JSON.stringify(frozenConfig);
    const state = ok(1, frozenConfig);
    expect(JSON.stringify(frozenConfig)).toBe(before);
    expect(state).toEqual(ok(1));

    const config = raw();
    const options = { seed: 1, config: config as GameConfig };
    const result = newGame(options);
    expect(result.ok).toBe(true);
    expect(Object.isFrozen(options)).toBe(false);
    expect(Object.isFrozen(config)).toBe(false);
    expect(Object.isFrozen(config.seats)).toBe(false);
    expect(Object.isFrozen(config.seats[0])).toBe(false);
    expect(Object.isFrozen(config.scoreConfig.config.rewardByError)).toBe(false);
    expect(JSON.stringify(config)).toBe(before);
    if (!result.ok) return;
    expect(result.value.config).not.toBe(config);
    expect(result.value.config.seats).not.toBe(config.seats);
    expect(result.value.config.scoreConfig.config.rewardByError).not.toBe(config.scoreConfig.config.rewardByError);
  });

  it("does not freeze or change DEV_PLACEHOLDER_SCORE_CONFIG", () => {
    const before = JSON.stringify(DEV_PLACEHOLDER_SCORE_CONFIG);
    defaultConfig();
    ok(1);
    expect(Object.isFrozen(DEV_PLACEHOLDER_SCORE_CONFIG)).toBe(false);
    expect(Object.isFrozen(DEV_PLACEHOLDER_SCORE_CONFIG.config.rewardByError)).toBe(false);
    expect(JSON.stringify(DEV_PLACEHOLDER_SCORE_CONFIG)).toBe(before);
  });

  it("a mutation of one returned state never shows in another game", () => {
    const a = ok(1);
    const b = ok(1);
    expect(a.hands).not.toBe(b.hands);
    expect(a.deck).not.toBe(b.deck);
    expect(a.board).not.toBe(b.board);
  });
});

describe("defaultConfig", () => {
  it("is 1 human (P0) and 3 AI seats (P1 to P3), the placeholder score config and OWNER_ONLY (OQ-1)", () => {
    const config = defaultConfig();
    expect(config.rulesVersion).toBe(RULES_VERSION);
    expect(config.seats.map((s) => s.id)).toEqual(["P0", "P1", "P2", "P3"]);
    expect(config.seats.map((s) => s.kind)).toEqual(["HUMAN", "AI", "AI", "AI"]);
    expect(config.seats[0].difficulty).toBeUndefined();
    for (const seat of config.seats.slice(1)) expect(["BEGINNER", "ADVANCED", "EXPERT"]).toContain(seat.difficulty);
    expect(config.identityVisibility).toBe("OWNER_ONLY");
    expect(config.scoreConfig.id).toBe("DEV_PLACEHOLDER");
    expect(config.scoreConfig.provisional).toBe(true);
    expect(config.scoreConfig).toEqual(DEV_PLACEHOLDER_SCORE_CONFIG);
  });

  it("is valid, returns a new object on every call, and is deeply frozen", () => {
    expect(start(1, defaultConfig()).ok).toBe(true);
    expect(defaultConfig()).not.toBe(defaultConfig());
    expect(defaultConfig()).toEqual(defaultConfig());
    expect(Object.isFrozen(defaultConfig())).toBe(true);
    expect(Object.isFrozen(defaultConfig().seats[1])).toBe(true);
  });
});

describe("identityVisibility is a stored value only (OQ-1)", () => {
  it("accepts both values and stores them without changing anything else", () => {
    for (const visibility of ["OWNER_ONLY", "FACE_UP"]) {
      const config = raw();
      config.identityVisibility = visibility;
      const state = ok(1, config);
      expect(state.config.identityVisibility).toBe(visibility);
      expect({ ...state, config: null }).toEqual({ ...ok(1), config: null });
    }
  });
});

describe("configurations that are accepted", () => {
  it("accepts 4 human seats, AI seats of every tier, any seed from 0 to 4294967295", () => {
    const humans = raw();
    humans.seats = SEATS.map((id) => ({ id, kind: "HUMAN", name: `H${id}` }));
    expect(start(1, humans).ok).toBe(true);
    const tiers = raw();
    tiers.seats[1].difficulty = "BEGINNER";
    tiers.seats[2].difficulty = "ADVANCED";
    tiers.seats[3].difficulty = "EXPERT";
    expect(start(1, tiers).ok).toBe(true);
    expect(start(0).ok).toBe(true);
    expect(start(4294967295).ok).toBe(true);
  });

  it("accepts another valid score configuration and stores a copy of it", () => {
    const config = raw();
    config.scoreConfig = { id: "TEST", provisional: false, config: { rewardByError: [9, 9, 1], handEmptyBonus: 0 } };
    const state = ok(1, config);
    expect(state.config.scoreConfig).toEqual(config.scoreConfig);
  });

  it("ignores unknown extra fields and does not store them", () => {
    const config = raw();
    config.extra = 1;
    config.seats[0].avatar = "x";
    config.seats[1].extra = true;
    config.scoreConfig.note = "n";
    config.scoreConfig.config.extra = 2;
    const state = ok(1, config);
    expect(state.config).toEqual(defaultConfig());
    expect(JSON.stringify(state.config)).not.toContain("extra");
    expect(JSON.stringify(state.config)).not.toContain("avatar");
  });
});

describe("invalid configurations return INVALID_CONFIG and create no game", () => {
  const expectInvalid = (config: unknown, code = "INVALID_CONFIG") => {
    const r = start(1, config);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(code);
      expect(typeof r.error.detail).toBe("string");
    }
  };

  it("rejects 3 seats and 5 seats", () => {
    const three = raw();
    three.seats = three.seats.slice(0, 3);
    expectInvalid(three);
    const five = raw();
    five.seats.push({ id: "P4", kind: "AI", difficulty: "BEGINNER", name: "AI 4" });
    expectInvalid(five);
    const fiveDuplicate = raw();
    fiveDuplicate.seats.push({ id: "P0", kind: "HUMAN", name: "again" });
    expectInvalid(fiveDuplicate);
    const none = raw();
    none.seats = [];
    expectInvalid(none);
  });

  it("rejects a duplicate seat id and a missing seat", () => {
    const duplicate = raw();
    duplicate.seats[2].id = "P1";
    expectInvalid(duplicate);
    const duplicateFirst = raw();
    duplicateFirst.seats[3].id = "P0";
    expectInvalid(duplicateFirst);
    const missing = raw();
    missing.seats[2].id = "P4";
    expectInvalid(missing);
    const unnamedId = raw();
    delete unnamedId.seats[1].id;
    expectInvalid(unnamedId);
  });

  it("rejects seats that are not in the order P0..P3", () => {
    const swapped = raw();
    [swapped.seats[1], swapped.seats[2]] = [swapped.seats[2], swapped.seats[1]];
    expectInvalid(swapped);
  });

  it("rejects seats that are not an array of objects", () => {
    for (const seats of [undefined, null, "P0P1P2P3", 4, {}, { length: 4 }]) {
      const config = raw();
      config.seats = seats;
      expectInvalid(config);
    }
    for (const seat of [null, 3, "P1", []]) {
      const config = raw();
      config.seats[1] = seat;
      expectInvalid(config);
    }
  });

  it("rejects an invalid seat kind, name or difficulty", () => {
    const kind = raw();
    kind.seats[1].kind = "BOT";
    expectInvalid(kind);
    const kindMissing = raw();
    delete kindMissing.seats[1].kind;
    expectInvalid(kindMissing);
    const lower = raw();
    lower.seats[1].kind = "ai";
    expectInvalid(lower);
    for (const difficulty of ["MASTER", "beginner", "", 1, null, undefined]) {
      const config = raw();
      config.seats[1].difficulty = difficulty;
      expectInvalid(config);
    }
    const humanWithDifficulty = raw();
    humanWithDifficulty.seats[0].difficulty = "BEGINNER";
    expectInvalid(humanWithDifficulty);
    for (const name of [undefined, null, 5, {}]) {
      const config = raw();
      config.seats[2].name = name;
      expectInvalid(config);
    }
  });

  it("rejects an invalid identityVisibility", () => {
    for (const value of ["face_up", "FACE-UP", "ALL", "", 1, null, undefined, true]) {
      const config = raw();
      config.identityVisibility = value;
      expectInvalid(config);
    }
    const missing = raw();
    delete missing.identityVisibility;
    expectInvalid(missing);
  });

  it("rejects a rulesVersion other than RULES_VERSION", () => {
    for (const value of [0, RULES_VERSION + 1, -1, 1.5, "1", null, undefined]) {
      const config = raw();
      config.rulesVersion = value;
      expectInvalid(config);
    }
    const missing = raw();
    delete missing.rulesVersion;
    expectInvalid(missing);
  });

  it("rejects a configuration that is not an object", () => {
    for (const config of [null, 5, "config", [], true]) expectInvalid(config);
    const r = newGame({ seed: 1, config: undefined as unknown as GameConfig }); // not via start(): its default would apply
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVALID_CONFIG");
  });

  it("rejects options that are not an object", () => {
    for (const options of [null, undefined, 5, "x"]) {
      const r = newGame(options as unknown as Parameters<typeof newGame>[0]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("INVALID_CONFIG");
    }
  });
});

describe("invalid score configurations return INVALID_SCORE_CONFIG", () => {
  const expectScoreInvalid = (mutate: (c: Raw) => void) => {
    const config = raw();
    mutate(config);
    const r = start(1, config);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("INVALID_SCORE_CONFIG");
      expect(typeof r.error.detail).toBe("string");
    }
  };

  it("rejects an empty table", () => expectScoreInvalid((c) => (c.scoreConfig.config.rewardByError = [])));
  it("rejects a negative value", () => expectScoreInvalid((c) => (c.scoreConfig.config.rewardByError = [3, -1])));
  it("rejects a first value that is not positive", () => expectScoreInvalid((c) => (c.scoreConfig.config.rewardByError = [0, 0])));
  it("rejects a table that increases", () => expectScoreInvalid((c) => (c.scoreConfig.config.rewardByError = [3, 1, 2])));
  it("rejects a value that is not finite", () => {
    expectScoreInvalid((c) => (c.scoreConfig.config.rewardByError = [3, "x"]));
    expectScoreInvalid((c) => (c.scoreConfig.config.rewardByError = [3, null]));
  });
  it("rejects a negative or non-numeric handEmptyBonus", () => {
    expectScoreInvalid((c) => (c.scoreConfig.config.handEmptyBonus = -1));
    expectScoreInvalid((c) => (c.scoreConfig.config.handEmptyBonus = "3"));
    expectScoreInvalid((c) => delete c.scoreConfig.config.handEmptyBonus);
  });
  it("rejects a missing or malformed score configuration", () => {
    expectScoreInvalid((c) => delete c.scoreConfig);
    expectScoreInvalid((c) => (c.scoreConfig = null));
    expectScoreInvalid((c) => (c.scoreConfig = "DEV_PLACEHOLDER"));
    expectScoreInvalid((c) => delete c.scoreConfig.config);
    expectScoreInvalid((c) => (c.scoreConfig.config.rewardByError = "6,4"));
    expectScoreInvalid((c) => delete c.scoreConfig.id);
    expectScoreInvalid((c) => (c.scoreConfig.provisional = "yes"));
    expectScoreInvalid((c) => delete c.scoreConfig.provisional);
  });
  it("a non-finite table value is rejected even though JSON would turn it into null", () => {
    const config = defaultConfig();
    const bad = {
      ...config,
      scoreConfig: { ...config.scoreConfig, config: { rewardByError: [3, Number.NaN], handEmptyBonus: 1 } },
    };
    const r = start(1, bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVALID_SCORE_CONFIG");
  });
});

describe("invalid seeds return INVALID_CONFIG and create no game", () => {
  it("rejects values that are not integers in 0..4294967295", () => {
    for (const seed of [-1, 1.5, Number.NaN, Infinity, -Infinity, 4294967296, 2 ** 53, -0.5, 1e21]) {
      const r = start(seed);
      expect(r.ok, String(seed)).toBe(false);
      if (!r.ok) expect(r.error.code, String(seed)).toBe("INVALID_CONFIG");
    }
  });

  it("rejects values that are not numbers (no coercion)", () => {
    for (const seed of ["1", "", null, undefined, true, {}, [1], 1n]) {
      const r = newGame({ seed: seed as unknown as number, config: defaultConfig() });
      expect(r.ok, String(seed)).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("INVALID_CONFIG");
    }
  });

  it("reports an invalid configuration before an invalid seed", () => {
    const config = raw();
    config.seats = [];
    const r = start(-1, config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVALID_CONFIG");
    const scoreBad = raw();
    scoreBad.scoreConfig.config.rewardByError = [];
    const s = start(-1, scoreBad);
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.error.code).toBe("INVALID_SCORE_CONFIG");
  });
});
