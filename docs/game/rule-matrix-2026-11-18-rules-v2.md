# QRoker rule matrix — RULES_VERSION 2 — 2026-11-18

## Evidence

- **Successful targeted run:** https://github.com/goalan70-eng/qroker-kiroween/actions/runs/44324307598
- **Code commit tested:** `4261088dfde437d52919e0e510ae6fe856c6b538`
- **Raw results:** artifact `qroker-rule-matrix-rules-v2-200-seeds`, ID `14434589591`, 24 JSON files, 14-day retention.
- **24 configurations × 200 games = 4,800 automated AI games**, deterministic seeds 0..199 for each configuration.
- **Rule version:** 2. Every code-free placement draws one card, including each player's first placement. Code-forming placements do not draw; an empty deck skips the draw.
- **ScoreConfig:** exact match 10; errors 1..5 score 5,4,3,2,1; error >=6 scores zero; hand-empty bonus 5.
- **AI mixes:** beginner (all BEGINNER), advanced (all ADVANCED), mixed (P0/P2 ADVANCED; P1/P3 BEGINNER).
- This is **AI-only self-play**. It is not a human balance study, does not estimate game time in minutes, and does not validate optical recognition.

## Full results

Stop columns: `HAND` = hand depletion only, `CODE` = code limit only, `BOTH` = both thresholds on the same fully scored batch. Shared first counts games with at least two seats tied at rank 1. Seat rank-1 rates include ties, so their sum may exceed 100%.

| AI mix | Visibility | Hand | Code limit | Mean placements | Mean codes | HAND | CODE | BOTH | Shared first | P0/P1/P2/P3 rank-1 % |
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

## Main findings

1. **Mixed AI, OWNER_ONLY:** baseline 4 cards / no code limit averaged **35.185 placements**. The 3-card / 5-code candidate averaged **26.96**, a **-30.5% reduction**. However, 3 cards / no code limit averaged **27.555**; adding the 5-code cap reduced this by only **-2.2%**. The smaller starting hand accounts for most of the change.
2. **Beginner AI, OWNER_ONLY:** 4 cards / no limit averaged **43.89 placements**; 3 cards / 5-code averaged **43.59**. The 5-code threshold triggered in only **3/200 games**. Beginner self-play rarely completes codes, so the code limit does little to shorten these games.
3. **Advanced AI, OWNER_ONLY:** 4 cards / no limit averaged **31.115 placements**; 3 cards / 5-code averaged **12.615**. The five-code threshold was reached in **196/200 games**. The cap has a substantial effect for this AI tier.
4. **FACE_UP information changes the outcome.** Advanced 4-card / 5-code games were shared first across all four seats in **200/200** games. This is a scoring/information-structure warning: when all card identities are visible, AI can infer sums much more reliably, and a code-only ending does not award the hand-empty bonus.
5. **Mixed-tier skill gap remains large.** In OWNER_ONLY, P0/P2 (ADVANCED) rank-1 rates were 48%/53.5%, while P1/P3 (BEGINNER) were 1.5%/2%. Seat order and fixed skill assignment are confounded; this is not a causal estimate of turn-order advantage.

## Comparison with the pre-revision matrix

The older file [rule-matrix-2026-11-18.md](./rule-matrix-2026-11-18.md) was generated under RULES_VERSION 1, when the first placement was exempt from drawing. Those results are retained as historical evidence and **must not be combined with this RULES_VERSION 2 matrix**. The first-placement exemption materially affected hand sizes, placements, code counts and win rates.

## Limitations

- The experiment uses BEGINNER and ADVANCED only; EXPERT is not implemented.
- It uses deterministic AI strategies, not human participants. It does not model social behavior, bluffing, learning, player fatigue or real play time.
- Same seed with different hand sizes uses the same shuffled catalog but different card partitioning; it is not an identical-initial-hand paired experiment.
- Results depend on the provisional score table and the chosen AI strategies. Re-run with other seed ranges and perform human playtests before finalizing rules.
- Code-limit stops occur only after all four Guesses in the last batch are scored. A code-only stop does not award the hand-empty bonus; simultaneous code-limit and hand-empty stops do.

## Reproduction

~~~powershell
npm ci
npm run sim:rules -- --hand 4 --codes none --games 200 --seed 0 --mix mixed --visibility owner-only
npm run sim:rules -- --hand 4 --codes 5 --games 200 --seed 0 --mix mixed --visibility owner-only
npm run sim:rules -- --hand 3 --codes none --games 200 --seed 0 --mix mixed --visibility owner-only
npm run sim:rules -- --hand 3 --codes 5 --games 200 --seed 0 --mix mixed --visibility owner-only
~~~

Authorship: simulation runner and matrix workflow were authored by ChatGPT through the connected GitHub integration; this is not Kiro or Codex work.
