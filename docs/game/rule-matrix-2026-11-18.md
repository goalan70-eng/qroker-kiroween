# QRoker experimental rule matrix — 2026-11-18

## Evidence

- **Actual run:** https://github.com/goalan70-eng/qroker-kiroween/actions/runs/44305190930 — **success**; exact GitHub Actions workflow commit `411c82848f6b05517c02d4ba5cbd40d5e6a803cd`.
- **Raw results:** GitHub Actions artifact `qroker-rule-matrix-200-seeds` (24 machine-readable JSON files, artifact ID `14427931564`, retention 14 days). The table below is transcribed by a script from the emitted `SIM_RESULT|` records in this successful run, not estimated.
- **24 experiment cells × 200 games = 4,800 automated AI games**, deterministic seeds 0..199 for each cell. These are configuration-specific games; repetitions under different configurations are not independent samples.
- **ScoreConfig:** exact match 10; errors 1..5 score 5,4,3,2,1; error >=6 scores zero; hand-empty bonus 5. The runner uses the Codex #13 scoring branch.
- This is **AI-only self-play**. It is NOT a test of actual human strength, perceived pace in minutes, market readiness, or optical recognition.

## Full aggregated results

Stop columns: `HAND` = hand depletion only, `CODE` = code limit only, `BOTH` = both thresholds on the same completed scoring batch. **Shared 1st** counts games with at least two seats tied at rank 1. `P0/P1/P2/P3 1st %` are rank-1 rates **including ties**, so their sum can exceed 100%.

| AI mix | Board visibility | Starting hand | Code limit | Mean placements | Mean codes | HAND | CODE | BOTH | Shared 1st | P0/P1/P2/P3 1st % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| mixed | face-up | 4 | none | 21.130 | 5.020 | 200 | 0 | 0 | 0 | 54.5 / 0 / 45.5 / 0 |
| mixed | face-up | 4 | 5 | 19.070 | 4.590 | 64 | 72 | 64 | 72 | 72.5 / 0 / 63.5 / 0 |
| mixed | face-up | 3 | none | 13.885 | 3.290 | 200 | 0 | 0 | 1 | 52 / 0 / 48.5 / 0 |
| mixed | face-up | 3 | 5 | 13.885 | 3.290 | 185 | 0 | 15 | 1 | 52 / 0 / 48.5 / 0 |
| mixed | owner-only | 4 | none | 31.435 | 4.595 | 200 | 0 | 0 | 10 | 59.5 / 0.5 / 44 / 1 |
| mixed | owner-only | 4 | 5 | 28.835 | 4.355 | 85 | 63 | 52 | 15 | 58 / 0.5 / 47.5 / 1.5 |
| mixed | owner-only | 3 | none | 20.855 | 3.190 | 200 | 0 | 0 | 8 | 50.5 / 2 / 49.5 / 2 |
| mixed | owner-only | 3 | 5 | 20.800 | 3.190 | 192 | 1 | 7 | 8 | 50 / 2 / 50 / 2 |
| advanced | face-up | 4 | none | 23.880 | 8.995 | 200 | 0 | 0 | 0 | 26.5 / 35 / 18.5 / 20 |
| advanced | face-up | 4 | 5 | 12.295 | 5.000 | 0 | 200 | 0 | 200 | 100 / 100 / 100 / 100 |
| advanced | face-up | 3 | none | 14.355 | 5.540 | 200 | 0 | 0 | 0 | 25.5 / 36 / 22 / 16.5 |
| advanced | face-up | 3 | 5 | 12.415 | 4.915 | 15 | 104 | 81 | 104 | 68.5 / 71 / 58.5 / 58 |
| advanced | owner-only | 4 | none | 25.510 | 8.620 | 200 | 0 | 0 | 13 | 32 / 27 / 23 / 25.5 |
| advanced | owner-only | 4 | 5 | 12.580 | 5.000 | 0 | 195 | 5 | 26 | 30 / 34 / 27.5 / 22 |
| advanced | owner-only | 3 | none | 15.095 | 5.490 | 200 | 0 | 0 | 12 | 30 / 28.5 / 24 / 25 |
| advanced | owner-only | 3 | 5 | 12.815 | 4.865 | 22 | 103 | 75 | 15 | 29 / 26 / 26.5 / 26 |
| beginner | face-up | 4 | none | 43.570 | 1.545 | 200 | 0 | 0 | 22 | 46.5 / 16.5 / 23 / 25.5 |
| beginner | face-up | 4 | 5 | 43.570 | 1.545 | 198 | 0 | 2 | 22 | 46.5 / 16.5 / 23 / 25.5 |
| beginner | face-up | 3 | none | 42.235 | 1.495 | 200 | 0 | 0 | 19 | 43.5 / 18 / 23 / 25.5 |
| beginner | face-up | 3 | 5 | 42.235 | 1.495 | 200 | 0 | 0 | 19 | 43.5 / 18 / 23 / 25.5 |
| beginner | owner-only | 4 | none | 43.570 | 1.545 | 200 | 0 | 0 | 22 | 46.5 / 16.5 / 23 / 25.5 |
| beginner | owner-only | 4 | 5 | 43.570 | 1.545 | 198 | 0 | 2 | 22 | 46.5 / 16.5 / 23 / 25.5 |
| beginner | owner-only | 3 | none | 42.235 | 1.495 | 200 | 0 | 0 | 19 | 43.5 / 18 / 23 / 25.5 |
| beginner | owner-only | 3 | 5 | 42.235 | 1.495 | 200 | 0 | 0 | 19 | 43.5 / 18 / 23 / 25.5 |

## Direct comparisons for product decisions

1. **Mixed tiers, OWNER_ONLY.** Published baseline `4 / none` averaged **31.435 placements**; `3 / 5` averaged **20.8 placements**, a **33.8% decrease**. But `3 / none` averaged **20.855**, almost identical to `3 / 5`; only **8/200 (4.0%)** of `3 / 5` games reached the five-code threshold at all. Thus the hand change dominates this reduction.
2. **Advanced AI only, OWNER_ONLY.** `4 / none` 25.51 placements; `3 / 5` 12.815 (49.8% lower), with **178/200 (89.0%)** reaching the code threshold, including both conditions. For experienced players the code limit does meaningfully shorten games.
3. **Beginner AI only, OWNER_ONLY.** `4 / none` averaged 43.57 placements; `3 / 5` averaged 42.235 (3.1% lower), with **0/200** reaching the five-code threshold. The proposed mode does **not** reliably shorten novice-only play in this self-play model.
4. **Critical design problem for FACE_UP.** In `4 / 5` with four ADVANCED AIs, **200/200 games** ended with four-way shared rank 1; each seat's reported rank-1 rate was **100%**. With all card identities public and the Guess sums trivial to derive for these strategies, code-only ending removes the hand-empty bonus that otherwise separates scores. This is a warning about the scoring information structure; it should not be presented as a defect in the simulator.
5. **Mixed-tier winning probability (OWNER_ONLY, 3 / 5):** ADVANCED seats P0/P2 reached rank 1 in 50% / 50% of games; BEGINNER seats P1/P3 in 2% / 2%. The 4-seat turn order and the AI assignment are confounded with tier; this is not proof about human novice chances.

## Model and validity limitations

- The production game stays 4-card / hand-empty-only; experimental modes use a separate driver and do not change core reducer or replay.
- Stopping at code limit happens after all four players submit guesses and the entire last batch is scored. Code-only stopping does not award the hand-empty bonus; simultaneous stop conditions do.
- The code-limit-only snapshot remains `REVEAL`, not production `ENDED`, and standard save/replay is not supported for this experiment.
- Same seed with different hand counts means different hand partitions after the same shuffle, so direct paired-seed results are not identical starting hands.
- Current AI strategies are BEGINNER and ADVANCED only (EXPERT not implemented). The current simulation checks its reducer invariants but does not model human risk preferences, social interaction, strategic blocking or game duration in minutes.
- Repeating with other seeds and human playtesting is necessary before choosing 3-card / five-code as a final rule.

## Replication

~~~powershell
npm ci
npm run sim:rules -- --hand 4 --codes none --games 200 --seed 0 --mix mixed --visibility owner-only
npm run sim:rules -- --hand 4 --codes 5 --games 200 --seed 0 --mix mixed --visibility owner-only
npm run sim:rules -- --hand 3 --codes none --games 200 --seed 0 --mix mixed --visibility owner-only
npm run sim:rules -- --hand 3 --codes 5 --games 200 --seed 0 --mix mixed --visibility owner-only
~~~

The CI workflow `.github/workflows/run-rule-matrix.yml` executes all three AI mixes, both visibility modes, two hand sizes and two code-limit values, and uploads its outputs. Authorship of the experiment runner and the workflow: **ChatGPT directly via GitHub integration**, not Kiro or Codex.
