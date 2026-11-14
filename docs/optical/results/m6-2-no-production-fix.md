# Task 6.2: decision "no production fix necessary"

**SYNTHETIC images, not real cameras.** Every number below comes from rendered or warped synthetic images and a synthetic independent-bit-flip model. Nothing here is evidence about real cameras, real prints or real duplex printing (Milestone 8).

**No code changed in this task.** `src/optical/decode-group.ts`, every other production file, `codebook.v1.json`, the thresholds, the default acceptance radius (r_acc = 1), the position tolerances, gameplay and scoring are untouched. The only file this task adds is this document. No test was added, changed, skipped or marked as a known defect.

Codebook SHA-256 (unchanged): 515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4. Minimum Hamming distance between templates of different cards (d_id): 5.

## 1. Decision

Task 6.2 reads "Fix gaps in `decode-group.ts` found by 6.1. Make changes only where a test fails. Record each failure and fix." Task 6.1 produced no failing test, so there is nothing to record and nothing to fix. `decode-group.ts` stays as it is.

Justification, each point re-checked against the 6.1 evidence:

1. **No failing test.** `src/optical/decode-group.rejection.test.ts`: 54 tests, 54 passed, none skipped, none `todo`. The file contains no `it.fails`, `.skip`, `.todo`, `xit` or `xdescribe`. Command: `npx vitest --run --maxWorkers=4 src/optical/decode-group.rejection.test.ts` (about 20.6 s).
2. **Every mathematically decidable clause of Property 15 held.** (a) removing 1 to 3 fragments gives INCOMPLETE_GROUP, removing all 4 gives NOT_DETECTED; (b) a duplicate card gives DUPLICATE_CARD; (c) at r_acc = 1, 2 and 3 flipped bits in one fragment give CORRUPTED_FRAGMENT (asserted exhaustively for 24 fragments at bit level and for 480 pixel cases through `decodeGroup`); (d) a fragment observed with a transform outside the slot table, or a suit-incompatible fragment in a slot, gives INVALID_ARRANGEMENT, and the same turn applied to the whole image is accepted as a camera rotation (Requirement 13.6). The sweep over 15 violation types never produced IDENTIFIED. Requirement 13.7 (reference comparison never substitutes expected identities) held for every base result kind.
3. **Zero decoder-versus-oracle disagreements.** In all 2,745 radius-2 pixel runs, `decodeGroup` returned exactly what the independent brute-force predictor (`src/optical/testing/rejection-support.ts`, `predictGroup`) predicted. `predictionMismatches` is 0 in all six weight cells of `m6-1-counterexamples.json`.
4. **The wrong identifications at radius 2 are outside any guarantee.** Property 24 (c), (d) and design.md section 7 state that at r_acc = 2 there is no guaranteed rejection for 3 or more flips and that misidentification is measured, not asserted. They are not a defect of the decoder.
5. **The one surprising behaviour is an approved decision, not a defect** (section 2).

Genuine defect search: I found none that is reproducible against the approved decoder contract (Property 15 a to d, Requirement 13.4, 13.6, 13.7). The two surprising behaviours were reproduced independently (section 4) and both match the written design.

## 2. Intentional nearest-complete-group selection (approved decision)

design.md section 7, step 2, selects "the set closest to the frame center" among complete four-marker sets. Incompleteness is judged on the selected group, not on every vertex in the image. If a three-fragment vertex is nearer the frame centre than a genuine complete group, the three-fragment vertex is not a candidate and `decodeGroup` returns IDENTIFIED for the farther complete group. That result is built only from the far group's own four markers (it never mixes in the three target fragments) and carries the far group's own `vertex`. This behaviour is also what makes the "nearest complete vertex wins" rule work on 3x3 board patches with several complete vertices.

Decision: keep `decode-group.ts` unchanged (Option A). Requirement 13 note and design.md section 7 step 2 state this. The check that the returned `vertex` is the group the user meant is the caller's duty (see section 3).

### Reproduction (recorded in `m6-1-defects.md`, observation 1)

Test: `CHARACTERIZATION (not a violation of the written design) ...` in `src/optical/decode-group.rejection.test.ts`, describe "8. unrelated valid distractor markers" (it asserts the current behaviour).

Seed recipe:

- `G = groups(6, 20251215 + 800)`: arrangement `i` is `drawArrangement(mulberry32(20251215 + 800 + i), mode)`, with mode `any`, `red`, `cs` for `i mod 3` = 0, 1, 2.
- `G[0]` is the target, with one slot removed, pasted at the centre of an 88 x 88 module canvas (modulePx 6, 528 x 528 px). `G[1]` is a complete group pasted with its vertex 28 modules (168 px) to the right of the centre.

Values observed when this task re-ran the recipe with the existing helpers (`composeGroup`, `pasteImage`, `blankImage`, `decodeGroup`; throwaway script, deleted afterwards):

| item | value |
|---|---|
| target `G[0]` | TL:C-10@0 TR:S-4@0 BL:S-A@180 BR:C-A@180 |
| far group `G[1]` | TL:H-6@0 TR:C-8@180 BL:C-A@0 BR:S-K@0, cards C-8 C-A H-6 S-K, sum 28 |
| each of the 4 missing slots | IDENTIFIED, cards C-8 C-A H-6 S-K (far group only), sum 28, `vertex` = (432.0, 264.0) = far vertex x 264 + 168, frame centre y 264 |
| control: target alone, any slot missing | INCOMPLETE_GROUP, detected 3 |

So the 3-fragment target alone is rejected, and the same target next to a complete group is not. This is the documented selection rule, not a mixture and not a decoder error.

## 3. Boundary between the decoder contract and the Scoring Companion contract

| | Decoder contract (`decodeGroup`, tested by 6.1) | Scoring Companion contract (Requirements 9.6 to 9.11, design.md "Scoring Companion integration contract: target-group safety") |
|---|---|---|
| Who knows the intended target | Nobody. The decoder knows only the image. | The Companion, through an overlay, selected region or equivalent (9.6). |
| Group chosen | The complete four-marker set nearest the frame centre. | Must be verified, not assumed. |
| Reports | The read cards, sum, reflection, interpretations, readings, and the selected group's `vertex` (9.7, Requirement 13 note). | Verifies that `vertex` lies in the Target_Region, with a tolerance the Companion chooses, before applying a result (9.8). |
| Result from another vertex | Returned as IDENTIFIED for that vertex. | Discarded for the Target_Group, never applied silently (9.9). |
| Incomplete, ambiguous or mismatched target | INCOMPLETE_GROUP etc. only for the selected group. | Asks for repositioning, a rescan or manual entry (9.10). |
| Substitution | Never substitutes cards. | Uses only decoded identities; `ReferenceCheck.compare` mismatch rejects and does not substitute (9.11, 13.3, 13.9). |

Consequence for tests: a test that asserts INCOMPLETE_GROUP for an off-centre incomplete vertex when a complete group is in view would test the Companion, not the decoder. Such a test belongs to the Companion integration task, with a vertex-versus-region check. This task does not implement it.

## 4. Radius-2 false-acceptance counterexamples (preserved, not hidden)

Quoted from `m6-1-counterexamples.json` (seed 20251201), checked by this task against the file; the 6.1 test regenerates it byte-identically.

### Exact bit-level counts over all 416 templates (equal to the m4-2 enumeration)

| flips k | events | read as the source card | accepted as another card | rejected (CORRUPTED_FRAGMENT) |
|---|---|---|---|---|
| 3 | 956,800 | 0 | 2,720 | 954,080 |
| 4 | 5,262,400 | 3,360 | 13,360 | 5,245,680 |

For k = 3 no word is read as the source card, because 3 flips are beyond radius 2 of the source.

### Seeded groups, group level

8 seeded valid groups, one corrupted fragment per run, `decodeGroup(image, { radius: 2 })`. All bit-level accepted words and at most 6 seeded rejected words per (group, slot, weight) were decoded from real pixels, so the 2,745 runs are not a random sample and **40 of 2,745 is not an error rate**.

| k | coverage | fragment-level accepted as another card | pixel runs (accepted / total) | group: IDENTIFIED with wrong cards | DUPLICATE_CARD | INVALID_ARRANGEMENT | CORRUPTED_FRAGMENT | decoder vs oracle disagreements |
|---|---|---|---|---|---|---|---|---|
| 3 | all masks | 180 | 180 / 372 | 20 | 20 | 140 | 192 | 0 |
| 4 | all masks | 1,050 | 1,260 / 1,452 | 10 | 70 | 1,180 | 192 | 0 |
| 5 | 300 seeded masks per group and slot | 43 | 43 / 235 | 2 | 0 | 41 | 192 | 0 |
| 6 | sampled | 20 | 26 / 218 | 2 | 1 | 23 | 192 | 0 |
| 7 | sampled | 41 | 41 / 233 | 1 | 1 | 39 | 192 | 0 |
| 8 | sampled | 42 | 43 / 235 | 5 | 4 | 34 | 192 | 0 |
| total | | | 2,745 | **40** | | | | **0** |

Rows for k = 4, 6 and 8 include words read as the source card at another transform (210, 6 and 1 fragment-level words, counted in the bit-level data of `m6-1-counterexamples.json`); IDENTIFIED with the correct cards is 0 in every cell.

Headline numbers:

- 40 of 2,745 group runs returned IDENTIFIED with a wrong card set and a wrong sum. They are all listed in `m6-1-counterexamples.md` / `.json` with seed, slot, flipped modules, observed bits, decoded card and transform (10 distinct group-and-slot pairs).
- 20 of the 180 fragment-level k = 3 false acceptances survive the duplicate and arrangement checks (20 more become DUPLICATE_CARD, 140 become INVALID_ARRANGEMENT).
- The survivors are always another card of the same suit at a transform the slot table allows for that slot. No group-level check can reject that, because the observed group is a valid group.

### Reproduction of example 1 (this task re-ran it)

Group seed 20251204, `drawArrangement(mulberry32(20251204), 'any')` = TL:S-2@180 TR:S-3@0 BL:S-9@180 BR:S-Q@0, modulePx 4. In slot BL (true card S-9), invert data modules (row, col) (0,3), (0,4), (2,3), i.e. bit indices 3, 4, 13 (`flipDataModules(composed.image, composed.centers.BL, 4, [3, 4, 13])`). Observed word 0x08242DE.

| radius | result |
|---|---|
| 1 (default) | CORRUPTED_FRAGMENT |
| 2 | IDENTIFIED, cards S-2 S-3 S-4 S-Q, sum 21 (true S-2 S-3 S-9 S-Q, sum 26): BL read as S-4 (Fv, distance 2) |
| clean image | IDENTIFIED, S-2 S-3 S-9 S-Q |

The 6.1 test replays every listed counterexample from its seed. At radius 1 the k = 3 ones are rejected, and against the true card set the Scoring Companion `REFERENCE_MISMATCH` check catches them without substituting values.

### Why the default radius stays 1

At radius 1 and distance 5, 2 and 3 flips cannot reach another template (5 - 3 = 2 > 1), so rejection is guaranteed in the independent-bit-flip model (Property 24 (b)); the 6.1 tests assert this exhaustively. At radius 2 that interval is empty and the measurements above show false acceptances from k = 3 on, 40 of them surviving the group checks in this limited synthetic set. The decision to keep r_acc = 1 therefore needs no change. Whether a larger radius pays for itself in recall is a question for the Milestone 7 degradation experiments, not for 6.2.

Limits of these counts: independent bit flips on data modules are not real image errors (blur, lighting, perspective); only measured degradation experiments describe those (Requirement 12.5). Absence of false acceptances in a test is not a proof of none elsewhere.

## 5. Design and code differences observed (NOT defects; documentation debt, open items)

The code in `src/optical/decode-group.ts` is richer than the types in design.md section "OpticalDecodeResult" / "FragmentReading" / "SlotInterpretation". None of the items below contradicts a requirement or a Property, and none was changed here.

| # | Item | Design.md type | Code (`decode-group.ts`) |
|---|---|---|---|
| 1 | Result kind `INVALID_MARKER` | not listed | `{ kind: 'INVALID_MARKER'; rejected: RejectedCandidate[] }` |
| 2 | Result kind `AMBIGUOUS_FRAGMENT` | not listed | `{ kind: 'AMBIGUOUS_FRAGMENT'; members: GroupMember[] } & Located` |
| 3 | `INCOMPLETE_GROUP` fields | `{ detected }` | `{ detected; markers }` (`markers` counts every marker in view, `detected` counts fragments around the vertex; see `m6-1-defects.md`, item 3) |
| 4 | `CORRUPTED_FRAGMENT` | `{ nearestDistance: number }` | `{ members; nearestDistances: Partial<Record<Slot, number>> } & Located` (per slot, not one number) |
| 5 | `DUPLICATE_CARD`, `INVALID_ARRANGEMENT` | `{ card }` / no fields | add `members` and `Located`; `INVALID_ARRANGEMENT` also has `reason: 'NO_CONSISTENT_HYPOTHESIS' \| 'INTERNAL_HYPOTHESIS_COUNT'` and optional `passing` |
| 6 | `Located` fields | only `vertex` on IDENTIFIED | `Located = { vertex; groupAxisDeg; others: OtherMarker[]; alternativeClusters }` on IDENTIFIED, CORRUPTED_FRAGMENT, AMBIGUOUS_FRAGMENT, DUPLICATE_CARD, INVALID_ARRANGEMENT (design.md section 7 contract point 2 already says `vertex` is carried by those kinds, but the type block does not) |
| 7 | `IDENTIFIED` extra fields | `cards, hiddenSum, reflection, interpretations, readings, vertex` | also `members`, `groupAxisDeg`, `others`, `alternativeClusters`; `cards` is `string[]`, not a 4-tuple of `CardId` |
| 8 | `FragmentReading` field names | `{ card; observedTransform; distance; centerPx: [number, number] }` | `{ card; slot; transform; distance; center: Point; minCellConfidence; uncertainCells }` |
| 9 | `SlotInterpretation` | `{ slots: Record<Slot, { card; orientation }>; reflected }` | adds `hypothesis: TransformName`; slot `orientation` may be `'EITHER'` |
| 10 | Acceptance option | `decode(image, { acceptRadius?: 0 \| 1 \| 2 })` | `decodeGroup(image, { radius?: 1 \| 2, ... })`; any other radius throws `RangeError` (`decode-fragment.ts`) |
| 11 | Result kinds of `reference-check.ts` | `REFERENCE_MISMATCH` | also `INVALID_REFERENCE` (extension kind for an unusable reference); `REFERENCE_MISMATCH` carries `reasons` and the original `decoded` result |

Open items (to be handled in a documentation task, not by changing the decoder): bring the design.md result types and the "Optical decoding errors" list in line with the code, in particular items 1, 2, 4, 6, 8 and 11, because Scoring Companion code written against the design types would not compile against the code's result kinds. This task does not edit design.md.

## 6. Verification of this task

- Machine load before the run: about 10% CPU, no other node process.
- `npx vitest --run --maxWorkers=4 src/optical/decode-group.rejection.test.ts`: 1 file, 54 passed (54), 20.63 s.
- Static check of the test file for `it.fails`, `.skip`, `.todo`, `xit`, `xdescribe`: no matches.
- `m6-1-counterexamples.json` totals re-read: pixelRuns 2,745; identifiedWrongCards 40; counterexamplesListed 40; sum of `predictionMismatches` over the six cells 0; all-template counts as in section 4.
- Farther-complete-group characterization and radius-2 example 1 reproduced (sections 2 and 4).
- `git diff --name-only HEAD` shows only `.kiro/specs/qroker-game/tasks.meta.json` (an orchestrator-side change that was already present before this task); no `src/`, `scripts/` or `docs/` file differs from HEAD before this document was added. This task's only change is the new untracked file `docs/optical/results/m6-2-no-production-fix.md`.
- Not run in this task: the full `npm run test:ci`, `npx tsc --noEmit` and codebook checks (no code changed; the 6.1 record has 21 files, 487 tests passed). Task 6.3 records the final run.
