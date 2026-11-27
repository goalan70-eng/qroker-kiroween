# qroker-kiroween
QRoker - QR card strategy game for Kiroween 2026

메인 웹게임은 프로젝트 루트의 `QRoker.html`이다. 이 파일을 브라우저에서 열면 서버 없이 게임과 효과음을 사용할 수 있다.

메인 HTML을 다시 만들려면 의존성과 [52장 로컬 도안](prototypes/screen-playtest/README.md)을 준비하고 `npm run build:standalone`을 실행한다. 결과는 `dist/QRoker.html`에 생성된다. `QRoker-Web.html`은 카메라 시험용 샘플과 카드 제거 기능이 들어 있는 별도 시험판이다.

Android용 인식기는 `prototypes/android-offline-companion/dist/QRoker-Offline.apk`이다. 네 장이 만나는 마커를 카메라 십자선에 맞추면 판독한다. 화면에서 무늬가 작으면 웹게임 돋보기로 확대한다. 예전 보관본에서 설치한 사용자는 점수 기록을 유지할 수 있도록 보관본용 업데이트 APK를 사용한다. [설치 파일 선택과 사용법](prototypes/android-offline-companion/README.md)

[Run and test Practice Mode](docs/practice-mode.md) · [P1 verification evidence](docs/practice-mode-p1-report.md) · [Development provenance](docs/kiroween-development-log.md)
