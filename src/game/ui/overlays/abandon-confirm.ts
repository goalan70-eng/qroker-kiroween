// Abandon-game confirmation (task 19.3; requirement 15.5: "WHEN the user chooses to abandon a game in progress, THE
// Practice_UI SHALL ask for confirmation before discarding the game"). A modal `alertdialog` with two buttons: Cancel (the
// safe action, it has the initial focus) and the destructive "Abandon game". The host opens it from the game screen's
// abandon control (task 19.4); this module never abandons by itself.
//
// Guarantees
//   * `open()` NEVER calls `handlers.abandon`. Cancel, Escape and a click on the backdrop call nothing on the game; they
//     only close the dialog.
//   * Confirm calls `handlers.abandon()` EXACTLY once (single flight): a second activation while the call runs does nothing,
//     and after an `ok` result the handle is inert (`mode === 'done'`).
//   * Results: `{ ok: true }` closes (done). `{ ok: false, reason: 'ENGINE', code }` keeps the dialog open and shows the
//     localized engine message. `BUSY` (or any other reason) keeps the dialog open and sends nothing else. `NO_GAME` and
//     `DISPOSED` mean the game is already gone, so the dialog closes as stale.
//   * Only for an active game. `open()` refuses (`mode === 'not-needed'`, nothing shown, `abandon` never called) unless
//     `model.screen === 'GAME'` and the phase is not `ENDED` (`isAbandonable` of overlay-model.ts). A completed game and the
//     setup screen are left to their own controls (the final screen's "new setup" of task 19.2 stays unconfirmed).
//
// STALENESS RULE (the model cannot show a game epoch, so this is what can be known): an open dialog is stale, closes without
// calling `abandon` and reports `'stale'` when an `update` shows
//   * a screen other than `GAME`, or the phase `ENDED`, or
//   * a DECREASE of `model.actionCount` compared with the previous input (a new game or a restart began).
// An INCREASE is NOT stale: AI moves continue while the dialog is open and the person still means this game. Known limit:
// a restart of a game that has 0 accepted Actions looks the same as no change (0 to 0) and is not detected. The host
// should not offer a restart while this dialog is open (it is modal, so no other control is reachable).
//
// Focus: Cancel is focused on open. Tab and Shift+Tab stay inside, Escape cancels (modal.ts). On close the focus returns to
// the element that had it when the dialog opened, else `options.fallbackFocus`. A language change (`update`) re-renders the
// text in place: the dialog stays open and the focus stays on the same button.
//
// PRIVATE DATA: the input has no hand, no Guess and no card; only a screen name, the action count, the language, the phase
// and the `abandon` handler. The dialog never shows seed, scores or cards.
//
// DOM
//   div.overlay-backdrop > div.overlay-dialog.abandon-confirm[role=alertdialog][aria-modal=true][aria-labelledby=abandon-title][aria-describedby=abandon-body][lang]
//     h2#abandon-title[tabindex=-1]
//     p#abandon-body
//     p.abandon-error[role=alert]
//     div.abandon-actions > button#abandon-cancel.abandon-cancel + button#abandon-confirm.abandon-confirm__danger
//
// Imports: ui/, i18n/ and core/types, core/view (types only).

import type { ErrorCode } from '../../core/types';
import type { PlayerView } from '../../core/view';
import { errorMessageKey } from '../../i18n';
import type { Lang } from '../../i18n';
import { createH } from '../dom';
import type { Translate } from '../components/card-face';
import type { ScreenName } from '../store';
import { createModal } from './modal';
import type { ModalDocument } from './modal';
import { isAbandonable } from './overlay-model';

/** The part of the controller's `OpResult` the dialog reads. */
export interface AbandonResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly code?: ErrorCode;
}

/** What the dialog reads. The controller's `RenderInput` satisfies it structurally. No hand, no Guess, no card. */
export interface AbandonInput {
  readonly model: { readonly screen: ScreenName; readonly actionCount: number; readonly language: Lang };
  readonly view: Pick<PlayerView, 'phase'> | null;
  readonly handlers: { readonly abandon: () => AbandonResult };
}

export type AbandonCloseReason = 'cancel' | 'confirmed' | 'stale';

export interface AbandonOptions {
  /** Receives the focus when the opener is gone after closing. */
  readonly fallbackFocus?: Pick<HTMLElement, 'focus'> | null;
  /** Called once per close of an open dialog, with the reason. Not called by `dispose()`. */
  readonly onClose?: (reason: AbandonCloseReason) => void;
}

/** `closed`: can open; `open`: shown; `not-needed`: `open()` was refused (no active game); `done`: abandoned, inert. */
export type AbandonMode = 'closed' | 'open' | 'not-needed' | 'done';

export interface AbandonHandle {
  /** The backdrop that holds the dialog. It is a child of `root` only while open. */
  readonly element: HTMLElement;
  readonly dialog: HTMLElement;
  readonly mode: AbandonMode;
  /** Shows the dialog for an active game, else sets `mode` to `not-needed`. Never abandons. */
  open(): void;
  /** Closes without touching the game. Does nothing unless open and no call is running. */
  cancel(): void;
  /** Activates the destructive button, exactly like a click on it. */
  confirm(): void;
  /** Re-renders the text in place and applies the staleness rule. After `dispose` it does nothing. */
  update(input: AbandonInput): void;
  /** Removes the DOM and the listeners; everything is inert afterwards. Idempotent. */
  dispose(): void;
}

/** Every string key this module passes to `t`, apart from the engine's `error.<code>` messages. */
export const ABANDON_STRING_KEYS = ['abandon.title', 'abandon.body', 'abandon.confirm', 'common.button.cancel'] as const;

export function renderAbandonConfirm(
  doc: ModalDocument,
  root: HTMLElement,
  input: AbandonInput,
  t: Translate,
  options: AbandonOptions = {},
): AbandonHandle {
  const h = createH(doc);
  let current: AbandonInput = input;
  let state: AbandonMode = 'closed';
  let disposed = false;
  let running = false;
  let lastCount = input.model.actionCount;
  let engineError: ErrorCode | null = null;

  const activeNow = (): boolean => isAbandonable({ screen: current.model.screen, phase: current.view?.phase ?? null });

  function closeWith(reason: AbandonCloseReason, next: AbandonMode): void {
    state = next;
    modal.hide();
    options.onClose?.(reason);
  }

  function cancel(): void {
    if (disposed || state !== 'open' || running) return;
    closeWith('cancel', 'closed');
  }

  function confirm(): void {
    if (disposed || state !== 'open' || running) return;
    if (!activeNow() || current.model.actionCount < lastCount) {
      closeWith('stale', 'closed');
      return;
    }
    running = true;
    let result: AbandonResult;
    try {
      result = current.handlers.abandon();
    } finally {
      running = false;
    }
    if (result.ok) {
      closeWith('confirmed', 'done');
    } else if (result.reason === 'ENGINE' && result.code !== undefined) {
      engineError = result.code;
      paint();
    } else if (result.reason === 'NO_GAME' || result.reason === 'DISPOSED') {
      closeWith('stale', 'closed');
    } // 'BUSY' and any other reason: nothing was sent and the dialog stays, so the person can try again
  }

  const titleEl = h('h2', { id: 'abandon-title', class: 'abandon-title', attrs: { tabindex: -1 } });
  const bodyEl = h('p', { id: 'abandon-body', class: 'abandon-body' });
  const errorEl = h('p', { class: 'abandon-error', attrs: { role: 'alert' } });
  const cancelBtn = h('button', { id: 'abandon-cancel', focusKey: 'abandon-cancel', class: 'abandon-cancel', attrs: { type: 'button' }, on: { click: () => cancel() } });
  const confirmBtn = h('button', {
    id: 'abandon-confirm',
    focusKey: 'abandon-confirm',
    class: 'abandon-confirm__danger',
    attrs: { type: 'button' },
    on: { click: () => confirm() },
  });
  const modal = createModal(doc, {
    role: 'alertdialog',
    labelledBy: 'abandon-title',
    describedBy: 'abandon-body',
    fallbackFocus: options.fallbackFocus ?? null,
    onDismiss: cancel,
    backdropDismiss: true,
    dialogClass: 'abandon-confirm',
  });
  modal.dialog.appendChild(titleEl);
  modal.dialog.appendChild(bodyEl);
  modal.dialog.appendChild(errorEl);
  modal.dialog.appendChild(h('div', { class: 'abandon-actions' }, cancelBtn, confirmBtn));

  function paint(): void {
    modal.dialog.setAttribute('lang', current.model.language);
    titleEl.textContent = t('abandon.title');
    bodyEl.textContent = t('abandon.body');
    cancelBtn.textContent = t('common.button.cancel');
    confirmBtn.textContent = t('abandon.confirm');
    const message = engineError === null ? '' : t(errorMessageKey(engineError));
    if (errorEl.textContent !== message) errorEl.textContent = message; // an unchanged alert is not announced again
  }

  paint();

  return {
    element: modal.backdrop,
    dialog: modal.dialog,
    get mode() {
      return state;
    },
    open() {
      if (disposed || state === 'open' || state === 'done') return;
      if (!activeNow()) {
        state = 'not-needed';
        return;
      }
      state = 'open';
      engineError = null;
      lastCount = current.model.actionCount;
      paint();
      modal.show(root, () => cancelBtn);
    },
    cancel,
    confirm,
    update(next) {
      if (disposed) return;
      current = next;
      if (running) return; // judged after `abandon` returns: the controller renders synchronously inside the call
      if (state === 'not-needed' && activeNow()) state = 'closed';
      if (state === 'open' && (!activeNow() || next.model.actionCount < lastCount)) {
        closeWith('stale', 'closed');
        return;
      }
      lastCount = next.model.actionCount;
      paint();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      modal.destroy();
    },
  };
}
