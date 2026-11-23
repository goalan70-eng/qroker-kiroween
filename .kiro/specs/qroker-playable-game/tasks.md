# Implementation Plan: QRoker Playable Game

## Overview

This plan implements `requirements.md` and `design.md` of this spec in milestones. The engine is built first as a pure, headless TypeScript module under `src/game/core/` with property-based tests. AI strategies, the headless play harness and the end-to-end test follow. The DOM user interface, persistence and smoke tests complete Milestone P1. Milestones P2 and P3 add the third AI tier, polish, mobile verification, offline support and the simulation runner.

Ground rules for every task:

- Do not edit `src/optical/**`, the frozen codebook, or `.kiro/specs/qroker-game/*`.
- Do not import `src/optical` from any `src/game` runtime file. The single exception is the test-only parity test in task 2.4.
- Keep scoring values in one place, `DEV_PLACEHOLDER_SCORE_CONFIG`. Do not finalize or tune any score value.
- Dependencies are listed per task as "Depends on". Each task states its acceptance criteria and its tests.
- Test sub-tasks are not marked optional, because requirement 21 makes the property, boundary, end-to-end and smoke tests part of the definition of done.
- All checkboxes start unchecked.

### Amendment: approved three-card rules (documentation only, no checkbox changed)

The owner approved the three-card rules after tasks 3 to 8 were ticked: 3-card Hands, 36-card deck, the same draw rule from the first placement, game end by an empty Hand after the draw or by five distinct codes in total, the whole last batch scored, and the hand-empty bonus only for the player who emptied their Hand. The specification text was updated by Kiro (requirements 2, 6, 7, 8, 9, 12, 16, OQ-4, OQ-10, OQ-16, IC-5 and design sections Deck, DrawManager, GameState, Reducer, Invariants, Properties 7, 12, 13, 19 and the new 19a). The implementation (`RULES_VERSION = 3`, `HAND_SIZE = 3`, `COMPLETED_CODE_LIMIT = 5`) and its tests were changed by Codex in the working tree. Kiro has not re-run those tests, so no task status and no recorded test result below was changed or re-attested. Where a task below still describes the earlier rules, an "Amended" note under it states the current rule; the original acceptance text and its historical evidence are kept as they were.

### Milestones

| Milestone | Tasks | Purpose |
|-----------|-------|---------|
| P0 Foundations | 1, 2 | Structure, toolchain, types and primitives. Can start immediately. |
| P1 Minimal end-to-end playable | 3 to 22 | A complete game in the browser, one human plus three AI, with save/resume and a headless end-to-end test. |
| P2 Strength, polish, offline | 23 to 26 | `EXPERT` AI, tuning hooks, code visualization, accessibility and responsive verification, Service Worker and PWA. |
| P3 Simulation | 27 | Simulation runner and the experiment plan for score tuning. The tuning itself is not performed in this spec. |
| Later (deferred) | not tasks | Scoring Companion integration with `src/optical`. |

### Definition of Milestone P1 (minimal end-to-end playable)

Milestone P1 is reached when all of the following hold:

1. One human Seat (`P0`) and three AI Seats (`P1` to `P3`, tiers `BEGINNER` and `ADVANCED`) play a complete game in the browser from the setup screen to the final ranking with `DEV_PLACEHOLDER_SCORE_CONFIG`, and every game screen shows the "provisional scoring" banner.
2. Guess collection works with private entry and the Pass_Device_Gate (tested with 2 human Seats), AI Guesses are never displayed, and the reveal screen shows the Hidden_Sum, the revealed cards and per-Seat points.
3. A seed can be entered or generated, the seed is displayed, rematch and replay-same-seed work, and an interrupted game resumes after a reload from a versioned save.
4. `npm run dev` starts the app, and `npm run build` followed by `npm run preview` (or any static server on `dist/`) serves it. The commands are documented in `docs/practice-mode.md`.
5. A headless end-to-end test plays complete games of the engine against 3 AI Seats for at least 200 Seeds without a rejected Action or invariant violation, and every game terminates (Property 21).
6. The UI smoke tests in `happy-dom` play a complete game by DOM events (task 21.2) and check privacy and accessibility basics (task 21.3).
7. All property tests of Properties 1 to 29 that belong to P1 tasks pass, the boundary test passes, the Korean and English tables are complete, and the existing `src/optical` test suite is unchanged and passes.

Not part of P1: the `EXPERT` AI, Service Worker and PWA installation, the Schematic_Code_View, motion and zoom polish, the responsive verification matrix, and the simulation runner. P1 satisfies qroker-game Requirement 7.1 for 2 of the 3 AI algorithms and satisfies Requirement 7.5; P2 completes Requirement 7.1.

### Start Here: Tasks That Need No Further Decisions

Tasks 1 and 2 (and then 3 to 7) depend only on the provisional defaults in the Open Questions below and can start immediately: project structure under `src/game/` with `core/`, `ai/`, `ui/` and `persistence/`, the `tsconfig` and npm-script additions that do not touch `src/optical`, the types, cards, PRNG, geometry and fragment-layout modules.

---

## Tasks

### Milestone P0: Foundations

- [x] 1. Project structure, toolchain and guards
  - [x] 1.1 Document the module layout and dependency rules
    - Create `src/game/README.md` with the folder layout and the dependency table from design.md (Architecture), the rule that `src/optical` is not a dependency, and the command list.
    - Acceptance: the file lists `core/`, `ai/`, `sim/`, `persistence/`, `i18n/`, `ui/` and the allowed imports per folder.
    - Tests: none (document). Reviewed with task 1.3.
    - Depends on: none.
    - _Requirements: 12.2, 12.3, 21.6, 22.1_
  - [x] 1.2 Add the game type-check configuration and npm scripts
    - Modify `tsconfig.json`: add `"exclude": ["src/game/ui/**", "src/game/pwa/**"]` and change nothing else. Create `tsconfig.game.json` extending `./tsconfig.json` with `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `types: ["node"]`, and `include: ["src/game/**/*.ts", "vite.config.ts", "scripts/build-sw.ts", "scripts/simulate.ts"]` with an empty `exclude`.
    - Modify `package.json` scripts: `typecheck` (`tsc -p tsconfig.json`), `typecheck:game` (`tsc -p tsconfig.game.json`), `test:game` (`vitest --run src/game`). Do not modify `vitest.config.ts` (its include glob `src/**/*.test.ts` already covers `src/game`) and do not change existing scripts.
    - Record the result of `npm run typecheck` before the change; after the change the result for files under `src/optical` must be identical.
    - Acceptance: `npm test` still runs the optical tests unchanged; `npm run typecheck:game` passes on a trivial `src/game/core/types.ts` stub; no file under `src/optical` or `vitest.config.ts` changed (check with `git diff --stat`).
    - Tests: run the commands; record outputs in the task notes.
    - Depends on: none.
    - _Requirements: 12.2, 21.5, 21.6_
  - [x] 1.3 Implement the boundary and scan test
    - Create `src/game/boundaries.test.ts` that scans non-test files under `src/game/**` and `scripts/` game files and fails on: any import path containing `optical` (allow-list only `src/game/core/fragment-layout.parity.test.ts`); any `node:` import in `core/`, `ai/`, `persistence/`, `ui/`; DOM globals (`window`, `document`, `localStorage`, `navigator`) in `core/` and `ai/`; `Math.random`, `Date`, `performance.now`, `crypto` in `core/` and `ai/`; imports in `ai/` of `core/state`, `core/engine`, `core/deck`, `core/replay`, `core/rules`; `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` outside `ui/public/sw.js`; numeric score tables outside `core/score.ts` (pattern: array literals assigned to `rewardByError`).
    - Strip comments and string literals before matching, so that documentation does not trigger the scan. The test passes vacuously while folders are empty.
    - Acceptance: a deliberately planted violation in a temporary file makes the test fail (verified once manually or with a fixture string passed to the scanner function), and the real tree passes.
    - Tests: scanner unit tests with fixture strings for each rule.
    - Depends on: none.
    - _Requirements: 2.6, 10.1, 11.8, 12.2, 12.3, 19.7, 21.3, 22.1_
  - [x] 1.4 Define the core types
    - Create `src/game/core/types.ts` exactly as in design.md "Core Types": `Suit`, `Rank`, `CardId`, `Orientation`, `Corner`, `Slot`, `PlayerId`, `Owner`, `Difficulty`, `QuadKey`, `GridPosition`, `Result`, `EngineError`, `ErrorCode`, `ScoreConfig`, `NamedScoreConfig`, `IdentityVisibility`, `SeatConfig`, `GameConfig`, `Action`.
    - Acceptance: compiles under `npm run typecheck` and `npm run typecheck:game`; every `ErrorCode` named in the design Error Handling table exists; no runtime code other than type exports.
    - Tests: type-level compile check (a `types.test-d`-style file using `satisfies` assertions, run by `tsc`).
    - Depends on: none.
    - _Requirements: 1.2, 12.7_

- [x] 2. Card, PRNG, geometry and fragment-layout primitives
  - [x] 2.1 Implement the card catalog (`core/cards.ts`)
    - `SUITS`, `RANKS`, `ALL_CARDS` (canonical order), `parseCardId`, `suitOf`, `rankOf`, `cardValue`, `hiddenSum`, `groupIdOf`.
    - Acceptance: 52 distinct cards; `parseCardId` returns `INVALID_CARD_ID` for anything else; `hiddenSum` of 4 aces is 4 and of 4 kings is 52; order snapshot matches design.
    - Tests: unit tests for order snapshot, 13 rank values, boundary sums.
    - Depends on: 1.4.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 5.3_
  - [x] 2.2 Implement PRNG and seed parsing (`core/prng.ts`, `core/seed.ts`)
    - `mulberry32` (own implementation, no import from `src/optical`), `mix32`, `shuffle` (Fisher–Yates), `parseSeed` (decimal range, FNV-1a 32 over UTF-16 code units for other text, `SEED_EMPTY`).
    - Acceptance: two generators with the same seed give identical sequences; `shuffle` is a permutation; input arrays are not mutated.
    - Tests: unit tests with fixed seeds and a recorded first 5 outputs (golden values written when the code is first run).
    - Depends on: 1.4.
    - _Requirements: 2.1, 2.5, 2.6_
  - [x] 2.3 Implement board geometry (`core/geometry.ts`)
    - `BOARD_SIZE`, `toNotation`, `fromNotation`, `inBounds`, `orthogonalNeighbors`, `candidateQuads`, `quadCells`, `quadKey`, `slotOf`.
    - Acceptance: `D4` is `{row: 3, col: 3}`; row 1 is the top row; the 4 candidate quads of an interior cell contain the cell; a corner cell yields 1.
    - Tests: unit tests for corners, edges and interior cells.
    - Depends on: 1.4.
    - _Requirements: 3.1, 5.1, 5.8_
  - [x] 2.4 Implement the fragment layout (`core/fragment-layout.ts`) and the parity test
    - `FRAGMENT_LAYOUT`, `INWARD_CORNER`, `isValidMember`, `validOrientations` as in design.md.
    - Create `src/game/core/fragment-layout.parity.test.ts`, the only file allowed to import `src/optical`: for all 52 cards and both orientations compare `FRAGMENT_LAYOUT[suit][orientation]` with `visibleCorners` of `src/optical/fragments.ts`. Do not edit the optical module.
    - Acceptance: the 4 examples of qroker-game Requirement 14.4 hold; parity test passes; the runtime module does not import `src/optical`.
    - Tests: unit tests for the 4 examples plus the full 8-row table; the parity test.
    - Depends on: 1.4.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - [x] 2.5 Property tests for the primitives
    - Create `src/game/core/testing/card-generators.ts` (`arbSeed`, `arbCard`, `arbFourDistinctCards`) and `src/game/core/primitives.properties.test.ts`.
    - **Property 1: Card catalog and CardId round trip**
    - **Property 2: Card_Value and Hidden_Sum**
    - **Property 3: Seed parsing**
    - **Property 5: Board notation round trip**
    - Acceptance: each property is one test, at least 100 runs, with the tag comment.
    - Depends on: 2.1, 2.2, 2.3, 2.4.
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 2.5, 3.1, 5.3, 5.4**

### Milestone P1: Minimal End-to-End Playable

- [x] 3. Deck and dealing
  - [x] 3.1 Implement the deck (`core/deck.ts`)
    - `dealGame(seed)` and `drawTop` as in design.md: shuffle with `mulberry32(seed)`, neutral = first 4, Hand of `Pk` = cards `4+4k` to `7+4k`, deck = remaining 32 with top = last element.
    - Acceptance: partition of 52 cards, no duplicates; `drawTop` on an empty deck returns `card: null` and the same deck.
    - Amended (three-card rules, Kiro text edit): Hand of `Pk` = cards `4+3k` to `6+3k`, deck = remaining 36. The 4-card Hand and 32-card deck above describe the superseded rules.
    - Tests: unit tests for sizes and the empty-deck draw.
    - Depends on: 2.1, 2.2.
    - _Requirements: 2.2, 2.3, 6.6_
  - [x] 3.2 Golden deal fixture and deck unit tests
    - Create `src/game/core/deck.test.ts` with the golden full initial deal for seed `1` and one more fixed seed (values recorded when first run and then frozen), plus tests that different seeds usually produce different deals (check 2 specific seeds differ).
    - Acceptance: changing the shuffle order or deal order fails the golden test.
    - Tests: golden snapshot assertions written as explicit arrays, not Vitest snapshots.
    - Depends on: 3.1.
    - _Requirements: 2.2, 2.8_

- [x] 4. Board and placement validation
  - [x] 4.1 Implement the board and PlacementValidator (`core/board.ts`)
    - `emptyBoard`, `cellAt`, `cardCount`, `validatePlacement` (precedence `INVALID_ORIENTATION`, `OUT_OF_BOUNDS`, `OCCUPIED`, `NOT_ADJACENT`), `placeOnBoard`, `legalCells` (row-major).
    - Acceptance: board is an immutable 64-element array; placing returns a new board; the starting 2×2 plus any adjacent cell is accepted; non-adjacent is rejected.
    - Tests: unit tests for each error code and for the 8 cells adjacent to the starting group.
    - Depends on: 2.3, 1.4.
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.8_
  - [x] 4.2 Property tests for the board
    - Create `src/game/core/testing/board-generators.ts` (`arbBoard` by repeated legal placements from the starting 2×2) and `src/game/core/board.properties.test.ts`.
    - **Property 6: Placement validation completeness and board immutability**
    - **Property 7: Board card count increases by one**
    - **Property 8: Legal cell enumeration**
    - Acceptance: Properties pass with at least 100 runs; Property 8 includes boards with 51 and 52 cards.
    - Depends on: 4.1.
    - **Validates: Requirements 3.2, 3.3, 3.6, 3.7, 3.8, 3.9**

- [x] 5. Composite Code detection
  - [x] 5.1 Implement the detector (`core/composite-code.ts`)
    - `detect(board, placedAt, scoredGroups)` returning `CompositeCodeResult[]` ordered by `quadKey`, with `groupId` sealed for engine use only.
    - Acceptance: a quad with 4 occupied cells but one invalid member returns no code; a quad with 4 valid members returns one code with the correct Hidden_Sum; a `groupId` already in `scoredGroups` is not returned; the starting 2×2 is never returned because it is not examined when no cell is newly placed.
    - Tests: fixtures built by hand on a board for the 4 valid/invalid examples of qroker-game Requirement 14.4, a two-codes-at-once placement, and a recorded `groupId` skip.
    - Depends on: 4.1, 2.4, 2.1.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8_
  - [x] 5.2 Property tests for detection and member validity
    - Create `src/game/core/composite-code.properties.test.ts`.
    - **Property 9: Member validity equals fragment-corner membership**
    - **Property 10: Detection structure**
    - **Property 11: Detection idempotence**
    - Acceptance: Properties pass; Property 10 uses a reference implementation written independently inside the test (scan all 4 candidate quads by brute force).
    - Depends on: 5.1.
    - **Validates: Requirements 4.1, 4.4, 4.5, 5.1, 5.2, 5.3, 5.5, 5.6, 5.8**

- [x] 6. Scoring, configuration and ranking
  - [x] 6.1 Implement the score engine (`core/score.ts`)
    - `RULES_VERSION`, `DEV_PLACEHOLDER_SCORE_CONFIG` (with the "development placeholder, no balance claim" comment and `provisional: true`), `validateScoreConfig`, `score`, `validateGuess`.
    - Acceptance: the placeholder passes `validateScoreConfig`; invalid tables (empty, negative, increasing, first value 0, NaN, negative bonus) are rejected with `INVALID_SCORE_CONFIG`; `validateGuess(3.5)` gives `GUESS_NOT_INTEGER`, `validateGuess(53)` gives `GUESS_OUT_OF_RANGE`.
    - Tests: unit tests for table boundaries e = length − 1, length, length + 1; the numeric-literal scan from task 1.3 passes with this file as the only owner of a table.
    - Depends on: 1.4.
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 7.2_
  - [x] 6.2 Implement ranking (`core/ranking.ts`)
    - `rankPlayers(scores)` with competition ranking, ordered by rank then seat.
    - Acceptance: scores `[5,5,3,0]` give ranks `[1,1,3,4]`; all equal gives `[1,1,1,1]`.
    - Tests: unit tests for the two examples.
    - Depends on: 1.4.
    - _Requirements: 9.4, 9.5_
  - [x] 6.3 Property tests for scoring and ranking
    - Create `src/game/core/scoring.properties.test.ts`.
    - **Property 15: Score function and configuration validation**
    - **Property 16: Guess validation**
    - **Property 20: Ranking**
    - Acceptance: Properties pass with generators for valid and invalid tables.
    - Depends on: 6.1, 6.2.
    - **Validates: Requirements 7.2, 8.1, 8.2, 8.3, 9.4, 9.5**

- [x] 7. Draw and turn management
  - [x] 7.1 Implement `shouldDraw` and `nextSeat` (`core/draw.ts`, `core/turn.ts`)
    - As in design.md. `shouldDraw(player, firstPlacementDone, newCodes)` and the cyclic `nextSeat`.
    - Acceptance: full truth table (first placement yes/no × codes 0/1/2) gives the values of requirements 6.3 to 6.5; `nextSeat` cycles `P0` to `P3` and back.
    - Amended (three-card rules, Kiro text edit): `shouldDraw(newCodes)` has no player or `firstPlacementDone` argument; it is false only when `newCodes ≥ 1`, for every placement including the first (requirement 6.3 to 6.5 as amended). The first-placement rows of the truth table above are superseded.
    - Tests: exhaustive truth-table unit tests. The reducer-level draw property is Property 12 in task 8.3.
    - Depends on: 3.1.
    - _Requirements: 6.1, 6.3, 6.4, 6.5_

- [x] 8. Engine state and reducer
  - [x] 8.1 Implement `GameState`, rules and `newGame` (`core/state.ts`, `core/rules.ts`)
    - `GameState`, `PendingBatch`, `RevealRecord`, `NewGameOptions`, `newGame`, `defaultConfig` (1 human `P0` + 3 AI, `DEV_PLACEHOLDER_SCORE_CONFIG`, `OWNER_ONLY`), config validation (`INVALID_CONFIG`, `INVALID_SCORE_CONFIG`). Neutral cards at orientation 0 with owner `NEUTRAL` (OQ-2), `turn = P0`.
    - Acceptance: 20 dealt cards, 32 deck cards; board holds 4 cards on D4, E4, D5, E5; invalid configs return errors; no code is pending at start.
    - Amended (three-card rules, Kiro text edit): 16 dealt cards (4 neutral plus 12 Hand cards) and 36 deck cards; no `firstPlacementDone` field.
    - Tests: unit tests for the initial state fields and invalid configs (3 seats, duplicate seat id, invalid score config).
    - Depends on: 3.1, 4.1, 6.1.
    - _Requirements: 2.2, 3.1, 5.7, 6.1, 8.3, 8.4, 12.1, 12.6_
  - [x] 8.2 Implement the reducer (`core/engine.ts`)
    - `reduce` for `PLACE`, `SUBMIT_GUESSES`, `ACK_REVEAL` exactly as in design.md "Reducer", plus `actingSeats`. Append every accepted action to `log`.
    - Acceptance: scenarios of the design's Testing Strategy pass: first placement with a code (no draw, guess phase), non-first placement without a code (draw), a placement with two codes (one batch), a Hand-emptying placement with a code (reveal then `ENDED` with bonus), a Hand-emptying placement without a code (`ENDED` immediately), deck exhaustion, all error codes of the Error Handling table.
    - Amended (three-card rules, Kiro text edit): the draw applies from the first placement. The end check follows the draw. Add the five scenarios of design Property 19a (first placement without a code keeps 3 cards; last card without a code draws and the game continues; last card without a code on an empty deck ends with the bonus; a non-last card on an empty deck only skips the draw and play continues; a fifth code with a non-empty Hand ends without a bonus; four codes plus a two-code placement that empties the Hand ends at six with the bonus once). The earlier "first placement with a code (no draw)" and "non-first placement" wording is superseded. Not re-run by Kiro.
    - Tests: example scenarios built from hand-picked states (construct a `GameState` through a test helper that overrides hands, deck and board).
    - Depends on: 8.1, 5.1, 7.1, 6.2, 4.1.
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.6, 7.9, 8.1, 8.6, 8.7, 8.8, 9.1, 9.2, 9.3, 9.7_
  - [x] 8.3 Property tests for the reducer: deal, draw, conservation, authorization
    - Create `src/game/core/testing/state-generators.ts` (`arbConfig`, `randomLegalAction`, `arbReachableState`) and `src/game/core/engine.properties.test.ts`.
    - **Property 4: Deterministic deal partition**
    - **Property 12: Draw rule**
    - **Property 13: Conservation invariants under random legal play**
    - **Property 14: Action authorization**
    - Acceptance: Properties pass; generated states are reachable (built only by `newGame` and `reduce`); the draw property includes states with an empty deck.
    - Depends on: 8.2.
    - **Validates: Requirements 2.2, 2.3, 2.4, 3.4, 3.6, 3.7, 5.7, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.9, 9.2**
  - [x] 8.4 Property tests for guess collection, reveal and game end
    - Create `src/game/core/engine.reveal.properties.test.ts`.
    - **Property 17: Simultaneous reveal**
    - **Property 18: Submission protocol**
    - **Property 19: Hand-empty bonus and game end ordering**
    - Acceptance: Property 17 permutes the 4 Seats' submission order; Property 19 plays random legal games to the end.
    - Amended (three-card rules, Kiro text edit): Property 19 now allows a code-limit-only ending with no bonus (`bonusAwarded = null`) and checks that the whole last batch is scored; Property 12 has no first-placement branch; design Property 19a lists the end-condition table. Not re-run by Kiro.
    - Depends on: 8.2.
    - **Validates: Requirements 7.3, 7.4, 7.6, 7.7, 8.6, 8.7, 8.8, 9.1, 9.3**

- [x] 9. Player views and information isolation
  - [x] 9.1 Implement the ViewProjector (`core/view.ts`)
    - `PlayerView`, `viewFor`, `unseenCards`, `legalCellsFor`, with both Identity_Visibility rules and the visibility table of design.md. Hand returned in canonical order. The view contains no seed, groupId, deck contents or other Hands.
    - Acceptance: for a fixed state, `OWNER_ONLY` shows the viewer's own placed cards, Neutral_Cards and revealed cards and hides the rest; `FACE_UP` shows all; `unseenCards` plus visible identities plus own Hand equals the 52 catalog.
    - Tests: unit tests for both modes and for the unseen-pool identity.
    - Depends on: 8.2.
    - _Requirements: 5.8, 7.5, 10.1, 10.2, 10.3, 10.4, 10.5_
  - [x] 9.2 Leakage and non-interference property tests
    - Create `src/game/core/testing/perturb.ts` (`arbHiddenPerturbation`) and `src/game/core/view.properties.test.ts`.
    - **Property 22: No leakage of pending or hidden information in views**
    - **Property 23: View non-interference**
    - Acceptance: Property 22 serializes every viewer's view in every phase and searches for the banned items (use the real `groupId`, Hand cards, deck cards and Guess values of the sealed state as search needles); Property 23 passes for both visibility modes.
    - Depends on: 9.1.
    - **Validates: Requirements 5.8, 7.5, 7.8, 10.3, 10.4, 10.5, 10.6**

- [x] 10. Replay
  - [x] 10.1 Implement replay (`core/replay.ts`)
    - `replay(seed, config, actions)` with `REPLAY_REJECTED` carrying the index and cause; `stateEquals`.
    - Acceptance: replaying a generated log reproduces the state; a log with a corrupted action fails at the right index.
    - Tests: unit tests for success and the failing index.
    - Depends on: 8.2.
    - _Requirements: 12.4, 12.5_
  - [x] 10.2 Property test for replay and purity
    - Create `src/game/core/replay.properties.test.ts` with deep-freeze helpers.
    - **Property 26: Replay determinism and purity**
    - Acceptance: inputs deep-frozen in the test never cause a thrown mutation error.
    - Depends on: 10.1.
    - **Validates: Requirements 12.1, 12.4, 12.5, 20.3**

- [x] 11. Checkpoint: engine complete
  - Ensure all tests pass (`npm test`), the boundary test passes, and `npm run typecheck` and `npm run typecheck:game` pass. Ask the user if questions arise, in particular about OQ-1 to OQ-6.

- [x] 12. AI opponents, tiers BEGINNER and ADVANCED
  - [x] 12.1 Define the AI framework (`ai/strategy.ts`)
    - `AiContext`, `AIStrategy`, `DIFFICULTY_LABELS` (Korean and English), work-budget helper `takeBudget` that counts evaluated candidates and truncates enumeration deterministically, and shared candidate enumeration over `PlayerView` (hand cards × legal cells × orientations in fixed order).
    - Acceptance: the framework imports only the modules allowed for `ai/` (boundary test passes); enumeration order is stable.
    - Tests: unit tests for enumeration order and budget truncation.
    - Depends on: 9.1.
    - _Requirements: 11.3, 11.4, 11.7, 11.8_
  - [x] 12.2 Implement the BEGINNER strategy and the registry (`ai/random.ts`, `ai/registry.ts`)
    - Uniform legal placement and uniform Guess in 4..52 per code, tie-breaking through `mulberry32(decisionSeed)`. `getStrategy('BEGINNER')`.
    - Acceptance: returned actions are accepted by `reduce` in 100 hand-seeded states; same view and seed give the same action.
    - Tests: unit tests of determinism and validity on 3 fixed seeds.
    - Depends on: 12.1.
    - _Requirements: 11.1, 11.2, 11.3, 11.7_
  - [x] 12.3 Implement the ADVANCED strategy (`ai/heuristic.ts`)
    - Placement scoring by quads (`W_COMPLETE`, `W_PARTIAL[k]`, probability product for hidden members from `unseenCards` and `validOrientations`), Guess from known cards plus the mean of valid unseen cards. Named constants for all weights and `WORK_BUDGET`. Register it in `ai/registry.ts`.
    - Acceptance: with all members visible, a placement that completes a valid quad is chosen over one that does not (fixture); the Guess equals the exact sum when all 4 cards are known; Guess always in 4..52.
    - Tests: fixtures for completing placement and exact-sum guess; hidden-member fixture with a hand-computed expected guess.
    - Depends on: 12.2.
    - _Requirements: 11.1, 11.2, 11.3, 11.4_
  - [x] 12.4 Property tests for the AI
    - Create `src/game/ai/ai.properties.test.ts`.
    - **Property 24: AI action validity and determinism**
    - **Property 25: AI non-interference**
    - Each property test iterates over every strategy id returned by the registry at test time, so `EXPERT` is covered automatically once it is registered in task 23.1. Also record per-tier decision time over 50 reachable states and fail above 3000 ms (an example test in the same file, not a property).
    - Acceptance: both properties pass for every registered tier (`BEGINNER` and `ADVANCED` in P1) in both visibility modes; timing is printed in the test output.
    - Depends on: 12.2, 12.3, 9.2.
    - **Validates: Requirements 10.7, 11.2, 11.3, 11.4, 11.5**

- [x] 13. Headless play harness and end-to-end test
  - [x] 13.1 Implement the headless driver and the simulator types (`sim/play-game.ts`, `sim/types.ts`)
    - `playGame` as in design.md and the `SimulationConfig`, `SimulationResult`, `GameSimulator` interfaces (signatures only). `playGame` checks the invariants of design.md "Invariants" after every Action when `checkInvariants` is true.
    - Acceptance: a 4-AI game ends in `ENDED`; a forced bad strategy that returns an illegal action makes `playGame` throw with the rejected Error_Code.
    - Tests: unit tests for one fixed seed and the bad-strategy case.
    - Depends on: 12.3, 10.1.
    - _Requirements: 20.1, 20.4_
  - [x] 13.2 End-to-end headless test (`sim/e2e.test.ts`)
    - Play `playGame` for Seeds `0..N-1` (N from `E2E_SEEDS`, default 200) with strategy mixes (all `BEGINNER`, all `ADVANCED`, mixed) and both visibility modes; assert termination, zero rejected Actions, invariants, replay equality, and at most 48 `PLACE` Actions.
    - **Property 21: Termination and bounded length**
    - Acceptance: the test passes for the default N. Record the elapsed test time in the task notes; if the run is too slow for CI, lower the default N but keep at least 200 for the P1 acceptance run in task 22.2.
    - Depends on: 13.1.
    - **Validates: Requirements 9.6, 9.7, 20.2, 20.3**

- [x] 14. Checkpoint: headless game complete
  - Ensure all tests pass. Ask the user if questions arise, in particular whether to keep the placeholder score values for P1 playtests.

- [x] 15. Localization
  - [x] 15.1 Implement the localization core (`i18n/index.ts`, `i18n/types.ts`)
    - `t`, `setLanguage`, `getLanguage`, `detectLanguage`, `errorMessageKey`; area tables merged from `i18n/strings/*.ts`, each exporting `{ en, ko }` with the Korean table typed as `Record<keyof typeof en, string>`. Create `i18n/strings/common.ts` (app title, buttons, seat names, difficulty labels, provisional banner `provisional scoring` / `임시 점수 규칙`).
    - **Property 29: Localization completeness and language detection**
    - Acceptance: the property test passes (keys equal, placeholder names equal, detection rules); the test discovers area files by directory listing so later areas are covered automatically.
    - Tests: `src/game/i18n/i18n.properties.test.ts`.
    - Depends on: 1.4.
    - **Validates: Requirements 14.8, 16.2, 16.4, 16.5, 12.7**
  - [x] 15.2 Error message strings (`i18n/strings/errors.ts`)
    - One Korean and one English message per `ErrorCode`, with the 5 approved Korean placement messages copied verbatim from the approved qroker-game design (see design.md Error Handling) and the other Korean texts from the design table, marked with a comment `// REVIEW: new text, needs native-speaker check`.
    - Acceptance: every `ErrorCode` has an entry; the 5 verbatim strings match; Property 29 still passes.
    - Tests: unit test comparing the 5 verbatim strings.
    - Depends on: 15.1.
    - _Requirements: 12.7, 16.3_

- [x] 16. UI shell
  - [x] 16.1 Add Vite and the app shell
    - Install Vite as a devDependency with a version range that satisfies the Vitest peer range (the workspace currently has Vite 8.3.8 transitively; verify with `npm ls vite`). Create `vite.config.ts` (`root: 'src/game/ui'`, `base: './'`, `build.outDir: '../../../dist'`, `build.target: 'es2022'`), `src/game/ui/index.html` (viewport meta, `lang`, title, root element), `src/game/ui/main.ts` (placeholder mount). Add scripts `dev`, `build` (`tsc -p tsconfig.game.json --noEmit && vite build`), `preview`. Add `dist/` to `.gitignore`.
    - Acceptance: `npm run dev` serves a page; `npm run build` produces `dist/index.html` with hashed assets; `npm test` is unaffected (vitest still uses `vitest.config.ts`).
    - Tests: run `npm run build` and record the output size and exit code in the task notes (no size claim in documents).
    - Depends on: 1.2.
    - _Requirements: 17.5, 21.6_
  - [x] 16.2 Implement the UI core (`ui/dom.ts`, `ui/store.ts`, `ui/controller.ts`)
    - `h()` DOM helper, `AppModel`, `AppDeps`, `mountApp`, the controller that owns the sealed `GameState`, applies Actions, drains AI turns through `deps.schedule` (`AI_DELAY_MS = 600`), exposes only `PlayerView` to screens, and re-renders with focus restoration.
    - Acceptance: with an immediate scheduler, a game of 4 AI-controlled Seats plays to `ENDED` through the controller (headless DOM-free unit test of the controller with a stub renderer); no screen module imports `core/state` or `core/engine`.
    - Tests: controller unit tests with a stub renderer; boundary test extended with the `ui/` import rule.
    - Depends on: 16.1, 12.2, 10.1, 15.1.
    - _Requirements: 10.1, 11.6, 12.1_

- [x] 17. Board, card faces and placement interaction
  - Owner-directed update (IC-11, not claimed as approved earlier): the human placement interaction is a `PlacementDraft` filled by drag and drop of an own-Hand card or by position first then card, with a `Rotation_Control` only for clubs and spades, edge-adjacent grid snapping, and confirm as the only path that sends `PLACE`. It supersedes the card-first flow and the orientation toggle for every card in the earlier text of 17.2 and 17.3. Task 17.4 is appended without renumbering; implement it before or together with 17.3. See design.md "Placement interaction".
  - [x] 17.1 Card face component (`ui/components/card-face.ts`, `ui/styles/tokens.css`, `ui/styles/card.css`)
    - Render face-up cards as rank plus suit glyph with a shape cue per suit and a 180° indicator, and face-down cards with owner and orientation only. Define the color tokens used everywhere. Mobile-first sizing with a `--cell` custom property.
    - The same face component renders the draft preview ghost and the drag overlay, for the viewer's own cards only. The 180° indicator is a visual orientation mark and never a control.
    - Acceptance: a face-down card has no rank or suit text in its DOM subtree; every card has an accessible name; the DOM of a face-down card, including attributes, classes and `title`, contains no rank, suit, CardId or fragment layout; a visible card puts its identity only in its text and accessible name, never in `data-*` attributes or class names.
    - Tests: component unit tests in `happy-dom` (environment docblock) after task 21.1; until then the tests run in the controller-free node environment by testing a pure `cardFaceModel` function. The model test serializes the model of every hidden card and asserts that no rank, suit or CardId string appears in it (model-test evidence).
    - Depends on: 16.2.
    - _Requirements: 13.7, 13.8, 13.16, 16.7_
  - [x] 17.2 Board component (`ui/components/board.ts`, `ui/styles/board.css`, `i18n/strings/board.ts`)
    - 8×8 grid with `role="grid"`, 64 `<button>` cells, labels A–H and 1–8, arrow-key roving focus, accessible names (notation, state including "selected target", owner), highlight of pending-code regions. For the placement interaction: legal-target highlighting from `legalCellsFor(view)` while a card, a target or a drag is active; drop targets (each cell carries `data-row` and `data-col`, integers 0 to 7, and no identity in any attribute, class or `title`); the preview ghost as a child of the target cell (snapped by construction); touching cells in `board.css` (`gap: 0`, no cell or card margin, borders, focus rings and selection indicators drawn inside the cell box so that `--cell` never changes).
    - Acceptance: 64 buttons; arrow keys move focus within the grid; legal cells carry a visible marker that does not rely on color alone; legal cells equal `legalCellsFor(view)` (a diagonal-only or isolated cell is not marked, a multi-edge cell is); the target cell and the ghost are marked without a color-only cue; the board root has no gap between neighboring cells and no style rule changes the cell size for borders or selection.
    - Tests: board model unit tests (pure functions for names, highlights and the legal/target/drop classes, including adjacency cases on fixed boards, and a serialized-model scan for hidden identities); a CSS scan test that `board.css` sets `gap: 0` and has no margin on cell or card classes; DOM tests join in task 21.3 (fake-DOM evidence).
    - Depends on: 17.1.
    - _Requirements: 13.1, 13.3, 13.9, 13.10, 13.13, 13.16, 16.6, 16.7, 17.2_
  - [x] 17.3 Hand and placement controls (`ui/components/hand.ts`, `ui/components/placement-controls.ts`, `i18n/strings/hand.ts`)
    - Hand of the active human Seat only, as the drag source (`.hand-card--draggable`, `touch-action: none` on these cards only) and as keyboard-selectable buttons; the draft preview with "Confirm placement" ("배치 확정") and "Cancel" ("취소"); the "180° rotation" ("180° 회전") control shown only while the drafted card has `rotationChangesCorners` (from `RenderInput.rotationInfo`); error message display for illegal cells and illegal drops through `explainTarget`; disabled state with AI status text while an AI Seat acts. The components use the model, gesture module and controller functions of task 17.4 and call only `draftEvent`, `confirmPlacement` and `explainTarget`.
    - Acceptance: the confirm control is the only path that sends `PLACE` (it calls `confirmPlacement()`); a drop, a tap, a rotation, a cancel and Escape send no Action; the rotation control is absent for hearts, diamonds, other Seats' cards and committed cards; Cancel and Escape clear the draft without a state change; the position-first path works with keyboard only; all placement controls and Hand cards are at least 44×44 px in CSS; no Hand card of another Seat is rendered.
    - Tests: component model tests for control visibility and disabled states (which controls exist for a club, a spade, a heart, a diamond, no card, an AI turn); the draft reducer tests of task 17.4 replace the earlier placement-state reducer tests; DOM and drag tests are the fake-DOM tests of task 21.3.
    - Depends on: 17.1.
    - Ordering note (no renumbering, no new dependency edge): 17.4 provides `ui/placement-draft.ts`, `ui/pointer-gesture.ts` and the controller functions that 17.3 consumes. Run 17.4 before 17.3, or implement both in one session; the dependency graph places 17.3 in the wave after 17.4.
    - _Requirements: 13.2, 13.3, 13.4, 13.5, 13.6, 13.10, 13.11, 13.12, 13.14, 13.16, 17.2, 17.7_
  - [x] 17.4 Placement draft model, rotation capability and pointer gestures (`ui/placement-draft.ts`, `ui/pointer-gesture.ts`, `ui/controller.ts`, `core/fragment-layout.ts`, `src/game/boundaries.test.ts`)
    - Implement design.md "Placement interaction": `PlacementDraft`, `DraftEvent`, the pure `reduceDraft`, `validateDraft` and `draftState` in `ui/placement-draft.ts` (imports `core/types` and `core/view` only); `stepGesture`, `cellFromPoint`, `attachHandGestures` and `DRAG_THRESHOLD_PX` in `ui/pointer-gesture.ts` (imports `core/types` only, no drag-and-drop dependency); in `ui/controller.ts` the functions `draftEvent`, `confirmPlacement`, `explainTarget` and `rotationInfo` (also `RenderInput.rotationInfo`), the `AppModel.draft` field with its invalidation rules (viewer, screen, epoch, `actionCount`, phase, turn, Hand, restart, abandon, dispose), keeping the re-entrancy, epoch and stale-callback protections of 16.2; in `core/fragment-layout.ts` the additive pure export `rotationChangesCorners(card)` (table and existing exports unchanged); in `boundaries.test.ts` the allow-list change that lets `ui/controller.ts` import `core/fragment-layout` and keeps every other `ui/` file limited to `core/view` and `core/types`. The `UiSelection` and `select(patch)` of 16.2 are superseded by `AppModel.draft` and `draftEvent`; update their users and tests in this task.
    - Acceptance (ten focused tests). Evidence class in brackets: model = pure functions or the DOM-free controller with a stub renderer in Node; fake-DOM = `happy-dom` with synthetic events, written in task 21.3 because `happy-dom` arrives with 21.1.
      1. Drag and drop and position-first produce equivalent drafts: `dropOnCell(x, c)`, `selectTarget(x)` then `selectCard(c)`, and `selectCard(c)` then `selectTarget(x)` all give `{ target: x, card: c, orientation: 0 }` [model].
      2. No game-state change before confirmation: after any sequence of draft events and gesture outputs the controller's state, `log` and view are unchanged and no `PLACE` is dispatched (Hand, deck, Scores, turn and `actionCount` equal their values before the sequence) [model; fake-DOM variant in 21.3].
      3. Rotation availability: `rotationChangesCorners` is true for all clubs and spades and false for all hearts and diamonds; `toggleRotation` switches only between 0 and 180 for a club or spade and is a no-op for a heart or diamond; the control is offered only for the former; the target is unchanged by a toggle [model; control visibility in 17.3 tests].
      4. Switching a rotated club or spade draft to a heart or diamond (and to any different card) resets the orientation to 0, and a still-legal target is kept [model].
      5. Edge adjacency through `legalCellsFor(view)` on fixed boards: an orthogonally adjacent empty cell passes; a diagonal-only cell and an isolated cell fail; a cell that shares two or more edges passes; an occupied cell and an out-of-grid cell fail; the engine rejects an Action for any cell that is not legal [model].
      6. Invalid drops, pointer cancellation and Escape never dispatch `PLACE`: `dropOutside`, `dropOnCell` on an illegal cell, `dragCancel`, `cancelled` outputs for `POINTERCANCEL`, `LOST_CAPTURE`, `ESCAPE` and `INVALIDATED`, and `cancel` leave the draft as specified and call no dispatch [model with `stepGesture`; adapter behavior in fake-DOM, 21.3].
      7. Confirmation dispatches exactly one Action: `confirmPlacement()` after a valid draft dispatches one `PLACE` with the draft card, target and orientation; a second call, a double activation and a call during an in-progress application send nothing (`NO_CARD` or `BUSY`) [model, DOM-free controller test].
      8. Stale selections and drag-generated clicks cannot place: a draft whose card left the Hand, whose turn or phase changed, whose target became occupied, or that survived a viewer change, restart, abandon or dispose is rejected by `confirmPlacement` with no Action; the click that follows a drag is suppressed and a later genuine click is not [model for the draft and controller; click suppression in `stepGesture` outputs and fake-DOM, 21.3].
      9. Hidden information is absent from rendered and accessibility data: the serialized board model, hand model, `aria-label` and live-region strings, drag overlay model and `rotationInfo` contain no suit, rank, CardId or fragment layout of a hidden card; `rotationInfo` has keys for the viewer's own Hand only [model scan; DOM attribute, class, `title` and `aria-label` scan in fake-DOM, 21.3].
      10. Evidence classes are distinguished: every test file and the task notes label each result as model, fake-DOM, emulated touch or real-device; the notes state that real-device touch behavior is not verified by classes 1 to 3 and that `DRAG_THRESHOLD_PX` stays provisional until a real-device result is recorded in `docs/responsive-checklist.md`.
    - Tests: `ui/placement-draft.test.ts`, `ui/pointer-gesture.test.ts` (pure `stepGesture` and `cellFromPoint` with a stub `HitTestHost`), `ui/controller.test.ts` (extended), `core/fragment-layout.test.ts` (extended with the 52-card `rotationChangesCorners` table), `src/game/boundaries.test.ts` (extended, with a fixture that fails a screen-class file importing `core/fragment-layout`). No new numbered Property; the 30 design properties are unchanged.
    - Depends on: 17.1, 16.2. Must precede, or be implemented together with, 17.3 (see the ordering note of 17.3).
    - _Requirements: 13.3, 13.4, 13.5, 13.10, 13.11, 13.12, 13.13, 13.14, 13.15, 13.16, 4.2, 4.5, 17.7_

- [x] 18. Guess entry, privacy gate, reveal and scoreboard
  - [x] 18.1 Pass_Device_Gate and Guess entry (`ui/screens/privacy-gate.ts`, `ui/screens/guess-entry.ts`, `ui/guess-model.ts`, `ui/guess-model.test.ts`, `i18n/strings/guess.ts`, `src/game/boundaries.test.ts`)
    - The gate removes private DOM before it is shown and renders nothing private; Guess entry has one numeric input per Quad_Key with validation by `validateGuess` and inline messages; the draft is cleared after submission.
    - Implement design.md "Task 18 interaction contracts" (gate sequencing model and Guess entry): the pure `nextGate` in `ui/screens/privacy-gate.ts`; `parseGuessText`, `buildGuesses` and `GuessFormToken` in `ui/guess-model.ts`; in `boundaries.test.ts` one additive allow-list entry that lets `ui/guess-model.ts` (that file only) import `core/score` (`validateGuess`, `GUESS_MIN`, `GUESS_MAX`), with every other `ui/` file still limited to `core/view` and `core/types` (extend the fixture test so that a screen file importing `core/score` fails).
    - Acceptance: with 2 human Seats the gate appears between Seats; no Hand card, Guess value or owner-only identity is in the DOM while the gate is shown; no Hidden_Sum is shown during entry.
    - Acceptance (sharpened), pure model tests (`nextGate`, `parseGuessText`, `buildGuesses`): `nextGate` returns `null` for one human Seat, and for two and four human Seats gives the gate between Seats in `PLACEMENT` (purpose `HAND`) and in `GUESS_COLLECT` (purpose `GUESS`, first human Seat in seat order without a submitted Guess); mixed human and AI Seats (AI turns and AI Guess collection need no gate; only human Seats are gated); one-code and two-code batches; no gate in `REVEAL` and `ENDED`; no gate when the candidate equals `lastPrivateSeat` or `acknowledgedSeat`. Validation accepts 4 and 52 and rejects 3 and 53; invalid and malformed text (blank, spaces only, `4.0`, `1e1`, `0x10`, `+`, `--3`, a digit string that overflows to `Infinity`) gives `GUESS_NOT_INTEGER` or `GUESS_OUT_OF_RANGE`; missing keys and blank keys are reported per key and nothing is sent.
    - Acceptance (sharpened), component tests with the existing `ui/testing/fake-dom.ts`: duplicate and stale submission is a no-op (token mismatch of viewer, `actionCount`, phase or key set, and `guessSubmitted` already true), and a stale or double gate acknowledgement is a no-op; the gate DOM removal order is previous private DOM removed first, then gate DOM created, then the next Seat's private view only after acknowledgement; the gate model and DOM contain no CardId, Guess value, owner-only identity or Hidden_Sum (text, attributes, `aria-label`, hidden nodes and serialized model scan); no Hidden_Sum appears during entry; Korean and English strings exist for every key with equal placeholder names; keyboard operation and focus restoration (focus moves to the gate control, then to the first Guess input or the Hand, and returns to a defined target after submission or acknowledgement).
    - Scope note: activating the gate in the composed page and switching `AppModel.viewer` between human Seats are task 19.4. Task 18.1 delivers and tests the isolated gate and Guess entry contract only, and makes no claim of full browser privacy. The headless-DOM smoke test remains task 21.3.
    - Tests: pure model tests for gate sequencing (`nextGate(model)`) and `ui/guess-model.test.ts`; component tests on `ui/testing/fake-dom.ts`; the headless-DOM smoke test stays in task 21.3.
    - Depends on: 16.2, 15.1.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 16.2, 16.6_
  - [x] 18.2 Reveal screen and scoreboard (`ui/screens/reveal.ts`, `ui/components/scoreboard.ts`, `i18n/strings/reveal.ts`)
    - Reveal shows per code the 4 revealed cards and the Hidden_Sum, and a table of earned and cumulative points; no Guess values. Scoreboard shows scores, Hand sizes, Seat names and deck size on every game screen.
    - Acceptance: the reveal view model contains no Guess field (type-level and test).
    - Acceptance (sharpened), per design.md "Task 18 interaction contracts" (`buildRevealModel`, `buildScoreboardModel`): `RevealViewModel` has no Guess field (a type-level test on `keyof` plus a scan of the serialized model against the Guesses submitted in the test game); the four-card contract is rendered as the record supplies it (the one-card versus four-card product policy stays open and is not decided here); the continue control sends `ACK_REVEAL` once (it captures `actionCount`, and a second activation or a changed `actionCount` sends nothing); in `ENDED` the screen shows no ACK control; the scoreboard is an accessible table with a caption, column headers and row headers, with Seat name, score and Hand count per row plus the deck count; the active Seat is marked by a text or glyph marker and a class, never by color alone; the provisional flag of the model comes from `rules.scoreConfig.provisional` and carries no point value; Korean and English strings exist for every key with equal placeholder names.
    - Tests: view-model unit tests; component tests for the reveal screen and scoreboard on `ui/testing/fake-dom.ts`.
    - Depends on: 16.2 and 18.3 (a new edge). Implement 18.3 first (see the ordering note of 18.3).
    - _Requirements: 14.6, 14.7, 14.8, 16.2_
  - [x] 18.3 Placement confirmation boundary (`ui/controller.ts`, `ui/controller.test.ts`, existing tests and playground code that call `handlers.dispatch` with `PLACE`)
    - Implement design.md "Task 18 interaction contracts", "Placement confirmation boundary": narrow `RenderHandlers.dispatch` to `Exclude<Action, { type: 'PLACE' }>` at type level; add the `PLACE_NOT_ALLOWED` reason to `OpResult`; at runtime the screen-facing `handlers.dispatch` rejects an Action whose `type` is `'PLACE'` with `PLACE_NOT_ALLOWED` before the engine is called, so `reduce` is not called and state, `log`, `draft`, `actionCount`, `lastAccepted` and AI scheduling do not change. `Controller.dispatchHuman` (trusted API), `confirmPlacement`, the AI Action path and the Task 17 draft, gesture and keyboard behavior stay unchanged. Update every caller that sends `PLACE` through `handlers.dispatch` (tests, playground) to use `dispatchHuman` or `confirmPlacement`.
    - Acceptance: regression tests in `ui/controller.test.ts` show that a bypass attempt through `handlers.dispatch` leaves the GameState-derived view, `actionCount` and `log` unchanged. Cases: a call that defeats TypeScript (a cast), with a legal and with an illegal `PLACE` payload, each returning `PLACE_NOT_ALLOWED`; the same attempt during `BUSY` re-entrancy (from inside a render or apply callback); a held draft survives the rejected attempt unchanged; `confirmPlacement` still places exactly once; an all-AI game still plays to `ENDED`; a type-level test (`@ts-expect-error`) shows that `handlers.dispatch({ type: 'PLACE', ... })` does not compile.
    - Ordering note (no renumbering): implement 18.3 before 18.1 and 18.2 (18.2 depends on it explicitly; 18.1 gains no new dependency edge). The dependency graph places 18.3 in the wave after 17.4 and 18.1 and 18.2 in the wave after 18.3, as it does for 17.3.
    - Depends on: 17.4.
    - _Requirements: 13.4, 13.10, 13.14, 11.6_

- [x] 19. Lifecycle screens and screen composition
  - [x] 19.1 Setup screen (`ui/screens/setup.ts`, `i18n/strings/setup.ts`)
    - Seed field with random default, 1–4 human Seats (default 1), difficulty per AI Seat (`BEGINNER`, `ADVANCED` in P1), Identity_Visibility option (default `OWNER_ONLY`, OQ-1), language switch; validation with `parseSeed`; prefs saved through the storage adapter once task 20.2 exists.
    - Acceptance: starting from the setup screen calls `newGame` with the entered values; empty seed field shows `SEED_EMPTY` message or draws a random seed (as specified in requirement 2.7).
    - Tests: setup model unit tests (options to `GameConfig`).
    - Depends on: 16.2.
    - _Requirements: 2.5, 2.7, 15.1, 15.2_
  - [x] 19.2 Final screen (`ui/screens/end.ts`, `i18n/strings/end.ts`)
    - Final ranking with shared ranks, final scores, all reveal records with Hidden_Sum details, buttons rematch (new seed), replay same seed, new setup.
    - Acceptance: tied scores display equal ranks; rematch uses the same seats and options with a new seed.
    - Tests: view-model unit tests including a tie.
    - Depends on: 16.2.
    - _Requirements: 9.4, 9.7, 15.3, 15.4_
  - [x] 19.3 Help overlay, provisional banner and settings (`ui/overlays/help.ts`, `ui/components/banner.ts`, `i18n/strings/help.ts`)
    - Rules text in Korean and English summarizing placement, orientation, drawing, guess and reveal, ranking and the provisional scoring notice; closes with Escape and a button; banner visible while `scoreConfig.provisional`; abandon-game confirmation overlay.
    - Acceptance: overlay opens from every screen; the abandon confirmation precedes discarding.
    - Tests: overlay model unit tests.
    - Depends on: 16.2.
    - _Requirements: 14.8, 15.5, 16.1_
  - [x] 19.4 Compose the game screen and wire the app (`ui/screens/game.ts`, `ui/main.ts`)
    - Compose scoreboard, banner, seed display, board, hand and controls, guess entry, gate, reveal and end screens into the controller's screen flow; add the mobile-first layout CSS (`ui/styles/layout.css`: portrait stack, landscape side-by-side, `--cell` clamp, 44 px controls, reduced-motion media query).
    - Acceptance: in the browser a full game can be played manually from setup to the final ranking; the seed is displayed; AI turns show the status text.
    - Tests: manual playthrough recorded in task notes; automated coverage arrives with tasks 21.2 and 21.3.
    - Sharpened scope (design.md "Task 19.4 composition contracts"; no change to engine semantics, score values, reveal policy, visibility modes, OQ decisions or optical code). Additional files: `ui/controller.ts`, `ui/store.ts`, `ui/controller.test.ts`, `ui/screens/game.test.ts`, `ui/styles/layout.css`, `ui/index.html`, `ui/shell.ts` and its test, `src/game/boundaries.test.ts`, `playwright.config.ts`, `e2e/game.spec.ts`, `docs/game/ui-progress.md`. Parts (a) to (f) below are all part of this task.
    - (a) Controller seat-to-show and gate. One human Seat: behaviour unchanged (viewer is that Seat, never a gate). 2 to 4 human Seats: the controller owns the seat-to-show (turn Seat in `PLACEMENT`, first human Seat without a submission in `GUESS_COLLECT`, none during an AI turn, `REVEAL` and `ENDED`), computes the gate with the existing `nextGate` (one additive allow-list entry in `boundaries.test.ts` for `ui/controller.ts` only), keeps `lastPrivateSeat` and `acknowledgedSeat` in the controller, adds `AppModel.gate` (public data only; `viewer` is null while it is pending), `RenderInput.seed`, `RenderInput.publicView` (redacted, for the public components) and the guarded single-use handler `acknowledgeGate` (new `OpResult` reason `STALE_GATE`).
      - DOM-free controller tests (stub renderer, immediate scheduler): 2 and 4 human Seats; mixed human and AI Seats; the same-seat policy (no gate when the next private Seat equals the last private Seat); a stale, repeated, wrong-Seat and post-dispose `acknowledgeGate` changes nothing; `viewer` and `view` are null while a gate is pending and `publicView` carries none of the Hands, Guesses or owner-only identities of the test game (serialized scan); the draft and forms are cleared when the viewer changes; with one human Seat the sequence of `viewer`, `view` and `gate` values over a whole game equals the behaviour before this task (`gate` always null); `RenderInput.seed` equals the game Seed and is null without a game.
      - Guess form rule: the host mounts a Guess form only when every AI Seat of the batch has `guessSubmitted`; a test shows that AI submissions in `GUESS_COLLECT` never make an open form stale, with one and with two human Seats.
    - (b) Host and wiring (`ui/screens/game.ts`, `ui/main.ts`, `ui/shell.ts`): one host built on persistent handles that are reconciled by `update(input)` (typed Guess text, focus and gestures survive a re-render); private DOM removed synchronously before the gate is shown, and nothing else drawn while it is shown; exactly one provisional banner (child screens get `{ banner: false }`; the shell's static banner and its "not connected yet" notice are removed from the production page, title and language selector stay); overlay state owned by the host and changed only through `reduceOverlay`, underlying controls inert while an overlay is open, Help from every screen (not over a gate), abandon confirmation only for an active game; no second game-state system, and screens receive no `GameState` and no controller. Fake-DOM tests (`ui/testing/fake-dom.ts`, evidence class 2): handles are reused across renders; one banner on every screen; gate DOM contains no private content and the previous private DOM is gone first; overlay inertness, Escape and focus restoration; Seed line present; update `ui/shell.test.ts` for the removed notice and banner. These tests do not replace tasks 21.2 and 21.3.
    - (c) CSS: `ui/styles/layout.css` as in the design (portrait stack, landscape side-by-side with the Board left, `--cell` clamp that fits 320 px width, controls at least 44 px, no document-level horizontal overflow at 320 and 390 px, `prefers-reduced-motion`, no hover dependence, placement confirm and cancel reachable at 1280×800 without scrolling and at 390×844 by scrolling or a sticky placement bar, documented). Link `tokens`, `card`, `board`, `hand`, `placement`, `setup`, `reveal`, `end`, `overlay` and `layout` CSS from the production page.
    - (d) Real-browser tests: `e2e/game.spec.ts` (Playwright, Chromium) against the production page `/`, with scenarios 1 to 7 of the design table (full game with one human and three BEGINNER AI Seats to a four-player ranking; placement by drag and by position first with exactly one accepted placement and no state change before confirmation; two human Seats with the gate and an absence scan of the previous Seat's Hand and Guess values; reveal and scoring consistency without Hidden_Sum before the reveal and without Guess values; replay same seed and rematch with a different injected Seed through a `page.addInitScript` stub of `crypto.getRandomValues`; overlays; mobile at 390×844 and 320 px width). Change in `playwright.config.ts` only the `webServer.url` to `http://127.0.0.1:5173/`. No new dependency and no production test hook. Record the browser name and version from a real run (`browser.browserType().name()`, `browser.version()`) in `docs/game/ui-progress.md`. Report the results as evidence class 2/3 (real browser engine, emulated viewport and touch), never class 4; make no real-device, other-browser or `vite preview` claim.
    - (e) Known integration defects from `docs/game/ui-progress.md`: fix them, or document each one that is not fixed with its reason and the remaining effect. Defects: the confirm control sits below the fold at 1280×800; the preview owner label ("Player 1") differs from the Hand label ("You"); a stale error line stays after a later drop outside the Board. Each fix gets a test (scenario 2 or a fake-DOM test).
    - (f) Docs: update `docs/game/ui-progress.md` (delivered items, remove the "19.4 must do" block as it is done, record IC-13 as an open question for the owner, the browser name and version, and what is not verified). Do not edit `requirements.md`.
    - Acceptance (sharpened): all of (a) to (f) hold; `npm run typecheck`, `npm run typecheck:game` and `npm run test:game` pass; `npm run test:e2e` passes against the production page; the boundary test passes with the one added allow-list entry; no file under `src/optical` changed.
    - Depends on: 17.2, 17.3, 18.1, 18.2, 19.1, 19.2, 19.3.
    - _Requirements: 8.2, 13.1, 13.6, 14.7, 15.2, 16.9, 17.3, 14.1, 14.2, 14.3, 14.8, 15.3, 15.4, 15.5, 16.1, 17.1, 17.2, 17.4, 17.7_

- [x] 20. Persistence
  - [x] 20.1 Save format, validation and migration (`persistence/save-format.ts`)
    - `SaveEnvelope`, `serializeSave`, `parseSave` with hand-written type guards, `MIGRATIONS` (empty), `SAVE_VERSION = 1`.
    - Acceptance: a valid envelope parses to `OK`; a lower version with a test migration returns `MIGRATED`; an unknown version returns `INCOMPATIBLE`; garbage returns `CORRUPT`; no function throws.
    - Tests: unit tests for each result kind.
    - Depends on: 10.1.
    - _Requirements: 18.2, 18.4, 18.5_
  - [x] 20.2 Storage adapters and game loading (`persistence/storage.ts`)
    - `KeyValueStore`, `memoryStore`, `browserStore` (falls back to memory when `localStorage` access throws), `saveGame`, `loadGame`, prefs read and write under `PREFS_KEY`.
    - Acceptance: `loadGame` on a valid save returns `RESUMABLE` with the replayed state; a rejected replay returns `DISCARDED`; a throwing store does not propagate exceptions.
    - Tests: unit tests with `memoryStore` and a throwing store.
    - Depends on: 20.1.
    - _Requirements: 18.1, 18.3, 18.5, 18.6, 18.8_
  - [x] 20.3 Property tests for persistence
    - Create `src/game/persistence/save.properties.test.ts`.
    - **Property 27: Save round trip**
    - **Property 28: Save parser robustness**
    - Acceptance: both properties pass with generated reachable states and mutated texts.
    - Depends on: 20.2.
    - **Validates: Requirements 18.5, 18.7**
  - [x] 20.4 Integrate persistence into the UI
    - Controller saves after every accepted Action; on start shows "continue" or "discard" for a resumable save; shows notices for discarded saves and unavailable storage; removes the save at `ENDED`; stores language and setup prefs.
    - Acceptance: reload in the browser during a game and continue; corrupt the stored text in developer tools and see the notice and the setup screen.
    - Tests: controller tests with `memoryStore` (resume, discard, corrupt, throwing store, end removes save); the DOM variants join task 21.3.
    - Sharpened scope (design.md "Task 20.4 persistence integration contracts"; no change to engine semantics, score values, reveal policy, visibility modes, OQ decisions or optical code; no new requirement). Additional files: `ui/controller.ts`, `ui/store.ts` (and the `initialModel` expectation in `ui/store.test.ts`), `ui/main.ts`, `ui/screens/game.ts`, new `ui/screens/resume.ts`, new `ui/components/notices.ts`, new `i18n/strings/persistence.ts` (registered with the other areas), `ui/controller.persistence.test.ts`, `ui/screens/resume.test.ts`, `ui/components/notices.test.ts`, `ui/screens/game.test.ts`, `e2e/persistence.spec.ts`, `docs/game/save-format.md`, `docs/game/ui-progress.md`. Parts (a) to (e) below are all part of this task. Task 21.x still owns the broader smoke and accessibility suites (21.2 full game, 21.3 privacy, accessibility, language and persistence in `happy-dom`); this task adds only the DOM-free controller tests, the fake-DOM tests of the two new components, and the Playwright file named here, and does not duplicate 21.2 or 21.3.
    - (a) Controller and store, with DOM-free tests (stub renderer, immediate scheduler, `memoryStore` and a throwing store):
      - Dependencies: `AppDeps` and `MountDeps` get optional `store` and `nowIso`; persistence is active only when both exist; the controller imports only `persistence/` and `ui/setup-model` helpers and never `localStorage`, `Date` or `window`. `AppModel` gets `storage`, `resume`, `notices` and `setupPrefs`; `ui/store.ts` declares `NoticeReason` without importing `persistence/`. Without a store every existing controller test passes unchanged (only the `initialModel` expectation in `store.test.ts` gains the four defaults).
      - Save points: one `saveGame` after each accepted human `PLACE` (through `confirmPlacement`), `SUBMIT_GUESSES` and `ACK_REVEAL`, after every accepted AI Action, and after `begin` (overwrites an earlier save; `restart` and `replaySameSeed` included); none after a rejected Action (engine rejection, `PLACE_NOT_ALLOWED`, `STALE_GATE`, `DRAFT_INVALID`); ordering: the save happens before the render and before the next AI step is scheduled (a recording store and renderer prove it); a failed save does not roll back the accepted Action; `storage` is `DURABLE`, `MEMORY_ONLY`, `FAILED` or `UNKNOWN` as designed; an ENDED state removes the save; `abandon` removes it; a failed `clearSave` maps to `FAILED`.
      - Startup and resume: resume from PLACEMENT, from GUESS_COLLECT with no and with partial submissions, and from REVEAL (replayed state equals the saved one, same Seed, Hands and `actionCount`); an ENDED log is not resumable (`SAVE_DISCARDED` with `GAME_ENDED`); `NONE` with `readFailed` gives `STORAGE_READ_FAILED`; `DISCARDED` gives `SAVE_DISCARDED` with the closed reason code only and the setup screen; `resume` holds only the saved time and the human Seat count, and the sealed state is not reachable from the model, the render input or a handler; nothing starts automatically; `STORAGE_NOT_DURABLE` from startup for a non-durable store and `STORAGE_WRITE_FAILED` after a failed write, both cleared by a later durable save.
      - `continueSaved` and `discardSaved`: guards `DISPOSED`, `BUSY`, `NO_RESUME` (none pending, second call, epoch changed by `begin`, `abandon` or `dispose`) with no change on refusal; `discardSaved` clears the save and keeps the prefs; `continueSaved` calls neither `newGame` nor `randomSeed`, resets draft, `gestureEpoch`, gate markers and AI schedule, resumes a pending AI step, and writes nothing until the next accepted Action; any start while an offer is pending drops the offer and overwrites the save, a rejected start keeps both.
      - Gate after resume: with 2 and with 4 human Seats `viewer` and `view` are null and `gate` is set before any private view, `publicView` carries no Hand, Guess or owner-only identity (serialized scan); one human Seat has no gate; an acknowledgement made before the reload, for an earlier render or for another game fails with `STALE_GATE`.
      - Prefs: stored `language` goes through `isLang`, stored `setup` through `sanitizeSetupPrefs` (junk, `EXPERT` and out-of-range values fall back per field); the Seed is never written; prefs are written on a language change, on `setSetupPrefs` and on a start from setup; a failing prefs write is silent (no notice); prefs survive `clearSave`, a discard, a corrupt save and an ENDED game.
      - Notices and privacy: `dismissNotice` removes only `SAVE_DISCARDED` and `STORAGE_READ_FAILED`; at most one notice per kind; a serialized scan of the model, the render input and every notice finds no save text, card, Guess, Seed or engine detail; the controller makes no `console` call.
    - (b) Host prompt and notices region (fake-DOM tests, `ui/testing/fake-dom.ts`, evidence class 2; strings in ko and en with REVIEW marks, placeholder parity test as for the other areas): `ui/screens/resume.ts` shows Continue and Discard (keyboard operable, focus on the prompt heading) instead of the setup screen while `model.resume` is not null, and renders no card, Guess, sum or Board; `ui/components/notices.ts` renders one `aria-live="polite"` region with localized text, dismiss buttons only for the two dismissible kinds, no "saved" wording unless `storage` is `DURABLE`, and the not-durable and write-failed texts say the game will not survive a reload; the host passes `model.setupPrefs` as the setup screen's `initialPrefs` and `handlers.setSetupPrefs` as `onPrefsChange`; the one-banner and persistent-handle rules of task 19.4 still hold.
    - (c) `ui/main.ts` wiring: build `browserStore()` and `() => new Date().toISOString()` and pass them to `mountApp` (the only place that touches either); the stored language is applied through the model on the first render (`mountShell` stays unchanged); no new global, no network call, no new dependency.
    - (d) Real-browser tests: `e2e/persistence.spec.ts` (Playwright, Chromium, production page `/`) with scenarios A to G of the design table (A reload during placement; B reload during Guess collection with two humans and a partial submission; C two-human resume shows the gate first with no private content in the DOM; D corrupted stored JSON set through `page.evaluate`; E storage unavailable or failing through an init script, two variants; F finished game, no Continue and prefs remain; G existing `game.spec.ts` and playground specs still pass). Same Seed stub as `e2e/game.spec.ts`; no production test hook; no change to `playwright.config.ts`. Record the browser name and version from a real run in `docs/game/ui-progress.md`. Report the results as evidence class 2/3 (real browser engine, emulated viewport), never class 4; make no real-device, other-browser or `vite preview` claim.
    - (e) Docs: update `docs/game/save-format.md` (resolve "Concerns for task 20.4": gate after resume, no logging or display of saved data, save points and `ENDED` removal, the pending-batch decision stays open with the provisional behaviour, Seed protection stays with IC-13, no encryption) and `docs/game/ui-progress.md` (delivered items, privacy limits of the design section g, browser name and version, what is not verified). Do not edit `requirements.md`.
    - Acceptance (sharpened): all of (a) to (e) hold; reload in the browser during a game and continue works; a corrupted stored text gives the notice and the setup screen; `npm run typecheck`, `npm run typecheck:game` and `npm run test:game` pass; `npm run test:e2e` passes against the production page; the boundary test passes without a new allow-list entry; no file under `src/optical` changed.
    - Depends on: 20.2, 19.4.
    - _Requirements: 18.1, 18.3, 18.5, 18.6, 18.8, 16.4_

- [ ] 21. UI smoke tests
  - [x] 21.1 Add the headless DOM test environment
    - Add `happy-dom` as a devDependency. Create `src/game/ui/testing/mount.ts` that builds a DOM root, a `memoryStore`, an immediate scheduler and a fixed `randomSeed`, and helpers `clickByLabel`, `typeInto`, `playHumanTurnAuto` (select first Hand card, first legal cell, confirm). Tests select the environment with `// @vitest-environment happy-dom`; do not change `vitest.config.ts`.
    - Acceptance: a trivial test mounts the setup screen and finds the start button; `npm test` still runs optical tests in the `node` environment.
    - Tests: the trivial mount test.
    - Depends on: 19.4.
    - _Requirements: 21.4_
  - [x] 21.2 Full-game UI smoke test (`ui/smoke.test.ts`)
    - Start from setup with a fixed seed, 1 human and 3 AI Seats, play to the final ranking using `playHumanTurnAuto` and automatic Guess entry, and assert the final screen shows a ranking with 4 entries, Hidden_Sum details, the provisional banner at every step, and the seed. Run with both Identity_Visibility values and 3 seeds.
    - Acceptance: no exception, no rejected Action, the game reaches the end screen; rematch starts a game with a different seed; replay-same-seed gives the same initial Hand.
    - Tests: this file.
    - Depends on: 21.1, 20.4, 13.2.
    - _Requirements: 8.2, 13.1, 14.6, 14.8, 15.2, 15.3, 15.4, 15.6, 21.4_
  - [ ] 21.3 Privacy, accessibility, language and persistence smoke tests (`ui/privacy-a11y.test.ts`)
    - With 2 human Seats: the gate appears before each Guess entry and Hand, and the DOM holds no private content while it is shown. Check the board's 64 buttons and their accessible names, arrow-key focus, the live region, language switch to Korean without losing the game, an illegal-cell error message in both languages, an invalid Guess message, resume after re-mount, the corrupt-save notice, and that no AI Guess text appears anywhere in the DOM.
    - Acceptance: all assertions pass in `happy-dom`.
    - Tests: this file.
    - Depends on: 21.1, 20.4.
    - _Requirements: 14.2, 14.3, 14.4, 14.5, 16.4, 16.6, 16.7, 18.3, 18.5, 21.4_

- [ ] 22. Milestone P1 acceptance
  - [ ] 22.1 Practice Mode documentation (`docs/practice-mode.md`)
    - Document install, `npm run dev`, `npm run build`, `npm run preview` (and serving `dist/` with any static server), tests, type-check, how to enter a seed, the provisional scoring notice, the hot-seat honor-system statement, the `OWNER_ONLY` and `FACE_UP` options and the list of Open Questions with their provisional defaults.
    - Acceptance: a reader can start the app and run the tests from the file alone.
    - Tests: none (document); commands are executed in task 22.2.
    - Depends on: 20.4, 16.1.
    - _Requirements: 10.8, 21.6_
  - [ ] 22.2 Run the P1 verification and record the result
    - Run `npm run typecheck`, `npm run typecheck:game`, `npm test` (with `E2E_SEEDS=200` or higher), and `npm run build`; confirm `git status` shows no change under `src/optical` or the codebook; play one game manually in a browser using `npm run dev`, one using `npm run preview`, and record the results in `docs/practice-mode-p1-report.md` (commands, exit codes, date, browser and version used). State only what was run.
    - Acceptance: the report matches the Definition of Milestone P1 item by item, marking each as verified or not verified.
    - Tests: the commands above.
    - Depends on: 22.1, 21.2, 21.3, 13.2.
    - _Requirements: 20.2, 21.5, 21.6, 22.4_

### Milestone P2: Strength, Polish and Offline

- [ ] 23. EXPERT AI and tuning hooks
  - [ ] 23.1 Implement the posterior helpers and the EXPERT strategy (`ai/unseen.ts`, `ai/bayesian.ts`)
    - Candidate sets per hidden card from `unseenCards` and `validOrientations`, exact enumeration up to `MAX_ENUMERATION` and seeded sampling above (`POSTERIOR_SAMPLES`), Guess maximizing expected score under the injected ScoreConfig with the tie-break of design.md, placement as `ADVANCED` plus the `W_GIVE` penalty. Register `EXPERT` in `ai/registry.ts`.
    - Acceptance: against a brute-force expected-score maximizer on small fixtures the chosen Guess matches; with all cards known the Guess equals the exact sum; `FACE_UP` games complete.
    - Tests: fixtures with hand-computed posteriors; enumeration-versus-sampling boundary test.
    - Depends on: 12.1, 9.1.
    - _Requirements: 11.1, 11.3, 11.4_
  - [ ] 23.2 Tuning hooks and ordering record (`ai/params.ts`)
    - Collect all weights, budgets and thresholds of `ADVANCED` and `EXPERT` into one typed `AiParams` object with defaults, accepted by the strategy factories. Add a test that plays 200 games per tier pair with the placeholder ScoreConfig and prints win rates. The test records the numbers and asserts nothing about order (no strength claim).
    - Acceptance: default behavior is unchanged by the refactor (the Property 24 and 25 tests still pass); the printed table is saved to the task notes.
    - Tests: parameter-override unit test (a changed weight changes a chosen placement in a fixture).
    - Depends on: 23.1, 12.3, 13.1.
    - _Requirements: 11.4, 20.6_
  - [ ] 23.3 EXPERT verification tests
    - Re-run the tests of task 12.4 and confirm that they now include `EXPERT` through the registry (Properties 24 and 25 are not duplicated). Create `src/game/ai/bayesian.test.ts` with a generated-case comparison of the `EXPERT` Guess against a brute-force expected-score maximizer on small random posteriors (an example-based test that uses `fast-check` generators but is not one of the 30 design properties), and the recorded decision time of `EXPERT`.
    - Acceptance: all pass; `EXPERT` decision time is recorded and below 3000 ms on the test machine.
    - Tests: `ai/bayesian.test.ts` and the existing `ai/ai.properties.test.ts`.
    - Depends on: 23.1.
    - _Requirements: 10.7, 11.2, 11.3, 11.4, 11.5_
  - [ ] 23.4 Offer EXPERT in the setup screen
    - Add the `EXPERT` option and Korean and English labels to `ui/screens/setup.ts` and `i18n/strings/setup.ts`.
    - Acceptance: a game with three `EXPERT` Seats plays to the end in the UI smoke test (add one case to `ui/smoke.test.ts` through a new file `ui/smoke-expert.test.ts` to avoid editing the P1 test).
    - Tests: `ui/smoke-expert.test.ts`.
    - Depends on: 23.1, 19.1, 21.1.
    - _Requirements: 11.1, 11.7, 15.1_

- [ ] 24. Polish, accessibility and responsive verification
  - [ ] 24.1 Schematic Code View (`core/schematic.ts`, `ui/components/code-overlay.ts`)
    - `schematicModel` and an SVG component showing fragment corners and the Inward_Corner per slot, shown on the reveal screen and for codes whose 4 cards are visible to the viewer. No optical pixel patterns.
    - **Property 30: Schematic model consistency**
    - Acceptance: the property passes; the reveal screen shows the schematic for each revealed code.
    - Tests: `src/game/core/schematic.properties.test.ts`; DOM check in `ui/code-overlay.test.ts`.
    - Depends on: 17.2, 5.1.
    - **Validates: Requirements 13.9, 22.2, 4.4**
  - [ ] 24.2 Motion, toasts and board zoom (`ui/components/toast.ts`, `ui/styles/motion.css`, `ui/components/board.ts`, `ui/screens/game.ts`)
    - Short placement and reveal transitions disabled under `prefers-reduced-motion`; toast and live-region messages for errors; optional board zoom toggle that enlarges cells to 48 px with scrolling, for small phones.
    - Acceptance: with reduced motion emulated, no transition property remains on animated elements; the zoom toggle is keyboard operable and its state is announced.
    - Tests: CSS scan test for the reduced-motion rule; DOM test for the zoom toggle.
    - Depends on: 24.1, 17.2.
    - _Requirements: 16.7, 16.9, 17.1, 17.2_
  - [ ] 24.3 Accessibility tests (`ui/styles/tokens.test.ts`, `ui/a11y-keyboard.test.ts`)
    - Compute WCAG contrast ratios for the declared text and component color pairs of `tokens.css` (at least 4.5:1 text, 3:1 component boundaries); keyboard-only play test (focus order, Escape closes overlays, Enter confirms placement); check that every interactive element has an accessible name.
    - Acceptance: all declared pairs meet the thresholds; fix tokens if not.
    - Tests: the two files.
    - Depends on: 21.1.
    - _Requirements: 16.6, 16.7, 16.8_
  - [ ] 24.4 Responsive verification assets (`docs/responsive-checklist.md`, `ui/styles/responsive.test.ts`)
    - CSS tests: viewport meta present, relative font units, `--cell` clamp with a 24 px minimum, 44 px control minimum, portrait and landscape media queries, no hover-only rule. Create the manual matrix (320×568, 360×640, 390×844, 844×390, 1280×800; Chrome, Firefox, Safari) with empty result columns. State that Playwright is an optional later addition and requires user approval (OQ-11).
    - Acceptance: CSS tests pass; the checklist exists and is unfilled until a human runs it.
    - Tests: `ui/styles/responsive.test.ts`.
    - Depends on: 21.1.
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 19.8_

- [ ] 25. Service Worker and PWA
  - [ ] 25.1 Web app manifest and icons (`ui/public/manifest.webmanifest`, `ui/public/icons/*`, `ui/index.html`)
    - Manifest fields of requirement 19.5 (name, short name, start URL, standalone, theme and background colors, language, icons 192 and 512). Create the icons from a hand-written SVG; decide the raster export method without adding a runtime dependency and record it.
    - Acceptance: a test parses the manifest and checks every required field; `index.html` links it.
    - Tests: `ui/manifest.test.ts`.
    - Depends on: 16.1.
    - _Requirements: 19.5_
  - [ ] 25.2 Service Worker source and build step (`ui/public/sw.js`, `scripts/build-sw.ts`, `package.json`)
    - `sw.js` as in design.md (install with precache, no automatic `skipWaiting`, `SKIP_WAITING` message, activate cleanup of `qroker-practice-*` caches, cache-first fetch for same-origin GET, navigation fallback). `scripts/build-sw.ts` lists files in `dist/`, computes a content hash `BUILD_ID`, replaces the placeholders in `dist/sw.js`. Extend the `build` script to run it after `vite build`.
    - Acceptance: after `npm run build`, `dist/sw.js` lists every built asset and contains no unreplaced placeholder; the test that runs `sw.js` in a stubbed scope shows install caching, no automatic skipWaiting, and old-cache deletion on activate.
    - Tests: `scripts/build-sw.test.ts` (list and hash determinism) and `ui/sw.test.ts` (stubbed `self`, `caches`, `clients`).
    - Depends on: 16.1, 1.2.
    - _Requirements: 19.1, 19.3, 19.4_
  - [ ] 25.3 Registration, update prompt and offline notice (`ui/pwa-register.ts`, `i18n/strings/pwa.ts`, `ui/main.ts`)
    - Register `./sw.js` only in production builds; show the "update available, reload" notice for a waiting worker, post `SKIP_WAITING` on user choice and reload on `controllerchange`; offline and online notices from `online`/`offline` events; swallow registration failures.
    - Acceptance: with a mocked `navigator.serviceWorker`, an installed waiting worker produces the notice and no reload until the user clicks; a rejecting `register` produces no visible error.
    - Tests: `ui/pwa-register.test.ts` in `happy-dom`.
    - Depends on: 25.2, 19.4.
    - _Requirements: 19.2, 19.3, 19.6, 19.7_
  - [ ] 25.4 Offline verification assets (`docs/offline-checklist.md`, `scripts/verify-dist.test.ts`)
    - A test that, when `dist/` exists, checks that every file referenced by `dist/index.html` is in the `sw.js` precache list. A manual checklist: first load online, go offline, reload, play, deploy a changed build, see the update notice, accept it. Results stay blank until a human runs them.
    - Acceptance: the dist test passes after `npm run build` and is skipped with a clear message when `dist/` is absent.
    - Tests: `scripts/verify-dist.test.ts`.
    - Depends on: 25.2, 25.3.
    - _Requirements: 19.1, 19.2, 19.8_

- [ ] 26. Milestone P2 acceptance
  - [ ] 26.1 Run the P2 verification and record the result
    - Run all type checks, `npm test`, `npm run build`; confirm no change under `src/optical`; record in `docs/practice-mode-p2-report.md` what was run and which manual checklists remain unfilled. State no result that was not measured.
    - Acceptance: the report lists verified and unverified items for requirements 11, 16, 17 and 19.
    - Tests: the commands above.
    - Depends on: 23.2, 23.3, 23.4, 24.2, 24.3, 24.4, 25.4.
    - _Requirements: 21.5, 22.4_

### Milestone P3: Simulation and Scoring Tuning Tooling

- [ ] 27. Simulation runner (tooling only; score tuning is not performed here)
  - [ ] 27.1 Implement the Simulation_Runner (`sim/runner.ts`)
    - `GameSimulator.run` and `runBatch` over `playGame`: win rates per strategy, average game length (PLACE count), prediction-score share, hand-empty-bonus impact (fraction of games whose rank order changes when the bonus is removed), score histogram. Deterministic for the same input.
    - Acceptance: results for the same `SimulationConfig` are identical on two runs; win rates sum to at least 1 and ties are counted for every tied winner (documented).
    - Tests: determinism and accounting invariants in task 27.3.
    - Depends on: 13.1, 23.2, 6.1.
    - _Requirements: 20.4, 20.5_
  - [ ] 27.2 Command-line script (`scripts/simulate.ts`, `package.json`)
    - `npm run sim:game -- --seed S --games N --score-config path.json --out file.json` reads a candidate ScoreConfig from JSON (validated by `validateScoreConfig`) and writes the result to `.sim-work/` (add to `.gitignore`).
    - Acceptance: an invalid config file is rejected with `INVALID_SCORE_CONFIG`; output is reproducible.
    - Tests: script argument parsing unit test.
    - Depends on: 27.1.
    - _Requirements: 20.4, 20.5_
  - [ ] 27.3 Runner tests (`sim/runner.test.ts`)
    - Determinism test, accounting invariants (game length between 1 and 48, histogram counts equal games × Seats), and a sweep over two candidate tables that only checks that results differ in structure, not in strength.
    - Acceptance: tests pass.
    - Tests: this file.
    - Depends on: 27.1.
    - _Requirements: 20.4, 20.5, 20.6_
  - [ ] 27.4 Simulation plan document (`docs/simulation-plan.md`)
    - List the planned experiments for qroker-game Requirements 11.1 and 11.2 (dominant-strategy search, solo-completion strategy), the score table candidate families (linear decay, geometric decay, step) and bonus candidates, the metrics to record and the acceptance rule that a human decides the final values. State that no experiment has been run and no value is chosen.
    - Acceptance: the file states "not performed" for every experiment.
    - Tests: none (document).
    - Depends on: 27.1.
    - _Requirements: 20.6, 22.4_

---

## Deferred (not tasks, no checkboxes)

- Scoring Companion integration with `src/optical`: qroker-game Requirements 9.6 to 9.11, the browser-safe codebook loader that the optical module needs, and pixel-level Composite_Code rendering. Status pointer: `docs/optical/OPTICAL-STATUS.md` (being written by another agent; not read or relied on by this spec). The CardId convention of requirement 1 is the integration key.
- Playwright real-browser tests, if the user approves the dependency (OQ-11).
- Final score table and hand-empty bonus (docs/open-decisions.md #7): decided by a human after P3 experiments.
- Fixing docs/open-decisions.md #6 (outdated against qroker-game Requirement 3.5): a documentation change for the owner of that file; this spec does not edit it.

## Open Questions and Decisions for the User

| ID | Decision | Provisional default used by this plan | Affects tasks |
|----|----------|---------------------------------------|---------------|
| OQ-1 | Hidden-identity handling for hot-seat (open-decisions #2) | Option `OWNER_ONLY` (default) and `FACE_UP` both implemented | 8.1, 9.1, 9.2, 13.x, 19.1 |
| OQ-2 | Orientation of the 4 starting cards | All 0° | 8.1 |
| OQ-3 | Valid starting four cards (#3) | CLOSED by the owner: starting group earns no points, opens no guesses, counts zero toward the shared code count; no redeal (qroker-game 4.4b) | 5.1, 8.1 |
| OQ-4 | First-round exemption scope (#6) | RESOLVED by the owner's three-card rules: no exemption, draw from the first placement (earlier default "per-Seat first placement" superseded) | 7.1, 8.2 |
| OQ-5 | First Seat, direction, who guesses | `P0` first, increasing order, all 4 Seats guess | 7.1, 8.2 |
| OQ-6 | Tied rank numbering | Competition ranking (1,1,3,4) | 6.2 |
| OQ-7 | UI framework and bundler | Vite as an explicit devDependency, no UI framework | 16.1 |
| OQ-8 | Number of AI players in P1 | 3 AI plus 1 human (setup allows 1 to 4 humans) | 8.1, 19.1 |
| OQ-9 | Localization scope | Korean and English for UI, help and errors | 15.x |
| OQ-10 | Score table and hand-empty bonus (#7) | `DEV_PLACEHOLDER_SCORE_CONFIG`, tuning deferred | 6.1, 27.x |
| OQ-11 | Headless DOM environment and browser tests | `happy-dom`; Playwright deferred | 21.1, 24.4 |
| OQ-12 | Depth of the Composite_Code visualization | Schematic only | 24.1 |
| OQ-13 | Staging of the third AI tier | `EXPERT` in P2 | 23.x |
| OQ-14 | Post-game disclosure of Guesses | Never disclosed | 8.2, 9.1 |
| OQ-15 | Board row direction | Row 1 at the top | 2.3, 17.2 |
| OQ-16 | Three-card rules and the shared five-code limit (owner decision) | Fixed constants `HAND_SIZE = 3`, `COMPLETED_CODE_LIMIT = 5`; CLOSED by the owner as fixed rules for this version (reward table and bonus stay configurable and provisional) | 3.1, 7.1, 8.1, 8.2, 8.3 (amended text only) |

## Notes

- The approved documents contain gaps and inconsistencies IC-1 to IC-10 (listed in `requirements.md`). None changes an approved rule; each has a provisional default above.
- Property tests follow the tag format `// Feature: qroker-playable-game, Property N: <text>` and run at least 100 iterations.
- Do not mark a checkbox until the task's acceptance criteria and tests pass.
- Owner-directed placement update (IC-11): tasks 17.1 to 17.4 carry the new interaction. The fake-DOM placement tests named in task 17.4 (acceptance tests 2, 6, 8 and 9, DOM variants) are written in task 21.3, because `happy-dom` arrives with task 21.1. Real-device touch behavior is verified only by the manual check in design.md "Manual Verification".
- Commands such as `npm run dev` start long-running servers and must be run by the user in a terminal, not by an automated agent.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "6.1", "6.2", "15.1", "16.1"] },
    { "id": 2, "tasks": ["2.5", "3.1", "4.1", "6.3", "15.2"] },
    { "id": 3, "tasks": ["3.2", "4.2", "5.1", "7.1", "8.1"] },
    { "id": 4, "tasks": ["5.2", "8.2"] },
    { "id": 5, "tasks": ["8.3", "8.4", "9.1", "10.1"] },
    { "id": 6, "tasks": ["9.2", "10.2", "12.1", "20.1"] },
    { "id": 7, "tasks": ["12.2", "20.2"] },
    { "id": 8, "tasks": ["12.3", "16.2", "20.3"] },
    { "id": 9, "tasks": ["12.4", "13.1", "17.1", "19.1", "19.2", "19.3"] },
    { "id": 10, "tasks": ["13.2", "17.2", "17.4"] },
    { "id": 11, "tasks": ["17.3", "18.3"] },
    { "id": 12, "tasks": ["18.1", "18.2"] },
    { "id": 13, "tasks": ["19.4"] },
    { "id": 14, "tasks": ["20.4", "21.1"] },
    { "id": 15, "tasks": ["21.2", "21.3", "22.1"] },
    { "id": 16, "tasks": ["22.2"] },
    { "id": 17, "tasks": ["23.1", "24.3", "24.4", "25.1", "25.2"] },
    { "id": 18, "tasks": ["23.2", "23.3", "23.4", "24.1", "25.3"] },
    { "id": 19, "tasks": ["24.2", "25.4"] },
    { "id": 20, "tasks": ["26.1"] },
    { "id": 21, "tasks": ["27.1"] },
    { "id": 22, "tasks": ["27.2", "27.3", "27.4"] }
  ]
}
```
