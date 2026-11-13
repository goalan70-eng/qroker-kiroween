# Requirements Document

## Introduction

QRoker는 하이브리드 카드 배치 및 추론 게임이다. 플레이어는 8×8 보드에 카드를 배치하여 2×2 그룹(Composite Code)을 형성하고, 해당 그룹의 카드 합산값을 비공개로 예측한 뒤 점수를 경쟁한다.

표준 52장 덱을 사용하며 조커는 사용하지 않는다. 본 문서는 두 가지 모드를 다룬다: (1) Browser Practice Mode — 3명의 로컬 AI 플레이어와 대결하는 브라우저 게임, (2) Physical Scoring Companion — 물리 카드 실전 플레이를 위한 모바일 점수 보조 앱.

광학 마커 시스템, 게임 메커닉 유효성, 오프라인 우선 구현이 설계의 핵심 제약이다. 점수 수치는 게임 시뮬레이션을 통해 결정되며 현재 미확정이다.

---

## Glossary

- **Board**: 8×8 격자. 열은 A–H, 행은 1–8로 표기. 기본 시작 카드 4장은 D4, E4, D5, E5에 위치.
- **Card**: 표준 52장 덱. 조커 없음. 각 카드는 패(Suit: ♠♥♦♣)와 숫자(Rank: A,2–10,J,Q,K)를 가진다.
- **Card_Value**: 카드 숫자 점수. A=1, 숫자 카드(2–10)=액면가, J=11, Q=12, K=13.
- **Quad_Group**: 보드 위 인접한 2×2 위치를 점유하는 서로 다른 4장의 카드 집합. 모든 4장의 Inward_Corner에 유효한 광학 조각이 있을 때 Composite Code로 인정된다.
- **Composite_Code**: Quad_Group의 4장 카드 코너 조각이 결합되어 형성되는 광학 마커.
- **Hidden_Sum**: Composite Code(2×2 그룹)를 구성하는 4장의 Card_Value 합산값. 최솟값 4(A×4=1+1+1+1), 최댓값 52(K×4=13×4). 플레이어가 예측하는 대상.
- **Guess**: 플레이어가 Quad_Group 형성 시 비공개로 입력하는 Hidden_Sum 예측값.
- **Score**: 플레이어의 게임 내 누적 점수. 예측 점수와 Hand_Empty_End 보너스의 합으로 산정한다.
- **Placement_Action**: 손패에서 카드를 보드의 인접한 빈 칸에 놓는 행동.
- **AI_Player**: 오프라인 로컬 알고리즘으로 구동되는 비인간 플레이어. 외부 API 불필요.
- **Optical_Marker**: 카드 코너 조각 4개가 조합되어 식별 가능한 복합 시각 패턴.
- **Game_Engine**: 보드 상태, 액션 유효성, 점수 계산을 관리하는 핵심 로직 모듈.
- **Scoring_Companion**: 물리 카드 플레이를 위한 점수 입력 및 집계 도우미 앱 (Physical Scoring Companion).
- **Service_Worker**: 오프라인 접근을 위한 브라우저 캐싱 메커니즘.
- **Card_Orientation**: 카드가 보드에 배치될 때의 회전 각도. 0° 또는 180°만 허용되며, 90°/270°는 지원하지 않는다.
- **Inward_Corner**: 2×2 그룹에서 카드가 그룹 중심(꼭짓점)을 향하는 코너. 위치는 슬롯으로 정해지며(TL→BR, TR→BL, BL→TR, BR→TL), 그 위치에 오는 인쇄 코너는 Card_Orientation에 따라 달라진다.
- **Fragment_Pixel**: 카드에 인쇄된 광학 조각의 실제 픽셀 데이터. 회전 시 새로 생성되지 않고 기존 픽셀이 회전 변환된다.
- **Suit_Group**: 무늬(Suit)를 Fragment_Layout 대칭 패턴으로 분류한 그룹. (A) 180° 점대칭: 하트(TL+BR), 다이아몬드(TR+BL) — 180° 회전 시 조각 위치 변화 없음. (B) 수평 반사 대칭: 클럽(TR+BR→우측면), 스페이드(TL+BL→좌측면) — 180° 회전 시 조각이 반대 면으로 이동.
- **Fragment_Layout**: 각 카드 무늬별로 영구 인쇄된 광학 조각의 코너 위치. 하트(♥): TL+BR(대각A, 180° 점대칭). 다이아몬드(♦): TR+BL(대각B, 180° 점대칭). 클럽(♣): TR+BR(우측면, 수평 반사 대칭). 스페이드(♠): TL+BL(좌측면, 수평 반사 대칭). 조커 없음. 이 배치는 물리 카드에 고정이며 게임 중 변경되지 않는다.
- **Draw_Rule**: 플레이어가 카드를 배치했을 때 새로운 Composite Code가 완성되지 않으면 덱에서 1장을 드로우한다. 첫 번째 라운드(각 플레이어의 첫 번째 배치)는 드로우 의무에서 제외된다.
- **Hand_Empty_End**: 플레이어의 손패가 0장이 되는 순간 게임이 종료된다. 해당 액션과 관련된 모든 채점 및 예측 수집이 완료된 후 종료 처리한다. 손패 소진 보너스는 수치 미확정이며 시뮬레이션으로 결정한다.
- **Fragment_Template**: 카드 기반 패턴(5×5 이진 격자)에 2차원 대칭군 D4의 변환(회전 0°/90°/180°/270°, 수평축·수직축·두 대각선 반사)을 적용한 결과. 52장 × 8변환 = 416개.
- **Camera_Rotation**: 촬영 이미지 전체의 회전. 카드의 물리적 배치 방향(Card_Orientation)과 구분되며 임의 각도를 허용한다.
- **Corner_Radius**: 카드 모서리의 둥근 정도. 기준값은 3.175 mm(1/8 inch). 상용 인쇄 업체 자료에서 약 3–3.6 mm 범위가 보이며 공식 표준 규격으로 확인되지 않았다.
- **Central_Void**: 간격 없이 붙인 2×2 배치에서 네 카드의 둥근 안쪽 모서리 사이에 생기는 작은 빈 영역. 이음매를 따라 중심에서 Corner_Radius만큼 뻗는 뿔 네 개 모양이다.
- **Printable_Area**: 카드 윤곽(둥근 모서리 포함) 안쪽으로 인쇄 내용이 놓일 수 있는 영역.
- **Marker_Inset**: 마커 발자국(흰 여백 포함)의 바깥 모서리와 카드 가장자리 사이 거리. 기준값은 1모듈(1.5875 mm).
- **Distractor_Marker**: 같은 이미지에 보이지만 대상 꼭짓점을 향하지 않는 마커(카드의 바깥쪽 조각, 다른 꼭짓점 주위의 조각).

---

## Requirements

### Requirement 1: 카드 값 및 Composite Code 합산 계산

**User Story:** 게임 진행자로서, 나는 2×2 Composite Code의 숨겨진 합산값이 일관되게 계산되기를 원하며, 그래야 모든 플레이어가 동일한 기준으로 예측을 검증할 수 있다.

#### Acceptance Criteria

1. THE Game_Engine SHALL 각 카드의 Card_Value를 다음 규칙으로 결정한다: A=1, 숫자 카드(2–10)=액면가, J=11, Q=12, K=13. 조커는 덱에 포함되지 않는다.
2. WHEN Composite Code(Quad_Group)가 형성되면, THE Game_Engine SHALL 해당 그룹의 Card_Value 4개를 합산하여 Hidden_Sum을 산출한다.
3. THE Game_Engine SHALL Composite Code를 정확히 4장의 카드로 구성하되, 동일한 무늬+숫자 조합의 카드는 중복 포함될 수 없다.
4. THE Game_Engine SHALL Hidden_Sum이 항상 4 이상 52 이하의 정수임을 보장한다. (최솟값: A+A+A+A=4, 최댓값: K+K+K+K=52)
5. THE Game_Engine SHALL 동일한 4장 카드 조합에 대해 카드 배치 순서와 무관하게 항상 동일한 Hidden_Sum을 산출한다.

---

### Requirement 2: 점수 계산

**User Story:** 플레이어로서, 나는 내 예측 정확도에 따라 점수가 명확하고 예측 가능하게 부여되기를 원하며, 그래야 전략적 선택에 의미가 생긴다.

#### Acceptance Criteria

1. WHEN 예측이 채점되면, THE Game_Engine SHALL 절댓값 오차 e = |Guess − Hidden_Sum|만으로 예측 점수를 결정하며, 크기가 같은 양·음 오차에는 같은 점수를 부여한다.
2. THE Game_Engine SHALL 예측 점수를 설정 가능한 오차별 보상 테이블로 계산하되, e=0에 최고 점수를 부여하고 e가 커질 때 점수가 증가하지 않도록 한다.
3. WHEN e가 보상 테이블이 정의한 최대 오차를 초과하면, THE Game_Engine SHALL 예측 점수 0을 부여한다.
4. THE Game_Engine SHALL 보상 테이블의 길이(오차 단계 수)와 각 수치를 코드에 고정하지 않고 설정값으로 주입받는다. 이 값들은 게임 시뮬레이션 후 결정한다. IF 설정값에 음수가 있거나 e에 대해 증가하는 구간이 있으면, THEN THE Game_Engine SHALL 해당 설정을 거부한다.
5. THE Game_Engine SHALL Composite Code 완성에 대해 별도의 완성 보너스 점수를 부여하지 않는다. 완성 자체가 예측 채점 기회와 Hand_Empty_End 보너스로 이미 보상된다.
6. THE Game_Engine SHALL 점수 산출 시 현재 라운드의 Guess와 Hidden_Sum만을 사용하며, 이전 라운드의 Guess 또는 점수 이력에 접근하지 않는다.
7. WHEN 모든 플레이어의 Guess 수집이 완료되면, THE Game_Engine SHALL 각 플레이어의 획득 점수와 누적 Score를 동시에 공개하되, 개별 Guess 값은 공개하지 않는다.
8. WHEN 플레이어의 Guess 입력 창이 열리면, THE Game_Engine SHALL 입력 가능한 값의 범위를 4 이상 52 이하의 정수로 제한한다.
9. WHEN 플레이어의 손패가 0장이 되면, THE Game_Engine SHALL 해당 플레이어에게 Hand_Empty_End 보너스 B를 부여한다. (B의 수치 미확정; 예측 점수 합산 대비 의미 있지만 압도적이지 않은 수치로 시뮬레이션으로 결정)

---

### Requirement 3: 보드, 배치 규칙, 드로우 및 게임 종료

**User Story:** 플레이어로서, 나는 카드 배치, 드로우, 게임 종료 규칙이 명확하게 강제되기를 원하며, 그래야 유효하지 않은 이동이나 규칙 혼란이 없다.

#### Acceptance Criteria

1. THE Board SHALL 8×8 격자(A1–H8)로 구성되며, 게임 시작 시 중앙 2×2 위치(D4, E4, D5, E5)에 52장 덱에서 무작위로 선택된 중립 카드 4장이 배치된다.
2. THE Game_Engine SHALL 게임 시작 시 중립 카드 4장과 각 플레이어 손패 4장(총 4+4×4=20장)을 52장 덱에서 중복 없이 무작위 배분한다.
3. WHEN 플레이어가 카드를 배치하면, THE Game_Engine SHALL 대상 위치가 보드 경계(A–H, 1–8) 내에 있고, 비어 있으며, 기존 배치 카드와 상하좌우 인접한지 검증하고, 조건 미충족 시 해당 액션을 거부한다.
4. THE Game_Engine SHALL Swap_Action을 지원하지 않는다. 플레이어는 손패에서만 카드를 보드에 놓을 수 있다.
5. WHEN 플레이어의 배치 액션이 새로운 Composite Code를 완성하지 못하면, THE Game_Engine SHALL 해당 플레이어에게 덱에서 1장을 드로우하게 한다. 단, 각 플레이어의 첫 번째 배치 액션(첫 라운드)은 드로우 의무에서 제외된다.
6. WHEN 플레이어의 배치 액션이 하나 이상의 Composite Code를 완성하면, THE Game_Engine SHALL 드로우를 수행하지 않는다.
7. WHEN 플레이어의 손패가 0장이 되면, THE Game_Engine SHALL 해당 액션과 관련된 모든 Composite Code 채점 및 예측 수집을 완료한 뒤 즉시 게임 종료를 선언한다.
8. WHEN 덱이 고갈된 상태에서 드로우가 필요하면, THE Game_Engine SHALL 드로우를 건너뛰고 플레이어의 손패가 현재 카드 수를 유지하도록 한다.
9. THE Game_Engine SHALL 게임 종료 시 최종 점수를 비교하여 순위를 결정하고, 동점 처리 규칙을 다음과 같이 적용한다: 동점 플레이어는 공동 순위로 처리하며, 별도의 타이브레이크를 적용하지 않는다.
10. FOR ALL 보드 상태 변환(배치), 보드 위 카드의 총 수는 액션 전보다 정확히 1 증가한다 (보드 카드 수 불변성).
11. THE Game_Engine SHALL 카드 배치 시 Card_Orientation을 함께 기록하되, 다음 규칙을 적용한다: (a) 하트(♥)·다이아몬드(♦)는 Fragment_Layout이 대각선 패턴이므로 180° 회전 시 조각 위치가 변하지 않아 0°와 동등하다. (b) 클럽(♣)·스페이드(♠)는 Fragment_Layout이 면 패턴이므로 180° 회전 시 조각이 반대 면으로 이동한다. (c) 모든 카드에 대해 90°/270° 배치 시도는 거부한다.
12. WHEN 카드가 Composite Code(Quad_Group)에 참여할 때, THE Game_Engine SHALL 해당 카드의 Fragment_Layout과 Card_Orientation을 조합하여 실제 조각 코너를 계산하고, 그 코너 중 하나 이상이 해당 보드 위치의 Inward_Corner와 일치하는지 검증한다. 일치하지 않으면 Composite Code로 판정하지 않는다.

---

### Requirement 4: Quad_Group 탐지 및 중복 방지

**User Story:** 게임 엔진 개발자로서, 나는 동일한 4장 카드 조합이 중복으로 점수를 받지 않도록 보장하고 싶으며, 그래야 점수 체계의 공정성이 유지된다.

#### Acceptance Criteria

1. WHEN 새로운 카드가 보드에 배치되면, THE Game_Engine SHALL 배치된 칸을 포함하는 최대 4개의 2×2 후보 영역을 검사한다.
2. WHEN 2×2 영역의 4개 칸이 모두 채워지면, THE Game_Engine SHALL 해당 영역을 Quad_Group으로 탐지하고 Requirement 3.12에 따라 Composite Code 성립 여부를 별도로 판정한다. 4칸 점유만으로는 Composite Code로 인정하지 않는다.
3. THE Game_Engine SHALL 채점된 Quad_Group을 고유 식별자로 기록하고, 동일한 식별자의 그룹에는 중복 점수를 부여하지 않는다. 고유 식별자는 4장 카드 ID(무늬+숫자)의 정렬된 집합(위치 순서 무관)으로 구성된다. 동일한 4장 카드 조합은 보드 위 위치나 배치 순서와 무관하게 하나의 식별자를 가진다.
4. THE Game_Engine SHALL 다음 세 조건을 모두 만족할 때만 채점 자격을 부여한다: (a) Composite Code 성립, (b) 해당 Composite Code가 현재 배치 액션으로 새로 성립, (c) 카드 집합 식별자가 채점 기록에 없음. 카드는 배치 후 이동·제거되지 않으므로 같은 4장 집합은 보드 위 한 위치에만 존재할 수 있으며, 채점 기록 검사는 이 불변식을 방어적으로 확인한다.
5. FOR ALL 보드 상태, 채점된 Quad_Group 집합은 멱등성을 가진다: 동일한 보드 상태에서 그룹 탐지를 반복 실행해도 새로운 그룹이 추가되지 않는다.

---

### Requirement 5: 커스텀 대칭 광학 마커 시스템

**User Story:** 프로덕트 오너로서, 나는 52장의 카드를 카메라로 식별할 수 있는 신뢰성 있는 광학 마커 시스템이 설계되기를 원하며, 그래야 물리 카드 플레이를 디지털 채점과 연결할 수 있다.

#### Acceptance Criteria

1. THE optical marker system SHALL 표준 QR코드(ISO 18004)를 사용하지 않는다. 대신 52장 카드 각각을 고유하게 식별할 수 있는 커스텀 대칭 마커를 설계한다.
2. THE marker generator SHALL 각 카드에 대해 하나의 기반 광학 패턴(base pattern)을 생성하고, Fragment_Layout에 정의된 대칭 변환을 적용하여 두 번째 조각을 도출한다. 두 조각은 동일한 카드를 식별한다.
3. THE codebook SHALL 52장 카드 각각에 고유한 2차원 이진 기반 패턴을 할당하고, 416개 Fragment_Template 전체에서 서로 다른 두 템플릿 사이의 최소 Hamming 거리를 5 이상으로 보장한다. 코드북은 고정 알고리즘과 고정 시드로 결정적으로 생성하며, 인쇄와 디코딩에는 저장소에 동결된 코드북만 사용한다.
4. THE optical marker SHALL 하트·다이아몬드 카드에서 Fragment_Layout을 180° 회전 적용해도 동일한 카드 ID를 반환하는 대칭 불변성을 유지한다.
5. THE optical marker SHALL 클럽·스페이드 카드에서 Fragment_Layout을 180° 회전 적용하면 조각 위치가 반대 면으로 이동하되, 카드 ID는 동일하게 디코딩되어야 한다.
6. WHEN Composite Code의 4개 조각이 모두 디코딩되면, THE optical reader SHALL 보드 상태를 조회하지 않고 이미지 데이터만으로 4장의 카드 ID와 Card_Value를 반환한다. Quad_Group 내 위치는 이미지만으로 결정되는 범위의 해석 전부로 반환하며(서로 180° 회전 관계인 해석, 그리고 반사 여부가 모호한 경우 반사 해석 포함), 카드 집합과 Hidden_Sum은 모든 해석에서 동일하다.
7. IF 판독 결과가 Requirement 13.4의 오류 조건(불완전 그룹·중복·손상·배치 불일치) 중 하나에 해당하거나 Scoring Companion의 참조 카드 집합과 다르면, THEN THE optical reader SHALL 스캔 결과를 거부하고 수동 입력으로 전환한다.

---

### Requirement 6: 정보 비대칭 및 공개 순서

**User Story:** 플레이어로서, 나는 내 예측이 다른 플레이어의 추측 전략에 영향을 주지 않도록 보장되기를 원하며, 그래야 공정한 추론 경쟁이 성립한다.

#### Acceptance Criteria

1. WHEN Quad_Group이 형성되면, THE Game_Engine SHALL 모든 참여 플레이어의 Guess를 수집하기 전까지 Hidden_Sum을 시스템 UI에 표시하지 않는다. 단, 플레이어가 보드 위 카드를 직접 보고 합산을 추론하는 행위는 이 제약의 대상이 아니며, 이 제약은 소프트웨어가 자동 계산한 값의 표시 시점에만 적용된다.
2. WHEN 모든 Guess가 수집되면, THE Game_Engine SHALL Hidden_Sum을 공개하고 각 플레이어의 획득 점수(Guess 값 미포함)와 누적 Score를 동시에 표시한다.
3. THE Game_Engine SHALL 임의의 플레이어가 다른 플레이어의 Guess 값을 게임 진행 중에 열람하지 못하도록 한다.
4. WHEN 물리 카드를 뒤집어 Hidden_Sum을 공개할 때, THE Scoring_Companion SHALL 카드의 좌우 배치 방향(Composite_Code 조각의 좌우 위치)을 원래 보드 배치 기준으로 유지하여 미러링되지 않도록 한다.
5. WHEN 단일 배치 액션으로 둘 이상의 Composite Code가 새로 성립하면, THE Game_Engine SHALL 해당 Composite Code 전부에 대한 예측을 먼저 수집한 뒤 결과를 일괄 공개하여, 앞선 코드의 결과가 다음 코드의 예측에 영향을 주지 않도록 한다.

---

### Requirement 7: AI 플레이어

**User Story:** 싱글 플레이어로서, 나는 인터넷 연결이나 유료 API 없이도 도전적인 AI 상대와 연습 게임을 즐기고 싶다.

#### Acceptance Criteria

1. THE Game_Engine SHALL 브라우저 로컬 환경에서 실행되는 AI_Player 알고리즘 3개를 제공하며, 외부 서버나 유료 AI API에 의존하지 않는다.
2. THE AI_Player SHALL 유효한 Placement_Action만 수행한다.
3. WHEN AI_Player의 차례가 되면, THE Game_Engine SHALL 3초 이내에 AI_Player의 행동을 결정하고 실행한다.
4. THE AI_Player SHALL Guess를 생성할 때 보드에 공개된 카드 정보만 사용하고, 다른 플레이어의 비공개 Guess에 접근하지 않는다.
5. WHERE 난이도 설정이 제공되면, THE AI_Player SHALL 최소 2가지 난이도(초급: 랜덤 유효 배치, 고급: Quad_Group 완성 가능성 최대화 휴리스틱)를 구현한다.

---

### Requirement 8: Browser Practice Mode

**User Story:** 게임 개발자로서, 나는 물리 카드 인쇄 전에 핵심 게임 루프를 브라우저에서 검증하고 싶으며, 그래야 인쇄 비용 낭비 없이 개념 증명이 가능하다.

#### Acceptance Criteria

1. THE Browser_Practice_Mode SHALL 표준 웹 브라우저(크롬, 파이어폭스, 사파리 최신 2버전)에서 설치 없이 실행된다.
2. THE Browser_Practice_Mode SHALL 8×8 보드, 카드 패, 배치 및 방향 선택 인터페이스, Guess 입력, 점수 표시를 포함하는 완전한 게임 루프를 구현한다.
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

**User Story:** 게임 디자이너로서, 나는 배치 방향 제약, 드로우 규칙, 정보 비대칭 메커닉이 지배 전략이나 무의미한 게임 상태를 만들지 않는지 확인하고 싶다.

#### Acceptance Criteria

1. THE Game_Engine SHALL 스왑이 없는 규칙에서 특정 전략이 지배 전략이 되는지 여부를 시뮬레이션 테스트로 평가하고 결과를 기록한다.
2. WHEN 한 플레이어가 모든 Quad_Group을 단독으로 완성하는 전략을 시도할 때, THE Game_Engine SHALL 다른 플레이어들도 추측 점수로 경쟁력을 유지할 수 있음을 점수 시뮬레이션으로 검증한다.
3. THE Game_Engine SHALL Guess 입력 유효성 검사에서 허용 범위를 Hidden_Sum의 실제 최솟값 4 이상, 최댓값 52 이하의 정수로 제한한다. (Requirement 1 Criterion 4와 일치)
4. IF 4명의 플레이어 모두 동일한 Guess를 입력하면, THE Game_Engine SHALL 모든 플레이어에게 동일한 점수 기준을 적용하고 타이브레이킹 규칙을 문서화한다.

---

### Requirement 12: 커스텀 광학 마커 프로토타입 검증

**User Story:** 게임 개발자로서, 나는 52장 카드 식별을 위한 커스텀 대칭 마커 시스템이 실제로 동작하는지 검증하고 싶으며, 그래야 물리 카드 인쇄 전에 광학 인식 신뢰성을 확인할 수 있다.

#### Acceptance Criteria

1. THE prototype SHALL 외부 의존성 없는 TypeScript 래스터 연산으로 52장 카드의 광학 조각을 생성·렌더링하며, 자동화 테스트는 브라우저 없이 Node 환경에서 실행 가능해야 한다. Canvas API는 브라우저 시각화에만 사용한다.
2. THE prototype SHALL 임의의 Composite Code(4장 조합)에 대해 4개 조각 이미지를 합성하고, 광학 디코더가 각 조각을 독립적으로 디코딩하여 4개의 카드 ID를 반환하는지 검증한다.
3. THE prototype SHALL 하트·다이아몬드 카드의 180° 회전 동등성을 검증한다: 동일 카드를 0°와 180°로 각각 렌더링했을 때 디코딩 결과가 동일해야 한다.
4. THE prototype SHALL 클럽·스페이드 카드의 180° 회전 조각 이동을 검증한다: 회전 전후 카드 ID는 동일하되 조각 코너 위치가 바뀜을 확인한다.
5. THE prototype SHALL 고정 시드로 생성한 합성 열화 조건(조각별 위치 오차 0·0.1·0.25 모듈, 임의 카메라 회전 각도, 원근 변환, 블러, 노이즈, 조명 기울기)에서 조건별 정상 식별률·거부율·오식별률을 측정하고, 조건마다 최소 1,000회 시도 결과를 기록한다. 오식별(잘못된 카드 ID나 합산을 성공으로 반환) 건수도 조건별로 기록하며, 0이 아닌 조건은 실패 시드와 함께 보고한다. 오식별 0건은 측정된 조건 안에서의 관찰이며 모든 손상에 대한 보장이 아니다.
6. THE prototype SHALL 오류 조건(불완전 그룹(조각 4개 미만), 중복 카드 ID, 손상 조각)을 탐지하고 거부하는 로직을 검증한다.
7. THE team SHALL 프로토타입 코드, 테스트 케이스, 측정 결과(성공률, 오차 허용 범위)를 저장소에 커밋하여 재현 가능한 기록으로 남긴다. 합성 이미지 결과와 실제 인쇄 카드·카메라 결과는 구분하여 기록한다.

---

### Requirement 13: 광학 조각 독립 디코딩 및 합산 정확성

**User Story:** 점수 보조 앱 사용자로서, 나는 물리 카드를 스캔했을 때 각 카드의 신원이 올바르게 식별되고 Hidden_Sum이 정확히 계산되기를 원하며, 그래야 수동 입력 없이 신뢰할 수 있는 점수 집계가 가능하다.

#### Acceptance Criteria

1. THE optical reader SHALL 각 조각을 보드의 예상 상태와 독립적으로 디코딩하여 카드 ID(무늬+숫자)와 Card_Value를 반환하고, Quad_Group 내 위치(좌상/우상/좌하/우하)는 이미지만으로 결정되는 범위의 모든 해석(180° 모호성, 필요 시 반사 모호성 포함)으로 반환한다. 이 정보는 보드 상태 조회 없이 이미지 데이터만으로 결정해야 한다.
2. WHEN 4개의 조각이 모두 성공적으로 디코딩되면, THE optical reader SHALL 독립적으로 산출한 4개의 Card_Value 합산을 Hidden_Sum으로 반환하고, 이 값을 Game_Engine이 보드 상태로부터 계산한 참조값과 대조하여 일치 여부를 기록한다.
3. IF 디코딩된 Hidden_Sum이 Game_Engine의 참조값과 다르면, THE optical reader SHALL 스캔 결과를 거부하고 재스캔 또는 수동 입력을 요청하며, 불일치 Hidden_Sum을 게임에 적용하지 않는다.
4. THE optical reader SHALL 다음 오류 조건을 각각 탐지하고 거부한다: (1) 불완전 그룹 — 한 꼭짓점 주변에서 조각이 4개 미만으로 탐지됨, (2) 중복 조각 — 같은 카드 ID가 2회 이상 탐지됨, (3) 손상 조각 — 마커 경계는 탐지됐으나 허용 반경 안에 일치하는 템플릿이 없음, (4) 배치 불일치 — 관측된 조각 변환과 무늬가 어떤 Camera_Rotation 가설에서도 Fragment_Layout의 슬롯별 유효 조합과 일치하지 않음. 마커 미탐지(탐지 실패)와 손상 조각(식별 실패)은 서로 다른 결과로 보고한다.
5. WHEN 허용된 방향으로 배치된 카드를 촬영하면, THE optical reader SHALL 물리 방향을 입력으로 받지 않고 관측 픽셀을 416개 Fragment_Template과 대조하여 카드 ID와 관측 변환을 함께 결정한다. 카드의 물리 방향은 관측 변환과 슬롯으로부터 추론한다.
6. THE optical reader SHALL 카드의 물리 회전과 Camera_Rotation을 구분한다. 임의 각도의 Camera_Rotation은 정상 입력으로 처리한다. 물리적으로 90°/270° 놓인 카드는 나머지 조각과 일관된 Camera_Rotation 가설이 없으므로 배치 불일치로 거부한다. 하트·다이아몬드의 180° 배치는 0°와 광학적으로 동일하게 처리하고, 클럽·스페이드의 방향은 슬롯별 유효 조합으로 검증한다.
7. THE optical_reader_test_suite SHALL 고정 시드(seed)를 사용한 반복 가능한 무작위 테스트를 포함하며, 다음 케이스를 커버한다: (a) 유효 0° 조합 — 4가지 무늬(하트·다이아·클럽·스페이드) 각 1장씩, 각 카드의 Inward_Corner에 Fragment_Layout 조각이 위치하는 배치, (b) 유효 180° 조합 — 클럽·스페이드 카드를 180° 회전하여 Inward_Corner 조건이 여전히 충족되는 배치, (c) 대각선 패턴 동등성 — 하트·다이아를 0°/180°로 각각 배치했을 때 디코딩 결과가 동일함을 확인, (d) 경계값 카드 — Hidden_Sum 최솟값(A+A+A+A=4) 및 최댓값(K+K+K+K=52) 조합, (e) 거부 케이스 — 90° 회전 조각, 조각 없는 Inward_Corner(불완전 그룹), 3조각 그룹, 중복 카드 ID, 손상 조각.
8. THE optical_reader_test_suite SHALL Requirement 12의 프로토타입 실험과 독립적으로 실행 가능하며, 표준 QR 디코더가 아닌 전용 조각 판독기를 대상으로 한다.
9. THE optical reader SHALL 촬영 이미지에 반사(거울상)가 포함됐는지 판별하여 `NOT_REFLECTED`, `REFLECTED`, `AMBIGUOUS` 중 하나로 보고한다. 그룹에 하트 또는 다이아몬드가 있어 판별이 가능하면 사실과 일치하는 값을 보고해야 하고, 클럽·스페이드로만 이루어진 그룹처럼 이미지만으로 판별할 수 없으면 `AMBIGUOUS`로 보고하며 어느 쪽으로도 추측하지 않는다. 반사 여부는 카드 식별과 Hidden_Sum 계산에 영향을 주지 않는다. THE optical reader SHALL 광학 판독이 실패했을 때 보드 기록이나 기대값으로 결과를 대체하지 않는다.
---

### Requirement 14: 무늬별 광학 조각 배치 규칙 (Fragment Layout)

**User Story:** 카드 디자이너로서, 나는 각 무늬별로 광학 조각이 어느 코너에 인쇄돼야 하는지 명확하게 알고 싶으며, 그래야 52장 카드를 한 번 인쇄하면 모든 유효한 Quad_Group에서 조각이 올바르게 조합될 수 있다.

#### Acceptance Criteria

1. THE card design SHALL 각 무늬의 Fragment_Layout을 다음과 같이 영구 정의한다: 하트(♥) — TL(좌상)+BR(우하) 대각선A(180° 점대칭), 다이아몬드(♦) — TR(우상)+BL(좌하) 대각선B(180° 점대칭), 클럽(♣) — TR(우상)+BR(우하) 우측면(수평 반사 대칭), 스페이드(♠) — TL(좌상)+BL(좌하) 좌측면(수평 반사 대칭). 조커는 사용하지 않는다.
2. THE card design SHALL Fragment_Layout을 물리 카드에 영구 인쇄하며, 게임 중 보드 위치나 소프트웨어에 의해 동적으로 변경하지 않는다.
3. THE Game_Engine SHALL 2×2 보드 위치별 Inward_Corner를 다음과 같이 결정한다: 좌상(TL) 위치 카드 → BR이 Inward_Corner, 우상(TR) 위치 카드 → BL이 Inward_Corner, 좌하(BL) 위치 카드 → TR이 Inward_Corner, 우하(BR) 위치 카드 → TL이 Inward_Corner.
4. THE Game_Engine SHALL 카드의 Fragment_Layout 조각 코너 중 하나 이상이 해당 보드 위치의 Inward_Corner와 일치하는지 검증하여 Quad_Group 유효성을 판정한다. 유효한 조합의 예: 좌상 위치의 하트(TL+BR) — BR이 Inward_Corner(BR)와 일치 → 유효. 좌상 위치의 클럽(TR+BR) — BR이 Inward_Corner(BR)와 일치 → 유효. 좌하 위치의 스페이드(TL+BL) — TL이 Inward_Corner(TR)와 불일치, BL이 Inward_Corner(TR)와 불일치 → 무효(0°일 때). 좌상 위치의 다이아몬드(TR+BL) — 두 조각 모두 Inward_Corner(BR)와 불일치 → 무효(180° 회전해도 TR+BL이므로 방향과 무관).
5. WHEN 클럽(♣) 또는 스페이드(♠) 카드가 180° 회전 배치되면, THE Game_Engine SHALL Fragment_Layout을 180° 변환하여 유효성을 재검증한다: 클럽 180° → TL+BL(좌측면), 스페이드 180° → TR+BR(우측면). 변환 후 Inward_Corner 일치 여부가 달라질 수 있다.
6. THE Game_Engine SHALL 클럽(♣) 0° 배치 시 TR+BR이 조각 위치이며, 180° 배치 시 TL+BL로 이동함을 검증한다. 스페이드(♠) 0° 배치 시 TL+BL이 조각 위치이며, 180° 배치 시 TR+BR로 이동함을 검증한다. 클럽 180°와 스페이드 0°는 같은 코너 집합(TL+BL)을, 클럽 0°와 스페이드 180°는 같은 코너 집합(TR+BR)을 사용하므로 코너 위치만으로는 무늬를 구별할 수 없으며, 무늬는 코드북 패턴으로 식별한다.
7. THE feasibility_test_suite SHALL 14.4에 정의된 유효 조합과 무효 조합을 각각 픽스처로 구성하여 광학 디코딩 정확도를 검증하고, 모든 4가지 무늬 패턴을 포함한 케이스를 자동화 테스트로 커버한다.

---

### Requirement 15: 물리 카드 형상과 인접 배치

**User Story:** 카드 디자이너로서, 나는 일반 트럼프 카드와 같은 크기와 둥근 모서리를 유지한 채 카드를 간격 없이 붙여도 광학 인식이 신뢰성 있게 동작하기를 원하며, 그래야 카드의 외형과 취급감을 바꾸지 않고 게임을 할 수 있다.

#### Acceptance Criteria

1. THE card design SHALL 기준 형상을 63.5 × 88.9 mm, Corner_Radius 3.175 mm로 하고, 40 × 56 모듈 프로토타입 격자를 모듈당 1.5875 mm로 이 크기에 대응시킨다. 이 기준은 상용 인쇄 업체 자료에 근거한 값이며 표준 규격이 아니므로, 실험은 Corner_Radius를 기준값 주변과 그 이상으로 바꿔 가며 보고한다.
2. THE card design SHALL 카드 4장이 직선 가장자리를 따라 겹침 없이 맞닿는 배치를 전제하고, 카드 사이에 의도된 간격을 요구하지 않는다. THE optical reader SHALL 의도된 간격이나 정사각형 모서리에 의존하지 않는다.
3. THE card design SHALL 각 마커의 검은 테두리, 흰 여백, Marker_Inset 전체가 Printable_Area 안에 있도록 한다. 형상 파라미터(Corner_Radius, Marker_Inset, 모듈 크기, 여백)로 포함 여유(호까지의 거리)를 계산해 보고하며, 여유가 0 이하인 형상은 무효로 표시한다.
4. THE optical reader SHALL 한 꼭짓점의 네 조각이 끊김 없는 하나의 정사각형을 이룬다고 가정하지 않고, Central_Void가 있는 상태에서도 마커 네 개를 독립적으로 검출해 군집화한다. THE experiment SHALL Central_Void와 가장 가까운 마커 사이의 최소 거리를 형상 파라미터별로 보고한다.
5. THE card design SHALL 이음매 양쪽 마커의 검은 사각형 사이에 이음매 이격 0일 때 2(Marker_Inset + 여백) 모듈 이상의 흰 간격이 있도록 하고, THE experiment SHALL 인접한 마커의 연결 성분이 병합되지 않는지 검증한다.
6. WHEN 이미지에 Distractor_Marker가 있으면, THE optical reader SHALL 한 꼭짓점 주위에 마커가 정확히 4개 모인 경우에만 그룹으로 판독하고, 4개 미만인 꼭짓점은 그룹으로 보고하지 않는다.
7. THE team SHALL 광학 인식이 기준 형상에서 부족할 때 다음 순서로만 개선을 시도한다: (1) 조각 위치와 Marker_Inset 조정, (2) 마커 크기와 여백 조정, (3) 검출·기하 보정 알고리즘 개선, (4) 물리 정렬 허용 오차 평가, (5) 필요한 경우에만 Corner_Radius를 단계적으로 줄이기. 개별 실패 사례 하나만으로 카드 모서리 형상을 바꾸지 않는다.
8. THE experiment SHALL 다음 조건을 재현 가능한 형상 파라미터와 고정 시드로 측정한다: 이격 0 배치, 둥근 안쪽 모서리와 Central_Void, Corner_Radius 비교, 카드별 작은 위치·회전 오차, 카메라 회전·원근·흐림·조명 변화. 조건별로 정상 식별률(네 카드와 합산이 모두 정확), 거부율과 거부 종류, 오식별 건수, 불완전 그룹 거부 여부, 실패 원인 집계, 각 형상 조정의 효과를 기록한다.
9. THE team SHALL 합성 이미지 결과가 실제 카메라 성능을 보장하지 않는다는 점을 보고서에 명시하고, 실물 인쇄·촬영 결과는 Requirement 12.7의 구분 규칙에 따라 별도로 기록한다.
10. THE card design SHALL Requirement 14의 Fragment_Layout과 동결 코드북을 변경하지 않는다.
