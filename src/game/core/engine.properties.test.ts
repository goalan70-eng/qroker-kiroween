// Property tests for the reducer (task 8.3): Property 4 (deterministic deal partition), Property 12 (draw rule),
// Property 13 (conservation invariants under random legal play) and Property 14 (action authorization) of
// .kiro/specs/qroker-playable-game/design.md. Requirements 2.2, 2.3, 2.4, 3.4, 3.6, 3.7, 5.7, 6.2 to 6.7, 7.9, 9.2.
//
// Each property is ONE test with ONE fc.assert, a fixed seed and 100 to 300 runs (see NUM_RUNS_*). Failures are
// reproducible: fast-check prints the seed and path, and the printed counterexample of a generated game is its
// seed, configuration and action list (see `withPrinter` in testing/state-generators.ts); `replayActions` rebuilds
// the states from them. Failure messages name the seed, a configuration summary, the action index and the action.
//
// Reachability: every state comes from `newGame` followed by `reduce` of actions chosen by `randomLegalAction`
// (testing/state-generators.ts); nothing is built by hand. A phase that a case needs is taken from a prefix of such
// a play, or reached by further legal play (`advanceUntil`, `playToEnd`).
//
// Oracles are written in this file and read none of the modules under test: a literal catalog, its own mulberry32
// and Fisher-Yates, its own printed-corner table and brute-force scan of the quads that contain the placed cell, its
// own bookkeeping of hand and deck sizes, and its own authorization verdict. The engine is called only through
// `newGame` and `reduce` (and the generators, which only choose actions).
//
// Coverage guards: after the assertion of Properties 12 and 14 the test checks that every case kind occurred a
// minimum number of times, so that a property cannot pass because its interesting cases never happen. The observed
// numbers of the fixed-seed runs are documented next to each guard.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { reduce } from "./engine";
import { newGame } from "./state";
import type { GamePhase, GameState } from "./state";
import { arbSeed } from "./testing/card-generators";
import {
  advanceUntil,
  arbConfig,
  arbPlayStyle,
  arbReachableState,
  choiceFrom,
  configSummary,
  describeReachable,
  legalPlacements,
  pickState,
  playToEnd,
  randomLegalAction,
  randomLegalPlace,
} from "./testing/state-generators";
import type { Choice, LegalPlacement, PlayStyle, Reachable } from "./testing/state-generators";
import type { Action, ErrorCode, PlayerId } from "./types";

// ---------------------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------------------

const SEED_P4 = 20260811;
const SEED_P12 = 20260812;
const SEED_P13 = 20260813;
const SEED_P14 = 20260814;
const NUM_RUNS_P4 = 300;
const NUM_RUNS_P12 = 300;
const NUM_RUNS_P13 = 200;
const NUM_RUNS_P14 = 200;
const TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------------------------------------
// Independent oracles
// ---------------------------------------------------------------------------------------------------------

/** The 52 cards, written out as a literal list (canonical order: suit-major H, D, C, S; rank A..K). */
const CATALOG: readonly string[] = [
  "H-A", "H-2", "H-3", "H-4", "H-5", "H-6", "H-7", "H-8", "H-9", "H-10", "H-J", "H-Q", "H-K",
  "D-A", "D-2", "D-3", "D-4", "D-5", "D-6", "D-7", "D-8", "D-9", "D-10", "D-J", "D-Q", "D-K",
  "C-A", "C-2", "C-3", "C-4", "C-5", "C-6", "C-7", "C-8", "C-9", "C-10", "C-J", "C-Q", "C-K",
  "S-A", "S-2", "S-3", "S-4", "S-5", "S-6", "S-7", "S-8", "S-9", "S-10", "S-J", "S-Q", "S-K",
];
const SORTED_CATALOG: readonly string[] = [...CATALOG].sort();

const SEAT_IDS: readonly PlayerId[] = ["P0", "P1", "P2", "P3"];
const successor = (seat: PlayerId): PlayerId => SEAT_IDS[(SEAT_IDS.indexOf(seat) + 1) % 4] as PlayerId;

/** mulberry32, written out independently with Math.imul. */
function refMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates: for i = n-1 down to 1, j = floor(rng() * (i+1)), swap a[i] and a[j]. */
function refShuffle(cards: readonly string[], rng: () => number): string[] {
  const a = [...cards];
  for (let i = a.length - 1; i >= 1; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as string, a[i] as string];
  }
  return a;
}

/** Reference deal: neutral = first 4, hand of seat k = cards 4+4k..7+4k, deck = the remaining 32 (top = last). */
function refDeal(seed: number): { neutral: string[]; hands: string[][]; deck: string[] } {
  const s = refShuffle(CATALOG, refMulberry32(seed));
  return {
    neutral: s.slice(0, 4),
    hands: [0, 1, 2, 3].map((k) => s.slice(4 + 4 * k, 8 + 4 * k)),
    deck: s.slice(20),
  };
}

type SuitLetter = "H" | "D" | "C" | "S";
type SlotName = "TL" | "TR" | "BL" | "BR";

/** Printed (visible) corners per suit and orientation. */
const PRINTED: Record<SuitLetter, Record<0 | 180, readonly string[]>> = {
  H: { 0: ["TL", "BR"], 180: ["TL", "BR"] },
  D: { 0: ["TR", "BL"], 180: ["TR", "BL"] },
  C: { 0: ["TR", "BR"], 180: ["TL", "BL"] },
  S: { 0: ["TL", "BL"], 180: ["TR", "BR"] },
};
/** The corner of a card that faces the centre of its 2x2 group, by slot. */
const FACING: Record<SlotName, string> = { TL: "BR", TR: "BL", BL: "TR", BR: "TL" };

const oracleValid = (card: string, orientation: 0 | 180, slot: SlotName): boolean =>
  (PRINTED[card.charAt(0) as SuitLetter][orientation] as readonly string[]).includes(FACING[slot]);

const RANK_VALUE: Record<string, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
};
const oracleValue = (card: string): number => RANK_VALUE[card.slice(2)] as number;

type Cell = GameState["board"][number];

interface OracleCode {
  readonly quadKey: string;
  readonly cards: readonly string[];
  readonly hiddenSum: number;
  readonly groupId: string;
}

/**
 * Brute force: the new codes completed by the card just placed at (row, col) on `board`. Scans the (up to) four 2x2
 * regions that contain the cell with its own arithmetic; a region is a code when its four cells are occupied, every
 * member is valid for its slot, the cards are pairwise distinct and the group id is not in `scoredBefore`.
 */
function oracleNewCodes(board: readonly Cell[], row: number, col: number, scoredBefore: readonly string[]): OracleCode[] {
  const found: OracleCode[] = [];
  const slots: SlotName[] = ["TL", "TR", "BL", "BR"];
  for (const [tr, tc] of [[row - 1, col - 1], [row - 1, col], [row, col - 1], [row, col]] as const) {
    if (tr < 0 || tc < 0 || tr > 6 || tc > 6) continue;
    const spots = [[tr, tc], [tr, tc + 1], [tr + 1, tc], [tr + 1, tc + 1]] as const;
    const cells = spots.map(([r, c]) => board[r * 8 + c] ?? null);
    if (cells.some((cell) => cell === null)) continue;
    const placed = cells as NonNullable<Cell>[];
    if (!placed.every((cell, i) => oracleValid(cell.card, cell.orientation, slots[i] as SlotName))) continue;
    const cards = placed.map((cell) => cell.card as string);
    if (new Set(cards).size !== 4) continue;
    const groupId = [...cards].sort().join("|");
    if (scoredBefore.includes(groupId)) continue;
    found.push({
      quadKey: `${"ABCDEFGH".charAt(tc)}${tr + 1}`,
      cards,
      hiddenSum: cards.reduce((sum, card) => sum + oracleValue(card), 0),
      groupId,
    });
  }
  return found.sort((a, b) => (a.quadKey < b.quadKey ? -1 : a.quadKey > b.quadKey ? 1 : 0));
}

const countCards = (board: readonly Cell[]): number => board.filter((cell) => cell !== null).length;

/** Every card held by the board, the four hands and the deck. */
function allCards(state: GameState): string[] {
  const onBoard = state.board.flatMap((cell) => (cell === null ? [] : [cell.card as string]));
  return [...onBoard, ...SEAT_IDS.flatMap((seat) => state.hands[seat] as readonly string[]), ...state.deck];
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every(isDeepFrozen);
}

const where = (r: Reachable, index?: number, action?: unknown): string =>
  `${describeReachable(r)}${index === undefined ? "" : ` | action #${index}`}${action === undefined ? "" : ` ${JSON.stringify(action)}`}`;

function fail(message: string): never {
  throw new Error(message);
}

// ---------------------------------------------------------------------------------------------------------
// Property 4: Deterministic deal partition
// ---------------------------------------------------------------------------------------------------------

describe("Property 4: deterministic deal partition", () => {
  it(
    "newGame is deterministic and deals 4 neutral + 4x4 hand + 32 deck cards that partition the catalog",
    { timeout: TIMEOUT_MS },
    () => {
      // Feature: qroker-playable-game, Property 4: Deterministic deal partition
      // Validates: Requirements 2.2, 2.3, 2.4, 3.4, 5.7
      fc.assert(
        fc.property(arbSeed, arbConfig, (seed, config) => {
          const first = newGame({ seed, config });
          const second = newGame({ seed, config });
          if (!first.ok || !second.ok) return fail(`newGame rejected a valid configuration: seed=${seed} ${configSummary(config)}`);
          const state = first.value;

          // Two calls give deeply equal, complete initial states (board, hands, deck, config) that are distinct objects.
          expect(second.value).toEqual(state);
          expect(second.value).not.toBe(state);
          expect(state.seed).toBe(seed);
          expect(state.config).toEqual(config);

          // Neutral cards on D4, E4, D5, E5 (row-major index 27, 28, 35, 36); every other cell is empty.
          const neutral = [27, 28, 35, 36].map((index) => state.board[index]);
          neutral.forEach((cell) => {
            expect(cell).not.toBeNull();
            expect(cell?.owner).toBe("NEUTRAL");
            expect(cell?.orientation).toBe(0);
          });
          expect(state.board).toHaveLength(64);
          expect(countCards(state.board)).toBe(4);

          // 4 cards per seat, 32 in the deck, 20 dealt cards pairwise distinct.
          for (const seat of SEAT_IDS) expect(state.hands[seat]).toHaveLength(4);
          expect(state.deck).toHaveLength(32);
          const neutralCards = neutral.map((cell) => cell?.card as string);
          const dealt = [...neutralCards, ...SEAT_IDS.flatMap((seat) => state.hands[seat] as readonly string[])];
          expect(dealt).toHaveLength(20);
          expect(new Set(dealt).size).toBe(20);

          // Neutral + hands + deck are the 52-card catalog exactly (no duplicate, nothing missing).
          const everything = [...dealt, ...state.deck];
          expect(everything).toHaveLength(52);
          expect([...everything].sort()).toEqual(SORTED_CATALOG);

          // The deal equals the independent reference shuffle and split.
          const ref = refDeal(seed);
          expect(neutralCards).toEqual(ref.neutral);
          SEAT_IDS.forEach((seat, k) => expect(state.hands[seat]).toEqual(ref.hands[k]));
          expect(state.deck).toEqual(ref.deck);

          // The rest of the initial state: P0 to move in PLACEMENT, nothing pending, nothing scored.
          expect(state.phase).toBe("PLACEMENT");
          expect(state.turn).toBe("P0");
          expect(state.placements).toBe(0);
          expect(state.pending).toBeNull();
          expect(state.log).toEqual([]);
          expect(state.history).toEqual([]);
          expect(state.scoredGroups).toEqual([]);
          expect(SEAT_IDS.map((seat) => state.scores[seat])).toEqual([0, 0, 0, 0]);
        }),
        { seed: SEED_P4, numRuns: NUM_RUNS_P4 },
      );
    },
  );
});

// ---------------------------------------------------------------------------------------------------------
// Property 12: Draw rule
// ---------------------------------------------------------------------------------------------------------

/** Case kinds seen by the draw-rule property (see the observed numbers at the guard). */
interface DrawCoverage {
  runs: number;
  skipped: number;
  first: number;
  firstWithCode: number;
  code: number;
  nonFirstCode: number;
  noCodeDraw: number;
  emptyDeckNoCode: number;
  emptyDeckAny: number;
  twoCodes: number;
  endedByPlacement: number;
  codeEndsGame: number;
  advanced: number;
  fellBack: number;
}

type Prefer = "ANY" | "FIRST" | "EMPTY_DECK" | "CODE" | "CODE_NOT_FIRST" | "LAST_CARD" | "TWO_CODES";

/** How many new codes the best legal placement of the turn seat forms (the engine's own detector steers the choice). */
const bestCodes = (state: GameState): number => legalPlacements(state).reduce((best, p) => Math.max(best, p.newCodes), 0);
const inPlacement = (s: GameState): boolean => s.phase === "PLACEMENT";

/** The kind of state each preference asks for. A kind that no prefix state has is reached by further legal play. */
const WANTED: Record<Prefer, (s: GameState) => boolean> = {
  ANY: inPlacement,
  FIRST: (s) => inPlacement(s) && !s.firstPlacementDone.includes(s.turn),
  EMPTY_DECK: (s) => inPlacement(s) && s.deck.length === 0,
  CODE: (s) => inPlacement(s) && bestCodes(s) >= 1,
  CODE_NOT_FIRST: (s) => inPlacement(s) && s.firstPlacementDone.includes(s.turn) && bestCodes(s) >= 1,
  LAST_CARD: (s) => inPlacement(s) && s.hands[s.turn].length === 1 && bestCodes(s) >= 1,
  TWO_CODES: (s) => inPlacement(s) && bestCodes(s) >= 2,
};
/** Codes the chosen placement must form (0: any legal placement, steered by `codeBias`). */
const NEED_CODES: Record<Prefer, number> = { ANY: 0, FIRST: 0, EMPTY_DECK: 0, CODE: 1, CODE_NOT_FIRST: 1, LAST_CARD: 1, TWO_CODES: 2 };

const arbDrawCase = fc.record({
  reach: arbReachableState(),
  prefer: fc.constantFrom<Prefer>(
    "ANY", "ANY", "FIRST", "EMPTY_DECK", "EMPTY_DECK", "CODE", "CODE", "CODE_NOT_FIRST", "LAST_CARD", "LAST_CARD", "TWO_CODES",
  ),
  pick: fc.nat({ max: 1_000_000 }),
  codeBias: fc.constantFrom(0, 0, 40, 100),
  numbers: fc.array(fc.nat({ max: 1_000_000 }), { minLength: 40, maxLength: 40 }),
});

describe("Property 12: draw rule", () => {
  it("a PLACE draws exactly when it is not the first placement and forms no code, from the top of the deck", { timeout: TIMEOUT_MS }, () => {
    // Feature: qroker-playable-game, Property 12: Draw rule
    // Validates: Requirements 6.3, 6.4, 6.5, 6.6, 7.9
    const cov: DrawCoverage = {
      runs: 0, skipped: 0, first: 0, firstWithCode: 0, code: 0, nonFirstCode: 0, noCodeDraw: 0,
      emptyDeckNoCode: 0, emptyDeckAny: 0, twoCodes: 0, endedByPlacement: 0, codeEndsGame: 0,
      advanced: 0, fellBack: 0,
    };

    fc.assert(
      fc.property(arbDrawCase, ({ reach, prefer, pick, codeBias, numbers }) => {
        cov.runs++;
        // A PLACEMENT state of the preferred kind: a prefix of the generated play, else further legal play from its
        // end, else any PLACEMENT prefix state.
        const wanted = WANTED[prefer];
        let from: GameState | undefined = pickState(reach, wanted, pick);
        let prefix: readonly Action[] = reach.actions;
        if (from === undefined) {
          const advanced = advanceUntil(reach.state, wanted, numbers, { ...reach.style, codeBias: NEED_CODES[prefer] > 0 ? 60 : 0 });
          if (wanted(advanced.state)) {
            from = advanced.state;
            prefix = [...reach.actions, ...advanced.actions];
            cov.advanced++;
          }
        }
        if (from === undefined) {
          from = pickState(reach, inPlacement, pick);
          cov.fellBack++;
        }
        if (from === undefined) {
          cov.skipped++;
          return;
        }
        const style: PlayStyle = { codeBias, submitOrder: "SEAT_ORDER" };
        // The kinds that ask for a code pick a placement that forms enough codes; the others a legal placement.
        const need = wanted(from) ? NEED_CODES[prefer] : 0;
        const forming = need > 0 ? legalPlacements(from).filter((p) => p.newCodes >= need) : [];
        const action =
          forming.length > 0
            ? (forming[choiceFrom(numbers)(forming.length)] as LegalPlacement).action
            : randomLegalPlace(from, choiceFrom(numbers), style);
        const result = reduce(from, action);
        const ctx = `${where(reach)} prefix=${prefix.length} PLACE ${JSON.stringify(action)}`;
        if (!result.ok) return fail(`legal PLACE rejected with ${result.error.code}: ${ctx}`);
        const after = result.value;

        const seat = action.player;
        const handBefore = from.hands[seat];
        const first = !from.firstPlacementDone.includes(seat);
        const deckBefore = from.deck;

        // Independent count of the new codes, from the new board and the scored groups before the placement.
        const codes = oracleNewCodes(after.board, action.pos.row, action.pos.col, from.scoredGroups);
        const batch = after.pending?.codes ?? [];
        expect(batch.map((code) => code.quadKey), `new codes of the pending batch: ${ctx}`).toEqual(codes.map((code) => code.quadKey));
        expect(batch.map((code) => code.hiddenSum), `hidden sums: ${ctx}`).toEqual(codes.map((code) => code.hiddenSum));
        expect(batch.map((code) => [...code.cards]), `cards: ${ctx}`).toEqual(codes.map((code) => [...code.cards]));

        // The draw rule.
        const draws = !first && codes.length === 0 && deckBefore.length > 0;
        const handAfter = after.hands[seat];
        const expectedSize = draws ? handBefore.length : handBefore.length - 1;
        expect(handAfter.length, `hand size after: ${ctx}`).toBe(expectedSize);
        const without = handBefore.filter((card) => card !== action.card);
        if (draws) {
          const top = deckBefore[deckBefore.length - 1];
          expect(handAfter, `drawn card is the previous top of the deck: ${ctx}`).toEqual([...without, top]);
          expect(after.deck, `deck loses exactly its top card: ${ctx}`).toEqual(deckBefore.slice(0, -1));
        } else {
          expect(handAfter, `no card is drawn or manufactured: ${ctx}`).toEqual(without);
          expect(after.deck, `deck unchanged: ${ctx}`).toEqual(deckBefore);
        }
        // Other seats are untouched.
        for (const other of SEAT_IDS) if (other !== seat) expect(after.hands[other]).toEqual(from.hands[other]);

        // Phase: GUESS_COLLECT iff at least one new code; otherwise the game ends iff the hand is empty.
        expect(after.phase === "GUESS_COLLECT", `phase GUESS_COLLECT iff a code formed: ${ctx}`).toBe(codes.length > 0);
        if (codes.length > 0) {
          expect(after.pending?.placer).toBe(seat);
          expect(after.pending?.endsGame, `endsGame: ${ctx}`).toBe(handAfter.length === 0);
          expect(after.turn).toBe(seat);
        } else if (handAfter.length === 0) {
          expect(after.phase, `hand-emptying placement without a code ends the game: ${ctx}`).toBe("ENDED");
        } else {
          expect(after.phase, ctx).toBe("PLACEMENT");
          expect(after.turn, ctx).toBe(successor(seat));
        }
        // First placement is recorded; the placement is counted.
        expect(after.firstPlacementDone.includes(seat)).toBe(true);
        expect(after.placements).toBe(from.placements + 1);
        // The placed card sits on the chosen cell with the chosen orientation and the seat as owner.
        expect(after.board[action.pos.row * 8 + action.pos.col]).toEqual({ card: action.card, orientation: action.orientation, owner: seat });

        // Coverage.
        if (first) cov.first++;
        if (first && codes.length > 0) cov.firstWithCode++;
        if (codes.length > 0) cov.code++;
        if (codes.length > 1) cov.twoCodes++;
        if (!first && codes.length > 0) cov.nonFirstCode++;
        if (draws) cov.noCodeDraw++;
        if (deckBefore.length === 0) cov.emptyDeckAny++;
        if (!first && codes.length === 0 && deckBefore.length === 0) cov.emptyDeckNoCode++;
        if (after.phase === "ENDED") cov.endedByPlacement++;
        if (after.pending?.endsGame === true) cov.codeEndsGame++;
      }),
      { seed: SEED_P12, numRuns: NUM_RUNS_P12 },
    );

    // The property cannot pass vacuously: every case kind occurred. Observed with seed SEED_P12 and 300 runs
    // (see the notes at the end of this file for the numbers).
    if (process.env.QROKER_COVERAGE_LOG === "1") console.info("P12 coverage", JSON.stringify(cov));
    expect(cov.skipped).toBe(0);
    expect(cov.first, "first placements").toBeGreaterThanOrEqual(30);
    expect(cov.firstWithCode, "first placements that form a code").toBeGreaterThanOrEqual(3);
    expect(cov.code, "placements that form a code").toBeGreaterThanOrEqual(50);
    expect(cov.nonFirstCode, "non-first placements that form a code").toBeGreaterThanOrEqual(40);
    expect(cov.noCodeDraw, "non-first placements without a code and with a non-empty deck").toBeGreaterThanOrEqual(30);
    expect(cov.emptyDeckNoCode, "non-first placements without a code and with an EMPTY deck").toBeGreaterThanOrEqual(20);
    expect(cov.endedByPlacement, "placements that end the game at once").toBeGreaterThanOrEqual(4);
    expect(cov.codeEndsGame, "code placements that empty the hand").toBeGreaterThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Property 13: Conservation invariants under random legal play
// ---------------------------------------------------------------------------------------------------------

describe("Property 13: conservation invariants under random legal play", () => {
  it("every accepted action keeps the 52 cards, the counters, the draw bookkeeping, scoredGroups and immutability", { timeout: TIMEOUT_MS }, () => {
    // Feature: qroker-playable-game, Property 13: Conservation invariants under random legal play
    // Validates: Requirements 3.6, 3.7, 6.7, 6.2 to 6.6, 9.2
    let totalSteps = 0;
    let endedGames = 0;
    let games = 0;

    fc.assert(
      fc.property(arbReachableState(), (reach) => {
        games++;
        // Re-run the whole play with our own reduce calls and bookkeeping.
        let state = reach.states[0] as GameState;
        const handSize: Record<PlayerId, number> = { P0: 4, P1: 4, P2: 4, P3: 4 };
        let deckSize = 32;
        const placed = new Set<PlayerId>();
        let placements = 0;
        let scoredPrev: readonly string[] = [];

        // Initial state.
        expect([...allCards(state)].sort()).toEqual(SORTED_CATALOG);
        expect(countCards(state.board)).toBe(4);

        reach.actions.forEach((action, index) => {
          const ctx = where(reach, index, action);
          const previous = state;
          const snapshot = structuredClone(previous);
          const result = reduce(previous, action);
          if (!result.ok) return fail(`legal action rejected with ${result.error.code}: ${ctx}`);
          const next = result.value;
          totalSteps++;

          // The previous state is untouched: still deeply frozen and equal to the clone taken before the call.
          expect(isDeepFrozen(previous), `previous state still frozen: ${ctx}`).toBe(true);
          expect(previous, `previous state unchanged: ${ctx}`).toEqual(snapshot);
          // The returned state is a new, deeply frozen object, and equals the state the generator recorded.
          expect(next).not.toBe(previous);
          expect(isDeepFrozen(next), `returned state deeply frozen: ${ctx}`).toBe(true);
          expect(next, `reduce is deterministic: ${ctx}`).toEqual(reach.states[index + 1]);

          // Bookkeeping of hand and deck sizes, written independently of the engine.
          if (action.type === "PLACE") {
            const seat = action.player;
            const codes = oracleNewCodes(next.board, action.pos.row, action.pos.col, previous.scoredGroups);
            const draws = placed.has(seat) && codes.length === 0 && deckSize > 0;
            handSize[seat] += draws ? 0 : -1;
            deckSize -= draws ? 1 : 0;
            placed.add(seat);
            placements++;
            expect(countCards(next.board), `cardCount increases by exactly 1: ${ctx}`).toBe(countCards(previous.board) + 1);
          } else {
            expect(next.board, `board unchanged by ${action.type}: ${ctx}`).toEqual(previous.board);
            expect(countCards(next.board)).toBe(countCards(previous.board));
          }
          for (const seat of SEAT_IDS) expect(next.hands[seat].length, `hand size of ${seat}: ${ctx}`).toBe(handSize[seat]);
          expect(next.deck.length, `deck size: ${ctx}`).toBe(deckSize);
          expect(next.placements, `placements counter: ${ctx}`).toBe(placements);
          expect(countCards(next.board), `cardCount = placements + 4: ${ctx}`).toBe(placements + 4);

          // Conservation: board + hands + deck is the 52-card catalog, once each.
          const cards = allCards(next);
          expect(cards, `52 cards: ${ctx}`).toHaveLength(52);
          expect([...cards].sort(), `catalog partition: ${ctx}`).toEqual(SORTED_CATALOG);

          // scoredGroups: strictly increasing (sorted and unique), never shrinking.
          for (let i = 1; i < next.scoredGroups.length; i++) {
            if (!((next.scoredGroups[i - 1] as string) < (next.scoredGroups[i] as string))) {
              return fail(`scoredGroups not sorted and unique at ${i}: ${ctx}`);
            }
          }
          expect(next.scoredGroups.length, `scoredGroups never shrinks: ${ctx}`).toBeGreaterThanOrEqual(scoredPrev.length);
          for (const id of scoredPrev) expect(next.scoredGroups.includes(id), `scoredGroups keeps ${id}: ${ctx}`).toBe(true);
          scoredPrev = next.scoredGroups;

          // Phase and pending go together; the log grows by the accepted action.
          expect(next.phase === "GUESS_COLLECT", `GUESS_COLLECT iff pending: ${ctx}`).toBe(next.pending !== null);
          expect(next.log, `log: ${ctx}`).toHaveLength(index + 1);
          expect(next.log[index]?.type).toBe(action.type);

          state = next;
        });

        expect(state.phase).toBe(reach.state.phase);
        if (state.phase === "ENDED") endedGames++;
      }),
      { seed: SEED_P13, numRuns: NUM_RUNS_P13 },
    );

    // Not vacuous: plays of real length, and some of them reach ENDED.
    expect(totalSteps).toBeGreaterThan(NUM_RUNS_P13 * 20);
    expect(endedGames, "games that reached ENDED").toBeGreaterThanOrEqual(10);
    if (process.env.QROKER_COVERAGE_LOG === "1") console.info("P13 coverage", JSON.stringify({ games, totalSteps, endedGames }));
  });
});

// ---------------------------------------------------------------------------------------------------------
// Property 14: Action authorization
// ---------------------------------------------------------------------------------------------------------

type Verdict = { readonly ok: true } | { readonly ok: false; readonly code: ErrorCode };
const ACCEPT: Verdict = { ok: true };
const reject = (code: ErrorCode): Verdict => ({ ok: false, code });

const isCoordinate = (n: unknown): boolean => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 7;

/**
 * The independent authorization verdict: GAME_ENDED first, then the action's phase, then the known player, turn
 * ownership, card in hand, and the board checks (orientation, bounds, occupancy, adjacency). A submission is checked
 * for a known seat, a seat that has not submitted yet, and exactly the quad keys of the pending batch (the probes only
 * use valid integer guesses; guess value errors belong to the submission-protocol property of task 8.4).
 */
function oracle(state: GameState, action: unknown): Verdict {
  if (state.phase === "ENDED") return reject("GAME_ENDED");
  const a: Record<string, unknown> =
    typeof action === "object" && action !== null ? (action as Record<string, unknown>) : {};
  switch (a.type) {
    case "PLACE": {
      if (state.phase !== "PLACEMENT") return reject("WRONG_PHASE");
      if (!SEAT_IDS.includes(a.player as PlayerId)) return reject("UNKNOWN_PLAYER");
      if (a.player !== state.turn) return reject("NOT_YOUR_TURN");
      if (!(state.hands[a.player as PlayerId] as readonly unknown[]).includes(a.card)) return reject("CARD_NOT_IN_HAND");
      if (a.orientation !== 0 && a.orientation !== 180) return reject("INVALID_ORIENTATION");
      const pos = a.pos as { row?: unknown; col?: unknown } | null | undefined;
      if (typeof pos !== "object" || pos === null || !isCoordinate(pos.row) || !isCoordinate(pos.col)) {
        return reject("OUT_OF_BOUNDS");
      }
      const row = pos.row as number;
      const col = pos.col as number;
      if (state.board[row * 8 + col] !== null) return reject("OCCUPIED");
      const neighbours = [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]] as const;
      const touches = neighbours.some(([r, c]) => r >= 0 && r <= 7 && c >= 0 && c <= 7 && state.board[r * 8 + c] !== null);
      return touches ? ACCEPT : reject("NOT_ADJACENT");
    }
    case "SUBMIT_GUESSES": {
      if (state.phase !== "GUESS_COLLECT" || state.pending === null) return reject("WRONG_PHASE");
      if (!SEAT_IDS.includes(a.player as PlayerId)) return reject("UNKNOWN_PLAYER");
      if (state.pending.guesses[a.player as PlayerId] !== undefined) return reject("DUPLICATE_SUBMISSION");
      const keys = Object.keys(a.guesses as object).sort();
      const expected = state.pending.codes.map((code) => code.quadKey).sort();
      return keys.length === expected.length && keys.every((key, i) => key === expected[i]) ? ACCEPT : reject("GUESS_KEYS_MISMATCH");
    }
    case "ACK_REVEAL":
      return state.phase === "REVEAL" ? ACCEPT : reject("WRONG_PHASE");
    default:
      return reject("WRONG_PHASE");
  }
}

interface Probe {
  readonly label: string;
  readonly action: unknown;
}

const EMPTY_CELLS = (board: GameState["board"], wantAdjacent: boolean): [number, number][] => {
  const out: [number, number][] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (board[row * 8 + col] !== null) continue;
      const touches = [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]].some(
        ([r, c]) => (r as number) >= 0 && (r as number) <= 7 && (c as number) >= 0 && (c as number) <= 7 && board[(r as number) * 8 + (c as number)] !== null,
      );
      if (touches === wantAdjacent) out.push([row, col]);
    }
  }
  return out;
};
const OCCUPIED_CELLS = (board: GameState["board"]): [number, number][] => {
  const out: [number, number][] = [];
  board.forEach((cell, i) => {
    if (cell !== null) out.push([Math.floor(i / 8), i % 8]);
  });
  return out;
};

const BAD_ORIENTATIONS: readonly unknown[] = [90, 270, 1, 360, -180, 0.5, Number.NaN, "0", "180", null, undefined, true, [], {}];
const BAD_POSITIONS: readonly unknown[] = [
  { row: -1, col: 0 }, { row: 0, col: -1 }, { row: 8, col: 0 }, { row: 0, col: 8 }, { row: 100, col: 3 },
  { row: 1.5, col: 2 }, { row: 2, col: 0.5 }, { row: Number.NaN, col: 1 }, { row: 1, col: Number.POSITIVE_INFINITY },
  { row: "1", col: 1 }, { row: 1 }, {}, null, undefined, 5,
];
const BAD_PLAYERS: readonly unknown[] = ["P4", "p0", "", "P", "NEUTRAL", undefined, null, 0, 1];

/** A set of actions for `state`: the legal action, single faults of every kind, combinations and wrong-phase actions. */
function buildProbes(state: GameState, choice: Choice, style: PlayStyle): Probe[] {
  const probes: Probe[] = [];
  const board = state.board;
  const turn = state.turn;
  const hand = state.hands[turn];
  const adjacent = EMPTY_CELLS(board, true);
  const far = EMPTY_CELLS(board, false);
  const occupied = OCCUPIED_CELLS(board);
  const pickOf = <T,>(items: readonly T[]): T | undefined => (items.length === 0 ? undefined : (items[choice(items.length)] as T));
  const cellOf = (cells: readonly [number, number][]): { row: number; col: number } | undefined => {
    const c = pickOf(cells);
    return c === undefined ? undefined : { row: c[0], col: c[1] };
  };
  const otherSeats = SEAT_IDS.filter((seat) => seat !== turn);
  const outsideHand = CATALOG.filter((card) => !(hand as readonly string[]).includes(card));

  const legalPos = cellOf(adjacent);
  const base = (over: Record<string, unknown>): Record<string, unknown> => ({
    type: "PLACE", player: turn, card: hand[0], pos: legalPos, orientation: 0, ...over,
  });
  const add = (label: string, action: unknown): void => {
    probes.push({ label, action });
  };

  const legal = randomLegalAction(state, choice, style);
  if (legal !== null) add("legal", legal);

  const other = pickOf(otherSeats) as PlayerId;
  add("place by another seat (own cards)", base({ player: other, card: state.hands[other][0] }));
  add("place by another seat with the turn seat's card", base({ player: other }));
  add("place by an unknown player", base({ player: pickOf(BAD_PLAYERS) }));
  add("card not in hand", base({ card: pickOf(outsideHand) }));
  add("malformed card", base({ card: pickOf(["X-1", "", "H-11", "h-a", 7, null, undefined]) }));
  add("invalid orientation", base({ orientation: pickOf(BAD_ORIENTATIONS) }));
  add("negative-zero orientation", base({ orientation: -0 }));
  add("orientation 180", base({ orientation: 180 }));
  add("out-of-range or malformed cell", base({ pos: pickOf(BAD_POSITIONS) }));
  const occupiedPos = cellOf(occupied);
  add("occupied cell", base({ pos: occupiedPos }));
  const farPos = cellOf(far);
  if (farPos !== undefined) add("non-adjacent cell", base({ pos: farPos }));

  // Combinations of faults: the verdict follows the validation order of the design.
  for (let i = 0; i < 6; i++) {
    const over: Record<string, unknown> = {};
    if (choice(2) === 0) {
      over.player = pickOf(otherSeats);
      over.card = state.hands[over.player as PlayerId][0];
    }
    if (choice(3) === 0) over.card = pickOf(outsideHand);
    if (choice(3) === 0) over.orientation = pickOf(BAD_ORIENTATIONS);
    const cellKind = choice(4);
    if (cellKind === 0) over.pos = pickOf(BAD_POSITIONS);
    else if (cellKind === 1) over.pos = occupiedPos;
    else if (cellKind === 2) over.pos = farPos;
    add(`mixed place ${i}`, base(over));
  }

  // Submissions: right keys from a seat, wrong keys, a seat that already submitted.
  const submitter = pickOf(SEAT_IDS) as PlayerId;
  const rightKeys: Record<string, number> = {};
  for (const code of state.pending?.codes ?? []) rightKeys[code.quadKey] = 4 + choice(49);
  add("submit with the batch keys", { type: "SUBMIT_GUESSES", player: submitter, guesses: rightKeys });
  add("submit with wrong keys", { type: "SUBMIT_GUESSES", player: submitter, guesses: { Z9: 10 } });
  add("submit with no guesses", { type: "SUBMIT_GUESSES", player: submitter, guesses: {} });
  add("submit by an unknown player", { type: "SUBMIT_GUESSES", player: pickOf(BAD_PLAYERS), guesses: rightKeys });
  const already = SEAT_IDS.filter((seat) => state.pending?.guesses[seat] !== undefined);
  const again = pickOf(already);
  if (again !== undefined) add("submit twice", { type: "SUBMIT_GUESSES", player: again, guesses: rightKeys });

  add("acknowledge", { type: "ACK_REVEAL" });
  add("unknown action type", { type: "NOPE" });
  add("not an action", pickOf([null, undefined, 5, "PLACE"]));
  return probes;
}

/** A phase, or GUESS_PARTIAL: GUESS_COLLECT with one to three seats already submitted. */
type TargetPhase = GamePhase | "GUESS_PARTIAL";

const TARGET_KIND: Record<TargetPhase, (s: GameState) => boolean> = {
  PLACEMENT: (s) => s.phase === "PLACEMENT",
  GUESS_COLLECT: (s) => s.phase === "GUESS_COLLECT",
  GUESS_PARTIAL: (s) => s.phase === "GUESS_COLLECT" && Object.keys(s.pending?.guesses ?? {}).length > 0,
  REVEAL: (s) => s.phase === "REVEAL",
  ENDED: (s) => s.phase === "ENDED",
};

/** A reachable state of the target kind: a prefix of the generated play when it has one, else further legal play. */
function reachPhase(reach: Reachable, target: TargetPhase, pick: number, numbers: readonly number[]): GameState | undefined {
  const kind = TARGET_KIND[target];
  const prefix = pickState(reach, kind, pick);
  if (prefix !== undefined) return prefix;
  const style: PlayStyle = { ...reach.style, codeBias: 90 };
  if (target === "ENDED") return playToEnd(reach.seed, reach.config, numbers, style).state;
  const advanced = advanceUntil(reach.states[0] as GameState, kind, numbers, style);
  return kind(advanced.state) ? advanced.state : undefined;
}

interface AuthCoverage {
  runs: number;
  noState: number;
  states: Record<GamePhase, number>;
  partialGuessStates: number;
  probes: number;
  accepted: number;
  rejected: Partial<Record<ErrorCode, number>>;
  acceptedByType: Record<string, number>;
}

const arbAuthCase = fc.record({
  reach: arbReachableState(),
  target: fc.constantFrom<TargetPhase>("PLACEMENT", "PLACEMENT", "GUESS_COLLECT", "GUESS_PARTIAL", "GUESS_PARTIAL", "REVEAL", "ENDED"),
  pick: fc.nat({ max: 1_000_000 }),
  style: arbPlayStyle,
  numbers: fc.array(fc.nat({ max: 1_000_000 }), { minLength: 400, maxLength: 400 }),
});

describe("Property 14: action authorization", () => {
  it("reduce accepts exactly the actions the independent oracle accepts; every rejection leaves the state unchanged", { timeout: TIMEOUT_MS }, () => {
    // Feature: qroker-playable-game, Property 14: Action authorization
    // Validates: Requirements 3.2, 3.3, 3.4, 3.6, 9.2
    const cov: AuthCoverage = {
      runs: 0,
      noState: 0,
      states: { PLACEMENT: 0, GUESS_COLLECT: 0, REVEAL: 0, ENDED: 0 },
      partialGuessStates: 0,
      probes: 0,
      accepted: 0,
      rejected: {},
      acceptedByType: {},
    };

    fc.assert(
      fc.property(arbAuthCase, ({ reach, target, pick, style, numbers }) => {
        cov.runs++;
        const state = reachPhase(reach, target, pick, numbers);
        if (state === undefined) {
          cov.noState++;
          return;
        }
        cov.states[state.phase]++;
        if (state.phase === "GUESS_COLLECT" && Object.keys(state.pending?.guesses ?? {}).length > 0) cov.partialGuessStates++;

        const before = structuredClone(state);
        const probes = buildProbes(state, choiceFrom(numbers.slice(100)), style);
        for (const probe of probes) {
          cov.probes++;
          const ctx = `${where(reach)} state=${state.phase}/${state.turn} probe="${probe.label}" ${JSON.stringify(probe.action)}`;
          const expected = oracle(state, probe.action);
          const result = reduce(state, probe.action as Action);

          if (result.ok !== expected.ok) {
            return fail(`verdict differs: engine ${result.ok ? "accepted" : `rejected ${result.error.code}`}, oracle ${expected.ok ? "accepts" : `rejects ${expected.code}`}: ${ctx}`);
          }
          if (!result.ok && !expected.ok) {
            expect(result.error.code, `error code: ${ctx}`).toBe(expected.code);
            expect("value" in result, `a rejection carries no state: ${ctx}`).toBe(false);
            cov.rejected[expected.code] = (cov.rejected[expected.code] ?? 0) + 1;
            if (state.phase === "ENDED") expect(result.error.code, `after ENDED: ${ctx}`).toBe("GAME_ENDED");
          } else if (result.ok) {
            cov.accepted++;
            const type = (probe.action as { type: string }).type;
            cov.acceptedByType[type] = (cov.acceptedByType[type] ?? 0) + 1;
            expect(state.phase, `accepted in ENDED: ${ctx}`).not.toBe("ENDED");
            expect(result.value, ctx).not.toBe(state);
            expect(result.value.log, `log grows by one: ${ctx}`).toHaveLength(state.log.length + 1);
            expect(isDeepFrozen(result.value), `returned state frozen: ${ctx}`).toBe(true);
          }
          // Rejected or accepted, the input state is unchanged.
          expect(state, `input state unchanged: ${ctx}`).toEqual(before);
        }
        expect(isDeepFrozen(state)).toBe(true);
      }),
      { seed: SEED_P14, numRuns: NUM_RUNS_P14 },
    );

    // Not vacuous: all four phases, every error code of the authorization order, and accepted actions of each type.
    // (Observed numbers: see the notes at the end of this file.)
    if (process.env.QROKER_COVERAGE_LOG === "1") console.info("P14 coverage", JSON.stringify(cov));
    expect(cov.noState).toBeLessThanOrEqual(Math.floor(cov.runs / 10));
    for (const phase of ["PLACEMENT", "GUESS_COLLECT", "REVEAL", "ENDED"] as const) {
      expect(cov.states[phase], `states in ${phase}`).toBeGreaterThanOrEqual(15);
    }
    expect(cov.partialGuessStates, "GUESS_COLLECT states with some submissions").toBeGreaterThanOrEqual(3);
    const codes: readonly ErrorCode[] = [
      "GAME_ENDED", "WRONG_PHASE", "UNKNOWN_PLAYER", "NOT_YOUR_TURN", "CARD_NOT_IN_HAND", "INVALID_ORIENTATION",
      "OUT_OF_BOUNDS", "OCCUPIED", "NOT_ADJACENT", "DUPLICATE_SUBMISSION", "GUESS_KEYS_MISMATCH",
    ];
    for (const code of codes) expect(cov.rejected[code] ?? 0, `rejections with ${code}`).toBeGreaterThanOrEqual(20);
    for (const type of ["PLACE", "SUBMIT_GUESSES", "ACK_REVEAL"]) {
      expect(cov.acceptedByType[type] ?? 0, `accepted ${type}`).toBeGreaterThanOrEqual(20);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// Notes: runs, durations and observed coverage (fixed seeds; machine: Windows, Node, vitest 5.1; times vary)
// ---------------------------------------------------------------------------------------------------------
//
// Runs: Property 4: 300 (about 0.4 s). Property 12: 300 (about 4 s). Property 13: 200 games, 7829 accepted actions
// in total (about 9 s). Property 14: 200 states x about 25 probes = 5016 verdicts (about 6 s).
//
// Property 12 (300 placements; set QROKER_COVERAGE_LOG=1 to print the counters): 80 first placements (9 of them
// form a code), 122 code placements (113 by a seat that had already placed), 60 draws from a non-empty deck, 74
// placements with an empty deck (47 of them non-first without a code, so a card is NOT drawn), 6 placements that end
// the game at once, 23 code placements that empty the hand (endsGame), 41 states reached by further legal play, 65
// cases that fell back to any PLACEMENT prefix state. Placements that form TWO codes at once were seen 0 times in
// 300 (random legal play rarely offers one; an exploration of 600 games with codeBias 90 found 5), so no guard
// requires them: the oracle counts any number of codes, and the two-code scenario is covered by the example test of
// task 8.2 (engine.test.ts).
//
// Property 13: 92 of the 200 games reached ENDED.
//
// Property 14: states by phase PLACEMENT 65, GUESS_COLLECT 78 (51 with some submissions already), REVEAL 25, ENDED
// 32. Rejections: WRONG_PHASE 2590, GAME_ENDED 765, NOT_YOUR_TURN 328, CARD_NOT_IN_HAND 194, UNKNOWN_PLAYER 143,
// GUESS_KEYS_MISMATCH 134, INVALID_ORIENTATION 100, OUT_OF_BOUNDS 85, OCCUPIED 91, NOT_ADJACENT 82,
// DUPLICATE_SUBMISSION 84. Accepted: 225 PLACE, 145 SUBMIT_GUESSES, 50 ACK_REVEAL.
