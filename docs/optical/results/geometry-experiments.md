# Task 5.6 geometry experiments: results and decision table

**Synthetic images, not real cameras.** Disclaimer text of every result file: synthetic images, not real cameras: these are synthetic-test findings about the sampled conditions only; they do not measure or guarantee real-camera performance, and a zero-event bound applies only to the sampled synthetic condition distribution (independent seeded trials).

**Zero false accepts is an observation under the sampled synthetic conditions (independent seeded trials). It is not a guarantee, it holds only for the sampled synthetic condition distribution, and it says nothing about real cameras.**

The CLEAN / MODERATE / STRESS profile parameters were chosen after a small, unrecorded pilot on the baseline geometry (10 to 30 trials per variant, no log kept). STRESS was lowered to 1 deg per-card rotation and 0.5 px blur because the first draft (2 deg, 1.0 px) failed about 80% of baseline trials. The profile levels are therefore design choices, not thresholds tuned until the reader passed. No recognition threshold, tolerance, acceptance radius or codebook value was changed.

Every number below is a per-cell value: n, counts and rates belong to one experimental cell (one combination of geometry and degradation parameters) and are never pooled across geometries, faces, flips or degradation conditions. Cells use independent seeded trials (seed = hash of base seed, cell id and trial index); the output has no timestamps and no timings. The exact one-sided 95% upper bound 1 - 0.05^(1/n) is given only for cells with 0 false accepts. A false accept is an IDENTIFIED result with a wrong card set or sum, or an IDENTIFIED result for a group with one card absent. Design and workload: `geometry-experiments-plan.md`. Machine-readable data: `geometry-experiments.json`.

## 1. Completeness

Planned: 824 cells, 168000 trials. Found: 824 cells, 168000 trials. Status: **COMPLETE (every planned cell has a result with the planned n)**.

## 2. Summary per tier and group

Ranges are minimum to maximum over the cells of the group (each cell has its own n); they are not pooled rates. Incomplete-group cells expect a rejection, so their "rejected" rate is the good outcome.

| Tier | Group | Cells | Trials | Correct rate range (cells that expect IDENTIFIED) | Rejected rate range (incomplete-group cells) | False accepts (count) | Cells with a false accept |
|---|---|---|---|---|---|---|---|
| 1 | **all groups** | 96 | 22400 | 75.0% to 100.0% | - | 0 | 0 |
| 1 | T1-CLEAN_DARK | 24 | 5600 | 100.0% | - | 0 | 0 |
| 1 | T1-CLEAN_LIGHT | 24 | 5600 | 100.0% | - | 0 | 0 |
| 1 | T1-MODERATE | 24 | 5600 | 93.5% to 98.0% | - | 0 | 0 |
| 1 | T1-STRESS | 24 | 5600 | 75.0% to 87.5% | - | 0 | 0 |
| 2 | **all groups** | 128 | 25600 | 0.0% to 100.0% | - | 0 | 0 |
| 2 | T2-blur | 24 | 4800 | 0.0% to 100.0% | - | 0 | 0 |
| 2 | T2-camera-rotation | 12 | 2400 | 0.0% to 100.0% | - | 0 | 0 |
| 2 | T2-decoder-layout | 2 | 400 | 0.0% to 100.0% | - | 0 | 0 |
| 2 | T2-lighting | 18 | 3600 | 100.0% | - | 0 | 0 |
| 2 | T2-perspective | 24 | 4800 | 0.0% to 100.0% | - | 0 | 0 |
| 2 | T2-placement-gap | 12 | 2400 | 100.0% | - | 0 | 0 |
| 2 | T2-placement-rotation | 18 | 3600 | 29.5% to 100.0% | - | 0 | 0 |
| 2 | T2-placement-shift | 18 | 3600 | 99.0% to 100.0% | - | 0 | 0 |
| 3 | **all groups** | 528 | 105600 | 9.5% to 100.0% | - | 0 | 0 |
| 3 | T3-duplex | 528 | 105600 | 9.5% to 100.0% | - | 0 | 0 |
| 4 | **all groups** | 72 | 14400 | 61.5% to 100.0% | 100.0% | 0 | 0 |
| 4 | T4-2x2-incomplete | 24 | 4800 | - | 100.0% | 0 | 0 |
| 4 | T4-3x3 | 24 | 4800 | 61.5% to 100.0% | - | 0 | 0 |
| 4 | T4-3x3-incomplete | 24 | 4800 | - | 100.0% | 0 | 0 |

## 3. Baseline geometry cells (r = 3.175 mm, inset 1, n = 1000)

| Profile | n | Correct | Rejected (kinds) | False accepts | False-accept 95% upper bound (only when 0) | voidToBorderCornerMm | voidTipToBorderCornerMm (reference) |
|---|---|---|---|---|---|---|---|
| CLEAN_DARK | 1000 | 1000 (100.0%) | 0 (0.0%): - | 0 (0.00%) | 0.30% | 3.175 | 3.175 |
| CLEAN_LIGHT | 1000 | 1000 (100.0%) | 0 (0.0%): - | 0 (0.00%) | 0.30% | 3.175 | 3.175 |
| MODERATE | 1000 | 967 (96.7%) | 33 (3.3%): INCOMPLETE_GROUP 33 | 0 (0.00%) | 0.30% | 3.175 | 3.175 |
| STRESS | 1000 | 814 (81.4%) | 186 (18.6%): INCOMPLETE_GROUP 186 | 0 (0.00%) | 0.30% | 3.175 | 3.175 |

## 4. Placement, registration and cut tolerances (evaluated before any card-shape conclusion)

Requirement 15.7 and 16.8: printing, cutting and placement tolerances are evaluated before the card shape is considered. The levels below are parameter sweeps; real tolerances are unknown. "First level below 100%" and "below 95%" are descriptive reporting thresholds for locating where recognition degrades; they are not pass criteria and no decoder threshold uses them.

### 4.1 Transitions in the Tier 2 sweeps (placement and camera factors; face FRONT, nominal = clean, dark table)

| Factor | Geometry | Correct rate by level (level: rate) | First level below 100% | First level below 95% |
|---|---|---|---|---|
| shiftMm | r=3.175 mm, inset 1 | 0: 100.0%; 0.5: 100.0%; 1: 100.0%; 1.5: 99.5% | 1.5 | none |
| shiftMm | r=3.175 mm, inset 1.5 | 0: 100.0%; 0.5: 100.0%; 1: 100.0%; 1.5: 99.0% | 1.5 | none |
| shiftMm | r=3.175 mm, inset 2 | 0: 100.0%; 0.5: 100.0%; 1: 100.0%; 1.5: 99.5% | 1.5 | none |
| shiftMm | r=0 mm, inset 1 | 0: 100.0%; 0.5: 100.0%; 1: 100.0%; 1.5: 100.0% | none | none |
| shiftMm | r=6 mm, inset 1 | 0: 100.0%; 0.5: 100.0%; 1: 100.0%; 1.5: 100.0% | none | none |
| shiftMm | r=6 mm, inset 1.5 | 0: 100.0%; 0.5: 100.0%; 1: 100.0%; 1.5: 99.5% | 1.5 | none |
| rotationDeg | r=3.175 mm, inset 1 | 0: 100.0%; 1: 99.5%; 2: 79.0%; 3: 32.5% | 1 | 2 |
| rotationDeg | r=3.175 mm, inset 1.5 | 0: 100.0%; 1: 100.0%; 2: 83.0%; 3: 34.5% | 2 | 2 |
| rotationDeg | r=3.175 mm, inset 2 | 0: 100.0%; 1: 100.0%; 2: 81.0%; 3: 39.5% | 2 | 2 |
| rotationDeg | r=0 mm, inset 1 | 0: 100.0%; 1: 100.0%; 2: 74.0%; 3: 33.0% | 2 | 2 |
| rotationDeg | r=6 mm, inset 1 | 0: 100.0%; 1: 100.0%; 2: 76.0%; 3: 32.0% | 2 | 2 |
| rotationDeg | r=6 mm, inset 1.5 | 0: 100.0%; 1: 100.0%; 2: 83.5%; 3: 29.5% | 2 | 2 |
| gapMm | r=3.175 mm, inset 1 | 0: 100.0%; 0.5: 100.0%; 1: 100.0% | none | none |
| gapMm | r=3.175 mm, inset 1.5 | 0: 100.0%; 0.5: 100.0%; 1: 100.0% | none | none |
| gapMm | r=3.175 mm, inset 2 | 0: 100.0%; 0.5: 100.0%; 1: 100.0% | none | none |
| gapMm | r=0 mm, inset 1 | 0: 100.0%; 0.5: 100.0%; 1: 100.0% | none | none |
| gapMm | r=6 mm, inset 1 | 0: 100.0%; 0.5: 100.0%; 1: 100.0% | none | none |
| gapMm | r=6 mm, inset 1.5 | 0: 100.0%; 0.5: 100.0%; 1: 100.0% | none | none |
| cameraRotation | r=3.175 mm, inset 1 | NONE: 100.0%; DEG45: 100.0%; RANDOM: 100.0% | none | none |
| cameraRotation | r=3.175 mm, inset 1.5 | NONE: 100.0%; DEG45: 100.0%; RANDOM: 98.5% | RANDOM | none |
| cameraRotation | r=3.175 mm, inset 2 | NONE: 100.0%; DEG45: 0.0%; RANDOM: 97.5% | DEG45 | DEG45 |
| cameraRotation | r=0 mm, inset 1 | NONE: 100.0%; DEG45: 100.0%; RANDOM: 99.0% | RANDOM | none |
| cameraRotation | r=6 mm, inset 1 | NONE: 100.0%; DEG45: 100.0%; RANDOM: 100.0% | none | none |
| cameraRotation | r=6 mm, inset 1.5 | NONE: 100.0%; DEG45: 100.0%; RANDOM: 100.0% | none | none |
| tiltDeg | r=3.175 mm, inset 1 | 0: 100.0%; 10: 100.0%; 20: 100.0%; 30: 50.0%; 40: 0.0% | 30 | 30 |
| tiltDeg | r=3.175 mm, inset 1.5 | 0: 100.0%; 10: 100.0%; 20: 100.0%; 30: 8.0%; 40: 0.0% | 30 | 30 |
| tiltDeg | r=3.175 mm, inset 2 | 0: 100.0%; 10: 100.0%; 20: 100.0%; 30: 0.5%; 40: 0.0% | 30 | 30 |
| tiltDeg | r=0 mm, inset 1 | 0: 100.0%; 10: 100.0%; 20: 100.0%; 30: 53.5%; 40: 0.0% | 30 | 30 |
| tiltDeg | r=6 mm, inset 1 | 0: 100.0%; 10: 100.0%; 20: 100.0%; 30: 59.0%; 40: 0.0% | 30 | 30 |
| tiltDeg | r=6 mm, inset 1.5 | 0: 100.0%; 10: 100.0%; 20: 100.0%; 30: 5.0%; 40: 0.0% | 30 | 30 |
| blurPx | r=3.175 mm, inset 1 | 0: 100.0%; 0.5: 100.0%; 1: 100.0%; 1.5: 0.0%; 2: 0.0% | 1.5 | 1.5 |
| blurPx | r=3.175 mm, inset 1.5 | 0: 100.0%; 0.5: 100.0%; 1: 100.0%; 1.5: 0.0%; 2: 0.0% | 1.5 | 1.5 |
| blurPx | r=3.175 mm, inset 2 | 0: 100.0%; 0.5: 100.0%; 1: 100.0%; 1.5: 0.0%; 2: 0.0% | 1.5 | 1.5 |
| blurPx | r=0 mm, inset 1 | 0: 100.0%; 0.5: 100.0%; 1: 100.0%; 1.5: 0.0%; 2: 0.0% | 1.5 | 1.5 |
| blurPx | r=6 mm, inset 1 | 0: 100.0%; 0.5: 100.0%; 1: 100.0%; 1.5: 0.0%; 2: 0.0% | 1.5 | 1.5 |
| blurPx | r=6 mm, inset 1.5 | 0: 100.0%; 0.5: 100.0%; 1: 100.0%; 1.5: 0.0%; 2: 0.0% | 1.5 | 1.5 |
| lightingStrength | r=3.175 mm, inset 1 | 0: 100.0%; 0.2: 100.0%; 0.4: 100.0%; 0.6: 100.0% | none | none |
| lightingStrength | r=3.175 mm, inset 1.5 | 0: 100.0%; 0.2: 100.0%; 0.4: 100.0%; 0.6: 100.0% | none | none |
| lightingStrength | r=3.175 mm, inset 2 | 0: 100.0%; 0.2: 100.0%; 0.4: 100.0%; 0.6: 100.0% | none | none |
| lightingStrength | r=0 mm, inset 1 | 0: 100.0%; 0.2: 100.0%; 0.4: 100.0%; 0.6: 100.0% | none | none |
| lightingStrength | r=6 mm, inset 1 | 0: 100.0%; 0.2: 100.0%; 0.4: 100.0%; 0.6: 100.0% | none | none |
| lightingStrength | r=6 mm, inset 1.5 | 0: 100.0%; 0.2: 100.0%; 0.4: 100.0%; 0.6: 100.0% | none | none |

### 4.2 Transitions in the Tier 3 registration and cut sweeps (2x2 board, clean, dark table)

Back-print registration shift (mm), rotation (deg) and cut-outline offset (mm); direction random per card; FRONT is the registration reference. "Lowest" rows give, per level, the lowest correct rate over the grid geometries whose nominal containment is valid (a minimum over cells, not a pooled rate).

| Face | Factor | Scope | Correct rate by level (level: rate) | First level below 100% | First level below 95% |
|---|---|---|---|---|---|
| FRONT | cutOffsetMm | baseline (r=3.175 mm, inset 1) | 0: 100.0%; 0.5: 100.0%; 1: 42.0% | 1 | 1 |
| FRONT | cutOffsetMm | lowest correct rate over the 23 geometries with valid nominal containment | 0: 100.0%; 0.5: 100.0%; 1: 35.0% | 1 | 1 |
| BACK_VERTICAL | regShiftMm | baseline (r=3.175 mm, inset 1) | 0: 100.0%; 0.25: 100.0%; 0.5: 100.0%; 1: 37.5% | 1 | 1 |
| BACK_VERTICAL | regShiftMm | lowest correct rate over the 23 geometries with valid nominal containment | 0: 100.0%; 0.25: 100.0%; 0.5: 100.0%; 1: 34.0% | 1 | 1 |
| BACK_VERTICAL | regRotDeg | baseline (r=3.175 mm, inset 1) | 0: 100.0%; 0.5: 100.0%; 1: 70.5% | 1 | 1 |
| BACK_VERTICAL | regRotDeg | lowest correct rate over the 23 geometries with valid nominal containment | 0: 100.0%; 0.5: 100.0%; 1: 53.0% | 1 | 1 |
| BACK_VERTICAL | cutOffsetMm | baseline (r=3.175 mm, inset 1) | 0: 100.0%; 0.5: 100.0%; 1: 35.0% | 1 | 1 |
| BACK_VERTICAL | cutOffsetMm | lowest correct rate over the 23 geometries with valid nominal containment | 0: 100.0%; 0.5: 100.0%; 1: 35.0% | 1 | 1 |
| BACK_VERTICAL | all errors together | baseline (r=3.175 mm, inset 1) | zero: 100.0%; mid (0.5 mm, 0.5 deg, cut 0.5 mm): 88.5%; max (1.0 mm, 1 deg, cut 1.0 mm): 16.5% | mid (0.5 mm, 0.5 deg, cut 0.5 mm) | mid (0.5 mm, 0.5 deg, cut 0.5 mm) |
| BACK_VERTICAL | all errors together | lowest correct rate over the 23 geometries with valid nominal containment | zero: 100.0%; mid (0.5 mm, 0.5 deg, cut 0.5 mm): 84.5%; max (1.0 mm, 1 deg, cut 1.0 mm): 9.5% | mid (0.5 mm, 0.5 deg, cut 0.5 mm) | mid (0.5 mm, 0.5 deg, cut 0.5 mm) |
| BACK_HORIZONTAL | regShiftMm | baseline (r=3.175 mm, inset 1) | 0: 100.0%; 0.25: 100.0%; 0.5: 100.0%; 1: 42.5% | 1 | 1 |
| BACK_HORIZONTAL | regShiftMm | lowest correct rate over the 23 geometries with valid nominal containment | 0: 100.0%; 0.25: 100.0%; 0.5: 100.0%; 1: 33.5% | 1 | 1 |
| BACK_HORIZONTAL | regRotDeg | baseline (r=3.175 mm, inset 1) | 0: 100.0%; 0.5: 100.0%; 1: 78.5% | 1 | 1 |
| BACK_HORIZONTAL | regRotDeg | lowest correct rate over the 23 geometries with valid nominal containment | 0: 100.0%; 0.5: 100.0%; 1: 51.0% | 1 | 1 |
| BACK_HORIZONTAL | cutOffsetMm | baseline (r=3.175 mm, inset 1) | 0: 100.0%; 0.5: 100.0%; 1: 45.0% | 1 | 1 |
| BACK_HORIZONTAL | cutOffsetMm | lowest correct rate over the 23 geometries with valid nominal containment | 0: 100.0%; 0.5: 100.0%; 1: 34.5% | 1 | 1 |
| BACK_HORIZONTAL | all errors together | baseline (r=3.175 mm, inset 1) | zero: 100.0%; mid (0.5 mm, 0.5 deg, cut 0.5 mm): 81.5%; max (1.0 mm, 1 deg, cut 1.0 mm): 19.0% | mid (0.5 mm, 0.5 deg, cut 0.5 mm) | mid (0.5 mm, 0.5 deg, cut 0.5 mm) |
| BACK_HORIZONTAL | all errors together | lowest correct rate over the 23 geometries with valid nominal containment | zero: 100.0%; mid (0.5 mm, 0.5 deg, cut 0.5 mm): 81.5%; max (1.0 mm, 1 deg, cut 1.0 mm): 10.0% | mid (0.5 mm, 0.5 deg, cut 0.5 mm) | mid (0.5 mm, 0.5 deg, cut 0.5 mm) |

### 4.3 Containment consumed by registration and cut error (Requirement 16.8), baseline radius

Worst-case bound from `duplexContainment` (cut offset, plus for the back face the registration shift and the rotation chord of the farthest marker footprint vertex). The bound is a worst case over directions; the sweeps draw random directions.

| Configuration | Inset 1: loss bound / guaranteed clearance (mm) | Inset 1.5 | Inset 2 |
|---|---|---|---|
| FRONT cut 0.5 | 0.500 / 0.430 | 0.500 / 1.552 | 0.500 / 2.675 |
| FRONT cut 1 | 1.000 / -0.070 (not guaranteed) | 1.000 / 1.052 | 1.000 / 2.175 |
| BACK_VERTICAL zero error | 0.000 / 0.930 | 0.000 / 2.053 | 0.000 / 3.175 |
| BACK_VERTICAL reg shift 0.25 | 0.250 / 0.680 | 0.250 / 1.802 | 0.250 / 2.925 |
| BACK_VERTICAL reg shift 0.5 | 0.500 / 0.430 | 0.500 / 1.552 | 0.500 / 2.675 |
| BACK_VERTICAL reg shift 1 | 1.000 / -0.070 (not guaranteed) | 1.000 / 1.052 | 1.000 / 2.175 |
| BACK_VERTICAL reg rotation 0.5 | 0.457 / 0.473 | 0.448 / 1.605 | 0.438 / 2.737 |
| BACK_VERTICAL reg rotation 1 | 0.915 / 0.015 | 0.895 / 1.157 | 0.876 / 2.299 |
| BACK_VERTICAL cut 0.5 | 0.500 / 0.430 | 0.500 / 1.552 | 0.500 / 2.675 |
| BACK_VERTICAL cut 1 | 1.000 / -0.070 (not guaranteed) | 1.000 / 1.052 | 1.000 / 2.175 |
| BACK_VERTICAL all mid (0.5 mm, 0.5 deg, cut 0.5 mm) | 1.457 / -0.527 (not guaranteed) | 1.448 / 0.605 | 1.438 / 1.737 |
| BACK_VERTICAL all max (1.0 mm, 1 deg, cut 1.0 mm) | 2.915 / -1.985 (not guaranteed) | 2.895 / -0.843 (not guaranteed) | 2.876 / 0.299 |
| BACK_HORIZONTAL zero error | 0.000 / 0.930 | 0.000 / 2.053 | 0.000 / 3.175 |
| BACK_HORIZONTAL reg shift 0.25 | 0.250 / 0.680 | 0.250 / 1.802 | 0.250 / 2.925 |
| BACK_HORIZONTAL reg shift 0.5 | 0.500 / 0.430 | 0.500 / 1.552 | 0.500 / 2.675 |
| BACK_HORIZONTAL reg shift 1 | 1.000 / -0.070 (not guaranteed) | 1.000 / 1.052 | 1.000 / 2.175 |
| BACK_HORIZONTAL reg rotation 0.5 | 0.457 / 0.473 | 0.448 / 1.605 | 0.438 / 2.737 |
| BACK_HORIZONTAL reg rotation 1 | 0.915 / 0.015 | 0.895 / 1.157 | 0.876 / 2.299 |
| BACK_HORIZONTAL cut 0.5 | 0.500 / 0.430 | 0.500 / 1.552 | 0.500 / 2.675 |
| BACK_HORIZONTAL cut 1 | 1.000 / -0.070 (not guaranteed) | 1.000 / 1.052 | 1.000 / 2.175 |
| BACK_HORIZONTAL all mid (0.5 mm, 0.5 deg, cut 0.5 mm) | 1.457 / -0.527 (not guaranteed) | 1.448 / 0.605 | 1.438 / 1.737 |
| BACK_HORIZONTAL all max (1.0 mm, 1 deg, cut 1.0 mm) | 2.915 / -1.985 (not guaranteed) | 2.895 / -0.843 (not guaranteed) | 2.876 / 0.299 |

### 4.4 Tier 3 matrix: correct rate per configuration, radius and inset

Each entry lists the correct rate (% of n = 200) for the radii 0, 2.0, 3.0, 3.175, 3.6, 4.0, 5.0, 6.0 mm in this order, separated by "/", for one inset. Each value is its own cell.

| Configuration | Inset 1 | Inset 1.5 | Inset 2 |
|---|---|---|---|
| FRONT cut 0.5 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 |
| FRONT cut 1 | 47.5 / 39.0 / 42.0 / 42.0 / 47.5 / 38.0 / 36.5 / 42.5 | 42.5 / 41.5 / 35.0 / 47.5 / 40.5 / 42.0 / 41.0 / 39.0 | 47.0 / 46.0 / 43.0 / 37.0 / 44.0 / 46.5 / 40.5 / 38.5 |
| BACK_VERTICAL zero error | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 |
| BACK_VERTICAL reg shift 0.25 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 |
| BACK_VERTICAL reg shift 0.5 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 |
| BACK_VERTICAL reg shift 1 | 37.0 / 40.5 / 41.0 / 37.5 / 45.0 / 39.0 / 44.0 / 41.5 | 37.5 / 44.5 / 43.0 / 39.5 / 39.5 / 39.0 / 37.0 / 39.0 | 49.0 / 42.5 / 41.0 / 47.0 / 34.0 / 36.0 / 48.5 / 40.0 |
| BACK_VERTICAL reg rotation 0.5 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 |
| BACK_VERTICAL reg rotation 1 | 73.5 / 74.0 / 71.5 / 70.5 / 79.5 / 75.5 / 72.5 / 74.0 | 71.0 / 74.0 / 76.0 / 71.0 / 69.0 / 72.0 / 73.0 / 77.5 | 57.5 / 56.5 / 59.0 / 53.0 / 55.0 / 61.5 / 63.5 / 57.0 |
| BACK_VERTICAL cut 0.5 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 |
| BACK_VERTICAL cut 1 | 37.0 / 41.5 / 41.5 / 35.0 / 37.5 / 36.5 / 38.5 / 41.5 | 43.5 / 44.5 / 38.5 / 38.5 / 42.5 / 36.0 / 40.0 / 45.0 | 40.5 / 41.5 / 40.5 / 41.0 / 41.5 / 45.5 / 48.0 / 46.0 |
| BACK_VERTICAL all mid (0.5 mm, 0.5 deg, cut 0.5 mm) | 85.0 / 86.5 / 85.5 / 88.5 / 88.5 / 84.5 / 92.0 / 87.5 | 87.5 / 89.0 / 91.5 / 88.0 / 86.5 / 90.5 / 89.0 / 88.5 | 91.5 / 90.0 / 90.0 / 87.0 / 88.0 / 92.0 / 84.5 / 86.5 |
| BACK_VERTICAL all max (1.0 mm, 1 deg, cut 1.0 mm) | 15.5 / 15.5 / 20.0 / 16.5 / 15.5 / 15.5 / 13.0 / 16.5 | 19.5 / 15.0 / 16.0 / 16.0 / 9.5 / 14.5 / 14.5 / 17.5 | 16.5 / 13.5 / 15.5 / 17.5 / 16.0 / 14.0 / 17.5 / 14.0 |
| BACK_HORIZONTAL zero error | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 |
| BACK_HORIZONTAL reg shift 0.25 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 |
| BACK_HORIZONTAL reg shift 0.5 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 |
| BACK_HORIZONTAL reg shift 1 | 34.0 / 36.0 / 50.5 / 42.5 / 37.0 / 37.5 / 39.5 / 41.5 | 33.5 / 38.5 / 39.0 / 43.5 / 43.5 / 39.0 / 46.5 / 42.0 | 44.0 / 41.5 / 41.0 / 36.0 / 43.0 / 44.5 / 36.0 / 44.0 |
| BACK_HORIZONTAL reg rotation 0.5 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 |
| BACK_HORIZONTAL reg rotation 1 | 74.0 / 74.5 / 76.5 / 78.5 / 75.0 / 74.5 / 75.0 / 69.0 | 72.5 / 70.5 / 77.0 / 76.0 / 75.5 / 72.0 / 73.0 / 76.0 | 53.0 / 61.0 / 51.0 / 53.0 / 57.5 / 56.5 / 54.5 / 53.5 |
| BACK_HORIZONTAL cut 0.5 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 | 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 / 100.0 |
| BACK_HORIZONTAL cut 1 | 38.5 / 34.5 / 41.5 / 45.0 / 42.0 / 46.5 / 37.0 / 38.5 | 41.5 / 46.0 / 43.5 / 43.5 / 39.5 / 40.5 / 42.0 / 46.5 | 45.0 / 39.0 / 44.5 / 43.0 / 45.5 / 40.0 / 44.0 / 40.5 |
| BACK_HORIZONTAL all mid (0.5 mm, 0.5 deg, cut 0.5 mm) | 87.5 / 87.5 / 85.0 / 81.5 / 85.5 / 90.0 / 90.0 / 88.5 | 82.5 / 91.5 / 90.0 / 89.0 / 89.0 / 91.0 / 85.5 / 86.0 | 90.0 / 90.0 / 82.5 / 90.5 / 91.0 / 90.5 / 89.5 / 88.5 |
| BACK_HORIZONTAL all max (1.0 mm, 1 deg, cut 1.0 mm) | 12.5 / 14.0 / 11.5 / 19.0 / 11.5 / 19.5 / 16.5 / 15.5 | 17.5 / 15.5 / 21.0 / 15.0 / 13.5 / 15.0 / 14.5 / 10.5 | 17.0 / 12.0 / 22.5 / 15.5 / 15.5 / 11.5 / 12.5 / 10.0 |

## 5. Radius x inset (Tier 1, 2x2 board, FRONT)

Correct rate per cell (n = 1000 for r = 3.175 mm at inset 1, otherwise 200). "*" marks a cell whose correct rate differs from the baseline-radius cell (r = 3.175 mm) of the same inset and profile by more than 2 standard errors (descriptive z test, not corrected for multiple comparisons). FA = false accepts in that cell. Containment: guaranteed = the shape satisfies the Requirement 15.3 clearance (> 0 mm); r = 6 mm at inset 1 does not. voidToBorderCornerMm is the true minimum distance (it does not depend on the profile).

### CLEAN_DARK

| Radius (mm) | voidToBorderCornerMm | voidTipToBorderCornerMm (ref.) | Containment clearance at inset 1 / 1.5 / 2 (mm) | Inset 1 | Inset 1.5 | Inset 2 |
|---|---|---|---|---|---|---|
| 0 | No Central_Void | No Central_Void | 1.587 / 2.381 / 3.175 | 100.0% | 100.0% | 100.0% |
| 2 | 3.385 | 3.385 | 1.417 / 2.381 / 3.175 | 100.0% | 100.0% | 100.0% |
| 3 | 3.180 | 3.180 | 1.002 / 2.125 / 3.175 | 100.0% | 100.0% | 100.0% |
| 3.175 (baseline) | 3.175 | 3.175 | 0.930 / 2.053 / 3.175 | 100.0% | 100.0% | 100.0% |
| 3.6 | 2.999 | 3.203 | 0.754 / 1.876 / 2.999 | 100.0% | 100.0% | 100.0% |
| 4 | 2.833 | 3.280 | 0.588 / 1.711 / 2.833 | 100.0% | 100.0% | 100.0% |
| 5 | 2.419 | 3.662 | 0.174 / 1.296 / 2.419 | 100.0% | 100.0% | 100.0% |
| 6 | 2.005 | 4.250 | -0.240 (invalid) / 0.882 / 2.005 | 100.0% | 100.0% | 100.0% |

### CLEAN_LIGHT

| Radius (mm) | voidToBorderCornerMm | voidTipToBorderCornerMm (ref.) | Containment clearance at inset 1 / 1.5 / 2 (mm) | Inset 1 | Inset 1.5 | Inset 2 |
|---|---|---|---|---|---|---|
| 0 | No Central_Void | No Central_Void | 1.587 / 2.381 / 3.175 | 100.0% | 100.0% | 100.0% |
| 2 | 3.385 | 3.385 | 1.417 / 2.381 / 3.175 | 100.0% | 100.0% | 100.0% |
| 3 | 3.180 | 3.180 | 1.002 / 2.125 / 3.175 | 100.0% | 100.0% | 100.0% |
| 3.175 (baseline) | 3.175 | 3.175 | 0.930 / 2.053 / 3.175 | 100.0% | 100.0% | 100.0% |
| 3.6 | 2.999 | 3.203 | 0.754 / 1.876 / 2.999 | 100.0% | 100.0% | 100.0% |
| 4 | 2.833 | 3.280 | 0.588 / 1.711 / 2.833 | 100.0% | 100.0% | 100.0% |
| 5 | 2.419 | 3.662 | 0.174 / 1.296 / 2.419 | 100.0% | 100.0% | 100.0% |
| 6 | 2.005 | 4.250 | -0.240 (invalid) / 0.882 / 2.005 | 100.0% | 100.0% | 100.0% |

### MODERATE

| Radius (mm) | voidToBorderCornerMm | voidTipToBorderCornerMm (ref.) | Containment clearance at inset 1 / 1.5 / 2 (mm) | Inset 1 | Inset 1.5 | Inset 2 |
|---|---|---|---|---|---|---|
| 0 | No Central_Void | No Central_Void | 1.587 / 2.381 / 3.175 | 95.0% | 95.5% | 98.0% |
| 2 | 3.385 | 3.385 | 1.417 / 2.381 / 3.175 | 97.5% | 96.5% | 97.0% |
| 3 | 3.180 | 3.180 | 1.002 / 2.125 / 3.175 | 96.0% | 95.0% | 95.5% |
| 3.175 (baseline) | 3.175 | 3.175 | 0.930 / 2.053 / 3.175 | 96.7% | 97.0% | 95.5% |
| 3.6 | 2.999 | 3.203 | 0.754 / 1.876 / 2.999 | 97.0% | 93.5% | 96.0% |
| 4 | 2.833 | 3.280 | 0.588 / 1.711 / 2.833 | 94.5% | 95.5% | 98.0% |
| 5 | 2.419 | 3.662 | 0.174 / 1.296 / 2.419 | 96.0% | 98.0% | 96.5% |
| 6 | 2.005 | 4.250 | -0.240 (invalid) / 0.882 / 2.005 | 96.5% | 98.0% | 95.5% |

### STRESS

| Radius (mm) | voidToBorderCornerMm | voidTipToBorderCornerMm (ref.) | Containment clearance at inset 1 / 1.5 / 2 (mm) | Inset 1 | Inset 1.5 | Inset 2 |
|---|---|---|---|---|---|---|
| 0 | No Central_Void | No Central_Void | 1.587 / 2.381 / 3.175 | 86.0% | 82.5% | 77.0% |
| 2 | 3.385 | 3.385 | 1.417 / 2.381 / 3.175 | 87.5% * | 79.5% | 75.0% |
| 3 | 3.180 | 3.180 | 1.002 / 2.125 / 3.175 | 85.5% | 77.0% * | 75.0% |
| 3.175 (baseline) | 3.175 | 3.175 | 0.930 / 2.053 / 3.175 | 81.4% | 85.0% | 77.0% |
| 3.6 | 2.999 | 3.203 | 0.754 / 1.876 / 2.999 | 85.0% | 82.0% | 77.0% |
| 4 | 2.833 | 3.280 | 0.588 / 1.711 / 2.833 | 85.5% | 83.0% | 82.5% |
| 5 | 2.419 | 3.662 | 0.174 / 1.296 / 2.419 | 82.0% | 79.0% | 77.0% |
| 6 | 2.005 | 4.250 | -0.240 (invalid) / 0.882 / 2.005 | 86.5% | 80.5% | 81.5% |

## 6. Highest-impact degradation factors (baseline geometry, Tier 2)

The lowest correct rates among the one-factor-at-a-time cells at r = 3.175 mm, inset 1 (each cell separate, n = 200).

| Rank | Factor level | Correct | Rejected (kinds) | False accepts |
|---|---|---|---|---|
| 1 | blurPx=1.5: r=3.175 mm, inset 1 | 0/200 (0.0%) | 200: INVALID_MARKER 200 | 0 |
| 2 | blurPx=2: r=3.175 mm, inset 1 | 0/200 (0.0%) | 200: INVALID_MARKER 200 | 0 |
| 3 | tiltDeg=40: r=3.175 mm, inset 1 | 0/200 (0.0%) | 200: INCOMPLETE_GROUP 200 | 0 |
| 4 | rotationDeg=3: r=3.175 mm, inset 1 | 65/200 (32.5%) | 135: INCOMPLETE_GROUP 135 | 0 |
| 5 | tiltDeg=30: r=3.175 mm, inset 1 | 100/200 (50.0%) | 100: INCOMPLETE_GROUP 100 | 0 |
| 6 | rotationDeg=2: r=3.175 mm, inset 1 | 158/200 (79.0%) | 42: INCOMPLETE_GROUP 42 | 0 |
| 7 | rotationDeg=1: r=3.175 mm, inset 1 | 199/200 (99.5%) | 1: INCOMPLETE_GROUP 1 | 0 |
| 8 | shiftMm=1.5: r=3.175 mm, inset 1 | 199/200 (99.5%) | 1: INCOMPLETE_GROUP 1 | 0 |
| 9 | lightingStrength=0.2: r=3.175 mm, inset 1 | 200/200 (100.0%) | 0: - | 0 |
| 10 | lightingStrength=0.4: r=3.175 mm, inset 1 | 200/200 (100.0%) | 0: - | 0 |
| 11 | lightingStrength=0.6: r=3.175 mm, inset 1 | 200/200 (100.0%) | 0: - | 0 |
| 12 | blurPx=0.5: r=3.175 mm, inset 1 | 200/200 (100.0%) | 0: - | 0 |

## 7. Tier 4: 3x3 boards with Distractor_Markers and incomplete groups

Incomplete-group cells expect a rejection; a false accept is any IDENTIFIED result.

| Cell | n | Correct | Rejected (kinds) | False accepts | 95% upper bound (only when 0) |
|---|---|---|---|---|---|
| T4-2x2-incomplete: 2x2 one card absent, CLEAN_LIGHT: r=0 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, CLEAN_DARK: r=0 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, MODERATE: r=0 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, STRESS: r=0 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, CLEAN_LIGHT: r=3.175 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, CLEAN_DARK: r=3.175 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, MODERATE: r=3.175 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, STRESS: r=3.175 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, CLEAN_LIGHT: r=3.175 mm, inset 1.5 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, CLEAN_DARK: r=3.175 mm, inset 1.5 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, MODERATE: r=3.175 mm, inset 1.5 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, STRESS: r=3.175 mm, inset 1.5 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, CLEAN_LIGHT: r=3.175 mm, inset 2 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, CLEAN_DARK: r=3.175 mm, inset 2 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, MODERATE: r=3.175 mm, inset 2 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, STRESS: r=3.175 mm, inset 2 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, CLEAN_LIGHT: r=6 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, CLEAN_DARK: r=6 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, MODERATE: r=6 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, STRESS: r=6 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, CLEAN_LIGHT: r=6 mm, inset 1.5 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, CLEAN_DARK: r=6 mm, inset 1.5 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, MODERATE: r=6 mm, inset 1.5 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-2x2-incomplete: 2x2 one card absent, STRESS: r=6 mm, inset 1.5 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3: 3x3 board, CLEAN_LIGHT: r=0 mm, inset 1 | 200 | 200 (100.0%) | 0 (0.0%): - | 0 | 1.49% |
| T4-3x3: 3x3 board, CLEAN_DARK: r=0 mm, inset 1 | 200 | 200 (100.0%) | 0 (0.0%): - | 0 | 1.49% |
| T4-3x3: 3x3 board, MODERATE: r=0 mm, inset 1 | 200 | 185 (92.5%) | 15 (7.5%): INCOMPLETE_GROUP 15 | 0 | 1.49% |
| T4-3x3: 3x3 board, STRESS: r=0 mm, inset 1 | 200 | 147 (73.5%) | 53 (26.5%): INCOMPLETE_GROUP 53 | 0 | 1.49% |
| T4-3x3: 3x3 board, CLEAN_LIGHT: r=3.175 mm, inset 1 | 200 | 200 (100.0%) | 0 (0.0%): - | 0 | 1.49% |
| T4-3x3: 3x3 board, CLEAN_DARK: r=3.175 mm, inset 1 | 200 | 200 (100.0%) | 0 (0.0%): - | 0 | 1.49% |
| T4-3x3: 3x3 board, MODERATE: r=3.175 mm, inset 1 | 200 | 193 (96.5%) | 7 (3.5%): INCOMPLETE_GROUP 7 | 0 | 1.49% |
| T4-3x3: 3x3 board, STRESS: r=3.175 mm, inset 1 | 200 | 146 (73.0%) | 54 (27.0%): INCOMPLETE_GROUP 54 | 0 | 1.49% |
| T4-3x3: 3x3 board, CLEAN_LIGHT: r=3.175 mm, inset 1.5 | 200 | 200 (100.0%) | 0 (0.0%): - | 0 | 1.49% |
| T4-3x3: 3x3 board, CLEAN_DARK: r=3.175 mm, inset 1.5 | 200 | 200 (100.0%) | 0 (0.0%): - | 0 | 1.49% |
| T4-3x3: 3x3 board, MODERATE: r=3.175 mm, inset 1.5 | 200 | 184 (92.0%) | 16 (8.0%): INCOMPLETE_GROUP 16 | 0 | 1.49% |
| T4-3x3: 3x3 board, STRESS: r=3.175 mm, inset 1.5 | 200 | 136 (68.0%) | 64 (32.0%): INCOMPLETE_GROUP 64 | 0 | 1.49% |
| T4-3x3: 3x3 board, CLEAN_LIGHT: r=3.175 mm, inset 2 | 200 | 200 (100.0%) | 0 (0.0%): - | 0 | 1.49% |
| T4-3x3: 3x3 board, CLEAN_DARK: r=3.175 mm, inset 2 | 200 | 200 (100.0%) | 0 (0.0%): - | 0 | 1.49% |
| T4-3x3: 3x3 board, MODERATE: r=3.175 mm, inset 2 | 200 | 185 (92.5%) | 15 (7.5%): INCOMPLETE_GROUP 15 | 0 | 1.49% |
| T4-3x3: 3x3 board, STRESS: r=3.175 mm, inset 2 | 200 | 123 (61.5%) | 77 (38.5%): INCOMPLETE_GROUP 77 | 0 | 1.49% |
| T4-3x3: 3x3 board, CLEAN_LIGHT: r=6 mm, inset 1 | 200 | 200 (100.0%) | 0 (0.0%): - | 0 | 1.49% |
| T4-3x3: 3x3 board, CLEAN_DARK: r=6 mm, inset 1 | 200 | 200 (100.0%) | 0 (0.0%): - | 0 | 1.49% |
| T4-3x3: 3x3 board, MODERATE: r=6 mm, inset 1 | 200 | 190 (95.0%) | 10 (5.0%): INCOMPLETE_GROUP 10 | 0 | 1.49% |
| T4-3x3: 3x3 board, STRESS: r=6 mm, inset 1 | 200 | 135 (67.5%) | 65 (32.5%): INCOMPLETE_GROUP 65 | 0 | 1.49% |
| T4-3x3: 3x3 board, CLEAN_LIGHT: r=6 mm, inset 1.5 | 200 | 200 (100.0%) | 0 (0.0%): - | 0 | 1.49% |
| T4-3x3: 3x3 board, CLEAN_DARK: r=6 mm, inset 1.5 | 200 | 200 (100.0%) | 0 (0.0%): - | 0 | 1.49% |
| T4-3x3: 3x3 board, MODERATE: r=6 mm, inset 1.5 | 200 | 185 (92.5%) | 15 (7.5%): INCOMPLETE_GROUP 15 | 0 | 1.49% |
| T4-3x3: 3x3 board, STRESS: r=6 mm, inset 1.5 | 200 | 140 (70.0%) | 60 (30.0%): INCOMPLETE_GROUP 60 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, CLEAN_LIGHT: r=0 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, CLEAN_DARK: r=0 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, MODERATE: r=0 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, STRESS: r=0 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, CLEAN_LIGHT: r=3.175 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, CLEAN_DARK: r=3.175 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, MODERATE: r=3.175 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, STRESS: r=3.175 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, CLEAN_LIGHT: r=3.175 mm, inset 1.5 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, CLEAN_DARK: r=3.175 mm, inset 1.5 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, MODERATE: r=3.175 mm, inset 1.5 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, STRESS: r=3.175 mm, inset 1.5 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, CLEAN_LIGHT: r=3.175 mm, inset 2 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, CLEAN_DARK: r=3.175 mm, inset 2 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, MODERATE: r=3.175 mm, inset 2 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, STRESS: r=3.175 mm, inset 2 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, CLEAN_LIGHT: r=6 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, CLEAN_DARK: r=6 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, MODERATE: r=6 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, STRESS: r=6 mm, inset 1 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, CLEAN_LIGHT: r=6 mm, inset 1.5 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, CLEAN_DARK: r=6 mm, inset 1.5 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, MODERATE: r=6 mm, inset 1.5 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |
| T4-3x3-incomplete: 3x3 one card absent, STRESS: r=6 mm, inset 1.5 | 200 | expected 0 | 200 (100.0%): INCOMPLETE_GROUP 200 | 0 | 1.49% |

## 8. False accepts and failures

No false accept was observed in any cell. Zero false accepts is an observation under the sampled synthetic conditions (independent seeded trials). It is not a guarantee, it holds only for the sampled synthetic condition distribution, and it says nothing about real cameras.

Failure-cause tally over all cells (sum of counts; rejections of incomplete-group cells are the expected outcome and are not counted as failures; "|containment-not-guaranteed" marks trials whose focus cards may have markers clipped by the cut outline under the conservative bound):

| Cause | Count |
|---|---|
| INCOMPLETE_GROUP | 22193 |
| INCOMPLETE_GROUP\|containment-not-guaranteed | 9453 |
| INVALID_MARKER | 2000 |
| INVALID_MARKER\|containment-not-guaranteed | 400 |

Cells with at least one non-correct trial that was not an expected rejection are listed with their first failing seeds in `geometry-experiments.json` (`rejectedSeedsSample`, at most 20 per cell).

### 8.1 Spurious-marker check (the known 0x5AC54 detector finding)

Every recorded false-accept seed and the first 6 recorded failing seeds of every cell were re-run and the image given to the reader was inspected. A blob is a detected marker with bits 0x1FFFFFF (the signature of the documented 0x5AC54 finding: an isolated black blob inside a marker data area accepted as a marker). A failure counts as consequentially spurious only when such a blob was a member of the decoded group. Trials with a blob detected (anywhere in the image): 0; of these, blob not a group member: 0.

Analyzed trials: 2179. Trials whose decoder result carried at least one SPURIOUS_CANDIDATE marker: 0. Failures attributed to a spurious marker: 0.

### 8.3 Diagnostic probes of failing seeds

- Probe, FRONT, cut offset 1.0 mm (r=3.175 mm, inset 1, 20 failing seeds of cell 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat): re-decoded with positionToleranceModules 1: correct 0, rejected 20, false accept 0; 1.5: correct 20, rejected 0, false accept 0; 2: correct 20, rejected 0, false accept 0. This is a diagnostic re-run of failing seeds only; the reader's tolerance was not changed and the other cells were not re-run.
- Probe, BACK_VERTICAL, registration shift 1.0 mm (r=3.175 mm, inset 1, 20 failing seeds of cell 2x2-BV-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat): re-decoded with positionToleranceModules 1: correct 0, rejected 20, false accept 0; 1.5: correct 20, rejected 0, false accept 0; 2: correct 20, rejected 0, false accept 0. This is a diagnostic re-run of failing seeds only; the reader's tolerance was not changed and the other cells were not re-run.
- Probe, BACK_VERTICAL, registration rotation 1 deg (r=3.175 mm, inset 1, 20 failing seeds of cell 2x2-BV-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat): re-decoded with positionToleranceModules 1: correct 0, rejected 20, false accept 0; 1.5: correct 20, rejected 0, false accept 0; 2: correct 20, rejected 0, false accept 0. This is a diagnostic re-run of failing seeds only; the reader's tolerance was not changed and the other cells were not re-run.
- Probe, placement rotation bound 2 deg (r=3.175 mm, inset 1, 20 failing seeds of cell 2x2-F-r3.175-i1-tb64-sh0-ro2-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat): re-decoded with positionToleranceModules 1: correct 0, rejected 20, false accept 0; 1.5: correct 18, rejected 2, false accept 0; 2: correct 20, rejected 0, false accept 0. This is a diagnostic re-run of failing seeds only; the reader's tolerance was not changed and the other cells were not re-run.
- Probe, camera rotation exactly 45 deg at inset 2 (cell 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm45-tl0-bl0-lt0-rs0-rr0-co0-mat, 200 of 200 trials rejected): seed 4283752155: INCOMPLETE_GROUP detected 3, markers 5; seed 2570642193: INCOMPLETE_GROUP detected 3, markers 4; seed 100199672: INCOMPLETE_GROUP detected 3, markers 4; seed 287810398: INCOMPLETE_GROUP detected 3, markers 4; seed 547529977: INCOMPLETE_GROUP detected 3, markers 5; seed 3752234771: INCOMPLETE_GROUP detected 3, markers 5.

Limits of this check:

- Only the first 6 recorded failing seeds per cell were re-run (a cell stores at most 20); cells with more failures than that are covered by a sample of their failures, not all of them. Correct trials were not inspected.
- The decoder result lists no markers for NOT_DETECTED, INVALID_MARKER and INCOMPLETE_GROUP; for these the image was checked with detectMarkers directly, so a blob can be seen but its effect on the result is not attributable from the result alone.
- A spurious marker other than the 0x1FFFFFF signature (SPURIOUS_CANDIDATE with other bits) is counted in trialsWithSpuriousCandidates but not classified.

## 9. Decision table (order of Requirement 15.7)

**Synthetic images, not real cameras.** The table follows the improvement order of Requirement 15.7. Registration and cut tolerances are recorded in section 4, before any card-shape conclusion. Zero false accepts anywhere in this table is an observation under the sampled synthetic conditions, not a guarantee.

| Step | Requirement | Evaluated | Outcome |
|---|---|---|---|
| 1. Adjust fragment positions and Marker_Inset | 15.7 (1) | yes | Evaluated. Differences beyond about 2 standard errors (descriptive z test, not corrected for multiple comparisons): r=0 mm STRESS inset 2 vs inset 1: lower (z = -2.3). |
| 2. Adjust marker size and margin | 15.7 (2) | NO (not evaluated) | NOT EVALUATED in task 5.6 (a module-size / margin sweep is not in the task text and was not added). |
| 3. Improve the detection and geometric-correction algorithm | 15.7 (3) | NO (not evaluated) | NOT EVALUATED in task 5.6 (algorithm changes are out of scope while the decoder is frozen). |
| 4. Evaluate the physical alignment tolerance (placement, front-back registration, cut outline) | 15.7 (4), 16.8 | yes | Evaluated for the swept levels (Tier 2 placement sweeps, Tier 3 registration / cut sweeps). The tolerance tables precede this decision table and give the levels at which recognition degrades. Real printing and cutting tolerances are unknown and are not measured here. |
| 5. Reduce the Corner_Radius in steps (only if necessary) | 15.7 (5) | NO (not evaluated) | NO corner-radius reduction is recommended. Requirement 15.7 allows it only after steps 1 to 4 are evaluated and recorded; steps 2 and 3 are not evaluated here. The card corner shape must not be changed on the basis of a single failure case or on these synthetic results.  |

Evidence by step:

**1. Adjust fragment positions and Marker_Inset**

- r=3.175 mm, CLEAN_DARK: correct at inset 1 / 1.5 / 2 = 100.0% / 100.0% / 100.0% (n = 1000 / 200 / 200)
- r=3.175 mm, CLEAN_LIGHT: correct at inset 1 / 1.5 / 2 = 100.0% / 100.0% / 100.0% (n = 1000 / 200 / 200)
- r=3.175 mm, MODERATE: correct at inset 1 / 1.5 / 2 = 96.7% / 97.0% / 95.5% (n = 1000 / 200 / 200)
- r=3.175 mm, STRESS: correct at inset 1 / 1.5 / 2 = 81.4% / 85.0% / 77.0% (n = 1000 / 200 / 200)
- r=6 mm, CLEAN_DARK: correct at inset 1 / 1.5 / 2 = 100.0% / 100.0% / 100.0% (n = 200 / 200 / 200)
- r=6 mm, CLEAN_LIGHT: correct at inset 1 / 1.5 / 2 = 100.0% / 100.0% / 100.0% (n = 200 / 200 / 200)
- r=6 mm, MODERATE: correct at inset 1 / 1.5 / 2 = 96.5% / 98.0% / 95.5% (n = 200 / 200 / 200)
- r=6 mm, STRESS: correct at inset 1 / 1.5 / 2 = 86.5% / 80.5% / 81.5% (n = 200 / 200 / 200)
- r=0 mm, CLEAN_DARK: correct at inset 1 / 1.5 / 2 = 100.0% / 100.0% / 100.0% (n = 200 / 200 / 200)
- r=0 mm, CLEAN_LIGHT: correct at inset 1 / 1.5 / 2 = 100.0% / 100.0% / 100.0% (n = 200 / 200 / 200)
- r=0 mm, MODERATE: correct at inset 1 / 1.5 / 2 = 95.0% / 95.5% / 98.0% (n = 200 / 200 / 200)
- r=0 mm, STRESS: correct at inset 1 / 1.5 / 2 = 86.0% / 82.5% / 77.0% (n = 200 / 200 / 200)
- Diagnostic, decoder defaults (not told the inset), r=3.175 mm, inset 1.5 / 2: correct 100.0% / 0.0%. The inset sweep above gives the reader the matching marker offset (an existing option); no threshold was changed.

**2. Adjust marker size and margin**

- No module-size or quiet-margin sweep was run. The sweep fixes the module size at 1.5875 mm and the quiet margin at the design value.

**3. Improve the detection and geometric-correction algorithm**

- The detector and decoder are frozen for this task; recognition thresholds, tolerances, the acceptance radius and binarization are unchanged.

**4. Evaluate the physical alignment tolerance (placement, front-back registration, cut outline)**

- FRONT, cutOffsetMm, baseline geometry: 0: 100.0%, 0.5: 100.0%, 1: 42.0%; first level below 100%: 1; first level below 95%: 1
- BACK_VERTICAL, regShiftMm, baseline geometry: 0: 100.0%, 0.25: 100.0%, 0.5: 100.0%, 1: 37.5%; first level below 100%: 1; first level below 95%: 1
- BACK_VERTICAL, regRotDeg, baseline geometry: 0: 100.0%, 0.5: 100.0%, 1: 70.5%; first level below 100%: 1; first level below 95%: 1
- BACK_VERTICAL, cutOffsetMm, baseline geometry: 0: 100.0%, 0.5: 100.0%, 1: 35.0%; first level below 100%: 1; first level below 95%: 1
- BACK_VERTICAL, all errors together, baseline geometry: zero: 100.0%, mid (0.5 mm, 0.5 deg, cut 0.5 mm): 88.5%, max (1.0 mm, 1 deg, cut 1.0 mm): 16.5%; first level below 100%: mid (0.5 mm, 0.5 deg, cut 0.5 mm); first level below 95%: mid (0.5 mm, 0.5 deg, cut 0.5 mm)
- BACK_HORIZONTAL, regShiftMm, baseline geometry: 0: 100.0%, 0.25: 100.0%, 0.5: 100.0%, 1: 42.5%; first level below 100%: 1; first level below 95%: 1
- BACK_HORIZONTAL, regRotDeg, baseline geometry: 0: 100.0%, 0.5: 100.0%, 1: 78.5%; first level below 100%: 1; first level below 95%: 1
- BACK_HORIZONTAL, cutOffsetMm, baseline geometry: 0: 100.0%, 0.5: 100.0%, 1: 45.0%; first level below 100%: 1; first level below 95%: 1
- BACK_HORIZONTAL, all errors together, baseline geometry: zero: 100.0%, mid (0.5 mm, 0.5 deg, cut 0.5 mm): 81.5%, max (1.0 mm, 1 deg, cut 1.0 mm): 19.0%; first level below 100%: mid (0.5 mm, 0.5 deg, cut 0.5 mm); first level below 95%: mid (0.5 mm, 0.5 deg, cut 0.5 mm)
- placement shiftMm, baseline geometry: 0: 100.0%, 0.5: 100.0%, 1: 100.0%, 1.5: 99.5%; first level below 100%: 1.5; first level below 95%: none
- placement rotationDeg, baseline geometry: 0: 100.0%, 1: 99.5%, 2: 79.0%, 3: 32.5%; first level below 100%: 1; first level below 95%: 2
- placement gapMm, baseline geometry: 0: 100.0%, 0.5: 100.0%, 1: 100.0%; first level below 100%: none; first level below 95%: none
- Diagnostic (section 8.3): Probe, FRONT, cut offset 1.0 mm (r=3.175 mm, inset 1, 20 failing seeds of cell 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat): re-decoded with positionToleranceModules 1: correct 0, rejected 20, false accept 0; 1.5: correct 20, rejected 0, false accept 0; 2: correct 20, rejected 0, false accept 0. This is a diagnostic re-run of failing seeds only; the reader's tolerance was not changed and the other cells were not re-run.
- Diagnostic (section 8.3): Probe, BACK_VERTICAL, registration shift 1.0 mm (r=3.175 mm, inset 1, 20 failing seeds of cell 2x2-BV-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat): re-decoded with positionToleranceModules 1: correct 0, rejected 20, false accept 0; 1.5: correct 20, rejected 0, false accept 0; 2: correct 20, rejected 0, false accept 0. This is a diagnostic re-run of failing seeds only; the reader's tolerance was not changed and the other cells were not re-run.
- Diagnostic (section 8.3): Probe, BACK_VERTICAL, registration rotation 1 deg (r=3.175 mm, inset 1, 20 failing seeds of cell 2x2-BV-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat): re-decoded with positionToleranceModules 1: correct 0, rejected 20, false accept 0; 1.5: correct 20, rejected 0, false accept 0; 2: correct 20, rejected 0, false accept 0. This is a diagnostic re-run of failing seeds only; the reader's tolerance was not changed and the other cells were not re-run.
- Diagnostic (section 8.3): Probe, placement rotation bound 2 deg (r=3.175 mm, inset 1, 20 failing seeds of cell 2x2-F-r3.175-i1-tb64-sh0-ro2-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat): re-decoded with positionToleranceModules 1: correct 0, rejected 20, false accept 0; 1.5: correct 18, rejected 2, false accept 0; 2: correct 20, rejected 0, false accept 0. This is a diagnostic re-run of failing seeds only; the reader's tolerance was not changed and the other cells were not re-run.
- Diagnostic (section 8.3): Probe, camera rotation exactly 45 deg at inset 2 (cell 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm45-tl0-bl0-lt0-rs0-rr0-co0-mat, 200 of 200 trials rejected): seed 4283752155: INCOMPLETE_GROUP detected 3, markers 5; seed 2570642193: INCOMPLETE_GROUP detected 3, markers 4; seed 100199672: INCOMPLETE_GROUP detected 3, markers 4; seed 287810398: INCOMPLETE_GROUP detected 3, markers 4; seed 547529977: INCOMPLETE_GROUP detected 3, markers 5; seed 3752234771: INCOMPLETE_GROUP detected 3, markers 5.

**5. Reduce the Corner_Radius in steps (only if necessary)**

- inset 1, CLEAN_DARK: correct at r = 0 / 3.175 / 6 mm = 100.0% / 100.0% / 100.0% (information only; r = 6 mm at inset 1 has no valid containment)
- inset 1, CLEAN_LIGHT: correct at r = 0 / 3.175 / 6 mm = 100.0% / 100.0% / 100.0% (information only; r = 6 mm at inset 1 has no valid containment)
- inset 1, MODERATE: correct at r = 0 / 3.175 / 6 mm = 95.0% / 96.7% / 96.5% (information only; r = 6 mm at inset 1 has no valid containment)
- inset 1, STRESS: correct at r = 0 / 3.175 / 6 mm = 86.0% / 81.4% / 86.5% (information only; r = 6 mm at inset 1 has no valid containment)

## 10. Limitations

- Synthetic images drawn by `src/optical/testing/`, not real cameras, printers or paper. Paper show-through is not simulated (Requirement 16.10 is a Milestone 8 measurement).
- Cells are sampled, not exhaustive: 824 cells of a 207-million-cell full factorial. Interactions between degradation factors are only covered by the MODERATE and STRESS profiles.
- The reader was given the marker offset matching the inset (`centerOffsetModules = inset + 1 + 3.5`, an existing option); with the decoder defaults insets 1.5 and 2 are measured only by the two diagnostic cells.
- Requirement 15.7 steps 2 (marker size and margin) and 3 (detection and geometric-correction algorithm) are not evaluated.
- Placement model: where a rotated card runs into a neighbour, the later card in row-major order is painted on top. This is a raster convention, not contact mechanics.
- Rates of different cells are not comparable as one population: n differs (1000 vs 200), and cells are independent draws.

### 10.1 Known unresolved detection limitations

- (a) The marker-like gate in `src/optical/detect.ts` (`quadArea / hullArea < 0.85`) silently drops a marker without recording a rejected candidate. The cell `2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm45-tl0-bl0-lt0-rs0-rr0-co0-mat` (camera rotation exactly 45 deg, inset 2) measured 0% correct (200 of 200 trials INCOMPLETE_GROUP) for this reason. In the analysed image the ratio of the lost marker was 0.843, against 0.892 to 0.894 for the other three markers, at 4 px per module. The cause is established by the analysis in `docs/optical/results/m5-6-45deg-analysis.md`.
- (b) Harness property: cells with a camera rotation of exactly 45 deg, or without a warp, sample a single pixel phase. Their 0% and 100% results therefore do not show robustness or fragility over pixel phases. In particular, the 100% at inset 1 and inset 1.5 at 45 deg must not be read as robust.
- (c) The proposal to lower the gate from 0.85 to 0.80 is NOT applied. Applying it would require a separate re-run as a separate dataset. Results measured with the current gate and results measured with a changed gate are not to be mixed (no pre-fix and post-fix pooling).
- (d) The default `positionToleranceModules` stays 1.0. Widening it needs separate validation against false grouping, incomplete groups and Distractor_Markers. In the diagnostic probes of section 8.3, failing seeds of the 1 mm registration-shift and cut-offset cells decode correctly at 1.5. That is a probe on failing seeds only, not an adopted change.
- (e) Requirement 15.7 steps 2 (marker size and margin) and 3 (detection and geometric-correction algorithm) are not evaluated, and Tier 5 was not run. No corner-radius reduction is recommended.
- (f) The setting `centerOffsetModules = inset + 1 + 3.5` comes from the predefined physical layout (the inset parameter of the cell). It is never derived from card identities or from the ground truth of the board.

## Appendix A: every cell

Sorted by cell id. Bound = exact one-sided 95% upper bound 1 - 0.05^(1/n), shown only when false accepts = 0; otherwise the failing seeds are shown. "No Central_Void" = corner radius 0.

| Cell id | Tier | n | Correct | Rate | Rejected | Rate | Rejection kinds | False accepts | FA rate | FA bound / failing seeds | voidToBorderCornerMm | voidTipToBorderCornerMm | Guaranteed clearance (mm) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2x2-BH-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-BH-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.087 |
| 2x2-BH-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 77 | 38.5% | 123 | 61.5% | INCOMPLETE_GROUP 123 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 0.588 |
| 2x2-BH-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.130 |
| 2x2-BH-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 148 | 74.0% | 52 | 26.0% | INCOMPLETE_GROUP 52 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 0.673 |
| 2x2-BH-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.337 |
| 2x2-BH-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.087 |
| 2x2-BH-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 175 | 87.5% | 25 | 12.5% | INCOMPLETE_GROUP 25 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 0.130 |
| 2x2-BH-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 68 | 34.0% | 132 | 66.0% | INCOMPLETE_GROUP 132 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 0.588 |
| 2x2-BH-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 25 | 12.5% | 175 | 87.5% | INCOMPLETE_GROUP 175 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | -1.327 (not guaranteed) |
| 2x2-BH-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.381 |
| 2x2-BH-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.881 |
| 2x2-BH-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 83 | 41.5% | 117 | 58.5% | INCOMPLETE_GROUP 117 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.381 |
| 2x2-BH-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.933 |
| 2x2-BH-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 145 | 72.5% | 55 | 27.5% | INCOMPLETE_GROUP 55 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.486 |
| 2x2-BH-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.131 |
| 2x2-BH-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.881 |
| 2x2-BH-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 165 | 82.5% | 35 | 17.5% | INCOMPLETE_GROUP 35 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 0.933 |
| 2x2-BH-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 67 | 33.5% | 133 | 66.5% | INCOMPLETE_GROUP 133 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.381 |
| 2x2-BH-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 35 | 17.5% | 165 | 82.5% | INCOMPLETE_GROUP 165 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | -0.514 (not guaranteed) |
| 2x2-BH-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 3.175 |
| 2x2-BH-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.675 |
| 2x2-BH-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 90 | 45.0% | 110 | 55.0% | INCOMPLETE_GROUP 110 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.175 |
| 2x2-BH-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.737 |
| 2x2-BH-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 106 | 53.0% | 94 | 47.0% | INCOMPLETE_GROUP 94 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.299 |
| 2x2-BH-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.925 |
| 2x2-BH-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.675 |
| 2x2-BH-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 180 | 90.0% | 20 | 10.0% | INCOMPLETE_GROUP 20 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.737 |
| 2x2-BH-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 88 | 44.0% | 112 | 56.0% | INCOMPLETE_GROUP 112 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.175 |
| 2x2-BH-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 34 | 17.0% | 166 | 83.0% | INCOMPLETE_GROUP 166 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 0.299 |
| 2x2-BH-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 1.417 |
| 2x2-BH-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 0.917 |
| 2x2-BH-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 69 | 34.5% | 131 | 65.5% | INCOMPLETE_GROUP 131 | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 0.417 |
| 2x2-BH-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 0.959 |
| 2x2-BH-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 149 | 74.5% | 51 | 25.5% | INCOMPLETE_GROUP 51 | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 0.502 |
| 2x2-BH-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 1.167 |
| 2x2-BH-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 0.917 |
| 2x2-BH-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 175 | 87.5% | 25 | 12.5% | INCOMPLETE_GROUP 25 | 0 | 0.00% | 1.49% | 3.385 | 3.385 | -0.041 (not guaranteed) |
| 2x2-BH-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 72 | 36.0% | 128 | 64.0% | INCOMPLETE_GROUP 128 | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 0.417 |
| 2x2-BH-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 28 | 14.0% | 172 | 86.0% | INCOMPLETE_GROUP 172 | 0 | 0.00% | 1.49% | 3.385 | 3.385 | -1.498 (not guaranteed) |
| 2x2-BH-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 2.381 |
| 2x2-BH-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 1.881 |
| 2x2-BH-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 92 | 46.0% | 108 | 54.0% | INCOMPLETE_GROUP 108 | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 1.381 |
| 2x2-BH-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 1.933 |
| 2x2-BH-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 141 | 70.5% | 59 | 29.5% | INCOMPLETE_GROUP 59 | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 1.486 |
| 2x2-BH-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 2.131 |
| 2x2-BH-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 1.881 |
| 2x2-BH-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 183 | 91.5% | 17 | 8.5% | INCOMPLETE_GROUP 17 | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 0.933 |
| 2x2-BH-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 77 | 38.5% | 123 | 61.5% | INCOMPLETE_GROUP 123 | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 1.381 |
| 2x2-BH-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 31 | 15.5% | 169 | 84.5% | INCOMPLETE_GROUP 169 | 0 | 0.00% | 1.49% | 4.430 | 4.430 | -0.514 (not guaranteed) |
| 2x2-BH-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 3.175 |
| 2x2-BH-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 2.675 |
| 2x2-BH-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 78 | 39.0% | 122 | 61.0% | INCOMPLETE_GROUP 122 | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 2.175 |
| 2x2-BH-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 2.737 |
| 2x2-BH-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 122 | 61.0% | 78 | 39.0% | INCOMPLETE_GROUP 78 | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 2.299 |
| 2x2-BH-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 2.925 |
| 2x2-BH-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 2.675 |
| 2x2-BH-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 180 | 90.0% | 20 | 10.0% | INCOMPLETE_GROUP 20 | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 1.737 |
| 2x2-BH-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 83 | 41.5% | 117 | 58.5% | INCOMPLETE_GROUP 117 | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 2.175 |
| 2x2-BH-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 24 | 12.0% | 176 | 88.0% | INCOMPLETE_GROUP 176 | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 0.299 |
| 2x2-BH-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 1.002 |
| 2x2-BH-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 0.502 |
| 2x2-BH-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 83 | 41.5% | 117 | 58.5% | INCOMPLETE_GROUP 117 | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 0.002 |
| 2x2-BH-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 0.545 |
| 2x2-BH-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 153 | 76.5% | 47 | 23.5% | INCOMPLETE_GROUP 47 | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 0.088 |
| 2x2-BH-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 0.752 |
| 2x2-BH-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 0.502 |
| 2x2-BH-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 170 | 85.0% | 30 | 15.0% | INCOMPLETE_GROUP 30 | 0 | 0.00% | 1.49% | 3.180 | 3.180 | -0.455 (not guaranteed) |
| 2x2-BH-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 101 | 50.5% | 99 | 49.5% | INCOMPLETE_GROUP 99 | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 0.002 |
| 2x2-BH-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 23 | 11.5% | 177 | 88.5% | INCOMPLETE_GROUP 177 | 0 | 0.00% | 1.49% | 3.180 | 3.180 | -1.912 (not guaranteed) |
| 2x2-BH-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 2.125 |
| 2x2-BH-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 1.625 |
| 2x2-BH-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 87 | 43.5% | 113 | 56.5% | INCOMPLETE_GROUP 113 | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 1.125 |
| 2x2-BH-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 1.677 |
| 2x2-BH-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 154 | 77.0% | 46 | 23.0% | INCOMPLETE_GROUP 46 | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 1.230 |
| 2x2-BH-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 1.875 |
| 2x2-BH-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 1.625 |
| 2x2-BH-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 180 | 90.0% | 20 | 10.0% | INCOMPLETE_GROUP 20 | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 0.677 |
| 2x2-BH-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 78 | 39.0% | 122 | 61.0% | INCOMPLETE_GROUP 122 | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 1.125 |
| 2x2-BH-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 42 | 21.0% | 158 | 79.0% | INCOMPLETE_GROUP 158 | 0 | 0.00% | 1.49% | 4.085 | 4.085 | -0.770 (not guaranteed) |
| 2x2-BH-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 3.175 |
| 2x2-BH-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 2.675 |
| 2x2-BH-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 89 | 44.5% | 111 | 55.5% | INCOMPLETE_GROUP 111 | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 2.175 |
| 2x2-BH-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 2.737 |
| 2x2-BH-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 102 | 51.0% | 98 | 49.0% | INCOMPLETE_GROUP 98 | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 2.299 |
| 2x2-BH-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 2.925 |
| 2x2-BH-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 2.675 |
| 2x2-BH-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 165 | 82.5% | 35 | 17.5% | INCOMPLETE_GROUP 35 | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 1.737 |
| 2x2-BH-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 82 | 41.0% | 118 | 59.0% | INCOMPLETE_GROUP 118 | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 2.175 |
| 2x2-BH-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 45 | 22.5% | 155 | 77.5% | INCOMPLETE_GROUP 155 | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 0.299 |
| 2x2-BH-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-BH-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.430 |
| 2x2-BH-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 90 | 45.0% | 110 | 55.0% | INCOMPLETE_GROUP 110 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | -0.070 (not guaranteed) |
| 2x2-BH-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.473 |
| 2x2-BH-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 157 | 78.5% | 43 | 21.5% | INCOMPLETE_GROUP 43 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.015 |
| 2x2-BH-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.680 |
| 2x2-BH-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.430 |
| 2x2-BH-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 163 | 81.5% | 37 | 18.5% | INCOMPLETE_GROUP 37 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | -0.527 (not guaranteed) |
| 2x2-BH-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 85 | 42.5% | 115 | 57.5% | INCOMPLETE_GROUP 115 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | -0.070 (not guaranteed) |
| 2x2-BH-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 38 | 19.0% | 162 | 81.0% | INCOMPLETE_GROUP 162 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | -1.985 (not guaranteed) |
| 2x2-BH-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-BH-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 1.552 |
| 2x2-BH-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 87 | 43.5% | 113 | 56.5% | INCOMPLETE_GROUP 113 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 1.052 |
| 2x2-BH-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 1.605 |
| 2x2-BH-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 152 | 76.0% | 48 | 24.0% | INCOMPLETE_GROUP 48 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 1.157 |
| 2x2-BH-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 1.802 |
| 2x2-BH-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 1.552 |
| 2x2-BH-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 178 | 89.0% | 22 | 11.0% | INCOMPLETE_GROUP 22 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 0.605 |
| 2x2-BH-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 87 | 43.5% | 113 | 56.5% | INCOMPLETE_GROUP 113 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 1.052 |
| 2x2-BH-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 30 | 15.0% | 170 | 85.0% | INCOMPLETE_GROUP 170 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | -0.843 (not guaranteed) |
| 2x2-BH-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-BH-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 2.675 |
| 2x2-BH-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 86 | 43.0% | 114 | 57.0% | INCOMPLETE_GROUP 114 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 2.175 |
| 2x2-BH-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 2.737 |
| 2x2-BH-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 106 | 53.0% | 94 | 47.0% | INCOMPLETE_GROUP 94 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 2.299 |
| 2x2-BH-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 2.925 |
| 2x2-BH-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 2.675 |
| 2x2-BH-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 181 | 90.5% | 19 | 9.5% | INCOMPLETE_GROUP 19 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 1.737 |
| 2x2-BH-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 72 | 36.0% | 128 | 64.0% | INCOMPLETE_GROUP 128 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 2.175 |
| 2x2-BH-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 31 | 15.5% | 169 | 84.5% | INCOMPLETE_GROUP 169 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 0.299 |
| 2x2-BH-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.999 | 3.203 | 0.754 |
| 2x2-BH-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.999 | 3.203 | 0.254 |
| 2x2-BH-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 84 | 42.0% | 116 | 58.0% | INCOMPLETE_GROUP 116 | 0 | 0.00% | 1.49% | 2.999 | 3.203 | -0.246 (not guaranteed) |
| 2x2-BH-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.999 | 3.203 | 0.296 |
| 2x2-BH-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 150 | 75.0% | 50 | 25.0% | INCOMPLETE_GROUP 50 | 0 | 0.00% | 1.49% | 2.999 | 3.203 | -0.161 (not guaranteed) |
| 2x2-BH-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.999 | 3.203 | 0.504 |
| 2x2-BH-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.999 | 3.203 | 0.254 |
| 2x2-BH-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 171 | 85.5% | 29 | 14.5% | INCOMPLETE_GROUP 29 | 0 | 0.00% | 1.49% | 2.999 | 3.203 | -0.704 (not guaranteed) |
| 2x2-BH-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 74 | 37.0% | 126 | 63.0% | INCOMPLETE_GROUP 126 | 0 | 0.00% | 1.49% | 2.999 | 3.203 | -0.246 (not guaranteed) |
| 2x2-BH-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 23 | 11.5% | 177 | 88.5% | INCOMPLETE_GROUP 177 | 0 | 0.00% | 1.49% | 2.999 | 3.203 | -2.161 (not guaranteed) |
| 2x2-BH-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 1.876 |
| 2x2-BH-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 1.376 |
| 2x2-BH-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 79 | 39.5% | 121 | 60.5% | INCOMPLETE_GROUP 121 | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 0.876 |
| 2x2-BH-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 1.429 |
| 2x2-BH-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 151 | 75.5% | 49 | 24.5% | INCOMPLETE_GROUP 49 | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 0.981 |
| 2x2-BH-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 1.626 |
| 2x2-BH-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 1.376 |
| 2x2-BH-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 178 | 89.0% | 22 | 11.0% | INCOMPLETE_GROUP 22 | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 0.429 |
| 2x2-BH-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 87 | 43.5% | 113 | 56.5% | INCOMPLETE_GROUP 113 | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 0.876 |
| 2x2-BH-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 27 | 13.5% | 173 | 86.5% | INCOMPLETE_GROUP 173 | 0 | 0.00% | 1.49% | 3.986 | 3.986 | -1.019 (not guaranteed) |
| 2x2-BH-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 2.999 |
| 2x2-BH-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 2.499 |
| 2x2-BH-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 91 | 45.5% | 109 | 54.5% | INCOMPLETE_GROUP 109 | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 1.999 |
| 2x2-BH-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 2.561 |
| 2x2-BH-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 115 | 57.5% | 85 | 42.5% | INCOMPLETE_GROUP 85 | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 2.123 |
| 2x2-BH-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 2.749 |
| 2x2-BH-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 2.499 |
| 2x2-BH-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 182 | 91.0% | 18 | 9.0% | INCOMPLETE_GROUP 18 | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 1.561 |
| 2x2-BH-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 86 | 43.0% | 114 | 57.0% | INCOMPLETE_GROUP 114 | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 1.999 |
| 2x2-BH-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 31 | 15.5% | 169 | 84.5% | INCOMPLETE_GROUP 169 | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 0.123 |
| 2x2-BH-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.833 | 3.280 | 0.588 |
| 2x2-BH-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.833 | 3.280 | 0.088 |
| 2x2-BH-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 93 | 46.5% | 107 | 53.5% | INCOMPLETE_GROUP 107 | 0 | 0.00% | 1.49% | 2.833 | 3.280 | -0.412 (not guaranteed) |
| 2x2-BH-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.833 | 3.280 | 0.131 |
| 2x2-BH-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 149 | 74.5% | 51 | 25.5% | INCOMPLETE_GROUP 51 | 0 | 0.00% | 1.49% | 2.833 | 3.280 | -0.327 (not guaranteed) |
| 2x2-BH-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.833 | 3.280 | 0.338 |
| 2x2-BH-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.833 | 3.280 | 0.088 |
| 2x2-BH-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 180 | 90.0% | 20 | 10.0% | INCOMPLETE_GROUP 20 | 0 | 0.00% | 1.49% | 2.833 | 3.280 | -0.869 (not guaranteed) |
| 2x2-BH-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 75 | 37.5% | 125 | 62.5% | INCOMPLETE_GROUP 125 | 0 | 0.00% | 1.49% | 2.833 | 3.280 | -0.412 (not guaranteed) |
| 2x2-BH-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 39 | 19.5% | 161 | 80.5% | INCOMPLETE_GROUP 161 | 0 | 0.00% | 1.49% | 2.833 | 3.280 | -2.326 (not guaranteed) |
| 2x2-BH-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 1.711 |
| 2x2-BH-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 1.211 |
| 2x2-BH-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 81 | 40.5% | 119 | 59.5% | INCOMPLETE_GROUP 119 | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 0.711 |
| 2x2-BH-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 1.263 |
| 2x2-BH-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 144 | 72.0% | 56 | 28.0% | INCOMPLETE_GROUP 56 | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 0.815 |
| 2x2-BH-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 1.461 |
| 2x2-BH-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 1.211 |
| 2x2-BH-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 182 | 91.0% | 18 | 9.0% | INCOMPLETE_GROUP 18 | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 0.263 |
| 2x2-BH-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 78 | 39.0% | 122 | 61.0% | INCOMPLETE_GROUP 122 | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 0.711 |
| 2x2-BH-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 30 | 15.0% | 170 | 85.0% | INCOMPLETE_GROUP 170 | 0 | 0.00% | 1.49% | 3.956 | 3.969 | -1.185 (not guaranteed) |
| 2x2-BH-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 2.833 |
| 2x2-BH-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 2.333 |
| 2x2-BH-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 80 | 40.0% | 120 | 60.0% | INCOMPLETE_GROUP 120 | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 1.833 |
| 2x2-BH-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 2.395 |
| 2x2-BH-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 113 | 56.5% | 87 | 43.5% | INCOMPLETE_GROUP 87 | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 1.957 |
| 2x2-BH-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 2.583 |
| 2x2-BH-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 2.333 |
| 2x2-BH-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 181 | 90.5% | 19 | 9.5% | INCOMPLETE_GROUP 19 | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 1.395 |
| 2x2-BH-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 89 | 44.5% | 111 | 55.5% | INCOMPLETE_GROUP 111 | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 1.833 |
| 2x2-BH-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 23 | 11.5% | 177 | 88.5% | INCOMPLETE_GROUP 177 | 0 | 0.00% | 1.49% | 4.823 | 4.823 | -0.043 (not guaranteed) |
| 2x2-BH-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.419 | 3.662 | 0.174 |
| 2x2-BH-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -0.326 (not guaranteed) |
| 2x2-BH-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 74 | 37.0% | 126 | 63.0% | INCOMPLETE_GROUP 126 | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -0.826 (not guaranteed) |
| 2x2-BH-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -0.283 (not guaranteed) |
| 2x2-BH-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 150 | 75.0% | 50 | 25.0% | INCOMPLETE_GROUP 50 | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -0.741 (not guaranteed) |
| 2x2-BH-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -0.076 (not guaranteed) |
| 2x2-BH-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -0.326 (not guaranteed) |
| 2x2-BH-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 180 | 90.0% | 20 | 10.0% | INCOMPLETE_GROUP 20 | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -1.283 (not guaranteed) |
| 2x2-BH-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 79 | 39.5% | 121 | 60.5% | INCOMPLETE_GROUP 121 | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -0.826 (not guaranteed) |
| 2x2-BH-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 33 | 16.5% | 167 | 83.5% | INCOMPLETE_GROUP 167 | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -2.741 (not guaranteed) |
| 2x2-BH-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 1.296 |
| 2x2-BH-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 0.796 |
| 2x2-BH-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 84 | 42.0% | 116 | 58.0% | INCOMPLETE_GROUP 116 | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 0.296 |
| 2x2-BH-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 0.849 |
| 2x2-BH-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 146 | 73.0% | 54 | 27.0% | INCOMPLETE_GROUP 54 | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 0.401 |
| 2x2-BH-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 1.046 |
| 2x2-BH-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 0.796 |
| 2x2-BH-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 171 | 85.5% | 29 | 14.5% | INCOMPLETE_GROUP 29 | 0 | 0.00% | 1.49% | 3.542 | 4.101 | -0.151 (not guaranteed) |
| 2x2-BH-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 93 | 46.5% | 107 | 53.5% | INCOMPLETE_GROUP 107 | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 0.296 |
| 2x2-BH-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 29 | 14.5% | 171 | 85.5% | INCOMPLETE_GROUP 171 | 0 | 0.00% | 1.49% | 3.542 | 4.101 | -1.599 (not guaranteed) |
| 2x2-BH-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 2.419 |
| 2x2-BH-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 1.919 |
| 2x2-BH-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 88 | 44.0% | 112 | 56.0% | INCOMPLETE_GROUP 112 | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 1.419 |
| 2x2-BH-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 1.981 |
| 2x2-BH-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 109 | 54.5% | 91 | 45.5% | INCOMPLETE_GROUP 91 | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 1.543 |
| 2x2-BH-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 2.169 |
| 2x2-BH-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 1.919 |
| 2x2-BH-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 179 | 89.5% | 21 | 10.5% | INCOMPLETE_GROUP 21 | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 0.981 |
| 2x2-BH-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 72 | 36.0% | 128 | 64.0% | INCOMPLETE_GROUP 128 | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 1.419 |
| 2x2-BH-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 25 | 12.5% | 175 | 87.5% | INCOMPLETE_GROUP 175 | 0 | 0.00% | 1.49% | 4.664 | 4.768 | -0.457 (not guaranteed) |
| 2x2-BH-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-BH-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.740 (not guaranteed) |
| 2x2-BH-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 77 | 38.5% | 123 | 61.5% | INCOMPLETE_GROUP 123 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -1.240 (not guaranteed) |
| 2x2-BH-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.698 (not guaranteed) |
| 2x2-BH-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 138 | 69.0% | 62 | 31.0% | INCOMPLETE_GROUP 62 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -1.155 (not guaranteed) |
| 2x2-BH-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.490 (not guaranteed) |
| 2x2-BH-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.740 (not guaranteed) |
| 2x2-BH-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 177 | 88.5% | 23 | 11.5% | INCOMPLETE_GROUP 23 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -1.698 (not guaranteed) |
| 2x2-BH-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 83 | 41.5% | 117 | 58.5% | INCOMPLETE_GROUP 117 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -1.240 (not guaranteed) |
| 2x2-BH-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 31 | 15.5% | 169 | 84.5% | INCOMPLETE_GROUP 169 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -3.155 (not guaranteed) |
| 2x2-BH-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-BH-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.382 |
| 2x2-BH-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 93 | 46.5% | 107 | 53.5% | INCOMPLETE_GROUP 107 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | -0.118 (not guaranteed) |
| 2x2-BH-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.435 |
| 2x2-BH-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 152 | 76.0% | 48 | 24.0% | INCOMPLETE_GROUP 48 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | -0.013 (not guaranteed) |
| 2x2-BH-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.632 |
| 2x2-BH-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.382 |
| 2x2-BH-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 172 | 86.0% | 28 | 14.0% | INCOMPLETE_GROUP 28 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | -0.565 (not guaranteed) |
| 2x2-BH-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 84 | 42.0% | 116 | 58.0% | INCOMPLETE_GROUP 116 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | -0.118 (not guaranteed) |
| 2x2-BH-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 21 | 10.5% | 179 | 89.5% | INCOMPLETE_GROUP 179 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | -2.013 (not guaranteed) |
| 2x2-BH-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 2.005 |
| 2x2-BH-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 1.505 |
| 2x2-BH-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 81 | 40.5% | 119 | 59.5% | INCOMPLETE_GROUP 119 | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 1.005 |
| 2x2-BH-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 1.567 |
| 2x2-BH-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 107 | 53.5% | 93 | 46.5% | INCOMPLETE_GROUP 93 | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 1.129 |
| 2x2-BH-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 1.755 |
| 2x2-BH-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 1.505 |
| 2x2-BH-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 177 | 88.5% | 23 | 11.5% | INCOMPLETE_GROUP 23 | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 0.567 |
| 2x2-BH-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 88 | 44.0% | 112 | 56.0% | INCOMPLETE_GROUP 112 | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 1.005 |
| 2x2-BH-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 20 | 10.0% | 180 | 90.0% | INCOMPLETE_GROUP 180 | 0 | 0.00% | 1.49% | 4.250 | 4.921 | -0.871 (not guaranteed) |
| 2x2-BV-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-BV-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.087 |
| 2x2-BV-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 74 | 37.0% | 126 | 63.0% | INCOMPLETE_GROUP 126 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 0.588 |
| 2x2-BV-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.130 |
| 2x2-BV-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 147 | 73.5% | 53 | 26.5% | INCOMPLETE_GROUP 53 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 0.673 |
| 2x2-BV-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.337 |
| 2x2-BV-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.087 |
| 2x2-BV-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 170 | 85.0% | 30 | 15.0% | INCOMPLETE_GROUP 30 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 0.130 |
| 2x2-BV-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 74 | 37.0% | 126 | 63.0% | INCOMPLETE_GROUP 126 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 0.588 |
| 2x2-BV-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 31 | 15.5% | 169 | 84.5% | INCOMPLETE_GROUP 169 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | -1.327 (not guaranteed) |
| 2x2-BV-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.381 |
| 2x2-BV-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.881 |
| 2x2-BV-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 87 | 43.5% | 113 | 56.5% | INCOMPLETE_GROUP 113 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.381 |
| 2x2-BV-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.933 |
| 2x2-BV-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 142 | 71.0% | 58 | 29.0% | INCOMPLETE_GROUP 58 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.486 |
| 2x2-BV-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.131 |
| 2x2-BV-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.881 |
| 2x2-BV-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 175 | 87.5% | 25 | 12.5% | INCOMPLETE_GROUP 25 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 0.933 |
| 2x2-BV-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 75 | 37.5% | 125 | 62.5% | INCOMPLETE_GROUP 125 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.381 |
| 2x2-BV-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 39 | 19.5% | 161 | 80.5% | INCOMPLETE_GROUP 161 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | -0.514 (not guaranteed) |
| 2x2-BV-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 3.175 |
| 2x2-BV-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.675 |
| 2x2-BV-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 81 | 40.5% | 119 | 59.5% | INCOMPLETE_GROUP 119 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.175 |
| 2x2-BV-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.737 |
| 2x2-BV-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 115 | 57.5% | 85 | 42.5% | INCOMPLETE_GROUP 85 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.299 |
| 2x2-BV-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.925 |
| 2x2-BV-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.675 |
| 2x2-BV-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 183 | 91.5% | 17 | 8.5% | INCOMPLETE_GROUP 17 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.737 |
| 2x2-BV-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 98 | 49.0% | 102 | 51.0% | INCOMPLETE_GROUP 102 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.175 |
| 2x2-BV-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 33 | 16.5% | 167 | 83.5% | INCOMPLETE_GROUP 167 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 0.299 |
| 2x2-BV-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 1.417 |
| 2x2-BV-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 0.917 |
| 2x2-BV-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 83 | 41.5% | 117 | 58.5% | INCOMPLETE_GROUP 117 | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 0.417 |
| 2x2-BV-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 0.959 |
| 2x2-BV-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 148 | 74.0% | 52 | 26.0% | INCOMPLETE_GROUP 52 | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 0.502 |
| 2x2-BV-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 1.167 |
| 2x2-BV-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 0.917 |
| 2x2-BV-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 173 | 86.5% | 27 | 13.5% | INCOMPLETE_GROUP 27 | 0 | 0.00% | 1.49% | 3.385 | 3.385 | -0.041 (not guaranteed) |
| 2x2-BV-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 81 | 40.5% | 119 | 59.5% | INCOMPLETE_GROUP 119 | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 0.417 |
| 2x2-BV-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 31 | 15.5% | 169 | 84.5% | INCOMPLETE_GROUP 169 | 0 | 0.00% | 1.49% | 3.385 | 3.385 | -1.498 (not guaranteed) |
| 2x2-BV-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 2.381 |
| 2x2-BV-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 1.881 |
| 2x2-BV-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 89 | 44.5% | 111 | 55.5% | INCOMPLETE_GROUP 111 | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 1.381 |
| 2x2-BV-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 1.933 |
| 2x2-BV-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 148 | 74.0% | 52 | 26.0% | INCOMPLETE_GROUP 52 | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 1.486 |
| 2x2-BV-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 2.131 |
| 2x2-BV-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 1.881 |
| 2x2-BV-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 178 | 89.0% | 22 | 11.0% | INCOMPLETE_GROUP 22 | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 0.933 |
| 2x2-BV-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 89 | 44.5% | 111 | 55.5% | INCOMPLETE_GROUP 111 | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 1.381 |
| 2x2-BV-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 30 | 15.0% | 170 | 85.0% | INCOMPLETE_GROUP 170 | 0 | 0.00% | 1.49% | 4.430 | 4.430 | -0.514 (not guaranteed) |
| 2x2-BV-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 3.175 |
| 2x2-BV-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 2.675 |
| 2x2-BV-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 83 | 41.5% | 117 | 58.5% | INCOMPLETE_GROUP 117 | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 2.175 |
| 2x2-BV-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 2.737 |
| 2x2-BV-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 113 | 56.5% | 87 | 43.5% | INCOMPLETE_GROUP 87 | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 2.299 |
| 2x2-BV-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 2.925 |
| 2x2-BV-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 2.675 |
| 2x2-BV-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 180 | 90.0% | 20 | 10.0% | INCOMPLETE_GROUP 20 | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 1.737 |
| 2x2-BV-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 85 | 42.5% | 115 | 57.5% | INCOMPLETE_GROUP 115 | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 2.175 |
| 2x2-BV-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 27 | 13.5% | 173 | 86.5% | INCOMPLETE_GROUP 173 | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 0.299 |
| 2x2-BV-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 1.002 |
| 2x2-BV-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 0.502 |
| 2x2-BV-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 83 | 41.5% | 117 | 58.5% | INCOMPLETE_GROUP 117 | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 0.002 |
| 2x2-BV-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 0.545 |
| 2x2-BV-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 143 | 71.5% | 57 | 28.5% | INCOMPLETE_GROUP 57 | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 0.088 |
| 2x2-BV-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 0.752 |
| 2x2-BV-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 0.502 |
| 2x2-BV-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 171 | 85.5% | 29 | 14.5% | INCOMPLETE_GROUP 29 | 0 | 0.00% | 1.49% | 3.180 | 3.180 | -0.455 (not guaranteed) |
| 2x2-BV-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 82 | 41.0% | 118 | 59.0% | INCOMPLETE_GROUP 118 | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 0.002 |
| 2x2-BV-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 40 | 20.0% | 160 | 80.0% | INCOMPLETE_GROUP 160 | 0 | 0.00% | 1.49% | 3.180 | 3.180 | -1.912 (not guaranteed) |
| 2x2-BV-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 2.125 |
| 2x2-BV-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 1.625 |
| 2x2-BV-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 77 | 38.5% | 123 | 61.5% | INCOMPLETE_GROUP 123 | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 1.125 |
| 2x2-BV-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 1.677 |
| 2x2-BV-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 152 | 76.0% | 48 | 24.0% | INCOMPLETE_GROUP 48 | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 1.230 |
| 2x2-BV-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 1.875 |
| 2x2-BV-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 1.625 |
| 2x2-BV-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 183 | 91.5% | 17 | 8.5% | INCOMPLETE_GROUP 17 | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 0.677 |
| 2x2-BV-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 86 | 43.0% | 114 | 57.0% | INCOMPLETE_GROUP 114 | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 1.125 |
| 2x2-BV-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 32 | 16.0% | 168 | 84.0% | INCOMPLETE_GROUP 168 | 0 | 0.00% | 1.49% | 4.085 | 4.085 | -0.770 (not guaranteed) |
| 2x2-BV-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 3.175 |
| 2x2-BV-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 2.675 |
| 2x2-BV-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 81 | 40.5% | 119 | 59.5% | INCOMPLETE_GROUP 119 | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 2.175 |
| 2x2-BV-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 2.737 |
| 2x2-BV-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 118 | 59.0% | 82 | 41.0% | INCOMPLETE_GROUP 82 | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 2.299 |
| 2x2-BV-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 2.925 |
| 2x2-BV-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 2.675 |
| 2x2-BV-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 180 | 90.0% | 20 | 10.0% | INCOMPLETE_GROUP 20 | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 1.737 |
| 2x2-BV-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 82 | 41.0% | 118 | 59.0% | INCOMPLETE_GROUP 118 | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 2.175 |
| 2x2-BV-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 31 | 15.5% | 169 | 84.5% | INCOMPLETE_GROUP 169 | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 0.299 |
| 2x2-BV-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-BV-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.430 |
| 2x2-BV-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 70 | 35.0% | 130 | 65.0% | INCOMPLETE_GROUP 130 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | -0.070 (not guaranteed) |
| 2x2-BV-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.473 |
| 2x2-BV-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 141 | 70.5% | 59 | 29.5% | INCOMPLETE_GROUP 59 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.015 |
| 2x2-BV-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.680 |
| 2x2-BV-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.430 |
| 2x2-BV-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 177 | 88.5% | 23 | 11.5% | INCOMPLETE_GROUP 23 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | -0.527 (not guaranteed) |
| 2x2-BV-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 75 | 37.5% | 125 | 62.5% | INCOMPLETE_GROUP 125 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | -0.070 (not guaranteed) |
| 2x2-BV-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 33 | 16.5% | 167 | 83.5% | INCOMPLETE_GROUP 167 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | -1.985 (not guaranteed) |
| 2x2-BV-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-BV-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 1.552 |
| 2x2-BV-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 77 | 38.5% | 123 | 61.5% | INCOMPLETE_GROUP 123 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 1.052 |
| 2x2-BV-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 1.605 |
| 2x2-BV-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 142 | 71.0% | 58 | 29.0% | INCOMPLETE_GROUP 58 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 1.157 |
| 2x2-BV-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 1.802 |
| 2x2-BV-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 1.552 |
| 2x2-BV-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 176 | 88.0% | 24 | 12.0% | INCOMPLETE_GROUP 24 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 0.605 |
| 2x2-BV-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 79 | 39.5% | 121 | 60.5% | INCOMPLETE_GROUP 121 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 1.052 |
| 2x2-BV-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 32 | 16.0% | 168 | 84.0% | INCOMPLETE_GROUP 168 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | -0.843 (not guaranteed) |
| 2x2-BV-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-BV-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 2.675 |
| 2x2-BV-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 82 | 41.0% | 118 | 59.0% | INCOMPLETE_GROUP 118 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 2.175 |
| 2x2-BV-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 2.737 |
| 2x2-BV-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 106 | 53.0% | 94 | 47.0% | INCOMPLETE_GROUP 94 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 2.299 |
| 2x2-BV-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 2.925 |
| 2x2-BV-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 2.675 |
| 2x2-BV-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 174 | 87.0% | 26 | 13.0% | INCOMPLETE_GROUP 26 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 1.737 |
| 2x2-BV-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 94 | 47.0% | 106 | 53.0% | INCOMPLETE_GROUP 106 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 2.175 |
| 2x2-BV-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 35 | 17.5% | 165 | 82.5% | INCOMPLETE_GROUP 165 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 0.299 |
| 2x2-BV-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.999 | 3.203 | 0.754 |
| 2x2-BV-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.999 | 3.203 | 0.254 |
| 2x2-BV-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 75 | 37.5% | 125 | 62.5% | INCOMPLETE_GROUP 125 | 0 | 0.00% | 1.49% | 2.999 | 3.203 | -0.246 (not guaranteed) |
| 2x2-BV-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.999 | 3.203 | 0.296 |
| 2x2-BV-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 159 | 79.5% | 41 | 20.5% | INCOMPLETE_GROUP 41 | 0 | 0.00% | 1.49% | 2.999 | 3.203 | -0.161 (not guaranteed) |
| 2x2-BV-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.999 | 3.203 | 0.504 |
| 2x2-BV-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.999 | 3.203 | 0.254 |
| 2x2-BV-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 177 | 88.5% | 23 | 11.5% | INCOMPLETE_GROUP 23 | 0 | 0.00% | 1.49% | 2.999 | 3.203 | -0.704 (not guaranteed) |
| 2x2-BV-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 90 | 45.0% | 110 | 55.0% | INCOMPLETE_GROUP 110 | 0 | 0.00% | 1.49% | 2.999 | 3.203 | -0.246 (not guaranteed) |
| 2x2-BV-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 31 | 15.5% | 169 | 84.5% | INCOMPLETE_GROUP 169 | 0 | 0.00% | 1.49% | 2.999 | 3.203 | -2.161 (not guaranteed) |
| 2x2-BV-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 1.876 |
| 2x2-BV-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 1.376 |
| 2x2-BV-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 85 | 42.5% | 115 | 57.5% | INCOMPLETE_GROUP 115 | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 0.876 |
| 2x2-BV-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 1.429 |
| 2x2-BV-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 138 | 69.0% | 62 | 31.0% | INCOMPLETE_GROUP 62 | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 0.981 |
| 2x2-BV-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 1.626 |
| 2x2-BV-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 1.376 |
| 2x2-BV-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 173 | 86.5% | 27 | 13.5% | INCOMPLETE_GROUP 27 | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 0.429 |
| 2x2-BV-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 79 | 39.5% | 121 | 60.5% | INCOMPLETE_GROUP 121 | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 0.876 |
| 2x2-BV-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 19 | 9.5% | 181 | 90.5% | INCOMPLETE_GROUP 181 | 0 | 0.00% | 1.49% | 3.986 | 3.986 | -1.019 (not guaranteed) |
| 2x2-BV-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 2.999 |
| 2x2-BV-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 2.499 |
| 2x2-BV-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 83 | 41.5% | 117 | 58.5% | INCOMPLETE_GROUP 117 | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 1.999 |
| 2x2-BV-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 2.561 |
| 2x2-BV-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 110 | 55.0% | 90 | 45.0% | INCOMPLETE_GROUP 90 | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 2.123 |
| 2x2-BV-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 2.749 |
| 2x2-BV-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 2.499 |
| 2x2-BV-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 176 | 88.0% | 24 | 12.0% | INCOMPLETE_GROUP 24 | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 1.561 |
| 2x2-BV-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 68 | 34.0% | 132 | 66.0% | INCOMPLETE_GROUP 132 | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 1.999 |
| 2x2-BV-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 32 | 16.0% | 168 | 84.0% | INCOMPLETE_GROUP 168 | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 0.123 |
| 2x2-BV-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.833 | 3.280 | 0.588 |
| 2x2-BV-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.833 | 3.280 | 0.088 |
| 2x2-BV-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 73 | 36.5% | 127 | 63.5% | INCOMPLETE_GROUP 127 | 0 | 0.00% | 1.49% | 2.833 | 3.280 | -0.412 (not guaranteed) |
| 2x2-BV-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.833 | 3.280 | 0.131 |
| 2x2-BV-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 151 | 75.5% | 49 | 24.5% | INCOMPLETE_GROUP 49 | 0 | 0.00% | 1.49% | 2.833 | 3.280 | -0.327 (not guaranteed) |
| 2x2-BV-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.833 | 3.280 | 0.338 |
| 2x2-BV-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.833 | 3.280 | 0.088 |
| 2x2-BV-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 169 | 84.5% | 31 | 15.5% | INCOMPLETE_GROUP 31 | 0 | 0.00% | 1.49% | 2.833 | 3.280 | -0.869 (not guaranteed) |
| 2x2-BV-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 78 | 39.0% | 122 | 61.0% | INCOMPLETE_GROUP 122 | 0 | 0.00% | 1.49% | 2.833 | 3.280 | -0.412 (not guaranteed) |
| 2x2-BV-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 31 | 15.5% | 169 | 84.5% | INCOMPLETE_GROUP 169 | 0 | 0.00% | 1.49% | 2.833 | 3.280 | -2.326 (not guaranteed) |
| 2x2-BV-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 1.711 |
| 2x2-BV-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 1.211 |
| 2x2-BV-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 72 | 36.0% | 128 | 64.0% | INCOMPLETE_GROUP 128 | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 0.711 |
| 2x2-BV-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 1.263 |
| 2x2-BV-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 144 | 72.0% | 56 | 28.0% | INCOMPLETE_GROUP 56 | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 0.815 |
| 2x2-BV-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 1.461 |
| 2x2-BV-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 1.211 |
| 2x2-BV-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 181 | 90.5% | 19 | 9.5% | INCOMPLETE_GROUP 19 | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 0.263 |
| 2x2-BV-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 78 | 39.0% | 122 | 61.0% | INCOMPLETE_GROUP 122 | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 0.711 |
| 2x2-BV-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 29 | 14.5% | 171 | 85.5% | INCOMPLETE_GROUP 171 | 0 | 0.00% | 1.49% | 3.956 | 3.969 | -1.185 (not guaranteed) |
| 2x2-BV-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 2.833 |
| 2x2-BV-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 2.333 |
| 2x2-BV-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 91 | 45.5% | 109 | 54.5% | INCOMPLETE_GROUP 109 | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 1.833 |
| 2x2-BV-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 2.395 |
| 2x2-BV-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 123 | 61.5% | 77 | 38.5% | INCOMPLETE_GROUP 77 | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 1.957 |
| 2x2-BV-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 2.583 |
| 2x2-BV-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 2.333 |
| 2x2-BV-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 184 | 92.0% | 16 | 8.0% | INCOMPLETE_GROUP 16 | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 1.395 |
| 2x2-BV-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 72 | 36.0% | 128 | 64.0% | INCOMPLETE_GROUP 128 | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 1.833 |
| 2x2-BV-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 28 | 14.0% | 172 | 86.0% | INCOMPLETE_GROUP 172 | 0 | 0.00% | 1.49% | 4.823 | 4.823 | -0.043 (not guaranteed) |
| 2x2-BV-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.419 | 3.662 | 0.174 |
| 2x2-BV-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -0.326 (not guaranteed) |
| 2x2-BV-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 77 | 38.5% | 123 | 61.5% | INCOMPLETE_GROUP 123 | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -0.826 (not guaranteed) |
| 2x2-BV-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -0.283 (not guaranteed) |
| 2x2-BV-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 145 | 72.5% | 55 | 27.5% | INCOMPLETE_GROUP 55 | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -0.741 (not guaranteed) |
| 2x2-BV-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -0.076 (not guaranteed) |
| 2x2-BV-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -0.326 (not guaranteed) |
| 2x2-BV-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 184 | 92.0% | 16 | 8.0% | INCOMPLETE_GROUP 16 | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -1.283 (not guaranteed) |
| 2x2-BV-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 88 | 44.0% | 112 | 56.0% | INCOMPLETE_GROUP 112 | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -0.826 (not guaranteed) |
| 2x2-BV-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 26 | 13.0% | 174 | 87.0% | INCOMPLETE_GROUP 174 | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -2.741 (not guaranteed) |
| 2x2-BV-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 1.296 |
| 2x2-BV-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 0.796 |
| 2x2-BV-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 80 | 40.0% | 120 | 60.0% | INCOMPLETE_GROUP 120 | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 0.296 |
| 2x2-BV-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 0.849 |
| 2x2-BV-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 146 | 73.0% | 54 | 27.0% | INCOMPLETE_GROUP 54 | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 0.401 |
| 2x2-BV-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 1.046 |
| 2x2-BV-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 0.796 |
| 2x2-BV-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 178 | 89.0% | 22 | 11.0% | INCOMPLETE_GROUP 22 | 0 | 0.00% | 1.49% | 3.542 | 4.101 | -0.151 (not guaranteed) |
| 2x2-BV-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 74 | 37.0% | 126 | 63.0% | INCOMPLETE_GROUP 126 | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 0.296 |
| 2x2-BV-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 29 | 14.5% | 171 | 85.5% | INCOMPLETE_GROUP 171 | 0 | 0.00% | 1.49% | 3.542 | 4.101 | -1.599 (not guaranteed) |
| 2x2-BV-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 2.419 |
| 2x2-BV-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 1.919 |
| 2x2-BV-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 96 | 48.0% | 104 | 52.0% | INCOMPLETE_GROUP 104 | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 1.419 |
| 2x2-BV-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 1.981 |
| 2x2-BV-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 127 | 63.5% | 73 | 36.5% | INCOMPLETE_GROUP 73 | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 1.543 |
| 2x2-BV-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 2.169 |
| 2x2-BV-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 1.919 |
| 2x2-BV-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 169 | 84.5% | 31 | 15.5% | INCOMPLETE_GROUP 31 | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 0.981 |
| 2x2-BV-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 97 | 48.5% | 103 | 51.5% | INCOMPLETE_GROUP 103 | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 1.419 |
| 2x2-BV-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 35 | 17.5% | 165 | 82.5% | INCOMPLETE_GROUP 165 | 0 | 0.00% | 1.49% | 4.664 | 4.768 | -0.457 (not guaranteed) |
| 2x2-BV-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-BV-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.740 (not guaranteed) |
| 2x2-BV-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 83 | 41.5% | 117 | 58.5% | INCOMPLETE_GROUP 117 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -1.240 (not guaranteed) |
| 2x2-BV-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.698 (not guaranteed) |
| 2x2-BV-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 148 | 74.0% | 52 | 26.0% | INCOMPLETE_GROUP 52 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -1.155 (not guaranteed) |
| 2x2-BV-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.490 (not guaranteed) |
| 2x2-BV-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.740 (not guaranteed) |
| 2x2-BV-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 175 | 87.5% | 25 | 12.5% | INCOMPLETE_GROUP 25 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -1.698 (not guaranteed) |
| 2x2-BV-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 83 | 41.5% | 117 | 58.5% | INCOMPLETE_GROUP 117 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -1.240 (not guaranteed) |
| 2x2-BV-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 33 | 16.5% | 167 | 83.5% | INCOMPLETE_GROUP 167 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -3.155 (not guaranteed) |
| 2x2-BV-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-BV-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.382 |
| 2x2-BV-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 90 | 45.0% | 110 | 55.0% | INCOMPLETE_GROUP 110 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | -0.118 (not guaranteed) |
| 2x2-BV-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.435 |
| 2x2-BV-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 155 | 77.5% | 45 | 22.5% | INCOMPLETE_GROUP 45 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | -0.013 (not guaranteed) |
| 2x2-BV-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.632 |
| 2x2-BV-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.382 |
| 2x2-BV-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 177 | 88.5% | 23 | 11.5% | INCOMPLETE_GROUP 23 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | -0.565 (not guaranteed) |
| 2x2-BV-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 78 | 39.0% | 122 | 61.0% | INCOMPLETE_GROUP 122 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | -0.118 (not guaranteed) |
| 2x2-BV-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 35 | 17.5% | 165 | 82.5% | INCOMPLETE_GROUP 165 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | -2.013 (not guaranteed) |
| 2x2-BV-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 2.005 |
| 2x2-BV-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 1.505 |
| 2x2-BV-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 92 | 46.0% | 108 | 54.0% | INCOMPLETE_GROUP 108 | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 1.005 |
| 2x2-BV-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0.5-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 1.567 |
| 2x2-BV-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr1-co0-mat | 3 | 200 | 114 | 57.0% | 86 | 43.0% | INCOMPLETE_GROUP 86 | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 1.129 |
| 2x2-BV-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.25-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 1.755 |
| 2x2-BV-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0-co0-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 1.505 |
| 2x2-BV-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0.5-rr0.5-co0.5-mat | 3 | 200 | 173 | 86.5% | 27 | 13.5% | INCOMPLETE_GROUP 27 | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 0.567 |
| 2x2-BV-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr0-co0-mat | 3 | 200 | 80 | 40.0% | 120 | 60.0% | INCOMPLETE_GROUP 120 | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 1.005 |
| 2x2-BV-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs1-rr1-co1-mat | 3 | 200 | 28 | 14.0% | 172 | 86.0% | INCOMPLETE_GROUP 172 | 0 | 0.00% | 1.49% | 4.250 | 4.921 | -0.871 (not guaranteed) |
| 2x2-F-r0-i1-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.087 |
| 2x2-F-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 95 | 47.5% | 105 | 52.5% | INCOMPLETE_GROUP 105 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 0.588 |
| 2x2-F-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0.2-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0.4-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0.6-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0.5-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl1-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl1.5-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INVALID_MARKER 200 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl2-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INVALID_MARKER 200 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro0-gp0-cm0-tl10-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro0-gp0-cm0-tl20-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro0-gp0-cm0-tl30-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 107 | 53.5% | 93 | 46.5% | INCOMPLETE_GROUP 93 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro0-gp0-cm0-tl40-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro0-gp0-cm45-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro0-gp0-cmR-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 198 | 99.0% | 2 | 1.0% | INCOMPLETE_GROUP 2 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro0-gp0.5-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro0-gp1-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro1-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro2-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 148 | 74.0% | 52 | 26.0% | INCOMPLETE_GROUP 52 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0-ro3-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 66 | 33.0% | 134 | 67.0% | INCOMPLETE_GROUP 134 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0.5-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 190 | 95.0% | 10 | 5.0% | INCOMPLETE_GROUP 10 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh1-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 172 | 86.0% | 28 | 14.0% | INCOMPLETE_GROUP 28 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1-tb64-sh1.5-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2-F-r0-i1.5-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.381 |
| 2x2-F-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.381 |
| 2x2-F-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.881 |
| 2x2-F-r0-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 85 | 42.5% | 115 | 57.5% | INCOMPLETE_GROUP 115 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.381 |
| 2x2-F-r0-i1.5-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 191 | 95.5% | 9 | 4.5% | INCOMPLETE_GROUP 9 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.381 |
| 2x2-F-r0-i1.5-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 165 | 82.5% | 35 | 17.5% | INCOMPLETE_GROUP 35 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.381 |
| 2x2-F-r0-i2-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 3.175 |
| 2x2-F-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 3.175 |
| 2x2-F-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.675 |
| 2x2-F-r0-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 94 | 47.0% | 106 | 53.0% | INCOMPLETE_GROUP 106 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 2.175 |
| 2x2-F-r0-i2-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 196 | 98.0% | 4 | 2.0% | INCOMPLETE_GROUP 4 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 3.175 |
| 2x2-F-r0-i2-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 154 | 77.0% | 46 | 23.0% | INCOMPLETE_GROUP 46 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 3.175 |
| 2x2-F-r2-i1-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 1.417 |
| 2x2-F-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 1.417 |
| 2x2-F-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 0.917 |
| 2x2-F-r2-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 78 | 39.0% | 122 | 61.0% | INCOMPLETE_GROUP 122 | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 0.417 |
| 2x2-F-r2-i1-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 195 | 97.5% | 5 | 2.5% | INCOMPLETE_GROUP 5 | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 1.417 |
| 2x2-F-r2-i1-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 175 | 87.5% | 25 | 12.5% | INCOMPLETE_GROUP 25 | 0 | 0.00% | 1.49% | 3.385 | 3.385 | 1.417 |
| 2x2-F-r2-i1.5-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 2.381 |
| 2x2-F-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 2.381 |
| 2x2-F-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 1.881 |
| 2x2-F-r2-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 83 | 41.5% | 117 | 58.5% | INCOMPLETE_GROUP 117 | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 1.381 |
| 2x2-F-r2-i1.5-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 193 | 96.5% | 7 | 3.5% | INCOMPLETE_GROUP 7 | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 2.381 |
| 2x2-F-r2-i1.5-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 159 | 79.5% | 41 | 20.5% | INCOMPLETE_GROUP 41 | 0 | 0.00% | 1.49% | 4.430 | 4.430 | 2.381 |
| 2x2-F-r2-i2-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 3.175 |
| 2x2-F-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 3.175 |
| 2x2-F-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 2.675 |
| 2x2-F-r2-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 92 | 46.0% | 108 | 54.0% | INCOMPLETE_GROUP 108 | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 2.175 |
| 2x2-F-r2-i2-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 194 | 97.0% | 6 | 3.0% | INCOMPLETE_GROUP 6 | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 3.175 |
| 2x2-F-r2-i2-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 150 | 75.0% | 50 | 25.0% | INCOMPLETE_GROUP 50 | 0 | 0.00% | 1.49% | 5.506 | 5.506 | 3.175 |
| 2x2-F-r3-i1-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 1.002 |
| 2x2-F-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 1.002 |
| 2x2-F-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 0.502 |
| 2x2-F-r3-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 84 | 42.0% | 116 | 58.0% | INCOMPLETE_GROUP 116 | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 0.002 |
| 2x2-F-r3-i1-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 192 | 96.0% | 8 | 4.0% | INCOMPLETE_GROUP 8 | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 1.002 |
| 2x2-F-r3-i1-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 171 | 85.5% | 29 | 14.5% | INCOMPLETE_GROUP 29 | 0 | 0.00% | 1.49% | 3.180 | 3.180 | 1.002 |
| 2x2-F-r3-i1.5-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 2.125 |
| 2x2-F-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 2.125 |
| 2x2-F-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 1.625 |
| 2x2-F-r3-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 70 | 35.0% | 130 | 65.0% | INCOMPLETE_GROUP 130 | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 1.125 |
| 2x2-F-r3-i1.5-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 190 | 95.0% | 10 | 5.0% | INCOMPLETE_GROUP 10 | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 2.125 |
| 2x2-F-r3-i1.5-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 154 | 77.0% | 46 | 23.0% | INCOMPLETE_GROUP 46 | 0 | 0.00% | 1.49% | 4.085 | 4.085 | 2.125 |
| 2x2-F-r3-i2-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 3.175 |
| 2x2-F-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 3.175 |
| 2x2-F-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 2.675 |
| 2x2-F-r3-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 86 | 43.0% | 114 | 57.0% | INCOMPLETE_GROUP 114 | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 2.175 |
| 2x2-F-r3-i2-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 191 | 95.5% | 9 | 4.5% | INCOMPLETE_GROUP 9 | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 3.175 |
| 2x2-F-r3-i2-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 150 | 75.0% | 50 | 25.0% | INCOMPLETE_GROUP 50 | 0 | 0.00% | 1.49% | 5.078 | 5.078 | 3.175 |
| 2x2-F-r3.175-i1-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 1000 | 1000 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 0.30% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 1000 | 1000 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 0.30% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.430 |
| 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 84 | 42.0% | 116 | 58.0% | INCOMPLETE_GROUP 116 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | -0.070 (not guaranteed) |
| 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0.2-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0.4-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0.6-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0.5-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl1-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl1.5-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INVALID_MARKER 200 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl2-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INVALID_MARKER 200 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl10-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl20-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl30-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 100 | 50.0% | 100 | 50.0% | INCOMPLETE_GROUP 100 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl40-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm45-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cmR-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro0-gp0.5-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro0-gp1-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro1-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 199 | 99.5% | 1 | 0.5% | INCOMPLETE_GROUP 1 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro2-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 158 | 79.0% | 42 | 21.0% | INCOMPLETE_GROUP 42 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0-ro3-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 65 | 32.5% | 135 | 67.5% | INCOMPLETE_GROUP 135 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0.5-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 1000 | 967 | 96.7% | 33 | 3.3% | INCOMPLETE_GROUP 33 | 0 | 0.00% | 0.30% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh1-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 1000 | 814 | 81.4% | 186 | 18.6% | INCOMPLETE_GROUP 186 | 0 | 0.00% | 0.30% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1-tb64-sh1.5-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 199 | 99.5% | 1 | 0.5% | INCOMPLETE_GROUP 1 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2-F-r3.175-i1.5-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-dfl | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 1.552 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 95 | 47.5% | 105 | 52.5% | INCOMPLETE_GROUP 105 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 1.052 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0.2-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0.4-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0.6-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0.5-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl1-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl1.5-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INVALID_MARKER 200 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl2-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INVALID_MARKER 200 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl10-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl20-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl30-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 16 | 8.0% | 184 | 92.0% | INCOMPLETE_GROUP 184 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl40-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm45-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cmR-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 197 | 98.5% | 3 | 1.5% | INCOMPLETE_GROUP 3 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp0.5-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro0-gp1-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro1-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro2-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 166 | 83.0% | 34 | 17.0% | INCOMPLETE_GROUP 34 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0-ro3-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 69 | 34.5% | 131 | 65.5% | INCOMPLETE_GROUP 131 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0.5-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 194 | 97.0% | 6 | 3.0% | INCOMPLETE_GROUP 6 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh1-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 170 | 85.0% | 30 | 15.0% | INCOMPLETE_GROUP 30 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i1.5-tb64-sh1.5-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 198 | 99.0% | 2 | 1.0% | INCOMPLETE_GROUP 2 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2-F-r3.175-i2-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-dfl | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 2.675 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 74 | 37.0% | 126 | 63.0% | INCOMPLETE_GROUP 126 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 2.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0.2-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0.4-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0.6-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0.5-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl1-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl1.5-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INVALID_MARKER 200 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl2-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INVALID_MARKER 200 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl10-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl20-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl30-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 1 | 0.5% | 199 | 99.5% | INCOMPLETE_GROUP 199 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl40-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm45-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cmR-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 195 | 97.5% | 5 | 2.5% | INCOMPLETE_GROUP 5 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0.5-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro0-gp1-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro1-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro2-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 162 | 81.0% | 38 | 19.0% | INCOMPLETE_GROUP 38 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0-ro3-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 79 | 39.5% | 121 | 60.5% | INCOMPLETE_GROUP 121 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0.5-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 191 | 95.5% | 9 | 4.5% | INCOMPLETE_GROUP 9 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh1-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 154 | 77.0% | 46 | 23.0% | INCOMPLETE_GROUP 46 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.175-i2-tb64-sh1.5-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 199 | 99.5% | 1 | 0.5% | INCOMPLETE_GROUP 1 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2-F-r3.6-i1-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.999 | 3.203 | 0.754 |
| 2x2-F-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.999 | 3.203 | 0.754 |
| 2x2-F-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.999 | 3.203 | 0.254 |
| 2x2-F-r3.6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 95 | 47.5% | 105 | 52.5% | INCOMPLETE_GROUP 105 | 0 | 0.00% | 1.49% | 2.999 | 3.203 | -0.246 (not guaranteed) |
| 2x2-F-r3.6-i1-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 194 | 97.0% | 6 | 3.0% | INCOMPLETE_GROUP 6 | 0 | 0.00% | 1.49% | 2.999 | 3.203 | 0.754 |
| 2x2-F-r3.6-i1-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 170 | 85.0% | 30 | 15.0% | INCOMPLETE_GROUP 30 | 0 | 0.00% | 1.49% | 2.999 | 3.203 | 0.754 |
| 2x2-F-r3.6-i1.5-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 1.876 |
| 2x2-F-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 1.876 |
| 2x2-F-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 1.376 |
| 2x2-F-r3.6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 81 | 40.5% | 119 | 59.5% | INCOMPLETE_GROUP 119 | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 0.876 |
| 2x2-F-r3.6-i1.5-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 187 | 93.5% | 13 | 6.5% | INCOMPLETE_GROUP 13 | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 1.876 |
| 2x2-F-r3.6-i1.5-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 164 | 82.0% | 36 | 18.0% | INCOMPLETE_GROUP 36 | 0 | 0.00% | 1.49% | 3.986 | 3.986 | 1.876 |
| 2x2-F-r3.6-i2-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 2.999 |
| 2x2-F-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 2.999 |
| 2x2-F-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 2.499 |
| 2x2-F-r3.6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 88 | 44.0% | 112 | 56.0% | INCOMPLETE_GROUP 112 | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 1.999 |
| 2x2-F-r3.6-i2-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 192 | 96.0% | 8 | 4.0% | INCOMPLETE_GROUP 8 | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 2.999 |
| 2x2-F-r3.6-i2-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 154 | 77.0% | 46 | 23.0% | INCOMPLETE_GROUP 46 | 0 | 0.00% | 1.49% | 4.902 | 4.902 | 2.999 |
| 2x2-F-r4-i1-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.833 | 3.280 | 0.588 |
| 2x2-F-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.833 | 3.280 | 0.588 |
| 2x2-F-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.833 | 3.280 | 0.088 |
| 2x2-F-r4-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 76 | 38.0% | 124 | 62.0% | INCOMPLETE_GROUP 124 | 0 | 0.00% | 1.49% | 2.833 | 3.280 | -0.412 (not guaranteed) |
| 2x2-F-r4-i1-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 189 | 94.5% | 11 | 5.5% | INCOMPLETE_GROUP 11 | 0 | 0.00% | 1.49% | 2.833 | 3.280 | 0.588 |
| 2x2-F-r4-i1-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 171 | 85.5% | 29 | 14.5% | INCOMPLETE_GROUP 29 | 0 | 0.00% | 1.49% | 2.833 | 3.280 | 0.588 |
| 2x2-F-r4-i1.5-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 1.711 |
| 2x2-F-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 1.711 |
| 2x2-F-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 1.211 |
| 2x2-F-r4-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 84 | 42.0% | 116 | 58.0% | INCOMPLETE_GROUP 116 | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 0.711 |
| 2x2-F-r4-i1.5-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 191 | 95.5% | 9 | 4.5% | INCOMPLETE_GROUP 9 | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 1.711 |
| 2x2-F-r4-i1.5-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 166 | 83.0% | 34 | 17.0% | INCOMPLETE_GROUP 34 | 0 | 0.00% | 1.49% | 3.956 | 3.969 | 1.711 |
| 2x2-F-r4-i2-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 2.833 |
| 2x2-F-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 2.833 |
| 2x2-F-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 2.333 |
| 2x2-F-r4-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 93 | 46.5% | 107 | 53.5% | INCOMPLETE_GROUP 107 | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 1.833 |
| 2x2-F-r4-i2-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 196 | 98.0% | 4 | 2.0% | INCOMPLETE_GROUP 4 | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 2.833 |
| 2x2-F-r4-i2-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 165 | 82.5% | 35 | 17.5% | INCOMPLETE_GROUP 35 | 0 | 0.00% | 1.49% | 4.823 | 4.823 | 2.833 |
| 2x2-F-r5-i1-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.419 | 3.662 | 0.174 |
| 2x2-F-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.419 | 3.662 | 0.174 |
| 2x2-F-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -0.326 (not guaranteed) |
| 2x2-F-r5-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 73 | 36.5% | 127 | 63.5% | INCOMPLETE_GROUP 127 | 0 | 0.00% | 1.49% | 2.419 | 3.662 | -0.826 (not guaranteed) |
| 2x2-F-r5-i1-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 192 | 96.0% | 8 | 4.0% | INCOMPLETE_GROUP 8 | 0 | 0.00% | 1.49% | 2.419 | 3.662 | 0.174 |
| 2x2-F-r5-i1-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 164 | 82.0% | 36 | 18.0% | INCOMPLETE_GROUP 36 | 0 | 0.00% | 1.49% | 2.419 | 3.662 | 0.174 |
| 2x2-F-r5-i1.5-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 1.296 |
| 2x2-F-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 1.296 |
| 2x2-F-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 0.796 |
| 2x2-F-r5-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 82 | 41.0% | 118 | 59.0% | INCOMPLETE_GROUP 118 | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 0.296 |
| 2x2-F-r5-i1.5-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 196 | 98.0% | 4 | 2.0% | INCOMPLETE_GROUP 4 | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 1.296 |
| 2x2-F-r5-i1.5-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 158 | 79.0% | 42 | 21.0% | INCOMPLETE_GROUP 42 | 0 | 0.00% | 1.49% | 3.542 | 4.101 | 1.296 |
| 2x2-F-r5-i2-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 2.419 |
| 2x2-F-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 2.419 |
| 2x2-F-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 1.919 |
| 2x2-F-r5-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 81 | 40.5% | 119 | 59.5% | INCOMPLETE_GROUP 119 | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 1.419 |
| 2x2-F-r5-i2-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 193 | 96.5% | 7 | 3.5% | INCOMPLETE_GROUP 7 | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 2.419 |
| 2x2-F-r5-i2-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 154 | 77.0% | 46 | 23.0% | INCOMPLETE_GROUP 46 | 0 | 0.00% | 1.49% | 4.664 | 4.768 | 2.419 |
| 2x2-F-r6-i1-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.740 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 85 | 42.5% | 115 | 57.5% | INCOMPLETE_GROUP 115 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -1.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0.2-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0.4-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0.6-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0.5-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl1-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl1.5-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INVALID_MARKER 200 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl2-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INVALID_MARKER 200 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro0-gp0-cm0-tl10-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro0-gp0-cm0-tl20-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro0-gp0-cm0-tl30-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 118 | 59.0% | 82 | 41.0% | INCOMPLETE_GROUP 82 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro0-gp0-cm0-tl40-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro0-gp0-cm45-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro0-gp0-cmR-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro0-gp0.5-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro0-gp1-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro1-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro2-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 152 | 76.0% | 48 | 24.0% | INCOMPLETE_GROUP 48 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0-ro3-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 64 | 32.0% | 136 | 68.0% | INCOMPLETE_GROUP 136 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0.5-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 193 | 96.5% | 7 | 3.5% | INCOMPLETE_GROUP 7 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh1-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 173 | 86.5% | 27 | 13.5% | INCOMPLETE_GROUP 27 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1-tb64-sh1.5-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2-F-r6-i1.5-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.382 |
| 2x2-F-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 78 | 39.0% | 122 | 61.0% | INCOMPLETE_GROUP 122 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | -0.118 (not guaranteed) |
| 2x2-F-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0.2-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0.4-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0.6-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0.5-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl1-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl1.5-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INVALID_MARKER 200 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl2-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INVALID_MARKER 200 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl10-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl20-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl30-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 10 | 5.0% | 190 | 95.0% | INCOMPLETE_GROUP 190 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl40-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro0-gp0-cm45-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro0-gp0-cmR-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro0-gp0.5-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro0-gp1-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro1-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro2-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 167 | 83.5% | 33 | 16.5% | INCOMPLETE_GROUP 33 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0-ro3-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 59 | 29.5% | 141 | 70.5% | INCOMPLETE_GROUP 141 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0.5-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 196 | 98.0% | 4 | 2.0% | INCOMPLETE_GROUP 4 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh1-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 161 | 80.5% | 39 | 19.5% | INCOMPLETE_GROUP 39 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i1.5-tb64-sh1.5-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 2 | 200 | 199 | 99.5% | 1 | 0.5% | INCOMPLETE_GROUP 1 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2-F-r6-i2-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 2.005 |
| 2x2-F-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 1 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 2.005 |
| 2x2-F-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0.5-mat | 3 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 1.505 |
| 2x2-F-r6-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co1-mat | 3 | 200 | 77 | 38.5% | 123 | 61.5% | INCOMPLETE_GROUP 123 | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 1.005 |
| 2x2-F-r6-i2-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 1 | 200 | 191 | 95.5% | 9 | 4.5% | INCOMPLETE_GROUP 9 | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 2.005 |
| 2x2-F-r6-i2-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 1 | 200 | 163 | 81.5% | 37 | 18.5% | INCOMPLETE_GROUP 37 | 0 | 0.00% | 1.49% | 4.250 | 4.921 | 2.005 |
| 2x2abs-F-r0-i1-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2abs-F-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2abs-F-r0-i1-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2abs-F-r0-i1-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 2x2abs-F-r3.175-i1-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2abs-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2abs-F-r3.175-i1-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2abs-F-r3.175-i1-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 2x2abs-F-r3.175-i1.5-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2abs-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2abs-F-r3.175-i1.5-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2abs-F-r3.175-i1.5-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 2x2abs-F-r3.175-i2-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2abs-F-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2abs-F-r3.175-i2-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2abs-F-r3.175-i2-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 2x2abs-F-r6-i1-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2abs-F-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2abs-F-r6-i1-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2abs-F-r6-i1-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 2x2abs-F-r6-i1.5-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2abs-F-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2abs-F-r6-i1.5-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 2x2abs-F-r6-i1.5-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 3x3-F-r0-i1-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 3x3-F-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 3x3-F-r0-i1-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 4 | 200 | 185 | 92.5% | 15 | 7.5% | INCOMPLETE_GROUP 15 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 3x3-F-r0-i1-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 4 | 200 | 147 | 73.5% | 53 | 26.5% | INCOMPLETE_GROUP 53 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 3x3-F-r3.175-i1-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 3x3-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 3x3-F-r3.175-i1-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 4 | 200 | 193 | 96.5% | 7 | 3.5% | INCOMPLETE_GROUP 7 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 3x3-F-r3.175-i1-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 4 | 200 | 146 | 73.0% | 54 | 27.0% | INCOMPLETE_GROUP 54 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 3x3-F-r3.175-i1.5-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 3x3-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 3x3-F-r3.175-i1.5-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 4 | 200 | 184 | 92.0% | 16 | 8.0% | INCOMPLETE_GROUP 16 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 3x3-F-r3.175-i1.5-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 4 | 200 | 136 | 68.0% | 64 | 32.0% | INCOMPLETE_GROUP 64 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 3x3-F-r3.175-i2-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 3x3-F-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 3x3-F-r3.175-i2-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 4 | 200 | 185 | 92.5% | 15 | 7.5% | INCOMPLETE_GROUP 15 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 3x3-F-r3.175-i2-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 4 | 200 | 123 | 61.5% | 77 | 38.5% | INCOMPLETE_GROUP 77 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 3x3-F-r6-i1-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 3x3-F-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 3x3-F-r6-i1-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 4 | 200 | 190 | 95.0% | 10 | 5.0% | INCOMPLETE_GROUP 10 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 3x3-F-r6-i1-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 4 | 200 | 135 | 67.5% | 65 | 32.5% | INCOMPLETE_GROUP 65 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 3x3-F-r6-i1.5-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 3x3-F-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 200 | 100.0% | 0 | 0.0% | - | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 3x3-F-r6-i1.5-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 4 | 200 | 185 | 92.5% | 15 | 7.5% | INCOMPLETE_GROUP 15 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 3x3-F-r6-i1.5-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 4 | 200 | 140 | 70.0% | 60 | 30.0% | INCOMPLETE_GROUP 60 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 3x3abs-F-r0-i1-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 3x3abs-F-r0-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 3x3abs-F-r0-i1-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 3x3abs-F-r0-i1-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | No Central_Void | No Central_Void | 1.587 |
| 3x3abs-F-r3.175-i1-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 3x3abs-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 3x3abs-F-r3.175-i1-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 3x3abs-F-r3.175-i1-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 3.175 | 3.175 | 0.930 |
| 3x3abs-F-r3.175-i1.5-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 3x3abs-F-r3.175-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 3x3abs-F-r3.175-i1.5-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 3x3abs-F-r3.175-i1.5-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 4.047 | 4.047 | 2.053 |
| 3x3abs-F-r3.175-i2-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 3x3abs-F-r3.175-i2-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 3x3abs-F-r3.175-i2-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 3x3abs-F-r3.175-i2-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 5.020 | 5.020 | 3.175 |
| 3x3abs-F-r6-i1-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 3x3abs-F-r6-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 3x3abs-F-r6-i1-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 3x3abs-F-r6-i1-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 2.005 | 4.250 | -0.240 (not guaranteed) |
| 3x3abs-F-r6-i1.5-tb200-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 3x3abs-F-r6-i1.5-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 3x3abs-F-r6-i1.5-tb64-sh0.5-ro1-gp0-cmR-tl10-bl0.5-lt0.2-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |
| 3x3abs-F-r6-i1.5-tb64-sh1-ro1-gp0.5-cmR-tl20-bl0.5-lt0.4-rs0-rr0-co0-mat | 4 | 200 | 0 | 0.0% | 200 | 100.0% | INCOMPLETE_GROUP 200 | 0 | 0.00% | 1.49% | 3.127 | 4.458 | 0.882 |

