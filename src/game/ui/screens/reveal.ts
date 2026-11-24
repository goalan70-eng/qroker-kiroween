// Public reveal screen (task 18.2; design.md "Task 18 interaction contracts", "Reveal screen and scoreboard";
// requirements 14.6, 16.2). One screen for the latest Reveal_Result; it is PUBLIC (every Seat may see it), so it
// needs no Pass_Device_Gate.
//
// Use (wiring into the page is task 19.4):
//   let screen: RevealHandle | null = null;
//   renderer: (input) => { if (screen === null) screen = renderReveal(doc, root, input, t); else screen.update(input); }
// A handle belongs to ONE reveal: it captures `model.actionCount` when it is shown. After the continue control was
// used, or when the phase or the action count moved on, the handle is stale and sends nothing; the host disposes it
// and mounts a new one for the next reveal.
//
// Model (`buildRevealModel`)
//   Built ONLY from `view.lastReveal`, `view.rules` (Seat names, provisional flag), `view.phase` and `view.scores`.
//   It has no Guess field of any kind: the type-level test of reveal.test-d.ts and the runtime scans of reveal.test.ts
//   guard that. `null` when `view.lastReveal` is null.
//
// What the RevealRecord supplies, and how it is shown (nothing is invented):
//   * `batchIndex` (0-based; the screen says "reveal batchIndex + 1"), `placer`, per code `quadKey`, `cards` and
//     `hiddenSum`, and per Seat `earned` and `cumulative`.
//   * `cumulative` is the score after this batch's prediction points and BEFORE the hand-empty bonus (core/view.ts).
//     In phase `ENDED`, `view.scores` already contains the bonus, so the table adds one more column with the current
//     `view.scores` ("final score, including any end-of-game bonus"). The bonus amount and its receiver are not
//     decided here and not shown separately; the two columns are the record's number and the view's number.
//
// OPEN PRODUCT POLICY: the engine contract is FOUR revealed cards per completed code and this screen renders the
// cards exactly as the current record supplies them. Whether the product should reveal one card or four per code is
// an open decision (OQ, reveal policy); nothing in this module decides it or depends on the number of cards.
//
// Cards: a revealed card is public, but the record carries NO owner and NO orientation for it. The face component's
// `renderCardFace` always writes `data-owner`, `data-orientation` and an accessible name with "owner: ...", which
// would be false here, so this screen takes the PURE `cardFaceModel` (rank, suit glyph, ink tone, size class) and
// builds a face element without those attributes. The accessible name is the rank and suit only
// (`reveal.card.name`). No CardId, suit or rank appears in any class, `data-*`, `title` or id; the rank and suit are
// in the visible text and the aria-label of the card, as for any publicly revealed card (Task 17 privacy rule).
//
// DOM
//   section.reveal[aria-labelledby=reveal-title]
//     h2#reveal-title
//     div.reveal-content            rebuilt on every render
//       p.reveal-banner[role=note]  only while `rules.scoreConfig.provisional` (common.provisionalScoring)
//       p.reveal-placer
//       section.reveal-code[data-quad-key][aria-labelledby=reveal-code-<key>-title]  per completed code
//         h3, p.reveal-sum, ul.reveal-cards[aria-label] > li > span.card-face
//       table.reveal-points > caption, thead th[scope=col], tbody tr > th[scope=row] name, td earned, td total (, td final)
//       or p.reveal-empty            when there is no reveal
//     div.reveal-actions
//       p.reveal-engine-error[role=alert]
//       button#reveal-continue[type=button]   or   p#reveal-status[role=status]
//
// Continue control: `handlers.dispatch({ type: 'ACK_REVEAL' })` once. It does nothing after the first activation,
// when `actionCount` differs from the captured value, when the phase is not `REVEAL`, or when a dispatch is in
// flight. The control is a native button: Enter and Space also work (the keydown handler prevents the native click so
// a key press never activates twice). In `ENDED` and in the empty state there is no control (the final screen is
// task 19.2). A refused dispatch shows the engine's localized message and keeps the control.
//
// Focus: the button has `data-focus-key` `reveal-continue`, so `renderWithFocus` keeps the focus through a re-render;
// it takes the focus when the screen is shown (`options.autoFocus`, default true) and the status text takes it after
// the control was used.
//
// Imports: ui/, i18n/, core/types and core/view only.

import type { CardId, ErrorCode, PlayerId, QuadKey } from '../../core/types';
import type { PlayerView } from '../../core/view';
import { errorMessageKey } from '../../i18n';
import type { StringKey } from '../../i18n';
import { createH, renderWithFocus } from '../dom';
import type { CreateDoc, FocusDoc, HFunction } from '../dom';
import { cardFaceModel } from '../components/card-face';
import type { Translate } from '../components/card-face';

// ---------------------------------------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------------------------------------

export interface RevealCode {
  readonly quadKey: QuadKey;
  /** The card identities the record supplies (public once revealed). */
  readonly cards: readonly CardId[];
  /** The publicly revealed Hidden_Sum. */
  readonly hiddenSum: number | null;
}

export interface RevealSeat {
  readonly id: PlayerId;
  readonly name: string;
  /** Points earned by the batch. */
  readonly earned: number;
  /** The record's cumulative score: after the batch, before any hand-empty bonus. */
  readonly cumulative: number;
  /** `view.scores` of the Seat when the phase is `ENDED` (it includes any end-of-game bonus), else `null`. */
  readonly finalScore: number | null;
}

/** Everything the reveal screen shows. No Guess field of any kind (type-level test in reveal.test-d.ts). */
export interface RevealViewModel {
  /** 0-based index of the batch, as the record has it. */
  readonly batchIndex: number;
  readonly placer: { readonly id: PlayerId; readonly name: string };
  readonly codes: readonly RevealCode[];
  readonly seats: readonly RevealSeat[];
  /** `view.phase === 'REVEAL'`. */
  readonly canContinue: boolean;
  /** `view.phase === 'ENDED'`. */
  readonly ended: boolean;
  /** `rules.scoreConfig.provisional`. A flag only: it carries no point value. */
  readonly provisional: boolean;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** The model of the latest reveal in `view`, or `null` when there is none. Pure and deterministic; frozen. */
export function buildRevealModel(view: PlayerView): RevealViewModel | null {
  const record = view.lastReveal;
  if (record === null) return null;
  const seatName = (id: PlayerId): string => view.rules.seats.find((seat) => seat.id === id)?.name ?? id;
  const ended = view.phase === 'ENDED';
  return deepFreeze({
    batchIndex: record.batchIndex,
    placer: { id: record.placer, name: seatName(record.placer) },
    codes: record.codes.map((code) => ({ quadKey: code.quadKey, cards: [...code.cards], hiddenSum: code.hiddenSum })),
    seats: record.perPlayer.map((entry) => ({
      id: entry.player,
      name: seatName(entry.player),
      earned: entry.earned,
      cumulative: entry.cumulative,
      finalScore: ended ? view.scores[entry.player] : null,
    })),
    canContinue: view.phase === 'REVEAL',
    ended,
    provisional: view.rules.scoreConfig.provisional,
  });
}

// ---------------------------------------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------------------------------------

/** The only Action this screen sends. */
export interface RevealAckAction {
  readonly type: 'ACK_REVEAL';
}

/** The part of the controller's `OpResult` the screen reads. */
export interface RevealDispatchResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly code?: ErrorCode;
}

/** What the screen reads from a render input. The controller's `RenderInput` satisfies this structurally. */
export interface RevealInput {
  readonly view: PlayerView | null;
  readonly model: { readonly actionCount: number };
  readonly handlers: { readonly dispatch: (action: RevealAckAction) => RevealDispatchResult };
}

export interface RevealOptions {
  /** Move the focus to the continue button when the screen is shown. Default `true`. */
  readonly autoFocus?: boolean;
  /** Draw the provisional banner inside the screen. Default `true`; a host that mounts components/banner.ts passes `false`. */
  readonly banner?: boolean;
}

export type RevealDocument = CreateDoc & Partial<FocusDoc>;

/** `active`: the control works; `sent`: it was used; `stale`: the reveal moved on; `ended`: the game is over; `empty`: no reveal. */
export type RevealMode = 'active' | 'sent' | 'stale' | 'ended' | 'empty';

export interface RevealHandle {
  /** The screen root (a child of `root` until `dispose`). */
  readonly element: HTMLElement;
  readonly mode: RevealMode;
  /** Renders `input` into the screen. After `dispose` it does nothing. */
  update(input: RevealInput): void;
  /** Activates the continue control, exactly like the button. */
  acknowledge(): void;
  /** Focuses the continue button (or the status text when there is no button). */
  focusContinue(): void;
  /** Removes the screen. Idempotent. */
  dispose(): void;
}

/** Every string key this module passes to `t`, apart from the engine's `error.<code>` messages. */
export const REVEAL_STRING_KEYS = [
  'reveal.title',
  'reveal.empty',
  'reveal.placer',
  'reveal.code.title',
  'reveal.code.cards',
  'reveal.code.sum',
  'reveal.card.name',
  'reveal.points.caption',
  'reveal.points.seat',
  'reveal.points.earned',
  'reveal.points.total',
  'reveal.points.final',
  'reveal.continue',
  'reveal.status.continuing',
  'reveal.status.stale',
  'reveal.status.ended',
  'common.provisionalScoring',
] as const;

function hasFocusApi(doc: RevealDocument): doc is RevealDocument & FocusDoc {
  return 'activeElement' in doc && typeof doc.getElementById === 'function' && typeof doc.querySelector === 'function';
}

function clear(el: HTMLElement): void {
  while (el.firstChild !== null) el.removeChild(el.firstChild);
}

/** A face for a publicly revealed card: rank and suit only. See the module comment for why not `renderCardFace`. */
export function revealCardFace(h: HFunction, card: CardId, t: Translate): HTMLElement {
  // The owner and the orientation are required by the model but never written: the record does not supply them.
  const face = cardFaceModel({ card, owner: 'NEUTRAL', orientation: 0, size: 'hand', ownerLabel: '' });
  const rankKey = face.nameKeyParams.rank as StringKey | undefined;
  const rank = face.nameParams.rank ?? (rankKey === undefined ? '' : t(rankKey));
  const suit = t(face.nameKeyParams.suit as StringKey);
  return h(
    'span',
    { class: face.className, attrs: { role: 'img' }, aria: { label: t('reveal.card.name', { rank, suit }) } },
    h(
      'span',
      { class: 'card-face__glyphs', aria: { hidden: 'true' } },
      h('span', { class: 'card-face__rank' }, face.rankText),
      h('span', { class: 'card-face__suit' }, face.suitGlyph),
    ),
  );
}

/** Mounts the reveal screen for `input.view` into `root` and returns its handle. */
export function renderReveal(
  doc: RevealDocument,
  root: HTMLElement,
  input: RevealInput,
  t: Translate,
  options: RevealOptions = {},
): RevealHandle {
  const h = createH(doc);
  let current: RevealInput = input;
  let mode: RevealMode;
  let actionCount = input.model.actionCount;
  let dispatching = false;
  let disposed = false;
  let engineError: ErrorCode | null = null;
  let buttonEl: HTMLElement | null = null;
  let statusEl: HTMLElement | null = null;

  const titleEl = h('h2', { id: 'reveal-title', class: 'reveal-title' });
  const contentSlot = h('div', { class: 'reveal-content' });
  const engineEl = h('p', { class: 'reveal-engine-error', attrs: { role: 'alert' } });
  const actionSlot = h('div', { class: 'reveal-actions' }, engineEl);
  const panel = h('section', { class: 'reveal', aria: { labelledby: 'reveal-title' } }, titleEl, contentSlot, actionSlot);

  function modeFor(view: PlayerView | null): RevealMode {
    if (view === null || view.lastReveal === null) return 'empty';
    if (view.phase === 'ENDED') return 'ended';
    return view.phase === 'REVEAL' ? 'active' : 'stale';
  }

  function stale(): boolean {
    const view = current.view;
    return view === null || view.phase !== 'REVEAL' || current.model.actionCount !== actionCount;
  }

  // ---- rendering ------------------------------------------------------------------------------------------

  function paintContent(model: RevealViewModel | null): void {
    clear(contentSlot);
    if (model === null) {
      contentSlot.appendChild(h('p', { class: 'reveal-empty' }, t('reveal.empty')));
      return;
    }
    if (model.provisional && options.banner !== false) {
      contentSlot.appendChild(h('p', { class: 'reveal-banner', attrs: { role: 'note' } }, t('common.provisionalScoring')));
    }
    contentSlot.appendChild(
      h('p', { class: 'reveal-placer' }, t('reveal.placer', { n: model.batchIndex + 1, name: model.placer.name })),
    );
    for (const code of model.codes) {
      const titleId = `reveal-code-${code.quadKey}-title`;
      contentSlot.appendChild(
        h(
          'section',
          { class: 'reveal-code', attrs: { 'data-quad-key': code.quadKey }, aria: { labelledby: titleId } },
          h('h3', { id: titleId, class: 'reveal-code-title' }, t('reveal.code.title', { key: code.quadKey })),
          code.hiddenSum === null ? null : h('p', { class: 'reveal-sum' },
            h('span', null, t('reveal.code.sum', { sum: '' })),
            h('strong', null, code.hiddenSum),
          ),
          code.cards.length === 0 ? null : h(
            'ul',
            { class: 'reveal-cards', aria: { label: t('reveal.code.cards', { key: code.quadKey }) } },
            ...code.cards.map((card) => h('li', { class: 'reveal-card' }, revealCardFace(h, card, t))),
          ),
        ),
      );
    }
    const columns = [t('reveal.points.seat'), t('reveal.points.earned'), t('reveal.points.total')];
    if (model.ended) columns.push(t('reveal.points.final'));
    contentSlot.appendChild(
      h(
        'table',
        { class: 'reveal-points' },
        h('caption', null, t('reveal.points.caption')),
        h('thead', null, h('tr', null, ...columns.map((text) => h('th', { attrs: { scope: 'col' } }, text)))),
        h(
          'tbody',
          null,
          ...model.seats.map((seat) =>
            h(
              'tr',
              { attrs: { 'data-seat': seat.id } },
              h('th', { attrs: { scope: 'row' } }, seat.name),
              h('td', { class: 'reveal-earned' }, h('span', { class: 'score-stamp' }, seat.earned)),
              h('td', { class: 'reveal-total' }, seat.cumulative),
              seat.finalScore === null ? null : h('td', { class: 'reveal-final' }, seat.finalScore),
            ),
          ),
        ),
      ),
    );
  }

  function showStatus(text: StringKey): void {
    if (statusEl === null) {
      statusEl = h('p', { id: 'reveal-status', focusKey: 'reveal-status', class: 'reveal-status', attrs: { role: 'status', tabindex: -1 } });
      if (buttonEl !== null && buttonEl.parentNode !== null) buttonEl.parentNode.removeChild(buttonEl);
      buttonEl = null;
      actionSlot.appendChild(statusEl);
    }
    const message = t(text);
    if (statusEl.textContent !== message) statusEl.textContent = message;
  }

  function showButton(): void {
    if (buttonEl !== null) return;
    buttonEl = h('button', {
      id: 'reveal-continue',
      focusKey: 'reveal-continue',
      class: 'reveal-continue',
      attrs: { type: 'button' },
      on: {
        click: () => acknowledge(),
        keydown: (event) => {
          const e = event as KeyboardEvent;
          if (e.isComposing === true || e.altKey === true || e.metaKey === true || e.ctrlKey === true) return;
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault(); // no second, native click for the same key press
            if (e.repeat !== true) acknowledge();
          }
        },
      },
    });
    actionSlot.appendChild(buttonEl);
  }

  function paint(): void {
    const view = current.view;
    titleEl.textContent = t('reveal.title');
    paintContent(view === null ? null : buildRevealModel(view));
    const message = engineError === null ? '' : t(errorMessageKey(engineError));
    if (engineEl.textContent !== message) engineEl.textContent = message; // an unchanged alert is not announced again
    if (mode === 'active') {
      showButton();
      if (buttonEl !== null && buttonEl.textContent !== t('reveal.continue')) buttonEl.textContent = t('reveal.continue');
    } else if (mode === 'sent') {
      showStatus('reveal.status.continuing');
    } else if (mode === 'stale') {
      showStatus('reveal.status.stale');
    } else if (mode === 'ended') {
      showStatus('reveal.status.ended');
    } else if (statusEl !== null && statusEl.parentNode !== null) {
      statusEl.parentNode.removeChild(statusEl);
      statusEl = null;
    }
  }

  function repaint(): void {
    if (hasFocusApi(doc)) renderWithFocus(doc, paint);
    else paint();
  }

  // ---- behaviour ------------------------------------------------------------------------------------------

  function acknowledge(): void {
    if (disposed || mode !== 'active' || dispatching) return;
    if (stale()) {
      mode = 'stale';
      repaint();
      return;
    }
    dispatching = true;
    let result: RevealDispatchResult;
    try {
      result = current.handlers.dispatch({ type: 'ACK_REVEAL' });
    } finally {
      dispatching = false;
    }
    if (result.ok) {
      mode = 'sent';
      engineError = null;
    } else if (result.reason === 'ENGINE' && result.code !== undefined) {
      engineError = result.code;
      if (stale()) mode = 'stale';
    } else if (result.reason === 'NO_GAME' || result.reason === 'DISPOSED') {
      mode = 'stale';
    } // 'BUSY': nothing was sent and the control stays, so the person can try again
    repaint();
    if (mode !== 'active') statusEl?.focus();
  }

  function update(next: RevealInput): void {
    if (disposed) return;
    current = next;
    // A re-render inside `dispatch` (the controller renders synchronously) is judged after `dispatch` returns.
    if (mode === 'active' && !dispatching && stale()) mode = 'stale';
    repaint();
  }

  function focusContinue(): void {
    if (disposed) return;
    if (buttonEl !== null) buttonEl.focus();
    else statusEl?.focus();
  }

  // ---- initial state --------------------------------------------------------------------------------------

  mode = modeFor(input.view);
  root.appendChild(panel);
  paint();
  if (options.autoFocus !== false && mode === 'active') focusContinue();

  return {
    element: panel,
    get mode() {
      return mode;
    },
    update,
    acknowledge,
    focusContinue,
    dispose() {
      if (disposed) return;
      disposed = true;
      buttonEl = null;
      statusEl = null;
      if (panel.parentNode !== null) panel.parentNode.removeChild(panel);
    },
  };
}
