# Run and test the QRoker browser game

[Play online](https://goalan70-eng.github.io/qroker-kiroween/) · [Download the offline HTML](https://github.com/goalan70-eng/qroker-kiroween/releases/download/kiroween-2026-final/QRoker.html) · [Game rules and scoring](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-final/PROJECT_BRIEF.md)

## Set up a game

Choose English or Korean and one to four human players. The remaining seats use local AI. **Normal** starts with four visible cards. **Blind** keeps every board card face down and lets you choose how much to reveal after predictions. A seed can be a number or a word. Repeat the same seed and seat setup to start with the same deal. Advanced settings control the placement and prediction timers. When time expires you can still complete your action.

Select a hand card and a legal square in either order, or drag the card onto the square. The check mark confirms the preview. Clubs and spades can rotate 180°. Arrow keys move between board cells and Enter or Space selects. Each player submits a private prediction from 4 to 52 for every new code. Acknowledge the reveal to continue.

When sharing a device, pass it to the named player before opening the private hand or prediction screen. The game saves accepted actions when browser storage is available. Reload in the same browser and choose **Continue** to resume. Keep playing if a storage warning appears, but the latest turn might not survive a reload. Private game data can be read by someone who has access to the browser's saved data.

## Make your first code in two moves

Start a new game in **Normal**, choose **4 human players**, and enter seed `1` (expand **Advanced settings** if the seed field is hidden). You can take all four seats yourself.

1. Place the **6♣ on D3** upright and confirm. No code forms, so the first player draws one card.
2. Acknowledge the handoff. Place the **4♣ on E3**, rotate it **180°** and confirm. Those two cards now form a code with D4 and E4.
3. Enter **28, 25, 27 and 30** in the order the game requests the four predictions. Acknowledge each handoff. After the fourth submission the reveal shows the answer **28** under **Hidden sum** (6♣ + 4♣ + Q♦ + 6♠). The four predictions earn **10, 3, 5 and 4** points respectively.

## Rebuild the published game

Use Node.js 24 and npm. These commands check out the [source used for the Kiroween release](https://github.com/goalan70-eng/qroker-kiroween/tree/kiroween-2026-final).

```sh
git clone --branch kiroween-2026-final https://github.com/goalan70-eng/qroker-kiroween.git
cd qroker-kiroween
npm ci
npm run build:standalone
```

- **Offline file:** open `dist/QRoker.html` directly in a browser. The release download is ready to use.
- **Static site:** run `npm run build` and serve the entire `dist/web/` directory. Run `npm run preview` to open the local preview URL printed by Vite.
- **Development:** run `npm run dev` and open the local URL. The standalone game includes artwork and effects. The separate `QRoker-Web.html` screen-playtest uses additional lab fixtures.

## Run the checks

```sh
npm run typecheck
npm run check:codebook
npm run test:ci
npx playwright install chromium
npm run test:e2e
```

Vitest covers the engine, AI simulations and synthetic optics. Playwright exercises the browser UI. For a production-page run, first run `npm run build`. In PowerShell, set `$env:PLAYWRIGHT_PREVIEW = '1'`, run `npx playwright test game.spec.ts persistence.spec.ts keyboard.spec.ts`, then clear it with `Remove-Item Env:PLAYWRIGHT_PREVIEW`. In a POSIX shell, run `PLAYWRIGHT_PREVIEW=1 npx playwright test game.spec.ts persistence.spec.ts keyboard.spec.ts`. The [browser testing guide](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-final/docs/browser-testing.md) describes the preview setup and scope.

The [detailed Kiro test record (English)](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-final/docs/validation/kiro-private-guess-reveal-en.md) documents how the team tested private predictions and reveal timing. The [physical-card checklist](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-final/docs/validation/offline-reader-real-device.md) covers capture, duplicate detection and persistence with the Android app and printed cards.
