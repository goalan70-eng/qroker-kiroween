# Optical module status

**All optical results in this repository come from synthetic images, not real cameras.** No real printed card, printer, cutter, paper, flip or camera has been used. Nothing here measures or guarantees real-camera performance.

**Status: paused.** Optical research is paused to prioritize the playable game; resume later for Scoring Companion integration. Milestones 0 to 6 are complete, Task 7.1 is complete, Task 7.2 is in progress (scaffolding only, sweep not run), and Tasks 7.3, 7.4 and Milestone 8 are not started. Task status lives in `.kiro/specs/qroker-game/tasks.md`; this file does not change it.

Contents: (a) what exists, (b) verified results, (c) limitations and risks, (d) deferred work and how to resume, (e) browser integration requirements, (f) independence from the game engine.

## a. What the optical module provides today

### Modules in `src/optical/`

| Module | Purpose |
|---|---|
| `codebook.ts`, `codebook.v1.json` | Codebook generator (seed `0x51524f4b`, mulberry32) and the **frozen** codebook: 52 cards, 5x5 data bits, 416 templates (8 D4 transforms per card), pairwise Hamming distance >= 5. SHA256 of `codebook.v1.json`: `515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4` (checked in this task; matches). Never edit this file. |
| `verify-codebook.ts` | Independent verifier. Shares no code with the generator or `transforms.ts`. Exports `verifyCodebook(input)`, `recomputeSha256`. |
| `transforms.ts` | The 8 D4 transforms of a 5x5 pattern: `TRANSFORM_NAMES`, `applyTransform(g, pattern25)`, `BIT_PERMUTATIONS`. |
| `fragments.ts`, `render.ts` | Card layout and rendering. `ALL_CARDS`, `FRAGMENT_LAYOUT`, `printedFragments(card)`, `placedFragments(card, orientation)`, `visibleCorners`. `renderMarker(pattern25, modulePx)`, `renderCardLayer(card, orientation, ...)`, `sampleMarkerBits`, image helpers (`rotate180`, `reflectHorizontalAxis`, `applyImageTransform`), `GrayImage`, `FOOTPRINT_MOD` (9), `CARD_W_MOD` (40), `CARD_H_MOD` (56), `DEFAULT_MODULE_PX` (4). |
| `detect.ts` | `detectMarkers(image, options?)` returns `DETECTED` (markers plus rejected candidates), `INVALID_MARKER` or `NOT_DETECTED`. Options: `binarization` (`'otsu'` default or `'adaptive'`), `minSizePx` (default 14), `minContrast` (default 40) and others. |
| `decode-fragment.ts` | `decodeFragment(input, options?)` matches one marker or 25-bit pattern against the 416 templates (default acceptance radius `r_acc` = 1, configurable to 2; larger values throw `RangeError`). Also `decodeDetection`, `createFragmentMatcher`, `getDefaultFragmentMatcher`. |
| `decode-group.ts` | **Main entry point.** `decodeGroup(image: GrayImage, options?: DecodeGroupOptions): GroupDecodeResult`. Takes one grayscale image and tuning options only, never board state. Result kinds: `IDENTIFIED` (cards, hiddenSum, reflection, interpretations, readings, members, vertex), `NOT_DETECTED`, `INVALID_MARKER`, `INCOMPLETE_GROUP`, `CORRUPTED_FRAGMENT`, `AMBIGUOUS_FRAGMENT`, `DUPLICATE_CARD`, `INVALID_ARRANGEMENT`. Options include `detect`, `radius`, `centerOffsetModules` (default 5.5), `positionToleranceModules` (default 1.0), `sizeRatioRange`, `axisToleranceDeg`, `uncertainThreshold`. Also exports `ALLOWED_PLACEMENTS`, `SLOTS`, `composeTransforms`, `inverseTransform`, `mapCell`. |
| `reference-check.ts` | Separate from decoding. `ReferenceCheck.compare(result, referenceCards)` (same function as `compareWithReference`) returns the original result when it is not IDENTIFIED or matches, `REFERENCE_MISMATCH` (with `CARD_SET_DIFFERS`, `DECODED_SUM_INCONSISTENT`, `DECODED_RESULT_MALFORMED`) or `INVALID_REFERENCE`. `referenceHiddenSum(cards)` is an independent Card_Value sum (A=1 ... K=13). Imports only types from `decode-group.ts`. |
| `degrade.ts` | Seeded image degradations for synthetic tests (Task 7.1): `degrade(image, params)`, `warpHomography`, `rotateImage`, `perspectiveImage`, `blurImage`, `addNoise`, `applyIllumination`, `reflectImage`, `shiftFragments`, `fragmentOffsets`. Test support, not for the decoder path. See `docs/optical/results/m7-1-degrade.md`. |
| `prng.ts` | `mulberry32(seed)`. |

### Testing support in `src/optical/testing/`

`physical-card.ts` (rounded-card geometry, print layers, `observeFace`, `flipCard`, duplex registration and cut offset), `group-compose.ts`, `rejection-support.ts` (independent oracle for rejection tests), `warp.ts`, `detect-conditions.ts`, `geometry-*.ts` (Milestone 5 geometry experiment), `robustness-design.ts`, `robustness-trial.ts`, `robustness-report.ts` (Task 7.2 experiment, not yet run). Test files are `*.test.ts` next to the sources.

### npm scripts that exist (`package.json`)

| Script | Purpose |
|---|---|
| `npm test` | `vitest --run` |
| `npm run test:ci` | `vitest --run --maxWorkers=4`. Use this one (see section c, load-sensitive tests). |
| `npm run check:codebook` | Regenerates the codebook and checks it is byte-identical to `codebook.v1.json`. |
| `npm run verify:codebook` | Independent verifier. |
| `npm run generate:codebook`, `npm run verify:bound` | Generator and enumeration bound. |
| `npm run render:samples` | Sample renders into `docs/optical/samples`. |
| `npm run measure:detection`, `measure:decode-fragment` | Milestone 4 measurements. |
| `npm run measure:geometry`, `merge:geometry`, `verify:geometry` | Milestone 5 geometry sweep: measure per shard, merge, verify the stored results. |
| `npm run analyze:geometry`, `analyze:45deg` | Failure diagnostics and the 45-degree analysis. |
| `npm run collect:decode-counterexamples`, `collect:rejection-counterexamples` | Regenerate the stored counterexample files. They write into `docs/optical/results/`. |
| `npm run robustness -- <flags>` | Task 7.2 runner (`scripts/run-robustness.ts`); see section d. |

## b. Verified results

Every number below is quoted from the linked file and applies to synthetic images only. This task did not re-run any test or script.

| Source | Headline as stated there |
|---|---|
| `docs/optical/results/m5-7-milestone5-validation.md` | `test:ci` on a quiet machine: 20 files, 433 tests passed. All 81 observed arrangements x 8 image transforms = 648 images are IDENTIFIED with correct cards and sum; reflection counts 260 NOT_REFLECTED / 260 REFLECTED / 128 AMBIGUOUS; 520 results with 2 interpretations and 128 with 4. Geometry sweep: 824 cells, 168,000 trials, 0 false accepts (0.30% one-sided 95% upper bound at n = 1000 per cell). Incomplete groups: 9,600 trials, all INCOMPLETE_GROUP. Baseline geometry (r = 3.175 mm, inset 1, 2x2, FRONT, n = 1000): CLEAN_DARK and CLEAN_LIGHT 100.0%, MODERATE 96.7%, STRESS 81.4% correct, rest rejected, 0 false accepts. |
| `docs/optical/results/geometry-experiments.md` and `.json` | The per-cell data behind the Milestone 5 numbers, the decision table (no corner-radius reduction recommended) and the failure analysis. `geometry-experiments-plan.md` is the design. |
| `docs/optical/results/m6-3-milestone6-validation.md` | `test:ci` on a quiet machine: 21 files, 487 tests passed. 15 violation types (removed fragments, duplicates, corrupted fragments, wrong suit, turned fragments, distractors, spurious candidates) were never IDENTIFIED. Radius 1: all flip masks of weight 0 to 3 on 24 fragments (63,024 `decodeFragment` calls) corrected (0 to 1 flips) or rejected (2 and 3 flips). Radius 2: 40 of 2,745 pixel runs with 3 or more flips were IDENTIFIED with wrong cards (not an error rate; the runs are not a random sample). All 40 are caught by `ReferenceCheck.compare`. The same file discloses that two later full-suite runs under CPU contention timed out. |
| `docs/optical/results/m6-1-counterexamples.json`, `.md` (also `m6-1-coverage.md`, `m6-1-defects.md`, `m6-2-no-production-fix.md`) | The 40 preserved radius-2 counterexamples with seeds; coverage; the nearest-complete-group observation; the decision to make no production change. |
| `docs/optical/results/m4-*.md`, `m5-4-*.md`, `m5-5-*.md`, `m5-6-*.md` | Detection and fragment decoding limits, physical-card composition, double-sided flip equivalence, test-suite stability, 45-degree analysis. |

Test counts changed after Milestone 6 (Task 7.1 and the Task 7.2 scaffolding added test files). The current count was not measured in this task.

## c. Known limitations and unresolved risks

1. **Marker-like gate in `detect.ts` and 45-degree pixel phase.** The gate `quadArea / hullArea < 0.85` drops a component silently. The geometry cell with camera rotation exactly 45 degrees at inset 2 measured 0 of 200 correct. The 100% results at exactly 45 degrees (inset 1 and 1.5) sample a single pixel phase and must not be read as robust: with fractional-pixel shifts at 45 degrees, inset 1 lost 20 of 160 trials and inset 1.5 lost 10 of 160. Lowering the gate recovered the failures in a what-if run but was not applied and its false-positive effect was not measured. Source: `m5-7-milestone5-validation.md` section C.1 and C.2, `m5-6-45deg-analysis.md`.
2. **Spurious marker `0x5AC54`.** `detect.ts` can report a small black blob in a data area as a marker with bits `0x1FFFFFF`. It is handled at group level only (CORRUPTED_FRAGMENT, or `SPURIOUS_CANDIDATE` in `others`); the detector is unchanged, and it is untested on real images.
3. **`positionToleranceModules` stays 1.0; registration and cut sensitivity.** In the synthetic sweep, a 1 mm back registration shift, a 1 mm cut offset, a 1 degree registration rotation and a 2 degree per-card placement rotation each take the baseline cell below 95% correct. Re-running only failing seeds at tolerance 1.5 decoded them, but widening was not adopted and would need validation against false grouping. This is the main physical risk for Milestone 8.
4. **Radius-2 false acceptances; default `r_acc` = 1.** With distance 5, correction is guaranteed only for up to 2 bit errors in the independent bit-flip model. At radius 2, 3 or more flips can be accepted as another card of the same suit, which no group-level check can reject. Only `ReferenceCheck.compare` catches this. Keep the default radius 1.
5. **Reflection is `AMBIGUOUS` for groups containing only clubs and spades** (128 of the 648 images). The decoder never guesses; the UI decision is open.
6. **Hidden information in double-sided markers.** A readable marker on either face can reveal hidden cards (Requirement 16.9, design.md Physical Card Geometry section 7). Neither the decoder nor the app can remove this. Paper show-through (Requirement 16.10) is not simulated.
7. **Nearest-complete-group behavior.** If the vertex at the image center has only 3 fragments and a complete group exists elsewhere in the image, `decodeGroup` returns IDENTIFIED for that other group, with that group's own `vertex`. This matches design.md step 2, so the caller must verify the vertex (section e).
8. **Sensitivities measured, not defects:** blur of 1.5 px or more and perspective tilt of 30 degrees or more lose most trials at 4 px per module in the geometry sweep.
9. **`design.md` result types differ from the code.** The code adds `INVALID_MARKER`, `AMBIGUOUS_FRAGMENT`, `INVALID_REFERENCE`, `DISTRACTOR_FRAGMENT`, `SPURIOUS_CANDIDATE` and the reference-mismatch reason codes, among others. See `m6-2-no-production-fix.md` and `m5-7-milestone5-validation.md` section D. design.md was not updated.
10. **Load-sensitive tests.** `detect.test.ts` ("blurred non-integer scales") and `physical-card.test.ts` ("a rotated card is rotated about its centre") use the 5,000 ms default timeout and fail under CPU saturation (for example an Android emulator or a running sweep). Use `npm run test:ci`, and run it only when the machine is quiet. No per-test timeout was added.
11. **Requirement 15.7 steps 2 and 3** (marker size and margin, detection algorithm) were not evaluated; the 3.175 mm corner radius is an unconfirmed commercial value; the codebook, thresholds and tolerances have been tuned on no real data.

## d. Deferred work and how to resume

| Item | State |
|---|---|
| Task 7.2 | In progress. Exists: `scripts/run-robustness.ts`, `src/optical/testing/robustness-{design,trial,report}.ts` with tests, `docs/optical/results/robustness-plan.md`, `robustness-bench.json` (checkpoint commit `8ee89d5`). **The sweep has not been run:** 263 conditions, 363,000 trials (family A flat: 84 conditions, 179,000 trials; family B physical: 179 conditions, 184,000 trials). `docs/optical/results/robustness.json` and `robustness.md` do not exist. |
| Task 7.3 | Not started: degradation determinism and misidentification-count tests, including a test that reads `robustness.json`. |
| Task 7.4 | Not started: run the robustness script and `npm test`, save real output and failing seeds under `docs/optical/results/`. |
| Milestone 8 | Not started: `scripts/render-print-sheet.ts`, `docs/optical/physical-test-protocol.md`, tests, then real prints and cameras. |

The Task 7 pass criterion ("observed misidentification count 0 in every measured condition") is **unevaluated**. Do not report it as met.

### Resuming Task 7.2

Read `docs/optical/results/robustness-plan.md` first (design, levels, timing, launch procedure). Commands, all via `npm run robustness -- ...`:

```
--list [--family flat|physical] [--match TEXT]     list conditions
--plan [--out FILE]                                regenerate the plan (deterministic)
--bench [--write] [--scaling 4,8]                  time representative conditions
--run [--family flat|physical] [--shard i/k] [--cell ID] [--work-dir DIR] [--max-trials N] [--force]
--repro --cell ID --trial N [--image FILE.png]     re-run one trial
--merge [--work-dir DIR] [--out-dir DIR] [--allow-partial]   writes robustness.json / .md
```

Recommended procedure from the plan: check machine load first; smoke test with `--run --max-trials 5 --work-dir .robustness-smoke` (never into `docs/optical/results`); run family A, then family B, in 8 shards (`--shard i/8`, `i` = 0..7); merge. Results go to `.robustness-work/` and a stopped run resumes by skipping finished conditions. Do not run `npm run test:ci` during the sweep. **Run only when the machine is quiet.** Measured on an i5-10400F (12 logical processors) the plan projects about 8.28 h single process, about 2.24 h with 4 processes and about 1.42 h with 8 processes; one development benchmark taken while an Android emulator used 7 to 11 logical processors was about three times slower. Level and profile choices are already fixed in the plan; do not tune them after seeing results.

## e. Browser integration requirements (future Scoring Companion)

**None of this has been tested in a browser.** All measurements are Node on a desktop CPU, with synthetic images.

1. **Input is grayscale only.** `decodeGroup` takes `GrayImage = { width, height, data: Uint8Array }` (row-major, one byte per pixel, 255 = white, 0 = black). Converting a camera frame (for example `canvas.getImageData()` RGBA, or a video frame) to luminance is the caller's job. No such conversion exists in the repository and it has not been tested against the decoder.
2. **Image scale.** In the synthetic measurements a module (marker cell) was 4 px. `detect.ts` documents exact reads from 2 px per module on crisp markers (outer marker edge 14 px, `DEFAULT_MIN_SIZE_PX`) and from about 2.5 px per module after blur. These are synthetic limits; the required camera resolution on real devices is unknown.
3. **Run in a Web Worker.** Decoding is synchronous and CPU-bound, so it must not run on the UI thread. Transfer the pixel buffer to the worker. Whether `GroupDecodeResult` objects survive `postMessage` structured cloning was not checked.
4. **Cost.** Decode-only timings from `robustness-plan.md` section 9 (Node v24.20.0, i5-10400F, one process, ms per `decodeGroup` call on synthetic rasters): flat 128 x 128 px image 1.1 to 1.2 ms; 2x2 physical board (146 modules wide, about 584 px at 4 px per module, derived from the plan) 5.6 to 8.6 ms; 3x3 board raster (about 2.6 MP) 10.5 to 16.2 ms. A 1080p frame has about 2.1 MP, so the 3x3 numbers are the nearest synthetic reference, but this is an analogy. Phone CPU and browser JIT timings are unmeasured. The measurements exclude RGBA to gray conversion and worker transfer.
5. **Node-only APIs in production modules: the decoder currently is not browser-ready.** See the grep finding below. A browser bundle needs a way to load the codebook without `node:fs`; that is a source change and was out of scope for this document. The frozen codebook must stay byte-identical (check its SHA256).
6. **Target_Region and vertex verification (Requirements 9.6 to 9.11).** The decoder reports `vertex` for IDENTIFIED results. The Companion must verify that the vertex lies in the Target_Region (9.8), discard a result from another vertex (9.9), ask for repositioning, rescan or manual entry (9.10), and use decoded identities only (9.11). This contract is documented (design.md "Scoring Companion integration contract: target-group safety") but not implemented or tested.
7. **Never substitute expected identities.** On `REFERENCE_MISMATCH`, keep the decoded identities and the reference separate and show the conflict; do not replace one with the other. Use `ReferenceCheck.compare` outside the decoder.
8. **Manual-entry fallback on every non-IDENTIFIED result** (`NOT_DETECTED`, `INVALID_MARKER`, `INCOMPLETE_GROUP`, `CORRUPTED_FRAGMENT`, `AMBIGUOUS_FRAGMENT`, `DUPLICATE_CARD`, `INVALID_ARRANGEMENT`) and on `REFERENCE_MISMATCH` and `INVALID_REFERENCE`. Handle `reflection: 'AMBIGUOUS'` explicitly.
9. **No board state in decoding.** Do not pass expected cards or board data into `decodeGroup`; only layout parameters such as `centerOffsetModules`, derived from the printed layout, are allowed. The type signature and tests enforce this.
10. **Offline and Service Worker.** The decoder needs no network, but the bundle must include the codebook data and the worker script in the precache list. The codebook version must travel with the bundle.
11. **Hidden-information policy** (c.6) applies: any marker readable from either face can reveal hidden cards, whatever the app does.

### Grep finding: Node-only APIs in `src/optical` (non-test, non-script files)

Searched `src/optical/**/*.ts` excluding `*.test.ts` for `node:` imports, `require(`, `fs`/`path`/`url`, `readFileSync`, `import.meta`, `process.`, `Buffer`, `__dirname`, `fileURLToPath`, `performance.now`, DOM globals.

| File | Finding | In the `decodeGroup` import chain? |
|---|---|---|
| `fragments.ts` | `node:fs` `readFileSync`, `node:url` `fileURLToPath`, `new URL('./codebook.v1.json', import.meta.url)`. The codebook is read at **module load** (`export const ALL_CARDS = load().order`). | **Yes** (`decode-group.ts` and `render.ts` import it). |
| `decode-fragment.ts` | Same `node:fs` and `node:url` imports; reads the codebook in `getDefaultFragmentMatcher()`. | **Yes** (`decode-group.ts` imports it). |
| `codebook.ts`, `verify-codebook.ts` | `node:crypto` `createHash`. | No (generator and verifier). |
| `testing/detect-conditions.ts`, `testing/rejection-support.ts` | `node:fs`, `node:url`, `import.meta.url` | No (test support). |
| `testing/geometry-trial.ts`, `testing/robustness-trial.ts` | `performance.now()` (also available in browsers) | No (test support). |
| `detect.ts`, `transforms.ts`, `render.ts`, `degrade.ts`, `prng.ts`, `reference-check.ts`, `decode-group.ts` | No Node-only API found. | n/a |

Conclusion: importing `decodeGroup` in a browser today fails or needs a bundler shim, because `fragments.ts` and `decode-fragment.ts` read the codebook from disk. The detection and grouping algorithms themselves use no Node API, and `reference-check.ts` is clean. The `scripts/` folder (outside `src/optical`) uses `node:child_process` and similar and is not part of the runtime. `@types/node` is installed, so `tsc` does not flag these imports. This finding is from a text search only; no bundling or browser load was attempted.

## f. Independence from the game engine

The optical module is independent of the game engine. It imports nothing from any game code and takes no game or board state. The game engine must not import `src/optical` for the practice mode (browser game without the camera). The only intended consumer is the future Scoring Companion, and that integration is deferred.
