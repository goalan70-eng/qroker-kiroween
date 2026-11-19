# M1-V1-TESTS — pinned V1 regression command

| Field | Record |
| --- | --- |
| Outcome | **Pass**. 109 files and 3,038 tests passed, 0 failed, 0 skipped, 0 todo. Exit 0. Vitest duration 116.94 s. |
| Evidence | EC 2, existing fixture-driven Node test suite. |
| Date and producer | 2026-11-19 KST, Codex. |
| Commit and worktree | `ddad4473f2a30d56e033d578c7bff8263ac4a864`, detached canonical-LF checkout. |
| Environment | Windows `10.0.26300` x64, 12 logical CPUs visible, Node `v24.20.0`, npm `11.19.0`, Vitest `5.1.0`, four workers. No artificial CPU restriction or concurrent audit test process. Host background load was not sampled. |
| Command | `npm ci --no-audit --no-fund` then `npm run test:ci -- --reporter=default --reporter=json --outputFile=test-results/m1-main-vitest.json` |
| Seed and samples | Top-level seed N/A. Fixture seeds as defined in the pin. All 109 test files discovered by the pinned Vitest config. No test filter. |
| Raw evidence | Workspace-local `qroker-v1-m1-baseline-lf/test-results/m1-main-vitest.json`, SHA-256 `3bb196afaaa0207d0ab4dd027a274f9e02b4617c4f135f0cc2914917bfb14d18`. The raw reporter contains local absolute paths and was kept out of Git. |
| Failed items | None in this invocation. See the separate CI observations below. |
| Unrun items | Playwright, real-device capture, the V1 Task 7.2 full sweep and V1 Milestone 8. |

By test path: `src/optical/` 22 files and 678 passing tests, including the detector, group rejections, double-sided and physical-card fixtures. `scripts/` 3 files and 17 passing tests, including robustness runner smoke and reproducibility tests. `src/game/` 84 files and 2,343 passing tests, including engine layout parity. Existing assertions, worker count and timeouts are unchanged.

### Load-sensitive cases and known behavior

| Fixture identifier or title | Local duration | Prior evidence |
| --- | ---: | --- |
| `src/optical/detect.test.ts` / `blurred non-integer scales: exact for effective modulePx >= 2.5 (sizePx >= 17.5), spec range 0.5..3x of modulePx 8 included` | 3.310 s | Documented load sensitivity, all three red CI runs below. |
| `src/optical/testing/physical-card.test.ts` / `a rotated card is rotated about its centre: its corner moves as the clockwise rotation predicts` | 3.233 s | Documented load sensitivity, all three red CI runs below. |
| `src/game/ui/privacy-a11y.test.ts` / `gates every human Hand and Guess, clears private DOM and never renders AI Guess text` | 2.079 s | `main` timeout. The earlier isolated CI investigation also reproduced a timeout under a one-CPU restriction. |
| `src/optical/testing/physical-card.test.ts` / `decodeGroup receives only pixels; results are compared with the ground truth afterwards` | 1.723 s | Older contention timeout recorded in the pinned `docs/optical/results/ci-recheck-task7-8.md`. |

The pinned [V1 status, c.10](https://github.com/goalan70-eng/qroker-kiroween/blob/ddad4473f2a30d56e033d578c7bff8263ac4a864/docs/optical/OPTICAL-STATUS.md) documents the two repeatedly affected optical cases. CPU-load sensitivity is supported by historical reproductions and the local pass. Exact CPU contention on the hosted runner was not measured. Its failures are classified as test timeouts, without an observed assertion mismatch. Independently, the passing `geometry-45deg.test.ts` characterizes a known near-45-degree detector limitation in the old detector. Its pass is confirmation of the stated behavior, including selected failures to detect.

### GitHub CI observations, directly read on 2026-11-19 KST

| Run | Tested revision or merge inputs | Full Vitest | Failure classification and browser coverage |
| --- | --- | --- | --- |
| [Main `43824229417`](https://github.com/goalan70-eng/qroker-kiroween/actions/runs/43824229417) | `ddad4473f2a30d56e033d578c7bff8263ac4a864` | 3,035 passed, 3 failed, 0 skipped | Two optical and one privacy test listed above timed out at 5,000 ms. Browser build/install/Playwright skipped. |
| [PR #18 `44338915454`](https://github.com/goalan70-eng/qroker-kiroween/actions/runs/44338915454) | Merge of `7baefca` into `ddad447` | 3,036 passed, 2 failed, 0 skipped | The two optical cases timed out at 5,000 ms. Browser build/install/Playwright skipped. |
| [PR #23 `44457664564`](https://github.com/goalan70-eng/qroker-kiroween/actions/runs/44457664564) | Merge of `b34415a` into `ddad447` | 3,046 passed, 2 failed, 0 skipped | The two optical cases timed out at 5,000 ms. Browser build/install/Playwright skipped. |
| [PR #14 `43797131091`](https://github.com/goalan70-eng/qroker-kiroween/actions/runs/43797131091) | Merge of `a2d3bf3` into `b34415a` | 3,081 passed, 0 failed, 0 skipped | 42 Playwright tests passed on that stack. Historical reference for the alternative detector, not evidence for the pinned `main`. |

V1 Task 7.2 (363,000 trials) is **unevaluated**. V1 Milestone 8 (print and physical) is **unevaluated**. A smoke test for the harness does not execute the full sweep. The V1 Task 7 pass criterion remains unevaluated. Historical synthetic V1 results have their original revision and scope. No real phone, print, cutting, paper opacity, or end-to-end physical result was produced here. Any future V2 comparison must use **unevaluated V1 baseline (synthetic)** until the specified V1 results exist.
