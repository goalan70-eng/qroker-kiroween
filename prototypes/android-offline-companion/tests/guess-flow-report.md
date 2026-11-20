# QRoker Android 추측 입력 취소·중복 채점 시험

기존 네이티브 앱의 카메라와 화면을 오프라인 Android API 36 에뮬레이터에서 시험한다. 테스트 영상은 기존 30 mm 합성 마커 두 조합(합계 27, 52)을 사용한다. 마커 밖의 색 표식으로 장면을 확인해, 카메라 재생 시각을 추정하는 대신 현재 입력 장면과 앱 상태를 함께 검사한다.

| 시나리오 | 관찰 결과 |
|---|---|
| 입력 중 카드 한 장 제거 | 통과. 예측 27이 입력된 뒤 입력란과 확정 버튼이 닫혔다. 이전 확정 버튼 위치를 누르고 Enter를 보내도 0건·0점이었다. |
| 입력 중 다른 네 장 조합으로 교체 | 통과. 예측 26이 지워졌다. 새 조합에서 빈 값으로 확정을 눌러도 첫 추측 번호와 0점이 유지됐다. |
| 입력 중 마커 일부 가림 후 복귀 | 통과. 예측 49를 입력한 다음 마커 일부를 가리자 입력란이 닫혔다. 같은 조합이 복귀하자 빈 입력란이 열렸고 0건·0점이었다. |
| 같은 조합 재노출·앱 프로세스 재시작 | 통과. 합계 27에 정확한 예측을 제출해 1건·10점을 기록했다. 제거 뒤 같은 조합을 다시 보여 주거나 앱을 강제 종료·재실행해도 입력이 닫혀 있었고 1건·10점이 유지됐다. |

검증한 APK SHA-256은 `7da19fe4d390eabddf9eb44ff4c1074cc36f4a819bb2f13ef9331af3de81bb36`이다. 기존 JVM 검사 19개도 통과했다. 첫 세 결과를 얻은 뒤 별도 Android 테스트가 동일 에뮬레이터의 전면 화면을 얻어 실행이 중단됐다. 마지막 항목은 독립 ADB 서버와 장치에서 이어서 확인했다. 입력 이벤트를 연속 실행하도록 자동화를 보정했으며 앱 소스 변경 없이 검증했다.

- [제거·교체·가림 실행 로그](../build/guess-flow/emulator-guess-flow.txt) 및 [가림 복귀 화면 구조](../build/guess-flow/recovered-no-score.xml)
- [중복 채점 실행 로그](../build/guess-flow/emulator-duplicate.txt) 및 [재시작 후 화면 구조](../build/guess-flow/duplicate-after-restart.xml)

## 재현

Android 컴패니언 폴더에서 [52장 검증 보고서](deck-audit-report.md)의 준비 명령으로 `build/generated/Layout30.java`와 `build/deck-classes`를 만든다. 사용자 기록과 분리된 API 36 테스트용 AVD `QRokerGuessIsolated`를 준비한다. 확인한 화면 설정은 720×1440, 320 DPI이고, 시험 시작 시 앱의 추측 기록은 0건이다.

```powershell
python tests/generate-deck-fixtures.py $qrSource build/guess-flow
& "$qrJava/java.exe" -cp build/deck-classes com.qroker.offline.DeckAudit build/guess-flow --guess-flow
python tests/make-emulator-clip.py build/guess-flow --guess-flow
```

PowerShell 7.4 이상에서 별도 ADB 서버와 포트를 사용한다.

```powershell
$qrAdb = 'D:/Android/Sdk/platform-tools/adb.exe'
$qrEmu = 'D:/Android/Sdk/emulator/emulator.exe'
$qrClip = (Resolve-Path 'build/guess-flow/guess-flow.avi').Path
$env:ANDROID_ADB_SERVER_PORT = '5062'
$env:ADB_LOCAL_TRANSPORT_MAX_PORT = '5553'
& $qrAdb -P 5062 start-server
Start-Process -FilePath $qrEmu -ArgumentList @('-avd','QRokerGuessIsolated','-no-window','-no-audio',
    '-gpu','swiftshader_indirect','-no-snapshot','-no-metrics','-ports','5582,5623',
    '-camera-back',"videofile:$qrClip",'-camera-front','none') -WindowStyle Hidden
# Run after the test device has booted.
& $qrAdb -P 5062 connect 127.0.0.1:5623
./tests/emulator-guess-flow.ps1
./tests/emulator-guess-flow.ps1 -DuplicateOnly
```

스크립트는 장치 이름, 비행기 모드와 Wi-Fi 꺼짐을 확인하고 앱에 ADB로 입력한다. 검증한 화면 구조와 실행 로그는 `build/guess-flow/`에 생성된다. 에뮬레이터와 영상은 로컬 시험 자료다.

이 시험은 판독 결과가 화면에 반영된 뒤의 입력 취소를 확인한다. 실제 휴대전화의 인쇄 카드 판독률이나 장면 전환부터 제거가 표시되기까지의 지연은 대기 중이다.
