# QRoker Scorekeeper for Android

[한국어 안내](README.ko.md)

Use the Android app to keep your own score when playing with QRoker-marked cards. To try the game without cards or a second device, [play in your browser](https://goalan70-eng.github.io/qroker-kiroween/).

## Install on Android 8 or later

For a first installation, download and open the [standard APK (0.2.27)](https://github.com/goalan70-eng/qroker-kiroween/releases/download/kiroween-2026-final/QRoker-Offline.apk). The app opens in English. Use **⋮ → Language** on the scoreboard to switch between English and Korean. Tap **?** for the illustrated rules.

If you already have scores on your phone, update over the installed app to keep them. If Android reports a signature mismatch, leave the app installed and use the [archive-signed update](https://github.com/goalan70-eng/qroker-kiroween/releases/download/kiroween-2026-final/QRoker-Offline-ArchiveUpdate.apk). Uninstalling clears local scores.

## Score your first code

If your demo pack includes `QRoker-completed-codes-A4.pdf`, open page 1 on a second screen or print that page on A4 at 100%. The four cards are already arranged. Start at step 2 and enter **27** to earn **10 points** on a fresh scorecard.

1. Arrange four QRoker cards so their marked corners form a square at the center. An ordinary deck has no QRoker markers.
2. On **My scores**, tap **Scan code** and allow camera access. Fit the whole marker inside the white frame, center the crosshair on the join, then tap **Lock code**.
3. Once the code is locked, put the phone down. Enter a whole-number guess from **4 to 52** and tap **Score**. For a different group, tap **Rescan** before scoring.
4. Tap the new round to see your guess and points. An exact guess earns **10**. Missing by one to five earns **5, 4, 3, 2 or 1** respectively. The app keeps the answer and card identities private.

Each set of four cards scores once per game on your scorecard. A different set can score even if its sum is the same. **New game** clears your rounds and the list of scored sets after confirmation. For a worked example using six cards and two equal sums, see the [print and scan checklist](../../docs/validation/offline-reader-real-device.md).

The two release APKs provide the same features and differ only in signing key. Locking a code does not create a round. If a save fails, you can retry with the same guess. Reordering the same four cards still counts as the same set. For example, with J♣ and 2♠ in the bottom row, a top row of 5♥ and 9♦ and a top row of 9♥ and 5♦ form distinct groups. Each sums to 27 and can be scored separately. A miss by more than five earns 0 points. The app keeps a personal scorecard. Players at the table determine the winner and when to stop.

## Build from source

On Windows, install JDK 21, Android SDK Platform 36.1, Build Tools 36.1.0 and Python 3. From the repository root, adjust the two paths to match your installation and run:

```powershell
cd prototypes/android-offline-companion
.\build.ps1 -Sdk 'C:\Android\Sdk' -Jdk 'C:\Java\jdk-21'
```

The build uses the included optical coordinates, runs decoder checks and writes `dist/QRoker-Offline.apk`. A new local signing key produces a separate build that cannot update a release-signed installation. See the [verification history by version](#verification-history-by-version) for earlier emulator and synthetic results.

The [judging source](https://github.com/goalan70-eng/qroker-kiroween/tree/kiroween-2026-final) includes the optical coordinates. The optional `OfflineTest` requires separate camera fixtures supplied with `-Source`. The [physical-card checklist](../../docs/validation/offline-reader-real-device.md) gives expected results for scanning, duplicates and restart. All five printed-card observations for 0.2.27 were still untested in this record.

## Verification history by version

These observations belong to the versions named below. Starting with 0.2.23, the player locks a code with a button before entering a guess.

**0.2.12.** The app hides the total while saved history is unreadable and reloads it on return. On an Android API 36 emulator, the test temporarily made the file unreadable and then restored a 10-point record. The same scoreboard displayed 10 points and re-enabled scanning. When another scoreboard scored a round first, the next camera read updated the open guess dialog from round 1 to round 2 and retained the entered value of 27.

**0.2.11.** After opening the guess dialog, the app enables input once a fresh image confirms the same group. Camera previews continue, while captures for decoding are paced to match processing speed. On an Android API 36 virtual rear camera showing a group worth 27, each trial started by relaunching the app. The first valid guess earned 10 points in 1 of 4 runs on 0.2.10 and 8 of 8 runs on 0.2.11. The revised build was tested four times by entering 27 directly and four times by entering 53, observing the warning and correcting it to 27. This comparison used no physical cards or phone camera.

The same 0.2.11 APK, using its Korean UI, played back scenes in which a card was removed, replaced with a different group, and the marker was occluded. The previous input cleared. After the cards reappeared and the popup was cancelled, the scorecard still showed 0 rounds and 0 points.

**0.2.10.** If another scoreboard changes the record after the new-game confirmation opens, the dialog shows the latest record and asks for confirmation again. On an Android API 36 emulator, adding a round to a 10-point game preserved 2 rounds and 20 points in the save file. Starting another game and scoring the same group again preserved 1 round and 10 points. On an unchanged scoreboard, confirming a new game reset the record to 0 rounds and 0 points.

**0.2.9.** Saving requires both the confirmation image and the success notification for that capture. In a JVM test that delivered a capture failure after decoding the image, 0.2.8 saved 10 points and 0.2.9 retained 0 entries and 0 points. A retried capture scored exactly once. On an Android API 36 emulator, the test updated over 0.2.8 and read four synthetic cards through the virtual rear camera. The guess was 27, the answer was 27 and the total was 10 points.

**0.2.8.** If recognition of the same group is interrupted for at least 1 second, the previous guess is cancelled. On an Android API 36 emulator with recognition results delayed by 1.15 seconds, 0.2.7 scored the previous guess for 10 points. In 0.2.8 the field cleared and the total stayed at 0. When camera access could only be granted in system settings, the settings button opened the app info screen. There were no incorrect card accepts across 336 synthetic rotation cases and 144 horizontal motion-blur cases. Of 117 complete groups with blur, the reader rejected 86.

**0.2.4.** An Android API 36 emulator running 0.2.4 received a decoded sum of 27. Entering 270 and confirming produced a range error and left the total at 0. Delivering a confirmation capture failure closed the dialog, and the next read opened an empty field. A newly entered 27 scored 10 points once, even when a failure callback from the earlier request arrived late. All 80 regression checks passed, including reuse of a score backup from an older version. The 336 synthetic rotation and 144 horizontal motion-blur cases matched 0.2.3.

**0.2.3.** In each of three cases, the correct-answer field was replaced with a wrong number, text or an empty value. All three recovered two rounds totaling 20 points. With recovery writes blocked, three fresh processes could each display 20 points and only one original backup existed. After writes were re-enabled, reopening saved the recovered copy. In simulations where 0, 2, 3, 4 or 30 later recognition results arrived ahead of the confirmation-frame result, the exact frame scored 10 points only once in every case. Results for the same 336 synthetic rotation cases and 144 horizontal motion-blur cases also matched the earlier run.

**0.2.2.** All 64 synthetic-frame and score-record checks passed. With camera capture notifications arriving early or late, a group disappearing or changing during confirmation cancelled the previous guess. Rounds confirmed concurrently from two scoreboards were both saved, while the same group counted only once. On an Android API 36 emulator, both the standard APK and the archive-signed APK were installed over their respective 0.2.1 versions. The existing 10-point round persisted in each case. On the standard APK, dismissing the camera permission prompt with Back and requesting access again in the app reopened the system prompt.

**0.2.1.** The reader was tested on 1280×960 synthetic camera frames. Across 16 frames with a group totaling 28 in the center and one totaling 27 to the side, it read 28 every time. It rejected all 16 frames containing only the off-center 27. If the center group disappeared before confirmation, no record was added. With cards 59 pixels wide and Gaussian blur of 0.7 pixels, 12 of 13 groups were read. At a blur of 1.2 pixels and the same size, all were rejected. Across 1,105 aimed double-sided artwork cases, all 442 front and left-right-swapped back cases read correctly, and all 663 fixed-position back and missing-card cases were rejected. This test did not measure the physical-phone success rate.

**0.2.0.** The reader decoded the same group from four main web-game captures: the default board, a 2× board and two magnifier sizes. All four returned the same four card IDs and sum of 28. Across 17 synthetic conditions using double-sided artwork with a 1.5 mm margin, it read 219/221 fronts and 221/221 backs with left and right cards swapped in each row. The two front rejections occurred under a central shadow. It rejected all 221 fixed-position backs and all 442 missing-card cases. The existing 30 mm artwork also matched expectations on 160 complete groups and 320 missing-card or empty scenes. These figures measure image decoding. Physical-phone and printed-card read rates require separate measurements.

The reference answer for the 60° low-light synthetic frame is 27. Regression tests cover the original frame and quarter-turn rotations, limited-range luminance, removing one card from the same input, and saving, reloading and deleting scores. Recognition rates and decoding latency for physical prints on different phones are separate test items.

**2026-11-20 verification.** All 19 JVM regression checks passed. An Android API 36 emulator in airplane mode with Wi-Fi off received a synthetic scene through its rear camera. The answer stayed hidden before the guess. Submitting 27 recorded the answer of 27 and 10 points. After a forced stop and restart, both the total and history persisted. Confirming deletion reset the total to 0. The marker in the synthetic scene was repositioned to fit the test camera’s field of view.

[Handoff and Codex follow-up](../../docs/optical-v2/android-prototype-handoff.en.md) · [52-card audit and reproduction](tests/deck-audit-report.en.md) · [Guess cancellation and duplicate scoring](tests/guess-flow-report.en.md)
