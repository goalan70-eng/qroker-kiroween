// Composition host of the production page (task 19.4; design.md "Task 19.4 composition contracts", "Composition host").
//
// `createGameScreen({ doc, root, randomSeedText })` returns `{ render, dispose }`. `render` is a `Renderer` (it takes the
// controller's `RenderInput`) and is passed to `mountApp` by `main.ts`. The host holds no game state and no controller: it
// reads `RenderInput` only (views, model subset, handlers) and writes DOM. The only state it owns is the `OverlayState`
// (changed through `reduceOverlay` only) and its DOM handles.
//
// Persistent handles. Each component has ONE handle that is created when the component becomes visible, updated by
// `update(input)` on every render, and disposed when it stops being visible. Nothing is recreated on a plain re-render,
// so typed Guess text, focus, an active drag gesture and an open overlay survive a re-render and a language change.
//
//   mode (from `model.screen`, `model.gate`, the phase and whether `view` is private)   handles that exist
//   SETUP    no game                                                                    setup
//   RESUME   no game and `model.resume !== null` (task 20.4)                            resume prompt INSTEAD of setup
//   GATE     `model.gate !== null`                                                      gate ONLY (+ bar banner)
//   PLACEMENT  phase PLACEMENT and a private `view`                                     panel (board, hand, controls), scoreboard
//   WAIT     an AI Seat acts and no private view, or a private view while the AI Seats  read-only board, scoreboard, status
//            of a Guess batch have not submitted yet
//   GUESS    GUESS_COLLECT, private `view`, every AI Seat has `guessSubmitted`          guess form, board with the regions, scoreboard
//   REVEAL   phase REVEAL (`publicView ?? view`)                                        reveal, read-only board, scoreboard
//   END      phase ENDED (`publicView ?? view`)                                         end, scoreboard
//
// Gate order. When `model.gate` is not null the host closes an open overlay, then creates the gate through
// `renderPrivacyGate`, whose `clearPrivate` hook is `disposeGameplay`: the Hand, Board, Guess form and every other
// game handle are removed SYNCHRONOUSLY, before one node of the gate exists. While the gate is shown nothing else is drawn
// (no Seed line, no scoreboard, no opener buttons) and no overlay can open. The gate's `onAcknowledge` calls
// `handlers.acknowledgeGate` with the binding of the CURRENT render (`update` re-binds the gate on every render, because
// `actionCount` can change while a gate is open when an AI Seat submits).
//
// Persistence (task 20.4). While `model.resume` is set the resume prompt replaces the setup screen (the setup handle is not
// created); after Continue or Discard the model changes and the next reconcile shows the game, its gate, or the setup
// screen. The notices region (components/notices.ts) is one handle in the top bar on EVERY screen, outside the private
// game region and visible during a gate; it carries closed codes only. Help stays hidden over the resume prompt and over a
// gate. The setup screen starts with `model.setupPrefs` and reports pref changes to `handlers.setSetupPrefs`.
//
// One banner. A single `renderBanner` lives in the top bar; the scoreboard, reveal and end screen are created with
// `{ banner: false }`. Without a game it shows the default "provisional" flag, like the help text.
//
// Overlays. `OverlayState` changes only through `reduceOverlay` (events: open help, open abandon, close, Escape from the
// modal, `CONTEXT` on every render). While an overlay is open the main region gets `inert` and `aria-hidden`; both are
// removed BEFORE the overlay closes, so the focus can go back to the opener (a browser refuses to focus inert elements).
//
// Privacy. Private handles (`panel`, `guess`, the board of a private view) exist only while `input.view` is a private view
// and no gate is pending. Nothing from `RenderInput` is stored except the latest input (for callbacks) and the public
// `rules` object (for the banner during a gate). The Seed line is public by the contract IC-13 of the design.
//
// Imports: ui/, i18n/, core/types and core/view (screen-class module of boundaries.test.ts).

import type { QuadKey } from '../../core/types';
import type { PlayerView } from '../../core/view';
import { t } from '../../i18n';
import { renderBanner } from '../components/banner';
import type { BannerHandle } from '../components/banner';
import { renderNotices } from '../components/notices';
import type { NoticesHandle } from '../components/notices';
import { boardModel, renderBoard, viewerOwnerLabel, defaultOwnerLabel, type BoardView } from '../components/board';
import type { Translate } from '../components/card-face';
import { renderPlacementPanel } from '../components/placement-panel';
import type { PlacementPanelDocument, PlacementPanelHandle } from '../components/placement-panel';
import { renderScoreboard } from '../components/scoreboard';
import type { ScoreboardHandle } from '../components/scoreboard';
import type { RenderInput } from '../controller';
import { createH, renderWithFocus } from '../dom';
import type { FocusDoc } from '../dom';
import { regionCells } from '../guess-model';
import { renderAbandonConfirm } from '../overlays/abandon-confirm';
import type { AbandonHandle } from '../overlays/abandon-confirm';
import { renderHelp } from '../overlays/help';
import type { HelpHandle } from '../overlays/help';
import type { ModalDocument } from '../overlays/modal';
import { isAbandonable, reduceOverlay } from '../overlays/overlay-model';
import type { OverlayEvent, OverlayState } from '../overlays/overlay-model';
import { EMPTY_DRAFT } from '../placement-draft';
import { renderEnd } from './end';
import type { EndHandle } from './end';
import { renderGuessEntry } from './guess-entry';
import type { GuessEntryHandle } from './guess-entry';
import { renderPrivacyGate } from './privacy-gate';
import type { GatePurpose, PrivacyGateHandle } from './privacy-gate';
import { renderResume } from './resume';
import type { ResumeHandle } from './resume';
import { renderReveal } from './reveal';
import type { RevealHandle } from './reveal';
import { renderSetup } from './setup';
import type { SetupHandle } from './setup';

/** What the host needs from the page: element creation, hit testing and listeners, the modal's body and focus access. */
export type GameScreenDocument = PlacementPanelDocument & ModalDocument & FocusDoc;

export interface GameScreenOptions {
  readonly doc: GameScreenDocument;
  /** The page root. The host appends its element to it on the first render (after the shell). */
  readonly root: HTMLElement;
  /** A random default seed text for the setup screen and its "random seed" button. `main.ts` builds it from `crypto`. */
  readonly randomSeedText: () => string;
}

export interface GameScreen {
  /** The host element (a child of `root` from the first render until `dispose`). */
  readonly element: HTMLElement;
  /** A `Renderer`: `mountApp` calls it after every model change. After `dispose` it does nothing. */
  readonly render: (input: RenderInput) => void;
  /** Disposes every handle, removes the DOM and detaches the listeners. Idempotent; no callback acts afterwards. */
  dispose(): void;
}

type Mode = 'SETUP' | 'RESUME' | 'GATE' | 'PLACEMENT' | 'WAIT' | 'GUESS' | 'REVEAL' | 'END' | 'EMPTY';

/** What the banner reads while no game runs: the provisional flag only (the default, like the help text). */
const NO_GAME_RULES = { rules: { scoreConfig: { provisional: true } } } as unknown as Pick<PlayerView, 'rules'>;
const NOOP_BOARD_HANDLERS = { draftEvent: (): void => undefined, explainTarget: (): void => undefined };

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text; // an unchanged live or alert text is not announced again
}

function setHidden(el: HTMLElement, hidden: boolean): void {
  if (hidden) el.setAttribute('hidden', '');
  else el.removeAttribute('hidden');
}

function clear(el: HTMLElement): void {
  while (el.firstChild !== null) el.removeChild(el.firstChild);
}

/** The cell button of a Board element at (row, col). Walks `children` only, so the fake document works too. */
function findCell(el: Element, row: number, col: number): Element | null {
  for (const child of Array.from(el.children)) {
    if (child.getAttribute('data-row') === String(row) && child.getAttribute('data-col') === String(col)) return child;
    const found = findCell(child, row, col);
    if (found !== null) return found;
  }
  return null;
}

const seatName = (view: PlayerView, id: string): string => view.rules.seats.find((s) => s.id === id)?.name ?? id;

/** True when every AI Seat has submitted its Guesses (public flags): only then may a Guess form be mounted. */
const aiSeatsSubmitted = (view: PlayerView): boolean =>
  view.rules.seats.every((seat) => seat.kind !== 'AI' || view.guessSubmitted[seat.id] === true);

export function createGameScreen(options: GameScreenOptions): GameScreen {
  const { doc, root } = options;
  const h = createH(doc);
  const tr: Translate = t;
  const hasFocusApi = typeof doc.getElementById === 'function' && typeof doc.querySelector === 'function' && 'activeElement' in doc;

  let disposed = false;
  let attached = false;
  let reconciling = false;
  let pending: RenderInput | null = null;
  let latest: RenderInput | null = null;
  let lastRules: Pick<PlayerView, 'rules'> = NO_GAME_RULES;
  let overlay: OverlayState = 'NONE';
  let overlayOpener: Pick<HTMLElement, 'focus'> | null = null;
  let helpKey = '';
  let mode: Mode = 'SETUP';
  let focusedRegion: QuadKey | null = null;
  let boardSig = '';
  let boardView: BoardView = 'portrait';

  // ---- static DOM -----------------------------------------------------------------------------------------

  const helpButton = h('button', {
    id: 'game-help-open',
    focusKey: 'game-help-open',
    class: 'game-bar__button',
    attrs: { type: 'button' },
    on: { click: () => openOverlay({ type: 'OPEN_HELP' }) },
  });
  const page = root.ownerDocument;
  const canFullscreen = !!page?.fullscreenEnabled && typeof page.documentElement.requestFullscreen === 'function';
  const fullscreenFeedback = h('span', { class: 'fullscreen-feedback', attrs: { role: 'status' } });
  const fullscreenButton = h('button', {
    id: 'game-fullscreen', class: 'game-bar__button', attrs: { type: 'button' },
    on: { click: async () => {
      if (!canFullscreen) return;
      setText(fullscreenFeedback, '');
      try {
        if (page.fullscreenElement) await page.exitFullscreen();
        else await page.documentElement.requestFullscreen();
      } catch {
        if (!disposed) setText(fullscreenFeedback, tr('game.fullscreen.failed'));
      }
    } },
  });
  function syncFullscreen(): void {
    const active = !!page?.fullscreenElement;
    const label = tr(active ? 'game.fullscreen.exit' : 'game.fullscreen.enter');
    setText(fullscreenButton, label);
    fullscreenButton.setAttribute('title', label);
    fullscreenButton.setAttribute('data-active', String(active));
  }
  if (canFullscreen) page.addEventListener('fullscreenchange', syncFullscreen);

  const boardViewButton = h('button', {
    id: 'game-board-view', class: 'game-bar__button', attrs: { type: 'button' },
    on: { click: () => {
      if (disposed || latest === null) return;
      boardView = boardView === 'portrait' ? 'landscape' : 'portrait';
      render(latest);
    } },
  });
  const abandonButton = h('button', {
    id: 'game-abandon-open',
    focusKey: 'game-abandon-open',
    class: 'game-bar__button',
    attrs: { type: 'button' },
    on: {
      click: () => {
        const input = latest;
        if (input === null) return;
        const data = input.publicView ?? input.view;
        openOverlay({ type: 'OPEN_ABANDON', screen: input.model.screen, phase: data === null ? null : data.phase });
      },
    },
  });
  const bannerSlot = h('div', { class: 'game-banner-slot' });
  const noticesSlot = h('div', { class: 'game-notices-slot' });
  const tools = h('div', { class: 'table-tools' }, helpButton, fullscreenButton, abandonButton, fullscreenFeedback);
  const bar = h('div', { class: 'game-bar', attrs: { role: 'group' } }, boardViewButton, tools, bannerSlot, noticesSlot);
  const seedEl = h('p', { class: 'game-seed' });
  const liveEl = h('div', { class: 'game-live', aria: { live: 'polite', atomic: 'true' } });
  const setupSlot = h('div', { class: 'game-setup-slot' });
  const gateSlot = h('div', { class: 'game-gate-slot' });
  const statusEl = h('p', { class: 'game-status' });
  const errorEl = h('p', { class: 'game-error', attrs: { role: 'alert' } });
  const boardSlot = h('div', { class: 'game-board-slot' });
  const panelSlot = h('div', { class: 'game-panel-slot' });
  const mainSlot = h('div', { class: 'game-main-slot' });
  const scoreSlot = h('div', { class: 'game-score-slot' });
  const layout = h('div', { class: 'game-layout' }, statusEl, errorEl, boardSlot, panelSlot, mainSlot, scoreSlot);
  const inertEl = h('main', { class: 'game-main', id: 'game-main' }, bar, seedEl, liveEl, setupSlot, gateSlot, layout);
  const overlaySlot = h('div', { class: 'game-overlays' });
  const hostEl = h('div', { class: 'game-host' }, inertEl, overlaySlot);

  const banner: BannerHandle = renderBanner(doc, bannerSlot, { view: NO_GAME_RULES }, tr);

  // ---- handles --------------------------------------------------------------------------------------------

  let notices: NoticesHandle | null = null;
  let resume: ResumeHandle | null = null;
  let setup: SetupHandle | null = null;
  let setupSeedText = '';
  let gate: { readonly handle: PrivacyGateHandle; readonly seat: string; readonly purpose: GatePurpose } | null = null;
  let panel: PlacementPanelHandle | null = null;
  let guess: { readonly handle: GuessEntryHandle; readonly key: string } | null = null;
  let reveal: { readonly handle: RevealHandle; readonly count: number } | null = null;
  let end: { readonly handle: EndHandle; readonly count: number } | null = null;
  let score: ScoreboardHandle | null = null;

  const disposeSetup = (): void => {
    setup?.dispose();
    setup = null;
  };
  const disposeResume = (): void => {
    resume?.dispose();
    resume = null;
  };
  const disposePanel = (): void => {
    panel?.dispose();
    panel = null;
  };
  const disposeGuess = (): void => {
    guess?.handle.dispose(); // clears every typed value
    guess = null;
    focusedRegion = null;
  };
  const disposeReveal = (): void => {
    reveal?.handle.dispose();
    reveal = null;
  };
  const disposeEnd = (): void => {
    end?.handle.dispose();
    end = null;
  };
  const disposeScore = (): void => {
    score?.dispose();
    score = null;
  };
  const clearBoard = (): void => {
    clear(boardSlot);
    boardSig = '';
  };
  const disposeGate = (): void => {
    gate?.handle.dispose();
    gate = null;
  };

  /** Removes every handle of the game screens (private ones first) and their texts. */
  function disposeGame(): void {
    disposePanel();
    disposeGuess();
    clearBoard();
    disposeReveal();
    disposeEnd();
    disposeScore();
    setText(statusEl, '');
    setText(errorEl, '');
  }

  /** Removes every handle but the gate. It is the gate's `clearPrivate` hook. */
  function disposeGameplay(): void {
    disposeGame();
    disposeSetup();
  }

  // ---- overlays -------------------------------------------------------------------------------------------

  const newHelp = (): HelpHandle =>
    renderHelp(doc, overlaySlot, { model: { language: latest?.model.language ?? 'en' }, provisional: true }, tr, {
      fallbackFocus: helpButton,
      onClose: () => applyOverlay({ type: 'CLOSE' }),
    });
  const newAbandon = (): AbandonHandle =>
    renderAbandonConfirm(doc, overlaySlot, abandonInput(), tr, {
      fallbackFocus: helpButton,
      onClose: () => applyOverlay({ type: 'CLOSE' }),
    });
  const abandonInput = (): Parameters<typeof renderAbandonConfirm>[2] => {
    const input = latest;
    const data = input === null ? null : (input.publicView ?? input.view);
    return {
      model: input === null ? { screen: 'SETUP', actionCount: 0, language: 'en' } : input.model,
      view: data === null ? null : { phase: data.phase },
      handlers: { abandon: () => (latest === null ? { ok: false, reason: 'NO_GAME' } : latest.handlers.abandon()) },
    };
  };
  let help: HelpHandle = newHelp();
  let abandon: AbandonHandle = newAbandon();

  function setInert(on: boolean): void {
    if (on) {
      inertEl.setAttribute('inert', '');
      inertEl.setAttribute('aria-hidden', 'true');
    } else {
      inertEl.removeAttribute('inert');
      inertEl.removeAttribute('aria-hidden');
    }
  }

  /** Gives the focus back to the control that opened the overlay (or the help button when it is gone or hidden). */
  function restoreOpenerFocus(): void {
    const opener = overlayOpener as (Pick<HTMLElement, 'focus'> & Partial<Node> & Partial<Element>) | null;
    overlayOpener = null;
    const usable =
      opener !== null && opener.focus !== undefined && doc.body.contains(opener as Node) && opener.hasAttribute?.('hidden') !== true;
    (usable ? opener : helpButton).focus();
  }

  /** Makes the overlay handles match `overlay`. Un-inerts BEFORE closing so that the focus can return to the opener. */
  function syncOverlay(): void {
    const wantHelp = overlay === 'HELP';
    const wantAbandon = overlay === 'ABANDON_CONFIRM';
    if (overlay === 'NONE') setInert(false);
    if (!wantHelp && help.mode === 'open') help.close();
    if (!wantAbandon && abandon.mode === 'open') abandon.cancel();
    if (wantHelp && help.mode !== 'open') {
      help.open();
    }
    if (wantAbandon && abandon.mode !== 'open') {
      if (abandon.mode === 'done' || abandon.mode === 'not-needed') {
        abandon.dispose(); // a finished dialog is inert for good: a new game needs a new one
        abandon = newAbandon();
      }
      abandon.open();
    }
    if (overlay !== 'NONE') {
      if (help.mode === 'open' || abandon.mode === 'open') setInert(true);
      else overlay = 'NONE'; // the dialog refused to open (no active game): the state follows the handle
    }
  }

  /** The only way the overlay state changes. */
  function applyOverlay(event: OverlayEvent): void {
    if (disposed) return;
    const next = reduceOverlay(overlay, event);
    if (next === overlay) return;
    const was = overlay;
    overlay = next;
    syncOverlay();
    if (was !== 'NONE' && overlay === 'NONE') restoreOpenerFocus(); // after inert is gone
  }

  function openOverlay(event: OverlayEvent): void {
    if (disposed || latest === null || latest.model.gate !== null || latest.model.resume !== null) return; // no overlay opens over a gate or the resume prompt
    if (overlay === 'NONE') overlayOpener = doc.activeElement as unknown as Pick<HTMLElement, 'focus'> | null;
    applyOverlay(event);
    if (overlay === 'NONE') overlayOpener = null;
  }

  // ---- Board (read-only, with the pending-region highlight) ------------------------------------------------

  function markRegion(board: HTMLElement, key: QuadKey, focused = true): void {
    for (const notation of regionCells(key)) {
      const match = /^([A-H])([1-8])$/.exec(notation);
      if (match === null) continue;
      const cell = findCell(board, Number(match[2]) - 1, (match[1] as string).charCodeAt(0) - 65);
      if (cell !== null) {
        const classes = (cell.getAttribute('class') ?? '').split(' ').filter(name => name !== 'is-focused-region');
        if (focused) classes.push('is-focused-region');
        cell.setAttribute('class', classes.join(' '));
        if (notation === key && focused) cell.setAttribute('data-focused-junction', '');
        else if (notation === key) cell.removeAttribute('data-focused-junction');
      }
    }
  }

  function paintBoard(input: RenderInput, data: PlayerView): void {
    const privateView = input.view !== null;
    const sig = [input.model.actionCount, input.model.language, data.viewer, data.phase, privateView ? 'v' : 'p', boardView].join('|');
    if (sig === boardSig && boardSlot.firstChild !== null) return;
    boardSig = sig;
    const build = (): void => {
      clear(boardSlot);
      const ownerLabel = privateView ? viewerOwnerLabel(data.viewer, tr) : defaultOwnerLabel(tr);
      const board = renderBoard(h, boardModel(data, EMPTY_DRAFT), tr, NOOP_BOARD_HANDLERS, { ownerLabel, boardBacks: input.backs?.board, boardView, viewButton: boardViewButton });
      boardSlot.appendChild(board);
      if (focusedRegion !== null) markRegion(board, focusedRegion);
    };
    if (hasFocusApi) renderWithFocus(doc, build);
    else build();
  }

  // ---- reconcile ------------------------------------------------------------------------------------------

  function modeOf(input: RenderInput, data: PlayerView | null): Mode {
    if (input.model.screen === 'SETUP') return input.model.resume !== null ? 'RESUME' : 'SETUP';
    if (input.model.gate !== null) return 'GATE';
    if (data === null) return 'EMPTY';
    switch (data.phase) {
      case 'PLACEMENT':
        return input.view !== null ? 'PLACEMENT' : 'WAIT';
      case 'GUESS_COLLECT':
        return input.view !== null && aiSeatsSubmitted(input.view) ? 'GUESS' : 'WAIT';
      case 'REVEAL':
        return 'REVEAL';
      case 'ENDED':
        return 'END';
    }
  }

  function liveTextOf(input: RenderInput, data: PlayerView | null): string {
    const gateModel = input.model.gate;
    if (gateModel !== null) return tr('game.live.gate', { name: gateModel.name });
    if (data === null) return '';
    switch (data.phase) {
      case 'PLACEMENT':
        return tr('game.live.turn', { name: seatName(data, data.turn) });
      case 'GUESS_COLLECT':
        return tr('game.live.guess');
      case 'REVEAL':
        return tr('game.live.reveal', { n: (data.lastReveal?.batchIndex ?? 0) + 1 });
      case 'ENDED':
        return tr('game.live.ended');
    }
  }

  function statusTextOf(data: PlayerView | null): string {
    if (data === null) return '';
    if (data.phase === 'PLACEMENT') return tr('game.status.aiTurn', { name: seatName(data, data.turn) });
    if (data.phase === 'GUESS_COLLECT') return tr('game.status.aiGuess');
    return '';
  }

  function showGate(input: RenderInput): void {
    const model = input.model;
    const wanted = model.gate;
    if (wanted === null) return;
    applyOverlay({ type: 'CLOSE' }); // an open overlay closes first; no overlay opens over a gate
    if (gate !== null && (gate.handle.closed || gate.seat !== wanted.forSeat || gate.purpose !== wanted.purpose)) disposeGate();
    if (gate !== null) {
      gate.handle.update(wanted, model.actionCount); // re-bound to the CURRENT actionCount
      return;
    }
    const handle = renderPrivacyGate(
      doc,
      gateSlot,
      {
        gate: wanted,
        actionCount: model.actionCount,
        clearPrivate: disposeGameplay, // (1) every private node goes before one node of the gate exists
        current: () => ({ gate: latest === null ? null : latest.model.gate, actionCount: latest === null ? -1 : latest.model.actionCount }),
        onAcknowledge: (ack) => {
          if (disposed || latest === null) return;
          const result = latest.handlers.acknowledgeGate(ack);
          // A refused acknowledgement leaves the gate pending: the next reconcile shows it again.
          if (!result.ok && !disposed && latest !== null) reconcile(latest);
        },
      },
      tr,
    );
    gate = { handle, seat: wanted.forSeat, purpose: wanted.purpose };
  }

  function reconcile(input: RenderInput): void {
    latest = input;
    const data = input.publicView ?? input.view;
    if (data !== null) lastRules = { rules: data.rules };
    else if (input.model.screen === 'SETUP') lastRules = NO_GAME_RULES;
    const previous = mode;
    mode = modeOf(input, data);

    // CONTEXT keeps an open abandon confirmation honest when the game ends or is replaced.
    applyOverlay({ type: 'CONTEXT', screen: input.model.screen, phase: data === null ? null : data.phase });

    if (mode === 'GATE') {
      showGate(input);
    } else {
      disposeGate();
    }

    // The bar, the Seed line and the texts.
    const inGame = input.model.screen !== 'SETUP' && mode !== 'GATE';
    if (mode === 'SETUP' && boardViewButton.parentNode !== bar) {
      boardViewButton.parentNode?.removeChild(boardViewButton);
      bar.appendChild(boardViewButton);
    }
    const hasBoard = mode === 'PLACEMENT' || mode === 'WAIT' || mode === 'GUESS' || mode === 'REVEAL';
    setHidden(fullscreenButton, !hasBoard || !canFullscreen);
    if (!hasBoard) setText(fullscreenFeedback, '');
    syncFullscreen();
    setText(boardViewButton, tr('board.view.landscape'));
    boardViewButton.setAttribute('title', tr('board.view.rotate'));
    helpButton.setAttribute('title', tr('help.open'));
    abandonButton.setAttribute('title', tr('abandon.open'));
    boardViewButton.setAttribute('aria-pressed', String(boardView === 'landscape'));
    setHidden(boardViewButton, mode === 'GATE' || mode === 'RESUME' || mode === 'END' || mode === 'EMPTY');
    setText(helpButton, tr('help.open'));
    setText(abandonButton, tr('abandon.open'));
    bar.setAttribute('aria-label', tr('game.bar.label'));
    setHidden(helpButton, mode === 'GATE' || mode === 'RESUME');
    setHidden(abandonButton, mode === 'GATE' || !isAbandonable({ screen: input.model.screen, phase: data === null ? null : data.phase }));
    banner.update({ view: data !== null ? data : mode === 'GATE' ? lastRules : NO_GAME_RULES });
    setHidden(seedEl, !inGame || input.seed === null);
    // The Seed text is written only while the line is shown: during a gate (including the one after a resume) the DOM holds no Seed digits.
    setText(seedEl, inGame && input.seed !== null ? tr('game.seed', { seed: input.seed }) : '');
    setText(liveEl, mode === 'SETUP' || mode === 'EMPTY' ? '' : liveTextOf(input, data));

    showNotices(input);

    switch (mode) {
      case 'SETUP':
        disposeGame();
        disposeResume();
        showSetup(input, previous !== 'SETUP');
        break;
      case 'RESUME':
        disposeGame();
        disposeSetup();
        showResume(input);
        break;
      case 'GATE':
        disposeResume();
        break; // `showGate` already removed everything else
      case 'EMPTY':
        disposeResume();
        disposeGameplay();
        break;
      default:
        disposeResume();
        disposeSetup();
        showGame(input, data as PlayerView, previous);
    }

    // Texts that depend on the language, then the overlays' own input.
    const provisional = data !== null ? data.rules.scoreConfig.provisional : lastRules.rules.scoreConfig.provisional;
    const key = `${input.model.language}|${String(provisional)}`;
    if (key !== helpKey || help.mode === 'open') {
      helpKey = key;
      help.update({ model: { language: input.model.language }, provisional });
    }
    abandon.update(abandonInput());
  }

  /** The notices region of the top bar: one handle on every screen, updated on every render. */
  function showNotices(input: RenderInput): void {
    // The autosave line is about the running game: an ended game's save is removed on purpose, and the setup has no game, so
    // `DURABLE` is not shown there as "saved".
    const storage = input.model.screen === 'GAME' ? input.model.storage : 'UNKNOWN';
    const next = { model: { notices: input.model.notices, storage }, handlers: input.handlers };
    if (notices === null) notices = renderNotices(doc, noticesSlot, next, tr);
    else notices.update(next);
  }

  function showSetup(input: RenderInput, afterGame: boolean): void {
    const next = { model: input.model, handlers: input.handlers, initialSeedText: setupSeedText, initialPrefs: input.model.setupPrefs };
    if (setup === null) {
      setupSeedText = options.randomSeedText();
      setup = renderSetup(doc, setupSlot, { ...next, initialSeedText: setupSeedText }, tr, {
        randomSeedText: options.randomSeedText,
        onPrefsChange: (prefs) => {
          if (!disposed && latest !== null) latest.handlers.setSetupPrefs(prefs);
        },
      });
      if (afterGame) setup.focusFirst(); // the focus was in the game that is gone
    } else {
      setup.update(next);
    }
  }

  function showResume(input: RenderInput): void {
    const next = { model: input.model, handlers: input.handlers };
    if (resume === null) resume = renderResume(doc, setupSlot, next, tr);
    else resume.update(next);
  }

  function showGame(input: RenderInput, data: PlayerView, previous: Mode): void {
    // Scoreboard: public numbers of the view that is shown (private view or `publicView`).
    const scoreOptions = { banner: false, backs: input.backs, openHandSeat: mode === 'PLACEMENT' ? input.view?.viewer : undefined };
    if (score === null) score = renderScoreboard(doc, scoreSlot, data, tr, scoreOptions);
    else score.update(data, scoreOptions);

    // Placement panel (private view of the viewer).
    if (mode === 'PLACEMENT') {
      clearBoard();
      if (panel === null) {
        panel = renderPlacementPanel(doc, panelSlot, { ...input, boardView, viewButton: boardViewButton }, tr);
        if (previous !== 'PLACEMENT') focusFirstCard();
      } else {
        panel.update({ ...input, boardView, viewButton: boardViewButton });
      }
    } else {
      disposePanel();
    }

    // Read-only Board.
    if (mode === 'WAIT' || mode === 'GUESS' || mode === 'REVEAL') paintBoard(input, data);
    else clearBoard();

    // Guess form (only when every AI Seat has submitted, so an AI submission cannot go stale an open form).
    if (mode === 'GUESS' && input.view !== null) {
      const view = input.view;
      const key = `${view.viewer}|${view.pendingQuadKeys.join(',')}`;
      if (guess !== null && guess.key !== key) disposeGuess();
      if (guess === null) {
        const handle = renderGuessEntry(doc, mainSlot, input, tr, {
          onRegionFocus: (quadKey) => {
            if (disposed || quadKey === focusedRegion) return;
            const board = boardSlot.firstChild as HTMLElement | null;
            if (board && focusedRegion) markRegion(board, focusedRegion, false);
            focusedRegion = quadKey;
            if (board && quadKey) markRegion(board, quadKey);
          },
        });
        guess = { handle, key };
      } else {
        guess.handle.update(input);
      }
    } else {
      disposeGuess();
    }

    // Reveal and end screens (public: `publicView ?? view`).
    const screenInput = { view: data, model: input.model, handlers: input.handlers };
    if (mode === 'REVEAL') {
      if (reveal !== null && reveal.count !== input.model.actionCount) disposeReveal();
      if (reveal === null) reveal = { handle: renderReveal(doc, mainSlot, screenInput, tr, { banner: false }), count: input.model.actionCount };
      else reveal.handle.update(screenInput);
    } else {
      disposeReveal();
    }
    if (mode === 'END') {
      if (end !== null && end.count !== input.model.actionCount) disposeEnd();
      if (end === null) end = { handle: renderEnd(doc, mainSlot, screenInput, tr, { banner: false }), count: input.model.actionCount };
      else end.handle.update(screenInput);
    } else {
      disposeEnd();
    }

    // Status (an AI Seat acts, nothing private is shown) and the one place of the display error outside the panel.
    setText(statusEl, mode === 'WAIT' ? statusTextOf(data) : '');
    setText(errorEl, mode === 'WAIT' && input.displayError !== null ? input.displayError.message : '');
  }

  /** After a gate or a reveal the focus is gone: put it on the first Hand card so a keyboard user can continue. */
  function focusFirstCard(): void {
    const active = doc.activeElement as unknown;
    if (active !== null && active !== undefined && active !== doc.body) return;
    const card = doc.querySelector('[data-focus-key="hand-0"]') as Partial<Pick<HTMLElement, 'focus'>> | null;
    card?.focus?.();
  }

  // ---- public API -----------------------------------------------------------------------------------------

  function render(input: RenderInput): void {
    if (disposed) return;
    if (!attached) {
      root.appendChild(hostEl);
      attached = true;
    }
    if (reconciling) {
      pending = input; // a render requested from inside a render: run it afterwards, with the latest input only
      return;
    }
    reconciling = true;
    try {
      let next: RenderInput | null = input;
      for (let pass = 0; next !== null && pass < 5 && !disposed; pass++) {
        pending = null;
        reconcile(next);
        next = pending;
      }
    } finally {
      reconciling = false;
      pending = null;
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposeGate();
    disposeResume();
    disposeGameplay();
    notices?.dispose();
    notices = null;
    help.dispose();
    abandon.dispose();
    banner.dispose();
    if (canFullscreen) page.removeEventListener('fullscreenchange', syncFullscreen);
    disposed = true;
    latest = null;
    overlayOpener = null;
    if (hostEl.parentNode !== null) hostEl.parentNode.removeChild(hostEl);
  }

  return { element: hostEl, render, dispose };
}
