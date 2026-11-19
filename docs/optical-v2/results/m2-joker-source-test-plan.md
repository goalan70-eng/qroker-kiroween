# M2 supplemental test — original Joker image

Codex recorded this follow-up before executing it on 2026-11-19 KST. The owner provided the original 1280×1280 raster and requested testing with the artwork retained. This record covers geometric testing within M2. Artwork publication and a formal decoration route remain separate decisions. Input image and derived rasters stay local and in memory. Only aggregate metrics are recorded.

- Keep the original upper half as the visual source and assign the lower half by a 180° turn about the original image centre. Measure how many pixels change relative to the attachment. Use the uncorrected input as a negative control.
- Use the established M2 coordinate convention, global and local metrics, and the existing proposed tolerances. Decode the attachment locally, convert to BT.601 luminance, sample pixel centres with bilinear interpolation, and threshold at 128. Use the registered comparison resolutions 768 and 1536 plus the original 1280. Evaluate the 16-module, one-module quiet-side witness, and use the three previously registered radii 3.175, 3.6 and 4.0 mm.
- Test the corrected art unmasked, then with the nominal Central_Void, then with the same void and M2 data and critical frame keep-out rectangles. Confirm every one of the 16 class crops matches after the corrections and every mask. Quantify artwork removed in each step. The external quiet band lies outside the sampled square.
- The silhouette preservation criterion for an accepted decoration remains open. Report counts, fractions and the largest loss source. Use an independent toy raster as a control, and repeat the numeric run with the same settings. This evaluates the decorative layer only. The existing tests and proposed thresholds for recognition, printing, camera use and later gates retain their scope.

References: [M2 preregistration](m2-preregistration.md), [original Gate 2 record](m2-gate.md), [original geometry report](m2-geometry-feasibility.md).
