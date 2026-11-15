// Persistence integration of the UI controller (task 20.4, stage A: controller, store and model only).
//
// EVIDENCE CLASS model: DOM-free, real engine games, `memoryStore` and a recording/throwing store wrapper, an injected
// deterministic clock, a stub renderer and a queue scheduler. Nothing here says anything about a real browser storage,
// a real reload or a real device (those come with the host stage and the Playwright stage).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStrategy } from '../ai/registry';
import { ALL_CARDS } from '../core/cards';
import { replay } from '../core/replay';
import { RULES_VERSION } from '../core/score';
import { defaultConfig } from '../core/state';
import { SEATS } from '../core/turn';
import type { Action, Difficulty, GameConfig, IdentityVisibility, PlayerId } from '../core/types';
import { viewFor } from '../core/view';
import type { PlayerView } from '../core/view';
import { getLanguage, resetLanguage } from '../i18n';
import type { Lang } from '../i18n';
import { parseSave, SAVE_FORMAT, SAVE_VERSION, serializeSave } from '../persistence/save-format';
import type { SaveEnvelope } from '../persistence/save-format';
import { memoryStore, PREFS_KEY, readPrefs, SAVE_KEY, writePrefs } from '../persistence/storage';
import type { KeyValueStore } from '../persistence/storage';
import { playGame, strategiesFor } from '../sim/play-game';
import { createController } from './controller';
import type { Controller, RenderInput, Renderer, Schedule } from './controller';
import { DEFAULT_SETUP_PREFS, sanitizeSetupPrefs } from './setup-model';
import type { SetupOptions } from './setup-model';
import type { Notice } from './store';
import { passGate } from './testing/pass-gate';

const NOW = '2026-01-01T00:00:00.000Z';
const nowIso = (): string => NOW;

const consoleSpies: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  for (const m of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
    consoleSpies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
  }
});
afterEach(() => {
  try {
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled(); // the controller never logs
  } finally {
    vi.restoreAllMocks();
    consoleSpies.length = 0;
    resetLanguage();
  }
});

// ---------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------

/** Queue scheduler that records `schedule` and `step` events into a shared call log. */
class EventScheduler {
  readonly queue: { fn: () => void; cancelled: boolean }[] = [];
  constructor(private readonly events: string[]) {}
  readonly schedule: Schedule = (fn) => {
    const entry = { fn, cancelled: false };
    this.queue.push(entry);
    this.events.push('schedule');
    return {
      cancel: () => {
        entry.cancelled = true;
        const at = this.queue.indexOf(entry);
        if (at >= 0) this.queue.splice(at, 1);
      },
    };
  };
  get pending(): number {
    return this.queue.length;
  }
  step(): void {
    const entry = this.queue.shift();
    if (entry === undefined) return;
    this.events.push('step');
    entry.fn();
  }
}

/** A store wrapper that records calls into the shared log and can be told to fail. */
class Rec {
  saveSets = 0;
  prefSets = 0;
  removes = 0;
  failSave: unknown = null;
  failPrefs: unknown = null;
  failRemove: unknown = null;
  failReadSave = false;
  readonly store: KeyValueStore;
  constructor(
    readonly inner: KeyValueStore,
    events: string[],
    durable: boolean | 'absent',
  ) {
    const base: KeyValueStore = {
      getItem: (k) => {
        if (this.failReadSave && k === SAVE_KEY) throw new Error('read failed');
        return inner.getItem(k);
      },
      setItem: (k, v) => {
        if (k === SAVE_KEY) {
          this.saveSets++;
          events.push('save');
          if (this.failSave !== null) throw this.failSave;
        } else {
          this.prefSets++;
          events.push('prefs');
          if (this.failPrefs !== null) throw this.failPrefs;
        }
        inner.setItem(k, v);
      },
      removeItem: (k) => {
        this.removes++;
        events.push('remove');
        if (this.failRemove !== null) throw this.failRemove;
        inner.removeItem(k);
      },
    };
    this.store = durable === 'absent' ? base : { ...base, durable };
  }
}

interface Rig {
  ctl: Controller;
  readonly sched: EventScheduler;
  readonly renders: RenderInput[];
  readonly events: string[];
  readonly rec: Rec;
  hook: ((input: RenderInput) => void) | null;
  readonly seeds: number[];
}

interface RigOptions {
  readonly init?: Record<string, string>;
  readonly durable?: boolean | 'absent';
  readonly language?: Lang;
  readonly clock?: () => string;
  readonly noStore?: boolean;
  readonly noClock?: boolean;
}

function rig(o: RigOptions = {}): Rig {
  const events: string[] = [];
  const renders: RenderInput[] = [];
  const sched = new EventScheduler(events);
  const rec = new Rec(memoryStore(o.init), events, o.durable ?? false);
  const seeds: number[] = [];
  const out: Rig = { sched, renders, events, rec, hook: null, seeds, ctl: undefined as unknown as Controller };
  const renderer: Renderer = (input) => {
    events.push('render');
    renders.push(input);
    out.hook?.(input);
  };
  let seed = 100;
  const ctl = createController({
    schedule: sched.schedule,
    renderer,
    randomSeed: () => {
      seeds.push(seed);
      return seed++;
    },
    language: () => o.language ?? 'en',
    ...(o.noStore === true ? {} : { store: rec.store }),
    ...(o.noClock === true ? {} : { nowIso: o.clock ?? nowIso }),
  });
  out.ctl = ctl;
  return out;
}

const kindsOf = (kinds: readonly ('HUMAN' | Difficulty)[]): GameConfig['seats'] =>
  kinds.map((k, i) =>
    k === 'HUMAN'
      ? { id: SEATS[i] as PlayerId, kind: 'HUMAN', name: `Human ${i}` }
      : { id: SEATS[i] as PlayerId, kind: 'AI', difficulty: k, name: `AI ${i}` },
  ) as unknown as GameConfig['seats'];

function configFor(humans: 1 | 2 | 4, visibility: IdentityVisibility = 'OWNER_ONLY'): GameConfig {
  const kinds: ('HUMAN' | Difficulty)[] = SEATS.map((_, i) => (i < humans ? 'HUMAN' : 'BEGINNER'));
  return { ...defaultConfig(), seats: kindsOf(kinds), identityVisibility: visibility };
}

/** Distinctive Guess value per human seat. */
const GUESS_OF: Readonly<Record<PlayerId, number>> = { P0: 21, P1: 25, P2: 29, P3: 33 };

/** What the person at `view.viewer` does, decided by the cheap BEGINNER strategy from that person's own view. */
function humanAction(view: PlayerView): Action | null {
  const ctx = { decisionSeed: view.board.filter((c) => c !== null).length + view.history.length * 1000 };
  if (view.phase === 'PLACEMENT' && view.turn === view.viewer) return getStrategy('BEGINNER').choosePlacement(view, ctx);
  if (view.phase === 'GUESS_COLLECT' && !view.guessSubmitted[view.viewer]) {
    return { type: 'SUBMIT_GUESSES', player: view.viewer, guesses: Object.fromEntries(view.pendingQuadKeys.map((k) => [k, GUESS_OF[view.viewer]])) };
  }
  if (view.phase === 'REVEAL') return { type: 'ACK_REVEAL' };
  return null;
}

interface Accepted {
  readonly delta: number;
  readonly ended: boolean;
}

/**
 * One unit of progress: a pending AI step, else a gate acknowledgement, else one human Action. Returns false when no
 * game runs or it ended. `onAccepted` sees the call log of the step (cleared before it) when Actions were accepted.
 */
function stepOnce(r: Rig, onAccepted?: (a: Accepted) => void): boolean {
  const model = r.ctl.getModel();
  if (model.screen !== 'GAME') return false;
  r.events.length = 0;
  const before = model.actionCount;
  if (r.sched.pending > 0) {
    r.sched.step();
  } else if (model.gate !== null) {
    expect(passGate(r.ctl)).toBe(true);
    return true;
  } else {
    const action: Action | null = model.viewer === null ? { type: 'ACK_REVEAL' } : humanAction(r.ctl.getView(model.viewer) as PlayerView);
    if (action === null) throw new Error('stuck');
    expect(r.ctl.dispatchHuman(action)).toEqual({ ok: true });
  }
  const after = r.ctl.getModel();
  if (after.actionCount > before) onAccepted?.({ delta: after.actionCount - before, ended: after.screen === 'END' });
  return true;
}

function driveToEnd(r: Rig, onAccepted?: (a: Accepted) => void): void {
  for (let i = 0; i < 4000; i++) if (!stepOnce(r, onAccepted)) return;
  throw new Error('game did not end');
}

/** Save-before-render and save-before-schedule for the step whose calls are in `events`. */
function expectSaveFirst(events: readonly string[], accepted: Accepted): void {
  const saves = events.filter((e) => e === 'save').length;
  const removes = events.filter((e) => e === 'remove').length;
  expect(saves).toBe(accepted.delta - (accepted.ended ? 1 : 0));
  expect(removes).toBe(accepted.ended ? 1 : 0);
  const lastWrite = Math.max(events.lastIndexOf('save'), events.lastIndexOf('remove'));
  expect(lastWrite).toBeGreaterThanOrEqual(0);
  const render = events.indexOf('render');
  expect(render).toBeGreaterThan(lastWrite);
  const schedule = events.indexOf('schedule');
  if (schedule >= 0) expect(schedule).toBeGreaterThan(lastWrite);
}

/** The stored text is canonical, replays, and reproduces the controller's current views of all four seats. */
function expectSavedMatches(r: Rig, seed: number, cfg: GameConfig): SaveEnvelope {
  const text = r.rec.inner.getItem(SAVE_KEY);
  expect(text).not.toBeNull();
  const parsed = parseSave(text as string);
  if (parsed.kind !== 'OK') throw new Error(`stored save is ${parsed.kind}`);
  const env = parsed.envelope;
  expect(env.seed).toBe(seed);
  expect(env.config).toEqual(cfg);
  expect(env.savedAtIso).toBe(NOW);
  expect(env.actions.length).toBe(r.ctl.getModel().actionCount);
  expect(text).toBe(serializeSave(env));
  const replayed = replay(env.seed, env.config, env.actions);
  if (!replayed.ok) throw new Error('stored log does not replay');
  for (const seat of SEATS) expect(viewFor(replayed.value, seat)).toEqual(r.ctl.getView(seat));
  return env;
}

const noticeKinds = (r: Rig): string[] => r.ctl.getModel().notices.map((n) => n.kind);
const noticeCount = (r: Rig, kind: Notice['kind']): number => r.ctl.getModel().notices.filter((n) => n.kind === kind).length;

/** Serialized input without the handlers (functions) for privacy scans. */
const dump = (input: RenderInput): string => JSON.stringify({ ...input, handlers: undefined });

/** A real saved text of a game cut by `until`. */
function savedTextAfter(humans: 1 | 2 | 4, seed: number, until: (r: Rig) => boolean, visibility: IdentityVisibility = 'OWNER_ONLY'): string {
  const r = rig();
  r.ctl.startGame({ config: configFor(humans, visibility), seed });
  for (let i = 0; i < 2000 && !until(r); i++) expect(stepOnce(r)).toBe(true);
  return r.rec.inner.getItem(SAVE_KEY) as string;
}

const submittedCount = (r: Rig): number => Object.values((r.ctl.getView('P0') as PlayerView).guessSubmitted).filter(Boolean).length;
const phaseOf = (r: Rig): string => (r.ctl.getView('P0') as PlayerView).phase;

// ---------------------------------------------------------------------------------------------------------
// Save points and ordering
// ---------------------------------------------------------------------------------------------------------

describe('save after every accepted Action (whole games)', () => {
  for (const humans of [1, 2, 4] as const) {
    it(`${humans} human seat(s): the stored log equals the accepted count after each step; saves precede the render and the next schedule`, () => {
      const seed = 5150 + humans;
      const cfg = configFor(humans);
      const r = rig();
      r.events.length = 0;
      expect(r.ctl.startGame({ config: cfg, seed })).toEqual({ ok: true });
      // begin: saved before the render and before the first AI step is scheduled
      expect(r.events.indexOf('save')).toBe(0);
      expect(r.events.indexOf('render')).toBeGreaterThan(0);
      if (r.events.includes('schedule')) expect(r.events.indexOf('schedule')).toBeGreaterThan(r.events.indexOf('save'));
      expect(expectSavedMatches(r, seed, cfg).actions).toEqual([]);

      let steps = 0;
      let batches = 0;
      driveStepwise: for (let i = 0; i < 4000; i++) {
        const more = stepOnce(r, (accepted) => {
          steps++;
          if (accepted.delta >= 2) batches++;
          expectSaveFirst(r.events, accepted);
          if (!accepted.ended) expectSavedMatches(r, seed, cfg);
        });
        if (!more) break driveStepwise;
      }
      const model = r.ctl.getModel();
      expect(model.screen).toBe('END');
      expect(steps).toBeGreaterThan(20);
      if (humans < 4) expect(batches).toBeGreaterThan(0); // an AI Guess batch is saved once per seat in one step
      // ENDED: the in-progress save is gone; one write per non-final Action plus the one of `begin`
      expect(r.rec.inner.getItem(SAVE_KEY)).toBeNull();
      expect(r.rec.saveSets).toBe(model.actionCount);
      expect(model.storage).toBe('MEMORY_ONLY'); // the test store is not durable
    });
  }

  it('an AI Guess batch writes once per AI seat, in seat order', () => {
    const r = cutRig(1, 'OWNER_ONLY', 'GUESS_0', 77); // all four seats still to submit; the pending step is the AI batch
    r.rec.saveSets = 0;
    r.events.length = 0;
    expect(r.sched.pending).toBe(1);
    r.sched.step();
    expect(r.rec.saveSets).toBe(3);
    expect(r.events.filter((e) => e === 'save')).toHaveLength(3);
    expect(r.events.lastIndexOf('save')).toBeLessThan(r.events.indexOf('render'));
  });

  it('a new game overwrites an older save (a new game never resumes an unrelated old one)', () => {
    let n = 0;
    const r = rig({ clock: () => `2026-01-01T00:00:00.${String(n++).padStart(3, '0')}Z` });
    r.ctl.startGame({ config: configFor(1), seed: 11 });
    for (let i = 0; i < 6; i++) stepOnce(r);
    const first = parseSave(r.rec.inner.getItem(SAVE_KEY) as string);
    expect(first.kind).toBe('OK');
    expect(r.ctl.startGame({ config: configFor(2), seed: 12 })).toEqual({ ok: true });
    const next = parseSave(r.rec.inner.getItem(SAVE_KEY) as string);
    if (next.kind !== 'OK' || first.kind !== 'OK') throw new Error('bad save');
    expect(next.envelope.seed).toBe(12);
    expect(next.envelope.actions).toEqual([]);
    expect(next.envelope.config.seats.filter((s) => s.kind === 'HUMAN')).toHaveLength(2);
    expect(next.envelope.savedAtIso > first.envelope.savedAtIso).toBe(true); // the injected clock is what is stored
    // restart and replaySameSeed also go through `begin`
    r.ctl.restart();
    expect((parseSave(r.rec.inner.getItem(SAVE_KEY) as string) as { envelope: SaveEnvelope }).envelope.seed).toBe(r.seeds[r.seeds.length - 1]);
    r.ctl.replaySameSeed();
    expect((parseSave(r.rec.inner.getItem(SAVE_KEY) as string) as { envelope: SaveEnvelope }).envelope.actions).toEqual([]);
  });

  it('a throwing clock never throws out of the controller and counts as a failed save', () => {
    const r = rig({
      clock: () => {
        throw new Error('clock');
      },
    });
    expect(r.ctl.startGame({ config: configFor(1), seed: 3 })).toEqual({ ok: true });
    expect(r.ctl.getModel().storage).toBe('FAILED');
    expect(noticeKinds(r)).toContain('STORAGE_WRITE_FAILED');
  });
});

describe('no save for a rejected Action', () => {
  function atHumanTurn(): Rig {
    const r = rig();
    r.ctl.startGame({ config: configFor(1), seed: 21 });
    for (let i = 0; i < 400; i++) {
      const view = r.ctl.getView('P0') as PlayerView;
      if (view.phase === 'PLACEMENT' && view.turn === 'P0') return r;
      expect(stepOnce(r)).toBe(true);
    }
    throw new Error('no human turn');
  }

  it('illegal PLACE, wrong phase, PLACE_NOT_ALLOWED, empty draft: no write, storage unchanged', () => {
    const r = atHumanTurn();
    const view = r.ctl.getView('P0') as PlayerView;
    const before = { sets: r.rec.saveSets, removes: r.rec.removes, storage: r.ctl.getModel().storage, count: r.ctl.getModel().actionCount };
    const same = (): void => {
      expect(r.rec.saveSets).toBe(before.sets);
      expect(r.rec.removes).toBe(before.removes);
      expect(r.ctl.getModel().storage).toBe(before.storage);
      expect(r.ctl.getModel().actionCount).toBe(before.count);
    };
    const card = view.myHand[0] as Extract<Action, { type: 'PLACE' }>['card'];
    expect(r.ctl.dispatchHuman({ type: 'PLACE', player: 'P0', card, pos: { row: 99, col: 99 }, orientation: 0 }).ok).toBe(false);
    same();
    expect(r.ctl.dispatchHuman({ type: 'SUBMIT_GUESSES', player: 'P0', guesses: {} })).toMatchObject({ ok: false, reason: 'ENGINE', code: 'WRONG_PHASE' });
    same();
    expect(r.ctl.dispatchHuman({ type: 'ACK_REVEAL' })).toMatchObject({ ok: false, reason: 'ENGINE' });
    same();
    const handlers = r.renders[r.renders.length - 1]!.handlers;
    expect(handlers.dispatch({ type: 'PLACE', player: 'P0', card, pos: { row: 3, col: 3 }, orientation: 0 } as never)).toEqual({
      ok: false,
      reason: 'PLACE_NOT_ALLOWED',
    });
    same();
    expect(r.ctl.confirmPlacement()).toMatchObject({ ok: false, reason: 'DRAFT_INVALID' });
    same();
    r.ctl.draftEvent({ type: 'selectCard', card });
    expect(r.ctl.confirmPlacement()).toMatchObject({ ok: false, reason: 'DRAFT_INVALID' }); // card without target
    same();
  });

  it('a duplicate submission of the very same Action object is refused without a second write', () => {
    const r = atHumanTurn();
    const action = humanAction(r.ctl.getView('P0') as PlayerView) as Action;
    expect(r.ctl.dispatchHuman(action)).toEqual({ ok: true });
    const sets = r.rec.saveSets;
    expect(r.ctl.dispatchHuman(action)).toMatchObject({ ok: false, reason: 'ENGINE', code: 'DUPLICATE_SUBMISSION' });
    expect(r.rec.saveSets).toBe(sets);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Storage status and notices
// ---------------------------------------------------------------------------------------------------------

describe('storage status mapping', () => {
  const play = (r: Rig): void => {
    r.ctl.startGame({ config: configFor(1), seed: 31 });
    for (let i = 0; i < 4; i++) stepOnce(r);
  };

  it('memoryStore (not durable): MEMORY_ONLY and one STORAGE_NOT_DURABLE notice, never DURABLE', () => {
    const r = rig({ durable: false });
    expect(noticeKinds(r)).toEqual(['STORAGE_NOT_DURABLE']); // from startup
    expect(r.ctl.getModel().storage).toBe('UNKNOWN');
    play(r);
    expect(r.ctl.getModel().storage).toBe('MEMORY_ONLY');
    expect(noticeCount(r, 'STORAGE_NOT_DURABLE')).toBe(1);
  });

  it('a store without the durable member counts as not durable', () => {
    const r = rig({ durable: 'absent' });
    play(r);
    expect(r.ctl.getModel().storage).toBe('MEMORY_ONLY');
    expect(noticeKinds(r)).toEqual(['STORAGE_NOT_DURABLE']);
  });

  it('a durable store: DURABLE and no notice', () => {
    const r = rig({ durable: true });
    expect(noticeKinds(r)).toEqual([]);
    play(r);
    expect(r.ctl.getModel().storage).toBe('DURABLE');
    expect(noticeKinds(r)).toEqual([]);
  });

  for (const [name, failure] of [
    ['generic error', new Error('boom')],
    ['quota-like error', Object.assign(new Error('full'), { name: 'QuotaExceededError', code: 22 })],
  ] as const) {
    it(`a throwing setItem (${name}) neither throws nor rolls back: the game reaches ENDED with FAILED + notice`, () => {
      const r = rig({ durable: true });
      r.rec.failSave = failure;
      expect(r.ctl.startGame({ config: configFor(1), seed: 41 })).toEqual({ ok: true });
      expect(r.ctl.getModel().storage).toBe('FAILED');
      let ranToEnd = false;
      driveToEnd(r, (accepted) => {
        if (accepted.ended) {
          ranToEnd = true;
          return;
        }
        expect(r.ctl.getModel().storage).toBe('FAILED');
        expect(noticeCount(r, 'STORAGE_WRITE_FAILED')).toBe(1); // never duplicated
      });
      expect(ranToEnd).toBe(true);
      expect(r.ctl.getModel().screen).toBe('END');
      expect(r.ctl.getModel().aiStalled).toBe(false);
      expect(r.ctl.getModel().lastError).toBeNull();
      expect(r.rec.inner.getItem(SAVE_KEY)).toBeNull(); // nothing was ever written
    });
  }

  it('the failed-write notice clears after a later durable save (a store that recovers)', () => {
    const r = rig({ durable: true });
    r.ctl.startGame({ config: configFor(1), seed: 42 });
    r.rec.failSave = new Error('full');
    stepOnce(r);
    expect(r.ctl.getModel().storage).toBe('FAILED');
    expect(noticeKinds(r)).toEqual(['STORAGE_WRITE_FAILED']);
    r.rec.failSave = null;
    stepOnce(r);
    expect(r.ctl.getModel().storage).toBe('DURABLE');
    expect(noticeKinds(r)).toEqual([]);
    expectSavedMatches(r, 42, configFor(1));
  });

  it('a non-durable store that fails and recovers ends as MEMORY_ONLY with only the not-durable notice', () => {
    const r = rig({ durable: false });
    r.ctl.startGame({ config: configFor(1), seed: 43 });
    r.rec.failSave = new Error('x');
    stepOnce(r);
    expect(noticeKinds(r).sort()).toEqual(['STORAGE_NOT_DURABLE', 'STORAGE_WRITE_FAILED']);
    r.rec.failSave = null;
    stepOnce(r);
    expect(r.ctl.getModel().storage).toBe('MEMORY_ONLY');
    expect(noticeKinds(r)).toEqual(['STORAGE_NOT_DURABLE']);
  });

  it('the saves of an ENDED game remove the save and keep the preferences', () => {
    const r = rig({ durable: true });
    r.ctl.setSetupPrefs({ ...DEFAULT_SETUP_PREFS, humanCount: 2 });
    const prefs = r.rec.inner.getItem(PREFS_KEY);
    expect(prefs).not.toBeNull();
    r.ctl.startGame({ config: configFor(1), seed: 44 });
    driveToEnd(r);
    expect(r.rec.inner.getItem(SAVE_KEY)).toBeNull();
    expect(r.rec.inner.getItem(PREFS_KEY)).toBe(prefs);
  });

  it('abandon removes the save and keeps the preferences; a throwing removeItem gives FAILED', () => {
    const r = rig({ durable: true });
    r.ctl.setSetupPrefs({ ...DEFAULT_SETUP_PREFS, humanCount: 3 });
    const prefs = r.rec.inner.getItem(PREFS_KEY);
    r.ctl.startGame({ config: configFor(1), seed: 45 });
    expect(r.rec.inner.getItem(SAVE_KEY)).not.toBeNull();
    expect(r.ctl.abandon()).toEqual({ ok: true });
    expect(r.rec.inner.getItem(SAVE_KEY)).toBeNull();
    expect(r.rec.inner.getItem(PREFS_KEY)).toBe(prefs);
    expect(r.ctl.getModel().screen).toBe('SETUP');

    const f = rig({ durable: true });
    f.ctl.startGame({ config: configFor(1), seed: 46 });
    f.rec.failRemove = new Error('no remove');
    expect(f.ctl.abandon()).toEqual({ ok: true });
    expect(f.ctl.getModel().storage).toBe('FAILED');
    expect(noticeKinds(f)).toEqual(['STORAGE_WRITE_FAILED']);
  });

  it('no store or no clock: behaviour as before (no read, no write, no notice, no offer)', () => {
    for (const o of [{ noStore: true }, { noClock: true }, { noStore: true, noClock: true }] as const) {
      const r = rig({ ...o, init: { [SAVE_KEY]: serializeSave(envelopeOf(1, configFor(1), [])) } });
      expect(r.ctl.getModel()).toMatchObject({ storage: 'UNKNOWN', resume: null, notices: [], setupPrefs: DEFAULT_SETUP_PREFS });
      r.ctl.startGame({ config: configFor(1), seed: 5 });
      r.ctl.setLanguage('ko');
      r.ctl.setSetupPrefs({ ...DEFAULT_SETUP_PREFS, humanCount: 2 });
      driveToEnd(r);
      expect(r.rec.saveSets + r.rec.prefSets + r.rec.removes).toBe(0);
      expect(r.ctl.getModel().storage).toBe('UNKNOWN');
      expect(r.ctl.getModel().notices).toEqual([]);
      expect(r.ctl.continueSaved()).toEqual({ ok: false, reason: 'NO_RESUME' });
    }
  });
});

function envelopeOf(seed: number, config: GameConfig, actions: readonly Action[]): SaveEnvelope {
  return { format: SAVE_FORMAT, saveVersion: SAVE_VERSION, rulesVersion: RULES_VERSION, savedAtIso: NOW, seed, config, actions };
}

// ---------------------------------------------------------------------------------------------------------
// Startup: discarded saves, read failures, notices
// ---------------------------------------------------------------------------------------------------------

describe('startup', () => {
  const good = (): string => savedTextAfter(1, 61, (r) => r.ctl.getModel().actionCount >= 3);
  const mutate = (f: (o: Record<string, unknown>) => void): string => {
    const o = JSON.parse(good()) as Record<string, unknown>;
    f(o);
    return JSON.stringify(o);
  };
  const ended = (): string => {
    const g = playGame({ seed: 62, config: configFor(1), strategies: strategiesFor({ P0: 'BEGINNER', P1: 'BEGINNER', P2: 'BEGINNER', P3: 'BEGINNER' }) });
    return serializeSave(envelopeOf(62, configFor(1), g.log));
  };

  const cases: [string, () => string][] = [
    ['CORRUPT', () => '{not json'],
    ['SAVE_VERSION', () => mutate((o) => (o.saveVersion = 99))],
    ['RULES_VERSION', () => mutate((o) => (o.rulesVersion = 99))],
    ['REPLAY_REJECTED', () => serializeSave(envelopeOf(1, configFor(1), [{ type: 'ACK_REVEAL' }]))],
    ['GAME_ENDED', ended],
  ];
  for (const [reason, makeText] of cases) {
    it(`${reason}: SAVE_DISCARDED with the closed reason, the bad save removed, preferences untouched, normal setup`, () => {
      const text = makeText();
      const prefsStore = memoryStore();
      writePrefs(prefsStore, { language: 'en', setup: DEFAULT_SETUP_PREFS });
      const prefs = prefsStore.getItem(PREFS_KEY) as string;
      const again = rig({ init: { [SAVE_KEY]: text, [PREFS_KEY]: prefs }, durable: true });
      const model = again.ctl.getModel();
      expect(model.notices).toEqual([{ kind: 'SAVE_DISCARDED', reason }]);
      expect(model.resume).toBeNull();
      expect(model.screen).toBe('SETUP');
      expect(again.rec.inner.getItem(SAVE_KEY)).toBeNull();
      expect(again.rec.inner.getItem(PREFS_KEY)).toBe(prefs);
      expect(again.ctl.continueSaved()).toEqual({ ok: false, reason: 'NO_RESUME' });
      expect(again.sched.pending).toBe(0);
      // the notice carries only the closed codes
      expect(JSON.stringify(model.notices)).not.toContain('actions');
    });
  }

  it('a failed READ is a notice and removes nothing', () => {
    // the failure must exist BEFORE startup, so the wrapper is built by hand
    const rec = new Rec(memoryStore({ [SAVE_KEY]: good() }), [], false);
    rec.failReadSave = true;
    const ctl = createController({
      schedule: () => ({ cancel: () => undefined }),
      renderer: () => undefined,
      randomSeed: () => 1,
      language: () => 'en',
      store: rec.store,
      nowIso,
    });
    expect(ctl.getModel().notices.map((n) => n.kind).sort()).toEqual(['STORAGE_NOT_DURABLE', 'STORAGE_READ_FAILED']);
    expect(ctl.getModel().resume).toBeNull();
    expect(rec.removes).toBe(0);
    expect(memoryStoreHas(rec.inner)).toBe(true);
    ctl.dismissNotice('STORAGE_READ_FAILED');
    expect(ctl.getModel().notices.map((n) => n.kind)).toEqual(['STORAGE_NOT_DURABLE']);
  });

  it('a non-durable store gives STORAGE_NOT_DURABLE from startup, a durable one does not', () => {
    expect(noticeKinds(rig({ durable: false }))).toEqual(['STORAGE_NOT_DURABLE']);
    expect(noticeKinds(rig({ durable: 'absent' }))).toEqual(['STORAGE_NOT_DURABLE']);
    expect(noticeKinds(rig({ durable: true }))).toEqual([]);
  });

  it('dismissNotice dismisses only SAVE_DISCARDED and STORAGE_READ_FAILED', () => {
    const r = rig({ init: { [SAVE_KEY]: '{bad' }, durable: false });
    expect(noticeKinds(r).sort()).toEqual(['SAVE_DISCARDED', 'STORAGE_NOT_DURABLE']);
    r.ctl.dismissNotice('STORAGE_NOT_DURABLE');
    r.ctl.dismissNotice('STORAGE_WRITE_FAILED');
    expect(noticeKinds(r).sort()).toEqual(['SAVE_DISCARDED', 'STORAGE_NOT_DURABLE']);
    const count = r.renders.length;
    r.ctl.dismissNotice('STORAGE_READ_FAILED'); // not present: no change, no render
    expect(r.renders.length).toBe(count);
    r.ctl.dismissNotice('SAVE_DISCARDED');
    expect(noticeKinds(r)).toEqual(['STORAGE_NOT_DURABLE']);
    // a failed write notice is not dismissible either
    r.ctl.startGame({ config: configFor(1), seed: 9 });
    r.rec.failSave = new Error('x');
    stepOnce(r);
    r.ctl.dismissNotice('STORAGE_WRITE_FAILED');
    expect(noticeKinds(r)).toContain('STORAGE_WRITE_FAILED');
  });
});

function memoryStoreHas(store: KeyValueStore): boolean {
  return store.getItem(SAVE_KEY) !== null;
}

// ---------------------------------------------------------------------------------------------------------
// Resume
// ---------------------------------------------------------------------------------------------------------

type Cut = 'PLACEMENT_EMPTY' | 'PLACEMENT_MID' | 'GUESS_0' | 'GUESS_PARTIAL' | 'REVEAL';
const CUTS: readonly Cut[] = ['PLACEMENT_EMPTY', 'PLACEMENT_MID', 'GUESS_0', 'GUESS_PARTIAL', 'REVEAL'];

const cutReached = (r: Rig, cut: Cut): boolean => {
  const phase = phaseOf(r);
  const count = r.ctl.getModel().actionCount;
  switch (cut) {
    case 'PLACEMENT_EMPTY':
      return count === 0;
    case 'PLACEMENT_MID':
      return phase === 'PLACEMENT' && count >= 7;
    case 'GUESS_0':
      return phase === 'GUESS_COLLECT' && submittedCount(r) === 0;
    case 'GUESS_PARTIAL':
      return phase === 'GUESS_COLLECT' && submittedCount(r) >= 1 && submittedCount(r) < 4;
    case 'REVEAL':
      return phase === 'REVEAL';
  }
};

/**
 * A game cut at cut. Some seeds never form a code with these placements, so the cut may be unreachable: the first of
 * the next 40 seeds that reaches it is used (deterministic).
 */
function cutRig(humans: 1 | 2 | 4, visibility: IdentityVisibility, cut: Cut, seed: number): Rig {
  for (let k = 0; k < 40; k++) {
    const r = rig();
    r.ctl.startGame({ config: configFor(humans, visibility), seed: seed + k });
    for (let i = 0; i < 3000 && !cutReached(r, cut); i++) if (!stepOnce(r)) break;
    if (cutReached(r, cut)) return r;
  }
  throw new Error('no seed reaches the cut ' + cut);
}

const seedOf = (r: Rig): number => ((parseSave(r.rec.inner.getItem(SAVE_KEY) as string) as { envelope: SaveEnvelope }).envelope.seed);
/** The gate the controller must show after a resume, derived independently from the original game. */
function expectedGate(r: Rig, cfg: GameConfig): { forSeat: PlayerId; purpose: string } | null {
  if (cfg.seats.filter((s) => s.kind === 'HUMAN').length < 2) return null;
  const view = r.ctl.getView('P0') as PlayerView;
  const human = (id: PlayerId): boolean => cfg.seats.find((s) => s.id === id)?.kind === 'HUMAN';
  if (view.phase === 'PLACEMENT' && human(view.turn)) return { forSeat: view.turn, purpose: 'HAND' };
  if (view.phase === 'GUESS_COLLECT') {
    const seat = SEATS.find((s) => human(s) && !view.guessSubmitted[s]);
    return seat === undefined ? null : { forSeat: seat, purpose: 'GUESS' };
  }
  return null;
}

describe('resume offer and continueSaved', () => {
  for (const humans of [1, 2, 4] as const) {
    for (const visibility of ['OWNER_ONLY', 'FACE_UP'] as const) {
      for (const cut of CUTS) {
        it(`${humans} human(s), ${visibility}, saved in ${cut}: offer, same views after Continue, same result when both games finish`, () => {
          const seed = 987654 + humans * 10 + CUTS.indexOf(cut);
          const cfg = configFor(humans, visibility);
          const original = cutRig(humans, visibility, cut, seed);
          const text = original.rec.inner.getItem(SAVE_KEY) as string;

          const copy = rig({ init: { [SAVE_KEY]: text } });
          const offer = copy.ctl.getModel();
          expect(offer.resume).toEqual({ savedAtIso: NOW, humanSeats: humans });
          expect(offer.screen).toBe('SETUP');
          expect(offer.actionCount).toBe(0);
          expect(copy.ctl.getView('P0')).toBeNull();
          const first = copy.renders[0] as RenderInput;
          expect(first.view).toBeNull();
          expect(first.publicView).toBeNull();
          expect(first.seed).toBeNull(); // no seed of the saved game is exposed by the offer
          expect(copy.sched.pending).toBe(0);
          expect(copy.rec.saveSets).toBe(0);

          expect(copy.ctl.continueSaved()).toEqual({ ok: true });
          expect(copy.rec.saveSets).toBe(0); // no new write until the next accepted Action
          expect(copy.rec.removes).toBe(0);
          const resumed = copy.ctl.getModel();
          expect(resumed.screen).toBe('GAME');
          expect(resumed.resume).toBeNull();
          expect(resumed.actionCount).toBe(original.ctl.getModel().actionCount);
          for (const seat of SEATS) expect(copy.ctl.getView(seat)).toEqual(original.ctl.getView(seat));

          const gate = expectedGate(original, cfg);
          if (humans === 1) {
            expect(resumed.gate).toBeNull();
            expect(resumed.viewer).toBe('P0');
          } else if (gate !== null) {
            expect(resumed.viewer).toBeNull();
            expect(resumed.gate).toMatchObject(gate);
            expect(copy.renders[copy.renders.length - 1]!.view).toBeNull();
            expect(copy.renders[copy.renders.length - 1]!.publicView).not.toBeNull();
          } else {
            expect(resumed.gate).toBeNull(); // an AI turn or REVEAL: nothing private is shown
            expect(resumed.viewer).toBeNull();
          }
          // AI resumes when an AI must act
          const aiToAct = original.sched.pending > 0;
          expect(copy.sched.pending > 0).toBe(aiToAct);

          driveToEnd(original);
          driveToEnd(copy);
          const a = original.ctl.getView('P0') as PlayerView;
          const b = copy.ctl.getView('P0') as PlayerView;
          expect(b.phase).toBe('ENDED');
          expect(b.scores).toEqual(a.scores);
          expect(b.ranking).toEqual(a.ranking);
          for (const seat of SEATS) expect(copy.ctl.getView(seat)).toEqual(original.ctl.getView(seat));
          expect(copy.rec.inner.getItem(SAVE_KEY)).toBeNull();
        });
      }
    }
  }

  it('ENDED saves are never offered', () => {
    const ended = playGame({ seed: 70, config: configFor(2), strategies: strategiesFor({ P0: 'BEGINNER', P1: 'BEGINNER', P2: 'BEGINNER', P3: 'BEGINNER' }) });
    const r = rig({ init: { [SAVE_KEY]: serializeSave(envelopeOf(70, configFor(2), ended.log)) }, durable: true });
    expect(r.ctl.getModel().resume).toBeNull();
    expect(r.ctl.getModel().notices).toEqual([{ kind: 'SAVE_DISCARDED', reason: 'GAME_ENDED' }]);
  });

  for (const humans of [2, 4] as const) {
    it(`${humans} humans: the gate comes first; acknowledgeGate shows exactly that seat's view; submitted flags equal the replayed state`, () => {
      const cfg = configFor(humans);
      const original = cutRig(humans, 'OWNER_ONLY', 'GUESS_PARTIAL', 4242 + humans);
      const copy = rig({ init: { [SAVE_KEY]: original.rec.inner.getItem(SAVE_KEY) as string } });
      copy.ctl.continueSaved();
      const model = copy.ctl.getModel();
      const gate = expectedGate(original, cfg);
      expect(gate).not.toBeNull();
      expect(gate?.purpose).toBe('GUESS');
      expect(model.gate).toMatchObject(gate as object);
      expect(model.viewer).toBeNull();
      const input = copy.renders[copy.renders.length - 1] as RenderInput;
      expect(input.view).toBeNull();
      const pub = input.publicView as PlayerView;
      expect(pub).not.toBeNull();
      expect(pub.myHand).toEqual([]);
      expect(pub.myGuesses).toBeNull();
      expect(pub.guessSubmitted).toEqual((original.ctl.getView('P0') as PlayerView).guessSubmitted);

      // serialization scan: no Hand card, no owner-only identity in anything the screens receive during the gate
      const text = dump(input);
      for (const seat of SEATS) for (const card of (original.ctl.getView(seat) as PlayerView).myHand) expect(text.includes(`"${card}"`), card).toBe(false);
      const views = SEATS.map((s) => original.ctl.getView(s) as PlayerView);
      views[0]!.board.forEach((_, i) => {
        const seen = views.map((v) => v.board[i]?.card != null);
        if (seen.some(Boolean) && !seen.every(Boolean)) expect(pub.board[i]?.card).toBeNull();
      });
      expect(JSON.stringify(input.model)).not.toMatch(/guesses/i);

      // a dispatch around the gate is refused and writes nothing
      expect(copy.ctl.dispatchHuman({ type: 'ACK_REVEAL' })).toEqual({ ok: false, reason: 'STALE_GATE' });
      expect(copy.rec.saveSets).toBe(0);
      // an older or foreign binding is stale
      const gateSeat = model.gate!.forSeat;
      const other = SEATS.find((s) => s !== gateSeat) as PlayerId;
      expect(copy.ctl.acknowledgeGate({ forSeat: gateSeat, purpose: 'GUESS', actionCount: model.actionCount - 1 })).toEqual({ ok: false, reason: 'STALE_GATE' });
      expect(copy.ctl.acknowledgeGate({ forSeat: other, purpose: 'GUESS', actionCount: model.actionCount })).toEqual({ ok: false, reason: 'STALE_GATE' });
      expect(copy.ctl.getModel().viewer).toBeNull();
      expect(copy.ctl.acknowledgeGate({ forSeat: gateSeat, purpose: 'GUESS', actionCount: model.actionCount })).toEqual({ ok: true });
      expect(copy.ctl.getModel().viewer).toBe(gateSeat);
      expect(copy.ctl.getModel().gate).toBeNull();
      const shown = copy.renders[copy.renders.length - 1] as RenderInput;
      expect(shown.view).toEqual(original.ctl.getView(gateSeat));
      expect(shown.view?.viewer).toBe(gateSeat);
    });
  }

  it('2 humans: a gate acknowledgement taken in an earlier game is STALE_GATE after the resume', () => {
    const earlier = rig();
    earlier.ctl.startGame({ config: configFor(2), seed: 515 });
    for (let i = 0; i < 200 && earlier.ctl.getModel().gate === null; i++) expect(stepOnce(earlier)).toBe(true);
    const gate = earlier.ctl.getModel().gate;
    expect(gate).not.toBeNull();
    const stale = { forSeat: gate!.forSeat, purpose: gate!.purpose, actionCount: earlier.ctl.getModel().actionCount };
    const original = cutRig(2, 'OWNER_ONLY', 'GUESS_PARTIAL', 515);
    const copy = rig({ init: { [SAVE_KEY]: original.rec.inner.getItem(SAVE_KEY) as string } });
    expect(copy.ctl.acknowledgeGate(stale)).toEqual({ ok: false, reason: 'NO_GAME' }); // nothing runs before the resume
    copy.ctl.continueSaved();
    expect(copy.ctl.getModel().actionCount).not.toBe(stale.actionCount);
    expect(copy.ctl.acknowledgeGate(stale)).toEqual({ ok: false, reason: 'STALE_GATE' });
    expect(copy.ctl.getModel().viewer).toBeNull();
  });

  it('1 human: no gate; the AI resumes and the game ends', () => {
    const original = cutRig(1, 'OWNER_ONLY', 'GUESS_0', 616);
    const copy = rig({ init: { [SAVE_KEY]: original.rec.inner.getItem(SAVE_KEY) as string } });
    copy.ctl.continueSaved();
    expect(copy.ctl.getModel().gate).toBeNull();
    expect(copy.ctl.getModel().viewer).toBe('P0');
    expect(copy.sched.pending).toBe(1);
    driveToEnd(copy);
    expect(copy.ctl.getModel().screen).toBe('END');
  });

  it('REVEAL with a human waits for the human: no AI step is scheduled', () => {
    const original = cutRig(1, 'OWNER_ONLY', 'REVEAL', 717);
    const copy = rig({ init: { [SAVE_KEY]: original.rec.inner.getItem(SAVE_KEY) as string } });
    copy.ctl.continueSaved();
    expect(copy.sched.pending).toBe(0);
    expect(copy.ctl.dispatchHuman({ type: 'ACK_REVEAL' })).toEqual({ ok: true });
    expect(copy.rec.saveSets).toBe(1);
  });

  it('after Continue the next accepted Action writes the whole log (save == replay of the resumed game)', () => {
    const cfg = configFor(2, 'FACE_UP');
    const original = cutRig(2, 'FACE_UP', 'PLACEMENT_MID', 818);
    const copy = rig({ init: { [SAVE_KEY]: original.rec.inner.getItem(SAVE_KEY) as string } });
    copy.ctl.continueSaved();
    for (let i = 0; i < 6; i++) {
      expect(stepOnce(copy)).toBe(true);
    }
    expectSavedMatches(copy, seedOf(original), cfg);
  });
});

describe('continueSaved and discardSaved guards', () => {
  let cached: string | null = null;
  const savedText = (): string => (cached ??= savedTextAfter(2, 919, (r) => r.ctl.getModel().actionCount >= 4));
  const offered = (o: RigOptions = {}): Rig => rig({ init: { [SAVE_KEY]: savedText() }, ...o });

  it('continueSaved is single use; discardSaved after it is NO_RESUME', () => {
    const r = offered();
    expect(r.ctl.continueSaved()).toEqual({ ok: true });
    expect(r.ctl.continueSaved()).toEqual({ ok: false, reason: 'NO_RESUME' });
    expect(r.ctl.discardSaved()).toEqual({ ok: false, reason: 'NO_RESUME' });
    expect(r.rec.inner.getItem(SAVE_KEY)).toBe(savedText()); // untouched
  });

  it('discardSaved removes only the save, keeps the preferences, shows the normal setup, and is single use', () => {
    const r = offered();
    writePrefs(r.rec.inner, { language: 'ko', setup: { humanCount: 3 } });
    const prefs = r.rec.inner.getItem(PREFS_KEY);
    expect(r.ctl.discardSaved()).toEqual({ ok: true });
    expect(r.rec.inner.getItem(SAVE_KEY)).toBeNull();
    expect(r.rec.inner.getItem(PREFS_KEY)).toBe(prefs);
    expect(r.ctl.getModel().resume).toBeNull();
    expect(r.ctl.getModel().screen).toBe('SETUP');
    expect(r.ctl.discardSaved()).toEqual({ ok: false, reason: 'NO_RESUME' });
    expect(r.ctl.continueSaved()).toEqual({ ok: false, reason: 'NO_RESUME' });
  });

  it('a failed removal in discardSaved gives FAILED and a notice, and the offer is still dropped', () => {
    const r = offered({ durable: true });
    r.rec.failRemove = new Error('x');
    expect(r.ctl.discardSaved()).toEqual({ ok: true });
    expect(r.ctl.getModel().storage).toBe('FAILED');
    expect(noticeKinds(r)).toEqual(['STORAGE_WRITE_FAILED']);
    expect(r.ctl.getModel().resume).toBeNull();
  });

  it('refuses with DISPOSED after dispose and NO_RESUME after abandon', () => {
    const a = offered();
    expect(a.ctl.abandon()).toEqual({ ok: true });
    expect(a.rec.inner.getItem(SAVE_KEY)).toBeNull();
    expect(a.ctl.getModel().resume).toBeNull();
    expect(a.ctl.continueSaved()).toEqual({ ok: false, reason: 'NO_RESUME' });
    expect(a.ctl.discardSaved()).toEqual({ ok: false, reason: 'NO_RESUME' });

    const d = offered();
    d.ctl.dispose();
    expect(d.ctl.continueSaved()).toEqual({ ok: false, reason: 'DISPOSED' });
    expect(d.ctl.discardSaved()).toEqual({ ok: false, reason: 'DISPOSED' });
    const handlers = d.renders[0]!.handlers;
    expect(handlers.continueSaved()).toEqual({ ok: false, reason: 'DISPOSED' });
    expect(handlers.discardSaved()).toEqual({ ok: false, reason: 'DISPOSED' });
    expect(d.rec.inner.getItem(SAVE_KEY)).toBe(savedText());
  });

  it('re-entrant calls from inside a render are BUSY and change nothing', () => {
    const c = offered();
    const results: unknown[] = [];
    c.hook = (input) => {
      if (input.model.screen === 'GAME') results.push(c.ctl.discardSaved(), c.ctl.continueSaved());
    };
    expect(c.ctl.continueSaved()).toEqual({ ok: true });
    expect(results).toEqual([
      { ok: false, reason: 'BUSY' },
      { ok: false, reason: 'BUSY' },
    ]);

    const d = offered();
    const seen: unknown[] = [];
    d.hook = (input) => {
      if (input.model.resume === null) seen.push(d.ctl.continueSaved(), d.ctl.discardSaved());
    };
    expect(d.ctl.discardSaved()).toEqual({ ok: true });
    expect(seen).toEqual([
      { ok: false, reason: 'BUSY' },
      { ok: false, reason: 'BUSY' },
    ]);
    expect(d.ctl.getModel().screen).toBe('SETUP');
  });

  const options: SetupOptions = { ...DEFAULT_SETUP_PREFS, seedText: '424242' };

  it('a start from setup drops the offer and overwrites the save', () => {
    const r = offered();
    expect(r.ctl.startFromSetup(options)).toEqual({ ok: true });
    expect(r.ctl.getModel().resume).toBeNull();
    expect(r.ctl.continueSaved()).toEqual({ ok: false, reason: 'NO_RESUME' });
    expect(r.ctl.discardSaved()).toEqual({ ok: false, reason: 'NO_RESUME' });
    const saved = parseSave(r.rec.inner.getItem(SAVE_KEY) as string);
    if (saved.kind !== 'OK') throw new Error('not saved');
    expect(saved.envelope.actions).toEqual([]);
    expect(saved.envelope.seed).not.toBe((parseSave(savedText()) as { envelope: SaveEnvelope }).envelope.seed);
  });

  it('startGame, restart-less practice and replay also drop the offer', () => {
    const r = offered();
    expect(r.ctl.startPracticeGame({ seed: 3 })).toEqual({ ok: true });
    expect(r.ctl.getModel().resume).toBeNull();
    expect(r.ctl.continueSaved()).toEqual({ ok: false, reason: 'NO_RESUME' });
  });

  it('a start the engine rejects keeps the offer and the save', () => {
    const r = offered();
    const bad = r.ctl.startGame({ config: { ...defaultConfig(), seats: [] } as unknown as GameConfig, seed: 1 });
    expect(bad.ok).toBe(false);
    expect(r.ctl.startFromSetup({ ...options, humanCount: 9 })).toMatchObject({ ok: false, reason: 'ENGINE', code: 'INVALID_CONFIG' });
    expect(r.ctl.getModel().resume).toEqual({ savedAtIso: NOW, humanSeats: 2 });
    expect(r.rec.inner.getItem(SAVE_KEY)).toBe(savedText());
    expect(r.rec.saveSets).toBe(0);
    expect(r.ctl.continueSaved()).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------------------------------------

describe('preferences', () => {
  it('stored language and setup prefs are applied at startup', () => {
    const store = memoryStore();
    writePrefs(store, { language: 'ko', setup: { humanCount: 3, difficulties: ['BEGINNER', 'ADVANCED', 'BEGINNER', 'ADVANCED'], identityVisibility: 'FACE_UP' } });
    const r = rig({ init: { [PREFS_KEY]: store.getItem(PREFS_KEY) as string }, language: 'en' });
    expect(r.ctl.getModel().language).toBe('ko');
    expect(getLanguage()).toBe('ko');
    expect(r.ctl.getModel().setupPrefs).toEqual({
      humanCount: 3,
      difficulties: ['BEGINNER', 'ADVANCED', 'BEGINNER', 'ADVANCED'],
      identityVisibility: 'FACE_UP',
    });
    expect(r.renders[0]!.model.language).toBe('ko');
  });

  it('garbage preferences fall back without a crash', () => {
    const garbage = [
      '}{',
      JSON.stringify({ prefsVersion: 1, language: 'xx', setup: { humanCount: 99, difficulties: 'x', identityVisibility: 7 } }),
      JSON.stringify({ prefsVersion: 1, language: 42, setup: [1, 2] }),
    ];
    for (const text of garbage) {
      const r = rig({ init: { [PREFS_KEY]: text }, language: 'en' });
      expect(r.ctl.getModel().language).toBe('en');
      expect(r.ctl.getModel().setupPrefs).toEqual(sanitizeSetupPrefs(null));
      expect(r.ctl.getModel().notices).toEqual([{ kind: 'STORAGE_NOT_DURABLE' }]);
    }
  });

  it('setLanguage writes the language and keeps the setup prefs', () => {
    const r = rig();
    r.ctl.setSetupPrefs({ ...DEFAULT_SETUP_PREFS, humanCount: 2 });
    r.ctl.setLanguage('ko');
    expect(readPrefs(r.rec.inner)).toEqual({ language: 'ko', setup: sanitizeSetupPrefs({ humanCount: 2 }) });
    expect(r.ctl.getModel().language).toBe('ko');
  });

  it('setSetupPrefs sanitizes, updates the model and writes no seed', () => {
    const r = rig();
    r.ctl.setSetupPrefs({ humanCount: 4, difficulties: ['EXPERT', 'ADVANCED', 'x', 'BEGINNER'], identityVisibility: 'FACE_UP', seedText: 'secret-seed', extra: 1 } as never);
    const model = r.ctl.getModel();
    expect(model.setupPrefs.humanCount).toBe(4);
    expect(model.setupPrefs.difficulties).toEqual([sanitizeSetupPrefs(null).difficulties[0], 'ADVANCED', sanitizeSetupPrefs(null).difficulties[0], 'BEGINNER']);
    expect(Object.keys(model.setupPrefs).sort()).toEqual(['difficulties', 'humanCount', 'identityVisibility']);
    const text = r.rec.inner.getItem(PREFS_KEY) as string;
    expect(text).not.toContain('secret');
    expect(readPrefs(r.rec.inner).setup).toEqual(model.setupPrefs);
  });

  it('a successful startFromSetup writes the prefs (language and setup, never the seed text)', () => {
    const r = rig({ language: 'ko' });
    const options: SetupOptions = { ...DEFAULT_SETUP_PREFS, humanCount: 2, seedText: '31415926' };
    expect(r.ctl.startFromSetup(options)).toEqual({ ok: true });
    const text = r.rec.inner.getItem(PREFS_KEY) as string;
    expect(text).not.toContain('31415926');
    expect(readPrefs(r.rec.inner)).toEqual({ language: 'ko', setup: sanitizeSetupPrefs(options) });
    // a rejected start writes no prefs
    const bad = rig();
    expect(bad.ctl.startFromSetup({ ...options, humanCount: 9 }).ok).toBe(false);
    expect(bad.rec.prefSets).toBe(0);
  });

  it('a throwing prefs write is silent', () => {
    const r = rig();
    r.rec.failPrefs = new Error('no');
    expect(() => {
      r.ctl.setLanguage('ko');
      r.ctl.setSetupPrefs({ ...DEFAULT_SETUP_PREFS, humanCount: 3 });
      r.ctl.startFromSetup({ ...DEFAULT_SETUP_PREFS, seedText: '5' });
    }).not.toThrow();
    expect(r.ctl.getModel().language).toBe('ko');
    expect(r.ctl.getModel().setupPrefs.humanCount).toBe(3);
    expect(r.ctl.getModel().storage).not.toBe('FAILED'); // a prefs failure is not a save failure
    expect(noticeKinds(r)).not.toContain('STORAGE_WRITE_FAILED');
  });

  it('preferences survive discard, an ended game and a discarded corrupt save', () => {
    const prefs = new Rec(memoryStore(), [], false);
    writePrefs(prefs.inner, { language: 'ko', setup: { humanCount: 2 } });
    const saved = prefs.inner.getItem(PREFS_KEY) as string;
    const text = savedTextAfter(1, 5, (r) => r.ctl.getModel().actionCount >= 2);
    const discard = rig({ init: { [SAVE_KEY]: text, [PREFS_KEY]: saved } });
    discard.ctl.discardSaved();
    expect(discard.rec.inner.getItem(PREFS_KEY)).toBe(saved);
    const corrupt = rig({ init: { [SAVE_KEY]: 'zzz', [PREFS_KEY]: saved } });
    expect(corrupt.rec.inner.getItem(PREFS_KEY)).toBe(saved);
    const ended = rig({ init: { [PREFS_KEY]: saved } });
    ended.ctl.startGame({ config: configFor(1), seed: 6 });
    driveToEnd(ended);
    expect(ended.rec.inner.getItem(PREFS_KEY)).toBe(saved);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------------------------------------

describe('privacy before the first accepted step of a resumed game', () => {
  it('startup, offer, notices and prompt phases expose no card, Guess, seed or stored text', () => {
    const original = cutRig(4, 'FACE_UP', 'GUESS_PARTIAL', 987654);
    const seed = seedOf(original);
    const text = original.rec.inner.getItem(SAVE_KEY) as string;
    const env = (parseSave(text) as { envelope: SaveEnvelope }).envelope;
    const r = rig({ init: { [SAVE_KEY]: text }, durable: false });
    r.ctl.setLanguage('ko'); // more renders during the offer
    r.ctl.setSetupPrefs({ ...DEFAULT_SETUP_PREFS, humanCount: 2 });
    r.ctl.dismissNotice('SAVE_DISCARDED');
    expect(r.ctl.getModel().resume).not.toBeNull();

    const fragments = [String(seed), '"qroker-save"', '"actions"', ...env.actions.slice(0, 6).map((a) => JSON.stringify(a)), ...SEATS.flatMap((s) => (original.ctl.getView(s) as PlayerView).myHand.map((c) => `"${c}"`))];
    expect(r.renders.length).toBeGreaterThan(2);
    for (const input of r.renders) {
      expect(input.view).toBeNull();
      expect(input.publicView).toBeNull();
      expect(input.seed).toBeNull();
      const out = dump(input);
      for (const f of fragments) expect(out.includes(f), f).toBe(false);
      for (const card of ALL_CARDS) expect(out.includes(`"${card}"`), card).toBe(false);
      expect(out).not.toMatch(/guesses|"hands"|"log"|"deck"/i);
    }
    // the model holds the saved time and the number of human seats, nothing else of the save
    expect(r.ctl.getModel().resume).toEqual({ savedAtIso: NOW, humanSeats: 4 });
    expect(r.ctl.getModel().notices.every((n) => ['STORAGE_NOT_DURABLE', 'STORAGE_WRITE_FAILED', 'STORAGE_READ_FAILED', 'SAVE_DISCARDED'].includes(n.kind))).toBe(true);
  });

  it('no stored text, error or state reaches the model after a failed save', () => {
    const r = rig({ durable: true });
    r.rec.failSave = new Error('secret-store-detail 987654');
    r.ctl.startGame({ config: configFor(1), seed: 987654 });
    stepOnce(r);
    for (const input of r.renders) {
      const out = JSON.stringify(input.model);
      expect(out).not.toContain('secret-store-detail');
      expect(out).not.toContain('"actions"');
    }
    expect(r.ctl.getModel().notices).toEqual([{ kind: 'STORAGE_WRITE_FAILED' }]);
  });
});
