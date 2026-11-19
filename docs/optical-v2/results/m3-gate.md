# Gate 3 — V2-M3 Result_Record

**Decision: go.** 2026-11-19 KST · Codex · EC 1 review of EC 2 generation and rendering evidence. Issue #16. [Gate 2 reassessment](m2-gate-r2-2026-11-19.md) commit `5fd6c24c3d0686a931fb1cc37e85e382f51a609b` records the owner authorization and approved conditions. Implementation commit `126fcf4b9bc792d037af748d0575783166303135`, format `2.0.0-m3.1`. One continuous square is the target appearance.

| Evidence ID | Executed check | Result |
| --- | --- | --- |
| M3-FORMAT | Inspected the versioned [format](../format-v2.md) and [compatibility policy](../compatibility-policy.md). Counted the M2 cells and compared the V1 format requirement. | 52 cards, two permanently assigned corners, 15 data cells per piece versus 25 needed for a V1 word, algorithmic V2 mapping. O-9 remains undecided. |
| M3-OFF | Generated two copies of the full deck with no random inputs. | Identical 104 front and 104 reverse module rasters, no dependencies on another card's front. Two faces occupy disjoint card-body corners. Decoration mode OFF. |
| M3-CLASSES | Used the independent M2 classes across all 13 ranks, 208 front and 208 left-right-flipped reverse projections. Tested top-bottom transform algebra and the unchanged-back negative control. | Zero observed shared-layer or expected data mismatches. Copying the front unchanged to the back was rejected. |
| M3-DISTANCE | Compared all 1,326 distinct ID pairs in ordinary and swapped-axis readings under known module positions. | The initial ordinal scheme had 34 ordered cross-ID exact matches after transposition. The regression test reproduced distance zero before the fix. The final representative-word mapping has distance at least five for all distinct ID pairs in both readings. This result assumes correct cell registration. |
| M3-MASK | Compared the 288² scene against masks independently rasterized from the M2 protected rectangles and the ideal rounded-corner formula. | Zero keep-out differences, zero protected pixels in Central_Void, zero uncovered samples inside the outline outside Central_Void at zero seam and offset. |
| M3-BOUNDARY | Scanned V1, V2 and game production imports and tested planted violations in a temporary fixture. | Pass. All production V2 imports are internal. V2 results sit outside the V1 result tree. |
| M3-V1 | Ran all three [V1 regression checks](m3-v1-untouched.md). | Pass. |

## Reproduction and scene samples

Windows x64, Node v24.20.0, npm 11.19.0, Vitest 5.1.0. Seed N/A. `node node_modules/vitest/vitest.mjs run src/optical-v2/tests --maxWorkers=1` passed all eight tests. `npm run typecheck` and `npm run build` passed. The commands below write a raw 288 × 288 gray PGM with version metadata. Each distinct scene was emitted twice with matching hashes.

~~~powershell
node node_modules/tsx/dist/cli.mjs scripts/optical-v2/render-m3-sample.ts <local-nominal.pgm> nominal
node node_modules/tsx/dist/cli.mjs scripts/optical-v2/render-m3-sample.ts <local-perturbed.pgm> perturbed
~~~

| Sample | Visible frame-join gaps in modules (top, bottom, left, right) | Tangential steps in modules | PGM SHA-256 |
| --- | --- | --- | --- |
| Nominal | 0, 0, 0, 0 | 0, 0, 0, 0 | `9FD41DEABC9BE78F1158D17BE8B12AC05B8912D913A01A26EFDB3746614C0FC4` |
| Perturbed | 0.375, 0.25, 0.25, 0.25 | 0.125, 0, 0, 0 | `13D2EE9B5B42EA993D27948D41DA909BD66E719C7F03FC68724712AEB0EC02B4` |

Both scenes use H-5, D-9, C-J and S-2 in TL, TR, BL and BR order at 0°. The perturbed case uses a 0.25-module seam, TL print offset `[0, 0.125]` and TL cut offset `[-0.125, 0]`. These are modeled geometric distances at straight frame joins. The sample shows visible discontinuity under the given separations.

## Route

V2-M3 ends at this record. A separate dated authorization for V2-M4 is required. M4 must establish frame detection, registration and four-piece atomic reporting with the full negative suite before any recognition claim. Later decoration testing should compare OFF, the 25% trial and an approved smaller candidate on matched samples. O-5 remains open. Actual front-face index fit, printable details, print quality and camera recognition remain unverified.
