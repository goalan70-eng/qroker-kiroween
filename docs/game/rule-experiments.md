# Experimental rules: initial hand size and completed-code ending

This is a **simulation-only** feature. It does **not** change the published QRoker rules, normal browser Practice Mode, Scoring Companion, save format, replay format or optical system. The draw rule was subsequently changed on 2026-11-18: every no-code placement draws, including the first. Simulations before that change use the former exemption and must not be compared as if they used the current rule.

The original driver in src/game/sim/play-game.ts remains unchanged. The experimental driver reuses the **same** production reducer, scoring, card layout, turn order, AI strategies and PlayerView privacy boundary.

## Windows PowerShell (from repository root)

Run npm ci first, then compare four cases with the same seed set:

~~~powershell
# Existing rules (baseline): 4 cards, hand-empty only
npm run sim:rules -- --hand 4 --codes none --games 200 --mix mixed

# Candidate: 3 cards, stop after hand empty or 5 codes
npm run sim:rules -- --hand 3 --codes 5 --games 200 --mix mixed

# Isolate the code-limit effect (4 cards)
npm run sim:rules -- --hand 4 --codes 5 --games 200 --mix mixed

# Isolate the hand-size effect (3 cards)
npm run sim:rules -- --hand 3 --codes none --games 200 --mix mixed

# Run four advanced AIs with all board cards visible
npm run sim:rules -- --hand 3 --codes 5 --games 200 --mix advanced --visibility face-up

# Machine-readable JSON report
npm run sim:rules -- --hand 3 --codes 5 --games 200 --mix mixed --json > experiment-3x5.json

# Flags and usage
npm run sim:rules -- --help
~~~

## Parameters

| Flag | Allowed values | Default |
| --- | --- | --- |
| --hand | Starting cards PER seat: integer 1..4 | 4 |
| --codes | Total newly completed eligible codes: integer 1..48, or none | none |
| --games | Number of game seeds: integer 1..5000 | 200 |
| --seed | Starting uint32 seed with room for all requested games | 0 |
| --mix | beginner, advanced, mixed | mixed |
| --visibility | owner-only, face-up | owner-only |
| --json | JSON instead of a text summary | off |

The mixed assignment is P0/P2 ADVANCED and P1/P3 BEGINNER. The EXPERT tier is not yet implemented and is deliberately not offered.

## Semantics

**Hand-size limit:** Production supports at most four cards per starting hand. This experiment supports 1..4 and retains the real HAND_SIZE invariant rather than disabling it. For 3 cards, the 52-card seeded shuffle is re-partitioned as 4 neutral + 4 times 3 dealt cards + 36 in deck. For 4 cards, the original newGame initial state is used unchanged.

**Code limit:** Count newly completed eligible Composite Codes across all seats. Do not count the starting neutral group, number of Guess submissions, or batches. Multiple codes completed by a single placement count individually. A threshold crossed by a 2-code batch stops only after the full batch is scored.

**Score and stopping:** The four players complete their private Guess submissions before any new code is publicly revealed. Code-only stopping occurs at the end of the batch in the REVEAL phase, without awarding the hand-empty bonus. Hand-empty stopping still follows the original reducer and applies the bonus once. When both stop conditions are reached on the same batch, report BOTH and apply the hand-empty bonus exactly once.

**Critical replay note:** The snapshot at a code-only stop is deliberately a core REVEAL state, not ENDED; the experimental ranking is computed from public scores at that boundary. This snapshot cannot be treated as an ordinary published game-end save or standard replay. For 3-card games, the normal replay function does not reconstruct the experimental initial deal. The experiment is reproduced instead by running the same seed, options and AI strategies again.

## Verification

~~~powershell
npx vitest --run src/game/sim/experimental-game.test.ts scripts/compare-rules.test.ts --maxWorkers=2
npm run typecheck
npm run typecheck:game
npm run test:game -- --maxWorkers=2
~~~

Tests include:
- Byte-for-byte standard 4-card baseline parity of final state and Action log against playGame.
- Correct 52-card conservation, no duplicated cards, and seeded re-dealing for hand sizes 1..4.
- Correct Guess-complete boundary for code-only stopping; no invented bonus.
- No extra bonus for stopping without an emptied hand.
- Score accounting, rank calculation, deterministic repetition and invalid-parameter checks.

The report includes mean placements, codes, batches, actions, points and rank-one rates, plus stop-reason frequencies. Rank-one rates count shared wins for each tied player.

## Limits and provenance

These are AI-only self-play results; they are not human balance studies or predictions of game duration in minutes. Changing the hand size changes the deterministic shuffled partition for that seed, so seed pairing is not an identical-hand control.

This tool is based on the Codex PR #13 scoring branch, with the owner-selected provisional table 10/5/4/3/2/1 and hand-empty bonus 5. Results created from old 6/4/3/2/1 and bonus 3 must not be compared without labelling the different tables.

This utility was authored by ChatGPT using the connected GitHub integration, not Kiro or Codex. Proposed new game rules require separate user approval and production updates.
