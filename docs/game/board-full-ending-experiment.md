# Full-board ending experiment on 6×6 (experimental only, shipped 8×8 unchanged)

Script: `scripts/board-full-ending-experiment.ts` (new, untracked file at the time of the experiment)
Raw logs and summary: `D:\DevCaches\tmp\qroker-board-full\raw\` (outside the repository)

## Answers to three questions

1. **Does 6×6 now end correctly? Yes.** All 600 paired-experiment games on 6×6 reached `ENDED`, with 0 driver errors. Every full-board game ended on placement 32. None requested placement 33. All 447 full-board games passed the final-score check (previous score + points for the placement + any bonus exactly once) and the post-game action rejection check. The category search across 1,800 games also recorded 0 failures.
2. **Is there a measurable advantage to playing fourth? No.** The fourth seat's overall winner share ranged from 18.8% to 30.5% across settings. On 6×6 BEGINNER, the first seat had 31.8% (interval 24.8–38.8) and the fourth 18.8% (13.8–24.3). Of these individual intervals, the fourth seat's excludes 25%. Paired differences from 8×8 using the same seeds included 0 for every seat (6×6 BEGINNER first +4.8, fourth −5.3). With multiple settings compared, an isolated interval is inconclusive. Result 3 examines the final placement separately. It changed the set of leaders in 16 of 447 games (3.6%). The fourth seat gained a sole or shared lead 4 times and lost one twice.
3. **Do scoring decisions occur often enough to justify a human playtest? In part.** Code counts were close to 8×8 in settings featuring ADVANCED players (OWNER ADVANCED 4.96 vs. 4.98, OWNER MIXED 3.51 vs. 3.89). BEGINNER and BLIND ADVANCED produced only 1.3–1.6 codes per game, with no code at all in 16–30% of games. That supports a short playtest, but scoring decisions were sparse.

**Recommendation:** Use the experimental 6×6 build with this rule for a limited human playtest. Keep the shipped 8×8 version as it is. Human preferences and playing time were not measured.

## Implementation

- Changes were confined to the 6×6 copy (`D:\DevCaches\tmp\qroker-board-full\v6new`). Shipped `src/game` was untouched.
- `core/engine.ts`: after placement, compute `boardFull = board.every(cell !== null)`. If there is a code, add `|| boardFull` to `endsGame`. Otherwise transition to `ENDED` after the existing empty-hand handling and before the deck-exhaustion check. Only existing bonus paths award bonuses. Filling the board carries no bonus of its own.
- `sim/play-game.ts`: changed one line each in the `PENDING_BATCH` and `PHASE_SHAPE` invariants to allow a full board. Changed the cell count check to 36.
- The driver runs the same loop directly and records an error if the game requests a placement on a full board. On the 8×8 copy, its action logs and scores matched `playGame` in 12/12 games.

## Recording game endings (separate flags for each game)

Each game records `boardFull`, `codeLimit` (reached 5 codes), `bonusSeat` (empty-hand bonus) and `deckEmpty`. Only one primary ending is counted, in priority order: empty hand > code limit > full board > deck exhaustion. No full-board finish overlapped another condition in the main experiment (600 games). The 1,800-game search found 6 overlaps (2 code limit, 4 empty hand).

## Regression: seed 5 (previous saturation case)

The previous experiment and the new rule used identical levels (P0 BEGINNER, P1 ADVANCED, P2 BEGINNER, P3 ADVANCED).

- Action log: all 52 previous actions matched the start of the new log exactly.
- Scores: the scores at saturation (4, 20, 0, 7) matched the new final scores (4, 20, 0, 7).
- Placement 32 was a non-scoring placement by P3 (a quiet ending). The new result was `ENDED`, `BOARD_FULL`, with 32 placements.

## Search by category (1,800 games: ADVANCED, MIXED, BEGINNER × 2 visibility modes × 300 seeds)

| Placement 32 | Games | Score/bonus check failures | Post-game rejection failures |
|---|---|---|---|
| No code | 1,197 | 0 | 0 |
| 1 code | 120 | 0 | 0 |
| 2 or more codes | 4 | 0 | 0 |
| Overlaps the code limit | 2 | 0 | 0 |
| Overlaps an empty-hand bonus | 4 | 0 | 0 |

**Representative replay (final placement also earned an empty-hand bonus):** Seed 126, OWNER_ONLY, MIXED, rotation 1. Levels: P0 BEGINNER, P1 ADVANCED, P2 BEGINNER, P3 ADVANCED.

- Scores before the final placement: P0 0, P1 4, P2 3, P3 5.
- Final placement: P3 placed S-2 at B4, completing codes A3 and A4 together. P3 emptied their hand and received the 5-point bonus once.
- Guesses for A3: P0 21, P1 29, P2 24, P3 25. For A4: P0 17, P1 29, P2 27, P3 23.
- Final scores: P0 3, P1 6, P2 16, P3 20 (including bonus). After the game ended, PLACE and ACK were both rejected with `GAME_ENDED`.

## Result 1: Game flow (100 paired seeds per setting and level, 0 failures)

| Board | Visibility | Level | Mean placements | Mean codes | Median placement of first code (games with codes) | Games without codes | All scores zero | Tied finishes | Ending counts (primary reason) |
|---|---|---|---|---|---|---|---|---|---|
| 8×8 | OWNER | BEGINNER | 37.2 | 1.30 | 19 (70) | 30 | 48 | 52 | Deck 97 / code limit 1 / empty hand 2 |
| 8×8 | OWNER | ADVANCED | 12.7 | 4.98 | 2 (100) | 0 | 0 | 5 | code limit 90 / empty hand 10 |
| 8×8 | OWNER | MIXED | 28.3 | 3.89 | 4 (100) | 0 | 0 | 7 | empty hand 62 / code limit 9 / Deck 29 |
| 8×8 | BLIND | BEGINNER | 37.2 | 1.30 | 19 (70) | 30 | 48 | 52 | Deck 97 / code limit 1 / empty hand 2 |
| 8×8 | BLIND | ADVANCED | 37.2 | 1.29 | 6 (76) | 24 | 36 | 65 | Deck 97 / empty hand 3 |
| 8×8 | BLIND | MIXED | 36.2 | 1.84 | 12 (85) | 15 | 27 | 47 | Deck 89 / code limit 3 / empty hand 8 |
| 6×6 | OWNER | BEGINNER | 32.0 | 1.34 | 19 (71) | 29 | 37 | 48 | full board 100 |
| 6×6 | OWNER | ADVANCED | 13.9 | 4.96 | 2 (100) | 0 | 0 | 7 | code limit 86 / empty hand 11 / full board 3 |
| 6×6 | OWNER | MIXED | 26.4 | 3.51 | 4 (100) | 0 | 1 | 4 | full board 53 / empty hand 41 / code limit 6 |
| 6×6 | BLIND | BEGINNER | 32.0 | 1.34 | 19 (71) | 29 | 37 | 48 | full board 100 |
| 6×6 | BLIND | ADVANCED | 31.6 | 1.42 | 6 (79) | 21 | 41 | 67 | full board 97 / empty hand 3 |
| 6×6 | BLIND | MIXED | 31.7 | 1.63 | 14 (84) | 16 | 27 | 52 | full board 94 / empty hand 6 |

BEGINNER ignores visibility, so OWNER and BLIND produced the same results.

## Result 2: Winner share by turn position (%, 95% seed-bootstrap intervals)

Position 1 is the engine's P0 (first to act). Tied leaders split winner credit equally.

| Board | Visibility | Level | 1st | 2nd | 3rd | 4th | Sole first (1/2/3/4) | Shared first (1/2/3/4) |
|---|---|---|---|---|---|---|---|---|
| 8×8 | OWNER | BEGINNER | 27.0 [20.8, 33.5] | 21.5 [16.5, 27.5] | 27.5 [21.5, 34.0] | 24.0 [18.5, 29.8] | 14 / 9 / 14 / 11 | 50 / 49 / 51 / 50 |
| 8×8 | OWNER | ADVANCED | 32.0 [23.5, 41.5] | 19.0 [12.0, 26.5] | 24.5 [16.5, 33.0] | 24.5 [16.0, 33.0] | 31 / 17 / 23 / 24 | 2 / 4 / 3 / 1 |
| 8×8 | OWNER | MIXED | 21.0 [13.0, 29.0] | 29.5 [21.0, 38.0] | 29.0 [20.5, 37.5] | 20.5 [13.0, 28.5] | 21 / 27 / 27 / 18 | 0 / 5 / 4 / 5 |
| 8×8 | BLIND | ADVANCED | 21.2 [16.5, 26.0] | 28.2 [22.7, 34.4] | 28.2 [22.8, 33.8] | 22.5 [17.9, 27.8] | 6 / 12 / 10 / 7 | 55 / 58 / 62 / 56 |
| 8×8 | BLIND | MIXED | 33.1 [26.0, 40.7] | 22.3 [16.3, 28.8] | 26.1 [19.4, 32.6] | 18.6 [13.2, 24.7] | 19 / 13 / 12 / 9 | 42 / 32 / 42 / 33 |
| 6×6 | OWNER | BEGINNER | 31.8 [24.8, 38.8] | 23.3 [17.5, 29.5] | 26.3 [20.0, 33.0] | 18.8 [13.8, 24.3] | 20 / 11 / 14 / 7 | 42 / 43 / 43 / 42 |
| 6×6 | OWNER | ADVANCED | 25.0 [17.0, 34.0] | 23.0 [15.5, 31.0] | 21.5 [14.0, 29.5] | 30.5 [22.0, 39.5] | 25 / 20 / 19 / 29 | 0 / 6 / 5 / 3 |
| 6×6 | OWNER | MIXED | 18.3 [11.3, 26.0] | 28.3 [20.0, 36.8] | 31.3 [22.3, 40.0] | 22.3 [14.3, 30.8] | 17 / 27 / 30 / 22 | 3 / 3 / 3 / 1 |
| 6×6 | BLIND | ADVANCED | 21.6 [17.8, 26.0] | 22.8 [18.3, 27.7] | 31.1 [25.7, 37.0] | 24.6 [19.5, 30.0] | 4 / 7 / 13 / 9 | 62 / 59 / 64 / 58 |
| 6×6 | BLIND | MIXED | 30.2 [23.3, 37.8] | 19.8 [14.8, 25.4] | 24.7 [18.8, 30.8] | 25.3 [19.1, 31.6] | 17 / 7 / 11 / 13 | 41 / 41 / 42 / 40 |

The BEGINNER BLIND row matches the OWNER row.

**Paired differences, 6×6 minus 8×8 (percentage points, same seeds):** Every interval includes 0. Examples: OWNER BEGINNER first +4.8 [−3.5, +13.3], OWNER ADVANCED first −7.0 [−15.0, +0.5], BLIND ADVANCED second −5.4 [−12.3, +1.2], BLIND MIXED fourth +6.8 [−0.4, +13.4].

## Result 3: Effect of the final placement (6×6 full-board games only)

| Visibility | Level | Full-board games | Leaders changed | Fourth seat gained lead | Fourth seat lost lead | Quiet ending | Guessing round |
|---|---|---|---|---|---|---|---|
| OWNER | BEGINNER | 100 | 6 | 2 | 0 | 86 | 14 |
| OWNER | ADVANCED | 3 | 0 | 0 | 0 | 3 | 0 |
| OWNER | MIXED | 53 | 1 | 0 | 1 | 50 | 3 |
| BLIND | BEGINNER | 100 | 6 | 2 | 0 | 86 | 14 |
| BLIND | ADVANCED | 97 | 0 | 0 | 0 | 97 | 0 |
| BLIND | MIXED | 94 | 3 | 0 | 1 | 88 | 6 |
| Total | | 447 | 16 (3.6%) | 4 (0.9%) | 2 (0.4%) | 410 (91.7%) | 37 (8.3%) |

The fourth seat made placement 32 in every full-board game. There were no full-board games on 8×8 for comparison. The OWNER ADVANCED sample had only 3 games.

## Result 4: ADVANCED versus BEGINNER (mixed lineups)

The measure is the share of winner credit earned by ADVANCED seats. A share of 0.5 indicates parity.

| Board | Visibility | ADVANCED share (95% interval) | 6×6 − 8×8 (pp, interval) |
|---|---|---|---|
| 8×8 | OWNER | 95.0 [91.0, 98.5] | — |
| 6×6 | OWNER | 93.5 [88.5, 97.5] | −1.5 [−7.0, +4.0] |
| 8×8 | BLIND | 61.2 [52.7, 68.8] | — |
| 6×6 | BLIND | 60.5 [52.5, 68.0] | −0.7 [−11.7, +10.3] |

## Verification and limitations

- Seeds 1–100, rotation r = (seed − 1) mod 4, with 25 seeds per rotation. Across the 4 rotations of the mixed lineup, ADVANCED occupied each turn position twice.
- No failures in 600 paired seeds (600 games on 8×8 and 600 on 6×6), 1,800 search games, the seed 5 regression or 24 smoke games.
- Confidence intervals used a bootstrap resampling seeds (2,000 replicates with fixed randomness).
- BEGINNER and ADVANCED are AI players. The experiment did not measure human reactions to this rule or human playing time.
- The empty-hand bonus used the shipped value of 5 points throughout.
