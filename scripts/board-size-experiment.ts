/**
 * Paired AI self-play: shipped 8x8 engine (baseline) against an isolated 6x6 copy of the same engine.
 *
 * Experimental only. The shipped engine under src/game is never edited. The 6x6 variant is a copy built under
 * D:/DevCaches/tmp/qroker-board-size/ with exactly three changes: BOARD_SIZE and the notation letters/pattern in
 * core/geometry.ts, and the four starting positions in core/board.ts (C3, D3, C4, D4 in the order of D4, E4, D5, E5).
 *
 * Usage (from the repository root):
 *   npx tsx scripts/board-size-experiment.ts smoke          reproduce playGame on 8x8 and check the 6x6 variant
 *   npx tsx scripts/board-size-experiment.ts run [N]        N paired seeds per configuration (default 100)
 *   npx tsx scripts/board-size-experiment.ts summarize      read raw logs and write summary.json
 *
 * Pairing: for each seed both boards use the same deal (deck order, initial hands), starting seat P0, identity
 * visibility and AI tier layout. AI decisions use the engine's own decision seed.
 *
 * Saturation: a placement that must happen when every cell is occupied is recorded as SATURATED (no legal cell,
 * nothing else changes). It is counted in every denominator. The engine itself is not changed.
 */
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve('.');
const WORK = 'D:/DevCaches/tmp/qroker-board-size';
const RAW = join(WORK, 'raw');
const SEATS = ['P0', 'P1', 'P2', 'P3'] as const;
type Vis = 'OWNER_ONLY' | 'BLIND';
type Mix = 'BEGINNER' | 'ADVANCED' | 'MIXED';
const VISIBILITIES: Vis[] = ['OWNER_ONLY', 'BLIND'];
const MIXES: Mix[] = ['BEGINNER', 'ADVANCED', 'MIXED'];

/** Thrown by the guard when a placement is required on a full board. */
class Saturated extends Error {
  constructor(
    readonly turn: string,
    readonly deck: number,
    readonly placements: number,
    readonly codes: number,
    readonly occupied: [number, number][],
  ) {
    super(`saturated: turn ${turn}, deck ${deck}, placements ${placements}`);
  }
}

interface Engine {
  playGame: (o: any) => { final: any; log: readonly any[] };
  strategiesFor: (d: Record<string, string>) => Record<string, any>;
  defaultConfig: () => any;
  AiStrategyError: new (...a: any[]) => Error;
  fromNotation?: (s: string) => any;
  cellsOf?: () => number;
}

/** Board definition: size, starting cells, and the module tree to run. */
interface Board {
  name: '8x8' | '6x6';
  size: number;
  start: [number, number][];
  load: () => Promise<Engine>;
}

const BOARDS: Record<'8x8' | '6x6', Board> = {
  '8x8': {
    name: '8x8',
    size: 8,
    start: [[3, 3], [3, 4], [4, 3], [4, 4]],
    load: async () => ({
      ...(await import(pathToFileURL(join(ROOT, 'src/game/sim/play-game.ts')).href)),
      defaultConfig: (await import(pathToFileURL(join(ROOT, 'src/game/core/state.ts')).href)).defaultConfig,
    }),
  },
  '6x6': {
    name: '6x6',
    size: 6,
    start: [[2, 2], [2, 3], [3, 2], [3, 3]],
    load: async () => ({
      ...(await import(pathToFileURL(join(WORK, 'v6/src/game/sim/play-game.ts')).href)),
      defaultConfig: (await import(pathToFileURL(join(WORK, 'v6/src/game/core/state.ts')).href)).defaultConfig,
    }),
  },
};

/** Copies src/game into a work folder. The 6x6 variant gets three exact, single-match replacements. */
function buildVariants(): void {
  const v8 = join(WORK, 'v8');
  const v6 = join(WORK, 'v6');
  for (const dir of [v8, v6]) rmSync(dir, { recursive: true, force: true });
  cpSync(join(ROOT, 'src/game'), join(v8, 'src/game'), { recursive: true });
  cpSync(join(ROOT, 'src/game'), join(v6, 'src/game'), { recursive: true });
  const patch = (file: string, pairs: [string, string][]): void => {
    let text = readFileSync(file, 'utf8');
    for (const [from, to] of pairs) {
      const count = text.split(from).length - 1;
      if (count !== 1) throw new Error(`${file}: expected one match for ${JSON.stringify(from)}, found ${count}`);
      text = text.replace(from, to);
    }
    writeFileSync(file, text);
  };
  patch(join(v6, 'src/game/core/geometry.ts'), [
    ['export const BOARD_SIZE = 8;', 'export const BOARD_SIZE = 6;'],
    ["const COLUMN_LETTERS = 'ABCDEFGH';", "const COLUMN_LETTERS = 'ABCDEF';"],
    ['const NOTATION_PATTERN = /^[A-H][1-8]$/;', 'const NOTATION_PATTERN = /^[A-F][1-6]$/;'],
  ]);
  patch(join(v6, 'src/game/sim/play-game.ts'), [['const BOARD_CELLS = 64;', 'const BOARD_CELLS = 36;']]); // invariant cell count only
  patch(join(v6, 'src/game/core/board.ts'), [
    ['Object.freeze({ row: 3, col: 3 }), // D4', 'Object.freeze({ row: 2, col: 2 }), // C3 (6x6 variant)'],
    ['Object.freeze({ row: 3, col: 4 }), // E4', 'Object.freeze({ row: 2, col: 3 }), // D3 (6x6 variant)'],
    ['Object.freeze({ row: 4, col: 3 }), // D5', 'Object.freeze({ row: 3, col: 2 }), // C4 (6x6 variant)'],
    ['Object.freeze({ row: 4, col: 4 }), // E5', 'Object.freeze({ row: 3, col: 3 }), // D4 (6x6 variant)'],
  ]);
}

/** Tier of each seat. MIXED alternates the first seat between tiers by seed parity. */
function tiersFor(mix: Mix, seed: number): Record<string, string> {
  if (mix === 'BEGINNER') return { P0: 'BEGINNER', P1: 'BEGINNER', P2: 'BEGINNER', P3: 'BEGINNER' };
  if (mix === 'ADVANCED') return { P0: 'ADVANCED', P1: 'ADVANCED', P2: 'ADVANCED', P3: 'ADVANCED' };
  const first = seed % 2 === 0 ? 'ADVANCED' : 'BEGINNER';
  const second = first === 'ADVANCED' ? 'BEGINNER' : 'ADVANCED';
  return { P0: first, P1: second, P2: first, P3: second };
}

/** Wraps a strategy so a required placement on a full board is detected before the AI runs. Does not alter choices. */
function guard(strategy: any, board: Board): any {
  const cells = board.size * board.size;
  return {
    id: strategy.id,
    choosePlacement(view: any, ctx: any) {
      const occupied: [number, number][] = [];
      view.board.forEach((cell: unknown, index: number) => {
        if (cell !== null) occupied.push([Math.floor(index / board.size), index % board.size]);
      });
      if (occupied.length >= cells) {
        throw new Saturated(view.turn, view.deckCount, occupied.length - 4, codesOf(view.history), occupied);
      }
      return strategy.choosePlacement(view, ctx);
    },
    chooseGuesses(view: any, ctx: any) {
      return strategy.chooseGuesses(view, ctx);
    },
  };
}

function codesOf(history: readonly any[]): number {
  return history.reduce((n: number, record: any) => n + record.codes.length, 0);
}

/** Quad keys of the scored codes, excluding the starting group (never scored, OQ-3). */
function quadKeysOf(history: readonly any[], board: Board): string[] {
  const startKey = `${String.fromCharCode(65 + board.start[0]![1])}${board.start[0]![0] + 1}`;
  return history.flatMap((record: any) => record.codes.map((c: any) => c.quadKey as string)).filter((k) => k !== startKey);
}

function quadCellsOf(key: string): [number, number][] {
  const col = key.charCodeAt(0) - 65;
  const row = Number(key.slice(1)) - 1;
  return [[row, col], [row, col + 1], [row + 1, col], [row + 1, col + 1]];
}

export interface GameRecord {
  board: '8x8' | '6x6';
  vis: Vis;
  mix: Mix;
  seed: number;
  status: 'ENDED' | 'SATURATED' | 'ERROR';
  endedBy: 'HAND_EMPTY' | 'CODE_LIMIT' | 'DECK_EXHAUSTED' | 'SATURATED' | null;
  placements: number;
  codes: number;
  quadKeys: string[];
  /** Placed (non-starting) cells in placement order, `[row, col]`. */
  placedCells: [number, number][];
  /** Occupied cells at the end, including the starting group. */
  occupied: [number, number][];
  scores: Record<string, number> | null;
  saturation: { turn: string; deck: number; placements: number } | null;
  error: string | null;
  tiers: Record<string, string>;
}

/** Plays one paired game. Errors are recorded, never swallowed silently. */
async function runGame(engine: Engine, board: Board, vis: Vis, mix: Mix, seed: number, keepLog = false): Promise<{ record: GameRecord; log: any[] | null }> {
  const tiers = tiersFor(mix, seed);
  const strategies = engine.strategiesFor(tiers);
  const guarded: Record<string, any> = {};
  for (const seat of SEATS) guarded[seat] = guard(strategies[seat], board);
  const config = { ...engine.defaultConfig(), identityVisibility: vis };
  const base = { board: board.name, vis, mix, seed, tiers };
  try {
    const result = engine.playGame({ seed, config, strategies: guarded });
    const final = result.final;
    const placements = result.log.filter((a: any) => a.type === 'PLACE');
    const placedCells: [number, number][] = placements.map((a: any) => [a.pos.row, a.pos.col]);
    const occupied: [number, number][] = [];
    final.board.forEach((cell: unknown, index: number) => {
      if (cell !== null) occupied.push([Math.floor(index / board.size), index % board.size]);
    });
    const endedBy = final.bonusAwarded ? 'HAND_EMPTY' : final.deck.length === 0 ? 'DECK_EXHAUSTED' : 'CODE_LIMIT';
    const quadKeys = quadKeysOf(final.history, board);
    const record: GameRecord = {
      ...base,
      status: 'ENDED',
      endedBy,
      placements: placements.length,
      codes: quadKeys.length,
      quadKeys,
      placedCells,
      occupied,
      scores: { ...final.scores },
      saturation: null,
      error: null,
    } as GameRecord;
    return { record, log: keepLog ? [...result.log] : null };
  } catch (thrown: any) {
    const cause = thrown?.cause ?? thrown;
    if (cause instanceof Saturated) {
      const record: GameRecord = {
        ...base,
        status: 'SATURATED',
        endedBy: 'SATURATED',
        placements: cause.placements,
        codes: cause.codes,
        quadKeys: [],
        placedCells: [],
        occupied: cause.occupied,
        scores: null,
        saturation: { turn: cause.turn, deck: cause.deck, placements: cause.placements },
        error: null,
      } as GameRecord;
      return { record, log: null };
    }
    const record: GameRecord = {
      ...base,
      status: 'ERROR',
      endedBy: null,
      placements: 0,
      codes: 0,
      quadKeys: [],
      placedCells: [],
      occupied: [],
      scores: null,
      saturation: null,
      error: `${cause?.name ?? 'Error'}: ${String(cause?.message ?? cause).slice(0, 300)}`,
    } as GameRecord;
    return { record, log: null };
  }
}

async function smoke(): Promise<void> {
  buildVariants();
  const repo = await BOARDS['8x8'].load();
  const v8 = await (async () => {
    const m = await import(pathToFileURL(join(WORK, 'v8/src/game/sim/play-game.ts')).href);
    const s = await import(pathToFileURL(join(WORK, 'v8/src/game/core/state.ts')).href);
    return { ...m, defaultConfig: s.defaultConfig } as Engine;
  })();
  const v6 = await BOARDS['6x6'].load();
  const plainLog = (engine: Engine, seed: number, vis: Vis, mix: Mix) => {
    const config = { ...engine.defaultConfig(), identityVisibility: vis };
    return engine.playGame({ seed, config, strategies: engine.strategiesFor(tiersFor(mix, seed)) });
  };
  let matched = 0;
  let total = 0;
  for (const seed of [1, 2]) {
    for (const vis of VISIBILITIES) {
      for (const mix of MIXES) {
        total++;
        const a = plainLog(repo, seed, vis, mix);
        const b = await runGame(v8, BOARDS['8x8'], vis, mix, seed, true);
        const sameLog = JSON.stringify(a.log) === JSON.stringify(b.log!);
        const sameScores = JSON.stringify(a.final.scores) === JSON.stringify(b.record.scores);
        if (sameLog && sameScores) matched++;
        console.log(`smoke 8x8 seed ${seed} ${vis} ${mix}: log ${sameLog ? 'same' : 'DIFF'} (${a.log.length} actions), scores ${sameScores ? 'same' : 'DIFF'} ${JSON.stringify(a.final.scores)}`);
      }
    }
  }
  console.log(`smoke 8x8 reproduction: ${matched}/${total} games identical in action log and scores`);
  const modules = await import(pathToFileURL(join(WORK, 'v6/src/game/core/geometry.ts')).href);
  const accepted = [];
  const rejected = [];
  for (const letter of 'ABCDEFGH') for (let r = 1; r <= 8; r++) {
    const text = `${letter}${r}`;
    const parsed = modules.fromNotation(text);
    (parsed.ok ? accepted : rejected).push(text);
  }
  const inBoard = new Set(accepted);
  const expected = [];
  for (const letter of 'ABCDEF') for (let r = 1; r <= 6; r++) expected.push(`${letter}${r}`);
  const allCells = new Set<string>();
  for (let row = 0; row < 6; row++) for (let col = 0; col < 6; col++) allCells.add(modules.toNotation({ row, col }));
  const onlyAtoF = accepted.every((t) => t[0]! <= 'F' && Number(t[1]) <= 6);
  console.log(`6x6 notation: accepted ${accepted.length} strings, all within A1-F6: ${onlyAtoF}, expected ${expected.length} cells, distinct cells from toNotation: ${allCells.size}`);
  console.log(`6x6 notation: G1 accepted? ${inBoard.has('G1')}, F6 accepted? ${inBoard.has('F6')}, A7 accepted? ${inBoard.has('A7')}`);
  console.log('smoke 6x6 sample games:');
  for (const seed of [1, 2]) {
    const r = await runGame(v6, BOARDS['6x6'], 'BLIND', 'BEGINNER', seed);
    console.log(`  seed ${seed}: ${r.record.status} ${r.record.endedBy} placements ${r.record.placements} codes ${r.record.codes} ${r.record.error ?? ''} ${r.record.saturation ? JSON.stringify(r.record.saturation) : ''}`);
  }
}

async function run(seedCount: number): Promise<void> {
  buildVariants();
  mkdirSync(RAW, { recursive: true });
  const engines: Record<string, Engine> = { '8x8': await BOARDS['8x8'].load(), '6x6': await BOARDS['6x6'].load() };
  for (const boardName of ['8x8', '6x6'] as const) {
    for (const vis of VISIBILITIES) {
      for (const mix of MIXES) {
        const file = join(RAW, `${boardName}-${vis}-${mix}.jsonl`);
        rmSync(file, { force: true });
        const started = Date.now();
        for (let seed = 1; seed <= seedCount; seed++) {
          const { record } = await runGame(engines[boardName]!, BOARDS[boardName], vis, mix, seed);
          appendFileSync(file, JSON.stringify(record) + '\n');
        }
        console.log(`${boardName} ${vis} ${mix}: ${seedCount} games in ${Math.round((Date.now() - started) / 1000)} s`);
      }
    }
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function pct(n: number, d: number): string {
  return d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`;
}

function summarize(): void {
  const load = (board: string, vis: Vis, mix: Mix): GameRecord[] => {
    const file = join(RAW, `${board}-${vis}-${mix}.jsonl`);
    if (!existsSync(file)) return [];
    return readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  };
  const out: Record<string, unknown> = {};
  // Q1 and Q2 use every 8x8 game that ended normally (saturation cannot happen on 8x8; ERROR is counted separately).
  const eight: GameRecord[] = [];
  for (const vis of VISIBILITIES) for (const mix of MIXES) eight.push(...load('8x8', vis, mix));
  const ok8 = eight.filter((g) => g.status === 'ENDED');
  const isOuter = (r: number, c: number) => r === 0 || r === 7 || c === 0 || c === 7;
  const touchingOuter = ok8.filter((g) => g.placedCells.some(([r, c]) => isOuter(r, c)));
  const outerPlacements = ok8.reduce((n, g) => n + g.placedCells.filter(([r, c]) => isOuter(r, c)).length, 0);
  const allPlacements = ok8.reduce((n, g) => n + g.placedCells.length, 0);
  const firstOuter = ok8.flatMap((g) => {
    const i = g.placedCells.findIndex(([r, c]) => isOuter(r, c));
    return i < 0 ? [] : [i + 1];
  });
  const withCodes = ok8.filter((g) => g.quadKeys.length > 0);
  const codeOuter = withCodes.filter((g) => g.quadKeys.some((k) => quadCellsOf(k).some(([r, c]) => isOuter(r, c))));
  const heat: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (const g of ok8) {
    const seen = new Set<string>();
    for (const [r, c] of g.placedCells) {
      const key = `${r},${c}`;
      if (!seen.has(key)) { seen.add(key); heat[r]![c]!++; }
    }
  }
  const spanRows = (g: GameRecord) => Math.max(...g.occupied.map(([r]) => r)) - Math.min(...g.occupied.map(([r]) => r)) + 1;
  const spanCols = (g: GameRecord) => Math.max(...g.occupied.map(([, c]) => c)) - Math.min(...g.occupied.map(([, c]) => c)) + 1;
  const beyondRows = ok8.filter((g) => spanRows(g) > 6);
  const beyondCols = ok8.filter((g) => spanCols(g) > 6);
  const beyondEither = ok8.filter((g) => spanRows(g) > 6 || spanCols(g) > 6);
  out.q1 = {
    games: ok8.length,
    touchOuterGames: touchingOuter.length,
    outerPlacementShare: [outerPlacements, allPlacements],
    gamesWithScoredCode: withCodes.length,
    codeUsesOuterGames: codeOuter.length,
    medianFirstOuterPlacement: median(firstOuter),
    gamesReachingOuter: firstOuter.length,
    heat,
  };
  out.q2 = {
    games: ok8.length,
    rowsSpanOver6: beyondRows.length,
    colsSpanOver6: beyondCols.length,
    eitherSpanOver6: beyondEither.length,
  };
  // Q3: 6x6 against 8x8 on the same seeds, by visibility and mix.
  const q3: Record<string, unknown>[] = [];
  for (const boardName of ['8x8', '6x6'] as const) {
    for (const vis of VISIBILITIES) {
      for (const mix of MIXES) {
        const games = load(boardName, vis, mix);
        const ended = games.filter((g) => g.status === 'ENDED');
        const sat = games.filter((g) => g.status === 'SATURATED');
        const err = games.filter((g) => g.status === 'ERROR');
        const count = (k: string) => games.filter((g) => g.endedBy === k).length;
        const avg = (xs: number[]) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : null);
        q3.push({
          board: boardName,
          vis,
          mix,
          n: games.length,
          ended: ended.length,
          saturated: sat.length,
          errors: err.length,
          meanPlacements: avg(games.filter((g) => g.status !== 'ERROR').map((g) => g.placements)),
          meanCodes: avg(games.filter((g) => g.status !== 'ERROR').map((g) => g.codes)),
          deckExhausted: count('DECK_EXHAUSTED'),
          codeLimit: count('CODE_LIMIT'),
          handEmpty: count('HAND_EMPTY'),
          saturationTurns: sat.map((g) => g.saturation!.turn),
          saturationDeck: sat.map((g) => g.saturation!.deck),
          saturationPlacements: sat.map((g) => g.saturation!.placements),
          errorMessages: [...new Set(err.map((g) => g.error!))],
        });
      }
    }
  }
  out.q3 = q3;
  writeFileSync(join(RAW, 'summary.json'), JSON.stringify(out, null, 2));
  console.log(`Q1 8x8 games ${ok8.length}: touch outer ${pct(touchingOuter.length, ok8.length)}, outer placements ${pct(outerPlacements, allPlacements)}, games with code ${withCodes.length}, of which code uses outer ${pct(codeOuter.length, withCodes.length)}, median first outer placement ${median(firstOuter)} (n=${firstOuter.length})`);
  console.log(`Q2 8x8 games ${ok8.length}: rows span >6 ${pct(beyondRows.length, ok8.length)}, cols span >6 ${pct(beyondCols.length, ok8.length)}, either ${pct(beyondEither.length, ok8.length)}`);
  for (const row of q3) console.log(JSON.stringify(row));
}

/**
 * Scoring attribution and illustrative boards. Reruns the 8x8 games with the same seeds and tiers as `run`.
 * Only single-code batches assign points to one code; batches with two or more codes are counted separately.
 */
async function examples(seedCount: number): Promise<void> {
  buildVariants();
  const engine = await BOARDS['8x8'].load();
  const isOuter = (r: number, c: number) => r === 0 || r === 7 || c === 0 || c === 7;
  const cellOf = (key: string): [number, number][] => quadCellsOf(key);
  let singleBatches = 0;
  let singleWithOuter = 0;
  let pointsAll = 0;
  let pointsOuter = 0;
  let example: string | null = null;
  for (const vis of VISIBILITIES) {
    for (const mix of MIXES) {
      for (let seed = 1; seed <= seedCount; seed++) {
        const strategies = engine.strategiesFor(tiersFor(mix, seed));
        const guarded: Record<string, any> = {};
        for (const seat of SEATS) guarded[seat] = guard(strategies[seat], BOARDS['8x8']);
        const config = { ...engine.defaultConfig(), identityVisibility: vis };
        const result = engine.playGame({ seed, config, strategies: guarded });
        const final = result.final;
        for (const record of final.history) {
          const earned = record.perPlayer.reduce((n: number, p: any) => n + p.earned, 0);
          if (record.codes.length === 1) {
            singleBatches++;
            pointsAll += earned;
            const cells = cellOf(record.codes[0].quadKey);
            if (cells.some(([r, c]) => isOuter(r, c))) {
              singleWithOuter++;
              pointsOuter += earned;
              if (example === null && earned > 0 && vis === 'OWNER_ONLY') {
                example = `seed ${seed}, ${vis}, ${mix}, code ${record.codes[0].quadKey}, cards ${record.codes[0].cards.join(' ')}, hidden sum ${record.codes[0].hiddenSum}, points ${JSON.stringify(record.perPlayer.map((p: any) => `${p.player}:${p.earned}`))}`;
                const placeIndex = new Map<string, number>();
                let n = 0;
                for (const a of result.log) if (a.type === 'PLACE') placeIndex.set(`${a.pos.row},${a.pos.col}`, ++n);
                const grid: string[] = [];
                for (let r = 0; r < 8; r++) {
                  const row: string[] = [];
                  for (let c = 0; c < 8; c++) {
                    const cell = final.board[r * 8 + c];
                    const tag = cell ? `${cell.card}` : '--';
                    row.push(`${tag.padEnd(3)}${isOuter(r, c) ? '*' : ' '}`);
                  }
                  grid.push(row.join(' '));
                }
                example += `\n${grid.join('\n')}\n(* = outer ring; code cells ${cells.map(([r, c]) => `${String.fromCharCode(65 + c)}${r + 1}`).join(',')}; placement order of those cards: ${cells.map(([r, c]) => placeIndex.get(`${r},${c}`) ?? 'start').join(',')})`;
              }
            }
          } else if (record.codes.length >= 2) {
            pointsAll += 0;
          }
        }
      }
    }
  }
  const text = [
    `single-code batches ${singleBatches}; with an outer-ring cell ${singleWithOuter} (${((100 * singleWithOuter) / singleBatches).toFixed(1)}%)`,
    `points from single-code batches ${pointsAll}; of which from outer-ring codes ${pointsOuter} (${((100 * pointsOuter) / pointsAll).toFixed(1)}%)`,
    `example (8x8, outer code scored): ${example ?? 'none found'}`,
  ].join('\n');
  mkdirSync(RAW, { recursive: true });
  writeFileSync(join(RAW, 'examples-8x8.txt'), text + '\n');
  console.log(text);
}

const [, , mode, arg] = process.argv;
if (mode === 'smoke') await smoke();
else if (mode === 'run') await run(Number(arg ?? 100));
else if (mode === 'summarize') summarize();
else if (mode === 'examples') await examples(Number(arg ?? 100));
else {
  console.error('usage: tsx scripts/board-size-experiment.ts smoke | run [N] | summarize');
  process.exit(2);
}
