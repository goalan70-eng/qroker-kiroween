// Hand component (task 17.3). Source: .kiro/specs/qroker-playable-game/design.md, "Placement interaction" (Board and
// Hand DOM contract, pointer gesture module, keyboard path); requirements 13.2, 13.3, 13.10, 13.15, 13.16, 16.6, 16.7,
// 17.2, 17.7.
//
// Two parts, like the other components:
//   * `handModel(view, draft, ownerLabel)`: a PURE function from the viewer's `PlayerView` and the UI-only
//     `PlacementDraft` to one plain model per card of the viewer's OWN Hand (`view.myHand`, canonical order). No
//     other Seat's Hand exists in a `PlayerView`, so none can be rendered.
//   * `renderHand(h | doc, model, t, handlers)`: builds the DOM with `h` (text through `textContent`, never HTML).
//
// Identity. Each card has an OPAQUE index (its position in `view.myHand`). The DOM carries only that index
// (`data-hand-index`); the CardId never appears in an attribute, a class, a `title`, a `data-*` value or a drag
// payload. The index is mapped back to the CardId by `model.cardOf(index)`, a closure that is not part of the
// serializable model and that the DOM does not see. The accessible name and the face show rank and suit of the
// viewer's own card, which the owner may see.
//
// DOM
//   <div class="hand" role="group" aria-label="Your hand">
//     N x <button type="button" class="hand-card [hand-card--draggable] [is-selected]" data-hand-index data-focus-key
//            aria-label aria-pressed [disabled]>  <span class="hand-card__face" aria-hidden> card face </span>
// A real `<button>` per card: Tab reaches it, Enter and Space select it, a click selects it. The same elements are
// the drag source: the panel attaches `attachHandGestures` to the slot that holds this group, and
// `.hand-card--draggable` is the only element that gets `touch-action: none` (hand.css). The component itself has
// no pointer handler and no `draggable` attribute: it uses no HTML Drag and Drop API and no `DataTransfer`.
//
// Handlers. The Hand receives `draftEvent` only (`selectCard`). It cannot confirm a placement and cannot dispatch.
//
// Imports: ui/, i18n/, core/view and core/types only (screen-class module of boundaries.test.ts).

import type { CardId, Orientation, PlayerId } from '../../core/types';
import type { PlayerView } from '../../core/view';
import { createH } from '../dom';
import type { CreateDoc, HFunction } from '../dom';
import type { DraftEvent, DraftResult, PlacementDraft } from '../placement-draft';
import { cardFaceModel, cardFaceName, renderCardFace } from './card-face';
import type { CardFaceModel, Translate } from './card-face';

/** The template of a selected card's name; an unselected card's name is the face name itself (no template). */
export type HandNameKey = 'hand.card.name.selected';

export interface HandCardModel {
  /** Opaque: the position in `view.myHand`. The only card reference that reaches the DOM. */
  readonly index: number;
  /** The face of the viewer's own card (`size: 'hand'`, owner: the viewer, upright). */
  readonly face: CardFaceModel;
  /** The card is the draft card. */
  readonly selected: boolean;
  /** Not the viewer's PLACEMENT turn: the card cannot be selected or dragged. */
  readonly disabled: boolean;
  /** `data-focus-key` of the button: `hand-<index>`. Never an identity. */
  readonly focusKey: string;
  /** String key of the name template, or `null` for an unselected card (its name is the face name). */
  readonly nameKey: HandNameKey | null;
  /** The class attribute of the button: state classes only, no identity. */
  readonly className: string;
}

export interface HandModel {
  readonly viewer: PlayerId;
  /** The viewer's own cards in canonical order. */
  readonly cards: readonly HandCardModel[];
  /** True unless it is the viewer's turn in the PLACEMENT phase. */
  readonly disabled: boolean;
  /**
   * Maps an opaque index back to a CardId of the viewer's Hand, or `null` for any other number. A function is
   * dropped by `JSON.stringify`, so a serialized model has no CardId.
   */
  readonly cardOf: (index: number) => CardId | null;
}

/** Whether `view` is a state in which the viewer may place a card. */
export function isPlacementTurn(view: PlayerView): boolean {
  return view.phase === 'PLACEMENT' && view.turn === view.viewer;
}

export function handCardClassName(flags: { readonly disabled: boolean; readonly selected: boolean }): string {
  const classes = ['hand-card'];
  if (!flags.disabled) classes.push('hand-card--draggable');
  if (flags.selected) classes.push('is-selected');
  if (flags.disabled) classes.push('is-disabled');
  return classes.join(' ');
}

/**
 * The model of the Hand. Pure and deterministic; the inputs are not changed.
 *
 * @param ownerLabel the viewer's name in the current language, used in the accessible name of each card face.
 */
export function handModel(view: PlayerView, draft: PlacementDraft, ownerLabel: string): HandModel {
  const hand: readonly CardId[] = [...view.myHand];
  const disabled = !isPlacementTurn(view);
  const cards = hand.map((card, index): HandCardModel => {
    const selected = draft.card === card;
    return {
      index,
      face: cardFaceModel({ card, owner: view.viewer, orientation: selected ? draft.orientation : 0, size: 'hand', ownerLabel }),
      selected,
      disabled,
      focusKey: `hand-${index}`,
      nameKey: selected ? 'hand.card.name.selected' : null,
      className: handCardClassName({ disabled, selected }),
    };
  });
  return {
    viewer: view.viewer,
    cards,
    disabled,
    cardOf: (index) => (Number.isInteger(index) && index >= 0 && index < hand.length ? (hand[index] as CardId) : null),
  };
}

/** The localized accessible name of a Hand card: the face name, with the selected state. */
export function handCardName(card: HandCardModel, t: Translate): string {
  const face = cardFaceName(card.face, t);
  return card.nameKey === null ? face : t(card.nameKey, { card: face });
}

/** The only function of the controller that the Hand may call. */
export interface HandHandlers {
  /** The Hand sends `selectCard` only. */
  readonly draftEvent: (event: DraftEvent) => DraftResult | void;
}

/** The `data-hand-index` of the Hand card that holds `target` (the button itself or something inside it), or `null`. */
export function handIndexFromTarget(target: unknown): number | null {
  const el = target as { closest?: (selector: string) => { getAttribute(name: string): string | null } | null } | null;
  if (el === null || el === undefined || typeof el.closest !== 'function') return null;
  const button = el.closest('[data-hand-index]');
  if (button === null) return null;
  const raw = button.getAttribute('data-hand-index');
  return raw !== null && /^(?:0|[1-9]\d{0,2})$/.test(raw) ? Number(raw) : null;
}

/**
 * Builds the Hand element from `model`. `target` is an `h` function or a document. Returns the `role="group"`
 * element with one button per card.
 */
export function renderHand(target: HFunction | CreateDoc, model: HandModel, t: Translate, handlers: HandHandlers): HTMLElement {
  const h: HFunction = typeof target === 'function' ? target : createH(target);
  const select = (index: number): void => {
    if (model.disabled) return;
    const card = model.cardOf(index);
    if (card !== null) handlers.draftEvent({ type: 'selectCard', card });
  };
  const buttons = model.cards.map((card) =>
    h(
      'button',
      {
        class: card.className,
        focusKey: card.focusKey,
        attrs: { type: 'button', 'data-hand-index': card.index, disabled: card.disabled },
        aria: { label: handCardName(card, t), pressed: card.selected ? 'true' : 'false' },
        on: {
          click: () => select(card.index),
          keydown: (event) => {
            const e = event as KeyboardEvent;
            if (e.isComposing === true || e.altKey === true || e.metaKey === true || e.ctrlKey === true) return;
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
              e.preventDefault(); // no second, native click for the same key press
              if (e.repeat !== true) select(card.index);
            }
          },
          // Space clicks a button on key release in some browsers; the keydown already handled it.
          keyup: (event) => {
            const key = (event as KeyboardEvent).key;
            if (key === ' ' || key === 'Spacebar') event.preventDefault();
          },
        },
      },
      h('span', { class: 'hand-card__face', aria: { hidden: 'true' } }, renderCardFace(h, card.face, t)),
    ),
  );
  return h(
    'div',
    { class: 'hand', attrs: { role: 'group' }, aria: { label: t('hand.label') } },
    ...(buttons.length > 0 ? buttons : [h('span', { class: 'hand-empty' }, t('hand.empty'))]),
  );
}

// ---------------------------------------------------------------------------------------------------------
// Drag ghost
// ---------------------------------------------------------------------------------------------------------

/**
 * The inline style that places the ghost at the pointer: a `transform` (the element is `position: fixed` at the
 * viewport origin in placement.css), centred on the point. Non-finite coordinates give 0.
 */
export function dragGhostStyle(x: number, y: number): string {
  const px = (n: number): number => (Number.isFinite(n) ? Math.round(n) : 0);
  return `transform: translate(${px(x)}px, ${px(y)}px) translate(-50%, -50%)`;
}

/**
 * The drag ghost: a clone of the viewer's own card face inside a `[data-drag-overlay]` wrapper (`aria-hidden`,
 * `pointer-events: none` by CSS). It carries no text beyond what the owner's own face shows, no CardId, no
 * `draggable` attribute and no `DataTransfer`.
 */
export function renderDragGhost(
  target: HFunction | CreateDoc,
  face: CardFaceModel,
  t: Translate,
  x: number,
  y: number,
): HTMLElement {
  const h: HFunction = typeof target === 'function' ? target : createH(target);
  return h(
    'div',
    { class: 'drag-overlay', attrs: { 'data-drag-overlay': true, style: dragGhostStyle(x, y) }, aria: { hidden: 'true' } },
    renderCardFace(h, face, t),
  );
}

/** Moves a ghost made by `renderDragGhost` to the pointer position. */
export function moveDragGhost(ghost: HTMLElement, x: number, y: number): void {
  ghost.setAttribute('style', dragGhostStyle(x, y));
}

/** The face of the ghost for `card` (own Hand card): upright unless it is the drafted card, which keeps its rotation. */
export function dragGhostFace(
  view: PlayerView,
  draft: PlacementDraft,
  card: CardId,
  ownerLabel: string,
): CardFaceModel {
  const orientation: Orientation = draft.card === card ? draft.orientation : 0;
  return cardFaceModel({ card, owner: view.viewer, orientation, size: 'hand', ownerLabel });
}

/** Every string key this module passes to `t`. */
export const HAND_STRING_KEYS = ['hand.label', 'hand.empty', 'hand.card.name.selected'] as const;
