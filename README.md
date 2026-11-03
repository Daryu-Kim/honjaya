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
- [supabase/patch-006-web-push.sql](supabase/patch-006-web-push.sql) — Web Push 구독 테이블(`push_subscriptions`) + 런타임 설정(`app_settings`)
- [supabase/patch-007-web-push-trigger.sql](supabase/patch-007-web-push-trigger.sql) — 새 채팅 메시지를 `send-chat-push` Edge Function으로 넘기는 `pg_net` 트리거

> `patch-001` → `patch-002` 순서로 Supabase SQL Editor에서 실행하세요. 두 패치는 여러 번 실행해도 안전합니다.
> `patch-003`은 스키마가 아니라 데이터만 바꾸는 선택 패치라서, 메뉴를 전면 교체할 때만 실행하면 됩니다.
> `patch-004`도 데이터 전용이며, 이미 실행된 데이터베이스에서는 다시 실행해도 안전합니다.
> `patch-005`는 결제 요청 기능을 걷어낸 뒤 한 번 실행하면 되고, 여러 번 실행해도 안전합니다.
> `patch-006` → `patch-007`은 Web Push를 켤 때 순서대로 실행하세요. `patch-007`은 아래 배포 절차를 마친 뒤에 실행합니다.

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
- 영업일 기준으로 채팅이 초기화됩니다. KST 오후 3시에 영업일이 바뀌면 지난 영업일의 전체/직원/1:1 메시지를 모두 삭제하고, 조회 화면도 영업일 시작 시각 이후 메시지만 불러옵니다.
- 손님이 결제를 마치거나 테이블을 정리하면 그 테이블의 1:1 채팅(`dm_*`)이 전부 삭제됩니다.

### Business day

- 매장 영업일은 **KST 15:00:00 ~ 익일 14:59:59**(영업은 새벽 4시까지) 기준입니다.
- 하루/주/월 집계와 정산 내역 필터는 모두 이 구간을 사용하므로, 새벽 0시가 아니라 오후 3시에 날짜가 바뀝니다.
- 계산은 [src/lib/businessDay.js](src/lib/businessDay.js) 한 곳에서만 하고, 기기 시간대와 무관하게 KST로 고정됩니다.

### Bar TV screen

- 매장 TV에서 `/tv` 를 전체화면으로 띄웁니다. 로그인 없이 읽기 전용으로 동작합니다.
- 좌석은 실제 매장 배치를 따라 2개 존으로 나뉩니다: **바 존(테이블 1~12번)** 은 카운터 바로 위에 한 줄로, **홀 존(13~32번)** 은 그 위쪽에 한 줄로 배치됩니다.
- 32개 좌석을 항상 그립니다. 손님이 있으면 캐릭터가, 없으면 빈 의자(스툴/테이블)만 표시되고 이름표는 `빈자리`가 됩니다.
- 좌석 가구(바 스툴 · 홀 테이블)는 픽셀 스프라이트를 캐릭터 앞에 겹쳐 그려 앉아 있는 모습을 만듭니다. 카운터 앞에는 직원 픽셀 캐릭터가 상시 서 있습니다.
- 착석 좌석은 `active_order_sheets` 기준이고, 이름표는 `order_sheets.table_nickname`(없으면 `손님`)을 사용합니다.
- 전체 채팅(`GLOBAL`)만 표시합니다: 새 메시지가 오면 해당 테이블 캐릭터 위에 6초 말풍선이 뜨고, 우측 패널에 최근 6개가 쌓입니다. `SYSTEM` 메시지는 하단 배너로 표시합니다.
- 직원 메시지(`ADMIN`)는 우측 최근 채팅에 남는 것과 동시에, 화면 가운데에 큰 카드로 페이드인 → 8초 유지 → 페이드아웃으로 표시됩니다. 여러 건이 한꺼번에 들어오면 순서대로 하나씩 재생됩니다.
- **1:1(`DIRECT`)·직원(`STAFF`) 방은 조회 자체를 하지 않아 TV에 노출되지 않습니다.**
- 1920×1080 기준 화면을 뷰포트에 맞춰 축소(`transform: scale`)하므로 어떤 해상도의 TV에서도 잘리지 않습니다.
- 운영 편의: 5시 자동 새로고침, 20~60초 폴링 백업, 오프라인 시 `OFFLINE` 표시, 3초 뒤 마우스 커서 숨김.
- 하단 푸터에 `바 N · 홀 M` 형태로 존별 착석 수를 표시하고, 표시 한도를 넘으면 `외 N팀`으로 요약합니다.
- 캐릭터는 SVG 스프라이트를 부위(머리/피부/옷/눈/입)별로 나눠 `<use>`로 그리고, 색상은 CSS 변수(`--hair`/`--skin`/`--shirt`)로 테이블 번호별 팔레트를 적용합니다.

### Web push notifications

손님 폰이 앱을 닫아도(백그라운드/잠금 화면) 전체 채팅·1:1 채팅·직원 답장을 받을 수 있게 하는 Web Push 구성입니다.
고객 메인 화면의 `채팅 알림` 카드에서 알림을 켜고 끌 수 있고, iOS는 16.4 이상 + 홈 화면에 추가한 상태에서만 지원합니다.

1. Supabase SQL Editor에서 `patch-006` 실행 (구독 테이블 + 설정 테이블)
2. VAPID 키 생성 후 Edge Function 시크릿 등록

```
npx web-push generate-vapid-keys
npx supabase secrets set VAPID_PUBLIC_KEY=<publicKey> VAPID_PRIVATE_KEY=<privateKey> VAPID_SUBJECT=mailto:admin@honjaya.co.kr
```

3. Edge Function 배포 (프로젝트 연결 후)

```
npx supabase functions deploy send-chat-push --project-ref <PROJECT_REF>
```

4. `app_settings`의 `web_push` 행에 공개키·함수 URL·anon 키 저장
   - `vapidPublicKey`: 위에서 만든 **공개키**
   - `pushEndpoint`: `https://<PROJECT_REF>.supabase.co/functions/v1/send-chat-push`
   - `anonKey`: 프로젝트 anon(publishable) 키
   - `patch-007` 파일 상단의 `<VAPID_PUBLIC_KEY>`·`<PROJECT_REF>`·`<ANON_KEY>` 자리표시자를 바꿔 실행하면 이 값들이 한 번에 저장됩니다.
5. `patch-007` 실행 (새 메시지 → Edge Function 트리거)

> 서비스 워커는 프로덕션 빌드에서만 등록되므로, 알림 수신 테스트는 `pnpm build` 후 배포본(HTTPS)에서 진행하세요.

#### 브라우저 지원

- Android Chrome/Samsung Internet/Firefox, 데스크톱 Chrome/Edge/Firefox: **PWA 설치 없이** 일반 탭에서도 알림을 켜고 받을 수 있습니다 (HTTPS + 알림 권한 허용 필요).
- iOS Safari: 16.4 이상에서 **홈 화면에 추가(PWA)** 한 상태에서만 지원합니다. 일반 탭에서는 알림을 켤 수 없습니다.
- 설치형 PWA는 아이콘 실행 시 `start_url`로 열려 `?table=` 쿼리가 사라지므로, 테이블 입장은 항상 테이블 오더 카드의 링크(`/?table=3`)나 일반 브라우저 탭을 기준으로 안내하세요.
- 알림 클릭 시 이동 주소는 수신자 테이블 기준 `/user/chat?table=<번호>`이며, 세션 정보가 없으면 `입장 화면(/enter?table=<번호>)`으로 이어집니다.

### Data migration

```
pnpm migrate:export
pnpm migrate:import
```

### Customize configuration

See [Configuration Reference](https://cli.vuejs.org/config/).
