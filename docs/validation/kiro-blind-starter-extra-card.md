# Kiro task: Does a fourth starting card balance single-game Blind?

Run the experiment and report the result in Korean. The owner proposes: **단판 블라인드에서 선공만 손패 4장, 나머지는 3장으로 시작한다.** Estimate whether the extra choice helps the starter more than the additional card delays the 5-point hand-empty bonus.

## Conditions and deal

- A (live control): BLIND, all four hands start at three cards.
- H (live candidate): create exactly the same ordinary deal as A. Then draw the top card of the remaining deck with the engine's `drawTop` and append it to the actual starter's hand before the first placement. The other three hands, board and remaining deck order must match A after accounting for that draw. Start at 4/3/3/3 with 35 cards in the deck. Set the actual starter independently of physical seat. Extra-card games require new action sequences.
- F (reference): rescore the matched A game with a 3-point deduction from the starter's final total. Compare H with A and F separately. H has no point deduction.
- Preserve the private board, visible own hand, first-placement draw rule, five-code limit, complete final-batch scoring, scoring table and hand-empty bonus of 5. Use the existing AI strategies unchanged.

## Driver and validation

1. Read `scripts/blind-turn-order-experiment.ts` and its report `docs/game/blind-turn-order-balance-ko.md`. Reuse the driver logic and existing ranking. Keep experiment files outside production code. Keep existing experiment results intact.
2. The simulator has a three-card hand-size invariant. In the experiment only, validate a cap of four for the actual H starter and three for everyone else. Keep every other invariant, including 52-card conservation, uniqueness, frozen states and legal transitions. Assert exact initial hand sizes, actual first PLACE, no extra draw after a code, and correct bonus attribution. A failed game or check must cause a failing verification run.
3. First run a smoke batch with seeds 0–1, eight lineups and four actual starters. Check deterministic replay of H from its modified initial state. Check A against the established driver, including action hashes and scores. Smoke-test BLIND_SCORE_ONLY against BLIND for H. If they diverge, report it and analyze the two settings separately.
4. Run A and H on seeds 200–399, all eight lineups (all BEGINNER, all ADVANCED, six balanced mixes) and four actual starters. Expect 6,400 matched pairs. Validate A against the previous A_BLIND_B5 records by seed, lineup and starter when available. Preserve seat-based AI randomization and verify starting deals as described above. Store raw records outside Git in a fresh output directory. Record failures, missing pairs and the baseline revision.

## Measurements and decision

- Primary: for the six mixed lineups pooled equally (4,800 pairs), report tie-adjusted win shares for turns 1–4, highest minus lowest, and signed first minus fourth. Show paired differences H−A and H−F with exploratory 95% intervals from 2,000 whole-seed bootstrap draws. Keep all starters, lineups and conditions for each sampled seed together.
- Report the ADVANCED minus BEGINNER win-share gap, shared-first frequency, and results for both uniform lineups separately. Also split the starter's results by its tier in mixed games; the extra choice may have different value to the two strategies.
- To interpret the result, report starter hand-empty bonus frequency, starter prediction points excluding bonus, first-placement code completion rate and average game length in placements. Distinguish observed changes from causal explanations. Report denominators per table and check that mixed-condition termination counts sum to 4,800.
- End with a single-game recommendation comparing no change, starter −3 points and starter +1 card. Identify whether H overcorrects, whether another position becomes favored, and which option merits human testing. The findings apply to the tested AI policies.
- Deliver a reproducible experiment command, a Korean report under `docs/game/`, and the result of `npm run typecheck`. Run the smoke and full comparison before summarizing. Keep the playable rules unchanged; do not commit or push.
