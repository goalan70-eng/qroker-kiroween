// Records the built app through public DOM controls. No seed/state/clock stubs or paid APIs.
// Run after `npm run build`: node --import tsx scripts/record-submission-demo.mjs
import { chromium, expect } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playHumanTurn, submitGuesses, acknowledgeReveal, boardLabels, scoreboard, handLabels } from '../e2e/helpers/game.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, '.submission/recording');
const assets = path.resolve(root, 'docs/submission/assets');
const baseURL = 'http://127.0.0.1:4185';
const executablePath = process.env.QROKER_CHROMIUM_PATH ?? chromium.executablePath();
await mkdir(output, { recursive: true });
await mkdir(assets, { recursive: true });
const errors = [];
const forbiddenRequests = [];
const stages = [];
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const rootBaseSHA = spawnSync('git', ['merge-base', 'HEAD', 'main'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const dirtyStatus = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const distAssets = [];
for (const entry of await readdir(path.join(root, 'dist'), { recursive: true, withFileTypes: true })) {
  if (entry.isFile()) {
    const fullPath = path.join(entry.parentPath, entry.name);
    distAssets.push({ path: path.relative(root, fullPath).replaceAll('\\', '/'), sha256: hash(await readFile(fullPath)) });
  }
}
const startedAt = new Date().toISOString();
const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4185', '--strictPort'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
let previewExit = null;
preview.on('exit', (code, signal) => { previewExit = { code, signal }; });
preview.stdout.on('data', data => { serverLog += data.toString(); });
preview.stderr.on('data', data => { serverLog += data.toString(); });
let browser;
let context;
let page;
let epoch;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (previewExit) throw new Error(`Own preview exited: ${JSON.stringify(previewExit)} ${serverLog}`);
    if (serverLog.includes('Local:')) {
      try {
        if ((await fetch(baseURL)).ok) {
          await pause(200);
          if (previewExit) throw new Error(`Own preview exited: ${JSON.stringify(previewExit)}`);
          break;
        }
      } catch (error) { if (previewExit) throw error; }
    }
    if (attempt === 99) throw new Error(`Preview did not start: ${serverLog}`);
    await pause(100);
  }
  browser = await chromium.launch({ executablePath, headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 960 }, locale: 'en-US', baseURL, recordVideo: { dir: output, size: { width: 1280, height: 960 } } });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === '4185') return route.continue();
    forbiddenRequests.push(route.request().url());
    return route.abort();
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`); });
  // Native .mjs avoids tsx's __name transform inside the TS helper's nested evaluate function.
  const currentStep = async target => {
    await target.locator('.end-ranking, #privacy-gate-ack, .guess-input, #reveal-continue, .hand-card:not(.is-disabled)').first().waitFor({ state: 'attached', timeout: 30000 });
    return target.evaluate(() => document.querySelector('.end-ranking') ? 'END' : document.querySelector('#privacy-gate-ack') ? 'GATE' : document.querySelector('.guess-input') ? 'GUESS' : document.querySelector('#reveal-continue') ? 'REVEAL' : 'PLACE');
  };
  epoch = Date.now();
  const caption = async (title, detail) => {
    await page.evaluate(({ title, detail }) => {
      let panel = document.getElementById('recording-caption');
      if (!panel) {
        panel = document.createElement('aside'); panel.id = 'recording-caption';
        panel.style.cssText = 'position:fixed;left:20px;right:20px;bottom:14px;z-index:2147483647;background:#102331f2;color:#fff;padding:14px 20px;border-radius:12px;font:18px/1.4 system-ui;box-shadow:0 4px 20px #0005;pointer-events:none';
        document.body.append(panel);
      }
      panel.replaceChildren();
      const strong = document.createElement('strong'); strong.textContent = title; strong.style.cssText = 'display:block;font-size:22px;margin-bottom:3px';
      const body = document.createElement('div'); body.textContent = detail;
      panel.append(strong, body);
    }, { title, detail });
    stages.push({ seconds: (Date.now() - epoch) / 1000, title, detail });
    console.log(`[record] ${title}`);
  };
  await page.goto('/');
  await page.locator('#setup-language').selectOption('en');
  await page.locator('#setup-humans-1').check();
  for (const select of await page.locator('.setup-ai-row select').all()) await select.selectOption('BEGINNER');
  await page.locator('#setup-seed').fill('20240601');
  await caption('QRoker — actual browser Practice Mode', 'Automated browser input · 52 cards · 8×8 board · one human + three local AI · seed 20240601');
  await pause(7000);
  await page.locator('#setup-start').click();
  await expect(page.locator('.hand-card:not(.is-disabled)').first()).toBeVisible();
  await caption('Drag to preview. Confirm to place.', 'The preview does not commit a move. Meaningful 180° rotation is available for clubs and spades.');
  const from = await page.locator('.hand-card').nth(1).boundingBox();
  const to = await page.locator('.board-cell.is-legal').first().boundingBox();
  if (!from || !to) throw new Error('Missing drag targets');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect(page.locator('.board-ghost.is-preview')).toHaveCount(1);
  await expect(page.locator('.placement-button--confirm')).toBeEnabled();
  const rotation = page.locator('.placement-button--rotate');
  const rotationShown = await rotation.count() > 0;
  if (rotationShown) { await rotation.click(); await pause(1800); await rotation.click(); }
  await pause(6500);
  await page.evaluate(() => document.getElementById('recording-caption')?.remove());
  await page.screenshot({ path: path.join(assets, 'practice-mode.png'), fullPage: false });
  await caption('Preview first. Confirm to place.', 'Actual desktop browser capture. No jokers, no Swap action. Scoring remains provisional.');
  await page.locator('.placement-button--confirm').click();
  let steps = 1;
  let guessShown = false;
  let resumed = false;
  let revealShown = false;
  let resumeBefore;
  let resumeAfter;
  for (; steps < 400; steps++) {
    const kind = await currentStep(page);
    if (kind === 'END') break;
    if (kind === 'GUESS') {
      if (!guessShown) {
        await caption('Guess privately. Reveal together.', 'Predict the total of each newly completed valid group. Other players’ private Guesses stay hidden.');
        await page.locator('.guess-input').first().fill('20');
        await pause(6500); guessShown = true;
      }
      await submitGuesses(page);
    } else if (kind === 'REVEAL') {
      if (!revealShown) {
        await caption('Public reveal: cards, total and points', 'Current provisional scoring: exact 10 · errors 1–5: 5/4/3/2/1 · empty-Hand bonus +5.');
        await pause(7000); revealShown = true;
      }
      await acknowledgeReveal(page);
    } else if (kind === 'GATE') await page.locator('#privacy-gate-ack').click();
    else if (!resumed && revealShown) {
      const before = { board: await boardLabels(page), hand: await handLabels(page), scores: await scoreboard(page) };
      resumeBefore = before;
      await caption('Real reload and Continue', 'The browser stores this game locally. Older saves retain their own scoring configuration.');
      await pause(3000);
      await page.reload();
      await expect(page.locator('#resume-continue')).toBeVisible();
      await caption('Continue restores the saved game', 'Actual browser reload, followed by the app’s Continue control.');
      await pause(4000);
      await page.locator('#resume-continue').click();
      await expect(page.locator('.hand-card:not(.is-disabled)').first()).toBeVisible();
      resumeAfter = { board: await boardLabels(page), hand: await handLabels(page), scores: await scoreboard(page) };
      expect(resumeAfter).toEqual(before);
      resumed = true;
      await caption('Same game continues — automated input', 'Subsequent real turns are played at normal app speed; AI pacing is unchanged. No cuts or clock stubs.');
    } else await playHumanTurn(page);
  }
  expect(guessShown && revealShown && resumed).toBe(true);
  await expect(page.locator('.end-ranking tbody tr')).toHaveCount(4);
  const finalRanking = await page.locator('.end-ranking tbody tr').allTextContents();
  // The preceding input can leave the document scrolled into the long reveal history.
  await page.locator('.end-ranking').evaluate(table => table.scrollIntoView({ block: 'center' }));
  const rankingBox = await page.locator('.end-ranking').boundingBox();
  expect(rankingBox !== null && rankingBox.y >= 0 && rankingBox.y + rankingBox.height < 820).toBe(true);
  await caption('The actual final ranking', 'A complete game from setup through placement, Guess, reveal, reload/Continue and final results.');
  await page.screenshot({ path: path.join(output, 'ranking-visible.png') });
  await pause(6500);
  const files = [
    '.kiro/specs/qroker-playable-game/requirements.md',
    '.kiro/specs/qroker-playable-game/design.md',
    '.kiro/specs/qroker-playable-game/tasks.md',
    '.kiro/hooks/verify-after-task.json',
  ];
  for (const file of files) {
    const text = await readFile(path.join(root, file), 'utf8');
    await page.evaluate(({ file, text }) => {
      document.getElementById('repository-artifact')?.remove();
      const viewer = document.createElement('section'); viewer.id = 'repository-artifact';
      viewer.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#f4f7fa;color:#122333;padding:30px 40px 130px;overflow:hidden;font:17px/1.45 system-ui';
      const heading = document.createElement('h1'); heading.textContent = file; heading.style.fontSize = '24px';
      const sub = document.createElement('p'); sub.textContent = 'Exact repository file contents shown below — not a recorded Kiro session.';
      const pre = document.createElement('pre'); pre.textContent = text; pre.style.cssText = 'white-space:pre-wrap;font:15px/1.35 Consolas,monospace';
      viewer.append(heading, sub, pre); document.body.append(viewer);
    }, { file, text });
    await caption('Repository artifacts — not a recorded Kiro session', 'Owner-reported primary spec-driven Kiro development. Later Codex work is separately attributed; original sessions were not audited.');
    await pause(4500);
  }
  await page.evaluate(() => document.getElementById('repository-artifact')?.remove());
  await caption('Browser game demonstrated; optical research remains separate', 'Synthetic experiments are not phone-camera accuracy. Printed-card trials, camera integration and physical privacy checks remain pending.');
  await pause(Math.max(9000, 150000 - (Date.now() - epoch)));
  expect(errors).toEqual([]);
  expect(forbiddenRequests).toEqual([]);
  const recordedVideo = page.video();
  const browserVersion = browser.version();
  await context.close(); context = undefined;
  const generatedPath = await recordedVideo.path();
  const finalPath = path.join(output, 'qroker-browser-demo-en.webm');
  await rename(generatedPath, finalPath);
  const videoBytes = await readFile(finalPath);
  const ffmpegCache = path.resolve(path.dirname(executablePath), '../..');
  const ffmpegFolder = (await readdir(ffmpegCache)).find(name => name.startsWith('ffmpeg-'));
  const ffmpegPath = process.env.QROKER_FFMPEG_PATH ?? path.join(ffmpegCache, ffmpegFolder ?? '', process.platform === 'win32' ? 'ffmpeg-win64.exe' : 'ffmpeg-linux');
  const probe = spawnSync(ffmpegPath, ['-i', finalPath], { encoding: 'utf8', windowsHide: true });
  const probeText = `${probe.stdout ?? ''}${probe.stderr ?? ''}`;
  await writeFile(path.join(output, 'ffmpeg-inspection.txt'), probeText);
  const durationParts = probeText.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  if (!durationParts) throw new Error(`Could not read exported WebM duration: ${probeText}`);
  const durationSeconds = Number(durationParts[1]) * 3600 + Number(durationParts[2]) * 60 + Number(durationParts[3]);
  if (!(durationSeconds >= 120 && durationSeconds < 180)) throw new Error(`Exported WebM duration outside 120–179.99s: ${durationSeconds}`);
  const evidence = { startedAt, finishedAt: new Date().toISOString(), revision, rootBaseSHA, dirty: dirtyStatus.length > 0, dirtyStatus, distAssets, recorderSHA256: hash(await readFile(fileURLToPath(import.meta.url))), browser: `Chromium ${browserVersion}`, viewport: '1280x900 desktop emulation', source: 'Existing production dist served by own Vite preview', seed: 20240601, humans: 1, ai: ['BEGINNER', 'BEGINNER', 'BEGINNER'], steps, assertions: { actualDragPreviewAndConfirm: true, guessAndReveal: guessShown && revealShown, reloadContinueEqualBoardHandScores: resumed, rankingRows: 4, errors, forbiddenRequests }, capture: { path: '.submission/recording/qroker-browser-demo-en.webm', bytes: videoBytes.length, sha256: hash(videoBytes), wallSeconds: (Date.now() - epoch) / 1000 }, stages, limits: ['Desktop Chromium only; not a real phone', 'Captions are recording overlays; game state/clock/seeds were not stubbed', 'Repository artifacts are file views, not original Kiro sessions', 'No physical camera/print evidence', 'No voice track or public YouTube upload', 'Public deployment not performed'] };
  evidence.viewport = '1280x960 desktop emulation';
  evidence.assertions.rotationShown = rotationShown;
  evidence.capture.durationSeconds = durationSeconds;
  evidence.resumeBefore = resumeBefore;
  evidence.resumeAfter = resumeAfter;
  evidence.finalRanking = finalRanking;
  await writeFile(path.join(output, 'recording-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ video: finalPath, screenshot: path.join(assets, 'practice-mode.png'), ...evidence.capture }));
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  preview.kill();
  await writeFile(path.join(output, 'preview.log'), serverLog);
}
