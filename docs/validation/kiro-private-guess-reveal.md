# 비공개 추측과 동시 공개 검증 기록 (Kiro)

## 1. 기준

| 항목 | 값 |
|---|---|
| 날짜 | 2026-11-24 (KST) |
| 브랜치 | `codex/android-offline-companion` |
| 커밋 | `3e7a626` (작업 시작 시점 HEAD, 작업 트리 깨끗함) |
| Spec | `.kiro/specs/qroker-playable-game/`, Task 8.4 "Property tests for guess collection, reveal and game end" (`tasks.md`, 체크 상태 `[x]` 그대로) |
| 공개 규칙 | `requirements.md`의 Requirement 7 기준 5~8 (요청서의 "Requirement 8"은 점수 설정 요구사항이라 공개 규칙과 맞지 않아 Requirement 7로 확인함) |
| 검증 주체 | Kiro (이 세션의 검증만 해당). 구현과 기존 테스트는 Codex와 이전 작업자의 기록을 그대로 둠 |

Task 8.4를 Kiro 안에서 다시 실행하지 않았습니다. 체크박스와 이력은 바꾸지 않았습니다.

## 2. 행동 검증 결과

### 엔진 수준 (Vitest)

| 실행 | 결과 | 종료 코드 |
|---|---|---|
| `npx vitest --run src/game/core/engine.reveal.properties.test.ts --reporter=verbose` | 3/3 통과. Property 17 (24가지 제출 순서에서 같은 상태, 공개 전 공개 없음, 획득 점수 = 규칙 합, 기록에 추측 없음), Property 18, Property 19 | 0 |
| `npx vitest --run src/game/core/view.properties.test.ts --reporter=verbose` | 3/3 통과. Property 22 (뷰에 다른 좌석 추측, 미공개 Hidden_Sum, 다른 손패가 없음), Property 23 | 0 |

### 브라우저 수준 (Playwright, 빌드된 프로덕션 페이지)

- `npm run build` 종료 코드 0.
- `PLAYWRIGHT_PREVIEW=1 npx playwright test e2e/game.spec.ts -g "4 reveal and scoring"`: 1/1 통과, 종료 코드 0, Chromium 159, 시드 20240601.
- `PLAYWRIGHT_PREVIEW=1 npx playwright test e2e/game.spec.ts -g "3 two human Seats"`: 1/1 통과, 종료 코드 0. 이 시나리오의 시드는 로그에 출력되지 않아 확인하지 못함.

### 기준별 판정

| 기준 | 판정 | 근거 |
|---|---|---|
| 마지막 제출 전 정답 합 숨김 | 통과 (엔진, 브라우저) | Property 22 뷰 검사. 시나리오 4에서 공개 전 `.reveal`, `.reveal-sum` 요소 0개 |
| 다른 좌석의 추측이 뷰와 UI에 없음 | 통과 (엔진, 브라우저) | Property 22의 `myGuesses`는 본인 것만. 시나리오 3에서 다음 좌석 게이트 DOM에 손패, 입력란, 이전 좌석 값이 없음을 단언 |
| 본인 입력은 보임 | 부분 | 엔진에서 본인 `myGuesses`만 보인다는 것은 확인. 입력란에 본인 값이 표시되는지를 직접 단언하는 테스트는 찾지 못함. 시나리오 "6 overlays"의 입력 보존 테스트가 간접 근거 |
| 마지막 제출 시 같은 공개 결과 | 통과 (엔진), 부분 (브라우저) | Property 17이 같은 상태에서 24가지 제출 순서를 비교. 브라우저 실행은 순서를 바꾸지 않음 |
| 한 번에 모든 코드 공개, 좌석별 획득 점수와 누적 점수 | 통과 (브라우저) | 시나리오 4: 공개 행의 획득 점수와 누적 점수 일관성, 공개 후 정답 합 표시 |
| 공개 후 개별 추측 비공개 | 통과 (엔진, 브라우저) | 시나리오 4: 공개 DOM에 입력한 추측 값이 없음. Property 17: 기록에 추측 없음. Property 22: 종료 후 `myGuesses` null |

### 남은 공백

1. 브라우저에서 제출 순서를 바꾸는 실행이 없습니다. 순서 불변성은 엔진에서만 검증됐습니다.
2. 본인 입력 표시를 직접 확인하는 단언이 없습니다.
3. 브라우저 검증은 시드 1개와 Chromium 1개뿐입니다. 실제 휴대폰에서는 확인하지 않았습니다.
4. Playwright 실행은 happy-dom이 아닌 실제 Chromium입니다. 반면 Property 테스트는 모델 증거입니다. 두 결과를 섞지 않았습니다.

## 3. 자동 Hook 결과: 미검증 (unverified)

| 항목 | 내용 |
|---|---|
| 설정 | `.kiro/hooks/verify-after-task.json`, 이름 `QRoker post-task verification`, `PostTaskExec`, 명령 `node scripts/verify-task.mjs`, `enabled: true`. 설정 파일은 이 작업에서 수정하지 않음 |
| Spec 작업 완료 후 실행 | 확인 못함. 이 세션에는 Spec 작업을 다시 실행하는 도구가 없음 |
| Kiro Hook 출력 | 이 세션에서 IDE 출력 패널을 볼 수 없음 |
| `events.jsonl` | `%LOCALAPPDATA%\QRokerHookData\events.jsonl`에 항목 75개가 있고, 모두 `save-typecheck`. `spec-verification` 항목은 0개. 마지막 항목 시각은 2026-11-15 |
| 수동 실행 | 하지 않음. 수동 실행은 자동 Hook의 증거가 되지 않으며, 같은 journal에 가짜 `spec-verification` 항목을 남기게 됨 |

판정: **자동 Hook 관찰 안 됨 (unverified)**. 이 판정은 실패가 아닙니다. 필요한 증거는 다음 두 가지입니다.

- Kiro IDE에서 Spec 작업을 완료했을 때 `QRoker post-task verification` 출력이 뜬 기록(화면 캡처 또는 출력 복사, 시각 포함)
- 같은 시각에 `spec-verification` 항목이 생기고, 그 항목의 `revision`이 작업 시점 커밋과 일치하는 기록

Hook이 실행되면 `typecheck:game`과 `test:game`의 통과 여부가 `checks`에 기록됩니다. 실패해도 관찰된 실행으로 봅니다.

## 4. Steering 개인정보 규칙이 안내한 점검

`.kiro/steering/project.md`의 "비공개 추측, 미공개 Hidden_Sum, 다른 플레이어의 손패를 공개 뷰, 로그, DOM, 알림에 두지 않는다"는 규칙에 따라, 공개 reveal 화면 DOM에 입력한 추측 값이 남지 않는지를 시나리오 4에서 확인했습니다.

## 5. 캡처 안내 (두 클립)

**클립 1: 합법 배치 → 새 조합 → 비공개 입력 → 공개 합과 점수**
1. 기본 설정으로 게임을 시작하고 중앙 4장 외에 새 2×2 조합이 생기는 배치를 고릅니다. 시드 20240601이 시나리오 4와 같은 조합을 만듭니다.
2. 배치를 확정하면 추측 입력 화면이 뜨는 장면을 찍습니다. 입력 화면에는 정답 합이 보이지 않아야 합니다.
3. 추측 값을 입력하고, 다음 좌석으로 넘어가는 게이트가 있으면 그 화면도 찍습니다.
4. 마지막 좌석이 제출하면 공개 화면에 정답 합, 카드, 획득 점수, 누적 점수가 나타나는 장면을 찍습니다. 입력한 추측 값은 화면에 나타나지 않습니다.

**클립 2: Spec 작업 완료 → 자동 Hook 결과**
1. Kiro IDE에서 Spec 작업을 완료합니다(예: Task 8.4 재실행, 가능한 경우).
2. 작업이 끝난 직후 Hook 출력 패널에 `QRoker post-task verification`이 뜨는 장면을 찍습니다. 시각이 보여야 합니다.
3. `events.jsonl`에서 `spec-verification` 항목의 `at`, `revision`, `passed`, `checks` 필드만 확인해 캡처합니다. 원본 파일 전체는 보관하지 않습니다.

## 6. 남은 작업

- 자동 Hook 증거 확보(위 3절의 두 가지). Kiro IDE에서 Spec 작업을 완료해야 가능합니다.
- 브라우저 순서 불변성 실행과 본인 입력 표시 단언 추가. 기능 추가 없이 테스트만 보강하는 작업이며, 이번 세션에서는 하지 않았습니다.
- 커밋, push, 공개는 하지 않았습니다.

## 7. 추가 검증: 입력 중인 본인 추측 표시 (Task 8.5, 2026-11-24 KST)

| 항목 | 내용 |
|---|---|
| Spec | `.kiro/specs/qroker-playable-game/tasks.md` Task 8.5 (추가, 기존 Task 8.4는 기록과 체크 상태를 그대로 둠) |
| 기준 | 브랜치 `codex/android-offline-companion`, 기준 커밋 `3e7a626`, 실행 시점 작업 트리에 이 검증으로 바뀐 것은 `e2e/game.spec.ts`(테스트 단언 추가)와 `tasks.md`(항목 추가), 이 보고서 |
| 변경 없음 | 프로덕션 코드(`src/`), Hook 설정(`.kiro/hooks/`) |
| 빌드 | `npm run build` 종료 코드 0 (이번 검증 전 빌드. 프로덕션 코드는 이후 바뀌지 않음) |
| 명령 | `$env:PLAYWRIGHT_PREVIEW='1'; npx playwright test e2e/game.spec.ts -g "a typed Guess survives opening and closing Help"` |
| 결과 | 1/1 통과, 종료 코드 0, Chromium 159 (실제 브라우저, happy-dom 아님), 시나리오 "6 overlays" |

추가된 단언(입력 직후, Help를 열기 전):

- `await expect(input).toBeVisible();`
- `await expect(input).toHaveValue('23');`

Help가 닫힌 뒤의 기존 단언(값 `23` 유지, Help 재열기와 닫기 뒤에도 값 유지)은 그대로 두었습니다.

증거 등급: 실제 Chromium의 한 시드 시나리오입니다. 엔진이나 뷰 모델 증거가 아닙니다. 본인 입력 표시는 이 케이스가 직접 확인하게 되었으므로, 이 항목의 "본인 입력 표시: 부분" 판정은 이 케이스로 해소되었습니다.

### 자동 Hook 상태: 미검증 (unverified)

- 이 항목을 마치면 `.kiro/hooks/verify-after-task.json`의 `QRoker post-task verification`(PostTaskExec)이 Kiro에서 실행되도록 두었습니다. 수동으로 `scripts/verify-task.mjs`를 실행하지 않았습니다.
- 실행 여부는 아직 확인하지 못했습니다. 확인에 필요한 것: Kiro Hook 출력 패널의 시각, 또는 같은 시각에 생긴 `events.jsonl`의 `spec-verification` 항목(`revision`이 커밋과 일치하는 것).
- 이전 항목(섹션 3)에서 확인한 대로 `events.jsonl`의 마지막 항목은 `save-typecheck`이며, 그 시점에서 `spec-verification`은 0개였습니다.

## 8. Task 8.6: 한 배치로 두 코드가 완성될 때의 한 번의 공개 (2026-11-24 KST)

### 8.1 판정

| 항목 | 판정 |
|---|---|
| Playwright 테스트 "8 two codes in one placement" (`e2e/game.spec.ts`), 프로덕션 빌드 `PLAYWRIGHT_PREVIEW=1` | **통과** (1/1, 종료 코드 0, Chromium 159, 19.9 s) |
| 수용 기준 (a)~(e) | 모두 통과 |
| 음성 대조군 (기대 점수 P1 A1을 21에서 20으로 바꾼 임시 복사본) | **실패** (의도한 대로 점수 행 비교에서 실패, 종료 코드 1). 점수 단언이 실제로 동작함을 확인하고 임시 파일은 삭제 |
| 자동 PostTaskExec Hook | **미검증 (unverified)**. 아래 8.5 참고 |

### 8.2 재현 조건

- 시드: **47** (설정 화면의 시드 입력란에 `47`)
- 설정: 사람 1명(P0), AI 3명(P1~P3, BEGINNER), 기본 점수표
- 탐색: `npx tsx scripts/find-two-code-scene.ts --from 1 --to 300`. 1~47 시드를 확인해 47에서 찾음. 건너뛴 시드 0개. 엔진만 사용하는 읽기 전용 실행.

### 8.3 재생 이동 (사람 좌석, 순서대로)

보드 좌표는 `열 A~H`, `행 1~8`(1행이 위). 방향은 모두 0도. AI 이동은 시드와 로그 위치에서 결정되므로 사람 이동만 기록한다.

| 순서 | 동작 | 칸 |
|---|---|---|
| 1 | 카드 H-7 배치 | D3 |
| 2 | 카드 C-7 배치 | D2 |
| 3 | 카드 D-Q 배치 | D1 |
| 4 | 카드 H-2 배치 | C1 |
| 5 | 카드 D-2 배치 | B1 |
| 6 | 카드 C-3 배치 | A1 |
| 7 | 카드 D-K 배치 | F1 |
| 8 | 카드 C-K 배치 | H1 |
| 9 | 카드 D-7 배치 | A2 |
| 10 | 카드 **H-8 배치 → A1과 B2가 함께 완성** | B2 |
| 11 | 추측 제출: A1 = 20, B2 = 21 | |

테스트는 이 순서를 직접 넣지 않는다. `playUntil`의 기본 정책(첫 손패 카드, 첫 합법 칸, 방향 0, 추측 20부터 순번)이 같은 이동을 만든다. 첫 `GUESS` 단계가 곧 목표 배치다. 이 배치가 게임의 첫 추측 배치다.

### 8.4 수용 기준별 관찰 결과

| 기준 | 관찰 결과 |
|---|---|
| 재현 가능한 시드와 합법 이동 | 시드 47. 첫 `GUESS` 단계에서 `.guess-field`의 Quad_Key가 `A1`, `B2`로 시나리오와 일치 |
| (a) 두 개의 서로 다른 Quad_Key, 두 그룹 모두 새 카드 칸 포함 | 통과. 키 두 개가 다름. A1 그룹(A1,B1,A2,B2)과 B2 그룹(B2,C2,B3,C3) 모두 B2 포함 |
| (b) 최종 제출 전 정답 합 비공개 | 통과. 제출 전 `.reveal`, `.reveal-sum`, `.reveal-code` 0개. DOM에 hidden-sum 속성 없음. 추측 칸에 `숨겨진 합: N` 형태의 정답 표시 없음. 입력 후에도 공개 없음. 스크린샷 첨부 |
| (c) 같은 공개 화면에 두 정답 합 | 통과. `A1` = 20, `B2` = 28 (`.reveal-code[data-quad-key]`와 `.reveal-sum`) |
| (d) 좌석별 획득 점수와 누적 점수 | 통과. 기대값은 테스트가 보상표 `[10, 5, 4, 3, 2, 1]`로 직접 계산(제출 추측과 비공개 AI 추측 사용), 화면과 비교만 함 |
| (e) 개별 추측 비공개, 좌석과 연결 없음 | 통과. `.reveal input` 0개, `.reveal [class*="guess"]` 0개, `.reveal` HTML에 `guess` 없음 |

(d) 기대값 (추측 → 점수, 누적):

| 좌석 | A1 추측 (정답 20) | B2 추측 (정답 28) | 획득 | 누적 |
|---|---|---|---|---|
| P0 | 20 → 10 | 21 → 0 | 10 | 10 |
| P1 | 21 → 5 | 10 → 0 | 5 | 5 |
| P2 | 28 → 0 | 40 → 0 | 0 | 0 |
| P3 | 4 → 0 | 17 → 0 | 0 | 0 |

화면의 표(획득, 누적)도 위 값과 같았다. 엔진의 공개 기록과 독립 계산이 일치함을 탐색 스크립트에서도 확인했다.

### 8.5 PostTaskExec Hook: 미검증 (unverified)

- 이 세션에는 Kiro IDE의 Spec 작업 실행 기능이 없었다. 작업 목록에서 8.6을 실행하지 않았고, 체크박스만 직접 표시했다.
- 이번 실행과 연결되는 증거가 없다. `%LOCALAPPDATA%\QRokerHookData\events.jsonl`은 항목 75개(모두 `save-typecheck`)이고 `spec-verification`은 0개이다. 확인 시각: 2026-11-24 12:29 KST.
- 수동으로 `scripts/verify-task.mjs`를 실행하지 않았다.
- 확인하려면 IDE에서 8.6을 실행하고 Hook 출력 시각, 또는 같은 시각의 `spec-verification` 항목과 그 `revision`을 확인해야 한다.

### 8.6 이번 작업 중 발생한 상황

- 음성 대조군은 임시 파일 `e2e/zz-control-8-6.spec.ts`에 만들었다. 실행 후 삭제했다. 점수 단언에서 실패해 점수 비교가 살아 있음을 확인했다.
- 실행 도구의 `^C`로 이전 실행이 중단되어 `4173` 포트에 이 저장소의 `vite preview`(PID 26820)가 남아 있었다. 명령줄이 이 저장소 경로임을 확인한 뒤 그 PID만 종료했다. 다른 Chrome 프로세스는 건드리지 않았다.
- 프로덕션 코드(`src/`)와 Hook 설정(`.kiro/hooks/`)은 변경하지 않았다. `scripts/find-two-code-scene.ts`는 새 읽기 전용 도구다.

### 8.7 증거 등급과 한계

- 실제 Chromium 한 개, 시드 하나, 한 장면. 실기기, 다른 브라우저, 다른 시드는 확인하지 않았다.
- 엔진 증거(Property 17 등)와 브라우저 증거를 섞지 않았다. 이 항목의 브라우저 결과는 Playwright 실행만 근거로 한다.
## 9. Task 8.6 후속 강화: P0의 B2 추측을 27로 변경 (2026-11-24 KST, 12:38 기준)

섹션 8의 10점 기록은 그대로 보존한다. 이 섹션은 같은 시나리오에서 P0의 B2 추측만 바꾼 후속 검증이다. 첫 실행의 B2 추측 21은 오차 7이라 0점이었고, 그래서 두 번째 코드의 점수가 정답 검증에 기여하지 못했다. 이번 변경은 두 코드 점수가 모두 반영되는지 확인하기 위한 것이다.

### 9.1 재생 조건 (변경 전과 같은 부분)

- 시드 47, 설정(사람 1명 P0, AI 3명 BEGINNER, 기본 점수표)
- 사람의 배치 10개(섹션 8.3과 같음). 마지막 배치 H-8을 B2에 놓으면 A1과 B2가 함께 완성된다.
- AI 배치는 시드에서 결정되므로 변경 없음.

변경된 부분: 사람 좌석의 추측 입력.

| 칸 | 변경 전 (섹션 8) | 변경 후 (이번) |
|---|---|---|
| A1 | 20 | 20 (유지) |
| B2 | 21 | **27** |

### 9.2 P0의 기대 점수 (테스트가 독립적으로 계산, 보상표 [10, 5, 4, 3, 2, 1])

| 코드 | P0 추측 | 정답 합 | 오차 | 점수 |
|---|---|---|---|---|
| A1 | 20 | 20 | 0 | 10 |
| B2 | 27 | 28 | 1 | 5 |
| 합계 | | | | **15** (첫 점수 배치라 누적도 15) |

### 9.3 실행 결과

- 명령: `$env:PLAYWRIGHT_PREVIEW='1'; npx playwright test e2e/game.spec.ts -g '8 two codes in one placement'`
- 종료 코드: **0**. 1/1 통과, Chromium 159, 22.5 s.
- 관찰 결과: 같은 공개 화면에 `A1` 정답 합 20, `B2` 정답 합 28. 점수 표는 `tr[data-seat]`로 좌석을 식별했다.
  - P0: 획득 15, 누적 15 (기대값과 일치)
  - P1: 획득 5, 누적 5 (기대값과 일치)
  - P2: 획득 0, 누적 0 (기대값과 일치)
  - P3: 획득 0, 누적 0 (기대값과 일치)
- 기존 공개 화면 검사(추측 값 비노출, 입력란 없음, 제출 전 정답 합 없음)는 그대로 실행되어 통과했다.

프로덕션 코드(`src/`)와 Hook 설정은 변경하지 않았다. 변경은 `e2e/game.spec.ts`의 시나리오 값과 점수 확인 블록뿐이다.

### 9.4 PostTaskExec Hook: 미검증 (unverified)

- 이 실행은 Playwright 명령으로만 이루어졌다. IDE의 Spec 작업 실행이 아니므로 자동 Hook과 연결되지 않는다.
- 확인 시각 2026-11-24 12:38 KST 기준, `events.jsonl`은 항목 75개(모두 `save-typecheck`)이고 `spec-verification`은 0개이다.
- 검증기를 수동으로 실행하지 않았다.
## 10. PostTaskExec Hook 검증 시도: 기준값 기록과 미검증 판정 (2026-11-24 KST)

| 항목 | 값 |
|---|---|
| 기준 리비전 | `3e7a626` (브랜치 `codex/android-offline-companion`, 작업 트리에는 이 검증과 무관한 변경이 있음) |
| 기준 시각 | 2026-11-24 12:41:38 +09:00 |
| Hook 설정 파일 | `.kiro/hooks/verify-after-task.json`: 이름 `QRoker post-task verification`, trigger `PostTaskExec`, 명령 `node scripts/verify-task.mjs`, `enabled: true`. 설정 파일 기준이며, Kiro IDE가 이를 활성으로 인식하는지는 이 채팅에서 확인할 수 없음 (**미검증**) |
| 기준 `spec-verification` 항목 수 | **0** (정확한 kind 일치, 전체 항목 75개는 모두 `save-typecheck`) |
| 네이티브 Spec 작업 실행 | **이 채팅에서 사용 불가.** Spec 작업 실행기 도구나 `spec-task-execution` 에이전트가 없음. 8.6을 다시 실행하지 않음 |
| 네이티브 작업 완료 이벤트 | **미검증** |
| 자동 PostTaskExec 실행 | **미검증** |
| `typecheck:game`, `test:game` 결과 | **미실행.** Hook이 실행되지 않았고, 증거를 섞지 않으려고 수동으로도 실행하지 않음 |

### 다음 단계로 필요한 IDE 동작 (한 가지)

Kiro IDE에서 `.kiro/specs/qroker-playable-game/tasks.md`를 열고, 작업 목록에서 **Task 8.6의 실행(재실행) 버튼**을 한 번 누른다. 완료된 뒤에 Hook 출력 패널을 확인한다. 그 다음 같은 시각의 `spec-verification` 항목 수를 기준값 0과 비교하고, 항목이 있으면 `revision`이 `3e7a626`인지와 `checks`의 `typecheck:game`, `test:game` 결과를 기록한다.

### 판정 기준

- Hook이 실행되었다고 보려면: 작업 완료 시각 이후의 `spec-verification` 항목이 생기고, 그 `revision`이 기준 리비전과 맞아야 한다. 수동 실행이나 설정 파일만으로는 충분하지 않다.
- 검사 결과는 Hook 실행 여부와 별도로 기록한다. 검사가 실패했다면 "자동 실행 관찰, 검증 실패"로 적고 실패한 검사 이름을 남긴다.