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
│  ├─ http/
│  │  ├─ sql.js           필터/정렬/select → SQL (식별자 검증)
│  │  ├─ prefer.js        Prefer 헤더 파싱
│  │  └─ errors.js        HttpError + Postgres 에러코드 → HTTP 상태
│  ├─ routes/
│  │  ├─ rest.js          /rest/v1/:table (PostgREST 호환 CRUD)
│  │  ├─ rpc.js           /health, /api/rpc/reserve-sequence
│  │  └─ events.js        /api/events (SSE 실시간)
├─ sql/events.sql         변경 알림 트리거(pg_notify)
├─ scripts/
│  ├─ apply-schema.mjs    스키마 적용(멱등)
│  └─ smoke-test.mjs      임베디드 Postgres로 36개 자동 검증
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
| `CORS_ORIGINS` | `*` | 쉼표 구분. 배포 시 실제 도메인만 넣는 것을 권장 |
| `LOG_LEVEL` | `info` | Fastify 로그 레벨 |

---

## 4. 노트북을 서버로 쓰기 (권장 구성)

1. **Ubuntu Server 24.04 LTS** 설치 (SSD 교체 권장, 16GB RAM이면 충분)
2. Docker 설치 후:

   ```bash
   cd server
   cp .env.example .env    # POSTGRES_PASSWORD, ANON_KEY 를 원하는 값으로 수정
   docker compose up -d --build
   docker compose run --rm migrate     # 최초 1회 스키마 적용
   curl http://localhost:3000/health
   ```

   - 데이터는 `server/pgdata` 폴더에 남습니다(백업은 이 폴더 또는 `pg_dump`).
   - `migrate` 서비스는 레포의 `supabase/` 폴더를 읽어서 스키마를 적용합니다(최초 1회만 실행).
   - `restart: unless-stopped` 이므로 노트북을 재부팅해도 자동으로 올라옵니다.
3. **외부 접속**은 Cloudflare Tunnel 사용을 권장합니다(공유기 포트 개방 불필요, HTTPS 자동).

   ```bash
   cloudflared tunnel login
   cloudflared tunnel create honjaya
   cloudflared tunnel route dns honjaya api.example.com
   cloudflared tunnel run --url http://localhost:3000 honjaya
   ```

   → 프런트엔드 `.env`의 `VUE_APP_SUPABASE_URL`을 `https://api.example.com`으로 지정.
   Cloudflare Tunnel은 SSE를 그대로 통과시키므로 실시간 알림도 동작합니다.
4. **프런트엔드 정적 파일**은 같은 노트북의 nginx(또는 Caddy)로 `dist/`를 서빙하면 Supabase 없이 완전히 독립적으로 운영됩니다.

> 정전/절전 대비: BIOS에서 "AC 전원 연결 시 자동 켜짐"을 켜고, OS에서 절전을 끄세요(`systemctl mask sleep.target suspend.target`).

---

## 5. 기존 Supabase → 자체 서버 이전

1. Supabase 대시보드에서 **Database → Backups/`pg_dump`** 로 데이터를 내려받습니다.
   - 현재 프로젝트가 egress 초과로 정지(HTTP 402) 상태라 `pg_dump`가 막혀 있습니다.
     한 달 Pro 결제 또는 할당량 리셋 후 한 번만 덤프하면 됩니다.
2. 새 DB에 스키마 적용 후 덤프 복원:

   ```bash
   npm run db:apply
   psql "$DATABASE_URL" -f supabase_dump.sql   # 또는 docker compose exec -T db psql -U postgres honjaya < dump.sql
   ```

3. 프런트엔드 `.env`의 URL/KEY를 자체 서버 값으로 교체하고 재배포합니다.

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
