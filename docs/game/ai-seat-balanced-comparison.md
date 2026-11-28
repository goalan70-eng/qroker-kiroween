# ADVANCED vs. BEGINNER with balanced seat assignments

**These results come from synthetic headless self-play.** The games used a provisional score table (`DEV_PLACEHOLDER`) and involved no human players. They establish neither scoring balance nor a definitive difficulty level. The earlier report, `docs/game/headless-diagnostics.md`, was left unchanged.

## Question and method

Under the current scoring rules, does ADVANCED outperform BEGINNER when the two tiers play every seat equally often?

- For each seed from 0 to 199, play two games with the same initial deal and starting seat (P0). In game 1, ADVANCED plays P0/P2 and BEGINNER plays P1/P3. In game 2, swap the tiers.
- Run and report `OWNER_ONLY` and `FACE_UP` separately, for 800 games total (200 seeds × 2 assignments × 2 modes).
- Reuse the existing engine (`playGame`, invariant checks enabled), strategies (`getStrategy`), rankings (`rankPlayers`), and seed handling. The game rules, AI strategies, and scoring values were unchanged.
- **Scoring configuration used**, read from `defaultConfig()` at runtime: `rewardByError = [10, 5, 4, 3, 2, 1]` (errors of 6 or more score 0 points), `handEmptyBonus = 5`. The earlier diagnostic report lists `[6, 4, 3, 2, 1]` and a bonus of 3 in its text. That report was preserved as written.

To reproduce the run (about 10 seconds):

```powershell
npx --no-install tsx scripts/ai-seat-balanced-comparison.ts --out test-results/ai-seat-balanced-comparison.json
```

Add `--seeds 2` for the smoke check. The analysis script, `scripts/ai-seat-balanced-comparison.ts`, writes JSON to stdout. It exits with code 0 only if all games finish and all checks pass.

## How the results were counted

- **Rank** uses competition ranking from `rankPlayers` (number of seats with a higher score + 1). Tied seats receive the same rank. Mean rank averages seat-games within a tier (2 seats per tier in each game).
- **Sole first place** counts the winning seat in a game with one winner. **Tied first place** counts each seat-game that shared first place (21 games with ties → 42 seat-games).
- **Guesses** count once per seat per Composite Code in each game. If two codes form at once, count each separately. Error is `|guess − correct sum|`. Both tiers have equal seat counts and therefore equal numbers of guesses.
- **Empty-hand bonus frequency** counts the games in which a seat of that tier received the bonus (one seat per game, out of 400 games).
- **Score difference** is the mean ADVANCED seat score minus the mean BEGINNER seat score, calculated for each assignment and then averaged within each seed. The standard error describes these 200 seed means. No statistical test was performed.

## Smoke check (seeds 0–1)

All 8 games finished (exit code 0). Both pairs in each mode had matching initial deals, comparing the board, deck, hands, and starting seat. Each tier started 2 games per mode. Every game reached `ENDED` and ranked all 4 seats.

## Full run

Of 800 planned games, 800 were attempted and **800 completed**, with 0 failed games and 0 failed checks. All pairs (200 per mode) had matching initial deals. In each mode, ADVANCED started 200 games and BEGINNER started 200.

| Metric | OWNER_ONLY ADVANCED | OWNER_ONLY BEGINNER | FACE_UP ADVANCED | FACE_UP BEGINNER |
|---|---:|---:|---:|---:|
| Completed games (seat-games) | 400 (800) | 400 (800) | 400 (800) | 400 (800) |
| Sole first places (seat-games) | 371 | 8 | 400 | 0 |
| Tied first places (seat-games) | 37 | 5 | 0 | 0 |
| Mean rank | 1.578 | 3.278 | 1.500 | 3.424 |
| Mean final score per seat | 16.015 | 3.722 | 52.825 | 3.804 |
| Mean prediction score per seat (excluding bonus) | 13.546 | 3.691 | 50.325 | 3.804 |
| Guesses | 3,620 | 3,620 | 4,026 | 4,026 |
| Mean absolute guess error | 3.931 | 13.291 | 0 | 13.345 |
| Exact guesses | 10.06% | 2.18% | 100% | 1.56% |
| Games receiving the empty-hand bonus | 395 | 5 | 400 | 0 |

First place was tied in 21 OWNER_ONLY games and 0 FACE_UP games. In OWNER_ONLY, 273 games ended on the final guess and 127 when a placement emptied a hand without forming a code. All 400 FACE_UP games ended on the final guess.

### ADVANCED − BEGINNER score difference (mean of both assignments within each seed)

| Mode | Mean difference | Standard error | Seeds favoring ADVANCED / tied / favoring BEGINNER |
|---|---:|---:|---:|
| OWNER_ONLY | +12.292 | 0.299 | 199 / 1 / 0 |
| FACE_UP | +49.021 | 0.551 | 200 / 0 / 0 |

## What changed when the tiers swapped seats?

| Mode | Score difference with ADVANCED at P0/P2 | Score difference at P1/P3 | ADVANCED sole first places (out of 200 games) | BEGINNER sole first places |
|---|---:|---:|---:|---:|
| OWNER_ONLY | +13.018 | +11.568 | 187 → 184 | 3 → 5 |
| FACE_UP | +49.025 | +49.018 | 200 → 200 | 0 → 0 |

## Conclusions

- ADVANCED substantially outperformed BEGINNER in both modes with balanced seat assignments. In OWNER_ONLY, ADVANCED led on 199 of 200 seeds, with 1 tie and no seeds favoring BEGINNER. In FACE_UP, ADVANCED led on all 200 seeds.
- Swapping tiers reduced the OWNER_ONLY score gap from 13.0175 to 11.5675, a drop of 1.45 points. Because P0/P2 and P1/P3 swapped tiers together, this comparison cannot isolate the effect of P0 moving first. The FACE_UP score gaps were 49.025 and 49.0175 for the two assignments.
- In OWNER_ONLY, mean guess error was 3.93 for ADVANCED and 13.29 for BEGINNER. Prediction scores accounted for 9.855 points (about 80%) of the 12.2925-point mean gap per seat. ADVANCED received the empty-hand bonus in 395 of 400 games and BEGINNER in 5, adding 2.4375 points to the mean gap per seat.
- In FACE_UP, ADVANCED can see every card's identity and guesses the correct sum directly, consistent with the design described in `src/game/ai/heuristic.ts`. Its error was 0 and accuracy was 100%. BEGINNER does not read card identities and had similar error in both modes (13.3). The visibility rule therefore accounts for more of the FACE_UP gap than the difference in strategy.
- All games finished without a stall. None remained incomplete.

## Open questions

- The results do not establish which tier human players would find easy or difficult. Both tiers use simple strategies that do not model human guess accuracy, learning, or mistakes.
- The score table is provisional. Another table would change scores and gaps. These results do not establish scoring balance or a definitive difficulty level.
- Only seeds 0–199 were used. Standard errors are descriptive. No statistical test was performed.
- The experiment did not measure how `OWNER_ONLY` feels in a game with human players or how much knowing the cards in one's hand helps a person guess.
