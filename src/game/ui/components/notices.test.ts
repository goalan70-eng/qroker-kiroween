// Tests of the notices region (task 20.4). Evidence class 2: the hand-written fake Document, no browser.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { resetLanguage, setLanguage, t } from '../../i18n';
import type { Lang } from '../../i18n';
import { elementsOf, FakeDocument } from '../testing/fake-dom';
import type { FakeEl } from '../testing/fake-dom';
import type { Notice, NoticeReason, StorageStatus } from '../store';
import { renderNotices } from './notices';
import type { NoticesHandle, NoticesInput } from './notices';

afterEach(() => resetLanguage());

const REASONS: readonly NoticeReason[] = ['CORRUPT', 'SAVE_VERSION', 'RULES_VERSION', 'REPLAY_REJECTED', 'GAME_ENDED', 'INVALID_VALUE'];

interface Rig {
  readonly doc: FakeDocument;
  readonly root: FakeEl;
  readonly dismissed: string[];
  readonly handle: NoticesHandle;
  input(notices: readonly Notice[], storage?: StorageStatus): NoticesInput;
}

function rig(notices: readonly Notice[] = [], storage: StorageStatus = 'UNKNOWN'): Rig {
  setLanguage('en');
  const doc = new FakeDocument();
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const dismissed: string[] = [];
  const input = (list: readonly Notice[], status: StorageStatus = 'UNKNOWN'): NoticesInput => ({
    model: { notices: list, storage: status },
    handlers: { dismissNotice: (kind) => void dismissed.push(kind) },
  });
  const handle = renderNotices(doc as never, root as unknown as HTMLElement, input(notices, storage), t);
  return { doc, root, dismissed, handle, input };
}

const items = (r: Rig): FakeEl[] => r.handle.element && (r.handle.element as unknown as FakeEl).children;
const kindOf = (el: FakeEl): string | null => el.getAttribute('data-notice');
const kinds = (r: Rig): (string | null)[] => items(r).map(kindOf);
const buttons = (r: Rig): FakeEl[] => elementsOf(r.handle.element as unknown as FakeEl).filter((e) => e.tagName === 'button');
const text = (r: Rig): string => (r.handle.element as unknown as FakeEl).textContent;

describe('renderNotices: region', () => {
  it('is one polite live region that stays mounted and empty when there is nothing to say', () => {
    const r = rig();
    const region = r.handle.element as unknown as FakeEl;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.hasAttribute('hidden')).toBe(false);
    expect(region.children).toHaveLength(0);
    expect(text(r)).toBe('');
    expect(r.root.children).toEqual([region]);
    expect(region.getAttribute('aria-label')).toBe('Saving');
  });
  it('says nothing for UNKNOWN, MEMORY_ONLY and FAILED storage; the status line exists only for DURABLE', () => {
    for (const storage of ['UNKNOWN', 'MEMORY_ONLY', 'FAILED'] as const) {
      const r = rig([], storage);
      expect(text(r), storage).toBe('');
    }
    const durable = rig([], 'DURABLE');
    expect(text(durable)).toContain('Progress is saved automatically in this browser.');
    expect(text(durable)).toContain('not secret');
    expect(text(durable)).toContain('developer tools');
  });
  it('never contains a saved claim for a non-durable or failed state, even with the matching notices', () => {
    const cases: [readonly Notice[], StorageStatus][] = [
      [[{ kind: 'STORAGE_NOT_DURABLE' }], 'MEMORY_ONLY'],
      [[{ kind: 'STORAGE_WRITE_FAILED' }], 'FAILED'],
      [[{ kind: 'STORAGE_NOT_DURABLE' }, { kind: 'STORAGE_READ_FAILED' }], 'UNKNOWN'],
    ];
    for (const [list, storage] of cases) {
      const r = rig(list, storage);
      expect(text(r).toLowerCase(), storage).not.toMatch(/saved automatically|progress is saved/);
    }
  });
});

describe('renderNotices: notices', () => {
  it('shows the plain write-failed text and the not-durable text', () => {
    const r = rig([{ kind: 'STORAGE_WRITE_FAILED' }, { kind: 'STORAGE_NOT_DURABLE' }], 'FAILED');
    expect(text(r)).toContain('cannot be saved');
    expect(text(r)).toContain('lost if you reload or close the page');
    expect(kinds(r)).toEqual(['STORAGE_WRITE_FAILED', 'STORAGE_NOT_DURABLE']);
  });
  it('shows one localized text per discard reason, with no internal detail', () => {
    const texts = new Set<string>();
    for (const reason of REASONS) {
      const r = rig([{ kind: 'SAVE_DISCARDED', reason }]);
      const shown = text(r);
      texts.add(shown);
      expect(shown, reason).toContain('The saved game cannot be continued');
      expect(shown, reason).not.toContain(reason);
      expect(shown, reason).not.toMatch(/_|[{}]/);
    }
    expect(texts.size).toBe(REASONS.length); // each closed reason has its own text
  });
  it('falls back to a generic discard text for an unknown reason and never prints the raw code', () => {
    const r = rig([{ kind: 'SAVE_DISCARDED', reason: 'WHATEVER' as NoticeReason }]);
    expect(text(r)).toContain('The saved game cannot be continued');
    expect(text(r)).not.toContain('WHATEVER');
    const bare = rig([{ kind: 'SAVE_DISCARDED' }]);
    expect(text(bare)).toContain('The saved game cannot be continued');
  });
  it('re-renders the text in Korean in place after a language change', () => {
    const r = rig([{ kind: 'STORAGE_READ_FAILED' }, { kind: 'STORAGE_NOT_DURABLE' }], 'DURABLE');
    const before = elementsOf(r.handle.element as unknown as FakeEl);
    setLanguage('ko' as Lang);
    r.handle.update(r.input([{ kind: 'STORAGE_READ_FAILED' }, { kind: 'STORAGE_NOT_DURABLE' }], 'DURABLE'));
    expect(text(r)).toContain('저장된 데이터를 읽을 수 없습니다');
    expect(text(r)).toContain('자동으로 저장');
    expect(buttons(r)[0]?.textContent).toBe('알림 닫기');
    expect(elementsOf(r.handle.element as unknown as FakeEl)).toEqual(before);
  });
});

describe('renderNotices: dismiss', () => {
  it('has a dismiss button only for SAVE_DISCARDED and STORAGE_READ_FAILED', () => {
    const r = rig(
      [{ kind: 'STORAGE_NOT_DURABLE' }, { kind: 'STORAGE_WRITE_FAILED' }, { kind: 'STORAGE_READ_FAILED' }, { kind: 'SAVE_DISCARDED', reason: 'CORRUPT' }],
      'DURABLE',
    );
    const owners = buttons(r).map((b) => b.parentNode?.getAttribute('data-notice'));
    expect(owners).toEqual(['STORAGE_READ_FAILED', 'SAVE_DISCARDED']);
    expect(buttons(r).map((b) => b.textContent)).toEqual(['Dismiss', 'Dismiss']);
  });
  it('calls dismissNotice(kind) once per item, even on repeated clicks', () => {
    const r = rig([{ kind: 'SAVE_DISCARDED', reason: 'GAME_ENDED' }]);
    const button = buttons(r)[0] as FakeEl;
    button.fire('click');
    button.fire('click');
    expect(r.dismissed).toEqual(['SAVE_DISCARDED']);
  });
  it('removes the item on the next update and keeps the other items and their focus', () => {
    const list: Notice[] = [{ kind: 'STORAGE_READ_FAILED' }, { kind: 'SAVE_DISCARDED', reason: 'CORRUPT' }];
    const r = rig(list);
    const [readButton, discardButton] = buttons(r) as [FakeEl, FakeEl];
    discardButton.focus();
    r.handle.update(r.input([list[1] as Notice]));
    expect(kinds(r)).toEqual(['SAVE_DISCARDED']);
    expect(buttons(r)).toHaveLength(1);
    expect(buttons(r)[0]).toBe(discardButton); // the same element: keyed by kind
    expect(r.doc.activeElement).toBe(discardButton);
    expect((r.handle.element as unknown as FakeEl).contains(readButton)).toBe(false);
    r.handle.update(r.input([]));
    expect(kinds(r)).toEqual([]);
  });
  it('moves the focus to the region when the focused dismiss button is removed (not to the body)', () => {
    const r = rig([{ kind: 'SAVE_DISCARDED', reason: 'CORRUPT' }]);
    const region = r.handle.element as unknown as FakeEl;
    expect(region.getAttribute('tabindex')).toBe('-1');
    expect(region.getAttribute('aria-label')).toBe('Saving');
    expect(region.getAttribute('aria-live')).toBe('polite');
    (buttons(r)[0] as FakeEl).focus();
    r.handle.update(r.input([]));
    expect(r.doc.activeElement).toBe(region);
  });
  it('does not take the focus when the removed notice was not focused', () => {
    const r = rig([{ kind: 'SAVE_DISCARDED', reason: 'CORRUPT' }]);
    const outside = r.doc.createElement('button');
    r.doc.body.appendChild(outside);
    outside.focus();
    r.handle.update(r.input([]));
    expect(r.doc.activeElement).toBe(outside);
  });
  it('a new notice of a dismissed kind gets a fresh item that can be dismissed again', () => {
    const r = rig([{ kind: 'STORAGE_READ_FAILED' }]);
    buttons(r)[0]?.fire('click');
    r.handle.update(r.input([]));
    r.handle.update(r.input([{ kind: 'STORAGE_READ_FAILED' }]));
    buttons(r)[0]?.fire('click');
    expect(r.dismissed).toEqual(['STORAGE_READ_FAILED', 'STORAGE_READ_FAILED']);
  });
});

describe('renderNotices: updates', () => {
  it('keeps the status line last when a notice is added, and removes it when storage is no longer DURABLE', () => {
    const r = rig([], 'DURABLE');
    r.handle.update(r.input([{ kind: 'STORAGE_READ_FAILED' }], 'DURABLE'));
    expect(kinds(r)).toEqual(['STORAGE_READ_FAILED', 'STATUS']);
    r.handle.update(r.input([{ kind: 'STORAGE_READ_FAILED' }], 'FAILED'));
    expect(kinds(r)).toEqual(['STORAGE_READ_FAILED']);
  });
  it('does not rewrite an unchanged text (an unchanged live text is not announced again)', () => {
    const r = rig([{ kind: 'STORAGE_NOT_DURABLE' }], 'DURABLE');
    const nodes = elementsOf(r.handle.element as unknown as FakeEl);
    const writes = nodes.map((n) => n.textContent);
    for (let i = 0; i < 3; i++) r.handle.update(r.input([{ kind: 'STORAGE_NOT_DURABLE' }], 'DURABLE'));
    expect(elementsOf(r.handle.element as unknown as FakeEl)).toEqual(nodes);
    expect(nodes.map((n) => n.textContent)).toEqual(writes);
  });
  it('shows at most one item per kind', () => {
    const r = rig([{ kind: 'STORAGE_NOT_DURABLE' }, { kind: 'STORAGE_NOT_DURABLE' }]);
    expect(kinds(r)).toEqual(['STORAGE_NOT_DURABLE']);
  });
  it('dispose removes the region, is idempotent, and later updates and clicks do nothing', () => {
    const r = rig([{ kind: 'STORAGE_READ_FAILED' }]);
    const button = buttons(r)[0] as FakeEl;
    r.handle.dispose();
    r.handle.dispose();
    expect(r.root.children).toHaveLength(0);
    button.fire('click');
    r.handle.update(r.input([{ kind: 'STORAGE_NOT_DURABLE' }], 'DURABLE'));
    expect(r.dismissed).toEqual([]);
    expect(r.root.children).toHaveLength(0);
  });
});

describe('notices.ts source', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'notices.ts'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  it('uses no console, storage, clock, randomness or global, and imports only ui/ and i18n/', () => {
    expect(source).not.toMatch(/\bconsole\b|localStorage|sessionStorage|\bDate\b|Math\.random|\bwindow\b|globalThis|\bdocument\b|setTimeout|innerHTML/);
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) expect(spec, spec).toMatch(/^(?:\.\.\/\.\.\/i18n|\.\.\/dom|\.\.\/store|\.\/card-face)$/);
  });
});
