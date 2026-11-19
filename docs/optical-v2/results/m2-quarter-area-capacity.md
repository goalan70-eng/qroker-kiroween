# M2 follow-up — capacity with the 25% Joker footprint

Codex geometry and capacity probe, based on `c077489d495170d4612189a4649d45cec6a3f092` and the existing [25% decoration trial](m2-joker-source-test.md#owner-requested-25-placement). This study uses the provisional M2 layout. It assigns no V2 data format, card identities, detector or acceptance thresholds.

## Method recorded before running

- Keep the 16 × 16 module square, one-module outer quiet band, centered 8 × 8 decoration footprint and existing protected rectangles. Per quadrant count binary data cells wholly outside that footprint, then count all protected data cells, including the three holes in the decorative area. Verify full data and frame containment and void clearance for all three study radii using the 0.4 mm extra void clearance and the 1-module minimum feature. These are study inputs.
- With a known cell order and orientation, check whether 52 arbitrary identities could fit for each budget. A 12-cell Hamming-code dimension bound with distinct nonzero columns witnesses one-error correction. For two errors in 12 cells, use disjoint radius-two binary Hamming balls as a necessary bound. For 15 cells, use independent binary syndrome enumeration for error patterns of weight 0, 1 and 2, with a standard degree-eight polynomial as the algebraic witness. No codewords, card mapping or optical recognition implementation are produced.
- Test fixed sample centers at nominal alignment and the existing perturbed setup. At each of the 16 placement classes, test all sign combinations of ±0.2 mm shift per axis and ±1° about the card center, with half the 0.25 mm gap applied outward along both axes. Invert the piece transform and count centers that leave their intended cells. These eight points per class are finite sensitivity cases. A miss is a geometric sample miss even if the adjacent cell happens to have the same bit. No camera or bit-reading model is used.

## Results

| Available data cells per quadrant | Capacity with known cell order and orientation |
| --- | --- |
| 12 wholly outside the 25% footprint | A dimension-8 binary construction supports 256 values with one-bit correction. The 12-bit radius-two ball occupies 79 words, so at most 51 values could all correct any two errors. This rules out a 52-value guarantee at two errors on these 12 cells alone. |
| 15 protected cells, including three inside the footprint | The remainder of each of the first eight monomials is itself, so the parity check has rank eight. The 121 syndromes for zero, one or two errors are distinct, giving a dimension-7 witness with 128 values and two-bit correction. |

There are 48 cells outside the footprint or 60 protected cells across the four cards. Both outer frame probes per quadrant lie outside the decoration footprint. With the existing clipping approach, three protected cells per quadrant use gaps in the art layer. Those cells are D3,2, D2,3 and D3,3 in inward-corner coordinates. The narrowed decoration trial reproduced successfully. All three nominal corner radii passed the critical rectangle checks. The minimum distance to the central void was 3.550, 3.381 and 3.265 mm for radii 3.175, 3.6 and 4.0 mm, respectively. The minimum modeled print slack was 1.3375 mm after the proposed 0.25 mm buffer. The 25.4 mm assembled square with one external quiet module fits the conservative nominal width bound with 6.35 mm slack. These are geometric checks of a provisional set of regions.

All 16 nominal placement classes had zero fixed-center misses. With a 0.25 mm gap, ±0.2 mm shifts and ±1° rotation, both layouts had geometric misses in 64 of 128 finite sensitivity cases, with up to all 12 or 15 centers outside their intended cells. This 64/128 count is a property of the chosen corner cases and fixed image coordinates. The centers are sampled without estimating the piece transforms. The result establishes sensitivity to registration under the model and gives no image recognition rate. The two-bit capacity witness assumes that patch registration has already provided the correct cell order and that at most two bits are wrong.

Run twice with identical aggregate output under Windows PowerShell and Node v24.20.0. The duplicate-syndrome negative control and 11 existing M2 tests passed. Independent synthetic recognition, frame finding, rejection of incomplete groups and real print or phone trials require later authorized milestones. Gate 2 remains blocked.

~~~powershell
node scripts/optical-v2/m2-quarter-area-capacity.mjs
node --test scripts/optical-v2/m2-feasibility.test.mjs
./scripts/optical-v2/measure-joker-source.ps1 -Image <local-original-attachment> -QuarterArea
~~~
