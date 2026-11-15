// Tests of the resume prompt (task 20.4). Evidence class 2: the hand-written fake Document of ui/testing/fake-dom.ts, no browser.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { getLanguage, resetLanguage, setLanguage, t } from '../../i18n';
import type { Lang } from '../../i18n';
import { asFake, classesOf, elementsOf, FakeDocument } from '../testing/fake-dom';
import type { FakeEl } from '../testing/fake-dom';
import { formatSavedTime, renderResume } from './resume';
import type { ResumeHandle, ResumeInput, ResumeOpResult } from './resume';

afterEach(() => resetLanguage());

const SAVED = '2026-03-04T05:06:07.890Z';

interface Rig {
  readonly doc: FakeDocument;
  readonly root: FakeEl;
  readonly calls: string[];
  readonly handle: ResumeHandle;
  replies: { continueSaved: ResumeOpResult; discardSaved: ResumeOpResult };
  input(language?: Lang, resume?: ResumeInput['model']['resume']): ResumeInput;
}

function rig(options: { autoFocus?: boolean } = {}): Rig {
  setLanguage('en');
  const doc = new FakeDocument();
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const calls: string[] = [];
  const out = { replies: { continueSaved: { ok: true }, discardSaved: { ok: true } } } as Rig;
  const input = (language: Lang = 'en', resume: ResumeInput['model']['resume'] = { savedAtIso: SAVED, humanSeats: 2 }): ResumeInput => ({
    model: { language, resume },
    handlers: {
      continueSaved: () => {
        calls.push('continue');
        return out.replies.continueSaved;
      },
      discardSaved: () => {
        calls.push('discard');
        return out.replies.discardSaved;
      },
    },
  });
  const handle = renderResume(doc as never, root as unknown as HTMLElement, input(), t, options);
  return Object.assign(out, { doc, root, calls, handle, input });
}

const byId = (r: Rig, id: string): FakeEl => r.doc.getElementById(id) as FakeEl;
const click = (el: FakeEl): void => void el.fire('click');
const disabled = (el: FakeEl): boolean => el.hasAttribute('disabled');
const visibleText = (r: Rig): string => r.root.textContent;

describe('formatSavedTime', () => {
  it('cuts YYYY-MM-DD HH:MM out of an ISO text without a Date', () => {
    expect(formatSavedTime('2026-03-04T05:06:07.890Z')).toBe('2026-03-04 05:06 UTC');
    expect(formatSavedTime('2026-12-31T23:59:59.999Z')).toBe('2026-12-31 23:59 UTC');
  });
  it('returns null for text that does not start like an ISO time', () => {
    for (const text of ['', 'yesterday', '2026-03-04', '26-03-04T05:06', 'x2026-03-04T05:06']) expect(formatSavedTime(text), text).toBeNull();
  });
});

describe('renderResume: content', () => {
  it('shows the title, body, saved time, number of human players, the hint and two buttons, and nothing else', () => {
    const r = rig();
    const text = visibleText(r);
    expect(text).toContain('A game in progress was found');
    expect(text).toContain('Saved: 2026-03-04 05:06 UTC');
    expect(text).toContain('Human players: 2');
    expect(text).toContain('hand-over screen');
    expect(byId(r, 'resume-continue').textContent).toBe('Continue');
    expect(byId(r, 'resume-discard').textContent).toBe('Discard saved game');
    const buttons = elementsOf(asFake(r.handle.element)).filter((e) => e.tagName === 'button');
    expect(buttons).toHaveLength(2);
    // the seconds and milliseconds of the stored time are not shown
    expect(text).not.toContain('07');
    expect(text).not.toContain('890');
    expect(r.handle.element.getAttribute('aria-labelledby')).toBe('resume-title');
  });
  it('is the Korean text after a language change, written in place (same elements, focus kept)', () => {
    const r = rig();
    const before = elementsOf(asFake(r.handle.element));
    const discard = byId(r, 'resume-discard');
    discard.focus();
    setLanguage('ko');
    r.handle.update(r.input('ko'));
    expect(getLanguage()).toBe('ko');
    expect(byId(r, 'resume-continue').textContent).toBe('이어하기');
    expect(visibleText(r)).toContain('2026-03-04 05:06 UTC');
    expect(elementsOf(asFake(r.handle.element))).toEqual(before);
    expect(r.doc.activeElement).toBe(discard);
  });
  it('moves the focus to Continue when shown, unless autoFocus is false', () => {
    const r = rig();
    expect(r.doc.activeElement).toBe(byId(r, 'resume-continue'));
    const quiet = rig({ autoFocus: false });
    expect(quiet.doc.activeElement).toBeNull();
    quiet.handle.focusFirst();
    expect(quiet.doc.activeElement).toBe(byId(quiet, 'resume-continue'));
  });
  it('has only native buttons (keyboard operable) and no game data: no card, board, input or Guess element', () => {
    const r = rig();
    for (const el of elementsOf(asFake(r.handle.element))) {
      expect(['section', 'h2', 'p', 'div', 'button']).toContain(el.tagName);
      for (const c of classesOf(el)) expect(c).toMatch(/^resume/);
    }
  });
  it('omits the time line when the time text is not an ISO time', () => {
    const r = rig();
    r.handle.update(r.input('en', { savedAtIso: 'garbage', humanSeats: 1 }));
    expect(visibleText(r)).not.toContain('Saved:');
    expect(visibleText(r)).not.toContain('garbage');
    expect(visibleText(r)).toContain('Human players: 1');
  });
});

describe('renderResume: single flight and results', () => {
  it('Continue calls its handler once; afterwards neither button does anything', () => {
    const r = rig();
    click(byId(r, 'resume-continue'));
    click(byId(r, 'resume-continue'));
    click(byId(r, 'resume-discard'));
    r.handle.continueSaved();
    r.handle.discardSaved();
    expect(r.calls).toEqual(['continue']);
    expect(r.handle.mode).toBe('done');
    expect(disabled(byId(r, 'resume-continue'))).toBe(true);
    expect(disabled(byId(r, 'resume-discard'))).toBe(true);
  });
  it('Discard calls its handler once; afterwards Continue does nothing', () => {
    const r = rig();
    click(byId(r, 'resume-discard'));
    click(byId(r, 'resume-continue'));
    click(byId(r, 'resume-discard'));
    expect(r.calls).toEqual(['discard']);
    expect(r.handle.mode).toBe('done');
  });
  it('NO_RESUME and DISPOSED make the handle stale and inert, without a crash', () => {
    for (const reason of ['NO_RESUME', 'DISPOSED']) {
      const r = rig();
      r.replies.continueSaved = { ok: false, reason };
      click(byId(r, 'resume-continue'));
      expect(r.handle.mode, reason).toBe('stale');
      expect(disabled(byId(r, 'resume-continue'))).toBe(true);
      expect(disabled(byId(r, 'resume-discard'))).toBe(true);
      click(byId(r, 'resume-discard'));
      click(byId(r, 'resume-continue'));
      expect(r.calls, reason).toEqual(['continue']);
    }
  });
  it('BUSY keeps both buttons and allows a retry; another refusal changes nothing', () => {
    const r = rig();
    r.replies.continueSaved = { ok: false, reason: 'BUSY' };
    click(byId(r, 'resume-continue'));
    expect(r.handle.mode).toBe('active');
    expect(disabled(byId(r, 'resume-continue'))).toBe(false);
    r.replies.continueSaved = { ok: false, reason: 'ENGINE' };
    click(byId(r, 'resume-continue'));
    expect(r.handle.mode).toBe('active');
    r.replies.continueSaved = { ok: true };
    click(byId(r, 'resume-continue'));
    expect(r.calls).toEqual(['continue', 'continue', 'continue']);
    expect(r.handle.mode).toBe('done');
  });
  it('a re-entrant click from inside a handler is ignored', () => {
    const r = rig();
    const original = r.input();
    let inner = 0;
    r.handle.update({
      model: original.model,
      handlers: {
        continueSaved: () => {
          r.handle.discardSaved();
          r.handle.continueSaved();
          inner++;
          return { ok: true };
        },
        discardSaved: () => {
          throw new Error('must not run');
        },
      },
    });
    click(byId(r, 'resume-continue'));
    expect(inner).toBe(1);
    expect(r.handle.mode).toBe('done');
  });
  it('a thrown handler leaves the handle usable (the guard is released)', () => {
    const r = rig();
    let n = 0;
    r.handle.update({
      model: r.input().model,
      handlers: {
        continueSaved: () => {
          if (n++ === 0) throw new Error('boom');
          return { ok: true };
        },
        discardSaved: () => ({ ok: true }),
      },
    });
    expect(() => click(byId(r, 'resume-continue'))).toThrow('boom');
    expect(r.handle.mode).toBe('active');
    click(byId(r, 'resume-continue'));
    expect(r.handle.mode).toBe('done');
  });
});

describe('renderResume: stale and dispose', () => {
  it('is stale when model.resume becomes null: buttons disabled, handlers never called', () => {
    const r = rig();
    r.handle.update(r.input('en', null));
    expect(r.handle.mode).toBe('stale');
    expect(disabled(byId(r, 'resume-continue'))).toBe(true);
    click(byId(r, 'resume-continue'));
    click(byId(r, 'resume-discard'));
    expect(r.calls).toEqual([]);
    expect(visibleText(r)).toContain('Human players: 2'); // the last offer stays readable until the host removes it
  });
  it('starts stale when created without an offer', () => {
    setLanguage('en');
    const doc = new FakeDocument();
    const root = doc.createElement('div');
    doc.body.appendChild(root);
    const handle = renderResume(doc as never, root as unknown as HTMLElement, { model: { language: 'en', resume: null }, handlers: { continueSaved: () => ({ ok: true }), discardSaved: () => ({ ok: true }) } }, t);
    expect(handle.mode).toBe('stale');
    expect(doc.activeElement).toBeNull();
  });
  it('dispose removes the element, is idempotent and makes every entry point inert', () => {
    const r = rig();
    const button = byId(r, 'resume-continue');
    r.handle.dispose();
    r.handle.dispose();
    expect(r.root.children).toHaveLength(0);
    click(button);
    r.handle.continueSaved();
    r.handle.discardSaved();
    r.handle.focusFirst();
    r.handle.update(r.input('ko'));
    expect(r.calls).toEqual([]);
  });
  it('may be disposed from inside the handler (the controller renders synchronously): nothing is touched afterwards', () => {
    const r = rig();
    r.handle.update({
      model: r.input().model,
      handlers: {
        continueSaved: () => {
          r.handle.dispose();
          return { ok: true };
        },
        discardSaved: () => ({ ok: true }),
      },
    });
    click(byId(r, 'resume-continue'));
    expect(r.root.children).toHaveLength(0);
  });
});

describe('resume.ts source', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'resume.ts'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  it('uses no console, storage, clock, randomness or global, and imports only ui/ and i18n/', () => {
    expect(source).not.toMatch(/\bconsole\b|localStorage|sessionStorage|\bDate\b|Math\.random|\bwindow\b|globalThis|\bdocument\b|setTimeout|innerHTML/);
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) expect(spec, spec).toMatch(/^(?:\.\.\/\.\.\/i18n|\.\.\/components\/card-face|\.\.\/dom)$/);
  });
});
