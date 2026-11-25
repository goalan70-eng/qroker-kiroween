import type { Page } from '@playwright/test';
import { expect, test } from './helpers/game';

async function positions(page: Page, selectors: string[]) {
  return Promise.all(selectors.map(selector => page.locator(selector).first().boundingBox()));
}

for (const viewport of [{ width: 1024, height: 576 }, { width: 1280, height: 800 }, { width: 1920, height: 800 }]) {
  test(`desktop frame and control positions stay fixed at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const frame = (await page.locator('#app').boundingBox())!;
    expect(frame.width / frame.height).toBeCloseTo(16 / 9, 3);
    expect(frame.x).toBeCloseTo((viewport.width - frame.width) / 2, 1);
    expect(frame.y).toBeCloseTo((viewport.height - frame.height) / 2, 1);

    const setup = ['.setup-cover', '#setup-start', '#setup-visibility-OWNER_ONLY'];
    const initial = await positions(page, setup);
    await page.locator('#setup-humans-4').check();
    await page.locator('#setup-visibility-BLIND').check();
    await expect(page.locator('#setup-blind-feedback')).toBeVisible();
    const clippedSettings = await page.locator('.setup-fields').evaluate(el => el.scrollHeight - el.clientHeight);
    expect(clippedSettings).toBeLessThanOrEqual(1);
    expect(await positions(page, setup)).toEqual(initial);
    await page.locator('#setup-humans-1').check();
    await page.locator('#setup-visibility-OWNER_ONLY').check();
    await page.locator('#setup-seed').fill('7');
    await page.locator('#setup-start').click();

    const anchors = ['.board-frame', '.hand', '.scoreboard-row[data-seat="P0"]', '.scoreboard-deck'];
    await page.locator('.hand-card').first().waitFor();
    const before = await positions(page, anchors);
    const board = before[0]!;
    expect(board.y - frame.y).toBeCloseTo(6, 0);
    expect(frame.y + frame.height - board.y - board.height).toBeCloseTo(6, 0);
    const logo = page.locator('.shell__title');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveText('QRoker');
    await expect(page.locator('.shell__language')).toBeHidden();
    const logoBox = (await logo.boundingBox())!;
    expect(logoBox.x - frame.x).toBeLessThan(40);
    expect(logoBox.y - frame.y).toBeLessThan(20);
    await expect(page.locator('.game-banner-slot')).toBeHidden();
    await expect(page.locator('.notice-status')).toBeHidden();
    const rotateView = page.locator('.board-frame #game-board-view');
    await expect(rotateView).toBeVisible();
    const help = (await page.locator('#game-help-open').boundingBox())!;
    const fullscreen = page.locator('#game-fullscreen');
    const full = (await fullscreen.boundingBox())!;
    const exit = (await page.locator('#game-abandon-open').boundingBox())!;
    expect(exit.y).toBe(help.y);
    expect(full.y).toBe(help.y);
    expect(help.x).toBeGreaterThan(frame.x + frame.width / 2);
    expect(full.x).toBe(help.x + help.width);
    expect(exit.x).toBe(full.x + full.width);
    const upperSeats = await positions(page, ['[data-seat="P1"] .seat-cards', '[data-seat="P2"] .seat-cards']);
    expect(upperSeats[0]!.y).toBe(upperSeats[1]!.y);
    expect(logoBox.y + logoBox.height).toBeLessThanOrEqual(upperSeats[0]!.y);
    expect(exit.y + exit.height).toBeLessThanOrEqual(upperSeats[1]!.y);
    expect(board.x + board.width / 2).toBeCloseTo(frame.x + frame.width / 2, 0);
    for (const [index, seat] of (await page.locator('.scoreboard-row').all()).entries()) {
      const bounds = (await seat.boundingBox())!;
      const cards = Number(await seat.locator('.scoreboard-hand').textContent());
      await expect(seat.locator('.seat-card-back')).toHaveCount(index === 0 ? 0 : cards);
      const row = index === 0 ? page.locator('.hand-card') : seat.locator('.seat-card-back');
      const boxes = await Promise.all((await row.all()).map(card => card.boundingBox()));
      expect(boxes[0]!.x).toBeGreaterThanOrEqual(bounds.x);
      expect(boxes[boxes.length - 1]!.x + boxes[boxes.length - 1]!.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
      expect(boxes[0]!.y).toBeGreaterThanOrEqual(bounds.y);
      expect(boxes[0]!.y + boxes[0]!.height).toBeLessThanOrEqual(bounds.y + bounds.height);
      for (let i = 1; i < boxes.length; i++) {
        expect(boxes[i]!.y).toBeCloseTo(boxes[0]!.y, 0);
        expect(boxes[i]!.x - boxes[i - 1]!.x - boxes[i - 1]!.width).toBeGreaterThan(2);
      }
      if (index < 2) expect(bounds.x + bounds.width).toBeLessThan(board.x);
      else expect(bounds.x).toBeGreaterThan(board.x + board.width);
      const middle = board.y + board.height / 2;
      if (index === 0 || index === 3) expect(bounds.y).toBeGreaterThan(middle);
      else expect(bounds.y + bounds.height).toBeLessThan(middle);
    }
    await expect(page.locator('.deck-stack .table-card-back')).toBeVisible();
    for (const selector of ['.board-gridcell', '.board', '.hand-card .card-face']) {
      const box = (await page.locator(selector).first().boundingBox())!;
      expect(box.width / box.height, selector).toBeCloseTo(5 / 7, 3);
    }
    await expect(page.locator('.board-code-junction')).toHaveCount(0);
    const lens = page.locator('.board-lens');
    const center = page.locator('.board-cell[data-row="3"][data-col="3"]');
    const source = (await center.boundingBox())!;
    await center.hover();
    await expect(lens).toBeVisible();
    await expect(lens.locator('.lens-coordinate')).toHaveText('D4');
    const panel = (await lens.boundingBox())!;
    expect(panel.width).toBeGreaterThan(frame.width * .16);
    const upperRight = (await page.locator('.scoreboard-row[data-seat="P2"]').boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(upperRight.y + upperRight.height);
    expect(panel.x).toBeGreaterThanOrEqual(before[0]!.x + before[0]!.width);
    const squareCrop = (await lens.locator('.lens-viewport').boundingBox())!;
    expect(squareCrop.height).toBeCloseTo(squareCrop.width, 1);
    const deck = before[3]!;
    expect(deck.x - (panel.x + panel.width)).toBeGreaterThanOrEqual(7);
    expect(deck.y + deck.height / 2).toBeCloseTo(panel.y + panel.height / 2, 0);
    expect(deck.x + deck.width).toBeLessThanOrEqual(frame.x + frame.width);
    expect(before[2]!.x + before[2]!.width).toBeLessThanOrEqual(before[0]!.x);
    const tile = (await lens.locator('.lens-tile').first().boundingBox())!;
    expect(tile.width / source.width).toBeCloseTo(2.5, 1);
    const detail = lens.locator('.lens-detail');
    const start = (await detail.boundingBox())!;
    await page.mouse.move(source.x + source.width * .75, source.y + source.height * .75);
    const moved = (await detail.boundingBox())!;
    expect(moved.x).toBeLessThan(start.x);
    expect(moved.y).toBeLessThan(start.y);
    for (const [row, col] of [[0, 0], [0, 7], [7, 0], [7, 7]] as const) {
      const corner = page.locator(`.board-cell[data-row="${row}"][data-col="${col}"]`);
      await corner.hover({ position: { x: col === 0 ? 1 : source.width - 1, y: row === 0 ? 1 : source.height - 1 } });
      await expect(lens.locator('.lens-coordinate')).toHaveText(`${col === 0 ? 'A' : 'H'}${row + 1}`);
      const crop = (await lens.locator('.lens-viewport').boundingBox())!;
      const first = (await lens.locator('.lens-tile').first().boundingBox())!;
      const last = (await lens.locator('.lens-tile').last().boundingBox())!;
      expect(first.x).toBeLessThanOrEqual(crop.x + 1);
      expect(first.y).toBeLessThanOrEqual(crop.y + 1);
      expect(last.x + last.width).toBeGreaterThanOrEqual(crop.x + crop.width - 1);
      expect(last.y + last.height).toBeGreaterThanOrEqual(crop.y + crop.height - 1);
    }
    expect(await lens.boundingBox()).toEqual(panel);
    expect(await positions(page, anchors)).toEqual(before);
    await page.mouse.move(0, 0);
    await expect(lens.locator('.lens-idle')).toBeVisible();
    await expect(lens.locator('.lens-tile')).toHaveCount(0);
    await rotateView.click();
    expect(await logo.boundingBox()).toEqual(logoBox);
    const horizontalPanel = (await lens.boundingBox())!;
    const horizontalCrop = (await lens.locator('.lens-viewport').boundingBox())!;
    const horizontalDeck = (await page.locator('.scoreboard-deck').boundingBox())!;
    expect(horizontalCrop.height).toBeCloseTo(horizontalCrop.width, 1);
    expect(horizontalDeck.x - horizontalPanel.x - horizontalPanel.width).toBeGreaterThanOrEqual(7);
    expect(horizontalDeck.x + horizontalDeck.width).toBeLessThanOrEqual(frame.x + frame.width);
    await rotateView.click();
    const clippedPanels = await page.locator('.placement-hand, .placement-controls-slot, .game-score-slot')
      .evaluateAll(panels => panels.map(el => Math.max(el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight)));
    expect(Math.max(...clippedPanels)).toBeLessThanOrEqual(1);
    const card = page.locator('.hand-card[aria-label*="Clubs"], .hand-card[aria-label*="Spades"]').first();
    const cardBox = (await card.boundingBox())!;
    await expect(page.locator('.deck-number')).toHaveText('36');
    await card.click();
    await expect(page.locator('.placement-button--confirm')).toBeHidden();
    await expect(page.locator('.placement-button--rotate')).toBeHidden();
    const legal = page.locator('.board-cell.is-legal').first();
    await legal.click();
    const square = (await legal.boundingBox())!;
    const actions = (await page.locator('.placement-card-actions').boundingBox())!;
    expect(actions.x).toBeLessThan(square.x + square.width);
    expect(actions.x + actions.width).toBeGreaterThan(square.x);
    expect(Math.min(Math.abs(actions.y + actions.height - square.y), Math.abs(actions.y - square.y - square.height))).toBeLessThan(6);
    await page.locator('.placement-button--rotate').click();
    await expect(card.locator('.card-face')).toHaveAttribute('data-orientation', '180');
    await expect(page.locator('.placement-button--rotate')).toHaveText('Return upright');
    await legal.hover();
    await expect(lens).toBeVisible();
    await expect(lens.locator('.card-face--preview')).toHaveAttribute('data-orientation', '180');
    expect(await card.boundingBox()).toEqual(cardBox);
    expect(await positions(page, anchors)).toEqual(before);
    await page.locator('.placement-button--cancel').click();

    const x = cardBox.x + cardBox.width / 2;
    const y = cardBox.y + cardBox.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 25, y + 15, { steps: 3 });
    const ghost = (await page.locator('.drag-overlay').boundingBox())!;
    expect(Math.abs(ghost.x + ghost.width / 2 - (x - 25))).toBeLessThan(2);
    expect(Math.abs(ghost.y + ghost.height / 2 - (y + 15))).toBeLessThan(2);
    expect(await positions(page, anchors)).toEqual(before);
    await page.mouse.up();

    await page.locator('#game-help-open').click();
    expect(await page.locator('.overlay-backdrop').boundingBox()).toEqual(frame);
    await page.keyboard.press('Escape');
    expect(await positions(page, anchors)).toEqual(before);
    expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
  });
}

test('fullscreen follows browser entry and exit without clearing a placement', async ({ page }) => {
  await page.goto('/');
  await page.locator('#setup-start').click();
  await page.locator('.hand-card').first().click();
  await page.locator('.board-cell.is-legal').first().click();
  const toggle = page.locator('#game-fullscreen');
  const active = () => page.evaluate(() => document.fullscreenElement === document.documentElement);
  await toggle.click();
  await expect.poll(active).toBe(true);
  await expect(toggle).toHaveAccessibleName('Exit fullscreen');
  await toggle.click();
  await expect.poll(active).toBe(false);
  await expect(toggle).toHaveAccessibleName('Enter fullscreen');
  await toggle.click();
  await expect.poll(active).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await expect(toggle).toHaveAccessibleName('Enter fullscreen');
  await expect(page.locator('.placement-button--confirm')).toBeEnabled();
});
