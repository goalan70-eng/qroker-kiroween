import { defineConfig } from '@playwright/test';

// Exercise the same production-page tests against built assets without changing their assertions.
// The developer playground remains a development-only test; select the production files for preview runs.
const preview = process.env.PLAYWRIGHT_PREVIEW === '1';
const port = preview ? 4173 : 5173;
const baseURL = `http://127.0.0.1:${port}`;

// Separate from Vitest; only the real-browser tests in e2e/ use this config.
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/playwright',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Stable browser tests on GitHub's shared runners.
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],
  use: {
    baseURL,
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run ${preview ? 'preview' : 'dev'} -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/`,
    reuseExistingServer: !process.env.CI && !preview,
    timeout: 60_000,
  },
});
