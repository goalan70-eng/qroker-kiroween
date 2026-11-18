/**
 * Manual, offline, deterministic rule comparison:
 *   npm run sim:rules -- --hand 3 --codes 5 --games 200 --mix mixed
 *   npm run sim:rules -- --hand 4 --codes none --games 200 --mix mixed
 *
 * Not part of the published browser game. No network, API key, codebook or saved game changes.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConfig } from '../src/game/core/state';
import { MAX_SEED } from '../src/game/core/seed';
import { SEATS } from '../src/game/core/turn';
import type { Difficulty, IdentityVisibility, PlayerId } from '../src/game/core/types';
import { runExperimentalGame, validateExperimentalCodeLimit, validateExperimentalHandSize } from '../src/game/sim/experimental-game';
import { strategiesFor } from '../src/game/sim/play-game';

export interface CliOptions {
  readonly hand: number;
  readonly codes: number | null;
  readonly games: number;
  readonly seed: number;
  readonly mix: 'beginner' | 'advanced' | 'mixed';
  readonly visibility: 'owner-only' | 'face-up';
  readonly json: boolean;
  readonly help: boolean;
}

const USAGE = [
  'QRoker rule experiment (no changes to the production game)',
  'Usage: npm run sim:rules -- --hand 3 --codes 5 --games 200 --mix mixed',
  '  --hand N           Starting cards per seat: 1..4 (default 4)',
  '  --codes N|none     Total newly completed codes to stop after; none = hand-empty only (default none)',
  '  --games N          Seeds to simulate: 1..5000 (default 200)',
  '  --seed N           First unsigned 32-bit seed (default 0)',
  '  --mix NAME         beginner, advanced, mixed (default mixed)',
  '  --visibility NAME  owner-only, face-up (default owner-only)',
  '  --json             Print machine-readable JSON',
  '  --help             Show this help',
  '',
  'A code-limit stop occurs AFTER all four Guesses for the final batch are scored.',
  'Only hand depletion awards the hand-empty bonus; a code-only limit awards none.',
  'A CODE_LIMIT snapshot stays in core phase REVEAL, not ENDED; ordinary save/replay is unchanged.',
].join('\n');

function integer(value: string | undefined, label: string): number {
  if (value === undefined || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new RangeError(label + ' must be an unsigned decimal integer');
  }
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError(label + ' exceeds safe integer range');
  return n;
}

export function parseCliArgs(args: readonly string[]): CliOptions {
  let hand = 4;
  let codes: number | null = null;
  let games = 200;
  let seed = 0;
  let mix: CliOptions['mix'] = 'mixed';
  let visibility: CliOptions['visibility'] = 'owner-only';
  let json = false;
  let help = false;
  const seen = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') { json = true; continue; }
    if (arg === '--help') { help = true; continue; }
    if (arg === undefined || !['--hand', '--codes', '--games', '--seed', '--mix', '--visibility'].includes(arg)) {
      throw new RangeError('unknown flag: ' + String(arg) + '\n' + USAGE);
    }
    if (seen.has(arg)) throw new RangeError('duplicate flag: ' + arg);
    seen.add(arg);
    const value = args[++i];
    switch (arg) {
      case '--hand': hand = integer(value, '--hand'); break;
      case '--codes': codes = value === 'none' ? null : integer(value, '--codes'); break;
      case '--games': games = integer(value, '--games'); break;
      case '--seed': seed = integer(value, '--seed'); break;
      case '--mix':
        if (value !== 'beginner' && value !== 'advanced' && value !== 'mixed') throw new RangeError('invalid --mix');
        mix = value;
        break;
      case '--visibility':
        if (value !== 'owner-only' && value !== 'face-up') throw new RangeError('invalid --visibility');
        visibility = value;
        break;
    }
  }
  validateExperimentalHandSize(hand);
  validateExperimentalCodeLimit(codes);
  if (!Number.isInteger(games) || games < 1 || games > 5000) throw new RangeError('--games must be 1..5000');
  if (seed > MAX_SEED || seed + games - 1 > MAX_SEED) throw new RangeError('seed range exceeds uint32');
  return { hand, codes, games, seed, mix, visibility, json, help };
}

function seatDifficulties(mix: CliOptions['mix']): Record<PlayerId, Difficulty> {
  const a = mix === 'beginner' ? 'BEGINNER' : 'ADVANCED';
  const b = mix === 'advanced' ? 'ADVANCED' : 'BEGINNER';
  return { P0: a, P1: b, P2: a, P3: b };
}

export interface ExperimentSummary {
  readonly settings: Omit<CliOptions, 'help' | 'json'>;
  readonly scoreTable: readonly number[];
  readonly handEmptyBonus: number;
  readonly stopCounts: Readonly<Record<'HAND_EMPTY' | 'CODE_LIMIT' | 'BOTH', number>>;
  readonly averagePlacements: number;
  readonly averageCompletedCodes: number;
  readonly averagePredictionBatches: number;
  readonly averageActions: number;
  readonly averageScores: Readonly<Record<PlayerId, number>>;
  /** A shared rank 1 counts as a win for every seat with that rank. */
  readonly rankOneRates: Readonly<Record<PlayerId, number>>;
  readonly sharedFirstGames: number;
}

export function runCliExperiment(o: CliOptions): ExperimentSummary {
  const base = defaultConfig();
  const visibility: IdentityVisibility = o.visibility === 'face-up' ? 'FACE_UP' : 'OWNER_ONLY';
  const config = { ...base, identityVisibility: visibility };
  const strategies = strategiesFor(seatDifficulties(o.mix));
  const stops = { HAND_EMPTY: 0, CODE_LIMIT: 0, BOTH: 0 };
  let placements = 0;
  let codes = 0;
  let batches = 0;
  let actions = 0;
  let sharedFirst = 0;
  const scores: Record<PlayerId, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  const wins: Record<PlayerId, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };

  for (let i = 0; i < o.games; i++) {
    const seed = o.seed + i;
    let result: ReturnType<typeof runExperimentalGame>;
    try {
      result = runExperimentalGame({
        seed, config, strategies, handSize: o.hand, codeLimit: o.codes, checkInvariants: true,
      });
    } catch (error) {
      throw new Error('simulation failed at seed ' + seed + ': ' + (error instanceof Error ? error.message : String(error)));
    }
    stops[result.stopReason]++;
    placements += result.placements;
    codes += result.completedCodes;
    batches += result.predictionBatches;
    actions += result.actions.length;
    const first = SEATS.filter((seat) => result.ranks[seat] === 1);
    if (first.length > 1) sharedFirst++;
    for (const seat of SEATS) {
      scores[seat] += result.scores[seat];
      if (result.ranks[seat] === 1) wins[seat]++;
    }
  }

  const mean = (value: number): number => Number((value / o.games).toFixed(3));
  return {
    settings: { hand: o.hand, codes: o.codes, games: o.games, seed: o.seed, mix: o.mix, visibility: o.visibility },
    scoreTable: [...config.scoreConfig.config.rewardByError],
    handEmptyBonus: config.scoreConfig.config.handEmptyBonus,
    stopCounts: stops,
    averagePlacements: mean(placements),
    averageCompletedCodes: mean(codes),
    averagePredictionBatches: mean(batches),
    averageActions: mean(actions),
    averageScores: { P0: mean(scores.P0), P1: mean(scores.P1), P2: mean(scores.P2), P3: mean(scores.P3) },
    rankOneRates: {
      P0: mean(100 * wins.P0), P1: mean(100 * wins.P1),
      P2: mean(100 * wins.P2), P3: mean(100 * wins.P3),
    },
    sharedFirstGames: sharedFirst,
  };
}

function formatSummary(s: ExperimentSummary): string {
  const seatLine = (r: Record<PlayerId, number>): string => SEATS.map((seat) => seat + '=' + r[seat]).join('  ');
  return [
    'QRoker experimental rules (offline, simulation only)',
    'Start hand: ' + s.settings.hand + ' | Code limit: ' + (s.settings.codes ?? 'none') +
      ' | Games: ' + s.settings.games + ' | Seeds: ' + s.settings.seed + '..' + (s.settings.seed + s.settings.games - 1),
    'Mix: ' + s.settings.mix + ' | Visibility: ' + s.settings.visibility,
    'Score table: ' + s.scoreTable.join('/') + ' | Empty-hand bonus: ' + s.handEmptyBonus,
    'Stopped: hand-empty=' + s.stopCounts.HAND_EMPTY + ', code-limit=' + s.stopCounts.CODE_LIMIT +
      ', both=' + s.stopCounts.BOTH,
    'Mean placements: ' + s.averagePlacements + ' | codes: ' + s.averageCompletedCodes +
      ' | batches: ' + s.averagePredictionBatches + ' | actions: ' + s.averageActions,
    'Mean scores: ' + seatLine(s.averageScores),
    'Rank-1 rate (%): ' + seatLine(s.rankOneRates),
    'Shared-first games: ' + s.sharedFirstGames,
    'Caution: AI-only headless simulations are not evidence of human balance or game duration in minutes.',
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) console.log(USAGE);
    else {
      const report = runCliExperiment(options);
      console.log(options.json ? JSON.stringify(report, null, 2) : formatSummary(report));
    }
  } catch (error) {
    console.error('QRoker simulation: ' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
