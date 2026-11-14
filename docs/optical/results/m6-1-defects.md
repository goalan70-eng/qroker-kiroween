# Task 6.1: defects and surprising behaviour

SYNTHETIC images only. Source: `src/optical/decode-group.rejection.test.ts` (54 tests, all passing), `m6-1-coverage.md`, `m6-1-counterexamples.{json,md}`.

## Decoder defects found

None. Every rule of Property 15 (a)-(d) that the design makes mathematically decidable held for every generated case, and the decoder agreed with the
independent brute-force predictor (`testing/rejection-support.ts`, `predictGroup`) in all 2,745 radius-2 pixel runs. No production file was changed and no
known-defect test (`it.fails`) was needed. Task 6.2 has nothing to fix on this evidence.

## Observations that need a decision (not defects against the written design)

### 1. A complete group elsewhere in the image is returned when the centre vertex is incomplete

- Behaviour: design.md section 7 step 2 picks, among the complete four-marker sets, the one closest to the frame centre. With a 3-fragment group at the image
  centre and a genuine, complete group further away, `decodeGroup` returns `IDENTIFIED` for the far group (built only from its own four markers, `vertex` = the far
  group's vertex). It never mixes the three target fragments with the far group.
- Reproduction (test "8. unrelated valid distractor markers > CHARACTERIZATION ..."): with `G = groups(6, 20251215 + 800)` (arrangement i is drawn with
  `drawArrangement(mulberry32(20251215 + 800 + i), mode)`, mode any / red / cs for i mod 3 = 0 / 1 / 2), `G[0]` is the target with one slot removed at the centre of an
  88 x 88 module canvas (modulePx 6), and `G[1]` is complete with its vertex 28 modules to the right of the centre. The test asserts the CURRENT behaviour (far group
  returned, vertex within one module of the far vertex).
- Clause involved: Requirement 13.4 (1) "fewer than 4 fragments are detected around a vertex" and Property 15 (a) ("removing one or more fragments returns INCOMPLETE_GROUP")
  for the image centre. The design text is literal about "the set", so the decoder matches it. A Scoring Companion that wants "the group I pointed at" must compare
  `vertex` with the frame centre; the decoder does not.
- Needs your decision for task 6.2: keep as is and document `vertex` as mandatory to check, or change `decode-group.ts` so that a nearer vertex with 3 markers makes the
  result INCOMPLETE_GROUP. Changing it affects the 3x3 board behaviour (the nearest complete vertex wins today, see D "3x3 patches with several complete vertices"), so it was not changed.

### 2. Radius 2 accepts some corrupted fragments as another card, and the group checks cannot always catch it

- Measured (seed 20251201, one corrupted fragment per run): 40 of 2,745 pixel runs returned IDENTIFIED with a different card set and a different sum; 20 of the 180
  fragment-level false acceptances at k = 3 survive the duplicate and arrangement checks. All are listed with seed, slot, flipped module positions and cards in
  `m6-1-counterexamples.md`. Example 1: group seed 20251204, slot BL, true card S-9, modules (0,3) (0,4) (2,3) inverted, read as S-4 (Fv): cards S-2 S-3 S-4 S-Q, sum 21 instead of 26.
- Clause: Property 24 (c), (d): at radius 2 there is no guaranteed rejection interval and misidentification beyond 2 flips is allowed and measured, not asserted. Not a defect.
  It is the quantitative reason the default radius is 1 (at radius 1, 2-3 flips are guaranteed rejected; this test file asserts that exhaustively for 24 fragments and by pixels for 480 cases).
- Inherent to a distance-5 code: a falsely accepted word is another valid card of the same suit at a transform the slot table allows, so no group-level check can reject it.
  Only the Scoring Companion reference comparison (`REFERENCE_MISMATCH`) can notice it; the counterexample replay test shows that it does.

### 3. Smaller notes

- `INCOMPLETE_GROUP.markers` counts every marker in view (each physical card also shows its second fragment elsewhere), `detected` counts the fragments around the vertex. In flat 2x2 images
  they are equal; in the physical 2x2 board with one card absent they are 3 and 6. Only `detected` is asserted for physical boards.
- Turning ONE fragment by 180 degrees, Fh or Fv (192 cases: 16 groups x 4 slots x 3 transforms) was invalid in every case, including groups with hearts and diamonds;
  no valid composition arose, so no case had to be excluded.
- Precedence (design step 4 before 5 before 6): a corrupted fragment is reported before DUPLICATE_CARD, and DUPLICATE_CARD before INVALID_ARRANGEMENT. Asserted in
  "3. duplicate card identity > precedence ...", and implied by every duplicate construction whose second copy has an arbitrary transform (96 images).
