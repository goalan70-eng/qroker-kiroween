// Tests of the composition host (task 19.4). Evidence class 2 of the design's Testing Strategy: the host against the
// hand-written fake Document of ui/testing/fake-dom.ts with the REAL controller (`createController`) and a manually drained
// queue scheduler; the games are real, only the DOM is a stand-in. This is NOT a browser: no layout, no real focus or
// `inert` behaviour, no pointer capture. The real-browser checks of the page are e2e/game.spec.ts (stage 3) and the
// throwaway smoke recorded in docs/game/ui-progress.md.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlayerId } from '../../core/types';
import { resetLanguage, setLanguage } from '../../i18n';
import { createController } from '../controller';
import type { Controller, RenderHandlers, RenderInput, Schedule } from '../controller';
import type { SetupOptions } from '../setup-model';
import { asFake, classesOf, elementsOf, FakeDocument, FakeEl } from '../testing/fake-dom';
import { createGameScreen } from './game';
import type { GameScreen, GameScreenDocument } from './game';

afterEach(() => resetLanguage());

// ---------------------------------------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------------------------------------

const SEATS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];
const GLYPH: Record<string, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };

class Queue {
  readonly tasks: { fn: () => void; cancelled: boolean }[] = [];
  readonly schedule: Schedule = (fn) => {
    const entry = { fn, cancelled: false };
    this.tasks.push(entry);
    return {
      cancel: () => {
        entry.cancelled = true;
        const at = this.tasks.indexOf(entry);
        if (at >= 0) this.tasks.splice(at, 1);
      },
    };
  };
  get pending(): number {
    return this.tasks.length;
  }
  step(): boolean {
    const entry = this.tasks.shift();
    if (entry === undefined) return false;
    entry.fn();
    return true;
  }
}

interface Harness {
  readonly doc: FakeDocument;
  readonly root: FakeEl;
  readonly host: GameScreen;
  readonly ctl: Controller;
  readonly queue: Queue;
  readonly renders: RenderInput[];
  input(): RenderInput;
}

function boot(language: 'en' | 'ko' = 'en'): Harness {
  setLanguage(language);
  const doc = new FakeDocument();
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const queue = new Queue();
  const renders: RenderInput[] = [];
  const host = createGameScreen({
    doc: doc as unknown as GameScreenDocument,
    root: root as unknown as HTMLElement,
    randomSeedText: () => '4242',
  });
  const ctl = createController({
    schedule: queue.schedule,
    renderer: (input) => {
      renders.push(input);
      host.render(input);
    },
    randomSeed: () => 777,
    language: () => language,
  });
  return { doc, root, host, ctl, queue, renders, input: () => renders[renders.length - 1] as RenderInput };
}

const options = (humanCount: number, seedText = '12345'): SetupOptions => ({
  humanCount,
  difficulties: ['BEGINNER', 'BEGINNER', 'BEGINNER', 'BEGINNER'],
  identityVisibility: 'OWNER_ONLY',
  seedText,
});

const all = (h: Harness): FakeEl[] => h.doc.all();
const hasClass = (e: FakeEl, c: string): boolean => classesOf(e).includes(c);
const byClass = (h: Harness, c: string): FakeEl[] => all(h).filter((e) => hasClass(e, c));
const byId = (h: Harness, id: string): FakeEl | null => h.doc.getElementById(id);
const text = (e: FakeEl | undefined | null): string => e?.textContent ?? '';
const click = (e: FakeEl | null | undefined): void => void (e as FakeEl).fire('click');

function serialize(el: FakeEl): string {
  if (el.tagName === '#text') return el.textContent;
  const attrs = [...el.attributes].map(([k, v]) => `${k}="${v}"`).join(' ');
  const value: unknown = (el as unknown as { value?: unknown }).value;
  const v = typeof value === 'string' && value !== '' ? ` value="${value}"` : '';
  return `<${el.tagName} ${attrs}${v}>${el.children.length > 0 ? el.children.map(serialize).join('') : el.textContent}</${el.tagName}>`;
}

const PRIVATE_CLASSES = ['hand', 'hand-card', 'guess-entry', 'guess-form', 'guess-input', 'placement-panel', 'board-frame', 'board-cell'];
/** Nodes of the viewer's private area. oard is private only in the sense of a gate: a read-only PUBLIC board may show during an AI turn. */
const privateNodes = (h: Harness, withBoard = true): FakeEl[] =>
  all(h).filter((e) => PRIVATE_CLASSES.some((c) => hasClass(e, c) && (withBoard || (c !== 'board-frame' && c !== 'board-cell'))));
/** Class names only: a failing assertion must not try to print FakeEl objects (their HTML-string getters throw). */
const names = (els: readonly FakeEl[]): string[] => els.map((e) => e.getAttribute('class') ?? e.tagName);
const BANNER_CLASSES = ['banner', 'scoreboard-banner', 'reveal-banner', 'end-banner'];
const bannerCount = (h: Harness): number => all(h).filter((e) => BANNER_CLASSES.some((c) => hasClass(e, c))).length;

/** The ways a card of a Hand could show up in the page: its id, or its rank and suit glyph in the visible text. */
function leaks(h: Harness, seat: PlayerId): string[] {
  const hand = h.ctl.getView(seat)?.myHand ?? [];
  const dom = serialize(h.root);
  const visible = h.root.textContent;
  const found: string[] = [];
  for (const card of hand) {
    const rank = card.slice(2);
    if (dom.includes(card) || visible.includes(`${rank}${GLYPH[card[0] as string] as string}`)) found.push(card);
  }
  return found;
}

/** Cards of every Seat that the page must not show right now (a gate, an AI turn, or any Seat other than the viewer). */
function assertNoForeignCards(h: Harness, label: string): void {
  const viewer = h.input().view?.viewer ?? null;
  for (const seat of SEATS) {
    if (seat === viewer) continue;
    expect(leaks(h, seat), `${label}: Hand of ${seat}`).toEqual([]);
  }
  if (viewer === null) {
    expect(names(privateNodes(h, h.input().model.gate !== null)), `${label}: private nodes`).toEqual([]);
    expect(serialize(h.root), label).not.toContain('<input');
  }
}

interface DriveOptions {
  readonly max?: number;
  readonly guessValue?: (seat: PlayerId, index: number) => string;
  /** Called after every action of the driver. */
  readonly onStep?: (h: Harness, what: string) => void;
}

/**
 * Plays like a person at the page, through the HOST DOM only (click, input, focus): acknowledges a gate, fills and submits the
 * Guess form, continues a reveal, places one card (position first, then a card, then Confirm), and otherwise lets one
 * scheduled AI step run. Stops when `until` is true. Throws when nothing can be done.
 */
function drive(h: Harness, until: (h: Harness) => boolean, o: DriveOptions = {}): void {
  const max = o.max ?? 800;
  for (let i = 0; i < max; i++) {
    if (until(h)) return;
    const input = h.input();
    const ack = byId(h, 'privacy-gate-ack');
    const inputs = byClass(h, 'guess-input');
    const cont = byId(h, 'reveal-continue');
    let what: string;
    if (ack !== null) {
      click(ack);
      what = 'gate';
    } else if (inputs.length > 0 && byId(h, 'guess-submit') !== null) {
      const seat = input.view?.viewer ?? 'P0';
      inputs.forEach((el, index) => {
        (el as unknown as { value: string }).value = o.guessValue?.(seat, index) ?? String(10 + index);
        el.fire('input');
      });
      click(byId(h, 'guess-submit'));
      what = 'guess';
    } else if (cont !== null && input.view?.phase !== 'ENDED') {
      click(cont);
      what = 'reveal';
    } else if (input.view !== null && input.view.phase === 'PLACEMENT' && input.view.turn === input.view.viewer && byClass(h, 'hand-card').length > 0) {
      click(byClass(h, 'board-cell').find((e) => hasClass(e, 'is-legal')));
      click(byClass(h, 'hand-card')[0]);
      click(byClass(h, 'placement-button--confirm')[0]);
      what = 'place';
    } else if (h.queue.step()) {
      what = 'ai';
    } else {
      throw new Error(`drive: stuck at step ${i} (screen ${input.model.screen})`);
    }
    o.onStep?.(h, what);
  }
  throw new Error('drive: step budget exhausted');
}

const atEnd = (h: Harness): boolean => h.input().model.screen === 'END' && byClass(h, 'end-ranking').length > 0;
const hasGuessForm = (h: Harness): boolean => byClass(h, 'guess-input').length > 0;
const hasGate = (h: Harness): boolean => byClass(h, 'privacy-gate').length > 0;

// ---------------------------------------------------------------------------------------------------------
// One human: setup, full game, banner, Seed, end screen
// ---------------------------------------------------------------------------------------------------------

describe('one human seat: setup to final ranking through the host DOM', () => {
  it('mounts the setup screen with the random seed text, one banner, no game chrome', () => {
    const h = boot();
    expect(h.root.children.map((c) => c.getAttribute('class'))).toEqual(['game-host']);
    expect(byId(h, 'setup-start')).not.toBeNull();
    expect((byId(h, 'setup-seed') as unknown as { value: string }).value).toBe('4242');
    expect(bannerCount(h)).toBe(1);
    expect(text(byClass(h, 'banner')[0])).toContain('provisional scoring');
    expect(byId(h, 'game-abandon-open')?.hasAttribute('hidden')).toBe(true);
    expect(byId(h, 'game-help-open')?.hasAttribute('hidden')).toBe(false);
    expect(byClass(h, 'game-seed')[0]?.hasAttribute('hidden')).toBe(true);
    expect(byClass(h, 'scoreboard').length, 'scoreboard').toBe(0);
  });

  it('plays a whole game: start, place, AI turns, guess form only after the AI seats submitted, reveal, ranking', () => {
    const h = boot();
    (byId(h, 'setup-seed') as unknown as { value: string }).value = '12345';
    click(byId(h, 'setup-start'));
    expect(h.input().model.screen).toBe('GAME');
    expect(byId(h, 'setup-start')).toBeNull(); // the setup handle is gone
    const seed = h.input().seed;
    expect(seed).toBe(12345);
    let guessForms = 0;
    let sawWait = false;
    let reveals = 0;
    drive(h, atEnd, {
      onStep: (hh) => {
        expect(bannerCount(hh), 'exactly one banner').toBe(1);
        expect(text(byClass(hh, 'game-seed')[0])).toBe(`Seed: ${String(seed)}`);
        expect(byClass(hh, 'scoreboard').length, 'scoreboard').toBe(1);
        const view = hh.input().view;
        if (view?.phase === 'GUESS_COLLECT') {
          const aiDone = view.rules.seats.every((s) => s.kind !== 'AI' || view.guessSubmitted[s.id]);
          if (!aiDone) {
            sawWait = true;
            expect(hasGuessForm(hh)).toBe(false); // no form while an AI submission could still stale it
            expect(text(byClass(hh, 'game-status')[0])).toContain('AI players are submitting');
          } else if (byClass(hh, 'guess-entry').length > 0) {
            guessForms = Math.max(guessForms, 1);
          }
        }
        if (byClass(hh, 'reveal').length > 0) reveals++;
        if (view !== null && view.phase === 'PLACEMENT' && view.turn !== view.viewer) {
          expect(text(byClass(hh, 'placement-status')[0])).toContain('is playing'); // the panel's own status
        }
      },
    });
    expect(sawWait).toBe(true);
    expect(guessForms).toBe(1);
    expect(reveals).toBeGreaterThan(0);
    const rows = elementsOf(byClass(h, 'end-ranking')[0] as FakeEl).filter((e) => e.tagName === 'tr' && e.hasAttribute('data-seat'));
    expect(rows.length, 'ranking rows').toBe(4);
    expect(byClass(h, 'placement-panel').length, 'placement-panel').toBe(0);
    expect(byId(h, 'game-abandon-open')?.hasAttribute('hidden')).toBe(true); // a finished game has nothing to abandon
    expect(text(byClass(h, 'game-live')[0])).toBe('The game is over.');

    // replay same seed, then rematch with the controller's next seed
    click(byId(h, 'end-replay'));
    expect(h.input().model.screen).toBe('GAME');
    expect(h.input().seed).toBe(12345);
    expect(text(byClass(h, 'game-seed')[0])).toBe('Seed: 12345');
    expect(byClass(h, 'end').length, 'end').toBe(0);
    click(byId(h, 'game-abandon-open'));
    click(byId(h, 'abandon-confirm'));
    expect(h.input().model.screen).toBe('SETUP');
    expect(byId(h, 'setup-start')).not.toBeNull();
    expect(bannerCount(h)).toBe(1);
  });

  it('shows the same Seed as the controller and uses the new seed after a rematch', () => {
    const h = boot();
    click(byId(h, 'setup-start'));
    drive(h, atEnd);
    click(byId(h, 'end-rematch'));
    expect(h.input().seed).toBe(777);
    expect(text(byClass(h, 'game-seed')[0])).toBe('Seed: 777');
  });

  it('keeps the typed Guess, its element and its focus through re-renders and a language switch', () => {
    const h = boot();
    click(byId(h, 'setup-start'));
    drive(h, hasGuessForm);
    const input = byClass(h, 'guess-input')[0] as FakeEl;
    const id = input.getAttribute('id') as string;
    (input as unknown as { value: string }).value = '37';
    input.focus();
    const region = byClass(h, 'board-cell').filter((c) => hasClass(c, 'is-focused-region'));
    expect(region.length).toBe(4); // the focused code's 2x2 region is marked on the Board

    for (const lang of ['ko', 'en', 'ko'] as const) {
      h.ctl.setLanguage(lang);
      expect(h.doc.getElementById(id)).toBe(input); // the same element, not a rebuilt one
      expect((input as unknown as { value: string }).value).toBe('37');
      expect(h.doc.activeElement).toBe(input);
      expect(byClass(h, 'board-cell').filter((c) => hasClass(c, 'is-focused-region')).length).toBe(4);
    }
    expect(text(byId(h, 'guess-submit'))).toBe('예측값 제출');
    expect(text(byId(h, 'game-help-open'))).toBe('규칙과 도움말');
    expect(text(byClass(h, 'game-seed')[0])).toMatch(/^시드: \d+$/);
    expect(bannerCount(h)).toBe(1);
    expect(text(byClass(h, 'banner')[0])).toContain('임시 점수 규칙');
  });

  it('keeps the typed Guess when Help opens, makes the region inert, closes on Escape and restores the focus', () => {
    const h = boot();
    click(byId(h, 'setup-start'));
    drive(h, hasGuessForm);
    const input = byClass(h, 'guess-input')[0] as FakeEl;
    (input as unknown as { value: string }).value = '41';
    const opener = byId(h, 'game-help-open') as FakeEl;
    opener.focus();
    click(opener);
    expect(byClass(h, 'help').length, 'help').toBe(1);
    const region = byClass(h, 'game-main')[0] as FakeEl;
    expect(region.hasAttribute('inert')).toBe(true);
    expect(region.getAttribute('aria-hidden')).toBe('true');
    expect(byClass(h, 'guess-input')[0]).toBe(input);
    expect((input as unknown as { value: string }).value).toBe('41');
    h.doc.dispatch('keydown', { key: 'Escape' });
    expect(byClass(h, 'help').length, 'help').toBe(0);
    expect(region.hasAttribute('inert')).toBe(false);
    expect(region.hasAttribute('aria-hidden')).toBe(false);
    expect(h.doc.activeElement).toBe(opener);
    expect((input as unknown as { value: string }).value).toBe('41');
    // the typed text still submits
    click(byId(h, 'guess-submit'));
    expect(byClass(h, 'guess-input').length, 'guess-input').toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------------------------------------

describe('overlays', () => {
  it('opens Help from the setup screen and closes it with the Close button; focus returns to the opener', () => {
    const h = boot();
    const opener = byId(h, 'game-help-open') as FakeEl;
    opener.focus();
    click(opener);
    expect(byClass(h, 'help').length, 'help').toBe(1);
    expect(byClass(h, 'game-main')[0]?.hasAttribute('inert')).toBe(true);
    click(byClass(h, 'help-close')[0]);
    expect(byClass(h, 'help').length, 'help').toBe(0);
    expect(h.doc.activeElement).toBe(opener);
    expect(byClass(h, 'game-main')[0]?.hasAttribute('inert')).toBe(false);
  });

  it('offers Abandon only for an active game: cancel keeps the game, confirm returns to setup, and it works again in the next game', () => {
    const h = boot();
    const abandon = byId(h, 'game-abandon-open') as FakeEl;
    expect(abandon.hasAttribute('hidden')).toBe(true);
    h.ctl.startFromSetup(options(1));
    expect(abandon.hasAttribute('hidden')).toBe(false);
    click(abandon);
    expect(byClass(h, 'abandon-confirm').length, 'abandon-confirm').toBe(1);
    click(byId(h, 'abandon-cancel'));
    expect(byClass(h, 'abandon-confirm').length, 'abandon-confirm').toBe(0);
    expect(h.ctl.getModel().screen).toBe('GAME');
    click(abandon);
    click(byId(h, 'abandon-confirm'));
    expect(h.ctl.getModel().screen).toBe('SETUP');
    expect(byClass(h, 'abandon-confirm').length, 'abandon-confirm').toBe(0);
    expect(byClass(h, 'game-main')[0]?.hasAttribute('inert')).toBe(false);
    expect(abandon.hasAttribute('hidden')).toBe(true);
    // a second game: the finished dialog handle was replaced, so the confirmation opens again
    h.ctl.startFromSetup(options(1));
    click(abandon);
    expect(byClass(h, 'abandon-confirm').length, 'abandon-confirm').toBe(1);
  });

  it('opens Help from the final screen and from the game screen', () => {
    const h = boot();
    h.ctl.startFromSetup(options(1));
    click(byId(h, 'game-help-open'));
    expect(byClass(h, 'help').length, 'help').toBe(1);
    h.doc.dispatch('keydown', { key: 'Escape' });
    drive(h, atEnd);
    click(byId(h, 'game-help-open'));
    expect(byClass(h, 'help').length, 'help').toBe(1);
    h.doc.dispatch('keydown', { key: 'Escape' });
    expect(byClass(h, 'help').length, 'help').toBe(0);
  });

  it('keeps the draft while Help is open and does not let Escape in the dialog cancel it', () => {
    const h = boot();
    h.ctl.startFromSetup(options(1));
    click(byClass(h, 'board-cell').find((e) => hasClass(e, 'is-legal')));
    expect(h.ctl.getModel().draft.target).not.toBeNull();
    click(byId(h, 'game-help-open'));
    h.doc.dispatch('keydown', { key: 'Escape' });
    expect(byClass(h, 'help').length, 'help').toBe(0);
    expect(h.ctl.getModel().draft.target).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------
// Two and four humans: gate order, privacy scans, AI turns, reveal, end
// ---------------------------------------------------------------------------------------------------------

function patchGateOrder(h: Harness): { readonly restore: () => void; readonly attaches: () => number; readonly violations: string[] } {
  const original = FakeEl.prototype.appendChild;
  const violations: string[] = [];
  let attaches = 0;
  const attached = (el: FakeEl): boolean => {
    for (let e: FakeEl | null = el; e !== null; e = e.parentNode) if (e === h.doc.body) return true;
    return false;
  };
  const gatePresent = (): boolean => all(h).some((e) => hasClass(e, 'privacy-gate'));
  FakeEl.prototype.appendChild = function patched(this: FakeEl, child: FakeEl): FakeEl {
    const result = original.call(this, child);
    if (attached(this)) {
      if (hasClass(child, 'privacy-gate')) {
        attaches++;
        for (const node of privateNodes(h)) violations.push(`private node ${node.getAttribute('class') ?? ''} present when the gate was inserted`);
      } else if (PRIVATE_CLASSES.some((c) => hasClass(child, c)) && gatePresent()) {
        violations.push(`private node ${child.getAttribute('class') ?? ''} added while a gate is mounted`);
      }
    }
    return result;
  };
  return {
    restore: () => {
      FakeEl.prototype.appendChild = original;
    },
    attaches: () => attaches,
    violations,
  };
}

function playMultiHuman(humans: 2 | 4, seedText: string): { h: Harness; gates: number; typed: string[]; aiTurnsChecked: number; reveals: number } {
  const h = boot();
  const spy = patchGateOrder(h);
  const typed: string[] = [];
  let gates = 0;
  let aiTurnsChecked = 0;
  let reveals = 0;
  try {
    expect(h.ctl.startFromSetup(options(humans, seedText))).toEqual({ ok: true });
    drive(h, atEnd, {
      guessValue: (seat, index) => {
        const value = String(40 + SEATS.indexOf(seat) * 3 + index); // a different value per seat and code
        typed.push(value);
        return value;
      },
      onStep: (hh, what) => {
        const input = hh.input();
        expect(bannerCount(hh), `banner after ${what}`).toBe(1);
        assertNoForeignCards(hh, `after ${what}`);
        if (hasGate(hh)) {
          gates++;
          expect(input.model.gate, 'a gate DOM exists only while the model has one').not.toBeNull();
          expect(byClass(hh, 'scoreboard').length, 'scoreboard').toBe(0); // nothing else is drawn
          expect(byClass(hh, 'game-seed')[0]?.hasAttribute('hidden')).toBe(true);
          expect(byId(hh, 'game-help-open')?.hasAttribute('hidden')).toBe(true);
          const dom = serialize(hh.root);
          for (const value of typed) expect(dom, `Guess ${value} typed by an earlier seat`).not.toMatch(new RegExp(`value="${value}"`));
          expect(byClass(hh, 'reveal-sum').length, 'reveal-sum').toBe(0);
        } else {
          expect(input.model.gate).toBeNull();
        }
        if (input.view === null && input.model.gate === null && input.publicView !== null && input.publicView.phase === 'PLACEMENT') {
          aiTurnsChecked++; // an AI Seat acts: read-only public Board, status text, no Hand, no legal marks
          expect(byClass(hh, 'hand-card').length, 'hand-card').toBe(0);
          expect(byClass(hh, 'board-cell').filter((e) => hasClass(e, 'is-legal')).length, JSON.stringify([input.publicView.turn, input.publicView.viewer])).toBe(0);
          expect(text(byClass(hh, 'game-status')[0])).toContain('is thinking');
        }
        if (byClass(hh, 'reveal').length > 0) {
          reveals++;
          expect(hasGate(hh)).toBe(false); // the reveal is public: no gate
          expect(byClass(hh, 'hand-card').length, 'hand-card').toBe(0);
          expect(byClass(hh, 'guess-input').length, 'guess-input').toBe(0);
        }
      },
    });
    expect(spy.violations).toEqual([]);
    expect(spy.attaches()).toBeGreaterThan(0);
  } finally {
    spy.restore();
  }
  return { h, gates, typed, aiTurnsChecked, reveals };
}

describe('two human seats and two AI seats', () => {
  it('plays to the end behind gates; no private DOM exists while a gate is mounted and it goes before the gate', () => {
    const r = playMultiHuman(2, '5');
    expect(r.gates).toBeGreaterThan(0);
    expect(r.typed.length).toBeGreaterThan(0);
    expect(r.reveals).toBeGreaterThan(0);
    expect(r.aiTurnsChecked).toBeGreaterThan(0);
    const rows = elementsOf(byClass(r.h, 'end-ranking')[0] as FakeEl).filter((e) => e.tagName === 'tr' && e.hasAttribute('data-seat'));
    expect(rows.length, 'ranking rows').toBe(4);
    expect(leaks(r.h, 'P0')).toEqual([]);
  });

  it('shows the viewer its own cards (positive control for the scan) and nobody else\'s', () => {
    const h = boot();
    h.ctl.startFromSetup(options(2, '5'));
    expect(leaks(h, 'P0').length).toBeGreaterThan(0); // the scan does find P0's own Hand while P0 is the viewer
    expect(leaks(h, 'P1')).toEqual([]);
    expect(leaks(h, 'P2')).toEqual([]);
    expect(leaks(h, 'P3')).toEqual([]);
  });

  it('keeps Help closed over a gate and closes an open overlay when a gate arrives', () => {
    const h = boot();
    h.ctl.startFromSetup(options(2, '5'));
    click(byId(h, 'game-help-open'));
    expect(byClass(h, 'help').length, 'help').toBe(1);
    click(byClass(h, 'board-cell').find((e) => hasClass(e, 'is-legal')));
    click(byClass(h, 'hand-card')[0]);
    click(byClass(h, 'placement-button--confirm')[0]); // P0 places: P1 is next, behind a gate
    expect(hasGate(h)).toBe(true);
    expect(byClass(h, 'help').length, 'help').toBe(0);
    expect(byClass(h, 'game-main')[0]?.hasAttribute('inert')).toBe(false);
    expect(byId(h, 'game-help-open')?.hasAttribute('hidden')).toBe(true);
    click(byId(h, 'game-help-open')); // a stale click on the hidden opener does nothing
    expect(byClass(h, 'help').length, 'help').toBe(0);
    expect(byId(h, 'game-abandon-open')?.hasAttribute('hidden')).toBe(true);
    expect(text(byClass(h, 'game-live')[0])).toContain('Pass the device to');
    click(byId(h, 'privacy-gate-ack'));
    expect(hasGate(h)).toBe(false);
    expect(h.input().view?.viewer).toBe('P1');
    expect(byClass(h, 'hand-card').length).toBeGreaterThan(0);
  });

  it('re-binds the gate acknowledgement to the actionCount of the CURRENT render', () => {
    const h = boot();
    h.ctl.startFromSetup(options(2, '5'));
    click(byClass(h, 'board-cell').find((e) => hasClass(e, 'is-legal')));
    click(byClass(h, 'hand-card')[0]);
    click(byClass(h, 'placement-button--confirm')[0]);
    const gateEl = byClass(h, 'privacy-gate')[0] as FakeEl;
    const base = h.input();
    const acks: unknown[] = [];
    const handlers: RenderHandlers = {
      ...base.handlers,
      acknowledgeGate: (ack) => {
        acks.push(ack);
        return base.handlers.acknowledgeGate(ack);
      },
    };
    // The same gate, rendered again with a larger actionCount (an AI Seat submitted while the gate was open).
    h.host.render({ ...base, handlers, model: { ...base.model, actionCount: base.model.actionCount + 1 } });
    expect(byClass(h, 'privacy-gate')[0]).toBe(gateEl); // updated in place, not recreated
    click(byId(h, 'privacy-gate-ack'));
    expect(acks).toEqual([{ forSeat: base.model.gate?.forSeat, purpose: base.model.gate?.purpose, actionCount: base.model.actionCount + 1 }]);
    // The controller refused it (its count is the old one): the gate is shown again, never a private view.
    expect(hasGate(h)).toBe(true);
    expect(names(privateNodes(h).filter((e) => hasClass(e, 'hand-card')))).toEqual([]);
    // With the true binding (the next render of the controller) the acknowledgement works.
    h.host.render(h.input());
    click(byId(h, 'privacy-gate-ack'));
    expect(hasGate(h)).toBe(false);
  });
});

describe('four human seats', () => {
  it('plays to the end behind gates with no foreign cards, no previous Guesses and no hidden private DOM', () => {
    const r = playMultiHuman(4, '9');
    expect(r.gates).toBeGreaterThan(0);
    expect(r.reveals).toBeGreaterThan(0);
    const rows = elementsOf(byClass(r.h, 'end-ranking')[0] as FakeEl).filter((e) => e.tagName === 'tr' && e.hasAttribute('data-seat'));
    expect(rows.length, 'ranking rows').toBe(4);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Strings, disposal, source scan
// ---------------------------------------------------------------------------------------------------------

describe('disposal', () => {
  it('removes the host, ignores later renders and stays inert', () => {
    const h = boot();
    h.ctl.startFromSetup(options(1));
    const helpButton = byId(h, 'game-help-open') as FakeEl;
    const confirmBefore = asFake(byClass(h, 'placement-panel')[0] as unknown as HTMLElement);
    expect(confirmBefore).toBeDefined();
    h.host.dispose();
    expect(h.root.children.length).toBe(0);
    expect(h.doc.listenerCount()).toBe(0);
    const renders = h.renders.length;
    h.ctl.setLanguage('ko'); // the controller renders into a disposed host
    expect(h.renders.length).toBe(renders + 1);
    expect(h.root.children.length).toBe(0);
    click(helpButton); // a stale opener does nothing
    expect(all(h).length).toBe(1); // only the test's own root element is left
    h.host.dispose(); // idempotent
    h.host.render(h.input());
    expect(h.root.children.length).toBe(0);
  });
});

describe('source of screens/game.ts and strings/game.ts', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const files = [join(dir, 'game.ts'), join(dir, '..', '..', 'i18n', 'strings', 'game.ts'), join(dir, '..', 'main.ts')];
  const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  it('uses no console, storage, global, clock, randomness, timer or HTML parsing', () => {
    const forbidden =
      /\bconsole\b|\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bglobalThis\b|\bwindow\b|\bMath\s*\.\s*random\b|\bDate\b|\bperformance\b|\binnerHTML\b|\bouterHTML\b|\binsertAdjacentHTML\b|\bfetch\s*\(/;
    for (const file of files.slice(0, 2)) expect(strip(readFileSync(file, 'utf8')), file).not.toMatch(forbidden);
    expect(strip(readFileSync(files[0] as string, 'utf8'))).not.toMatch(/\bsetTimeout\b|\bnavigator\b|\bcrypto\b|\bdocument\b/);
  });
  it('keeps timers, navigator and crypto in main.ts only, which holds no logic beyond composition', () => {
    const main = strip(readFileSync(files[2] as string, 'utf8'));
    expect(main).toMatch(/setTimeout/);
    expect(main).toMatch(/navigator\.languages/);
    expect(main).toMatch(/crypto\.getRandomValues/);
    expect(main).not.toMatch(/\bfor\s*\(|\bwhile\s*\(|\bswitch\s*\(/);
  });
});

describe('index.html and layout.css', () => {
  const ui = join(dirname(fileURLToPath(import.meta.url)), '..');
  it('links shell.css, then tokens, card, board, hand, placement, setup, reveal, end, overlay and layout in this order', () => {
    const html = readFileSync(join(ui, 'index.html'), 'utf8');
    const links = [...html.matchAll(/<link rel="stylesheet" href="\.\/([^"]+)"/g)].map((m) => m[1]);
    expect(links).toEqual([
      'shell.css',
      ...['tokens', 'card', 'board', 'hand', 'placement', 'setup', 'reveal', 'end', 'overlay', 'layout'].map((n) => `styles/${n}.css`),
    ]);
    expect(html).not.toMatch(/shell__banner|shell__notice/);
  });
  it('keeps touch-action off everything but the draggable Hand card, and uses no hover rule, network or font reference', () => {
    const css = readFileSync(join(ui, 'styles', 'layout.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/touch-action/);
    expect(css).not.toMatch(/:hover/);
    expect(css).not.toMatch(/url\(|@import|https?:|@font-face/);
    expect(css).toMatch(/orientation:\s*landscape\)\s*and\s*\(min-width:\s*600px\)/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    for (const control of ['.game-bar__button', '.guess-input', '.guess-submit', '.privacy-gate-ack']) {
      const rule = new RegExp(`${control.replace('.', '\\.')}\\s*\\{[^}]*min-block-size:\\s*var\\(--touch-min\\)`);
      expect(css, control).toMatch(rule);
    }
  });
});
