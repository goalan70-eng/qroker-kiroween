// The UI controller (task 16.2): the ONE module of ui/ that holds the sealed `GameState`.
//
// What it does
//   * owns the `GameState` in a closure variable. The state is not a property of any exported object, is never
//     passed to a renderer and is never returned. Screens receive `{ view, model, displayError, handlers }`:
//     a deeply frozen `PlayerView` (or `null`), the UI-only `AppModel`, the localized error text, and functions.
//   * applies Actions: human Actions through `dispatchHuman`, AI Actions through scheduled steps. Every Action,
//     whoever produced it, goes through `reduce`; the controller adds no rule of its own except two checks the
//     engine cannot make (a human cannot act for an AI seat; an ACK_REVEAL needs a human when a human exists).
//   * drives AI seats through `deps.schedule(fn, AI_DELAY_MS)`; see "AI scheduling" below.
//   * re-renders through `deps.renderer` after each model change. Focus restoration belongs to the renderer side
//     (`renderWithFocus` in dom.ts, used by `mountApp`), so this module is DOM-free and testable in Node.
//
// Who acts (`actingSeats`, design: "turn seat; unsubmitted seats; none when ENDED")
//   PLACEMENT      the turn seat. A HUMAN seat waits for `dispatchHuman`; an AI seat plays on a scheduled step.
//   GUESS_COLLECT  every seat that has not submitted. HUMAN seats wait for `dispatchHuman`. The AI seats of the
//                  batch all submit in ONE scheduled step, one after another in seat order (design, Guess flow:
//                  "AI Seats submit immediately in the controller"); each decision sees the state left by the
//                  previous one, exactly like `sim/play-game.ts`.
//   REVEAL         ACK_REVEAL. When at least one seat is HUMAN, a person acknowledges (`dispatchHuman`
//                  `{ type: 'ACK_REVEAL' }`; design: "a continue button that sends ACK_REVEAL") and the controller
//                  never acknowledges for them. When all four seats are AI the controller acknowledges on a
//                  scheduled step, as `playGame` does.
//   ENDED          nobody; nothing is scheduled.
//
// AI scheduling (no browser blocking, no duplicates, no stale effects)
//   * At most ONE step is pending (`pendingStep`, `scheduledHandle`). `scheduleNext` does nothing while one is
//     pending, while the controller is disposed, idle or stalled, or when nobody AI has to act.
//   * One step applies one decision (or, in GUESS_COLLECT, the decisions of the AI seats of that batch) and then
//     returns. The next step is scheduled through `deps.schedule`, which yields to the event loop in production
//     (`setTimeout`), so the main thread is never held for more than the work of one step.
//   * Staleness. `epoch` is incremented by startGame, restart, abandon and dispose. A step captures its token,
//     the epoch and `state.log.length` at scheduling time. When it fires it does nothing unless the token is the
//     pending one, the epoch is unchanged, the controller is alive and the log length still matches. Every
//     accepted human Action and every game change cancels the pending handle and clears the token first, so a
//     scheduler that ignores `cancel` still cannot cause an effect.
//   * `inFlight` is true while an Action is being applied and rendered. A re-entrant call (for example a click
//     handler invoked by the renderer while a render is running) gets `{ ok: false, reason: 'BUSY' }` and changes
//     nothing; it is rejected, not queued.
//   * An AI Action that the engine rejects, or a strategy that throws, is NOT replaced by another Action: the loop
//     stops (`aiStalled`), the state stays as it was, and the engine code (if any) becomes the display error.
//
// Decision seed: `mix32(gameSeed, seatIndex * 100000 + actionIndex)` with `actionIndex = state.log.length`, the
// same formula as `decisionSeed` in sim/play-game.ts. ui/ may not import sim/ (design table), so the formula is
// re-derived here from `core/prng`; controller.test.ts proves the equivalence by comparing whole games with
// `playGame`.
//
// No clock, no randomness and no global is used here: the scheduler, the seed provider, the language provider and
// the strategy lookup are injected (`AppDeps`).

import { getStrategy } from '../ai/registry';
import type { AIStrategy, AiContext } from '../ai/strategy';
import { actingSeats, reduce } from '../core/engine';
import { mix32 } from '../core/prng';
import { defaultConfig, newGame } from '../core/state';
import type { GameState } from '../core/state';
import type { Action, Difficulty, ErrorCode, GameConfig, PlayerId } from '../core/types';
import { viewFor } from '../core/view';
import type { PlayerView } from '../core/view';
import { DEFAULT_LANGUAGE, errorMessageKey, getLanguage, isLang, setLanguage, t } from '../i18n';
import type { Lang } from '../i18n';
import { renderWithFocus } from './dom';
import { mountShell } from './shell';
import { createStore, EMPTY_SELECTION, initialModel } from './store';
import type { AppModel, DisplayErrorRecord, UiSelection } from './store';

/** Presentation delay between two AI steps (design: `AI_DELAY_MS = 600`, at most 1000). */
export const AI_DELAY_MS = 600;

/** Seat part of the decision seed (same constant as `DECISION_SEED_SEAT_STRIDE` in sim/play-game.ts). */
const DECISION_SEED_SEAT_STRIDE = 100000;

// ---------------------------------------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------------------------------------

export interface ScheduleHandle {
  cancel(): void;
}

/** Production: `setTimeout` wrapped to return a handle. Tests: a queue with manual draining, or immediate. */
export type Schedule = (fn: () => void, ms: number) => ScheduleHandle;

/** The localized error that a screen shows. `message` is looked up when it is rendered, in the current language. */
export interface DisplayError {
  readonly code: ErrorCode;
  readonly message: string;
}

export interface StartOptions {
  /** Default: `defaultConfig()` (seat P0 human, three AI seats). */
  readonly config?: GameConfig;
  /** Default: `deps.randomSeed()`. */
  readonly seed?: number;
}

/**
 * Result of an operation of the controller.
 * - `ENGINE`: the engine rejected it; `code` is the engine's `ErrorCode`. The state is unchanged.
 * - `BUSY`: re-entrant call while another operation is being applied or rendered; nothing was done.
 * - `NO_GAME`: no game is running.
 * - `DISPOSED`: the controller was disposed; nothing was done.
 */
export type OpResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'ENGINE'; readonly code: ErrorCode }
  | { readonly ok: false; readonly reason: 'BUSY' | 'NO_GAME' | 'DISPOSED' };

/** The functions a screen may call. Created once; they stay valid after dispose and then do nothing. */
export interface RenderHandlers {
  readonly dispatch: (action: Action) => OpResult;
  readonly startGame: (options?: StartOptions) => OpResult;
  readonly restart: () => OpResult;
  readonly abandon: () => OpResult;
  readonly setLanguage: (lang: Lang) => void;
  readonly select: (patch: Partial<UiSelection>) => void;
}

/** Everything a renderer or screen receives. No `GameState`, no controller. */
export interface RenderInput {
  /** The view of `model.viewer`, or `null` when no game runs or no human seat exists. */
  readonly view: PlayerView | null;
  readonly model: AppModel;
  readonly displayError: DisplayError | null;
  readonly handlers: RenderHandlers;
}

export type Renderer = (input: RenderInput) => void;

export interface AppDeps {
  readonly schedule: Schedule;
  readonly renderer: Renderer;
  /** A Seed for a new game when `startGame` and `restart` get none: an integer in 0..4294967295. */
  readonly randomSeed: () => number;
  /** The start language. */
  readonly language: () => Lang;
  /** Strategy lookup. Default: the registry (`getStrategy`). Injectable so that tests can force decisions. */
  readonly strategyFor?: (difficulty: Difficulty) => AIStrategy;
}

export interface Controller {
  getModel(): AppModel;
  /**
   * A frozen view of the running game for `viewer`, or `null` when no game runs. For the composition root and tests:
   * screens never get the controller, they get the view of `model.viewer` only.
   */
  getView(viewer: PlayerId): PlayerView | null;
  /** The localized error of the model in the CURRENT language, or `null`. */
  getDisplayError(): DisplayError | null;
  dispatchHuman(action: Action): OpResult;
  startGame(options?: StartOptions): OpResult;
  /** New game with the same configuration and a new seed from `deps.randomSeed()`. */
  restart(): OpResult;
  /** Drops the game and returns the model to the idle screen. */
  abandon(): OpResult;
  setLanguage(lang: Lang): void;
  select(patch: Partial<UiSelection>): void;
  subscribe(listener: (model: AppModel) => void): () => void;
  /** Stops everything. Later calls are no-ops (operations return `DISPOSED`). */
  dispose(): void;
}

// ---------------------------------------------------------------------------------------------------------
// The controller
// ---------------------------------------------------------------------------------------------------------

interface Game {
  state: GameState;
  readonly config: GameConfig;
}

const NOOP_UNSUBSCRIBE = (): void => undefined;
const MAX_RENDER_PASSES = 5;

export function createController(deps: AppDeps): Controller {
  const strategyFor = deps.strategyFor ?? getStrategy;

  // The sealed state. Module-private: it lives in this closure only.
  let game: Game | null = null;

  let disposed = false;
  let epoch = 0;
  let inFlight = false;
  let stepCounter = 0;
  /** Token of the pending AI step, or `null`. Only the callback holding this token may run. */
  let pendingStep: number | null = null;
  let scheduledHandle: ScheduleHandle | null = null;
  /** The last accepted human Action and the log length right after it (double-click guard). */
  let lastAccepted: { readonly action: Action; readonly logLength: number } | null = null;

  const startLanguage = ((): Lang => {
    const wanted: unknown = deps.language();
    return isLang(wanted) ? wanted : DEFAULT_LANGUAGE;
  })();
  setLanguage(startLanguage);
  const store = createStore<AppModel>(initialModel(startLanguage));

  // ---- model ----------------------------------------------------------------------------------------------

  const seatKind = (config: GameConfig, seat: PlayerId): 'HUMAN' | 'AI' | undefined =>
    config.seats.find((s) => s.id === seat)?.kind;
  const hasHuman = (config: GameConfig): boolean => config.seats.some((s) => s.kind === 'HUMAN');

  /** Applies `patch` to the model together with the values derived from the game, and notifies. */
  function setModel(patch: Partial<AppModel>): void {
    store.update((m) =>
      Object.freeze({
        ...m,
        screen: game === null ? 'SETUP' : game.state.phase === 'ENDED' ? 'END' : 'GAME',
        actionCount: game === null ? 0 : game.state.log.length,
        ...patch,
      }),
    );
  }

  const errorRecord = (code: ErrorCode): DisplayErrorRecord => Object.freeze({ code, messageKey: errorMessageKey(code) });

  function displayErrorOf(model: AppModel): DisplayError | null {
    if (model.lastError === null) return null;
    return Object.freeze({ code: model.lastError.code, message: t(model.lastError.messageKey) });
  }

  // ---- rendering ------------------------------------------------------------------------------------------

  let rendering = false;
  let renderAgain = false;

  function render(): void {
    if (disposed) return;
    if (rendering) {
      renderAgain = true; // a render was requested from inside the renderer: run once more afterwards
      return;
    }
    rendering = true;
    try {
      for (let pass = 0; pass < MAX_RENDER_PASSES; pass++) {
        renderAgain = false;
        const model = store.get();
        const view = game !== null && model.viewer !== null ? viewFor(game.state, model.viewer) : null;
        deps.renderer({ view, model, displayError: displayErrorOf(model), handlers });
        if (!renderAgain || disposed) break;
      }
    } finally {
      rendering = false;
      renderAgain = false;
    }
  }

  const unsubscribeRender = store.subscribe(render);

  // ---- scheduling -----------------------------------------------------------------------------------------

  function cancelPending(): void {
    pendingStep = null;
    const handle = scheduledHandle;
    scheduledHandle = null;
    if (handle !== null) handle.cancel();
  }

  function invalidate(): void {
    epoch++;
    cancelPending();
  }

  /** Whether an AI seat (or the automatic acknowledgement of an all-AI game) has to act now. */
  function hasAiWork(g: Game): boolean {
    const state = g.state;
    switch (state.phase) {
      case 'ENDED':
        return false;
      case 'REVEAL':
        return !hasHuman(g.config);
      case 'PLACEMENT':
        return seatKind(g.config, state.turn) === 'AI';
      case 'GUESS_COLLECT':
        return actingSeats(state).some((seat) => seatKind(g.config, seat) === 'AI');
    }
  }

  function scheduleNext(): void {
    if (disposed || game === null || pendingStep !== null || store.get().aiStalled || !hasAiWork(game)) return;
    const token = ++stepCounter;
    const myEpoch = epoch;
    const expectedLength = game.state.log.length;
    pendingStep = token;
    // With an immediate scheduler the callback runs inside `schedule(...)`: by the time it returns, the step may
    // have run and a newer step may be pending, so the handle is stored only while this token is still pending.
    const handle = deps.schedule(() => runStep(token, myEpoch, expectedLength), AI_DELAY_MS);
    if (pendingStep === token) scheduledHandle = handle;
  }

  function runStep(token: number, myEpoch: number, expectedLength: number): void {
    if (pendingStep !== token) return; // cancelled, superseded or already run
    pendingStep = null;
    scheduledHandle = null;
    if (disposed || myEpoch !== epoch || game === null || game.state.log.length !== expectedLength) return;
    if (inFlight) return; // cannot happen with a scheduler that yields; refuse rather than re-enter
    let progressed = false;
    inFlight = true;
    try {
      progressed = playAiStep(game);
    } finally {
      inFlight = false;
    }
    if (progressed) scheduleNext();
  }

  /** `seed`-derived decision seed, identical to `decisionSeed` of sim/play-game.ts. */
  function decisionSeedOf(state: GameState, seat: PlayerId): number {
    const seatIndex = state.config.seats.findIndex((s) => s.id === seat);
    return mix32(state.seed, seatIndex * DECISION_SEED_SEAT_STRIDE + state.log.length);
  }

  /**
   * Plays one step. Returns false when the loop must stop (an AI could not play). The state of `g` is updated
   * after each accepted Action; the model is published once at the end.
   */
  function playAiStep(g: Game): boolean {
    const outcome: { stalled: ErrorCode | 'EXCEPTION' | null } = { stalled: null };
    const apply = (action: unknown, expectedSeat: PlayerId | null): boolean => {
      const actor = (action as { readonly player?: unknown } | null)?.player;
      const result = reduce(g.state, action as Action);
      if (!result.ok) {
        outcome.stalled = result.error.code;
        return false;
      }
      if (expectedSeat !== null && actor !== expectedSeat) {
        outcome.stalled = 'NOT_YOUR_TURN'; // an accepted Action of another seat than the one asked: not applied
        return false;
      }
      g.state = result.value;
      return true;
    };
    const decide = (seat: PlayerId): boolean => {
      const state = g.state;
      const difficulty = g.config.seats.find((s) => s.id === seat)?.difficulty;
      let action: Action;
      try {
        if (difficulty === undefined) throw new RangeError(`seat ${seat} has no difficulty`);
        const strategy = strategyFor(difficulty);
        const ctx: AiContext = Object.freeze({ decisionSeed: decisionSeedOf(state, seat) });
        const view = viewFor(state, seat);
        action = state.phase === 'PLACEMENT' ? strategy.choosePlacement(view, ctx) : strategy.chooseGuesses(view, ctx);
      } catch {
        outcome.stalled = 'EXCEPTION';
        return false;
      }
      return apply(action, seat);
    };

    let ok = true;
    if (g.state.phase === 'REVEAL') {
      ok = hasHuman(g.config) ? true : apply({ type: 'ACK_REVEAL' } satisfies Action, null);
    } else if (g.state.phase === 'PLACEMENT') {
      ok = decide(g.state.turn);
    } else {
      // GUESS_COLLECT: every AI seat that has not submitted, in seat order, each seeing the state left by the previous.
      for (;;) {
        if (g.state.phase !== 'GUESS_COLLECT') break;
        const seat = actingSeats(g.state).find((s) => seatKind(g.config, s) === 'AI');
        if (seat === undefined) break;
        ok = decide(seat);
        if (!ok) break;
      }
    }

    const stalled = outcome.stalled;
    if (stalled === null) {
      lastAccepted = null;
      setModel({ lastError: null });
    } else {
      setModel(stalled === 'EXCEPTION' ? { aiStalled: true } : { aiStalled: true, lastError: errorRecord(stalled) });
    }
    return ok && stalled === null;
  }

  // ---- operations -----------------------------------------------------------------------------------------

  function rejectWith(code: ErrorCode): OpResult {
    setModel({ lastError: errorRecord(code) });
    return { ok: false, reason: 'ENGINE', code };
  }

  function dispatchHuman(action: Action): OpResult {
    if (disposed) return { ok: false, reason: 'DISPOSED' };
    if (inFlight) return { ok: false, reason: 'BUSY' };
    const g = game;
    if (g === null) return { ok: false, reason: 'NO_GAME' };
    inFlight = true;
    try {
      const state = g.state;
      if (lastAccepted !== null && lastAccepted.action === action && lastAccepted.logLength === state.log.length) {
        return rejectWith('DUPLICATE_SUBMISSION'); // the very same Action object again, nothing happened since
      }
      const type: unknown = (action as { readonly type?: unknown } | null)?.type;
      const player: unknown = (action as { readonly player?: unknown } | null)?.player;
      if (type === 'ACK_REVEAL' && !hasHuman(g.config)) {
        return rejectWith('WRONG_PHASE'); // an all-AI game acknowledges by itself
      }
      if ((type === 'PLACE' || type === 'SUBMIT_GUESSES') && seatKind(g.config, player as PlayerId) === 'AI') {
        return rejectWith('NOT_YOUR_TURN'); // a person cannot act for an AI seat
      }
      const result = reduce(state, action);
      if (!result.ok) return rejectWith(result.error.code);
      g.state = result.value;
      lastAccepted = { action, logLength: result.value.log.length };
      setModel({ lastError: null, selection: EMPTY_SELECTION });
    } finally {
      inFlight = false;
    }
    cancelPending(); // the state moved on: any pending step was planned for the old state
    scheduleNext();
    return { ok: true };
  }

  function begin(config: GameConfig, seed: number): OpResult {
    inFlight = true;
    try {
      const created = newGame({ seed, config });
      if (!created.ok) return rejectWith(created.error.code); // the running game, if any, is untouched
      invalidate();
      game = { state: created.value, config };
      lastAccepted = null;
      const human = config.seats.find((s) => s.kind === 'HUMAN');
      setModel({ viewer: human === undefined ? null : human.id, selection: EMPTY_SELECTION, lastError: null, aiStalled: false });
    } finally {
      inFlight = false;
    }
    scheduleNext();
    return { ok: true };
  }

  function startGame(options?: StartOptions): OpResult {
    if (disposed) return { ok: false, reason: 'DISPOSED' };
    if (inFlight) return { ok: false, reason: 'BUSY' };
    return begin(options?.config ?? defaultConfig(), options?.seed ?? deps.randomSeed());
  }

  function restart(): OpResult {
    if (disposed) return { ok: false, reason: 'DISPOSED' };
    if (inFlight) return { ok: false, reason: 'BUSY' };
    if (game === null) return { ok: false, reason: 'NO_GAME' };
    return begin(game.config, deps.randomSeed());
  }

  function abandon(): OpResult {
    if (disposed) return { ok: false, reason: 'DISPOSED' };
    if (inFlight) return { ok: false, reason: 'BUSY' };
    inFlight = true;
    try {
      invalidate();
      game = null;
      lastAccepted = null;
      setModel({ viewer: null, selection: EMPTY_SELECTION, lastError: null, aiStalled: false });
    } finally {
      inFlight = false;
    }
    return { ok: true };
  }

  function setUiLanguage(lang: Lang): void {
    if (disposed || !isLang(lang)) return;
    setLanguage(lang);
    setModel({ language: lang });
  }

  function select(patch: Partial<UiSelection>): void {
    if (disposed) return;
    setModel({ selection: Object.freeze({ ...store.get().selection, ...patch }) });
  }

  function dispose(): void {
    if (disposed) return;
    invalidate();
    disposed = true;
    game = null;
    lastAccepted = null;
    unsubscribeRender();
  }

  const handlers: RenderHandlers = Object.freeze({
    dispatch: dispatchHuman,
    startGame,
    restart,
    abandon,
    setLanguage: setUiLanguage,
    select,
  });

  const controller: Controller = Object.freeze({
    getModel: () => store.get(),
    getView: (viewer: PlayerId) => (game === null ? null : viewFor(game.state, viewer)),
    getDisplayError: () => displayErrorOf(store.get()),
    dispatchHuman,
    startGame,
    restart,
    abandon,
    setLanguage: setUiLanguage,
    select,
    subscribe: (listener: (model: AppModel) => void) => (disposed ? NOOP_UNSUBSCRIBE : store.subscribe(listener)),
    dispose,
  });

  render(); // initial render: idle screen
  return controller;
}

// ---------------------------------------------------------------------------------------------------------
// mountApp
// ---------------------------------------------------------------------------------------------------------

/** Dependencies of `mountApp`: the DOM objects and the injected services. Nothing is read from a global. */
export interface MountDeps {
  readonly doc: Document;
  /** `navigator.languages` (or `navigator.language`); the start language is `detectLanguage(languages, null)`. */
  readonly languages: readonly string[] | string | null | undefined;
  readonly schedule: Schedule;
  readonly randomSeed: () => number;
  readonly strategyFor?: (difficulty: Difficulty) => AIStrategy;
  /** Optional extra renderer for the game screens (tasks 17 to 19); it runs after the shell, inside the focus guard. */
  readonly renderer?: Renderer;
}

export interface AppHandle {
  readonly controller: Controller;
  dispose(): void;
}

/**
 * Mounts the app into `root`: the existing shell (title, language selector, provisional-scoring banner and the
 * honest "not connected yet" notice) on top of a controller. No game screen, no Play button and no game starts
 * automatically: `controller.startGame` is an API for the composition root and for later screens.
 *
 * Integration with the shell: `mountShell` is unchanged. It applies the start language and handles the selector;
 * a `change` listener forwards the chosen language to the controller so that the model follows, and every render
 * calls `shell.applyLanguage(model.language)` (texts and `<html lang>` change in place, the selector keeps its
 * focus). Every render runs inside `renderWithFocus`, which restores the focus to the control that had it.
 * Nothing is stored on `window` or `globalThis`.
 */
export function mountApp(root: HTMLElement, deps: MountDeps): AppHandle {
  const { doc } = deps;
  const shell = mountShell(root, { languages: deps.languages, doc });
  const controller = createController({
    schedule: deps.schedule,
    randomSeed: deps.randomSeed,
    ...(deps.strategyFor === undefined ? {} : { strategyFor: deps.strategyFor }),
    language: () => getLanguage(), // the shell has just applied detectLanguage(...)
    renderer: (input) =>
      renderWithFocus(doc, () => {
        shell.applyLanguage(input.model.language);
        deps.renderer?.(input);
      }),
  });
  // `mountShell` registered its own listener first, so `getLanguage()` is already the chosen language here.
  shell.select.addEventListener('change', () => controller.setLanguage(getLanguage()));
  return { controller, dispose: controller.dispose };
}