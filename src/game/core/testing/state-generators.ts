// fast-check arbitraries and a legal-play driver for reducer tests (task 8.3). Test support only: imported by
// tests, never by engine code. Pure and deterministic: no Math.random, clock or crypto; all randomness comes from
// fast-check.
//
// Source: .kiro/specs/qroker-playable-game/design.md, "Testing Strategy > Generators" (`arbConfig`,
// `arbReachableState`, `randomLegalAction`).
//
// Reachability: a state produced here is ALWAYS built by `newGame(seed, config)` followed by `reduce` calls with
// actions that came from `randomLegalAction`. Nothing is constructed by hand, and every `reduce` result is asserted
// to be accepted (a rejection is a defect of this driver or of the engine and throws). Each result keeps the seed,
// the configuration and the whole action list, so a failing case is reproduced with `replayActions`.
//
// Choice stream: every random decision of the driver is a call `choice(bound)` that returns an integer in
// [0, bound). The numbers come from fast-check (`choiceFrom` cycles over an array of generated integers), so
// failures shrink and replay from the printed fast-check seed. `STEP_STRIDE` numbers are generated per step.
//
// Boundary rule 'score-table' (src/game/boundaries.test.ts): this file is scanned. No score table is written here;
// score tables come from `arbValidScoreConfig` (computed arrays in a variable), the config key is never followed by
// an array literal.
//
// What `randomLegalAction` picks (the engine's own legal sets: `legalCells`, the hand of the turn seat,
// `actingSeats`, the pending batch):
// - PLACEMENT: a card of the turn seat's hand, one cell of `legalCells`, orientation 0 or 180. With the probability
//   `style.codeBias` percent it first looks for a placement that forms a new code (all card x cell x orientation
//   combinations are tried with `placeOnBoard` and `detect`) and picks one of them when one exists, so code-forming
//   placements, batches and hand exhaustion occur often. Otherwise the placement is uniform.
// - GUESS_COLLECT: SUBMIT_GUESSES of the next seat that has not submitted (or a random such seat) with an integer
//   guess in 4..52 for exactly the quad keys of the pending batch. Half of the guesses are close to the Hidden_Sum
//   (so that scores are not always 0), the others are uniform.
// - REVEAL: ACK_REVEAL.
// - ENDED: `null` (no action exists).

import fc from "fast-check";
import { legalCells, placeOnBoard } from "../board";
import { detect } from "../composite-code";
import { actingSeats, reduce } from "../engine";
import { RULES_VERSION } from "../rules";
import { defaultConfig, newGame } from "../state";
import type { GamePhase, GameState } from "../state";
import { SEATS } from "../turn";
import type { Action, CardId, Difficulty, GameConfig, GridPosition, Orientation, PlayerId, SeatConfig } from "../types";
import { arbSeed } from "./card-generators";
import { arbValidScoreConfig } from "./score-generators";

// ---------------------------------------------------------------------------------------------------------
// Configurations
// ---------------------------------------------------------------------------------------------------------

const AI_TIERS: readonly Difficulty[] = ["BEGINNER", "ADVANCED"];

function seatOf(id: PlayerId, human: boolean, difficulty: Difficulty, name: string): SeatConfig {
  return human ? { id, kind: "HUMAN", name } : { id, kind: "AI", difficulty, name };
}

const arbSeatParts: fc.Arbitrary<[boolean, Difficulty, string]> = fc.tuple(
  fc.boolean(),
  fc.constantFrom(...AI_TIERS),
  fc.string({ maxLength: 8 }),
);

const arbRandomConfig: fc.Arbitrary<GameConfig> = fc
  .tuple(
    arbSeatParts,
    arbSeatParts,
    arbSeatParts,
    arbSeatParts,
    fc.constantFrom<GameConfig["identityVisibility"]>("OWNER_ONLY", "FACE_UP"),
    fc.string({ maxLength: 10 }),
    fc.boolean(),
    arbValidScoreConfig,
  )
  .map(([s0, s1, s2, s3, identityVisibility, scoreId, provisional, scoreTable]): GameConfig => {
    const seats: GameConfig["seats"] = [
      seatOf(SEATS[0], s0[0], s0[1], s0[2]),
      seatOf(SEATS[1], s1[0], s1[1], s1[2]),
      seatOf(SEATS[2], s2[0], s2[1], s2[2]),
      seatOf(SEATS[3], s3[0], s3[1], s3[2]),
    ];
    return {
      rulesVersion: RULES_VERSION,
      seats,
      scoreConfig: { id: scoreId, provisional, config: scoreTable },
      identityVisibility,
    };
  });

/**
 * Valid game configurations: every seat HUMAN or AI (AI difficulty BEGINNER or ADVANCED), both Identity_Visibility
 * values, a valid score configuration (arbitrary valid table and bonus, see score-generators.ts), and now and then
 * the default configuration.
 */
export const arbConfig: fc.Arbitrary<GameConfig> = fc.oneof(
  { weight: 1, arbitrary: fc.constant(defaultConfig()) },
  { weight: 6, arbitrary: arbRandomConfig },
);

/** One line that identifies a configuration in a failure message. */
export function configSummary(config: GameConfig): string {
  const seats = config.seats.map((s) => (s.kind === "HUMAN" ? "H" : `AI:${String(s.difficulty)}`)).join(",");
  const table = config.scoreConfig.config;
  return `seats=[${seats}] visibility=${config.identityVisibility} score=${config.scoreConfig.id}(len ${table.rewardByError.length}, bonus ${table.handEmptyBonus})`;
}

// ---------------------------------------------------------------------------------------------------------
// Choice stream
// ---------------------------------------------------------------------------------------------------------

/** Returns an integer in [0, bound). `bound` must be a positive integer. */
export type Choice = (bound: number) => number;

/** Sequential choice stream over generated integers (cycles when the numbers run out; all-zero when empty). */
export function choiceFrom(numbers: readonly number[]): Choice {
  let index = 0;
  return (bound: number): number => {
    if (!Number.isInteger(bound) || bound < 1) throw new RangeError(`choice bound must be a positive integer, got ${bound}`);
    if (numbers.length === 0) return 0;
    const raw = numbers[index % numbers.length] as number;
    index++;
    return Math.abs(Math.trunc(raw)) % bound;
  };
}

/** Numbers generated per step. A step draws at most 5 choices (a placement 4, a submission 5). */
export const STEP_STRIDE = 6;

// ---------------------------------------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------------------------------------

export interface PlayStyle {
  /** Percent (0..100) of placements that look for a code-forming placement first. */
  readonly codeBias: number;
  /** `SEAT_ORDER`: the lowest seat that has not submitted yet; `RANDOM`: any seat that has not submitted. */
  readonly submitOrder: "SEAT_ORDER" | "RANDOM";
}

export const DEFAULT_STYLE: PlayStyle = { codeBias: 30, submitOrder: "SEAT_ORDER" };

export interface LegalPlacement {
  readonly action: Extract<Action, { type: "PLACE" }>;
  /** Number of new codes the placement forms (by the engine's own detector). */
  readonly newCodes: number;
}

/** Every legal PLACE of the turn seat (card x legal cell x orientation) with the number of new codes it forms. */
export function legalPlacements(state: GameState): LegalPlacement[] {
  const seat = state.turn;
  const scored = new Set(state.scoredGroups);
  const out: LegalPlacement[] = [];
  for (const card of state.hands[seat]) {
    for (const pos of legalCells(state.board)) {
      for (const orientation of [0, 180] as Orientation[]) {
        const placed = placeOnBoard(state.board, pos, { card, orientation, owner: seat });
        if (!placed.ok) throw new Error(`legal cell (${pos.row}, ${pos.col}) rejected by placeOnBoard: ${placed.error.code}`);
        out.push({
          action: { type: "PLACE", player: seat, card, pos, orientation },
          newCodes: detect(placed.value, pos, scored).length,
        });
      }
    }
  }
  return out;
}

/** A uniformly chosen legal PLACE of the turn seat (never looks for codes). */
function randomPlacement(state: GameState, choice: Choice): Extract<Action, { type: "PLACE" }> {
  const seat = state.turn;
  const hand = state.hands[seat];
  const cells = legalCells(state.board);
  if (hand.length === 0 || cells.length === 0) {
    throw new Error(`no legal placement: hand ${hand.length}, legal cells ${cells.length}, phase ${state.phase}`);
  }
  const card: CardId = hand[choice(hand.length)] as CardId;
  const pos: GridPosition = cells[choice(cells.length)] as GridPosition;
  const orientation: Orientation = choice(2) === 0 ? 0 : 180;
  return { type: "PLACE", player: seat, card, pos, orientation };
}

/**
 * A legal PLACE of the turn seat, with the code bias of `style` (see the file comment). Consumes one choice for the
 * bias roll, then 1 (a code-forming candidate) or 3 (card, cell, orientation) choices.
 */
export function randomLegalPlace(
  state: GameState,
  choice: Choice,
  style: PlayStyle = DEFAULT_STYLE,
): Extract<Action, { type: "PLACE" }> {
  const roll = choice(100);
  if (roll < style.codeBias) {
    const forming = legalPlacements(state).filter((p) => p.newCodes > 0);
    if (forming.length > 0) return (forming[choice(forming.length)] as LegalPlacement).action;
  }
  return randomPlacement(state, choice);
}

function randomGuesses(state: GameState, choice: Choice): Record<string, number> {
  const guesses: Record<string, number> = {};
  for (const code of state.pending?.codes ?? []) {
    const mode = choice(2);
    const value = choice(49);
    guesses[code.quadKey] = mode === 0 ? 4 + value : Math.min(52, Math.max(4, code.hiddenSum + (value % 5) - 2));
  }
  return guesses;
}

/**
 * A legal action for the current state, or `null` when the game has ended. Every action returned is accepted by
 * `reduce` (the drivers below assert it).
 */
export function randomLegalAction(state: GameState, choice: Choice, style: PlayStyle = DEFAULT_STYLE): Action | null {
  switch (state.phase) {
    case "PLACEMENT":
      return randomLegalPlace(state, choice, style);
    case "GUESS_COLLECT": {
      const waiting = actingSeats(state);
      if (waiting.length === 0) throw new Error("GUESS_COLLECT with no seat left to submit");
      const player = style.submitOrder === "SEAT_ORDER" ? (waiting[0] as PlayerId) : (waiting[choice(waiting.length)] as PlayerId);
      return { type: "SUBMIT_GUESSES", player, guesses: randomGuesses(state, choice) };
    }
    case "REVEAL":
      return { type: "ACK_REVEAL" };
    case "ENDED":
      return null;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------------------------------------

/** A reachable game position with the way it was reached. */
export interface Reachable {
  readonly seed: number;
  readonly config: GameConfig;
  readonly style: PlayStyle;
  /** The accepted actions, in order. */
  readonly actions: readonly Action[];
  /** `states[0]` is the `newGame` state, `states[i + 1]` the state after `actions[i]`. */
  readonly states: readonly GameState[];
  /** The last state (`states[states.length - 1]`). */
  readonly state: GameState;
}

/** Seed, configuration, style and action count, for failure messages. */
export function describeReachable(r: Reachable): string {
  return `seed=${r.seed} ${configSummary(r.config)} codeBias=${r.style.codeBias} submit=${r.style.submitOrder} actions=${r.actions.length} phase=${r.state.phase}`;
}

function start(seed: number, config: GameConfig): GameState {
  const created = newGame({ seed, config });
  if (!created.ok) throw new Error(`newGame rejected a generated configuration: ${created.error.code} ${created.error.detail ?? ""}`);
  return created.value;
}

function drive(
  seed: number,
  config: GameConfig,
  style: PlayStyle,
  maxSteps: number,
  choiceForStep: (index: number) => Choice,
): Reachable {
  let state = start(seed, config);
  const actions: Action[] = [];
  const states: GameState[] = [state];
  for (let i = 0; i < maxSteps; i++) {
    const action = randomLegalAction(state, choiceForStep(i), style);
    if (action === null) break;
    const result = reduce(state, action);
    if (!result.ok) {
      throw new Error(
        `legal action rejected with ${result.error.code} (${result.error.detail ?? ""}) at step ${i}: seed=${seed} ${configSummary(config)} action=${JSON.stringify(action)}`,
      );
    }
    actions.push(action);
    state = result.value;
    states.push(state);
  }
  return { seed, config, style, actions, states, state };
}

/**
 * Plays `rows.length` steps (fewer when the game ends first); `rows[i]` is the number list of step `i`.
 * Reachable by construction (see the file comment).
 */
export function playSteps(
  seed: number,
  config: GameConfig,
  rows: readonly (readonly number[])[],
  style: PlayStyle = DEFAULT_STYLE,
): Reachable {
  return drive(seed, config, style, rows.length, (i) => choiceFrom(rows[i] ?? []));
}

/**
 * Plays a game to `ENDED` with one choice stream (`choices` cycles), at most `cap` steps.
 * @throws Error if the game has not ended after `cap` steps (a game has at most 48 placements, so a cap of 1000 is
 * far above any real game).
 */
export function playToEnd(
  seed: number,
  config: GameConfig,
  choices: readonly number[],
  style: PlayStyle = DEFAULT_STYLE,
  cap = 1000,
): Reachable {
  const choice = choiceFrom(choices);
  const result = drive(seed, config, style, cap, () => choice);
  if (result.state.phase !== "ENDED") {
    throw new Error(`playToEnd: no ENDED after ${cap} steps: ${describeReachable(result)}`);
  }
  return result;
}

/**
 * Continues play from `state` with legal actions until `stop(state)` holds or the game ends, at most `cap` steps.
 * Returns the reached state and the actions taken. Useful to reach a given phase from a generated prefix.
 */
export function advanceUntil(
  state: GameState,
  stop: (state: GameState) => boolean,
  choices: readonly number[],
  style: PlayStyle = DEFAULT_STYLE,
  cap = 500,
): { readonly state: GameState; readonly actions: readonly Action[] } {
  const choice = choiceFrom(choices);
  const actions: Action[] = [];
  let current = state;
  for (let i = 0; i < cap && !stop(current); i++) {
    const action = randomLegalAction(current, choice, style);
    if (action === null) break;
    const result = reduce(current, action);
    if (!result.ok) throw new Error(`advanceUntil: legal action rejected with ${result.error.code}: ${JSON.stringify(action)}`);
    actions.push(action);
    current = result.value;
  }
  return { state: current, actions };
}

/** Rebuilds the states of an action list from `newGame`. Used to reproduce a failure from the printed actions. */
export function replayActions(seed: number, config: GameConfig, actions: readonly Action[]): GameState[] {
  let state = start(seed, config);
  const states: GameState[] = [state];
  actions.forEach((action, i) => {
    const result = reduce(state, action);
    if (!result.ok) throw new Error(`replay: action ${i} rejected with ${result.error.code}`);
    state = result.value;
    states.push(state);
  });
  return states;
}

/**
 * A prefix state of `r` that satisfies `predicate`: the first match when scanning the states cyclically from index
 * `pick` modulo the number of states, or `undefined` when no prefix state matches. Rejection sampling over a
 * generated play prefix; the scan stops at the first match, so an expensive predicate is evaluated lazily.
 */
export function pickState(r: Reachable, predicate: (state: GameState) => boolean, pick: number): GameState | undefined {
  const n = r.states.length;
  const startAt = Math.abs(pick) % n;
  for (let k = 0; k < n; k++) {
    const candidate = r.states[(startAt + k) % n] as GameState;
    if (predicate(candidate)) return candidate;
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------
// Reachable states
// ---------------------------------------------------------------------------------------------------------

/** Per-game play styles: how strongly the random player looks for codes, and who submits first. */
export const arbPlayStyle: fc.Arbitrary<PlayStyle> = fc.record({
  codeBias: fc.constantFrom(0, 5, 20, 50, 90),
  submitOrder: fc.constantFrom<PlayStyle["submitOrder"]>("SEAT_ORDER", "RANDOM"),
});

const arbStepRow: fc.Arbitrary<number[]> = fc.array(fc.nat({ max: 1_000_000 }), { minLength: STEP_STRIDE, maxLength: STEP_STRIDE });

const arbRows = (maxSteps: number): fc.Arbitrary<number[][]> =>
  fc.array(arbStepRow, { minLength: 0, maxLength: maxSteps, size: "max" });

export interface ReachableOptions {
  /** One step-count range `0..maxSteps`. Default: a mix of ~0..80 (5 parts), ~0..170 (2) and ~0..300 (2) steps. */
  readonly maxSteps?: number;
}

/**
 * Reachable game states: `newGame(seed, config)` followed by a generated number of steps of a random legal player
 * (see the file comment). Games that are not over after the generated number of steps stay mid-game; deeper games
 * run past deck exhaustion to hand exhaustion and `ENDED`. The result carries the seed, configuration, style, all
 * actions and all prefix states.
 */
export function arbReachableState(options: ReachableOptions = {}): fc.Arbitrary<Reachable> {
  const rows: fc.Arbitrary<number[][]> =
    options.maxSteps !== undefined
      ? arbRows(options.maxSteps)
      : fc.oneof(
          { weight: 5, arbitrary: arbRows(80) },
          { weight: 2, arbitrary: arbRows(170) },
          { weight: 2, arbitrary: arbRows(300) },
        );
  return fc
    .record({ seed: arbSeed, config: arbConfig, style: arbPlayStyle, rows })
    .map(({ seed, config, style, rows: r }) => withPrinter(playSteps(seed, config, r, style)));
}

/**
 * fast-check prints a failing value with `fc.stringify`. A `Reachable` holds every prefix state, so its printed form
 * is replaced by the seed, configuration, style and action list, which is all that is needed to reproduce it with
 * `replayActions`. The printer is a non-enumerable property, so equality and cloning ignore it.
 */
function withPrinter(r: Reachable): Reachable {
  Object.defineProperty(r, fc.toStringMethod, {
    value: (): string => `Reachable{ ${describeReachable(r)} config=${JSON.stringify(r.config)} actions=${JSON.stringify(r.actions)} }`,
    enumerable: false,
  });
  return r;
}

/** Phases, for coverage tables. */
export const PHASES: readonly GamePhase[] = ["PLACEMENT", "GUESS_COLLECT", "REVEAL", "ENDED"];
