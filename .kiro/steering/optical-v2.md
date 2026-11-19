---
inclusion: manual
---
# QRoker Optical V2 guidance (planning phase)
Load only with `#optical-v2` when working on the Optical V2 proposal. Nothing here is implemented or approved. Details live in the spec; read only the section you need (the files are large, so they are not embedded here).

## Where the details are
- Spec (planning only): `.kiro/specs/qroker-optical-v2/` (`design.md`, `requirements.md`, `tasks.md`). It exists on the branch `docs/optical-v2-kiro-spec-20261119`, and untracked in some working trees.
- Draft plan and Joker reference are on PR #18's branch `docs/composite-code-v2-plan-20261116`, not on every branch: `docs/optical/COMPOSITE-V2-PLAN.md`, `docs/optical/assets/joker-four-piece-reference.svg`.
- Before any task: `requirements.md` Appendix E (open points by class, prioritized owner decisions) and `tasks.md` Prerequisites. Only owner decisions O-1 and O-2 plus a written per-milestone authorization must exist before implementation starts (Requirement 19.3).

## Goals (owner-stated)
- Four fixed fragments, one per card of a valid 2x2 Quad_Group, assemble into one visually continuous square Composite Code. Only the small Central_Void left by rounded card corners is intentionally empty.
- Atomic recognition: the official scanner returns a success, card IDs or Hidden_Sum only when all four valid fragments are present. 1 to 3 pieces, duplicates, invalid arrangements, damaged or ambiguous readings and wrong target vertices are rejected. This is a result policy, not secrecy; printed ranks, suits and static patterns stay readable.
- The 52-card deck (no Joker card), the suit-specific Fragment_Layout and the 0 and 180 degree rules stay unchanged; one printed piece must work in every legal slot and rotation.
- The user's black-and-white Joker artwork is optional decoration inside the assembled marker, never a 53rd card. Simplify or remove it if it hurts recognition, wrong-accept rate, print tolerance or symmetry. The SVG is a visual trace, not an optical code, and has no Central_Void applied. Do not store or publish the original artwork without the owner's rights decision (O-5).

## Geometry prerequisite (hypothesis HYP-1, unverified)
- The same printed piece appears in two opposite slots (0 and 180 degrees), so the shared layer (frame, decoration, void) likely needs 180-degree point symmetry; left-right mirror symmetry alone is not enough. Whether the Joker satisfies it is unknown. V2-M2 must settle it by an independent computation before generator, detector or decoration work is planned in detail.

## Isolation and validation
- V1 stays untouched until V2 is independently validated: no change under `src/optical/**`, frozen codebook SHA256 unchanged, V1 tests unchanged. V2 goes in separate modules and versioned artifacts; `src/game` does not import V2 before V2-M8 is separately approved.
- Milestones V2-M1 to V2-M8 run in order with go/no-go gates and per-milestone owner authorization. Keep every task unchecked until a Result_Record with an evidence class exists.
- Evidence classes: 1 model/geometry, 2 synthetic raster, 3 headless browser, 4 real print and phone. Report each result under exactly one class; synthetic results never support a real-camera claim.
- Count correct, rejected and wrong-accepted separately; keep every failed trial with its seed; zero observed errors in n trials is not a guarantee (95% upper bound 1 - 0.05^(1/n)). PR #18's thresholds (95% in 100 shots, zero wrong accepts, 5 seconds) are proposals pending owner approval (O-4).
- Do not touch game rules, scoring, the draw rule or the AI from V2 work. Do not apply or rely on Steering or Hooks changes from other branches.
