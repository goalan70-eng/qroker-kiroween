# Synthetic reader audit of all 52 cards on Android

Codex used the existing Android v0.1.0 reader (`src/OpticalReader.java`) and the 30 mm assembled layout. The 32 groups comprised one existing print example, 13 groups of four cards of the same rank, 13 mixed-rank groups, and five clubs-and-spades-only groups. Each card occupied a permitted quadrant. The test rendering of the print example matched the 30 mm layout’s `assembled` layer byte for byte.

## Reader results

| Synthetic condition | All four card IDs and sum correct | One card missing: rejected | All cards missing: rejected |
|---|---:|---:|---:|
| Front view, 151 pixels | 32/32 | — | — |
| 60° in low light, 151 pixels | 64/64 | 128/128 | 32/32 |
| 60° in low light, 96 pixels | 64/64 | 128/128 | 32/32 |

At each low-light width, the reader identified all 52 IDs correctly at least once. Across the two widths it read the clubs-and-spades-only groups correctly in 20/20 cases. Complete groups produced zero incorrect IDs or sums, and incomplete groups produced zero false accepts. The missing-card cases removed one card at a time from each of the four positions. All 19 existing JVM scoring and reader regression checks also passed.

The inputs were synthetic 1,280×960 luminance frames. Widths are front-view equivalents. The straight edges of adjoining cards touched, with the existing rounded-corner gap at the center. Camera position, in-plane rotation, small position shifts and noise varied with a fixed seed (26112052 plus a case-specific offset). The low-light model used 8-bit luminance levels of 94 for the card, 10 for ink and approximately 64 for the background, with noise up to ±8 and subpixel sampling. The simulation omitted surface patterns, gloss and reflections. Physical tests, including capture distance, recognition rate and removal latency, remain pending.

## Android app run

On a dedicated Android API 36 emulator, the test confirmed airplane mode and disabled Wi-Fi, then fed synthetic 60° low-light footage into the existing APK through the rear camera.

1. The app read 5♥, 9♦, J♣ and 2♠ and opened the input with the answer hidden. Submitting 27 recorded an answer of 27 and +10 points.
2. On two consecutive checks of a scene with one card missing, the guess field was absent and the previous 10 points remained.
3. For the next group, four kings, submitting 49 recorded an answer of 52 and +3 points, bringing the total to 13.
4. After a forced process stop and relaunch, both guesses and the total of 13 points were present.

The first automation attempt timed out while checking whether the value remained in the field. The procedure was adjusted to verify focus before entering digits, then rerun to verify the four behaviors above. Log timestamps measure elapsed time from the start of automation and cannot establish camera recognition or removal latency.

## Reproduction

On Windows with the Android SDK and the existing local 30 mm assets, run these commands from the Android companion directory.

```powershell
$qrSource = '<absolute path to the local 30 mm assets>'
$qrJava = 'D:/Android/Android Studio1/jbr/bin'
New-Item -ItemType Directory -Path build/deck-classes,build/generated -Force | Out-Null
python generate-layout.py $qrSource build/generated/Layout30.java
python tests/generate-deck-fixtures.py $qrSource build/deck-audit
$qrOptics = '../screen-playtest/optics'
& "$qrJava/javac.exe" -encoding UTF-8 -d build/deck-classes src/OpticalReader.java build/generated/Layout30.java "$qrOptics/ExtraBars.java" "$qrOptics/ErasureDecoder.java" "$qrOptics/TrialWords.java" tests/DeckAudit.java
& "$qrJava/java.exe" -Xmx512m -cp build/deck-classes com.qroker.offline.DeckAudit build/deck-audit
& "$qrJava/java.exe" -cp build/deck-classes com.qroker.offline.DeckAudit build/deck-audit --emulator
python tests/make-emulator-clip.py build/deck-audit
```

For the emulator stage, use the dedicated API 36 AVD `QRokerAudit` on port 5560. Attach the generated clip with `-camera-back videofile:<absolute path to score-sequence.avi>`. Start with an app total of 0 points. After boot, run `./tests/emulator-deck-audit.ps1` in PowerShell 7. The clip shows a complete group for 45 seconds, one card missing for 20 seconds, and a different complete group for 35 seconds.

- [480 individual results (TSV)](results/results.tsv) and [32 groups (TSV)](results/groups.tsv)
- [Emulator run log](results/emulator-results.txt)
- 30 mm layout SHA-256 `2c3db6c925c50c6b3b7e85e3e735061d0540a42bc903bf3a7d45171059fdda52`
- 52-card codebook SHA-256 `3a1ee58f7292674b30b3604feed1194be779b0eb0f9dc3deb56941a26288d2bb`
- Android APK SHA-256 `9a6284fd0fc7d108b6233b59582916959c27f895a1afc364b1190019906f1cd6`

## Additional checks in 0.2.23: distinguishing ranks and suits

The composite code identifies the rank (A–K) and suit (♥, ♦, ♣ or ♠) of each card. The three groups below have identical ranks in all four positions and the same total. Codex assembled images from the print PDF artwork with a 1.5 mm margin and tested them with the 0.2.23 reader and scoring code. Each group was recorded as a separate round. The test used no photographs of physical cards.

| Group | Top row, left to right | Bottom row, left to right | Sum | Decoded card IDs, ascending |
| --- | --- | --- | ---: | --- |
| Baseline | 5♥ · 9♦ | J♣ · 2♠ | 27 | 4, 21, 36, 40 |
| One suit changed | 5♣ · 9♦ | J♣ · 2♠ | 27 | 21, 30, 36, 40 |
| All four suits changed | 5♣ · 9♠ | J♦ · 2♥ | 27 | 1, 23, 30, 47 |

**Duplicate detection uses the four card IDs already scored in the game.** After the baseline scored 0 points, rotating the entire group 180° produced the same four IDs and was treated as a duplicate. A group that was locked and then cancelled could still be scored. Replacing the baseline 5♥ with 5♦ in the same position left a fragment missing from the center code and the reader rejected it.

The card IDs and sums in the table are expected test values. The 0.2.23 scoring screen and round history show the player’s guess and points earned. They keep the card names and correct sum hidden.
