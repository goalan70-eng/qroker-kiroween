import type { Page } from '@playwright/test';
import { boardLabels, currentStep, expect, handLabels, scoreboard, seedLine, startGame } from './game';
import type { StartOptions } from './game';

// Additive helpers of e2e/persistence.spec.ts (task 20.4 stage C). They use the public DOM and `localStorage` only.

/** The two storage keys of src/game/persistence/storage.ts (written here as literals so the e2e run imports no game code). */
export const SAVE_KEY = 'qroker.practice.save';
export const PREFS_KEY = 'qroker.practice.prefs';

export const readStored = (page: Page, key: string): Promise<string | null> => page.evaluate((k) => window.localStorage.getItem(k), key);

export const writeStored = (page: Page, key: string, value: string): Promise<void> =>
  page.evaluate(([k, v]) => window.localStorage.setItem(k as string, v as string), [key, value]);

/** Everything of the running game that a reload and Continue must reproduce at a stable human turn. */
export interface Snapshot {
  readonly board: string[];
  readonly hand: string[];
  readonly seed: string;
  readonly turn: string;
  readonly live: string;
  readonly scores: Record<string, { score: number; hand: number }>;
}

export async function snapshot(page: Page): Promise<Snapshot> {
  return {
    board: await boardLabels(page),
    hand: await handLabels(page),
    seed: await seedLine(page),
    turn: (await page.locator('.scoreboard-row.is-active .scoreboard-name').first().textContent()) ?? '',
    live: (await page.locator('.game-live').textContent()) ?? '',
    scores: await scoreboard(page),
  };
}

/** Number of occupied (public) Board cells, read from the labels so it does not depend on a class name. */
export const occupied = (page: Page): Promise<number> => page.locator('.board-cell--occupied').count();

/** Real reload; waits for the resume prompt (a save exists). */
export async function reloadToPrompt(page: Page): Promise<void> {
  await page.reload();
  await expect(page.locator('.resume')).toBeVisible();
}

/** Starts a game with per-seat AI tiers and an optional language, from the setup screen of the current page (no `goto`). */
export async function configureAndStart(
  page: Page,
  options: { humans: 1 | 2 | 3 | 4; tiers?: readonly ('BEGINNER' | 'ADVANCED')[]; language?: 'en' | 'ko'; seedText?: string },
): Promise<void> {
  await expect(page.locator('#setup-start')).toBeVisible();
  if (options.language !== undefined) await page.locator('#setup-language').selectOption(options.language);
  await page.locator(`#setup-humans-${options.humans}`).check();
  const selects = await page.locator('.setup-ai-row select').all();
  for (let i = 0; i < selects.length; i++) await selects[i]!.selectOption(options.tiers?.[i] ?? 'BEGINNER');
  if (options.seedText !== undefined) await page.locator('#setup-seed').fill(options.seedText);
  await page.locator('#setup-start').click();
  await expect(page.locator('.game-seed, #privacy-gate-ack, .placement-board').first()).toBeAttached();
}

/** `startGame` for tests that start from a clean storage: clears it first, then goes to `/`. */
export async function startFresh(page: Page, options: StartOptions = {}): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await startGame(page, options);
}

/** Types `value` in every Guess input and presses submit. */
export async function submitGuessValue(page: Page, value: number): Promise<void> {
  const inputs = page.locator('.guess-input');
  const count = await inputs.count();
  for (let i = 0; i < count; i++) await inputs.nth(i).fill(String(value));
  await page.locator('#guess-submit').click();
}

/** Waits for a stable human PLACE turn (a Hand card is enabled) and returns its snapshot. */
export async function atHumanTurn(page: Page): Promise<Snapshot> {
  expect(await currentStep(page)).toBe('PLACE');
  return snapshot(page);
}

/** The DOM without elements that legitimately show public numbers (scores, sums, deck, Seed, ranges), as markup. */
export function domWithoutPublicNumbers(page: Page): Promise<string> {
  return page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    const strip =
      '.reveal-sum, .reveal-earned, .reveal-total, .reveal-final, .scoreboard-score, .scoreboard-hand, .scoreboard-deck, .game-seed, .guess-intro, .guess-label, .guess-region, .guess-error';
    clone.querySelectorAll(strip).forEach((el) => el.remove());
    return clone.outerHTML;
  });
}

/** Every `input` / `textarea` value of the page. */
export const inputValues = (page: Page): Promise<string[]> =>
  page.evaluate(() => [...document.querySelectorAll('input, textarea')].map((el) => (el as HTMLInputElement).value));

export const hasNumber = (markup: string, n: number | string): boolean => new RegExp(`(?<![0-9])${n}(?![0-9])`).test(markup);

/** The purpose of the pending gate, from its modifier class. */
export const gatePurpose = async (page: Page): Promise<'GUESS' | 'HAND'> =>
  ((await page.locator('.privacy-gate').getAttribute('class')) ?? '').includes('--guess') ? 'GUESS' : 'HAND';

/** Public name in the gate message, e.g. `Player 2`. */
export const gateName = async (page: Page): Promise<string> =>
  (((await page.locator('#privacy-gate-message').textContent()) ?? '').match(/Player \d/) ?? ['?'])[0]!;
