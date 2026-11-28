# Kiro Crew task specification for the QRoker optical module (Phase 2)

This is the execution specification for Kiro Crew's implementation of the optical module. Implement and verify the approved documents without redefining their design or requirements.

## 1. Objective and scope

- **Objective** — Implement a standalone optical module in `src/optical/` that identifies all 52 cards from images and correctly sums four cards. Verify every stage with automated tests.
- **In scope** — Generate and freeze the codebook, verify all eight transforms, generate suit-specific fragments, read images, identify and sum four cards, apply rejection rules, measure robustness on synthetic images, and document preparations for physical camera tests.
- **Out of scope (do not implement)** — Game engine, board, deck, draws, AI, simulator, scoring values, browser UI, PWA, and Scoring Companion app. Do not create directories for them.

## 2. Input documents (read-only)

Read these documents at the start of the task and leave them unchanged thereafter.

| File | Purpose |
|---|---|
| `.kiro/specs/qroker-game/tasks.md` | Task list. Only checkbox states may be updated. |
| `.kiro/specs/qroker-game/design.md` | Optical design reference, especially “Optical Marker System” sections 1–8 and Properties 12–15 and 20–26. |
| `.kiro/specs/qroker-game/requirements.md` | Requirements 5, 12, 13, and 14. |
| `docs/open-decisions.md` | Open decisions that do not block this task. |

If documents contradict one another or contain a design error, leave them intact. Record the issue and supporting evidence in `docs/optical/results/findings.md`, stop at that point, and await human review.

## 3. Execution

- **One** Task Runner executes the tasks in `tasks.md` **in sequence**. Do not use parallel agents or parallel tasks.
- Milestones depend on one another in sequence. Record the preceding milestone's test results before starting the next.
- **Start with the codebook generator.** Move straight from milestone 0 (scaffolding) to milestone 1.
- Recommended review points are **after milestone 2** and **after milestone 6**. The codebook is the only artifact that cannot change after printing, so a human reviews it after milestone 2. The Task Runner leaves an interim report at each review point.

## 4. Branch and change rules

- Make all changes on the work branch designated by Crew.
- Do not merge automatically, push automatically, or publish a package (`npm publish`). Commit only on the work branch. A human reviews before merging.
- Do not edit `main` directly, force-push, rewrite history, or delete branches.
- Changes are permitted only in `src/optical/`, `scripts/`, `docs/optical/`, and the root `package.json`, `tsconfig.json`, Vitest configuration, and `.gitignore`.
- Limit dependencies to `typescript`, `vitest`, `fast-check`, and a script runner if needed. Do not add runtime dependencies.

## 5. Milestone execution loop

For each milestone, perform these steps in order.

1. Implement the corresponding subtasks in `tasks.md`.
2. Write tests. Include the design Property number in the test name or a comment.
3. Run `npm test` and any milestone-specific scripts.
4. Save **actual output** in `docs/optical/results/` (`mN-*.txt`, plus `.json` and a short `.md` report as needed).
5. Record failures according to section 6. Mark a checkbox complete only after confirming a pass.
6. Commit and proceed only after everything passes. Include the milestone number in the commit message.

## 6. Handling and recording failures

- Record failing tests, error messages, failing seeds, and conditions **verbatim** in the results file.
- Do not loosen thresholds, tolerances, or expected values to turn a failure into a pass.
- Fix implementation defects, rerun the checks, and record both the failure and the fix.
- For a design defect or discrepancy with a reference value, leave it unresolved, document it in `findings.md`, and stop.
- If milestone 7 produces any misidentifications, mark it “failed, investigation required” and retain the failing seeds and conditions.

## 7. Prohibitions

- Never report a pass without running the test.
- Do not present synthetic image results as physical camera results. Every robustness report must state “synthetic images, not real cameras”.
- Do not substitute an expected value or board state for a failed read. The reader function takes no board-state parameter.
- When reflection cannot be determined, report `AMBIGUOUS` without guessing.
- The codebook verifier must not import the generator or its transform implementation. The verification logic must derive the eight cell mappings independently.
- Exclude jokers from all code, tests, and data. There are exactly 52 cards.
- Do not choose scoring values or put them in code.
- Do not reuse previous implementation code or external marker libraries.

## 8. Cross-check reference values

These values came from enumerating all 2²⁵ patterns during design review. The milestone 1 `verify-bound` script must **recompute them independently**. Record any discrepancy and stop.

| Item | Reference value |
|---|---|
| Rejected for imbalance (black cell count outside 9–16) | 3,615,562 |
| Rejected for self-distance (distance < 5 under any nonidentity D4 transform) | 7,152,896 |
| Self-distance rejections by transform | R90 74,624 · R270 74,624 · R180 647,168 · Fh/Fv/Dm/Da 1,835,008 each |
| Rejected by either filter | 9,456,896 |
| Passing both filters \|F\| | 24,097,536 |
| V(25,4) | 15,276 |
| Lower bound on code size ⌈\|F\| / (8·V)⌉ | 198 (at least 52) |
| Observed layouts × image transforms | 81 × 8 = 648 |
| Reflection distinguishable / ambiguous | 520 / 128 (ambiguous groups contain only ♣ and ♠) |
| Passing hypotheses | 2 for groups containing ♥ or ♦, 4 for groups containing only ♣ and ♠ |

A temporary script produced these values before this document was written. They remain unreproduced until confirmed by tests in the repository.

## 9. Open decisions that do not block this work

These decisions are tracked in `docs/open-decisions.md`. Proceed without waiting for them because they do not affect the optical prototype.

- Which side of the card carries the optical fragments
- How card identities stay hidden until prediction
- Whether the four random starting cards must form a valid Composite Code
- How the UI handles reflection ambiguity in groups containing only ♣ and ♠
- Conflicts between standard face indices and marker placement

## 10. Definition of done

The task is complete when all of the following hold.

1. Milestones 0–8 are marked complete in `tasks.md`, and actual test output for each milestone is in `docs/optical/results/`.
2. `npm test` passes on the work branch. Any items that do not pass are recorded with their causes in `findings.md`.
3. `codebook.v1.json` is frozen, regeneration matches it byte for byte, and its SHA-256 is recorded.
4. The robustness report gives identification rates, rejection rates, and misidentification counts per condition. Either the misidentification count is zero or the failure is accurately documented.
5. The report explicitly states that no physical camera results are available.
6. Changes exist only on the work branch and have not been merged or published.

## 11. First unit of work

**Milestones 0 + 1** cover project scaffolding, the deterministic 52-card codebook generator, freezing the codebook, and a script that reproduces the bound calculations.

Completion criteria are as follows.
- `npm test` runs and its results are saved in `docs/optical/results/m0-*` and `m1-*`.
- The 52 patterns are unique, and two generation runs with the same seed produce identical bytes.
- The values in `bound.json` match the section 8 references, or the discrepancy is recorded.
