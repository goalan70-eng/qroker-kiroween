# Print and scan two QRoker codes

[한국어 시험표](offline-reader-real-device-ko.md) · [Install the Android scorekeeper](../../prototypes/android-offline-companion/README.md)

Use this check to see how the app handles a missing card, two different codes with the same sum, and a repeat scan. Use a scorecard that has never scored either set. If you want to keep an existing game, use a separate Android profile or phone.

## Prepare six cards

If you have the print kit, open `QRoker-52-rounded-center-by-suit-A4-8pages.pdf`. In the project workspace it is under `prototypes/screen-playtest/deliverables/black-white-registered-15mm/`. This kit is supplied separately from the source checkout. To try a reveal with only a browser, use the [two-move walkthrough](../practice-mode.md#make-your-first-code-in-two-moves).

Print pages **1, 3, 6 and 7** on A4, single-sided, at **100% / Actual size**. Measure the 50 mm reference line. Cut along the rounded card outlines. On plain white paper, place the cards face up with their marked corners touching at the center. A small patch of white paper should show between the four rounded corners.

| Layout | Top left | Top right | Bottom left | Bottom right | Sum |
| --- | --- | --- | --- | --- | ---: |
| A | 5♥ | 9♦ | J♣ | 2♠ | 27 |
| C | 9♥ | 5♦ | J♣ | 2♠ | 27 |

## Run the check

Record the phone model, Android version, lighting, starting round count and total score. Start each scan from **My scores → Scan code**.

| Action | Expected on the phone | Observed on device |
| --- | --- | --- |
| Remove one card from A and tap **Lock code**. | The code does not lock. The round count and total stay the same. | Untested |
| Put the card back, lock A, then lower the phone. Enter **27** and tap **Score**. | Locking alone leaves the total unchanged. Scoring adds one round and 10 points. | Untested |
| Replace the top row with the two cards shown for C. Lock it and score **27**. | A second round appears. The two rounds add up to 20 points. | Untested |
| Try to lock A again. | The app displays **Already scored. Scan a different code.** The total stays the same. | Untested |
| Close and reopen the app. Open both rounds and try C again. | Each round shows a guess of 27 and 10 points. The total persists and the app recognizes C as already scored. | Untested |

These are expected results. The project checklist has no recorded phone-and-paper results for these five steps with version 0.2.27.
