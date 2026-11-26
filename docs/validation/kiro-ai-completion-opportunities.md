# QRoker AI completion opportunities: paired 6×6 and 8×8 experiment

Determine whether low code counts reflect few opportunities, imperfect information, or the placement policy passing up a winning move for the current turn. Report in Korean. Here, “completion” means an eligible newly formed composite code. A correct guess or positive score is a different outcome.

## Cohorts and evidence

- Use the 6×6 full-board-ending variant and the released 8×8 baseline from `scripts/board-full-ending-experiment.ts`. Compare `OWNER_ONLY` and `BLIND`, seeds 1–100, four seats of the same tier. Use the same initial deals, seat schedule, rules and seeded tie breakers as the previous run.
- For BEGINNER and ADVANCED, first replay the eight matching JSONL files under `D:/DevCaches/tmp/qroker-board-full/raw/`. Each game stores its accepted actions. Load geometry, enumeration and detection from that game's own variant. Reconcile the action choices, final scores, placement count and code count against each saved game. Investigate mismatches before pooling data. The previous driver's `run` replaces its outputs; use a separate experiment directory.
- Add four all-INTERMEDIATE cohorts (400 new games) using the previously requested experimental policy. Reuse it if available. Otherwise implement it only for the experiment: prefer actions with a directly verifiable completion, then actions with a plausible last-cell completion, then any legal action. Choose seeded ties uniformly within the selected class. Guess visible values plus 7 per hidden member. Verify deterministic choices and invariance under hidden-identity swaps that preserve the view. Keep shipped strategies, UI, rules and existing evidence intact.

## Measure every placement, before advancing the game

1. Capture the acting player's pre-action view, decision seed and selected action. Enumerate all legal (card, position, orientation) candidates from that view using the variant's `enumeratePlacements`. Record which tier made the choice. Never pass the full state or diagnostic results into a strategy.
2. **Actual opportunity:** on a separate copy of the true pre-action board, evaluate each legal candidate with the variant's real placement and composite-code detection, honoring already-scored groups. Record the number of completing candidates, the maximum number of new codes from one move, and the number formed by the chosen move. A turn with many winning candidates still counts as one opportunity.
3. **Directly verifiable opportunity:** from the player's view alone, a candidate fills the fourth cell, its card fits its slot and orientation, and the three existing cards are all visible and valid for their slots. **Plausible but uncertain:** at least one existing member is hidden, all four cells would be occupied, the played card is valid and no visible member rules the code out. Classify candidates as certain first, then uncertain, then neither. For a candidate touching multiple quads, keep the quad keys, so a lucky completion in a different quad cannot be credited as conversion of the claimed one. These are operational definitions of direct visibility, not a model of human memory or of reading the printed back marks.
4. Compute and show raw numerators and denominators, separately for every board, mode and tier:

   | Measure | Numerator / denominator |
   | --- | --- |
   | Opportunity frequency | Turns with an actual completing move / all placement turns |
   | Actual opportunity capture | Turns whose chosen move completed a code / turns with an actual completing move |
   | Visible opportunity capture | Turns choosing a directly verifiable completion / turns offering one |
   | Attempt rate under uncertainty | Turns choosing a plausible attempt / turns offering one with no certain choice available |
   | Conversion of those attempts | Attempts completing at least one of their plausible target quads / those attempts |
   | Random-choice baseline on the same positions | On actual-opportunity turns, average the fraction of legal candidates that complete a code; weight each turn once |

   For the attempt-rate numerator apply the same “no certain choice available” restriction as its denominator. A zero denominator is N/A. Count a two-code placement once for capture and twice for total codes. Report missed actual opportunities separately for turns with and without a directly verifiable move. Compare each policy's capture with the random-choice baseline on its own positions. Different policies can create different opportunities.

## Checks and report

- Smoke-test seeds 1 and 2 before the full run. Include a known visible completion, a plausible attempt that fails, a hidden actual completion, a turn without an opportunity and a two-code move. Check that visible guarantees always succeed, Blind has no directly visible guarantees under the current view, and the chosen move's detected count matches the actual engine transition. The game-level sum must equal the saved code count.
- Summarize codes per game, games without a code, and first-code placement for games with a code. Report paired board/mode comparisons by seed; if providing intervals, resample games by paired seed, not individual turns. Include one missed or uncertain Blind turn and one Normal example with the visible information, chosen move and post-hoc truth labeled separately.
- Deliver a reproducible script, a Korean report and the raw-output location. Explain separately whether Blind changed the availability of real opportunities and whether ADVANCED converted fewer opportunities when present. Treat BEGINNER as a random baseline. Attribute results to the tested AI; the experiment does not measure how humans use the board. No commit or push.
