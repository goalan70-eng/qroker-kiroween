// @vitest-environment happy-dom
// Task 21.1: the headless DOM environment. Evidence class: fake-DOM = happy-dom (no layout, no real browser).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREFS_KEY, SAVE_KEY } from '../../persistence/storage';
import {
  acknowledgeGateIfShown,
  clickByLabel,
  createTestScheduler,
  disposeAllMounted,
  getByLabel,
  getText,
  label,
  mountTestApp,
  playHumanTurnAuto,
  typeInto,
  useMountCleanup,
} from './mount';

useMountCleanup(afterEach);

describe('mountTestApp: the real setup screen', () => {
  it.each([
    ['en', ['en']],
    ['ko', ['ko']],
  ] as const)('renders the setup screen and finds the Start button by its localized label (%s)', (lang, languages) => {
    const app = mountTestApp({ languages: [...languages] });
    expect(app.controller.getModel().language).toBe(lang);
    const start = getByLabel(app, label(app, 'setup.start'));
    expect(start.tagName).toBe('BUTTON');
    expect(start.getAttribute('type')).toBe('submit');
    expect(start.textContent).toBe(lang === 'en' ? 'Start game' : '게임 시작');
    expect(app.controller.getModel().screen).toBe('SETUP');
    // Nothing is saved before a game starts.
    expect(app.store.getItem(SAVE_KEY)).toBeNull();
    expect(app.store.getItem(PREFS_KEY)).toBeNull();
    expect(app.scheduler.pending()).toBe(0);
    expect(document.body.contains(app.root)).toBe(true);

    app.dispose();
    expect(document.body.contains(app.root)).toBe(false);
    expect(document.body.children.length).toBe(0);
    expect(app.scheduler.pending()).toBe(0);
    app.dispose(); // idempotent
  });
});

describe('helpers', () => {
  it('typeInto sets the seed field and the entered seed reaches the engine', () => {
    const app = mountTestApp();
    typeInto(app, label(app, 'setup.seed.label'), '424242');
    clickByLabel(app, label(app, 'setup.start'));
    const model = app.controller.getModel();
    expect(model.screen).toBe('GAME');
    expect(model.lastError).toBeNull();
    expect(getText(app)).toContain(label(app, 'game.seed', { seed: 424242 }));
  });

  it('works in Korean with labels from the real string tables', () => {
    const app = mountTestApp({ languages: ['ko'] });
    typeInto(app, label(app, 'setup.seed.label'), '7');
    clickByLabel(app, label(app, 'setup.start'));
    expect(app.controller.getModel().screen).toBe('GAME');
    expect(getText(app)).toContain(label(app, 'game.seed', { seed: 7 }));
    expect(getByLabel(app, label(app, 'abandon.open')).textContent).toBe('게임 포기');
  });

  it('playHumanTurnAuto places exactly once per call and drains the AI turns (3 consecutive turns)', () => {
    const app = mountTestApp();
    clickByLabel(app, label(app, 'setup.start'));
    expect(app.controller.getModel().screen).toBe('GAME');
    let expectedBefore = app.controller.getModel().actionCount;
    for (let turn = 0; turn < 3; turn++) {
      const result = playHumanTurnAuto(app);
      expect(result.placed).toBe(true);
      expect(result.actionCountBefore).toBe(expectedBefore);
      // One human PLACE plus three AI placements, drained by the flush.
      expect(result.actionCountAfter).toBe(expectedBefore + 4);
      expect(app.controller.getModel().lastError).toBeNull();
      expect(app.scheduler.pending()).toBe(0);
      expectedBefore = result.actionCountAfter;
    }
    expect(app.scheduler.virtualTimeMs).toBeGreaterThan(0);
  });

  it('playHumanTurnAuto fails clearly on the setup screen', () => {
    const app = mountTestApp();
    expect(() => playHumanTurnAuto(app)).toThrow(/no game is in progress/);
  });

  it('playHumanTurnAuto fails while the AI is on turn (autoFlush off) and succeeds after flush', () => {
    const app = mountTestApp({ autoFlush: false });
    clickByLabel(app, label(app, 'setup.start'));
    playHumanTurnAuto(app);
    expect(app.scheduler.pending()).toBe(1);
    expect(() => playHumanTurnAuto(app)).toThrow(/no human turn/);
    app.flush();
    expect(playHumanTurnAuto(app).placed).toBe(true);
  });

  it('playHumanTurnAuto fails when the phase is not PLACEMENT', () => {
    const app = mountTestApp();
    clickByLabel(app, label(app, 'setup.start'));
    for (let turn = 0; turn < 20 && app.controller.getModel().screen === 'GAME'; turn++) {
      const model = app.controller.getModel();
      const view = model.viewer === null ? null : app.controller.getView(model.viewer);
      if (view !== null && view.phase !== 'PLACEMENT') break;
      playHumanTurnAuto(app);
    }
    const model = app.controller.getModel();
    const view = model.viewer === null ? null : app.controller.getView(model.viewer);
    expect(view?.phase).toBe('GUESS_COLLECT');
    expect(() => playHumanTurnAuto(app)).toThrow(/not a placement turn \(phase GUESS_COLLECT\)/);
    expect(model.lastError).toBeNull();
  });

  it('never passes a privacy gate by itself (2 human seats)', () => {
    const app = mountTestApp();
    clickByLabel(app, label(app, 'setup.humans.option', { n: 2 }));
    clickByLabel(app, label(app, 'setup.start'));
    expect(app.controller.getModel().screen).toBe('GAME');
    expect(app.controller.getModel().gate).toBeNull(); // no gate before the first seat
    expect(acknowledgeGateIfShown(app)).toBe(false);
    playHumanTurnAuto(app); // P0
    expect(app.controller.getModel().gate).not.toBeNull();
    expect(() => playHumanTurnAuto(app)).toThrow(/privacy gate is shown/);
    expect(app.controller.getModel().actionCount).toBeGreaterThan(0);
    expect(acknowledgeGateIfShown(app)).toBe(true);
    expect(app.controller.getModel().gate).toBeNull();
    expect(playHumanTurnAuto(app).placed).toBe(true); // P1
  });
});

describe('clickByLabel diagnostics', () => {
  it('names the missing label, lists candidate control names and leaks no input value', () => {
    const app = mountTestApp();
    typeInto(app, label(app, 'setup.seed.label'), 'secret-value-123');
    let message = '';
    try {
      clickByLabel(app, 'Start gam');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('"Start gam"');
    expect(message).toContain(JSON.stringify(label(app, 'setup.start')));
    expect(message).not.toContain('secret-value-123');
    expect(message.length).toBeLessThan(2000);
  });

  it('reports ambiguity and supports nth', () => {
    const app = mountTestApp();
    expect(() => clickByLabel(app, /^\d$/)).toThrow(/usable controls are named/);
    expect(() => clickByLabel(app, /^\d$/, { nth: 99 })).toThrow(/out of range/);
    clickByLabel(app, /^\d$/, { nth: 1 }); // the radio of 2 human seats
  });
});

describe('lifecycle and isolation', () => {
  it('disposeAllMounted cleans up after a failing flow', () => {
    let leaked: HTMLElement | null = null;
    try {
      const app = mountTestApp();
      leaked = app.root;
      clickByLabel(app, 'no such control');
    } catch {
      // expected: the test body failed half way
    } finally {
      expect(leaked !== null && document.body.contains(leaked)).toBe(true);
      disposeAllMounted();
    }
    expect(document.body.children.length).toBe(0);
  });

  it('two sequential mounts get fresh stores, roots and the same deterministic seed behavior', () => {
    const texts: string[] = [];
    const roots: HTMLElement[] = [];
    const stores: unknown[] = [];
    for (let i = 0; i < 2; i++) {
      const app = mountTestApp({ seed: 99 });
      roots.push(app.root);
      stores.push(app.store);
      expect(app.store.getItem(SAVE_KEY)).toBeNull();
      clickByLabel(app, label(app, 'setup.start'));
      expect(app.store.getItem(SAVE_KEY)).not.toBeNull();
      texts.push(getText(app));
      app.dispose();
    }
    expect(roots[0]).not.toBe(roots[1]);
    expect(stores[0]).not.toBe(stores[1]);
    expect(texts[0]).toBe(texts[1]);
    expect(texts[0]).toContain('99');
  });

  it('uses the injected seed sequence', () => {
    const app = mountTestApp({ seeds: [5, 6, 7] });
    expect(app.seedCalls()).toBe(1); // the setup screen's default seed text
    expect((getByLabel(app, label(app, 'setup.seed.label')) as HTMLInputElement).value).toBe('5');
  });

  it('a late scheduler callback after dispose is a no-op and the queue is empty', () => {
    const app = mountTestApp({ autoFlush: false });
    clickByLabel(app, label(app, 'setup.start'));
    playHumanTurnAuto(app);
    expect(app.scheduler.pending()).toBe(1);
    app.dispose();
    expect(app.scheduler.pending()).toBe(0);
    expect(app.flush()).toBe(0);
  });

  it('the flush budget stops an endless scheduling loop', () => {
    const scheduler = createTestScheduler();
    const again = (): void => void scheduler.schedule(again, 1);
    again();
    expect(() => scheduler.flush(5)).toThrow(/infinite loop guard/);
  });
});

describe('no real timers, no console', () => {
  it('the app code path starts no real timer (the injected scheduler does all the waiting)', () => {
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    const interval = vi.spyOn(globalThis, 'setInterval');
    try {
      const app = mountTestApp();
      clickByLabel(app, label(app, 'setup.start'));
      playHumanTurnAuto(app);
      expect(app.scheduler.virtualTimeMs).toBeGreaterThan(0);
      app.dispose();
      // happy-dom may use timers internally; if it does, none of them comes from the app: the controller's waits all went
      // through the scheduler (virtual time moved), so a count here would be the DOM library's own.
      expect(interval).not.toHaveBeenCalled();
      expect(timeout).not.toHaveBeenCalled();
    } finally {
      timeout.mockRestore();
      interval.mockRestore();
    }
  });

  it('writes nothing to the console during a mounted flow', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    try {
      const app = mountTestApp();
      clickByLabel(app, label(app, 'setup.start'));
      playHumanTurnAuto(app);
      app.dispose();
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
