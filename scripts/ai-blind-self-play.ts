// Seat/turn-order and Blind-mode self-play experiment (read-only with respect to the repository).
//
// For each identity mode (OWNER_ONLY = Normal, BLIND, BLIND_SCORE_ONLY), each seed in 0..N-1 and each of eight
// lineups, one complete game is played with the existing engine (playGame), the existing AI strategies (registry)
// and the existing ranking (rankPlayers). Lineups: all BEGINNER, all ADVANCED, and the six ways to place two
// ADVANCED seats among four seats with BEGINNER on the other two.
//
// Position = turn-order seat: P0 acts first in every game (the engine starts at P0), so position 1..4 is P0..P3.
// The result therefore measures the combined seat and turn-order effect.
//
// Win share: a game's win is split equally among all seats tied for rank 1 (tie-adjusted). Shares sum to 1 per game.
// Uncertainty: percentile bootstrap that resamples whole seeds (all lineups and modes of a seed stay together).
//
// Raw per-game records (with action-log SHA-256 hashes and deal fingerprints) and the summary go to --out, which must
// be outside Git. The Korean report is written from the summary.
//
// Usage:
//   npx tsx scripts/ai-blind-self-play.ts --seeds 2 --out <dir>      smoke test (48 games)
//   npx tsx scripts/ai-blind-self-play.ts --seeds 200 --out <dir>    full run (4,800 games)
//   options: --boot B (default 2000), --bootSeed S (default 20261124)

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { rankPlayers } from '../src/game/core/ranking';
import { defaultConfig, newGame } from '../src/game/core/state';
import type { GameState } from '../src/game/core/state';
import type { Difficulty, GameConfig, IdentityVisibility, PlayerId, SeatConfig } from '../src/game/core/types';
import { playGame, strategiesFor } from '../src/game/sim/play-game';

const SEATS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];
const MODES: readonly IdentityVisibility[] = ['OWNER_ONLY', 'BLIND', 'BLIND_SCORE_ONLY'];
const MODE_LABEL: Record<string, string> = {
  OWNER_ONLY: 'Normal',
  BLIND: 'Blind (sum and points)',
  BLIND_SCORE_ONLY: 'Blind (points only)',
};

// Lineup 0: all BEGINNER. Lineup 1: all ADVANCED. Lineups 2..7: ADVANCED on the pair, BEGINNER elsewhere.
const PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3],
];
const LINEUPS: ReadonlyArray<Record<PlayerId, Difficulty>> = [
  { P0: 'BEGINNER', P1: 'BEGINNER', P2: 'BEGINNER', P3: 'BEGINNER' },
  { P0: 'ADVANCED', P1: 'ADVANCED', P2: 'ADVANCED', P3: 'ADVANCED' },
  ...PAIRS.map(([a, b]) => {
    const tiers: Record<PlayerId, Difficulty> = { P0: 'BEGINNER', P1: 'BEGINNER', P2: 'BEGINNER', P3: 'BEGINNER' };
    tiers[SEATS[a]!] = 'ADVANCED';
    tiers[SEATS[b]!] = 'ADVANCED';
    return tiers;
  }),
];
const LINEUP_NAMES = ['all BEGINNER', 'all ADVANCED', 'ADV P0+P1', 'ADV P0+P2', 'ADV P0+P3', 'ADV P1+P2', 'ADV P1+P3', 'ADV P2+P3'];

const argValue = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : fallback;
};
const SEED_COUNT = Number(argValue('--seeds', '200'));
const OUT = resolve(argValue('--out', join(process.env.TEMP ?? '.', 'qroker-blind-selfplay')));
const BOOT = Number(argValue('--boot', '2000'));
const BOOT_SEED = Number(argValue('--bootSeed', '20261124'));
if (!Number.isInteger(SEED_COUNT) || SEED_COUNT < 1) throw new RangeError('--seeds must be a positive integer');

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

interface GameRecord {
  mode: IdentityVisibility;
  seed: number;
  lineup: number;
  tiers: Record<PlayerId, Difficulty>;
  ok: boolean;
  error?: string;
  scores?: Record<PlayerId, number>;
  ranks?: Record<PlayerId, number>;
  shares?: Record<PlayerId, number>;
  shared?: boolean; // more than one seat tied for rank 1
  bonusSeat?: PlayerId | null;
  actions?: number;
  logHash?: string;
  dealHash?: string;
  firstSeatTier?: Difficulty;
}

function configFor(mode: IdentityVisibility, lineup: Record<PlayerId, Difficulty>): GameConfig {
  const seats: SeatConfig[] = SEATS.map((id) => ({ id, kind: 'AI', difficulty: lineup[id], name: id }) as SeatConfig);
  return { ...defaultConfig(), seats, identityVisibility: mode };
}

function dealHash(seed: number, config: GameConfig): string {
  const created = newGame({ seed, config });
  if (!created.ok) throw new Error(`newGame rejected seed ${seed}: ${created.error.code}`);
  const s: GameState = created.value;
  return sha256(JSON.stringify({ board: s.board, hands: s.hands, deck: s.deck, turn: s.turn }));
}

function runGame(mode: IdentityVisibility, seed: number, lineupIndex: number): GameRecord {
  const tiers = LINEUPS[lineupIndex]!;
  const record: GameRecord = { mode, seed, lineup: lineupIndex, tiers, ok: false };
  try {
    const config = configFor(mode, tiers);
    record.dealHash = dealHash(seed, config);
    const { final, log } = playGame({ seed, config, strategies: strategiesFor(tiers), checkInvariants: true });
    if (final.phase !== 'ENDED') throw new Error(`phase ${final.phase}`);
    const ranking = rankPlayers(final.scores);
    const rank1 = ranking.filter((e) => e.rank === 1).map((e) => e.player);
    const shares = Object.fromEntries(SEATS.map((s) => [s, rank1.includes(s) ? 1 / rank1.length : 0])) as Record<PlayerId, number>;
    const total = SEATS.reduce((sum, s) => sum + shares[s], 0);
    if (Math.abs(total - 1) > 1e-12) throw new Error(`win shares sum to ${total}`);
    record.scores = { ...final.scores } as Record<PlayerId, number>;
    record.ranks = Object.fromEntries(ranking.map((e) => [e.player, e.rank])) as Record<PlayerId, number>;
    record.shares = shares;
    record.shared = rank1.length > 1;
    record.bonusSeat = final.bonusAwarded;
    record.actions = log.length;
    record.logHash = sha256(JSON.stringify(log));
    record.firstSeatTier = tiers.P0;
    record.ok = true;
  } catch (error) {
    record.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  return record;
}

// ------------------------------------------------------------------------------------------------ run
const games: GameRecord[] = [];
const started = Date.now();
for (let seed = 0; seed < SEED_COUNT; seed++) {
  for (const mode of MODES) {
    for (let lineup = 0; lineup < LINEUPS.length; lineup++) games.push(runGame(mode, seed, lineup));
  }
}
const elapsedSeconds = (Date.now() - started) / 1000;

// ------------------------------------------------------------------------------------------------ checks
const attempted = games.length;
const completed = games.filter((g) => g.ok);
const failures = games.filter((g) => !g.ok).map((g) => ({ mode: g.mode, seed: g.seed, lineup: LINEUP_NAMES[g.lineup], error: g.error }));
const checks: Record<string, boolean> = {};

// Paired deals: within one seed, every mode and lineup starts from the same board, hands, deck and starting seat.
let dealPairsChecked = 0;
let dealPairsIdentical = 0;
for (let seed = 0; seed < SEED_COUNT; seed++) {
  const hashes = new Set(games.filter((g) => g.seed === seed && g.dealHash !== undefined).map((g) => g.dealHash));
  dealPairsChecked++;
  if (hashes.size === 1) dealPairsIdentical++;
}
checks.dealsIdenticalWithinSeed = dealPairsIdentical === dealPairsChecked;
checks.allGamesCompleted = failures.length === 0;
checks.winSharesSumToOne = completed.every((g) => g.shares !== undefined && Math.abs(Object.values(g.shares).reduce((a, b) => a + b, 0) - 1) < 1e-12);
checks.everyCompletedGameHasRanking = completed.every((g) => g.ranks !== undefined && Object.keys(g.ranks).length === 4);
// Each tier takes the first seat equally often across all lineups (P0 is ADVANCED in lineup 1 and three mixed lineups).
const firstByTier: Record<string, number> = { BEGINNER: 0, ADVANCED: 0 };
for (const g of completed) firstByTier[g.tiers.P0]! += 1;
checks.firstSeatBalancedAcrossTiers = firstByTier.BEGINNER === firstByTier.ADVANCED;

// ------------------------------------------------------------------------------------------------ per-seed sums
// For each (mode, seed) the sums of shares and seat-games per tier and position. Pure lineups: one game per seed.
interface SeedSums {
  pureShare: number[][]; // [lineupType 0=BEGINNER,1=ADVANCED][position 0..3]
  pureGames: number[]; // [lineupType]
  mixShare: number[][]; // [tier 0=BEGINNER,1=ADVANCED][position]
  mixSeatGames: number[][];
  outright: number[][]; // [tier][position] outright wins (seat-games)
  shared: number[][]; // [tier][position] shared first places (seat-games)
  pureOutright: number[][];
  pureShared: number[][];
}
const TIER_INDEX: Record<string, number> = { BEGINNER: 0, ADVANCED: 1 };
const emptySums = (): SeedSums => ({
  pureShare: [[0, 0, 0, 0], [0, 0, 0, 0]],
  pureGames: [0, 0],
  mixShare: [[0, 0, 0, 0], [0, 0, 0, 0]],
  mixSeatGames: [[0, 0, 0, 0], [0, 0, 0, 0]],
  outright: [[0, 0, 0, 0], [0, 0, 0, 0]],
  shared: [[0, 0, 0, 0], [0, 0, 0, 0]],
  pureOutright: [[0, 0, 0, 0], [0, 0, 0, 0]],
  pureShared: [[0, 0, 0, 0], [0, 0, 0, 0]],
});
const sums = new Map<string, SeedSums>();
const keyOf = (mode: IdentityVisibility, seed: number): string => `${mode}|${seed}`;
for (const g of completed) {
  const key = keyOf(g.mode, g.seed);
  if (!sums.has(key)) sums.set(key, emptySums());
  const s = sums.get(key)!;
  if (g.lineup <= 1) {
    const t = g.lineup; // 0 = all BEGINNER, 1 = all ADVANCED
    s.pureGames[t]! += 1;
    SEATS.forEach((seat, p) => {
      s.pureShare[t]![p]! += g.shares![seat]!;
      if (g.shares![seat]! > 0) {
        if (g.shared) s.pureShared[t]![p]! += 1;
        else s.pureOutright[t]![p]! += 1;
      }
    });
  } else {
    SEATS.forEach((seat, p) => {
      const t = TIER_INDEX[g.tiers[seat]]!;
      s.mixSeatGames[t]![p]! += 1;
      s.mixShare[t]![p]! += g.shares![seat]!;
      if (g.shares![seat]! > 0) {
        if (g.shared) s.shared[t]![p]! += 1;
        else s.outright[t]![p]! += 1;
      }
    });
  }
}

// ------------------------------------------------------------------------------------------------ metrics
type Metrics = Record<string, number>;
function metricsFrom(seedIdx: number[], mode: IdentityVisibility): Metrics {
  const m: Metrics = {};
  // accumulate over the sampled seeds
  const pureShare = [[0, 0, 0, 0], [0, 0, 0, 0]];
  const pureGames = [0, 0];
  const mixShare = [[0, 0, 0, 0], [0, 0, 0, 0]];
  const mixSeatGames = [[0, 0, 0, 0], [0, 0, 0, 0]];
  for (const i of seedIdx) {
    const s = sums.get(keyOf(mode, i))!;
    for (let t = 0; t < 2; t++) {
      pureGames[t]! += s.pureGames[t]!;
      for (let p = 0; p < 4; p++) {
        pureShare[t]![p]! += s.pureShare[t]![p]!;
        mixShare[t]![p]! += s.mixShare[t]![p]!;
        mixSeatGames[t]![p]! += s.mixSeatGames[t]![p]!;
      }
    }
  }
  const T = ['BEG', 'ADV'];
  for (let t = 0; t < 2; t++) {
    for (let p = 0; p < 4; p++) {
      m[`pure.${T[t]}.p${p + 1}`] = pureShare[t]![p]! / pureGames[t]!;
      m[`mix.${T[t]}.p${p + 1}`] = mixShare[t]![p]! / mixSeatGames[t]![p]!;
    }
    m[`pure.${T[t]}.gapFirstFourthPP`] = (m[`pure.${T[t]}.p1`]! - m[`pure.${T[t]}.p4`]!) * 100;
    m[`mix.${T[t]}.gapFirstFourthPP`] = (m[`mix.${T[t]}.p1`]! - m[`mix.${T[t]}.p4`]!) * 100;
    m[`mix.${T[t]}.pooled`] = mixShare[t]!.reduce((a, b) => a + b, 0) / mixSeatGames[t]!.reduce((a, b) => a + b, 0);
  }
  const pooledPos = (p: number): number =>
    (mixShare[0]![p]! + mixShare[1]![p]!) / (mixSeatGames[0]![p]! + mixSeatGames[1]![p]!);
  m['mix.pooled.p1'] = pooledPos(0);
  m['mix.pooled.p4'] = pooledPos(3);
  m['mix.pooled.gapFirstFourthPP'] = (pooledPos(0) - pooledPos(3)) * 100;
  m['mix.advMinusBegPP'] = (m['mix.ADV.pooled']! - m['mix.BEG.pooled']!) * 100;
  return m;
}

const allSeeds = Array.from({ length: SEED_COUNT }, (_, i) => i);
const point: Record<string, Metrics> = {};
for (const mode of MODES) point[mode] = metricsFrom(allSeeds, mode);

// Percentile bootstrap over whole seeds (deterministic LCG so the run is reproducible).
let lcg = BOOT_SEED >>> 0;
const nextInt = (n: number): number => {
  lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
  return lcg % n;
};
const draws: number[][] = [];
for (let b = 0; b < BOOT; b++) {
  const idx: number[] = [];
  for (let i = 0; i < SEED_COUNT; i++) idx.push(nextInt(SEED_COUNT));
  draws.push(idx);
}
const interval = (values: number[]): [number, number] => {
  const v = [...values].sort((a, b) => a - b);
  return [v[Math.floor(0.025 * (v.length - 1))]!, v[Math.ceil(0.975 * (v.length - 1))]!];
};
const ci: Record<string, Record<string, [number, number]>> = {};
for (const mode of MODES) {
  const draws2 = draws.map((idx) => metricsFrom(idx, mode));
  ci[mode] = Object.fromEntries(Object.keys(point[mode]!).map((k) => [k, interval(draws2.map((d) => d[k]!))]));
}
// Paired differences between modes (same seed resample for both sides).
const pairDiff = (a: IdentityVisibility, b: IdentityVisibility, key: string): { point: number; ci: [number, number] } => {
  const d = draws.map((idx) => metricsFrom(idx, a)[key]! - metricsFrom(idx, b)[key]!);
  return { point: point[a]![key]! - point[b]![key]!, ci: interval(d) };
};
const DIFF_KEYS = ['mix.advMinusBegPP', 'mix.ADV.gapFirstFourthPP', 'mix.BEG.gapFirstFourthPP', 'pure.ADV.gapFirstFourthPP', 'pure.BEG.gapFirstFourthPP', 'mix.pooled.gapFirstFourthPP'];
const diffs: Record<string, Record<string, unknown>> = {};
for (const key of DIFF_KEYS) {
  diffs[key] = {
    'Normal vs BLIND': pairDiff('OWNER_ONLY', 'BLIND', key),
    'Normal vs BLIND_SCORE_ONLY': pairDiff('OWNER_ONLY', 'BLIND_SCORE_ONLY', key),
    'BLIND vs BLIND_SCORE_ONLY': pairDiff('BLIND', 'BLIND_SCORE_ONLY', key),
  };
}

// ------------------------------------------------------------------------------------------------ paired comparisons
const byKey = new Map<string, GameRecord>();
for (const g of games) byKey.set(`${g.mode}|${g.seed}|${g.lineup}`, g);
function compare(a: IdentityVisibility, b: IdentityVisibility) {
  let pairs = 0;
  let logDiff = 0;
  let scoreDiff = 0;
  let either = 0;
  let bothFailed = 0;
  for (let seed = 0; seed < SEED_COUNT; seed++) {
    for (let lineup = 0; lineup < LINEUPS.length; lineup++) {
      const x = byKey.get(`${a}|${seed}|${lineup}`)!;
      const y = byKey.get(`${b}|${seed}|${lineup}`)!;
      if (!x.ok || !y.ok) {
        bothFailed++;
        continue;
      }
      pairs++;
      const ld = x.logHash !== y.logHash;
      const sd = JSON.stringify(x.scores) !== JSON.stringify(y.scores);
      if (ld) logDiff++;
      if (sd) scoreDiff++;
      if (ld || sd) either++;
    }
  }
  return { pairs, actionLogDifferences: logDiff, finalScoreDifferences: scoreDiff, pairsWithAnyDifference: either, pairsNotComparable: bothFailed };
}
const pairwise = {
  'Normal vs BLIND': compare('OWNER_ONLY', 'BLIND'),
  'Normal vs BLIND_SCORE_ONLY': compare('OWNER_ONLY', 'BLIND_SCORE_ONLY'),
  'BLIND vs BLIND_SCORE_ONLY': compare('BLIND', 'BLIND_SCORE_ONLY'),
};
// Per lineup breakdown of the BLIND vs BLIND_SCORE_ONLY comparison.
const pairwiseByLineup = LINEUP_NAMES.map((name, lineup) => {
  let d = 0;
  let s = 0;
  for (let seed = 0; seed < SEED_COUNT; seed++) {
    const x = byKey.get(`BLIND|${seed}|${lineup}`)!;
    const y = byKey.get(`BLIND_SCORE_ONLY|${seed}|${lineup}`)!;
    if (x.logHash !== y.logHash) d++;
    if (JSON.stringify(x.scores) !== JSON.stringify(y.scores)) s++;
  }
  return { lineup: name, actionLogDifferences: d, finalScoreDifferences: s, pairs: SEED_COUNT };
});

// ------------------------------------------------------------------------------------------------ output
const summary = {
  generatedAt: new Date().toISOString(),
  seeds: `0..${SEED_COUNT - 1}`,
  modes: MODES.map((m) => ({ mode: m, label: MODE_LABEL[m] })),
  lineups: LINEUP_NAMES,
  attempted,
  completed: completed.length,
  failed: failures.length,
  failures,
  elapsedSeconds: Number(elapsedSeconds.toFixed(1)),
  checks,
  scoring: { rewardByError: configFor('OWNER_ONLY', LINEUPS[0]!).scoreConfig.config.rewardByError, handEmptyBonus: configFor('OWNER_ONLY', LINEUPS[0]!).scoreConfig.config.handEmptyBonus },
  bootstrap: { draws: BOOT, seed: BOOT_SEED, unit: 'whole seed' },
  point,
  ci,
  diffs,
  pairwise,
  pairwiseByLineup,
  denominators: {
    // per mode: pure games per lineup type = SEED_COUNT; mixed seat-games per tier per position = 3 per seed
    // (a given seat holds a given tier in 3 of the 6 mixed lineups).
    pureGamesPerLineupTypePerMode: SEED_COUNT,
    mixedSeatGamesPerTierPerPositionPerMode: SEED_COUNT * 3,
    mixedGamesPerMode: SEED_COUNT * PAIRS.length,
  },
};
const raw = games.map((g) => JSON.stringify(g)).join('\n') + '\n';
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, `games-${SEED_COUNT}.jsonl`), raw);
writeFileSync(join(OUT, `summary-${SEED_COUNT}.json`), JSON.stringify(summary, null, 2) + '\n');
process.stdout.write(JSON.stringify({ out: OUT, attempted, completed: completed.length, failed: failures.length, checks, pairwise, elapsedSeconds }, null, 2) + '\n');
