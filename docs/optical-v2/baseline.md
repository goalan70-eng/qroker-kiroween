# Optical V2 M1 baseline audit

**Owner goal.** The owner authorized V2-M1 on 2026-11-19 KST. The Kiro Design-First specification is the working plan and its V2-M1 maps to M0 in the PR #18 proposal. Gate 1 is recorded in [m1-gate.md](results/m1-gate.md). The target appearance is one continuous square. Its measurements belong to later milestones.

## Exact pin and reproduction

The provisional audit pin is `main` at `ddad4473f2a30d56e033d578c7bff8263ac4a864`. Approval of that pin under O-1 is pending. The M1 worktree is based on the [Kiro spec branch at `095f70e`](https://github.com/goalan70-eng/qroker-kiroween/tree/095f70ed76cc776a46e056c6a98217adbca2aa5b). Its ancestry includes the [PR #18 reference at `7baefca`](https://github.com/goalan70-eng/qroker-kiroween/tree/7baefca3cf8d69c6bb52f989afaae3892f15063b). Their merge base with current `main` is `3ca08b98ce15a876cf4c7480f465e8892ce1a136`. The audit executes the exact `main` revision in a separate detached worktree. See [observed refs, PR states, and corrections](results/m1-baseline.md).

Environment: Windows x64, Node.js `v24.20.0`, npm `11.19.0`, Vitest `5.1.0` and 12 logical processors visible to Node. `test:ci` uses four workers. Reproduce from an existing clone with the commit available, using a new destination for the detached worktree:

```console
git -c core.autocrlf=false worktree add --detach ../qroker-v1-m1-repro ddad4473f2a30d56e033d578c7bff8263ac4a864
cd ../qroker-v1-m1-repro
npm ci --no-audit --no-fund
npm run check:codebook
npm run test:ci -- --reporter=default --reporter=json --outputFile=test-results/m1-main-vitest.json
```

Use [the test record](results/m1-v1-tests.md) for outcomes and failure classification. Use [the preservation record](results/m1-v1-preservation.md) for commit-blob SHA-256 and path-scope evidence. The preservation script can be rerun against any evaluated commit from the M1 worktree.

## Scope of evidence

- **Approved V1 specification.** The existing Node suites exercise the frozen codebook, rendering and transforms, synthetic marker detection, fragment and four-card group decoding, rejection and reference checking, and synthetic physical geometry. Game unit tests also run as part of the repository-wide command.
- **Approved V1 specification.** V1 Task 7.2, the 363,000-trial sweep, is **unevaluated**. V1 Milestone 8, print and physical, is **unevaluated**. The V1 Task 7 pass criterion remains unevaluated. Target selection, print and cut registration, opacity and actual phone recognition and latency require separate evidence. Use the label **unevaluated V1 baseline (synthetic)** for later V2 comparisons.
- **PR #18 proposal.** PR #14 is a distinct detector proposal with bounded synthetic results and print/photo preparation. Its proposed detector revision is outside the chosen audit run. No A/B result was generated in M1.
- **Owner goal.** The proposed assembled marker uses a custom format outside ISO 18004. It requires no standard QR scanner. Its output policy provides no cryptographic secrecy. The printed ranks and suits remain visible.

## Pending owner decisions

| ID | Status and deadline | Codex recommendation, 2026-11-19 | Evidence to revisit |
| --- | --- | --- | --- |
| O-1 | Pending, no dated owner decision. P0, Gate 1 and V2-M2, Requirements 1.1–1.2. | Approve the exact `main` pin audited here. It is the merged revision and provides a V1 reference independent of the unmerged PR stack. | If the owner wants the PR #14 detector, pin every member of that stack and rerun the preservation and test gates against a V2 review branch with identical protected content. |
| O-2 | Pending, no dated owner decision. P0, Gate 1 and V2-M2, Requirements 1.2, 1.10 and 1.12. | Run the V2 research in parallel with V1, with the exact label **unevaluated V1 baseline (synthetic)**. The next authorized milestone would evaluate feasibility separately from performance claims. | If the owner chooses to finish V1 first, record dated results for V1 Task 7.2 and Milestone 8 as named in that decision, or a later dated owner change to O-2. |

These recommendations are Codex assessments. Approval of O-1 and O-2 requires dated owner records. The [provenance record](provenance.md) covers O-5, O-7 and the evidence rules.
