// App shell (task 16.1): title, language selector, provisional-scoring banner and an honest notice that the
// playable game screens are not connected yet. There is no Play button, no game and no camera here.
//
// PROVISIONAL implementation choice: Vite + plain DOM/CSS + no UI framework is the choice of this batch (design
// decisions D2/D3 as written in the design; open question OQ-7 is not closed by this file).
//
// Task 16.2 replaces this module's role: `mountApp(root, deps)` with the store and controller will render the
// screens, and `mountShell` can then be deleted or reduced to the language-selector part of the top bar.
//
// Rules kept here (checked by shell.test.ts):
//   * text is assigned with `textContent` and attributes with `setAttribute` only; no HTML string is ever parsed;
//   * only DOM objects passed in (`root`, `deps.doc`) are used; nothing is attached to `window` or `globalThis`;
//   * a language change updates texts in place, so the <select> keeps focus (it is never rebuilt).

import { detectLanguage, getLanguage, isLang, LANGUAGES, setLanguage, t } from '../i18n';
import type { Lang } from '../i18n';

export interface ShellDeps {
  /** `navigator.languages` (or `navigator.language`). Persistence of the choice is task 20; no saved value is read. */
  readonly languages: readonly string[] | string | null | undefined;
  readonly doc: Document;
}

export interface ShellHandle {
  /** The language selector element. */
  readonly select: HTMLSelectElement;
  /** Applies a language as if it had been chosen in the selector. */
  readonly applyLanguage: (lang: Lang) => void;
}

const SELECT_ID = 'shell-language';

/** Renders the shell into the (empty) `root` and returns a handle. */
export function mountShell(root: HTMLElement, deps: ShellDeps): ShellHandle {
  const { doc } = deps;

  const main = doc.createElement('main');
  main.setAttribute('class', 'shell');

  const title = doc.createElement('h1');
  title.setAttribute('class', 'shell__title');

  const languageRow = doc.createElement('div');
  languageRow.setAttribute('class', 'shell__language');

  const label = doc.createElement('label');
  label.setAttribute('for', SELECT_ID);

  const select = doc.createElement('select');
  select.setAttribute('id', SELECT_ID);
  select.setAttribute('class', 'shell__select');

  const options = new Map<Lang, HTMLOptionElement>();
  for (const lang of LANGUAGES) {
    const option = doc.createElement('option');
    option.setAttribute('value', lang);
    select.appendChild(option);
    options.set(lang, option);
  }

  languageRow.appendChild(label);
  languageRow.appendChild(select);

  const banner = doc.createElement('p');
  banner.setAttribute('class', 'shell__banner');

  const notice = doc.createElement('p');
  notice.setAttribute('class', 'shell__notice');

  main.appendChild(title);
  main.appendChild(languageRow);
  main.appendChild(banner);
  main.appendChild(notice);
  root.appendChild(main);

  /** Writes all texts for the current language in place. Elements are never replaced. */
  const renderTexts = (): void => {
    const lang = getLanguage();
    doc.documentElement.lang = lang;
    doc.title = t('common.appTitle');
    title.textContent = t('common.appTitle');
    label.textContent = t('common.language.label');
    for (const [code, option] of options) {
      option.textContent = t(`common.languageName.${code}`);
    }
    select.value = lang;
    banner.textContent = t('common.provisionalScoring');
    notice.textContent = t('common.shellNotice');
  };

  const applyLanguage = (lang: Lang): void => {
    setLanguage(lang);
    renderTexts();
  };

  select.addEventListener('change', () => {
    const chosen: unknown = select.value;
    if (isLang(chosen)) applyLanguage(chosen);
  });

  applyLanguage(detectLanguage(deps.languages, null));
  return { select, applyLanguage };
}
