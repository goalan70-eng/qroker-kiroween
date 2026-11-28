// Property tests for persistence (task 20.3): Property 27 (save round trip) and Property 28 (save parser
// robustness) of .kiro/specs/qroker-playable-game/design.md. Requirements 18.5 and 18.7.
//
// ---------------------------------------------------------------------------------------------------------
// Property 27 (format and replay round trip)
// ---------------------------------------------------------------------------------------------------------
// States are REACHABLE: `newGame` followed by accepted `reduce` calls whose actions come from the legal-action
// generator of core/testing/state-generators (`randomLegalAction`, `legalPlacements`, `advanceUntil`). Nothing is
// cast to GameState. A case draws a seed (boundary values with weight), a configuration (1..4 humans, BEGINNER or
// ADVANCED AI seats, both visibility modes, varied names and score tables, never EXPERT), a play style, a list of
// choice numbers and a TARGET phase class. The cut point is steered by the target, so every phase is reached on
// purpose: empty log, PLACEMENT, GUESS_COLLECT with 0..3 submissions, a batch of two codes, REVEAL and ENDED.
// For each state: envelope (as `saveGame` builds it) -> serializeSave -> parseSave is OK and toEqual the envelope;
// serializing the parsed envelope gives the same text; `replay` of the parsed log is ok, `stateEquals` and toEqual
// the original state. Coverage tallies are asserted with thresholds, so a generator that never reaches a phase fails.
//
// ---------------------------------------------------------------------------------------------------------
// Property 28 (parser robustness)
// ---------------------------------------------------------------------------------------------------------
// For every text: parseSave does not throw and returns exactly one of the four kinds (never MIGRATED with the
// production constants, INCOMPATIBLE reasons only SAVE_VERSION or RULES_VERSION), and Object.prototype is not
// polluted. For every OK result: serializeSave is deterministic, parseSave of it is OK and equal, and `replay` does
// not throw. It MAY return a rejection (the parser checks structure, the engine checks rules); the test counts both
// outcomes and asserts that both occur. Inputs: arbitrary strings, JSON texts, every prefix and random truncations
// of a valid save, structure-aware mutations of the JSON tree of valid saves, deep nesting and a few oversized
// texts. `parseSaveWith` with a TEST-ONLY migration registry covers MIGRATED. `loadGame` is run over the same texts.
//
// Reproducibility: every run uses a fixed fast-check seed and numRuns (constants below). A failure message holds the
// seed, path, numRuns and the shrunk counterexample cut to about 1000 characters. To replay a failure, pass the
// reported `path` next to the seed in `fc.check` (see `runProperty`). Generated data is synthetic.
// QROKER_PROP_REPORT=1 writes aggregate counts (no texts) to stdout after the file's tests.

import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import { cellAt, placeOnBoard } from '../core/board';
import type { Board } from '../core/board';
import { reduce } from '../core/engine';
import { isValidMember } from '../core/fragment-layout';
import { quadCells } from '../core/geometry';
import { replay, stateEquals } from '../core/replay';
import { RULES_VERSION } from '../core/score';
import { defaultConfig, newGame } from '../core/state';
import type { GameState } from '../core/state';
import { arbSeed } from '../core/testing/card-generators';
import { arbValidScoreConfig } from '../core/testing/score-generators';
import { advanceUntil, arbPlayStyle, choiceFrom, legalPlacements, randomLegalAction } from '../core/testing/state-generators';
import type { PlayStyle } from '../core/testing/state-generators';
import type { Action, Difficulty, GameConfig, IdentityVisibility, PlayerId, SeatConfig, Slot } from '../core/types';
import { MAX_ACTIONS, MAX_SAVE_TEXT_LENGTH, SAVE_FORMAT, SAVE_VERSION, parseSave, parseSaveWith, serializeSave } from './save-format';
import type { ParsedSave, SaveEnvelope } from './save-format';
import { PREFS_KEY, SAVE_KEY, loadGame, memoryStore, saveGame } from './storage';

// ---------------------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------------------

const SEED_P27_A = 20270627;
const SEED_P27_B = 20270634;
const SEED_P27_C = 20270635;
const SEED_P28_STRINGS = 20270628;
const SEED_P28_TRUNC = 20270629;
const SEED_P28_MUT = 20270630;
const SEED_P28_DEPTH = 20270631;
const SEED_P28_MIGRATE = 20270632;
const SEED_P28_LOAD = 20270633;
const SEED_P28_LOAD_2 = SEED_P28_LOAD + 1000;
const SEED_P28_LOAD_3 = SEED_P28_LOAD + 2000;
const SEED_P28_LOAD_4 = SEED_P28_LOAD + 3000;
const SEED_P28_LOAD_PARTS: readonly number[] = [SEED_P28_LOAD, SEED_P28_LOAD_2, SEED_P28_LOAD_3, SEED_P28_LOAD_4];
const SEED_P28_MUT_2 = SEED_P28_MUT + 1000;
const SEED_P28_MUT_PARTS: readonly number[] = [SEED_P28_MUT, SEED_P28_MUT_2];
/** Each Property 27 group (60 cases, guarded as a whole) runs as 4 its of NUM_RUNS_P27 cases with these seeds. */
const SEED_P27_GROUPS: readonly (readonly [string, readonly number[]])[] = [
  ['p27a', [SEED_P27_A, SEED_P27_A + 1000, SEED_P27_A + 2000, SEED_P27_A + 3000]],
  ['p27b', [SEED_P27_B, SEED_P27_B + 1000, SEED_P27_B + 2000, SEED_P27_B + 3000]],
  ['p27c', [SEED_P27_C, SEED_P27_C + 1000, SEED_P27_C + 2000, SEED_P27_C + 3000]],
];

// Runs are split into several its so that every it stays far below the 5000 ms default test timeout also under CPU
// contention (an 800-run loadGame it took 8 s on a loaded machine). Coverage guards are scaled to the per-it runs; the
// guards a single it is too small for are asserted on the sum of its group in afterAll.
/** Cases per Property 27 it: 3 groups x 4 its x 15 = 180 cases, 60 per group as before. */
const NUM_RUNS_P27 = 15;
const NUM_RUNS_P27_GROUP = 60;
const NUM_RUNS_STRINGS = 1500;
const NUM_RUNS_TRUNC = 600;
/** Mutations: 2 its x 1000 = 2000 runs. */
const NUM_RUNS_MUT = 1000;
const NUM_RUNS_DEPTH = 200;
const NUM_RUNS_MIGRATE = 1000;
/** loadGame: 4 its x 200 = 800 runs. */
const NUM_RUNS_LOAD = 200;

const SEATS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];
const NOW = '2027-06-27T10:20:30.400Z';
const FAILURE_TEXT_LIMIT = 1000;
const REPORT: Record<string, unknown> = {};

// ---------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------

const clip = (s: string): string => (s.length <= FAILURE_TEXT_LIMIT ? s : `${s.slice(0, FAILURE_TEXT_LIMIT)}...[cut ${s.length - FAILURE_TEXT_LIMIT} chars]`);

function fail(message: string): never {
  throw new Error(message);
}

/** fc.check with fixed seed and runs. Failure message: seed, path, numRuns, counterexample cut to ~1000 characters. */
function runProperty<T>(label: string, arb: fc.Arbitrary<T>, predicate: (value: T) => void, seed: number, numRuns: number): number {
  const started = performance.now();
  const details = fc.check(fc.property(arb, predicate), { seed, numRuns });
  const elapsed = Math.round(performance.now() - started);
  if (details.failed) {
    const error = details.errorInstance instanceof Error ? details.errorInstance.message : String(details.errorInstance);
    fail(
      `${label} FAILED: seed=${details.seed} path=${String(details.counterexamplePath)} numRuns=${numRuns} (ran ${details.numRuns}) ` +
        `counterexample=${clip(fc.stringify(details.counterexample))} error=${clip(error)}`,
    );
  }
  return elapsed;
}

interface ProtoSnapshot {
  readonly object: string;
  readonly array: string;
}
const protoSnapshot = (): ProtoSnapshot => ({
  object: Object.getOwnPropertyNames(Object.prototype).sort().join(','),
  array: Object.getOwnPropertyNames(Array.prototype).sort().join(','),
});
function expectNoPollution(before: ProtoSnapshot): void {
  expect(protoSnapshot()).toEqual(before);
  const probe = {} as Record<string, unknown>;
  expect(probe.polluted).toBeUndefined();
  expect(Object.keys(Object.prototype)).toEqual([]);
}

function startState(seed: number, config: GameConfig): GameState {
  const created = newGame({ seed, config });
  if (!created.ok) return fail(`newGame rejected a generated configuration: ${created.error.code}`);
  return created.value;
}

function applyOk(state: GameState, action: Action): GameState {
  const result = reduce(state, action);
  if (!result.ok) return fail(`a legal action was rejected with ${result.error.code}`);
  return result.value;
}

const submitted = (s: GameState): number => Object.keys(s.pending?.guesses ?? {}).length;
const codesInBatch = (s: GameState): number => (s.phase === 'GUESS_COLLECT' ? (s.pending?.codes.length ?? 0) : 0);

const envelopeOf = (state: GameState, savedAtIso: string): SaveEnvelope => ({
  format: SAVE_FORMAT,
  saveVersion: SAVE_VERSION,
  rulesVersion: state.config.rulesVersion,
  savedAtIso,
  seed: state.seed,
  config: state.config,
  actions: state.log,
});

const bump = (table: Record<string, number>, key: string): void => {
  table[key] = (table[key] ?? 0) + 1;
};

// ---------------------------------------------------------------------------------------------------------
// Generators for Property 27
// ---------------------------------------------------------------------------------------------------------

const BOUNDARY_SEEDS: readonly number[] = [0, 1, 65535, 65536, 2147483647, 2147483648, 4294967294, 4294967295];
const arbSeed27: fc.Arbitrary<number> = fc.oneof({ weight: 2, arbitrary: fc.constantFrom(...BOUNDARY_SEEDS) }, { weight: 5, arbitrary: arbSeed });

const arbName: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.string({ maxLength: 12 }) },
  { weight: 1, arbitrary: fc.string({ unit: 'binary', maxLength: 30 }) },
  { weight: 1, arbitrary: fc.string({ unit: 'grapheme', maxLength: 10 }) },
  { weight: 1, arbitrary: fc.constantFrom('', 'You', 'AI 1', 'A'.repeat(200), '한국어', '\u{1F600}', '\0', '\ud800', '"\\/\n') },
);

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

/** A savedAtIso text the parser accepts: `YYYY-MM-DDTHH:MM:SS[.f{1,3}]Z`. */
const arbIso: fc.Arbitrary<string> = fc
  .record({
    y: fc.integer({ min: 0, max: 9999 }),
    mo: fc.integer({ min: 1, max: 12 }),
    d: fc.integer({ min: 1, max: 31 }),
    h: fc.integer({ min: 0, max: 23 }),
    mi: fc.integer({ min: 0, max: 59 }),
    s: fc.integer({ min: 0, max: 59 }),
    frac: fc.option(fc.record({ width: fc.integer({ min: 1, max: 3 }), n: fc.nat({ max: 999 }) }), { nil: undefined }),
  })
  .map((p) => {
    const fraction = p.frac === undefined ? '' : `.${pad(p.frac.n % 10 ** p.frac.width, p.frac.width)}`;
    return `${pad(p.y, 4)}-${pad(p.mo, 2)}-${pad(p.d, 2)}T${pad(p.h, 2)}:${pad(p.mi, 2)}:${pad(p.s, 2)}${fraction}Z`;
  });

const arbVisibility: fc.Arbitrary<IdentityVisibility> = fc.constantFrom<IdentityVisibility>('OWNER_ONLY', 'FACE_UP');

interface ConfigDraw {
  readonly humans: readonly PlayerId[];
  readonly difficulties: readonly Difficulty[];
  readonly names: readonly string[];
  readonly visibility: IdentityVisibility;
  readonly score: { readonly useDefault: boolean; readonly id: string; readonly provisional: boolean; readonly table: GameConfig['scoreConfig']['config'] };
}

const arbConfigDraw: fc.Arbitrary<ConfigDraw> = fc
  .integer({ min: 1, max: 4 })
  .chain((count) =>
    fc.record({
      humans: fc.shuffledSubarray([...SEATS], { minLength: count, maxLength: count }),
      difficulties: fc.array(fc.constantFrom<Difficulty>('BEGINNER', 'ADVANCED'), { minLength: 4, maxLength: 4 }),
      names: fc.array(arbName, { minLength: 4, maxLength: 4 }),
      visibility: arbVisibility,
      score: fc.record({
        useDefault: fc.boolean(),
        id: fc.string({ maxLength: 12 }),
        provisional: fc.boolean(),
        table: arbValidScoreConfig,
      }),
    }),
  );

function configOf(draw: ConfigDraw): GameConfig {
  const seats = SEATS.map((id, i): SeatConfig => {
    const name = draw.names[i] as string;
    return draw.humans.includes(id)
      ? { id, kind: 'HUMAN', name }
      : { id, kind: 'AI', difficulty: draw.difficulties[i] as Difficulty, name };
  });
  const base = defaultConfig();
  return {
    rulesVersion: RULES_VERSION,
    seats: seats as unknown as GameConfig['seats'],
    scoreConfig: draw.score.useDefault ? base.scoreConfig : { id: draw.score.id, provisional: draw.score.provisional, config: draw.score.table },
    identityVisibility: draw.visibility,
  };
}

type Target = 'EMPTY' | 'PLACEMENT' | 'GC' | 'TWO' | 'REVEAL' | 'ENDED';
const arbTarget: fc.Arbitrary<Target> = fc.oneof(
  { weight: 1, arbitrary: fc.constant<Target>('EMPTY') },
  { weight: 3, arbitrary: fc.constant<Target>('PLACEMENT') },
  { weight: 6, arbitrary: fc.constant<Target>('GC') },
  { weight: 3, arbitrary: fc.constant<Target>('TWO') },
  { weight: 3, arbitrary: fc.constant<Target>('REVEAL') },
  { weight: 3, arbitrary: fc.constant<Target>('ENDED') },
);

interface Case27 {
  readonly seed: number;
  readonly target: Target;
  readonly warm: number;
  readonly subs: number;
  readonly savedAtIso: string;
  readonly style: PlayStyle;
  readonly config: ConfigDraw;
  readonly numbers: readonly number[];
}

const arbCase27: fc.Arbitrary<Case27> = fc.record({
  seed: arbSeed27,
  target: arbTarget,
  warm: fc.integer({ min: 0, max: 40 }),
  subs: fc.integer({ min: 0, max: 3 }),
  savedAtIso: arbIso,
  style: arbPlayStyle,
  config: arbConfigDraw,
  numbers: fc.array(fc.nat({ max: 1_000_000 }), { minLength: 8, maxLength: 160 }),
});

const SLOT_NAMES: readonly Slot[] = ['TL', 'TR', 'BL', 'BR'];
const POTENTIAL_BY_VALID_CELLS: readonly number[] = [0, 0.2, 1, 6];

/** Steering value of a board for the two-code driver (a heuristic, not a rule; same idea as view.properties.test.ts). */
function potential(board: Board): number {
  let sum = 0;
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
      if (!spoiled && occupied < 4) sum += POTENTIAL_BY_VALID_CELLS[valid] as number;
    }
  }
  return sum;
}

/**
 * Drives play to a batch of exactly two codes (nobody has submitted): takes a two-code placement whenever one is
 * legal, else one of the three code-free placements with the highest potential. Only CHOOSES legal actions;
 *
educe applies them. Returns the last state (a two-code batch unless the cap or the end came first).
 */
function driveToTwoCodes(from: GameState, numbers: readonly number[], style: PlayStyle, cap: number): GameState {
  const choice = choiceFrom(numbers);
  let state = from;
  for (let step = 0; step < cap && state.phase !== 'ENDED'; step++) {
    if (state.phase !== 'PLACEMENT') {
      state = applyOk(state, randomLegalAction(state, choice, style) as Action);
      continue;
    }
    const all = legalPlacements(state);
    const two = all.filter((p) => p.newCodes === 2);
    if (two.length > 0) return applyOk(state, (two[choice(two.length)] as { action: Action }).action);
    const quiet = all.filter((p) => p.newCodes === 0);
    const pool = quiet.length > 0 ? quiet : all;
    const scored = pool.map((p) => {
      const placed = placeOnBoard(state.board, p.action.pos, { card: p.action.card, orientation: p.action.orientation, owner: state.turn });
      return { action: p.action as Action, value: placed.ok ? potential(placed.value) : -1 };
    });
    scored.sort((a, b) => b.value - a.value);
    const top = scored.slice(0, 3);
    state = applyOk(state, (top[choice(top.length)] as { action: Action }).action);
  }
  return state;
}
/** The reachable state of a case. The cut point depends on the target (see the file comment). */
function buildState(c: Case27): GameState {
  const config = configOf(c.config);
  const start = startState(c.seed, config);
  if (c.target === 'EMPTY') return start;
  const steer: PlayStyle = { codeBias: 90, submitOrder: c.style.submitOrder };
  const walk = (from: GameState, stop: (s: GameState) => boolean, style: PlayStyle, cap: number): GameState =>
    advanceUntil(from, stop, c.numbers, style, cap).state;
  switch (c.target) {
    case 'PLACEMENT':
      return walk(start, (s) => s.phase === 'PLACEMENT' && s.log.length >= Math.max(1, c.warm), c.style, 700);
    case 'ENDED':
      return walk(start, (s) => s.phase === 'ENDED', c.style, 900);
    case 'REVEAL':
      return walk(walk(start, (s) => s.log.length >= c.warm, c.style, c.warm + 2), (s) => s.phase === 'REVEAL', steer, 700);
    case 'GC':
      return walk(walk(start, (s) => s.log.length >= c.warm, c.style, c.warm + 2), (s) => s.phase === 'GUESS_COLLECT' && submitted(s) === c.subs, steer, 700);
    case 'TWO': {
      let state = driveToTwoCodes(walk(start, (s) => s.log.length >= c.warm, c.style, c.warm + 2), c.numbers, steer, 400);
      const choice = choiceFrom(c.numbers.slice(5));
      for (let i = 0; i < c.subs && state.phase === 'GUESS_COLLECT'; i++) state = applyOk(state, randomLegalAction(state, choice, steer) as Action);
      return state;
    }
  }
}

interface Tally27 {
  cases: number;
  phase: Record<string, number>;
  emptyLog: number;
  nonEmptyLog: number;
  gcSubmitted: Record<string, number>;
  twoCodeBatches: number;
  twoCodePartial: number;
  humans: Record<string, number>;
  visibility: Record<string, number>;
  seedZero: number;
  seedMax: number;
  seedBoundary: number;
  maxLogLength: number;
  expertSeats: number;
}

const newTally27 = (): Tally27 => ({
  cases: 0, phase: {}, emptyLog: 0, nonEmptyLog: 0, gcSubmitted: {}, twoCodeBatches: 0, twoCodePartial: 0, humans: {}, visibility: {},
  seedZero: 0, seedMax: 0, seedBoundary: 0, maxLogLength: 0, expertSeats: 0,
});

function checkRoundTrip(c: Case27, tally: Tally27): void {
  const state = buildState(c);
  const envelope = envelopeOf(state, c.savedAtIso);

  tally.cases++;
  bump(tally.phase, state.phase);
  if (state.log.length === 0) tally.emptyLog++;
  else tally.nonEmptyLog++;
  if (state.phase === 'GUESS_COLLECT') bump(tally.gcSubmitted, String(submitted(state)));
  if (codesInBatch(state) === 2) {
    tally.twoCodeBatches++;
    if (submitted(state) > 0) tally.twoCodePartial++;
  }
  bump(tally.humans, String(state.config.seats.filter((s) => s.kind === 'HUMAN').length));
  bump(tally.visibility, state.config.identityVisibility);
  if (state.seed === 0) tally.seedZero++;
  if (state.seed === 4294967295) tally.seedMax++;
  if (BOUNDARY_SEEDS.includes(state.seed)) tally.seedBoundary++;
  tally.maxLogLength = Math.max(tally.maxLogLength, state.log.length);
  tally.expertSeats += state.config.seats.filter((s) => s.difficulty === 'EXPERT').length;

  const text = serializeSave(envelope);
  const parsed = parseSave(text);
  if (parsed.kind !== 'OK') fail(`parseSave returned ${parsed.kind} for a serialized reachable state (phase ${state.phase})`);
  expect(parsed.envelope).toEqual(envelope);
  expect(serializeSave(parsed.envelope)).toBe(text);
  expect(serializeSave(envelope)).toBe(text);

  const replayed = replay(parsed.envelope.seed, parsed.envelope.config, parsed.envelope.actions);
  if (!replayed.ok) fail(`replay of the parsed envelope was rejected: ${replayed.error.code} (phase ${state.phase}, ${state.log.length} actions)`);
  expect(stateEquals(replayed.value, state)).toBe(true);
  expect(replayed.value).toEqual(state);
}

// ---------------------------------------------------------------------------------------------------------
// Fixtures for Property 28 (built once, deterministic, no randomness)
// ---------------------------------------------------------------------------------------------------------

const FIXTURE_NUMBERS: readonly number[] = Array.from({ length: 997 }, (_, i) => (i * 7919 + 104729) % 1_000_003);
const STEER: PlayStyle = { codeBias: 90, submitOrder: 'SEAT_ORDER' };
const PLAIN: PlayStyle = { codeBias: 30, submitOrder: 'SEAT_ORDER' };

interface Fixture {
  readonly name: string;
  readonly state: GameState;
  readonly text: string;
  readonly paths: readonly Key[][];
  readonly objectPaths: readonly Key[][];
  readonly guessPaths: readonly Key[][];
}

type Key = string | number;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null;

function collectPaths(node: unknown, path: Key[], out: Key[][], objects: Key[][]): void {
  out.push(path);
  if (!isObj(node)) return;
  if (Array.isArray(node)) node.forEach((child, i) => collectPaths(child, [...path, i], out, objects));
  else {
    objects.push(path);
    for (const key of Object.keys(node)) collectPaths(node[key], [...path, key], out, objects);
  }
}

function makeFixture(name: string, state: GameState): Fixture {
  const text = serializeSave(envelopeOf(state, NOW));
  const tree = JSON.parse(text) as Obj;
  const paths: Key[][] = [];
  const objectPaths: Key[][] = [];
  collectPaths(tree, [], paths, objectPaths);
  const guessPaths: Key[][] = [];
  (tree.actions as Obj[]).forEach((a, i) => {
    if (a.type === 'SUBMIT_GUESSES') for (const key of Object.keys(a.guesses as Obj)) guessPaths.push(['actions', i, 'guesses', key]);
  });
  return { name, state, text, paths: paths.filter((p) => p.length > 0), objectPaths, guessPaths };
}

/** Names of fixtures() in order (known before the fixtures are built, so tests can be declared per fixture). */
const FIXTURE_NAMES: readonly string[] = ['ENDED', 'GC2', 'REVEAL', 'PLACEMENT', 'EMPTY'];
let fixtureCache: readonly Fixture[] | undefined;
function fixtures(): readonly Fixture[] {
  if (fixtureCache !== undefined) return fixtureCache;
  const config = defaultConfig();
  const start = startState(20270101, config);
  const ended = advanceUntil(start, (s) => s.phase === 'ENDED', FIXTURE_NUMBERS, PLAIN, 900).state;
  const gc2 = advanceUntil(startState(20270102, config), (s) => s.phase === 'GUESS_COLLECT' && submitted(s) === 2, FIXTURE_NUMBERS, STEER, 700).state;
  const reveal = advanceUntil(startState(20270103, config), (s) => s.phase === 'REVEAL' && s.log.length > 20, FIXTURE_NUMBERS, STEER, 700).state;
  const mid = advanceUntil(startState(20270104, config), (s) => s.phase === 'PLACEMENT' && s.log.length >= 6, FIXTURE_NUMBERS, PLAIN, 100).state;
  fixtureCache = [makeFixture('ENDED', ended), makeFixture('GC2', gc2), makeFixture('REVEAL', reveal), makeFixture('PLACEMENT', mid), makeFixture('EMPTY', start)];
  return fixtureCache;
}

// ---------------------------------------------------------------------------------------------------------
// Structure-aware mutations of the JSON tree of a valid save
// ---------------------------------------------------------------------------------------------------------

type Op =
  | { t: 'NOOP' }
  | { t: 'TRIM_ACTIONS'; at: number }
  | { t: 'SEED'; v: number }
  | { t: 'ISO'; v: string }
  | { t: 'GUESS'; at: number; v: number }
  | { t: 'SWAP_ACTIONS'; a: number; b: number }
  | { t: 'DUP_ACTION'; a: number; b: number }
  | { t: 'DELETE'; at: number }
  | { t: 'ADD_KEY'; at: number; key: string; value: unknown }
  | { t: 'REPLACE'; at: number; value: unknown }
  | { t: 'SWAP_NODES'; a: number; b: number }
  | { t: 'SAVE_VER'; v: number }
  | { t: 'RULES_VER'; v: number; both: boolean }
  | { t: 'FIELD'; name: string; value: unknown }
  | { t: 'PROTO'; at: number; key: string; nested: boolean }
  | { t: 'ACTION'; at: number; kind: number }
  | { t: 'SEAT'; at: number; kind: number };

const arbIndex: fc.Arbitrary<number> = fc.nat({ max: 1_000_000 });
const arbJson: fc.Arbitrary<unknown> = fc.jsonValue({ maxDepth: 3 });
const arbOddNumber: fc.Arbitrary<unknown> = fc.oneof(
  fc.integer({ min: -5, max: 10 }),
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.constantFrom(1.5, 0.1, -1, 2 ** 53, 2 ** 53 - 1, 1e300, 4294967296, -0.5),
);
const arbFieldValue: fc.Arbitrary<unknown> = fc.oneof(
  arbOddNumber,
  fc.string({ maxLength: 20 }),
  fc.constantFrom(null, true, false, [], {}, 'qroker-save', 'QROKER-SAVE', '1', '-0', 'NaN'),
  arbJson,
);

const arbOp: fc.Arbitrary<Op> = fc.oneof(
  { weight: 2, arbitrary: fc.constant<Op>({ t: 'NOOP' }) },
  { weight: 3, arbitrary: arbIndex.map((at): Op => ({ t: 'TRIM_ACTIONS', at })) },
  { weight: 1, arbitrary: arbSeed27.map((v): Op => ({ t: 'SEED', v })) },
  { weight: 1, arbitrary: arbIso.map((v): Op => ({ t: 'ISO', v })) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('GUESS' as const), at: arbIndex, v: fc.oneof(fc.integer({ min: -100, max: 100 }), fc.double({ noNaN: true, noDefaultInfinity: true })) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('SWAP_ACTIONS' as const), a: arbIndex, b: arbIndex }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('DUP_ACTION' as const), a: arbIndex, b: arbIndex }) },
  { weight: 3, arbitrary: arbIndex.map((at): Op => ({ t: 'DELETE', at })) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('ADD_KEY' as const), at: arbIndex, key: fc.oneof(fc.string({ maxLength: 8 }), fc.constantFrom('extra', 'actions', 'type', 'seed', 'x')), value: arbJson }) },
  { weight: 3, arbitrary: fc.record({ t: fc.constant('REPLACE' as const), at: arbIndex, value: arbFieldValue }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('SWAP_NODES' as const), a: arbIndex, b: arbIndex }) },
  { weight: 3, arbitrary: fc.oneof(fc.constantFrom(0, 2, 3, 100, SAVE_VERSION + 1), fc.integer({ min: -3, max: 1000 }), arbOddNumber as fc.Arbitrary<number>).map((v): Op => ({ t: 'SAVE_VER', v })) },
  { weight: 4, arbitrary: fc.record({ t: fc.constant('RULES_VER' as const), v: fc.oneof(fc.constantFrom(0, RULES_VERSION + 1, RULES_VERSION - 1, 99), fc.integer({ min: -5, max: 500 })), both: fc.boolean() }) },
  { weight: 3, arbitrary: fc.record({ t: fc.constant('FIELD' as const), name: fc.constantFrom('format', 'saveVersion', 'rulesVersion', 'seed', 'savedAtIso', 'config', 'actions'), value: arbFieldValue }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('PROTO' as const), at: arbIndex, key: fc.constantFrom('__proto__', 'constructor', 'prototype'), nested: fc.boolean() }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('ACTION' as const), at: arbIndex, kind: fc.nat({ max: 40 }) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('SEAT' as const), at: arbIndex, kind: fc.nat({ max: 40 }) }) },
);

function put(container: Obj, key: Key, value: unknown): void {
  if (Array.isArray(container)) container[Number(key)] = value;
  else Object.defineProperty(container, String(key), { value, writable: true, enumerable: true, configurable: true });
}

function locate(root: unknown, path: readonly Key[]): { parent: Obj; key: Key } | undefined {
  let node = root;
  for (let i = 0; i < path.length - 1; i++) {
    if (!isObj(node) || !Object.hasOwn(node, path[i] as Key)) return undefined;
    node = node[path[i] as string];
  }
  const last = path[path.length - 1] as Key;
  return isObj(node) && Object.hasOwn(node, last) ? { parent: node, key: last } : undefined;
}

function nodeAt(root: unknown, path: readonly Key[]): unknown {
  if (path.length === 0) return root;
  const loc = locate(root, path);
  return loc ? loc.parent[loc.key as string] : undefined;
}

const isPrefix = (a: readonly Key[], b: readonly Key[]): boolean => a.length <= b.length && a.every((k, i) => k === b[i]);
const pick = <T>(list: readonly T[], at: number): T | undefined => (list.length === 0 ? undefined : list[at % list.length]);

/** Malformed action entries, including duplicate/invalid Guess submissions. `base` is a valid action of the log. */
function malformedAction(kind: number, base: unknown): unknown {
  const b = isObj(base) ? (structuredClone(base) as Obj) : {};
  const variants: ((o: Obj) => unknown)[] = [
    () => null, () => [], () => 7, () => 'PLACE', () => ({}), () => ({ type: 'NOPE' }), () => ({ type: 'place' }), () => ({ type: 'ACK_REVEAL', extra: 1 }),
    (o) => ({ ...o, extra: true }),
    (o) => { const { type: _t, ...rest } = o; return rest; },
    (o) => ({ ...o, type: 'PLACE' }),
    (o) => ({ ...o, player: 'P9' }),
    (o) => ({ ...o, player: 0 }),
    (o) => ({ ...o, card: 'Z-99' }),
    (o) => ({ ...o, card: 'H-1' }),
    (o) => ({ ...o, orientation: 90 }),
    (o) => ({ ...o, orientation: '0' }),
    (o) => ({ ...o, pos: { row: 8, col: 0 } }),
    (o) => ({ ...o, pos: { row: 0.5, col: 0 } }),
    (o) => ({ ...o, pos: { row: 0, col: 0, z: 1 } }),
    (o) => ({ ...o, pos: [0, 0] }),
    (o) => ({ ...o, guesses: [] }),
    (o) => ({ ...o, guesses: null }),
    (o) => ({ ...o, guesses: { Z9: 10 } }),
    (o) => ({ ...o, guesses: { A1: '10' } }),
    (o) => ({ ...o, guesses: { A1: null } }),
    (o) => ({ type: 'SUBMIT_GUESSES', player: 'P0', guesses: { A1: 3 } }),
    (o) => ({ type: 'SUBMIT_GUESSES', player: 'P0', guesses: { A1: 53 } }),
    (o) => ({ type: 'SUBMIT_GUESSES', player: 'P0', guesses: { A1: 7.5 } }),
    (o) => ({ type: 'SUBMIT_GUESSES', player: 'P0', guesses: {} }),
    (o) => ({ type: 'SUBMIT_GUESSES', player: 'P0', guesses: { A1: 10, A1x: 3 } }),
    (o) => ({ type: 'SUBMIT_GUESSES', player: 'P1', guesses: { A1: 10, B2: 20 } }),
    (o) => ({ type: 'SUBMIT_GUESSES', player: 'P0', guesses: { A1: 1e308 } }),
    (o) => ({ type: 'PLACE', player: 'P0', card: 'H-A', pos: { row: 0, col: 0 }, orientation: 0 }),
    (o) => ({ type: 'PLACE', player: 'P0', card: 'S-10', pos: { row: 7, col: 7 }, orientation: 180 }),
    (o) => ({ type: 'ACK_REVEAL' }),
    () => ({ type: 'SUBMIT_GUESSES', player: 'P0' }),
    () => ({ type: 'PLACE' }),
    (o) => JSON.parse(JSON.stringify({ ...o, guesses: { ['__proto__']: 5 } })) as unknown,
    (o) => ({ ...o, __proto__x: 1 }),
    (o) => [o],
    (o) => ({ type: ['PLACE'] }),
    (o) => ({ ...o, player: ['P0'] }),
    (o) => ({ ...o, orientation: null }),
  ];
  return (variants[kind % variants.length] as (o: Obj) => unknown)(b);
}

/** Seat-level and config-level damage. */
function mutateSeats(config: Obj, at: number, kind: number): void {
  const seats = config.seats;
  if (!Array.isArray(seats)) return;
  const i = at % Math.max(1, seats.length);
  const seat = seats[i] as Obj | undefined;
  const steps: (() => void)[] = [
    () => { seats.splice(i, 1); },
    () => { seats.push(structuredClone(seats[0])); },
    () => { const j = (i + 1) % seats.length; const t = seats[i]; seats[i] = seats[j]; seats[j] = t; },
    () => { if (seat) put(seat, 'id', 'P9'); },
    () => { if (seat) put(seat, 'id', SEATS[(i + 1) % 4] as string); },
    () => { if (seat) put(seat, 'kind', 'ROBOT'); },
    () => { if (seat) put(seat, 'kind', 'HUMAN'); },
    () => { if (seat) put(seat, 'kind', 'AI'); },
    () => { if (seat) put(seat, 'difficulty', 'EASY'); },
    () => { if (seat) put(seat, 'difficulty', 'EXPERT'); },
    () => { if (seat) put(seat, 'difficulty', 'ADVANCED'); },
    () => { if (seat) delete seat.difficulty; },
    () => { if (seat) delete seat.name; },
    () => { if (seat) put(seat, 'name', 5); },
    () => { if (seat) put(seat, 'name', 'x'.repeat(200)); },
    () => { if (seat) put(seat, 'name', 'x'.repeat(201)); },
    () => { if (seat) put(seat, 'extra', 1); },
    () => { put(config, 'identityVisibility', 'SIDEWAYS'); },
    () => { put(config, 'identityVisibility', 'FACE_UP'); },
    () => { put(config, 'scoreConfig', null); },
    () => { const sc = config.scoreConfig; if (isObj(sc) && isObj(sc.config)) put(sc.config, 'rewardByError', 'x'); },
    () => { const sc = config.scoreConfig; if (isObj(sc) && isObj(sc.config)) put(sc.config, 'rewardByError', []); },
    () => { const sc = config.scoreConfig; if (isObj(sc) && isObj(sc.config)) put(sc.config, 'rewardByError', Array.from({ length: 65 }, () => 1)); },
    () => { const sc = config.scoreConfig; if (isObj(sc) && isObj(sc.config)) put(sc.config, 'handEmptyBonus', null); },
    () => { const sc = config.scoreConfig; if (isObj(sc)) put(sc, 'provisional', 'yes'); },
    () => { const sc = config.scoreConfig; if (isObj(sc)) put(sc, 'id', 'y'.repeat(201)); },
  ];
  (steps[kind % steps.length] as () => void)();
}

function applyOp(root: unknown, op: Op, fx: Fixture): unknown {
  if (!isObj(root) || Array.isArray(root)) return root;
  const tree = root;
  const actions = Array.isArray(tree.actions) ? (tree.actions as unknown[]) : undefined;
  switch (op.t) {
    case 'NOOP':
      return tree;
    case 'TRIM_ACTIONS':
      if (actions) actions.length = op.at % (actions.length + 1);
      return tree;
    case 'SEED':
      put(tree, 'seed', op.v);
      return tree;
    case 'ISO':
      put(tree, 'savedAtIso', op.v);
      return tree;
    case 'GUESS': {
      const loc = locate(tree, pick(fx.guessPaths, op.at) ?? []);
      if (loc) put(loc.parent, loc.key, op.v);
      return tree;
    }
    case 'SWAP_ACTIONS':
      if (actions && actions.length > 0) {
        const i = op.a % actions.length;
        const j = op.b % actions.length;
        const t = actions[i];
        actions[i] = actions[j];
        actions[j] = t;
      }
      return tree;
    case 'DUP_ACTION':
      if (actions && actions.length > 0) actions.splice(op.b % (actions.length + 1), 0, structuredClone(actions[op.a % actions.length]));
      return tree;
    case 'DELETE': {
      const loc = locate(tree, pick(fx.paths, op.at) ?? []);
      if (loc) {
        if (Array.isArray(loc.parent)) loc.parent.splice(Number(loc.key), 1);
        else delete loc.parent[loc.key as string];
      }
      return tree;
    }
    case 'ADD_KEY': {
      const target = nodeAt(tree, pick(fx.objectPaths, op.at) ?? []);
      if (isObj(target) && !Array.isArray(target)) put(target, op.key, op.value);
      return tree;
    }
    case 'REPLACE': {
      const path = pick(fx.paths, op.at) ?? [];
      const loc = locate(tree, path);
      if (loc) put(loc.parent, loc.key, op.value);
      return tree;
    }
    case 'SWAP_NODES': {
      const pa = pick(fx.paths, op.a) ?? [];
      const pb = pick(fx.paths, op.b) ?? [];
      const la = locate(tree, pa);
      const lb = locate(tree, pb);
      if (la && lb && !isPrefix(pa, pb) && !isPrefix(pb, pa)) {
        const va = la.parent[la.key as string];
        const vb = lb.parent[lb.key as string];
        put(la.parent, la.key, vb);
        put(lb.parent, lb.key, va);
      }
      return tree;
    }
    case 'SAVE_VER':
      put(tree, 'saveVersion', op.v);
      return tree;
    case 'RULES_VER':
      put(tree, 'rulesVersion', op.v);
      if (op.both && isObj(tree.config) && !Array.isArray(tree.config)) put(tree.config, 'rulesVersion', op.v);
      return tree;
    case 'FIELD':
      put(tree, op.name, op.value);
      return tree;
    case 'PROTO': {
      const node = nodeAt(tree, pick(fx.objectPaths, op.at) ?? []);
      if (isObj(node) && !Array.isArray(node)) put(node, op.key, op.nested ? { polluted: true } : 'polluted');
      return tree;
    }
    case 'ACTION':
      if (actions) {
        if (actions.length === 0) actions.push(malformedAction(op.kind, {}));
        else {
          const i = op.at % actions.length;
          actions[i] = malformedAction(op.kind, actions[i]);
        }
      }
      return tree;
    case 'SEAT':
      if (isObj(tree.config) && !Array.isArray(tree.config)) mutateSeats(tree.config, op.at, op.kind);
      return tree;
  }
}

const WRAPS: readonly string[] = ['', '', '', ' \n\t', '\ufeff', '\0'];

interface MutatedText {
  readonly fixture: number;
  readonly ops: readonly Op[];
  readonly indent: number | string | undefined;
  readonly wrap: number;
  readonly rootReplace: unknown;
  readonly useRootReplace: boolean;
}

const arbMutated: fc.Arbitrary<MutatedText> = fc.record({
  fixture: fc.oneof(
    { weight: 4, arbitrary: fc.constant(0) },
    { weight: 3, arbitrary: fc.constant(1) },
    { weight: 2, arbitrary: fc.constant(2) },
    { weight: 2, arbitrary: fc.constant(3) },
    { weight: 1, arbitrary: fc.constant(4) },
  ),
  ops: fc.oneof(
    { weight: 6, arbitrary: fc.array(arbOp, { minLength: 1, maxLength: 1 }) },
    { weight: 3, arbitrary: fc.array(arbOp, { minLength: 2, maxLength: 2 }) },
    { weight: 1, arbitrary: fc.array(arbOp, { minLength: 3, maxLength: 4 }) },
  ),
  indent: fc.constantFrom<number | string | undefined>(undefined, undefined, undefined, 0, 2, '\t'),
  wrap: fc.nat({ max: WRAPS.length - 1 }),
  rootReplace: arbJson,
  useRootReplace: fc.integer({ min: 0, max: 40 }).map((n) => n === 0),
});

/** Builds the text of a mutation. Never throws (cyclic or unserializable results become `null`). */
function mutatedText(m: MutatedText, shape: (tree: Obj, fx: Fixture) => Obj = (t) => t): string {
  const fx = fixtures()[m.fixture] as Fixture;
  let root: unknown = shape(JSON.parse(fx.text) as Obj, fx);
  for (const op of m.ops) root = applyOp(root, op, fx);
  if (m.useRootReplace) root = m.rootReplace;
  let json: string | undefined;
  try {
    json = JSON.stringify(root, null, m.indent);
  } catch {
    json = undefined;
  }
  return `${WRAPS[m.wrap] as string}${json ?? 'null'}`;
}

// ---------------------------------------------------------------------------------------------------------
// Postconditions of Property 28
// ---------------------------------------------------------------------------------------------------------

type Outcome = 'OK_REPLAY_OK' | 'OK_REPLAY_REJECTED' | 'CORRUPT' | 'INCOMPATIBLE_SAVE_VERSION' | 'INCOMPATIBLE_RULES_VERSION';

/** Parses `text` with the production constants and checks every postcondition. Returns the outcome class. */
function inspectText(text: string): Outcome {
  let parsed: ParsedSave;
  try {
    parsed = parseSave(text);
  } catch {
    return fail('parseSave threw');
  }
  switch (parsed.kind) {
    case 'CORRUPT':
      expect(Object.keys(parsed)).toEqual(['kind']);
      return 'CORRUPT';
    case 'INCOMPATIBLE':
      if (parsed.reason !== 'SAVE_VERSION' && parsed.reason !== 'RULES_VERSION') fail(`unexpected INCOMPATIBLE reason ${String(parsed.reason)}`);
      return parsed.reason === 'SAVE_VERSION' ? 'INCOMPATIBLE_SAVE_VERSION' : 'INCOMPATIBLE_RULES_VERSION';
    case 'MIGRATED':
      return fail('MIGRATED with the production constants (the migration registry is empty)');
    case 'OK': {
      const envelope = parsed.envelope;
      const first = serializeSave(envelope);
      if (serializeSave(envelope) !== first) fail('serializeSave is not deterministic');
      const again = parseSave(first);
      if (again.kind !== 'OK') fail(`parseSave(serializeSave(OK envelope)) is ${again.kind}`);
      expect(again.envelope).toEqual(envelope);
      let replayed: ReturnType<typeof replay>;
      try {
        replayed = replay(envelope.seed, envelope.config, envelope.actions);
      } catch {
        return fail('replay threw for an OK envelope');
      }
      return replayed.ok ? 'OK_REPLAY_OK' : 'OK_REPLAY_REJECTED';
    }
  }
}

const OUTCOMES: readonly Outcome[] = ['OK_REPLAY_OK', 'OK_REPLAY_REJECTED', 'CORRUPT', 'INCOMPATIBLE_SAVE_VERSION', 'INCOMPATIBLE_RULES_VERSION'];
const zeroOutcomes = (): Record<Outcome, number> => ({ OK_REPLAY_OK: 0, OK_REPLAY_REJECTED: 0, CORRUPT: 0, INCOMPATIBLE_SAVE_VERSION: 0, INCOMPATIBLE_RULES_VERSION: 0 });
const total = (t: Record<Outcome, number>): number => OUTCOMES.reduce((sum, k) => sum + t[k], 0);

// ---------------------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------------------

const P27_GROUP_TALLY: Record<string, Tally27> = {};
const P27_PARTS_DONE: Record<string, number> = {};

function addTally27(into: Tally27, from: Tally27): void {
  for (const key of ['cases', 'emptyLog', 'nonEmptyLog', 'twoCodeBatches', 'twoCodePartial', 'seedZero', 'seedMax', 'seedBoundary', 'expertSeats'] as const) into[key] += from[key];
  for (const key of ['phase', 'gcSubmitted', 'humans', 'visibility'] as const) for (const [k, n] of Object.entries(from[key])) into[key][k] = (into[key][k] ?? 0) + n;
  into.maxLogLength = Math.max(into.maxLogLength, from.maxLogLength);
}

/** One Property 27 it (NUM_RUNS_P27 cases) with the guards a part is large enough for; adds its tally to its group. */
function runProperty27Part(group: string, part: number, seed: number): void {
  const before = protoSnapshot();
  const tally = newTally27();
  const label = `${group}.${part + 1}`;
  const ms = runProperty(label, arbCase27, (c) => checkRoundTrip(c, tally), seed, NUM_RUNS_P27);
  REPORT[label] = { seed, numRuns: NUM_RUNS_P27, ms, ...tally };
  const where = JSON.stringify(tally);
  expect(tally.cases, where).toBe(NUM_RUNS_P27);
  expect(tally.nonEmptyLog, where).toBeGreaterThanOrEqual(MIN_PART27.nonEmpty);
  expect(Object.keys(tally.phase).length, where).toBeGreaterThanOrEqual(MIN_PART27.phases);
  expect(tally.expertSeats, where).toBe(0);
  expectNoPollution(before);
  addTally27((P27_GROUP_TALLY[group] ??= newTally27()), tally);
  P27_PARTS_DONE[group] = (P27_PARTS_DONE[group] ?? 0) + 1;
}

/** The coverage guards of one Property 27 group (NUM_RUNS_P27_GROUP cases; thresholds well under the measured values, see docs). */
function checkGroup27(group: string): void {
  const tally = P27_GROUP_TALLY[group] ?? newTally27();
  const where = `${group} ${JSON.stringify(tally)}`;
  expect(tally.cases, where).toBe(NUM_RUNS_P27_GROUP);
  expect(tally.phase.PLACEMENT ?? 0, where).toBeGreaterThanOrEqual(MIN.placement);
  expect(tally.phase.GUESS_COLLECT ?? 0, where).toBeGreaterThanOrEqual(MIN.guessCollect);
  expect(tally.phase.REVEAL ?? 0, where).toBeGreaterThanOrEqual(MIN.reveal);
  expect(tally.phase.ENDED ?? 0, where).toBeGreaterThanOrEqual(MIN.ended);
  expect(tally.emptyLog, where).toBeGreaterThanOrEqual(MIN.empty);
  expect(tally.nonEmptyLog, where).toBeGreaterThanOrEqual(MIN.nonEmpty);
  for (const n of ['0', '1', '2', '3']) expect(tally.gcSubmitted[n] ?? 0, `submitted=${n} ${where}`).toBeGreaterThanOrEqual(MIN.gcPerSubmitted);
  expect(tally.twoCodeBatches, where).toBeGreaterThanOrEqual(MIN.twoCode);
  expect(tally.twoCodePartial, where).toBeGreaterThanOrEqual(1);
  for (const n of ['1', '2', '3', '4']) expect(tally.humans[n] ?? 0, `humans=${n} ${where}`).toBeGreaterThanOrEqual(MIN.perHumans);
  for (const v of ['OWNER_ONLY', 'FACE_UP']) expect(tally.visibility[v] ?? 0, `${v} ${where}`).toBeGreaterThanOrEqual(MIN.perVisibility);
  expect(tally.seedZero, where).toBeGreaterThanOrEqual(1);
  expect(tally.seedMax, where).toBeGreaterThanOrEqual(1);
  expect(tally.seedBoundary, where).toBeGreaterThanOrEqual(MIN.seedBoundary);
  expect(tally.expertSeats, where).toBe(0);
}

/** Minimum counts of the per-it guards of Property 27 (out of NUM_RUNS_P27 cases). */
const MIN_PART27 = {
  nonEmpty: 8,
  phases: 2,
};

/** Minimum counts of the group guards of Property 27 (out of NUM_RUNS_P27_GROUP cases per group). */
const MIN = {
  placement: 6,
  guessCollect: 10,
  reveal: 3,
  ended: 3,
  empty: 1,
  nonEmpty: 40,
  gcPerSubmitted: 2,
  twoCode: 3,
  perHumans: 4,
  perVisibility: 15,
  seedBoundary: 6,
};

describe('Property 27: save round trip (task 20.3)', () => {
  for (const [group, seeds] of SEED_P27_GROUPS) {
    seeds.forEach((seed, part) => {
      it(`serializeSave -> parseSave -> replay reproduces every reachable state, whatever its phase (${group} part ${part + 1}/${seeds.length}, seed ${seed})`, () => {
        runProperty27Part(group, part, seed);
      });
    });
  }

  it('documents the ENDED policy (not part of Property 27): saveGame removes the save, loadGame discards GAME_ENDED', () => {
    const ended = (fixtures()[0] as Fixture).state;
    expect(ended.phase).toBe('ENDED');
    const text = serializeSave(envelopeOf(ended, NOW));
    // The format and replay round trip still holds for an ENDED log.
    const parsed = parseSave(text);
    expect(parsed.kind).toBe('OK');
    const store = memoryStore({ [PREFS_KEY]: '{"prefsVersion":1,"language":null,"setup":null}' });
    const active = replay(ended.seed, ended.config, []);
    if (!active.ok) throw new Error('invalid test fixture');
    expect(saveGame(store, active.value, NOW).ok).toBe(true);
    expect(saveGame(store, ended, NOW)).toEqual({ ok: true, durable: false });
    expect(store.getItem(SAVE_KEY)).toBeNull();
    expect(store.getItem(PREFS_KEY)).not.toBeNull();
    const loaded = loadGame(memoryStore({ [SAVE_KEY]: text }));
    expect(loaded).toEqual({ kind: 'DISCARDED', reason: 'GAME_ENDED', removed: true });
  });
});

describe('Property 28: parser robustness (task 20.3)', () => {
  it('arbitrary strings and JSON texts never throw and give one of the four kinds', () => {
    const before = protoSnapshot();
    const tally = zeroOutcomes();
    const savePrefix = '{"format":"qroker-save","saveVersion":1,"rulesVersion":1,';
    const safeStringify = (v: unknown): string => {
      try {
        return JSON.stringify(v) ?? 'null';
      } catch {
        return 'null';
      }
    };
    const arbText: fc.Arbitrary<string> = fc.oneof(
      fc.string(),
      fc.string({ unit: 'binary' }),
      fc.string({ unit: 'grapheme' }),
      fc.string({ unit: 'binary-ascii' }),
      fc.string({ unit: 'binary', minLength: 1, maxLength: 3 }),
      fc.constantFrom('', ' ', '\0', '\ud800', '\udc00', '\ud800\ud800', '{', '}', '[]', 'null', '{}', '0', '-0', '"x"', 'true', '[[[[', '{"a":'),
      fc.json(),
      fc.jsonValue().map(safeStringify),
      fc.anything().map(safeStringify),
      fc.string({ unit: 'binary', maxLength: 40 }).map((s) => `${savePrefix}${s}`),
      fc.jsonValue({ maxDepth: 2 }).map((v) => `${savePrefix}"seed":${safeStringify(v)}}`),
    );
    const ms = runProperty('P28 strings', arbText, (text) => {
      tally[inspectText(text)]++;
    }, SEED_P28_STRINGS, NUM_RUNS_STRINGS);
    REPORT.p28Strings = { numRuns: NUM_RUNS_STRINGS, ms, ...tally };
    expect(total(tally)).toBe(NUM_RUNS_STRINGS);
    expect(tally.CORRUPT, JSON.stringify(tally)).toBeGreaterThanOrEqual(Math.floor(NUM_RUNS_STRINGS * 0.9));
    expectNoPollution(before);
  });

  // One it per fixture: all strict prefixes in a single it took 3 s under CPU contention.
  FIXTURE_NAMES.forEach((name, index) => it(`every strict prefix of the ${name} fixture save is CORRUPT`, () => {
    const before = protoSnapshot();
    const fixture = fixtures()[index] as Fixture;
    expect(fixture.name).toBe(name);
    const text = fixture.text;
    let prefixes = 0;
    for (let n = 0; n < text.length; n++) {
      const outcome = inspectText(text.slice(0, n));
      if (outcome !== 'CORRUPT') fail(`prefix of length ${n}/${text.length} of fixture ${name} was ${outcome}`);
      prefixes++;
    }
    expect(prefixes).toBe(text.length);
    expect(inspectText(text)).toBe('OK_REPLAY_OK');
    REPORT[`p28Prefixes${name}`] = prefixes;
    expectNoPollution(before);
  }));

  it('random truncations of valid saves obey the postconditions', () => {
    const before = protoSnapshot();
    const prefixes = fixtures().reduce((sum, f) => sum + f.text.length, 0);
    const tally = zeroOutcomes();
    const ms = runProperty(
      'P28 truncation',
      fc.record({ fixture: fc.nat({ max: 4 }), cut: fc.nat({ max: 1_000_000 }), tail: fc.constantFrom('', '', ' ', '}', ']}', 'null', '\0') }),
      ({ fixture, cut, tail }) => {
        const text = (fixtures()[fixture] as Fixture).text;
        const n = cut % (text.length + 1);
        const outcome = inspectText(`${text.slice(0, n)}${tail}`);
        tally[outcome]++;
        if (n < text.length && (tail === '' || tail === ' ') && outcome !== 'CORRUPT') fail(`strict prefix ${n}/${text.length} was ${outcome}`);
      },
      SEED_P28_TRUNC,
      NUM_RUNS_TRUNC,
    );
    REPORT.p28Truncation = { numRuns: NUM_RUNS_TRUNC, ms, exhaustivePrefixes: prefixes, ...tally };
    expect(prefixes).toBeGreaterThan(1000);
    expect(tally.CORRUPT, JSON.stringify(tally)).toBeGreaterThan(NUM_RUNS_TRUNC * 0.8);
    expectNoPollution(before);
  });

  SEED_P28_MUT_PARTS.forEach((seed, part) => it(`structure-aware mutations of valid saves: every outcome class is reached, OK replays both ways (part ${part + 1}/${SEED_P28_MUT_PARTS.length}, seed ${seed})`, () => {
    const before = protoSnapshot();
    const tally = zeroOutcomes();
    const byFixture: Record<string, number> = {};
    const ms = runProperty(`P28 mutations part ${part + 1}`, arbMutated, (m) => {
      const outcome = inspectText(mutatedText(m));
      tally[outcome]++;
      bump(byFixture, (fixtures()[m.fixture] as Fixture).name);
    }, seed, NUM_RUNS_MUT);
    REPORT[`p28Mutations${part + 1}`] = { seed, numRuns: NUM_RUNS_MUT, ms, ...tally };
    const where = `${JSON.stringify(tally)} ${JSON.stringify(byFixture)}`;
    expect(total(tally), where).toBe(NUM_RUNS_MUT);
    expect(tally.OK_REPLAY_OK, where).toBeGreaterThanOrEqual(MIN28.replayOk);
    expect(tally.OK_REPLAY_REJECTED, where).toBeGreaterThanOrEqual(MIN28.replayRejected);
    expect(tally.CORRUPT, where).toBeGreaterThanOrEqual(MIN28.corrupt);
    expect(tally.INCOMPATIBLE_SAVE_VERSION, where).toBeGreaterThanOrEqual(MIN28.incompatibleSave);
    expect(tally.INCOMPATIBLE_RULES_VERSION, where).toBeGreaterThanOrEqual(MIN28.incompatibleRules);
    expectNoPollution(before);
  }));

  it('deeply nested arrays and objects, alone and inside a save, are CORRUPT without throwing', () => {
    const before = protoSnapshot();
    const base = JSON.parse((fixtures()[4] as Fixture).text) as Obj;
    const tally = zeroOutcomes();
    const nest = (kind: number, depth: number): string => {
      switch (kind % 3) {
        case 0:
          return '['.repeat(depth) + ']'.repeat(depth);
        case 1:
          return '{"a":'.repeat(depth) + '1' + '}'.repeat(depth);
        default:
          return '[{"a":'.repeat(depth) + 'null' + '}]'.repeat(depth);
      }
    };
    const ms = runProperty(
      'P28 depth',
      fc.record({ kind: fc.nat({ max: 8 }), depth: fc.oneof(fc.integer({ min: 1, max: 60 }), fc.integer({ min: 1, max: 4000 })), field: fc.constantFrom('actions', 'seed', 'config', 'savedAtIso', 'extra', 'format') }),
      ({ kind, depth, field }) => {
        const placeholder = { ...base, [field]: '@@DEEP@@' };
        const text = kind < 3 ? nest(kind, depth) : JSON.stringify(placeholder).replace('"@@DEEP@@"', nest(kind, depth));
        const outcome = inspectText(text);
        tally[outcome]++;
        if (outcome !== 'CORRUPT') fail(`a nested value gave ${outcome} (kind ${kind}, depth ${depth}, field ${field})`);
      },
      SEED_P28_DEPTH,
      NUM_RUNS_DEPTH,
    );
    REPORT.p28Depth = { numRuns: NUM_RUNS_DEPTH, ms, ...tally };
    expect(tally.CORRUPT).toBe(NUM_RUNS_DEPTH);
    expectNoPollution(before);
  });

  it('oversized inputs at and around MAX_SAVE_TEXT_LENGTH and MAX_ACTIONS (built once)', () => {
    const before = protoSnapshot();
    const fx = fixtures()[4] as Fixture;
    const valid = fx.text;
    // Valid JSON padded with whitespace to exactly the limit is accepted; one more character is not.
    const atLimit = valid + ' '.repeat(MAX_SAVE_TEXT_LENGTH - valid.length);
    expect(atLimit.length).toBe(MAX_SAVE_TEXT_LENGTH);
    expect(inspectText(atLimit)).toBe('OK_REPLAY_OK');
    expect(inspectText(`${atLimit} `)).toBe('CORRUPT');
    expect(inspectText(' '.repeat(MAX_SAVE_TEXT_LENGTH + 1))).toBe('CORRUPT');
    expect(inspectText('x'.repeat(MAX_SAVE_TEXT_LENGTH + 1))).toBe('CORRUPT');
    expect(inspectText('x'.repeat(MAX_SAVE_TEXT_LENGTH))).toBe('CORRUPT');
    // Nesting at the length limit (about 500,000 levels): CORRUPT, whether JSON.parse overflows or not.
    const half = MAX_SAVE_TEXT_LENGTH / 2;
    expect(inspectText('['.repeat(half) + ']'.repeat(half))).toBe('CORRUPT');
    expect(inspectText('['.repeat(MAX_SAVE_TEXT_LENGTH))).toBe('CORRUPT');
    expect(inspectText('{"a":'.repeat(150_000) + '1' + '}'.repeat(150_000))).toBe('CORRUPT');
    // Actions: exactly MAX_ACTIONS entries pass the parser; the engine rejects them at index 0; one more is CORRUPT.
    const withActions = (n: number): string => JSON.stringify({ ...(JSON.parse(valid) as Obj), actions: Array.from({ length: n }, () => ({ type: 'ACK_REVEAL' })) });
    expect(inspectText(withActions(MAX_ACTIONS))).toBe('OK_REPLAY_REJECTED');
    expect(inspectText(withActions(MAX_ACTIONS + 1))).toBe('CORRUPT');
    expect(loadGame(memoryStore({ [SAVE_KEY]: withActions(MAX_ACTIONS) }))).toEqual({ kind: 'DISCARDED', reason: 'REPLAY_REJECTED', removed: true });
    // Seat names: 200 code units are accepted and round trip, 201 are CORRUPT.
    const withName = (n: number): string => {
      const tree = JSON.parse(valid) as { config: { seats: Obj[] } };
      (tree.config.seats[0] as Obj).name = 'n'.repeat(n);
      return JSON.stringify(tree);
    };
    expect(inspectText(withName(200))).toBe('OK_REPLAY_OK');
    expect(inspectText(withName(201))).toBe('CORRUPT');
    expectNoPollution(before);
  });

  it('parseSaveWith with a test-only migration registry: MIGRATED output is valid and never throws', () => {
    const before = protoSnapshot();
    const TEST_VERSION = 3;
    // Invented old shapes: version 1 called the log `moves`; version 2 renamed it `actions` and had no other change.
    const migrations: Readonly<Record<number, (old: unknown) => unknown>> = {
      1: (old) => {
        const { moves, ...rest } = old as Obj;
        if (!Array.isArray(moves)) throw new Error('moves is not a list');
        return { ...rest, actions: moves, saveVersion: 2 };
      },
      2: (old) => ({ ...(old as Obj), saveVersion: 3 }),
    };
    const options = { saveVersion: TEST_VERSION, rulesVersion: RULES_VERSION, migrations };
    const toOld = (from: number) => (tree: Obj): Obj => {
      const out: Obj = {};
      for (const key of Object.keys(tree)) put(out, from === 1 && key === 'actions' ? 'moves' : key, key === 'saveVersion' ? from : tree[key]);
      return out;
    };
    const tally: Record<string, number> = { OK: 0, MIGRATED_FROM_1: 0, MIGRATED_FROM_2: 0, CORRUPT: 0, INCOMPATIBLE_SAVE_VERSION: 0, INCOMPATIBLE_RULES_VERSION: 0 };
    const ms = runProperty(
      'P28 migration',
      fc.record({ m: arbMutated, from: fc.constantFrom(1, 1, 2, 2, 3) }),
      ({ m, from }) => {
        // Mutation paths of the fixture are in the new shape; the old shape differs only in the top-level key name.
        const text = mutatedText(m, (tree) => toOld(from)(tree));
        const result = parseSaveWith(text, options);
        switch (result.kind) {
          case 'CORRUPT':
            tally.CORRUPT = (tally.CORRUPT ?? 0) + 1;
            return;
          case 'INCOMPATIBLE':
            if (result.reason !== 'SAVE_VERSION' && result.reason !== 'RULES_VERSION') fail('bad reason');
            bump(tally, `INCOMPATIBLE_${result.reason}`);
            return;
          case 'OK':
          case 'MIGRATED': {
            const stored = (JSON.parse(text.replace(/^[\ufeff\0]/, '')) as Obj).saveVersion;
            if (result.kind === 'MIGRATED') {
              if (result.fromVersion !== stored || (stored !== 1 && stored !== 2)) fail(`fromVersion ${result.fromVersion} but the text says ${String(stored)}`);
              bump(tally, `MIGRATED_FROM_${result.fromVersion}`);
            } else {
              if (stored !== TEST_VERSION) fail('OK for a text that is not at the current version');
              tally.OK = (tally.OK ?? 0) + 1;
            }
            expect(result.envelope.saveVersion).toBe(TEST_VERSION);
            expect(result.envelope.rulesVersion).toBe(RULES_VERSION);
            const again = parseSaveWith(serializeSave(result.envelope), options);
            if (again.kind !== 'OK') fail(`re-parse of the migrated envelope is ${again.kind}`);
            expect(again.envelope).toEqual(result.envelope);
            if (Object.keys(result.envelope).join() !== 'format,saveVersion,rulesVersion,savedAtIso,seed,config,actions') fail('envelope keys');
            // Migrated logs may replay or be rejected, but must not throw.
            replay(result.envelope.seed, result.envelope.config, result.envelope.actions);
          }
        }
      },
      SEED_P28_MIGRATE,
      NUM_RUNS_MIGRATE,
    );
    REPORT.p28Migration = { numRuns: NUM_RUNS_MIGRATE, ms, ...tally };
    const where = JSON.stringify(tally);
    expect((tally.MIGRATED_FROM_1 ?? 0), where).toBeGreaterThanOrEqual(MIN28.migratedPerVersion);
    expect((tally.MIGRATED_FROM_2 ?? 0), where).toBeGreaterThanOrEqual(MIN28.migratedPerVersion);
    expect(tally.CORRUPT, where).toBeGreaterThanOrEqual(MIN28.corruptMigration);
    expect(tally.INCOMPATIBLE_SAVE_VERSION, where).toBeGreaterThanOrEqual(1);
    expect(tally.INCOMPATIBLE_RULES_VERSION, where).toBeGreaterThanOrEqual(1);
    expectNoPollution(before);
  });

  const runLoadProperty = (part: number, seed: number): void => {
    const before = protoSnapshot();
    const PREFS = '{"prefsVersion":1,"language":"ko","setup":{"a":1}}';
    const kinds: Record<string, number> = {};
    const ms = runProperty(`P28 loadGame part ${part}`, arbMutated, (m) => {
      const text = mutatedText(m);
      const store = memoryStore({ [SAVE_KEY]: text, [PREFS_KEY]: PREFS });
      const result = loadGame(store);
      if (store.getItem(PREFS_KEY) !== PREFS) fail('loadGame changed the preferences');
      const parsed = parseSave(text);
      switch (result.kind) {
        case 'NONE':
          return fail('NONE although a text is stored');
        case 'DISCARDED': {
          bump(kinds, `DISCARDED_${result.reason}`);
          if (store.getItem(SAVE_KEY) !== null || !result.removed) fail('a discarded save was not removed');
          if (parsed.kind === 'CORRUPT' && result.reason !== 'CORRUPT') fail(`CORRUPT text discarded as ${result.reason}`);
          if (parsed.kind === 'INCOMPATIBLE' && result.reason !== parsed.reason) fail(`INCOMPATIBLE text discarded as ${result.reason}`);
          if (parsed.kind === 'OK' && result.reason !== 'REPLAY_REJECTED' && result.reason !== 'GAME_ENDED') fail(`OK text discarded as ${result.reason}`);
          if (parsed.kind === 'OK') {
            const r = replay(parsed.envelope.seed, parsed.envelope.config, parsed.envelope.actions);
            if (result.reason === 'REPLAY_REJECTED' && r.ok) fail('REPLAY_REJECTED but the replay is ok');
            if (result.reason === 'GAME_ENDED' && !(r.ok && r.value.phase === 'ENDED')) fail('GAME_ENDED but the replay does not end');
          }
          return;
        }
        case 'RESUMABLE': {
          bump(kinds, 'RESUMABLE');
          if (parsed.kind !== 'OK') fail(`RESUMABLE for a text that parses as ${parsed.kind}`);
          const r = replay(parsed.envelope.seed, parsed.envelope.config, parsed.envelope.actions);
          if (!r.ok) fail('RESUMABLE but the replay is rejected');
          expect(stateEquals(result.state, r.value)).toBe(true);
          expect(result.envelope).toEqual(parsed.envelope);
          if (result.state.phase === 'ENDED') fail('RESUMABLE for an ENDED state');
          if (store.getItem(SAVE_KEY) !== text) fail('a resumable load changed the save');
        }
      }
    }, seed, NUM_RUNS_LOAD);
    REPORT[`p28Load${part + 1}`] = { seed, numRuns: NUM_RUNS_LOAD, ms, ...kinds };
    for (const [k, n] of Object.entries(kinds)) LOAD_TOTAL[k] = (LOAD_TOTAL[k] ?? 0) + n;
    loadPartsDone++;
    const where = JSON.stringify(kinds);
    const discards = Object.keys(kinds).filter((k) => k.startsWith('DISCARDED_') && k !== 'DISCARDED_CORRUPT').length;
    expect(Object.values(kinds).reduce((a, b) => a + b, 0), where).toBe(NUM_RUNS_LOAD);
    expect(kinds.RESUMABLE ?? 0, where).toBeGreaterThanOrEqual(MIN28.loadResumable);
    expect(kinds.DISCARDED_CORRUPT ?? 0, where).toBeGreaterThanOrEqual(MIN28.loadCorrupt);
    expect(discards, where).toBeGreaterThanOrEqual(MIN28.loadOtherDiscardKinds);
    expectNoPollution(before);
  };
  SEED_P28_LOAD_PARTS.forEach((seed, part) => {
    it(`loadGame over mutated texts: never throws, discards remove only the save, resumes equal the replay (part ${part + 1}/${SEED_P28_LOAD_PARTS.length}, seed ${seed})`, () => {
      runLoadProperty(part, seed);
    });
  });
});

let loadPartsDone = 0;
const LOAD_TOTAL: Record<string, number> = {};

/**
 * Minimum counts of the coverage guards of Property 28. Mutations and loadGame are per it (NUM_RUNS_MUT and
 * NUM_RUNS_LOAD runs); the load*Total guards are on the sum of the loadGame its (asserted in afterAll).
 */
const MIN28 = {
  replayOk: 50,
  replayRejected: 30,
  corrupt: 300,
  corruptMigration: 300,
  incompatibleSave: 30,
  incompatibleRules: 50,
  migratedPerVersion: 40,
  loadResumable: 5,
  loadCorrupt: 60,
  loadOtherDiscardKinds: 2,
  loadResumableTotal: 30,
  loadCorruptTotal: 250,
  loadReplayRejectedTotal: 20,
  loadSaveVersionTotal: 15,
  loadRulesVersionTotal: 30,
  loadEndedTotal: 3,
};

afterAll(() => {
  Object.assign(REPORT, P27_GROUP_TALLY, { p28LoadTotal: LOAD_TOTAL });
  if (process.env.QROKER_PROP_REPORT === '1') process.stdout.write(`${JSON.stringify(REPORT)}\n`);
  // Group guards, checked only when every part of the group ran and passed (a part filtered out or failed is
  // reported by its own it). Guards a single it is too small for live here.
  for (const [group, seeds] of SEED_P27_GROUPS) if (P27_PARTS_DONE[group] === seeds.length) checkGroup27(group);
  if (loadPartsDone === SEED_P28_LOAD_PARTS.length) {
    const where = `loadGame total ${JSON.stringify(LOAD_TOTAL)}`;
    expect(LOAD_TOTAL.RESUMABLE ?? 0, where).toBeGreaterThanOrEqual(MIN28.loadResumableTotal);
    expect(LOAD_TOTAL.DISCARDED_CORRUPT ?? 0, where).toBeGreaterThanOrEqual(MIN28.loadCorruptTotal);
    expect(LOAD_TOTAL.DISCARDED_REPLAY_REJECTED ?? 0, where).toBeGreaterThanOrEqual(MIN28.loadReplayRejectedTotal);
    expect(LOAD_TOTAL.DISCARDED_SAVE_VERSION ?? 0, where).toBeGreaterThanOrEqual(MIN28.loadSaveVersionTotal);
    expect(LOAD_TOTAL.DISCARDED_RULES_VERSION ?? 0, where).toBeGreaterThanOrEqual(MIN28.loadRulesVersionTotal);
    expect(LOAD_TOTAL.DISCARDED_GAME_ENDED ?? 0, where).toBeGreaterThanOrEqual(MIN28.loadEndedTotal);
  }
});