# Issue #10: refinement-supported candidate gate

Synthetic evidence only. No printer, physical cards, camera or phone was used, and no real recognition rate is established.

## Cause and correction

The original candidate gate compares the maximum quad inscribed in pixel-corner hull vertices with the hull area. A near-diagonal low-resolution square can have blunt staircase tips, so the inscribed quad underestimates the square before the existing edge-line fitter can run. This drops a genuine marker without a rejection record.

A fresh diagnostic of seed `4283752155`, inset 2, camera angle 45 degrees measured the BR component as follows:

| Quantity | Value |
|---|---:|
| Pixel-corner hull area | 866 |
| Inscribed quad area | 730 |
| Inscribed / hull | 0.8429561201 |
| Existing edge-line fit area | 841.7357042 |
| Fitted quad / hull | 0.9719811827 |
| Hull / fitted quad | 1.0288265018 |
| Maximum hull distance outside fitted quad | 0.4553660470 px |
| Existing allowed outside distance | 1.5 px |

`detect.ts` now tries that same edge-line refinement before dropping a full-size, non-edge-touching component whose inscribed area ratio fails 0.85. Rescue requires the fitted quad to satisfy 0.85 AND the existing hull agreement checks: area ratio 0.92..1.08 and outside distance `max(1.5, 0.04 * meanSide)`. The cached fit then passes all existing displacement, convexity, side ratio, corner angle, size, border, margin, contrast and cell-purity checks. Failed rescue remains a silent drop, preserving existing negative-image behavior. No identity or codebook information participates in this decision.

The numeric gate constants, default radius 1, minimum size and all acceptance/grouping tolerances are unchanged. `quadFitsHull` extracts the existing finite-geometry checks for reuse. The frozen codebook and generation logic are unchanged.

An initial experiment that allowed a fit without requiring its hull agreement before rescue changed two disk negatives from NOT_DETECTED to INVALID_MARKER. That variant was rejected; the final implementation requires the original hull agreement before rescue. Existing disk and other negative behavior now passes unchanged.

## Verification

The revised `geometry-45deg.test.ts` first ran against the original detector: **3 expected failures, 5 passing controls**. The failures were the pinned angle, fractional phases and the near-45 band. After the fix, all 8 tests pass with exact decoded card-set and independently summed value assertions. Existing seed, 44/46-degree, inset 1/1.5 and layout-only offset controls remain.

Executed focused checks, using one Vitest worker:

- `npx vitest run src/optical/testing/geometry-45deg.test.ts src/optical/detect.test.ts --maxWorkers=1`: **40 passed**.
- `npx vitest run src/optical/decode-group.rejection.test.ts --maxWorkers=1`: **54 passed**, including independent oracle checks and regeneration equality of the 40 historical radius-2 counterexamples.
- `npx vitest run src/optical/testing/geometry-45deg.test.ts src/optical/testing/issue-10-detector.test.ts --maxWorkers=1`: **10 passed**, including missing fragments and 2/3 inverted data modules across 44.9/45/45.1 degrees and three pixel phases.
- `npx tsc -p tsconfig.json --noEmit`: **passed**.

The parent task runs the final project-wide checks separately. No full-suite success is claimed here.

See [paired results](issue-10-detector-validation.md) and their JSON for all 876 samples. Independent valid cases improve from 225/252 correct to 252/252; pinned cases improve from 4/12 to 12/12. None of the 524 incomplete, silhouette or radius-1 two/three-bit negative samples become accepted; the 16 3x3 controls remain unchanged. This is a bounded synthetic paired experiment, not an error-rate estimate or a rerun of the historical 168,000-trial geometry sweep.

The selected 40 historical radius-2 false-acceptance examples still produce **40 false acceptances at radius 2**. At radius 1, the same deliberately corrupted selected set produces **30 rejections and 10 false acceptances**, identical before and after this detector fix. Those 10 radius-1 examples contain four or more inverted data modules. Default radius 1 narrows acceptance; it does not guarantee rejection of arbitrary large corruption. These samples must never be reported as zero false accepts overall or as an estimated operational rate.

## Reproduction and provenance

Run `npx tsx scripts/issue-10-detector-validation.ts` from the repository. Git and the local pinned commit `3ca08b9` must be available. The script loads the old detector and group decoder with `git show` into an isolated temporary directory; it never changes branches or edits production sources. Both variants use the unchanged shared fragment/codebook modules, identical images and identical layout options. Ground truth is used only for classifying results after decoding. Temporary paths are checked before cleanup.

The independent card seeds were fixed before measuring outcomes: `1816849084`, `3783386048`, `3257335870`, derived from seed `0x10decafe`. The script records source/codebook/evidence SHA256 hashes, every sample input and both outcomes in `issue-10-detector-validation.json`. Its outputs use new Issue #10 paths only; historical reports remain historical evidence. Physical registration/cut sensitivity, arbitrary blur/perspective, unseen non-marker shapes and real-camera performance remain unverified by this bounded experiment.
