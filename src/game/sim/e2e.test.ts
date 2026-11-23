// End-to-end headless acceptance run (task 13.2) and Property 21 of
// .kiro/specs/qroker-playable-game/design.md. Requirements 9.6, 9.7, 20.2, 20.3 (and 21.x: the headless self-play is
// the evidence that the game is playable without a UI; 11.2 and 9.1 to 9.5 are exercised through it).
//
// ---------------------------------------------------------------------------------------------------------
// What this file is
// ---------------------------------------------------------------------------------------------------------
// An ACCEPTANCE RUN, not a smoke test. The grid of configurations is
//
//     strategy mix  x  identity visibility
//     { ALL_BEGINNER, ALL_ADVANCED, MIXED }  x  { OWNER_ONLY, FACE_UP }       = 6 configurations
//
//     ALL_BEGINNER  P0..P3 = BEGINNER, BEGINNER, BEGINNER, BEGINNER
//     ALL_ADVANCED  P0..P3 = ADVANCED, ADVANCED, ADVANCED, ADVANCED
//     MIXED         P0..P3 = ADVANCED, BEGINNER, ADVANCED, BEGINNER
//
// and EVERY Seed 0..N-1 is played in EVERY configuration: 6 x N complete games (1200 at the default N = 200). The
// distribution is exhaustive over the grid and deterministic (no sampling, no random choice of seeds). One `it` per
// configuration, so a failure names the configuration, and each failure message carries the Seed, the configuration,
// the first problem and a `playGame` snippet that reproduces the game.
//
// N: `E2E_SEEDS` (default 200). The value is validated by `parseSeedCount`: a positive integer in 1..4294967296. An
// unset or blank variable gives the default; ANYTHING ELSE (text, a fraction, 0, a negative number, NaN, a seed range
// beyond 32 bits) THROWS a RangeError when the file loads. It does not fall back silently: a typo such as
// `E2E_SEEDS=2OO` must not turn a 1200-game acceptance run into a different run without anyone noticing.
//
// Configuration: `defaultConfig()` with ONLY `identityVisibility` overridden. The seats stay as `defaultConfig` has
// them (P0 HUMAN, P1..P3 AI); the driver ignores seat kinds and assigns an AI strategy to all four seats (all-seats-AI
// design of sim/play-game.ts). The score configuration stays `DEV_PLACEHOLDER_SCORE_CONFIG` (provisional). No score
// value is written or changed here; the oracles read the table from `final.config`.
//
// What is asserted for EVERY game (see `inspectGame`; each problem is tagged with the item it violates):
//   ENDED      the game reaches the phase ENDED; `playGame` ran with `checkInvariants: true` (it throws on a rejected
//              Action, an illegal Action, an invariant violation or the finite-execution guard, and each of those is
//              counted separately), and the final state is checked again independently (`checkStateInvariants`).
//   BOUNDS     at most 48 PLACE Actions, `placements` equals the number of PLACE entries, the log has at most
//              DEFAULT_MAX_ACTIONS entries and equals `final.log`.
//   INVENTORY  board + hands + deck hold the 52 catalog cards exactly once each; board cells = placements + 4.
//   BATCHES    the type sequence of the log matches the grammar (P | P S S S S A)* (P | P S S S S): every
//              Prediction_Batch has exactly four consecutive submissions, one per seat, and (except a batch that ends
//              the game) one acknowledgement; the number of batches counted independently from the log equals the
//              number of `history` records; no batch is pending; `scoredGroups` has one entry per revealed code.
//   SCORES     the final scores are recomputed from the LOG (the guesses) and the hidden sums of `history` with a table
//              lookup written here (independent of core/score), the hidden sums are recomputed from the card values,
//              and each record's `earned` and `cumulative` are compared; the final score is that cumulative plus the
//              bonus for the bonus seat only.
//   BONUS      `bonusAwarded` is set, names the seat of the last PLACE, that seat's hand is empty (and it is the only
//              empty hand), and exactly one `handEmptyBonus` is in the scores (sum of scores minus sum of earned).
//   RANKING    `rankPlayers(final.scores)` equals a competition-rank oracle that is computed differently from the
//              implementation (sort, then the position of the first equal score); equal scores share a rank.
//   REPLAY     `replay(seed, config, log)` succeeds, `stateEquals` holds, and an independent canonical comparison
//              (JSON with sorted keys) of the replayed state and the final state is identical. Mismatches are counted.
//   VIEWS      `viewFor(final, seat)` for all four seats: phase ENDED, no pending Quad_Keys, nobody has submitted,
//              `myGuesses` null, `ranking` equal to `rankPlayers`, the last reveal record equal to the last history
//              record, and none of the sealed keys (seed, deck, hands, log, pending, groupId, scoredGroups, guesses,
//              revealedCards) anywhere in the serialization.
//   DETERMINISM  every `DETERMINISM_STRIDE`-th Seed (seed % 10 === 0) of every configuration is played a second time:
//              the final state and the log must be canonically identical. (Every game of Property 21 is played twice.)
//
// Time budget: each configuration has an explicit timeout `TIMEOUT_MS` = max(120 s, 600 ms x N). It is ONLY a guard
// against CPU contention (this machine also runs an Android emulator and other tools). The default Vitest timeout
// (5 s) is far too short for 200 complete games with invariant checks and a replay per game, even on an idle machine.
// No delay is inserted anywhere. Timing (`performance.now`) is measured in this test file only; sim/ code is clock-free.
//
// Diagnostics: while the games are played the test collects descriptive counts per configuration. With
// `E2E_WRITE_DIAGNOSTICS=1` (and only then) the test writes `docs/game/headless-diagnostics.md` after all six
// configurations finished with zero failures. Default runs write nothing. The file has no timestamps and no timings.
// The numbers describe self-play under the PLACEHOLDER scoring; they are NOT a balance study and no constant may be
// tuned from them.
//
// ---------------------------------------------------------------------------------------------------------
// Property 21 (see the second describe): one fc.assert, fixed seed, 150 runs, notes with the observed rates at the end.
// ---------------------------------------------------------------------------------------------------------

import fc from "fast-check";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { registeredDifficulties } from "../ai/registry";
import { ALL_CARDS } from "../core/cards";
import { rankPlayers } from "../core/ranking";
import { replay, stateEquals } from "../core/replay";
import { startingScoredGroups } from "../core/rules";
import { defaultConfig } from "../core/state";
import type { GameState } from "../core/state";
import { arbSeed } from "../core/testing/card-generators";
import { SEATS } from "../core/turn";
import type { Action, Difficulty, GameConfig, IdentityVisibility, PlayerId, SeatConfig } from "../core/types";
import { viewFor } from "../core/view";
import {
  ActionLimitError,
  AiStrategyError,
  DEFAULT_MAX_ACTIONS,
  IllegalAiActionError,
  InvariantViolation,
  checkStateInvariants,
  playGame,
  strategiesFor,
} from "./play-game";
import type { PlayGameResult } from "./types";

// ---------------------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------------------

const DEFAULT_SEEDS = 200;
const MAX_SEED_COUNT = 0x100000000;

/**
 * The number of Seeds N from the text of `E2E_SEEDS`. Unset or blank gives 200. Anything that is not a positive
 * decimal integer of at most 2^32 throws a RangeError (see the header: no silent fallback).
 */
function parseSeedCount(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_SEEDS;
  const text = raw.trim();
  if (!/^\d+$/.test(text)) throw new RangeError(`E2E_SEEDS must be a positive integer, got ${JSON.stringify(raw)}`);
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_SEED_COUNT) {
    throw new RangeError(`E2E_SEEDS must be an integer from 1 to ${MAX_SEED_COUNT}, got ${JSON.stringify(raw)}`);
  }
  return n;
}

const N = parseSeedCount(process.env.E2E_SEEDS);
const WRITE_DIAGNOSTICS = process.env.E2E_WRITE_DIAGNOSTICS === "1";

/** Per-configuration timeout: a guard against CPU contention only (see the header). */
const TIMEOUT_MS = Math.max(120_000, 600 * N);

/** Seeds with `seed % DETERMINISM_STRIDE === 0` are played twice. */
const DETERMINISM_STRIDE = 10;

const SEED_P21 = 20261321;
const NUM_RUNS_P21 = 150;
const TIMEOUT_P21_MS = 180_000;

const DIAGNOSTICS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/game/headless-diagnostics.md");

// ---------------------------------------------------------------------------------------------------------
// Configurations
// ---------------------------------------------------------------------------------------------------------

type Tiers = readonly [Difficulty, Difficulty, Difficulty, Difficulty];

interface Mix {
  readonly name: string;
  readonly tiers: Tiers;
}

const MIXES: readonly Mix[] = [
  { name: "ALL_BEGINNER", tiers: ["BEGINNER", "BEGINNER", "BEGINNER", "BEGINNER"] },
  { name: "ALL_ADVANCED", tiers: ["ADVANCED", "ADVANCED", "ADVANCED", "ADVANCED"] },
  { name: "MIXED", tiers: ["ADVANCED", "BEGINNER", "ADVANCED", "BEGINNER"] },
];

const VISIBILITIES: readonly IdentityVisibility[] = ["OWNER_ONLY", "FACE_UP"];

interface Configuration {
  readonly id: string;
  readonly mix: Mix;
  readonly visibility: IdentityVisibility;
  readonly config: GameConfig;
}

/** `defaultConfig()` with only the identity visibility overridden. */
const configFor = (visibility: IdentityVisibility): GameConfig => ({ ...defaultConfig(), identityVisibility: visibility });

const CONFIGURATIONS: readonly Configuration[] = MIXES.flatMap((mix) =>
  VISIBILITIES.map((visibility) => ({ id: `${mix.name} / ${visibility}`, mix, visibility, config: configFor(visibility) })),
);

const tierRecord = (tiers: Tiers): Record<PlayerId, Difficulty> => ({ P0: tiers[0], P1: tiers[1], P2: tiers[2], P3: tiers[3] });

/** The text of a `playGame` call that reproduces a game (used in every failure message). */
function reproSnippet(seed: number, tiers: Tiers, visibility: IdentityVisibility, config: GameConfig): string {
  const seatsAreDefault = JSON.stringify(config.seats) === JSON.stringify(defaultConfig().seats);
  const configText = seatsAreDefault
    ? `{ ...defaultConfig(), identityVisibility: "${visibility}" }`
    : `{ ...defaultConfig(), seats: ${JSON.stringify(config.seats)}, identityVisibility: "${visibility}" }`;
  return (
    `playGame({ seed: ${seed}, config: ${configText}, ` +
    `strategies: strategiesFor(${JSON.stringify(tierRecord(tiers))}), checkInvariants: true })`
  );
}

// ---------------------------------------------------------------------------------------------------------
// Independent oracles
// ---------------------------------------------------------------------------------------------------------

/** Card_Value by rank (A = 1 .. K = 13), written out here; not read from core/cards. */
const RANK_VALUE: Readonly<Record<string, number>> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
};
const valueOf = (card: string): number => RANK_VALUE[card.slice(2)] ?? Number.NaN;

/** JSON with sorted object keys: equal for deeply equal values whatever the key order. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

/**
 * Competition ranking by a method that differs from `rankPlayers`: sort the scores in descending order and give a seat
 * the 1-based position of the FIRST entry that has an equal score.
 */
function oracleRanks(scores: Readonly<Record<PlayerId, number>>): Record<PlayerId, number> {
  const sorted = SEATS.map((seat) => scores[seat]).sort((a, b) => b - a);
  const ranks = {} as Record<PlayerId, number>;
  for (const seat of SEATS) ranks[seat] = sorted.indexOf(scores[seat]) + 1;
  return ranks;
}

/** Reward of one prediction: the table entry for the absolute error, 0 beyond the table. Written here, not core/score. */
function rewardOracle(table: readonly number[], guess: number, hidden: number): number {
  const error = Math.abs(guess - hidden);
  return error < table.length ? (table[error] as number) : 0;
}

// ---------------------------------------------------------------------------------------------------------
// Inspection of one finished game
// ---------------------------------------------------------------------------------------------------------

interface GameFacts {
  readonly placements: number;
  readonly actions: number;
  readonly batches: number;
  readonly codes: number;
  readonly multiCodeBatches: number;
  readonly bonusSeat: PlayerId | null;
  readonly scores: Readonly<Record<PlayerId, number>>;
  readonly ranks: Readonly<Record<PlayerId, number>>;
  /** True when the last accepted Action is a SUBMIT_GUESSES (the last batch ended the game). */
  readonly endedAfterGuess: boolean;
  readonly replayMismatch: boolean;
}

interface GameInspection {
  readonly facts: GameFacts;
  readonly problems: readonly string[];
}

const SEALED_KEYS = ["seed", "deck", "hands", "log", "pending", "groupId", "scoredGroups", "guesses", "revealedCards"];

function collectKeys(value: unknown, out: Set<string> = new Set<string>()): Set<string> {
  if (typeof value !== "object" || value === null) return out;
  if (!Array.isArray(value)) for (const key of Object.keys(value)) out.add(key);
  for (const child of Object.values(value)) collectKeys(child, out);
  return out;
}

type PlaceEntry = Extract<Action, { type: "PLACE" }>;
type SubmitEntry = Extract<Action, { type: "SUBMIT_GUESSES" }>;

/**
 * Checks a finished game against every acceptance item with independent bookkeeping. Returns the facts used by the
 * diagnostics and the list of problems (empty for a correct game). Never throws for a finished game.
 */
function inspectGame(seed: number, config: GameConfig, result: PlayGameResult): GameInspection {
  const problems: string[] = [];
  const check = (tag: string, ok: boolean, message: () => string): void => {
    if (!ok) problems.push(`[${tag}] ${message()}`);
  };
  const final: GameState = result.final;
  const log = result.log;
  const table = final.config.scoreConfig.config.rewardByError;
  const bonusValue = final.config.scoreConfig.config.handEmptyBonus;

  // ENDED and invariants of the final state, checked a second time outside the driver.
  check("ENDED", final.phase === "ENDED", () => `phase is ${final.phase}`);
  try {
    checkStateInvariants(final);
  } catch (error) {
    problems.push(`[ENDED] invariants of the final state: ${error instanceof Error ? error.message : String(error)}`);
  }

  // BOUNDS.
  const placeEntries = log.filter((a): a is PlaceEntry => a.type === "PLACE");
  check("BOUNDS", placeEntries.length <= 48, () => `${placeEntries.length} PLACE actions (more than 48)`);
  check("BOUNDS", final.placements === placeEntries.length, () => `placements ${final.placements} but ${placeEntries.length} PLACE entries`);
  check("BOUNDS", log.length <= DEFAULT_MAX_ACTIONS, () => `${log.length} actions (more than ${DEFAULT_MAX_ACTIONS})`);
  check("BOUNDS", canonical(log) === canonical(final.log), () => "result.log differs from final.log");

  // INVENTORY.
  const board = final.board.filter((cell) => cell !== null).map((cell) => (cell as { card: string }).card);
  const everyCard = [...board, ...SEATS.flatMap((seat) => [...final.hands[seat]]), ...final.deck];
  const catalog = new Set<string>(ALL_CARDS);
  check(
    "INVENTORY",
    everyCard.length === 52 && new Set(everyCard).size === 52 && everyCard.every((card) => catalog.has(card)),
    () => `${everyCard.length} cards, ${new Set(everyCard).size} distinct`,
  );
  check("INVENTORY", board.length === final.placements + 4, () => `${board.length} cards on the board with ${final.placements} placements`);

  // BATCHES: the grammar of the log and the batches counted from it.
  const types = log.map((a) => (a.type === "PLACE" ? "P" : a.type === "SUBMIT_GUESSES" ? "S" : "A")).join("");
  check("BATCHES", /^(?:P|PSSSSA)*(?:P|PSSSS)$/.test(types), () => `the action sequence ${types} does not match (P|PSSSSA)*(P|PSSSS)`);
  const batchPlacers: PlayerId[] = [];
  const groups: SubmitEntry[][] = [];
  log.forEach((entry, i) => {
    if (entry.type !== "PLACE" || log[i + 1]?.type !== "SUBMIT_GUESSES") return;
    batchPlacers.push(entry.player);
    groups.push(log.slice(i + 1, i + 5).filter((a): a is SubmitEntry => a.type === "SUBMIT_GUESSES"));
  });
  const acknowledgements = log.filter((a) => a.type === "ACK_REVEAL").length;
  const endedAfterGuess = log[log.length - 1]?.type === "SUBMIT_GUESSES";
  check("BATCHES", groups.length === final.history.length, () => `${groups.length} batches in the log, ${final.history.length} history records`);
  check("BATCHES", acknowledgements === groups.length - (endedAfterGuess ? 1 : 0), () => `${acknowledgements} acknowledgements for ${groups.length} batches`);
  check("BATCHES", final.pending === null && final.lastReveal === (final.history[final.history.length - 1] ?? null), () => "pending batch left or lastReveal is not the last record");

  // SCORES, hidden sums, per-seat points in every batch.
  let totalCodes = 0;
  let multiCodeBatches = 0;
  const cumulative: Record<PlayerId, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  final.history.forEach((record, index) => {
    totalCodes += record.codes.length;
    if (record.codes.length >= 2) multiCodeBatches++;
    check("SCORES", record.batchIndex === index, () => `history[${index}].batchIndex is ${record.batchIndex}`);
    check("SCORES", record.placer === batchPlacers[index], () => `history[${index}].placer ${record.placer} is not the placer ${String(batchPlacers[index])} of the log`);
    const group = groups[index] ?? [];
    check("BATCHES", group.length === 4 && new Set(group.map((g) => g.player)).size === 4, () => `batch ${index} has ${group.length} submissions from ${new Set(group.map((g) => g.player)).size} seats`);
    check("SCORES", record.perPlayer.length === 4 && new Set(record.perPlayer.map((p) => p.player)).size === 4, () => `batch ${index} has points for ${record.perPlayer.length} entries`);
    const keys = record.codes.map((code) => code.quadKey).sort();
    for (const code of record.codes) {
      const expectedSum = code.cards.reduce((sum, card) => sum + valueOf(card), 0);
      check("SCORES", code.cards.length === 4 && new Set(code.cards).size === 4 && code.hiddenSum === expectedSum, () => `code ${code.quadKey} of batch ${index} has hiddenSum ${code.hiddenSum}, card values give ${expectedSum}`);
    }
    for (const seat of SEATS) {
      const submission = group.find((g) => g.player === seat);
      const guesses = submission?.guesses ?? {};
      check("SCORES", canonical(Object.keys(guesses).sort()) === canonical(keys), () => `${seat} guessed ${Object.keys(guesses).join(",")} in batch ${index}, codes are ${keys.join(",")}`);
      let earned = 0;
      for (const code of record.codes) {
        const guess = guesses[code.quadKey] as number;
        check("SCORES", Number.isInteger(guess) && guess >= 4 && guess <= 52, () => `${seat} guess ${String(guess)} for ${code.quadKey} is not an integer from 4 to 52`);
        earned += rewardOracle(table, guess, code.hiddenSum);
      }
      cumulative[seat] += earned;
      const entry = record.perPlayer.find((p) => p.player === seat);
      check("SCORES", entry?.earned === earned && entry.cumulative === cumulative[seat], () => `${seat} batch ${index}: record has ${JSON.stringify(entry)}, recomputed earned ${earned} cumulative ${cumulative[seat]}`);
    }
  });
  check("BATCHES", final.scoredGroups.length === startingScoredGroups().length + totalCodes && new Set(final.scoredGroups).size === final.scoredGroups.length, () => `${final.scoredGroups.length} scored groups for ${totalCodes} revealed codes`);

  // BONUS.
  const bonusSeat = final.bonusAwarded;
  const lastPlacer = placeEntries[placeEntries.length - 1]?.player ?? null;
  check("BONUS", bonusSeat !== null || final.scoredGroups.length >= 5, () => "neither ending condition was reached");
  if (bonusSeat !== null) {
    check("BONUS", final.hands[bonusSeat].length === 0, () => `bonus seat ${bonusSeat} holds ${final.hands[bonusSeat].length} cards`);
    check("BONUS", bonusSeat === lastPlacer, () => `bonus seat ${bonusSeat} is not the seat of the last PLACE (${String(lastPlacer)})`);
  }
  const emptyHands = SEATS.filter((seat) => final.hands[seat].length === 0);
  check("BONUS", emptyHands.length === (bonusSeat ? 1 : 0), () => `${emptyHands.length} empty hands at the end (${emptyHands.join(",")})`);
  const sumScores = SEATS.reduce((sum, seat) => sum + final.scores[seat], 0);
  const sumEarned = SEATS.reduce((sum, seat) => sum + cumulative[seat], 0);
  check("BONUS", sumScores - sumEarned === (bonusSeat ? bonusValue : 0), () => `scores exceed the prediction points by ${sumScores - sumEarned}, one bonus is ${bonusValue}`);
  for (const seat of SEATS) {
    const expected = cumulative[seat] + (seat === bonusSeat ? bonusValue : 0);
    check("SCORES", final.scores[seat] === expected, () => `${seat} final score ${final.scores[seat]}, recomputed ${expected}`);
  }

  // RANKING.
  const oracle = oracleRanks(final.scores);
  const ranking = rankPlayers(final.scores);
  check("RANKING", ranking.length === 4 && new Set(ranking.map((e) => e.player)).size === 4, () => `ranking has ${ranking.length} entries`);
  for (const entry of ranking) {
    check("RANKING", entry.rank === oracle[entry.player] && entry.score === final.scores[entry.player], () => `${entry.player}: rankPlayers gives rank ${entry.rank} score ${entry.score}, oracle rank ${oracle[entry.player]} score ${final.scores[entry.player]}`);
  }
  check("RANKING", ranking.every((e, i) => i === 0 || (ranking[i - 1] as typeof e).rank <= e.rank), () => "ranking is not ordered by rank");
  check("RANKING", SEATS.some((seat) => oracle[seat] === 1), () => "no seat has rank 1");

  // REPLAY.
  let replayMismatch = false;
  const replayed = replay(seed, config, log);
  if (!replayed.ok) {
    replayMismatch = true;
    problems.push(`[REPLAY] replay rejected: ${canonical(replayed.error)}`);
  } else {
    if (!stateEquals(replayed.value, final)) {
      replayMismatch = true;
      problems.push("[REPLAY] stateEquals(replay(log), final) is false");
    }
    if (canonical(replayed.value) !== canonical(final)) {
      replayMismatch = true;
      problems.push("[REPLAY] the canonical forms of replay(log) and final differ");
    }
  }

  // VIEWS.
  for (const seat of SEATS) {
    const view = viewFor(final, seat);
    const keys = collectKeys(view);
    check("VIEWS", view.viewer === seat && view.phase === "ENDED", () => `${seat}: viewer ${view.viewer}, phase ${view.phase}`);
    check("VIEWS", view.pendingQuadKeys.length === 0 && SEATS.every((s) => view.guessSubmitted[s] === false) && view.myGuesses === null, () => `${seat}: the final view shows pending information`);
    check("VIEWS", view.ranking !== null && canonical(view.ranking) === canonical(ranking), () => `${seat}: the ranking of the view differs from rankPlayers`);
    check("VIEWS", canonical(view.lastReveal) === canonical(final.history[final.history.length - 1] ?? null) && view.history.length === final.history.length, () => `${seat}: the history of the view differs`);
    check("VIEWS", canonical(view.scores) === canonical(final.scores), () => `${seat}: scores of the view differ`);
    const leaked = SEALED_KEYS.filter((key) => keys.has(key));
    check("VIEWS", leaked.length === 0, () => `${seat}: the view contains sealed keys ${leaked.join(",")}`);
  }

  return {
    facts: {
      placements: placeEntries.length,
      actions: log.length,
      batches: final.history.length,
      codes: totalCodes,
      multiCodeBatches,
      bonusSeat,
      scores: { ...final.scores },
      ranks: oracle,
      endedAfterGuess,
      replayMismatch,
    },
    problems,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Diagnostics (descriptive counts per configuration)
// ---------------------------------------------------------------------------------------------------------

const perSeat = (initial: number): Record<PlayerId, number> => ({ P0: initial, P1: initial, P2: initial, P3: initial });

interface Tally {
  readonly configuration: Configuration;
  games: number;
  /** Games whose `playGame` threw or whose inspection found a problem. */
  failed: number;
  rejectedActions: number;
  strategyErrors: number;
  invariantViolations: number;
  actionLimitErrors: number;
  otherErrors: number;
  inspectionProblems: number;
  replayMismatches: number;
  determinismChecked: number;
  determinismMismatches: number;
  placementsMin: number;
  placementsMax: number;
  placementsSum: number;
  batches: number;
  codes: number;
  multiCodeBatches: number;
  codeOnlyEnds: number;
  gamesWithMultiCodeBatch: number;
  actions: number;
  endedAfterGuess: number;
  endedByEmptyingPlace: number;
  bonusSeat: Record<PlayerId, number>;
  scoreSum: Record<PlayerId, number>;
  outrightWins: Record<PlayerId, number>;
  sharedWins: Record<PlayerId, number>;
  tiesAtTop: number;
  elapsedMs: number;
  /** Canonical action log per seed, to compare the two visibility modes of one mix (descriptive diagnostics only). */
  readonly logs: Map<number, string>;
  /** Batches and multi-code batches per seed, to count each unique game once (descriptive diagnostics only). */
  readonly batchesBySeed: Map<number, { readonly batches: number; readonly multiCodeBatches: number }>;
}

function newTally(configuration: Configuration): Tally {
  return {
    configuration, games: 0, failed: 0, rejectedActions: 0, strategyErrors: 0, invariantViolations: 0, actionLimitErrors: 0,
    otherErrors: 0, inspectionProblems: 0, replayMismatches: 0, determinismChecked: 0, determinismMismatches: 0,
    placementsMin: Number.POSITIVE_INFINITY, placementsMax: 0, placementsSum: 0, batches: 0, codes: 0, multiCodeBatches: 0,
    codeOnlyEnds: 0, gamesWithMultiCodeBatch: 0, actions: 0, endedAfterGuess: 0, endedByEmptyingPlace: 0, bonusSeat: perSeat(0),
    scoreSum: perSeat(0), outrightWins: perSeat(0), sharedWins: perSeat(0), tiesAtTop: 0, elapsedMs: 0,
    logs: new Map<number, string>(), batchesBySeed: new Map<number, { batches: number; multiCodeBatches: number }>(),
  };
}

function addFacts(tally: Tally, facts: GameFacts): void {
  tally.games++;
  tally.placementsMin = Math.min(tally.placementsMin, facts.placements);
  tally.placementsMax = Math.max(tally.placementsMax, facts.placements);
  tally.placementsSum += facts.placements;
  tally.batches += facts.batches;
  tally.codes += facts.codes;
  tally.multiCodeBatches += facts.multiCodeBatches;
  if (facts.multiCodeBatches > 0) tally.gamesWithMultiCodeBatch++;
  tally.actions += facts.actions;
  if (facts.endedAfterGuess) tally.endedAfterGuess++;
  else tally.endedByEmptyingPlace++;
  if (facts.bonusSeat !== null) tally.bonusSeat[facts.bonusSeat]++;
  else tally.codeOnlyEnds++;
  const winners = SEATS.filter((seat) => facts.ranks[seat] === 1);
  if (winners.length > 1) tally.tiesAtTop++;
  for (const seat of SEATS) tally.scoreSum[seat] += facts.scores[seat];
  for (const seat of winners) (winners.length === 1 ? tally.outrightWins : tally.sharedWins)[seat]++;
  if (facts.replayMismatch) tally.replayMismatches++;
}

function countError(tally: Tally, error: unknown): void {
  if (error instanceof IllegalAiActionError) tally.rejectedActions++;
  else if (error instanceof InvariantViolation) tally.invariantViolations++;
  else if (error instanceof AiStrategyError) tally.strategyErrors++;
  else if (error instanceof ActionLimitError) tally.actionLimitErrors++;
  else tally.otherErrors++;
}

const TALLIES = new Map<string, Tally>();

const fixed = (value: number, digits = 3): string => value.toFixed(digits);
const share = (n: number, d: number): string => `${n} / ${d} (${d === 0 ? "n/a" : fixed((100 * n) / d, 2)} %)`;

function renderDiagnostics(tallies: readonly Tally[], seeds: number): string {
  const L: string[] = [];
  const header = ["Metric", ...tallies.map((t) => t.configuration.id)];
  const table = (rows: readonly (readonly string[])[], head: readonly string[] = header): void => {
    L.push(`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`);
    for (const row of rows) L.push(`| ${row.join(" | ")} |`);
    L.push("");
  };
  const row = (label: string, read: (t: Tally) => string): string[] => [label, ...tallies.map(read)];
  const mean = (sum: number, count: number): string => (count === 0 ? "n/a" : fixed(sum / count));

  L.push("# Headless self-play diagnostics (task 13.2)", "");
  L.push("**Diagnostic evidence from placeholder scoring (`DEV_PLACEHOLDER_SCORE_CONFIG`, provisional, no balance claim); synthetic headless self-play; NOT a balance study; no claim that ADVANCED is balanced, optimal or better than BEGINNER.**", "");
  L.push(
    "This file is written by `src/game/sim/e2e.test.ts` when the test runs with `E2E_WRITE_DIAGNOSTICS=1`, from the games of that run. It is descriptive: counts and means of the games the acceptance run played. It contains no timestamps and no timings, so the same code and the same `E2E_SEEDS` give the same file. No constant of the game was chosen or changed because of these numbers.",
    "",
  );
  L.push("## How the numbers were produced", "");
  L.push(`- Seeds: 0..${seeds - 1} (N = ${seeds}), every Seed in every configuration, so ${6 * seeds} complete configuration-specific games (see Counting conventions for the number of unique games).`);
  L.push("- Configurations: strategy mix x identity visibility. ALL_BEGINNER = BEGINNER on P0..P3; ALL_ADVANCED = ADVANCED on P0..P3; MIXED = P0 ADVANCED, P1 BEGINNER, P2 ADVANCED, P3 BEGINNER. Visibility is OWNER_ONLY or FACE_UP.");
  L.push("- Configuration of each game: `defaultConfig()` with `identityVisibility` overridden; the driver assigns an AI strategy to all four seats. The score table is the placeholder `rewardByError [6, 4, 3, 2, 1]`, `handEmptyBonus 3`.");
  L.push("- Every game ran with `checkInvariants: true` and was checked by the independent oracles of the test (see the header of the test file).");
  L.push("- Win means rank 1 of `rankPlayers` (competition ranking, no tiebreak). A game whose rank 1 is held by one seat is an outright win for that seat; a game whose rank 1 is shared counts a shared win for every seat at rank 1 and one tie at the top.");
  L.push("- Regenerate: `E2E_WRITE_DIAGNOSTICS=1 npx vitest --run src/game/sim/e2e.test.ts`.", "");

  // Counting conventions: configuration-specific games, unique games, games with a multi-code batch, multi-code batches.
  // A FACE_UP game whose complete action log equals the OWNER_ONLY game of the same mix and seed duplicates that game.
  let uniqueGames = 0, uniqueBatches = 0, uniqueMultiBatches = 0, uniqueGamesWithMulti = 0;
  let allBatches = 0, allMultiBatches = 0, allGamesWithMulti = 0, allGames = 0;
  for (const t of tallies) {
    allGames += t.games;
    allBatches += t.batches;
    allMultiBatches += t.multiCodeBatches;
    allGamesWithMulti += t.gamesWithMultiCodeBatch;
    const twin = t.configuration.visibility === "FACE_UP"
      ? tallies.find((o) => o.configuration.mix === t.configuration.mix && o.configuration.visibility === "OWNER_ONLY")
      : undefined;
    for (const [seed, log] of t.logs) {
      if (twin !== undefined && twin.logs.get(seed) === log) continue;
      const counts = t.batchesBySeed.get(seed);
      uniqueGames++;
      uniqueBatches += counts?.batches ?? 0;
      uniqueMultiBatches += counts?.multiCodeBatches ?? 0;
      if ((counts?.multiCodeBatches ?? 0) > 0) uniqueGamesWithMulti++;
    }
  }
  const seedList = (t: Tally): string => {
    const seedsWith = [...t.batchesBySeed].filter(([, c]) => c.multiCodeBatches > 0).map(([seed]) => seed).sort((a, b) => a - b);
    if (seedsWith.length === 0) return "none";
    return seedsWith.length <= 20 ? seedsWith.join(", ") : `${seedsWith.slice(0, 20).join(", ")} (+${seedsWith.length - 20} more)`;
  };
  L.push("## Counting conventions", "");
  L.push("- **Configuration-specific game**: one complete game of one seed in one configuration (strategy mix x visibility). The run plays " + String(allGames) + " of them; every `Games played` cell in the tables below counts configuration-specific games.");
  L.push("- **Unique game**: a configuration-specific game counted once. A FACE_UP game whose complete action log is identical to the OWNER_ONLY game of the same mix and seed is a duplicate of that game (see Visibility comparison) and is not counted again. The run contains " + String(uniqueGames) + " unique games. The two ALL_BEGINNER columns are therefore the same games, not two independent samples.");
  L.push("- **Game containing a multi-code batch**: a game with at least one batch that completes two or more Composite Codes at once.");
  L.push("- **Number of multi-code batches**: the count of such batches. A game with two multi-code batches adds 1 to the game count and 2 to the batch count.");
  L.push("- **Batch denominator**: the number of all prediction batches (one per placement that completes at least one Composite Code), counted over the same set of games as the numerator.", "");
  table(
    [
      ["Games", String(allGames), String(uniqueGames)],
      ["Games containing a multi-code batch", String(allGamesWithMulti), String(uniqueGamesWithMulti)],
      ["Multi-code batches", String(allMultiBatches), String(uniqueMultiBatches)],
      ["All batches (denominator)", String(allBatches), String(uniqueBatches)],
      ["Multi-code batches / all batches", share(allMultiBatches, allBatches), share(uniqueMultiBatches, uniqueBatches)],
    ],
    ["Quantity", "Configuration-specific games", "Unique games"],
  );
  L.push("Seeds with a multi-code batch, per configuration:", "");
  table(tallies.map((t) => [t.configuration.id, seedList(t)]), ["Configuration", "Seeds"]);

  L.push("## Results per configuration", "");
  table([
    row("Games played", (t) => String(t.games)),
    row("Games failed", (t) => String(t.failed)),
    row("Rejected actions (IllegalAiActionError)", (t) => String(t.rejectedActions)),
    row("Invariant violations", (t) => String(t.invariantViolations)),
    row("Strategy errors / action-limit errors / other errors", (t) => `${t.strategyErrors} / ${t.actionLimitErrors} / ${t.otherErrors}`),
    row("Games with an inspection problem", (t) => String(t.inspectionProblems)),
    row("Replay mismatches", (t) => String(t.replayMismatches)),
    row("Determinism re-runs (seed % 10 = 0): checked / mismatches", (t) => `${t.determinismChecked} / ${t.determinismMismatches}`),
    row("PLACE actions per game: min / mean / max", (t) => `${t.placementsMin} / ${mean(t.placementsSum, t.games)} / ${t.placementsMax}`),
    row("Accepted actions per game (mean)", (t) => mean(t.actions, t.games)),
    row("Prediction batches per game (mean)", (t) => mean(t.batches, t.games)),
    row("Composite Codes completed per game (mean)", (t) => mean(t.codes, t.games)),
    row("Batches with 2 codes / all batches", (t) => share(t.multiCodeBatches, t.batches)),
    row("Games with at least one 2-code batch", (t) => share(t.gamesWithMultiCodeBatch, t.games)),
    row("Game ended by the last guess / by a PLACE without code", (t) => `${t.endedAfterGuess} / ${t.endedByEmptyingPlace}`),
    row("Ties at the top (rank 1 shared)", (t) => share(t.tiesAtTop, t.games)),
  ]);

  L.push("## Hand-empty bonus seat (games per seat)", "");
  table(SEATS.map((seat) => row(seat, (t) => String(t.bonusSeat[seat]))), ["Seat", ...header.slice(1)]);

  L.push("## Mean final score per seat", "");
  L.push("Final score includes the hand-empty bonus. Seat P0 always places first, so a seat's mean also reflects its position, not only its strategy.", "");
  table(SEATS.map((seat) => row(`${seat}`, (t) => `${mean(t.scoreSum[seat], t.games)} (${t.configuration.mix.tiers[SEATS.indexOf(seat)]})`)), ["Seat (tier in that configuration)", ...header.slice(1)]);

  L.push("## Rank-1 results per seat", "");
  L.push("Each cell is outright wins / shared wins.", "");
  table(SEATS.map((seat) => row(seat, (t) => `${t.outrightWins[seat]} / ${t.sharedWins[seat]}`)), ["Seat", ...header.slice(1)]);

  L.push("## Results per tier", "");
  L.push("A tier's mean score is its seats' summed final scores divided by games times the number of seats of that tier. Wins are summed over the seats of the tier. In MIXED the two ADVANCED seats are P0 and P2 and the two BEGINNER seats are P1 and P3, so P0's first move and the seat order are confounded with the tier; no conclusion about strength follows.", "");
  const tierRows: string[][] = [];
  for (const t of tallies) {
    const tiers = [...new Set(t.configuration.mix.tiers)];
    for (const tier of tiers) {
      const seats = SEATS.filter((_, i) => t.configuration.mix.tiers[i] === tier);
      const scoreSum = seats.reduce((sum, seat) => sum + t.scoreSum[seat], 0);
      const outright = seats.reduce((sum, seat) => sum + t.outrightWins[seat], 0);
      const shared = seats.reduce((sum, seat) => sum + t.sharedWins[seat], 0);
      tierRows.push([
        t.configuration.id, tier, seats.join(" "), mean(scoreSum, t.games * seats.length), String(outright), String(shared),
        share(outright + shared, t.games * seats.length),
      ]);
    }
  }
  table(tierRows, ["Configuration", "Tier", "Seats", "Mean final score per seat", "Outright wins", "Shared wins", "Rank-1 results per seat-game"]);

  L.push("## Visibility comparison", "");
  L.push("For each strategy mix: the number of Seeds whose complete action log is identical in OWNER_ONLY and in FACE_UP. A strategy that does not read card identities plays the same game in both modes.", "");
  const visibilityRows: string[][] = [];
  for (const mix of MIXES) {
    const [owner, faceUp] = ["OWNER_ONLY", "FACE_UP"].map((v) => tallies.find((t) => t.configuration.mix === mix && t.configuration.visibility === v));
    if (owner === undefined || faceUp === undefined) continue;
    let same = 0;
    for (const [seed, log] of owner.logs) if (faceUp.logs.get(seed) === log) same++;
    visibilityRows.push([mix.name, share(same, owner.logs.size)]);
  }
  table(visibilityRows, ["Mix", "Seeds with identical action log in both modes"]);

  L.push("## Limitations", "");
  L.push("- The scores come from the placeholder score table; a different table changes every score, win and tie number above.");
  L.push("- The games are synthetic self-play of two simple heuristic strategies, not human play.");
  L.push("- Seat P0 places first in every game; the tables above do not separate seat position from tier.");
  L.push("- Neither strategy aims at a placement that completes two codes at once, so the 2-code rows rest on few games; they say nothing about how often a human player would see such a batch.");
  L.push("- The six configurations are not six independent samples: a strategy that does not read card identities plays identical games in both visibility modes (see Visibility comparison and Counting conventions).");
  L.push("- The numbers describe these seeds only (0.." + String(seeds - 1) + "); no statistical test was made and none is claimed.");
  L.push("");
  return L.join("\n");
}

// ---------------------------------------------------------------------------------------------------------
// The acceptance run
// ---------------------------------------------------------------------------------------------------------

describe(`end-to-end headless acceptance run: seeds 0..${N - 1} in each of the 6 configurations (${6 * N} games)`, () => {
  it("validates E2E_SEEDS: positive integers only, default 200, invalid values throw", () => {
    expect(parseSeedCount(undefined)).toBe(200);
    expect(parseSeedCount("")).toBe(200);
    expect(parseSeedCount("   ")).toBe(200);
    expect(parseSeedCount("1")).toBe(1);
    expect(parseSeedCount(" 37 ")).toBe(37);
    expect(parseSeedCount("4294967296")).toBe(4294967296);
    for (const bad of ["0", "-5", "2.5", "NaN", "abc", "2OO", "1e3", "+7", "4294967297", "99999999999999999999"]) {
      expect(() => parseSeedCount(bad), bad).toThrow(RangeError);
    }
    expect(N).toBeGreaterThanOrEqual(1);
  });

  it("the independent oracles agree with known values and detect corruption (negative controls)", () => {
    expect(oracleRanks({ P0: 5, P1: 5, P2: 3, P3: 0 })).toEqual({ P0: 1, P1: 1, P2: 3, P3: 4 });
    expect(oracleRanks({ P0: 2, P1: 2, P2: 2, P3: 2 })).toEqual({ P0: 1, P1: 1, P2: 1, P3: 1 });
    expect(oracleRanks({ P0: 0, P1: 9, P2: 4, P3: 9 })).toEqual({ P0: 4, P1: 1, P2: 3, P3: 1 });
    expect(rewardOracle([6, 4, 3, 2, 1], 20, 20)).toBe(6);
    expect(rewardOracle([6, 4, 3, 2, 1], 24, 20)).toBe(1);
    expect(rewardOracle([6, 4, 3, 2, 1], 25, 20)).toBe(0);
    expect(canonical({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonical({ a: [2, { c: 2, d: 1 }], b: 1 }));

    const config = configFor("OWNER_ONLY");
    const good = playGame({ seed: 3, config, strategies: strategiesFor(tierRecord(MIXES[2]!.tiers)), checkInvariants: true });
    expect(inspectGame(3, config, good).problems).toEqual([]);
    // A final state whose score is changed by one point: the recomputation from the log must notice.
    const tamperedScores = { ...good.final, scores: { ...good.final.scores, P2: good.final.scores.P2 + 1 } } as GameState;
    expect(inspectGame(3, config, { final: tamperedScores, log: good.log }).problems.some((p) => p.startsWith("[SCORES]"))).toBe(true);
    // A log without its last action: the replay and the grammar must notice.
    const shortLog = good.log.slice(0, -1);
    const problems = inspectGame(3, config, { final: good.final, log: shortLog }).problems;
    expect(problems.some((p) => p.startsWith("[REPLAY]"))).toBe(true);
    // A log with an extra PLACE: the 48-placement and consistency checks must notice.
    const extra = [...good.log, good.log.find((a) => a.type === "PLACE") as Action];
    expect(inspectGame(3, config, { final: good.final, log: extra }).problems.length).toBeGreaterThan(0);
  });

  for (const configuration of CONFIGURATIONS) {
    it(
      `${configuration.id}: seeds 0..${N - 1} (${N} games) all end correctly with zero rejected actions, valid invariants and exact replay`,
      { timeout: TIMEOUT_MS },
      () => {
        const tally = newTally(configuration);
        TALLIES.set(configuration.id, tally);
        const { mix, visibility, config } = configuration;
        const strategies = strategiesFor(tierRecord(mix.tiers));
        const failures: string[] = [];
        const started = performance.now();

        for (let seed = 0; seed < N; seed++) {
          const repro = reproSnippet(seed, mix.tiers, visibility, config);
          const where = `config ${configuration.id}, seed ${seed}`;
          let result: PlayGameResult;
          try {
            result = playGame({ seed, config, strategies, checkInvariants: true });
          } catch (error) {
            tally.games++;
            tally.failed++;
            countError(tally, error);
            failures.push(`${where}: playGame threw ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}\n  repro: ${repro}`);
            continue;
          }
          const inspection = inspectGame(seed, config, result);
          addFacts(tally, inspection.facts);
          tally.logs.set(seed, canonical(result.log));
          tally.batchesBySeed.set(seed, { batches: inspection.facts.batches, multiCodeBatches: inspection.facts.multiCodeBatches });
          if (inspection.problems.length > 0) {
            tally.failed++;
            tally.inspectionProblems++;
            failures.push(`${where}: ${inspection.problems[0]}${inspection.problems.length > 1 ? ` (+${inspection.problems.length - 1} more)` : ""}\n  repro: ${repro}`);
          }
          if (seed % DETERMINISM_STRIDE === 0) {
            tally.determinismChecked++;
            const again = playGame({ seed, config, strategies, checkInvariants: true });
            if (canonical(again.final) !== canonical(result.final) || canonical(again.log) !== canonical(result.log)) {
              tally.determinismMismatches++;
              failures.push(`${where}: a second playGame run with the same inputs gave a different game\n  repro: ${repro}`);
            }
          }
        }
        tally.elapsedMs = performance.now() - started;
        // eslint-disable-next-line no-console
        console.log(
          `[13.2 e2e] ${configuration.id}: ${tally.games} games, ${tally.failed} failed, ${tally.rejectedActions} rejected, ${tally.replayMismatches} replay mismatches, ` +
            `PLACE ${tally.placementsMin}/${(tally.placementsSum / Math.max(1, tally.games)).toFixed(2)}/${tally.placementsMax}, ${Math.round(tally.elapsedMs)} ms`,
        );

        expect(failures.length, `${failures.length} of ${N} games failed in ${configuration.id}; first failures:\n${failures.slice(0, 3).join("\n")}`).toBe(0);
        expect(tally.games).toBe(N);
        expect(tally.rejectedActions).toBe(0);
        expect(tally.invariantViolations).toBe(0);
        expect(tally.replayMismatches).toBe(0);
        expect(tally.determinismMismatches).toBe(0);
        expect(tally.determinismChecked).toBe(Math.ceil(N / DETERMINISM_STRIDE));
        expect(tally.placementsMax).toBeLessThanOrEqual(48);
        expect(tally.bonusSeat.P0 + tally.bonusSeat.P1 + tally.bonusSeat.P2 + tally.bonusSeat.P3 + tally.codeOnlyEnds).toBe(N);
      },
    );
  }

  afterAll(() => {
    const ordered = CONFIGURATIONS.map((c) => TALLIES.get(c.id));
    const complete = ordered.every((t) => t !== undefined && t.games === N && t.failed === 0);
    // eslint-disable-next-line no-console
    console.log(`[13.2 e2e] total ${ordered.reduce((sum, t) => sum + (t?.games ?? 0), 0)} games, ${Math.round(ordered.reduce((sum, t) => sum + (t?.elapsedMs ?? 0), 0))} ms in the six configurations`);
    if (!WRITE_DIAGNOSTICS) return;
    if (!complete) {
      // eslint-disable-next-line no-console
      console.log("[13.2 e2e] diagnostics not written: not all six configurations ran to completion without failures");
      return;
    }
    mkdirSync(dirname(DIAGNOSTICS_PATH), { recursive: true });
    writeFileSync(DIAGNOSTICS_PATH, renderDiagnostics(ordered as Tally[], N), "utf8");
    // eslint-disable-next-line no-console
    console.log(`[13.2 e2e] diagnostics written to ${DIAGNOSTICS_PATH}`);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Property 21
// ---------------------------------------------------------------------------------------------------------

interface Coverage21 {
  runs: number;
  mixes: Set<string>;
  seatTier: Record<PlayerId, Record<string, number>>;
  byVisibility: Record<IdentityVisibility, number>;
  humanSeats: number;
  aiSeats: number;
  gamesWithTwoCodeBatch: number;
  twoCodeBatches: number;
  batches: number;
  bonusSeat: Record<PlayerId, number>;
  endedAfterGuess: number;
  endedByEmptyingPlace: number;
  placementsMin: number;
  placementsMax: number;
  actionsMax: number;
  replayMismatches: number;
}

describe("Property 21: Termination and bounded length", () => {
  it(
    "for any Seed, any assignment of the registered strategies to the 4 seats, either visibility and any seat kinds, playGame ends in ENDED within 48 PLACE actions with no rejected action, all invariants, exact replay and no pending information",
    { timeout: TIMEOUT_P21_MS },
    () => {
      // Feature: qroker-playable-game, Property 21: Termination and bounded length
      // Validates: Requirements 9.6, 9.7, 20.2
      const tiers = registeredDifficulties();
      const cov: Coverage21 = {
        runs: 0, mixes: new Set<string>(), seatTier: { P0: {}, P1: {}, P2: {}, P3: {} },
        byVisibility: { OWNER_ONLY: 0, FACE_UP: 0 }, humanSeats: 0, aiSeats: 0, gamesWithTwoCodeBatch: 0, twoCodeBatches: 0,
        batches: 0, bonusSeat: perSeat(0), endedAfterGuess: 0, endedByEmptyingPlace: 0, placementsMin: Number.POSITIVE_INFINITY,
        placementsMax: 0, actionsMax: 0, replayMismatches: 0,
      };
      const arbTier: fc.Arbitrary<Difficulty> = fc.constantFrom(...tiers);
      const arbKind = fc.constantFrom("HUMAN" as const, "AI" as const);

      fc.assert(
        fc.property(
          fc.record({
            seed: arbSeed,
            assignment: fc.tuple(arbTier, arbTier, arbTier, arbTier),
            visibility: fc.constantFrom<IdentityVisibility>("OWNER_ONLY", "FACE_UP"),
            kinds: fc.tuple(arbKind, arbKind, arbKind, arbKind),
          }),
          ({ seed, assignment, visibility, kinds }) => {
            const mixTiers = assignment as Tiers;
            const seats = SEATS.map(
              (id, i): SeatConfig =>
                kinds[i] === "AI"
                  ? { id, kind: "AI", difficulty: mixTiers[i], name: `AI ${i}` }
                  : { id, kind: "HUMAN", name: `Human ${i}` },
            ) as unknown as GameConfig["seats"];
            const config: GameConfig = { ...defaultConfig(), seats, identityVisibility: visibility };
            const repro = reproSnippet(seed, mixTiers, visibility, config);
            const label = `seed ${seed}, tiers ${mixTiers.join("/")}, ${visibility}, kinds ${kinds.join("/")}`;
            const strategies = strategiesFor(tierRecord(mixTiers));

            let result: PlayGameResult;
            try {
              // (1) ENDED, (2) no rejected AI action, (3) the invariants after every action: playGame throws otherwise.
              result = playGame({ seed, config, strategies, checkInvariants: true });
            } catch (error) {
              throw new Error(`playGame threw for ${label}: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}\n  repro: ${repro}`);
            }
            // (3) to (8) and (10): inspection with independent bookkeeping.
            const inspection = inspectGame(seed, config, result);
            if (inspection.problems.length > 0) {
              throw new Error(`${label}: ${inspection.problems.join("; ")}\n  repro: ${repro}`);
            }
            // (4) bounds again, explicitly.
            const f = inspection.facts;
            expect(result.final.phase, label).toBe("ENDED");
            expect(f.placements, label).toBeLessThanOrEqual(48);
            expect(f.actions, label).toBeLessThanOrEqual(DEFAULT_MAX_ACTIONS);
            // (5) every batch of the history has points for all four seats; the history has one record per batch.
            expect(result.final.pending, label).toBeNull();
            expect(result.final.history.every((r) => r.perPlayer.length === 4 && new Set(r.perPlayer.map((p) => p.player)).size === 4), label).toBe(true);
            expect(result.final.history.length, label).toBe(f.batches);
            // (9) the same inputs reproduce the same game.
            const again = playGame({ seed, config, strategies, checkInvariants: true });
            expect(canonical(again.final), `${label}: second run differs\n  repro: ${repro}`).toBe(canonical(result.final));
            expect(canonical(again.log), `${label}: second log differs\n  repro: ${repro}`).toBe(canonical(result.log));

            cov.runs++;
            cov.mixes.add(mixTiers.join("/"));
            for (const [i, seat] of SEATS.entries()) {
              const tier = mixTiers[i] as Difficulty;
              cov.seatTier[seat][tier] = (cov.seatTier[seat][tier] ?? 0) + 1;
              if (kinds[i] === "AI") cov.aiSeats++;
              else cov.humanSeats++;
            }
            cov.byVisibility[visibility]++;
            cov.batches += f.batches;
            cov.twoCodeBatches += f.multiCodeBatches;
            if (f.multiCodeBatches > 0) cov.gamesWithTwoCodeBatch++;
            if (f.bonusSeat !== null) cov.bonusSeat[f.bonusSeat]++;
            if (f.endedAfterGuess) cov.endedAfterGuess++;
            else cov.endedByEmptyingPlace++;
            cov.placementsMin = Math.min(cov.placementsMin, f.placements);
            cov.placementsMax = Math.max(cov.placementsMax, f.placements);
            cov.actionsMax = Math.max(cov.actionsMax, f.actions);
            if (f.replayMismatch) cov.replayMismatches++;
          },
        ),
        { seed: SEED_P21, numRuns: NUM_RUNS_P21 },
      );

      // eslint-disable-next-line no-console
      console.log(`[13.2 P21 coverage] ${JSON.stringify({ ...cov, mixes: cov.mixes.size })}`);

      // Coverage guards (observed rates of the fixed-seed run are in the notes at the end of this file). The guards use
      // the registry list, so they hold when a third tier is registered.
      expect(tiers.length, "registered tiers").toBeGreaterThanOrEqual(2);
      expect(cov.runs).toBe(NUM_RUNS_P21);
      for (const seat of SEATS) {
        for (const tier of tiers) expect(cov.seatTier[seat][tier] ?? 0, `${seat} plays ${tier}`).toBeGreaterThanOrEqual(15);
      }
      expect(cov.mixes.size, "distinct tier assignments").toBeGreaterThanOrEqual(Math.min(tiers.length ** 4, 12));
      expect(cov.byVisibility.OWNER_ONLY, "OWNER_ONLY games").toBeGreaterThanOrEqual(50);
      expect(cov.byVisibility.FACE_UP, "FACE_UP games").toBeGreaterThanOrEqual(50);
      expect(cov.humanSeats, "seats configured HUMAN").toBeGreaterThanOrEqual(150);
      expect(cov.aiSeats, "seats configured AI").toBeGreaterThanOrEqual(150);
      // No guard on `twoCodeBatches`: the AI strategies do not aim at a placement that completes two codes at once, and
      // self-play rarely produces one (the observed count of this fixed-seed run is in the notes). Two-code batches are
      // covered by the fixtures of ai.properties.test.ts and the engine tests; here the count is recorded only.
      for (const seat of SEATS) expect(cov.bonusSeat[seat], `games where ${seat} gets the bonus`).toBeGreaterThanOrEqual(5);
      expect(cov.endedAfterGuess, "games that end after the last guess").toBeGreaterThanOrEqual(20);
      expect(cov.endedByEmptyingPlace, "games that end by a PLACE without a code").toBeGreaterThanOrEqual(5);
      expect(cov.placementsMax - cov.placementsMin, "range of PLACE counts").toBeGreaterThanOrEqual(3);
      expect(cov.placementsMax, "most PLACE actions").toBeLessThanOrEqual(48);
      expect(cov.replayMismatches).toBe(0);
    },
  );
});

// ---------------------------------------------------------------------------------------------------------
// Notes (task 13.2)
// ---------------------------------------------------------------------------------------------------------
// Acceptance run, N = 200 (default): 6 configurations x 200 seeds (0..199) = 1200 configuration-specific games, 200 per
// configuration, all with checkInvariants true. They are 1000 unique games: the two ALL_BEGINNER configurations play the
// same 200 games (identical action logs), see "Counting conventions" in the diagnostics. Result: 1200 passed, 0 failed, 0 rejected actions, 0 invariant violations, 0 replay
// mismatches, 120 determinism re-runs (seeds 0, 10, ..., 190 in each configuration) identical. PLACE actions per game: min
// 13, max 45 (never above 48). The descriptive numbers are in docs/game/headless-diagnostics.md.
//
// Elapsed time of this file (Windows, Intel i5-10400F 6 cores / 12 threads, Node, Vitest 5.1.0):
//   CPU load 17 % before the run (the Android emulator process is present): 22.8 s for the whole file; the six
//   configurations took 3.1 s, 2.6 s, 4.3 s, 3.7 s, 2.6 s and 1.9 s (18.1 s together), Property 21 took 3.1 s.
//   A repeat with CPU load 34 % before the run took 20.5 s. The FIRST run of the file took 81 s (same games; the machine
//   was busier at that moment, the cause was not isolated), which is why the timeout is explicit.
// The 5 s default timeout of Vitest would not hold for 200 games per configuration under that contention, hence the
// explicit TIMEOUT_MS (120 s); no delay is inserted.
//
// Property 21 (seed 20261321, 150 runs), observed rates of that run:
//   distinct tier assignments 16 of 16 (2 registered tiers on 4 seats give 2^4 = 16 assignments; every one occurs);
//   per (seat, tier) marginal 71 to 79 games out of 150 (the two tiers of one seat add up to 150: P0 ADVANCED 79 /
//   BEGINNER 71, P1 77 / 73, P2 79 / 71, P3 71 / 79). This is NOT the count per complete assignment. The counts per
//   complete assignment were not recorded when the notes were written. Re-deriving them by regenerating the inputs with
//   the same fast-check seed and numRuns (the marginals, the visibility split and the HUMAN/AI totals reproduced exactly)
//   gives 2 to 16 games per assignment, 9.375 on average (the sum is 150); the least frequent assignment is
//   ADVANCED/ADVANCED/BEGINNER/ADVANCED with 2 games, the most frequent are ADVANCED/ADVANCED/ADVANCED/BEGINNER and
//   ADVANCED/BEGINNER/ADVANCED/ADVANCED with 16 each. The only guard on assignments is "at least 12 distinct";
//   OWNER_ONLY 83 games, FACE_UP 67 games; seats configured HUMAN 312, AI 288 (seat counts, 150 games x 4 seats = 600);
//   batches 708 (about 4.7 per game); batches with two codes 0 (no game with a two-code batch: neither tier aims at one,
//   so there is no guard for it). For comparison, the acceptance run above has 9 configuration-specific games with a
//   two-code batch (ALL_BEGINNER seeds 152, 158, 178, 195 in each of its two visibility modes: 8; MIXED / OWNER_ONLY
//   seed 21: 1), which are 5 unique games, with 9 and 5 two-code batches (one per game) out of 6055 and 5750 batches
//   (configuration-specific and unique counts; see the diagnostics);
//   bonus seat P0 44, P1 38, P2 37, P3 31; games ending after the last guess 113, ending by an emptying PLACE without a
//   code 37; PLACE count range 13..45; most accepted actions in one game 78 (the guard is 300); replay mismatches 0.
// Guards (minimum, with the margin to the observed number): each tier on each seat >= 15 (per-(seat, tier) marginal, min observed 71); at least 12
// distinct assignments (16); each visibility >= 50 games (67); HUMAN and AI seats >= 150 (288); bonus seat >= 5 each (31);
// ending after a guess >= 20 (113); ending by an emptying PLACE >= 5 (37); PLACE range >= 3 (32).
//
// Sanity checks of the test itself (the negative controls in the second `it`): a score changed by one point is reported as
// [SCORES]; a log without its last action is reported as [REPLAY]; a log with an extra PLACE is reported. The independent
// oracles (competition ranking by sorting, reward by table lookup, hidden sum from card values, canonical comparison) are
// checked on known values there.
