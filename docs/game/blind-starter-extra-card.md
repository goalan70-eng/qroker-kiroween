# Giving the starting player a fourth card in a single Blind game (AI self-play)

**These results come from AI self-play.** No humans played. The two strategies were BEGINNER (random) and ADVANCED (heuristic). The score table and bonus were provisional. The experiment left the shipping rules, engine, and AI strategies unchanged. This report identifies candidates for human playtesting and does not adopt a rule.

## 1. Question and conditions

- **Question:** If the starting player begins with 4 cards, does the extra choice help enough to outweigh the delay in earning the 5-point empty-hand bonus?
- **A (baseline, live):** BLIND, all four hands start with 3 cards, bonus 5. These are the existing rules.
- **H (candidate, live):** Create the same deal as A, then add the top card of the remaining deck (`drawTop`) to the actual starting player's hand. Hand sizes are 4/3/3/3, with 35 cards in the deck. Rotate the start through all four physical seats. Bonus 5.
- **F (reference, rescored):** Subtract 3 points from the starting player's final score in each matching A record. No new games are played.
- H has no penalty. Compare H with A and H with F separately.

## 2. Baseline and run record

| Item | Value |
|---|---|
| Revision | `b0698d2` (`codex/android-offline-companion`). Engine, rule, scoring, and AI files were unchanged during the experiment. |
| Working tree | There were unrelated existing changes in `src/game/i18n/strings/setup.ts`, styles and screen files under `src/game/ui/...`, and `debug.log`. The experiment left these untouched. New files were `scripts/blind-starter-extra-card-experiment.ts` and `docs/game/blind-starter-extra-card-ko.md` (uncommitted). |
| Experiment script | `scripts/blind-starter-extra-card-experiment.ts` (new). Adapted the driver loop from the preceding experiment and reused the engine, rules, AI registry, ranking, decision seed, and action selection policy unchanged. |
| Hand-size checks | Within the experiment only, the starting player's limit was 4 and everyone else's was 3. Only the 3-card HAND_SIZE check was replaced. All other invariants were checked with `listInvariantViolations`. |
| Seeds | Smoke 0–1, full run 200–399 |
| Lineups | 8: all BEGINNER, all ADVANCED, and the six ways to assign two ADVANCED players to seats |
| Starting players | All four seats P0–P3, verified from the actual first PLACE action |
| Scoring | Error reward table `[10, 5, 4, 3, 2, 1]`, empty-hand bonus 5 |

### Commands

```
npx tsx scripts/blind-starter-extra-card-experiment.ts smoke --out <output-dir>/smoke
npx tsx scripts/blind-starter-extra-card-experiment.ts run --seedFrom 200 --seedTo 399 --out <output-dir>/full
npx tsx scripts/blind-starter-extra-card-experiment.ts analyze --seedFrom 200 --seedTo 399 --out <output-dir>/full --boot 2000
npm run typecheck
```

Output was written to `D:/DevCaches/tmp/qroker-blind-starter-extra-card/`, outside the repository, and was not added to Git.

### 2.1 Runs and denominators

| Run | Attempted | Completed | Failed |
|---|---:|---:|---:|
| Smoke (seeds 0–1, 8 lineups, 4 starting players, 4 conditions: A, H, A2, H2) | 256 | 256 | 0 |
| Full run A (seeds 200–399) | 6,400 | 6,400 | 0 |
| Full run H (seeds 200–399) | 6,400 | 6,400 | 0 |
| **Matched pairs** | **6,400** | **6,400** | **0** |

Each condition included 4,800 mixed-lineup games and 800 games for each single-tier lineup (200 seeds × 4 starting players per lineup).

## 3. Checks

### 3.1 Smoke (seeds 0–1)

| Check | Result |
|---|---|
| Expected games, unique keys | 256 / 256 |
| Initial hand sizes (H: starter 4, others 3, deck 35 / A: all 3, deck 36) | All passed |
| Starting player made the first PLACE | All passed |
| Draw rule (no draw when a code forms, otherwise draw one if the deck has cards) | All passed |
| Hand limits (starter 4, others 3) | All passed |
| Win shares sum to 1 | All passed |
| H's underlying deal matches A's after returning the extra card to the top of the deck | 64 / 64 |
| A agrees with previous driver records (action-log hash and scores, including all four starting seats) | 64 / 64 |
| H deterministic rerun | 32 / 32 |
| BLIND vs. BLIND_SCORE_ONLY (A: 64 pairs, H: 64 pairs) | 0 action-log differences, 0 score differences |

The full run omitted BLIND_SCORE_ONLY because the smoke run found no differences.

### 3.2 Full run (seeds 200–399)

| Check | Result |
|---|---|
| Records, unique keys (A and H combined) | 12,800 / 12,800 |
| Failures | 0 |
| Initial hand sizes | 12,800 / 12,800 |
| Starting player made the first PLACE | 12,800 / 12,800 |
| Bonus recipient and amount | 12,800 / 12,800 |
| Draw rule, including no draw after a code | 12,800 / 12,800 |
| Hand limits | 12,800 / 12,800 |
| Win shares sum to 1 | 12,800 / 12,800 |
| H's underlying deal matched A's | 6,400 / 6,400 |
| A matched the previous experiment's A_BLIND_B5 records by seed, lineup, and starting player | 6,400 / 6,400 |
| Counts by ending sum to 4,800 in mixed lineups | A: 4,758 + 42, H: 4,740 + 60 |
| Maximum PLACE actions (H, single game) | 45 (within the limit of 48) |

`firstPlaceCodeRate`, the proportion of first placements that completed a code, was 0 in every condition. The board starts with only the four neutral center cells occupied. For one new card to complete a 2×2, the other three cells must already be filled. A 2×2 overlapping just one cell of the center block has at most two occupied cells. This metric therefore provides no information.

## 4. Result 1: Win share by turn position (six equally weighted mixed lineups)

Turn positions run from 1 to 4 relative to the starting player. Exploratory 95% percentile intervals use a paired bootstrap by seed (2,000 replicates, random seed 20261125).

| Condition | 1st | 2nd | 3rd | 4th | Highest − lowest (pp) | 1st − 4th (pp) | ADV−BEG gap (pp) |
|---|---:|---:|---:|---:|---|---|---|
| A (current rules) | 32.63% | 20.07% | 24.53% | 22.78% | **12.56** [10.13, 14.76] | 9.85 [7.40, 12.12] | 28.93 [27.83, 30.08] |
| H (starter gets 4 cards) | 13.64% | 26.40% | 24.21% | **35.75%** | **22.11** [20.30, 23.98] | −22.11 [−23.98, −20.30] | 30.10 [28.98, 31.17] |
| F (starter −3 points) | 25.91% | 22.40% | **26.97%** | 24.72% | **4.57** [2.94, 6.49] | 1.19 [−1.16, 3.35] | 28.10 [26.89, 29.34] |

### 4.1 Paired differences (matched by seed, lineup, and starting player, exploratory 95% intervals)

| Comparison | Change in highest − lowest (pp) | Change in ADV−BEG (pp) | Change in 1st − 4th (pp) |
|---|---|---|---|
| H − A | **+9.55** [6.68, 12.60] | +1.17 [−0.20, 2.58] | −31.96 [−34.85, −28.92] |
| H − F | **+17.54** [14.99, 19.88] | +2.00 [0.52, 3.47] | −23.30 [−26.22, −20.33] |
| F − A | **−7.99** [−9.57, −5.43] | −0.83 [−1.37, −0.32] | −8.66 [−9.52, −7.94] |

F−A matches the result of rescoring A in the preceding experiment (highest − lowest −7.99, ADV−BEG −0.83). Both analyses use the same records, so this is not independent confirmation.

## 5. Result 2: Single-tier lineups (800 games per lineup, averaged over four starting players)

| Condition | Lineup | 1st | 2nd | 3rd | 4th | Highest − lowest (pp) |
|---|---|---:|---:|---:|---:|---:|
| A | all BEGINNER | 44.27% | 15.58% | 17.79% | 22.35% | 28.69 |
| H | all BEGINNER | 14.42% | 20.54% | 20.73% | 44.31% | 29.90 |
| F | all BEGINNER | 35.56% | 18.48% | 20.90% | 25.06% | 17.08 |
| A | all ADVANCED | 27.60% | 32.83% | 14.58% | 24.98% | 18.25 |
| H | all ADVANCED | 4.82% | 41.89% | 12.68% | 40.61% | 37.06 |
| F | all ADVANCED | 25.56% | 33.63% | 15.25% | 25.56% | 18.38 |

## 6. Result 3: Starting player's results in mixed lineups by starting player's tier

| Condition | Starting player's win share when BEGINNER (2,400 games) | Starting player's win share when ADVANCED (2,400 games) |
|---|---:|---:|
| A | 20.99% | 44.27% |
| H | 5.64% | 21.64% |
| F | 15.99% | 35.83% |

## 7. Result 3b: Supporting observations (4,800 mixed-lineup games)

| Condition | Starter bonus rate | Starter prediction score (per game, excluding bonus) | Games with tied first place | Placements per game | Ending (empty hand / code limit) |
|---|---:|---:|---:|---:|---|
| A | 32.2% | 3.03 | 7.71% | 41.83 | 4,758 / 42 |
| H | 11.3% | 2.88 | 7.63% | 41.69 | 4,740 / 60 |
| F | 32.2% | 3.03 | 7.15% | 41.83 | 4,758 / 42 |

(Across all 6,400 games per condition, the starter received the bonus in 33.2% under A, 10.2% under H, and 33.2% under F.)

## 8. Interpretation

The changes below were observed in the records. The proposed causes are explanations consistent with the data and have not been tested for causality.

- **H overcorrects.** The first player's share fell from 32.6% to 13.6%, and fourth place in turn order had the highest share at 35.8%. The highest-to-lowest gap grew from 12.6 to 22.1 percentage points (pp). H also favored the fourth turn in single-tier lineups (all BEGINNER 44.3%, all ADVANCED 40.6%).
- **The starting player gained no advantage from the extra card.** Mean starter win share fell from 21.0% to 5.6% for BEGINNER and from 44.3% to 21.6% for ADVANCED, despite having an extra choice.
- **The delay in earning the bonus appears to be the main reason.** The starting player's bonus rate fell from 32.2% to 11.3%. A larger hand takes longer to empty, giving other players the opportunity to claim the bonus. Starter prediction scores changed little (3.03 → 2.88), so most of the scoring difference came from the bonus. The extra card could also increase the number of turns and affect other turn positions, leaving the causal explanation uncertain.
- **The ADV−BEG gap barely changed.** H was 1.2 pp higher than A, but the interval includes 0. The extra card neither eliminated the skill gap nor demonstrably widened it.
- **F narrowed the turn-order gap and retained most of the skill gap.** The highest-to-lowest gap fell from 12.6 pp to 4.6 pp. The ADV−BEG gap shrank by only 0.8 pp (interval −1.4 to −0.3, small but excluding 0). After the penalty, the third turn (27.0%) slightly exceeded the first (25.9%). Some turn-order bias shifted to another position.

## 9. Single-game rule recommendation

Three options were compared.

| Option | Highest − lowest (pp) | Skill gap (pp) | Starter win share (BEG/ADV) | Assessment |
|---|---|---|---|---|
| Current rules (A) | 12.56 | 28.93 | 21.0% / 44.3% | Retain as baseline |
| Starter −3 points (F) | 4.57 | 28.10 (−0.83) | 16.0% / 35.8% | **Candidate for human playtesting** |
| Starter gets 4 cards (H) | 22.11 | 30.10 (+1.17) | 5.6% / 21.6% | Exclude |

**Recommendation:** In single games, test the **−3-point starting-player penalty (F)** with human players alongside the current rules as the control. It substantially narrowed the turn-order gap with little loss of skill separation. Do not adopt a 4-card starting hand (H). It overcorrected, favoring the fourth turn and reducing the starting player's own win rate.

Limits of the evidence:
- The results cover two AI strategies. Human responses were not measured.
- F was rescored. Since the AI strategies ignore scores (no score references in `src/game/ai/`), rescoring the same actions gives the same result as live play. People might change their behavior if they know about the penalty.
- Intervals are exploratory. Multiple conditions were compared without a multiple-comparison adjustment. H's intervals are not wide, and the clear result in the direction opposite to expectation leaves the conclusion unchanged.
- The score table and bonus are provisional. Changing their values could change the results.
- Human playtests should examine the residual third-turn bias under F separately.

## 10. Run verification

- The full experiment ran after the smoke checks passed. They covered H's initial state, determinism, agreement with the existing driver, and comparison with BLIND_SCORE_ONLY.
- The full run matched the previous experiment's A records in 6,400/6,400 games, reproducing condition A.
- Type checking (`npm run typecheck`, `tsc -p tsconfig.json`) exited with code 0.
- The experiment made no commit, push, or changes to the shipping rules.
