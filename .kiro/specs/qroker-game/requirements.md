# Requirements Document

## Introduction

QRoker는 하이브리드 카드 배치 및 추론 게임이다. 플레이어는 8×8 보드에 카드를 배치하여 2×2 그룹을 형성하고, 해당 그룹의 카드 합산값을 비공개로 예측한 뒤 점수를 경쟁한다. 핵심 혁신은 카드 4장의 코너를 조합해 광학 마커(복합 코드)를 구성하는 메커닉이다.

본 문서는 두 가지 모드를 다룬다:
1. **Browser Practice Mode** — 3명의 로컬 AI 플레이어와 대결하는 브라우저 게임
2. **Scoring Companion Mode** — 물리 카드 실전 플레이를 위한 모바일 점수 보조 앱

기술 타당성 검토(QR코드 vs 커스텀 광학 마커), 게임 메커닉 유효성, 오프라인 우선 구현이 설계의 핵심 제약이다.

---

## Glossary

- **Board**: 8×8 격자. 열은 A–H, 행은 1–8로 표기. 기본 시작 카드 4장은 D4, E4, D5, E5에 위치.
- **Card**: 표준 52장 덱 + 조커 1장, 총 53장. 각 카드는 패(Suit)와 숫자(Rank)를 가진다.
- **Card_Value**: 카드 숫자 점수. A=1, 2–10=액면가, J=11, Q=12, K=13, Joker=0.
- **Quad_Group**: 보드 위 인접한 2×2 위치를 점유하는 서로 다른 4장의 카드 집합.
- **Composite_Code**: Quad_Group의 4장 카드 코너 조각이 결합되어 형성되는 광학 마커.
- **Hidden_Sum**: Quad_Group을 구성하는 4장의 Card_Value 합산값. 플레이어가 예측하는 대상.
- **Guess**: 플레이어가 Quad_Group 형성 시 비공개로 입력하는 Hidden_Sum 예측값.
- **Score**: 플레이어의 게임 내 누적 점수. Guess 정확도와 그룹 생성 기여에 따라 산정.
- **Placement_Action**: 손패에서 카드를 보드의 인접한 빈 칸에 놓는 행동.
- **Swap_Action**: 보드 위 두 카드의 위치를 교환하는 행동. 게임당 1회로 제한.
- **AI_Player**: 오프라인 로컬 알고리즘으로 구동되는 비인간 플레이어. 외부 API 불필요.
- **Optical_Marker**: 카드 코너 조각 4개가 조합되어 식별 가능한 복합 시각 패턴.
- **Game_Engine**: 보드 상태, 액션 유효성, 점수 계산을 관리하는 핵심 로직 모듈.
- **Scoring_Companion**: 물리 카드 플레이를 위한 점수 입력 및 집계 도우미 앱.
- **Service_Worker**: 오프라인 접근을 위한 브라우저 캐싱 메커니즘.
- **Card_Orientation**: 카드가 보드에 배치될 때의 회전 각도. 0° 또는 180°만 허용되며, 90°/270°는 지원하지 않는다.
- **Inward_Corner**: 2×2 그룹 내에서 카드의 코너 중 그룹 중심을 향하는 코너. 카드 방향에 따라 달라진다.
- **Fragment_Pixel**: 카드에 인쇄된 광학 조각의 실제 픽셀 데이터. 회전 시 새로 생성되지 않고 기존 픽셀이 회전 변환된다.
- **Suit_Group**: 무늬(Suit)를 인쇄된 조각 배치 패턴으로 분류한 그룹. (A) 대각선 패턴: 하트(♥) — TL+BR 코너, 다이아몬드(♦) — TR+BL 코너. (B) 면 패턴: 클럽(♣) — TL+BL(좌측면) 또는 TR+BR(우측면), 스페이드(♠) — TL+TR(상단면) 또는 BL+BR(하단면). 회전 허용 여부는 Fragment_Layout에서 정의한다.
- **Fragment_Layout**: 각 카드 무늬별로 영구 인쇄된 광학 조각의 코너 위치. 하트: TL+BR(대각A). 다이아몬드: TR+BL(대각B). 클럽: TR+BR(우측면). 스페이드: BL+BR(하단면). 조커: BR(우하 단일). 이 배치는 물리 카드에 고정이며 게임 중 변경되지 않는다.

---

## Requirements

### Requirement 1: 카드 값 및 Hidden Sum 계산

**User Story:** 게임 진행자로서, 나는 2×2 카드 그룹의 숨겨진 합산값이 일관되게 계산되기를 원하며, 그래야 모든 플레이어가 동일한 기준으로 예측을 검증할 수 있다.

#### Acceptance Criteria

1. THE Game_Engine SHALL 각 카드의 Card_Value를 다음 규칙으로 결정한다: A=1, 숫자 카드(2–10)=액면가, J=11, Q=12, K=13, Joker=0.
2. WHEN Quad_Group이 형성되면, THE Game_Engine SHALL 해당 그룹의 Card_Value 4개를 합산하여 Hidden_Sum을 산출한다.
3. THE Game_Engine SHALL Quad_Group을 정확히 4장의 카드로 구성하되, 동일한 무늬+숫자 조합의 카드는 중복 포함될 수 없으며, Joker는 최대 1장만 포함될 수 있다.
4. THE Game_Engine SHALL Hidden_Sum이 항상 3 이상 52 이하의 정수임을 보장한다. (최솟값: Joker+A+A+A=0+1+1+1=3, 최댓값: K×4=13×4=52)
5. THE Game_Engine SHALL 동일한 4장 카드 조합에 대해 카드 배치 순서와 무관하게 항상 동일한 Hidden_Sum을 산출한다.

---

### Requirement 2: 점수 계산

**User Story:** 플레이어로서, 나는 내 예측 정확도에 따라 점수가 명확하고 예측 가능하게 부여되기를 원하며, 그래야 전략적 선택에 의미가 생긴다.

#### Acceptance Criteria

1. WHEN 플레이어의 Guess와 Hidden_Sum의 오차가 0이면, THE Game_Engine SHALL 해당 플레이어에게 +5점을 부여한다.
2. WHEN 플레이어의 Guess와 Hidden_Sum의 절댓값 오차가 1이면, THE Game_Engine SHALL 해당 플레이어에게 +2점을 부여한다.
3. WHEN 플레이어의 Guess와 Hidden_Sum의 절댓값 오차가 2이면, THE Game_Engine SHALL 해당 플레이어에게 +1점을 부여한다.
4. WHEN 플레이어의 Guess와 Hidden_Sum의 절댓값 오차가 3 이상이면, THE Game_Engine SHALL 해당 플레이어에게 추측 점수 0점을 부여한다.
5. WHEN 플레이어의 단일 액션으로 N개의 새로운 Quad_Group이 동시에 형성되면, THE Game_Engine SHALL 해당 플레이어에게 N×(+1)의 완성 보너스를 부여한다.
6. THE Game_Engine SHALL 점수 산출 시 현재 라운드의 Guess와 Hidden_Sum만을 사용하며, 이전 라운드의 Guess 또는 점수 이력에 접근하지 않는다.
7. WHEN 모든 플레이어의 Guess 수집이 완료되면, THE Game_Engine SHALL 각 플레이어의 획득 점수와 누적 Score를 동시에 공개하되, 개별 Guess 값은 공개하지 않는다.
8. WHEN 플레이어의 Guess 입력 창이 열리면, THE Game_Engine SHALL 입력 가능한 값의 범위를 3 이상 52 이하의 정수로 제한한다.

---

### Requirement 3: 보드 및 배치 규칙

**User Story:** 플레이어로서, 나는 카드 배치와 스왑 규칙이 명확하게 강제되기를 원하며, 그래야 유효하지 않은 이동으로 인한 혼란이 없다.

#### Acceptance Criteria

1. THE Board SHALL 8×8 격자(A1–H8)로 구성되며, 게임 시작 시 D4, E4, D5, E5에 중립 카드 4장이 배치된다.
2. WHEN 플레이어가 Placement_Action을 수행하면, THE Game_Engine SHALL 해당 위치가 기존 배치 카드와 상하좌우로 인접하는지 검증하고, 인접하지 않으면 해당 액션을 거부한다.
3. WHEN 플레이어가 Placement_Action을 수행하면, THE Game_Engine SHALL 해당 위치가 보드 경계(A–H, 1–8) 내에 있는지 검증하고, 범위를 벗어나면 해당 액션을 거부한다.
4. WHEN 플레이어가 Placement_Action을 수행하면, THE Game_Engine SHALL 해당 위치가 비어 있는지 검증하고, 이미 카드가 있으면 해당 액션을 거부한다.
5. THE Game_Engine SHALL 게임 전체에서 플레이어 1인당 Swap_Action을 최대 1회로 제한한다.
6. WHEN 플레이어가 2번째 Swap_Action을 시도하면, THE Game_Engine SHALL 해당 요청을 거부하고 남은 스왑 횟수가 0임을 알린다.
7. WHEN Placement_Action 또는 Swap_Action이 완료되면, THE Game_Engine SHALL 새롭게 완성된 모든 Quad_Group을 탐지한다.
8. FOR ALL 보드 상태 변환(배치 또는 스왑), 보드 위 카드의 총 수는 액션 전보다 Placement_Action이면 1 증가, Swap_Action이면 동일하게 유지된다 (보드 카드 수 불변성).
9. THE Game_Engine SHALL 카드 배치 시 Card_Orientation을 함께 기록하되, 다음 규칙을 적용한다: (a) 하트(♥)·다이아몬드(♦)는 Fragment_Layout이 대각선 패턴이므로 180° 회전 시 조각 위치가 변하지 않아 0°와 동등하다 — 두 값 모두 허용하되 게임 엔진은 동일하게 처리한다. (b) 클럽(♣)·스페이드(♠)는 Fragment_Layout이 면 패턴이므로 180° 회전 시 조각이 반대 면으로 이동한다 — 0° 또는 180°를 허용하되 Inward_Corner 조건 충족 여부로 유효성을 검증한다. (c) 조커는 단일 코너 패턴이므로 0°만 허용한다. 모든 카드에 대해 90°/270° 배치 시도는 거부한다.
10. WHEN 카드가 Quad_Group에 참여할 때, THE Game_Engine SHALL 해당 카드의 Fragment_Layout과 Card_Orientation을 조합하여 실제 조각 코너를 계산하고, 그 코너 중 하나 이상이 해당 보드 위치의 Inward_Corner와 일치하는지 검증한다. 일치하는 조각 코너가 없으면 해당 Quad_Group을 유효 그룹으로 판정하지 않는다. 대각선 패턴 카드(하트·다이아몬드)는 두 코너 중 하나가 항상 Inward_Corner와 일치한다.

---

### Requirement 4: Quad_Group 탐지 및 중복 방지

**User Story:** 게임 엔진 개발자로서, 나는 동일한 4장 카드 조합이 중복으로 점수를 받지 않도록 보장하고 싶으며, 그래야 점수 체계의 공정성이 유지된다.

#### Acceptance Criteria

1. WHEN 새로운 카드가 보드에 배치되거나 스왑되면, THE Game_Engine SHALL 변경된 위치를 포함하는 모든 2×2 후보 영역을 검사한다.
2. WHEN 2×2 영역 내 4개 셀 모두 카드로 채워지면, THE Game_Engine SHALL 해당 Quad_Group을 유효 그룹으로 판정한다.
3. THE Game_Engine SHALL 채점된 Quad_Group을 고유 식별자로 기록하고, 동일한 식별자의 그룹에는 중복 점수를 부여하지 않는다. 고유 식별자는 4장 카드 ID(무늬+숫자)의 정렬된 집합(위치 순서 무관)으로 구성된다. 동일한 4장 카드 조합은 보드 위 위치나 배치 순서와 무관하게 하나의 식별자를 가진다.
4. WHEN Swap_Action으로 인해 보드 위 카드 구성이 변경되면, THE Game_Engine SHALL 해당 변경이 기존에 채점된 Quad_Group의 카드 집합 식별자에 영향을 주는지 확인한다. 영향을 주지 않으면(다른 위치의 카드 교환) 기존 채점 기록을 유지한다. 영향을 주면(채점된 그룹 내 카드 교환) 해당 식별자를 기록에서 제거하고, 이후 동일한 카드 집합이 다시 2×2를 이루면 새 채점 기회가 부여된다.
5. FOR ALL 보드 상태, 채점된 Quad_Group 집합은 멱등성을 가진다: 동일한 보드 상태에서 그룹 탐지를 반복 실행해도 새로운 그룹이 추가되지 않는다.

---

### Requirement 5: 광학 코드 메커닉 및 기술 방식 결정

**User Story:** 프로덕트 오너로서, 나는 카드 코너 조각이 결합되어 인식 가능한 광학 마커를 형성하는 방식이 실험적 증거에 기반해 결정되기를 원하며, 그래야 실현 불가능한 메커닉에 개발 비용을 낭비하지 않는다.

#### Acceptance Criteria

1. WHEN Requirement 12의 QR 타당성 실험이 완료되면, THE team SHALL 실험 결과를 근거로 다음 중 하나를 공식 결정으로 기록한다: (A) 표준 QR코드 4분할 방식 채택, (B) 커스텀 복합 코드(Composite Code) 방식 채택.
2. IF 실험 결과 표준 QR코드 방식이 채택되면, THE Game_Engine SHALL 모든 사용자 인터페이스와 문서에서 해당 마커를 "QR코드"로 표기한다.
3. IF 실험 결과 커스텀 복합 코드 방식이 채택되면, THE Game_Engine SHALL 모든 사용자 인터페이스와 문서에서 해당 마커를 "QR코드"가 아닌 "복합 코드(Composite Code)"로 표기하며, 사용된 기술(ArUco, AprilTag, 또는 컬러 그리드)을 명시한다.
4. THE Composite_Code SHALL (방식이 확정된 이후) 각 카드의 코너 조각을 Quad_Group 내 상대적 위치(좌상, 우상, 좌하, 우하)에 따라 인코딩하여, 4장을 조합하면 하나의 완전한 마커가 구성되도록 한다. 마커가 인코딩하는 정보는 Hidden_Sum이 아닌 Quad_Group 식별 정보(카드 구성)이며, Hidden_Sum은 Game_Engine이 별도로 산출한다.
5. WHEN 물리 카드를 스캔하면, THE Scoring_Companion SHALL 브라우저 네이티브 카메라 API(MediaDevices.getUserMedia)를 사용하여 5초 이내에 광학 마커를 인식하고 Hidden_Sum을 화면에 표시한다.
6. IF 5초 이내 스캔 인식에 실패하거나 카메라 API 오류가 발생하면, THE Scoring_Companion SHALL 현재 게임 상태를 유지한 채 수동 카드 값 입력 인터페이스로 전환한다.

---

### Requirement 6: 정보 비대칭 및 공개 순서

**User Story:** 플레이어로서, 나는 내 예측이 다른 플레이어의 추측 전략에 영향을 주지 않도록 보장되기를 원하며, 그래야 공정한 추론 경쟁이 성립한다.

#### Acceptance Criteria

1. WHEN Quad_Group이 형성되면, THE Game_Engine SHALL 모든 참여 플레이어의 Guess를 수집하기 전까지 Hidden_Sum을 시스템 UI에 표시하지 않는다. 단, 플레이어가 보드 위 카드를 직접 보고 합산을 추론하는 행위는 이 제약의 대상이 아니며, 이 제약은 소프트웨어가 자동 계산한 값의 표시 시점에만 적용된다.
2. WHEN 모든 Guess가 수집되면, THE Game_Engine SHALL Hidden_Sum을 공개하고 각 플레이어의 획득 점수(Guess 값 미포함)와 누적 Score를 동시에 표시한다.
3. THE Game_Engine SHALL 임의의 플레이어가 다른 플레이어의 Guess 값을 게임 진행 중에 열람하지 못하도록 한다.
4. WHEN 물리 카드를 뒤집어 Hidden_Sum을 공개할 때, THE Scoring_Companion SHALL 카드의 좌우 배치 방향(Composite_Code 조각의 좌우 위치)을 원래 보드 배치 기준으로 유지하여 미러링되지 않도록 한다.

---

### Requirement 7: AI 플레이어

**User Story:** 싱글 플레이어로서, 나는 인터넷 연결이나 유료 API 없이도 도전적인 AI 상대와 연습 게임을 즐기고 싶다.

#### Acceptance Criteria

1. THE Game_Engine SHALL 브라우저 로컬 환경에서 실행되는 AI_Player 알고리즘 3개를 제공하며, 외부 서버나 유료 AI API에 의존하지 않는다.
2. THE AI_Player SHALL 유효한 Placement_Action 또는 (스왑 제한 범위 내의) Swap_Action만 수행한다.
3. WHEN AI_Player의 차례가 되면, THE Game_Engine SHALL 3초 이내에 AI_Player의 행동을 결정하고 실행한다.
4. THE AI_Player SHALL Guess를 생성할 때 보드에 공개된 카드 정보만 사용하고, 다른 플레이어의 비공개 Guess에 접근하지 않는다.
5. WHERE 난이도 설정이 제공되면, THE AI_Player SHALL 최소 2가지 난이도(초급: 랜덤 유효 배치, 고급: Quad_Group 완성 가능성 최대화 휴리스틱)를 구현한다.

---

### Requirement 8: Browser Practice Mode

**User Story:** 게임 개발자로서, 나는 물리 카드 인쇄 전에 핵심 게임 루프를 브라우저에서 검증하고 싶으며, 그래야 인쇄 비용 낭비 없이 개념 증명이 가능하다.

#### Acceptance Criteria

1. THE Browser_Practice_Mode SHALL 표준 웹 브라우저(크롬, 파이어폭스, 사파리 최신 2버전)에서 설치 없이 실행된다.
2. THE Browser_Practice_Mode SHALL 8×8 보드, 카드 패, 배치/스왑 인터페이스, Guess 입력, 점수 표시를 포함하는 완전한 게임 루프를 구현한다.
3. THE Browser_Practice_Mode SHALL 물리 카드가 없어도 Composite_Code 시각화를 화면에 렌더링하여 광학 마커 디자인을 검증할 수 있게 한다.
4. WHEN 게임이 종료되면, THE Browser_Practice_Mode SHALL 최종 점수판과 각 Quad_Group의 Hidden_Sum 내역을 표시한다.
5. THE Browser_Practice_Mode SHALL 모바일 화면(320px 이상 너비)에서 터치 인터랙션으로 플레이 가능한 반응형 레이아웃을 제공한다.

---

### Requirement 9: Scoring Companion Mode (물리 카드 점수 보조)

**User Story:** 물리 카드 플레이어로서, 나는 실제 카드 게임 중에 점수 계산을 앱이 자동으로 처리해주기를 원하며, 그래야 게임 흐름을 방해하지 않고 정확한 점수 집계가 가능하다.

#### Acceptance Criteria

1. THE Scoring_Companion SHALL 카드 값 수동 입력(4장) 또는 카메라 스캔으로 Quad_Group의 Hidden_Sum을 산출하는 두 가지 입력 방식을 지원한다.
2. THE Scoring_Companion SHALL 각 플레이어의 Guess 입력 화면을 순차적으로 표시하여 이전 플레이어의 입력을 가리고 정보 비대칭을 유지한다.
3. WHEN Guess 수집이 완료되면, THE Scoring_Companion SHALL Hidden_Sum을 공개하고 점수 분배를 계산하여 표시한다.
4. THE Scoring_Companion SHALL Service_Worker를 통해 오프라인에서도 작동하며, 최초 로드 후 네트워크 연결 없이 전체 기능을 사용할 수 있다.
5. THE Scoring_Companion SHALL 진행 중인 게임 상태를 브라우저 로컬 스토리지에 저장하여 앱 재시작 또는 페이지 새로고침 후에도 게임을 이어갈 수 있다.

---

### Requirement 10: 오프라인 우선 및 배포 제약

**User Story:** 게임 운영자로서, 나는 인터넷이 불안정한 환경에서도 앱이 완전히 작동하기를 원하며, 그래야 파티나 야외 행사에서 사용 가능하다.

#### Acceptance Criteria

1. THE Game_Engine SHALL 계정 등록, 로그인, 외부 데이터베이스 연동 없이 완전히 작동한다.
2. THE Service_Worker SHALL 앱의 모든 정적 자산(HTML, CSS, JS, 카드 이미지)을 최초 방문 시 캐시하여 이후 오프라인 접근을 지원한다.
3. WHEN 네트워크 연결이 없을 때 앱에 접근하면, THE Service_Worker SHALL 캐시된 버전을 제공하고 오프라인 상태임을 사용자에게 알린다.
4. THE Scoring_Companion SHALL 계정 생성이나 서버 연동 없이 즉시 사용 가능하다.
5. WHERE 앱 업데이트가 있으면, THE Service_Worker SHALL 새 버전을 백그라운드에서 캐시하고 사용자가 직접 새로고침을 선택할 때만 업데이트를 적용한다.

---

### Requirement 11: 게임 전략 건전성 (Strategic Soundness)

**User Story:** 게임 디자이너로서, 나는 스왑 제한과 정보 비대칭 메커닉이 지배 전략이나 무의미한 게임 상태를 만들지 않는지 확인하고 싶다.

#### Acceptance Criteria

1. THE Game_Engine SHALL 게임 당 각 플레이어의 Swap_Action이 1회로 제한될 때, 플레이어가 Swap_Action 없이도 승리 가능한 경로가 존재함을 시뮬레이션 테스트로 검증한다.
2. WHEN 한 플레이어가 모든 Quad_Group을 단독으로 완성하는 전략을 시도할 때, THE Game_Engine SHALL 다른 플레이어들도 추측 점수(최대 +5)로 경쟁력을 유지할 수 있음을 점수 시뮬레이션으로 검증한다.
3. THE Game_Engine SHALL Guess 입력 유효성 검사에서 허용 범위를 Hidden_Sum의 실제 최솟값 3 이상, 최댓값 52 이하의 정수로 제한한다. (Requirement 1 Criterion 4와 일치)
4. IF 4명의 플레이어 모두 동일한 Guess를 입력하면, THE Game_Engine SHALL 모든 플레이어에게 동일한 점수 기준을 적용하고 타이브레이킹 규칙을 문서화한다.

---

### Requirement 12: QR코드 4분할 타당성 실험

**User Story:** 게임 개발자로서, 나는 4장의 독립적으로 배치된 카드 코너 조각이 표준 QR코드 스캐너로 읽힐 수 있는지 실험적 증거를 확보하고 싶으며, 그래야 마케팅 명칭과 기술 구현이 현실에 기반할 수 있다.

#### Acceptance Criteria

1. THE team SHALL 다음 세 시나리오를 명확히 구별하여 각각 실험한다: (A) 하나의 QR코드 이미지를 4등분한 조각을 재조합하는 재구성 실험, (B) 서로 독립적으로 생성된 4개의 QR코드에서 각각 코너 조각을 추출하여 조합하는 비호환 조합 실험, (C) 53장 고정 카드 제약 하에서 각 카드에 하나의 영구 인쇄된 QR 조각을 부여하고, 그 조각들이 여러 다른 Quad_Group 조합에서 재사용될 때도 표준 QR 디코더가 올바르게 동작하는지 검증하는 고정 조각 재사용 실험.
2. THE feasibility experiment SHALL 브라우저에서 실행 가능한 JavaScript 환경(jsQR 또는 ZXing-js 라이브러리)을 사용하여 Canvas API로 4개 이미지 조각을 합성한 뒤 QR 디코딩을 시도하고, 성공/실패 및 오류 유형을 기록한다.
3. WHEN 재구성 실험(시나리오 A)을 수행하면, THE experiment SHALL 정렬 오차를 0px, ±2px, ±5px, ±10px 단계로 변화시키며 각 오차 수준에서 최소 20회 디코딩을 시도하고 성공률을 기록한다. 또한 16가지 방향 조합(2⁴) 전체에 대해 각 카드의 Fragment_Layout(하트:TL+BR, 다이아:TR+BL, 클럽:TR+BR, 스페이드:BL+BR)과 Card_Orientation을 조합하여 실제 조각 위치를 계산하고, 보드 위치별 Inward_Corner 조건 충족 여부를 판정한다. 유효 조합(모든 4장의 Inward_Corner 조건 충족)에서의 디코딩 성공률과, 무효 조합(1장 이상 Inward_Corner 조건 불충족)에서의 거부율을 각각 기록한다. 모든 4가지 무늬 패턴(대각A·대각B·우측면·하단면)을 포함하는 픽스처를 사용한다.
4. WHEN 비호환 조합 실험(시나리오 B)을 수행하면, THE experiment SHALL 서로 다른 QR코드에서 추출한 4개 코너 조각을 조합했을 때 표준 QR 디코더가 유효한 코드로 인식하는지 여부를 기록하고, 인식 실패 시 오류를 다음 세 계층으로 분류한다: (1) 구조 오류 — 파인더 패턴 미탐지 또는 타이밍 패턴 단절, (2) 포맷 오류 — 포맷 정보 비트 불일치, (3) 데이터 오류 — 각 QR이 독립된 Reed-Solomon 오류 정정 블록을 가지므로 조각 조합 시 데이터 코드워드와 오류 정정 코드워드가 서로 다른 메시지에 속해 복원 불가. 시나리오 B의 결과는 사전 단정 없이 실험으로 기록한다. RS 블록 비호환성은 실패 가능성이 높은 원인이지만, 실제 디코더의 오류 정정 여유(error correction capacity)나 우연한 패턴 일치로 인한 부분 성공 가능성도 배제하지 않는다.
5. THE experiment SHALL 실험 결과를 다음 기준으로 판정한다: (1) 시나리오 A에서 ±2px 오차 이내 성공률 90% 이상, AND (2) 시나리오 C(고정 조각 재사용)에서 ±2px 오차 이내 성공률 90% 이상, AND (3) 시나리오 A의 회전 테스트에서 유효 방향 조합의 디코딩 성공률 90% 이상이면 "QR코드 방식 채택 가능". 시나리오 B(비호환 조합)는 판정 기준에 포함하지 않는다 — B는 QRoker의 실제 카드 운용 방식(카드별 고정 조각 인쇄)을 반영하지 않으므로 채택 판정의 근거로 적합하지 않다. B의 실험 결과는 QR 디코더의 오류 허용 특성을 이해하는 참고 데이터로만 활용한다. 위 조건을 충족하지 못하면 "커스텀 복합 코드 방식 채택"으로 판정한다.
6. THE team SHALL 실험 코드, 테스트 데이터, 측정 결과(성공률, 오차 허용 범위, 실패 원인)를 저장소에 커밋하여 재현 가능한 기록으로 남긴다.
7. WHEN 실험이 완료되면, THE team SHALL Requirement 5에 따라 공식 기술 방식 결정을 내리고 requirements.md에 결정 사항을 기록한다.

---

### Requirement 13: 광학 조각 독립 디코딩 및 합산 정확성

**User Story:** 점수 보조 앱 사용자로서, 나는 물리 카드를 스캔했을 때 각 카드의 신원이 올바르게 식별되고 Hidden_Sum이 정확히 계산되기를 원하며, 그래야 수동 입력 없이 신뢰할 수 있는 점수 집계가 가능하다.

#### Acceptance Criteria

1. THE optical reader SHALL 각 카드 코너 조각을 보드의 예상 상태와 독립적으로 디코딩하여 카드 ID(무늬+숫자), Card_Value, 및 Quad_Group 내 위치(좌상/우상/좌하/우하)를 반환한다. 보드 상태 조회 없이 이미지 데이터만으로 4가지 정보를 모두 결정해야 한다.
2. WHEN 4개의 조각이 모두 성공적으로 디코딩되면, THE optical reader SHALL 독립적으로 산출한 4개의 Card_Value 합산을 Hidden_Sum으로 반환하고, 이 값을 Game_Engine이 보드 상태로부터 계산한 참조값과 대조하여 일치 여부를 기록한다.
3. IF 디코딩된 Hidden_Sum이 Game_Engine의 참조값과 다르면, THE optical reader SHALL 스캔 결과를 거부하고 재스캔 또는 수동 입력을 요청하며, 불일치 Hidden_Sum을 게임에 적용하지 않는다.
4. THE optical reader SHALL 다음 각 오류 조건을 탐지하고 거부한다: (1) 누락 조각 — 4개 중 1개 이상 디코딩 실패, (2) 중복 조각 — 동일한 카드 ID가 2개 이상 탐지, (3) 손상 조각 — 디코딩 신뢰도가 임계값 미만, (4) 위치 오류 — 조각의 인코딩된 위치와 실제 Quad_Group 내 물리적 위치 불일치.
5. WHEN 카드가 유효한 Card_Orientation(0° 또는 허용된 180°)으로 스캔되면, THE optical reader SHALL Fragment_Pixel을 해당 각도로 회전 변환한 뒤 디코딩하여 카드 ID를 올바르게 반환한다. 회전 변환은 새로운 조각 이미지를 생성하지 않고 기존 Fragment_Pixel에 2D 회전 행렬을 적용한다.
6. WHEN 카드가 90° 또는 270° 방향으로 스캔되면, THE optical reader SHALL 해당 카드의 디코딩 결과를 무효로 표시하고 오류 유형 "지원되지 않는 방향"을 기록한다. WHEN 조커 카드가 180°로 스캔되면, THE optical reader SHALL 동일하게 무효 처리한다. 하트·다이아몬드 카드의 180° 스캔은 0°와 동등하므로 정상 처리한다. 클럽·스페이드 카드의 180° 스캔은 Inward_Corner 조건 검증 후 처리하며, 조건 미충족 시 오류 유형 "조각 방향 불일치"를 기록한다.
7. THE optical_reader_test_suite SHALL 고정 시드(seed)를 사용한 반복 가능한 무작위 테스트를 포함하며, 다음 케이스를 커버한다: (a) 유효 0° 조합 — 4가지 무늬(하트·다이아·클럽·스페이드) 각 1장씩, 각 카드의 Inward_Corner에 Fragment_Layout 조각이 위치하는 배치, (b) 유효 180° 조합 — 클럽·스페이드 카드를 180° 회전하여 Inward_Corner 조건이 여전히 충족되는 배치, (c) 대각선 패턴 동등성 — 하트·다이아를 0°/180°로 각각 배치했을 때 디코딩 결과가 동일함을 확인, (d) 경계값 카드 — 조커(Card_Value=0, 단일 BR 조각, 0° 고정) 및 K(Card_Value=13) 포함, (e) 거부 케이스 — 90° 배치 시도, 조각 없는 Inward_Corner, 중복 카드 ID, 누락 조각.
8. THE optical_reader_test_suite SHALL Requirement 12의 QR 실험과 독립적으로 실행 가능하며, QR 방식과 커스텀 복합 코드 방식 각각에 대해 동일한 테스트 케이스를 적용하여 방식별 디코딩 정확도를 비교한다.
---

### Requirement 14: 무늬별 광학 조각 배치 규칙 (Fragment Layout)

**User Story:** 카드 디자이너로서, 나는 각 무늬별로 광학 조각이 어느 코너에 인쇄돼야 하는지 명확하게 알고 싶으며, 그래야 53장 카드를 한 번 인쇄하면 모든 유효한 Quad_Group에서 조각이 올바르게 조합될 수 있다.

#### Acceptance Criteria

1. THE card design SHALL 각 무늬의 Fragment_Layout을 다음과 같이 영구 정의한다: 하트(♥) — TL(좌상)+BR(우하) 대각선A 패턴, 다이아몬드(♦) — TR(우상)+BL(좌하) 대각선B 패턴, 클럽(♣) — TR(우상)+BR(우하) 우측면 패턴, 스페이드(♠) — BL(좌하)+BR(우하) 하단면 패턴, 조커 — BR(우하) 단일 코너.
2. THE card design SHALL Fragment_Layout을 물리 카드에 영구 인쇄하며, 게임 중 보드 위치나 소프트웨어에 의해 동적으로 변경하지 않는다.
3. THE Game_Engine SHALL 2×2 보드 위치별 Inward_Corner를 다음과 같이 결정한다: 좌상(TL) 위치 카드 → BR이 Inward_Corner, 우상(TR) 위치 카드 → BL이 Inward_Corner, 좌하(BL) 위치 카드 → TR이 Inward_Corner, 우하(BR) 위치 카드 → TL이 Inward_Corner.
4. THE Game_Engine SHALL 카드의 Fragment_Layout 조각 코너 중 하나 이상이 해당 보드 위치의 Inward_Corner와 일치하는지 검증하여 Quad_Group 유효성을 판정한다. 유효한 조합의 예: 좌상 위치의 하트(TL+BR) — BR이 Inward_Corner(BR)와 일치 → 유효. 좌상 위치의 클럽(TR+BR) — BR이 Inward_Corner(BR)와 일치 → 유효. 좌상 위치의 스페이드(BL+BR) — BR이 Inward_Corner(BR)와 일치 → 유효. 좌상 위치의 다이아몬드(TR+BL) — 두 조각 모두 Inward_Corner(BR)와 불일치 → 무효(0°일 때).
5. WHEN 클럽(♣) 또는 스페이드(♠) 카드가 180° 회전 배치되면, THE Game_Engine SHALL Fragment_Layout을 180° 변환하여 유효성을 재검증한다: 클럽 180° → TL+BL(좌측면), 스페이드 180° → TL+TR(상단면). 변환 후 Inward_Corner 일치 여부가 달라질 수 있다.
6. THE Game_Engine SHALL 조커를 0°로만 배치 가능하며, 조커의 단일 조각(BR)이 해당 보드 위치의 Inward_Corner(BR)와 일치하는 위치인 우하(BR) 위치에만 조커가 유효한 Quad_Group 참여자가 됨을 검증한다. 단, 우하 이외의 위치에 조커가 배치되면 Quad_Group 탐지에서 제외되지 않고 유효성 검증에서 실패로 처리한다.
7. THE feasibility_test_suite SHALL 14.4에 정의된 유효 조합과 무효 조합을 각각 픽스처로 구성하여 광학 디코딩 정확도를 검증하고, 모든 4가지 무늬 패턴과 조커를 포함한 케이스를 자동화 테스트로 커버한다.