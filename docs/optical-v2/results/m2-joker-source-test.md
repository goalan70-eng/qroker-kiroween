# M2 supplemental results — retaining the original Joker

EC 1. Producer Codex. 2026-11-19 KST. M2 study revision 72b36af4638e0f5ece1d8236e092f96c14335e96. Follow-up requested by the owner with the original image attached. [Follow-up test plan](m2-joker-source-test-plan.md) supplements the existing [M2 gate record](m2-gate.md). No Gate 2 outcome is assigned by this result.

Input is the owner-supplied 1280×1280 JPEG raster, supplied with a PNG filename extension. File SHA-256 cf7f672dd97556b34bb120acc17caf0af6941c9e1b491d50c3268a05ce3fa6f3. It differs from the PR #18 SVG trace used for the original M2 record. Colors were decoded locally and thresholded at 128 after sampling. Upper-half pixels establish the 180° completion. The comparison renders nothing to disk. Owner art and derived art are absent from this commit, and O-5 remains open.

## Symmetry and placement

| Grid | Original 180° mismatch before masks | Pixels changed by point-symmetry correction | Corrected mismatched classes |
| ---: | ---: | ---: | ---: |
| 768² | 1.1739% | 3,462 (0.5870%) | 0/16 |
| 1280² | 1.2189% | 9,985 (0.6094%) | 0/16 |
| 1536² | 1.1908% | 14,047 (0.5954%) | 0/16 |

The unmodified source failed the symmetry limits at all three resolutions, with mismatch in the eight 180° class uses. After correction the half-turn mismatch was exactly zero in all runs. The nominal void and the combined void/keep-out mask preserved zero mismatches and 0/16 disagreeing classes at all resolutions and all three radii. This establishes consistent assembly of the tested decorative layer under ideal alignment.

## What remains of the image

The table uses the 25.4 mm square, one-module quiet side and native 1280² grid. Counts are unique black-pixel removals in order of void, data, then critical frame. Percentages use the corrected art's 568,184 black pixels as denominator.

| Corner radius | Removed by void | Removed by data mask | Removed by critical frame mask | Retained after all masks |
| ---: | ---: | ---: | ---: | ---: |
| 3.175 mm | 8,150 | 134,194 | 38,462 | 68.18% |
| 3.6 mm | 12,132 | 134,194 | 38,462 | 67.48% |
| 4.0 mm | 16,106 | 134,194 | 38,462 | 66.78% |

At 3.175 mm, the void alone retains **98.57%** of dark artwork. The proposed data rectangles account for **23.62%** of the original corrected ink and the critical frame rectangles account for **6.77%**. Correcting symmetry is sufficient for the geometric class criterion. Keeping the full silhouette with the present illustrative protected layout remains unverified, and that layout removes roughly a third of the ink. A future ornament fit study would need to check the important silhouette and band features against a suitable protected layout. The black-area metric does not measure perceptual fidelity, stroke printability or scanner reliability.

## Reproduction and evidence status

Windows x64, PowerShell with System.Drawing.Common, Node v24.20.0, seed N/A. From the worktree root, provide the original attachment locally. Both runs produced identical aggregate JSON. The toy-raster rotation control, the study assertions, and all 11 existing M2 model tests passed.

~~~powershell
./scripts/optical-v2/measure-joker-source.ps1 -Image <local-original-attachment>
node --test scripts/optical-v2/m2-feasibility.test.mjs
~~~

The [original PR #25 hosted CI](https://github.com/goalan70-eng/qroker-kiroween/actions/runs/44480018881) remains a separate failed run. Its Vitest step reported 3,016 passed and three 5 s optical timeouts: blurred scale, rotated-card-centre, and the physical-card decodeGroup smoke case. Browser steps were skipped. The supplemental check does not change V1 test code, CI timeouts or historical evidence. V1 Task 7.2 and V1 Milestone 8 remain **unevaluated**, and any V1 comparison uses **unevaluated V1 baseline (synthetic)**.

Unrun: physical prints and real-phone scanning, feature-size qualification of an approved layout and visual acceptance of the corrected ornament. The next milestone still depends on a continuing Gate 2 outcome and a separate owner authorization.

## Owner-requested 25% placement

Codex tested a centered 8 × 8 module placement square (12.7 × 12.7 mm) within the assumed 16 × 16 module composite (25.4 × 25.4 mm). The placement square covers exactly 25% of the composite area with the external quiet zone excluded. The test uses the same source SHA-256, 180° correction and mask geometry as above. Only artwork scale changes. The uncorrected input still has 180° differences at every grid size. The corrected and masked layers each have zero mismatches across all 16 placement classes, three grid sizes and three corner radii. The script checks that every ink pixel stays inside the placement square.

| Corner radius | Removed by central void | Removed by protected data | Removed by critical frame | Ink retained vs. scaled unmasked art | Ink coverage of composite |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 3.175 mm | 10,860 | 10,904 | 0 | 84.65% | 7.33% |
| 3.6 mm | 14,882 | 10,904 | 0 | 81.82% | 7.08% |
| 4.0 mm | 19,436 | 10,904 | 0 | 78.61% | 6.80% |

At the 1280² grid the corrected layer starts with 141,818 black pixels, or 8.66% coverage of the composite. At 3.175 mm the scaled image retains 84.65% of that ink compared with 68.18% of the full-size corrected ink in the earlier trial. Percentage retained is relative to each trial's unmasked image. It does not quantify how well specific design details survive. At 768² and 1536², the 3.175 mm result was respectively 84.61% and 84.57% retained. This is an ideal geometric result with an illustrative layout. Print feature size, visual fidelity and camera performance remain unverified. Gate 2 remains blocked.

~~~powershell
./scripts/optical-v2/measure-joker-source.ps1 -Image <local-original-attachment> -QuarterArea
node --test scripts/optical-v2/m2-feasibility.test.mjs
~~~

Two quarter-area runs produced identical aggregate JSON under Windows x64, PowerShell 7.6.9 and Node v24.20.0. The full-size command reproduced the previous counts, and all 11 existing M2 tests passed. The local comparison preview stays outside the repository under the existing O-5 publication restriction.
