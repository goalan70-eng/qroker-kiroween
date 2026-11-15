// Tests of the pointer gesture module (task 17.4): `stepGesture`, `consumeClick`, `cellFromPoint`, `attachHandGestures`.
//
// EVIDENCE CLASS: model for the pure state machine and the hit test (Node, no DOM), and fake-DOM-lite for the
// adapter: a minimal hand-written fake document and fake elements dispatch synthetic events (no happy-dom, which
// arrives with task 21.1; the full fake-DOM placement tests belong to task 21.3). The fake does NOT model layout,
// real `elementFromPoint`, pointer capture, click ordering or touch behaviour. It proves the wiring and the rules
// against a stand-in, nothing about a real browser or device. `DRAG_THRESHOLD_PX` stays provisional until a
// real-device result is recorded in docs/responsive-checklist.md.
//
// Acceptance items of task 17.4 covered here: 6 (cancel, lost capture, Escape and invalidation never drop),
// 8 (the click after a drag is suppressed, a later genuine click is not).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CardId } from '../core/types';
import {
  CLICK_SUPPRESS_MS,
  DRAG_THRESHOLD_PX,
  INITIAL_GESTURE,
  attachHandGestures,
  cellFromPoint,
  consumeClick,
  isGestureActive,
  stepGesture,
} from './pointer-gesture';
import type { CancelReason, GestureDocument, GestureEvent, GestureHost, GestureInput, GestureListener, GestureOutput, GestureState } from './pointer-gesture';

// ---------------------------------------------------------------------------------------------------------
// Pure state machine
// ---------------------------------------------------------------------------------------------------------

const down = (x = 100, y = 100, pointerId = 1, extra: Partial<Extract<GestureInput, { type: 'down' }>> = {}): GestureInput => ({
  type: 'down',
  pointerId,
  x,
  y,
  isPrimary: true,
  button: 0,
  ...extra,
});
const move = (x: number, y: number, pointerId = 1): GestureInput => ({ type: 'move', pointerId, x, y });
const up = (x: number, y: number, pointerId = 1): GestureInput => ({ type: 'up', pointerId, x, y });

/** Feeds the inputs one by one; returns the final state and every output. */
function feed(inputs: readonly GestureInput[], start: GestureState = INITIAL_GESTURE, now = 0): { state: GestureState; out: GestureOutput[] } {
  let state = start;
  const out: GestureOutput[] = [];
  for (const input of inputs) {
    const step = stepGesture(state, input, now);
    state = step.state;
    out.push(...step.out);
  }
  return { state, out };
}

describe('stepGesture: tap versus drag at the threshold', () => {
  it('exports the provisional threshold 8 px', () => {
    expect(DRAG_THRESHOLD_PX).toBe(8);
  });

  it('7 px of movement is a tap: no dragStart, no drop, and `up` reports a tap', () => {
    for (const [dx, dy] of [[7, 0], [-7, 0], [0, 7], [0, -7], [5, 5]] as const) {
      const r = feed([down(), move(100 + dx, 100 + dy), up(100 + dx, 100 + dy)]);
      expect(r.out, `${dx},${dy}`).toEqual([{ type: 'tap' }]);
      expect(r.state.kind).toBe('IDLE');
      expect(r.state).toMatchObject({ suppressClickUntil: null });
    }
  });

  it('8 px of movement is a drag: dragStart once, then drop at the release point', () => {
    for (const [dx, dy] of [[8, 0], [-8, 0], [0, 8], [0, -8], [6, 6]] as const) {
      const r = feed([down(), move(100 + dx, 100 + dy), move(120, 130), up(121, 131)], INITIAL_GESTURE, 50);
      expect(r.out.filter((o) => o.type === 'dragStart'), `${dx},${dy}`).toHaveLength(1);
      expect(r.out.filter((o) => o.type === 'drop'), `${dx},${dy}`).toEqual([{ type: 'drop', x: 121, y: 131 }]);
      expect(r.out.at(-1)).toEqual({ type: 'suppressNextClick' });
    }
  });

  it('7.9 px is a tap and 8.0 px is a drag (the threshold is reached at >= 8)', () => {
    expect(feed([down(), move(107.9, 100)]).state.kind).toBe('PRESSED');
    expect(feed([down(), move(108, 100)]).state.kind).toBe('DRAGGING');
  });

  it('the distance is measured from the press point and a drag stays a drag when the pointer returns', () => {
    const r = feed([down(), move(110, 100), move(100, 100)]);
    expect(r.state.kind).toBe('DRAGGING');
    expect(r.out.filter((o) => o.type === 'dragStart')).toHaveLength(1);
    expect(r.out.at(-1)).toEqual({ type: 'dragMove', x: 100, y: 100 });
  });

  it('accepts another threshold as the fourth argument', () => {
    const pressed = stepGesture(INITIAL_GESTURE, down(), 0).state;
    expect(stepGesture(pressed, move(103, 100), 0, 3).state.kind).toBe('DRAGGING');
    expect(stepGesture(pressed, move(102, 100), 0, 3).state.kind).toBe('PRESSED');
  });

  it('a move without a press is ignored', () => {
    expect(feed([move(1, 1), up(1, 1)])).toEqual({ state: INITIAL_GESTURE, out: [] });
  });
});

describe('stepGesture: only a primary pointer with the primary button', () => {
  it('ignores a non-primary pointer and the non-primary buttons', () => {
    expect(feed([down(100, 100, 1, { isPrimary: false })]).state).toBe(INITIAL_GESTURE);
    expect(feed([down(100, 100, 1, { button: 1 })]).state).toBe(INITIAL_GESTURE);
    expect(feed([down(100, 100, 1, { button: 2 })]).state).toBe(INITIAL_GESTURE);
  });
  it('accepts a touch or pen contact without a button field', () => {
    const { button: _drop, ...touch } = down() as Extract<GestureInput, { type: 'down' }>;
    expect(feed([touch]).state.kind).toBe('PRESSED');
  });
  it('ignores every event of a second pointer while one is active', () => {
    const r = feed([down(100, 100, 1), down(200, 200, 2), move(300, 300, 2), up(300, 300, 2), { type: 'cancel', pointerId: 2 }]);
    expect(r.state).toMatchObject({ kind: 'PRESSED', pointerId: 1 });
    expect(r.out).toEqual([]);
    const dragging = feed([down(100, 100, 1), move(150, 100, 1), down(5, 5, 2), up(5, 5, 2), move(160, 100, 2)]);
    expect(dragging.state).toMatchObject({ kind: 'DRAGGING', pointerId: 1 });
    expect(dragging.out.filter((o) => o.type === 'drop')).toEqual([]);
  });
});

describe('acceptance 6: cancellation never drops', () => {
  const dragging: GestureInput[] = [down(), move(150, 100)];

  it('pointercancel and lostpointercapture end a press and a drag with `cancelled` and no drop', () => {
    const cases: [GestureInput, CancelReason][] = [
      [{ type: 'cancel', pointerId: 1 }, 'POINTERCANCEL'],
      [{ type: 'lostcapture', pointerId: 1 }, 'LOST_CAPTURE'],
    ];
    for (const [end, reason] of cases) {
      for (const before of [[down()], dragging]) {
        const r = feed([...before, end, up(160, 100)]);
        expect(r.out.filter((o) => o.type === 'cancelled'), reason).toEqual([{ type: 'cancelled', reason }]);
        expect(r.out.some((o) => o.type === 'drop' || o.type === 'suppressNextClick'), reason).toBe(false);
        expect(r.state).toMatchObject({ kind: 'IDLE', suppressClickUntil: null });
      }
    }
  });

  it('Escape and invalidate cancel an active gesture; the held pointer is awaited and its release produces no drop', () => {
    const cases: [GestureInput, CancelReason][] = [
      [{ type: 'escape' }, 'ESCAPE'],
      [{ type: 'invalidate' }, 'INVALIDATED'],
    ];
    for (const [end, reason] of cases) {
      for (const before of [[down()], dragging]) {
        const cancelled = feed([...before, end]);
        expect(cancelled.out.filter((o) => o.type === 'cancelled'), reason).toEqual([{ type: 'cancelled', reason }]);
        expect(cancelled.out.at(-1), reason).toEqual({ type: 'cancelled', reason });
        expect(cancelled.out.some((o) => o.type === 'drop'), reason).toBe(false);
        expect(cancelled.state.kind).toBe('CANCELLED');
        expect(isGestureActive(cancelled.state)).toBe(false);
        const released = feed([move(300, 300), up(300, 300)], cancelled.state, 10);
        expect(released.out.some((o) => o.type === 'drop' || o.type === 'dragMove'), reason).toBe(false);
        expect(released.out).toEqual([{ type: 'suppressNextClick' }]); // the click after the release selects nothing
        expect(released.state).toMatchObject({ kind: 'IDLE', suppressClickUntil: 10 + CLICK_SUPPRESS_MS });
      }
    }
  });

  it('Escape or invalidate with no gesture does nothing; lostcapture after a normal up is ignored', () => {
    expect(feed([{ type: 'escape' }, { type: 'invalidate' }])).toEqual({ state: INITIAL_GESTURE, out: [] });
    const dropped = feed([down(), move(150, 100), up(150, 100)], INITIAL_GESTURE, 5);
    const after = stepGesture(dropped.state, { type: 'lostcapture', pointerId: 1 }, 6);
    expect(after.out).toEqual([]);
    expect(after.state).toBe(dropped.state); // the click-suppression flag survives
  });

  it('property: a drop is only ever produced by an `up` of the dragging pointer, at most once per press', () => {
    const inputArb: fc.Arbitrary<GestureInput> = fc.oneof(
      fc.record({ type: fc.constant('down' as const), pointerId: fc.integer({ min: 1, max: 2 }), x: fc.integer({ min: 0, max: 30 }), y: fc.integer({ min: 0, max: 30 }), isPrimary: fc.boolean(), button: fc.constantFrom(0, 0, 1) }),
      fc.record({ type: fc.constantFrom('move' as const, 'up' as const), pointerId: fc.integer({ min: 1, max: 2 }), x: fc.integer({ min: 0, max: 30 }), y: fc.integer({ min: 0, max: 30 }) }),
      fc.record({ type: fc.constantFrom('cancel' as const, 'lostcapture' as const), pointerId: fc.integer({ min: 1, max: 2 }) }),
      fc.constantFrom<GestureInput>({ type: 'escape' }, { type: 'invalidate' }),
    );
    fc.assert(
      fc.property(fc.array(inputArb, { maxLength: 40 }), (inputs) => {
        let state: GestureState = INITIAL_GESTURE;
        let dragStarts = 0;
        let drops = 0;
        for (const input of inputs) {
          const wasDragging = state.kind === 'DRAGGING';
          const step = stepGesture(state, input, 0);
          for (const o of step.out) {
            if (o.type === 'dragStart') dragStarts++;
            if (o.type === 'drop') {
              drops++;
              expect(wasDragging && input.type === 'up').toBe(true);
            }
          }
          state = step.state;
          expect(drops).toBeLessThanOrEqual(dragStarts);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('acceptance 8: click suppression', () => {
  const afterDrag = (now: number): GestureState => feed([down(), move(150, 100), up(150, 100)], INITIAL_GESTURE, now).state;

  it('the click that follows a drag is suppressed once; a later genuine click is not', () => {
    const state = afterDrag(100);
    expect(state).toMatchObject({ kind: 'IDLE', suppressClickUntil: 100 + CLICK_SUPPRESS_MS });
    const first = consumeClick(state, 105);
    expect(first.suppress).toBe(true);
    const second = consumeClick(first.state, 110);
    expect(second.suppress).toBe(false);
  });

  it('the suppression times out, so a missed click cannot swallow a much later genuine click', () => {
    const state = afterDrag(100);
    expect(consumeClick(state, 100 + CLICK_SUPPRESS_MS).suppress).toBe(true);
    const late = consumeClick(state, 100 + CLICK_SUPPRESS_MS + 1);
    expect(late.suppress).toBe(false);
    expect(late.state).toMatchObject({ suppressClickUntil: null });
  });

  it('a new pointerdown ends the suppression; a tap never starts it', () => {
    const state = afterDrag(100);
    const pressed = stepGesture(state, down(), 101).state;
    expect(consumeClick(pressed, 102)).toEqual({ state: pressed, suppress: false });
    const tapped = feed([down(), up(100, 100)]);
    expect(consumeClick(tapped.state, 1).suppress).toBe(false);
    expect(consumeClick(INITIAL_GESTURE, 1)).toEqual({ state: INITIAL_GESTURE, suppress: false });
  });

  it('a pointerdown that is not accepted (secondary button) does not end the suppression', () => {
    const state = afterDrag(100);
    expect(stepGesture(state, down(1, 1, 1, { button: 2 }), 101).state).toBe(state);
  });
});

// ---------------------------------------------------------------------------------------------------------
// cellFromPoint with a fake document
// ---------------------------------------------------------------------------------------------------------

class FakeEl {
  readonly attrs = new Map<string, string>();
  constructor(
    readonly name: string,
    attrs: Record<string, string> = {},
    readonly parent: FakeEl | null = null,
  ) {
    for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  /** Supports the selectors of the module: one or more `[attribute]` tests. */
  closest(selector: string): FakeEl | null {
    const names = [...selector.matchAll(/\[([\w-]+)\]/g)].map((m) => m[1] as string);
    for (let el: FakeEl | null = this; el !== null; el = el.parent) {
      if (names.every((n) => el!.attrs.has(n))) return el;
    }
    return null;
  }
}

interface Listener {
  readonly fn: GestureListener;
  readonly capture: boolean;
}

class FakeDoc implements GestureDocument {
  readonly listeners = new Map<string, Listener[]>();
  readonly hitCalls: [number, number][] = [];
  hit: (x: number, y: number) => FakeEl | null = () => null;

  elementFromPoint(x: number, y: number): FakeEl | null {
    this.hitCalls.push([x, y]);
    return this.hit(x, y);
  }
  addEventListener(type: string, fn: GestureListener, capture = false): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), { fn, capture }]);
  }
  removeEventListener(type: string, fn: GestureListener, capture = false): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((l) => !(l.fn === fn && l.capture === capture)));
  }
  count(): number {
    return [...this.listeners.values()].reduce((n, list) => n + list.length, 0);
  }
  /** Dispatches `event` to the listeners of its type, capture listeners first; stops after stopImmediatePropagation. */
  dispatch(event: FakeEvent): void {
    const list = this.listeners.get(event.type) ?? [];
    for (const l of [...list.filter((x) => x.capture), ...list.filter((x) => !x.capture)]) {
      if (event.immediateStopped) return;
      l.fn(event);
    }
  }
}

class FakeHost implements GestureHost {
  readonly listeners = new Map<string, GestureListener[]>();
  readonly captured: number[] = [];
  readonly released: number[] = [];
  throwOnCapture = false;
  addEventListener(type: string, fn: GestureListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(type: string, fn: GestureListener): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn));
  }
  setPointerCapture(id: number): void {
    if (this.throwOnCapture) throw new Error('InvalidStateError');
    this.captured.push(id);
  }
  releasePointerCapture(id: number): void {
    this.released.push(id);
  }
  dispatch(event: FakeEvent): void {
    for (const fn of this.listeners.get(event.type) ?? []) fn(event);
  }
  count(): number {
    return [...this.listeners.values()].reduce((n, list) => n + list.length, 0);
  }
}

class FakeEvent implements GestureEvent {
  prevented = 0;
  stopped = 0;
  immediateStopped = false;
  constructor(
    readonly type: string,
    props: Partial<Omit<GestureEvent, 'type'>> = {},
  ) {
    Object.assign(this, props);
  }
  pointerId?: number;
  isPrimary?: boolean;
  button?: number;
  clientX?: number;
  clientY?: number;
  key?: string;
  timeStamp?: number;
  target?: unknown;
  preventDefault(): void {
    this.prevented++;
  }
  stopPropagation(): void {
    this.stopped++;
  }
  stopImmediatePropagation(): void {
    this.immediateStopped = true;
  }
}

const cellEl = (row: number | string, col: number | string, parent: FakeEl | null = null): FakeEl =>
  new FakeEl('button', { 'data-row': String(row), 'data-col': String(col) }, parent);

describe('cellFromPoint', () => {
  it('maps the element under the ACTUAL point to its data-row and data-col', () => {
    const doc = new FakeDoc();
    doc.hit = () => cellEl(3, 4);
    expect(cellFromPoint(doc, 123.5, 77)).toEqual({ row: 3, col: 4 });
    expect(doc.hitCalls).toEqual([[123.5, 77]]); // the pointer coordinates, nothing else
  });

  it('finds the cell from a nested child (a preview ghost or a card face inside the cell)', () => {
    const doc = new FakeDoc();
    const cell = cellEl(0, 7);
    const face = new FakeEl('span', {}, new FakeEl('div', { 'aria-hidden': 'true' }, cell));
    doc.hit = () => face;
    expect(cellFromPoint(doc, 1, 1)).toEqual({ row: 0, col: 7 });
  });

  it('is null outside the board, on an element without the attributes, and when only one attribute is present', () => {
    const doc = new FakeDoc();
    doc.hit = () => null;
    expect(cellFromPoint(doc, 5, 5)).toBeNull();
    doc.hit = () => new FakeEl('div');
    expect(cellFromPoint(doc, 5, 5)).toBeNull();
    doc.hit = () => new FakeEl('div', { 'data-row': '2' });
    expect(cellFromPoint(doc, 5, 5)).toBeNull();
  });

  it('rejects attribute values that are not an integer 0 to 7', () => {
    const doc = new FakeDoc();
    for (const bad of ['8', '-1', '1.5', 'a', '', ' 3', '03', '3 ', '1e0', '+2']) {
      doc.hit = () => cellEl(bad, 0);
      expect(cellFromPoint(doc, 1, 1), JSON.stringify(bad)).toBeNull();
      doc.hit = () => cellEl(0, bad);
      expect(cellFromPoint(doc, 1, 1), JSON.stringify(bad)).toBeNull();
    }
    for (const good of ['0', '7']) {
      doc.hit = () => cellEl(good, good);
      expect(cellFromPoint(doc, 1, 1)).toEqual({ row: Number(good), col: Number(good) });
    }
  });

  it('never returns a cell for the drag overlay, even when the overlay sits inside a cell element', () => {
    const doc = new FakeDoc();
    const cell = cellEl(2, 2);
    const overlay = new FakeEl('div', { 'data-drag-overlay': '' }, cell);
    doc.hit = () => new FakeEl('span', {}, overlay);
    expect(cellFromPoint(doc, 1, 1)).toBeNull();
  });

  it('is null for non-finite coordinates without asking the document', () => {
    const doc = new FakeDoc();
    doc.hit = () => cellEl(1, 1);
    expect(cellFromPoint(doc, Number.NaN, 1)).toBeNull();
    expect(cellFromPoint(doc, 1, Number.POSITIVE_INFINITY)).toBeNull();
    expect(doc.hitCalls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// attachHandGestures with fakes
// ---------------------------------------------------------------------------------------------------------

describe('attachHandGestures (fake document, wiring only)', () => {
  const CARD = 'C-5' as CardId;

  function setup(over: { enabled?: boolean; cardAt?: (t: unknown) => CardId | null } = {}) {
    const doc = new FakeDoc();
    const host = new FakeHost();
    const log: string[] = [];
    const drops: { card: CardId; over: { row: number; col: number } | null }[] = [];
    let enabled = over.enabled ?? true;
    const control = attachHandGestures(
      host,
      {
        enabled: () => enabled,
        cardAt: over.cardAt ?? (() => CARD),
        onDragStart: (card, x, y) => log.push(`start ${card} ${x},${y}`),
        onDragMove: (x, y, cell) => log.push(`move ${x},${y} ${cell === null ? 'none' : `${cell.row}:${cell.col}`}`),
        onDrop: (card, cell) => {
          log.push('drop');
          drops.push({ card, over: cell });
        },
        onCancel: (reason) => log.push(`cancel ${reason}`),
      },
      doc,
    );
    const ev = (type: string, props: Partial<Omit<GestureEvent, 'type'>> = {}) => new FakeEvent(type, { pointerId: 1, isPrimary: true, button: 0, ...props });
    const press = (x = 10, y = 10, t = 0, extra: Partial<Omit<GestureEvent, 'type'>> = {}) => {
      const e = ev('pointerdown', { clientX: x, clientY: y, timeStamp: t, target: 'card-element', ...extra });
      host.dispatch(e);
      return e;
    };
    const send = (type: string, props: Partial<Omit<GestureEvent, 'type'>> = {}) => {
      const e = ev(type, props);
      doc.dispatch(e);
      return e;
    };
    return { doc, host, log, drops, control, press, send, setEnabled: (v: boolean) => (enabled = v) };
  }

  it('a tap (7 px) calls nothing; the click after it is not suppressed', () => {
    const t = setup();
    t.press(10, 10, 0);
    t.send('pointermove', { clientX: 17, clientY: 10 });
    t.send('pointerup', { clientX: 17, clientY: 10, timeStamp: 30 });
    expect(t.log).toEqual([]);
    const click = t.send('click', { timeStamp: 31 });
    expect(click.prevented).toBe(0);
    expect(click.stopped).toBe(0);
  });

  it('a drag calls dragStart once and drops on the cell under the RELEASE POINT, not on event.target', () => {
    const t = setup();
    const staleTarget = cellEl(7, 7); // what a captured target would suggest
    t.doc.hit = (x, y) => (x === 200 && y === 150 ? cellEl(2, 3) : null);
    t.press(10, 10, 0);
    t.send('pointermove', { clientX: 18, clientY: 10, target: staleTarget }); // 8 px
    t.send('pointermove', { clientX: 100, clientY: 100, target: staleTarget });
    t.send('pointerup', { clientX: 200, clientY: 150, target: staleTarget, timeStamp: 40 });
    expect(t.log).toEqual(['start C-5 10,10', 'move 18,10 none', 'move 100,100 none', 'drop']);
    expect(t.drops).toEqual([{ card: CARD, over: { row: 2, col: 3 } }]);
    expect(t.doc.hitCalls.at(-1)).toEqual([200, 150]);
    expect(t.host.captured).toEqual([1]);
  });

  it('a drop on no cell reports `null` so the caller can issue dropOutside', () => {
    const t = setup();
    t.press();
    t.send('pointermove', { clientX: 60, clientY: 10 });
    t.send('pointerup', { clientX: 61, clientY: 10, timeStamp: 5 });
    expect(t.drops).toEqual([{ card: CARD, over: null }]);
  });

  it('suppresses exactly the click that follows a drag, then lets a genuine click through', () => {
    const t = setup();
    t.press(10, 10, 0);
    t.send('pointermove', { clientX: 60, clientY: 10 });
    t.send('pointerup', { clientX: 60, clientY: 10, timeStamp: 100 });
    const followUp = t.send('click', { timeStamp: 102 });
    expect(followUp.prevented).toBe(1);
    expect(followUp.stopped).toBe(1);
    const genuine = t.send('click', { timeStamp: 103 });
    expect(genuine.prevented).toBe(0);
    // a missed click does not swallow a later one
    t.press(10, 10, 200);
    t.send('pointermove', { clientX: 60, clientY: 10 });
    t.send('pointerup', { clientX: 60, clientY: 10, timeStamp: 300 });
    expect(t.send('click', { timeStamp: 300 + CLICK_SUPPRESS_MS + 1 }).prevented).toBe(0);
  });

  it('pointercancel and lostpointercapture cancel without a drop, and a later pointerup drops nothing', () => {
    for (const [type, reason] of [['pointercancel', 'POINTERCANCEL'], ['lostpointercapture', 'LOST_CAPTURE']] as const) {
      const t = setup();
      t.press();
      t.send('pointermove', { clientX: 60, clientY: 10 });
      t.send(type);
      t.send('pointerup', { clientX: 60, clientY: 10, timeStamp: 5 });
      expect(t.log, type).toEqual(['start C-5 10,10', 'move 60,10 none', `cancel ${reason}`]);
      expect(t.drops, type).toEqual([]);
      expect(t.send('click', { timeStamp: 6 }).prevented, type).toBe(0); // no click follows a cancelled pointer
    }
  });

  it('lostpointercapture after a normal pointerup is ignored (no cancel callback)', () => {
    const t = setup();
    t.press();
    t.send('pointermove', { clientX: 60, clientY: 10 });
    t.send('pointerup', { clientX: 60, clientY: 10, timeStamp: 5 });
    t.send('lostpointercapture');
    expect(t.log.filter((l) => l.startsWith('cancel'))).toEqual([]);
    expect(t.send('click', { timeStamp: 6 }).prevented).toBe(1); // the suppression survived the lostpointercapture
  });

  it('Escape cancels an active gesture, does not reach other listeners, and the release drops nothing', () => {
    const t = setup();
    t.press();
    t.send('pointermove', { clientX: 60, clientY: 10 });
    const esc = t.send('keydown', { key: 'Escape' });
    expect(esc.stopped).toBe(1);
    expect(esc.immediateStopped).toBe(true);
    t.send('pointerup', { clientX: 60, clientY: 10, timeStamp: 5 });
    expect(t.log).toEqual(['start C-5 10,10', 'move 60,10 none', 'cancel ESCAPE']);
    expect(t.drops).toEqual([]);
    expect(t.send('click', { timeStamp: 6 }).prevented).toBe(1); // the click after the release selects nothing
    expect(t.host.released).toEqual([]); // capture is left to the browser: releasing it would fire lostpointercapture
  });

  it('Escape with no gesture is left alone (the screen clears the draft), and so are other keys', () => {
    const t = setup();
    const idle = t.send('keydown', { key: 'Escape' });
    expect(idle.stopped).toBe(0);
    t.press();
    const other = t.send('keydown', { key: 'a' });
    expect(other.stopped).toBe(0);
    expect(t.log).toEqual([]);
  });

  it('control.cancel("INVALIDATED") cancels an active gesture and is a no-op when idle', () => {
    const t = setup();
    t.control.cancel('INVALIDATED');
    expect(t.log).toEqual([]);
    t.press();
    t.send('pointermove', { clientX: 60, clientY: 10 });
    t.control.cancel('INVALIDATED');
    t.send('pointerup', { clientX: 60, clientY: 10, timeStamp: 5 });
    expect(t.log.at(-1)).toBe('cancel INVALIDATED');
    expect(t.drops).toEqual([]);
  });

  it('ignores a second pointer, a non-primary pointer, a secondary button, a disabled state and a non-card target', () => {
    const t = setup();
    t.press(10, 10, 0, { pointerId: 1 });
    t.press(500, 500, 0, { pointerId: 2 });
    t.send('pointermove', { pointerId: 2, clientX: 900, clientY: 900 });
    t.send('pointerup', { pointerId: 2, clientX: 900, clientY: 900, timeStamp: 1 });
    expect(t.log).toEqual([]);
    t.send('pointercancel', { pointerId: 1 });
    expect(t.log).toEqual(['cancel POINTERCANCEL']);

    for (const extra of [{ isPrimary: false }, { button: 2 }] as const) {
      const u = setup();
      u.press(10, 10, 0, extra);
      u.send('pointermove', { clientX: 90, clientY: 10 });
      u.send('pointerup', { clientX: 90, clientY: 10, timeStamp: 1 });
      expect(u.log).toEqual([]);
      expect(u.host.captured).toEqual([]);
    }
    const disabled = setup({ enabled: false });
    disabled.press();
    disabled.send('pointermove', { clientX: 90, clientY: 10 });
    expect(disabled.log).toEqual([]);
    const notCard = setup({ cardAt: () => null });
    notCard.press();
    notCard.send('pointermove', { clientX: 90, clientY: 10 });
    expect(notCard.log).toEqual([]);
    const toggled = setup({ enabled: false });
    toggled.setEnabled(true);
    toggled.press();
    toggled.send('pointermove', { clientX: 90, clientY: 10 });
    expect(toggled.log).toHaveLength(2);
  });

  it('a failing setPointerCapture is caught and the gesture still works', () => {
    const t = setup();
    t.host.throwOnCapture = true;
    t.doc.hit = () => cellEl(1, 1);
    expect(() => t.press()).not.toThrow();
    t.send('pointermove', { clientX: 60, clientY: 10 });
    t.send('pointerup', { clientX: 60, clientY: 10, timeStamp: 5 });
    expect(t.drops).toEqual([{ card: CARD, over: { row: 1, col: 1 } }]);
  });

  it('never calls preventDefault on pointerdown, pointermove or pointerup', () => {
    const t = setup();
    const events = [
      t.press(),
      t.send('pointermove', { clientX: 60, clientY: 10 }),
      t.send('pointerup', { clientX: 60, clientY: 10, timeStamp: 5 }),
    ];
    expect(events.map((e) => e.prevented)).toEqual([0, 0, 0]);
  });

  it('detach removes every listener and ends any gesture', () => {
    const t = setup();
    expect(t.host.count()).toBe(1);
    expect(t.doc.count()).toBe(6);
    t.press();
    t.control.detach();
    expect(t.host.count()).toBe(0);
    expect(t.doc.count()).toBe(0);
    t.send('pointermove', { clientX: 60, clientY: 10 });
    expect(t.log).toEqual([]);
  });
});

// Compile-time check: real DOM objects satisfy the structural interfaces (never called).
export function typeCheckAgainstTheRealDom(el: HTMLElement, doc: Document): void {
  attachHandGestures(
    el,
    { enabled: () => true, cardAt: () => null, onDragStart: () => undefined, onDragMove: () => undefined, onDrop: () => undefined, onCancel: () => undefined },
    doc,
  );
  cellFromPoint(doc, 0, 0);
}
