# Task 7.1: seeded degradations (`src/optical/degrade.ts`)

All degradations act on **synthetic images, not real cameras**. They are simple, documented image operations, not a lens,
sensor or print model. This file records the API and conventions of task 7.1 only. The robustness experiment
(`scripts/run-robustness.ts`, `robustness.json/md`) is tasks 7.2 to 7.4 and has not been run.

## API

Image type: `GrayImage` of `render.ts` (`width`, `height`, row-major `Uint8Array`, 0 = black, 255 = white). Every function returns a new image.

| Function | Parameters | Zero strength |
|---|---|---|
| `fragmentOffsets(count, magnitudeModules, seed)` | magnitude in marker modules, 0 to 1 (levels 0, 0.1, 0.25) | all offsets exactly `+0` |
| `applyFragmentOffsets(img, rects, offsets, modulePx, {background})` / `shiftFragments(img, rects, magnitudeModules, modulePx, seed)` | integer pixel rectangles of the marker footprints | exact copy |
| `markerFootprintRect(cx, cy, modulePx)` | 9 x 9 module footprint around a marker centre | n/a |
| `reflectImage(img, 'none' \| 'Fh' \| 'Fv')` | D4 names of `transforms.ts` | exact copy |
| `rotateImage(img, deg, {background, supersample})` | any finite real angle, clockwise | multiples of 360: exact copy |
| `perspectiveImage(img, {tiltDeg, axisDeg, distanceDiagonals}, opts)` / `perspectiveMatrix` | tilt up to 80 deg, axis any angle, distance in image diagonals (default 1) | tilt 0: exact copy |
| `warpHomography(img, H, opts)` | 3 x 3 row-major homography, source to output | exact identity: exact copy |
| `blurImage(img, sigmaPx)` | sigma 0 to 32 px | exact copy |
| `addNoise(img, sigma, seed)` | sigma 0 to 128 gray levels | exact copy, no random draws |
| `applyIllumination(img, strength, directionDeg)` | strength 0 to 1 | exact copy |
| `degrade(img, params)` | `DegradeParams` below | equal copy |
| `stageSeed(masterSeed, 'fragments' \| 'noise')` | | |

`DegradeParams`: `seed` (required), `fragments {rects, magnitudeModules, modulePx}`, `reflect`, `rotationDeg`, `perspective`, `background`,
`warpSupersample`, `illumination {strength, directionDeg}`, `blurSigmaPx`, `noiseSigma`. The signatures contain no card identity, board state or expected result.

## Conventions

- **Coordinates**: continuous, pixel (i, j) covers [i, i+1) x [j, j+1), centre (i+.5, j+.5), origin at the top-left corner, y down (as `detect.ts` and `testing/warp.ts`).
- **Rotation**: positive degrees turn the picture **clockwise** as displayed, about the image centre (w/2, h/2), output size = input size, uncovered area = `background` (default 255). 90 degrees maps pixel (r, c) of a square image to (c, n-1-r), which is D4 `R90` (`applyImageTransform`). Multiples of 90 (180 for any size, 90/270 for square images) are exact index permutations, every other angle is one bilinear, supersampled warp (default 2 x 2 sub-samples, as the camera warp of the geometry experiment).
- **Reflection**: `Fh` reverses the row order (about the horizontal axis, `reflectHorizontalAxis`), `Fv` reverses the column order. Exact and lossless.
- **Perspective**: pinhole view of the image plane tilted by `tiltDeg` about an in-plane axis through the image centre whose direction is `axisDeg` clockwise from +x, camera `distanceDiagonals` x image diagonal in front of the centre (focal length = distance). Same formula as `tiltMatrix` of `testing/warp.ts`. Invalid or degenerate cases throw: the matrix must be invertible and the denominator at the four image corners must keep the sign of the centre value and be at least 0.02 times it (the horizon line must stay clear of the image).
- **Illumination**: multiplicative linear ramp, gain 1 at one edge and 1 - strength at the opposite edge (`applyLightingGradient` of `geometry-trial.ts`). The picture gets darker towards `directionDeg` (0 = right, 90 = down). It does not preserve the mean: a flat image is multiplied by 1 - strength/2.
- **Blur**: separable Gaussian, kernel radius max(1, ceil(3 sigma)), replicated edges, one rounding at the end (`gaussianBlur` of `geometry-trial.ts`).
- **Noise**: independent Gaussian, standard deviation in gray levels, Box-Muller from `mulberry32(seed)`, two draws per pixel in row-major order, rounded and clamped to 0..255 (`addGaussianNoise` of `warp.ts`).
- **Rounding**: `Math.round`, then clamp to 0..255 everywhere.
- **Fragment position error** (Requirement 12.5, "per-fragment position error of 0, 0.1 and 0.25 modules"). The spec does not define the direction, so this is the definition used: each fragment gets an error vector of length exactly `magnitudeModules` in a direction uniform on the circle (the convention of the duplex registration errors in `geometry-trial.ts`), one uniform draw per fragment independent of the level, so for one seed the directions are the same at 0.1 and 0.25. It is an image-space operation on the marker footprints: the content of each footprint rectangle is translated by offset x `modulePx` pixels (+x right, +y down) with bilinear resampling and stays inside its rectangle (white `background` shifted in, content shifted out is cut). Up to 1 module (the quiet margin) no black module is cut off. A whole-pixel offset is an exact shift. Footprints come from the caller (for example `markerFootprintRect` around the marker centres of `composeGroup`), the module does not know card layouts. Any value in [0, 1] is accepted, other values throw.
- **Composition order** (`degrade`, fixed, independent of the field order): 0 fragment position errors, 1 reflection, 2 geometric warp (perspective, then rotation, as ONE homography and ONE resampling, the same `compose(tilt, rotation)` as `degradeImage` of `geometry-trial.ts`), 3 illumination, 4 blur, 5 noise. Reasons: scene-space changes and exact permutations come first so only one lossy resampling happens; illumination, blur and noise then work in the camera image frame; sensor noise is last so it is independent per pixel with the requested sigma and is not blurred. Difference from `geometry-trial.ts`: blur and lighting are swapped (smooth operations, nearly commuting) and there is a noise stage.
- **Seeds**: one master seed (integer 0 to 4294967295, required). Random stages use `stageSeed(master, stage) = fmix32(master ^ imul(stageIndex + 1, 0x9e3779b1))` with fixed indices fragments = 0, noise = 1 (same derivation as `streamSeed` of the geometry experiment). A stage seed depends only on the master seed and the stage, so enabling, disabling or changing any other stage never changes a stage's random stream. Rotation, perspective, blur and illumination take explicit parameters and use no randomness.

## Reuse decisions

Production code does not import from `testing/`. The matrix formulas, inverse-mapping bilinear warp, camera tilt matrix, Box-Muller noise, Gaussian blur and illumination ramp of `testing/warp.ts` and `testing/geometry-trial.ts` are re-implemented in `degrade.ts` with the same arithmetic, and `degrade.test.ts` proves byte identity with `warpImage`, `tiltMatrix`, `rotateImage` (`group-compose.ts`), `addGaussianNoise`, `gaussianBlur`, `applyLightingGradient` on shared cases. No file in `testing/` was changed. Differences from the helpers, by design: exact identity and exact quarter-turn paths (the supersampled warp of `warp.ts` softens an identity warp, a quarter turn is lossless here), parameter validation, and sigma 0 or strength 0 return a copy instead of the same object.

## Test coverage (`src/optical/degrade.test.ts`, 154 tests, about 1.5 s)

| Requirement | Tests |
|---|---|
| Determinism (byte-identical) | every active degradation and `degrade` with all stages, repeated calls |
| Zero strength = identity | 13 cases: each degradation, identity homographies, `degrade` with no stage and with every stage at zero (equal copy, new buffer) |
| Seed sensitivity | noise, fragment offsets, shifted fragments, `degrade` master seed (and no reaction when no random stage is active) |
| Dimensions and ranges | every active degradation; flat image stays in range (a NaN pixel would show as 0) |
| Input immutability | every degradation, and `degrade` when it throws |
| Rotation | 90/180/270 vs own index math, vs `applyImageTransform` R90/R180/R270, 450 = 90, -90 = 270, 180 on a non-square image, clockwise direction by dot centroid, byte identity with `testing` rotation, theta then -theta (max 4 gray levels on a smooth picture) |
| Reflection | independent index reference, vs `applyImageTransform` Fh/Fv, twice = identity, D4 identities (Fh.R180 = Fv, R180 commutes, R90.Fh = Fh.R270) |
| Perspective | four blobs against an independent Rodrigues-rotation projection (< 0.25 px, two poses), byte identity with `tiltMatrix` + `warpImage`, tilt 0 identity, degenerate cases rejected |
| Fragment offsets | length = 0, 0.1, 0.25 module (1e-12), exact +0 at magnitude 0, directions cover the circle, proportional across levels, centroid shift = offset (< 0.05 px), nothing outside footprints changes, whole-pixel offset exact |
| Blur | independent kernel reference (every pixel within 0.5), mass within 1%, peak of a single pixel, byte identity with `gaussianBlur`, flat images stay flat |
| Noise | mean and standard deviation within 4 standard errors at sigma 3, 10, 25, clamping at 0 and 255, byte identity with `addGaussianNoise` |
| Illumination | closed form for direction 0, monotone along 0, 45, 90, 180, mean x (1 - strength/2), byte identity with `applyLightingGradient` |
| Validation | 65 invalid inputs (NaN, Infinity, negative, out of range, non-integer, bad seeds, unknown fields, bad shapes, degenerate perspective or homography, bad images) throw RangeError or TypeError; `degrade` validates before working |
| Composition | equals the documented chain built from the `testing` helpers, field-order independence, stage-independent seeds (noise stream unchanged when any other stage is removed or changed, fragment stage unchanged by noise) |
| Decoder and physical-card compatibility | rotated, blurred, noisy, lit 2 x 2 group decodes to the right cards and sum; mirrored and rotated by 100 degrees decodes; offsets 0.1 and 0.25 module decode; zero composition is byte-identical and decodes identically; `observeFace` and `composeBoard` images are degraded deterministically |

## Limitations

- Synthetic images, not real cameras. No lens distortion, no depth of field, no rolling shutter, no JPEG or other compression, no colour, no print or paper model, no glare or shadows.
- The perspective is a single ideal pinhole homography about the image centre. Rotation is a roll about the image centre.
- Noise is i.i.d. Gaussian with a fixed sigma (no signal dependence, no fixed-pattern noise). Blur is an isotropic Gaussian.
- Illumination is a linear multiplicative ramp over the image, not a physical light source, and it darkens the mean.
- The fragment position error is applied per marker footprint in image space and needs footprint rectangles from the caller. Shifted content stays inside its footprint; it is not a re-render of the card at a displaced position. Marker footprints that overlap would be painted in list order.
- Cardinal rotation angles are lossless while all other angles are resampled, so rotation by 90 and by 90.001 degrees differ in sharpness.
- None of these results claim anything about real cameras, and no robustness rates exist yet (tasks 7.2 to 7.4).
