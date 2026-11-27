# QRoker game (`src/game`)

This folder holds the QRoker game engine and the browser Practice Mode. The spec is `.kiro/specs/qroker-playable-game/` (requirements, design, tasks). The approved rules are in `.kiro/specs/qroker-game/` and are not changed here.

This README documents the module layout and the dependency rules. The boundary test `src/game/boundaries.test.ts` (task 1.3) enforces them.

## Folder layout

```
src/game/
  core/            pure engine (no DOM, no node:, no Math.random/Date)
  ai/              strategies; reads PlayerView only
  sim/             headless harness and simulation interface
  persistence/     save envelope, migration, storage adapters
  i18n/            string tables and lookup (en, ko)
  ui/              DOM layer (Vite root): index.html, main.ts, components/, screens/,
                   overlays/, styles/, audio/, back-marks/, testing/
  README.md        this file
scripts/build-standalone.mjs                  (packages the main offline HTML)
docs/practice-mode.md
```

The main offline deliverable is `QRoker.html`. Installable PWA support and the service worker are planned.

| Folder | Contents |
|--------|----------|
| `core/` | Types, cards, PRNG and seed, geometry, fragment layout, deck, board and placement validator, composite-code detector, draw and turn, score and ranking, rules, state, engine (reducer), view (`PlayerView` projector), replay. |
| `ai/` | `strategy.ts`, `registry.ts`, `random.ts` (BEGINNER) and `heuristic.ts` (ADVANCED). Additional tiers are experimental or planned. |
| `sim/` | `types.ts`, `play-game.ts` and the headless acceptance tests. |
| `persistence/` | `save-format.ts`, `storage.ts`. Storage is injected by the caller. |
| `i18n/` | `index.ts`, `types.ts`, `strings/<area>.ts` (each file exports `{ en, ko }`). |
| `ui/` | Browser UI: `store.ts`, `controller.ts`, `dom.ts`, components, screens, overlays, styles, audio and marked card backs. |

## Allowed imports per folder

| Folder | May import | Must not import or use |
|--------|-----------|------------------------|
| `core/` | `core/` only | `node:*`, DOM globals, `src/optical`, `Math.random`, `Date`, `performance.now`, `crypto` |
| `ai/` | `core/types`, `core/cards`, `core/geometry`, `core/fragment-layout`, `core/board` (pure helpers), `core/score`, `core/prng`, `core/view` (types and `unseenCards`) | `core/state`, `core/engine`, `core/deck`, `core/replay`, `core/rules` internals; the `GameState` type; the same bans as `core/` |
| `sim/` | `core/`, `ai/` | DOM, `src/optical` |
| `persistence/` | `core/replay`, `core/types` | DOM globals (storage is injected), `node:*`, `src/optical` |
| `ui/`, `i18n/` | `core/view`, `core/engine` through `controller` only, `core/types`, `ai/registry`, `persistence/` | `src/optical`, any network API |
| test files | any, but only `core/fragment-layout.parity.test.ts` may import `src/optical` | |

Intended module graph (an arrow means "imports"):

- `ui` imports `ui/controller`, `i18n`, `core/view`.
- `ui/controller` imports `core/engine`, `ai`, `persistence`, `core/replay`.
- `persistence` imports `core/replay`.
- `sim` imports `core/engine`, `ai`, `core/replay`.
- `ai` imports `core/view`, `core/board`, `core/composite-code`, `core/score`.
- `core/view` and `core/engine` import `core/state` and `core/rules`. `core/engine` also imports `core/composite-code`, `core/board`, `core/draw` and `core/turn`, `core/score`, `core/deck`.
- `core/replay` imports `core/engine`.
- `core/composite-code` imports `core/fragment-layout` and `core/board`.
- `core/board`, `core/fragment-layout` and `core/state` import `core/cards`, `core/types` and `core/geometry`.
- `core/deck` imports `core/prng` and `core/cards`.

Other rules the boundary test checks (task 1.3):

- `fetch`, `XMLHttpRequest`, `WebSocket` and `sendBeacon` are prohibited in game runtime modules. The boundary test reserves an exception for a future service worker.
- `node:` imports are banned in `core/`, `ai/`, `persistence/` and `ui/`.
- DOM globals (`window`, `document`, `localStorage`, `navigator`) are banned in `core/` and `ai/`.
- Score tables (array literals assigned to `rewardByError`) exist only in `core/score.ts`.
- `ui/` files other than `ui/controller.ts` import only `ui/`, `i18n/`, `persistence/`, `core/view` and `core/types`; the controller may also import `core/state`, `core/engine`, `core/replay`, `core/prng`, `ai/registry` and `ai/strategy` (rules `ui-internal-import`, `ui-allow-list`, task 16.2).

## `src/optical` is not a dependency

No runtime file under `src/game` (or the game scripts in `scripts/`) may import any module under `src/optical`. The Practice Mode does not depend on `src/optical`, a camera or optical decoding (requirements 12.3, 22.1). The Scoring Companion integration is deferred (requirement 22.3).

The single exception is the test-only parity test `src/game/core/fragment-layout.parity.test.ts` (task 2.4). It compares the game's own fragment table with the corner sets in `src/optical/fragments.ts`. It is not part of any runtime bundle.

Do not edit `src/optical`, `vitest.config.ts` or the frozen codebook as part of game work. The existing optical tests must keep passing (requirement 21.5).

## Determinism rules

`core/` and `ai/` must be deterministic. They must not use `Math.random`, `Date`, `performance.now` or `crypto`. All randomness comes from the seeded PRNG in `core/prng.ts` (`mulberry32`, `mix32`). Time and storage are injected by `ui/`, `persistence/` (adapters) and `sim/`. Running `replay(seed, configuration, actionLog)` must reproduce the same state, and the log includes AI Actions, so replay needs no AI computation (requirement 12.4, 12.5).

`core/` must also not touch DOM globals or `node:` modules, so that the same code runs in Node and in the browser (requirement 12.2).

## Information isolation

`ai/` sees only `PlayerView`, produced by `core/view` (`viewFor(state, seat)`). It must not import the engine state, the deck, the replay, or the rules internals (`core/state`, `core/engine`, `core/deck`, `core/replay`, `core/rules`), and it must not use the `GameState` type. A strategy gets a `decisionSeed` derived through `mix32` and cannot reach the deal or shuffle functions. This design does not claim cryptographic secrecy against code written to cheat.

`ui/` renders from `PlayerView` and the controller. Screen modules do not import `core/state` or `core/engine`.

## Provisional scoring

Score values exist only as `DEV_PLACEHOLDER_SCORE_CONFIG` in `core/score.ts`. This is a development placeholder with `provisional: true`. It makes no balance claim. No other file may contain a score table or score value. The UI shows a "provisional scoring" banner while `scoreConfig.provisional` is true. The owner decides the final values. Completed self-play experiments are documented in `docs/game/`.

## Commands

Commands marked "added by task 1.2" or "added by task 16.1" were added to `package.json` by those tasks.

| Command | Purpose | Status |
|---------|---------|--------|
| `npm test` | Run all tests once (`vitest --run`): optical and game | exists |
| `npm run test:ci` | Run all tests once with `--maxWorkers=4` | exists |
| `npm run typecheck` | Type-check the project (`tsc -p tsconfig.json`; excludes `src/game/ui/**`) | added by task 1.2 |
| `npm run typecheck:game` | Type-check the game including DOM code (`tsc -p tsconfig.game.json`) | added by task 1.2 |
| `npm run test:game` | Run only the game tests (`vitest --run src/game`) | added by task 1.2 |
| `npm run dev` | Serve the app with Vite | exists (added by task 16.1) |
| `npm run build` | Type-check the game and build the hosted version to `dist/web/` | run `npm run preview` to serve it |
| `npm run build:standalone` | Package the marked faces, styles and sounds into `dist/QRoker.html` | requires the local deck |
| `npm run preview` | Serve the built app | exists (added by task 16.1) |

The install, run, build, serve, test and type-check instructions are in `docs/practice-mode.md` (requirement 21.6).
