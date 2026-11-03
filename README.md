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
- [supabase/patch-003-disable-all-products.sql](supabase/patch-003-disable-all-products.sql) — 메뉴판을 새로 넣기 전 전체 상품 비노출 처리 (데이터 전용, 필요할 때만)
- [supabase/patch-004-remove-cocktail-category.sql](supabase/patch-004-remove-cocktail-category.sql) — 메뉴판 개편으로 쓰지 않게 된 '칵테일' 카테고리 행 삭제 (임포터는 비활성화까지만 처리)
- [supabase/patch-005-remove-payment-request.sql](supabase/patch-005-remove-payment-request.sql) — 고객 결제 요청 기능 제거: `checkout_requests` 테이블 삭제 + 레거시 `PAYMENT_REQUESTED`/`REQUESTED` 상태 정리

> `patch-001` → `patch-002` 순서로 Supabase SQL Editor에서 실행하세요. 두 패치는 여러 번 실행해도 안전합니다.
> `patch-003`은 스키마가 아니라 데이터만 바꾸는 선택 패치라서, 메뉴를 전면 교체할 때만 실행하면 됩니다.
> `patch-004`도 데이터 전용이며, 이미 실행된 데이터베이스에서는 다시 실행해도 안전합니다.
> `patch-005`는 결제 요청 기능을 걷어낸 뒤 한 번 실행하면 되고, 여러 번 실행해도 안전합니다.

### Menu import

PDF 메뉴판을 `products` / `categories`에 반영하는 도구입니다. 이름이 같은 상품은 가격·카테고리·설명·옵션을 갱신하고 되살리며, 메뉴판에 없는 상품은 소프트 삭제합니다. 카테고리 순서·코드도 메뉴판 기준으로 맞추고, 메뉴판에 없는 카테고리는 비활성화합니다(고객 화면 칩에서 자동 제외). 고객·태블릿 메뉴 목록은 활성 카테고리만 칩으로 보여주고 첫 카테고리가 기본 선택입니다('전체' 칩 없음).

```
pnpm menu:import -- --file menu-data/menu.json           # 미리보기
pnpm menu:import -- --file menu-data/menu.json --apply    # 반영
```

자세한 형식과 규칙은 [scripts/menu/README.md](scripts/menu/README.md)를 참고하세요.

### Table chat & gift

- 고객 화면 `/user/chat` — 전체(오픈) 채팅 + 테이블/직원 1:1 채팅
  - 원터치 호출(직원 호출 · 물 · 앞접시 · 수저 · 물티슈)과 이벤트 신청(노래 · 생일 · 건배 · 기념일 · 댄스 타임)은 테이블의 직원 방으로 전달됩니다.
  - 상대 메시지는 신고할 수 있고, 신고한 테이블은 차단 목록에 담겨 해당 메시지가 숨겨집니다(해제 가능).
  - 파트너 카드에 상대 테이블의 상태 뱃지(주문 중 · 결제 완료 · 착석)가 표시됩니다.
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
