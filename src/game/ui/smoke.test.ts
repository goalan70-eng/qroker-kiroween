// @vitest-environment happy-dom
// Task 21.2: full-game UI smoke test. One human plus three AI Seats are played from the real setup screen to the real end
// screen through the DOM only (`mountTestApp` helpers); the controller is read through `getModel()` / `getView(viewer)`.
// Evidence class: fake-DOM = happy-dom. This is NOT a real browser: no layout, no drag, no touch, no focus semantics, no CSS.
// Privacy/accessibility/language/persistence matrices belong to task 21.3 and are not covered here.
import { afterEach, describe, expect, it } from 'vitest';
import { GUESS_MAX, GUESS_MIN } from '../core/score';
import type { IdentityVisibility, PlayerId } from '../core/types';
import type { PlayerView } from '../core/view';
import type { StringKey } from '../i18n';
import { revealCardFace } from './screens/reveal';
import { createH } from './dom';
import { clickByLabel, label, mountTestApp, playHumanTurnAuto, typeInto, useMountCleanup } from './testing/mount';
import type { MountedApp } from './testing/mount';

useMountCleanup(afterEach);

// Seeds. Chosen by a one-off bounded probe (seeds 1..12 in both modes, 13..52 in OWNER_ONLY, the default automatic flow:
// playHumanTurnAuto and a midpoint-based Guess spread): seeds whose game forms at least one Composite Code and shows at least one
// reveal screen in BOTH visibility modes (every game here includes a human Guess entry and a reveal acknowledgement). Seed 16 was
// the first seed up to 52 with a two-code batch, 7 the shortest game found, 20240601 is the seed of e2e/game.spec.ts. Observed
// reveals / two-code batches / human Guess entries / human placements / final actionCount, both modes alike:
//   seed 7: 1 / 0 / 1 / 11 / 47;  seed 16: 2 / 1 / 2 / 11 / 54;  seed 20240601: 1 / 0 / 1 / 12 / 50  (docs/game/ui-progress.md).
const SEEDS = [7, 16, 20240601] as const;
const REPLAY_SEED = SEEDS[0]; // the cheapest game of the three
const REMATCH_SEED = 987654321;
const VISIBILITIES: readonly IdentityVisibility[] = ['OWNER_ONLY', 'FACE_UP'];

const HUMAN: PlayerId = 'P0';
const MAX_ITERATIONS = 200;
/** The engine plays at most 48 PLACE Actions (4 seats x 12 cards); every other Action is a Guess submission or a reveal ack. */
const MAX_PLACE_ACTIONS = 48;

interface Ctx {
  readonly seed: number;
  readonly visibility: IdentityVisibility;
  iter: number;
  phase: string;
}

/** Throws with the seed, visibility, iteration and last public phase. Never prints a hand card or a typed value. */
function ensure(ctx: Ctx, condition: boolean, what: string): asserts condition {
  if (!condition) throw new Error(`smoke: ${what} [seed ${ctx.seed}, ${ctx.visibility}, iteration ${ctx.iter}, phase ${ctx.phase}]`);
}

interface Snapshot {
  readonly hand: readonly string[];
  readonly board: readonly string[];
}

interface RunStats {
  humanPlacements: number;
  guessEntries: number;
  revealScreens: number;
  reveals: number;
  twoCodeBatches: number;
  actionCount: number;
  iterations: number;
  initial: Snapshot | null;
}

const nameOf = (el: Element): string => el.getAttribute('aria-label') ?? '';

function snapshot(app: MountedApp): Snapshot {
  const hand = Array.from(app.root.querySelectorAll('.hand-card')).map(nameOf);
  const board = Array.from(app.root.querySelectorAll('.board-cell')).map(nameOf);
  return { hand, board };
}

const textOf = (el: Element | null): string => (el === null ? '' : (el.textContent ?? '').replace(/\s+/g, ' ').trim());

function viewOf(app: MountedApp, ctx: Ctx): PlayerView {
  const view = app.controller.getView(HUMAN);
  ensure(ctx, view !== null, 'no view for the human seat');
  return view;
}

/** One banner element with the notice text, on every screen. */
function checkBanner(app: MountedApp, ctx: Ctx, notice: string): void {
  const banners = app.root.querySelectorAll('.banner, .scoreboard-banner, .reveal-banner, .end-banner');
  ensure(ctx, banners.length === 1, `expected exactly one provisional banner, found ${banners.length}`);
  ensure(ctx, textOf(banners[0] as Element).includes(notice), 'the banner does not show the provisional notice');
}

function checkSeedLine(app: MountedApp, ctx: Ctx): void {
  const line = app.root.querySelector('.game-seed');
  ensure(ctx, line !== null && !line.hasAttribute('hidden'), 'the Seed line is not shown');
  ensure(ctx, textOf(line) === label(app, 'game.seed', { seed: ctx.seed }), 'the Seed line does not show the game seed');
}

function startFromSetup(app: MountedApp, ctx: Ctx): void {
  const notice = label(app, 'common.provisionalScoring');
  checkBanner(app, ctx, notice);
  const before = app.root.querySelector('.game-seed');
  ensure(ctx, before === null || before.hasAttribute('hidden') || textOf(before) === '', 'a Seed line is shown before the game starts');
  ensure(ctx, (app.root.querySelector('#setup-humans-1') as HTMLInputElement | null)?.checked === true, 'one human is not the default');
  typeInto(app, label(app, 'setup.seed.label'), String(ctx.seed));
  const key: StringKey = `setup.visibility.${ctx.visibility}`;
  const text = label(app, key);
  clickByLabel(app, ctx.visibility === 'OWNER_ONLY' ? `${text} ${label(app, 'setup.visibility.default')}` : text);
  clickByLabel(app, label(app, 'setup.start'));
  const model = app.controller.getModel();
  ensure(ctx, model.screen === 'GAME' && model.lastError === null, 'the game did not start');
  ensure(ctx, viewOf(app, ctx).rules.identityVisibility === ctx.visibility, 'the visibility did not reach the game');
  checkSeedLine(app, ctx);
}

/** Entering invalid texts through the form: a localized inline error appears and no Action is accepted. */
function probeInvalidGuesses(app: MountedApp, ctx: Ctx, keys: readonly string[]): void {
  const first = keys[0] as string;
  const range = { min: GUESS_MIN, max: GUESS_MAX };
  const field = label(app, 'guess.input.label', { key: first, ...range });
  const cases: readonly (readonly [string, string])[] = [
    ['3', label(app, 'error.GUESS_OUT_OF_RANGE')],
    [String(GUESS_MAX + 1), label(app, 'error.GUESS_OUT_OF_RANGE')],
    ['4.5', label(app, 'error.GUESS_NOT_INTEGER')],
    ['', label(app, 'guess.error.missing', range)],
  ];
  const before = app.controller.getModel().actionCount;
  for (const [text, message] of cases) {
    typeInto(app, field, text);
    clickByLabel(app, label(app, 'guess.submit'));
    const error = app.root.querySelector(`#guess-error-${first}`);
    ensure(ctx, textOf(error) === message, 'the localized inline error is not shown for an invalid Guess');
    ensure(ctx, app.controller.getModel().actionCount === before, 'an Action was accepted for an invalid Guess');
    ensure(ctx, app.controller.getModel().lastError === null, 'an invalid Guess reached the engine');
    ensure(ctx, viewOf(app, ctx).guessSubmitted[HUMAN] === false, 'the Guess form closed after an invalid entry');
  }
}

function enterGuesses(app: MountedApp, ctx: Ctx, view: PlayerView, probe: boolean): void {
  const form = app.root.querySelector('.guess-form');
  ensure(ctx, form !== null, 'no Guess form is shown in the Guess phase');
  const inputs = form.querySelectorAll('input.guess-input');
  ensure(ctx, inputs.length === view.pendingQuadKeys.length && inputs.length > 0, 'the form has no input per pending Quad_Key');
  const hiddenSum = label(app, 'reveal.code.sum', { sum: '' }).split(':')[0] as string;
  ensure(ctx, !textOf(app.root.querySelector('.guess-entry')).includes(hiddenSum), 'a Hidden_Sum text is on screen during the Guess phase');
  if (probe) probeInvalidGuesses(app, ctx, view.pendingQuadKeys);
  const mid = Math.floor((GUESS_MIN + GUESS_MAX) / 2);
  view.pendingQuadKeys.forEach((key, i) => {
    // Deterministic spread around the midpoint, always inside the engine's range.
    const value = mid + ((ctx.iter + i) % 5) - 2;
    typeInto(app, label(app, 'guess.input.label', { key, min: GUESS_MIN, max: GUESS_MAX }), String(value));
  });
  clickByLabel(app, label(app, 'guess.submit'));
  ensure(ctx, app.controller.getModel().lastError === null, 'the Guesses were rejected');
}

function checkRevealScreen(app: MountedApp, ctx: Ctx, view: PlayerView): void {
  const record = view.lastReveal;
  ensure(ctx, record !== null, 'the reveal phase has no reveal record');
  const codes = Array.from(app.root.querySelectorAll('.reveal-code'));
  ensure(ctx, codes.length === record.codes.length && codes.length > 0, 'the reveal screen does not list every completed code');
  record.codes.forEach((code, i) => {
    const el = codes[i] as Element;
    ensure(ctx, el.getAttribute('data-quad-key') === code.quadKey, 'a reveal code is out of order');
    ensure(ctx, el.querySelectorAll('.card-face').length === 4 && code.cards.length === 4, 'a revealed code does not list 4 cards');
    ensure(ctx, textOf(el.querySelector('.reveal-sum')) === label(app, 'reveal.code.sum', { sum: code.hiddenSum }), 'the hidden sum of a code is wrong');
  });
}

/** The end screen against the public view: ranking rows, shared ranks, history, no Guess data. */
function checkEnd(app: MountedApp, ctx: Ctx, view: PlayerView): void {
  const end = app.root.querySelector('.end');
  ensure(ctx, end !== null, 'the end screen is not shown');
  const ranking = view.ranking;
  ensure(ctx, ranking !== null && ranking.length === 4 && view.rules.seats.length === 4, 'the engine ranking does not have 4 entries');
  const rows = Array.from(end.querySelectorAll('.end-ranking tbody tr'));
  ensure(ctx, rows.length === 4, `the ranking table has ${rows.length} rows`);
  ranking.forEach((entry, i) => {
    const row = rows[i] as Element;
    const seat = view.rules.seats.find((s) => s.id === entry.player);
    ensure(ctx, seat !== undefined && row.getAttribute('data-seat') === entry.player, 'a ranking row is for the wrong seat');
    ensure(ctx, row.getAttribute('data-rank') === String(entry.rank), 'a displayed rank differs from the engine ranking');
    ensure(ctx, textOf(row.querySelector('.end-rank')).startsWith(String(entry.rank)), 'the rank cell differs from the engine ranking');
    ensure(ctx, textOf(row.querySelector('.end-name')) === seat.name, 'a ranking row shows the wrong seat name');
    ensure(ctx, textOf(row.querySelector('.end-final')) === String(entry.score) && view.scores[entry.player] === entry.score, 'a final score differs from the view');
  });
  ensure(ctx, new Set(rows.map((r) => r.getAttribute('data-seat'))).size === 4, 'the ranking does not list every seat once');

  const batches = Array.from(end.querySelectorAll('.end-batch'));
  ensure(ctx, batches.length === view.history.length && view.history.length >= 1, 'the history does not show every reveal record');
  const tr = (key: StringKey, params?: Record<string, string | number>): string => label(app, key, params);
  const h = createH(document);
  view.history.forEach((record, i) => {
    const codes = Array.from((batches[i] as Element).querySelectorAll('.end-code'));
    ensure(ctx, codes.length === record.codes.length, 'a history entry lists the wrong number of codes');
    record.codes.forEach((code, j) => {
      const el = codes[j] as Element;
      ensure(ctx, el.getAttribute('data-quad-key') === code.quadKey, 'a history code is out of order');
      ensure(ctx, textOf(el.querySelector('.end-sum')) === tr('reveal.code.sum', { sum: code.hiddenSum }), 'a history hidden sum differs from the record');
      const faces = Array.from(el.querySelectorAll('.end-cards [role="img"]')).map(nameOf);
      const expected = code.cards.map((card) => nameOf(revealCardFace(h, card, tr)));
      ensure(ctx, faces.length === 4 && faces.join('|') === expected.join('|'), 'the card faces of a history code differ from the record');
    });
  });
  // No Guess data on the end screen: no form, no field, no typed value, no Guess wording in its text or markup.
  ensure(ctx, app.root.querySelectorAll('.guess-entry, .guess-form, .guess-input').length === 0, 'a Guess form is on the end screen');
  ensure(ctx, Array.from(app.root.querySelectorAll('input, textarea')).every((el) => (el as HTMLInputElement).value === ''), 'an input holds a value on the end screen');
  ensure(ctx, !/guess/i.test(end.outerHTML), 'Guess wording or markup is on the end screen');
}

/** Plays the started game to the end screen with the default automatic flow. */
function playToEnd(app: MountedApp, ctx: Ctx, probeInvalid: boolean): RunStats {
  const notice = label(app, 'common.provisionalScoring');
  const stats: RunStats = { humanPlacements: 0, guessEntries: 0, revealScreens: 0, reveals: 0, twoCodeBatches: 0, actionCount: 0, iterations: 0, initial: null };
  let previous = app.controller.getModel().actionCount;
  let probed = false;
  for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
    ctx.iter = iter;
    const model = app.controller.getModel();
    const view = viewOf(app, ctx);
    ctx.phase = view.phase;
    ensure(ctx, model.lastError === null, `an Action was rejected (code ${model.lastError?.code ?? '-'})`);
    ensure(ctx, !model.aiStalled, 'the AI stalled');
    ensure(ctx, model.gate === null, 'a gate is shown with one human seat');
    ensure(ctx, model.actionCount >= previous, 'actionCount decreased');
    previous = model.actionCount;
    checkBanner(app, ctx, notice);
    checkSeedLine(app, ctx);

    if (view.phase === 'ENDED') {
      ensure(ctx, model.screen === 'END', 'the model is not on the end screen');
      stats.iterations = iter;
      stats.actionCount = model.actionCount;
      stats.reveals = view.history.length;
      stats.twoCodeBatches = view.history.filter((r) => r.codes.length === 2).length;
      ensure(ctx, stats.reveals >= 1, 'the game has no reveal (the seed does not form a code)');
      ensure(ctx, stats.revealScreens >= 1, 'no reveal screen was observed');
      ensure(ctx, model.actionCount <= MAX_PLACE_ACTIONS + 5 * view.history.length, 'more Actions than the documented bound');
      checkEnd(app, ctx, view);
      return stats;
    }
    if (view.phase === 'PLACEMENT') {
      ensure(ctx, view.turn === HUMAN, 'an AI is on turn after the AI steps were drained');
      if (stats.initial === null) stats.initial = snapshot(app);
      const occupied = (v: PlayerView): number => v.board.filter((c) => c !== null).length;
      const before = occupied(view);
      const result = playHumanTurnAuto(app);
      ensure(ctx, result.actionCountAfter >= result.actionCountBefore + 1 && occupied(viewOf(app, ctx)) >= before + 1, 'the human placement did not grow the board');
      stats.humanPlacements++;
    } else if (view.phase === 'GUESS_COLLECT') {
      enterGuesses(app, ctx, view, probeInvalid && !probed);
      probed = true;
      stats.guessEntries++;
    } else {
      ensure(ctx, view.phase === 'REVEAL' && app.root.querySelector('.reveal') !== null, 'no reveal screen in the reveal phase');
      checkRevealScreen(app, ctx, view);
      stats.revealScreens++;
      clickByLabel(app, label(app, 'reveal.continue'));
    }
  }
  ensure(ctx, false, `the game did not end within ${MAX_ITERATIONS} iterations`);
}

function playGame(app: MountedApp, seed: number, visibility: IdentityVisibility, probeInvalid = true): { ctx: Ctx; stats: RunStats } {
  const ctx: Ctx = { seed, visibility, iter: 0, phase: 'SETUP' };
  startFromSetup(app, ctx);
  return { ctx, stats: playToEnd(app, ctx, probeInvalid) };
}

describe('full game through the real UI (one human, three AI; fake-DOM, not a real browser)', () => {
  for (const seed of SEEDS) {
    for (const visibility of VISIBILITIES) {
      it(`seed ${seed}, ${visibility}: setup to final ranking`, () => {
        const app = mountTestApp({ seed });
        const { stats } = playGame(app, seed, visibility);
        expect(stats.reveals).toBeGreaterThanOrEqual(1);
        expect(app.controller.getModel().screen).toBe('END');
        expect(app.scheduler.pending()).toBe(0);
      });
    }
  }
});

describe('replay and rematch from the end screen', () => {
  it(`replay same seed ${REPLAY_SEED}: same seed, same initial hand and board`, () => {
    const app = mountTestApp({ seed: REPLAY_SEED });
    const { ctx, stats } = playGame(app, REPLAY_SEED, 'OWNER_ONLY', false);
    ensure(ctx, stats.initial !== null && stats.initial.hand.length === 3, 'the first initial hand was not captured');
    clickByLabel(app, label(app, 'end.replay'));
    const model = app.controller.getModel();
    ensure(ctx, model.screen === 'GAME' && model.lastError === null, 'the replay did not start a game');
    checkSeedLine(app, ctx);
    ensure(ctx, viewOf(app, ctx).phase === 'PLACEMENT', 'the replayed game is not at a placement turn');
    const again = snapshot(app);
    expect(again.hand).toEqual(stats.initial?.hand);
    expect(again.board).toEqual(stats.initial?.board);
    expect(app.seedCalls()).toBe(1); // the replay did not draw a new seed
  });

  it(`rematch: a different injected seed and a different initial hand`, () => {
    const app = mountTestApp({ seeds: [REPLAY_SEED, REMATCH_SEED] });
    const { ctx, stats } = playGame(app, REPLAY_SEED, 'OWNER_ONLY', false);
    ensure(ctx, stats.initial !== null && stats.initial.hand.length === 3, 'the first initial hand was not captured');
    clickByLabel(app, label(app, 'end.rematch'));
    const model = app.controller.getModel();
    ensure(ctx, model.screen === 'GAME' && model.lastError === null, 'the rematch did not start a game');
    const line = textOf(app.root.querySelector('.game-seed'));
    expect(line).toBe(label(app, 'game.seed', { seed: REMATCH_SEED }));
    expect(line).not.toBe(label(app, 'game.seed', { seed: REPLAY_SEED }));
    ensure(ctx, viewOf(app, ctx).phase === 'PLACEMENT', 'the rematch is not at a placement turn');
    expect(snapshot(app).hand).not.toEqual(stats.initial?.hand);
  });
});

