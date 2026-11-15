// Pointer gestures for dragging an own-Hand card (task 17.4; design.md "Pointer gesture module",
// requirements 13.10 and 13.15, 17.7).
//
// Two layers.
//   1. `stepGesture`: a pure state machine over normalized pointer events. It has no DOM and no clock; time comes in
//      as the `now` argument (milliseconds), so unit tests drive it directly.
//   2. `cellFromPoint` and `attachHandGestures`: a thin DOM adapter written against small structural interfaces
//      (`HitTestHost`, `GestureDocument`, `GestureHost`), so a fake document can stand in for the browser.
// Imports: `core/types` only. No drag-and-drop library and no HTML Drag and Drop API (decision D12), so there is no
// `DataTransfer` and no drag payload that could carry an identity.
//
// Thresholds
//   `DRAG_THRESHOLD_PX = 8`. The Euclidean distance between the press point and a later `move` is compared with
//   `>=`: a move of 7 px stays a tap, a move of exactly 8 px starts the drag. (design.md words it as "farther than";
//   the owner-directed acceptance values are 7 px tap and 8 px drag.) The value is provisional until a real-device
//   result is recorded in docs/responsive-checklist.md. Once DRAGGING, moving back inside the threshold does not end
//   the drag.
//
// Click suppression
//   After a `drop` the browser still sends a `click`. `stepGesture` returns the state IDLE with
//   `suppressClickUntil = now + CLICK_SUPPRESS_MS` and emits `suppressNextClick`. `consumeClick(state, now)` is the
//   click guard: it returns `suppress: true` once, while `now <= suppressClickUntil`, and clears the flag. The flag
//   also ends at the next accepted `down`, and by the timeout, so a missed click cannot swallow a later real one.
//   A plain tap (up while PRESSED) never sets it. After Escape or `invalidate` with the pointer still held, the
//   machine waits in CANCELLED for that pointer's `up` (which still produces a click), then suppresses that click
//   too; `cancel` and `lostcapture` end the pointer without a click, so they suppress nothing.
//
// Hit testing
//   `cellFromPoint(host, x, y)` uses `host.elementFromPoint(x, y)` with the ACTUAL pointer coordinates of the
//   release, never `event.target`, `event.currentTarget` or the captured element. The drag overlay must have
//   `pointer-events: none` (so `elementFromPoint` sees through it); an element inside `[data-drag-overlay]` is
//   treated as no cell as a second line of defence.
//
// Touch handling: `touch-action: none` is set by CSS on `.hand-card--draggable` only. This module never sets
// page-level touch-action and never calls `preventDefault` on pointerdown, pointermove or wheel.
//
// Evidence: the pure layer is verified in Node. Pointer capture, `elementFromPoint` against a real layout, click
// order and real touch behaviour are NOT verified by these tests (see the design's evidence classes).

import type { CardId, GridPosition } from '../core/types';

export const DRAG_THRESHOLD_PX = 8;

/** How long (ms) a click right after a drag is suppressed at most. */
export const CLICK_SUPPRESS_MS = 400;

export type GestureState =
  | { readonly kind: 'IDLE'; readonly suppressClickUntil: number | null }
  | { readonly kind: 'PRESSED'; readonly pointerId: number; readonly x0: number; readonly y0: number }
  | { readonly kind: 'DRAGGING'; readonly pointerId: number }
  /** Cancelled by Escape or `invalidate` while the pointer is still held: waits for its end, produces nothing. */
  | { readonly kind: 'CANCELLED'; readonly pointerId: number };

export const INITIAL_GESTURE: GestureState = Object.freeze({ kind: 'IDLE', suppressClickUntil: null });

export type GestureInput =
  | {
      readonly type: 'down';
      readonly pointerId: number;
      readonly x: number;
      readonly y: number;
      readonly button?: number;
      readonly isPrimary: boolean;
    }
  | { readonly type: 'move' | 'up'; readonly pointerId: number; readonly x: number; readonly y: number }
  | { readonly type: 'cancel' | 'lostcapture'; readonly pointerId: number }
  | { readonly type: 'escape' }
  | { readonly type: 'invalidate' };

export type CancelReason = 'POINTERCANCEL' | 'LOST_CAPTURE' | 'ESCAPE' | 'INVALIDATED';

export type GestureOutput =
  | { readonly type: 'tap' }
  | { readonly type: 'dragStart' }
  | { readonly type: 'dragMove'; readonly x: number; readonly y: number }
  | { readonly type: 'drop'; readonly x: number; readonly y: number }
  | { readonly type: 'cancelled'; readonly reason: CancelReason }
  | { readonly type: 'suppressNextClick' };

export interface GestureStep {
  readonly state: GestureState;
  readonly out: readonly GestureOutput[];
}

const NOTHING: readonly GestureOutput[] = Object.freeze([]);
const stay = (state: GestureState): GestureStep => ({ state, out: NOTHING });

const idle = (suppressClickUntil: number | null = null): GestureState =>
  Object.freeze({ kind: 'IDLE', suppressClickUntil });

/** Whether a gesture is in progress (the Escape key belongs to it then). */
export function isGestureActive(state: GestureState): boolean {
  return state.kind === 'PRESSED' || state.kind === 'DRAGGING';
}

/**
 * Pure transition. Only a primary pointer with the primary button (0, or absent for touch and pen) starts a
 * gesture; while one pointer is active every event of another pointer is ignored.
 *
 * @param now milliseconds of the event (any monotonic origin); used only for the click-suppression lifetime.
 * @param threshold drag threshold in px, default `DRAG_THRESHOLD_PX`.
 */
export function stepGesture(
  state: GestureState,
  input: GestureInput,
  now = 0,
  threshold: number = DRAG_THRESHOLD_PX,
): GestureStep {
  switch (state.kind) {
    case 'IDLE': {
      if (input.type !== 'down') return stay(state); // includes lostcapture after a normal up, escape, invalidate
      if (!input.isPrimary || (input.button ?? 0) !== 0) return stay(state);
      return {
        state: Object.freeze({ kind: 'PRESSED', pointerId: input.pointerId, x0: input.x, y0: input.y }),
        out: NOTHING,
      };
    }
    case 'PRESSED':
    case 'DRAGGING':
    case 'CANCELLED': {
      if (input.type === 'escape' || input.type === 'invalidate') {
        if (state.kind === 'CANCELLED') return stay(state);
        const reason: CancelReason = input.type === 'escape' ? 'ESCAPE' : 'INVALIDATED';
        return {
          state: Object.freeze({ kind: 'CANCELLED', pointerId: state.pointerId }),
          out: [{ type: 'cancelled', reason }],
        };
      }
      if (input.type === 'down' || input.pointerId !== state.pointerId) return stay(state); // another pointer
      return stepActive(state, input, now, threshold);
    }
  }
}

function stepActive(
  state: Exclude<GestureState, { kind: 'IDLE' }>,
  input: Exclude<GestureInput, { type: 'down' | 'escape' | 'invalidate' }>,
  now: number,
  threshold: number,
): GestureStep {
  switch (input.type) {
    case 'move': {
      if (state.kind === 'CANCELLED') return stay(state);
      if (state.kind === 'DRAGGING') return { state, out: [{ type: 'dragMove', x: input.x, y: input.y }] };
      const dx = input.x - state.x0;
      const dy = input.y - state.y0;
      if (dx * dx + dy * dy < threshold * threshold) return stay(state);
      return {
        state: Object.freeze({ kind: 'DRAGGING', pointerId: state.pointerId }),
        out: [{ type: 'dragStart' }, { type: 'dragMove', x: input.x, y: input.y }],
      };
    }
    case 'up': {
      if (state.kind === 'PRESSED') return { state: idle(), out: [{ type: 'tap' }] };
      if (state.kind === 'DRAGGING') {
        return {
          state: idle(now + CLICK_SUPPRESS_MS),
          out: [{ type: 'drop', x: input.x, y: input.y }, { type: 'suppressNextClick' }],
        };
      }
      // CANCELLED: the pointer is released; the click that follows must not select anything
      return { state: idle(now + CLICK_SUPPRESS_MS), out: [{ type: 'suppressNextClick' }] };
    }
    case 'cancel':
    case 'lostcapture': {
      if (state.kind === 'CANCELLED') return { state: idle(), out: NOTHING }; // already reported
      const reason: CancelReason = input.type === 'cancel' ? 'POINTERCANCEL' : 'LOST_CAPTURE';
      return { state: idle(), out: [{ type: 'cancelled', reason }] };
    }
  }
}

/**
 * The click guard. A click is suppressed once, while the suppression is still alive; the returned state has the
 * flag cleared in every case where it was set. Pure.
 */
export function consumeClick(state: GestureState, now = 0): { readonly state: GestureState; readonly suppress: boolean } {
  if (state.kind !== 'IDLE' || state.suppressClickUntil === null) return { state, suppress: false };
  return { state: idle(), suppress: now <= state.suppressClickUntil };
}

// ---------------------------------------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------------------------------------

/** The part of an `Element` that hit testing reads. A real `Element` satisfies it. */
export interface ElementLike {
  closest(selector: string): ElementLike | null;
  getAttribute(name: string): string | null;
}

export interface HitTestHost {
  elementFromPoint(x: number, y: number): ElementLike | null;
}

const COORDINATE = /^[0-7]$/;

/**
 * The grid cell under the viewport point (x, y), or `null` (outside the board, on no cell, or on the drag overlay).
 * A cell is the closest ancestor-or-self with both `data-row` and `data-col`, each an integer text 0 to 7.
 */
export function cellFromPoint(host: HitTestHost, x: number, y: number): GridPosition | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const hit = host.elementFromPoint(x, y);
  if (hit === null || hit === undefined) return null;
  if (hit.closest('[data-drag-overlay]') !== null) return null;
  const cell = hit.closest('[data-row][data-col]');
  if (cell === null) return null;
  const row = cell.getAttribute('data-row');
  const col = cell.getAttribute('data-col');
  if (row === null || col === null || !COORDINATE.test(row) || !COORDINATE.test(col)) return null;
  return { row: Number(row), col: Number(col) };
}

// ---------------------------------------------------------------------------------------------------------
// DOM adapter
// ---------------------------------------------------------------------------------------------------------

/** The event fields the adapter reads. A real `PointerEvent`, `MouseEvent` and `KeyboardEvent` satisfy it. */
export interface GestureEvent {
  readonly type: string;
  readonly pointerId?: number;
  readonly isPrimary?: boolean;
  readonly button?: number;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly key?: string;
  readonly timeStamp?: number;
  readonly target?: unknown;
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation?(): void;
}

export type GestureListener = (event: GestureEvent) => void;

/** The document the adapter needs: hit testing and global listeners (capture phase for click and Escape). */
export interface GestureDocument extends HitTestHost {
  addEventListener(type: string, listener: GestureListener, capture?: boolean): void;
  removeEventListener(type: string, listener: GestureListener, capture?: boolean): void;
}

/** The element the pointer is pressed on (the Hand card or the Hand container). */
export interface GestureHost {
  addEventListener(type: string, listener: GestureListener): void;
  removeEventListener(type: string, listener: GestureListener): void;
  setPointerCapture?(pointerId: number): void;
  releasePointerCapture?(pointerId: number): void;
}

export interface HandGestureHandlers {
  /** Called on `pointerdown`; false while an AI plays, behind a gate, or when input is otherwise off. */
  enabled(): boolean;
  /** Maps the pressed element to a card of the viewer's own Hand, or `null` (then no gesture starts). */
  cardAt(target: unknown): CardId | null;
  onDragStart(card: CardId, x: number, y: number): void;
  onDragMove(x: number, y: number, over: GridPosition | null): void;
  /** `over` is the cell under the release point or `null`; the caller turns it into dropOnCell / dropOutside. */
  onDrop(card: CardId, over: GridPosition | null): void;
  onCancel(reason: CancelReason): void;
}

export interface HandGestureControl {
  /** Cancels an active gesture (viewer, phase or game changed). */
  cancel(reason: 'INVALIDATED'): void;
  /** Removes every listener. */
  detach(): void;
}

/**
 * Wires pointer gestures onto `host` (a Hand card, or a Hand container when `cardAt` resolves the card).
 *   * `pointerdown` on `host`; `pointermove`, `pointerup`, `pointercancel` and `lostpointercapture` on `doc`
 *     (events of a captured pointer bubble to the document; without capture they still arrive);
 *   * `click` and `keydown` in the capture phase on `doc`: the click guard, and Escape for an active gesture
 *     (Escape then does not reach other listeners, so one key press cancels the gesture OR clears the draft).
 * `setPointerCapture` is called inside try/catch; a failure leaves the gesture running. Time comes from
 * `event.timeStamp`. Returns a cleanup function in `detach`.
 */
export function attachHandGestures(host: GestureHost, handlers: HandGestureHandlers, doc: GestureDocument): HandGestureControl {
  let state: GestureState = INITIAL_GESTURE;
  let card: CardId | null = null;
  let capturedId: number | null = null;
  let last = { x: 0, y: 0 };

  const at = (e: GestureEvent): number => (typeof e.timeStamp === 'number' ? e.timeStamp : 0);
  // `run` reassigns `state`; reading it through a function keeps the compiler from narrowing across the call.
  const currentKind = (): GestureState['kind'] => state.kind;

  // The browser releases the capture itself at pointerup, pointercancel and when the element is removed. Our own
  // `releasePointerCapture` is only used by `detach` while a pointer is held (calling it after Escape would fire
  // `lostpointercapture` and end the CANCELLED wait before the pointer is released).
  const release = (): void => {
    const id = capturedId;
    capturedId = null;
    if (id === null) return;
    try {
      host.releasePointerCapture?.(id);
    } catch {
      // capture already gone
    }
  };

  const run = (input: GestureInput, now: number): void => {
    const step = stepGesture(state, input, now);
    state = step.state;
    for (const out of step.out) {
      switch (out.type) {
        case 'dragStart':
          if (card !== null) handlers.onDragStart(card, last.x, last.y);
          break;
        case 'dragMove':
          last = { x: out.x, y: out.y };
          handlers.onDragMove(out.x, out.y, cellFromPoint(doc, out.x, out.y));
          break;
        case 'drop': {
          const over = cellFromPoint(doc, out.x, out.y); // actual pointer coordinates, not event.target
          const dropped = card;
          card = null;
          if (dropped !== null) handlers.onDrop(dropped, over);
          break;
        }
        case 'cancelled':
          card = null;
          handlers.onCancel(out.reason);
          break;
        case 'tap': // the browser `click` that follows selects the card (this also covers keyboard activation)
        case 'suppressNextClick':
          break;
      }
    }
    if (state.kind === 'IDLE') {
      card = null;
      capturedId = null;
    }
  };

  const onDown: GestureListener = (e) => {
    if (state.kind !== 'IDLE') return; // second pointer: ignored while one is active
    if (!handlers.enabled()) return;
    const pressed = handlers.cardAt(e.target);
    if (pressed === null) return;
    run(
      {
        type: 'down',
        pointerId: e.pointerId ?? 0,
        x: e.clientX ?? 0,
        y: e.clientY ?? 0,
        isPrimary: e.isPrimary ?? true,
        ...(e.button === undefined ? {} : { button: e.button }),
      },
      at(e),
    );
    if (currentKind() !== 'PRESSED') return; // not a primary pointer or not the primary button
    card = pressed;
    last = { x: e.clientX ?? 0, y: e.clientY ?? 0 };
    try {
      host.setPointerCapture?.(e.pointerId ?? 0);
      capturedId = e.pointerId ?? 0;
    } catch {
      capturedId = null; // capture is an improvement, not a requirement
    }
  };

  const pointerEvent = (type: 'move' | 'up'): GestureListener => (e) => {
    if (state.kind === 'IDLE') return;
    run({ type, pointerId: e.pointerId ?? 0, x: e.clientX ?? 0, y: e.clientY ?? 0 }, at(e));
  };
  const onMove = pointerEvent('move');
  const onUp = pointerEvent('up');
  const pointerEnd = (type: 'cancel' | 'lostcapture'): GestureListener => (e) => {
    if (state.kind === 'IDLE') return; // lostpointercapture after a normal up
    run({ type, pointerId: e.pointerId ?? 0 }, at(e));
  };
  const onCancel = pointerEnd('cancel');
  const onLost = pointerEnd('lostcapture');

  const onKey: GestureListener = (e) => {
    if (e.key !== 'Escape' || !isGestureActive(state)) return; // no gesture: the screen clears the draft
    run({ type: 'escape' }, at(e));
    e.stopPropagation();
    e.stopImmediatePropagation?.();
  };

  const onClick: GestureListener = (e) => {
    const verdict = consumeClick(state, at(e));
    state = verdict.state;
    if (!verdict.suppress) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
  };

  host.addEventListener('pointerdown', onDown);
  doc.addEventListener('pointermove', onMove);
  doc.addEventListener('pointerup', onUp);
  doc.addEventListener('pointercancel', onCancel);
  doc.addEventListener('lostpointercapture', onLost);
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('click', onClick, true);

  return {
    cancel(_reason) {
      if (isGestureActive(state)) run({ type: 'invalidate' }, 0);
    },
    detach() {
      release();
      host.removeEventListener('pointerdown', onDown);
      doc.removeEventListener('pointermove', onMove);
      doc.removeEventListener('pointerup', onUp);
      doc.removeEventListener('pointercancel', onCancel);
      doc.removeEventListener('lostpointercapture', onLost);
      doc.removeEventListener('keydown', onKey, true);
      doc.removeEventListener('click', onClick, true);
      state = INITIAL_GESTURE;
      card = null;
    },
  };
}
