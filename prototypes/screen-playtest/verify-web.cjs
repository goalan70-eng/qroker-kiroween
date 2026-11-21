const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const base = pathToFileURL(path.join(__dirname, 'deliverables', 'QRoker-Web.html')).href;
const isolate = process.argv.includes('--isolate-marker');
const evidence = path.join(__dirname, 'evidence');
const output = isolate ? path.join(evidence, 'marker-isolation') : evidence;
const ranks = 'A 2 3 4 5 6 7 8 9 10 J Q K'.split(' ');
const suits = 'HDCS';
const rows = [];

async function ready(page) {
  await page.locator('#scan-dialog[open]').waitFor();
  await page.locator('#scan-board img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
}

async function capture(page, name, expected) {
  await ready(page);
  const data = await page.locator('#scan-board').screenshot({ path: path.join(output, name + '.png') });
  rows.push([name + '.png', expected === null ? '-' : expected.join(',')].join('\t'));
  // The virtual Android camera crops its input stream. Move the screenshot as a whole into its usable view.
  const encoded = await page.evaluate(async png => {
    const board = new Image();
    board.src = 'data:image/png;base64,' + png;
    await board.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 960;
    const context = canvas.getContext('2d');
    context.fillStyle = '#15342e';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(board, 318 - board.width / 2, 465 - board.height / 2);
    return canvas.toDataURL('image/jpeg', .93).split(',')[1];
  }, data.toString('base64'));
  await fs.writeFile(path.join(output, name + '.jpg'), Buffer.from(encoded, 'base64'));
}

async function captureIsolation(page, name, codes) {
  const board = page.locator('#scan-board');
  for (const onlyCode of [true, false]) {
    await board.evaluate((element, keepCode) => {
      const { width, height } = element.getBoundingClientRect();
      // Keep a strip of paper outside the frame that the reader samples for edge contrast.
      const half = width * 31.6 / (4 * 63.5);
      const left = Math.floor(width / 2 - half), right = Math.ceil(width / 2 + half);
      const top = Math.floor(height / 2 - half), bottom = Math.ceil(height / 2 + half);
      const boxes = keepCode
        ? [[0, 0, width, top], [0, bottom, width, height - bottom],
           [0, top, left, bottom - top], [right, top, width - right, bottom - top]]
        : [[left, top, right - left, bottom - top]];
      for (const [x, y, w, h] of boxes) {
        const mask = document.createElement('div');
        mask.className = 'marker-isolation-mask';
        mask.style.cssText = `position:absolute;z-index:5;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:#fff;`;
        element.append(mask);
      }
    }, onlyCode);
    try {
      await capture(page, name + (onlyCode ? '-code-only' : '-code-hidden'), onlyCode ? codes : null);
    } finally {
      await board.locator('.marker-isolation-mask').evaluateAll(nodes => nodes.forEach(node => node.remove()));
    }
  }
}

async function gameReveal(page) {
  await page.locator('#setup-humans-1').check();
  await page.locator('#setup-seed').fill(isolate ? '777001' : '20240601');
  for (const select of await page.locator('.setup-ai-row select').all()) await select.selectOption('BEGINNER');
  await page.locator('#setup-start').click();
  for (let step = 0; step < 80; step++) {
    const kind = await page.waitForFunction(() => {
      const visible = selector => !!document.querySelector(selector)?.getClientRects().length;
      if (visible('#reveal-continue')) return 'reveal';
      if (visible('#privacy-gate-ack')) return 'gate';
      if (visible('.guess-input')) return 'guess';
      if (visible('.hand-card:not(.is-disabled)')) return 'place';
      return null;
    }).then(handle => handle.jsonValue());
    if (kind === 'reveal') return;
    assert.equal(await page.locator('.screen-reveal-tools button').count(), 0, 'No camera sheet before the reveal');
    assert.equal(await page.locator('.card-face--down img').count(), 0, 'No private card artwork on a card back');
    if (kind === 'gate') {
      assert.equal(await page.locator('#sample-open').isVisible(), false);
      await page.locator('#privacy-gate-ack').click();
    } else if (kind === 'guess') {
      for (const input of await page.locator('.guess-input').all()) await input.fill('20');
      await page.locator('#guess-submit').click();
    } else {
      await page.locator('.hand-card:not(.is-disabled)').first().click();
      assert.ok(await page.locator('.hand-card .screen-card-art').count() > 0);
      await page.locator('.board-cell.is-legal').first().click();
      const confirm = page.locator('.placement-button--confirm');
      const turn = page.locator('.placement-button--rotate');
      if (await confirm.isDisabled() && await turn.count()) await turn.click();
      await confirm.click();
    }
  }
  throw new Error('First game reveal was not reached');
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, locale: 'ko-KR' });
    const errors = [];
    const external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.url() !== base && !request.url().startsWith('data:')) external.push(request.url());
    });
    await page.goto(base);
    await page.locator('#sample-open').click();
    const sampleIds = [4, 21, 36, 40];
    await capture(page, 'web-sample', sampleIds);
    if (isolate) await captureIsolation(page, 'web-sample', sampleIds);
    await page.screenshot({ path: path.join(output, 'screen-preview.png') });
    await page.locator('#scan-remove').click();
    await capture(page, 'web-missing', null);
    assert.equal(await page.locator('#scan-board .scan-card img').count(), 3);
    await page.locator('#scan-remove').click();
    assert.equal(await page.locator('#scan-board .scan-card img').count(), 4);
    await page.locator('#scan-close').click();
    assert.equal(await page.locator('#scan-board img').count(), 0);
    console.log('PASS sample, removal, restore, and modal cleanup');

    await gameReveal(page);
    const reveal = page.locator('.screen-reveal-tools button').first();
    const label = await reveal.textContent();
    const quad = label.split(' · ')[1];
    const sumText = await page.locator('.reveal-code[data-quad-key="' + quad + '"] .reveal-sum').textContent();
    const sum = Number(sumText.match(/\d+/)[0]);
    await reveal.click();
    await ready(page);
    const ids = await page.locator('#scan-board .scan-card img').evaluateAll(images =>
      images.map(img => img.dataset.scanFace));
    assert.equal(new Set(ids).size, 4);
    const codes = ids.map(id => 13 * suits.indexOf(id.at(-1)) + ranks.indexOf(id.slice(0, -1)));
    assert.ok(codes.every(code => code >= 0 && code < 52));
    assert.equal(codes.reduce((value, code) => value + code % 13 + 1, 0), sum);
    await capture(page, 'web-game', codes);
    if (isolate) await captureIsolation(page, 'web-game', codes);
    await page.locator('#scan-close').click();
    await page.locator('#reveal-continue').click();
    assert.equal(await page.locator('.screen-reveal-tools button').count(), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    await fs.writeFile(path.join(output, 'expected.tsv'), rows.join('\n') + '\n');
    await fs.writeFile(path.join(output, 'game-reveal.json'), JSON.stringify({ quad, ids, sum }, null, 2) + '\n');
    console.log('PASS engine-driven public reveal', quad, ids.join(' '), 'sum', sum);
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
