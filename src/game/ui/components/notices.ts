// Persistence notices and the autosave status line (task 20.4; design.md "Task 20.4 persistence integration contracts" f).
//
// `renderNotices(doc, root, input, t)` draws ONE `aria-live="polite"` region in the top bar of the host. It lists the
// localized text of every `model.notices` entry (closed kinds and reason codes only: no saved text, card, Guess, Seed
// or engine detail can reach it) and, only when `model.storage === 'DURABLE'`, the autosave status line with the
// plain statement that the save is not secret. Nothing is said for `UNKNOWN`, and `MEMORY_ONLY` and `FAILED` never
// produce a "saved" text: their notices say that the game cannot be kept.
//
// DOM
//   div.notices[aria-live=polite][aria-atomic=false][aria-label]      always mounted, never `hidden`
//     div.notice[data-notice=<KIND>][data-focus-key=notice-<KIND>]    one per notice, in model order
//       p.notice-text
//       button.notice-dismiss                                          only SAVE_DISCARDED and STORAGE_READ_FAILED
//     p.notice-status[data-notice=STATUS]                              only while storage is DURABLE; always last
//
// Empty state (decision): the region stays in the document and is simply EMPTY, with no padding, so that it takes no
// space. It is not `hidden` and not `display: none`, because a live region that appears together with its first text
// is announced unreliably. Items are keyed by their kind: an update keeps the elements of kinds that are still present
// (so a focused dismiss button keeps its focus), removes the ones that are gone and appends new ones; a text is only
// written when it changed, so an unchanged notice is not announced again. A language change rewrites texts in place.
//
// Dismiss: the button calls `handlers.dismissNotice(kind)` once per item. The controller removes the notice and the
// next `update` removes the item. After a dismissal the focus is on the page body (the button is gone); the host does
// not move it.
//
// Imports: ui/ and i18n/ types only (component module of boundaries.test.ts).

import type { StringKey } from '../../i18n';
import type { CreateDoc } from '../dom';
import { createH } from '../dom';
import type { Notice, StorageStatus } from '../store';
import type { Translate } from './card-face';

/** What the component reads from a render input. The controller's `RenderInput` satisfies this structurally. */
export interface NoticesInput {
  readonly model: {
    readonly notices: readonly Notice[];
    readonly storage: StorageStatus;
  };
  readonly handlers: { readonly dismissNotice: (kind: Notice['kind']) => void };
}

export type NoticesDocument = CreateDoc;

export interface NoticesHandle {
  /** The live region (a child of `root` until `dispose`). */
  readonly element: HTMLElement;
  /** Re-renders texts and items for `input`. After `dispose` it does nothing. */
  update(input: NoticesInput): void;
  /** Removes the region. Idempotent. */
  dispose(): void;
}

/** The kinds that have a dismiss button. The controller ignores `dismissNotice` for the others. */
const DISMISSIBLE: readonly Notice['kind'][] = ['SAVE_DISCARDED', 'STORAGE_READ_FAILED'];

const REASON_KEYS = {
  CORRUPT: 'persistence.notice.SAVE_DISCARDED.CORRUPT',
  SAVE_VERSION: 'persistence.notice.SAVE_DISCARDED.SAVE_VERSION',
  RULES_VERSION: 'persistence.notice.SAVE_DISCARDED.RULES_VERSION',
  REPLAY_REJECTED: 'persistence.notice.SAVE_DISCARDED.REPLAY_REJECTED',
  GAME_ENDED: 'persistence.notice.SAVE_DISCARDED.GAME_ENDED',
  INVALID_VALUE: 'persistence.notice.SAVE_DISCARDED.INVALID_VALUE',
} as const satisfies Record<string, StringKey>;

/** Every string key this module passes to `t`. */
export const NOTICES_STRING_KEYS = [
  'persistence.notices.label',
  'persistence.notice.dismiss',
  'persistence.notice.STORAGE_NOT_DURABLE',
  'persistence.notice.STORAGE_WRITE_FAILED',
  'persistence.notice.STORAGE_READ_FAILED',
  ...Object.values(REASON_KEYS),
  'persistence.status.durable',
  'persistence.status.notSecret',
] as const satisfies readonly StringKey[];

/** The localized text of a notice. An unknown reason falls back to the `CORRUPT` text (never shows the raw code). */
function textKeyOf(notice: Notice): StringKey {
  switch (notice.kind) {
    case 'STORAGE_NOT_DURABLE':
      return 'persistence.notice.STORAGE_NOT_DURABLE';
    case 'STORAGE_WRITE_FAILED':
      return 'persistence.notice.STORAGE_WRITE_FAILED';
    case 'STORAGE_READ_FAILED':
      return 'persistence.notice.STORAGE_READ_FAILED';
    case 'SAVE_DISCARDED': {
      const reason: unknown = notice.reason;
      return typeof reason === 'string' && Object.prototype.hasOwnProperty.call(REASON_KEYS, reason)
        ? REASON_KEYS[reason as keyof typeof REASON_KEYS]
        : REASON_KEYS.CORRUPT;
    }
  }
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text; // an unchanged live text is not announced again
}

interface Item {
  readonly el: HTMLElement;
  readonly text: HTMLElement;
  readonly button: HTMLElement | null;
  /** The dismiss handler ran for this item. */
  sent: boolean;
}

/** Mounts the notices region into `root` and returns its handle. */
export function renderNotices(doc: NoticesDocument, root: HTMLElement, input: NoticesInput, t: Translate): NoticesHandle {
  const h = createH(doc);
  let current: NoticesInput = input;
  let disposed = false;
  const items = new Map<Notice['kind'], Item>();
  let status: HTMLElement | null = null;

  const region = h('div', { class: 'notices', aria: { live: 'polite', atomic: 'false' } });

  function makeItem(kind: Notice['kind']): Item {
    const text = h('p', { class: 'notice-text' });
    const button = DISMISSIBLE.includes(kind)
      ? h('button', {
          focusKey: `notice-dismiss-${kind}`,
          class: 'notice-dismiss',
          attrs: { type: 'button' },
          on: { click: () => dismiss(kind) },
        })
      : null;
    const el = h('div', { class: 'notice', attrs: { 'data-notice': kind } }, text, button);
    return { el, text, button, sent: false };
  }

  function dismiss(kind: Notice['kind']): void {
    const item = items.get(kind);
    if (disposed || item === undefined || item.sent) return;
    item.sent = true;
    current.handlers.dismissNotice(kind);
  }

  function paint(): void {
    const { notices, storage } = current.model;
    region.setAttribute('aria-label', t('persistence.notices.label'));

    const wanted = new Map<Notice['kind'], Notice>();
    for (const notice of notices) if (!wanted.has(notice.kind)) wanted.set(notice.kind, notice);

    for (const [kind, item] of [...items]) {
      if (wanted.has(kind)) continue;
      region.removeChild(item.el);
      items.delete(kind);
    }
    for (const [kind, notice] of wanted) {
      let item = items.get(kind);
      if (item === undefined) {
        item = makeItem(kind);
        items.set(kind, item);
        region.appendChild(item.el);
      }
      setText(item.text, t(textKeyOf(notice)));
      if (item.button !== null) setText(item.button, t('persistence.notice.dismiss'));
    }

    // The autosave line exists only while the last save was durable; nothing is said for UNKNOWN, MEMORY_ONLY or FAILED.
    if (storage === 'DURABLE') {
      if (status === null) {
        status = h('p', { class: 'notice-status', attrs: { 'data-notice': 'STATUS' } });
        region.appendChild(status);
      } else if (region.children[region.children.length - 1] !== status) {
        region.appendChild(status); // keep it last when a new notice was added
      }
      setText(status, `${t('persistence.status.durable')} ${t('persistence.status.notSecret')}`);
    } else if (status !== null) {
      region.removeChild(status);
      status = null;
    }
  }

  root.appendChild(region);
  paint();

  return {
    element: region,
    update(next) {
      if (disposed) return;
      current = next;
      paint();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      items.clear();
      status = null;
      if (region.parentNode !== null) region.parentNode.removeChild(region);
    },
  };
}
