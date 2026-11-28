# Turn-order balance and rotating the starting player in Blind mode (AI self-play)

**These results come from AI self-play.** Human play was not measured. The score table and bonuses were experimental settings, and the shipping rules were unchanged. This report identifies candidates for human playtesting. It makes no rule decision.

## 1. Questions and hypothesis

- Can the win-rate gap across the four turn positions be reduced while preserving the skill difference (the ADVANCED advantage)?
- In a 4-game set, does rotating the starting player even out results by seat despite a turn-order bias in individual games?
- Hypothesis from post hoc calculations in the preceding experiment: reducing the bonus or penalizing the starting player narrows the turn-order gap. This experiment tested that hypothesis directly through live runs and rescoring.

## 2. Baseline and conditions

| Item | Value |
|---|---|
| Revision | `b0698d2` (`codex/android-offline-companion`). By the start of the experiment, HEAD had moved from `3e7a626` to `b0698d2`. The Blind implementation was committed in `eb6c2e9`. |
| Working tree | At baseline there were no tracked changes. Only the experiment document `docs/validation/kiro-blind-turn-order-experiment.md` and the new file below were untracked. |
| Experiment script | `scripts/blind-turn-order-experiment.ts` (new, uncommitted). Reuses the engine, AI strategies, scoring, and ranking functions unchanged. |
| Driver | Uses the same loop as `playGame` (`actingSeats()[0]`, `decisionSeed`, `viewFor`, `strategiesFor`, `reduce`, `checkStateInvariants`). After `newGame`, set `turn` to the desired starting player before beginning play. Freeze the state with `deepFreeze`. |
| Seeds | Live full run: **200–399**. Smoke: 0–1. |
| Lineups | 8: all BEGINNER, all ADVANCED, and the six seat assignments with two ADVANCED players and BEGINNER in the remaining seats |
| Starting players | P0, P1, P2, P3 (four possibilities). Verified the first actual PLACE action in the logs. |
| Scoring | Error reward table `[10, 5, 4, 3, 2, 1]` (errors of 6 or more earn 0 points), with the empty-hand bonus set by condition. The 3-card hand, draw rule, 5-code limit, and full scoring of the final placement were unchanged. |
| Unit of measurement | Turn position runs from 1 to 4 relative to the starting player and was recorded separately from seat (P0–P3). |
| Win share | Players tied for first split the win equally. Shares sum to 1 in each game. |

### Run conditions

| Condition | Mode | Empty-hand bonus | Method |
|---|---|---:|---|
| NORMAL_B5 | Normal (`OWNER_ONLY`) | 5 | Live baseline |
| A_BLIND_B5 | Blind (`BLIND`) | 5 | Live control |
| B_BLIND_B3 | Blind | 3 | Live |
| C_BLIND_B1 | Blind | 1 | Live |
| D_BLIND_B0 | Blind | 0 | Live (emptying a hand still ends the game) |
| E_PENALTY1 | Blind | 5, starter −1 | Rescore A records (no new games) |
| F_PENALTY3 | Blind | 5, starter −3 | Rescore A records (no new games) |
| G | Blind | 5 | Group A records into 4-game sets: fixed (P0 starts) vs. rotating (4 cyclic starting-player schedules) |

The smoke run compared `BLIND_SCORE_ONLY` with BLIND on identical inputs (4 bonus values, 256 pairs). Action logs and final scores all matched (section 3), so the full run omitted it.

## 3. Run results, checks, and denominators

### 3.1 Run record

| Run | Command | Attempted | Completed | Failed | Duration |
|---|---|---:|---:|---:|---|
| Smoke | `npx tsx scripts/blind-turn-order-experiment.ts smoke --out <output-dir>/smoke` | 576 | 576 | 0 | Not recorded |
| Full run 1 (seeds 200–299) | `npx tsx scripts/blind-turn-order-experiment.ts run --seedFrom 200 --seedTo 299 --out <output-dir>/full` | 16,000 | 16,000 | 0 | 151 seconds |
| Full run 2 (seeds 300–399) | `... run --seedFrom 300 --seedTo 399 --out <output-dir>/full` | 16,000 | 16,000 | 0 | 143 seconds |
| Analysis (recalculate from records, 2,000 bootstrap replicates) | `npx tsx scripts/blind-turn-order-experiment.ts analyze --seedFrom 200 --seedTo 399 --out <output-dir>/full --boot 2000` | 32,000 | 32,000 | 0 | Aggregated input records |

- Full-run denominator: 5 conditions × 8 lineups × 4 starting players × 200 seeds = **32,000 games**, or 6,400 games per condition.
- Checkpoint resume was verified. Rerunning the same range produced 0 new games and skipped 16,000 existing records.
- Outputs outside the repository: `D:/DevCaches/tmp/qroker-blind-turn-order/`. Raw records: `records-200-299.jsonl`, `records-300-399.jsonl`. Summary: `full/summary.json`. Smoke checks: `smoke/smoke-checks.json`.

### 3.2 Smoke checks (seeds 0–1, 576 games)

| Check | Result |
|---|---|
| Expected games, unique keys | 576 / 576, 576 unique keys |
| P0 starts agree with existing `playGame` (action-log SHA-256 and final scores) | **80 / 80 matched** |
| P0 starts agree with previous experiment records (same settings, action-log hash) | **32 / 32 matched** |
| Deal fingerprint within a seed (board, hands, deck, excluding starter) | Identical across all starters and conditions |
| Starting player made the first PLACE | All passed |
| Bonus recipient and amount (final score = sum of prediction scores + bonus) | All passed |
| Win shares sum to 1 | All passed |
| Deterministic rerun (seed 0, replay 32 games in condition A) | **32 / 32 matched** |
| BLIND vs. BLIND_SCORE_ONLY (4 bonus values) | Among 256 pairs, 0 action-log differences and 0 score differences |

The initial smoke run failed the immutable-state check in all 576 games because the initial state, created with a spread, had not been frozen. Applying `deepFreeze` fixed it. Rerunning the smoke test with the final code confirmed that all 576 games matched the previously recorded games.

### 3.3 Full-run checks (32,000 games, calculated with a separate temporary script)

| Check | Result |
|---|---|
| Records, unique keys | 32,000 / 32,000 |
| Failures | 0 |
| Starting player made the first PLACE | 32,000 / 32,000 |
| Bonus recipient and amount | 32,000 / 32,000 |
| Win shares sum to 1 | 32,000 / 32,000 |
| Deal fingerprint per seed–lineup group | One deal in each of 1,600 groups |
| **Bonus cross-check:** Does subtracting only the bonus difference from A reproduce B, C, and D? | For each of B, C, and D, 6,400 games, 0 action-log mismatches and 0 score mismatches |

### 3.4 Do the AI strategies read scores?

In non-test code under `src/game/ai/`, 0 lines read `.scores`, `scoreConfig`, `handEmptyBonus`, or `rewardByError`. Rules that change scores alone (E, F, and changes to the bonus) therefore leave AI behavior unchanged. Rescoring gives exactly the live result for the same actions. People may adapt to scores, so human outcomes require live testing.

## 4. Result 1: Live conditions (paired comparisons with A)

### 4.1 Win share by turn position (six equally weighted mixed lineups)

The primary metric is the difference in percentage points (pp) between the highest and lowest win shares across the four turn positions. The 1st-minus-4th difference is also shown. The 95% percentile intervals use a paired bootstrap by seed (2,000 replicates, random seed 20261124).

| Condition | 1st | 2nd | 3rd | 4th | **Highest − lowest (pp)** | 1−4 (pp) | ADV−BEG (pp) |
|---|---:|---:|---:|---:|---|---|---|
| NORMAL_B5 | 24.78% | 24.68% | 25.94% | 24.60% | **1.35** [0.69, 3.16] | 0.18 [−1.59, 1.96] | 46.48 [45.90, 47.03] |
| A_BLIND_B5 (baseline) | 32.63% | 20.07% | 24.53% | 22.78% | **12.56** [10.17, 14.91] | 9.85 [7.47, 12.18] | 28.93 [27.83, 30.05] |
| B_BLIND_B3 | 32.21% | 20.51% | 24.47% | 22.81% | **11.71** [9.48, 13.99] | 9.41 [7.09, 11.71] | 23.73 [22.56, 24.98] |
| C_BLIND_B1 | 31.74% | 21.41% | 24.45% | 22.41% | **10.33** [8.30, 12.44] | 9.33 [7.31, 11.39] | 17.08 [15.77, 18.47] |
| D_BLIND_B0 | 25.54% | 24.84% | 25.74% | 23.88% | **1.87** [0.92, 3.51] | 1.67 [0.14, 3.13] | 11.86 [10.65, 13.14] |

### 4.2 Paired comparisons with A (differences matched by seed, lineup, and starting player, pp)

| Comparison | Change in highest − lowest | 95% interval | Change in ADV−BEG | 95% interval |
|---|---:|---|---:|---|
| NORMAL_B5 − A | −11.22 | [−13.26, −7.94] | +17.55 | [16.24, 18.77] |
| B − A (bonus 3) | −0.85 | [−1.72, 0.02] | −5.19 | [−5.95, −4.41] |
| C − A (bonus 1) | −2.24 | [−3.69, −0.70] | −11.85 | [−13.06, −10.64] |
| D − A (bonus 0) | −10.69 | [−13.00, −7.78] | −17.07 | [−18.35, −15.76] |

### 4.3 Win share by turn position in single-tier lineups (averaged over four starters, 800 games per lineup)

| Condition | Lineup | 1st | 2nd | 3rd | 4th |
|---|---|---:|---:|---:|---:|
| NORMAL_B5 | all BEGINNER | 44.27% | 15.58% | 17.79% | 22.35% |
| NORMAL_B5 | all ADVANCED | 26.95% | 24.89% | 23.80% | 24.36% |
| A_BLIND_B5 | all BEGINNER | 44.27% | 15.58% | 17.79% | 22.35% |
| A_BLIND_B5 | all ADVANCED | 27.60% | 32.83% | 14.58% | 24.98% |
| B_BLIND_B3 | all BEGINNER | 42.96% | 17.12% | 18.52% | 21.40% |
| B_BLIND_B3 | all ADVANCED | 28.60% | 33.06% | 14.48% | 23.85% |
| C_BLIND_B1 | all BEGINNER | 42.02% | 18.02% | 19.21% | 20.75% |
| C_BLIND_B1 | all ADVANCED | 31.32% | 29.72% | 17.01% | 21.95% |
| D_BLIND_B0 | all BEGINNER | 25.04% | 23.98% | 25.50% | 25.48% |
| D_BLIND_B0 | all ADVANCED | 26.23% | 24.56% | 25.23% | 23.98% |

All-BEGINNER lineups produced identical results in Normal and Blind because the random strategy ignores board card identities, consistent with the earlier experiment.

### 4.4 Win share by turn position and tier in mixed lineups (aggregated by game within each condition)

| Condition | Tier | 1st | 2nd | 3rd | 4th |
|---|---|---:|---:|---:|---:|
| NORMAL_B5 | BEGINNER | 2.36% | 1.28% | 2.03% | 1.38% |
| NORMAL_B5 | ADVANCED | 47.20% | 48.08% | 49.85% | 47.82% |
| A_BLIND_B5 | BEGINNER | 20.99% | 6.15% | 8.22% | 6.79% |
| A_BLIND_B5 | ADVANCED | 44.27% | 33.98% | 40.84% | 38.76% |
| B_BLIND_B3 | BEGINNER | 22.18% | 9.87% | 10.92% | 9.56% |
| B_BLIND_B3 | ADVANCED | 42.24% | 31.14% | 38.03% | 36.05% |
| C_BLIND_B1 | BEGINNER | 24.77% | 13.60% | 14.59% | 12.89% |
| C_BLIND_B1 | ADVANCED | 38.70% | 29.22% | 34.31% | 31.92% |
| D_BLIND_B0 | BEGINNER | 19.64% | 19.17% | 20.09% | 17.38% |
| D_BLIND_B0 | ADVANCED | 31.44% | 30.51% | 31.40% | 30.37% |

### 4.5 Other observations (by turn position, mixed lineups)

| Condition | Games with tied first place | Placements per game (1st–4th) | Turn position receiving bonus (1st–4th, games) | Ending (empty hand / code limit) |
|---|---:|---|---|---|
| NORMAL_B5 | 4.92% | 7.46 / 7.23 / 6.99 / 6.72 | 987 / 1,106 / 1,198 / 1,132 | 5,305 / 1,095 |
| A_BLIND_B5 | 7.71% | 10.86 / 10.53 / 10.34 / 10.10 | 1,545 / 900 / 1,181 / 1,132 | 6,351 / 49 |
| B_BLIND_B3 | 7.98% | 10.86 / 10.53 / 10.34 / 10.10 | 1,545 / 900 / 1,181 / 1,132 | 6,351 / 49 |
| C_BLIND_B1 | 16.06% | 10.86 / 10.53 / 10.34 / 10.10 | 1,545 / 900 / 1,181 / 1,132 | 6,351 / 49 |
| D_BLIND_B0 | 46.40% | 10.86 / 10.53 / 10.34 / 10.10 | 1,545 / 900 / 1,181 / 1,132 | 6,351 / 49 |

(Denominator: 4,800 mixed-lineup games per condition. Bonus counts identify the recipient in games that ended with an empty hand.)

## 5. Result 2: Rescoring with a starting-player penalty (E, F)

| Condition | Highest − lowest (pp) | 95% interval | 1−4 (pp) | ADV−BEG (pp) | Turn positions p1 / p2 / p3 / p4 |
|---|---:|---|---:|---:|---|
| A (baseline) | 12.56 | [10.17, 14.91] | 9.85 | 28.93 | 32.63 / 20.07 / 24.53 / 22.78 |
| E: starter −1 | 8.80 | [6.40, 11.18] | 6.12 | 28.85 | 29.80 / 21.00 / 25.53 / 23.67 |
| F: starter −3 | 4.57 | [2.88, 6.44] | 1.19 | 28.10 | 25.91 / 22.40 / 26.97 / 24.72 |

Differences from A:

| Comparison | Change in highest − lowest (pp) | 95% interval | Change in ADV−BEG (pp) | 95% interval |
|---|---:|---|---:|---|
| E − A | −3.77 | [−4.19, −3.33] | −0.08 | [−0.33, 0.18] |
| F − A | −7.99 | [−9.60, −5.66] | −0.83 | [−1.37, −0.30] |

In single-tier lineups under F, averaged over starters, all-ADVANCED turn shares were 25.56 / 33.63 / 15.25 / 25.56% and all-BEGINNER shares were 35.56 / 18.48 / 20.90 / 25.06%. The penalty lowered the first turn's share. The second turn remained highest in the all-ADVANCED lineup.

## 6. Result 3: Four-game sets (G)

Each set groups four consecutive seeds (four distinct deals) within one lineup. P0 starts all four games on the fixed schedule. The rotating schedule averages four cyclic schedules, changing the starting player for each deal. Determine the set winner by adding each seat's win shares over the four games and split first place in a tie. Intervals use a bootstrap over set blocks (50 blocks, 2,000 replicates). These results are exploratory.

| Schedule | P0 (physical seat) | P1 | P2 | P3 | Highest − lowest across seats (pp) |
|---|---:|---:|---:|---:|---:|
| Fixed (P0 starts) | 39.75% | 14.25% | 25.08% | 20.92% | **25.50** |
| Rotating (mean of 4 cyclic schedules) | 25.03% | 23.60% | 24.87% | 26.49% | **2.89** |

- Rotating minus fixed (between-seat gap): **−22.61 pp**, 95% interval [−29.89, −13.87] (exploratory).
- The individual-game turn-order bias persists (section 4). It is offset within the set by rotating the turn positions.

### 6.1 Physical seat or turn position? (rotating schedule, condition A, 4,800 mixed-lineup games)

| Measure | 1st / seat P0 | 2nd / P1 | 3rd / P2 | 4th / P3 |
|---|---:|---:|---:|---:|
| Win share by physical seat | 26.00% | 24.07% | 24.86% | 25.07% |
| Win share by turn position relative to the starter | 32.63% | 20.07% | 24.53% | 22.78% |

With rotation, the difference follows turn position. The physical-seat bias was small, about +1 pp at P0. This is a descriptive value with no interval calculated.

## 7. Conclusions and candidates for human playtesting

| Option | Change in highest − lowest (vs. A) | Change in skill gap (vs. A) | Assessment |
|---|---|---|---|
| Bonus 3 (B) | −0.85 [−1.72, 0.02] | −5.19 | Little change in turn-order gap. Exclude. |
| Bonus 1 (C) | −2.24 [−3.69, −0.70] | −11.85 | Large loss of skill separation. Exclude. |
| Bonus 0 (D) | −10.69 [−13.00, −7.78] | −17.07 | The turn-order gap largely disappears, but so does 60% of the skill gap, and 46% of games have tied first place. Exclude. |
| Starter −1 (E) | −3.77 [−4.19, −3.33] | −0.08 [−0.33, 0.18] | Narrows the turn-order gap while preserving the skill gap. **Candidate** (simple). |
| Starter −3 (F) | −7.99 [−9.60, −5.66] | −0.83 [−1.37, −0.30] | Largest reduction in the turn-order gap with little loss of skill separation. **Candidate** (large effect). |
| Rotate over a 4-game set (G) | Individual games unchanged. Set-level seat gap −22.6 pp. | Individual games unchanged. | Scoring rules unchanged. Addresses fairness at set level only. **Candidate** (simplest). |

- **Worth testing with people:** F (starter −3) and G (4-game rotation). F substantially reduced the individual-game turn-order gap with little loss of skill separation. G evened out seats over a set without changing scores. E is a milder version of F.
- **Why this alone does not justify adoption:** All results come from self-play with two AI strategies. People might respond differently to a penalty. Only G separated turn position from seat. A starting-player penalty would add a new provision to the current starting rules. The decision rests with the owner.
- **Caveat for F:** After the penalty, the third turn had the highest share (26.97%). The highest-to-lowest gap narrowed, but some turn-order bias remained.

## 8. Limitations

1. AI self-play did not measure human learning, perceived difficulty, or responses to a penalty.
2. Only two strategies were used, BEGINNER (random) and ADVANCED (heuristic). Other strategies may yield different results.
3. Scoring was provisional. Outcomes depend on the reward table and bonus values.
4. The 8 lineups share seeds and are dependent. Intervals are exploratory. No adjustment was made for multiple comparisons across the conditions.
5. Conditions E and F rescore A records. The basis for treating those results as equivalent to live play is limited to section 3.4 (the AI ignores scores).
6. G has only 50 set blocks, giving wide intervals. The schedules share the same A records and are dependent.
7. Only schedule G separates seat and turn position in the starting-player experiment. The other live conditions rotated through all four starters but did not estimate the magnitude of the seat effect separately.

## 9. Problems encountered and corrections

- Initial smoke run: all 576 games failed because the initial state was not frozen. After applying `deepFreeze`, all 576 games completed on rerun.
- Initial type check: the new script had two type errors, one in a tuple type assertion and one in indexed access. After both fixes, `npm run typecheck` passed. Execution logic was unchanged. All 576 smoke games were rerun with the final code and matched the existing records.
- Analysis error: the summary file was accidentally overwritten with the bootstrap count lowered to 10. Rerunning the same command with 2,000 replicates restored the final `summary.json`. The tables use the restored summary.

## 10. Reproduction

```
npx tsx scripts/blind-turn-order-experiment.ts smoke --out <output-dir>/smoke
npx tsx scripts/blind-turn-order-experiment.ts run --seedFrom 200 --seedTo 299 --out <output-dir>/full
npx tsx scripts/blind-turn-order-experiment.ts run --seedFrom 300 --seedTo 399 --out <output-dir>/full
npx tsx scripts/blind-turn-order-experiment.ts analyze --seedFrom 200 --seedTo 399 --out <output-dir>/full --boot 2000
npm run typecheck
```

- Type check: `npm run typecheck` (`tsc -p tsconfig.json`) exited with code 0.
- The experiment was not committed and did not change the shipping rules.
