# Milestone 2 execution results (task 2.4)

Raw output is in `docs/optical/results/m2-test-output.txt`. All figures come from actual runs. The source, tests, thresholds, and frozen codebook were unchanged.

## Commands and exit codes

| # | Command | Exit code | Result |
|---|---|---|---|
| 1 | `npm test` (run 1) | 0 | 5 files passed, 41 passed / 1 skipped (42) |
| 2 | `npm run verify:codebook` | 0 | PASS (dId=5, dSelf=6, minDistance=5) |
| 3 | `npm run check:codebook` | 0 | Regenerated output matched codebook.v1.json byte for byte |
| 4 | `npm run verify:bound` | 0 | All claimed values matched (bound 198, d6Bound 45, d7Bound 7) |
| 5 | `npx tsc --noEmit` | 0 | No errors |
| 6 | `npm test` (run 2, reproducibility) | 0 | Same as run 1, 41 passed / 1 skipped |
| 7 | `npx vitest --run --reporter=verbose` | 0 | Same 41 passed / 1 skipped, with every test name recorded |
| 8 | `npm run verify:codebook` (second run) | 0 | PASS |

## Test counts by file (from verbose output)

| File | Passed | Skipped |
|---|---|---|
| src/optical/smoke.test.ts | 2 | 0 |
| src/optical/transforms.test.ts | 9 | 0 |
| src/optical/codebook.test.ts | 10 | 0 |
| src/optical/verify-codebook.test.ts | 19 | 1 |
| scripts/verify-bound.test.ts | 1 | 0 |
| Total | 41 | 1 (42 total) |

One test was skipped, `E. verifier template bits vs applyTransform`. The reason given in the test name is that verifyCodebook does not expose its 416 templates (the verifier was left unchanged).

## Verifier measurements (`codebook-verification.json`)

- cards 52, templates 416, pairs 86,320
- minPairDistance 5, dId 5, dSelf 6
- weight min 9, max 16
- Distance histogram: 5:136, 6:512, 7:1128, 8:2968, 9:5080, 10:8416, 11:11664, 12:13600, 13:13480, 14:11144, 15:8376, 16:5180, 17:2808, 18:1188, 19:464, 20:104, 21:64, 22:8
- Histogram total = 86,320 (summed in PowerShell, matches pairs).
- All 13 verifier checks returned ok and failures was empty.

## metadataAgreement (copied from JSON)

| Field | stored | measured | match |
|---|---|---|---|
| dId | 5 | 5 | true |
| dSelf | 6 | 6 | true |
| weightRange | [9, 16] | [9, 16] | true |
| sha256 | a6974f3491efbd5aec87bb00807c113962015838c9b74d0df9863f38fdc29a74 | a6974f3491efbd5aec87bb00807c113962015838c9b74d0df9863f38fdc29a74 | true |

## Artifact reproducibility (two verify:codebook runs)

| File | First SHA256 | Second SHA256 | Identical |
|---|---|---|---|
| codebook-verification.json | B331EC5E5499BA6831A23880F977A6C7EB2219323F15B8FEDD0BD819DAF1EF36 | Same | Yes |
| codebook-verification.md | 5698693E994EA3229FE30DDC63A160A9A1C9AC0F13B117A0040CA93D5068EE66 | Same | Yes |

## Frozen file hash (`src/optical/codebook.v1.json`)

- Before the run: 515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4
- After the run: 515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4
- Unchanged.

## Negative cases and rejection checks (verify-codebook.test.ts, all passed)

Expected check IDs are taken from the test names.

| Case | Rejection check ID |
|---|---|
| 1. Identical base patterns | base-distinct |
| 2. Substitute a differently transformed template from another card | min-distance, d-id |
| 3. Flip 1–3 bits in a template from another card | min-distance (distance < 5) |
| 4. Weight outside the range | weight-range |
| 5. R180/Fh-symmetric pattern (weight within range) | d-self / min-distance |
| 6. Incorrect card key set/order | card-keys |
| 7. Invalid pattern value | pattern-values |
| 8. False metadata | metadata-agreement or sha256 |
| 9. Non-object input | shape (no exception) |
| 10. Deep-frozen input | No exception, no mutation |
| 11. Random 1–4-bit corruption property | verifier.ok matches the brute-force verdict |

Group D also showed that a corrupted temporary copy reports failure while the frozen file stays intact. Unparseable input also reports failure without throwing.

## Verified results and remaining assumptions

### Verified by the executed tests and scripts
- 52 keys, canonical order, 25-bit values, 52 distinct base patterns, and weights 9–16.
- All 416 templates are distinct. All 86,320 pairs have Hamming distance at least 5 (dId=5, dSelf=6). The independent verifier's measurements match the stored metadata.
- The eight D4 cell maps are bijections on 25 cells, closed under composition and equivalent to the matrix operations.
- At pattern level, the second fragment, generated with R180 for ♥♦ and Fh for ♣♠, differs from P by at least 5 bits and belongs to the same orbit.
- The generator is deterministic, matches the frozen file byte for byte, and throws without returning partial results if the attempt limit is exceeded.
- Exhaustive enumeration of 2^25 patterns reproduced the claimed capacity bounds (198 / 45 / 7), described as upper bounds in this milestone report.
- The verifier imports only `node:crypto`, and the CLI does not import the generator module (test B).
- The report records that the 11 negative cases above passed their expected rejection checks. Both `npm test` runs gave identical results.

### Remaining assumptions
- Image decoding (rasterization, binarization, and grid sampling) was unverified.
- Pixel-level suit-layer symmetry of rasterized fragments was unverified. Only pattern-level symmetry was tested.
- Real cameras, lighting, blur, and perspective distortion were untested.
- The independent verifier shares no code with the generator, but both were written within the same project. A common misunderstanding could affect both.
- Test E was skipped. This run did not directly compare the bits of the verifier's 416 templates with `applyTransform`.
- The final `bruteTrue >= 0` assertion in the case 11 property is always true and provides no evidence. The substantive assertion is `verifier.ok === brute.ok`.

## Working-tree git status (no commit)

```
 M .kiro/specs/qroker-game/tasks.md
 M .kiro/specs/qroker-game/tasks.meta.json
 M docs/optical/results/bound.json
 M docs/optical/results/bound.md
 M package.json
?? docs/optical/results/codebook-verification.json
?? docs/optical/results/codebook-verification.md
?? docs/optical/results/m2-report.md
?? docs/optical/results/m2-test-output.txt
?? scripts/verify-codebook.ts
?? src/optical/verify-codebook.test.ts
?? src/optical/verify-codebook.ts
```

The changes to `bound.json` and `bound.md` came from `verify:bound` rewriting those files. The bound.md diff is one timing line (1.9 s → 1.7 s).
