# honjaya

Supabase(Postgres + Realtime) 백엔드를 사용하는 Vue 3 주문 앱입니다.

## Environment

`.env.local` (git 에 커밋하지 않음):

```
VUE_APP_SUPABASE_URL=https://<project-ref>.supabase.co
VUE_APP_SUPABASE_PUBLISHABLE_KEY=<anon or publishable key>
```

마이그레이션 스크립트용 `.env.migration` (`FIREBASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

## Project setup

```
pnpm install
```

### Compiles and hot-reloads for development

```
pnpm serve
```

### Compiles and minifies for production

```
pnpm build
```

### Lints and fixes files

```
pnpm lint
```

### Database schema

- [supabase/schema.sql](supabase/schema.sql) — 새 프로젝트용 전체 스키마 (테이블/RLS/Realtime)
- [supabase/patch-001-soft-delete-realtime.sql](supabase/patch-001-soft-delete-realtime.sql) — 이미 만들어진 프로젝트용 소프트 삭제 + Realtime 패치
- [supabase/patch-002-chat-gift.sql](supabase/patch-002-chat-gift.sql) — 채팅방(`room_type`/`room_key`/`recipient_table_number`) + 선물 주문(`is_gift`/`gift_to_table_number`/`gift_to_nickname`) 패치

> `patch-001` → `patch-002` 순서로 Supabase SQL Editor에서 실행하세요. 두 패치는 여러 번 실행해도 안전합니다.

### Table chat & gift

- 고객 화면 `/user/chat` — 전체(오픈) 채팅 + 테이블/직원 1:1 채팅
  - 원터치 호출(직원 호출 · 물 · 앞접시 · 수저 · 물티슈)과 이벤트 신청(노래 · 생일 · 건배 · 기념일 · 댄스 타임)은 테이블의 직원 방으로 전달됩니다.
  - 상대 메시지는 신고할 수 있고, 신고한 테이블은 차단 목록에 담겨 해당 메시지가 숨겨집니다(해제 가능).
  - 파트너 카드에 상대 테이블의 상태 뱃지(주문 중 · 결제 요청 · 결제 완료 · 착석)가 표시됩니다.
- 고객 화면 `/user/gift` — 다른 테이블에 메뉴 선물 보내기 (보낸 테이블 주문서에 금액 합산, 받는 테이블에는 채팅 알림) + 오늘의 선물 랭킹 Top 3
- 관리자 `/admin/chat` — 채팅방(전체/직원/1:1) 목록에서 방을 선택해 확인·답장, `호출·이벤트` 필터와 메시지 숨김/복구
- 태블릿 운영판 — 헤더의 `💬 테이블 채팅` 버튼으로 테이블별 호출/메시지 확인·답장(호출이 오면 배지 + 알림음)
- `chat_messages`는 `room_key`로 방을 구분합니다: `global`, `staff_3`, `dm_3_7`

### Data migration

```
pnpm migrate:export
pnpm migrate:import
```

### Customize configuration

See [Configuration Reference](https://cli.vuejs.org/config/).
