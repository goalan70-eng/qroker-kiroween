# Codebook verification

- Verifier: `verify-codebook.v1`
- Input: `src/optical/codebook.v1.json`
- File SHA-256: `515eceb318648c14a47574496788236a2b1bbdfc7062387db09303cb717cc2d4`
- Result: **PASS**

## Measured

- Cards: 52, templates: 416, pairs: 86320
- Minimum pair distance: 5
- dId: 5, dSelf: 6
- Base weight: min 9, max 16

## Checks

| Check | Result | Detail |
| --- | --- | --- |
| shape | ok | required fields present with correct types |
| card-keys | ok | 52 canonical keys, canonical cardOrder |
| pattern-values | ok | all values are integers in [0, 2^25) |
| base-distinct | ok | 52 distinct base patterns among 52 valid |
| weight-range | ok | weights in [9,16]; measured min=9 max=16 |
| transform-self-check | ok | 8 maps are bijections on 25 cells; closed under composition; every map has an inverse |
| templates-416 | ok | 416 distinct templates |
| min-distance | ok | all 86320 pairs have distance >= 5; min=5 |
| d-id | ok | measured dId=5 (required >= 5) |
| d-self | ok | measured dSelf=6 (required >= 5) |
| metadata-agreement | ok | stored dId, dSelf, weightRange agree with measurements; attempts within cap |
| sha256 | ok | sha256 matches (a6974f3491efbd5aec87bb00807c113962015838c9b74d0df9863f38fdc29a74) |
| suit-fragments | ok | second fragments (R180 for H/D, Fh for C/S) differ from P by >= 5 and lie in the orbit |

## Metadata agreement

| Field | Stored | Measured | Match |
| --- | --- | --- | --- |
| dId | `5` | `5` | yes |
| dSelf | `6` | `6` | yes |
| weightRange | `[9,16]` | `[9,16]` | yes |
| sha256 | `"a6974f3491efbd5aec87bb00807c113962015838c9b74d0df9863f38fdc29a74"` | `"a6974f3491efbd5aec87bb00807c113962015838c9b74d0df9863f38fdc29a74"` | yes |

## Distance histogram (all pairs)

| Distance | Pairs |
| --- | --- |
| 5 | 136 |
| 6 | 512 |
| 7 | 1128 |
| 8 | 2968 |
| 9 | 5080 |
| 10 | 8416 |
| 11 | 11664 |
| 12 | 13600 |
| 13 | 13480 |
| 14 | 11144 |
| 15 | 8376 |
| 16 | 5180 |
| 17 | 2808 |
| 18 | 1188 |
| 19 | 464 |
| 20 | 104 |
| 21 | 64 |
| 22 | 8 |

## Not covered

- Image decoding (rasterization, thresholding, grid sampling).
- Pixel-level symmetry of the suit layer (rasterized fragments).
- Real cameras, lighting, blur, and perspective distortion.
