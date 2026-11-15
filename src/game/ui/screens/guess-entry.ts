// Private Guess entry (task 18.1; design.md "Task 18 interaction contracts", "Guess entry"; requirements 14.3 to 14.5,
// 16.2, 16.6). One form for ONE viewer and ONE batch of pending codes.
//
// Use (the host renders the form only after the Pass_Device_Gate was acknowledged; wiring is task 19.4):
//   let form: GuessEntryHandle | null = null;
//   renderer: (input) => { if (form === null) form = renderGuessEntry(doc, root, input, t); else form.update(input); }
// A form that went stale or submitted does not come back to life: the host disposes it and mounts a new one for the
// next batch or the next viewer.
//
// DOM
//   section.guess-entry
//     div.guess-body
//       form.guess-form  (novalidate; aria-labelledby the title)
//         h2#guess-title, p.guess-intro
//         per pending Quad_Key, in `view.pendingQuadKeys` order:
//           div.guess-field[data-quad-key]
//             label[for=guess-input-<key>]       the public Quad_Key plus the instruction (whole number 4 to 52)
//             input#guess-input-<key>            type=text, inputmode=numeric, autocomplete=off, aria-invalid,
//                                                aria-describedby = region hint + error element
//             p#guess-region-<key>               the public 2x2 region: Quad_Key and its four cell notations
//             p#guess-error-<key> role=alert     the localized inline message of this key
//         p.guess-engine-error role=alert        the engine's localized message when `dispatch` refuses
//         button#guess-submit[type=submit]
//       or p#guess-status[role=status]           "submitted, waiting" / "out of date", after the form is closed
//     div.guess-seats                           public per-Seat "submitted" / "waiting" list from `guessSubmitted`
// Tab order is the DOM order: the inputs, then the submit button.
//
// Submission (`submit`, from the button, Enter in an input, or the form's submit event)
//   1. closed forms, a submission in flight and a form that already sent do nothing;
//   2. a stale form (`isGuessFormStale` against the LATEST input given to `update`: viewer, phase, key set,
//      actionCount, or the viewer already submitted) turns into the status text and sends nothing;
//   3. every input goes through `buildGuesses` (the model validates with the engine's `validateGuess`). On any
//      failure nothing is sent, each invalid key shows its localized message, and the first invalid input takes the
//      focus; the engine state is untouched;
//   4. on success `handlers.dispatch({ type: 'SUBMIT_GUESSES', player: viewer, guesses })` is called ONCE with exactly
//      the key set of the token. `ok` closes the form; `{ ok: false, reason: 'ENGINE', code }` shows the engine's
//      localized message and keeps the form (the engine, e.g. `DUPLICATE_SUBMISSION`, stays the authority).
//   A re-render that happens inside `dispatch` (the controller renders synchronously) is applied after `dispatch`
//   returns, so the form never closes itself as "stale" because of its own submission.
//
// Privacy
//   * The typed text lives only in the input elements (the DOM is the only holder; nothing is copied into a closure
//     variable beyond the validation call). A plain re-render (`update` with the same batch, for example a language
//     change or an AI Seat that submitted) keeps the input elements, so the text and the focus stay. When the form
//     closes (submitted, stale, disposed) every input value is set to '' and the input elements are removed.
//   * The form reads `view.pendingQuadKeys`, `view.guessSubmitted`, `view.rules.seats`, `view.viewer`, `view.phase`
//     and whether `view.myGuesses` is `null`; it never renders `myGuesses` values, `lastReveal` or `history`. The
//     view has no Hidden_Sum for a pending batch; none is shown. AI Guesses and other humans' Guesses are not in the
//     view and are never displayed.
//   * No console, storage, `data-*` value, URL, `title` or global ever holds a Guess. `data-quad-key` and
//     `data-focus-key` hold public Quad_Keys and element names only.
//
// Board association: the label and the region hint name the public Quad_Key and its four cell notations. The Board
// component already marks every pending region (`is-pending-region`); it has no per-code highlight, so the form
// offers the data hook `options.onRegionFocus(quadKey | null)` (called when an input gets or loses the focus, and
// with `null` when the form closes) for a host that wants to highlight one region.
//
// Focus: inputs have the id and `data-focus-key` `guess-input-<key>`, the button `guess-submit`, the status text
// `guess-status`, so `renderWithFocus` keeps the focus on the same control through a re-render. The focus moves to the
// first input when the form is shown (`options.autoFocus`, default true; `focusFirst()` for a host that waits for a
// gate), to the status text after a submission, and to the first invalid input after a failed validation.
//
// Imports: ui/, i18n/, core/view and core/types only. The controller is reached through the structural
// `GuessEntryInput` below, which `RenderInput` satisfies; the form's only path to the game is `handlers.dispatch`.

import type { ErrorCode, PlayerId, QuadKey } from '../../core/types';
import type { PlayerView } from '../../core/view';
import { errorMessageKey } from '../../i18n';
import { createH, renderWithFocus } from '../dom';
import type { CreateDoc, FocusDoc } from '../dom';
import type { Translate } from '../components/card-face';
import { buildGuesses, GUESS_MAX, GUESS_MIN, guessFormToken, isGuessFormStale, regionCells } from '../guess-model';
import type { GuessFormToken } from '../guess-model';

/** The only Action this screen sends. */
export interface GuessSubmitAction {
  readonly type: 'SUBMIT_GUESSES';
  readonly player: PlayerId;
  readonly guesses: Readonly<Record<QuadKey, number>>;
}

/** The part of the controller's `OpResult` the form reads. */
export interface GuessDispatchResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly code?: ErrorCode;
}

/** What the form reads from a render input. The controller's `RenderInput` satisfies this structurally. */
export interface GuessEntryInput {
  readonly view: PlayerView | null;
  readonly model: { readonly actionCount: number };
  readonly handlers: { readonly dispatch: (action: GuessSubmitAction) => GuessDispatchResult };
}

export interface GuessEntryOptions {
  /** Move the focus to the first input when the form is shown. Default `true`. */
  readonly autoFocus?: boolean;
  /** Public hook for a per-code Board highlight: the Quad_Key of the focused input, or `null`. */
  readonly onRegionFocus?: (quadKey: QuadKey | null) => void;
}

export type GuessEntryDocument = CreateDoc & Partial<FocusDoc>;

export type GuessEntryMode = 'form' | 'submitted' | 'stale';

export interface GuessEntryHandle {
  /** The form element root (a child of `root` until `dispose`). */
  readonly element: HTMLElement;
  readonly mode: GuessEntryMode;
  /** The token captured when the form was shown, or `null` when it was shown closed. */
  readonly token: GuessFormToken | null;
  /** Renders `input` into the form. After `dispose` it does nothing. */
  update(input: GuessEntryInput): void;
  /** Validates and sends, exactly like the submit button. */
  submit(): void;
  /** Focuses the first input (or the status text when the form is closed). */
  focusFirst(): void;
  /** Clears every input value, removes the form and the element. Idempotent. */
  dispose(): void;
}

/** Every string key this module passes to `t`, apart from the engine's `error.<code>` messages. */
export const GUESS_ENTRY_STRING_KEYS = [
  'guess.form.label',
  'guess.form.intro',
  'guess.input.label',
  'guess.input.region',
  'guess.error.missing',
  'guess.submit',
  'guess.status.submitted',
  'guess.status.stale',
  'guess.seats.label',
  'guess.seat.submitted',
  'guess.seat.waiting',
] as const;

interface Row {
  readonly key: QuadKey;
  readonly input: HTMLElement;
  readonly label: HTMLElement;
  readonly region: HTMLElement;
  readonly error: HTMLElement;
}

interface RowError {
  readonly code: ErrorCode;
  readonly missing: boolean;
}

function hasFocusApi(doc: GuessEntryDocument): doc is GuessEntryDocument & FocusDoc {
  return 'activeElement' in doc && typeof doc.getElementById === 'function' && typeof doc.querySelector === 'function';
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text; // an unchanged alert or status is not announced again
}

function clear(el: HTMLElement): void {
  while (el.firstChild !== null) el.removeChild(el.firstChild);
}

const inputId = (key: QuadKey): string => `guess-input-${key}`;
const regionId = (key: QuadKey): string => `guess-region-${key}`;
const errorId = (key: QuadKey): string => `guess-error-${key}`;

const valueOf = (input: HTMLElement): string => {
  const value: unknown = (input as unknown as { value?: unknown }).value;
  return typeof value === 'string' ? value : '';
};
const clearValue = (input: HTMLElement): void => {
  (input as unknown as { value: string }).value = '';
};

/** Mounts the Guess form for `input.view` into `root` and returns its handle. */
export function renderGuessEntry(
  doc: GuessEntryDocument,
  root: HTMLElement,
  input: GuessEntryInput,
  t: Translate,
  options: GuessEntryOptions = {},
): GuessEntryHandle {
  const h = createH(doc);
  const range = { min: GUESS_MIN, max: GUESS_MAX };

  let current: GuessEntryInput = input;
  let mode: GuessEntryMode = 'form';
  let token: GuessFormToken | null = null;
  let dispatching = false;
  let sent = false;
  let disposed = false;
  let rowErrors = new Map<QuadKey, RowError>();
  let engineError: ErrorCode | null = null;
  let rows: Row[] = [];
  let titleEl: HTMLElement | null = null;
  let introEl: HTMLElement | null = null;
  let submitEl: HTMLElement | null = null;
  let engineEl: HTMLElement | null = null;
  let statusEl: HTMLElement | null = null;
  let seatItems: { readonly seat: PlayerId; readonly el: HTMLElement }[] = [];

  const bodySlot = h('div', { class: 'guess-body' });
  const seatsLabel = h('p', { class: 'guess-seats-label' });
  const seatsList = h('ul', { class: 'guess-seats-list' });
  const seatsSlot = h('div', { class: 'guess-seats' }, seatsLabel, seatsList);
  const panel = h('section', { class: 'guess-entry' }, bodySlot, seatsSlot);

  const hadSubmitted = (view: PlayerView): boolean => view.guessSubmitted[view.viewer] === true || view.myGuesses !== null;

  // ---- form construction ----------------------------------------------------------------------------------

  function buildRow(key: QuadKey): { readonly row: Row; readonly field: HTMLElement } {
    const label = h('label', { class: 'guess-label', attrs: { for: inputId(key) } });
    const inputEl = h('input', {
      id: inputId(key),
      focusKey: inputId(key),
      class: 'guess-input',
      attrs: { type: 'text', inputmode: 'numeric', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' },
      aria: { describedby: `${regionId(key)} ${errorId(key)}`, invalid: 'false' },
      on: {
        keydown: (event) => {
          const e = event as KeyboardEvent;
          if (e.key !== 'Enter' || e.isComposing === true) return;
          e.preventDefault(); // no implicit form submission on top of ours
          submit();
        },
        focus: () => options.onRegionFocus?.(key),
        blur: () => options.onRegionFocus?.(null),
        input: () => {
          // Typing in a field clears its own message (and an engine message): the text is new.
          if (rowErrors.delete(key) || engineError !== null) {
            engineError = null;
            paint();
          }
        },
      },
    });
    const region = h('p', { id: regionId(key), class: 'guess-region' });
    const error = h('p', { id: errorId(key), class: 'guess-error', attrs: { role: 'alert' } });
    const field = h('div', { class: 'guess-field', attrs: { 'data-quad-key': key } }, label, inputEl, region, error);
    return { row: { key, input: inputEl, label, region, error }, field };
  }

  function buildForm(keys: readonly QuadKey[]): void {
    titleEl = h('h2', { id: 'guess-title', class: 'guess-title' });
    introEl = h('p', { class: 'guess-intro' });
    submitEl = h('button', {
      id: 'guess-submit',
      focusKey: 'guess-submit',
      class: 'guess-submit',
      attrs: { type: 'submit' },
      on: {
        click: (event) => {
          event.preventDefault();
          submit();
        },
      },
    });
    engineEl = h('p', { class: 'guess-engine-error', attrs: { role: 'alert' } });
    const built = keys.map(buildRow);
    rows = built.map((b) => b.row);
    const form = h(
      'form',
      {
        class: 'guess-form',
        attrs: { novalidate: true },
        aria: { labelledby: 'guess-title' },
        on: {
          submit: (event) => {
            event.preventDefault();
            submit();
          },
        },
      },
      titleEl,
      introEl,
      ...built.map((b) => b.field),
      engineEl,
      submitEl,
    );
    clear(bodySlot);
    bodySlot.appendChild(form);
  }

  /** Clears every typed value and removes the inputs: nothing of a Guess stays in the DOM. */
  function discardInputs(): void {
    for (const row of rows) clearValue(row.input);
    const hadRows = rows.length > 0;
    rows = [];
    titleEl = introEl = submitEl = engineEl = null;
    rowErrors = new Map();
    engineError = null;
    clear(bodySlot);
    if (hadRows) options.onRegionFocus?.(null);
  }

  function close(next: 'submitted' | 'stale', focusStatus: boolean): void {
    if (mode !== 'form') return;
    discardInputs();
    mode = next;
    showStatus();
    if (focusStatus) statusEl?.focus();
  }

  function showStatus(): void {
    statusEl = h('p', {
      id: 'guess-status',
      focusKey: 'guess-status',
      class: 'guess-status',
      attrs: { role: 'status', tabindex: -1 },
    });
    clear(bodySlot);
    bodySlot.appendChild(statusEl);
  }

  // ---- text -----------------------------------------------------------------------------------------------

  function messageFor(error: RowError): string {
    return error.missing ? t('guess.error.missing', range) : t(errorMessageKey(error.code));
  }

  function paintSeats(): void {
    const view = current.view;
    setText(seatsLabel, t('guess.seats.label'));
    if (view === null) return;
    const seats = view.rules.seats;
    if (seatItems.length !== seats.length || seatItems.some((item, i) => item.seat !== seats[i]?.id)) {
      clear(seatsList);
      seatItems = seats.map((seat) => ({ seat: seat.id, el: h('li', { class: 'guess-seat' }) }));
      for (const item of seatItems) seatsList.appendChild(item.el);
    }
    seats.forEach((seat, i) => {
      const done = view.guessSubmitted[seat.id] === true;
      setText((seatItems[i] as { el: HTMLElement }).el, t(done ? 'guess.seat.submitted' : 'guess.seat.waiting', { name: seat.name }));
    });
  }

  /** Writes every localized text and state attribute from the closure state. Never rebuilds an input. */
  function paint(): void {
    if (mode === 'form') {
      if (titleEl !== null) setText(titleEl, t('guess.form.label'));
      if (introEl !== null) setText(introEl, t('guess.form.intro', range));
      if (submitEl !== null) setText(submitEl, t('guess.submit'));
      if (engineEl !== null) setText(engineEl, engineError === null ? '' : t(errorMessageKey(engineError)));
      for (const row of rows) {
        setText(row.label, t('guess.input.label', { key: row.key, ...range }));
        setText(row.region, t('guess.input.region', { key: row.key, cells: regionCells(row.key).join(', ') }));
        const error = rowErrors.get(row.key);
        setText(row.error, error === undefined ? '' : messageFor(error));
        row.input.setAttribute('aria-invalid', error === undefined ? 'false' : 'true');
      }
    } else if (statusEl !== null) {
      setText(statusEl, t(mode === 'submitted' ? 'guess.status.submitted' : 'guess.status.stale'));
    }
    paintSeats();
  }

  function repaint(): void {
    if (hasFocusApi(doc)) renderWithFocus(doc, paint);
    else paint();
  }

  // ---- submission -----------------------------------------------------------------------------------------

  function staleNow(): 'submitted' | 'stale' | null {
    if (token === null) return 'stale';
    const reason = isGuessFormStale(token, current.view, current.model.actionCount);
    return reason === null ? null : reason === 'SUBMITTED' ? 'submitted' : 'stale';
  }

  function submit(): void {
    if (disposed || mode !== 'form' || dispatching || sent || token === null) return;
    const closing = staleNow();
    if (closing !== null) {
      close(closing, true);
      repaint();
      return;
    }
    const texts: Record<QuadKey, string> = {};
    for (const row of rows) texts[row.key] = valueOf(row.input);
    const built = buildGuesses(token.keys, texts);
    if (!built.ok) {
      rowErrors = new Map(
        Object.entries(built.errors).map(([key, code]) => [key, { code, missing: built.missing.includes(key) }] as const),
      );
      engineError = null;
      repaint();
      const firstInvalid = rows.find((row) => rowErrors.has(row.key));
      firstInvalid?.input.focus();
      return;
    }
    rowErrors = new Map();
    engineError = null;
    dispatching = true;
    let result: GuessDispatchResult;
    try {
      result = current.handlers.dispatch({ type: 'SUBMIT_GUESSES', player: token.viewer, guesses: built.guesses });
    } finally {
      dispatching = false;
    }
    if (result.ok) {
      sent = true;
      close('submitted', true);
    } else if (result.reason === 'ENGINE' && result.code !== undefined) {
      engineError = result.code;
      const closing2 = staleNow();
      if (closing2 !== null) close(closing2, true);
    } else if (result.reason === 'NO_GAME' || result.reason === 'DISPOSED') {
      close('stale', true);
    } // 'BUSY': nothing was sent and the form stays, so the person can try again
    repaint();
  }

  function update(next: GuessEntryInput): void {
    if (disposed) return;
    current = next;
    if (mode === 'form' && !dispatching) {
      const closing = staleNow();
      if (closing !== null) close(closing, false);
    }
    repaint();
  }

  function focusFirst(): void {
    if (disposed) return;
    if (mode === 'form') rows[0]?.input.focus();
    else statusEl?.focus();
  }

  // ---- initial state --------------------------------------------------------------------------------------

  const view0 = input.view;
  if (view0 !== null && view0.phase === 'GUESS_COLLECT' && view0.pendingQuadKeys.length > 0 && !hadSubmitted(view0)) {
    token = guessFormToken(view0, input.model.actionCount);
    buildForm(token.keys);
  } else {
    mode = view0 !== null && view0.phase === 'GUESS_COLLECT' && hadSubmitted(view0) ? 'submitted' : 'stale';
    showStatus();
  }
  root.appendChild(panel);
  paint();
  if (options.autoFocus !== false) focusFirst();

  return {
    element: panel,
    get mode() {
      return mode;
    },
    get token() {
      return token;
    },
    update,
    submit,
    focusFirst,
    dispose() {
      if (disposed) return;
      discardInputs();
      disposed = true;
      statusEl = null;
      if (panel.parentNode !== null) panel.parentNode.removeChild(panel);
    },
  };
}
