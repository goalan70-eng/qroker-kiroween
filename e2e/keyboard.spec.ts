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
