// Tests of the placement draft (task 17.4): reduceDraft, validateDraft, draftState, draftContextFor.
//
// EVIDENCE CLASS: model. Pure functions run in Node with real PlayerViews from `newGame`/`reduce`. No DOM, no
// pointer events, no touch emulation and no real device are involved, so nothing here says anything about how a
// drag feels or behaves on a phone (fake-DOM tests come in task 21.3; emulated touch and real-device checks later).
//
// Acceptance items of task 17.4 covered here: 1 (path equivalence), 3 and 4 (rotation capability and reset),
// 5 (edge adjacency on real boards), 6 (invalid drops and cancel leave the draft as specified), and the draft
// side of 8 (stale drafts fail validation).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../core/cards';
import { reduce } from '../core/engine';
import { defaultConfig, newGame } from '../core/state';
import type { GameState } from '../core/state';
import { fromNotation } from '../core/geometry';
import type { CardId, GridPosition, Orientation } from '../core/types';
import { legalCellsFor, viewFor } from '../core/view';
import type { PlayerView } from '../core/view';
import {
  EMPTY_DRAFT,
  cellKey,
  draftContextFor,
  draftState,
  errorCodeForIssue,
  reduceDraft,
  validateDraft,
} from './placement-draft';
import type { DraftContext, DraftEvent, PlacementDraft, RotationInfoMap } from './placement-draft';

// Independent literal expectation: clubs and spades change their printed corners at 180 degrees, hearts and diamonds not.
const TURNS: (card: CardId) => boolean = (card) => card.startsWith('C-') || card.startsWith('S-');

const rotationFor = (cards: readonly CardId[]): RotationInfoMap =>
  Object.fromEntries(cards.map((card) => [card, { rotationChangesCorners: TURNS(card) }]));

const cell = (notation: string): GridPosition => {
  const parsed = fromNotation(notation);
  if (!parsed.ok) throw new Error(`bad notation ${notation}`);
  return parsed.value;
};

function start(seed = 5): GameState {
  const created = newGame({ seed, config: defaultConfig() });
  if (!created.ok) throw new Error('newGame failed');
  return created.value;
}

function place(state: GameState, player: 'P0' | 'P1' | 'P2' | 'P3', at: string, orientation: Orientation = 0): GameState {
  const card = state.hands[player][0] as CardId;
  const result = reduce(state, { type: 'PLACE', player, card, pos: cell(at), orientation });
  if (!result.ok) throw new Error(`place ${at} failed: ${result.error.code}`);
  return result.value;
}

/** A context with the real legal cells of `view` and a Hand that holds all 52 cards (so every card is selectable). */
function ctxFor(view: PlayerView, hand: readonly CardId[] = ALL_CARDS): DraftContext {
  return { legal: new Set(legalCellsFor(view).map(cellKey)), hand, rotation: rotationFor(hand) };
}

const run = (d: PlacementDraft, events: readonly DraftEvent[], ctx: DraftContext): PlacementDraft =>
  events.reduce((draft, e) => reduceDraft(draft, e, ctx).draft, d);

const initialView = viewFor(start(), 'P0');
const INITIAL_LEGAL = ['C4', 'C5', 'F4', 'F5', 'D3', 'E3', 'D6', 'E6'];
const clubCard = 'C-5' as CardId;
const spadeCard = 'S-9' as CardId;
const heartCard = 'H-7' as CardId;
const diamondCard = 'D-2' as CardId;

describe('draftState', () => {
  it('derives the four states from target and card', () => {
    expect(draftState(EMPTY_DRAFT)).toBe('IDLE');
    expect(draftState({ target: cell('C4'), card: null, orientation: 0 })).toBe('TARGET_SELECTED');
    expect(draftState({ target: null, card: heartCard, orientation: 0 })).toBe('CARD_SELECTED');
    expect(draftState({ target: cell('C4'), card: heartCard, orientation: 0 })).toBe('PREVIEW');
  });
});

describe('acceptance 1: drag and drop and position-first give equal drafts', () => {
  const ctx = ctxFor(initialView);

  it('dropOnCell(x, c), selectTarget(x) then selectCard(c), and selectCard(c) then selectTarget(x) are all { x, c, 0 }', () => {
    const x = cell('D3');
    const c = clubCard;
    const expected = { target: x, card: c, orientation: 0 };
    const viaDrop = run(EMPTY_DRAFT, [{ type: 'dropOnCell', cell: x, card: c }], ctx);
    const targetFirst = run(EMPTY_DRAFT, [{ type: 'selectTarget', cell: x }, { type: 'selectCard', card: c }], ctx);
    const cardFirst = run(EMPTY_DRAFT, [{ type: 'selectCard', card: c }, { type: 'selectTarget', cell: x }], ctx);
    expect(viaDrop).toEqual(expected);
    expect(targetFirst).toEqual(expected);
    expect(cardFirst).toEqual(expected);
    expect(draftState(viaDrop)).toBe('PREVIEW');
  });

  it('holds for every legal cell and every card (property, 100 runs)', () => {
    const legal = legalCellsFor(initialView);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: legal.length - 1 }), fc.integer({ min: 0, max: 51 }), (i, j) => {
        const x = legal[i] as GridPosition;
        const c = ALL_CARDS[j] as CardId;
        const a = run(EMPTY_DRAFT, [{ type: 'dropOnCell', cell: x, card: c }], ctx);
        const b = run(EMPTY_DRAFT, [{ type: 'selectTarget', cell: x }, { type: 'selectCard', card: c }], ctx);
        const d = run(EMPTY_DRAFT, [{ type: 'selectCard', card: c }, { type: 'selectTarget', cell: x }], ctx);
        expect(a).toEqual({ target: x, card: c, orientation: 0 });
        expect(b).toEqual(a);
        expect(d).toEqual(a);
      }),
      { numRuns: 100 },
    );
  });

  it('snaps to exactly the dropped cell, never to a nearby legal cell', () => {
    const result = reduceDraft(EMPTY_DRAFT, { type: 'dropOnCell', cell: cell('E6'), card: heartCard }, ctx);
    expect(result.draft.target).toEqual(cell('E6'));
    expect(result.notice).toBeNull();
  });
});

describe('reduceDraft rules', () => {
  const ctx = ctxFor(initialView);

  it('selectCard: unknown card is refused, the same card is a no-op, a new card resets the orientation to 0', () => {
    const none = { ...ctx, hand: [heartCard] };
    expect(reduceDraft(EMPTY_DRAFT, { type: 'selectCard', card: clubCard }, none)).toEqual({ draft: EMPTY_DRAFT, notice: 'CARD_NOT_IN_HAND' });
    const rotated: PlacementDraft = { target: cell('C4'), card: clubCard, orientation: 180 };
    const same = reduceDraft(rotated, { type: 'selectCard', card: clubCard }, ctx);
    expect(same.draft).toBe(rotated);
    expect(same.notice).toBeNull();
    expect(reduceDraft(rotated, { type: 'selectCard', card: spadeCard }, ctx).draft).toEqual({ target: cell('C4'), card: spadeCard, orientation: 0 });
  });

  it('selectCard keeps a still-legal target and clears a target that is no longer legal', () => {
    const draft: PlacementDraft = { target: cell('C4'), card: clubCard, orientation: 0 };
    expect(reduceDraft(draft, { type: 'selectCard', card: heartCard }, ctx).draft.target).toEqual(cell('C4'));
    const shrunk: DraftContext = { ...ctx, legal: new Set([cellKey(cell('F4'))]) };
    expect(reduceDraft(draft, { type: 'selectCard', card: heartCard }, shrunk).draft).toEqual({ target: null, card: heartCard, orientation: 0 });
  });

  it('selectTarget: an illegal cell is refused with the draft unchanged; a legal one keeps card and orientation', () => {
    const draft: PlacementDraft = { target: cell('C4'), card: clubCard, orientation: 180 };
    for (const bad of ['C3', 'A1', 'D4']) {
      const r = reduceDraft(draft, { type: 'selectTarget', cell: cell(bad) }, ctx);
      expect(r.draft, bad).toBe(draft);
      expect(r.notice, bad).toBe('TARGET_NOT_LEGAL');
    }
    expect(reduceDraft(draft, { type: 'selectTarget', cell: { row: 9, col: 9 } }, ctx).notice).toBe('TARGET_NOT_LEGAL');
    expect(reduceDraft(draft, { type: 'selectTarget', cell: cell('F5') }, ctx).draft).toEqual({ target: cell('F5'), card: clubCard, orientation: 180 });
  });

  it('dropOnCell on an illegal cell or with a foreign card keeps the earlier draft; the dragged card is NOT selected', () => {
    const draft: PlacementDraft = { target: cell('C4'), card: heartCard, orientation: 0 };
    const illegal = reduceDraft(draft, { type: 'dropOnCell', cell: cell('C3'), card: clubCard }, ctx);
    expect(illegal).toEqual({ draft, notice: 'TARGET_NOT_LEGAL' });
    expect(illegal.draft).toBe(draft);
    const foreign = reduceDraft(draft, { type: 'dropOnCell', cell: cell('C5'), card: clubCard }, { ...ctx, hand: [heartCard] });
    expect(foreign).toEqual({ draft, notice: 'CARD_NOT_IN_HAND' });
  });

  it('dropOnCell keeps the orientation for the current card and resets it for another card', () => {
    const draft: PlacementDraft = { target: cell('C4'), card: clubCard, orientation: 180 };
    expect(reduceDraft(draft, { type: 'dropOnCell', cell: cell('F4'), card: clubCard }, ctx).draft).toEqual({ target: cell('F4'), card: clubCard, orientation: 180 });
    expect(reduceDraft(draft, { type: 'dropOnCell', cell: cell('F4'), card: spadeCard }, ctx).draft).toEqual({ target: cell('F4'), card: spadeCard, orientation: 0 });
  });

  it('dragStart, dropOutside and dragCancel return the same draft object with no notice', () => {
    const draft: PlacementDraft = { target: cell('C4'), card: clubCard, orientation: 180 };
    for (const e of [{ type: 'dragStart', card: heartCard }, { type: 'dropOutside' }, { type: 'dragCancel' }] as const) {
      const r = reduceDraft(draft, e, ctx);
      expect(r.draft, e.type).toBe(draft);
      expect(r.notice, e.type).toBeNull();
    }
    expect(reduceDraft(EMPTY_DRAFT, { type: 'dragStart', card: heartCard }, ctx).draft).toBe(EMPTY_DRAFT); // a gesture alone makes no draft
  });

  it('cancel and every invalidate reason give the empty draft', () => {
    const draft: PlacementDraft = { target: cell('C4'), card: clubCard, orientation: 180 };
    expect(reduceDraft(draft, { type: 'cancel' }, ctx).draft).toBe(EMPTY_DRAFT);
    for (const reason of ['VIEWER', 'PHASE', 'TURN', 'GAME', 'HAND', 'RESTART', 'ABANDON', 'DISPOSE'] as const) {
      expect(reduceDraft(draft, { type: 'invalidate', reason }, ctx).draft, reason).toBe(EMPTY_DRAFT);
    }
  });

  it('does not mutate its inputs and returns frozen drafts with their own copy of the target', () => {
    const x = { row: 2, col: 3 };
    const frozenCtx: DraftContext = Object.freeze({ legal: new Set(['2,3']), hand: Object.freeze([heartCard]), rotation: Object.freeze({}) });
    const result = reduceDraft(EMPTY_DRAFT, { type: 'dropOnCell', cell: x, card: heartCard }, frozenCtx);
    expect(Object.isFrozen(result.draft)).toBe(true);
    expect(result.draft.target).toEqual(x);
    expect(result.draft.target).not.toBe(x);
    expect(EMPTY_DRAFT).toEqual({ target: null, card: null, orientation: 0 });
  });
});

describe('acceptance 3 and 4: rotation capability and reset', () => {
  const ctx = ctxFor(initialView);

  it('toggleRotation switches 0 <-> 180 for all 26 clubs and spades and refuses all 26 hearts and diamonds', () => {
    let turning = 0;
    for (const card of ALL_CARDS) {
      const start: PlacementDraft = { target: cell('D3'), card, orientation: 0 };
      const once = reduceDraft(start, { type: 'toggleRotation' }, ctx);
      if (TURNS(card)) {
        turning++;
        expect(once.draft, card).toEqual({ target: cell('D3'), card, orientation: 180 });
        expect(once.notice, card).toBeNull();
        expect(reduceDraft(once.draft, { type: 'toggleRotation' }, ctx).draft, card).toEqual(start);
      } else {
        expect(once.draft, card).toBe(start);
        expect(once.notice, card).toBe('ROTATION_NOT_MEANINGFUL');
      }
    }
    expect(turning).toBe(26);
  });

  it('never produces 90 or 270 and never moves the target, in any toggle sequence', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('toggle', 'noop'), { maxLength: 12 }), (steps) => {
        let draft: PlacementDraft = { target: cell('E6'), card: spadeCard, orientation: 0 };
        for (const step of steps) {
          draft = reduceDraft(draft, step === 'toggle' ? { type: 'toggleRotation' } : { type: 'dropOutside' }, ctx).draft;
          expect([0, 180]).toContain(draft.orientation);
          expect(draft.target).toEqual(cell('E6'));
        }
      }),
      { numRuns: 100 },
    );
  });

  it('toggleRotation without a card, or with a card that has no capability entry, is refused', () => {
    expect(reduceDraft(EMPTY_DRAFT, { type: 'toggleRotation' }, ctx)).toEqual({ draft: EMPTY_DRAFT, notice: 'ROTATION_NOT_MEANINGFUL' });
    const blind: DraftContext = { ...ctx, rotation: {} };
    const draft: PlacementDraft = { target: null, card: clubCard, orientation: 0 };
    expect(reduceDraft(draft, { type: 'toggleRotation' }, blind).draft).toBe(draft);
  });

  it('switching a rotated club or spade to a heart, a diamond, or another club resets to 0 and keeps a legal target', () => {
    for (const from of [clubCard, spadeCard]) {
      const rotated: PlacementDraft = { target: cell('F5'), card: from, orientation: 180 };
      for (const to of [heartCard, diamondCard, 'C-9' as CardId, 'S-2' as CardId]) {
        expect(reduceDraft(rotated, { type: 'selectCard', card: to }, ctx).draft, `${from} -> ${to}`).toEqual({ target: cell('F5'), card: to, orientation: 0 });
        expect(reduceDraft(rotated, { type: 'dropOnCell', cell: cell('F5'), card: to }, ctx).draft.orientation, `${from} -> ${to} (drop)`).toBe(0);
      }
    }
  });
});

describe('invariants after any event sequence (property, 100 runs)', () => {
  const ctx = ctxFor(initialView, ['C-5', 'S-9', 'H-7', 'D-2', 'C-K'] as CardId[]);
  const legal = legalCellsFor(initialView);
  const anyCell = fc.oneof(
    fc.constantFrom(...legal),
    fc.constantFrom(cell('C3'), cell('A1'), cell('D4'), { row: 8, col: 8 }, { row: -1, col: 0 }),
  );
  const anyCard = fc.constantFrom(...(['C-5', 'S-9', 'H-7', 'D-2', 'C-K', 'H-A'] as CardId[])); // H-A is not in the Hand
  const anyEvent: fc.Arbitrary<DraftEvent> = fc.oneof(
    anyCell.map((c): DraftEvent => ({ type: 'selectTarget', cell: c })),
    anyCard.map((c): DraftEvent => ({ type: 'selectCard', card: c })),
    fc.tuple(anyCell, anyCard).map(([c, k]): DraftEvent => ({ type: 'dropOnCell', cell: c, card: k })),
    fc.constantFrom<DraftEvent>({ type: 'toggleRotation' }, { type: 'dropOutside' }, { type: 'dragCancel' }, { type: 'cancel' }),
  );

  it('card is in the Hand or null, target is legal or null, and 180 implies a card with the capability', () => {
    fc.assert(
      fc.property(fc.array(anyEvent, { maxLength: 25 }), (events) => {
        let draft: PlacementDraft = EMPTY_DRAFT;
        for (const e of events) {
          draft = reduceDraft(draft, e, ctx).draft;
          if (draft.card !== null) expect(ctx.hand).toContain(draft.card);
          if (draft.target !== null) expect(ctx.legal.has(cellKey(draft.target))).toBe(true);
          if (draft.orientation === 180) expect(draft.card !== null && TURNS(draft.card)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('acceptance 5: edge adjacency through legalCellsFor on real boards', () => {
  const key = (p: GridPosition): string => `${p.row},${p.col}`;

  it('the starting 2x2 has exactly the 8 edge-adjacent cells; diagonal-only and isolated cells are refused', () => {
    const legal = legalCellsFor(initialView).map(key).sort();
    expect(legal).toEqual(INITIAL_LEGAL.map((n) => key(cell(n))).sort());
    const ctx = ctxFor(initialView);
    for (const ok of INITIAL_LEGAL) {
      expect(reduceDraft(EMPTY_DRAFT, { type: 'selectTarget', cell: cell(ok) }, ctx).draft.target, ok).toEqual(cell(ok));
    }
    for (const bad of ['C3', 'F3', 'C6', 'F6', 'A1', 'H8', 'B4', 'G5', 'D2', 'E7']) {
      const r = reduceDraft(EMPTY_DRAFT, { type: 'selectTarget', cell: cell(bad) }, ctx);
      expect(r, bad).toEqual({ draft: EMPTY_DRAFT, notice: 'TARGET_NOT_LEGAL' });
    }
  });

  it('occupied and out-of-grid cells are refused', () => {
    const ctx = ctxFor(initialView);
    for (const bad of [cell('D4'), cell('E5'), { row: 8, col: 0 }, { row: 0, col: -1 }, { row: 3.5, col: 3 }]) {
      expect(reduceDraft(EMPTY_DRAFT, { type: 'selectTarget', cell: bad }, ctx).notice).toBe('TARGET_NOT_LEGAL');
    }
  });

  it('the engine accepts a PLACE exactly on the cells that legalCellsFor lists (all 64 cells)', () => {
    const state = start();
    const card = state.hands.P0[0] as CardId;
    const legal = new Set(legalCellsFor(viewFor(state, 'P0')).map(key));
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const result = reduce(state, { type: 'PLACE', player: 'P0', card, pos: { row, col }, orientation: 0 });
        expect(result.ok, `${row},${col}`).toBe(legal.has(`${row},${col}`));
      }
    }
  });

  it('a cell that shares two edges with placed cards is legal (C3 after D3 and C4)', () => {
    let state = start();
    state = place(state, 'P0', 'D3');
    state = place(state, 'P1', 'C4');
    const seat = state.turn;
    const view = viewFor(state, seat);
    expect(view.phase).toBe('PLACEMENT');
    const legal = legalCellsFor(view).map(key);
    expect(legal).toContain(key(cell('C3'))); // north of C4 and west of D3: two shared edges
    expect(legal).not.toContain(key(cell('D3'))); // occupied now
    expect(legal).not.toContain(key(cell('C4')));
    // a cell that touches only diagonally after these placements: B2 touches nothing; C2... only C3 is empty between
    expect(legal).not.toContain(key(cell('B2')));
    const card = state.hands[seat][0] as CardId;
    expect(reduce(state, { type: 'PLACE', player: seat, card, pos: cell('C3'), orientation: 0 }).ok).toBe(true);
    expect(reduceDraft(EMPTY_DRAFT, { type: 'selectTarget', cell: cell('C3') }, ctxFor(view)).draft.target).toEqual(cell('C3'));
  });
});

describe('draftContextFor', () => {
  it('lists the legal cells of the view and the own Hand while it is the viewer\'s PLACEMENT turn', () => {
    const ctx = draftContextFor(initialView, {});
    expect([...ctx.legal].sort()).toEqual(INITIAL_LEGAL.map((n) => cellKey(cell(n))).sort());
    expect(ctx.hand).toEqual(initialView.myHand);
  });

  it('is empty (no cells, no Hand) when it is not the viewer\'s turn or phase, so no draft can start', () => {
    const notTurn = { ...initialView, turn: 'P1' as const };
    const wrongPhase = { ...initialView, phase: 'REVEAL' as const };
    for (const view of [notTurn, wrongPhase]) {
      const ctx = draftContextFor(view, {});
      expect(ctx.legal.size).toBe(0);
      expect(ctx.hand).toEqual([]);
      const card = initialView.myHand[0] as CardId;
      expect(reduceDraft(EMPTY_DRAFT, { type: 'selectCard', card }, ctx).draft).toBe(EMPTY_DRAFT);
    }
  });
});

describe('acceptance 8 (draft side): validateDraft against the latest view', () => {
  const rotation = rotationFor(initialView.myHand);
  const card = initialView.myHand[0] as CardId;
  const good: PlacementDraft = { target: cell('C4'), card, orientation: 0 };

  it('accepts a valid draft and returns the Action fields', () => {
    expect(validateDraft(good, initialView, rotation)).toEqual({ ok: true, place: { card, pos: cell('C4'), orientation: 0 } });
  });

  it('refuses an incomplete draft: NO_CARD before NO_TARGET', () => {
    expect(validateDraft(EMPTY_DRAFT, initialView, rotation)).toEqual({ ok: false, issue: 'NO_CARD' });
    expect(validateDraft({ ...good, target: null }, initialView, rotation)).toEqual({ ok: false, issue: 'NO_TARGET' });
    expect(validateDraft({ ...good, card: null }, initialView, rotation)).toEqual({ ok: false, issue: 'NO_CARD' });
  });

  it('refuses a stale draft: phase, turn, Hand and target changes', () => {
    expect(validateDraft(good, { ...initialView, phase: 'GUESS_COLLECT' }, rotation)).toEqual({ ok: false, issue: 'WRONG_PHASE' });
    expect(validateDraft(good, { ...initialView, turn: 'P2' }, rotation)).toEqual({ ok: false, issue: 'NOT_VIEWER_TURN' });
    expect(validateDraft(good, { ...initialView, myHand: initialView.myHand.slice(1) }, rotation)).toEqual({ ok: false, issue: 'CARD_NOT_IN_HAND' });
    // the target became occupied: the view of the seat whose turn it is after C4 was placed
    const after = place(start(), 'P0', 'C4');
    const next = viewFor(after, after.turn);
    const stale: PlacementDraft = { target: cell('C4'), card: next.myHand[0] as CardId, orientation: 0 };
    expect(validateDraft(stale, next, rotationFor(next.myHand))).toEqual({ ok: false, issue: 'TARGET_NOT_LEGAL' });
    // a cell that is not adjacent to anything
    expect(validateDraft({ ...good, target: cell('A1') }, initialView, rotation)).toEqual({ ok: false, issue: 'TARGET_NOT_LEGAL' });
  });

  it('refuses 180 degrees for a card without capability, accepts it with, and refuses 90 or 270 always', () => {
    const view = { ...initialView, myHand: [heartCard, clubCard] as CardId[] };
    const info = rotationFor(view.myHand);
    expect(validateDraft({ target: cell('C4'), card: heartCard, orientation: 180 }, view, info)).toEqual({ ok: false, issue: 'ROTATION_NOT_MEANINGFUL' });
    expect(validateDraft({ target: cell('C4'), card: clubCard, orientation: 180 }, view, info).ok).toBe(true);
    expect(validateDraft({ target: cell('C4'), card: clubCard, orientation: 90 as Orientation }, view, info)).toEqual({ ok: false, issue: 'ROTATION_NOT_MEANINGFUL' });
    expect(validateDraft({ target: cell('C4'), card: clubCard, orientation: 180 }, view, {})).toEqual({ ok: false, issue: 'ROTATION_NOT_MEANINGFUL' });
  });

  it('maps issues to engine ErrorCodes where one exists', () => {
    expect(errorCodeForIssue('WRONG_PHASE')).toBe('WRONG_PHASE');
    expect(errorCodeForIssue('NOT_VIEWER_TURN')).toBe('NOT_YOUR_TURN');
    expect(errorCodeForIssue('CARD_NOT_IN_HAND')).toBe('CARD_NOT_IN_HAND');
    for (const issue of ['NO_CARD', 'NO_TARGET', 'TARGET_NOT_LEGAL', 'ROTATION_NOT_MEANINGFUL'] as const) {
      expect(errorCodeForIssue(issue), issue).toBeNull();
    }
  });
});
