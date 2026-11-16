# Practice Mode P1 acceptance audit — Issue #8

Date: 2026-11-16 (Asia/Seoul). Auditor and new implementation tool: **Codex**.
Base: `3ca08b98ce15a876cf4c7480f465e8892ce1a136`; branch:
`codex/issue-8-verification`. Test/config commit: `42a68aa`.
Scope: [Issue #8](https://github.com/goalan70-eng/qroker-kiroween/issues/8),
playable-game Task 21.3 and Task 22. No rule, engine, AI strategy, optical,
codebook or historical Kiro record was changed.

## Audit findings

- The initial worktree was clean. Task 21.1's production composition and mount
  helpers and Task 21.2's eight happy-DOM full-game tests existed and were retained.
- The latest base commit's subject says privacy/accessibility smoke tests were
  added. Its actual diff changes only `.kiro/specs/qroker-game/design.md` (one
  line); `src/game/ui/privacy-a11y.test.ts` was absent. A commit subject is not
  proof of implementation. The historical design change was preserved.
- Existing controller/component tests and `e2e/game.spec.ts` /
  `e2e/persistence.spec.ts` already implemented and tested much of the behavior.
  This was primarily missing acceptance verification and documentation, not a
  reason to reimplement the application.
- [Main run 43743550265](https://github.com/goalan70-eng/qroker-kiroween/actions/runs/43743550265)
  for the exact base SHA was directly queried through GitHub: **completed,
  success**. Its verification job and type checks, codebook, full test suite,
  build and browser steps succeeded. That run did not contain the missing tests.
- `ui/smoke.test.ts` ends with an ordinary empty line. No whitespace defect
  warranted changing it; current `git diff --check` passes.

## Task 21.3 / placement acceptance mapping

All new happy-DOM assertions are **fake-DOM evidence**, not browser layout,
native keyboard activation, inertness, pointer capture or real touch evidence.

| Criterion | Current evidence / status |
| --- | --- |
| Two-human private hand-over and Guess entry | `privacy-a11y.test.ts`: complete two-human game, both gate purposes, authorized viewer continuity, old private nodes removed, empty gate/form DOM. Verified. |
| Gate wording | Approved Task 19.4 / `nextGate` exempts the initial starter and the same person retaining the device. Task 21.3's "before each" wording is interpreted through that explicit contract. No extra gates or rule changes were introduced. |
| 64 named Board buttons, arrow focus, live region | `privacy-a11y.test.ts`: unique nonempty names, roving focus, live text. `keyboard.spec.ts`: real Chromium key events and focus. Verified within these limits. |
| Korean switch without state loss; illegal-cell errors in both languages | `privacy-a11y.test.ts`: unchanged PlayerView/action count while changing language, localized occupied-cell alert. Verified. |
| Invalid Guess | Two-human game rejects out-of-range input without an Action; existing `smoke.test.ts` also covers missing, fractional and out-of-range values. Verified. |
| Remount/resume and corrupt save | New happy-DOM remount preserves view/count and continues; corrupt-save notices in both languages contain no corrupt payload. Existing Chromium A–F suite exercises real localStorage/reload, two/four-human gates, corruption and storage failure. |
| No AI Guess text | New test injects a deterministic AI Guess sentinel, asserts it was actually submitted, scans markup/attributes/hidden nodes and input value properties throughout the game. Documented public numeric fields are excluded from the numeric scan because a public score/sum can equal a Guess. This is regression coverage, not a proof against all possible leaks. |
| Coordinate-based drop, overlay exclusion, cancellation, click suppression and one explicit confirm | `placement-dom.test.ts`: stubbed hit testing, captured-target mismatch, invalid/outside/overlay drops, pointer cancellation/lost capture/Escape, generated click vs new press, double activation. Verified without real capture/touch claims. |
| Stale drafts and private identities | Existing controller model tests retained; new DOM tests cover turn/card removal, restart, abandon, dispose and viewer hand-over/gesture invalidation. Hidden cell/card/marker attributes, classes and text are constrained to public data; raw CardIds are excluded from markup/ghost. Verified. |
| Position-first keyboard and rotation | New fake-DOM test covers reducer/adapter path; real Chromium keyboard test covers arrow navigation, selection, rotation, Escape, focus retention and confirmation. Verified. |

The new suites contain **19 tests** (5 privacy/a11y + 14 placement DOM).
The independent Codex reviewer identified a gap in the hidden-node attribute
scan; the final assertions now constrain every hidden cell/face/marker
attribute and its text. The strengthened tests passed. No product bug requiring
a gameplay change was independently reproduced.

## Commands actually executed

Environment: Windows, Node.js **24.20.0**, npm **11.19.0**;
real headless **Chromium 159.0.8154.6**, one Playwright worker. Existing locked
dependencies and installed Chromium were used; a fresh `npm ci` / browser
installation was **not** performed in this audit.

| Command / run | Exit | Result |
| --- | --- | --- |
| `npm run typecheck` | 0 | Passed |
| `npm run typecheck:game` | 0 | Passed, including new fake-DOM tests |
| `E2E_SEEDS=200 npm test` (native Windows execution) | 0 | **109 files, 3,038 tests passed; 60.17 s** |
| `E2E_SEEDS=200 npm run test:ci` (native Windows execution) | 0 | **109 files, 3,038 tests passed; 91.08 s**, existing four-worker limit |
| New fake-DOM suites, `npx vitest run src/game/ui/privacy-a11y.test.ts src/game/ui/placement-dom.test.ts --maxWorkers=2` | 0 | 19 passed. After review strengthening, both suites passed again; final extra text assertion: placement suite 14/14 passed. |
| `npm run build` | 0 | Vite production build, 82 modules; `dist/` generated |
| `npm run check:codebook` | 0 | Regenerated codebook byte-identical; check mode, no codebook rewrite |
| `npx playwright test` (final dedicated development run) | 0 | **41 passed, 5.5 min**, including new keyboard test and existing playground |
| `PLAYWRIGHT_PREVIEW=1 npx playwright test game.spec.ts persistence.spec.ts keyboard.spec.ts` | 0 | **36 passed, 5.3 min**, fresh preview on 4173; full game, save/resume, privacy, keyboard and small viewports. Development-only playground intentionally not selected. |
| Workflow command-only Hook validation and Node self-tests | 0 | Six Hook definitions valid; automation self-tests 6/6, OpenAI review utility self-tests 4/4; no API request sent |
| `git diff --check` and protected-path diff | 0 | Clean whitespace; no changes to `.kiro/` or `src/optical/` |

`E2E_SEEDS=200` runs all six strategy/visibility configurations over seeds
0–199: **1,200 complete headless engine games**, plus the existing replay and
property checks. These are model tests, not 1,200 browser games. Properties
1–29, including persistence 27/28 and localization 29, remain in the existing
suite; no tests were removed, skipped or given longer timeouts.

### Earlier failures and their limits

1. Initial sandboxed `npm run test:ci`: **exit 1**, 107 files, 3,014 passing /
   5 failing tests (182.01 s). Optical `detect.test.ts` fractional-scale test
   exceeded 5 s; two robustness-script atomic renames in the sandbox temp path
   failed with `UNKNOWN`, followed by two dependent assertions. This was before
   adding the new tests. The same two files passed **41/41** with one worker
   and a workspace temp directory; the complete native-host runs above also
   passed. This supports an environment/load sensitivity diagnosis, not a
   permanent fix or a claim of universal stability. Worker/timeouts/test code
   were not changed to hide the result.
2. Initial sandboxed Playwright waited without progressing and was interrupted
   (exit 1). Native local-server/browser execution proceeded normally.
3. First native browser run: **exit 1, 39 passed / 1 failed** (6.0 min).
   A concurrently launched keyboard probe used the same `test-results/`
   directory and removed a trace needed by context teardown (`ENOENT`). This
   was an audit orchestration mistake, not a reproduced application assertion
   failure. A dedicated, non-overlapping final run passed all 41 tests.

Logs are retained locally under ignored `.vitest/issue-8-*.log`; these are not
public CI artifacts. Failed-run artifacts may be replaced by subsequent runs.
The results and limitations above are the committed evidence record.

## Definition of Milestone P1 (Task 22.2)

| Definition item | Status and evidence |
| --- | --- |
| 1. Setup to ranking, one human + three AI, provisional scoring banner | Verified by existing six happy-DOM seed/mode games and real Chromium full-game automation. BEGINNER and ADVANCED coverage also exists in model tests. No human manual playthrough in this audit. |
| 2. Private Guess/gate, no AI Guess display, public reveal and points | Verified by the acceptance suites above within their stated evidence classes. Honor-system privacy; browser storage is not secret. |
| 3. Seed, rematch/replay, versioned resume | Verified by happy-DOM and real Chromium development suites; preview result recorded above. |
| 4. Development and built/static serving, standalone instructions | `docs/practice-mode.md` added; build, development and fresh built-preview Chromium runs passed. Fresh install/static server other than Vite not independently exercised. |
| 5. At least 200 Seeds, no illegal Action/invariant/termination failure | Verified: N=200 in every configuration, 1,200 engine games. |
| 6. Full-game and privacy/accessibility happy-DOM smoke | Verified: retained Task 21.2 and added Task 21.3/placement suites. |
| 7. P1 properties, boundary/localization tests, unchanged passing optics | Verified in both complete native Vitest runs; optical/codebook protected paths unchanged. |

**Task 22 is not signed off as fully accepted.** Its explicit human manual
game in `npm run dev` and human manual game in `npm run preview` were not
performed. Automated full-game runs are labeled automation. Kiro task
checkboxes (21, 21.3, 22, 22.1, 22.2) were left unchanged; this report records
what Codex actually verified without inventing a Kiro execution.

Other unverified scope: real-device touch and scrolling, the latest-two-version
Chrome/Firefox/Safari matrix, screen-reader behavior, the entire manual
responsive matrix (only automated 320×640, 390×844 and 1280×800 scenarios),
offline/PWA (P2), physical print/camera performance, final score balance,
public deployment and final submission packaging. At narrow heights the
placement controls require vertical scrolling; tested mobile runs had no
horizontal overflow. No branch was merged and no application was deployed or
published by this audit; the review PR is the only requested remote contribution.

Contribution provenance and commit/PR references are in
[the development log](kiroween-development-log.md).
