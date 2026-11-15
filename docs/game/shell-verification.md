# App shell verification (task 16.1)

This file records what was run for task 16.1 (Vite and the app shell) and what each check does and does not show. The evidence classes are kept apart on purpose. Vite + plain DOM/CSS + no UI framework is a PROVISIONAL implementation choice of this batch (design decisions D2 and D3; open question OQ-7 is not closed here). It is not a decision approved earlier.

Environment: Node v24.20.0, npm 11.19.0, Vite 8.3.8, Vitest 5.1.0, Windows. Browser: Microsoft Edge 157.0.4341.60, headless.

## Dependency compatibility

| Item | Value |
|------|-------|
| Vitest 5.1.0 peer range for `vite` | `^6.4.0 \|\| ^7.0.0 \|\| ^8.0.0` (required, not optional) |
| Installed `vite` before the change | 8.3.8 (transitive, deduped), engines `^20.19.0 \|\| >=22.12.0` (Node 24.20.0 satisfies it) |
| `npm view vite` latest | 8.3.8 |
| Range added to `devDependencies` | `"vite": "^8.3.8"` |
| `npm ls vite` after | one copy, `vite@8.3.8`, shown as `deduped` under `vitest` and `@vitest/mocker` |

`package-lock.json` diff: one added line (the root `"vite": "^8.3.8"` entry in the root package record) and 43 removed `"peer": true` flags on 43 existing package records. npm clears that flag because `vite` is now a direct dependency instead of a peer-only one. Three more lines change only a trailing comma next to a removed flag. No `version`, `resolved` or `integrity` line changed, so no package moved or was upgraded. `package.json` gains the three scripts and the `vite` entry; the existing scripts are unchanged (the `test:game` line only gains a trailing comma).

## Commands

| Purpose | Command | URL |
|---------|---------|-----|
| Dev server | `npm run dev` | `http://localhost:5173/` (Vite default; the port printed in this run) |
| Build | `npm run build` | writes `dist/` |
| Serve the build | `npm run preview` | `http://localhost:4173/` (Vite default; the port printed in this run) |

`dist/index.html` loads a module script, so it must be served over HTTP (`npm run preview`). Opening it from `file://` is not supported and was not tested.

## a) Compilation

| Command | Exit code |
|---------|-----------|
| `npx tsc -p tsconfig.json` | 0 |
| `npx tsc -p tsconfig.game.json` | 0 |
| `npm run build` (runs `tsc -p tsconfig.game.json --noEmit` first) | 0 |

## b) Fake-DOM unit test (`src/game/ui/shell.test.ts`)

This is a unit test in Node against a small hand-written fake `Document`. It is NOT a browser test. It does not exercise real focus, layout, CSS or event dispatch. No DOM library is installed (happy-dom is task 21.1).

It checks:
- a source scan of the non-test files in `src/game/ui` (`.ts`, `.html`, `.css`) finds no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `DOMParser` or `createContextualFragment`, and no assignment to `window` or `globalThis` properties;
- `mountShell` renders `QRoker`, the language label, the options `English` and `한국어`, the banner (`임시 점수 규칙` for a Korean browser, `provisional scoring` otherwise) and the shell notice;
- a simulated `change` event switches the texts, `documentElement.lang` and the title, and creates or replaces no element (a proxy for focus preservation);
- an unsupported `change` value is ignored;
- the fake throws on any `innerHTML` access, and none occurs;
- the shell creates no `button`, `a`, `input`, `canvas` or `video` element.

Result: 9 tests passed (`npx vitest --run src/game/ui`, exit 0).

## c) Build output

`npm run build`, exit 0. Files in `dist/` (sizes in bytes as written to disk):

| File | Bytes |
|------|-------|
| `dist/index.html` | 630 |
| `dist/assets/index-BtZc17gn.js` | 6732 |
| `dist/assets/index-DIvYvCJW.css` | 1111 |

`dist/index.html` references `./assets/index-BtZc17gn.js` and `./assets/index-DIvYvCJW.css` (relative paths, from `base: './'`). `dist/` is ignored by git (`git check-ignore -v dist/index.html` matches `.gitignore:7:dist/`); `.kiro/` is not ignored.

## d) HTTP loading evidence (not a browser test)

Plain HTTP requests with `Invoke-WebRequest`. They show that the servers answer; they do not show that the page renders or runs.

Dev server (`npm run dev`, port 5173), all status 200:

| URL path | Content-Type |
|----------|--------------|
| `/` | text/html |
| `/main.ts` | text/javascript |
| `/shell.ts` | text/javascript |
| `/shell.css` (requested with `Accept: text/css`) | text/css |
| `/@vite/client` | text/javascript |
| `/@fs/.../src/game/i18n/index.ts` | text/javascript |
| `/@fs/.../src/game/i18n/strings/common.ts` | text/javascript |
| `/@fs/.../src/game/i18n/strings/errors.ts` | text/javascript |

Preview server (`npm run preview`, port 4173), all status 200: `/` (text/html), `/assets/index-BtZc17gn.js` (text/javascript, 6732 bytes), `/assets/index-DIvYvCJW.css` (text/css, 1111 bytes). Both servers were stopped after the check.

## e) Real browser check (headless Edge through the DevTools protocol)

What was done: for each of the dev server and the preview server, and for each of two browser locales, a fresh headless Edge (`--headless=new`, `--lang=<locale>`, a temporary profile, `Emulation.setUserAgentOverride` with `acceptLanguage`) opened the page. A temporary Node script (not committed) recorded console messages, exceptions, `Log.entryAdded` entries, network failures and response statuses, and read `<html lang>`, the title, the body text and `navigator.languages`. Then the script focused the language `<select>` and sent an `ArrowUp` or `ArrowDown` key event with `Input.dispatchKeyEvent` (trusted key input to the focused control; the script-based `change` fallback was not needed). It re-read the same values and checked that the select was still `document.activeElement`. Each browser process was stopped by the script; no Edge process remained.

| Server | Locale (`navigator.languages`) | Initial `<html lang>` | Initial banner | Key sent | After: `<html lang>` and banner | Title | Select focused after |
|--------|-------------------------------|-----------------------|----------------|----------|---------------------------------|-------|----------------------|
| dev | `ko-KR` | `ko` | `임시 점수 규칙` | ArrowUp | `en`, `provisional scoring` | `QRoker` | yes |
| dev | `en-US` | `en` | `provisional scoring` | ArrowDown | `ko`, `임시 점수 규칙` | `QRoker` | yes |
| preview | `ko-KR` | `ko` | `임시 점수 규칙` | ArrowUp | `en`, `provisional scoring` | `QRoker` | yes |
| preview | `en-US` | `en` | `provisional scoring` | ArrowDown | `ko`, `임시 점수 규칙` | `QRoker` | yes |

Also observed in all four runs: no exceptions, no `error` console messages, no `Log` error entries, no failed network requests and no response with status 400 or above. The only console messages were the two Vite client messages in dev (`[vite] connecting...`, `[vite] connected.`); the preview runs had none. The page had no `<button>` elements. Every own property of `window` also exists on a fresh iframe window, so the shell added no global. An earlier dev run, made before the empty favicon link was added to `index.html`, logged one `404` for `/favicon.ico`; the later runs listed above do not.

NOT done: no screenshot or visual review by a human, no Chrome or Firefox run, no mobile device or touch check, no screen reader check, no physical mouse click or key press (key events came from the DevTools protocol), no check of the page opened from `file://`, no contrast or layout measurement.

## f) to h) Test suites and repository state

| Check | Result |
|-------|--------|
| `npm run test:game` | exit 0, 41 test files and 952 tests passed |
| `npx vitest --run src/game/boundaries.test.ts` | exit 0, 47 tests passed |
| `npx vitest list --filesOnly` | lists 66 test files; the same 66 `*.test.ts` files exist under `src` and `scripts`, so Vitest still uses `vitest.config.ts` (root and `include` unchanged) |
| Frozen codebook SHA256 (`src/optical/codebook.v1.json`) | `515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4`, unchanged |
| `vitest.config.ts`, `tsconfig.json`, `tsconfig.game.json`, `src/optical` | no diff |

The full `npm run test:ci` was not run for this task.
