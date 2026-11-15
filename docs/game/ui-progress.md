# UI progress note
Latest verified commits: see `git log` (feat(web) commits since 5d7c228; Task 18 commits are `fix(web): enforce placement confirmation boundary`, `feat(web): implement private guessing and pass-device gate`, `feat(web): add reveal screen and public scoreboard`).
## Delivered
- 16.2: `ui/dom.ts`, `ui/store.ts`, `ui/controller.ts` (sealed GameState in a closure, AI turns via `deps.schedule`, epoch/log-length guards, localized display errors), boundary rules `ui-internal-import` / `ui-allow-list`.
- 17.1-17.4 (owner-directed placement interaction): card face + tokens, board, hand + controls + panel, placement draft model, pointer gestures, controller draft API (`draftEvent`, `confirmPlacement`, `explainTarget`, `rotationInfo`, `startPracticeGame`), additive `rotationChangesCorners` in `core/fragment-layout.ts`.
- 18.3: `RenderHandlers.dispatch` is typed for non-PLACE Actions and returns `PLACE_NOT_ALLOWED` for a PLACE at runtime; `confirmPlacement` (via the trusted `dispatchHuman`) is the only human placement path.
- 18.1: `ui/guess-model.ts` (text -> Guess via `validateGuess`; single allow-list entry for `core/score`), `ui/screens/privacy-gate.ts` (pure `nextGate` + gate component), `ui/screens/guess-entry.ts` (private form), `i18n/strings/guess.ts`.
- 18.2: `ui/screens/reveal.ts` (Guess-free view model, one-shot ACK_REVEAL), `ui/components/scoreboard.ts`, `ui/styles/reveal.css`, `i18n/strings/{reveal,scoreboard}.ts`.
- Dev-only page `src/game/ui/dev/placement-playground.html` (not in the production build).
## Verified
- Model and fake-DOM component tests (no real browser for Task 18). Placement UI: headless Edge, 99 checks (docs/game/placement-verification.md).
- Task 18 final run on an idle machine: `typecheck`, `typecheck:game`, `build` exit 0; `npm run test:ci` exit 0 (84 files, 2236 tests).
## Not verified / not built
- No real-device touch, no human visual review, no other browsers. DRAG_THRESHOLD_PX = 8 is provisional.
- The gate is an isolated contract: viewer switching between human seats and gate activation are Task 19.4. No full-browser privacy claim for multi-human play before 19.4 and 21.
- `styles/reveal.css` is not linked yet (Task 19.4). Setup, end screen, persistence and screen composition are Task 19.
## Known UI follow-ups (not fixed)
- Confirm placement sits below the fold at 1280x800; preview owner label ("Player 1") differs from the hand ("You"); an old error line can stay after a later outside drop (tasks 19.4/24).
## Unresolved policies
- OQ-1 (identity visibility default), OQ-3 (starting group scoring), placeholder score values, reveal policy (four cards per code is rendered as the engine supplies it), OQ-14 (not applicable to Task 18: no Guess is shown), OQ-15 (row direction, provisional: row 1 at top).
## Next
- Task 19 (setup, end screen, composition, 19.4 gate activation) and 20.1 (save format).