// Tests of the private Guess entry (task 18.1). Evidence classes (design.md, "Testing Strategy"):
//   * fake-DOM : `renderGuessEntry` against the hand-written fake Document of ui/testing/fake-dom.ts with synthetic
//                events, wired to the REAL controller and engine (real `PlayerView`s with one and two pending codes,
//                real `handlers.dispatch`, real `DUPLICATE_SUBMISSION`). NOT a browser: no layout, no real focus, no
//                screen reader, no browser autofill. The composed page is task 19.4; the headless-DOM smoke test is
//                task 21.3.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { getStrategy } from '../../ai/registry';
import { ALL_CARDS } from '../../core/cards';
import { defaultConfig } from '../../core/state';
import type { Action, GameConfig, PlayerId } from '../../core/types';
import type { PlayerView } from '../../core/view';
import { resetLanguage, setLanguage, t } from '../../i18n';
import { createController } from '../controller';
import type { Controller, RenderInput, Schedule } from '../controller';
import { captureFocus, renderWithFocus } from '../dom';
import type { FocusDoc } from '../dom';
import { asFake, FakeDocument } from '../testing/fake-dom';
import type { FakeEl } from '../testing/fake-dom';
import { GUESS_ENTRY_STRING_KEYS, renderGuessEntry } from './guess-entry';
import type { GuessDispatchResult, GuessEntryDocument, GuessEntryHandle, GuessEntryInput, GuessEntryOptions, GuessSubmitAction } from './guess-entry';

afterEach(() => resetLanguage());

// ---------------------------------------------------------------------------------------------------------
// Fixture: real games driven to a GUESS_COLLECT batch with a wanted number of pending codes
// ---------------------------------------------------------------------------------------------------------

type Kind = 'HUMAN' | 'AI';
const SEAT_IDS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];
const NAMES = ['Alice', 'Bob', 'Carol', 'Dave'] as const; // public names without digits

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
  readonly latest: () => RenderInput;
}

function startGame(kinds: readonly Kind[], seed: number): Game {
  const queue = new Queue();
  let latest: RenderInput | null = null;
  const ctl = createController({
    schedule: queue.schedule,
    renderer: (i) => {
      latest = i;
    },
    randomSeed: () => seed,
    language: () => 'en',
  });
  const seats = kinds.map((kind, i) =>
    kind === 'HUMAN'
      ? { id: SEAT_IDS[i], kind, name: NAMES[i] }
      : { id: SEAT_IDS[i], kind, difficulty: 'BEGINNER', name: NAMES[i] },
  ) as unknown as GameConfig['seats'];
  ctl.startGame({ config: { ...defaultConfig(), seats }, seed });
  return { ctl, queue, humans: SEAT_IDS.filter((_, i) => kinds[i] === 'HUMAN'), latest: () => latest as RenderInput };
}

const viewOf = (g: Game, seat: PlayerId): PlayerView => g.ctl.getView(seat) as PlayerView;

/** Plays (BEGINNER placements for the people) to a batch with `wanted` codes, nobody submitted, `minHistory` reveals done. */
function advanceToBatch(g: Game, wanted: number, minHistory: number): boolean {
  for (let i = 0; i < 3000; i++) {
    const view = viewOf(g, g.humans[0] as PlayerId);
    if (view.phase === 'ENDED') return false;
    if (view.phase === 'GUESS_COLLECT') {
      if (view.pendingQuadKeys.length === wanted && view.history.length >= minHistory && SEAT_IDS.every((s) => !view.guessSubmitted[s])) return true;
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

const seedMemo = new Map<string, number>();
function batchGame(kinds: readonly Kind[], wanted: number, minHistory = 0): Game {
  const memo = `${kinds.join()}|${wanted}|${minHistory}`;
  const known = seedMemo.get(memo);
  if (known !== undefined) {
    const g = startGame(kinds, known);
    if (!advanceToBatch(g, wanted, minHistory)) throw new Error('memoized seed no longer works');
    return g;
  }
  for (let seed = 1; seed <= 300; seed++) {
    const g = startGame(kinds, seed);
    if (advanceToBatch(g, wanted, minHistory)) {
      seedMemo.set(memo, seed);
      return g;
    }
  }
  throw new Error(`no seed gives a batch with ${wanted} codes (history >= ${minHistory})`);
}

// ---------------------------------------------------------------------------------------------------------
// Rig: fake document, spy handlers over the real `handlers.dispatch`, optional host wiring
// ---------------------------------------------------------------------------------------------------------

const asDoc = (d: FakeDocument): GuessEntryDocument => d as unknown as GuessEntryDocument;
const asRoot = (e: FakeEl): HTMLElement => e as unknown as HTMLElement;
const fd = (d: FakeDocument): FocusDoc => d as unknown as FocusDoc;

interface Rig {
  readonly g: Game;
  readonly doc: FakeDocument;
  readonly root: FakeEl;
  readonly calls: GuessSubmitAction[];
  readonly results: GuessDispatchResult[];
  inputFor(seat: PlayerId): GuessEntryInput;
  mount(seat: PlayerId, options?: GuessEntryOptions, into?: FakeEl): GuessEntryHandle;
}

function rig(g: Game, override?: (a: GuessSubmitAction) => GuessDispatchResult | undefined): Rig {
  setLanguage('en');
  const doc = new FakeDocument();
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const calls: GuessSubmitAction[] = [];
  const results: GuessDispatchResult[] = [];
  const r: Rig = {
    g,
    doc,
    root,
    calls,
    results,
    inputFor: (seat) => ({
      view: g.ctl.getView(seat),
      model: g.ctl.getModel(),
      handlers: {
        dispatch: (action) => {
          calls.push(action);
          const result = override?.(action) ?? g.latest().handlers.dispatch(action);
          results.push(result);
          return result;
        },
      },
    }),
    mount: (seat, options, into) => renderGuessEntry(asDoc(doc), asRoot(into ?? root), r.inputFor(seat), t, options),
  };
  return r;
}

/** The host: re-renders the form on every model change, as the controller's renderer would. */
const wire = (r: Rig, seat: PlayerId, form: GuessEntryHandle): (() => void) => r.g.ctl.subscribe(() => form.update(r.inputFor(seat)));

// ---------------------------------------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------------------------------------

const inputsOf = (doc: FakeDocument): FakeEl[] => doc.all().filter((el) => el.tagName === 'input');
const buttonsOf = (doc: FakeDocument): FakeEl[] => doc.all().filter((el) => el.tagName === 'button');
const byId = (doc: FakeDocument, id: string): FakeEl => doc.getElementById(id) as FakeEl;
const typeInto = (el: FakeEl, text: string): void => {
  (el as unknown as { value: string }).value = text;
  el.fire('input');
};
const valueOf = (el: FakeEl): unknown => (el as unknown as { value?: unknown }).value;
const errorOf = (doc: FakeDocument, key: string): string => byId(doc, `guess-error-${key}`).textContent;
const press = (el: FakeEl, key: string): void => void el.fire('keydown', { key });

function dump(el: FakeEl): string {
  const attrs = [...el.attributes].map(([k, v]) => ` ${k}="${v}"`).join('');
  const value = valueOf(el);
  const own = el.children.length === 0 ? el.textContent : '';
  const tag = el.tagName.replace(/\d/g, '#'); // `h2` is markup, not content
  return `<${tag}${attrs}${typeof value === 'string' ? ` value="${value}"` : ''}>${own}${el.children.map(dump).join('')}</${tag}>`;
}

/** Digits that remain after the public ones (Quad_Keys, cell notations, the range 4 and 52, "2×2", tabindex -1) are removed. */
function leftoverDigits(text: string): string {
  return text.replace(/tabindex="-1"/g, '').replace(/[A-H][1-8]/g, '').replace(/2×2/g, '').replace(/\b52\b/g, '').replace(/\b4\b/g, '').replace(/[^\d]+/g, ' ').trim();
}

const GUESS_VALUES = ['37', '41'] as const;

/** Types a distinct valid value into every input and returns the values by key. */
function fillAll(doc: FakeDocument, keys: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  keys.forEach((key, i) => {
    typeInto(byId(doc, `guess-input-${key}`), ` ${GUESS_VALUES[i % 2]} `);
    out[key] = Number(GUESS_VALUES[i % 2]);
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Structure, labels, keyboard order
// ---------------------------------------------------------------------------------------------------------

describe('the form for one-code and two-code batches [fake-DOM, real engine]', () => {
  for (const wanted of [1, 2]) {
    describe(`${wanted} pending code(s), one person and three AI Seats`, () => {
      it('has one input per pending Quad_Key, in order, each with an associated label, range text and region hint', () => {
        const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], wanted);
        const r = rig(g);
        const keys = viewOf(g, 'P0').pendingQuadKeys;
        expect(keys).toHaveLength(wanted);
        r.mount('P0');
        const inputs = inputsOf(r.doc);
        expect(inputs.map((i) => i.getAttribute('id'))).toEqual(keys.map((k) => `guess-input-${k}`));
        for (const key of keys) {
          const input = byId(r.doc, `guess-input-${key}`);
          expect(input.getAttribute('type')).toBe('text'); // never type=number (it hides malformed text)
          expect(input.getAttribute('inputmode')).toBe('numeric');
          expect(input.getAttribute('autocomplete')).toBe('off');
          expect(input.getAttribute('name')).toBeNull();
          expect(input.getAttribute('aria-invalid')).toBe('false');
          expect(input.getAttribute('data-focus-key')).toBe(`guess-input-${key}`);
          const label = r.doc.all().find((el) => el.tagName === 'label' && el.getAttribute('for') === `guess-input-${key}`) as FakeEl;
          expect(label.textContent).toBe(`Guess for code ${key} (whole number from 4 to 52)`);
          const describedBy = (input.getAttribute('aria-describedby') as string).split(' ');
          expect(describedBy).toEqual([`guess-region-${key}`, `guess-error-${key}`]);
          expect(byId(r.doc, `guess-region-${key}`).textContent).toMatch(new RegExp(`^Code ${key}: the 2×2 region of the board with the cells ${key}, `));
          expect(byId(r.doc, `guess-error-${key}`).getAttribute('role')).toBe('alert');
          expect(byId(r.doc, `guess-error-${key}`).textContent).toBe('');
        }
      });

      it('Tab order is the inputs, then the submit button', () => {
        const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], wanted);
        const r = rig(g);
        r.mount('P0');
        const focusable = r.doc.all().filter((el) => ['input', 'button', 'a', 'select', 'textarea'].includes(el.tagName) || el.hasAttribute('tabindex'));
        expect(focusable.map((el) => el.getAttribute('id'))).toEqual([...viewOf(g, 'P0').pendingQuadKeys.map((k) => `guess-input-${k}`), 'guess-submit']);
        expect(byId(r.doc, 'guess-submit').getAttribute('type')).toBe('submit');
        expect(asFake(r.root.children[0] as unknown as HTMLElement).getAttribute('class')).toBe('guess-entry');
      });

      it('shows public Seat status only: every Seat waiting, no value anywhere', () => {
        const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], wanted);
        const r = rig(g);
        r.mount('P0');
        const items = r.doc.all().filter((el) => el.tagName === 'li').map((el) => el.textContent);
        expect(items).toEqual(['Alice: waiting', 'Bob: waiting', 'Carol: waiting', 'Dave: waiting']);
      });
    });
  }

  it('shows no Hidden_Sum, no card and no history after earlier reveals (digits of the page are public ones only)', () => {
    const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 1, 1);
    const view = viewOf(g, 'P0');
    expect(view.history.length).toBeGreaterThanOrEqual(1);
    expect(view.lastReveal).not.toBeNull();
    const r = rig(g);
    const form = r.mount('P0');
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      form.update(r.inputFor('P0'));
      const text = dump(r.doc.body);
      for (const card of ALL_CARDS) expect(text.includes(card), `${lang} ${card}`).toBe(false);
      for (const word of ['hiddenSum', 'Hidden', 'lastReveal', 'history']) expect(text.includes(word), word).toBe(false);
      expect(leftoverDigits(text), lang).toBe('');
      for (const record of view.history) for (const code of record.codes) expect(text.includes(`>${code.hiddenSum}<`)).toBe(false);
    }
  });

  it('renders Korean and English with every placeholder replaced', () => {
    const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 2);
    const r = rig(g);
    const form = r.mount('P0');
    expect(dump(r.doc.body)).not.toMatch(/\{[A-Za-z_]+\}/);
    expect(byId(r.doc, 'guess-submit').textContent).toBe('Submit Guesses');
    setLanguage('ko');
    form.update(r.inputFor('P0'));
    const ko = dump(r.doc.body);
    expect(ko).not.toMatch(/\{[A-Za-z_]+\}/);
    expect(byId(r.doc, 'guess-submit').textContent).toBe('예측값 제출');
    expect(ko).toMatch(/[\uAC00-\uD7A3]/);
    for (const key of viewOf(g, 'P0').pendingQuadKeys) {
      expect(ko).toContain(`${key} 조합의 예측값 (4에서 52 사이의 정수)`);
    }
    expect(r.doc.all().filter((el) => el.tagName === 'li').map((el) => el.textContent)[0]).toBe('Alice: 대기 중');
  });

  it('has every string it uses in both languages', () => {
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      for (const key of GUESS_ENTRY_STRING_KEYS) expect(t(key, { min: 4, max: 52, key: 'D4', cells: 'D4', name: 'X' }), `${lang} ${key}`).not.toBe(key);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// Validation, missing keys, bounds
// ---------------------------------------------------------------------------------------------------------

describe('validation before sending [fake-DOM, real engine]', () => {
  const INVALID: readonly [string, string][] = [
    ['4.0', 'Enter a whole number'],
    ['1e1', 'Enter a whole number'],
    ['0x10', 'Enter a whole number'],
    ['+', 'Enter a whole number'],
    ['--3', 'Enter a whole number'],
    ['NaN', 'Enter a whole number'],
    ['Infinity', 'Enter a whole number'],
    ['٤', 'Enter a whole number'],
    ['3', 'The guess must be between 4 and 52'],
    ['53', 'The guess must be between 4 and 52'],
    ['0', 'The guess must be between 4 and 52'],
    ['-3', 'The guess must be between 4 and 52'],
    ['99999999999999999999', 'The guess must be between 4 and 52'],
  ];

  it('sends nothing for invalid text: inline message, aria-invalid, first invalid input focused, engine state unchanged', () => {
    const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 2);
    const r = rig(g);
    const form = r.mount('P0');
    const [k1, k2] = viewOf(g, 'P0').pendingQuadKeys as [string, string];
    const before = JSON.stringify(viewOf(g, 'P0'));
    const countBefore = g.ctl.getModel().actionCount;
    for (const [text, message] of INVALID) {
      typeInto(byId(r.doc, `guess-input-${k1}`), '20');
      typeInto(byId(r.doc, `guess-input-${k2}`), text);
      form.submit();
      expect(r.calls, text).toEqual([]);
      expect(errorOf(r.doc, k2), text).toBe(message);
      expect(errorOf(r.doc, k1), text).toBe('');
      expect(byId(r.doc, `guess-input-${k2}`).getAttribute('aria-invalid'), text).toBe('true');
      expect(byId(r.doc, `guess-input-${k1}`).getAttribute('aria-invalid'), text).toBe('false');
      expect(r.doc.activeElement, text).toBe(byId(r.doc, `guess-input-${k2}`));
      expect(form.mode).toBe('form');
    }
    expect(JSON.stringify(viewOf(g, 'P0'))).toBe(before);
    expect(g.ctl.getModel().actionCount).toBe(countBefore);
  });

  it('focuses the FIRST invalid input and shows every message at once', () => {
    const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 2);
    const r = rig(g);
    const form = r.mount('P0');
    const [k1, k2] = viewOf(g, 'P0').pendingQuadKeys as [string, string];
    typeInto(byId(r.doc, `guess-input-${k1}`), '3');
    typeInto(byId(r.doc, `guess-input-${k2}`), 'x');
    byId(r.doc, `guess-input-${k2}`).focus();
    form.submit();
    expect(errorOf(r.doc, k1)).toBe('The guess must be between 4 and 52');
    expect(errorOf(r.doc, k2)).toBe('Enter a whole number');
    expect(r.doc.activeElement).toBe(byId(r.doc, `guess-input-${k1}`));
    expect(r.calls).toEqual([]);
  });

  it('reports a missing or blank key and sends nothing; typing in the field clears its own message', () => {
    const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 2);
    const r = rig(g);
    const form = r.mount('P0');
    const [k1, k2] = viewOf(g, 'P0').pendingQuadKeys as [string, string];
    typeInto(byId(r.doc, `guess-input-${k1}`), '20');
    form.submit(); // the second key was never typed
    expect(r.calls).toEqual([]);
    expect(errorOf(r.doc, k2)).toBe('Enter a whole number from 4 to 52');
    expect(errorOf(r.doc, k1)).toBe('');
    expect(r.doc.activeElement).toBe(byId(r.doc, `guess-input-${k2}`));
    typeInto(byId(r.doc, `guess-input-${k2}`), '   '); // spaces only is blank too
    form.submit();
    expect(r.calls).toEqual([]);
    expect(errorOf(r.doc, k2)).toBe('Enter a whole number from 4 to 52');
    typeInto(byId(r.doc, `guess-input-${k2}`), '2');
    expect(errorOf(r.doc, k2)).toBe('');
    expect(byId(r.doc, `guess-input-${k2}`).getAttribute('aria-invalid')).toBe('false');
  });

  it('localizes the inline messages and re-localizes a message that is already shown', () => {
    const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 1);
    const r = rig(g);
    const form = r.mount('P0');
    const [k1] = viewOf(g, 'P0').pendingQuadKeys as [string];
    typeInto(byId(r.doc, `guess-input-${k1}`), '53');
    form.submit();
    expect(errorOf(r.doc, k1)).toBe('The guess must be between 4 and 52');
    setLanguage('ko');
    form.update(r.inputFor('P0'));
    expect(errorOf(r.doc, k1)).toBe('예측값은 4에서 52 사이여야 합니다');
    typeInto(byId(r.doc, `guess-input-${k1}`), '');
    form.submit();
    expect(errorOf(r.doc, k1)).toBe('4에서 52 사이의 정수를 입력하세요');
  });

  it('accepts 4 and 52 (and sends the numbers, not the text)', () => {
    const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 2);
    const r = rig(g);
    const form = r.mount('P0');
    const [k1, k2] = viewOf(g, 'P0').pendingQuadKeys as [string, string];
    typeInto(byId(r.doc, `guess-input-${k1}`), '4');
    typeInto(byId(r.doc, `guess-input-${k2}`), '52');
    form.submit();
    expect(r.calls).toEqual([{ type: 'SUBMIT_GUESSES', player: 'P0', guesses: { [k1]: 4, [k2]: 52 } }]);
    expect(r.results).toEqual([{ ok: true }]);
    expect(viewOf(g, 'P0').guessSubmitted.P0).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Submission, keyboard, duplicates
// ---------------------------------------------------------------------------------------------------------

describe('submission [fake-DOM, real engine]', () => {
  for (const wanted of [1, 2]) {
    it(`sends exactly one SUBMIT_GUESSES with exactly the ${wanted} pending key(s); the form then shows only a status`, () => {
      const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], wanted);
      const r = rig(g);
      const form = r.mount('P0');
      wire(r, 'P0', form);
      const keys = viewOf(g, 'P0').pendingQuadKeys;
      const typed = fillAll(r.doc, keys);
      const inputsBefore = inputsOf(r.doc);
      const countBefore = g.ctl.getModel().actionCount;
      byId(r.doc, 'guess-submit').fire('click');
      expect(r.calls).toEqual([{ type: 'SUBMIT_GUESSES', player: 'P0', guesses: typed }]);
      expect(Object.keys(r.calls[0]?.guesses ?? {})).toEqual([...keys]);
      expect(g.ctl.getModel().actionCount).toBe(countBefore + 1);
      expect(form.mode).toBe('submitted');
      // the values are gone from the DOM and from the input elements
      expect(inputsOf(r.doc)).toEqual([]);
      for (const input of inputsBefore) expect(valueOf(input)).toBe('');
      const text = dump(r.doc.body);
      for (const v of GUESS_VALUES) expect(text.includes(v), v).toBe(false);
      expect(byId(r.doc, 'guess-status').textContent).toBe('Your Guesses are submitted. Waiting for the other players.');
      expect(byId(r.doc, 'guess-status').getAttribute('role')).toBe('status');
      expect(r.doc.activeElement).toBe(byId(r.doc, 'guess-status')); // the focus lands on a defined target
      expect(r.doc.all().filter((el) => el.tagName === 'li').map((el) => el.textContent)).toEqual([
        'Alice: submitted',
        'Bob: waiting',
        'Carol: waiting',
        'Dave: waiting',
      ]);
    });
  }

  it('shows AI Seats as submitted without any value once they have submitted; the viewer\'s own values never appear', () => {
    const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 2);
    const r = rig(g);
    const form = r.mount('P0');
    wire(r, 'P0', form);
    fillAll(r.doc, viewOf(g, 'P0').pendingQuadKeys);
    form.submit();
    expect(g.queue.step()).toBe(true); // the three AI Seats submit; the batch is revealed
    const text = dump(r.doc.body);
    expect(viewOf(g, 'P0').phase).not.toBe('GUESS_COLLECT');
    for (const v of GUESS_VALUES) expect(text.includes(v)).toBe(false);
    expect(leftoverDigits(text)).toBe('');
    expect(r.doc.all().filter((el) => el.tagName === 'li').map((el) => el.textContent)).toEqual([
      'Alice: waiting', // after the reveal `guessSubmitted` is cleared; the form is closed and out of date
      'Bob: waiting',
      'Carol: waiting',
      'Dave: waiting',
    ]);
    expect(form.mode).toBe('submitted');
  });

  it('Enter in an input submits; Enter or a click again sends nothing more', () => {
    const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 1);
    const r = rig(g);
    const form = r.mount('P0');
    wire(r, 'P0', form);
    const [k] = viewOf(g, 'P0').pendingQuadKeys as [string];
    const input = byId(r.doc, `guess-input-${k}`);
    typeInto(input, '25');
    const event = input.fire('keydown', { key: 'Enter' });
    expect(event.defaultPrevented).toBe(true);
    press(input, 'Enter');
    byId(r.doc, 'guess-submit')?.fire('click');
    form.submit();
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]).toEqual({ type: 'SUBMIT_GUESSES', player: 'P0', guesses: { [k]: 25 } });
  });

  it('other keys do not submit; the form submit event submits once; a composing Enter is ignored', () => {
    const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 1);
    const r = rig(g);
    const form = r.mount('P0');
    const [k] = viewOf(g, 'P0').pendingQuadKeys as [string];
    const input = byId(r.doc, `guess-input-${k}`);
    typeInto(input, '25');
    for (const key of ['Tab', 'a', ' ', 'Escape', '5']) press(input, key);
    input.fire('keydown', { key: 'Enter', isComposing: true } as never);
    expect(r.calls).toEqual([]);
    const formEl = r.doc.all().find((el) => el.tagName === 'form') as FakeEl;
    const submitEvent = formEl.fire('submit');
    expect(submitEvent.defaultPrevented).toBe(true);
    expect(r.calls).toHaveLength(1);
    expect(form.mode).toBe('submitted');
  });

  it('a second form instance for the same Seat sends at most one accepted submission; the engine refuses the second', () => {
    const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 1);
    const r = rig(g);
    const second = doc2(r);
    const f1 = r.mount('P0');
    const f2 = r.mount('P0', {}, second);
    const [k] = viewOf(g, 'P0').pendingQuadKeys as [string];
    typeInto(inputsOf(r.doc)[0] as FakeEl, '20');
    typeInto(inputsOf(r.doc)[1] as FakeEl, '21');
    const countBefore = g.ctl.getModel().actionCount;
    f1.submit();
    f2.submit(); // this form was never told that the first one submitted
    expect(r.calls).toHaveLength(2);
    expect(r.results).toEqual([{ ok: true }, { ok: false, reason: 'ENGINE', code: 'DUPLICATE_SUBMISSION' }]);
    expect(g.ctl.getModel().actionCount).toBe(countBefore + 1);
    expect(f2.mode).toBe('form');
    expect(second.querySelectorAllText('guess-engine-error')).toBe('Already submitted');
    // once told, the second form closes as submitted and shows no value
    f2.update(r.inputFor('P0'));
    expect(f2.mode).toBe('submitted');
    expect(k).toBeDefined();
  });

  it('shows the engine\'s localized message when dispatch refuses, keeps the form and lets the person retry', () => {
    const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 1);
    let refuse = true;
    const r = rig(g, () => (refuse ? { ok: false, reason: 'ENGINE', code: 'WRONG_PHASE' } : undefined));
    const form = r.mount('P0');
    const [k] = viewOf(g, 'P0').pendingQuadKeys as [string];
    typeInto(byId(r.doc, `guess-input-${k}`), '25');
    form.submit();
    const engineEl = r.doc.all().find((el) => el.getAttribute('class') === 'guess-engine-error') as FakeEl;
    expect(engineEl.textContent).toBe('This action is not available now');
    expect(engineEl.getAttribute('role')).toBe('alert');
    expect(form.mode).toBe('form');
    expect(valueOf(byId(r.doc, `guess-input-${k}`))).toBe('25');
    setLanguage('ko');
    form.update(r.inputFor('P0'));
    expect(engineEl.textContent).toBe('지금은 할 수 없는 동작입니다');
    refuse = false;
    form.submit();
    expect(r.calls).toHaveLength(2);
    expect(form.mode).toBe('submitted');
  });

  it('BUSY keeps the form; NO_GAME and DISPOSED close it as out of date; nothing is shown as an error', () => {
    for (const [reason, mode] of [['BUSY', 'form'], ['NO_GAME', 'stale'], ['DISPOSED', 'stale']] as const) {
      const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 1);
      const r = rig(g, () => ({ ok: false, reason }));
      const form = r.mount('P0');
      typeInto(inputsOf(r.doc)[0] as FakeEl, '25');
      form.submit();
      expect(form.mode, reason).toBe(mode);
      expect(r.calls, reason).toHaveLength(1);
    }
  });

  it('calls only handlers.dispatch, only with SUBMIT_GUESSES, and a real RenderInput satisfies the input type', () => {
    const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 2);
    const r = rig(g);
    const real: GuessEntryInput = g.latest(); // compile-time: the controller's RenderInput is accepted as is
    expect(real.view?.viewer).toBe('P0');
    const form = r.mount('P0');
    fillAll(r.doc, viewOf(g, 'P0').pendingQuadKeys);
    form.submit();
    expect(r.calls.map((c) => c.type)).toEqual(['SUBMIT_GUESSES']);
    expect(Object.keys(r.calls[0] as object).sort()).toEqual(['guesses', 'player', 'type']);
  });
});

/** A second page region in the same document, with a tiny helper to read an element's text by class. */
function doc2(r: Rig): FakeEl & { querySelectorAllText(cls: string): string } {
  const el = r.doc.createElement('div');
  r.doc.body.appendChild(el);
  return Object.assign(el, {
    querySelectorAllText: (cls: string): string =>
      (r.doc.all().filter((e) => el.contains(e) && e.getAttribute('class') === cls)[0] as FakeEl).textContent,
  });
}

// ---------------------------------------------------------------------------------------------------------
// Stale forms
// ---------------------------------------------------------------------------------------------------------

describe('a stale form does nothing and shows a status [fake-DOM, real engine]', () => {
  function stale(label: string, change: (r: Rig, view: PlayerView) => GuessEntryInput, expectMode: 'stale' | 'submitted' = 'stale'): void {
    it(label, () => {
      const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 2);
      const r = rig(g);
      const form = r.mount('P0');
      const view = viewOf(g, 'P0');
      const inputs = inputsOf(r.doc);
      const count0 = g.ctl.getModel().actionCount;
      fillAll(r.doc, view.pendingQuadKeys);
      form.update(change(r, view));
      expect(form.mode).toBe(expectMode);
      expect(inputsOf(r.doc)).toEqual([]);
      for (const input of inputs) expect(valueOf(input)).toBe('');
      for (const v of GUESS_VALUES) expect(dump(r.doc.body).includes(v)).toBe(false);
      expect(byId(r.doc, 'guess-status').textContent).toBe(
        expectMode === 'stale' ? 'This form is out of date. Waiting for the game to continue.' : 'Your Guesses are submitted. Waiting for the other players.',
      );
      form.submit();
      press(byId(r.doc, 'guess-status'), 'Enter');
      expect(r.calls).toEqual([]); // nothing is ever sent from a closed form
      expect(g.ctl.getModel().actionCount).toBe(count0);
    });
  }

  const same = (r: Rig): GuessEntryInput => r.inputFor('P0');
  stale('the viewer changed', (r, view) => ({ ...same(r), view: { ...view, viewer: 'P1' } }));
  stale('the phase changed', (r, view) => ({ ...same(r), view: { ...view, phase: 'REVEAL', pendingQuadKeys: [] } }));
  stale('the phase changed but the keys did not', (r, view) => ({ ...same(r), view: { ...view, phase: 'PLACEMENT' } }));
  stale('the batch (key set) changed', (r, view) => ({ ...same(r), view: { ...view, pendingQuadKeys: [...view.pendingQuadKeys, 'A1'] } }));
  stale('the key set shrank', (r, view) => ({ ...same(r), view: { ...view, pendingQuadKeys: view.pendingQuadKeys.slice(1) } }));
  stale('the actionCount changed without a submission', (r) => ({ ...same(r), model: { actionCount: same(r).model.actionCount + 1 } }));
  stale('there is no view any more', (r) => ({ ...same(r), view: null }));
  stale('the viewer already submitted (guessSubmitted)', (r, view) => ({ ...same(r), view: { ...view, guessSubmitted: { ...view.guessSubmitted, P0: true } }, model: { actionCount: same(r).model.actionCount + 1 } }), 'submitted');
  stale('the view reports the viewer\'s own guesses (myGuesses)', (r, view) => ({ ...same(r), view: { ...view, myGuesses: {} } }), 'submitted');

  it('a form shown after the viewer already submitted, or outside GUESS_COLLECT, starts closed and has no input', () => {
    const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 1);
    const view = viewOf(g, 'P0');
    g.ctl.dispatchHuman({ type: 'SUBMIT_GUESSES', player: 'P0', guesses: Object.fromEntries(view.pendingQuadKeys.map((k) => [k, 33])) });
    const r = rig(g);
    const done = r.mount('P0');
    expect(done.mode).toBe('submitted');
    expect(done.token).toBeNull();
    expect(inputsOf(r.doc)).toEqual([]);
    expect(dump(r.doc.body).includes('33')).toBe(false); // the viewer's own submission is never rendered
    const fresh = startGame(['HUMAN', 'AI', 'AI', 'AI'], 3);
    const r2 = rig(fresh);
    const idle = r2.mount('P0');
    expect(viewOf(fresh, 'P0').phase).toBe('PLACEMENT');
    expect(idle.mode).toBe('stale');
    expect(inputsOf(r2.doc)).toEqual([]);
    const none = renderGuessEntry(asDoc(r2.doc), asRoot(r2.root), { ...r2.inputFor('P0'), view: null }, t);
    expect(none.mode).toBe('stale');
  });

  it('a new viewer gets a new form: the previous viewer\'s typed text is not carried over', () => {
    const g = batchGame(['HUMAN', 'HUMAN', 'AI', 'AI'], 1);
    const r = rig(g);
    const f0 = r.mount('P0');
    typeInto(inputsOf(r.doc)[0] as FakeEl, '25');
    f0.update(r.inputFor('P1')); // the host switched the viewer: the old form is stale
    expect(f0.mode).toBe('stale');
    f0.dispose();
    const f1 = r.mount('P1');
    expect(f1.mode).toBe('form');
    expect(valueOf(inputsOf(r.doc)[0] as FakeEl) ?? '').toBe('');
    expect(dump(r.doc.body).includes('25')).toBe(false);
    typeInto(inputsOf(r.doc)[0] as FakeEl, '26');
    f1.submit();
    expect(r.calls).toEqual([{ type: 'SUBMIT_GUESSES', player: 'P1', guesses: { [viewOf(g, 'P0').pendingQuadKeys[0] as string]: 26 } }]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Several human Seats and mixed Seat sets
// ---------------------------------------------------------------------------------------------------------

describe('two and four human Seats, mixed with AI Seats [fake-DOM, real engine]', () => {
  it('two human Seats: each submits through its own form; the other human\'s and the AI Guesses are never displayed', () => {
    const g = batchGame(['HUMAN', 'HUMAN', 'AI', 'AI'], 2);
    const r = rig(g);
    const keys = viewOf(g, 'P0').pendingQuadKeys;
    const f0 = r.mount('P0');
    fillAll(r.doc, keys);
    f0.submit();
    expect(f0.mode).toBe('submitted');
    f0.dispose();
    expect(r.doc.all().filter((el) => el.tagName === 'input')).toEqual([]);
    const f1 = r.mount('P1');
    expect(r.doc.all().filter((el) => el.tagName === 'li').map((el) => el.textContent)).toEqual([
      'Alice: submitted',
      'Bob: waiting',
      'Carol: waiting',
      'Dave: waiting',
    ]);
    const text = dump(r.doc.body);
    for (const v of GUESS_VALUES) expect(text.includes(v), `P1's form shows ${v}`).toBe(false);
    typeInto(inputsOf(r.doc)[0] as FakeEl, '12');
    typeInto(inputsOf(r.doc)[1] ?? (inputsOf(r.doc)[0] as FakeEl), '12');
    f1.submit();
    expect(r.calls.map((c) => c.player)).toEqual(['P0', 'P1']);
    expect(r.results).toEqual([{ ok: true }, { ok: true }]);
  });

  it('four human Seats: four forms in turn, each closes and removes its values; the batch is then revealed', () => {
    const g = batchGame(['HUMAN', 'HUMAN', 'HUMAN', 'HUMAN'], 1);
    const r = rig(g);
    const [k] = viewOf(g, 'P0').pendingQuadKeys as [string];
    for (const [i, seat] of SEAT_IDS.entries()) {
      const form = r.mount(seat);
      const input = inputsOf(r.doc)[0] as FakeEl;
      expect(valueOf(input) ?? '').toBe(''); // fresh, empty
      typeInto(input, String(10 + i));
      form.submit();
      expect(valueOf(input)).toBe('');
      form.dispose();
      expect(r.doc.all().filter((el) => el.tagName === 'input')).toEqual([]);
    }
    expect(r.calls.map((c) => [c.player, c.guesses[k]])).toEqual([['P0', 10], ['P1', 11], ['P2', 12], ['P3', 13]]);
    expect(viewOf(g, 'P0').phase).toBe('REVEAL');
  });

  it('mixed Seats (AI, human, AI, human): AI Seats are statuses only; an AI submission while typing keeps text and focus', () => {
    const g = batchGame(['AI', 'HUMAN', 'AI', 'HUMAN'], 2);
    const r = rig(g);
    const form = r.mount('P1');
    wire(r, 'P1', form);
    const [k1, k2] = viewOf(g, 'P1').pendingQuadKeys as [string, string];
    typeInto(byId(r.doc, `guess-input-${k1}`), '25');
    byId(r.doc, `guess-input-${k1}`).focus();
    expect(r.doc.all().filter((el) => el.tagName === 'li').map((el) => el.textContent)).toEqual(['Alice: waiting', 'Bob: waiting', 'Carol: waiting', 'Dave: waiting']);
    expect(g.queue.step()).toBe(true); // both AI Seats submit while the person types
    expect(viewOf(g, 'P1').guessSubmitted).toEqual({ P0: true, P1: false, P2: true, P3: false });
    expect(form.mode).toBe('form'); // not stale: AI submissions are part of the batch
    expect(valueOf(byId(r.doc, `guess-input-${k1}`))).toBe('25');
    expect(r.doc.activeElement).toBe(byId(r.doc, `guess-input-${k1}`));
    expect(r.doc.all().filter((el) => el.tagName === 'li').map((el) => el.textContent)).toEqual(['Alice: submitted', 'Bob: waiting', 'Carol: submitted', 'Dave: waiting']);
    typeInto(byId(r.doc, `guess-input-${k2}`), '26');
    form.submit();
    expect(r.calls).toEqual([{ type: 'SUBMIT_GUESSES', player: 'P1', guesses: { [k1]: 25, [k2]: 26 } }]);
    expect(form.mode).toBe('submitted');
  });
});

// ---------------------------------------------------------------------------------------------------------
// Re-render, focus, keyboard, lifecycle
// ---------------------------------------------------------------------------------------------------------

describe('re-render, focus and lifecycle [fake-DOM]', () => {
  it('a plain re-render keeps the same input elements, the typed text and the focus; a language change re-localizes', () => {
    const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 2);
    const r = rig(g);
    const form = r.mount('P0');
    const [k1, k2] = viewOf(g, 'P0').pendingQuadKeys as [string, string];
    const a = byId(r.doc, `guess-input-${k1}`);
    const b = byId(r.doc, `guess-input-${k2}`);
    typeInto(a, '25');
    typeInto(b, 'abc');
    b.focus();
    expect(captureFocus(fd(r.doc))).toEqual({ kind: 'key', value: `guess-input-${k2}` });
    for (let i = 0; i < 3; i++) renderWithFocus(fd(r.doc), () => form.update(r.inputFor('P0')));
    expect(byId(r.doc, `guess-input-${k1}`)).toBe(a);
    expect(byId(r.doc, `guess-input-${k2}`)).toBe(b);
    expect(valueOf(a)).toBe('25');
    expect(valueOf(b)).toBe('abc');
    expect(r.doc.activeElement).toBe(b);
    setLanguage('ko');
    form.update(r.inputFor('P0'));
    expect(byId(r.doc, `guess-input-${k1}`)).toBe(a);
    expect(valueOf(a)).toBe('25');
    expect(r.doc.activeElement).toBe(b);
    expect(r.doc.all().filter((el) => el.tagName === 'form')).toHaveLength(1);
  });

  it('focuses the first input when shown; autoFocus false leaves the focus alone until focusFirst', () => {
    const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 2);
    const r = rig(g);
    r.mount('P0');
    expect(r.doc.activeElement).toBe(inputsOf(r.doc)[0]);
    const g2 = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 2);
    const r2 = rig(g2);
    const quiet = r2.mount('P0', { autoFocus: false });
    expect(r2.doc.activeElement).toBeNull();
    quiet.focusFirst();
    expect(r2.doc.activeElement).toBe(inputsOf(r2.doc)[0]);
  });

  it('the region hook receives the public Quad_Key of the focused input and null when the form closes', () => {
    const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 2);
    const r = rig(g);
    const seen: (string | null)[] = [];
    const form = r.mount('P0', { onRegionFocus: (k) => seen.push(k) });
    const keys = viewOf(g, 'P0').pendingQuadKeys;
    expect(seen).toEqual([keys[0]]); // the autofocus
    byId(r.doc, `guess-input-${keys[1]}`).focus();
    expect(seen).toEqual([keys[0], keys[1]]);
    typeInto(inputsOf(r.doc)[0] as FakeEl, '20');
    typeInto(inputsOf(r.doc)[1] as FakeEl, '21');
    form.submit();
    expect(seen[seen.length - 1]).toBeNull();
  });

  it('dispose clears the typed values, removes the form and ignores later calls', () => {
    const g = batchGame(['HUMAN', 'AI', 'AI', 'AI'], 1);
    const r = rig(g);
    const form = r.mount('P0');
    const input = inputsOf(r.doc)[0] as FakeEl;
    typeInto(input, '25');
    form.dispose();
    form.dispose();
    expect(valueOf(input)).toBe('');
    expect(form.element.parentNode).toBeNull();
    form.update(r.inputFor('P0'));
    form.submit();
    expect(r.calls).toEqual([]);
    expect(r.root.children).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Source scan
// ---------------------------------------------------------------------------------------------------------

describe('source of guess-entry.ts and guess-model.ts', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const strip = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const entry = strip(readFileSync(join(dir, 'guess-entry.ts'), 'utf8'));
  const model = strip(readFileSync(join(dir, '..', 'guess-model.ts'), 'utf8'));

  it('never persists, logs or exposes a Guess, parses no HTML and reaches the game only through handlers.dispatch', () => {
    for (const code of [entry, model]) {
      expect(code).not.toMatch(/console|localStorage|sessionStorage|\bwindow\b|\bglobalThis\b|\bdocument\b|location|history\.|indexedDB|cookie/);
      expect(code).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
      expect(code).not.toMatch(/['"]title['"]|\btitle\s*:|dataset/);
    }
    expect(entry).not.toMatch(/dispatchHuman|confirmPlacement|draftEvent|explainTarget|\bPLACE\b|ACK_REVEAL/);
    expect((entry.match(/\.dispatch\(/g) ?? []).length).toBe(1);
    expect(entry).toMatch(/type: 'SUBMIT_GUESSES'/);
  });

  it('reads no revealed or historical data and never renders the viewer\'s own Guess values', () => {
    expect(entry).not.toMatch(/lastReveal|history|hiddenSum|\.board\b|myHand|\.scores\b/);
    // `myGuesses` is read only to learn whether it is null
    expect(entry.replace(/myGuesses\s*!==\s*null/g, '')).not.toMatch(/myGuesses/);
    expect(model.replace(/myGuesses\s*!==\s*null/g, '')).not.toMatch(/myGuesses/);
    // the only data attributes are the public Quad_Key (and the focus key written by `h`)
    expect([...entry.matchAll(/['"](data-[a-z-]+)['"]/g)].map((m) => m[1])).toEqual(['data-quad-key']);
  });
});
