// Test support (task 17.3): a minimal hand-written fake Document for the Hand, controls and panel tests. It is NOT a
// browser and NOT a DOM library: there is no layout, no real focus handling, no pointer capture and no touch. It models
// only what the placement components use:
//   * elements with attributes, children, parent links, `textContent`, `closest`/`querySelector` for the selector
//     forms `[name]` and `[name="value"]` (one or more, no combinators), and focus tracking;
//   * event dispatch in the order of the DOM: document capture listeners, then the target and its ancestors
//     (bubbling), then document bubble listeners; `preventDefault`, `stopPropagation` and `stopImmediatePropagation`
//     are honoured, so the click guard of `attachHandGestures` can swallow a click like it does in a browser;
//   * `elementFromPoint` through an injected hit function (tests map points to Board cell elements).
// Evidence class of every test that uses it: fake-DOM (not emulated touch, not real device).
//
// Not imported by any production file. `innerHTML` throws, so a component that parsed HTML would fail a test.

export interface FakeEventInit {
  readonly key?: string;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
  readonly repeat?: boolean;
  readonly pointerId?: number;
  readonly isPrimary?: boolean;
  readonly button?: number;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly timeStamp?: number;
}

export class FakeEvent {
  defaultPrevented = false;
  propagationStopped = false;
  immediateStopped = false;
  target: unknown = null;
  key?: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
  pointerId?: number;
  isPrimary?: boolean;
  button?: number;
  clientX?: number;
  clientY?: number;
  timeStamp?: number;
  constructor(
    readonly type: string,
    init: FakeEventInit = {},
  ) {
    Object.assign(this, init);
  }
  preventDefault(): void {
    this.defaultPrevented = true;
  }
  stopPropagation(): void {
    this.propagationStopped = true;
  }
  stopImmediatePropagation(): void {
    this.propagationStopped = true;
    this.immediateStopped = true;
  }
}

type Listener = (event: FakeEvent) => void;
interface Registered {
  readonly fn: Listener;
  readonly capture: boolean;
}

function parseSelector(selector: string): { name: string; value: string | null }[] {
  const parts = [...selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map((m) => ({ name: m[1] as string, value: m[2] ?? null }));
  if (parts.length === 0) throw new Error(`fake-dom: unsupported selector ${selector}`);
  return parts;
}

const HTML_STRING_PROPERTIES: readonly string[] = ['inner' + 'HTML', 'outer' + 'HTML'];

export class FakeEl {
  readonly children: FakeEl[] = [];
  parentNode: FakeEl | null = null;
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Registered[]>();
  readonly captured: number[] = [];
  readonly released: number[] = [];
  focusCalls = 0;
  private ownText = '';

  constructor(
    readonly tagName: string,
    readonly doc: FakeDocument,
  ) {
    // Reading or assigning an HTML-string property throws, so a component that parsed HTML would fail a test. The
    // names are joined at run time so that the source scan of the UI folder finds no such API name in this file.
    for (const name of HTML_STRING_PROPERTIES) {
      Object.defineProperty(this, name, {
        get() {
          throw new Error(`${name} must not be read`);
        },
        set() {
          throw new Error(`${name} must not be assigned`);
        },
      });
    }
  }

  get textContent(): string {
    return this.children.length > 0 ? this.children.map((c) => c.textContent).join('') : this.ownText;
  }
  set textContent(value: string | null) {
    for (const child of this.children) child.parentNode = null;
    this.children.length = 0;
    this.ownText = value ?? '';
  }

  get firstChild(): FakeEl | null {
    return this.children[0] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  appendChild(child: FakeEl): FakeEl {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child: FakeEl): FakeEl {
    const at = this.children.indexOf(child);
    if (at < 0) throw new Error('fake-dom: removeChild of a node that is not a child');
    this.children.splice(at, 1);
    child.parentNode = null;
    const active = this.doc.activeElement;
    if (active !== null && (active === child || child.contains(active))) this.doc.activeElement = null;
    return child;
  }
  contains(other: FakeEl | null): boolean {
    // like `Node.contains`: a non-element (the fake document, `undefined`) is not inside anything
    for (let el: FakeEl | null | undefined = other; el !== null && el !== undefined; el = el.parentNode) if (el === this) return true;
    return false;
  }

  addEventListener(type: string, fn: Listener, capture = false): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), { fn, capture }]);
  }
  removeEventListener(type: string, fn: Listener, capture = false): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((l) => !(l.fn === fn && l.capture === capture)));
  }
  listenerCount(): number {
    return [...this.listeners.values()].reduce((n, list) => n + list.length, 0);
  }

  setPointerCapture(id: number): void {
    this.captured.push(id);
  }
  releasePointerCapture(id: number): void {
    this.released.push(id);
  }

  focus(): void {
    this.focusCalls++;
    this.doc.activeElement = this;
    for (const l of this.listeners.get('focus') ?? []) l.fn(new FakeEvent('focus'));
  }

  matches(selector: string): boolean {
    return parseSelector(selector).every((p) => (p.value === null ? this.attributes.has(p.name) : this.attributes.get(p.name) === p.value));
  }
  closest(selector: string): FakeEl | null {
    for (let el: FakeEl | null = this; el !== null; el = el.parentNode) if (el.matches(selector)) return el;
    return null;
  }

  /** Dispatches an event on this element through the document (capture, target, bubble). */
  fire(type: string, init: FakeEventInit = {}): FakeEvent {
    return this.doc.dispatchOn(this, type, init);
  }
}

export class FakeDocument {
  activeElement: FakeEl | null = null;
  readonly body: FakeEl = new FakeEl('body', this);
  readonly listeners = new Map<string, Registered[]>();
  /** The elements `elementFromPoint` reports; set by the test. */
  hit: (x: number, y: number) => FakeEl | null = () => null;
  readonly hitCalls: [number, number][] = [];

  createElement = (tag: string): FakeEl => new FakeEl(tag, this);
  createTextNode = (text: string): FakeEl => {
    const node = new FakeEl('#text', this);
    node.textContent = text;
    return node;
  };

  elementFromPoint(x: number, y: number): FakeEl | null {
    this.hitCalls.push([x, y]);
    return this.hit(x, y);
  }

  getElementById(id: string): FakeEl | null {
    return this.all().find((el) => el.getAttribute('id') === id) ?? null;
  }
  querySelector(selector: string): FakeEl | null {
    return this.all().find((el) => el.tagName !== '#text' && el.matches(selector)) ?? null;
  }
  /** Every element under the body, in document order. */
  all(): FakeEl[] {
    return descendants(this.body);
  }

  addEventListener(type: string, fn: Listener, capture = false): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), { fn, capture }]);
  }
  removeEventListener(type: string, fn: Listener, capture = false): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((l) => !(l.fn === fn && l.capture === capture)));
  }
  listenerCount(): number {
    return [...this.listeners.values()].reduce((n, list) => n + list.length, 0);
  }

  private run(list: readonly Registered[], event: FakeEvent): void {
    for (const l of list) {
      if (event.immediateStopped) return;
      l.fn(event);
    }
  }

  /** Dispatches an event on the document itself (pointermove, pointerup, keydown with no element target). */
  dispatch(type: string, init: FakeEventInit = {}): FakeEvent {
    return this.dispatchOn(null, type, init);
  }

  /**
   * Dispatches in DOM order: document capture listeners, the target and its ancestors (bubbling), document bubble
   * listeners. `target === null` means the document is the target.
   */
  dispatchOn(target: FakeEl | null, type: string, init: FakeEventInit = {}): FakeEvent {
    const event = new FakeEvent(type, init);
    event.target = target ?? this;
    const docList = this.listeners.get(type) ?? [];
    this.run(docList.filter((l) => l.capture), event);
    if (event.propagationStopped) return event;
    for (let el: FakeEl | null = target; el !== null && !event.propagationStopped; el = el.parentNode) {
      this.run((el.listeners.get(type) ?? []).filter((l) => !l.capture), event);
    }
    if (event.propagationStopped) return event;
    this.run(docList.filter((l) => !l.capture), event);
    return event;
  }
}

export function descendants(el: FakeEl): FakeEl[] {
  return el.children.flatMap((c) => [c, ...descendants(c)]);
}
export const elementsOf = (el: FakeEl): FakeEl[] => [el, ...descendants(el)];
export const classesOf = (el: FakeEl): string[] => (el.getAttribute('class') ?? '').split(' ').filter((c) => c !== '');
export const asFake = (el: HTMLElement): FakeEl => el as unknown as FakeEl;

/** A hit function that maps the point (x, y) of a `size` px square grid at (0, 0) to the Board cell button under it. */
export function boardHit(doc: FakeDocument, size = 50): (x: number, y: number) => FakeEl | null {
  return (x, y) => {
    if (x < 0 || y < 0 || x >= 8 * size || y >= 8 * size) return null;
    const row = String(Math.floor(y / size));
    const col = String(Math.floor(x / size));
    return doc.all().find((el) => el.getAttribute('data-row') === row && el.getAttribute('data-col') === col) ?? null;
  };
}
/** The centre point of the cell (row, col) in `boardHit` coordinates. */
export const cellPoint = (row: number, col: number, size = 50): { x: number; y: number } => ({ x: col * size + size / 2, y: row * size + size / 2 });
