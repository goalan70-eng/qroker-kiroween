// Board component (task 17.2). Source: .kiro/specs/qroker-playable-game/design.md, "Accessibility and styling"
// (Board, touching cells), "Placement interaction" (Board and Hand DOM contract, keyboard path); requirements 13.1,
// 13.3, 13.9, 13.10 to 13.16 (placement draft, drop targets, preview ghost), 16.6 and 16.7 (keyboard, accessible
// names), 17.2.
//
// Two parts:
//   * `boardModel(view, draft, options)`: a PURE function from the viewer's `PlayerView`, the UI-only
//     `PlacementDraft` and the `dragActive` flag to 64 plain cell models in row-major order. It decides every flag,
//     class and accessible-name key, so the rules can be tested without a DOM.
//   * `renderBoard(h | doc, model, t, handlers, options)`: builds the DOM from the model with `h` (text through
//     `textContent`, never HTML) and wires the keyboard and click handlers.
//
// Where the facts come from (nothing else is consulted):
//   * occupancy, owner, orientation and the visible card of a cell: `view.board`. A card is shown only when the view
//     carries it (`CellView.card`); a hidden card has `card: null` and the model of that cell has no identity.
//   * legal cells: `legalCellsFor(view)` ONLY. Never recomputed from the DOM, from CSS or from hidden information.
//   * target and preview: the draft. The preview ghost shows `draft.card` only when that card is in `view.myHand`,
//     so the ghost can never show a card the viewer does not hold. Rendering the viewer's OWN card is allowed.
//   * code regions: the public Quad_Keys. A Quad_Key is the notation of the TOP-LEFT cell of a 2x2 region, so its
//     cells are that cell, the cell to its right, the cell below and the cell diagonally below. Pending regions are
//     `view.pendingQuadKeys` (GUESS_COLLECT); revealed regions are the codes of `view.lastReveal` while the phase is
//     REVEAL. Both use public keys only (no card identity, no Hidden_Sum).
//
// Notation (implemented locally; screen-class files may not import core/geometry): columns A to H left to right,
// rows 1 to 8 with row 1 at the TOP, so index 0 is A1, index 7 is H1 and index 56 is A8 (the same convention as
// `toNotation` of core/geometry).
//
// DOM and ARIA. The root is a frame `<div class="board-frame">` that holds the column labels (A to H) and the row
// labels (1 to 8), both `aria-hidden` because every cell name already starts with its notation, the visually hidden
// description element, and the grid:
//   <div role="grid" class="board" aria-label aria-describedby aria-rowcount="8" aria-colcount="8">
//     8 x <div role="row" class="board-row" aria-rowindex>
//           8 x <div role="gridcell" class="board-gridcell" aria-colindex aria-selected>
//                 <button type="button" class="board-cell ..." data-row data-col data-focus-key aria-label tabindex>
// A `<button>` inside a `gridcell` is the documented pattern for a grid of controls. `aria-selected` is on the
// gridcell (the ARIA attribute that grid cells support); `aria-pressed` is not used because activating the target
// again does not toggle it off. `aria-disabled` is not used either: an illegal cell stays focusable and explains
// itself through `explainTarget`. The cell button has `data-row` and `data-col` (digits 0 to 7), `data-focus-key`
// (`cell-<row>-<col>`, for `renderWithFocus`), the classes of its state and an accessible name. It has no rank, suit,
// CardId, fragment layout or `title`. The card face inside an occupied cell comes from `renderCardFace`.
//
// Keyboard (roving tabindex, one tab stop): ArrowUp, ArrowDown, ArrowLeft and ArrowRight move the focus one cell and
// stop at the edge (no wrap); Home and End go to the first and last cell of the row; Ctrl+Home and Ctrl+End go to A1
// and H8. Enter or Space (and a click) on a legal cell sends `draftEvent({ type: 'selectTarget', cell })`; on any
// other cell it calls `explainTarget(cell)`, which shows the localized reason (requirement 13.5). Escape sends
// `draftEvent({ type: 'cancel' })`. The component receives only `draftEvent` and `explainTarget`: it has no way to
// send a `PLACE` Action (the controller's `confirmPlacement` is the only path, and it is not passed in).
//
// Imports: ui/, i18n/, core/view and core/types only (screen-class module of boundaries.test.ts).

import type { CardId, GridPosition, Orientation, Owner, PlayerId } from '../../core/types';
import { legalCellsFor } from '../../core/view';
import type { PlayerView } from '../../core/view';
import type { StringKey } from '../../i18n';
import { createH } from '../dom';
import type { CreateDoc, HFunction } from '../dom';
import type { DraftEvent, DraftResult, PlacementDraft } from '../placement-draft';
import { cardFaceModel, cardFaceName, renderCardFace } from './card-face';
import type { Translate } from './card-face';

/** Cells per side. */
export const BOARD_CELLS_PER_SIDE = 8;
const CELL_COUNT = BOARD_CELLS_PER_SIDE * BOARD_CELLS_PER_SIDE;
const COLUMN_LETTERS = 'ABCDEFGH';
const QUAD_KEY = /^([A-H])([1-8])$/;

/** The notation of a cell: `{ row: 3, col: 3 }` is `'D4'`. Row 1 is the top row. */
export function cellNotation(row: number, col: number): string {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row > 7 || col > 7) {
    throw new RangeError('cellNotation: not a board cell');
  }
  return `${COLUMN_LETTERS[col]}${row + 1}`;
}

export type BoardCellState = 'EMPTY' | 'LEGAL' | 'TARGET' | 'PREVIEW' | 'OCCUPIED_UP' | 'OCCUPIED_DOWN';

export type BoardNameKey =
  | 'board.cell.name.empty'
  | 'board.cell.name.legal'
  | 'board.cell.name.target'
  | 'board.cell.name.preview'
  | 'board.cell.name.up'
  | 'board.cell.name.down';

export type BoardRegionKey = 'board.cell.name.pending' | 'board.cell.name.revealed';

/** The ghost of the drafted card, on the target cell only. The card is one of the viewer's OWN Hand cards. */
export interface BoardCellPreview {
  readonly card: CardId;
  readonly orientation: Orientation;
  /** The viewer: the owner the card will have once placed. */
  readonly owner: PlayerId;
}

export interface BoardCellModel {
  /** 0 to 7, from the top. */
  readonly row: number;
  /** 0 to 7, from the left. */
  readonly col: number;
  /** `row * 8 + col`. */
  readonly index: number;
  /** 'A1' to 'H8'. */
  readonly notation: string;
  /** `data-focus-key` of the cell button: `cell-<row>-<col>`. Never an identity. */
  readonly focusKey: string;
  readonly occupied: boolean;
  /** Public for an occupied cell, `null` for an empty one. */
  readonly owner: Owner | null;
  readonly orientation: Orientation | null;
  /** The identity the VIEW shows: `null` for an empty cell and for a hidden card. */
  readonly card: CardId | null;
  /** In `legalCellsFor(view)`. */
  readonly isLegal: boolean;
  /** The draft target (an empty cell). */
  readonly isTarget: boolean;
  /** The target cell while the draft also has a card: the ghost is drawn here. */
  readonly isPreview: boolean;
  /** A legal cell while a drag is active. */
  readonly isDropTarget: boolean;
  readonly inPendingRegion: boolean;
  readonly inRevealedRegion: boolean;
  readonly preview: BoardCellPreview | null;
  readonly state: BoardCellState;
  /** String key of the accessible name; its parameter `{notation}` is in `nameParams`. */
  readonly nameKey: BoardNameKey;
  readonly nameParams: Readonly<{ notation: string }>;
  /** String key of the region phrase added to the name, or `null`. */
  readonly regionKey: BoardRegionKey | null;
  /** The class attribute of the cell button: state classes only, no identity. */
  readonly className: string;
}

export interface BoardModel {
  readonly viewer: PlayerId;
  /** 64 cells, row-major (`index = row * 8 + col`). */
  readonly cells: readonly BoardCellModel[];
  readonly dragActive: boolean;
  readonly target: GridPosition | null;
}

export interface BoardModelOptions {
  /** A drag of an own-Hand card is in progress: legal cells become drop targets. Default `false`. */
  readonly dragActive?: boolean;
}

interface ClassFlags {
  readonly occupied: boolean;
  readonly isLegal: boolean;
  readonly isTarget: boolean;
  readonly isPreview: boolean;
  readonly inPendingRegion: boolean;
  readonly inRevealedRegion: boolean;
}

/**
 * The class attribute of a cell button. State classes only (the design's BEM names and the `is-` names that
 * board.css styles). `drop` adds the drop-target classes; pass `false` for a board with no drag.
 */
export function cellClassName(cell: ClassFlags, drop: boolean): string {
  const classes = ['board-cell'];
  if (cell.occupied) classes.push('board-cell--occupied');
  if (cell.isLegal) classes.push('board-cell--legal', 'is-legal');
  if (cell.isTarget) classes.push('board-cell--target', 'is-target');
  if (cell.isPreview) classes.push('has-preview');
  if (drop) classes.push('board-cell--drop-ok', 'is-drop-target');
  if (cell.inPendingRegion) classes.push('is-pending-region');
  if (cell.inRevealedRegion) classes.push('is-revealed-region');
  return classes.join(' ');
}

/** Cell indexes of the 2x2 region whose top-left cell is the public Quad_Key `key`; empty for a malformed key. */
function regionIndexes(key: string): number[] {
  const m = QUAD_KEY.exec(key);
  if (m === null) return [];
  const col = COLUMN_LETTERS.indexOf(m[1] as string);
  const row = Number(m[2]) - 1;
  if (col > 6 || row > 6) return []; // the region would leave the board
  const i = row * BOARD_CELLS_PER_SIDE + col;
  return [i, i + 1, i + BOARD_CELLS_PER_SIDE, i + BOARD_CELLS_PER_SIDE + 1];
}

function regionSet(keys: readonly string[]): ReadonlySet<number> {
  const out = new Set<number>();
  for (const key of keys) for (const i of regionIndexes(key)) out.add(i);
  return out;
}

/**
 * The model of the Board for one view and one draft. Pure and deterministic; the inputs are not changed.
 *
 * @throws RangeError when `view.board` does not have exactly 64 entries.
 */
export function boardModel(view: PlayerView, draft: PlacementDraft, options: BoardModelOptions = {}): BoardModel {
  if (view.board.length !== CELL_COUNT) throw new RangeError('boardModel: the view board must have 64 cells');
  const dragActive = options.dragActive === true;
  const legal = new Set<number>(legalCellsFor(view).map((p) => p.row * BOARD_CELLS_PER_SIDE + p.col));
  const pending = regionSet(view.pendingQuadKeys);
  const revealed = regionSet(
    view.phase === 'REVEAL' && view.lastReveal !== null ? view.lastReveal.codes.map((c) => c.quadKey) : [],
  );
  const target = draft.target;
  const targetIndex = target === null ? -1 : target.row * BOARD_CELLS_PER_SIDE + target.col;
  // The ghost shows the drafted card only when it is a card of the viewer's own Hand.
  const ghostCard = draft.card !== null && view.myHand.includes(draft.card) ? draft.card : null;

  const cells: BoardCellModel[] = [];
  for (let index = 0; index < CELL_COUNT; index++) {
    const row = Math.floor(index / BOARD_CELLS_PER_SIDE);
    const col = index % BOARD_CELLS_PER_SIDE;
    const notation = cellNotation(row, col);
    const source = view.board[index] ?? null;
    const occupied = source !== null;
    const isLegal = legal.has(index);
    const isTarget = !occupied && index === targetIndex;
    const isPreview = isTarget && ghostCard !== null;
    const inPendingRegion = pending.has(index);
    const inRevealedRegion = revealed.has(index);
    const card = source === null ? null : source.card;

    let state: BoardCellState;
    let nameKey: BoardNameKey;
    if (source !== null) {
      state = card === null ? 'OCCUPIED_DOWN' : 'OCCUPIED_UP';
      nameKey = card === null ? 'board.cell.name.down' : 'board.cell.name.up';
    } else if (isPreview) {
      state = 'PREVIEW';
      nameKey = 'board.cell.name.preview';
    } else if (isTarget) {
      state = 'TARGET';
      nameKey = 'board.cell.name.target';
    } else if (isLegal) {
      state = 'LEGAL';
      nameKey = 'board.cell.name.legal';
    } else {
      state = 'EMPTY';
      nameKey = 'board.cell.name.empty';
    }

    const flags: ClassFlags = { occupied, isLegal, isTarget, isPreview, inPendingRegion, inRevealedRegion };
    const isDropTarget = dragActive && isLegal;
    cells.push({
      row,
      col,
      index,
      notation,
      focusKey: `cell-${row}-${col}`,
      occupied,
      owner: source === null ? null : source.owner,
      orientation: source === null ? null : source.orientation,
      card,
      isLegal,
      isTarget,
      isPreview,
      isDropTarget,
      inPendingRegion,
      inRevealedRegion,
      preview: isPreview && ghostCard !== null ? { card: ghostCard, orientation: draft.orientation, owner: view.viewer } : null,
      state,
      nameKey,
      nameParams: { notation },
      regionKey: inPendingRegion ? 'board.cell.name.pending' : inRevealedRegion ? 'board.cell.name.revealed' : null,
      className: cellClassName(flags, isDropTarget),
    });
  }
  return { viewer: view.viewer, cells, dragActive, target: target === null ? null : { row: target.row, col: target.col } };
}

/** The owner's name in the current language: 'Player n' for a Seat, 'Neutral' for a Neutral_Card. */
export function defaultOwnerLabel(t: Translate): (owner: Owner) => string {
  return (owner) => (owner === 'NEUTRAL' ? t('cards.owner.NEUTRAL') : t('common.seat.player', { n: Number(owner.slice(1)) + 1 }));
}

/**
 * Owner labels for a viewer's own Board: the viewer's cards say 'You' (`common.seat.human`, the wording of the Hand and
 * the drag ghost), every other owner uses `defaultOwnerLabel`. Keeps the preview of the draft, the Hand and the placed
 * cards of the viewer consistent (task 19.4, known defect "Player 1" versus "You"). Public names only.
 */
export function viewerOwnerLabel(viewer: PlayerId, t: Translate): (owner: Owner) => string {
  const other = defaultOwnerLabel(t);
  return (owner) => (owner === viewer ? t('common.seat.human') : other(owner));
}

/**
 * The localized accessible name of a cell: its notation and state, the card face name for an occupied cell (owner
 * and orientation, and rank and suit only when the view shows the card) or for the preview (the viewer's own
 * card), and the code-region phrase.
 */
export function cellName(cell: BoardCellModel, t: Translate, ownerLabel: (owner: Owner) => string = defaultOwnerLabel(t)): string {
  const params: Record<string, string> = { notation: cell.nameParams.notation };
  if (cell.owner !== null && cell.orientation !== null) {
    params.card = cardFaceName(
      cardFaceModel({ card: cell.card, owner: cell.owner, orientation: cell.orientation, ownerLabel: ownerLabel(cell.owner) }),
      t,
    );
  } else if (cell.preview !== null) {
    params.card = cardFaceName(
      cardFaceModel({
        card: cell.preview.card,
        owner: cell.preview.owner,
        orientation: cell.preview.orientation,
        ownerLabel: ownerLabel(cell.preview.owner),
      }),
      t,
    );
  }
  const name = t(cell.nameKey, params);
  return cell.regionKey === null ? name : t(cell.regionKey, { name });
}

// ---------------------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------------------

/** The only functions the Board may call. The controller's `RenderHandlers` satisfies this; it has no `PLACE` path. */
export interface BoardHandlers {
  /** Applies a draft event. The Board sends `selectTarget` and `cancel` only. */
  readonly draftEvent: (event: DraftEvent) => DraftResult | void;
  /** Shows the localized reason why `cell` cannot take a card. */
  readonly explainTarget: (cell: GridPosition) => unknown;
}

export interface BoardRenderOptions {
  /** The owner's name for card names. Default: 'Player n' / 'Neutral' in the current language. */
  readonly ownerLabel?: (owner: Owner) => string;
  /** The cell that is the tab stop (tabindex 0). Default: the target, else the first legal cell, else A1. */
  readonly tabStop?: GridPosition | null;
  /** Overrides `model.dragActive`: legal cells carry the drop-target classes while true. */
  readonly dragActive?: boolean;
  /** Prefix of the id of the description element. Default `board`. */
  readonly idPrefix?: string;
}

const clampIndex = (n: number): number => Math.max(0, Math.min(BOARD_CELLS_PER_SIDE - 1, n));

/**
 * Builds the Board element from `model`. `target` is an `h` function or a document. Returns the frame element that
 * holds the labels and the grid; the grid is its child with `role="grid"`.
 */
export function renderBoard(
  target: HFunction | CreateDoc,
  model: BoardModel,
  t: Translate,
  handlers: BoardHandlers,
  options: BoardRenderOptions = {},
): HTMLElement {
  const h: HFunction = typeof target === 'function' ? target : createH(target);
  const ownerLabel = options.ownerLabel ?? defaultOwnerLabel(t);
  const drag = options.dragActive ?? model.dragActive;
  const hintId = `${options.idPrefix ?? 'board'}-hint`;
  const buttons: HTMLElement[] = [];

  const firstLegal = model.cells.find((c) => c.isLegal);
  const tabCell =
    options.tabStop !== undefined && options.tabStop !== null
      ? options.tabStop.row * BOARD_CELLS_PER_SIDE + options.tabStop.col
      : model.target !== null
        ? model.target.row * BOARD_CELLS_PER_SIDE + model.target.col
        : firstLegal !== undefined
          ? firstLegal.index
          : 0;
  let tabIndex = tabCell >= 0 && tabCell < CELL_COUNT ? tabCell : 0;

  const setTabStop = (index: number): void => {
    if (index === tabIndex) return;
    (buttons[tabIndex] as HTMLElement).setAttribute('tabindex', '-1');
    (buttons[index] as HTMLElement).setAttribute('tabindex', '0');
    tabIndex = index;
  };
  const moveFocus = (row: number, col: number): void => {
    const index = clampIndex(row) * BOARD_CELLS_PER_SIDE + clampIndex(col);
    setTabStop(index);
    (buttons[index] as HTMLElement).focus();
  };
  const activate = (cell: BoardCellModel): void => {
    const position: GridPosition = { row: cell.row, col: cell.col };
    if (cell.isLegal) {
      const result = handlers.draftEvent({ type: 'selectTarget', cell: position });
      // The controller judges with the latest view; a refusal there still gets the localized reason.
      if (result !== undefined && result !== null && result.notice === 'TARGET_NOT_LEGAL') handlers.explainTarget(position);
    } else {
      handlers.explainTarget(position);
    }
  };
  const onKeyDown = (cell: BoardCellModel) => (event: Event) => {
    const e = event as KeyboardEvent;
    if (e.isComposing === true || e.altKey === true || e.metaKey === true) return;
    const key = e.key;
    if (e.ctrlKey === true && key !== 'Home' && key !== 'End') return;
    switch (key) {
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(cell.row - 1, cell.col);
        return;
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(cell.row + 1, cell.col);
        return;
      case 'ArrowLeft':
        e.preventDefault();
        moveFocus(cell.row, cell.col - 1);
        return;
      case 'ArrowRight':
        e.preventDefault();
        moveFocus(cell.row, cell.col + 1);
        return;
      case 'Home':
        e.preventDefault();
        moveFocus(e.ctrlKey === true ? 0 : cell.row, 0);
        return;
      case 'End':
        e.preventDefault();
        moveFocus(e.ctrlKey === true ? BOARD_CELLS_PER_SIDE - 1 : cell.row, BOARD_CELLS_PER_SIDE - 1);
        return;
      case 'Enter':
      case ' ':
      case 'Spacebar':
        e.preventDefault(); // no second, native click for the same key press
        if (e.repeat !== true) activate(cell);
        return;
      case 'Escape':
        handlers.draftEvent({ type: 'cancel' });
        return;
      default:
        return;
    }
  };
  // Space clicks a button on key release in some browsers; the keydown already handled it.
  const onKeyUp = (event: Event): void => {
    const key = (event as KeyboardEvent).key;
    if (key === ' ' || key === 'Spacebar') event.preventDefault();
  };

  const rows: HTMLElement[] = [];
  for (let row = 0; row < BOARD_CELLS_PER_SIDE; row++) {
    const gridcells: HTMLElement[] = [];
    for (let col = 0; col < BOARD_CELLS_PER_SIDE; col++) {
      const cell = model.cells[row * BOARD_CELLS_PER_SIDE + col] as BoardCellModel;
      const drop = drag && cell.isLegal;
      let face: HTMLElement | null = null;
      if (cell.owner !== null && cell.orientation !== null) {
        face = renderCardFace(
          h,
          cardFaceModel({ card: cell.card, owner: cell.owner, orientation: cell.orientation, size: 'cell', ownerLabel: ownerLabel(cell.owner) }),
          t,
        );
      } else if (cell.preview !== null) {
        face = h(
          'span',
          { class: 'board-ghost is-preview', aria: { hidden: 'true' } },
          renderCardFace(
            h,
            cardFaceModel({
              card: cell.preview.card,
              owner: cell.preview.owner,
              orientation: cell.preview.orientation,
              size: 'preview',
              ownerLabel: ownerLabel(cell.preview.owner),
            }),
            t,
          ),
        );
      }
      const button = h(
        'button',
        {
          class: drop === cell.isDropTarget ? cell.className : cellClassName(cell, drop),
          focusKey: cell.focusKey,
          attrs: {
            type: 'button',
            'data-row': cell.row,
            'data-col': cell.col,
            tabindex: cell.index === tabIndex ? 0 : -1,
          },
          aria: { label: cellName(cell, t, ownerLabel) },
          on: {
            keydown: onKeyDown(cell),
            keyup: onKeyUp,
            focus: () => setTabStop(cell.index),
            click: () => {
              setTabStop(cell.index);
              activate(cell);
            },
          },
        },
        face,
      );
      buttons.push(button);
      gridcells.push(
        h(
          'div',
          {
            class: 'board-gridcell',
            attrs: { role: 'gridcell' },
            aria: { colindex: col + 1, selected: cell.isTarget ? 'true' : 'false' },
          },
          button,
        ),
      );
    }
    rows.push(h('div', { class: 'board-row', attrs: { role: 'row' }, aria: { rowindex: row + 1 } }, ...gridcells));
  }

  const grid = h(
    'div',
    {
      class: 'board',
      attrs: { role: 'grid' },
      aria: { label: t('board.grid.label'), describedby: hintId, rowcount: BOARD_CELLS_PER_SIDE, colcount: BOARD_CELLS_PER_SIDE },
    },
    ...rows,
  );
  const columnLabels = h(
    'div',
    { class: 'board-col-labels', aria: { hidden: 'true' } },
    ...[...COLUMN_LETTERS].map((letter) => h('span', { class: 'board-label' }, letter)),
  );
  const rowLabels = h(
    'div',
    { class: 'board-row-labels', aria: { hidden: 'true' } },
    ...Array.from({ length: BOARD_CELLS_PER_SIDE }, (_, i) => h('span', { class: 'board-label' }, String(i + 1))),
  );
  const hint = h('span', { class: 'board-hint', id: hintId }, t('board.hint'));
  return h('div', { class: 'board-frame' }, columnLabels, rowLabels, grid, hint);
}

/** Every key this module passes to `t` (the completeness test of i18n covers the tables; this lists the use). */
export const BOARD_STRING_KEYS: readonly StringKey[] = [
  'board.grid.label',
  'board.hint',
  'board.cell.name.empty',
  'board.cell.name.legal',
  'board.cell.name.target',
  'board.cell.name.preview',
  'board.cell.name.up',
  'board.cell.name.down',
  'board.cell.name.pending',
  'board.cell.name.revealed',
];
