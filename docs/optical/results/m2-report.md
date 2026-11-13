# Milestone 2 실행 결과 (task 2.4)

원본 출력: `docs/optical/results/m2-test-output.txt`. 모든 수치는 실제 실행 결과이며 소스, 테스트, 임계값, 동결 코드북은 수정하지 않았다.

## 명령과 종료 코드

| # | 명령 | 종료 코드 | 결과 |
|---|---|---|---|
| 1 | `npm test` (run 1) | 0 | 5 files passed, 41 passed / 1 skipped (42) |
| 2 | `npm run verify:codebook` | 0 | PASS (dId=5, dSelf=6, minDistance=5) |
| 3 | `npm run check:codebook` | 0 | 재생성 결과가 codebook.v1.json과 바이트 동일 |
| 4 | `npm run verify:bound` | 0 | 모든 주장 값 일치 (bound 198, d6Bound 45, d7Bound 7) |
| 5 | `npx tsc --noEmit` | 0 | 오류 없음 |
| 6 | `npm test` (run 2, 재현성) | 0 | run 1과 동일: 41 passed / 1 skipped |
| 7 | `npx vitest --run --reporter=verbose` | 0 | 동일 41 passed / 1 skipped, 테스트명 전부 기록 |
| 8 | `npm run verify:codebook` (2회차) | 0 | PASS |

## 파일별 테스트 수 (verbose 출력 기준)

| 파일 | 통과 | 스킵 |
|---|---|---|
| src/optical/smoke.test.ts | 2 | 0 |
| src/optical/transforms.test.ts | 9 | 0 |
| src/optical/codebook.test.ts | 10 | 0 |
| src/optical/verify-codebook.test.ts | 19 | 1 |
| scripts/verify-bound.test.ts | 1 | 0 |
| 합계 | 41 | 1 (총 42) |

스킵 1건: `E. verifier template bits vs applyTransform`. 사유(테스트 이름 그대로): verifyCodebook이 416개 템플릿을 노출하지 않으므로(검증기는 변경하지 않음) 건너뜀.

## 검증기 측정값 (`codebook-verification.json`)

- cards 52, templates 416, pairs 86,320
- minPairDistance 5, dId 5, dSelf 6
- weight min 9, max 16
- 거리 히스토그램: 5:136, 6:512, 7:1128, 8:2968, 9:5080, 10:8416, 11:11664, 12:13600, 13:13480, 14:11144, 15:8376, 16:5180, 17:2808, 18:1188, 19:464, 20:104, 21:64, 22:8
- 히스토그램 합 = 86,320 (PowerShell로 합산, pairs와 일치)
- 검증기 checks 13개 모두 ok, failures 비어 있음

## metadataAgreement (JSON에서 복사)

| 필드 | stored | measured | match |
|---|---|---|---|
| dId | 5 | 5 | true |
| dSelf | 6 | 6 | true |
| weightRange | [9, 16] | [9, 16] | true |
| sha256 | a6974f3491efbd5aec87bb00807c113962015838c9b74d0df9863f38fdc29a74 | a6974f3491efbd5aec87bb00807c113962015838c9b74d0df9863f38fdc29a74 | true |

## 산출물 재현성 (verify:codebook 2회 실행)

| 파일 | 1회차 SHA256 | 2회차 SHA256 | 동일 |
|---|---|---|---|
| codebook-verification.json | B331EC5E5499BA6831A23880F977A6C7EB2219323F15B8FEDD0BD819DAF1EF36 | 동일 | 예 |
| codebook-verification.md | 5698693E994EA3229FE30DDC63A160A9A1C9AC0F13B117A0040CA93D5068EE66 | 동일 | 예 |

## 동결 파일 해시 (`src/optical/codebook.v1.json`)

- 실행 전: 515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4
- 실행 후: 515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4
- 변경 없음.

## 거부되는 음성 사례 (verify-codebook.test.ts, 모두 통과)

테스트 이름에 기록된 기대 check id 기준.

| 사례 | 거부 check id |
|---|---|
| 1. 동일한 기본 패턴 | base-distinct |
| 2. 다른 카드 템플릿을 다른 변환으로 대체 | min-distance, d-id |
| 3. 다른 카드 템플릿에서 1~3비트 반전 | min-distance (거리 < 5) |
| 4. 가중치 범위 이탈 | weight-range |
| 5. R180/Fh 대칭 패턴 (가중치는 범위 내) | d-self / min-distance |
| 6. 카드 키 집합/순서 오류 | card-keys |
| 7. 잘못된 패턴 값 | pattern-values |
| 8. 메타데이터 거짓 | metadata-agreement 또는 sha256 |
| 9. 객체가 아닌 입력 | shape (예외 없음) |
| 10. deep-freeze된 입력 | 예외 없음, 변형 없음 |
| 11. 무작위 1~4비트 손상 속성 | verifier.ok가 brute-force 판정과 일치 |

추가로 D 그룹: 손상된 임시 복사본은 실패로 보고되고 동결 파일은 그대로이며, 파싱 불가 입력도 예외 없이 실패로 보고된다.

## 검증된 것 / 가정으로 남은 것

### 검증된 것 (실행된 테스트와 스크립트가 확인)
- 52개 키, 정규 순서, 25비트 값, 52개 서로 다른 기본 패턴, 가중치 9~16.
- 416개 템플릿이 모두 다르고 86,320쌍 전부 해밍 거리 5 이상(dId=5, dSelf=6). 독립 검증기의 측정값이 저장된 메타데이터와 일치.
- 8개 D4 셀 맵이 25셀 위의 전단사이고 합성에 닫혀 있음. 행렬 연산과 동등.
- ♥♦는 R180, ♣♠는 Fh로 만든 두 번째 조각이 P와 5비트 이상 다르고 같은 궤도에 있음(패턴 수준).
- 생성기는 결정적이며 동결 파일과 바이트 동일하고, 시도 한도 초과 시 부분 결과 없이 예외를 던짐.
- 2^25 전수 열거로 용량 상한(198 / 45 / 7)이 주장 값과 일치.
- 검증기는 `node:crypto`만 import하고 CLI는 생성기 모듈을 import하지 않음(테스트 B).
- 위 11개 음성 사례가 의도한 check id로 거부됨. 두 번의 `npm test`가 동일한 결과.

### 가정으로 남은 것
- 이미지 디코딩(래스터화, 이진화, 격자 샘플링)은 검증되지 않음.
- 래스터화된 조각의 픽셀 수준 슈트 레이어 대칭은 검증되지 않음(패턴 수준만 검증).
- 실제 카메라, 조명, 블러, 원근 왜곡은 검증되지 않음.
- 독립 검증기는 생성기와 코드를 공유하지 않지만, 둘 다 같은 프로젝트에서 작성됐다. 공통된 오해가 있으면 양쪽에 같이 들어갈 수 있다.
- 테스트 E는 스킵되었다. 검증기의 416개 템플릿 비트와 `applyTransform`의 직접 비교는 이 실행에서 수행되지 않았다.
- 사례 11 속성의 마지막 `bruteTrue >= 0` 단언은 항상 참이라 의미가 없다. 실질적인 단언은 `verifier.ok === brute.ok`뿐이다.

## 작업 트리 git status (커밋하지 않음)

```
 M .kiro/specs/qroker-game/tasks.md
 M .kiro/specs/qroker-game/tasks.meta.json
 M docs/optical/results/bound.json
 M docs/optical/results/bound.md
 M package.json
?? docs/optical/results/codebook-verification.json
?? docs/optical/results/codebook-verification.md
?? docs/optical/results/m2-report.md
?? docs/optical/results/m2-test-output.txt
?? scripts/verify-codebook.ts
?? src/optical/verify-codebook.test.ts
?? src/optical/verify-codebook.ts
```

참고: `bound.json`과 `bound.md`의 변경은 `verify:bound`가 파일을 다시 쓰면서 생긴 것이다. bound.md의 diff는 실행 시간 한 줄(1.9 s → 1.7 s)이다.
