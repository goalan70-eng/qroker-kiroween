// Single-game Blind rule experiment: does a fourth starting card for the actual starter balance the first turn?
//
// Conditions (both BLIND, hand-empty bonus 5 unless stated):
//   A  control: all four hands start with three cards (deal from newGame, unchanged).
//   H  candidate: same ordinary deal as A; the top card of the remaining deck (drawTop) is appended to the
//      actual starter's hand before the first placement. Hands 4/3/3/3, deck 35.
//   F  reference (no new games): A with 3 points deducted from the starter's final total.
// Smoke only: A2 and H2 are the same as A and H with BLIND_SCORE_ONLY (identical inputs).
//
// The driver is the same loop as sim/play-game.ts and scripts/blind-turn-order-experiment.ts. The only change is
// the initial hand of the starter in H, and a per-game hand cap: starter <= 4 in H, every other hand <= 3.
// Every other invariant is checked with listInvariantViolations (all findings except the three-card HAND_SIZE
// finding, which is replaced by the cap above). Production rules, engine and AI strategies are not modified.
//
// Usage:
//   npx tsx scripts/blind-starter-extra-card-experiment.ts smoke --out <dir>
//   npx tsx scripts/blind-starter-extra-card-experiment.ts run --seedFrom 200 --seedTo 399 --out <dir>
//   npx tsx scripts/blind-starter-extra-card-experiment.ts analyze --seedFrom 200 --seedTo 399 --out <dir> --boot 2000
// Records are one JSON line per game in records-<from>-<to>.jsonl; reruns skip keys already present.

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getStrategy } from '../src/game/ai/registry';
import { actingSeats, reduce } from '../src/game/core/engine';
import { drawTop } from '../src/game/core/deck';
import { rankPlayers } from '../src/game/core/ranking';
import { defaultConfig, deepFreeze, newGame } from '../src/game/core/state';
import type { GameState } from '../src/game/core/state';
import type { Action, Difficulty, GameConfig, IdentityVisibility, PlayerId, SeatConfig } from '../src/game/core/types';
import { viewFor } from '../src/game/core/view';
import { decisionSeed, listInvariantViolations, strategiesFor } from '../src/game/sim/play-game';

const SEATS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];
const REWARD = [10, 5, 4, 3, 2, 1];
const BONUS = 5;
const PENALTY = 3;

interface Condition {
  id: string;
  visibility: IdentityVisibility;
  extra: boolean; // H: the actual starter gets a fourth card
}
const CONDITIONS: Condition[] = [
  { id: 'A_BLIND_3CARDS', visibility: 'BLIND', extra: false },
  { id: 'H_BLIND_STARTER4', visibility: 'BLIND', extra: true },
];
const SMOKE_EXTRA: Condition[] = [
  { id: 'A2_SCOREONLY_3CARDS', visibility: 'BLIND_SCORE_ONLY', extra: false },
  { id: 'H2_SCOREONLY_STARTER4', visibility: 'BLIND_SCORE_ONLY', extra: true },
];

// Lineups in the order of the previous experiments: 0 all BEGINNER, 1 all ADVANCED, 2..7 the six ADVANCED pairs.
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

const argValue = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : fallback;
};
const COMMAND = process.argv[2] ?? 'smoke';
const OUT = resolve(argValue('--out', join(process.env.TEMP ?? '.', 'qroker-blind-starter-extra-card')));
const SEED_FROM = Number(argValue('--seedFrom', '200'));
const SEED_TO = Number(argValue('--seedTo', '399'));
const BOOT = Number(argValue('--boot', '2000'));
const PRIOR_A = argValue('--priorA', 'D:/DevCaches/tmp/qroker-blind-turn-order/full');
const PRIOR_SMOKE = argValue('--priorSmoke', 'D:/DevCaches/tmp/qroker-blind-turn-order/smoke/records-smoke.jsonl');

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

export interface Rec {
  cond: string;
  extra: boolean;
  seed: number;
  lineup: number;
  starter: number; // index into SEATS of the actual first placer
  ok: boolean;
  error?: string;
  logHash?: string;
  baseDealHash?: string; // board, hands and deck of the ordinary three-card deal (H's extra card removed)
  scores?: number[]; // by physical seat
  ranks?: number[];
  shares?: number[];
  shared?: boolean;
  bonusSeat?: number | null;
  predPoints?: number[];
  placements?: number[];
  totalPlacements?: number;
  endedBy?: 'HAND_EMPTY' | 'CODE_LIMIT';
  firstPlaceOk?: boolean;
  bonusCheckOk?: boolean;
  drawCheckOk?: boolean;
  capOk?: boolean;
  initialSizesOk?: boolean;
  extraCard?: string | null;
  firstPlaceCodes?: number; // codes completed by the very first PLACE of the game
  actions?: number;
}

function configFor(c: Condition, lineup: Record<PlayerId, Difficulty>): GameConfig {
  const base = defaultConfig();
  const seats = SEATS.map((id) => ({ id, kind: 'AI', difficulty: lineup[id], name: id }) as SeatConfig) as unknown as GameConfig['seats'];
  const scoreConfig = {
    id: `EXPERIMENT_BONUS_${BONUS}`,
    provisional: true,
    config: { rewardByError: [...REWARD], handEmptyBonus: BONUS },
  };
  return { ...base, seats, identityVisibility: c.visibility, scoreConfig } as GameConfig;
}

function fingerprint(board: unknown, hands: unknown, deck: unknown): string {
  return sha256(JSON.stringify({ board, hands, deck }));
}

function shareOf(scores: readonly number[]): { ranks: number[]; shares: number[]; shared: boolean } {
  const ranking = rankPlayers(Object.fromEntries(SEATS.map((s, i) => [s, scores[i]!])) as Record<PlayerId, number>);
  const ranks = SEATS.map((s) => ranking.find((e) => e.player === s)!.rank);
  const top = ranks.filter((r) => r === 1).length;
  return { ranks, shares: ranks.map((r) => (r === 1 ? 1 / top : 0)), shared: top > 1 };
}

/** Runs one game. Throws on any failed check; the caller records the failure. */
function drive(c: Condition, seed: number, lineupIndex: number, starter: number): Rec {
  const rec: Rec = { cond: c.id, extra: c.extra, seed, lineup: lineupIndex, starter, ok: false };
  try {
    const tiers = LINEUPS[lineupIndex]!;
    const config = configFor(c, tiers);
    const created = newGame({ seed, config });
    if (!created.ok) throw new Error(`newGame rejected: ${created.error.code}`);
    const base = created.value;
    const starterSeat = SEATS[starter]!;

    // Initial state. H: the top card of the ordinary deck (drawTop takes the LAST element) goes to the starter.
    let extraCard: string | null = null;
    let initialHands: Record<PlayerId, readonly string[]> = base.hands as Record<PlayerId, readonly string[]>;
    let initialDeck: readonly string[] = base.deck;
    if (c.extra) {
      const top = drawTop(base.deck);
      if (top.card === null) throw new Error('empty deck before the extra card');
      extraCard = top.card;
      initialDeck = top.deck;
      initialHands = { ...initialHands, [starterSeat]: [...initialHands[starterSeat]!, top.card] };
    }
    let state: GameState = deepFreeze({
      ...base,
      hands: initialHands as unknown as GameState['hands'],
      deck: initialDeck as unknown as GameState['deck'],
      turn: starterSeat,
    });

    // Exact initial sizes: starter 4 (H) or 3, every other hand 3, deck 35 (H) or 36 (A).
    const sizes = SEATS.map((s) => state.hands[s].length);
    const expectedSizes = SEATS.map((s, i) => (c.extra && i === starter ? 4 : 3));
    const expectedDeck = c.extra ? 35 : 36;
    rec.initialSizesOk = JSON.stringify(sizes) === JSON.stringify(expectedSizes) && state.deck.length === expectedDeck;
    if (!rec.initialSizesOk) throw new Error(`initial sizes ${sizes.join('/')} deck ${state.deck.length}`);
    const initialFindings = listInvariantViolations(state).filter((f) => f.invariant !== 'HAND_SIZE');
    if (initialFindings.length > 0) throw new Error(`initial invariant: ${initialFindings[0]!.invariant} ${initialFindings[0]!.detail}`);

    // Base deal fingerprint: remove the extra card from the starter and put it back on top of the deck.
    const baseHands = SEATS.reduce<Record<string, readonly string[]>>((acc, s, i) => {
      acc[s] = c.extra && i === starter ? (state.hands[s] as readonly string[]).slice(0, -1) : (state.hands[s] as readonly string[]);
      return acc;
    }, {});
    const baseDeck = c.extra ? [...(state.deck as readonly string[]), extraCard!] : (state.deck as readonly string[]);
    rec.baseDealHash = fingerprint(state.board, baseHands, baseDeck);
    rec.extraCard = extraCard;

    const strategies = strategiesFor(tiers);
    const draws: boolean[] = [];
    let firstPlaceCodes: number | undefined;
    let capOk = true;
    let drawCheckOk = true;
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
      const before = state;
      const next = reduce(state, action);
      if (!next.ok) throw new Error(`rejected ${JSON.stringify(action)}: ${next.error.code}`);
      if (seat !== null && (action as { player?: unknown }).player !== seat) throw new Error('action for another seat');
      const after = next.value;

      // Invariants: everything except the three-card HAND_SIZE, plus the cap (starter 4 in H, others 3).
      const findings = listInvariantViolations(after, before).filter((f) => f.invariant !== 'HAND_SIZE');
      if (findings.length > 0) throw new Error(`invariant ${findings[0]!.invariant}: ${findings[0]!.detail} at action ${actionIndex}`);
      for (const s of SEATS) {
        const cap = c.extra && s === starterSeat ? 4 : 3;
        if (after.hands[s].length > cap || after.hands[s].length < 0) capOk = false;
      }

      // Draw rule on each PLACE: a code means no draw; otherwise one card is drawn if the deck had one.
      if (action.type === 'PLACE') {
        const placer = action.player;
        const coded = after.phase === 'GUESS_COLLECT' || after.pending !== null;
        const deckBefore = before.deck.length;
        const expected = before.hands[placer].length - 1 + (!coded && deckBefore > 0 ? 1 : 0);
        if (after.hands[placer].length !== expected) drawCheckOk = false;
        draws.push(!coded && deckBefore > 0);
        if (firstPlaceCodes === undefined) firstPlaceCodes = coded ? after.pending!.codes.length : 0;
      }
      state = after;
    }
    rec.capOk = capOk;
    rec.drawCheckOk = drawCheckOk;
    rec.firstPlaceCodes = firstPlaceCodes ?? 0;

    const scores = SEATS.map((s) => state.scores[s]);
    const { ranks, shares, shared } = shareOf(scores);
    const log = state.log;
    const firstPlace = log.find((a) => a.type === 'PLACE');
    const placements = SEATS.map((s) => log.filter((a) => a.type === 'PLACE' && a.player === s).length);
    const predPoints = SEATS.map((s) => state.history.reduce((sum, r) => sum + (r.perPlayer.find((p) => p.player === s)?.earned ?? 0), 0));
    const bonusSeat = state.bonusAwarded === null ? null : SEATS.indexOf(state.bonusAwarded);
    const bonusCheckOk = SEATS.every((s, i) => scores[i] === predPoints[i]! + (bonusSeat === i ? BONUS : 0));
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
      totalPlacements: placements.reduce((a, b) => a + b, 0),
      endedBy: bonusSeat === null ? 'CODE_LIMIT' : 'HAND_EMPTY',
      firstPlaceOk: firstPlace !== undefined && firstPlace.type === 'PLACE' && firstPlace.player === starterSeat,
      bonusCheckOk,
      actions: log.length,
    });
    void draws;
  } catch (error) {
    rec.ok = false;
    rec.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  return rec;
}

const keyOf = (r: Pick<Rec, 'cond' | 'seed' | 'lineup' | 'starter'>): string => `${r.cond}|${r.seed}|${r.lineup}|${r.starter}`;

function loadDir(dir: string): Rec[] {
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
  const seeds = [0, 1];
  const conds = [...CONDITIONS, ...SMOKE_EXTRA];
  const recs: Rec[] = [];
  for (const c of conds) for (const seed of seeds) for (let l = 0; l < LINEUPS.length; l++) for (let s = 0; s < 4; s++) recs.push(drive(c, seed, l, s));
  const byKey = new Map(recs.map((r) => [keyOf(r), r]));
  const checks: Record<string, unknown> = {};
  const expected = conds.length * seeds.length * LINEUPS.length * 4;
  checks.coverage = { expected, attempted: recs.length, completed: recs.filter((r) => r.ok).length, uniqueKeys: byKey.size };
  checks.failures = recs.filter((r) => !r.ok).map((r) => ({ key: keyOf(r), error: r.error }));
  const okRecs = recs.filter((r) => r.ok);
  checks.initialSizesOk = okRecs.every((r) => r.initialSizesOk === true);
  checks.firstPlaceIsStarter = okRecs.every((r) => r.firstPlaceOk === true);
  checks.bonusRecipientAndAmount = okRecs.every((r) => r.bonusCheckOk === true);
  checks.drawRuleAndNoDrawAfterCode = okRecs.every((r) => r.drawCheckOk === true);
  checks.handCapStarter4Others3 = okRecs.every((r) => r.capOk === true);
  checks.winSharesSumToOne = okRecs.every((r) => Math.abs(r.shares!.reduce((a, b) => a + b, 0) - 1) < 1e-12);

  // H: the ordinary deal of A is recovered exactly (same seed, lineup and starter).
  let baseSame = 0;
  for (const r of recs.filter((x) => x.cond === 'H_BLIND_STARTER4')) {
    const a = byKey.get(`A_BLIND_3CARDS|${r.seed}|${r.lineup}|${r.starter}`)!;
    if (a.baseDealHash === r.baseDealHash) baseSame++;
  }
  checks.hBaseDealEqualsA = { compared: recs.filter((x) => x.cond === 'H_BLIND_STARTER4').length, equal: baseSame };

  // A against the established driver: previous smoke records (same seeds 0-1, all lineups, all starters).
  const prior = existsSync(PRIOR_SMOKE)
    ? readFileSync(PRIOR_SMOKE, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as { cond: string; seed: number; lineup: number; starter: number; logHash?: string; scores?: number[] })
    : [];
  if (prior.length > 0) {
    let same = 0;
    let total = 0;
    const diffs: string[] = [];
    for (const p of prior.filter((x) => x.cond === 'A_BLIND_B5' && seeds.includes(x.seed))) {
      const r = byKey.get(`A_BLIND_3CARDS|${p.seed}|${p.lineup}|${p.starter}`)!;
      total++;
      if (r.logHash === p.logHash && JSON.stringify(r.scores) === JSON.stringify(p.scores)) same++;
      else diffs.push(`seed ${p.seed} lineup ${p.lineup} starter ${p.starter}`);
    }
    checks.aMatchesEstablishedDriver = { compared: total, equal: same, differing: diffs };
  } else {
    checks.aMatchesEstablishedDriver = { skipped: `prior smoke records not found: ${PRIOR_SMOKE}` };
  }

  // Deterministic replay of H from its modified initial state.
  let replay = 0;
  let replayTotal = 0;
  for (let l = 0; l < LINEUPS.length; l++) for (let s = 0; s < 4; s++) {
    const first = byKey.get(`H_BLIND_STARTER4|0|${l}|${s}`)!;
    const again = drive(CONDITIONS[1]!, 0, l, s);
    replayTotal++;
    if (again.logHash === first.logHash && JSON.stringify(again.scores) === JSON.stringify(first.scores)) replay++;
  }
  checks.deterministicReplayH = { compared: replayTotal, equal: replay };

  // BLIND_SCORE_ONLY against BLIND with identical inputs (A and H).
  const pairs: Record<string, { pairs: number; logDiff: number; scoreDiff: number }> = {};
  for (const [blind, so] of [['A_BLIND_3CARDS', 'A2_SCOREONLY_3CARDS'], ['H_BLIND_STARTER4', 'H2_SCOREONLY_STARTER4']] as const) {
    let logDiff = 0;
    let scoreDiff = 0;
    let n = 0;
    for (const seed of seeds) for (let l = 0; l < LINEUPS.length; l++) for (let s = 0; s < 4; s++) {
      const x = byKey.get(`${blind}|${seed}|${l}|${s}`)!;
      const y = byKey.get(`${so}|${seed}|${l}|${s}`)!;
      n++;
      if (x.logHash !== y.logHash) logDiff++;
      if (JSON.stringify(x.scores) !== JSON.stringify(y.scores)) scoreDiff++;
    }
    pairs[`${blind} vs ${so}`] = { pairs: n, logDiff, scoreDiff };
  }
  checks.blindScoreOnlyVsBlind = pairs;

  const summary = {
    command: 'smoke',
    seeds,
    lineups: LINEUP_NAMES,
    games: recs.length,
    checks,
  };
  writeFileSync(join(OUT, 'smoke-checks.json'), JSON.stringify(summary, null, 2) + '\n');
  writeFileSync(join(OUT, 'records-smoke.jsonl'), recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

// ------------------------------------------------------------------------------------------------ run
function run(): void {
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `records-${SEED_FROM}-${SEED_TO}.jsonl`);
  const done = new Set<string>();
  if (existsSync(file)) for (const line of readFileSync(file, 'utf8').split('\n')) if (line.trim()) done.add(keyOf(JSON.parse(line) as Rec));
  let written = 0;
  let skipped = 0;
  const started = Date.now();
  for (let seed = SEED_FROM; seed <= SEED_TO; seed++) for (const c of CONDITIONS) for (let l = 0; l < LINEUPS.length; l++) for (let s = 0; s < 4; s++) {
    if (done.has(`${c.id}|${seed}|${l}|${s}`)) {
      skipped++;
      continue;
    }
    appendFileSync(file, JSON.stringify(drive(c, seed, l, s)) + '\n');
    written++;
  }
  process.stdout.write(JSON.stringify({ command: 'run', file, seeds: `${SEED_FROM}..${SEED_TO}`, conditions: CONDITIONS.map((c) => c.id), written, skippedExisting: skipped, seconds: (Date.now() - started) / 1000 }, null, 2) + '\n');
}

// ------------------------------------------------------------------------------------------------ analysis
function derivePenalty(base: Rec[], id: string, penalty: number): Rec[] {
  return base.map((r) => {
    if (!r.ok) return { ...r, cond: id };
    const scores = r.scores!.map((v, i) => (i === r.starter ? v - penalty : v));
    const { ranks, shares, shared } = shareOf(scores);
    return { ...r, cond: id, scores, ranks, shares, shared };
  });
}

interface SeedSums {
  pos: number[][]; // [lineup][turn position] share sums
  games: number[];
  advShare: number[];
  begShare: number[];
  advSeat: number[];
  begSeat: number[];
  starterShareBy: { BEG: number; ADV: number };
  starterGamesBy: { BEG: number; ADV: number };
}
const emptySeed = (): SeedSums => ({
  pos: LINEUPS.map(() => [0, 0, 0, 0]),
  games: LINEUPS.map(() => 0),
  advShare: LINEUPS.map(() => 0),
  begShare: LINEUPS.map(() => 0),
  advSeat: LINEUPS.map(() => 0),
  begSeat: LINEUPS.map(() => 0),
  starterShareBy: { BEG: 0, ADV: 0 },
  starterGamesBy: { BEG: 0, ADV: 0 },
});

function sumsBySeed(records: Rec[], seeds: number[]): Map<number, SeedSums> {
  const out = new Map<number, SeedSums>();
  for (const s of seeds) out.set(s, emptySeed());
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
    if (isMixed(r.lineup)) {
      const tier = tiers[SEATS[r.starter]!] === 'ADVANCED' ? 'ADV' : 'BEG';
      s.starterShareBy[tier] += r.shares![r.starter]!;
      s.starterGamesBy[tier] += 1;
    }
  }
  return out;
}

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
  const skill = (mixedIdx.reduce((a, l) => a + (advS[l]! / advN[l]! - begS[l]! / begN[l]!), 0) / mixedIdx.length) * 100;
  const pureBeg = lineupPos(0);
  const pureAdv = lineupPos(1);
  let sBeg = 0;
  let nBeg = 0;
  let sAdv = 0;
  let nAdv = 0;
  for (const seed of seedList) {
    const s = sums.get(seed)!;
    sBeg += s.starterShareBy.BEG;
    nBeg += s.starterGamesBy.BEG;
    sAdv += s.starterShareBy.ADV;
    nAdv += s.starterGamesBy.ADV;
  }
  return {
    primaryGapPP: (Math.max(...pooled) - Math.min(...pooled)) * 100,
    firstMinusFourthPP: (pooled[0]! - pooled[3]!) * 100,
    skillGapPP: skill,
    pureBegGapPP: (Math.max(...pureBeg) - Math.min(...pureBeg)) * 100,
    pureAdvGapPP: (Math.max(...pureAdv) - Math.min(...pureAdv)) * 100,
    t1: pooled[0]!,
    t2: pooled[1]!,
    t3: pooled[2]!,
    t4: pooled[3]!,
    starterBegShare: sBeg / nBeg,
    starterAdvShare: sAdv / nAdv,
  };
}

function interval(values: number[]): [number, number] {
  const v = [...values].sort((a, b) => a - b);
  return [v[Math.floor(0.025 * (v.length - 1))]!, v[Math.ceil(0.975 * (v.length - 1))]!];
}

function analyze(): void {
  const records = loadDir(OUT).filter((r) => r.seed >= SEED_FROM && r.seed <= SEED_TO && (r.cond === 'A_BLIND_3CARDS' || r.cond === 'H_BLIND_STARTER4'));
  const seeds = [...new Set(records.map((r) => r.seed))].sort((a, b) => a - b);
  const A = records.filter((r) => r.cond === 'A_BLIND_3CARDS');
  const H = records.filter((r) => r.cond === 'H_BLIND_STARTER4');
  const F = derivePenalty(A, 'F_PENALTY3', PENALTY);
  const conds: Record<string, Rec[]> = { A_BLIND_3CARDS: A, H_BLIND_STARTER4: H, F_PENALTY3: F };
  const sumsFor = Object.fromEntries(Object.entries(conds).map(([id, rs]) => [id, sumsBySeed(rs, seeds)])) as Record<string, Map<number, SeedSums>>;
  const point = Object.fromEntries(Object.keys(conds).map((id) => [id, metricsFromSums(sumsFor[id]!, seeds)])) as Record<string, Record<string, number>>;

  // Whole-seed paired bootstrap: all conditions for a sampled seed are used together.
  let lcg = 20261125;
  const next = (n: number): number => {
    lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
    return lcg % n;
  };
  const draws: number[][] = [];
  for (let b = 0; b < BOOT; b++) draws.push(Array.from({ length: seeds.length }, () => seeds[next(seeds.length)]!));
  const ci: Record<string, Record<string, [number, number]>> = {};
  for (const id of Object.keys(conds)) {
    const d = draws.map((idx) => metricsFromSums(sumsFor[id]!, idx));
    ci[id] = Object.fromEntries(Object.keys(point[id]!).map((k) => [k, interval(d.map((x) => x[k]!))]));
  }
  const diffVs = (x: string, base: string) => {
    const d = draws.map((idx) => {
      const m1 = metricsFromSums(sumsFor[x]!, idx);
      const m0 = metricsFromSums(sumsFor[base]!, idx);
      return { primary: m1.primaryGapPP! - m0.primaryGapPP!, skill: m1.skillGapPP! - m0.skillGapPP!, first: m1.firstMinusFourthPP! - m0.firstMinusFourthPP! };
    });
    return {
      primaryGapPP: { point: point[x]!.primaryGapPP! - point[base]!.primaryGapPP!, ci: interval(d.map((v) => v.primary)) },
      skillGapPP: { point: point[x]!.skillGapPP! - point[base]!.skillGapPP!, ci: interval(d.map((v) => v.skill)) },
      firstMinusFourthPP: { point: point[x]!.firstMinusFourthPP! - point[base]!.firstMinusFourthPP!, ci: interval(d.map((v) => v.first)) },
    };
  };
  const diffs = { H_minus_A: diffVs('H_BLIND_STARTER4', 'A_BLIND_3CARDS'), H_minus_F: diffVs('H_BLIND_STARTER4', 'F_PENALTY3'), F_minus_A: diffVs('F_PENALTY3', 'A_BLIND_3CARDS') };

  // Descriptive tables (per condition, mixed and uniform lineups separately).
  const describe = (rs: Rec[], label: string) => {
    const ok = rs.filter((r) => r.ok);
    const mixed = ok.filter((r) => isMixed(r.lineup));
    const pure = (lu: number) => ok.filter((r) => r.lineup === lu);
    const turn = (rs2: Rec[]) => [0, 1, 2, 3].map((k) => rs2.reduce((a, r) => a + r.shares![(r.starter + k) % 4]!, 0) / rs2.length);
    const starterHands = (rs2: Rec[]) => {
      const n = rs2.length;
      return {
        games: n,
        starterBonusFreq: rs2.filter((r) => r.bonusSeat === r.starter).length / n,
        starterPredPointsExBonus: rs2.reduce((a, r) => a + r.predPoints![r.starter]!, 0) / n,
        firstPlaceCodeRate: rs2.filter((r) => (r.firstPlaceCodes ?? 0) > 0).length / n,
        avgPlacementsPerGame: rs2.reduce((a, r) => a + r.totalPlacements!, 0) / n,
        sharedFirstFreq: rs2.filter((r) => r.shared).length / n,
      };
    };
    const tierSplit = (rs2: Rec[]) => {
      const out: Record<string, { games: number; starterWinShare: number }> = {};
      for (const t of ['BEG', 'ADV'] as const) {
        const g = rs2.filter((r) => (LINEUPS[r.lineup]![SEATS[r.starter]!] === 'ADVANCED' ? 'ADV' : 'BEG') === t);
        out[t] = { games: g.length, starterWinShare: g.reduce((a, r) => a + r.shares![r.starter]!, 0) / g.length };
      }
      return out;
    };
    const endCounts = (rs2: Rec[]) => ({
      handEmpty: rs2.filter((r) => r.endedBy === 'HAND_EMPTY').length,
      codeLimit: rs2.filter((r) => r.endedBy === 'CODE_LIMIT').length,
    });
    return {
      label,
      completed: ok.length,
      failed: rs.length - ok.length,
      mixed: { games: mixed.length, turnShares: turn(mixed), starterHands: starterHands(mixed), tierSplit: tierSplit(mixed), ended: endCounts(mixed), endedSumOk: endCounts(mixed).handEmpty + endCounts(mixed).codeLimit === mixed.length },
      allGamesStarterHands: starterHands(ok),
      pureBEG: { games: pure(0).length, turnShares: turn(pure(0)), sharedFirst: pure(0).filter((r) => r.shared).length / pure(0).length },
      pureADV: { games: pure(1).length, turnShares: turn(pure(1)), sharedFirst: pure(1).filter((r) => r.shared).length / pure(1).length },
    };
  };
  const tables = { A_BLIND_3CARDS: describe(A, 'A'), H_BLIND_STARTER4: describe(H, 'H'), F_PENALTY3: describe(F, 'F') };

  const summary = {
    command: 'analyze',
    seeds: `${seeds[0]}..${seeds[seeds.length - 1]}`,
    seedCount: seeds.length,
    matchedPairs: seeds.length * LINEUPS.length * 4,
    bootstrap: { draws: BOOT, rng: 20261125, unit: 'whole seed' },
    point,
    ci,
    diffs,
    tables,
    checks: {
      recordsA: A.length,
      recordsH: H.length,
      failedA: A.filter((r) => !r.ok).length,
      failedH: H.filter((r) => !r.ok).length,
      hBaseDealEqualsA: (() => {
        const aIdx = new Map(A.map((r) => [keyOf(r).replace('A_BLIND_3CARDS', 'X'), r.baseDealHash]));
        return H.filter((r) => r.ok).every((r) => aIdx.get(keyOf(r).replace('H_BLIND_STARTER4', 'X')) === r.baseDealHash);
      })(),
    },
  };
  // A against the previous experiment's A_BLIND_B5 records, by seed, lineup and starter (when available).
  const prevA = loadDir(PRIOR_A).filter((r) => r.cond === 'A_BLIND_B5' && r.seed >= SEED_FROM && r.seed <= SEED_TO);
  const prevKey = new Map(prevA.map((r) => [`${r.seed}|${r.lineup}|${r.starter}`, r]));
  let prevEqual = 0;
  let prevDiff = 0;
  for (const r of A) {
    const p = prevKey.get(`${r.seed}|${r.lineup}|${r.starter}`);
    if (p && p.logHash === r.logHash && JSON.stringify(p.scores) === JSON.stringify(r.scores)) prevEqual++;
    else if (p) prevDiff++;
  }
  summary.checks = { ...summary.checks, aVsPreviousARecords: { compared: prevA.length, equal: prevEqual, differing: prevDiff, missingPrevious: A.length - prevEqual - prevDiff } } as typeof summary.checks;

  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ out: join(OUT, 'summary.json'), seeds: summary.seeds, matchedPairs: summary.matchedPairs, checks: summary.checks }, null, 2) + '\n');
}

if (COMMAND === 'smoke') smoke();
else if (COMMAND === 'run') run();
else if (COMMAND === 'analyze') analyze();
else throw new Error(`unknown command ${COMMAND}`);
