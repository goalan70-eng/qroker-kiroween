# Seat, turn order, and Blind mode in AI self-play

**These are synthetic AI self-play results.** The experiment involved no human players and compared only two AI strategies, BEGINNER (random) and ADVANCED (heuristic). The provisional score table does not support claims about difficulty or balance. The earlier report, `docs/game/ai-seat-balanced-comparison-ko.md`, covered OWNER_ONLY and FACE_UP with the score table `[10, 5, 4, 3, 2, 1]` and bonus 5. It was left unchanged.

## 1. Questions

1. Does going first confer an advantage?
2. Does ADVANCED retain its advantage in Blind mode?

## 2. Experimental setup

| Item | Value |
|---|---|
| Revision | `3e7a626` |
| Working tree | 40 modified tracked files and 4 untracked files from unrelated work. No changes to the engine (`src/game/core/engine.ts`), scoring (`score.ts`), draws (`draw.ts`), AI strategies (`src/game/ai/*.ts`, excluding tests), or simulator (`src/game/sim/`, excluding tests). Only `.kiro/specs/qroker-playable-game/tasks.md` retained a checkbox change from the previous turn. |
| Experiment script | `scripts/ai-blind-self-play.ts`, SHA-256 `A410E1E5BFC1BE0052E91220427E70E22DD876D8077982AE8C7943C2A32D9BC5` |
| Reproduction command (smoke) | `npx tsx scripts/ai-blind-self-play.ts --seeds 2 --boot 200 --out <output-dir>/smoke` |
| Reproduction command (full) | `npx tsx scripts/ai-blind-self-play.ts --seeds 200 --boot 2000 --out <output-dir>/full` |
| Output | Outside the repository at `D:/DevCaches/tmp/qroker-blind-selfplay/`. Per-game records in `games-200.jsonl`, summary in `summary-200.json`. Neither was added to Git. |
| Conditions | `OWNER_ONLY` (Normal), `BLIND` (reveal the correct sum and score), `BLIND_SCORE_ONLY` (reveal only the score). Excludes `FACE_UP`. |
| Seeds | 0–199 |
| Lineups (8) | All BEGINNER, all ADVANCED, and the 6 ways to assign two ADVANCED players to four seats, with BEGINNER in the remaining seats. |
| Scoring | Read from the runtime configuration: `rewardByError = [10, 5, 4, 3, 2, 1]`, `handEmptyBonus = 5`. |
| Turn order | The engine always starts at P0. Seats P0–P3 therefore correspond to turn positions 1–4, confounding seat and turn-order effects. |
| Win share | Players tied for first divide the win equally. Shares sum to 1 per game (verified for every game). |

### 2.1 Runs and denominators

| Run | Attempted | Completed | Failed | Checks |
|---|---:|---:|---:|---|
| Smoke (2 seeds) | 48 | 48 | 0 | All passed |
| Full (200 seeds) | 4,800 | 4,800 | 0 | All passed |

Full-run checks confirmed that every game with the same seed had the same board, hands, deck order, and starting turn. Every game finished, had a sum of win shares of 1, and produced rankings. Both tiers started equally often (BEGINNER 4 times and ADVANCED 4 times per mode). Of the 8 lineups, BEGINNER started in 1 all-BEGINNER lineup and 3 mixed lineups. ADVANCED started in 1 all-ADVANCED lineup and 3 mixed lineups.

Denominators:
- Single-tier lineups: 200 games per lineup per mode (2 single-tier lineups × 200 seeds).
- Mixed lineups: 1,200 games per mode. Each tier contributed 600 seat-games at each seat because it occupied that seat in three of the six lineups.
- Entire experiment: 4,800 games and 19,200 seat-games.

Uncertainty was estimated by bootstrapping seeds with replacement, keeping all lineups and modes for a seed together. The 95% percentile intervals use 2,000 replicates and random seed 20261124.

## 3. Result 1: Win rate by seat in single-tier lineups

Win rate is the mean win share, including ties for first. Counts of sole and tied first places are shown alongside it.

**Normal (`OWNER_ONLY`)**

| Seat (turn position) | BEGINNER win rate (sole/tied) | ADVANCED win rate (sole/tied) |
|---|---|---|
| 1st P0 | **38.5%** (71/12) | 27.5% (52/6) |
| 2nd P1 | 10.5% (18/6) | 24.3% (44/9) |
| 3rd P2 | 23.0% (41/10) | 23.5% (43/8) |
| 4th P3 | 28.0% (51/10) | 24.8% (47/5) |

- First minus fourth: BEGINNER **+10.5 pp** (95% interval −0.5 to +20.8), ADVANCED **+2.8 pp** (−7.0 to +12.3). Both intervals include 0. Here and below, pp means percentage points.

**Blind with the correct sum revealed (`BLIND`)**

| Seat (turn position) | BEGINNER | ADVANCED |
|---|---|---|
| 1st P0 | 38.5% (71/12) | 31.3% (61/3) |
| 2nd P1 | 10.5% (18/6) | 32.2% (61/7) |
| 3rd P2 | 23.0% (41/10) | 13.9% (25/6) |
| 4th P3 | 28.0% (51/10) | 22.7% (43/5) |

- First minus fourth: BEGINNER **+10.5 pp** (−0.5 to +20.8), ADVANCED **+8.6 pp** (−1.7 to +18.8). Both intervals include 0.
- ADVANCED win rates vary irregularly by seat (32.2% and 13.9%). These differences do not establish a seat effect.

**Blind with only the score revealed (`BLIND_SCORE_ONLY`)** produced the same win rates as `BLIND` throughout (see section 4).

## 4. Result 2: Mixed lineups by tier and seat

Each tier–seat combination covers 600 seat-games. Sole and tied first places are seat-game counts. The win rate is total win share divided by the number of seat-games.

**Normal (`OWNER_ONLY`)**

| Tier | Seat | Seat-games | Sole first | Tied first | Share-based win rate |
|---|---|---:|---:|---:|---:|
| BEGINNER | 1st P0 | 600 | 17 | 7 | 3.42% |
| BEGINNER | 2nd P1 | 600 | 5 | 3 | 1.08% |
| BEGINNER | 3rd P2 | 600 | 5 | 5 | 1.22% |
| BEGINNER | 4th P3 | 600 | 6 | 6 | 1.50% |
| ADVANCED | 1st P0 | 600 | 259 | 28 | 45.50% |
| ADVANCED | 2nd P1 | 600 | 264 | 34 | 46.81% |
| ADVANCED | 3rd P2 | 600 | 302 | 31 | 52.92% |
| ADVANCED | 4th P3 | 600 | 269 | 33 | 47.56% |

**Blind with the correct sum revealed (`BLIND`)**

| Tier | Seat | Seat-games | Sole first | Tied first | Share-based win rate |
|---|---|---:|---:|---:|---:|
| BEGINNER | 1st P0 | 600 | 120 | 15 | 21.14% |
| BEGINNER | 2nd P1 | 600 | 25 | 10 | 4.97% |
| BEGINNER | 3rd P2 | 600 | 33 | 13 | 6.50% |
| BEGINNER | 4th P3 | 600 | 36 | 14 | 7.11% |
| ADVANCED | 1st P0 | 600 | 259 | 28 | 45.42% |
| ADVANCED | 2nd P1 | 600 | 194 | 30 | 34.69% |
| ADVANCED | 3rd P2 | 600 | 233 | 26 | 40.89% |
| ADVANCED | 4th P3 | 600 | 220 | 33 | 39.28% |

Every cell for `BLIND_SCORE_ONLY` matches the corresponding `BLIND` cell.

### Mixed-lineup summary (pp, 95% intervals)

| Metric | Normal | Blind (correct sum revealed) | Change in Blind (Blind − Normal) |
|---|---|---|---|
| ADVANCED mean − BEGINNER mean (win share) | **+46.4** (45.4 ~ 47.3) | **+30.1** (28.0 ~ 32.3) | **−16.3** (−18.7 ~ −13.7) |
| 1st − 4th (all seats) | −0.1 (−3.4 ~ +3.3) | **+10.1** (+6.5 ~ +13.9) | **+10.2** (+5.4 ~ +15.2) |
| 1st − 4th (BEGINNER only) | +1.9 (+0.4 ~ +3.4) | **+14.0** (+10.4 ~ +17.9) | +12.1 (+8.4 ~ +16.1) |
| 1st − 4th (ADVANCED only) | −2.1 (−8.6 ~ +4.4) | **+6.1** (+0.5 ~ +12.0) | +8.2 (−0.5 ~ +17.1) |

In mixed lineups, the two ADVANCED seats together accounted for about 96% of win share in Normal and about 80% in Blind.

## 5. Result 3: Comparing the two Blind settings on the same seeds and lineups

| Comparison | Pairs compared | Pairs with different action logs | Pairs with different final scores |
|---|---:|---:|---:|
| `BLIND` vs. `BLIND_SCORE_ONLY` | 1,600 (200 seeds × 8 lineups) | **0** | **0** |
| Normal vs. `BLIND` | 1,600 | 1,400 | 1,398 |
| Normal vs. `BLIND_SCORE_ONLY` | 1,600 | 1,400 | 1,398 |

By lineup:
- All BEGINNER: Normal and Blind action logs matched on every seed (0/200 differed). The random strategy ignores revealed information and selects the same legal move on the same seed.
- Lineups with at least one ADVANCED player: Normal and Blind action logs differed on every seed (200/200). Final scores matched in just one pair each for ADV P1+P3 and ADV P2+P3.
- `BLIND` and `BLIND_SCORE_ONLY` had identical logs for every lineup and seed (0/1,600 differed).

**Interpretation**
- The current strategies appear to ignore the revealed correct sum. (a) All 1,600 pairs had identical action logs in `BLIND` and `BLIND_SCORE_ONLY`. (b) In non-test code under `src/game/ai/`, 0 lines read `.history`, `lastReveal`, `hiddenSum`, or `revealedCards` when comments are excluded. Both observations apply to the strategies tested. Recheck if the strategies change.
- **Hiding board card identities** explains the difference between Normal and Blind. Revealing the correct sum had no observed effect. ADVANCED estimates from `unseenCards`, the cards remaining after visible board cards are removed. In Blind it cannot identify all the board cards, which changes its decisions. The experiment could not separate the effects of hiding board cards and hiding revealed cards. Concealing the “revealed cards” in Blind also affects the set of cards ADVANCED treats as unseen.

## 6. Conclusions

**Question 1: Does going first confer an advantage?**
- Normal showed no clear benefit. In the all-BEGINNER lineup the first seat won 38.5% versus 28.0% for the fourth, but the interval for the difference includes 0 (−0.5 to +20.8). Across mixed lineups the difference was close to 0 (−3.4 to +3.3).
- Blind showed a first-seat advantage of +10.1 pp (+6.5 to +13.9) across mixed lineups, +14.0 pp for BEGINNER and +6.1 pp for ADVANCED (interval close to 0). However, in the all-ADVANCED lineup win rates did not vary monotonically with turn order (1st 31.3%, 2nd 32.2%, 3rd 13.9%, 4th 22.7%). This makes a turn-order effect difficult to isolate.
- Seat and turn order were confounded. P0 always moved first, so moving first and occupying seat P0 were equivalent.

**Question 2: Does ADVANCED retain its advantage in Blind?**
- Yes. In mixed lineups, the mean share for ADVANCED was 40.1% and for BEGINNER 9.9%, a gap of +30.1 pp (28.0 to 32.3).
- The gap was 16.3 pp smaller than the +46.4 pp gap in Normal (interval for the difference −18.7 to −13.7). ADVANCED retained a reduced advantage.

**Does this evidence justify changing the rules?**
- No. (1) Only two AI strategies were tested, with no human data. (2) Seat and turn order were confounded. Isolating turn order requires varying the starting seat. (3) Scoring was provisional. (4) Seat-level results were inconsistent in the all-ADVANCED Blind lineup.
- These results alone do not justify rotating the starting turn, changing scoring, or changing the reveal rules. The decision rests with the owner.

## 7. Limitations

- AI self-play did not measure human learning or perceived difficulty. These results support no difficulty claim.
- P0 always started. The experiment could not separate seat and turn-order effects.
- The score table was provisional. Seat win rates and gaps could change under another table.
- The 8 lineups shared seeds and were therefore dependent. Intervals were calculated by bootstrapping seeds.
- The finding that the strategies ignore the revealed correct sum applies to the current code.

## 8. Reproduction

```
npx tsx scripts/ai-blind-self-play.ts --seeds 2 --boot 200 --out <output-dir>/smoke
npx tsx scripts/ai-blind-self-play.ts --seeds 200 --boot 2000 --out <output-dir>/full
```

- Smoke run: 48/48 completed, all checks passed.
- Full run: 4,800/4,800 completed, 0 failures, approximately 228 seconds.
- Both commands exited with code 0. The summary is in `summary-200.json` and the raw records in `games-200.jsonl`. Neither file was added to Git.
- This report was not committed at the time of the experiment.
