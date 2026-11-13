# Task 5.5: double-sided rendering and flip-equivalence tests (test support)

**Everything in this report is synthetic.** The images are rasterized by `src/optical/testing/physical-card.ts`. No real printer, duplex print job, paper, cut card, camera or flip was involved. **Paper show-through (Requirement 16.10) is not simulated and not verified here; it is measured on real prints in Milestone 8 (task 8) and is not replaced by anything in this report.** Whether a real duplex printer or print shop mirrors the back page automatically is also unknown and is a Milestone 8 physical flip test (Requirement 16.5).

## What was built

`src/optical/testing/physical-card.ts` was extended (the file header and a new last section). `render.ts`, `fragments.ts`, `transforms.ts`, the decoder files, thresholds, the symmetry rules and the codebook (SHA256 `515ECEB3...CC2D4`, re-checked by a test) are unchanged. The existing `physical-card.test.ts` is unmodified and still passes (62 tests).

| Export | Role |
|---|---|
| `CardFace` (alias `Card_Face`), `CARD_FACES` | `'FRONT' \| 'BACK'` |
| `FlipAxis`, `CardFlip`, `flipCard(axis)` | physical flip about the `'VERTICAL'` axis (left-right, view transform `Fv`) or the `'HORIZONTAL'` axis (top-bottom, `Fh`) |
| `MarkerLayer`, `mirrorMarkerLayer(front)` | marker layer of one face in the Body_Frame; the mirror step takes a FRONT layer and nothing else: corners TL<->TR, BL<->BR, fragment content mapped with `Fv` |
| `printLayers(card)` | `{ card, front, back, artwork }`; `front = printedFragments(card)`, `back = mirrorMarkerLayer(front)`. One parameter: no board and no neighbouring card |
| `printLayersUnmirrored(card)` | NEGATIVE MODEL ONLY: the same Body_Frame raster on both faces |
| `renderMarkerLayer(layer, geometry?, options?)` | Body_Frame raster of one marker layer (white paper, black ink, whole card rectangle) |
| `observeFace(card, face, orientation, flip?, options?)` | marker layer seen from above: `patterns` (bits per view corner), `image` (clipped to the cut outline, table gray outside), `print` (ink, unclipped) |
| `DuplexOptions.duplexRegistration { dxMm, dyMm, rotDeg }`, `DuplexOptions.cutOffsetMm { dxMm, dyMm }` | print registration and cut-outline offset, both default zero, deterministic |
| `ARTWORK_PROBE`, `ArtworkLayer`, `renderArtworkLayer`, `observeArtwork` | separate asymmetric artwork probe (letter F, 5 x 7 cells of 2 modules, off-centre); never mirrored |
| `duplexContainment(geometry, errors)` | per-face containment: guaranteed bound, exact displaced clearance, validity |

### Model (derived in design.md section 7, reproduced by the tests)

- Body_Frame: origin at the upper-left as seen from the front. Back layer `B(x, y) = F(W - x, y)`.
- `orientation` is the in-plane placement (0 or 180) of the card while it lies front up; a BACK observation is reached from there by `flip` (default `flipCard('VERTICAL')`). Observation = in-plane rotation after the mirror. Passing a `flip` for the FRONT, an orientation other than 0/180, an unknown card, a layer set of another card, or a non-finite error throws `RangeError`.
- Registration is applied to the BACK print only (the front is the reference), expressed in the Body_Frame as seen from the front; rotation is clockwise as seen from the front about the card centre. The cut offset is the displacement of the cut outline relative to the front print; with the outline fixed in the body the front print appears shifted by minus the offset and the back print by minus the offset plus the registration.
- Rasterization samples the print layer at the inverse-mapped position of every sub-sample (supersample 4 x 4, 4 px per module = 2.52 px/mm, card 160 x 224 px), so the flip and the errors are applied in continuous coordinates and not by reversing pixel rows inside the implementation.

### Assumption on the artwork probe (please confirm)

"Never mirrored" is implemented as: the library has no mirror step for artwork (the type system keeps `mirrorMarkerLayer` to marker layers), both faces carry the probe unchanged, and the observed artwork after a vertical-axis flip is the front artwork, readable. The probe is treated as authored in each face's own viewing frame. If "not mirrored" was instead meant to be tested at the Body_Frame level of a real print file, that is the same unknown print-file convention as for the markers (Milestone 8).

## Test coverage matrix

New file `src/optical/testing/physical-card.duplex.test.ts`: **33 tests**: 31 example tests (several sweep all 52 cards) and 2 fast-check properties (200 and 120 runs).

| Property / requirement | Statement | Test(s) |
|---|---|---|
| P29, 16.3 | vertical-axis flip: back-face marker layer equals front observation (positions, bits, pixels, card id) | `vertical-axis flip: marker layer of the BACK face is pixel-identical to the FRONT observation (52 x {0,180})` |
| P29, 16.4 | horizontal-axis flip equals the front at the opposite allowed orientation | `horizontal-axis flip equals the FRONT observation at the opposite allowed orientation (52 x {0,180})` |
| P29, 16.3 | identity preserved, no 90/270 | `card identity is preserved under every supported flip and orientation; 90/270 observations never arise` |
| P30, 16.5 | same raster on both faces is rejected | `printLayersUnmirrored prints identical...`, `for every card and orientation the post-flip observation differs ... and is rejected; the real model is accepted` |
| P30, 16.7 | front and mirrored corner sets disjoint | `front corner sets follow Fragment_Layout and the back is the left-right mirrored set`, `front and back corner sets are disjoint for all four suits and for all 52 cards` |
| P30, 16.2 | back derived from the same card's front only | `back patterns are the Fv-mirrored front patterns ...`, `Body_Frame rasters: front = renderCardLayer, back = per-row reversal ...`, `back layer is a pure function of the card ...`, `no substitute fragments ...`, property `mirrorMarkerLayer(any FRONT layer) ...` (200 runs), `mirrorMarkerLayer rejects a BACK layer and malformed patterns` |
| P30, 16.6 | artwork not mirrored, marker layer mirrored | `the probe is the asymmetric glyph F ...`, `both faces carry the unchanged probe ...`, `artwork rasters: back == front, ... marker rasters: back == mirror(front)`, `observed artwork after a vertical-axis flip is the front artwork ...` |
| P31, 16.7, 15.3 | containment identical for both faces at zero error | `zero error: both faces report exactly markerContainment, over the radius x inset sweep and three module sizes` (96 cells), `zero error: baseline clearance is 0.930 mm ...` |
| P31, 16.8 | containment shrinks by the error | property `the guaranteed clearance subtracts the error magnitudes and never exceeds the exact displaced clearance` (120 runs), `the bound is tight ...`, `a shift along an edge is cheaper ...`, `reports the registration / cut values that invalidate containment ...`, `raster agrees with the geometry ...` |
| 16.8 | errors displace markers as modelled | four tests in `registration and cut error move the markers as modelled` |
| determinism, identities | repeatable output, frozen codebook and front layers unchanged | `is deterministic ...`, `FRONT observation at zero error equals the existing single-card renderer ...`, `codebook file hash, front layers and fragment identities are untouched ...` |

### Independent references used by the tests

The oracle never calls `mirrorMarkerLayer`, `flipCard`, `observeFace` or `duplexContainment`:

- front body raster = `render.ts` `renderCardLayer(card, 0)`;
- back body raster, post-flip view (vertical and horizontal) and the 180 degree rotation are written with explicit index arithmetic (`out[y*w + (w-1-x)] = in[y*w + x]` and the analogous top-bottom and rotate-180 maps) in the test file;
- fragment mirroring is done bit by bit (`bit 5r+c -> bit 5r+(4-c)`);
- corner sets are copied literally from design.md section 7;
- clearance is the rounded-box signed distance of displaced footprint grid points (step <= 0.1 mm, corners included), and the rotation chord uses the footprint corner distance computed in the test;
- card id, positions and bits come from `detectMarkers` + `decodeFragment` on the image only; the expected card is used only in the final comparison.

## Flip-equivalence results

| Check | Cases | Result |
|---|---|---|
| FRONT observation equals the existing `renderPhysicalCard` image and print, `renderCardLayer(card, o)` and `placedFragments(card, o)` | 52 x {0, 180} = 104 | 104 / 104 identical |
| Vertical-axis flip, BACK vs FRONT: clipped image, ink raster, view bits, independent index-arithmetic view, detector positions/bits/corners/rotation, decoded id | 104 | **104 / 104 pixel-identical**; detector readings identical (2 markers each); decoded id = card for 208 / 208 fragments |
| Horizontal-axis flip vs FRONT at the opposite orientation (same checks, plus `rot180` of the vertical view) | 104 | **104 / 104 pixel-identical** |
| Card id decoded from the image: 52 cards x {FRONT, vertical, horizontal} x {0, 180} | 312 images, 624 fragments | 624 / 624 `IDENTIFIED` as the right card; detected marker rotation within 1 degree of 0 in all of them; occupied view corners equal the corner set of `placedFragments(card, o)` |
| Negative model (same raster on both faces), vertical-axis flip | 104 | image is exactly the left-right mirror of the front image in 104 / 104; occupied corner set differs in 104 / 104; no marker has the front's bits at the same corner in 104 / 104; detector readings differ in 104 / 104; the acceptance check rejects 104 / 104, and accepts the real model 104 / 104 |

Observation on the negative model (not asserted as a separate test): the mirrored fragments still decode to the right card (all 208 identified as the same card) but with a reflected transform (`I`->`Fv`, `R180`->`Fh`, and so on), so the failure shows up in the corner positions, bits and transform, not in the single-fragment card id. A group-level reflection check would be the layer that flags it; single-card images do not exercise that here.

No case failed and no assertion was weakened.

## Registration and cut error: limitations

Modelled displacement of the markers (detector centres, tolerance 0.35 px at 2.52 px/mm; checked against independently computed expected positions):

- back registration `(dx, dy)` moves the view marker by `(-dx, +dy)` after a vertical-axis flip (the flip mirrors x) and by `(+dx, -dy)` after a horizontal-axis flip;
- a clockwise-from-the-front registration rotation appears counter-clockwise after the flip; marker centres match the expected rotation about the card centre to within 0.4 px for +-2 degrees;
- the FRONT is unaffected by registration; a cut offset moves the front markers by minus the offset.

Containment (Property 31). Zero error: front and back report exactly `markerContainment` (0.930 mm at the baseline) in all 96 sweep cells (radius {0, 2, 3, 3.175, 3.6, 4, 5, 6} x inset {0.5, 1, 1.5, 2} x module {1.2, 1.5875, 2.0} mm). With error, `clearanceMm` is the guaranteed lower bound: `nominal - |cut|` for the front and `nominal - |cut| - |registration shift| - 2 rho sin(|rot|/2)` for the back, where `rho` is the largest distance from the card centre to a footprint corner. It is a worst case over directions. `actualClearanceMm` evaluates the given error exactly (vertices of the displaced footprints; clearance is concave, so vertices suffice) and was compared with a dense grid reference. The bound is attained only when the shift points along the outward diagonal of a corner footprint (shown by the tightness test); an edge-parallel shift or a rotation costs less (table below).

| Inset | Nominal clearance | rho | Rotation-only bound hits 0 at | Back, diagonal 0.3 mm/axis: bound / exact | Back, edge shift 0.3 mm: bound / exact | Back, rotation 1 degree: bound / exact |
|---|---|---|---|---|---|---|
| 1 module (baseline) | 0.930 mm | 52.412 mm | 1.017 degrees | 0.506 / 0.506 mm | 0.630 / 0.709 mm | 0.015 / 0.617 mm |
| 1.5 modules | 2.052 mm | 51.306 mm | 2.292 degrees | 1.628 / 1.628 mm | 1.752 / 1.824 mm | 1.157 / 1.627 mm |
| 2 modules | 3.175 mm | 50.201 mm | 3.624 degrees | 2.751 / 2.751 mm | 2.875 / 2.875 mm | 2.299 / 2.459 mm |

Values that make containment invalid (worst-case bound, baseline geometry, which is the design basis): a combined translation error of more than **0.930 mm** in magnitude (cut offset plus registration shift, in the worst direction), or a registration rotation of more than **1.017 degrees** with no translation (rotation moves the corner footprints by about 0.915 mm per degree). The tests confirm: a diagonal back shift of 0.95 x clearance is valid (bound and exact) and 1.05 x clearance is invalid (bound and exact, front still valid); rotation at 0.95 x and 1.05 x the limit flips the bound; the exact clearance is never below the bound (120 random geometries and errors). Raster check: with a cut offset of 0.2 mm no paper is cut away inside the displaced footprints and with 1.0 mm paper is cut away; for the back of `D-5` a registration shift of 0.3 mm gives none and 0.9 mm gives some, each agreeing with the sign of the independent exact clearance.

Other limitations:

- All numbers are computed for the four slots (card independent), so they are conservative for a face that prints only two corners.
- Nothing here says what registration or cut error a real printer or cutter has; those are measured in task 8 (Requirement 16.8). The 5.6 sweep and decision table are not part of this task.
- In the scratch run the detector read a back image rotated by 5 degrees as `INVALID_MARKER` and its rotation estimate is coarse at 2 degrees (it read -0.69 and +0.75 for -2 and +2). This is detector behaviour on these synthetic images and is not asserted by the tests (only the position and the sign of the rotation are).
- Orientation is limited to 0 and 180; a 90 degree observation is not representable and `observeFace` rejects it.

## Run

- Focused: `npx vitest --run src/optical/testing/physical-card.duplex.test.ts`: 33 passed (about 12 s).
- Existing `physical-card.test.ts`: 62 passed, unmodified.
- `npx tsc --noEmit`: exit 0.
- Full suite: 16 files, 385 tests passed (baseline 15 files, 352 tests; +1 file, +33 tests).
