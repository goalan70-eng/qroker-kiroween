# Task 5.4: physical card composer and containment function (test support)

Synthetic images only. Nothing here is evidence about real prints, real card cutting or real cameras.

## Files

| File | Content |
|---|---|
| `src/optical/testing/physical-card.ts` | `PhysicalGeometry`, `BASELINE_GEOMETRY`, `physicalGeometry()`, `markerSlotsMm()`, `markerContainment()`, `renderPhysicalCard()`, `composeBoard()`, `seededErrors()`, `seededPlacements()`, `vertexMm()`, `cardLocalToBoardMm()`, `boardMmToPixel()` |
| `src/optical/testing/physical-card.test.ts` | 62 tests |
| `docs/optical/results/m5-4-physical-card.md` | this report |

`render.ts`, `fragments.ts`, `codebook.v1.json` (SHA256 `515ECEB3...CC2D4`, unchanged) and the decoder are not modified. `renderMarker` and `placedFragments` are reused. Reusing `slotOrigin`/`renderCardLayer` was not possible for the geometry sweep (the inset is a parameter there), so the module places the black 7 x 7 square from the geometry numbers and uses `renderCardLayer` only as a test oracle at the baseline.

## Design decisions

- Baseline defaults: 63.5 x 88.9 mm, radius 3.175 mm, module 1.5875 mm, inset 1, quiet margin 1, `gapMm` 0, `tableGray` 64. Every field is configurable; `gapMm` is a parameter and nothing requires a gap.
- Conventions: mm, y down, card-local origin at the top-left of the card rectangle, rotation clockwise about the card centre. Pixel (i, j) covers [i, i+1) x [j, j+1) with centre (i+.5, j+.5); the raster origin is the region corner, so pixel i covers x0 + [i, i+1)/`pxPerMm`. Default scale is 4 px per module (same as `render.ts`). Each pixel is the mean of `supersample`^2 (default 4x4) sub-sample points, so the card boundary and corner arcs are antialiased (coverage = fraction of sub-samples inside the rounded outline).
- `renderPhysicalCard` returns `image` (card on table, ink outside the cut outline is cut away), `coverage` (mask coverage 0..255), `print` (the ink on the unclipped rectangle) and `containment`. Because `print` and `coverage` are both returned, clipping of an invalid shape is visible; `requireValid: true` makes it throw.
- `markerContainment` is `valid` only if every clearance is strictly positive (Requirement 15.3: margin 0 or less is invalid) and the footprints fit in the card. For `r <= a` the clearance is `a` (distance to the straight edge); for `r > a` it is `r - sqrt2 (r - a)`. It is evaluated at the outer corner of the white quiet margin (offset `inset`) and at the corner of the black border (offset `inset + margin`), and the footprint is the black square plus the full quiet margin.
- `composeBoard`: rows x cols grid, pitch = card size + `gapMm`, seeded (mulberry32) or explicit per-card dx/dy/rotation, later cards painted on top where errors overlap, table gray shows in wedges and in the central void. `regionMm` and `omitMarkers` render only a window or a blank card (used to measure the void). Ground truth is returned in `cards`, separate from the pixels; nothing in the composer or the tests passes an expected identity to a decoder.
- Distractor_Markers in a 3 x 3 board are the fragments of the neighbouring cards (outward fragments and fragments facing other vertices). No extra free-standing markers are added.

## Results

Run: focused file 62 passed; `npx tsc --noEmit` exit 0; full suite 15 files, 351 tests passed (baseline 14 files, 289 tests, +1 file, +62 tests).

### Baseline containment (analytic, reproduced by repository tests)

| Quantity | Value |
|---|---|
| Clearance of the margin's outer corner to the arc (baseline) | **0.930 mm** (design: 0.93) |
| Clearance of the black border corner | 3.175 mm (corner sits on the arc centre) |
| Largest radius that keeps the margin inside (inset 1) | 5.420 mm |
| Valid | yes |

Clearance (mm) over the sweep (negative = outside the card; invalid cells marked):

| r \ inset (modules) | 0.5 | 1 | 1.5 | 2 |
|---|---|---|---|---|
| 0 | 0.794 | 1.587 | 2.381 | 3.175 |
| 2.0 | 0.294 | 1.417 | 2.381 | 3.175 |
| 3.0 | -0.120 inv | 1.002 | 2.125 | 3.175 |
| 3.175 | -0.193 inv | 0.930 | 2.052 | 3.175 |
| 3.6 | -0.369 inv | 0.754 | 1.876 | 2.999 |
| 4.0 | -0.534 inv | 0.588 | 1.711 | 2.833 |
| 5.0 | -0.949 inv | 0.174 | 1.297 | 2.419 |
| 6.0 | -1.363 inv | **-0.240 inv** | 0.882 | 2.005 |

All design.md numbers that were checked (0.93, 2.05, 0.75/1.88, 0.59/1.71, 0.17, -0.24, -0.19, r_max 2.71/5.42/8.13/10.84, void areas 3.43/8.65/13.73/21.46) are reproduced to two decimals. Radius 6 mm with inset 1 is reported invalid with the reason string "...clearance -0.240 mm <= 0 ... largest radius that keeps the margin inside is 5.420 mm".

### Analytic vs raster (Property 27)

- For each of the 32 cells the analytic clearance equals an independent rounded-box signed-distance minimum over a 0.1 mm grid of the four full footprints (agreement to 1e-9), and `valid` equals `reference clearance > 0`.
- Raster check at 32 px/mm (1 pixel = 0.031 mm), 3x3 supersampling, all four corners, mask coverage taken from the rendered card: for clearance > 0 every footprint pixel (centre-in-footprint, quiet margin included) has coverage 255; for clearance < 0 at least one footprint pixel has coverage 0. Tolerance rule: a cell would be ambiguous if |clearance| < 2 px = 0.0625 mm. A test checks that no sweep cell is inside that band (smallest |clearance| is 0.120 mm at r = 3.0, inset 0.5), so no cell was excluded or loosened.
- A fast-check property (150 random geometries, radius 0-8 mm, inset 0.25-3, margin 0-2, module 1.2-2.2 mm) agrees with the same reference.
- Baseline: all 104 renders (52 cards x {0, 180}) have every ink pixel at coverage 255. Clipping check with inset 0.2 / margin 0.2: ink pixels with coverage 0 exist in `print`, the `image` pixel there is the table gray, and `containment.valid` is false.

### Seam and component separation (Requirement 15.5)

Zero-gap 2 x 2 board, light table (gray 200), table margin of 4 modules so all edges fall on pixel boundaries, 4x4 supersampling, black = pixel < 128:

| Inset | Expected 2(inset+margin) modules | Measured vertical seam | Measured horizontal seam |
|---|---|---|---|
| 1 | 4 modules = 6.35 mm | 4.000 modules (16 px) | 4.000 modules |
| 1.5 | 5 modules = 7.94 mm | 5.000 modules (20 px) | 5.000 modules |

Three seeded arrangements: every black connected component (4-connectivity) lies inside a single card rectangle; the 8 printed fragments have 8 distinct border components. With a dark table (gray 64) the table, the central void, and every marker are separate dark/black components (the void horns end in cusps, so the void is its own component).

### Central void

Window of vertex +/- (r + 1) mm, blank cards, 20 px/mm, 4x4 supersampling, area = sum of table coverage x pixel area:

| r (mm) | Measured (mm²) | 4(1-pi/4)r² | Error |
|---|---|---|---|
| 2.0 | 3.429 | 3.434 | -0.13 % |
| 3.175 | 8.644 | 8.653 | -0.11 % |
| 4.0 | 13.735 | 13.735 | +0.00 % |
| 5.0 | 21.460 | 21.460 | +0.00 % |
| 0 | 0 | 0 | exact |

Test tolerances: 1.5 % (table gray 0) and 2 % (table gray 128). r = 0 gives exactly zero void.

### Finding about the design.md distance table (not a code failure)

design.md section 2 lists "shortest distance between the horn tip of the Central_Void and the corner of the black border" (3.39, 3.17, 3.28, 3.66, 4.25 mm for r = 2 ... 6). These are tip distances and are reproduced (`voidTipToBorderCornerMm`). They equal the true minimum void-to-border distance only when the border-corner offset (3.175 mm at inset 1) is at least r. For larger r the nearest void point is on an arc, not the tip. Measured from the rasterized void: r = 4 -> 2.83 mm, r = 5 -> 2.42 mm (r = 6 -> 2.00 mm analytically), i.e. less than 2 modules (3.175 mm). `markerContainment().voidToBorderCornerMm` reports the true minimum (the quantity Requirement 15.4 asks the experiment to report); the tests compare it with the raster within 0.1 mm. At the baseline radius both are 3.175 mm. The design hypothesis "the Central_Void is at least 2 modules away from the black border" therefore holds at the baseline and for r <= 3.175 mm but not for r >= 3.6 mm at inset 1. The spec files were not edited.

**Note on r = 0 and the corrected void-distance documentation.** At `cornerRadiusMm = 0` the corner is square, there is no Central_Void, and no void distance is defined, so `markerContainment()` now returns `null` for both `voidTipToBorderCornerMm` and `voidToBorderCornerMm` (typed `number | null`) and `centralVoidAreaMm2 = 0`; an earlier version returned hypot(3.175, 3.175) = 4.49 mm there, which invented a distance. Containment validity at r = 0 follows the usual clearance rules and is unchanged, and values for r > 0 are unchanged. design.md section 2 now separates `voidTipToBorderCornerMm` (horn-tip distance, sqrt((a - r)^2 + a^2), reference only) from `voidToBorderCornerMm` (true minimum distance, the Requirement 15.4 quantity): the two are equal for 0 < r <= a, and for r > a the true minimum is r - sqrt(2)(r - a).

### Determinism, identity, distractors

- Repeated renders are byte-identical; seeded boards are reproducible, a different seed changes the image, and the explicit error table equals the seeded one.
- The baseline `print` layer is pixel-identical to `renderCardLayer(card, orientation, {modulePx: 4})` for all 52 x 2 placements. With inset 1.5 and module 1.6 mm the 25 data cells read back from the render equal `placedFragments`, the other two corners are blank, and each card shows exactly two fragments. The 52 cards at orientation 0 give 52 distinct renders.
- 3 x 3 boards (one with no error, one with seeded errors of 0.3 mm / 1.5 deg): all 18 fragments of the 9 cards are present at the positions given by the forward transform (read back from the pixels); 4 face the focus vertex, 14 are distractors; blank corners stay white (no-error board).
- Rotation convention check: the rotated card's corner lands where a clockwise rotation about the card centre predicts (to 1e-9 mm), and the pixels agree.

### Composer smoke check with the decoder (not the Task 5.6 experiment)

8 seeded baseline 2 x 2 boards, zero placement error, 8 px/module, whole board image passed to `decodeGroup` with default options (no expected card, no geometry): 8/8 IDENTIFIED with the correct card set, compared with the ground truth only after decoding. n = 8 says nothing about reliability. The known spurious-marker case (0x5AC54) was not reproduced and not revisited.

## Reproducible failures

None in the final run. Issues found and fixed during development were all in the tests, not the geometry:
1. The component test treated the dark table (gray 64 < 128) as ink; it now uses a light table and a separate dark-table test.
2. My first void-distance test compared the raster minimum with the horn-tip value; the discrepancy (r = 4: 3.28 vs 2.83 mm; r = 5: 3.66 vs 2.42 mm) is the design-table finding above, now reported as `voidToBorderCornerMm`.
3. A rotation test used an "outside" point that fell on the neighbouring card.
4. The 104-render test needed a longer timeout (about 18 s); focused file runs in about 9 s.

## Synthetic vs physical limitations

- Perfectly flat, perfectly cut, sharp-edged white cards; no card thickness, edge gloss, shadow, warp or paper texture; no cut-outline or print-registration error (only the placement shift/rotation errors); no camera model (blur, perspective, noise, lighting are Task 7).
- Antialiasing is box supersampling, not an optical point-spread function.
- Seams between white cards are invisible by construction (same white on both sides); a real seam has edge shading.
- The markers' white margin outside an invalid card is rendered as table gray (the card is cut away), which is the physically expected outcome of an invalid shape.
- Rounded-corner radius, module size and inset are parameters; 3.175 mm remains an unconfirmed commercial value (Requirement 15.1).
- Task 5.5 (double-sided) and Task 5.6 (experiment sweep, miss/false-acceptance rates) are not implemented or run here.
