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
// Placement draft (task 17.4; design.md "Placement interaction"; supersedes the 16.2 `UiSelection`/`select`)
//   * `AppModel.draft` is the viewer's `PlacementDraft`. `draftEvent(e)` runs the pure `reduceDraft` against a context
//     built from the LATEST `PlayerView` (legal cells from `legalCellsFor`, Hand, rotation capability). A draft
//     never touches the game: no Action is dispatched, no log entry, no AI step.
//   * Placement confirmation boundary (task 18.3): `handlers.dispatch` is typed for non-PLACE Actions and returns
//     `PLACE_NOT_ALLOWED` for a `PLACE` at runtime (no engine call, no change). `dispatchHuman` is the trusted API
//     for `confirmPlacement`, tests and the composition root.
//   * `confirmPlacement()` is the ONLY controller path that builds a `PLACE` for a draft. It takes no argument (a
//     stale screen closure cannot carry an old draft), refuses with `DISPOSED`/`BUSY`/`NO_GAME` like `dispatchHuman`,
//     re-validates the draft with `validateDraft` against the latest view, and on success sends exactly ONE `PLACE`
//     through `dispatchHuman` (engine `reduce`, double-submission guard, AI scheduling). The accepted Action changes
//     `actionCount`, which clears the draft, so a second confirmation finds an empty draft and sends nothing.
//   * `explainTarget(cell)` asks the engine WHY a cell is refused: `reduce` on the current state with a throwaway
//     probe `PLACE` (the viewer's first Hand card, orientation 0); the result state is discarded. It never decides
//     legality (that is `legalCellsFor`), and the codes it can give for a cell are geometry only.
//   * Rotation capability (`rotationInfo`) is computed from the viewer's OWN Hand only, here, because this is the
//     only ui/ module allowed to import `core/fragment-layout`.
//   * Invalidation. The draft is cleared, and `gestureEpoch` is incremented so that renderers cancel an active drag
//     gesture, whenever one of these changes: viewer, screen, game epoch (new game, restart, abandon, dispose),
//     `actionCount`, phase, turn; or when the drafted card is no longer in the viewer's Hand; and on an
//     `invalidate` draft event or a failed confirmation.
//
// Seat to show and gate (task 19.4; design "Task 19.4 composition contracts")
//   * One human seat: `viewer` is that seat in every phase, never a gate, `publicView` null (unchanged behaviour).
//   * Two to four human seats: `candidateSeat` gives the seat that may see its private view (turn seat in PLACEMENT when
//     human; first unsubmitted human seat in GUESS_COLLECT; none for an AI turn, REVEAL, ENDED). The pure `nextGate`
//     decides whether a gate comes first. `viewer` is null while a gate is pending; `lastPrivateSeat` and
//     `acknowledgedSeat` live in this closure. `acknowledgeGate` is the only way past a gate, and `dispatchHuman` is
//     refused (`STALE_GATE`) while one is pending.
//   * Game start: no gate for the first seat to show (it counts as the last private seat, see `begin`).
//   * `viewer`/`gate` are derived inside `setModel` from the game, so every state change keeps them consistent; a viewer
//     change clears the draft and bumps `gestureEpoch` through the existing fingerprint.
//
// No clock, no randomness and no global is used here: the scheduler, the seed provider, the language provider and
// the strategy lookup are injected (`AppDeps`).

import { getStrategy } from '../ai/registry';
import type { AIStrategy, AiContext } from '../ai/strategy';
import { actingSeats, reduce } from '../core/engine';
import { rotationChangesCorners } from '../core/fragment-layout';
import { mix32 } from '../core/prng';
import { parseSeed } from '../core/seed';
import { deepFreeze, defaultConfig, newGame } from '../core/state';
import type { GameState } from '../core/state';
import type { Action, CardId, Difficulty, ErrorCode, GameConfig, GridPosition, IdentityVisibility, PlayerId } from '../core/types';
import { viewFor } from '../core/view';
import type { PlayerView } from '../core/view';
import { DEFAULT_LANGUAGE, errorMessageKey, getLanguage, isLang, setLanguage, t } from '../i18n';
import type { Lang } from '../i18n';
import { renderWithFocus } from './dom';
import { nextGate } from './screens/privacy-gate';
import type { GatePurpose } from './screens/privacy-gate';
import { draftContextFor, EMPTY_DRAFT, errorCodeForIssue, reduceDraft, validateDraft } from './placement-draft';
import type { DraftEvent, DraftIssue, DraftResult, RotationInfoMap } from './placement-draft';
import { mountShell } from './shell';
import { seatsFor, validateSetup } from './setup-model';
import type { SetupOptions } from './setup-model';
import { createStore, initialModel } from './store';
import type { AppModel, DisplayErrorRecord } from './store';

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

export interface PracticeOptions {
  readonly seed: number;
  /** Default: the default configuration's value. */
  readonly identityVisibility?: IdentityVisibility;
}

/**
 * Result of an operation of the controller.
 * - `ENGINE`: the engine rejected it; `code` is the engine's `ErrorCode`. The state is unchanged.
 * - `BUSY`: re-entrant call while another operation is being applied or rendered; nothing was done.
 * - `NO_GAME`: no game is running.
 * - `DISPOSED`: the controller was disposed; nothing was done.
 * - `DRAFT_INVALID`: `confirmPlacement` found the draft incomplete (`NO_CARD`, `NO_TARGET`) or stale; no Action was sent.
 * - `PLACE_NOT_ALLOWED`: a `PLACE` was passed to `RenderHandlers.dispatch`; placements go through the draft only.
 * - `STALE_GATE` (task 19.4): `acknowledgeGate` got a binding that does not match the pending gate (none pending, wrong
 *   seat or purpose, older `actionCount`, already acknowledged); or `dispatchHuman` was called while a gate is pending
 *   (the next Seat has not acknowledged yet, so no Action may be sent). Nothing was done.
 */
export type OpResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'ENGINE'; readonly code: ErrorCode }
  | { readonly ok: false; readonly reason: 'BUSY' | 'NO_GAME' | 'DISPOSED' | 'PLACE_NOT_ALLOWED' | 'STALE_GATE' }
  | { readonly ok: false; readonly reason: 'DRAFT_INVALID'; readonly issue: DraftIssue };

/** The functions a screen may call. Created once; they stay valid after dispose and then do nothing. */
export interface RenderHandlers {
  /** Any Action except `PLACE` (typed out; a `PLACE` that gets through anyway is refused with `PLACE_NOT_ALLOWED`). */
  readonly dispatch: (action: Exclude<Action, { readonly type: 'PLACE' }>) => OpResult;
  readonly startGame: (options?: StartOptions) => OpResult;
  /**
   * Starts a game from the setup screen's options (task 19.1): validates them, parses the seed text (`SEED_EMPTY` for
   * empty text), builds the configuration and starts through the same path as `startGame`. A rejected call leaves a
   * running game untouched.
   */
  readonly startFromSetup: (options: SetupOptions) => OpResult;
  readonly restart: () => OpResult;
  /** New game with the same configuration and the SAME seed (identical initial deal); works while running and after ENDED (task 19.2). */
  readonly replaySameSeed: () => OpResult;
  readonly abandon: () => OpResult;
  readonly setLanguage: (lang: Lang) => void;
  /** Applies a draft event to `model.draft` (pure reducer, latest view). Never sends an Action. */
  readonly draftEvent: (event: DraftEvent) => DraftResult;
  /** Validates the draft against the latest view and sends exactly one `PLACE`. The only path that does. */
  readonly confirmPlacement: () => OpResult;
  /** The engine's `ErrorCode` for a cell that cannot take a card (`null` when it can); shows its message. */
  readonly explainTarget: (cell: GridPosition) => ErrorCode | null;
  /**
   * Acknowledges the pending Pass_Device_Gate (task 19.4). Single use: it does nothing and returns `STALE_GATE` unless
   * `model.gate` still equals `(forSeat, purpose)` and `model.actionCount === actionCount`. On success the gate Seat
   * becomes `model.viewer` and the gate is cleared.
   */
  readonly acknowledgeGate: (ack: GateAck) => OpResult;
}

/** The binding of a gate acknowledgement (what `PrivacyGate`'s `onAcknowledge` passes). */
export interface GateAck {
  readonly forSeat: PlayerId;
  readonly purpose: GatePurpose;
  readonly actionCount: number;
}

/** Everything a renderer or screen receives. No `GameState`, no controller. */
export interface RenderInput {
  /**
   * The view of `model.viewer`, or `null` when no game runs, no human seat exists, or (several human seats) no
   * private view may be shown: during a gate, an AI turn, `REVEAL` and `ENDED`.
   */
  readonly view: PlayerView | null;
  /**
   * Task 19.4. Non-null only in a game with two to four human seats, while a game exists and `model.viewer` is null.
   * It is NOT a private view: the `viewer` field only keeps the `PlayerView` shape (it is the first human seat), `myHand`
   * is empty, `myGuesses` is null, and a board cell carries its identity only when all four seats see it. For the
   * scoreboard, banner, Seed line, status line, reveal, end screen and a read-only Board; never for a Hand or a Guess form.
   */
  readonly publicView: PlayerView | null;
  /** The Seed of the running game, or `null` when no game runs (requirement 15.2). */
  readonly seed: number | null;
  readonly model: AppModel;
  readonly displayError: DisplayError | null;
  /** Rotation capability of the cards of the viewer's OWN Hand (no key for any other card); `{}` without a view. */
  readonly rotationInfo: RotationInfoMap;
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
  /** Same as `RenderHandlers.startFromSetup`. */
  startFromSetup(options: SetupOptions): OpResult;
  /**
   * Starts the default practice game (seat P0 human, three AI seats, `defaultConfig()`) with `seed` and, when given,
   * `identityVisibility`. For composition roots (such as the development playground) that must not import `core/state`.
   */
  startPracticeGame(options: PracticeOptions): OpResult;
  /** New game with the same configuration and a new seed from `deps.randomSeed()`. */
  restart(): OpResult;
  /** New game with the same configuration and the same seed; same guards as `restart`. `deps.randomSeed` is not called. */
  replaySameSeed(): OpResult;
  /** Drops the game and returns the model to the idle screen. */
  abandon(): OpResult;
  setLanguage(lang: Lang): void;
  draftEvent(event: DraftEvent): DraftResult;
  confirmPlacement(): OpResult;
  explainTarget(cell: GridPosition): ErrorCode | null;
  /** Same as `RenderHandlers.acknowledgeGate`. */
  acknowledgeGate(ack: GateAck): OpResult;
  /** Rotation capability of the Hand cards of `viewer` (keys: that seat's own Hand only); `{}` without a game. */
  rotationInfo(viewer: PlayerId): RotationInfoMap;
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
const NO_ROTATION_INFO: RotationInfoMap = Object.freeze({});
const ALL_SEAT_IDS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];

/**
 * Rotation capability for each card of `view.myHand` and for no other card. The identity of these cards is already
 * visible to the viewer; screens get booleans, never the fragment table, a corner set or a suit.
 */
function rotationInfoFor(view: PlayerView): RotationInfoMap {
  const info: Partial<Record<CardId, { readonly rotationChangesCorners: boolean }>> = {};
  for (const card of view.myHand) info[card] = Object.freeze({ rotationChangesCorners: rotationChangesCorners(card) });
  return Object.freeze(info);
}

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
  /** Gate sequencing markers (design "Gate sequencing model"). Closure state, not part of the model. */
  let lastPrivateSeat: PlayerId | null = null;
  let acknowledgedSeat: PlayerId | null = null;

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

  const humanSeatsOf = (config: GameConfig): PlayerId[] => config.seats.filter((s) => s.kind === 'HUMAN').map((s) => s.id);

  /**
   * The seat whose private view may be shown now (design "Controller: seat-to-show and gate"), ignoring the gate.
   * One human seat: that seat, always. Two to four: the turn seat in PLACEMENT when it is human; in GUESS_COLLECT the
   * first human seat (seat order) that has not submitted; otherwise `null` (AI turn, REVEAL, ENDED). No human: `null`.
   */
  function candidateSeat(g: Game): PlayerId | null {
    const humans = humanSeatsOf(g.config);
    if (humans.length < 2) return humans[0] ?? null;
    const state = g.state;
    if (state.phase === 'PLACEMENT') return humans.includes(state.turn) ? state.turn : null;
    if (state.phase === 'GUESS_COLLECT') {
      const submitted = viewFor(state, 'P0').guessSubmitted; // public flags
      return humans.find((seat) => !submitted[seat]) ?? null;
    }
    return null;
  }

  /**
   * The viewer and the gate for the current game. The gate comes from the pure `nextGate` with the public seat
   * configuration, phase, turn, `guessSubmitted` and the two markers. When a private view is shown, `lastPrivateSeat`
   * becomes that seat and `acknowledgedSeat` is cleared unless it is that seat (design: cleared when another Seat's
   * private view is rendered). With a gate pending, nothing private is shown: `viewer` is `null`.
   */
  function planSeat(): { readonly viewer: PlayerId | null; readonly gate: AppModel['gate'] } {
    const g = game;
    if (g === null) return { viewer: null, gate: null };
    const candidate = candidateSeat(g);
    if (humanSeatsOf(g.config).length < 2 || candidate === null) return { viewer: candidate, gate: null };
    const gate = nextGate({
      seats: g.config.seats,
      phase: g.state.phase,
      turn: g.state.turn,
      guessSubmitted: viewFor(g.state, 'P0').guessSubmitted,
      lastPrivateSeat,
      acknowledgedSeat,
    });
    if (gate !== null) return { viewer: null, gate };
    lastPrivateSeat = candidate;
    if (acknowledgedSeat !== candidate) acknowledgedSeat = null;
    return { viewer: candidate, gate: null };
  }

  /**
   * `PlayerView` for the scoreboard, banner, Seed line, reveal, end screen and a read-only Board of a multi-human game
   * while no private view is shown. It starts from the view of the first human seat and removes everything private: no
   * Hand, no own Guesses, and a board identity only when ALL FOUR seats see it (read from the four `viewFor` results,
   * so the visibility rules stay in core/view). Not a private view; `viewer` is kept for the type only.
   */
  function publicViewOf(g: Game): PlayerView {
    const first = humanSeatsOf(g.config)[0] as PlayerId;
    const views = ALL_SEAT_IDS.map((seat) => viewFor(g.state, seat));
    const base = viewFor(g.state, first);
    const board = base.board.map((cell, index) =>
      cell === null
        ? null
        : { owner: cell.owner, orientation: cell.orientation, card: views.every((v) => v.board[index]?.card != null) ? cell.card : null },
    );
    return deepFreeze({ ...base, board, myHand: [], myGuesses: null });
  }

  /**
   * What a draft depends on: the game epoch, the viewer, the screen, the accepted-Action count, the phase and the
   * turn. When it changes the draft is stale (and an active gesture must be cancelled).
   */
  const draftFingerprint = (m: AppModel): string =>
    `${epoch}|${m.viewer ?? '-'}|${m.screen}|${m.actionCount}|${game === null ? '-' : game.state.phase}|${game === null ? '-' : game.state.turn}`;
  let lastFingerprint = draftFingerprint(store.get());

  /** True when the drafted card is no longer in the Hand of `viewer` (a Hand change that removes it). */
  const cardLeftHand = (m: AppModel): boolean =>
    m.draft.card !== null && (game === null || m.viewer === null || !game.state.hands[m.viewer].includes(m.draft.card));

  /**
   * Applies `patch` to the model together with the values derived from the game, and notifies. It also applies
   * the invalidation rules of the placement draft (see the module comment).
   */
  function setModel(patch: Partial<Omit<AppModel, 'viewer' | 'gate'>>): void {
    const seat = planSeat(); // viewer and gate are always derived from the game and the gate markers
    store.update((m) => {
      const next: AppModel = {
        ...m,
        screen: game === null ? 'SETUP' : game.state.phase === 'ENDED' ? 'END' : 'GAME',
        actionCount: game === null ? 0 : game.state.log.length,
        viewer: seat.viewer,
        gate: seat.gate,
        ...patch,
      };
      const fingerprint = draftFingerprint(next);
      const stale = fingerprint !== lastFingerprint || cardLeftHand(next);
      lastFingerprint = fingerprint;
      return Object.freeze(stale ? { ...next, draft: EMPTY_DRAFT, gestureEpoch: next.gestureEpoch + 1 } : next);
    });
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
        const rotationInfo = view === null ? NO_ROTATION_INFO : rotationInfoFor(view);
        const publicView =
          game !== null && model.viewer === null && humanSeatsOf(game.config).length >= 2 ? publicViewOf(game) : null;
        const seed = game === null ? null : game.state.seed;
        deps.renderer({ view, publicView, seed, model, displayError: displayErrorOf(model), rotationInfo, handlers });
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
    // A pending gate means the next Seat has not taken the device yet: no human Action may be sent around it.
    if (store.get().gate !== null) return { ok: false, reason: 'STALE_GATE' };
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
      setModel({ lastError: null }); // `actionCount` changed, so `setModel` also clears the draft
    } finally {
      inFlight = false;
    }
    cancelPending(); // the state moved on: any pending step was planned for the old state
    scheduleNext();
    return { ok: true };
  }

  /**
   * The screens' `dispatch`: every Action but `PLACE`. A `PLACE` (TypeScript bypassed) is refused before anything else
   * is looked at: no engine call, no state change, no scheduling. `dispatchHuman` stays the trusted path.
   */
  function dispatchFromScreen(action: Action): OpResult {
    if ((action as { readonly type?: unknown } | null)?.type === 'PLACE') return { ok: false, reason: 'PLACE_NOT_ALLOWED' };
    return dispatchHuman(action);
  }

  function begin(config: GameConfig, seed: number): OpResult {
    inFlight = true;
    try {
      const created = newGame({ seed, config });
      if (!created.ok) return rejectWith(created.error.code); // the running game, if any, is untouched
      invalidate();
      game = { state: created.value, config };
      lastAccepted = null;
      // No gate at game start: the person who started the game holds the device and is the first Seat to show, so that
      // Seat (when there is one) counts as the last private Seat. If an AI moves first, the first human Seat gets a gate.
      lastPrivateSeat = candidateSeat(game);
      acknowledgedSeat = null;
      setModel({ lastError: null, aiStalled: false }); // new epoch: draft cleared; viewer and gate are derived
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

  /**
   * Setup screen start (task 19.1). Order: validate the options (`INVALID_CONFIG`), parse the seed text (`SEED_EMPTY`
   * for empty or whitespace-only text; `parseSeed` hashes any other non-decimal text), then `begin`, where `newGame`
   * stays the final authority. `rulesVersion` and the score configuration are those of `defaultConfig()`.
   */
  function startFromSetup(options: SetupOptions): OpResult {
    if (disposed) return { ok: false, reason: 'DISPOSED' };
    if (inFlight) return { ok: false, reason: 'BUSY' };
    const reject = (code: ErrorCode): OpResult => {
      inFlight = true; // the error render may call back into the controller: refuse it as BUSY
      try {
        return rejectWith(code);
      } finally {
        inFlight = false;
      }
    };
    const checked = validateSetup(options);
    if (!checked.ok) return reject('INVALID_CONFIG');
    const seed = parseSeed(checked.value.seedText);
    if (!seed.ok) return reject(seed.error.code);
    const config: GameConfig = {
      ...defaultConfig(),
      seats: seatsFor(checked.value),
      identityVisibility: checked.value.identityVisibility,
    };
    return begin(config, seed.value);
  }

  function startPracticeGame(options: PracticeOptions): OpResult {
    const base = defaultConfig();
    const config = options.identityVisibility === undefined ? base : { ...base, identityVisibility: options.identityVisibility };
    return startGame({ config, seed: options.seed });
  }

  function restart(): OpResult {
    if (disposed) return { ok: false, reason: 'DISPOSED' };
    if (inFlight) return { ok: false, reason: 'BUSY' };
    if (game === null) return { ok: false, reason: 'NO_GAME' };
    return begin(game.config, deps.randomSeed());
  }

  function replaySameSeed(): OpResult {
    if (disposed) return { ok: false, reason: 'DISPOSED' };
    if (inFlight) return { ok: false, reason: 'BUSY' };
    if (game === null) return { ok: false, reason: 'NO_GAME' };
    return begin(game.config, game.state.seed); // deps.randomSeed is not called: the same seed gives the same deal
  }

  function abandon(): OpResult {
    if (disposed) return { ok: false, reason: 'DISPOSED' };
    if (inFlight) return { ok: false, reason: 'BUSY' };
    inFlight = true;
    try {
      invalidate();
      game = null;
      lastAccepted = null;
      lastPrivateSeat = null;
      acknowledgedSeat = null;
      setModel({ lastError: null, aiStalled: false }); // new epoch: draft cleared; viewer and gate are null without a game
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

  // ---- placement draft ------------------------------------------------------------------------------------

  function rotationInfo(viewer: PlayerView['viewer']): RotationInfoMap {
    if (disposed || game === null) return NO_ROTATION_INFO;
    return rotationInfoFor(viewFor(game.state, viewer));
  }

  function draftEvent(event: DraftEvent): DraftResult {
    const model = store.get();
    const g = game;
    if (disposed || g === null || model.viewer === null) return { draft: model.draft, notice: null };
    const view = viewFor(g.state, model.viewer); // the latest view, recomputed for every event
    const result = reduceDraft(model.draft, event, draftContextFor(view, rotationInfoFor(view)));
    if (event.type === 'invalidate') {
      setModel({ draft: result.draft, gestureEpoch: model.gestureEpoch + 1 });
    } else if (result.draft !== model.draft) {
      setModel({ draft: result.draft });
    }
    return result;
  }

  /**
   * The engine's reason for refusing a card on `cell`, from a throwaway probe `PLACE` (the viewer's first Hand card,
   * orientation 0). `reduce` returns a new state or an error and never mutates its input; the result is dropped.
   */
  function probeCode(cell: GridPosition): ErrorCode | null {
    const g = game;
    const viewer = store.get().viewer;
    if (g === null || viewer === null) return null;
    const card = g.state.hands[viewer][0];
    if (card === undefined) return null;
    const raw: unknown = cell;
    const pos: GridPosition =
      typeof raw === 'object' && raw !== null
        ? { row: (raw as GridPosition).row, col: (raw as GridPosition).col }
        : { row: Number.NaN, col: Number.NaN };
    const result = reduce(g.state, { type: 'PLACE', player: viewer, card, pos, orientation: 0 });
    return result.ok ? null : result.error.code;
  }

  function explainTarget(cell: GridPosition): ErrorCode | null {
    if (disposed || inFlight) return null;
    const code = probeCode(cell);
    if (code !== null) setModel({ lastError: errorRecord(code) }); // the game state is untouched
    return code;
  }

  function confirmPlacement(): OpResult {
    if (disposed) return { ok: false, reason: 'DISPOSED' };
    if (inFlight) return { ok: false, reason: 'BUSY' };
    const g = game;
    const model = store.get();
    if (g === null || model.viewer === null) return { ok: false, reason: 'NO_GAME' };
    const viewer = model.viewer;
    const view = viewFor(g.state, viewer);
    const check = validateDraft(model.draft, view, rotationInfoFor(view));
    if (!check.ok) {
      const { issue } = check;
      if (issue === 'NO_CARD' || issue === 'NO_TARGET') return { ok: false, reason: 'DRAFT_INVALID', issue }; // nothing to confirm
      const target = model.draft.target;
      const code = issue === 'TARGET_NOT_LEGAL' && target !== null ? probeCode(target) : errorCodeForIssue(issue);
      // a stale or invalid draft is dropped, nothing is sent, and the reason is shown in the current language
      setModel({
        draft: EMPTY_DRAFT,
        gestureEpoch: model.gestureEpoch + 1,
        ...(code === null ? {} : { lastError: errorRecord(code) }),
      });
      return { ok: false, reason: 'DRAFT_INVALID', issue };
    }
    const action: Action = { type: 'PLACE', player: viewer, card: check.place.card, pos: check.place.pos, orientation: check.place.orientation };
    return dispatchHuman(action); // accepted: actionCount changes and the draft is cleared; rejected: state and draft stay
  }

  /**
   * Single-use, guarded acknowledgement of the pending gate (see `RenderHandlers.acknowledgeGate`). The binding must
   * equal the current gate and `actionCount`; the controller has no other check because every state change (a new
   * game, abandon, an accepted Action) replaces the gate and bumps the count. The gate Seat becomes the last private
   * and the acknowledged Seat, and `planSeat` then shows it (`nextGate` returns null for it).
   */
  function acknowledgeGate(ack: GateAck): OpResult {
    if (disposed) return { ok: false, reason: 'DISPOSED' };
    if (inFlight) return { ok: false, reason: 'BUSY' };
    if (game === null) return { ok: false, reason: 'NO_GAME' };
    const model = store.get();
    const gate = model.gate;
    const raw: unknown = ack;
    const given = typeof raw === 'object' && raw !== null ? (raw as Partial<GateAck>) : {};
    if (gate === null || gate.forSeat !== given.forSeat || gate.purpose !== given.purpose || model.actionCount !== given.actionCount) {
      return { ok: false, reason: 'STALE_GATE' };
    }
    inFlight = true;
    try {
      lastPrivateSeat = gate.forSeat;
      acknowledgedSeat = gate.forSeat;
      setModel({}); // viewer = gate Seat, gate = null; the viewer change clears the draft and bumps gestureEpoch
    } finally {
      inFlight = false;
    }
    return { ok: true };
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
    dispatch: dispatchFromScreen,
    startGame,
    startFromSetup,
    restart,
    replaySameSeed,
    abandon,
    setLanguage: setUiLanguage,
    draftEvent,
    confirmPlacement,
    explainTarget,
    acknowledgeGate,
  });

  const controller: Controller = Object.freeze({
    getModel: () => store.get(),
    getView: (viewer: PlayerId) => (game === null ? null : viewFor(game.state, viewer)),
    getDisplayError: () => displayErrorOf(store.get()),
    dispatchHuman,
    startGame,
    startFromSetup,
    startPracticeGame,
    restart,
    replaySameSeed,
    abandon,
    setLanguage: setUiLanguage,
    draftEvent,
    confirmPlacement,
    explainTarget,
    acknowledgeGate,
    rotationInfo,
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