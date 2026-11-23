// Seat-balanced ADVANCED vs BEGINNER comparison on the existing headless driver.
//
// For every seed in 0..N-1 and for each identity visibility (OWNER_ONLY, FACE_UP) two games are played from the
// same initial deal: game 1 gives ADVANCED to P0/P2 and BEGINNER to P1/P3, game 2 swaps the tiers.
// Nothing here changes gameplay, strategies or score values: the engine (`playGame`), the strategies (`getStrategy`),
// the ranking (`rankPlayers`) and the configuration (`defaultConfig`) are imported as they are. The score table and
// the hand-empty bonus are read from the runtime configuration of each game and printed in the output.
//
// Usage:  npx tsx scripts/ai-seat-balanced-comparison.ts [--seeds N] [--out path.json]
//   --seeds N   seeds 0..N-1 (default 200; use 2 for the smoke check)
//   --out PATH  also write the JSON result to PATH
// The JSON result goes to stdout. The script exits 0 only when every game completed and every check passed.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { rankPlayers } from '../src/game/core/ranking';
import { defaultConfig, newGame } from '../src/game/core/state';
import type { GameState } from '../src/game/core/state';
import { SEATS } from '../src/game/core/turn';
import type { Action, GameConfig, IdentityVisibility, PlayerId } from '../src/game/core/types';
import { playGame, strategiesFor } from '../src/game/sim/play-game';

type Tier = 'ADVANCED' | 'BEGINNER';
const TIERS: readonly Tier[] = ['ADVANCED', 'BEGINNER'];
const VISIBILITIES: readonly IdentityVisibility[] = ['OWNER_ONLY', 'FACE_UP'];
/** Assignment 1: ADVANCED on P0/P2. Assignment 2: tiers swapped. */
const ASSIGNMENTS: readonly Record<PlayerId, Tier>[] = [
  { P0: 'ADVANCED', P1: 'BEGINNER', P2: 'ADVANCED', P3: 'BEGINNER' },
  { P0: 'BEGINNER', P1: 'ADVANCED', P2: 'BEGINNER', P3: 'ADVANCED' },
];

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const SEED_COUNT = Number(argValue('--seeds') ?? '200');
if (!Number.isInteger(SEED_COUNT) || SEED_COUNT < 1) throw new RangeError('--seeds must be a positive integer');

interface TierTally {
  seatGames: number; // seat-games: games x 2 seats of the tier
  rankSum: number;
  rank1Outright: number; // seat-games in which this seat is the only rank-1 seat
  rank1Shared: number; // seat-games in which this seat shares rank 1
  scoreSum: number;
  predictionPointSum: number; // final score minus the hand-empty bonus
  guesses: number;
  absErrorSum: number;
  exactGuesses: number;
  bonusGames: number; // games in which a seat of this tier got the hand-empty bonus
}
const emptyTally = (): TierTally => ({
  seatGames: 0, rankSum: 0, rank1Outright: 0, rank1Shared: 0, scoreSum: 0, predictionPointSum: 0,
  guesses: 0, absErrorSum: 0, exactGuesses: 0, bonusGames: 0,
});

interface GameRecord {
  readonly seed: number;
  readonly assignment: 0 | 1;
  readonly final: GameState;
  /** Mean final score per seat of each tier in this game. */
  readonly tierMeanScore: Record<Tier, number>;
}

const problems: string[] = [];
const failedGames: { seed: number; visibility: IdentityVisibility; assignment: number; error: string }[] = [];
const check = (ok: boolean, message: string): void => {
  if (!ok) problems.push(message);
};

/** Guesses of one game: [tier-of-seat, |guess - hiddenSum|]. Batch i of the log matches history[i]. */
function collectGuesses(final: GameState, tiers: Record<PlayerId, Tier>, label: string): { tier: Tier; error: number }[] {
  const out: { tier: Tier; error: number }[] = [];
  const log: readonly Action[] = final.log;
  let batch = 0;
  for (let i = 0; i < log.length; i++) {
    const entry = log[i] as Action;
    if (entry.type !== 'PLACE' || log[i + 1]?.type !== 'SUBMIT_GUESSES') continue;
    const record = final.history[batch];
    if (record === undefined) {
      check(false, `${label}: more guess batches than history records`);
      return out;
    }
    const submissions = log.slice(i + 1, i + 5).filter((a): a is Extract<Action, { type: 'SUBMIT_GUESSES' }> => a.type === 'SUBMIT_GUESSES');
    check(submissions.length === 4, `${label}: batch ${batch} has ${submissions.length} submissions`);
    for (const submission of submissions) {
      for (const code of record.codes) {
        const guess = submission.guesses[code.quadKey];
        check(typeof guess === 'number', `${label}: ${submission.player} has no guess for ${code.quadKey} in batch ${batch}`);
        if (typeof guess === 'number') out.push({ tier: tiers[submission.player], error: Math.abs(guess - code.hiddenSum) });
      }
    }
    batch++;
  }
  check(batch === final.history.length, `${label}: ${batch} guess batches but ${final.history.length} history records`);
  return out;
}

const dealFingerprint = (s: GameState): string => JSON.stringify({ board: s.board, deck: s.deck, hands: s.hands, turn: s.turn });

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const stdErr = (xs: readonly number[]): number => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length);
};

const results: Record<string, unknown> = {};
let attempted = 0;
let completed = 0;
let scoreConfigUsed: unknown = null;

for (const visibility of VISIBILITIES) {
  const config: GameConfig = { ...defaultConfig(), identityVisibility: visibility };
  const sc = config.scoreConfig.config;
  const scoreRecord = { id: config.scoreConfig.id, provisional: config.scoreConfig.provisional, rewardByError: [...sc.rewardByError], handEmptyBonus: sc.handEmptyBonus };
  if (scoreConfigUsed !== null && JSON.stringify(scoreConfigUsed) !== JSON.stringify(scoreRecord)) check(false, 'score configuration differs between modes');
  scoreConfigUsed = scoreRecord;

  const tally: Record<Tier, TierTally> = { ADVANCED: emptyTally(), BEGINNER: emptyTally() };
  const perAssignment: Record<number, { diffs: number[] }> = { 0: { diffs: [] }, 1: { diffs: [] } };
  const seedDiffs: number[] = [];
  const firstSeatTier: Record<Tier, number> = { ADVANCED: 0, BEGINNER: 0 };
  let gamesCompleted = 0;
  let gamesAttempted = 0;
  let sharedTopGames = 0;
  let pairsComplete = 0;
  let pairsDealIdentical = 0;
  const endedBy = { lastGuess: 0, emptyingPlace: 0 };
  // Per assignment, from the point of view of ADVANCED: games, ADVANCED outright wins, BEGINNER outright wins, games with a shared top rank, ADVANCED bonus games.
  const byAssignment = [0, 1].map(() => ({ games: 0, advancedOutright: 0, beginnerOutright: 0, sharedTop: 0, advancedBonus: 0 }));

  for (let seed = 0; seed < SEED_COUNT; seed++) {
    const records: GameRecord[] = [];
    const deals: string[] = [];
    for (const assignmentIndex of [0, 1] as const) {
      const tiers = ASSIGNMENTS[assignmentIndex] as Record<PlayerId, Tier>;
      const label = `seed ${seed} ${visibility} assignment ${assignmentIndex + 1}`;
      gamesAttempted++;
      attempted++;
      try {
        const created = newGame({ seed, config });
        if (!created.ok) throw new Error(`newGame rejected: ${created.error.code}`);
        deals.push(dealFingerprint(created.value));
        firstSeatTier[tiers[created.value.turn]]++;
        const { final } = playGame({ seed, config, strategies: strategiesFor(tiers) });
        check(final.phase === 'ENDED', `${label}: phase ${final.phase}`);
        const ranking = rankPlayers(final.scores);
        check(ranking.length === 4, `${label}: ranking has ${ranking.length} entries`);
        check(final.config.scoreConfig.config.handEmptyBonus === sc.handEmptyBonus && JSON.stringify(final.config.scoreConfig.config.rewardByError) === JSON.stringify(sc.rewardByError), `${label}: final state used another score configuration`);
        gamesCompleted++;
        completed++;

        const rank1 = ranking.filter((e) => e.rank === 1).map((e) => e.player);
        if (rank1.length > 1) sharedTopGames++;
        const ba = byAssignment[assignmentIndex] as (typeof byAssignment)[number];
        ba.games++;
        if (rank1.length > 1) ba.sharedTop++;
        else if (tiers[rank1[0] as PlayerId] === 'ADVANCED') ba.advancedOutright++;
        else ba.beginnerOutright++;
        if (final.bonusAwarded !== null && tiers[final.bonusAwarded] === 'ADVANCED') ba.advancedBonus++;
        const bonusSeat = final.bonusAwarded;
        check(bonusSeat !== null || final.scoredGroups.length >= 5, `${label}: neither ending condition was reached`);
        if (final.log[final.log.length - 1]?.type === 'SUBMIT_GUESSES') endedBy.lastGuess++;
        else endedBy.emptyingPlace++;
        for (const entry of ranking) {
          const t = tally[tiers[entry.player]];
          t.seatGames++;
          t.rankSum += entry.rank;
          t.scoreSum += entry.score;
          t.predictionPointSum += entry.score - (entry.player === bonusSeat ? sc.handEmptyBonus : 0);
          if (entry.rank === 1) {
            if (rank1.length === 1) t.rank1Outright++;
            else t.rank1Shared++;
          }
        }
        if (bonusSeat !== null) tally[tiers[bonusSeat]].bonusGames++;
        for (const g of collectGuesses(final, tiers, label)) {
          const t = tally[g.tier];
          t.guesses++;
          t.absErrorSum += g.error;
          if (g.error === 0) t.exactGuesses++;
        }
        const tierMeanScore = {} as Record<Tier, number>;
        for (const tier of TIERS) tierMeanScore[tier] = mean(SEATS.filter((s) => tiers[s] === tier).map((s) => final.scores[s]));
        records.push({ seed, assignment: assignmentIndex, final, tierMeanScore });
      } catch (error) {
        failedGames.push({ seed, visibility, assignment: assignmentIndex + 1, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
      }
    }
    check(deals.length === 2 && deals[0] === deals[1], `seed ${seed} ${visibility}: the initial deal or starting seat differs inside the pair`);
    if (deals.length === 2 && deals[0] === deals[1]) pairsDealIdentical++;
    if (records.length === 2) {
      pairsComplete++;
      const diffs = records.map((r) => r.tierMeanScore.ADVANCED - r.tierMeanScore.BEGINNER);
      (perAssignment[0] as { diffs: number[] }).diffs.push(diffs[0] as number);
      (perAssignment[1] as { diffs: number[] }).diffs.push(diffs[1] as number);
      seedDiffs.push(mean(diffs));
    }
  }

  const perTier = {} as Record<Tier, unknown>;
  for (const tier of TIERS) {
    const t = tally[tier];
    perTier[tier] = {
      seatGames: t.seatGames,
      outrightWins: t.rank1Outright,
      sharedFirstPlaces: t.rank1Shared,
      meanRank: t.rankSum / t.seatGames,
      meanFinalScorePerSeat: t.scoreSum / t.seatGames,
      meanPredictionPointsPerSeat: t.predictionPointSum / t.seatGames,
      guesses: t.guesses,
      meanAbsGuessError: t.absErrorSum / t.guesses,
      exactGuessRate: t.exactGuesses / t.guesses,
      handEmptyBonusGames: t.bonusGames,
      handEmptyBonusRate: t.bonusGames / gamesCompleted,
    };
  }
  results[visibility] = {
    scoreConfig: scoreRecord,
    gamesAttempted,
    gamesCompleted,
    pairsComplete,
    pairsDealIdentical,
    gamesWithSharedTopRank: sharedTopGames,
    firstSeatGamesByTier: firstSeatTier,
    endedBy,
    byAssignment: { advancedOnP0P2: byAssignment[0], advancedOnP1P3: byAssignment[1] },
    perTier,
    scoreDifferenceAdvancedMinusBeginner: {
      seeds: seedDiffs.length,
      meanOfSeedAverages: mean(seedDiffs),
      standardError: seedDiffs.length > 1 ? stdErr(seedDiffs) : null,
      seedsAdvancedAhead: seedDiffs.filter((d) => d > 0).length,
      seedsEqual: seedDiffs.filter((d) => d === 0).length,
      seedsBeginnerAhead: seedDiffs.filter((d) => d < 0).length,
      assignment1_advancedOnP0P2_mean: mean((perAssignment[0] as { diffs: number[] }).diffs),
      assignment2_advancedOnP1P3_mean: mean((perAssignment[1] as { diffs: number[] }).diffs),
    },
  };
  check(firstSeatTier.ADVANCED === firstSeatTier.BEGINNER, `${visibility}: first seat is not balanced ${JSON.stringify(firstSeatTier)}`);
}

const output = {
  seeds: `0..${SEED_COUNT - 1}`,
  expectedGames: SEED_COUNT * 4,
  gamesAttempted: attempted,
  gamesCompleted: completed,
  failedGames,
  checkFailures: problems,
  scoreConfigUsed,
  results,
};
const json = JSON.stringify(output, null, 2);
const outPath = argValue('--out');
if (outPath !== undefined) {
  const full = resolve(outPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, `${json}\n`);
}
process.stdout.write(`${json}\n`);
process.exit(failedGames.length === 0 && problems.length === 0 && completed === SEED_COUNT * 4 ? 0 : 1);
