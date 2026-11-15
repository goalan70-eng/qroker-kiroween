// Tests of the UI controller (task 16.2). They run in Node WITHOUT a DOM library (happy-dom arrives with task 21.1).
//
//  * controller tests use a stub renderer that records exactly what a screen would receive, plus a deterministic
//    test scheduler (a queue drained by hand) and an immediate scheduler;
//  * the mountApp tests use a minimal hand-written fake Document. They test the wiring against a stand-in, NOT a
//    browser: real focus, layout and event dispatch are not exercised.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { getStrategy } from '../ai/registry';
import type { AIStrategy } from '../ai/strategy';
import { ALL_CARDS } from '../core/cards';
import { defaultConfig } from '../core/state';
import { SEATS } from '../core/turn';
import type { Action, CardId, Difficulty, GameConfig, IdentityVisibility, PlayerId } from '../core/types';
import { legalCellsFor } from '../core/view';
import type { PlayerView } from '../core/view';
import { getLanguage, resetLanguage, t } from '../i18n';
import { playGame, strategiesFor } from '../sim/play-game';
import * as controllerModule from './controller';
import { AI_DELAY_MS, createController, mountApp } from './controller';
import type { AppDeps, Controller, OpResult, RenderInput, Renderer, Schedule, ScheduleHandle } from './controller';

afterEach(() => resetLanguage());

// ---------------------------------------------------------------------------------------------------------
// Helpers: schedulers, stub renderer, configurations
// ---------------------------------------------------------------------------------------------------------

/** Queue scheduler: nothing runs until `step`/`drain`. Tracks how many callbacks are pending and cancellations. */
class QueueScheduler {
  readonly queue: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  scheduled = 0;
  cancellations = 0;
  maxPending = 0;
  readonly delays: number[] = [];

  readonly schedule: Schedule = (fn, ms) => {
    const entry = { fn, ms, cancelled: false };
    this.queue.push(entry);
    this.scheduled++;
    this.delays.push(ms);
    this.maxPending = Math.max(this.maxPending, this.queue.length);
    return {
      cancel: () => {
        if (entry.cancelled) return;
        entry.cancelled = true;
        const at = this.queue.indexOf(entry);
        if (at >= 0) {
          this.queue.splice(at, 1);
          this.cancellations++;
        }
      },
    } satisfies ScheduleHandle;
  };
  get pending(): number {
    return this.queue.length;
  }
  step(): boolean {
    const entry = this.queue.shift();
    if (entry === undefined) return false;
    entry.fn();
    return true;
  }
  drain(limit = 2000): number {
    let n = 0;
    while (n < limit && this.step()) n++;
    return n;
  }
}

/** Immediate scheduler: the callback runs inside `schedule`. */
const immediate: Schedule = (fn) => {
  fn();
  return { cancel: () => undefined };
};

class Stub {
  readonly calls: RenderInput[] = [];
  hook: ((input: RenderInput) => void) | null = null;
  readonly renderer: Renderer = (input) => {
    this.calls.push(input);
    this.hook?.(input);
  };
  get last(): RenderInput {
    return this.calls[this.calls.length - 1] as RenderInput;
  }
}

function make(schedule: Schedule, extra: Partial<AppDeps> = {}) {
  const stub = new Stub();
  let seed = 100;
  const ctl = createController({
    schedule,
    renderer: stub.renderer,
    randomSeed: () => seed++,
    language: () => 'en',
    ...extra,
  });
  return { ctl, stub };
}

function seatsOf(kinds: readonly ('HUMAN' | Difficulty)[]): GameConfig['seats'] {
  return kinds.map((k, i) =>
    k === 'HUMAN'
      ? { id: SEATS[i] as PlayerId, kind: 'HUMAN', name: `Human ${i}` }
      : { id: SEATS[i] as PlayerId, kind: 'AI', difficulty: k, name: `AI ${i}` },
  ) as unknown as GameConfig['seats'];
}

function config(kinds: readonly ('HUMAN' | Difficulty)[], visibility?: IdentityVisibility): GameConfig {
  const base = defaultConfig();
  return { ...base, seats: seatsOf(kinds), identityVisibility: visibility ?? base.identityVisibility };
}

const ALL_AI: readonly Difficulty[] = ['BEGINNER', 'BEGINNER', 'BEGINNER', 'BEGINNER'];

/** What a person at seat P0 would do, decided by the ADVANCED strategy from the person's own view. */
function humanAction(view: PlayerView, guess = 20): Action | null {
  const ctx = { decisionSeed: view.board.filter((c) => c !== null).length + view.history.length * 1000 };
  if (view.phase === 'PLACEMENT' && view.turn === view.viewer) return getStrategy('ADVANCED').choosePlacement(view, ctx);
  if (view.phase === 'GUESS_COLLECT' && !view.guessSubmitted[view.viewer]) {
    return { type: 'SUBMIT_GUESSES', player: view.viewer, guesses: Object.fromEntries(view.pendingQuadKeys.map((k) => [k, guess])) };
  }
  if (view.phase === 'REVEAL') return { type: 'ACK_REVEAL' };
  return null;
}

/** Plays the human seat P0 until the game ends. `waits` records the phases in which the controller waited for P0. */
function playHuman(ctl: Controller, sched: QueueScheduler | null, guess = 20): Set<string> {
  const waits = new Set<string>();
  for (let i = 0; i < 800; i++) {
    sched?.drain();
    const view = ctl.getView('P0') as PlayerView;
    if (view.phase === 'ENDED') return waits;
    const action = humanAction(view, guess);
    if (action === null) throw new Error(`stuck in ${view.phase}, turn ${view.turn}`);
    if (sched !== null) expect(sched.pending, `a pending AI step while P0 must act (${view.phase})`).toBe(0);
    waits.add(`${view.phase}`);
    const result = ctl.dispatchHuman(action);
    expect(result, JSON.stringify(action)).toEqual({ ok: true });
  }
  throw new Error('game did not end');
}

const BANNED_KEYS = new Set([
  'seed', 'deck', 'hands', 'log', 'pending', 'groupId', 'scoredGroups', 'guesses', 'firstPlacementDone',
  'revealedCards', 'bonusAwarded', 'placements', 'state', 'game',
]);

/** Paths of banned keys in a value, walking own enumerable keys of objects and arrays (functions are skipped). */
function bannedKeyPaths(value: unknown, path = '$', seen = new WeakSet<object>()): string[] {
  if (typeof value !== 'object' || value === null || seen.has(value)) return [];
  seen.add(value);
  const found: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (BANNED_KEYS.has(key)) found.push(`${path}.${key}`);
    found.push(...bannedKeyPaths(child, `${path}.${key}`, seen));
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------
// 1. Four AI seats play to ENDED
// ---------------------------------------------------------------------------------------------------------

describe('four AI seats through the controller with an immediate scheduler', () => {
  const mixes: readonly (readonly Difficulty[])[] = [
    ALL_AI,
    ['ADVANCED', 'ADVANCED', 'ADVANCED', 'ADVANCED'],
    ['BEGINNER', 'ADVANCED', 'BEGINNER', 'ADVANCED'],
    ['ADVANCED', 'BEGINNER', 'BEGINNER', 'ADVANCED'],
  ];

  it('reaches ENDED with no rejected action and the same result as playGame (same decision seeds)', () => {
    let games = 0;
    for (const [mixIndex, mix] of mixes.entries()) {
      for (const visibility of ['OWNER_ONLY', 'FACE_UP'] as const) {
        const seed = 7 + mixIndex * 3 + (visibility === 'FACE_UP' ? 1 : 0);
        const cfg = config(mix, visibility);
        const { ctl, stub } = make(immediate);
        expect(ctl.startGame({ config: cfg, seed })).toEqual({ ok: true });

        const label = `mix ${mix.join('/')} ${visibility} seed ${seed}`;
        const model = ctl.getModel();
        expect(model.screen, label).toBe('END');
        expect(model.aiStalled, label).toBe(false);
        expect(model.lastError, label).toBeNull();

        const reference = playGame({ seed, config: cfg, strategies: strategiesFor({ P0: mix[0]!, P1: mix[1]!, P2: mix[2]!, P3: mix[3]! }) });
        const view = ctl.getView('P0') as PlayerView;
        expect(view.phase, label).toBe('ENDED');
        expect(view.scores, label).toEqual(reference.final.scores);
        expect(view.history, label).toEqual(reference.final.history);
        expect(view.ranking, label).not.toBeNull();
        expect(model.actionCount, label).toBe(reference.log.length);

        // Card conservation from the public counts: board + hands + deck = 52.
        const onBoard = view.board.filter((c) => c !== null).length;
        const inHands = SEATS.reduce((n, s) => n + view.handCounts[s], 0);
        expect(onBoard + inHands + view.deckCount, label).toBe(52);

        // All four seats are AI: no private view is rendered, and the last render shows the END screen.
        expect(stub.calls.every((c) => c.view === null), label).toBe(true);
        expect(stub.last.model.screen, label).toBe('END');
        games++;
      }
    }
    expect(games).toBe(8);
  });

  it('plays several seeds to the same final scores as playGame', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const cfg = config(['ADVANCED', 'BEGINNER', 'ADVANCED', 'BEGINNER']);
      const { ctl } = make(immediate);
      ctl.startGame({ config: cfg, seed });
      const reference = playGame({ seed, config: cfg, strategies: strategiesFor({ P0: 'ADVANCED', P1: 'BEGINNER', P2: 'ADVANCED', P3: 'BEGINNER' }) });
      expect((ctl.getView('P1') as PlayerView).scores, `seed ${seed}`).toEqual(reference.final.scores);
    }
  });

  it('with a queue scheduler runs one step per callback, one pending callback at most, 600 ms apart', () => {
    const sched = new QueueScheduler();
    const { ctl } = make(sched.schedule);
    ctl.startGame({ config: config(ALL_AI), seed: 11 });
    expect(sched.pending).toBe(1);
    expect(ctl.getModel().actionCount).toBe(0); // nothing is applied before the first callback
    let steps = 0;
    while (sched.step()) {
      steps++;
      expect(sched.pending).toBeLessThanOrEqual(1);
      expect(ctl.getModel().actionCount).toBeGreaterThan(0);
    }
    expect(steps).toBeGreaterThan(20);
    expect(ctl.getModel().screen).toBe('END');
    expect(sched.maxPending).toBe(1);
    expect(new Set(sched.delays)).toEqual(new Set([AI_DELAY_MS]));
    expect(AI_DELAY_MS).toBe(600);
    expect(sched.pending).toBe(0); // ENDED: nothing more is scheduled
  });
});

// ---------------------------------------------------------------------------------------------------------
// 2. A human seat waits
// ---------------------------------------------------------------------------------------------------------

describe('a game with a human seat P0', () => {
  it('waits at P0 turn: nothing is scheduled and nothing is applied automatically', () => {
    const sched = new QueueScheduler();
    const { ctl, stub } = make(sched.schedule);
    expect(ctl.startGame({ seed: 5 })).toEqual({ ok: true }); // defaultConfig: P0 human
    const view = ctl.getView('P0') as PlayerView;
    expect(view.phase).toBe('PLACEMENT');
    expect(view.turn).toBe('P0');
    expect(sched.scheduled).toBe(0);
    expect(sched.pending).toBe(0);
    expect(ctl.getModel().viewer).toBe('P0');
    expect(stub.last.view?.viewer).toBe('P0');
    expect(ctl.getModel().actionCount).toBe(0);
  });

  it('after a valid PLACE the AI seats proceed up to the next human decision (queue scheduler)', () => {
    const sched = new QueueScheduler();
    const { ctl } = make(sched.schedule);
    ctl.startGame({ seed: 5 });
    const place = humanAction(ctl.getView('P0') as PlayerView) as Action;
    expect(ctl.dispatchHuman(place)).toEqual({ ok: true });
    expect(ctl.getModel().actionCount).toBe(1);
    expect(sched.pending).toBe(1); // exactly one AI step is planned
    sched.drain();
    // P1..P3 played; the loop stopped at the next decision of the person: P0's turn, or P0's guesses after a code
    const view = ctl.getView('P0') as PlayerView;
    expect(sched.pending).toBe(0);
    expect(ctl.getModel().actionCount).toBeGreaterThanOrEqual(4);
    if (view.phase === 'PLACEMENT') expect(view.turn).toBe('P0');
    else {
      expect(view.phase).toBe('GUESS_COLLECT');
      expect(view.guessSubmitted).toEqual({ P0: false, P1: true, P2: true, P3: true });
    }
  });

  it('plays a whole game: the human is awaited in PLACEMENT, GUESS_COLLECT and REVEAL (queue scheduler)', () => {
    const sched = new QueueScheduler();
    const { ctl, stub } = make(sched.schedule);
    ctl.startGame({ seed: 9 });
    const waits = playHuman(ctl, sched);
    expect([...waits].sort()).toEqual(['GUESS_COLLECT', 'PLACEMENT', 'REVEAL']);
    expect(ctl.getModel().screen).toBe('END');
    expect(ctl.getModel().lastError).toBeNull();
    expect(sched.maxPending).toBe(1);
    expect(stub.last.view?.ranking).not.toBeNull();
  });

  it('plays a whole game with an immediate scheduler and ends in the same state as with the queue scheduler', () => {
    const a = make(immediate);
    a.ctl.startGame({ seed: 9 });
    playHuman(a.ctl, null);
    const sched = new QueueScheduler();
    const b = make(sched.schedule);
    b.ctl.startGame({ seed: 9 });
    playHuman(b.ctl, sched);
    expect(a.ctl.getView('P0')).toEqual(b.ctl.getView('P0'));
  });

  it('never acknowledges a reveal for a person, and an all-AI game acknowledges by itself', () => {
    const sched = new QueueScheduler();
    const { ctl } = make(sched.schedule);
    ctl.startGame({ seed: 9 });
    let sawReveal = false;
    for (let i = 0; i < 800 && !sawReveal; i++) {
      sched.drain();
      const view = ctl.getView('P0') as PlayerView;
      if (view.phase === 'REVEAL') sawReveal = true;
      else ctl.dispatchHuman(humanAction(view) as Action);
    }
    expect(sawReveal).toBe(true);
    expect(sched.pending).toBe(0); // waits for the person
    sched.drain();
    expect((ctl.getView('P0') as PlayerView).phase).toBe('REVEAL');
    // all-AI: dispatchHuman({ACK_REVEAL}) is refused (nobody is a person)
    const ai = make(immediate);
    ai.ctl.startGame({ config: config(ALL_AI), seed: 3 });
    expect(ai.ctl.dispatchHuman({ type: 'ACK_REVEAL' })).toEqual({ ok: false, reason: 'ENGINE', code: 'WRONG_PHASE' });
  });
});

// ---------------------------------------------------------------------------------------------------------
// 3. Invalid actions
// ---------------------------------------------------------------------------------------------------------

describe('invalid human actions', () => {
  const ko5: Record<string, string> = {
    OUT_OF_BOUNDS: '유효하지 않은 위치',
    OCCUPIED: '이미 카드가 있는 위치',
    NOT_ADJACENT: '기존 카드와 인접해야 합니다',
    INVALID_ORIENTATION: '90°/270° 배치는 지원하지 않습니다',
    CARD_NOT_IN_HAND: '손패에 없는 카드',
  };

  function setup() {
    const sched = new QueueScheduler();
    // P0 and P1 are persons, so that "P1 acts on P0's turn" reaches the engine's NOT_YOUR_TURN.
    const made = make(sched.schedule);
    made.ctl.startGame({ config: config(['HUMAN', 'HUMAN', 'BEGINNER', 'BEGINNER']), seed: 21 });
    const view = made.ctl.getView('P0') as PlayerView;
    const card = view.myHand[0] as CardId;
    const legal = legalCellsFor(view)[0] as { row: number; col: number };
    const place = (patch: Record<string, unknown> = {}): Action =>
      ({ type: 'PLACE', player: 'P0', card, pos: legal, orientation: 0, ...patch }) as Action;
    return { ...made, sched, view, card, legal, place };
  }

  it('returns the engine code, leaves the view, the queue and the action count unchanged, and stores the error', () => {
    const s = setup();
    const outsideHand = ALL_CARDS.find((c) => !s.view.myHand.includes(c)) as string;
    const cases: [string, Action, string][] = [
      ['CARD_NOT_IN_HAND', s.place({ card: outsideHand }), 'CARD_NOT_IN_HAND'],
      ['OCCUPIED', s.place({ pos: { row: 3, col: 3 } }), 'OCCUPIED'],
      ['OUT_OF_BOUNDS', s.place({ pos: { row: 9, col: 9 } }), 'OUT_OF_BOUNDS'],
      ['NOT_ADJACENT', s.place({ pos: { row: 0, col: 0 } }), 'NOT_ADJACENT'],
      ['INVALID_ORIENTATION', s.place({ orientation: 90 }), 'INVALID_ORIENTATION'],
      ['NOT_YOUR_TURN (engine)', s.place({ player: 'P1' }), 'NOT_YOUR_TURN'],
      ['NOT_YOUR_TURN (AI seat)', s.place({ player: 'P2' }), 'NOT_YOUR_TURN'],
      ['WRONG_PHASE (guesses)', { type: 'SUBMIT_GUESSES', player: 'P0', guesses: {} }, 'WRONG_PHASE'],
      ['WRONG_PHASE (ack)', { type: 'ACK_REVEAL' }, 'WRONG_PHASE'],
      ['UNKNOWN_PLAYER', s.place({ player: 'P9' }), 'UNKNOWN_PLAYER'],
    ];
    for (const [label, action, code] of cases) {
      const viewBefore = JSON.stringify(s.ctl.getView('P0'));
      const scheduledBefore = s.sched.scheduled;
      const result = s.ctl.dispatchHuman(action);
      expect(result, label).toEqual({ ok: false, reason: 'ENGINE', code });
      expect(JSON.stringify(s.ctl.getView('P0')), label).toBe(viewBefore);
      expect(s.ctl.getModel().actionCount, label).toBe(0);
      expect(s.sched.scheduled, label).toBe(scheduledBefore);
      expect(s.sched.pending, label).toBe(0);
      expect(s.ctl.getModel().lastError?.code, label).toBe(code);
      expect(s.stub.last.displayError?.code, label).toBe(code);
    }
  });

  it('shows the 5 approved Korean strings verbatim and the English strings, and re-localizes the stored error', () => {
    const s = setup();
    const outsideHand = ALL_CARDS.find((c) => !s.view.myHand.includes(c)) as string;
    const actions: Record<string, Action> = {
      OUT_OF_BOUNDS: s.place({ pos: { row: 9, col: 9 } }),
      OCCUPIED: s.place({ pos: { row: 3, col: 3 } }),
      NOT_ADJACENT: s.place({ pos: { row: 0, col: 0 } }),
      INVALID_ORIENTATION: s.place({ orientation: 90 }),
      CARD_NOT_IN_HAND: s.place({ card: outsideHand }),
    };
    const en: Record<string, string> = {
      OUT_OF_BOUNDS: 'Invalid position',
      OCCUPIED: 'Position already has a card',
      NOT_ADJACENT: 'Must be adjacent to an existing card',
      INVALID_ORIENTATION: '90°/270° placement is not supported',
      CARD_NOT_IN_HAND: 'Card not in hand',
    };
    for (const [code, action] of Object.entries(actions)) {
      s.ctl.setLanguage('en');
      s.ctl.dispatchHuman(action);
      expect(s.ctl.getDisplayError(), code).toEqual({ code, message: en[code] });
      expect(s.stub.last.displayError?.message, code).toBe(en[code]);
      s.ctl.setLanguage('ko'); // same stored error, new language
      expect(s.ctl.getDisplayError(), code).toEqual({ code, message: ko5[code] });
      expect(s.stub.last.displayError?.message, code).toBe(ko5[code]);
      expect(getLanguage()).toBe('ko');
      expect(s.ctl.getModel().language).toBe('ko');
    }
  });

  it('never shows the raw engine detail, and stores no text or detail in the model', () => {
    const s = setup();
    s.ctl.dispatchHuman(s.place({ player: 'P1' })); // engine detail: "it is the turn of P0, not P1"
    s.ctl.dispatchHuman(s.place({ pos: { row: 9, col: 9 } }));
    for (const call of s.stub.calls) {
      const text = JSON.stringify({ model: call.model, error: call.displayError });
      expect(text).not.toMatch(/turn of|detail|not P1|row|col/i);
    }
    const error = s.ctl.getDisplayError();
    expect(error?.message).toBe(t('error.OUT_OF_BOUNDS'));
    expect(Object.keys(s.ctl.getModel().lastError as object).sort()).toEqual(['code', 'messageKey']);
    expect(s.ctl.getModel().lastError?.messageKey).toBe('error.OUT_OF_BOUNDS');
  });

  it('clears the error after an accepted action', () => {
    const s = setup();
    s.ctl.dispatchHuman(s.place({ orientation: 90 }));
    expect(s.ctl.getModel().lastError).not.toBeNull();
    expect(s.ctl.dispatchHuman(s.place())).toEqual({ ok: true });
    expect(s.ctl.getModel().lastError).toBeNull();
    expect(s.stub.last.displayError).toBeNull();
  });

  it('reports NO_GAME before a game starts and rejects an invalid start without touching the running game', () => {
    const { ctl } = make(immediate);
    expect(ctl.dispatchHuman({ type: 'ACK_REVEAL' })).toEqual({ ok: false, reason: 'NO_GAME' });
    expect(ctl.restart()).toEqual({ ok: false, reason: 'NO_GAME' });
    ctl.startGame({ seed: 4 });
    const before = JSON.stringify(ctl.getView('P0'));
    const bad = ctl.startGame({ seed: -1 });
    expect(bad).toEqual({ ok: false, reason: 'ENGINE', code: 'INVALID_CONFIG' });
    expect(JSON.stringify(ctl.getView('P0'))).toBe(before);
    expect(ctl.getModel().lastError?.code).toBe('INVALID_CONFIG');
  });
});

// ---------------------------------------------------------------------------------------------------------
// 4. Screens never receive sealed information
// ---------------------------------------------------------------------------------------------------------

describe('what a renderer receives', () => {
  it('has no sealed key anywhere, in any phase of a whole game, and only frozen plain data', () => {
    const sched = new QueueScheduler();
    const { ctl, stub } = make(sched.schedule);
    ctl.startGame({ seed: 9 });
    playHuman(ctl, sched);
    const phases = new Set(stub.calls.flatMap((c) => (c.view === null ? [] : [c.view.phase])));
    expect(phases).toEqual(new Set(['PLACEMENT', 'GUESS_COLLECT', 'REVEAL', 'ENDED']));
    expect(stub.calls.length).toBeGreaterThan(30);
    for (const call of stub.calls) {
      expect(Object.keys(call).sort()).toEqual(['displayError', 'handlers', 'model', 'view']);
      expect(bannedKeyPaths(call)).toEqual([]);
      expect(Object.isFrozen(call.model)).toBe(true);
      if (call.view !== null) expect(Object.isFrozen(call.view)).toBe(true);
      expect(Object.keys(call.handlers).sort()).toEqual(['abandon', 'dispatch', 'restart', 'select', 'setLanguage', 'startGame']);
      expect(Object.values(call.handlers).every((f) => typeof f === 'function')).toBe(true);
    }
    // the same handlers object every time, and a view is a copy: two renders never share a view
    expect(new Set(stub.calls.map((c) => c.handlers)).size).toBe(1);
  });

  it('exposes no state through the controller object or the module exports', () => {
    const { ctl } = make(immediate);
    ctl.startGame({ seed: 9 });
    expect(Object.keys(ctl).sort()).toEqual([
      'abandon', 'dispatchHuman', 'dispose', 'getDisplayError', 'getModel', 'getView', 'restart', 'select', 'setLanguage', 'startGame', 'subscribe',
    ]);
    expect(Object.values(ctl).every((v) => typeof v === 'function')).toBe(true);
    expect(Object.getOwnPropertyNames(ctl).some((k) => /^(?:state|game|deck|hands|log|seed)$/i.test(k))).toBe(false);
    expect(Object.getOwnPropertySymbols(ctl)).toEqual([]);
    expect(Object.keys(controllerModule).sort()).toEqual(['AI_DELAY_MS', 'createController', 'mountApp']);
    expect(bannedKeyPaths(ctl.getModel())).toEqual([]);
  });

  it('adds nothing to globalThis while mounting, running and disposing', () => {
    const names = () => [...Object.getOwnPropertyNames(globalThis), ...Object.getOwnPropertySymbols(globalThis).map(String)].sort();
    const before = names();
    const { ctl } = make(immediate);
    ctl.startGame({ seed: 9 });
    ctl.startGame({ config: config(ALL_AI), seed: 9 });
    ctl.setLanguage('ko');
    ctl.abandon();
    ctl.dispose();
    expect(names()).toEqual(before);
  });

  it('shows a seat no guess value of another seat during GUESS_COLLECT (non-interference)', () => {
    // Two runs of the same game differ only in what the AI seats guess (49 or 50). Until the first reveal the
    // views of P0 must be identical, so the guesses of the AI seats cannot be in them.
    const run = (value: number) => {
      const forced = (d: Difficulty): AIStrategy => ({
        ...getStrategy(d),
        chooseGuesses: (view) => ({
          type: 'SUBMIT_GUESSES',
          player: view.viewer,
          guesses: Object.fromEntries(view.pendingQuadKeys.map((k) => [k, value])),
        }),
      });
      const sched = new QueueScheduler();
      const { ctl, stub } = make(sched.schedule, { strategyFor: forced });
      ctl.startGame({ seed: 9 });
      for (let i = 0; i < 400; i++) {
        sched.drain();
        const view = ctl.getView('P0') as PlayerView;
        if (view.phase === 'GUESS_COLLECT') break;
        ctl.dispatchHuman(humanAction(view) as Action);
        if ((ctl.getView('P0') as PlayerView).phase === 'GUESS_COLLECT') break;
      }
      sched.drain(); // AI seats submit (P0 has not)
      const view = ctl.getView('P0') as PlayerView;
      expect(view.phase).toBe('GUESS_COLLECT');
      expect(view.guessSubmitted).toEqual({ P0: false, P1: true, P2: true, P3: true });
      expect(view.myGuesses).toBeNull();
      expect(stub.last.view).toEqual(view);
      return JSON.stringify(view);
    };
    expect(run(49)).toBe(run(50));
  });
});

// ---------------------------------------------------------------------------------------------------------
// 5. Repeated events
// ---------------------------------------------------------------------------------------------------------

describe('repeated events', () => {
  it('applies an accepted action once: the same object again is DUPLICATE_SUBMISSION, a copy is the engine error', () => {
    const sched = new QueueScheduler();
    const { ctl } = make(sched.schedule);
    ctl.startGame({ seed: 5 });
    const place = humanAction(ctl.getView('P0') as PlayerView) as Action;
    expect(ctl.dispatchHuman(place)).toEqual({ ok: true });
    const after = JSON.stringify(ctl.getView('P0'));
    expect(ctl.dispatchHuman(place)).toEqual({ ok: false, reason: 'ENGINE', code: 'DUPLICATE_SUBMISSION' });
    expect(ctl.dispatchHuman({ ...(place as object) } as Action)).toEqual({ ok: false, reason: 'ENGINE', code: 'NOT_YOUR_TURN' });
    expect(JSON.stringify(ctl.getView('P0'))).toBe(after);
    expect(ctl.getModel().actionCount).toBe(1);
    expect(sched.pending).toBe(1);
    // after the AI played on, the double-click guard no longer applies, and the engine still refuses the old action
    sched.drain();
    expect(ctl.dispatchHuman(place).ok).toBe(false);
  });

  it('rejects a second SUBMIT_GUESSES of the same seat (engine DUPLICATE_SUBMISSION) and leaves the state unchanged', () => {
    const sched = new QueueScheduler();
    const { ctl } = make(sched.schedule);
    ctl.startGame({ seed: 9 });
    let found = false;
    for (let i = 0; i < 400 && !found; i++) {
      sched.drain();
      const view = ctl.getView('P0') as PlayerView;
      const action = humanAction(view) as Action;
      ctl.dispatchHuman(action);
      found = action.type === 'PLACE' && (ctl.getView('P0') as PlayerView).phase === 'GUESS_COLLECT'; // AI has not submitted yet
    }
    expect(found).toBe(true);
    const guessAction = (): Action => {
      const view = ctl.getView('P0') as PlayerView;
      return { type: 'SUBMIT_GUESSES', player: 'P0', guesses: Object.fromEntries(view.pendingQuadKeys.map((k) => [k, 10])) };
    };
    expect(ctl.dispatchHuman(guessAction())).toEqual({ ok: true });
    expect((ctl.getView('P0') as PlayerView).guessSubmitted.P0).toBe(true);
    const before = JSON.stringify(ctl.getView('P0'));
    expect(ctl.dispatchHuman(guessAction())).toEqual({ ok: false, reason: 'ENGINE', code: 'DUPLICATE_SUBMISSION' });
    expect(JSON.stringify(ctl.getView('P0'))).toBe(before);
    expect(sched.pending).toBe(1);
  });

  it('rejects a re-entrant call from inside the renderer (BUSY) without applying anything twice', () => {
    const { ctl, stub } = make(immediate);
    ctl.startGame({ seed: 5 });
    const place = humanAction(ctl.getView('P0') as PlayerView) as Action;
    const results: OpResult[] = [];
    stub.hook = (input) => {
      if (input.model.actionCount === 1 && results.length === 0) {
        results.push(input.handlers.dispatch({ ...(place as object) } as Action));
        results.push(input.handlers.startGame({ seed: 1 }));
        results.push(input.handlers.restart());
        results.push(input.handlers.abandon());
      }
    };
    expect(ctl.dispatchHuman(place)).toEqual({ ok: true });
    expect(results).toEqual([
      { ok: false, reason: 'BUSY' },
      { ok: false, reason: 'BUSY' },
      { ok: false, reason: 'BUSY' },
      { ok: false, reason: 'BUSY' },
    ]);
    // the same scenario without the re-entrant attempts ends in the same place: every action was applied once
    const control = make(immediate);
    control.ctl.startGame({ seed: 5 });
    control.ctl.dispatchHuman(humanAction(control.ctl.getView('P0') as PlayerView) as Action);
    expect(ctl.getModel().actionCount).toBe(control.ctl.getModel().actionCount);
    expect(ctl.getView('P0')).toEqual(control.ctl.getView('P0'));
    expect(ctl.getModel().actionCount).toBeGreaterThanOrEqual(4);
  });

  it('never has two AI steps pending: repeated startGame, rejected actions and accepted human actions', () => {
    const sched = new QueueScheduler();
    const ai = make(sched.schedule);
    for (let i = 0; i < 4; i++) {
      ai.ctl.startGame({ config: config(ALL_AI), seed: i });
      expect(sched.pending).toBe(1);
    }
    expect(sched.cancellations).toBe(3);
    ai.ctl.dispose();
    expect(sched.pending).toBe(0);

    const human = make(sched.schedule);
    human.ctl.startGame({ seed: 9 });
    playHuman(human.ctl, sched);
    expect(sched.maxPending).toBe(1);
  });

  it('a render requested from inside the renderer is coalesced, not recursed', () => {
    const { ctl, stub } = make(immediate);
    let depth = 0;
    let maxDepth = 0;
    stub.hook = (input) => {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
      if (input.model.language === 'en' && input.model.screen === 'GAME') input.handlers.setLanguage('ko');
      depth--;
    };
    ctl.startGame({ seed: 9 }); // renders; the hook switches the language once from inside a render
    expect(maxDepth).toBe(1);
    expect(ctl.getModel().language).toBe('ko');
  });
});

// ---------------------------------------------------------------------------------------------------------
// 6. Stale callbacks, restart, abandon, dispose
// ---------------------------------------------------------------------------------------------------------

describe('stale scheduled callbacks', () => {
  it('a callback captured before restart has no effect on the new game; the pending handle is cancelled', () => {
    const sched = new QueueScheduler();
    const { ctl } = make(sched.schedule);
    ctl.startGame({ config: config(ALL_AI), seed: 1 });
    const oldCallback = sched.queue[0]!.fn;
    expect(ctl.restart()).toEqual({ ok: true });
    expect(sched.cancellations).toBe(1);
    expect(sched.pending).toBe(1);
    const view = JSON.stringify(ctl.getView('P0'));
    const scheduled = sched.scheduled;
    oldCallback();
    expect(JSON.stringify(ctl.getView('P0'))).toBe(view);
    expect(ctl.getModel().actionCount).toBe(0);
    expect(sched.scheduled).toBe(scheduled);
    expect(sched.pending).toBe(1);
    // restart used the same configuration with a new seed from deps.randomSeed(), and the new game still plays
    sched.drain();
    expect(ctl.getModel().screen).toBe('END');
  });

  it('a callback captured before abandon has no effect; the model is idle and no view exists', () => {
    const sched = new QueueScheduler();
    const { ctl, stub } = make(sched.schedule);
    ctl.startGame({ config: config(ALL_AI), seed: 1 });
    const oldCallback = sched.queue[0]!.fn;
    expect(ctl.abandon()).toEqual({ ok: true });
    expect(sched.cancellations).toBe(1);
    expect(sched.pending).toBe(0);
    const renders = stub.calls.length;
    oldCallback();
    expect(sched.pending).toBe(0);
    expect(stub.calls.length).toBe(renders);
    expect(ctl.getModel()).toMatchObject({ screen: 'SETUP', viewer: null, actionCount: 0, lastError: null });
    expect(ctl.getView('P0')).toBeNull();
    expect(stub.last.view).toBeNull();
    expect(ctl.dispatchHuman({ type: 'ACK_REVEAL' })).toEqual({ ok: false, reason: 'NO_GAME' });
  });

  it('a callback captured before dispose has no effect; dispose cancels, unsubscribes and later calls do nothing', () => {
    const sched = new QueueScheduler();
    const { ctl, stub } = make(sched.schedule);
    ctl.startGame({ config: config(ALL_AI), seed: 1 });
    const seen: number[] = [];
    ctl.subscribe((m) => seen.push(m.actionCount));
    const oldCallback = sched.queue[0]!.fn;
    ctl.dispose();
    expect(sched.cancellations).toBe(1);
    const renders = stub.calls.length;
    oldCallback();
    expect(stub.calls.length).toBe(renders);
    expect(seen).toEqual([]);
    expect(ctl.startGame({ seed: 1 })).toEqual({ ok: false, reason: 'DISPOSED' });
    expect(ctl.dispatchHuman({ type: 'ACK_REVEAL' })).toEqual({ ok: false, reason: 'DISPOSED' });
    expect(ctl.restart()).toEqual({ ok: false, reason: 'DISPOSED' });
    expect(ctl.abandon()).toEqual({ ok: false, reason: 'DISPOSED' });
    ctl.setLanguage('ko');
    expect(ctl.getModel().language).toBe('en');
    expect(ctl.getView('P0')).toBeNull();
    expect(ctl.subscribe(() => undefined)()).toBeUndefined();
    ctl.dispose(); // idempotent
    expect(stub.calls.length).toBe(renders);
    expect(sched.scheduled).toBe(1);
  });

  it('a callback planned for an older log length is ignored after a human action advanced the state', () => {
    const sched = new QueueScheduler();
    const { ctl } = make(sched.schedule);
    ctl.startGame({ seed: 9 });
    // advance until P0 placed a code-forming action: GUESS_COLLECT with AI steps pending
    let found = false;
    for (let i = 0; i < 400 && !found; i++) {
      sched.drain();
      const action = humanAction(ctl.getView('P0') as PlayerView) as Action;
      ctl.dispatchHuman(action);
      found = action.type === 'PLACE' && (ctl.getView('P0') as PlayerView).phase === 'GUESS_COLLECT';
    }
    expect(found).toBe(true);
    expect(sched.pending).toBe(1);
    const stale = sched.queue[0]!.fn; // planned for the log length before P0's submission
    const cancellationsBefore = sched.cancellations;
    const guesses = Object.fromEntries((ctl.getView('P0') as PlayerView).pendingQuadKeys.map((k) => [k, 12]));
    expect(ctl.dispatchHuman({ type: 'SUBMIT_GUESSES', player: 'P0', guesses })).toEqual({ ok: true });
    expect(sched.cancellations).toBe(cancellationsBefore + 1); // the old handle was cancelled
    expect(sched.pending).toBe(1); // and one fresh step planned
    const view = JSON.stringify(ctl.getView('P0'));
    stale();
    expect(JSON.stringify(ctl.getView('P0'))).toBe(view);
    expect(sched.pending).toBe(1);
  });

  it('ignores a stale callback even when the scheduler does not honour cancel', () => {
    const callbacks: (() => void)[] = [];
    const deaf: Schedule = (fn) => {
      callbacks.push(fn);
      return { cancel: () => undefined }; // does not remove anything
    };
    const { ctl } = make(deaf);
    ctl.startGame({ config: config(ALL_AI), seed: 1 });
    ctl.restart();
    expect(callbacks).toHaveLength(2);
    callbacks[0]!();
    expect(ctl.getModel().actionCount).toBe(0); // the first (stale) callback did nothing
    callbacks[1]!();
    expect(ctl.getModel().actionCount).toBe(1);
    callbacks[1]!(); // already run
    expect(ctl.getModel().actionCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------
// AI failures are not hidden
// ---------------------------------------------------------------------------------------------------------

describe('an AI seat that cannot play', () => {
  const illegal = (): AIStrategy => ({
    ...getStrategy('BEGINNER'),
    choosePlacement: (view) => ({
      type: 'PLACE',
      player: view.viewer,
      card: view.myHand[0]!,
      pos: { row: 3, col: 3 }, // occupied by a Neutral_Card
      orientation: 0,
    }),
  });

  it('stops the loop, keeps the state, schedules nothing more and shows the engine code', () => {
    const sched = new QueueScheduler();
    const { ctl } = make(sched.schedule, { strategyFor: illegal });
    ctl.startGame({ config: config(ALL_AI), seed: 1 });
    sched.drain();
    const model = ctl.getModel();
    expect(model.aiStalled).toBe(true);
    expect(model.lastError?.code).toBe('OCCUPIED');
    expect(model.actionCount).toBe(0);
    expect((ctl.getView('P0') as PlayerView).phase).toBe('PLACEMENT');
    expect(sched.pending).toBe(0);
    expect(ctl.getDisplayError()?.message).toBe(t('error.OCCUPIED'));
  });

  it('stops the loop when a strategy throws, and does not substitute another action', () => {
    const sched = new QueueScheduler();
    const throwing = (): AIStrategy => ({
      ...getStrategy('BEGINNER'),
      choosePlacement: () => {
        throw new Error('boom');
      },
    });
    const { ctl } = make(sched.schedule, { strategyFor: throwing });
    ctl.startGame({ config: config(ALL_AI), seed: 1 });
    sched.drain();
    expect(ctl.getModel()).toMatchObject({ aiStalled: true, actionCount: 0, lastError: null });
    expect(sched.pending).toBe(0);
  });

  it('refuses an action the engine would accept but that names another seat than the one asked', () => {
    const sched = new QueueScheduler();
    // P1 has not submitted either, so the engine accepts these guesses; the controller must not apply them for P0.
    const impostor = (): AIStrategy => ({
      ...getStrategy('BEGINNER'),
      chooseGuesses: (view) => ({
        type: 'SUBMIT_GUESSES',
        player: 'P1',
        guesses: Object.fromEntries(view.pendingQuadKeys.map((k) => [k, 10])),
      }),
    });
    const { ctl } = make(sched.schedule, { strategyFor: impostor });
    ctl.startGame({ config: config(ALL_AI), seed: 1 });
    sched.drain();
    const model = ctl.getModel();
    expect(model.aiStalled).toBe(true);
    expect(model.lastError?.code).toBe('NOT_YOUR_TURN');
    const view = ctl.getView('P0') as PlayerView;
    expect(view.phase).toBe('GUESS_COLLECT');
    expect(view.guessSubmitted).toEqual({ P0: false, P1: false, P2: false, P3: false });
    expect(sched.pending).toBe(0);
  });

  it('starting a new game clears the stall', () => {
    const sched = new QueueScheduler();
    const { ctl } = make(sched.schedule, { strategyFor: illegal });
    ctl.startGame({ config: config(ALL_AI), seed: 1 });
    sched.drain();
    expect(ctl.getModel().aiStalled).toBe(true);
    ctl.startGame({ config: config(ALL_AI), seed: 2 });
    expect(ctl.getModel()).toMatchObject({ aiStalled: false, lastError: null });
    expect(sched.pending).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Model, language, selection
// ---------------------------------------------------------------------------------------------------------

describe('model and language', () => {
  it('renders the idle screen first, then follows the game, and notifies subscribers', () => {
    const { ctl, stub } = make(immediate);
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]!.view).toBeNull();
    expect(stub.calls[0]!.model).toMatchObject({ language: 'en', screen: 'SETUP', viewer: null, actionCount: 0, lastError: null });
    const seen: string[] = [];
    const off = ctl.subscribe((m) => seen.push(m.screen));
    ctl.startGame({ seed: 5 });
    expect(seen).toEqual(['GAME']);
    off();
    ctl.select({ card: 'H-7' as never, orientation: 180 });
    expect(seen).toEqual(['GAME']);
    expect(ctl.getModel().selection).toEqual({ card: 'H-7', orientation: 180, cell: null });
    ctl.abandon();
    expect(ctl.getModel().selection).toEqual({ card: null, orientation: 0, cell: null });
  });

  it('takes the start language from deps and ignores an unsupported language', () => {
    const { ctl } = make(immediate, { language: () => 'ko' });
    expect(ctl.getModel().language).toBe('ko');
    expect(getLanguage()).toBe('ko');
    ctl.setLanguage('fr' as never);
    expect(ctl.getModel().language).toBe('ko');
  });
});

// ---------------------------------------------------------------------------------------------------------
// 7. mountApp with the existing shell (fake Document, not a browser)
// ---------------------------------------------------------------------------------------------------------

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Array<(event: { type: string }) => void>>();
  textContent: string | null = '';
  focusCalls = 0;
  private selected = '';

  constructor(
    readonly tagName: string,
    private readonly doc: FakeDocument | null = null,
  ) {}
  set innerHTML(_value: string) {
    throw new Error('innerHTML must not be assigned');
  }
  get value(): string {
    return this.selected;
  }
  set value(v: string) {
    this.selected = this.children.some((c) => c.attributes.get('value') === v) ? v : '';
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }
  addEventListener(type: string, listener: (event: { type: string }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  focus(): void {
    this.focusCalls++;
    if (this.doc !== null) this.doc.activeElement = this;
  }
  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ type });
  }
}

class FakeDocument {
  readonly documentElement = { lang: 'en' };
  title = 'QRoker';
  activeElement: FakeElement | null = null;
  readonly created: FakeElement[] = [];
  /** Elements that `getElementById` and `querySelector('[data-focus-key=...]')` can find. */
  readonly registry = new Map<string, FakeElement>();
  lookups = 0;
  createElement(tag: string): FakeElement {
    const el = new FakeElement(tag, this);
    this.created.push(el);
    return el;
  }
  createTextNode(text: string): FakeElement {
    const el = new FakeElement('#text', this);
    el.textContent = text;
    return el;
  }
  private find(attribute: string, value: string): FakeElement | null {
    this.lookups++;
    return this.registry.get(`${attribute}=${value}`) ?? this.created.find((e) => e.attributes.get(attribute) === value) ?? null;
  }
  getElementById(id: string): FakeElement | null {
    return this.find('id', id);
  }
  querySelector(selector: string): FakeElement | null {
    const m = /^\[data-focus-key="([^"]+)"\]$/.exec(selector);
    return m === null ? null : this.find('data-focus-key', m[1] as string);
  }
}

function mount(languages: readonly string[] | string, extra: Partial<Parameters<typeof mountApp>[1]> = {}, doc = new FakeDocument()) {
  const root = new FakeElement('div');
  const handle = mountApp(root as unknown as HTMLElement, {
    doc: doc as unknown as Document,
    languages,
    schedule: immediate,
    randomSeed: () => 1,
    ...extra,
  });
  const find = (tag: string, cls?: string) =>
    doc.created.find((e) => e.tagName === tag && (cls === undefined || e.attributes.get('class') === cls)) as FakeElement;
  return { doc, root, handle, select: find('select'), title: find('h1'), banner: find('p', 'shell__banner'), notice: find('p', 'shell__notice'), label: find('label') };
}

describe('mountApp composes the existing shell with the controller (fake Document, not a browser test)', () => {
  it('renders the shell in Korean and in English, with banner, notice and selector, and no button', () => {
    const ko = mount(['ko-KR']);
    expect(ko.title.textContent).toBe('QRoker');
    expect(ko.banner.textContent).toBe('임시 점수 규칙');
    expect(ko.label.textContent).toBe('언어');
    expect(ko.notice.textContent).toContain('아직 연결되지 않았습니다');
    expect(ko.doc.documentElement.lang).toBe('ko');
    expect(ko.handle.controller.getModel()).toMatchObject({ language: 'ko', screen: 'SETUP' });
    resetLanguage();
    const en = mount(['en-US']);
    expect(en.banner.textContent).toBe('provisional scoring');
    expect(en.notice.textContent).toContain('not connected yet');
    expect(en.root.children).toHaveLength(1);
    expect(en.doc.created.filter((e) => ['button', 'a', 'input', 'canvas'].includes(e.tagName))).toEqual([]);
  });

  it('switches text, <html lang> and the model on a selector change, and from the controller', () => {
    const m = mount(['en-US']);
    const created = m.doc.created.length;
    m.select.value = 'ko';
    m.select.dispatch('change');
    expect(m.banner.textContent).toBe('임시 점수 규칙');
    expect(m.doc.documentElement.lang).toBe('ko');
    expect(m.handle.controller.getModel().language).toBe('ko');
    m.handle.controller.setLanguage('en');
    expect(m.banner.textContent).toBe('provisional scoring');
    expect(m.doc.documentElement.lang).toBe('en');
    expect(m.select.value).toBe('en');
    expect(m.doc.created.length).toBe(created); // the selector and every other element survive a switch
  });

  it('keeps the banner and the notice while a game runs (every rendered state)', () => {
    const m = mount(['en-US']);
    expect(m.handle.controller.startGame({ config: config(ALL_AI), seed: 3 })).toEqual({ ok: true });
    expect(m.handle.controller.getModel().screen).toBe('END');
    expect(m.banner.textContent).toBe('provisional scoring');
    expect(m.notice.textContent).toContain('not connected yet');
    m.handle.controller.abandon();
    expect(m.banner.textContent).toBe('provisional scoring');
  });

  it('adds nothing to globalThis and stops rendering after dispose', () => {
    const names = () => Object.getOwnPropertyNames(globalThis).sort();
    const before = names();
    const m = mount(['ko']);
    m.handle.controller.startGame({ config: config(ALL_AI), seed: 3 });
    m.handle.dispose();
    m.select.value = 'en';
    m.select.dispatch('change'); // the shell still switches its own texts; the controller is disposed
    expect(m.handle.controller.getModel().language).toBe('ko');
    expect(m.handle.controller.startGame({ seed: 1 })).toEqual({ ok: false, reason: 'DISPOSED' });
    expect(names()).toEqual(before);
  });

  it('renders inside the focus guard: the focused control is looked up and focused again if it was replaced', () => {
    const replaced: { current: FakeElement | null } = { current: null };
    const doc = new FakeDocument();
    const m = mount(
      ['en-US'],
      {
        renderer: () => {
          // a "screen" that rebuilds its button on every render
          const fresh = new FakeElement('button', doc);
          fresh.setAttribute('data-focus-key', 'play');
          doc.registry.set('data-focus-key=play', fresh);
          replaced.current = fresh;
        },
      },
      doc,
    );
    const old = new FakeElement('button', m.doc);
    old.setAttribute('data-focus-key', 'play');
    old.focus();
    m.doc.registry.set('data-focus-key=play', old);
    const lookups = m.doc.lookups;
    m.handle.controller.select({ orientation: 180 }); // any model change renders
    expect(m.doc.lookups).toBeGreaterThan(lookups);
    expect(replaced.current).not.toBeNull();
    expect(replaced.current).not.toBe(old);
    expect(replaced.current!.focusCalls).toBe(1);
    expect(m.doc.activeElement).toBe(replaced.current);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Source scan of the controller
// ---------------------------------------------------------------------------------------------------------

const UI_DIR = dirname(fileURLToPath(import.meta.url));
const code = (file: string): string =>
  readFileSync(join(UI_DIR, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('source scan: no timers, clock or randomness outside main.ts; no globals in controller and store', () => {
  it('controller.ts, dom.ts and store.ts use no timer, clock or random source', () => {
    const forbidden = /\b(?:setTimeout|setInterval|requestAnimationFrame|queueMicrotask)\b|\bMath\s*\.\s*random\b|\bDate\b|\bperformance\s*\.\s*now\b|\bcrypto\b/;
    for (const file of ['controller.ts', 'dom.ts', 'store.ts']) expect(forbidden.test(code(file)), file).toBe(false);
  });
  it('the real scheduler is created in main.ts only', () => {
    expect(code('main.ts')).toMatch(/setTimeout\(fn, ms\)/);
    expect(code('main.ts')).toMatch(/clearTimeout/);
  });
  it('controller.ts and store.ts name no browser global', () => {
    const globals = /\b(?:window|document|globalThis|localStorage|sessionStorage|navigator|self)\b/;
    for (const file of ['controller.ts', 'store.ts']) expect(globals.test(code(file)), file).toBe(false);
  });
  it('only controller.ts imports core/state and core/engine', () => {
    for (const file of ['dom.ts', 'store.ts', 'shell.ts', 'main.ts']) {
      expect(/core\/(?:state|engine)/.test(code(file)), file).toBe(false);
    }
  });
});
