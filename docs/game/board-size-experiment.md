# Board size experiment: 8×8 board use and games played on 6×6 (AI self-play)

Experiment script: `scripts/board-size-experiment.ts` (experiment only, no changes to shipped code)
Raw logs and summary: `D:\DevCaches\tmp\qroker-board-size\raw\` (outside the repository, not checked in)

## Method

- Baseline: ran the repository's 8×8 engine (`src/game`) as supplied.
- 6×6 variant: changes were confined to the following four locations in the copy at `D:\DevCaches\tmp\qroker-board-size\v6\src\game`.
  1. `core/geometry.ts`: changed `BOARD_SIZE` from 8 to 6, the column letters to `ABCDEF`, and the notation pattern to `/^[A-F][1-6]$/`.
  2. `core/board.ts`: moved the starting cells to C3, D3, C4, D4, in the same order (TL, TR, BL, BR) and orientation 0 as D4, E4, D5, E5.
  3. `sim/play-game.ts`: changed the `BOARD_CELLS` invariant from 64 to 36 (cell count check only).
- Pairing: for seeds 1–100, both boards used the same deck order, initial hands, starting seat (P0), visibility and AI seat assignments.
- Visibility: `OWNER_ONLY` and `BLIND`. Lineups: all BEGINNER, all ADVANCED, or mixed (P0 and P2 ADVANCED for even seeds, P0 and P2 BEGINNER for odd seeds).
- Saturation: when a turn required a placement with no empty cell available, the driver recorded `SATURATED` and stopped the game without introducing a new rule. All denominators include these games.
- Smoke checks: the 8×8 copy matched the action logs and scores from `playGame` in 12/12 games (seeds 1 and 2 × 2 visibility modes × 3 lineups). The 6×6 board accepted only A1–F6, rejected G1 and A7, and had 36 distinct cells.

## Result 1: Do games use the outer ring of the 8×8 board?

The outer ring is the 28 cells outside B2–G7. The denominator is 600 normally completed 8×8 games.

| Metric | Result |
|---|---|
| Games with at least one outer-ring placement | 558/600 (93.0%) |
| Share of placements on the outer ring | 28.8% (excluding starting cards) |
| Games with a scoring code (excluding the starting group) | 503/600 |
| Of those, games with a code containing an outer-ring cell | 232/503 (46.1%) |
| Median placement number at first use of the outer ring | 11th (558 games reached it) |
| Share of points from single-code placements attributable to outer-ring codes | 17.3% (1,962/11,325 points) |

Cell use (percentage of the 600 games with a card placed on each cell, S marks the starting cells):

```
        A     B     C     D     E     F     G     H
1     14.0  19.7  32.3  41.2  39.0  31.8  22.2  12.7
2     29.5  45.2  59.2  71.0  66.8  60.3  43.7  27.8
3     42.8  64.5  79.3  88.2  87.5  79.3  61.7  44.5
4     52.8  70.3  85.8    S     S   85.5  69.3  48.2
5     52.0  71.5  87.8    S     S   86.3  71.7  50.2
6     46.5  60.2  79.2  89.3  91.0  81.5  62.3  40.3
7     25.5  42.2  55.2  68.3  70.3  58.3  43.7  27.3
8     11.3  20.8  29.8  38.3  38.5  29.0  21.5  13.0
```

Use varied considerably by setting. At least one card reached the outer ring in 66% of OWNER_ONLY ADVANCED games, 93% of OWNER_ONLY MIXED games, and 99–100% of BLIND games across levels. The proportion of codes that included an outer-ring cell ranged from 26% to 63% across settings.

**Example of outer-ring scoring on 8×8:** Seed 8, OWNER_ONLY, BEGINNER. A code formed at D1, E1, D2, E2. D1 and E1 are on the first row (outer ring). The hidden sum was 45. P1 and P3 each scored 2 points.

```
   A       B       C       D       E       F       G       H
1  --*     S-8*    H-J*    S-Q*    C-Q*    H-4*    D-5*    C-10*
2  C-3*    H-9     S-3     D-K     C-8     S-9     C-6     C-4*
3  D-A*    C-7     S-10    D-7     C-J     S-K     S-5     S-A*
4  C-A*    C-2     D-3     S-J     H-6     S-6     --      --*
5  --*     C-9     H-A     D-J     D-8     --      --      --*
6  H-10*   S-2     D-9     --      H-K     --      --      --*
7  --*     --      D-2     D-Q     --      --      --      --*
8  --*     --*     D-10*   H-3*   H-7*     --*     --*    --*
```

(`*` marks the outer ring. D1, E1, D2 and E2 were filled on placements 6, 15, 4 and 3, respectively.)

## Result 2: Would the positions played on 8×8 fit on 6×6?

The final span of occupied cells, including starting cards, was measured for 600 normally completed 8×8 games.

| Condition | Percentage |
|---|---|
| Row span exceeds 6 rows | 67.0% |
| Column span exceeds 6 columns | 75.8% |
| At least one dimension exceeds 6 | 85.2% |

Thus 85% of 8×8 games spread beyond the dimensions of a 6×6 board. Touching the outer ring once is a separate measure. The span exceeded 6 in 98–100% of BLIND games across levels, 100% of OWNER_ONLY BEGINNER games and 30% of OWNER_ONLY ADVANCED games.

## Result 3: Games played on 6×6

Each setting has a denominator of 100 games. A `saturated` game had a full board, making the next placement impossible. Saturation always occurred on P0's turn (the 33rd placement requested after 32 placements).

| Visibility | Level | Board | Normal finish | Saturated | Mean placements | Mean codes | End reason (deck exhausted / code limit / empty hand) |
|---|---|---|---|---|---|---|---|
| OWNER_ONLY | BEGINNER | 8×8 | 100 | 0 | 37.23 | 1.30 | 97 / 1 / 2 |
| OWNER_ONLY | BEGINNER | 6×6 | 0 | 100 | 32.00 | 1.34 | – |
| OWNER_ONLY | ADVANCED | 8×8 | 100 | 0 | 12.71 | 4.98 | 0 / 90 / 10 |
| OWNER_ONLY | ADVANCED | 6×6 | 97 | 3 | 13.93 | 4.96 | 0 / 86 / 11 |
| OWNER_ONLY | MIXED | 8×8 | 100 | 0 | 27.43 | 3.66 | 30 / 9 / 61 |
| OWNER_ONLY | MIXED | 6×6 | 55 | 45 | 26.31 | 3.55 | 0 / 8 / 47 |
| BLIND | BEGINNER | 8×8 | 100 | 0 | 37.23 | 1.30 | 97 / 1 / 2 |
| BLIND | BEGINNER | 6×6 | 0 | 100 | 32.00 | 1.34 | – |
| BLIND | ADVANCED | 8×8 | 100 | 0 | 37.17 | 1.29 | 97 / 0 / 3 |
| BLIND | ADVANCED | 6×6 | 3 | 97 | 31.64 | 1.42 | 0 / 0 / 3 |
| BLIND | MIXED | 8×8 | 100 | 0 | 36.58 | 1.71 | 88 / 2 / 10 |
| BLIND | MIXED | 6×6 | 12 | 88 | 31.04 | 1.76 | 0 / 1 / 11 |

Saturated games had 4–8 cards left in the deck, consistent with the existing rule that a code-completing placement draws no replacement. For example, after 32 placements with 4 codes, 36 − (32 − 4) = 8 cards remain.

**Saturated 6×6 example:** Seed 5, OWNER_ONLY, MIXED. 32 placements, 4 codes, P0 to move, 8 cards left in the deck. S denotes a starting cell and # an occupied cell.

```
 #  #  #  #  #  #
 #  #  #  #  #  #
 #  #  S  S  #  #
 #  #  S  S  #  #
 #  #  #  #  #  #
 #  #  #  #  #  #
```

## Conclusion

**Recommendation: retain 8×8. Defer human playtesting of the current 6×6 variant until the owner decides how to handle a required placement when no cell is free.**

Two measurements support this recommendation.
1. On 6×6, saturation occurred in all BEGINNER settings (100%), BLIND ADVANCED (97%), BLIND MIXED (88%) and OWNER_ONLY MIXED (45%). With 4 starting cards on 36 cells, the board fills after 32 placements. The existing rules do not cover this case, so the experiment recorded it without adding a rule.
2. In 85.2% of 8×8 games the occupied area exceeded the dimensions of a 6×6 board, and 93% used the outer ring. Shrinking the board changes the structure of play.

**AI use of space and human preferences are separate questions.** These results show how BEGINNER and ADVANCED play. Human board preferences were not measured. BLIND ADVANCED averaged only 1.29 codes. Decisions based only on visible information may explain this, but the strategy code was not verified.

## Verification and limitations

- The 8×8 smoke comparison matched in 12/12 games. The 6×6 notation check passed (36 cells, G1 and A7 rejected).
- Games with errors: 0 out of 1,200.
- P0 always started. Mixed lineups alternated with seed parity.
- In every setting, 6×6 saturation occurred after 32 placements on P0's turn. Board capacity and turn order determine this outcome independently of AI choices.
- The experiment used synthetic AI play (BEGINNER and ADVANCED). It did not measure human behavior or actual playing time.
