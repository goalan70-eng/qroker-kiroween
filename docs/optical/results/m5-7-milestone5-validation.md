# M5.7 Milestone 5 final validation report

**Synthetic images, not real cameras.** Every result in this report comes from images rasterized and warped in software, from the test support code in `src/optical/testing/`, and from synthetic degradation models. No real printed card, printer, cutter, paper, flip or camera was involved. These results do not measure or guarantee real-camera performance. Real printing and photographing results are recorded separately (Requirement 12.7, 15.9) and belong to Milestone 8; none exist yet.

Raw command output (wall-clock fields and the absolute repository path normalized, nothing else edited):

| File | Content |
| --- | --- |
| `m5-7-tsc-output.txt` | `npx tsc --noEmit`, exit code 0, no diagnostics |
| `m5-7-test-ci-output.txt` | `npm run test:ci`, exit code 0, 20 files, 433 tests, per-file table |
| `m5-7-codebook-output.txt` | `npm run check:codebook` and `npm run verify:codebook`, exit code 0 each, frozen SHA256 |
| `m5-7-verify-geometry-output.txt` | `npm run verify:geometry`, exit code 0, all checks passed |
| `m5-7-decode-group-648-output.txt` | focused 648-image test with its counts line |

Environment: Node 24, Windows/PowerShell, vitest 5.1.0, HEAD `b57d62e` (tasks 5.1 to 5.6 committed). Before the suite was run, the machine was checked: no sweep, analysis or vitest process was running (the only node processes were the desktop assistant runtime and two idle MCP servers, a few CPU seconds in total) and the CPU counter read 9 to 13%. The machine was therefore not loaded and no test timed out. No production code, threshold, existing test assertion, geometry value, gameplay rule or the frozen codebook was changed for this task. The 168,000-trial sweep was not re-run; its stored results were only read and checked by `npm run verify:geometry`.

## A. Command results

| Command | Exit code | Result |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | no output, no diagnostics |
| `npm run test:ci` (`vitest --run --maxWorkers=4`), run once | 0 | 20 files passed, 433 tests passed, 0 failed, 0 skipped |
| `npm run check:codebook` | 0 | regenerated codebook is byte-identical to `codebook.v1.json` |
| `npm run verify:codebook` | 0 | independent verifier PASS (dId = 5, dSelf = 6, minDistance = 5) |
| `npm run verify:geometry` | 0 | 32 PASS lines, no FAIL line, "all checks passed" (824 cells, 168,000 trials, frozen codebook hash unchanged) |
| `npx vitest --run src/optical/decode-group.test.ts -t "648 images"` | 0 | 1 passed, 43 deselected; counts line below |

Counts line printed by the focused test (`decode-group.test.ts`, section "2. all 81 observed arrangements x 8 image transforms", test "648 images: IDENTIFIED, right cards/sum/interpretation count, reflection 260 / 260 / 128"; the test also asserts these values with `toEqual`):

```
decode-group exhaustive summary: {"images":648,"NOT_REFLECTED":260,"REFLECTED":260,"AMBIGUOUS":128,"interp2":520,"interp4":128}
```

| Quantity | Value |
| --- | --- |
| observed arrangements x image transforms | 81 x 8 = 648 images |
| NOT_REFLECTED / REFLECTED / AMBIGUOUS | 260 / 260 / 128 |
| result carries 2 interpretations / 4 interpretations | 520 / 128 (determined / ambiguous: 520 / 128) |

The same line appears in the full `test:ci` output.

Failures: none in any command. No rerun of any test file was needed (no timeout occurred), so there is no second outcome to record.

Per-file test counts (from the JSON report of the single `test:ci` run; the same table is at the end of `m5-7-test-ci-output.txt`):

| Test file | Tests |
| --- | --- |
| `scripts/render-samples.test.ts` | 7 |
| `scripts/verify-bound.test.ts` | 1 |
| `src/optical/codebook.test.ts` | 10 |
| `src/optical/decode-fragment.bitflip.test.ts` | 21 |
| `src/optical/decode-fragment.test.ts` | 29 |
| `src/optical/decode-group.properties.test.ts` | 23 |
| `src/optical/decode-group.test.ts` | 44 |
| `src/optical/detect.test.ts` | 32 |
| `src/optical/fragments.test.ts` | 25 |
| `src/optical/reference-check.test.ts` | 32 |
| `src/optical/render.test.ts` | 32 |
| `src/optical/smoke.test.ts` | 2 |
| `src/optical/testing/geometry-45deg.test.ts` | 8 |
| `src/optical/testing/geometry-design.test.ts` | 17 |
| `src/optical/testing/geometry-report.test.ts` | 9 |
| `src/optical/testing/geometry-trial.test.ts` | 14 |
| `src/optical/testing/physical-card.duplex.test.ts` | 33 |
| `src/optical/testing/physical-card.test.ts` | 63 |
| `src/optical/transforms.test.ts` | 9 |
| `src/optical/verify-codebook.test.ts` | 22 |
| **Total** | **433** |

Count history: the baseline before Milestone 5 was 11 files and 190 tests (`m4-4-report.md`). Earlier Milestone 5 reports recorded 289 (5.3), 351 (5.4) and 385 (5.5) tests, and `m5-6-test-suite-stability.md` recorded 431 tests in 20 files. This run counts 433 tests in the same 20 files, and `physical-card.test.ts` has 63 tests where `m5-4-physical-card.md` recorded 62. The two additional tests since the 431 measurement were not traced to a specific commit in this task.

## B. Milestone 5 acceptance criteria against evidence

Source of the criteria: `tasks.md`, task 5 ("Acceptance criteria" and "Tests (Properties 20, 23, 25, 26, 14 second part)"), the physical-geometry sub-tasks 5.4 to 5.6, and Requirement 12.7 for this sub-task. Verdicts: MET, MET WITH LIMITATION, NOT MET. All evidence is synthetic.

### B.1 Summary

| # | Criterion | Verdict |
| --- | --- | --- |
| 1 | Four-card identification and Hidden_Sum correctness (all 648 images, boundary sums 4 and 52, 300 random groups) | MET |
| 2 | Reflection classification and interpretation counts (260 / 260 / 128, 520 / 128) | MET |
| 3 | Reference check: REFERENCE_MISMATCH, no identity substitution, no board-state parameter, mirrored image keeps card IDs | MET |
| 4 | Physical rounded-card composition (task 5.4) | MET |
| 5 | Double-sided flip equivalence (task 5.5) | MET |
| 6 | Containment and Central_Void geometry (tasks 5.4 and 5.6, Requirements 15.3 to 15.5) | MET |
| 7 | Geometry experiment completeness and per-cell statistics (task 5.6) | MET WITH LIMITATION |
| 8 | Recognition and rejection performance recorded (task 5.6) | MET WITH LIMITATION |
| 9 | Test-suite stability | MET WITH LIMITATION |
| 10 | Results recorded, synthetic and real evidence kept apart (task 5.7, Requirement 12.7) | MET |

NOT MET: none. The limitations are listed in the rows below and in sections C and D; none of them was hidden or turned into a pass by changing a threshold.

### B.2 Details

**1. Four-card identification and Hidden_Sum (Properties 20, 23): MET.**
Criterion: for every observed arrangement and image transform the result is IDENTIFIED with the correct card set and a hiddenSum equal to the independent reference.

- `decode-group.test.ts`, "2. all 81 observed arrangements x 8 image transforms > 648 images: IDENTIFIED, right cards/sum/interpretation count, reflection 260 / 260 / 128": 648 of 648 IDENTIFIED with the right cards, sum (independent `referenceSum` in `testing/group-compose.ts`) and interpretation count; zero failures. Companion test: "the pattern-level oracle agrees with the decoder on every one of the 648 observations".
- Boundary sums: `decode-group.test.ts` "3. boundary sums > {A-H, A-D, A-C, A-S} sums to 4 and {K-H, K-D, K-C, K-S} to 52 (all 8 image transforms, mirror-invariant ids)"; `reference-check.test.ts` "4. independent sum > boundary groups: sum 4 and sum 52 (pure and from real decoded images)"; `decode-group.properties.test.ts` oracle self-check "the independent rank table gives A=1, 10=10, K=13 and the two boundary sums". Both boundary groups use four distinct cards, one per suit (A of each suit = 4, K of each suit = 52).
- Random groups: `decode-group.properties.test.ts` "P-C ... 300 random groups: IDENTIFIED, card set, independent rank-table sum in [4, 52], reflection, interpretation count" (four distinct cards of the real 52, random D4 element and camera angle, seeds `20251126 + 5000 + i`, i = 0..299); `reference-check.test.ts` "2,000 random 4-sets (seed 20251112)" for the sum table alone; `decode-group.test.ts` "5. reflections > property: random group, random D4 element, random angle gives the exact result (seed 20251112)" and the camera-rotation tests (1040 of 1040 exact over every 5 degrees and every degree through the +-45 boundaries; 672 of 672 in the boundary proof).
- Coverage matrix and run history: `m5-3-coverage.md`.

**2. Reflection classification (Property 26): MET.**
- Counts 260 NOT_REFLECTED, 260 REFLECTED, 128 AMBIGUOUS; 520 results with 2 interpretations (a heart or diamond present) and 128 with 4 (clubs and spades only); asserted exactly in the 648-image test and reproduced in this run (section A).
- Never NOT_REFLECTED for a mirrored image, never REFLECTED for a plain one, never AMBIGUOUS with a red suit: asserted per image in the same test.
- `decode-group.properties.test.ts` "P-B. Property 26: reflection per image transform (determinant oracle)" (one test per D4 element, with the determinant of a real 3x3 raster as oracle) and "P-A. Property 23: interpretation structure (hypotheses h and h∘R180)".
- Real-print note: reflection handling is tested on synthetic images only.

**3. Reference check and no board-state input (Property 25): MET.**
- REFERENCE_MISMATCH on a different card set, including different cards with the same sum: `reference-check.test.ts` "3. different card sets are mismatches" ((a) to (d)); `decode-group.properties.test.ts` "P-E ... a wrong reference with the SAME sum is still REFERENCE_MISMATCH and the decoded cards are kept".
- No identity substitution: `reference-check.test.ts` "1. exact match returns the same object", sections 5 (tampered results), 6 (non-identified results pass through unchanged) and 8; `decode-group.properties.test.ts` "P-E ... decoding before / after / between comparisons (match, mismatch, invalid reference) gives identical results"; `decode-group.test.ts` "9. safety and API > result carries no expected-value or reference fields".
- No board-state parameter: `decode-group.test.ts` "9. safety and API > type level: only an image and optional tuning options" and "static scan: only allowed imports, no board / expected / score / game identifiers"; `decode-group.properties.test.ts` "P-D. Property 25: no board-state input (type level)" (three tests, including two `@ts-expect-error` rejections that `npx tsc --noEmit` checks, exit 0).
- Mirrored whole image keeps the identified card IDs: asserted per image in the 648-image test ("cards differ from unmirrored" is a failure condition) and in section 5 of `decode-group.test.ts` (120 of 120 exact for mirrored and rotated images).
- Rejection kinds beyond the above (INCOMPLETE_GROUP, DUPLICATE_CARD, INVALID_ARRANGEMENT, CORRUPTED_FRAGMENT) have example tests in section 6 of `decode-group.test.ts`. The full rejection suite is Milestone 6 and is not part of this verdict. This report did not separately map "Property 14 second part" from the task 5 test list to a named test; the 648-image, boundary-sum and random-group tests above are the evidence for the other four listed properties (20, 23, 25, 26).

**4. Physical rounded-card composition (task 5.4, Property 27, Property 28 setup): MET.**
`m5-4-physical-card.md`; `physical-card.test.ts` (63 tests). The analytic clearance equals an independent signed-distance reference and the rasterized rounded-corner mask over the 32-cell sweep (radius 0, 2.0, 3.0, 3.175, 3.6, 4.0, 5.0, 6.0 mm x inset 0.5, 1, 1.5, 2 modules); every printed marker pixel of all 104 baseline renders (52 cards x {0, 180}) lies inside the mask; r = 6 mm at inset 1 is reported invalid (clearance -0.240 mm); a zero-gap 2 x 2 board has a white seam of 2(inset + margin) modules (4.000 modules at inset 1, 5.000 at inset 1.5, measured) and adjacent black squares form separate connected components; output is deterministic. `render.ts` and the codebook are unchanged.

**5. Double-sided flip equivalence (task 5.5, Properties 29, 30, 31): MET.**
`m5-5-double-sided.md`; `physical-card.duplex.test.ts` (33 tests, 2 of them fast-check properties).
- Vertical-axis flip: 104 of 104 (52 cards x {0, 180}) back observations pixel-identical to the front observation, with identical detector readings and decoded IDs (208 of 208 fragments).
- Horizontal-axis flip equals the front at the opposite allowed orientation: 104 of 104.
- Card ID decoded from the image for 52 cards x {FRONT, vertical, horizontal} x {0, 180}: 624 of 624 fragments IDENTIFIED as the right card.
- Negative model (same body-frame raster on both faces): the observation differs in corner positions and bits in 104 of 104 and is rejected in 104 of 104; the real model is accepted 104 of 104.
- Front and back corner sets are disjoint for all four suits; the back layer is a pure function of the card; the artwork probe is not mirrored; containment is identical for both faces at zero error (96 sweep cells) and shrinks by the registration and cut error.
- Limit: paper show-through (Requirement 16.10) and the real print-file convention (16.5, 16.6) are not simulated and are Milestone 8 work (section E).

**6. Containment and Central_Void geometry (Requirements 15.3 to 15.5): MET.**
- Baseline clearance of the white quiet margin's outer corner to the arc: 0.930 mm (design.md value 0.93), valid; clearance of the black border corner 3.175 mm; largest radius that keeps the margin inside at inset 1: 5.420 mm (`m5-4-physical-card.md`).
- Central_Void area matches 4(1 - pi/4)r^2 within 0.13% (r = 2.0 and 3.175 mm: 3.429 and 8.644 mm^2 measured against 3.434 and 8.653) and exactly at r = 4 and 5 mm.
- Corrected void distance definition: `voidToBorderCornerMm` is the true minimum Euclidean distance from any point of the Central_Void to the nearest black-border corner (Requirement 15.4); `voidTipToBorderCornerMm` (horn tip to border corner) is an additional reference column only. They are equal for 0 < r <= 3.175 mm at inset 1 (3.385 mm at r = 2, 3.180 at r = 3, 3.175 at r = 3.175) and differ above that: at inset 1, r = 3.6 / 4 / 5 / 6 mm gives 2.999 / 2.833 / 2.419 / 2.005 mm (tip distance 3.203 / 3.280 / 3.662 / 4.250 mm). The design hypothesis "the void is at least 2 modules (3.175 mm) from the border" therefore holds at the baseline and for r <= 3.175 mm but not for r >= 3.6 mm at inset 1.
- r = 0: there is no Central_Void; the literal "No Central_Void" (code value `null`) is recorded in place of a distance, in `geometry-experiments.md` and `.json`; `centralVoidAreaMm2` is 0.
- Limit: containment is an analytic and rasterized statement about a perfectly cut synthetic card; r = 3.175 mm remains an unconfirmed commercial value (Requirement 15.1).

**7. Geometry experiment completeness and per-cell statistics (task 5.6): MET WITH LIMITATION.**
- Completeness: planned 824 cells and 168,000 trials, found 824 cells and 168,000 trials, status COMPLETE (`geometry-experiments.md` section 1); `npm run verify:geometry` reproduces this (824 distinct cells, ids equal the plan, per-cell n equals the planned n, correct + rejected + false accepts = n in every cell, merged JSON equals the 824 stored per-cell files).
- Per-cell statistics, never pooled: n, correct count and rate, rejected count and rate with kinds, false accepts with count and rate, the exact one-sided 95% upper bound 1 - 0.05^(1/n) for every cell with 0 false accepts (0.30% for n = 1000, 1.49% for n = 200; the verifier checks the formula in all 824 cells, maximum difference between the two computation forms 3.56e-17), failure-cause tally, `voidToBorderCornerMm` and `voidTipToBorderCornerMm` per cell.
- False accepts observed: 0 in all 824 cells (0 of 168,000 trials). This is an observation under the sampled synthetic conditions (independent seeded trials). It is not a guarantee, it holds only for the sampled synthetic condition distribution, and it says nothing about real cameras. The bound is exact for independent trials of the sampled distribution only.
- Spurious-marker check (`geometry-experiments.md` section 8.1): 2179 failing and false-accept trials re-run and inspected, 0 detected blobs with bits 0x1FFFFFF, 0 decoder results with a SPURIOUS_CANDIDATE member, 0 failures attributed to a spurious marker.
- Decision table in the order of Requirement 15.7 is written, and no corner-radius reduction is recommended.
- Limitations: (i) Requirement 15.7 steps 2 (marker size and margin) and 3 (detection and geometric-correction algorithm) were not evaluated, and the proposed Tier 5 (module size x quiet margin, about 7,200 trials) was not implemented or run. (ii) The task text asks for at least 1,000 trials for "the baseline cell"; the plan reads this as the Tier 1 baseline cell of each of the four profiles (n = 1000 each). 55 further cells that use the baseline geometry have n = 200. (iii) The sweep covers 824 sampled cells of a 207-million-cell full factorial; interactions between degradation factors are covered only by the MODERATE and STRESS profiles. (iv) The CLEAN / MODERATE / STRESS profile levels were chosen after a small unrecorded pilot, disclosed in `geometry-experiments.md` and `geometry-experiments-plan.md`.

**8. Recognition and rejection performance (task 5.6): MET WITH LIMITATION.**
Numbers are quoted from `geometry-experiments.md` / `.json`; each belongs to its own cell.

Baseline geometry (r = 3.175 mm, inset 1, 2 x 2 board, FRONT, n = 1000 per profile):

| Profile | n | Correct | Rejected (kinds) | False accepts | 95% upper bound |
| --- | --- | --- | --- | --- | --- |
| CLEAN_DARK | 1000 | 1000 (100.0%) | 0 | 0 | 0.30% |
| CLEAN_LIGHT | 1000 | 1000 (100.0%) | 0 | 0 | 0.30% |
| MODERATE | 1000 | 967 (96.7%) | 33: INCOMPLETE_GROUP 33 | 0 | 0.30% |
| STRESS | 1000 | 814 (81.4%) | 186: INCOMPLETE_GROUP 186 | 0 | 0.30% |

Main transitions, baseline geometry, one factor at a time (n = 200 per cell, clean, dark table, default reader options with the layout offset matching the inset; nominal 100%):

| Factor | Levels and correct rate | First level below 95% |
| --- | --- | --- |
| placement shift along a seam (mm) | 0: 100.0%, 0.5: 100.0%, 1: 100.0%, 1.5: 99.5% | none |
| placement rotation per card (deg) | 0: 100.0%, 1: 99.5%, 2: 79.0%, 3: 32.5% | 2 |
| unintended gap (mm) | 0, 0.5, 1: 100.0% each | none |
| perspective tilt (deg) | 0, 10, 20: 100.0%, 30: 50.0%, 40: 0.0% (INCOMPLETE_GROUP) | 30 |
| blur (px) | 0, 0.5, 1: 100.0%, 1.5: 0.0%, 2: 0.0% (INVALID_MARKER) | 1.5 |
| lighting gradient strength | 0, 0.2, 0.4, 0.6: 100.0% each | none |
| camera rotation | none, random: 100.0% each; exactly 45 deg at inset 1: 100.0%, inset 1.5: 100.0%, inset 2: 0.0% (see C.1) | 45 deg at inset 2 only |

Registration and cut tolerances (Tier 3, baseline geometry, 2 x 2 board, n = 200 per cell; Requirement 15.7 step 4 and 16.8, evaluated before any card-shape conclusion):

| Factor | Levels and correct rate |
| --- | --- |
| FRONT cut-outline offset (mm) | 0: 100.0%, 0.5: 100.0%, 1: 42.0% |
| BACK (vertical-axis flip) registration shift (mm) | 0, 0.25, 0.5: 100.0% each, 1: 37.5% |
| BACK (vertical-axis flip) registration rotation (deg) | 0, 0.5: 100.0% each, 1: 70.5% |
| BACK (vertical-axis flip) all errors together | zero: 100.0%, mid (0.5 mm, 0.5 deg, cut 0.5 mm): 88.5%, max (1.0 mm, 1 deg, cut 1.0 mm): 16.5% |
| BACK (horizontal-axis flip) all errors together | zero: 100.0%, mid: 81.5%, max: 19.0% |

Radius x inset (Tier 1, `geometry-experiments.md` section 5): under CLEAN_DARK and CLEAN_LIGHT every one of the 24 radius x inset cells is 100.0% for each profile. Under MODERATE the cells range from 93.5% to 98.0%, under STRESS from 75.0% to 87.5%; 2 of the 24 STRESS cells (r = 2 mm at inset 1, r = 3 mm at inset 1.5) differ from the baseline-radius cell of the same inset by more than 2 standard errors (descriptive z test, not corrected for multiple comparisons). The only difference flagged in the decision table for step 1 is r = 0 mm, STRESS, inset 2 against inset 1 (lower, z = -2.3). No monotone dependence on corner radius was found in the sampled conditions.

3 x 3 boards with Distractor_Markers (Tier 4, 24 cells, n = 200 each): correct rate 61.5% to 100.0%; 100.0% under both CLEAN profiles; no false accept.

Incomplete groups (one card absent, 2 x 2 and 3 x 3, 48 cells, 9,600 trials): rejected in 100.0% of trials in every cell, all INCOMPLETE_GROUP; 0 false accepts.

Limitations: synthetic only; the profile levels are design choices; the reader was told the layout offset (`centerOffsetModules = inset + 1 + 3.5`, an existing option, derived from the inset parameter of the cell, never from card identities or ground truth; `m5-6-45deg-analysis.md` section 12); with the decoder defaults insets 1.5 and 2 are measured only by the two diagnostic cells (defaults: 100.0% at inset 1.5, 0.0% at inset 2). Rates of different cells are not comparable as one population (n differs, cells are independent draws).

**9. Test-suite stability: MET WITH LIMITATION.**
- Invocation: `npm run test:ci` = `vitest --run --maxWorkers=4` (in `package.json`). It passed once here on a machine that was not loaded (433 of 433), and 3 of 3 times in `m5-6-test-suite-stability.md`; the plain `npm test` also passed 3 of 3 there.
- Caveat, from `m5-6-test-suite-stability.md`: on a CPU saturated by other processes (the 8 sweep shards, the geometry analysis, an Android emulator) both the default configuration and `test:ci` produced `Test timed out in 5000ms` for tests that have no explicit timeout (for example `detect.test.ts` "blurred non-integer scales", `physical-card.test.ts` "a rotated card is rotated about its centre"). No assertion failed in any run; every failure was a timeout. The suite must not be run while a sweep or the 45-degree analysis is running.
- The proposed fix (explicit per-test timeouts such as `{ timeout: 30_000 }` for the six slowest tests without a timeout) is NOT applied; it changes test source and awaits a decision. `vitest.config.ts` has no `testTimeout`.

**10. Results recorded, synthetic and real evidence apart (task 5.7, Requirement 12.7): MET.**
The command output and the 520 / 128 counts are saved in `docs/optical/results/m5-7-*` (section A). Failures are recorded rather than hidden (there were none in these commands; the failures and limitations of earlier tasks are carried in sections C and D). Real-print and real-camera evidence does not exist yet and is not mixed with these results (section E).

## C. Known unresolved detection limitations

These come from the stored 5.6 results and the follow-up analysis (`geometry-experiments.md` section 10.1, `m5-6-45deg-analysis.md`). None was changed in this task and none is hidden by the verdicts above.

1. **Marker-like gate in `src/optical/detect.ts`.** The gate `quadArea / hullArea < 0.85` drops a component silently (no rejected candidate is recorded). The cell `2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm45-tl0-bl0-lt0-rs0-rr0-co0-mat` (camera rotation exactly 45 degrees, inset 2) measured 0 of 200 correct (200 INCOMPLETE_GROUP). In the analysed image the lost marker had ratio 0.843 against 0.892 to 0.894 for the other three markers, at 4 px per module. For isolated markers the smallest ratio falls as the module gets smaller (0.861 at 4 px per module, 0.830 at 3 px, 0.780 at 2 px). A what-if with a traced copy and gate values 0.80, 0.75, 0.70 recovered every gate-drop trial and produced no false accept, but the effect on false positives was not measured, and the change was NOT applied. Applying it requires a full re-run of all 824 cells as a separate data set and must not be pooled with the present data. Status: open, carried forward.
2. **Single-pixel-phase harness property.** Cells with a camera rotation of exactly 45 degrees, or without any warp, sample one pixel phase. Their 0% and 100% results do not show robustness or fragility over pixel phases. In particular the 100% at inset 1 and 1.5 at 45 degrees must not be read as robust: with fractional-pixel shifts at exactly 45 degrees inset 1 loses 20 of 160 trials, inset 1.5 loses 10 of 160 and inset 2 loses 40 of 160, always by the silent gate drop. A harness-side fix (a seeded sub-pixel translation) is proposed, not applied.
3. **`positionToleranceModules` stays 1.0.** The default is unchanged. A 1 mm back registration shift, a 1 mm cut offset, a 1 degree registration rotation and a 2 degree placement rotation sit at or beyond the point where the baseline cell falls below 95% (section B.2, item 8, and `geometry-experiments.md` section 4.2). Diagnostic re-runs of only the failing seeds at tolerance 1.5 decoded 20 of 20 (18 of 20 for the 2 degree placement rotation) with no false accept (section 8.3); that is a probe on failing seeds, not an adopted change. Widening the tolerance needs separate validation against false grouping, incomplete groups and Distractor_Markers. The 1 mm registration and cut sensitivity of the baseline geometry is the main physical risk to be checked in Milestone 8.
4. **Spurious marker 0x5AC54 (status).** The detector can report a small black blob inside a data area as a marker with bits 0x1FFFFFF (`m4-4-report.md` section E; trial 123 of `m4-3-coverage.md`). `detect.ts` was not changed. At group level the decoder handles it: `decode-group.test.ts` "8. spurious markers (the documented 0x5AC54 case)" asserts that a blob as a group member gives CORRUPTED_FRAGMENT, that a blob far from a valid group leaves the group IDENTIFIED with the blob listed as SPURIOUS_CANDIDATE, and that a blob in the Central_Void region changes nothing. In the 5.6 sweep sample (2179 trials re-run) no spurious marker occurred. The risk is therefore handled but not removed: it is a detector property, observed once in the Milestone 4 image-level cells, and untested on real images.
5. **Requirement 15.7 steps 2 and 3 not evaluated; Tier 5 not run; no radius reduction recommended.** Step 2 (marker size and margin) has no sweep in the task 5.6 text; step 3 (detection and geometric-correction algorithm) was out of scope while the decoder is frozen. The decision table says explicitly that no corner-radius reduction is recommended, because Requirement 15.7 allows it only after steps 1 to 4 are evaluated.
6. **Other sensitivities measured, not defects:** blur of 1.5 px or more and perspective tilt of 30 degrees or more (baseline geometry) lose most or all trials; the pixel size is 4 px per module in these images.

## D. Open items carried forward

1. `design.md` has not been updated for the extension result kinds and fields introduced by `decode-group.ts` and `reference-check.ts` (for example `DISTRACTOR_FRAGMENT`, `SPURIOUS_CANDIDATE`, the reference-comparison result codes such as `CARD_SET_DIFFERS`, `DECODED_SUM_INCONSISTENT`, `DECODED_RESULT_MALFORMED`, and `compareWithReference`). `design.md` mentions `ReferenceCheck.compare` and the main result kinds, but none of these names (a search for `SPURIOUS_CANDIDATE`, `DISTRACTOR_FRAGMENT`, `CARD_SET_DIFFERS`, `DECODED_SUM_INCONSISTENT`, `DECODED_RESULT_MALFORMED` and `compareWithReference` finds no match). Not changed in this task.
2. The per-test timeout proposal in `m5-6-test-suite-stability.md` is not applied.
3. The aspect-ratio decision from `m4-4-report.md` (tighten the detector's aspect-ratio check, or tolerate spurious fragments in grouping) is not made. Milestone 5 grouping tolerates them (item C.4); the detector is unchanged.
4. The unresolved 45-degree marker-like gate decision (C.1), including the full re-run it would require and the proposed sub-pixel harness change (C.2).
5. The `positionToleranceModules` decision (C.3).
6. Optional future work not started: Tier 5 (module size x quiet margin, step 2 of Requirement 15.7); the rejection suite of Milestone 6.

## E. Boundary between synthetic and real evidence, and what Milestone 8 must still verify

What this report supports: the optical decoder identifies four cards, sums them exactly, reports reflection without guessing, rejects reference mismatches without substituting identities, and does so on rendered images including software rotations, mirrors, perspective, blur, lighting gradients, rounded-corner board composition, front/back flips and small registration, cut and placement errors, with no false accept in 168,000 sampled trials and exact enumeration at the bit-flip level. The correction guarantee is limited to the independent bit-flip model (at most 2 bit errors at radius 2); larger corruption can be falsely accepted as another card (`m4-4-report.md` section D).

What it does not support: any statement about real printed cards, real paper, real cutting and registration, or real cameras. Milestone 8 must still verify, on real prints and a real camera:

1. Real print and cut: printed marker module size, contrast and black/white levels; actual corner radius of the cut cards (3.175 mm is an unconfirmed commercial value); seam behaviour of real zero-gap placement.
2. Show-through (Requirement 16.10): the contrast of a marker showing through the paper onto the empty corner of the opposite face against the reader's marker contrast requirement; that an empty corner is not detected as a marker; that a card whose inward corner is empty (for example a heart in the top-right cell) does not form a complete group.
3. Real camera: detection, binarization, decoding and grouping under real optics, noise, exposure, focus and perspective; the synthetic blur, tilt and lighting thresholds in section B.2 are not predictions.
4. Duplex print-file convention (Requirement 16.5, 16.6): whether a printer or print shop mirrors the back page; a physical flip test.
5. Real cut and registration tolerances (Requirement 16.8): the measured front-to-back registration shift and rotation and the cut-outline offset, to be compared with the sweep (levels up to 0.5 mm / 0.5 degrees / 0.5 mm cut remain at 100% for the baseline cell here; 1 mm / 1 degree does not).
6. The game security limitation (Requirement 16.9): a marker is readable on either face, so hidden card information may be exposed; this is a documented limitation, not a decoder property.

## F. Repository state checks

| Check | Result |
| --- | --- |
| HEAD | `b57d62e` (tasks 5.1 to 5.6 committed) |
| Frozen codebook SHA256 | `515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4` (unchanged; `git log --oneline -- src/optical/codebook.v1.json` shows only `c1575b9 feat: implement verified symmetric optical codebook`) |
| Production files under `src/optical` changed since `cf6e97c` | none. `git diff --name-only cf6e97c HEAD -- src/optical` lists 12 files, all test or test-support: `decode-group.properties.test.ts` and, under `testing/`, `geometry-45deg.test.ts`, `geometry-design.test.ts`, `geometry-design.ts`, `geometry-probe.ts`, `geometry-report.test.ts`, `geometry-report.ts`, `geometry-trial.test.ts`, `geometry-trial.ts`, `physical-card.duplex.test.ts`, `physical-card.test.ts`, `physical-card.ts`. Expected: `decode-group.ts`, `reference-check.ts`, `detect.ts`, `render.ts` and the decoder files are unchanged since `cf6e97c`. |
| Other changes since `cf6e97c` outside `src/optical`, `docs`, `.kiro` | `.gitignore`, `package.json` (scripts), and the measurement scripts `scripts/geometry-45deg.ts`, `geometry-failures.ts`, `measure-geometry.ts`, `merge-geometry.ts`, `verify-geometry-results.ts`; expected for task 5.6 |
| `.kiro/` | 5 files tracked (`specs/qroker-game/.config.kiro`, `design.md`, `requirements.md`, `tasks.md`, `tasks.meta.json`); `git check-ignore` reports nothing, so it is not ignored |
| Working tree vs HEAD in `src`, `scripts`, `package.json`, `tsconfig.json`, `vitest.config.ts` | no differences |
| Task checkbox | not ticked by this task |

The `tasks.md`, `tasks.meta.json`, `m5-7-tsc-output.txt` and earlier `m5-7-test-ci-output.txt` entries in the git index were staged before this run and were left as they are. The `m5-7-*` files in the working tree were regenerated; nothing was committed or pushed.

## G. Verdict

All six commands exited 0; 433 of 433 tests passed in 20 files; the independent codebook verifier and the geometry result verifier passed; the 648-image counts are 260 / 260 / 128 and 520 / 128 as required. All ten criteria are MET or MET WITH LIMITATION; **no criterion is NOT MET**. The limitations that qualify the verdict are synthetic-only evidence, the open 45-degree marker-like gate and single-pixel-phase harness property, the unchanged `positionToleranceModules` with its 1 mm registration and cut sensitivity, Requirement 15.7 steps 2 and 3 not evaluated, and the suite's dependence on an unloaded machine.
