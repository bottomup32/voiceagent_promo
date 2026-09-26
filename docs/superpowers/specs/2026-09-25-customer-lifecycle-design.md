# Demo → Onboarding → Production 고객 퍼널 + 프롬프트 eval 하네스

## Context

지금 앱은 **데모 전용**이다. 고객 식별자는 랜덤 `nanoid(12)` 하나뿐이고(= 공개 링크), CRM `stage`(new/contacted/interested/won/lost)는 이력 없이 덮어써지며, 라이프사이클 개념·고객 로그인·고객 편집이 없다. 데모 한도, "Editing is off" 토스트, admin 단일 역할이 코드에 고정돼 있다.

목표: 데모 고객을 처음부터 **고객 코드**로 관리하고, 마음에 든 고객은 **Onboarding**(고객이 매직링크로 로그인해 Knowledge·설정 직접 수정)으로, 준비가 끝나면 **Production**(전화번호 연결 — Twilio는 이번 범위 밖, 수동 체크리스트 항목으로 자리만)으로 넘어가는 퍼널을 만든다. 프롬프트·경험은 계속 최적화하므로 **프롬프트 eval 게이트**로 회귀를 막고, Production 승격 전 고객별 사전 점검(preflight)을 강제한다.

### 확정된 결정 (사용자)
- 고객 코드: `joes-pizza-k7q` — 업체명 slug + 3자리 Crockford base32, **생성 후 불변**, 공개 링크는 nanoid 유지(코드는 자격증명 아님)
- 하나의 퍼널: `phase` 신설, 기존 `stage`는 demo 안의 영업 하위 상태
- 고객 로그인: 이메일 매직링크, **Resend**
- 하네스: 프롬프트 eval 게이트 + Production 전 고객별 preflight(무료 정적 검사 + 운영자 버튼으로 유료 eval)

### 범위 밖
Twilio/전화 연결, 온보딩 세부 설정 화면(자리만), 결제.

---

## 공통 기반 (M1에 포함)

- **`lib/kv.ts` Store에 두 메서드 추가** (현재 TTL·원자 연산 없음 — 확인함):
  - `setIfAbsent(key, value, ttlSec?) → boolean` — redis `SET NX EX`, fs `writeFile(flag:"wx")`(TTL 무시 → 호출자가 `expiresAt` 저장)
  - `take<T>(key) → T|null` — redis `GETDEL`, fs `rename→read→unlink`
  - `tests/kv.test.ts` fake redis에 `SET NX EX`/`GETDEL` 추가, 두 드라이버 모두 테스트
- **동시 저장 충돌**: admin PATCH·portal PATCH에 `expectedUpdatedAt` → 불일치 시 409

---

## M1 — 고객 코드 · phase 모델 · 상태머신 · 이력 · admin UI

**`lib/customer-code.ts`** (pure, 클라이언트 import 가능)
- `slugify(name)`: NFD→결합문자 제거→소문자→ASCII 외 제거→비영숫자 `-`→stopword(`llc inc the co ltd corp company pllc pc llp`) 제거→24자 단어 경계 컷
- `baseSlug(customer)`: 업체명 → 웹사이트 도메인 라벨 → 업종 명사(`lib/use-cases.ts` 어간 재사용) → `biz`. 한글 이름은 자연히 fallback
- `makeCode(base, rand)`, `isCodeShape()` `/^[a-z0-9-]{3,32}$/`

**`lib/store.ts`** (eng review D2: 코드 발급은 두 곳에서만)
- `assignCode(customer)`: `setIfAbsent("code:{code}", id)`, 충돌 5회 재시도 후 4자리 접미사. **호출처는 생성 라우트(`app/api/admin/customers/route.ts:101`)와 백필 라우트 두 곳뿐**. `saveCustomer`는 부수효과 없이 그대로
- `findByCode(input)` 대소문자 무시
- `deleteCustomer`가 `code:`, `lifecycle:`, `preflight:`, `preflight-lock:` 도 삭제
- **백필**: 읽기 중 쓰기 금지(공개 GET에서 normalize 실행됨) → 멱등 `POST /api/admin/maintenance/codes`(코드 없는 고객 발급 + 엇갈린 `code:` 수리, `{assigned, repaired}` 반환). health/overview에 버튼. 실행 전 코드는 "—" 표시
- `normalize()`: `phase = stage==="lost" ? "churned" : "demo"` (won 자동 승격 안 함)

**`lib/types.ts`**
```ts
CUSTOMER_PHASES = ["demo","onboarding","production","churned"]
Customer += { code?, phase?, phaseChangedAt?, onboardingMinutes?,
  checklist?: { phoneConnected?: boolean }, portalEpoch?, settings?: CustomerSettings /* {} seam */ }
LifecycleEvent = { id, at, kind: "stage"|"phase", from, to, actor: "operator"|"customer"|"system", reason? }
```

**stage ↔ phase 불변식** (phase가 진실의 원천)
- `stage==="lost"` ⇔ `demo→churned`
- `phase ∈ {onboarding, production}` ⇒ `stage==="won"`
- onboarding 이후 churn은 `won` 유지 + 이벤트에 사유 (영업 실패 ≠ 이탈)

**`lib/lifecycle.ts`** (pure)
- `TRANSITIONS`: demo→onboarding|churned · onboarding→production|demo|churned · production→onboarding|churned · churned→demo
- `canTransition(customer, to, ctx) → {ok} | {ok:false, reasons[]}`
  - demo→onboarding: `stage==="won"` && `status==="ready"` && `contactEmail`
  - onboarding→production: `checklist()` 전부 통과
- `applyTransition()` / `applyStage()` (stage 변경은 demo에서만; `lost`는 churn 전환으로 위임)
- `checklist(customer, ctx)`: `contactEmail` · `knowledge`(정적검사 block 없음) · `preflight`(M5) · `phoneConnected`(manual, Twilio 자리)

**`lib/lifecycle-store.ts`**: `lifecycle:{id}` 리스트 — `lib/crm.ts` notes 패턴 그대로 (`record/list/listAll`)

**라우트 / 분석 / UI**
- `app/api/admin/customers/[id]/route.ts` stage PATCH(~:147)를 `applyStage` 경유 + 이벤트 기록 (CrmDrawer 부분 PATCH가 stage를 다른 필드와 함께 보내도 stage는 반드시 `applyStage` 통과; phase는 이 PATCH로 변경 불가, `/phase`만)
- 신규 `POST /api/admin/customers/[id]/phase {to, reason?}` → 막히면 409 + reasons
- `lib/analytics.ts`: `TimelineEntry.kind`에 `stage|phase`, `timeline()`/`activityFeed()`에 선택 인자 `lifecycle`, `phaseCounts()`
- `/admin/crm` PipelineBoard: demo 영업 컬럼(new…won) + Onboarding · Production · Churned 컬럼, Won 카드에 "Onboarding으로" 버튼(막히면 토스트로 사유)
- `CrmDrawer`: 코드·phase·체크리스트, `CustomerTable`: 코드 컬럼 + 코드 검색

**테스트**: `customer-code.test.ts`, `lifecycle.test.ts`(모든 허용/금지 쌍, 불변식), `store-migration.test.ts`(phase 백필), `crm-feed.test.ts`(lifecycle 항목), `kv.test.ts`

---

## M2 — 포털 인증(매직링크/Resend) + 고객 Knowledge 편집

**`lib/auth.ts`**: `signToken(scope, maxAge)`/`verifyToken()` 일반화. `verifySessionToken`은 admin 전용 유지(고객 토큰 거부 테스트). `customer:<id>:<epoch>` 스코프, 7일, 쿠키 `portal_session` — `httpOnly`, `secure`(prod), `sameSite:"lax"`, `path:"/"` (lax로 타 사이트 POST에 쿠키 미전송 → CSRF 차단)

**`lib/portal-session.ts`** (eng review D5: 인증 로직은 라우트 밖, Store 주입):
- `issueMagicLink(store, customer, now, rand)` → `{link, token}`
- `consumeMagicLink(store, token, getCustomer, now)` → `{customer} | {error: "expired"|"used"|"epoch"|"email"|"phase"|"inactive"}`
- `authorizePortal(token, getCustomer)` — 토큰 검증 → `getCustomer` → `epoch===portalEpoch` → `phase∈{onboarding,production}` && `active`
- `lib/portal-auth.ts`(server)의 `requirePortalCustomer()`는 쿠키 읽고 `authorizePortal` 호출만. **모든 `/api/portal/*`는 id를 세션에서만 얻음**(URL/body 무시). 라우트는 얇게
- `tests/helpers/memory-store.ts`(메모리 Store, `setIfAbsent`/`take` 포함) + `tests/portal-session.test.ts`: 만료 · 재사용 · epoch 불일치 · 이메일 변경 · onboarding 아님 · inactive · 다른 고객 id · 정상

**매직 토큰**: 32바이트 base64url, `setIfAbsent("magic:{sha256}", {customerId,email,epoch,expiresAt}, 900)`, 소비는 `take()`. **`GET /portal/verify`는 "로그인" 버튼만 렌더 → POST로 소비** (Outlook/Gmail 링크 스캐너가 GET 선소비하는 문제)

**`lib/email.ts`**: `Mailer` 인터페이스, `resendMailer(key, from)`(fetch `api.resend.com/emails`), 키 없으면 null. `magicLinkEmail()` 템플릿 pure. `.env.example`에 `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`

**라우트**
- `POST /api/portal/login {email}` — 항상 200(계정 열거 방지), IP+email rate limit, onboarding/production 고객의 `contactEmail` 매칭
- `POST /api/admin/customers/[id]/portal-link` — 링크 발급, 메일러 있으면 발송, **항상 `{link, emailed}` 반환** → SharePanel에 복사 버튼 (Resend 도메인 인증 전엔 이게 실제 경로)
- `POST /api/admin/customers/[id]/portal-signout` — `portalEpoch++` (churn 시에도)
- `GET /api/portal/me`, `PATCH /api/portal/knowledge {profile, expectedUpdatedAt}`, `POST /api/portal/logout`

**`lib/knowledge-edit.ts`** (pure, eng review D4): `applyProfileEdit(current, submitted, {actor, expectedUpdatedAt, now}) → {customer, promptsStale} | {conflict: true}` — 프로필 병합 + `resolvePrompts` + `expectedUpdatedAt` 409 + edited 프롬프트 보호를 한 곳에. **admin PATCH와 portal PATCH 둘 다 이 함수 경유** (기존 admin 경로 리팩터 포함, 동작 불변을 기존 테스트로 확인). 테스트 `tests/knowledge-edit.test.ts`: 충돌, 미편집 재생성, 편집 보존+stale, actor별 화이트리스트

**`components/admin/KnowledgeEditor.tsx` → `components/knowledge/KnowledgeEditor.tsx`** 이동 (포털이 admin 폴더 import 안 하도록)

**`lib/portal-view.ts`** (pure): `portalView()` 화이트리스트(id, code, phase, businessName, agentName, language, profile, prompts.greeting, 고객용 checklist, allowance). `sanitizePortalProfile()`은 rating/reviewSummary/lat/lng 보존·길이 제한. 저장 시 `resolvePrompts()`(lib/prompt.ts) → 미편집 프롬프트 재생성. `prompts.edited`면 `promptsStale: true` 표시("팀이 반영")

**Proxy**: Next 16은 `middleware.ts` → `proxy.ts` (node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md). **별도 커밋으로 rename**, `runtime` 키 제거 확인. matcher에 `/portal/:path*`, `/api/portal/:path*`; login/verify 통과, 나머지 낙관적 검증

**페이지**: `app/portal/login`, `app/portal/verify`, `app/portal/(app)/layout.tsx`+`page.tsx`(phase 배너, 체크리스트, `components/admin/KnowledgeEditor.tsx` 재사용 + 저장, 설정 placeholder 카드)

**테스트**: `auth.test.ts`(스코프 격리·변조·만료·epoch), `portal-view.test.ts`(public-view처럼 키 고정; contact/notes/label/dossier/researchNotes/stage/demoMinutes/prompts.live·backend 금지), `email.test.ts`, 토큰 재사용(두 번째 take → null)

---

## M3 — phase별 통화 한도 · 공개 페이지 동작

**`lib/phase-limits.ts`** (pure) `callAllowance(customer, calls, source, now)`:
- (demo | onboarding)+public: 기존 `demoAllowance`, `source` 없거나 `"demo"`인 통화만 계산 (eng review D3: onboarding 동안 공개 데모 유지)
- onboarding+portal: `onboardingMinutes ?? ONBOARDING_MINUTES`(env, 기본 60), onboarding 포털 통화만
- production+portal: 같은 테스트 한도, 30일 롤링
- 그 외: `blocked`

**`/api/session`**: body에 `source: "demo"|"portal"`. portal은 `verifyCustomerToken` id === `body.customerId` 아니면 403. `isTest`는 admin 전용 유지. 통화에 `phase`, `source`, 프롬프트 스탬프(M4) 기록. `LIVE_SESSION_LIMIT`(OpenAI 조직 한도)은 그대로

**기타**
- `lib/call-limits.ts` `wrapUpInstruction(kind)` — demo 문구 유지, onboarding은 "this test call"
- `hooks/useLiveCall.ts`가 `limitKind` 받음
- 포털 테스트 통화는 `isTest:false, source:"portal"` → gap 집계에 포함
- `app/c/[id]/page.tsx` + `api/customers/[id]/public` (eng review D3): demo 그대로 / **onboarding은 데모 유지 + "로그인해서 직접 수정" 배너**(고객이 고친 지식이 곧바로 데모에 반영되는 미리보기) / production은 "로그인" 안내 카드(통화·프롬프트 없음, 실제 에이전트 공개 호출 차단) / churned `notFound()`. `public-view.test.ts` 갱신
- **DRY**: `demoAllowance`를 직접 부르는 세 곳(`app/c/[id]/page.tsx:55`, `api/customers/[id]/public/route.ts:26`, `/api/session:145`)을 전부 `callAllowance`로 교체 — 한도 규칙은 한 곳에만

**테스트**: `phase-limits.test.ts`, `call-limits.test.ts`(kind별 문구)

---

## M4 — 하네스: 프롬프트 eval 게이트

**a. 통화 스탬프**: `CallLog += { phase?, source?, promptVersion?, configHash?, promptEdited? }`. `lib/prompt-hash.ts`(server, node:crypto): `configHash` = sha256(live+backend+greeting+profile+voice+language) 앞 16hex. analytics.ts는 브라우저 안전 유지

**b-0. 읽기 비용 (eng review D7)**: `lib/calls.ts:98` `listCalls`는 통화마다 순차 `getJson` → `Promise.all`로 병렬화(기존 상세·CRM도 빨라짐). 추가로 리뷰 저장 시(`app/api/calls/[callId]/route.ts:74`, `app/api/admin/customers/[id]/calls/route.ts:76`) `reviews:{cid}` 리스트에 `{callId, at, promptVersion, configHash, source, isTest, gaps}` push. **append-only, 같은 callId는 마지막 항목이 이김** → 재리뷰·isTest 재분류(PATCH calls) 때도 한 줄 push만 하면 됨(`latestByCall()` pure, 테스트). 기존 리뷰는 멱등 백필 라우트 `POST /api/admin/maintenance/reviews`. `deleteCustomer`가 `reviews:` 도 삭제. 품질 페이지는 고객당 리스트 1회 읽기

**b. 전체 고객 gap 롤업**: `gapRollupAcross(entries, kindOf)` in `lib/analytics.ts` (입력은 `reviews:` 항목) — isTest 제외, `{text, count, customers, callIds, byVersion, byKind, meetsRuleBar}` (규칙 추가 기준: 2개 이상 업체 & 3콜 이상, docs/prompt-harness-analysis.md §6). `businessKind(category)` 추출(safetyLines/integrationGroupsFor 로직 공유). 신규 `GET /api/admin/quality` + `app/admin/(dashboard)/quality/page.tsx`(버전 필터, 버전별 gap 비율), 사이드바 추가

**c. npm scripts**: `test`, `typecheck`, `eval`(`vitest run -c vitest.eval.config.ts`), `check`(lint+typecheck+test). CLAUDE.md 갱신

**d. 커밋되는 baseline + 게이트**
- `evals/baseline/v{N}.json` = `{promptVersion, at, models, templateHash, passed, total, cells:{"scenario|fixture": bool}, regressionNote?}` (응답 본문 제외)
- `summarizeRows()` → `lib/prompt-eval.ts`; `EVAL_WRITE_BASELINE=1`이면 `evals/prompts.eval.ts`가 기록
- `templateHash` = 모든 FIXTURES × `["en","ko"]`에 대한 `buildPrompts` 해시
- **`tests/eval-baseline.test.ts`**(오프라인): ① `v{PROMPT_VERSION}.json` 존재 ② 모든 scenario×fixture 커버 ③ `templateHash` 일치 — **버전 bump 없이 문구만 바꾼 경우 잡음** ④ `passed ≥` 이전 버전 또는 `regressionNote`
- 부트스트랩: M4 머지 전 v6 baseline 1회 유료 실행 필요(`EVAL_WRITE_BASELINE=1 npm run eval`, OPENAI_API_KEY, 약 80 호출)
- **엄격한 게이트 (eng review D6)**: baseline 미달이면 unit test 실패(경고 아님). `PROMPT_VERSION`/템플릿 변경 시마다 전체 eval 재실행 후 새 `v{N}.json` 커밋. 퇴보를 의도했다면 `regressionNote`에 사유 기록

**테스트**: `analytics.test.ts`(across 롤업), `prompt-eval.test.ts`(summarizeRows), `eval-baseline.test.ts`

---

## M5 — Preflight · Production 승격 게이트

- **`lib/prompt-budget.ts`**: `tests/prompt-budget.test.ts`의 상수·필수 섹션을 lib로 이동 + `LIVE_TOTAL_MAX`, `promptProblems()`. 테스트는 import
- **`lib/preflight.ts`** (pure): `staticChecks(customer)` — block: 섹션 누락/예산 초과/"undefined"·"null"/주소·영업시간·전화 없음; warn: 서비스·FAQ 없음, `prompts.edited`. `scenariosFor(profile)` — `Scenario`에 `applies?` 메타 추가(문구 불변 → "통과 위해 시나리오 수정 금지" 원칙 유지), 사실 특화 시나리오(faq, price-unknown) 제외 → 약 8~10개
- **`lib/eval-runner.ts`**: `evals/prompts.eval.ts`의 `run()`/`judge()`를 `runScenario(scenario, prompts, hours, deps)`로 추출 — eval 스위트와 라우트가 공유, 테스트는 fake `createResponse`
- **`POST /api/admin/customers/[id]/preflight`**: `maxDuration=300`, 동시성 4, `setIfAbsent("preflight-lock:{id}", 1, 330)`로 이중 유료 실행 방지, `preflight:{id}` = `{at, configHash, promptVersion, static, eval:{passed,total,failures}, pass, models}` 저장 + lifecycle 이벤트. `GET`은 최신 결과
- **실행 상태**: 시작 시 `preflight:{id}`에 `{status:"running", startedAt}` 먼저 기록 → 300s 타임아웃·크래시로 결과가 없으면 UI가 `startedAt`+330s 경과를 "실패(시간 초과), 다시 실행"으로 표시 (조용한 실패 방지)
- **게이트**: `checklist.preflight.ok = run.pass && run.configHash === configHash(customer)` → Knowledge/프롬프트 수정 시 자동 무효화. `/phase`가 서버에서 재계산
- admin 고객 페이지에 Preflight 카드(버튼, 비용·시간 안내, 실패 목록)
- **테스트**: `preflight.test.ts`, `eval-runner.test.ts`(fake model), lifecycle 가드(stale vs current hash)

---

## 리스크 / 주의

1. `lost ↔ churned`는 양방향 불가 — demo→churned만 lost, 이후 churn은 won+사유
2. 편집된 프롬프트는 Knowledge 수정을 반영 안 함 → `configHash`에 profile 포함, `promptsStale` 표시
3. Resend 발신 도메인 인증 전엔 admin 링크 복사가 실제 경로
4. `listCustomers()` fan-out(이메일 로그인, quality 페이지)은 수십 고객까진 OK, 수백이면 `email:{lower}` 인덱스 추가
5. Preflight 유료 eval은 호출당 비용 — 락 + 운영자 버튼 전용

## 흐름도

```
               stage(영업, demo 안에서만)
          new → contacted → interested → won ──┐        lost
                                               │          │
 ┌────────┐  operator: won+ready+email  ┌──────▼─────┐   │
 │  demo  │ ──────────────────────────► │ onboarding │   │
 └───┬────┘ ◄───────── undo ─────────── └──────┬─────┘   │
     │ lost                                    │ checklist 전부 OK:
     ▼                                         │ email · knowledge(정적검사) ·
 ┌─────────┐ ◄──────── churn ───────────────── │ preflight(현재 configHash) ·
 │ churned │ ── reopen → demo                  │ phoneConnected(수동, Twilio 자리)
 └─────────┘ ◄──────── churn ──┐        ┌──────▼─────┐
                               └─────── │ production │
                                        └────────────┘
 매 전환·stage 변경 → lifecycle:{id} 이벤트 → timeline()/activityFeed()

 매직링크:  admin/portal login ─► issueMagicLink ─► magic:{sha256} (TTL 15m)
            email(Resend) 또는 admin 복사
            GET /portal/verify (버튼만) ─POST─► consumeMagicLink(take) ─► portal_session 쿠키
            /api/portal/* ─► requirePortalCustomer ─► authorizePortal(세션 id만 사용)
```

## NOT in scope

- Twilio 전화 연결: 사용자가 별도로 진행. `phoneConnected` 수동 체크 항목으로 자리만 둠
- 온보딩 세부 설정 화면: `settings` 필드와 placeholder 카드만 둠
- 결제·계약: 요청 범위 밖
- CI (GitHub Actions): TODO로 넘김 (아래)
- `email:{lower}` 인덱스: TODO로 넘김, 지금 규모에선 `listCustomers` 전체 조회로 충분
- Codex 외부 리뷰: 사용자가 건너뜀
- gstack 업그레이드(1.40 → 1.91)와 CLAUDE.md 스킬 라우팅: plan mode라 건드리지 않음

## What already exists (재사용)

| 필요한 것 | 기존 코드 | 쓰는 방식 |
|---|---|---|
| 지식 편집 UI | `components/admin/KnowledgeEditor.tsx` (controlled) | `components/knowledge/`로 옮겨 포털과 admin이 같이 씀 |
| 프롬프트 재생성 규칙 | `resolvePrompts` lib/prompt.ts:336 | `applyProfileEdit`가 호출 |
| 이력 리스트 패턴 | `lib/crm.ts` notes | `lifecycle:`, `reviews:` 리스트에 그대로 적용 |
| 데모 한도 | `demoAllowance` lib/analytics.ts | `callAllowance`가 감쌈 |
| 토큰 서명 | `lib/auth.ts` HMAC scope 구조 | scope만 일반화 |
| 레코드 마이그레이션 | `normalize()` lib/store.ts:17 | phase 백필 |
| eval 헬퍼 | `lib/prompt-eval.ts`, `evals/*` | `eval-runner`로 추출해 preflight와 공유 |
| gap 집계 | `gapRollup` lib/analytics.ts:389 | 고객 전체 버전 추가 |
| 공개 뷰 키 고정 테스트 | `tests/public-view.test.ts` | `portal-view.test.ts`가 같은 방식 사용 |

## TODOS.md (구현 시 새로 만들어 추가)

1. **`email:{lower}` → id 인덱스.** 매직링크 로그인이 고객 전체를 훑지 않게 함. 수백 명 규모에서 필요. `code:` 인덱스 패턴 그대로 쓰고, contactEmail 변경 시 갱신. M2 이후.
2. **GitHub Actions CI**: push와 PR 때 `npm run check` (lint·typecheck·test, 오프라인 eval-baseline 게이트 포함). 유료 eval은 제외. M4의 npm scripts 이후.

## Failure modes

| 새 경로 | 현실적 실패 | 테스트 | 처리 | 사용자에게 보이나 |
|---|---|---|---|---|
| 코드 발급 | 동시 생성으로 같은 slug 충돌 | ✅ | setIfAbsent 재시도 | 해당 없음 |
| 매직링크 | 메일 스캐너가 GET으로 선소비 | ✅ | GET은 버튼만, POST로 소비 | ✅ |
| 매직링크 | Resend 장애나 도메인 미인증 | ✅ (메일러 null) | admin이 `{link, emailed:false}`로 복사 | ✅ admin |
| 포털 API | 다른 고객 id로 접근 | ✅ | 세션 id만 사용 | ✅ 401/403 |
| 지식 저장 | 두 탭에서 동시 수정 | ✅ | 409 + 새로고침 안내 | ✅ |
| 지식 저장 | 편집된 프롬프트라 수정이 통화에 반영 안 됨 | ✅ | `promptsStale` 표시 | ✅ |
| 통화 한도 | onboarding 통화가 데모 시간을 차감 | ✅ | source로 분리해 계산 | 해당 없음 |
| preflight | 300s 타임아웃 | ✅ | running 상태 + 경과 시간으로 실패 표시 | ✅ |
| preflight | 두 번 클릭해 이중 과금 | ✅ | lock | ✅ |
| 품질 페이지 | 통화 수에 비례해 느려짐 | ✅ | `reviews:` 리스트 + 병렬 읽기 | 해당 없음 |
| eval 게이트 | 버전을 안 올리고 문구만 바꿈 | ✅ | templateHash 비교 | ✅ 테스트 실패 |

조용한 실패로 남은 critical gap은 0개. preflight 타임아웃은 리뷰 중에 running 상태 기록으로 막음.

## 병렬 작업 전략

| 단계 | 건드리는 모듈 | 의존 |
|---|---|---|
| M1 퍼널 기반 | lib/(kv, store, types, lifecycle, customer-code), app/api/admin, components/admin | — |
| M2 포털 | lib/(auth, portal-*, email, knowledge-edit), app/portal, app/api/portal, proxy | M1 |
| M3 phase 한도 | lib/(phase-limits, call-limits), app/api/session, app/c, hooks | M1, M2 (portal 토큰) |
| M4a 하네스 스크립트·baseline | package.json, evals/, lib/prompt-eval | — |
| M4b 스탬프·품질 페이지 | lib/(calls, analytics, prompt-hash), app/api/calls, app/admin/quality | M1 |
| M5 preflight | lib/(preflight, eval-runner, prompt-budget), app/api/admin | M1, M4a |

- Lane A: M1 → M2 → M3 (lib/store·types를 같이 건드리므로 순서대로)
- Lane B: M4a (독립, M1과 동시에 시작 가능)
- Lane C: M4b → M5 (M1과 M4a 머지 후)
- **실행 순서**: A(M1)와 B를 병렬로 → 머지 → A(M2→M3)와 C(M4b→M5)를 병렬로. **충돌 주의**: M3과 M4b가 둘 다 `app/api/session`과 `lib/types.ts`(CallLog)를 건드림 → M4b의 스탬프 부분은 M3 머지 뒤에 rebase

## 수정 핵심 파일

`lib/kv.ts`, `lib/store.ts`, `lib/types.ts`, `lib/auth.ts`, `middleware.ts`→`proxy.ts`, `lib/analytics.ts`, `app/api/session/route.ts`, `app/api/admin/customers/[id]/route.ts`, `app/c/[id]/page.tsx`, `lib/call-limits.ts`, `evals/prompts.eval.ts`, `lib/prompt-eval.ts`, `tests/prompt-budget.test.ts`, `components/admin/KnowledgeEditor.tsx`(재사용), `app/admin/(dashboard)/crm/page.tsx`

## 진행 방식

- 마일스톤마다 독립 머지 가능, 각각 `npm run check` 통과
- 구현은 superpowers:writing-plans → subagent-driven-development, TDD(pure lib 먼저)
- 각 마일스톤 후 `/code-review`, M2(인증) 후 `/security-review`
- 스펙 문서는 승인 후 `docs/superpowers/specs/2026-09-25-customer-lifecycle-design.md`로 커밋

## Verification

- 각 마일스톤: `npm run lint && npx tsc --noEmit && npx vitest run` (1초 내 유지)
- M1: `npm run dev` → admin에서 신규 고객 생성 → 코드 표시, CRM에서 Won→Onboarding 승격, 막힌 사유 토스트, 타임라인에 phase 이벤트, 백필 라우트 실행 후 기존 고객 코드 부여
- M2: 포털 링크 발급(RESEND 키 없이 복사 경로) → verify 페이지 POST 로그인 → Knowledge 수정·저장 → admin에서 프롬프트 재생성 확인, 같은 링크 재사용 거부, 다른 고객 id로 `/api/portal/*` 접근 불가, signout 후 세션 무효
- M3: onboarding 고객 공개 링크 → 로그인 안내 카드, 포털 테스트 통화 → onboarding 한도 차감(데모 한도 불변), wrap-up 문구
- M4: `EVAL_WRITE_BASELINE=1 npm run eval` → `evals/baseline/v6.json` 생성 후 `eval-baseline.test.ts` 통과; 프롬프트 문구만 바꾸면 테스트 실패 확인; `/admin/quality` 표시
- M5: 정적 검사 block 고객은 승격 거부, preflight 실행 후 승격 성공, Knowledge 수정 후 다시 거부
- 브라우저 확인은 gstack `/qa` 로 admin·portal·public 흐름 점검

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | skipped (user) | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 8 issues, 0 critical gaps; D1–D7 모두 결정 |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **결정**: D1 범위 5개 마일스톤 전부 · D2 코드는 생성과 백필 때만 발급 · D3 onboarding 동안 공개 데모 유지 · D4 `applyProfileEdit` 공유 · D5 인증 로직을 서비스 함수로 빼고 메모리 Store로 테스트 · D6 엄격한 eval 게이트 · D7 `reviews:` 리스트와 병렬 읽기
- **UNRESOLVED**: 0
- **VERDICT**: ENG CLEARED, 구현 가능. 포털 UI가 새로 생기므로 `/plan-design-review`를 선택적으로 권장
