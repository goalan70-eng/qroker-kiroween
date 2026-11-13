# Task 5.3 coverage matrix (Properties 20, 23, 25, 26)

All images are synthetic (rendered pixels, warped in software). None of this is real-camera validation.

Files: `D` = `src/optical/decode-group.test.ts` (44 tests), `R` = `src/optical/reference-check.test.ts` (32 tests),
`N` = new `src/optical/decode-group.properties.test.ts` (23 tests, includes 4 oracle self-checks).
No production file, existing test, or `codebook.v1.json` was changed (SHA256 515ECEB3...CC2D4 verified after the run).

## Properties

| Property | Existing tests | New tests |
|---|---|---|
| 20 Read-out sum | D "648 images ... right cards/sum"; D "boundary sums"; R section 4 "independent sum" (52 cards, 2,000 random 4-sets, boundary sums) | N P-C (300 seeded groups, independent rank-table sum, sums in [4, 52]) |
| 23 Slot interpretation and sum | D "648 images" (cards, sum, interpretation count 2/4, 520/128 split, interpretation for the true hypothesis lists the true slots); D "pattern-level oracle agrees on all 648"; D section 5 property test (60 runs, random D4 + angle) | N P-A (hypothesis sets {h, h∘R180}; 2+2 split for clubs/spades-only; group-frame quarter-turn offset from camera angle accounted for); N P-C |
| 25 No substitution | D "static scan", D "type level", D "result carries no expected-value fields"; R section 3 (set differs, same-sum differs), R section 8 (never swapped), R section 10 (module boundaries), R section 11 (648 images end to end) | N P-D (type level, extended), N P-E (decoding unaffected by comparison, same-sum wrong reference) |
| 26 Reflection reporting | D "648 images" (260 / 260 / 128, never NOT_REFLECTED for mirrored, never REFLECTED for plain); D section 5 mirrors + rotations | N P-B (per transform h, reflection derived by determinant of a real 3x3 raster) |

## Requested checks

| Check | Covered by |
|---|---|
| Four-card identification with independent Hidden_Sum | D "648 images" (`referenceSum` in `testing/group-compose.ts`); R section 4; N P-C (rank-index table in the test file) |
| Reflected / non-reflected classification | D "648 images"; N P-B (determinant oracle, all 8 transforms) |
| AMBIGUOUS preserved | D "648 images" (128 AMBIGUOUS, never with a red suit); N P-B (clubs/spades-only is AMBIGUOUS for every h); N P-A (2 + 2 interpretations) |
| Boundary sums 4 and 52 | D section 3 (all 8 transforms, pixels); R section 4 "boundary groups" (pure + decoded); N oracle self-check; N P-C range assertion |
| Correct REFERENCE_MISMATCH | R sections 3, 5, 8, 11; N P-E (same-sum wrong set -> `CARD_SET_DIFFERS`, `decoded` is the original object) |
| No substitution of expected identities | R section 8 property, R section 11; N P-E (`decodedCards` and `hiddenSum` stay the decoder's) |
| No board-state dependency | D "static scan" + "type level"; R section 10; N P-D (no board/expected/reference/state/hand/cards option key, `@ts-expect-error` on board option and on a third argument, `compareWithReference` signature) ; N P-E (decode before/after/between comparisons identical) |
| Rejection of invalid / duplicate / corrupted / incomplete compositions | D section 6 (INCOMPLETE_GROUP, NOT_DETECTED, DUPLICATE_CARD, INVALID_ARRANGEMENT, CORRUPTED_FRAGMENT, INVALID_MARKER); D sections 7-8 (distractors, spurious markers); R sections 6-7 (non-identified pass-through, invalid references) |
| Deterministic tests, reproducible failures | D/R fixed seeds; N: every case is a function of one seed; N P-F (messages carry seed, mode, transform, angle, arrangement; same seed rebuilds identical pixels and result) |

## Notes on the new tests

- P-D overlaps D "type level" for the parameter list. The additions are the option-key scan, the
  compile-time rejections (checked by `npx tsc --noEmit`) and the `compareWithReference` signature.
- P-A: the group frame is defined only modulo a quarter turn, so with a camera angle the reported hypothesis is
  `R90^q after t`, q = round(angle / 90). The test computes this by matching rasters and accepts both
  neighbours within 3 degrees of a +-45 boundary. The pair structure {h, h∘R180} holds in all cases.
- P-C draws four distinct cards of the 52-card deck per case, with a random transform and angle, from seed
  `20251126 + 5000 + i`, i = 0..299.

## Results

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no errors |
| focused: `decode-group.properties.test.ts`, `decode-group.test.ts`, `reference-check.test.ts` | 3 files, 99 tests passed (23 + 44 + 32) |
| full `npx vitest --run` | 14 files, 289 tests passed (baseline 13 files, 266 tests; +1 file, +23 tests) |

No failures remain. During development the new tests failed twice because of test bugs (sort order of canonical
card ids; camera angle changing the reported hypothesis), both fixed in the test file. No decoder defect was found.
