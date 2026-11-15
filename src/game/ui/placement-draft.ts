// The placement draft (task 17.4; design.md "Placement interaction", requirements 13.3, 13.4, 13.10 to 13.14).
//
// A pure reducer for the UI-only `PlacementDraft`: the target cell, the card and the orientation that a human
// seat has chosen but not confirmed. Nothing here touches the game: a draft never changes a `GameState`, and a
// `PLACE` Action is built only by the controller's `confirmPlacement` after `validateDraft` agrees.
//
// Imports: `core/types` and `core/view` only (screen-class module, see the dependency table). No DOM, no clock.
//
// Hidden information. `PlacementDraft.card` is the CardId of a card in the viewer's OWN Hand, which the viewer may
// see. It lives in UI state only. It must NEVER be rendered into an attribute, a class, a `title`, a `data-*`
// value, a drag payload or an `aria-label` of a hidden card; screens render the card's face through the card-face
// model, and the Hand card elements carry an index (`data-hand-index`), not the CardId.
//
// Rules implemented by `reduceDraft` (every rule returns the SAME draft object when nothing changes):
//   selectCard(c)      c not in hand -> unchanged + CARD_NOT_IN_HAND. Same card -> unchanged. Otherwise card = c,
//                      orientation = 0 (a new card always resets the rotation), target kept only if it is still legal.
//   selectTarget(x)    x not legal -> unchanged + TARGET_NOT_LEGAL. Otherwise target = x; card and orientation kept.
//   dragStart(c)       unchanged: a gesture alone creates no draft (the gesture lives in pointer-gesture.ts).
//   dropOnCell(x, c)   c not in hand -> unchanged + CARD_NOT_IN_HAND. x not legal -> unchanged + TARGET_NOT_LEGAL (the
//                      earlier draft stays, the dragged card is NOT selected, and the drop is never moved to a
//                      nearby cell). Otherwise target = exactly x, card = c, orientation kept when c is the
//                      current card and 0 otherwise.
//   dropOutside, dragCancel  unchanged, no notice.
//   toggleRotation     only with a card whose rotation capability is true: 0 <-> 180. Otherwise unchanged +
//                      ROTATION_NOT_MEANINGFUL (an addition to the design's notices, so a screen can tell a refused
//                      toggle from a no-op). Never 90 or 270, never automatic, the target is never touched.
//   cancel, invalidate -> EMPTY_DRAFT.
//
// Invariants for a context built from one `PlayerView`: `card` is null or in `ctx.hand`; `target` is null or in
// `ctx.legal`; `orientation === 180` implies a non-null card with rotation capability.

import type { CardId, ErrorCode, GridPosition, Orientation } from '../core/types';
import { legalCellsFor } from '../core/view';
import type { PlayerView } from '../core/view';

export interface PlacementDraft {
  /** A cell that was legal when it was chosen. */
  readonly target: GridPosition | null;
  /** A card of the viewer's OWN Hand. UI state only: never rendered into attributes or drag payloads. */
  readonly card: CardId | null;
  /** 0 or 180; 180 only for a card whose rotation changes its printed corners. */
  readonly orientation: Orientation;
}

export const EMPTY_DRAFT: PlacementDraft = Object.freeze({ target: null, card: null, orientation: 0 });

export type DraftState = 'IDLE' | 'TARGET_SELECTED' | 'CARD_SELECTED' | 'PREVIEW';

/** Derived: nothing -> IDLE; target only -> TARGET_SELECTED; card only -> CARD_SELECTED; both -> PREVIEW. */
export function draftState(d: PlacementDraft): DraftState {
  if (d.card === null) return d.target === null ? 'IDLE' : 'TARGET_SELECTED';
  return d.target === null ? 'CARD_SELECTED' : 'PREVIEW';
}

export type InvalidateReason = 'VIEWER' | 'PHASE' | 'TURN' | 'GAME' | 'HAND' | 'RESTART' | 'ABANDON' | 'DISPOSE';

export type DraftEvent =
  | { readonly type: 'selectTarget'; readonly cell: GridPosition }
  | { readonly type: 'selectCard'; readonly card: CardId }
  | { readonly type: 'dragStart'; readonly card: CardId }
  | { readonly type: 'dropOnCell'; readonly cell: GridPosition; readonly card: CardId }
  | { readonly type: 'dropOutside' }
  | { readonly type: 'dragCancel' }
  | { readonly type: 'toggleRotation' }
  | { readonly type: 'cancel' }
  | { readonly type: 'invalidate'; readonly reason: InvalidateReason };

/** Rotation capability per card. Keys: the viewer's own Hand CardIds only. */
export type RotationInfoMap = Readonly<Partial<Record<CardId, { readonly rotationChangesCorners: boolean }>>>;

export interface DraftContext {
  /** `'row,col'` keys (see `cellKey`) of `legalCellsFor(view)`, recomputed from the latest view for every event. */
  readonly legal: ReadonlySet<string>;
  /** `view.myHand`. */
  readonly hand: readonly CardId[];
  readonly rotation: RotationInfoMap;
}

export type DraftNotice = 'TARGET_NOT_LEGAL' | 'CARD_NOT_IN_HAND' | 'ROTATION_NOT_MEANINGFUL';

export interface DraftResult {
  readonly draft: PlacementDraft;
  readonly notice: DraftNotice | null;
}

export function cellKey(p: GridPosition): string {
  return `${p.row},${p.col}`;
}

/**
 * The context of `reduceDraft` for one view. The cells come from `legalCellsFor(view)` (never from pixels or CSS).
 * Draft events that would add a card are only possible while it is the viewer's PLACEMENT turn: otherwise `hand`
 * is empty, so a screen that is still enabled cannot start a draft during an AI turn (the legal set is empty
 * then as well, by `legalCellsFor`).
 */
export function draftContextFor(view: PlayerView, rotation: RotationInfoMap): DraftContext {
  const active = view.phase === 'PLACEMENT' && view.turn === view.viewer;
  return {
    legal: new Set(legalCellsFor(view).map(cellKey)),
    hand: active ? view.myHand : [],
    rotation,
  };
}

const unchanged = (d: PlacementDraft, notice: DraftNotice | null = null): DraftResult => ({ draft: d, notice });

function make(target: GridPosition | null, card: CardId | null, orientation: Orientation): PlacementDraft {
  const copy = target === null ? null : Object.freeze({ row: target.row, col: target.col });
  return Object.freeze({ target: copy, card, orientation });
}

const sameCell = (a: GridPosition | null, b: GridPosition): boolean => a !== null && a.row === b.row && a.col === b.col;

/** Pure; never mutates its arguments. */
export function reduceDraft(d: PlacementDraft, e: DraftEvent, ctx: DraftContext): DraftResult {
  switch (e.type) {
    case 'selectCard': {
      if (!ctx.hand.includes(e.card)) return unchanged(d, 'CARD_NOT_IN_HAND');
      if (d.card === e.card) return unchanged(d);
      const keep = d.target !== null && ctx.legal.has(cellKey(d.target));
      return unchanged(make(keep ? d.target : null, e.card, 0));
    }
    case 'selectTarget': {
      if (!ctx.legal.has(cellKey(e.cell))) return unchanged(d, 'TARGET_NOT_LEGAL');
      if (sameCell(d.target, e.cell)) return unchanged(d);
      return unchanged(make(e.cell, d.card, d.orientation));
    }
    case 'dropOnCell': {
      if (!ctx.hand.includes(e.card)) return unchanged(d, 'CARD_NOT_IN_HAND');
      if (!ctx.legal.has(cellKey(e.cell))) return unchanged(d, 'TARGET_NOT_LEGAL');
      const orientation: Orientation = d.card === e.card ? d.orientation : 0;
      if (sameCell(d.target, e.cell) && d.card === e.card) return unchanged(d);
      return unchanged(make(e.cell, e.card, orientation));
    }
    case 'toggleRotation': {
      const card = d.card;
      if (card === null || ctx.rotation[card]?.rotationChangesCorners !== true) {
        return unchanged(d, 'ROTATION_NOT_MEANINGFUL');
      }
      return unchanged(make(d.target, card, d.orientation === 0 ? 180 : 0));
    }
    case 'cancel':
    case 'invalidate':
      return unchanged(EMPTY_DRAFT);
    case 'dragStart':
    case 'dropOutside':
    case 'dragCancel':
      return unchanged(d);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Validation against the latest view
// ---------------------------------------------------------------------------------------------------------

export type DraftIssue =
  | 'NO_CARD'
  | 'NO_TARGET'
  | 'WRONG_PHASE'
  | 'NOT_VIEWER_TURN'
  | 'CARD_NOT_IN_HAND'
  | 'TARGET_NOT_LEGAL'
  | 'ROTATION_NOT_MEANINGFUL';

export type DraftCheck =
  | { readonly ok: true; readonly place: { readonly card: CardId; readonly pos: GridPosition; readonly orientation: Orientation } }
  | { readonly ok: false; readonly issue: DraftIssue };

/**
 * A fast guard with early feedback; the engine `reduce` stays the final authority. Checks in this order: card and
 * target present; `view.phase === 'PLACEMENT'`; `view.turn === view.viewer`; the card is in `view.myHand`; the
 * target is in `legalCellsFor(view)`; orientation 180 only with rotation capability (and only 0 or 180 at all).
 */
export function validateDraft(d: PlacementDraft, view: PlayerView, rotation: RotationInfoMap): DraftCheck {
  const { card, target, orientation } = d;
  if (card === null) return { ok: false, issue: 'NO_CARD' };
  if (target === null) return { ok: false, issue: 'NO_TARGET' };
  if (view.phase !== 'PLACEMENT') return { ok: false, issue: 'WRONG_PHASE' };
  if (view.turn !== view.viewer) return { ok: false, issue: 'NOT_VIEWER_TURN' };
  if (!view.myHand.includes(card)) return { ok: false, issue: 'CARD_NOT_IN_HAND' };
  if (!legalCellsFor(view).some((cell) => cell.row === target.row && cell.col === target.col)) {
    return { ok: false, issue: 'TARGET_NOT_LEGAL' };
  }
  const turnable = rotation[card]?.rotationChangesCorners === true;
  if (orientation !== 0 && !(orientation === 180 && turnable)) return { ok: false, issue: 'ROTATION_NOT_MEANINGFUL' };
  return { ok: true, place: { card, pos: { row: target.row, col: target.col }, orientation } };
}

/**
 * The engine `ErrorCode` whose localized message explains an issue, where one exists. `TARGET_NOT_LEGAL` has none
 * here: its code (OUT_OF_BOUNDS, OCCUPIED, NOT_ADJACENT) comes from the engine through the controller's probe.
 * An empty draft and a refused rotation have no message.
 */
export function errorCodeForIssue(issue: DraftIssue): ErrorCode | null {
  switch (issue) {
    case 'WRONG_PHASE':
      return 'WRONG_PHASE';
    case 'NOT_VIEWER_TURN':
      return 'NOT_YOUR_TURN';
    case 'CARD_NOT_IN_HAND':
      return 'CARD_NOT_IN_HAND';
    case 'NO_CARD':
    case 'NO_TARGET':
    case 'TARGET_NOT_LEGAL':
    case 'ROTATION_NOT_MEANINGFUL':
      return null;
  }
}
