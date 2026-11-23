# QRoker Practice Mode

The browser game supports one to four local human players, with offline
`BEGINNER` / `ADVANCED` AI filling the other seats. Scoring is provisional
(`DEV_PLACEHOLDER_SCORE_CONFIG`); no balance or AI strength ordering is claimed.
The browser game does not scan physical cards and does not implement the complete
physical game or the Scoring Companion.

Current owner-selected provisional scores (2026-11-16):

| Absolute Guess error | Points |
| --- | --- |
| Exact | 10 |
| ±1 | 5 |
| ±2 | 4 |
| ±3 | 3 |
| ±4 | 2 |
| ±5 | 1 |
| ±6 or more | 0 |
| Hand emptied | +5 bonus |

These defaults apply to new games. Resuming an older save preserves the score
configuration stored with that game; it does not silently rescore the game.

## Install and run

Use Node.js 24 and npm. From the repository root:

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Open the local URL printed by Vite (normally `http://127.0.0.1:5173/`).
Choose English or Korean, the number of humans, AI difficulties and identity
visibility. Enter a decimal unsigned 32-bit seed (`0` to `4294967295`), or keep
the generated seed / use Random seed. Start the game. The seed appears during
play; Replay same seed repeats the deal and Rematch generates another seed.

Select a legal Board cell and an own-Hand card, in either order, or drag an
own-Hand card onto a cell. A drop only previews the placement. Press Confirm
placement to commit it. Clubs and spades offer a 180° rotation; hearts and
diamonds do not. Escape cancels. Board arrow keys move focus; Enter/Space
selects a cell or card, and native button activation operates the controls.
Enter every pending Guess as an integer from 4 to 52, submit, then acknowledge
the public reveal to continue to the final four-player ranking.

## Privacy and saving

`OWNER_ONLY` (default) hides other players' unrevealed Board identities;
`FACE_UP` exposes Board identities. Each player sees only their own Hand and
their own pending Guess entry. Other players' Guess values, including AI
Guesses, are never displayed, including after the game ends.

Hot-seat privacy is an honor system: pass the device at the hand-over gate and
let the named person acknowledge it. The person who starts a new game already
holds the device, so the initial Hand has no gate. A gate is required when the
private viewer changes, including Guess collection; the same person retaining
the device does not need another hand-over. This follows the approved Task
19.4 composition contract. It is not protection against developer tools or
someone controlling the browser. The replay save contains private information
and is readable through browser storage. Do not inspect another player's save.

An accepted Action is saved automatically when browser storage works. Reload
and choose Continue to replay the versioned save; with several humans the
hand-over gate comes before the resumed private view. Discard removes the saved
game. Corrupt/unsupported saves show a safe notice. Storage failures show a
warning and allow play to continue, but progress may be lost. Finished games
are removed from the resumable save. Language and setup preferences are separate.

## Build and serve

```sh
npm run build
npm run preview -- --host 127.0.0.1
```

Open the printed preview URL (normally `http://127.0.0.1:4173/`). Alternatively,
serve the generated `dist/` directory with any static HTTP server; copy the
entire directory including `assets/`. Opening `index.html` directly as a
`file:` URL is not the supported serving path. Preview is local verification,
not a public deployment. The developer placement playground is not in `dist/`.

## Verification commands

```sh
npm run typecheck
npm run typecheck:game
npm test
npm run test:ci
npm run check:codebook
npm run build
npx playwright install chromium
npx playwright test
```

`npm test` runs all Vitest tests, including synthetic optics. `test:ci` caps
workers at four; use it on a busy machine. Do not increase test timeouts or
skip assertions to disguise failures. A failure must be investigated and recorded.
The headless acceptance test defaults to 200 seeds × three AI mixes × two
identity modes = 1,200 complete engine games, plus determinism/property tests.
To explicitly request that count in PowerShell:

```powershell
$env:E2E_SEEDS = '200'
npm test
Remove-Item Env:E2E_SEEDS
```

Browser regressions use real headless Chromium. To run the same production-page
tests against a fresh build in PowerShell:

```powershell
npm run build
$env:PLAYWRIGHT_PREVIEW = '1'
npx playwright test game.spec.ts persistence.spec.ts keyboard.spec.ts
Remove-Item Env:PLAYWRIGHT_PREVIEW
```

On POSIX shells use `E2E_SEEDS=200 npm test` and
`PLAYWRIGHT_PREVIEW=1 npx playwright test game.spec.ts persistence.spec.ts keyboard.spec.ts`.
Stop an existing preview on port 4173 before the preview test. That test starts
its own server and never reuses another preview. The normal development suite
also includes the development-only placement playground.

Model/synthetic tests, fake-DOM (`happy-dom`), real Chromium automation,
emulated touch and real-device testing are separate evidence classes.
Neither synthetic optics nor browser tests demonstrate phone-camera accuracy.
See [the P1 audit report](practice-mode-p1-report.md) for executed commands,
failures and outstanding manual checks, and [browser testing](browser-testing.md).
No credentials, paid model calls or Kiro credits are needed for these commands.

## Approved provisional defaults / open questions

These summarize the existing playable-game Spec's OQ table; they are not new decisions.

| ID | Topic | Existing default / status |
| --- | --- | --- |
| OQ-1 | Identity visibility | `OWNER_ONLY` default; `FACE_UP` supported |
| OQ-2 | Starting-card orientation | Four neutral cards at 0° |
| OQ-3 | Starting group | Not scored; no redeal |
| OQ-4 | First-placement draw exemption | Per Seat |
| OQ-5 | Seat order and Guess participants | P0 first, increasing order, all four guess |
| OQ-6 | Ties | Competition ranks, e.g. 1,1,3,4 |
| OQ-7 | UI stack | Vite, no UI framework |
| OQ-8 | P1 players | One human plus three AI; setup permits 1–4 humans |
| OQ-9 | Languages | Korean and English UI, help and errors |
| OQ-10 | Scores / hand-empty bonus | Development placeholders; human decision after P3 experiments |
| OQ-11 | Test environment | `happy-dom`; historical table defers Playwright, but browser suites now exist |
| OQ-12 | Code visualization | Schematic only; P2, no optical runtime integration |
| OQ-13 | Third AI tier | `EXPERT` deferred to P2 |
| OQ-14 | Post-game Guess disclosure | Never disclosed |
| OQ-15 | Board direction | Row 1 at the top |

The historical OQ-11 text and Kiro task checkboxes are preserved. The audit
report distinguishes their historical state from current tested behavior.
