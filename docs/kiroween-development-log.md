# Kiroween development provenance

Record actual tools and evidence. A task checkbox, commit subject or presence
of a Spec is not proof of which assistant executed an implementation. Do not
rewrite history or relabel Codex work as Kiro work.

## Baseline retained — directly inspected on 2026-11-16

- Owner-reported history: Kiro was the primary specification-driven tool and
  produced genuine specifications, hooks, task histories and implementation.
  This audit did not inspect original Kiro session transcripts and does not
  independently certify the generating tool of every historical commit.
- Directly verified artifacts: root `.kiro/specs/` and `.kiro/hooks/`, approved
  playable-game requirements/design/tasks, existing engine/UI/persistence,
  `a02f4cb` (happy-DOM composition/helpers) and `43a6357` (full-game smoke tests).
- Baseline `3ca08b9` has a privacy-test commit subject but actually changes only
  `.kiro/specs/qroker-game/design.md`. No corresponding privacy acceptance
  file existed. Preserve the commit and its change; do not infer missing work
  from its subject. Existing Kiro artifacts and task checkboxes remain intact.
- Main CI [run 43743550265](https://github.com/goalan70-eng/qroker-kiroween/actions/runs/43743550265)
  directly reported success for that base SHA. That is CI evidence for the
  baseline, not evidence that the missing acceptance test existed.

## 2026-11-16 — Issue #8: Task 21.3 audit and P1 evidence

- Issue: [#8](https://github.com/goalan70-eng/qroker-kiroween/issues/8).
- PR: [#12](https://github.com/goalan70-eng/qroker-kiroween/pull/12) (draft;
  no merge). PR-head GitHub Actions are separate from the successful main run
  and local checks above; their result was not yet available when this entry
  was finalized.
- Actual implementation and documentation tool: **Codex**. No Kiro execution
  occurred during this task; no existing work is newly attributed to Kiro.
- Supporting tools: Git, GitHub connector (Issue/CI inspection and PR),
  TypeScript, Vitest, happy-DOM, Vite, Playwright and installed Chromium
  159.0.8154.6. A separate Codex reviewer inspected tests read-only and helped
  strengthen the hidden-DOM schema assertions. No paid model API calls or
  Kiro credit-consuming commands were made.
- Files changed:
  - `src/game/ui/privacy-a11y.test.ts`: five missing acceptance tests using
    existing production composition and mount helpers.
  - `src/game/ui/placement-dom.test.ts`: fourteen IC-11 fake-DOM adapter/privacy
    tests; no new gameplay implementation.
  - `e2e/keyboard.spec.ts`: real Chromium keyboard/focus regression coverage.
  - `playwright.config.ts`: opt-in fresh production preview on 4173, retaining
    the normal development suite, its assertions, worker limit and timeouts.
  - `docs/practice-mode.md`: standalone English run/test/privacy/OQ guide.
  - `docs/practice-mode-p1-report.md`: requirement-by-requirement audit,
    executed commands, earlier failures and verification limits.
  - `docs/browser-testing.md`: correct obsolete shell-only scope; document preview.
  - `README.md`: link the guide, report and provenance log.
  - This provenance file.
- Tests: both complete `E2E_SEEDS=200` Vitest runs passed (109 files / 3,038
  tests, 1,200 headless games); both type checks, build, codebook check, Hook
  validation and 10 Node self-tests passed. Final dedicated development
  Playwright run passed 41 tests; fresh built-preview run passed 36 tests.
  Targeted final privacy/placement assertions passed after review.
- Evidence and limitations: initial sandbox timeout/temp-rename failures and
  a browser artifact-directory collision are recorded, not suppressed.
  Fake-DOM, model, Chromium automation and emulated viewport/touch evidence
  are separated. Human manual dev/preview games, real devices, Firefox/Safari,
  offline and phone cameras remain unverified. Task 22 is not signed off.
- Preserved: all `.kiro/`, `src/optical/`, frozen codebook, game rules, engine,
  production UI, AI strategies, dependency lockfile and unrelated history.
- Commit references: test/config work `42a68aa`; acceptance guide/report and
  provenance `eaa0a46`; PR cross-reference is the subsequent documentation
  commit (`git log -- docs/kiroween-development-log.md`).
  No amend/rebase/history rewriting is used. Branch remains for review;
  no merge, application deployment or application publication is authorized by this entry.

## 2026-11-16 — Owner-approved provisional score revision

- Context: [Issue #9](https://github.com/goalan70-eng/qroker-kiroween/issues/9).
  The owner explicitly requested `10 / 5·4·3·2·1 / 5` in this chat. This
  authorizes the default-score revision, not completion of the balance study.
- Implementation tool: **Codex**. Supporting tools: TypeScript, Vitest,
  happy-DOM, Vite, Playwright/Chromium 159.0.8154.6 and Git/GitHub. No Kiro
  execution or paid model API request occurred.
- Changed files: `src/game/core/score.ts` (new defaults, provisional flag kept),
  `src/game/core/score.test.ts` (exact/error/cutoff/bonus contract),
  `src/game/persistence/storage.test.ts` (legacy-score save round trip),
  `src/game/ui/overlays/help.test.ts` (derive prohibited score tokens rather
  than pin the obsolete defaults), `.kiro/specs/qroker-playable-game/design.md`
  (owner-authorized numeric examples and compatibility note),
  `docs/practice-mode.md` (current points table) and this log.
- New games: exact Guess 10; absolute errors 1–5 score 5,4,3,2,1; error ≥6
  scores 0; empty-Hand bonus +5. Existing saves retain their serialized
  ScoreConfig and already-earned scores. Replay semantics, RULES_VERSION,
  save format, game flow, optical codebook and Kiro task history are unchanged.
  Earlier diagnostic reports are historical evidence and were not rewritten.
- Verification: new contract tests first failed on the old defaults (7
  expected failures); after the change, root/game type checks and build
  passed. `E2E_SEEDS=200 npm run test:ci`: **109 files / 3,048 tests passed**
  (89.64 s), including 1,200 headless games. Fresh built-preview Chromium:
  **4/4 passed** (1.4 min), covering full game, public reveal/scoring,
  save/resume and calibrated Guess scoring after reload. Command:
  `PLAYWRIGHT_PREVIEW=1 npx playwright test game.spec.ts persistence.spec.ts --grep 'one human and three BEGINNER|earned and cumulative points|calibrated Guesses|Continue restores Board'`.
- Limits: no claim that these values are balanced; Issue #9's comparative
  experiments remain outstanding. No new human/device or Firefox/Safari
  testing, merge or deployment. Branch `codex/issue-9-score-table` is based on
  the unmerged Issue #8 branch so that the existing audit PR remains separate.
- Commit: `5d75eee`. PR: [#13](https://github.com/goalan70-eng/qroker-kiroween/pull/13)
  (draft, stacked on PR #12; no merge). The successful local checks above are
  distinct from the new PR-head GitHub Actions result, which is not yet verified.

## 2026-11-20 — Offline Android companion prototype

- Context: owner-requested Android prototype using the local 30 mm uniform-bar
  layout. Related optical research: [Issue #16](https://github.com/goalan70-eng/qroker-kiroween/issues/16).
  The source and evidence are on `codex/android-offline-companion`.
- Actual implementation and test tool: **Codex**. Supporting tools: Git,
  PowerShell, Python, JDK 21, Android SDK Build Tools and ADB. The historical
  handoff identifies **Kiro** as the author of sections 0–10. The Codex
  implementation and validation appear in subsequent sections.
- Files: `prototypes/android-offline-companion/` contains the native Java
  app, build and test scripts, and text evidence. The companion handoff is
  `docs/optical-v2/android-prototype-handoff.md`.
- Verification: the APK built and its signature verified, 19 JVM regression
  checks passed, and the 480-row deck audit reproduced from the imported
  source. In Android API 36 with networking disabled, a synthetic camera
  sequence exercised scoring, a missing card, and restoring two rounds and
  13 points after restarting the app.
- Evidence and limits: recognition results are from synthetic inputs. Real
  phone cameras and printed cards await testing. The prototype build uses
  local 30 mm data and fixtures. Artwork, print assets, APKs and signing keys
  are held locally. Optical V2 acceptance and scoring decisions remain open
  as recorded in the handoff.
- Source and evidence commit: `8d91e53`.

## 2026-11-20 — Android confirmation race

- Codex added the device-side cancellation and duplicate-scoring tests in
  `dcc17f8`. On the original score code, delaying the result of a changed
  scene reproduced two stale 10-point writes, one for a missing card and
  one for a different complete group.
- Codex changed the Android companion to confirm the same group on a new
  Camera2 capture requested after the tap. The code and tests are under
  `prototypes/android-offline-companion/`. The report records the capture
  boundary and the remaining physical-test limits.
- Supporting tools: JDK, Android SDK, PowerShell, ADB and Android API 36
  emulator. The APK build and signature verification succeeded. All 33 JVM
  checks passed. The offline emulator recorded 10 points, blocked repeats
  and restored the score after restarting the app.
- Evidence: the delayed-result race was controlled in the JVM. The emulator
  exercised camera confirmation and score persistence with a synthetic scene.
  Real phone and printed-card timing remains unmeasured.

## 2026-11-20 — Android confirmation capture matching

- Codex reproduced a dropped-confirmation case at `3b26ecb`. A later
  preview could supply the submission number when the requested image
  was unavailable. The companion now matches the requested exposure by
  its exact timestamp. It buffers a small number of early image deliveries
  and prioritizes the matched image over preview decoding.
- Changes: `ConfirmationFrame.java`, `LiveCamera.java`, `OfflineTest.java`
  and the guess-flow report within `prototypes/android-offline-companion/`.
  The workspace-level `AGENTS.md` separately records the read-only rule
  for Kiro files in all local checkouts.
- Supporting tools: JDK, Android SDK, PowerShell and Android API 36
  emulator via ADB. The JVM check for the dropped image failed before
  the fix. After the change 37 JVM checks passed, the APK signature
  verified, and the offline emulator scored and restored one 10-point
  round while blocking repeats. Physical camera timing remains unmeasured.
