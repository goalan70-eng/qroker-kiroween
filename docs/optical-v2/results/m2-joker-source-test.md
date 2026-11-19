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
