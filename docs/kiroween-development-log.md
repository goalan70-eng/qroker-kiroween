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
