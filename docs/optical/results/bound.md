# Codebook capacity bound (exhaustive enumeration)

Enumerated all 2^25 patterns independently of `src/optical`. Runtime: 1.7 s.

Overall: all stated claims matched.

| field | expected (claim) | measured | match |
|---|---|---|---|
| balanceFail | 3,615,562 | 3,615,562 | yes |
| selfDistanceFail | 7,152,896 | 7,152,896 | yes |
| eitherFail | 9,456,896 | 9,456,896 | yes |
| F | 24,097,536 | 24,097,536 | yes |
| V4 | 15,276 | 15,276 | yes |
| bound | 198 | 198 | yes |
| d6Bound | 45 | 45 | yes |
| d7Bound | 7 | 7 | yes |
| perTransform.R90 | 74,624 | 74,624 | yes |
| perTransform.R270 | 74,624 | 74,624 | yes |
| perTransform.R180 | 647,168 | 647,168 | yes |
| perTransform.Fh | 1,835,008 | 1,835,008 | yes |
| perTransform.Fv | 1,835,008 | 1,835,008 | yes |
| perTransform.Dm | 1,835,008 | 1,835,008 | yes |
| perTransform.Da | 1,835,008 | 1,835,008 | yes |

Bound = ceil(|F| / (8 * V(25, d-1))). Measured |F| / V:
- d=5: |F| = 24,097,536, V(25,4) = 15,276, bound 198
- d=6: |F| = 24,097,536, V(25,5) = 68,406, bound 45
- d=7: |F| = 13,746,176, V(25,6) = 245,506, bound 7
