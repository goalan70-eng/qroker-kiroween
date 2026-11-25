// Tests of the placement panel (task 17.3). Evidence classes (design.md, "Testing Strategy"):
//   * fake-DOM  : the panel against the hand-written fake Document of ui/testing/fake-dom.ts. Synthetic pointer events
//                 (pointerdown on a Hand card, pointermove and pointerup on the document) drive the real
//                 `attachHandGestures`; the fake `elementFromPoint` maps points to Board cell elements. This is NOT a
//                 browser: no layout, no real pointer capture, no real click ordering, no real focus and no touch.
//   * model     : the integration tests below use the REAL controller (createController) with a deterministic queue
//                 scheduler and a stub renderer that calls `renderPlacementPanel`; the game itself is real, only the
//                 DOM is a stand-in. Their equivalence checks compare `PlayerView`s with the engine's own `reduce`.
//   * source    : a scan of the panel source.
// Not emulated touch and not real-device: whether a finger drag, pointer capture and the click that follows really
// behave this way in a browser is NOT verified here (see the task notes; DRAG_THRESHOLD_PX stays provisional).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { reduce } from '../../core/engine';
import { defaultConfig, newGame } from '../../core/state';
import type { GameState } from '../../core/state';
import { advanceUntil } from '../../core/testing/state-generators';
import type { Action, CardId, GridPosition, PlayerId } from '../../core/types';
import { viewFor } from '../../core/view';
import type { PlayerView } from '../../core/view';
import { resetLanguage, setLanguage, t } from '../../i18n';
import { createController } from '../controller';
import type { Controller, RenderInput, Schedule } from '../controller';
import { EMPTY_DRAFT } from '../placement-draft';
import type { DraftEvent, DraftResult, PlacementDraft, RotationInfoMap } from '../placement-draft';
import { DRAG_THRESHOLD_PX } from '../pointer-gesture';
import { asFake, boardHit, cellPoint, classesOf, elementsOf, FakeDocument } from '../testing/fake-dom';
import type { FakeEl } from '../testing/fake-dom';
import { renderPlacementPanel } from './placement-panel';
import type { PlacementHandlers, PlacementPanelDocument, PlacementPanelHandle, PlacementPanelInput } from './placement-panel';

afterEach(() => resetLanguage());

// ---------------------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------------------

const CARD_ID_TOKEN = /\b[HDCS]-(?:10|[2-9AJQK])\b/;
const HANGUL = /[\uAC00-\uD7A3]/;
/** Independent oracle: only clubs and spades change their corners when turned. */
const TURNS = (card: CardId): boolean => card.startsWith('C-') || card.startsWith('S-');
const CHOICES = [7, 13, 3, 99, 5, 1, 42, 8, 21, 64, 2, 17];

function start(seed: number): GameState {
  const created = newGame({ seed, config: defaultConfig() });
  if (!created.ok) throw new Error(`newGame failed: ${created.error.code}`);
  return created.value;
}

const BASE: PlayerView = viewFor(start(1), 'P0'); // P0's turn, PLACEMENT, A first legal cell at C4
const LEGAL = { row: 3, col: 2 } as const; // C4 is legal on the initial board (D4, E4, D5, E5 are the first four cards)
const NOT_ADJACENT = { row: 0, col: 0 } as const; // A1 is far from the cards
const hand0 = BASE.myHand[0] as CardId;

const asDoc = (d: FakeDocument): PlacementPanelDocument => d as unknown as PlacementPanelDocument;
const asRoot = (e: FakeEl): HTMLElement => e as unknown as HTMLElement;

class Spy {
  readonly events: DraftEvent[] = [];
  readonly explained: GridPosition[] = [];
  confirm = 0;
  dispatch = 0;
  /** The notice that `draftEvent` returns for an event type (default: none). */
  notices: Partial<Record<DraftEvent['type'], DraftResult['notice']>> = {};
  readonly handlers: PlacementHandlers = {
    draftEvent: (e) => {
      this.events.push(e);
      return { draft: EMPTY_DRAFT, notice: this.notices[e.type] ?? null } satisfies DraftResult;
    },
    confirmPlacement: () => void this.confirm++,
    explainTarget: (c) => void this.explained.push(c),
    // Not part of PlacementHandlers: extra members that the panel must never reach.
    ...({ dispatch: () => void this.dispatch++ } as object),
  } as PlacementHandlers;
  types(): string[] {
    return this.events.map((e) => e.type);
  }
}

function inputOf(
  view: PlayerView | null,
  draft: PlacementDraft,
  handlers: PlacementHandlers,
  extra: { epoch?: number; error?: string | null; rotation?: RotationInfoMap } = {},
): PlacementPanelInput {
  return {
    view,
    model: { draft, gestureEpoch: extra.epoch ?? 0 },
    displayError: extra.error === undefined || extra.error === null ? null : { message: extra.error },
    rotationInfo: extra.rotation ?? {},
    handlers,
  };
}

interface Fixture {
  readonly doc: FakeDocument;
  readonly root: FakeEl;
  readonly spy: Spy;
  readonly panel: PlacementPanelHandle;
  render(view: PlayerView | null, draft?: PlacementDraft, extra?: { epoch?: number; error?: string | null; rotation?: RotationInfoMap }): void;
}

function setup(view: PlayerView | null = BASE, draft: PlacementDraft = EMPTY_DRAFT, extra: { epoch?: number; error?: string | null } = {}): Fixture {
  setLanguage('en');
  const doc = new FakeDocument();
  doc.hit = boardHit(doc);
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const spy = new Spy();
  const panel = renderPlacementPanel(asDoc(doc), asRoot(root), inputOf(view, draft, spy.handlers, extra), t);
  return {
    doc,
    root,
    spy,
    panel,
    render: (v, d = EMPTY_DRAFT, e = {}) => panel.update(inputOf(v, d, spy.handlers, e)),
  };
}

const all = (f: Fixture): FakeEl[] => elementsOf(f.root);
const handButtons = (f: Fixture): FakeEl[] => all(f).filter((e) => e.hasAttribute('data-hand-index'));
const cellButtons = (f: Fixture): FakeEl[] => all(f).filter((e) => e.tagName === 'button' && e.hasAttribute('data-row'));
const cellAt = (f: Fixture, row: number, col: number): FakeEl =>
  cellButtons(f).find((c) => c.getAttribute('data-row') === String(row) && c.getAttribute('data-col') === String(col)) as FakeEl;
const overlays = (f: Fixture): FakeEl[] => all(f).filter((e) => e.hasAttribute('data-drag-overlay'));
const control = (f: Fixture, kind: 'rotate' | 'confirm' | 'cancel'): FakeEl | undefined =>
  all(f).find((e) => classesOf(e).includes(`placement-button--${kind}`));
const byClass = (f: Fixture, cls: string): FakeEl => all(f).find((e) => classesOf(e).includes(cls)) as FakeEl;
const status = (f: Fixture): string => byClass(f, 'placement-status').textContent;
const dropTargets = (f: Fixture): number => cellButtons(f).filter((c) => classesOf(c).includes('is-drop-target')).length;

let clock = 1000;
const tick = (): number => (clock += 7);
const down = (el: FakeEl, x: number, y: number, id = 1) => el.fire('pointerdown', { pointerId: id, isPrimary: true, button: 0, clientX: x, clientY: y, timeStamp: tick() });
const move = (f: Fixture, x: number, y: number, id = 1) => f.doc.dispatch('pointermove', { pointerId: id, clientX: x, clientY: y, timeStamp: tick() });
const up = (f: Fixture, x: number, y: number, id = 1) => f.doc.dispatch('pointerup', { pointerId: id, clientX: x, clientY: y, timeStamp: tick() });
/** A click as the browser sends it after pointerup: document capture listeners first, then the element. */
const click = (el: FakeEl) => el.fire('click', { timeStamp: tick() });

/** Starts a drag of Hand card 0 from (10, 10) to the point (x, y) and leaves the pointer pressed. */
function dragTo(f: Fixture, x: number, y: number, index = 0): FakeEl {
  const card = handButtons(f)[index] as FakeEl;
  down(card, 10, 10);
  move(f, 10 + DRAG_THRESHOLD_PX, 10); // exactly the threshold: the drag starts
  move(f, x, y);
  return card;
}

// ---------------------------------------------------------------------------------------------------------
// Structure and rendering [fake-DOM]
// ---------------------------------------------------------------------------------------------------------

describe('renderPlacementPanel: structure [fake-DOM]', () => {
  it('mounts one panel with the board, the hand of the viewer, the controls, the status and the error line', () => {
    const f = setup();
    expect(f.root.children).toEqual([asFake(f.panel.element)]);
    expect(all(f).filter((e) => e.getAttribute('role') === 'grid')).toHaveLength(1);
    expect(cellButtons(f)).toHaveLength(64);
    expect(handButtons(f)).toHaveLength(BASE.myHand.length);
    expect(all(f).filter((e) => e.getAttribute('role') === 'group').map((e) => e.getAttribute('aria-label'))).toEqual(
      expect.arrayContaining(['Your hand', 'Placement controls']),
    );
    expect(byClass(f, 'placement-error').getAttribute('role')).toBe('alert');
    expect(byClass(f, 'placement-status').getAttribute('role')).toBe('status');
    expect(byClass(f, 'placement-live').getAttribute('aria-live')).toBe('polite');
    expect(['confirm', 'cancel'].every((k) => control(f, k as 'confirm' | 'cancel') !== undefined)).toBe(true);
    expect(overlays(f)).toHaveLength(0); // the ghost exists only during a gesture
  });

  it('shows the hint of the draft state in the status line and follows later renders', () => {
    const f = setup();
    expect(status(f)).toBe('Select a card or a position on the board. You can also drag a card onto a legal cell.');
    f.render(BASE, { target: LEGAL, card: null, orientation: 0 });
    expect(status(f)).toBe('Position chosen. Now select a card from your hand.');
    f.render(BASE, { target: null, card: hand0, orientation: 0 });
    expect(status(f)).toBe('Card chosen. Now select a legal position on the board.');
    f.render(BASE, { target: LEGAL, card: hand0, orientation: 0 });
    expect(status(f)).toBe('Press ✓ beside the card to place it.');
    // preview ghost on the target cell, selected card, confirm enabled
    expect(classesOf(cellAt(f, 3, 2))).toEqual(expect.arrayContaining(['is-target', 'has-preview']));
    expect(handButtons(f).filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(control(f, 'confirm')?.hasAttribute('disabled')).toBe(false);
    f.render(BASE, EMPTY_DRAFT);
    expect(control(f, 'confirm')?.hasAttribute('disabled')).toBe(true);
    expect(f.root.children).toHaveLength(1); // update rebuilds inside the same panel, no duplicate panels
  });

  it('shows the localized error in the alert line, keeps the same element, and clears it', () => {
    const f = setup(BASE, EMPTY_DRAFT, { error: 'That cell is already occupied.' });
    const alert = byClass(f, 'placement-error');
    expect(alert.textContent).toBe('That cell is already occupied.');
    f.render(BASE, EMPTY_DRAFT, { error: 'That cell is already occupied.' });
    expect(byClass(f, 'placement-error')).toBe(alert); // not rebuilt
    let writes = 0;
    const proto = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(alert), 'textContent') as PropertyDescriptor;
    Object.defineProperty(alert, 'textContent', { get: () => proto.get?.call(alert) as string, set: (v: string) => void (writes++, proto.set?.call(alert, v)) });
    f.render(BASE, EMPTY_DRAFT, { error: 'That cell is already occupied.' });
    expect(writes).toBe(0); // an unchanged alert is not written again, so it is not announced twice
    f.render(BASE, EMPTY_DRAFT, { error: 'Not next to a card.' });
    expect(alert.textContent).toBe('Not next to a card.');
    f.render(BASE, EMPTY_DRAFT, { error: null });
    expect(alert.textContent).toBe('');
  });

  it('switches language on the next update', () => {
    const f = setup();
    setLanguage('ko');
    f.render(BASE);
    expect(HANGUL.test(status(f))).toBe(true);
    expect(control(f, 'confirm')?.textContent).toBe('배치 확정');
    expect(control(f, 'cancel')?.textContent).toBe('취소');
    expect(handButtons(f).every((b) => HANGUL.test(b.getAttribute('aria-label') ?? ''))).toBe(true);
  });

  it('renders nothing but an empty panel without a view, and does not throw', () => {
    const f = setup(null);
    expect(cellButtons(f)).toHaveLength(0);
    expect(handButtons(f)).toHaveLength(0);
    expect(status(f)).toBe('');
    f.render(BASE);
    expect(cellButtons(f)).toHaveLength(64);
    f.render(null);
    expect(cellButtons(f)).toHaveLength(0);
  });
});

describe('AI status [fake-DOM]', () => {
  it('names the AI seat in English and Korean and disables the Hand and the controls while an AI seat plays', () => {
    for (const [turn, n] of [['P1', 1], ['P2', 2], ['P3', 3]] as const) {
      const view: PlayerView = { ...BASE, turn };
      const f = setup(view, EMPTY_DRAFT);
      expect(status(f)).toBe(`AI ${n} is playing`);
      setLanguage('ko');
      f.render(view);
      expect(status(f)).toBe(`AI ${n}의 차례입니다`);
      expect(handButtons(f).every((b) => b.hasAttribute('disabled') && !classesOf(b).includes('hand-card--draggable'))).toBe(true);
      expect(control(f, 'confirm')?.hasAttribute('disabled')).toBe(true);
      expect(control(f, 'cancel')?.hasAttribute('disabled')).toBe(true);
      expect(control(f, 'rotate')).toBeUndefined();
    }
  });

  it('ignores a pointer press on a Hand card while it is not the viewer\'s turn', () => {
    const f = setup({ ...BASE, turn: 'P1' });
    const card = handButtons(f)[0] as FakeEl;
    down(card, 10, 10);
    move(f, 100, 100);
    up(f, 100, 100);
    expect(f.spy.events).toEqual([]);
    expect(overlays(f)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Tap, click and keyboard [fake-DOM]
// ---------------------------------------------------------------------------------------------------------

describe('tap, click and keyboard [fake-DOM]', () => {
  it('a tap (a move of 7 px) selects the card through the click and starts no drag', () => {
    const f = setup();
    const card = handButtons(f)[1] as FakeEl;
    down(card, 10, 10);
    move(f, 10 + DRAG_THRESHOLD_PX - 1, 10);
    up(f, 10 + DRAG_THRESHOLD_PX - 1, 10);
    expect(overlays(f)).toHaveLength(0);
    expect(dropTargets(f)).toBe(0);
    const c = click(card);
    expect(c.defaultPrevented).toBe(false); // the click is not suppressed
    expect(f.spy.events).toEqual([{ type: 'selectCard', card: BASE.myHand[1] }]);
    expect(f.spy.confirm + f.spy.dispatch).toBe(0);
  });

  it('Enter and Space on a Hand card select it once; Enter on a legal cell selects the target; nothing confirms', () => {
    const f = setup();
    (handButtons(f)[0] as FakeEl).fire('keydown', { key: 'Enter' });
    (handButtons(f)[0] as FakeEl).fire('keydown', { key: ' ' });
    cellAt(f, 3, 2).fire('keydown', { key: 'Enter' });
    expect(f.spy.events).toEqual([
      { type: 'selectCard', card: hand0 },
      { type: 'selectCard', card: hand0 },
      { type: 'selectTarget', cell: LEGAL },
    ]);
    expect(f.spy.confirm + f.spy.dispatch).toBe(0);
  });

  it('a click on an illegal cell is explained and sends no draft event', () => {
    const f = setup();
    click(cellAt(f, 0, 0));
    expect(f.spy.explained).toEqual([NOT_ADJACENT]);
    expect(f.spy.events).toEqual([]);
  });

  it('a click on Cancel sends cancel; a click on Confirm calls confirmPlacement once and nothing else', () => {
    const f = setup(BASE, { target: LEGAL, card: hand0, orientation: 0 });
    click(control(f, 'cancel') as FakeEl);
    expect(f.spy.events).toEqual([{ type: 'cancel' }]);
    expect(f.spy.confirm).toBe(0);
    click(control(f, 'confirm') as FakeEl);
    expect(f.spy.confirm).toBe(1);
    expect(f.spy.events).toEqual([{ type: 'cancel' }]);
    expect(f.spy.dispatch).toBe(0);
  });
});

describe('Escape without a gesture [fake-DOM]', () => {
  it('cancels once from the Hand, from the controls, and from a Board cell (which handles it itself)', () => {
    for (const target of ['hand', 'controls', 'cell'] as const) {
      const f = setup(BASE, { target: LEGAL, card: hand0, orientation: 0 });
      const el = target === 'hand' ? (handButtons(f)[0] as FakeEl) : target === 'controls' ? (control(f, 'cancel') as FakeEl) : cellAt(f, 3, 2);
      el.fire('keydown', { key: 'Escape' });
      expect(f.spy.events, target).toEqual([{ type: 'cancel' }]);
      expect(f.spy.confirm + f.spy.dispatch, target).toBe(0);
    }
  });

  it('other keys on the panel do nothing', () => {
    const f = setup();
    (control(f, 'cancel') as FakeEl).fire('keydown', { key: 'a' });
    (control(f, 'cancel') as FakeEl).fire('keydown', { key: 'Tab' });
    expect(f.spy.events).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Drag [fake-DOM]
// ---------------------------------------------------------------------------------------------------------

describe('drag and drop [fake-DOM]', () => {
  it('drop on a legal cell: dragStart then dropOnCell(cell, card); no confirm and no dispatch', () => {
    const f = setup();
    const { x, y } = cellPoint(3, 2);
    const card = dragTo(f, x, y);
    // while dragging: the ghost is in the overlay, the legal cells are drop targets, the live region says so
    expect(overlays(f)).toHaveLength(1);
    expect(dropTargets(f)).toBe(8);
    expect(byClass(f, 'placement-live').textContent).toMatch(/Dragging a card/);
    expect(f.spy.events).toEqual([{ type: 'dragStart', card: hand0 }]); // a gesture alone creates no draft
    up(f, x, y);
    expect(f.spy.events).toEqual([{ type: 'dragStart', card: hand0 }, { type: 'dropOnCell', cell: LEGAL, card: hand0 }]);
    expect(f.spy.explained).toEqual([]);
    expect(f.spy.confirm).toBe(0);
    expect(f.spy.dispatch).toBe(0);
    expect(overlays(f)).toHaveLength(0);
    expect(dropTargets(f)).toBe(0);
    expect(byClass(f, 'placement-live').textContent).toBe('');
    // the click that follows the release is swallowed, so the card is not selected a second time
    const trailing = click(card);
    expect(trailing.defaultPrevented).toBe(true);
    expect(f.spy.types()).toEqual(['dragStart', 'dropOnCell']);
    // a later genuine click is not swallowed
    click(card);
    expect(f.spy.types()).toEqual(['dragStart', 'dropOnCell', 'selectCard']);
  });

  it('the cell is taken from the release point, not from the event target, and a ghost under the pointer is never a cell', () => {
    const f = setup();
    const { x, y } = cellPoint(4, 5);
    const card = handButtons(f)[0] as FakeEl;
    down(card, 10, 10);
    move(f, 60, 10);
    f.doc.dispatch('pointerup', { pointerId: 1, clientX: x, clientY: y, timeStamp: tick() });
    expect(f.spy.events.at(-1)).toEqual({ type: 'dropOnCell', cell: { row: 4, col: 5 }, card: hand0 });
    expect(f.doc.hitCalls.at(-1)).toEqual([x, y]);
  });

  it('a drop on the ghost element itself resolves to no cell: dropOutside', () => {
    const f = setup();
    const card = handButtons(f)[0] as FakeEl;
    down(card, 10, 10);
    move(f, 60, 10);
    f.doc.hit = () => overlays(f)[0] as FakeEl;
    up(f, 60, 10);
    expect(f.spy.types()).toEqual(['dragStart', 'dropOutside']);
  });

  it('drop outside the board: dragStart then dropOutside, nothing selected, nothing confirmed', () => {
    const f = setup();
    dragTo(f, 900, 900);
    up(f, 900, 900);
    expect(f.spy.events).toEqual([{ type: 'dragStart', card: hand0 }, { type: 'dropOutside' }]);
    expect(f.spy.explained).toEqual([]);
    expect(f.spy.confirm + f.spy.dispatch).toBe(0);
    expect(overlays(f)).toHaveLength(0);
    expect(dropTargets(f)).toBe(0);
    expect(byClass(f, 'placement-live').textContent).toMatch(/Dropped outside/);
  });

  it('drop on an illegal or occupied cell: the refusal is explained and nothing is placed or confirmed', () => {
    for (const [row, col] of [[0, 0], [3, 3]] as const) {
      const f = setup();
      f.spy.notices = { dropOnCell: 'TARGET_NOT_LEGAL' }; // what the controller returns for such a cell
      const { x, y } = cellPoint(row, col);
      dragTo(f, x, y);
      up(f, x, y);
      expect(f.spy.events, `${row},${col}`).toEqual([{ type: 'dragStart', card: hand0 }, { type: 'dropOnCell', cell: { row, col }, card: hand0 }]);
      expect(f.spy.explained, `${row},${col}`).toEqual([{ row, col }]);
      expect(f.spy.confirm + f.spy.dispatch).toBe(0);
    }
  });

  it('a refusal for the card (not in Hand) is not explained as a cell problem', () => {
    const f = setup();
    f.spy.notices = { dropOnCell: 'CARD_NOT_IN_HAND' };
    const { x, y } = cellPoint(3, 2);
    dragTo(f, x, y);
    up(f, x, y);
    expect(f.spy.explained).toEqual([]);
  });

  it('pointercancel, lost pointer capture and Escape each cancel: ghost removed, dragCancel sent, no drop, no confirm', () => {
    const ends: readonly [string, (f: Fixture) => void][] = [
      ['pointercancel', (f) => void f.doc.dispatch('pointercancel', { pointerId: 1, timeStamp: tick() })],
      ['lostpointercapture', (f) => void f.doc.dispatch('lostpointercapture', { pointerId: 1, timeStamp: tick() })],
      ['Escape', (f) => void f.doc.dispatch('keydown', { key: 'Escape', timeStamp: tick() })],
    ];
    for (const [name, end] of ends) {
      const f = setup();
      const { x, y } = cellPoint(3, 2);
      dragTo(f, x, y);
      expect(overlays(f), name).toHaveLength(1);
      end(f);
      expect(overlays(f), name).toHaveLength(0);
      expect(dropTargets(f), name).toBe(0);
      expect(f.spy.events, name).toEqual([{ type: 'dragStart', card: hand0 }, { type: 'dragCancel' }]); // Escape took the gesture, no extra cancel
      up(f, x, y); // a release after the cancel drops nothing
      expect(f.spy.types(), name).toEqual(['dragStart', 'dragCancel']);
      expect(f.spy.confirm + f.spy.dispatch, name).toBe(0);
      expect(byClass(f, 'placement-live').textContent, name).toMatch(/Drag cancelled/);
    }
  });

  it('the click after an Escape-cancelled drag is swallowed too', () => {
    const f = setup();
    const { x, y } = cellPoint(3, 2);
    const card = dragTo(f, x, y);
    f.doc.dispatch('keydown', { key: 'Escape', timeStamp: tick() });
    up(f, x, y);
    expect(click(card).defaultPrevented).toBe(true);
    expect(f.spy.types()).toEqual(['dragStart', 'dragCancel']);
  });

  it('the ghost follows the pointer by transform, has no identity text, and is a clone of the own card face', () => {
    const f = setup();
    dragTo(f, 130, 170);
    const ghost = overlays(f)[0] as FakeEl;
    expect(ghost.getAttribute('aria-hidden')).toBe('true');
    expect(ghost.getAttribute('style')).toBe('transform: translate(130px, 170px) translate(-50%, -50%)');
    expect(ghost.parentNode).toBe(byClass(f, 'placement-overlay'));
    expect(ghost.hasAttribute('draggable')).toBe(false);
    expect(classesOf(ghost.children[0] as FakeEl)).toEqual(expect.arrayContaining(['card-face', 'card-face--up']));
    for (const e of elementsOf(ghost)) for (const [name, value] of e.attributes) expect(value, name).not.toMatch(CARD_ID_TOKEN);
    move(f, 200, 210);
    expect(ghost.getAttribute('style')).toBe('transform: translate(200px, 210px) translate(-50%, -50%)');
    expect(overlays(f)).toHaveLength(1);
  });

  it('a drag shorter than the threshold is a tap: no ghost, no dragStart', () => {
    const f = setup();
    const card = handButtons(f)[0] as FakeEl;
    down(card, 10, 10);
    move(f, 10, 10 + DRAG_THRESHOLD_PX - 1);
    expect(overlays(f)).toHaveLength(0);
    up(f, 10, 10 + DRAG_THRESHOLD_PX - 1);
    expect(f.spy.events).toEqual([]);
  });

  it('does not start a gesture for a secondary button or a non-primary pointer', () => {
    const f = setup();
    const card = handButtons(f)[0] as FakeEl;
    card.fire('pointerdown', { pointerId: 1, isPrimary: true, button: 2, clientX: 10, clientY: 10, timeStamp: tick() });
    move(f, 100, 10);
    up(f, 100, 10);
    card.fire('pointerdown', { pointerId: 2, isPrimary: false, button: 0, clientX: 10, clientY: 10, timeStamp: tick() });
    move(f, 100, 10, 2);
    up(f, 100, 10, 2);
    expect(f.spy.events).toEqual([]);
    expect(overlays(f)).toHaveLength(0);
  });

  it('survives a re-render in the middle of a drag: the ghost and the gesture continue and the drop still arrives', () => {
    const f = setup();
    const { x, y } = cellPoint(3, 2);
    dragTo(f, x, y);
    f.render(BASE); // for example a language change; same epoch
    expect(overlays(f)).toHaveLength(1);
    expect(dropTargets(f)).toBe(8); // the rebuilt board keeps the drop-target classes while the drag lasts
    up(f, x, y);
    expect(f.spy.types()).toEqual(['dragStart', 'dropOnCell']);
  });

  it('a new gestureEpoch (the controller cleared the draft) cancels the drag: ghost gone, no dragCancel, no drop', () => {
    const f = setup();
    const { x, y } = cellPoint(3, 2);
    dragTo(f, x, y);
    f.render(BASE, EMPTY_DRAFT, { epoch: 1 });
    expect(overlays(f)).toHaveLength(0);
    expect(dropTargets(f)).toBe(0);
    up(f, x, y);
    expect(f.spy.events).toEqual([{ type: 'dragStart', card: hand0 }]); // nothing about a drop or a cancel
    expect(f.spy.confirm + f.spy.dispatch).toBe(0);
    // a later drag works again
    dragTo(f, x, y);
    up(f, x, y);
    expect(f.spy.types()).toEqual(['dragStart', 'dragStart', 'dropOnCell']);
  });

  it('an epoch change with no gesture does nothing special', () => {
    const f = setup();
    f.render(BASE, EMPTY_DRAFT, { epoch: 4 });
    f.render(BASE, EMPTY_DRAFT, { epoch: 5 });
    expect(f.spy.events).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Rotation in the panel, focus, dispose [fake-DOM]
// ---------------------------------------------------------------------------------------------------------

describe('rotation control in the panel [fake-DOM]', () => {
  const club = 'C-5' as CardId;
  const heart = 'H-5' as CardId;
  const view: PlayerView = { ...BASE, myHand: [club, heart] };
  const rotation: RotationInfoMap = { [club]: { rotationChangesCorners: true }, [heart]: { rotationChangesCorners: false } };

  it('appears for the drafted club only, toggles through draftEvent, and is absent for the heart', () => {
    const f = setup(view);
    f.render(view, { target: LEGAL, card: club, orientation: 0 }, { rotation });
    const rotate = control(f, 'rotate') as FakeEl;
    expect(rotate.getAttribute('aria-pressed')).toBe('false');
    click(rotate);
    expect(f.spy.events).toEqual([{ type: 'toggleRotation' }]);
    f.render(view, { target: LEGAL, card: club, orientation: 180 }, { rotation });
    expect(control(f, 'rotate')?.getAttribute('aria-pressed')).toBe('true');
    expect(classesOf(cellAt(f, 3, 2).children[0] as FakeEl)).toContain('board-ghost');
    f.render(view, { target: LEGAL, card: heart, orientation: 0 }, { rotation });
    expect(control(f, 'rotate')).toBeUndefined();
    expect(f.spy.confirm + f.spy.dispatch).toBe(0);
  });
});

describe('focus and dispose [fake-DOM]', () => {
  it('keeps the focus on the same Hand card, cell and control across a rebuild', () => {
    const f = setup();
    (handButtons(f)[1] as FakeEl).focus();
    const old = f.doc.activeElement;
    f.render(BASE, { target: null, card: BASE.myHand[1] as CardId, orientation: 0 });
    expect(f.doc.activeElement).not.toBe(old); // the element was rebuilt
    expect(f.doc.activeElement?.getAttribute('data-focus-key')).toBe('hand-1');
    cellAt(f, 3, 2).focus();
    f.render(BASE, { target: LEGAL, card: BASE.myHand[1] as CardId, orientation: 0 });
    expect(f.doc.activeElement?.getAttribute('data-focus-key')).toBe('cell-3-2');
    (control(f, 'cancel') as FakeEl).focus();
    f.render(BASE, { target: LEGAL, card: BASE.myHand[1] as CardId, orientation: 0 });
    expect(f.doc.activeElement?.getAttribute('data-focus-key')).toBe('placement-cancel');
  });

  it('dispose removes the panel, every listener, an active ghost, and later updates do nothing', () => {
    const f = setup();
    const docBaseline = f.doc.listenerCount();
    expect(docBaseline).toBeGreaterThan(0);
    const slot = byClass(f, 'placement-hand');
    expect(slot.listenerCount()).toBeGreaterThan(0);
    dragTo(f, 130, 170);
    expect(overlays(f)).toHaveLength(1);
    f.panel.dispose();
    f.panel.dispose(); // idempotent
    expect(f.root.children).toHaveLength(0);
    expect(f.doc.listenerCount()).toBe(0);
    expect(slot.listenerCount()).toBe(0);
    expect(overlays(f)).toHaveLength(0);
    f.panel.update(inputOf(BASE, EMPTY_DRAFT, f.spy.handlers));
    expect(f.root.children).toHaveLength(0);
    up(f, 130, 170);
    expect(f.spy.types()).toEqual(['dragStart']); // no drop after dispose
  });
});

// ---------------------------------------------------------------------------------------------------------
// Privacy [fake-DOM] and source scan
// ---------------------------------------------------------------------------------------------------------

describe('privacy of the panel DOM [fake-DOM]', () => {
  const CHOICES_RUN = advanceUntil(start(3), (s) => s.board.filter((c) => c !== null).length >= 10 && s.phase === 'PLACEMENT', CHOICES).state;

  it('has only the viewer\'s own cards in the Hand and no CardId, title, data-card or native drag source anywhere', () => {
    for (const viewer of ['P0', 'P1', 'P2', 'P3'] as const) {
      const view = viewFor(CHOICES_RUN, viewer);
      const own = view.myHand[0] as CardId;
      const f = setup(view, { target: { row: 3, col: 2 }, card: own, orientation: 0 });
      expect(handButtons(f)).toHaveLength(view.myHand.length);
      for (const e of all(f)) {
        for (const [name, value] of e.attributes) {
          expect(value, `${name}=${value}`).not.toMatch(CARD_ID_TOKEN);
          expect(['data-card', 'title'], name).not.toContain(name);
          if (name === 'draggable') expect([e.tagName, value]).toEqual(['img', 'false']);
        }
        expect(e.tagName === '#text' ? e.textContent : '').not.toMatch(CARD_ID_TOKEN);
        // a face-down card shows no text at all
        if (e.getAttribute('data-face') === 'down') expect(e.textContent.replace(/180°/g, '')).toBe('');
      }
      // the other seats' cards: every Hand button name belongs to the viewer's own Hand
      const names = handButtons(f).map((b) => b.getAttribute('aria-label'));
      expect(names).toHaveLength(new Set(names).size);
    }
  });

  it('writes no card identity into the live region, status or error line while dragging', () => {
    const f = setup();
    dragTo(f, 130, 170);
    for (const cls of ['placement-live', 'placement-status', 'placement-error']) expect(byClass(f, cls).textContent, cls).not.toMatch(CARD_ID_TOKEN);
    expect(byClass(f, 'placement-live').textContent).not.toMatch(/Hearts|Diamonds|Clubs|Spades/);
  });
});

describe('placement-panel.ts source [source]', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'placement-panel.ts'), 'utf8');
  const code = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  it('uses no HTML parsing, no drag-and-drop API, no global and no dispatch path', () => {
    expect(code).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|DataTransfer|dataTransfer|dragstart|setData/);
    expect(code).not.toMatch(/\bwindow\b|\bglobalThis\b|\bdocument\b|\bnavigator\b|localStorage/);
    expect(code).not.toMatch(/\bdispatch\b|touch-action|touchAction|preventDefault/);
    expect(code).not.toMatch(/data-card|'title'|\btitle:/);
  });

  it('calls confirmPlacement only through the controls', () => {
    expect((code.match(/confirmPlacement/g) ?? []).length).toBe(3); // the type member, the interface, the one forwarding closure
    expect(code).toMatch(/confirmPlacement: \(\) => current\.handlers\.confirmPlacement\(\)/);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Integration with the real controller [model + fake-DOM]
// ---------------------------------------------------------------------------------------------------------

class Queue {
  private readonly fns: (() => void)[] = [];
  scheduled = 0;
  readonly schedule: Schedule = (fn) => {
    this.scheduled++;
    this.fns.push(fn);
    return {
      cancel: () => {
        const at = this.fns.indexOf(fn);
        if (at >= 0) this.fns.splice(at, 1);
      },
    };
  };
  get pending(): number {
    return this.fns.length;
  }
  /** Runs every pending AI step, one callback at a time, until none is scheduled. */
  drain(limit = 50): void {
    for (let i = 0; i < limit && this.fns.length > 0; i++) (this.fns.shift() as () => void)();
  }
}

interface Game {
  readonly ctl: Controller;
  readonly queue: Queue;
  readonly doc: FakeDocument;
  readonly root: FakeEl;
  readonly seed: number;
  readonly renders: () => number;
  readonly f: Fixture;
}

/** A real controller (human P0, three AI seats) whose renderer feeds the panel in a fake document. */
function boot(seed: number): Game {
  setLanguage('en');
  const queue = new Queue();
  const doc = new FakeDocument();
  doc.hit = boardHit(doc);
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  let panel: PlacementPanelHandle | null = null;
  let renders = 0;
  const ctl = createController({
    schedule: queue.schedule,
    randomSeed: () => seed,
    language: () => 'en',
    renderer: (input: RenderInput) => {
      renders++;
      if (input.view === null) return;
      if (panel === null) panel = renderPlacementPanel(asDoc(doc), asRoot(root), input, t);
      else panel.update(input);
    },
  });
  expect(ctl.startGame({ seed })).toEqual({ ok: true });
  const f: Fixture = {
    doc,
    root,
    spy: new Spy(),
    get panel(): PlacementPanelHandle {
      return panel as PlacementPanelHandle;
    },
    render: () => undefined,
  };
  return { ctl, queue, doc, root, seed, renders: () => renders, f };
}

const viewJson = (ctl: Controller): string => JSON.stringify(ctl.getView('P0'));

/** The engine's own result of the same PLACE, as a view of P0: the reference for every path below. */
function referenceAfter(seed: number, action: Action): string {
  const placed = reduce(start(seed), action);
  if (!placed.ok) throw new Error(`reference PLACE rejected: ${placed.error.code}`);
  return JSON.stringify(viewFor(placed.value, 'P0'));
}

const firstLegalCell = (g: Game): FakeEl => cellButtons(g.f).find((c) => classesOf(c).includes('is-legal')) as FakeEl;
const posOfCell = (el: FakeEl): GridPosition => ({ row: Number(el.getAttribute('data-row')), col: Number(el.getAttribute('data-col')) });

describe('integration with the real controller [model + fake-DOM]', () => {
  const SEED = 5;

  it('position first, then card, then confirm: exactly one PLACE is accepted and the game equals the engine\'s own result', () => {
    const g = boot(SEED);
    const before = viewJson(g.ctl);
    const view0 = g.ctl.getView('P0') as PlayerView;
    expect(view0.turn).toBe('P0');
    expect(g.queue.scheduled).toBe(0); // the human is awaited, no AI step is planned

    const cell = firstLegalCell(g);
    click(cell); // target
    expect(g.ctl.getModel().draft).toEqual({ target: posOfCell(cell), card: null, orientation: 0 });
    expect(viewJson(g.ctl)).toBe(before); // a draft changes no game state
    expect(control(g.f, 'confirm')?.hasAttribute('disabled')).toBe(true);

    click(handButtons(g.f)[0] as FakeEl); // card
    expect(g.ctl.getModel().draft).toEqual({ target: posOfCell(cell), card: view0.myHand[0], orientation: 0 });
    expect(viewJson(g.ctl)).toBe(before);
    expect(g.ctl.getModel().actionCount).toBe(0);
    expect(status(g.f)).toBe('Press ✓ beside the card to place it.');

    const confirmButton = control(g.f, 'confirm') as FakeEl;
    expect(confirmButton.hasAttribute('disabled')).toBe(false);
    click(confirmButton);
    expect(g.ctl.getModel().actionCount).toBe(1);
    expect(g.ctl.getModel().draft).toEqual(EMPTY_DRAFT);
    expect(g.queue.scheduled).toBe(1); // the AI queue was scheduled once
    expect(g.queue.pending).toBe(1);
    const expected = referenceAfter(SEED, { type: 'PLACE', player: 'P0', card: view0.myHand[0] as CardId, pos: posOfCell(cell), orientation: 0 });
    expect(viewJson(g.ctl)).toBe(expected);
    const after = g.ctl.getView('P0') as PlayerView;
    expect(after.turn).toBe('P1');
    expect(after.board.filter((c) => c !== null)).toHaveLength(view0.board.filter((c) => c !== null).length + 1);

    // the panel now says that an AI seat plays and offers no way to act
    expect(status(g.f)).toBe('AI 1 is playing');
    expect(handButtons(g.f).every((b) => b.hasAttribute('disabled'))).toBe(true);
    expect(control(g.f, 'confirm')?.hasAttribute('disabled')).toBe(true);

    // a second activation of the very same (now stale) confirm button sends nothing
    click(confirmButton);
    expect(g.ctl.getModel().actionCount).toBe(1);
    expect(g.queue.scheduled).toBe(1);
    expect(viewJson(g.ctl)).toBe(expected);

    // after the AI seats play, the human is awaited again with an enabled Hand and an empty draft
    g.queue.drain();
    expect((g.ctl.getView('P0') as PlayerView).turn).toBe('P0');
    expect(g.ctl.getModel().draft).toEqual(EMPTY_DRAFT);
    expect(handButtons(g.f).every((b) => !b.hasAttribute('disabled'))).toBe(true);
    expect(status(g.f)).toBe('Select a card or a position on the board. You can also drag a card onto a legal cell.');
  });

  it('card first, then position, then confirm reaches the same game state as position first', () => {
    const g = boot(SEED);
    const view0 = g.ctl.getView('P0') as PlayerView;
    const cell = posOfCell(firstLegalCell(g));
    click(handButtons(g.f)[0] as FakeEl);
    click(cellAt(g.f, cell.row, cell.col)); // queried again: the panel was rebuilt by the card selection
    expect(g.ctl.getModel().draft).toEqual({ target: cell, card: view0.myHand[0], orientation: 0 });
    click(control(g.f, 'confirm') as FakeEl);
    expect(viewJson(g.ctl)).toBe(referenceAfter(SEED, { type: 'PLACE', player: 'P0', card: view0.myHand[0] as CardId, pos: cell, orientation: 0 }));
  });

  it('dragging a card onto the cell gives the same draft, and the same game after confirm, as the position-first path', () => {
    const positionFirst = boot(SEED);
    const cellA = firstLegalCell(positionFirst);
    click(cellA);
    click(handButtons(positionFirst.f)[0] as FakeEl);
    const draftA = positionFirst.ctl.getModel().draft;
    click(control(positionFirst.f, 'confirm') as FakeEl);

    const dragged = boot(SEED);
    const cellB = firstLegalCell(dragged);
    expect(posOfCell(cellB)).toEqual(posOfCell(cellA));
    const before = viewJson(dragged.ctl);
    const card = handButtons(dragged.f)[0] as FakeEl;
    const { x, y } = cellPoint(Number(cellB.getAttribute('data-row')), Number(cellB.getAttribute('data-col')));
    down(card, 10, 10);
    move(dragged.f, 10 + DRAG_THRESHOLD_PX, 10);
    move(dragged.f, x, y);
    expect(overlays(dragged.f)).toHaveLength(1);
    expect(dropTargets(dragged.f)).toBeGreaterThan(0);
    expect(dragged.ctl.getModel().draft).toEqual(EMPTY_DRAFT); // dragging alone creates no draft
    expect(viewJson(dragged.ctl)).toBe(before);
    up(dragged.f, x, y);
    expect(overlays(dragged.f)).toHaveLength(0);
    expect(dropTargets(dragged.f)).toBe(0);
    expect(dragged.ctl.getModel().draft).toEqual(draftA); // same draft
    expect(dragged.ctl.getModel().actionCount).toBe(0); // a drop never places
    expect(viewJson(dragged.ctl)).toBe(before);
    expect(dragged.queue.scheduled).toBe(0);
    // the click after the drag (on the old or the rebuilt card) selects nothing new and places nothing
    click(card);
    click(handButtons(dragged.f)[0] as FakeEl); // not suppressed: a genuine click on the same card is a no-op for the reducer
    expect(dragged.ctl.getModel().draft).toEqual(draftA);
    expect(dragged.ctl.getModel().actionCount).toBe(0);

    click(control(dragged.f, 'confirm') as FakeEl);
    expect(dragged.ctl.getModel().actionCount).toBe(1);
    expect(dragged.queue.scheduled).toBe(1);
    expect(viewJson(dragged.ctl)).toBe(viewJson(positionFirst.ctl)); // identical PlayerView after both paths
  });

  it('a drop on a cell the engine refuses leaves the draft alone, shows the localized reason in the alert line, and places nothing', () => {
    const g = boot(SEED);
    const before = viewJson(g.ctl);
    const card = handButtons(g.f)[0] as FakeEl;
    const { x, y } = cellPoint(0, 0); // A1: not adjacent to any card
    down(card, 10, 10);
    move(g.f, 10 + DRAG_THRESHOLD_PX, 10);
    move(g.f, x, y);
    up(g.f, x, y);
    expect(g.ctl.getModel().draft).toEqual(EMPTY_DRAFT);
    expect(g.ctl.getModel().actionCount).toBe(0);
    expect(viewJson(g.ctl)).toBe(before);
    expect(byClass(g.f, 'placement-error').textContent.length).toBeGreaterThan(0);
    expect(byClass(g.f, 'placement-error').textContent).not.toMatch(/\{|\berror\.[A-Z_]+/);
    expect(g.queue.scheduled).toBe(0);
    // an occupied cell (D4 holds a starting card) is refused the same way
    const occupied = cellPoint(3, 3);
    down(handButtons(g.f)[0] as FakeEl, 10, 10);
    move(g.f, 10 + DRAG_THRESHOLD_PX, 10);
    move(g.f, occupied.x, occupied.y);
    up(g.f, occupied.x, occupied.y);
    expect(g.ctl.getModel().draft).toEqual(EMPTY_DRAFT);
    expect(g.ctl.getModel().actionCount).toBe(0);
  });

  it('a drop outside the board, a cancelled drag and Escape leave the game and the draft unchanged', () => {
    const g = boot(SEED);
    const before = viewJson(g.ctl);
    const card = handButtons(g.f)[0] as FakeEl;
    down(card, 10, 10);
    move(g.f, 600, 600);
    up(g.f, 600, 600);
    down(handButtons(g.f)[0] as FakeEl, 10, 10);
    move(g.f, 100, 100);
    g.doc.dispatch('pointercancel', { pointerId: 1, timeStamp: tick() });
    down(handButtons(g.f)[0] as FakeEl, 10, 10);
    move(g.f, 100, 100);
    g.doc.dispatch('keydown', { key: 'Escape', timeStamp: tick() });
    up(g.f, 100, 100);
    expect(g.ctl.getModel().draft).toEqual(EMPTY_DRAFT);
    expect(g.ctl.getModel().actionCount).toBe(0);
    expect(viewJson(g.ctl)).toBe(before);
    expect(overlays(g.f)).toHaveLength(0);
    expect(g.queue.scheduled).toBe(0);
  });

  it('Cancel and Escape clear a full draft without changing the game', () => {
    const g = boot(SEED);
    const before = viewJson(g.ctl);
    const select = (): void => {
      click(firstLegalCell(g));
      click(handButtons(g.f)[0] as FakeEl);
    };
    select();
    expect(g.ctl.getModel().draft.target).not.toBeNull();
    click(control(g.f, 'cancel') as FakeEl);
    expect(g.ctl.getModel().draft).toEqual(EMPTY_DRAFT);
    expect(viewJson(g.ctl)).toBe(before);
    expect(g.ctl.getModel().actionCount).toBe(0);
    select();
    (handButtons(g.f)[0] as FakeEl).fire('keydown', { key: 'Escape' });
    expect(g.ctl.getModel().draft).toEqual(EMPTY_DRAFT);
    select();
    firstLegalCell(g).fire('keydown', { key: 'Escape' });
    expect(g.ctl.getModel().draft).toEqual(EMPTY_DRAFT);
    expect(viewJson(g.ctl)).toBe(before);
    expect(g.queue.scheduled).toBe(0);
  });

  it('the rotation control turns a club or spade to 180 and the confirmed PLACE carries it; hearts and diamonds never get the control', () => {
    let seed = 1;
    let g = boot(seed);
    while (!(g.ctl.getView('P0') as PlayerView).myHand.some(TURNS) && seed < 40) g = boot(++seed);
    const hand = (g.ctl.getView('P0') as PlayerView).myHand;
    const turnable = hand.find(TURNS) as CardId;
    const plain = hand.find((c) => !TURNS(c));
    const cell = posOfCell(firstLegalCell(g));

    if (plain !== undefined) {
      click(handButtons(g.f)[hand.indexOf(plain)] as FakeEl);
      expect(control(g.f, 'rotate')).toBeUndefined(); // hearts and diamonds: no control in the DOM at all
    }
    click(handButtons(g.f)[hand.indexOf(turnable)] as FakeEl);
    expect(control(g.f, 'rotate')).toBeUndefined();
    click(cellAt(g.f, cell.row, cell.col));
    expect(control(g.f, 'rotate')?.getAttribute('aria-pressed')).toBe('false');
    click(control(g.f, 'rotate') as FakeEl);
    expect(control(g.f, 'rotate')?.getAttribute('aria-pressed')).toBe('true');
    expect(g.ctl.getModel().draft).toEqual({ target: cell, card: turnable, orientation: 180 });
    click(control(g.f, 'confirm') as FakeEl);
    expect(g.ctl.getModel().actionCount).toBe(1);
    expect(viewJson(g.ctl)).toBe(referenceAfter(seed, { type: 'PLACE', player: 'P0', card: turnable, pos: cell, orientation: 180 }));
  });

  it('selecting another card resets the rotation and drops the control for a heart or a diamond', () => {
    let seed = 1;
    let g = boot(seed);
    const hasBoth = (s: PlayerView): boolean => s.myHand.some(TURNS) && s.myHand.some((c) => !TURNS(c));
    while (!hasBoth(g.ctl.getView('P0') as PlayerView) && seed < 40) g = boot(++seed);
    const hand = (g.ctl.getView('P0') as PlayerView).myHand;
    click(handButtons(g.f)[hand.findIndex(TURNS)] as FakeEl);
    click(firstLegalCell(g));
    click(control(g.f, 'rotate') as FakeEl);
    expect(g.ctl.getModel().draft.orientation).toBe(180);
    click(handButtons(g.f)[hand.findIndex((c) => !TURNS(c))] as FakeEl);
    expect(g.ctl.getModel().draft.orientation).toBe(0);
    expect(control(g.f, 'rotate')).toBeUndefined();
  });

  it('a stale draft cannot be confirmed: after the AI seats move, an old confirm control sends nothing', () => {
    const g = boot(SEED);
    click(firstLegalCell(g));
    click(handButtons(g.f)[0] as FakeEl);
    const staleConfirm = control(g.f, 'confirm') as FakeEl;
    click(staleConfirm);
    expect(g.ctl.getModel().actionCount).toBe(1);
    g.queue.drain(); // the AI seats play; P0 is on turn again with a fresh, empty draft
    const logged = g.ctl.getModel().actionCount;
    expect(logged).toBeGreaterThan(1);
    expect((g.ctl.getView('P0') as PlayerView).turn).toBe('P0');
    const scheduledBefore = g.queue.scheduled;
    const viewBefore = viewJson(g.ctl);
    click(staleConfirm); // a handler from an old render that still believes the draft is complete
    expect(g.ctl.getModel().actionCount).toBe(logged);
    expect(g.queue.scheduled).toBe(scheduledBefore);
    expect(viewJson(g.ctl)).toBe(viewBefore);
    // the fresh confirm button is disabled
    expect(control(g.f, 'confirm')?.hasAttribute('disabled')).toBe(true);
  });

  it('a draft whose target became occupied is dropped by the controller and the panel shows an empty draft', () => {
    const g = boot(SEED);
    const cell = firstLegalCell(g);
    click(cell);
    click(handButtons(g.f)[0] as FakeEl);
    click(control(g.f, 'confirm') as FakeEl); // places on `cell`
    g.queue.drain();
    // the old target cell is occupied now; the draft is empty and the cell is not a legal marker any more
    expect(g.ctl.getModel().draft).toEqual(EMPTY_DRAFT);
    const same = cellAt(g.f, Number(cell.getAttribute('data-row')), Number(cell.getAttribute('data-col')));
    expect(classesOf(same)).not.toContain('is-legal');
    expect(classesOf(same)).toContain('board-cell--occupied');
  });
});

describe('owner label of the preview and the Hand (task 19.4 known defect)', () => {
  it('names the previewed card and the Hand cards "You", not "Player 1"', () => {
    const f = setup();
    f.render(BASE, { target: LEGAL, card: hand0, orientation: 0 });
    const preview = cellAt(f, 3, 2).getAttribute('aria-label') ?? '';
    expect(preview).toContain(t('common.seat.human'));
    expect(preview).not.toContain('Player 1');
    for (const button of handButtons(f)) expect(button.getAttribute('aria-label') ?? '').toContain(t('common.seat.human'));
  });
});
