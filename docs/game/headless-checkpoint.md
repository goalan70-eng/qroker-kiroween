# Headless game checkpoint (Task 14) - verification record

Scope: Tasks 13.1 (driver) and 13.2 (end-to-end acceptance run, Property 21) of the qroker-playable-game spec. Headless synthetic self-play only; no browser, no real players. Scoring uses DEV_PLACEHOLDER_SCORE_CONFIG (provisional, no balance claim).

## Acceptance evidence

- sim/e2e.test.ts: 6 configurations (ALL_BEGINNER, ALL_ADVANCED, MIXED) x (OWNER_ONLY, FACE_UP), seeds 0..199 in each: 1200 complete games, 0 failures, 0 rejected actions, 0 invariant violations, 0 replay mismatches (see docs/game/headless-diagnostics.md).
- Property 21 (seed 20261321, 150 runs): passed.

## Full-suite runs (HEAD 729bb43 plus the uncommitted 13.2 files)

| # | Command | CPU load context | Result |
| --- | --- | --- | --- |
| 1 | npm run test:game | 77-97 percent, emulator busy | exit 0; 37 files, 892 tests passed |
| 2 | npm run test:ci (maxWorkers=4) | 86-100 percent, emulator busy | exit 1; 62 files: 2 failed, 3 tests failed, 1584 passed; all 3 are "Test timed out in 5000ms" in src/optical/testing/physical-card*.test.ts |
| 3 | npm test (default workers) | same period | exit 1; 6 files, 8 tests failed, 1579 passed; all 8 are 5000 ms timeouts: 7 in src/optical (physical-card, physical-card.duplex, detect, decode-fragment.bitflip, render) and 1 in src/game/core/deck.properties.test.ts ("conserves the cards of the deck across 32 draws"; 6087 ms) |
| 4 | the failing files alone, vitest --run --maxWorkers=1 (7 files) | load fell to 25 percent | exit not captured; 7 files, 216 tests passed |
| 5 | npm run test:ci | 14-34 percent | exit 0; 62 files, 1587 tests passed, 81.6 s |
| 6 | npm test (default workers) | same period | exit 1; 2 tests failed, 1585 passed: physical-card "rotated card" and detect "blurred non-integer scales", both 5000 ms timeouts |
| 7 | npm test (default workers) | 17-32 percent | exit 0; 62 files, 1587 tests passed, 56.3 s |

Assertion failures: none in any run. Every failure is a "Test timed out in 5000ms" of a CPU-heavy test while many workers (or the Android emulator) competed for the CPU. The default `npm test` uses one worker per core and is the least reliable configuration for these tests; `npm run test:ci` (maxWorkers=4) is the more stable invocation. No timeout was raised and no assertion was weakened. A clean unrestricted `npm test` (run 7) and a clean `npm run test:ci` (run 5) exist for the same code.

## Pending product decision (not granted by this checkpoint)

Task 14 asks whether to keep the placeholder score values for P1 playtests. The project owner instructed continued use of DEV_PLACEHOLDER_SCORE_CONFIG for P1 development and automated playtesting. This checkpoint does not finalize or approve the values and makes no balance claim; approval for human playtests with these values remains a pending decision.

