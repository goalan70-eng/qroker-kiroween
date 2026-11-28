import { existsSync } from 'node:fs';
import backMarks from '../src/game/ui/back-marks/index.json' with { type: 'json' };
import type { Locator, Page } from '@playwright/test';
import {
  SEED_A,
  SEED_B,
  acknowledgeReveal,
  boardLabels,
  currentStep,
  domDump,
  expect,
  expectOneBanner,
  expectTouchTargets,
  handCardNames,
  handLabels,
  horizontalOverflow,
  insideViewport,
  occupiedCount,
  playHumanTurn,
  playUntil,
  scoreboard,
  seedLine,
  startGame,
  stubSeeds,
  submitGuesses,
  test,
} from './helpers/game';

// Real-browser verification of the PRODUCTION page `/` (task 19.4, design.md "Real-browser verification", scenarios 1-7).
// Evidence class 2/3: real Chromium engine, emulated viewport and touch. Not a real device, not other browsers.
// The Seed is controlled by a `crypto.getRandomValues` stub (helpers/game.ts); AI pacing (600 ms) is real time.

const hasLocalDeck = existsSync('prototypes/screen-playtest/inputs/cards/AH.svg');
const LONG_TEST = 5 * 60_000;
const confirmButton = (page: Page): Locator => page.locator('.placement-button--confirm');

/** Everything the public state shows at a human turn; compared before and after an action. */
async function publicState(page: Page) {
  return {
    hand: await handLabels(page),
    occupied: await occupiedCount(page),
    scores: await scoreboard(page),
    seed: await seedLine(page),
  };
}

/** The DOM without the elements that legitimately show public numbers (scores, sums, deck, Seed), as markup. */
async function domWithoutPublicNumbers(page: Page): Promise<string> {
  return page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    const strip = '.reveal-sum, .reveal-earned, .reveal-total, .reveal-final, .scoreboard-score, .scoreboard-hand, .scoreboard-deck, .game-seed';
    clone.querySelectorAll(strip).forEach((el) => el.remove());
    return clone.outerHTML;
  });
}

const inputValues = (page: Page): Promise<string[]> =>
  page.evaluate(() => [...document.querySelectorAll('input, textarea')].map((el) => (el as HTMLInputElement).value));

const hasNumber = (markup: string, n: number): boolean => new RegExp(`(?<![0-9])${n}(?![0-9])`).test(markup);

// ---------------------------------------------------------------------------------------------------------------
// 1
// ---------------------------------------------------------------------------------------------------------------

test('four marked backs complete D3 after rotating the second club', async ({ page }) => {
  // Observe scheduled, decoded audio in Chromium while leaving real playback in place.
  const played: number[] = [];
  page.on('console', message => {
    if (message.text().startsWith('sfx-cs=')) played.push(Number(message.text().slice(7)));
  });
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      start.apply(this, args);
      console.debug('sfx-cs=' + Math.round(this.buffer!.duration * 100));
    };
  });
  await page.goto('/');
  await page.locator('#setup-humans-4').check();
  await page.locator('#setup-visibility-BLIND').check();
  await page.locator('#setup-seed').fill('1');
  await page.locator('#setup-start').click();

  await expect.poll(() => played).toEqual([78]); // centiseconds, tolerant of decoder padding

  const gate = page.locator('#privacy-gate-ack');
  const deck = page.locator('.deck-stack .table-card-back');
  let firstDraw: string | null = null;
  for (const [rank, col] of [[6, 3], [4, 4]] as const) {
    if (await gate.count()) await gate.click();
    if (rank === 6) {
      firstDraw = await deck.getAttribute('style');
      await expect(page.locator(`[data-seat="P1"] .seat-card-back[style*="${backMarks['C-4']}"]`)).toHaveCount(1);
    } else {
      expect(firstDraw).toBeTruthy();
      expect(await deck.getAttribute('style')).not.toBe(firstDraw);
      const dealt = await page.locator('[data-seat="P0"] .seat-card-back').evaluateAll(
        cards => cards.map(card => card.getAttribute('style')),
      );
      expect(dealt).toContain(firstDraw);
    }
    const club = page.locator('.hand-card').filter({ hasText: '♣' }).filter({
      has: page.locator('.card-face__rank').filter({ hasText: new RegExp(`^${rank}$`) }),
    });
    await club.click();
    await page.locator(`.board-cell[data-row="2"][data-col="${col}"]`).click();
    if (rank === 4) await page.locator('.placement-button--rotate').click();
    await confirmButton(page).click();
  }
  if (await gate.count()) await gate.click();
  await expect(page.locator('.board-code-junction--open[data-quad-key="D3"]')).toBeVisible();
  for (const [row, col, card] of [[2, 3, 'C-6'], [2, 4, 'C-4'], [3, 3, 'D-Q'], [3, 4, 'S-6']] as const) {
    const face = page.locator(`.board-cell[data-row="${row}"][data-col="${col}"] .card-face--down`);
    await expect(face).toHaveAttribute('style', new RegExp(backMarks[card]));
    if (card === 'C-4') await expect(face).toHaveAttribute('data-orientation', '180');
  }
  // PLACE + DRAW, then PLACE + CODE. A privacy handoff and switching views are silent.
  const beforeReveal = [78, 8, 46, 8, 60];
  await expect.poll(() => played).toEqual(beforeReveal);
  const guess = page.locator('#guess-input-D3');
  const warning = page.locator('#guess-error-D3');
  await expect(page.locator('.guess-seats')).toBeHidden();
  await expect(page.locator('.guess-region')).toBeHidden();
  await guess.fill('3');
  await guess.press('Tab');
  await expect(warning).toHaveText('Try again with a whole number from 4 to 52.');
  await guess.fill('53');
  await guess.press('Enter');
  await expect(warning).toBeVisible();
  await expect(guess).toBeFocused();
  await guess.fill('28');
  await expect(warning).toBeHidden();
  await page.locator('#game-board-view').click();
  await expect(guess).toHaveValue('28');
  const d3 = (await page.locator('.board-cell[data-row="2"][data-col="3"]').boundingBox())!;
  const junction = (await page.locator('.board-code-junction[data-quad-key="D3"]').boundingBox())!;
  expect(junction.x + junction.width / 2).toBeCloseTo(d3.x + d3.width, 1);
  expect(junction.y + junction.height / 2).toBeCloseTo(d3.y, 1);
  for (let seat = 0; seat < 4; seat++) {
    if (await gate.count()) await gate.click();
    expect(played).toEqual(beforeReveal);
    await submitGuesses(page, 28);
  }
  await expect(page.locator('#reveal-continue')).toBeVisible();
  await expect.poll(() => played).toEqual([...beforeReveal, 88]);
});

test('mouse hover enlarges only the pointed hand card and restores it on exit', async ({ page }) => {
  await startGame(page, { humans: 4, seedText: '1' });
  const cards = page.locator('.hand-card');
  const face = cards.first().locator('.card-face');
  const width = () => face.evaluate(el => el.getBoundingClientRect().width);
  const resting = await width();
  const neighbor = await cards.nth(1).boundingBox();
  await cards.first().hover();
  await expect.poll(width).toBeGreaterThan(resting * 1.03);
  expect(await cards.nth(1).boundingBox()).toEqual(neighbor);
  await expect(cards.first()).toHaveAttribute('aria-pressed', 'false');
  await page.mouse.move(0, 0);
  await expect.poll(width).toBeCloseTo(resting, 1);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await cards.first().hover();
  expect(await width()).toBeCloseTo(resting, 1);
  await cards.first().click();
  await expect(cards.first()).toHaveAttribute('aria-pressed', 'true');
});

test.describe('1 full game', () => {
  test('one human and three BEGINNER AI Seats play from setup to a four-player ranking', async ({ page }) => {
    test.setTimeout(LONG_TEST);
    await stubSeeds(page, [SEED_A, SEED_B]);
    await startGame(page);
    const seed = await seedLine(page);
    expect(seed).toContain(String(SEED_A));
    let samples = 0;
    const { steps } = await playUntil(page, {
      before: async (kind) => {
        await expectOneBanner(page);
        if (kind !== 'GATE') await expect(page.locator('.game-seed')).toHaveText(seed);
        samples++;
      },
    });
    console.log(`[e2e] scenario 1: ${steps} steps, ${samples} samples`);
    await expect(page.locator('.end-ranking tbody tr')).toHaveCount(4);
    await expectOneBanner(page);
    await expect(page.locator('.game-seed')).toHaveText(seed);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 2
// ---------------------------------------------------------------------------------------------------------------

test.describe('2 placement', () => {
  test('drag then confirm, Escape, position first, rotation only for clubs and spades', async ({ page }) => {
    test.setTimeout(LONG_TEST);
    await stubSeeds(page, [SEED_A]);
    await startGame(page);
    await expect(page.locator('.hand-card')).toHaveCount(3);

    // --- A. rotation control exists exactly for clubs and spades (read from the owner's own card faces) ---
    const labels = await handLabels(page);
    expect(labels).toHaveLength(3);
    for (let i = 0; i < labels.length; i++) {
      await page.locator('.hand-card').nth(i).click();
      await expect(page.locator('.hand-card').nth(i)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.placement-button--rotate')).toBeHidden();
      await page.locator('.board-cell.is-legal').first().click();
      const expected = /Clubs|Spades/.test(labels[i]!) ? 1 : 0;
      await expect(page.locator('.placement-button--rotate'), `rotation for ${labels[i]}`).toHaveCount(expected);
      if (expected === 1) {
        const rotate = page.locator('.placement-button--rotate');
        await rotate.click();
        await expect(rotate).toHaveAttribute('aria-pressed', 'true');
        await rotate.click();
        await expect(rotate).toHaveAttribute('aria-pressed', 'false');
      }
      await page.locator('.placement-button--cancel').click();
    }
    await expect(page.locator('.placement-button--rotate')).toHaveCount(0);

    // --- B. Escape cancels a draft and changes no public state ---
    const idle = await publicState(page);
    await page.locator('.hand-card').first().click();
    await page.locator('.board-cell.is-legal').first().click();
    await expect(page.locator('.board-ghost.is-preview')).toHaveCount(1);
    await expect(confirmButton(page)).toBeEnabled();
    expect(await publicState(page)).toEqual(idle); // a preview changes nothing public
    await page.keyboard.press('Escape');
    await expect(page.locator('.board-ghost.is-preview')).toHaveCount(0);
    await expect(confirmButton(page)).toBeDisabled();
    await expect(page.locator('.hand-card[aria-pressed="true"]')).toHaveCount(0);
    expect(await publicState(page)).toEqual(idle);

    // --- C. real mouse drag: preview only, nothing placed before Confirm ---
    const legal = page.locator('.board-cell.is-legal').first();
    const row = await legal.getAttribute('data-row');
    const col = await legal.getAttribute('data-col');
    const target = page.locator(`.board-cell[data-row="${row}"][data-col="${col}"]`);
    const from = await page.locator('.hand-card').first().boundingBox();
    const to = await legal.boundingBox();
    expect(from).not.toBeNull();
    expect(to).not.toBeNull();
    const x0 = from!.x + from!.width / 2;
    const y0 = from!.y + from!.height / 2;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x0 + 24, y0 - 24, { steps: 4 }); // well over DRAG_THRESHOLD_PX (8)
    await expect(page.locator('.drag-overlay')).toHaveCount(1);
    expect(await publicState(page)).toEqual(idle); // dragging changes nothing public
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(target).toHaveClass(/is-target/);
    await expect(page.locator('.board-ghost.is-preview')).toHaveCount(1);
    await expect(page.locator('.drag-overlay')).toHaveCount(0);
    expect(await publicState(page)).toEqual(idle); // dropped, still not placed
    await expect(confirmButton(page)).toBeEnabled();

    // --- D. Confirm: exactly one accepted placement (a second activation of the same control is refused) ---
    const confirmHandle = await confirmButton(page).elementHandle();
    await confirmButton(page).click();
    await confirmHandle!.evaluate((el) => (el as HTMLElement).click()); // stale element, same listener
    const afterFirst = await publicState(page);
    expect(afterFirst.occupied).toBe(idle.occupied + 1);
    const me = Object.keys(idle.scores)[0]!;
    expect(afterFirst.scores[me]!.hand).toBe(idle.scores[me]!.hand); // no code: replace the played card
    await expect(page.locator('.hand-card:not(.is-disabled)')).toHaveCount(0); // not the human's turn any more

    // --- E. position first: select the cell, then the card, then Confirm ---
    expect(await currentStep(page)).toBe('PLACE');
    const before = await publicState(page);
    const handBefore = before.scores[me]!.hand;
    expect(await page.locator('.hand-card').count()).toBe(handBefore);
    const legal2 = page.locator('.board-cell.is-legal').first();
    const row2 = await legal2.getAttribute('data-row');
    const col2 = await legal2.getAttribute('data-col');
    await legal2.click();
    await expect(page.locator(`.board-cell[data-row="${row2}"][data-col="${col2}"]`)).toHaveClass(/is-target/);
    await expect(confirmButton(page)).toBeDisabled();
    await page.locator('.hand-card').first().click();
    await expect(page.locator('.board-ghost.is-preview')).toHaveCount(1);
    expect(await publicState(page)).toEqual(before);
    await confirmButton(page).click();
    const after = await publicState(page);
    expect(after.occupied).toBe(before.occupied + 1);
    // A placement that does not complete a code draws one card, so the Hand is `before` or `before - 1` (code completed).
    expect([handBefore - 1, handBefore]).toContain(after.scores[me]!.hand);
    expect(Object.keys(after.scores).sort()).toEqual(Object.keys(before.scores).sort());
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 3
// ---------------------------------------------------------------------------------------------------------------

test.describe('3 two human Seats', () => {
  test('the gate shows no Hand, no Guess input and no Guess value; the next Seat gets its own view', async ({ page }) => {
    test.setTimeout(LONG_TEST);
    await stubSeeds(page, [SEED_A]);
    await startGame(page, { humans: 2 });

    const seenCards = new Set<string>(); // every card name that was ever on a Hand screen
    let lastHand: string[] = [];
    const typed: number[] = [];
    const purposes = new Set<string>();
    let gates = 0;
    let handChanges = 0;
    let reveals = 0;

    for (let i = 0; i < 200 && reveals < 1; i++) {
      const kind = await currentStep(page);
      if (kind === 'END') break;
      if (kind === 'GATE') {
        gates++;
        const purpose = (await page.locator('.privacy-gate').getAttribute('class'))!.includes('--guess') ? 'GUESS' : 'HAND';
        purposes.add(purpose);
        const dump = await domDump(page);
        // no Hand card of any seat, no card face, no board, no input
        expect(await page.locator('#game-main :is(.hand-card, .card-face, .board-cell, .hand, input, textarea, select)').count()).toBe(0);
        for (const name of seenCards) expect(dump, `gate DOM must not contain "${name}"`).not.toContain(name);
        for (const value of typed) expect(hasNumber(dump, value), `gate DOM must not contain the Guess ${value}`).toBe(false);
        expect(dump).not.toMatch(/\bP[0-3]\b/); // seat ids never reach the DOM of the gate
        expect(dump).not.toContain('guess-input');
        // only the next Seat's public name
        const message = (await page.locator('#privacy-gate-message').textContent()) ?? '';
        expect(message).toMatch(/Player [12]/);
        expect(message).not.toMatch(/AI \d/);
        await expect(page.locator('.privacy-gate-ack')).toBeFocused();
        await page.locator('#privacy-gate-ack').click();
        await expect(page.locator('.privacy-gate')).toHaveCount(0);
        continue;
      }
      if (kind === 'PLACE') {
        const names = await handCardNames(page);
        const changed = lastHand.length > 0 && names.every((n) => !lastHand.includes(n));
        if (changed) {
          handChanges++;
          // The next Seat's Hand is rendered and shares no card with the previous Seat's Hand.
          expect(names.some((n) => lastHand.includes(n))).toBe(false);
        }
        names.forEach((n) => seenCards.add(n));
        lastHand = names;
        await playHumanTurn(page);
        continue;
      }
      if (kind === 'GUESS') {
        const value = typed.length === 0 ? 17 : 43;
        // A fresh form holds nothing typed before (no value of the previous Seat carried over).
        expect((await inputValues(page)).every((v) => v === '')).toBe(true);
        const inputs = page.locator('.guess-input');
        for (let k = 0; k < (await inputs.count()); k++) await inputs.nth(k).fill(String(value));
        await page.locator('#guess-submit').click();
        typed.push(value);
        // After submission the inputs are removed and no typed value is left in the DOM.
        await expect(page.locator('.guess-input')).toHaveCount(0);
        expect((await inputValues(page)).filter((v) => v !== '')).toEqual([]);
        continue;
      }
      // REVEAL: public. The typed Guesses are not in the DOM (public numbers are excluded from the scan).
      expect(typed.length).toBe(2);
      const markup = await domWithoutPublicNumbers(page);
      for (const value of typed) expect(hasNumber(markup, value), `reveal DOM must not contain the Guess ${value}`).toBe(false);
      expect((await inputValues(page)).filter((v) => v !== '')).toEqual([]);
      await acknowledgeReveal(page);
      reveals++;
    }
    console.log(`[e2e] scenario 3: ${gates} gates, purposes ${[...purposes].join('+')}, ${handChanges} Hand changes`);
    expect(reveals).toBe(1);
    expect([...purposes].sort()).toEqual(['GUESS', 'HAND']);
    expect(handChanges).toBeGreaterThan(0);
    expect(gates, 'every change of the Hand owner went through a gate').toBeGreaterThanOrEqual(handChanges);
    // Later moments: the next steps still show no typed Guess.
    for (let i = 0; i < 6; i++) {
      const kind = await currentStep(page);
      if (kind === 'END') break;
      const markup = await domWithoutPublicNumbers(page);
      for (const value of typed) expect(hasNumber(markup, value)).toBe(false);
      if (kind === 'GATE') await page.locator('#privacy-gate-ack').click();
      else if (kind === 'PLACE') await playHumanTurn(page);
      else if (kind === 'GUESS') await submitGuesses(page, 30);
      else await acknowledgeReveal(page);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 4
// ---------------------------------------------------------------------------------------------------------------

test.describe('4 reveal and scoring', () => {
  test('no Hidden_Sum before the reveal; earned and cumulative points are consistent; no Guess in the reveal', async ({ page }) => {
    test.setTimeout(LONG_TEST);
    const seeds = ['20240601', '31337', '4242', '99'];
    let found = false;
    for (const seedText of seeds) {
      await stubSeeds(page, []); // the typed seed decides; the stub only keeps the default deterministic
      await startGame(page, { seedText });
      const { stoppedAt } = await playUntil(page, { stopAt: (kind) => kind === 'GUESS', maxSteps: 120 });
      if (stoppedAt !== 'GUESS') continue; // no Composite Code formed in this seed: next seed
      found = true;
      console.log(`[e2e] scenario 4: code formed with seed ${seedText}`);

      // Before the reveal: no reveal screen, no sum element, no sum text.
      await expect(page.locator('.reveal, .reveal-sum')).toHaveCount(0);
      expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/Hidden sum/i);
      const previous = await scoreboard(page);
      await page.locator('.guess-input').first().waitFor();
      const typed = await submitGuesses(page, 20);

      expect(await currentStep(page)).toBe('REVEAL');
      const rows = await page.locator('.reveal-points tbody tr').evaluateAll((trs) =>
        trs.map((tr) => ({
          seat: tr.getAttribute('data-seat') ?? '',
          earned: Number(tr.querySelector('.reveal-earned')?.textContent),
          total: Number(tr.querySelector('.reveal-total')?.textContent),
        })),
      );
      expect(rows.map((r) => r.seat).sort()).toEqual(Object.keys(previous).sort());
      const nowBoard = await scoreboard(page);
      for (const r of rows) {
        expect(Number.isInteger(r.earned) && Number.isInteger(r.total)).toBe(true);
        expect(previous[r.seat]!.score + r.earned, `seat ${r.seat}: previous + earned = cumulative`).toBe(r.total);
        expect(nowBoard[r.seat]!.score, `seat ${r.seat}: scoreboard shows the cumulative`).toBe(r.total);
      }
      // After the reveal: the sum is shown (and only now).
      const sums = await page.locator('.reveal-sum').allTextContents();
      expect(sums.length).toBeGreaterThan(0);
      for (const sum of sums) expect(sum).toMatch(/^Hidden sum: \d+$/);
      // No Guess value and no element naming a Guess.
      expect(await page.locator('input, textarea, [class*="guess"], [id*="guess"], [data-guess]').count()).toBe(0);
      expect(await page.locator('.reveal').innerHTML()).not.toMatch(/guess/i);
      const markup = await domWithoutPublicNumbers(page);
      for (const value of typed) expect(hasNumber(markup, value), `reveal DOM must not contain the typed ${value}`).toBe(false);
      break;
    }
    expect(found, 'a Composite Code formed in one of the seeds').toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 5
// ---------------------------------------------------------------------------------------------------------------

test.describe('5 replay and rematch', () => {
  test('replay same seed repeats the deal; rematch with an injected Seed changes it', async ({ page }) => {
    test.setTimeout(LONG_TEST);
    await stubSeeds(page, [SEED_A, SEED_B]);
    await page.goto('/');
    await expect(page.locator('#setup-seed')).toHaveValue(String(SEED_A)); // the stub decided the default seed
    await startGame(page);
    const seed = await seedLine(page);
    expect(seed).toContain(String(SEED_A));
    const hand = await handLabels(page);
    const board = await boardLabels(page);
    expect(hand).toHaveLength(3);
    await playUntil(page);
    const ranking = await page.locator('.end-ranking').innerText();

    await page.locator('#end-replay').click();
    await expect(page.locator('.hand-card')).toHaveCount(3);
    expect(await seedLine(page)).toBe(seed);
    expect(await handLabels(page)).toEqual(hand);
    expect(await boardLabels(page)).toEqual(board);
    await playUntil(page);
    expect(await page.locator('.end-ranking').innerText(), 'the same seed and the same moves give the same result').toBe(ranking);

    await page.locator('#end-rematch').click();
    await expect(page.locator('.hand-card')).toHaveCount(3);
    const reSeed = await seedLine(page);
    expect(reSeed).not.toBe(seed);
    expect(reSeed).toContain(String(SEED_B));
    expect(await handLabels(page)).not.toEqual(hand);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 6
// ---------------------------------------------------------------------------------------------------------------

test.describe('6 overlays', () => {
  const focusedId = (page: Page): Promise<string> => page.evaluate(() => document.activeElement?.id ?? '');

  test('Help from setup: opens, closes by button and Escape, focus returns to the opener', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#setup-start')).toBeVisible();
    for (const how of ['button', 'escape'] as const) {
      await page.locator('#game-help-open').click();
      await expect(page.locator('.help')).toBeVisible();
      await expect(page.locator('#game-main')).toHaveAttribute('inert', '');
      if (how === 'button') await page.locator('#help-close').click();
      else await page.keyboard.press('Escape');
      await expect(page.locator('.help')).toHaveCount(0);
      await expect(page.locator('#game-main')).not.toHaveAttribute('inert', '');
      expect(await focusedId(page)).toBe('game-help-open');
    }
  });

  test('mobile help keeps Close visible and updates default seat names in place', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    const picker = page.locator('select').filter({ has: page.locator('option[value="ko"]') });
    await expect(picker).toHaveCount(1);
    await picker.selectOption('ko');
    await page.locator('#setup-start').click();
    await expect(page.locator('.game-live')).toContainText('현재 차례: 나');
    await page.locator('#game-help-open').click();
    const dialog = page.locator('.overlay-dialog.help');
    const close = dialog.locator('#help-close');
    await expect(close).toBeInViewport({ ratio: 1 });
    await dialog.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(close).toBeInViewport({ ratio: 1 });
    await close.click({ trial: true });
    await dialog.locator('#help-language').selectOption('en');
    await close.click();
    await expect(page.locator('.game-live')).toContainText('Turn: You');
    await expect(page.locator('.hand-card')).toHaveCount(3);
  });

  test('Help and Abandon in a running game', async ({ page }) => {
    test.setTimeout(LONG_TEST);
    await stubSeeds(page, [SEED_A]);
    await startGame(page);
    await expect(page.locator('.hand-card')).toHaveCount(3);
    const state = await publicState(page);
    const board = await boardLabels(page);

    for (const how of ['button', 'escape'] as const) {
      await page.locator('#game-help-open').click();
      await expect(page.locator('.help')).toBeVisible();
      if (how === 'button') await page.locator('#help-close').click();
      else await page.keyboard.press('Escape');
      await expect(page.locator('.help')).toHaveCount(0);
      expect(await focusedId(page)).toBe('game-help-open');
      expect(await publicState(page)).toEqual(state);
      expect(await boardLabels(page)).toEqual(board);
    }

    // Abandon: Cancel keeps the game.
    await page.locator('#game-abandon-open').click();
    await expect(page.locator('.abandon-confirm')).toBeVisible();
    await page.locator('#abandon-cancel').click();
    await expect(page.locator('.abandon-confirm')).toHaveCount(0);
    expect(await focusedId(page)).toBe('game-abandon-open');
    expect(await publicState(page)).toEqual(state);
    expect(await boardLabels(page)).toEqual(board);
    // Escape also keeps the game.
    await page.locator('#game-abandon-open').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.abandon-confirm')).toHaveCount(0);
    expect(await publicState(page)).toEqual(state);

    // Abandon: Confirm returns to the setup once; a second activation does nothing.
    await page.locator('#game-abandon-open').click();
    const confirm = await page.locator('#abandon-confirm').elementHandle();
    await confirm!.evaluate((el) => {
      (el as HTMLElement).click();
      (el as HTMLElement).click(); // the same control activated again
    });
    await expect(page.locator('#setup-start')).toBeVisible();
    await expect(page.locator('#setup-start')).toHaveCount(1);
    await expect(page.locator('.hand-card, .board-cell, .abandon-confirm')).toHaveCount(0);
    await expect(page.locator('.setup')).toHaveCount(1);
  });

  test('a typed Guess survives opening and closing Help', async ({ page }) => {
    test.setTimeout(LONG_TEST);
    await stubSeeds(page, [SEED_A]);
    await startGame(page, { seedText: String(SEED_A) });
    const { stoppedAt } = await playUntil(page, { stopAt: (kind) => kind === 'GUESS', maxSteps: 120 });
    expect(stoppedAt).toBe('GUESS');
    const input = page.locator('.guess-input').first();
    await input.fill('23');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('23');
    await page.locator('#game-help-open').click();
    await expect(page.locator('.help')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.help')).toHaveCount(0);
    await expect(input).toHaveValue('23');
    await page.locator('#game-help-open').click();
    await page.locator('#help-close').click();
    await expect(input).toHaveValue('23');
    await expect(page.locator('.guess-input')).toHaveCount(await page.locator('.guess-field').count());
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 7
// ---------------------------------------------------------------------------------------------------------------

const MOBILE_SIZES = [
  { name: '390x844 touch', width: 390, height: 844, touch: true },
  { name: '320x640', width: 320, height: 640, touch: false },
] as const;

for (const size of MOBILE_SIZES) {
  test.describe(`7 mobile ${size.name}`, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      hasTouch: size.touch,
      isMobile: size.touch,
    });

    test('no horizontal overflow, Board and Hand visible, controls reachable, 44 px targets', async ({ page }) => {
      test.setTimeout(LONG_TEST);
      const act = (locator: Locator) => (size.touch ? locator.tap() : locator.click());
      const worst = { overflow: 0 };
      const checked = new Set<string>();
      const sample = async (label: string): Promise<void> => {
        worst.overflow = Math.max(worst.overflow, await horizontalOverflow(page));
        expect(await horizontalOverflow(page), `horizontal overflow on ${label}`).toBeLessThanOrEqual(0);
        if (!checked.has(label)) {
          checked.add(label);
          await expectTouchTargets(page);
        }
      };

      await stubSeeds(page, [SEED_A]);
      await page.goto('/');
      await expect(page.locator('#setup-start')).toBeVisible();
      await sample('setup');
      await act(page.locator('#setup-start'));
      await expect(page.locator('.hand-card')).toHaveCount(3);
      await sample('placement');

      // Board and Hand are inside the viewport horizontally.
      const view = page.viewportSize()!;
      for (const locator of [page.locator('.board'), ...(await page.locator('.hand-card').all())]) {
        const box = (await locator.boundingBox())!;
        expect(box.x, 'left edge inside the viewport').toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, 'right edge inside the viewport').toBeLessThanOrEqual(view.width + 0.5);
      }

      // Controls are reachable: select a card and a cell, scroll Confirm into view if needed, and place one card.
      await act(page.locator('.hand-card').first());
      await act(page.locator('.board-cell.is-legal').first());
      const confirm = confirmButton(page);
      await expect(confirm).toBeEnabled();
      const cancel = page.locator('.placement-button--cancel');
      // Page position of the controls (independent of how far Playwright scrolled to click): is a scroll needed?
      const pageBottom = (locator: Locator): Promise<number> =>
        locator.evaluate((el) => el.getBoundingClientRect().bottom + window.scrollY);
      const confirmBottom = Math.round(await pageBottom(confirm));
      const cancelBottom = Math.round(await pageBottom(cancel));
      const note = `${size.name}: with the preview shown Confirm ends at page y ${confirmBottom}, Cancel at ${cancelBottom}, viewport height ${view.height} (scroll needed: ${Math.max(confirmBottom, cancelBottom) > view.height})`;
      console.log(`[e2e] scenario 7 ${note}`);
      test.info().annotations.push({ type: 'confirm-position', description: note });
      await confirm.scrollIntoViewIfNeeded();
      await expect(confirm).toBeInViewport();
      await expectTouchTargets(page);
      await act(confirm);
      await expect.poll(() => scoreboard(page).then((s) => Object.values(s)[0]!.hand)).toBe(3);

      // Play on to the end and sample every kind of screen (guess, reveal, final).
      await playUntil(page, {
        before: async (kind) => {
          await sample(kind);
          if (kind === 'GUESS') await expect(page.locator('.guess-input').first()).toBeInViewport({ ratio: 0 });
        },
      });
      await sample('end');
      await expect(page.locator('.end-ranking tbody tr')).toHaveCount(4);
      console.log(`[e2e] scenario 7 ${size.name}: screens ${[...checked].join(', ')}; max overflow ${worst.overflow}`);
    });
  });
}

test.describe('7 desktop 1280x800', () => {
  test('Confirm and Cancel are inside the viewport without scrolling', async ({ page }) => {
    await stubSeeds(page, [SEED_A]);
    await startGame(page);
    await page.locator('.hand-card').first().click();
    await page.locator('.board-cell.is-legal').first().click();
    await expect(confirmButton(page)).toBeEnabled();
    expect(page.viewportSize()).toEqual({ width: 1280, height: 800 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await insideViewport(page, confirmButton(page)), 'Confirm inside the viewport').toBe(true);
    expect(await insideViewport(page, page.locator('.placement-button--cancel')), 'Cancel inside the viewport').toBe(true);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 8.6 Two Composite Codes in one placement (Task 8.6, qroker-playable-game)
//
// Scene generated by `npx tsx scripts/find-two-code-scene.ts --from 1 --to 300` (read-only engine run, see that file).
// Seed 115 produces C2 first, then the upright C-10 on E2 completes E1 and E2 together.
// Use the default human policy up to that batch, then score an exact guess and a near miss.
// The AI guesses below are private; the test uses them only to derive the expected points, never to read the screen.
// ---------------------------------------------------------------------------------------------------------------

const SCENE_8_6 = {
  seed: 115,
  placedCard: 'C-10',
  placedCell: { row: 1, col: 4 }, // E2
  quadKeys: ['E1', 'E2'],
  hiddenSums: { E1: 29, E2: 30 } as Record<string, number>,
  cumulativeBefore: { P0: 5, P1: 0, P2: 3, P3: 5 } as Record<string, number>,
  guesses: {
    P0: { E1: 29, E2: 31 },
    P1: { E1: 42, E2: 19 },
    P2: { E1: 41, E2: 15 },
    P3: { E1: 26, E2: 42 },
  } as Record<string, Record<string, number>>,
};

// Independent reward table of the active DEV_PLACEHOLDER ScoreConfig (rewardByError [10, 5, 4, 3, 2, 1]; error 6 or
// more scores 0). Written here, not imported from the engine, so the expected points do not depend on score.ts.
const REWARD_8_6 = [10, 5, 4, 3, 2, 1];
const rewardFor8_6 = (guess: number, hidden: number): number => {
  const error = Math.abs(guess - hidden);
  return error < REWARD_8_6.length ? REWARD_8_6[error]! : 0;
};
const SEATS_8_6 = ['P0', 'P1', 'P2', 'P3'] as const;

test.describe('8 two codes in one placement', () => {
  test.use({ locale: 'ko-KR' });
  test('one placement completes E1 and E2: one reveal with both sums and each seat\'s points', async ({ page }, testInfo) => {
    test.setTimeout(LONG_TEST);
    const scene = SCENE_8_6;
    await startGame(page, { language: 'ko', seedText: String(scene.seed) });

    const { stoppedAt } = await playUntil(page, {
      stopAt: async kind => kind === 'GUESS' && await page.locator('.guess-field').count() === 2,
    });
    expect(stoppedAt).toBe('GUESS');

    // (a) Two distinct Quad_Keys, in guess-input order, and both 2x2 groups contain the newly placed cell.
    const keys = await page.locator('.guess-field').evaluateAll((els) => els.map((el) => el.getAttribute('data-quad-key')));
    expect(keys).toEqual(scene.quadKeys);
    await expect(page.locator('.board-code-junction')).toHaveCount(3);
    await expect(page.locator('.board-code-junction[data-quad-key="C2"]')).toBeVisible();
    for (const key of scene.quadKeys) {
      const marker = page.locator(`.board-code-junction[data-quad-key="${key}"]`);
      await expect(marker).toBeVisible();
      const dot = (await marker.boundingBox())!;
      const cell = (await marker.locator('..').boundingBox())!;
      expect(Math.abs(dot.x + dot.width / 2 - cell.x - cell.width)).toBeLessThan(1);
      expect(Math.abs(dot.y + dot.height / 2 - cell.y - cell.height)).toBeLessThan(1);
    }
    await expect(page.locator('.card-face--down :is(img, .card-face__fragment)')).toHaveCount(0);
    expect(new Set(keys).size, 'two distinct Quad_Keys').toBe(2);
    for (const key of keys) {
      const top = { col: key.charCodeAt(0) - 'A'.charCodeAt(0), row: Number(key.slice(1)) - 1 };
      const { row, col } = scene.placedCell;
      const contains = row >= top.row && row <= top.row + 1 && col >= top.col && col <= top.col + 1;
      expect(contains, `${key} contains the placed cell`).toBe(true);
    }

    // (b) Before the final submission the guess screen discloses no hidden sum as an answer.
    await expect(page.locator('.reveal, .reveal-sum, .reveal-code')).toHaveCount(0);
    const dumpBefore = await domDump(page);
    expect(dumpBefore, 'no hidden-sum attribute in the DOM').not.toMatch(/hiddenSum|hidden-sum|data-sum/i);
    for (const text of await page.locator('.guess-field').allTextContents()) {
      expect(text, 'no labelled hidden-sum answer in a guess field').not.toMatch(/숨겨진 합\s*:\s*\d+/);
    }
    await page.locator('#guess-input-E1').fill(String(scene.guesses.P0.E1));
    await expect(page.locator('#guess-input-E1')).toHaveValue(String(scene.guesses.P0.E1));
    await expect(page.locator('.reveal, .reveal-sum, .reveal-code')).toHaveCount(0);
    await page.locator('#guess-input-E2').fill(String(scene.guesses.P0.E2));
    await expect(page.locator('#guess-input-E2')).toHaveValue(String(scene.guesses.P0.E2));
    await expect(page.locator('.reveal, .reveal-sum, .reveal-code')).toHaveCount(0);
    await testInfo.attach('before-final-submission', { body: await page.screenshot(), contentType: 'image/png' });

    // The final submission: the AI seats have already submitted when the human guess step is shown.
    await page.locator('#guess-submit').click();
    await expect(page.locator('.reveal')).toBeVisible({ timeout: 60_000 });
    expect(await currentStep(page)).toBe('REVEAL');

    // (c) One reveal screen with both codes, their cards and their correct sums.
    const codes = await page.locator('.reveal-code').evaluateAll((els) =>
      els.map((el) => ({
        key: el.getAttribute('data-quad-key'),
        sum: Number((el.querySelector('.reveal-sum')?.textContent ?? '').match(/(\d+)/)?.[1]),
      })),
    );
    expect(codes).toEqual(scene.quadKeys.map((key) => ({ key, sum: scene.hiddenSums[key] })));
    for (const key of scene.quadKeys) {
      await expect(page.locator(`.board-code-junction--open[data-quad-key="${key}"]`)).toBeVisible();
      const faces = page.locator(`.reveal-card-detail[data-quad-key="${key}"] .reveal-card`);
      for (const [slot, corner] of ['br', 'bl', 'tr', 'tl'].entries()) {
        if (hasLocalDeck) {
          const artwork = faces.nth(slot).locator('img.card-face__art');
          await expect(artwork).toBeVisible();
          await expect.poll(() => artwork.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        } else {
          await expect(faces.nth(slot).locator(`.card-face__fragment--${corner}`)).toBeVisible();
        }
      }
    }
    await expect(page.locator('#reveal-continue')).toBeInViewport();
    await expect(page.locator('.reveal-code').last()).toBeInViewport({ ratio: 1 });
    const originalSize = page.viewportSize()!;
    await page.setViewportSize({ width: 1024, height: 576 });
    for (const gain of await page.locator('.reveal-earned').all()) await expect(gain).toBeInViewport({ ratio: 1 });
    await page.setViewportSize(originalSize);
    const revealImage = testInfo.outputPath('reveal.png');
    await page.screenshot({ path: revealImage });
    await testInfo.attach('reveal', { path: revealImage, contentType: 'image/png' });

    // (d) Each seat's earned and total points, from the expected values derived above (not from the screen).
    const expected = Object.fromEntries(
      SEATS_8_6.map((seat) => {
        const earned = scene.quadKeys.reduce((sum, key) => sum + rewardFor8_6(scene.guesses[seat]![key]!, scene.hiddenSums[key]!), 0);
        return [seat, { earned, total: scene.cumulativeBefore[seat]! + earned }];
      }),
    );
    // Rows are identified by their seat identifier (`tr[data-seat]`, set by the reveal screen), not by position.
    const rows = await page.locator('.reveal-points tbody tr').evaluateAll((trs) =>
      Object.fromEntries(
        trs.map((tr) => [
          tr.getAttribute('data-seat'),
          {
            earned: Number(tr.querySelector('.reveal-earned')?.textContent),
            total: Number(tr.querySelector('.reveal-total')?.textContent),
          },
        ]),
      ),
    );
    expect(Object.keys(rows).sort(), 'one points row per seat').toEqual([...SEATS_8_6].sort());
    for (const seat of SEATS_8_6) {
      expect(rows[seat], `points row of ${seat}`).toEqual(expected[seat]);
    }
    // An exact guess and a near miss earn 15 in this batch, in addition to 5 from C2.
    expect(rows.P0, 'P0 earned and total from both codes').toEqual({ earned: 15, total: 20 });

    // (e) The reveal shows no individual guess and no guess tied to a seat or a code. Public sums and points may
    // equal a submitted guess; only the structure is checked here.
    await expect(page.locator('.reveal input')).toHaveCount(0);
    await expect(page.locator('.reveal [class*="guess"]')).toHaveCount(0);
    expect(await page.locator('.reveal').innerHTML()).not.toMatch(/guess/i);
  });
});