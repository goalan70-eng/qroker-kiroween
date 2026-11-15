# UI progress note (task 16.2)

Latest commit: pending commit (base: a402d9d).

## Delivered by 16.2
- `ui/dom.ts`: `h`/`createH`/`buildElement` (text only through `textContent` and text nodes), `captureFocus`, `restoreFocus`, `renderWithFocus` (take a Document-like object).
- `ui/store.ts`: `AppModel` (UI-only, no game data), observable `createStore`.
- `ui/controller.ts`: `createController(deps)` owns the sealed `GameState` in a closure, applies human Actions, drives AI seats through `deps.schedule` (`AI_DELAY_MS = 600`, one pending step, epoch and log-length guards), hands screens only `{view, model, displayError, handlers}`. `mountApp(root, deps)` composes the unchanged shell with the controller.
- `ui/main.ts` wires the real `setTimeout` scheduler. No game starts automatically.
- `boundaries.test.ts`: rules `ui-internal-import` and `ui-allow-list` (screens may not import `core/state`, `core/engine`, `core/deck`, `core/replay`, `core/rules`; only `ui/controller.ts` may import state, engine, replay and prng).

## Verified
- Node tests with a stub renderer, queue and immediate schedulers: four AI seats reach `ENDED` and match `playGame` (scores, history, action count) for the same seed; human waits; invalid actions; stale callbacks; no sealed keys in render arguments.
- mountApp against a hand-written fake Document (not a browser).
- `tsc` (both configs), `npm run build`, `npm run test:game`.

## Not verified / not built
- No real browser run, no game screens, no Play button (shell notice still says "not connected yet").
- No persistence, no pass-the-device gate, no focus behaviour in a real browser.

## Unresolved policies
- OQ-1 (identity visibility default), OQ-3 (starting group scoring), placeholder score values (provisional banner stays), reveal policy (who acknowledges a reveal: implemented as "a person if any, else automatic").

## Next
- 17.1 needs the OQ-15 row direction decided before 17.2. 18.2 needs OQ-14 decided.
- Open point: `ui/` may not import `sim/`, so the controller re-derives `decisionSeed` with `core/prng` (extra allow-list entry `prng`, documented in the boundary test).
