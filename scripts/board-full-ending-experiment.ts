/**
 * Board-full ending, experimental 6x6 only. The released 8x8 rules are never edited.
 *
 * The rule under test: when a PLACE fills the last cell (36 of 36 on 6x6), the game ends after that placement is
 * fully resolved. No code: the normal draw runs, then the game ends at the current scores. One or more codes: the
 * four guesses are collected, every code is scored once, then the game ends. No bonus is awarded for a full board.
 * The hand-empty bonus is awarded once if it also applies. The driver never asks for placement 33.
 *
 * Boards (copies under D:/DevCaches/tmp/qroker-board-full/):
 *   v8      unpatched copy of src/game (the released 8x8 rules)
 *   v6old   6x6 geometry and start cells only (the previous experiment; stops at SATURATED)
 *   v6new   v6old plus the board-full ending in core/engine.ts and the matching invariant in sim/play-game.ts
 *
 * Usage (from the repository root):
 *   npx tsx scripts/board-full-ending-experiment.ts build
 *   npx tsx scripts/board-full-ending-experiment.ts smoke
 *   npx tsx scripts/board-full-ending-experiment.ts regress       seed 5 saturation case, old and new
 *   npx tsx scripts/board-full-ending-experiment.ts scan [N]      search 6x6 games for each final-placement category
 *   npx tsx scripts/board-full-ending-experiment.ts run [N]       N paired seeds per board, mode and lineup
 *   npx tsx scripts/board-full-ending-experiment.ts summarize     write summary.json and print the tables
 *
 * Pairing: seed s uses starting seat rotation r = (s - 1) mod 4. Physical seat j holds tier lineup[j]; engine seat k
 * (turn position k + 1, P0 always acts first in the engine) holds lineup[(k + r) mod 4]. Both boards get the same
 * deal, same identity visibility and the same tiers per engine seat. Each rotation is used for 25 of 100 seeds.
 */
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve('.');
const WORK = 'D:/DevCaches/tmp/qroker-board-full';
const RAW = join(WORK, 'raw');
const SEATS = ['P0', 'P1', 'P2', 'P3'];
type Mode = 'OWNER_ONLY' | 'BLIND';
type Lineup = 'BEGINNER' | 'ADVANCED' | 'MIXED';
type Board = '8x8' | '6x6';
const MODES: Mode[] = ['OWNER_ONLY', 'BLIND'];
const LINEUPS: Lineup[] = ['BEGINNER', 'ADVANCED', 'MIXED'];
const BOARD_SIZE: Record<Board, number> = { '8x8': 8, '6x6': 6 };
const ENGINE_DIR: Record<Board, string> = { '8x8': 'v8', '6x6': 'v6new' };

interface Engine {
  newGame: (o: any) => any;
  reduce: (s: any, a: any) => any;
  actingSeats: (s: any) => string[];
  viewFor: (s: any, seat: string) => any;
  decisionSeed: (seed: number, seat: string, index: number) => number;
  strategiesFor: (t: Record<string, string>) => Record<string, any>;
  checkStateInvariants: (s: any, prev?: any) => void;
  defaultConfig: () => any;
  playGame: (o: any) => { final: any; log: readonly any[] };
}

async function loadEngine(dir: string): Promise<Engine> {
  const base = join(WORK, dir, 'src/game');
  const url = (p: string) => pathToFileURL(join(base, p)).href;
  const play = await import(url('sim/play-game.ts'));
  const state = await import(url('core/state.ts'));
  const engine = await import(url('core/engine.ts'));
  const view = await import(url('core/view.ts'));
  return {
    newGame: state.newGame,
    defaultConfig: state.defaultConfig,
    reduce: engine.reduce,
    actingSeats: engine.actingSeats,
    viewFor: view.viewFor,
    decisionSeed: play.decisionSeed,
    strategiesFor: play.strategiesFor,
    checkStateInvariants: play.checkStateInvariants,
    playGame: play.playGame,
  };
}

function patchFile(file: string, pairs: [string, string][]): void {
  let text = readFileSync(file, 'utf8');
  for (const [from, to] of pairs) {
    const count = text.split(from).length - 1;
    if (count !== 1) throw new Error(`${file}: expected one match for ${JSON.stringify(from)}, found ${count}`);
    text = text.replace(from, to);
  }
  writeFileSync(file, text);
}

function sizePatches(dir: string): void {
  patchFile(join(dir, 'src/game/core/geometry.ts'), [
    ['export const BOARD_SIZE = 8;', 'export const BOARD_SIZE = 6;'],
    ["const COLUMN_LETTERS = 'ABCDEFGH';", "const COLUMN_LETTERS = 'ABCDEF';"],
    ['const NOTATION_PATTERN = /^[A-H][1-8]$/;', 'const NOTATION_PATTERN = /^[A-F][1-6]$/;'],
  ]);
  patchFile(join(dir, 'src/game/core/board.ts'), [
    ['Object.freeze({ row: 3, col: 3 }), // D4', 'Object.freeze({ row: 2, col: 2 }), // C3 (6x6 variant)'],
    ['Object.freeze({ row: 3, col: 4 }), // E4', 'Object.freeze({ row: 2, col: 3 }), // D3 (6x6 variant)'],
    ['Object.freeze({ row: 4, col: 3 }), // D5', 'Object.freeze({ row: 3, col: 2 }), // C4 (6x6 variant)'],
    ['Object.freeze({ row: 4, col: 4 }), // E5', 'Object.freeze({ row: 3, col: 3 }), // D4 (6x6 variant)'],
  ]);
  patchFile(join(dir, 'src/game/sim/play-game.ts'), [['const BOARD_CELLS = 64;', 'const BOARD_CELLS = 36;']]);
}

/** Builds the three copies. Each replacement must match exactly once. */
export function buildVariants(): void {
  const dirs = ['v8', 'v6old', 'v6new'].map((d) => join(WORK, d));
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  for (const d of dirs) cpSync(join(ROOT, 'src/game'), join(d, 'src/game'), { recursive: true });
  sizePatches(join(WORK, 'v6old'));
  sizePatches(join(WORK, 'v6new'));
  patchFile(join(WORK, 'v6new/src/game/core/engine.ts'), [
    ['const board = placed.value;', 'const board = placed.value;\n  const boardFull = board.every((cell) => cell !== null);'],
    [
      'endsGame: drawn.hand.length === 0 || scoredGroups.length >= COMPLETED_CODE_LIMIT,',
      'endsGame: drawn.hand.length === 0 || scoredGroups.length >= COMPLETED_CODE_LIMIT || boardFull,',
    ],
    [
      "if (drawn.deck.length === 0) return ok({ ...next, phase: 'ENDED' });",
      "if (boardFull || drawn.deck.length === 0) return ok({ ...next, phase: 'ENDED' });",
    ],
  ]);
  patchFile(join(WORK, 'v6new/src/game/sim/play-game.ts'), [
    [
      'state.scoredGroups.length < COMPLETED_CODE_LIMIT) {',
      'state.scoredGroups.length < COMPLETED_CODE_LIMIT && !state.board.every((cell) => cell !== null)) {',
    ],
    [
      'const shouldEnd = state.hands[batch.placer]?.length === 0 || state.scoredGroups.length >= COMPLETED_CODE_LIMIT;',
      'const shouldEnd = state.hands[batch.placer]?.length === 0 || state.scoredGroups.length >= COMPLETED_CODE_LIMIT || state.board.every((cell) => cell !== null);',
    ],
  ]);
  console.log('variants built under', WORK);
}

/** Tiers by engine seat for a lineup and starting rotation r (see the module comment). */
export function lineupTiers(lineup: Lineup, r: number): Record<string, string> {
  const physical: string[] =
    lineup === 'BEGINNER' ? ['BEGINNER', 'BEGINNER', 'BEGINNER', 'BEGINNER']
    : lineup === 'ADVANCED' ? ['ADVANCED', 'ADVANCED', 'ADVANCED', 'ADVANCED']
    : ['ADVANCED', 'BEGINNER', 'ADVANCED', 'BEGINNER'];
  return Object.fromEntries(SEATS.map((seat, k) => [seat, physical[(k + r) % 4]!]));
}

const rotationOf = (seed: number): number => (seed - 1) % 4;

const STARTS: Record<Board, string> = { '8x8': 'D4', '6x6': 'C3' };
const cellsOf = (b: Board) => BOARD_SIZE[b] * BOARD_SIZE[b];
const isFull = (state: any, b: Board) => state.board.every((cell: unknown) => cell !== null) && cellsOf(b) === state.board.length;

export interface Game {
  board: Board;
  mode: Mode;
  lineup: Lineup;
  seed: number;
  rotation: number;
  tiers: Record<string, string>;
  status: 'ENDED' | 'SATURATED' | 'ERROR';
  error: string | null;
  placements: number;
  codeCount: number;
  codePlacements: number[];
  firstCodePlacement: number | null;
  scores: Record<string, number> | null;
  bonusSeat: string | null;
  boardFull: boolean;
  deckEmpty: boolean;
  codeLimit: boolean;
  endedBy: string | null;
  winners: string[];
  allZero: boolean;
  /** Last-placement facts for full-board games. */
  last: null | {
    preScores: Record<string, number>;
    placeSeat: string;
    finalCodes: number;
    quiet: boolean;
    rejectsAfterEnd: boolean;
    scoringOk: boolean;
  };
  saturation: null | { turn: string; deck: number; placements: number };
  log: any[];
}

/** Plays one game with the explicit driver loop. The same loop reproduces `playGame` on 8x8. */
export async function playOne(
  eng: Engine,
  board: Board,
  mode: Mode,
  lineup: Lineup,
  seed: number,
  opts: { tiers?: Record<string, string>; legacy?: boolean } = {},
): Promise<Game> {
  const rotation = rotationOf(seed);
  const tiers = opts.tiers ?? lineupTiers(lineup, rotation);
  const strategies = eng.strategiesFor(tiers);
  const base: Game = {
    board, mode, lineup, seed, rotation, tiers, status: 'ENDED', error: null, placements: 0, codeCount: 0,
    codePlacements: [], firstCodePlacement: null, scores: null, bonusSeat: null, boardFull: false, deckEmpty: false,
    codeLimit: false, endedBy: null, winners: [], allZero: false, last: null, saturation: null, log: [],
  };
  const created = eng.newGame({ seed, config: { ...eng.defaultConfig(), identityVisibility: mode } });
  if (!created.ok) return { ...base, status: 'ERROR', error: `newGame: ${created.error.code}` };
  let state = created.value;
  const preScores: Record<string, number>[] = [];
  let placeSeats: string[] = [];
  try {
    eng.checkStateInvariants(state);
    let steps = 0;
    while (state.phase !== 'ENDED') {
      if (++steps > 2000) throw new Error('step guard exceeded');
      let action: any;
      if (state.phase === 'REVEAL') {
        action = { type: 'ACK_REVEAL' };
      } else {
        const seat = eng.actingSeats(state)[0]!;
        if (state.phase === 'PLACEMENT' && isFull(state, board)) {
          if (opts.legacy) {
            return {
              ...base,
              status: 'SATURATED',
              placements: state.placements,
              scores: { ...state.scores },
              saturation: { turn: seat, deck: state.deck.length, placements: state.placements },
              log: [...state.log],
            };
          }
          throw new Error(`driver asked for placement ${state.placements + 1} on a full board`);
        }
        const ctx = Object.freeze({ decisionSeed: eng.decisionSeed(state.seed, seat, state.log.length) });
        const view = eng.viewFor(state, seat);
        const strategy = strategies[seat]!;
        action = state.phase === 'PLACEMENT' ? strategy.choosePlacement(view, ctx) : strategy.chooseGuesses(view, ctx);
        if (action.player !== undefined && action.player !== seat) throw new Error(`strategy of ${seat} acted for ${action.player}`);
      }
      if (action.type === 'PLACE') {
        preScores.push({ ...state.scores });
        placeSeats.push(state.turn);
      }
      const next = eng.reduce(state, action);
      if (!next.ok) throw new Error(`engine rejected ${action.type}: ${next.error.code} ${next.error.detail ?? ''}`);
      eng.checkStateInvariants(next.value, state);
      state = next.value;
    }
  } catch (thrown: any) {
    return { ...base, status: 'ERROR', error: `${thrown?.name ?? 'Error'}: ${String(thrown?.message ?? thrown).slice(0, 300)}` };
  }
  return summarizeState(eng, board, base, state, preScores, placeSeats);
}

function summarizeState(
  eng: Engine,
  board: Board,
  base: Game,
  state: any,
  preScores: Record<string, number>[],
  placeSeats: string[],
): Game {
  const log: any[] = state.log;
  const codePlacements: number[] = [];
  let placeNo = 0;
  for (let i = 0; i < log.length; i++) {
    if (log[i].type !== 'PLACE') continue;
    placeNo++;
    if (log[i + 1]?.type === 'SUBMIT_GUESSES') codePlacements.push(placeNo);
  }
  const boardFull = isFull(state, board);
  const bonusSeat: string | null = state.bonusAwarded ?? null;
  const deckEmpty = state.deck.length === 0;
  const codeLimit = state.scoredGroups.length >= 5;
  const endedBy =
    bonusSeat !== null ? 'HAND_EMPTY'
    : codeLimit ? 'CODE_LIMIT'
    : boardFull ? 'BOARD_FULL'
    : deckEmpty ? 'DECK_EXHAUSTED'
    : 'OTHER';
  const scores: Record<string, number> = { ...state.scores };
  const top = Math.max(...SEATS.map((s) => scores[s]!));
  const winners = SEATS.filter((s) => scores[s] === top);
  const game: Game = {
    ...base,
    status: 'ENDED',
    placements: state.placements,
    codeCount: state.history.reduce((n: number, r: any) => n + r.codes.length, 0),
    codePlacements,
    firstCodePlacement: codePlacements[0] ?? null,
    scores,
    bonusSeat,
    boardFull,
    deckEmpty,
    codeLimit,
    endedBy,
    winners,
    allZero: SEATS.every((s) => scores[s] === 0),
    log,
  };
  if (boardFull) {
    const finalCodes = log[log.length - 1]?.type === 'SUBMIT_GUESSES' ? state.history[state.history.length - 1].codes.length : 0;
    const lastRecord = state.history[state.history.length - 1];
    // Scoring check: final minus pre-placement equals this batch's earned points plus any bonus, once per seat.
    const pre = preScores[preScores.length - 1]!;
    const handEmptyBonus: number = handEmptyBonusOf(eng);
    let scoringOk = true;
    for (const s of SEATS) {
      const earned = finalCodes > 0 ? lastRecord.perPlayer.find((p: any) => p.player === s).earned : 0;
      const expected = earned + (bonusSeat === s ? handEmptyBonus : 0);
      if (scores[s]! - pre[s]! !== expected) scoringOk = false;
    }
    // Rejection after the end: every further action is refused with GAME_ENDED.
    const probe = eng.reduce(state, { type: 'ACK_REVEAL' });
    const probePlace = eng.reduce(state, { type: 'PLACE', player: state.turn, card: 'AH', pos: { row: 0, col: 0 }, orientation: 0 });
    const rejectsAfterEnd = !probe.ok && probe.error.code === 'GAME_ENDED' && !probePlace.ok && probePlace.error.code === 'GAME_ENDED';
    game.last = {
      preScores: pre,
      placeSeat: placeSeats[placeSeats.length - 1]!,
      finalCodes,
      quiet: log[log.length - 1]?.type === 'PLACE',
      rejectsAfterEnd,
      scoringOk,
    };
    if (game.placements !== cellsOf(board) - 4) game.error = `full board with ${game.placements} placements`;
  }
  return game;
}

/** The hand-empty bonus value from the shipped scoring configuration (read from the copy's own defaults). */
function handEmptyBonusOf(eng: Engine): number {
  return eng.defaultConfig().scoreConfig.config.handEmptyBonus as number;
}

async function runMany(boardName: Board, seeds: number, label: string): Promise<void> {
  mkdirSync(RAW, { recursive: true });
  const eng = await loadEngine(ENGINE_DIR[boardName]);
  for (const mode of MODES) {
    for (const lineup of LINEUPS) {
      const file = join(RAW, `${boardName}-${mode}-${lineup}.jsonl`);
      rmSync(file, { force: true });
      const started = Date.now();
      for (let seed = 1; seed <= seeds; seed++) {
        const game = await playOne(eng, boardName === '6x6' ? '6x6' : '8x8', mode, lineup, seed);
        appendFileSync(file, JSON.stringify(game) + '\n');
      }
      console.log(`${label} ${boardName} ${mode} ${lineup}: ${seeds} games, ${Math.round((Date.now() - started) / 1000)} s`);
    }
  }
}

async function smoke(): Promise<void> {
  buildVariants();
  const v8 = await loadEngine('v8');
  const v6 = await loadEngine('v6new');
  let matched = 0;
  let total = 0;
  for (const seed of [1, 2]) for (const mode of MODES) for (const lineup of LINEUPS) {
    total++;
    const tiers = lineupTiers(lineup, rotationOf(seed));
    const config = { ...v8.defaultConfig(), identityVisibility: mode };
    const direct = v8.playGame({ seed, config, strategies: v8.strategiesFor(tiers) });
    const mine = await playOne(v8, '8x8', mode, lineup, seed);
    const sameLog = JSON.stringify(direct.log) === JSON.stringify(mine.log);
    const sameScores = JSON.stringify(direct.final.scores) === JSON.stringify(mine.scores);
    if (sameLog && sameScores) matched++;
    console.log(`smoke 8x8 seed ${seed} ${mode} ${lineup}: log ${sameLog ? 'same' : 'DIFF'} (${direct.log.length}), scores ${sameScores ? 'same' : 'DIFF'}`);
  }
  console.log(`smoke 8x8 reproduction of playGame: ${matched}/${total}`);
  for (const seed of [1, 2]) for (const mode of MODES) for (const lineup of LINEUPS) {
    const g = await playOne(v6, '6x6', mode, lineup, seed);
    console.log(`smoke 6x6 seed ${seed} ${mode} ${lineup}: ${g.status} ${g.endedBy} placements ${g.placements} codes ${g.codeCount} scores ${JSON.stringify(g.scores)} ${g.error ?? ''}`);
  }
}

async function regress(): Promise<void> {
  buildVariants();
  const old = await loadEngine('v6old');
  const neu = await loadEngine('v6new');
  // Seed 5 with the tiers of the previous experiment (odd seed: BEGINNER in the first seat).
  const tiers = { P0: 'BEGINNER', P1: 'ADVANCED', P2: 'BEGINNER', P3: 'ADVANCED' };
  const before = await playOne(old, '6x6', 'OWNER_ONLY', 'MIXED', 5, { tiers, legacy: true });
  const after = await playOne(neu, '6x6', 'OWNER_ONLY', 'MIXED', 5, { tiers });
  const prefix = JSON.stringify(after.log.slice(0, before.log.length)) === JSON.stringify(before.log);
  const trailingAck = before.log[before.log.length - 1]?.type === 'ACK_REVEAL';
  const out = {
    seed: 5,
    tiers,
    old: { status: before.status, placements: before.placements, scores: before.scores, saturation: before.saturation, actions: before.log.length },
    new: { status: after.status, endedBy: after.endedBy, placements: after.placements, scores: after.scores, actions: after.log.length, codePlacements: after.codePlacements, last: after.last },
    logPrefixIdentical: prefix,
    oldLogEndsWithAck: trailingAck,
    scoresIdentical: JSON.stringify(before.scores) === JSON.stringify(after.scores),
  };
  mkdirSync(RAW, { recursive: true });
  writeFileSync(join(RAW, 'regress-seed5.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

interface Category { name: string; test: (g: Game) => boolean }
const CATEGORIES: Category[] = [
  { name: 'final-no-code (quiet end)', test: (g) => g.boardFull && g.last!.finalCodes === 0 },
  { name: 'final-one-code', test: (g) => g.boardFull && g.last!.finalCodes === 1 && g.bonusSeat === null && !g.codeLimit },
  { name: 'final-multi-code', test: (g) => g.boardFull && g.last!.finalCodes >= 2 && g.bonusSeat === null && !g.codeLimit },
  { name: 'final-overlaps-code-limit', test: (g) => g.boardFull && g.codeLimit },
  { name: 'final-overlaps-hand-empty', test: (g) => g.boardFull && g.bonusSeat !== null },
];

async function scan(seeds: number): Promise<void> {
  buildVariants();
  const eng = await loadEngine('v6new');
  const counts: Record<string, number> = {};
  const examples: Record<string, unknown> = {};
  let games = 0;
  let errors = 0;
  const errorTally: Record<string, number> = {};
  const checkFailures: Record<string, number> = {};
  for (const lineup of ['ADVANCED', 'MIXED', 'BEGINNER'] as Lineup[]) for (const mode of MODES) for (let seed = 1; seed <= seeds; seed++) {
    const g = await playOne(eng, '6x6', mode, lineup, seed);
    games++;
    if (g.status !== 'ENDED' || g.error) { errors++; const key = String(g.error ?? g.status).slice(0, 120); errorTally[key] = (errorTally[key] ?? 0) + 1; continue; }
    for (const c of CATEGORIES) {
      if (!c.test(g)) continue;
      counts[c.name] = (counts[c.name] ?? 0) + 1;
      if (!g.last!.scoringOk) checkFailures[c.name] = (checkFailures[c.name] ?? 0) + 1;
      if (!g.last!.rejectsAfterEnd) checkFailures[c.name + ' (rejection)'] = (checkFailures[c.name + ' (rejection)'] ?? 0) + 1;
      if (!examples[c.name]) examples[c.name] = { mode, lineup, seed, rotation: g.rotation, tiers: g.tiers, placements: g.placements, scores: g.scores, bonusSeat: g.bonusSeat, last: g.last, tail: g.log.slice(-10) };
    }
  }
  mkdirSync(RAW, { recursive: true });
  const out = { games, errors, errorTally, counts, checkFailures, examples };
  writeFileSync(join(RAW, 'scan-6x6.json'), JSON.stringify(out, null, 2));
  console.log(`scan: ${games} games, ${errors} failures`);
  for (const c of CATEGORIES) console.log(`  ${c.name}: ${counts[c.name] ?? 0}`);
}

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Percentile bootstrap over seeds (paired values are passed in as one number per seed). */
export function bootstrap(values: number[], reps = 2000, seed = 12345): { mean: number; lo: number; hi: number } {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const rng = mulberry32(seed);
  const stats: number[] = [];
  for (let r = 0; r < reps; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += values[Math.floor(rng() * n)]!;
    stats.push(s / n);
  }
  stats.sort((a, b) => a - b);
  return { mean, lo: stats[Math.floor(0.025 * reps)]!, hi: stats[Math.floor(0.975 * reps)]! };
}

function loadGames(board: Board, mode: Mode, lineup: Lineup): Game[] {
  const file = join(RAW, `${board}-${mode}-${lineup}.jsonl`);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
}

/** Win share per turn position for one game. Ties split equally; position p is engine seat p - 1. */
function shares(g: Game): number[] {
  return SEATS.map((s) => (g.winners.includes(s) ? 1 / g.winners.length : 0));
}

function summarize(): void {
  const out: Record<string, any> = { configs: {}, pairs: {} };
  const med = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1]! + s[m]!) / 2;
  };
  for (const board of ['8x8', '6x6'] as Board[]) for (const mode of MODES) for (const lineup of LINEUPS) {
    const games = loadGames(board, mode, lineup);
    const ok = games.filter((g) => g.status === 'ENDED' && !g.error);
    const cfg: Record<string, any> = {
      n: games.length,
      failures: games.length - ok.length,
      ended: ok.length,
      boardFullGames: ok.filter((g) => g.boardFull).length,
      meanPlacements: ok.reduce((a, g) => a + g.placements, 0) / ok.length,
      medianPlacements: med(ok.map((g) => g.placements)),
      meanCodes: ok.reduce((a, g) => a + g.codeCount, 0) / ok.length,
      gamesWithoutCode: ok.filter((g) => g.codeCount === 0).length,
      gamesWithCode: ok.filter((g) => g.codeCount > 0).length,
      medianFirstCodePlacement: med(ok.filter((g) => g.firstCodePlacement !== null).map((g) => g.firstCodePlacement!)),
      allZeroFinishes: ok.filter((g) => g.allZero).length,
      tiedFinishes: ok.filter((g) => g.winners.length > 1).length,
      endedBy: {} as Record<string, number>,
      turnShare: [] as { mean: number; lo: number; hi: number }[],
      outright: [] as number[],
      tiedFirst: [] as number[],
    };
    for (const g of ok) cfg.endedBy[g.endedBy ?? 'NONE'] = (cfg.endedBy[g.endedBy ?? 'NONE'] ?? 0) + 1;
    const perSeed = ok.map(shares);
    for (let p = 0; p < 4; p++) {
      cfg.turnShare.push(bootstrap(perSeed.map((v) => v[p]!)));
      cfg.outright.push(ok.filter((g) => g.winners.length === 1 && g.winners[0] === SEATS[p]).length / ok.length);
      cfg.tiedFirst.push(ok.filter((g) => g.winners.length > 1 && g.winners.includes(SEATS[p]!)).length / ok.length);
    }
    if (lineup === 'MIXED') {
      // Skill gap: share of the win credit that goes to ADVANCED seats, per game.
      cfg.advancedCredit = bootstrap(ok.map((g) => SEATS.reduce((a, s, k) => a + (g.tiers[s] === 'ADVANCED' ? shares(g)[k]! : 0), 0)));
    }
    if (board === '6x6' && mode) {
      const full = ok.filter((g) => g.boardFull);
      const lastMove = full.map((g) => {
        const before = SEATS.filter((s) => g.last!.preScores[s] === Math.max(...SEATS.map((x) => g.last!.preScores[x]!)));
        const fourth = SEATS[3]!;
        return {
          leaderChanged: JSON.stringify(before) !== JSON.stringify(g.winners),
          fourthGains: !before.includes(fourth) && g.winners.includes(fourth),
          fourthLoses: before.includes(fourth) && !g.winners.includes(fourth),
          allTiedBefore: before.length === 4,
          placeSeatIsFourth: g.last!.placeSeat === fourth,
          quiet: g.last!.quiet,
          scoringOk: g.last!.scoringOk,
          rejectsAfterEnd: g.last!.rejectsAfterEnd,
          finalCodes: g.last!.finalCodes,
        };
      });
      cfg.lastMove = {
        n: full.length,
        leaderSetChanged: lastMove.filter((x) => x.leaderChanged).length,
        fourthGainsFirst: lastMove.filter((x) => x.fourthGains).length,
        fourthLosesFirst: lastMove.filter((x) => x.fourthLoses).length,
        allTiedBefore: lastMove.filter((x) => x.allTiedBefore).length,
        fourthPlacedLast: lastMove.filter((x) => x.placeSeatIsFourth).length,
        quietEnds: lastMove.filter((x) => x.quiet).length,
        predictionRounds: lastMove.filter((x) => !x.quiet).length,
        scoringChecksFailed: lastMove.filter((x) => !x.scoringOk).length,
        rejectionChecksFailed: lastMove.filter((x) => !x.rejectsAfterEnd).length,
      };
    }
    out.configs[`${board}|${mode}|${lineup}`] = cfg;
  }
  // Paired 6x6 minus 8x8 differences, by seed.
  for (const mode of MODES) for (const lineup of LINEUPS) {
    const a = loadGames('6x6', mode, lineup);
    const b = loadGames('8x8', mode, lineup);
    const bySeed = new Map(b.map((g) => [g.seed, g]));
    const pairs = a.filter((g) => bySeed.has(g.seed) && g.status === 'ENDED' && bySeed.get(g.seed)!.status === 'ENDED');
    const diff: Record<string, any> = {};
    for (let p = 0; p < 4; p++) {
      diff[`turn${p + 1}`] = bootstrap(pairs.map((g) => shares(g)[p]! - shares(bySeed.get(g.seed)!)[p]!));
    }
    if (lineup === 'MIXED') {
      const adv = (g: Game) => SEATS.reduce((x, s, k) => x + (g.tiers[s] === 'ADVANCED' ? shares(g)[k]! : 0), 0);
      diff.advancedCredit = bootstrap(pairs.map((g) => adv(g) - adv(bySeed.get(g.seed)!)));
    }
    diff.pairedSeeds = pairs.length;
    out.pairs[`${mode}|${lineup}`] = diff;
  }
  writeFileSync(join(RAW, 'summary.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

const [, , mode, arg] = process.argv;
if (mode === 'build') buildVariants();
else if (mode === 'smoke') await smoke();
else if (mode === 'regress') await regress();
else if (mode === 'scan') await scan(Number(arg ?? 300));
else if (mode === 'run') {
  buildVariants();
  const n = Number(arg ?? 100);
  await runMany('8x8', n, 'baseline');
  await runMany('6x6', n, 'rule');
} else if (mode === 'summarize') summarize();
else {
  console.error('usage: tsx scripts/board-full-ending-experiment.ts build | smoke | regress | scan [N] | run [N] | summarize');
  process.exit(2);
}
