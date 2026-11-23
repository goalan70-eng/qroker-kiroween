// Tests of the ADVANCED strategy (task 12.3): placement scoring by quads, the hidden-member probability, the
// conditional-mean Guess, tie-breaking, legality against the engine, determinism, budget and registry.
//
// Test files may import any core module. The production strategy is checked against INDEPENDENT constructions:
// - validity is judged by a LITERAL table written in this file (suit x orientation -> valid slots), never by
//   fragment-layout.ts;
// - Card_Values come from a literal rank table, not from cards.ts;
// - "completes a code" is computed by a brute-force quad scan written here, and cross-checked with the engine's own
//   `reduce` (a completing placement opens a GUESS_COLLECT batch with that many pending codes);
// - acceptance of every action is judged by `reduce`.
//
// Synthetic views (`syntheticView`) are plain PlayerView objects with a hand-chosen board and unseen pool. They are
// used for the exact-arithmetic unit tests; the reachable-state tests use `viewFor` of real engine states.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { legalCells } from "../core/board";
import { ALL_CARDS } from "../core/cards";
import { actingSeats, reduce } from "../core/engine";
import { mix32, mulberry32 } from "../core/prng";
import { GUESS_MAX, GUESS_MIN } from "../core/score";
import { defaultConfig, newGame } from "../core/state";
import type { GameState } from "../core/state";
import { arbHiddenPerturbation } from "../core/testing/perturb";
import { boardOf, conservationProblem, makeState } from "../core/testing/state-fixtures";
import { playToEnd } from "../core/testing/state-generators";
import type { PlayStyle } from "../core/testing/state-generators";
import { SEATS } from "../core/turn";
import type { Action, CardId, GameConfig, IdentityVisibility, Orientation, Owner, PlayerId, Slot } from "../core/types";
import { unseenCards, viewFor } from "../core/view";
import type { CellView, PlayerView } from "../core/view";
import {
  ADVANCED_STRATEGY,
  MIDDLE_CARD_VALUE,
  SCORE_EPSILON,
  W_COMPLETE,
  W_PARTIAL,
  WORK_BUDGET,
  bestCandidates,
  estimateQuadSum,
  evaluatePlacements,
  expectedQuadSum,
  scoreCandidate,
  validFraction,
  validityTable,
} from "./heuristic";
import type { QuadMember } from "./heuristic";
import { BEGINNER_STRATEGY } from "./random";
import { getStrategy } from "./registry";
import { enumeratePlacements } from "./strategy";
import type { PlacementCandidate } from "./strategy";

type Place = Extract<Action, { type: "PLACE" }>;

const choosePlacement = (view: PlayerView, seed: number): Place => ADVANCED_STRATEGY.choosePlacement(view, { decisionSeed: seed });
const chooseGuesses = (view: PlayerView, seed = 0): Extract<Action, { type: "SUBMIT_GUESSES" }> =>
  ADVANCED_STRATEGY.chooseGuesses(view, { decisionSeed: seed });

const seedAt = (i: number, salt = 0x5eed): number => mix32(salt, i);
const every = <T>(items: readonly T[], stride: number): T[] => items.filter((_, i) => i % stride === 0);
const accepted = (state: GameState, action: Action): boolean => reduce(state, action).ok;

// ---------------------------------------------------------------------------------------------------------
// Independent literal tables
// ---------------------------------------------------------------------------------------------------------

/** Valid slots per suit and orientation, derived by hand from the layout rule (inward corner is a printed corner). */
const VALID_SLOTS: Readonly<Record<string, readonly Slot[]>> = {
  H0: ["TL", "BR"],
  H180: ["TL", "BR"],
  D0: ["TR", "BL"],
  D180: ["TR", "BL"],
  C0: ["TL", "BL"],
  C180: ["TR", "BR"],
  S0: ["TR", "BR"],
  S180: ["TL", "BL"],
};
const SLOT_NAMES: readonly Slot[] = ["TL", "TR", "BL", "BR"];
const ORIENTATION_LIST: readonly Orientation[] = [0, 180];
const SUIT_LIST = ["H", "D", "C", "S"] as const;

const validLiteral = (card: string, orientation: Orientation, slot: Slot): boolean =>
  (VALID_SLOTS[`${card.charAt(0)}${orientation}`] as readonly Slot[]).includes(slot);

const RANK_VALUE: Readonly<Record<string, number>> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
};
const valueLiteral = (card: string): number => RANK_VALUE[card.slice(2)] as number;

interface BoardSlot {
  readonly card: string;
  readonly orientation: Orientation;
}

/** Brute force: how many quads of 2x2 containing (row, col) are complete and valid after the placement. */
function completedCodes(board: readonly (BoardSlot | null)[], row: number, col: number, card: string, orientation: Orientation): number {
  let count = 0;
  for (let r0 = row - 1; r0 <= row; r0++) {
    for (let c0 = col - 1; c0 <= col; c0++) {
      if (r0 < 0 || c0 < 0 || r0 > 6 || c0 > 6) continue;
      let ok = true;
      for (let i = 0; i < 4 && ok; i++) {
        const r = r0 + (i >> 1);
        const c = c0 + (i & 1);
        const here: BoardSlot | null = r === row && c === col ? { card, orientation } : (board[r * 8 + c] ?? null);
        ok = here !== null && validLiteral(here.card, here.orientation, SLOT_NAMES[i] as Slot);
      }
      if (ok) count++;
    }
  }
  return count;
}

const codesOf = (state: GameState, a: Place): number => completedCodes(state.board, a.pos.row, a.pos.col, a.card, a.orientation);

// ---------------------------------------------------------------------------------------------------------
// Synthetic views
// ---------------------------------------------------------------------------------------------------------

interface SynCell {
  readonly at: string;
  /** `null` = hidden identity. */
  readonly card: CardId | null;
  readonly orientation?: Orientation;
  readonly owner?: Owner;
}

const at = (notation: string): { row: number; col: number } => ({ row: Number(notation.charAt(1)) - 1, col: notation.charCodeAt(0) - 65 });

/**
 * A PlayerView with the given board cells. The unseen pool is `pool` when given (the hand is then every card that
 * is neither in the pool nor visible on the board), else the hand is `hand` and the pool is what remains.
 */
function syntheticView(cells: readonly SynCell[], options: { pool?: readonly CardId[]; hand?: readonly CardId[] } = {}): PlayerView {
  const base = viewFor(makeState({}), "P0");
  const board: (CellView | null)[] = new Array<CellView | null>(64).fill(null);
  const visible = new Set<CardId>();
  for (const cell of cells) {
    const p = at(cell.at);
    board[p.row * 8 + p.col] = { owner: cell.owner ?? "P1", orientation: cell.orientation ?? 0, card: cell.card };
    if (cell.card !== null) visible.add(cell.card);
  }
  const hand =
    options.pool !== undefined
      ? ALL_CARDS.filter((card) => !(options.pool as readonly CardId[]).includes(card) && !visible.has(card))
      : [...(options.hand ?? [])];
  return { ...base, board, myHand: hand };
}

const cand = (card: CardId, notation: string, orientation: Orientation = 0): PlacementCandidate => ({ card, pos: at(notation), orientation });

/** The 8-card pool of the hand-counted fixtures: H x3, D x1, C x1, S x3. */
const POOL8: readonly CardId[] = ["H-2", "H-3", "H-4", "D-5", "C-6", "S-7", "S-8", "S-9"];

// ---------------------------------------------------------------------------------------------------------
// Corpus of reachable states (30 complete games, fixed seeds, both visibility modes)
// ---------------------------------------------------------------------------------------------------------

const GAME_COUNT = 30;
const BIASES = [5, 30, 60, 90] as const;

interface Sample {
  readonly state: GameState;
  readonly seat: PlayerId;
  readonly visibility: IdentityVisibility;
  readonly game: number;
}

const placementSamples: Sample[] = [];
const guessSamples: Sample[] = [];

function buildCorpus(): void {
  // Include a reachable all-visible OWNER_ONLY guess.
  for (const g of [...Array.from({ length: GAME_COUNT }, (_, i) => i), 410]) {
    const visibility: IdentityVisibility = g % 2 === 0 ? "OWNER_ONLY" : "FACE_UP";
    const config: GameConfig = { ...defaultConfig(), identityVisibility: visibility };
    const style: PlayStyle = { codeBias: BIASES[g % BIASES.length] as number, submitOrder: g % 3 === 0 ? "RANDOM" : "SEAT_ORDER" };
    const rng = mulberry32(seedAt(g, 0xc0ffee));
    const choices = Array.from({ length: 600 }, () => Math.floor(rng() * 1_000_000));
    const game = playToEnd(2000 + g, config, choices, style);
    for (const state of game.states) {
      if (state.phase === "PLACEMENT") placementSamples.push({ state, seat: state.turn, visibility, game: g });
      if (state.phase === "GUESS_COLLECT") {
        for (const seat of actingSeats(state)) guessSamples.push({ state, seat, visibility, game: g });
      }
    }
  }
}
buildCorpus();

// ---------------------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------------------

/**
 * Before the placement of the random.test.ts two-code fixture: P0 holds H-A, S-2, C-3. H-A at G4 (row 3, col 6) is
 * the BR member of the quad F3 (H-2, D-3, D-4) and the TL member of the quad G4 (D-5, D-6, H-7): two codes.
 */
function twoCodeStart(visibility: IdentityVisibility): GameState {
  const config: GameConfig = { ...defaultConfig(), identityVisibility: visibility };
  const board = boardOf([
    { at: "F3", card: "H-2", owner: "P1" },
    { at: "G3", card: "D-3", owner: "P2" },
    { at: "F4", card: "D-4", owner: "P3" },
    { at: "H4", card: "D-5", owner: "P1" },
    { at: "G5", card: "D-6", owner: "P2" },
    { at: "H5", card: "H-7", owner: "P3" },
  ]);
  return makeState({ config, board, hands: { P0: ["H-A", "S-2", "C-3"] }, turn: "P0" });
}

function afterPlacement(state: GameState, action: Place): GameState {
  const result = reduce(state, action);
  if (!result.ok) throw new Error(`fixture rejected: ${result.error.code}`);
  return result.value;
}

/** P0 owns E3 H-2, F3 D-3 and (after the placement of H-4 at F4) the BR card; E4 is the neutral D-K (valid at BL). */
function ownCodeStart(visibility: IdentityVisibility): GameState {
  const config: GameConfig = { ...defaultConfig(), identityVisibility: visibility };
  const board = boardOf([
    { at: "E3", card: "H-2", owner: "P0" },
    { at: "F3", card: "D-3", owner: "P0" },
  ]);
  return makeState({ config, board, hands: { P0: ["H-4", "S-2", "C-3"] }, turn: "P0" });
}
const OWN_CODE_PLACE: Place = { type: "PLACE", player: "P0", card: "H-4", pos: { row: 3, col: 5 }, orientation: 0 };

// ---------------------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------------------

describe("named constants", () => {
  it("keeps the ordering the design states and the structural constraint used for full information", () => {
    expect(W_PARTIAL).toHaveLength(4);
    expect(W_PARTIAL[0]).toBe(0);
    expect(W_PARTIAL[1]).toBe(0);
    expect(W_PARTIAL[2]).toBeGreaterThan(0);
    expect(W_PARTIAL[3]).toBeGreaterThanOrEqual(W_PARTIAL[2] as number);
    expect(W_COMPLETE).toBeGreaterThan(W_PARTIAL[3] as number);
    // a placement lies in at most 4 quads: no set of partial quads can outscore one completed quad
    expect(W_COMPLETE).toBeGreaterThan(4 * (W_PARTIAL[3] as number));
    expect(Object.isFrozen(W_PARTIAL)).toBe(true);
    expect(SCORE_EPSILON).toBeLessThan(1e-6);
    expect(MIDDLE_CARD_VALUE).toBe(7);
  });

  it("WORK_BUDGET is at least the hard bound of the game: 48 hand cards x 60 legal cells x 2 orientations", () => {
    expect(WORK_BUDGET).toBeGreaterThanOrEqual(48 * 60 * 2);
    expect(Number.isInteger(WORK_BUDGET)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Hidden-member validity (tests 3 and 4)
// ---------------------------------------------------------------------------------------------------------

describe("validity probability of a hidden member", () => {
  it("equals the hand-counted fraction on the 8-card pool (H x3, D x1, C x1, S x3), for every slot and orientation", () => {
    // counted by hand with the literal table: valid suits per (orientation, slot) and their card counts
    const expected: Readonly<Record<Orientation, Readonly<Record<Slot, number>>>> = {
      0: { TL: 4 / 8, TR: 4 / 8, BL: 2 / 8, BR: 6 / 8 }, // TL: H+C0  TR: D+S0  BL: D+C0  BR: H+S0
      180: { TL: 6 / 8, TR: 2 / 8, BL: 4 / 8, BR: 4 / 8 }, // TL: H+S180  TR: D+C180  BL: D+S180  BR: H+C180
    };
    const view = syntheticView([{ at: "D4", card: "H-K", owner: "NEUTRAL" }], { pool: POOL8 });
    expect(unseenCards(view)).toEqual(POOL8);
    const table = validityTable(view);
    for (const o of ORIENTATION_LIST) {
      for (const s of SLOT_NAMES) {
        expect(table[o][s], `${o} ${s}`).toBe(expected[o][s]);
        expect(validFraction(POOL8, o, s), `${o} ${s}`).toBe(expected[o][s]);
      }
    }
  });

  it("matches the literal table for every suit, slot and orientation (a 13-card single-suit pool gives 1 or 0)", () => {
    for (const suit of SUIT_LIST) {
      const pool = ALL_CARDS.filter((card) => card.startsWith(`${suit}-`));
      expect(pool).toHaveLength(13);
      for (const o of ORIENTATION_LIST) {
        for (const s of SLOT_NAMES) {
          expect(validFraction(pool, o, s), `${suit} ${o} ${s}`).toBe(validLiteral(`${suit}-A`, o, s) ? 1 : 0);
        }
      }
    }
  });

  it("is 1/2 for every slot and orientation over the full 52-card pool, and each suit is valid in exactly two slots", () => {
    for (const o of ORIENTATION_LIST) for (const s of SLOT_NAMES) expect(validFraction(ALL_CARDS, o, s)).toBe(0.5);
    for (const suit of SUIT_LIST) for (const o of ORIENTATION_LIST) expect(SLOT_NAMES.filter((s) => validLiteral(`${suit}-A`, o, s))).toHaveLength(2);
  });

  it("is 0 (never NaN) for an empty pool and when no pool card is compatible", () => {
    expect(validFraction([], 0, "TL")).toBe(0);
    const empty = syntheticView([{ at: "D4", card: "H-K", owner: "NEUTRAL" }], { pool: [] });
    expect(unseenCards(empty)).toEqual([]);
    for (const o of ORIENTATION_LIST) for (const s of SLOT_NAMES) expect(validityTable(empty)[o][s]).toBe(0);
    // an all-hearts pool has no card valid for slot TR at any orientation
    const hearts = ALL_CARDS.filter((card) => card.startsWith("H-"));
    expect(validFraction(hearts, 0, "TR")).toBe(0);
    expect(validFraction(hearts, 180, "TR")).toBe(0);
    // a quad that needs a hidden TR member is worth 0 then, and the score is a finite number
    const view = syntheticView(
      [
        { at: "F3", card: "H-2" },
        { at: "G3", card: null, owner: "P2" },
        { at: "F4", card: "D-4" },
      ],
      { pool: hearts.filter((card) => card !== "H-2") },
    );
    const score = scoreCandidate(view, cand("H-A", "G4"));
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Placement scoring (tests 1, 2, 3, 5, 6)
// ---------------------------------------------------------------------------------------------------------

describe("scoreCandidate: exact quad arithmetic on constructed views", () => {
  it("(3) a hidden member scales a completed quad by its validity probability: 100 x 4/8 = 50", () => {
    // F3 hidden (o0, slot TL: 4/8), G3 D-3 (TR valid), F4 D-4 (BL valid), H-A placed at G4 (BR valid, F3 quad).
    // The other quads of G4 are dead or hold one card: G3 quad (G3 D-3 invalid at TL), F4 quad (D-4 invalid at TL).
    const view = syntheticView(
      [
        { at: "F3", card: null },
        { at: "G3", card: "D-3" },
        { at: "F4", card: "D-4" },
      ],
      { pool: POOL8 },
    );
    expect(scoreCandidate(view, cand("H-A", "G4"))).toBe(W_COMPLETE * (4 / 8));
    expect(scoreCandidate(view, cand("H-A", "G4"))).toBe(50);
  });

  it("(3) two hidden members multiply: 100 x (4/8) x (4/8) = 25; a 180-degree hidden member uses its own row", () => {
    const two = syntheticView(
      [
        { at: "F3", card: null }, // o0 TL: 4/8
        { at: "G3", card: null }, // o0 TR: 4/8
        { at: "F4", card: "D-4" },
      ],
      { pool: POOL8 },
    );
    expect(scoreCandidate(two, cand("H-A", "G4"))).toBe(25);
    const turned = syntheticView(
      [
        { at: "F3", card: null, orientation: 180 }, // o180 TL: 6/8
        { at: "G3", card: "D-3" },
        { at: "F4", card: "D-4" },
      ],
      { pool: POOL8 },
    );
    expect(scoreCandidate(turned, cand("H-A", "G4"))).toBe(75);
  });

  it("(2) a fully visible invalid member makes its quad worth 0: the same quad is 100 with a valid member", () => {
    const valid = syntheticView([
      { at: "F3", card: "H-2" },
      { at: "G3", card: "D-3" },
      { at: "F4", card: "D-4" },
    ]);
    expect(scoreCandidate(valid, cand("H-A", "G4"))).toBe(W_COMPLETE);
    // D-2 at TL is invalid: a diamond is valid only at TR and BL
    expect(validLiteral("D-2", 0, "TL")).toBe(false);
    const invalid = syntheticView([
      { at: "F3", card: "D-2" },
      { at: "G3", card: "D-3" },
      { at: "F4", card: "D-4" },
    ]);
    expect(scoreCandidate(invalid, cand("H-A", "G4"))).toBe(0);
    // an invalid PLACED card kills the quad too: S-2 at orientation 180 is invalid at BR (S180 is valid at TL, BL)
    expect(validLiteral("S-2", 180, "BR")).toBe(false);
    expect(scoreCandidate(valid, cand("S-2", "G4", 180))).toBe(0);
    // a dead region with a hidden member stays dead: probability does not matter when a visible member is invalid
    const deadHidden = syntheticView(
      [
        { at: "F3", card: "D-2" },
        { at: "G3", card: null },
        { at: "F4", card: "D-4" },
      ],
      { pool: POOL8 },
    );
    expect(scoreCandidate(deadHidden, cand("H-A", "G4"))).toBe(0);
  });

  it("(6) partial regions: k occupied after the placement gives W_PARTIAL[k] with probability 1, and 3 >= 2", () => {
    // corner cell A1 has exactly one quad (A1, B1, A2, B2); the new H-A at A1 is valid at TL
    const two = syntheticView([{ at: "B1", card: "D-3" }]); // TR valid
    const three = syntheticView([
      { at: "B1", card: "D-3" },
      { at: "A2", card: "D-4" }, // BL valid
    ]);
    const four = syntheticView([
      { at: "B1", card: "D-3" },
      { at: "A2", card: "D-4" },
      { at: "B2", card: "H-7" }, // BR valid
    ]);
    const alone = syntheticView([{ at: "H8", card: "D-3" }]);
    expect(scoreCandidate(alone, cand("H-A", "A1"))).toBe(0); // k = 1: nothing but the new card
    expect(scoreCandidate(two, cand("H-A", "A1"))).toBe(W_PARTIAL[2]);
    expect(scoreCandidate(three, cand("H-A", "A1"))).toBe(W_PARTIAL[3]);
    expect(scoreCandidate(four, cand("H-A", "A1"))).toBe(W_COMPLETE);
    expect(scoreCandidate(three, cand("H-A", "A1"))).toBeGreaterThanOrEqual(scoreCandidate(two, cand("H-A", "A1")));
    expect(scoreCandidate(four, cand("H-A", "A1"))).toBeGreaterThan(scoreCandidate(three, cand("H-A", "A1")));
    // an invalid placed card in a partial region is worth 0 (S-2 at 0 is invalid at TL)
    expect(validLiteral("S-2", 0, "TL")).toBe(false);
    expect(scoreCandidate(three, cand("S-2", "A1", 0))).toBe(0);
  });

  it("(6) a partial region with a hidden member is W_PARTIAL[k] x its probability: 15 x 2/8 = 3.75", () => {
    const view = syntheticView(
      [
        { at: "B1", card: "D-3" },
        { at: "A2", card: null }, // o0 BL: 2/8 in POOL8
      ],
      { pool: POOL8 },
    );
    expect(scoreCandidate(view, cand("H-A", "A1"))).toBe((W_PARTIAL[3] as number) * (2 / 8));
    expect(scoreCandidate(view, cand("H-A", "A1"))).toBe(3.75);
  });

  it("(5) a candidate that completes two valid codes scores 2 x W_COMPLETE, more than one that completes one", () => {
    const state = twoCodeStart("FACE_UP");
    const view = viewFor(state, "P0");
    const gg = { row: 3, col: 6 };
    const two = scoreCandidate(view, { card: "H-A", pos: gg, orientation: 0 });
    const one = scoreCandidate(view, { card: "S-2", pos: gg, orientation: 0 }); // F3 only (S0 valid at BR, invalid at TL)
    expect(two).toBe(2 * W_COMPLETE);
    expect(one).toBe(W_COMPLETE);
    expect(two).toBeGreaterThan(one);
    // the engine agrees about the number of codes each placement forms
    const pendingCodes = (card: CardId, o: Orientation): number => {
      const next = afterPlacement(state, { type: "PLACE", player: "P0", card, pos: gg, orientation: o });
      return next.pending?.codes.length ?? 0;
    };
    expect(pendingCodes("H-A", 0)).toBe(2);
    expect(pendingCodes("S-2", 0)).toBe(1);
    expect(pendingCodes("C-3", 0)).toBe(1); // G4 only
    expect(codesOf(state, { type: "PLACE", player: "P0", card: "H-A", pos: gg, orientation: 0 })).toBe(2);
    expect(codesOf(state, { type: "PLACE", player: "P0", card: "S-2", pos: gg, orientation: 0 })).toBe(1);
  });
});

describe("(1) ADVANCED completes a valid code when it can (full information)", () => {
  it("the two-code fixture: every seed picks a placement that forms two codes, and the engine confirms it", () => {
    const state = twoCodeStart("FACE_UP");
    const view = viewFor(state, "P0");
    const best = Math.max(...enumeratePlacements(view).map((c) => completedCodes(state.board, c.pos.row, c.pos.col, c.card, c.orientation)));
    expect(best).toBe(2);
    const chosenKeys = new Set<string>();
    for (let k = 0; k < 120; k++) {
      const action = choosePlacement(view, seedAt(k, 1));
      expect(codesOf(state, action)).toBe(2);
      const next = afterPlacement(state, action);
      expect(next.phase).toBe("GUESS_COLLECT");
      expect(next.pending?.codes.map((c) => c.quadKey)).toEqual(["F3", "G4"]);
      chosenKeys.add(`${action.card}@${action.pos.row},${action.pos.col}/${action.orientation}`);
    }
    // H-A at G4 with orientation 0 or 180 are the two tied maxima; both occur
    expect([...chosenKeys].sort()).toEqual(["H-A@3,6/0", "H-A@3,6/180"]);
  });

  it("alternatives exist: most legal placements of the fixture complete nothing", () => {
    const state = twoCodeStart("FACE_UP");
    const view = viewFor(state, "P0");
    const all = enumeratePlacements(view);
    const completing = all.filter((c) => completedCodes(state.board, c.pos.row, c.pos.col, c.card, c.orientation) > 0);
    expect(completing.length).toBeGreaterThanOrEqual(5);
    expect(all.length - completing.length).toBeGreaterThan(50);
  });

  it("over the FACE_UP corpus the chosen placement forms as many codes as the best candidate, never fewer (brute force)", () => {
    const samples = every(
      placementSamples.filter((s) => s.visibility === "FACE_UP"),
      2,
    );
    let withCompletion = 0;
    let withTwo = 0;
    for (const [i, s] of samples.entries()) {
      const view = viewFor(s.state, s.seat);
      const counts = enumeratePlacements(view).map((c) => completedCodes(s.state.board, c.pos.row, c.pos.col, c.card, c.orientation));
      const best = Math.max(...counts);
      if (best >= 1) withCompletion++;
      if (best >= 2) withTwo++;
      for (const salt of [1, 2]) {
        const action = choosePlacement(view, seedAt(i, salt));
        expect(codesOf(s.state, action), `game ${s.game} ${JSON.stringify(action)}`).toBe(best);
      }
    }
    // OBSERVED guard: random play offers a completing placement in some states and two codes in few
    expect(withCompletion).toBeGreaterThanOrEqual(10);
    expect(samples.length).toBeGreaterThanOrEqual(250);
    // eslint-disable-next-line no-console
    console.log(`[12.3 completion] FACE_UP states ${samples.length}: a completing placement exists in ${withCompletion}, two codes in ${withTwo}`);
  });

  it("the brute-force code count equals the engine's pending-code count for every candidate of 12 reachable states", () => {
    for (const s of every(
      placementSamples.filter((x) => enumeratePlacements(viewFor(x.state, x.seat)).length > 0),
      Math.floor(placementSamples.length / 12),
    ).slice(0, 12)) {
      for (const c of enumeratePlacements(viewFor(s.state, s.seat))) {
        const action: Place = { type: "PLACE", player: s.seat, card: c.card, pos: c.pos, orientation: c.orientation };
        const result = reduce(s.state, action);
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        const pending = result.value.phase === "GUESS_COLLECT" ? (result.value.pending?.codes.length ?? 0) : 0;
        expect(pending, `game ${s.game} ${JSON.stringify(action)}`).toBe(codesOf(s.state, action));
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// Guess estimation (tests 7, 8, 9)
// ---------------------------------------------------------------------------------------------------------

const member = (card: CardId | null, orientation: Orientation, slot: Slot): QuadMember => ({ card, orientation, slot });

describe("estimateQuadSum: conditional mean of the valid unseen cards, hand-calculated", () => {
  it("(8) known 5 + 2, hidden TR (o0) mean of {D-3, S-9, S-Q} = 8, hidden BR (o180) mean of {H-8, C-4} = 6: 21", () => {
    const pool: CardId[] = ["D-3", "S-9", "S-Q", "C-4", "H-8"];
    // TR at o0 is valid for D (3), S (9), S-Q (12) and not for C-4 (C0 is valid at TL, BL) or H-8
    // BR at o180 is valid for H-8 (8) and C-4 (4, C180 is valid at TR, BR) and not for D or S
    const members = [member("H-5", 0, "TL"), member(null, 0, "TR"), member("D-2", 0, "BL"), member(null, 180, "BR")];
    expect(expectedQuadSum(members, pool)).toBe(5 + 2 + 8 + 6);
    expect(estimateQuadSum(members, pool)).toBe(21);
  });

  it("(8) an exact .5 rounds UP: 7 + 3.5 + 4 = 14.5 gives 15", () => {
    const pool: CardId[] = ["D-3", "S-4", "C-4"]; // hidden TR o0: D-3 and S-4, mean 3.5; hidden BR o180: C-4 only, mean 4
    const members = [member("H-5", 0, "TL"), member(null, 0, "TR"), member("D-2", 0, "BL"), member(null, 180, "BR")];
    expect(expectedQuadSum(members, pool)).toBe(14.5);
    expect(estimateQuadSum(members, pool)).toBe(15);
  });

  it("(8) rounds to the nearest integer below and above a half: 12.33 gives 12, 12.67 gives 13", () => {
    const lowPool: CardId[] = ["D-A", "S-A", "D-2", "C-4"]; // TR o0 valid: D-A, S-A, D-2 -> (1+1+2)/3; BR o180: C-4
    const highPool: CardId[] = ["D-A", "D-2", "S-2", "C-4"]; // (1+2+2)/3
    const members = [member("H-5", 0, "TL"), member(null, 0, "TR"), member("D-2", 0, "BL"), member(null, 180, "BR")];
    expect(expectedQuadSum(members, lowPool)).toBeCloseTo(7 + 4 / 3 + 4, 12);
    expect(estimateQuadSum(members, lowPool)).toBe(12);
    expect(expectedQuadSum(members, highPool)).toBeCloseTo(7 + 5 / 3 + 4, 12);
    expect(estimateQuadSum(members, highPool)).toBe(13);
  });

  it("(8) hits the bounds exactly: four aces give 4 and four kings give 52 (the clamp is a no-op safeguard)", () => {
    const aces: CardId[] = ["H-A", "D-A", "C-A", "S-A"];
    const kings: CardId[] = ["H-K", "D-K", "C-K", "S-K"];
    expect(estimateQuadSum(SLOT_NAMES.map((s) => member(null, 0, s)), ["H-A", "D-A", "C-A", "S-A"])).toBeGreaterThanOrEqual(GUESS_MIN);
    expect(estimateQuadSum([member("H-A", 0, "TL"), member("D-A", 0, "TR"), member("C-A", 0, "BL"), member("S-A", 0, "BR")], [])).toBe(4);
    expect(estimateQuadSum([member("H-K", 0, "TL"), member("D-K", 0, "TR"), member("C-K", 0, "BL"), member("S-K", 0, "BR")], [])).toBe(52);
    expect(estimateQuadSum(SLOT_NAMES.map((s) => member(null, 0, s)), kings)).toBeLessThanOrEqual(GUESS_MAX);
    expect(estimateQuadSum(SLOT_NAMES.map((s) => member(null, 0, s)), aces)).toBeGreaterThanOrEqual(GUESS_MIN);
    // every pool of real cards stays inside the range: all-hidden members over several pools
    for (const pool of [ALL_CARDS, POOL8, aces, kings]) {
      for (const o of ORIENTATION_LIST) {
        const g = estimateQuadSum(SLOT_NAMES.map((s) => member(null, o, s)), pool);
        expect(Number.isInteger(g) && g >= GUESS_MIN && g <= GUESS_MAX).toBe(true);
      }
    }
  });

  it("(8) fallbacks: no compatible card means the mean of the whole pool; an empty pool means the middle value 7", () => {
    // hearts are not valid at TR: the hidden TR member falls back to the mean of {H-2, H-4} = 3
    expect(expectedQuadSum([member(null, 0, "TR")], ["H-2", "H-4"])).toBe(3);
    expect(estimateQuadSum([member("H-A", 0, "TL"), member(null, 0, "TR"), member("D-4", 0, "BL"), member("H-5", 0, "BR")], ["H-2", "H-4"])).toBe(1 + 3 + 4 + 5);
    expect(expectedQuadSum([member(null, 0, "TR")], [])).toBe(MIDDLE_CARD_VALUE);
    expect(estimateQuadSum(SLOT_NAMES.map((s) => member(null, 0, s)), [])).toBe(28);
    // no NaN, ever
    expect(Number.isNaN(expectedQuadSum(SLOT_NAMES.map((s) => member(null, 180, s)), []))).toBe(false);
  });

  it("(7) all four visible: the estimate is exactly the Hidden_Sum from the literal rank table, whatever the pool", () => {
    const codes: readonly [CardId, CardId, CardId, CardId][] = [
      ["H-2", "D-3", "D-4", "H-A"],
      ["H-K", "D-K", "C-K", "S-K"],
      ["H-10", "D-J", "C-Q", "S-9"],
    ];
    for (const cards of codes) {
      const members = cards.map((card, i) => member(card, 0, SLOT_NAMES[i] as Slot));
      const sum = cards.reduce((n, card) => n + valueLiteral(card), 0);
      for (const pool of [[], POOL8, ALL_CARDS] as CardId[][]) {
        expect(estimateQuadSum(members, pool)).toBe(sum);
        expect(expectedQuadSum(members, pool)).toBe(sum);
      }
    }
  });
});

describe("chooseGuesses on engine states", () => {
  it("(7)(9) FACE_UP two-code batch: every seat's Guess is the exact Hidden_Sum of each code (10 and 19)", () => {
    const state = afterPlacement(twoCodeStart("FACE_UP"), { type: "PLACE", player: "P0", card: "H-A", pos: { row: 3, col: 6 }, orientation: 0 });
    for (const seat of SEATS) {
      const action = chooseGuesses(viewFor(state, seat));
      // F3: H-2 + D-3 + D-4 + H-A = 2 + 3 + 4 + 1; G4: H-A + D-5 + D-6 + H-7 = 1 + 5 + 6 + 7
      expect(action).toEqual({ type: "SUBMIT_GUESSES", player: seat, guesses: { F3: 10, G4: 19 } });
      expect(accepted(state, action)).toBe(true);
    }
    for (const code of state.pending?.codes ?? []) expect(code.hiddenSum).toBe(code.quadKey === "F3" ? 10 : 19);
  });

  it("(7) OWNER_ONLY, all four cards visible to the viewer (own cards plus a neutral card): the exact sum 22", () => {
    const state = afterPlacement(ownCodeStart("OWNER_ONLY"), OWN_CODE_PLACE);
    expect(state.pending?.codes.map((c) => c.quadKey)).toEqual(["E3"]);
    // E3 H-2 + F3 D-3 + E4 D-K (neutral, 13) + F4 H-4 = 2 + 3 + 13 + 4
    const view = viewFor(state, "P0");
    expect(view.board.filter((c) => c !== null && c.card === null)).toHaveLength(0);
    expect(chooseGuesses(view).guesses).toEqual({ E3: 22 });
    expect(state.pending?.codes[0]?.hiddenSum).toBe(22);
    expect(accepted(state, chooseGuesses(view))).toBe(true);
  });

  it("(8)(9) OWNER_ONLY, another seat sees three hidden members: the hand-calculated conditional mean", () => {
    const state = afterPlacement(ownCodeStart("OWNER_ONLY"), OWN_CODE_PLACE);
    const view = viewFor(state, "P1");
    // independent pool: all cards minus P1's hand minus the four visible neutral cards
    const known = new Set<string>([...view.myHand, "H-K", "D-K", "C-K", "S-K"]);
    const pool = ALL_CARDS.filter((card) => !known.has(card));
    expect(pool).toEqual(unseenCards(view));
    expect(pool).toHaveLength(52 - 4 - view.myHand.length);
    const mean = (slot: Slot): number => {
      const valid = pool.filter((card) => validLiteral(card, 0, slot));
      return valid.reduce((n, card) => n + valueLiteral(card), 0) / valid.length;
    };
    // E3 (TL), F3 (TR) and F4 (BR) are hidden for P1; E4 is the neutral D-K (13)
    const total = mean("TL") + mean("TR") + 13 + mean("BR");
    expect(Math.abs((total % 1) - 0.5)).toBeGreaterThan(1e-6); // not a tie: float rounding is safe here
    expect(chooseGuesses(view).guesses).toEqual({ E3: Math.round(total) });
    expect(accepted(state, chooseGuesses(view))).toBe(true);
  });

  it("(9) the corpus: every Guess covers exactly the pending keys in 4..52; FACE_UP equals the engine's Hidden_Sum", () => {
    let faceUp = 0;
    let ownerOnlyExact = 0;
    let ownerOnlyHidden = 0;
    for (const [i, s] of guessSamples.entries()) {
      const view = viewFor(s.state, s.seat);
      const keys = [...(s.state.pending?.codes ?? []).map((c) => c.quadKey)].sort();
      const action = chooseGuesses(view, seedAt(i));
      expect(action.player).toBe(s.seat);
      expect(Object.keys(action.guesses).sort()).toEqual(keys);
      for (const value of Object.values(action.guesses)) {
        expect(Number.isInteger(value) && value >= GUESS_MIN && value <= GUESS_MAX).toBe(true);
      }
      if (i % 3 === 0) expect(accepted(s.state, action), `game ${s.game} ${s.seat}`).toBe(true);
      for (const code of s.state.pending?.codes ?? []) {
        const allVisible = quadAllVisible(view, code.quadKey);
        if (s.visibility === "FACE_UP") {
          expect(action.guesses[code.quadKey], `FACE_UP ${code.quadKey}`).toBe(code.hiddenSum);
          faceUp++;
        } else if (allVisible) {
          expect(action.guesses[code.quadKey], `OWNER_ONLY all visible ${code.quadKey}`).toBe(code.hiddenSum);
          ownerOnlyExact++;
        } else {
          ownerOnlyHidden++;
        }
      }
    }
    // OBSERVED guards: both modes occur, and OWNER_ONLY has exact (all visible) and estimated (hidden) codes
    expect(faceUp).toBeGreaterThanOrEqual(100);
    expect(ownerOnlyExact).toBeGreaterThanOrEqual(5);
    expect(ownerOnlyHidden).toBeGreaterThanOrEqual(50);
  });

  it("(9) estimates with hidden members are closer to the Hidden_Sum than a uniform random Guess is, on average", () => {
    let advanced = 0;
    let uniform = 0;
    let n = 0;
    for (const [i, s] of guessSamples.entries()) {
      if (s.visibility !== "OWNER_ONLY") continue;
      const view = viewFor(s.state, s.seat);
      for (const code of s.state.pending?.codes ?? []) {
        if (quadAllVisible(view, code.quadKey)) continue;
        advanced += Math.abs((chooseGuesses(view, seedAt(i)).guesses[code.quadKey] as number) - code.hiddenSum);
        // expected absolute error of a uniform integer in 4..52 against the true sum, exact
        for (let g = GUESS_MIN; g <= GUESS_MAX; g++) uniform += Math.abs(g - code.hiddenSum) / (GUESS_MAX - GUESS_MIN + 1);
        n++;
      }
    }
    expect(n).toBeGreaterThanOrEqual(50);
    // sanity check of the conditional-mean idea on this corpus, not an accuracy claim
    expect(advanced / n).toBeLessThan(uniform / n);
    // eslint-disable-next-line no-console
    console.log(`[12.3 guess error] hidden codes ${n}: ADVANCED mean |error| ${(advanced / n).toFixed(2)}, uniform ${(uniform / n).toFixed(2)}`);
  });

  it("is deterministic and ignores the decision seed", () => {
    for (const s of every(guessSamples, 7)) {
      const view = viewFor(s.state, s.seat);
      const first = chooseGuesses(view, 1);
      expect(chooseGuesses(view, 1)).toEqual(first);
      expect(chooseGuesses(view, 0xffffffff)).toEqual(first);
      expect(chooseGuesses(viewFor(s.state, s.seat), 99)).toEqual(first);
    }
  });
});

/** True when the four members of the pending code have visible identities in the view. */
function quadAllVisible(view: PlayerView, key: string): boolean {
  const p = at(key);
  return [0, 1, 8, 9].every((offset) => view.board[p.row * 8 + p.col + offset]?.card != null);
}

// ---------------------------------------------------------------------------------------------------------
// Legality, both modes (test 11) and visibility (test 9)
// ---------------------------------------------------------------------------------------------------------

describe("ADVANCED placements are accepted by reduce", () => {
  it("in every sampled reachable PLACEMENT state, for every seat and both visibility modes (2 seeds per state)", () => {
    const samples = every(placementSamples, 2);
    expect(samples.length).toBeGreaterThanOrEqual(100);
    const seats = new Set<PlayerId>();
    const modes = new Set<IdentityVisibility>();
    for (const [i, s] of samples.entries()) {
      const view = viewFor(s.state, s.seat);
      for (const salt of [1, 2]) {
        const action = choosePlacement(view, seedAt(i, salt));
        expect(action.type).toBe("PLACE");
        expect(action.player).toBe(s.seat);
        expect(accepted(s.state, action), `game ${s.game} seat ${s.seat} ${JSON.stringify(action)}`).toBe(true);
      }
      seats.add(s.seat);
      modes.add(s.visibility);
    }
    expect([...seats].sort()).toEqual(["P0", "P1", "P2", "P3"]);
    expect([...modes].sort()).toEqual(["FACE_UP", "OWNER_ONLY"]);
  });

  it("the chosen triple is always one of the enumerated legal candidates, and a maximum-score one", () => {
    for (const [i, s] of every(placementSamples, 9).entries()) {
      const view = viewFor(s.state, s.seat);
      const evaluation = evaluatePlacements(view);
      const best = Math.max(...evaluation.scored.map((e) => e.score));
      const action = choosePlacement(view, seedAt(i, 3));
      const found = evaluation.scored.find(
        (e) => e.candidate.card === action.card && e.candidate.pos.row === action.pos.row && e.candidate.pos.col === action.pos.col && e.candidate.orientation === action.orientation,
      );
      expect(found, JSON.stringify(action)).toBeDefined();
      expect(found?.score as number).toBeGreaterThanOrEqual(best - SCORE_EPSILON);
      expect(Number.isNaN(found?.score)).toBe(false);
    }
  });

  it("the Guess of a both-mode batch is accepted too, and the two visibility modes give valid actions for the same state", () => {
    for (const v of ["OWNER_ONLY", "FACE_UP"] as const) {
      const state = afterPlacement(twoCodeStart(v), { type: "PLACE", player: "P0", card: "H-A", pos: { row: 3, col: 6 }, orientation: 0 });
      for (const seat of SEATS) {
        const action = chooseGuesses(viewFor(state, seat));
        expect(Object.keys(action.guesses)).toEqual(["F3", "G4"]);
        expect(accepted(state, action)).toBe(true);
      }
    }
    const faceUp = twoCodeStart("FACE_UP");
    const ownerOnly = twoCodeStart("OWNER_ONLY");
    expect(accepted(faceUp, choosePlacement(viewFor(faceUp, "P0"), 5))).toBe(true);
    expect(accepted(ownerOnly, choosePlacement(viewFor(ownerOnly, "P0"), 5))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Tie-breaking and determinism (test 10)
// ---------------------------------------------------------------------------------------------------------

describe("tie-breaking and determinism", () => {
  const start = (visibility: IdentityVisibility): GameState => {
    const created = newGame({ seed: 11, config: { ...defaultConfig(), identityVisibility: visibility } });
    if (!created.ok) throw new Error("newGame failed");
    return created.value;
  };

  for (const visibility of ["OWNER_ONLY", "FACE_UP"] as const) {
    it(`${visibility}: on the starting board every tied maximum occurs across seeds and nothing outside the tied set`, () => {
      const state = start(visibility);
      const view = viewFor(state, state.turn);
      const evaluation = evaluatePlacements(view);
      const tied = bestCandidates(evaluation.scored);
      expect(tied.length).toBeGreaterThanOrEqual(2);
      expect(tied.length).toBeLessThan(evaluation.candidates);
      const tiedKeys = tied.map((e) => keyOf(e.candidate));
      const seen = new Map<string, number>();
      for (let k = 0; k < 2000; k++) {
        const action = choosePlacement(view, seedAt(k, 17));
        const key = keyOf(action);
        expect(tiedKeys, key).toContain(key);
        seen.set(key, (seen.get(key) ?? 0) + 1);
        // exactly one draw over the tied list in enumeration order
        const expected = tied[Math.floor(mulberry32(seedAt(k, 17))() * tied.length)] as (typeof tied)[number];
        expect(key).toBe(keyOf(expected.candidate));
      }
      expect([...seen.keys()].sort()).toEqual([...tiedKeys].sort());
      expect(accepted(state, choosePlacement(view, 1))).toBe(true);
    });
  }

  it("same view and seed give a deeply equal action, on repeated calls and on fresh view objects", () => {
    const seeds = [0, 1, 0xffffffff, seedAt(3), seedAt(4)];
    for (const s of every(placementSamples, 17)) {
      const view = viewFor(s.state, s.seat);
      for (const seed of seeds) {
        const first = choosePlacement(view, seed);
        expect(choosePlacement(view, seed)).toEqual(first);
        expect(choosePlacement(viewFor(s.state, s.seat), seed)).toEqual(first);
      }
    }
  });

  it("different seeds reach different tied maxima in a state with several of them", () => {
    const state = start("FACE_UP");
    const view = viewFor(state, state.turn);
    const actions = new Set<string>();
    for (let k = 0; k < 60; k++) actions.add(keyOf(choosePlacement(view, seedAt(k, 4))));
    expect(actions.size).toBeGreaterThan(1);
  });

  it("the two-code fixture has exactly two tied maxima (H-A at G4, orientations 0 and 180), both worth 2 x W_COMPLETE", () => {
    const view = viewFor(twoCodeStart("FACE_UP"), "P0");
    const tied = bestCandidates(evaluatePlacements(view).scored);
    expect(tied.map((e) => e.score)).toEqual([2 * W_COMPLETE, 2 * W_COMPLETE]);
    expect(new Set(tied.map((e) => e.candidate.card))).toEqual(new Set(["H-A"]));
  });
});

const keyOf = (c: { card: string; pos: { row: number; col: number }; orientation: number }): string =>
  `${c.card}@${c.pos.row},${c.pos.col}/${c.orientation}`;

// ---------------------------------------------------------------------------------------------------------
// Immutability and statelessness (test 12)
// ---------------------------------------------------------------------------------------------------------

describe("immutability and statelessness", () => {
  it("does not mutate a frozen view or an unfrozen deep copy, and returns fresh objects", () => {
    const s = placementSamples[40] as Sample;
    const frozen = viewFor(s.state, s.seat);
    expect(Object.isFrozen(frozen)).toBe(true);
    const copy = structuredClone(frozen) as PlayerView; // unfrozen: a mutation would be possible and visible
    const before = JSON.stringify(copy);
    const ctx = Object.freeze({ decisionSeed: 12345 });
    const a = ADVANCED_STRATEGY.choosePlacement(copy, ctx);
    const b = ADVANCED_STRATEGY.choosePlacement(frozen, ctx);
    expect(JSON.stringify(copy)).toBe(before);
    expect(a).toEqual(b);
    expect(a).not.toBe(ADVANCED_STRATEGY.choosePlacement(frozen, ctx));
    expect(a.pos).not.toBe(b.pos);
    expect(ctx).toEqual({ decisionSeed: 12345 });

    const g = guessSamples[10] as Sample;
    const gView = viewFor(g.state, g.seat);
    const gCopy = structuredClone(gView) as PlayerView;
    const gBefore = JSON.stringify(gCopy);
    const guess = ADVANCED_STRATEGY.chooseGuesses(gCopy, ctx);
    expect(JSON.stringify(gCopy)).toBe(gBefore);
    expect(guess).toEqual(ADVANCED_STRATEGY.chooseGuesses(gView, ctx));
    expect(guess.guesses).not.toBe(ADVANCED_STRATEGY.chooseGuesses(gView, ctx).guesses);
  });

  it("keeps no state between calls: interleaving other views changes nothing", () => {
    const picks = every(placementSamples, 41).slice(0, 8);
    const gpicks = every(guessSamples, 53).slice(0, 8);
    expect(picks.length).toBeGreaterThanOrEqual(5);
    const isolatedPlace = picks.map((s, i) => choosePlacement(viewFor(s.state, s.seat), seedAt(i, 9)));
    const isolatedGuess = gpicks.map((s) => chooseGuesses(viewFor(s.state, s.seat), 3));
    // a shuffled interleaving, repeated twice, with seeds and views from other decisions in between
    const placeBack: Place[] = [];
    const guessBack: ReturnType<typeof chooseGuesses>[] = [];
    for (let round = 0; round < 2; round++) {
      for (let i = picks.length - 1; i >= 0; i--) {
        const s = picks[i] as Sample;
        choosePlacement(viewFor((picks[(i + 3) % picks.length] as Sample).state, (picks[(i + 3) % picks.length] as Sample).seat), 7);
        const g = gpicks[i % gpicks.length] as Sample;
        chooseGuesses(viewFor(g.state, g.seat), 8);
        if (round === 1) placeBack[i] = choosePlacement(viewFor(s.state, s.seat), seedAt(i, 9));
      }
      for (let i = gpicks.length - 1; i >= 0; i--) {
        const g = gpicks[i] as Sample;
        if (round === 1) guessBack[i] = chooseGuesses(viewFor(g.state, g.seat), 3);
      }
    }
    expect(placeBack).toEqual(isolatedPlace);
    expect(guessBack).toEqual(isolatedGuess);
  });

  it("the strategy object is frozen, has tier id ADVANCED, and is the registry's ADVANCED entry; EXPERT is still absent", () => {
    expect(Object.isFrozen(ADVANCED_STRATEGY)).toBe(true);
    expect(ADVANCED_STRATEGY.id).toBe("ADVANCED");
    expect(getStrategy("ADVANCED")).toBe(ADVANCED_STRATEGY);
    expect(getStrategy("ADVANCED").id).toBe("ADVANCED");
    expect(() => getStrategy("EXPERT")).toThrow(RangeError);
    expect(() => getStrategy("EXPERT")).toThrow(/EXPERT.*not registered/);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Work budget (test 13)
// ---------------------------------------------------------------------------------------------------------

describe("work budget", () => {
  it("ordinary states are evaluated in full: evaluated equals the candidate count and never exceeds WORK_BUDGET", () => {
    let biggest = 0;
    for (const s of placementSamples) {
      const view = viewFor(s.state, s.seat);
      const evaluation = evaluatePlacements(view);
      expect(evaluation.evaluated).toBe(evaluation.candidates);
      expect(evaluation.evaluated).toBe(enumeratePlacements(view).length);
      expect(evaluation.truncated).toBe(false);
      expect(evaluation.scored).toHaveLength(evaluation.evaluated);
      expect(evaluation.evaluated).toBeLessThanOrEqual(WORK_BUDGET);
      biggest = Math.max(biggest, evaluation.evaluated);
    }
    expect(biggest).toBeLessThanOrEqual(WORK_BUDGET);
    expect(biggest).toBeGreaterThan(50);
  });

  it("an injected small budget keeps a deterministic prefix of the enumeration, with the same scores as the full run", () => {
    const s = placementSamples[60] as Sample;
    const view = viewFor(s.state, s.seat);
    const all = enumeratePlacements(view);
    const full = evaluatePlacements(view);
    expect(all.length).toBeGreaterThan(12);
    for (const budget of [1, 5, 12, all.length - 1]) {
      const cut = evaluatePlacements(view, budget);
      expect(cut.candidates).toBe(all.length);
      expect(cut.evaluated).toBe(budget);
      expect(cut.truncated).toBe(true);
      expect(cut.scored.map((e) => e.candidate)).toEqual(all.slice(0, budget));
      expect(cut.scored).toEqual(full.scored.slice(0, budget));
      expect(evaluatePlacements(view, budget)).toEqual(cut);
    }
    expect(evaluatePlacements(view, all.length)).toEqual(full);
    expect(evaluatePlacements(view, Infinity)).toEqual(full);
    expect(evaluatePlacements(view, 0).evaluated).toBe(0);
    expect(evaluatePlacements(view, Number.NaN).evaluated).toBe(0);
    expect(bestCandidates(evaluatePlacements(view, 0).scored)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Information isolation
// ---------------------------------------------------------------------------------------------------------

describe("ADVANCED reads only the view", () => {
  it("states that differ only in hidden information (deck order, other hands, hidden identities swapped) give identical actions", () => {
    let pairs = 0;
    let changedPlacement = 0;
    let changedGuess = 0;
    const samples = [...every(placementSamples, 23), ...every(guessSamples, 11)];
    for (const [i, s] of samples.entries()) {
      const before = viewFor(s.state, s.seat);
      const perturbations = fc.sample(arbHiddenPerturbation(s.state, s.seat), { numRuns: 3, seed: 20260513 + i });
      for (const p of perturbations) {
        const after = viewFor(p.after, s.seat);
        const seed = seedAt(i, 6);
        if (s.state.phase === "PLACEMENT") {
          expect(choosePlacement(after, seed)).toEqual(choosePlacement(before, seed));
          if (p.effective.length > 0) changedPlacement++;
        } else {
          expect(chooseGuesses(after, seed)).toEqual(chooseGuesses(before, seed));
          if (p.effective.length > 0) changedGuess++;
        }
        pairs++;
      }
    }
    expect(pairs).toBeGreaterThanOrEqual(100);
    expect(changedPlacement).toBeGreaterThanOrEqual(20);
    expect(changedGuess).toBeGreaterThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------

describe("ADVANCED refuses a call when the seat must not act (RangeError, as BEGINNER)", () => {
  const ctx = { decisionSeed: 7 };
  it("choosePlacement: not the viewer's turn, GUESS_COLLECT", () => {
    const s = placementSamples[30] as Sample;
    const other = SEATS.find((seat) => seat !== s.seat) as PlayerId;
    expect(() => ADVANCED_STRATEGY.choosePlacement(viewFor(s.state, other), ctx)).toThrow(RangeError);
    const g = guessSamples[0] as Sample;
    expect(() => ADVANCED_STRATEGY.choosePlacement(viewFor(g.state, g.seat), ctx)).toThrow(RangeError);
  });

  it("chooseGuesses: PLACEMENT phase and a seat that has already submitted", () => {
    const s = placementSamples[30] as Sample;
    expect(() => ADVANCED_STRATEGY.chooseGuesses(viewFor(s.state, s.seat), ctx)).toThrow(RangeError);
    const batch = afterPlacement(twoCodeStart("OWNER_ONLY"), { type: "PLACE", player: "P0", card: "H-A", pos: { row: 3, col: 6 }, orientation: 0 });
    const submitted = reduce(batch, { type: "SUBMIT_GUESSES", player: "P0", guesses: { F3: 20, G4: 30 } });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(() => ADVANCED_STRATEGY.chooseGuesses(viewFor(submitted.value, "P0"), ctx)).toThrow(RangeError);
    expect(accepted(submitted.value, chooseGuesses(viewFor(submitted.value, "P1")))).toBe(true);
  });

  it("chooseGuesses rejects an inconsistent view whose pending code has an empty cell", () => {
    const batch = afterPlacement(twoCodeStart("FACE_UP"), { type: "PLACE", player: "P0", card: "H-A", pos: { row: 3, col: 6 }, orientation: 0 });
    const view = viewFor(batch, "P1");
    const board = [...view.board];
    board[2 * 8 + 5] = null; // F3 (row 2, col 5)
    expect(() => ADVANCED_STRATEGY.chooseGuesses({ ...view, board }, ctx)).toThrow(RangeError);
    expect(() => ADVANCED_STRATEGY.chooseGuesses({ ...view, pendingQuadKeys: ["Z9"] }, ctx)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Full games: four ADVANCED seats through the engine, and ADVANCED against BEGINNER
// ---------------------------------------------------------------------------------------------------------

function smokeGame(gameSeed: number, visibility: IdentityVisibility, tiers: readonly (typeof ADVANCED_STRATEGY)[]): { ended: boolean; problem: string | null; codes: number; state: GameState } {
  const config: GameConfig = { ...defaultConfig(), identityVisibility: visibility };
  const created = newGame({ seed: gameSeed, config });
  if (!created.ok) throw new Error("newGame failed");
  let state = created.value;
  let actionIndex = 0;
  let codes = 0;
  for (let step = 0; step < 2000 && state.phase !== "ENDED"; step++) {
    let action: Action;
    if (state.phase === "PLACEMENT") {
      const seat = state.turn;
      const strategy = tiers[SEATS.indexOf(seat)] as typeof ADVANCED_STRATEGY;
      action = strategy.choosePlacement(viewFor(state, seat), { decisionSeed: mix32(gameSeed, SEATS.indexOf(seat) * 100000 + actionIndex) });
    } else if (state.phase === "GUESS_COLLECT") {
      const seat = actingSeats(state)[0] as PlayerId;
      const strategy = tiers[SEATS.indexOf(seat)] as typeof ADVANCED_STRATEGY;
      action = strategy.chooseGuesses(viewFor(state, seat), { decisionSeed: mix32(gameSeed, SEATS.indexOf(seat) * 100000 + actionIndex) });
      if (actingSeats(state).length === 4) codes += state.pending?.codes.length ?? 0;
    } else {
      action = { type: "ACK_REVEAL" };
    }
    actionIndex++;
    const result = reduce(state, action);
    if (!result.ok) return { ended: false, problem: `rejected ${result.error.code}: ${JSON.stringify(action)}`, codes, state };
    state = result.value;
    const problem = conservationProblem(state);
    if (problem !== null) return { ended: false, problem, codes, state };
  }
  return { ended: state.phase === "ENDED", problem: null, codes, state };
}

describe("full games", () => {
  const all = [ADVANCED_STRATEGY, ADVANCED_STRATEGY, ADVANCED_STRATEGY, ADVANCED_STRATEGY];
  const results = Array.from({ length: 16 }, (_, i) => {
    const visibility: IdentityVisibility = i % 2 === 0 ? "OWNER_ONLY" : "FACE_UP";
    return { seed: 9000 + i, visibility, result: smokeGame(9000 + i, visibility, all) };
  });

  it("four ADVANCED seats: no action is rejected, 52 cards are kept, every game ends", () => {
    for (const { seed, visibility, result } of results) {
      expect(result.problem, `seed ${seed} ${visibility}`).toBeNull();
      expect(result.ended, `seed ${seed} ${visibility}`).toBe(true);
    }
  });

  // ADVANCED looks for completions, so its games contain codes; this is a coverage guard, not a strength claim
  it("plays real games with codes completed in both visibility modes", () => {
    const total = results.reduce((n, r) => n + r.result.codes, 0);
    const faceUp = results.filter((r) => r.visibility === "FACE_UP").reduce((n, r) => n + r.result.codes, 0);
    // eslint-disable-next-line no-console
    console.log(`[12.3 smoke] 16 games, codes in 4-seat batches: total ${total}, FACE_UP ${faceUp}`);
    expect(total).toBeGreaterThanOrEqual(16);
    expect(faceUp).toBeGreaterThanOrEqual(8);
  });

  it("mixed tiers (BEGINNER and ADVANCED) also play to the end without a rejected action", () => {
    const mixed = [ADVANCED_STRATEGY, BEGINNER_STRATEGY, ADVANCED_STRATEGY, BEGINNER_STRATEGY];
    for (let i = 0; i < 6; i++) {
      const r = smokeGame(9100 + i, i % 2 === 0 ? "OWNER_ONLY" : "FACE_UP", mixed);
      expect(r.problem).toBeNull();
      expect(r.ended).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// Coverage guards
// ---------------------------------------------------------------------------------------------------------

describe("coverage guards of the corpus", () => {
  it("covers both visibility modes, all seats, hidden and visible members, and records the largest enumeration", () => {
    const hiddenCells = placementSamples.filter((s) => viewFor(s.state, s.seat).board.some((c) => c !== null && c.card === null));
    const faceUp = placementSamples.filter((s) => s.visibility === "FACE_UP");
    const ownerOnly = placementSamples.filter((s) => s.visibility === "OWNER_ONLY");
    const biggest = Math.max(...placementSamples.map((s) => enumeratePlacements(viewFor(s.state, s.seat)).length));
    const tiedStates = placementSamples.filter((s) => bestCandidates(evaluatePlacements(viewFor(s.state, s.seat)).scored).length > 1);
    const stats = {
      placement: placementSamples.length,
      placementOwnerOnly: ownerOnly.length,
      placementFaceUp: faceUp.length,
      withHiddenBoardCells: hiddenCells.length,
      guess: guessSamples.length,
      guessOwnerOnly: guessSamples.filter((s) => s.visibility === "OWNER_ONLY").length,
      guessFaceUp: guessSamples.filter((s) => s.visibility === "FACE_UP").length,
      tiedStates: tiedStates.length,
      biggest,
    };
    expect(stats.placement).toBeGreaterThanOrEqual(600);
    expect(stats.placementOwnerOnly).toBeGreaterThanOrEqual(250);
    expect(stats.placementFaceUp).toBeGreaterThanOrEqual(250);
    expect(stats.withHiddenBoardCells).toBeGreaterThanOrEqual(200);
    expect(stats.guess).toBeGreaterThanOrEqual(150);
    expect(stats.guessOwnerOnly).toBeGreaterThanOrEqual(60);
    expect(stats.guessFaceUp).toBeGreaterThanOrEqual(60);
    expect(stats.tiedStates).toBeGreaterThanOrEqual(100);
    for (const seat of SEATS) {
      expect(placementSamples.filter((s) => s.seat === seat).length, `placements of ${seat}`).toBeGreaterThanOrEqual(100);
      expect(guessSamples.filter((s) => s.seat === seat).length, `guesses of ${seat}`).toBeGreaterThanOrEqual(30);
    }
    expect(stats.biggest).toBeLessThanOrEqual(WORK_BUDGET);
    // eslint-disable-next-line no-console
    console.log(`[12.3 coverage] ${JSON.stringify(stats)}`);
    // the corpus legal cells equal the engine's (independent check of the enumeration the strategy relies on)
    const s = placementSamples[100] as Sample;
    expect(enumeratePlacements(viewFor(s.state, s.seat)).length).toBe(s.state.hands[s.seat].length * legalCells(s.state.board).length * 2);
  });
});
