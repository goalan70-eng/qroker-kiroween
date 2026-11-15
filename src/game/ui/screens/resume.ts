// Resume prompt (task 20.4; design.md "Task 20.4 persistence integration contracts" c and d; requirements 18.2, 18.3).
// Shown by the composition host INSTEAD of the setup screen while `model.resume !== null`: a game in progress was found in
// this browser, and the person decides to continue it or to discard it. Nothing starts automatically.
//
// Use (the host mounts it while `model.screen === 'SETUP'` and `model.resume !== null`):
//   if (resume === null) resume = renderResume(doc, root, { model, handlers }, t);
//   else resume.update({ model, handlers });
//
// What it shows: the saved time as `YYYY-MM-DD HH:MM UTC` (cut out of the ISO text, no `Date`), the number of human
// players, a neutral hint and two buttons. It receives no game: no card, board, Guess, sum or Seed can reach it, and the
// closed model type (`resume: { savedAtIso, humanSeats }`) carries nothing else.
//
// Behaviour
//   * Single flight across both buttons. After a handler returned `ok` the handle is `done` (both buttons disabled; the
//     host disposes it when the model changes). A handler runs at most once per handle unless it answered `BUSY`.
//   * `NO_RESUME` (the offer is gone), `DISPOSED`, and `model.resume === null` make the handle `stale`: inert, buttons
//     disabled, no crash. `BUSY` changes nothing and keeps both buttons usable. Any other refusal changes nothing.
//   * The controller renders synchronously inside the handler call, so the host may dispose the handle from inside it;
//     the handle then touches nothing after the handler returned.
//   * "Discard" removes only the saved game (the controller keeps the preferences). It has no confirmation (the spec does
//     not require one) and is one click, labelled "Discard saved game". The focus starts on "Continue".
//   * Texts are written in place with `textContent`; no element is rebuilt, so the focus survives a language change.
//
// Imports: ui/, i18n/ only (screen-class module of boundaries.test.ts). No storage, clock, console or global.

import type { Lang, StringKey } from '../../i18n';
import type { Translate } from '../components/card-face';
import { createH } from '../dom';
import type { CreateDoc } from '../dom';

/** The part of the controller's `OpResult` the prompt reads. */
export interface ResumeOpResult {
  readonly ok: boolean;
  readonly reason?: string;
}

/** What the prompt reads from a render input. The controller's `RenderInput` satisfies this structurally. */
export interface ResumeInput {
  readonly model: {
    readonly language: Lang;
    readonly resume: { readonly savedAtIso: string; readonly humanSeats: number } | null;
  };
  readonly handlers: {
    readonly continueSaved: () => ResumeOpResult;
    readonly discardSaved: () => ResumeOpResult;
  };
}

export interface ResumeOptions {
  /** Move the focus to "Continue" when the prompt is shown. Default `true`. */
  readonly autoFocus?: boolean;
}

export type ResumeDocument = CreateDoc;

/**
 * `active`: both buttons work; `done`: one of them succeeded; `stale`: there is nothing to continue or discard any more
 * (offer gone, handler disposed or `model.resume` is `null`).
 */
export type ResumeMode = 'active' | 'done' | 'stale';

export interface ResumeHandle {
  readonly element: HTMLElement;
  readonly mode: ResumeMode;
  /** Re-renders the texts for `input`. `model.resume === null` makes the handle stale. After `dispose` it does nothing. */
  update(input: ResumeInput): void;
  /** Activates "Continue", exactly like the button. */
  continueSaved(): void;
  /** Activates "Discard saved game", exactly like the button. */
  discardSaved(): void;
  /** Focuses "Continue". */
  focusFirst(): void;
  /** Removes the prompt. Idempotent; no handler runs afterwards. */
  dispose(): void;
}

/** Every string key this module passes to `t`. */
export const RESUME_STRING_KEYS = [
  'persistence.resume.title',
  'persistence.resume.body',
  'persistence.resume.savedAt',
  'persistence.resume.humans',
  'persistence.resume.hint',
  'persistence.resume.continue',
  'persistence.resume.discard',
] as const satisfies readonly StringKey[];

const ISO_MINUTE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/;

/** `YYYY-MM-DD HH:MM UTC` from the start of an ISO text, or `null` when the text does not start like one. */
export function formatSavedTime(iso: string): string | null {
  const match = ISO_MINUTE.exec(iso);
  return match === null ? null : `${match[1]} ${match[2]} UTC`;
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/** Mounts the prompt into `root` and returns its handle. */
export function renderResume(doc: ResumeDocument, root: HTMLElement, input: ResumeInput, t: Translate, options: ResumeOptions = {}): ResumeHandle {
  const h = createH(doc);
  let current: ResumeInput = input;
  let mode: ResumeMode = input.model.resume === null ? 'stale' : 'active';
  let running = false;
  let disposed = false;
  /** The last offer that was shown: a stale or finished prompt keeps its texts until the host removes it. */
  let shown: NonNullable<ResumeInput['model']['resume']> | null = input.model.resume;

  const titleEl = h('h2', { id: 'resume-title', class: 'resume-title', attrs: { tabindex: -1 } });
  const bodyEl = h('p', { class: 'resume-body' });
  const savedAtEl = h('p', { class: 'resume-saved-at' });
  const humansEl = h('p', { class: 'resume-humans' });
  const hintEl = h('p', { id: 'resume-hint', class: 'resume-hint' });
  const continueButton = h('button', {
    id: 'resume-continue',
    focusKey: 'resume-continue',
    class: 'resume-button resume-continue',
    attrs: { type: 'button' },
    aria: { describedby: 'resume-hint' },
    on: { click: () => activate('continueSaved') },
  });
  const discardButton = h('button', {
    id: 'resume-discard',
    focusKey: 'resume-discard',
    class: 'resume-button resume-discard',
    attrs: { type: 'button' },
    on: { click: () => activate('discardSaved') },
  });
  const actionsEl = h('div', { class: 'resume-actions', attrs: { role: 'group' } }, continueButton, discardButton);
  const panel = h('section', { class: 'resume', aria: { labelledby: 'resume-title' } }, titleEl, bodyEl, savedAtEl, humansEl, hintEl, actionsEl);

  function setDisabled(on: boolean): void {
    if (!on) return; // only ever turned on: a finished or stale prompt stays inert
    for (const button of [continueButton, discardButton]) {
      (button as unknown as { disabled: boolean }).disabled = true;
      button.setAttribute('disabled', '');
    }
  }

  function paint(): void {
    setText(titleEl, t('persistence.resume.title'));
    setText(bodyEl, t('persistence.resume.body'));
    const time = shown === null ? null : formatSavedTime(shown.savedAtIso);
    setText(savedAtEl, time === null ? '' : t('persistence.resume.savedAt', { time }));
    if (time === null) savedAtEl.setAttribute('hidden', '');
    else savedAtEl.removeAttribute('hidden');
    setText(humansEl, shown === null ? '' : t('persistence.resume.humans', { n: shown.humanSeats }));
    setText(hintEl, t('persistence.resume.hint'));
    setText(continueButton, t('persistence.resume.continue'));
    setText(discardButton, t('persistence.resume.discard'));
    setDisabled(mode !== 'active');
  }

  function activate(which: 'continueSaved' | 'discardSaved'): void {
    if (disposed || mode !== 'active' || running) return;
    running = true;
    let result: ResumeOpResult;
    try {
      result = current.handlers[which]();
    } finally {
      running = false;
    }
    if (disposed) return; // the host replaced the prompt while the controller rendered
    if (result.ok) mode = 'done';
    else if (result.reason === 'NO_RESUME' || result.reason === 'DISPOSED') mode = 'stale';
    // 'BUSY' and every other refusal: nothing changed, both buttons stay usable
    paint();
  }

  function update(next: ResumeInput): void {
    if (disposed) return;
    current = next;
    if (next.model.resume !== null) shown = next.model.resume;
    else if (mode === 'active') mode = 'stale';
    paint();
  }

  root.appendChild(panel);
  paint();
  if (options.autoFocus !== false && mode === 'active') continueButton.focus();

  return {
    element: panel,
    get mode() {
      return mode;
    },
    update,
    continueSaved: () => activate('continueSaved'),
    discardSaved: () => activate('discardSaved'),
    focusFirst() {
      if (!disposed) continueButton.focus();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (panel.parentNode !== null) panel.parentNode.removeChild(panel);
    },
  };
}
