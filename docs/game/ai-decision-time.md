# AI decision time (task 12.4, requirement 11.5)

This file records one measurement of the time an AI decision takes. It is a record of a single development machine,
not a benchmark and not a claim about real use.

**These are synthetic, headless Node measurements on the development machine. They are NOT real user gameplay, and they
are NOT browser or mobile benchmarks.**

## Limit

Requirement 11.5: a test measures the elapsed time of one AI decision and fails if one decision takes longer than
3000 ms. The requirement does not restrict the limit to one tier, so the test applies it to every strategy returned by
`registeredDifficulties()` (today BEGINNER and ADVANCED; EXPERT is included automatically once it is registered, task
23.3). The limit was not changed and no delay was added.

## What is measured

The example test `AI decision time` in `src/game/ai/ai.properties.test.ts` calls `performance.now()` around one
`choosePlacement` or `chooseGuesses` call. Building the `PlayerView` and checking the action with `reduce` are outside the
timed region. There is no warm-up and no repetition, so the first calls of a tier include JIT cost.

Samples per strategy: 81 decisions.

- 50 placement decisions: the 25 largest enumerations of each visibility mode (OWNER_ONLY and FACE_UP), taken from the four
  largest of each of 16 complete games (fixed seeds 5000..5015, several code biases). The largest enumeration is 144
  candidates (hand cards x legal cells x 2 orientations).
- 31 guess decisions in `GUESS_COLLECT`: batches of two codes from the hand-picked fixture (both modes, every acting seat,
  with 0 and with 2 earlier submissions), batches of two codes from random play, and every 40th guess state of the corpus.

Both visibility modes occur among the placements and among the guesses.

## Machine and conditions

| Item | Value |
| --- | --- |
| CPU | Intel Core i5-10400F @ 2.90 GHz, 6 cores, 12 logical processors |
| Memory | 39.9 GB (18.6 GB free at the start of the session) |
| OS | Windows 11 Pro, 10.0.26300 |
| Node.js | v24.20.0 |
| Vitest | 5.1.0 |

CPU load (`Win32_Processor.LoadPercentage`, system wide) sampled with PowerShell immediately before and after each of the
three recorded runs, and one series of six samples about a minute before the first run:

| Moment | Load |
| --- | --- |
| six samples before run 1 (1 s apart) | 10, 19, 9, 11, 15, 17 % |
| run 1: before / after | 2 % / 4 % |
| run 2: before / after | 4 % / 12 % |
| run 3: before / after | 7 % / 10 % |

Android emulator state during the three recorded runs: no `emulator` or `qemu-system` process was running (checked with
`Get-Process` after run 3). `adb` and two `java` processes (Gradle or IDE daemons) were present.

Earlier in the same session, before this measurement, the load was 87 to 94 % (five samples) and an `emulator` and a
`qemu-system-x86_64-headless` process were running. The test was also executed several times in that period while the
test file was being developed. The load was not sampled during those runs, so they are not part of the table below. Their
maximum was 1.5 ms for ADVANCED and 0.05 ms for BEGINNER, far under the limit. No run, loaded or idle, came near
3000 ms, so no failure had to be classified as environmental.

## Results (milliseconds, three runs)

Each cell is the value printed by the test (`n`, `max`, `median`, `p95`; p95 is the nearest-rank 95th percentile of the 81
samples).

| Tier | Run | n | max | median | p95 |
| --- | --- | --- | --- | --- | --- |
| BEGINNER | 1 | 81 | 0.135 | 0.018 | 0.036 |
| BEGINNER | 2 | 81 | 0.264 | 0.019 | 0.060 |
| BEGINNER | 3 | 81 | 1.283 | 0.019 | 0.033 |
| ADVANCED | 1 | 81 | 1.262 | 0.204 | 0.360 |
| ADVANCED | 2 | 81 | 3.136 | 0.202 | 0.396 |
| ADVANCED | 3 | 81 | 1.157 | 0.199 | 0.306 |

Split by decision kind (same runs; placement n = 50, guess n = 31):

| Tier | Run | placement max / median / p95 | guess max / median / p95 |
| --- | --- | --- | --- |
| BEGINNER | 1 | 0.135 / 0.019 / 0.042 | 0.073 / 0.002 / 0.020 |
| BEGINNER | 2 | 0.141 / 0.020 / 0.068 | 0.264 / 0.002 / 0.018 |
| BEGINNER | 3 | 0.142 / 0.020 / 0.033 | 1.283 / 0.002 / 0.078 |
| ADVANCED | 1 | 1.262 / 0.216 / 0.381 | 0.416 / 0.018 / 0.104 |
| ADVANCED | 2 | 3.136 / 0.224 / 0.442 | 0.450 / 0.016 / 0.080 |
| ADVANCED | 3 | 1.157 / 0.216 / 0.342 | 0.444 / 0.019 / 0.084 |

The slowest single decision of the three runs is 3.136 ms (ADVANCED, a placement, run 2), about 0.1 % of the 3000 ms
limit. The isolated maxima of 1.28 ms (BEGINNER guess, run 3) and 3.1 ms (ADVANCED placement, run 2) are single
outliers whose cause was not investigated; the medians and the 95th percentiles are stable across runs.
The test passed in all three runs (`max < 3000 ms` for every registered tier).

## How to reproduce

```
npx vitest --run src/game/ai/ai.properties.test.ts -t "decision time" --reporter=verbose
```

The line `[12.4 timing] tier=... n=... max=... median=... p95=...` is printed once per registered tier. With the default
reporter, the output of a passing test is not shown in a non-interactive terminal; `--reporter=verbose` (or
`--disableConsoleIntercept`) shows it. The numbers above depend on the machine and its load at the time and will differ
on another computer.
