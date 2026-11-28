# QRoker

## Elevator pitch
Four QRoker playing cards have a secret at the point where their marked corners meet. Place a card, complete the pattern, and predict the sum before anyone sees the answer.

![Four marked cards meet at the center to form one optical code. Their ranks sum to 28.](https://raw.githubusercontent.com/goalan70-eng/qroker-kiroween/kiroween-2026-final/docs/submission/four-corners.png)

## Category
Frankenstein

## What it does
QRoker connects a tabletop pattern, a browser strategy game, and an offline Android reader. Four players share a board. Each card has fragments of a custom optical marker printed in two corners. When four fragments meet, everyone privately guesses the sum of those cards. In Normal mode the table reveals the cards and scores together. In Blind mode you can see your hand, while cards on the board stay face down. You can play solo against three AI players or pass one screen between people.

## How we built it
The TypeScript engine tracks placement, orientation, guesses, and scores. It supplies a separate view for each seat so the shared display can hand off between players. The Android companion reads the joined marker from a single camera capture and locks the four card IDs. You can lower your phone before entering your guess. Two groups with the same sum are still distinct, and scanning the same four cards twice does not award points twice.

## How we used Kiro
Kiro’s game spec records the placement and scoring rules. Its playable-game spec turns those rules into browser requirements, including what each player can see when the device changes hands. At the judging revision, the task lists mark 36 game-spec items and 76 playable-game items complete. A third spec records the Optical V2 proposal. The project steering file requires screens to receive a seat-specific view of the game. A boundary test enforces the import rule that keeps screens from reading the full game state. Steering also keeps private predictions out of shared views and protects the frozen V1 codebook. A separate steering file guides Optical V2 work. [Specs](https://github.com/goalan70-eng/qroker-kiroween/tree/kiroween-2026-final/.kiro/specs) · [Steering files](https://github.com/goalan70-eng/qroker-kiroween/tree/kiroween-2026-final/.kiro/steering)

The repository includes six configured hooks for recording task starts, guarding shell commands, checking TypeScript on save, sending optional turn notifications, checking completed tasks, and requesting an optional external review. The November 24 verification record includes save-time checks. Automatic post-task verification remained unconfirmed in that session. [Hook configurations](https://github.com/goalan70-eng/qroker-kiroween/tree/kiroween-2026-final/.kiro/hooks)

Kiro checked that the next player could not see the previous prediction and that four seats received their scores together after the final submission. Its engine test covered all 24 submission orders. The browser test exercised one order, and a follow-up verified that a player who earned 10 points on one code and 5 on another saw 15 on the reveal screen. Codex implemented the approved rule changes and the Android companion, and prepared the release. [Kiro’s test record (English translation)](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-final/docs/validation/kiro-private-guess-reveal-en.md) · [Development log](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-final/docs/kiroween-development-log.md)

## What we learned
A correct score is only half of a working turn. Showing it one action too soon gives the next player the answer. For the physical version, keeping a code locked after the phone moves matters just as much as recognizing it in the first place.

## Try it
Start with the default table to play against three AI opponents. Select a hand card, choose a marked square sharing an edge with a card already on the board, and press the check mark. To see a reveal in two placements, follow the seed-1 walkthrough. The Android download is for keeping one person’s score with QRoker-marked cards. [Play online](https://goalan70-eng.github.io/qroker-kiroween/) · [Two-move walkthrough](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-final/docs/practice-mode.md#make-your-first-code-in-two-moves) · [Offline HTML and Android downloads](https://github.com/goalan70-eng/qroker-kiroween/releases/tag/kiroween-2026-final)

## Built with
Kiro, TypeScript, Vite, Java, Android Camera2, Playwright, Vitest, fast-check.

## Pre-existing materials
The traditional playing-card faces are based on Adrian Kennard’s public-domain designs. Card-handling sounds include CC0 recordings. [Credits](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-final/docs/submission/credits.md)
