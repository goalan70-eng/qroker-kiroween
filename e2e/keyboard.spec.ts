// Codex, Issue #8. Real Chromium keyboard/focus evidence; no claim of assistive-technology or physical touch testing.
import { expect, startGame, stubSeeds, test } from './helpers/game';

test('keyboard placement: roving Board focus, rotation, Escape and explicit confirmation', async ({ page }) => {
  await stubSeeds(page, [7]);
  await startGame(page, { seedText: '7' });
  const cells = page.locator('.board-cell');
  await expect(cells).toHaveCount(64);
  await cells.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(cells.nth(1)).toBeFocused();
  await expect(page.locator('.board-cell[tabindex="0"]')).toHaveCount(1);

  const legal = page.locator('.board-cell.is-legal').first();
  const card = page.locator('.hand-card[aria-label*="Clubs"], .hand-card[aria-label*="Spades"]').first();
  await legal.focus();
  await page.keyboard.press('Enter');
  await card.focus();
  await page.keyboard.press('Enter');
  const rotate = page.locator('.placement-button--rotate');
  await rotate.focus();
  await page.keyboard.press('Enter');
  await expect(rotate).toHaveAttribute('aria-pressed', 'true');
  await expect(rotate).toBeFocused();
  await expect(page.locator('.board-cell--occupied')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(page.locator('.board-cell.is-preview')).toHaveCount(0);
  await expect(page.locator('.placement-button--confirm')).toBeDisabled();

  await legal.focus();
  await page.keyboard.press('Enter');
  await card.focus();
  await page.keyboard.press('Enter');
  const confirm = page.locator('.placement-button--confirm');
  await confirm.focus();
  await expect(confirm).toBeEnabled();
  await page.keyboard.press('Enter');
  await expect(page.locator('.board-cell--occupied')).toHaveCount(5);
  await expect(page.locator('.hand-card.is-selected')).toHaveCount(0);
});

test('landscape board keeps A1 at bottom left and preserves a rotated draft across view changes', async ({ page }) => {
  await page.goto('/');
  const toggle = page.locator('#game-board-view');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await page.locator('#setup-seed').fill('7');
  await page.locator('#setup-start').click();

  const board = page.locator('.board-frame');
  const cell = (row: number, col: number) => page.locator(`.board-cell[data-row="${row}"][data-col="${col}"]`);
  await expect(board).toHaveAttribute('data-board-view', 'landscape');
  const a1 = cell(0, 0);
  const bounds = (await a1.boundingBox())!;
  const grid = (await page.locator('.board').boundingBox())!;
  expect(bounds.x).toBeCloseTo(grid.x, 1);
  expect(bounds.y + bounds.height).toBeCloseTo(grid.y + grid.height, 1);
  expect(bounds.width / bounds.height).toBeCloseTo(7 / 5, 3);
  await expect(board.locator('.board-col-labels')).toHaveText('12345678');
  await expect(board.locator('.board-row-labels')).toHaveText('HGFEDCBA');
  await a1.focus();
  await page.keyboard.press('ArrowUp');
  await expect(cell(0, 1)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(cell(1, 1)).toBeFocused();
  await cell(1, 1).hover();
  await expect(page.locator('.lens-coordinate')).toHaveText('B2');

  const legal = page.locator('.board-cell.is-legal').first();
  const target = cell(Number(await legal.getAttribute('data-row')), Number(await legal.getAttribute('data-col')));
  const card = page.locator('.hand-card[aria-label*="Clubs"], .hand-card[aria-label*="Spades"]').first();
  await card.click();
  await target.click();
  await page.locator('.placement-button--rotate').click();
  for (const view of ['portrait', 'landscape']) {
    await toggle.click();
    await expect(board).toHaveAttribute('data-board-view', view);
    await expect(target.locator('.board-ghost .card-face')).toHaveAttribute('data-orientation', '180');
    await expect(page.locator('.placement-button--confirm')).toBeInViewport();
  }
  await page.locator('.placement-button--confirm').click();
  await expect(target.locator('.card-face--cell')).toHaveAttribute('data-orientation', '180');
});
