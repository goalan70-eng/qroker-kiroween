// Tests of the Hand component (task 17.3). Evidence classes (design.md, "Testing Strategy"):
//   * model     : `handModel` and the pure helpers over real `PlayerView`s (newGame + viewFor). Node only.
//   * fake-DOM  : `renderHand` and the drag ghost against the hand-written fake Document of ui/testing/fake-dom.ts with
//                 synthetic events. NOT a browser: no layout, no real focus, no touch.
//   * source    : the style sources hand.css, board.css, tokens.css, card.css, placement.css and shell.css are read as
//                 text and scanned (no CSS engine is involved).
// Nothing here is emulated touch or a real-device result; real touch behaviour stays unverified (see the task notes).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { reduce } from '../../core/engine';
import { defaultConfig, newGame } from '../../core/state';
import type { GameState } from '../../core/state';
import type { CardId, PlayerId } from '../../core/types';
import { viewFor } from '../../core/view';
import type { PlayerView } from '../../core/view';
import { resetLanguage, setLanguage, t } from '../../i18n';
import type { Lang, StringKey } from '../../i18n';
import { EMPTY_DRAFT } from '../placement-draft';
import type { DraftEvent, PlacementDraft } from '../placement-draft';
import { asFake, classesOf, elementsOf, FakeDocument } from '../testing/fake-dom';
import type { FakeEl } from '../testing/fake-dom';
import {
  dragGhostFace,
  dragGhostStyle,
  HAND_STRING_KEYS,
  handCardName,
  handIndexFromTarget,
  handModel,
  isPlacementTurn,
  moveDragGhost,
  renderDragGhost,
  renderHand,
} from './hand';
import type { HandHandlers, HandModel } from './hand';

afterEach(() => resetLanguage());

// ---------------------------------------------------------------------------------------------------------
// Independent tables and helpers (literals, not read from the implementation)
// ---------------------------------------------------------------------------------------------------------

const CARD_ID_TOKEN = /\b[HDCS]-(?:10|[2-9AJQK])\b/;
const HANGUL = /[\uAC00-\uD7A3]/;
const SUIT_WORD_EN = { H: 'Hearts', D: 'Diamonds', C: 'Clubs', S: 'Spades' } as const;
const FACE_WORD_EN = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' } as const;

function expectedHandName(card: CardId, selected: boolean): string {
  const [suit, rank] = card.split('-') as [keyof typeof SUIT_WORD_EN, string];
  const rankWord = rank in FACE_WORD_EN ? FACE_WORD_EN[rank as keyof typeof FACE_WORD_EN] : rank;
  const base = `${rankWord} of ${SUIT_WORD_EN[suit]}, upright (0°), owner: You`;
  return selected ? `${base}, selected` : base;
}

function start(seed: number): GameState {
  const created = newGame({ seed, config: defaultConfig() });
  if (!created.ok) throw new Error(`newGame failed: ${created.error.code}`);
  return created.value;
}

const asView = (state: GameState, viewer: PlayerId = 'P0'): PlayerView => viewFor(state, viewer);
const INITIAL = asView(start(1), 'P0');
const OTHER_SEAT = asView(start(1), 'P1');

/** The viewer's own Hand card at `i` (the hand is never empty at the start). */
const handCard = (view: PlayerView, i: number): CardId => view.myHand[i] as CardId;

// ---------------------------------------------------------------------------------------------------------
// handModel (model)
// ---------------------------------------------------------------------------------------------------------

describe('handModel [model]', () => {
  it('has exactly the viewer\'s own cards in canonical order, with opaque indexes 0..n-1', () => {
    expect(INITIAL.myHand.length).toBeGreaterThan(0);
    const m = handModel(INITIAL, EMPTY_DRAFT, 'You');
    expect(m.viewer).toBe('P0');
    expect(m.cards.map((c) => c.index)).toEqual(INITIAL.myHand.map((_, i) => i));
    INITIAL.myHand.forEach((card, i) => expect(m.cardOf(i)).toBe(card));
    // another seat sees its own cards only: no card of P0's Hand is in the model of P1 (a Hand holds distinct cards)
    const p1 = handModel(OTHER_SEAT, EMPTY_DRAFT, 'You');
    expect(p1.viewer).toBe('P1');
    expect(p1.cards).toHaveLength(OTHER_SEAT.myHand.length);
    const p1Cards = p1.cards.map((c) => p1.cardOf(c.index));
    expect(p1Cards).toEqual([...OTHER_SEAT.myHand]);
    for (const card of INITIAL.myHand) expect(p1Cards).not.toContain(card);
  });

  it('maps only valid indexes back to a card', () => {
    const m = handModel(INITIAL, EMPTY_DRAFT, 'You');
    for (const bad of [-1, m.cards.length, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(m.cardOf(bad), String(bad)).toBeNull();
  });

  it('serializes without any CardId (the index is the only card reference) and keeps the face of an own card', () => {
    const m = handModel(INITIAL, { target: null, card: handCard(INITIAL, 1), orientation: 0 }, 'You');
    const json = JSON.stringify(m);
    expect(json).not.toMatch(CARD_ID_TOKEN);
    for (const c of m.cards) {
      expect(c.face.faceUp).toBe(true);
      expect(c.face.owner).toBe('P0');
      expect(c.face.size).toBe('hand');
      expect(c.face.orientation).toBe(0);
      expect(c.focusKey).toBe(`hand-${c.index}`);
      expect(c.className).not.toMatch(CARD_ID_TOKEN);
    }
  });

  it('marks exactly the draft card as selected, and no card for an empty draft', () => {
    const none = handModel(INITIAL, EMPTY_DRAFT, 'You');
    expect(none.cards.some((c) => c.selected)).toBe(false);
    const m = handModel(INITIAL, { target: { row: 3, col: 2 }, card: handCard(INITIAL, 2), orientation: 0 }, 'You');
    expect(m.cards.map((c) => c.selected)).toEqual(INITIAL.myHand.map((_, i) => i === 2));
    expect(m.cards[2]?.nameKey).toBe('hand.card.name.selected');
    expect(m.cards[2]?.className).toContain('is-selected');
    expect(m.cards[0]?.nameKey).toBeNull(); // an unselected card is named by its face alone
    // a draft card that is not in the Hand selects nothing
    const outside = (['H-A', 'D-A', 'C-A', 'S-A'] as const).find((c) => !INITIAL.myHand.includes(c)) as CardId;
    expect(handModel(INITIAL, { target: null, card: outside, orientation: 0 }, 'You').cards.some((c) => c.selected)).toBe(false);
  });

  it('is enabled and draggable on the viewer\'s PLACEMENT turn only', () => {
    const on = handModel(INITIAL, EMPTY_DRAFT, 'You');
    expect(isPlacementTurn(INITIAL)).toBe(true);
    expect(on.disabled).toBe(false);
    expect(on.cards.every((c) => !c.disabled && c.className.includes('hand-card--draggable'))).toBe(true);

    expect(isPlacementTurn(OTHER_SEAT)).toBe(false); // an AI turn for P1's own view: turn is P0
    const off = handModel(OTHER_SEAT, EMPTY_DRAFT, 'You');
    expect(off.disabled).toBe(true);
    expect(off.cards.every((c) => c.disabled && !c.className.includes('hand-card--draggable') && c.className.includes('is-disabled'))).toBe(true);

    // a phase other than PLACEMENT disables the Hand even for the seat whose turn it is
    const guessing: PlayerView = { ...INITIAL, phase: 'GUESS_COLLECT' };
    expect(handModel(guessing, EMPTY_DRAFT, 'You').disabled).toBe(true);
  });

  it('does not change its inputs', () => {
    const before = JSON.stringify(INITIAL);
    const draft: PlacementDraft = { target: { row: 3, col: 2 }, card: handCard(INITIAL, 0), orientation: 0 };
    const draftBefore = JSON.stringify(draft);
    handModel(INITIAL, draft, 'You');
    expect(JSON.stringify(INITIAL)).toBe(before);
    expect(JSON.stringify(draft)).toBe(draftBefore);
  });
});

describe('hand card names [model]', () => {
  it('are the localized face name of the own card, with the selected state, in English and Korean', () => {
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      const m = handModel(INITIAL, { target: null, card: handCard(INITIAL, 0), orientation: 0 }, t('common.seat.human'));
      m.cards.forEach((c) => {
        const name = handCardName(c, t);
        expect(name.length).toBeGreaterThan(0);
        expect(name).not.toMatch(/\{|\}|hand\.|cards\.|common\./);
        if (lang === 'ko') expect(HANGUL.test(name)).toBe(true);
        else expect(name).toBe(expectedHandName(handCard(INITIAL, c.index), c.selected));
      });
    }
  });

  it('has a string for every key the module uses, in both languages', () => {
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      for (const key of HAND_STRING_KEYS) expect(t(key as StringKey, {}), `${lang} ${key}`).not.toBe(key);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// renderHand (fake-DOM)
// ---------------------------------------------------------------------------------------------------------

interface Spies {
  readonly events: DraftEvent[];
  confirm: number;
  dispatch: number;
  readonly handlers: HandHandlers;
}

function spies(): Spies {
  const s: Spies = {
    events: [],
    confirm: 0,
    dispatch: 0,
    handlers: {
      draftEvent: (e) => void s.events.push(e),
      // Extra members that the Hand must never reach (they sit on the object it receives).
      ...({ confirmPlacement: () => void s.confirm++, dispatch: () => void s.dispatch++ } as object),
    } as HandHandlers,
  };
  return s;
}

interface Mounted {
  readonly doc: FakeDocument;
  readonly root: FakeEl;
  readonly buttons: FakeEl[];
  readonly spy: Spies;
  readonly model: HandModel;
}

function mount(view: PlayerView, opts: { draft?: PlacementDraft; lang?: Lang } = {}): Mounted {
  setLanguage(opts.lang ?? 'en');
  const doc = new FakeDocument();
  const spy = spies();
  const model = handModel(view, opts.draft ?? EMPTY_DRAFT, t('common.seat.human'));
  const root = asFake(renderHand(doc as unknown as Document, model, t, spy.handlers));
  doc.body.appendChild(root);
  return { doc, root, buttons: elementsOf(root).filter((e) => e.tagName === 'button'), spy, model };
}

describe('renderHand [fake-DOM]', () => {
  it('is a labelled group with one real button per own card', () => {
    for (const lang of ['en', 'ko'] as const) {
      const m = mount(INITIAL, { lang });
      expect(m.root.getAttribute('role')).toBe('group');
      expect((m.root.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0);
      expect(m.buttons).toHaveLength(INITIAL.myHand.length);
      expect(elementsOf(m.root).filter((e) => e.tagName === 'button')).toHaveLength(INITIAL.myHand.length);
      m.buttons.forEach((b, i) => {
        expect(b.getAttribute('type')).toBe('button');
        expect(b.getAttribute('data-hand-index')).toBe(String(i));
        expect(b.getAttribute('data-focus-key')).toBe(`hand-${i}`);
        const name = b.getAttribute('aria-label') ?? '';
        expect(name.length, `${lang} ${i}`).toBeGreaterThan(0);
        expect(name).not.toMatch(/\{|\}|hand\.|cards\.|common\./);
        if (lang === 'ko') expect(HANGUL.test(name)).toBe(true);
        else expect(name).toBe(expectedHandName(handCard(INITIAL, i), false));
        expect(classesOf(b)).toEqual(expect.arrayContaining(['hand-card', 'hand-card--draggable']));
        // the face component is inside, hidden from assistive technology (the button carries the name)
        const wrapper = b.children[0] as FakeEl;
        expect(wrapper.getAttribute('aria-hidden')).toBe('true');
        expect(classesOf(wrapper.children[0] as FakeEl)).toEqual(expect.arrayContaining(['card-face', 'card-face--hand', 'card-face--up']));
      });
    }
  });

  it('reflects the selected card in aria-pressed, the name and the class', () => {
    const m = mount(INITIAL, { draft: { target: null, card: handCard(INITIAL, 1), orientation: 0 } });
    expect(m.buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(INITIAL.myHand.map((_, i) => (i === 1 ? 'true' : 'false')));
    expect(m.buttons[1]?.getAttribute('aria-label')).toBe(expectedHandName(handCard(INITIAL, 1), true));
    expect(classesOf(m.buttons[1] as FakeEl)).toContain('is-selected');
    expect(m.buttons.filter((b) => classesOf(b).includes('is-selected'))).toHaveLength(1);
  });

  it('puts no CardId, no data-card, no title and no native drag source in the DOM (only the own accessible names say the card)', () => {
    for (const draft of [EMPTY_DRAFT, { target: { row: 3, col: 2 }, card: handCard(INITIAL, 0), orientation: 0 } as PlacementDraft]) {
      for (const view of [INITIAL, OTHER_SEAT]) {
        const m = mount(view, { draft });
        for (const e of elementsOf(m.root)) {
          for (const [name, value] of e.attributes) {
            expect(value, `${name}=${value}`).not.toMatch(CARD_ID_TOKEN);
            expect(['data-card', 'title'], name).not.toContain(name);
            if (name === 'draggable') expect([e.tagName, value]).toEqual(['img', 'false']);
            if (name !== 'aria-label') expect(value, `${name}=${value}`).not.toMatch(/[♥♦♣♠]|Hearts|Diamonds|Clubs|Spades|Ace|Jack|Queen|King/);
          }
          expect(e.textContent).not.toMatch(CARD_ID_TOKEN);
        }
        // only data-hand-index and data-focus-key (an index) identify a card element, plus the face's public data
        const dataNames = new Set(elementsOf(m.root).flatMap((e) => [...e.attributes.keys()]).filter((n) => n.startsWith('data-')));
        expect([...dataNames].sort()).toEqual(['data-face', 'data-focus-key', 'data-hand-index', 'data-orientation', 'data-owner']);
      }
    }
  });

  it('a click sends selectCard for that card exactly once, and nothing else', () => {
    const m = mount(INITIAL);
    (m.buttons[2] as FakeEl).fire('click');
    expect(m.spy.events).toEqual([{ type: 'selectCard', card: handCard(INITIAL, 2) }]);
    expect(m.spy.confirm + m.spy.dispatch).toBe(0);
  });

  it('Enter and Space select the card once each, stop the native click, and ignore a held key', () => {
    for (const key of ['Enter', ' ']) {
      const m = mount(INITIAL);
      const down = (m.buttons[0] as FakeEl).fire('keydown', { key });
      expect(down.defaultPrevented, key).toBe(true);
      expect(m.spy.events, key).toEqual([{ type: 'selectCard', card: handCard(INITIAL, 0) }]);
      (m.buttons[0] as FakeEl).fire('keydown', { key, repeat: true });
      expect(m.spy.events, `${key} repeat`).toHaveLength(1);
      expect(m.spy.confirm + m.spy.dispatch).toBe(0);
    }
    const m = mount(INITIAL);
    for (const key of ['a', 'Tab', 'Escape', 'ArrowRight']) expect((m.buttons[0] as FakeEl).fire('keydown', { key }).defaultPrevented, key).toBe(false);
    expect((m.buttons[0] as FakeEl).fire('keydown', { key: 'Enter', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(m.spy.events).toEqual([]); // Escape belongs to the panel, not to the card
    // Space is also stopped on key up, so the browser sends no second click
    expect((m.buttons[0] as FakeEl).fire('keyup', { key: ' ' }).defaultPrevented).toBe(true);
    expect((m.buttons[0] as FakeEl).fire('keyup', { key: 'a' }).defaultPrevented).toBe(false);
  });

  it('a disabled Hand (off turn) has disabled buttons without the draggable class, and a stale listener sends nothing', () => {
    const m = mount(OTHER_SEAT);
    expect(m.buttons.length).toBeGreaterThan(0);
    for (const b of m.buttons) {
      expect(b.hasAttribute('disabled')).toBe(true);
      expect(classesOf(b)).not.toContain('hand-card--draggable');
      b.fire('click');
      b.fire('keydown', { key: 'Enter' });
    }
    expect(m.spy.events).toEqual([]);
  });

  it('shows a message for an empty Hand instead of buttons', () => {
    const empty: PlayerView = { ...INITIAL, myHand: [] };
    const m = mount(empty);
    expect(m.buttons).toHaveLength(0);
    expect(m.root.textContent.length).toBeGreaterThan(0);
  });

  it('is built with textContent and setAttribute only, without any HTML parsing, drag-and-drop API or card id in the source', () => {
    expect(() => mount(INITIAL)).not.toThrow(); // the fake throws on an HTML-string property
    const probe = new FakeDocument().createElement('div') as unknown as Record<string, unknown>;
    expect(() => probe['inner' + 'HTML']).toThrow();
    expect(() => void (probe['outer' + 'HTML'] = 'x')).toThrow();
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'hand.ts'), 'utf8');
    const code = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|DataTransfer|dataTransfer|dragstart|setData/);
    expect(code).not.toMatch(/['"]draggable['"]|\.draggable\b|\bdraggable\s*:/); // the class name 'hand-card--draggable' is fine
    expect(code).not.toMatch(/'title'|\btitle:|data-card/);
    expect(code).not.toMatch(/confirmPlacement|\bdispatch\b/);
  });
});

describe('handIndexFromTarget [model]', () => {
  const doc = new FakeDocument();
  const button = (index: string | null): FakeEl => {
    const el = doc.createElement('button');
    if (index !== null) el.setAttribute('data-hand-index', index);
    return el;
  };
  it('finds the index from the button and from an element inside it', () => {
    const b = button('3');
    const inner = doc.createElement('span');
    b.appendChild(inner);
    expect(handIndexFromTarget(b)).toBe(3);
    expect(handIndexFromTarget(inner)).toBe(3);
    expect(handIndexFromTarget(button('0'))).toBe(0);
  });
  it('is null for no element, an element without the attribute, and a malformed index', () => {
    expect(handIndexFromTarget(null)).toBeNull();
    expect(handIndexFromTarget(undefined)).toBeNull();
    expect(handIndexFromTarget({})).toBeNull();
    expect(handIndexFromTarget(button(null))).toBeNull();
    for (const bad of ['', '-1', '01', '1.5', 'a', '1000', ' 2']) expect(handIndexFromTarget(button(bad)), bad).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------
// Drag ghost (model + fake-DOM)
// ---------------------------------------------------------------------------------------------------------

describe('drag ghost', () => {
  it('shows the own card face upright, or rotated when it is the drafted card, and nothing else', () => {
    const card = handCard(INITIAL, 0);
    const plain = dragGhostFace(INITIAL, EMPTY_DRAFT, card, 'You');
    expect(plain.orientation).toBe(0);
    expect(plain.faceUp).toBe(true);
    expect(plain.owner).toBe('P0');
    const rotated = dragGhostFace(INITIAL, { target: null, card, orientation: 180 }, card, 'You');
    expect(rotated.orientation).toBe(180);
    const other = dragGhostFace(INITIAL, { target: null, card, orientation: 180 }, handCard(INITIAL, 1), 'You');
    expect(other.orientation).toBe(0); // a different card does not inherit the rotation
    expect(JSON.stringify(plain)).not.toMatch(CARD_ID_TOKEN);
  });

  it('is an aria-hidden [data-drag-overlay] wrapper with a card face, a transform style, and no drag-and-drop attribute', () => {
    setLanguage('en');
    const doc = new FakeDocument();
    const face = dragGhostFace(INITIAL, EMPTY_DRAFT, handCard(INITIAL, 0), 'You');
    const ghost = asFake(renderDragGhost(doc as unknown as Document, face, t, 120.4, 80.6));
    expect(ghost.hasAttribute('data-drag-overlay')).toBe(true);
    expect(ghost.getAttribute('aria-hidden')).toBe('true');
    expect(classesOf(ghost)).toContain('drag-overlay');
    expect(ghost.getAttribute('style')).toBe('transform: translate(120px, 81px) translate(-50%, -50%)');
    expect(ghost.hasAttribute('draggable')).toBe(false);
    expect(ghost.children).toHaveLength(1);
    expect(classesOf(ghost.children[0] as FakeEl)).toContain('card-face');
    for (const e of elementsOf(ghost)) for (const [name, value] of e.attributes) expect(value, name).not.toMatch(CARD_ID_TOKEN);
    // hit testing treats it as no cell
    expect(ghost.closest('[data-drag-overlay]')).toBe(ghost);
    moveDragGhost(ghost as unknown as HTMLElement, 5, 7);
    expect(ghost.getAttribute('style')).toBe('transform: translate(5px, 7px) translate(-50%, -50%)');
  });

  it('keeps a bad coordinate out of the style', () => {
    expect(dragGhostStyle(Number.NaN, Number.POSITIVE_INFINITY)).toBe('transform: translate(0px, 0px) translate(-50%, -50%)');
  });
});

// ---------------------------------------------------------------------------------------------------------
// hand.css and the touch-action rule (source)
// ---------------------------------------------------------------------------------------------------------

const STYLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'styles');
const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const read = (path: string): string => readFileSync(path, 'utf8');

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
const handCss = read(join(STYLES_DIR, 'hand.css'));
const HAND_RULES = rulesOf(handCss);
const handRule = (selector: string): string => {
  const found = HAND_RULES.find((r) => r.selector === selector);
  if (found === undefined) throw new Error(`no rule for ${selector}`);
  return found.body;
};

describe('hand.css and touch-action [source]', () => {
  it('sets touch-action: none on the draggable Hand card class and on nothing else in the whole UI', () => {
    const withTouch = HAND_RULES.filter((r) => /touch-action/.test(r.body));
    expect(withTouch.map((r) => r.selector)).toEqual(['.hand-card--draggable']);
    expect(handRule('.hand-card--draggable')).toMatch(/touch-action:\s*none\s*;/);
    expect(handRule('.hand-card--draggable')).toMatch(/user-select:\s*none/);
    const others = [
      join(STYLES_DIR, 'board.css'),
      join(STYLES_DIR, 'tokens.css'),
      join(STYLES_DIR, 'card.css'),
      join(STYLES_DIR, 'placement.css'),
      join(UI_DIR, 'shell.css'),
    ];
    for (const file of others) expect(stripComments(read(file)), file).not.toMatch(/touch-action/);
    // and no script sets it either
    for (const file of ['components/hand.ts', 'components/placement-panel.ts', 'components/placement-controls.ts', 'components/board.ts', 'pointer-gesture.ts']) {
      expect(read(join(UI_DIR, file)).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''), file).not.toMatch(/touch-action|touchAction/);
    }
    expect(HAND_RULES.some((r) => /^(?:html|body|\*)\b/.test(r.selector))).toBe(false);
  });

  it('makes every Hand card at least --touch-min by --touch-min', () => {
    expect(handRule('.hand-card')).toMatch(/min-inline-size:\s*var\(--touch-min\)/);
    expect(handRule('.hand-card')).toMatch(/min-block-size:\s*var\(--touch-min\)/);
  });

  it('marks a selected card with a ring and a bar, not by colour alone, and a disabled card is not draggable by CSS either', () => {
    expect(handRule('.hand-card.is-selected')).toMatch(/outline:[^;]*solid/);
    expect(handRule('.hand-card.is-selected::after')).toMatch(/content:\s*""/);
    expect(HAND_RULES.some((r) => /is-disabled/.test(r.selector) && /touch-action/.test(r.body))).toBe(false);
  });

  it('declares every custom property that it reads, and has no url(), @import, http or font', () => {
    const defined = new Set([...stripComments(read(join(STYLES_DIR, 'tokens.css'))).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    for (const m of stripComments(handCss).matchAll(/var\(\s*(--[a-z0-9-]+)/g)) expect(defined.has(m[1] as string), m[1]).toBe(true);
    expect(handCss).not.toMatch(/url\(/i);
    expect(handCss).not.toMatch(/@import/i);
    expect(handCss).not.toMatch(/http/i);
    expect(handCss).not.toMatch(/@font-face/i);
  });

  it('keeps the class names that hand.ts writes in sync with the selectors', () => {
    const selectors = HAND_RULES.map((r) => r.selector).join(' ');
    for (const cls of ['hand', 'hand-card', 'hand-card--draggable', 'hand-card__face', 'hand-empty', 'is-selected', 'is-disabled']) {
      expect(selectors, cls).toContain(`.${cls}`);
    }
  });
});

// A reducer sanity check so the Hand tests are tied to the real game: the Hand cards are playable cards of the engine.
describe('the Hand cards are the engine\'s own Hand [model]', () => {
  it('a card of the model is accepted by the engine at a legal cell for the viewer', () => {
    const state = start(1);
    const view = viewFor(state, 'P0');
    const m = handModel(view, EMPTY_DRAFT, 'You');
    const card = m.cardOf(0) as CardId;
    const result = reduce(state, { type: 'PLACE', player: 'P0', card, pos: { row: 3, col: 2 }, orientation: 0 });
    expect(result.ok).toBe(true);
  });
});
