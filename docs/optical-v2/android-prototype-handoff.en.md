# QRoker Android companion prototype handoff

Prepared in Kiro (documentation), based on branch `codex/issue-9-score-table`. This was a documentation-only task. It changed no code, dependencies, `.kiro` files, task status, or Gate decisions.

## 0. Status of this document

- This is an **Android companion handoff**. It is separate from the Optical V2 specification (`.kiro/specs/qroker-optical-v2/`) and its Gate records.
- At handoff, all V2 specification tasks were unstarted (unchecked), and no Gate decisions had been recorded. This document satisfies no Gate or task.
- V2 specification Requirement 19.10 excludes scoring values from V2 documents. With the owner's confirmation, this separate handoff includes the prediction score table. It uses **provisional values** selected by the owner (2026-11-16, the same as `docs/practice-mode.md`).
- Adoption of the 30 mm assembly is an owner decision separate from any V2 Gate decision.

## 1. Sources and attribution

| Item | Details |
|---|---|
| Local reader and experiments | Attributed to **Codex** at the owner's direction. The reports have no author byline. |
| Input reports (local to the checkout) | `marker-size-comparison.md`, `illustrated-recognition-report.md`, and `small-marker-audit/report.md` under `local-optical-previews/mosaic-camera-print/full-joker/` |
| This document | Kiro read and summarized the three reports and the V2 specification. Kiro did not rerun the experiments. All figures below come from the reports. |
| Reproduction files | `test-marker-size-options.py` (seed 168411) and `test-illustrated-card-recognition.py` (seed 830415) in the same folder, plus `test-small-marker-focus.py` in its parent folder. Reader and marker SHA-256 hashes are in `stills.json`, `video.json`, and `negative.json` under `small-marker-audit`. |

## 2. Evidence categories

- **Synthetic raster images** account for all recognition rates below.
- **Browser prototype** evidence consists of one run at mobile viewport size (display total, then remove a card). It did not use a physical device.
- **Physical Android cameras and printed cards**: **No results. Pending.**

The browser prototype and synthetic results inform the Android design. They do not establish recognition rates on a phone, display latency, or printed-card performance. The premise in `docs/optical/OPTICAL-STATUS.md` still applies: the optical results in this repository use synthetic images.

## 3. Recorded configuration

### 3.1 Assembled 30 mm marker with original-size joker artwork

- Five designs were compared against the existing 25.4 mm marker. Straight card edges touch. Only the rounded corners, with a radius of 3.175 mm, leave a central gap.
- The 30 mm design enlarges the marker while preserving the physical dimensions of the joker and the corner radius. Bars measure 0.82 × 1.64 mm (0.69 × 1.39 mm in the current 25.4 mm design).
- Inspection of the digital assets found no overlaps among bars, joker artwork, central gap, neighboring bars, or border. The minimum separation between a bar and other code ink was 0.1172 mm in the 30 mm design (0.0992 mm in the current design). One dot at 300 DPI is about 0.085 mm.
- The dot simulation includes binary quantization only. Real printer ink spread and variation in card printing remain untested.

### 3.2 Automatic four-card recognition

- The reader received no marker coordinates. Success required all four card IDs to be correct.
- When cards are missing, the reader withholds the sum. There were zero totals with one card missing (48 cases, and 368 in the marker-size comparison) or all cards missing (12 cases). The marker-size comparison also recorded zero misidentified card IDs and zero accepted incomplete combinations.

### 3.3 Low-light edge correction

- When the default method cannot read a small marker, resample the detected quadrilateral with horizontal and vertical shifts of up to 0.45 pixels.
- Return a result only when it passes four-card validation and resolves to a single combination.

### 3.4 Selecting a recent sharp frame

- While searching for a new combination, monitor sharpness in the central region and wait up to 88 ms for a newer, sharper frame.
- After a combination is read, use the latest frame for each subsequent read. Hide the sum and prediction input immediately when the reader reports a missing card.

## 4. Test results and conditions

All figures are successes/trials on synthetic images.

### 4.1 Marker-size comparison (60° synthetic reads, 30 card combinations per cell)

| Assembly | Low light, small in frame | Darker | Strong blur | Simulated 300 DPI, darker |
|---|---:|---:|---:|---:|
| Current 25.4 mm | 9/30 | 23/30 | 4/30 | 23/30 |
| 30 mm, same-size joker | 21/30 | 30/30 | 24/30 | 30/30 |

- The equal-pixel-width control (25.4 mm marker scaled to the same pixel width as the 30 mm marker) scored 21/30, 30/30, and 23/30 in the first three conditions. **Marker pixel count explains most of the improvement in the 30 mm design.** Physical testing must establish whether a 30 mm print provides the same pixel count in a camera image.
- The 25.4 mm enlarged-bar design and the design with the joker reduced to 80% scored below the 30 mm design (table omitted here, see the original report).
- Across 690 complete combinations and 368 cases with one missing card, there were zero misidentified IDs and zero accepted incomplete combinations. Input seed 168411.

### 4.2 Illustrated card fronts with a 30 mm marker (5♥·9♦·J♣·2♠, sum 27, 1280 × 960)

| Condition | Frontal-equivalent marker width | Result |
|---|---:|---:|
| Frontal, 45° | 128 pixels | 26/26 |
| 60°, normal light, low light, darker with noise, blur 1.25 | 151 pixels | 26/26 |
| 65° low light, JPEG quality 60 | 151 pixels | 26/26 |
| 60° low light | 128 / 96 pixels | 26/26 |
| 60° low light, small image | 72 pixels | 22/26 |
| 60° low light, severe blur 2.10 | 151 pixels | **0/26** |

- Illustrated fronts and controls with the illustrations removed gave identical outcomes in all 312 pairs. No incorrect IDs or sums were returned. Seed 830415.

### 4.3 Small-marker correction and sharp frames (60° low light)

| Condition | Before | After |
|---|---:|---:|
| 72 pixels wide, existing images | 22/26 | 25/26 |
| 72 pixels wide, new camera poses | 24/32 | 29/32 |
| 96 pixels wide | 26/26 | 26/26 |
| 151 pixels wide, severe blur | 0/26 | 0/26 |
| Search intervals with one sharp frame each | 5/26 | 24/26 |

- The last row uses controlled replay mixing one sharp image with three blurred images. Actual camera frame arrival patterns were not measured.
- No total was returned in the 48 one-card-missing cases or the 12 all-cards-missing cases.
- In one mobile-sized browser run, the total 27 appeared and one card was removed. The total disappeared after the first missing-card response, and the 10 points already earned remained. The scene transition took 263 ms (one measurement), with zero extra waits for sharpness during that interval.

## 5. Limitations

1. The recognition test used **one combination**, 5♥·9♦·J♣·2♠ (section 4.1 used 30 combinations per cell). This does not cover all suits and ranks.
2. Severe blur (2.10 pixels) produced 0/26. The reader cannot read under heavy blur. The evidence shows only that it withholds a result in those cases without returning a wrong one.
3. Failures remain at widths of 72 pixels or less (22/26 → 25/26, 29/32).
4. Combinations containing only clubs and spades have ambiguous reflection (`AMBIGUOUS`) in V1. The reports did not cover this case.
5. The model excludes ink spread, card stock, reflections, and phone focus and exposure.
6. Synthetic results do not measure phone latency or printed-card recognition. The 263 ms figure is a single browser measurement.
7. The experiment scripts live outside the repository. These experiments cannot be reproduced from this repository alone.
8. Hiding the correct sum until submission is a display policy. The cards are visible and provide no cryptographic secrecy (as with the V2 specification's atomic result policy). Item 2 in `docs/open-decisions.md`, concealing card identities before prediction, remains open.
9. This configuration has passed no V2 specification Gate. V2 hypothesis HYP-1 (180° rotational symmetry) remains unverified.

## 6. Joker artwork and derived assets

- Keep the original joker artwork and all derivatives (assembled PNGs, layout previews, card PDFs, and sample images) **local only**. Do not add, commit, or push them to the repository.
- This document lists only local filenames and embeds no images.
- Rights to the joker artwork remain an owner decision (O-5) in the V2 specification. Verify before public release.

## 7. Next app scope — minimal offline Android companion

The scope covers **camera recognition, prediction scoring, and local history**. It excludes the game engine, board, deck, AI, multiplayer, accounts, networking, and cloud sync. Do not store or transmit camera images or request network permission.

### 7.1 Flow

1. View the cards through the camera.
2. When **four distinct cards** form a readable code, prompt for `N번째 추측` (“Guess N”). N is the next round number in the current game.
3. **Keep the true sum hidden until submission.** Do not record it before submission.
4. On submission, show the result (true sum) and points earned. Add the points to the running total.
5. Store the round number, guess, points, and running total on the phone. Preserve the history across restarts.
6. Score **each card combination only once per game**. Skip the prompt for combinations already scored.
7. If a card disappears before submission, **cancel the pending guess**. Discard the current input without creating a record. Removing a card after submission has no effect on saved history.

### 7.2 Prediction score table (provisional values selected by the owner)

| Prediction error `\|guess − true sum\|` | Points |
|---|---:|
| 0 (exact) | 10 |
| 1 | 5 |
| 2 | 4 |
| 3 | 3 |
| 4 | 2 |
| 5 | 1 |
| 6 or more | 0 |

- These are provisional values without balance testing. Make them adjustable in one place, such as `ScoreConfig`.
- The browser game's bonus for emptying a hand (+5) falls outside scope because this app has no hand state.
- The sum adds the values of the four cards, from A=1 through K=13 (V2 specification). The sum ranges from 4 to 52, which determines the prediction input limits.

## 8. History fields

At the owner's direction, store the round number, guess, points, and running total. Preserve them across app restarts. Use internal device storage, with no claim of encryption or guaranteed secrecy.

## 9. Open items requiring an owner decision

| # | Item | Assumption in this document |
|---|---|---|
| D-1 | How a game starts, ends, and resets | Open. This handoff makes no assumption that starting a new game resets the running total and history scope. |
| D-2 | Definition of “same card combination” | An unordered set of four card IDs, independent of position and rotation. Confirmation needed. |
| D-3 | Preventing duplicates across restarts requires a stored combination key. The owner's list of fields omits it. | Decide whether the combination key (information revealed after submission) may be stored. |
| D-4 | Handling reflection ambiguity for combinations containing only clubs and spades | Open (item 4 in `docs/open-decisions.md`). |
| D-5 | Acceptable card-removal detection latency and handling of a hand blocking the view | Decide after measurements on a physical device. |
| D-6 | Final prediction score table | Values are provisional. |
| D-7 | Android runtime (native / WebView / PWA) and how to port the reader | Open. The V2 specification notes that the V1 reader uses `node:fs` and is unsuitable for browsers. |

## 10. Evidence still needed before Android implementation

1. **Real Android cameras**. Measure recognition rates for printed cards on multiple device models. Include preview resolution, focus, exposure, and the frame arrival distribution.
2. **Physical printed cards**. Print 30 mm markers on actual card stock and inspect ink spread, gloss, reflections, and show-through from the reverse side.
3. **Varied card combinations**. Cover all suits and ranks and `AMBIGUOUS` handling for combinations containing only clubs and spades. Current evidence covers one combination.
4. **On-device measurements**. Measure display and clearing latency, the actual effect of the 88 ms wait for a sharp frame, heat, and battery use.
5. **Cancellation on card removal**. Check for incorrect or missed guess cancellations when a hand blocks the view or visibility flickers.
6. **Practical capture conditions**. Test distance, angle (60° and above), lighting, and blur. Include guidance for users under severe blur, which produced 0/26.
7. **Pixel-count assumption for 30 mm**. Check whether the marker reaches the tested pixel widths at actual shooting distances.
8. **Reproducibility**. The owner must decide whether to make the scripts and reader reproducible from the repository or keep the evidence local.
9. **Owner decisions D-1 through D-7** and joker artwork rights (O-5).
10. **Relationship to the V2 specification**. Decide whether the app will use a format that has passed a V2 Gate or the current local 30 mm configuration. The latter requires a record separate from the V2 Gate process.

Do not begin Android implementation until these items are resolved.

## 11. Codex follow-up — Android prototype and verification (2026-11-20)

Sections 0–10 are the handoff Kiro wrote before implementation. At the owner's subsequent request, Codex built an Android prototype for the existing local 30 mm marker and ran the tests below. This record does not update the status of any Optical V2 Gate or owner decisions D-1 through D-7 and O-5.

### Implementation

- Native Java app for Android 8.0 and later (`com.qroker.offline`, v0.1.0). It automatically locates the marker in the latest rear-camera frame and opens the `N번째 추측` (“Guess N”) input after reading four distinct cards. This APK does not use the browser experiment's 88 ms wait for a sharp frame.
- The app hides the correct sum before submission and blocks submission on a frame missing a card. After submission, it displays the correct sum and points earned under the provisional table in section 7.2.
- Internal storage holds an order-independent combination key, the guess, and the correct answer. Record order and the score table restore the round number, points earned, and running total. The prototype uses the key to prevent duplicate scoring after restarts. Formal decision D-3 remains open. Users can reset the history by confirming `기록 삭제` (“Delete history”).
- Recognition and scoring run on the device. The app requests only camera permission and does not store images.
- Local artifacts are under `local-optical-previews/android-offline-companion/` in the checkout. The installation file is `dist/QRoker-Offline.apk`. Usage and rebuild instructions are in `README.md` and `build.ps1`. The verified APK's SHA-256 is `9a6284fd0fc7d108b6233b59582916959c27f895a1afc364b1190019906f1cd6`.

### Verification results and remaining physical tests

| Environment | Result |
|---|---|
| Android API 36 emulator, airplane mode with Wi-Fi off | A synthetic 60° low-light scene containing 5♥·9♦·J♣·2♠ supplied rear-camera input. The check confirmed that the answer stayed hidden before submission, a guess of 27 recorded the correct answer 27 and 10 points, history and total returned after a force-stop, and confirmed deletion reset the score to 0. The synthetic scene was repositioned to bring the marker into the emulator camera's field of view. |
| JVM regression checks | 19 checks passed. They covered synthetic frame rotation and limited-range brightness, rejecting a read and blocking submission with one card missing, preventing duplicate scoring, accumulating points, and restoring and deleting history. |
| Physical phones and printed cards | **Awaiting verification.** Photograph real 30 mm printed cards on multiple Android devices to measure recognition rate, display-clearing latency after card removal, practical distance, angle and lighting ranges, and the effects of ink spread, gloss, and reflections. |

## 12. Source and verification records on GitHub

Codex collected the Android app source and verification scripts in the [Android companion folder](../../prototypes/android-offline-companion/). The [52-card verification report](../../prototypes/android-offline-companion/tests/deck-audit-report.en.md) records reader results for 480 synthetic inputs and representative emulator scoring and storage tests. Rebuilding requires the local 30 mm layout, codebook, and test images. Verification with physical phones and printed cards remains pending.
