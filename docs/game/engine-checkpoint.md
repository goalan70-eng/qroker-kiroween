# Engine Checkpoint (Task 11) - qroker-playable-game

Status: audit and documentation only. No source file, test, spec, configuration, `src/optical` file or the codebook was changed. No checkbox was ticked, nothing was committed, no open question was resolved, and Task 12 was not started.

## 1. Scope and method

**Scope.** The pure engine under `src/game/core/` as committed in tasks 1 to 10 (HEAD `672d81b`), checked against `requirements.md`, `design.md` and `tasks.md` of `.kiro/specs/qroker-playable-game/`. Everything outside the engine (AI, headless driver, i18n, UI, persistence, PWA, simulation) does not exist yet and is only marked as not yet applicable.

**Method.**

1. Read task 11, the requirements, the design (types, reducer, view, replay, invariants, Properties 1 to 30, error table) and the code of every `core/*.ts` module that the audit cites.
2. Tabulated the property tags with a search for `Feature: qroker-playable-game` over `src/game` (section 2.2). The tags were counted, not assumed.
3. Ran the boundary test and independent searches over `src/game` (section 3).
4. Ran the five command gates and recorded exit codes (section 5).
5. Compared design and code for each claimed difference and listed only differences that were confirmed in code (section 6.3).

**What this audit did not do.**

- It did not re-run the mutation checks and coverage counters that the property-test files record in their end-of-file notes. Numbers cited from those notes are labelled "recorded in the test file".
- It does not measure strategic balance, real cards or real camera reading. Nothing here says anything about them.
- The engine has only been tested headless (Node, Vitest, fast-check). No browser or DOM was involved.

**State of the working tree during the audit.** `git status` showed only `.kiro/specs/qroker-playable-game/tasks.md` (task 11 marked `[-]`) and `tasks.meta.json` as modified. Both were modified before this audit started and were not touched by it. `git diff HEAD -- src/optical` is empty. The SHA256 of `src/optical/codebook.v1.json` is `515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4`, equal to the frozen value.

## 2. Traceability matrix

### 2.1 Requirement groups

Verdicts: MET, MET WITH LIMITATION, NOT YET APPLICABLE, NOT MET. "P" means a design Property (section 2.2). Test files are in `src/game/core/` unless a path is given. Per-file test counts are in section 5.3.

| Req | Group | Implementing modules | Verifying tests | Verdict and reason |
|-----|-------|----------------------|-----------------|--------------------|
| R1 | Card catalog and CardId | `cards.ts`, `types.ts` | `cards.test.ts`, `types.test-d.ts` (checked by `tsc`), P1, P2 in `primitives.properties.test.ts` | MET. 52 distinct ids, canonical order, `INVALID_CARD_ID`, round trip and `hiddenSum` bounds are tested. |
| R2 | Deterministic seeded dealing | `prng.ts`, `seed.ts`, `deck.ts`, `state.ts` (`newGame`) | `prng.test.ts`, `seed.test.ts`, `deck.test.ts` (golden deals for two fixed seeds), `deck.sanity.test.ts`, P3, P4 (twice, see 2.2), boundary test for 2.6 | MET for the engine criteria 2.1 to 2.6 and 2.8. Criterion 2.7 (UI draws a random seed) is NOT YET APPLICABLE. |
| R3 | Board and placement | `board.ts`, `geometry.ts`, `engine.ts` | `board.test.ts`, `geometry.test.ts`, P5, P6, P7, P8, `engine.test.ts`, P14 | MET. The `Action` type has no move or swap action (3.5). 3.9 is covered by P8 including boards with 51 and 52 cards. |
| R4 | Orientation and fragment slots | `fragment-layout.ts` | `fragment-layout.test.ts` (all 8 table rows and the 4 examples), `fragment-layout.parity.test.ts` (only file importing `src/optical`), P9 | MET. |
| R5 | Composite code detection | `composite-code.ts`, `cards.ts` (`groupIdOf`), `rules.ts` (starting group policy) | `composite-code.test.ts`, P2, P9, P10 (independent brute-force reference), P11, P4 (5.7), P22 (5.8) | MET. |
| R6 | Turns and drawing | `draw.ts`, `turn.ts`, `engine.ts` | `draw.test.ts`, `turn.test.ts`, `draw-turn.properties.test.ts` (supplementary), `engine.test.ts`, P12, P13, P14 | MET. 6.6 (empty deck) is covered by 74 empty-deck placements recorded in P12 notes. |
| R7 | Guesses and simultaneous reveal | `engine.ts`, `score.ts` (`validateGuess`), `view.ts` | `engine.test.ts`, P14, P16, P17, P18, P22 (7.5, 7.8) | MET. 7.7 confluence is checked over all 24 submission orders per batch (P17). |
| R8 | Scoring (injected, provisional) | `score.ts`, `rules.ts`, `engine.ts` | `score.test.ts`, `rules.test.ts`, P15, P17 (no completion bonus), P19, boundary rule `score-table` | MET WITH LIMITATION. The mechanism is complete. The values are `DEV_PLACEHOLDER_SCORE_CONFIG` (provisional, OQ-10) and carry no balance claim. |
| R9 | End, ranking, termination | `engine.ts`, `ranking.ts`, `view.ts` | `ranking.test.ts`, P19, P20, P12 (deck empty does not end the game), P22 (ENDED view), `engine.test.ts` | MET WITH LIMITATION. 9.1 to 9.5 and 9.7 are covered. 9.6 (at most 48 `PLACE` with every AI mix) needs `playGame` and P21, which do not exist yet. In P13, 92 of 200 random legal games reached `ENDED` (recorded in the test file); the others were cut by the generator's size limit. |
| R10 | Information isolation | `view.ts` | `view.test.ts`, P22, P23, boundary test | MET WITH LIMITATION. 10.2 to 10.6 are covered. 10.1 and 10.7 need consumers (AI, UI) that do not exist; the `ai/` boundary rule is vacuous today. 10.8 (documentation) belongs to task 22.1. |
| R12 | Reducer and replay | `state.ts`, `engine.ts`, `replay.ts`, `rules.ts`, `score.ts` (`RULES_VERSION`), `types.ts` | `state.test.ts`, `replay.test.ts`, `engine.test.ts`, `rules.test.ts`, P13, P26, boundary test | MET WITH LIMITATION. 12.1 to 12.6 are covered. 12.7 is only half done: the closed `ErrorCode` set exists, the Korean and English messages arrive with task 15.2. 12.5 is verified for the log only; AI Actions do not exist yet. |
| R20 | Headless harness | `replay.ts` only | P26 (the replay half of 20.3) | NOT YET APPLICABLE. `sim/` does not exist. `playGame` and the simulator interface belong to task 13.1; P21 to task 13.2. |
| R21 | Quality gates | `boundaries.test.ts`, property test files | All gates in section 5 | MET WITH LIMITATION. 21.1 holds for 23 of 30 properties (2.3). 21.2 and 21.3 hold (the AI rule is vacuous). 21.4 and 21.6 are not yet applicable. 21.5: `src/optical` is unmodified and its tests pass in `npm run test:ci` and in isolation, but the plain `npm test` failed twice on two 5000 ms timeouts under machine load (section 5.2). |
| R22 | Scope boundaries | whole engine | boundary test, section 3 | MET for the engine. 22.1 holds (no runtime import of `src/optical`), 22.3 and 22.5 hold, 22.4 holds because this document states only what was run. 22.2 (schematic view) is NOT YET APPLICABLE. |
| R11, R13 to R19 | AI, UI, i18n, persistence, PWA | none yet | none yet | NOT YET APPLICABLE. Tasks 12, 15 to 25. |

**Verdict counts.** Of the 14 engine groups audited (R1 to R10, R12, R20, R21, R22): MET 8 (R1 to R7, R22), MET WITH LIMITATION 5 (R8, R9, R10, R12, R21), NOT YET APPLICABLE 1 (R20), NOT MET 0. Counting the 8 groups outside the engine (R11, R13 to R19), all 22 requirement groups: MET 8, MET WITH LIMITATION 5, NOT YET APPLICABLE 9, NOT MET 0.

### 2.2 Design properties found in the tests

Tag search result: 30 tag lines under `src/game`. 24 carry a design property number (Property 4 appears twice). 6 in `draw-turn.properties.test.ts` are tagged `supplementary` and are not design properties. Every property is one `fc.assert` with a fixed seed.

| Property | Test file and tag line | Runs | Coverage guard in the test |
|----------|------------------------|------|-----------------------------|
| P1 | `primitives.properties.test.ts:102` | 200 | none needed (exhaustive over the 52 ids plus generated strings) |
| P2 | `primitives.properties.test.ts:129` | 200 | none |
| P3 | `primitives.properties.test.ts:186` | 200 | none |
| P4 | `deck.properties.test.ts:38` and `engine.properties.test.ts:196` | 200 and 300 | none |
| P5 | `primitives.properties.test.ts:248` | 200 | none |
| P6 | `board.properties.test.ts:130` | 200 | every verdict kind must occur (`tally`) |
| P7 | `board.properties.test.ts:213` | 200 | none |
| P8 | `board.properties.test.ts:338` | 200 | includes boards with 51 and 52 cards |
| P9 | `composite-code.properties.test.ts:177` | 300 | run count asserted |
| P10 | `composite-code.properties.test.ts:240` | 400 | share of planted cases, occupied and empty cells, 1 code, 2 codes, complete-but-invalid quads, skipped scored groups |
| P11 | `composite-code.properties.test.ts:392` | 300 | with-code, two-code and proper-subset counters |
| P12 | `engine.properties.test.ts:309` | 300 | every case kind (first placement, code, draw, empty deck) must occur |
| P13 | `engine.properties.test.ts:437` | 200 games | steps greater than 20 per game on average |
| P14 | `engine.properties.test.ts:737` | 200 | every error kind and phase must occur |
| P15 | `scoring.properties.test.ts:146` | 600 | each of 12 rejection kinds, plateaus, zero tails, cutoff, fractions |
| P16 | `scoring.properties.test.ts:310` | 500 | each of 14 input kinds, accepted share at least 10 percent |
| P17 | `engine.reveal.properties.test.ts:470` | 150 | all 24 submission orders per batch; at most 10 percent of runs without a batch |
| P18 | `engine.reveal.properties.test.ts:752` | 120 | submissions 0 to 3, all other phases probed |
| P19 | `engine.reveal.properties.test.ts:1043` | 200 games | both end kinds; at least 2.5 batches per game on average |
| P20 | `scoring.properties.test.ts:376` | 400 | negatives, fractions, ties, gaps, key-order and seat permutation |
| P22 | `view.properties.test.ts:620` | 200 | every phase category and both visibility modes; real `groupId`, card, hand and guess values as search needles |
| P23 | `view.properties.test.ts:798` | 300 (1200 viewer pairs) | six perturbation kinds, both modes, every viewer; a negative control test exists |
| P26 | `replay.properties.test.ts:805` | 200 | every log origin, final phase and corruption kind |

**Covered by implemented tests: P1 to P20, P22, P23, P26 (23 of 30).**

**Not yet covered (7 of 30), and why:**

| Property | Reason | Task that adds it |
|----------|--------|-------------------|
| P21 Termination and bounded length | needs `playGame` and the AI strategies | 13.2 (after 12.x, 13.1) |
| P24 AI action validity and determinism | `ai/` does not exist | 12.4 |
| P25 AI non-interference | `ai/` does not exist | 12.4 |
| P27 Save round trip | `persistence/` does not exist | 20.3 |
| P28 Save parser robustness | `persistence/` does not exist | 20.3 |
| P29 Localization completeness | `i18n/` does not exist | 15.1 |
| P30 Schematic model consistency | `core/schematic.ts` does not exist (P2 milestone) | 24.1 |

The minimum of 100 iterations (requirement 21.1) holds for every implemented property (smallest: P18 with 120).

## 3. Architecture boundary audit

### 3.1 Boundary test

Command: `npx vitest --run src/game/boundaries.test.ts`. Exit code 0. 1 file passed, 33 tests passed.

The test includes a scan of the real tree, one test group per rule with fixture strings, and planted violations that must fail. Rules scanned: `optical-import`, `node-import`, `dom-global`, `nondeterminism`, `ai-internal-import`, `network-api`, `score-table`.

### 3.2 Independent searches

Searches covered all 56 `.ts` files under `src/game`, searching raw text (comments included, so comment-only hits are listed and judged).

| Check | Result |
|-------|--------|
| Any mention of `optical` in `src/game` | 3 kinds of hits. (a) Doc comments in 17 `core/*.ts` files that say "no import from src/optical". (b) `fragment-layout.parity.test.ts`, lines 13 and 14, imports `../../optical/fragments` and `../../optical/decode-group`. (c) `boundaries.test.ts` rule text and fixtures. No other import. |
| Runtime import of `src/optical` anywhere in `src/game` | None. The only importing file is the parity test, and it is the single entry of `OPTICAL_ALLOW_LIST` in the boundary test. |
| `node:` in non-test `core/` files | Only in comments (board, composite-code, geometry, prng, score, seed). No import. |
| `Math.random`, `Date`, `performance`, `crypto` in non-test `core/` files | Only in comments (board, geometry, prng, seed). No use. The same terms in `core/testing/*.ts` appear only in comments that say they are not used. |
| DOM globals and network APIs (`window`, `document`, `localStorage`, `navigator`, `sessionStorage`, `fetch`, `XMLHttpRequest`, `WebSocket`) in non-test `core/` files | None. |
| `node:` in test files | Only `boundaries.test.ts` (file-system scan). It is a test file and is outside the rule. |
| Module specifiers in non-test `core/` files | Every `from '...'` specifier starts with `./` (no package, no `../`, no dynamic `import(` or `require(`). The engine is self-contained inside `core/`. Import cycles were not checked. |
| `ai/` exists | No. `src/game` contains only `core/`, `boundaries.test.ts` and `README.md`. The rule that `ai/` must not import `core/state`, `engine`, `deck`, `replay` or `rules` is therefore vacuous today. Its scanner is unit-tested with fixtures (boundary test lines 483 to 500). |
| `core/replay.ts`, `state.ts`, `engine.ts`, `deck.ts`, `rules.ts` imported by an `ai/` file | Not applicable. No `ai/` file exists. |
| Fields of `PlayerView` (`core/view.ts`) | `viewer`, `rules`, `phase`, `turn`, `board`, `myHand`, `handCounts`, `deckCount`, `scores`, `pendingQuadKeys`, `guessSubmitted`, `myGuesses`, `lastReveal`, `history`, `ranking`. No `log`, `pending`, `groupId`, `scoredGroups`, `seed` or deck contents; `deckCount` is a number. Tests: P22 (`view.properties.test.ts:620`) serializes every view and checks a whitelist of property names plus the sealed names `seed`, `groupId`, `groupIds`, `scoredGroups`, `log`, `deck`, `pending`, `hands`, `guesses`, `guess`, `revealedCards`; P23 (`:798`) checks non-interference. |

### 3.3 Finding about the boundary test (not a defect)

The boundary test enforces the five `ai/` bans of requirement 21.3 only. The allow-list in `src/game/README.md` and in the design (an `ai/` file may import only `core/types`, `cards`, `geometry`, `fragment-layout`, `board`, `score`, `prng`, `view`) is stricter and is not enforced. For example, a future `ai/` import of `core/turn`, `core/draw` or `core/ranking` would pass the test. This matches the requirement text, so it is recorded as a gap in enforcement, not as a violation. The design table also omits `core/composite-code`, which its own module graph (`AI --> CCD`) allows.

## 4. Invariants audit

| Invariant | Where tested | Coverage guards and notes |
|-----------|--------------|---------------------------|
| Card conservation: deck + board + hands = 52 distinct cards; board count = placements + 4; `scoredGroups` has no duplicates; `GUESS_COLLECT` iff `pending` | P13 (`engine.properties.test.ts:437`), the unit game in `engine.test.ts:578` | Checks after every accepted action; 200 games, 7829 accepted actions recorded; 92 games reached `ENDED`. Oracles are written inside the test and import none of the modules under test. |
| Determinism | P4 (`newGame` twice, `deck.properties.test.ts:38`, `engine.properties.test.ts:196`), P26, `engine.test.ts:496` (same state and action give equal results), `deck.test.ts` golden deals | Seeded generators only. P26 also compares the replayed state to the live state with `stateEquals`. |
| Purity and immutability | P13 (previous state still deep-frozen and equal to its clone; returned state deep-frozen), P26 (deep-frozen seed, config, actions never mutated or thawed), `engine.test.ts:504` and `:526`, P6 (board input unchanged), P22 (view shares no object with the state) | `reduce` and `newGame` return `deepFreeze`d states. |
| Authorization | P14 (`engine.properties.test.ts:737`) | Compared with an independent oracle: 11 rejection codes plus accepted actions; every rejection leaves the state deeply equal to its copy. Recorded counts: 5016 verdicts in 200 states over all four phases. |
| No duplicate scoring | P11 (idempotence, recorded-subset skip), P13 (`scoredGroups` without duplicates), P17 and P19 (earned score is exactly the sum of the table entries, final score = prediction scores + bonus) | `groupId` of a code is recorded in the same reducer step that opens the batch. |
| Hand-empty bonus exactly once | P19 (`engine.reveal.properties.test.ts:1043`), `engine.test.ts:203` to `:256` | 200 games; both end kinds occurred (47 by last guess, 153 by a non-code hand-emptying placement). `withBonus` in `engine.ts` also refuses a second award. |
| Simultaneous reveal | P17 | All 24 submission orders of the four seats per batch; resulting scores, `lastReveal` and `history` equal; the record contains no guess. Apart from the log order, `engine.test.ts:335`. |
| Privacy of views | P22, P23 | See 3.2. Mutation check recorded in the test file (not re-run): letting `showCard` reveal one more owner made both P22 and P23 fail. |
| Replay | P26, `replay.test.ts` (71 tests) | `REPLAY_REJECTED` carries the index of the first rejected action and the engine cause. Corruptions recorded: 600 made, 491 rejected at the expected index, 109 accepted with a different state. |

## 5. Command results and test counts

Environment: Windows, Node v24.20.0, Vitest 5.1.0, TypeScript 7.0.2, 12 logical CPUs. Exit codes were read immediately after each command from `$LASTEXITCODE` with the output redirected to a file.

### 5.1 Gates

| Command | Exit code | Summary |
|---------|-----------|---------|
| `npm run typecheck` (`tsc -p tsconfig.json`) | 0 | no diagnostics |
| `npm run typecheck:game` (`tsc -p tsconfig.game.json`) | 0 | no diagnostics |
| `npx vitest --run src/game/boundaries.test.ts` | 0 | Test Files 1 passed (1); Tests 33 passed (33) |
| `npm run test:game` (`vitest --run src/game`) | 0 | Test Files 30 passed (30); Tests 690 passed (690) |
| `npm test` (`vitest --run`), run 1 | **1** | Test Files 2 failed, 53 passed (55); Tests 2 failed, 1383 passed (1385) |
| `npm test`, run 2 | not captured (see below) | Test Files 2 failed, 53 passed (55); Tests 2 failed, 1383 passed (1385) |
| `npx vitest --run --maxWorkers=1 src/optical/detect.test.ts src/optical/testing/physical-card.test.ts` | 0 | Test Files 2 passed (2); Tests 95 passed (95) |
| `npm run test:ci` (`vitest --run --maxWorkers=4`) | 0 | Test Files 55 passed (55); Tests 1385 passed (1385) |

`test:game` was run a second time with the JSON reporter to get per-file counts: 690 passed, 0 failed, 168 suites, exit code 0.

### 5.2 The `npm test` failures are environmental timeouts, and no clean `npm test` run was obtained

Both `npm test` runs failed the same two tests, each with "Test timed out in 5000ms":

- `src/optical/detect.test.ts:147`, "6. scaling (measured thresholds) > blurred non-integer scales: exact for effective modulePx >= 2.5 (sizePx >= 17.5), spec range 0.5..3x of modulePx 8 included".
- `src/optical/testing/physical-card.test.ts:752`, "3x3 boards with Distractor_Markers > a rotated card is rotated about its centre: its corner moves as the clockwise rotation predicts".

The third known slow test, `decodeGroup smoke`, passed in both runs.

Environment at the time. Before run 1 and before the isolated rerun, CPU load (`Win32_Processor.LoadPercentage`) was 90 to 91 percent. The process `qemu-system-x86_64-headless` (pid 23952) was running throughout. No process was stopped. After the runs the load was 82 percent. The load is a point-in-time reading, not a trace.

Why this is classed as environmental and not as a defect:

1. The two failing tests are in `src/optical`, which this audit did not touch (`git diff HEAD -- src/optical` is empty).
2. Both fail only by the 5000 ms default timeout, with no assertion failure.
3. The same two files pass in isolation with `--maxWorkers=1` (95 tests), and the full suite passes with `npm run test:ci` (1385 tests) at the same load level.

This does **not** show that `npm test` passes. It did not pass in this environment. Task 11 as written ("ensure all tests pass (`npm test`)") is satisfied by `test:ci` and by the isolated rerun, and is not satisfied by a plain `npm test` run on this machine under load. A re-run of `npm test` on an idle machine is the only way to close that gap. The timeouts were not raised and no test was changed.

The exit code of `npm test` run 2 was not captured: the tool wrapper aborted while the run continued in the background, and the summary was read from the output file afterwards. Vitest reports failed tests with a non-zero exit, but that exit code was not observed.

### 5.3 Test counts per file in `src/game` (690 tests, 30 files)

| Tests | File |
|-------|------|
| 33 | `boundaries.test.ts` |
| 3 | `core/board.properties.test.ts` |
| 34 | `core/board.test.ts` |
| 9 | `core/cards.test.ts` |
| 3 | `core/composite-code.properties.test.ts` |
| 70 | `core/composite-code.test.ts` |
| 3 | `core/deck.properties.test.ts` |
| 9 | `core/deck.sanity.test.ts` |
| 32 | `core/deck.test.ts` |
| 30 | `core/draw.test.ts` |
| 6 | `core/draw-turn.properties.test.ts` |
| 4 | `core/engine.properties.test.ts` |
| 3 | `core/engine.reveal.properties.test.ts` |
| 26 | `core/engine.test.ts` |
| 4 | `core/fragment-layout.parity.test.ts` |
| 68 | `core/fragment-layout.test.ts` |
| 33 | `core/geometry.test.ts` |
| 4 | `core/primitives.properties.test.ts` |
| 23 | `core/prng.test.ts` |
| 20 | `core/ranking.test.ts` |
| 2 | `core/replay.properties.test.ts` |
| 71 | `core/replay.test.ts` |
| 8 | `core/rules.test.ts` |
| 71 | `core/score.test.ts` |
| 4 | `core/scoring.properties.test.ts` |
| 23 | `core/seed.test.ts` |
| 44 | `core/state.test.ts` |
| 13 | `core/turn.test.ts` |
| 3 | `core/view.properties.test.ts` |
| 34 | `core/view.test.ts` |

The other 695 tests (25 files) are the existing `src/optical` suite. `types.test-d.ts` has no runtime tests; `tsc` checks it.

## 6. Open decisions

### 6.1 Open questions OQ-1 to OQ-15

**None of the open questions was finalized by this checkpoint.** The "Default in code" column records what the code does today. Changing a default that is marked "rules" changes the outcome of replaying existing logs, so it needs a `RULES_VERSION` increment (requirement 12.6) and updates to the golden fixtures and tests. The "Needed before" column uses the spec's own "Affects tasks" column and the dependency graph.

| OQ | Provisional default implemented in code | Where | Effect on built code | Later tasks that depend on it | Decision needed before |
|----|------------------------------------------|-------|----------------------|-------------------------------|------------------------|
| OQ-1 | Both `OWNER_ONLY` and `FACE_UP` implemented; default `OWNER_ONLY` | `rules.ts:75` `DEFAULT_IDENTITY_VISIBILITY`; `view.ts` `showCard` in `viewFor`; `state.ts` `defaultConfig` | Only the default and the option set can change. Views, P22 and P23 already run in both modes. | Spec table: 8.1, 9.1, 9.2 (built), 13.x, 19.1. Indirectly 12.3 and 12.4, which read `unseenCards` and must be tested in both modes. | 13.x and 19.1 (setup default). Not a start condition for 12.1 or 12.2. |
| OQ-2 | Neutral cards at orientation 0, owner `NEUTRAL` | `board.ts:88` `initialBoard` | Rules change. A seeded random orientation would change `newGame`, goldens and replays. | 8.1 (built) | Before P1 acceptance (22.2); cheapest now. |
| OQ-3 | Starting group never scored, no redeal | `rules.ts:48` `STARTING_GROUP_SCORING`, `startingScoredGroups`; `composite-code.ts` has no special case | Rules change if redeal or adjustment is chosen. | 5.1, 8.1 (built) | Before 22.2. |
| OQ-4 | Per-Seat first placement exempt from drawing | `draw.ts:37` `shouldDraw`; `engine.ts` `reducePlace` (`firstPlacementDone`) | Rules change. | 7.1, 8.2 (built) | Before 22.2. |
| OQ-5 | `P0` first, increasing order, all four seats guess, next turn is `nextSeat(placer)` | `turn.ts:22` `SEATS`, `:39` `nextSeat`; `state.ts` `newGame` (`turn: 'P0'`); `engine.ts` `reduceSubmit` (`SEATS.every`), `reduceAck` | Rules change. | 7.1, 8.2 (built) | Before 22.2. |
| OQ-6 | Competition ranking (1,1,3,4) | `ranking.ts:52` `rankPlayers` | Display and tests of ranking only. | 6.2 (built), 19.2 | Before 19.2. |
| OQ-7 | Vite as explicit devDependency, no UI framework | not built | none | 16.1 | **16.1 (ready now)**. Adds a dependency (flagged D3). |
| OQ-8 | 3 AI plus 1 human by default; setup allows 1 to 4 humans | `state.ts:109` `defaultConfig` (P0 human, P1 to P3 AI, all `BEGINNER`); `rules.ts:96` `validateGameConfig` accepts any HUMAN/AI mix | Config only. | 8.1 (built), 19.1 | 19.1. |
| OQ-9 | Korean and English | not built | none | 15.x (and every UI string table) | **15.1 (ready now)**. Note: the spec table lists OQ-9 under 15.x only, not under 19.x. 19.x needs the strings through 16.2, which depends on 15.1. |
| OQ-10 | `DEV_PLACEHOLDER_SCORE_CONFIG`, `provisional: true` | `score.ts:47` | None; scoring reads only the injected config. | 6.1 (built), 27.x; task 14 asks whether to keep the placeholder for P1 playtests | Task 14 (question), 27.x (final values). No block for 12. |
| OQ-11 | `happy-dom`, Playwright deferred | not built | none | 21.1, 24.4 | 21.1 (adds a dependency, flagged D4). |
| OQ-12 | Schematic view only | not built | none | 24.1 | 24.1 (P2). |
| OQ-13 | `EXPERT` in P2; P1 ships `BEGINNER` and `ADVANCED` | `rules.ts:66` `DIFFICULTIES` already lists `EXPERT` as a valid seat value | `validateGameConfig` accepts an `EXPERT` seat although no strategy exists. | 23.x | 23.1 (P2). |
| OQ-14 | Guess values never disclosed, not even after the game | `engine.ts` clears `pending.guesses` at the reveal; `view.ts` `myGuesses` only during `GUESS_COLLECT` | A change touches reveal records, `view.ts`, P17, P22. | 8.2, 9.1 (built), 18.2 | Before 18.2. |
| OQ-15 | Row 1 at the top | `geometry.ts` (`{row:3,col:3}` is D4), `board.ts` | Display convention only. | 2.3 (built), 17.2 | Before 17.2. |

**About the premise "Task 12 depends on OQ-1".** The spec's table does not list 12.x under OQ-1. It lists 8.1, 9.1, 9.2, 13.x and 19.1. Task 12 can start without an OQ-1 decision. The dependency is indirect: 12.3 uses `unseenCards`, which differs by mode, and 12.4 requires both modes. This is for the user to confirm.

### 6.2 Questions for the user (task 11 asks to raise OQ-1 to OQ-6; the agent cannot ask)

1. OQ-1: keep `OWNER_ONLY` as the default, with `FACE_UP` as an option?
2. OQ-2: keep the four starting cards at 0 degrees?
3. OQ-3: keep "starting group never scored, no redeal"?
4. OQ-4: keep the per-Seat first-placement draw exemption (the approved qroker-game 3.5)?
5. OQ-5: keep `P0` first, increasing order, and all four seats guessing, including the placer?
6. OQ-6: keep competition ranking (1,1,3,4)?

If all six are confirmed, nothing needs to change. If any is changed, the rules-version and golden-fixture rework in 6.1 applies.

### 6.3 Documentation debts (design or README versus code)

Each row was verified by reading the code and the design text. Severity: Low means a doc edit only; Medium means a later task could be misled.

| # | Item | Design says | Code does | Where | Sev. |
|---|------|-------------|-----------|-------|------|
| 1 | `validateScoreConfig` signature | `validateScoreConfig(c: ScoreConfig): Result<true>` (design line 348) | `(c: unknown): Result<ScoreConfig>`; accepts any value and returns the same object on success | `score.ts:78` | Medium (persistence and save validation will call it on untrusted data) |
| 2 | `rankPlayers` return type and `RankEntry` location | `RankEntry[]`; the snippet sits under "ScoreEngine and Ranking" without naming a file | `readonly RankEntry[]`, frozen; `RankEntry` is defined in `ranking.ts:27` and re-exported by `view.ts:75` | `ranking.ts`, `view.ts` | Low |
| 3 | `actingSeats` in `REVEAL` | "turn seat; unsubmitted seats; none when ENDED" | Same signature `(state)`. In `REVEAL` it returns the placer, which the design does not state | `engine.ts:80` | Low |
| 4 | `ENDED` reached directly after the last guess | Matches the design state diagram and reducer text | A game whose last placement forms a code goes from the last `SUBMIT_GUESSES` straight to `ENDED` (47 of 200 games in P19). There is no `REVEAL` phase and no `ACK_REVEAL` for that batch. The reveal data is in `lastReveal` and `history`. Not a difference, but the UI tasks 18.2 and 19.2 must not wait for an acknowledgement in that case | `engine.ts` `revealBatch` | Low |
| 5 | Error precedence | PLACE: `GAME_ENDED`, `WRONG_PHASE`, `NOT_YOUR_TURN`, then `UNKNOWN_PLAYER`; duplicate check listed last for `SUBMIT_GUESSES` | `UNKNOWN_PLAYER` is checked before `NOT_YOUR_TURN` (otherwise it would be unreachable). `DUPLICATE_SUBMISSION` is checked before the value checks, so a second submission with bad content is still `DUPLICATE_SUBMISSION`. Documented in the `engine.ts` header | `engine.ts:1-60`, `engine.test.ts:444-461` | Medium (the design text contradicts the reachable behavior) |
| 6 | `GAME_ENDED` and unrecognized actions | `GAME_ENDED` for any action after `ENDED` | `GAME_ENDED` wins over every other check, including a malformed action. A malformed action or unknown `type` in other phases returns `WRONG_PHASE`; the design has no code for it. `replay` reports trailing actions after the end as `REPLAY_REJECTED` with cause `GAME_ENDED` | `engine.ts` `reduce`, `replay.ts` header | Low |
| 7 | `quadKey` ordering | "ordered by `quadKey`" | Plain code-unit comparison of the notation text, so the order is column first, then row (`D4` < `D5` < `E3`). It is not row-major. `view.ts` `pendingQuadKeys` uses the same order. `board.ts` `affectedQuads` is row-major but `detect` re-sorts | `composite-code.ts` `compareByQuadKey`, `view.ts` | Low (consumers that expect row-major order would be wrong) |
| 8 | View re-exports and extra behavior | `PlayerView` uses `RankEntry`, `RevealRecord`, `GamePhase` without saying where they come from | `view.ts` re-exports these three types so `ai/` never imports `core/state`. `viewFor` throws `RangeError` for a viewer outside P0 to P3 (no error result in the design). `myGuesses` is non-null only in `GUESS_COLLECT`; `guessSubmitted` is all `false` outside it | `view.ts:75`, `viewFor` | Low |
| 9 | `ReplayError` union | `Result<GameState, { code: 'REPLAY_REJECTED'; index; cause }>` | `ReplayError = ReplayRejection \| EngineError`. A `newGame` failure (`INVALID_CONFIG`, `INVALID_SCORE_CONFIG`) is returned unchanged, and non-array `actions` gives `INVALID_CONFIG`. `isReplayRejection` tells them apart. Task 20.2 and the UI must handle both | `replay.ts:59`, `:62` | Medium |
| 10 | `RevealRecord.cumulative` | not specified | Score after the batch's prediction points and before the hand-empty bonus. The bonus appears only in `state.scores` and in `PlayerView.scores` | `engine.ts` `revealBatch` | Low |
| 11 | Extra exports not in the design | not listed | `deck.ts` (`isValidSeed`, `tryDealGame`, constants), `draw.ts` (`markFirstPlacement`, `applyDraw`), `board.ts` (`initialBoard`, `affectedQuads`, `STARTING_POSITIONS`; the design gives the starting group to `newGame`), `rules.ts` (`validateGameConfig`, `DIFFICULTIES`, defaults), `state.ts` (`deepFreeze`), `composite-code.ts` (`startingQuadIsExcluded`). `newGame` takes a numeric seed and returns `INVALID_CONFIG` for an invalid one (there is no `SEED_EMPTY` there) | various | Low |
| 12 | `defaultConfig` AI tiers | "1 human + 3 AI", no tiers given | All three AI seats are `BEGINNER` | `rules.ts:83` | Low |
| 13 | Property 4 and the "one test per property" rule | "each property is implemented by exactly one `fast-check` test" | Property 4 has two tagged tests (`deck.properties.test.ts:38` for `dealGame`, `engine.properties.test.ts:196` for `newGame`). `draw-turn.properties.test.ts` has 6 property tests tagged `supplementary`, which are not design properties | test files | Low |
| 14 | `ai/` import allow-list | Design and README table lists no `core/composite-code` for `ai/`; the design diagram and the README module graph include `AI --> CCD` | The boundary test enforces neither list, only the five bans (see 3.3) | design lines ~96 to 121, `src/game/README.md` | Low |

**Claims checked and found consistent (no debt).** The argument order of `score` is `(guess, hiddenSum, config)` in both the design (line 349) and the code (`score.ts:112`). The `actingSeats(state)` signature matches the design. The `RankEntry` shape (`player`, `score`, `rank`) matches.

## 7. Known limitations

- **The log holds private guesses.** Accepted `SUBMIT_GUESSES` actions are appended to `GameState.log` with their guess values. Saves are replay logs (design D5), so a save will also contain them. `PlayerView` has no log field, and P22 searches views for the log's guess values. Any later consumer must never expose the log (UI, saved text in `localStorage`, AI input). `localStorage` content is readable in developer tools (requirement 10.8).
- **`PublicRules.scoreConfig` exposes the numeric score table by design.** With a strictly decreasing table an observer can infer a seat's absolute error from its earned points but not the sign (IC-9).
- **Two-code final batch has thin coverage.** P19 sampled 0 games whose final batch has two codes. P12 saw 0 placements that form two codes in 300 random placements. The P19 notes in the test file say P17 observed 2 two-code batches that end the game; this audit did not re-measure that. The two-code example tests (`engine.test.ts:174`, `:317`) do not end the game, and `engine.test.ts:230` ends the game with one code. The code path is the same (`pending.endsGame`), but a dedicated test for "two codes and the placer's hand empties" is not visible by test title.
- **Generator reachability.** Random legal play rarely forms two codes at once, so P10, P17, P22 and P26 use generators that plant or drive such cases. The planted share is recorded in the test notes. P13 reached `ENDED` in 92 of 200 games; the other games stop at the generator's size limit. P26 logs have at most 80 actions. P23 found a consistent hidden-card swap for 87 percent of the `OWNER_ONLY` pairs; the others had too few hidden cells.
- **Headless only.** The engine was tested only in Node with Vitest. No browser, DOM, build or Service Worker was involved.
- **Coverage statistics and mutation checks are recorded by the authors in the test files and were not re-run here.**
- **The `ai/` boundary rule is vacuous** until `ai/` exists (see section 3).

## 8. Checkpoint verdict and next tasks

**Defects found: none.** No requirement violation was found in the engine. The differences in 6.3 are documentation debts, and 3.3 is a gap in what the boundary test enforces.

**Verdict: the engine is complete, with one limitation that is not closed.**

- Closed by evidence: `npm run typecheck` 0, `npm run typecheck:game` 0, boundary test 33 of 33, `test:game` 690 of 690, `test:ci` 1385 of 1385. The traceability verdicts are 8 MET, 5 MET WITH LIMITATION, 9 NOT YET APPLICABLE, 0 NOT MET (section 2.1). 23 of 30 design properties are implemented and passing.
- Not closed: plain `npm test` failed twice in this environment on two 5000 ms timeouts in `src/optical` while CPU load was about 90 percent and the emulator was running (section 5.2). Both files pass alone. A clean `npm test` run on an idle machine is still needed to claim the Task 11 acceptance text literally.
- The six questions OQ-1 to OQ-6 (6.2) are unanswered and still provisional.

**Tasks whose dependencies are all complete now (from the dependency lists in `tasks.md`):**

| Task | Depends on | OQ input needed |
|------|------------|-----------------|
| 12.1 AI framework | 9.1 | none to start; OQ-1 matters for 12.3 and 12.4 |
| 15.1 Localization core | 1.4 | OQ-9 (Korean and English) |
| 16.1 Vite and app shell | 1.2 | OQ-7 (adds Vite as a devDependency) |
| 20.1 Save format | 10.1 | none |

Ready as soon as their listed predecessors finish: 12.2 (12.1), 12.3 (12.2), 12.4 (12.2, 12.3, 9.2), 13.1 (12.3, 10.1), 15.2 (15.1), 16.2 (16.1, 12.2, 10.1, 15.1), 20.2 (20.1), 20.3 (20.2), 23.1 (12.1, 9.1; P2 milestone, OQ-13), 25.1 (16.1). Tasks 17 to 19 need 16.2 and the OQ-1, OQ-8, OQ-14 and OQ-15 inputs listed in 6.1.

## Addendum: unrestricted npm test recheck (HEAD 1758ef1)

The machine was lightly loaded (CPU 9 to 24 percent while the Android emulator process qemu-system-x86_64-headless was present but not busy). Unrestricted `npm test` (vitest --run): 58 files, 1469 tests, all passed, 0 failed, duration 58.83 s. The exit code of this run was not captured (the output was redirected to a file and the summary lines were read afterwards). `npm run test:ci` (maxWorkers=4): 58 files, 1469 tests, all passed, exit code 0, duration 65.71 s. The earlier optical timeouts were therefore environmental, as recorded in section 5. The Task 11 verification criterion (all tests pass, boundary test passes, typecheck and typecheck:game pass) is met for this HEAD.

