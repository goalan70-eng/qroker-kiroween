# Headless self-play diagnostics (task 13.2)

**Diagnostic evidence from placeholder scoring (`DEV_PLACEHOLDER_SCORE_CONFIG`, provisional, no balance claim); synthetic headless self-play; NOT a balance study; no claim that ADVANCED is balanced, optimal or better than BEGINNER.**

This file is written by `src/game/sim/e2e.test.ts` when the test runs with `E2E_WRITE_DIAGNOSTICS=1`, from the games of that run. It is descriptive: counts and means of the games the acceptance run played. It contains no timestamps and no timings, so the same code and the same `E2E_SEEDS` give the same file. No constant of the game was chosen or changed because of these numbers.

## How the numbers were produced

- Seeds: 0..199 (N = 200), every Seed in every configuration, so 1200 complete games.
- Configurations: strategy mix x identity visibility. ALL_BEGINNER = BEGINNER on P0..P3; ALL_ADVANCED = ADVANCED on P0..P3; MIXED = P0 ADVANCED, P1 BEGINNER, P2 ADVANCED, P3 BEGINNER. Visibility is OWNER_ONLY or FACE_UP.
- Configuration of each game: `defaultConfig()` with `identityVisibility` overridden; the driver assigns an AI strategy to all four seats. The score table is the placeholder `rewardByError [6, 4, 3, 2, 1]`, `handEmptyBonus 3`.
- Every game ran with `checkInvariants: true` and was checked by the independent oracles of the test (see the header of the test file).
- Win means rank 1 of `rankPlayers` (competition ranking, no tiebreak). A game whose rank 1 is held by one seat is an outright win for that seat; a game whose rank 1 is shared counts a shared win for every seat at rank 1 and one tie at the top.
- Regenerate: `E2E_WRITE_DIAGNOSTICS=1 npx vitest --run src/game/sim/e2e.test.ts`.

## Results per configuration

| Metric | ALL_BEGINNER / OWNER_ONLY | ALL_BEGINNER / FACE_UP | ALL_ADVANCED / OWNER_ONLY | ALL_ADVANCED / FACE_UP | MIXED / OWNER_ONLY | MIXED / FACE_UP |
| --- | --- | --- | --- | --- | --- | --- |
| Games played | 200 | 200 | 200 | 200 | 200 | 200 |
| Games failed | 0 | 0 | 0 | 0 | 0 | 0 |
| Rejected actions (IllegalAiActionError) | 0 | 0 | 0 | 0 | 0 | 0 |
| Invariant violations | 0 | 0 | 0 | 0 | 0 | 0 |
| Strategy errors / action-limit errors / other errors | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Games with an inspection problem | 0 | 0 | 0 | 0 | 0 | 0 |
| Replay mismatches | 0 | 0 | 0 | 0 | 0 | 0 |
| Determinism re-runs (seed % 10 = 0): checked / mismatches | 20 / 0 | 20 / 0 | 20 / 0 | 20 / 0 | 20 / 0 | 20 / 0 |
| PLACE actions per game: min / mean / max | 27 / 43.570 / 45 | 27 / 43.570 / 45 | 13 / 25.510 / 45 | 14 / 23.880 / 38 | 13 / 31.435 / 45 | 13 / 21.130 / 37 |
| Accepted actions per game (mean) | 51.105 | 51.105 | 67.660 | 67.855 | 53.695 | 45.230 |
| Prediction batches per game (mean) | 1.525 | 1.525 | 8.620 | 8.995 | 4.590 | 5.020 |
| Composite Codes completed per game (mean) | 1.545 | 1.545 | 8.620 | 8.995 | 4.595 | 5.020 |
| Batches with 2 codes / all batches | 4 / 305 (1.31 %) | 4 / 305 (1.31 %) | 0 / 1724 (0.00 %) | 0 / 1799 (0.00 %) | 1 / 918 (0.11 %) | 0 / 1004 (0.00 %) |
| Games with at least one 2-code batch | 4 / 200 (2.00 %) | 4 / 200 (2.00 %) | 0 / 200 (0.00 %) | 0 / 200 (0.00 %) | 1 / 200 (0.50 %) | 0 / 200 (0.00 %) |
| Game ended by the last guess / by a PLACE without code | 18 / 182 | 18 / 182 | 190 / 10 | 200 / 0 | 138 / 62 | 200 / 0 |
| Ties at the top (rank 1 shared) | 25 / 200 (12.50 %) | 25 / 200 (12.50 %) | 25 / 200 (12.50 %) | 0 / 200 (0.00 %) | 13 / 200 (6.50 %) | 0 / 200 (0.00 %) |

## Hand-empty bonus seat (games per seat)

| Seat | ALL_BEGINNER / OWNER_ONLY | ALL_BEGINNER / FACE_UP | ALL_ADVANCED / OWNER_ONLY | ALL_ADVANCED / FACE_UP | MIXED / OWNER_ONLY | MIXED / FACE_UP |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | 91 | 91 | 58 | 53 | 119 | 109 |
| P1 | 21 | 21 | 59 | 70 | 0 | 0 |
| P2 | 43 | 43 | 42 | 37 | 80 | 91 |
| P3 | 45 | 45 | 41 | 40 | 1 | 0 |

## Mean final score per seat

Final score includes the hand-empty bonus. Seat P0 always places first, so a seat's mean also reflects its position, not only its strategy.

| Seat (tier in that configuration) | ALL_BEGINNER / OWNER_ONLY | ALL_BEGINNER / FACE_UP | ALL_ADVANCED / OWNER_ONLY | ALL_ADVANCED / FACE_UP | MIXED / OWNER_ONLY | MIXED / FACE_UP |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | 2.260 (BEGINNER) | 2.260 (BEGINNER) | 16.510 (ADVANCED) | 54.765 (ADVANCED) | 11.010 (ADVANCED) | 31.755 (ADVANCED) |
| P1 | 1.265 (BEGINNER) | 1.265 (BEGINNER) | 16.690 (ADVANCED) | 55.020 (ADVANCED) | 2.175 (BEGINNER) | 2.440 (BEGINNER) |
| P2 | 1.585 (BEGINNER) | 1.585 (BEGINNER) | 16.220 (ADVANCED) | 54.525 (ADVANCED) | 10.220 (ADVANCED) | 31.485 (ADVANCED) |
| P3 | 1.560 (BEGINNER) | 1.560 (BEGINNER) | 15.775 (ADVANCED) | 54.570 (ADVANCED) | 2.265 (BEGINNER) | 2.350 (BEGINNER) |

## Rank-1 results per seat

Each cell is outright wins / shared wins.

| Seat | ALL_BEGINNER / OWNER_ONLY | ALL_BEGINNER / FACE_UP | ALL_ADVANCED / OWNER_ONLY | ALL_ADVANCED / FACE_UP | MIXED / OWNER_ONLY | MIXED / FACE_UP |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | 80 / 16 | 80 / 16 | 47 / 13 | 53 / 0 | 105 / 12 | 109 / 0 |
| P1 | 25 / 9 | 25 / 9 | 45 / 12 | 70 / 0 | 1 / 0 | 0 / 0 |
| P2 | 33 / 13 | 33 / 13 | 42 / 13 | 37 / 0 | 78 / 13 | 91 / 0 |
| P3 | 37 / 14 | 37 / 14 | 41 / 13 | 40 / 0 | 3 / 1 | 0 / 0 |

## Results per tier

A tier's mean score is its seats' summed final scores divided by games times the number of seats of that tier. Wins are summed over the seats of the tier. In MIXED the two ADVANCED seats are P0 and P2 and the two BEGINNER seats are P1 and P3, so P0's first move and the seat order are confounded with the tier; no conclusion about strength follows.

| Configuration | Tier | Seats | Mean final score per seat | Outright wins | Shared wins | Rank-1 results per seat-game |
| --- | --- | --- | --- | --- | --- | --- |
| ALL_BEGINNER / OWNER_ONLY | BEGINNER | P0 P1 P2 P3 | 1.667 | 175 | 52 | 227 / 800 (28.38 %) |
| ALL_BEGINNER / FACE_UP | BEGINNER | P0 P1 P2 P3 | 1.667 | 175 | 52 | 227 / 800 (28.38 %) |
| ALL_ADVANCED / OWNER_ONLY | ADVANCED | P0 P1 P2 P3 | 16.299 | 175 | 51 | 226 / 800 (28.25 %) |
| ALL_ADVANCED / FACE_UP | ADVANCED | P0 P1 P2 P3 | 54.720 | 200 | 0 | 200 / 800 (25.00 %) |
| MIXED / OWNER_ONLY | ADVANCED | P0 P2 | 10.615 | 183 | 25 | 208 / 400 (52.00 %) |
| MIXED / OWNER_ONLY | BEGINNER | P1 P3 | 2.220 | 4 | 1 | 5 / 400 (1.25 %) |
| MIXED / FACE_UP | ADVANCED | P0 P2 | 31.620 | 200 | 0 | 200 / 400 (50.00 %) |
| MIXED / FACE_UP | BEGINNER | P1 P3 | 2.395 | 0 | 0 | 0 / 400 (0.00 %) |

## Visibility comparison

For each strategy mix: the number of Seeds whose complete action log is identical in OWNER_ONLY and in FACE_UP. A strategy that does not read card identities plays the same game in both modes.

| Mix | Seeds with identical action log in both modes |
| --- | --- |
| ALL_BEGINNER | 200 / 200 (100.00 %) |
| ALL_ADVANCED | 0 / 200 (0.00 %) |
| MIXED | 0 / 200 (0.00 %) |

## Limitations

- The scores come from the placeholder score table; a different table changes every score, win and tie number above.
- The games are synthetic self-play of two simple heuristic strategies, not human play.
- Seat P0 places first in every game; the tables above do not separate seat position from tier.
- Neither strategy aims at a placement that completes two codes at once, so the 2-code rows rest on few games; they say nothing about how often a human player would see such a batch.
- The numbers describe these seeds only (0..199); no statistical test was made and none is claimed.
