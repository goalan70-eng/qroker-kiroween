# QRoker

## Elevator pitch
Four ordinary playing cards can hide a fifth thing: a code. Place a card, complete the pattern, and predict the sum before anyone sees the answer.

## Category
Frankenstein

## What it does
QRoker connects a tabletop pattern, a browser strategy game, and an offline Android reader. Four players share a board. Every card has part of a marker near its corners. When four fragments meet, everyone privately guesses the sum of those cards. In Normal mode the table reveals the cards and scores together. In Blind mode you can see your hand, while cards on the board stay face down. You can play solo against three AI players or pass one screen between people.

## How we built it
The TypeScript engine tracks placement, orientation, guesses, and scores. It supplies a separate view for each seat so the shared display can hand off between players. The Android companion reads the joined marker from a single camera capture and locks the four card IDs. You can lower your phone before entering your guess. Two groups with the same sum are still distinct, and scanning the same four cards twice does not award points twice.

## How we used Kiro
We used Kiro’s playable-game spec to turn “keep predictions private” into something we could test. Kiro checked that the next player could not see the previous player’s input when the device changed hands. It also checked that the browser showed no answer before the last prediction, then showed the points for all four seats. At the engine level, Kiro ran a property test covering all 24 submission orders. The browser run exercised a specific order. Codex worked on the implementation and release packaging. [Verification record](../validation/kiro-private-guess-reveal.md)

## What we learned
A correct score is only half of a working turn. Showing it one action too soon gives the next player the answer. For the physical version, keeping a code locked after the phone moves matters just as much as recognizing it in the first place.

## Try it
Open the browser game and start with the default table. Select a card, select a marked square beside the board, and confirm with the check mark. No account is required. The Android scorekeeper is an optional companion. The video demonstrates the browser game.

## Built with
Kiro, TypeScript, Vite, Java, Android Camera2, Playwright, Vitest, fast-check.

## Pre-existing materials
The traditional playing-card faces are based on Adrian Kennard’s public-domain designs. Card-handling sounds include CC0 recordings. [Credits](credits.md)
