// Tests of the setup screen (task 19.1). Evidence classes (design.md, "Testing Strategy"):
//   * fake-DOM : `renderSetup` against the hand-written fake Document of ui/testing/fake-dom.ts with synthetic events.
//                Some tests use a stub `startFromSetup`, others the REAL controller (`createController`) with a stub
//                renderer, so that a game really starts with the entered configuration and seed. NOT a browser: no
//                layout, no real focus, no screen reader, no browser autofill, no real `<select>` semantics. The composed
//                page is task 19.4; the headless-DOM smoke test is task 21.3.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { fnv1a32 } from '../../core/seed';
import { defaultConfig, newGame } from '../../core/state';
import type { Difficulty, IdentityVisibility, PlayerId } from '../../core/types';
import { viewFor } from '../../core/view';
import type { PlayerView } from '../../core/view';
import { getLanguage, resetLanguage, setLanguage, t } from '../../i18n';
import type { Lang } from '../../i18n';
import { createController } from '../controller';
import type { Controller, RenderInput } from '../controller';
import { DEFAULT_SETUP_PREFS } from '../setup-model';
import type { SetupOptions, SetupPrefs } from '../setup-model';
import { asFake, descendants, elementsOf, FakeDocument } from '../testing/fake-dom';
import type { FakeEl } from '../testing/fake-dom';
import * as setupStrings from '../../i18n/strings/setup';
import { renderSetup, SETUP_STRING_KEYS } from './setup';
import type { SetupDocument, SetupHandle, SetupInput, SetupOptionsArg, SetupStartResult } from './setup';

afterEach(() => resetLanguage());

// ---------------------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------------------

const get = (doc: FakeDocument, id: string): FakeEl => {
  const el = doc.getElementById(id);
  if (el === null) throw new Error(`no element #${id}`);
  return el;
};
const setVal = (el: FakeEl, value: string): void => {
  (el as unknown as { value: string }).value = value;
};
const valOf = (el: FakeEl): unknown => (el as unknown as { value?: unknown }).value;
const checkedOf = (el: FakeEl): unknown => (el as unknown as { checked?: unknown }).checked;
const SEAT_IDS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];

/** A stub of the two handlers: records the options of each start and answers with `reply`. */
class StubHandlers {
  readonly starts: SetupOptions[] = [];
  readonly languages: Lang[] = [];
  reply: (options: SetupOptions) => SetupStartResult = () => ({ ok: true });
  readonly handlers = {
    startFromSetup: (options: SetupOptions): SetupStartResult => {
      this.starts.push(options);
      return this.reply(options);
    },
    setLanguage: (lang: Lang): void => {
      this.languages.push(lang);
    },
  };
}

interface Mounted {
  readonly doc: FakeDocument;
  readonly root: FakeEl;
  readonly handle: SetupHandle;
  readonly stub: StubHandlers;
  readonly prefs: SetupPrefs[];
  readonly input: SetupInput;
}

function mount(
  extra: Partial<SetupInput> = {},
  options: SetupOptionsArg = {},
  stub: StubHandlers = new StubHandlers(),
  language: Lang = 'en',
): Mounted {
  setLanguage(language);
  const doc = new FakeDocument();
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const prefs: SetupPrefs[] = [];
  const input: SetupInput = { model: { language }, handlers: stub.handlers, initialSeedText: '424242', ...extra };
  const handle = renderSetup(doc as unknown as SetupDocument, root as unknown as HTMLElement, input, t, {
    ...options,
    onPrefsChange: (p) => {
      prefs.push(p);
      options.onPrefsChange?.(p);
    },
  });
  return { doc, root, handle, stub, prefs, input };
}

const chooseHumans = (m: Mounted, count: number): void => {
  const radio = get(m.doc, `setup-humans-${count}`);
  (radio as unknown as { checked: boolean }).checked = true;
  radio.fire('change');
};
const chooseVisibility = (m: Mounted, value: IdentityVisibility): void => {
  const radio = get(m.doc, `setup-visibility-${value}`);
  (radio as unknown as { checked: boolean }).checked = true;
  radio.fire('change');
};
const chooseTier = (m: Mounted, seat: PlayerId, tier: string): void => {
  const select = get(m.doc, `setup-difficulty-${seat}`);
  setVal(select, tier);
  select.fire('change');
};
const typeSeed = (m: Mounted, text: string): void => {
  const field = get(m.doc, 'setup-seed');
  setVal(field, text);
  field.fire('input');
};
const clickStart = (m: Mounted): void => {
  get(m.doc, 'setup-start').fire('click');
};
const tierSelects = (m: Mounted): string[] =>
  SEAT_IDS.filter((seat) => m.doc.getElementById(`setup-difficulty-${seat}`) !== null);
const text = (el: FakeEl): string => el.textContent;
const alertText = (m: Mounted, selector: string): string => text(m.doc.all().find((el) => (el.getAttribute('class') ?? '').includes(selector)) as FakeEl);

// ---------------------------------------------------------------------------------------------------------
// Structure and defaults
// ---------------------------------------------------------------------------------------------------------

describe('string keys', () => {
  it('every key the screen uses resolves in both languages, and every key of the setup area is listed', () => {
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      for (const key of SETUP_STRING_KEYS) {
        const shown = t(key, { n: 2 });
        expect(shown, `${lang} ${key}`).not.toBe(key);
        expect(shown, `${lang} ${key}`).not.toMatch(/\{[A-Za-z_]+\}/);
      }
      for (const code of ['SEED_EMPTY', 'INVALID_CONFIG'] as const) expect(t(`error.${code}`), `${lang} ${code}`).not.toBe(`error.${code}`);
    }
    for (const key of Object.keys(setupStrings.en)) expect(SETUP_STRING_KEYS as readonly string[], key).toContain(key);
  });
});

describe('structure and defaults', () => {
  it('has a real label for every control, fieldset + legend for the radio groups, and native control types', () => {
    const m = mount({}, { randomSeedText: () => '1' });
    const all = m.doc.all();
    const labelFor = new Set(all.filter((el) => el.tagName === 'label').map((el) => el.getAttribute('for')));
    for (const id of ['setup-seed', 'setup-humans-1', 'setup-humans-4', 'setup-difficulty-P1', 'setup-difficulty-P3', 'setup-visibility-OWNER_ONLY', 'setup-visibility-FACE_UP', 'setup-language']) {
      expect(labelFor.has(id), id).toBe(true);
      expect(m.doc.getElementById(id), id).not.toBeNull();
    }
    const fieldsets = all.filter((el) => el.tagName === 'fieldset');
    expect(fieldsets).toHaveLength(3);
    for (const fieldset of fieldsets) expect(fieldset.children[0]?.tagName).toBe('legend');
    expect(get(m.doc, 'setup-seed').getAttribute('type')).toBe('text');
    expect(get(m.doc, 'setup-humans-1').getAttribute('type')).toBe('radio');
    expect(get(m.doc, 'setup-difficulty-P1').tagName).toBe('select');
    expect(get(m.doc, 'setup-language').tagName).toBe('select');
    expect(get(m.doc, 'setup-start').getAttribute('type')).toBe('submit');
    expect(all.filter((el) => el.tagName === 'form')).toHaveLength(1);
  });

  it('pre-fills the seed, sets autocomplete=off, spellcheck=false and the aria links, and defaults to 1 human, OWNER_ONLY', () => {
    const m = mount();
    const seed = get(m.doc, 'setup-seed');
    expect(valOf(seed)).toBe('424242');
    expect(seed.getAttribute('autocomplete')).toBe('off');
    expect(seed.getAttribute('spellcheck')).toBe('false');
    expect(seed.getAttribute('inputmode')).toBe('text');
    expect(seed.getAttribute('aria-invalid')).toBe('false');
    expect(seed.getAttribute('aria-describedby')).toContain('setup-seed-hint');
    expect(checkedOf(get(m.doc, 'setup-humans-1'))).toBe(true);
    expect(checkedOf(get(m.doc, 'setup-humans-2'))).toBe(false);
    expect(checkedOf(get(m.doc, 'setup-visibility-OWNER_ONLY'))).toBe(true);
    expect(checkedOf(get(m.doc, 'setup-visibility-FACE_UP'))).toBe(false);
    expect(text(m.doc.all().find((el) => el.getAttribute('for') === 'setup-visibility-OWNER_ONLY') as FakeEl)).toContain(t('setup.visibility.default'));
    expect(text(m.doc.all().find((el) => el.getAttribute('for') === 'setup-visibility-FACE_UP') as FakeEl)).not.toContain(t('setup.visibility.default'));
    expect(valOf(get(m.doc, 'setup-language'))).toBe('en');
    expect(tierSelects(m)).toEqual(['P1', 'P2', 'P3']);
    for (const seat of ['P1', 'P2', 'P3']) expect(valOf(get(m.doc, `setup-difficulty-${seat}`))).toBe('BEGINNER');
  });

  it('offers BEGINNER and ADVANCED in the difficulty selector and not EXPERT', () => {
    const m = mount();
    const options = get(m.doc, 'setup-difficulty-P1').children.filter((c) => c.tagName === 'option');
    expect(options.map((o) => o.getAttribute('value'))).toEqual(['BEGINNER', 'ADVANCED']);
    expect(options.map((o) => text(o))).toEqual([t('common.difficulty.BEGINNER'), t('common.difficulty.ADVANCED')]);
  });

  it('shows the random-seed button only when a generator is given, and it replaces the text', () => {
    expect(mount().doc.getElementById('setup-random-seed')).toBeNull();
    let n = 0;
    const m = mount({}, { randomSeedText: () => String(++n * 1000) });
    get(m.doc, 'setup-random-seed').fire('click');
    expect(valOf(get(m.doc, 'setup-seed'))).toBe('1000');
    get(m.doc, 'setup-random-seed').fire('click');
    expect(valOf(get(m.doc, 'setup-seed'))).toBe('2000');
    expect(m.stub.starts).toEqual([]);
  });

  it('applies initialPrefs through the sanitizer: valid fields are used, garbage falls back', () => {
    const m = mount({ initialPrefs: { humanCount: 3, difficulties: ['ADVANCED', 'EXPERT', 'ADVANCED', 'ADVANCED'], identityVisibility: 'FACE_UP' } });
    expect(checkedOf(get(m.doc, 'setup-humans-3'))).toBe(true);
    expect(tierSelects(m)).toEqual(['P3']);
    expect(valOf(get(m.doc, 'setup-difficulty-P3'))).toBe('ADVANCED');
    expect(checkedOf(get(m.doc, 'setup-visibility-FACE_UP'))).toBe(true);
    const bad = mount({ initialPrefs: { humanCount: 99, difficulties: 'EXPERT', identityVisibility: 'x' } });
    expect(checkedOf(get(bad.doc, 'setup-humans-1'))).toBe(true);
    expect(checkedOf(get(bad.doc, 'setup-visibility-OWNER_ONLY'))).toBe(true);
    expect(valOf(get(bad.doc, 'setup-difficulty-P1'))).toBe('BEGINNER');
  });

  it('shows the pass-the-device hint only with two or more human players', () => {
    const m = mount();
    expect(text(get(m.doc, 'setup-humans-hint'))).toBe('');
    chooseHumans(m, 2);
    expect(text(get(m.doc, 'setup-humans-hint'))).toBe(t('setup.humans.hint'));
    chooseHumans(m, 1);
    expect(text(get(m.doc, 'setup-humans-hint'))).toBe('');
  });
});

// ---------------------------------------------------------------------------------------------------------
// Difficulty selectors
// ---------------------------------------------------------------------------------------------------------

describe('difficulty selectors', () => {
  it('has one selector per AI seat (4 - humans) and a text when no seat is AI', () => {
    const m = mount();
    expect(tierSelects(m)).toEqual(['P1', 'P2', 'P3']);
    chooseHumans(m, 2);
    expect(tierSelects(m)).toEqual(['P2', 'P3']);
    chooseHumans(m, 3);
    expect(tierSelects(m)).toEqual(['P3']);
    chooseHumans(m, 4);
    expect(tierSelects(m)).toEqual([]);
    expect(alertText(m, 'setup-ai-none')).toBe(t('setup.ai.none'));
    chooseHumans(m, 1);
    expect(tierSelects(m)).toEqual(['P1', 'P2', 'P3']);
    expect(m.doc.all().some((el) => (el.getAttribute('class') ?? '').includes('setup-ai-none'))).toBe(false);
  });

  it('remembers the choice of each seat when the human count changes', () => {
    const m = mount();
    chooseTier(m, 'P1', 'ADVANCED');
    chooseTier(m, 'P3', 'ADVANCED');
    chooseHumans(m, 3); // only P3 is AI
    expect(valOf(get(m.doc, 'setup-difficulty-P3'))).toBe('ADVANCED');
    chooseHumans(m, 4);
    chooseHumans(m, 1);
    expect(valOf(get(m.doc, 'setup-difficulty-P1'))).toBe('ADVANCED');
    expect(valOf(get(m.doc, 'setup-difficulty-P2'))).toBe('BEGINNER');
    expect(valOf(get(m.doc, 'setup-difficulty-P3'))).toBe('ADVANCED');
  });

  it('numbers the labels among the AI seats', () => {
    const m = mount();
    chooseHumans(m, 2);
    const label = (seat: string): string => text(m.doc.all().find((el) => el.getAttribute('for') === `setup-difficulty-${seat}`) as FakeEl);
    expect(label('P2')).toBe(t('setup.ai.label', { n: 1 }));
    expect(label('P3')).toBe(t('setup.ai.label', { n: 2 }));
  });

  it('keeps the focus on the human-count radio when the selectors are rebuilt', () => {
    const m = mount();
    const radio = get(m.doc, 'setup-humans-3');
    radio.focus();
    (radio as unknown as { checked: boolean }).checked = true;
    radio.fire('change');
    expect(m.doc.activeElement).toBe(radio);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Starting (stub handler)
// ---------------------------------------------------------------------------------------------------------

describe('start with a stub handler', () => {
  it('calls startFromSetup once with exactly the entered values', () => {
    const m = mount();
    typeSeed(m, 'my seed');
    chooseHumans(m, 2);
    chooseTier(m, 'P2', 'ADVANCED');
    chooseVisibility(m, 'FACE_UP');
    clickStart(m);
    expect(m.stub.starts).toHaveLength(1);
    expect(m.stub.starts[0]).toEqual({
      seedText: 'my seed',
      humanCount: 2,
      difficulties: ['BEGINNER', 'BEGINNER', 'ADVANCED', 'BEGINNER'],
      identityVisibility: 'FACE_UP',
    });
  });

  it('starts from the Enter key in the seed field (and not from other keys), and from the form submit event', () => {
    const m = mount();
    const seed = get(m.doc, 'setup-seed');
    const other = seed.fire('keydown', { key: 'a' });
    expect(other.defaultPrevented).toBe(false);
    expect(m.stub.starts).toHaveLength(0);
    const enter = seed.fire('keydown', { key: 'Enter' });
    expect(enter.defaultPrevented).toBe(true); // no implicit submission on top of ours
    expect(m.stub.starts).toHaveLength(1);
    const m2 = mount();
    m2.doc.all().find((el) => el.tagName === 'form')?.fire('submit');
    expect(m2.stub.starts).toHaveLength(1);
  });

  it('start() on the handle works like the button', () => {
    const m = mount();
    m.handle.start();
    expect(m.stub.starts).toHaveLength(1);
  });

  it('sends one start for a double activation while the first call is running', () => {
    const m = mount();
    m.stub.reply = () => {
      get(m.doc, 'setup-start').fire('click'); // a second click while the first call is running
      get(m.doc, 'setup-seed').fire('keydown', { key: 'Enter' });
      m.handle.start();
      return { ok: true };
    };
    clickStart(m);
    expect(m.stub.starts).toHaveLength(1);
  });

  it('is inert after ok: later clicks and Enter send nothing, the button is disabled, inputs no longer notify', () => {
    const m = mount();
    clickStart(m);
    clickStart(m);
    get(m.doc, 'setup-seed').fire('keydown', { key: 'Enter' });
    m.handle.start();
    expect(m.stub.starts).toHaveLength(1);
    expect(get(m.doc, 'setup-start').hasAttribute('disabled')).toBe(true);
    const seen = m.prefs.length;
    chooseHumans(m, 3);
    expect(m.prefs).toHaveLength(seen);
  });

  it('can start again after a rejected start, and keeps every entered value', () => {
    const m = mount();
    m.stub.reply = () => ({ ok: false, reason: 'ENGINE', code: 'INVALID_CONFIG' });
    typeSeed(m, 'keep me');
    chooseHumans(m, 3);
    chooseTier(m, 'P3', 'ADVANCED');
    chooseVisibility(m, 'FACE_UP');
    clickStart(m);
    expect(valOf(get(m.doc, 'setup-seed'))).toBe('keep me');
    expect(checkedOf(get(m.doc, 'setup-humans-3'))).toBe(true);
    expect(valOf(get(m.doc, 'setup-difficulty-P3'))).toBe('ADVANCED');
    expect(checkedOf(get(m.doc, 'setup-visibility-FACE_UP'))).toBe(true);
    expect(alertText(m, 'setup-general-error')).toBe(t('error.INVALID_CONFIG'));
    m.stub.reply = () => ({ ok: true });
    clickStart(m);
    expect(m.stub.starts).toHaveLength(2);
    expect(alertText(m, 'setup-general-error')).toBe('');
  });

  it('shows SEED_EMPTY at the seed field, marks it invalid, moves the focus there and keeps the other values', () => {
    for (const lang of ['en', 'ko'] as const) {
      const m = mount({}, {}, new StubHandlers(), lang);
      m.stub.reply = () => ({ ok: false, reason: 'ENGINE', code: 'SEED_EMPTY' });
      chooseHumans(m, 2);
      get(m.doc, 'setup-start').focus();
      typeSeed(m, '');
      clickStart(m);
      const seed = get(m.doc, 'setup-seed');
      expect(text(get(m.doc, 'setup-seed-error')), lang).toBe(t('error.SEED_EMPTY'));
      expect(seed.getAttribute('aria-invalid')).toBe('true');
      expect(seed.getAttribute('aria-describedby')).toContain('setup-seed-error');
      expect(get(m.doc, 'setup-seed-error').getAttribute('role')).toBe('alert');
      expect(m.doc.activeElement).toBe(seed);
      expect(checkedOf(get(m.doc, 'setup-humans-2'))).toBe(true);
      expect(alertText(m, 'setup-general-error')).toBe('');
      typeSeed(m, 'x'); // typing clears the message
      expect(text(get(m.doc, 'setup-seed-error'))).toBe('');
      expect(seed.getAttribute('aria-invalid')).toBe('false');
    }
    setLanguage('ko');
    expect(t('error.SEED_EMPTY')).toBe('시드를 입력하세요');
  });

  it('shows INVALID_CONFIG and unknown engine codes in the general alert, not at the seed', () => {
    const m = mount();
    m.stub.reply = () => ({ ok: false, reason: 'ENGINE', code: 'INVALID_CONFIG' });
    clickStart(m);
    expect(alertText(m, 'setup-general-error')).toBe(t('error.INVALID_CONFIG'));
    expect(get(m.doc, 'setup-seed').getAttribute('aria-invalid')).toBe('false');
    expect(text(get(m.doc, 'setup-seed-error'))).toBe('');
    expect(m.doc.all().find((el) => (el.getAttribute('class') ?? '').includes('setup-general-error'))?.getAttribute('role')).toBe('alert');
  });

  it('BUSY and NO_GAME change nothing harmful and keep the form usable; DISPOSED makes it inert', () => {
    for (const reason of ['BUSY', 'NO_GAME']) {
      const m = mount();
      m.stub.reply = () => ({ ok: false, reason });
      clickStart(m);
      expect(alertText(m, 'setup-general-error')).toBe('');
      expect(text(get(m.doc, 'setup-seed-error'))).toBe('');
      expect(get(m.doc, 'setup-start').hasAttribute('disabled')).toBe(false);
      clickStart(m);
      expect(m.stub.starts, reason).toHaveLength(2);
    }
    const m = mount();
    m.stub.reply = () => ({ ok: false, reason: 'DISPOSED' });
    clickStart(m);
    clickStart(m);
    expect(m.stub.starts).toHaveLength(1);
    expect(get(m.doc, 'setup-start').hasAttribute('disabled')).toBe(true);
  });

  it('survives the host disposing the screen while the start runs', () => {
    const m = mount();
    m.stub.reply = () => {
      m.handle.dispose();
      return { ok: true };
    };
    expect(() => clickStart(m)).not.toThrow();
    expect(m.prefs).toHaveLength(1); // the successful start still reports the prefs
    expect(m.doc.getElementById('setup-seed')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------
// Prefs hook
// ---------------------------------------------------------------------------------------------------------

describe('onPrefsChange', () => {
  it('reports frozen sanitized prefs without a seed when humans, a difficulty or the visibility change, and after a start', () => {
    const m = mount();
    typeSeed(m, 'secret-seed-text');
    expect(m.prefs).toHaveLength(0); // the seed is not a pref
    chooseHumans(m, 2);
    chooseTier(m, 'P2', 'ADVANCED');
    chooseVisibility(m, 'FACE_UP');
    clickStart(m);
    expect(m.prefs).toHaveLength(4);
    expect(m.prefs[0]).toEqual({ ...DEFAULT_SETUP_PREFS, humanCount: 2 });
    expect(m.prefs[1]?.difficulties[2]).toBe('ADVANCED');
    expect(m.prefs[3]).toEqual({ humanCount: 2, difficulties: ['BEGINNER', 'BEGINNER', 'ADVANCED', 'BEGINNER'], identityVisibility: 'FACE_UP' });
    for (const prefs of m.prefs) {
      expect(Object.keys(prefs).sort()).toEqual(['difficulties', 'humanCount', 'identityVisibility']);
      expect(Object.isFrozen(prefs)).toBe(true);
      expect(JSON.stringify(prefs)).not.toContain('secret');
    }
  });

  it('does not report a failed start or a language change, and sanitizes tampered values', () => {
    const m = mount();
    m.stub.reply = () => ({ ok: false, reason: 'ENGINE', code: 'SEED_EMPTY' });
    clickStart(m);
    get(m.doc, 'setup-language').fire('change');
    expect(m.prefs).toHaveLength(0);
    chooseTier(m, 'P1', 'EXPERT'); // tampered
    expect(m.prefs[0]).toEqual(DEFAULT_SETUP_PREFS);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------------------------------------

describe('language', () => {
  it('forwards a valid choice to handlers.setLanguage only, ignores an unknown one, and never calls the prefs hook', () => {
    const m = mount();
    const select = get(m.doc, 'setup-language');
    setVal(select, 'ko');
    select.fire('change');
    setVal(select, 'fr');
    select.fire('change');
    expect(m.stub.languages).toEqual(['ko']);
    expect(m.prefs).toHaveLength(0);
  });

  it('with the real controller: switching ko <-> en changes the labels and keeps every entered value and the focus', () => {
    const doc = new FakeDocument();
    const root = doc.createElement('div');
    doc.body.appendChild(root);
    let latest: RenderInput | null = null;
    let handle: SetupHandle | null = null;
    const toInput = (input: RenderInput): SetupInput => ({ model: input.model, handlers: input.handlers, initialSeedText: '77' });
    const ctl = createController({
      schedule: () => ({ cancel: () => undefined }),
      renderer: (input) => {
        latest = input;
        handle?.update(toInput(input));
      },
      randomSeed: () => 5,
      language: () => 'en',
    });
    handle = renderSetup(doc as unknown as SetupDocument, root as unknown as HTMLElement, toInput(latest as unknown as RenderInput), t);
    const m: Mounted = { doc, root, handle, stub: new StubHandlers(), prefs: [], input: toInput(latest as unknown as RenderInput) };
    typeSeed(m, 'hello');
    chooseHumans(m, 3);
    chooseTier(m, 'P3', 'ADVANCED');
    chooseVisibility(m, 'FACE_UP');
    const select = get(doc, 'setup-language');
    select.focus();
    expect(text(get(doc, 'setup-start'))).toBe('Start game');

    setVal(select, 'ko');
    select.fire('change');
    expect(getLanguage()).toBe('ko');
    expect(ctl.getModel().language).toBe('ko');
    expect(text(get(doc, 'setup-start'))).toBe(t('setup.start'));
    expect(text(get(doc, 'setup-start'))).toBe('게임 시작');
    expect(text(doc.all().find((el) => el.getAttribute('for') === 'setup-seed') as FakeEl)).toBe('시드');
    expect(valOf(select)).toBe('ko');
    expect(valOf(get(doc, 'setup-seed'))).toBe('hello');
    expect(checkedOf(get(doc, 'setup-humans-3'))).toBe(true);
    expect(valOf(get(doc, 'setup-difficulty-P3'))).toBe('ADVANCED');
    expect(checkedOf(get(doc, 'setup-visibility-FACE_UP'))).toBe(true);
    expect(doc.activeElement).toBe(select);
    expect(text(doc.all().find((el) => el.getAttribute('for') === 'setup-humans-3') as FakeEl)).toBe('3명');

    setVal(select, 'en');
    select.fire('change');
    expect(text(get(doc, 'setup-start'))).toBe('Start game');
    expect(valOf(get(doc, 'setup-seed'))).toBe('hello');
    expect(doc.activeElement).toBe(select);
    ctl.dispose();
  });

  it('repaints from update(): a new model language changes the texts and keeps the controls', () => {
    const m = mount();
    typeSeed(m, 'abc');
    chooseHumans(m, 4);
    setLanguage('ko');
    m.handle.update({ ...m.input, model: { language: 'ko' } });
    expect(text(get(m.doc, 'setup-start'))).toBe('게임 시작');
    expect(valOf(get(m.doc, 'setup-language'))).toBe('ko');
    expect(valOf(get(m.doc, 'setup-seed'))).toBe('abc');
    expect(checkedOf(get(m.doc, 'setup-humans-4'))).toBe(true);
    expect(alertText(m, 'setup-ai-none')).toBe('모든 자리가 사람 플레이어이므로 선택할 AI 난이도가 없습니다.');
  });

  it('re-localizes a shown SEED_EMPTY message after a language change', () => {
    const m = mount();
    m.stub.reply = () => ({ ok: false, reason: 'ENGINE', code: 'SEED_EMPTY' });
    clickStart(m);
    expect(text(get(m.doc, 'setup-seed-error'))).toBe('Enter a seed');
    setLanguage('ko');
    m.handle.update({ ...m.input, model: { language: 'ko' } });
    expect(text(get(m.doc, 'setup-seed-error'))).toBe('시드를 입력하세요');
  });
});

// ---------------------------------------------------------------------------------------------------------
// With the real controller
// ---------------------------------------------------------------------------------------------------------

interface Real {
  readonly m: Mounted;
  readonly ctl: Controller;
  readonly renders: RenderInput[];
}

function real(): Real {
  const renders: RenderInput[] = [];
  const ctl = createController({
    schedule: () => ({ cancel: () => undefined }),
    renderer: (input) => void renders.push(input),
    randomSeed: () => 9,
    language: () => 'en',
  });
  const stub = new StubHandlers();
  const m = mount({ handlers: { startFromSetup: ctl.startFromSetup, setLanguage: ctl.setLanguage } }, {}, stub);
  return { m, ctl, renders };
}

/** The initial deal of a direct `newGame` for the seats the screen should have produced. */
function directView(seed: number, humans: number, tiers: readonly Difficulty[], visibility: IdentityVisibility): PlayerView {
  const seats = SEAT_IDS.map((id, i) =>
    i < humans
      ? { id, kind: 'HUMAN' as const, name: humans === 1 ? 'You' : `Player ${i + 1}` }
      : { id, kind: 'AI' as const, difficulty: tiers[i] as Difficulty, name: `AI ${i - humans + 1}` },
  );
  const config = { ...defaultConfig(), seats: seats as unknown as ReturnType<typeof defaultConfig>['seats'], identityVisibility: visibility };
  const created = newGame({ seed, config });
  if (!created.ok) throw new Error(created.error.code);
  return viewFor(created.value, 'P0');
}

describe('start with the real controller', () => {
  it('starts a game with the entered seats, difficulties, visibility and seed, for 1 to 4 humans and mixed tiers', () => {
    for (let humans = 1; humans <= 4; humans++) {
      for (const tiers of [['BEGINNER', 'BEGINNER', 'BEGINNER', 'BEGINNER'], ['BEGINNER', 'ADVANCED', 'ADVANCED', 'BEGINNER']] as const) {
        const { m, ctl } = real();
        typeSeed(m, '31337');
        chooseHumans(m, humans);
        for (const seat of tierSelects(m)) chooseTier(m, seat as PlayerId, tiers[SEAT_IDS.indexOf(seat as PlayerId)] as string);
        chooseVisibility(m, 'FACE_UP');
        clickStart(m);
        expect(ctl.getModel().screen, `${humans}`).toBe('GAME');
        expect(ctl.getView('P0'), `${humans} ${tiers.join()}`).toEqual(directView(31337, humans, tiers, 'FACE_UP'));
        expect(m.prefs.at(-1)?.humanCount).toBe(humans);
      }
    }
  });

  it('accepts seed 0, seed 4294967295, a seed with spaces and a text seed', () => {
    for (const [entered, seed] of [['0', 0], ['4294967295', 4294967295], [' 12 ', 12], ['qroker', fnv1a32('qroker')], ['4294967296', fnv1a32('4294967296')]] as const) {
      const { m, ctl } = real();
      typeSeed(m, entered);
      clickStart(m);
      expect(ctl.getModel().screen, entered).toBe('GAME');
      expect(ctl.getView('P0'), entered).toEqual(directView(seed, 1, ['BEGINNER', 'BEGINNER', 'BEGINNER', 'BEGINNER'], 'OWNER_ONLY'));
    }
  });

  it('starts with the pre-filled random seed text when the person changes nothing', () => {
    const { m, ctl } = real();
    clickStart(m);
    expect(ctl.getView('P0')).toEqual(directView(424242, 1, ['BEGINNER', 'BEGINNER', 'BEGINNER', 'BEGINNER'], 'OWNER_ONLY'));
  });

  it('an empty or whitespace-only seed keeps the setup open with SEED_EMPTY in both languages and starts nothing', () => {
    for (const lang of ['en', 'ko'] as const) {
      for (const blank of ['', '   ', '\t']) {
        const { m, ctl } = real();
        setLanguage(lang);
        m.handle.update({ ...m.input, model: { language: lang } });
        chooseHumans(m, 2);
        chooseVisibility(m, 'FACE_UP');
        typeSeed(m, blank);
        clickStart(m);
        expect(ctl.getModel().screen).toBe('SETUP');
        expect(ctl.getView('P0')).toBeNull();
        expect(text(get(m.doc, 'setup-seed-error')), `${lang} ${JSON.stringify(blank)}`).toBe(lang === 'ko' ? '시드를 입력하세요' : 'Enter a seed');
        expect(get(m.doc, 'setup-seed').getAttribute('aria-invalid')).toBe('true');
        expect(m.doc.activeElement).toBe(get(m.doc, 'setup-seed'));
        expect(checkedOf(get(m.doc, 'setup-humans-2'))).toBe(true);
        expect(checkedOf(get(m.doc, 'setup-visibility-FACE_UP'))).toBe(true);
        expect(valOf(get(m.doc, 'setup-seed'))).toBe(blank);
        // the setup can be completed afterwards
        typeSeed(m, '5');
        clickStart(m);
        expect(ctl.getModel().screen).toBe('GAME');
      }
    }
  });

  it('tampered controls reach the controller and are rejected with INVALID_CONFIG: EXPERT, unknown tier, bad counts, bad visibility', () => {
    const cases: readonly [string, (m: Mounted) => void][] = [
      ['EXPERT', (m) => chooseTier(m, 'P2', 'EXPERT')],
      ['unknown tier', (m) => chooseTier(m, 'P1', 'GRANDMASTER')],
      ['tier set without a change event', (m) => setVal(get(m.doc, 'setup-difficulty-P3'), 'EXPERT')],
      ['humans 5', (m) => tamperHumans(m, 3, '5')],
      ['humans 0', (m) => tamperHumans(m, 3, '0')],
      ['humans 2.5', (m) => tamperHumans(m, 3, '2.5')],
      ['humans NaN', (m) => tamperHumans(m, 3, 'abc')],
      ['unknown visibility', (m) => tamperVisibility(m, 'FACE_DOWN')],
    ];
    for (const [name, tamper] of cases) {
      const { m, ctl } = real();
      typeSeed(m, 'abc');
      tamper(m);
      clickStart(m);
      expect(ctl.getView('P0'), name).toBeNull();
      expect(ctl.getModel().screen, name).toBe('SETUP');
      expect(alertText(m, 'setup-general-error'), name).toBe(t('error.INVALID_CONFIG'));
      expect(valOf(get(m.doc, 'setup-seed')), name).toBe('abc'); // entered values are kept
      expect(m.prefs.every((p) => p.humanCount >= 1 && p.humanCount <= 4), name).toBe(true);
    }
  });

  it('recovers after fixing a tampered value', () => {
    const { m, ctl } = real();
    chooseTier(m, 'P1', 'EXPERT');
    clickStart(m);
    expect(ctl.getView('P0')).toBeNull();
    chooseTier(m, 'P1', 'ADVANCED');
    clickStart(m);
    expect(ctl.getModel().screen).toBe('GAME');
    expect(alertText(m, 'setup-general-error')).toBe('');
  });

  it('a stale handle (the controller was disposed) is inert after DISPOSED', () => {
    const { m, ctl } = real();
    ctl.dispose();
    clickStart(m);
    expect(get(m.doc, 'setup-start').hasAttribute('disabled')).toBe(true);
    clickStart(m);
    expect(ctl.getModel().screen).toBe('SETUP');
  });
});

function tamperHumans(m: Mounted, count: number, value: string): void {
  const radio = get(m.doc, `setup-humans-${count}`);
  setVal(radio, value);
  (radio as unknown as { checked: boolean }).checked = true;
  radio.fire('change');
}
function tamperVisibility(m: Mounted, value: string): void {
  const radio = get(m.doc, 'setup-visibility-FACE_UP');
  setVal(radio, value);
  radio.fire('change');
}

// ---------------------------------------------------------------------------------------------------------
// Lifecycle, privacy and sources
// ---------------------------------------------------------------------------------------------------------

describe('dispose and stale handles', () => {
  it('dispose removes the element, is idempotent, and later start, update and focus do nothing', () => {
    const m = mount();
    m.handle.dispose();
    m.handle.dispose();
    expect(m.root.children).toHaveLength(0);
    m.handle.start();
    m.handle.update(m.input);
    m.handle.focusFirst();
    expect(m.stub.starts).toHaveLength(0);
    expect(m.doc.activeElement).toBeNull();
  });

  it('focusFirst puts the focus on the seed field', () => {
    const m = mount();
    m.handle.focusFirst();
    expect(m.doc.activeElement).toBe(get(m.doc, 'setup-seed'));
  });

  it('has a logical Tab order: the DOM order of the focusable controls', () => {
    const m = mount({}, { randomSeedText: () => '1' });
    const focusable = descendants(asFake(m.handle.element)).filter((el) => ['input', 'select', 'button'].includes(el.tagName));
    expect(focusable.map((el) => el.getAttribute('id'))).toEqual([
      'setup-seed',
      'setup-random-seed',
      'setup-humans-1',
      'setup-humans-2',
      'setup-humans-3',
      'setup-humans-4',
      'setup-difficulty-P1',
      'setup-difficulty-P2',
      'setup-difficulty-P3',
      'setup-visibility-OWNER_ONLY',
      'setup-visibility-FACE_UP',
      'setup-language',
      'setup-start',
    ]);
    for (const el of focusable) expect(el.getAttribute('tabindex'), el.getAttribute('id') ?? '').toBeNull();
  });
});

describe('privacy and sources', () => {
  it('writes the seed text only into the seed input value: no attribute, class, id or text of any element holds it', () => {
    const m = mount();
    typeSeed(m, 'zq-secret-seed-77');
    chooseHumans(m, 2);
    clickStart(m);
    for (const el of elementsOf(asFake(m.handle.element))) {
      for (const [name, value] of el.attributes) expect(value, `${el.tagName} ${name}`).not.toContain('zq-secret-seed-77');
      if (el.tagName !== 'input') expect(el.textContent).not.toContain('zq-secret-seed-77');
    }
    expect(m.doc.all().some((el) => [...el.attributes.keys()].some((name) => name.startsWith('data-') && name !== 'data-focus-key' && name !== 'data-seat'))).toBe(false);
  });

  const DIR = dirname(fileURLToPath(import.meta.url));
  const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const FILES: readonly [string, string][] = [
    ['screens/setup.ts', join(DIR, 'setup.ts')],
    ['setup-model.ts', join(DIR, '..', 'setup-model.ts')],
    ['i18n/strings/setup.ts', join(DIR, '..', '..', 'i18n', 'strings', 'setup.ts')],
  ];

  it('the new files use no storage, console, global, URL, timer, clock or randomness', () => {
    for (const [name, path] of FILES) {
      const source = strip(readFileSync(path, 'utf8'));
      expect(source, name).not.toMatch(
        /\b(?:localStorage|sessionStorage|indexedDB|console|globalThis|window|document|location|history|navigator|setTimeout|setInterval|requestAnimationFrame|Date|crypto|performance)\b|\bMath\s*\.\s*random\b/,
      );
    }
  });

  it('the screen imports only ui/, i18n/, core/types and core/view (never core/seed, state, engine or score)', () => {
    const source = strip(readFileSync(join(DIR, 'setup.ts'), 'utf8'));
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((x) => x[1] as string);
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) expect(spec, spec).toMatch(/^(?:\.\.\/\.\.\/core\/types|\.\.\/\.\.\/core\/view|\.\.\/\.\.\/i18n|\.\.\/components\/card-face|\.\.\/dom|\.\.\/setup-model)$/);
  });

  it('setup.css is linked into the production page (task 19.4)', () => {
    const html = readFileSync(join(DIR, '..', 'index.html'), 'utf8');
    expect(html).toMatch(/styles\/setup\.css/);
  });
});
