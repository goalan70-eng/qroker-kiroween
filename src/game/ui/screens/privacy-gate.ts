// Pass_Device_Gate (task 18.1; design.md "Task 18 interaction contracts", "Gate sequencing model"; requirements 14.1
// to 14.5, 16.2, 16.6). Two parts in one module:
//   1. `nextGate`: the pure sequencing model. It decides from the PUBLIC seat configuration, the phase, the turn, the
//      per-seat `guessSubmitted` flags and the two "which seat is already holding the device" markers whether a gate
//      is due before a different human Seat's private view, and for whom. No DOM, no clock, no randomness; the result
//      is frozen.
//   2. `renderPrivacyGate`: the full-screen interstitial component built with `h()` semantics of ui/dom.ts.
//
// Scope (task 18.1 delivers the ISOLATED gate contract only). Activating the gate in the composed page and switching
// `AppModel.viewer` between human Seats belong to task 19.4. Nothing here is wired into `main.ts` or the shell, and
// no claim of full browser privacy is made before tasks 19.4 and 21.
//
// Host order (the host is the page composition of task 19.4; the component enforces step 1 and 2 itself):
//   (1) `clearPrivate()` removes the previous Seat's private DOM (Hand, Guess form) SYNCHRONOUSLY, before anything of
//       the gate exists; (2) the gate DOM is created and shown; (3) after the acknowledgement the host sets
//       `acknowledgedSeat`, and only then renders the next Seat's private view and sets `lastPrivateSeat`.
//
// Acknowledgement: single use. The callback is bound to `(forSeat, purpose, actionCount)` and does nothing unless
// `options.current()` still reports the same gate (the host evaluates `nextGate` on its latest input) at the same
// `actionCount`. A double click, a stale handle or a second handle of an already acknowledged gate is a no-op;
// `onAcknowledge` runs exactly once. The gate element is removed BEFORE `onAcknowledge` runs, so no gate DOM remains
// when the private view is rendered.
//
// A language change or any re-render while the gate is shown goes through `update`, which re-localizes the SAME gate
// in place (the same button keeps the focus); the component has no path that shows a private view.
//
// Privacy: the model and the DOM carry only the next Seat's id, public name and the purpose (`HAND` or `GUESS`).
// No CardId, Guess, owner-only identity or Hidden_Sum is read, so none can appear in text, attributes, `aria-label`
// or a hidden node. The seat id appears nowhere in the DOM (the name is enough).
//
// Focus: the acknowledge button has the id and `data-focus-key` `privacy-gate-ack`, so `renderWithFocus` finds it
// again; it takes the focus when the gate is shown. After the acknowledgement the focus goes to the host (first
// Guess input via `GuessEntryHandle.focusFirst`, or the Hand).
//
// Imports: ui/, i18n/, core/view and core/types only (screen-class module of boundaries.test.ts).

import type { PlayerId } from '../../core/types';
import type { GamePhase, PlayerView } from '../../core/view';
import { createH, renderWithFocus } from '../dom';
import type { CreateDoc, FocusDoc } from '../dom';
import type { Translate } from '../components/card-face';

// ---------------------------------------------------------------------------------------------------------
// Sequencing model
// ---------------------------------------------------------------------------------------------------------

export type GatePurpose = 'HAND' | 'GUESS';

export interface GateInput {
  /** `view.rules.seats`: the real seat kinds and public names. */
  readonly seats: PlayerView['rules']['seats'];
  readonly phase: GamePhase;
  readonly turn: PlayerId;
  readonly guessSubmitted: Readonly<Record<PlayerId, boolean>>;
  /** The Seat whose private view was rendered last, or `null`. */
  readonly lastPrivateSeat: PlayerId | null;
  /** The Seat whose gate was already acknowledged, or `null`. */
  readonly acknowledgedSeat: PlayerId | null;
}

/** Public data only: the next Seat, its public name and what it is about to do. */
export interface GateModel {
  readonly forSeat: PlayerId;
  readonly name: string;
  readonly purpose: GatePurpose;
}

function gateFor(seat: { readonly id: PlayerId; readonly name: string }, purpose: GatePurpose): GateModel {
  return Object.freeze({ forSeat: seat.id, name: seat.name, purpose });
}

/**
 * The gate due before the next private view, or `null`. See the table of design.md: no gate for one human Seat, for
 * AI Seats, in `REVEAL` and `ENDED`, and when the candidate already holds the device (`lastPrivateSeat`) or was
 * already acknowledged (`acknowledgedSeat`).
 */
export function nextGate(input: GateInput): GateModel | null {
  const humans = input.seats.filter((seat) => seat.kind === 'HUMAN');
  if (humans.length < 2) return null; // one person never hands the device over
  let candidate: GateModel | null = null;
  if (input.phase === 'PLACEMENT') {
    const seat = humans.find((s) => s.id === input.turn); // an AI turn has no human candidate
    candidate = seat === undefined ? null : gateFor(seat, 'HAND');
  } else if (input.phase === 'GUESS_COLLECT') {
    const seat = humans.find((s) => input.guessSubmitted[s.id] !== true);
    candidate = seat === undefined ? null : gateFor(seat, 'GUESS');
  }
  if (candidate === null) return null; // REVEAL, ENDED, an AI turn, or every human Seat has submitted
  if (candidate.forSeat === input.lastPrivateSeat || candidate.forSeat === input.acknowledgedSeat) return null;
  return candidate;
}

// ---------------------------------------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------------------------------------

/** What the host currently wants: the gate `nextGate` returns for its latest input, and the latest `actionCount`. */
export interface GateCurrent {
  readonly gate: GateModel | null;
  readonly actionCount: number;
}

/** What `onAcknowledge` receives: the binding of the acknowledged gate. */
export interface GateAcknowledgement {
  readonly forSeat: PlayerId;
  readonly purpose: GatePurpose;
  readonly actionCount: number;
}

export interface PrivacyGateOptions {
  readonly gate: GateModel;
  /** `actionCount` of the model when the gate is shown. */
  readonly actionCount: number;
  /** Removes the previous Seat's private DOM. Called synchronously, before the gate DOM is created. */
  readonly clearPrivate: () => void;
  /** The host's latest `nextGate(...)` result and `actionCount`; the acknowledgement checks it. */
  readonly current: () => GateCurrent;
  /** Called exactly once, after the gate DOM is removed. */
  readonly onAcknowledge: (ack: GateAcknowledgement) => void;
}

export type PrivacyGateDocument = CreateDoc & Partial<FocusDoc>;

export interface PrivacyGateHandle {
  /** The gate element (a child of `root` until the acknowledgement or `dispose`). */
  readonly element: HTMLElement;
  /** Re-localizes or re-binds the gate in place (language change, re-render). Does nothing after the acknowledgement. */
  update(gate: GateModel, actionCount: number): void;
  /** Moves the focus to the acknowledge button. */
  focus(): void;
  /** True once the gate was acknowledged or disposed. */
  readonly closed: boolean;
  /** Removes the gate element without acknowledging. Idempotent. */
  dispose(): void;
}

export const PRIVACY_GATE_ACK_ID = 'privacy-gate-ack';
const TITLE_ID = 'privacy-gate-title';
const MESSAGE_ID = 'privacy-gate-message';

/** Every string key this module passes to `t`. */
export const PRIVACY_GATE_STRING_KEYS = ['guess.gate.title', 'guess.gate.hand', 'guess.gate.guess', 'guess.gate.ready'] as const;

function hasFocusApi(doc: PrivacyGateDocument): doc is PrivacyGateDocument & FocusDoc {
  return 'activeElement' in doc && typeof doc.getElementById === 'function' && typeof doc.querySelector === 'function';
}

/** Shows the gate in `root`. The previous private DOM is removed first (`options.clearPrivate`). */
export function renderPrivacyGate(
  doc: PrivacyGateDocument,
  root: HTMLElement,
  options: PrivacyGateOptions,
  t: Translate,
): PrivacyGateHandle {
  // (1) The previous Seat's private DOM goes first, synchronously; nothing of the gate exists yet.
  options.clearPrivate();

  const h = createH(doc);
  let bound: GateAcknowledgement = Object.freeze({
    forSeat: options.gate.forSeat,
    purpose: options.gate.purpose,
    actionCount: options.actionCount,
  });
  let name = options.gate.name;
  let closed = false;

  const titleEl = h('h2', { id: TITLE_ID, class: 'privacy-gate-title' });
  const messageEl = h('p', { id: MESSAGE_ID, class: 'privacy-gate-message' });
  const button = h('button', { id: PRIVACY_GATE_ACK_ID, focusKey: PRIVACY_GATE_ACK_ID, class: 'privacy-gate-ack', attrs: { type: 'button' } });
  const gateEl = h(
    'div',
    { class: 'privacy-gate', attrs: { role: 'dialog' }, aria: { modal: 'true', labelledby: TITLE_ID, describedby: MESSAGE_ID } },
    titleEl,
    messageEl,
    button,
  );

  function paint(): void {
    gateEl.setAttribute('class', bound.purpose === 'HAND' ? 'privacy-gate privacy-gate--hand' : 'privacy-gate privacy-gate--guess');
    titleEl.textContent = t('guess.gate.title');
    messageEl.textContent = t(bound.purpose === 'HAND' ? 'guess.gate.hand' : 'guess.gate.guess', { name });
    button.textContent = t('guess.gate.ready');
  }
  paint();

  function remove(): void {
    closed = true;
    if (gateEl.parentNode !== null) gateEl.parentNode.removeChild(gateEl);
  }

  function acknowledge(): void {
    if (closed) return; // double click: the first activation closed the gate
    const cur = options.current();
    const gate = cur.gate;
    if (gate === null || gate.forSeat !== bound.forSeat || gate.purpose !== bound.purpose || cur.actionCount !== bound.actionCount) {
      return; // stale: the host no longer wants this gate
    }
    const ack = bound;
    remove(); // the gate DOM is gone before the host renders the private view
    options.onAcknowledge(ack);
  }
  button.addEventListener('click', acknowledge);

  // (2) Only now does gate DOM exist.
  root.appendChild(gateEl);
  button.focus();

  return {
    element: gateEl,
    get closed() {
      return closed;
    },
    update(gate, actionCount) {
      if (closed) return;
      bound = Object.freeze({ forSeat: gate.forSeat, purpose: gate.purpose, actionCount });
      name = gate.name;
      if (hasFocusApi(doc)) renderWithFocus(doc, paint);
      else paint();
    },
    focus() {
      if (!closed) button.focus();
    },
    dispose() {
      if (!closed) remove();
    },
  };
}
