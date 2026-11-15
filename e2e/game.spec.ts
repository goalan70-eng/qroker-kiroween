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
    await expect(page.locator('.hand-card')).toHaveCount(4);

    // --- A. rotation control exists exactly for clubs and spades (read from the owner's own card faces) ---
    const glyphs = await page.locator('.hand-card .card-face__suit').allTextContents();
    expect(glyphs).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      await page.locator('.hand-card').nth(i).click();
      await expect(page.locator('.hand-card').nth(i)).toHaveAttribute('aria-pressed', 'true');
      const expected = glyphs[i] === '♣' || glyphs[i] === '♠' ? 1 : 0;
      await expect(page.locator('.placement-button--rotate'), `rotation for ${glyphs[i]}`).toHaveCount(expected);
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
    expect(afterFirst.scores[me]!.hand).toBe(idle.scores[me]!.hand - 1); // the first placement never draws
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
    expect(hand).toHaveLength(4);
    await playUntil(page);
    const ranking = await page.locator('.end-ranking').innerText();

    await page.locator('#end-replay').click();
    await expect(page.locator('.hand-card')).toHaveCount(4);
    expect(await seedLine(page)).toBe(seed);
    expect(await handLabels(page)).toEqual(hand);
    expect(await boardLabels(page)).toEqual(board);
    await playUntil(page);
    expect(await page.locator('.end-ranking').innerText(), 'the same seed and the same moves give the same result').toBe(ranking);

    await page.locator('#end-rematch').click();
    await expect(page.locator('.hand-card')).toHaveCount(4);
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

  test('Help and Abandon in a running game', async ({ page }) => {
    test.setTimeout(LONG_TEST);
    await stubSeeds(page, [SEED_A]);
    await startGame(page);
    await expect(page.locator('.hand-card')).toHaveCount(4);
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
      await expect(page.locator('.hand-card')).toHaveCount(4);
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
