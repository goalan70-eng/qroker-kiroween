// Tests of the DOM helper and the focus helpers (task 16.2) against a minimal hand-written fake (no DOM library).
import { describe, expect, it } from 'vitest';
import { captureFocus, createH, renderWithFocus, restoreFocus } from './dom';
import type { FocusDoc } from './dom';

class El {
  readonly children: unknown[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, (e: Event) => void>();
  textContent: string | null = '';
  focused = 0;
  constructor(readonly tagName: string) {}
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  appendChild(child: unknown): unknown {
    this.children.push(child);
    return child;
  }
  addEventListener(type: string, listener: (e: Event) => void): void {
    this.listeners.set(type, listener);
  }
  focus(): void {
    this.focused++;
  }
}
const fakeDoc = () => ({
  createElement: (tag: string) => new El(tag),
  createTextNode: (text: string) => Object.assign(new El('#text'), { textContent: text }),
});

describe('h', () => {
  const h = createH(fakeDoc() as unknown as Document);

  it('builds an element with attributes, aria, focus key, listeners and a text child', () => {
    let clicked = 0;
    const el = h('button', { id: 'b', class: 'btn', focusKey: 'play', attrs: { type: 'button', disabled: false, tabindex: 0, hidden: true, x: null }, aria: { label: 'Play', pressed: undefined }, on: { click: () => clicked++ } }, 'Go') as unknown as El;
    expect(el.tagName).toBe('button');
    expect(Object.fromEntries(el.attributes)).toEqual({ id: 'b', class: 'btn', 'data-focus-key': 'play', type: 'button', tabindex: '0', hidden: '', 'aria-label': 'Play' });
    expect(el.textContent).toBe('Go');
    el.listeners.get('click')?.({} as Event);
    expect(clicked).toBe(1);
  });

  it('keeps markup characters as text: strings are never parsed', () => {
    const el = h('p', null, '<img src=x onerror=alert(1)>') as unknown as El;
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(el.children).toEqual([]);
  });

  it('appends element children and text nodes, skipping null, undefined and false', () => {
    const inner = h('span', null, 'a');
    const el = h('div', undefined, inner, null, undefined, false, 'text', 7) as unknown as El;
    expect(el.children).toHaveLength(3);
    expect(el.children[0]).toBe(inner);
    expect((el.children[1] as El).textContent).toBe('text');
    expect((el.children[2] as El).textContent).toBe('7');
  });
});

describe('focus helpers', () => {
  function docWith(active: El | null, registry: Record<string, El>): FocusDoc & { activeElement: El | null } {
    return {
      activeElement: active,
      getElementById: (id: string) => registry[`id=${id}`] ?? null,
      querySelector: (selector: string) => registry[`sel=${selector}`] ?? null,
    } as unknown as FocusDoc & { activeElement: El | null };
  }

  it('captures the focus key first, then the id, and nothing for an unusable element', () => {
    const keyed = new El('button');
    keyed.setAttribute('data-focus-key', 'cell-D4');
    keyed.setAttribute('id', 'x');
    expect(captureFocus(docWith(keyed, {}))).toEqual({ kind: 'key', value: 'cell-D4' });
    const byId = new El('select');
    byId.setAttribute('id', 'shell-language');
    expect(captureFocus(docWith(byId, {}))).toEqual({ kind: 'id', value: 'shell-language' });
    const odd = new El('button');
    odd.setAttribute('data-focus-key', '"] x[');
    expect(captureFocus(docWith(odd, {}))).toBeNull();
    expect(captureFocus(docWith(null, {}))).toBeNull();
  });

  it('restores the focus to the replaced control, and does nothing for the same or a missing control', () => {
    const fresh = new El('button');
    const registry = { 'sel=[data-focus-key="k"]': fresh, 'id=i': fresh };
    const doc = docWith(new El('button'), registry);
    expect(restoreFocus(doc, { kind: 'key', value: 'k' })).toBe(true);
    expect(fresh.focused).toBe(1);
    expect(restoreFocus(doc, { kind: 'id', value: 'i' })).toBe(true);
    doc.activeElement = fresh;
    expect(restoreFocus(doc, { kind: 'id', value: 'i' })).toBe(false); // already focused
    expect(restoreFocus(doc, { kind: 'key', value: 'gone' })).toBe(false);
    expect(restoreFocus(doc, null)).toBe(false);
  });

  it('renderWithFocus restores the focus even when the render throws', () => {
    const old = new El('button');
    old.setAttribute('data-focus-key', 'k');
    const fresh = new El('button');
    const doc = docWith(old, { 'sel=[data-focus-key="k"]': fresh });
    expect(() =>
      renderWithFocus(doc, () => {
        throw new Error('render failed');
      }),
    ).toThrow('render failed');
    expect(fresh.focused).toBe(1);
  });
});
