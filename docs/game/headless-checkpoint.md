# Headless game checkpoint (Task 14) - verification record

Scope: Tasks 13.1 (driver) and 13.2 (end-to-end acceptance run, Property 21) of the qroker-playable-game spec. Headless synthetic self-play only; no browser, no real players. Scoring uses DEV_PLACEHOLDER_SCORE_CONFIG (provisional, no balance claim).

## Acceptance evidence

- sim/e2e.test.ts: 6 configurations (ALL_BEGINNER, ALL_ADVANCED, MIXED) x (OWNER_ONLY, FACE_UP), seeds 0..199 in each: 1200 configuration-specific games (1000 unique: the two ALL_BEGINNER configurations play identical games in both visibility modes), 0 failures, 0 rejected actions, 0 invariant violations, 0 replay mismatches (see docs/game/headless-diagnostics.md, section "Counting conventions").
- Two-code batches in that run: 9 configuration-specific games contain one (ALL_BEGINNER seeds 152, 158, 178, 195 in each of its two modes = 8, MIXED / OWNER_ONLY seed 21 = 1), which are 5 unique games. Each of those games has exactly one such batch, so the batch counts are 9 of 6055 batches (configuration-specific) and 5 of 5750 (unique). "5 games out of 1200" mixes a unique numerator with a configuration-specific denominator; use 5 of 1000 unique games or 9 of 1200 configuration-specific games.
- Property 21 (seed 20261321, 150 runs): passed. Coverage: all 16 tier assignments occur (2 registered tiers on 4 seats = 2^4). The figures "71 to 79" are per-(seat, tier) marginals out of 150 games (for example P0: ADVANCED 79, BEGINNER 71), not counts per assignment. The count per assignment was not recorded in the test notes; re-derived by regenerating the inputs with the same fast-check seed and numRuns, it ranges from 2 to 16 games per assignment (mean 9.375, sum 150). The run had 0 batches with two codes.

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

