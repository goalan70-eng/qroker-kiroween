# Milestone 3 결과 보고서 (작업 3.3)

원본 출력: `docs/optical/results/m3-test-output.txt`. 소스, 테스트, 임계값, 동결 코드북, 이전 마일스톤 결과 파일은 수정하지 않았다. 커밋 없음.

## 실행한 명령과 종료 코드

| # | 명령 | 종료 코드 | 결과 |
|---|------|-----------|------|
| 1 | `npm test` (1회차) | 0 | 8 files, 108 tests passed |
| 2 | `npx tsc --noEmit` | 0 | 출력 없음 (중복 재실행도 종료 코드 0) |
| 3 | `npm run check:codebook` | 0 | 재생성 코드북이 codebook.v1.json과 바이트 동일 |
| 4 | `npm run verify:codebook` | 0 | PASS (dId=5, dSelf=6, minDistance=5) |
| 5 | `npm run render:samples` | 0 | 9개 PNG 기록 |
| 6 | `npm test` (2회차, 재현성) | 0 | 8 files, 108 tests passed |
| 7 | `npx vitest --run --reporter=verbose` | 0 | 108 tests passed |

실행 기록의 결함 (m3-test-output.txt 말미 CORRECTIONS에 기재): 첫 배치의 콘솔 표시가 비어 있었으나 섹션 1~5는 실제로 완료되어 기록됐다. 그래서 tsc가 한 번 더 실행됐다. 둘째 배치에서 PowerShell 별칭 `H`(Get-History) 충돌로 "render 1회 후 해시" 섹션이 기록되지 않았다. 따라서 "1회 render 직후" 해시는 없다. 대신 render를 총 4회 실행했고, 3회 후(C)와 4회 후(D)의 해시를 기록했으며 둘 다 BEFORE와 동일하다.

## 테스트 수 (verbose 출력에서 집계)

| 파일 | 테스트 수 |
|------|-----------|
| src/optical/smoke.test.ts | 2 |
| src/optical/fragments.test.ts | 25 |
| src/optical/transforms.test.ts | 9 |
| src/optical/render.test.ts | 32 |
| src/optical/codebook.test.ts | 10 |
| src/optical/verify-codebook.test.ts | 22 |
| scripts/render-samples.test.ts | 7 |
| scripts/verify-bound.test.ts | 1 |
| 합계 | 108 (Vitest 합계 108과 일치) |

## 테스트가 실제로 단언한 픽셀 수준 결과 (테스트 이름 기준)

- 하트/다이아몬드: 카드 레이어가 180° 점대칭 (render.test.ts "H/D point symmetric", modulePx 2, 4). 클럽/스페이드는 가로축 반사 대칭이며 반대 대칭은 성립하지 않음("and not the other").
- 물리 회전 법칙 `layer(180) == rot180(layer(0))` (modulePx 2, 4), fast-check 속성 `layer(card,180) == ownRot180(layer(card,0))`도 양방향 확인.
- 빈 모서리: "blank corners and layer size" (modulePx 1, 2, 4).
- 슬롯 기하: TL/BR 점대칭, TL/BL 및 TR/BR 가로축 반사 (modulePx 1~8).
- 래스터 수준 변환 동등성 (Property 21): `render(applyTransform(g,P)) == ownTransform(g, render(P)) == applyImageTransform` (modulePx 1, 2, 3). 52×8 범위는 테스트 이름이 아니라 기존 코드베이스 테스트 설명에 근거하며, 이 보고서는 52×8 전수 여부를 테스트 코드를 다시 읽어 확인하지 않았다.
- 결정성: 반복 렌더 바이트 동일, 해시 반복 (determinism), PNG 인코더 결정성.
- 거부: 방향 90, 270, -90, 360, 1, NaN, null, undefined는 RangeError; 카드 키 JK, JOKER, X-JOKER, "", H-1, H-11, X-A, h-a는 throw; modulePx 0, -1, 1.5, null, "2"는 RangeError. 방향 0과 180은 허용.
- 기타: ALL_CARDS 52개 고유 키(조커 없음); 모든 배치 모서리가 인쇄된 패턴에서 유도됨; 클럽/스페이드 공유 모서리는 5비트 이상 차이; 동결 JSON 바이트 불변.

## 해시 비교

- 코드북·검증 파일 (BEFORE = AFTER): codebook.v1.json `515ECEB3…CC2D4`; codebook-verification.json `B331EC5E5499BA6831A23880F977A6C7EB2219323F15B8FEDD0BD819DAF1EF36`; codebook-verification.md `5698693E994EA3229FE30DDC63A160A9A1C9AC0F13B117A0040CA93D5068EE66`. 작업 지시에 적힌 값과 일치.
- docs/optical/samples/ 11개 파일: BEFORE, 3회 render 후, 4회 render 후 해시가 모두 동일 (파일 수 11 유지). 4회 render 사이에 바이트 차이 없음.

## 샘플 파일과 SHA-256 (manifest.json)

| 파일 | 크기 | SHA-256 |
|------|------|---------|
| H-A-0.png | 320×448 | 664eecb01f0ce3ced9a88726d0642aeacd7375beec9970e441b944fc071f5e28 |
| H-A-180.png | 320×448 | 664eecb01f0ce3ced9a88726d0642aeacd7375beec9970e441b944fc071f5e28 |
| D-K-0.png | 320×448 | 6f7b53721321f5a0f9add45342398256f0aed79ab01d8b8fa7f56b6f6e2bb007 |
| D-K-180.png | 320×448 | 6f7b53721321f5a0f9add45342398256f0aed79ab01d8b8fa7f56b6f6e2bb007 |
| C-7-0.png | 320×448 | 3a84d54e051023264f4f767c6dbd4fb7426d5afe402de7ebad139ad7f9a7bf7a |
| C-7-180.png | 320×448 | 7efdf8f1d69c02e5977d61675a18cc683a649e114de1a4f3d45d1c2cd019e4a8 |
| S-Q-0.png | 320×448 | b54b1261f51ffad2898a74179c112de01096dcceb72adbd9a53686c9056f33dd |
| S-Q-180.png | 320×448 | 28593f31cae8254aa6af4c91d96444eddd477f5f165de579c234f2610908c3d5 |
| contact-sheet-0deg.png | 1096×468 | e7ea1468bba4b9b08b2b99a2b4ec6f8c6eea31ba680f3c1a636caaee734d5399 |

H-A-0과 H-A-180, D-K-0과 D-K-180은 바이트가 같다. 하트와 다이아몬드 레이어가 180° 점대칭이라는 결과와 일치한다.

## 시각 검사

이미지 읽기 기능으로 5개 PNG(contact-sheet-0deg, C-7-0, C-7-180, H-A-0, H-A-180)를 열었다. 보이는 내용은 다음과 같다.

- 대비 시트: 13열×4행, 회색 구분선, 흰 카드 배경. 카드마다 7×7 모듈 정사각 마커가 2개 있고 검은 테두리 안에 흰/검은 셀이 있다. 1행(하트)은 좌상(TL)과 우하(BR), 2행(다이아몬드)은 우상(TR)과 좌하(BL), 3행(클럽)은 TR과 BR, 4행(스페이드)은 TL과 BL에 마커가 있다. 나머지 모서리는 흰색이다.
- 단일 카드 이미지: 각 이미지에 마커 2개가 있고 나머지 영역은 흰색이다. 하트 두 이미지는 TL과 BR에 같은 모양으로 보인다(해시 동일과 일치).
- 클럽의 0°/180° 이미지: 첨부된 이미지 순서가 내가 붙인 라벨과 일치하는지 눈으로는 확신할 수 없었다. 한 이미지는 좌측 두 모서리(TL, BL), 다른 이미지는 우측 두 모서리(TR, BR)에 마커가 있었다. 어느 것이 0°인지는 눈으로 정하지 않고 픽셀 검사로 정했다.
- 픽셀 검사(읽기 전용, node 임시 스크립트, 보존하지 않음, 결과는 m3-test-output.txt 섹션 10): 사분면별 어두운 픽셀 수. C-7-0 = TR 2496, BR 2496, TL/BL 0. C-7-180 = TL 2496, BL 2496, TR/BR 0. H-A-0과 H-A-180 = TL 2304, BR 2304. D-K-0 = TR 2560, BL 2560. S-Q-0 = TL 2368, BL 2368. S-Q-180 = TR 2368, BR 2368. 이는 설계 배치(♥ TL+BR, ♦ TR+BL, ♣ TR+BR, ♠ TL+BL; 180°에서 반대 모서리)와 일치한다.
- 스페이드 S-Q와 다이아몬드 D-K의 단일 이미지는 열어 보지 않았고, 위 수치로만 확인했다.

## 180° 콘텐츠 규칙 (테스트가 단언한 것)

- ♥: 레이어가 180° 점대칭 (R180 유도). 180°에서 같은 모서리 TL+BR이 유지된다.
- ♦: 레이어가 180° 점대칭. TR+BL 유지.
- ♣: 가로축 반사 대칭 (Fh 유도). 0°는 TR+BR, 180°는 TL+BL로 이동하며 각 모서리 내용은 `visible[Y] = R180(printed[opposite(Y)])`를 따른다.
- ♠: 가로축 반사 대칭. 0°는 TL+BL, 180°는 TR+BR.
- ♣ 0°와 ♠ 180°는 모서리 집합 TR+BR을, ♣ 180°와 ♠ 0°는 TL+BL을 공유하며 공유 모서리에서 패턴이 5비트 이상 다르다.

## 검증된 것 / 가정으로 남은 것

검증된 것: 위 108개 테스트 통과, 타입 검사 통과, 코드북 재생성 바이트 동일, 독립 검증기 PASS, 샘플 4회 렌더 결정성, 샘플 PNG의 사분면 배치.

가정으로 남은 것 (이 마일스톤에서 확인하지 않음):
- 이미지 디코딩(검출, 호모그래피, 5×5 읽기)은 아직 없다 (마일스톤 4).
- 마일스톤 5의 슬롯 표와 반사 판정 논리는 다루지 않았다.
- 실제 인쇄와 카메라 촬영 결과는 없다.
- 카드 크기(40×56 모듈)와 여백은 시제품 값이다.
- 렌더러와 테스트를 같은 프로젝트 안에서 작성했으므로 독립 검증이 아니다.
- 이 보고서의 테스트 이름 기반 서술은 verbose 출력의 이름에 근거하며, 개별 단언 내용을 테스트 코드 줄 단위로 재검토하지는 않았다.

## git status --short (커밋 없음)

```
M  .gitignore
MM .kiro/specs/qroker-game/tasks.md
MM .kiro/specs/qroker-game/tasks.meta.json
M  docs/optical/results/bound.json
M  docs/optical/results/bound.md
A  docs/optical/results/codebook-verification.json
A  docs/optical/results/codebook-verification.md
A  docs/optical/results/m2-final-output.txt
A  docs/optical/results/m2-report.md
A  docs/optical/results/m2-test-output.txt
MM package.json
A  scripts/verify-codebook.ts
A  src/optical/verify-codebook.test.ts
A  src/optical/verify-codebook.ts
?? docs/optical/results/m3-test-output.txt
?? docs/optical/samples/
?? scripts/png.ts
?? scripts/render-samples.test.ts
?? scripts/render-samples.ts
?? src/optical/fragments.test.ts
?? src/optical/fragments.ts
?? src/optical/render.test.ts
?? src/optical/render.ts
```

(m3-report.md는 이 목록을 만든 뒤에 생성되어 목록에 없다.)
