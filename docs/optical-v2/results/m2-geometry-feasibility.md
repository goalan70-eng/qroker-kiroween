# M2-FEASIBILITY — model results

EC 1. Producer Codex. Executed on 2026-11-19 KST after the [pre-registration](m2-preregistration.md) was committed as 55bf5202396d06583abfbd8284fe04e6ab0dafeb at 16:17:26 KST. The isolated branch starts at PR #24 head ab159353c61a4959c75267092585b96ed167e70e. The approved V1 reference is ddad4473f2a30d56e033d578c7bff8263ac4a864. Kiro Design-First spec revision 095f70ed76cc776a46e056c6a98217adbca2aa5b. [Gate 1 R3](m1-gate-r3-2026-11-19.md) and the owner's 2026-11-19 instruction authorize this study. The Node scripts depend only on each other, Node built-ins and Git data.

## Placement classes and HYP-1

The direct transcription is H=TL,BR, D=TR,BL, C=TR,BR, S=TL,BL from the V1 Requirements glossary. Inward corners by board slot are TL→BR, TR→BL, BL→TR, BR→TL. For each printed corner, we applied both orientations and checked every slot independently. All 16 computed keys match the hand table, with zero missing and zero extra entries. All eight printed piece types passed the two-use invariant.

| Printed piece | Board slot at 0° | Board slot at 180° |
| --- | --- | --- |
| H TL | BR | TL |
| H BR | TL | BR |
| D TR | BL | TR |
| D BL | TR | BL |
| C TR | BL | TR |
| C BR | TL | BR |
| S TL | BR | TL |
| S BL | TR | BL |

**HYP-1 is confirmed in the fixed-print shared-layer model.** The piece used at 0° in one slot is the same piece used at 180° in the opposite slot. This forces opposite target quadrants to be half-turn images. Conversely, print the natural 0° shared-layer crop in each body corner. A half-turn-symmetric target supplies the required crop at both uses for every piece. This proves necessity and sufficiency with independent shared crops, point-symmetric clipping and nominal alignment. The construction leaves card-specific data values and V1's identifying-pattern transforms outside the shared-layer proof.

At 768×768, the OFF frame differed by **0 pixels** for half-turn and both mirror comparisons. All 16 class crops matched. The ink envelope had 0 empty samples outside the modeled Central_Void. An abstract half-turn-only witness had zero half-turn mismatches and 2,304 under each mirror. It matched every placement, so individual mirror symmetry is unnecessary. A single-mirror-only control failed the half-turn and class checks. The abstract witness establishes possible symmetric artwork placement, with the fidelity and manufacturability of a redesigned Joker still untested.

For the proposed C4 option, left/right body mirroring followed by ideal left/right flip is the identity. Top/bottom flip composed with body mirroring yields a half-turn. All four suit layouts passed the corner tests for position restoration and disjoint front/back body corners. The unchanged-face negative control exposed wrong positions. C4 remains a named owner decision. Printed pixel agreement and show-through require later physical evidence.

## Supplied Joker trace

PR #18 commit 7baefca3cf8d69c6bb52f989afaae3892f15063b, blob 5f18c59d02d9cdbf18c6270c91dc4fe22c8fb71b, byte SHA-256 ba0b55c080eec1aaf39e8cba06a45aca6606be9f0d10bb9b89690691ffdce824. Owner-supervised comparison to the owner-held original was **not performed**. O-5 rights remain unresolved. The SVG was read from its existing blob. Raster arrays stayed in memory and the recorded output contains numeric summaries and digests.

At illustrative S=16 modules and r=3.175 mm, the Central_Void mask removed 2,981 of 202,017 black samples at 768² and 11,907 of 808,259 at 1536² (about 1.48% and 1.47%). The local metric is the square root of the maximum mismatched area in a sliding one-module window. Window positions use a top-left origin. Limits were **0.10% global and 0.125 module local**, proposed, pending owner approval.

| Samples per side | Transform | Unequal pixels | Full-square mismatch | Peak local deviation | Window origin in pixels | Study verdict |
| ---: | --- | ---: | ---: | ---: | --- | --- |
| 768 | 180° | 6,972 | 1.1820% | 0.2924 module | (335,132) | Fail |
| 768 | Left/right | 5,720 | 0.9698% | 0.2560 module | (76,132) | Fail |
| 768 | Top/bottom | 6,484 | 1.0993% | 0.2924 module | (356,165) | Fail |
| 1536 | 180° | 30,280 | 1.2834% | 0.2904 module | (712,330) | Fail |
| 1536 | Left/right | 22,564 | 0.9564% | 0.2566 module | (149,268) | Fail |
| 1536 | Top/bottom | 28,992 | 1.2288% | 0.2904 module | (712,330) | Fail |

Both rasterizations repeated with identical metrics and digests. The half-turn residual affected the eight 180° class uses. The trace is incompatible as-is under these conditions. Among its 12 contour bounding spans, the smallest at S=16 is 0.8333 module (1.3229 mm). The shortest axial dark run was one pixel at each resolution. That proxy is sensitive to angled boundaries and cannot establish actual stroke width. A decoration-free square has a nominal geometric witness and a suitable point-symmetric ornament is geometrically possible. An actual redesign and its fit against a final protected layout remain untested.

## Rounded corners and adjacent markers

The [machine-readable result](m2-feasibility.json) records all 192 rows, eight analytic Keep_Out_Mask definitions and per-element void distance, safety margin and feature verdict. Alignment and quiet-zone variants reference their shared local element measurements.

| Corner radius | Four-corner nominal void area |
| ---: | ---: |
| 3.175 mm | 8.6533 mm² |
| 3.600 mm | 11.1250 mm² |
| 4.000 mm | 13.7345 mm² |

The nearest arc or horn is evaluated at each probe's inward-most corner using the coordinatewise downward-closed void in that quadrant. The 0.25 mm print safety buffer is a proposed input. The conservative 2(S+2q)≤D fit check gives width/height limits of 18/26 modules at q=1 and 16/24 at q=2. Width binds. **60 of 192 rows** satisfy all nominal OFF checks, with 24 at S=12, 24 at S=16 and 12 at S=18.

Illustrative S=16, q=1, r=3.175 mm gives a **25.4 mm square**, a 1.5875 mm quiet side, **3.5498 mm** minimum critical probe distance to the void and **1.3375 mm** minimum print margin after the buffer. Conservative width slack is **6.35 mm**. The 0.25 mm seam, 0.2 mm per-axis shift and 1° rotation example gives a per-piece displacement bound of **1.3612 mm** and conservative width clearance lower bound of **3.6276 mm**. With a positive seam, literal continuous coverage fails. S=18/q=1 touches the conservative width bound before alignment error. S=20 fails the conservative width test. The dimensions and error bounds are model inputs. O-8 and C11 remain unresolved for actual front-index overlap and printable allocation.

## Reproduction and limits

~~~console
node --test scripts/optical-v2/m2-feasibility.test.mjs
node scripts/optical-v2/m2-feasibility.mjs
node scripts/optical-v2/m2-feasibility.mjs --check
~~~

Windows 10.0.26300 x64, Node v24.20.0, Git 2.54.0.windows.1. Seed N/A. Samples are the piece classes, two raster resolutions and 192 parameter rows with indexed element IDs. The JSON records source hashes, fixed input commits, SVG hash and mask digests. **11 model tests passed** including invalid layout, boundary, single-mirror and unmirrored-back controls. The check rerun matched the recorded JSON after LF normalization. Failed study checks include the supplied trace transforms and sweep rows outside the preregistered model conditions.

The one continuous square is a target appearance under ideal alignment. Unrun: comparison with the owner-held original, actual print/cut, duplex registration, phone recognition, decoder correctness and visual indistinguishability. V1 Task 7.2 and V1 Milestone 8 remain **unevaluated**. Any comparison with V1 uses **unevaluated V1 baseline (synthetic)**.
