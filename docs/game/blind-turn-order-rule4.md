# Turn-order comparison under the deck-exhaustion ending rule (AI self-play rerun)

**These are AI self-play results.** The experiment did not involve human players. It retained the scoring table, a starting hand of 3, an empty-hand bonus of 5, and no starting-player penalty. This report does not adopt a rule.

## 1. Question and baseline

- Question: when drawing the last card ends the game immediately (RULES_VERSION 4), how do win rates by turn order and the skill gap compare with the previous baseline?
- Baseline: raw records from the previous turn-order experiment (previous rules, `D:/DevCaches/tmp/qroker-blind-turn-order/full`, summary in `summary.json`). Both experiments used the same seeds (200–399), 8 lineups, four starting players and five conditions.
- Deck exhaustion counts as a separate ending.

## 2. Run configuration

| Item | Value |
|---|---|
| HEAD | `b0698d2`. The rule implementation (`src/game/core/engine.ts`, RULES_VERSION 4) and driver changes (three ending types) were uncommitted working-tree changes. |
| Driver | `scripts/blind-turn-order-experiment.ts`. The rerun changed only three places to distinguish the three endings: the `endedBy` type, end detection and the analysis count for `deckExhausted`. The game loop and policies stayed the same. |
| Seeds | 200–399 (200 seeds) |
| Lineups | 8: all BEGINNER, all ADVANCED, and all six ways to seat two ADVANCED players |
| Starter | P0–P3, verified from the actual first PLACE |
| Conditions | NORMAL_B5 (normal, bonus 5), A_BLIND_B5 (blind, bonus 5), B_BLIND_B3, C_BLIND_B1, D_BLIND_B0 |
| Games | 6,400 pairs per condition (200 × 8 × 4). Total: 32,000 games. Failures: 0. |
| Bootstrap | 2,000 replicates, resampling by seed, random seed 20261124. Intervals are exploratory. |

### Commands

```
npx tsx scripts/blind-turn-order-experiment.ts run --seedFrom 200 --seedTo 299 --out D:/DevCaches/tmp/qroker-blind-turn-order-rule4/full
npx tsx scripts/blind-turn-order-experiment.ts run --seedFrom 300 --seedTo 399 --out D:/DevCaches/tmp/qroker-blind-turn-order-rule4/full
npx tsx scripts/blind-turn-order-experiment.ts analyze --seedFrom 200 --seedTo 399 --out D:/DevCaches/tmp/qroker-blind-turn-order-rule4/full --boot 2000
npm run typecheck
```

The first and second batches each ran 16,000 games (each exited with code 0 and wrote 0 lines to stderr). Analysis and `npm run typecheck` both exited with code 0.

## 3. Result 1: Winner share by turn position (six equally weighted mixed lineups, intervals for the new rules)

| Condition | Baseline 1st / 2nd / 3rd / 4th | Baseline highest−lowest (pp) | New 1st / 2nd / 3rd / 4th | New highest−lowest (pp) [95%] |
|---|---|---|---|---|
| NORMAL_B5 | 24.78 / 24.68 / 25.94 / 24.60 | 1.35 | 24.77 / 25.24 / 25.55 / 24.44 | 1.11 [0.51, 2.81] |
| A_BLIND_B5 | 32.63 / 20.07 / 24.53 / 22.78 | **12.56** | 25.44 / 25.04 / 25.28 / 24.23 | **1.21 [0.52, 2.84]** |
| B_BLIND_B3 | 32.21 / 20.51 / 24.47 / 22.81 | 11.71 | 25.43 / 25.15 / 25.27 / 24.14 | 1.29 [0.55, 2.97] |
| C_BLIND_B1 | 31.74 / 21.41 / 24.45 / 22.41 | 10.33 | 25.34 / 25.03 / 25.39 / 24.23 | 1.16 [0.48, 2.86] |
| D_BLIND_B0 | 25.54 / 24.84 / 25.74 / 23.88 | 1.87 | 25.47 / 24.83 / 25.41 / 24.30 | 1.17 [0.54, 2.83] |

(Values are percentages of winner credit. The starter plays first.)

First minus fourth under the new rule, in percentage points: NORMAL 0.33, A 1.21, B 1.29, C 1.11, D 1.17.

Under the new rule all four positions had similar win rates. The first-position advantage seen in the previous default blind condition (A) disappeared (previously 32.6%, with a highest−lowest gap of 12.6 pp).

## 4. Result 2: ADVANCED–BEGINNER skill gap (mixed lineups, percentage points)

| Condition | Baseline | New [95%] |
|---|---|---|
| NORMAL_B5 | 46.48 [45.90, 47.03] | 44.83 [44.18, 45.48] |
| A_BLIND_B5 | 28.93 [27.83, 30.05] | **12.64 [11.43, 13.85]** |
| B_BLIND_B3 | 23.73 [22.56, 24.98] | 11.89 [10.67, 13.13] |
| C_BLIND_B1 | 17.08 [15.77, 18.47] | 11.11 [9.91, 12.38] |
| D_BLIND_B0 | 11.86 [10.65, 13.14] | 10.76 [9.55, 12.02] |

In blind condition A the skill gap shrank to less than half its previous size while remaining clearly above 0. Normal mode changed little.

## 5. Result 3: Ties for first and game endings

### 5.1 Ties for first (mixed lineups, per 4,800 games)

| Condition | Baseline | New |
|---|---:|---:|
| NORMAL_B5 | 4.92% | 6.13% (294/4,800) |
| A_BLIND_B5 | 7.71% | **47.40%** (2,275/4,800) |
| B_BLIND_B3 | 7.98% | 47.33% (2,272/4,800) |
| C_BLIND_B1 | 16.06% | 48.02% (2,305/4,800) |
| D_BLIND_B0 | 46.40% | 49.50% (2,376/4,800) |

Ties for first in single-level lineups (800 games per lineup): under the new rule in condition A, 54.4% for all BEGINNER and 73.8% for all ADVANCED.

### 5.2 Endings (denominator: 6,400 games, including 4,800 with mixed lineups)

| Condition | Empty hand (mixed / all) | Code limit (mixed / all) | Deck exhaustion (mixed / all) |
|---|---|---|---|
| NORMAL_B5 | 3,168 / 3,260 | 359 / 1,076 | 1,273 / 2,064 |
| A_BLIND_B5 | 387 / 417 | 30 / 34 | 4,383 / 5,949 |
| B_BLIND_B3 | 387 / 417 | 30 / 34 | 4,383 / 5,949 |
| C_BLIND_B1 | 387 / 417 | 30 / 34 | 4,383 / 5,949 |
| D_BLIND_B0 | 387 / 417 | 30 / 34 | 4,383 / 5,949 |

In the blind conditions, 93% of all games ended by deck exhaustion. A player can earn the empty-hand bonus only on a final placement that completes a code: only such placements draw no card and can leave the hand at 0. Across the 387 mixed-lineup games that awarded a bonus in blind condition A, recipients were evenly distributed relative to the starter (1st 91, 2nd 101, 3rd 101, 4th 94).

## 6. Result 4: Winner share by turn position in single-level lineups (new rule, 800 games per lineup)

| Condition | Lineup | 1st | 2nd | 3rd | 4th |
|---|---|---:|---:|---:|---:|
| NORMAL_B5 | All BEGINNER | 25.22% | 24.47% | 25.09% | 25.22% |
| NORMAL_B5 | All ADVANCED | 26.95% | 24.89% | 23.80% | 24.36% |
| A_BLIND_B5 | All BEGINNER | 25.22% | 24.47% | 25.09% | 25.22% |
| A_BLIND_B5 | All ADVANCED | 24.88% | 26.71% | 24.83% | 23.58% |
| D_BLIND_B0 | All ADVANCED | 25.79% | 24.92% | 25.31% | 23.98% |

(The all-BEGINNER rows match in Normal and Blind because the random strategy ignores board-card identities, producing identical action histories in both modes.)

## 7. Interpretation

The following explanations are consistent with the observations. The experiment did not test causality.

- Under the previous rule, the first player to empty their hand received a bonus. The previous report identified the timing of that bonus as the likely main source of the first-position advantage. Under the new rule, empty-hand endings were rare (6.5% in blind play), and most games ended when the deck ran out. The total number of draws determines when the deck empties, so the starting player made little difference to the outcome.
- Deck exhaustion awards no bonus, so all points in those games came from predictions. Many blind games ended in a tie for first (47%). Players with equal top scores split the credit, reducing each winner's share in individual games and narrowing differences between positions. This may account for some of the reduction in the turn-order gap.
- In blind play, the ADVANCED advantage fell to less than half its previous size. With low prediction scores, the loss of the bonus appears to have narrowed the gap. The experiment did not isolate bonus effects from ending-type effects.

## 8. Verification status

- Checks on the 32,000 new records (0 failures): 0 bonuses in deck-exhaustion games, final score equal to total prediction points in 25,860 games, 0 tie-ranking mismatches, 0 first-placement errors and 0 winner-share sum errors.
- The `smoke` command was not rerun. Its comparison uses previous-rule records, so differences under the new rule are expected. The record-level checks above took its place.
- Games were paired with the baseline by seed, lineup and starting player. Because the rule change altered the games' outcomes, the analysis did not calculate intervals for paired differences. It calculated intervals within each dataset only.

## 9. Limitations

1. Two AI strategies played against each other. Human behavior and player experience were not measured.
2. The scoring table and bonuses are provisional. Deck exhaustion carries no bonus, so varying the bonus produced nearly identical turn-order results in blind conditions A, B, C and D.
3. Intervals are exploratory. The comparison covered several conditions without multiple-comparison adjustment.
4. The rerun used the same deals as the baseline. The new rule changed game length, so the experiment could not separate the turn-order effect from the game-length effect.
5. The working tree contained both uncommitted UI work and driver edits. The driver edits only classified the three endings. The previous experiment's records were retained.
