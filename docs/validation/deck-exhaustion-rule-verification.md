# Verification of the deck-exhaustion ending rule (RULES_VERSION 4)

## 1. Rule

- Drawing the last card from the deck immediately ends the game. Scores at that moment become final.
- This ending awards no bonus. The drawn card stays in the player's hand.
- A placement that completes a code draws no card. With 1 card left in the deck, the placement scores normally and play continues unless another ending applies.
- Retained settings: 3-card hands, empty-hand bonus of 5, code limit of 5, full scoring of the final placement, and reward table `[10, 5, 4, 3, 2, 1]`.
- This report documents the rule. Codex placed the implementation (in `reducePlace` in `src/game/core/engine.ts`) in the working tree. Kiro revised the specifications only.

## 2. Baseline

| Item | Value |
|---|---|
| HEAD | `b0698d2` (`codex/android-offline-companion`) |
| Working tree | Multiple uncommitted changes (rule implementation, UI, styles, tests). No commit or push. |
| Implementation identifiers | `RULES_VERSION = 4`, `SAVE_KEY = 'qroker.practice.save.rules4'` (the version 3 slot `qroker.practice.save.rules3` was preserved and is not read) |

## 3. Specification changes (Kiro)

Kiro edited only Markdown under `.kiro/`. Checkbox states stayed as they were. Earlier evidence and wording were preserved alongside an `Amendment` label.

| File | Requirements and design items |
|---|---|
| `.kiro/specs/qroker-game/requirements.md` | Amendment 2 notice, terms `Draw_Rule`, `Hand_Empty_End`, new term `Deck_Exhaustion_End`, criteria 2.9, 3.7, 3.8, 3.15, new criterion 3.16 |
| `.kiro/specs/qroker-game/design.md` | Draw rule description, game-end conditions (three endings), four draw items, `Deck exhaustion` section, DrawManager unit test list |
| `.kiro/specs/qroker-playable-game/requirements.md` | 6.6, 8.8, 9.1, 9.3, requirement 12 criterion 6 (`RULES_VERSION` 4), requirement 18 criterion 9 (`rules4` slot, preserve previous slot), OQ-16 |
| `.kiro/specs/qroker-playable-game/design.md` | State diagram, draw description, reducer step 8, `RULES_VERSION = 4`, `SAVE_KEY`, version in save example, invariants, property 12, property 19, two rows of the property 19a table, `Deck Exhaustion` section, test scenarios |
| `.kiro/specs/qroker-playable-game/tasks.md` | Added the `Amendment 2` section. Checkbox states were preserved. |
| `.kiro/steering/project.md` | Updated the approved rule statement to `RULES_VERSION = 4` and the new ending condition. |

## 4. Test run results

### 4.1 `npm run test:ci` (Vitest, full suite)

| Item | Result |
|---|---|
| Files / tests | 109 / 3,038 |
| Passed | 3,036 |
| Failed | 2 (below) |
| Exit code | 1 |

Failure 1: `src/optical/detect.test.ts` › "6. scaling ... blurred non-integer scales"
- Error: `Test timed out in 5000ms`. It failed in the full run and in both isolated reruns. This test takes about 10 seconds.
- This work did not change `src/optical/`. In accordance with project rules, the timeout and assertions were left alone. The existing load-dependent timeout remains open.

Failure 2: `src/game/ui/screens/game.test.ts` › "keeps touch-action off ... uses no hover rule"
- Error: the stylesheet contains `:hover` rules in `src/game/ui/styles/layout.css` on lines 359 (`.game-bar__button:hover`) and 488 (`.setup-start:hover`).
- At HEAD, `layout.css` contains no `:hover`. The rules came from uncommitted UI work, which was unrelated to the deck rule and left untouched.

### 4.2 `npx playwright test` (E2E)

- With the repository configuration, the run could not start because another Playwright run occupied port 5173 (`Port 5173 is already in use`). The other process was left running.
- The same test files ran with a temporary configuration outside the repository on port 4174: `D:/DevCaches/tmp/qroker-review/pw-all.config.mjs`.
- Of 45 tests, 43 passed and 2 failed. Exit code 1.
  - `e2e/game.spec.ts:90` "2 placement › drag then confirm, Escape, position first, rotation only for clubs and spades": found 0 elements matching `.hand-card .card-face__suit` (expected 3). Uncommitted changes to `card-face.ts` and `hand.css` appeared to be the cause.
  - `e2e/placement-playground.spec.ts:53` "real mouse drag creates a preview without placing until confirmation": cell `[data-row="2"][data-col="3"]` was expected to have `is-target`, but had only `board-cell--legal is-legal`. Uncommitted changes to `board.ts` and `board.css` appeared to be the cause.
- Both failures concerned hand or board rendering and were unrelated to the deck rule logic. They were not reproduced at HEAD.
- The E2E scenarios covering deck exhaustion and code placements (`4 reveal and scoring`, `8 two codes in one placement`, `5 replay and rematch`) passed.

## 5. Rule verification

### 5.1 Existing engine tests (passed in test:ci)

- `src/game/core/engine.test.ts`: "drawing the last card ends the game immediately with the existing scores". It checks deck-exhaustion termination, preservation of scores, no bonus, and rejection of actions after the game ends.
- `src/game/core/ranking.test.ts`: tied rankings, including `[5,5,3,0] → [1,1,3,4]` and `[7,7,7,2] → [1,1,1,4]`.

### 5.2 Temporary verification outside the repository (actual engine, `D:/DevCaches/tmp/qroker-review/verify-rule4.mts`)

| Check | Result |
|---|---|
| Code-completing placement with 1 card left in the deck | Found 25 cases. All entered `GUESS_COLLECT`, drew no card (1 remained), and awarded the placing player 10 points per code. |
| Continuation after those placements | 23 continued to `PLACEMENT` after reveal. In 2 cases the same placement reached `ENDED` (empty hand or code limit; the temporary script did not record which). |
| 300 random normal-mode games | 296 ended by deck exhaustion. Deck-exhaustion endings with a bonus: 0. |
| Tied rankings `[7,7,7,2]` | `[1,1,1,4]`. Failures: 0. |
| Result | `failures: []`, exit code 0 |

### 5.3 Checks on experiment records (32,000 games, new rule)

| Check | Result |
|---|---|
| Failures | 0 |
| Games ending by deck exhaustion | 25,860. Bonuses: 0. Final scores equaled total prediction points in all 25,860. |
| Empty-hand endings | 4,928. The bonus recipient matched the seat that ended the game. |
| Code-limit endings | 1,212. Bonuses: 0. |
| Games assigning different ranks to tied scores | 0 |
| First PLACE made by the starter | 32,000 / 32,000 |
| Bonus amount and recipient correct | 32,000 / 32,000 |
| Winner shares sum to 1 | 32,000 / 32,000 |

## 6. Type checks

- `npm run typecheck` (`tsc -p tsconfig.json`): exit code 0
- `npm run typecheck:game` (`tsc -p tsconfig.game.json`): exit code 0

## 7. Open issues

1. Load-dependent timeout in the optical test `detect.test.ts`. It also failed in isolated reruns. The timeout was not increased.
2. The `:hover` failure in `game.test.ts` comes from rules added to `layout.css` in uncommitted UI work. The UI work needs to remove `:hover` or decide what the test should require.
3. Two E2E failures (the hand-card suit class and the drag-target class) appear to come from uncommitted UI work. Neither was reproduced at HEAD.
4. Older `RULES_VERSION = 3` references in the specifications and comments were retained as historical records. Some implementation comments may still contain old wording (outside this work's scope).
