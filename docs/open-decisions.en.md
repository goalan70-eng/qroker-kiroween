# QRoker decision tracker

This table records decisions from the design of the optical prototype. The current web game deals the four center cards once and awards no score for the starting combination. From the first placement onward, a player draws one card if the placement creates no new code. See the [game rules](../PROJECT_BRIEF.md) for the scores and end conditions in the current release.

| # | Decision | Status | Impact | Blocks prototype? |
|---|---|---|---|---|
| 1 | Which side carries the optical fragments? | Decided. Print on both sides (Requirement 16). | The information-hiding limitation remains unresolved. | No |
| 2 | How are card identities concealed until prediction? | Open | Markers on both sides let a reader identify cards in a hand or face down. | No |
| 3 | Must the four random starting cards form a valid Composite Code? | Decided. No score for the starting combination and no redeal. | Setup and first scoring opportunity | No |
| 4 | How should the UI handle reflection ambiguity in groups containing only ♣ and ♠? | Open | Companion UX | No |
| 5 | Conflicts between standard face indices and marker placement | Open | Card design | No |
| 6 | Draw on the first placement | Decided. Draw one card if no new combination forms, starting with the first placement. | Draw rule | No |
| 7 | Prediction score table and bonus for emptying a hand | Release defaults. Errors of 0–5 earn 10, 5, 4, 3, 2, and 1 point respectively. Emptying a hand earns 5 bonus points. | Score balance | No |

## 1. Fragment printing and information hiding

- Both sides will be printed. The front uses Fragment_Layout and the back mirrors the front left to right in card-body coordinates. Card IDs can therefore be read from either side. Delaying the sum on screen does nothing to conceal the printed identity.
- Proposed safeguards (neither implemented nor verified) include a rule against scanning opponents’ cards, an app flow that requests a scan only at reveal time, holders or screens to conceal hands, and placing cards face up so board cards are public information. Secret per-deck permutations are discouraged because the mapping becomes exposed as more cards become known. Effective secrecy would require a physical redesign beyond this scope.
- Verify the print-file convention by flipping a physical card. Viewed from the back, the back print file should look the same as the front.

## 2. Starting cards

- Four random cards may fail the slot conditions (for example, a ♥ in the top-right slot).
- Deal the four center cards once. Even a valid starting group receives no prediction or score and does not count toward the cumulative five. Center cards may participate in combinations newly completed by a later placement.

## 3. Groups containing only ♣ and ♠

- The probability that four random cards contain only ♣ and ♠ is C(26,4)/C(52,4) ≈ 5.5%. Card identification and the sum are unaffected.
- The reader reports `AMBIGUOUS` in this case. Companion design will determine whether to flag the ambiguity when displaying the slot layout or ask the user to scan again.
