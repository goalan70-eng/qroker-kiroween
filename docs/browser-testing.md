# QRoker Playwright browser regression tests

Playwright Test runs on real headless Chromium (no AI model, MCP server or Kiro credits).
The tests live under `e2e/` and are **separate** from Vitest, which continues
to cover pure logic, unit tests, headless simulations and synthetic optics.

## Current scope and limitations

The public game entry page currently contains only the basic shell; Task 18/19
has not yet connected the actual player screens. Do **not** claim the full game
is Playwright-tested.

The first regression suite targets the existing **developer-only** playground:
`src/game/ui/dev/placement-playground.html`. Vite serves it in development;
the production Vite build does not include it.

The suite verifies:
- Browser launch and seeded 8x8 board/hand creation
- Position-first placement with explicit confirmation
- Actual mouse drag and drop preview, then confirmation
- 180-degree orientation control on a rotation-relevant suit only
- 390px Korean UI viewport with no horizontal document overflow

It does NOT validate a real Android handset, complete Guess/reveal/scoring
screens, physical card-camera reading, or final production UX. Add stable
browser tests for those features when they are implemented, rather than
marking them complete prematurely. Previous manual browser evidence appears
in `docs/game/placement-verification.md`.

## Local Windows usage

From QRoker's repository root with Node 24 and npm:

```powershell
npm ci
npx playwright install chromium
npm run test:e2e
```

To see the browser visually:

```powershell
npm run test:e2e -- --headed
```

Playwright starts and stops a temporary Vite development server using
`playwright.config.ts` (unless an existing local server is available).
No external API credentials are required.

## GitHub Actions

The existing read-only `.github/workflows/verify.yml` automatically runs
on PRs and pushes to `main`. After the current type checks, Vitest and build,
it installs Chromium dependencies and runs `npm run test:e2e`.
A failed browser test makes the workflow fail; screenshots, traces and HTML
test reports are available in the failed-run artifact.

Tests and browser binaries are downloaded as development dependencies.
The browser runner uses one worker and limited retry to reduce flakiness.
The browser tests make **no OpenAI API requests** and do not access ntfy or
local secrets. The public repository's GitHub-hosted standard runner is free
under GitHub's published conditions.

## CI principles

- Preserve the existing `npm run test:ci` and optical verification steps.
- No change to gameplay code or Kiro Specs solely to satisfy these tests.
- Do not mask failing tests with skips or unconditional retries.
- Browser failures and screenshots are evidence, not proof of full release readiness.
