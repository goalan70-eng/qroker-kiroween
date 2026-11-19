# Placement UI verification in a real browser (task 17.3)

> **Historical behavior note (2026-11-18):** These browser checks were recorded before the first-placement draw exemption was removed. In particular, Scenario 2's `hand 4 → 3` after the first code-free placement is no longer the expected result. Under the current rule (RULES_VERSION 2), that placement draws one card and the hand remains at 4 while the deck is non-empty. A fresh browser regression run is required after the rule change.

This file records what was run to check the placement UI (drag-and-drop and position-first placement, 180° rotation for clubs and spades, explicit confirmation) in a real browser, what each check shows, and what it does not show. The evidence classes are kept apart on purpose.

Environment: Node v24.20.0, Vite 8.3.8, Windows. Browser: Microsoft Edge 157.0.4341.60, headless (`--headless=new`).

## Evidence classes

| Class | What it is | Status |
|-------|------------|--------|
| Model tests | Pure reducers and the DOM-free controller in Node (`placement-draft`, `controller`, `pointer-gesture` state machine) | Existing, plus the new tests listed below |
| Fake-DOM tests | Components and the gesture adapter against a hand-written fake `Document` (`ui/testing/fake-dom.ts`) | Existing, plus the new tests listed below |
| Real browser, this file | Headless Edge driven through the DevTools protocol: real mouse events (`Input.dispatchMouseEvent`), emulated touch (`Input.dispatchTouchEvent` with `Emulation.setTouchEmulationEnabled`), real key events (`Input.dispatchKeyEvent`). Results are read from the DOM through `Runtime.evaluate` | Done, one browser |
| Real-device touch | A physical phone or tablet | NOT performed |
| Human visual review | A person looking at the page | NOT performed |
| Screenshots | | Not taken, not reviewed |
| Other browsers | Chrome, Firefox, Safari | NOT performed |

The touch results are emulated: the browser builds pointer events from synthetic touch input. They do not show finger size, palm rejection, system gestures, or the timing of a human hand.

## How to run the playground

The placement panel is not wired into the game page yet. A development-only page renders it against the real controller (human seat P0 and three AI seats, real `setTimeout` scheduler):

```
npm run dev
```

Open `http://localhost:5173/dev/placement-playground.html?seed=1&lang=ko`.

URL parameters: `lang=ko|en` (default `en`), `seed=<integer 0 to 4294967295>` (default 1), `vis=OWNER_ONLY|FACE_UP` (default `OWNER_ONLY`). The page shows the heading `Placement playground (development only, not the game)` (English only, not in the string tables), one status line built from the `PlayerView` only (phase, turn, hand size, deck count), and the panel. It never submits Guesses. When the phase becomes `GUESS_COLLECT` it shows `Guess entry is not implemented yet (Task 18); the playground stops here`.

Files: `src/game/ui/dev/placement-playground.html`, `src/game/ui/dev/placement-playground.ts` (52 lines). The five style sheets are linked from the HTML page instead of being imported from TypeScript, because `tsconfig.game.json` has no declaration for side-effect `import '*.css'` and `tsc` fails on it (TS2882). The page is not an input of `vite build` (`index.html` is the only input); `npm run build` writes `dist/index.html`, one JS file and one CSS file, and a search for `playground` in them finds nothing.

New controller method (additive, needed by the playground, which may not import `core/state`): `startPracticeGame({ seed, identityVisibility? })`. It builds `defaultConfig()` (P0 human, three AI seats) with the given visibility and calls `startGame`. It is not part of the renderer handlers (the list of handler names is unchanged).

## Defects found in the browser and fixed

All three are in `src/game/ui/pointer-gesture.ts`. None of them was visible to the existing model or fake-DOM tests. The "before" values were recorded before the fix with the same scripts.

| # | Defect | Evidence before the fix | Fix | Regression test |
|---|--------|-------------------------|-----|-----------------|
| 1 | A tap or click on a hand card selected nothing. The pointer was captured by the Hand container on `pointerdown`, so the browser sent `pointerup` and `click` to the container, not to the card button | Event log of one mouse click on card 0: `pointerdown` on the card, `gotpointercapture`, `pointerup` on `placement-hand`, `click` on `placement-hand`; afterwards `aria-pressed` was `false` and the hint was unchanged | The pointer is captured when the drag starts (8 px), not on press | `pointer-gesture.test.ts`: "regression (found in a real browser): the pointer is captured when the drag starts, never on press or during a tap" |
| 2 | After releasing a mouse drag, the next genuine click within 400 ms was swallowed. Edge sends no `click` at all after the release of a captured drag, so the click guard stayed armed | Scenario 3 before the fix: drag to a legal cell, `Confirm` clicked about 200 ms later: occupied cells 4 to 4, hand 4 (nothing placed). Event log after a drag: `pointerdown`, `pointerup`, `mouseup`, `lostpointercapture`, no `click` for 600 ms | A `pointerdown` anywhere, or a key press other than Escape, clears the suppression. A click that does follow the release directly is still suppressed once | `pointer-gesture.test.ts`: "regression (found in a real browser): no click follows a captured drag, so the next press or key press clears the suppression". The listener count test moved from 6 to 7 listeners on the document (the added `pointerdown` guard) |
| 3 | A touch drag was cancelled at once. A touch pointer is implicitly captured by the pressed card; capturing it on the Hand container at drag start makes the browser send `lostpointercapture` to the card, and that ended the gesture | Emulated touch drag over a legal cell: no ghost, no preview, live region `Drag cancelled. Nothing was placed.` Event log: `gotpointercapture` on the card, `lostpointercapture` on the card, `gotpointercapture` on `placement-hand` | A `lostpointercapture` whose target is an element inside the Hand container is a hand-over and is ignored (`GestureHost.contains`) | `pointer-gesture.test.ts`: "regression (found with emulated touch): the implicit touch capture of the card is handed over to the host without ending the drag". `fake-dom.ts` `contains` now returns `false` for a non-element, like `Node.contains` |

Fix 1 was found first. Fix 3 was found after fix 1 moved the capture to the start of the drag; with the old capture on press the tap never worked, so the drag was not reached. Both are in `attachHandGestures`.

Test-script problems found on the way (not product defects): a `mouseMoved` event sent with `button: none` while the button is down made Chromium release the capture; drop coordinates were computed before the page scrolled; the Space key must be sent as `key: ' '`; an emulated tap right after a fast emulated touch drag gets no `click` from the browser for about a second (fling handling; a control run with a 1.5 s pause between drag and tap, and a run with a swipe on plain text, behave normally). The scripts were changed, not the product.

## Scenarios

Viewports: 1280x800 (desktop) and 390x844 (phone size, `mobile: true` for scenario 1 and 9), 390x560 for the scroll check. Seed 1 unless a scenario says otherwise (seed 1 deals P0 a hand of clubs and spades only; seed 2 holds both a spade and a diamond). All final runs: no uncaught exception, no failed request, no HTTP error, no console error or warning (the only console messages are the two Vite client messages in dev). One full run of scenarios 1 to 11: 99 checks, 0 failed (two complete runs, one before and one after the last small change to the gesture adapter).

| # | Scenario | Result | Observed |
|---|----------|--------|----------|
| 1 | Load `ko` and `en`, 1280x800 and 390x844 | PASS | 64 `.board-cell` buttons, 4 hand cards, all `data-owner="P0"`, `<html lang>` follows the parameter, hint text Korean for `ko`; no horizontal overflow at 390 px; no extra property on `window` compared with a fresh iframe |
| 2 | Position-first with real mouse events | PASS | Legal cells: 8 (`is-legal`). Click C4: `is-target`, one `aria-selected` cell, no preview, Confirm disabled. Click card 0: one preview in C4, Confirm enabled, hand 4, deck 32, occupied cells 4, phase PLACEMENT, turn P0. Confirm: occupied 4 to 5, hand 3 (no draw on the first placement), turn P1, Confirm disabled. A second click on Confirm changed nothing. AI seats P1 to P3 then played at 600 ms steps: turn sequence P1, P2, P3, P0 in 1724 ms, occupied 8, hand 3. Second human placement: hand 3 before and after, deck 32 to 31 (draw after the first placement) |
| 3 | Drag with real mouse events (8 intermediate moves) | PASS | Release over D3: target D3, one preview, hand 4, occupied 4, ghost removed, Confirm enabled, selected card is the dragged card. A second drag to E6 moved the preview there. Confirm: occupied 4 to 5, hand 3 |
| 4 | Invalid drops, in `en` and `ko`, with and without a draft | PASS (20 checks) | Drops on C3 (diagonal only), A1 (isolated), D4 (occupied), and two points outside the board: no placement (hand 4, occupied 4), no ghost left, and the draft is unchanged (same target, same preview, same card; or still no target). Localized error line for cells: `Must be adjacent to an existing card` / `기존 카드와 인접해야 합니다`, `Position already has a card` / `이미 카드가 있는 위치`. Outside the board: live region `Dropped outside the board. Nothing was placed.` / `보드 밖에 놓았습니다. 아무것도 놓이지 않았습니다.` |
| 5 | Escape during a drag | PASS | Mid-drag: one ghost, live region `Dragging a card...`. Escape: ghost 0, live region `Drag cancelled. Nothing was placed.`, occupied 4, draft kept as before the drag. Moving and releasing the button afterwards dropped nothing. A second Escape (no drag) cleared target, preview and selection |
| 5b | `pointercancel` | PASS (emulated touch, see 9) | `touchCancel` mid-drag: ghost shown (1), then 0; occupied 4, hand 4, no target |
| 6 | Click after a drag | PASS | Release over another hand card: nothing selected, no target, no preview. Target T1 then drag to T2: target T2, one preview, card is the dragged card. The browser sent no `click` in either case. A genuine click on a card 500 ms later selected it. Confirm clicked about 200 ms after a drag release placed one card (this was the failure of defect 2) |
| 7 | Rotation (seed 2: 6 and 8 of Diamonds, 9 and 10 of Spades), `en` and `ko` | PASS (16 checks) | No rotation control before a card is chosen. Spade selected with a target: control `Rotate 180°` / `180° 회전` present, state `0° (upright)`, preview `data-orientation="0"`. Click: state `180° (rotated)`, `aria-pressed="true"`, preview orientation 180, target unchanged. Diamond selected: 0 rotation controls in the DOM, orientation 0. Spade again: orientation 0, `aria-pressed="false"`. Rotate and Confirm: committed cell D3 `data-orientation="180"`, label `rotated 180°`, no rotation control anywhere, still 180 after the AI turns |
| 8 | Keyboard | PASS | First Tab: board cell D3 (exactly one cell has `tabindex="0"`). ArrowRight, ArrowDown, ArrowLeft, ArrowUp moved focus one cell each (D3 to E3, E4, D4, D3). Enter on a legal cell: target set, focus on the cell. Tab: hand card 0. Enter: card selected, preview, Confirm enabled, focus kept. Tab order to Confirm: hand 1, hand 2, hand 3, Rotate, Confirm. Enter: occupied 4 to 5, hand 3. After the AI turns Tab again reached a card; Space selected it. Escape with focus on a card cleared the draft; Escape with focus on a cell cleared the target |
| 9 | Emulated touch (390x844), NOT a real device | PASS | Computed `touch-action`: the four hand cards `none`; body, html, board, cells, hand container and buttons `auto`. Tap on a legal cell selected it. Tap with 4 px movement on a card selected it (preview 1, no placement). Touch drag over a legal cell: preview in that cell, ghost removed, no placement until a tap on Confirm, then occupied 4 to 5 and hand 3. `touchCancel` mid-drag: ghost 1 then 0, no target, no placement. At 390x560 a swipe on the board scrolled the page (scrollHeight 733, clientHeight 560, scrollY 173). A swipe starting on a hand card did not scroll (the card owns the touch). Browser click arrived 29 to 41 ms after `touchEnd` for each tap |
| 10 | Privacy of the rendered DOM, OWNER_ONLY, `en` and `ko` | PASS | 10 scans per language over 3 placements (draft, after confirm, after the AI turns): 0 attribute or text matches of `\b[HDCS]-(10\|[2-9AJQK])\b` (names and values of every attribute, all text, title). Board cards by owner and face: P1, P2, P3 `down` (3 each), P0 `up` (3), neutral `up` (4). Face-down cells have no rank or suit element and labels such as `F3, occupied, Face-down card, upright (0°), owner: Player 2`. The hand holds only `data-owner="P0"` cards. With `?vis=FACE_UP` the AI cards are face-up (informative) and the hand is still only P0 |
| 11 | Rapid input | PASS | Real double click on Confirm (clickCount 1 then 2): exactly one placement (occupied 4 to 5, hand 3). Five more clicks on the disabled Confirm during the AI turn: no change. 40 alternating clicks on cells and cards without pauses: 0 exceptions, 0 console messages, occupied unchanged, at most one target and one preview |
| Production | `npm run build` then `npm run preview` (port 4173), `index.html` only | PASS | Locale `ko-KR`: `<html lang>` `ko`; ArrowUp on the selector gave `en` and `provisional scoring`. Locale `en-US`: `en`; ArrowDown gave `ko` and `임시 점수 규칙`. Selector kept the focus, no console message, no failed request, no button on the page (the shell is unchanged). `/dev/placement-playground.html` on the preview server returns the shell page (title `QRoker`, status 200, the Vite single-page fallback), not the playground |
| Game end | Seeds 1 and 3, playing legal cells with card 0 | Observed | Seed 1: after 5 human turns the phase was `GUESS_COLLECT` and the note `Guess entry is not implemented yet (Task 18); the playground stops here` appeared; 2 s later nothing had changed and no guess was submitted. Seed 3: the game reached `ENDED` after 11 human turns without a code (hand 0, deck 0) |

Seeds were tried only where the scenario needed a particular hand (scenario 7: seeds 1 to 2).

## DRAG_THRESHOLD_PX (8) stays provisional

The value 8 worked in these runs: mouse drags of 8 steps started a drag, a 4 px movement during an emulated tap stayed a tap. Nothing observed suggests a different value, but emulated touch has no finger tremor and no real contact area. The value needs a real-device result recorded in `docs/responsive-checklist.md` before it is treated as final.

## Observations that are not changed here

- The error line keeps the last message until the draft or the game changes. After a drop on an occupied cell, a later drop outside the board shows its live-region message and the old error text stays in the alert line.
- The accessible name of a preview or committed own card says `owner: Player 1`, while the same card in the hand says `owner: You`.
- At 1280x800 the document is 874 px high, so Confirm sits below the fold until the page is scrolled; at 390x844 everything fits.
- After a captured mouse drag Edge sends no `click`; the guard handles this (defect 2), but other browsers may send one and are not checked.
- A `click` that arrives right after a drag release, with no new press or key press in between, is still suppressed for 400 ms (the designed behaviour).

## Commands run for this task

| Command | Exit code |
|---------|-----------|
| `npx tsc -p tsconfig.json` | 0 |
| `npx tsc -p tsconfig.game.json` | 0 |
| `npx vitest --run src/game/ui src/game/i18n src/game/boundaries.test.ts` | 0 (15 files, 459 tests) |
| `npm run build` | 0 |

The browser scripts were temporary Node programs outside the repository (Node's global `WebSocket` and `fetch`, DevTools protocol, a temporary profile per run). They are not committed and the profiles were deleted.

NOT done: real-device touch, human visual review, screenshots, Chrome, Firefox or Safari, screen reader, contrast or layout measurement, `file://`, `npm run test:ci`.

## Full-suite regression record (after the placement changes)

`npm run test:ci` (maxWorkers=4) was run once at the end of this batch while an Android emulator process was running and CPU load was 88 to 100 percent: exit code 1; 77 files, 2054 tests: 2 failed, 2052 passed; both failures are `Test timed out in 5000ms` in the known load-sensitive optical tests (src/optical/detect.test.ts blurred non-integer scales; src/optical/testing/physical-card.test.ts rotated card). Re-running only those two files with `--maxWorkers=1` (load still about 88 percent): exit 0, 2 files, 95 tests passed. No assertion was changed and no timeout was raised. A clean full `npm run test:ci` on an idle machine for this change set has not been recorded yet.
