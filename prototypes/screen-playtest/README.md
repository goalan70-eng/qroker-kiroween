# QRoker screen-scanning prototype

[한국어 안내 및 실험 기록](README.ko.md)

This lab prototype displays a fixed four-card pattern on a monitor. For the judging build, [play the browser game](https://goalan70-eng.github.io/qroker-kiroween/) or [install the Android scorekeeper](../android-offline-companion/README.md). For printed cards, use the [print and scan checklist](../../docs/validation/offline-reader-real-device.md).

## Try the monitor sample

If you have the local test kit, open `deliverables/QRoker-Web.html` on a computer and choose **Practice scanning**. Use the separate **ScreenCheck** test APK to read the center of the pattern. The four sample cards are 5♥, 9♦, J♣ and 2♠. Their sum is 27. **Remove one card** lets you check how the reader responds to an incomplete pattern. ScreenCheck has its own scores and a different scan flow from the released Android scorekeeper.

The lab build uses local artwork and camera fixtures. See [Build locally](#build-locally) and [Reproduce the tests](#reproduce-the-tests) for the input names, PowerShell commands and synthetic test procedure.

## Play and score

Play the existing QRoker game on a PC and use the Android phone to read the code on the PC display. The web build uses the existing engine, UI and save format. Once the engine reveals a code, open the camera view to see the actual arrangement from that game. **Practice scanning** opens a fixed sample immediately.

Each player starts with three cards. Starting with the first placement, draw one card from the shared deck whenever a placement completes no new group. A placement that completes a new group earns no draw. Drawing the last card ends the game immediately at the current scores.

After resolving the draw, the game also ends if a hand is empty or the four players have completed at least five distinct groups in total. When one placement forms two groups, everyone guesses and scores both. Only the player who empties their hand earns the five-point bonus. The highest final score wins, with tied players sharing the rank.

## Build locally

Use Windows with the repository dependencies installed, Python 3, Node.js, PowerShell and the [Android companion toolchain](../android-offline-companion/README.md). Supply both local inputs:

- For `-Deck`, use `kennard-52-center-grid.zip`, the 52-card package with the revised grid at the center of the hat artwork.
- For `-Source`, use the directory containing the existing 30 mm print layout files `joker-uniform-bars-30mm-layout.json` and `uniform-bars-retest-input.json`.

Both builds verify input fingerprints. The original Joker artwork, derived card images and camera fixtures are separate local inputs. From this prototype directory, run:

```powershell
$deckZip = '../../local-optical-previews/web-game/kennard-deck/center-grid/kennard-52-center-grid.zip'
$layoutDirectory = '../../local-optical-previews/mosaic-camera-print/full-joker'
./build-web.ps1 -Deck $deckZip
./build-android.ps1 -Source $layoutDirectory
```

Open `deliverables/QRoker-Web.html` directly without a server. This camera test build includes the main game’s placement and guess timers and sound effects. The timers can be adjusted in settings. Install the companion build `deliverables/QRoker-ScreenCheck.apk` and allow camera access. To update an earlier ScreenCheck installation, pass the same local signing key to `-SigningKey`. The regular scorekeeper and ScreenCheck have different app IDs and separate records.

1. Open **Practice scanning** on the web. On the phone’s scoreboard, tap **Scan code** and frame the entire code.
2. Submit 27. ScreenCheck displays the correct answer of 27 and awards 10 points.
3. On another attempt, choose **Remove one card** on the web before confirming and check that the input closes.

## Reproduce the tests

Use the installed Playwright Chromium and the JDK from the Android build.

```powershell
node ./verify-web.cjs --isolate-marker
& "$jdk/bin/java.exe" -cp android-build/jvm com.qroker.offline.VerifyScreen evidence/marker-isolation
```

From the same in-game card arrangement, the browser test produces a view showing only the center code and another hiding only that code. It runs the Android reader on the JVM and checks the four card IDs and sum in both PNG and JPEG images. It also checks missing cards, cancellation of a previous guess and reloading of score records. The Android build separately tests identification and rejection when parts of the replicated bars are erased.

The separate ScreenCheck APK was installed on an offline emulator. Android System UI stopped responding, so the prototype’s virtual-camera test could not be completed. The owner reported a successful screen scan. Performance across phone models, monitors and printed cards still requires separate verification.

Artwork, camera captures, installers and signing keys are kept as local build assets. The [synthetic stress report](stress/README.en.md) compares the revised and previous layouts and records the guess-cancellation tests.
