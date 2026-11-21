# QRoker 화면 판독 시제품

PC에서 기존 QRoker 게임을 플레이하고 Android 휴대전화로 PC 화면의 코드를 판독한다. 웹은 기존 게임 엔진·UI·저장 방식을 사용한다. 게임의 실제 배치는 엔진이 해당 코드를 공개한 뒤 **카메라로 코드 보기**에서 확인할 수 있다. 고정 샘플은 **카메라 판독 연습**에서 바로 열 수 있다.

## 로컬 빌드

저장소 의존성이 설치된 Windows에서 Python 3, Node.js, PowerShell과 [Android 컴패니언의 도구 환경](../android-offline-companion/README.md)을 사용한다. 재현에는 두 로컬 입력이 필요하다.

- `-Deck`에는 최신 모자 중앙 격자형 52장 패키지 `kennard-52-center-grid.zip`을 지정한다.
- `-Source`에는 기존 30 mm 인쇄안의 `joker-uniform-bars-30mm-layout.json`과 `uniform-bars-retest-input.json`이 있는 폴더를 지정한다.

두 빌드 모두 입력 지문을 확인한다. 시제품에서 사용하는 조커 원본·파생 카드 이미지와 촬영 자료는 별도로 갖고 있어야 한다.

```powershell
./build-web.ps1 -Deck $deckZip
./build-android.ps1 -Source $layoutDirectory
```

`deliverables/QRoker-Web.html`은 서버 없이 열 수 있다. 함께 빌드한 `deliverables/QRoker-ScreenCheck.apk`를 설치하고 카메라 권한을 허용한다. 이전 화면 검증 앱을 업데이트하려면 동일한 로컬 서명 키를 `-SigningKey`로 지정한다. 기존 점수 기록 앱과 화면 검증 앱은 서로 다른 앱 ID와 기록을 사용한다.

1. 웹의 **카메라 판독 연습**에서 코드 전체를 휴대전화 미리보기 안에 넣는다.
2. 예측 27을 제출하면 정답 27과 10점이 표시된다.
3. 확정 전에 웹의 **한 장 빼기**를 눌러 입력이 닫히는지 확인한다.

## 시험 재현

설치된 Playwright Chromium과 Android 빌드의 JDK를 사용한다.

```powershell
node ./verify-web.cjs --isolate-marker
& "$jdk/bin/java.exe" -cp android-build/jvm com.qroker.offline.VerifyScreen evidence/marker-isolation
```

브라우저 시험은 같은 실제 카드 배치에서 중앙 코드만 남긴 화면과 중앙 코드만 가린 화면을 만든다. Android에 사용한 판독 코드를 JVM에서 실행해 PNG·JPEG 모두에서 네 카드 ID와 합계를 확인한다. 카드 누락과 기존 추측 취소, 채점 기록 재로딩도 검사한다. Android 빌드는 복제 막대의 일부가 지워졌을 때의 식별 및 판독 거부를 따로 시험한다.

오프라인 에뮬레이터에는 별도 화면 검증 APK를 설치했다. Android 시스템 UI가 멈춰 해당 시제품의 가상 카메라 시험을 완료하지 못했다. 화면 촬영 성공은 소유자가 보고했으며, 기기별 모니터 촬영과 실물 인쇄 조건의 성능은 별도 검증이 필요하다.

도안, 촬영 화면, 설치 파일, 서명 키는 로컬 빌드 자료로 유지한다.
