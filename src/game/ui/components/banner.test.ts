// Tests of the provisional-scoring banner (task 19.3; requirement 14.8). Evidence class: model tests and fake-DOM tests
// (no real browser). The views are real (`createController`); the NON-provisional view is a MODEL FIXTURE: a clone of a
// real view whose `rules.scoreConfig.provisional` is replaced, because the engine only ships the provisional placeholder.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { DEV_PLACEHOLDER_SCORE_CONFIG } from '../../core/score';
import type { PlayerView } from '../../core/view';
import { resetLanguage, setLanguage, t } from '../../i18n';
import { createController } from '../controller';
import type { Schedule } from '../controller';
import { asFake, descendants, FakeDocument } from '../testing/fake-dom';
import type { FakeEl } from '../testing/fake-dom';
import { BANNER_GLYPH, BANNER_STRING_KEYS, buildBannerModel, renderBanner } from './banner';
import type { BannerInput } from './banner';

afterEach(() => resetLanguage());

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'banner.ts'), 'utf8');
const CODE = SOURCE.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');

const noSchedule: Schedule = () => ({ cancel: () => undefined });
function realView(): PlayerView {
  const ctl = createController({ schedule: noSchedule, renderer: () => undefined, randomSeed: () => 5, language: () => 'en' });
  ctl.startGame({ seed: 5 });
  return ctl.getView('P0') as PlayerView;
}

/** MODEL FIXTURE: the same real view with another `provisional` flag. */
function withProvisional(view: PlayerView, provisional: boolean): PlayerView {
  return { ...view, rules: { ...view.rules, scoreConfig: { ...view.rules.scoreConfig, provisional } } } as PlayerView;
}

const mount = (input: BannerInput) => {
  const doc = new FakeDocument();
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const handle = renderBanner(doc as unknown as Document, root as unknown as HTMLElement, input, t);
  return { doc, root, handle };
};

describe('buildBannerModel', () => {
  it('is visible for the provisional placeholder and hidden otherwise, and is frozen', () => {
    const view = realView();
    expect(view.rules.scoreConfig.provisional).toBe(true);
    const on = buildBannerModel(view);
    expect(on).toEqual({ visible: true });
    expect(Object.isFrozen(on)).toBe(true);
    expect(buildBannerModel(withProvisional(view, false))).toEqual({ visible: false });
  });

  it('reads only the provisional flag: a rules object that has nothing else still works, and no score value is read', () => {
    const rules = { scoreConfig: { provisional: true } } as unknown as PlayerView['rules'];
    expect(buildBannerModel({ rules })).toEqual({ visible: true });
    // A getter on every score value would throw if the model read it.
    const trap = {
      provisional: false,
      get config(): never {
        throw new Error('score values must not be read');
      },
      get rewardByError(): never {
        throw new Error('rewardByError must not be read');
      },
    };
    expect(buildBannerModel({ rules: { scoreConfig: trap } as unknown as PlayerView['rules'] })).toEqual({ visible: false });
    expect(CODE).not.toMatch(/rewardByError|handEmptyBonus|\.config\b/);
  });
});

describe('renderBanner', () => {
  it('renders a role=note paragraph with the common text and an aria-hidden glyph while provisional', () => {
    const { root, handle } = mount({ view: realView() });
    const el = asFake(handle.element);
    expect(handle.visible).toBe(true);
    expect(el.parentNode).toBe(root);
    expect(el.getAttribute('role')).toBe('note');
    expect(el.textContent).toBe(`${BANNER_GLYPH}${t('common.provisionalScoring')}`);
    const glyph = descendants(el).find((c) => c.getAttribute('class') === 'banner__glyph') as FakeEl;
    expect(glyph.getAttribute('aria-hidden')).toBe('true');
    expect(glyph.textContent).toBe(BANNER_GLYPH);
    expect(el.getAttribute('role')).not.toBe('alert');
  });

  it('renders nothing into the root when not provisional or when there is no view (documented choice: not in the DOM)', () => {
    const off = mount({ view: withProvisional(realView(), false) });
    expect(off.handle.visible).toBe(false);
    expect(off.root.children).toHaveLength(0);
    expect(off.handle.element.parentNode).toBeNull();
    const none = mount({ view: null });
    expect(none.root.children).toHaveLength(0);
  });

  it('update shows, hides and keeps ONE element (no duplicate banner)', () => {
    const view = realView();
    const { root, handle } = mount({ view: withProvisional(view, false) });
    handle.update({ view });
    expect(root.children).toHaveLength(1);
    handle.update({ view });
    handle.update({ view });
    expect(root.children).toHaveLength(1);
    handle.update({ view: withProvisional(view, false) });
    expect(root.children).toHaveLength(0);
    handle.update({ view: null });
    expect(root.children).toHaveLength(0);
    handle.update({ view });
    expect(root.children).toHaveLength(1);
  });

  it('shows the exact common translation in English and Korean and follows a language change on update', () => {
    const view = realView();
    const { handle } = mount({ view });
    expect(handle.element.textContent).toContain('provisional scoring');
    setLanguage('ko');
    handle.update({ view });
    expect(handle.element.textContent).toContain('임시 점수 규칙');
    expect(asFake(handle.element).children.find((c) => c.getAttribute('class') === 'banner__text')?.textContent).toBe(t('common.provisionalScoring'));
    setLanguage('en');
    handle.update({ view });
    expect(handle.element.textContent).toContain('provisional scoring');
  });

  it('has no digit and no score value from the placeholder in its text, classes or attributes', () => {
    const view = realView();
    const { doc, handle } = mount({ view });
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      handle.update({ view });
      const parts: string[] = [];
      for (const el of [asFake(handle.element), ...descendants(asFake(handle.element))]) {
        parts.push(el.textContent, ...el.attributes.values());
      }
      const all = parts.join('|');
      expect(all).not.toMatch(/\d/);
      for (const n of [...DEV_PLACEHOLDER_SCORE_CONFIG.config.rewardByError, DEV_PLACEHOLDER_SCORE_CONFIG.config.handEmptyBonus]) {
        expect(all.split(/\D+/)).not.toContain(String(n));
      }
    }
    expect(doc.listenerCount()).toBe(0);
  });

  it('dispose removes the element and makes update inert', () => {
    const view = realView();
    const { root, handle } = mount({ view });
    handle.dispose();
    expect(root.children).toHaveLength(0);
    handle.update({ view });
    expect(root.children).toHaveLength(0);
    expect(handle.visible).toBe(false);
    handle.dispose();
  });

  it('lists the one string key it uses, and the key exists in both languages', () => {
    expect(BANNER_STRING_KEYS).toEqual(['common.provisionalScoring']);
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      for (const key of BANNER_STRING_KEYS) expect(t(key)).not.toBe(key);
    }
  });

  it('source: no console, storage, global, clock or random, and no engine import', () => {
    expect(CODE).not.toMatch(/\bconsole\b|localStorage|sessionStorage|globalThis|\bwindow\b|Math\.random|Date\.now|new Date|performance\.now|crypto/);
    for (const m of SOURCE.matchAll(/^import .* from '([^']+)'/gm)) expect(m[1], m[0]).not.toMatch(/core\/(engine|state|deck|replay|rules|score)|controller|ai\//);
  });
});
