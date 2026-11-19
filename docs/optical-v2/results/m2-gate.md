# M2-GATE — Gate 2 evidence and status

| Field | Record |
| --- | --- |
| Milestone | V2-M2 only |
| Gate status | **Blocked** |
| Go_No_Go_Outcome | None assigned. The pre-registered rule requires evidence and decisions that are still open. |
| Date and producer | 2026-11-19 KST, Codex |
| Evidence class | EC 1, review of the results and owner decision records |
| Commands and environment | Commands below. Windows 10.0.26300 x64, Node v24.20.0, npm 11.19.0, Git 2.54.0.windows.1, Vitest 5.1.0. |
| Revisions and samples | M2 parent ab159353c61a4959c75267092585b96ed167e70e, exact V1 pin ddad4473f2a30d56e033d578c7bff8263ac4a864. Seed N/A. Samples: M2-PREREG, M2-FEASIBILITY, M2-V1-SHA, M2-V1-DIFF, M2-V1-TESTS-A/B. |
| Route | Stop at V2-M2 with the feasibility evidence recorded. V2-M3 requires a continuing Gate 2 outcome and separate dated authorization. |

[Gate 1 R3](m1-gate-r3-2026-11-19.md) was GO for separately authorized V2-M2. O-1 and O-2 remain dated 2026-11-19 and unchanged. The owner's new instruction authorizes only this milestone.

## Apply the pre-registered rule

The [pre-registration](m2-preregistration.md) and [M2-FEASIBILITY](m2-geometry-feasibility.md) support all 16 classes and a nominal OFF witness. The trace fails the proposed half-turn limits at both resolutions. An abstract half-turn-symmetric ornament establishes geometric possibility, while no actual redesign or OFF-only route has been accepted by the owner. No numerical tolerance has owner approval. C4 and O-8 also remain open. The existing V1 timeout evidence includes a failed exact-pin invocation as documented below. These results leave Gate 2 blocked.

| Decision | Status and scope |
| --- | --- |
| Decoration route and O-3 | Decide whether to continue with OFF alone or request a point-symmetric or frame-only redesign. The lower-risk proposal is OFF. A redesign route requires the dated O-3 decision and a record of the selected alternative before a continuing redesign outcome can be recorded. |
| C4 / OP-5.5 | Record the named decider and choose decoration in the mirrored optical layer or face-local artwork. Ideal mirrored positions were established under the former option. |
| O-8 / C11 | Confirm card-index clearance and whether sharing its area is allowed. The 16-module example is a study candidate. |
| OP-2.4 / OP-4.2 | Review the proposed difference tolerances and layout conditions before treating the results as accepted criteria. No product threshold was approved. |
| O-5 | Open. Required before publishing any new artwork or trace and before the applicable decoration phase. Original comparison under owner supervision was not performed. |
| O-7 | Default recorded: “inside the assembled marker”. Non-blocking. |

## Preservation evidence

**M2-V1-SHA (EC 1).** The expected and observed frozen commit-blob SHA-256 is 515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4. The pinned LF worktree also passed the existing codebook regeneration check.

**M2-V1-DIFF (EC 1).** The preservation command returned an empty protected diff. The M2 commit range is restricted to additions under the two allowed paths, with the original SVG and .kiro tree identical to the PR #24 parent.

~~~console
node scripts/optical-v2/check-v1-preservation.mjs ddad4473f2a30d56e033d578c7bff8263ac4a864 HEAD
git diff --name-status ab159353c61a4959c75267092585b96ed167e70e HEAD
~~~

**M2-V1-TESTS-A/B (EC 2).** Codex ran the existing suite twice on the unchanged, detached LF V1 checkout of the exact pin. Top-level seed N/A. Both discovered 109 files and 3,038 tests with four workers and unchanged timeouts. A/B are invocation identifiers, not optical design candidates.

~~~console
npm run check:codebook
npm run test:ci -- --reporter=dot --reporter=json --outputFile=test-results/m2-gate2-vitest.json
npm run test:ci -- --reporter=dot --reporter=json --outputFile=test-results/m2-gate2-vitest-repeat.json
~~~

| Invocation | Status and counts | Workspace-local JSON SHA-256 |
| --- | --- | --- |
| A | Exit 1, 3,036 passed, 2 timed out, 0 skipped, 140.67 s | 45240e0f5d86bc0adde8d0c4a80f70b3479654947cb0fe23996eab71bce40c2a |
| B | Exit 0, 3,038 passed, 0 failed, 0 skipped, 81.31 s | 46db862aa52d9d66fdae8dc285be3c793eeac571b55386ee7a822da0fa9a8e07 |

Test A failed the 5 s limits for the blurred non-integer scaling fixture (5.468 s) in src/optical/detect.test.ts and the rotated-card-centre fixture (5.327 s) in src/optical/testing/physical-card.test.ts. Record both invocations under the reproducibility rule in Requirements 18.9 and 18.12. The repeat has no assertion or timeout failures, and the changing counts leave a timing-sensitive result visible. Hosted [PR #24 head CI](https://github.com/goalan70-eng/qroker-kiroween/actions/runs/44469913867) also failed those two optical timeouts with 3,017 passing and skipped browser steps on its own merge tree. Local B does not close that failure.

Unrun: V1 Task 7.2 **unevaluated**, V1 Milestone 8 **unevaluated**, Playwright, real-device and print qualification, readiness of any redesigned artwork, and every later V2 milestone. The comparison label remains **unevaluated V1 baseline (synthetic)**. The intended continuous square remains a target under real print and placement.
