# QRoker

Each QRoker card has two marked corners. Place a card so that four marked corners meet in the middle of a 2×2 square. Everyone privately predicts the sum of the four ranks. Each prediction earns points independently, so two exact guesses earn 10 points each.

**[Play QRoker in your browser](https://goalan70-eng.github.io/qroker-kiroween/)** · [한국어 안내](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-final/README.ko.md) · [Rules and scoring](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-final/PROJECT_BRIEF.md) · [Try a code in two moves](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-final/docs/practice-mode.md#make-your-first-code-in-two-moves)

![The 6 of clubs and rotated 4 of clubs sit above the queen of diamonds and 6 of spades. Their four inner corners form the enlarged marker. The ranks add up to 28.](https://raw.githubusercontent.com/goalan70-eng/qroker-kiroween/kiroween-2026-final/docs/submission/four-corners.png)

| Choose how to play | What you need |
| --- | --- |
| [Play online](https://goalan70-eng.github.io/qroker-kiroween/) | A browser. Play solo against three local AI opponents, or up to four people can share one device. |
| [Download the offline web game](https://github.com/goalan70-eng/qroker-kiroween/releases/download/kiroween-2026-final/QRoker.html) | Open `QRoker.html` in Chrome or Edge. The game, artwork and sound are in the file. |
| [Install the Android scorekeeper](https://github.com/goalan70-eng/qroker-kiroween/releases/download/kiroween-2026-final/QRoker-Offline.apk) | Android 8 or later and a four-card QRoker marker. If updating an archive-signed installation, use the [archive update APK](https://github.com/goalan70-eng/qroker-kiroween/releases/download/kiroween-2026-final/QRoker-Offline-ArchiveUpdate.apk) to keep your scores. |

## Your first turn

1. Select **Start game** for the default table with three AI opponents. Look at your three cards and the four face-up cards in the center.
2. Select a card and a marked square next to an existing card. Clubs and spades can turn 180°. Press the check mark to place it. If it makes no new code, you draw a card.
3. When four corners complete a code, each player predicts a sum from **4 to 52**. In **Normal**, the four cards and their sum appear after the last prediction. In **Blind**, the board stays face down. Choose whether to show the correct sum with the points or just the points.

The web game opens in English on first use and runs without an account or a phone. At a physical table, the Android app keeps one player's scores. Tap **Scan code**, center the four-card marker, then tap **Lock code**. You can lower the phone before entering your guess. [Android installation and first scan](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-final/prototypes/android-offline-companion/README.md)

## Build the version judges play

To reproduce the judging build, check out the [kiroween-2026-final tag](https://github.com/goalan70-eng/qroker-kiroween/tree/kiroween-2026-final). The [release downloads](https://github.com/goalan70-eng/qroker-kiroween/releases/tag/kiroween-2026-final) include the standalone web game and Android scorekeeper.

```sh
git clone --branch kiroween-2026-final https://github.com/goalan70-eng/qroker-kiroween.git
cd qroker-kiroween
npm ci
npm run build:standalone
```

Use Node.js 24 and npm. Open `dist/QRoker.html`, or run `npm run build` to generate the static site in `dist/web/`. The public source includes the game's 52 marked card faces. [Running and testing the game](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-final/docs/practice-mode.md)

## Development and credits

Kiro checked the handoff between players and the timing of the reveal, including all 24 prediction orders at the engine level. The verification record identifies the browser cases separately. Codex worked on implementation and release packaging. [Detailed Kiro test record (English)](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-final/docs/validation/kiro-private-guess-reveal-en.md) · [Development log](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-final/docs/kiroween-development-log.md)

The software is licensed under the GNU AGPL-3.0-only. Card illustrations, help artwork and sounds have their own credits. [Software license](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-final/LICENSE) · [Artwork and sound credits](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-final/docs/submission/credits.md)
