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

- [ ] 1. Project structure, toolchain and guards
  - [ ] 1.1 Document the module layout and dependency rules
    - Create `src/game/README.md` with the folder layout and the dependency table from design.md (Architecture), the rule that `src/optical` is not a dependency, and the command list.
    - Acceptance: the file lists `core/`, `ai/`, `sim/`, `persistence/`, `i18n/`, `ui/` and the allowed imports per folder.
    - Tests: none (document). Reviewed with task 1.3.
    - Depends on: none.
    - _Requirements: 12.2, 12.3, 21.6, 22.1_
  - [ ] 1.2 Add the game type-check configuration and npm scripts
    - Modify `tsconfig.json`: add `"exclude": ["src/game/ui/**", "src/game/pwa/**"]` and change nothing else. Create `tsconfig.game.json` extending `./tsconfig.json` with `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `types: ["node"]`, and `include: ["src/game/**/*.ts", "vite.config.ts", "scripts/build-sw.ts", "scripts/simulate.ts"]` with an empty `exclude`.
    - Modify `package.json` scripts: `typecheck` (`tsc -p tsconfig.json`), `typecheck:game` (`tsc -p tsconfig.game.json`), `test:game` (`vitest --run src/game`). Do not modify `vitest.config.ts` (its include glob `src/**/*.test.ts` already covers `src/game`) and do not change existing scripts.
    - Record the result of `npm run typecheck` before the change; after the change the result for files under `src/optical` must be identical.
    - Acceptance: `npm test` still runs the optical tests unchanged; `npm run typecheck:game` passes on a trivial `src/game/core/types.ts` stub; no file under `src/optical` or `vitest.config.ts` changed (check with `git diff --stat`).
    - Tests: run the commands; record outputs in the task notes.
    - Depends on: none.
    - _Requirements: 12.2, 21.5, 21.6_
  - [ ] 1.3 Implement the boundary and scan test
    - Create `src/game/boundaries.test.ts` that scans non-test files under `src/game/**` and `scripts/` game files and fails on: any import path containing `optical` (allow-list only `src/game/core/fragment-layout.parity.test.ts`); any `node:` import in `core/`, `ai/`, `persistence/`, `ui/`; DOM globals (`window`, `document`, `localStorage`, `navigator`) in `core/` and `ai/`; `Math.random`, `Date`, `performance.now`, `crypto` in `core/` and `ai/`; imports in `ai/` of `core/state`, `core/engine`, `core/deck`, `core/replay`, `core/rules`; `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` outside `ui/public/sw.js`; numeric score tables outside `core/score.ts` (pattern: array literals assigned to `rewardByError`).
    - Strip comments and string literals before matching, so that documentation does not trigger the scan. The test passes vacuously while folders are empty.
    - Acceptance: a deliberately planted violation in a temporary file makes the test fail (verified once manually or with a fixture string passed to the scanner function), and the real tree passes.
    - Tests: scanner unit tests with fixture strings for each rule.
    - Depends on: none.
    - _Requirements: 2.6, 10.1, 11.8, 12.2, 12.3, 19.7, 21.3, 22.1_
  - [ ] 1.4 Define the core types
    - Create `src/game/core/types.ts` exactly as in design.md "Core Types": `Suit`, `Rank`, `CardId`, `Orientation`, `Corner`, `Slot`, `PlayerId`, `Owner`, `Difficulty`, `QuadKey`, `GridPosition`, `Result`, `EngineError`, `ErrorCode`, `ScoreConfig`, `NamedScoreConfig`, `IdentityVisibility`, `SeatConfig`, `GameConfig`, `Action`.
    - Acceptance: compiles under `npm run typecheck` and `npm run typecheck:game`; every `ErrorCode` named in the design Error Handling table exists; no runtime code other than type exports.
    - Tests: type-level compile check (a `types.test-d`-style file using `satisfies` assertions, run by `tsc`).
    - Depends on: none.
    - _Requirements: 1.2, 12.7_

- [ ] 2. Card, PRNG, geometry and fragment-layout primitives
  - [ ] 2.1 Implement the card catalog (`core/cards.ts`)
    - `SUITS`, `RANKS`, `ALL_CARDS` (canonical order), `parseCardId`, `suitOf`, `rankOf`, `cardValue`, `hiddenSum`, `groupIdOf`.
    - Acceptance: 52 distinct cards; `parseCardId` returns `INVALID_CARD_ID` for anything else; `hiddenSum` of 4 aces is 4 and of 4 kings is 52; order snapshot matches design.
    - Tests: unit tests for order snapshot, 13 rank values, boundary sums.
    - Depends on: 1.4.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 5.3_
  - [ ] 2.2 Implement PRNG and seed parsing (`core/prng.ts`, `core/seed.ts`)
    - `mulberry32` (own implementation, no import from `src/optical`), `mix32`, `shuffle` (Fisher–Yates), `parseSeed` (decimal range, FNV-1a 32 over UTF-16 code units for other text, `SEED_EMPTY`).
    - Acceptance: two generators with the same seed give identical sequences; `shuffle` is a permutation; input arrays are not mutated.
    - Tests: unit tests with fixed seeds and a recorded first 5 outputs (golden values written when the code is first run).
    - Depends on: 1.4.
    - _Requirements: 2.1, 2.5, 2.6_
  - [ ] 2.3 Implement board geometry (`core/geometry.ts`)
    - `BOARD_SIZE`, `toNotation`, `fromNotation`, `inBounds`, `orthogonalNeighbors`, `candidateQuads`, `quadCells`, `quadKey`, `slotOf`.
    - Acceptance: `D4` is `{row: 3, col: 3}`; row 1 is the top row; the 4 candidate quads of an interior cell contain the cell; a corner cell yields 1.
    - Tests: unit tests for corners, edges and interior cells.
    - Depends on: 1.4.
    - _Requirements: 3.1, 5.1, 5.8_
  - [ ] 2.4 Implement the fragment layout (`core/fragment-layout.ts`) and the parity test
    - `FRAGMENT_LAYOUT`, `INWARD_CORNER`, `isValidMember`, `validOrientations` as in design.md.
    - Create `src/game/core/fragment-layout.parity.test.ts`, the only file allowed to import `src/optical`: for all 52 cards and both orientations compare `FRAGMENT_LAYOUT[suit][orientation]` with `visibleCorners` of `src/optical/fragments.ts`. Do not edit the optical module.
    - Acceptance: the 4 examples of qroker-game Requirement 14.4 hold; parity test passes; the runtime module does not import `src/optical`.
    - Tests: unit tests for the 4 examples plus the full 8-row table; the parity test.
    - Depends on: 1.4.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - [ ] 2.5 Property tests for the primitives
    - Create `src/game/core/testing/card-generators.ts` (`arbSeed`, `arbCard`, `arbFourDistinctCards`) and `src/game/core/primitives.properties.test.ts`.
    - **Property 1: Card catalog and CardId round trip**
    - **Property 2: Card_Value and Hidden_Sum**
    - **Property 3: Seed parsing**
    - **Property 5: Board notation round trip**
    - Acceptance: each property is one test, at least 100 runs, with the tag comment.
    - Depends on: 2.1, 2.2, 2.3, 2.4.
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 2.5, 3.1, 5.3, 5.4**

### Milestone P1: Minimal End-to-End Playable

- [ ] 3. Deck and dealing
  - [ ] 3.1 Implement the deck (`core/deck.ts`)
    - `dealGame(seed)` and `drawTop` as in design.md: shuffle with `mulberry32(seed)`, neutral = first 4, Hand of `Pk` = cards `4+4k` to `7+4k`, deck = remaining 32 with top = last element.
    - Acceptance: partition of 52 cards, no duplicates; `drawTop` on an empty deck returns `card: null` and the same deck.
    - Tests: unit tests for sizes and the empty-deck draw.
    - Depends on: 2.1, 2.2.
    - _Requirements: 2.2, 2.3, 6.6_
  - [ ] 3.2 Golden deal fixture and deck unit tests
    - Create `src/game/core/deck.test.ts` with the golden full initial deal for seed `1` and one more fixed seed (values recorded when first run and then frozen), plus tests that different seeds usually produce different deals (check 2 specific seeds differ).
    - Acceptance: changing the shuffle order or deal order fails the golden test.
    - Tests: golden snapshot assertions written as explicit arrays, not Vitest snapshots.
    - Depends on: 3.1.
    - _Requirements: 2.2, 2.8_

- [ ] 4. Board and placement validation
  - [ ] 4.1 Implement the board and PlacementValidator (`core/board.ts`)
    - `emptyBoard`, `cellAt`, `cardCount`, `validatePlacement` (precedence `INVALID_ORIENTATION`, `OUT_OF_BOUNDS`, `OCCUPIED`, `NOT_ADJACENT`), `placeOnBoard`, `legalCells` (row-major).
    - Acceptance: board is an immutable 64-element array; placing returns a new board; the starting 2×2 plus any adjacent cell is accepted; non-adjacent is rejected.
    - Tests: unit tests for each error code and for the 8 cells adjacent to the starting group.
    - Depends on: 2.3, 1.4.
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.8_
  - [ ] 4.2 Property tests for the board
    - Create `src/game/core/testing/board-generators.ts` (`arbBoard` by repeated legal placements from the starting 2×2) and `src/game/core/board.properties.test.ts`.
    - **Property 6: Placement validation completeness and board immutability**
    - **Property 7: Board card count increases by one**
    - **Property 8: Legal cell enumeration**
    - Acceptance: Properties pass with at least 100 runs; Property 8 includes boards with 51 and 52 cards.
    - Depends on: 4.1.
    - **Validates: Requirements 3.2, 3.3, 3.6, 3.7, 3.8, 3.9**

- [ ] 5. Composite Code detection
  - [ ] 5.1 Implement the detector (`core/composite-code.ts`)
    - `detect(board, placedAt, scoredGroups)` returning `CompositeCodeResult[]` ordered by `quadKey`, with `groupId` sealed for engine use only.
    - Acceptance: a quad with 4 occupied cells but one invalid member returns no code; a quad with 4 valid members returns one code with the correct Hidden_Sum; a `groupId` already in `scoredGroups` is not returned; the starting 2×2 is never returned because it is not examined when no cell is newly placed.
    - Tests: fixtures built by hand on a board for the 4 valid/invalid examples of qroker-game Requirement 14.4, a two-codes-at-once placement, and a recorded `groupId` skip.
    - Depends on: 4.1, 2.4, 2.1.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8_
  - [ ] 5.2 Property tests for detection and member validity
    - Create `src/game/core/composite-code.properties.test.ts`.
    - **Property 9: Member validity equals fragment-corner membership**
    - **Property 10: Detection structure**
    - **Property 11: Detection idempotence**
    - Acceptance: Properties pass; Property 10 uses a reference implementation written independently inside the test (scan all 4 candidate quads by brute force).
    - Depends on: 5.1.
    - **Validates: Requirements 4.1, 4.4, 4.5, 5.1, 5.2, 5.3, 5.5, 5.6, 5.8**

- [ ] 6. Scoring, configuration and ranking
  - [ ] 6.1 Implement the score engine (`core/score.ts`)
    - `RULES_VERSION`, `DEV_PLACEHOLDER_SCORE_CONFIG` (with the "development placeholder, no balance claim" comment and `provisional: true`), `validateScoreConfig`, `score`, `validateGuess`.
    - Acceptance: the placeholder passes `validateScoreConfig`; invalid tables (empty, negative, increasing, first value 0, NaN, negative bonus) are rejected with `INVALID_SCORE_CONFIG`; `validateGuess(3.5)` gives `GUESS_NOT_INTEGER`, `validateGuess(53)` gives `GUESS_OUT_OF_RANGE`.
    - Tests: unit tests for table boundaries e = length − 1, length, length + 1; the numeric-literal scan from task 1.3 passes with this file as the only owner of a table.
    - Depends on: 1.4.
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 7.2_
  - [ ] 6.2 Implement ranking (`core/ranking.ts`)
    - `rankPlayers(scores)` with competition ranking, ordered by rank then seat.
    - Acceptance: scores `[5,5,3,0]` give ranks `[1,1,3,4]`; all equal gives `[1,1,1,1]`.
    - Tests: unit tests for the two examples.
    - Depends on: 1.4.
    - _Requirements: 9.4, 9.5_
  - [ ] 6.3 Property tests for scoring and ranking
    - Create `src/game/core/scoring.properties.test.ts`.
    - **Property 15: Score function and configuration validation**
    - **Property 16: Guess validation**
    - **Property 20: Ranking**
    - Acceptance: Properties pass with generators for valid and invalid tables.
    - Depends on: 6.1, 6.2.
    - **Validates: Requirements 7.2, 8.1, 8.2, 8.3, 9.4, 9.5**

- [ ] 7. Draw and turn management
  - [ ] 7.1 Implement `shouldDraw` and `nextSeat` (`core/draw.ts`, `core/turn.ts`)
    - As in design.md. `shouldDraw(player, firstPlacementDone, newCodes)` and the cyclic `nextSeat`.
    - Acceptance: full truth table (first placement yes/no × codes 0/1/2) gives the values of requirements 6.3 to 6.5; `nextSeat` cycles `P0` to `P3` and back.
    - Tests: exhaustive truth-table unit tests. The reducer-level draw property is Property 12 in task 8.3.
    - Depends on: 3.1.
    - _Requirements: 6.1, 6.3, 6.4, 6.5_

- [ ] 8. Engine state and reducer
  - [ ] 8.1 Implement `GameState`, rules and `newGame` (`core/state.ts`, `core/rules.ts`)
    - `GameState`, `PendingBatch`, `RevealRecord`, `NewGameOptions`, `newGame`, `defaultConfig` (1 human `P0` + 3 AI, `DEV_PLACEHOLDER_SCORE_CONFIG`, `OWNER_ONLY`), config validation (`INVALID_CONFIG`, `INVALID_SCORE_CONFIG`). Neutral cards at orientation 0 with owner `NEUTRAL` (OQ-2), `turn = P0`.
    - Acceptance: 20 dealt cards, 32 deck cards; board holds 4 cards on D4, E4, D5, E5; invalid configs return errors; no code is pending at start.
    - Tests: unit tests for the initial state fields and invalid configs (3 seats, duplicate seat id, invalid score config).
    - Depends on: 3.1, 4.1, 6.1.
    - _Requirements: 2.2, 3.1, 5.7, 6.1, 8.3, 8.4, 12.1, 12.6_
  - [ ] 8.2 Implement the reducer (`core/engine.ts`)
    - `reduce` for `PLACE`, `SUBMIT_GUESSES`, `ACK_REVEAL` exactly as in design.md "Reducer", plus `actingSeats`. Append every accepted action to `log`.
    - Acceptance: scenarios of the design's Testing Strategy pass: first placement with a code (no draw, guess phase), non-first placement without a code (draw), a placement with two codes (one batch), a Hand-emptying placement with a code (reveal then `ENDED` with bonus), a Hand-emptying placement without a code (`ENDED` immediately), deck exhaustion, all error codes of the Error Handling table.
    - Tests: example scenarios built from hand-picked states (construct a `GameState` through a test helper that overrides hands, deck and board).
    - Depends on: 8.1, 5.1, 7.1, 6.2, 4.1.
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.6, 7.9, 8.1, 8.6, 8.7, 8.8, 9.1, 9.2, 9.3, 9.7_
  - [ ] 8.3 Property tests for the reducer: deal, draw, conservation, authorization
    - Create `src/game/core/testing/state-generators.ts` (`arbConfig`, `randomLegalAction`, `arbReachableState`) and `src/game/core/engine.properties.test.ts`.
    - **Property 4: Deterministic deal partition**
    - **Property 12: Draw rule**
    - **Property 13: Conservation invariants under random legal play**
    - **Property 14: Action authorization**
    - Acceptance: Properties pass; generated states are reachable (built only by `newGame` and `reduce`); the draw property includes states with an empty deck.
    - Depends on: 8.2.
    - **Validates: Requirements 2.2, 2.3, 2.4, 3.4, 3.6, 3.7, 5.7, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.9, 9.2**
  - [ ] 8.4 Property tests for guess collection, reveal and game end
    - Create `src/game/core/engine.reveal.properties.test.ts`.
    - **Property 17: Simultaneous reveal**
    - **Property 18: Submission protocol**
    - **Property 19: Hand-empty bonus and game end ordering**
    - Acceptance: Property 17 permutes the 4 Seats' submission order; Property 19 plays random legal games to the end.
    - Depends on: 8.2.
    - **Validates: Requirements 7.3, 7.4, 7.6, 7.7, 8.6, 8.7, 8.8, 9.1, 9.3**

- [ ] 9. Player views and information isolation
  - [ ] 9.1 Implement the ViewProjector (`core/view.ts`)
    - `PlayerView`, `viewFor`, `unseenCards`, `legalCellsFor`, with both Identity_Visibility rules and the visibility table of design.md. Hand returned in canonical order. The view contains no seed, groupId, deck contents or other Hands.
    - Acceptance: for a fixed state, `OWNER_ONLY` shows the viewer's own placed cards, Neutral_Cards and revealed cards and hides the rest; `FACE_UP` shows all; `unseenCards` plus visible identities plus own Hand equals the 52 catalog.
    - Tests: unit tests for both modes and for the unseen-pool identity.
    - Depends on: 8.2.
    - _Requirements: 5.8, 7.5, 10.1, 10.2, 10.3, 10.4, 10.5_
  - [ ] 9.2 Leakage and non-interference property tests
    - Create `src/game/core/testing/perturb.ts` (`arbHiddenPerturbation`) and `src/game/core/view.properties.test.ts`.
    - **Property 22: No leakage of pending or hidden information in views**
    - **Property 23: View non-interference**
    - Acceptance: Property 22 serializes every viewer's view in every phase and searches for the banned items (use the real `groupId`, Hand cards, deck cards and Guess values of the sealed state as search needles); Property 23 passes for both visibility modes.
    - Depends on: 9.1.
    - **Validates: Requirements 5.8, 7.5, 7.8, 10.3, 10.4, 10.5, 10.6**

- [ ] 10. Replay
  - [ ] 10.1 Implement replay (`core/replay.ts`)
    - `replay(seed, config, actions)` with `REPLAY_REJECTED` carrying the index and cause; `stateEquals`.
    - Acceptance: replaying a generated log reproduces the state; a log with a corrupted action fails at the right index.
    - Tests: unit tests for success and the failing index.
    - Depends on: 8.2.
    - _Requirements: 12.4, 12.5_
  - [ ] 10.2 Property test for replay and purity
    - Create `src/game/core/replay.properties.test.ts` with deep-freeze helpers.
    - **Property 26: Replay determinism and purity**
    - Acceptance: inputs deep-frozen in the test never cause a thrown mutation error.
    - Depends on: 10.1.
    - **Validates: Requirements 12.1, 12.4, 12.5, 20.3**

- [ ] 11. Checkpoint: engine complete
  - Ensure all tests pass (`npm test`), the boundary test passes, and `npm run typecheck` and `npm run typecheck:game` pass. Ask the user if questions arise, in particular about OQ-1 to OQ-6.

- [ ] 12. AI opponents, tiers BEGINNER and ADVANCED
  - [ ] 12.1 Define the AI framework (`ai/strategy.ts`)
    - `AiContext`, `AIStrategy`, `DIFFICULTY_LABELS` (Korean and English), work-budget helper `takeBudget` that counts evaluated candidates and truncates enumeration deterministically, and shared candidate enumeration over `PlayerView` (hand cards × legal cells × orientations in fixed order).
    - Acceptance: the framework imports only the modules allowed for `ai/` (boundary test passes); enumeration order is stable.
    - Tests: unit tests for enumeration order and budget truncation.
    - Depends on: 9.1.
    - _Requirements: 11.3, 11.4, 11.7, 11.8_
  - [ ] 12.2 Implement the BEGINNER strategy and the registry (`ai/random.ts`, `ai/registry.ts`)
    - Uniform legal placement and uniform Guess in 4..52 per code, tie-breaking through `mulberry32(decisionSeed)`. `getStrategy('BEGINNER')`.
    - Acceptance: returned actions are accepted by `reduce` in 100 hand-seeded states; same view and seed give the same action.
    - Tests: unit tests of determinism and validity on 3 fixed seeds.
    - Depends on: 12.1.
    - _Requirements: 11.1, 11.2, 11.3, 11.7_
  - [ ] 12.3 Implement the ADVANCED strategy (`ai/heuristic.ts`)
    - Placement scoring by quads (`W_COMPLETE`, `W_PARTIAL[k]`, probability product for hidden members from `unseenCards` and `validOrientations`), Guess from known cards plus the mean of valid unseen cards. Named constants for all weights and `WORK_BUDGET`. Register it in `ai/registry.ts`.
    - Acceptance: with all members visible, a placement that completes a valid quad is chosen over one that does not (fixture); the Guess equals the exact sum when all 4 cards are known; Guess always in 4..52.
    - Tests: fixtures for completing placement and exact-sum guess; hidden-member fixture with a hand-computed expected guess.
    - Depends on: 12.2.
    - _Requirements: 11.1, 11.2, 11.3, 11.4_
  - [ ] 12.4 Property tests for the AI
    - Create `src/game/ai/ai.properties.test.ts`.
    - **Property 24: AI action validity and determinism**
    - **Property 25: AI non-interference**
    - Each property test iterates over every strategy id returned by the registry at test time, so `EXPERT` is covered automatically once it is registered in task 23.1. Also record per-tier decision time over 50 reachable states and fail above 3000 ms (an example test in the same file, not a property).
    - Acceptance: both properties pass for every registered tier (`BEGINNER` and `ADVANCED` in P1) in both visibility modes; timing is printed in the test output.
    - Depends on: 12.2, 12.3, 9.2.
    - **Validates: Requirements 10.7, 11.2, 11.3, 11.4, 11.5**

- [ ] 13. Headless play harness and end-to-end test
  - [ ] 13.1 Implement the headless driver and the simulator types (`sim/play-game.ts`, `sim/types.ts`)
    - `playGame` as in design.md and the `SimulationConfig`, `SimulationResult`, `GameSimulator` interfaces (signatures only). `playGame` checks the invariants of design.md "Invariants" after every Action when `checkInvariants` is true.
    - Acceptance: a 4-AI game ends in `ENDED`; a forced bad strategy that returns an illegal action makes `playGame` throw with the rejected Error_Code.
    - Tests: unit tests for one fixed seed and the bad-strategy case.
    - Depends on: 12.3, 10.1.
    - _Requirements: 20.1, 20.4_
  - [ ] 13.2 End-to-end headless test (`sim/e2e.test.ts`)
    - Play `playGame` for Seeds `0..N-1` (N from `E2E_SEEDS`, default 200) with strategy mixes (all `BEGINNER`, all `ADVANCED`, mixed) and both visibility modes; assert termination, zero rejected Actions, invariants, replay equality, and at most 48 `PLACE` Actions.
    - **Property 21: Termination and bounded length**
    - Acceptance: the test passes for the default N. Record the elapsed test time in the task notes; if the run is too slow for CI, lower the default N but keep at least 200 for the P1 acceptance run in task 22.2.
    - Depends on: 13.1.
    - **Validates: Requirements 9.6, 9.7, 20.2, 20.3**

- [ ] 14. Checkpoint: headless game complete
  - Ensure all tests pass. Ask the user if questions arise, in particular whether to keep the placeholder score values for P1 playtests.

- [ ] 15. Localization
  - [ ] 15.1 Implement the localization core (`i18n/index.ts`, `i18n/types.ts`)
    - `t`, `setLanguage`, `getLanguage`, `detectLanguage`, `errorMessageKey`; area tables merged from `i18n/strings/*.ts`, each exporting `{ en, ko }` with the Korean table typed as `Record<keyof typeof en, string>`. Create `i18n/strings/common.ts` (app title, buttons, seat names, difficulty labels, provisional banner `provisional scoring` / `임시 점수 규칙`).
    - **Property 29: Localization completeness and language detection**
    - Acceptance: the property test passes (keys equal, placeholder names equal, detection rules); the test discovers area files by directory listing so later areas are covered automatically.
    - Tests: `src/game/i18n/i18n.properties.test.ts`.
    - Depends on: 1.4.
    - **Validates: Requirements 14.8, 16.2, 16.4, 16.5, 12.7**
  - [ ] 15.2 Error message strings (`i18n/strings/errors.ts`)
    - One Korean and one English message per `ErrorCode`, with the 5 approved Korean placement messages copied verbatim from the approved qroker-game design (see design.md Error Handling) and the other Korean texts from the design table, marked with a comment `// REVIEW: new text, needs native-speaker check`.
    - Acceptance: every `ErrorCode` has an entry; the 5 verbatim strings match; Property 29 still passes.
    - Tests: unit test comparing the 5 verbatim strings.
    - Depends on: 15.1.
    - _Requirements: 12.7, 16.3_

- [ ] 16. UI shell
  - [ ] 16.1 Add Vite and the app shell
    - Install Vite as a devDependency with a version range that satisfies the Vitest peer range (the workspace currently has Vite 8.3.8 transitively; verify with `npm ls vite`). Create `vite.config.ts` (`root: 'src/game/ui'`, `base: './'`, `build.outDir: '../../../dist'`, `build.target: 'es2022'`), `src/game/ui/index.html` (viewport meta, `lang`, title, root element), `src/game/ui/main.ts` (placeholder mount). Add scripts `dev`, `build` (`tsc -p tsconfig.game.json --noEmit && vite build`), `preview`. Add `dist/` to `.gitignore`.
    - Acceptance: `npm run dev` serves a page; `npm run build` produces `dist/index.html` with hashed assets; `npm test` is unaffected (vitest still uses `vitest.config.ts`).
    - Tests: run `npm run build` and record the output size and exit code in the task notes (no size claim in documents).
    - Depends on: 1.2.
    - _Requirements: 17.5, 21.6_
  - [ ] 16.2 Implement the UI core (`ui/dom.ts`, `ui/store.ts`, `ui/controller.ts`)
    - `h()` DOM helper, `AppModel`, `AppDeps`, `mountApp`, the controller that owns the sealed `GameState`, applies Actions, drains AI turns through `deps.schedule` (`AI_DELAY_MS = 600`), exposes only `PlayerView` to screens, and re-renders with focus restoration.
    - Acceptance: with an immediate scheduler, a game of 4 AI-controlled Seats plays to `ENDED` through the controller (headless DOM-free unit test of the controller with a stub renderer); no screen module imports `core/state` or `core/engine`.
    - Tests: controller unit tests with a stub renderer; boundary test extended with the `ui/` import rule.
    - Depends on: 16.1, 12.2, 10.1, 15.1.
    - _Requirements: 10.1, 11.6, 12.1_

- [ ] 17. Board, card faces and placement interaction
  - [ ] 17.1 Card face component (`ui/components/card-face.ts`, `ui/styles/tokens.css`, `ui/styles/card.css`)
    - Render face-up cards as rank plus suit glyph with a shape cue per suit and a 180° indicator, and face-down cards with owner and orientation only. Define the color tokens used everywhere. Mobile-first sizing with a `--cell` custom property.
    - Acceptance: a face-down card has no rank or suit text in its DOM subtree; every card has an accessible name.
    - Tests: component unit tests in `happy-dom` (environment docblock) after task 21.1; until then the tests run in the controller-free node environment by testing a pure `cardFaceModel` function.
    - Depends on: 16.2.
    - _Requirements: 13.7, 13.8, 16.7_
  - [ ] 17.2 Board component (`ui/components/board.ts`, `ui/styles/board.css`, `i18n/strings/board.ts`)
    - 8×8 grid with `role="grid"`, 64 `<button>` cells, labels A–H and 1–8, legal-cell highlight, preview ghost, arrow-key roving focus, accessible names (notation, state, owner), highlight of pending-code regions.
    - Acceptance: 64 buttons; arrow keys move focus within the grid; legal cells carry a visible marker that does not rely on color alone.
    - Tests: board model unit tests (pure functions for names and highlights); DOM tests join in task 21.3.
    - Depends on: 17.1.
    - _Requirements: 13.1, 13.3, 13.9, 16.6, 16.7, 17.2_
  - [ ] 17.3 Hand and placement controls (`ui/components/hand.ts`, `ui/components/placement-controls.ts`, `i18n/strings/hand.ts`)
    - Hand of the active human Seat only, orientation toggle (0°/180°), preview then confirm flow, error message display for illegal cells, disabled state with AI status text while an AI Seat acts.
    - Acceptance: the confirm button is the only path that sends `PLACE`; controls are at least 44 px tall in CSS.
    - Tests: placement-state reducer unit tests (select, toggle, preview, confirm, cancel).
    - Depends on: 17.1.
    - _Requirements: 13.2, 13.3, 13.4, 13.5, 13.6, 17.2_

- [ ] 18. Guess entry, privacy gate, reveal and scoreboard
  - [ ] 18.1 Pass_Device_Gate and Guess entry (`ui/screens/privacy-gate.ts`, `ui/screens/guess-entry.ts`, `i18n/strings/guess.ts`)
    - The gate removes private DOM before it is shown and renders nothing private; Guess entry has one numeric input per Quad_Key with validation by `validateGuess` and inline messages; the draft is cleared after submission.
    - Acceptance: with 2 human Seats the gate appears between Seats; no Hand card, Guess value or owner-only identity is in the DOM while the gate is shown; no Hidden_Sum is shown during entry.
    - Tests: pure model tests for gate sequencing (`nextGate(model)`); DOM tests in task 21.3.
    - Depends on: 16.2, 15.1.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_
  - [ ] 18.2 Reveal screen and scoreboard (`ui/screens/reveal.ts`, `ui/components/scoreboard.ts`, `i18n/strings/reveal.ts`)
    - Reveal shows per code the 4 revealed cards and the Hidden_Sum, and a table of earned and cumulative points; no Guess values. Scoreboard shows scores, Hand sizes, Seat names and deck size on every game screen.
    - Acceptance: the reveal view model contains no Guess field (type-level and test).
    - Tests: view-model unit tests.
    - Depends on: 16.2.
    - _Requirements: 14.6, 14.7_

- [ ] 19. Lifecycle screens and screen composition
  - [ ] 19.1 Setup screen (`ui/screens/setup.ts`, `i18n/strings/setup.ts`)
    - Seed field with random default, 1–4 human Seats (default 1), difficulty per AI Seat (`BEGINNER`, `ADVANCED` in P1), Identity_Visibility option (default `OWNER_ONLY`, OQ-1), language switch; validation with `parseSeed`; prefs saved through the storage adapter once task 20.2 exists.
    - Acceptance: starting from the setup screen calls `newGame` with the entered values; empty seed field shows `SEED_EMPTY` message or draws a random seed (as specified in requirement 2.7).
    - Tests: setup model unit tests (options to `GameConfig`).
    - Depends on: 16.2.
    - _Requirements: 2.5, 2.7, 15.1, 15.2_
  - [ ] 19.2 Final screen (`ui/screens/end.ts`, `i18n/strings/end.ts`)
    - Final ranking with shared ranks, final scores, all reveal records with Hidden_Sum details, buttons rematch (new seed), replay same seed, new setup.
    - Acceptance: tied scores display equal ranks; rematch uses the same seats and options with a new seed.
    - Tests: view-model unit tests including a tie.
    - Depends on: 16.2.
    - _Requirements: 9.4, 9.7, 15.3, 15.4_
  - [ ] 19.3 Help overlay, provisional banner and settings (`ui/overlays/help.ts`, `ui/components/banner.ts`, `i18n/strings/help.ts`)
    - Rules text in Korean and English summarizing placement, orientation, drawing, guess and reveal, ranking and the provisional scoring notice; closes with Escape and a button; banner visible while `scoreConfig.provisional`; abandon-game confirmation overlay.
    - Acceptance: overlay opens from every screen; the abandon confirmation precedes discarding.
    - Tests: overlay model unit tests.
    - Depends on: 16.2.
    - _Requirements: 14.8, 15.5, 16.1_
  - [ ] 19.4 Compose the game screen and wire the app (`ui/screens/game.ts`, `ui/main.ts`)
    - Compose scoreboard, banner, seed display, board, hand and controls, guess entry, gate, reveal and end screens into the controller's screen flow; add the mobile-first layout CSS (`ui/styles/layout.css`: portrait stack, landscape side-by-side, `--cell` clamp, 44 px controls, reduced-motion media query).
    - Acceptance: in the browser a full game can be played manually from setup to the final ranking; the seed is displayed; AI turns show the status text.
    - Tests: manual playthrough recorded in task notes; automated coverage arrives with tasks 21.2 and 21.3.
    - Depends on: 17.2, 17.3, 18.1, 18.2, 19.1, 19.2, 19.3.
    - _Requirements: 8.2, 13.1, 13.6, 14.7, 15.2, 16.9, 17.3_

- [ ] 20. Persistence
  - [ ] 20.1 Save format, validation and migration (`persistence/save-format.ts`)
    - `SaveEnvelope`, `serializeSave`, `parseSave` with hand-written type guards, `MIGRATIONS` (empty), `SAVE_VERSION = 1`.
    - Acceptance: a valid envelope parses to `OK`; a lower version with a test migration returns `MIGRATED`; an unknown version returns `INCOMPATIBLE`; garbage returns `CORRUPT`; no function throws.
    - Tests: unit tests for each result kind.
    - Depends on: 10.1.
    - _Requirements: 18.2, 18.4, 18.5_
  - [ ] 20.2 Storage adapters and game loading (`persistence/storage.ts`)
    - `KeyValueStore`, `memoryStore`, `browserStore` (falls back to memory when `localStorage` access throws), `saveGame`, `loadGame`, prefs read and write under `PREFS_KEY`.
    - Acceptance: `loadGame` on a valid save returns `RESUMABLE` with the replayed state; a rejected replay returns `DISCARDED`; a throwing store does not propagate exceptions.
    - Tests: unit tests with `memoryStore` and a throwing store.
    - Depends on: 20.1.
    - _Requirements: 18.1, 18.3, 18.5, 18.6, 18.8_
  - [ ] 20.3 Property tests for persistence
    - Create `src/game/persistence/save.properties.test.ts`.
    - **Property 27: Save round trip**
    - **Property 28: Save parser robustness**
    - Acceptance: both properties pass with generated reachable states and mutated texts.
    - Depends on: 20.2.
    - **Validates: Requirements 18.5, 18.7**
  - [ ] 20.4 Integrate persistence into the UI
    - Controller saves after every accepted Action; on start shows "continue" or "discard" for a resumable save; shows notices for discarded saves and unavailable storage; removes the save at `ENDED`; stores language and setup prefs.
    - Acceptance: reload in the browser during a game and continue; corrupt the stored text in developer tools and see the notice and the setup screen.
    - Tests: controller tests with `memoryStore` (resume, discard, corrupt, throwing store, end removes save); the DOM variants join task 21.3.
    - Depends on: 20.2, 19.4.
    - _Requirements: 18.1, 18.3, 18.5, 18.6, 18.8, 16.4_

- [ ] 21. UI smoke tests
  - [ ] 21.1 Add the headless DOM test environment
    - Add `happy-dom` as a devDependency. Create `src/game/ui/testing/mount.ts` that builds a DOM root, a `memoryStore`, an immediate scheduler and a fixed `randomSeed`, and helpers `clickByLabel`, `typeInto`, `playHumanTurnAuto` (select first Hand card, first legal cell, confirm). Tests select the environment with `// @vitest-environment happy-dom`; do not change `vitest.config.ts`.
    - Acceptance: a trivial test mounts the setup screen and finds the start button; `npm test` still runs optical tests in the `node` environment.
    - Tests: the trivial mount test.
    - Depends on: 19.4.
    - _Requirements: 21.4_
  - [ ] 21.2 Full-game UI smoke test (`ui/smoke.test.ts`)
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
| OQ-3 | Valid starting four cards (#3) | Starting group never scored (qroker-game 4.4b); no redeal | 5.1, 8.1 |
| OQ-4 | First-round exemption scope (#6) | Per-Seat first placement, as in the approved qroker-game 3.5 | 7.1, 8.2 |
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

## Notes

- The approved documents contain gaps and inconsistencies IC-1 to IC-10 (listed in `requirements.md`). None changes an approved rule; each has a provisional default above.
- Property tests follow the tag format `// Feature: qroker-playable-game, Property N: <text>` and run at least 100 iterations.
- Do not mark a checkbox until the task's acceptance criteria and tests pass.
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
    { "id": 9, "tasks": ["12.4", "13.1", "17.1", "18.1", "18.2", "19.1", "19.2", "19.3"] },
    { "id": 10, "tasks": ["13.2", "17.2", "17.3"] },
    { "id": 11, "tasks": ["19.4"] },
    { "id": 12, "tasks": ["20.4", "21.1"] },
    { "id": 13, "tasks": ["21.2", "21.3", "22.1"] },
    { "id": 14, "tasks": ["22.2"] },
    { "id": 15, "tasks": ["23.1", "24.3", "24.4", "25.1", "25.2"] },
    { "id": 16, "tasks": ["23.2", "23.3", "23.4", "24.1", "25.3"] },
    { "id": 17, "tasks": ["24.2", "25.4"] },
    { "id": 18, "tasks": ["26.1"] },
    { "id": 19, "tasks": ["27.1"] },
    { "id": 20, "tasks": ["27.2", "27.3", "27.4"] }
  ]
}
```
