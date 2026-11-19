# Optical V2 policy transition, 2026-11-19

This addendum updates the active V2 plan under the owner's written decision of 2026-11-19 KST. It applies the owner-first source ordering of the [Kiro Design-First specification](../../.kiro/specs/qroker-optical-v2/requirements.md). The Kiro source documents, [original M1 audit](baseline.md), [provenance](provenance.md), and [original Gate 1 record](results/m1-gate.md) retain their original wording and history. The [R2 Gate 1 no-go reassessment](results/m1-gate-reassessment-2026-11-19.md) is retained as history; the [latest R3 Gate 1 GO record](results/m1-gate-r3-2026-11-19.md) documents the subsequent owner O-1 approval and limited feasibility-track decision. Codex recorded the transition and performed the reassessment.

## Owner decision record

| Decision | Date | Status and policy |
| --- | --- | --- |
| O-2 | 2026-11-19 KST | **Decided by the owner.** Deprecate V1 for future development and make V2 the primary optical development track. Cancel routine V1 optimization, the full Task 7.2 sweep, and Milestone 8 physical validation. Future V1 work is limited to a specific migration or regression-analysis need. Preserve V1 source, frozen codebook, and historical evidence. Retain V1 until V2 is validated and migration requirements are satisfied. |
| O-1 | 2026-11-19 KST | **Approved by the owner** in response to the earlier recommended pin: `ddad4473f2a30d56e033d578c7bff8263ac4a864` is the immutable **historical V1 reference** for read-only comparison and migration analysis. This does not authorize renewed V1 development or certify V1 physical readiness. See the [R3 owner-decision and Gate 1 record](results/m1-gate-r3-2026-11-19.md). |
| O-9 | Pending | The development deprecation sets direction. Compatibility and operational retirement still need the later O-9 decision under Requirement 6.4. Removal depends on V2 validation, satisfaction of migration requirements and the applicable retirement decision. |

## Revised prerequisites and evidence

| Existing plan reference | Active interpretation after 2026-11-19 |
| --- | --- |
| Requirements 1.2, 1.10, 1.12, the Gate 1 diagram, and tasks 1.1, 1.7 and 2 | The dated O-2 record above replaces the old choice between finishing V1 first and continuing concurrent V1 development. The conditional “finish V1 first” branch of 1.12 does not apply. Completion of V1 Task 7.2 or Milestone 8 is removed from V2 entry and progression. |
| Requirements 1.2 and 19.2–19.4, 19.11 | V2-M2 remains the next proposed milestone. Entry requires explicit dated O-1 approval, this dated O-2 decision, a dated Gate 1 `go`, and separate written owner authorization naming V2-M2. Pending or failed gate inputs stay visible. |
| Requirements 1.3–1.9 and 6.10 | Continue codebook hash, protected-file diff and pinned regression checks at the applicable gates. V1 Task 7.2 and Milestone 8 remain **unevaluated**. The cancelled work does not satisfy the V1 Task 7 pass criterion. Use **unevaluated V1 baseline (synthetic)** for V2 comparisons while the referenced V1 evidence is missing. |
| Requirements 11.2 and 14.8–14.9, 14.13 | Keep the specified matched-sample comparison to the frozen V1 reference where the plan uses it for regression analysis. Use matching sample IDs and seeds. This calls existing V1 as a control and does not restart V1 development or require completion of its release programme. |

## V2 acceptance continues under the Kiro plan

- **Correctness.** Keep the independent oracle, exact card IDs and sum for valid four-piece groups, the atomic result policy, and rejection for partial, invalid, ambiguous or out-of-target inputs as specified. Candidate and control outputs are evidence inputs. V2 must meet its own criteria. Requirements 7–11.
- **Synthetic robustness.** Retain preregistered conditions and seeds, separate rejection and wrong-accept counts, and preserve failed samples. Keep decoration comparison and its gate rules where applicable. A synthetic run remains EC 2. Requirements 11–14 and 18.
- **Physical acceptance.** V2-M7 still requires actual prints and phone captures, preregistered O-4 thresholds, independent capture accounting, negative scenes, and actual seam, cut, registration, flip and show-through checks. References to V1 physical test *procedures* apply to V2 prints. Prior completion of those procedures for V1 is unnecessary. V2-M8 retains its separate authorization and real-phone end-to-end requirement. Requirements 16–17.

**Current Gate 1 status (R3, 2026-11-19 KST): GO for eligibility to request V2-M2**, following the dated O-1 and O-2 decisions and the earlier passing local baseline checks. Historical no-go decisions and unresolved hosted CI timeouts remain visible. This status is **not** V2-M2 authorization, not a merge/release approval, and not evidence of a completed V2 marker or reader. The intended continuous square is still a target appearance; all later milestones remain proposed.
