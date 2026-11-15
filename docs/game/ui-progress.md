# UI progress note
Latest verified commits: 16.2 dc0d45e (UI controller); 17.x placement UI: see git log (feat(web) commits after 5d7c228).
## Delivered
- 16.2: `ui/dom.ts`, `ui/store.ts`, `ui/controller.ts` (sealed GameState in a closure, AI turns via `deps.schedule`, epoch/log-length guards, localized display errors), boundary rules `ui-internal-import` / `ui-allow-list`.
- 17.1-17.4 (owner-directed placement interaction): card face + tokens, board (64 buttons, touching cells, legal markers, keyboard), hand + controls + panel, placement draft model, pointer gestures, controller draft API (`draftEvent`, `confirmPlacement`, `explainTarget`, `rotationInfo`, `startPracticeGame`), additive `rotationChangesCorners` in `core/fragment-layout.ts`.
- Dev-only page `src/game/ui/dev/placement-playground.html` (not in the production build; Vite dev: http://localhost:5173/dev/placement-playground.html?seed=1&lang=ko).
## Verified (see docs/game/placement-verification.md)
- Model and fake-DOM tests; headless Edge (real mouse, emulated touch, keyboard) 99 checks, 3 gesture defects found and fixed.
## Not verified / not built
- No real-device touch, no human visual review, no Chrome/Firefox/Safari run. DRAG_THRESHOLD_PX = 8 is provisional.
- No Guess entry, reveal screen, setup screen, persistence, pass-the-device gate; the production page is still the shell (Task 19 wires screens).
- Last full `npm run test:ci` for this change set failed only on two known 5 s optical timeouts while the emulator loaded the CPU (the two files pass alone); an idle-machine full run is still to be recorded.
## Unresolved policies
- OQ-1 (identity visibility default), OQ-3 (starting group scoring), placeholder score values, reveal policy, OQ-14 (post-game guess disclosure), OQ-15 (row direction, provisional: row 1 at top).
## Next
- Task 18 (guess entry, privacy gate, reveal, scoreboard); needs OQ-14 before 18.2.
- 18.3: `RenderHandlers.dispatch` is typed for non-PLACE Actions and returns `PLACE_NOT_ALLOWED` for a PLACE at runtime; `confirmPlacement` (via the trusted `dispatchHuman`) is the only placement path.
