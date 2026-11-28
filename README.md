# QRoker

[Play QRoker in your browser](https://goalan70-eng.github.io/qroker-kiroween/) · [Download the offline game or Android scorekeeper](https://github.com/goalan70-eng/qroker-kiroween/releases/tag/kiroween-2026-beta)

## Play your first turn

Open the game in Chrome or Edge and press **Start game**. The default table has one human and three AI players. Choose a card from your hand, select a marked square that shares an edge with a card on the board, then press the check mark beside it. A placement that completes no code draws one card. When four marked corners meet, enter your private prediction for the sum of those four cards. In Normal mode everyone sees the cards and points after the last prediction.

The browser game needs no account, API key, phone or printed cards. For offline play, download `QRoker.html` and open it in your browser. The companion APK is optional. English and Korean are available in both applications.

## Build the judging version

Use Node.js 24 and npm. From a fresh checkout of the judging tag, run:

```sh
git clone --branch kiroween-2026-beta https://github.com/goalan70-eng/qroker-kiroween.git
cd qroker-kiroween
npm ci
npm run build:standalone
```

Open `dist/QRoker.html`. For a static host, run `npm run build` and serve `dist/web/`. The 52 marked card faces used by the main game are included in the source. The separate screen-playtest prototype uses additional lab materials.

**Android:** Install `QRoker-Offline.apk` on Android 8 or later. Choose **Scan code**, aim at the middle of a four-card code, press **Lock code**, then enter a prediction from 4 to 52. An exact guess earns 10 points. If you installed the historical archive-signed build, select `QRoker-Offline-ArchiveUpdate.apk` to preserve your scores. To build your own test APK from this checkout on Windows, run `prototypes/android-offline-companion/build.ps1` with `-Sdk` (Android SDK with Platform 36.1 and Build Tools 36.1.0) and `-Jdk` (JDK 21) as needed. Python 3 is required. A clean build creates its own signing key and uses the included optical sampling geometry. That APK has a different signature from the downloadable update.

[Artwork and sound credits](docs/submission/credits.md) · [Kiro verification record](docs/validation/kiro-private-guess-reveal.md) · [Project license](LICENSE)

## 한국어 실행 안내

메인 웹게임은 프로젝트 루트의 `QRoker.html`이다. 이 파일을 브라우저에서 열면 서버 없이 게임과 효과음을 사용할 수 있다.

메인 HTML을 다시 만들려면 저장소에서 `npm ci`로 의존성을 설치하고 `npm run build:standalone`을 실행한다. 결과는 `dist/QRoker.html`에 생성된다. 서버에 올릴 때는 `npm run build`로 만든 `dist/web/` 폴더를 사용한다. `QRoker-Web.html`은 카메라 시험용 샘플과 카드 제거 기능이 들어 있는 별도 시험판이다.

Android용 인식기는 `prototypes/android-offline-companion/dist/QRoker-Offline.apk`이다. 네 장이 만나는 마커를 카메라 십자선에 맞추면 판독한다. 화면에서 무늬가 작으면 웹게임 돋보기로 확대한다. 예전 보관본에서 설치한 사용자는 점수 기록을 유지할 수 있도록 보관본용 업데이트 APK를 사용한다. [설치 파일 선택과 사용법](prototypes/android-offline-companion/README.md)

[Run and test Practice Mode](docs/practice-mode.md) · [P1 verification evidence](docs/practice-mode-p1-report.md) · [Development provenance](docs/kiroween-development-log.md)

[Android 인식기 실물 카드 시험지](docs/validation/offline-reader-real-device-ko.md)
