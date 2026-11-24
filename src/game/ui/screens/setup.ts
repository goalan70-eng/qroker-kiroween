// Setup screen (task 19.1; design.md "Practice UI", error table rows `INVALID_CONFIG` and `SEED_EMPTY`; requirements
// 2.5, 2.7, 15.1, 15.2, 16.4, 16.5). One form that collects the seed text, the number of human seats, a difficulty per
// AI seat and the identity visibility, and sends them to `handlers.startFromSetup`.
//
// Use (the composition root of task 19.4 mounts it while `model.screen === 'SETUP'`):
//   let setup: SetupHandle | null = null;
//   renderer: (input) => {
//     const next = { model: input.model, handlers: input.handlers, initialSeedText: String(deps.randomSeed()) };
//     if (setup === null) setup = renderSetup(doc, root, next, t, { randomSeedText: () => String(deps.randomSeed()) });
//     else setup.update(next);
//   }
// The screen has no access to a GameConfig, a parser or the engine: it builds a plain `SetupOptions` and the controller
// validates it, parses the seed and decides. Wiring and linking `styles/setup.css` are task 19.4.
//
// DOM
//   section.setup
//     header.setup-cover > h2#setup-title
//     form.setup-form  (novalidate; aria-labelledby the title)
//       div.setup-field.setup-seed
//         label[for=setup-seed], input#setup-seed (text, autocomplete=off, spellcheck=false, aria-invalid,
//         aria-describedby = hint + error), button#setup-random-seed (only when `options.randomSeedText` is given),
//         p#setup-seed-hint, p#setup-seed-error[role=alert]
//       fieldset.setup-humans: legend + radios #setup-humans-1..4 (name setup-humans) + p#setup-humans-hint
//       fieldset.setup-ai: legend + one `div.setup-ai-row` per AI seat with label[for=setup-difficulty-<seat>] and
//         select#setup-difficulty-<seat> (BEGINNER, ADVANCED), or a text when no seat is AI
//       fieldset.setup-visibility: legend + radios #setup-visibility-OWNER_ONLY / -BLIND, hint and blind feedback selector
//       div.setup-field.setup-language: label[for=setup-language] + select#setup-language (ko, en)
//       p.setup-general-error[role=alert]
//       button#setup-start[type=submit]
// Tab order is the DOM order. Enter in the seed field starts. Every control has `id` and `data-focus-key`, so
// `renderWithFocus` keeps the focus on the same control through a language change.
//
// Behaviour
//   * Start is single-flight: while `startFromSetup` runs, a second activation does nothing; after `ok` the handle is
//     inert (button disabled) until disposed. A rejected start keeps every entered value.
//   * `{ ok: false, reason: 'ENGINE', code }`: `SEED_EMPTY` shows its message at the seed field (aria-invalid, focus
//     moves to the field); any other code shows its message in the general alert. `BUSY` and `NO_GAME` change nothing;
//     `DISPOSED` makes the handle inert.
//   * The human count and the visibility are kept as the values the controls report, not as checked values, so a
//     tampered control value reaches the controller, which rejects it with `INVALID_CONFIG`.
//   * Difficulties are remembered per seat index, so lowering and raising the human count restores the earlier choices.
//   * `options.onPrefsChange` gets sanitized, frozen `SetupPrefs` (no seed) when the human count, a difficulty or the
//     visibility changes and after a successful start. It is the hook for the prefs storage of task 20.4; this module
//     stores nothing. The language goes to `handlers.setLanguage` only.
//   * Nothing is written to a console, a storage, a global, the URL or a data attribute.
//
// Imports: ui/, i18n/, core/view and core/types only (the screen import rule); the seed is never parsed here.

import { isBlindMode } from '../../core/types';
import type { ErrorCode, PlayerId } from '../../core/types';
import { errorMessageKey, isLang, LANGUAGES } from '../../i18n';
import type { Lang, StringKey } from '../../i18n';
import type { Translate } from '../components/card-face';
import { createH, renderWithFocus } from '../dom';
import type { CreateDoc, FocusDoc } from '../dom';
import { aiSeatIds, MAX_HUMANS, MIN_HUMANS, sanitizeSetupPrefs, SETUP_DIFFICULTIES, SETUP_VISIBILITIES } from '../setup-model';
import type { SetupOptions, SetupPrefs } from '../setup-model';

/** The part of the controller's `OpResult` the screen reads. */
export interface SetupStartResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly code?: ErrorCode;
}

/** What the screen reads from the host. The controller's `RenderInput` supplies `model` and `handlers`. */
export interface SetupInput {
  readonly model: { readonly language: Lang };
  readonly handlers: {
    readonly startFromSetup: (options: SetupOptions) => SetupStartResult;
    readonly setLanguage: (lang: Lang) => void;
  };
  /** The text the seed field starts with (the host draws it from `deps.randomSeed()`). Used at mount only. */
  readonly initialSeedText: string;
  /** Stored prefs or anything else; goes through `sanitizeSetupPrefs`. Used at mount only. */
  readonly initialPrefs?: unknown;
}

export interface SetupOptionsArg {
  /** New seed text for the "random seed" button. The button exists only when this is given. */
  readonly randomSeedText?: () => string;
  /** Called with sanitized, frozen prefs (no seed) on a prefs change and after a successful start. */
  readonly onPrefsChange?: (prefs: SetupPrefs) => void;
}

export type SetupDocument = CreateDoc & Partial<FocusDoc>;

export interface SetupHandle {
  readonly element: HTMLElement;
  /** Re-renders the texts for `input.model.language`. Entered values are kept. After `dispose` it does nothing. */
  update(input: SetupInput): void;
  /** Starts exactly like the start button. */
  start(): void;
  focusFirst(): void;
  /** Removes the element. Idempotent. */
  dispose(): void;
}

/** Every string key this module passes to `t`, apart from the engine's `error.<code>` messages. */
export const SETUP_STRING_KEYS = [
  'setup.title',
  'setup.seed.label',
  'setup.seed.hint',
  'setup.seed.random',
  'setup.humans.legend',
  'setup.humans.option',
  'setup.humans.hint',
  'setup.ai.legend',
  'setup.ai.label',
  'setup.ai.none',
  'setup.visibility.legend',
  'setup.visibility.OWNER_ONLY',
  'setup.visibility.BLIND',
  'setup.blind.feedback',
  'setup.blind.sum',
  'setup.blind.score',
  'setup.visibility.default',
  'setup.visibility.hint',
  'setup.start',
  'common.language.label',
  'common.languageName.ko',
  'common.languageName.en',
  'common.difficulty.BEGINNER',
  'common.difficulty.ADVANCED',
] as const satisfies readonly StringKey[];

const SEATS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];

const DIFFICULTY_KEYS: Readonly<Record<string, StringKey>> = {
  BEGINNER: 'common.difficulty.BEGINNER',
  ADVANCED: 'common.difficulty.ADVANCED',
};
const VISIBILITY_KEYS: Readonly<Record<string, StringKey>> = {
  OWNER_ONLY: 'setup.visibility.OWNER_ONLY',
  BLIND: 'setup.visibility.BLIND',
};
const LANGUAGE_KEYS: Readonly<Record<Lang, StringKey>> = {
  en: 'common.languageName.en',
  ko: 'common.languageName.ko',
};

function hasFocusApi(doc: SetupDocument): doc is SetupDocument & FocusDoc {
  return 'activeElement' in doc && typeof doc.getElementById === 'function' && typeof doc.querySelector === 'function';
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text; // an unchanged alert is not announced again
}

function clear(el: HTMLElement): void {
  while (el.firstChild !== null) el.removeChild(el.firstChild);
}

/** The value a control reports: its `value` property, else its `value` attribute, else ''. */
function valueOf(el: HTMLElement): string {
  const value: unknown = (el as unknown as { value?: unknown }).value;
  if (typeof value === 'string') return value;
  return el.getAttribute('value') ?? '';
}

const setValue = (el: HTMLElement, value: string): void => {
  (el as unknown as { value: string }).value = value;
};
const setChecked = (el: HTMLElement, checked: boolean): void => {
  (el as unknown as { checked: boolean }).checked = checked;
};
const setDisabled = (el: HTMLElement, disabled: boolean): void => {
  // Only ever turned on (a started setup stays inert until disposed), so there is no `removeAttribute` here.
  if (!disabled) return;
  (el as unknown as { disabled: boolean }).disabled = true;
  el.setAttribute('disabled', '');
};

interface AiRow {
  readonly index: number;
  readonly label: HTMLElement;
  readonly select: HTMLElement;
  readonly options: readonly { readonly el: HTMLElement; readonly tier: string }[];
}

/** Mounts the setup screen into `root` and returns its handle. */
export function renderSetup(
  doc: SetupDocument,
  root: HTMLElement,
  input: SetupInput,
  t: Translate,
  options: SetupOptionsArg = {},
): SetupHandle {
  const h = createH(doc);
  const prefs = sanitizeSetupPrefs(input.initialPrefs);

  let current: SetupInput = input;
  let disposed = false;
  let starting = false;
  let inert = false;
  /** Raw values of the controls; invalid values are kept so that the controller can reject them. */
  let humansRaw: unknown = prefs.humanCount;
  let visibilityRaw: unknown = prefs.identityVisibility;
  const difficulties: unknown[] = [...prefs.difficulties];
  /** The last valid human count: it decides how many difficulty selectors are shown. */
  let shownHumans = prefs.humanCount;
  let seedErrorCode: ErrorCode | null = null;
  let generalErrorCode: ErrorCode | null = null;
  let aiRows: AiRow[] = [];

  const notifyPrefs = (): void => {
    options.onPrefsChange?.(sanitizeSetupPrefs({ humanCount: humansRaw, difficulties, identityVisibility: visibilityRaw }));
  };

  // ---- controls -------------------------------------------------------------------------------------------

  const titleEl = h('h2', { id: 'setup-title', class: 'setup-title' });

  const seedLabel = h('label', { class: 'setup-label', attrs: { for: 'setup-seed' } });
  const seedInput = h('input', {
    id: 'setup-seed',
    focusKey: 'setup-seed',
    class: 'setup-input',
    attrs: { type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' },
    aria: { describedby: 'setup-seed-hint setup-seed-error', invalid: 'false' },
    on: {
      keydown: (event) => {
        const e = event as KeyboardEvent;
        if (e.key !== 'Enter' || e.isComposing === true) return;
        e.preventDefault(); // no implicit form submission on top of ours
        start();
      },
      input: () => {
        if (seedErrorCode !== null) {
          seedErrorCode = null;
          paint();
        }
      },
    },
  });
  setValue(seedInput, input.initialSeedText);
  const seedHint = h('p', { id: 'setup-seed-hint', class: 'setup-hint' });
  const seedError = h('p', { id: 'setup-seed-error', class: 'setup-error', attrs: { role: 'alert' } });
  const randomButton =
    options.randomSeedText === undefined
      ? null
      : h('button', {
          id: 'setup-random-seed',
          focusKey: 'setup-random-seed',
          class: 'setup-button',
          attrs: { type: 'button' },
          on: {
            click: () => {
              if (disposed || inert) return;
              setValue(seedInput, (options.randomSeedText as () => string)());
              seedErrorCode = null;
              paint();
            },
          },
        });
  const seedField = h('div', { class: 'setup-field setup-seed' }, seedLabel, seedInput, randomButton, seedHint, seedError);

  // Human count: a radio group.
  const humansLegend = h('legend', { class: 'setup-legend' });
  const humansHint = h('p', { id: 'setup-humans-hint', class: 'setup-hint' });
  const humanItems: { readonly radio: HTMLElement; readonly label: HTMLElement; readonly count: number }[] = [];
  for (let count = MIN_HUMANS; count <= MAX_HUMANS; count++) {
    const id = `setup-humans-${count}`;
    const radio = h('input', {
      id,
      focusKey: id,
      class: 'setup-radio',
      attrs: { type: 'radio', name: 'setup-humans', value: String(count) },
      on: {
        change: () => {
          if (inert || disposed) return;
          for (const item of humanItems) setChecked(item.radio, item.radio === radio);
          humansRaw = Number(valueOf(radio));
          if (typeof humansRaw === 'number' && humansRaw >= MIN_HUMANS && humansRaw <= MAX_HUMANS && Number.isInteger(humansRaw)) {
            shownHumans = humansRaw;
          }
          generalErrorCode = null;
          buildAiRows();
          paint();
          notifyPrefs();
        },
      },
    });
    setChecked(radio, count === prefs.humanCount);
    humanItems.push({ radio, label: h('label', { class: 'setup-radio-label', attrs: { for: id } }), count });
  }
  const humansSet = h(
    'fieldset',
    { class: 'setup-group setup-humans', aria: { describedby: 'setup-humans-hint' } },
    humansLegend,
    ...humanItems.map((item) => h('div', { class: 'setup-choice' }, item.radio, item.label)),
    humansHint,
  );

  // AI difficulty selectors, one per AI seat; rebuilt when the human count changes.
  const aiLegend = h('legend', { class: 'setup-legend' });
  const aiSlot = h('div', { class: 'setup-ai-rows' });
  const aiSet = h('fieldset', { class: 'setup-group setup-ai' }, aiLegend, aiSlot);

  function buildAiRows(): void {
    for (const row of aiRows) difficulties[row.index] = valueOf(row.select); // keep what was chosen before the rebuild
    clear(aiSlot);
    aiRows = aiSeatIds(shownHumans).map((seat) => {
      const index = SEATS.indexOf(seat);
      const id = `setup-difficulty-${seat}`;
      const label = h('label', { class: 'setup-label', attrs: { for: id } });
      const optionEls = SETUP_DIFFICULTIES.map((tier) => ({ tier, el: h('option', { attrs: { value: tier } }) }));
      const select = h(
        'select',
        {
          id,
          focusKey: id,
          class: 'setup-select',
          on: {
            change: () => {
              if (inert || disposed) return;
              difficulties[index] = valueOf(select);
              generalErrorCode = null;
              paint();
              notifyPrefs();
            },
          },
        },
        ...optionEls.map((o) => o.el),
      );
      setValue(select, typeof difficulties[index] === 'string' ? (difficulties[index] as string) : '');
      aiSlot.appendChild(h('div', { class: 'setup-ai-row', attrs: { 'data-seat': seat } }, label, select));
      return { index, label, select, options: optionEls.map((o) => ({ el: o.el, tier: o.tier })) };
    });
    if (aiRows.length === 0) aiSlot.appendChild(h('p', { class: 'setup-hint setup-ai-none' }));
  }

  // Identity visibility: a radio group.
  const visibilityLegend = h('legend', { class: 'setup-legend' });
  const visibilityHint = h('p', { id: 'setup-visibility-hint', class: 'setup-hint' });
  const feedbackLabel = h('label', { class: 'setup-label', attrs: { for: 'setup-blind-feedback' } });
  const sumOption = h('option', { attrs: { value: 'BLIND' } });
  const scoreOption = h('option', { attrs: { value: 'BLIND_SCORE_ONLY' } });
  const feedback = h('select', {
    id: 'setup-blind-feedback', focusKey: 'setup-blind-feedback', class: 'setup-select',
    on: { change: () => {
      if (inert || disposed) return;
      visibilityRaw = valueOf(feedback);
      notifyPrefs();
    } },
  }, sumOption, scoreOption);
  setValue(feedback, prefs.identityVisibility === 'BLIND_SCORE_ONLY' ? 'BLIND_SCORE_ONLY' : 'BLIND');
  const feedbackField = h('div', { class: 'setup-field' }, feedbackLabel, feedback);
  const visibilityItems = SETUP_VISIBILITIES.filter(value => value !== 'BLIND_SCORE_ONLY').map((value) => {
    const id = `setup-visibility-${value}`;
    const radio = h('input', {
      id,
      focusKey: id,
      class: 'setup-radio',
      attrs: { type: 'radio', name: 'setup-visibility', value },
      on: {
        change: () => {
          if (inert || disposed) return;
          for (const item of visibilityItems) setChecked(item.radio, item.radio === radio);
          visibilityRaw = valueOf(radio) === 'BLIND' ? valueOf(feedback) : valueOf(radio);
          generalErrorCode = null;
          paint();
          notifyPrefs();
        },
      },
    });
    setChecked(radio, value === prefs.identityVisibility || (value === 'BLIND' && isBlindMode(prefs.identityVisibility)));
    return { value, radio, label: h('label', { class: 'setup-radio-label', attrs: { for: id } }) };
  });
  const visibilitySet = h(
    'fieldset',
    { class: 'setup-group setup-visibility', aria: { describedby: 'setup-visibility-hint' } },
    visibilityLegend,
    ...visibilityItems.map((item) => h('div', { class: 'setup-choice' }, item.radio, item.label)),
    visibilityHint,
  );

  // Language.
  const languageLabel = h('label', { class: 'setup-label', attrs: { for: 'setup-language' } });
  const languageOptions = LANGUAGES.map((lang) => ({ lang, el: h('option', { attrs: { value: lang } }) }));
  const languageSelect = h(
    'select',
    {
      id: 'setup-language',
      focusKey: 'setup-language',
      class: 'setup-select',
      on: {
        change: () => {
          if (disposed) return;
          const chosen = valueOf(languageSelect);
          if (!isLang(chosen)) return;
          current.handlers.setLanguage(chosen);
          paint(); // the controller normally re-renders through `update`; painting again is harmless
        },
      },
    },
    ...languageOptions.map((o) => o.el),
  );
  setValue(languageSelect, input.model.language);
  const languageField = h('div', { class: 'setup-field setup-language' }, languageLabel, languageSelect);

  const generalError = h('p', { class: 'setup-error setup-general-error', attrs: { role: 'alert' } });
  const startButton = h('button', {
    id: 'setup-start',
    focusKey: 'setup-start',
    class: 'setup-start',
    attrs: { type: 'submit' },
    on: {
      click: (event) => {
        event.preventDefault();
        start();
      },
    },
  });

  const form = h(
    'form',
    {
      class: 'setup-form',
      attrs: { novalidate: true },
      aria: { labelledby: 'setup-title' },
      on: {
        submit: (event) => {
          event.preventDefault();
          start();
        },
      },
    },
    seedField,
    humansSet,
    aiSet,
    visibilitySet,
    languageField,
    generalError,
    startButton,
  );
  const frontispiece = h('header', { class: 'setup-cover' },
    h('span', { class: 'setup-engraving', aria: { hidden: 'true' } }),
    titleEl,
  );
  const panel = h('section', { class: 'setup' }, frontispiece, form);

  // ---- text -----------------------------------------------------------------------------------------------

  /** Writes every localized text and state attribute from the closure state. Never rebuilds a control. */
  function paint(): void {
    setText(titleEl, t('setup.title'));
    setText(seedLabel, t('setup.seed.label'));
    setText(seedHint, t('setup.seed.hint'));
    setText(seedError, seedErrorCode === null ? '' : t(errorMessageKey(seedErrorCode)));
    seedInput.setAttribute('aria-invalid', seedErrorCode === null ? 'false' : 'true');
    if (randomButton !== null) setText(randomButton, t('setup.seed.random'));

    setText(humansLegend, t('setup.humans.legend'));
    for (const item of humanItems) setText(item.label, t('setup.humans.option', { n: item.count }));
    setText(humansHint, shownHumans >= 2 ? t('setup.humans.hint') : '');

    setText(aiLegend, t('setup.ai.legend'));
    for (const row of aiRows) {
      setText(row.label, t('setup.ai.label', { n: row.index - shownHumans + 1 }));
      for (const option of row.options) setText(option.el, t(DIFFICULTY_KEYS[option.tier] as StringKey));
    }
    const none = aiSlot.firstChild;
    if (aiRows.length === 0 && none !== null) setText(none as HTMLElement, t('setup.ai.none'));

    setText(visibilityLegend, t('setup.visibility.legend'));
    for (const item of visibilityItems) {
      const text = t(VISIBILITY_KEYS[item.value] as StringKey);
      setText(item.label, item.value === SETUP_VISIBILITIES[0] ? `${text} ${t('setup.visibility.default')}` : text);
    }
    setText(visibilityHint, t('setup.visibility.hint'));
    setText(feedbackLabel, t('setup.blind.feedback'));
    setText(sumOption, t('setup.blind.sum'));
    setText(scoreOption, t('setup.blind.score'));
    if (visibilityRaw === 'BLIND' || visibilityRaw === 'BLIND_SCORE_ONLY') {
      if (feedbackField.parentNode !== visibilitySet) visibilitySet.appendChild(feedbackField);
    } else if (feedbackField.parentNode === visibilitySet) {
      visibilitySet.removeChild(feedbackField);
    }

    setText(languageLabel, t('common.language.label'));
    for (const option of languageOptions) setText(option.el, t(LANGUAGE_KEYS[option.lang]));
    setValue(languageSelect, current.model.language);

    setText(generalError, generalErrorCode === null ? '' : t(errorMessageKey(generalErrorCode)));
    setText(startButton, t('setup.start'));
    setDisabled(startButton, inert);
  }

  function repaint(): void {
    if (hasFocusApi(doc)) renderWithFocus(doc, paint);
    else paint();
  }

  // ---- start ----------------------------------------------------------------------------------------------

  function start(): void {
    if (disposed || inert || starting) return;
    for (const row of aiRows) difficulties[row.index] = valueOf(row.select); // tampering without a change event
    seedErrorCode = null;
    generalErrorCode = null;
    const request = {
      seedText: valueOf(seedInput),
      humanCount: humansRaw,
      difficulties: [...difficulties],
      identityVisibility: visibilityRaw,
    } as unknown as SetupOptions;
    starting = true;
    let result: SetupStartResult;
    try {
      result = current.handlers.startFromSetup(request);
    } finally {
      starting = false;
    }
    let focusSeed = false;
    if (result.ok) {
      inert = true;
      notifyPrefs();
    } else if (result.reason === 'ENGINE' && result.code !== undefined) {
      if (result.code === 'SEED_EMPTY') {
        seedErrorCode = result.code;
        focusSeed = true;
      } else {
        generalErrorCode = result.code;
      }
    } else if (result.reason === 'DISPOSED') {
      inert = true;
    } // 'BUSY' and 'NO_GAME': nothing changed, the form stays as it is
    if (disposed) return; // the host may have replaced the screen while the game started
    repaint();
    if (focusSeed) seedInput.focus();
  }

  function update(next: SetupInput): void {
    if (disposed) return;
    current = next;
    repaint();
  }

  // ---- initial state --------------------------------------------------------------------------------------

  buildAiRows();
  root.appendChild(panel);
  paint();

  return {
    element: panel,
    update,
    start,
    focusFirst() {
      if (!disposed) seedInput.focus();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (panel.parentNode !== null) panel.parentNode.removeChild(panel);
    },
  };
}
