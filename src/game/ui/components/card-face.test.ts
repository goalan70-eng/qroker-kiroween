// Tests of the card face component (task 17.1). They run in Node WITHOUT a DOM library (happy-dom arrives with task
// 21.1): the model tests are exhaustive over the 52 cards, and the render tests use a minimal hand-written fake
// Document. They are unit tests against a stand-in, NOT browser tests: real layout, colour and focus are not exercised.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { CardId, Orientation, Owner } from '../../core/types';
import { resetLanguage, setLanguage, t } from '../../i18n';
import type { Lang } from '../../i18n';
import { createH } from '../dom';
import { ROTATED_MARKER, SUIT_GLYPHS, cardFaceModel, cardFaceName, renderCardFace } from './card-face';
import type { CardFaceInput } from './card-face';

afterEach(() => resetLanguage());

// ---------------------------------------------------------------------------------------------------------
// Independent tables (literals, not read from the implementation)
// ---------------------------------------------------------------------------------------------------------

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
const SUITS = ['H', 'D', 'C', 'S'] as const;
const GLYPH = { H: '♥', D: '♦', C: '♣', S: '♠' } as const;
const SUIT_WORD_EN = { H: 'Hearts', D: 'Diamonds', C: 'Clubs', S: 'Spades' } as const;
const SUIT_WORD_KO = { H: '하트', D: '다이아몬드', C: '클럽', S: '스페이드' } as const;
const FACE_WORD_EN = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' } as const;
const FACE_WORD_KO = { A: '에이스', J: '잭', Q: '퀸', K: '킹' } as const;
const OWNERS: readonly Owner[] = ['P0', 'P1', 'P2', 'P3', 'NEUTRAL'];
const ORIENTATIONS: readonly Orientation[] = [0, 180];
const ALL_IDS: readonly CardId[] = SUITS.flatMap((s) => RANKS.map((r) => `${s}-${r}` as CardId));
const OWNER_LABEL = 'Seat label';

const isFaceRank = (r: string): r is keyof typeof FACE_WORD_EN => r === 'A' || r === 'J' || r === 'Q' || r === 'K';

// ---------------------------------------------------------------------------------------------------------
// cardFaceModel: face-up
// ---------------------------------------------------------------------------------------------------------

describe('cardFaceModel, face-up (all 52 cards x 2 orientations x 5 owners)', () => {
  it('maps every card to its rank, glyph, name key and parameters, as an independent table says', () => {
    expect(ALL_IDS).toHaveLength(52);
    for (const id of ALL_IDS) {
      const [suit, rank] = id.split('-') as [(typeof SUITS)[number], (typeof RANKS)[number]];
      for (const orientation of ORIENTATIONS) {
        for (const owner of OWNERS) {
          const m = cardFaceModel({ card: id, owner, orientation, ownerLabel: OWNER_LABEL });
          const orientationKey = orientation === 180 ? 'cards.orientation.180' : 'cards.orientation.0';
          expect(m.faceUp, id).toBe(true);
          expect(m.rankText, id).toBe(rank);
          expect(m.suitGlyph, id).toBe(GLYPH[suit]);
          expect(m.nameKey, id).toBe('cards.name.up');
          expect(m.nameParams, id).toEqual(isFaceRank(rank) ? { owner: OWNER_LABEL } : { owner: OWNER_LABEL, rank });
          expect(m.nameKeyParams, id).toEqual(
            isFaceRank(rank)
              ? { orientation: orientationKey, suit: `cards.suit.${suit}`, rank: `cards.rank.${rank}` }
              : { orientation: orientationKey, suit: `cards.suit.${suit}` },
          );
          expect(m.owner).toBe(owner);
          expect(m.orientation).toBe(orientation);
          expect(m.rotated).toBe(orientation === 180);
          expect(m.orientationMarker).toBe(orientation === 180 ? '180°' : null);
          expect(m.dataAttrs).toEqual({ 'data-owner': owner, 'data-orientation': String(orientation), 'data-face': 'up' });
          const classes = m.className.split(' ');
          expect(classes).toEqual(
            expect.arrayContaining(['card-face', 'card-face--cell', 'card-face--up', suit === 'H' || suit === 'D' ? 'card-face--ink-red' : 'card-face--ink-dark']),
          );
          expect(classes.includes('is-rotated')).toBe(orientation === 180);
        }
      }
    }
  });

  it('uses the four suit glyphs and the 180° marker text', () => {
    expect(SUIT_GLYPHS).toEqual({ H: '♥', D: '♦', C: '♣', S: '♠' });
    expect(ROTATED_MARKER).toBe('180°');
    expect(new Set(ALL_IDS.map((id) => cardFaceModel({ card: id, owner: 'P0', orientation: 0, ownerLabel: 'x' }).suitGlyph))).toEqual(
      new Set(['♥', '♦', '♣', '♠']),
    );
  });

  it('takes the size from the input and defaults to cell', () => {
    const base = { card: 'S-K', owner: 'P1', orientation: 0, ownerLabel: 'x' } as const;
    expect(cardFaceModel(base).size).toBe('cell');
    for (const size of ['hand', 'cell', 'preview'] as const) {
      const m = cardFaceModel({ ...base, size });
      expect(m.size).toBe(size);
      expect(m.className.split(' ')).toContain(`card-face--${size}`);
    }
  });

  it('is deterministic and pure: equal inputs give equal models and the input is not changed', () => {
    for (const id of ALL_IDS) {
      const input: CardFaceInput = Object.freeze({ card: id, owner: 'P2', orientation: 180, size: 'hand', ownerLabel: 'Player 3' });
      const a = cardFaceModel(input);
      const b = cardFaceModel({ ...input });
      expect(a).toEqual(b);
      expect(a).not.toBe(b);
      expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    }
  });

  it('keeps the identity out of attributes and class names: no CardId, no suit or rank word', () => {
    for (const id of ALL_IDS) {
      const m = cardFaceModel({ card: id, owner: 'P0', orientation: 180, ownerLabel: OWNER_LABEL });
      const carriers = JSON.stringify([m.className, m.dataAttrs]);
      expect(carriers, id).not.toContain(id);
      expect(carriers, id).not.toMatch(/[HDCS]-/);
      expect(carriers, id).not.toMatch(/(^|[^a-z])(heart|diamond|club|spade|ace|jack|queen|king)s?($|[^a-z])/i);
      expect(carriers, id).not.toMatch(/[♥♦♣♠]/);
      expect(Object.keys(m.dataAttrs).sort()).toEqual(['data-face', 'data-orientation', 'data-owner']);
    }
  });

  it('rejects a malformed card, owner or orientation without echoing the value', () => {
    const ok = { owner: 'P0', orientation: 0, ownerLabel: 'x' } as const;
    for (const bad of ['', 'H7', 'X-7', 'H-11', 'h-7', 'H-', '-7', 'H-7 ', 'HH-7']) {
      expect(() => cardFaceModel({ ...ok, card: bad as CardId }), bad).toThrow(RangeError);
      try {
        cardFaceModel({ ...ok, card: bad as CardId });
      } catch (e) {
        expect((e as Error).message).not.toContain(bad === '' ? '\u0000' : bad);
      }
    }
    expect(() => cardFaceModel({ ...ok, card: 'H-7', owner: 'P4' as Owner })).toThrow(RangeError);
    expect(() => cardFaceModel({ ...ok, card: 'H-7', orientation: 90 as Orientation })).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------------------------------------
// cardFaceModel: face-down
// ---------------------------------------------------------------------------------------------------------

describe('cardFaceModel, face-down (privacy)', () => {
  const FORBIDDEN_WORDS = [
    ...Object.values(SUIT_WORD_EN),
    ...Object.values(SUIT_WORD_KO),
    ...Object.values(FACE_WORD_EN),
    ...Object.values(FACE_WORD_KO),
    '♥', '♦', '♣', '♠',
  ];

  it('has owner and orientation only: no rank, suit, glyph, name part or identity-derived token', () => {
    for (const owner of OWNERS) {
      for (const orientation of ORIENTATIONS) {
        for (const size of ['hand', 'cell', 'preview'] as const) {
          const m = cardFaceModel({ card: null, owner, orientation, size, ownerLabel: OWNER_LABEL });
          expect(m.faceUp).toBe(false);
          expect(m.rankText).toBeNull();
          expect(m.suitGlyph).toBeNull();
          expect(m.nameKey).toBe('cards.name.down');
          expect(m.nameParams).toEqual({ owner: OWNER_LABEL });
          expect(m.nameKeyParams).toEqual({ orientation: orientation === 180 ? 'cards.orientation.180' : 'cards.orientation.0' });
          expect(m.dataAttrs).toEqual({ 'data-owner': owner, 'data-orientation': String(orientation), 'data-face': 'down' });
          expect(m.className.split(' ')).toContain('card-face--down');
          expect(m.className).not.toMatch(/ink/);

          const json = JSON.stringify(m);
          for (const id of ALL_IDS) expect(json, id).not.toContain(id);
          expect(json).not.toMatch(/[HDCS]-/);
          // Whole words only: "face" in the class name "card-face" is not the rank word "Ace".
          for (const word of FORBIDDEN_WORDS) {
            expect(json, word).not.toMatch(new RegExp(`(^|[^A-Za-z])${word}s?($|[^A-Za-z])`, 'i'));
          }
          expect(json).not.toMatch(/"cards\.(suit|rank)\./);
          expect(json).not.toMatch(/"(rank|suit|card|glyph|shape)[A-Za-z]*":\s*"/); // null values only
        }
      }
    }
  });

  it('is the same model for every hidden card: the input has no identity to differ by', () => {
    const a = cardFaceModel({ card: null, owner: 'P1', orientation: 180, ownerLabel: 'x' });
    const b = cardFaceModel({ card: null, owner: 'P1', orientation: 180, ownerLabel: 'x' });
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------------------------------------
// renderCardFace against a fake Document
// ---------------------------------------------------------------------------------------------------------

class FakeEl {
  readonly children: FakeEl[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners: string[] = [];
  textContent: string | null = '';
  constructor(readonly tagName: string) {}
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
    this.children.push(child);
    return child;
  }
  addEventListener(type: string): void {
    this.listeners.push(type);
  }
}

const fakeDoc = () => ({
  createElement: (tag: string) => new FakeEl(tag),
  createTextNode: (text: string) => Object.assign(new FakeEl('#text'), { textContent: text }),
});

const asFake = (el: HTMLElement): FakeEl => el as unknown as FakeEl;

function subtreeText(el: FakeEl): string {
  return el.children.length > 0 ? el.children.map(subtreeText).join('') : (el.textContent ?? '');
}
function subtreeElements(el: FakeEl): FakeEl[] {
  return [el, ...el.children.flatMap(subtreeElements)];
}
/** Every attribute name and value of the subtree, as `name=value` strings. */
function subtreeAttributes(el: FakeEl): string[] {
  return subtreeElements(el).flatMap((e) => [...e.attributes].map(([n, v]) => `${n}=${v}`));
}

function render(input: CardFaceInput, lang: Lang = 'en'): FakeEl {
  setLanguage(lang);
  return asFake(renderCardFace(createH(fakeDoc() as unknown as Document), cardFaceModel(input), t));
}

describe('renderCardFace, face-down', () => {
  it('has no rank or suit text, and no attribute, class or title that carries identity', () => {
    for (const owner of OWNERS) {
      for (const orientation of ORIENTATIONS) {
        for (const lang of ['en', 'ko'] as const) {
          const el = render({ card: null, owner, orientation, ownerLabel: owner === 'NEUTRAL' ? t('cards.owner.NEUTRAL') : 'Player 1' }, lang);
          // The only text is the 180° mark of a rotated card.
          expect(subtreeText(el)).toBe(orientation === 180 ? '180°' : '');
          const attrs = subtreeAttributes(el).join('\n');
          for (const id of ALL_IDS) expect(attrs, id).not.toContain(id);
          expect(attrs).not.toMatch(/[♥♦♣♠]/);
          expect(attrs).not.toMatch(/Hearts|Diamonds|Clubs|Spades|하트|다이아몬드|클럽|스페이드/);
          expect(attrs).not.toMatch(/data-card|title=/);
          expect(el.getAttribute('title')).toBeNull();
          expect(el.children.every((c) => c.getAttribute('title') === null)).toBe(true);
        }
      }
    }
  });

  it('names the owner and the orientation only', () => {
    const up = render({ card: null, owner: 'P1', orientation: 0, ownerLabel: 'Player 2' });
    expect(up.getAttribute('aria-label')).toBe('Face-down card, upright (0°), owner: Player 2');
    const down = render({ card: null, owner: 'P3', orientation: 180, ownerLabel: 'Player 4' });
    expect(down.getAttribute('aria-label')).toBe('Face-down card, rotated 180°, owner: Player 4');
    const ko = render({ card: null, owner: 'NEUTRAL', orientation: 180, ownerLabel: '중립' }, 'ko');
    expect(ko.getAttribute('aria-label')).toBe('뒤집힌 카드, 180° 회전됨, 소유자: 중립');
  });
});

describe('renderCardFace, face-up', () => {
  it.skipIf(!existsSync('prototypes/screen-playtest/inputs/cards/AH.svg'))('maps all 52 public faces to their original artwork and keeps hidden faces image-free', () => {
    for (const card of ALL_IDS) {
      const [suit, rank] = card.split('-');
      for (const orientation of ORIENTATIONS) {
        const face = render({ card, owner: 'P0', orientation, ownerLabel: 'P0' });
        const images = subtreeElements(face).filter(el => el.tagName === 'img');
        expect(images).toHaveLength(1);
        expect(images[0]?.getAttribute('src')).toContain(`/${rank}${suit}.svg`);
        expect(subtreeElements(face).some(el => el.getAttribute('class')?.includes('card-face__fragment'))).toBe(false);
      }
    }
    const hidden = render({ card: null, owner: 'P0', orientation: 180, ownerLabel: 'P0' });
    expect(subtreeElements(hidden).some(el => el.getAttribute('src') !== null)).toBe(false);
  });

  it('prints the matching number of suit marks on each numeric hand card', () => {
    for (const card of ALL_IDS) {
      const face = render({ card, size: 'hand', owner: 'P0', orientation: 0, ownerLabel: 'P0' });
      const rows = subtreeElements(face).filter(el => el.getAttribute('class') === 'card-face__pip-row');
      const rank = Number(card.split('-')[1]);
      const marks = rows.flatMap(row => row.children.map(subtreeText));
      expect(marks.length, card).toBe(Number.isInteger(rank) ? rank : 0);
      if (marks.length) expect(new Set(marks), card).toEqual(new Set([GLYPH[card[0] as keyof typeof GLYPH]]));
    }
  });

  it('draws rank and suit glyph as text and the 180° mark only when rotated', () => {
    const upright = render({ card: 'H-7', owner: 'P0', orientation: 0, ownerLabel: 'x' });
    expect(subtreeText(upright)).toBe('7♥');
    expect(subtreeElements(upright).some((e) => e.getAttribute('class') === 'card-face__orient')).toBe(false);
    const rotated = render({ card: 'S-10', owner: 'P0', orientation: 180, ownerLabel: 'x' });
    expect(subtreeText(rotated)).toBe('10♠180°');
    expect(rotated.getAttribute('class')).toContain('is-rotated');
    const mark = subtreeElements(rotated).find((e) => e.getAttribute('class') === 'card-face__orient');
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
  });

  it('has role img, a non-empty accessible name in en and ko, with rank, suit, orientation and owner', () => {
    for (const lang of ['en', 'ko'] as const) {
      for (const id of ALL_IDS) {
        const [suit, rank] = id.split('-') as [(typeof SUITS)[number], (typeof RANKS)[number]];
        for (const orientation of ORIENTATIONS) {
          const el = render({ card: id, owner: 'P1', orientation, ownerLabel: 'OWNER' }, lang);
          const label = el.getAttribute('aria-label') ?? '';
          expect(el.getAttribute('role')).toBe('img');
          expect(label.length, `${lang} ${id}`).toBeGreaterThan(0);
          expect(label, `${lang} ${id}`).not.toMatch(/\{|cards\./);
          const suitWord = lang === 'en' ? SUIT_WORD_EN[suit] : SUIT_WORD_KO[suit];
          const rankWord = isFaceRank(rank) ? (lang === 'en' ? FACE_WORD_EN[rank] : FACE_WORD_KO[rank]) : rank;
          expect(label, `${lang} ${id}`).toContain(suitWord);
          expect(label, `${lang} ${id}`).toContain(rankWord);
          expect(label, `${lang} ${id}`).toContain('OWNER');
          expect(label, `${lang} ${id}`).toContain(orientation === 180 ? '180°' : '0°');
        }
      }
    }
  });

  it('builds the exact accessible name in both languages for a numeral and a face card', () => {
    expect(render({ card: 'H-7', owner: 'P0', orientation: 0, ownerLabel: 'Player 1' }).getAttribute('aria-label')).toBe(
      '7 of Hearts, upright (0°), owner: Player 1',
    );
    expect(render({ card: 'S-K', owner: 'NEUTRAL', orientation: 180, ownerLabel: 'Neutral' }).getAttribute('aria-label')).toBe(
      'King of Spades, rotated 180°, owner: Neutral',
    );
    expect(render({ card: 'D-A', owner: 'P2', orientation: 180, ownerLabel: '플레이어 3' }, 'ko').getAttribute('aria-label')).toBe(
      '다이아몬드 에이스, 180° 회전됨, 소유자: 플레이어 3',
    );
    expect(render({ card: 'C-10', owner: 'P3', orientation: 0, ownerLabel: 'AI 3' }, 'ko').getAttribute('aria-label')).toBe(
      '클럽 10, 바르게 놓임 (0°), 소유자: AI 3',
    );
  });

  it('never writes the CardId or an identity into any attribute value, class name or title', () => {
    for (const id of ALL_IDS) {
      const el = render({ card: id, owner: 'P0', orientation: 180, ownerLabel: 'x' });
      const attributes = subtreeElements(el).flatMap((e) => [...e.attributes]);
      for (const [name, value] of attributes) {
        if (name === 'aria-label') continue; // the accessible name holds rank and suit by design
        expect(value, `${id} ${name}`).not.toContain(id);
        expect(value, `${id} ${name}`).not.toMatch(/[♥♦♣♠]|Hearts|Diamonds|Clubs|Spades/i);
        expect(`${name}=${value}`, id).not.toMatch(/data-card|title/);
      }
      // the accessible name is localized words, not the raw id
      expect(el.getAttribute('aria-label')).not.toContain(id);
    }
  });

  it('is presentation only: no listener, no tabindex, no button, no innerHTML use', () => {
    for (const card of [null, 'H-7', 'C-Q'] as const) {
      const el = render({ card, owner: 'P0', orientation: 180, size: 'hand', ownerLabel: 'x' });
      for (const e of subtreeElements(el)) {
        expect(e.listeners).toEqual([]);
        expect(e.getAttribute('tabindex')).toBeNull();
        expect(['span', 'img']).toContain(e.tagName);
      }
    }
  });

  it('accepts a document instead of an h function, and cardFaceName agrees with the label', () => {
    setLanguage('en');
    const model = cardFaceModel({ card: 'D-Q', owner: 'P3', orientation: 0, ownerLabel: 'AI 3' });
    const viaDoc = asFake(renderCardFace(fakeDoc() as unknown as Document, model, t));
    expect(viaDoc.getAttribute('aria-label')).toBe(cardFaceName(model, t));
    expect(viaDoc.getAttribute('aria-label')).toBe('Queen of Diamonds, upright (0°), owner: AI 3');
  });
});

// ---------------------------------------------------------------------------------------------------------
// Styles (source checks; no browser is involved)
// ---------------------------------------------------------------------------------------------------------

const STYLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'styles');
const tokens = readFileSync(join(STYLES_DIR, 'tokens.css'), 'utf8');
const card = readFileSync(join(STYLES_DIR, 'card.css'), 'utf8');
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('tokens.css and card.css', () => {
  it('defines the documented custom properties', () => {
    const defined = new Set([...stripComments(tokens).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    for (const name of [
      '--color-ink', '--color-paper', '--color-red', '--color-dark',
      '--color-owner-p0', '--color-owner-p1', '--color-owner-p2', '--color-owner-p3', '--color-owner-neutral',
      '--color-legal', '--color-focus', '--color-disabled-fg', '--color-disabled-bg',
      '--color-banner-fg', '--color-banner-bg', '--color-banner-border',
      '--space-1', '--space-2', '--space-3', '--space-4', '--space-5',
      '--touch-min', '--cell', '--board-pad', '--label-size',
    ]) {
      expect(defined.has(name), name).toBe(true);
    }
  });

  it('sets --touch-min to 44px and sizes --cell with a clamp from 24px to 64px', () => {
    expect(stripComments(tokens)).toMatch(/--touch-min:\s*44px\s*;/);
    expect(stripComments(tokens)).toMatch(/--cell:\s*clamp\(\s*24px\s*,[^;]*,\s*64px\s*\)\s*;/);
  });

  it('declares every custom property that card.css reads', () => {
    const defined = new Set([...stripComments(tokens).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const local = new Set([...stripComments(card).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    for (const m of stripComments(card).matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
      expect(defined.has(m[1] as string) || local.has(m[1] as string), m[1]).toBe(true);
    }
  });

  it('gives the card face border-box sizing and no margin or border that could change a cell', () => {
    const rule = /\.card-face\s*\{([^}]*)\}/.exec(stripComments(card));
    expect(rule).not.toBeNull();
    expect(rule?.[1]).toMatch(/box-sizing:\s*border-box\s*;/);
    expect(rule?.[1]).toMatch(/margin:\s*0\s*;/);
    expect(rule?.[1]).toMatch(/border:\s*0\s*;/);
    expect(stripComments(card)).not.toMatch(/touch-action/);
  });

  it('rotates only the glyph block and the indicator mark, never the card face box', () => {
    const css = stripComments(card);
    const rotated = [...css.matchAll(/([^{}]*)\{[^}]*rotate\(180deg\)[^}]*\}/g)].map((m) => (m[1] as string).trim());
    expect(rotated).toEqual(['.card-face.is-rotated .card-face__glyphs', '.card-face.is-rotated .card-face__orient::before']);
  });

  it('bundles the shared card stock and uses no remote assets', () => {
    expect(tokens).not.toMatch(/url\(/i);
    expect([...card.matchAll(/url\(([^)]+)\)/gi)].map(match => match[1])).toEqual(["'./marked-card-back.webp'"]);
    for (const css of [tokens, card]) {
      expect(css).not.toMatch(/@import/i);
      expect(css).not.toMatch(/http/i);
      expect(css).not.toMatch(/@font-face/i);
    }
  });

  it('removes transitions for reduced motion', () => {
    expect(tokens).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});
