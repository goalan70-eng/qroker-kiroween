// Tests of the Pass_Device_Gate (task 18.1). Evidence classes (design.md, "Testing Strategy"):
//   * model    : `nextGate` over hand-written seat sets and over real `PlayerView`s of real games (no DOM);
//   * fake-DOM : `renderPrivacyGate` against the hand-written fake Document of ui/testing/fake-dom.ts with synthetic
//                events. NOT a browser: no layout, no real focus, no screen reader. The activation of the gate in the
//                composed page is task 19.4 and the headless-DOM smoke test is task 21.3.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { getStrategy } from '../../ai/registry';
import { ALL_CARDS } from '../../core/cards';
import { defaultConfig } from '../../core/state';
import type { Action, GameConfig, PlayerId } from '../../core/types';
import type { GamePhase, PlayerView } from '../../core/view';
import { resetLanguage, setLanguage, t } from '../../i18n';
import { createController } from '../controller';
import type { Controller, Schedule } from '../controller';
import { captureFocus } from '../dom';
import type { FocusDoc } from '../dom';
import { asFake, FakeDocument } from '../testing/fake-dom';
import type { FakeEl } from '../testing/fake-dom';
import { nextGate, PRIVACY_GATE_ACK_ID, PRIVACY_GATE_STRING_KEYS, renderPrivacyGate } from './privacy-gate';
import type { GateCurrent, GateInput, GateModel, PrivacyGateDocument, PrivacyGateOptions } from './privacy-gate';

afterEach(() => resetLanguage());

// ---------------------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------------------

type Kind = 'HUMAN' | 'AI';
const SEAT_IDS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];
const NAMES = ['Alice', 'Bob', 'Carol', 'Dave'] as const; // no digit and no seat id in any public name

function seatsOf(kinds: readonly Kind[]): GateInput['seats'] {
  return kinds.map((kind, i) =>
    kind === 'HUMAN'
      ? { id: SEAT_IDS[i], kind, name: NAMES[i] }
      : { id: SEAT_IDS[i], kind, difficulty: 'BEGINNER', name: NAMES[i] },
  ) as unknown as GateInput['seats'];
}

const NONE = { P0: false, P1: false, P2: false, P3: false } as const;

function input(kinds: readonly Kind[], over: Partial<GateInput> = {}): GateInput {
  return {
    seats: seatsOf(kinds),
    phase: 'PLACEMENT',
    turn: 'P0',
    guessSubmitted: NONE,
    lastPrivateSeat: null,
    acknowledgedSeat: null,
    ...over,
  };
}

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

interface Game {
  readonly ctl: Controller;
  readonly queue: Queue;
  readonly humans: readonly PlayerId[];
}

function startGame(kinds: readonly Kind[], seed: number): Game {
  const queue = new Queue();
  const ctl = createController({ schedule: queue.schedule, renderer: () => undefined, randomSeed: () => seed, language: () => 'en' });
  const seats = seatsOf(kinds) as GameConfig['seats'];
  ctl.startGame({ config: { ...defaultConfig(), seats }, seed });
  return { ctl, queue, humans: SEAT_IDS.filter((_, i) => kinds[i] === 'HUMAN') };
}

const viewOf = (g: Game, seat: PlayerId): PlayerView => g.ctl.getView(seat) as PlayerView;

/** Plays (BEGINNER placements for the people) to the first batch with `wanted` pending codes and nobody submitted. */
function advanceToBatch(g: Game, wanted: number): boolean {
  for (let i = 0; i < 3000; i++) {
    const view = viewOf(g, g.humans[0] as PlayerId);
    if (view.phase === 'ENDED') return false;
    if (view.phase === 'GUESS_COLLECT') {
      if (view.pendingQuadKeys.length === wanted && SEAT_IDS.every((s) => !view.guessSubmitted[s])) return true;
      for (const seat of g.humans) {
        const v = viewOf(g, seat);
        if (!v.guessSubmitted[seat]) {
          g.ctl.dispatchHuman({ type: 'SUBMIT_GUESSES', player: seat, guesses: Object.fromEntries(v.pendingQuadKeys.map((k) => [k, 20])) });
        }
      }
      while (g.queue.step()) {
        /* AI Seats submit */
      }
    } else if (view.phase === 'REVEAL') {
      g.ctl.dispatchHuman({ type: 'ACK_REVEAL' });
    } else if (g.humans.includes(view.turn)) {
      g.ctl.dispatchHuman(getStrategy('BEGINNER').choosePlacement(viewOf(g, view.turn), { decisionSeed: i }) as Action);
    } else if (!g.queue.step()) {
      throw new Error('AI turn without a scheduled step');
    }
  }
  throw new Error('no end');
}

function findBatch(kinds: readonly Kind[], wanted: number): Game {
  for (let seed = 1; seed <= 200; seed++) {
    const g = startGame(kinds, seed);
    if (advanceToBatch(g, wanted)) return g;
  }
  throw new Error(`no seed gives a batch with ${wanted} codes`);
}

const gateInputOf = (view: PlayerView, over: Partial<GateInput> = {}): GateInput => ({
  seats: view.rules.seats,
  phase: view.phase,
  turn: view.turn,
  guessSubmitted: view.guessSubmitted,
  lastPrivateSeat: null,
  acknowledgedSeat: null,
  ...over,
});

// ---------------------------------------------------------------------------------------------------------
// nextGate (model)
// ---------------------------------------------------------------------------------------------------------

describe('nextGate [model]', () => {
  const PHASES: readonly GamePhase[] = ['PLACEMENT', 'GUESS_COLLECT', 'REVEAL', 'ENDED'];

  it('one human Seat never gets a gate (every phase, turn and submission state)', () => {
    for (const kinds of [
      ['HUMAN', 'AI', 'AI', 'AI'],
      ['AI', 'AI', 'HUMAN', 'AI'],
    ] as const) {
      for (const phase of PHASES) {
        for (const turn of SEAT_IDS) {
          expect(nextGate(input(kinds, { phase, turn })), `${kinds.join()} ${phase} ${turn}`).toBeNull();
          expect(nextGate(input(kinds, { phase, turn, guessSubmitted: { ...NONE, P1: true } }))).toBeNull();
        }
      }
    }
  });

  it('no human Seat at all: no gate', () => {
    for (const phase of PHASES) expect(nextGate(input(['AI', 'AI', 'AI', 'AI'], { phase }))).toBeNull();
  });

  it('two human Seats: a HAND gate before the other human Seat\'s placement turn', () => {
    const kinds = ['HUMAN', 'HUMAN', 'AI', 'AI'] as const;
    expect(nextGate(input(kinds, { turn: 'P0' }))).toEqual({ forSeat: 'P0', name: 'Alice', purpose: 'HAND' });
    expect(nextGate(input(kinds, { turn: 'P1' }))).toEqual({ forSeat: 'P1', name: 'Bob', purpose: 'HAND' });
    expect(nextGate(input(kinds, { turn: 'P1', lastPrivateSeat: 'P0' }))).toEqual({ forSeat: 'P1', name: 'Bob', purpose: 'HAND' });
  });

  it('AI turns need no gate, even between two human Seats', () => {
    const kinds = ['HUMAN', 'AI', 'HUMAN', 'AI'] as const;
    expect(nextGate(input(kinds, { turn: 'P1' }))).toBeNull();
    expect(nextGate(input(kinds, { turn: 'P3', lastPrivateSeat: 'P2' }))).toBeNull();
    expect(nextGate(input(kinds, { turn: 'P2', lastPrivateSeat: 'P0' }))).toEqual({ forSeat: 'P2', name: 'Carol', purpose: 'HAND' });
  });

  it('no gate when the candidate already holds the device or was already acknowledged', () => {
    const kinds = ['HUMAN', 'HUMAN', 'AI', 'AI'] as const;
    expect(nextGate(input(kinds, { turn: 'P1', lastPrivateSeat: 'P1' }))).toBeNull();
    expect(nextGate(input(kinds, { turn: 'P1', acknowledgedSeat: 'P1' }))).toBeNull();
    expect(nextGate(input(kinds, { turn: 'P1', lastPrivateSeat: 'P0', acknowledgedSeat: 'P1' }))).toBeNull();
    expect(nextGate(input(kinds, { phase: 'GUESS_COLLECT', lastPrivateSeat: 'P0' }))).toBeNull();
    expect(nextGate(input(kinds, { phase: 'GUESS_COLLECT', acknowledgedSeat: 'P0' }))).toBeNull();
    // another seat's marker does not hide the gate
    expect(nextGate(input(kinds, { turn: 'P1', acknowledgedSeat: 'P0' }))).not.toBeNull();
  });

  it('GUESS_COLLECT: the first human Seat in seat order without a submitted Guess, purpose GUESS', () => {
    const kinds = ['HUMAN', 'HUMAN', 'AI', 'AI'] as const;
    const g = (guessSubmitted: GateInput['guessSubmitted']): GateModel | null => nextGate(input(kinds, { phase: 'GUESS_COLLECT', turn: 'P3', guessSubmitted }));
    expect(g(NONE)).toEqual({ forSeat: 'P0', name: 'Alice', purpose: 'GUESS' });
    expect(g({ ...NONE, P0: true })).toEqual({ forSeat: 'P1', name: 'Bob', purpose: 'GUESS' });
    expect(g({ ...NONE, P1: true })).toEqual({ forSeat: 'P0', name: 'Alice', purpose: 'GUESS' });
    expect(g({ ...NONE, P0: true, P1: true })).toBeNull();
    // AI Seats are skipped whatever their flags say
    expect(g({ ...NONE, P2: true, P3: true })).toEqual({ forSeat: 'P0', name: 'Alice', purpose: 'GUESS' });
    expect(g({ P0: true, P1: true, P2: false, P3: false })).toBeNull();
  });

  it('GUESS_COLLECT with human Seats in the middle of the order (AI, human, AI, human)', () => {
    const kinds = ['AI', 'HUMAN', 'AI', 'HUMAN'] as const;
    const g = (guessSubmitted: GateInput['guessSubmitted']): GateModel | null => nextGate(input(kinds, { phase: 'GUESS_COLLECT', guessSubmitted }));
    expect(g(NONE)).toEqual({ forSeat: 'P1', name: 'Bob', purpose: 'GUESS' });
    expect(g({ ...NONE, P1: true })).toEqual({ forSeat: 'P3', name: 'Dave', purpose: 'GUESS' });
    expect(g({ ...NONE, P1: true, P3: true })).toBeNull();
  });

  it('four human Seats: HAND gates in turn order and GUESS gates in seat order', () => {
    const kinds = ['HUMAN', 'HUMAN', 'HUMAN', 'HUMAN'] as const;
    SEAT_IDS.forEach((seat, i) => {
      expect(nextGate(input(kinds, { turn: seat, lastPrivateSeat: SEAT_IDS[(i + 3) % 4] as PlayerId }))).toEqual({
        forSeat: seat,
        name: NAMES[i],
        purpose: 'HAND',
      });
    });
    let submitted: Record<PlayerId, boolean> = { ...NONE };
    SEAT_IDS.forEach((seat, i) => {
      expect(nextGate(input(kinds, { phase: 'GUESS_COLLECT', guessSubmitted: submitted }))).toEqual({
        forSeat: seat,
        name: NAMES[i],
        purpose: 'GUESS',
      });
      submitted = { ...submitted, [seat]: true };
    });
    expect(nextGate(input(kinds, { phase: 'GUESS_COLLECT', guessSubmitted: submitted }))).toBeNull();
  });

  it('REVEAL and ENDED need no gate (public screens), for every seat set', () => {
    for (const kinds of [
      ['HUMAN', 'HUMAN', 'AI', 'AI'],
      ['HUMAN', 'HUMAN', 'HUMAN', 'HUMAN'],
    ] as const) {
      for (const phase of ['REVEAL', 'ENDED'] as const) {
        for (const turn of SEAT_IDS) expect(nextGate(input(kinds, { phase, turn })), `${phase} ${turn}`).toBeNull();
      }
    }
  });

  it('is pure: frozen output, unchanged input, same result twice, only public fields', () => {
    const i = input(['HUMAN', 'HUMAN', 'AI', 'AI'], { turn: 'P1' });
    const before = JSON.stringify(i);
    const a = nextGate(i);
    const b = nextGate(i);
    expect(JSON.stringify(i)).toBe(before);
    expect(a).toEqual(b);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.keys(a as GateModel).sort()).toEqual(['forSeat', 'name', 'purpose']);
  });

  describe('on real views (one-code and two-code batches)', () => {
    for (const wanted of [1, 2]) {
      it(`two human Seats and two AI Seats, batch with ${wanted} code(s): GUESS gates in seat order, none for the AI Seats`, () => {
        const g = findBatch(['HUMAN', 'HUMAN', 'AI', 'AI'], wanted);
        const view = viewOf(g, 'P0');
        expect(view.pendingQuadKeys).toHaveLength(wanted);
        expect(nextGate(gateInputOf(view))).toEqual({ forSeat: 'P0', name: 'Alice', purpose: 'GUESS' });
        g.ctl.dispatchHuman({ type: 'SUBMIT_GUESSES', player: 'P0', guesses: Object.fromEntries(view.pendingQuadKeys.map((k) => [k, 9])) });
        const next = viewOf(g, 'P1');
        expect(next.phase).toBe('GUESS_COLLECT');
        expect(nextGate(gateInputOf(next, { lastPrivateSeat: 'P0' }))).toEqual({ forSeat: 'P1', name: 'Bob', purpose: 'GUESS' });
        expect(nextGate(gateInputOf(next, { lastPrivateSeat: 'P1' }))).toBeNull();
      });

      it(`four human Seats, batch with ${wanted} code(s)`, () => {
        const g = findBatch(['HUMAN', 'HUMAN', 'HUMAN', 'HUMAN'], wanted);
        let view = viewOf(g, 'P0');
        for (const [i, seat] of SEAT_IDS.entries()) {
          expect(nextGate(gateInputOf(view))).toEqual({ forSeat: seat, name: NAMES[i], purpose: 'GUESS' });
          g.ctl.dispatchHuman({ type: 'SUBMIT_GUESSES', player: seat, guesses: Object.fromEntries(view.pendingQuadKeys.map((k) => [k, 9])) });
          view = viewOf(g, 'P0');
        }
        expect(view.phase).toBe('REVEAL');
        expect(nextGate(gateInputOf(view))).toBeNull();
      });
    }

    it('PLACEMENT of a fresh two-human game starts with a HAND gate for the turn Seat', () => {
      const g = startGame(['HUMAN', 'HUMAN', 'AI', 'AI'], 3);
      const view = viewOf(g, 'P0');
      expect(view.phase).toBe('PLACEMENT');
      expect(nextGate(gateInputOf(view))).toEqual({ forSeat: view.turn, name: NAMES[SEAT_IDS.indexOf(view.turn)], purpose: 'HAND' });
    });

    it('a one-human game never gates, in every phase of a played game', () => {
      const g = findBatch(['HUMAN', 'AI', 'AI', 'AI'], 2);
      expect(nextGate(gateInputOf(viewOf(g, 'P0')))).toBeNull();
      expect(nextGate(gateInputOf(startGame(['HUMAN', 'AI', 'AI', 'AI'], 3).ctl.getView('P0') as PlayerView))).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------------------------------------
// renderPrivacyGate (fake DOM)
// ---------------------------------------------------------------------------------------------------------

function dump(el: FakeEl): string {
  const attrs = [...el.attributes].map(([k, v]) => ` ${k}="${v}"`).join('');
  const value = (el as unknown as { value?: unknown }).value;
  const own = el.children.length === 0 ? el.textContent : '';
  const tag = el.tagName.replace(/\d/g, '#'); // h2 is markup, not content
  return `<${tag}${attrs}${typeof value === 'string' ? ` value="${value}"` : ''}>${own}${el.children.map(dump).join('')}</${tag}>`;
}

const ALICE_HAND_GATE: GateModel = Object.freeze({ forSeat: 'P1', name: 'Bob', purpose: 'HAND' });

interface Harness {
  readonly doc: FakeDocument;
  readonly root: FakeEl;
  readonly log: string[];
  readonly acks: unknown[];
  state: GateCurrent;
  readonly options: PrivacyGateOptions;
}

/** A page with a private region (the previous Seat's Hand) that `clearPrivate` removes. */
function harness(gate: GateModel = ALICE_HAND_GATE, actionCount = 7): Harness {
  const doc = new FakeDocument();
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const privateEl = doc.createElement('div');
  privateEl.setAttribute('data-private', '1');
  const secret = doc.createElement('button');
  secret.textContent = 'Ace of Spades, upright';
  privateEl.appendChild(secret);
  root.appendChild(privateEl);
  const log: string[] = [];
  const acks: unknown[] = [];
  const hasPrivate = (): boolean => doc.all().some((el) => el.getAttribute('data-private') === '1');
  const hasGate = (): boolean => doc.all().some((el) => el.getAttribute('class')?.startsWith('privacy-gate') === true);
  const original = root.appendChild.bind(root);
  root.appendChild = (child: FakeEl): FakeEl => {
    log.push(`append(gate=${hasGate()},private=${hasPrivate()})`);
    return original(child);
  };
  const h: Harness = {
    doc,
    root,
    log,
    acks,
    state: { gate, actionCount },
    options: {
      gate,
      actionCount,
      clearPrivate: () => {
        log.push(`clear(gate=${hasGate()},private=${hasPrivate()})`);
        privateEl.parentNode?.removeChild(privateEl);
      },
      current: () => h.state,
      onAcknowledge: (ack) => {
        log.push(`ack(gate=${hasGate()},private=${hasPrivate()})`);
        acks.push(ack);
      },
    },
  };
  return h;
}

const asDoc = (d: FakeDocument): PrivacyGateDocument => d as unknown as PrivacyGateDocument;
const mount = (h: Harness) => renderPrivacyGate(asDoc(h.doc), h.root as unknown as HTMLElement, h.options, t);
const ready = (h: Harness): FakeEl => h.doc.getElementById(PRIVACY_GATE_ACK_ID) as FakeEl;

describe('renderPrivacyGate [fake-DOM]', () => {
  it('removes the previous private DOM first, then creates the gate; the private view comes only after the acknowledgement', () => {
    const h = harness();
    expect(h.doc.all().some((el) => el.getAttribute('data-private') === '1')).toBe(true);
    const handle = mount(h);
    // order: clear (no gate yet, private still there), append (no private left, no gate yet)
    expect(h.log).toEqual(['clear(gate=false,private=true)', 'append(gate=false,private=false)']);
    expect(h.doc.all().some((el) => el.getAttribute('data-private') === '1')).toBe(false);
    expect(h.acks).toEqual([]); // nothing is rendered for the next Seat before the acknowledgement
    ready(h).fire('click');
    expect(h.log).toEqual(['clear(gate=false,private=true)', 'append(gate=false,private=false)', 'ack(gate=false,private=false)']);
    expect(handle.closed).toBe(true);
  });

  it('is a labelled modal dialog with the public name, a localized button and no other content', () => {
    const h = harness();
    const handle = mount(h);
    const gate = asFake(handle.element);
    expect(gate.getAttribute('role')).toBe('dialog');
    expect(gate.getAttribute('aria-modal')).toBe('true');
    const title = h.doc.getElementById(gate.getAttribute('aria-labelledby') as string) as FakeEl;
    const message = h.doc.getElementById(gate.getAttribute('aria-describedby') as string) as FakeEl;
    expect(title.textContent).toBe('Pass the device');
    expect(message.textContent).toContain('Bob');
    expect(message.textContent).toContain('place a card');
    const button = ready(h);
    expect(button.tagName).toBe('button');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.textContent).toBe('I am ready');
    expect(gate.children.map((c) => c.tagName)).toEqual(['h2', 'p', 'button']);
  });

  it('shows the GUESS purpose text for a Guess gate, in Korean as well', () => {
    const guess: GateModel = { forSeat: 'P0', name: 'Alice', purpose: 'GUESS' };
    const en = harness(guess);
    mount(en);
    expect((en.doc.getElementById('privacy-gate-message') as FakeEl).textContent).toContain('Guesses');
    setLanguage('ko');
    const ko = harness(guess);
    mount(ko);
    expect((ko.doc.getElementById('privacy-gate-message') as FakeEl).textContent).toMatch(/[\uAC00-\uD7A3]/);
    expect((ko.doc.getElementById('privacy-gate-message') as FakeEl).textContent).toContain('Alice');
    expect(ready(ko).textContent).toBe('준비되었습니다');
  });

  it('moves the focus to the acknowledge button and the button can be found again by renderWithFocus', () => {
    const h = harness();
    mount(h);
    const button = ready(h);
    expect(h.doc.activeElement).toBe(button);
    expect(captureFocus(h.doc as unknown as FocusDoc)).toEqual({ kind: 'key', value: PRIVACY_GATE_ACK_ID });
    expect(button.getAttribute('id')).toBe(PRIVACY_GATE_ACK_ID);
  });

  it('is operated by the keyboard like any button: the only focusable control, activated by click (Enter or Space)', () => {
    const h = harness();
    const handle = mount(h);
    const controls = h.doc.all().filter((el) => ['button', 'input', 'a', 'select', 'textarea'].includes(el.tagName) || el.hasAttribute('tabindex'));
    expect(controls).toEqual([ready(h)]);
    ready(h).fire('click');
    expect(h.acks).toHaveLength(1);
    expect(handle.element.parentNode).toBeNull();
  });

  it('acknowledges exactly once: a double click or a later click does nothing more', () => {
    const h = harness();
    const handle = mount(h);
    const button = ready(h);
    button.fire('click');
    button.fire('click');
    button.fire('click');
    expect(h.acks).toEqual([{ forSeat: 'P1', purpose: 'HAND', actionCount: 7 }]);
    handle.update(ALICE_HAND_GATE, 7); // an update after the acknowledgement does not bring the gate back
    expect(h.doc.all().filter((el) => el.getAttribute('class')?.startsWith('privacy-gate') === true)).toHaveLength(0);
  });

  it('a stale callback does nothing: the host wants another gate, no gate, or another actionCount', () => {
    const h = harness();
    const handle = mount(h);
    const button = ready(h);
    h.state = { gate: null, actionCount: 7 };
    button.fire('click');
    h.state = { gate: { forSeat: 'P2', name: 'Carol', purpose: 'HAND' }, actionCount: 7 };
    button.fire('click');
    h.state = { gate: { forSeat: 'P1', name: 'Bob', purpose: 'GUESS' }, actionCount: 7 };
    button.fire('click');
    h.state = { gate: ALICE_HAND_GATE, actionCount: 8 };
    button.fire('click');
    expect(h.acks).toEqual([]);
    expect(handle.closed).toBe(false);
    expect(handle.element.parentNode).not.toBeNull();
    h.state = { gate: ALICE_HAND_GATE, actionCount: 7 }; // the host agrees again: the gate still works
    button.fire('click');
    expect(h.acks).toHaveLength(1);
  });

  it('a second handle of an already acknowledged gate does nothing (the host cleared the gate)', () => {
    const h = harness();
    const first = mount(h);
    const other = mount(h);
    const buttons = h.doc.all().filter((el) => el.getAttribute('id') === PRIVACY_GATE_ACK_ID);
    expect(buttons).toHaveLength(2);
    (buttons[0] as FakeEl).fire('click');
    h.state = { gate: null, actionCount: 7 }; // acknowledgedSeat is set: nextGate returns null now
    (buttons[1] as FakeEl).fire('click');
    expect(h.acks).toHaveLength(1);
    expect(first.closed).toBe(true);
    expect(other.closed).toBe(false);
  });

  it('a language change or a re-render keeps the same gate, in place, with the focus, and never shows a private view', () => {
    const h = harness();
    const handle = mount(h);
    const before = ready(h);
    const element = handle.element;
    setLanguage('ko');
    handle.update(ALICE_HAND_GATE, 7);
    handle.update(ALICE_HAND_GATE, 7);
    expect(handle.element).toBe(element);
    expect(ready(h)).toBe(before);
    expect(h.doc.activeElement).toBe(before);
    expect(before.textContent).toBe('준비되었습니다');
    expect((h.doc.getElementById('privacy-gate-title') as FakeEl).textContent).toMatch(/[\uAC00-\uD7A3]/);
    expect(h.doc.all().filter((el) => el.getAttribute('role') === 'dialog')).toHaveLength(1);
    expect(h.doc.all().some((el) => el.getAttribute('data-private') === '1')).toBe(false);
    expect(h.log.filter((l) => l.startsWith('clear'))).toHaveLength(1); // re-rendering is not a second hand-over
    expect(h.acks).toEqual([]);
  });

  it('update can re-bind the gate to the next Seat (the acknowledgement then belongs to that Seat)', () => {
    const h = harness();
    const handle = mount(h);
    const next: GateModel = { forSeat: 'P2', name: 'Carol', purpose: 'GUESS' };
    handle.update(next, 9);
    expect((h.doc.getElementById('privacy-gate-message') as FakeEl).textContent).toContain('Carol');
    h.state = { gate: ALICE_HAND_GATE, actionCount: 7 };
    ready(h).fire('click');
    expect(h.acks).toEqual([]); // the old binding is gone
    h.state = { gate: next, actionCount: 9 };
    ready(h).fire('click');
    expect(h.acks).toEqual([{ forSeat: 'P2', purpose: 'GUESS', actionCount: 9 }]);
  });

  it('dispose removes the gate without acknowledging; a click on the old button does nothing', () => {
    const h = harness();
    const handle = mount(h);
    const button = ready(h);
    handle.dispose();
    handle.dispose();
    button.fire('click');
    expect(h.acks).toEqual([]);
    expect(handle.closed).toBe(true);
    expect(h.doc.getElementById(PRIVACY_GATE_ACK_ID)).toBeNull();
  });

  it('has every string it uses in both languages', () => {
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      for (const key of PRIVACY_GATE_STRING_KEYS) expect(t(key, { name: 'X' }), `${lang} ${key}`).not.toBe(key);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// Privacy: nothing private in the model or in the DOM
// ---------------------------------------------------------------------------------------------------------

describe('the gate model and the gate DOM contain public data only', () => {
  const SAMPLE_GUESSES = ['4', '12', '20', '23', '30', '47', '52'];
  /** The model's own seat id is public by design (it is the next Seat); everything else of its JSON must be clean. */
  const publicJson = (model: unknown): string => JSON.stringify(model).replace(/"forSeat":"P[0-3]"/, '');

  /** Every private string: all 52 CardIds, hidden-sum / guess words, seat ids and any digit. */
  function expectNoPrivateData(text: string, label: string): void {
    for (const card of ALL_CARDS) expect(text.includes(card), `${label}: ${card}`).toBe(false);
    for (const word of ['hiddenSum', 'Hidden_Sum', 'myHand', 'myGuesses', 'guesses', 'pendingQuadKeys', 'lastReveal', 'history', 'seed']) {
      expect(text.includes(word), `${label}: ${word}`).toBe(false);
    }
    expect(/\d/.test(text), `${label}: a digit (a Guess, a count or an index)`).toBe(false);
    expect(/\bP[0-3]\b/.test(text), `${label}: a seat id`).toBe(false);
    for (const guess of SAMPLE_GUESSES) expect(new RegExp(`(^|\\D)${guess}(\\D|$)`).test(text), `${label}: ${guess}`).toBe(false);
  }

  it('serialized models of a real two-human game (placement and Guess entry) carry no private data', () => {
    const g = findBatch(['HUMAN', 'HUMAN', 'AI', 'AI'], 2);
    const guessView = viewOf(g, 'P0');
    const model = nextGate(gateInputOf(guessView)) as GateModel;
    expect(model.purpose).toBe('GUESS');
    expectNoPrivateData(publicJson(model), 'guess model');
    const fresh = viewOf(startGame(['HUMAN', 'HUMAN', 'AI', 'AI'], 3), 'P0');
    expectNoPrivateData(publicJson(nextGate(gateInputOf(fresh))), 'hand model');
  });

  for (const lang of ['en', 'ko'] as const) {
    for (const purpose of ['HAND', 'GUESS'] as const) {
      it(`the DOM of a ${purpose} gate in ${lang} (text, attributes, aria, hidden nodes, value properties) has no private data`, () => {
        setLanguage(lang);
        const model: GateModel = { forSeat: 'P1', name: 'Bob', purpose };
        const h = harness(model);
        mount(h);
        h.root.setAttribute('aria-label', 'page');
        const everything = dump(h.doc.body);
        expectNoPrivateData(everything.replace('data-private="1"', ''), `${lang} ${purpose}`);
        // the previous Seat's private region and its card name are gone from the page
        expect(everything).not.toContain('Ace of Spades');
        expect(everything).not.toContain('data-private');
      });
    }
  }

  it('a real view of a Seat holding cards and Guesses leaks none of them into the gate that precedes the next Seat', () => {
    const g = findBatch(['HUMAN', 'HUMAN', 'AI', 'AI'], 1);
    const view = viewOf(g, 'P0');
    g.ctl.dispatchHuman({ type: 'SUBMIT_GUESSES', player: 'P0', guesses: Object.fromEntries(view.pendingQuadKeys.map((k) => [k, 37])) });
    const next = viewOf(g, 'P1');
    const model = nextGate(gateInputOf(next, { lastPrivateSeat: 'P0' })) as GateModel;
    const h = harness(model);
    mount(h);
    const text = dump(h.doc.body) + publicJson(model);
    for (const card of [...view.myHand, ...next.myHand]) expect(text.includes(card), card).toBe(false);
    expect(text.includes('37')).toBe(false);
    expectNoPrivateData(text, 'real game');
  });
});

describe('source of privacy-gate.ts', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'privacy-gate.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('reads no private field of the view and uses no storage, console, global or HTML parsing', () => {
    expect(code).not.toMatch(/myHand|myGuesses|pendingQuadKeys|lastReveal|history|hiddenSum|\.board\b/);
    expect(code).not.toMatch(/console|localStorage|sessionStorage|\bwindow\b|\bglobalThis\b|\bdocument\b|data-|['"]title['"]|\btitle\s*:/);
    expect(code).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
    expect(code).not.toMatch(/Date|Math\.random|setTimeout/);
  });
});
