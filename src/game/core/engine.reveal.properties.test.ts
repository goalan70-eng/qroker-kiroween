// Property tests for guess collection, reveal and game end (task 8.4): Property 17 (simultaneous reveal), Property 18
// (submission protocol) and Property 19 (hand-empty bonus and game end ordering) of
// .kiro/specs/qroker-playable-game/design.md. Requirements 7.3, 7.4, 7.6, 7.7, 8.6, 8.7, 8.8, 9.1, 9.3.
//
// Each property is ONE test with ONE fc.assert and a fixed seed (see SEED_* and NUM_RUNS_*). A failing case is
// reproducible: the failure message names the fast-check seed (fast-check prints it), the game seed, the whole
// configuration and the complete accepted action list (`withContext`); `replayActions` rebuilds the states from them.
//
// Reachability: every state comes from `newGame` followed by accepted `reduce` calls. Nothing is built by hand
// (no `makeState`). Batches of ONE code come from random legal play. Batches of TWO codes are rare in random play
// (about 1 game in 120 offers one), so `driveToBatch` uses a targeted driver: at every PLACEMENT it asks the engine's own
// detector (`legalPlacements`) whether some legal placement forms two codes, takes it if so, and otherwise steers the
// board toward such a placement with a potential function (number of 2x2 regions whose occupied cells are all valid
// members). The driver only CHOOSES legal actions; the engine validates and applies every one of them with `reduce`.
//
// Oracles are written in this file and read none of the modules under test: a literal catalog, its own printed-corner
// table and rank table, its own brute-force scan of the 2x2 regions that contain the placed cell, its own score lookup
// (|guess - hiddenSum| indexes the table of the configuration the TEST passed to `newGame`), its own submission verdict
// and its own bookkeeping of hands, deck, batches and scores. The engine is called through `newGame` and `reduce`
// (and `actingSeats`, whose contract is part of Property 18); the generators only choose actions.
//
// PRIVACY: the action log holds the private Guess values by design (replay logs, decision D5). The log is therefore
// used here only as test INPUT and as the POSITIVE CONTROL of the leak searches. No assertion treats it as public.
//
// Coverage guards: after each assertion the test checks that every case kind occurred a minimum number of times, so
// that a property cannot pass because its interesting cases never happen. The observed numbers of the fixed-seed
// runs are documented in the notes at the end of this file.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cellAt, placeOnBoard } from "./board";
import type { Board } from "./board";
import { actingSeats, reduce } from "./engine";
import { isValidMember } from "./fragment-layout";
import { quadCells } from "./geometry";
import type { GameState, PendingBatch } from "./state";
import { arbSeed } from "./testing/card-generators";
import {
  advanceUntil,
  arbConfig,
  arbPlayStyle,
  arbReachableState,
  choiceFrom,
  describeReachable,
  legalPlacements,
  pickState,
  playToEnd,
  randomLegalAction,
  replayActions,
} from "./testing/state-generators";
import type { Choice, PlayStyle, Reachable } from "./testing/state-generators";
import type { Action, ErrorCode, GameConfig, PlayerId, Slot } from "./types";

// ---------------------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------------------

const SEED_P17 = 20260817;
const SEED_P18 = 20260818;
const SEED_P19 = 20260819;
const NUM_RUNS_P17 = 150;
const NUM_RUNS_P18 = 120;
const NUM_RUNS_P19 = 200;
const TIMEOUT_MS = 180_000;
const LOG_COVERAGE = process.env.QROKER_COVERAGE_LOG === "1";

// ---------------------------------------------------------------------------------------------------------
// Independent oracles
// ---------------------------------------------------------------------------------------------------------

/** The 52 cards, written out as a literal list (sorted for comparison). */
const SORTED_CATALOG: readonly string[] = [
  "H-A", "H-2", "H-3", "H-4", "H-5", "H-6", "H-7", "H-8", "H-9", "H-10", "H-J", "H-Q", "H-K",
  "D-A", "D-2", "D-3", "D-4", "D-5", "D-6", "D-7", "D-8", "D-9", "D-10", "D-J", "D-Q", "D-K",
  "C-A", "C-2", "C-3", "C-4", "C-5", "C-6", "C-7", "C-8", "C-9", "C-10", "C-J", "C-Q", "C-K",
  "S-A", "S-2", "S-3", "S-4", "S-5", "S-6", "S-7", "S-8", "S-9", "S-10", "S-J", "S-Q", "S-K",
].sort();

const SEAT_IDS: readonly PlayerId[] = ["P0", "P1", "P2", "P3"];

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
 * regions that contain the cell; a region is a code when its four cells are occupied, every member is valid for its
 * slot, the cards are pairwise distinct and the group id is not in `scoredBefore`. Ordered by quad key.
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

/** Reward of one guess: the table entry at the error |guess - hiddenSum|, 0 beyond the table. */
function oracleReward(table: readonly number[], guess: number, hiddenSum: number): number {
  const error = Math.abs(guess - hiddenSum);
  return error < table.length ? (table[error] as number) : 0;
}

type Guesses = Record<PlayerId, Record<string, number>>;
type Scores = Record<PlayerId, number>;

interface OracleRecord {
  batchIndex: number;
  placer: PlayerId;
  codes: { quadKey: string; cards: string[]; hiddenSum: number }[];
  perPlayer: { player: PlayerId; earned: number; cumulative: number }[];
}

interface Outcome {
  readonly record: OracleRecord;
  readonly earned: Scores;
  /** Final scores of the seats after the reveal and, when the placement emptied the hand, the bonus of the placer. */
  readonly finalScores: Scores;
}

/**
 * The expected outcome of a fully collected batch. `earned` of a seat sums the rewards over the codes in batch order
 * (starting at 0); the cumulative is the previous score plus `earned`; the placer gets the bonus on top when the
 * placement emptied the hand. The record holds no guess and no bonus.
 */
function oracleOutcome(
  codes: readonly OracleCode[],
  guesses: Guesses,
  table: readonly number[],
  bonus: number,
  before: Scores,
  placer: PlayerId,
  endsGame: boolean,
  batchIndex: number,
): Outcome {
  const earned = {} as Scores;
  const finalScores = {} as Scores;
  const perPlayer: OracleRecord["perPlayer"] = [];
  for (const seat of SEAT_IDS) {
    let sum = 0;
    for (const code of codes) sum += oracleReward(table, (guesses[seat] as Record<string, number>)[code.quadKey] as number, code.hiddenSum);
    earned[seat] = sum;
    const cumulative = before[seat] + sum;
    perPlayer.push({ player: seat, earned: sum, cumulative });
    finalScores[seat] = endsGame && seat === placer ? cumulative + bonus : cumulative;
  }
  return {
    record: {
      batchIndex,
      placer,
      codes: codes.map((code) => ({ quadKey: code.quadKey, cards: [...code.cards], hiddenSum: code.hiddenSum })),
      perPlayer,
    },
    earned,
    finalScores,
  };
}

/** Every card held by the board, the four hands and the deck. */
function allCards(state: GameState): string[] {
  const onBoard = state.board.flatMap((cell) => (cell === null ? [] : [cell.card as string]));
  return [...onBoard, ...SEAT_IDS.flatMap((seat) => state.hands[seat] as readonly string[]), ...state.deck];
}

/** Copy of `value` without the listed keys (shallow). */
function without<T extends object>(value: T, keys: readonly (keyof T)[]): Partial<T> {
  const copy: Partial<T> = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

/** Relative closeness for sums whose order of additions is a bookkeeping choice (fractional tables). */
const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** JSON for messages: bigint, NaN, Infinity and undefined are printed readably. */
function show(value: unknown): string {
  try {
    return (
      JSON.stringify(value, (_key, v: unknown) => {
        if (typeof v === "bigint") return `${v}n`;
        if (typeof v === "number" && !Number.isFinite(v)) return String(v);
        if (v === undefined) return "__undefined__";
        return v;
      }) ?? String(value)
    );
  } catch {
    return String(value);
  }
}

function fail(message: string): never {
  throw new Error(message);
}

/** Runs `body`; a failure is rethrown with `context()` (seed, config, action list) appended, for reproduction. */
function withContext(context: () => string, body: () => void): void {
  try {
    body();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n--- reproduce with replayActions ---\n${context()}`);
  }
}

const contextOf = (r: { seed: number; config: GameConfig }, actions: readonly Action[]): string =>
  `seed=${r.seed} config=${JSON.stringify(r.config)} actions=${JSON.stringify(actions)}`;

/** A regular expression for the guess needle `"KEY":VALUE` (the object-entry form in which a guess is stored). */
const needle = (quadKey: string, value: number): RegExp => new RegExp(`"${quadKey}":${value}(?![0-9.])`);

/** All 24 orders of the four seat indexes, in a fixed (lexicographic) order. */
function permutationsOf(items: readonly number[]): number[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) => permutationsOf([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}
const PERMUTATIONS: readonly (readonly number[])[] = permutationsOf([0, 1, 2, 3]);

// ---------------------------------------------------------------------------------------------------------
// Reaching a fresh Prediction_Batch by legal play (1 or 2 codes)
// ---------------------------------------------------------------------------------------------------------

type PlaceAction = Extract<Action, { type: "PLACE" }>;

interface BatchCase {
  /** All accepted actions from `newGame` up to and including the PLACE that opened the batch. */
  readonly actions: readonly Action[];
  /** The PLACEMENT state before the opening PLACE. */
  readonly before: GameState;
  readonly place: PlaceAction;
  /** The GUESS_COLLECT state right after the PLACE: nobody has submitted yet. */
  readonly state: GameState;
  /** `prefix`: found inside the generated random play; `driven`: reached by further legal play. */
  readonly source: "prefix" | "driven";
}

const SLOT_NAMES: readonly Slot[] = ["TL", "TR", "BL", "BR"];
const POTENTIAL_BY_VALID_CELLS: readonly number[] = [0, 0.2, 1, 6];

/**
 * Steering value of a board for the two-code driver: every 2x2 region that is not full and whose occupied cells are all
 * valid members of their slots counts more the more valid cells it holds. Pure heuristic, no rule of the game.
 */
function potential(board: Board): number {
  let total = 0;
  for (let row = 0; row <= 6; row++) {
    for (let col = 0; col <= 6; col++) {
      let valid = 0;
      let occupied = 0;
      let spoiled = false;
      quadCells({ row, col }).forEach((pos, i) => {
        const placed = cellAt(board, pos);
        if (placed === null) return;
        occupied++;
        if (isValidMember(placed.card, placed.orientation, SLOT_NAMES[i] as Slot)) valid++;
        else spoiled = true;
      });
      if (!spoiled && occupied < 4) total += POTENTIAL_BY_VALID_CELLS[valid] as number;
    }
  }
  return total;
}

function applyOk(state: GameState, action: Action, what: string): GameState {
  const result = reduce(state, action);
  if (!result.ok) return fail(`legal action rejected with ${result.error.code} (${what}): ${show(action)}`);
  return result.value;
}

/**
 * A fresh batch of exactly `want` codes. First looks inside the generated play for a state right after a PLACE that
 * opened such a batch; otherwise continues legal play from a prefix state until a placement forms `want` codes
 * (`want = 2`: steered by `potential`, see the file comment). Returns `undefined` when the cap is reached.
 */
function driveToBatch(reach: Reachable, want: 1 | 2, pick: number, numbers: readonly number[], cap = 400): BatchCase | undefined {
  const states = reach.states;
  const n = states.length;
  const fresh = (s: GameState): boolean =>
    s.phase === "GUESS_COLLECT" && s.pending !== null && s.pending.codes.length === want && Object.keys(s.pending.guesses).length === 0;
  for (let k = 0; k < n; k++) {
    const i = (Math.abs(pick) + k) % n;
    const state = states[i] as GameState;
    if (i >= 1 && fresh(state)) {
      return {
        actions: reach.actions.slice(0, i),
        before: states[i - 1] as GameState,
        place: reach.actions[i - 1] as PlaceAction,
        state,
        source: "prefix",
      };
    }
  }

  const choice: Choice = choiceFrom(numbers);
  const startIndex = Math.abs(pick) % n;
  let state: GameState = (states[startIndex] as GameState).phase === "ENDED" ? (states[0] as GameState) : (states[startIndex] as GameState);
  const actions: Action[] = reach.actions.slice(0, states.indexOf(state));
  const filler: PlayStyle = { codeBias: 0, submitOrder: "RANDOM" };

  for (let step = 0; step < cap; step++) {
    if (state.phase === "ENDED") return undefined;
    let action: Action | null;
    if (state.phase === "PLACEMENT") {
      const all = legalPlacements(state);
      const matching = all.filter((p) => p.newCodes === want);
      const quiet = all.filter((p) => p.newCodes === 0);
      let chosen: PlaceAction | undefined;
      if (matching.length > 0 && (want === 2 || choice(100) < 40)) {
        chosen = matching[choice(matching.length)]?.action;
      } else if (quiet.length > 0 && want === 2) {
        const scored = quiet.map((p) => {
          const placed = placeOnBoard(state.board, p.action.pos, { card: p.action.card, orientation: p.action.orientation, owner: state.turn });
          return { p, value: placed.ok ? potential(placed.value) : -1 };
        });
        scored.sort((a, b) => b.value - a.value);
        const top = scored.slice(0, 3);
        chosen = top[choice(top.length)]?.p.action;
      } else {
        const pool = quiet.length > 0 ? quiet : all;
        chosen = pool[choice(pool.length)]?.action;
      }
      action = chosen ?? null;
      if (action !== null && matching.some((p) => p.action === chosen)) {
        const next = applyOk(state, action, "opening placement");
        if (next.phase !== "GUESS_COLLECT" || next.pending?.codes.length !== want) {
          return fail(`the detector announced ${want} codes but the placement gave ${next.pending?.codes.length ?? 0}`);
        }
        return { actions: [...actions, action], before: state, place: action as PlaceAction, state: next, source: "driven" };
      }
    } else {
      action = randomLegalAction(state, choice, filler);
    }
    if (action === null) return undefined;
    state = applyOk(state, action, `step ${step}`);
    actions.push(action);
  }
  return undefined;
}

/** A generated guess for one (seat, code): exact, near (1 to 4 away) or far (any value). */
interface GuessSpec {
  readonly kind: 0 | 1 | 2;
  readonly delta: number;
  readonly sign: 1 | -1;
  readonly far: number;
}

const arbGuessSpec: fc.Arbitrary<GuessSpec> = fc.record({
  kind: fc.constantFrom<0 | 1 | 2>(0, 1, 1, 2),
  delta: fc.integer({ min: 1, max: 4 }),
  sign: fc.constantFrom<1 | -1>(1, -1),
  far: fc.integer({ min: 4, max: 52 }),
});
/** Eight specs: seat index * 2 + code index. */
const arbSpecs: fc.Arbitrary<GuessSpec[]> = fc.array(arbGuessSpec, { minLength: 8, maxLength: 8 });
const arbNumbers = (length: number): fc.Arbitrary<number[]> => fc.array(fc.nat({ max: 1_000_000 }), { minLength: length, maxLength: length });

const clampGuess = (v: number): number => Math.min(52, Math.max(4, v));

/**
 * Valid guesses (integers 4..52) for every seat and code. Within one code the four seats get DIFFERENT values (a
 * collision is moved to the next free value), so that the object-entry needle `"KEY":VALUE` identifies one
 * (seat, code) pair of the run.
 */
function realizeGuesses(codes: readonly OracleCode[], specs: readonly GuessSpec[]): Guesses {
  const out = { P0: {}, P1: {}, P2: {}, P3: {} } as Guesses;
  codes.forEach((code, j) => {
    const used = new Set<number>();
    SEAT_IDS.forEach((seat, s) => {
      const spec = specs[s * 2 + j] as GuessSpec;
      let value = spec.kind === 0 ? code.hiddenSum : spec.kind === 1 ? clampGuess(code.hiddenSum + spec.sign * spec.delta) : spec.far;
      while (used.has(value)) value = value === 52 ? 4 : value + 1;
      used.add(value);
      (out[seat] as Record<string, number>)[code.quadKey] = value;
    });
  });
  return out;
}

const submitAction = (seat: PlayerId, guesses: Guesses): Action => ({ type: "SUBMIT_GUESSES", player: seat, guesses: { ...(guesses[seat] as Record<string, number>) } });

/** The codes of a batch case by the independent scan, checked against the engine's pending batch. */
function oracleCodesOf(b: BatchCase): OracleCode[] {
  const pending = b.state.pending as PendingBatch;
  const codes = oracleNewCodes(b.state.board, b.place.pos.row, b.place.pos.col, b.before.scoredGroups);
  expect(pending.codes.map((code) => code.quadKey), "quad keys of the pending batch").toEqual(codes.map((code) => code.quadKey));
  expect(pending.codes.map((code) => code.hiddenSum), "hidden sums of the pending batch").toEqual(codes.map((code) => code.hiddenSum));
  expect(pending.codes.map((code) => [...code.cards]), "cards of the pending batch").toEqual(codes.map((code) => [...code.cards]));
  return codes;
}

// ---------------------------------------------------------------------------------------------------------
// Property 17: Simultaneous reveal
// ---------------------------------------------------------------------------------------------------------

interface RevealCoverage {
  runs: number;
  skipped: number;
  prefixBatches: number;
  drivenBatches: number;
  batchSize: Record<1 | 2, number>;
  endsGameBatches: number;
  laterBatches: number;
  permutationsChecked: number;
  submissions: number;
  guessExact: number;
  guessNear: number;
  guessFar: number;
  guessBeyondTable: number;
  guessesWithReward: number;
  guessesZeroReward: number;
  partialStatesChecked: number;
  seatsWithEarned: number;
}

const arbRevealCase = fc.record({
  reach: arbReachableState({ maxSteps: 70 }),
  want: fc.constantFrom<1 | 2>(1, 2),
  pick: fc.nat({ max: 1_000_000 }),
  numbers: arbNumbers(400),
  specs: arbSpecs,
});

describe("Property 17: simultaneous reveal", () => {
  it(
    "the four submissions in any of the 24 orders give one state; no reveal before the 4th; earned = sum of rewards; no guess in the record",
    { timeout: TIMEOUT_MS },
    () => {
      // Feature: qroker-playable-game, Property 17: Simultaneous reveal
      // Validates: Requirements 7.6, 7.7, 8.6, 8.7
      const cov: RevealCoverage = {
        runs: 0, skipped: 0, prefixBatches: 0, drivenBatches: 0, batchSize: { 1: 0, 2: 0 }, endsGameBatches: 0, laterBatches: 0,
        permutationsChecked: 0, submissions: 0, guessExact: 0, guessNear: 0, guessFar: 0, guessBeyondTable: 0,
        guessesWithReward: 0, guessesZeroReward: 0, partialStatesChecked: 0, seatsWithEarned: 0,
      };

      fc.assert(
        fc.property(arbRevealCase, ({ reach, want, pick, numbers, specs }) => {
          cov.runs++;
          const batchCase = driveToBatch(reach, want, pick, numbers);
          if (batchCase === undefined) {
            cov.skipped++;
            return;
          }
          const { before, place, state: batch } = batchCase;
          withContext(
            () => contextOf(reach, batchCase.actions),
            () => {
              const table = reach.config.scoreConfig.config.rewardByError;
              const bonus = reach.config.scoreConfig.config.handEmptyBonus;
              const pending = batch.pending as PendingBatch;
              if (batchCase.source === "prefix") cov.prefixBatches++;
              else cov.drivenBatches++;
              cov.batchSize[want]++;
              if (pending.endsGame) cov.endsGameBatches++;
              if (before.history.length > 0) cov.laterBatches++;

              // The sequence of actions is reachable: replaying it from newGame gives the same batch state.
              const replayed = replayActions(reach.seed, reach.config, batchCase.actions);
              expect(replayed[replayed.length - 1], "the batch state is reachable by replay").toEqual(batch);

              // Completion bonus: forming codes adds nothing to any score, and nothing is revealed yet.
              expect(batch.scores, "a placement that forms codes adds no points").toEqual(before.scores);
              expect(batch.history).toEqual(before.history);
              expect(batch.lastReveal).toEqual(before.lastReveal);

              const codes = oracleCodesOf(batchCase);
              expect(codes.length).toBe(want);
              const guesses = realizeGuesses(codes, specs);
              const outcome = oracleOutcome(codes, guesses, table, bonus, before.scores, place.player, batch.hands[place.player].length === 0, before.history.length);
              const actions = SEAT_IDS.map((seat) => submitAction(seat, guesses));
              const needles: { seat: PlayerId; quadKey: string; value: number }[] = SEAT_IDS.flatMap((seat) =>
                codes.map((code) => ({ seat, quadKey: code.quadKey, value: (guesses[seat] as Record<string, number>)[code.quadKey] as number })),
              );
              // Guess statistics.
              for (const n of needles) {
                const code = codes.find((c) => c.quadKey === n.quadKey) as OracleCode;
                const error = Math.abs(n.value - code.hiddenSum);
                if (error === 0) cov.guessExact++;
                else if (error <= 4) cov.guessNear++;
                else cov.guessFar++;
                if (error >= table.length) cov.guessBeyondTable++;
                if (oracleReward(table, n.value, code.hiddenSum) > 0) cov.guessesWithReward++;
                else cov.guessesZeroReward++;
              }
              cov.submissions += needles.length;
              for (const seat of SEAT_IDS) if ((outcome.earned[seat] as number) > 0) cov.seatsWithEarned++;

              const baseRest = JSON.stringify(without(batch, ["pending", "log"]));
              for (const n of needles) expect(needle(n.quadKey, n.value).test(baseRest), `no guess needle in the state before any submission: ${n.seat} ${n.quadKey}`).toBe(false);

              const finals: GameState[] = [];
              for (const order of PERMUTATIONS) {
                cov.permutationsChecked++;
                let state = batch;
                const submitted: PlayerId[] = [];
                order.forEach((seatIndex, t) => {
                  const seat = SEAT_IDS[seatIndex] as PlayerId;
                  const label = `order ${order.map((i) => SEAT_IDS[i]).join(",")}, submission ${t + 1} by ${seat}`;
                  const result = reduce(state, actions[seatIndex] as Action);
                  if (!result.ok) return fail(`valid submission rejected with ${result.error.code}: ${label}`);
                  state = result.value;
                  submitted.push(seat);
                  if (t < 3) {
                    cov.partialStatesChecked++;
                    // No reveal yet: only the sealed batch and the log changed; scores, history, lastReveal, phase and
                    // every other field are exactly those of the batch state.
                    expect(state.phase, `phase after ${t + 1} submissions: ${label}`).toBe("GUESS_COLLECT");
                    expect(JSON.stringify(without(state, ["pending", "log"])), `nothing but pending and log changed: ${label}`).toBe(baseRest);
                    const sealed = state.pending as PendingBatch;
                    expect(Object.keys(sealed.guesses).sort(), `submitted seats: ${label}`).toEqual([...submitted].sort());
                    for (const s of submitted) expect(sealed.guesses[s], `sealed guesses of ${s}: ${label}`).toEqual(guesses[s]);
                    // Positive control: the sealed batch holds the needles of the submitted seats and only theirs.
                    const sealedJson = JSON.stringify(sealed);
                    for (const n of needles) expect(needle(n.quadKey, n.value).test(sealedJson), `needle ${n.seat} ${n.quadKey} in pending: ${label}`).toBe(submitted.includes(n.seat));
                    expect(actingSeats(state), `acting seats: ${label}`).toEqual(SEAT_IDS.filter((s) => !submitted.includes(s)));
                  }
                });
                finals.push(state);
              }

              // Confluence: all 24 final states are identical except the order of the log entries.
              const first = finals[0] as GameState;
              const logTail = (s: GameState): string[] => s.log.slice(batch.log.length).map((entry) => JSON.stringify(entry)).sort();
              finals.forEach((final, i) => {
                const order = PERMUTATIONS[i] as readonly number[];
                expect(without(final, ["log"]), `final state of order ${order.join("")} equals the first`).toEqual(without(first, ["log"]));
                expect(logTail(final), `the log holds the same four submissions: order ${order.join("")}`).toEqual(logTail(first));
                expect(final.log.slice(0, batch.log.length)).toEqual(batch.log);
                expect(final.log.slice(batch.log.length), `the log keeps the order of acceptance: order ${order.join("")}`).toEqual(order.map((idx) => actions[idx]));
              });

              // The outcome equals the independent oracle.
              const final = first;
              expect(final.phase, "phase after the reveal").toBe(pending.endsGame ? "ENDED" : "REVEAL");
              expect(final.bonusAwarded, "bonus seat").toBe(batch.hands[place.player].length === 0 ? place.player : null);
              expect(final.pending, "pending is cleared by the reveal").toBeNull();
              expect(final.history, "history gains exactly the new record").toEqual([...before.history, outcome.record]);
              expect(final.lastReveal, "lastReveal is the new record").toEqual(outcome.record);
              expect(final.history[final.history.length - 1]).toEqual(final.lastReveal);
              expect(final.revealedCards, "the cards of the codes become public").toEqual([...before.revealedCards, ...codes.flatMap((code) => code.cards)]);
              for (const seat of SEAT_IDS) {
                expect(final.scores[seat], `score of ${seat} = before + earned${pending.endsGame && seat === place.player ? " + bonus" : ""}`).toBe(outcome.finalScores[seat]);
              }
              // Total points are the per-code rewards only (plus the bonus once when the hand emptied): no completion bonus.
              const totalGain = SEAT_IDS.reduce((sum, seat) => sum + (final.scores[seat] as number) - (before.scores[seat] as number), 0);
              const totalRewards = SEAT_IDS.reduce((sum, seat) => sum + codes.reduce((s, code) => s + oracleReward(table, (guesses[seat] as Record<string, number>)[code.quadKey] as number, code.hiddenSum), 0), 0);
              expect(near(totalGain, totalRewards + (batch.hands[place.player].length === 0 ? bonus : 0)), `total gain ${totalGain} = rewards ${totalRewards}${pending.endsGame ? ` + bonus ${bonus}` : ""}`).toBe(true);
              // Everything else is untouched by the reveal.
              const rest = ["pending", "log", "scores", "history", "lastReveal", "revealedCards", "phase", "bonusAwarded"] as const;
              expect(without(final, rest), "board, hands, deck, turn, counters and config are unchanged").toEqual(without(batch, rest));

              // The record holds hidden sums, cards and earned points, and no guess value (key whitelist + needles).
              const record = final.lastReveal as NonNullable<GameState["lastReveal"]>;
              expect(Object.keys(record).sort()).toEqual(["batchIndex", "codes", "perPlayer", "placer"]);
              record.codes.forEach((code) => expect(Object.keys(code).sort()).toEqual(["cards", "hiddenSum", "quadKey"]));
              record.perPlayer.forEach((p) => expect(Object.keys(p).sort()).toEqual(["cumulative", "earned", "player"]));
              const publicParts: [string, string][] = [
                ["lastReveal", JSON.stringify(final.lastReveal)],
                ["history", JSON.stringify(final.history)],
                ["state without log", JSON.stringify(without(final, ["log"]))],
              ];
              for (const [name, json] of publicParts) {
                expect(/guess/i.test(json), `the word "guess" in ${name}`).toBe(false);
                for (const n of needles) expect(needle(n.quadKey, n.value).test(json), `guess ${n.seat} ${n.quadKey}=${n.value} found in ${name}`).toBe(false);
              }
              // Positive control: the same needles are found in the log (the log is internal, not public).
              const logJson = JSON.stringify(final.log);
              for (const n of needles) expect(needle(n.quadKey, n.value).test(logJson), `needle ${n.seat} ${n.quadKey} must be in the log (control)`).toBe(true);
              // Collisions inside one code are moved, so each (seat, code) needle is unique per code.
              codes.forEach((code) => expect(new Set(needles.filter((n) => n.quadKey === code.quadKey).map((n) => n.value)).size).toBe(4));
            },
          );
        }),
        { seed: SEED_P17, numRuns: NUM_RUNS_P17 },
      );

      if (LOG_COVERAGE) console.info("P17 coverage", JSON.stringify(cov));
      expect(cov.skipped, "runs without a batch").toBeLessThanOrEqual(Math.floor(cov.runs / 10));
      expect(cov.batchSize[1], "batches of 1 code").toBeGreaterThanOrEqual(50);
      expect(cov.batchSize[2], "batches of 2 codes").toBeGreaterThanOrEqual(40);
      expect(cov.drivenBatches, "batches reached by further legal play").toBeGreaterThanOrEqual(50);
      expect(cov.laterBatches, "batches opened after an earlier reveal").toBeGreaterThanOrEqual(20);
      expect(cov.endsGameBatches, "batches whose reveal ends the game").toBeGreaterThanOrEqual(1);
      expect(cov.permutationsChecked, "orders checked").toBe((cov.runs - cov.skipped) * 24);
      expect(cov.guessExact, "exact guesses").toBeGreaterThanOrEqual(70);
      expect(cov.guessNear, "near guesses").toBeGreaterThanOrEqual(250);
      expect(cov.guessFar, "far guesses").toBeGreaterThanOrEqual(100);
      expect(cov.guessBeyondTable, "guesses beyond the table").toBeGreaterThanOrEqual(100);
      expect(cov.guessesWithReward, "guesses that earn points").toBeGreaterThanOrEqual(300);
      expect(cov.guessesZeroReward, "guesses that earn nothing").toBeGreaterThanOrEqual(150);
    },
  );
});

// ---------------------------------------------------------------------------------------------------------
// Property 18: Submission protocol
// ---------------------------------------------------------------------------------------------------------

type Verdict = { readonly ok: true } | { readonly ok: false; readonly code: ErrorCode };
const ACCEPT: Verdict = { ok: true };
const reject = (code: ErrorCode): Verdict => ({ ok: false, code });

/** The independent verdict on a SUBMIT_GUESSES action: GAME_ENDED, WRONG_PHASE, UNKNOWN_PLAYER, DUPLICATE, values, keys. */
function oracleSubmit(state: GameState, action: { player: unknown; guesses: unknown }): Verdict {
  if (state.phase === "ENDED") return reject("GAME_ENDED");
  if (state.phase !== "GUESS_COLLECT" || state.pending === null) return reject("WRONG_PHASE");
  if (!SEAT_IDS.includes(action.player as PlayerId)) return reject("UNKNOWN_PLAYER");
  if (state.pending.guesses[action.player as PlayerId] !== undefined) return reject("DUPLICATE_SUBMISSION");
  const g = action.guesses;
  if (typeof g !== "object" || g === null || Array.isArray(g)) return reject("GUESS_KEYS_MISMATCH");
  const record = g as Record<string, unknown>;
  const keys = Object.keys(record);
  for (const key of keys) {
    const v = record[key];
    if (typeof v !== "number" || !Number.isInteger(v)) return reject("GUESS_NOT_INTEGER");
    if (v < 4 || v > 52) return reject("GUESS_OUT_OF_RANGE");
  }
  const expected = state.pending.codes.map((code) => code.quadKey).sort();
  const given = [...keys].sort();
  return given.length === expected.length && given.every((key, i) => key === expected[i]) ? ACCEPT : reject("GUESS_KEYS_MISMATCH");
}

/** Values that are not integers (NOT_INTEGER) and integers outside 4..52 (OUT_OF_RANGE). */
const NOT_INTEGER_VALUES: readonly unknown[] = [
  3.5, 52.5, 4.0000001, 0.5, -3.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "17", "", null, undefined,
  true, false, [], {}, [17], 10n,
];
const OUT_OF_RANGE_VALUES: readonly unknown[] = [3, 53, 0, -0, -1, -100, 1e6, 2 ** 53, Number.MAX_VALUE, 100];
const UNKNOWN_SEATS: readonly unknown[] = ["P4", "p0", "", "P", "NEUTRAL", undefined, null, 0, 1, {}];
const NON_OBJECTS: readonly unknown[] = [null, undefined, 7, "D4", "", true, [], [17], [[4]]];

interface Payload {
  readonly label: string;
  readonly value: unknown;
  /** The payload mixes valid values with one bad value: all-or-nothing probe. */
  readonly allOrNothing: boolean;
}

const shifted = (v: number): number => (v === 52 ? 4 : v + 1);

/** The submission payloads probed against a batch with the given quad keys; `own` are valid guesses for those keys. */
function buildPayloads(keys: readonly string[], own: Readonly<Record<string, number>>, bad: readonly unknown[]): Payload[] {
  const out: Payload[] = [];
  const add = (label: string, value: unknown, allOrNothing = false): void => {
    out.push({ label, value, allOrNothing });
  };
  const valid = { ...own };
  add("valid (the seat's guesses)", valid);
  add("valid, different values", Object.fromEntries(keys.map((k) => [k, shifted(valid[k] as number)])));
  if (keys.length === 2) add("valid, reversed key order", { [keys[1] as string]: valid[keys[1] as string], [keys[0] as string]: valid[keys[0] as string] });
  for (const b of bad) {
    keys.forEach((key) => add(`bad value ${show(b)} at ${key}, the rest valid`, { ...valid, [key]: b }, true));
    add(`bad value ${show(b)} on an extra key`, { ...valid, A1: b });
    add(`bad value ${show(b)} and a missing key`, { [keys[0] as string]: b });
  }
  if (keys.length === 2) {
    add("two bad values, not-integer first", { [keys[0] as string]: 3.5, [keys[1] as string]: 3 }, true);
    add("two bad values, out-of-range first", { [keys[0] as string]: 3, [keys[1] as string]: 3.5 }, true);
  }
  add("empty object", {});
  keys.forEach((key) => {
    const rest = { ...valid };
    delete rest[key];
    add(`missing ${key}`, rest);
  });
  add("extra key", { ...valid, A1: 20 });
  add("extra key only", { A1: 20 });
  add("lower-case key names", Object.fromEntries(keys.map((k) => [k.toLowerCase(), valid[k]])));
  add("padded key names", Object.fromEntries(keys.map((k) => [` ${k}`, valid[k]])));
  {
    const rest = { ...valid };
    delete rest[keys[0] as string];
    add("one key renamed (same count)", { ...rest, Z9: 20 });
  }
  for (const value of NON_OBJECTS) add(`non-object ${show(value)}`, value);
  return out;
}

interface SubmissionCoverage {
  runs: number;
  skipped: number;
  batchSize: Record<1 | 2, number>;
  submittedBefore: Record<0 | 1 | 2 | 3, number>;
  probes: number;
  accepted: number;
  rejected: Partial<Record<ErrorCode, number>>;
  allOrNothingProbes: number;
  allOrNothingTwoCode: number;
  duplicatesDifferentContent: number;
  duplicatesSameContent: number;
  otherPhases: Record<"PLACEMENT" | "REVEAL" | "ENDED", number>;
}

const arbSubmissionCase = fc.record({
  reach: arbReachableState({ maxSteps: 70 }),
  want: fc.constantFrom<1 | 2>(1, 2),
  pick: fc.nat({ max: 1_000_000 }),
  numbers: arbNumbers(400),
  specs: arbSpecs,
  submitted: fc.constantFrom<0 | 1 | 2 | 3>(0, 1, 2, 3),
  order: fc.nat({ max: 23 }),
  otherPhase: fc.constantFrom<"PLACEMENT" | "REVEAL" | "ENDED">("PLACEMENT", "REVEAL", "ENDED"),
});

describe("Property 18: submission protocol", () => {
  it(
    "reduce's verdict on SUBMIT_GUESSES equals the independent oracle; every rejection leaves the state unchanged; submissions are all-or-nothing",
    { timeout: TIMEOUT_MS },
    () => {
      // Feature: qroker-playable-game, Property 18: Submission protocol
      // Validates: Requirements 7.3, 7.4
      const cov: SubmissionCoverage = {
        runs: 0, skipped: 0, batchSize: { 1: 0, 2: 0 }, submittedBefore: { 0: 0, 1: 0, 2: 0, 3: 0 }, probes: 0, accepted: 0,
        rejected: {}, allOrNothingProbes: 0, allOrNothingTwoCode: 0, duplicatesDifferentContent: 0, duplicatesSameContent: 0,
        otherPhases: { PLACEMENT: 0, REVEAL: 0, ENDED: 0 },
      };

      /** Probes `payloads` from every seat against `state`; checks verdict, error code, and that a rejection changes nothing. */
      const probeState = (state: GameState, payloads: readonly Payload[], seats: readonly unknown[], context: string, own: Guesses | null): void => {
        const snapshot = JSON.stringify(state);
        for (const seat of seats) {
          for (const payload of payloads) {
            cov.probes++;
            const action = { type: "SUBMIT_GUESSES", player: seat, guesses: payload.value };
            const ctx = `${context} | state ${state.phase}, seat ${show(seat)}, payload "${payload.label}" ${show(payload.value)}`;
            const expected = oracleSubmit(state, action);
            const result = reduce(state, action as Action);
            if (result.ok !== expected.ok) {
              return fail(`verdict differs: engine ${result.ok ? "accepted" : `rejected ${result.error.code}`}, oracle ${expected.ok ? "accepts" : `rejects ${expected.code}`}: ${ctx}`);
            }
            if (!result.ok && !expected.ok) {
              expect(result.error.code, `error code: ${ctx}`).toBe(expected.code);
              expect("value" in result, `a rejection carries no state: ${ctx}`).toBe(false);
              cov.rejected[expected.code] = (cov.rejected[expected.code] ?? 0) + 1;
              if (payload.allOrNothing) {
                cov.allOrNothingProbes++;
                if (state.pending !== null && state.pending.codes.length === 2) cov.allOrNothingTwoCode++;
                // Not even the valid values of a rejected submission are committed.
                if (state.pending !== null && SEAT_IDS.includes(seat as PlayerId) && state.pending.guesses[seat as PlayerId] === undefined) {
                  expect(actingSeats(state), `the seat is still expected to submit: ${ctx}`).toContain(seat);
                }
              }
              if (state.pending !== null && own !== null && SEAT_IDS.includes(seat as PlayerId) && expected.code === "DUPLICATE_SUBMISSION") {
                const first = state.pending.guesses[seat as PlayerId];
                expect(first, `the first submission is kept: ${ctx}`).toEqual(own[seat as PlayerId]);
                if (show(payload.value) === show(first)) cov.duplicatesSameContent++;
                else cov.duplicatesDifferentContent++;
              }
            } else if (result.ok) {
              cov.accepted++;
              expect(result.value, ctx).not.toBe(state);
              expect(result.value.log, `log grows by one: ${ctx}`).toHaveLength(state.log.length + 1);
              const after = result.value.pending;
              if (after !== null) expect(after.guesses[seat as PlayerId], `accepted guesses are stored: ${ctx}`).toEqual(payload.value);
              else expect(result.value.phase, `the 4th submission reveals: ${ctx}`).not.toBe("GUESS_COLLECT");
            }
            // Accepted or not, the input state is untouched.
            expect(JSON.stringify(state) === snapshot, `input state unchanged: ${ctx}`).toBe(true);
          }
        }
      };

      fc.assert(
        fc.property(arbSubmissionCase, ({ reach, want, pick, numbers, specs, submitted, order, otherPhase }) => {
          cov.runs++;
          const batchCase = driveToBatch(reach, want, pick, numbers);
          if (batchCase === undefined) {
            cov.skipped++;
            return;
          }
          withContext(
            () => contextOf(reach, batchCase.actions),
            () => {
              const { before, place, state: batch } = batchCase;
              const table = reach.config.scoreConfig.config.rewardByError;
              const bonus = reach.config.scoreConfig.config.handEmptyBonus;
              const pending = batch.pending as PendingBatch;
              cov.batchSize[want]++;
              cov.submittedBefore[submitted]++;

              const codes = oracleCodesOf(batchCase);
              const keys = codes.map((code) => code.quadKey);
              const guesses = realizeGuesses(codes, specs);
              const seatOrder = (PERMUTATIONS[order] as readonly number[]).map((i) => SEAT_IDS[i] as PlayerId);

              // State S: `submitted` valid submissions accepted, in the generated order (reachable by `reduce`).
              let state = batch;
              seatOrder.slice(0, submitted).forEach((seat) => {
                state = applyOk(state, submitAction(seat, guesses), `prefix submission by ${seat}`);
              });
              const pre = structuredClone(state);
              expect(Object.keys((state.pending as PendingBatch).guesses).sort(), "accepted partial submissions stay sealed in pending").toEqual(seatOrder.slice(0, submitted).sort());
              expect(state.history, "no reveal before the 4th submission").toEqual(before.history);
              expect(state.lastReveal).toEqual(before.lastReveal);

              // Probes. Bad values: 3 non-integers and 3 out-of-range integers chosen from the numbers.
              const choice = choiceFrom(numbers.slice(7));
              const bad = [
                ...[0, 1, 2].map(() => NOT_INTEGER_VALUES[choice(NOT_INTEGER_VALUES.length)]),
                ...[0, 1, 2].map(() => OUT_OF_RANGE_VALUES[choice(OUT_OF_RANGE_VALUES.length)]),
              ];
              const unknownSeats = [0, 1, 2].map(() => UNKNOWN_SEATS[choice(UNKNOWN_SEATS.length)]);
              for (const seat of SEAT_IDS) {
                probeState(
                  state,
                  buildPayloads(keys, guesses[seat] as Record<string, number>, bad),
                  [seat],
                  `batch ${keys.join("+")} after ${submitted} submissions`,
                  guesses,
                );
              }
              probeState(state, buildPayloads(keys, guesses.P0 as Record<string, number>, bad).slice(0, 12), unknownSeats, `unknown seats, batch ${keys.join("+")}`, null);
              expect(state, "the probed state is unchanged").toEqual(pre);

              // Outside GUESS_COLLECT every submission is WRONG_PHASE (GAME_ENDED after ENDED), whatever its content.
              const other: GameState | undefined =
                otherPhase === "ENDED"
                  ? reach.state.phase === "ENDED"
                    ? reach.state
                    : playToEnd(reach.seed, reach.config, numbers, reach.style).state
                  : (pickState(reach, (s) => s.phase === otherPhase, pick) ??
                    advanceUntil(reach.states[0] as GameState, (s) => s.phase === otherPhase, numbers, { codeBias: 60, submitOrder: "SEAT_ORDER" }).state);
              if (other.phase === otherPhase) {
                cov.otherPhases[otherPhase]++;
                const phaseKeys = ["D4"];
                probeState(other, buildPayloads(phaseKeys, { D4: 17 }, bad.slice(0, 2)), SEAT_IDS, `other phase ${otherPhase}`, null);
                if (otherPhase === "ENDED") {
                  const ended = other;
                  expect(reduce(ended, { type: "SUBMIT_GUESSES", player: "P0", guesses: { D4: 17 } }).ok).toBe(false);
                }
              }

              // The rejected probes did not disturb the batch: the remaining seats submit their valid guesses, and the
              // reveal scores the FIRST submissions of the seats that had already submitted.
              seatOrder.slice(submitted).forEach((seat) => {
                state = applyOk(state, submitAction(seat, guesses), `completing submission by ${seat}`);
              });
              const outcome = oracleOutcome(codes, guesses, table, bonus, before.scores, place.player, batch.hands[place.player].length === 0, before.history.length);
              expect(state.lastReveal, "the reveal scores the accepted submissions").toEqual(outcome.record);
              SEAT_IDS.forEach((seat) => expect(state.scores[seat], `score of ${seat}`).toBe(outcome.finalScores[seat]));
              expect(state.pending).toBeNull();
            },
          );
        }),
        { seed: SEED_P18, numRuns: NUM_RUNS_P18 },
      );

      if (LOG_COVERAGE) console.info("P18 coverage", JSON.stringify(cov));
      expect(cov.skipped, "runs without a batch").toBeLessThanOrEqual(Math.floor(cov.runs / 10));
      expect(cov.batchSize[1], "batches of 1 code").toBeGreaterThanOrEqual(50);
      expect(cov.batchSize[2], "batches of 2 codes").toBeGreaterThanOrEqual(40);
      for (const k of [0, 1, 2, 3] as const) expect(cov.submittedBefore[k], `states with ${k} submissions`).toBeGreaterThanOrEqual(15);
      for (const phase of ["PLACEMENT", "REVEAL", "ENDED"] as const) expect(cov.otherPhases[phase], `probed ${phase} states`).toBeGreaterThanOrEqual(20);
      const codes: readonly ErrorCode[] = [
        "DUPLICATE_SUBMISSION", "GUESS_KEYS_MISMATCH", "GUESS_NOT_INTEGER", "GUESS_OUT_OF_RANGE", "UNKNOWN_PLAYER", "WRONG_PHASE", "GAME_ENDED",
      ];
      for (const code of codes) expect(cov.rejected[code] ?? 0, `rejections with ${code}`).toBeGreaterThanOrEqual(1000);
      expect(cov.accepted, "accepted submissions").toBeGreaterThanOrEqual(100);
      expect(cov.allOrNothingTwoCode, "all-or-nothing probes on 2-code batches").toBeGreaterThanOrEqual(2000);
      expect(cov.duplicatesSameContent, "duplicates with identical content").toBeGreaterThanOrEqual(100);
      expect(cov.duplicatesDifferentContent, "duplicates with different content").toBeGreaterThanOrEqual(1000);
    },
  );
});

// ---------------------------------------------------------------------------------------------------------
// Property 19: Hand-empty bonus and game end ordering
// ---------------------------------------------------------------------------------------------------------

interface SimBatch {
  readonly placer: PlayerId;
  readonly quadKeys: readonly string[];
  readonly earned: Scores;
  readonly cumulative: Scores;
}

interface Simulation {
  readonly scores: Scores;
  readonly batches: readonly SimBatch[];
  readonly bonusSeat: PlayerId | null;
  readonly endedBy: "PLACE" | "SUBMIT" | null;
  readonly lastPlacer: PlayerId | null;
  readonly lastPlaceCodes: readonly OracleCode[];
  readonly hand: Readonly<Record<PlayerId, number>>;
  readonly deck: number;
}

/**
 * Independent bookkeeping of a whole game from its accepted action list: hand and deck sizes, the codes of every
 * placement (own scan), the guesses of every batch (read from the log, test input only), the scores per batch and the
 * hand-empty bonus. It never reads `scores`, `history` or `bonusAwarded` of an engine state.
 */
function simulate(r: Reachable, table: readonly number[], bonus: number): Simulation {
  const hand: Record<PlayerId, number> = { P0: 3, P1: 3, P2: 3, P3: 3 };
  let deck = 36;

  const scored: string[] = [];
  const scores: Scores = { P0: 0, P1: 0, P2: 0, P3: 0 };
  const batches: SimBatch[] = [];
  let open: { placer: PlayerId; codes: OracleCode[]; guesses: Partial<Guesses>; endsGame: boolean } | null = null;
  let bonusSeat: PlayerId | null = null;
  let endedBy: "PLACE" | "SUBMIT" | null = null;
  let lastPlacer: PlayerId | null = null;
  let lastPlaceCodes: OracleCode[] = [];

  r.actions.forEach((action, i) => {
    if (endedBy !== null) fail(`an action follows the end of the game at index ${i}`);
    const next = r.states[i + 1] as GameState;
    if (action.type === "PLACE") {
      const seat = action.player;
      const codes = oracleNewCodes(next.board, action.pos.row, action.pos.col, scored);
      for (const code of codes) scored.push(code.groupId);
      const draws = codes.length === 0 && deck > 0;
      hand[seat] += draws ? 0 : -1;
      if (draws) deck -= 1;

      lastPlacer = seat;
      lastPlaceCodes = codes;
      if (codes.length > 0) {
        open = { placer: seat, codes, guesses: {}, endsGame: hand[seat] === 0 || scored.length >= 5 };
      } else if (hand[seat] === 0) {
        scores[seat] += bonus;
        bonusSeat = seat;
        endedBy = "PLACE";
      } else if (deck === 0) {
        endedBy = "PLACE";
      }
    } else if (action.type === "SUBMIT_GUESSES") {
      if (open === null) return fail(`a submission without a batch at index ${i}`);
      open.guesses[action.player] = { ...action.guesses };
      if (SEAT_IDS.every((seat) => open?.guesses[seat] !== undefined)) {
        const outcome = oracleOutcome(open.codes, open.guesses as Guesses, table, bonus, scores, open.placer, false, batches.length);
        const cumulative = {} as Scores;
        for (const seat of SEAT_IDS) {
          scores[seat] = scores[seat] + (outcome.earned[seat] as number);
          cumulative[seat] = scores[seat];
        }
        batches.push({ placer: open.placer, quadKeys: open.codes.map((c) => c.quadKey), earned: outcome.earned, cumulative });
        if (open.endsGame) {
          if (hand[open.placer] === 0) {
            scores[open.placer] += bonus;
            bonusSeat = open.placer;
          }
          endedBy = "SUBMIT";
        }
        open = null;
      }
    }
  });
  return { scores, batches, bonusSeat, endedBy, lastPlacer, lastPlaceCodes, hand, deck };
}

/** Every kind of action an ended game must refuse, for every seat. */
function endedProbes(state: GameState): unknown[] {
  const probes: unknown[] = [{ type: "ACK_REVEAL" }, { type: "NOPE" }, null, undefined, 5, "PLACE", {}];
  for (const seat of SEAT_IDS) {
    const hand = state.hands[seat];
    probes.push({ type: "PLACE", player: seat, card: hand[0] ?? "H-A", pos: { row: 0, col: 0 }, orientation: 0 });
    probes.push({ type: "PLACE", player: seat, card: "H-A", pos: { row: 3, col: 2 }, orientation: 180 });
    probes.push({ type: "SUBMIT_GUESSES", player: seat, guesses: { D4: 10 } });
    probes.push({ type: "SUBMIT_GUESSES", player: seat, guesses: {} });
    probes.push({ type: "SUBMIT_GUESSES", player: seat, guesses: { D4: 3.5 } });
  }
  probes.push({ type: "PLACE", player: "P9", card: "ZZ", pos: null, orientation: 7 });
  probes.push({ type: "SUBMIT_GUESSES", player: "P9", guesses: null });
  return probes;
}

interface GameEndCoverage {
  runs: number;
  endedByLastGuess: number;
  endedByLastGuessTwoCodes: number;
  endedByNonCodePlacement: number;
  endedByNonCodeWithEmptyDeck: number;
  gamesWithoutAnyCode: number;
  bonusSeat: Record<PlayerId, number>;
  placementsTotal: number;
  batchesTotal: number;
  endedWithCardsInDeck: number;
  fractionalBonus: number;
}

/** Valid game configurations with a distinctive hand-empty bonus built here (the table comes from `arbConfig`). */
const arbBonusConfig: fc.Arbitrary<GameConfig> = fc.tuple(arbConfig, fc.constantFrom(1000, 1000.5, 2048.25, 777)).map(([config, bonus]): GameConfig => ({
  ...config,
  scoreConfig: {
    id: "TEST_DISTINCTIVE_BONUS",
    provisional: false,
    config: { rewardByError: config.scoreConfig.config.rewardByError, handEmptyBonus: bonus },
  },
}));

const arbEndCase = fc.record({
  seed: arbSeed,
  config: arbBonusConfig,
  style: arbPlayStyle,
  numbers: arbNumbers(800),
});

describe("Property 19: hand-empty bonus and game end ordering", () => {
  it(
    "every complete legal game ends in ENDED after the last batch is scored, with the bonus added once to the seat with the empty hand",
    { timeout: TIMEOUT_MS },
    () => {
      // Feature: qroker-playable-game, Property 19: Hand-empty bonus and game end ordering
      // Validates: Requirements 8.8, 9.1, 9.3
      const cov: GameEndCoverage = {
        runs: 0, endedByLastGuess: 0, endedByLastGuessTwoCodes: 0, endedByNonCodePlacement: 0, endedByNonCodeWithEmptyDeck: 0,
        gamesWithoutAnyCode: 0, bonusSeat: { P0: 0, P1: 0, P2: 0, P3: 0 }, placementsTotal: 0, batchesTotal: 0, endedWithCardsInDeck: 0,
        fractionalBonus: 0,
      };

      fc.assert(
        fc.property(arbEndCase, ({ seed, config, style, numbers }) => {
          cov.runs++;
          const r = playToEnd(seed, config, numbers, style, 1000);
          withContext(
            () => contextOf(r, r.actions),
            () => {
              const table = config.scoreConfig.config.rewardByError;
              const bonus = config.scoreConfig.config.handEmptyBonus;
              const final = r.state;
              const n = r.actions.length;
              const ctx = describeReachable(r);

              // Terminal state and termination bound: at most 48 placements, each followed by at most 4 submissions and 1 ack.
              expect(final.phase, `terminal phase: ${ctx}`).toBe("ENDED");
              expect(final.pending, "nothing is pending at the end").toBeNull();
              expect(final.placements).toBeLessThanOrEqual(48);
              expect(n).toBeLessThanOrEqual(48 * 6);
              expect(final.config.scoreConfig.config.handEmptyBonus, "the injected bonus is the one in use").toBe(bonus);
              cov.placementsTotal += final.placements;

              // ENDED is reached exactly once, by the last action, and the bonus is awarded at that moment only.
              r.states.slice(0, n).forEach((s, i) => {
                expect(s.phase, `phase before the last action (state ${i})`).not.toBe("ENDED");
                expect(s.bonusAwarded, `no bonus before the end (state ${i})`).toBeNull();
              });
              const lastAction = r.actions[n - 1] as Action;
              expect(lastAction.type, "the game never ends by an acknowledgement").not.toBe("ACK_REVEAL");

              // Independent bookkeeping from the log.
              const sim = simulate(r, table, bonus);
              expect(sim.bonusSeat, "bonus seat by independent hand bookkeeping").toBe(final.bonusAwarded);
              if (final.bonusAwarded !== null) {
                expect(sim.hand[final.bonusAwarded as PlayerId], "the bonus seat's hand is empty (bookkeeping)").toBe(0);
                expect(final.hands[final.bonusAwarded], "the bonus seat's hand is empty (state)").toHaveLength(0);
                expect(sim.lastPlacer, "bonus goes to the seat of the last placement").toBe(final.bonusAwarded);
              } else {
                expect(final.deck.length === 0 || final.scoredGroups.length >= 5).toBe(true);
              }
              expect(SEAT_IDS.filter((seat) => final.hands[seat].length === 0)).toEqual(final.bonusAwarded ? [final.bonusAwarded] : []);
              expect(sim.deck).toBe(final.deck.length);

              // The batches: one RevealRecord per fully collected batch, with the earned points of the bookkeeping.
              expect(final.history, "one record per batch").toHaveLength(sim.batches.length);
              cov.batchesTotal += sim.batches.length;
              sim.batches.forEach((batch, i) => {
                const record = final.history[i] as NonNullable<GameState["lastReveal"]>;
                expect(record.batchIndex).toBe(i);
                expect(record.placer).toBe(batch.placer);
                expect(record.codes.map((c) => c.quadKey)).toEqual(batch.quadKeys);
                for (const seat of SEAT_IDS) {
                  const entry = record.perPlayer.find((p) => p.player === seat) as { earned: number; cumulative: number };
                  expect(near(entry.earned, batch.earned[seat] as number), `earned of ${seat} in batch ${i}`).toBe(true);
                  expect(near(entry.cumulative, batch.cumulative[seat] as number), `cumulative of ${seat} in batch ${i} (no bonus inside a record)`).toBe(true);
                }
              });
              expect(final.lastReveal).toEqual(final.history[final.history.length - 1] ?? null);

              // Final score of every seat = sum of its prediction scores over all records + the bonus for the bonus seat only.
              for (const seat of SEAT_IDS) {
                const earnedSum = final.history.reduce((sum, record) => sum + (record.perPlayer.find((p) => p.player === seat) as { earned: number }).earned, 0);
                const expected = earnedSum + (seat === final.bonusAwarded ? bonus : 0);
                expect(near(final.scores[seat] as number, expected), `final score of ${seat}: ${final.scores[seat]} vs records ${earnedSum}${seat === final.bonusAwarded ? ` + bonus ${bonus}` : ""}`).toBe(true);
                expect(near(final.scores[seat] as number, sim.scores[seat] as number), `final score of ${seat} equals the bookkeeping`).toBe(true);
              }

              // Ordering: the batch of the ending placement (if it formed codes) is fully scored before the game ends.
              if (sim.endedBy === "SUBMIT") {
                cov.endedByLastGuess++;
                if (sim.lastPlaceCodes.length === 2) cov.endedByLastGuessTwoCodes++;
                expect(lastAction.type).toBe("SUBMIT_GUESSES");
                const lastRecord = final.history[final.history.length - 1] as NonNullable<GameState["lastReveal"]>;
                expect(lastRecord.codes.map((c) => c.quadKey), "the last record is the batch of the ending placement").toEqual(sim.lastPlaceCodes.map((c) => c.quadKey));
                expect(lastRecord.placer).toBe(sim.lastPlacer);
                const beforeLast = r.states[n - 1] as GameState;
                expect(beforeLast.phase, "the last action is the 4th submission of a batch").toBe("GUESS_COLLECT");
                expect(Object.keys((beforeLast.pending as PendingBatch).guesses)).toHaveLength(3);
                expect((beforeLast.pending as PendingBatch).endsGame).toBe(true);
                expect(beforeLast.history).toHaveLength(final.history.length - 1);
                expect(beforeLast.bonusAwarded, "no bonus before the last guess is scored").toBeNull();
                const winner = lastRecord.placer;
                const entry = lastRecord.perPlayer.find((p) => p.player === winner) as { cumulative: number };
                expect(near(final.scores[winner] as number, entry.cumulative + (final.bonusAwarded ? bonus : 0)), "the bonus comes after the scoring of the last batch").toBe(true);
              } else {
                cov.endedByNonCodePlacement++;
                expect(sim.endedBy).toBe("PLACE");
                expect(lastAction.type).toBe("PLACE");
                expect(sim.lastPlaceCodes, "an ending placement without a batch forms no code").toHaveLength(0);
                expect((r.states[n - 1] as GameState).deck).toHaveLength(1);
                expect(final.bonusAwarded).toBeNull();
                expect(final.deck, "the last draw exhausts the deck").toHaveLength(0);
                if (final.deck.length === 0) cov.endedByNonCodeWithEmptyDeck++;
                expect((r.states[n - 1] as GameState).phase).toBe("PLACEMENT");
              }
              if (final.deck.length > 0) cov.endedWithCardsInDeck++;
              if (final.history.length === 0) cov.gamesWithoutAnyCode++;
              if (final.bonusAwarded) cov.bonusSeat[final.bonusAwarded]++;
              if (!Number.isInteger(bonus)) cov.fractionalBonus++;

              // No scoring batch is ever left unscored: every batch opened by a PLACE has its record.
              const opened = r.states.filter((s, i) => i > 0 && s.phase === "GUESS_COLLECT" && (r.states[i - 1] as GameState).phase === "PLACEMENT").length;
              expect(final.history.length, "every opened batch was scored before the end").toBe(opened);

              // After ENDED every action kind is refused with GAME_ENDED and the state does not change.
              const snapshot = JSON.stringify(final);
              for (const probe of endedProbes(final)) {
                const result = reduce(final, probe as Action);
                expect(result.ok, `accepted after ENDED: ${show(probe)}`).toBe(false);
                if (!result.ok) expect(result.error.code, `after ENDED: ${show(probe)}`).toBe("GAME_ENDED");
                if (!result.ok) expect("value" in result).toBe(false);
              }
              expect(JSON.stringify(final) === snapshot, "the ended state is unchanged by refused actions").toBe(true);
              expect(actingSeats(final), "nobody acts after ENDED").toEqual([]);

              // Conservation at termination: 52 unique cards.
              const cards = allCards(final);
              expect(cards).toHaveLength(52);
              expect(new Set(cards).size).toBe(52);
              expect([...cards].sort()).toEqual(SORTED_CATALOG);

              // Determinism: the same seed and actions give the same final state, log included, every time.
              const again = replayActions(seed, config, r.actions);
              const third = replayActions(seed, config, r.actions);
              expect(again[again.length - 1], "replay reproduces the final state").toEqual(final);
              expect(third[third.length - 1], "a second replay agrees").toEqual(again[again.length - 1]);
              expect((again[again.length - 1] as GameState).log).toEqual(final.log);
            },
          );
        }),
        { seed: SEED_P19, numRuns: NUM_RUNS_P19 },
      );

      if (LOG_COVERAGE) console.info("P19 coverage", JSON.stringify(cov));
      expect(cov.endedByLastGuess, "games ended directly after the last guess").toBeGreaterThanOrEqual(30);
      expect(cov.endedByNonCodePlacement, "games ended by drawing the last card").toBeGreaterThanOrEqual(80);
      expect(cov.gamesWithoutAnyCode, "games in which no code was ever formed").toBeGreaterThanOrEqual(1);
      expect(cov.endedWithCardsInDeck, "games that end by a code placement while the deck still has cards").toBeGreaterThanOrEqual(10);
      expect(cov.endedByNonCodeWithEmptyDeck).toBe(cov.endedByNonCodePlacement);
      expect(cov.batchesTotal, "batches scored in total").toBeGreaterThanOrEqual(cov.runs * 2.5);
      for (const seat of SEAT_IDS) expect(cov.bonusSeat[seat], `games where ${seat} got the bonus`).toBeGreaterThan(0);
      expect(cov.fractionalBonus, "games with a fractional bonus").toBeGreaterThanOrEqual(30);
    },
  );
});

// ---------------------------------------------------------------------------------------------------------
// Notes: runs, durations and observed coverage (fixed seeds; set QROKER_COVERAGE_LOG=1 to print the counters)
// ---------------------------------------------------------------------------------------------------------
//
// Runs and durations (Windows, Node 24, vitest 5.1; times vary with the machine): Property 17: 150 runs (about 10 s),
// Property 18: 120 runs (about 10 s), Property 19: 200 games (about 7 s).
//
// Property 17 (150 runs, 5 without a batch because the two-code driver hit its cap): 145 batches, 80 of one code and 65
// of two codes; 55 batches were found inside the random play and 90 needed further legal play; 40 batches opened after an
// earlier reveal; 2 batches end the game (placer's hand empty). 145 x 24 = 3480 submission orders were checked (10440
// partial states, each with 1 to 3 submissions), 840 guesses: 147 exact, 499 within 4, 194 farther; 207 guesses fall
// beyond the table of their configuration (reward 0); 563 earn points and 277 earn nothing.
//
// Property 18 (120 runs, 2 without a batch): 118 batches (62 of one code, 56 of two), states with 0, 1, 2 and 3
// submissions 28, 38, 29 and 23; other phases probed: PLACEMENT 41, REVEAL 40, ENDED 37. 34808 verdicts compared with the
// oracle: 755 accepted; rejected GUESS_NOT_INTEGER 3311, GUESS_OUT_OF_RANGE 3311, GUESS_KEYS_MISMATCH 5045, UNKNOWN_PLAYER
// 4248, DUPLICATE_SUBMISSION 6810 (165 with the first submission's content, 6645 with other content), WRONG_PHASE 7776,
// GAME_ENDED 3552. 7152 all-or-nothing probes (a bad value among valid ones), 3976 of them on two-code batches.
//
// Property 19 (200 games, all ended within the cap; 41 placements per game on average): 47 games ended directly after
// the last guess (the ending placement formed a code), 153 ended by a hand-emptying placement without a code (the deck
// was empty in all 153, as the draw rule requires), 29 of the 47 code endings had cards left in the deck, 8 games never
// formed a code, 666 batches were scored in total, 93 games used a fractional bonus. Seats that received the bonus:
// P0 72, P1 33, P2 44, P3 51. Games whose final batch has TWO codes were not sampled (0), so that ending is covered by
// Property 17's two-code endsGame batches (2 observed) and by the example scenario of task 8.2 (engine.test.ts).
//
// Sanity check by mutation (done once, not part of the suite): the engine was temporarily changed in nine ways (reveal
// after 3 submissions, bonus doubled, duplicate allowed, a guess in the record, key check dropped, bonus inside the
// record's cumulative, scoring that depends on the log length, a completion bonus at placement, value/key precedence
// changed) and each change was caught by at least one of the three properties.