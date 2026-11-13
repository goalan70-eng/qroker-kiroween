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
- Acceptance radius r_acc defaults to 1 and is configurable to 2.
- Independence rule: the codebook verifier must not import code from the generator or from the transform implementation the generator uses. It re-derives the 8 cell maps itself and works from the frozen JSON and rasterized fragments.

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
  - Tests (Property 24): all 52 cards × 8 transforms on clean synthetic images decode to the right card and observed transform; for each card, flips of 0..r_acc bits decode to the original card; flips of r_acc+1..4−r_acc bits give CORRUPTED_FRAGMENT; no flip count ever decodes to another card; behavior checked for r_acc = 1 and r_acc = 2; blank or marker-free image gives NOT_DETECTED while a marker with too many flipped bits gives CORRUPTED_FRAGMENT.
  - _Requirements: 5.3, 12.2, 13.1, 13.4, 13.5_

  - [ ] 4.1 Implement `detect.ts`
    - Marker border detection, homography, and 7×7 sampling in plain TypeScript.
    - _Requirements: 12.1, 13.4_

  - [ ] 4.2 Implement `decode-fragment.ts`
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
  - Deliverables: `src/optical/decode-group.ts` (corner clustering, 8-hypothesis check (4 rotations × 2 reflection states) against the slot table, reflection reporting, sum), `src/optical/reference-check.ts` (`ReferenceCheck.compare` returning REFERENCE_MISMATCH, plus an independent reference sum from a Card_Value table lookup). The decoder signature accepts only a grayscale image.
  - Note on Hidden_Sum bounds: the bounds 4 and 52 do not require four cards of equal rank. Both are achievable with four distinct cards using the four suits: A♥ A♦ A♣ A♠ gives 1+1+1+1 = 4, and K♥ K♦ K♣ K♠ gives 13×4 = 52. Both arrangements are valid under the slot table and both get a test.
  - Acceptance criteria: for every observed arrangement and image transform the result is IDENTIFIED with the correct card set and a hiddenSum equal to the independent reference. Reflection is reported as NOT_REFLECTED/REFLECTED when ♥ or ♦ is present and as AMBIGUOUS for ♣/♠-only groups. Each result carries 2 interpretations (♥/♦ present) or 4 (♣/♠ only).
  - Tests (Properties 20, 23, 25, 26, 14 second part): all 81 observed arrangements × 8 image transforms (648 images) decode with correct card set, hiddenSum, reflection, and interpretation count, and the determined/ambiguous counts are 520/128; boundary groups {A♥, A♦, A♣, A♠} (sum 4) and {K♥, K♦, K♣, K♠} (sum 52) are each identified; seeded random 4-card groups drawn from the real 52 cards with arbitrary camera rotation; a mirrored image is never reported as NOT_REFLECTED when reflection is determinable, and AMBIGUOUS is never reported as NOT_REFLECTED or REFLECTED; a type-level test shows the decoder has no board-state parameter; `ReferenceCheck.compare` returns REFERENCE_MISMATCH on a different card set and never replaces the decoded result with expected values; mirroring the whole image does not change the identified card IDs.
  - _Requirements: 5.6, 5.7, 12.2, 13.1, 13.2, 13.3, 13.5, 13.7, 13.9, 14.7_

  - [ ] 5.1 Implement `decode-group.ts`
    - Cluster four markers around the center, run the 8 hypotheses, classify the passing set per design.md section 7 step 6, and sum Card_Values. Internal error when the passing-hypothesis count is not 0, 2, or 4.
    - _Requirements: 5.6, 13.1, 13.5, 13.9_

  - [ ] 5.2 Implement `reference-check.ts`
    - `ReferenceCheck.compare(result, referenceCards)` returns REFERENCE_MISMATCH on a differing card set and does not alter the result.
    - _Requirements: 13.2, 13.3, 13.9_

  - [ ] 5.3 Write group decoding, reflection, boundary-sum, and API tests (Properties 20, 23, 25, 26)
    - Cover the list in Tests above.
    - _Requirements: 13.2, 13.7, 13.9, 14.7_

  - [ ] 5.4 Run tests and record results
    - Save output and the 520/128 counts to `docs/optical/results/m5-*`. Record failures; do not hide them.
    - _Requirements: 12.7_

- [ ] 6. Invalid and incomplete composition rejection
  - Dependencies: task 5.
  - Deliverables: rejection test suite; changes to `decode-group.ts` only where the tests expose gaps. Any failure found is recorded in `docs/optical/results/m6-*`.
  - Acceptance criteria: no result is IDENTIFIED when any rule is violated.
  - Tests (Property 15, with Properties 24 and 25): removing 1 to 3 fragments gives INCOMPLETE_GROUP; a duplicate card gives DUPLICATE_CARD; flipping r_acc+1 to 4−r_acc bits in one fragment gives CORRUPTED_FRAGMENT; observed transforms not in the slot table (90°-rotated fragment, ♥ content in a ♦ slot) give INVALID_ARRANGEMENT; three-fragment compositions never give IDENTIFIED; a property-based sweep over all violation types asserts the result kind is never IDENTIFIED.
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
  - Deliverables: `src/optical/degrade.ts` (seeded degradations: fragment position error 0 / 0.1 / 0.25 module, arbitrary camera rotation angles, perspective, blur, noise, illumination gradient, optional reflection), `scripts/run-robustness.ts`, `docs/optical/results/robustness.json` and `robustness.md`. All outputs are labeled "synthetic images, not real cameras".
  - Acceptance criteria: at least 1,000 trials per condition, with fixed seeds. For each condition the files record the correct-identification rate, the rejection rate, and the misidentification count (a wrong card or sum returned as IDENTIFIED). The misidentification count must be 0 in every measured condition. If it is not, record the failing seeds and conditions and mark this task as failed-with-findings; do not loosen thresholds. Success rates are measurements, not pass/fail.
  - Tests (Properties 15, 20, 24, 26): degradation functions are deterministic for a given seed; degradations at zero strength leave images unchanged; a test asserts misidentification count = 0 for every condition in `robustness.json`.
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
  - Protocol contents: printer and paper, module sizes, lighting, distance, phone models, matte versus glossy, a result-recording template, and pass criteria drawn from task 7 (misidentification count must be 0; success rates are recorded as measurements).
  - Acceptance criteria: this task prepares physical testing only. No real-camera results exist at this point, and none may be claimed until they are recorded in the template with real prints and real devices.
  - Tests (Properties 14, 21): sheet generation is deterministic (same inputs give identical bytes); every card appears exactly once on the sheets; each sheet decodes back through the decoder from the rendered raster; the protocol file exists.
  - _Requirements: 12.7_

  - [ ] 8.1 Implement `scripts/render-print-sheet.ts`
    - Configurable module size in mm, registration marks, deterministic output.
    - _Requirements: 12.7_

  - [ ] 8.2 Write `docs/optical/physical-test-protocol.md`
    - Include the sections listed above and a blank result-recording template.
    - _Requirements: 12.7_

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
    { "id": 9, "tasks": ["2.4", "2.5"] },
    { "id": 10, "tasks": ["3.1"] },
    { "id": 11, "tasks": ["3.2"] },
    { "id": 12, "tasks": ["3.3"] },
    { "id": 13, "tasks": ["4.1"] },
    { "id": 14, "tasks": ["4.2"] },
    { "id": 15, "tasks": ["4.3"] },
    { "id": 16, "tasks": ["4.4"] },
    { "id": 17, "tasks": ["5.1"] },
    { "id": 18, "tasks": ["5.2"] },
    { "id": 19, "tasks": ["5.3"] },
    { "id": 20, "tasks": ["5.4"] },
    { "id": 21, "tasks": ["6.1"] },
    { "id": 22, "tasks": ["6.2"] },
    { "id": 23, "tasks": ["6.3"] },
    { "id": 24, "tasks": ["7.1"] },
    { "id": 25, "tasks": ["7.2"] },
    { "id": 26, "tasks": ["7.3"] },
    { "id": 27, "tasks": ["7.4"] },
    { "id": 28, "tasks": ["8.1"] },
    { "id": 29, "tasks": ["8.2"] },
    { "id": 30, "tasks": ["8.3"] },
    { "id": 31, "tasks": ["8.4"] }
  ]
}
```
