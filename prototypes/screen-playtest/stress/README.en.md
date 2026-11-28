# Synthetic stress tests for the revised grid layout

On 2026-11-21, Codex tested the screen reader from `aa0f384`. With the marker size at 30 mm and the Joker layout held fixed, the test compared the previous two-observation grid with the revised grid, which adds a final observation at the center. Both layouts used the same card arrangements, perspective transforms, lighting, noise and random seed (`26112052`).

| Synthetic condition | Previous layout | Revised layout |
|---|---:|---:|
| All four card IDs and sum matched | 1,198/1,394 | 1,204/1,394 |
| 60° in low light with partial glare | 24/34 | 30/34 |
| 60° in low light with motion blur | 23/34 | 23/34 |
| 45° with a strong shadow | 0/34 | 0/34 |
| Glare covering a large part of the marker | 0/34 | 0/34 |
| Severe motion blur | 0/34 | 0/34 |
| Rejected inputs with a missing or occluded card | 96/96 | 96/96 |

Neither layout returned an incorrect card identity in its 1,490 cases. All six newly successful reads came from the 60° low-light scenes with partial glare. Every scene the previous layout read correctly remained readable.

The test also used decoded web-game captures to check guess confirmation. No stale submission was saved when a card was removed, a different group with the same sum appeared, a group with a different sum appeared, or the original group returned after a missing confirmation frame. A fresh, valid submission scored successfully and the score could be restored from the record file.

These results cover synthetic frames and the JVM scoring and frame-matching logic. Physical-camera and printed-card tests, as well as Android UI response-time measurements, are separate work.

## Reproduction

Build Android as described in the [parent README](../README.md) to prepare the JVM classes for the revised reader. After building the web app, run the browser tests in normal and marker-isolation modes.

```powershell
node ./verify-web.cjs
node ./verify-web.cjs --isolate-marker
```

The local directories for the previous grid (`grid-extension`) and the revised one (`center-grid`) must each contain `frames/manifest.tsv` and the rendered PNGs. Set `-PriorClasses` to `grid-extension/classes`, the compiled Android reader for the previous grid.

```powershell
./stress/run.ps1 -PriorDeck $priorDeck -PriorClasses $priorClasses -CurrentDeck $currentDeck
```

The run writes detailed reads for each layout, the comparison table (`comparison.tsv`), changed cases (`changed-cases.tsv`) and the scoring log (`scoring.txt`) to `evidence/stress/`. The local artwork, screenshots and camera inputs are kept separately for reproduction.
