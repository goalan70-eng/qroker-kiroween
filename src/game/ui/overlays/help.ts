// Rules and help overlay (task 19.3; requirements 16.1, 16.2). A modal dialog that summarizes the approved rules in the
// current language. Openable from every screen: the host mounts one handle and calls `open()` from a button on any screen
// (the opener buttons and the host are task 19.4).
//
// PRIVACY BY CONSTRUCTION: the input is `{ model: { language }, provisional }`. There is no view, no hand, no Guess and no
// handler in it, so the text cannot show private data. The only game-derived fact is the public flag
// `rules.scoreConfig.provisional`, which the host passes as a boolean (see `buildBannerModel`).
//
// Section table: every section summarizes the requirements named in `HELP_SECTIONS[i].requirements` (requirement numbers
// of .kiro/specs/qroker-playable-game/requirements.md). The text says nothing that those criteria do not say, and it
// contains no point value. Points are described only as depending on the distance between a Guess and the Hidden_Sum.
//
//   id          topic                            requirements
//   goal        objective                        7.1, 7.6, 8.1, 9.1, 9.4
//   board       8×8 board, 4 neutral cards       3.1, 2.2
//   placement   edge adjacency, no diagonals     3.2, 13.13a, 13.13d
//   howto       drag, position first, confirm    13.3, 13.4, 13.10, 13.11, 13.14e
//   rotation    180° only for clubs and spades   4.2, 4.5, 13.12
//   codes       composite code, 2×2 region       4.3, 4.4, 5.2
//   guesses     private Guess 4 to 52            5.3, 7.1, 7.2, 7.5, 7.8
//   drawing     draw rule, first placement       6.3, 6.4, 6.5, 6.6, 9.3
//   reveal      simultaneous reveal, points      7.1, 7.6, 7.8, 8.1, 8.2
//   end         hand-empty end, ranking          8.8, 9.1, 9.3, 9.4
//   visibility  Normal and Blind feedback options    10.4, 10.5, 15.1
//   provisional notice, only when flagged        16.1, 14.8, 8.5
//
// Behaviour: see `modal.ts` for the shared dialog mechanics (focus trap, Escape, focus restoration, no duplicate
// listeners). `update` re-renders the text in place, so a language change keeps the dialog open and the focus where it is.
//
// DOM
//   div.overlay-backdrop > div.overlay-dialog.help[role=dialog][aria-modal=true][aria-labelledby=help-title][aria-describedby=help-intro][lang]
//     h2#help-title[tabindex=-1]
//     p#help-intro
//     div.help-body                 rebuilt on every render
//       p.help-provisional[role=note]   only while `provisional`
//       section.help-section[aria-labelledby=help-<id>-title] > h3 + p     one per HELP_SECTIONS entry
//     div.help-actions > button.help-close[type=button]
//
// Imports: ui/, i18n/ (types) only.

import type { Lang, StringKey } from '../../i18n';
import { createH } from '../dom';
import { BANNER_GLYPH } from '../components/banner';
import type { Translate } from '../components/card-face';
import { createModal } from './modal';
import type { ModalDocument } from './modal';

/** What the help reads. No game view, no private data: a language and one public flag. */
export interface HelpInput {
  readonly model: { readonly language: Lang };
  /** `rules.scoreConfig.provisional` of the running game, or `true` when no game runs (the placeholder is the default). */
  readonly provisional: boolean;
}

export interface HelpOptions {
  /** Receives the focus when the opener is gone after closing. */
  readonly fallbackFocus?: Pick<HTMLElement, 'focus'> | null;
  /** Called when the person closes the dialog (Escape, Close button, backdrop). Not called by `close()` or `dispose()`. */
  readonly onClose?: () => void;
}

export type HelpMode = 'open' | 'closed';

export interface HelpHandle {
  /** The backdrop that holds the dialog. It is a child of `root` only while open. */
  readonly element: HTMLElement;
  /** The dialog element (`role="dialog"`). */
  readonly dialog: HTMLElement;
  readonly mode: HelpMode;
  /** Opens the dialog. Does nothing while open or after `dispose`. */
  open(): void;
  /** Closes the dialog and restores the focus. Does nothing while closed. */
  close(): void;
  /** Re-renders the text (language, provisional notice) in place. After `dispose` it does nothing. */
  update(input: HelpInput): void;
  /** Removes the DOM and the listeners; everything is inert afterwards. Idempotent. */
  dispose(): void;
}

export interface HelpSection {
  readonly id: string;
  readonly titleKey: StringKey;
  readonly bodyKey: StringKey;
  /** The requirements (see the table in the module comment) that the section summarizes. */
  readonly requirements: readonly string[];
}

/** The help content, in display order. The module comment maps every entry to the requirements it summarizes. */
export const HELP_SECTIONS: readonly HelpSection[] = Object.freeze([
  { id: 'goal', titleKey: 'help.s1.title', bodyKey: 'help.s1.body', requirements: ['7.1', '7.6', '8.1', '9.1', '9.4'] },
  { id: 'board', titleKey: 'help.s2.title', bodyKey: 'help.s2.body', requirements: ['3.1', '2.2'] },
  { id: 'placement', titleKey: 'help.s3.title', bodyKey: 'help.s3.body', requirements: ['3.2', '13.13a', '13.13d'] },
  { id: 'howto', titleKey: 'help.s4.title', bodyKey: 'help.s4.body', requirements: ['13.3', '13.4', '13.10', '13.11', '13.14e'] },
  { id: 'rotation', titleKey: 'help.s5.title', bodyKey: 'help.s5.body', requirements: ['4.2', '4.5', '13.12'] },
  { id: 'codes', titleKey: 'help.s6.title', bodyKey: 'help.s6.body', requirements: ['4.3', '4.4', '5.2'] },
  { id: 'guesses', titleKey: 'help.s7.title', bodyKey: 'help.s7.body', requirements: ['5.3', '7.1', '7.2', '7.5', '7.8'] },
  { id: 'drawing', titleKey: 'help.s8.title', bodyKey: 'help.s8.body', requirements: ['6.3', '6.4', '6.5', '6.6', '9.3'] },
  { id: 'reveal', titleKey: 'help.s9.title', bodyKey: 'help.s9.body', requirements: ['7.1', '7.6', '7.8', '8.1', '8.2'] },
  { id: 'end', titleKey: 'help.s10.title', bodyKey: 'help.s10.body', requirements: ['8.8', '9.1', '9.3', '9.4'] },
  { id: 'visibility', titleKey: 'help.visibility.title', bodyKey: 'help.visibility.body', requirements: ['10.4', '10.5', '15.1'] },
] as const satisfies readonly HelpSection[]);

/** Every string key this module passes to `t`. */
export const HELP_STRING_KEYS = [
  'help.title',
  'help.intro',
  ...HELP_SECTIONS.flatMap((s) => [s.titleKey, s.bodyKey]),
  'help.provisional.body',
  'common.provisionalScoring',
  'common.button.close',
] as const satisfies readonly StringKey[];

export function renderHelp(doc: ModalDocument, root: HTMLElement, input: HelpInput, t: Translate, options: HelpOptions = {}): HelpHandle {
  const h = createH(doc);
  let current: HelpInput = input;
  let disposed = false;

  function userClose(): void {
    if (disposed || !modal.isOpen) return;
    modal.hide();
    options.onClose?.();
  }

  const titleEl = h('h2', { id: 'help-title', class: 'help-title', attrs: { tabindex: -1 } });
  const introEl = h('p', { id: 'help-intro', class: 'help-intro' });
  const bodyEl = h('div', { class: 'help-body' });
  const closeBtn = h('button', { id: 'help-close', focusKey: 'help-close', class: 'help-close', attrs: { type: 'button' }, on: { click: () => userClose() } });
  const modal = createModal(doc, {
    role: 'dialog',
    labelledBy: 'help-title',
    describedBy: 'help-intro',
    fallbackFocus: options.fallbackFocus ?? null,
    onDismiss: userClose,
    backdropDismiss: true,
    dialogClass: 'help',
  });
  modal.dialog.appendChild(titleEl);
  modal.dialog.appendChild(introEl);
  modal.dialog.appendChild(bodyEl);
  modal.dialog.appendChild(h('div', { class: 'help-actions' }, closeBtn));

  function paint(): void {
    modal.dialog.setAttribute('lang', current.model.language);
    titleEl.textContent = t('help.title');
    introEl.textContent = t('help.intro');
    closeBtn.textContent = t('common.button.close');
    while (bodyEl.firstChild !== null) bodyEl.removeChild(bodyEl.firstChild);
    if (current.provisional) {
      bodyEl.appendChild(
        h(
          'p',
          { class: 'help-provisional', attrs: { role: 'note' } },
          h('span', { class: 'help-provisional__glyph', aria: { hidden: 'true' } }, `${BANNER_GLYPH} `),
          h('strong', null, t('common.provisionalScoring')),
          `: ${t('help.provisional.body')}`,
        ),
      );
    }
    for (const section of HELP_SECTIONS) {
      const titleId = `help-${section.id}-title`;
      bodyEl.appendChild(
        h(
          'section',
          { class: 'help-section', attrs: { 'data-section': section.id }, aria: { labelledby: titleId } },
          h('h3', { id: titleId, class: 'help-section__title' }, t(section.titleKey)),
          h('p', { class: 'help-section__body' }, t(section.bodyKey)),
        ),
      );
    }
  }

  paint();

  return {
    element: modal.backdrop,
    dialog: modal.dialog,
    get mode() {
      return modal.isOpen ? 'open' : 'closed';
    },
    open() {
      if (!disposed) modal.show(root, () => titleEl);
    },
    close() {
      if (!disposed) modal.hide();
    },
    update(next) {
      if (disposed) return;
      current = next;
      paint();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      modal.destroy();
    },
  };
}
