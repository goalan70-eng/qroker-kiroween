// Headless DOM test environment (task 21.1). Evidence class of everything built on it: fake-DOM = `happy-dom` (no layout,
// no real focus/inert semantics, no pointer capture, no touch, no real browser).
//
// Test files select the environment themselves, as their FIRST comment line:  `// @vitest-environment happy-dom`
// (`vitest.config.ts` stays on `node`, so the optical tests are not affected). This module is a non-test ui/ file: it
// imports only ui/, i18n/, persistence/ and `core/types`/`core/view`, and takes the `document` from the environment.
//
// API (every helper takes the mount as its FIRST argument):
//   mountTestApp(options?)            -> MountedApp: the production composition (`startApp` of `ui/app.ts`) in a fresh root
//                                        of `document.body`, with a fresh `memoryStore()`, deterministic seeds and clock,
//                                        and a controlled scheduler.
//   disposeAllMounted()               -> disposes every mount that is still alive (also after a failing test).
//   useMountCleanup(afterEach)        -> registers `disposeAllMounted` as the file's `afterEach`. The caller passes vitest's
//                                        `afterEach`: this file cannot import `vitest` (boundaries.test.ts allows no bare
//                                        module in ui/). Usage at the top of a file: `useMountCleanup(afterEach)`.
//   clickByLabel(app, label, opts?)   -> clicks the control whose accessible name matches `label`, then drains the AI steps.
//   getByLabel(app, label, opts?)     -> the control with that accessible name, untouched (same resolution and errors).
//   typeInto(app, label, text, opts?) -> sets an input/textarea/select value by label (native setter, `input` + `change`).
//   label(app, key, params?)          -> the localized text of a `StringKey` in the app's current language.
//   playHumanTurnAuto(app)            -> one human placement through the real UI (first Hand card, first legal cell, Confirm).
//   acknowledgeGateIfShown(app)       -> clicks the privacy gate's button when a gate is shown (never done implicitly).
//   getText(app)                      -> whitespace-normalized text of the app root.
//   app.flush(maxSteps?)              -> runs queued scheduler steps in FIFO order until idle (throws when over budget).
//
// Scheduler design. The controller keeps at most ONE pending step and every step schedules the next one itself through
// `deps.schedule(fn, AI_DELAY_MS)`. An immediate (synchronous) scheduler would run the next AI step inside the render of the
// previous one (re-entrant `setModel`/render recursion, one stack frame chain per AI action, and a render of every
// intermediate state nested inside the one before), so this module keeps a queue: nothing runs until `flush`. Virtual time
// only moves forward to the due time of the step being run; nothing waits and no real timer is used. With `autoFlush`
// (default true) every helper drains the queue after its DOM event, so a test sees the settled state.
//
// Not supported by happy-dom and therefore not verified here: layout (sizes, `elementFromPoint` hit testing, 44px targets),
// pointer capture and drags, `inert` focus semantics, CSS (`hidden`/`inert` are read from attributes only), and touch.
import type { StringKey, StringParams } from '../../i18n';
import { getLanguage, resetLanguage, setLanguage, t } from '../../i18n';
import { memoryStore } from '../../persistence/storage';
import type { KeyValueStore } from '../../persistence/storage';
import type { PlayerView } from '../../core/view';
import { startApp } from '../app';
import type { StartAppDeps, StartedApp } from '../app';
import type { Controller, Schedule, ScheduleHandle } from '../controller';

// ---------------------------------------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------------------------------------

export const DEFAULT_FLUSH_STEPS = 1000;

interface Entry {
  readonly fn: () => void;
  readonly due: number;
  cancelled: boolean;
}

export interface TestScheduler {
  readonly schedule: Schedule;
  /** Number of queued, not cancelled steps. */
  pending(): number;
  /** Virtual time: the due time of the last step that ran (never real time). */
  readonly virtualTimeMs: number;
  /** Runs queued steps in FIFO order until the queue is empty; returns how many ran. Throws above `maxSteps`. */
  flush(maxSteps?: number): number;
  /** Drops every queued step; a callback that is already captured does nothing afterwards. */
  close(): void;
}

export function createTestScheduler(): TestScheduler {
  let queue: Entry[] = [];
  let now = 0;
  let closed = false;
  const live = (): Entry[] => queue.filter((e) => !e.cancelled);
  return {
    schedule: (fn, ms): ScheduleHandle => {
      const entry: Entry = { fn: () => (closed ? undefined : fn()), due: now + ms, cancelled: closed };
      if (!closed) queue.push(entry);
      return { cancel: () => void (entry.cancelled = true) };
    },
    pending: () => live().length,
    get virtualTimeMs() {
      return now;
    },
    flush: (maxSteps = DEFAULT_FLUSH_STEPS) => {
      let ran = 0;
      for (;;) {
        queue = live();
        const next = queue.shift();
        if (next === undefined) return ran;
        if (ran >= maxSteps) {
          queue.unshift(next);
          throw new Error(`flush: more than ${maxSteps} scheduled steps; the app keeps scheduling (infinite loop guard)`);
        }
        ran++;
        if (next.due > now) now = next.due;
        next.fn();
      }
    },
    close: () => {
      closed = true;
      for (const e of queue) e.cancelled = true;
      queue = [];
    },
  };
}

// ---------------------------------------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------------------------------------

export interface MountOptions {
  /** Seed of every `randomSeed()` call (default 1234567). */
  readonly seed?: number;
  /** Sequence of seeds for successive `randomSeed()` calls (the first call is the setup screen's default text); the last repeats. */
  readonly seeds?: readonly number[];
  /** Default `['en']`. */
  readonly languages?: readonly string[];
  /** Default: a fresh `memoryStore()`. Pass one to share storage between mounts (persistence tests). */
  readonly store?: KeyValueStore;
  /** Default: `2026-01-01T00:00:00.000Z`, plus one second per call. */
  readonly nowIso?: () => string;
  readonly strategyFor?: StartAppDeps['strategyFor'];
  /** Default true: helpers drain the scheduler after their DOM event. */
  readonly autoFlush?: boolean;
}

export interface MountedApp {
  readonly root: HTMLElement;
  readonly doc: Document;
  readonly store: KeyValueStore;
  readonly controller: Controller;
  readonly started: StartedApp;
  readonly scheduler: TestScheduler;
  readonly autoFlush: boolean;
  /** Number of `randomSeed()` calls so far. */
  seedCalls(): number;
  flush(maxSteps?: number): number;
  /** Idempotent. Disposes the app and the host, drops queued steps, removes the root, asserts the scheduler is idle. */
  dispose(): void;
}

const mounted = new Set<MountedApp>();

/** `2026-01-01T00:00:00.000Z` plus `n` seconds (no `Date`; valid for fewer than 86400 calls). */
function clockIso(n: number): string {
  if (n >= 86400) throw new Error('test clock: more than 86399 calls (one day of seconds)');
  const two = (v: number): string => String(v).padStart(2, '0');
  return `2026-01-01T${two(Math.floor(n / 3600))}:${two(Math.floor((n % 3600) / 60))}:${two(n % 60)}.000Z`;
}

export function mountTestApp(options: MountOptions = {}): MountedApp {
  const doc = document;
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const store = options.store ?? memoryStore();
  const scheduler = createTestScheduler();
  const seeds = options.seeds ?? [options.seed ?? 1234567];
  if (seeds.length === 0) throw new Error('mountTestApp: `seeds` is empty');
  let seedCount = 0;
  const randomSeed = (): number => {
    const value = seeds[Math.min(seedCount, seeds.length - 1)] as number;
    seedCount++;
    return value;
  };
  let clock = 0;
  const nowIso = options.nowIso ?? ((): string => clockIso(clock++));
  const started = startApp(root, {
    doc,
    languages: options.languages ?? ['en'],
    schedule: scheduler.schedule,
    randomSeed,
    store,
    nowIso,
    ...(options.strategyFor === undefined ? {} : { strategyFor: options.strategyFor }),
  });
  let disposed = false;
  const app: MountedApp = {
    root,
    doc,
    store,
    controller: started.controller,
    started,
    scheduler,
    autoFlush: options.autoFlush ?? true,
    seedCalls: () => seedCount,
    flush: (maxSteps) => scheduler.flush(maxSteps),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      mounted.delete(app);
      try {
        started.dispose(); // controller.dispose cancels its pending step
        const left = scheduler.pending();
        scheduler.close();
        if (left > 0) throw new Error(`dispose: ${left} scheduler step(s) were still queued after the app was disposed`);
      } finally {
        root.remove();
        resetLanguage();
      }
    },
  };
  mounted.add(app);
  return app;
}

/** Disposes every live mount (all of them, even when one throws; the first error is rethrown). */
export function disposeAllMounted(): void {
  let first: unknown;
  for (const app of [...mounted]) {
    try {
      app.dispose();
    } catch (error) {
      first ??= error;
    }
  }
  if (first !== undefined) throw first;
}

/** `useMountCleanup(afterEach)` at the top of a file or describe block: mounts are disposed after each test, pass or fail. */
export function useMountCleanup(afterEach: (fn: () => void) => void): void {
  afterEach(disposeAllMounted);
}

// ---------------------------------------------------------------------------------------------------------
// Label resolution
// ---------------------------------------------------------------------------------------------------------

const CONTROL_SELECTOR =
  'button, a[href], input, select, textarea, summary, option, [role="button"], [role="radio"], [role="checkbox"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"]';
const MAX_LISTED = 20;
const MAX_NAME = 40;

const normalize = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Text of `el` without `aria-hidden` subtrees. */
function visibleText(el: Element): string {
  let out = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) out += node.textContent ?? '';
    else if (node.nodeType === 1 && (node as Element).getAttribute('aria-hidden') !== 'true') out += ` ${visibleText(node as Element)} `;
  }
  return normalize(out);
}

/** Accessible name: aria-labelledby, aria-label, `<label>`, then content (buttons, options, summaries) or `value` (button inputs). */
function accessibleName(el: Element): string {
  const doc = el.ownerDocument;
  const by = el.getAttribute('aria-labelledby');
  if (by !== null) {
    const text = by
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .filter((n): n is HTMLElement => n !== null)
      .map((n) => visibleText(n))
      .join(' ');
    if (normalize(text) !== '') return normalize(text);
  }
  const aria = el.getAttribute('aria-label');
  if (aria !== null && normalize(aria) !== '') return normalize(aria);
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea' || el.getAttribute('role') === 'radio') {
    const id = el.getAttribute('id');
    const labels = Array.from(doc.querySelectorAll('label')).filter((l) => (id !== null && l.getAttribute('for') === id) || l.contains(el));
    const text = normalize(labels.map((l) => visibleText(l)).join(' '));
    if (text !== '') return text;
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    if (tag === 'input' && (type === 'button' || type === 'submit' || type === 'reset')) return normalize(el.getAttribute('value') ?? '');
    return '';
  }
  return visibleText(el);
}

function ancestors(el: Element, root: Element): Element[] {
  const out: Element[] = [];
  for (let n: Element | null = el; n !== null; n = n.parentElement) {
    out.push(n);
    if (n === root) break;
  }
  return out;
}

const isHiddenWithin = (el: Element, root: Element): boolean =>
  ancestors(el, root).some((n) => n.hasAttribute('hidden') || n.getAttribute('aria-hidden') === 'true');
const isInertWithin = (el: Element, root: Element): boolean => ancestors(el, root).some((n) => n.hasAttribute('inert'));
const isDisabled = (el: Element): boolean => el.hasAttribute('disabled') || (el.closest('fieldset[disabled]') !== null);

/** The innermost open modal dialog of the app, or the root itself. */
function scopeOf(app: MountedApp): Element {
  const dialogs = Array.from(app.root.querySelectorAll('[role="dialog"][aria-modal="true"], [role="alertdialog"]')).filter(
    (d) => !isHiddenWithin(d, app.root),
  );
  return dialogs[dialogs.length - 1] ?? app.root;
}

interface Candidate {
  readonly el: Element;
  readonly name: string;
  readonly usable: boolean;
}

function candidates(app: MountedApp, scope: Element, fields?: boolean): Candidate[] {
  return Array.from(scope.querySelectorAll(CONTROL_SELECTOR))
    .filter((el) => el.getAttribute('type') !== 'hidden')
    .filter((el) => !fields || ['input', 'textarea', 'select'].includes(el.tagName.toLowerCase()))
    .map((el) => ({
      el,
      name: accessibleName(el),
      usable: !isHiddenWithin(el, app.root) && !isInertWithin(el, app.root) && !isDisabled(el),
    }));
}

const matches = (wanted: string | RegExp, name: string): boolean =>
  typeof wanted === 'string' ? name === normalize(wanted) : new RegExp(wanted.source, wanted.flags.replace(/[gy]/g, '')).test(name);

const shorten = (s: string): string => (s.length > MAX_NAME ? `${s.slice(0, MAX_NAME - 1)}…` : s);

/** Candidate names for a diagnostic: control names only (no input values, no hand card or board cell names), closest first. */
function listNames(all: readonly Candidate[], wanted: string | RegExp): string {
  const text = typeof wanted === 'string' ? wanted.toLowerCase() : '';
  const score = (name: string): number => {
    const n = name.toLowerCase();
    let common = 0;
    while (common < text.length && common < n.length && text[common] === n[common]) common++;
    return (text !== '' && n.includes(text) ? 100 : 0) + common;
  };
  const plain = all.filter((c) => c.name !== '' && !c.el.classList.contains('hand-card') && !c.el.classList.contains('board-cell'));
  const omitted = all.length - plain.length;
  const names = [...new Set(plain.map((c) => c.name))].sort((a, b) => score(b) - score(a)).slice(0, MAX_LISTED);
  const shown = names.map((n) => JSON.stringify(shorten(n))).join(', ');
  return `${shown === '' ? '(none)' : shown}${omitted > 0 ? ` (+${omitted} hand card/board cell controls not listed)` : ''}`;
}

function resolve(app: MountedApp, wanted: string | RegExp, nth: number | undefined, fields: boolean, what: string): Element {
  const all = candidates(app, scopeOf(app), fields);
  const named = all.filter((c) => matches(wanted, c.name));
  const usable = named.filter((c) => c.usable);
  const shownWanted = typeof wanted === 'string' ? JSON.stringify(wanted) : String(wanted);
  if (named.length === 0) {
    throw new Error(`${what}: no control named ${shownWanted}. Available controls: ${listNames(all, wanted)}`);
  }
  if (usable.length === 0) {
    throw new Error(`${what}: ${named.length} control(s) named ${shownWanted} exist but none is visible, enabled and not inert`);
  }
  if (nth === undefined && usable.length > 1) {
    throw new Error(`${what}: ${usable.length} usable controls are named ${shownWanted}; pass { nth } to choose one`);
  }
  const chosen = usable[nth ?? 0];
  if (chosen === undefined) throw new Error(`${what}: nth ${String(nth)} is out of range (${usable.length} usable controls named ${shownWanted})`);
  return chosen.el;
}

// ---------------------------------------------------------------------------------------------------------
// Events and helpers
// ---------------------------------------------------------------------------------------------------------

type Win = Window & typeof globalThis;

function fire(el: Element, type: string, kind: 'pointer' | 'mouse' | 'event'): void {
  const win = el.ownerDocument.defaultView as Win;
  const base = { bubbles: true, cancelable: true, composed: true };
  if (kind === 'pointer') {
    el.dispatchEvent(new win.PointerEvent(type, { ...base, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: 0, clientY: 0 }));
  } else if (kind === 'mouse') {
    el.dispatchEvent(new win.MouseEvent(type, { ...base, button: 0, clientX: 0, clientY: 0 }));
  } else {
    el.dispatchEvent(new win.Event(type, base));
  }
}

function finish(app: MountedApp, flush: boolean | undefined): void {
  if (flush ?? app.autoFlush) app.flush();
}

/** A realistic press on `el`: pointerdown, mousedown, focus, pointerup, mouseup, click. */
function press(el: Element): void {
  if (el.tagName.toLowerCase() === 'option') {
    const select = el.closest('select') as HTMLSelectElement | null;
    if (select === null) throw new Error('click: <option> without a <select>');
    setValue(select, (el as HTMLOptionElement).value);
    fire(select, 'input', 'event');
    fire(select, 'change', 'event');
    return;
  }
  fire(el, 'pointerdown', 'pointer');
  fire(el, 'mousedown', 'mouse');
  (el as HTMLElement).focus?.();
  fire(el, 'pointerup', 'pointer');
  fire(el, 'mouseup', 'mouse');
  fire(el, 'click', 'mouse');
}

function setValue(el: Element, text: string): void {
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter === undefined) throw new Error('typeInto: the control has no native value setter');
  setter.call(el, text);
}

export interface ClickOptions {
  /** 0-based index among the usable controls with the same name (required when the name is ambiguous). */
  readonly nth?: number;
  /** Overrides `app.autoFlush` for this call. */
  readonly flush?: boolean;
}

export function clickByLabel(app: MountedApp, wanted: string | RegExp, options: ClickOptions = {}): void {
  press(resolve(app, wanted, options.nth, false, 'clickByLabel'));
  finish(app, options.flush);
}

/** The control with the accessible name wanted (same resolution and errors as clickByLabel), without touching it. */
export function getByLabel(app: MountedApp, wanted: string | RegExp, options: Pick<ClickOptions, 'nth'> = {}): Element {
  return resolve(app, wanted, options.nth, false, 'getByLabel');
}

export function typeInto(app: MountedApp, wanted: string | RegExp, text: string, options: ClickOptions = {}): void {
  const el = resolve(app, wanted, options.nth, true, 'typeInto');
  (el as HTMLElement).focus?.();
  setValue(el, text);
  fire(el, 'input', 'event');
  fire(el, 'change', 'event');
  finish(app, options.flush);
}

/** The text of a string key in the app's current language (`model.language`), whatever the global language is. */
export function label(app: MountedApp, key: StringKey, params?: StringParams): string {
  const previous = getLanguage();
  setLanguage(app.controller.getModel().language);
  try {
    return t(key, params);
  } finally {
    setLanguage(previous);
  }
}

export function getText(app: MountedApp): string {
  return normalize(app.root.textContent ?? '');
}

export function acknowledgeGateIfShown(app: MountedApp, options: { readonly flush?: boolean } = {}): boolean {
  if (app.controller.getModel().gate === null) return false;
  clickByLabel(app, label(app, 'guess.gate.ready'), options);
  return true;
}

const occupancy = (view: PlayerView): number => view.board.filter((cell) => cell !== null).length;

export interface HumanTurnResult {
  readonly placed: true;
  readonly actionCountBefore: number;
  /** The accepted-Action count after the AI steps were drained (equals `actionCountBefore + 1` without `autoFlush`). */
  readonly actionCountAfter: number;
}

/**
 * One human placement through the real UI. Requires phase PLACEMENT, a human on turn, a private view and no gate. Verifies
 * that exactly one Action was accepted by the Confirm click (count read BEFORE the AI steps are drained), that the viewer's
 * Board grew by one card and that the draft is empty. It reads counts through `controller.getModel()`/`getView(viewer)` only.
 * The legal cell list does not depend on the drafted card (`legalCellsFor(view)`), so the first legal cell fits the first card.
 */
function fail(why: string): Error {
  return new Error(`playHumanTurnAuto: ${why}`);
}

export function playHumanTurnAuto(app: MountedApp): HumanTurnResult {
  const fail = (why: string): never => {
    throw new Error(`playHumanTurnAuto: ${why}`);
  };
  const model = app.controller.getModel();
  if (model.screen !== 'GAME') throw fail(`no game is in progress (screen ${model.screen})`);
  if (model.gate !== null) throw fail('a privacy gate is shown; call acknowledgeGateIfShown(app) first');
  const viewer = model.viewer;
  if (viewer === null) throw fail('no private view is shown, so no human is on turn');
  const view = app.controller.getView(viewer);
  if (view === null) throw fail('no view for the viewer');
  if (view.phase !== 'PLACEMENT') throw fail(`not a placement turn (phase ${view.phase})`);
  if (view.turn !== view.viewer) throw fail('no human turn: another seat is on turn');
  if (view.myHand.length === 0) throw fail('the viewer has no Hand card');

  const scope = scopeOf(app);
  const card = Array.from(scope.querySelectorAll('.hand-card')).find((el) => !isDisabled(el) && !isHiddenWithin(el, app.root));
  if (card === undefined) throw fail('no enabled Hand card is rendered');
  press(card);
  const cell = Array.from(scope.querySelectorAll('.board-cell.is-legal')).find((el) => !isHiddenWithin(el, app.root));
  if (cell === undefined) throw fail('no legal board cell is rendered');
  press(cell);

  const before = model.actionCount;
  const boardBefore = occupancy(view);
  const confirm = label(app, 'hand.confirm');
  try {
    clickByLabel(app, confirm, { flush: false });
  } catch (error) {
    const last = app.controller.getModel().lastError;
    throw new Error(`${(error as Error).message}${last === null ? '' : ` (last error code ${last.code})`}`);
  }
  const placed = app.controller.getModel();
  if (placed.actionCount !== before + 1) {
    throw fail(`Confirm was refused: actionCount ${before} -> ${placed.actionCount}${placed.lastError === null ? '' : `, error code ${placed.lastError.code}`}`);
  }
  const after = app.controller.getView(viewer);
  if (after === null || occupancy(after) !== boardBefore + 1) throw fail('the Board did not grow by exactly one card');
  if (placed.draft.card !== null || placed.draft.target !== null) throw fail('the draft was not cleared by the accepted placement');
  finish(app, undefined);
  return { placed: true, actionCountBefore: before, actionCountAfter: app.controller.getModel().actionCount };
}
