# Milestone 1 report: deterministic 52-card codebook

Raw output: `m1-test-output.txt` (overwritten in this run; the earlier 04:20 output was stale because five source files were modified at 04:22:20).

## Commands and exit codes

| command | exit code | result line |
|---|---|---|
| `npm test` (run 1) | 0 | 4 files passed, 22 tests passed |
| `npm run check:codebook` | 0 | regenerated codebook is byte-identical to codebook.v1.json |
| `npm run verify:bound` | 0 | all stated claims matched |
| `npx tsc --noEmit` | 0 | no output |
| `npm test` (run 2) | 0 | 4 files passed, 22 tests passed |

## Test counts

The default reporter prints only totals (4 files, 22 tests). Per-file counts below come from one extra `vitest --run --reporter=verbose` run (3rd run, not saved in the raw file; also 4 passed / 22 passed).

| file | tests |
|---|---|
| src/optical/smoke.test.ts | 2 |
| src/optical/codebook.test.ts | 10 |
| src/optical/transforms.test.ts | 9 |
| scripts/verify-bound.test.ts | 1 |
| total | 22 |

## Codebook facts (from src/optical/codebook.v1.json)

- version: codebook.v1
- seed: 1364348747
- attemptsUsed: 94 (attemptCap 2000000)
- dId: 5, dSelf: 6
- weightRange: [9, 16]
- internal sha256 field: a6974f3491efbd5aec87bb00807c113962015838c9b74d0df9863f38fdc29a74
- file SHA256 (Get-FileHash, distinct from the internal field): 515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4

## Bound: measured vs claimed (from bound.json; runtime 1.857 s)

| field | claimed | measured | match |
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

## Notes on the 04:22:20 modification

`codebook.ts`, `prng.ts`, `smoke.test.ts`, `transforms.ts`, `scripts/generate-codebook.ts` (and `results/.gitkeep`) share one timestamp. Their content is LF-only with no BOM, `tsc --noEmit` passes, and all tests and the byte-identity check pass against them. The files are untracked in git, so no diff exists to show what changed. The cause is not determined; it looks like a bulk touch or rewrite (`.gitkeep` is empty and also changed). Nothing was edited in this run.

## Scope notes

- `transforms.ts` and `transforms.test.ts` were produced early, inside Milestone 1. The task 2.x boxes in tasks.md remain unticked.
- The bound verifier here is `scripts/verify-bound.ts`, which does not import from `src/optical`.

## Not yet covered

- The independent Milestone 2 codebook verifier (working from the frozen JSON and rasterized fragments).
- Pixel-level suit layer symmetry.
- Image decoding.
- Real-camera behavior.
