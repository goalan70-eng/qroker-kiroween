// Provisional-scoring banner (task 19.3; requirement 14.8: "WHILE the active ScoreConfig has `provisional: true`, THE
// Practice_UI SHALL display a banner on every game screen with the text provisional scoring (Korean 임시 점수 규칙)").
//
//   * `buildBannerModel({ rules })`: PURE; a frozen `{ visible }` from `rules.scoreConfig.provisional` ONLY. It never reads
//     `rewardByError`, `handEmptyBonus` or any other score value.
//   * `renderBanner(doc, root, input, t)`: mounts the banner and returns `{ element, visible, update, dispose }`.
//
// DOM (visible)
//   p.banner[role=note]
//     span.banner__glyph[aria-hidden=true]   a warning sign: the non-colour cue
//     span.banner__text                      `common.provisionalScoring`
//   `role="note"`, not `status` or `alert`: the banner is static information and must not be announced on every render.
//
// Hidden (not provisional, or no view): the element is NOT in `root` at all. `handle.element` stays the same object, so a
// host can keep a reference; `update` appends it when the banner becomes visible and removes it when it is not.
//
// NO DUPLICATE BANNERS (for task 19.4): `renderScoreboard`, `renderReveal` and `renderEnd` each draw their own banner today.
// A host that composes them with this component passes `{ banner: false }` to those renderers (an additive option, default
// `true`, so their DOM and tests are unchanged) and mounts exactly one `renderBanner`.
//
// The language is applied through `t` (the module-level current language of i18n): `update` re-renders the text.
//
// Imports: ui/, i18n/, core/view (type only).

import type { PlayerView } from '../../core/view';
import { createH } from '../dom';
import type { CreateDoc } from '../dom';
import type { Translate } from './card-face';

/** The marker in front of the text. It is decoration (`aria-hidden`); the text carries the meaning. */
export const BANNER_GLYPH = '⚠';

/** Every string key this component passes to `t`. */
export const BANNER_STRING_KEYS = ['common.provisionalScoring'] as const;

export interface BannerModel {
  readonly visible: boolean;
}

/** `visible` is `rules.scoreConfig.provisional`, nothing else. Pure; the result is frozen. */
export function buildBannerModel({ rules }: Pick<PlayerView, 'rules'>): BannerModel {
  return Object.freeze({ visible: rules.scoreConfig.provisional });
}

/** What the banner reads. The controller's `RenderInput` satisfies it structurally. `null`: no game, no banner. */
export interface BannerInput {
  readonly view: Pick<PlayerView, 'rules'> | null;
}

export interface BannerHandle {
  /** The banner element. It is a child of `root` only while `visible`. */
  readonly element: HTMLElement;
  readonly visible: boolean;
  /** Shows, hides and re-translates. After `dispose` it does nothing. */
  update(input: BannerInput): void;
  /** Removes the element. Idempotent. */
  dispose(): void;
}

export function renderBanner(doc: CreateDoc, root: HTMLElement, input: BannerInput, t: Translate): BannerHandle {
  const h = createH(doc);
  const glyph = h('span', { class: 'banner__glyph', aria: { hidden: 'true' } }, BANNER_GLYPH);
  const text = h('span', { class: 'banner__text' });
  const element = h('p', { class: 'banner', attrs: { role: 'note' } }, glyph, text);
  let visible = false;
  let disposed = false;

  function paint(next: BannerInput): void {
    visible = next.view !== null && buildBannerModel(next.view).visible;
    if (visible) {
      text.textContent = t('common.provisionalScoring');
      if (element.parentNode !== root) root.appendChild(element);
    } else if (element.parentNode !== null) {
      element.parentNode.removeChild(element);
    }
  }

  paint(input);
  return {
    element,
    get visible() {
      return visible;
    },
    update(next) {
      if (!disposed) paint(next);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      visible = false;
      if (element.parentNode !== null) element.parentNode.removeChild(element);
    },
  };
}
