// Card face component (task 17.1). Source: .kiro/specs/qroker-playable-game/design.md, "Accessibility and styling",
// "Placement interaction" (DOM contract); requirements 13.7, 13.8, 13.16 (privacy), 16.7 (accessibility).
//
// Two parts:
//   * `cardFaceModel(input)`: a PURE function from {card | null, owner, orientation, size, ownerLabel} to a plain,
//     JSON-serializable model. It does the card parsing and decides every name, class and attribute, so the privacy
//     rules can be tested without a DOM.
//   * `renderCardFace(h | doc, model, t)`: builds the element from the model with `h` (text through `textContent`,
//     never HTML). This component is only the PRESENTATION of a card. A Hand card that is a button, a Board cell
//     button and the drag source are wrappers owned by tasks 17.2 and 17.3; the face itself has no listener and no
//     `tabindex`, and the 180° indicator is a visual mark, never a control.
//
// Privacy contract (checked in card-face.test.ts):
//   * A face-down card (`card === null`) has a model with owner and orientation only: no rank, suit, glyph or
//     identity-derived class or name part. The renderer can add a per-card optical artwork URL.
//     The back has no rank or suit text, identity label or CardId attribute.
//   * A face-up card shows rank and suit only in its text and in its accessible name. The CardId string ('H-7') is
//     never written anywhere, and there is no `data-card`, no suit or rank class and no `title`. The model keeps a
//     two-valued ink tone class (`card-face--ink-red` or `card-face--ink-dark`) for the colour of the glyphs; it is
//     a presentation token and cannot tell a heart from a diamond or one rank from another. The suit shape cue is
//     the glyph itself (♥ ♦ ♣ ♠ differ in shape, so the suit does not rely on colour).
//   * The owner and the orientation are public in every view, so `data-owner`, `data-orientation` and `data-face`
//     ('up' or 'down') are the only data attributes.
//
// Imports: ui/, i18n/ and core/types only (screen-class module of boundaries.test.ts).

/// <reference types="vite/client" />

import type { StringKey, StringParams } from '../../i18n';
import { visibleFragmentCorners } from '../../core/view';
import type { Corner, CardId, Orientation, Owner, Rank, Suit } from '../../core/types';
import { backStyle } from '../back-art';
import { createH } from '../dom';
import type { CreateDoc, HFunction } from '../dom';

export type CardFaceSize = 'hand' | 'cell' | 'preview';

/** What the caller knows about one card. `card: null` is a card whose identity is hidden from the viewer. */
export interface CardFaceInput {
  /** The identity the viewer may see, or `null` for a face-down card. */
  readonly card: CardId | null;
  readonly owner: Owner;
  readonly orientation: Orientation;
  /** Default `'cell'`. */
  readonly size?: CardFaceSize;
  /** The owner's name in the current language, for example `t('common.seat.player', { n: 1 })`. */
  readonly ownerLabel: string;
}

/** The plain data that `renderCardFace` turns into an element. */
export interface CardFaceModel {
  readonly faceUp: boolean;
  readonly artworkUrl?: string;
  readonly fragmentCorners?: readonly Corner[];
  readonly owner: Owner;
  readonly orientation: Orientation;
  readonly size: CardFaceSize;
  /** `orientation === 180`. */
  readonly rotated: boolean;
  /** Visible rank text ('A', '2' to '10', 'J', 'Q', 'K'); `null` when face-down. */
  readonly rankText: string | null;
  /** Visible suit glyph ('♥', '♦', '♣', '♠'), which is also the suit shape cue; `null` when face-down. */
  readonly suitGlyph: string | null;
  /** The root `class` attribute value. Holds the size, the face side, `is-rotated` and, face-up only, the ink tone. */
  readonly className: string;
  /** Text of the orientation indicator ('180°'), or `null` when the card is upright. Never a control. */
  readonly orientationMarker: string | null;
  /** String key of the accessible name. */
  readonly nameKey: 'cards.name.up' | 'cards.name.down';
  /** Literal parameters of the name: `owner`, and `rank` for a numeral rank. */
  readonly nameParams: Readonly<Record<string, string>>;
  /** Parameters that are string keys, looked up with `t` before the name is built: `orientation`, and `suit` and `rank` (face ranks only). */
  readonly nameKeyParams: Readonly<Record<string, StringKey>>;
  /** The `data-*` attributes: `data-owner`, `data-orientation`, `data-face`. Never an identity. */
  readonly dataAttrs: Readonly<Record<'data-owner' | 'data-orientation' | 'data-face', string>>;
}

/** The translator that `renderCardFace` needs (`t` of i18n/index.ts fits). */
export type Translate = (key: StringKey, params?: StringParams) => string;

export const SUIT_GLYPHS: Readonly<Record<Suit, string>> = Object.freeze({ H: '♥', D: '♦', C: '♣', S: '♠' });

// The owner's local deck is also the source of the screen playtest. Vite emits
// the original files and resolves each URL relative to the deployed application.
const artwork = import.meta.glob<string>('../../../../prototypes/screen-playtest/inputs/cards/*.svg', {
  eager: true, import: 'default', query: '?url',
});
const facesByName = new Map(Object.entries(artwork).map(([path, url]) => [path.split('/').pop(), url]));

const RED_SUITS: readonly Suit[] = ['H', 'D'];
const FACE_RANKS: readonly Rank[] = ['A', 'J', 'Q', 'K'];
const RANKS: readonly Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS: readonly Suit[] = ['H', 'D', 'C', 'S'];
const OWNERS: readonly Owner[] = ['P0', 'P1', 'P2', 'P3', 'NEUTRAL'];

/** The text of the 180° indicator. Digits and the degree sign only; it carries no identity. */
export const ROTATED_MARKER = '180°';

function parseCard(card: CardId): { readonly suit: Suit; readonly rank: Rank } {
  const text: string = card;
  const dash = text.indexOf('-');
  const suit = text.slice(0, dash) as Suit;
  const rank = text.slice(dash + 1) as Rank;
  if (dash !== 1 || !SUITS.includes(suit) || !RANKS.includes(rank)) {
    throw new RangeError('cardFaceModel: not a card id');
  }
  return { suit, rank };
}

/**
 * The model of one card face. Pure and deterministic.
 *
 * @throws RangeError for a `card` string that is not a CardId, an unknown owner or an unknown orientation. (The
 *   message never repeats the offending value, so even an error cannot copy an identity into a log.)
 */
export function cardFaceModel(input: CardFaceInput): CardFaceModel {
  const { card, owner, orientation, ownerLabel } = input;
  const size: CardFaceSize = input.size ?? 'cell';
  if (!OWNERS.includes(owner)) throw new RangeError('cardFaceModel: unknown owner');
  if (orientation !== 0 && orientation !== 180) throw new RangeError('cardFaceModel: unknown orientation');
  const rotated = orientation === 180;
  const orientationKey: StringKey = rotated ? 'cards.orientation.180' : 'cards.orientation.0';
  const classes = ['card-face', `card-face--${size}`];
  const dataAttrs = {
    'data-owner': owner,
    'data-orientation': String(orientation),
    'data-face': card === null ? 'down' : 'up',
  } as const;

  if (card === null) {
    classes.push('card-face--down');
    if (rotated) classes.push('is-rotated');
    return {
      faceUp: false,
      owner,
      orientation,
      size,
      rotated,
      rankText: null,
      suitGlyph: null,
      className: classes.join(' '),
      orientationMarker: rotated ? ROTATED_MARKER : null,
      nameKey: 'cards.name.down',
      nameParams: { owner: ownerLabel },
      nameKeyParams: { orientation: orientationKey },
      dataAttrs,
    };
  }

  const { suit, rank } = parseCard(card);
  classes.push('card-face--up', RED_SUITS.includes(suit) ? 'card-face--ink-red' : 'card-face--ink-dark');
  if (rotated) classes.push('is-rotated');
  const artworkUrl = facesByName.get(`${rank}${suit}.svg`);
  const isFaceRank = FACE_RANKS.includes(rank);
  return {
    faceUp: true,
    ...(artworkUrl ? { artworkUrl } : { fragmentCorners: visibleFragmentCorners(suit, orientation) }),
    owner,
    orientation,
    size,
    rotated,
    rankText: rank,
    suitGlyph: SUIT_GLYPHS[suit],
    className: classes.join(' '),
    orientationMarker: rotated ? ROTATED_MARKER : null,
    nameKey: 'cards.name.up',
    nameParams: isFaceRank ? { owner: ownerLabel } : { owner: ownerLabel, rank },
    nameKeyParams: isFaceRank
      ? { orientation: orientationKey, suit: `cards.suit.${suit}`, rank: `cards.rank.${rank}` as StringKey }
      : { orientation: orientationKey, suit: `cards.suit.${suit}` },
    dataAttrs,
  };
}

/** The localized accessible name of `model`: its key with the literal parameters and the looked-up key parameters. */
export function cardFaceName(model: CardFaceModel, t: Translate): string {
  const params: Record<string, string> = { ...model.nameParams };
  for (const [name, key] of Object.entries(model.nameKeyParams)) params[name] = t(key);
  return t(model.nameKey, params);
}

// Number of suit marks on each line of a portrait playing card, from top to bottom.
const PIP_ROWS: Readonly<Record<string, readonly number[]>> = {
  '2': [1, 1], '3': [1, 1, 1], '4': [2, 2], '5': [2, 1, 2], '6': [2, 2, 2],
  '7': [2, 1, 2, 2], '8': [2, 1, 2, 1, 2], '9': [2, 2, 1, 2, 2], '10': [2, 1, 2, 2, 1, 2],
};

export function renderFaceArt(h: HFunction, face: CardFaceModel): HTMLElement | null {
  if (!face.artworkUrl) return null;
  return h('img', {
    class: 'card-face__art',
    attrs: { src: face.artworkUrl, alt: '', draggable: 'false' },
  });
}

export function renderFragments(h: HFunction, face: CardFaceModel): HTMLElement[] {
  return (face.fragmentCorners ?? []).map(corner =>
    h('span', { class: `card-face__fragment card-face__fragment--${corner.toLowerCase()}`, aria: { hidden: 'true' } }),
  );
}

/**
 * Builds the element of `model`. `target` is an `h` function or a document (anything with `createElement` and
 * `createTextNode`). The root is a `<span role="img">` whose `aria-label` is the accessible name; its children are
 * `aria-hidden`, so the name is read once.
 */
export function renderCardFace(target: HFunction | CreateDoc, model: CardFaceModel, t: Translate, back?: string | null): HTMLElement {
  const h: HFunction = typeof target === 'function' ? target : createH(target);
  const children: HTMLElement[] = [];
  if (model.faceUp) {
    const rows = model.size === 'hand' ? PIP_ROWS[model.rankText ?? ''] : undefined;
    const suit = rows
      ? h('span', { class: 'card-face__pips' }, ...rows.map(count =>
          h('span', { class: 'card-face__pip-row' }, ...Array.from({ length: count }, () => h('span', null, model.suitGlyph))),
        ))
      : h('span', { class: 'card-face__suit' }, model.suitGlyph);
    children.push(
      ...renderFragments(h, model),
      h(
        'span',
        { class: 'card-face__glyphs', aria: { hidden: 'true' } },
        h('span', { class: 'card-face__rank' }, model.rankText),
        suit,
        model.size === 'hand' ? h('span', { class: 'card-face__foot' }, model.rankText) : null,
        renderFaceArt(h, model),
      ),
    );
  }
  if (model.orientationMarker !== null) {
    children.push(h('span', { class: 'card-face__orient', aria: { hidden: 'true' } }, model.orientationMarker));
  }
  return h(
    'span',
    { class: model.className, attrs: { role: 'img', ...model.dataAttrs, ...backStyle(model.faceUp ? undefined : back) }, aria: { label: cardFaceName(model, t) } },
    ...children,
  );
}
