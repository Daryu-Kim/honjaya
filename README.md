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
- [supabase/patch-002-chat-gift.sql](supabase/patch-002-chat-gift.sql) — (제거됨) 채팅방 · 선물 주문 컬럼 패치. `patch-013`에서 모두 삭제됩니다
- [supabase/patch-003-disable-all-products.sql](supabase/patch-003-disable-all-products.sql) — 메뉴판을 새로 넣기 전 전체 상품 비노출 처리 (데이터 전용, 필요할 때만)
- [supabase/patch-004-remove-cocktail-category.sql](supabase/patch-004-remove-cocktail-category.sql) — 메뉴판 개편으로 쓰지 않게 된 '칵테일' 카테고리 행 삭제 (임포터는 비활성화까지만 처리)
- [supabase/patch-005-remove-payment-request.sql](supabase/patch-005-remove-payment-request.sql) — 고객 결제 요청 기능 제거: `checkout_requests` 테이블 삭제 + 레거시 `PAYMENT_REQUESTED`/`REQUESTED` 상태 정리
- [supabase/patch-006-web-push.sql](supabase/patch-006-web-push.sql) — (제거됨) Web Push 구독 테이블(`push_subscriptions`) + 런타임 설정(`app_settings`)
- [supabase/patch-007-web-push-trigger.sql](supabase/patch-007-web-push-trigger.sql) — (제거됨) 새 채팅 메시지를 `send-chat-push` Edge Function으로 넘기는 `pg_net` 트리거
- [supabase/patch-008-hearts.sql](supabase/patch-008-hearts.sql) — (제거됨) 익명 하트 테이블(`hearts`)
- [supabase/patch-009-drop-bar-notes.sql](supabase/patch-009-drop-bar-notes.sql) — 제거된 '오늘의 한 줄' 테이블(`bar_notes`) 정리 패치
- [supabase/patch-010-character-style.sql](supabase/patch-010-character-style.sql) — (제거됨) 손님 캐릭터 컬럼 패치. `patch-014`에서 컬럼을 삭제합니다
- [supabase/patch-011-market.sql](supabase/patch-011-market.sql) — (제거됨) 실시간 시세 설정 시드 + `app_settings` 쓰기 권한
- [supabase/patch-012-market-history.sql](supabase/patch-012-market-history.sql) — (제거됨) 영업일 시세 히스토리 테이블(`market_history`)
- [supabase/patch-013-drop-unused-features.sql](supabase/patch-013-drop-unused-features.sql) — 채팅 · 하트 · 시세 · 웹푸시 제거: `chat_messages` / `hearts` / `market_history` / `push_subscriptions` 테이블과 `orders` 선물 컬럼 삭제
- [supabase/patch-014-drop-character-style.sql](supabase/patch-014-drop-character-style.sql) — 손님 캐릭터 기능 제거: `order_sheets.character_style` 컬럼 삭제

> 이미 쓰고 있는 프로젝트는 필요한 패치만 골라서 Supabase SQL Editor에서 실행하면 됩니다. `patch-002` / `patch-006` / `patch-007` / `patch-008` / `patch-010` / `patch-011` / `patch-012` 는 지금은 쓰지 않는 기능의 패치이고, `patch-013` · `patch-014`를 실행하면 그 흔적이 모두 정리됩니다.
> `patch-003`은 스키마가 아니라 데이터만 바꾸는 선택 패치라서, 메뉴를 전면 교체할 때만 실행하면 됩니다.
> `patch-004`도 데이터 전용이며, 이미 실행된 데이터베이스에서는 다시 실행해도 안전합니다.
> `patch-005`는 결제 요청 기능을 걷어낸 뒤 한 번 실행하면 되고, 여러 번 실행해도 안전합니다.
> `patch-009`는 '오늘의 한 줄' 기능을 제거한 뒤 한 번 실행하면 되고, 여러 번 실행해도 안전합니다.
> `patch-010`은 이미 캐릭터 컬럼을 만든 프로젝트라면 실행할 필요가 없습니다. `patch-014`로 컬럼이 삭제됩니다.
> `patch-013`은 채팅 · 선물 · 하트 · 실시간 시세 · 웹푸시를 걷어낸 뒤 **한 번** 실행하세요. 테이블과 컬럼을 실제로 지우므로 되돌릴 수 없습니다. 여러 번 실행해도 안전합니다.
> `patch-014`는 손님 캐릭터 기능을 걷어낸 뒤 **한 번** 실행하세요. `order_sheets.character_style` 컬럼을 지우므로 되돌릴 수 없습니다. 여러 번 실행해도 안전합니다.

### Menu import

PDF 메뉴판을 `products` / `categories`에 반영하는 도구입니다. 이름이 같은 상품은 가격·카테고리·설명·옵션을 갱신하고 되살리며, 메뉴판에 없는 상품은 소프트 삭제합니다. 카테고리 순서·코드도 메뉴판 기준으로 맞추고, 메뉴판에 없는 카테고리는 비활성화합니다(고객 화면 칩에서 자동 제외). 고객·태블릿 메뉴 목록은 활성 카테고리만 칩으로 보여주고 첫 카테고리가 기본 선택입니다('전체' 칩 없음).

```
pnpm menu:import -- --file menu-data/menu.json           # 미리보기
pnpm menu:import -- --file menu-data/menu.json --apply    # 반영
```

자세한 형식과 규칙은 [scripts/menu/README.md](scripts/menu/README.md)를 참고하세요.

### Customer main

- 태그로 입장하면 `/user/main` 으로 들어옵니다. 상단에 표시명·닉네임·주문서 번호가 나오고 그 아래에 메뉴 카드가 있습니다.
- 메뉴 카드(`주문하기` · `주문 내역`)는 **2열 그리드**로 배치해 스크롤을 줄입니다. 카드 안에서는 아이콘이 위, 제목과 설명이 아래로 쌓이고, 카드 높이는 같은 줄에서 맞춰집니다.

### Business day

- 매장 영업일은 **KST 15:00:00 ~ 익일 14:59:59**(영업은 새벽 4시까지) 기준입니다.
- 하루/주/월 집계와 정산 내역 필터는 모두 이 구간을 사용하므로, 새벽 0시가 아니라 오후 3시에 날짜가 바뀝니다.
- 계산은 [src/lib/businessDay.js](src/lib/businessDay.js) 한 곳에서만 하고, 기기 시간대와 무관하게 KST로 고정됩니다.

### Data migration

```
pnpm migrate:export
pnpm migrate:import
```

### 트러블슈팅: 손님 접속이 안 될 때 (Supabase 402 · Unhealthy)

Supabase 대시보드에서 프로젝트가 `Unhealthy`로 보이고, 앱에는 아래와 같은 문구가 뜬다면 **코드 문제가 아니라 Supabase 프로젝트가 사용량 한도로 정지된 상태**입니다.

```
Service for this project is restricted due to the following violations:
exceed_egress_quota. The project owner must upgrade their plan or remove
spend caps to restore service.
```

확인 방법 (REST·Auth·Realtime·Storage 모두 똑같이 402가 떨어집니다):

```
curl -s -o - -w "\nHTTP %{http_code}\n" \
  "https://<PROJECT_REF>.supabase.co/rest/v1/categories?select=id&limit=1" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
```

복구 방법 (프로젝트 소유자만 가능):

1. Supabase 대시보드 → **Organization → Billing** 에서 Pro 플랜으로 업그레이드하거나, 무료 플랜의 **spend cap(지출 한도)** 을 조정합니다.
2. 무료 플랜을 유지하려면 **사용량이 리셋되는 결제 주기 시작일까지 기다립니다.** (한도 초과 중에는 REST/Auth/Realtime/Storage가 모두 402로 막힙니다.)
3. 대시보드 **Usage / Reports** 에서 `Egress` 항목으로 어느 API가 트래픽을 많이 쓰는지 확인합니다.

같은 일이 반복되지 않도록 앱 쪽 egress를 다음과 같이 줄여 두었습니다.

- `subscribeTable` 은 realtime 이벤트를 1차 수단으로 쓰고, 폴링은 **120초** 예비 수단으로만 돌립니다. 화면이 가려진(백그라운드) 동안에는 폴링을 쉬고, 다시 보이면 즉시 한 번 새로고침합니다.
- 태블릿은 주문서를 **최근 400건**, 주문은 **이번 영업일 주문만(최대 1000건)** 받습니다. 예전에는 주문/주문서 전체 이력을 매 주문마다 받아 데이터 사용량이 계속 늘었습니다.
- 채팅 · 시세 · 웹푸시 기능을 제거해 상시 폴링이 사라졌습니다. (예전에는 시세 60초 · 채팅 알림 60초 폴링이 늘 돌았습니다)

### Self-hosted backend (선택)

Supabase 무료 플랜의 egress 한도에 반복적으로 걸릴 때 쓰는 자체 호스팅 백엔드입니다.
PostgREST와 같은 URL/응답 형식을 흉내 내므로 `@supabase/supabase-js` 클라이언트 코드를 거의 고치지 않고 그대로 붙일 수 있습니다.
자세한 설치·운영 방법은 [server/README.md](server/README.md)를 참고하세요.

### Customize configuration

See [Configuration Reference](https://cli.vuejs.org/config/).
