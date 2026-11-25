# Kiro task: Test first-turn balance in Blind mode

Run this experiment in the QRoker checkout containing this file. Implement the experiment, run the smoke and full batches, and write the results in Korean. The owner wants evidence for a rule decision. Keep the shipped game rules, UI, AI strategies, existing reports and historical raw results intact.

## Question and baseline

Can we bring the four turn positions closer together without eliminating the advantage of skill? Does rotating the starting player address fairness over a four-game set even when an individual game favors an early position?

Read `docs/game/ai-blind-self-play-ko.md`, `scripts/ai-blind-self-play.ts`, and the current simulator, state initialization, ranking and score configuration. Record the actual commit and working-tree state. In the previous P0-start mixed Blind sample, tie-adjusted win shares by turn were 33.28%, 19.83%, 23.69%, 23.19%. A retrospective zero-bonus calculation suggests a smaller gap. Treat that as a hypothesis.

## Treatments

| ID | Blind scoring rule | How to test |
|---|---|---|
| A | Current hand-empty bonus of 5 | Live control |
| B | Hand-empty bonus of 3 | Live score configuration |
| C | Hand-empty bonus of 1 | Live score configuration; tests whether even a small bonus breaks ties |
| D | Hand-empty bonus of 0 | Live score configuration; hand exhaustion still ends the game |
| E | Bonus of 5, deduct 1 final point from the starting player | Rescore A's final scores, allow negative totals, rerank ties |
| F | Bonus of 5, deduct 3 final points from the starting player | Same paired rescore as E |
| G | Bonus of 5, rotate the starter over a four-game set | Reuse A data to measure fairness across players over a set |

Use the normal mode (`OWNER_ONLY`) with bonus 5 as a live reference. Use `BLIND` for the main comparison. Smoke-test `BLIND_SCORE_ONLY` against `BLIND` with identical inputs for each live Blind treatment. If action hashes or scores differ, include the second Blind setting in the full comparison and document the divergence. Keep the three-card hand, draw rule, five-code limit, full final-batch scoring and guess reward table unchanged.

## Matched design and execution

1. Use the existing eight lineups: all BEGINNER, all ADVANCED, and all six ways to seat two of each. Keep physical seat IDs, hands, board, deck and tier assignments fixed within a seed and lineup. Independently change who makes the **first actual placement**, cycling P0 through P3. Record both physical seat and turn position relative to the starter. Verify the first PLACE in the action log. Relabeling P0 after the game does not perform this test.
2. The current simulator initializes the turn via `newGame`. Implement starter selection in an experiment-only driver under `scripts/`, initializing from the real deal and using the actual reducer, views, AI registry, decision seeds, acting-seat policy and invariant checks. Preserve seat-based AI randomness. For P0, check parity against the existing `playGame` on action logs and scores. For the other starters, compare the initial deal fingerprints **excluding turn**; store the starter separately. For B–D, pass the bonus into the live configuration before play and record score and action-log differences against A. E and F use the actual starter, including when it is not P0.
3. Run a smoke batch first with seeds 0–1. Check legacy P0 parity, expected coverage, equal deals, deterministic replay from the same initial state, correct bonus recipient and amount, and win shares summing to one. Check the exact P0 control against available prior game records. Fix harness errors before the full run.
4. Use fresh seeds 200–399 for the full sample. With five live conditions (A–D and Normal), eight lineups and four starters, expect 32,000 games before any additional Blind setting. E–G reuse records. Write checkpoints and raw output to a new directory outside Git; resume by a unique condition/seed/lineup/starter key. Record failed and missing games and report paired denominators.
5. For G, build four-game sets from **different deals** with the same lineup. For each consecutive four-seed block, compare P0 starting all four games with a rotating starter. Use all four cyclic offsets for the rotating schedule so each deal is paired with each starter across schedules. Define set outcome as total game-win shares, splitting ties for set first. Compare set-win shares by physical player for fixed versus rotating starts. Report G separately from single-game win rates. Treat reused deals and overlapping schedules as dependent.

## Outputs and decision

- Report all four turn-position win shares, first minus fourth, and highest minus lowest in percentage points. The primary comparison is the highest-minus-lowest gap among the six mixed lineups pooled with equal weight. Show both pure lineups separately and break down mixed results by AI tier. Split tied first places equally. Also report changes in the ADVANCED minus BEGINNER win-share gap, tied-first frequency, placements and bonus recipients by turn position, and how games ended.
- Compare each treatment with A on matched deals. Give paired 95% bootstrap intervals for differences in the primary gap and skill gap, resampling whole seeds with all their conditions, starters and lineups together. For G resample four-seed blocks. Label any intervals as exploratory. Use uncertainty and rule simplicity to explain which options merit a human playtest. If the observed imbalance follows a physical seat after rotating starts, report that separately from a turn-order effect.
- Deliver a rerunnable experiment script and `docs/game/blind-turn-order-balance-ko.md`. Include commands, baseline revision, seeds, row counts, checks, output location and separate tables for live play, retrospective penalties and four-game sets. Run the project typecheck. Report what actually ran and any remaining limitations. Do not commit, push or adopt a new game rule.
