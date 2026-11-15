// Placement panel (task 17.3): composes the Board, the Hand, the placement controls, the drag ghost, the status line,
// the error line and the live region for ONE render input. Source: .kiro/specs/qroker-playable-game/design.md,
// "Placement interaction"; requirements 13.2 to 13.6, 13.10 to 13.16, 16.6, 16.7, 17.2, 17.7.
//
// Use (the controller's renderer calls the same handle on every render):
//   let panel: PlacementPanelHandle | null = null;
//   renderer: (input) => { if (panel === null) panel = renderPlacementPanel(doc, root, input, t); else panel.update(input); }
//
// DOM, in this order (the panel owns the element `panel.element`, which it appends to `root`):
//   div.placement-panel
//     div.placement-status    role="status"      hint, or "AI 2 is playing" while the controls are off
//     div.placement-board     the Board (replaced on each update)
//     div.placement-hand      the Hand (replaced on each update); the gesture host: pointer listeners live here and
//                             survive updates, so the click guard and the pointer capture outlive a re-render
//     div.placement-controls-slot   rotation (clubs and spades only), Confirm, Cancel
//     div.placement-error     role="alert"       the controller's localized `displayError`, text only
//     div.placement-live      aria-live="polite" drag messages
//     div.placement-overlay   the drag ghost lives here (only during a gesture)
//
// Flows
//   * Tap / click / Enter / Space on a Hand card: `draftEvent({ type: 'selectCard', card })` (the Hand maps the opaque
//     index to the CardId). A tap is a `pointerdown` and `pointerup` closer than `DRAG_THRESHOLD_PX`: the gesture
//     emits nothing and the browser `click` does the selection.
//   * Drag: `attachHandGestures` on the Hand slot. `dragStart` -> `draftEvent({ type: 'dragStart', card })`, the ghost
//     appears in the overlay, the Board is re-rendered with `dragActive` (legal cells carry the drop-target classes),
//     the live region announces the drag. `dragMove` moves the ghost. `drop` -> the ghost and the drop classes go;
//     the cell under the RELEASE POINT (`cellFromPoint`, never `event.target`) becomes
//     `draftEvent({ type: 'dropOnCell', cell, card })`, no cell becomes `draftEvent({ type: 'dropOutside' })`. A cell
//     that the controller refuses (`notice: 'TARGET_NOT_LEGAL'`) is explained through `explainTarget(cell)`.
//     `cancelled` (pointercancel, lost capture, Escape) -> the ghost goes and `draftEvent({ type: 'dragCancel' })`
//     is sent. A drag never calls `confirmPlacement` or `dispatch`; the click after a drag is suppressed by the gesture
//     module.
//   * Escape: a keydown on the panel (outside the Board grid, which handles Escape itself) sends
//     `draftEvent({ type: 'cancel' })`. During a gesture the gesture module takes Escape first.
//   * `update(input)` with a new `model.gestureEpoch` cancels an active gesture (the controller invalidated the
//     draft: viewer, turn, phase, action count or game changed) and removes the ghost, without sending `dragCancel`.
//   * Focus: each update runs inside `renderWithFocus` when the document offers `activeElement`, `getElementById` and
//     `querySelector`, so the focused cell, card or button keeps the focus through the rebuild (`data-focus-key`).
//
// Privacy: only `PlayerView` data is read. The Hand shows the viewer's OWN cards; there is no other Seat's Hand in a
// view. No CardId is written to any attribute, class, `title`, `data-*` value or payload. The ghost is a clone of the
// viewer's own card face. Nothing is derived from a hidden card, and no completion preview is shown.
//
// State: closure variables only; nothing is stored on `window` or `globalThis`. The only `Document` access is the
// injected `doc`.
//
// Imports: ui/, i18n/, core/view and core/types only (screen-class module of boundaries.test.ts). The controller is
// reached through the structural `PlacementPanelInput` below, which `RenderInput` satisfies.

import type { CardId, GridPosition } from '../../core/types';
import type { PlayerView } from '../../core/view';
import { createH, renderWithFocus } from '../dom';
import type { CreateDoc, FocusDoc } from '../dom';
import type { DraftEvent, DraftResult, PlacementDraft, RotationInfoMap } from '../placement-draft';
import { attachHandGestures } from '../pointer-gesture';
import type { CancelReason, GestureDocument } from '../pointer-gesture';
import { boardModel, renderBoard } from './board';
import type { Translate } from './card-face';
import { controlsModel, controlsStatusText, renderPlacementControls } from './placement-controls';
import type { DisplayErrorLike } from './placement-controls';
import { dragGhostFace, handIndexFromTarget, handModel, moveDragGhost, renderDragGhost, renderHand } from './hand';
import type { HandModel } from './hand';

/** The functions the panel may call. The controller's `RenderHandlers` satisfies this; it has no `dispatch` here. */
export interface PlacementHandlers {
  readonly draftEvent: (event: DraftEvent) => DraftResult | void;
  readonly confirmPlacement: () => unknown;
  readonly explainTarget: (cell: GridPosition) => unknown;
}

/** What the panel reads from a render input. The controller's `RenderInput` satisfies this structurally. */
export interface PlacementPanelInput {
  readonly view: PlayerView | null;
  readonly model: { readonly draft: PlacementDraft; readonly gestureEpoch: number };
  readonly displayError: DisplayErrorLike | null;
  readonly rotationInfo: RotationInfoMap;
  readonly handlers: PlacementHandlers;
}

/** The part of `Document` that the panel needs: element creation, hit testing, global listeners, optional focus. */
export type PlacementPanelDocument = CreateDoc & GestureDocument & Partial<FocusDoc>;

export interface PlacementPanelHandle {
  /** The panel element (a child of `root` until `dispose`). */
  readonly element: HTMLElement;
  /** Renders `input` into the panel. After `dispose` it does nothing. */
  update(input: PlacementPanelInput): void;
  /** Detaches the gesture and keyboard listeners, removes the ghost and the panel element. Idempotent. */
  dispose(): void;
}

function hasFocusApi(doc: PlacementPanelDocument): doc is PlacementPanelDocument & FocusDoc {
  return 'activeElement' in doc && typeof doc.getElementById === 'function' && typeof doc.querySelector === 'function';
}

function clear(el: HTMLElement): void {
  while (el.firstChild !== null) el.removeChild(el.firstChild);
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text; // an unchanged alert or status is not announced again
}

/** Mounts the panel into `root`, renders `input`, and returns the handle for later renders. */
export function renderPlacementPanel(
  doc: PlacementPanelDocument,
  root: HTMLElement,
  input: PlacementPanelInput,
  t: Translate,
): PlacementPanelHandle {
  const h = createH(doc);
  const statusEl = h('div', { class: 'placement-status', attrs: { role: 'status' } });
  const boardSlot = h('div', { class: 'placement-board' });
  const handSlot = h('div', { class: 'placement-hand' });
  const controlsSlot = h('div', { class: 'placement-controls-slot' });
  const errorEl = h('div', { class: 'placement-error', attrs: { role: 'alert' } });
  const liveEl = h('div', { class: 'placement-live', aria: { live: 'polite', atomic: 'true' } });
  const overlayEl = h('div', { class: 'placement-overlay' });
  const panel = h('div', { class: 'placement-panel' }, statusEl, boardSlot, handSlot, controlsSlot, errorEl, liveEl, overlayEl);

  let current: PlacementPanelInput = input;
  let hand: HandModel | null = null;
  let dragging = false;
  let ghost: HTMLElement | null = null;
  let updating = false;
  let disposed = false;
  let lastEpoch = input.model.gestureEpoch;

  const ownerLabel = (): string => t('common.seat.human');

  // ---- Board ----------------------------------------------------------------------------------------------

  function buildBoard(view: PlayerView): HTMLElement {
    const handlers = {
      draftEvent: (e: DraftEvent) => current.handlers.draftEvent(e),
      explainTarget: (c: GridPosition) => current.handlers.explainTarget(c),
    };
    return renderBoard(h, boardModel(view, current.model.draft, { dragActive: dragging }), t, handlers, { dragActive: dragging });
  }

  /** Re-renders only the Board (drag start and end change its drop-target classes). */
  function refreshBoard(): void {
    const view = current.view;
    if (disposed || updating || view === null) return;
    clear(boardSlot);
    boardSlot.appendChild(buildBoard(view));
  }

  // ---- drag ghost -----------------------------------------------------------------------------------------

  function endDrag(): void {
    const was = dragging;
    dragging = false;
    if (ghost !== null) {
      if (ghost.parentNode !== null) ghost.parentNode.removeChild(ghost);
      ghost = null;
    }
    if (was) refreshBoard();
  }

  const gesture = attachHandGestures(
    handSlot,
    {
      enabled: () => !disposed && hand !== null && !hand.disabled,
      cardAt: (target): CardId | null => {
        const index = handIndexFromTarget(target);
        return index === null || hand === null ? null : hand.cardOf(index);
      },
      onDragStart(card, x, y) {
        const view = current.view;
        if (disposed || view === null) return;
        current.handlers.draftEvent({ type: 'dragStart', card }); // the draft does not change
        dragging = true;
        ghost = renderDragGhost(h, dragGhostFace(view, current.model.draft, card, ownerLabel()), t, x, y);
        overlayEl.appendChild(ghost);
        setText(liveEl, t('hand.live.dragging'));
        refreshBoard();
      },
      onDragMove(x, y) {
        if (ghost !== null) moveDragGhost(ghost, x, y);
      },
      onDrop(card, over) {
        endDrag();
        if (disposed) return;
        if (over === null) {
          setText(liveEl, t('hand.live.dropOutside'));
          current.handlers.draftEvent({ type: 'dropOutside' });
          return;
        }
        setText(liveEl, '');
        const result = current.handlers.draftEvent({ type: 'dropOnCell', cell: over, card });
        // The controller refused the cell (occupied, not adjacent, off the grid): show the localized reason.
        if (result !== undefined && result !== null && result.notice === 'TARGET_NOT_LEGAL') current.handlers.explainTarget(over);
      },
      onCancel(reason: CancelReason) {
        endDrag();
        if (disposed) return;
        if (reason === 'INVALIDATED') {
          setText(liveEl, ''); // the controller already cleared the draft
          return;
        }
        setText(liveEl, t('hand.live.dragCancelled'));
        current.handlers.draftEvent({ type: 'dragCancel' });
      },
    },
    doc,
  );

  // ---- Escape ---------------------------------------------------------------------------------------------

  const onKeyDown = (event: Event): void => {
    if ((event as KeyboardEvent).key !== 'Escape' || disposed) return;
    const target = event.target as { closest?: (selector: string) => unknown } | null;
    if (target !== null && typeof target?.closest === 'function' && target.closest('[role="grid"]') !== null) return; // the Board handled it
    current.handlers.draftEvent({ type: 'cancel' });
  };
  panel.addEventListener('keydown', onKeyDown);

  // ---- rendering ------------------------------------------------------------------------------------------

  function rebuild(): void {
    const view = current.view;
    clear(boardSlot);
    clear(handSlot);
    clear(controlsSlot);
    if (view === null) {
      hand = null;
      setText(statusEl, '');
      setText(errorEl, '');
      return;
    }
    const draft = current.model.draft;
    hand = handModel(view, draft, ownerLabel());
    const controls = controlsModel(view, draft, current.rotationInfo, current.displayError);
    setText(statusEl, controlsStatusText(controls, t));
    setText(errorEl, controls.errorText ?? '');
    boardSlot.appendChild(buildBoard(view));
    handSlot.appendChild(
      renderHand(h, hand, t, { draftEvent: (e) => current.handlers.draftEvent(e) }),
    );
    controlsSlot.appendChild(
      renderPlacementControls(h, controls, t, {
        draftEvent: (e) => current.handlers.draftEvent(e),
        confirmPlacement: () => current.handlers.confirmPlacement(),
      }),
    );
  }

  function update(next: PlacementPanelInput): void {
    if (disposed) return;
    current = next;
    updating = true;
    try {
      if (next.model.gestureEpoch !== lastEpoch) {
        lastEpoch = next.model.gestureEpoch;
        gesture.cancel('INVALIDATED'); // stale draft or turn: end an active drag, remove the ghost, no placement
        endDrag();
      }
      if (hasFocusApi(doc)) renderWithFocus(doc, rebuild);
      else rebuild();
    } finally {
      updating = false;
    }
    // The ghost belongs to a gesture that is still active; it stays in its own container across the rebuild.
  }

  root.appendChild(panel);
  update(input);

  return {
    element: panel,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      gesture.detach();
      panel.removeEventListener('keydown', onKeyDown);
      dragging = false;
      if (ghost !== null && ghost.parentNode !== null) ghost.parentNode.removeChild(ghost);
      ghost = null;
      if (panel.parentNode !== null) panel.parentNode.removeChild(panel);
    },
  };
}
