# Issue #10: paired detector validation

Bounded synthetic samples only; no print, camera, phone, performance-rate or full-sweep claim.

Baseline: `3ca08b9`; seed: `0x10decafe`; new card seeds: 1816849084, 3783386048, 3257335870.

| Family | n | Before C / R / FA | After C / R / FA | Changed outcome |
|---|---:|---|---|---:|
| independent-positive | 252 | 225 / 27 / 0 | 252 / 0 / 0 | 27 |
| historical-pinned-positive | 12 | 4 / 8 / 0 | 12 / 0 / 0 | 8 |
| incomplete-physical-negative | 72 | 0 / 72 / 0 | 0 / 72 / 0 | 0 |
| 3x3-positive-control | 8 | 8 / 0 / 0 | 8 / 0 / 0 | 0 |
| 3x3-incomplete-control | 8 | 0 / 8 / 0 | 0 / 8 / 0 | 0 |
| silhouette-detector-negative | 252 | 0 / 252 / 0 | 0 / 252 / 0 | 0 |
| radius1-corrupted-negative | 192 | 0 / 192 / 0 | 0 / 192 / 0 | 0 |
| preserved-counterexample-radius1 | 40 | 0 / 30 / 10 | 0 / 30 / 10 | 0 |
| preserved-counterexample-radius2 | 40 | 0 / 0 / 40 | 0 / 0 / 40 | 0 |

C = exact identities and sum; R = rejected; FA = accepted contrary to truth. For silhouette-only detector negatives, any detected marker is FA. Corrupted negative cases require rejection. Preserved radius-2 examples are scored against their original cards, with all false acceptances disclosed. The JSON contains every fixed input and outcome, source hashes and phases. Truth is never supplied to either reader.

Reproduce: `npx tsx scripts/issue-10-detector-validation.ts`. No historical report is regenerated.
