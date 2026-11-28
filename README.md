# QRoker

Place a playing card so its corner meets three others. If the four corners form a code, everyone predicts the sum of the cards in secret. The closest predictions earn the most points.

**[Play QRoker in your browser](https://goalan70-eng.github.io/qroker-kiroween/)** · [한국어 안내](README.ko.md) · [Rules and scoring](PROJECT_BRIEF.md)

| Choose how to play | What you need |
| --- | --- |
| [Play online](https://goalan70-eng.github.io/qroker-kiroween/) | A browser. Play solo against three local AI opponents, or up to four people can share one device. |
| [Download the offline web game](https://github.com/goalan70-eng/qroker-kiroween/releases/download/kiroween-2026-beta/QRoker.html) | Open `QRoker.html` in Chrome or Edge. The game, artwork and sound are in the file. |
| [Install the Android scorekeeper 0.2.27](https://github.com/goalan70-eng/qroker-kiroween/releases/download/kiroween-2026-beta/QRoker-Offline.apk) | Android 8 or later and a four-card QRoker marker. If updating an archive-signed installation, use the [archive update APK](https://github.com/goalan70-eng/qroker-kiroween/releases/download/kiroween-2026-beta/QRoker-Offline-ArchiveUpdate.apk) to keep your scores. |

## Your first turn

1. Select **Start game** for the default table with three AI opponents. Look at your three cards and the four face-up cards in the center.
2. Select a card and a marked square next to an existing card. Clubs and spades can turn 180°. Press the check mark to place it. If it makes no new code, you draw a card.
3. When four corners complete a code, each player predicts a sum from **4 to 52**. In **Normal**, the four cards and their sum appear after the last prediction. In **Blind**, the board stays face down. Choose whether to show the correct sum with the points or just the points.

The web game runs without an account or a phone. At a physical table, the Android app keeps one player's scores. Tap **Scan code**, center the four-card marker, then tap **Lock code**. You can lower the phone before entering your guess. [Android guide](https://github.com/goalan70-eng/qroker-kiroween/blob/codex/android-offline-companion/prototypes/android-offline-companion/README.md)

## Build the version judges play

The [judging source](https://github.com/goalan70-eng/qroker-kiroween/tree/kiroween-2026-beta) is pinned to `kiroween-2026-beta`. Use that tag for the same game as the live site and [release downloads](https://github.com/goalan70-eng/qroker-kiroween/releases/tag/kiroween-2026-beta). The default branch carries the project introduction and earlier development history.

```sh
git clone --branch kiroween-2026-beta https://github.com/goalan70-eng/qroker-kiroween.git
cd qroker-kiroween
npm ci
npm run build:standalone
```

Use Node.js 24 and npm. Open `dist/QRoker.html`, or run `npm run build` to generate the static site in `dist/web/`. The public source includes the game's 52 marked card faces. [Running and testing the game](docs/practice-mode.md)

## Development and credits

Kiro checked the handoff between players and the timing of the reveal, including all 24 prediction orders at the engine level. The verification record identifies the browser cases separately. Codex worked on implementation and release packaging. [Kiro verification record](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-beta/docs/validation/kiro-private-guess-reveal.md) · [Development log](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-beta/docs/kiroween-development-log.md)

The software is licensed under the GNU AGPL-3.0-only. Card illustrations, help artwork and sounds have their own credits. [Software license](LICENSE) · [Artwork and sound credits](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-beta/docs/submission/credits.md)
