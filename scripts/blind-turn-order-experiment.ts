// Blind-mode turn-order and starter-rotation experiment (experiment-only driver; does not change shipped rules).
//
// Driver: the same loop as sim/play-game.ts (actingSeats()[0], decisionSeed, viewFor, strategiesFor, reduce,
// checkStateInvariants) but the initial state is taken from newGame and its `turn` is set to the chosen starter.
// For starter P0 the driver must reproduce playGame exactly (checked by `smoke`).
//
// Conditions (live, bonus is passed through the configuration before play):
//   NORMAL_B5    OWNER_ONLY, hand-empty bonus 5 (reference)
//   A_BLIND_B5   BLIND, bonus 5 (control for the Blind treatments)
//   B_BLIND_B3   BLIND, bonus 3
//   C_BLIND_B1   BLIND, bonus 1
//   D_BLIND_B0   BLIND, bonus 0
// Second Blind setting (checked against BLIND with identical inputs; full run only with --withScoreOnly):
//   A2..D2       BLIND_SCORE_ONLY with bonus 5, 3, 1, 0
// Retrospective (no new games): E = A with 1 point deducted from the starter's final score, F = A with 3.
// Set schedules (G) are built from A's records: four-seed blocks, fixed starter P0 versus rotating starter with
// four cyclic offsets.
//
// Usage:
//   npx tsx scripts/blind-turn-order-experiment.ts smoke --out <dir>
//   npx tsx scripts/blind-turn-order-experiment.ts run --seedFrom 200 --seedTo 299 --out <dir> [--conditions live]
//   npx tsx scripts/blind-turn-order-experiment.ts run --seedFrom 300 --seedTo 399 --out <dir>
//   npx tsx scripts/blind-turn-order-experiment.ts analyze --out <dir> [--boot 2000]
// Checkpoints: <out>/records-<from>-<to>.jsonl, one JSON line per game, keyed by cond|seed|lineup|starter. A rerun
// skips keys already present, so an interrupted run resumes.

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getStrategy } from '../src/game/ai/registry';
import { actingSeats, reduce } from '../src/game/core/engine';
import { rankPlayers } from '../src/game/core/ranking';
import { defaultConfig, deepFreeze, newGame } from '../src/game/core/state';
import type { GameState } from '../src/game/core/state';
import type { Action, Difficulty, GameConfig, IdentityVisibility, PlayerId, SeatConfig } from '../src/game/core/types';
import { viewFor } from '../src/game/core/view';
import { checkStateInvariants, decisionSeed, playGame, strategiesFor } from '../src/game/sim/play-game';

const SEATS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];
const REWARD = [10, 5, 4, 3, 2, 1];

// ------------------------------------------------------------------------------------------------ design
interface Condition {
  id: string;
  visibility: IdentityVisibility;
  bonus: number;
  live: boolean; // played by the driver (false: derived from A)
}
const LIVE: Condition[] = [
  { id: 'NORMAL_B5', visibility: 'OWNER_ONLY', bonus: 5, live: true },
  { id: 'A_BLIND_B5', visibility: 'BLIND', bonus: 5, live: true },
  { id: 'B_BLIND_B3', visibility: 'BLIND', bonus: 3, live: true },
  { id: 'C_BLIND_B1', visibility: 'BLIND', bonus: 1, live: true },
  { id: 'D_BLIND_B0', visibility: 'BLIND', bonus: 0, live: true },
];
const SCORE_ONLY: Condition[] = [
  { id: 'A2_SCOREONLY_B5', visibility: 'BLIND_SCORE_ONLY', bonus: 5, live: true },
  { id: 'B2_SCOREONLY_B3', visibility: 'BLIND_SCORE_ONLY', bonus: 3, live: true },
  { id: 'C2_SCOREONLY_B1', visibility: 'BLIND_SCORE_ONLY', bonus: 1, live: true },
  { id: 'D2_SCOREONLY_B0', visibility: 'BLIND_SCORE_ONLY', bonus: 0, live: true },
];

// Lineup 0: all BEGINNER. Lineup 1: all ADVANCED. Lineups 2..7: ADVANCED on the pair (same order as the previous run).
const PAIRS: ReadonlyArray<readonly [number, number]> = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
const LINEUPS: ReadonlyArray<Record<PlayerId, Difficulty>> = [
  { P0: 'BEGINNER', P1: 'BEGINNER', P2: 'BEGINNER', P3: 'BEGINNER' },
  { P0: 'ADVANCED', P1: 'ADVANCED', P2: 'ADVANCED', P3: 'ADVANCED' },
  ...PAIRS.map(([a, b]) => {
    const t: Record<PlayerId, Difficulty> = { P0: 'BEGINNER', P1: 'BEGINNER', P2: 'BEGINNER', P3: 'BEGINNER' };
    t[SEATS[a]!] = 'ADVANCED';
    t[SEATS[b]!] = 'ADVANCED';
    return t;
  }),
];
const LINEUP_NAMES = ['all BEGINNER', 'all ADVANCED', 'ADV P0+P1', 'ADV P0+P2', 'ADV P0+P3', 'ADV P1+P2', 'ADV P1+P3', 'ADV P2+P3'];
const isMixed = (l: number): boolean => l >= 2;

// ------------------------------------------------------------------------------------------------ args
const argValue = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : fallback;
};
const COMMAND = process.argv[2] ?? 'smoke';
const OUT = resolve(argValue('--out', join(process.env.TEMP ?? '.', 'qroker-blind-turn-order')));
const SEED_FROM = Number(argValue('--seedFrom', '200'));
const SEED_TO = Number(argValue('--seedTo', '399'));
const BOOT = Number(argValue('--boot', '2000'));
const WITH_SCORE_ONLY = process.argv.includes('--withScoreOnly');
const CONDITIONS_ARG = argValue('--conditions', 'live');
const PRIOR_RECORDS = argValue('--prior', 'D:/DevCaches/tmp/qroker-blind-selfplay/full/games-200.jsonl');

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

// ------------------------------------------------------------------------------------------------ record
export interface Rec {
  cond: string;
  visibility: IdentityVisibility;
  bonus: number;
  seed: number;
  lineup: number;
  starter: number; // index into SEATS of the first actual placement
  ok: boolean;
  error?: string;
  logHash?: string;
  dealHash?: string; // board, hands, deck (turn excluded)
  scores?: number[]; // by physical seat index
  ranks?: number[];
  shares?: number[];
  shared?: boolean;
  bonusSeat?: number | null;
  predPoints?: number[];
  placements?: number[]; // by physical seat index
  batches?: number;
  endedBy?: 'HAND_EMPTY' | 'CODE_LIMIT' | 'DECK_EXHAUSTED';
  firstPlaceOk?: boolean;
  bonusCheckOk?: boolean;
  actions?: number;
}

function configFor(c: Condition, lineup: Record<PlayerId, Difficulty>): GameConfig {
  const base = defaultConfig();
  const seats = SEATS.map((id) => ({ id, kind: 'AI', difficulty: lineup[id], name: id }) as SeatConfig) as unknown as GameConfig['seats'];
  const scoreConfig = {
    id: `EXPERIMENT_BONUS_${c.bonus}`,
    provisional: true,
    config: { rewardByError: [...REWARD], handEmptyBonus: c.bonus },
  };
  return { ...base, seats, identityVisibility: c.visibility, scoreConfig } as GameConfig;
}

function dealFingerprint(state: GameState): string {
  return sha256(JSON.stringify({ board: state.board, hands: state.hands, deck: state.deck }));
}

function shareOf(scores: readonly number[]): { ranks: number[]; shares: number[]; shared: boolean } {
  const ranking = rankPlayers(Object.fromEntries(SEATS.map((s, i) => [s, scores[i]!])) as Record<PlayerId, number>);
  const ranks = SEATS.map((s) => ranking.find((e) => e.player === s)!.rank);
  const top = ranks.filter((r) => r === 1).length;
  const shares = ranks.map((r) => (r === 1 ? 1 / top : 0));
  return { ranks, shares, shared: top > 1 };
}

/** The experiment driver. Same loop as playGame, with the starting seat chosen by the caller. */
function drive(c: Condition, seed: number, lineupIndex: number, starter: number): Rec {
  const rec: Rec = { cond: c.id, visibility: c.visibility, bonus: c.bonus, seed, lineup: lineupIndex, starter, ok: false };
  try {
    const tiers = LINEUPS[lineupIndex]!;
    const config = configFor(c, tiers);
    const created = newGame({ seed, config });
    if (!created.ok) throw new Error(`newGame rejected: ${created.error.code}`);
    rec.dealHash = dealFingerprint(created.value);
    let state: GameState = deepFreeze({ ...created.value, turn: SEATS[starter]! });
    checkStateInvariants(state);
    const strategies = strategiesFor(tiers);
    for (let guard = 0; state.phase !== 'ENDED'; guard++) {
      if (guard > 2000) throw new Error('no end');
      const actionIndex = state.log.length;
      let action: Action;
      let seat: PlayerId | null = null;
      if (state.phase === 'REVEAL') {
        action = { type: 'ACK_REVEAL' };
      } else {
        seat = actingSeats(state)[0] ?? null;
        if (seat === null) throw new Error(`no acting seat in ${state.phase}`);
        const ctx = Object.freeze({ decisionSeed: decisionSeed(state.seed, seat, actionIndex) });
        const view = viewFor(state, seat);
        const strategy = strategies[seat];
        action = state.phase === 'PLACEMENT' ? strategy.choosePlacement(view, ctx) : strategy.chooseGuesses(view, ctx);
      }
      const next = reduce(state, action);
      if (!next.ok) throw new Error(`rejected ${JSON.stringify(action)}: ${next.error.code}`);
      if (seat !== null && (action as { player?: unknown }).player !== seat) throw new Error('action for another seat');
      checkStateInvariants(next.value, state);
      state = next.value;
    }
    const scores = SEATS.map((s) => state.scores[s]);
    const { ranks, shares, shared } = shareOf(scores);
    const log = state.log;
    const firstPlace = log.find((a) => a.type === 'PLACE');
    const placements = SEATS.map((s) => log.filter((a) => a.type === 'PLACE' && a.player === s).length);
    const predPoints = SEATS.map((s) => state.history.reduce((sum, r) => sum + (r.perPlayer.find((p) => p.player === s)?.earned ?? 0), 0));
    const bonusSeat = state.bonusAwarded === null ? null : SEATS.indexOf(state.bonusAwarded);
    const bonusCheckOk = SEATS.every((s, i) => scores[i]! === predPoints[i]! + (bonusSeat === i ? c.bonus : 0));
    Object.assign(rec, {
      ok: true,
      logHash: sha256(JSON.stringify(log)),
      scores,
      ranks,
      shares,
      shared,
      bonusSeat,
      predPoints,
      placements,
      batches: state.history.length,
      endedBy: bonusSeat !== null ? 'HAND_EMPTY' : state.deck.length === 0 ? 'DECK_EXHAUSTED' : 'CODE_LIMIT',
      firstPlaceOk: firstPlace !== undefined && firstPlace.type === 'PLACE' && firstPlace.player === SEATS[starter],
      bonusCheckOk,
      actions: log.length,
    });
  } catch (error) {
    rec.ok = false;
    rec.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  return rec;
}

const keyOf = (r: Pick<Rec, 'cond' | 'seed' | 'lineup' | 'starter'>): string => `${r.cond}|${r.seed}|${r.lineup}|${r.starter}`;

function loadRecords(dir: string): Rec[] {
  if (!existsSync(dir)) return [];
  const out: Rec[] = [];
  for (const f of readdirSync(dir)) {
    if (!/^records-.*\.jsonl$/.test(f)) continue;
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) if (line.trim()) out.push(JSON.parse(line) as Rec);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ smoke
function smoke(): void {
  mkdirSync(OUT, { recursive: true });
  const checks: Record<string, unknown> = {};
  const seeds = [0, 1];
  const conds = [...LIVE, ...SCORE_ONLY.filter((c) => c.bonus >= 0)];
  const recs: Rec[] = [];
  for (const c of conds) for (const seed of seeds) for (let l = 0; l < LINEUPS.length; l++) for (let s = 0; s < 4; s++) recs.push(drive(c, seed, l, s));
  checks.coverage = { expected: conds.length * seeds.length * LINEUPS.length * 4, attempted: recs.length, completed: recs.filter((r) => r.ok).length, keysUnique: new Set(recs.map(keyOf)).size };
  checks.failures = recs.filter((r) => !r.ok).map((r) => ({ key: keyOf(r), error: r.error }));

  // 1. Legacy P0 parity: driver with starter P0 against playGame (same config, same strategies).
  let parity = 0;
  let parityFail: string[] = [];
  for (const c of LIVE) for (const seed of seeds) for (let l = 0; l < LINEUPS.length; l++) {
    const rec = recs.find((r) => r.cond === c.id && r.seed === seed && r.lineup === l && r.starter === 0)!;
    const legacy = playGame({ seed, config: configFor(c, LINEUPS[l]!), strategies: strategiesFor(LINEUPS[l]!), checkInvariants: true });
    const legacyHash = sha256(JSON.stringify(legacy.log));
    const legacyScores = SEATS.map((s) => legacy.final.scores[s]);
    if (rec.logHash === legacyHash && JSON.stringify(rec.scores) === JSON.stringify(legacyScores)) parity++;
    else parityFail.push(keyOf(rec));
  }
  checks.legacyP0Parity = { compared: LIVE.length * seeds.length * LINEUPS.length, equal: parity, differing: parityFail };

  // 2. Prior records (previous Blind run, starter P0, identical configuration) for OWNER_ONLY and BLIND bonus 5.
  let prior: Map<string, string> | null = null;
  if (existsSync(PRIOR_RECORDS)) {
    prior = new Map();
    for (const line of readFileSync(PRIOR_RECORDS, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const o = JSON.parse(line) as { mode: string; seed: number; lineup: number; logHash?: string };
      if (seeds.includes(o.seed)) prior.set(`${o.mode}|${o.seed}|${o.lineup}`, o.logHash ?? '');
    }
    let same = 0;
    let total = 0;
    const diffs: string[] = [];
    for (const [condId, mode] of [['NORMAL_B5', 'OWNER_ONLY'], ['A_BLIND_B5', 'BLIND']] as const) {
      for (const seed of seeds) for (let l = 0; l < LINEUPS.length; l++) {
        const rec = recs.find((r) => r.cond === condId && r.seed === seed && r.lineup === l && r.starter === 0)!;
        total++;
        const before = prior.get(`${mode}|${seed}|${l}`);
        if (before !== undefined && before === rec.logHash) same++;
        else diffs.push(`${condId} seed ${seed} lineup ${l}`);
      }
    }
    checks.priorRecordParity = { compared: total, equal: same, differing: diffs };
  } else {
    checks.priorRecordParity = { skipped: `prior records not found: ${PRIOR_RECORDS}` };
  }

  // 3. Equal deals: the deal (board, hands, deck) depends on the seed only, and not on starter or condition.
  const dealGroups = new Map<string, Set<string>>();
  for (const r of recs.filter((x) => x.ok)) {
    const k = `${r.seed}|${r.lineup}`;
    if (!dealGroups.has(k)) dealGroups.set(k, new Set());
    dealGroups.get(k)!.add(r.dealHash!);
  }
  checks.equalDealsAcrossStartersAndConditions = [...dealGroups.values()].every((s) => s.size === 1);

  // 4. Starter placement check, bonus check, win shares, ended-by bookkeeping.
  const okRecs = recs.filter((r) => r.ok);
  checks.firstPlaceIsStarter = okRecs.every((r) => r.firstPlaceOk === true);
  checks.bonusRecipientAndAmount = okRecs.every((r) => r.bonusCheckOk === true);
  checks.winSharesSumToOne = okRecs.every((r) => Math.abs(r.shares!.reduce((a, b) => a + b, 0) - 1) < 1e-12);

  // 5. Deterministic replay: rerun every A game of seed 0 and compare hashes and scores.
  let replay = 0;
  let replayTotal = 0;
  for (let l = 0; l < LINEUPS.length; l++) for (let s = 0; s < 4; s++) {
    const first = recs.find((r) => r.cond === 'A_BLIND_B5' && r.seed === 0 && r.lineup === l && r.starter === s)!;
    const again = drive(LIVE[1]!, 0, l, s);
    replayTotal++;
    if (again.logHash === first.logHash && JSON.stringify(again.scores) === JSON.stringify(first.scores)) replay++;
  }
  checks.deterministicReplay = { compared: replayTotal, equal: replay };

  // 6. Blind score-only against Blind with identical inputs (per live Blind treatment).
  const pairs: Record<string, { pairs: number; logDiff: number; scoreDiff: number }> = {};
  for (const [blind, so] of [['A_BLIND_B5', 'A2_SCOREONLY_B5'], ['B_BLIND_B3', 'B2_SCOREONLY_B3'], ['C_BLIND_B1', 'C2_SCOREONLY_B1'], ['D_BLIND_B0', 'D2_SCOREONLY_B0']] as const) {
    let logDiff = 0;
    let scoreDiff = 0;
    let n = 0;
    for (const seed of seeds) for (let l = 0; l < LINEUPS.length; l++) for (let s = 0; s < 4; s++) {
      const x = recs.find((r) => r.cond === blind && r.seed === seed && r.lineup === l && r.starter === s)!;
      const y = recs.find((r) => r.cond === so && r.seed === seed && r.lineup === l && r.starter === s)!;
      n++;
      if (x.logHash !== y.logHash) logDiff++;
      if (JSON.stringify(x.scores) !== JSON.stringify(y.scores)) scoreDiff++;
    }
    pairs[`${blind} vs ${so}`] = { pairs: n, logDiff, scoreDiff };
  }
  checks.blindScoreOnlyVsBlind = pairs;

  const summary = { command: 'smoke', seeds, lineups: LINEUP_NAMES, checks, games: recs.length };
  writeFileSync(join(OUT, 'smoke-checks.json'), JSON.stringify(summary, null, 2) + '\n');
  writeFileSync(join(OUT, 'records-smoke.jsonl'), recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  void prior;
}

// ------------------------------------------------------------------------------------------------ run
function run(): void {
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `records-${SEED_FROM}-${SEED_TO}.jsonl`);
  const done = new Set<string>();
  if (existsSync(file)) for (const line of readFileSync(file, 'utf8').split('\n')) if (line.trim()) done.add(keyOf(JSON.parse(line) as Rec));
  const conds = CONDITIONS_ARG === 'live' ? (WITH_SCORE_ONLY ? [...LIVE, ...SCORE_ONLY] : LIVE) : LIVE.filter((c) => CONDITIONS_ARG.split(',').includes(c.id));
  let written = 0;
  let skipped = 0;
  const started = Date.now();
  for (let seed = SEED_FROM; seed <= SEED_TO; seed++) {
    for (const c of conds) for (let l = 0; l < LINEUPS.length; l++) for (let s = 0; s < 4; s++) {
      const key = `${c.id}|${seed}|${l}|${s}`;
      if (done.has(key)) {
        skipped++;
        continue;
      }
      appendFileSync(file, JSON.stringify(drive(c, seed, l, s)) + '\n');
      written++;
    }
  }
  process.stdout.write(JSON.stringify({ command: 'run', file, seeds: `${SEED_FROM}..${SEED_TO}`, conditions: conds.map((c) => c.id), written, skippedExisting: skipped, seconds: (Date.now() - started) / 1000 }, null, 2) + '\n');
}

// ------------------------------------------------------------------------------------------------ analysis
// Derived records: E/F rescore A's final scores with a penalty on the starter. Shares follow the new ranking.
function derive(base: Rec[], id: string, penalty: number): Rec[] {
  return base.map((r) => {
    if (!r.ok) return { ...r, cond: id };
    const scores = r.scores!.map((v, i) => (i === r.starter ? v - penalty : v));
    const { ranks, shares, shared } = shareOf(scores);
    return { ...r, cond: id, scores, ranks, shares, shared };
  });
}

interface SeedSums {
  pos: number[][]; // [lineup][turn position] share sum
  games: number[]; // [lineup]
  advShare: number[]; // [lineup] (mixed) sum of ADVANCED seat shares
  begShare: number[];
  advSeat: number[]; // [lineup] ADVANCED seat-games
  begSeat: number[];
}
const emptySeed = (): SeedSums => ({
  pos: LINEUPS.map(() => [0, 0, 0, 0]),
  games: LINEUPS.map(() => 0),
  advShare: LINEUPS.map(() => 0),
  begShare: LINEUPS.map(() => 0),
  advSeat: LINEUPS.map(() => 0),
  begSeat: LINEUPS.map(() => 0),
});

function sumsBySeed(records: Rec[], seeds: number[]): Map<number, SeedSums> {
  const out = new Map<number, SeedSums>();
  for (const seed of seeds) out.set(seed, emptySeed());
  for (const r of records) {
    if (!r.ok || !out.has(r.seed)) continue;
    const s = out.get(r.seed)!;
    const tiers = LINEUPS[r.lineup]!;
    s.games[r.lineup]! += 1;
    for (let i = 0; i < 4; i++) {
      const k = (i - r.starter + 4) % 4;
      s.pos[r.lineup]![k]! += r.shares![i]!;
      if (isMixed(r.lineup)) {
        if (tiers[SEATS[i]!] === 'ADVANCED') {
          s.advShare[r.lineup]! += r.shares![i]!;
          s.advSeat[r.lineup]! += 1;
        } else {
          s.begShare[r.lineup]! += r.shares![i]!;
          s.begSeat[r.lineup]! += 1;
        }
      }
    }
  }
  return out;
}

/** Primary metrics from per-seed sums restricted to the sampled seed list (whole-seed resampling). */
function metricsFromSums(sums: Map<number, SeedSums>, seedList: number[]): Record<string, number> {
  const pos = LINEUPS.map(() => [0, 0, 0, 0]);
  const games = LINEUPS.map(() => 0);
  const advS = LINEUPS.map(() => 0);
  const begS = LINEUPS.map(() => 0);
  const advN = LINEUPS.map(() => 0);
  const begN = LINEUPS.map(() => 0);
  for (const seed of seedList) {
    const s = sums.get(seed)!;
    for (let l = 0; l < LINEUPS.length; l++) {
      games[l]! += s.games[l]!;
      for (let k = 0; k < 4; k++) pos[l]![k]! += s.pos[l]![k]!;
      advS[l]! += s.advShare[l]!;
      begS[l]! += s.begShare[l]!;
      advN[l]! += s.advSeat[l]!;
      begN[l]! += s.begSeat[l]!;
    }
  }
  const lineupPos = (l: number): number[] => pos[l]!.map((v) => v / games[l]!);
  const mixedIdx = [2, 3, 4, 5, 6, 7];
  const pooled = [0, 1, 2, 3].map((k) => mixedIdx.reduce((a, l) => a + lineupPos(l)[k]!, 0) / mixedIdx.length);
  const primaryGap = (Math.max(...pooled) - Math.min(...pooled)) * 100;
  const skill = mixedIdx.reduce((a, l) => a + (advS[l]! / advN[l]! - begS[l]! / begN[l]!), 0) / mixedIdx.length * 100;
  const pureBeg = lineupPos(0);
  const pureAdv = lineupPos(1);
  return {
    primaryGapPP: primaryGap,
    firstMinusFourthPP: (pooled[0]! - pooled[3]!) * 100,
    skillGapPP: skill,
    pureBegGapPP: (Math.max(...pureBeg) - Math.min(...pureBeg)) * 100,
    pureAdvGapPP: (Math.max(...pureAdv) - Math.min(...pureAdv)) * 100,
    p1: pooled[0]!,
    p2: pooled[1]!,
    p3: pooled[2]!,
    p4: pooled[3]!,
  };
}

function bootstrap(seeds: number[], sums: Map<number, SeedSums>, draws: number, seedRng: number): { draws: number[][]; } {
  let lcg = seedRng >>> 0;
  const next = (n: number): number => {
    lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
    return lcg % n;
  };
  const out: number[][] = [];
  for (let b = 0; b < draws; b++) {
    const idx: number[] = [];
    for (let i = 0; i < seeds.length; i++) idx.push(seeds[next(seeds.length)]!);
    out.push(idx);
  }
  void sums;
  return { draws: out };
}

const pct = (lo: number, hi: number): [number, number] => {
  return [lo, hi];
};
function interval(values: number[]): [number, number] {
  const v = [...values].sort((a, b) => a - b);
  return pct(v[Math.floor(0.025 * (v.length - 1))]!, v[Math.ceil(0.975 * (v.length - 1))]!);
}

function analyze(): void {
  const records = loadRecords(OUT).filter((r) => r.seed >= SEED_FROM && r.seed <= SEED_TO);
  const seeds = [...new Set(records.map((r) => r.seed))].sort((a, b) => a - b);
  const byCond = (id: string): Rec[] => records.filter((r) => r.cond === id);
  const A = byCond('A_BLIND_B5');
  const conds: Record<string, Rec[]> = {
    NORMAL_B5: byCond('NORMAL_B5'),
    A_BLIND_B5: A,
    B_BLIND_B3: byCond('B_BLIND_B3'),
    C_BLIND_B1: byCond('C_BLIND_B1'),
    D_BLIND_B0: byCond('D_BLIND_B0'),
    E_PENALTY1: derive(A, 'E_PENALTY1', 1),
    F_PENALTY3: derive(A, 'F_PENALTY3', 3),
  };
  const sumsFor = Object.fromEntries(Object.entries(conds).map(([id, rs]) => [id, sumsBySeed(rs, seeds)])) as Record<string, Map<number, SeedSums>>;
  const point = Object.fromEntries(Object.keys(conds).map((id) => [id, metricsFromSums(sumsFor[id]!, seeds)])) as Record<string, Record<string, number>>;

  // Paired bootstrap over whole seeds; differences vs A use the same resampled seeds.
  const boot = bootstrap(seeds, sumsFor.A_BLIND_B5!, BOOT, 20261124).draws;
  const ci: Record<string, Record<string, [number, number]>> = {};
  const diffCi: Record<string, Record<string, { point: number; ci: [number, number] }>> = {};
  for (const id of Object.keys(conds)) {
    const draws = boot.map((idx) => metricsFromSums(sumsFor[id]!, idx));
    ci[id] = Object.fromEntries(Object.keys(point[id]!).map((k) => [k, interval(draws.map((d) => d[k]!))]));
  }
  for (const id of Object.keys(conds)) {
    if (id === 'A_BLIND_B5') continue;
    const diffs = boot.map((idx) => {
      const a = metricsFromSums(sumsFor.A_BLIND_B5!, idx);
      const t = metricsFromSums(sumsFor[id]!, idx);
      return { primary: t.primaryGapPP! - a.primaryGapPP!, skill: t.skillGapPP! - a.skillGapPP! };
    });
    diffCi[id] = {
      primaryGapPP: { point: point[id]!.primaryGapPP! - point.A_BLIND_B5!.primaryGapPP!, ci: interval(diffs.map((d) => d.primary)) },
      skillGapPP: { point: point[id]!.skillGapPP! - point.A_BLIND_B5!.skillGapPP!, ci: interval(diffs.map((d) => d.skill)) },
    };
  }

  // Descriptive tables: tie-first frequency, placements and bonus recipients by turn position, ending kind.
  const descriptive: Record<string, unknown> = {};
  for (const [id, rs] of Object.entries(conds)) {
    const ok = rs.filter((r) => r.ok);
    const mixed = ok.filter((r) => isMixed(r.lineup));
    const tierPos: Record<string, { share: number; n: number }> = {};
    for (const t of ['BEGINNER', 'ADVANCED'] as const) for (let k = 0; k < 4; k++) tierPos[`${t}.p${k + 1}`] = { share: 0, n: 0 };
    for (const r of mixed) {
      const tiers = LINEUPS[r.lineup]!;
      for (let i = 0; i < 4; i++) {
        const k = (i - r.starter + 4) % 4;
        const key = `${tiers[SEATS[i]!]}.p${k + 1}`;
        tierPos[key]!.share += r.shares![i]!;
        tierPos[key]!.n += 1;
      }
    }
    const placementsByTurn = [0, 0, 0, 0];
    for (const r of mixed) for (let i = 0; i < 4; i++) placementsByTurn[(i - r.starter + 4) % 4]! += r.placements![i]!;
    const bonusByTurn = [0, 0, 0, 0];
    let handEmpty = 0;
    for (const r of mixed) if (r.bonusSeat !== null && r.bonusSeat !== undefined) {
      handEmpty++;
      bonusByTurn[(r.bonusSeat - r.starter + 4) % 4]! += 1;
    }
    descriptive[id] = {
      games: rs.length,
      completed: ok.length,
      failed: rs.length - ok.length,
      mixedGames: mixed.length,
      tiedFirstFrequencyMixed: mixed.filter((r) => r.shared).length / mixed.length,
      placementsPerGameByTurnMixed: placementsByTurn.map((v) => v / mixed.length),
      bonusRecipientsByTurnMixed: bonusByTurn,
      bonusRecipientsShareOfHandEmptyEnds: bonusByTurn.map((v) => (handEmpty ? v / handEmpty : null)),
      endedBy: {
        handEmpty: ok.filter((r) => r.endedBy === 'HAND_EMPTY').length,
        codeLimit: ok.filter((r) => r.endedBy === 'CODE_LIMIT').length,
        deckExhausted: ok.filter((r) => r.endedBy === 'DECK_EXHAUSTED').length,
      },
      tierByTurnMixed: Object.fromEntries(Object.entries(tierPos).map(([k, v]) => [k, v.n ? v.share / v.n : null])),
    };
  }

  // G: four-seed blocks, same lineup, starters fixed at P0 versus rotating with four cyclic offsets (A records only).
  const gBlocks: Record<string, unknown> = {};
  const blockStarts = seeds.filter((s, i) => i % 4 === 0 && seeds[i + 3] === s + 3);
  const setShare = (rowsBySeed: Map<number, Rec>): number[] => {
    const totals = [0, 0, 0, 0];
    for (const r of rowsBySeed.values()) for (let i = 0; i < 4; i++) totals[i]! += r.shares![i]!;
    const top = Math.max(...totals);
    const k = totals.filter((t) => t === top).length;
    return totals.map((t) => (t === top ? 1 / k : 0));
  };
  const aIndex = new Map<string, Rec>();
  for (const r of A) if (r.ok) aIndex.set(`${r.seed}|${r.lineup}|${r.starter}`, r);
  const gFixed: number[][] = []; // [block x lineup] flattened per lineup later
  const gRot: number[][] = [];
  const gLineup: number[] = [];
  const perLineupFixed = LINEUPS.map(() => [0, 0, 0, 0]);
  const perLineupRot = LINEUPS.map(() => [0, 0, 0, 0]);
  const blockFixedByLineup: number[][][] = LINEUPS.map(() => []);
  const blockRotByLineup: number[][][] = LINEUPS.map(() => []);
  for (const b of blockStarts) {
    for (let l = 0; l < LINEUPS.length; l++) {
      const fixed = new Map<number, Rec>();
      for (let j = 0; j < 4; j++) fixed.set(b + j, aIndex.get(`${b + j}|${l}|0`)!);
      const fx = setShare(fixed);
      const offsets: number[][] = [];
      for (let k = 0; k < 4; k++) {
        const rot = new Map<number, Rec>();
        for (let j = 0; j < 4; j++) rot.set(b + j, aIndex.get(`${b + j}|${l}|${(j + k) % 4}`)!);
        offsets.push(setShare(rot));
      }
      const rot = [0, 1, 2, 3].map((i) => offsets.reduce((a, o) => a + o[i]!, 0) / 4);
      blockFixedByLineup[l]!.push(fx);
      blockRotByLineup[l]!.push(rot);
      fx.forEach((v, i) => (perLineupFixed[l]![i]! += v));
      rot.forEach((v, i) => (perLineupRot[l]![i]! += v));
    }
    gLineup.push(b);
  }
  const nBlocks = blockStarts.length;
  const mixedIdx = [2, 3, 4, 5, 6, 7];
  const meanFixed = [0, 1, 2, 3].map((i) => mixedIdx.reduce((a, l) => a + perLineupFixed[l]![i]! / nBlocks, 0) / 6);
  const meanRot = [0, 1, 2, 3].map((i) => mixedIdx.reduce((a, l) => a + perLineupRot[l]![i]! / nBlocks, 0) / 6);
  const gapOf = (v: number[]): number => (Math.max(...v) - Math.min(...v)) * 100;
  // Bootstrap over blocks for G (fairness gap fixed versus rotating).
  let lcg = 20261124;
  const nextB = (n: number): number => {
    lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
    return lcg % n;
  };
  const gDiffs: number[] = [];
  for (let d = 0; d < BOOT; d++) {
    const pick = Array.from({ length: nBlocks }, () => nextB(nBlocks));
    const fx = [0, 1, 2, 3].map((i) => mixedIdx.reduce((a, l) => a + pick.reduce((s, p) => s + blockFixedByLineup[l]![p]![i]!, 0) / nBlocks, 0) / 6);
    const rt = [0, 1, 2, 3].map((i) => mixedIdx.reduce((a, l) => a + pick.reduce((s, p) => s + blockRotByLineup[l]![p]![i]!, 0) / nBlocks, 0) / 6);
    gDiffs.push(gapOf(rt) - gapOf(fx));
  }
  gBlocks.blocks = nBlocks;
  gBlocks.fixedSetShareByPhysicalSeatPct = meanFixed.map((v) => v * 100);
  gBlocks.rotatingSetShareByPhysicalSeatPct = meanRot.map((v) => v * 100);
  gBlocks.fixedFairnessGapPP = gapOf(meanFixed);
  gBlocks.rotatingFairnessGapPP = gapOf(meanRot);
  gBlocks.rotatingMinusFixedGapPP = { point: gapOf(meanRot) - gapOf(meanFixed), ci: interval(gDiffs) };
  gBlocks.note = 'Set outcome: total game-win shares per physical seat over four games; ties split. Rotating = mean of four cyclic offsets. Exploratory.';

  // Physical seat versus turn position in the rotating schedule (A, all starters, mixed lineups).
  const seatMean = [0, 0, 0, 0];
  const turnMean = [0, 0, 0, 0];
  let nMixed = 0;
  for (const r of A.filter((x) => x.ok && isMixed(x.lineup))) {
    nMixed++;
    for (let i = 0; i < 4; i++) {
      seatMean[i]! += r.shares![i]!;
      turnMean[(i - r.starter + 4) % 4]! += r.shares![i]!;
    }
  }
  const physicalVsTurn = { games: nMixed, physicalSeatSharePct: seatMean.map((v) => (v / nMixed) * 100), turnPositionSharePct: turnMean.map((v) => (v / nMixed) * 100) };

  const summary = {
    command: 'analyze',
    seeds: `${seeds[0]}..${seeds[seeds.length - 1]}`,
    seedCount: seeds.length,
    bootstrap: { draws: BOOT, rng: 20261124, unit: 'whole seed (A-linked for differences)' },
    point,
    ci,
    diffVsA: diffCi,
    descriptive,
    G: gBlocks,
    physicalSeatVsTurnRotating: physicalVsTurn,
    counts: Object.fromEntries(Object.entries(conds).map(([id, rs]) => [id, { records: rs.length, failed: rs.filter((r) => !r.ok).length }])),
  };
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ out: join(OUT, 'summary.json'), seeds: summary.seeds, seedCount: seeds.length }, null, 2) + '\n');
}

if (COMMAND === 'smoke') smoke();
else if (COMMAND === 'run') run();
else if (COMMAND === 'analyze') analyze();
else throw new Error(`unknown command ${COMMAND}`);
