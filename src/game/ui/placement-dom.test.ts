// @vitest-environment happy-dom
// Codex, Issue #8: IC-11 / tasks 17.4 and 21.3 DOM adapter contracts.
// Hit testing is stubbed. These tests do not establish layout, capture or real touch behavior.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_DRAFT } from './placement-draft';
import { clickByLabel, label, mountTestApp, playHumanTurnAuto, useMountCleanup } from './testing/mount';
import type { MountedApp } from './testing/mount';

useMountCleanup(afterEach);
afterEach(() => vi.restoreAllMocks());

function setup(): MountedApp {
  const app = mountTestApp({ seed: 7, autoFlush: false });
  clickByLabel(app, label(app, 'setup.start'));
  return app;
}

function pointer(target: EventTarget, type: string, x = 10, y = 10): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
    pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y }));
}

function drag(app: MountedApp): HTMLElement {
  const card = app.root.querySelector<HTMLElement>('.hand-card')!;
  pointer(card, 'pointerdown');
  pointer(document, 'pointermove', 100, 100);
  expect(app.root.querySelector('[data-drag-overlay]')).not.toBeNull();
  return card;
}

function drop(app: MountedApp, selector: string): void {
  vi.spyOn(document, 'elementFromPoint').mockImplementation(() => app.root.querySelector(selector));
  const card = drag(app);
  // Captured pointerup targets the pressed card, while the coordinates hit the Board.
  pointer(card, 'pointerup', 100, 100);
}

describe('placement DOM contracts (fake-DOM)', () => {
  it('uses the release coordinates, suppresses the drag click and accepts a later genuine click exactly once', () => {
    const app = setup();
    const before = app.controller.getView('P0');
    const cell = app.root.querySelector('.board-cell.is-legal')!;
    const expected = { row: Number(cell.getAttribute('data-row')), col: Number(cell.getAttribute('data-col')) };
    drop(app, '.board-cell.is-legal');
    expect(document.elementFromPoint).toHaveBeenLastCalledWith(100, 100);
    expect(app.controller.getModel().draft.target).toEqual(expected);
    expect(app.controller.getView('P0')).toEqual(before);
    expect(app.controller.getModel().actionCount).toBe(0);
    const confirm = app.root.querySelector<HTMLButtonElement>('.placement-button--confirm')!;
    confirm.click(); // generated click immediately following a drag
    expect(app.controller.getModel().actionCount).toBe(0);
    pointer(confirm, 'pointerdown', 110, 110); // independent press disarms suppression
    confirm.click();
    confirm.click(); // even a second activation of the old node cannot place twice
    expect(app.controller.getModel().actionCount).toBe(1);
    expect(app.controller.getModel().draft).toEqual(EMPTY_DRAFT);
    expect(app.controller.getView('P0')!.board.filter(Boolean).length).toBe(5);
  });

  it.each(['pointercancel', 'lostpointercapture', 'Escape', 'outside', 'illegal', 'overlay'])(
    '%s cancels or rejects the drop without an Action', (ending) => {
      const app = setup();
      const before = app.controller.getView('P0');
      const hit = vi.spyOn(document, 'elementFromPoint').mockReturnValue(null);
      drag(app);
      if (ending === 'Escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      else if (ending === 'pointercancel' || ending === 'lostpointercapture') pointer(document, ending);
      else {
        if (ending === 'illegal') hit.mockReturnValue(app.root.querySelector('.board-cell--occupied'));
        if (ending === 'overlay') hit.mockReturnValue(app.root.querySelector('[data-drag-overlay] .card-face'));
        pointer(document, 'pointerup', 100, 100);
      }
      expect(app.root.querySelector('[data-drag-overlay]')).toBeNull();
      expect(app.controller.getModel().draft).toEqual(EMPTY_DRAFT);
      expect(app.controller.getModel().actionCount).toBe(0);
      expect(app.controller.getView('P0')).toEqual(before);
    },
  );

  it('only starts on own-Hand cards and exposes no hidden identity in markup or the ghost', () => {
    const app = setup();
    playHumanTurnAuto(app);
    app.flush(); // neutral starting cards are public; later opponents' placements are hidden
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(null);
    pointer(app.root.querySelector('.board-cell--occupied')!, 'pointerdown');
    pointer(document, 'pointermove', 100, 100);
    expect(app.root.querySelector('[data-drag-overlay]')).toBeNull();
    drag(app);
    // Raw CardIds must never be attributes, class names, titles, labels, text or drag payloads.
    expect(app.root.outerHTML).not.toMatch(/\b[HDSC]-(?:A|[2-9]|10|J|Q|K)\b/);
    const others = (['P1', 'P2', 'P3'] as const).flatMap((seat) => app.controller.getView(seat)!.myHand);
    for (const card of others) expect(app.root.outerHTML).not.toContain(card);
    const hidden = Array.from(app.root.querySelectorAll('.board-cell--occupied')).filter((cell) => {
      const index = Number(cell.getAttribute('data-row')) * 8 + Number(cell.getAttribute('data-col'));
      return app.controller.getView('P0')!.board[index]?.card === null;
    });
    expect(hidden.length).toBeGreaterThan(0);
    for (const cell of hidden) {
      const row = Number(cell.getAttribute('data-row'));
      const col = Number(cell.getAttribute('data-col'));
      const publicCard = app.controller.getView('P0')!.board[row * 8 + col]!;
      const rotated = publicCard.orientation === 180;
      const name = label(app, 'cards.name.down', {
        owner: label(app, 'common.seat.player', { n: Number(publicCard.owner.slice(1)) + 1 }),
        orientation: label(app, rotated ? 'cards.orientation.180' : 'cards.orientation.0'),
      });
      // Closed public-only schemas cover EVERY attribute (including class/title/data-*), not just raw CardIds.
      const attrs = (el: Element): Record<string, string> => Object.fromEntries(Array.from(el.attributes, (a) => [a.name, a.value]));
      expect(attrs(cell)).toEqual({
        class: 'board-cell board-cell--occupied', type: 'button', 'data-row': String(row), 'data-col': String(col),
        'data-focus-key': `cell-${row}-${col}`, tabindex: '-1',
        'aria-label': label(app, 'board.cell.name.down', { notation: `${String.fromCharCode(65 + col)}${row + 1}`, card: name }),
      });
      const face = cell.querySelector('.card-face')!;
      expect(cell.children.length).toBe(1);
      expect(cell.textContent).toBe(rotated ? '180°' : '');
      expect(attrs(face)).toEqual({
        class: `card-face card-face--cell card-face--down${rotated ? ' is-rotated' : ''}`, role: 'img',
        'data-owner': publicCard.owner, 'data-orientation': String(publicCard.orientation), 'data-face': 'down', 'aria-label': name,
      });
      expect(face.textContent).toBe(rotated ? '180°' : '');
      expect(face.children.length).toBe(rotated ? 1 : 0);
      if (rotated) {
        const marker = face.children[0]!;
        expect(attrs(marker)).toEqual({ class: 'card-face__orient', 'aria-hidden': 'true' });
        expect(marker.children.length).toBe(0);
      }
    }
  });

  it.each(['restart', 'abandon', 'dispose', 'turn'])('rejects a stale confirm after %s', (change) => {
    const app = setup();
    clickByLabel(app, app.root.querySelector('.hand-card')!.getAttribute('aria-label')!);
    (app.root.querySelector('.board-cell.is-legal') as HTMLButtonElement).click();
    const confirm = app.root.querySelector<HTMLButtonElement>('.placement-button--confirm')!;
    expect(confirm.disabled).toBe(false);
    if (change === 'restart') app.controller.restart();
    else if (change === 'dispose') app.started.dispose();
    else if (change === 'abandon') app.controller.abandon();
    else confirm.click(); // card left the Hand and turn passed
    const count = app.controller.getModel().actionCount;
    confirm.click();
    expect(app.controller.getModel().actionCount).toBe(count);
  });

  it('invalidates the previous human view and active gesture across a hand-over', () => {
    const app = mountTestApp({ seed: 7, autoFlush: false });
    (app.root.querySelector('#setup-humans-2') as HTMLInputElement).click();
    clickByLabel(app, label(app, 'setup.start'));
    clickByLabel(app, app.root.querySelector('.hand-card')!.getAttribute('aria-label')!);
    (app.root.querySelector('.board-cell.is-legal') as HTMLButtonElement).click();
    const oldConfirm = app.root.querySelector<HTMLButtonElement>('.placement-button--confirm')!;
    const oldHand = app.root.querySelector('.hand')!;
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(null);
    drag(app);
    // The authorized explicit confirm invalidates the still-active gesture and changes to the P1 gate.
    pointer(oldConfirm, 'pointerdown');
    oldConfirm.click();
    expect(app.controller.getModel().gate?.forSeat).toBe('P1');
    expect(app.root.contains(oldHand)).toBe(false);
    expect(app.root.querySelector('[data-drag-overlay]')).toBeNull();
    clickByLabel(app, label(app, 'guess.gate.ready'), { flush: false });
    expect(app.controller.getModel().viewer).toBe('P1');
    expect(app.controller.getModel().draft).toEqual(EMPTY_DRAFT);
    oldConfirm.click();
    pointer(document, 'pointerup', 100, 100);
    expect(app.controller.getModel().actionCount).toBe(1);
  });

  it('supports position-first keyboard selection, suit-dependent rotation, Escape and explicit confirmation', () => {
    const app = setup();
    const view = app.controller.getView('P0')!;
    const rotatingIndex = view.myHand.findIndex((card) => /^[CS]-/.test(card));
    expect(rotatingIndex).toBeGreaterThanOrEqual(0);
    const target = app.root.querySelector('.board-cell.is-legal')!;
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    app.root.querySelectorAll('.hand-card')[rotatingIndex]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const rotate = app.root.querySelector<HTMLButtonElement>('.placement-button--rotate')!;
    expect(rotate).not.toBeNull();
    // Native button Enter activation is browser behavior, represented here by click; real keyboard coverage is separate.
    rotate.click();
    expect(app.controller.getModel().draft.orientation).toBe(180);
    expect(app.controller.getModel().actionCount).toBe(0);
    app.root.querySelector('.placement-button--rotate')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(app.controller.getModel().draft).toEqual(EMPTY_DRAFT);
    app.root.querySelector('.board-cell.is-legal')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    app.root.querySelectorAll('.hand-card')[rotatingIndex]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    clickByLabel(app, label(app, 'hand.confirm'), { flush: false });
    expect(app.controller.getModel().actionCount).toBe(1);
  });
});
