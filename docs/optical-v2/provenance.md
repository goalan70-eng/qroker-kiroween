# V2-M1 provenance and records

## Authorization and contributors

- **Owner goal.** The owner wrote on 2026-11-19 KST, “Begin the Composite Code V2 remake by executing V2-M1 only,” and named the Kiro Design-First spec as the authority. This authorizes the baseline audit. The O-1 and O-2 choices remain pending in [baseline.md](baseline.md).
- **Approved V1 specification.** The historical V1 specification and evidence retain their existing authorship and scope. A task checkbox or CI result does not identify a producer. Historical results with no identified producer stay unattributed.
- **PR #18 proposal.** The planning document and its traced reference were prepared through ChatGPT as stated in PR #18. That source remains at `7baefca3cf8d69c6bb52f989afaae3892f15063b`. The Kiro Design-First files are the owner's designated Kiro planning artifacts at `095f70ed76cc776a46e056c6a98217adbca2aa5b`. No historical session transcripts were audited.
- **Codex result records.** Codex produced this baseline audit, documentation and read-only Git preservation script. Supporting tools were Git, GitHub's authenticated API, Node.js, npm and Vitest. No paid API was called.
- **AI-derived hypothesis.** HYP-1 and the hand-derived placement table remain **hypothesis, unverified**. An earlier local exploratory worktree predates this authorization and was left isolated. Its files and conclusions were excluded from the M1 artifacts and acceptance checks. This milestone authorized no geometry or recognition work.

## Artwork and wording

**Owner goal.** The original picture is owner-supplied. Its copyright and reuse/publication permission were not established during M1. Ownership of a copy or access to the trace does not establish publication rights. O-5 and OP-12.5 remain open. Keep the original private. The SVG already exists in the inherited PR #18 ancestry. M1 adds no artwork, creates no new copy in Git and uses the existing SVG as a visual reference only. It supplies no operational code, `Valid_Input` or `Oracle` entry. No permission for later publication is recorded.

O-7 uses the spec's non-blocking default wording, **inside the assembled marker**. No new owner confirmation is recorded. The one continuous square remains a target appearance.

## Evidence conventions for Gate 1

| Open point | M1 convention |
| --- | --- |
| OP-18.2 | Independence means checking the protected Git blobs and diffs using Git and Node outside the optical implementation, and executing the unchanged regression suite on a separate checkout of the pin. The script checks itself against committed scratch fixtures with independently known expected outcomes. Both checks and records are by Codex. |
| OP-18.3 | A repeat reports and compares file/test counts, pass/fail/skip counts, failing identifiers and failure categories. Wall-clock time may vary. If counts differ under comparable conditions, preserve the conflicting record and investigate under Requirement 18.12. |
| OP-18.4 | Deterministic metadata/hash checks and the full fixture-driven test command have no single top-level seed. Record `N/A` and identify fixture/test sources. Per-test seeds remain defined in the pinned sources. |
| OP-19.2 | Owner authorization is here, dated O-1/O-2 records belong in [baseline.md](baseline.md), repository facts and contradiction entries in [m1-baseline.md](results/m1-baseline.md), Gate decision and route in [m1-gate.md](results/m1-gate.md). The spec appendices remain the register for unexecuted work. |

Each reported result carries one evidence class. Git inspection uses EC 1 per the requirements' A-1 convention. The pinned Node suite uses EC 2. Physical trials require EC 4. Read the files under [results/](results/) for commands, revisions, outcomes and unrun items.
