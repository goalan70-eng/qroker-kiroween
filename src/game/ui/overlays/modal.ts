// Shared modal shell of the overlays (task 19.3): the help dialog and the abandon confirmation use it, so that the focus
// handling is written once. It is a mechanism only: it knows no text, no game and no handler.
//
// DOM
//   div.overlay-backdrop                  `backdrop`: appended to `root` on `show`, removed on `hide`
//     div.overlay-dialog[role][aria-modal=true][aria-labelledby][aria-describedby?]   `dialog` (the caller fills it)
//
// Behaviour
//   * `show(root, initialFocus)`: remembers the element that has the focus (the opener), appends the backdrop, adds ONE
//     keydown listener to the injected `doc` (removed by `hide`/`destroy`) and focuses `initialFocus()`. A second `show`
//     while open does nothing, so there is never a duplicate listener or a duplicate backdrop.
//   * `hide()`: removes the backdrop and the document listener, then gives the focus back to the opener. If the opener
//     is no longer in the document, the `fallbackFocus` element is used when it is still in the document; otherwise
//     nothing is focused. A second `hide` while closed does nothing. It returns whether it closed something.
//   * Escape (a keydown on the dialog, or on the document when the focus is outside the dialog) calls `onDismiss`. The
//     event is stopped so that no other Escape handler of the page (for example the placement draft) also acts.
//   * Tab and Shift+Tab are kept inside the dialog: from the last control Tab goes to the first, from the first (or the
//     heading) Shift+Tab goes to the last. A Tab while the focus is outside the dialog moves it inside.
//   * A click on the backdrop itself (not on the dialog) calls `onDismiss` when `backdropDismiss` is true.
//
// Nothing here reads `window` or `globalThis`; the document is injected. Imports: ui/dom only.

import { createH } from '../dom';
import type { CreateDoc } from '../dom';

/** The part of `Document` that the shell needs. A real `Document` and the fake document of the tests satisfy it. */
export type ModalDocument = CreateDoc & Pick<Document, 'body' | 'addEventListener' | 'removeEventListener'> & { readonly activeElement: unknown };

export interface ModalOptions {
  readonly role: 'dialog' | 'alertdialog';
  /** The id of the element that names the dialog. */
  readonly labelledBy: string;
  readonly describedBy?: string;
  /** Used when the opener is gone. */
  readonly fallbackFocus?: Pick<HTMLElement, 'focus'> | null;
  /** Escape, and the backdrop click when `backdropDismiss` is true. */
  readonly onDismiss: () => void;
  readonly backdropDismiss: boolean;
  /** Extra class on the dialog, for example `overlay-dialog--alert`. */
  readonly dialogClass?: string;
}

export interface Modal {
  readonly backdrop: HTMLElement;
  readonly dialog: HTMLElement;
  readonly isOpen: boolean;
  /** Returns `false` (and does nothing) when already open or destroyed. */
  show(root: HTMLElement, initialFocus: () => Pick<HTMLElement, 'focus'> | null): boolean;
  /** Returns `false` (and does nothing) when already closed. */
  hide(): boolean;
  /** Closes without a dismiss callback and makes `show` a no-op. Idempotent. */
  destroy(): void;
}

const FOCUSABLE_TAGS = new Set(['button', 'input', 'select', 'textarea', 'a']);

function walk(el: Element, out: Element[]): void {
  for (const child of Array.from(el.children)) {
    out.push(child);
    walk(child, out);
  }
}

/** The controls inside `dialog` that Tab can reach, in document order. */
export function tabbablesOf(dialog: HTMLElement): HTMLElement[] {
  const all: Element[] = [];
  walk(dialog, all);
  return all.filter((el) => {
    if (el.hasAttribute('disabled') || el.hasAttribute('hidden')) return false;
    const tabindex = el.getAttribute('tabindex');
    if (tabindex !== null) return tabindex !== '-1';
    return FOCUSABLE_TAGS.has(el.tagName.toLowerCase());
  }) as HTMLElement[];
}

function inDocument(doc: ModalDocument, el: unknown): el is HTMLElement {
  return el !== null && el !== undefined && doc.body.contains(el as Node);
}

export function createModal(doc: ModalDocument, options: ModalOptions): Modal {
  const h = createH(doc);
  const dialog = h('div', {
    class: options.dialogClass === undefined ? 'overlay-dialog' : `overlay-dialog ${options.dialogClass}`,
    attrs: { role: options.role },
    aria: { modal: 'true', labelledby: options.labelledBy, describedby: options.describedBy },
  });
  const backdrop = h('div', { class: 'overlay-backdrop' }, dialog);
  let open = false;
  let destroyed = false;
  let opener: unknown = null;

  function focusFirstOrLast(last: boolean): void {
    const items = tabbablesOf(dialog);
    const target = last ? items[items.length - 1] : items[0];
    target?.focus();
  }

  function onKeydown(event: Event): void {
    const e = event as KeyboardEvent;
    if (!open) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      e.stopPropagation();
      options.onDismiss();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = tabbablesOf(dialog);
    if (items.length === 0) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const active = doc.activeElement as Node | null;
    const first = items[0] as HTMLElement;
    const last = items[items.length - 1] as HTMLElement;
    const inside = active !== null && dialog.contains(active);
    if (!inside || (e.shiftKey === true ? active === first || !items.includes(active as HTMLElement) : active === last)) {
      e.preventDefault();
      e.stopPropagation(); // the document listener must not act on the same key press again
      (e.shiftKey === true ? last : first).focus();
    }
  }

  dialog.addEventListener('keydown', onKeydown);
  backdrop.addEventListener('click', (event) => {
    if (open && options.backdropDismiss && event.target === backdrop) options.onDismiss();
  });

  function restoreFocus(): void {
    const target = inDocument(doc, opener) && opener !== doc.body ? opener : null;
    opener = null;
    if (target !== null) {
      target.focus();
      return;
    }
    const fallback = options.fallbackFocus;
    if (fallback !== null && fallback !== undefined && inDocument(doc, fallback)) fallback.focus();
  }

  function hide(): boolean {
    if (!open) return false;
    open = false;
    doc.removeEventListener('keydown', onKeydown);
    if (backdrop.parentNode !== null) backdrop.parentNode.removeChild(backdrop);
    restoreFocus();
    return true;
  }

  return {
    backdrop,
    dialog,
    get isOpen() {
      return open;
    },
    show(root, initialFocus) {
      if (open || destroyed) return false;
      open = true;
      opener = doc.activeElement;
      root.appendChild(backdrop);
      doc.addEventListener('keydown', onKeydown);
      initialFocus()?.focus();
      return true;
    },
    hide,
    destroy() {
      if (destroyed) return;
      hide();
      destroyed = true;
    },
  };
}
