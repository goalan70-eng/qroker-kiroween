# ScreenCheck prototype real-device test sheet (A4)

Tester ______ Date ______ Phone model ______ Starting total score ______ Starting round ______

Use this sheet for the screen-reading prototype. For the current distribution APK's button-lock and scoring procedure, use the [QRoker Offline 0.2.27 physical-card test sheet](offline-reader-real-device.md).

Gather the local files in `prototypes/screen-playtest/deliverables/`: `QRoker-Web.html`, `QRoker-ScreenCheck.apk` (allow camera access), and `QRoker-ScreenCheck-pilot-A4.pdf` (nine-card test print).

**Existing record** — `Previously confirmed by user`: the owner reported successfully reading a monitor with a phone. Synthetic results (1,204/1,394 matches, 0 wrong identifications) informed case selection and do not establish real-device performance. All new tests below start as **untested**. Preserve existing records.

## Test cards and order

| Set | Top row | Bottom row | Correct sum |
|---|---|---|---:|
| A | 5♥, 9♦ | J♣, 2♠ | 27 |
| B | 2♥, 5♦ | 9♣, K♠ | 29 |
| C | 9♥, 5♦ | J♣, 2♠ | 27 |

Result codes: `Correct read` / `Read rejected` / `Incorrect read` / `Input open, answer unconfirmed`. Record the correct sum only when the screen actually reveals it.

## 1. Monitor (status: untested)

Start with the fixed practice sample, then play the web game. When it reveals an actual combination, record its four cards and sum. Change **only one** of brightness, distance and angle at a time. **Keep A unscored** for tests 3, 4 and 5.

| Trial | Condition changed | Brightness | Distance (cm) | Angle (°) | Attempts | Four revealed cards | Expected sum | Displayed sum | Result | Photo/video |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Practice sample | | | | | | 27 | | | |
| 2 | | | | | | | | | | |
| 3 | | | | | | | | | | |

## 2. Print preparation (status: untested)

Print at actual size (100%, fit-to-page off). Measure the 50 mm reference line: ______ mm. Record the paper finish (matte/glossy/other): ______. Arrange the support and cards in the orientations shown in the PDF. Check: ☐ Measured ☐ Orientation matches

## 3–6. Printed-card tests

For each row, record the total score and round before starting and again after finishing.

> **Tester note 1 (before tests 3–5):** Check whether A has already been scored. If it has, preserve the existing record and use a separate test profile or device where A is unscored. If that is impossible, mark tests 3–5 `Not run — A already scored`. The app prevents duplicate scoring of A. Do not record that behavior as `Read rejected`.

| # | Test | Expected result | Status | Round/total before | Round/total after | Result/notes | Photo/video |
|---|---|---|---|---|---|---|---|
| 3 | With A unscored, enter a guess and remove one card | Input closes, no new round, total stays the same | Untested | / | / | | |
| 4 | Enter a guess for A, then change the top row so the app reads C (both total 27 but contain different cards) | Previous input clears. An empty input field for C is correct. Round and total stay the same. | Untested | / | / | | |
| 5a | Restore A, enter 27 and confirm | Exactly 1 new round, total +10 | Untested | / | / | | |
| 5b | Restart the app and show A again | Round persists, A is not scored again (do not reset the history) | Untested | / | / | | |

## 6. Glare and shadow on B (correct sum 29, status: untested)

| Condition | Guess input opened | Read again after changing angle | Displayed sum (if revealed) | Result | Attempts | Photo/video |
|---|---|---|---|---|---|---|
| Normal lighting | ☐Yes ☐No | ☐Yes ☐No ☐N/A | | | | |
| Small glare spot | ☐Yes ☐No | ☐Yes ☐No ☐N/A | | | | |
| Broad glare | ☐Yes ☐No | ☐Yes ☐No ☐N/A | | | | |
| Strong shadow | ☐Yes ☐No | ☐Yes ☐No ☐N/A | | | | |

> **Tester note 2 (test 6):** Keep B unscored while comparing the four lighting conditions. If the guess field opens but you do not confirm, record `Input open, answer unconfirmed` and leave the displayed-sum field blank. If B was already scored before the test, mark the affected row(s) `Not run — B already scored`.

Synthetic-test reference: strong shadows and glare covering much of a marker also prevented synthetic reads. Rejection is expected in these cases. Check whether the reader rejected the combination safely.

## Decision rules

- **Incorrect sum or stale score** (`Incorrect read`, scoring a different combination, scoring the same combination twice, or input remaining after removal): stop immediately and record the conditions and evidence. **Defer the decision to print all 52 cards.**
- **Read rejected**: record lighting, distance, angle and glare, then record `Yes/No` for whether an ordinary repositioning restored recognition. A rejection alone does not warrant deferring printing.
- This sheet collects evidence for the decision. Completing it does not authorize printing all 52 cards.

**Signature** Tester ______ One-line result summary ____________________________
