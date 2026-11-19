# M1-BASELINE — repository observation and source corrections

EC 1. Producer Codex. Date 2026-11-19 KST. Environment Git `2.54.0.windows.1` on Windows x64 and the authenticated GitHub connector. Seed N/A. Samples are the named PRs, branch refs, and V1 evidence paths below. Commands: GitHub REST `GET /repos/goalan70-eng/qroker-kiroween` and its `/branches/{name}`, `/pulls/{number}`, `/issues/16`, `/actions/runs` and `/actions/runs/{id}/jobs` endpoints, job log retrieval, and local `git log`, `git merge-base`, `git cat-file` and `git diff --name-status`.

## Ref and PR observations

The older states in the Kiro spec were **inferred from refs/pull/N/merge refs and commit history, not read from the GitHub API (repository is private)**, per Requirement 1.8. The present PR and repository facts are **directly read on 2026-11-19** using authorized access.

| Ref or observation | Result | Evidence label |
| --- | --- | --- |
| Repository visibility; #16 | Private. #16 is an open issue. | Directly read on 2026-11-19. |
| `main` | `ddad4473f2a30d56e033d578c7bff8263ac4a864`, includes #12. Provisional audit pin. | Directly read on 2026-11-19. |
| `docs/optical-v2-kiro-spec-20261119` | `095f70ed76cc776a46e056c6a98217adbca2aa5b`, M1 branch parent. | Directly read on 2026-11-19. |
| `docs/composite-code-v2-plan-20261116` | `7baefca3cf8d69c6bb52f989afaae3892f15063b`, #18 plan and trace. | Directly read on 2026-11-19. |
| Spec branch ancestry | #18 head is the spec branch's parent. Spec branch and `main` meet at `3ca08b98ce15a876cf4c7480f465e8892ce1a136`. Neither #14 nor #23 is an ancestor of the spec branch. | Inferred from refs and commit history. |
| PR #14 stack, alternative only | `main` `ddad4473f2a30d56e033d578c7bff8263ac4a864` includes #12 head `a1507bd8870287f4bfeaf278eb4d4cad5f049ab1`. Clean score base `b34415ab4314e64b654df6fb4c0e3230991d3226`. Optical head `a2d3bf3b93b0f62cfb43ef01869f1b2e2e241eca`. Its detector and optical tests differ from the audit pin. | Directly read on 2026-11-19 by API and Git tree diff. |
| Codebook hash | `515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4`. See [preservation](m1-v1-preservation.md). | Directly read on 2026-11-19. |
| V1 status | Task 7.2, full sweep, **unevaluated**. Milestone 8, print and physical, **unevaluated**. [Local and remote test observations](m1-v1-tests.md). | Directly read on 2026-11-19 from pinned evidence and current run logs. |

| PR | State from API | Head | Base branch | Difference from spec snapshot |
| --- | --- | --- | --- | --- |
| [#12](https://github.com/goalan70-eng/qroker-kiroween/pull/12) | Merged | `a1507bd` | `main` | Merged, as the spec already observed. |
| [#13](https://github.com/goalan70-eng/qroker-kiroween/pull/13) | Closed without merge | `a07c01d` | `main` | Spec describes the earlier scoring stack. Original PR since superseded by #23. |
| [#14](https://github.com/goalan70-eng/qroker-kiroween/pull/14) | Open draft | `a2d3bf3` | `codex/issue-9-score-table-clean` | Previous base described as #13. Current base is #23's head branch. |
| [#15](https://github.com/goalan70-eng/qroker-kiroween/pull/15) | Open draft | `9c0ed80` | `codex/issue-10-optical-validation` | Still based on #14. |
| [#17](https://github.com/goalan70-eng/qroker-kiroween/pull/17) | Open draft | `7fc9e45` | `main` | Still unmerged. Recorded here only as repository metadata, per 1.8. |
| [#18](https://github.com/goalan70-eng/qroker-kiroween/pull/18) | Open draft | `7baefca` | `main` | Draft flag confirmed directly. |
| [#21](https://github.com/goalan70-eng/qroker-kiroween/pull/21) | Open draft | `f0b8947` | `codex/issue-9-score-table-clean` | Clean score branch is its current base. |
| [#22](https://github.com/goalan70-eng/qroker-kiroween/pull/22) | Open draft | `a99c06f` | `feat/sim-parameterized-hand-and-code-limit-20261118` | #22 targets #21's branch. Their current merge base is `3d24ef147cfd2a8b858d061ef07b3d8d81e498a1`. |
| [#23](https://github.com/goalan70-eng/qroker-kiroween/pull/23) | Open draft | `b34415a` | `main` | New since snapshot. Original score review scope from before the mixed commit. |

All eight specified PR records were read. Failed items: none for PR state retrieval. CI failures are recorded in [M1-V1-TESTS](m1-v1-tests.md). Unrun: no merge or combined-branch experiment was executed. Neither PR #23 nor any game experiment is a V2 dependency.

## Contradiction and staleness register addendum

The Kiro specification and PR #18 retain their source-era text. Codex recorded the observations and qualifications below on 2026-11-19. Repository facts use Git or authenticated PR metadata as the basis. Open design differences retain the original spec's treatment.

| Sources and source wording | Current observation or controlling wording | Resolution status and basis |
| --- | --- | --- |
| V2 `design.md` Repository State: “Local branch … at b34415a, clean.” `tasks.md`: “The planning files are untracked.” | Git records the four spec files in commit `095f70e` on `docs/optical-v2-kiro-spec-20261119`. The old score branch now points to `a07c01d`. | Historical snapshot, corrected for this audit by Codex from branch refs and commit parents. |
| V2 `requirements.md` provenance: PR #18 plan “not on this branch”. V2 `design.md` likewise says “not on this branch” for the plan and trace. | `git ls-tree` at `095f70e` contains both files. `7baefca` is its parent. | Historical statement, corrected for this audit by Codex from the tree and history. |
| V2 `design.md` PR #13 “Stacked on PR #12's head”; PR #14 “Stacked on #13.” PR #18 plan §6: “기존 Draft PR #12–#15”. | API shows #12 merged, #13 closed without merge, #23 open draft, and #14 targeting `codex/issue-9-score-table-clean`. #15 still targets #14. | Superseded repository snapshot, corrected for this audit by Codex from API records. |
| V2 `design.md` PR #21/#22 “siblings from PR #12's head.” | API shows #21 targets the clean score branch and #22 targets #21's head branch. | Historical topology, corrected for this audit by Codex from Git and PR metadata. |
| V2 `design.md` Evidence Limits: “the GitHub API and draft flags could not be read.” | Repository remains private. The authorized API returned status and draft flags for all listed PRs. | This run resolves the access gap only for the current observation. Codex preserves the earlier interpretation as inferred. |
| V1 `OPTICAL-STATUS.md`: “In progress” and “The sweep has not been run.” V1 `tasks.md`: “The 363,000-trial robustness sweep … has not been executed.” | Both sources support **unevaluated** for V1 Task 7.2. Status calls out scaffolding while the task stays unchecked. V1 Milestone 8 is **unevaluated**. | Shared interpretation recorded by Codex from pinned V1 sources. No acceptance status promoted. |
| PR #18 §4 M2 proposes “후보 A/B의 작은 종합 이미지를 동일 조건으로 생성하고 코드 신원·합계 비교”; V2 `design.md`: “This design places the comparison in V2-M4.” | The owner designated the Kiro Design-First plan. The PR #18 M2 proposal is overridden for sequence. This M1 records the baseline only. | Codex applied the owner's source ordering. Comparison remains planned. |
| PR #18 §0 uses “인식 마크 내부”; V2 `design.md` C10 contrasts “inside the recognition mark” and “inside the assembled marker.” | O-7 defaults to “inside the assembled marker.” See [provenance](../provenance.md). | Existing default applied by Codex. Owner confirmation remains optional and unrecorded. |
| V2 `design.md`: “V1 design.md lists fewer result kinds than the code”; pinned V1 `decode-group.ts` includes `INVALID_MARKER` and `AMBIGUOUS_FRAGMENT` as documented in V1 `OPTICAL-STATUS.md` c.9. | The API/document distinction remains in the baseline. V2 result kinds are proposals. | Open design comparison, recorded by Codex from the pinned source. No runtime or spec correction made. |

No V2 empirical comparison was run. The reference label for any later V2 comparison is **unevaluated V1 baseline (synthetic)**. One continuous square remains the target appearance.
