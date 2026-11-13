# Implementation Plan: QRoker Game (Phase 2: Standalone Optical Module)

## Overview

This plan covers Phase 2 only: the standalone optical module in `src/optical/`. It does not cover the game engine, AI, simulator, browser UI, scoring values, PWA, or companion app. Scoring values stay undecided.

Fixed technical choices (from design.md):

- TypeScript, Node 24, Vitest (`vitest --run`), fast-check for property tests, no other runtime dependencies. All optical tests run without a browser.
- Sources and `*.test.ts` files live in `src/optical/`. Frozen codebook: `src/optical/codebook.v1.json`. Measurement outputs (JSON + short Markdown report): `docs/optical/results/`.
- Grid: 5×5 data, 7×7 with border, 9×9 with margin. Eight D4 transforms I, R90, R180, R270, Fh, Fv, Dm, Da as 2D cell maps. Bit index i = 5r + c. Transform rule: (g·P)[g(x)] = P[x].
- Codebook: 52 cards (no jokers), 416 templates, pairwise Hamming distance ≥ 5 for all pairs (including different transforms of the same card), base-pattern weight in [9, 16], deterministic generation (mulberry32, fixed seed), attempt cap with hard failure, frozen JSON with SHA-256. Card order: ♥A..♥K, ♦A..♦K, ♣A..♣K, ♠A..♠K.
- Fragment layout: ♥ TL:P, BR:R180·P. ♦ TR:P, BL:R180·P. ♣ TR:P, BR:Fh·P. ♠ TL:P, BL:Fh·P. Cards are placed at 0° or 180° only.
- Slot table (observed transform at the inward corner): ♥ TL:R180, BR:I. ♦ TR:R180, BL:I. ♣ TL:Fh, TR:R180, BL:I, BR:Fv. ♠ TL:R180, TR:Fh, BL:Fv, BR:I.
- Reflection reporting: NOT_REFLECTED / REFLECTED / AMBIGUOUS. Groups containing ♥ or ♦ are determined (2 passing hypotheses). Groups of only ♣/♠ are AMBIGUOUS (4 passing hypotheses). The decoder never guesses. Of 81 observed arrangements × 8 image transforms = 648 images, 520 are determined and 128 are ambiguous.
- Enumeration values stated in design.md (to be reproduced by task 1, not assumed): |F| = 24,097,536; V(25,4) = 15,276; lower bound on max code size = 198 (≥ 52). Fail counts: balance 3,615,562; self-distance 7,152,896; either 9,456,896. Self-distance failures per transform: R90 74,624; R270 74,624; R180 647,168; Fh/Fv/Dm/Da 1,835,008 each.
- Decoder API takes only a grayscale image, never board state. Result kinds: IDENTIFIED(cards, hiddenSum, reflection, interpretations[], readings), NOT_DETECTED, INCOMPLETE_GROUP, CORRUPTED_FRAGMENT, DUPLICATE_CARD, INVALID_ARRANGEMENT. REFERENCE_MISMATCH is returned only by a separate `ReferenceCheck.compare`. The decoder never substitutes expected board data for failed recognition.
- Acceptance radius r_acc defaults to 1 and is configurable to 2. Values above 2 are rejected. With distance ≥ 5, correction is guaranteed only for up to 2 bit errors under an independent bit-flip model; larger corruption can be falsely accepted as another card.
- Independence rule: the codebook verifier must not import code from the generator or from the transform implementation the generator uses. It re-derives the 8 cell maps itself and works from the frozen JSON and rasterized fragments.
- Physical card geometry (Requirement 15): baseline 63.5 × 88.9 mm, corner radius 3.175 mm, marker inset 1 module (1.5875 mm), quiet margin 1 module, zero intended gap between cards. The central void left by rounded inner corners must not be assumed away. Improvement order if recognition is unreliable: inset, marker size/margin, detection/geometry algorithms, alignment tolerance, and only then a smaller corner radius. Synthetic geometry results do not guarantee real-camera performance. The analytic containment numbers in design.md ("Physical Card Geometry") are unreproduced until task 5.4 tests pass.
- Double-sided markers (Requirement 16): the back-face layer is the horizontal mirror of the front-face layer in the card body frame (including the fragment pixel content), so that after a left-right flip the observed markers have the same board position, bits and pixels. Printing the same body-frame raster on both faces does not satisfy this and is covered by a negative test. Mirroring applies to the marker layer only. Back fragments are derived only from the same card's front layer. Duplex registration and cut-outline errors are geometry parameters. A readable marker on either face can reveal hidden cards; this is a documented gameplay limitation (design.md, Physical Card Geometry section 7), not something the decoder or the app can fix.

Rules for every milestone:

- Each milestone lists Dependencies, Deliverables, Acceptance criteria, and Tests. Milestones run in order.
- Each milestone ends with a "run tests and record results" sub-task that writes real command output to `docs/optical/results/`. Failures must be recorded, not hidden, and thresholds must not be loosened to turn a failure into a pass.
- No task text claims that a test passes. Tasks say what to run and record.
- All tasks are required. There are no optional tasks.
- Property numbers refer to design.md.

## Tasks

- [x] 0. Project scaffolding
  - Dependencies: none.
  - Deliverables: `package.json` (`"type": "module"`, `npm test` = `vitest --run`, devDependencies `typescript`, `vitest`, `fast-check`, `tsx` or equivalent script runner only if needed for `scripts/`), strict `tsconfig.json`, Vitest config, `node_modules` added to `.gitignore`, `docs/optical/results/.gitkeep`. Do not add UI folders or folders for other modules.
  - Acceptance criteria: `npm test` runs an empty or smoke test and exits successfully.
  - Tests: one smoke test `src/optical/smoke.test.ts` (including one trivial fast-check property to confirm the library loads).
  - _Requirements: 12.1_

  - [x] 0.1 Create the project files listed in Deliverables
    - Create the files above and install dependencies. Add no runtime dependencies.
    - _Requirements: 12.1_

  - [x] 0.2 Add the smoke test, run tests, and record results
    - Run `npm test` and save the real output to `docs/optical/results/m0-test-output.txt`. Record failures; do not hide them.
    - _Requirements: 12.1, 12.7_

- [x] 1. Deterministic 52-card codebook generation
  - Dependencies: task 0.
  - Deliverables: `src/optical/prng.ts` (mulberry32), `src/optical/codebook.ts` (greedy deterministic generator with attempt cap that fails hard, balance and self-distance filters, SHA-256 of the frozen content), `scripts/generate-codebook.ts` (writes `src/optical/codebook.v1.json` with algorithm version, seed, 52 patterns in the card order above, measured d_id and d_self, SHA-256), `scripts/verify-bound.ts` (re-derives the enumeration values over all 2^25 patterns and writes `docs/optical/results/bound.json`).
  - Acceptance criteria: the 52 patterns are distinct, each has weight in [9, 16], and generation is deterministic. The frozen file equals a fresh regeneration byte for byte. `bound.json` holds the measured |F|, V(25,4), the bound, balance/self-distance/either fail counts, and per-transform self-distance fails. If any measured number differs from the stated value, the bound test fails and the discrepancy is recorded in `docs/optical/results/bound.json` and the Markdown report.
  - Tests (Properties 13, 22): exactly 52 distinct patterns; weight range [9, 16]; two generations are byte-identical; frozen file matches regeneration; attempt-cap exhaustion throws; SHA-256 is recorded and matches the content; bound numbers compared against the stated values.
  - _Requirements: 5.3, 12.7_

  - [x] 1.1 Implement `prng.ts`, `codebook.ts`, and `scripts/generate-codebook.ts`, then generate and freeze `codebook.v1.json`
    - Use a fixed seed and an attempt cap. Exceeding the cap is a hard error.
    - _Requirements: 5.3_

  - [x] 1.2 Implement `scripts/verify-bound.ts` and the bound test
    - Enumerate all 2^25 patterns. Write `bound.json`. The test compares each number to the stated value and records any mismatch.
    - _Requirements: 5.3, 12.7_

  - [x] 1.3 Write codebook tests (Properties 13, 22)
    - Cover the list in Tests above, including the attempt-cap failure path.
    - _Requirements: 5.3_

  - [x] 1.4 Run tests and record results
    - Run `npm test` and the bound script. Save output and a short Markdown report to `docs/optical/results/m1-*.txt|md`. Record failures; do not hide them.
    - _Requirements: 12.7_

- [x] 2. Eight-transformation and Hamming-distance verification
  - Dependencies: task 1.
  - Deliverables: `src/optical/transforms.ts` (8 D4 cell maps and bit permutations, used by decoder code), `src/optical/verify-codebook.ts` and its test. The verifier does not import from `codebook.ts`, `prng.ts`, or `transforms.ts`. It re-derives the 8 cell maps itself and reads only the frozen JSON and rasterized fragments.
  - Acceptance criteria: the verifier measures d_id and d_self from the frozen JSON and writes them to `docs/optical/results/codebook-verification.json` (+ short `.md`). A deliberately corrupted codebook is rejected.
  - Tests (Properties 13, 21): each of the 8 maps is a bijection on the 25 cells; the 8 maps form a group (closure, inverses); for all 52 × 8 combinations, the bit permutation equals the rasterized 2D transform followed by resampling; all 86,320 template pairs have distance ≥ 5; measured d_id and d_self recorded; negative tests: codebook with a duplicate pattern, a pair at distance < 5 across different transforms, and an out-of-range weight are each rejected.
  - _Requirements: 5.3, 12.1, 12.7_

  - [x] 2.1 Implement `transforms.ts`
    - Define the 8 cell maps with (g·P)[g(x)] = P[x] and generate bit permutations from the cell maps.
    - _Requirements: 5.3_

  - [x] 2.2 Implement the independent `verify-codebook.ts`
    - Re-derive the cell maps locally. Check distances over all 416 templates (86,320 pairs), weights, and uniqueness. Report d_id and d_self.
    - _Requirements: 5.3, 12.7_

  - [x] 2.3 Write transform, equivalence, distance, and negative tests (Properties 13, 21)
    - Cover the list in Tests above.
    - _Requirements: 5.3, 12.1_

  - [x] 2.4 Run tests and record results
    - Save output and measured d_id/d_self to `docs/optical/results/`. Record failures; do not hide them.
    - _Requirements: 12.7_

  - [x] 2.5 Final cleanup of Milestone 2 tests and generated artifacts
    - Make test E executable by exposing one pure transform helper from the verifier (no imports of codebook/prng/transforms in production code), remove the always-true assertion in the case-11 property, stop tracking the generated Vitest JSON output, and rerun the Milestone 2 checks.
    - _Requirements: 5.3, 12.7_

- [x] 3. Suit-specific two-dimensional symmetry generation
  - Dependencies: task 2.
  - Deliverables: `src/optical/fragments.ts` (second fragment derived from the base pattern: R180 for ♥♦, Fh for ♣♠; layout table; 0°/180° only), `src/optical/render.ts` (rasterizes card fragment layers with 7×7 border, 9×9 margin, blank unprinted corners).
  - Acceptance criteria: card layers satisfy the symmetry stated in design.md section 4. The two fragments of a card belong to the same D4 orbit.
  - Tests (Property 14, first part; Property 12 layout corner sets): ♥/♦ card layer is pixel-identical after 180° rotation; ♣/♠ card layer is pixel-identical after horizontal-axis reflection; both fragments are in the same D4 orbit; unprinted corners are blank; 90°/270° placement is not representable (type-level and runtime rejection); ♣ 0° and ♠ 180° share corner set TR+BR, ♣ 180° and ♠ 0° share TL+BL.
  - _Requirements: 5.2, 5.4, 5.5, 12.3, 12.4, 14.1, 14.5, 14.6_

  - [x] 3.1 Implement `fragments.ts` and `render.ts`
    - Use the frozen codebook. Derive the second fragment from the base pattern; do not store it separately.
    - _Requirements: 5.2, 14.1_

  - [x] 3.2 Write symmetry, orbit, blank-corner, and placement tests (Property 14)
    - Cover the list in Tests above.
    - _Requirements: 5.4, 5.5, 12.3, 12.4, 14.6_

  - [x] 3.3 Run tests and record results
    - Save output to `docs/optical/results/m3-*`. Record failures; do not hide them.
    - _Requirements: 12.7_

- [ ] 4. Image-based fragment detection and decoding
  - Dependencies: task 3.
  - Deliverables: `src/optical/detect.ts` (adaptive binarization, connected components/contours, quadrilateral approximation, 4-point homography, 7×7 sampling, all border cells must be black), `src/optical/decode-fragment.ts` (5×5 read, match against 416 templates with radius r_acc, returns card, observed transform, distance). r_acc defaults to 1 and can be set to 2.
  - Acceptance criteria: decoding uses pixels only. A clean image with no marker returns NOT_DETECTED. A marker whose nearest template is farther than r_acc returns CORRUPTED_FRAGMENT. The two outcomes are distinct.
  - Tests (Property 24): all 52 cards × 8 transforms on clean synthetic images decode to the right card and observed transform; for each card, 0..r_acc bit flips decode to the original card (guaranteed for r_acc ≤ 2 by distance ≥ 5); for r_acc = 1, 2–3 flips always give CORRUPTED_FRAGMENT (guaranteed); for r_acc = 2 no flip count has a guaranteed rejection, and for flips beyond the guaranteed ranges (≥ 4 for r_acc = 1, ≥ 3 for r_acc = 2) false acceptance of another card is possible, so the test measures and records the false-acceptance and rejection rates instead of asserting zero; r_acc > 2 is rejected; blank or marker-free image gives NOT_DETECTED while a marker with too many flipped bits gives CORRUPTED_FRAGMENT.
  - _Requirements: 5.3, 12.2, 13.1, 13.4, 13.5_

  - [x] 4.1 Implement `detect.ts`
    - Marker border detection, homography, and 7×7 sampling in plain TypeScript.
    - _Requirements: 12.1, 13.4_

  - [x] 4.2 Implement `decode-fragment.ts`
    - Read the 5×5 data, match templates, return card, observed transform, and distance.
    - _Requirements: 13.5_

  - [ ] 4.3 Write fragment decode and bit-flip tests (Property 24)
    - Cover the list in Tests above.
    - _Requirements: 12.2, 13.4_

  - [ ] 4.4 Run tests and record results
    - Save output to `docs/optical/results/m4-*`. Record failures; do not hide them.
    - _Requirements: 12.7_

- [ ] 5. Four-card identification and exact sum
  - Dependencies: task 4.
  - Deliverables: `src/optical/decode-group.ts` (corner clustering, 8-hypothesis check (4 rotations × 2 reflection states) against the slot table, reflection reporting, sum), `src/optical/reference-check.ts` (`ReferenceCheck.compare` returning REFERENCE_MISMATCH, plus an independent reference sum from a Card_Value table lookup). The decoder signature accepts only a grayscale image. Physical-geometry support code lives in `src/optical/testing/` (not production).
  - Note on Hidden_Sum bounds: the bounds 4 and 52 do not require four cards of equal rank. Both are achievable with four distinct cards using the four suits: A♥ A♦ A♣ A♠ gives 1+1+1+1 = 4, and K♥ K♦ K♣ K♠ gives 13×4 = 52. Both arrangements are valid under the slot table and both get a test.
  - Acceptance criteria: for every observed arrangement and image transform the result is IDENTIFIED with the correct card set and a hiddenSum equal to the independent reference. Reflection is reported as NOT_REFLECTED/REFLECTED when ♥ or ♦ is present and as AMBIGUOUS for ♣/♠-only groups. Each result carries 2 interpretations (♥/♦ present) or 4 (♣/♠ only).
  - Tests (Properties 20, 23, 25, 26, 14 second part): all 81 observed arrangements × 8 image transforms (648 images) decode with correct card set, hiddenSum, reflection, and interpretation count, and the determined/ambiguous counts are 520/128; boundary groups {A♥, A♦, A♣, A♠} (sum 4) and {K♥, K♦, K♣, K♠} (sum 52) are each identified; seeded random 4-card groups drawn from the real 52 cards with arbitrary camera rotation; a mirrored image is never reported as NOT_REFLECTED when reflection is determinable, and AMBIGUOUS is never reported as NOT_REFLECTED or REFLECTED; a type-level test shows the decoder has no board-state parameter; `ReferenceCheck.compare` returns REFERENCE_MISMATCH on a different card set and never replaces the decoded result with expected values; mirroring the whole image does not change the identified card IDs.
  - _Requirements: 5.6, 5.7, 12.2, 13.1, 13.2, 13.3, 13.4, 13.5, 13.7, 13.9, 14.7, 15.2, 15.4, 15.6_

  - [ ] 5.1 Implement `decode-group.ts`
    - Cluster four markers around the center, run the 8 hypotheses, classify the passing set per design.md section 7 step 6, and sum Card_Values. Internal error when the passing-hypothesis count is not 0, 2, or 4.
    - _Requirements: 5.6, 13.1, 13.5, 13.9_

  - [ ] 5.2 Implement `reference-check.ts`
    - `ReferenceCheck.compare(result, referenceCards)` returns REFERENCE_MISMATCH on a differing card set and does not alter the result.
    - _Requirements: 13.2, 13.3, 13.9_

  - [ ] 5.3 Write group decoding, reflection, boundary-sum, and API tests (Properties 20, 23, 25, 26)
    - Cover the list in Tests above.
    - _Requirements: 13.2, 13.7, 13.9, 14.7_

  - [ ] 5.4 Implement the physical card composer and containment function (test support)
    - Dependencies: 5.1–5.3. Deliverables: `src/optical/testing/physical-card.ts` with `PhysicalGeometry { cardWidthMm: 63.5, cardHeightMm: 88.9, moduleMm: 1.5875, cornerRadiusMm: 3.175, insetModules: 1, quietMarginModules: 1, gapMm: 0, tableGray }`, `renderPhysicalCard`, `composeBoard` (zero intended gap, per-card shift/rotation errors, 2×2 and 3×3 boards with Distractor_Markers), and `markerContainment(geometry)` implementing the analytic formulas in design.md. Do not modify `render.ts` or the frozen codebook.
    - Tests (Property 27, Property 28 setup): clearance formula vs rasterized rounded-corner mask over a sweep grid (radius 0, 2.0, 3.0, 3.175, 3.6, 4.0, 5.0, 6.0 mm × inset 0.5, 1, 1.5, 2 modules); every printed marker pixel lies inside the mask at baseline; at 6 mm radius with inset 1 the containment is reported as invalid; zero-gap composition has seam white separation of 2(inset+margin) modules and the black squares of adjacent cards form separate connected components; central void area matches 4(1−π/4)r² within raster tolerance; deterministic output for fixed inputs.
    - _Requirements: 15.1, 15.2, 15.3, 15.5_

  - [ ] 5.5 Add double-sided rendering and flip-equivalence tests (test support)
    - Dependencies: 5.4. Deliverables: extend `src/optical/testing/physical-card.ts` with `Card_Face` (`FRONT` | `BACK`), `printLayers(card)` (front and back layers in the body frame, the back derived only from the same card's front layer by horizontal mirroring of positions and fragment pixel content), `observeFace(card, face, orientation, flip?)`, `flipCard(axis)` for vertical-axis and horizontal-axis flips, `duplexRegistration { dxMm, dyMm, rotDeg }`, a cut-outline offset parameter, and a separate asymmetric artwork probe layer that is never mirrored. Do not modify `render.ts` or the frozen codebook.
    - Tests (Properties 29, 30, 31): all 52 cards × orientations {0°, 180°}: observed marker layer after a vertical-axis flip is pixel-identical to the front observation (positions, bits, pixels, decoded card id via `detectMarkers` bits); a horizontal-axis flip equals the opposite permitted orientation of the front; negative test: printing the same body-frame raster on both faces gives a different observation after flipping for every card (corner positions or bits) and is rejected; front and back corner sets are disjoint for all four suits; back layer is a pure function of the card (changing neighboring cards or board state cannot change it); artwork probe is not mirrored while the marker layer is; containment is identical for both faces and shrinks by the registration/cut error; no fragment is ever regenerated from neighboring cards.
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

  - [ ] 5.6 Run the geometry experiments and record the decision table
    - Dependencies: 5.4, 5.5. Run group decoding on physical compositions with fixed seeds (at least 200 trials per cell, at least 1,000 for the baseline cell): radius sweep {0, 2.0, 3.0, 3.175 (baseline), 3.6, 4.0, 5.0, 6.0} mm; inset {1, 1.5, 2} modules; small placement errors (shift along a seam 0–1.5 mm, per-card rotation 0–3°, unintended gap 0–1 mm); camera rotation, perspective, blur, lighting gradient; dark and light table; 3×3 boards with Distractor_Markers; incomplete groups (one card absent); face FRONT/BACK, vertical-axis and horizontal-axis flips, duplex registration shift 0/0.25/0.5/1.0 mm and rotation 0/0.5/1°, cut-outline offset 0/0.5/1.0 mm (all as parameter sweeps; real tolerances are unknown), applied on top of the radius/inset sweep. Statistics are computed separately for each experimental cell (each combination of geometry and degradation parameters) and never pooled across different geometries, faces, flips or degradation conditions. For each cell record: the number of trials n; the count and rate of exactly correct recognition (all four cards and the sum correct); the count and rate of rejections, with the rejection kinds tallied; the count and rate of incorrect identification (a wrong card set or sum returned as IDENTIFIED, i.e. false acceptance); and, when the false-acceptance count is 0, the exact one-sided 95% upper confidence bound on the per-trial false-acceptance probability, 1 − 0.05^(1/n) (about 3/n; about 0.30% for n = 1,000 and about 1.5% for n = 200). Also record the tally of failure causes and the minimum distance between Central_Void and the nearest marker for each cell. When the false-acceptance count is not 0, record the count and rate and the failing seeds instead of a zero-event bound. Write `docs/optical/results/geometry-experiments.json` and `.md` (deterministic, no timestamps) with a decision table that follows the improvement order in Requirement 15.7: a corner-radius reduction may only be recommended after steps 1–4 are evaluated and recorded. State "synthetic images, not real cameras" in every output file: these are synthetic-test findings about the sampled conditions only, they do not measure or guarantee real-camera performance, and the zero-event bound applies only to the sampled synthetic condition distribution (independent seeded trials). Record failures and failing seeds; do not loosen thresholds or change geometry because of a single failing case.
    - Acceptance: baseline results and the effect of each geometry adjustment are recorded; no claim of real-camera performance; n, correct, rejection and false-acceptance counts and rates are reported per cell without pooling, with the exact one-sided 95% upper bound 1 − 0.05^(1/n) for every cell whose false-acceptance count is 0 (0 is an observation under the sampled conditions, not a mathematical guarantee, and says nothing about real cameras). Registration/cut tolerances are evaluated before any change to card shape (Requirement 15.7, 16.8).
    - _Requirements: 15.4, 15.6, 15.7, 15.8, 15.9, 16.8_

  - [ ] 5.7 Run tests and record results
    - Save output and the 520/128 counts to `docs/optical/results/m5-*`. Record failures; do not hide them.
    - _Requirements: 12.7_

- [ ] 6. Invalid and incomplete composition rejection
  - Dependencies: task 5.
  - Deliverables: rejection test suite; changes to `decode-group.ts` only where the tests expose gaps. Any failure found is recorded in `docs/optical/results/m6-*`.
  - Acceptance criteria: no result is IDENTIFIED when any rule is violated.
  - Tests (Property 15, with Properties 24 and 25): removing 1 to 3 fragments gives INCOMPLETE_GROUP; a duplicate card gives DUPLICATE_CARD; flipping r_acc+1 to 4−r_acc bits in one fragment gives CORRUPTED_FRAGMENT (non-empty only for r_acc = 1); observed transforms not in the slot table (90°-rotated fragment, ♥ content in a ♦ slot) give INVALID_ARRANGEMENT; three-fragment compositions never give IDENTIFIED; a property-based sweep over all violation types asserts the result kind is never IDENTIFIED; a physical composition with one card absent (rounded-corner voids, three markers around the vertex) gives INCOMPLETE_GROUP; distractor markers from neighboring cards never complete or alter a group; an incomplete group is rejected on either face and after a flip.
  - _Requirements: 5.7, 12.6, 13.4, 13.6, 13.7_

  - [ ] 6.1 Write rejection tests (Property 15)
    - Cover the list in Tests above.
    - _Requirements: 12.6, 13.4, 13.7_

  - [ ] 6.2 Fix gaps in `decode-group.ts` found by 6.1
    - Make changes only where a test fails. Record each failure and fix.
    - _Requirements: 13.4, 13.6_

  - [ ] 6.3 Run tests and record results
    - Save output to `docs/optical/results/m6-*`. Record failures; do not hide them.
    - _Requirements: 12.7_

- [ ] 7. Synthetic-image robustness testing
  - Dependencies: task 6.
  - Deliverables: `src/optical/degrade.ts` (seeded degradations: fragment position error 0 / 0.1 / 0.25 module, arbitrary camera rotation angles, perspective, blur, noise, illumination gradient, optional reflection), `scripts/run-robustness.ts`, `docs/optical/results/robustness.json` and `robustness.md`. All outputs are labeled "synthetic images, not real cameras". Add a condition family that applies the degradations to physical-geometry compositions from `src/optical/testing/physical-card.ts` (baseline radius, and any radius/inset the decision table of task 5.6 marks as a candidate) and report it separately from the flat-layout conditions, on both faces and after flips, including duplex registration error.
  - Acceptance criteria: at least 1,000 trials per condition, with fixed seeds. For each condition the files record the correct-identification rate, the rejection rate, and the misidentification count (a wrong card or sum returned as IDENTIFIED). Misidentification is judged at two separate levels. (1) Mathematical guarantee: only inside the independent-bit-flip model of design.md section 7 (correction up to 2 bit errors; for r_acc = 1, rejection of 2–3 bit errors). There is no guarantee for arbitrary image corruption, and false acceptance of another card is possible beyond those ranges. (2) Finite-sample experimental pass criterion: for each condition record n, the observed misidentification count and, when the count is 0, the one-sided 95% upper confidence bound 1 − 0.05^(1/n) (about 3/n; about 0.30% for n = 1,000) on the per-trial misidentification probability for that synthetic condition distribution. The task passes this criterion when the observed count is 0 in every measured condition. Any observed misidentification marks the task failed-with-findings: record the failing seeds and conditions and do not loosen thresholds. A pass means no misidentification was observed in n synthetic trials; it does not mean the probability is zero and it does not transfer to real cameras. Success rates are measurements, not pass/fail.
  - Tests (Properties 15, 20, 24, 26): degradation functions are deterministic for a given seed; degradations at zero strength leave images unchanged; a test asserts that `robustness.json` records n, the observed misidentification count and, for zero counts, the 95% upper bound 1 − 0.05^(1/n) (computed correctly) for every condition, and that the observed count is 0 for every condition (the experimental pass criterion, not a mathematical guarantee).
  - _Requirements: 12.5, 12.7_

  - [ ] 7.1 Implement `degrade.ts`
    - Each degradation takes an explicit seed and parameters.
    - _Requirements: 12.5_

  - [ ] 7.2 Implement `scripts/run-robustness.ts`
    - Run at least 1,000 trials per condition and write the JSON and Markdown outputs, including failing seeds.
    - _Requirements: 12.5, 12.7_

  - [ ] 7.3 Write degradation determinism and misidentification-count tests
    - Cover the list in Tests above.
    - _Requirements: 12.5_

  - [ ] 7.4 Run tests and record results
    - Run the robustness script and `npm test`. Save real output to `docs/optical/results/`. Record failures and failing seeds; do not hide them. State that the results come from synthetic images, not real cameras.
    - _Requirements: 12.5, 12.7_

- [ ] 8. Physical-camera validation preparation
  - Dependencies: task 7.
  - Deliverables: `scripts/render-print-sheet.ts` (PNG/SVG print sheets of the 52 cards' fragments at configurable module size, for example 1.5 mm and 2.0 mm, with registration marks), `docs/optical/physical-test-protocol.md`.
  - Protocol contents: printer and paper, module sizes, lighting, distance, phone models, matte versus glossy, card die-cut corner radius and measured clearance between marker margin and card edge on real prints (caliper or ruler), zero-gap 2×2 placement, rounded-corner outline overlay and the Central_Void on the print sheet, and a corner-radius comparison only if the task 5.6 decision table reached the radius-reduction step, a left-right flip test on real prints (observed positions and bits before and after the flip), verification of the duplex print-file convention (whether the printer or vendor mirrors the back page), measured front/back registration and cutting error with a ruler or caliper, show-through check (see the Acceptance criteria), and a hidden-information note (markers on both faces expose card identity), a result-recording template, and pass criteria drawn from task 7 and stated at the finite-sample level (the number of real trials n per condition is fixed in the protocol before testing, for example n = 100, whose zero-event 95% upper bound 1 − 0.05^(1/n) is about 3%; the observed misidentification count and the bound are recorded; any observed misidentification is a recorded failure; success rates are recorded as measurements; zero observed misidentifications in n real trials is not a mathematical guarantee and does not imply zero probability).
  - Acceptance criteria: this task prepares physical testing only. No real-camera results exist at this point, and none may be claimed until they are recorded in the template with real prints and real devices. Show-through verification (Requirement 16.10): in the body frame the back-face markers sit under the front's blank corners (for example hearts: front TL+BR, back TR+BL), so the protocol must measure, on real prints of both faces, with front lighting and backlighting and on the intended stock (matte and glossy), the gray-level contrast of each blank corner against clean paper and compare it with the detector's marker contrast requirement (detect.ts needs at least 40 gray levels between border and margin). Record the measured contrast and the margin to the threshold. Verify that blank corners are never reported as markers and that a card whose inward corner is blank (an invalid placement such as a heart in a TR slot) never produces a complete group; record n and the 95% upper bound for these checks. If show-through is not below the detection threshold by a recorded margin, the response is a change of stock opacity or ink density, not a change of the codebook or the approved double-sided geometry.
  - Tests (Properties 14, 21): sheet generation is deterministic (same inputs give identical bytes); every card appears exactly once on the sheets; each sheet decodes back through the decoder from the rendered raster; the protocol file exists; front/back sheet pair obeys the convention: decoding the back sheet raster mirrored as a viewer would see it gives the same bits as the front.
  - _Requirements: 12.7, 16.10_

  - [ ] 8.1 Implement `scripts/render-print-sheet.ts`
    - Configurable module size in mm, registration marks, deterministic output. Optional cut-outline overlay with the configurable corner radius. Generate front and back print sheets using the documented back-page convention (back viewed from its own face looks like the front) with registration marks on both.
    - _Requirements: 12.7_

  - [ ] 8.2 Write `docs/optical/physical-test-protocol.md`
    - Include the sections listed above and a blank result-recording template. Include the show-through measurement procedure.
    - _Requirements: 12.7, 16.10_

  - [ ] 8.3 Write print-sheet and protocol tests
    - Cover the list in Tests above.
    - _Requirements: 12.7_

  - [ ] 8.4 Run tests and record results
    - Save output to `docs/optical/results/m8-*`. Record failures; do not hide them.
    - _Requirements: 12.7_

## Notes

- Open decisions that do NOT block this prototype (see `docs/open-decisions.md`, created separately): which card face carries the fragments; how identities stay hidden before predictions; whether random starting cards must form a valid Composite Code; UI handling of the ♣/♠-only reflection ambiguity; conflicts with the printed-card front layout.
- Phases 3–4 tasks (game engine, AI, simulator, browser UI, PWA, companion app) will be generated after the optical prototype review.
- Scoring values are undecided and are not part of this plan.
- Physical card geometry experiments (Requirement 15) are in task 5.4–5.6 (synthetic), task 7 (combined degradations) and task 8 (real prints).
- Double-sided markers (Requirement 16): rendering and flip-equivalence tests are task 5.5, experiments with duplex registration are task 5.6, real-print flip test is task 8. The hidden-information limitation is documented in design.md and docs/open-decisions.md; no safeguard has been implemented or validated.
- Zero-misidentification statements in tasks 7 and 8 are finite-sample experimental criteria with a recorded confidence bound, not mathematical guarantees. The show-through risk of back-face markers under the front's blank corners (Requirement 16.10) is verified on real prints in task 8.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["0.1"] },
    { "id": 1, "tasks": ["0.2"] },
    { "id": 2, "tasks": ["1.1"] },
    { "id": 3, "tasks": ["1.2"] },
    { "id": 4, "tasks": ["1.3"] },
    { "id": 5, "tasks": ["1.4"] },
    { "id": 6, "tasks": ["2.1"] },
    { "id": 7, "tasks": ["2.2"] },
    { "id": 8, "tasks": ["2.3"] },
    { "id": 9, "tasks": ["2.4"] },
    { "id": 10, "tasks": ["2.5"] },
    { "id": 11, "tasks": ["3.1"] },
    { "id": 12, "tasks": ["3.2"] },
    { "id": 13, "tasks": ["3.3"] },
    { "id": 14, "tasks": ["4.1"] },
    { "id": 15, "tasks": ["4.2"] },
    { "id": 16, "tasks": ["4.3"] },
    { "id": 17, "tasks": ["4.4"] },
    { "id": 18, "tasks": ["5.1"] },
    { "id": 19, "tasks": ["5.2"] },
    { "id": 20, "tasks": ["5.3"] },
    { "id": 21, "tasks": ["5.4"] },
    { "id": 22, "tasks": ["5.5"] },
    { "id": 23, "tasks": ["5.6"] },
    { "id": 24, "tasks": ["5.7"] },
    { "id": 25, "tasks": ["6.1"] },
    { "id": 26, "tasks": ["6.2"] },
    { "id": 27, "tasks": ["6.3"] },
    { "id": 28, "tasks": ["7.1"] },
    { "id": 29, "tasks": ["7.2"] },
    { "id": 30, "tasks": ["7.3"] },
    { "id": 31, "tasks": ["7.4"] },
    { "id": 32, "tasks": ["8.1"] },
    { "id": 33, "tasks": ["8.2"] },
    { "id": 34, "tasks": ["8.3"] },
    { "id": 35, "tasks": ["8.4"] }
  ]
}
```
