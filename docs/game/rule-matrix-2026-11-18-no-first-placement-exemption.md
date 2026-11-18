# QRoker draw-rule experiment matrix — 2026-11-18 (no first-placement exemption)

## Evidence and exact rule under test

- **Successful targeted run:** https://github.com/goalan70-eng/qroker-kiroween/actions/runs/44318009851
- **Run commit:** `e05e8bd64866dfa9e0224b39e987d09ed35d933b`, which contains the updated draw rule and simulator.
- **Raw JSON artifact:** `qroker-rule-matrix-200-seeds`, artifact ID `14433642321` (24 JSON files, 14-day retention).
- **24 experiment cells × 200 games = 4,800 AI-only games**, deterministic seeds 0..199 per cell.
- **Rule version:** 2. After every placement: if zero new eligible Composite Codes are formed, draw one card regardless of whether it is the player's first placement; if one or more codes are formed, draw none; if the deck is empty, skip the required draw.
- **ScoreConfig:** exact 10; absolute errors 1..5 score 5,4,3,2,1; error >=6 scores zero; hand-empty bonus 5 (Codex PR #13 branch).
- The production game is still 4 cards / hand-empty ending. 3-card and code-limit cases are simulation-only.
- These are deterministic AI self-play results, not human win rates, measured play time, or proof of balance.

Stop columns: `HAND` = hand depletion only, `CODE` = code limit only, `BOTH` = both conditions reached on the same fully scored batch. `Shared 1st` counts games with two or more seats tied at rank 1. P0/P1/P2/P3 rates include shared wins, so percentages can sum to more than 100%.

## Full current-rule results

| AI mix | Visibility | Hand | Code limit | Mean placements | Mean codes | HAND | CODE | BOTH | Shared 1st | P0/P1/P2/P3 rank-1 % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| mixed | owner-only | 4 | none | 35.185 | 4.930 | 200 | 0 | 0 | 11 | 43.5 / 0.5 / 61.5 / 0 |
| mixed | owner-only | 4 | 5 | 30.105 | 4.405 | 76 | 97 | 27 | 8 | 46.5 / 1.5 / 55.5 / 0.5 |
| mixed | owner-only | 3 | none | 27.555 | 4.125 | 200 | 0 | 0 | 10 | 48 / 1 / 54.5 / 1.5 |
| mixed | owner-only | 3 | 5 | 26.960 | 4.035 | 122 | 18 | 60 | 10 | 48 / 1.5 / 53.5 / 2 |
| mixed | face-up | 4 | none | 24.730 | 5.935 | 200 | 0 | 0 | 0 | 44.5 / 0 / 55.5 / 0 |
| mixed | face-up | 4 | 5 | 19.555 | 4.830 | 34 | 121 | 45 | 121 | 74.5 / 0 / 86 / 0 |
| mixed | face-up | 3 | none | 17.700 | 4.310 | 200 | 0 | 0 | 0 | 43 / 0 / 57 / 0 |
| mixed | face-up | 3 | 5 | 17.280 | 4.205 | 109 | 19 | 72 | 19 | 48.5 / 0 / 61 / 0 |
| advanced | owner-only | 4 | none | 31.115 | 9.990 | 200 | 0 | 0 | 13 | 25 / 33.5 / 25 / 23.5 |
| advanced | owner-only | 4 | 5 | 12.465 | 5.000 | 0 | 200 | 0 | 20 | 30.5 / 27.5 / 27 / 25.5 |
| advanced | owner-only | 3 | none | 20.085 | 6.970 | 200 | 0 | 0 | 9 | 23 / 29.5 / 26.5 / 25.5 |
| advanced | owner-only | 3 | 5 | 12.615 | 4.980 | 4 | 176 | 20 | 14 | 29 / 26.5 / 25.5 / 26 |
| advanced | face-up | 4 | none | 28.965 | 10.695 | 200 | 0 | 0 | 0 | 15 / 42 / 22.5 / 20.5 |
| advanced | face-up | 4 | 5 | 12.180 | 5.000 | 0 | 200 | 0 | 200 | 100 / 100 / 100 / 100 |
| advanced | face-up | 3 | none | 18.780 | 7.200 | 200 | 0 | 0 | 0 | 11.5 / 42 / 23.5 / 23 |
| advanced | face-up | 3 | 5 | 12.395 | 4.990 | 2 | 185 | 13 | 185 | 92.5 / 99 / 93 / 93 |
| beginner | owner-only | 4 | none | 43.890 | 1.570 | 200 | 0 | 0 | 11 | 52 / 12.5 / 18 / 23 |
| beginner | owner-only | 4 | 5 | 43.790 | 1.560 | 197 | 3 | 0 | 11 | 51 / 13 / 18.5 / 23 |
| beginner | owner-only | 3 | none | 43.625 | 1.725 | 200 | 0 | 0 | 19 | 41.5 / 12 / 25 / 31 |
| beginner | owner-only | 3 | 5 | 43.590 | 1.720 | 197 | 2 | 1 | 19 | 41.5 / 12 / 25.5 / 30.5 |
| beginner | face-up | 4 | none | 43.890 | 1.570 | 200 | 0 | 0 | 11 | 52 / 12.5 / 18 / 23 |
| beginner | face-up | 4 | 5 | 43.790 | 1.560 | 197 | 3 | 0 | 11 | 51 / 13 / 18.5 / 23 |
| beginner | face-up | 3 | none | 43.625 | 1.725 | 200 | 0 | 0 | 19 | 41.5 / 12 / 25 / 31 |
| beginner | face-up | 3 | 5 | 43.590 | 1.720 | 197 | 2 | 1 | 19 | 41.5 / 12 / 25.5 / 30.5 |

## What changed versus the previous 4,800-game matrix

The previous report used the **old per-player first-placement draw exemption**. The table below compares only the same 3-card / 5-code scenarios (same seeds and AI assignments); do not mix these results with the old matrix as if the rule were unchanged.

| AI mix | Visibility | Old mean placements | New mean placements | Change | New games reaching code limit (CODE+BOTH) |
| --- | --- | ---: | ---: | ---: | ---: |
| beginner | owner-only | 42.235 | 43.590 | +3.2% | 3/200 (1.5%) |
| beginner | face-up | 42.235 | 43.590 | +3.2% | 3/200 (1.5%) |
| mixed | owner-only | 20.800 | 26.960 | +29.6% | 78/200 (39.0%) |
| mixed | face-up | 13.885 | 17.280 | +24.5% | 91/200 (45.5%) |
| advanced | owner-only | 12.815 | 12.615 | -1.6% | 196/200 (98.0%) |
| advanced | face-up | 12.415 | 12.395 | -0.2% | 198/200 (99.0%) |

## Findings

1. **Beginner-only games still rarely reach five codes.** In the 3/5 scenario, only 3/200 games (1.5%) reached the code threshold; 197/200 ended by hand depletion only. The new rule increases mean placements from the previous 42.235 to 43.590, but this is still similar to the new-rule 4/none baseline.
2. **Mixed OWNER_ONLY games now reach the code threshold more often.** 78/200 (39%) reached it, versus 8/200 (4%) under the former exemption. Mean placements are 26.960, 29.6% higher than the old-rule 3/5 result, but 23.4% below the new-rule 4/none baseline.
3. **Advanced OWNER_ONLY games almost always hit the five-code threshold.** 196/200 (98%) reached it; mean placements are 12.615.
4. **Advanced FACE_UP remains a tie-heavy warning.** 185/200 games (92.5%) ended with a shared first place under 3/5; rank-1 rates include ties. The 4/5 advanced FACE_UP cell in the full table must also be checked when comparing code-only ending.
5. **Seat position and AI skill are still confounded in mixed games.** The fixed assignment is P0/P2 ADVANCED and P1/P3 BEGINNER. The resulting rank-1 rates cannot isolate turn order from difficulty. A separate rotation experiment is required.

## Limitations and policy

- The runner uses the production reducer and scoring, but a code-limit-only result remains a core `REVEAL` snapshot rather than `ENDED`; it is not a normal production save/replay.
- The same seed does not produce identical hands across hand-size conditions because the same shuffle is repartitioned differently.
- The AI registry currently has BEGINNER and ADVANCED only; no EXPERT tier. AI self-play does not model real human decision quality or social play.
- No game-duration minutes are estimated. Human playtests remain necessary.
- The former matrix at `rule-matrix-2026-11-18.md` is explicitly historical and used the old exemption.
- Rule version 2 rejects version-1 saves as incompatible to avoid silently replaying old action logs under changed draw semantics.

## Reproduction

~~~powershell
npm ci
npm run sim:rules -- --hand 4 --codes none --games 200 --seed 0 --mix mixed --visibility owner-only
npm run sim:rules -- --hand 4 --codes 5 --games 200 --seed 0 --mix mixed --visibility owner-only
npm run sim:rules -- --hand 3 --codes none --games 200 --seed 0 --mix mixed --visibility owner-only
npm run sim:rules -- --hand 3 --codes 5 --games 200 --seed 0 --mix mixed --visibility owner-only
~~~

This report was generated from the actual `SIM_RESULT|` lines of the successful run above. The experiment utility and this report were authored through ChatGPT's GitHub integration; Kiro/Codex did not implement this draw-rule change.
