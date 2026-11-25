# 덱 소진 종료 규칙 반영 검증 (RULES_VERSION 4)

## 1. 규칙

- 드로우로 덱의 마지막 카드를 가져가는 순간 게임이 즉시 끝난다. 점수는 그 시점의 점수로 확정된다.
- 이 종료에는 보너스가 없다. 가져간 카드는 그 플레이어의 손패에 남는다.
- 코드를 완성한 배치는 드로우하지 않으므로, 덱에 카드가 1장 남아 있어도 정상 채점되고 게임은 계속된다.
- 유지한 값: 손패 3장, 손패 소진 보너스 5, 코드 한도 5, 마지막 배치 전체 채점, 보상표 `[10, 5, 4, 3, 2, 1]`.
- 이 보고서는 규칙을 바꾸지 않는다. 구현(`src/game/core/engine.ts`의 `reducePlace`)은 Codex가 작업 트리에 둔 변경이다. Kiro는 명세만 고쳤다.

## 2. 기준

| 항목 | 값 |
|---|---|
| HEAD | `b0698d2` (`codex/android-offline-companion`) |
| 작업 트리 | 미커밋 변경 다수(규칙 구현, UI, 스타일, 테스트). 커밋, push는 하지 않았다 |
| 구현 식별자 | `RULES_VERSION = 4`, `SAVE_KEY = 'qroker.practice.save.rules4'` (버전 3 슬롯 `qroker.practice.save.rules3`은 읽지 않고 남김) |

## 3. 명세 변경 (Kiro)

`.kiro/` 아래 Markdown만 수정했다. 체크박스 상태는 바꾸지 않았다. 과거 증거와 과거 문장은 `Amendment` 표시와 함께 남겼다.

| 파일 | 요구사항, 설계 항목 |
|---|---|
| `.kiro/specs/qroker-game/requirements.md` | 개정 2 안내, 용어 `Draw_Rule`, `Hand_Empty_End`, 새 용어 `Deck_Exhaustion_End`, 기준 2.9, 3.7, 3.8, 3.15, 새 기준 3.16 |
| `.kiro/specs/qroker-game/design.md` | 드로우 규칙 설명, 게임 종료 조건(세 가지 종료 방식), 드로우 항목 4개, `Deck exhaustion` 절, DrawManager 단위 테스트 목록 |
| `.kiro/specs/qroker-playable-game/requirements.md` | 6.6, 8.8, 9.1, 9.3, 요구사항 12 기준 6(`RULES_VERSION` 4), 요구사항 18 기준 9(슬롯 `rules4`, 이전 슬롯 보존), OQ-16 |
| `.kiro/specs/qroker-playable-game/design.md` | 상태 다이어그램, 드로우 설명, 리듀서 8단계, `RULES_VERSION = 4`, `SAVE_KEY`, 저장 예시 버전, 불변식, 속성 12, 속성 19, 속성 19a 표 두 행, `Deck Exhaustion` 절, 테스트 시나리오 |
| `.kiro/specs/qroker-playable-game/tasks.md` | `Amendment 2` 절 추가. 체크박스는 그대로 |
| `.kiro/steering/project.md` | 승인 규칙 문장을 `RULES_VERSION = 4`와 새 종료 조건으로 갱신 |

## 4. 테스트 실행 결과

### 4.1 `npm run test:ci` (vitest, 전체 스위트)

| 항목 | 결과 |
|---|---|
| 파일 / 테스트 | 109 / 3,038 |
| 통과 | 3,036 |
| 실패 | 2 (아래) |
| 종료 코드 | 1 |

실패 1: `src/optical/detect.test.ts` › "6. scaling ... blurred non-integer scales"
- 오류: `Test timed out in 5000ms`. 전체 실행과 단독 재실행(두 번) 모두 실패했다. 이 테스트는 약 10초 걸린다.
- `src/optical/`은 이번 작업에서 바뀌지 않았다. 프로젝트 규칙에 따라 타임아웃을 올리거나 단언을 바꾸지 않았다. 부하에 따른 기존 타임아웃 문제로 남긴다.

실패 2: `src/game/ui/screens/game.test.ts` › "keeps touch-action off ... uses no hover rule"
- 오류: 스타일에 `:hover` 규칙이 있다. `src/game/ui/styles/layout.css`의 359행(`.game-bar__button:hover`)과 488행(`.setup-start:hover`).
- HEAD의 `layout.css`에는 `:hover`가 없다. 미커밋 UI 작업에서 들어온 것이다. 덱 규칙과 무관하다. 미커밋 UI 작업은 건드리지 않았다.

### 4.2 `npx playwright test` (E2E)

- 저장소 설정 그대로 실행하면 포트 5173을 다른 Playwright 실행이 점유하고 있어 시작하지 못했다(`Port 5173 is already in use`). 다른 프로세스는 종료하지 않았다.
- 같은 테스트 파일을 임시 설정(저장소 밖, 포트 4174)으로 실행했다. 실행 파일: `D:/DevCaches/tmp/qroker-review/pw-all.config.mjs`.
- 결과: 45건 중 43 통과, 2 실패. 종료 코드 1.
  - `e2e/game.spec.ts:90` "2 placement › drag then confirm, Escape, position first, rotation only for clubs and spades": `.hand-card .card-face__suit`가 0개였다(기대 3). 미커밋 `card-face.ts`, `hand.css` 변경으로 보인다.
  - `e2e/placement-playground.spec.ts:53` "real mouse drag creates a preview without placing until confirmation": 칸 `[data-row="2"][data-col="3"]`에 `is-target`이 기대됐지만 `board-cell--legal is-legal`만 있었다. 미커밋 `board.ts`, `board.css` 변경으로 보인다.
- 두 실패 모두 손패, 보드의 UI 렌더링에서 나온다. 덱 규칙 로직과는 관계가 없다. 다만 HEAD에서 재현하지는 않았다.
- 덱 소진, 코드 배치 관련 E2E 시나리오(`4 reveal and scoring`, `8 two codes in one placement`, `5 replay and rematch`)는 통과했다.

## 5. 규칙 검증

### 5.1 기존 엔진 테스트 (test:ci에서 통과)

- `src/game/core/engine.test.ts`: "drawing the last card ends the game immediately with the existing scores". 덱 소진 종료, 점수 유지, 보너스 없음, 종료 뒤 행동 거부를 확인한다.
- `src/game/core/ranking.test.ts`: `[5,5,3,0] → [1,1,3,4]`, `[7,7,7,2] → [1,1,1,4]` 등 동점 순위.

### 5.2 저장소 밖 임시 검증 (실제 엔진, `D:/DevCaches/tmp/qroker-review/verify-rule4.mts`)

| 점검 | 결과 |
|---|---|
| 덱에 1장이 남은 상태에서 코드를 완성한 배치 | 25건 발견. 모두 `GUESS_COLLECT`, 드로우 없음(덱 1장 유지), 배치한 플레이어가 코드당 10점을 얻음 |
| 위 배치 뒤 게임 계속 | 23건은 공개 후 `PLACEMENT`로 계속. 2건은 같은 배치에서 `ENDED`에 도달(손패 소진 또는 코드 한도. 임시 스크립트는 사유를 기록하지 않음) |
| 무작위 일반 게임 300판 | 296판이 덱 소진으로 끝남. 보너스가 붙은 덱 소진 종료 0건 |
| 동점 순위 `[7,7,7,2]` | `[1,1,1,4]`. 실패 0 |
| 결과 | `failures: []`, 종료 코드 0 |

### 5.3 실험 기록 점검 (32,000판, 새 규칙)

| 점검 | 결과 |
|---|---|
| 실패 | 0 |
| 덱 소진 종료 판 | 25,860. 보너스 0건, 최종 점수 = 예측 점수 합 25,860건 |
| 손패 소진 종료 판 | 4,928. 보너스 수령자가 끝낸 좌석과 일치 |
| 코드 한도 종료 판 | 1,212. 보너스 0건 |
| 동점인데 순위가 다른 판 | 0 |
| 첫 PLACE가 시작자 | 32,000 / 32,000 |
| 보너스 금액과 수령자 | 32,000 / 32,000 |
| 몫 합 = 1 | 32,000 / 32,000 |

## 6. 타입체크

- `npm run typecheck` (`tsc -p tsconfig.json`): 종료 코드 0
- `npm run typecheck:game` (`tsc -p tsconfig.game.json`): 종료 코드 0

## 7. 남은 문제

1. 광학 테스트 `detect.test.ts`의 타임아웃(부하 의존). 단독 재실행에서도 실패했다. 타임아웃을 올리지 않았다.
2. `game.test.ts`의 `:hover` 실패. 미커밋 UI 작업의 `layout.css` 규칙 때문이다. UI 작업 쪽에서 `:hover`를 제거하거나 테스트 기준을 정해야 한다.
3. E2E 두 건(손패 suit 클래스, 드래그 대상 클래스). 미커밋 UI 작업으로 보인다. HEAD에서의 재현은 하지 않았다.
4. 명세 문장과 주석의 옛 `RULES_VERSION = 3` 표현은 역사 기록으로 남겼다. 구현 주석 중 일부가 옛 문장을 가질 수 있다(이 작업 범위 밖).
