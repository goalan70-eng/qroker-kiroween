# Milestone 3 results report (task 3.3)

Raw output is in `docs/optical/results/m3-test-output.txt`. The source, tests, thresholds, frozen codebook, and previous milestone result files were unchanged. No commit was made.

## Commands executed and exit codes

| # | Command | Exit code | Result |
|---|------|-----------|------|
| 1 | `npm test` (first run) | 0 | 8 files, 108 tests passed |
| 2 | `npx tsc --noEmit` | 0 | No output (the duplicate run also exited 0) |
| 3 | `npm run check:codebook` | 0 | Regenerated codebook matched codebook.v1.json byte for byte |
| 4 | `npm run verify:codebook` | 0 | PASS (dId=5, dSelf=6, minDistance=5) |
| 5 | `npm run render:samples` | 0 | Wrote 9 PNG files |
| 6 | `npm test` (second run, reproducibility) | 0 | 8 files, 108 tests passed |
| 7 | `npx vitest --run --reporter=verbose` | 0 | 108 tests passed |

The CORRECTIONS section at the end of m3-test-output.txt records two issues with the log. The first batch displayed nothing in the console, although sections 1–5 completed and were recorded. As a result, tsc ran once more. In the second batch, a collision with the PowerShell alias `H` (Get-History) prevented the “hashes after render 1” section from being recorded. No hashes are available from immediately after the first render. Rendering ran four times in total. The hashes recorded after runs three (C) and four (D) both match BEFORE.

## Test counts (from verbose output)

| File | Tests |
|------|-----------|
| src/optical/smoke.test.ts | 2 |
| src/optical/fragments.test.ts | 25 |
| src/optical/transforms.test.ts | 9 |
| src/optical/render.test.ts | 32 |
| src/optical/codebook.test.ts | 10 |
| src/optical/verify-codebook.test.ts | 22 |
| scripts/render-samples.test.ts | 7 |
| scripts/verify-bound.test.ts | 1 |
| Total | 108 (matches the Vitest total of 108) |

## Pixel-level results asserted by the tests (based on test names)

- Hearts and diamonds have a card layer with 180° rotational symmetry (render.test.ts “H/D point symmetric”, modulePx 2, 4). Clubs and spades have reflection symmetry across the horizontal axis. The other symmetry does not hold (“and not the other”).
- The physical rotation law `layer(180) == rot180(layer(0))` holds for modulePx 2 and 4. The fast-check property `layer(card,180) == ownRot180(layer(card,0))` was also checked in both directions.
- Empty corners were checked by “blank corners and layer size” (modulePx 1, 2, 4).
- Slot geometry has point symmetry for TL/BR and horizontal-axis reflection for TL/BL and TR/BR (modulePx 1–8).
- Raster transform equivalence (Property 21): `render(applyTransform(g,P)) == ownTransform(g, render(P)) == applyImageTransform` (modulePx 1, 2, 3). The 52×8 coverage figure comes from the existing codebase's test description rather than the test name. The report author did not reread the test code to confirm exhaustive 52×8 coverage.
- Determinism checks covered byte-identical repeated renders, repeatable hashes, and deterministic PNG encoding.
- Rejected inputs: orientations 90, 270, -90, 360, 1, NaN, null, and undefined raise RangeError. Card keys JK, JOKER, X-JOKER, "", H-1, H-11, X-A, and h-a throw. Values of modulePx equal to 0, -1, 1.5, null, or "2" raise RangeError. Orientations 0 and 180 are accepted.
- Other checks covered 52 unique ALL_CARDS keys (no joker), all placed corners derived from printed patterns, at least 5 bits of difference at corners shared by clubs and spades, and unchanged frozen JSON bytes.

## Hash comparison

- Codebook and verification files (BEFORE = AFTER): codebook.v1.json `515ECEB3…CC2D4`, codebook-verification.json `B331EC5E5499BA6831A23880F977A6C7EB2219323F15B8FEDD0BD819DAF1EF36`, and codebook-verification.md `5698693E994EA3229FE30DDC63A160A9A1C9AC0F13B117A0040CA93D5068EE66`. These matched the task instructions.
- All 11 files in docs/optical/samples/ had identical hashes at BEFORE, after render three, and after render four. The count stayed at 11. The report records no byte differences across the four renders.

## Sample files and SHA-256 (manifest.json)

| File | Dimensions | SHA-256 |
|------|------|---------|
| H-A-0.png | 320×448 | 664eecb01f0ce3ced9a88726d0642aeacd7375beec9970e441b944fc071f5e28 |
| H-A-180.png | 320×448 | 664eecb01f0ce3ced9a88726d0642aeacd7375beec9970e441b944fc071f5e28 |
| D-K-0.png | 320×448 | 6f7b53721321f5a0f9add45342398256f0aed79ab01d8b8fa7f56b6f6e2bb007 |
| D-K-180.png | 320×448 | 6f7b53721321f5a0f9add45342398256f0aed79ab01d8b8fa7f56b6f6e2bb007 |
| C-7-0.png | 320×448 | 3a84d54e051023264f4f767c6dbd4fb7426d5afe402de7ebad139ad7f9a7bf7a |
| C-7-180.png | 320×448 | 7efdf8f1d69c02e5977d61675a18cc683a649e114de1a4f3d45d1c2cd019e4a8 |
| S-Q-0.png | 320×448 | b54b1261f51ffad2898a74179c112de01096dcceb72adbd9a53686c9056f33dd |
| S-Q-180.png | 320×448 | 28593f31cae8254aa6af4c91d96444eddd477f5f165de579c234f2610908c3d5 |
| contact-sheet-0deg.png | 1096×468 | e7ea1468bba4b9b08b2b99a2b4ec6f8c6eea31ba680f3c1a636caaee734d5399 |

H-A-0 and H-A-180 are byte-identical, as are D-K-0 and D-K-180. This agrees with the 180° rotational symmetry of the heart and diamond layers.

## Visual inspection

The image reader opened five PNGs (contact-sheet-0deg, C-7-0, C-7-180, H-A-0, H-A-180). The observations were as follows.

- The contact sheet has 13 columns × 4 rows, gray dividers, and white card backgrounds. Each card has two square 7×7-module markers with black and white cells inside a black border. Row 1 (hearts) has markers at top left (TL) and bottom right (BR), row 2 (diamonds) at top right (TR) and bottom left (BL), row 3 (clubs) at TR and BR, and row 4 (spades) at TL and BL. The remaining corners are white.
- Each single-card image has two markers on an otherwise white field. The two heart images appear identical at TL and BR, consistent with their matching hashes.
- For the club images at 0°/180°, I could not tell visually whether the attachments appeared in the order I had labeled them. One had markers in the two left corners (TL, BL), the other in the two right corners (TR, BR). I used a pixel check to identify the 0° image.
- Pixel check (read-only temporary Node script, not retained, results in section 10 of m3-test-output.txt): dark pixels per quadrant. C-7-0 = TR 2496, BR 2496, TL/BL 0. C-7-180 = TL 2496, BL 2496, TR/BR 0. H-A-0 and H-A-180 = TL 2304, BR 2304. D-K-0 = TR 2560, BL 2560. S-Q-0 = TL 2368, BL 2368. S-Q-180 = TR 2368, BR 2368. These counts match the design (♥ TL+BR, ♦ TR+BL, ♣ TR+BR, ♠ TL+BL, with opposite corners at 180°).
- The single spade S-Q and diamond D-K images were checked only through the counts above. I did not open them.

## 180° content rules (as asserted by the tests)

- ♥: The layer has 180° rotational symmetry (derived using R180). TL+BR remain occupied at 180°.
- ♦: The layer has 180° rotational symmetry. TR+BL remain occupied.
- ♣: The layer has reflection symmetry across the horizontal axis (derived using Fh). TR+BR at 0° move to TL+BL at 180°. Each corner's content follows `visible[Y] = R180(printed[opposite(Y)])`.
- ♠: The layer has reflection symmetry across the horizontal axis. TL+BL at 0° move to TR+BR at 180°.
- ♣ at 0° and ♠ at 180° share TR+BR. ♣ at 180° and ♠ at 0° share TL+BL. Patterns at shared corners differ by at least 5 bits.

## Verified results and remaining assumptions

Verified results include the 108 passing tests above, a passing type check, byte-identical codebook regeneration, a PASS from the independent verifier, deterministic sample output over four renders, and quadrant placement in the sample PNGs.

Remaining assumptions and items outside this milestone's checks:
- Image decoding (detection, homography, and reading the 5×5 grid) does not yet exist (milestone 4).
- The milestone 5 slot table and reflection decision logic were outside scope.
- No physical print or camera results are available.
- Card dimensions (40×56 modules) and margins are prototype values.
- The renderer and tests were written within the same project, so this verification was not independent.
- Descriptions based on test names use the names in the verbose output. Individual assertions were not reviewed line by line in the test code.

## git status --short (no commit)

```
M  .gitignore
MM .kiro/specs/qroker-game/tasks.md
MM .kiro/specs/qroker-game/tasks.meta.json
M  docs/optical/results/bound.json
M  docs/optical/results/bound.md
A  docs/optical/results/codebook-verification.json
A  docs/optical/results/codebook-verification.md
A  docs/optical/results/m2-final-output.txt
A  docs/optical/results/m2-report.md
A  docs/optical/results/m2-test-output.txt
MM package.json
A  scripts/verify-codebook.ts
A  src/optical/verify-codebook.test.ts
A  src/optical/verify-codebook.ts
?? docs/optical/results/m3-test-output.txt
?? docs/optical/samples/
?? scripts/png.ts
?? scripts/render-samples.test.ts
?? scripts/render-samples.ts
?? src/optical/fragments.test.ts
?? src/optical/fragments.ts
?? src/optical/render.test.ts
?? src/optical/render.ts
```

(m3-report.md was created after this list was produced and therefore does not appear in it.)
