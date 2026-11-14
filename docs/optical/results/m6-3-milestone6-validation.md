# M6.3 Milestone 6 final validation report

**Synthetic images, not real cameras.** Every result in this report comes from images rasterized and warped in software, from the test support code in `src/optical/testing/`, and from a synthetic independent-bit-flip corruption model. No real printed card, printer, cutter, paper, flip or camera was involved. These results do not measure or guarantee real-camera performance. Real printing and photographing results are recorded separately (Requirement 12.7, 15.9) and belong to Milestone 8; none exist yet.

Raw command output (wall-clock fields and the absolute repository path normalized, nothing else edited; the normalization is stated at the top of each file):

| File | Content |
| --- | --- |
| `m6-3-tsc-output.txt` | `npx tsc --noEmit`, exit code 0, no diagnostics |
| `m6-3-test-ci-output.txt` | `npm run test:ci`, the recorded quiet-machine run, exit code 0, 21 files, 487 tests, per-file table |
| `m6-3-test-ci-recheck-output.txt` | one further `npm run test:ci` after the contention runs described in "Test-run disclosure (CPU contention)", moderate background load, emulator closed, exit code 0, 21 files, 487 tests, load samples before and after, per-file table |
| `m6-3-focused-output.txt` | focused run of the four decoder and rejection test files, exit code 0, 153 tests, one line per test, per-file table |
| `m6-3-codebook-output.txt` | `npm run check:codebook` and `npm run verify:codebook`, exit code 0 each, frozen SHA256 |
| `m6-3-counterexamples-regeneration-output.txt` | `npm run collect:rejection-counterexamples`, exit code 0, SHA256 before and after identical |

Environment: Node 24 (v24.20.0), Windows/PowerShell, vitest 5.1.0, HEAD `2133d3d` (task 6.1 = `c988cbd`). Task 6.2 (decision "no production fix", `m6-2-no-production-fix.md`) is an uncommitted document. No production code, test, threshold, default acceptance radius (r_acc = 1), position tolerance, the frozen codebook, gameplay or scoring was changed for this task. The 168,000-trial geometry sweep was not re-run.

Machine load before the recorded suite run (`m6-3-test-ci-output.txt`, made by a sub-agent): no sweep, analysis, vitest or tsx process was running. The only node processes were four idle MCP servers (0.05 to 0.2 CPU seconds each) and one desktop-assistant runtime (about 1.4 CPU seconds). The CPU counter read 0 to 8% before and between the commands (3% at the first check). The machine was not loaded during that run and no test timed out in it. This statement applies to that run only; two later full-suite runs under CPU contention did time out (next section).

## Test-run disclosure (CPU contention)

The recorded full-suite result in this report (section A, `m6-3-test-ci-output.txt`) comes from one quiet-machine run. It is not the only full-suite invocation of this task. After that run, the orchestrator ran `npm run test:ci` twice while the Android emulator (`qemu-system-x86_64-headless`, an unrelated application, about 977 s of accumulated CPU, running continuously) was active. Both runs showed `Test timed out in 5000ms` failures. Earlier runs in this milestone made by sub-agents were quiet and passed; the test count was 487 in every run that completed without a failure.

| Run | Conditions | Result | Raw log saved |
| --- | --- | --- | --- |
| Recorded run (`m6-3-test-ci-output.txt`) | quiet machine (CPU about 0 to 8%), no vitest, tsx or sweep process, sub-agent | exit 0; 21 files, 487 tests passed, 0 failed, 0 skipped | yes |
| Run A (orchestrator) | Android emulator active (unrelated application) | 1 failed, 20 passed (21 files); 1 failed, 486 passed (487 tests); duration 55.83 s; name of the failed test not captured | no (only the summary lines seen in the session) |
| Run B (orchestrator) | Android emulator active | 2 failed, 19 passed files; 2 failed, 485 passed tests. Failed: `src/optical/detect.test.ts` > "6. scaling (measured thresholds)" > "blurred non-integer scales: exact for effective modulePx >= 2.5 ..." (5720 ms) and `src/optical/testing/physical-card.test.ts` > "3x3 boards with Distractor_Markers" > "a rotated card is rotated about its centre ..." (5371 ms); both `Error: Test timed out in 5000ms` | no (only the summary lines seen in the session) |
| Focused rerun of the two files | after runs A and B: `npx vitest --run --maxWorkers=1 src/optical/detect.test.ts src/optical/testing/physical-card.test.ts` | 2 files, 95 tests passed (38.81 s) | no (only the summary lines seen in the session) |
| Recheck (`m6-3-test-ci-recheck-output.txt`) | emulator closed, moderate fluctuating background load (browser and desktop applications; mean 31.9% before, 27.6% after, range 11 to 79%) | exit 0; 21 files, 487 tests passed, 0 failed, 0 skipped; vitest duration 42.7 s | partly: summary lines and per-file table, not the full console stream (see the file header) |

What is and is not known about runs A, B and the focused rerun: no raw log of runs A and B was saved. Only the summary lines above were shown in the session, and they are reproduced here from that record. The name of the failed test in run A was not captured. Nothing in this report is invented to fill that gap. The same two tests (`detect.test.ts` blurred non-integer scales, `physical-card.test.ts` rotated card in 3x3 boards) are the load-sensitive tests identified in `m5-6-test-suite-stability.md`: they have no explicit timeout and use the 5,000 ms vitest default. That the failures are caused by CPU contention is an inference, supported by the timeout message, by the passing of both files alone with `--maxWorkers=1` (95 tests) and by the passing of the full suite in the quiet run and in the recheck. It is not proven by a logged CPU trace of runs A and B. No decoder, threshold, test, default radius (r_acc = 1) or codebook change was made in response; no functional defect is indicated.

Consequence for this report: the claim "487 of 487 tests passed" refers to the quiet-machine run (and to the recheck), not to every invocation. The test-suite stability limitation of Milestone 5 (`m5-6-test-suite-stability.md`; open item 5 in section D of this report) is still open and is now backed by this additional evidence: the full suite can fail with 5,000 ms timeouts when an unrelated heavy process is running. The Milestone 6 verdict is unchanged (MET WITH LIMITATION); this limitation is part of it (section G).

## A. Command results

| Command | Exit code | Result |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | no output, no diagnostics |
| `npm run test:ci` (`vitest --run --maxWorkers=4`), the recorded quiet-machine run (later runs: see "Test-run disclosure (CPU contention)") | 0 | 21 files passed, 487 tests passed, 0 failed, 0 skipped (about 36 s) |
| `npx vitest --run --maxWorkers=4 src/optical/decode-group.rejection.test.ts src/optical/decode-group.test.ts src/optical/decode-group.properties.test.ts src/optical/reference-check.test.ts` | 0 | 4 files, 153 tests passed (54 + 44 + 23 + 32), 0 failed, 0 skipped (about 36 s) |
| `npm run check:codebook` | 0 | regenerated codebook is byte-identical to `codebook.v1.json` |
| `npm run verify:codebook` | 0 | independent verifier PASS (dId = 5, dSelf = 6, minDistance = 5) |
| `npm run collect:rejection-counterexamples` | 0 | "2745 pixel runs, 40 IDENTIFIED with wrong cards"; both regenerated files byte-identical to the committed ones |

Failures in the commands of this table: none. In the recorded quiet-machine `test:ci` run no test timed out and no test file needed a rerun. This does not cover the later full-suite runs under CPU contention, which did fail with timeouts and are disclosed in "Test-run disclosure (CPU contention)" above.

Notes on how the commands were run, so that the record is honest:

- The `test:ci` run used the added reporter flags `--reporter=default --reporter=json --outputFile.json=<temp>`; the flags only produce the per-file table, the script line in the saved output is normalized to the `package.json` command.
- The focused run used the added flags `--reporter=verbose --reporter=json --outputFile.json=<temp>`. A first attempt with only the verbose reporter also passed (4 files, 153 tests) but produced no JSON table; it is not kept and the saved file is the repeat run.
- `collect:rejection-counterexamples` writes into `docs/optical/results/` in place and has no output-path option. It was therefore run only after the same computation (the exported `buildRejectionReport`, `renderJson`, `renderMarkdown` of the same script) had been written to a temporary directory and its SHA256 compared with the committed files. The result was identical (json `46764BE466632AA8952A07F2B51C4E814990231C969B5430C15B12425D6C35E2`, md `F2C1E78339696F53D6639A5520DEAEBDF4AC0053AB22B6266DBADF6D4706C729`). It took about 4 s. SHA256 before and after the real run are the same and `git status` shows no change in those files.

Per-file test counts (from the JSON report of the recorded quiet-machine `test:ci` run; the same table is at the end of `m6-3-test-ci-output.txt`; the recheck gives identical counts):

| Test file | Tests |
| --- | --- |
| `scripts/render-samples.test.ts` | 7 |
| `scripts/verify-bound.test.ts` | 1 |
| `src/optical/codebook.test.ts` | 10 |
| `src/optical/decode-fragment.bitflip.test.ts` | 21 |
| `src/optical/decode-fragment.test.ts` | 29 |
| `src/optical/decode-group.properties.test.ts` | 23 |
| `src/optical/decode-group.rejection.test.ts` | 54 |
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
| **Total** | **487** |

Count history: Milestone 5 final run 20 files, 433 tests (`m5-7-milestone5-validation.md`); task 6.1 added one file (`decode-group.rejection.test.ts`, 54 tests) and no other test file changed, so 21 files and 487 tests (433 + 54). The 6.1 record in `m6-1-coverage.md` gives the same 21 and 487.

Rejection file by section (`src/optical/decode-group.rejection.test.ts`, 54 tests; sections 1: 4, 3: 3, 4: 9, 5: 2, 6: 3, 7: 1, 8: 4, 9/10: 5, 11: 3, 12: 2, sweep: 18). The verbose list for every one of the 54 tests is in `m6-3-focused-output.txt`. No `it.fails`, `.skip`, `.todo`, `xit` or `xdescribe` is used in this file (checked in task 6.2).

## B. Milestone 6 verification items against evidence

Source of the criteria: `tasks.md`, task 6 ("Acceptance criteria", "Tests (Property 15, with Properties 24 and 25)", the Note on nearest-complete-group selection) and Requirements 5.7, 12.6, 12.7, 13.4, 13.6, 13.7. Verdicts: MET, MET WITH LIMITATION, NOT MET. All evidence is synthetic. Evidence is quoted from the tests of this run, from `m6-1-coverage.md`, `m6-1-defects.md`, `m6-1-counterexamples.json` and `m6-2-no-production-fix.md`.

### B.1 Summary

| # | Verification item | Verdict |
| --- | --- | --- |
| 1 | Incomplete group rejection (1, 2, 3 removed; all four removed gives the detection-failure result) | MET |
| 2 | Duplicate-card rejection | MET |
| 3 | Corrupted-fragment handling (radius 1 guaranteed; radius 2 measured, not asserted) | MET WITH LIMITATION |
| 4 | Invalid suit and orientation combinations | MET |
| 5 | Distractor-marker handling and the Companion target-verification contract | MET WITH LIMITATION |
| 6 | Double-sided and flipped-card rejection cases | MET WITH LIMITATION |
| 7 | Reference mismatch behaviour (no identity substitution) | MET |
| 8 | The known spurious-marker case (0x5AC54) at group level | MET WITH LIMITATION |
| 9 | No use of expected board identities in optical decoding | MET |
| 10 | Acceptance criterion: no result is IDENTIFIED when any rule is violated (approved decoder contract) | MET |
| 11 | Results recorded, failures not hidden, synthetic and real evidence kept apart (task 6.3, Requirement 12.7) | MET |

NOT MET: none. The limitations are explained per row below and in sections C and D; none of them was turned into a pass by changing a threshold, an assertion or a default.

### B.2 Details

**1. Incomplete group rejection: MET.**
Clause: Requirement 12.6, 13.4 (1), Property 15 (a).
- `decode-group.rejection.test.ts` "1. removed fragments": 4 groups x 15 non-empty subsets (1, 2, 3 or 4 removed fragments) x 8 image transforms. Removing 1, 2 or 3 fragments gives INCOMPLETE_GROUP with `detected` equal to the number of remaining fragments; removing all four gives NOT_DETECTED (not an identification failure result, the detection failure result of Requirement 13.4 (1)). The same subsets at 3 seeded camera angles each are rejected the same way, and the complete group stays IDENTIFIED at the same angles (control: whole-image rotation is not a violation).
- Physical 2x2 board with all markers omitted and a blank table: NOT_DETECTED.
- "7. three-fragment compositions are never IDENTIFIED": 20 groups x 4 missing slots x 8 transforms = 640 images, all INCOMPLETE_GROUP with `detected` 3 and 3 markers.
- Sweep violation types `REMOVE_1`, `REMOVE_2`, `REMOVE_3`, `REMOVE_ALL`, `THREE_FRAGMENTS_WITH_DISTRACTORS`, `SUIT_ABSENT_AT_CORNER`.
- Existing earlier tests: `decode-group.test.ts` "6. errors from real pixels > missing fragments".

**2. Duplicate-card rejection: MET.**
Clause: Requirement 13.4 (2), Property 15 (b).
- "3. duplicate card identity": all 14 suit-compatible (suit x slot pair) combinations at the identity view and a seeded camera view; a card in all four slots; a second copy shown as each of the 8 transforms for 12 ordered slot pairs (96 images): DUPLICATE_CARD in every case, never IDENTIFIED.
- Precedence of design.md section 7: a corrupted fragment is reported before DUPLICATE_CARD (test "precedence of design.md section 7").
- Sweep violation types `DUPLICATE_SAME_CARD`, `DUPLICATE_OTHER_TRANSFORM`.

**3. Corrupted-fragment handling: MET WITH LIMITATION.**
Clause: Requirement 13.4 (3), Property 15 (c), Property 24.
- Radius 1 (default), guaranteed region, bit level: "radius 1, bit level, EXHAUSTIVE": every flip mask of weight 0 to 3 on all 24 fragments of 6 groups (63,024 `decodeFragment` calls); weight 0 and 1 are corrected to the same card, weight 2 and 3 give CORRUPTED_FRAGMENT with distance greater than 1 to every template. The minimum Hamming distance between templates of different cards (d_id = 5) is recomputed independently in the test. The 2 and 3 flip guarantee follows from 5 - 3 = 2 > 1 (Property 24 (b)).
- Radius 1, pixels: 6 groups x 4 slots x (no flip, all 25 single flips, 10 seeded 2-flip, 10 seeded 3-flip), pixel inversion of data modules, seeded camera views: 0 or 1 flipped module corrected (IDENTIFIED with the right cards and sum), 2 or 3 give CORRUPTED_FRAGMENT with exactly one corrupted member. One flip in every fragment is corrected; two fragments with 2 flips each are both reported corrupted. Together with the exhaustive part, 480 pixel cases go through `decodeGroup`.
- Radius 2, guaranteed region: up to 2 flipped modules are corrected and never silently wrong (483 images: all single flips, seeded double flips, two fragments with 2 flips each).
- Radius 2, three or more flips: measured, not asserted (Property 24 (c), (d)). Seed 20251201, 8 seeded groups, one corrupted fragment per run, `decodeGroup(image, { radius: 2 })`: 2,745 pixel runs, 40 of them IDENTIFIED with a wrong card set and sum (k = 3: 20, k = 4: 10, k = 5: 2, k = 6: 2, k = 7: 1, k = 8: 5). The decoder agrees with the independent brute-force predictor in all 2,745 runs (0 disagreements). Exact bit-level counts over all 416 templates equal the Milestone 4 enumeration (k = 3: 956,800 events, 0 source card, 2,720 another card, 954,080 rejected). All 40 are preserved with seed, slot, flipped modules and cards in `m6-1-counterexamples.json` / `.md`, regenerated byte-identically in this run. The pixel runs are not a random sample (every bit-level accepted word plus at most 6 rejected words per group, slot and weight), so 40 of 2,745 is not an error rate.
- Why this is a limitation and not a failure: at radius 2 and distance 5 no rejection interval is guaranteed for 3 or more flips. A falsely accepted word becomes another card of the same suit at a transform the slot table allows, so no group-level check can reject it; only the reference comparison can (item 7). The default radius stays 1.
- Not enumerated: group-level behaviour at radius 1 for 4 or more flips (fragment level is in `m4-2-decode-fragment.*` and `m4-3-counterexamples.*`). Radius 1 has no rejection guarantee there either, because 4 flips can bring a word to distance 1 of another template.
- Sweep violation types `CORRUPT_2_FLIPS`, `CORRUPT_3_FLIPS`.

**4. Invalid suit and orientation combinations: MET.**
Clause: Requirement 13.4 (4), 13.6, Property 15 (d).
- "5. suit-incompatible slot": heart content (both printed variants) in TR and BL, diamond content in TL and BR, 6 groups x 8 = 48 images, seeded views: INVALID_ARRANGEMENT, and the independent oracle finds 0 hypotheses (no camera rotation or mirror explains it). Placing a card whose suit has no fragment at the facing corner leaves 3 markers: INCOMPLETE_GROUP, detected 3, for at least 40 (slot, suit, orientation) combinations (Property 15 closing sentence).
- "6. turning ONE fragment": 8 groups x 4 slots x {R90, R270, Dm, Da} = 128 images, turned in place as pixels: INVALID_ARRANGEMENT with reason NO_CONSISTENT_HYPOTHESIS, members still read as the same four cards. The same groups with the whole image rotated by 90, 270 and a seeded angle are IDENTIFIED (the distinction required by 13.6). Single fragment turned by 180 degrees, Fh or Fv: 16 groups (8 any, 8 clubs/spades-only) x 4 slots x 3 transforms = 192 cases, the oracle finds all 192 invalid, so none had to be excluded; the decoder equals the oracle in every case. Together the single-fragment cases cover 90, 270, 180, Fh, Fv and both diagonal reflections.
- Sweep violation types `WRONG_SUIT_CONTENT`, `FRAGMENT_ROTATED_90_OR_270`, `FRAGMENT_DIAGONAL_REFLECTION`, `FRAGMENT_180_OR_AXIS_REFLECTION_INVALID`.

**5. Distractor-marker handling: MET WITH LIMITATION.**
Clause: tasks.md "distractor markers from neighboring cards never complete or alter a group"; Requirement 13.4 (1); Requirements 9.6 to 9.11 for the Companion part.
- "8. unrelated valid distractor markers": a complete group inside an 8 x 8 lattice of valid markers of other cards at neighbour pitch (60% occupancy, other complete blocks allowed) stays IDENTIFIED with identical cards, sum, reflection and interpretations; a 3-fragment target inside a lattice with no complete block anywhere is INCOMPLETE_GROUP, detected 3, never IDENTIFIED; a valid marker 1.5, 2, 3 or 5 modules outward from the missing slot does not complete the group (144 images). Existing: `decode-group.test.ts` "7. unrelated markers and distractors".
- Physical 3x3 board with five neighbouring cards ("9/10"): complete centre group IDENTIFIED, one card absent INCOMPLETE_GROUP with `detected` 3, in every view (3 groups x 3 views x 5 scenes).
- Intentional nearest-complete-group behaviour (approved; design.md section 7 step 2; `m6-1-defects.md` observation 1; `m6-2-no-production-fix.md` section 2): if the vertex at the image centre has only 3 fragments and a genuine complete group is farther away, `decodeGroup` returns IDENTIFIED for the far group, built only from that group's own four markers and carrying the far group's own `vertex`. It never mixes target fragments with the far group. The characterization test asserts the current behaviour and is labelled as not a violation of the written design. Reproduction recipe: `groups(6, 20251215 + 800)`, `G[0]` with one slot removed at the centre of an 88 x 88 module canvas (modulePx 6), `G[1]` complete with its vertex 28 modules (168 px) to the right; control: the target alone gives INCOMPLETE_GROUP, detected 3.
- Companion target-verification contract (Requirements 9.6 to 9.11, design.md "Scoring Companion integration contract: target-group safety"): the decoder reports `vertex`; the Companion verifies that it lies in the Target_Region (9.8), discards a result from another vertex (9.9), asks for repositioning, rescan or manual entry (9.10), and uses decoded identities only (9.11). This is a contract for the Companion integration task, not implemented or tested in Milestone 6 (`m6-2-no-production-fix.md` section 3).
- Why MET WITH LIMITATION: the decoder contract holds in every test; the end-to-end guarantee "the group the user meant" depends on the Companion check that does not exist yet.

**6. Double-sided and flipped-card rejection cases: MET WITH LIMITATION.**
Clause: tasks.md "an incomplete group is rejected on either face and after a flip; a physical composition with one card absent (rounded-corner voids, three markers around the vertex) gives INCOMPLETE_GROUP"; Requirement 12.6.
- "9/10. physical composition (baseline rounded cards, zero gap)": FRONT, BACK + vertical-axis flip, BACK + horizontal-axis flip, with `observeFace` images assembled edge to edge and asserted pixel-identical to `composeBoard`; a complete group decodes IDENTIFIED in every view (precondition); 4 groups x 4 absent slots x 3 views = 48 2x2 scenes with one card absent (table gray in its place): three markers around the vertex, INCOMPLETE_GROUP, detected 3 (physically `markers` is 6 because each card also shows its second fragment elsewhere; only `detected` is asserted); a heart placed in the TR slot (diamond in TL, BR; heart in BL) shows no fragment at the facing corner: INCOMPLETE_GROUP in every view. A test asserts that the faces and flips exercised are exactly FRONT, BACK + vertical-axis flip, BACK + horizontal-axis flip.
- Earlier evidence (not a test of this task): `m5-7-milestone5-validation.md` records 9,600 incomplete-group trials (48 cells, 2x2 and 3x3) all INCOMPLETE_GROUP, 0 false accepts, and `physical-card.duplex.test.ts` the single-card flip equivalence.
- Limitation: all of this is the software model of a perfectly cut synthetic card. Paper show-through (Requirement 16.10), the real print-file convention (16.5, 16.6) and real registration and cut errors (16.8) are not simulated here. Camera rotation was applied to flat scenes only; the physical boards are tested at camera rotation 0 with the three physical views (`m6-1-coverage.md` "Not covered").

**7. Reference mismatch behaviour: MET.**
Clause: Requirement 13.7, Property 25.
- "12. reference comparison with rejected / incomplete / corrupted / wrong results": 3-fragment, 1-fragment, NOT_DETECTED, 3-flip CORRUPTED, DUPLICATE and one-fragment-turned INVALID_ARRANGEMENT results come back as the same object for the true reference and for a different valid reference; no `hiddenSum` is manufactured. A wrong IDENTIFIED result from the recorded radius-2 counterexamples, compared with the TRUE reference, is REFERENCE_MISMATCH, keeps the decoder's cards and sum, and never substitutes the reference.
- Every recorded group-level counterexample (the 40) is replayed from its seed: IDENTIFIED with the recorded wrong cards at radius 2, REFERENCE_MISMATCH against the true cards, and the k = 3 words are rejected at radius 1. This is the answer to the 40 of 2,745 radius-2 false acceptances at group level: the reference comparison catches all 40 in this test.
- `reference-check.test.ts` (32 tests) "5. tampered IDENTIFIED results", "6. non-identified results pass through unchanged", "8. IDENTIFIED if and only if identified result + valid + set-equal reference"; the sweep applies the comparison to every case.
- `REFERENCE_MISMATCH` and the extension kind `INVALID_REFERENCE` are in the code; design.md lists only the first (section D).

**8. The known spurious-marker case (0x5AC54) at group level: MET WITH LIMITATION.**
Clause: Requirement 13.4 (3) at group level; `m4-4-report.md` section E.
- "11. spurious candidates cannot fabricate a four-card group": a 0x5AC54 marker plus its blob at the missing slot of a 3-fragment target gives exactly what the brute-force predictor says for four read markers (CORRUPTED_FRAGMENT), never IDENTIFIED, and far away it changes nothing about a 3-fragment target; 1x2 and 3x3 black blobs, a disc in the Central_Void and 3% salt noise over the slot (4 groups x 4 slots) never complete a 3-fragment group; four markers that are not genuine fragments (solid black 7x7 or an empty frame) in the four slots give CORRUPTED_FRAGMENT, and a genuine group with one such marker in place of a fragment is also rejected. Sweep violation type `SPURIOUS_AT_MISSING_SLOT`. Existing: `decode-group.test.ts` "8. spurious markers (the documented 0x5AC54 case)" for complete targets.
- What remains unresolved in `detect.ts` (unchanged): the detector can still report a small black blob inside a data area as a marker with bits 0x1FFFFFF. The aspect-ratio decision of `m4-4-report.md` (tighten the detector, or tolerate spurious fragments in grouping) is not made. Milestone 6 handles the risk at group level; it does not remove it. It was observed once in the Milestone 4 image-level cells and 0 times in 2,179 re-run Milestone 5 sweep trials; it is untested on real images.

**9. No use of expected board identities in optical decoding: MET.**
Clause: Property 25; Requirement 13.7, 13.9.
- Type level: `decodeGroup(image: GrayImage, options?: DecodeGroupOptions)` has no board parameter. `decode-group.properties.test.ts` "P-D. Property 25: no board-state input (type level)" asserts the parameter list `[GrayImage, DecodeGroupOptions?]`, that no option name contains board, expected, reference, state, hand or cards, and that three `@ts-expect-error` probes (a board record as option, expected cards as option, a third argument) are compile errors; `npx tsc --noEmit` exit 0 in this run checks those lines. `decode-group.test.ts` "9. safety and API" asserts `decodeGroup.length <= 2`, a static scan of `decode-group.ts` (imports are exactly `./decode-fragment`, `./detect`, `./fragments`, `./render`, `./transforms`; no identifier matching board, expected, score, game, hand, reference or mismatch) and "result carries no expected-value or reference fields". `reference-check.test.ts` "10. module boundaries" asserts that `decode-group.ts` neither imports nor uses `reference-check.ts`.
- Tests pass images only: the rejection file builds every case from rendered or composed pixels and passes the image (plus a radius option) to `decodeGroup`; the expected identities exist only on the test side, to judge the result afterwards.
- The independent oracle shares no decoder code: `testing/rejection-support.ts` (`predictGroup`) and the oracles in `decode-group.test.ts` and `decode-group.properties.test.ts` do not import `decode-group.ts`, `decode-fragment.ts` or `detect.ts`. The only shared code is the rendering primitives `placedFragments`, `applyTransform` and the test-support image helpers, which also produce the test images. This was checked by searching the imports of `rejection-support.ts`, `group-compose.ts` and `warp.ts` in this task.
- Comparing with a reference never changes decoding: `decode-group.properties.test.ts` "P-E" (results identical before, after and between comparisons).

**10. Acceptance criterion: no result is IDENTIFIED when any rule is violated: MET.**
Under the approved decoder contract (Property 15 (a) to (d), Requirement 13.4, 13.6, 13.7):
- The sweep over 15 violation types (`REMOVE_1`, `REMOVE_2`, `REMOVE_3`, `REMOVE_ALL`, `DUPLICATE_SAME_CARD`, `DUPLICATE_OTHER_TRANSFORM`, `CORRUPT_2_FLIPS`, `CORRUPT_3_FLIPS`, `WRONG_SUIT_CONTENT`, `FRAGMENT_ROTATED_90_OR_270`, `FRAGMENT_DIAGONAL_REFLECTION`, `FRAGMENT_180_OR_AXIS_REFLECTION_INVALID`, `SUIT_ABSENT_AT_CORNER`, `THREE_FRAGMENTS_WITH_DISTRACTORS`, `SPURIOUS_AT_MISSING_SLOT`) never produced IDENTIFIED and always returned the expected kind. The validation seeds are listed in section C. A case whose violation exists only if the oracle says so (180 degrees, Fh, Fv) is generated until the oracle calls it invalid, so valid compositions are never counted as violations.
- What this does not claim: at radius 2, three or more flipped bits in one fragment are not a "violation the decoder is obliged to reject" (Property 24 (c), (d)); those cases are measured (item 3) and caught by the reference comparison (item 7), not asserted away. At the default radius 1 the guarantee is the 2 and 3 flip interval; flips outside the model, such as blur or perspective, are Milestone 7.

**11. Results recorded; failures not hidden; synthetic and real evidence apart (task 6.3, Requirement 12.7): MET.**
The command output is saved in `docs/optical/results/m6-3-*`. The commands recorded in section A had no failures. Two later full-suite runs under CPU contention did fail with timeouts; they are disclosed in "Test-run disclosure (CPU contention)", with the limit that their raw logs were not saved. The limitations that remain are listed here and in sections C and D. The 40 radius-2 counterexamples are preserved as files and replayed by a test. Nothing was marked as a known defect, skipped or loosened. Real-print and real-camera evidence does not exist and is not mixed with these results (section E).

## C. Seeds, preserved counterexamples and defects

Violation sweep (`describe('sweep: every violation type, seeded, deterministic')`, base `SEED = 20251215`):

| Item | Seeds |
| --- | --- |
| Per-type cases | 15 types x 12 cases = 180 cases; case i of type t uses seed `20251215 + 2000 + 97 * i + 10007 * indexOf(t)`, i = 0..11 |
| fast-check property | fixed seed `20251215`, 120 runs, type drawn from the 15, case seed an integer in 1 to 2,000,000 |
| Reproducibility test | seeds `20251215 + 3000` (all types) and `20251215 + 3001` (a deliberately wrong expectation, to show the tag) |

Other test seeds: group families `SEED + 100` (angles), `300`, `310`, `400`, `410`, `420`, `430`, `500`, `510`, `520`, `600`, `610`, `620..627`, `700`, `800`, `810`, `820`, `830`, `900`, `910 + group`, `1100`, `1110`, `1200` (all added to `20251215`). Radius-2 report: seed `20251201` (group i uses `20251201 + i`, 8 groups, modulePx 4). Every case is a function of (seed, violation); failure messages carry seed, violation, view (transform and angle), arrangement and detail.

Preserved counterexample files (radius 2, one corrupted fragment; byte-identical regeneration verified in this run):

- `docs/optical/results/m6-1-counterexamples.json` (SHA256 `46764BE466632AA8952A07F2B51C4E814990231C969B5430C15B12425D6C35E2`)
- `docs/optical/results/m6-1-counterexamples.md` (SHA256 `F2C1E78339696F53D6639A5520DEAEBDF4AC0053AB22B6266DBADF6D4706C729`)
- earlier fragment-level counterexamples: `m4-3-counterexamples.json` / `.md`.

Example 1 (reproduced in task 6.2): group seed 20251204, TL:S-2@180 TR:S-3@0 BL:S-9@180 BR:S-Q@0, slot BL, data modules (0,3) (0,4) (2,3) inverted: radius 1 gives CORRUPTED_FRAGMENT; radius 2 gives IDENTIFIED with S-2 S-3 S-4 S-Q, sum 21 (true sum 26); the reference comparison against the true cards is REFERENCE_MISMATCH.

Defects: none. `m6-1-defects.md` records no decoder defect; task 6.2 found no reproducible defect and changed nothing; the recorded quiet-machine run passed 487 of 487 tests (the two later contention failures are timeouts of load-sensitive tests, not a defect; see "Test-run disclosure (CPU contention)"). No known-defect test (`it.fails`) was needed.

## D. Open items carried forward

1. **Design versus code result types** (`m6-2-no-production-fix.md` section 5, items 1 to 11). The code is richer than the types in design.md: result kinds `INVALID_MARKER` and `AMBIGUOUS_FRAGMENT`, `INCOMPLETE_GROUP.markers`, per-slot `nearestDistances` in `CORRUPTED_FRAGMENT`, the `Located` fields (`vertex`, `groupAxisDeg`, `others`, `alternativeClusters`), `INVALID_ARRANGEMENT.reason`, the `FragmentReading` field names, `SlotInterpretation.hypothesis` and orientation `'EITHER'`, `radius?: 1 | 2` instead of `acceptRadius?: 0 | 1 | 2`, and `INVALID_REFERENCE` in `reference-check.ts`. Scoring Companion code written against the design types would not compile against the code. A documentation task must bring design.md in line with the code; this task did not edit design.md.
2. **Spurious-marker detector** (`detect.ts` unchanged): the 0x5AC54 blob is handled at group level, not prevented; the aspect-ratio decision of `m4-4-report.md` is not made.
3. **Marker-like gate 0.85 in `detect.ts` and the 45-degree pixel-phase harness property** from Milestone 5 (`m5-7-milestone5-validation.md` section C.1, C.2; `m5-6-45deg-analysis.md`): unresolved; changing the gate needs a full re-run of the 824 cells as a separate data set. Not touched here.
4. **`positionToleranceModules` stays 1.0** (Milestone 5 section C.3); the 1 mm registration and cut sensitivity is a Milestone 8 risk.
5. **Per-test timeout proposal** (`m5-6-test-suite-stability.md`): not applied. `vitest.config.ts` has no `testTimeout`, and the full suite must not be run while a sweep or analysis is running (CPU saturation gives `Test timed out in 5000ms` on tests without an explicit timeout). The rejection file sets its own timeouts (default 30 s, 120 s on the physical-board, exhaustive and regeneration tests, only as a guard against contention; each takes under 4 s alone). Unchanged by this task. The recorded run was on a quiet machine with no timeout; two later orchestrator runs while the Android emulator was active failed (run A: 1 test, name not captured; run B: 2 tests, one in `detect.test.ts` and one in `physical-card.test.ts`, both `Test timed out in 5000ms`), which is further evidence for this item (see "Test-run disclosure (CPU contention)"). The two files pass alone with `--maxWorkers=1`.
6. **Scoring Companion target-group verification** (Requirements 9.6 to 9.11): tests for "the vertex is in the Target_Region" and "a result from another vertex is discarded" belong to the Companion integration task. A decoder test asserting INCOMPLETE_GROUP for an off-centre incomplete vertex while a complete group is in view would test the Companion, not the decoder.
7. **Radius-1 group-level behaviour for 4 or more flips** is not enumerated at group level (fragment level only). Whether a larger radius pays for itself in recall is a Milestone 7 question; the default stays r_acc = 1.
8. **Milestone 7 scope** (not started): `degrade.ts`, `scripts/run-robustness.ts`, `robustness.json` / `.md`, at least 1,000 trials per condition with fixed seeds, blur, noise, perspective, illumination, fragment position error 0 / 0.1 / 0.25 module, and the physical-geometry condition family on both faces, after flips and with duplex registration error. Corruption other than inverted data modules is only measured there.
9. **Milestone 8 scope** (not started): real prints, real cutting and registration, show-through (Requirement 16.10), real cameras, the duplex print-file convention (16.5, 16.6), cut and registration tolerances (16.8), and the corner radius 3.175 mm (an unconfirmed commercial value).

## E. Boundary between synthetic and real evidence

What this report supports: in the rejection and decoder tests (153 of the 487 tests) on rendered and software-warped images, the group decoder never returned IDENTIFIED for a composition that breaks a rule of Property 15 (removed fragments, duplicate card, 2 or 3 flipped bits at radius 1, a transform outside the slot table or a suit-incompatible slot, a spurious blob, distractors), on flat layouts and on physical 2x2 and 3x3 boards with rounded corners on FRONT, BACK + vertical-axis flip and BACK + horizontal-axis flip, and it never read a board identity from anywhere but the image. The reference comparison catches the radius-2 false acceptances that the group checks cannot.

What it does not support: any statement about real printed cards, paper, cutting, registration or cameras; the independent-bit-flip model is not a model of blur, lighting or perspective, which are Milestone 7 (synthetic) and Milestone 8 (real). The absence of IDENTIFIED violations in a finite synthetic test set is not a proof that none exist elsewhere, and at radius 2 wrong identifications are known to exist beyond 2 flipped bits.

## F. Repository state checks

| Check | Result |
| --- | --- |
| HEAD | `2133d3d` (6.1 = `c988cbd`) |
| Frozen codebook SHA256 | `515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4` (unchanged; `git log --oneline -- src/optical/codebook.v1.json` shows only `c1575b9 feat: implement verified symmetric optical codebook`) |
| `git diff --name-only HEAD` | `.kiro/specs/qroker-game/tasks.md` and `.kiro/specs/qroker-game/tasks.meta.json` only (orchestrator bookkeeping; the checkbox of 6.3 was not ticked by this task) |
| Untracked files | `docs/optical/results/m6-2-no-production-fix.md` and the new `m6-3-*` files of this task (including `m6-3-test-ci-recheck-output.txt`) |
| `src/`, `scripts/`, `package.json`, `tsconfig.json`, `vitest.config.ts` vs HEAD | no differences |
| `.kiro/` | 5 files tracked (`specs/qroker-game/.config.kiro`, `design.md`, `requirements.md`, `tasks.md`, `tasks.meta.json`); `git check-ignore -v .kiro/specs/qroker-game/tasks.md` prints nothing (exit 1), so it is not ignored |
| Commit and push | none made |

## G. Verdict

All six recorded commands exited 0; in the recorded quiet-machine run 487 of 487 tests passed in 21 files (153 of 153 in the four focused decoder and rejection files), and the recheck on a moderately loaded machine with the emulator closed also passed 487 of 487. Two orchestrator runs under heavy CPU contention (Android emulator active) failed with 1 and 2 tests timed out at 5,000 ms and are disclosed above without raw logs; the same two files pass alone; the frozen codebook is unchanged and independently verified; the radius-2 counterexample report regenerates byte-identically (2,745 pixel runs, 40 preserved wrong identifications, 0 disagreements with the independent predictor). Seven items are MET (1, 2, 4, 7, 9, 10, 11), four are MET WITH LIMITATION (3 corrupted fragments at radius 2, 5 distractors and the Companion contract, 6 double-sided scenes in the synthetic model, 8 the spurious marker in `detect.ts`), and no item is NOT MET.

**Overall Milestone 6 verdict: MET WITH LIMITATION.** The acceptance criterion "no result is IDENTIFIED when any rule is violated" is met under the approved decoder contract on synthetic images. The limitations that qualify it are: radius-2 false acceptances beyond 2 flipped bits exist, are measured and are caught only by the reference comparison; the nearest-complete-group behaviour moves the target check to the Scoring Companion, which is not built; the full suite is not robust against heavy CPU contention (5,000 ms default timeout on `detect.test.ts` and `physical-card.test.ts` tests; evidence in "Test-run disclosure (CPU contention)" and `m5-6-test-suite-stability.md`; not fixed); the spurious-marker detector behaviour and the Milestone 5 detection items stay open; design.md does not describe the code's result types; and all evidence is synthetic.
