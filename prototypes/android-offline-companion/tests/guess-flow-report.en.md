# Cancelling guesses and preventing duplicate scores on Android

The test exercised the existing native app’s camera and UI on an offline Android API 36 emulator. The video used two synthetic groups from the existing 30 mm marker layout, with sums of 27 and 52. Colored cues outside the marker identified the current scene so the test could check the actual input and app state together without estimating camera playback time.

| Scenario | Observation |
|---|---|
| Remove one card while entering a guess | Passed. After 27 was entered, the field and confirm button closed. Tapping the former button position and sending Enter left 0 entries and 0 points. |
| Replace the four cards while entering a guess | Passed. The previous guess of 26 cleared. Pressing confirm with an empty field for the new group left the round number at 1 and the score at 0. |
| Partially cover the marker during entry, then uncover it | Passed. After 49 was entered, covering part of the marker closed the field. The same group reappeared with an empty field, 0 entries and 0 points. |
| Show the same group again and restart the app process | Passed. An exact guess for a sum of 27 recorded 1 entry and 10 points. After removal and re-exposure of the same group, and again after a forced stop and relaunch, the field remained closed and the record stayed at 1 entry and 10 points. |

The tested APK had SHA-256 `7da19fe4d390eabddf9eb44ff4c1074cc36f4a819bb2f13ef9331af3de81bb36`. The 19 existing JVM checks also passed. After the first three observations, another Android test took the foreground on the same emulator and interrupted the run. The final scenario was verified using an isolated ADB server and device. The automation was adjusted to send input events consecutively. This verification used the existing app source without modification.

Local build artifacts from this emulator run

- Removal, replacement and occlusion log (`../build/guess-flow/emulator-guess-flow.txt`) and view hierarchy after uncovering the marker (`../build/guess-flow/recovered-no-score.xml`)
- Duplicate-scoring log (`../build/guess-flow/emulator-duplicate.txt`) and view hierarchy after restart (`../build/guess-flow/duplicate-after-restart.xml`)

## Reproduction

From the Android companion directory, follow the setup commands in the [52-card audit](deck-audit-report.en.md) to generate `build/generated/Layout30.java` and `build/deck-classes`. Prepare an API 36 test AVD named `QRokerGuessIsolated` with storage separate from user records. The verified display was 720×1440 at 320 DPI. Start with 0 guesses in the app.

```powershell
python tests/generate-deck-fixtures.py $qrSource build/guess-flow
& "$qrJava/java.exe" -cp build/deck-classes com.qroker.offline.DeckAudit build/guess-flow --guess-flow
python tests/make-emulator-clip.py build/guess-flow --guess-flow
```

Use a separate ADB server and ports with PowerShell 7.4 or later.

```powershell
$qrAdb = 'D:/Android/Sdk/platform-tools/adb.exe'
$qrEmu = 'D:/Android/Sdk/emulator/emulator.exe'
$qrClip = (Resolve-Path 'build/guess-flow/guess-flow.avi').Path
$env:ANDROID_ADB_SERVER_PORT = '5062'
$env:ADB_LOCAL_TRANSPORT_MAX_PORT = '5553'
& $qrAdb -P 5062 start-server
Start-Process -FilePath $qrEmu -ArgumentList @('-avd','QRokerGuessIsolated','-no-window','-no-audio',
    '-gpu','swiftshader_indirect','-no-snapshot','-no-metrics','-ports','5582,5623',
    '-camera-back',"videofile:$qrClip",'-camera-front','none') -WindowStyle Hidden
# Run after the test device has booted.
& $qrAdb -P 5062 connect 127.0.0.1:5623
./tests/emulator-guess-flow.ps1
./tests/emulator-guess-flow.ps1 -DuplicateOnly
```

The script checks the device name, airplane mode and disabled Wi-Fi, then sends inputs to the app over ADB. View hierarchies and execution logs are written to `build/guess-flow/`. The emulator and footage are local test assets.

This test checks cancellation after the recognition result reaches the screen. Physical-phone recognition rates for printed cards and the delay from a scene change to visible removal remain unmeasured.

## Submitting before the recognition result arrives

A JVM test kept the previous recognition result on screen and delayed the response for a new scene. Before the fix, both removing one card and replacing the group with four different cards caused the previous sum of 27 to score 10 points.

Codex changed the app to request a Camera2 capture after confirmation. Only frames from the camera-reported start of the new exposure onward received the submission number. The score was saved only if the frame confirmed the same four card IDs present when the guess was made. An unreadable frame, a different group or a check taking longer than 2 seconds cancelled the submission. Normal scoring and the local record format stayed the same. [Camera2 capture-start callback](https://developer.android.com/reference/android/hardware/camera2/CameraCaptureSession.CaptureCallback#onCaptureStarted(android.hardware.camera2.CameraCaptureSession,%20android.hardware.camera2.CaptureRequest,%20long,%20long))

All 33 JVM checks passed on the revised build. They checked that removing or replacing cards did not save the old result, that late callbacks from an earlier capture or submission did not validate a new submission, and that timeouts and repeated confirms did not duplicate scores. On an offline Android API 36 emulator, `./tests/emulator-guess-flow.ps1 -DuplicateOnly` confirmed a sum of 27 from a new frame. The app recorded 1 entry and 10 points, which persisted after the same group reappeared and after restart. The verified APK had SHA-256 `27b2fc77445d57bdca70cf31bc3f1918da5e3b8fbf4eed27ded51fe940e2ae0f`.

The timing boundary was reproduced by controlling the order of recognition results in a JVM test. The interval between moving a card and camera exposure on a physical phone was not measured.

## Missing confirmation frame

A separate JVM regression test reproduced a missing confirmation image followed by the original group returning in the next preview. The previous matching logic assigned the submission number to that later frame. The revised version validates a submission only when the image timestamp exactly matches the exposure timestamp Camera2 reported for that request. It queues the image for decoding even if the reader is still processing an earlier preview. It temporarily retains up to three frames in case the image arrives before the capture-start callback. Without a matching image, the submission times out and is cancelled.

All 37 JVM checks passed. The offline Android API 36 emulator confirmed normal scoring of 1 entry and 10 points, duplicate blocking on re-exposure, and restoration of the record after app restart. The tested APK had SHA-256 `5bcaccfb383f31267cc020f40d963ba0977726c5e2684fa2c9aaf1d90295941f`. The missing capture image was a condition controlled in the JVM test.
