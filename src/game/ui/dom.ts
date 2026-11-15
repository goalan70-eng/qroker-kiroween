// DOM helper (task 16.2): `h()` builds elements from plain data, and a small focus-restoration helper keeps the
// keyboard focus on "the same" control across a re-render.
//
// Rules (checked by the source scan of shell.test.ts):
//   * text is assigned with `textContent` and attributes with `setAttribute`; no HTML string is ever parsed;
//   * a `Document` is always passed in; nothing here reads or writes `window` or `globalThis`;
//   * event listeners are attached with `addEventListener`.
//
// The functions take a structural subset of `Document` / `Element`, so tests can use a small hand-written fake
// (the same approach as shell.test.ts) and need no DOM library.

/** The part of `Document` that `h` needs. */
export type CreateDoc = Pick<Document, 'createElement' | 'createTextNode'>;

/** Attribute values: `false`, `null` and `undefined` leave the attribute out; `true` writes an empty attribute. */
export type AttrValue = string | number | boolean | null | undefined;

export interface HProps {
  /** Written with `setAttribute(name, String(value))`. `data-*` attributes are plain entries here. */
  readonly attrs?: Readonly<Record<string, AttrValue>>;
  /** `aria-*` attributes as a short form: `{ label: 'Close' }` writes `aria-label="Close"`. */
  readonly aria?: Readonly<Record<string, AttrValue>>;
  /** Event listeners: `{ click: (e) => ... }`. */
  readonly on?: Readonly<Record<string, (event: Event) => void>>;
  /** Shorthand for the `class` attribute. */
  readonly class?: string;
  /** Shorthand for the `id` attribute. */
  readonly id?: string;
  /** Written as `data-focus-key`; `restoreFocus` uses it to find the element again after a re-render. */
  readonly focusKey?: string;
}

export type HChild = string | number | Node | null | undefined | false;

/** `h(tag, props?, ...children)`. */
export type HFunction = (tag: string, props?: HProps | null, ...children: readonly HChild[]) => HTMLElement;

function setAttr(el: Element, name: string, value: AttrValue): void {
  if (value === undefined || value === null || value === false) return;
  el.setAttribute(name, value === true ? '' : String(value));
}

/**
 * Creates `<tag>` with attributes, listeners and children from `doc`. Text is never parsed as HTML: a single
 * string or number child is assigned with `textContent`, and several children use text nodes. `null`,
 * `undefined` and `false` children are skipped.
 */
export function buildElement(doc: CreateDoc, tag: string, props?: HProps | null, ...children: readonly HChild[]): HTMLElement {
  const el = doc.createElement(tag);
  if (props !== undefined && props !== null) {
    if (props.id !== undefined) el.setAttribute('id', props.id);
    if (props.class !== undefined) el.setAttribute('class', props.class);
    if (props.focusKey !== undefined) el.setAttribute('data-focus-key', props.focusKey);
    if (props.attrs !== undefined) for (const [name, value] of Object.entries(props.attrs)) setAttr(el, name, value);
    if (props.aria !== undefined) for (const [name, value] of Object.entries(props.aria)) setAttr(el, `aria-${name}`, value);
    if (props.on !== undefined) for (const [type, listener] of Object.entries(props.on)) el.addEventListener(type, listener);
  }
  const live = children.filter((c): c is string | number | Node => c !== null && c !== undefined && c !== false);
  const only = live.length === 1 ? live[0] : undefined;
  if (typeof only === 'string' || typeof only === 'number') {
    el.textContent = String(only);
    return el;
  }
  for (const child of live) {
    el.appendChild(typeof child === 'string' || typeof child === 'number' ? doc.createTextNode(String(child)) : child);
  }
  return el;
}

/** An `h` bound to `doc`. Tests pass a fake document; the browser composition root passes `document`. */
export function createH(doc: CreateDoc): HFunction {
  return (tag, props, ...children) => buildElement(doc, tag, props, ...children);
}

/** `h` for the page's own `document`. It reads the global at call time, so importing this module is free of side effects. */
export const h: HFunction = (tag, props, ...children) => buildElement(document, tag, props, ...children);
// ---------------------------------------------------------------------------------------------------------
// Focus restoration
// ---------------------------------------------------------------------------------------------------------

/** The part of `Document` that the focus helpers need. */
export interface FocusDoc {
  readonly activeElement: Pick<Element, 'getAttribute'> | null;
  getElementById(id: string): Element | null;
  querySelector(selector: string): Element | null;
}

/** What identifies the focused control: its `data-focus-key`, else its `id`. */
export type FocusToken = { readonly kind: 'key' | 'id'; readonly value: string };

/** Only plain tokens are used in selectors, so a key can never alter the selector text. */
const SAFE_TOKEN = /^[A-Za-z0-9_.:-]+$/;

/** Reads which control has the focus, or `null` when none has a usable key or id. Never throws. */
export function captureFocus(doc: FocusDoc): FocusToken | null {
  const active = doc.activeElement;
  if (active === null || active === undefined || typeof active.getAttribute !== 'function') return null;
  const key = active.getAttribute('data-focus-key');
  if (key !== null && SAFE_TOKEN.test(key)) return { kind: 'key', value: key };
  const id = active.getAttribute('id');
  if (id !== null && SAFE_TOKEN.test(id)) return { kind: 'id', value: id };
  return null;
}

/**
 * Gives the focus back to the control `token` names, if it exists and is not already focused. Returns `true` when
 * `focus()` was called. A missing control (for example one that the new screen no longer has) is not an error.
 */
export function restoreFocus(doc: FocusDoc, token: FocusToken | null): boolean {
  if (token === null) return false;
  const found = token.kind === 'id' ? doc.getElementById(token.value) : doc.querySelector(`[data-focus-key="${token.value}"]`);
  const target = found as Partial<Pick<HTMLElement, 'focus'>> | null | undefined;
  if (target === null || target === undefined || typeof target.focus !== 'function') return false;
  if ((doc.activeElement as unknown) === target) return false;
  target.focus();
  return true;
}

/** Runs `render` between `captureFocus` and `restoreFocus`. The focus is restored even when `render` throws. */
export function renderWithFocus(doc: FocusDoc, render: () => void): void {
  const token = captureFocus(doc);
  try {
    render();
  } finally {
    restoreFocus(doc, token);
  }
}
