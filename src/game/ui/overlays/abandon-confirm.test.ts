// Tests of the abandon-game confirmation (task 19.3; requirement 15.5). Evidence class: fake-DOM tests plus tests that run
// against a REAL controller game (still fake DOM; no real browser). Abandon is only ever called through
// `handlers.abandon`, so the tests count those calls.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { getStrategy } from '../../ai/registry';
import { ALL_CARDS } from '../../core/cards';
import type { Action } from '../../core/types';
import type { PlayerView } from '../../core/view';
import { errorMessageKey, resetLanguage, setLanguage, t } from '../../i18n';
import type { Lang } from '../../i18n';
import { createController } from '../controller';
import type { RenderInput, Schedule } from '../controller';
import type { ScreenName } from '../store';
import { asFake, descendants, elementsOf, FakeDocument } from '../testing/fake-dom';
import type { FakeEl } from '../testing/fake-dom';
import { ABANDON_STRING_KEYS, renderAbandonConfirm } from './abandon-confirm';
import type { AbandonCloseReason, AbandonHandle, AbandonInput, AbandonResult } from './abandon-confirm';
import type { ModalDocument } from './modal';

afterEach(() => resetLanguage());

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'abandon-confirm.ts'), 'utf8');
const CODE = SOURCE.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
const key = (k: string, init: { shiftKey?: boolean } = {}) => ({ key: k, ...init }) as { key: string };

// ---------------------------------------------------------------------------------------------------------
// Fake-DOM fixture: a mutable "host state" and a scripted abandon handler
// ---------------------------------------------------------------------------------------------------------

interface Host {
  screen: ScreenName;
  phase: PlayerView['phase'] | null;
  actionCount: number;
  language: Lang;
  /** Results returned by successive `abandon` calls; the last one repeats. */
  results: AbandonResult[];
  calls: number;
  /** Runs inside `abandon` (re-entrancy tests). */
  during?: () => void;
}

const newHost = (over: Partial<Host> = {}): Host => ({ screen: 'GAME', phase: 'PLACEMENT', actionCount: 3, language: 'en', results: [{ ok: true }], calls: 0, ...over });

const inputOf = (host: Host): AbandonInput => ({
  model: { screen: host.screen, actionCount: host.actionCount, language: host.language },
  view: host.phase === null ? null : { phase: host.phase },
  handlers: {
    abandon: () => {
      host.calls++;
      host.during?.();
      return host.results[Math.min(host.calls - 1, host.results.length - 1)] as AbandonResult;
    },
  },
});

function setup(host: Host = newHost()) {
  const doc = new FakeDocument();
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const opener = doc.createElement('button');
  doc.body.appendChild(opener);
  opener.focus();
  const closes: AbandonCloseReason[] = [];
  const handle = renderAbandonConfirm(doc as unknown as ModalDocument, root as unknown as HTMLElement, inputOf(host), t, { onClose: (r) => closes.push(r) });
  const sync = (): void => handle.update(inputOf(host));
  return { doc, root, opener, handle, host, closes, sync };
}

const byId = (h: AbandonHandle, id: string): FakeEl => descendants(asFake(h.dialog)).find((e) => e.getAttribute('id') === id) as FakeEl;
const cancelBtn = (h: AbandonHandle): FakeEl => byId(h, 'abandon-cancel');
const confirmBtn = (h: AbandonHandle): FakeEl => byId(h, 'abandon-confirm');
const errorEl = (h: AbandonHandle): FakeEl => descendants(asFake(h.dialog)).find((e) => e.getAttribute('role') === 'alert') as FakeEl;

describe('opening', () => {
  it('shows an alertdialog that is modal, labelled and described, and does NOT abandon', () => {
    const { root, handle, host } = setup();
    expect(handle.mode).toBe('closed');
    expect(root.children).toHaveLength(0);
    handle.open();
    expect(handle.mode).toBe('open');
    expect(host.calls).toBe(0);
    const d = asFake(handle.dialog);
    expect(d.getAttribute('role')).toBe('alertdialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(byId(handle, d.getAttribute('aria-labelledby') as string).textContent).toBe('Abandon this game?');
    expect(byId(handle, d.getAttribute('aria-describedby') as string).textContent).toBe('Progress will be lost.');
    expect(root.children).toEqual([asFake(handle.element)]);
  });

  it('has two clearly different buttons: Cancel (focused) and the destructive "Abandon game"', () => {
    const { doc, handle } = setup();
    handle.open();
    expect(cancelBtn(handle).textContent).toBe(t('common.button.cancel'));
    expect(confirmBtn(handle).textContent).toBe('Abandon game');
    expect(cancelBtn(handle).textContent).not.toBe(confirmBtn(handle).textContent);
    expect(confirmBtn(handle).getAttribute('class')).toContain('danger');
    expect(cancelBtn(handle).getAttribute('class')).not.toContain('danger');
    expect(doc.activeElement).toBe(cancelBtn(handle));
    // Cancel comes first in the tab order, so a quick Enter never lands on the destructive button.
    const buttons = descendants(asFake(handle.dialog)).filter((e) => e.tagName === 'button');
    expect(buttons[0]).toBe(cancelBtn(handle));
  });

  it('renders Korean text with the destructive label', () => {
    setLanguage('ko');
    const { handle } = setup(newHost({ language: 'ko' }));
    handle.open();
    expect(asFake(handle.dialog).textContent).toContain('이 게임을 포기할까요?');
    expect(asFake(handle.dialog).textContent).toContain('진행 상황이 사라집니다.');
    expect(confirmBtn(handle).textContent).toBe('게임 포기');
    expect(cancelBtn(handle).textContent).toBe('취소');
    expect(asFake(handle.dialog).getAttribute('lang')).toBe('ko');
  });

  it('a second open while open does nothing (no duplicate DOM or listeners)', () => {
    const { doc, root, handle } = setup();
    handle.open();
    handle.open();
    expect(root.children).toHaveLength(1);
    expect(doc.listenerCount()).toBe(1);
  });
});

describe('cancel', () => {
  it('Cancel closes, calls nothing on the game and restores the focus to the opener', () => {
    const { doc, opener, handle, host, closes } = setup();
    handle.open();
    cancelBtn(handle).fire('click');
    expect(handle.mode).toBe('closed');
    expect(host.calls).toBe(0);
    expect(closes).toEqual(['cancel']);
    expect(doc.activeElement).toBe(opener);
    expect(doc.listenerCount()).toBe(0);
  });

  it('Escape in the dialog and Escape on the document both cancel', () => {
    const a = setup();
    a.handle.open();
    cancelBtn(a.handle).fire('keydown', key('Escape'));
    expect(a.handle.mode).toBe('closed');
    expect(a.host.calls).toBe(0);
    const b = setup();
    b.handle.open();
    b.doc.dispatch('keydown', key('Escape'));
    expect(b.handle.mode).toBe('closed');
    expect(b.host.calls).toBe(0);
    expect(b.closes).toEqual(['cancel']);
  });

  it('a click on the backdrop cancels; a click inside the dialog does not', () => {
    const { handle, host } = setup();
    handle.open();
    asFake(handle.dialog).fire('click');
    expect(handle.mode).toBe('open');
    asFake(handle.element).fire('click');
    expect(handle.mode).toBe('closed');
    expect(host.calls).toBe(0);
  });

  it('can be opened again after a cancel', () => {
    const { handle, host } = setup();
    handle.open();
    handle.cancel();
    handle.open();
    expect(handle.mode).toBe('open');
    expect(host.calls).toBe(0);
  });

  it('cancel() while closed does nothing', () => {
    const { handle, closes } = setup();
    handle.cancel();
    expect(closes).toEqual([]);
  });
});

describe('confirm', () => {
  it('calls abandon exactly once, closes and becomes inert', () => {
    const { doc, root, handle, host, closes } = setup();
    handle.open();
    confirmBtn(handle).fire('click');
    expect(host.calls).toBe(1);
    expect(handle.mode).toBe('done');
    expect(closes).toEqual(['confirmed']);
    expect(root.children).toHaveLength(0);
    expect(doc.listenerCount()).toBe(0);
    handle.confirm();
    confirmBtn(handle).fire('click');
    handle.open();
    expect(handle.mode).toBe('done');
    expect(root.children).toHaveLength(0);
    expect(host.calls).toBe(1);
  });

  it('a repeated activation while the call runs does nothing (single flight)', () => {
    const { handle, host } = setup();
    host.during = () => {
      handle.confirm();
      confirmBtn(handle).fire('click');
      handle.cancel();
    };
    handle.open();
    confirmBtn(handle).fire('click');
    expect(host.calls).toBe(1);
    expect(handle.mode).toBe('done');
  });

  it('an update delivered inside the call (the controller renders synchronously) is judged after it returns', () => {
    const { handle, host, closes, sync } = setup();
    host.during = () => {
      host.screen = 'SETUP';
      host.actionCount = 0;
      sync();
    };
    handle.open();
    handle.confirm();
    expect(host.calls).toBe(1);
    expect(handle.mode).toBe('done');
    expect(closes).toEqual(['confirmed']); // not 'stale', and not twice
  });

  it('shows the localized engine message for ENGINE, stays open and allows another try', () => {
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      const { handle, host, closes } = setup(newHost({ language: lang, results: [{ ok: false, reason: 'ENGINE', code: 'GAME_ENDED' }, { ok: true }] }));
      handle.open();
      handle.confirm();
      expect(handle.mode).toBe('open');
      expect(errorEl(handle).textContent).toBe(t(errorMessageKey('GAME_ENDED')));
      expect(errorEl(handle).textContent.length).toBeGreaterThan(0);
      expect(closes).toEqual([]);
      handle.confirm();
      expect(host.calls).toBe(2);
      expect(handle.mode).toBe('done');
    }
  });

  it('keeps the dialog open for BUSY and sends nothing else', () => {
    const { handle, host, closes } = setup(newHost({ results: [{ ok: false, reason: 'BUSY' }, { ok: true }] }));
    handle.open();
    handle.confirm();
    expect(handle.mode).toBe('open');
    expect(host.calls).toBe(1);
    expect(errorEl(handle).textContent).toBe('');
    expect(closes).toEqual([]);
    handle.confirm();
    expect(host.calls).toBe(2);
    expect(handle.mode).toBe('done');
  });

  it('closes as stale for NO_GAME and DISPOSED', () => {
    for (const reason of ['NO_GAME', 'DISPOSED'] as const) {
      const { handle, host, closes } = setup(newHost({ results: [{ ok: false, reason }] }));
      handle.open();
      handle.confirm();
      expect(handle.mode, reason).toBe('closed');
      expect(closes, reason).toEqual(['stale']);
      expect(host.calls).toBe(1);
    }
  });

  it('an unknown refusal reason keeps the dialog open and shows nothing', () => {
    const { handle } = setup(newHost({ results: [{ ok: false, reason: 'SOMETHING_NEW' }] }));
    handle.open();
    handle.confirm();
    expect(handle.mode).toBe('open');
    expect(errorEl(handle).textContent).toBe('');
  });

  it('clears an old engine message when it is opened again', () => {
    const { handle } = setup(newHost({ results: [{ ok: false, reason: 'ENGINE', code: 'GAME_ENDED' }] }));
    handle.open();
    handle.confirm();
    handle.cancel();
    handle.open();
    expect(errorEl(handle).textContent).toBe('');
  });
});

describe('staleness and refusal', () => {
  it('refuses to open without an active game: SETUP, END and phase ENDED (mode not-needed, abandon never called)', () => {
    const cases: Partial<Host>[] = [{ screen: 'SETUP', phase: null, actionCount: 0 }, { screen: 'END', phase: 'ENDED' }, { screen: 'GAME', phase: 'ENDED' }];
    for (const over of cases) {
      const { root, handle, host } = setup(newHost(over));
      handle.open();
      expect(handle.mode, JSON.stringify(over)).toBe('not-needed');
      expect(root.children).toHaveLength(0);
      handle.confirm();
      expect(host.calls).toBe(0);
    }
  });

  it('opens later once the game is active again', () => {
    const { handle, host, sync } = setup(newHost({ screen: 'SETUP', phase: null, actionCount: 0 }));
    handle.open();
    expect(handle.mode).toBe('not-needed');
    host.screen = 'GAME';
    host.phase = 'PLACEMENT';
    sync();
    expect(handle.mode).toBe('closed');
    handle.open();
    expect(handle.mode).toBe('open');
  });

  it('an all-AI game has no view: phase null on the GAME screen still counts as active', () => {
    const { handle } = setup(newHost({ phase: null }));
    handle.open();
    expect(handle.mode).toBe('open');
  });

  it('closes as stale, without calling abandon, when the screen is no longer GAME', () => {
    for (const screen of ['SETUP', 'END'] as const) {
      const { root, handle, host, closes, sync } = setup();
      handle.open();
      host.screen = screen;
      sync();
      expect(handle.mode, screen).toBe('closed');
      expect(closes, screen).toEqual(['stale']);
      expect(root.children).toHaveLength(0);
      handle.confirm();
      expect(host.calls).toBe(0);
    }
  });

  it('closes as stale when the phase becomes ENDED', () => {
    const { handle, host, closes, sync } = setup();
    handle.open();
    host.phase = 'ENDED';
    sync();
    expect(handle.mode).toBe('closed');
    expect(closes).toEqual(['stale']);
    expect(host.calls).toBe(0);
  });

  it('closes as stale when the action count DECREASES (another game began)', () => {
    const { handle, host, closes, sync } = setup(newHost({ actionCount: 7 }));
    handle.open();
    host.actionCount = 0;
    sync();
    expect(handle.mode).toBe('closed');
    expect(closes).toEqual(['stale']);
    expect(host.calls).toBe(0);
  });

  it('an INCREASE of the action count is not stale: AI moves continue while the dialog is open', () => {
    const { handle, host, closes, sync } = setup(newHost({ actionCount: 3 }));
    handle.open();
    host.actionCount = 4;
    sync();
    host.actionCount = 9;
    host.phase = 'GUESS_COLLECT';
    sync();
    expect(handle.mode).toBe('open');
    expect(closes).toEqual([]);
    handle.confirm();
    expect(host.calls).toBe(1);
  });

  it('a decrease relative to the latest input is stale even after earlier increases', () => {
    const { handle, host, sync } = setup(newHost({ actionCount: 3 }));
    handle.open();
    host.actionCount = 10;
    sync();
    host.actionCount = 2;
    sync();
    expect(handle.mode).toBe('closed');
  });

  it('a stale handle reports exactly one close', () => {
    const { handle, host, closes, sync } = setup();
    handle.open();
    host.screen = 'SETUP';
    sync();
    sync();
    handle.cancel();
    expect(closes).toEqual(['stale']);
  });
});

describe('focus', () => {
  it('keeps Tab inside the dialog between the two buttons', () => {
    const { doc, handle } = setup();
    handle.open();
    const cancel = cancelBtn(handle);
    const confirm = confirmBtn(handle);
    confirm.focus();
    expect(confirm.fire('keydown', key('Tab')).defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(cancel);
    expect(cancel.fire('keydown', key('Tab', { shiftKey: true })).defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(confirm);
    cancel.focus();
    expect(cancel.fire('keydown', key('Tab')).defaultPrevented).toBe(false); // the browser moves to Confirm
    expect(doc.activeElement).toBe(cancel);
  });

  it('restores the focus after cancel and after a stale close; falls back when the opener is gone', () => {
    const a = setup();
    a.handle.open();
    a.host.screen = 'SETUP';
    a.sync();
    expect(a.doc.activeElement).toBe(a.opener);

    const b = setup();
    b.handle.open();
    b.doc.body.removeChild(b.opener);
    b.handle.cancel();
    expect(b.doc.activeElement).toBeNull();
  });

  it('a language change re-renders in place: still open, same buttons, same focus', () => {
    const { doc, root, handle, host, sync } = setup();
    handle.open();
    const confirm = confirmBtn(handle);
    confirm.focus();
    setLanguage('ko');
    host.language = 'ko';
    sync();
    expect(handle.mode).toBe('open');
    expect(root.children).toHaveLength(1);
    expect(confirmBtn(handle)).toBe(confirm);
    expect(doc.activeElement).toBe(confirm);
    expect(confirm.textContent).toBe('게임 포기');
    expect(cancelBtn(handle).textContent).toBe('취소');
    expect(doc.listenerCount()).toBe(1);
  });

  it('keeps an engine error visible across a language change, re-localized', () => {
    const { handle, host, sync } = setup(newHost({ results: [{ ok: false, reason: 'ENGINE', code: 'GAME_ENDED' }] }));
    handle.open();
    handle.confirm();
    const en = errorEl(handle).textContent;
    setLanguage('ko');
    host.language = 'ko';
    sync();
    expect(errorEl(handle).textContent).toBe(t(errorMessageKey('GAME_ENDED')));
    expect(errorEl(handle).textContent).not.toBe(en);
  });
});

describe('dispose', () => {
  it('removes the DOM and listeners and makes every later callback a no-op', () => {
    const { doc, root, handle, host, closes, sync } = setup();
    handle.open();
    const confirm = confirmBtn(handle);
    handle.dispose();
    expect(root.children).toHaveLength(0);
    expect(doc.listenerCount()).toBe(0);
    handle.open();
    handle.confirm();
    handle.cancel();
    handle.update(inputOf(host));
    confirm.fire('click');
    doc.dispatch('keydown', key('Escape'));
    sync();
    handle.dispose();
    expect(host.calls).toBe(0);
    expect(closes).toEqual([]);
    expect(root.children).toHaveLength(0);
  });

  it('dispose while closed leaves open() inert', () => {
    const { root, handle, host } = setup();
    handle.dispose();
    handle.open();
    expect(root.children).toHaveLength(0);
    expect(host.calls).toBe(0);
  });
});

describe('privacy', () => {
  it('the input has no hand, Guess or card data, and the DOM shows none of it', () => {
    const { handle } = setup();
    handle.open();
    const all = elementsOf(asFake(handle.dialog)).flatMap((el) => [el.textContent, ...el.attributes.values()]).join('\n');
    for (const card of ALL_CARDS) expect(all.includes(card), card).toBe(false);
    expect(all).not.toMatch(/seed|score|hand|guess/i);
    expect(Object.keys(inputOf(newHost())).sort()).toEqual(['handlers', 'model', 'view']);
    expect(Object.keys(inputOf(newHost()).model).sort()).toEqual(['actionCount', 'language', 'screen']);
  });

  it('lists the keys it uses, and they exist in both languages', () => {
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      for (const k of ABANDON_STRING_KEYS) expect(t(k), `${lang} ${k}`).not.toBe(k);
    }
  });

  it('source: no console, storage, global, clock or random; no engine, state or controller import', () => {
    expect(CODE).not.toMatch(/\bconsole\b|localStorage|sessionStorage|globalThis|\bwindow\b|Math\.random|Date\.now|new Date|performance\.now|crypto|innerHTML/);
    for (const m of SOURCE.matchAll(/^import .* from '([^']+)'/gm)) expect(m[1], m[0]).not.toMatch(/core\/(engine|state|deck|replay|rules|score)|controller|ai\//);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Against a REAL controller game
// ---------------------------------------------------------------------------------------------------------

describe('with a real controller game', () => {
  class Queue {
    readonly fns: (() => void)[] = [];
    readonly schedule: Schedule = (fn) => {
      this.fns.push(fn);
      return {
        cancel: () => {
          const i = this.fns.indexOf(fn);
          if (i >= 0) this.fns.splice(i, 1);
        },
      };
    };
    step(): boolean {
      const fn = this.fns.shift();
      if (fn === undefined) return false;
      fn();
      return true;
    }
  }

  function realGame() {
    const queue = new Queue();
    const doc = new FakeDocument();
    const root = doc.createElement('div');
    doc.body.appendChild(root);
    const opener = doc.createElement('button');
    doc.body.appendChild(opener);
    opener.focus();
    let latest: RenderInput | null = null;
    let handle: AbandonHandle | null = null;
    let abandonCalls = 0;
    const toInput = (i: RenderInput): AbandonInput => ({
      model: i.model,
      view: i.view,
      handlers: {
        abandon: () => {
          abandonCalls++;
          return i.handlers.abandon();
        },
      },
    });
    const ctl = createController({
      schedule: queue.schedule,
      renderer: (i) => {
        latest = i;
        handle?.update(toInput(i)); // like a host: every render reaches the dialog
      },
      randomSeed: () => 11,
      language: () => 'en',
    });
    ctl.startGame({ seed: 11 });
    // The human places once, so that an AI step is scheduled.
    const view = ctl.getView('P0') as PlayerView;
    ctl.dispatchHuman(getStrategy('BEGINNER').choosePlacement(view, { decisionSeed: 1 }) as Action);
    handle = renderAbandonConfirm(doc as unknown as ModalDocument, root as unknown as HTMLElement, toInput(latest as unknown as RenderInput), t);
    return { ctl, queue, doc, root, opener, handle, calls: () => abandonCalls, latest: () => latest as unknown as RenderInput };
  }

  it('Cancel leaves the running game, its view and its AI scheduling untouched', () => {
    const g = realGame();
    const before = { model: g.ctl.getModel(), count: g.ctl.getModel().actionCount, pending: g.queue.fns.length, view: JSON.stringify(g.ctl.getView('P0')) };
    expect(before.model.screen).toBe('GAME');
    expect(before.pending).toBe(1);
    g.handle.open();
    expect(g.handle.mode).toBe('open');
    cancelBtn(g.handle).fire('click');
    g.handle.open();
    g.doc.dispatch('keydown', key('Escape'));
    expect(g.calls()).toBe(0);
    expect(g.ctl.getModel()).toBe(before.model); // not even a new model object: nothing was set
    expect(JSON.stringify(g.ctl.getView('P0'))).toBe(before.view);
    expect(g.queue.fns.length).toBe(before.pending);
    expect(g.queue.step()).toBe(true); // the AI turn still runs
    expect(g.ctl.getModel().actionCount).toBe(before.count + 1);
    expect(g.ctl.getModel().screen).toBe('GAME');
  });

  it('an AI move while the dialog is open does not close it; Confirm then returns the controller to SETUP exactly once', () => {
    const g = realGame();
    g.handle.open();
    expect(g.queue.step()).toBe(true); // an AI Action: actionCount increases
    expect(g.handle.mode).toBe('open');
    confirmBtn(g.handle).fire('click');
    expect(g.calls()).toBe(1);
    expect(g.ctl.getModel().screen).toBe('SETUP');
    expect(g.ctl.getModel().actionCount).toBe(0);
    expect(g.ctl.getView('P0')).toBeNull();
    expect(g.handle.mode).toBe('done');
    expect(g.root.children).toHaveLength(0);
    // the pending AI step of the dropped game does nothing
    const model = g.ctl.getModel();
    while (g.queue.step()) {
      /* drain */
    }
    expect(g.ctl.getModel()).toBe(model);
  });

  it('confirming twice calls abandon once', () => {
    const g = realGame();
    g.handle.open();
    const confirm = confirmBtn(g.handle);
    confirm.fire('click');
    confirm.fire('click');
    g.handle.confirm();
    expect(g.calls()).toBe(1);
    expect(g.ctl.getModel().screen).toBe('SETUP');
  });

  it('a dialog left open when someone else abandons the game closes as stale and never abandons again', () => {
    const g = realGame();
    g.handle.open();
    g.ctl.abandon(); // for example the final screen of another path; the render reaches the dialog
    expect(g.handle.mode).toBe('closed');
    expect(g.calls()).toBe(0);
    g.handle.confirm();
    expect(g.calls()).toBe(0);
  });

  it('refuses to open on the setup screen after an abandon (mode not-needed)', () => {
    const g = realGame();
    g.ctl.abandon();
    g.handle.open();
    expect(g.handle.mode).toBe('not-needed');
    expect(g.calls()).toBe(0);
  });
});
