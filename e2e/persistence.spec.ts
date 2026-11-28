import type { Page } from '@playwright/test';
import { score, DEV_PLACEHOLDER_SCORE_CONFIG } from '../src/game/core/score';
import { en, ko } from '../src/game/i18n/strings/persistence';
import {
  SEED_A,
  SEED_B,
  acknowledgeReveal,
  currentStep,
  domDump,
  expect,
  handCardNames,
  playHumanTurn,
  playUntil,
  scoreboard,
  seedLine,
  stubSeeds,
  test,
} from './helpers/game';
import {
  PREFS_KEY,
  SAVE_KEY,
  atHumanTurn,
  configureAndStart,
  domWithoutPublicNumbers,
  gateName,
  gatePurpose,
  hasNumber,
  inputValues,
  occupied,
  readStored,
  reloadToPrompt,
  snapshot,
  startFresh,
  submitGuessValue,
  writeStored,
} from './helpers/persistence';

// Real-browser verification of task 20.4 persistence on the PRODUCTION page `/` (design.md "Task 20.4 persistence
// integration contracts" h, scenarios A-F; G is the whole suite). Evidence class 2/3: real Chromium, emulated viewport,
// real `localStorage` and real `page.reload()` in ONE browser context. Not a real device, not other browsers.

const LONG_TEST = 5 * 60_000;
const NOT_SAVED_CLAIM = /Progress is saved automatically|진행 상황이 이 브라우저에 자동으로 저장/;
/** One-human seeds tried in order until a Composite Code forms (game.spec scenario 4). */
const CODE_SEEDS = ['20240601', '31337', '4242', '99'];

const statusLine = (page: Page) => page.locator('.notice-status');
const notice = (page: Page, kind: string) => page.locator(`.notices [data-notice="${kind}"]`);
const bodyText = (page: Page): Promise<string> => page.evaluate(() => document.body.innerText);

test.describe('setup language preference', () => {
  test.use({ locale: 'ko-KR' });

  test('starts in English on a Korean browser and restores the chosen language after reload', async ({ page }) => {
    await page.goto('/');
    const language = page.locator('#shell-language');
    await expect(language).toHaveValue('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await language.selectOption('ko');
    await page.reload();
    await expect(language).toHaveValue('ko');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  });
});

/** Plays `n` human placements (each followed by the AI turns up to the next human turn). */
async function placeCards(page: Page, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    expect((await playUntil(page, { stopAt: kind => kind === 'PLACE' })).stoppedAt).toBe('PLACE');
    await playHumanTurn(page);
  }
  expect((await playUntil(page, { stopAt: kind => kind === 'PLACE' })).stoppedAt).toBe('PLACE');
}

// ---------------------------------------------------------------------------------------------------------------
// A
// ---------------------------------------------------------------------------------------------------------------

test.describe('A reload during placement', () => {
  test('Continue restores Board, Hand, turn and Seed; the prompt shows none of them; the game goes on', async ({ page }) => {
    test.setTimeout(LONG_TEST);
    await stubSeeds(page, [SEED_A]);
    await startFresh(page);
    const initialCells = await occupied(page); // the Board starts with the dealt starting cards
    // A durable save is available without a persistent footer on the table.
    await expect(statusLine(page)).toBeHidden();
    expect(await readStored(page, SAVE_KEY)).not.toBeNull();
    await placeCards(page, 3);
    const before = await snapshot(page);
    expect(before.seed).toContain(String(SEED_A));
    expect(before.board.length).toBeGreaterThan(0);
    const occupiedBefore = await occupied(page);
    expect(occupiedBefore).toBe(initialCells + 12); // 3 rounds of one human and three AI placements
    const handNames = await handCardNames(page);
    expect(handNames.length).toBeGreaterThanOrEqual(3); // a placement that completes a code draws no card
    expect(await readStored(page, SAVE_KEY)).not.toBeNull();

    await reloadToPrompt(page);
    // The prompt shows no Board, Hand, Guess or Seed of the game.
    await expect(page.locator('#resume-continue')).toBeFocused();
    await expect(page.locator('.resume-humans')).toHaveText('Human players: 1');
    await expect(page.locator('.resume-saved-at')).toContainText('Saved: ');
    expect(await page.locator('.board-cell, .hand-card, .guess-input, .scoreboard, .placement-board, #setup-start').count()).toBe(0);
    expect(await page.locator('.game-seed').textContent()).toBe('');
    await expect(page.locator('#game-help-open')).toBeHidden();
    await expect(page.locator('#game-abandon-open')).toBeHidden();
    await expect(statusLine(page)).toHaveCount(0); // nothing is "saved" before a game runs
    const dump = await domDump(page);
    expect(hasNumber(dump, SEED_A), 'no Seed digits on the prompt').toBe(false);
    for (const name of handNames) expect(dump, `prompt DOM must not contain "${name}"`).not.toContain(name);
    expect(dump).not.toMatch(/hidden sum|guess-input/i);

    await page.locator('#resume-continue').click();
    const after = await atHumanTurn(page);
    expect(after.board).toEqual(before.board);
    expect(after.hand).toEqual(before.hand);
    expect(after.seed).toBe(before.seed);
    expect(after.turn).toBe(before.turn);
    expect(after.live).toBe(before.live);
    expect(after.scores).toEqual(before.scores);
    expect(await occupied(page)).toBe(occupiedBefore);
    await expect(page.locator('.resume')).toHaveCount(0);

    // the game continues through at least one more human turn, with the same Seed
    await playHumanTurn(page);
    await expect(statusLine(page)).toBeHidden(); // the next accepted Action saved durably
    const next = await atHumanTurn(page);
    expect(await occupied(page)).toBe(occupiedBefore + 4);
    expect(next.seed).toBe(before.seed);
  });

  test('(i) Discard shows the setup, removes the save, a second reload has no prompt, language and setup prefs are kept', async ({ page }) => {
    test.setTimeout(LONG_TEST);
    await stubSeeds(page, [SEED_A]);
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await configureAndStart(page, { humans: 1, tiers: ['ADVANCED', 'BEGINNER', 'BEGINNER'], language: 'ko' });
    await playHumanTurn(page);
    await currentStep(page); // the AI Seats acted (an ADVANCED AI may already complete a code: any next step is fine)
    expect(await readStored(page, SAVE_KEY)).not.toBeNull();

    await reloadToPrompt(page);
    await expect(page.locator('#resume-continue')).toHaveText(ko['persistence.resume.continue']);
    const beforeCancel = await readStored(page, SAVE_KEY);
    await page.locator('#resume-discard').click();
    await expect(page.locator('#resume-cancel')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#resume-discard')).toBeFocused();
    expect(await readStored(page, SAVE_KEY)).toBe(beforeCancel);
    await page.locator('#resume-discard').click();
    await page.locator('#resume-confirm').click();
    await expect(page.locator('#setup-start')).toBeVisible();
    await expect(page.locator('.resume')).toHaveCount(0);
    expect(await readStored(page, SAVE_KEY)).toBeNull();
    expect(await readStored(page, PREFS_KEY)).not.toBeNull();

    await page.reload();
    await expect(page.locator('#setup-start')).toBeVisible();
    await expect(page.locator('.resume')).toHaveCount(0);
    expect(await readStored(page, SAVE_KEY)).toBeNull();
    await expect(page.locator('#shell-language')).toHaveValue('ko');
    await expect(page.locator('.setup-ai-row select').first()).toHaveValue('ADVANCED');
    await expect(page.locator('.setup-ai-row select').nth(1)).toHaveValue('BEGINNER');
    await expect(page.locator('.setup-ai-row select')).toHaveCount(3);
    await expect(page.locator('#setup-humans-1')).toBeChecked();
    await expect(statusLine(page)).toHaveCount(0);
  });

  test('(ii) reload right after Confirm (an AI Seat is acting): Continue resumes the AI turns and the game proceeds', async ({ page }) => {
    test.setTimeout(LONG_TEST);
    await stubSeeds(page, [SEED_A]);
    await startFresh(page);
    await placeCards(page, 2);
    const start = await occupied(page);
    await playHumanTurn(page); // accepted and saved; AI Seats act now (600 ms pacing)
    await expect(page.locator('.hand-card:not(.is-disabled)')).toHaveCount(0);
    const atReload = await occupied(page);
    expect(atReload).toBeGreaterThanOrEqual(start + 1);
    expect(atReload).toBeLessThan(start + 4); // at least one AI placement is still to come
    await reloadToPrompt(page);
    await page.locator('#resume-continue').click();
    await expect(page.locator('.board-cell--occupied').first()).toBeAttached();
    expect(await occupied(page)).toBeGreaterThanOrEqual(atReload);
    expect(await currentStep(page)).toBe('PLACE'); // the AI Seats finished their turns after the resume
    expect(await occupied(page), 'human + three AI placements after the round').toBe(start + 4);
    expect(await seedLine(page)).toContain(String(SEED_A));
  });

  test('(iii) a NEW game started after Discard is what a later reload resumes, never the old one', async ({ page }) => {
    test.setTimeout(LONG_TEST);
    await stubSeeds(page, [SEED_A]);
    await startFresh(page);
    await placeCards(page, 2);
    const first = await snapshot(page);
    await reloadToPrompt(page);
    // No game can be started while the prompt is pending (it replaces the setup): Discard first, then a new Seed.
    await expect(page.locator('#setup-start')).toHaveCount(0);
    await page.locator('#resume-discard').click();
    await page.locator('#resume-confirm').click();
    await configureAndStart(page, { humans: 1, seedText: String(SEED_B) });
    expect(await seedLine(page)).toContain(String(SEED_B));
    await placeCards(page, 2);
    const second = await snapshot(page);
    expect(second.hand).not.toEqual(first.hand);

    await reloadToPrompt(page);
    await page.locator('#resume-continue').click();
    const resumed = await atHumanTurn(page);
    expect(resumed.seed).toContain(String(SEED_B));
    expect(resumed.seed).not.toContain(String(SEED_A));
    expect(resumed.hand).toEqual(second.hand);
    expect(resumed.board).toEqual(second.board);
    expect(resumed.hand).not.toEqual(first.hand);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// B
// ---------------------------------------------------------------------------------------------------------------

interface BResult {
  readonly seedText: string;
  readonly sums: number[];
}

/**
 * Two human Seats and two BEGINNER AI Seats. Plays to the first Guess form (over `seedTexts`), submits `first` for the first
 * human, reloads, continues, passes the Guess gate, submits `second` for the second human and checks the reveal against the
 * placeholder score table computed in Node.
 */
async function guessReloadRun(
  page: Page,
  seedTexts: readonly string[],
  first: (sums: null) => number,
  second: (sums: null) => number,
  options: { scanValues: boolean; nonZero?: boolean },
): Promise<BResult> {
  let seedText: string | null = null;
  for (const candidate of seedTexts) {
    await startFresh(page, { humans: 2, seedText: candidate });
    const { stoppedAt } = await playUntil(page, { stopAt: (kind) => kind === 'GUESS', maxSteps: 150 });
    if (stoppedAt === 'GUESS') {
      seedText = candidate;
      break;
    }
  }
  if (seedText === null) throw new Error(`no Composite Code formed with two humans in any of the seeds ${seedTexts.join(', ')}`);
  console.log(`[e2e] scenario B: code formed with seed ${seedText}`);
  const seed = await seedLine(page);
  const previous = await scoreboard(page);
  const v1 = first(null);
  const v2 = second(null);
  expect(v1).not.toBe(v2);

  await submitGuessValue(page, v1);
  await expect(page.locator('.guess-input')).toHaveCount(0);
  await expect(page.locator('#privacy-gate-ack')).toBeAttached(); // the second human is next
  expect(await gatePurpose(page)).toBe('GUESS');
  // The documented privacy limit: the save holds the unrevealed Guess.
  expect(await readStored(page, SAVE_KEY)).toContain('SUBMIT_GUESSES');

  await reloadToPrompt(page);
  await page.locator('#resume-continue').click();

  // The gate for the second human comes first and shows no Guess form and no typed value.
  await expect(page.locator('#privacy-gate-ack')).toBeVisible();
  expect(await gatePurpose(page)).toBe('GUESS');
  expect(await gateName(page)).toBe('Player 2');
  expect(await page.locator('.guess-input, .hand-card, .board-cell, .reveal, .reveal-sum').count()).toBe(0);
  const gateDom = await domDump(page);
  if (options.scanValues) expect(hasNumber(gateDom, v1), `gate DOM must not contain ${v1}`).toBe(false);
  expect(hasNumber(gateDom, seedText), 'gate DOM has no Seed digits').toBe(false);
  await page.locator('#privacy-gate-ack').click();

  // The first human's status is public and says submitted; no value of theirs is anywhere.
  await expect(page.locator('.guess-input').first()).toBeVisible();
  await expect(page.locator('.guess-seat').first()).toHaveText('Player 1: submitted');
  await expect(page.locator('.guess-seat').nth(1)).toHaveText('Player 2: waiting');
  expect((await inputValues(page)).filter((v) => v !== '')).toEqual([]);
  expect(await seedLine(page)).toBe(seed);
  expect(await bodyText(page)).not.toMatch(/Hidden sum/i);
  await expect(page.locator('.reveal, .reveal-sum')).toHaveCount(0);
  if (options.scanValues) {
    const markup = await domWithoutPublicNumbers(page);
    expect(hasNumber(markup, v1), `Guess DOM must not contain ${v1}`).toBe(false);
  }
  expect(await scoreboard(page)).toEqual(previous); // nothing was scored yet

  await submitGuessValue(page, v2);
  expect(await currentStep(page)).toBe('REVEAL');

  // Reveal: the displayed sums and the placeholder table give the expected earned points of both humans.
  const sums = (await page.locator('.reveal-sum').allTextContents()).map((text) => Number(/(\d+)$/.exec(text)?.[1]));
  expect(sums.length).toBeGreaterThan(0);
  for (const sum of sums) expect(Number.isInteger(sum)).toBe(true);
  const expectedFor = (guess: number): number => sums.reduce((acc, sum) => acc + score(guess, sum, DEV_PLACEHOLDER_SCORE_CONFIG.config), 0);
  const rows = await page.locator('.reveal-points tbody tr').evaluateAll((trs) =>
    Object.fromEntries(
      trs.map((tr) => [
        tr.getAttribute('data-seat') ?? '',
        { earned: Number(tr.querySelector('.reveal-earned')?.textContent), total: Number(tr.querySelector('.reveal-total')?.textContent) },
      ]),
    ),
  );
  expect(rows.P0!.earned, `P0 guessed ${v1} for sums ${sums.join(',')}`).toBe(expectedFor(v1));
  expect(rows.P1!.earned, `P1 guessed ${v2} for sums ${sums.join(',')}`).toBe(expectedFor(v2));
  for (const id of Object.keys(rows)) expect(previous[id]!.score + rows[id]!.earned, `${id}: previous + earned = cumulative`).toBe(rows[id]!.total);
  if (options.nonZero === true) {
    // calibrated values: a wrong or lost Guess could not give these points, so the check is not vacuous
    expect(expectedFor(v1)).toBeGreaterThan(0);
    expect(expectedFor(v2)).toBeGreaterThan(0);
  }
  // No Guess value and no Guess element in the reveal.
  expect(await page.locator('input, textarea, [class*="guess"], [id*="guess"], [data-guess]').count()).toBe(0);
  expect(await page.locator('.reveal').innerHTML()).not.toMatch(/guess/i);
  if (options.scanValues) {
    const markup = await domWithoutPublicNumbers(page);
    for (const value of [v1, v2]) expect(hasNumber(markup, value), `reveal DOM must not contain ${value}`).toBe(false);
  }
  await acknowledgeReveal(page);
  expect(await currentStep(page)).not.toBe('REVEAL');
  return { seedText, sums };
}

test.describe('B reload during Guess collection (two humans)', () => {
  test('Guesses 17 and 43: the first survives the reload, the reveal scores both as the table says', async ({ page }) => {
    test.setTimeout(LONG_TEST);
    await stubSeeds(page, [SEED_A]);
    await guessReloadRun(page, CODE_SEEDS, () => 17, () => 43, { scanValues: true });
  });

  test('calibrated Guesses (hidden sum and sum + 1 of the same deterministic game) score above zero after the reload', async ({ page }) => {
    test.setTimeout(LONG_TEST);
    await stubSeeds(page, [SEED_A]);
    // Pass 1 learns the Hidden_Sum of this Seed (deterministic: same Seed, same moves); pass 2 replays it with Guesses near it.
    const probe = await guessReloadRun(page, CODE_SEEDS, () => 17, () => 43, { scanValues: false });
    const near = Math.min(probe.sums[0]!, 51);
    await guessReloadRun(page, [probe.seedText], () => near, () => near + 1, { scanValues: false, nonZero: true });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// C
// ---------------------------------------------------------------------------------------------------------------

/**
 * Plays `turns` human placements of a game with `humans` human Seats, remembering every Hand by the public name of its
 * Seat, stops at the next human PLACE step (without acting) and returns what is needed to compare after a reload.
 */
async function playToSeatTurn(page: Page, humans: 2 | 4, turns: number, seedText: string) {
  await startFresh(page, { humans, seedText });
  const hands = new Map<string, string[]>();
  let name = 'Player 1';
  let played = 0;
  for (let i = 0; i < 100; i++) {
    const kind = await currentStep(page);
    if (kind === 'GATE') {
      name = await gateName(page);
      await page.locator('#privacy-gate-ack').click();
    } else if (kind === 'PLACE') {
      hands.set(name, await handCardNames(page));
      if (played === turns) return { hands, seatName: name, seed: await seedLine(page) };
      await playHumanTurn(page);
      played++;
    } else throw new Error(`unexpected step ${kind} before the target turn`);
  }
  throw new Error('target turn not reached');
}

for (const spec of [
  { humans: 2 as const, turns: 0, label: '2 humans, at the start (Player 1)' },
  { humans: 2 as const, turns: 1, label: '2 humans, at the placement turn of Player 2' },
  { humans: 4 as const, turns: 0, label: '4 humans, at the start (Player 1)' },
  { humans: 4 as const, turns: 2, label: '4 humans, at the placement turn of Player 3' },
]) {
  test.describe('C multi-human gate after resume', () => {
    test(spec.label, async ({ page }) => {
      test.setTimeout(LONG_TEST);
      await stubSeeds(page, [SEED_A]);
      const { hands, seatName, seed } = await playToSeatTurn(page, spec.humans, spec.turns, String(SEED_A));
      const own = hands.get(seatName)!;
      expect(own).toHaveLength(3);
      const allNames = [...hands.values()].flat();
      const others = [...hands.entries()].filter(([name]) => name !== seatName);
      if (spec.turns > 0) expect(others.length).toBeGreaterThan(0);

      await reloadToPrompt(page);
      await page.locator('#resume-continue').click();

      // Before the acknowledgement: only the next player's public name and the gate controls.
      await expect(page.locator('#privacy-gate-ack')).toBeVisible();
      expect(await gateName(page)).toBe(seatName);
      expect(await gatePurpose(page)).toBe('HAND');
      expect(await page.locator('.hand-card, .card-face, .board-cell, .guess-input, input, textarea, .scoreboard, .placement-board').count()).toBe(0);
      const gateDom = await domDump(page);
      for (const name of allNames) expect(gateDom, `gate DOM must not contain "${name}"`).not.toContain(name);
      expect(hasNumber(gateDom, SEED_A), 'gate DOM has no Seed digits').toBe(false);
      expect(gateDom).not.toContain('guess-input');
      expect(gateDom).not.toMatch(/\bP[0-3]\b/);
      expect((await page.locator('.game-seed').textContent()) ?? '').toBe('');
      const otherName = spec.turns === 0 ? 'Player 2' : 'Player 1';
      expect(((await page.locator('#privacy-gate-message').textContent()) ?? '').includes(otherName)).toBe(false);
      await expect(page.locator('#game-help-open')).toBeHidden();
      await expect(page.locator('#game-abandon-open')).toBeHidden();
      await expect(page.locator('#privacy-gate-ack')).toBeFocused();

      // Acknowledge: the correct seat's view, with exactly that seat's pre-reload Hand.
      const ack = await page.locator('#privacy-gate-ack').elementHandle();
      await page.locator('#privacy-gate-ack').click();
      await expect(page.locator('.hand-card').first()).toBeVisible();
      expect(await handCardNames(page)).toEqual(own);
      for (const [, other] of others) expect(await handCardNames(page)).not.toEqual(other);
      for (const [, other] of others) for (const card of other) expect(own).not.toContain(card);
      expect(await seedLine(page)).toBe(seed);
      // A second acknowledge does nothing.
      await ack!.evaluate((el) => (el as HTMLElement).click());
      await expect(page.locator('#privacy-gate-ack')).toHaveCount(0);
      expect(await currentStep(page)).toBe('PLACE');
      expect(await handCardNames(page)).toEqual(own);
      // The game goes on.
      await playHumanTurn(page);
      expect(await currentStep(page)).toBe('GATE');
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------
// D
// ---------------------------------------------------------------------------------------------------------------

const MARKER = 'BROKEN_MARKER_9f3a1c';

interface Variant {
  readonly name: string;
  readonly reason: 'CORRUPT' | 'SAVE_VERSION' | 'RULES_VERSION' | 'REPLAY_REJECTED';
  readonly text: string;
  /** Strings from the stored text that must never reach the page. */
  readonly fragments: readonly string[];
}

test.describe('D corrupt storage', () => {
  let real = '';
  let variants: Variant[] = [];

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    // A real save text produced by the app (one human, three AI, a few accepted Actions).
    const context = await browser.newContext();
    const page = await context.newPage();
    await stubSeeds(page, [SEED_A]);
    await startFresh(page);
    await placeCards(page, 1);
    real = (await readStored(page, SAVE_KEY)) ?? '';
    await context.close();
    expect(real).toContain('qroker-save');
    const parsed = JSON.parse(real) as { savedAtIso: string; actions: { card: string }[]; [key: string]: unknown };
    expect(parsed.actions.length).toBeGreaterThanOrEqual(2);
    const common = ['qroker-save', String(SEED_A), parsed.savedAtIso, '"actions"'];
    const mutate = (change: (copy: typeof parsed) => void): string => {
      const copy = JSON.parse(real) as typeof parsed;
      change(copy);
      return JSON.stringify(copy);
    };
    variants = [
      { name: 'broken JSON', reason: 'CORRUPT', text: `{"format":"qroker-save","saveVersion":1,${MARKER}`, fragments: [MARKER, 'qroker-save'] },
      { name: 'truncated valid JSON', reason: 'CORRUPT', text: real.slice(0, Math.floor(real.length / 2)), fragments: common },
      { name: 'future saveVersion', reason: 'SAVE_VERSION', text: mutate((c) => { c.saveVersion = 99; }), fragments: common },
      { name: 'wrong rulesVersion', reason: 'RULES_VERSION', text: mutate((c) => { c.rulesVersion = 99; }), fragments: common },
      {
        name: 'engine-invalid log (illegal card)',
        reason: 'REPLAY_REJECTED',
        text: mutate((c) => { c.actions[0]!.card = c.actions[1]!.card; }),
        fragments: common,
      },
    ];
  });

  for (const lang of ['en', 'ko'] as const) {
    for (const index of [0, 1, 2, 3, 4]) {
      test(`${lang}: variant ${index}`, async ({ page }) => {
        const variant = variants[index]!;
        const texts = lang === 'en' ? en : ko;
        await stubSeeds(page, [4242424]);
        await page.goto('/');
        const prefs = JSON.stringify({
          prefsVersion: 1,
          language: lang,
          setup: { humanCount: 2, difficulties: ['BEGINNER', 'BEGINNER', 'ADVANCED', 'BEGINNER'], identityVisibility: 'OWNER_ONLY' },
        });
        await writeStored(page, PREFS_KEY, prefs);
        await writeStored(page, SAVE_KEY, variant.text);
        await page.reload();

        // localized notice, setup screen, no Continue, no crash
        const discarded = notice(page, 'SAVE_DISCARDED');
        await expect(discarded, variant.name).toBeVisible();
        await expect(discarded.locator('.notice-text')).toHaveText(texts[`persistence.notice.SAVE_DISCARDED.${variant.reason}`]);
        await expect(page.locator('.notices')).toHaveAttribute('aria-label', texts['persistence.notices.label']);
        await expect(page.locator('#setup-start')).toBeVisible();
        await expect(page.locator('.resume')).toHaveCount(0);
        // the bad save is removed, the prefs are kept and applied
        expect(await readStored(page, SAVE_KEY)).toBeNull();
        expect(await readStored(page, PREFS_KEY)).toBe(prefs);
        await expect(page.locator('#shell-language')).toHaveValue(lang);
        await expect(page.locator('#setup-humans-2')).toBeChecked();
        await expect(page.locator('.setup-ai-row select').first()).toHaveValue('ADVANCED');
        // no fragment of the stored text reaches the page
        const html = await domDump(page);
        const visible = await bodyText(page);
        for (const fragment of variant.fragments) {
          expect(html, `HTML must not contain "${fragment}"`).not.toContain(fragment);
          expect(visible, `text must not contain "${fragment}"`).not.toContain(fragment);
        }
        expect(await page.locator('.notices').evaluate((el) => el.textContent)).not.toContain('REPLAY_REJECTED');
        expect(await page.locator('.notices').evaluate((el) => el.textContent)).not.toMatch(/_/);

        // dismiss: the item goes, the focus moves to the notices region (not the body), the live region stays
        await discarded.locator('.notice-dismiss').focus();
        await expect(discarded.locator('.notice-dismiss')).toBeFocused();
        await discarded.locator('.notice-dismiss').click();
        await expect(notice(page, 'SAVE_DISCARDED')).toHaveCount(0);
        await expect(page.locator('.notices')).toBeFocused();
        await expect(page.locator('.notices')).toHaveAttribute('aria-live', 'polite');
        await expect(page.locator('.notices')).toHaveAttribute('aria-label', texts['persistence.notices.label']);
        expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
        // the prefs are still intact after the dismissal and a second reload shows no notice
        await page.reload();
        await expect(page.locator('#setup-start')).toBeVisible();
        await expect(notice(page, 'SAVE_DISCARDED')).toHaveCount(0);
        expect(await readStored(page, PREFS_KEY)).toBe(prefs);
      });
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------
// E
// ---------------------------------------------------------------------------------------------------------------

/** Plays one human turn, an AI round and a complete Guess (first seed of CODE_SEEDS that forms a code); `check` runs at each step. */
async function playWithCheck(page: Page, check: () => Promise<void>): Promise<void> {
  for (const seedText of CODE_SEEDS) {
    await page.goto('/');
    await expect(page.locator('#setup-start')).toBeVisible();
    await page.locator('#setup-humans-1').check();
    for (const select of await page.locator('.setup-ai-row select').all()) await select.selectOption('BEGINNER');
    await page.locator('#setup-seed').fill(seedText);
    await page.locator('#setup-start').click();
    await expect(page.locator('.placement-board')).toBeVisible();
    await check();
    const { stoppedAt } = await playUntil(page, {
      stopAt: (kind) => kind === 'GUESS',
      maxSteps: 120,
      before: async () => check(),
    });
    if (stoppedAt !== 'GUESS') continue;
    await submitGuessValue(page, 20);
    expect(await currentStep(page)).toBe('REVEAL');
    await check();
    await acknowledgeReveal(page);
    return;
  }
  throw new Error(`no Composite Code formed in any of the seeds ${CODE_SEEDS.join(', ')}`);
}

test.describe('E storage unavailable', () => {
  const expectNotDurableUi = async (page: Page): Promise<void> => {
    await expect(notice(page, 'STORAGE_NOT_DURABLE')).toBeVisible();
    await expect(statusLine(page)).toHaveCount(0);
    expect(await bodyText(page)).not.toMatch(NOT_SAVED_CLAIM);
    await expect(notice(page, 'STORAGE_WRITE_FAILED')).toHaveCount(0);
  };

  for (const locking of ['Web Locks', 'IndexedDB'] as const) {
    test(`simultaneous starts preserve one save and warn the other tab using ${locking}`, async ({ page, context }) => {
      if (locking === 'IndexedDB') {
        await context.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined }));
      }
      const other = await context.newPage();
      const tabs = [page, other];
      await Promise.all(tabs.map(tab => tab.goto('/')));
      await Promise.all(tabs.map((tab, i) => tab.locator('#setup-seed').fill(String(400 + i))));
      await Promise.all(tabs.map(tab => tab.locator('#setup-start').click()));
      const warnings = () => Promise.all(tabs.map(tab => notice(tab, 'SAVE_CHANGED').count()));
      await expect.poll(async () => (await warnings()).reduce((a, b) => a + b, 0)).toBe(1);
      const [firstLost] = await warnings();
      const saved = JSON.parse((await readStored(page, SAVE_KEY))!);
      expect(saved.seed).toBe(firstLost ? 401 : 400);
    });
  }

  test('Continue rejects a replaced offer and reload offers the newer game', async ({ page, context }) => {
    await page.goto('/');
    await configureAndStart(page, { humans: 1, seedText: '101' });
    await reloadToPrompt(page);
    const other = await context.newPage();
    await other.goto('/');
    await other.locator('#resume-discard').click();
    await other.locator('#resume-confirm').click();
    await configureAndStart(other, { humans: 1, seedText: '202' });
    await expect.poll(async () => JSON.parse((await readStored(other, SAVE_KEY)) ?? 'null')?.seed).toBe(202);
    await page.locator('#resume-continue').click();
    await expect(notice(page, 'SAVE_CHANGED')).toBeVisible();
    await expect(page.locator('.placement-board')).toHaveCount(0);
    await reloadToPrompt(page);
    await page.locator('#resume-continue').click();
    await expect(page.locator('.game-seed')).toContainText('202');
  });

  test('a failed corrupt-save removal is reported accurately', async ({ page }) => {
    await page.goto('/');
    await page.locator('#shell-language').selectOption('ko');
    await writeStored(page, SAVE_KEY, '{broken');
    await page.addInitScript(() => {
      Storage.prototype.removeItem = () => { throw new DOMException('denied', 'SecurityError'); };
    });
    await page.reload();
    await expect(notice(page, 'SAVE_DISCARDED')).toContainText(ko['persistence.notice.REMOVAL_FAILED']);
    expect(await readStored(page, SAVE_KEY)).toBe('{broken');
  });

  test('a readable save can be resumed when the first write fails at quota', async ({ page }) => {
    await stubSeeds(page, [SEED_A]);
    await startFresh(page);
    const original = await readStored(page, SAVE_KEY);
    expect(original).not.toBeNull();
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    });
    await reloadToPrompt(page);
    await page.locator('#resume-continue').click();
    await playHumanTurn(page);
    await expect(notice(page, 'STORAGE_WRITE_FAILED')).toBeVisible();
    expect(await readStored(page, SAVE_KEY)).toBe(original);
    await reloadToPrompt(page);
  });

  test('a failed deletion keeps the save available to continue or retry', async ({ page }) => {
    await startFresh(page);
    const saved = await readStored(page, SAVE_KEY);
    expect(saved).not.toBeNull();
    for (const followUp of ['continue', 'retry']) {
      await reloadToPrompt(page);
      await page.evaluate((key) => {
        const remove = Storage.prototype.removeItem;
        Storage.prototype.removeItem = function (item) {
          if (item === key) {
            Storage.prototype.removeItem = remove;
            throw new DOMException('Removal unavailable', 'SecurityError');
          }
          remove.call(this, item);
        };
      }, SAVE_KEY);
      await page.locator('#resume-discard').click();
      await page.locator('#resume-confirm').click();
      await expect(page.locator('.resume-error')).toHaveText(en['persistence.resume.discardFailed']);
      expect(await readStored(page, SAVE_KEY)).toBe(saved);
      if (followUp === 'continue') {
        await page.locator('#resume-continue').click();
        await expect(page.locator('.hand-card').first()).toBeVisible();
      } else {
        await page.locator('#resume-discard').click();
        await page.locator('#resume-confirm').click();
        await expect(page.locator('#setup-start')).toBeVisible();
        expect(await readStored(page, SAVE_KEY)).toBeNull();
      }
    }
  });

  test('an older tab cannot discard or overwrite a new game in another tab', async ({ page, context }) => {
    await page.goto('/');
    await configureAndStart(page, { humans: 1, seedText: '101' });
    await reloadToPrompt(page);
    const newer = await context.newPage();
    await newer.goto('/');
    await newer.locator('#resume-discard').click();
    await newer.locator('#resume-confirm').click();
    await configureAndStart(newer, { humans: 1, seedText: '202' });
    const latest = await readStored(newer, SAVE_KEY);
    expect(latest).not.toBeNull();
    await page.locator('#resume-discard').click();
    await page.locator('#resume-confirm').click();
    await expect(notice(page, 'SAVE_CHANGED')).toBeVisible();
    expect(await readStored(newer, SAVE_KEY)).toBe(latest);
    await reloadToPrompt(page);
    await page.locator('#resume-continue').click();
    await reloadToPrompt(newer);
    await newer.locator('#resume-discard').click();
    await newer.locator('#resume-confirm').click();
    await configureAndStart(newer, { humans: 1, seedText: '404' });
    const replacement = await readStored(newer, SAVE_KEY);
    expect(replacement).not.toBe(latest);
    await playHumanTurn(page);
    await expect(notice(page, 'SAVE_CHANGED')).toBeVisible();
    expect(await readStored(newer, SAVE_KEY)).toBe(replacement);
  });

  test('(2) localStorage getter throws SecurityError: same expectations', async ({ page }) => {
    test.setTimeout(LONG_TEST);
    await stubSeeds(page, [SEED_A]);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('denied', 'SecurityError');
        },
      });
    });
    await page.goto('/');
    await expect(page.locator('#setup-start')).toBeVisible();
    await expectNotDurableUi(page);
    await playWithCheck(page, () => expectNotDurableUi(page));
    await page.reload();
    await expect(page.locator('#setup-start')).toBeVisible();
    await expect(page.locator('.resume')).toHaveCount(0);
    await expectNotDurableUi(page);
  });

  test('(3) setItem starts failing mid-game: write-failed notice, game continues, no saved claim; restoring it clears the notice', async ({ page }) => {
    test.setTimeout(LONG_TEST);
    await stubSeeds(page, [SEED_A]);
    await startFresh(page);
    const initialCells = await occupied(page);
    await expect(statusLine(page)).toBeHidden(); // DURABLE after the game was created
    await expect(notice(page, 'STORAGE_NOT_DURABLE')).toHaveCount(0);
    await expect(notice(page, 'STORAGE_WRITE_FAILED')).toHaveCount(0);
    await page.evaluate(() => {
      (window as unknown as { __orig: typeof Storage.prototype.setItem }).__orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function () {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      };
    });
    await playHumanTurn(page); // accepted Action, failed save
    await expect(notice(page, 'STORAGE_WRITE_FAILED')).toBeVisible();
    await expect(notice(page, 'STORAGE_WRITE_FAILED').locator('.notice-text')).toContainText('cannot be saved');
    await expect(statusLine(page)).toHaveCount(0);
    expect(await bodyText(page)).not.toMatch(NOT_SAVED_CLAIM);
    // the game continues to the next human turn while every AI save fails; the line never comes back
    expect(await currentStep(page)).toBe('PLACE');
    expect(await occupied(page)).toBe(initialCells + 4);
    expect(await bodyText(page)).not.toMatch(NOT_SAVED_CLAIM);
    await expect(statusLine(page)).toHaveCount(0);
    await expect(notice(page, 'STORAGE_WRITE_FAILED')).toBeVisible();

    await page.evaluate(() => {
      Storage.prototype.setItem = (window as unknown as { __orig: typeof Storage.prototype.setItem }).__orig;
    });
    await playHumanTurn(page); // the next accepted Action saves again: FAILED -> DURABLE
    await expect(notice(page, 'STORAGE_WRITE_FAILED')).toHaveCount(0);
    await expect(statusLine(page)).toBeHidden();
    expect(await currentStep(page)).toBe('PLACE');
    expect(await occupied(page)).toBe(initialCells + 8);
    expect(await readStored(page, SAVE_KEY)).not.toBeNull();
    // and the restored save really resumes
    await reloadToPrompt(page);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// F
// ---------------------------------------------------------------------------------------------------------------

test.describe('F game completion', () => {
  test('after the final ranking a reload offers no Continue, removes the save and keeps language and setup prefs (no Seed stored)', async ({ page }) => {
    test.setTimeout(LONG_TEST);
    await stubSeeds(page, [SEED_A]);
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await configureAndStart(page, { humans: 2, tiers: ['ADVANCED', 'BEGINNER'], language: 'ko', seedText: String(SEED_A) });
    await playUntil(page, { maxSteps: 600 });
    await expect(page.locator('.end-ranking tbody tr')).toHaveCount(4);
    expect(await readStored(page, SAVE_KEY), 'no in-progress save after the game ended').toBeNull();
    await expect(statusLine(page)).toHaveCount(0);

    await page.reload();
    await expect(page.locator('#setup-start')).toBeVisible();
    await expect(page.locator('.resume')).toHaveCount(0);
    expect(await readStored(page, SAVE_KEY)).toBeNull();
    await expect(page.locator('#shell-language')).toHaveValue('ko');
    await expect(page.locator('#setup-humans-2')).toBeChecked();
    await expect(page.locator('.setup-ai-row select')).toHaveCount(2);
    await expect(page.locator('.setup-ai-row select').first()).toHaveValue('ADVANCED');
    await expect(page.locator('.setup-ai-row select').nth(1)).toHaveValue('BEGINNER');
    const prefsText = await readStored(page, PREFS_KEY);
    expect(prefsText).not.toBeNull();
    expect(prefsText).not.toMatch(/seed/i);
    expect(prefsText).not.toContain(String(SEED_A));
    const prefs = JSON.parse(prefsText!) as { language: string; setup: { humanCount: number; difficulties: string[] } };
    expect(prefs.language).toBe('ko');
    expect(prefs.setup.humanCount).toBe(2);
    expect(prefs.setup.difficulties[2], 'first AI Seat P2').toBe('ADVANCED'); // two humans: the first AI Seat is P2
  });
});
