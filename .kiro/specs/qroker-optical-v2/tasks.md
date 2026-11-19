# Implementation Plan: QRoker Optical V2 (Composite Code V2)

> PLANNING DRAFT: no task has been started. No task may start without the explicit written authorization of the project owner naming that task or milestone (Requirement 19.3). The order V2-M1 to V2-M8 and the go/no-go gates of design.md apply (Requirements 19.1 to 19.4 and 19.13 to 19.15).

## Overview

This plan turns `design.md` and `requirements.md` of this spec into eight milestone tasks, V2-M1 to V2-M8. Each milestone ends in a Gate sub-task that records a go/no-go decision and stops for owner authorization. Every task is unchecked and describes FUTURE work. No V2 code, script, asset, measurement or print exists, and no task text states a result.

Independence from the game branch: these tasks use no scoring value, no draw rule and no game source (Requirements 19.10 and 20.7). The planning files are untracked in a working tree on branch `codex/issue-9-score-table`, which contains the unmerged PR #13 scoring (state recorded in `design.md` on 2026-11-19). Committing them on that branch would tie planning to an unmerged scoring change. That is an owner action and has not been performed.

Geometric feasibility comes first. Hypothesis HYP-1 (the Shared_Layer must be 180-degree point symmetric, and the hand-derived table of 16 Placement_Classes) is UNVERIFIED. It is settled by an independent computation in V2-M2. **No milestone after V2-M2 is planned in detail before Gate 2.** The sub-tasks of V2-M3 to V2-M8 are provisional outlines that must be re-confirmed against the Gate 2 Result_Record. If Gate 2 records NO-GO for square appearance, V2-M3 to V2-M8 are void and V1 stays as pinned (Requirement 2.9).

Conventions of this file:

- All file names, module paths, script names and result names are proposals taken from the "Deliverables per milestone" table of `design.md`. Names marked "(additional proposal)" are not in that table.
- Each task lists: what it produces, `Depends on:`, the evidence class (EC 1 to 4, see below), `Acceptance:`, `Tests:` or verification method, `Owner decisions needed:`, `Risks:` (RK ids of `design.md`) and `_Requirements:_`.
- Evidence classes (`design.md`, "Verification and Evidence Plan"): EC 1 model or geometry computation (also repository or document inspection, assumption A-1); EC 2 synthetic raster in Node; EC 3 headless browser; EC 4 real print and real phone.
- Property tests of `design.md` (Properties 1 to 12) are folded into the implementing sub-tasks under `Tests:`. This keeps each milestone at 3 to 7 sub-tasks, as the owner asked, instead of one stand-alone sub-task per property.
- Test sub-tasks are not marked optional. Only the sub-tasks that the requirements call optional carry the marker `- [ ]*`: the indistinguishability test (Requirement 15, task 7.6), the whole V2-M8 milestone (Requirement 17, tasks 8.1 to 8.7) and the FRAME_ONLY arm (Requirement 12.6, task 5.4). The top-level task 8 carries no `*` because the task format allows `*` on sub-tasks only.
- Numeric thresholds are not invented here. Where the requirements mark a value `proposed, pending owner approval (O-4)`, this file keeps that mark.
- In the `Owner decisions needed:` lines, an `O-n` id and an open point of class A need a decision of the owner. An open point of class B (Appendix E of `requirements.md`) is decided by Kiro in the named future step, recorded in the named artifact and reported to the owner, and it is not an owner question. A class C point is deferred. See "Open points by class" below.

## Execution rules

1. Every task is created unchecked (Requirement 19.5). A checkbox is changed only when a Result_Record that names that task and carries an Evidence_Class exists (19.6, 18.1).
2. No completion claim without evidence produced independently of the artifact under test (18.6). The producer (Kiro, Codex, ChatGPT, human) is recorded in the Result_Record and is never inferred from a checkbox or a CI pass (18.3, 18.4, 18.10).
3. Synthetic results are never real-camera or real-print results (20.6). Results of different evidence classes are never merged into one rate, count or claim (18.2).
4. V1 code, V1 tests, V1 reports and the frozen codebook `src/optical/codebook.v1.json` are never edited (1.3, 1.4, 6.10). The expected SHA256 is `515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4`, compared without regard to letter case, and it is recomputed at every Gate (1.3).
5. No V2 task changes the game rules, the scoring values, the draw rule, the AI, the V1 Fragment_Layout or the frozen codebook (20.7). V2 documents contain no scoring value and no draw-rule statement (19.10).
6. The steering and hooks of PR #17 are not used as a source, precondition or rule in any V2 document, task or Result_Record (19.8).
7. Repository automation does not commit V2 results or artwork unless the owner has confirmed that specific commit (19.9).
8. Milestones run in the order V2-M1 to V2-M8 except for a return or skip drawn in the gate diagram (19.1). A milestone does not start without a Gate decision record that permits continuing (19.2) and a dated written owner statement that names the milestone (19.3). After a no-go the route taken is recorded and no other milestone starts (19.4). At Gate 7 the route is the one named by the Failure_Attribution_Record (16.16). A Gate record names the milestone and exactly one decision value (19.11). The V2-M2 entry condition is three dated records: the O-1 decision, the O-2 decision and the Gate 1 `go` (1.2). If the O-2 record says "finish V1 first", V2-M2 also waits for a Result_Record of each V1 task that the record names, or for a dated changed O-2 decision (1.12).
9. Every result is labelled with exactly one evidence class and carries the command, commit, environment, seed, sample identifiers and producer (18.1, 18.3). Failed and unrun items are listed by identifier, apart from passed items (18.5). Re-running an EC 2 command with the same commit, seed and environment must reproduce the recorded counts (18.9). A difference is recorded as a failed item (18.12).
10. Every failure, with its seed and input, is preserved and none is discarded (14.4, 16.4). Zero observed events in n trials are reported with n, the one-sided 95% upper bound 1 - 0.05^(1/n) and the independence argument, never as a guarantee (8.12, 9.8, 14.5).
11. A blocking Open_Owner_Decision is added to the register with the decision id, the blocked milestone, and the class and needed-by gate of Appendix E, and no work proceeds on an assumption (20.1, 20.2). Class B open points are decided in the named artifact and listed in the Result_Record of the milestone's Gate sub-task, so that the owner is informed. Risk events and mitigations are recorded in the same register (20.9). Contradictions between sources are listed with both quotes and are not marked resolved without a recorded resolver (20.3).
12. Statements are labelled owner goal, approved V1 specification, PR #18 proposal or AI-derived hypothesis (18.7). Items without a supporting Result_Record are described as planned or proposed (18.8). HYP-1 and the 16-class table carry the label "hypothesis, unverified" at every citation until Requirement 2 is executed (2.6, 5.14).
13. The V1 Task 7.2 sweep and V1 Milestone 8 are stated as "unevaluated". Comparisons with V1 carry the text "unevaluated V1 baseline (synthetic)" (1.5, 1.6).
14. The spec phase changes specification documents only (20.8). Existing approved specs, steering files, hooks and task histories stay unchanged (19.7).
15. Revalidation after a return (19.13). When a route returns to an earlier milestone (Gate 3 to V2-M2, Gate 4 to V2-M3, Gate 6 to V2-M4, Gate 7 as the Failure_Attribution_Record names, Gate 8 when a V2 artifact changed), every later Gate decision that depends on a changed artifact (format, geometry parameters, decoration, decision policy) is superseded and is re-passed with new Result_Records. The superseded Result_Records are kept, marked superseded and never deleted. The failed frames and trials of earlier rounds stay in the record. The V1 regression gates of 1.7 are re-run at every re-entered Gate. Physical captures taken after a change are new independent captures. Each re-entry needs an explicit owner authorization that names the milestone (19.3).

## Prerequisites (owner decisions and facts, NOT tasks)

These are decisions and facts the owner must supply. They are not tasks and have no checkbox. "Blocks" names the planned tasks that cannot be completed without the entry. The list follows Appendix E.4 of `requirements.md`. Its priorities, needed-by gates and recommended defaults are proposals of the final consistency review, not owner decisions, and the owner may veto each. The open points `OP-<requirement>.<n>` are listed in Appendix D and classified in Appendix E of `requirements.md`. They are questions, not decisions. No decision is assumed by this plan.

Before ANY implementation only O-1 and O-2 need to be decided, plus the written owner authorization of each milestone (Requirement 19.3), which is a process rule and not an O-decision. Every other entry is needed later, at the gate named in its row.

### Prioritized owner decisions (Appendix E.4)

| Priority | ID | Decision needed (short) | Needed by | Blocks (task ids) | Criterion that records it | Recommended default (proposal, owner may veto) |
|---|---|---|---|---|---|---|
| P0 | O-1 | Which V1 baseline: `main` or the PR #14 stack | Gate 1 | 1.1, 1.7, and every V2-M2 task (2.1 to 2.7) through the V2-M2 entry condition | 1.2 (a dated record is one of the three records V2-M2 needs) | Pin `main`, unless the owner wants the PR #14 detector as the baseline |
| P0 | O-2 | Finish V1 Task 7.2 and Milestone 8 first, or run V2 in parallel against an unevaluated baseline | Gate 1 | 1.1 (record), 1.7 (Gate 1), and every V2-M2 task (2.1 to 2.7) through the V2-M2 entry condition. If the record says "finish V1 first", the named V1 Result_Records must exist before V2-M2 starts | 1.2, 1.10, 1.12 | Run V2 in parallel, labelled "unevaluated V1 baseline (synthetic)" (1.6) |
| P1 | O-3 | Is a point-symmetric redesign or a frame-only decoration acceptable if the supplied artwork fails | Gate 2, only if the outcome needs a redesign | 2.6 (when the outcome is GO-WITH-REDESIGN), the start of V2-M3 after that outcome, 5.2, 5.4 | 2.11 | If the artwork fails, continue with Decoration_Mode OFF (NO-GO for decoration) and make no redesign |
| P1 | O-8 | Is S constrained by print layout, and may it share card area with the front-face index (C11). The numeric S is a class B result of the V2-M2 study | Gate 2 | 2.5, 3.1 (start of V2-M3) | 3.6 | Do not share card area unless the V2-M2 study shows a conflict that sharing would solve |
| P1 | OP-5.5 (design conflict C4) | Who decides whether decoration is in the mirrored optical layer or face-local | Gate 2, before V2-M3 | 2.6, 3.1, 3.3, 3.5 | 5.5 | Follow the design proposal: decoration is part of the mirrored optical layer |
| P2 | O-6 (with OP-8.6, OP-8.7) | May INCOMPLETE_GROUP carry a geometric hint, and which one | Before the V2-M4 API freeze | 4.4, 4.5 | 8.11, 8.14 | No hint (8.14) |
| P3 | O-5 (with OP-12.5) | Rights and publication status of the supplied artwork and of derived traces | Before any artwork or trace is stored or published, and before V2-M5 starts | 1.5, 2.4, 5.1, 5.3, and the start of V2-M5 | 12.8, 12.10 | Keep the original and any trace private and untracked |
| P4 | O-4 (with OP-16.1, OP-16.5) | Approve, change or reject the PR #18 thresholds (95% correct in 100 independent shots per normal condition, zero observed wrong card acceptance, 5 seconds end to end), all `proposed, pending owner approval (O-4)`. Includes the meaning of "normal condition" and "end to end" and the sample sizes | Before the first real capture (V2-M7) | 7.1, 7.5, 7.6, 7.7, 8.6 | 15.3, 16.1, 16.2, 16.16, 17.14 | Keep the PR #18 values `proposed, pending owner approval (O-4)` and report raw counts as `unevaluated, threshold not approved` |
| Deferred | O-9 | Retirement or coexistence rule for V1 and V2 decks | Gate 7, before V2-M8 | none before V2-M8. Task 3.1 records "not yet decided" | 6.4 | Record "not yet decided" in the compatibility policy (6.4) |
| Deferred | Approval of V2-M8 itself (OP-6.7, OP-17.1) | Gate 7 | 8.1 and every V2-M8 task | 17.1, 19.14 | No approval until the owner states one. V2 then ends at Gate 7 as `validated for print, integration not approved` |
| Closed by default | O-7 | Wording "inside the assembled marker" or "inside the recognition mark". Confirmation may be recorded at Gate 2 | Non-blocking | none (1.5 and 2.6 record the default or the confirmation) | 12.11 | The owner's wording is adopted and the PR #18 wording is superseded |

## Open points by class

Source: Appendix E of `requirements.md`, an AI-derived classification that the owner may change. The 140 rows are not copied here. CLASS A needs an owner decision before the named gate (the A items are the rows of the table above). CLASS B is decided by Kiro in the named step, recorded in the named artifact (Pre-registration, format specification, design addendum, protocol or Result_Record) and reported to the owner in the Gate record (execution rule 11). A class B record never changes an owner goal, a release threshold, rights, scope or an approved requirement, and a value that a requirement keeps as `proposed, pending owner approval` keeps that label. CLASS C is deferred, optional or non-blocking and is not decided in the milestone unless an earlier gate outcome makes it arise.

| Milestone (tasks) | CLASS A, to decide before it | CLASS B, resolved by its tasks, recorded in | CLASS C, deferred |
|---|---|---|---|
| V2-M1 (1.1 to 1.7) | none beyond O-1 and O-2 | OP-18.2 to OP-18.4, OP-19.2. Recorded in the provenance record (1.5, 1.6) and the decision record (1.1) | OP-1.1 to OP-1.3, OP-5.7, OP-6.9, OP-18.1, OP-18.5 to OP-18.7, OP-19.3 to OP-19.5, OP-20.1 to OP-20.4 |
| V2-M2 (2.1 to 2.7) | OP-5.5, together with O-3 and O-8 | OP-2.1 to OP-2.6, OP-3.1 to OP-3.8, OP-4.1 to OP-4.6, OP-7.2, OP-7.3, OP-12.1, OP-12.4. Recorded in the Pre-registration (2.1) and the V2-M2 Result_Records (2.2 to 2.7) | OP-2.7, OP-12.3 |
| V2-M3 (3.1 to 3.7) | none | OP-4.7, OP-4.8, OP-5.1 to OP-5.4, OP-5.6, OP-6.1 to OP-6.4, OP-6.8, OP-7.1, OP-7.5 to OP-7.7. Recorded in the format specification and compatibility policy (3.1), the module layout (3.2), the design addendum (3.3) and the test plan (3.5) | OP-6.6 |
| V2-M4 (4.1 to 4.7) | O-6 with OP-8.6 and OP-8.7, before the API freeze | OP-8.1 to OP-8.4, OP-8.9 to OP-8.11, OP-9.2 to OP-9.7, OP-9.10, OP-10.1, OP-10.4 to OP-10.7, OP-11.2 to OP-11.8. Recorded in the Pre-registration (4.1), the harness and result schema (4.2, 4.4) and the V2-M4 design addendum (4.4, 4.6) | OP-8.5, OP-8.8, OP-9.1, OP-9.8, OP-9.9, OP-10.2, OP-10.3, OP-11.1 |
| V2-M5 (5.1 to 5.6) | O-5 with OP-12.5, before any artwork or trace is stored and before V2-M5 starts | OP-13.1 to OP-13.5. Recorded in the Pre-registration (5.2) | none |
| V2-M6 (6.1 to 6.6) | none | OP-14.1, OP-14.2, OP-14.4. Recorded in the Pre-registration (6.1, 6.2) | OP-14.3, OP-14.6 |
| V2-M7 (7.1 to 7.7) | O-4 with OP-16.1 and OP-16.5, before the first capture | OP-16.2 to OP-16.4, OP-16.6, OP-16.7. Recorded in the Pre-registration (7.1) and the physical protocol (7.2) | OP-15.1 to OP-15.5 (the optional test, 7.6) |
| V2-M8 (8.1 to 8.7, optional) | the V2-M8 approval and O-9, at Gate 7 | none | OP-6.5, OP-6.7, OP-10.8, OP-17.1 to OP-17.3, OP-17.5 to OP-17.8 |

Closed by the final consistency review, no action: OP-7.4, OP-12.2, OP-13.6, OP-14.5, OP-17.4, OP-19.1, OP-19.6. The classes add up to the counts of Appendix E.3: A 6, B 83, C 44, closed 7, total 140.

## Technical prerequisites per milestone

- V2-M1: read-only access to the repository history with the owner's authorized access, for the pin record and for the PR check (1.8); the V1 test command, runtime, package manager and test runner of the pinned baseline; a way to compute a SHA256 and a file-level difference without modifying any file.
- V2-M2: the V2-M2 entry condition (the Gate 1 `go`, the O-1 decision and the O-2 decision each recorded with a date, and, if the O-2 record says "finish V1 first", the Result_Records of the V1 tasks it names; 1.2, 1.12); the V1 Fragment_Layout and Inward_Corner tables as written in V1 sources, for independent transcription; the supplied Joker SVG and the owner's original picture for the symmetry test (read-only use); a computation environment that shares no source with the planned generator, renderer or any V1 module.
- V2-M3: Gate 2 outcome in a Result_Record; the C4 decision record; S, quiet zone and tolerance from the V2-M2 record; read-only use of the frozen V1 patterns; the Vitest include settings checked for a `src/optical-v2/tests/` folder.
- V2-M4: Gate 3 passed; the pinned Baseline_V1 callable from the Comparison_Harness only; an Oracle that shares no code with the candidates.
- V2-M5: Gate 4 with decoration still possible; O-5 permission before any artwork or trace is committed; the minimum feature size from V2-M2. Skipped when Gate 2 recorded NO-GO for decoration.
- V2-M6: Gate 5 decided (or Gate 4 passed with V2-M5 skipped); the Gate 5 record that names the Decoration_Modes to run (14.13); the pinned Baseline_V1 arm runnable on the same sample identifiers and seeds as the V2 arms.
- V2-M7: Gate 6 passed (or, after a Gate 7 no-go, the route of the Failure_Attribution_Record and a new owner authorization, 19.13); owner-approved thresholds; printed cards, a cutting method, paper stock, phones and lighting as the protocol requires; a caliper or ruler for registration and radius measurements.
- V2-M8 (optional): a Gate 7 `go` and a separate owner approval and boundary-change decision (without the approval, V2 ends at Gate 7, 19.14); a browser bundle path that loads pattern data without `node:fs`; a headless browser environment (not chosen here); a real phone.

## Tasks

- [ ] 1. V2-M1: Audit existing V1 and establish a technical baseline (PR #18 M0)
  - PLANNED, NOT STARTED. Starts only after explicit owner authorization naming V2-M1 (19.3). There is no earlier Gate.
  - Produces (proposals): `docs/optical-v2/baseline.md`, `docs/optical-v2/provenance.md`, `docs/optical-v2/results/m1-baseline.*`, a V1-preservation gate script under `scripts/optical-v2/`. No new implementation.
  - Depends on: owner authorization of V2-M1.
  - Evidence: EC 1 for pin, PR, hash, diff and document checks. EC 2 for the V1 test-command run.
  - Acceptance: Gate 1 decision is recorded as go or no-go (19.11). It rests on the pin, the codebook SHA256 record, the V1 test status with the unevaluated items, the artwork rights status, and the owner decisions O-1 and O-2, each recorded with a date. V2-M2 needs three dated records: O-1, O-2 and the Gate 1 `go` (1.2). If the O-2 record says "finish V1 first", the V1 results it names must exist as Result_Records before V2-M2 starts, or the owner records a changed O-2 decision with its date (1.12).
  - Owner decisions needed: O-1, O-2, O-5, O-7 (default or confirmation only).
  - Risks: RK-10, RK-11, RK-14.
  - _Requirements: 1.1 to 1.12, 12.7, 12.8, 12.10, 18.7, 19.2, 19.11_

  - [ ] 1.1 Record the Baseline_V1 pin and the O-1 and O-2 decisions
    - Produces: `docs/optical-v2/baseline.md` (proposal) with one pin record: baseline name (`main` or the PR #14 stack), the full-length commit ID of every branch of the stack (one ID for `main`), and the versions of the runtime, the package manager and the test runner. Also the dated O-1 decision record and the O-2 decision record with the chosen option, dates as YYYY-MM-DD. Decision records may live in `docs/optical-v2/decisions.md` (additional proposal; location is open, OP-19.2).
    - Depends on: owner authorization of V2-M1.
    - Evidence: EC 1.
    - Acceptance: all four pin fields are present and every recorded commit ID resolves to a commit in the repository (1.1). If O-1 or O-2 has no dated owner decision, the missing item is recorded as blocking and V2-M2 does not start (1.2). The O-2 option and its date are in one decision record (1.10). If the O-2 option is "finish V1 first", the record names each V1 task whose Result_Record must exist before V2-M2 starts (1.12).
    - Tests: read-only resolution of each commit ID. A check that no V2-M2 Result_Record or work product carries a date earlier than the latest of the O-1 record, the O-2 record and the Gate 1 `go` (1.2).
    - Owner decisions needed: O-1, O-2.
    - Risks: RK-10, RK-11.
    - _Requirements: 1.1, 1.2, 1.10, 1.12, 20.1_

  - [ ] 1.2 Check the state of each listed PR by direct repository access
    - Produces: `docs/optical-v2/results/m1-pr-state.*` (additional proposal) with the observed state of PR #12, #13, #14, #15, #17, #18, #21 and #22 (#16 is an issue, not a PR; that statement comes from the owner's instruction and is not in `design.md`). For each PR whose state differs from the 2026-11-19 state, the PR number, old state and new state.
    - Depends on: owner-authorized repository access.
    - Evidence: EC 1.
    - Acceptance: states are read directly and not inferred from other documents (1.8). The 2026-11-19 states stay labelled "inferred from refs/pull/N/merge refs and commit history, not read from the GitHub API (repository is private)". If direct access is unavailable, the check is recorded as "not performed" with the attempt date, the old states stay "inferred, unverified", and the check is not reported as passed (1.11).
    - Tests: none beyond comparing the record with the table of `design.md` for completeness of the eight PR numbers.
    - Owner decisions needed: authorized access. OP-1.2 (state to record for a PR closed without merge).
    - Risks: RK-14.
    - _Requirements: 1.8, 1.11_

  - [ ] 1.3 Record the V1 test status and the unevaluated V1 items
    - Produces: `docs/optical-v2/results/m1-v1-tests.*` (additional proposal), and a V1-status section in `docs/optical-v2/baseline.md` that states V1 Task 7.2 (the 363,000-trial sweep) and V1 Milestone 8 (print and physical) as "unevaluated".
    - Depends on: 1.1.
    - Evidence: EC 2 for the V1 test-command run on the pinned baseline. EC 1 for the document statements.
    - Acceptance: the Result_Record holds the number of tests passed, failed and skipped and the name of every failing test. It names the load-sensitive tests of the pinned baseline or states "load-sensitive tests not determined" (1.7). "unevaluated" stands next to each of the two items, and no V2 document states that the V1 Task 7 pass criterion is met (1.5). Every comparison with V1 carries the text "unevaluated V1 baseline (synthetic)" (1.6).
    - Tests: inspect the V2 documents for the word "unevaluated" and for the absence of a Task 7 pass claim. Failures of the V1 run are recorded and not hidden.
    - Owner decisions needed: OP-1.1 (class C). If O-2 means "finish V1 first", running V1 Task 7.2 and Milestone 8 is outside this plan, and V2-M2 waits for the Result_Records of the V1 tasks that the O-2 record names (1.12).
    - Risks: RK-10, RK-11.
    - _Requirements: 1.5, 1.6, 1.7, 18.5_

  - [ ] 1.4 Plan the V1-preservation gate script (codebook SHA256 and no-diff check)
    - Produces: a proposed script `scripts/optical-v2/check-v1-preservation.*` that computes the SHA256 of `src/optical/codebook.v1.json` at the pin and lists the file-level difference between the pin and an evaluated commit, plus `docs/optical-v2/results/m1-v1-preservation.*`. The script only reads V1 files.
    - Depends on: 1.1.
    - Evidence: EC 1.
    - Acceptance: it records the computed value, the expected value `515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4` and an equal or not-equal outcome, with hexadecimal digits compared without regard to letter case (1.3). It records a difference listing for `src/optical/**`, the V1 test files and the V1 report files, expected empty (1.4). On a mismatch or a non-empty listing it records a failed V1 regression result with the computed value or offending paths and does not record the gates as passed (1.9). The same script is reused at every later Gate.
    - Tests: Property 6 (V1 preservation). A negative control on a temporary copy outside the V1 tree, so that a changed byte yields "not equal" and an added path yields a non-empty listing. No V1 file is edited.
    - Owner decisions needed: OP-6.9 (which V1 result files are in scope), OP-20.4 (whether the pin covers the frozen codebook).
    - Risks: RK-11.
    - _Requirements: 1.3, 1.4, 1.9, 6.10_

  - [ ] 1.5 Record Joker artwork rights and provenance
    - Produces: `docs/optical-v2/provenance.md` (proposal) with the rights status of the supplied picture and of the PR #18 trace, the O-5 decision field, the O-7 wording question, a statement that the SVG is a visual reference only, and the source label of each statement (owner goal, approved V1 specification, PR #18 proposal, AI-derived hypothesis).
    - Depends on: owner authorization of V2-M1.
    - Evidence: EC 1.
    - Acceptance: the rights status and the O-5 decision are recorded before the original artwork or a trace is stored in the repository or published (12.8). With no rights record, or an O-5 decision that is not a permission, nothing is uploaded, committed or published (12.10). The SVG is not used as an operational optical code, a Valid_Input or an Oracle entry (12.7). Statements carry their source label (18.7).
    - Tests: document inspection for the labels and for the absence of committed artwork or trace files before an O-5 permission.
    - Owner decisions needed: O-5, O-7.
    - Risks: RK-2, RK-20.
    - _Requirements: 12.7, 12.8, 12.10, 18.7_

  - [ ] 1.6 Review and record the repository-state facts (inferred versus directly read)
    - Produces: `docs/optical-v2/results/m1-baseline.*` with one table of repository-state facts (branch and commit, PR states, codebook hash, V1 status). Each fact is labelled "directly read on <date>" or "inferred from refs and commit history". The sources and stale statements of `design.md` ("Contradictions and stale statements") are entered in the contradiction list with both quotes.
    - Depends on: 1.2, 1.3, 1.4, 1.5.
    - Evidence: EC 1.
    - Acceptance: each fact carries exactly one of the two labels. Any fact not re-read stays "inferred, unverified" (1.11). Contradiction entries cite both sources and quote the conflicting statements, and none is marked resolved without a recorded resolver and basis (20.3). The reviewer is recorded as producer (18.3). What counts as independent of the artifact under test is open (OP-18.2).
    - Tests: document inspection against the repository-state table of `design.md`.
    - Owner decisions needed: OP-18.2.
    - Risks: RK-13, RK-14, RK-20.
    - _Requirements: 1.8, 1.11, 18.3, 18.5, 18.6, 20.3_

  - [ ] 1.7 Gate 1: Record the Gate 1 decision (Result_Record) and stop for owner authorization before the next milestone
    - Produces: `docs/optical-v2/results/m1-gate.*` (additional proposal), one Result_Record naming V2-M1 and exactly one value, go or no-go.
    - Depends on: 1.1 to 1.6.
    - Evidence: EC 1 for the decision. EC 2 for the V1 test-command record.
    - Acceptance: the record lists each V1 regression gate with its outcome: the SHA256 check, the no-change check under `src/optical/**` and the V1 test command (1.7). The Gate 1 record requires that O-1, O-2 and the Gate 1 `go` are each recorded with a date (diagram of `design.md`, 1.2, 1.10). The `go` edge to V2-M2 holds only if, when the O-2 record says "finish V1 first", the named V1 results are recorded as Result_Records (1.12). A no-go routes to "Stop: resolve baseline first" and starts nothing (19.4). A go does not start V2-M2 until the three dated records exist and a dated owner statement naming V2-M2 exists (1.2, 19.3).
    - Tests: verification by reading the records. The decision is not a manual override of a failed gate (1.9). A check that no V2-M2 Result_Record is dated earlier than the latest of the three dated records (1.2).
    - Owner decisions needed: O-1, O-2, OP-19.2 (class B, recorded in the provenance record).
    - Risks: RK-10, RK-11.
    - _Requirements: 1.2, 1.3, 1.4, 1.7, 1.9, 1.10, 1.12, 19.2, 19.3, 19.4, 19.11_

- [ ] 2. V2-M2: Verify four-piece geometry and Joker symmetry feasibility (PR #18 M1)
  - PLANNED, NOT STARTED. Starts only after the V2-M2 entry condition and explicit owner authorization naming V2-M2. The entry condition is the Gate 1 `go`, the O-1 decision and the O-2 decision, each recorded with a date (1.2), and, if the O-2 record says "finish V1 first", a Result_Record of each V1 task it names (1.12).
  - Geometric feasibility prerequisite: HYP-1 and the hand-derived 16-class table are "hypothesis, unverified". This milestone settles them by an independent computation. NO later milestone is planned in detail before Gate 2.
  - Produces (proposals): `docs/optical-v2/results/m2-geometry-feasibility.*`, the independent enumeration and symmetry-check script under `scripts/optical-v2/`.
  - Depends on: the V2-M2 entry condition: Gate 1 (go), the O-1 decision record and the O-2 decision record, each dated (Requirement 1.2), and the named V1 Result_Records when O-2 is "finish V1 first" (Requirement 1.12).
  - Evidence: EC 1 throughout.
  - Acceptance: exactly one Go_No_Go_Outcome (GO, GO-WITH-REDESIGN, NO-GO for decoration, NO-GO for square appearance) is recorded with the Result_Record ids it came from, and not by manual override (2.8).
  - Owner decisions needed: O-3, O-7, O-8, C4 decision, OP-2.1 to OP-2.4, OP-3.1, OP-3.8, OP-12.1.
  - Risks: RK-1, RK-2, RK-15, RK-16, RK-17, RK-18.
  - _Requirements: 1.2, 1.12, 2.1 to 2.14, 3.1 to 3.8, 4.7, 4.9, 5.5, 12.1, 12.7, 12.11_

  - [ ] 2.1 Pre-register the V2-M2 metric, tolerance, value sets and decision rule
    - Produces: `docs/optical-v2/results/m2-preregistration.*` (additional proposal) with the difference metric, raster resolution, local-deviation window and tolerance (each marked "proposed, pending owner approval" until approved), the Central_Void mask definition, the value set of every parameter (S, quiet zone, Corner_Radius including the 3.175 mm reference and at least one larger value, Central_Void parameterisation, minimum feature size), the rule that maps the report to one of the four outcomes, and the meaning of "confirmed HYP-1".
    - Depends on: the V2-M2 entry condition (Gate 1 `go` and dated O-1 and O-2 records; Requirements 1.2 and 1.12), owner authorization of V2-M2.
    - Evidence: EC 1.
    - Acceptance: the record is dated before any symmetry or comparison run (2.5, 4.9). The value set of every parameter is written before the run (3.1). No number is invented by the planner. Values come from the owner or a later design decision.
    - Tests: ordering check of record dates against the first V2-M2 result.
    - Owner decisions needed: OP-2.1, OP-2.2, OP-2.3, OP-2.4, OP-3.1, OP-3.2, OP-3.3, OP-4.1, OP-4.2, OP-12.1.
    - Risks: RK-1, RK-15, RK-16.
    - _Requirements: 2.5, 2.6, 3.1, 4.9_

  - [ ] 2.2 Enumerate the Placement_Classes independently
    - Produces: an enumeration script under `scripts/optical-v2/` (proposal) and a section in `m2-geometry-feasibility.*`. It enters the V1 Fragment_Layout and Inward_Corner tables independently and derives every (suit, orientation, slot, printed body corner) tuple.
    - Depends on: 2.1, and the V2-M2 entry condition (Requirements 1.2 and 1.12).
    - Evidence: EC 1.
    - Acceptance: the Result_Record holds the table values as entered and the V1 source of each (2.1), and a dependency listing that shows no shared source with the Fragment_Generator, the Square_Renderer or any V1 module (2.2). It records the computed class count, with the hand value 16 only as a cross-check (2.3). It reports, for each of the 8 printed (suit, body corner) Pieces, the classes it serves and a verdict, pass only if it serves exactly two classes in diametrically opposite slots at 0 and 180 degrees (2.4). If the count differs from 16, both values and the differing classes are recorded and the hand table is labelled "refuted" (2.12). Every citation of HYP-1 carries "hypothesis, unverified" (2.6). The Result_Record carries the standard fields (2.13).
    - Tests: unit tests of the enumerator on a small known layout, and a negative control with a deliberately wrong table that must fail the per-Piece verdict.
    - Owner decisions needed: none beyond the Gate 1 prerequisites.
    - Risks: RK-1.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.12, 2.13_

  - [ ] 2.3 Check Shared_Layer symmetry for all Placement_Classes (frame and outline, decoration OFF)
    - Produces: a symmetry-check function in the independent script area and a section of `m2-geometry-feasibility.*`. For 180-degree rotation, left-right mirror and top-bottom mirror it reports the pixel difference, the largest local deviation in modules and its location, the Central_Void mask used, the tolerance and a pass or fail verdict.
    - Depends on: 2.1, 2.2, and the V2-M2 entry condition (Requirements 1.2 and 1.12).
    - Evidence: EC 1. This is the model-level check of the Feasibility_Computation that Requirement 4.7 names as the Gate 2 trigger for "NO-GO for square appearance" (4.7 and 4.9 carry the label EC 1 since the final consistency review).
    - Acceptance: every report field above is present and the tolerance comes from the Pre-registration (2.5, 4.9). If, with Decoration_Mode OFF, the frame-only Shared_Layer of any two Placement_Classes differs by more than the tolerance in this model-level check, the Result_Record states "NO-GO for square appearance" as the cause (4.7). A difference found later by the Square_Renderer is a Gate 3 matter (7.6) and is not recorded here. If the reports of 2.3 to 2.5 are not produced, no outcome is recorded and the failure is recorded (2.14). Results are stored with the standard fields (2.13).
    - Tests: the check is run on known symmetric and known asymmetric rasters (design Testing Strategy). The 180-degree check passes the first and fails the second.
    - Owner decisions needed: OP-2.3, OP-2.4, OP-4.2, OP-4.4.
    - Risks: RK-1, RK-4.
    - _Requirements: 2.5, 2.13, 2.14, 4.7, 4.9_

  - [ ] 2.4 Rasterize the Joker SVG with the Central_Void mask and record the symmetry verdict
    - Produces: a section of `m2-geometry-feasibility.*` with the measures and verdict of 2.3 for the supplied artwork, plus the yes or no record of whether the check against the owner's original picture was done under owner supervision. Derived rasters are not committed before an O-5 permission.
    - Depends on: 2.3, 1.5, and the V2-M2 entry condition (Requirements 1.2 and 1.12).
    - Evidence: EC 1.
    - Acceptance: the artwork is rasterized with the Central_Void mask and the same measures and verdict as in 2.5 are reported for its 180-degree point symmetry (2.7). The SVG is used only as the test subject of this check, not as a Valid_Input or Oracle entry (12.7). Nothing is uploaded or committed without a recorded permission (12.8, 12.10).
    - Tests: the rasterization is run twice with identical settings and the two reports are compared. The artwork result is reported next to the known-symmetric and known-asymmetric control rasters of 2.3.
    - Owner decisions needed: O-5, OP-2.5 (what the check against the original compares).
    - Risks: RK-2, RK-16.
    - _Requirements: 2.7, 2.13, 12.7, 12.8, 12.10_

  - [ ] 2.5 Run the geometry parameter study
    - Produces: the parameter table in `m2-geometry-feasibility.*`, one row per combination. It records: the outcome of criteria 2 to 5 per row; the S upper bound for the 40-module spacing and for the 56-module spacing, the S and quiet-zone pairs with 2S plus quiet zones at most equal to the spacing, and the lower of the two bounds; the Central_Void area from the Corner_Radius; the distance of every data cell, detection-critical frame element and decoration element to the nearest Central_Void point for any position, not only the diagonal point; feature size in modules and in millimetres (modules multiplied by 1.5875 mm) with elements below the minimum flagged; the containment margin to the Printable_Area when the Corner_Radius is above 0.
    - Depends on: 2.1, 2.4, and the V2-M2 entry condition (Requirements 1.2 and 1.12).
    - Evidence: EC 1.
    - Acceptance: planned and recorded row counts are equal (3.8). The V2-M2 Result_Record also contains the Keep_Out_Mask computed for the studied parameters (data cells, detection-critical frame elements and quiet zone), as the recorded reference for the equality check of 7.8 in V2-M3 (12.1). Rows that cannot be evaluated are kept as NOT_EVALUATED (proposed name) with a reason (3.7). An element equal to the minimum feature size is not flagged (3.4). A combination is invalid if any containment margin is 0 or less (3.5). The study does not rely on the V1 diagonal-only formulas (3.3). The C11 conflict and the status of O-8 are recorded as an input, without deciding the card-face design (3.6).
    - Tests: unit tests of the void-area and nearest-void-distance formulas against hand-computed cases, and a cross-check against the unverified V1 reference value for the total void area at r = 3.175 mm stated in `design.md` (8.65 mm^2). A mismatch is recorded, not corrected.
    - Owner decisions needed: O-8, OP-3.1, OP-3.4, OP-3.5, OP-3.6, OP-3.7, OP-3.8, OP-12.1.
    - Risks: RK-15, RK-16, RK-18.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 12.1_

  - [ ] 2.6 Derive and record the single Go_No_Go_Outcome and the dependent decision records
    - Produces: a Result_Record in `m2-geometry-feasibility.*` with exactly one outcome and the ids of the Result_Records behind it. Also the decision records that must exist before V2-M3: the O-3 decision and the note that the supplied artwork was not used as is, when the outcome is GO-WITH-REDESIGN; the written C4 decision naming the chosen alternative and who decided; the O-7 wording decision.
    - Depends on: 2.2, 2.3, 2.4, 2.5, and the V2-M2 entry condition (Requirements 1.2 and 1.12).
    - Evidence: EC 1.
    - Acceptance: one outcome value, not from a manual override (2.8). NO-GO for square appearance (triggered by the model-level check of 4.7): no further milestone starts, V1 stays at the pinned commit IDs, and the causing records are listed (2.9). NO-GO for decoration: no V2-M5 result is produced and V2-M6 and V2-M7 run with Decoration_Mode OFF only (2.10). GO-WITH-REDESIGN: both the "not used as is" record and the dated O-3 decision exist before V2-M3 starts (2.11). The C4 decision exists before V2-M3 starts (5.5). The O-7 default (the owner's wording) or its confirmation is recorded in its register entry (12.11).
    - Tests: verification that the recorded outcome follows the pre-registered decision rule applied to the stored reports.
    - Owner decisions needed: O-3 (only if the outcome needs a redesign), O-7 (non-blocking), C4 (OP-5.5, class A), OP-2.1, OP-2.2, OP-2.6 (class B).
    - Risks: RK-1, RK-2, RK-17.
    - _Requirements: 2.8, 2.9, 2.10, 2.11, 4.7, 5.5, 12.11_

  - [ ] 2.7 Gate 2: Record the Gate 2 decision (Result_Record) and stop for owner authorization before the next milestone
    - Produces: `docs/optical-v2/results/m2-gate.*` (additional proposal), one Result_Record naming V2-M2 and the Go_No_Go_Outcome of 2.6.
    - Depends on: 2.6, and the V2-M2 entry condition (Requirements 1.2 and 1.12).
    - Evidence: EC 1 for the decision. EC 2 for the V1 regression test-command record.
    - Acceptance: GO, GO-WITH-REDESIGN and NO-GO for decoration continue to V2-M3, with V2-M5 skipped for the last (19.2, 2.10). NO-GO for square appearance does not continue and the route "Keep V1, stop V2" is recorded (2.9, 19.4). The V1 regression gates are recorded with their outcomes (1.3, 1.4, 1.7). V2-M3 does not start without a dated owner statement naming V2-M3 (19.3).
    - Tests: verification by reading the records.
    - Owner decisions needed: OP-19.2, plus the decisions of 2.6.
    - Risks: RK-1, RK-2.
    - _Requirements: 1.3, 1.4, 1.7, 2.8, 2.9, 2.10, 19.2, 19.3, 19.4, 19.11_

- [ ] 3. V2-M3: Plan V2 fragment generation and rendering (PR #18 M2)
  - PLANNED, NOT STARTED. Starts only after Gate 2 and explicit owner authorization naming V2-M3.
  - Detail status: provisional outline. It is re-confirmed against the Gate 2 Result_Record (outcome, S, quiet zone, tolerance, C4 decision) before detailed work. Void if Gate 2 is NO-GO for square appearance.
  - Produces (proposals): `docs/optical-v2/format-v2.md`, a module skeleton under `src/optical-v2/` with tests in `src/optical-v2/tests/`, `codebook.v2.*` only if a Result_Record proves a different pattern format is necessary, results under `docs/optical-v2/results/m3-*` (additional proposal).
  - Depends on: Gate 2 (GO, GO-WITH-REDESIGN or NO-GO for decoration).
  - Evidence: EC 1 for documents and inspections. EC 2 for generator and renderer results.
  - Acceptance: Gate 3 criteria of `design.md`: deterministic output, all classes consistent, V1 untouched. A mismatch between Placement_Classes (7.6) or between the renderer's Keep_Out_Mask and the V2-M2 mask (7.8) is a Gate 3 no-go that returns to V2-M2. It is not a retroactive Gate 2 outcome.
  - Owner decisions needed: O-8, O-9 (deferred, "not yet decided" is allowed), C4 (OP-5.5), OP-3.8 and OP-7.6 (class B).
  - Risks: RK-1, RK-3, RK-4, RK-8, RK-16, RK-17.
  - _Requirements: 4.1 to 4.9, 5.1 to 5.14, 6.1 to 6.10, 7.1 to 7.11, 12.1_

  - [ ] 3.1 Write the V2 format specification and the versioning and compatibility policy
    - Produces: `docs/optical-v2/format-v2.md` and a compatibility policy document (additional proposal `docs/optical-v2/compatibility-policy.md`; location open, OP-6.4). The format document holds: the one-continuous-square definition with the Central_Void as the only intentionally empty area; the format version identifier carried by every V2 artifact and every OfficialResult; the quiet-zone rule as a size with a unit around the Assembled_Square and not between Pieces, replacing V1 Requirement 15.5 for V2 only; exactly 52 cards and no Joker card; the unchanged V1 Fragment_Layout and orientations 0 and 180 degrees; one printed raster per card and body corner; the back layer as the Body_Frame left-right mirror of the front optical layer, derived from that front layer only; mirroring of the optical layer only; the identity-reveal statement; the statements that V2 is not an ISO 18004 QR code and not cryptographic secrecy.
    - Depends on: Gate 2, 2.6.
    - Evidence: EC 1.
    - Acceptance: S, quiet zone and tolerance are copied from the Gate 2 record and not newly invented (4.5, 4.9). The compatibility policy states that V1 and V2 cards are different print runs unless a Result_Record shows them equal, and records O-9 as coexistence, retirement or "not yet decided" (6.4). A `codebook.v2.*` file is only planned if a Result_Record proves it necessary, never edits `codebook.v1.json`, and has a versioned name (6.3). The back-layer rule follows the C4 decision (5.6, 5.5).
    - Tests: document inspection for each statement and for the absence of any claim that card identity is secret (5.12, 20.4, 20.5).
    - Owner decisions needed: O-8, O-9 (deferred), C4 (OP-5.5), OP-4.6, OP-5.4, OP-6.2, OP-6.4 (class B), OP-6.5 (class C).
    - Risks: RK-4, RK-19.
    - The format also places the front and back corner sets so that the Body_Frame area they occupy has zero intersection and both faces stay inside the V1 Requirement 15.3 containment condition, as evaluated by the check of 3.5 in V2-M2 (5.10).
    - _Requirements: 4.1, 4.5, 4.9, 5.1, 5.2, 5.3, 5.5, 5.6, 5.10, 5.11, 5.12, 6.2, 6.3, 6.4, 20.4, 20.5_

  - [ ] 3.2 Create the isolated V2 module skeleton and the boundary inspections
    - Produces: `src/optical-v2/` skeleton (proposed name), `src/optical-v2/tests/` (proposal, subject to the Vitest include settings), a results folder outside `docs/optical/results/`, and a boundary test that inspects the import graph in the style of the existing boundary tests of the game spec.
    - Depends on: Gate 2.
    - Evidence: EC 1.
    - Acceptance: `src/optical/` contains no V2 production source file (6.1). V2 production code has no import resolving under `src/game` (6.5) and no import of a V1 runtime module that reads the codebook with `node:fs`. Any V1 import occurs only in the Comparison_Harness (6.7). `src/game` has no import of V2 code while no V2-M8 approval exists (6.6). V2 tests sit inside the V2 module location and no V2 result file exists under `docs/optical/results/` (6.8). Each inspection yields a Result_Record with pass or fail (6.9).
    - Tests: Property 7 (Boundary). A planted violation in a temporary file must make the scan fail (negative control).
    - Owner decisions needed: OP-6.1, OP-6.6, OP-6.8.
    - Risks: RK-4, RK-8.
    - _Requirements: 6.1, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [ ] 3.3 Implement the deterministic Fragment_Generator with Decoration_Mode OFF first
    - Produces: generator modules under `src/optical-v2/` (file names decided in this task). It reads the frozen V1 patterns as read-only data and emits one printed raster per card and body corner for the 52 cards, plus the back layer.
    - Depends on: 3.1, 3.2.
    - Evidence: EC 2.
    - Acceptance: two runs with identical parameters and seed give zero differing modules (7.1). Decoration_Mode OFF has a Result_Record before any Result_Record of another mode (7.3), and another mode is not enabled while the Gate 2 outcome does not allow it (7.10). The back layer of a card is derived only from that card's front layer and stays unchanged when the front layer of any other card is altered (7.7). No raster differs by slot, orientation or neighbouring cards (5.3). Mirroring is applied to the optical layer only (5.11).
    - Tests: Property 8 (Determinism). A test that alters the front layer of another card and compares back layers (7.7).
    - Owner decisions needed: OP-7.1, OP-7.5, OP-7.6, C4 (OP-5.5).
    - Risks: RK-4, RK-17.
    - _Requirements: 5.3, 5.6, 5.11, 7.1, 7.3, 7.7, 7.10_

  - [ ] 3.4 Implement the Square_Renderer with the Central_Void mask and the Keep_Out_Mask
    - Produces: renderer modules under `src/optical-v2/` that render an Assembled_Square raster with decoration OFF first, the Central_Void as a mask and never as data, seam gaps and print or cut offsets, and compute the Keep_Out_Mask.
    - Depends on: 3.3, and the Keep_Out_Mask that task 2.5 records in the V2-M2 Result_Record (Requirement 12.1).
    - Evidence: EC 2.
    - Acceptance: two runs with identical parameters and seed give zero differing raster values (7.2). No printed module lies inside the Central_Void, the Data_Layer has no data value at a Central_Void position (7.4), and the mask overlaps zero data cells and zero detection-critical frame elements under the nominal geometry of V2-M2 (7.5, 3.5). With zero seam gap, every unprinted pixel inside the outer outline lies inside the Central_Void mask (4.2). The Keep_Out_Mask is the union of the data cells, the detection-critical frame elements and the quiet zone, with no other region (7.8). The Keep_Out_Mask computed by the renderer equals the mask recorded in the V2-M2 Result_Record for the same parameters (7.8, 12.1). If the two masks differ, a Gate 3 no-go is recorded, the route returns to V2-M2, and the difference is not recorded as a retroactive Gate 2 outcome (7.8). For each trial the visible gap and the frame-continuity displacement are reported in modules (4.6).
    - Tests: Property 8 (Determinism) and Property 11 (Void respect). Unit tests of the mask on hand-built cases.
    - Owner decisions needed: OP-4.1, OP-4.7, OP-4.8, OP-7.2, OP-7.3.
    - Risks: RK-3, RK-16.
    - Every Result_Record and report describes "one continuous square" as a target appearance. Its status comes only from the gap and displacement measurements of 4.6, not from assumption (4.8).
    - _Requirements: 3.5, 4.2, 4.6, 4.8, 7.2, 7.4, 7.5, 7.8, 12.1_

  - [ ] 3.5 Write the placement-class consistency, flip and negative-control tests
    - Produces: tests under `src/optical-v2/tests/` and results under `docs/optical-v2/results/m3-*`. Each class enumerated in 2.2 is rendered with the unmodified printed raster, front and back, with flip tests.
    - Depends on: 3.4.
    - Evidence: EC 2.
    - Acceptance: the Shared_Layer rasters of any two classes (decoration OFF) differ within the tolerance recorded in V2-M2 (7.6, 4.3). Frame, outline and Decoration_Layer rasters differ within the same tolerance across cards and slots where the Data_Layer differs (4.4). The same unmodified raster in each legal slot and orientation gives a valid-group Assembled_Square (5.4). After a left-right flip under ideal conditions, the Observed_Layer equals the pre-flip observation, and after a top-bottom flip it equals the observation in at least one allowed orientation (5.7, 5.8). A negative control that prints the same raster on both faces is expected to be detected as a violation of 5.7, and each run is stored (5.9). The number of classes covered is stated, with the 16 labelled UNVERIFIED until Requirement 2 is executed (5.14). A failed or undecidable test is stored with card, face and class or flip direction (5.13). If the Shared_Layer rasters of two classes (decoration OFF) differ by more than the tolerance recorded in V2-M2, a Gate 3 no-go is recorded, the route returns to V2-M2 to re-run the enumeration (19.13), and the difference is not recorded as a retroactive Gate 2 outcome (7.6). The Gate 2 trigger "NO-GO for square appearance" belongs to the V2-M2 model-level check (4.7, task 2.3).
    - Tests: Property 3 (Placement equivalence) and Property 9 (Flip equivalence), property-based where the design allows.
    - Owner decisions needed: OP-4.3, OP-4.4, OP-5.1, OP-5.2, OP-5.3, OP-5.6 (class B).
    - Risks: RK-1, RK-17.
    - _Requirements: 4.3, 4.4, 5.4, 5.7, 5.8, 5.9, 5.13, 5.14, 7.6, 19.13_

  - [ ] 3.6 Check that V1 and the Fragment_Layout are unchanged
    - Produces: `docs/optical-v2/results/m3-v1-untouched.*` (additional proposal), built with the script of task 1.4.
    - Depends on: 1.4, 3.5.
    - Evidence: EC 1 for the comparison. EC 2 for the V1 test-command run.
    - Acceptance: the V1 files and the Fragment_Layout are compared with the Baseline_V1 pin and the Result_Record states the number of differing files (7.9). Any difference means the V2-M3 Gate is not recorded as passed and the differing items are listed (7.11). The codebook SHA256 and the no-diff check pass or fail visibly (1.3, 1.4, 1.9).
    - Tests: Property 6 (V1 preservation).
    - Owner decisions needed: none.
    - Risks: RK-4.
    - _Requirements: 1.3, 1.4, 1.7, 1.9, 6.10, 7.9, 7.11_

  - [ ] 3.7 Gate 3: Record the Gate 3 decision (Result_Record) and stop for owner authorization before the next milestone
    - Produces: `docs/optical-v2/results/m3-gate.*` (additional proposal), one Result_Record naming V2-M3 and one value, go or no-go.
    - Depends on: 3.1 to 3.6.
    - Evidence: EC 1.
    - Acceptance: criteria of the diagram: deterministic output, all classes consistent, V1 untouched. A go continues to V2-M4 only after a dated owner statement naming V2-M4 (19.3). A no-go (including a Placement_Class mismatch under 7.6 or a Keep_Out_Mask mismatch under 7.8) routes back to V2-M2 and starts no other milestone (19.4). After the return, Gates 2 and 3 are re-passed with new Result_Records and the superseded ones are kept (19.13). The V1 regression gates are recorded (1.7).
    - Tests: verification by reading the records.
    - Owner decisions needed: OP-19.2 (class B).
    - Risks: RK-1, RK-4.
    - _Requirements: 1.7, 7.6, 7.8, 7.9, 7.11, 19.2, 19.3, 19.4, 19.11, 19.13_

- [ ] 4. V2-M4: Plan the four-fragment atomic recognition system (PR #18 M3)
  - PLANNED, NOT STARTED. Starts only after Gate 3 and explicit owner authorization naming V2-M4.
  - Detail status: provisional outline, re-confirmed after Gate 2 and Gate 3.
  - Produces (proposals): decode and policy modules under `src/optical-v2/`, `docs/optical-v2/results/m4-candidate-comparison.*`, a Pre-registration record.
  - Depends on: Gate 3 (go).
  - Evidence: EC 1 for Pre-registration and export inspection. EC 2 for comparison, negative suites and harness results.
  - Acceptance: Gate 4: Candidate A or B chosen by measurement against the Pre-registration, no IDENTIFIED for the 14 non-empty proper subsets or any pre-registered negative class, no per-piece success in the production export.
  - Owner decisions needed: O-6, OP-3.8, OP-8.3, OP-8.4, OP-9.3, OP-11.1.
  - Risks: RK-4, RK-5, RK-6, RK-9, RK-18.
  - _Requirements: 8.1 to 8.14, 9.1 to 9.11, 10.1 to 10.13, 11.1 to 11.10_

  - [ ] 4.1 Write the Pre-registration for the candidate comparison, negative classes and metric partition
    - Produces: `docs/optical-v2/results/m4-preregistration.*` (additional proposal) with conditions, trial counts, seeds, metrics, thresholds, the meaning of "significant degradation", the analysis method, the stopping rule, the decision rule and the Gate 4 criteria. Also the table that maps each combination of input type (Valid_Input or Negative_Input), result kind and Oracle comparison to exactly one of CORRECT, REJECTED, WRONG_ACCEPT_VALID and WRONG_ACCEPT_NEGATIVE, the negative classes with the "damaged" and "ambiguous" definitions, the bound method for non-zero counts, and the independence argument.
    - Depends on: Gate 3.
    - Evidence: EC 1.
    - Acceptance: the stored ordering shows that the Pre-registration exists before any Result_Record of Candidate_A or Candidate_B (11.1). The negative classes are all 14 Proper_Subset_Scenes, duplicate cards, illegal suit, orientation and slot combinations, 90-degree Pieces, distractor squares at neighbouring vertices at the S and quiet zone selected from the V2-M2 study, foreign decoration and background only (10.10). The class mapping table exists before the first classified run (9.11). The damaged-Piece and ambiguity rules are defined (10.3, 10.12). Any later departure is recorded as a labelled deviation (11.10).
    - Tests: ordering check of record dates and commits.
    - Owner decisions needed: OP-3.8, OP-8.9, OP-9.1, OP-9.2, OP-9.3, OP-9.4, OP-9.5, OP-10.6, OP-10.7, OP-11.1, OP-11.2, OP-11.3, OP-11.4.
    - Risks: RK-5, RK-6, RK-18.
    - _Requirements: 9.7, 9.8, 9.11, 10.3, 10.10, 10.12, 11.1, 11.10_

  - [ ] 4.2 Build the independent Oracle and the Comparison_Harness
    - Produces: Oracle and harness modules under `src/optical-v2/` (the harness is the only place that may import V1 code) and tests in `src/optical-v2/tests/`. The harness runs Candidate_A, Candidate_B and the pinned Baseline_V1 on identical inputs.
    - Depends on: 4.1.
    - Evidence: EC 2.
    - Acceptance: truth fields stay in the Oracle and the decoder input contains none of them (9.6). Each trial gets exactly one of the four classes and no other label (9.4). The Result_Record reports the four counts separately with n, never counts REJECTED in a success-rate numerator, states numerator and denominator, and reports the false-reject count with the number of Valid_Input trials (9.5). If the counts do not sum to n, the run is marked not evaluable and the unassigned ids are listed (9.10). For IDENTIFIED on a Valid_Input, `cards` and `hiddenSum` are compared with the independent truth and the mismatch count, n, observed rate and bound are recorded (9.7). Zero-event statements follow 9.8. The three systems have equal sample-identifier sets (11.2). Median and p95 latency, environment and working resolution are recorded (11.6). Discordant pairs are stored (11.9). Every V1 comparison carries "unevaluated V1 baseline (synthetic)" (1.6). V1 is imported only here (6.7).
    - Tests: Property 10 (Metric partition) and Property 4 (Identity correctness). Unit tests of the harness with stub decoders for each class. A unit test of the bound formula 1 - 0.05^(1/n).
    - Owner decisions needed: OP-9.7, OP-9.8, OP-9.9, OP-11.5, OP-11.6.
    - Risks: RK-5, RK-6, RK-20.
    - _Requirements: 1.6, 6.7, 9.4, 9.5, 9.6, 9.7, 9.8, 9.10, 11.2, 11.6, 11.9_

  - [ ] 4.3 Plan the Candidate A and Candidate B prototypes (planned only)
    - Produces: candidate modules under `src/optical-v2/` for Candidate_A (whole-square, frame-first) and Candidate_B (four regions read internally, then atomic validation). Each returns an internal reading for diagnostics only. No candidate is chosen in this task.
    - Depends on: 4.1, 3.5.
    - Evidence: EC 2.
    - Acceptance: both candidates produce an internal reading from a grayscale image without board state. If a candidate needs a separate quiet margin between Pieces, a written evaluation names the Requirement 4 criteria checked and the outcome (appearance violation or none) as conflict C1 (11.7). Latency, environment and working resolution are measurable per candidate (11.6).
    - Tests: unit tests on rendered squares of the M3 renderer. Detector behaviour is measured by the comparison in 4.6, not asserted here.
    - Owner decisions needed: none new.
    - Risks: RK-4, RK-5, RK-9.
    - _Requirements: 11.4, 11.6, 11.7_

  - [ ] 4.4 Implement the AtomicDecisionPolicy, the result kinds and the production export
    - Produces: policy and entry-point modules under `src/optical-v2/`. The only production export is `decodeComposite`. Result kinds (proposal): IDENTIFIED, INCOMPLETE_GROUP, INVALID_ARRANGEMENT, DUPLICATE_CARD, CORRUPTED, NOT_DETECTED, AMBIGUOUS. A short document statement of the Atomic_Result_Policy.
    - Depends on: 4.3, 4.2.
    - Evidence: EC 2 for behaviour. EC 1 for export and document inspections.
    - Acceptance: every call returns exactly one OfficialResult with one kind from the set decided in V2-M4 (8.1, 9.1). `cards`, `hiddenSum` and `reflection` exist if and only if the kind is IDENTIFIED, and for other kinds the card ID, rank, suit, Card_Value and Hidden_Sum fields are absent, not null (8.2, 9.2). An IDENTIFIED result has four distinct card IDs and a Hidden_Sum from 4 to 52 (9.3, 8.5). Illegal arrangements, duplicates, damaged Pieces, subsets, ambiguity and no Piece give INVALID_ARRANGEMENT, DUPLICATE_CARD, CORRUPTED, INCOMPLETE_GROUP, AMBIGUOUS and NOT_DETECTED (10.1, 10.2, 10.3, 10.11, 10.12, 10.13). A group has exactly four Pieces meeting at one vertex, and the complete group nearest the frame center is selected (10.4, 10.5). The V2 AMBIGUOUS kind is named separately from the V1 reflection AMBIGUOUS (9.9). Internal_Diagnostics are absent from the export, `decodeFragment` equals its pinned version, and no export reports per-piece success (8.6, 8.7). Options contain layout and tuning only (8.8). No card identity is logged or placed in an exception for a non-IDENTIFIED call (8.9). A document states that the policy is a result rule, not secrecy, and makes no claim about other ways to derive identity (8.10). A hint exists only if O-6 is approved and then only the named geometric types, otherwise none (8.11, 8.14). Memory and time limits are marked "proposed, pending owner approval" (8.13).
    - Tests: Property 1 (Atomicity), property-based over generated images and options. Unit tests per result kind. An export-list inspection test (EC 1).
    - Owner decisions needed: O-6, OP-8.1, OP-8.2, OP-8.3, OP-8.4, OP-8.6, OP-8.7, OP-8.8, OP-8.10, OP-8.11, OP-9.7, OP-9.8, OP-10.1, OP-10.2, OP-10.4, OP-10.5.
    - Risks: RK-5, RK-6, RK-19.
    - _Requirements: 8.1, 8.2, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.13, 8.14, 9.1, 9.2, 9.3, 9.9, 10.1, 10.2, 10.3, 10.4, 10.5, 10.11, 10.12, 10.13_

  - [ ] 4.5 Build and run the negative suites, the subset rejection test and the Target_Region check
    - Produces: negative-suite tests under `src/optical-v2/tests/`, the TargetCheck function at module level only (no Scoring_Companion import), and per-class Result_Records.
    - Depends on: 4.4, 4.2.
    - Evidence: EC 2.
    - Acceptance: each of the 14 non-empty proper subsets returns a Reject and background only returns a Reject (8.3, 8.4). The run records the total n, the number of the 14 subsets covered and the Wrong_Accept count as finite-sample observations, and does not present zero as a guarantee (8.12). One row per negative class with n and the WRONG_ACCEPT_NEGATIVE count, each backed by a Result_Record (10.10). Distractor squares at neighbouring vertices never give an IDENTIFIED result containing a Piece from another vertex (10.6). A Proper_Subset_Scene gives INCOMPLETE_GROUP and no Piece gives NOT_DETECTED (10.11, 10.13). A result with a `vertex` outside the Target_Region is discarded for the Target_Group, decoded identities are stored as decoded, and any Reject or non-matching vertex leads to no applied result and a repositioning, rescan or manual-entry request (10.7, 10.8, 10.9). Before V2-M8 these three criteria are verified on the `verifyTargetVertex` function and the Official_Scanner results (EC 2). The Scoring_Companion behaviour itself is verified in V2-M8 under 17.7 (EC 3, task 8.4). Zero-event statements follow 9.8.
    - Tests: Property 2 (Subset rejection) and Property 12 (Target safety).
    - Owner decisions needed: OP-3.8, OP-8.9, OP-10.1, OP-10.3, OP-10.7, OP-10.8, O-6 (hint absent unless approved).
    - Risks: RK-5, RK-6, RK-18.
    - _Requirements: 8.3, 8.4, 8.12, 9.8, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.13_

  - [ ] 4.6 Choose between Candidate A and Candidate B by measurement and inspect the export surface
    - Produces: `docs/optical-v2/results/m4-candidate-comparison.*` and an export-surface inspection record.
    - Depends on: 4.5.
    - Evidence: EC 2 for the comparison. EC 1 for the export-surface inspection.
    - Acceptance: both candidates pass their readings through the Atomic_Decision_Policy, so every Proper_Subset_Scene gives a Reject kind with no card ID, Hidden_Sum or per-piece success indicator (11.4). The choice record cites the Pre-registration decision-rule clause applied and the Oracle-classified results used (11.3), and cites every labelled deviation (11.10). Discordant pairs and aggregate rates are stored (11.9). The export-surface inspection shows no exported name or OfficialResult content through which Internal_Diagnostics reach the caller (11.5). If neither candidate satisfies the Gate 4 criteria, the record states that none was chosen and the route returns to V2-M3 (11.8). A re-run with the same commit, seed and environment reproduces the counts (18.9).
    - Tests: re-run of the recorded comparison command and comparison of counts.
    - Owner decisions needed: OP-11.3, OP-11.4, OP-11.7, OP-11.8.
    - Risks: RK-5, RK-6, RK-9.
    - _Requirements: 1.6, 9.5, 11.2, 11.3, 11.4, 11.5, 11.6, 11.8, 11.9, 11.10, 18.9_

  - [ ] 4.7 Gate 4: Record the Gate 4 decision (Result_Record) and stop for owner authorization before the next milestone
    - Produces: `docs/optical-v2/results/m4-gate.*` (additional proposal), one Result_Record naming V2-M4 and one value, go or no-go, and the route.
    - Depends on: 4.1 to 4.6.
    - Evidence: EC 1.
    - Acceptance: a go with decoration still possible continues to V2-M5. A go after a Gate 2 NO-GO for decoration continues to V2-M6 with V2-M5 skipped (diagram, 2.10). A no-go returns to V2-M3 (19.4, 11.8), and the later Gates that depend on a changed artifact are re-passed with new Result_Records (19.13). The V1 regression gates are recorded (1.7). The next milestone does not start without a dated owner statement naming it (19.3).
    - Tests: verification by reading the records.
    - Owner decisions needed: OP-11.1 (class C, cite the V2-M4 row of the deliverables table in the Pre-registration), OP-19.2.
    - Risks: RK-5, RK-6.
    - _Requirements: 1.7, 11.8, 19.2, 19.3, 19.4, 19.11, 19.13_

- [ ] 5. V2-M5: Plan Joker decoration A/B validation (PR #18 M4)
  - PLANNED, NOT STARTED. Starts only after Gate 4 and explicit owner authorization naming V2-M5.
  - Skip condition: when the V2-M2 outcome is NO-GO for decoration, this milestone is skipped, no V2-M5 result is produced, and V2-M6 and V2-M7 run with Decoration_Mode OFF as the only V2 arm (2.10, 14.9). The Baseline_V1 arm still runs in V2-M6 (14.8, 14.9). Gate 5 is then also skipped.
  - Detail status: provisional outline, re-confirmed after Gate 2.
  - Produces (proposals): `docs/optical-v2/results/m5-joker-ab.*`, decoration assets only after rights approval.
  - Depends on: Gate 4 (go, decoration still possible), 2.4, O-5 permission for any stored artwork.
  - Evidence: EC 1 for rights, Pre-registration and decision records. EC 2 for the paired runs.
  - Acceptance: Gate 5 records one of keep, simplify or remove, citing the Result_Records and discordant pairs.
  - Owner decisions needed: O-3, O-5 (with OP-12.5), OP-12.1, OP-13.1 to OP-13.5 (class B).
  - Risks: RK-1, RK-2, RK-6, RK-7, RK-15, RK-16.
  - _Requirements: 12.1 to 12.11, 13.1 to 13.12_

  - [ ] 5.1 Gate the decoration assets on rights and check the Keep_Out_Mask
    - Produces: decoration asset modules under `src/optical-v2/` (only after an O-5 permission is recorded) and the check that compares the Decoration_Layer region with the Keep_Out_Mask in the Square_Renderer output.
    - Depends on: Gate 4, 2.4, 1.5.
    - Evidence: EC 2 for the mask and removal checks. EC 1 for rights and document checks.
    - Acceptance: the Decoration_Layer lies only inside the Assembled_Square and outside the Keep_Out_Mask (12.1), and its intersection with the data cells, detection-critical frame elements and quiet zone is empty (12.2). Joker_Decoration is not a card, carries no card ID or Card_Value, and the Oracle Hidden_Sum of any Valid_Input is identical in every Decoration_Mode (12.3). The render without the Decoration_Layer differs from the decorated render only inside the decoration region (12.4). Where the layer is present, the symmetry check of 2.5 is stored per class (12.5). An element below the minimum feature size is simplified or removed and the re-rendered layer contains none below it (12.9). The SVG is never an operational code, Valid_Input or Oracle entry (12.7). Nothing is stored or published without a permission record (12.8, 12.10).
    - Tests: Property 5 groundwork (decoration non-interference) at mask level. Unit tests that a planted element inside the Keep_Out_Mask fails the check.
    - Owner decisions needed: O-5, O-3, OP-12.1, OP-12.5.
    - Risks: RK-2, RK-15, RK-16.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.7, 12.8, 12.9, 12.10, 3.4_

  - [ ] 5.2 Define the decoration arms and the A/B Pre-registration
    - Produces: `docs/optical-v2/results/m5-preregistration.*` (additional proposal). It defines OFF, SIMPLIFIED and ORIGINAL_BASED, and FRAME_ONLY where Gate 2 returned GO-WITH-REDESIGN in that form. It holds the thresholds for the correct rate and the rejection rate, the meaning of "significant degradation", the meaning of "complete and valid", and the list of inputs held identical across arms.
    - Depends on: 4.7, 5.1.
    - Evidence: EC 1.
    - Acceptance: it is dated before the first V2-M5 trial record and has every item of the Pre-registration definition (13.4). The arms are named (12.6). Identical card sets, arrangements, degradation seeds, noise, blur, illumination, perspective and geometry are listed per arm (13.1). The completeness definition is recorded (13.9). Values the owner has not approved are marked "proposed, pending owner approval".
    - Tests: ordering check of record dates.
    - Owner decisions needed: O-3, OP-7.6, OP-12.3, OP-13.1, OP-13.2, OP-13.3, OP-13.4, OP-13.5.
    - Risks: RK-6.
    - _Requirements: 12.6, 13.1, 13.4, 13.9_

  - [ ] 5.3 Run the paired A/B comparison OFF, SIMPLIFIED and ORIGINAL_BASED
    - Produces: results in `docs/optical-v2/results/m5-joker-ab.*` from the Comparison_Harness.
    - Depends on: 5.2, 4.2.
    - Evidence: EC 2.
    - Acceptance: arms run on identical inputs and only the Decoration_Layer differs (13.1). Trials are compared in pairs, and every discordant trial is listed with its id and both outcomes (13.2). Per arm and condition the record holds the trial count, correct, REJECTED per kind, WRONG_ACCEPT_VALID and WRONG_ACCEPT_NEGATIVE separately, median and p95 latency, and the environment (13.3). A trial without a paired result for every run arm is excluded and listed by id and arm (13.11). Outcomes come from the Oracle and truth is never a decoder input (13.12).
    - Tests: the pairing function is tested with an injected discordant trial and an injected unpaired trial.
    - Owner decisions needed: O-5.
    - Risks: RK-6, RK-7.
    - _Requirements: 9.4, 9.5, 13.1, 13.2, 13.3, 13.11, 13.12_

  - [ ]* 5.4 Run the optional FRAME_ONLY arm
    - Produces: the FRAME_ONLY rows of `m5-joker-ab.*`, only where Gate 2 returned GO-WITH-REDESIGN in that form. If not defined, the record states that it was not run.
    - Depends on: 5.3, 2.6.
    - Evidence: EC 2.
    - Acceptance: the arm runs on the same inputs as the other arms and is reported in the same fields (13.1, 13.2, 13.3). If FRAME_ONLY is not defined, the Result_Record states that it was not run (13.1).
    - Tests: as 5.3.
    - Owner decisions needed: O-3, OP-12.3.
    - Risks: RK-1, RK-6.
    - _Requirements: 12.6, 13.1, 13.2, 13.3_

  - [ ] 5.5 Evaluate the removal and simplification criteria
    - Produces: an evaluation section of `m5-joker-ab.*` naming which of the criteria fired per arm.
    - Depends on: 5.3, 5.4.
    - Evidence: EC 2 for criteria 13.5, 13.6 and 13.9. EC 1 for 13.7 and 13.8.
    - Acceptance: an arm with at least one Wrong_Accept where the OFF arm has none on the same paired trial is removed or simplified (13.5). An arm below the OFF arm by more than the pre-registered threshold in correct rate or rejection rate is removed or simplified (13.6). A conflict with the Keep_Out_Mask, the Central_Void or the minimum feature size leads to removal or simplification (13.7). A failing symmetry check across the Placement_Classes leads to removal or simplification (13.8). A failed completeness and validity definition with decoration OFF leads to removal or simplification (13.9). Whether "remove" or "simplify" applies is open (OP-13.5).
    - Tests: Property 5 (Decoration non-interference) over the paired trials.
    - Owner decisions needed: OP-13.1, OP-13.5.
    - Risks: RK-1, RK-6, RK-16.
    - _Requirements: 12.9, 13.5, 13.6, 13.7, 13.8, 13.9_

  - [ ] 5.6 Gate 5: Record the Gate 5 decision (Result_Record) and stop for owner authorization before the next milestone
    - Produces: `docs/optical-v2/results/m5-gate.*` (additional proposal), one Result_Record naming V2-M5 and exactly one of keep, simplify or remove.
    - Depends on: 5.5.
    - Evidence: EC 1.
    - Acceptance: the record cites the Result_Records and discordant pairs and states which of the criteria 13.5 to 13.9 fired. "keep" is recorded only if none fired (13.10). The decision continues to V2-M6 ("decided" at Gate 5, 19.2). The record names the Decoration_Modes that V2-M6 and V2-M7 run: `keep` runs OFF plus the kept mode(s), `simplify` runs OFF plus SIMPLIFIED, `remove` runs OFF only (14.13 for V2-M6, 16.17 for V2-M7). The V1 regression gates are recorded (1.7). V2-M6 does not start without a dated owner statement naming it (19.3). If Gate 5 is re-entered through a Gate 7 route, it is re-passed with a new Result_Record and the old one is kept, marked superseded (19.13).
    - Tests: verification by reading the records.
    - Owner decisions needed: OP-19.2 (class B).
    - Risks: RK-6.
    - _Requirements: 1.7, 13.10, 14.13, 16.17, 19.2, 19.3, 19.11, 19.13_

- [ ] 6. V2-M6: Plan synthetic robustness and regression testing (PR #18 M5)
  - PLANNED, NOT STARTED. Starts only after Gate 5 (or after Gate 4 when V2-M5 was skipped) and explicit owner authorization naming V2-M6.
  - Detail status: provisional outline, re-confirmed after Gate 2.
  - Produces (proposals): `docs/optical-v2/results/m6-robustness-*`, a regression report.
  - Depends on: Gate 5 (decided), or Gate 4 (go, decoration NO-GO).
  - Evidence: EC 2 for runs. EC 1 for the Pre-registration and the enumeration count. Every V2-M6 result is labelled EC 2 and is not a real-camera result (14.6, 20.6).
  - Acceptance: Gate 6: pre-registered synthetic gates met or recorded as not met, V1 regression gates listed with outcomes, failures and seeds preserved. The arms are fixed by the Gate 5 record: the Baseline_V1 arm runs in every case. If V2-M5 was skipped, OFF is the only V2 arm. If V2-M5 ran, the V2 arms are exactly the Decoration_Modes the Gate 5 record names (`keep`: OFF plus the kept mode(s); `simplify`: OFF plus SIMPLIFIED; `remove`: OFF only) (14.8, 14.9, 14.13).
  - Owner decisions needed: OP-14.1, OP-14.2, OP-14.6, OP-3.8 (class B, class C for OP-14.6).
  - Risks: RK-6, RK-9, RK-18.
  - _Requirements: 14.1 to 14.13, 1.7, 9.8, 18.9_

  - [ ] 6.1 Pre-register the robustness condition matrix
    - Produces: `docs/optical-v2/results/m6-preregistration.*` (additional proposal) listing the conditions with levels, trial count and seeds of each: camera rotations of 0, 45, 90, 180 and 270 degrees, near-boundary values 44.9 and 45.1 degrees, reflection, perspective, occlusion, brightness, noise, blur, seam gaps, and print and cut offsets. It also holds the statistic and environment fields for Node decode latency, and the upper-bound method.
    - Depends on: Gate 5 or Gate 4 as above.
    - Evidence: EC 1.
    - Acceptance: the record exists before the first V2-M6 trial (14.1). A condition run with different levels, seeds or trial counts than registered, or not run, is listed as a deviation and its coverage is not claimed (14.11). Levels and counts are not invented here (OP-14.1).
    - Tests: ordering check of record dates.
    - Owner decisions needed: OP-14.1, OP-14.4.
    - Risks: RK-6, RK-9.
    - _Requirements: 14.1, 14.10, 14.11_

  - [ ] 6.2 Enumerate the static validity set with deduplication
    - Produces: a count record in `m6-robustness-*` of valid (card set, arrangement) combinations before and after deduplication, and the deduplication rule.
    - Depends on: 6.1.
    - Evidence: EC 1.
    - Acceptance: both counts and the rule are recorded before any claim of exhaustive coverage. The V1 numbers 81 and 648 are not used as V2 counts (14.2).
    - Tests: unit test of the deduplication rule on a small constructed case.
    - Owner decisions needed: OP-14.2.
    - Risks: RK-6.
    - _Requirements: 14.2_

  - [ ] 6.3 Assemble the negative suites for the full-board setting
    - Produces: negative-suite sets at the S and quiet zone selected in V2-M2, including distractor squares at neighbouring vertices (40 and 56 module spacing), duplicates, illegal combinations, 90-degree Pieces, foreign decoration and background only, reusing the classes of 4.1.
    - Depends on: 6.1, 4.5.
    - Evidence: EC 2.
    - Acceptance: every pre-registered negative class has a row with n and the WRONG_ACCEPT_NEGATIVE count backed by a Result_Record (10.10). Distractors at neighbouring vertices never give an IDENTIFIED result containing a Piece from another vertex (10.6). The S bound of V2-M2 is the one used (3.2).
    - Tests: Property 2 (Subset rejection) and Property 12 (Target safety), re-run in the V2-M6 conditions.
    - Owner decisions needed: OP-3.8.
    - Risks: RK-18.
    - _Requirements: 3.2, 10.6, 10.10_

  - [ ] 6.4 Add the V1 baseline arm and the V1 regression gates
    - Produces: harness configuration that runs the pinned Baseline_V1 on the same sample identifiers and seeds as each V2 arm, and the regression-gate listing in `m6-robustness-*`.
    - Depends on: 6.1, 1.4, 4.2, and the Gate 5 record (or the Gate 4 record when V2-M5 was skipped) that fixes the V2 arms.
    - Evidence: EC 2.
    - Acceptance: the Baseline_V1 arm runs in every case, on the same identifiers and seeds as each V2 arm, and the Result_Record shows those identifiers for every arm (14.8). When V2-M5 was skipped, V2-M6 runs on the V2 arm with Decoration_Mode OFF as the only V2 arm, the record says V2-M5 was skipped, and the V1 arm still runs (14.9). When V2-M5 ran, V2-M6 runs exactly the Decoration_Modes the Gate 5 record names: `keep` runs OFF plus the kept mode(s), `simplify` runs OFF plus SIMPLIFIED, `remove` runs OFF only, and the Result_Record cites the Gate 5 decision applied (14.13). Every V1 regression gate of 1.7 is listed with its pass or fail outcome, and GO or GO-WITH-REDESIGN is not recorded while any is failed or unlisted (14.3). Comparisons carry "unevaluated V1 baseline (synthetic)" (1.6).
    - Tests: Property 6 (V1 preservation) via the script of 1.4.
    - Owner decisions needed: OP-14.6 (class C, answered by 1.7).
    - Risks: RK-11.
    - _Requirements: 1.3, 1.4, 1.6, 1.7, 14.3, 14.8, 14.9, 14.13_

  - [ ] 6.5 Run the matrix, preserve every failure and report with upper bounds
    - Produces: `docs/optical-v2/results/m6-robustness-*`: counts per arm and condition, preserved failures and the regression report.
    - Depends on: 6.2, 6.3, 6.4.
    - Evidence: EC 2.
    - Acceptance: for every trial the Oracle does not classify as CORRECT, the seed, the input image and the Oracle classification are preserved, none is discarded and the failure count equals the number of such trials (14.4). A nonzero Wrong_Accept in any arm is reported with the condition, arm, both counts and the failing seeds (14.7). Zero-event statements give n, the upper bound and the independence argument or the statement that independence is not established (14.5, 9.8). The record states that the results are EC 2 and not real-camera results (14.6, 20.6), states the Node decode latency with statistic and environment and that these are not phone timings (14.10), and limits every claim to the pre-registered conditions and levels (14.12). The four outcome classes are reported separately (9.5). A re-run reproduces the counts (18.9).
    - Tests: re-run of the recorded command and comparison of counts. A check that the failure count equals the number of non-CORRECT trials.
    - Owner decisions needed: none new.
    - Risks: RK-6, RK-9.
    - _Requirements: 9.5, 9.8, 14.4, 14.5, 14.6, 14.7, 14.10, 14.12, 18.9, 20.6_

  - [ ] 6.6 Gate 6: Record the Gate 6 decision (Result_Record) and stop for owner authorization before the next milestone
    - Produces: `docs/optical-v2/results/m6-gate.*` (additional proposal), one Result_Record naming V2-M6 and one value, go or no-go.
    - Depends on: 6.1 to 6.5.
    - Evidence: EC 1 for the decision. EC 2 for the cited results.
    - Acceptance: the record lists each V1 regression gate with its outcome (14.3, 1.7). A go continues to V2-M7 only after a dated owner statement naming it (19.3). A no-go returns to V2-M4 (19.4), and the later Gates that depend on a changed artifact are re-passed with new Result_Records (19.13).
    - Tests: verification by reading the records.
    - Owner decisions needed: OP-19.2 (class B).
    - Risks: RK-6.
    - _Requirements: 1.7, 14.3, 19.2, 19.3, 19.4, 19.11, 19.13_

- [ ] 7. V2-M7: Plan physical printing and smartphone camera validation (PR #18 M6)
  - PLANNED, NOT STARTED. Starts only after Gate 6 and explicit owner authorization naming V2-M7.
  - Detail status: provisional outline, re-confirmed after Gate 2.
  - Produces (proposals): `docs/optical-v2/physical-test-protocol.md`, `docs/optical-v2/results/m7-physical-*`.
  - Depends on: Gate 6 (go). After a Gate 7 no-go, V2-M7 is re-entered only by the route that the Failure_Attribution_Record names ("new capture session" or "new round authorised"), with a new owner authorization naming V2-M7 and new independent captures (16.16, 19.13).
  - Evidence: EC 4 for real prints and phones. Real-device results are kept apart from synthetic results and are never merged into one rate (16.8, 18.2).
  - Acceptance: Gate 7: owner-approved thresholds met, or recorded as not met. Raw counts without an approval entry are reported as `unevaluated, threshold not approved` (16.2). A no-go carries a Failure_Attribution_Record with one primary cause class and the route taken (16.16). A go ends V2 as `validated for print, integration not approved` unless V2-M8 is separately approved (19.14). The Decoration_Modes printed and captured are the ones the Gate 5 record names, or OFF only when V2-M5 was skipped (16.17, Evidence_Class 4).
  - Owner decisions needed: O-4 (with OP-16.1 and OP-16.5, class A), OP-16.2 to OP-16.4, OP-16.6, OP-16.7 (class B).
  - Risks: RK-3, RK-7, RK-9, RK-15, RK-17.
  - _Requirements: 15.1 to 15.8, 16.1 to 16.17, 19.13, 19.14_

  - [ ] 7.1 Obtain owner-approved thresholds and write the real-device Pre-registration
    - Produces: `docs/optical-v2/results/m7-physical-preregistration.*` (additional proposal) with one approval entry per threshold. The PR #18 values (95% correct in 100 independent shots per normal condition, zero observed wrong card acceptance, 5 seconds end to end) stay `proposed, pending owner approval (O-4)` until the entry exists.
    - Depends on: Gate 6 (or the Failure_Attribution_Record route and a new authorization after a Gate 7 no-go, 16.16, 19.13).
    - Evidence: EC 4.
    - Acceptance: each threshold has an approval entry before the first capture (16.1). A Pre-registration exists before the first capture (16.15). With no approval entry, a result is not reported as pass or fail and is reported as raw counts labelled `unevaluated, threshold not approved` (16.2). A threshold is never changed after the results of the same captures have been seen (16.16). After a Gate 7 no-go, the new capture session has its own Pre-registration and new independent captures (19.13).
    - Tests: ordering check of record dates against the first capture.
    - Owner decisions needed: O-4 with OP-16.1 and OP-16.5 (class A). OP-16.2, OP-16.3, OP-16.4 are class B and are recorded in the protocol (7.2).
    - Risks: RK-9.
    - _Requirements: 16.1, 16.2, 16.15, 16.16_

  - [ ] 7.2 Prepare the print package and the physical test protocol
    - Produces: `docs/optical-v2/physical-test-protocol.md`, a print-sheet generation script under `scripts/optical-v2/` (additional proposal; name open), and a blank result-recording template.
    - Depends on: 7.1.
    - Evidence: EC 1 for the protocol document. EC 2 for the determinism of sheet generation. No real-device result exists at this point.
    - Acceptance: the protocol includes physical negative scenes (one to three Pieces, a wrong orientation, a duplicate) with the Oracle truth recorded before capture (16.12), and the record fields device model, operating system, camera settings, lighting, print process, paper stock, cutting method and measured decode time, with `unknown` where not obtainable (16.9). The back-side print-file convention of V1 Requirement 16.5 is verified in 7.4. The protocol states the hidden-information limit (5.12). The print package covers exactly the Decoration_Modes that the Gate 5 record names (`keep`: OFF plus the kept mode(s); `simplify`: OFF plus SIMPLIFIED; `remove`: OFF only), or OFF only when V2-M5 was skipped (16.17, Evidence_Class 4). The protocol records the class B points OP-16.2 to OP-16.4, OP-16.6 and OP-16.7.
    - Tests: sheet generation is deterministic (identical bytes for identical inputs), and each card appears exactly once.
    - Owner decisions needed: OP-16.1 (class A, with O-4), OP-16.7 (class B).
    - Risks: RK-15, RK-17.
    - _Requirements: 5.12, 16.9, 16.12, 16.17_

  - [ ] 7.3 Measure seam gap, registration, cut outline and the real Corner_Radius
    - Produces: measurement records in `docs/optical-v2/results/m7-physical-*`.
    - Depends on: 7.2.
    - Evidence: EC 4.
    - Acceptance: seam gap, front-to-back registration and cut-outline errors are measured on real prints in millimetres and modules (16.5, 4.6). The real Corner_Radius is recorded as a measured value because 3.175 mm is unconfirmed (16.10).
    - Tests: measurement method recorded in the protocol before measuring. Repeat measurements recorded.
    - Owner decisions needed: none new.
    - Risks: RK-3, RK-17.
    - _Requirements: 4.6, 16.5, 16.10_

  - [ ] 7.4 Run the physical duplex, flip and show-through tests (with the Decoration_Layer where it exists)
    - Produces: physical test records in `docs/optical-v2/results/m7-physical-*`.
    - Depends on: 7.2.
    - Evidence: EC 4.
    - Acceptance: the Observed_Layer after a physical flip is compared with the front observation and the back-side print-file convention is verified (16.6). The show-through test of V1 Requirement 16.10 is performed (16.7). The Decoration_Modes tested are those of the Gate 5 record per 16.17 (Evidence_Class 4). Where a Decoration_Layer exists in the printed mode (Gate 5 `keep` or `simplify`), it is included in both tests. Otherwise (V2-M5 skipped or Gate 5 `remove`), the same two tests run on the optical layer with Decoration_Mode OFF (16.6, 16.7). The record shows whether an empty corner is detected as a Piece (16.13) and whether a card whose inward corner is empty forms a complete group (16.14). Nothing is reported as passed without the observed result.
    - Tests: observed positions and bits before and after the flip are recorded as in the protocol.
    - Owner decisions needed: OP-16.6 (class B).
    - Risks: RK-7, RK-17.
    - _Requirements: 16.6, 16.7, 16.13, 16.14, 16.17_

  - [ ] 7.5 Run the real-device captures and record them
    - Produces: capture records in `docs/optical-v2/results/m7-physical-*`, kept in files separate from synthetic results.
    - Depends on: 7.3, 7.4.
    - Evidence: EC 4.
    - Acceptance: each capture records whether re-framing and re-lighting were done relative to the previous capture, independence is argued, and repeated frames of one setup are not counted as independent (16.3). Every frame the Oracle does not classify as CORRECT is kept unaltered with its Official_Result and counted in n (16.4). REJECTED, WRONG_ACCEPT_VALID and WRONG_ACCEPT_NEGATIVE are reported as separate counts with n (16.11). Real-device results are not merged with synthetic results in one rate (16.8). Zero-event statements follow 9.8. Device fields use `unknown` where needed (16.9). The captured arms are the Decoration_Modes of the Gate 5 record, or OFF only when V2-M5 was skipped, and each capture session cites the Gate 5 decision applied (16.17, Evidence_Class 4). Captures taken after a return are new independent captures (19.13).
    - Tests: check that the failure count equals the number of non-CORRECT frames.
    - Owner decisions needed: O-4 with OP-16.5 (class A). OP-16.2 to OP-16.4 are class B (protocol, 7.2).
    - Risks: RK-9, RK-7.
    - _Requirements: 9.8, 16.3, 16.4, 16.8, 16.9, 16.11, 16.17, 19.13_

  - [ ]* 7.6 Run the optional visual-indistinguishability test (PR #18 R06, NOT a security property)
    - Produces: a Pre-registration and result files `docs/optical-v2/results/m7-indistinguishability-*` (additional proposal).
    - Depends on: 7.2, owner approval of the test.
    - Evidence: EC 2 for rendered stimuli, EC 4 for printed cards, kept as separate records and rates.
    - Acceptance: before any trial the Pre-registration holds the blind procedure with the parties that do not see labels, the participant count, the numeric target for the identification rate and the publication channel (15.2). The numeric target is marked `proposed, pending owner approval (O-4)` until approved (15.3). The Result_Record gives correct identifications over total trials, an exact binomial confidence interval at the stated level, and a statement that no observed rate is a guarantee (15.4). Each place that describes the test states that indistinguishability is a proposal and not a security property and that static patterns remain reverse-engineerable (15.5). Rendered and printed stimuli are labelled EC 2 and EC 4 and kept separate (15.6, 15.7). No Gate record cites this test as a condition (15.1). If the test is not approved or not run, no document states or implies indistinguishability (15.8).
    - Tests: the interval computation is unit-tested against known binomial cases.
    - Owner decisions needed: O-4, OP-15.1, OP-15.2, OP-15.3, OP-15.5.
    - Risks: RK-19.
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8_

  - [ ] 7.7 Gate 7: Record the Gate 7 decision (Result_Record) and stop for owner authorization before the next milestone
    - Produces: `docs/optical-v2/results/m7-gate.*` (additional proposal), one Result_Record naming V2-M7 and one value, go or no-go. On a no-go also the Failure_Attribution_Record `docs/optical-v2/results/m7-failure-attribution.*` (additional proposal), built only from Result_Records (EC 4 frames, the failures kept under 16.4, and Oracle classifications).
    - Depends on: 7.1 to 7.5 (and 7.6 if it was run).
    - Evidence: EC 1 for the decision. EC 4 for the cited results.
    - Acceptance: owner-approved thresholds are either met or recorded as not met, and no real-camera claim rests on EC 1, 2 or 3 results (20.6). A threshold is never changed after the results of the same captures have been seen (16.16).
    - Acceptance (go): a go leads to V2-M8 only when the owner has separately approved V2-M8 (17.1, 19.2). With no such approval, V2 ends at Gate 7 with the status `validated for print, integration not approved` and no V2-M8 task starts (19.14).
    - Acceptance (no-go): the Failure_Attribution_Record names exactly ONE primary cause class and the route taken (16.16, 19.4), and no milestone other than the one the route names starts. The cause classes and routes are those of the Gate 7 routing table of `design.md` (names are proposals): DECORATION returns to V2-M5, possible only if V2-M5 ran, and cannot apply when it was skipped (re-pass Gates 5, 6, 7); PRINT_OR_GEOMETRY returns to V2-M2 and V2-M3 (re-pass Gates 2 to 7 as far as the changed artifacts affect them); RECOGNITION_OR_DECISION_POLICY returns to V2-M4 (re-pass Gates 4, 6, 7); THRESHOLD_NOT_APPROVED_OR_PROTOCOL_DEVIATION is not a defect, results stay `unevaluated`, and a new capture session follows after threshold approval (re-pass Gate 7); UNDETERMINED_OR_UNREACHABLE leads to an owner decision to stop V2 and keep V1, or to authorise a new pre-registered capture round (re-pass Gate 7 after the new round). Every re-entry follows execution rule 15 (19.13).
    - Acceptance (record): V1 regression gates are recorded (1.7). The Gate record names V2-M7 and exactly one decision value (19.11).
    - Tests: verification by reading the records. A check that the Failure_Attribution_Record is built only from Result_Records and names one cause class.
    - Owner decisions needed: O-4 (thresholds, class A), OP-19.2 (class B), and, after an UNDETERMINED_OR_UNREACHABLE cause, the owner decision named above.
    - Risks: RK-9.
    - _Requirements: 1.7, 16.1, 16.2, 16.4, 16.16, 19.2, 19.3, 19.4, 19.11, 19.13, 19.14, 20.6_

- [ ] 8. V2-M8 (optional milestone): Plan optional Scoring Companion integration (PR #18 M7)
  - PLANNED, NOT STARTED. Starts only after Gate 7, a separate owner approval of V2-M8 and explicit owner authorization naming V2-M8. This milestone is optional: its sub-tasks carry the optional marker, and the top-level line carries none because the task format allows the marker on sub-tasks only.
  - If V2-M8 is not separately approved, no Scoring Companion integration work is done and no change connects V2 to the Companion layer (17.1). V2 then ends at Gate 7 with the status `validated for print, integration not approved` (19.14).
  - Detail status: provisional outline, re-confirmed after Gate 2 and Gate 7.
  - Produces (proposals): `docs/optical-v2/companion-integration.md`, an adapter design (a separate spec), results under `docs/optical-v2/results/m8-*` (additional proposal).
  - Depends on: Gate 7 (go) and a separate owner approval of V2-M8 (17.1, 19.2).
  - Evidence: EC 1 for approval and dependency checks. EC 3 for headless-browser results. EC 4 for the real-device check.
  - Acceptance: Gate 8: separate owner approval, browser compatibility plan, boundary change approved, and the end-to-end real-phone check recorded under 17.14. A Gate 8 `go` ends the programme. A `no-go` returns to the V2-M8 tasks or stops by owner decision, and it keeps the Gate 7 decision valid unless a V2 artifact changed, in which case execution rule 15 applies (19.15).
  - Owner decisions needed: V2-M8 approval and boundary-change decision (OP-6.7, OP-17.1, deferred). OP-17.5, OP-17.7 (class C, V2-M8 detail).
  - Risks: RK-5, RK-8, RK-9.
  - _Requirements: 17.1 to 17.14, 19.14, 19.15_

  - [ ]* 8.1 Record the separate V2-M8 approval and the boundary-change decision
    - Produces: `docs/optical-v2/companion-integration.md` (proposal) with the approval record, the boundary-change decision, and the statement that a QR code used only for packaging or opening the application over HTTPS is a standard QR code and is not the Composite_Code_V2.
    - Depends on: Gate 7, owner approval.
    - Evidence: EC 1.
    - Acceptance: the boundary-change decision is recorded before any import from `src/game` (17.12, 6.6). The statement of 17.10 is present. Without the approval record, no integration work exists (17.1).
    - Tests: inspection that no connecting change exists before the approval record.
    - Owner decisions needed: OP-6.7, OP-17.1.
    - Risks: RK-5.
    - _Requirements: 6.6, 17.1, 17.10, 17.12_

  - [ ]* 8.2 Load the V2 pattern data in a browser without `node:fs` and decode in a headless-browser worker
    - Produces: a browser-compatible loading path in `src/optical-v2/` and a headless-browser decode test (browser tool not chosen here).
    - Depends on: 8.1.
    - Evidence: EC 3.
    - Acceptance: this criterion applies only when V2-M8 is approved (17.3, 17.1). Once approved, the V2 browser bundle loads its pattern data without `node:fs`, and a stored Result_Record shows a headless-browser worker decoding a V2 test frame to the result the Oracle expects (17.3). Independent of V2-M8, no V1 runtime module that reads the codebook with `node:fs` is imported by V2 production code (6.7), so no V2 code is built that blocks later browser use.
    - Tests: the headless-browser decode of a rendered V2 test frame, compared with the Oracle.
    - Owner decisions needed: OP-17.3.
    - Risks: RK-8, RK-9.
    - _Requirements: 6.7, 17.3_

  - [ ]* 8.3 Add the thin adapter, the camera scan input and the manual fallback
    - Produces: an adapter in the Companion layer (planned location decided in this task), camera access with `getUserMedia`, and the manual-entry path.
    - Depends on: 8.2.
    - Evidence: EC 1 for the dependency check. EC 3 for behaviour.
    - Acceptance: only the adapter in the Companion layer imports V2 code, shown by a dependency check (17.2). Where the camera scan input is offered, selecting it requests the camera with `getUserMedia` (17.4). If permission is denied or no camera is available, a manual entry option is shown and no camera frame is processed (17.13).
    - Tests: dependency-scan test (EC 1). Headless-browser tests with a stubbed camera and a denied permission (EC 3).
    - Owner decisions needed: OP-17.2.
    - Risks: RK-5, RK-8.
    - _Requirements: 17.2, 17.4, 17.13_

  - [ ]* 8.4 Match the Target_Region, enforce the disclosure order and handle Rejects
    - Produces: Companion-layer handling of the Official_Scanner result and the Target_Region match.
    - Depends on: 8.3, 4.5.
    - Evidence: EC 3.
    - Acceptance: the reported `vertex` is matched against the Target_Region and a vertex outside it discards the result. The Scoring_Companion stores for the Target_Group exactly the card IDs the Official_Scanner decoded, also when they differ from the Board record, and applies no result on a Reject or a non-matching vertex (17.7, 10.7, 10.8, 10.9). Criteria 10.7 to 10.9 are verified on `verifyTargetVertex` and the Official_Scanner results before V2-M8 (EC 2, task 4.5), and in the Scoring_Companion under 17.7 in V2-M8 (EC 3, this task). While the Guess of any participating player for a Quad_Group is unconfirmed, no user-visible output shows a card identity, rank, suit, Card_Value or Hidden_Sum decoded from that Quad_Group (17.8, stricter than V1 Requirement 6.1 and a PR #18 proposal). When all Guesses are confirmed and the result is IDENTIFIED, the Hidden_Sum and scores are shown per V1 Requirements 6.2 and 9.3 (17.9). A Reject shows a prompt offering both rescan and manual entry and applies no identity and no sum (17.11).
    - Tests: Property 12 (Target safety) in the browser context. Headless-browser tests of the disclosure order and of the Reject prompt.
    - Owner decisions needed: OP-17.5, OP-17.6, OP-17.7 (class C, V2-M8 detail).
    - Risks: RK-5.
    - _Requirements: 10.7, 10.8, 10.9, 17.7, 17.8, 17.9, 17.11_

  - [ ]* 8.5 Verify offline revisit and local frame processing in a headless browser
    - Produces: results in `docs/optical-v2/results/m8-*` (additional proposal): a network-disabled run and a network-traffic capture.
    - Depends on: 8.4.
    - Evidence: EC 3.
    - Acceptance: after at least one successful initial load, reopening without a network connection still scans and scores with V2, shown by a network-disabled run in which a Valid_Input returns IDENTIFIED (17.5). A recorded traffic capture of a scan shows no outbound request carrying frame data (17.6).
    - Tests: the network-disabled run and the traffic capture.
    - Owner decisions needed: none new.
    - Risks: RK-8, RK-9.
    - _Requirements: 17.5, 17.6_

  - [ ]* 8.6 Run the real-device check of the Companion scan
    - Produces: a Pre-registration and records in `docs/optical-v2/results/m8-*` kept apart from headless-browser results.
    - Depends on: 8.5, 7.1.
    - Evidence: EC 4 (Requirement 17.14).
    - Acceptance: on at least one real phone, the end-to-end flow is verified: a camera capture of four cards, identification of the correct group, confirmation of all Guesses and display of the score (17.14). The number of repetitions and the success definition are recorded in a Pre-registration before the run, and the PR #18 condition that the flow is repeatable stays `proposed, pending owner approval (O-4)` (17.14). The phone also requests the camera, shows the manual option when permission is denied, and does not disclose an identity before all Guesses are confirmed (17.4, 17.13, 17.8). Device fields, failed frames and thresholds follow the V2-M7 rules and no approved-threshold claim is made without an approval entry (16.2, 16.4, 16.9).
    - Tests: the protocol of V2-M7 extended with the Companion flow.
    - Owner decisions needed: O-4 (class A, with OP-16.1).
    - Risks: RK-9.
    - _Requirements: 16.2, 16.4, 16.9, 17.4, 17.8, 17.13, 17.14_

  - [ ]* 8.7 Gate 8: Record the Gate 8 decision (Result_Record) and stop for owner authorization before the next milestone
    - Produces: `docs/optical-v2/results/m8-gate.*` (additional proposal), one Result_Record naming V2-M8 and one value, go or no-go.
    - Depends on: 8.1 to 8.6.
    - Evidence: EC 1.
    - Acceptance: the record shows the separate owner approval and the boundary change (17.1, 17.12, diagram) and the real-phone check of 8.6 (17.14). The V1 regression gates are recorded (1.7). A `go` ends the programme and no later milestone exists in this spec (19.15). A `no-go` returns to the V2-M8 tasks, or stops by owner decision, and the route is recorded (19.4, 19.15). The Gate 7 decision stays valid after a Gate 8 no-go unless a V2 artifact changed. If one changed, execution rule 15 applies and the affected Gates are re-passed with new Result_Records (19.13). Any further work needs a new owner authorization (19.3).
    - Tests: verification by reading the records.
    - Owner decisions needed: OP-17.1 (deferred), OP-19.2 (class B), and, after a no-go, the owner decision to stop or to return to the V2-M8 tasks.
    - Risks: RK-5, RK-8.
    - _Requirements: 1.7, 17.1, 17.12, 17.14, 19.2, 19.3, 19.4, 19.11, 19.13, 19.15_

## Expected deliverables

All names are proposals from the "Deliverables per milestone" table of `design.md`. "(additional)" marks names that this plan adds.

| Milestone | Planned files |
|---|---|
| V2-M1 | `docs/optical-v2/baseline.md`, `docs/optical-v2/provenance.md`, `docs/optical-v2/results/m1-baseline.*`; additional: `docs/optical-v2/decisions.md`, `docs/optical-v2/results/m1-pr-state.*`, `m1-v1-tests.*`, `m1-v1-preservation.*`, `m1-gate.*`, `scripts/optical-v2/check-v1-preservation.*` |
| V2-M2 | `docs/optical-v2/results/m2-geometry-feasibility.*`, independent enumeration and symmetry script under `scripts/optical-v2/`; additional: `m2-preregistration.*`, `m2-gate.*` |
| V2-M3 | `docs/optical-v2/format-v2.md`, module skeleton under `src/optical-v2/` with tests in `src/optical-v2/tests/`, `codebook.v2.*` only if proven necessary; additional: `docs/optical-v2/compatibility-policy.md`, `results/m3-*`, `m3-gate.*` |
| V2-M4 | decode and policy modules under `src/optical-v2/`, `docs/optical-v2/results/m4-candidate-comparison.*`; additional: `m4-preregistration.*`, `m4-gate.*` |
| V2-M5 | `docs/optical-v2/results/m5-joker-ab.*`, decoration assets only after rights approval; additional: `m5-preregistration.*`, `m5-gate.*` |
| V2-M6 | `docs/optical-v2/results/m6-robustness-*`, regression report; additional: `m6-preregistration.*`, `m6-gate.*` |
| V2-M7 | `docs/optical-v2/physical-test-protocol.md`, `docs/optical-v2/results/m7-physical-*`; additional: print-sheet script under `scripts/optical-v2/`, `m7-physical-preregistration.*`, `m7-indistinguishability-*`, `m7-gate.*`, `m7-failure-attribution.*` (only after a Gate 7 no-go) |
| V2-M8 (optional) | `docs/optical-v2/companion-integration.md`, adapter design (separate spec); additional: `results/m8-*` (including the Pre-registration of the real-phone check), `m8-gate.*` |

## Mapping to PR #18 milestones

| V2 milestone | PR #18 milestone | Difference noted in `design.md` |
|---|---|---|
| V2-M1 | M0 | Adds baseline pinning (C7) and unevaluated-V1 handling (C6). |
| V2-M2 | M1 | Adds the explicit HYP-1 class enumeration and four outcomes. |
| V2-M3 | M2 | Candidate A/B image comparison moves to V2-M4. |
| V2-M4 | M3 | Includes the A/B candidate decision. |
| V2-M5 | M4 | Same. |
| V2-M6 | M5 | Same. |
| V2-M7 | M6 | Same. |
| V2-M8 | M7 | Needs separate approval. |

## Known risks and unresolved questions

Risks RK-1 to RK-20 and decisions O-1 to O-9 are defined in `design.md`. Appendix D of `requirements.md` lists the open points and is not repeated here. This section shows where the plan handles each risk and lists the open points that most affect the plan.

| Risk | Handled in tasks |
|---|---|
| RK-1 HYP-1 point symmetry | 2.2, 2.3, 2.6, 3.5, 5.5 |
| RK-2 Joker symmetry and artwork rights | 1.5, 2.4, 2.6, 5.1 |
| RK-3 seams and print tolerance | 3.4, 7.3 |
| RK-4 V1 quiet-zone rule versus a continuous square | 3.1, 4.3 |
| RK-5 atomic policy versus per-fragment API | 4.4, 4.5, 4.6, 8.1 |
| RK-6 wrong acceptance with decoration | 4.1, 4.2, 5.3, 5.5 |
| RK-7 show-through with decoration | 7.4, 5.3 |
| RK-8 browser compatibility (`node:fs`) | 3.2, 8.2, 8.3 |
| RK-9 phone latency unmeasured | 6.5, 7.1, 7.5, 8.2 |
| RK-10 project priority | 1.1, 1.7 |
| RK-11 which V1 baseline | 1.1, 1.4, 6.4 |
| RK-12 scoring and draw-rule proposals | Execution rules 5 (19.10) |
| RK-13 PR #17 steering not applied | Execution rules 6, task 1.6 (19.8, 19.12) |
| RK-14 private repository, PR states inferred | 1.2, 1.6 |
| RK-15 minimum feature size | 2.5, 5.1, 7.2 |
| RK-16 Central_Void near drawn elements | 2.5, 3.4, 5.1 |
| RK-17 double-sided registration and flip | 3.3, 3.5, 7.3, 7.4 |
| RK-18 neighbouring squares as distractors, bound on S | 2.5, 4.5, 6.3 |
| RK-19 static patterns reverse-engineerable | 3.1, 4.4, 7.6 |
| RK-20 evidence misattribution | 1.6, execution rules 2 and 9 |

Unresolved questions and contradictions noticed while writing this plan (none is resolved here):

- **Optional marker on the top-level task.** The owner asked for V2-M8 as `- [ ]*`. The task-format rule allows the marker only on sub-tasks. This plan marks all V2-M8 sub-tasks optional and leaves the top-level line unmarked.
- **Property-test sub-tasks.** The default workflow wants one sub-task per property. The owner's limit of 3 to 7 sub-tasks per milestone led to folding property tests into the implementing sub-tasks.
- **Gate 4 criteria location.** The criteria are in the "Deliverables per milestone" row of `design.md`, not in the Gate 4 diagram label (OP-11.1, class C). Task 4.1 cites the row in the Pre-registration.
- **Additional proposed files** (decisions register, Pre-registration files, gate files, compatibility policy, Failure_Attribution_Record) are not in the `design.md` deliverables table and need owner confirmation. Where decisions and authorizations are recorded is open (OP-19.2, class B).
- Most affecting owner decisions, in the order of Appendix E.4: O-1 and O-2 (P0), O-3, O-8 and OP-5.5 (P1), O-6 (P2), O-5 (P3), O-4 (P4), then O-9 and the V2-M8 approval (deferred). The class B points that most affect the plan are OP-2.1, OP-2.4, OP-3.1, OP-3.8, OP-12.1 and OP-14.1.

Resolved by the final consistency review (listed here so that the old notes are not read as open):

- **Gate 7 no-go route.** The old statement that a Gate 7 no-go routes to V2-M5 is resolved by the final consistency review. A Gate 7 no-go needs a Failure_Attribution_Record with one of five cause classes and a route (Requirements 16.16 and 19.4, task 7.7). A Gate 7 `go` without V2-M8 approval ends V2 as `validated for print, integration not approved` (19.14).
- **Gate 8 edges.** The old statement that no go/no-go edges exist for Gate 8 is resolved by the final consistency review. A Gate 8 `go` ends the programme and a `no-go` returns to the V2-M8 tasks or stops (19.15, task 8.7).
- **Evidence class of Requirement 4.7.** Resolved by the final consistency review: 4.7 and 4.9 are labelled `[EC 1]` and 4.7 is the model-level Gate 2 trigger (task 2.3). A later renderer mismatch is a Gate 3 no-go (7.6, 7.8, tasks 3.4, 3.5, 3.7).
- **Requirement 17 and EC 4.** Resolved by the final consistency review: criterion 17.14 `[EC 4]` covers the real-phone check (task 8.6).
- **Evidence class of Requirement 14.13.** Resolved by the final consistency review (1d): 14.13 now governs V2-M6 only (`[EC 2]`), and the new criterion 16.17 `[EC 4]` governs the Decoration_Modes printed and captured in V2-M7 (tasks 5.6, 7, 7.2, 7.4, 7.5).
## Notes

- Nothing in this file is started or done. A checkbox changes only under Execution rule 1.
- Tasks marked `*` are optional: 5.4 (FRAME_ONLY arm), 7.6 (indistinguishability test) and 8.1 to 8.7 (V2-M8).
- Each Gate sub-task is the checkpoint of its milestone. It records a decision and stops. It does not start the next milestone.
- V2-M3 to V2-M8 are provisional outlines until Gate 2 is recorded.
- End states: V2 ends at Gate 7 as `validated for print, integration not approved` when V2-M8 is not approved (19.14), and at Gate 8 with a `go` (19.15). A return to an earlier milestone follows execution rule 15 (19.13).
- Commands such as development servers or watchers are not part of any task. Tests are run in single-run mode.

## Task Dependency Graph

The graph lists every leaf sub-task, including optional ones. Gate sub-tasks are included because they are decimal-numbered leaf tasks. Wave order follows V2-M1 to V2-M8, and every sub-task sits in a later wave than each sub-task named in its `Depends on:` line. If Gate 2 records NO-GO for decoration, tasks 5.1 to 5.6 are skipped (2.10), and if it records NO-GO for square appearance, waves 11 to 45 are void. If the owner does not separately approve V2-M8, waves 39 to 45 are not executed and V2 ends at Gate 7 (task 7.7, wave 38) as `validated for print, integration not approved` (19.14).

The JSON lists the first-pass order only. The returns drawn in the gate diagram are not waves. A Gate 3 no-go returns to V2-M2 (waves 4 to 10), a Gate 4 no-go to V2-M3 (waves 11 to 16) and a Gate 6 no-go to V2-M4 (waves 17 to 22). A Gate 7 no-go (task 7.7, wave 38) returns by its Failure_Attribution_Record to V2-M5 (waves 23 to 28, only if V2-M5 ran), to V2-M2 and V2-M3 (waves 4 to 16), to V2-M4 (waves 17 to 22), to a new V2-M7 capture session (waves 34 to 38), or to an owner decision (stop V2 and keep V1, or authorise a new pre-registered round). A Gate 8 no-go (task 8.7, wave 45) returns to the V2-M8 tasks (waves 39 to 44) or stops, and the Gate 7 result stays valid unless a V2 artifact changed (19.15). Each return re-passes the affected waves with new Result_Records under execution rule 15 (19.13).

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.5"] },
    { "id": 1, "tasks": ["1.3", "1.4"] },
    { "id": 2, "tasks": ["1.6"] },
    { "id": 3, "tasks": ["1.7"] },
    { "id": 4, "tasks": ["2.1"] },
    { "id": 5, "tasks": ["2.2"] },
    { "id": 6, "tasks": ["2.3"] },
    { "id": 7, "tasks": ["2.4"] },
    { "id": 8, "tasks": ["2.5"] },
    { "id": 9, "tasks": ["2.6"] },
    { "id": 10, "tasks": ["2.7"] },
    { "id": 11, "tasks": ["3.1", "3.2"] },
    { "id": 12, "tasks": ["3.3"] },
    { "id": 13, "tasks": ["3.4"] },
    { "id": 14, "tasks": ["3.5"] },
    { "id": 15, "tasks": ["3.6"] },
    { "id": 16, "tasks": ["3.7"] },
    { "id": 17, "tasks": ["4.1"] },
    { "id": 18, "tasks": ["4.2", "4.3"] },
    { "id": 19, "tasks": ["4.4"] },
    { "id": 20, "tasks": ["4.5"] },
    { "id": 21, "tasks": ["4.6"] },
    { "id": 22, "tasks": ["4.7"] },
    { "id": 23, "tasks": ["5.1"] },
    { "id": 24, "tasks": ["5.2"] },
    { "id": 25, "tasks": ["5.3"] },
    { "id": 26, "tasks": ["5.4"] },
    { "id": 27, "tasks": ["5.5"] },
    { "id": 28, "tasks": ["5.6"] },
    { "id": 29, "tasks": ["6.1"] },
    { "id": 30, "tasks": ["6.2"] },
    { "id": 31, "tasks": ["6.3", "6.4"] },
    { "id": 32, "tasks": ["6.5"] },
    { "id": 33, "tasks": ["6.6"] },
    { "id": 34, "tasks": ["7.1"] },
    { "id": 35, "tasks": ["7.2"] },
    { "id": 36, "tasks": ["7.3", "7.4"] },
    { "id": 37, "tasks": ["7.5", "7.6"] },
    { "id": 38, "tasks": ["7.7"] },
    { "id": 39, "tasks": ["8.1"] },
    { "id": 40, "tasks": ["8.2"] },
    { "id": 41, "tasks": ["8.3"] },
    { "id": 42, "tasks": ["8.4"] },
    { "id": 43, "tasks": ["8.5"] },
    { "id": 44, "tasks": ["8.6"] },
    { "id": 45, "tasks": ["8.7"] }
  ]
}
```
