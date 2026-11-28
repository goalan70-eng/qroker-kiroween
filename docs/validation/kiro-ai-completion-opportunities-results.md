# AI code-completion opportunities (blind versus normal, 8×8 and 6×6)

Protocol: `docs/validation/kiro-ai-completion-opportunities.md`
Script: `scripts/completion-opportunities.ts` (experiment only, no changes to shipped code)
Raw results: `D:\DevCaches\tmp\qroker-completion-opportunities\out\` (`turns.jsonl`, `summary.json`, `game-checks.json`, `example-8x8-BLIND-ADVANCED.txt`)
Raw INTERMEDIATE games: `D:\DevCaches\tmp\qroker-completion-opportunities\raw-intermediate\`
Saved BEGINNER and ADVANCED games: `D:\DevCaches\tmp\qroker-board-full\raw\` (read only)

## Why were there fewer completed codes in blind mode?

**Most of the difference came from fewer opportunities to complete a code. Some came from missed opportunities.** For ADVANCED on 8×8, the breakdown was:

| Measure | Normal (OWNER_ONLY) | Blind (BLIND) |
|---|---|---|
| Codes per game | 4.98 (498/100) | 1.29 (129/100) |
| Turns with a legal move that completed a code | 498 / 1271 (39.2%) | 174 / 3717 (4.7%) |
| Turns with a completion opportunity per game | 4.98 | 1.74 |
| Completion chosen when available | 498 / 498 (100%) | 129 / 174 (74.1%, 95% interval 67.4–81.3) |
| Turns where an available completion was missed | 0 / 498 | 45 / 174 (25.9%) |

- **Fewer opportunities (most of the gap):** Of the difference of 3.69 codes per game, 3.24 (88%) came from fewer turns with a completion available.
- **Missed opportunities (the remainder):** The remaining 0.45 (12%) came from missing a completion on 26% of turns when one was available.
- Blind mode never offered a move that was certain to complete a code (0 certain candidates across 100 games). All 45 misses occurred on turns with no certain move.
- On those same opportunity turns, the random-choice baseline was 4.1% (7.2/174). ADVANCED chose a completion much more often than random play would.

The pattern was similar on 6×6. A completion was available on 202/3164 turns (6.4%) for blind ADVANCED and 498/1393 (35.8%) in normal mode. Of the difference of 3.54 codes per game, 2.95 (83%) came from fewer opportunities and 0.59 (17%) from missed choices.

## Did blind mode remove opportunities, or did the policy build different boards?

- On a given board, blind mode preserves the conditions for completing a code. It changes what information the AI sees when choosing a placement.
- With card identities hidden in blind mode, ADVANCED used only board occupancy to choose its placements. The boards created by that policy offered fewer turns with a completion available (39.2% → 4.7%).
- BEGINNER played identical games under both visibility settings because its random policy ignores revealed information. These games cannot isolate an effect of blind mode for BEGINNER. BEGINNER's completion rate was comparable to the random baseline (normal 8×8: 5.4% vs. 4.9%, normal 6×6: 8.9% vs. 9.2%).
- The difference arose on boards created by the AI. Human play was not measured.

## Did ADVANCED miss opportunities in normal mode?

On normal 8×8, ADVANCED completed a code on all 498 opportunity turns. There were no certain completion candidates. Every successful completion involved a hidden card. These attempts succeeded 99.0% of the time (498/503). On 6×6 the reported opportunity conversion rate was 99.6% (496/498).

Blind ADVANCED succeeded on only 4.8% (129/2686) of such attempts. With no certain move, every blind attempt was classified as uncertain.

## Comparison of three levels (100 paired seeds per setting, 0 failures)

The table compares game flow. A claim about which level wins more often would require mixed-level games.

| Board and mode | Level | Codes per game | Games without codes | Median turn of first code (games with codes) | Full-board endings | Turns with an opportunity | Completion when available | Successful uncertain attempts | Random baseline |
|---|---|---|---|---|---|---|---|---|---|
| 8×8 normal | BEGINNER | 1.30 | 30 | 19 (70) | 0 | 2393/3723 (64.3%) | 129/2393 (5.4%) | 117/436 (26.8%) | 4.9% |
| 8×8 normal | ADVANCED | 4.98 | 0 | 2 (100) | 0 | 498/1271 (39.2%) | 498/498 (100%) | 498/503 (99.0%) | 4.3% |
| 8×8 normal | INTERMEDIATE | 2.37 | 6 | 7 (94) | 0 | 271/3687 (7.4%) | 237/271 (87.5%) | 234/1841 (12.7%) | 3.8% |
| 8×8 blind | BEGINNER | 1.30 | 30 | 19 (70) | 0 | 2393/3723 (64.3%) | 129/2393 (5.4%) | 129/806 (16.0%) | 4.9% |
| 8×8 blind | ADVANCED | 1.29 | 24 | 6 (76) | 0 | 174/3717 (4.7%) | 129/174 (74.1%) | 129/2686 (4.8%) | 4.1% |
| 8×8 blind | INTERMEDIATE | 1.10 | 34 | 8 (66) | 0 | 154/3710 (4.2%) | 110/154 (71.4%) | 110/2778 (4.0%) | 3.5% |
| 6×6 normal | BEGINNER | 1.34 | 29 | 19 (71) | 100 | 1500/3200 (46.9%) | 133/1500 (8.9%) | 125/559 (22.4%) | 9.2% |
| 6×6 normal | ADVANCED | 4.96 | 0 | 2 (100) | 3 | 498/1393 (35.8%) | 496/498 (99.6%) | 496/531 (93.4%) | 4.9% |
| 6×6 normal | INTERMEDIATE | 2.23 | 10 | 7 (90) | 90 | 240/3103 (7.7%) | 223/240 (92.9%) | 220/1378 (16.0%) | 8.2% |
| 6×6 blind | BEGINNER | 1.34 | 29 | 19 (71) | 100 | 1500/3200 (46.9%) | 133/1500 (8.9%) | 133/1019 (13.1%) | 9.2% |
| 6×6 blind | ADVANCED | 1.42 | 21 | 6 (79) | 97 | 202/3164 (6.4%) | 142/202 (70.3%) | 142/2330 (6.1%) | 6.5% |
| 6×6 blind | INTERMEDIATE | 1.15 | 32 | 8 (68) | 98 | 163/3182 (5.1%) | 115/163 (70.6%) | 115/2357 (4.9%) | 6.2% |

- In normal mode, INTERMEDIATE had a certain candidate on 3 turns on 8×8 (6 candidates) and 3 turns on 6×6 (8 candidates). It chose a certain move on all three such turns in each setting, and every certain candidate would indeed complete a code. Blind mode had 0 certain candidates.
- “Successful uncertain attempts” gives the proportion of chosen uncertain attempts that completed a code. The denominator is the number of uncertain attempts chosen.
- Parentheses after the median turn of first completion give the number of games with a code.

**6×6 minus 8×8 (paired by seed, codes per game, 95% seed-bootstrap intervals):** Normal BEGINNER +0.04 [−0.24, +0.33], normal ADVANCED −0.02 [−0.06, +0.02], normal INTERMEDIATE −0.14 [−0.50, +0.20], blind BEGINNER +0.04 [−0.24, +0.33], blind ADVANCED +0.13 [−0.08, +0.32], blind INTERMEDIATE +0.05 [−0.16, +0.26]. All intervals include 0.

## Replay 1: A completion missed by blind ADVANCED (8×8, seed 11, placement 22)

AI view: hand H-7, D-4. Occupied cells appear as `?` (identity hidden) and empty cells as `.`.

```
 .  .  .  .  .  .  .  .
 .  .  .  .  .  .  .  .
 .  .  .  .  ?  .  .  .
 ?  ?  ?  ?  ?  ?  ?  ?
 ?  ?  ?  ?  ?  ?  ?  ?
 ?  ?  ?  ?  ?  ?  ?  ?
 .  .  .  .  .  .  .  .
 .  .  .  .  .  .  .  .
```

- **AI choice:** H-7 at D3, rotated 180° (computed from the view using the decision seed). No code.
- **Ground truth after the fact (hidden from the AI, used only for analysis):** Two legal moves completed the code at E3. Both placed D-4 at F3 (orientations 0° and 180°). The view could not establish whether either move would complete the code at decision time. Success depended on the identities of hidden cards.
- A random legal move on this turn had a 4.1% chance of completing a code (completing moves divided by legal moves).

## Reproduction

```
npx tsx scripts/completion-opportunities.ts prepare
npx tsx scripts/completion-opportunities.ts smoke
npx tsx scripts/completion-opportunities.ts generate 100
npx tsx scripts/completion-opportunities.ts replay
npx tsx scripts/completion-opportunities.ts report
npx tsx scripts/completion-opportunities.ts example 8x8 BLIND ADVANCED
```

## Verification

- **Replay comparison:** All 1,200 games (800 saved BEGINNER/ADVANCED and 400 new INTERMEDIATE) matched their recorded actions, final scores, placement counts and code counts (1200/1200). The analysis measured 37,073 placement turns.
- **Smoke checks (seeds 1, 2):** Replays matched in 24 actual simulated games. The invariance check matched on 678/678 turns: swapping the identities of two hidden cells preserved the view and choice. All 11 synthetic checks passed, including selection of a certain completion, a failed uncertain attempt, a hidden cell invalidating a condition, deterministic choice with no opportunity, and completion of two codes at once.
- **Guarantee check:** Every candidate classified as a certain completion actually completed a code (100%).
- **BLIND constraint:** Blind mode had 0 certain completion candidates.
- The saved BEGINNER/ADVANCED logs were read only. New results went into a separate folder.

## Limitations

- The frequency of opportunity turns depends on the board each AI creates. The comparison did not hold the board fixed.
- INTERMEDIATE was created specifically for the experiment. It is not a shipped strategy.
- Confidence intervals resampled seeds. Individual turns were not resampled.
- Only AI behavior was measured. Human use of the board was not measured.
- Relative win rates across levels require a mixed-level comparison.
