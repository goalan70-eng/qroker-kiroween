# QRoker Android 52장 합성 판독 검증

Codex가 기존 Android v0.1.0 판독 코드(`src/OpticalReader.java`)와 30 mm 조립 레이아웃으로 실행했다. 32개 조합에는 기존 인쇄 예제 1개, 네 장이 같은 랭크인 조합 13개, 랭크를 섞은 조합 13개, 클럽·스페이드 전용 조합 5개가 있다. 각 카드가 허용되는 사분면만 사용했다. 기존 인쇄 예제의 테스트 렌더링은 30 mm 레이아웃의 `assembled` 레이어와 바이트가 일치했다.

## 판독 결과

| 합성 조건 | 정확한 카드 ID 네 개와 합계 | 카드 한 장 누락 거부 | 전부 누락 거부 |
|---|---:|---:|---:|
| 정면, 151픽셀 | 32/32 | — | — |
| 60° 저조도, 151픽셀 | 64/64 | 128/128 | 32/32 |
| 60° 저조도, 96픽셀 | 64/64 | 128/128 | 32/32 |

60° 저조도의 두 폭 각각에서 52개 ID 전체가 적어도 한 번 정확히 읽혔다. 클럽·스페이드 전용 조합은 저조도 두 폭에 걸쳐 20/20 정확히 읽혔다. 완성 조합의 잘못된 ID·합계와 누락 조합의 잘못된 승인은 모두 0건이었다. 각 누락 조합은 네 위치에서 한 장씩 제거했다. 기존 채점·판독 JVM 회귀 검사 19개도 통과했다.

입력은 1,280×960 합성 휘도 프레임이다. 폭은 정면 환산값이다. 카드의 직선 변은 맞닿고 중앙에는 기존 둥근 모서리 공백을 사용했다. 카메라 위치, 영상 내 회전, 미세 위치와 노이즈는 고정 시드(26112052 및 케이스별 오프셋)로 달라진다. 저조도 모델의 8비트 휘도 기준값은 카드 94, 잉크 10, 배경 약 64이고, 최대 ±8의 노이즈와 서브픽셀 샘플링을 적용했다. 카드 표면의 무늬, 광택과 반사는 시뮬레이션하지 않았다. 실제 촬영 거리, 인식률, 제거 지연 및 실물 시험은 대기 중이다.

## Android 앱 실행 결과

Android API 36의 전용 에뮬레이터에서 비행기 모드와 Wi-Fi 꺼짐을 확인하고, 기존 APK의 후면 카메라에 60° 저조도 합성 영상을 넣었다.

1. 5♥·9♦·J♣·2♠를 읽고 정답을 숨긴 채 입력을 열었다. 예측 27 제출 시 정답 27과 +10점을 기록했다.
2. 카드 한 장이 빠진 장면에서 연속 두 번 조회했을 때 추측 입력이 없었고, 직전 10점이 유지됐다.
3. 네 장이 모두 K인 다음 조합에서 예측 49를 제출해 정답 52와 +3점을 기록했다. 총점은 13점이 됐다.
4. 앱 프로세스를 강제 종료한 뒤 다시 실행해 두 추측 기록과 총점 13점을 확인했다.

첫 자동화 시도는 입력란에 값이 남아 있는지 확인하는 단계에서 시간 초과됐다. 입력란의 포커스를 확인한 뒤 숫자를 입력하도록 시험 절차를 보정하고 다시 실행해 위 네 동작을 검증했다. 실행 로그의 시각은 자동화 시작부터의 경과 시간이므로 카메라 판독·제거 지연으로 해석할 수 없다.

## 재현

Android SDK 및 기존 로컬 30 mm 자료가 있는 Windows에서 Android 컴패니언 폴더를 작업 디렉터리로 사용한다.

```powershell
$qrSource = '<로컬 30 mm 자료 폴더의 절대 경로>'
$qrJava = 'D:/Android/Android Studio1/jbr/bin'
New-Item -ItemType Directory -Path build/deck-classes,build/generated -Force | Out-Null
python generate-layout.py $qrSource build/generated/Layout30.java
python tests/generate-deck-fixtures.py $qrSource build/deck-audit
& "$qrJava/javac.exe" -encoding UTF-8 -d build/deck-classes src/OpticalReader.java build/generated/Layout30.java tests/DeckAudit.java
& "$qrJava/java.exe" -Xmx512m -cp build/deck-classes com.qroker.offline.DeckAudit build/deck-audit
& "$qrJava/java.exe" -cp build/deck-classes com.qroker.offline.DeckAudit build/deck-audit --emulator
python tests/make-emulator-clip.py build/deck-audit
```

에뮬레이터 단계에는 테스트 전용 API 36 AVD `QRokerAudit`와 포트 5560을 사용한다. 에뮬레이터의 `-camera-back videofile:<score-sequence.avi의 절대 경로>`로 생성한 클립을 연결한다. 앱의 초기 총점은 0점이어야 한다. 부팅이 끝나면 PowerShell 7에서 `./tests/emulator-deck-audit.ps1`을 실행한다. 클립은 완성 45초, 한 장 누락 20초, 다른 완성 조합 35초로 구성된다.

- [480건 개별 결과 TSV](results/results.tsv)와 [32개 조합 TSV](results/groups.tsv)
- [에뮬레이터 실행 로그](results/emulator-results.txt)
- 30 mm 레이아웃 SHA-256 `2c3db6c925c50c6b3b7e85e3e735061d0540a42bc903bf3a7d45171059fdda52`
- 52장 코드북 SHA-256 `3a1ee58f7292674b30b3604feed1194be779b0eb0f9dc3deb56941a26288d2bb`
- Android APK SHA-256 `9a6284fd0fc7d108b6233b59582916959c27f895a1afc364b1190019906f1cd6`
