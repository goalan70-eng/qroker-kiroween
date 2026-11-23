// @vitest-environment happy-dom
// Codex, Issue #8: Task 21.3 acceptance. Fake-DOM evidence only; no layout, touch or browser focus claims.
import { afterEach, describe, expect, it } from 'vitest';
import { BEGINNER_STRATEGY } from '../ai/random';
import { SAVE_KEY, memoryStore } from '../persistence/storage';
import { EMPTY_DRAFT } from './placement-draft';
import {
  acknowledgeGateIfShown, clickByLabel, label, mountTestApp, playHumanTurnAuto, typeInto, useMountCleanup,
} from './testing/mount';
import type { MountedApp } from './testing/mount';

useMountCleanup(afterEach);

function start(app: MountedApp, humans = 1): void {
  (app.root.querySelector(`#setup-humans-${humans}`) as HTMLInputElement).click();
  clickByLabel(app, label(app, 'setup.start'));
}

function language(app: MountedApp, lang: 'en' | 'ko'): void {
  const select = app.root.querySelector('#shell-language') as HTMLSelectElement;
  select.value = lang;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Task 21.3 privacy, accessibility, language and persistence (fake-DOM)', () => {
  it('gates every human Hand and Guess, clears private DOM and never renders AI Guess text', () => {
    let aiGuesses = 0;
    const app = mountTestApp({ seed: 20240601, strategyFor: () => ({
      ...BEGINNER_STRATEGY,
      chooseGuesses(view) {
        aiGuesses++;
        return { type: 'SUBMIT_GUESSES', player: view.viewer,
          guesses: Object.fromEntries(view.pendingQuadKeys.map((key) => [key, 51])) };
      },
    }) });
    start(app, 2);
    const purposes = new Set<string>();
    // Approved composition contract: the starter already holds the device. A gate is required on a Seat change,
    // not when the same person proceeds from a Hand to a Guess (controller.ts, task 19.4).
    let admitted: string = 'P0';
    let entries = 0;
    let hands = 0;
    let reveals = 0;
    let ended = false;
    const oldPrivateNodes: Element[] = [];
    for (let step = 0; step < 200; step++) {
      const model = app.controller.getModel();
      expect(model.lastError).toBeNull();
      // Include hidden DOM, all attributes and live regions. Remove only documented public numeric fields
      // that may legitimately equal the sentinel (scores, Hidden_Sums, counts, seed and save timestamp).
      const clone = app.root.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.scoreboard-score, .scoreboard-hand, .scoreboard-deck, .reveal-sum, .reveal-earned, .reveal-total, .reveal-final, .end-final, .end-sum, .end-earned, .end-cumulative, .game-seed').forEach((el) => el.remove());
      expect(clone.outerHTML).not.toMatch(/(?<!\d)51(?!\d)/);
      expect(Array.from(app.root.querySelectorAll('input, textarea')).some((el) => (el as HTMLInputElement).value === '51')).toBe(false);
      if (model.gate !== null) {
        purposes.add(model.gate.purpose);
        admitted = model.gate.forSeat;
        expect(app.root.querySelectorAll('.hand, .card-face, .board-cell, .guess-input, [data-drag-overlay]').length).toBe(0);
        expect(oldPrivateNodes.every((el) => !app.root.contains(el))).toBe(true);
        expect(app.root.querySelectorAll('#game-main input, #game-main textarea').length).toBe(0);
        acknowledgeGateIfShown(app);
        continue;
      }
      if (model.screen === 'END') { ended = true; break; }
      const viewer = model.viewer;
      const view = app.controller.getView(viewer ?? 'P0');
      expect(view).not.toBeNull();
      if (viewer !== null) expect(viewer).toBe(admitted);
      oldPrivateNodes.push(...app.root.querySelectorAll('.hand, .guess-form'));
      if (app.root.querySelector('.guess-form') !== null) {
        expect(viewer).not.toBeNull();
        expect(Array.from(app.root.querySelectorAll('.guess-input')).every((el) => (el as HTMLInputElement).value === '')).toBe(true);
        const before = model.actionCount;
        const field = label(app, 'guess.input.label', { key: view!.pendingQuadKeys[0]!, min: 4, max: 52 });
        typeInto(app, field, '3');
        clickByLabel(app, label(app, 'guess.submit'));
        expect(app.root.querySelector('.guess-error')?.textContent).toBe(label(app, 'error.GUESS_OUT_OF_RANGE'));
        expect(app.controller.getModel().actionCount).toBe(before);
        for (const key of view!.pendingQuadKeys) typeInto(app, label(app, 'guess.input.label', { key, min: 4, max: 52 }), '17');
        clickByLabel(app, label(app, 'guess.submit'));
        entries++;
      } else if (view!.phase === 'PLACEMENT') {
        expect(viewer).not.toBeNull();
        playHumanTurnAuto(app);
        hands++;
      } else {
        expect(view!.phase).toBe('REVEAL');
        clickByLabel(app, label(app, 'reveal.continue'));
        reveals++;
      }
    }
    expect(ended).toBe(true);
    expect([...purposes].sort()).toEqual(['GUESS', 'HAND']);
    expect(hands).toBeGreaterThan(1);
    expect(entries).toBeGreaterThanOrEqual(2);
    expect(reveals).toBeGreaterThan(0);
    expect(aiGuesses).toBeGreaterThanOrEqual(2); // the sentinel scan is not vacuous
  });

  it('names all 64 Board buttons, moves the roving focus and localizes errors without losing state', () => {
    const app = mountTestApp({ seed: 7 });
    start(app);
    const cells = app.root.querySelectorAll<HTMLButtonElement>('.board-cell');
    expect(cells.length).toBe(64);
    expect(new Set(Array.from(cells, (el) => el.getAttribute('aria-label'))).size).toBe(64);
    expect(Array.from(cells).every((el) => el.getAttribute('aria-label')!.length > 0)).toBe(true);
    const cell = cells[0]!;
    cell.focus();
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(cells[1]);
    expect(app.root.querySelectorAll('.board-cell[tabindex="0"]').length).toBe(1);
    const before = app.controller.getView('P0');
    const count = app.controller.getModel().actionCount;
    for (const lang of ['en', 'ko'] as const) {
      language(app, lang);
      (app.root.querySelector('.board-cell--occupied') as HTMLButtonElement).click();
      expect(app.root.querySelector('.placement-error')?.textContent).toBe(label(app, 'error.OCCUPIED'));
      expect(app.controller.getModel().actionCount).toBe(count);
      expect(app.controller.getView('P0')).toEqual(before);
      expect(app.root.querySelector('[aria-live="polite"]')).not.toBeNull();
      expect(app.root.querySelector('.game-live')?.textContent?.trim().length).toBeGreaterThan(0);
    }
    // Position-first keyboard path; happy-dom dispatches events but does not emulate native button activation.
    const legal = app.root.querySelector('.board-cell.is-legal')!;
    legal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const card = app.root.querySelector('.hand-card')!;
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(app.controller.getModel().draft.card).not.toBeNull();
    app.root.querySelector('.hand-card')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(app.controller.getModel().draft).toEqual(EMPTY_DRAFT);
    expect(app.controller.getModel().actionCount).toBe(count);
  });

  it('resumes the same game after re-mount and continues playing', () => {
    const store = memoryStore();
    const first = mountTestApp({ seed: 1, store });
    start(first);
    playHumanTurnAuto(first);
    const before = first.controller.getView('P0');
    const count = first.controller.getModel().actionCount;
    first.dispose();
    const second = mountTestApp({ store });
    expect(second.root.querySelector('.hand-card, .board-cell, .guess-input')).toBeNull();
    clickByLabel(second, label(second, 'persistence.resume.continue'));
    expect(second.controller.getView('P0')).toEqual(before);
    expect(second.controller.getModel().actionCount).toBe(count);
    playHumanTurnAuto(second);
    expect(second.controller.getModel().actionCount).toBeGreaterThan(count);
  });

  it.each(['en', 'ko'] as const)('discards corrupt storage with a localized safe notice (%s)', (lang) => {
    const store = memoryStore();
    store.setItem(SAVE_KEY, '{private-secret-broken-save');
    const app = mountTestApp({ store, languages: [lang] });
    expect(app.root.textContent).toContain(label(app, 'persistence.notice.SAVE_DISCARDED.CORRUPT'));
    expect(app.root.outerHTML).not.toContain('private-secret');
    expect(store.getItem(SAVE_KEY)).toBeNull();
    expect(app.controller.getModel().screen).toBe('SETUP');
  });
});
