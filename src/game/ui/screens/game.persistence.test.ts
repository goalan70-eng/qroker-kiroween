// Persistence in the composition host (task 20.4, stage B: resume prompt, notices region, setup prefs).
//
// EVIDENCE CLASS 2: the host against the hand-written fake Document of ui/testing/fake-dom.ts with the REAL controller, real
// engine games, `memoryStore` behind a wrapper (configurable `durable`, failing writes or reads) and a fixed `nowIso`. It is
// NOT a browser: no layout, no real focus, no real reload. The real-browser checks are the throwaway smoke of
// docs/game/ui-progress.md and, later, e2e/persistence.spec.ts (stage C).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { getStrategy } from '../../ai/registry';
import { ALL_CARDS } from '../../core/cards';
import { replay } from '../../core/replay';
import { RULES_VERSION } from '../../core/score';
import { defaultConfig } from '../../core/state';
import { SEATS } from '../../core/turn';
import type { Action, Difficulty, GameConfig, PlayerId } from '../../core/types';
import { viewFor } from '../../core/view';
import type { PlayerView } from '../../core/view';
import { resetLanguage, setLanguage } from '../../i18n';
import type { Lang } from '../../i18n';
import { parseSave, SAVE_FORMAT, SAVE_VERSION, serializeSave } from '../../persistence/save-format';
import type { SaveEnvelope } from '../../persistence/save-format';
import { memoryStore, PREFS_KEY, readPrefs, SAVE_KEY, writePrefs } from '../../persistence/storage';
import type { KeyValueStore } from '../../persistence/storage';
import { playGame, strategiesFor } from '../../sim/play-game';
import { createController, mountApp } from '../controller';
import type { Controller, RenderInput, Schedule } from '../controller';
import { DEFAULT_SETUP_PREFS } from '../setup-model';
import type { SetupPrefs } from '../setup-model';
import { asFake, classesOf, FakeDocument, FakeEl } from '../testing/fake-dom';
import { passGate } from '../testing/pass-gate';
import { createGameScreen } from './game';
import type { GameScreen, GameScreenDocument } from './game';

afterEach(() => resetLanguage());

const NOW = '2026-01-01T00:00:00.000Z';
const nowIso = (): string => NOW;
/** Eight-digit seeds, so they cannot appear in any other text by chance. These ones were checked to reach a reveal with the BEGINNER human driver. */
const SEED = { ONE: 10000001, TWO: 77, FOUR: 51629384, ENDED: 20468137 };

// ---------------------------------------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------------------------------------

class Queue {
  readonly tasks: (() => void)[] = [];
  readonly schedule: Schedule = (fn) => {
    this.tasks.push(fn);
    return { cancel: () => void this.tasks.splice(this.tasks.indexOf(fn) >>> 0, this.tasks.indexOf(fn) >= 0 ? 1 : 0) };
  };
  get pending(): number {
    return this.tasks.length;
  }
  step(): void {
    this.tasks.shift()?.();
  }
}

interface StoreOptions {
  readonly init?: Record<string, string>;
  /** `'absent'`: the store has no `durable` member at all. */
  readonly durable?: boolean | 'absent';
  readonly failSave?: boolean;
  readonly failRead?: boolean;
  /** getItem(SAVE_KEY) returns this value (not a string) instead of the stored text. */
  readonly weirdSave?: unknown;
}

interface Flags {
  failSave: boolean;
  failRead: boolean;
}

function makeStore(o: StoreOptions): { readonly inner: KeyValueStore; readonly store: KeyValueStore; readonly flags: Flags } {
  const inner = memoryStore(o.init);
  const flags: Flags = { failSave: o.failSave === true, failRead: o.failRead === true };
  const base: KeyValueStore = {
    getItem: (k) => {
      if (flags.failRead && k === SAVE_KEY) throw new Error('read failed');
      if (o.weirdSave !== undefined && k === SAVE_KEY) return o.weirdSave as string;
      return inner.getItem(k);
    },
    setItem: (k, v) => {
      if (flags.failSave && k === SAVE_KEY) throw new Error('quota');
      inner.setItem(k, v);
    },
    removeItem: (k) => inner.removeItem(k),
  };
  return { inner, flags, store: o.durable === 'absent' ? base : { ...base, durable: o.durable ?? false } };
}

interface Harness {
  readonly doc: FakeDocument;
  readonly root: FakeEl;
  readonly host: GameScreen;
  readonly ctl: Controller;
  readonly queue: Queue;
  readonly renders: RenderInput[];
  readonly inner: KeyValueStore;
  readonly flags: Flags;
  readonly seedCalls: { n: number };
  input(): RenderInput;
}

interface BootOptions extends StoreOptions {
  readonly language?: Lang;
}

function boot(o: BootOptions = {}): Harness {
  setLanguage(o.language ?? 'en');
  const doc = new FakeDocument();
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const queue = new Queue();
  const renders: RenderInput[] = [];
  const seedCalls = { n: 0 };
  const { inner, store, flags } = makeStore(o);
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
    randomSeed: () => {
      seedCalls.n++;
      return 777;
    },
    language: () => o.language ?? 'en',
    store,
    nowIso,
  });
  return { doc, root, host, ctl, queue, renders, inner, flags, seedCalls, input: () => renders[renders.length - 1] as RenderInput };
}

const all = (h: Harness): FakeEl[] => h.doc.all();
const hasClass = (e: FakeEl, c: string): boolean => classesOf(e).includes(c);
const byClass = (h: Harness, c: string): FakeEl[] => all(h).filter((e) => hasClass(e, c));
const byId = (h: Harness, id: string): FakeEl | null => h.doc.getElementById(id);
const text = (e: FakeEl | undefined | null): string => e?.textContent ?? '';
const click = (e: FakeEl | null | undefined): void => void (e as FakeEl).fire('click');
const checked = (e: FakeEl | null): boolean => (e as unknown as { checked: boolean }).checked;

function serialize(el: FakeEl): string {
  if (el.tagName === '#text') return el.textContent;
  const attrs = [...el.attributes].map(([k, v]) => `${k}="${v}"`).join(' ');
  const value: unknown = (el as unknown as { value?: unknown }).value;
  const v = typeof value === 'string' && value !== '' ? ` value="${value}"` : '';
  return `<${el.tagName} ${attrs}${v}>${el.children.length > 0 ? el.children.map(serialize).join('') : el.textContent}</${el.tagName}>`;
}
const dom = (h: Harness): string => serialize(h.root);

// ---------------------------------------------------------------------------------------------------------
// Real games without a DOM: produce saved texts and drive a controller
// ---------------------------------------------------------------------------------------------------------

function configFor(humans: 1 | 2 | 4): GameConfig {
  const seats = SEATS.map((id, i) =>
    i < humans ? { id, kind: 'HUMAN', name: `Human ${i}` } : { id, kind: 'AI', difficulty: 'BEGINNER' as Difficulty, name: `AI ${i}` },
  ) as unknown as GameConfig['seats'];
  return { ...defaultConfig(), seats };
}

const GUESS_OF: Readonly<Record<PlayerId, number>> = { P0: 21, P1: 25, P2: 29, P3: 33 };

function humanAction(view: PlayerView): Action | null {
  const ctx = { decisionSeed: view.board.filter((c) => c !== null).length + view.history.length * 1000 };
  if (view.phase === 'PLACEMENT' && view.turn === view.viewer) return getStrategy('BEGINNER').choosePlacement(view, ctx);
  if (view.phase === 'GUESS_COLLECT' && !view.guessSubmitted[view.viewer]) {
    return { type: 'SUBMIT_GUESSES', player: view.viewer, guesses: Object.fromEntries(view.pendingQuadKeys.map((k) => [k, GUESS_OF[view.viewer]])) };
  }
  if (view.phase === 'REVEAL') return { type: 'ACK_REVEAL' };
  return null;
}

/** One unit of progress through the controller only: an AI step, a gate acknowledgement, or one human Action. */
function advance(ctl: Controller, queue: Queue): boolean {
  const model = ctl.getModel();
  if (model.screen !== 'GAME') return false;
  if (queue.pending > 0) queue.step();
  else if (model.gate !== null) expect(passGate(ctl)).toBe(true);
  else {
    const action = model.viewer === null ? ({ type: 'ACK_REVEAL' } as Action) : humanAction(ctl.getView(model.viewer) as PlayerView);
    if (action === null) throw new Error('stuck');
    expect(ctl.dispatchHuman(action)).toEqual({ ok: true });
  }
  return true;
}

const publicView = (ctl: Controller): PlayerView => ctl.getView('P0') as PlayerView;

/** The real stored text of a game stopped by `until`. */
function savedText(humans: 1 | 2 | 4, seed: number, until: (ctl: Controller) => boolean): string {
  const inner = memoryStore();
  const queue = new Queue();
  const ctl = createController({ schedule: queue.schedule, renderer: () => undefined, randomSeed: () => 1, language: () => 'en', store: inner, nowIso });
  ctl.startGame({ config: configFor(humans), seed });
  for (let i = 0; i < 3000 && !until(ctl); i++) expect(advance(ctl, queue)).toBe(true);
  expect(until(ctl)).toBe(true);
  return inner.getItem(SAVE_KEY) as string;
}

const placementOfP0 = (ctl: Controller): boolean => {
  const v = publicView(ctl);
  return v.phase === 'PLACEMENT' && v.turn === 'P0' && ctl.getModel().actionCount >= 4;
};
const placementAny = (ctl: Controller): boolean => publicView(ctl).phase === 'PLACEMENT' && ctl.getModel().actionCount >= 2;
const guessPartial = (ctl: Controller): boolean => {
  const v = publicView(ctl);
  return v.phase === 'GUESS_COLLECT' && v.guessSubmitted.P0 === true && v.guessSubmitted.P1 !== true;
};
const atReveal = (ctl: Controller): boolean => publicView(ctl).phase === 'REVEAL';

const cache = new Map<string, string>();
function cached(key: string, make: () => string): string {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const made = make();
  cache.set(key, made);
  return made;
}
const SAVES = {
  placement1: () => cached('p1', () => savedText(1, SEED.ONE, placementOfP0)),
  reveal1: () => cached('r1', () => savedText(1, SEED.ONE, atReveal)),
  guess2: () => cached('g2', () => savedText(2, SEED.TWO, guessPartial)),
  placement4: () => cached('p4', () => savedText(4, SEED.FOUR, placementAny)),
};

function envelopeOf(text: string): SaveEnvelope {
  const parsed = parseSave(text);
  if (parsed.kind !== 'OK') throw new Error(`not a valid save: ${parsed.kind}`);
  return parsed.envelope;
}

// ---------------------------------------------------------------------------------------------------------
// Privacy scans of the serialized DOM
// ---------------------------------------------------------------------------------------------------------

/** What must not be in the page unless the player is allowed to see it: cards, Guess values, Seed, stored text. */
function scan(h: Harness, stored: string, opts: { readonly savedTime: 'allowed' | 'forbidden' }): string[] {
  const env = envelopeOf(stored);
  const html = dom(h);
  const visible = h.root.textContent;
  const found: string[] = [];
  for (const card of ALL_CARDS) if (html.includes(card)) found.push(`card ${card}`);
  if (/[♥♦♣♠]/.test(visible)) found.push('suit glyph');
  if (/<input/.test(html)) found.push('input element');
  for (const c of ['hand', 'hand-card', 'board', 'board-frame', 'board-cell', 'guess-form', 'guess-input', 'guess-entry', 'placement-panel']) {
    if (byClass(h, c).length > 0) found.push(`class ${c}`);
  }
  if (html.includes(String(env.seed))) found.push('seed');
  const values = new Set<number>();
  for (const a of env.actions) if (a.type === 'SUBMIT_GUESSES') for (const v of Object.values(a.guesses)) values.add(v);
  for (const v of values) if (new RegExp(`(?<![\\w.:-])${v}(?![\\w.:-])`).test(html)) found.push(`guess value ${v}`);
  if (opts.savedTime === 'forbidden' && (html.includes('2026-01-01') || html.includes('00:00'))) found.push('saved time');
  // Any 16-character window of the stored text (the saved time left out) must be absent.
  const rest = stored.replace(env.savedAtIso, '');
  for (let i = 0; i + 16 <= rest.length; i++) {
    if (html.includes(rest.slice(i, i + 16))) {
      found.push(`stored text at ${i}`);
      break;
    }
  }
  return found;
}

const withSave = (text: string, extra: BootOptions = {}): BootOptions => ({ ...extra, init: { ...(extra.init ?? {}), [SAVE_KEY]: text } });

// ---------------------------------------------------------------------------------------------------------
// The resume prompt
// ---------------------------------------------------------------------------------------------------------

describe('resume prompt', () => {
  const phases: [string, () => string, number, string][] = [
    ['PLACEMENT, one human', SAVES.placement1, 1, 'PLACEMENT'],
    ['GUESS_COLLECT with a partial submission, two humans', SAVES.guess2, 2, 'GUESS_COLLECT'],
    ['REVEAL, one human', SAVES.reveal1, 1, 'REVEAL'],
    ['PLACEMENT, four humans', SAVES.placement4, 4, 'PLACEMENT'],
  ];
  for (const [label, make, humans, phase] of phases) {
    it(`${label}: the prompt replaces the setup screen and shows only the saved time and the number of human players`, () => {
      const stored = make();
      expect(phase).toBe(
        (() => {
          const r = replay(envelopeOf(stored).seed, envelopeOf(stored).config, envelopeOf(stored).actions);
          if (!r.ok) throw new Error('replay');
          return r.value.phase;
        })(),
      );
      const h = boot(withSave(stored));
      expect(h.input().model.resume).toEqual({ savedAtIso: NOW, humanSeats: humans });
      expect(byClass(h, 'resume')).toHaveLength(1);
      expect(byClass(h, 'setup'), 'no setup screen').toHaveLength(0);
      expect(byId(h, 'setup-start')).toBeNull();
      expect(text(byClass(h, 'resume')[0])).toContain('2026-01-01 00:00 UTC');
      expect(text(byClass(h, 'resume')[0])).toContain(`Human players: ${humans}`);
      expect(scan(h, stored, { savedTime: 'allowed' })).toEqual([]);
      expect(h.doc.activeElement).toBe(byId(h, 'resume-continue'));
      // nothing started, nothing written yet
      expect(h.seedCalls.n).toBe(0);
      expect(h.inner.getItem(SAVE_KEY)).toBe(stored);
    });
  }

  it('hides Help and Abandon over the prompt, and no overlay opens over it', () => {
    const h = boot(withSave(SAVES.placement1()));
    expect(byId(h, 'game-help-open')?.hasAttribute('hidden')).toBe(true);
    expect(byId(h, 'game-abandon-open')?.hasAttribute('hidden')).toBe(true);
    click(byId(h, 'game-help-open'));
    click(byId(h, 'game-abandon-open'));
    expect(byId(h, 'game-main')?.hasAttribute('inert')).toBe(false);
    expect(byClass(h, 'resume')).toHaveLength(1);
  });

  it('has no Seed line text and no live text while the prompt is shown', () => {
    const h = boot(withSave(SAVES.placement1()));
    expect(text(byClass(h, 'game-seed')[0])).toBe('');
    expect(text(byClass(h, 'game-live')[0])).toBe('');
  });
});

// ---------------------------------------------------------------------------------------------------------
// Continue
// ---------------------------------------------------------------------------------------------------------

describe('Continue', () => {
  it('one human: shows the board, the hand and the turn of the saved game, equal to the same game played live', () => {
    const stored = SAVES.placement1();
    const h = boot(withSave(stored));
    click(byId(h, 'resume-continue'));
    expect(h.input().model.screen).toBe('GAME');
    expect(h.input().model.resume).toBeNull();
    expect(byClass(h, 'resume')).toHaveLength(0);
    expect(h.input().seed).toBe(SEED.ONE);
    expect(h.seedCalls.n).toBe(0); // no new game was created
    const view = h.ctl.getView('P0') as PlayerView;
    expect(byClass(h, 'hand-card')).toHaveLength(view.myHand.length);
    expect(byClass(h, 'board-cell')).toHaveLength(64);
    expect(text(byClass(h, 'game-live')[0])).toContain('Turn: Human 0');
    expect(text(byClass(h, 'game-seed')[0])).toBe(`Seed: ${SEED.ONE}`);
    expect(byId(h, 'game-abandon-open')?.hasAttribute('hidden')).toBe(false);
    expect(byId(h, 'game-help-open')?.hasAttribute('hidden')).toBe(false);

    // The same game played live in a second host renders the same game region.
    const live = boot({ durable: true });
    live.ctl.startGame({ config: configFor(1), seed: SEED.ONE });
    for (let i = 0; i < 3000 && !placementOfP0(live.ctl); i++) advance(live.ctl, live.queue);
    expect(live.ctl.getModel().actionCount).toBe(h.ctl.getModel().actionCount);
    expect(serialize(byClass(live, 'game-layout')[0] as FakeEl)).toBe(serialize(byClass(h, 'game-layout')[0] as FakeEl));
  });

  it('one human at REVEAL: the reveal screen with its continue button', () => {
    const h = boot(withSave(SAVES.reveal1()));
    click(byId(h, 'resume-continue'));
    expect(h.input().model.screen).toBe('GAME');
    expect(byId(h, 'reveal-continue')).not.toBeNull();
    expect(byClass(h, 'resume')).toHaveLength(0);
  });

  it('two humans in a partial Guess batch: the gate for the next Seat comes first, nothing private before it', () => {
    const stored = SAVES.guess2();
    const h = boot(withSave(stored));
    click(byId(h, 'resume-continue'));
    const model = h.input().model;
    expect(model.gate).toEqual({ forSeat: 'P1', name: 'Human 1', purpose: 'GUESS' });
    expect(model.viewer).toBeNull();
    expect(h.input().view).toBeNull();
    const gate = byClass(h, 'privacy-gate');
    expect(gate).toHaveLength(1);
    expect(hasClass(gate[0] as FakeEl, 'privacy-gate--guess')).toBe(true);
    expect(text(gate[0])).toContain('Human 1 enters Guesses next');
    expect(scan(h, stored, { savedTime: 'forbidden' })).toEqual([]);
    expect(byId(h, 'game-help-open')?.hasAttribute('hidden')).toBe(true);
    expect(byId(h, 'game-abandon-open')?.hasAttribute('hidden')).toBe(true);
    expect(text(byClass(h, 'game-seed')[0])).toBe('');

    // After the acknowledgement the Guess form of the new Seat shows; the earlier Seat's submitted value is not in the page.
    click(byId(h, 'privacy-gate-ack'));
    expect(byClass(h, 'guess-input').length).toBeGreaterThan(0);
    expect(dom(h)).not.toMatch(/value="21"/);
    expect(text(h.root)).not.toMatch(/(?<![\w.:-])21(?![\w.:-])/);
  });

  it('four humans in placement: the gate for the turn Seat (hand purpose) comes first', () => {
    const stored = SAVES.placement4();
    const env = envelopeOf(stored);
    const r = replay(env.seed, env.config, env.actions);
    if (!r.ok) throw new Error('replay');
    const turn = r.value.turn;
    const h = boot(withSave(stored));
    click(byId(h, 'resume-continue'));
    expect(h.input().model.gate).toEqual({ forSeat: turn, name: `Human ${SEATS.indexOf(turn)}`, purpose: 'HAND' });
    expect(hasClass(byClass(h, 'privacy-gate')[0] as FakeEl, 'privacy-gate--hand')).toBe(true);
    expect(text(byClass(h, 'privacy-gate')[0])).toContain(`Human ${SEATS.indexOf(turn)}`);
    expect(scan(h, stored, { savedTime: 'forbidden' })).toEqual([]);
    click(byId(h, 'privacy-gate-ack'));
    expect(byClass(h, 'hand-card').length).toBeGreaterThan(0);
    expect(byClass(h, 'privacy-gate')).toHaveLength(0);
  });

  it('a second Continue, Continue after another start, and Continue after dispose do nothing harmful', () => {
    const stored = SAVES.placement1();
    const h = boot(withSave(stored));
    const button = byId(h, 'resume-continue') as FakeEl;
    click(button);
    const count = h.ctl.getModel().actionCount;
    const rendered = h.renders.length;
    click(button); // the detached button of the finished prompt
    expect(h.ctl.continueSaved()).toEqual({ ok: false, reason: 'NO_RESUME' });
    expect(h.ctl.getModel().actionCount).toBe(count);
    expect(h.renders.length).toBe(rendered);

    const other = boot(withSave(stored));
    const stale = byId(other, 'resume-continue') as FakeEl;
    other.ctl.startGame({ config: configFor(1), seed: 5 });
    expect(other.input().model.resume).toBeNull();
    expect(byClass(other, 'resume')).toHaveLength(0);
    click(stale);
    expect(other.ctl.getModel().actionCount).toBe(0);
    expect(other.input().seed).toBe(5);

    const gone = boot(withSave(stored));
    const old = byId(gone, 'resume-continue') as FakeEl;
    gone.host.dispose();
    click(old);
    expect(gone.ctl.getModel().resume).not.toBeNull(); // the disposed host's button reached nothing
    expect(gone.root.children).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Discard
// ---------------------------------------------------------------------------------------------------------

describe('Discard', () => {
  it('removes only the save, shows the setup screen, keeps the stored prefs and the language', () => {
    const prefsStore = memoryStore();
    const prefs: SetupPrefs = { humanCount: 3, difficulties: ['BEGINNER', 'ADVANCED', 'BEGINNER', 'ADVANCED'], identityVisibility: 'FACE_UP' };
    writePrefs(prefsStore, { language: 'ko', setup: prefs });
    const prefsText = prefsStore.getItem(PREFS_KEY) as string;
    const h = boot(withSave(SAVES.placement1(), { init: { [PREFS_KEY]: prefsText }, language: 'en' }));
    expect(text(byId(h, 'resume-continue'))).toBe('이어하기'); // the stored language wins at startup
    click(byId(h, 'resume-discard'));
    expect(h.input().model.resume).toBeNull();
    expect(h.inner.getItem(SAVE_KEY)).toBeNull();
    expect(h.inner.getItem(PREFS_KEY)).toBe(prefsText);
    expect(byClass(h, 'resume')).toHaveLength(0);
    expect(byId(h, 'setup-start')).not.toBeNull();
    expect(text(byId(h, 'setup-start'))).toBe(text(byId(h, 'setup-start'))); // present
    expect(h.input().model.language).toBe('ko');
    expect(checked(byId(h, 'setup-humans-3'))).toBe(true);
    expect(checked(byId(h, 'setup-visibility-FACE_UP'))).toBe(true);
    expect(h.doc.activeElement).toBe(byId(h, 'setup-seed')); // the focus did not fall to the page
    expect(h.ctl.discardSaved()).toEqual({ ok: false, reason: 'NO_RESUME' });
  });
});

// ---------------------------------------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------------------------------------

describe('notices after a discarded save', () => {
  const good = (): string => SAVES.placement1();
  const mutate = (f: (o: Record<string, unknown>) => void): string => {
    const o = JSON.parse(good()) as Record<string, unknown>;
    f(o);
    return JSON.stringify(o);
  };
  const ended = (): string => {
    const config = configFor(1);
    const g = playGame({ seed: SEED.ENDED, config, strategies: strategiesFor({ P0: 'BEGINNER', P1: 'BEGINNER', P2: 'BEGINNER', P3: 'BEGINNER' }) });
    const envelope: SaveEnvelope = { format: SAVE_FORMAT, saveVersion: SAVE_VERSION, rulesVersion: RULES_VERSION, savedAtIso: NOW, seed: SEED.ENDED, config, actions: g.log };
    return serializeSave(envelope);
  };
  const cases: [string, () => string][] = [
    ['CORRUPT', () => '{"secret":"H-10 guess 77 seed 48271936"'],
    ['SAVE_VERSION', () => mutate((o) => (o.saveVersion = 99))],
    ['RULES_VERSION', () => mutate((o) => (o.rulesVersion = 99))],
    [
      'REPLAY_REJECTED',
      () => serializeSave({ format: SAVE_FORMAT, saveVersion: SAVE_VERSION, rulesVersion: RULES_VERSION, savedAtIso: NOW, seed: 9, config: configFor(1), actions: [{ type: 'ACK_REVEAL' }] }),
    ],
    ['GAME_ENDED', ended],
  ];
  const seen = new Set<string>();
  for (const [reason, make] of cases) {
    it(`${reason}: a localized notice without detail, the setup screen, no Continue`, () => {
      const stored = make();
      const h = boot(withSave(stored, { durable: true }));
      const notices = byClass(h, 'notice');
      expect(h.input().model.notices).toEqual([{ kind: 'SAVE_DISCARDED', reason }]);
      expect(notices).toHaveLength(1);
      const shown = text(notices[0]);
      expect(shown, reason).toContain('The saved game cannot be continued');
      expect(shown, reason).not.toContain(reason);
      seen.add(shown);
      expect(byId(h, 'setup-start')).not.toBeNull();
      expect(byClass(h, 'resume')).toHaveLength(0);
      expect(byId(h, 'resume-continue')).toBeNull();
      // nothing of the stored text is in the page
      const html = dom(h);
      for (let i = 0; i + 16 <= stored.length; i += 3) expect(html.includes(stored.slice(i, i + 16)), `${reason} at ${i}: ${stored.slice(i, i + 16)}`).toBe(false);
      expect(html).not.toContain(String(SEED.ONE));
      for (const card of ALL_CARDS) expect(html.includes(card), card).toBe(false);
      // Korean
      h.ctl.setLanguage('ko');
      expect(text(byClass(h, 'notice')[0])).toContain('저장된 게임을 이어서 할 수 없');
    });
  }
  it('INVALID_VALUE (a stored value that is not text): a localized notice without detail and the setup screen', () => {
    const h = boot({ weirdSave: 12345, durable: true });
    expect(h.input().model.notices).toEqual([{ kind: 'SAVE_DISCARDED', reason: 'INVALID_VALUE' }]);
    const shown = text(byClass(h, 'notice')[0]);
    expect(shown).toContain('The saved game cannot be continued');
    expect(shown).not.toMatch(/INVALID|12345/);
    seen.add(shown);
    expect(byId(h, 'setup-start')).not.toBeNull();
  });
  it('uses a different text for every closed reason', () => {
    expect(seen.size).toBe(cases.length + 1);
  });
});

describe('storage notices and the autosave line', () => {
  it('a failed read shows the read-failed notice, can be dismissed, and a new game can be started', () => {
    const h = boot({ init: { [SAVE_KEY]: SAVES.placement1() }, failRead: true, durable: true });
    const notice = byClass(h, 'notice');
    expect(notice).toHaveLength(1);
    expect(text(notice[0])).toContain('Saved data could not be read');
    expect(text(notice[0])).toContain('A new game can still be played');
    expect(byId(h, 'setup-start')).not.toBeNull();
    expect(h.inner.getItem(SAVE_KEY)).not.toBeNull(); // nothing was removed
    click(byClass(h, 'notice-dismiss')[0]);
    expect(h.input().model.notices).toEqual([]);
    expect(byClass(h, 'notice')).toHaveLength(0);
  });

  it('a store that is not durable shows the not-durable notice from startup, and it cannot be dismissed', () => {
    for (const durable of [false, 'absent'] as const) {
      const h = boot({ durable });
      expect(text(byClass(h, 'notice')[0])).toContain('lost if you reload or close the page');
      expect(byClass(h, 'notice-dismiss')).toHaveLength(0);
      h.ctl.dismissNotice('STORAGE_NOT_DURABLE');
      expect(byClass(h, 'notice')).toHaveLength(1);
    }
  });

  it('a durable store: no notice and no status line at startup; the status line appears after a durable save', () => {
    const h = boot({ durable: true });
    expect(byClass(h, 'notice')).toHaveLength(0);
    expect(byClass(h, 'notice-status')).toHaveLength(0);
    expect(h.input().model.storage).toBe('UNKNOWN');
    h.ctl.startGame({ config: configFor(1), seed: 5 });
    expect(h.input().model.storage).toBe('DURABLE');
    const status = byClass(h, 'notice-status');
    expect(status).toHaveLength(1);
    expect(text(status[0])).toContain('Progress is saved automatically in this browser.');
    expect(text(status[0])).toContain('not secret');
    // in Korean, in place
    h.ctl.setLanguage('ko');
    expect(text(byClass(h, 'notice-status')[0])).toContain('자동으로 저장');
  });

  it('MEMORY_ONLY (a store that is not durable) never says saved; the not-durable notice stays', () => {
    const h = boot({ durable: false });
    h.ctl.startGame({ config: configFor(1), seed: 5 });
    expect(h.input().model.storage).toBe('MEMORY_ONLY');
    expect(byClass(h, 'notice-status')).toHaveLength(0);
    expect(text(h.root).toLowerCase()).not.toMatch(/saved automatically|progress is saved/);
    expect(h.input().model.notices.map((n) => n.kind)).toEqual(['STORAGE_NOT_DURABLE']);
  });

  it('a throwing setItem mid-game shows the write-failed notice; the game plays to the end; nothing says saved', () => {
    const h = boot({ durable: true });
    h.ctl.startGame({ config: configFor(1), seed: SEED.ONE });
    expect(byClass(h, 'notice-status')).toHaveLength(1);
    h.flags.failSave = true;
    for (let i = 0; i < 3000 && advance(h.ctl, h.queue); i++) {
      if (h.ctl.getModel().storage === 'FAILED') break;
    }
    expect(h.input().model.storage).toBe('FAILED');
    expect(h.input().model.notices.map((n) => n.kind)).toEqual(['STORAGE_WRITE_FAILED']);
    expect(byClass(h, 'notice-status')).toHaveLength(0);
    const shown = text(byClass(h, 'notice')[0]);
    expect(shown).toContain('The game continues, but it cannot be saved');
    expect(shown).toContain('lost if you reload or close the page');
    expect(byClass(h, 'notice-dismiss')).toHaveLength(0);
    for (let i = 0; i < 3000 && advance(h.ctl, h.queue); i++) {
      /* play on */
    }
    expect(h.input().model.screen).toBe('END');
    expect(byClass(h, 'end-ranking')).toHaveLength(1);
    expect(byClass(h, 'notices')).toHaveLength(1); // the region is on the end screen too
    expect(text(h.root).toLowerCase()).not.toMatch(/saved automatically|progress is saved/);
  });

  it('the status line is about the running game: it is gone on the end screen (the save is removed there) and on the setup screen', () => {
    const h = boot({ durable: true });
    h.ctl.startGame({ config: configFor(1), seed: SEED.ONE });
    expect(byClass(h, 'notice-status')).toHaveLength(1);
    for (let i = 0; i < 3000 && advance(h.ctl, h.queue); i++) {
      /* play to the end */
    }
    expect(h.input().model.screen).toBe('END');
    expect(h.inner.getItem(SAVE_KEY)).toBeNull();
    expect(byClass(h, 'notice-status')).toHaveLength(0);
    click(byId(h, 'end-new-setup'));
    expect(h.input().model.screen).toBe('SETUP');
    expect(byClass(h, 'notice-status')).toHaveLength(0);
  });

  it('dismisses SAVE_DISCARDED through its button and the notice goes from model and page', () => {
    const h = boot({ init: { [SAVE_KEY]: '{bad' }, durable: false });
    expect(byClass(h, 'notice')).toHaveLength(2);
    expect(byClass(h, 'notice-dismiss')).toHaveLength(1);
    click(byClass(h, 'notice-dismiss')[0]);
    expect(h.input().model.notices.map((n) => n.kind)).toEqual(['STORAGE_NOT_DURABLE']);
    expect(byClass(h, 'notice')).toHaveLength(1);
  });
});

describe('notices region placement', () => {
  const ancestors = (el: FakeEl): FakeEl[] => {
    const out: FakeEl[] = [];
    for (let p = el.parentNode; p !== null; p = p.parentNode) out.push(p);
    return out;
  };
  const expectInBar = (h: Harness, label: string): void => {
    const regions = byClass(h, 'notices');
    expect(regions, label).toHaveLength(1);
    const chain = ancestors(regions[0] as FakeEl);
    expect(chain.some((a) => hasClass(a, 'game-bar')), `${label}: in the top bar`).toBe(true);
    for (const priv of ['game-layout', 'game-gate-slot', 'game-setup-slot', 'game-panel-slot', 'game-main-slot']) {
      expect(chain.some((a) => hasClass(a, priv)), `${label}: not inside ${priv}`).toBe(false);
    }
    expect(regions[0]?.getAttribute('aria-live')).toBe('polite');
  };

  it('is one live region in the top bar on the resume prompt, setup, game, gate and end screens', () => {
    const resume = boot(withSave(SAVES.guess2(), { durable: false }));
    expectInBar(resume, 'resume');
    click(byId(resume, 'resume-continue'));
    expectInBar(resume, 'gate');
    expect(text(byClass(resume, 'notice')[0]), 'visible during a gate').toContain('lost if you reload or close the page');
    expect(scan(resume, SAVES.guess2(), { savedTime: 'forbidden' })).toEqual([]);
    click(byId(resume, 'privacy-gate-ack'));
    expectInBar(resume, 'game');

    const setup = boot({ durable: false });
    expectInBar(setup, 'setup');
    setup.ctl.startGame({ config: configFor(1), seed: SEED.ONE });
    expectInBar(setup, 'game');
    for (let i = 0; i < 3000 && advance(setup.ctl, setup.queue); i++) {
      /* play to the end */
    }
    expectInBar(setup, 'end');
  });
});

// ---------------------------------------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------------------------------------

describe('language switch', () => {
  it('re-renders the prompt and the notices in place and keeps the focus on the same control', () => {
    const h = boot(withSave(SAVES.placement1(), { durable: false }));
    const discard = byId(h, 'resume-discard') as FakeEl;
    const notice = byClass(h, 'notice')[0] as FakeEl;
    discard.focus();
    h.ctl.setLanguage('ko');
    expect(text(byId(h, 'resume-continue'))).toBe('이어하기');
    expect(text(byId(h, 'resume-discard'))).toBe('저장된 게임 삭제');
    expect(text(byClass(h, 'resume')[0])).toContain('사람 플레이어: 1명');
    expect(byId(h, 'resume-discard')).toBe(discard);
    expect(h.doc.activeElement).toBe(discard);
    expect(byClass(h, 'notice')[0]).toBe(notice);
    expect(text(notice)).toContain('페이지를 새로 고치거나 닫으면');
  });

  it('keeps the focus on a dismiss button through a language change', () => {
    const h = boot({ init: { [SAVE_KEY]: '{bad' }, durable: true });
    const dismiss = byClass(h, 'notice-dismiss')[0] as FakeEl;
    dismiss.focus();
    h.ctl.setLanguage('ko');
    expect(h.doc.activeElement).toBe(dismiss);
    expect(text(dismiss)).toBe('알림 닫기');
  });
});

// ---------------------------------------------------------------------------------------------------------
// Preferences in the setup screen
// ---------------------------------------------------------------------------------------------------------

describe('setup preferences', () => {
  it('starts with the stored prefs, persists a change as sanitized prefs without a seed, and a started game stores them', () => {
    const prefsStore = memoryStore();
    writePrefs(prefsStore, { language: 'en', setup: { humanCount: 2, difficulties: ['BEGINNER', 'BEGINNER', 'ADVANCED', 'ADVANCED'], identityVisibility: 'FACE_UP' } });
    const h = boot({ init: { [PREFS_KEY]: prefsStore.getItem(PREFS_KEY) as string }, durable: true });
    expect(checked(byId(h, 'setup-humans-2'))).toBe(true);
    expect(checked(byId(h, 'setup-visibility-FACE_UP'))).toBe(true);
    expect(h.input().model.setupPrefs.humanCount).toBe(2);

    const three = byId(h, 'setup-humans-3') as FakeEl;
    three.fire('change');
    expect(h.input().model.setupPrefs.humanCount).toBe(3);
    const stored = readPrefs(h.inner);
    expect(stored.language).toBe('en');
    expect(stored.setup).toEqual({ humanCount: 3, difficulties: ['BEGINNER', 'BEGINNER', 'ADVANCED', 'ADVANCED'], identityVisibility: 'FACE_UP' });
    expect(h.inner.getItem(PREFS_KEY)).not.toMatch(/seed/i);

    (byId(h, 'setup-seed') as unknown as { value: string }).value = '31415926';
    click(byId(h, 'setup-start'));
    expect(h.input().model.screen).toBe('GAME');
    expect(h.input().seed).toBe(31415926);
    expect(readPrefs(h.inner).setup).toEqual({ humanCount: 3, difficulties: ['BEGINNER', 'BEGINNER', 'ADVANCED', 'ADVANCED'], identityVisibility: 'FACE_UP' });
    expect(h.inner.getItem(PREFS_KEY)).not.toContain('31415926');
    expect(envelopeOf(h.inner.getItem(SAVE_KEY) as string).config.seats.filter((s) => s.kind === 'HUMAN')).toHaveLength(3);
  });

  it('without stored prefs the setup shows the defaults', () => {
    const h = boot({ durable: true });
    expect(checked(byId(h, 'setup-humans-1'))).toBe(true);
    expect(h.input().model.setupPrefs).toEqual(DEFAULT_SETUP_PREFS);
  });
});

// ---------------------------------------------------------------------------------------------------------
// mountApp: the stored language goes through the shell
// ---------------------------------------------------------------------------------------------------------

class ShellDoc extends FakeDocument {
  readonly documentElement = { lang: 'en' };
  title = '';
}

describe('mountApp with a store: the first render applies the stored language through the shell', () => {
  function mount(languages: readonly string[], init: Record<string, string>): { doc: ShellDoc; root: FakeEl; select: FakeEl; title: FakeEl } {
    const doc = new ShellDoc();
    const root = doc.createElement('div');
    doc.body.appendChild(root);
    const host = createGameScreen({ doc: doc as unknown as GameScreenDocument, root: root as unknown as HTMLElement, randomSeedText: () => '1' });
    mountApp(root as unknown as HTMLElement, {
      doc: doc as unknown as Document,
      languages,
      schedule: () => ({ cancel: () => undefined }),
      randomSeed: () => 1,
      store: memoryStore(init),
      nowIso,
      renderer: host.render,
    });
    const all = doc.all();
    return { doc, root, select: all.find((e) => e.tagName === 'select' && e.getAttribute('id') === 'shell-language') as FakeEl, title: all.find((e) => e.tagName === 'h1') as FakeEl };
  }
  const prefsWith = (language: string): string => {
    const s = memoryStore();
    writePrefs(s, { language, setup: DEFAULT_SETUP_PREFS });
    return s.getItem(PREFS_KEY) as string;
  };

  it('stored ko beats an English browser: title, <html lang>, selector and the setup screen are Korean', () => {
    const m = mount(['en-US'], { [PREFS_KEY]: prefsWith('ko') });
    expect(m.doc.documentElement.lang).toBe('ko');
    expect((m.select as unknown as { value: string }).value).toBe('ko');
    expect(text(m.doc.getElementById('setup-start'))).toBe('게임 시작');
  });
  it('no stored language: the browser language is used as before', () => {
    const m = mount(['ko-KR'], {});
    expect(m.doc.documentElement.lang).toBe('ko');
    const en = mount(['en-GB'], {});
    expect(en.doc.documentElement.lang).toBe('en');
  });
  it('an invalid stored language is ignored and the browser language is used', () => {
    const m = mount(['ko'], { [PREFS_KEY]: prefsWith('fr') });
    expect(m.doc.documentElement.lang).toBe('ko');
  });
});

// ---------------------------------------------------------------------------------------------------------
// Source and style scans
// ---------------------------------------------------------------------------------------------------------

describe('sources and styles', () => {
  const ui = join(dirname(fileURLToPath(import.meta.url)), '..');
  const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const read = (...parts: string[]): string => strip(readFileSync(join(ui, ...parts), 'utf8'));

  it('the host, the prompt and the notices touch no console, storage, clock, randomness or global, and import no persistence module', () => {
    for (const file of [['screens', 'game.ts'], ['screens', 'resume.ts'], ['components', 'notices.ts']]) {
      const source = read(...file);
      expect(source, file.join('/')).not.toMatch(/\bconsole\b|localStorage|sessionStorage|new Date|Date\.now|Math\.random|globalThis|\bwindow\b|persistence\//);
    }
  });
  it('main.ts is the only ui file with browserStore(), the clock, setTimeout and crypto', () => {
    const main = read('main.ts');
    expect(main).toMatch(/store: browserStore\(\)/);
    expect(main).toMatch(/nowIso: \(\) => new Date\(\)\.toISOString\(\)/);
    expect(main).not.toMatch(/\bconsole\b|localStorage|Math\.random/);
    const others = ['controller.ts', 'store.ts', 'shell.ts', join('screens', 'game.ts'), join('screens', 'resume.ts'), join('components', 'notices.ts')];
    for (const file of others) expect(read(file), file).not.toMatch(/browserStore\(|new Date|localStorage/);
  });
  it('persistence.css: controls of at least 44 px, reduced motion, no hover rule, no network or font reference', () => {
    const css = read('styles', 'persistence.css');
    for (const control of ['.notice-dismiss', '.resume-button']) expect(css, control).toMatch(new RegExp(`${control.replace('.', '\\.')}[^{]*\\{[^}]*min-block-size:\\s*var\\(--touch-min\\)`));
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).not.toMatch(/:hover|url\(|@import|https?:|@font-face|touch-action/);
    expect(css).not.toMatch(/display:\s*none/); // the empty region stays a live region
  });
  it('the asFake helper keeps working with the new elements (no HTML string API is used)', () => {
    const h = boot({ durable: true });
    expect(asFake(h.host.element as HTMLElement)).toBe(h.host.element);
  });
});
