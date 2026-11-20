# 혼자야 자체 서버 (honjaya-server)

Supabase 무료 사용량(egress) 초과로 사이트가 정지되는 문제를 없애기 위해 만든 **셀프 호스팅 백엔드**입니다.
집에 남는 노트북(i5-5300U / 16GB) 한 대에서 프런트엔드 + DB + API를 모두 돌리는 것을 목표로 합니다.

- 런타임: **Node 20+ (ESM) + Fastify 5**
- DB: **PostgreSQL 16** (Supabase와 동일한 Postgres라서 기존 `supabase/schema.sql`을 그대로 사용)
- 기존 프런트엔드는 `@supabase/supabase-js`를 그대로 쓰되, **요청 주소만 이 서버로 바꾸면** 동작하도록 PostgREST 호환 레이어를 제공합니다.

---

## 1. 폴더 구조

```
server/
├─ src/
│  ├─ index.js            기동/종료(graceful shutdown)
│  ├─ app.js              Fastify 앱(CORS, API 키 가드, 에러 매핑)
│  ├─ config.js           .env 로더 + 설정
│  ├─ db.js               pg Pool, 컬럼 캐시, LISTEN 전용 커넥션
│  ├─ tables.js           허용 테이블 화이트리스트
│  ├─ guest.js            손님 입장(테이블 확인 + 열린 주문서 준비)
│  ├─ payments.js         결제 원장(부분/분할 결제, 환불, 주문서 상태 동기화)
│  ├─ http/
│  │  ├─ sql.js           필터/정렬/select → SQL (식별자 검증)
│  │  ├─ prefer.js        Prefer 헤더 파싱
│  │  └─ errors.js        HttpError + Postgres 에러코드 → HTTP 상태
│  ├─ routes/
│  │  ├─ rest.js          /rest/v1/:table (PostgREST 호환 CRUD)
│  │  ├─ rpc.js           /health, /api/rpc/reserve-sequence
│  │  └─ events.js        /api/events (SSE 실시간)
│  ├─ auth/
│  │  ├─ password.js      scrypt 해시/검증
│  │  ├─ sessions.js      직원 세션 + 쿠키 + 권한 가드
│  │  ├─ permissions.js   OWNER/MANAGER/STAFF 권한표
│  │  ├─ rateLimit.js     로그인 시도 제한
│  │  ├─ audit.js         감사 로그 기록
│  │  ├─ guestSessions.js 손님 테이블 세션 + hj_guest 쿠키
│  │  └─ restIdentity.js  /rest/v1 접근 범위(직원/손님/비회원)
│  └─ routes/api/
│     ├─ staffAuth.js     /api/staff/{login,logout,me,password}
│     ├─ guest.js         /api/guest/{table,session,logout}
│     ├─ payments.js      /api/payments, /api/payments/sheet/:id, /api/payments/:id/refund
│     └─ admin.js         /api/admin/employees, /api/admin/audit-logs, /api/admin/tables
├─ sql/
│  ├─ tables.sql          테이블 마스터(bar_tables) + 1~30번 시드
│  ├─ events.sql          변경 알림 트리거(pg_notify)
│  ├─ staff.sql           직원/세션/감사로그 테이블
│  ├─ guest.sql           손님 세션(guest_sessions) + orders.guest_* 컬럼
│  └─ payments.sql        결제 원장(payments/payment_allocations/refunds) + order_sheets.paid_amount
├─ scripts/
│  ├─ apply-schema.mjs    스키마 적용(멱등)
│  ├─ import-supabase-export.mjs  Supabase CSV 백업 가져오기(멱등)
│  ├─ seed-staff.mjs      사장 계정 생성/비밀번호 재발급
│  └─ smoke-test.mjs      임베디드 Postgres로 자동 검증
├─ deploy/
│  ├─ README.md           노트북 배포 전체 절차 (프런트엔드=Vercel)
│  └─ backup-db.sh        pg_dump 백업 + 보관 기간 정리
├─ Dockerfile
└─ docker-compose.yml
```

---

## 2. 빠르게 실행하기 (개발 PC)

```bash
cd server
npm install
copy .env.example .env      # macOS/Linux: cp .env.example .env
npm run db:apply            # 스키마 생성 (최초 1회, 여러 번 실행해도 안전)
npm run staff:seed          # 사장 계정 생성 (최초 1회) — 아이디/비밀번호 1회 출력
npm start                   # http://localhost:3000
```

확인:

```bash
curl http://localhost:3000/health
# {"status":"ok","db":"up",...}
```

프런트엔드(레포 루트)는 `.env.local`에서 주소만 바꾸면 됩니다.

```dotenv
VUE_APP_SUPABASE_URL=http://localhost:3000
VUE_APP_SUPABASE_PUBLISHABLE_KEY=<server/.env 의 ANON_KEY 값>
```

> `createClient`가 `/rest/v1`을 스스로 붙이므로 URL 끝에 `/rest/v1`을 쓰면 안 됩니다.
> `ANON_KEY`를 비워두면 인증을 끄고 아무 키나 통과시킵니다(로컬 개발용).

---

## 3. 환경변수

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` | `3000` | API 포트 |
| `HOST` | `0.0.0.0` | 바인딩 주소 |
| `DATABASE_URL` | `postgres://postgres:postgres@127.0.0.1:5432/honjaya` | Postgres 접속 문자열 |
| `DB_POOL_MAX` | `10` | 커넥션 풀 크기 |
| `ANON_KEY` | (빈 값) | 비우면 인증 꺼짐. 값이 있으면 `apikey`/`Authorization: Bearer` 필수 |
| `SERVICE_KEY` | (빈 값) | 관리자용 키(같이 허용됨) |
| `CORS_ORIGINS` | `*` | 쉼표 구분. 배포 시 실제 도메인만 넣는 것을 권장 (예: `https://honjaya.vercel.app`) |
| `LOG_LEVEL` | `info` | Fastify 로그 레벨 |
| `STAFF_SESSION_HOURS` | `12` | 직원 로그인 유지 시간(시간). "로그인 유지" 체크 시 아래 값 사용 |
| `STAFF_REMEMBER_DAYS` | `30` | "로그인 유지" 체크 시 세션 유지 일수 |
| `STAFF_COOKIE_NAME` | `hj_staff` | 직원 세션 쿠키 이름 |
| `STAFF_COOKIE_DOMAIN` | (빈 값) | 비우면 호스트 전용 쿠키. 서브도메인 공유가 필요할 때만 지정 |
| `COOKIE_SECURE` | `auto` | `auto` = https 요청에서만 `Secure` 부여. `always`/`never` 로 고정 가능 |
| `GUEST_SESSION_HOURS` | `12` | 손님 테이블 세션 유지 시간(시간) |
| `GUEST_COOKIE_NAME` | `hj_guest` | 손님 세션 쿠키 이름 |
| `STAFF_OWNER_PASSWORD` | (빈 값) | `staff:seed` 실행 시 사용할 초기 비밀번호. 비우면 무작위 생성 |

---

## 4. 노트북을 서버로 쓰기 (권장 구성)

**전체 절차는 [deploy/README.md](deploy/README.md) 에 순서대로 정리되어 있습니다.** 서버 쪽 요약은 아래와 같습니다.

```bash
cd server
cp .env.example .env    # POSTGRES_PASSWORD, ANON_KEY 를 원하는 값으로 수정
docker compose up -d --build
docker compose run --rm migrate     # 최초 1회 스키마 적용
docker compose run --rm import      # 최초 1회 데이터 이관 (csv/ 폴더)
```

| 컨테이너 | 역할 | 포트 |
| --- | --- | --- |
| `db` | PostgreSQL 16 (데이터는 `server/pgdata`) | 내부 전용 |
| `api` | PostgREST 호환 API | `127.0.0.1:3000` (호스트 로컬 전용) |

- `restart: unless-stopped` 이므로 노트북을 재부팅해도 자동으로 올라옵니다.
- 프런트엔드는 **Vercel** 이 서빙하고, 노트북 API 를 HTTPS 로 직접 호출합니다.
  외부 노출은 **Tailscale Funnel** 을 권장합니다(무료 고정 HTTPS 주소, 공유기 포트 개방 불필요).
- Vercel 환경변수: `VUE_APP_SUPABASE_URL=https://api.<도메인>`, `VUE_APP_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY>`.
  서버 `.env` 의 `CORS_ORIGINS` 에 Vercel 도메인(`https://honjaya.vercel.app`)을 넣어야 호출이 허용됩니다.

> 정전/절전 대비: BIOS에서 "AC 전원 연결 시 자동 켜짐"을 켜고, OS에서 절전을 끄세요(`systemctl mask sleep.target suspend.target`).

---

## 5. 기존 Supabase → 자체 서버 이전

### 방법 A — CSV 백업 가져오기 (지금 바로 가능)

Supabase Table Editor → 테이블 선택 → **Export → CSV** 로 받은 `*_rows.csv` 파일을 그대로 넣습니다.
파일 이름 접두사로 테이블을 알아서 찾으므로 이름을 바꾸지 마세요.

```bash
npm install
npm run db:apply                                   # 스키마 + patch 전부 적용
cp ~/Downloads/*_rows*.csv ~/supabase-export/       # 한 폴더에 모읍니다
npm run db:import -- --dir ~/supabase-export        # 실제 반영
npm run db:import -- --dir ~/supabase-export --dry-run   # 미리 확인만
```

- 여러 파일(`orders_rows.csv`, `orders_rows (1).csv`)이 있으면 자동으로 합쳐서 넣습니다.
- `id` 기준 upsert 라 **재실행해도 중복이 생기지 않습니다.**
- 넣는 순서: `categories` → `products` → `app_settings` → `counters` → `order_sheets` → `orders` → `active_order_sheets`.
- 마지막에 `counters.last_sequence_no` 를 `max(order_sheets.sequence_no)` 이상으로 맞춰 주문서 번호가 이어집니다.
- `active_order_sheets` 중 **마감됐거나 없는 주문서를 가리키는 행은 자동 제외**합니다. 통째로 건너뛰려면 `--skip-active`.

#### 어떤 테이블을 받아야 하나

| 테이블 | 필수 | 비고 |
| --- | --- | --- |
| `categories` | ✅ | 카테고리 13개 |
| `products` | ✅ | **레시피는 `recipe_info`(JSON) 안에 있습니다.** `recipe_text` 는 대부분 비어 있습니다 |
| `order_sheets` | ✅ | 주문서 이력 + 매출/정산 |
| `orders` | ✅ | 주문 상세 이력 |
| `counters` | ✅ | 주문서 번호 이어가기 |
| `active_order_sheets` | ⭕ | 지금 열려 있는 테이블 표시용 (검증 후 반영) |
| `app_settings` | ⭕ | 지금은 쓰는 값이 없어 비어 있어도 됩니다 |

> `chat_messages`, `hearts`, `market_history`, `push_subscriptions` 는 삭제된 기능이라 필요 없습니다.
> `bar_tables`(테이블 마스터)는 `npm run db:apply` 가 1~30번을 자동으로 만들기 때문에 백업에서 받지 않습니다.

### 방법 B — `pg_dump` (Supabase가 다시 열리면 이게 가장 깔끔)

```bash
pg_dump "postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
  --data-only --no-owner --no-privileges \
  -t public.categories -t public.products -t public.app_settings \
  -t public.order_sheets -t public.orders -t public.counters \
  -f supabase_data.sql

npm run db:apply
psql "$DATABASE_URL" -f supabase_data.sql
```

### 마지막 단계 (공통)

프런트엔드 `.env`의 `VUE_APP_SUPABASE_URL` / `VUE_APP_SUPABASE_PUBLISHABLE_KEY` 를 자체 서버 값으로 바꾸고 **재빌드**합니다.
(`VUE_APP_*` 는 빌드 시점에 값이 박히므로 URL만 바꿔서는 반영되지 않습니다.)

---

## 6. API 요약

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/health` | 서버/DB 상태 |
| `GET` | `/rest/v1/:table` | 목록 조회 (`select`, `order`, `limit`, `offset`, `Range`, 모든 필터) |
| `POST` | `/rest/v1/:table` | 생성/업서트(`on_conflict`) |
| `PATCH` | `/rest/v1/:table` | 수정 |
| `DELETE` | `/rest/v1/:table` | 삭제 |
| `POST` | `/api/rpc/reserve-sequence` | 주문서 번호 원자적 발급 |
| `GET` | `/api/events?tables=a,b` | SSE 실시간 변경 알림 |
| `GET` | `/api/guest/table?tableNumber=N` | 입장 화면용 테이블 정보(세션 생성 없음) |
| `POST` | `/api/guest/session` | 테이블 입장 (`tableNumber`, `nickname`) → `hj_guest` 쿠키 + 열린 주문서 |
| `GET` | `/api/guest/session` | 새로고침/재접속 시 내 세션 + 주문서 복구 |
| `PATCH` | `/api/guest/session` | 내 닉네임 변경 (`nickname`) |
| `POST` | `/api/guest/logout` | 손님 세션 폐기 + 쿠키 삭제 |
| `POST` | `/api/staff/login` | 직원 로그인 (`loginId`, `password`, `remember`) → HttpOnly 쿠키 발급 |
| `POST` | `/api/staff/logout` | 로그아웃(세션 폐기 + 쿠키 삭제) |
| `GET` | `/api/staff/me` | 내 정보 + 권한 목록 |
| `POST` | `/api/staff/password` | 본인 비밀번호 변경(다른 세션은 모두 로그아웃) |
| `GET` | `/api/admin/employees` | 직원 목록 (`employee.manage`) |
| `POST` | `/api/admin/employees` | 직원 추가 (`employee.manage`) |
| `PATCH` | `/api/admin/employees/:id` | 이름/권한/활성 상태 수정 (`employee.manage`) |
| `POST` | `/api/admin/employees/:id/password` | 비밀번호 재발급 (`employee.manage`) |
| `GET` | `/api/admin/audit-logs` | 감사 로그 조회 (`audit.view`) |
| `GET` | `/api/admin/tables` | 테이블 마스터 목록 (`table.view`) |
| `PATCH` | `/api/admin/tables/:tableNumber` | 구역/좌석/표시이름/정렬/사용여부/메모 수정 (`settings.manage`) |
| `GET` | `/api/payments` | 결제 원장 조회(`from`, `to`, `limit`) + 수단별/환불 집계 (`payment.view`) |
| `GET` | `/api/payments/sheet/:orderSheetId` | 주문서별 결제/환불 내역과 남은 금액 (`payment.view`) |
| `POST` | `/api/payments` | 결제 기록(`orderSheetId`, `originalAmount`, `discounts`, `entries[]`, `memo`, `close`) (`payment.manage`) |
| `POST` | `/api/payments/:paymentId/refund` | 환불(`amount`, `reason`) — 결제 건별 부분 환불 가능 (`payment.refund`) |

> `/api/staff/*` · `/api/admin/*` · `/api/guest/*` · `/api/payments/*` 도 전역 `apikey` 검사를 통과해야 합니다(프런트엔드 `src/lib/api.js` 가 자동으로 붙입니다).
> 세션 토큰은 DB 에 **sha256 해시로만** 저장되며, 평문은 쿠키에만 존재합니다.
> `bar_tables`(테이블 마스터)는 `/rest/v1` 로 **읽기만** 가능합니다(쓰기 요청은 403). 수정은 위 `PATCH /api/admin/tables/:tableNumber` 로만 합니다.
> **손님 범위(P2)**: `/rest/v1` 의 `orders` · `order_sheets` · `active_order_sheets` 는 `hj_guest`(손님) 또는 `hj_staff`(직원)
> 쿠키가 있어야 접근할 수 있습니다(없으면 403). 손님은 자기 테이블 주문서로 범위가 강제되고,
> `orders` 는 생성만 가능하며 `status` 는 항상 `REQUESTED` 로 고정됩니다.
> **결제 원장(P3)**: `payments` · `payment_allocations` · `refunds` 는 `/rest/v1` 화이트리스트에 없어 조회/수정이 404 입니다.
> 모든 결제/환불은 위 `/api/payments` 로만 기록하며, 금액·할인·상태(`payment_status`, `paid_amount`)는 서버가 계산해 덮어씁니다.

지원 필터: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `is`, `like`, `ilike`, `cs`(contains), `cd`, `ov`.
지원 헤더: `Prefer: return=representation|minimal`, `count=exact|planned|estimated`, `resolution=merge-duplicates|ignore-duplicates`, `Accept: application/vnd.pgrst.object+json`, `Range: 0-9`.

### 실시간(Realtime) 관련 주의

`supabase-js`의 `.channel().subscribe()`는 Supabase 전용 WebSocket(`/realtime/v1/websocket`)을 사용합니다.
이 서버는 그 프로토콜을 구현하지 않으므로, **실시간 구독은 `/api/events`(SSE)로 교체**해야 합니다.
폴링으로도 동작하므로(현재 방어 코드 유지) 교체 전까지는 기능이 멈추지는 않습니다.

---

## 7. 검증

```bash
cd server
npm run smoke      # 임베디드 Postgres를 띄워 36개 항목 자동 검증
```

검증 항목: CRUD, 배열 컬럼, 필터(eq/in/like/is/cs), `Range` 페이지네이션, `Accept: object+json` 단건/406,
`count=exact`의 `content-range`, 업서트 멱등성, 삭제 204/representation, 없는 테이블 404·없는 컬럼 400·중복 PK 409,
`reserve-sequence` 동시 20회(1~20 중복 없음), SSE 이벤트 수신/테이블 필터, API 키 401/200.
