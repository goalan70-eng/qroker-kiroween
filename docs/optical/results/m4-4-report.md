# M4.4 Milestone 4 final verification report

All evidence is from synthetic images and a synthetic bit-flip model. No real printed cards and no real cameras were used.
Raw output with exit codes and SHA-256 listings: `docs/optical/results/m4-4-test-output.txt`.
Environment: Node 24, Windows/PowerShell, HEAD `435a701`, vitest 5.1.0. No source, test, script, spec or result file was edited for this task.

## A. Totals

| Command | Exit code | Result |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | no diagnostics |
| `npx vitest --run` (run 1) | 0 | 11 files passed, 190 tests passed, 0 failed, 0 skipped (13.63 s) |
| `npx vitest --run` (run 2) | 0 | identical: 11 files, 190 tests passed (13.54 s) |
| `npx vitest --run --reporter=verbose` | 0 | identical: 11 files, 190 tests passed (13.96 s); 190 `✓` lines, no `×`/skipped lines |
| `npm run check:codebook` | 0 | byte-identical regeneration |
| `npm run verify:codebook` | 0 | independent verifier passed |
| `npm run verify:bound` | 0 | passed (rewrites `bound.*`, see below) |
| `npm run measure:detection` | 0 | |
| `npm run measure:decode-fragment` | 0 | |
| `npm run collect:decode-counterexamples` | 0 | |

Run 1 and run 2 agree (same file and test counts, all passed). Failures: none.

Per-file counts (parsed from the verbose run):

| Test file | Tests passed |
| --- | --- |
| `src/optical/smoke.test.ts` | 2 |
| `src/optical/fragments.test.ts` | 25 |
| `src/optical/verify-codebook.test.ts` | 22 |
| `src/optical/transforms.test.ts` | 9 |
| `src/optical/render.test.ts` | 32 |
| `scripts/render-samples.test.ts` | 7 |
| `src/optical/codebook.test.ts` | 10 |
| `src/optical/decode-fragment.test.ts` | 29 |
| `scripts/verify-bound.test.ts` | 1 |
| `src/optical/decode-fragment.bitflip.test.ts` | 21 |
| `src/optical/detect.test.ts` | 32 |
| **Total** | **190** |

## B. Integration: render -> detectMarkers -> decodeDetection

Tests that run all three stages:

- `decode-fragment.test.ts`
  - `2. image path (rotation 0) > 52 cards x 8 transforms, modulePx 4..8: render -> detect -> decode gives the exact card and transform`
  - `2. image path (rotation 0) > 52 card layers x orientation 0/180: two fragments, both decode to the source card`
  - `3. rotated, scaled and tilted images > rotation + scale + subpixel shift (24 seeded cases): card equals the source, transform = R90^k . g`
  - `3. rotated, scaled and tilted images > perspective tilt 10..40 deg with random in-plane rotation (12 seeded cases): same relation`
  - `4. corrupted data > image path: corrupted patterns rendered, detected and decoded (k = 0..8)`
  - `6. invalid, solid and odd markers` (solid black, blank, one white border cell, valid + invalid marker in one image)
- `decode-fragment.bitflip.test.ts`
  - `G4. five outcomes are distinct end to end through the image pipeline > variation 0..9`
  - `G5. recorded counterexamples > every recorded counterexample reproduces through decodeFragment and render -> detect -> decode`
- `detect.test.ts` covers render -> detect only (it asserts the detected bits and locations, not the decoded card).

Measured detection results, copied from `m4-1-detection.json/.md` (seed 20251112, default Otsu, minSizePx 14):

| Family | Cases | DETECTED | Exact | Wrong-bit DETECTED |
| --- | --- | --- | --- | --- |
| clean-base-patterns | 52 | 52 | 52 | 0 |
| clean-d4-transforms | 416 | 416 | 416 | 0 |
| card-layers (52 cards x orientation 0/180) | 104 | 104 | 104 | 0 |
| contact-sheet (104 markers in one image) | 1 | 1 | 1 | 0 |
| positions (300 seeded placements, 155 sub-pixel) | 300 | 300 | 300 | 0 |
| rotations (every 5 degrees, 10 patterns) | 720 | 720 | 720 | 0 |
| negatives | 320 | 0 | 320 (NOT_DETECTED) | 0 |
| invalid-borders | 236 | 42 | 236 (acceptable behaviour) | 0 |

- Contact sheet: 104 of 104 markers located with exact bits, 0 rejected candidates, 0 unexpected extra markers. Card layers: 208 markers located with exact bits, max centre error 0 px. Positions: max centre error 0.5955 px. Rotations: strict cases 680 of 680 exact; the 40 boundary cases (within 5 degrees of +-45) accept any of the four R90 rotations.
- Scale: crisp integer modulePx 1 is 0/52; modulePx 2..24 is 52/52. Blurred fractional scales are exact from 2.5 px per module (2.0: 35/52, 2.25: 36/52, none wrong).
- Perspective (20 seeded cases per strength): 20/20 exact at 0, 10, 20, 30, 40, 50 degrees for camera distances of 5 and 3 marker edges. At 60 degrees: 16/20 (5 edges) and 15/20 (3 edges). At 70 degrees: 0/20. No wrong bits at any tilt.
- False positives on negative images: 0 of 320. DETECTED results with wrong bits across all required families: 0.
- Invalid-border cases: 183 INVALID_MARKER, 42 DETECTED (all structurally valid: isolated margin dot, gray-100 border cell, whole border gray 128, white occluders with an intact border), 11 NOT_DETECTED; none DETECTED with wrong bits or with invalid structure.
- Solid black 7x7 marker with white margin: `DETECTED`, bits 0x1FFFFFF. The detector has no template knowledge. See E and I.

## C. Coverage: 52 cards x 8 D4 transformations (416 templates)

- Bit level: `decode-fragment.test.ts` > `1. clean bit patterns > 416 templates x radius 1 and 2: IDENTIFIED with the right card, transform and distance 0`.
- Image level, decoding: `decode-fragment.test.ts` > `2. image path (rotation 0) > 52 cards x 8 transforms, modulePx 4..8: render -> detect -> decode gives the exact card and transform` (416 images).
- Image level, detection only: `detect.test.ts` > `1. clean valid markers > all 52 x 8 D4-transformed renders are read faithfully (bits = applyTransform(g, P))` (416 renders; 416 of 416 exact in `m4-1-detection.json`).
- Card layers: `2. image path` > `52 card layers x orientation 0/180: two fragments, both decode to the source card`.

## D. Hamming correction guarantees (d_id = 5)

Independent d_id: `decode-fragment.bitflip.test.ts` > `G2 ... independent d_id is at least 5 and agrees with the generator report`. `m4-3-counterexamples.json` has `idDistance` 5.

Tests (all passed in the verbose run):

- G1: `all 416 templates x all flip masks of weight 0..3 (2,626 per template), radius 1 and 2`. This is 2,184,832 `decodeFragment` calls (416 x 2,626 x 2). Every weight <= radius gives IDENTIFIED with the original card, transform and distance = weight. For radius 1, all 124,800 weight-2 and 956,800 weight-3 cases are CORRUPTED_FRAGMENT. No call returned AMBIGUOUS. Coverage statement: `m4-3-coverage.md` rows e and f.
- G1: `radius 2, weight 3: no status is asserted; decodeFragment equals the brute-force reference in all 956,800 cases` (2,720 false acceptances, equal to the enumeration).
- G2: `(i) lower bound: no cross-card IDENTIFIED below d_id - radius flips (exhaustive, from G1)` and `(ii) attainment: flipping d_id - radius of the differing bits toward another card yields IDENTIFIED as that other card`.
- AMBIGUOUS never occurs with the frozen codebook: `m4-2-decode-fragment.json/.md` list "ambiguous words: 0" for both radii, and the "of which ambiguous" column is 0 for every k from 0 to 25. AMBIGUOUS is only produced with injected custom codebooks (`7. injected custom codebooks (a)`) and in G4 through an injected matcher.
- Also: `decode-fragment.test.ts` > `5. agreement with the exact enumeration` (radius 1 and 2 accepted words; 200,000 uniform words + 20,000 template-plus-k-flips agree with the reference); `G6` (2,000 fast-check cases, status/card/distance equal the reference).

Exact enumeration (`m4-2-decode-fragment.json` and `m4-3-counterexamples.json`; 416 x C(25,k) events at weight k):

| | Radius 1 | Radius 2 |
| --- | --- | --- |
| Accepted words (unique card within radius) | 10,816 | 135,616 |
| Ambiguous words | 0 | 0 |
| Accepted words with tied nearest transform | 0 | 0 |
| Smallest k with a false acceptance | 4 | 3 |

False acceptance (accepted as a different card) and wrong transform (same card, other transform), exact counts and rates:

| k | R1 events | R1 false accept | R1 rate | R1 wrong transform | R2 false accept | R2 rate | R2 wrong transform |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 956,800 | 0 | 0 | 0 | 2,720 | 0.00284281 | 0 |
| 4 | 5,262,400 | 1,360 | 0.000258437 | 0 | 13,360 | 0.00253877 | 3,360 |
| 5 | 22,102,080 | 5,072 | 0.000229481 | 1,344 | 79,648 | 0.00360364 | 1,344 |
| 6 | 73,673,600 | 22,032 | 0.000299049 | 224 | 267,792 | 0.00363484 | 37,408 |
| 7 | 199,971,200 | 61,616 | 0.000308124 | 7,584 | 763,312 | 0.00381711 | 7,584 |
| 8 | 449,935,200 | 137,568 | 0.000305751 | 416 | 1,747,248 | 0.00388333 | 130,576 |

For k = 0..2 (radius 1: k = 0..1) the correct count equals the events with the exact transform, with zero false acceptances. Pooled k = 4..8 (750,944,480 events): radius 1 correct 0.0000127413, false acceptance 0.000303149, rejected 0.999684; radius 2 correct 0.000240060, false acceptance 0.00382366, rejected 0.995936. The full tables for k = 0..25 are in `m4-2-decode-fragment.md` and `m4-3-counterexamples.md`. Because the enumeration is exact, no confidence bounds apply to these numbers.

## E. Counterexamples and statistics preserved

- Reproducible bit-level counterexamples: `m4-3-counterexamples.json` (`radii[].falseAcceptances` and `radii[].wrongTransforms`, 25 records each per radius, 100 replay cases in total), rendered in `m4-3-counterexamples.md`. `G5 ... every recorded counterexample reproduces through decodeFragment and render -> detect -> decode` replays all 100, and `G5 ... the files on disk are byte-identical to a fresh regeneration` passed. Today's regeneration by `npm run collect:decode-counterexamples` is also byte-identical (section "Hash comparison").
- Image-level cells, copied from `m4-3-counterexamples.json` (n = 300 per cell, never pooled; upper 95% bound 1 - 0.05^(1/n) = 0.00993608 only for cells with zero false acceptances). "Rej. by kind" is always all CORRUPTED_FRAGMENT. Detector bit mismatches: 0 in every cell.

| radius | k | n | correct | same card, other transform | false accept | false-accept rate | upper 95% bound (only if 0) | rejected | trials with extra fragments |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 300 | 300 | 0 | 0 | 0 | 0.00993608 | 0 | 0 |
| 1 | 1 | 300 | 300 | 0 | 0 | 0 | 0.00993608 | 0 | 0 |
| 1 | 2 | 300 | 0 | 0 | 0 | 0 | 0.00993608 | 300 | 0 |
| 1 | 3 | 300 | 0 | 0 | 0 | 0 | 0.00993608 | 300 | 0 |
| 1 | 4 | 300 | 0 | 0 | 0 | 0 | 0.00993608 | 300 | 0 |
| 1 | 5 | 300 | 0 | 0 | 1 | 0.00333333 | - | 299 | 1 |
| 1 | 6 | 300 | 0 | 0 | 0 | 0 | 0.00993608 | 300 | 0 |
| 1 | 7 | 300 | 0 | 0 | 0 | 0 | 0.00993608 | 300 | 0 |
| 1 | 8 | 300 | 0 | 0 | 0 | 0 | 0.00993608 | 300 | 0 |
| 2 | 0 | 300 | 300 | 0 | 0 | 0 | 0.00993608 | 0 | 0 |
| 2 | 1 | 300 | 300 | 0 | 0 | 0 | 0.00993608 | 0 | 0 |
| 2 | 2 | 300 | 300 | 0 | 0 | 0 | 0.00993608 | 0 | 0 |
| 2 | 3 | 300 | 0 | 0 | 0 | 0 | 0.00993608 | 300 | 0 |
| 2 | 4 | 300 | 0 | 1 | 4 | 0.0133333 | - | 295 | 0 |
| 2 | 5 | 300 | 0 | 0 | 1 | 0.00333333 | - | 299 | 0 |
| 2 | 6 | 300 | 0 | 1 | 1 | 0.00333333 | - | 298 | 0 |
| 2 | 7 | 300 | 0 | 0 | 1 | 0.00333333 | - | 299 | 0 |
| 2 | 8 | 300 | 0 | 0 | 0 | 0 | 0.00993608 | 300 | 0 |

  The radius 2, k = 4 cell shows 4 false acceptances in 300 (1.33%) against an exact rate of 0.254%. `m4-3-coverage.md` notes that the same seeded draws classified with the bit-level model give the same 4, so this is sampling variation of that single cell (its estimate of the probability of 4 or more at the exact rate is about 0.7%). That probability was taken from `m4-3-coverage.md`, not recomputed here.

- Detector finding (spurious extra marker), from `m4-3-coverage.md` "Findings and limits" and the `trialsWithExtraFragments` column in `m4-3-counterexamples.json`. The only cell with a non-zero count is radius 1, k = 5 (count 1). Trial data: trial 123, card D-2, transform R180, modulePx 10, offset 17,13, flipped bits 0,14,19,23,24, observed bits 0x5AC54. `detectMarkers` returned two markers: the real one, and a spurious one at corners (67,53),(77,53),(77,73),(67,73), read as 0x1FFFFFF. It is a black blob about 1x2 modules inside the data area that was accepted as a marker. The spurious fragment decodes as CORRUPTED_FRAGMENT, so it cannot create an identity. `detect.ts` was not changed. A consumer that expects one fragment per physical marker (Milestone 5 grouping) must handle it. The trial index (123) is recorded in `m4-3-coverage.md`; the JSON stores only the per-cell count, so I did not re-run the trial independently in this task.

## F. Distinct error classification

- End to end: `decode-fragment.bitflip.test.ts` > `G4. five outcomes are distinct end to end through the image pipeline > variation 0..9` (10 variations; modulePx 4..10, offsets, rotations 0/90/180/270 and 23.5/61/143.7 degrees). Each renders NOT_DETECTED (blank, noise), INVALID_MARKER (broken border), CORRUPTED_FRAGMENT, IDENTIFIED, and AMBIGUOUS (matcher injected through `DecodeOptions.matcher`). The test checks that labels are mutually exclusive and that no identity field appears on non-IDENTIFIED outcomes.
- `decode-fragment.test.ts` > `8. options and safety > NOT_DETECTED and INVALID_MARKER are passed through, never converted`; `6. ... a blank image is NOT_DETECTED (not CORRUPTED_FRAGMENT)`; `6. ... a marker with one non-corner border cell white is INVALID_MARKER (passed through, no identity)`.
- Detector reason codes seen in `m4-1-detection.md`: BORDER_NOT_BLACK, NOT_QUADRILATERAL, MARGIN_NOT_WHITE, TOUCHES_IMAGE_EDGE, TOO_SMALL, GRID_MISALIGNED, DEGENERATE_GEOMETRY. These are detector `INVALID_MARKER` reasons, separate from the decoder statuses.

## G. Decoding uses pixels only

`decode-fragment.test.ts` > `8. options and safety > static scan: only ./transforms, ./detect (types) and node:fs / node:url; no board or game inputs`. It reads `decode-fragment.ts`, strips comments, requires the import list to equal `./detect`, `./transforms`, `node:fs`, `node:url`, forbids dynamic `require`/`import()` and any identifier containing board/expected/score/game/hand/reference/slot, and requires `decodeFragment.length <= 2`. For `detect.ts` there is no scan test. Its signature is `detectMarkers(image: GrayImage, options)` and its only import is `import type { GrayImage } from './render'` (checked by reading the source, not by a test). This is a structural check, not a proof of absence of side channels.

## H. Task 4 acceptance criteria

| # | Criterion (tasks.md task 4) | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Decoding uses pixels only | PASS (structural) | G above; `decodeDetection(result)` takes a `DetectResult` produced from a `GrayImage` |
| 2 | Clean image with no marker -> NOT_DETECTED | PASS | `6. ... a blank image is NOT_DETECTED`; `detect.test.ts` `3. ... never reports DETECTED for blank, noise, gradient, bar or disk images (false positives: 0)`; m4-1 negatives 320/320 NOT_DETECTED; G4 blank and noise |
| 3 | Nearest template beyond r_acc -> CORRUPTED_FRAGMENT; the two outcomes distinct | PASS | `6. ... solid black 7x7 marker ... CORRUPTED_FRAGMENT`; `6. ... all-white data (bits 0) is CORRUPTED_FRAGMENT`; G4; scope: specific instances plus the exhaustive G1 radius-1 weights 2-3, not a claim for arbitrary flips |
| 4 | P24: all 52 x 8 clean images decode to the right card and observed transform | PASS | C above (416 images) |
| 5 | P24: 0..r_acc flips decode to the original card | PASS | G1 exhaustive, 2,184,832 calls |
| 6 | P24: r_acc = 1, 2-3 flips always CORRUPTED_FRAGMENT | PASS | G1 (124,800 + 956,800 cases) |
| 7 | P24: r_acc = 2 no guaranteed rejection; false-acceptance and rejection rates measured and recorded, not asserted zero | PASS | G1 `radius 2, weight 3` (no status asserted); D tables; `m4-2`, `m4-3` |
| 8 | P24: false acceptance beyond guaranteed ranges (>= 4 at r = 1, >= 3 at r = 2) is measured | PASS | D tables (first false acceptance k = 4 and k = 3) and G2 |
| 9 | r_acc > 2 rejected | PASS | `8. ... invalid radius throws RangeError; default is 1` |
| 10 | Blank or marker-free -> NOT_DETECTED; too many flipped bits -> CORRUPTED_FRAGMENT | PASS | items 2 and 3; `4. ... image path: corrupted patterns rendered, detected and decoded (k = 0..8)`; E cells |

Requirements references (verified now / remaining):

- 5.3: Verified now: each fragment decodes to a card and observed transform from its 5x5 pattern, for all 416 templates, bit level and image level. Remaining: the card-level rule combining four fragments is Milestone 5 (decode-group).
- 12.2: Verified now: card and transform identified from pixels on synthetic images (clean, rotated, scaled, tilted up to 50 degrees, k-bit-corrupted). Remaining: real printed and photographed cards.
- 13.1: Verified now: detection and decoding use only the image pixels, with a static check on `decode-fragment.ts`. Remaining: the same constraint for the group decoder and the complete pipeline (Milestone 5/6).
- 13.4: Verified now: explicit outcomes NOT_DETECTED, INVALID_MARKER, CORRUPTED_FRAGMENT, AMBIGUOUS, IDENTIFIED, mutually exclusive end to end; invalid borders rejected; measured detector limits. Remaining: handling of these outcomes in groups and the UI.
- 13.5: Verified now: template matching with radius 1 (default) or 2; the 0..r correction and radius-1 rejection guarantees; the false-acceptance rates measured exactly for the independent-flip model. Remaining: image-error models from real captures; the radius choice for the game.

## I. Limitations and risks

- All evidence is synthetic: rendered images, not printed cards; no real cameras, paper, lenses or lighting.
- The exact enumeration models independent uniform bit flips. Real blur, misaligned sampling and lighting do not flip independent bits, so the rates are not predictions for real use.
- Image-level cells are finite samples (n = 300 per cell, never pooled). A zero count only gives a 95% upper bound of about 1.0%.
- Detector limits measured in M4.1 (`m4-1-detection.md`): minimum module size about 2 px for crisp renders and 2.5 px for blurred fractional scales; perspective tilt exact up to 50 degrees (20/20), partial at 60 degrees, none at 70; illumination ramps: Otsu works for a 0.6..1 ramp but fails at 0.35..1 (0/20), adaptive works at 0.35..1 (20/20) but fails at 0.2..1 (0/20); occlusion handling is rejection only (borders are never repaired).
- Spurious extra marker finding (E): the detector can report an extra 1x2-module black blob inside the data area as a marker. It decoded as CORRUPTED_FRAGMENT in the observed trial. `detect.ts` was not changed.
- Wrong-transform decoding beyond the guaranteed radius: a corrupted word can decode as the correct card with a different transform (exact counts in D). The observed transform is trustworthy only up to the radius.
- A solid black marker is DETECTED (0x1FFFFFF) and is rejected only at the decoder (CORRUPTED_FRAGMENT).
- The decoder is hard-decision only. Cell confidence is reported but does not change the status (`9. cell confidence (reported only)`). There is no soft-decision decoding.
- Open decision: whether to tighten the detector's aspect-ratio check or to tolerate spurious fragments in Milestone 5 grouping.
- Show-through, duplex registration, cutting tolerance and rounded-corner geometry are still unverified on real prints (Requirements 15/16, Milestone 8).
- False acceptance is possible with at least d_id - radius flips (4 at radius 1, 3 at radius 2). This report does not claim that arbitrary corruption can never produce an incorrect identity.

## Hash comparison (SHA-256 before vs after, full lists in `m4-4-test-output.txt`)

| File | Verdict |
| --- | --- |
| `src/optical/codebook.v1.json` | unchanged (`515ECEB3...CC2D4`, matches the frozen hash) |
| `m4-1-detection.json`, `m4-1-detection.md` | byte-identical after regeneration |
| `m4-2-decode-fragment.json`, `m4-2-decode-fragment.md` | byte-identical after regeneration |
| `m4-3-counterexamples.json`, `m4-3-counterexamples.md` | byte-identical after regeneration |
| `m4-3-coverage.md`, `m0..m3` files, `codebook-verification.*`, `.gitkeep` | unchanged |
| `bound.json`, `bound.md` | changed by `npm run verify:bound`; the only difference is the runtime (`runtimeSeconds` 1.707 -> 1.839 in `bound.json`; "Runtime: 1.7 s" -> "1.8 s" in `bound.md`). The files were not restored. |

`git diff --stat docs/optical/results src` shows only `bound.json` and `bound.md` (1 line each).

## J. Verdict

All commands exited 0, 190 of 190 tests passed twice plus a verbose run, all ten H items pass, and the regenerated M4 reports and the frozen codebook are byte-identical. **Verdict: PASS for Task 4 / 4.4.** Qualifications: item 1 rests on a structural scan of `decode-fragment.ts` (no scan test exists for `detect.ts`), and the spurious-marker finding and the limits in I remain open.

`git status --short` at the end of the run (before this report was written):

```
 M .kiro/specs/qroker-game/tasks.md
 M .kiro/specs/qroker-game/tasks.meta.json
 M docs/optical/results/bound.json
 M docs/optical/results/bound.md
?? docs/optical/results/m4-4-test-output.txt
```

`tasks.md` and `tasks.meta.json` were already modified by the orchestrator (the working tree was not clean at the start). I did not change them. With this report, `m4-4-report.md` is also untracked.
