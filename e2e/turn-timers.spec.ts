import { expect, test } from './helpers/game';

test('each seat gets its configured placement and prediction clock after handoff', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.locator('.setup-advanced summary').click();
  const place = page.locator('#setup-placement-seconds');
  const guess = page.locator('#setup-prediction-seconds');
  await expect(place).toHaveValue('20');
  await expect(guess).toHaveValue('10');
  await place.fill('7');
  await guess.fill('4');
  await page.locator('#setup-humans-4').check();
  await page.reload();
  await page.locator('.setup-advanced summary').click();
  await expect(place).toHaveValue('7');
  await expect(guess).toHaveValue('4');
  await page.locator('#setup-seed').fill('1');
  await page.locator('#setup-start').click();

  const timers = page.locator('.seat-timer');
  const atSeat = (seat: string) => page.locator(`.scoreboard-row[data-seat="${seat}"] .seat-timer`);
  const gate = page.locator('#privacy-gate-ack');
  await expect(timers).toHaveCount(4);
  await expect(atSeat('P0').locator('progress')).toHaveAttribute('max', '7');
  await page.clock.fastForward(3000);
  const club = (rank: string) => page.locator('.hand-card').filter({ hasText: '♣' }).filter({
    has: page.locator('.card-face__rank').filter({ hasText: new RegExp('^' + rank + '$') }),
  });
  await club('6').click();
  await page.locator('.board-cell[data-row="2"][data-col="3"]').click();
  await expect.poll(() => atSeat('P0').locator('progress').evaluate(el => (el as HTMLProgressElement).value)).toBeLessThanOrEqual(4.2);
  await page.clock.fastForward(8000);
  await expect(atSeat('P0')).toContainText('Time up');
  await page.locator('.placement-button--confirm').click();

  await expect(gate).toBeVisible();
  await expect(timers).toHaveCount(0);
  await page.clock.fastForward(15000);
  await gate.click();
  await expect(atSeat('P1').locator('progress')).toHaveAttribute('max', '7');
  await expect(atSeat('P1')).toContainText('7s');
  await club('4').click();
  await page.locator('.board-cell[data-row="2"][data-col="4"]').click();
  await page.locator('.placement-button--rotate').click();
  await page.locator('.placement-button--confirm').click();

  for (const seat of ['P0', 'P1', 'P2', 'P3']) {
    if (await gate.count()) await gate.click();
    await expect(atSeat(seat).locator('progress')).toHaveAttribute('max', '4');
    const formTimer = page.locator('.guess-heading [role=timer]');
    await expect(formTimer).toBeVisible();
    await expect(formTimer).toHaveText(await atSeat(seat).locator('.seat-time-left').innerText());
    await page.locator('.guess-input').fill('28');
    await page.clock.fastForward(5000);
    await expect(atSeat(seat)).toContainText('Time up');
    await expect(formTimer).toHaveText('Time up');
    await expect(page.locator('.guess-input')).toHaveValue('28');
    await page.locator('#guess-submit').click();
  }
  await expect(page.locator('#reveal-continue')).toBeVisible();
  await expect(timers).toHaveCount(0);
  const earned = page.locator('.reveal-earned');
  await expect(earned).toHaveCount(4);
  for (const cell of await earned.all()) await expect(cell).toBeInViewport({ ratio: 1 });
});

test('mobile setup accepts valid seconds and displays the countdown beside the score', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#setup-language').selectOption('ko');
  await page.getByText('상세 설정', { exact: true }).click();
  const place = page.getByLabel('카드 배치 시간(초)', { exact: true });
  await place.fill('0');
  await page.locator('#setup-start').click();
  await expect(place).toBeFocused();
  await expect(place).toHaveAttribute('aria-invalid', 'true');
  await place.fill('20');
  await page.locator('#setup-start').click();
  const row = page.locator('.scoreboard-row[data-seat="P0"]');
  const timer = row.locator('.seat-timer');
  await page.evaluate(() => scrollTo(0, 0));
  await expect(page.locator('.hand')).toBeInViewport({ ratio: 1 });
  await expect(timer).toBeInViewport({ ratio: 1 });
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect(timer).toBeInViewport();
  await expect(timer).toContainText('배치');
  const bar = await timer.locator('progress').boundingBox();
  expect(bar!.width).toBeGreaterThan(20);
  const score = await row.locator('.scoreboard-score').boundingBox();
  expect(bar!.y).toBeGreaterThan(score!.y);
  expect(bar!.y - score!.y).toBeLessThan(45);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
