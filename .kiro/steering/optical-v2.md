---
inclusion: manual
---

# QRoker Optical V2 feasibility and implementation guidance

Use this steering only when the user requests the square Composite Code V2 work. Current tracker: https://github.com/goalan70-eng/qroker-kiroween/issues/16 . Its draft plan is on branch `docs/composite-code-v2-plan-20261116`, not necessarily on the current working branch.

## User-approved goals

- Each of the 52 permanently printed cards contributes a fixed optical piece at its allowed suit-specific inward corner. Four valid 2×2 pieces should visually form **one square**; only the small `Central_Void` created by rounded physical card corners may be intentionally empty. Real print seams and quiet-zone needs require measurement.
- The **official scanner** must return neither a successful reading, card IDs nor `Hidden_Sum` for just 1–3 pieces. With four pieces, reject invalid arrangements, duplicates, damaged/ambiguous readings and wrong target vertices. This is an atomic application result policy, **not** cryptographic secrecy; independent fragments may remain reverse-engineerable.
- Make marker-only patterns difficult for an ordinary person to distinguish at typical playing distance; do not reduce printable cell size blindly or claim information-theoretic concealment.
- The user's specific black-and-white Joker artwork is optional decoration **inside the recognition mark**, assembled across four pieces. Do not treat it as a 53rd card. Simplify or remove it if it harms detection, wrong-acceptance rate, print tolerance or valid fixed-piece symmetry. Do not invent or publish the source artwork if not available.
- Preserve the existing 0°/180° rules and suit-specific fragment layouts; ensure the same printed piece works in every legal slot/rotation. Do not assume splitting a single pre-generated QR image works for arbitrary card combinations.
- Long-term use: packaging standard QR link to an official HTTPS website; browser `getUserMedia` scans the proprietary Composite Code locally when possible; manual input and post-Guess privacy gate remain required.

## Process

1. Establish the existing V1 baseline and document open PR dependencies before changes.
2. **Prove feasibility** of fixed printing, complete-square appearance, rotation/suit symmetry and central cutout before redesigning the decoder.
3. Implement V2 only in isolated modules/branches, with decoration OFF initially. Evaluate whole-square vs atomic-four-region recognition.
4. Compare Joker OFF/ON with paired deterministic synthetic test sets; count correct, rejected and **wrong accepted** separately. Preserve every failure and seed.
5. Do not claim real phone accuracy without physical cards, independent captures and end-to-end latency evidence. Do not merge V2 into the submission game solely on aesthetic grounds.
