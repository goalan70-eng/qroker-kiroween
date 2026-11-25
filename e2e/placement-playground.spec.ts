import { expect, test, type Page } from '@playwright/test';

// The real game shell is not yet wired to gameplay (Task 19). Test ONLY the
// existing development-only placement page until real game screens exist.
// These scenarios drive Chromium, not the Node fake DOM or the headless engine.

const playground = (seed = 1, lang = 'en') =>
  `/dev/placement-playground.html?seed=${seed}&lang=${lang}`;

function boardCell(page: Page, row: number, col: number) {
  return page.locator(`.board-cell[data-row="${row}"][data-col="${col}"]`);
}

function recordUncaughtErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

test('dev playground renders a seeded 8x8 board with no browser exceptions', async ({ page }) => {
  const errors = recordUncaughtErrors(page);
  await page.goto(playground(1, 'en'));
  await expect(page.locator('.board-cell')).toHaveCount(64);
  await expect(page.locator('.board-cell--occupied')).toHaveCount(4);
  await expect(page.locator('.hand-card')).toHaveCount(3);
  await expect(page.locator('.placement-button--confirm')).toBeDisabled();
  await expect(page.locator('.placement-button--confirm')).toBeHidden();
  await expect(page.locator('.dev-status')).toContainText('phase PLACEMENT');
  await expect(page.locator('.board-cell[tabindex="0"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('position-first placement remains uncommitted until confirmation', async ({ page }) => {
  await page.goto(playground(1));
  const target = boardCell(page, 3, 2); // C4, legal next to the initial neutral group
  await expect(target).toHaveClass(/is-legal/);
  await target.click();
  await expect(target).toHaveClass(/is-target/);
  await expect(page.locator('.placement-button--confirm')).toBeDisabled();

  await page.locator('.hand-card').first().click();
  await expect(page.locator('.board-ghost.is-preview')).toHaveCount(1);
  await expect(page.locator('.placement-button--confirm')).toBeEnabled();
  await expect(page.locator('.board-cell--occupied')).toHaveCount(4);

  await page.locator('.placement-button--confirm').click();
  await expect(target).toHaveClass(/board-cell--occupied/);
  await expect(page.locator('.board-ghost.is-preview')).toHaveCount(0);
  await expect(page.locator('.placement-button--confirm')).toBeDisabled();
  // The next AI move runs asynchronously; the committed C4 card must remain.
  await expect(target.locator('.card-face')).toHaveCount(1);
});

test('real mouse drag creates a preview without placing until confirmation', async ({ page }) => {
  await page.goto(playground(1));
  const source = page.locator('.hand-card').first();
  const target = boardCell(page, 2, 3); // D3
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();

  const x0 = from!.x + from!.width / 2;
  const y0 = from!.y + from!.height / 2;
  const x1 = to!.x + to!.width / 2;
  const y1 = to!.y + to!.height / 2;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 8 });
  await page.mouse.up();

  await expect(target).toHaveClass(/is-target/);
  await expect(page.locator('.board-ghost.is-preview')).toHaveCount(1);
  await expect(page.locator('.drag-overlay')).toHaveCount(0);
  await expect(page.locator('.board-cell--occupied')).toHaveCount(4);
  await page.locator('.placement-button--confirm').click();
  await expect(target).toHaveClass(/board-cell--occupied/);
});

test('rotation is available for a spade, changes the preview, and is hidden for a diamond', async ({ page }) => {
  await page.goto(playground(2));
  const target = boardCell(page, 2, 3); // D3
  await target.click();
  const spade = page.locator('.hand-card').filter({ hasText: '♠' }).first();
  const diamond = page.locator('.hand-card').filter({ hasText: '♦' }).first();
  await expect(spade).toBeVisible();
  await expect(diamond).toBeVisible();
  await spade.click();

  const rotate = page.locator('.placement-button--rotate');
  await expect(rotate).toHaveAttribute('aria-pressed', 'false');
  await rotate.click();
  await expect(rotate).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.board-ghost.is-preview .card-face')).toHaveAttribute('data-orientation', '180');

  await diamond.click();
  await expect(rotate).toHaveCount(0);
  await expect(page.locator('.board-ghost.is-preview .card-face')).toHaveAttribute('data-orientation', '0');
});

test('390px mobile viewport keeps playable board and hand in view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(playground(1, 'ko'));
  await expect(page.locator('.board-cell')).toHaveCount(64);
  await expect(page.locator('.hand-card')).toHaveCount(3);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.locator('.board-cell--occupied')).toHaveCount(4);
  const overflows = await page.evaluate(() =>
    (document.scrollingElement?.scrollWidth ?? document.documentElement.scrollWidth) > innerWidth + 2
  );
  expect(overflows).toBe(false);
});
