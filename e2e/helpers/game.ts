import { expect, test as base, type Locator, type Page } from '@playwright/test';

// Shared helpers of e2e/game.spec.ts. They drive the PRODUCTION page `/` through its public DOM only
// (selectors and aria hooks of src/game/ui); no test hook exists in production code.

/** Seeds used by the scenarios. They are decimal text, so `parseSeed` maps them to the same number. */
export const SEED_A = 20240601;
export const SEED_B = 777001;

/** One selector that matches whichever control the person must use next (or the final ranking). */
// While an AI Seat acts the panel stays on screen with a disabled Hand, so only an ENABLED Hand card means PLACE.
const ACTIONABLE = '.end-ranking, #privacy-gate-ack, .guess-input, #reveal-continue, .hand-card:not(.is-disabled)';

export type StepKind = 'END' | 'GATE' | 'GUESS' | 'REVEAL' | 'PLACE';

let browserPrinted = false;

/**
 * `test` with two automatic checks for every test: `pageerror` and console `error` messages are collected and asserted
 * empty at the end, and the browser name and version are attached to the report (printed once per run).
 */
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page, browser }, use, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
      });
      const description = `${browser.browserType().name()} ${browser.version()}`;
      testInfo.annotations.push({ type: 'browser', description });
      await testInfo.attach('browser', { body: description, contentType: 'text/plain' });
      if (!browserPrinted) {
        browserPrinted = true;
        console.log(`[e2e] browser: ${description}`);
      }
      await use(errors);
      expect(errors, 'no pageerror and no console error').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Stubs `crypto.getRandomValues` BEFORE the page scripts run: a `Uint32Array(1)` call takes the next value of `seeds`
 * (when the queue is empty, and for every other call, the original function runs). This is the only seed control.
 */
export async function stubSeeds(page: Page, seeds: readonly number[]): Promise<void> {
  await page.addInitScript((queue: number[]) => {
    const original = crypto.getRandomValues.bind(crypto);
    const pending = [...queue];
    crypto.getRandomValues = ((array: ArrayBufferView) => {
      if (array instanceof Uint32Array && array.length === 1 && pending.length > 0) {
        array[0] = pending.shift() as number;
        return array;
      }
      return original(array as never);
    }) as typeof crypto.getRandomValues;
  }, [...seeds]);
}

export interface StartOptions {
  readonly language?: 'en' | 'ko';
  readonly humans?: 1 | 2 | 3 | 4;
  /** Seed text typed into the setup field; omit to keep the stubbed random default. */
  readonly seedText?: string;
}

/** Opens `/`, sets the options (every AI Seat BEGINNER, explicitly) and presses Start. */
export async function startGame(page: Page, options: StartOptions = {}): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#setup-start')).toBeVisible();
  if (options.language) await page.locator('#setup-language').selectOption(options.language);
  const humans = options.humans ?? 1;
  await page.locator(`#setup-humans-${humans}`).check();
  for (const select of await page.locator('.setup-ai-row select').all()) await select.selectOption('BEGINNER');
  if (options.seedText !== undefined) await page.locator('#setup-seed').fill(options.seedText);
  await page.locator('#setup-start').click();
  await expect(page.locator('.game-seed, #privacy-gate-ack, .placement-board').first()).toBeAttached();
}

export const handLabels = (page: Page): Promise<string[]> =>
  page.locator('.hand-card .card-face').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));

/** The card names of the Hand without the owner and orientation parts, e.g. "7 of Hearts". */
export const handCardNames = async (page: Page): Promise<string[]> =>
  (await handLabels(page)).map((label) => label.split(',')[0] ?? label);

export const boardLabels = (page: Page): Promise<string[]> =>
  page.locator('.board-cell').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));

export const seedLine = async (page: Page): Promise<string> => (await page.locator('.game-seed').textContent()) ?? '';

export const occupiedCount = (page: Page): Promise<number> => page.locator('.board-cell--occupied').count();

/** Public numbers of the scoreboard: `{ P0: { score, hand }, ... }`. */
export const scoreboard = (page: Page): Promise<Record<string, { score: number; hand: number }>> =>
  page.locator('.scoreboard-row').evaluateAll((rows) =>
    Object.fromEntries(
      rows.map((row) => [
        row.getAttribute('data-seat') ?? '?',
        {
          score: Number(row.querySelector('.scoreboard-score')?.textContent),
          hand: Number(row.querySelector('.scoreboard-hand')?.textContent),
        },
      ]),
    ),
  );

/** Exactly one banner on the page, none inside the child screens. */
export async function expectOneBanner(page: Page): Promise<void> {
  await expect(page.locator('.banner')).toHaveCount(1);
  await expect(page.locator('.scoreboard-banner, .reveal-banner, .end-banner')).toHaveCount(0);
}

/** Waits until a control asks for the person (bounded by the test timeout) and says which one. */
export async function currentStep(page: Page, timeout = 30_000): Promise<StepKind> {
  await page.locator(ACTIONABLE).first().waitFor({ state: 'attached', timeout });
  return page.evaluate((): StepKind => {
    const has = (selector: string): boolean => document.querySelector(selector) !== null;
    if (has('.end-ranking')) return 'END';
    if (has('#privacy-gate-ack')) return 'GATE';
    if (has('.guess-input')) return 'GUESS';
    if (has('#reveal-continue')) return 'REVEAL';
    return 'PLACE';
  });
}

/** Selects the first Hand card, clicks the first legal cell and presses Confirm (rotation only if the control exists). */
export async function playHumanTurn(page: Page): Promise<void> {
  await page.locator('.hand-card:not(.is-disabled)').first().click();
  await page.locator('.board-cell.is-legal').first().click();
  const confirm = page.locator('.placement-button--confirm');
  const rotate = page.locator('.placement-button--rotate');
  if ((await confirm.isDisabled()) && (await rotate.count()) > 0) await rotate.click();
  await expect(confirm, `confirm is enabled; error line: "${await page.locator('.placement-error').textContent()}"`).toBeEnabled();
  await confirm.click();
}

/** Types a valid number in every Guess input (`base`, `base + 1`, ...) and presses submit. */
export async function submitGuesses(page: Page, base = 20): Promise<number[]> {
  const inputs = page.locator('.guess-input');
  const count = await inputs.count();
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    values.push(base + i);
    await inputs.nth(i).fill(String(base + i));
  }
  await page.locator('#guess-submit').click();
  return values;
}

export async function acknowledgeReveal(page: Page): Promise<void> {
  await page.locator('#reveal-continue').click();
}

export interface PlayHooks {
  /** Called with the step kind BEFORE the step is performed. */
  readonly before?: (kind: StepKind, index: number) => Promise<void>;
  /** Stop (without acting) when this returns true for the pending step. */
  readonly stopAt?: (kind: StepKind) => boolean | Promise<boolean>;
  readonly guessBase?: number;
  readonly maxSteps?: number;
}

/**
 * Plays steps until the final ranking (or `stopAt`). Returns the kind it stopped at and the steps taken. A step limit
 * and a failure message guard against an endless loop.
 */
export async function playUntil(page: Page, hooks: PlayHooks = {}): Promise<{ stoppedAt: StepKind; steps: number }> {
  const limit = hooks.maxSteps ?? 400;
  for (let i = 0; i < limit; i++) {
    const kind = await currentStep(page);
    await hooks.before?.(kind, i);
    if (kind === 'END' || (await hooks.stopAt?.(kind)) === true) return { stoppedAt: kind, steps: i };
    if (kind === 'GATE') await page.locator('#privacy-gate-ack').click();
    else if (kind === 'GUESS') await submitGuesses(page, hooks.guessBase);
    else if (kind === 'REVEAL') await acknowledgeReveal(page);
    else await playHumanTurn(page);
  }
  throw new Error(`playUntil: no end or stop condition after ${limit} steps (url ${page.url()}, seed "${await seedLine(page).catch(() => '?')}")`);
}

/** Text of the `<html>` element's DOM as one string: markup, every attribute value, aria-labels and hidden nodes. */
export const domDump = (page: Page): Promise<string> => page.evaluate(() => document.documentElement.outerHTML);

/** Every control that must be at least 44 CSS px in both directions (Board cells are exempt, see layout.css). */
export const TOUCH_TARGETS =
  '.game-bar__button:not([hidden]), .placement-button, .hand-card, #setup-start, #setup-random-seed, .guess-submit, .reveal-continue, .end-button, .privacy-gate-ack, .help-close, .abandon-cancel, .abandon-confirm__danger';

/** Asserts that no visible control of the page is smaller than 44x44 px. */
export async function expectTouchTargets(page: Page): Promise<void> {
  const small = await page.locator(TOUCH_TARGETS).evaluateAll((els) =>
    els
      .map((el) => ({ id: el.id || el.className, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0 && (rect.width < 43.5 || rect.height < 43.5))
      .map(({ id, rect }) => `${id} ${Math.round(rect.width)}x${Math.round(rect.height)}`),
  );
  expect(small, 'controls smaller than 44 px').toEqual([]);
}

/** Document-level horizontal overflow in px (0 means none). */
export const horizontalOverflow = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** True when the box lies inside the viewport (the page is NOT scrolled by this check). */
export async function insideViewport(page: Page, locator: Locator): Promise<boolean> {
  const box = await locator.boundingBox();
  const size = page.viewportSize();
  if (box === null || size === null) return false;
  return box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width && box.y + box.height <= size.height;
}
