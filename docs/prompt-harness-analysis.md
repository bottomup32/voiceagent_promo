# 고객 응대 프롬프트 분석 & 하네스 개발 플랜

작성일: 2026-09-23 · 범위: 분석과 계획만 (코드 변경 없음)

> **읽기 전에**
> - 이 환경에서는 `developers.openai.com` 접속이 막혀 있어서, GPT-Live 공식 가이드는 **검색 결과 발췌만 보고** 정리했다. 원문의 정확한 문구, 템플릿 전체, 권장 길이 같은 세부는 원문과 다를 수 있다. 🔍 표시는 원문을 다시 확인해야 하는 항목이다.
> - 코드와 관련된 판단은 이 저장소의 코드와, `vite-node`로 실제 생성해 본 샘플 프롬프트를 근거로 했다. 재현 방법은 부록 A에 있다.
> - 업계 관행 자료는 대부분 벤더 블로그다. 독립적으로 검증된 기준이라기보다 "많이 쓰이는 방식" 정도로 읽는 게 맞을 것 같다.

---

## 진행 상태 (2026-09-23 업데이트)

아래 분석을 바탕으로 한 1차 개발을 마쳤다.

| 항목 | 상태 | 커밋 / 위치 |
|---|---|---|
| B1–B5 버그 | 완료 | `lib/prompt.ts` (`city`, `withArticle`, `backendProfile`), `lib/use-cases.ts` (`categoryMentions`), `lib/call-clock.ts` (`ordinal`) |
| 가이드 구조 (Backchannel / Interruption / Delegation / Unclear audio / Honesty and escalation) | 완료 | `buildLivePrompt`, `buildBackendPrompt`, `PROMPT_VERSION = 5` |
| 데모 고지(예약·메시지), AI 여부 질문, 응급 안내, 역할 변경 요청 | 완료 | 두 프롬프트 모두 |
| 업종별 안전 규칙(의료 / 법률·금융 / 음식 알레르기, 최대 2줄) | 완료 | `safetyLines()` |
| 짧은 FAQ를 음성 프롬프트에 (최대 5개, 답 140자 이하) | 완료 | `faqLines()` |
| 길이 예산 테스트 | 완료 | `tests/prompt-budget.test.ts` (음성 규칙 3,900자 이하, 백엔드 규칙 1,200자 이하, 업종별 2줄 이하) |
| 평가 스크립트 (시나리오 20개 × fixture 5개, 40행) | 완료, **아직 실행 안 함** | `evals/`, `vitest.eval.config.ts`. `OPENAI_API_KEY`가 필요한데 개발 환경에 없었음 |
| function tools (P4) | 이번 범위 밖 | — |

사용자가 정한 것: 톤은 모든 업종에서 밝고 업비트하게 유지, AI 여부는 물으면 솔직하게, 예약할 때 데모라는 사실을 통화 중에 밝힘.

남은 확인 사항 🔍
- 평가를 **변경 전과 변경 후**에 각각 한 번씩 돌려 비교할 것. 변경 전 기준점은 프롬프트 파일만 되돌려서 잡는다(평가 코드는 `buildPrompts`와 `callClock`만 쓴다):
  ```bash
  git checkout 5ab48b3 -- lib/prompt.ts lib/call-clock.ts lib/use-cases.ts
  npx vitest run -c vitest.eval.config.ts     # 기준점 → evals/results/
  git checkout HEAD -- lib/prompt.ts lib/call-clock.ts lib/use-cases.ts
  npx vitest run -c vitest.eval.config.ts     # 변경 후
  ```
- 음성 프롬프트가 약 1.7k자에서 약 3.5k자(규칙만)로 늘었다. 가이드가 권하는 "짧게"와 균형이 맞는지, 첫 응답 지연이 실제 통화에서 늘었는지 확인할 것.
- "데모라고 한 번 말하기"가 실제 GPT-Live 통화에서 과하거나 부족하지 않은지 들어볼 것.

---

## 0. 요약

| 질문 | 답 (확신도) |
|---|---|
| 고객마다 다른 프롬프트가 생성되나? | **예.** 리서치 결과(`BusinessProfile`)를 **고정된 템플릿**에 채워 넣는 방식이다. LLM이 고객별 프롬프트를 새로 쓰는 구조가 아니다. (코드로 확인) |
| 그 설계가 잘 동작하나? | **기본 골격은 탄탄해 보인다.** 재현 가능하고, 데이터가 바뀌면 다시 생성되고, 날짜를 통화마다 넣어주고, 모르는 값은 "unknown"으로 처리한다. 다만 **실제로 확인한 버그가 4건**이고, **업종에 맞춘 조정은 사실상 없다.** |
| 공식 가이드와 맞나? | 언어와 오프닝은 잘 맞는다. **위임 정책, 알아듣기 어려운 음성 처리, 에스컬레이션 섹션이 약하거나 빠져 있고**, 음성 프롬프트에 업체 사실이 많이 들어가 있다. 이 마지막 점은 응답 지연과의 트레이드오프라서 무조건 틀렸다고 보긴 어렵다. |
| 업종별로 적절한가? | 톤("밝고 업비트", "전화 와서 반가운")과 규칙이 모든 업종에 똑같다. 치과·법률사무소에서 응급 상황이나 전문 조언 요청에 대한 규칙이 없다. |
| 오버 옵티마이제이션 위험은? | **지금 프롬프트는 짧은 편이다**(음성 프롬프트 약 2.2k자, 대략 500~600 토큰 추정). 개선하면서 오히려 부풀어 오를 위험이 더 크다고 본다. 섹션 6에 가드레일을 제안했다. |

---

## 1. 고객별 프롬프트가 만들어지는 경로 (코드로 확인)

```
[운영자 입력: 업체명 + (웹사이트, 지도 링크, 메모)]
        │
        ▼
lib/research.ts  researchBusiness()
  ① buildDossierPrompt   — 웹 검색으로 마크다운 브리핑 작성 (섹션 7개, 모르면 "unknown")
  ② buildProfilePrompt   — 도구 없이 브리핑을 JSON(BusinessProfile)으로 옮겨 적기만 함
  ③ stripEmpties         — null / "" / "unknown" 제거
        │
        ▼
lib/prompt.ts  buildPrompts(profile, agentName, language)
  ├─ live     = buildLivePrompt      (음성 모델: 역할·언어·말투 + 업체 사실 요약)
  ├─ backend  = buildBackendPrompt   (위임 대상 모델: 규칙 6줄 + profile JSON 전체)
  └─ greeting = buildGreetingPrompt  (먼저 말하기 + 언어별 인사 문구)
        │
        ▼  저장 (customers:{id})
        │   · 손으로 수정하지 않은 프롬프트는 저장·재조사 때마다 다시 생성 (resolvePrompts)
        │   · PROMPT_VERSION이 바뀌면 읽을 때 다시 생성 (lib/store.ts normalize)
        │   · 손으로 수정한 프롬프트(edited)는 그대로 고정
        ▼
app/api/session/route.ts  (통화마다)
  instructions            = live    + callClock(오늘 날짜, 7일 예약표)
  delegation.responses    = backend + callClock
        │
        ▼
hooks/useLiveCall.ts
  session.started 이후 → session.instructions.append(greeting)
  2.5초 동안 말이 없으면 → session.commentary.append(인사 문구)
  종료 30초 전 → WRAP_UP_INSTRUCTION, 40초 무음 → CHECK_IN_INSTRUCTION  (lib/call-limits.ts)
        │
        ▼
lib/call-review.ts  통화가 끝난 뒤 사후 리뷰 → gaps → gapRollup()
```

**설계상 잘한 점** (가이드나 업계 관행과 비교해도 괜찮아 보이는 부분):

1. **결정적인 템플릿 방식.** 고객마다 LLM이 프롬프트를 새로 쓰면 결과가 들쭉날쭉해지는데, 이 구조는 같은 데이터면 같은 프롬프트가 나온다. 품질 관리와 회귀 테스트가 쉽다. 오버 옵티마이제이션을 막는 데도 가장 유리한 구조라고 본다.
2. **리서치 두 단계 분리.** 두 번째 단계는 옮겨 적기만 하도록 강제해서 지어낸 정보가 섞일 위험을 줄였다.
3. **모르는 값 처리.** `unknown`은 빼고, 영업시간을 모르면 "모른다고 말하고 메시지를 받아라"로 바꾼다.
4. **통화별 날짜 주입.** 모델이 요일을 계산하지 않게 7일치를 풀어서 넣어준다. 가이드에서 이런 내용은 못 봤는데, 가이드보다 한 발 앞선 부분일 수 있다. 🔍
5. **버전 기반 마이그레이션.** 문구를 바꾸면 손대지 않은 고객 레코드에 자동으로 반영된다.
6. **먼저 말하기의 보완 장치.** 인사 지시를 보내고, 말을 안 하면 인사 문구 자체를 보낸다.

---

## 2. 샘플로 확인한 문제 (실제 출력 근거)

샘플: 영어 치과(Seattle), 한국어 이민법 법률사무소(서울, 영업시간 없음). 재현 방법은 부록 A.

| # | 문제 | 실제 출력 | 위치 | 영향 |
|---|---|---|---|---|
| B1 | **도시 추출 오류.** 주소 끝이 국가명이면 주·우편번호가, 쉼표 없는 한국 주소면 주소 전체가 "도시"로 들어간다 | `a dental clinic in WA 98101.` / `in 서울특별시 강남구 테헤란로 123.` | `lib/prompt.ts:35` `city()` | 첫 문장(역할 정의)이 어색해진다. 음성 모델이 그대로 읽을 가능성은 낮아 보이지만 확실하지 않다 |
| B2 | **관사 오류** | `a immigration law firm` | `lib/prompt.ts:49-51` | 경미함 |
| B3 | **업종 분류 오탐.** `"bar"`가 `"barber"`에, `"spa"`가 `"space"`에 부분 문자열로 걸린다 | `Barber shop → table`, `Coworking space → appointment(spa 버킷)` | `lib/use-cases.ts:60-128` | 이발소 Schedule 탭에 OpenTable 같은 식당 예약 시스템이 뜬다. **이 분류기를 업종별 정책에 재사용하면 오류도 같이 퍼진다** |
| B4 | **부정적 리뷰 요약이 백엔드로 들어감.** `rating`, `reviewSummary`가 profile JSON에 그대로 포함된다 | `"reviewSummary": "Reviews mention long waits and billing surprises."` | `lib/prompt.ts:106` | 발신자가 "여기 괜찮아요?"라고 물으면 리셉셔니스트가 자기 업체 흠을 말할 수 있다. 가능성은 낮지만 데모에서는 치명적일 수 있다 |
| B5 | **날짜 예시가 실제 날짜와 어긋남.** 예시가 `"tomorrow, Tuesday the 22nd"`로 고정돼 있다 | 실제 내일은 Thursday 24 | `lib/call-clock.ts:189` | 모델이 예시 문구를 따라 할 위험이 약간 있다. 🔍 실제 통화로 확인 필요 |

그 밖에 관찰한 것(버그라기보다 설계상 한계):
- **시간대는 발신자 브라우저 기준이다.** 해외에서 데모를 여는 사람은 다른 날짜를 받는다. 데모를 여는 사람이 대체로 그 업체 자신이라서 실제 영향은 작을 것으로 보인다.
- **손으로 수정한 프롬프트는 고정된다.** 이후 프로필(영업시간 등)을 고쳐도 반영되지 않아 사실이 오래된 채로 남을 수 있다. 관리자 화면에서 이걸 알려주는지는 확인하지 못했다.
- **FAQ는 백엔드에만 있다.** 리서치가 "자주 묻는 질문"을 따로 조사하는데도, 그런 질문이 오면 매번 위임을 거치게 된다.

---

## 3. 공식 가이드 vs 현재 (✅ 부합 / ⚠️ 부분 / ❌ 없음)

가이드 요지(검색 발췌 기준):
- 음성 프롬프트는 **짧게**. 역할·톤·속도, 백채널(맞장구), 끼어들기, 위임 정책을 담는다. 업무 규칙과 워크플로는 **백엔드**로 보낸다.
- 템플릿의 **Backchannel / Interruption / Delegation policy 제목은 유지**하고 그 아래 내용을 채운다. 필요할 때만 쓰는 선택 섹션으로 Role & Objective, Personality & Tone, Language, Unclear Audio, Entity Capture, Escalation 등이 있다.
- 위임 정책에는 백엔드가 **실제로 할 수 있는 일**, **위임할 때**, **위임하지 않을 때**, 그리고 **"결과를 짐작하지 말고 먼저 위임"**을 적는다.
- 알아듣기 어려운 음성은 짐작하지 말고 **필요한 항목만 되묻는다.**
- **범위가 정해진 워크플로**부터 시작하라고 권한다.

| 가이드 항목 | 현재 | 판정 |
|---|---|---|
| 음성 프롬프트는 짧게, 업무 규칙은 백엔드로 | 주소·영업시간·서비스·정책·하이라이트가 음성 쪽에 있음 | ⚠️ 빠른 답변을 위한 의도일 수 있음, A/B 필요 |
| Backchannel / Interruption / Delegation 제목 | "How to speak" 한 섹션에 섞여 있음 | ⚠️ |
| 위임 정책(능력, 위임할 때, 위임하지 않을 때, 먼저 위임) | "조회·예약·메시지면 위임"만 있음 | ❌ 대부분 없음 |
| Unclear audio: 짐작하지 말고 그 항목만 되묻기 | 없음 | ❌ |
| Entity capture | 복창 규칙만 있고, 철자나 숫자를 하나씩 확인하는 규칙은 없음 | ⚠️ |
| Escalation(사람 연결, 불만 고객, 응급) | 없음 | ❌ |
| 좌절하거나 망설이는 발신자 대응 | 없음 | ❌ |
| 언어 전환 / 억양 | 상세함 | ✅ |
| 먼저 말하기 | instructions.append + commentary로 보완 | ✅ |
| 백엔드 반환 형식(말하기 좋게, 짧게) | "2문장, 마크다운 금지" | ✅ |
| 큰 데이터는 백엔드에 두고 관련 사실만 전달 | profile JSON 전체(좌표·평점·리뷰 요약 포함) | ⚠️ 불필요한 필드 있음(B4) |
| 범위가 정해진 워크플로 | 범용 리셉셔니스트 | ⚠️ 데모 특성상 불가피한 면도 있음 |

---

## 4. 업종 적합성 검토

업계 자료(주로 헬스케어 음성 AI 벤더 블로그)에서 반복해서 보이는 관행:
- 의료 쪽은 **진단·증상 해석·치료 조언을 하지 않고**, 응급 신호가 보이면 **911 안내나 사람 연결**을 한다. "사람에게 넘기는 건 실패가 아니라 설계된 기능"이라는 표현도 자주 나온다.
- **AI라는 사실을 밝히는 것**이 권장되거나, 일부 지역에서는 법적 의무인 것 같다. 🔍 관할별 법규는 직접 확인이 필요하다.

현재 코드와 비교:

| 항목 | 현재 | 평가 |
|---|---|---|
| 톤 | 모든 업종에 "Bright and upbeat… glad the phone rang" | 식당·미용실에는 잘 맞는다. 법률·의료·장례처럼 차분해야 하는 업종에서는 어색할 수 있다 |
| 응급 / 전문 조언 | 규칙 없음 | 치과·동물병원·클리닉 데모에서 "이가 너무 아파서 피가 나요" 같은 말에 대한 행동이 정해져 있지 않다 |
| AI 여부 질문 | 규칙 없음 | 데모 페이지에는 데모라고 적혀 있지만, 통화 중 "사람이에요?"라고 물었을 때의 행동은 정해져 있지 않다 |
| 예약 | 백엔드가 "받아서 복창"만 함 | 저장도 안 되는데 확정처럼 들릴 수 있다. **결정사항: 통화 중에 데모라고 짧게 밝힌다** |
| 리서치 스키마 | policies가 reservations, walkIns, parking 위주(식당 쪽에 치우침) | 보험·신규 환자·상담비 같은 업종 고유 정보는 `other`에 섞이거나 빠진다 |
| 업종 분류기 | `businessNouns()`가 4개 버킷으로 존재(UI 문구용) | 재사용할 수 있지만 B3 오탐을 먼저 고쳐야 한다 |

---

## 5. 개발 플랜

원칙: **공통 기본 프롬프트 1개 + 짧은 업종별 추가분 + 고객 데이터.** 고객별로 손으로 튜닝하는 건 목표로 삼지 않는다. 각 단계마다 `PROMPT_VERSION`을 올리고 `tests/prompt.test.ts`를 갱신한다.

### P0 — 확인된 버그 수정 (작고 위험 낮음)
- B1: `city()`가 국가명과 우편번호를 건너뛰게 한다. 쉼표 없는 주소면 도시를 생략한다.
- B2: 관사를 a/an으로 처리하거나, `"${name}, ${category}"`처럼 관사를 없앤다.
- B3: 키워드를 단어 경계로 매칭하고 `barber` 테스트를 추가한다.
- B4: 백엔드 JSON에서 `rating`, `reviewSummary`, `lat`, `lng`를 뺀다. 필요하다면 "먼저 꺼내지 말 것"이라는 규칙과 함께 넣는다.
- B5: 날짜 예시를 실제 내일 날짜로 만들거나 예시를 없앤다.

### P1 — 가이드 구조에 맞춘 음성 프롬프트 재구성
- 제목: Role & Objective / Personality & Tone / Language(유지) / **Backchannel policy** / **Interruption policy** / **Unclear audio** / **Delegation policy** / **Escalation**.
- Delegation policy에 적을 것: 백엔드가 할 수 있는 일(프로필 질의, 예약 요청 접수, 메시지), 위임할 때, 위임하지 않을 때(인사, 되물어야 하는 경우, 음성 프롬프트에 이미 있는 사실), 먼저 위임할 것.
- **데모 고지**(결정사항): 예약이나 메시지를 받을 때 "데모라서 실제 예약은 잡히지 않는다"고 한 문장으로 말하게 한다. 백엔드 프롬프트의 "confirm the details back"도 같은 방향으로 고친다.
- 음성 쪽에 둘 사실은 주소·영업시간·전화 정도로 줄이는 안과 지금처럼 두는 안을 **A/B로 비교**한다. 어느 쪽이 나은지는 지금 판단하기 어렵다.

### P2 — 업종별 추가분 (최소한으로)
- P0에서 고친 `businessNouns()` 버킷별로 **2~4줄 이내**의 추가분: 톤 한 줄, 금지사항·에스컬레이션 한두 줄.
  - 의료 쪽 예: 진단·치료 조언 금지, 응급 신호가 있으면 911이나 응급 서비스 안내.
  - 기타(법률 등) 예: 법률·재무 자문은 하지 않고 상담 연결을 제안.
- 순수 함수와 단위 테스트로 만든다. 버킷을 늘리는 건 실제 통화에서 근거가 쌓였을 때만 한다(섹션 6).

### P3 — 사전 평가 하네스
- 업종별로 **고정된** 시나리오 세트: 영업시간 모름, 휴무일 예약, 이미 찬 시간, 알아듣기 어려운 이름이나 번호, 언어 전환, 응급, 사람 연결 요청, "AI예요?", 부정적 리뷰 유도, 프롬프트 인젝션.
- 백엔드 프롬프트를 Responses API로 텍스트 모드에서 돌리고, `call-review` 방식의 judge로 채점하는 스크립트를 만든다. 네트워크를 쓰므로 vitest 밖에 둔다(테스트는 네트워크를 쓰지 않는다는 규칙 유지).
- 음성 모델 자체는 텍스트로 재현하기 어려워 보인다. 🔍 음성 쪽은 실제 통화와 `gapRollup()`으로 보완한다.

### P4 — (검증 필요) 백엔드 function tools
- `take_message`, `check_slot`을 도구로 만들어, 모델이 callClock 텍스트를 읽고 판단하는 대신 코드가 결정적으로 처리하게 한다.
- 브라우저 WebRTC 흐름에서 `delegation.function_call_output.create`를 누가 실행하는지(클라이언트에서 서버 라우트로 넘기는지)부터 원문으로 확인해야 한다. 🔍

---

## 6. 오버 옵티마이제이션 방지 가드레일

업계 글들(Vapi, SignalWire 등)에서 반복되는 경고는 "규칙을 추가할수록 오히려 나빠진다"는 것이다. 프롬프트가 길어지면 매 턴의 첫 토큰 지연(=통화 중 침묵)과 규칙끼리의 충돌이 늘어난다고 한다. 수치는 출처마다 다르고 검증된 기준은 아닌 것 같다. 🔍

제안:
1. **길이 예산을 테스트로 고정한다.** 예: 음성 프롬프트는 템플릿 부분이 약 N자 이하, 업종별 추가분은 4줄 이하. N은 P1 이후에 측정해서 정한다.
2. **규칙은 근거가 있을 때만 추가한다.** `gapRollup()`에서 같은 gap이 **여러 업체, 여러 통화**에 걸쳐 나온 경우에만 공통 규칙으로 올린다. 통화 한 번의 실패는 기록만 한다.
3. **고객별 수동 튜닝은 피한다.** 한 업체를 위해 템플릿에 조건문을 넣지 않는다. 한 업체만의 사정은 프로필 데이터(`policies.other`, FAQ)로 해결한다.
4. **평가 세트를 먼저 고정한다.** 프롬프트를 바꾸기 전에 P3 세트로 기준점을 잡고, 바꾼 뒤 **전 업종 세트**로 회귀를 확인한다. 특정 업종이 좋아지고 다른 업종이 나빠지는 걸 막기 위해서다.
5. **하나의 규칙은 한 곳에만 둔다.** 지금 "지어내지 말 것"이 음성·백엔드·callClock에 반복돼 있다. 같은 뜻을 여러 번 쓰면 강조가 아니라 소음이 될 수 있다.

---

## 7. 추가로 조사해야 할 것 🔍

- GPT-Live 가이드 원문의 템플릿 문구와 음성 프롬프트 권장 길이
- 백채널이나 끼어들기 동작이 프롬프트 말고 세션 파라미터로도 제어되는지
- Responses 위임에서 function tool을 누가 실행하는지 (P4)
- AI 고지 의무의 관할별 현황 (미국 주별, 한국)
- callClock 예시 문구를 모델이 실제로 따라 하는지 (실제 통화로 확인)

---

## 부록 A — 재현 방법

```bash
npm install --no-package-lock      # lockfile이 package.json과 맞지 않아 npm ci가 실패함 (별도 이슈)
npx vite-node <script.ts>          # buildPrompts / callClock / businessNouns를 import해서 출력
```

샘플에 쓴 프로필: `Bright Smile Dental`(주소 끝이 `, USA`, 평점 3.1, 부정적 리뷰 요약), `Kim & Lee LLP`(한국 주소, 영업시간 없음, ko).

## 부록 B — 출처 (검색 발췌 기준, 원문 미열람)

- OpenAI: [Prompting GPT-Live](https://developers.openai.com/api/docs/guides/live-prompting), [Getting started](https://developers.openai.com/api/docs/guides/live), [Delegation and tools](https://developers.openai.com/api/docs/guides/live-delegation), [Managing sessions](https://developers.openai.com/api/docs/guides/live-conversations), [Migrate to GPT-Live](https://developers.openai.com/api/docs/guides/live-migration)
- 구현 참고: [LiveKit GPT-Live plugin](https://docs.livekit.io/agents/models/realtime/plugins/gpt-live/), [Pipecat OpenAI GPT-Live](https://docs.pipecat.ai/api-reference/server/services/s2s/openai-live)
- 업계 관행: [Healthcare Voice AI Agents Guide (Prosper)](https://www.getprosper.ai/blog/healthcare-voice-ai-agents-guide), [AI Receptionist for Medical Clinics (CallMissed)](https://www.callmissed.com/blog/ai-receptionist-medical-clinics-practical-2026), [AI Receptionist Disclosure Rules](https://aiemply.com/blog/ai-receptionist-disclosure-laws)
- 프롬프트 비대화: [Vapi Voice AI Prompting Guide](https://docs.vapi.ai/prompting-guide), [SignalWire: Why Over-Prompting Kills Your AI Agent](https://signalwire.com/blog/why-over-prompting-kills-ai), [Every Rule I Added Made It Worse](https://dev.to/aws-builders/every-rule-i-added-made-it-worse-how-prompt-bloat-killed-my-voice-3ekd)
