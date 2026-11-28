# QRoker rules and scoring

These are the rules of the [playable Kiroween release](https://goalan70-eng.github.io/qroker-kiroween/). Four people share an 8×8 board and a standard 52-card deck marked with fragments of QRoker's optical code. Each seat can be controlled by a local player or, for the remaining seats, by the browser's AI.

## Deal and place

Deal three cards to each player and four neutral cards to the central 2×2 square. The remaining 36 form the draw pile. The initial square is dealt once and earns no points. On your turn, place one card in an empty square sharing an edge with a card already on the board. Clubs and spades can rotate 180°.

Check each new 2×2 square containing the card you placed. Four correctly oriented marker fragments must meet at the center to make a code. If you complete no new code, draw one card, including on the first turn. If you complete one or more codes, skip the draw and score each new group.

## Predict and reveal

Each of the four players privately predicts the sum of each completed group. Ranks run from ace (1) to king (13), so a prediction ranges from 4 to 52. The player who placed the card participates on the same terms. Individual predictions stay private.

| Mode | What the board shows | After all four predictions |
| --- | --- | --- |
| Normal | Four face-up starting cards. Players can see their own placements and previously revealed groups. | Reveal all four cards in the completed group, its sum and the points. |
| Blind, correct sum and points | Your hand is visible. Every board card stays face down. | Show the correct sum and points. |
| Blind, points only | Your hand is visible. Every board card stays face down. | Show the points earned. |

## Score and finish

| Distance from the correct sum | 0 | 1 | 2 | 3 | 4 | 5 | 6 or more |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Points earned | 10 | 5 | 4 | 3 | 2 | 1 | 0 |

For example, with a correct sum of 27, a guess of 25 and a guess of 29 each earn 4 points. Each player uses the same table, including the one who completed the code.

- Drawing the last card ends the game immediately with the points already earned.
- A hand that is empty after the applicable draw earns its player a **5-point bonus** and ends the game.
- Reaching five scored groups across the table also ends the game. Score **every** group created by the final placement. For example, going from four groups to six scores both new groups. If that player also emptied their hand, award the bonus once.
- The highest total wins. Tied players share a rank.

## At a physical table

The [Android scorekeeper](https://github.com/goalan70-eng/qroker-kiroween/releases/tag/kiroween-2026-beta) locks the identities of four marked cards, takes one player's prediction and records the points locally. The app identifies rank and suit. The same four cards can score once per game on that scorecard. Different sets can score even when their sums match. Players manage the shared board, turns and end of the game themselves.
