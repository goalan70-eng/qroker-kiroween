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

## 2026-11-16 — Issue #10: optical defect repair and physical-test preparation

- Issue: [#10](https://github.com/goalan70-eng/qroker-kiroween/issues/10).
  The owner requested work on the documented optical risks and confirmed that
  no printer/phone is ready. No actual physical trial was performed or invented.
- Actual implementation/testing/docs: **Codex**, with separate Codex agents
  for detector diagnosis, print generation, photo evaluation and read-only
  review. Supporting tools: Git/GitHub, TypeScript, Vitest, Vite, Playwright
  Chromium 159.0.8154.6. No Kiro execution or paid model API call occurred.
- Detector commit: `17b6926`. Files: `src/optical/detect.ts`,
  `src/optical/testing/{geometry-45deg,issue-10-detector}.test.ts`,
  `scripts/issue-10-detector-validation.ts`, the historical analyzer guard in
  `scripts/geometry-45deg.ts`, `.gitattributes`, and new
  `docs/optical/results/issue-10-detector-*` JSON/Markdown evidence.
  Candidate recovery reuses the existing edge fitter and hull agreement
  checks; it does not lower 0.85 or change radius/group/pixel thresholds.
- Preparation files: `scripts/render-print-sheet.ts` and its tests,
  `scripts/validate-optical-photos.ts` and its tests,
  `tools/optical-image-input.html`, `e2e/optical-image-input.spec.ts`,
  `docs/optical/physical-test-protocol.md`, the empty physical manifest
  template, `docs/optical/OPTICAL-STATUS.md`, npm command aliases in
  `package.json`, and local-capture exclusion in `.gitignore`.
- Verification: `E2E_SEEDS=200 npm run test:ci` passed **112 files / 3,081
  tests** (104.05 s, native Windows execution, no final skips), including
  1,200 existing headless game simulations. Both type checks, production build
  and byte-identical codebook check passed. Real Chromium converter test:
  **1/1 passed** (4.7 s runner), exact image pixels, ROI coordinates/mean,
  downloaded PGM and no upload request verified.
- The new positive 45-degree regressions first failed on the old code (3 RED,
  5 existing controls passed). An initial rescue variant changed disk-negative
  behavior and was rejected. Final paired **876-image** experiment against
  `3ca08b9`: independent positives 225/252 → 252/252, pinned 4/12 → 12/12,
  524 selected incomplete/silhouette/two-or-three-bit negatives still rejected,
  and 16 3×3 controls unchanged. The default-radius-1 check of the deliberately
  selected old 40 counterexamples still has 10 wrong acceptances (four-bit
  damage); radius 2 still has 40. These findings are preserved, not operational
  rates and not a guarantee against arbitrary corruption.
- `npm run render:print -- --out-dir .optical-physical/print --module-mm 1.5875 --dpi 300`
  generated 12 A4 SVG/PNG face sheets, all 208 markers checked from the actual
  annotated output PNGs. Automated print tests additionally cover 1.5/2 mm,
  physical units/DPI, deterministic output, front/back imposition and existing
  physical flip semantics. Visual inspection of the generated first page was
  performed. Local ZIP integrity checked (12 PNG + 12 SVG, 29 entries including
  protocol/template/converter/instructions/manifest).
- End-to-end photo CLI smoke used two **synthetic** PGM fixtures only:
  `npm run validate:photos -- --manifest .optical-physical/synthetic-smoke/manifest.json --out .optical-physical/synthetic-smoke/results`.
  Result: 2/2 declared samples, DESCRIPTIVE_ONLY. No real-camera label was used.
  Raw wrong IDs/sums/out-of-target identifications remain false accepts even
  if the independent target/reference postcheck catches them. Timing is
  desktop Node decode only; it does not meet a phone end-to-end latency goal.
- Frozen codebook SHA256 is still
  `515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4`.
  A new Windows worktree initially applied CRLF checkout conversion; canonical
  bytes were restored from the original verified checkout. `.gitattributes`
  now prevents that conversion for frozen/evidence bytes. No codebook,
  historical optical report, dependency lockfile or Kiro task/history changed.
- Limitations: old 96.7%/81.4% and the 168,000-trial sweep remain historical;
  that full sweep was not repeated. Registration/cut errors, paper opacity,
  real-phone accuracy/latency and physical concealment remain NOT RUN.
  Both-face identifiers cannot be hidden by software; opaque holders and
  public-reveal-only capture are prescribed, unvalidated physical controls.
  Browser/worker camera decoding and game/Companion integration remain
  unimplemented; no complete physical game is claimed. Kiro checkboxes and
  Issue #10 remain open. No merge, deployment or application publication.
- Workspace: `D:/Project/QRoker/qroker-optical-validation`, branch
  `codex/issue-10-optical-validation`, based on the existing score PR branch.
  The original `qroker-kiroween` checkout stays on the score branch unchanged.
  Print inputs/outputs stay local under ignored `.optical-physical/`.
- Preparation commit/PR cross-reference is recorded after PR creation.
