# QRoker 큐로커

트럼프 카드 한 장을 놓아 네 모서리의 무늬를 완성하세요. 코드가 만들어지면 네 사람이 카드 숫자의 합을 각자 예측합니다. 정답에 가까울수록 높은 점수를 받습니다.

**[브라우저에서 바로 플레이](https://goalan70-eng.github.io/qroker-kiroween/)** · [English](README.md) · [심사판 소스](https://github.com/goalan70-eng/qroker-kiroween/tree/kiroween-2026-beta)

| 하고 싶은 일 | 방법 |
| --- | --- |
| 혼자 또는 함께 플레이 | 브라우저에서 **Start game**을 누르면 AI 세 명과 시작합니다. 최대 네 사람이 한 기기를 돌려가며 할 수 있습니다. 기본 언어는 영어이며 언어 메뉴에서 한국어를 선택할 수 있습니다. |
| 인터넷 없이 플레이 | [QRoker.html](https://github.com/goalan70-eng/qroker-kiroween/releases/download/kiroween-2026-beta/QRoker.html)을 내려받아 Chrome이나 Edge에서 엽니다. 효과음과 카드 도안도 들어 있습니다. |
| 실물 카드로 내 점수 기록 | Android 8 이상에 [기본 APK 0.2.27](https://github.com/goalan70-eng/qroker-kiroween/releases/download/kiroween-2026-beta/QRoker-Offline.apk)를 설치합니다. 예전 보관본에서 설치했다면 [보관본용 업데이트](https://github.com/goalan70-eng/qroker-kiroween/releases/download/kiroween-2026-beta/QRoker-Offline-ArchiveUpdate.apk)를 사용해야 기존 점수를 유지할 수 있습니다. |

## 첫 턴부터 채점까지

1. 손패 세 장 중 하나와 기존 카드의 상하좌우에 표시된 칸을 고릅니다. 클럽과 스페이드는 180° 돌릴 수 있습니다. 체크 표시를 누르면 배치가 확정됩니다.
2. 새 코드가 없으면 첫 턴부터 한 장을 뽑습니다. 네 카드의 모서리가 코드를 완성하면 각자 합을 예측합니다. A는 1, J는 11, Q는 12, K는 13입니다. 정확히 맞히면 10점입니다.
3. **일반 모드**에서는 중앙 네 장을 펴고 시작합니다. 모두가 예측하면 완성된 네 장과 정답 합을 공개합니다. **블라인드 모드**에서는 내 손패를 볼 수 있고 보드는 끝까지 뒷면입니다. 예측 후에는 ‘정답 합과 점수’ 또는 ‘점수만’ 중에서 선택한 정보를 보여줍니다.

실물 카드에서는 앱의 **코드 인식 → 이 코드 고정**을 차례로 누르세요. 고정되면 휴대전화를 내려놓고 4~52의 예측값을 입력해 채점합니다. 내 예측과 획득 점수를 확인할 수 있습니다. 네 장이 서로 다르면 합이 같아도 별도로 기록됩니다. [Android 설치·사용 안내](https://github.com/goalan70-eng/qroker-kiroween/blob/codex/android-offline-companion/prototypes/android-offline-companion/README.md) · [실물 카드 시험표](https://github.com/goalan70-eng/qroker-kiroween/blob/codex/android-offline-companion/docs/validation/offline-reader-real-device-ko.md)

[전체 규칙과 점수표](PROJECT_BRIEF.md) · [빌드와 테스트](docs/practice-mode.md) · [배포 파일 전체](https://github.com/goalan70-eng/qroker-kiroween/releases/tag/kiroween-2026-beta) · [도안·효과음 출처](https://github.com/goalan70-eng/qroker-kiroween/blob/kiroween-2026-beta/docs/submission/credits.md)
