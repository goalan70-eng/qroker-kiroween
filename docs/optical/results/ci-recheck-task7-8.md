# CI recheck after Task 7 and Task 8.1 (CPU contention evidence)

Synthetic images, not real cameras. Outputs below are summary lines copied from the terminal; the full console streams were not saved.

Conditions: an Android emulator (qemu-system-x86_64-headless, an unrelated application, plus adb) was running continuously. CPU load samples before the runs: 71, 51, 71, 90, 87, 90, 82, 91 percent, and later 93, 91, 91, 94, 94 percent. The machine was not idle, so the instructed single `npm run test:ci` on an idle machine was NOT possible and was not run in the idle form. Unrelated processes were not terminated.

| Run | Invocation | Result |
| --- | --- | --- |
| Task 7 verification | npm run test:ci (maxWorkers=4), emulator active, CPU about 86 percent | 46 files, 1190 tests: 2 files failed, 3 tests failed, 1187 passed; all 3 failures are "Test timed out in 5000ms" (detect.test.ts blurred non-integer scales; physical-card.test.ts rotated card; physical-card.test.ts decodeGroup smoke) |
| Task 7 follow-up | npx vitest --run --maxWorkers=1 src/optical/detect.test.ts src/optical/testing/physical-card.test.ts, emulator active | 2 files, 95 tests passed (26 s) |
| Task 8.1 verification | npx vitest --run --maxWorkers=2 (non-standard invocation, emulator active, CPU 90+ percent) | 48 files, 1242 tests: 2 failed, 1240 passed; both failures are "Test timed out in 5000ms": detect.test.ts blurred non-integer scales, physical-card.test.ts rotated card (213 s) |
| Game suite | npm run test:game | 23 files, 547 tests passed |

Assertion failures: none. Every failure is a 5000 ms timeout of the same load-sensitive tests already documented in docs/optical/results/m5-6-test-suite-stability.md and m6-3-milestone6-validation.md. No assertion was weakened and no optical code was changed. The idle-machine full-suite result for the current HEAD is still outstanding.
