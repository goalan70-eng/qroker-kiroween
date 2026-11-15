// Tests of the app shell (task 16.1). These run in Node WITHOUT a DOM library (happy-dom arrives with task 21.1).
//
//  * "source scan" tests read the files of src/game/ui and look for forbidden APIs;
//  * "fake-DOM" tests run `mountShell` against a minimal hand-written Document. They are unit tests of the shell's
//    logic against a stand-in, NOT browser tests: real focus, layout, CSS and event dispatch are not exercised.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { getLanguage, resetLanguage } from '../i18n';
import { mountShell } from './shell';

afterEach(() => resetLanguage());

// ---------------------------------------------------------------------------------------------------------
// Source scan
// ---------------------------------------------------------------------------------------------------------

const UI_DIR = dirname(fileURLToPath(import.meta.url));

function uiSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...uiSources(path));
    else if (/\.(ts|js|html|css)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) out.push(path);
  }
  return out;
}

describe('source scan of src/game/ui (non-test files)', () => {
  const files = uiSources(UI_DIR);

  it('finds the shell sources', () => {
    const names = files.map((f) => f.slice(UI_DIR.length + 1).replaceAll('\\', '/'));
    expect(names).toEqual(expect.arrayContaining(['index.html', 'main.ts', 'shell.ts', 'shell.css']));
  });

  it('uses no HTML-injection API', () => {
    const forbidden = /\binnerHTML\b|\bouterHTML\b|\binsertAdjacentHTML\b|\bdocument\s*\.\s*write(ln)?\s*\(|\bDOMParser\b|\bcreateContextualFragment\b/;
    for (const file of files) {
      // Comments may name the forbidden APIs; strip them so that only code is checked.
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      expect(forbidden.test(code), file).toBe(false);
    }
  });

  it('assigns nothing to window or globalThis', () => {
    const assignment = /\b(?:window|globalThis|self)\s*(?:\.\s*[\w$]+|\[[^\]]*\])\s*=(?!=)|\bObject\s*\.\s*(?:assign|defineProperty)\s*\(\s*(?:window|globalThis)\b|\(\s*(?:window|globalThis)\s+as\s+any\s*\)/;
    for (const file of files.filter((f) => f.endsWith('.ts'))) {
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      expect(assignment.test(code), file).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// Minimal fake DOM (just enough for mountShell). `innerHTML` throws on assignment.
// ---------------------------------------------------------------------------------------------------------

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Array<(event: { type: string }) => void>>();
  textContent: string | null = '';
  private selected = '';

  constructor(readonly tagName: string) {}

  set innerHTML(_value: string) {
    throw new Error('innerHTML must not be assigned');
  }
  get innerHTML(): string {
    throw new Error('innerHTML must not be read');
  }

  /** `<select>.value`: setting selects the option with that value, as in a browser (unknown value => ''). */
  get value(): string {
    return this.selected;
  }
  set value(v: string) {
    this.selected = this.children.some((c) => c.attributes.get('value') === v) ? v : '';
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }
  addEventListener(type: string, listener: (event: { type: string }) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ type });
  }
}

class FakeDocument {
  readonly documentElement = { lang: 'en' };
  title = 'QRoker';
  readonly created: FakeElement[] = [];
  createElement(tag: string): FakeElement {
    const el = new FakeElement(tag);
    this.created.push(el);
    return el;
  }
}

function mount(languages: readonly string[] | string) {
  const doc = new FakeDocument();
  const root = new FakeElement('div');
  const handle = mountShell(root as unknown as HTMLElement, { languages, doc: doc as unknown as Document });
  const find = (tag: string, cls?: string) =>
    doc.created.find((e) => e.tagName === tag && (cls === undefined || e.attributes.get('class') === cls)) as FakeElement;
  return {
    doc,
    root,
    select: handle.select as unknown as FakeElement,
    handle,
    title: find('h1'),
    label: find('label'),
    banner: find('p', 'shell__banner'),
    notice: find('p', 'shell__notice'),
    options: doc.created.filter((e) => e.tagName === 'option'),
  };
}

describe('mountShell against a fake Document (not a browser test)', () => {
  it('renders Korean for a Korean-preferred browser', () => {
    const m = mount(['ko-KR', 'en-US']);
    expect(getLanguage()).toBe('ko');
    expect(m.title.textContent).toBe('QRoker');
    expect(m.banner.textContent).toBe('임시 점수 규칙');
    expect(m.label.textContent).toBe('언어');
    expect(m.label.attributes.get('for')).toBe(m.select.attributes.get('id'));
    expect(m.options.map((o) => o.textContent)).toEqual(['English', '한국어']);
    expect(m.select.value).toBe('ko');
    expect(m.notice.textContent).toContain('아직 연결되지 않았습니다');
    expect(m.doc.documentElement.lang).toBe('ko');
    expect(m.doc.title).toBe('QRoker');
    expect(m.root.children).toHaveLength(1);
  });

  it('renders English for an English or unsupported browser language', () => {
    for (const languages of [['en-US'], ['fr-FR'], []]) {
      const m = mount(languages);
      expect(getLanguage()).toBe('en');
      expect(m.banner.textContent).toBe('provisional scoring');
      expect(m.label.textContent).toBe('Language');
      expect(m.notice.textContent).toContain('not connected yet');
      expect(m.select.value).toBe('en');
      expect(m.doc.documentElement.lang).toBe('en');
      resetLanguage();
    }
  });

  it('switches text, <html lang> and title on a change event and keeps the same <select> element', () => {
    const m = mount(['en-US']);
    const elementsBefore = m.doc.created.length;
    const selectBefore = m.select;
    const childrenBefore = [...m.select.children];

    m.select.value = 'ko';
    m.select.dispatch('change');
    expect(m.banner.textContent).toBe('임시 점수 규칙');
    expect(m.label.textContent).toBe('언어');
    expect(m.doc.documentElement.lang).toBe('ko');
    expect(m.doc.title).toBe('QRoker');
    expect(m.select.value).toBe('ko');

    m.select.value = 'en';
    m.select.dispatch('change');
    expect(m.banner.textContent).toBe('provisional scoring');
    expect(m.doc.documentElement.lang).toBe('en');

    // No element was created or replaced after mounting: the selector (and its focus) survives a switch.
    expect(m.doc.created.length).toBe(elementsBefore);
    expect(m.select).toBe(selectBefore);
    expect(m.select.children).toEqual(childrenBefore);
    expect(m.root.children[0]?.children[1]?.children[1]).toBe(selectBefore);
  });

  it('ignores a change event whose value is not a supported language', () => {
    const m = mount(['en-US']);
    m.select.value = 'fr'; // the fake maps an unknown option value to ''
    m.select.dispatch('change');
    expect(getLanguage()).toBe('en');
    expect(m.banner.textContent).toBe('provisional scoring');
  });

  it('never assigns innerHTML (the fake throws if it is touched)', () => {
    expect(() => {
      const m = mount(['ko']);
      m.select.value = 'en';
      m.select.dispatch('change');
    }).not.toThrow();
  });

  it('offers no Play button or other control than the language selector', () => {
    const m = mount(['en']);
    const interactive = m.doc.created.filter((e) => ['button', 'a', 'input', 'canvas', 'video'].includes(e.tagName));
    expect(interactive).toEqual([]);
  });
});
