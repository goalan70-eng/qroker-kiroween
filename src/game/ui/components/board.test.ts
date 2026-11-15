// Tests of the Board component (task 17.2). They run in Node WITHOUT a DOM library (happy-dom arrives with task
// 21.1): the model tests are pure functions over real `PlayerView`s (newGame + reduce), and the render tests use a
// minimal hand-written fake Document with synthetic events. They are unit tests against a stand-in, NOT browser tests:
// real layout, focus behaviour, hit testing and touch are not exercised. The CSS tests read the style sources.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../../core/cards';
import { reduce } from '../../core/engine';
import { defaultConfig, newGame } from '../../core/state';
import type { GameState } from '../../core/state';
import { advanceUntil } from '../../core/testing/state-generators';
import type { PlayStyle } from '../../core/testing/state-generators';
import { SEATS } from '../../core/turn';
import type { Action, CardId, GridPosition, IdentityVisibility, Orientation, Owner, PlayerId } from '../../core/types';
import { legalCellsFor, viewFor } from '../../core/view';
import type { CellView, PlayerView } from '../../core/view';
import { resetLanguage, setLanguage, t } from '../../i18n';
import type { Lang, StringKey } from '../../i18n';
import { EMPTY_DRAFT } from '../placement-draft';
import type { DraftEvent, DraftResult, PlacementDraft } from '../placement-draft';
import { cellFromPoint } from '../pointer-gesture';
import { BOARD_STRING_KEYS, boardModel, cellClassName, cellName, cellNotation, renderBoard } from './board';
import type { BoardCellModel, BoardHandlers, BoardModel, BoardRenderOptions } from './board';

afterEach(() => resetLanguage());

// ---------------------------------------------------------------------------------------------------------
// Independent tables and helpers (literals, not read from the implementation)
// ---------------------------------------------------------------------------------------------------------

const idx = (row: number, col: number): number => row * 8 + col;
/** 'A1' for index 0, 'H1' for 7, 'A8' for 56: column letter from the column, row number from the row, row 1 on top. */
const notationOfIndex = (i: number): string => `${String.fromCharCode(65 + (i % 8))}${Math.floor(i / 8) + 1}`;
const posOf = (notation: string): GridPosition => ({ row: Number(notation[1]) - 1, col: (notation.charCodeAt(0) - 65) });
const indexOfNotation = (notation: string): number => idx(posOf(notation).row, posOf(notation).col);

const SUIT_WORD_EN = { H: 'Hearts', D: 'Diamonds', C: 'Clubs', S: 'Spades' } as const;
const FACE_WORD_EN = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' } as const;
const HANGUL = /[\uAC00-\uD7A3]/;
const CARD_ID_TOKEN = /\b[HDCS]-(?:10|[2-9AJQK])\b/;
const INITIAL_LEGAL = ['C4', 'C5', 'F4', 'F5', 'D3', 'E3', 'D6', 'E6'];

function expectedFaceEn(card: CardId | null, orientation: Orientation, ownerWord: string): string {
  const orient = orientation === 180 ? 'rotated 180°' : 'upright (0°)';
  if (card === null) return `Face-down card, ${orient}, owner: ${ownerWord}`;
  const [suit, rank] = card.split('-') as [keyof typeof SUIT_WORD_EN, string];
  const rankWord = rank in FACE_WORD_EN ? FACE_WORD_EN[rank as keyof typeof FACE_WORD_EN] : rank;
  return `${rankWord} of ${SUIT_WORD_EN[suit]}, ${orient}, owner: ${ownerWord}`;
}

const CHOICES = [7, 13, 3, 99, 5, 1, 42, 8, 21, 64, 2, 17];
const CODE_STYLE: PlayStyle = { codeBias: 100, submitOrder: 'SEAT_ORDER' };

function start(seed: number, visibility: IdentityVisibility = 'OWNER_ONLY'): GameState {
  const created = newGame({ seed, config: { ...defaultConfig(), identityVisibility: visibility } });
  if (!created.ok) throw new Error(`newGame failed: ${created.error.code}`);
  return created.value;
}

function apply(state: GameState, action: Action): GameState {
  const result = reduce(state, action);
  if (!result.ok) throw new Error(`reduce rejected ${JSON.stringify(action)}: ${result.error.code}`);
  return result.value;
}

/** A game in GUESS_COLLECT (first seed from 1 on that forms a code). */
function batchState(visibility: IdentityVisibility = 'OWNER_ONLY'): GameState {
  for (let seed = 1; seed <= 60; seed++) {
    const run = advanceUntil(start(seed, visibility), (s) => s.phase === 'GUESS_COLLECT', CHOICES, CODE_STYLE);
    if (run.state.phase === 'GUESS_COLLECT') return run.state;
  }
  throw new Error('no seed in 1..60 reached GUESS_COLLECT');
}

/** The same batch, every seat submitted: phase REVEAL. */
function revealState(visibility: IdentityVisibility = 'OWNER_ONLY'): GameState {
  let state = batchState(visibility);
  for (const seat of SEATS) {
    const guesses: Record<string, number> = {};
    (state.pending?.codes ?? []).forEach((code, i) => {
      guesses[code.quadKey] = 14 + 10 * SEATS.indexOf(seat) + i;
    });
    state = apply(state, { type: 'SUBMIT_GUESSES', player: seat, guesses });
  }
  return state;
}

/** A mid-game state with at least 10 placed cards (so other seats' cards are on the Board). */
function midGame(visibility: IdentityVisibility = 'OWNER_ONLY'): GameState {
  const run = advanceUntil(start(3, visibility), (s) => s.board.filter((c) => c !== null).length >= 10 && s.phase === 'PLACEMENT', CHOICES);
  return run.state;
}

const asView = (state: GameState, viewer: PlayerId = 'P0'): PlayerView => viewFor(state, viewer);
const model = (view: PlayerView, draft: PlacementDraft = EMPTY_DRAFT, dragActive = false): BoardModel =>
  boardModel(view, draft, { dragActive });
const cellOf = (m: BoardModel, notation: string): BoardCellModel => m.cells[indexOfNotation(notation)] as BoardCellModel;
const notationsWhere = (m: BoardModel, pick: (c: BoardModel['cells'][number]) => boolean): string[] =>
  m.cells.filter(pick).map((c) => c.notation);

/** The view of `base` with a hand-made board (a plain-data copy; views are plain data). */
function withBoard(base: PlayerView, occupied: readonly string[]): PlayerView {
  const board: (CellView | null)[] = new Array<CellView | null>(64).fill(null);
  for (const n of occupied) board[indexOfNotation(n)] = { owner: 'P1', orientation: 0, card: null };
  return { ...base, board };
}

/** The quad-key region cells by an independent computation. */
function regionCells(keys: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const key of keys) {
    const { row, col } = posOf(key);
    for (const [dr, dc] of [[0, 0], [0, 1], [1, 0], [1, 1]] as const) out.add(notationOfIndex(idx(row + dr, col + dc)));
  }
  return out;
}

const INITIAL = asView(start(1), 'P0');

// ---------------------------------------------------------------------------------------------------------
// boardModel
// ---------------------------------------------------------------------------------------------------------

describe('boardModel: shape and notation', () => {
  it('has 64 cells in row-major order with exact notation for every cell, row 1 at the top', () => {
    const m = model(INITIAL);
    expect(m.cells).toHaveLength(64);
    m.cells.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.row).toBe(Math.floor(i / 8));
      expect(c.col).toBe(i % 8);
      expect(c.notation, `index ${i}`).toBe(notationOfIndex(i));
      expect(c.focusKey).toBe(`cell-${c.row}-${c.col}`);
      expect(c.nameParams).toEqual({ notation: c.notation });
    });
    expect(m.cells[0]?.notation).toBe('A1');
    expect(m.cells[7]?.notation).toBe('H1');
    expect(m.cells[56]?.notation).toBe('A8');
    expect(m.cells[63]?.notation).toBe('H8');
    expect(new Set(m.cells.map((c) => c.notation)).size).toBe(64);
    expect(cellNotation(3, 3)).toBe('D4');
    expect(() => cellNotation(8, 0)).toThrow(RangeError);
  });

  it('is deterministic and JSON-serializable, and does not change its inputs', () => {
    const a = model(INITIAL, EMPTY_DRAFT, true);
    const b = model(INITIAL, EMPTY_DRAFT, true);
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('rejects a view with a board that does not have 64 cells', () => {
    expect(() => boardModel({ ...INITIAL, board: INITIAL.board.slice(0, 63) }, EMPTY_DRAFT)).toThrow(RangeError);
  });
});

describe('boardModel: legal cells come from legalCellsFor(view)', () => {
  it('marks exactly the eight cells around the neutral cards in the initial game', () => {
    const m = model(INITIAL);
    expect(notationsWhere(m, (c) => c.isLegal).sort()).toEqual([...INITIAL_LEGAL].sort());
    expect(notationsWhere(m, (c) => c.occupied).sort()).toEqual(['D4', 'D5', 'E4', 'E5']);
    expect(m.cells.filter((c) => c.isLegal).map((c) => ({ row: c.row, col: c.col }))).toEqual(legalCellsFor(INITIAL));
  });

  it('marks nothing for a viewer who is not on turn, nor in another phase', () => {
    const s = start(1);
    for (const viewer of ['P1', 'P2', 'P3'] as const) {
      expect(legalCellsFor(asView(s, viewer))).toEqual([]);
      expect(model(asView(s, viewer)).cells.some((c) => c.isLegal)).toBe(false);
    }
    for (const state of [batchState(), revealState()]) {
      for (const viewer of SEATS) {
        expect(model(asView(state, viewer)).cells.some((c) => c.isLegal), `${state.phase} ${viewer}`).toBe(false);
      }
    }
  });

  it('equals legalCellsFor on real mid-game views of every seat', () => {
    const state = midGame();
    for (const viewer of SEATS) {
      const view = asView(state, viewer);
      const m = model(view);
      expect(m.cells.filter((c) => c.isLegal).map((c) => ({ row: c.row, col: c.col }))).toEqual(legalCellsFor(view));
      expect(m.cells.every((c) => !(c.isLegal && c.occupied))).toBe(true);
    }
  });

  it('does not mark a diagonal-only or isolated cell, and marks a multi-edge cell once', () => {
    const lone = model(withBoard(INITIAL, ['D4']));
    expect(notationsWhere(lone, (c) => c.isLegal).sort()).toEqual(['C4', 'D3', 'D5', 'E4']);
    expect(lone.cells[indexOfNotation('C3')]?.isLegal).toBe(false); // diagonal only
    expect(lone.cells[indexOfNotation('E5')]?.isLegal).toBe(false);
    expect(lone.cells[indexOfNotation('H8')]?.isLegal).toBe(false); // isolated
    const gap = model(withBoard(INITIAL, ['D4', 'F4']));
    expect(gap.cells[indexOfNotation('E4')]?.isLegal).toBe(true); // two occupied neighbours
    expect(gap.cells.filter((c) => c.notation === 'E4')).toHaveLength(1);
    const corner = model(withBoard(INITIAL, ['A1']));
    expect(notationsWhere(corner, (c) => c.isLegal).sort()).toEqual(['A2', 'B1']);
  });
});

describe('boardModel: target, preview and drop targets', () => {
  const hand = INITIAL.myHand;
  const c4 = { row: 3, col: 2 };

  it('flags the target cell only, and the preview only when the draft also has a card of the viewer', () => {
    const targetOnly = model(INITIAL, { target: c4, card: null, orientation: 0 });
    expect(notationsWhere(targetOnly, (c) => c.isTarget)).toEqual(['C4']);
    expect(targetOnly.cells.some((c) => c.isPreview || c.preview !== null)).toBe(false);
    expect(targetOnly.cells[indexOfNotation('C4')]?.state).toBe('TARGET');
    expect(targetOnly.cells[indexOfNotation('C4')]?.isLegal).toBe(true);
    expect(targetOnly.target).toEqual(c4);

    const card = hand[0] as CardId;
    const both = model(INITIAL, { target: c4, card, orientation: 180 });
    expect(notationsWhere(both, (c) => c.isPreview)).toEqual(['C4']);
    expect(both.cells[indexOfNotation('C4')]?.preview).toEqual({ card, orientation: 180, owner: 'P0' });
    expect(both.cells[indexOfNotation('C4')]?.state).toBe('PREVIEW');
    expect(both.cells.filter((c) => c.preview !== null)).toHaveLength(1);

    const cardOnly = model(INITIAL, { target: null, card, orientation: 0 });
    expect(cardOnly.cells.some((c) => c.isTarget || c.isPreview)).toBe(false);
  });

  it('never previews a card that is not in the viewer Hand, and never targets an occupied cell', () => {
    const foreign = ALL_CARDS.find((c) => !hand.includes(c)) as CardId;
    const m = model(INITIAL, { target: c4, card: foreign, orientation: 0 });
    expect(m.cells.some((c) => c.preview !== null || c.isPreview)).toBe(false);
    expect(JSON.stringify(m)).not.toContain(foreign);
    const occupied = model(INITIAL, { target: { row: 3, col: 3 }, card: hand[0] as CardId, orientation: 0 });
    expect(occupied.cells.some((c) => c.isTarget || c.isPreview)).toBe(false);
  });

  it('adds the drop-target flag and classes to legal cells only while a drag is active', () => {
    const off = model(INITIAL, EMPTY_DRAFT, false);
    expect(off.cells.some((c) => c.isDropTarget || c.className.includes('drop'))).toBe(false);
    const on = model(INITIAL, EMPTY_DRAFT, true);
    expect(notationsWhere(on, (c) => c.isDropTarget).sort()).toEqual([...INITIAL_LEGAL].sort());
    for (const c of on.cells) {
      expect(c.className.split(' ').includes('is-drop-target')).toBe(c.isLegal);
      expect(c.className.split(' ').includes('is-legal')).toBe(c.isLegal);
    }
    // not on turn: a drag marks nothing
    expect(model(asView(start(1), 'P1'), EMPTY_DRAFT, true).cells.some((c) => c.isDropTarget)).toBe(false);
  });

  it('builds state classes from flags only', () => {
    const flags = { occupied: false, isLegal: true, isTarget: true, isPreview: true, inPendingRegion: false, inRevealedRegion: false };
    expect(cellClassName(flags, true).split(' ')).toEqual(
      ['board-cell', 'board-cell--legal', 'is-legal', 'board-cell--target', 'is-target', 'has-preview', 'board-cell--drop-ok', 'is-drop-target'],
    );
    expect(cellClassName({ ...flags, occupied: true, isLegal: false, isTarget: false, isPreview: false, inPendingRegion: true }, false)).toBe(
      'board-cell board-cell--occupied is-pending-region',
    );
  });
});

describe('boardModel: code regions', () => {
  it('marks the 2x2 regions of one and of two pending Quad_Keys from the top-left cell', () => {
    const state = batchState();
    const view = asView(state);
    expect(view.pendingQuadKeys.length).toBeGreaterThanOrEqual(1);
    const m = model(view);
    expect(new Set(notationsWhere(m, (c) => c.inPendingRegion))).toEqual(regionCells(view.pendingQuadKeys));
    expect(m.cells.some((c) => c.inRevealedRegion)).toBe(false);
    for (const c of m.cells) expect(c.className.includes('is-pending-region')).toBe(c.inPendingRegion);
  });

  it('marks one key and two keys (hand-made public keys on a real view), including the board corner', () => {
    const base = asView(batchState());
    const one = model({ ...base, pendingQuadKeys: ['D4'] });
    expect(notationsWhere(one, (c) => c.inPendingRegion).sort()).toEqual(['D4', 'D5', 'E4', 'E5']);
    const two = model({ ...base, pendingQuadKeys: ['F3', 'G4'] });
    expect(new Set(notationsWhere(two, (c) => c.inPendingRegion))).toEqual(regionCells(['F3', 'G4']));
    expect(notationsWhere(two, (c) => c.inPendingRegion)).toHaveLength(7); // F3 G3 F4 G4 + G4 H4 G5 H5, G4 shared
    const corner = model({ ...base, pendingQuadKeys: ['G7'] });
    expect(notationsWhere(corner, (c) => c.inPendingRegion).sort()).toEqual(['G7', 'G8', 'H7', 'H8']);
    // a key that would leave the board, or is not a key, marks nothing
    const bad = model({ ...base, pendingQuadKeys: ['H8', 'A9', 'x'] });
    expect(bad.cells.some((c) => c.inPendingRegion)).toBe(false);
  });

  it('marks the revealed regions of lastReveal during REVEAL only', () => {
    const state = revealState();
    expect(state.phase).toBe('REVEAL');
    const view = asView(state);
    const keys = (view.lastReveal?.codes ?? []).map((c) => c.quadKey);
    expect(keys.length).toBeGreaterThanOrEqual(1);
    const m = model(view);
    expect(new Set(notationsWhere(m, (c) => c.inRevealedRegion))).toEqual(regionCells(keys));
    expect(m.cells.some((c) => c.inPendingRegion)).toBe(false);
    for (const c of m.cells) expect(c.className.includes('is-revealed-region')).toBe(c.inRevealedRegion);
    // in a later PLACEMENT phase nothing is marked
    const placement = asView(apply(state, { type: 'ACK_REVEAL' }));
    if (placement.phase === 'PLACEMENT') expect(model(placement).cells.some((c) => c.inRevealedRegion)).toBe(false);
  });
});

describe('boardModel: names and hidden identity', () => {
  it('names every state with the exact English text (and the Korean text in Korean)', () => {
    const view = INITIAL;
    const c4 = { row: 3, col: 2 };
    const card = view.myHand.find((c) => c.endsWith('-7')) ?? (view.myHand[0] as CardId);
    const m0 = model(view);
    setLanguage('en');
    expect(cellName(cellOf(m0, 'A1'), t)).toBe('A1, empty');
    expect(cellName(cellOf(m0, 'C4'), t)).toBe('C4, empty, legal placement');
    const neutral = view.board[indexOfNotation('D4')] as CellView;
    expect(neutral.card).not.toBeNull();
    expect(cellName(cellOf(m0, 'D4'), t)).toBe(`D4, occupied, ${expectedFaceEn(neutral.card, neutral.orientation, 'Neutral')}`);
    const mt = model(view, { target: c4, card: null, orientation: 0 });
    expect(cellName(cellOf(mt, 'C4'), t)).toBe('C4, empty, selected target');
    const mp = model(view, { target: c4, card, orientation: 180 });
    expect(cellName(cellOf(mp, 'C4'), t)).toBe(`C4, selected target, preview: ${expectedFaceEn(card, 180, 'Player 1')}`);
    setLanguage('ko');
    expect(cellName(cellOf(m0, 'C4'), t)).toBe('C4, 빈 칸, 놓을 수 있는 칸');
    expect(cellName(cellOf(mt, 'C4'), t)).toBe('C4, 빈 칸, 선택된 목표 칸');
  });

  it('adds the code-region phrase to the name', () => {
    const base = asView(batchState());
    const m = model({ ...base, pendingQuadKeys: ['D4'] });
    setLanguage('en');
    expect(cellName(cellOf(m, 'D4'), t)).toMatch(/^D4, .*, part of a code awaiting guesses$/);
  });

  it('gives a hidden card no identity: the name has only notation, owner and orientation', () => {
    const state = midGame();
    const view = asView(state, 'P0');
    const m = model(view);
    const hidden = m.cells.filter((c) => c.occupied && c.card === null);
    expect(hidden.length).toBeGreaterThan(0);
    setLanguage('en');
    for (const c of hidden) {
      const source = view.board[c.index] as CellView;
      const ownerWord = source.owner === 'NEUTRAL' ? 'Neutral' : `Player ${Number(source.owner.slice(1)) + 1}`;
      expect(cellName(c, t), c.notation).toBe(`${c.notation}, occupied, ${expectedFaceEn(null, source.orientation, ownerWord)}`);
      expect(c.nameKey).toBe('board.cell.name.down');
      expect(c.state).toBe('OCCUPIED_DOWN');
      expect(JSON.stringify(c)).not.toMatch(CARD_ID_TOKEN);
      expect(Object.keys(c).sort()).not.toContain('rank');
    }
  });

  it('keeps every hidden CardId (as the engine state knows them) out of the model JSON and the names', () => {
    for (const visibility of ['OWNER_ONLY', 'FACE_UP'] as const) {
      const state = midGame(visibility);
      for (const viewer of SEATS) {
        const view = asView(state, viewer);
        const shown = new Set<CardId>(view.myHand);
        for (const cell of view.board) if (cell !== null && cell.card !== null) shown.add(cell.card);
        const hiddenIds = ALL_CARDS.filter((c) => !shown.has(c));
        // test-side truth: the cards of other seats, the deck and the hidden board cards
        const truth = new Set<CardId>(state.deck);
        for (const seat of SEATS) if (seat !== viewer) for (const c of state.hands[seat]) truth.add(c);
        state.board.forEach((cell, i) => {
          if (cell !== null && (view.board[i] as CellView).card === null) truth.add(cell.card);
        });
        for (const id of truth) expect(shown.has(id), `${visibility} ${viewer}: ${id}`).toBe(false);
        const json = JSON.stringify(model(view, { target: { row: 3, col: 2 }, card: view.myHand[0] as CardId, orientation: 0 }));
        for (const id of hiddenIds) expect(json, `${visibility} ${viewer} ${id}`).not.toContain(id);
        if (visibility === 'FACE_UP') expect(boardModel(view, EMPTY_DRAFT).cells.some((c) => c.occupied && c.card === null)).toBe(false);
      }
    }
  });
});

describe('boardModel: property, legal flags equal an independent adjacency check', () => {
  it('holds for random occupancy', () => {
    const arbOccupied = fc.array(fc.boolean(), { minLength: 64, maxLength: 64 });
    fc.assert(
      fc.property(arbOccupied, (flags) => {
        const board: (CellView | null)[] = flags.map((on, i) => (on ? { owner: (['P0', 'P1', 'P2', 'P3', 'NEUTRAL'] as Owner[])[i % 5] as Owner, orientation: i % 2 === 0 ? 0 : 180, card: null } : null));
        const view: PlayerView = { ...INITIAL, board };
        const m = boardModel(view, EMPTY_DRAFT);
        m.cells.forEach((c) => {
          const neighbours = [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([dr, dc]) => {
            const r = c.row + (dr as number);
            const k = c.col + (dc as number);
            return r >= 0 && r < 8 && k >= 0 && k < 8 && flags[idx(r, k)] === true;
          });
          expect(c.isLegal).toBe(!flags[c.index] && neighbours.length > 0);
          expect(c.occupied).toBe(flags[c.index]);
          expect(c.notation).toBe(notationOfIndex(c.index));
        });
        expect(JSON.stringify(m)).not.toMatch(CARD_ID_TOKEN);
      }),
      { seed: 172, numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------------------------------------
// renderBoard against a fake Document
// ---------------------------------------------------------------------------------------------------------

interface FakeEvent {
  readonly type: string;
  readonly key?: string;
  readonly ctrlKey?: boolean;
  readonly repeat?: boolean;
  defaultPrevented: boolean;
  preventDefault(): void;
}

class FakeDoc {
  activeElement: FakeEl | null = null;
  createElement = (tag: string): FakeEl => new FakeEl(tag, this);
  createTextNode = (text: string): FakeEl => {
    const node = new FakeEl('#text', this);
    node.textContent = text;
    return node;
  };
}

class FakeEl {
  readonly children: FakeEl[] = [];
  parent: FakeEl | null = null;
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, ((e: FakeEvent) => void)[]>();
  textContent: string | null = '';
  constructor(
    readonly tagName: string,
    private readonly doc: FakeDoc,
  ) {}
  set innerHTML(_v: string) {
    throw new Error('innerHTML must not be assigned');
  }
  get innerHTML(): string {
    throw new Error('innerHTML must not be read');
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  appendChild(child: FakeEl): FakeEl {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  addEventListener(type: string, listener: (e: FakeEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  focus(): void {
    this.doc.activeElement = this;
    this.fire('focus', {});
  }
  /** Supports the selectors that hit testing uses: one or more `[attribute]` parts. */
  closest(selector: string): FakeEl | null {
    const names = [...selector.matchAll(/\[([a-z-]+)\]/g)].map((m) => m[1] as string);
    for (let el: FakeEl | null = this; el !== null; el = el.parent) {
      if (names.every((n) => el?.attributes.has(n))) return el;
    }
    return null;
  }
  fire(type: string, init: Partial<FakeEvent>): FakeEvent {
    const event: FakeEvent = {
      type,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...init,
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return event;
  }
}

const asFake = (el: HTMLElement): FakeEl => el as unknown as FakeEl;
const elements = (el: FakeEl): FakeEl[] => [el, ...el.children.flatMap(elements)];
const textOf = (el: FakeEl): string => (el.children.length > 0 ? el.children.map(textOf).join('') : (el.textContent ?? ''));
const classesOf = (el: FakeEl): string[] => (el.getAttribute('class') ?? '').split(' ').filter((c) => c !== '');

interface Spies {
  readonly draftEvents: DraftEvent[];
  readonly explained: GridPosition[];
  confirm: number;
  dispatch: number;
  notice: DraftResult['notice'];
  readonly handlers: BoardHandlers;
}

function spies(): Spies {
  const s: Spies = {
    draftEvents: [],
    explained: [],
    confirm: 0,
    dispatch: 0,
    notice: null,
    handlers: {
      draftEvent: (e) => {
        s.draftEvents.push(e);
        return { draft: EMPTY_DRAFT, notice: s.notice };
      },
      explainTarget: (c) => {
        s.explained.push(c);
        return null;
      },
      // Not part of BoardHandlers: extra members that the board must never reach (they are on the object it gets).
      ...({ confirmPlacement: () => void s.confirm++, dispatch: () => void s.dispatch++ } as object),
    } as BoardHandlers,
  };
  return s;
}

interface Mounted {
  readonly doc: FakeDoc;
  readonly root: FakeEl;
  readonly spy: Spies;
  readonly model: BoardModel;
  readonly buttons: FakeEl[];
}

function mount(
  view: PlayerView,
  opts: { draft?: PlacementDraft; lang?: Lang; dragActive?: boolean; render?: BoardRenderOptions } = {},
): Mounted {
  setLanguage(opts.lang ?? 'en');
  const doc = new FakeDoc();
  const spy = spies();
  const m = boardModel(view, opts.draft ?? EMPTY_DRAFT, { dragActive: opts.dragActive === true });
  const root = asFake(renderBoard(doc as unknown as Document, m, t, spy.handlers, opts.render));
  const buttons = elements(root).filter((e) => e.tagName === 'button');
  return { doc, root, spy, model: m, buttons };
}

const button = (m: Mounted, notation: string): FakeEl => m.buttons[indexOfNotation(notation)] as FakeEl;
const press = (el: FakeEl, key: string, init: Partial<FakeEvent> = {}): FakeEvent => el.fire('keydown', { key, ...init });
const tabStops = (m: Mounted): string[] => m.buttons.filter((b) => b.getAttribute('tabindex') === '0').map((b) => notationOfIndex(m.buttons.indexOf(b)));

describe('renderBoard: structure', () => {
  it('has a grid with 8 rows, 64 gridcells and exactly 64 cell buttons with data-row and data-col digits', () => {
    const m = mount(INITIAL);
    const all = elements(m.root);
    expect(all.filter((e) => e.getAttribute('role') === 'grid')).toHaveLength(1);
    expect(all.filter((e) => e.getAttribute('role') === 'row')).toHaveLength(8);
    expect(all.filter((e) => e.getAttribute('role') === 'gridcell')).toHaveLength(64);
    expect(m.buttons).toHaveLength(64);
    expect(all.filter((e) => e.tagName === 'button')).toHaveLength(64);
    m.buttons.forEach((b, i) => {
      expect(b.getAttribute('type')).toBe('button');
      expect(b.getAttribute('data-row')).toBe(String(Math.floor(i / 8)));
      expect(b.getAttribute('data-col')).toBe(String(i % 8));
      expect(b.getAttribute('data-row')).toMatch(/^[0-7]$/);
      expect(b.getAttribute('data-col')).toMatch(/^[0-7]$/);
      expect(b.getAttribute('data-focus-key')).toBe(`cell-${Math.floor(i / 8)}-${i % 8}`);
      expect(b.parent?.getAttribute('role')).toBe('gridcell');
      expect(b.parent?.parent?.getAttribute('role')).toBe('row');
      expect(b.parent?.parent?.parent?.getAttribute('role')).toBe('grid');
    });
    // only the cell button carries the data-row / data-col pair
    expect(all.filter((e) => e.attributes.has('data-row') || e.attributes.has('data-col'))).toHaveLength(64);
    const grid = all.find((e) => e.getAttribute('role') === 'grid') as FakeEl;
    expect(grid.getAttribute('aria-rowcount')).toBe('8');
    expect(grid.getAttribute('aria-colcount')).toBe('8');
    expect((grid.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0);
  });

  it('shows the labels A to H and 1 to 8, hidden from assistive technology, and the hint through aria-describedby', () => {
    const m = mount(INITIAL);
    const all = elements(m.root);
    const cols = all.find((e) => classesOf(e).includes('board-col-labels')) as FakeEl;
    const rows = all.find((e) => classesOf(e).includes('board-row-labels')) as FakeEl;
    expect(cols.children.map(textOf)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    expect(rows.children.map(textOf)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(cols.getAttribute('aria-hidden')).toBe('true');
    expect(rows.getAttribute('aria-hidden')).toBe('true');
    const grid = all.find((e) => e.getAttribute('role') === 'grid') as FakeEl;
    const hint = all.find((e) => e.getAttribute('id') === grid.getAttribute('aria-describedby')) as FakeEl;
    expect(hint).toBeDefined();
    expect(textOf(hint).length).toBeGreaterThan(20);
    expect(classesOf(hint)).toContain('board-hint');
  });

  it('gives every cell a non-empty localized accessible name in English and Korean, with no raw key or placeholder', () => {
    for (const lang of ['en', 'ko'] as const) {
      const m = mount(asView(midGame()), { lang, draft: { target: { row: 3, col: 2 }, card: null, orientation: 0 } });
      for (const b of m.buttons) {
        const label = b.getAttribute('aria-label') ?? '';
        expect(label.length, `${lang} ${b.getAttribute('data-focus-key')}`).toBeGreaterThan(0);
        expect(label).not.toMatch(/\{|\}|board\.|cards\.|common\./);
        if (lang === 'ko') expect(HANGUL.test(label)).toBe(true);
        expect(label.startsWith(notationOfIndex(m.buttons.indexOf(b)))).toBe(true);
      }
    }
  });

  it('has a string for every key the module uses, in both languages', () => {
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      for (const key of BOARD_STRING_KEYS) expect(t(key as StringKey, {}), `${lang} ${key}`).not.toBe(key);
    }
  });

  it('is built with textContent and setAttribute only, without any HTML parsing', () => {
    expect(() => mount(INITIAL)).not.toThrow(); // FakeEl throws on innerHTML
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'board.ts'), 'utf8');
    expect(source).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|\.title\b|'title'/);
    expect(source).not.toMatch(/touch-action|touchAction/);
  });
});

describe('renderBoard: markers and privacy of the DOM', () => {
  it('puts the legal class on exactly the legal cells, with a non-colour marker defined in board.css', () => {
    const m = mount(INITIAL);
    const legal = m.buttons.filter((b) => classesOf(b).includes('is-legal')).map((b) => notationOfIndex(m.buttons.indexOf(b)));
    expect(legal.sort()).toEqual([...INITIAL_LEGAL].sort());
    for (const b of m.buttons) {
      expect(classesOf(b).includes('board-cell--legal')).toBe(classesOf(b).includes('is-legal'));
      if (classesOf(b).includes('is-legal')) expect(b.getAttribute('aria-label')).toMatch(/legal placement$/);
    }
    // the marker is a text-free shape and a dashed outline, in the CSS source
    expect(rule('.board-cell.is-legal')).toMatch(/outline:\s*var\(--stroke\)\s+dashed/);
    expect(rule('.board-cell.is-legal::after')).toMatch(/content:\s*""/);
    expect(rule('.board-cell.is-legal::after')).toMatch(/border-radius:\s*50%/);
  });

  it('writes no CardId, rank word, suit word or glyph into an attribute other than the accessible name', () => {
    for (const visibility of ['OWNER_ONLY', 'FACE_UP'] as const) {
      for (const viewer of SEATS) {
        const view = asView(midGame(visibility), viewer);
        const own = view.myHand[0] as CardId;
        const m = mount(view, { draft: { target: { row: 3, col: 2 }, card: own, orientation: 180 } });
        for (const e of elements(m.root)) {
          for (const [name, value] of e.attributes) {
            if (name === 'aria-label') continue;
            expect(value, `${name}=${value}`).not.toMatch(CARD_ID_TOKEN);
            expect(value, `${name}=${value}`).not.toMatch(/[♥♦♣♠]|Hearts|Diamonds|Clubs|Spades|Ace|Jack|Queen|King/);
            expect(name).not.toBe('title');
            expect(name).not.toBe('data-card');
          }
          if (e.getAttribute('aria-label') !== null) expect(e.getAttribute('aria-label')).not.toMatch(CARD_ID_TOKEN);
        }
      }
    }
  });

  it('shows no rank, suit or glyph text and no identity name for a hidden card, while a visible card shows its face', () => {
    const view = asView(midGame(), 'P0');
    const m = mount(view);
    let hiddenCells = 0;
    let visibleCells = 0;
    view.board.forEach((cell, i) => {
      if (cell === null) return;
      const b = m.buttons[i] as FakeEl;
      const faceText = textOf(b).replace(/180°/g, '');
      if (cell.card === null) {
        hiddenCells++;
        expect(faceText, notationOfIndex(i)).toBe('');
        expect(b.getAttribute('aria-label')).not.toMatch(/Hearts|Diamonds|Clubs|Spades|♥|♦|♣|♠| of /);
      } else {
        visibleCells++;
        expect(faceText.length).toBeGreaterThan(0);
        const face = b.children[0] as FakeEl;
        expect(face.getAttribute('data-face')).toBe('up');
      }
    });
    expect(hiddenCells).toBeGreaterThan(0);
    expect(visibleCells).toBeGreaterThan(0);
  });

  it('draws the preview ghost only inside the target cell, with the draft card face and orientation', () => {
    const own = INITIAL.myHand.find((c) => c.startsWith('C-') || c.startsWith('S-')) ?? (INITIAL.myHand[0] as CardId);
    const m = mount(INITIAL, { draft: { target: { row: 3, col: 2 }, card: own, orientation: 180 } });
    const ghosts = elements(m.root).filter((e) => classesOf(e).includes('is-preview'));
    expect(ghosts).toHaveLength(1);
    const ghost = ghosts[0] as FakeEl;
    expect(ghost.parent).toBe(button(m, 'C4'));
    expect(ghost.getAttribute('aria-hidden')).toBe('true');
    const face = ghost.children[0] as FakeEl;
    expect(classesOf(face)).toEqual(expect.arrayContaining(['card-face', 'card-face--preview', 'is-rotated']));
    expect(face.getAttribute('data-orientation')).toBe('180');
    expect(face.getAttribute('data-owner')).toBe('P0');
    expect(face.getAttribute('data-face')).toBe('up');
    expect(face.getAttribute('aria-label')).toBe(expectedFaceEn(own, 180, 'Player 1'));
    expect(textOf(ghost)).toContain('180°');
    expect(classesOf(button(m, 'C4'))).toEqual(expect.arrayContaining(['is-target', 'has-preview']));
    expect(button(m, 'C4').parent?.getAttribute('aria-selected')).toBe('true');
    expect(m.buttons.filter((b) => b.parent?.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    // pointer events pass through the ghost (CSS source), and it has no pixel positioning
    expect(rule('.board-ghost')).toMatch(/pointer-events:\s*none/);
    expect(rule('.board-ghost')).not.toMatch(/\b(top|left|right|bottom)\s*:/);
    // without a card there is a target mark but no ghost
    const targetOnly = mount(INITIAL, { draft: { target: { row: 3, col: 2 }, card: null, orientation: 0 } });
    expect(elements(targetOnly.root).some((e) => classesOf(e).includes('is-preview'))).toBe(false);
    expect(classesOf(button(targetOnly, 'C4'))).toContain('is-target');
  });

  it('adds is-drop-target to legal cells only while dragActive, from the model or the render option', () => {
    const idle = mount(INITIAL);
    expect(idle.buttons.some((b) => classesOf(b).includes('is-drop-target'))).toBe(false);
    for (const m of [mount(INITIAL, { dragActive: true }), mount(INITIAL, { render: { dragActive: true } })]) {
      const drop = m.buttons.filter((b) => classesOf(b).includes('is-drop-target')).map((b) => notationOfIndex(m.buttons.indexOf(b)));
      expect(drop.sort()).toEqual([...INITIAL_LEGAL].sort());
    }
    const off = mount(INITIAL, { dragActive: true, render: { dragActive: false } });
    expect(off.buttons.some((b) => classesOf(b).includes('is-drop-target'))).toBe(false);
  });

  it('marks pending code regions on the cells', () => {
    const view = asView(batchState());
    const m = mount(view);
    const marked = new Set(m.buttons.filter((b) => classesOf(b).includes('is-pending-region')).map((b) => notationOfIndex(m.buttons.indexOf(b))));
    expect(marked).toEqual(regionCells(view.pendingQuadKeys));
    for (const n of marked) expect(button(m, n).getAttribute('aria-label')).toMatch(/awaiting guesses$/);
  });

  it('is found by the hit test: a point on the face inside a cell resolves to that cell, a point on the ghost too', () => {
    const own = INITIAL.myHand[0] as CardId;
    const m = mount(INITIAL, { draft: { target: { row: 3, col: 2 }, card: own, orientation: 0 } });
    const inside = (notation: string): FakeEl => {
      let el = button(m, notation);
      while (el.children.length > 0) el = el.children[0] as FakeEl;
      return el;
    };
    for (const n of ['D4', 'C4', 'A1', 'H8']) {
      const host = { elementFromPoint: () => inside(n) as never };
      expect(cellFromPoint(host as never, 10, 10), n).toEqual(posOf(n));
    }
  });
});

describe('renderBoard: keyboard', () => {
  it('has exactly one tab stop: the target, else the first legal cell, else A1; or the cell the host passes', () => {
    expect(tabStops(mount(INITIAL))).toEqual(['D3']); // first legal cell in row-major order
    expect(tabStops(mount(INITIAL, { draft: { target: { row: 3, col: 5 }, card: null, orientation: 0 } }))).toEqual(['F4']);
    expect(tabStops(mount(asView(start(1), 'P1')))).toEqual(['A1']);
    expect(tabStops(mount(INITIAL, { render: { tabStop: { row: 7, col: 7 } } }))).toEqual(['H8']);
    for (const m of [mount(INITIAL), mount(asView(batchState()))]) {
      expect(m.buttons.filter((b) => b.getAttribute('tabindex') === '0')).toHaveLength(1);
      expect(m.buttons.filter((b) => b.getAttribute('tabindex') === '-1')).toHaveLength(63);
    }
  });

  it('moves focus with the arrow keys, keeps one tab stop, and stays at every edge', () => {
    const m = mount(INITIAL, { render: { tabStop: { row: 3, col: 3 } } });
    const at = (): string => notationOfIndex(m.buttons.indexOf(m.doc.activeElement as FakeEl));
    m.buttons[idx(3, 3)]?.focus();
    expect(at()).toBe('D4');
    const right = press(button(m, 'D4'), 'ArrowRight');
    expect(right.defaultPrevented).toBe(true);
    expect(at()).toBe('E4');
    expect(tabStops(m)).toEqual(['E4']);
    press(button(m, 'E4'), 'ArrowDown');
    expect(at()).toBe('E5');
    press(button(m, 'E5'), 'ArrowLeft');
    expect(at()).toBe('D5');
    press(button(m, 'D5'), 'ArrowUp');
    expect(at()).toBe('D4');
    expect(tabStops(m)).toEqual(['D4']);
    // edges: no wrap, focus stays on the same cell
    const edge = (from: string, key: string): void => {
      button(m, from).focus();
      press(button(m, from), key);
      expect(at(), `${key} at ${from}`).toBe(from);
      expect(tabStops(m)).toEqual([from]);
    };
    edge('A1', 'ArrowLeft');
    edge('A1', 'ArrowUp');
    edge('H1', 'ArrowRight');
    edge('H1', 'ArrowUp');
    edge('A8', 'ArrowLeft');
    edge('A8', 'ArrowDown');
    edge('H8', 'ArrowRight');
    edge('H8', 'ArrowDown');
    edge('A4', 'ArrowLeft');
    edge('D8', 'ArrowDown');
  });

  it('moves to the row start and end with Home and End, and to A1 and H8 with Ctrl+Home and Ctrl+End', () => {
    const m = mount(INITIAL);
    const at = (): string => notationOfIndex(m.buttons.indexOf(m.doc.activeElement as FakeEl));
    button(m, 'D5').focus();
    press(button(m, 'D5'), 'Home');
    expect(at()).toBe('A5');
    press(button(m, 'A5'), 'End');
    expect(at()).toBe('H5');
    press(button(m, 'H5'), 'End');
    expect(at()).toBe('H5');
    press(button(m, 'H5'), 'Home', { ctrlKey: true });
    expect(at()).toBe('A1');
    press(button(m, 'A1'), 'End', { ctrlKey: true });
    expect(at()).toBe('H8');
    expect(tabStops(m)).toEqual(['H8']);
  });

  it('follows a focus that arrives some other way (a click or a restored focus) with its tab stop', () => {
    const m = mount(INITIAL);
    button(m, 'B7').focus();
    expect(tabStops(m)).toEqual(['B7']);
  });

  it('ignores other keys and modified keys, and sends nothing for them', () => {
    const m = mount(INITIAL);
    for (const key of ['a', 'Tab', 'PageUp', 'F5']) expect(press(button(m, 'C4'), key).defaultPrevented).toBe(false);
    expect(press(button(m, 'C4'), 'ArrowRight', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(m.spy.draftEvents).toEqual([]);
    expect(m.spy.explained).toEqual([]);
  });

  it('Enter and Space on a legal cell send selectTarget exactly once and never reach confirm or dispatch', () => {
    for (const key of ['Enter', ' ']) {
      const m = mount(INITIAL);
      const event = press(button(m, 'C4'), key);
      expect(event.defaultPrevented).toBe(true);
      expect(m.spy.draftEvents).toEqual([{ type: 'selectTarget', cell: { row: 3, col: 2 } }]);
      expect(m.spy.explained).toEqual([]);
      expect(m.spy.confirm).toBe(0);
      expect(m.spy.dispatch).toBe(0);
    }
  });

  it('Space is also stopped on key up, so the browser sends no second click', () => {
    const m = mount(INITIAL);
    expect(button(m, 'C4').fire('keyup', { key: ' ' }).defaultPrevented).toBe(true);
    expect(button(m, 'C4').fire('keyup', { key: 'a' }).defaultPrevented).toBe(false);
    expect(m.spy.draftEvents).toEqual([]);
  });

  it('Enter on an illegal cell (empty, occupied or off turn) calls explainTarget and not selectTarget', () => {
    const m = mount(INITIAL);
    press(button(m, 'A1'), 'Enter'); // empty, not adjacent
    press(button(m, 'D4'), 'Enter'); // occupied
    expect(m.spy.explained).toEqual([{ row: 0, col: 0 }, { row: 3, col: 3 }]);
    expect(m.spy.draftEvents).toEqual([]);
    const off = mount(asView(start(1), 'P1'));
    press(button(off, 'C4'), 'Enter');
    expect(off.spy.explained).toEqual([{ row: 3, col: 2 }]);
    expect(off.spy.draftEvents).toEqual([]);
    for (const x of [m, off]) {
      expect(x.spy.confirm).toBe(0);
      expect(x.spy.dispatch).toBe(0);
    }
  });

  it('also explains a legal-looking cell that the controller refuses (TARGET_NOT_LEGAL)', () => {
    const m = mount(INITIAL);
    m.spy.notice = 'TARGET_NOT_LEGAL';
    press(button(m, 'C4'), 'Enter');
    expect(m.spy.draftEvents).toHaveLength(1);
    expect(m.spy.explained).toEqual([{ row: 3, col: 2 }]);
  });

  it('a click behaves like Enter, and never confirms', () => {
    const m = mount(INITIAL);
    button(m, 'F5').fire('click', {});
    button(m, 'A8').fire('click', {});
    expect(m.spy.draftEvents).toEqual([{ type: 'selectTarget', cell: { row: 4, col: 5 } }]);
    expect(m.spy.explained).toEqual([{ row: 7, col: 0 }]);
    expect(tabStops(m)).toEqual(['A8']);
    expect(m.spy.confirm + m.spy.dispatch).toBe(0);
  });

  it('Escape sends the cancel draft event from any cell', () => {
    const m = mount(INITIAL);
    press(button(m, 'C4'), 'Escape');
    press(button(m, 'A1'), 'Escape');
    expect(m.spy.draftEvents).toEqual([{ type: 'cancel' }, { type: 'cancel' }]);
    expect(m.spy.explained).toEqual([]);
    expect(m.spy.confirm + m.spy.dispatch).toBe(0);
  });

  it('ignores a held key repeat for Enter', () => {
    const m = mount(INITIAL);
    press(button(m, 'C4'), 'Enter', { repeat: true });
    expect(m.spy.draftEvents).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// board.css (source checks; no browser is involved)
// ---------------------------------------------------------------------------------------------------------

const STYLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'styles');
const boardCss = readFileSync(join(STYLES_DIR, 'board.css'), 'utf8');
const tokensCss = readFileSync(join(STYLES_DIR, 'tokens.css'), 'utf8');
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

interface Rule {
  readonly selector: string;
  readonly body: string;
}
function rulesOf(css: string): Rule[] {
  return [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] as string).trim().replace(/\s+/g, ' '),
    body: m[2] as string,
  }));
}
const RULES = rulesOf(boardCss);
/** The body of the (first) rule with exactly this selector. */
function rule(selector: string): string {
  const found = RULES.find((r) => r.selector === selector);
  if (found === undefined) throw new Error(`no rule for ${selector}`);
  return found.body;
}
const declarations = (body: string): [string, string][] =>
  body
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d !== '')
    .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()] as [string, string]);

describe('board.css', () => {
  it('gives the grid, the rows and the frame gap 0, and border-box sizing to the cells', () => {
    for (const s of ['.board', '.board-row', '.board-frame', '.board-col-labels', '.board-row-labels']) expect(rule(s), s).toMatch(/gap:\s*0\s*;/);
    for (const s of ['.board-cell', '.board-gridcell', '.board']) expect(rule(s), s).toMatch(/box-sizing:\s*border-box\s*;/);
    expect(rule('.board-gridcell')).toMatch(/inline-size:\s*var\(--cell\)/);
    expect(rule('.board-gridcell')).toMatch(/block-size:\s*var\(--cell\)/);
    expect(rule('.board')).toMatch(/grid-template-columns:\s*calc\(8 \* var\(--cell\)\)/);
    expect(rule('.board-row')).toMatch(/grid-template-columns:\s*repeat\(8,\s*var\(--cell\)\)/);
  });

  it('has no margin other than 0 on any cell, wrapper, ghost or card class', () => {
    const touching = RULES.filter((r) => /\.board-cell|\.board-gridcell|\.board-ghost|\.board-row\b|\.card-face/.test(r.selector));
    expect(touching.length).toBeGreaterThan(0);
    for (const r of touching) {
      for (const [prop, value] of declarations(r.body)) {
        if (/^margin/.test(prop)) expect(value, `${r.selector} ${prop}`).toBe('0');
      }
    }
    expect(rule('.board-cell')).toMatch(/margin:\s*0\s*;/);
    expect(rule('.board-cell')).toMatch(/border:\s*0\s*;/);
    expect(rule('.board-cell')).toMatch(/padding:\s*0\s*;/);
    expect(rule('.board-cell')).toMatch(/min-width:\s*0\s*;/);
  });

  it('draws every state mark inside the box: no state rule changes a size, margin, padding or border of the cell itself', () => {
    const SIZING = /^(?:(?:min-|max-)?(?:width|height|inline-size|block-size)|margin.*|padding.*|border.*|inset.*|top|left|right|bottom|position|display)$/;
    const stateRules = RULES.filter((r) => /\.board-cell(?:\.|:)/.test(r.selector) && !r.selector.includes('::') && !r.selector.startsWith('.board-cell:'));
    expect(stateRules.length).toBeGreaterThan(3);
    for (const r of stateRules) {
      for (const [prop] of declarations(r.body)) expect(prop, `${r.selector} sets ${prop}`).not.toMatch(SIZING);
    }
    // the focus ring is an outline with a negative offset
    expect(rule('.board-cell:focus-visible')).toMatch(/outline:\s*var\(--stroke-strong\)\s+solid/);
    expect(rule('.board-cell:focus-visible')).toMatch(/outline-offset:\s*calc\(-1 \*/);
    // the selection mark is an inset shadow
    expect(rule('.board-cell.is-target')).toMatch(/box-shadow:[^;]*inset/);
    // the only borders are on pseudo-elements that are out of the flow
    expect(rule('.board-cell.is-pending-region::before')).toMatch(/border:/);
    expect(rule('.board-cell.is-pending-region::before, .board-cell.is-revealed-region::before')).toMatch(/position:\s*absolute/);
    expect(rule('.board-cell.is-pending-region::before, .board-cell.is-revealed-region::before')).toMatch(/inset:\s*0/);
  });

  it('marks legal, target, drop-target and regions with shapes or patterns, not colour alone', () => {
    expect(rule('.board-cell.is-legal')).toMatch(/outline:[^;]*dashed/);
    expect(rule('.board-cell.is-legal::after')).toMatch(/content:\s*""/);
    expect(rule('.board-cell.is-target')).toMatch(/inset 0 0 0 var\(--stroke-strong\)[\s\S]*inset 0 0 0 calc/);
    expect(rule('.board-cell.is-drop-target')).toMatch(/repeating-linear-gradient/);
    expect(rule('.board-cell.is-drop-target')).toMatch(/outline:[^;]*solid/);
    expect(rule('.board-cell.is-pending-region::before')).toMatch(/dashed/);
    expect(rule('.board-cell.is-revealed-region::before')).toMatch(/double/);
    expect(rule('.board-ghost')).toMatch(/opacity:\s*0\.\d+/);
    expect(rule('.board-cell.has-preview::after')).toMatch(/display:\s*none/);
  });

  it('never sets touch-action, so page scrolling and pinch zoom stay available', () => {
    expect(stripComments(boardCss)).not.toMatch(/touch-action/);
    expect(RULES.some((r) => /^(?:html|body)\b/.test(r.selector))).toBe(false);
  });

  it('declares every custom property that it reads, and refers to no url(), @import, http or font', () => {
    const defined = new Set([...stripComments(tokensCss).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const local = new Set([...stripComments(boardCss).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    for (const m of stripComments(boardCss).matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
      expect(defined.has(m[1] as string) || local.has(m[1] as string), m[1]).toBe(true);
    }
    expect(boardCss).not.toMatch(/url\(/i);
    expect(boardCss).not.toMatch(/@import/i);
    expect(boardCss).not.toMatch(/http/i);
    expect(boardCss).not.toMatch(/@font-face/i);
  });

  it('keeps the class names that board.ts writes in sync with the selectors', () => {
    const selectors = RULES.map((r) => r.selector).join(' ');
    for (const cls of ['board-frame', 'board-col-labels', 'board-row-labels', 'board-label', 'board', 'board-row', 'board-gridcell', 'board-cell', 'board-ghost', 'board-hint', 'is-legal', 'is-target', 'is-drop-target', 'has-preview', 'is-pending-region', 'is-revealed-region']) {
      expect(selectors, cls).toContain(`.${cls}`);
    }
  });
});
