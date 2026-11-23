// Tests of the rules and help overlay (task 19.3; requirements 16.1, 16.2). Evidence class: fake-DOM tests (no real
// browser, no real screen reader, no real focus ring). The help takes a view-free input, so the privacy tests are about
// the text it ships and the DOM it builds.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../../core/cards';
import { DEV_PLACEHOLDER_SCORE_CONFIG } from '../../core/score';
import { resetLanguage, setLanguage, t } from '../../i18n';
import type { Lang } from '../../i18n';
import { asFake, descendants, elementsOf, FakeDocument } from '../testing/fake-dom';
import type { FakeEl } from '../testing/fake-dom';
import { HELP_SECTIONS, HELP_STRING_KEYS, renderHelp } from './help';
import type { HelpHandle, HelpInput, HelpOptions } from './help';
import type { ModalDocument } from './modal';

afterEach(() => resetLanguage());

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'help.ts'), 'utf8');
const MODAL_SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'modal.ts'), 'utf8');
const stripComments = (s: string): string => s.split(/\r?\n/).filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/**')).join('\n');

const input = (language: Lang = 'en', provisional = true): HelpInput => ({ model: { language }, provisional });

function setup(initial: HelpInput = input(), options: HelpOptions = {}) {
  const doc = new FakeDocument();
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const opener = doc.createElement('button');
  opener.setAttribute('id', 'open-help');
  doc.body.appendChild(opener);
  opener.focus();
  const handle = renderHelp(doc as unknown as ModalDocument, root as unknown as HTMLElement, initial, t, options);
  return { doc, root, opener, handle };
}

const dialogOf = (h: HelpHandle): FakeEl => asFake(h.dialog);
const closeButton = (h: HelpHandle): FakeEl => descendants(dialogOf(h)).find((e) => e.getAttribute('id') === 'help-close') as FakeEl;
const heading = (h: HelpHandle): FakeEl => descendants(dialogOf(h)).find((e) => e.getAttribute('id') === 'help-title') as FakeEl;
const key = (k: string, init: { shiftKey?: boolean } = {}) => ({ key: k, ...init }) as { key: string };

/** All text and attribute values under the dialog (what a person or a script could read from the DOM). */
function everything(h: HelpHandle): string {
  return elementsOf(dialogOf(h))
    .flatMap((el) => [el.textContent, ...el.attributes.values()])
    .join('\n');
}

/** The visible text of the dialog only (no attribute values such as tabindex). */
const textOf = (h: HelpHandle): string => dialogOf(h).textContent;

describe('open and close', () => {
  it('is closed and absent from the DOM until opened; open adds one dialog with the dialog semantics', () => {
    const { root, handle } = setup();
    expect(handle.mode).toBe('closed');
    expect(root.children).toHaveLength(0);
    handle.open();
    expect(handle.mode).toBe('open');
    expect(root.children).toEqual([asFake(handle.element)]);
    const d = dialogOf(handle);
    expect(d.getAttribute('role')).toBe('dialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(d.getAttribute('aria-labelledby')).toBe('help-title');
    expect(heading(handle).textContent).toBe(t('help.title'));
    expect(d.getAttribute('aria-describedby')).toBe('help-intro');
    expect(descendants(d).some((e) => e.getAttribute('id') === 'help-intro')).toBe(true);
    expect(d.getAttribute('lang')).toBe('en');
  });

  it('has a visible Close button with the common label that closes it', () => {
    const { root, handle } = setup();
    handle.open();
    expect(closeButton(handle).textContent).toBe(t('common.button.close'));
    expect(closeButton(handle).getAttribute('type')).toBe('button');
    closeButton(handle).fire('click');
    expect(handle.mode).toBe('closed');
    expect(root.children).toHaveLength(0);
  });

  it('closes with Escape pressed in the dialog, and stops the event so no other Escape handler acts', () => {
    const { doc, handle } = setup();
    let pageSaw = 0;
    doc.addEventListener('keydown', () => pageSaw++);
    handle.open();
    pageSaw = 0;
    const event = closeButton(handle).fire('keydown', key('Escape'));
    expect(handle.mode).toBe('closed');
    expect(event.defaultPrevented).toBe(true);
    expect(pageSaw).toBe(0);
  });

  it('closes with Escape pressed anywhere in the document while open (focus outside the dialog)', () => {
    const { doc, handle } = setup();
    handle.open();
    doc.dispatch('keydown', key('Escape'));
    expect(handle.mode).toBe('closed');
    doc.dispatch('keydown', key('Escape')); // listener is gone: nothing happens
    expect(doc.listenerCount()).toBe(0);
  });

  it('closes on a click on the backdrop but not on a click inside the dialog', () => {
    const { handle } = setup();
    handle.open();
    dialogOf(handle).fire('click');
    expect(handle.mode).toBe('open');
    asFake(handle.element).fire('click');
    expect(handle.mode).toBe('closed');
  });

  it('reports a person-initiated close to onClose, but not close() or dispose()', () => {
    let closed = 0;
    const { handle } = setup(input(), { onClose: () => closed++ });
    handle.open();
    closeButton(handle).fire('click');
    handle.open();
    closeButton(handle).fire('keydown', key('Escape'));
    expect(closed).toBe(2);
    handle.open();
    handle.close();
    handle.open();
    handle.dispose();
    expect(closed).toBe(2);
  });

  it('a second open while open and a second close while closed do nothing (no duplicate DOM or listeners)', () => {
    const { doc, root, handle } = setup();
    handle.close();
    expect(doc.listenerCount()).toBe(0);
    handle.open();
    handle.open();
    handle.open();
    expect(root.children).toHaveLength(1);
    expect(doc.listenerCount()).toBe(1);
    expect(dialogOf(handle).listenerCount()).toBe(1);
    handle.close();
    handle.close();
    expect(doc.listenerCount()).toBe(0);
    expect(root.children).toHaveLength(0);
    handle.open();
    expect(root.children).toHaveLength(1);
    expect(doc.listenerCount()).toBe(1);
  });
});

describe('focus', () => {
  it('moves the focus into the dialog on open (the heading, tabindex -1) and back to the opener on close', () => {
    const { doc, opener, handle } = setup();
    expect(doc.activeElement).toBe(opener);
    handle.open();
    expect(doc.activeElement).toBe(heading(handle));
    expect(heading(handle).getAttribute('tabindex')).toBe('-1');
    handle.close();
    expect(doc.activeElement).toBe(opener);
  });

  it('restores the focus after Escape and after the Close button', () => {
    const { doc, opener, handle } = setup();
    handle.open();
    closeButton(handle).fire('keydown', key('Escape'));
    expect(doc.activeElement).toBe(opener);
    handle.open();
    closeButton(handle).fire('click');
    expect(doc.activeElement).toBe(opener);
  });

  it('keeps Tab and Shift+Tab inside the dialog', () => {
    const { doc, handle } = setup();
    handle.open();
    const close = closeButton(handle);
    close.focus();
    const forward = close.fire('keydown', key('Tab'));
    expect(forward.defaultPrevented).toBe(true); // a single control: Tab wraps to itself
    expect(doc.activeElement).toBe(close);
    const backward = close.fire('keydown', key('Tab', { shiftKey: true }));
    expect(backward.defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(close);
    heading(handle).focus();
    const fromHeading = heading(handle).fire('keydown', key('Tab', { shiftKey: true }));
    expect(fromHeading.defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(close);
  });

  it('pulls the focus back in on Tab when it is outside the dialog', () => {
    const { doc, opener, handle } = setup();
    handle.open();
    opener.focus();
    const event = doc.dispatch('keydown', key('Tab'));
    expect(event.defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(closeButton(handle));
  });

  it('uses the fallback element when the opener is gone, and does nothing harmful without one', () => {
    const a = setup(input(), {});
    a.handle.open();
    a.doc.body.removeChild(a.opener);
    a.handle.close();
    expect(a.doc.activeElement).toBeNull();

    const b = setup();
    const fallback = b.doc.createElement('button');
    b.doc.body.appendChild(fallback);
    const withFallback = renderHelpWithFallback(b.doc, fallback);
    withFallback.open();
    b.doc.body.removeChild(b.opener);
    withFallback.close();
    expect(b.doc.activeElement).toBe(fallback);

    // a fallback that is not in the document either: still no throw and no focus
    const c = setup();
    const lost = c.doc.createElement('button');
    const lostHandle = renderHelpWithFallback(c.doc, lost);
    lostHandle.open();
    c.doc.body.removeChild(c.opener);
    lostHandle.close();
    expect(c.doc.activeElement).toBeNull();
    expect(lost.focusCalls).toBe(0);
  });

  function renderHelpWithFallback(doc: FakeDocument, fallback: FakeEl): HelpHandle {
    const root = doc.createElement('div');
    doc.body.appendChild(root);
    return renderHelp(doc as unknown as ModalDocument, root as unknown as HTMLElement, input(), t, { fallbackFocus: fallback as unknown as HTMLElement });
  }
});

describe('update and dispose', () => {
  it('a language change while open re-renders in place: same elements, still open, same focus', () => {
    const { doc, root, handle } = setup();
    handle.open();
    closeButton(handle).focus();
    const backdrop = asFake(handle.element);
    const close = closeButton(handle);
    expect(everything(handle)).toContain('Rules and help');
    setLanguage('ko');
    handle.update(input('ko'));
    expect(handle.mode).toBe('open');
    expect(root.children).toEqual([backdrop]);
    expect(closeButton(handle)).toBe(close);
    expect(doc.activeElement).toBe(close);
    expect(close.textContent).toBe('닫기');
    expect(dialogOf(handle).getAttribute('lang')).toBe('ko');
    expect(everything(handle)).toContain('규칙과 도움말');
    expect(everything(handle)).not.toContain('Rules and help');
    setLanguage('en');
    handle.update(input('en'));
    expect(close.textContent).toBe('Close');
    expect(doc.listenerCount()).toBe(1);
  });

  it('update while closed keeps it closed and the text is current when it opens', () => {
    const { root, handle } = setup();
    setLanguage('ko');
    handle.update(input('ko'));
    expect(root.children).toHaveLength(0);
    handle.open();
    expect(heading(handle).textContent).toBe('규칙과 도움말');
  });

  it('dispose removes the DOM and the listeners and makes everything inert', () => {
    let closed = 0;
    const { doc, root, handle } = setup(input(), { onClose: () => closed++ });
    handle.open();
    handle.dispose();
    expect(root.children).toHaveLength(0);
    expect(doc.listenerCount()).toBe(0);
    expect(handle.mode).toBe('closed');
    handle.open();
    handle.update(input('ko'));
    handle.close();
    handle.dispose();
    doc.dispatch('keydown', key('Escape'));
    closeButton(handle).fire('click');
    expect(root.children).toHaveLength(0);
    expect(doc.listenerCount()).toBe(0);
    expect(closed).toBe(0);
  });

  it('dispose while closed leaves nothing behind', () => {
    const { doc, root, handle } = setup();
    handle.dispose();
    handle.open();
    expect(root.children).toHaveLength(0);
    expect(doc.listenerCount()).toBe(0);
  });

  it('dispose while open gives the focus back to the opener', () => {
    const { doc, opener, handle } = setup();
    handle.open();
    handle.dispose();
    expect(doc.activeElement).toBe(opener);
  });
});

describe('content', () => {
  const SECTION_IDS = ['goal', 'board', 'placement', 'howto', 'rotation', 'codes', 'guesses', 'drawing', 'reveal', 'end', 'visibility'];

  function sectionTexts(h: HelpHandle): Record<string, { title: string; body: string }> {
    const out: Record<string, { title: string; body: string }> = {};
    for (const el of descendants(dialogOf(h))) {
      if (el.getAttribute('data-section') === null) continue;
      const [titleEl, bodyEl] = el.children as [FakeEl, FakeEl];
      out[el.getAttribute('data-section') as string] = { title: titleEl.textContent, body: bodyEl.textContent };
    }
    return out;
  }

  it('renders the ten rule sections and the visibility paragraph, in order, in English and in Korean', () => {
    expect(HELP_SECTIONS.map((s) => s.id)).toEqual(SECTION_IDS);
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      const { handle } = setup(input(lang));
      handle.open();
      const texts = sectionTexts(handle);
      expect(Object.keys(texts)).toEqual(SECTION_IDS);
      for (const section of HELP_SECTIONS) {
        const entry = texts[section.id] as { title: string; body: string };
        expect(entry.title, `${lang} ${section.id}`).not.toBe(section.titleKey);
        expect(entry.body, `${lang} ${section.id}`).not.toBe(section.bodyKey);
        expect(entry.title.length).toBeGreaterThan(1);
        expect(entry.body.length).toBeGreaterThan(40);
      }
      const headings = descendants(dialogOf(handle)).filter((e) => e.tagName === 'h3');
      expect(headings).toHaveLength(SECTION_IDS.length);
      for (const el of descendants(dialogOf(handle)).filter((e) => e.getAttribute('data-section') !== null)) {
        const labelledby = el.getAttribute('aria-labelledby') as string;
        expect(descendants(el).some((c) => c.getAttribute('id') === labelledby)).toBe(true);
      }
    }
  });

  it('every key it uses exists in both languages', () => {
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      for (const k of HELP_STRING_KEYS) expect(t(k), `${lang} ${k}`).not.toBe(k);
    }
  });

  // Key facts per language. Each pattern is a fact of the approved text (see the table in help.ts).
  const FACTS: Record<Lang, readonly [string, RegExp][]> = {
    en: [
      ['8x8 board', /8×8/],
      ['4 neutral cards in the middle', /4 neutral cards lie in the middle/],
      ['edge adjacency', /along a full edge/],
      ['no diagonal-only', /only at a corner \(diagonally\) is not allowed/],
      ['no gap', /no gap between them/],
      ['drag', /Drag a card from your hand onto a legal cell/],
      ['position first', /select a cell first and then select a card/],
      ['explicit confirm', /only when you press the confirm button/],
      ['cancel and Escape discard', /cancel button and the Escape key discard/],
      ['180 only clubs and spades', /Rotation matters only for clubs and spades/],
      ['hearts and diamonds no control', /Hearts and diamonds look the same when rotated, so they have no rotation control/],
      ['2x2 code with inward fragment', /four cards around a 2×2 region .* corner that points to the center/],
      ['hidden sum is the sum of four values', /sum of the values of its four cards/],
      ['guess range', /whole number from 4 to 52/],
      ['private guesses', /Nobody sees another player's guess/],
      ['no hidden sum before reveal', /no hidden sum is shown before the reveal/],
      ['draw one when no new code', /does not complete a new code, you draw one card/],
      ['first placement draws', /applies from your first placement/],
      ['three cards and five-code ending', /three cards[\s\S]+five codes in total/],
      ['completing placement draws nothing', /A placement that completes a code draws nothing/],
      ['simultaneous reveal', /revealed to everyone at the same time/],
      ['points by distance', /depend on the distance between each guess and the hidden sum/],
      ['hand-empty end', /ends when a player has no cards left in hand/],
      ['end bonus without value', /empties their hand receives an end bonus/],
      ['empty deck does not end', /An empty deck does not end the game/],
      ['shared ranks', /equal scores share the same rank/],
      ['owner only', /Only the owner sees a card: the player who placed a card sees it until the code that contains it is revealed/],
      ['face up', /Cards are face up: every placed card is visible to everyone/],
    ],
    ko: [
      ['8x8 board', /8×8/],
      ['4 neutral cards in the middle', /중립 카드 4장이 보드 가운데/],
      ['edge adjacency', /한 변이 완전히 맞닿아야/],
      ['no diagonal-only', /꼭짓점으로만 닿는 칸\(대각선\)에는 놓을 수 없습니다/],
      ['no gap', /틈 없이/],
      ['drag', /손패의 카드를 끌어서 보드의 놓을 수 있는 칸에 놓거나/],
      ['position first', /먼저 칸을 선택한 다음 손패의 카드를 선택/],
      ['explicit confirm', /배치 확정 버튼을 눌러야 카드가 놓입니다/],
      ['cancel and Escape discard', /취소 버튼이나 Escape 키/],
      ['180 only clubs and spades', /회전은 클럽과 스페이드에서만 의미가 있으며/],
      ['hearts and diamonds no control', /하트와 다이아몬드는 회전해도 모양이 같으므로 회전 버튼이 없습니다/],
      ['2x2 code with inward fragment', /2×2 영역을 이루는 네 장의 카드가 모두 영역의 중심을 향한 모서리에 조각/],
      ['hidden sum is the sum of four values', /네 카드 값의 합/],
      ['guess range', /4에서 52 사이의 정수/],
      ['private guesses', /다른 플레이어의 예측값은 볼 수 없고/],
      ['no hidden sum before reveal', /공개 전에는 어떤 숨겨진 합도 표시되지 않습니다/],
      ['draw one when no new code', /새 조합을 완성하지 않는 카드를 놓으면 덱에서 카드 한 장을 뽑습니다/],
      ['first placement draws', /첫 배치부터 이 규칙/],
      ['three cards and five-code ending', /손패 세 장[\s\S]+누적 다섯 개/],
      ['completing placement draws nothing', /조합을 완성하면 뽑지 않습니다/],
      ['simultaneous reveal', /모두에게 동시에 공개됩니다/],
      ['points by distance', /각 예측값과 숨겨진 합의 차이에 따라/],
      ['hand-empty end', /손패가 비거나/],
      ['end bonus without value', /종료 보너스를 받습니다/],
      ['empty deck does not end', /덱이 비는 것만으로는 게임이 끝나지 않습니다/],
      ['shared ranks', /같은 순위를 공유합니다/],
      ['owner only', /카드 주인만 볼 수 있음: 카드를 놓은 플레이어만 그 카드를 볼 수 있고/],
      ['face up', /카드를 앞면으로 공개: 놓인 모든 카드를 모든 플레이어가 볼 수 있습니다/],
    ],
  };

  for (const lang of ['en', 'ko'] as const) {
    it(`states the key rule facts in ${lang}`, () => {
      setLanguage(lang);
      const { handle } = setup(input(lang));
      handle.open();
      const text = textOf(handle);
      for (const [name, pattern] of FACTS[lang]) expect(text, `${lang}: ${name}`).toMatch(pattern);
    });
  }

  it('says nothing of the one-versus-four revealed cards, OQ-1 default or any recommendation', () => {
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      const { handle } = setup(input(lang));
      handle.open();
      const text = textOf(handle);
      expect(text).not.toMatch(/default|recommend|기본값|권장|추천/i);
      expect(text).not.toMatch(/one card of each code|only one card is revealed/i);
    }
  });

  it('contains no digit except the rule numbers 8×8, 2×2, 180°, 4 to 52 and "4 neutral cards"', () => {
    // Allowed numbers are rule constants of the spec: the 8×8 board (3.1), the 2×2 region (5.2), the 180° orientation
    // (4.1), the Guess range 4 to 52 (7.2) and the 4 neutral cards (2.2). Everything else, such as the placeholder
    // reward table and the end bonus would show up as a stray digit.
    const ALLOWED: Record<Lang, readonly RegExp[]> = {
      en: [/8×8/g, /2×2/g, /180°/g, /4 to 52/g, /4 neutral cards/g],
      ko: [/8×8/g, /2×2/g, /180°/g, /4에서 52/g, /중립 카드 4장/g],
    };
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      const { handle } = setup(input(lang, true));
      handle.open();
      let text = textOf(handle);
      for (const phrase of ALLOWED[lang]) text = text.replace(phrase, '');
      expect(text, lang).not.toMatch(/\d/);
    }
    // Derive prohibited score tokens from the configured defaults; the rule numbers 2 and 4 are permitted.
    const { config } = DEV_PLACEHOLDER_SCORE_CONFIG;
    const stray = new Set([...config.rewardByError, config.handEmptyBonus].filter((n) => ![2, 4].includes(n)));
    expect(stray.size).toBeGreaterThan(0); // the no-score-text scan below must not be vacuous
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      const { handle } = setup(input(lang, true));
      handle.open();
      const tokens = textOf(handle).split(/\D+/);
      for (const n of stray) expect(tokens, `${lang} ${n}`).not.toContain(String(n));
    }
  });

  it('shows the provisional notice only when the input flag is set, built on the common label', () => {
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      const on = setup(input(lang, true));
      on.handle.open();
      const note = descendants(dialogOf(on.handle)).find((e) => e.getAttribute('role') === 'note') as FakeEl;
      expect(note).toBeDefined();
      expect(note.textContent).toContain(t('common.provisionalScoring'));
      expect(note.textContent).toContain(t('help.provisional.body'));
      expect(note.children[0]?.getAttribute('aria-hidden')).toBe('true');

      const off = setup(input(lang, false));
      off.handle.open();
      expect(descendants(dialogOf(off.handle)).some((e) => e.getAttribute('role') === 'note')).toBe(false);
      expect(everything(off.handle)).not.toContain(t('common.provisionalScoring'));
      expect(everything(off.handle)).not.toContain(t('help.provisional.body'));
    }
  });

  it('adds and removes the provisional notice on update while open', () => {
    const { handle } = setup(input('en', false));
    handle.open();
    const notes = () => descendants(dialogOf(handle)).filter((e) => e.getAttribute('role') === 'note').length;
    expect(notes()).toBe(0);
    handle.update(input('en', true));
    expect(notes()).toBe(1);
    handle.update(input('en', true));
    expect(notes()).toBe(1);
    handle.update(input('en', false));
    expect(notes()).toBe(0);
  });
});

describe('privacy by construction', () => {
  it('opens with a view-free input: only a language and a flag', () => {
    const given = input();
    expect(Object.keys(given).sort()).toEqual(['model', 'provisional']);
    expect(Object.keys(given.model)).toEqual(['language']);
    const { handle } = setup(given);
    handle.open();
    expect(handle.mode).toBe('open');
  });

  it('puts no CardId, rank-suit pair or card attribute into the text or the DOM', () => {
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      const { handle } = setup(input(lang));
      handle.open();
      const all = everything(handle);
      for (const card of ALL_CARDS) expect(all.includes(card), `${lang} ${card}`).toBe(false);
      expect(all).not.toMatch(/\b[HDCS]-(?:A|10|[2-9]|J|Q|K)\b/);
      for (const el of elementsOf(dialogOf(handle))) {
        for (const name of el.attributes.keys()) expect(name, name).not.toMatch(/^data-(card|owner|orientation|guess|sum|hidden)/);
      }
    }
  });

  it('the module imports no engine, view, state or controller module', () => {
    for (const source of [SOURCE, MODAL_SOURCE]) {
      for (const m of source.matchAll(/^import .* from '([^']+)'/gm)) expect(m[1], m[0]).not.toMatch(/core\/|controller|store|ai\//);
    }
  });

  it('source: no console, storage, global, clock or random', () => {
    for (const source of [SOURCE, MODAL_SOURCE]) {
      expect(stripComments(source)).not.toMatch(/\bconsole\b|localStorage|sessionStorage|globalThis|\bwindow\b|Math\.random|Date\.now|new Date|performance\.now|crypto|innerHTML/);
    }
  });
});

describe('requirement table', () => {
  it('maps every section to requirement numbers, and the module comment lists the same numbers', () => {
    for (const section of HELP_SECTIONS) {
      expect(section.requirements.length, section.id).toBeGreaterThan(0);
      const line = SOURCE.split(/\r?\n/).find((l) => new RegExp(`^//   ${section.id}\\s`).test(l));
      expect(line, section.id).toBeDefined();
      for (const requirement of section.requirements) expect(line as string, `${section.id} ${requirement}`).toContain(requirement);
    }
  });
});
