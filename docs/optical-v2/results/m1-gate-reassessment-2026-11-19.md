# M1-GATE-R2 — Gate 1 reassessment

| Field | Record |
| --- | --- |
| Milestone | V2-M1 |
| Decision | **no-go** |
| Route | Stop: resolve baseline first. |
| Evidence class | EC 1, decision by review of recorded evidence. |
| Date and producer | 2026-11-19 KST, Codex. O-2 is the owner's decision. |
| Inputs and sample IDs | [Original M1 audit](m1-baseline.md), [original Gate 1](m1-gate.md), [policy addendum](../policy-transition-2026-11-19.md), O-1, O-2, M1-R2-SHA256, M1-R2-DIFF and M1-R2-TESTS. Seed N/A. |

The original Gate 1 record is a historical observation. Under the approved, dated O-2 policy, V1 Task 7.2 and V1 Milestone 8 are no longer prerequisites for V2. Both remain **unevaluated**. Their historical evidence and the synthetic comparison label **unevaluated V1 baseline (synthetic)** retain their meanings.

O-1 remains the outstanding owner decision. Codex recommends `ddad4473f2a30d56e033d578c7bff8263ac4a864` as the immutable historical V1 reference. This reassessment uses that exact revision provisionally for the technical checks. A future decision to start V2-M2 requires the dated O-1 record, the dated O-2 decision already on file, a dated Gate 1 `go`, and separately dated owner authorization naming V2-M2. Gate 1 continues to require the applicable regression evidence. V2-M2 remains the next proposed milestone.

## M1-R2-SHA256 and M1-R2-DIFF

Two EC 1 results, recorded 2026-11-19 KST by Codex. Environment Windows x64, Git `2.54.0.windows.1`, Node `v24.20.0`. Seed N/A. Inputs are provisional pin `ddad4473f2a30d56e033d578c7bff8263ac4a864`, original M1 audit `6d6c4e588a64a518bc87a3c5fa9fc26a6a47902e` and the policy commit in [PR #24](https://github.com/goalan70-eng/qroker-kiroween/pull/24). Commands from the policy worktree:

```console
node scripts/optical-v2/check-v1-preservation.mjs ddad4473f2a30d56e033d578c7bff8263ac4a864 6d6c4e588a64a518bc87a3c5fa9fc26a6a47902e
node scripts/optical-v2/check-v1-preservation.mjs ddad4473f2a30d56e033d578c7bff8263ac4a864 HEAD
git diff --diff-filter=MDRT --name-status 6d6c4e588a64a518bc87a3c5fa9fc26a6a47902e HEAD
```

- **M1-R2-SHA256 — pass.** Expected and observed V1 commit-blob SHA-256 `515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4`. Pinned LF checkout also passed `npm run check:codebook`.
- **M1-R2-DIFF — pass.** Protected-path diff `[]`. The original audit files and all pre-existing tracked paths have zero modifications, deletions, renames or type changes in the policy commit. The policy delta consists of the addendum and this record.

Failed items: none for these checks. Unrun: physical print measurements and artifact migration tests.

## M1-R2-TESTS

EC 2, pinned fixture-driven Node suite. Date and producer 2026-11-19 KST, Codex. Exact tested commit `ddad4473f2a30d56e033d578c7bff8263ac4a864`. Environment Windows `10.0.26300` x64, Node `v24.20.0`, npm `11.19.0`, Vitest `5.1.0`, four workers, detached LF checkout. Top-level seed N/A. Samples are all suites discovered by Vitest at the pin, using their original fixtures and per-test seeds. Command:

```console
npm run test:ci -- --reporter=dot --reporter=json --outputFile=test-results/m1-gate1-reassessment-vitest.json
```

**Pass.** Exit 0. 109 test files and 3,038 tests passed, including 678 under `src/optical/`. Failed 0, skipped 0, todo 0. No failing test identifiers. Vitest duration 81.03 s. The counts match the original M1 local run. Workspace-local JSON SHA-256: `a17556c78bac7486cdc0712e46ee69ac61c13ba98bd665c37b0e362985663468`. The JSON includes absolute worktree paths and remains outside Git.

The load-sensitive tests remain documented in the [original test record](m1-v1-tests.md). Unrun in this reassessment: Playwright, the V1 exhaustive sweep, V1 physical validation, and all V2-M2 and later tests.

## Hosted CI readback

On 2026-11-19 Codex retrieved the [original M1 PR #24 CI](https://github.com/goalan70-eng/qroker-kiroween/actions/runs/44459836774) job log (`135343646607`). The workflow checked out merge `767771e` of `6d6c4e5` into `095f70e`. Vitest recorded 3,017 passed, 2 failed, 0 skipped out of 3,019. The two failures were the blurred non-integer scaling test in `src/optical/detect.test.ts` and the rotated-card-centre test in `src/optical/testing/physical-card.test.ts`, both at 5,000 ms. The browser build, Chromium installation and Playwright steps were skipped. The policy change leaves this hosted CI result open. Its workflow merge tree differs from the audited `main` test tree.
