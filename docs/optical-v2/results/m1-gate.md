# M1-GATE — Gate 1 decision record

| Field | Record |
| --- | --- |
| Milestone | V2-M1 |
| Decision | **no-go** |
| Route | Stop: resolve baseline first. |
| Evidence class | EC 1. Decision by reading the linked records. |
| Date and producer | 2026-11-19 KST, Codex. Owner decision fields remain pending. |
| Command and revisions | Read `baseline.md` and the records below after direct PR checks, blob hash, `git diff`, and the full pinned Node test command. Pin `ddad4473f2a30d56e033d578c7bff8263ac4a864`, M1 parent `095f70ed76cc776a46e056c6a98217adbca2aa5b`. |
| Environment, seed and sample IDs | Windows x64, Git 2.54.0.windows.1, Node v24.20.0. Seed N/A. M1-BASELINE, M1-V1-SHA256, M1-V1-DIFF, M1-V1-TESTS and O-1/O-2. |

| Input | Outcome |
| --- | --- |
| [M1-V1-SHA256](m1-v1-preservation.md#m1-v1-sha256-ec-1) | Pass on Git blobs; canonical-LF worktree regeneration check also passed. Initial Windows checkout conversion failure is documented. |
| [M1-V1-DIFF](m1-v1-preservation.md#m1-v1-diff-ec-1) | Pass, zero protected path differences. |
| [M1-V1-TESTS](m1-v1-tests.md) | Pass on the provisional `main` pin, 3,038 passed, 0 failed, 0 skipped. Known hosted CI timeouts remain open. |
| [M1-BASELINE](m1-baseline.md) | Direct PR evidence, history and baseline environment recorded. |
| [O-1 and O-2](../baseline.md#pending-owner-decisions) | Blocking. Neither decision has a dated owner record. The technical selection for this run is provisional. |
| [Artwork status](../provenance.md#artwork-and-wording) | O-5 pending. Existing trace is reference only. O-7 default recorded. |

Failed or blocking items: missing dated O-1 and O-2 decisions, and consequently no Gate 1 approval to proceed. No manual override of a regression result was used. Unrun items: V1 Task 7.2 **unevaluated**, V1 Milestone 8 **unevaluated**, and V2-M2 and later milestones. The older isolated exploratory outputs are excluded from this audit and do not count as Gate 2 evidence. The [authorization record](../provenance.md) covers V2-M1 only. No V2-M2 work product was created on this branch or imported during the audit. The target appearance remains one continuous square. Any later V2 comparison must use the label **unevaluated V1 baseline (synthetic)** while the required V1 results are absent.
