// Tests of the placement controls (task 17.3). Evidence classes (design.md, "Testing Strategy"):
//   * model     : `controlsModel` and `controlsStatusText` over real `PlayerView`s, and the rotation table over all 52
//                 cards (the real `rotationChangesCorners` of core/fragment-layout, compared with an independent
//                 literal: clubs and spades turn, hearts and diamonds do not). Node only.
//   * fake-DOM  : `renderPlacementControls` against the hand-written fake Document of ui/testing/fake-dom.ts with
//                 synthetic click events. NOT a browser: no layout, no real focus, no touch.
//   * source    : placement.css is read as text and scanned (no CSS engine is involved).
// Nothing here is emulated touch or a real-device result; real touch behaviour stays unverified.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../../core/cards';
import { rotationChangesCorners } from '../../core/fragment-layout';
import { defaultConfig, newGame } from '../../core/state';
import type { GameState } from '../../core/state';
import type { CardId } from '../../core/types';
import { viewFor } from '../../core/view';
import type { PlayerView } from '../../core/view';
import { resetLanguage, setLanguage, t } from '../../i18n';
import type { Lang, StringKey } from '../../i18n';
import { EMPTY_DRAFT } from '../placement-draft';
import type { DraftEvent, PlacementDraft, RotationInfoMap } from '../placement-draft';
import { asFake, classesOf, elementsOf, FakeDocument } from '../testing/fake-dom';
import type { FakeEl } from '../testing/fake-dom';
import { CONTROLS_STRING_KEYS, controlsModel, controlsStatusText, renderPlacementControls } from './placement-controls';
import type { ControlsHandlers, ControlsModel } from './placement-controls';

afterEach(() => resetLanguage());

// ---------------------------------------------------------------------------------------------------------
// Fixtures and independent tables
// ---------------------------------------------------------------------------------------------------------

const HANGUL = /[\uAC00-\uD7A3]/;
const CARD_ID_TOKEN = /\b[HDCS]-(?:10|[2-9AJQK])\b/;
/** Independent oracle for the rotation capability: only clubs and spades have different corners at 0 and 180. */
const TURNS = (card: CardId): boolean => card.startsWith('C-') || card.startsWith('S-');

function start(seed: number): GameState {
  const created = newGame({ seed, config: defaultConfig() });
  if (!created.ok) throw new Error(`newGame failed: ${created.error.code}`);
  return created.value;
}

const BASE: PlayerView = viewFor(start(1), 'P0');
const CELL = { row: 3, col: 2 } as const;

/** The base view with a one-card Hand (plain data; views are plain data). */
const withHand = (...cards: CardId[]): PlayerView => ({ ...BASE, myHand: cards });
const draftOf = (card: CardId | null, target: PlacementDraft['target'], orientation: 0 | 180 = 0): PlacementDraft => ({ card, target, orientation });
const realInfo = (view: PlayerView): RotationInfoMap =>
  Object.fromEntries(view.myHand.map((c) => [c, { rotationChangesCorners: rotationChangesCorners(c) }]));
const model = (view: PlayerView, draft: PlacementDraft, info: RotationInfoMap = realInfo(view), error: { message: string } | null = null): ControlsModel =>
  controlsModel(view, draft, info, error);

const FIRST = (suit: 'H' | 'D' | 'C' | 'S'): CardId => ALL_CARDS.find((c) => c.startsWith(`${suit}-`)) as CardId;
const CLUB = FIRST('C');
const SPADE = FIRST('S');
const HEART = FIRST('H');
const DIAMOND = FIRST('D');

// ---------------------------------------------------------------------------------------------------------
// controlsModel [model]
// ---------------------------------------------------------------------------------------------------------

describe('rotation visibility [model]', () => {
  it('is offered for every club and spade and for no heart or diamond, over all 52 cards', () => {
    expect(ALL_CARDS).toHaveLength(52);
    let shown = 0;
    for (const card of ALL_CARDS) {
      const view = withHand(card);
      const m = model(view, draftOf(card, CELL));
      expect(m.showRotation, card).toBe(TURNS(card));
      expect(rotationChangesCorners(card), `real helper for ${card}`).toBe(TURNS(card));
      if (m.showRotation) shown++;
      // a rotated draft of a club or spade says so; a hearts/diamonds draft never reports a rotation
      expect(model(view, draftOf(card, CELL, 180)).rotated, `${card} at 180`).toBe(TURNS(card));
    }
    expect(shown).toBe(26);
  });

  it('is absent with no card, with a missing or false capability, and for a card that is not in the viewer\'s Hand', () => {
    const view = withHand(CLUB, HEART);
    expect(model(view, EMPTY_DRAFT).showRotation).toBe(false);
    expect(model(view, draftOf(null, CELL)).showRotation).toBe(false);
    expect(model(view, draftOf(CLUB, CELL), {}).showRotation).toBe(false); // unknown card: no capability
    expect(model(view, draftOf(CLUB, CELL), { [CLUB]: { rotationChangesCorners: false } }).showRotation).toBe(false);
    expect(model(view, draftOf(HEART, CELL), { [HEART]: { rotationChangesCorners: false } }).showRotation).toBe(false);
    // a card of another seat is not in `myHand`: even with a capability entry there is no control
    const foreign = draftOf(SPADE, CELL);
    expect(model(view, foreign, { [SPADE]: { rotationChangesCorners: true } }).showRotation).toBe(false);
  });

  it('is offered while only the card is chosen, and after a target is chosen too', () => {
    const view = withHand(CLUB, HEART);
    expect(model(view, draftOf(CLUB, null)).showRotation).toBe(true);
    expect(model(view, draftOf(CLUB, CELL)).showRotation).toBe(true);
    expect(model(view, draftOf(CLUB, CELL, 180)).rotated).toBe(true);
    expect(model(view, draftOf(CLUB, CELL, 0)).rotated).toBe(false);
  });
});

describe('confirm and cancel availability [model]', () => {
  const view = withHand(CLUB, HEART);
  const cases: readonly [string, PlacementDraft, ControlsModel['state'], boolean, boolean][] = [
    ['no card, no target', EMPTY_DRAFT, 'IDLE', false, false],
    ['target only', draftOf(null, CELL), 'TARGET_SELECTED', false, true],
    ['card only', draftOf(CLUB, null), 'CARD_SELECTED', false, true],
    ['card and target', draftOf(CLUB, CELL), 'PREVIEW', true, true],
    ['heart and target', draftOf(HEART, CELL), 'PREVIEW', true, true],
  ];
  for (const [label, draft, state, confirm, cancel] of cases) {
    it(`${label}: ${state}, confirm ${confirm ? 'enabled' : 'disabled'}, cancel ${cancel ? 'enabled' : 'disabled'}`, () => {
      const m = model(view, draft);
      expect(m.state).toBe(state);
      expect(m.active).toBe(true);
      expect(m.canConfirm).toBe(confirm);
      expect(m.canCancel).toBe(cancel);
    });
  }

  it('shows the hint of the draft state', () => {
    expect(cases.map(([, draft]) => model(view, draft).statusKey)).toEqual([
      'hand.hint.idle',
      'hand.hint.target',
      'hand.hint.card',
      'hand.hint.preview',
      'hand.hint.preview',
    ]);
  });

  it('follows the draft that it is given: a new card replaces the old one and an empty draft hides the rotation', () => {
    expect(model(view, draftOf(CLUB, CELL, 180)).showRotation).toBe(true);
    expect(model(view, draftOf(HEART, CELL, 0)).showRotation).toBe(false); // the reducer resets 180 on a new card; the model shows the draft
    expect(model(view, EMPTY_DRAFT).showRotation).toBe(false);
  });
});

describe('disabled state [model]', () => {
  const draft = draftOf(CLUB, CELL);
  const aiTurn: PlayerView = { ...BASE, turn: 'P2' };

  it('names the active AI seat and disables everything while an AI seat plays', () => {
    for (const [turn, n] of [['P1', 1], ['P2', 2], ['P3', 3]] as const) {
      const view: PlayerView = { ...BASE, turn };
      const m = model(view, draft);
      expect(m.active).toBe(false);
      expect(m.statusKey).toBe('hand.status.ai');
      expect(m.seat).toEqual({ kind: 'ai', n });
      expect([m.showRotation, m.canConfirm, m.canCancel]).toEqual([false, false, false]);
      setLanguage('en');
      expect(controlsStatusText(m, t)).toBe(`AI ${n} is playing`);
      setLanguage('ko');
      expect(controlsStatusText(m, t)).toBe(`AI ${n}의 차례입니다`);
    }
    expect(model(aiTurn, EMPTY_DRAFT).canConfirm).toBe(false);
  });

  it('numbers the AI seats by their order among the AI seats, and names another human seat as a player', () => {
    const seats = BASE.rules.seats.map((s) => (s.id === 'P1' ? { ...s, kind: 'HUMAN' as const } : s));
    const twoHumans: PlayerView = { ...BASE, rules: { ...BASE.rules, seats: seats as unknown as PlayerView['rules']['seats'] }, turn: 'P2' };
    const m = model(twoHumans, EMPTY_DRAFT);
    expect(m.seat).toEqual({ kind: 'ai', n: 1 }); // P2 is the first AI seat now
    const other: PlayerView = { ...twoHumans, turn: 'P1' };
    const o = model(other, EMPTY_DRAFT);
    expect(o.statusKey).toBe('hand.status.other');
    expect(o.seat).toEqual({ kind: 'player', n: 2 });
    setLanguage('en');
    expect(controlsStatusText(o, t)).toBe('Not your turn. Waiting for Player 2.');
    setLanguage('ko');
    expect(HANGUL.test(controlsStatusText(o, t))).toBe(true);
  });

  it('says that no card can be placed in a phase other than PLACEMENT, with no seat', () => {
    for (const phase of ['GUESS_COLLECT', 'REVEAL', 'ENDED'] as const) {
      const m = model({ ...BASE, phase }, draft);
      expect(m.active).toBe(false);
      expect(m.statusKey).toBe('hand.status.phase');
      expect(m.seat).toBeNull();
      expect([m.showRotation, m.canConfirm, m.canCancel]).toEqual([false, false, false]);
    }
  });

  it('every status text exists in both languages with no placeholder left', () => {
    const models = [
      model(BASE, EMPTY_DRAFT),
      model(BASE, draftOf(null, CELL)),
      model(withHand(CLUB), draftOf(CLUB, null)),
      model(withHand(CLUB), draftOf(CLUB, CELL)),
      model({ ...BASE, turn: 'P1' }, EMPTY_DRAFT),
      model({ ...BASE, phase: 'REVEAL' }, EMPTY_DRAFT),
    ];
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      for (const m of models) {
        const text = controlsStatusText(m, t);
        expect(text.length).toBeGreaterThan(0);
        expect(text, `${lang} ${m.statusKey}`).not.toMatch(/\{|\}|\bhand\.[a-z]/);
        if (lang === 'ko') expect(HANGUL.test(text)).toBe(true);
        expect(text).not.toMatch(CARD_ID_TOKEN);
      }
    }
  });
});

describe('error text [model]', () => {
  it('passes the controller\'s already localized message through, and is null without an error', () => {
    expect(model(BASE, EMPTY_DRAFT, {}, { message: 'That cell is already occupied.' }).errorText).toBe('That cell is already occupied.');
    expect(model(BASE, EMPTY_DRAFT, {}, null).errorText).toBeNull();
    // also shown while the controls are off (an AI error, for example)
    expect(model({ ...BASE, turn: 'P1' }, EMPTY_DRAFT, {}, { message: 'x' }).errorText).toBe('x');
  });

  it('does not change its inputs', () => {
    const before = JSON.stringify(BASE);
    const draft = draftOf(CLUB, CELL);
    const draftBefore = JSON.stringify(draft);
    model(withHand(CLUB), draft);
    expect(JSON.stringify(BASE)).toBe(before);
    expect(JSON.stringify(draft)).toBe(draftBefore);
  });
});

// ---------------------------------------------------------------------------------------------------------
// renderPlacementControls [fake-DOM]
// ---------------------------------------------------------------------------------------------------------

interface Spies {
  readonly events: DraftEvent[];
  confirm: number;
  dispatch: number;
  readonly handlers: ControlsHandlers;
}

function spies(): Spies {
  const s: Spies = {
    events: [],
    confirm: 0,
    dispatch: 0,
    handlers: {
      draftEvent: (e) => void s.events.push(e),
      confirmPlacement: () => void s.confirm++,
      ...({ dispatch: () => void s.dispatch++ } as object), // never reachable from the controls
    } as ControlsHandlers,
  };
  return s;
}

interface Mounted {
  readonly root: FakeEl;
  readonly spy: Spies;
  readonly model: ControlsModel;
  readonly buttons: FakeEl[];
}

function mount(view: PlayerView, draft: PlacementDraft, lang: Lang = 'en'): Mounted {
  setLanguage(lang);
  const doc = new FakeDocument();
  const spy = spies();
  const m = model(view, draft);
  const root = asFake(renderPlacementControls(doc as unknown as Document, m, t, spy.handlers));
  doc.body.appendChild(root);
  return { root, spy, model: m, buttons: elementsOf(root).filter((e) => e.tagName === 'button') };
}

const kinds = (m: Mounted): string[] =>
  m.buttons.map((b) => classesOf(b).find((c) => /^placement-button--/.test(c))?.replace('placement-button--', '') as string);
const byKind = (m: Mounted, kind: string): FakeEl => m.buttons[kinds(m).indexOf(kind)] as FakeEl;

describe('which controls exist [fake-DOM]', () => {
  const table: readonly [string, PlayerView, PlacementDraft, string[]][] = [
    ['a club', withHand(CLUB, HEART), draftOf(CLUB, CELL), ['rotate', 'confirm', 'cancel']],
    ['a spade', withHand(SPADE, HEART), draftOf(SPADE, CELL), ['rotate', 'confirm', 'cancel']],
    ['a heart', withHand(CLUB, HEART), draftOf(HEART, CELL), ['confirm', 'cancel']],
    ['a diamond', withHand(DIAMOND, SPADE), draftOf(DIAMOND, CELL), ['confirm', 'cancel']],
    ['no card (a target only)', withHand(CLUB, HEART), draftOf(null, CELL), ['confirm', 'cancel']],
    ['an empty draft', withHand(CLUB, HEART), EMPTY_DRAFT, ['confirm', 'cancel']],
    ['an AI turn with a stale club draft', { ...withHand(CLUB, HEART), turn: 'P1' }, draftOf(CLUB, CELL), ['confirm', 'cancel']],
  ];
  for (const [label, view, draft, expected] of table) {
    it(`${label}: ${expected.join(', ')}`, () => {
      expect(kinds(mount(view, draft))).toEqual(expected);
    });
  }

  it('has no rotation control anywhere in the DOM for a heart or a diamond (no node, class, attribute or text)', () => {
    for (const card of [HEART, DIAMOND, ...ALL_CARDS.filter((c) => !TURNS(c))]) {
      const m = mount(withHand(card), draftOf(card, CELL));
      expect(elementsOf(m.root).some((e) => classesOf(e).includes('placement-button--rotate'))).toBe(false);
      expect(elementsOf(m.root).some((e) => e.hasAttribute('aria-pressed'))).toBe(false);
      expect(m.root.textContent).not.toMatch(/Rotate|180/);
    }
  });

  it('shows the rotation control for every club and spade', () => {
    for (const card of ALL_CARDS.filter(TURNS)) expect(kinds(mount(withHand(card), draftOf(card, null))), card).toEqual(['rotate', 'confirm', 'cancel']);
  });

  it('is a labelled group of real type="button" buttons with non-empty localized names, in English and Korean', () => {
    for (const lang of ['en', 'ko'] as const) {
      const m = mount(withHand(CLUB), draftOf(CLUB, CELL), lang);
      expect(m.root.getAttribute('role')).toBe('group');
      expect((m.root.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0);
      expect(m.buttons).toHaveLength(3);
      for (const b of m.buttons) {
        expect(b.getAttribute('type')).toBe('button');
        expect(b.textContent.length).toBeGreaterThan(0);
        expect(b.textContent).not.toMatch(/\{|\}|hand\./);
        if (lang === 'ko') expect(HANGUL.test(b.textContent)).toBe(true);
      }
      expect((byKind(m, 'rotate').children[0] as FakeEl).textContent).toBe(lang === 'en' ? 'Rotate 180°' : '180° 회전');
      expect(byKind(m, 'confirm').textContent).toBe(lang === 'en' ? 'Confirm placement' : '배치 확정');
      expect(byKind(m, 'cancel').textContent).toBe(lang === 'en' ? 'Cancel' : '취소');
    }
  });

  it('has a string for every key the module uses, in both languages', () => {
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      for (const key of CONTROLS_STRING_KEYS) expect(t(key as StringKey, {}), `${lang} ${key}`).not.toBe(key);
    }
  });
});

describe('what the controls send [fake-DOM]', () => {
  it('the rotation button sends toggleRotation once per activation, reflects the orientation in aria-pressed, and sends nothing else', () => {
    const upright = mount(withHand(CLUB), draftOf(CLUB, CELL, 0));
    const rotated = mount(withHand(CLUB), draftOf(CLUB, CELL, 180));
    expect(byKind(upright, 'rotate').getAttribute('aria-pressed')).toBe('false');
    expect(byKind(rotated, 'rotate').getAttribute('aria-pressed')).toBe('true');
    expect(byKind(upright, 'rotate').children[1]?.textContent).toBe('0° (upright)');
    expect(byKind(rotated, 'rotate').children[1]?.textContent).toBe('180° (rotated)');
    byKind(upright, 'rotate').fire('click');
    expect(upright.spy.events).toEqual([{ type: 'toggleRotation' }]);
    byKind(upright, 'rotate').fire('click');
    expect(upright.spy.events).toHaveLength(2); // one event per activation
    expect(upright.spy.confirm + upright.spy.dispatch).toBe(0);
    // a rotation before a target exists is also allowed
    const cardOnly = mount(withHand(SPADE), draftOf(SPADE, null));
    byKind(cardOnly, 'rotate').fire('click');
    expect(cardOnly.spy.events).toEqual([{ type: 'toggleRotation' }]);
    expect(cardOnly.spy.confirm).toBe(0);
  });

  it('confirm calls confirmPlacement() once per activation, with no argument, and only in PREVIEW', () => {
    const ready = mount(withHand(HEART), draftOf(HEART, CELL));
    const confirm = byKind(ready, 'confirm');
    expect(confirm.hasAttribute('disabled')).toBe(false);
    confirm.fire('click');
    expect(ready.spy.confirm).toBe(1);
    expect(ready.spy.events).toEqual([]); // no draft event, no dispatch
    expect(ready.spy.dispatch).toBe(0);
    confirm.fire('click'); // two activations are two handler calls; the controller refuses the second (task 17.4)
    expect(ready.spy.confirm).toBe(2);

    for (const draft of [EMPTY_DRAFT, draftOf(null, CELL), draftOf(HEART, null)]) {
      const m = mount(withHand(HEART), draft);
      expect(byKind(m, 'confirm').hasAttribute('disabled')).toBe(true);
      byKind(m, 'confirm').fire('click'); // a stale listener
      expect(m.spy.confirm).toBe(0);
    }
    const ai = mount({ ...withHand(HEART), turn: 'P1' }, draftOf(HEART, CELL));
    expect(byKind(ai, 'confirm').hasAttribute('disabled')).toBe(true);
    byKind(ai, 'confirm').fire('click');
    expect(ai.spy.confirm).toBe(0);
  });

  it('cancel sends the cancel draft event once per activation, only while the draft is not empty, and never confirms', () => {
    const m = mount(withHand(CLUB), draftOf(CLUB, CELL));
    byKind(m, 'cancel').fire('click');
    expect(m.spy.events).toEqual([{ type: 'cancel' }]);
    expect(m.spy.confirm + m.spy.dispatch).toBe(0);
    const empty = mount(withHand(CLUB), EMPTY_DRAFT);
    expect(byKind(empty, 'cancel').hasAttribute('disabled')).toBe(true);
    byKind(empty, 'cancel').fire('click');
    expect(empty.spy.events).toEqual([]);
  });

  it('disables confirm and cancel while an AI seat plays', () => {
    const m = mount({ ...withHand(CLUB), turn: 'P3' }, draftOf(CLUB, CELL));
    expect(m.buttons.every((b) => b.hasAttribute('disabled'))).toBe(true);
    for (const b of m.buttons) b.fire('click');
    expect(m.spy.events).toEqual([]);
    expect(m.spy.confirm).toBe(0);
  });

  it('puts no CardId in any attribute or text', () => {
    const m = mount(withHand(CLUB), draftOf(CLUB, CELL, 180));
    for (const e of elementsOf(m.root)) {
      for (const [name, value] of e.attributes) expect(value, name).not.toMatch(CARD_ID_TOKEN);
      expect(e.textContent).not.toMatch(CARD_ID_TOKEN);
      expect(e.hasAttribute('title')).toBe(false);
    }
  });

  it('is built with setAttribute and textContent only, and has no dispatch path or HTML parsing in the source', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'placement-controls.ts'), 'utf8');
    const code = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|\.title\b|'title'/);
    expect(code).not.toMatch(/\bdispatch\b|explainTarget|touch-action|touchAction/);
    expect((code.match(/confirmPlacement\(\)/g) ?? []).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------
// placement.css [source]
// ---------------------------------------------------------------------------------------------------------

const STYLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'styles');
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const placementCss = readFileSync(join(STYLES_DIR, 'placement.css'), 'utf8');
const RULES = [...stripComments(placementCss).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selector: (m[1] as string).trim().replace(/\s+/g, ' '),
  body: m[2] as string,
}));
const rule = (selector: string): string => {
  const found = RULES.find((r) => r.selector === selector);
  if (found === undefined) throw new Error(`no rule for ${selector}`);
  return found.body;
};

describe('placement.css [source]', () => {
  it('makes every control at least --touch-min by --touch-min (min-block-size is the logical min-height)', () => {
    expect(rule('.placement-button')).toMatch(/min-block-size:\s*var\(--touch-min\)/);
    expect(rule('.placement-button')).toMatch(/min-inline-size:\s*var\(--touch-min\)/);
  });

  it('does not set touch-action anywhere, and styles no page-level element', () => {
    expect(stripComments(placementCss)).not.toMatch(/touch-action/);
    expect(RULES.some((r) => /^(?:html|body|\*)\b/.test(r.selector))).toBe(false);
  });

  it('fixes the drag overlay to the viewport with no pointer events, and the error line has a bar and a mark besides its colour', () => {
    expect(rule('.drag-overlay')).toMatch(/position:\s*fixed\s*;/);
    expect(rule('.drag-overlay')).toMatch(/pointer-events:\s*none\s*;/);
    expect(rule('.placement-overlay')).toMatch(/pointer-events:\s*none\s*;/);
    expect(rule('.placement-error')).toMatch(/border-inline-start:/);
    expect(rule('.placement-error::before')).toMatch(/content:\s*"! "/);
    expect(rule('.placement-button[aria-pressed="true"]')).toMatch(/box-shadow:\s*inset/); // the pressed state is a shape, not a colour
    expect(rule('.placement-button:disabled')).toMatch(/border-style:\s*dashed/);
  });

  it('declares every custom property that it reads, and has no url(), @import, http or font', () => {
    const defined = new Set([...stripComments(readFileSync(join(STYLES_DIR, 'tokens.css'), 'utf8')).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    for (const m of stripComments(placementCss).matchAll(/var\(\s*(--[a-z0-9-]+)/g)) expect(defined.has(m[1] as string), m[1]).toBe(true);
    expect(placementCss).not.toMatch(/url\(/i);
    expect(placementCss).not.toMatch(/@import/i);
    expect(placementCss).not.toMatch(/http/i);
    expect(placementCss).not.toMatch(/@font-face/i);
  });

  it('keeps the class names that the components write in sync with the selectors', () => {
    const selectors = RULES.map((r) => r.selector).join(' ');
    for (const cls of [
      'placement-panel',
      'placement-status',
      'placement-board',
      'placement-hand',
      'placement-controls-slot',
      'placement-controls',
      'placement-button',
      'placement-button--confirm',
      'placement-button__state',
      'placement-error',
      'placement-live',
      'placement-overlay',
      'drag-overlay',
    ]) {
      expect(selectors, cls).toContain(`.${cls}`);
    }
  });
});
