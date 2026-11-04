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
- [supabase/patch-008-hearts.sql](supabase/patch-008-hearts.sql) — 익명 하트 테이블(`hearts`) + 상호 하트 공개 컬럼(`is_revealed`) + Realtime 등록 패치
- [supabase/patch-009-drop-bar-notes.sql](supabase/patch-009-drop-bar-notes.sql) — 제거된 '오늘의 한 줄' 테이블(`bar_notes`) 정리 패치
- [supabase/patch-010-character-style.sql](supabase/patch-010-character-style.sql) — 손님 캐릭터 꾸미기 색상 컬럼(`order_sheets.character_style`) 패치

> `patch-001` → `patch-002` 순서로 Supabase SQL Editor에서 실행하세요. 두 패치는 여러 번 실행해도 안전합니다.
> `patch-003`은 스키마가 아니라 데이터만 바꾸는 선택 패치라서, 메뉴를 전면 교체할 때만 실행하면 됩니다.
> `patch-004`도 데이터 전용이며, 이미 실행된 데이터베이스에서는 다시 실행해도 안전합니다.
> `patch-005`는 결제 요청 기능을 걷어낸 뒤 한 번 실행하면 되고, 여러 번 실행해도 안전합니다.
> `patch-006` → `patch-007`은 Web Push를 켤 때 순서대로 실행하세요. `patch-007`은 아래 배포 절차를 마친 뒤에 실행합니다.
> `patch-008`은 익명 하트를 켤 때 한 번 실행하면 되고, 여러 번 실행해도 안전합니다.
> `patch-009`는 '오늘의 한 줄' 기능을 제거한 뒤 한 번 실행하면 되고, 여러 번 실행해도 안전합니다.
> `patch-010`은 캐릭터 꾸미기를 켤 때 한 번 실행하면 되고, 여러 번 실행해도 안전합니다.

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

### Anonymous hearts

- 고객 메인(`/user/main`)의 `💗 익명 하트` 카드 → 현재 주문서가 열려 있는 다른 테이블 중 하나를 골라 하트를 보냅니다.
- 보낸 테이블은 받는 테이블에 공개되지 않습니다. TV 화면에는 `💗 {닉네임}({번호}번)님에게 익명 하트가 도착했어요` 배너와 함께 해당 좌석 위로 하트가 떠오릅니다.
- **서로 하트**(A→B, B→A)가 성립하면 두 row를 `is_revealed = true`로 바꿔 기록만 남기고, **TV 화면에는 절대 노출하지 않습니다.** 대신 두 테이블의 1:1 채팅방(`dm_A_B`)에 `💗 서로 하트 성사!` 시스템 메시지를 남겨 두 테이블 폰에만 알림(토스트·진동·제목 배지)이 가고 바로 대화를 열 수 있습니다.
- 한 테이블은 **30초에 한 번**, 하루 **20개**까지 보낼 수 있습니다. 제한은 [src/lib/hearts.js](src/lib/hearts.js)에서 판정합니다.
- 하트는 영업일 기준(KST 15:00)으로 초기화되고, 받은 개수는 TV 좌석 명패에 `💗 n` 배지로 표시됩니다.
- 처음 적용하는 프로젝트에서는 Supabase SQL Editor에서 [supabase/patch-008-hearts.sql](supabase/patch-008-hearts.sql)을 실행하세요. 여러 번 실행해도 안전합니다.
- 익명성은 화면 표시 기준입니다. 앱은 anon key로 동작하므로 DB 레벨에서 보낸 테이블을 숨기지는 않습니다.

### Character styling

- 고객 메인(`/user/main`)의 `내 캐릭터` 카드 → 피부 · 헤어 · 의상 색을 고르고 저장하면 TV 좌석 캐릭터에 그대로 반영됩니다.
- 값은 `order_sheets.character_style`(`{ skin, hair, shirt }` 색상 id)에 저장하고, 실제 색상표는 [src/lib/characterStyle.js](src/lib/characterStyle.js) 한 곳에서 관리합니다.
- 아직 꾸미지 않은 테이블은 기존처럼 **테이블 번호 기준 기본 색**을 씁니다. 그래서 패치 전 주문서도 화면이 그대로 유지됩니다.
- 픽셀 스프라이트는 [src/lib/pixelGuest.js](src/lib/pixelGuest.js)에 있어 TV 화면과 편집 화면이 같은 그림을 공유합니다.
- `order_sheets` 변경도 실시간으로 감지해 TV가 1.5초 안에 다시 그립니다.
- 처음 적용하는 프로젝트에서는 Supabase SQL Editor에서 [supabase/patch-010-character-style.sql](supabase/patch-010-character-style.sql)을 실행하세요. 여러 번 실행해도 안전합니다.

### Business day

- 매장 영업일은 **KST 15:00:00 ~ 익일 14:59:59**(영업은 새벽 4시까지) 기준입니다.
- 하루/주/월 집계와 정산 내역 필터는 모두 이 구간을 사용하므로, 새벽 0시가 아니라 오후 3시에 날짜가 바뀝니다.
- 계산은 [src/lib/businessDay.js](src/lib/businessDay.js) 한 곳에서만 하고, 기기 시간대와 무관하게 KST로 고정됩니다.

### Bar TV screen

- 매장 TV에서 `/tv` 를 전체화면으로 띄웁니다. 로그인 없이 읽기 전용으로 동작합니다.
- 좌석은 실제 매장 배치 사진을 따라 3줄로 나뉩니다:
  - **홀 안쪽 줄** — 테이블 23~13번(사진 기준 왼쪽부터 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13)
  - **홀 바깥 줄** — 1·2번 테이블 다음 통로를 두고 24, 26, 27, 28, 29, 30, 31, 32번
  - **바 존** — 카운터 바로 위에 12, 11, 10, 9, 8, 7, 6, 5, 4, 3번
- 매장에 없는 **25번 테이블은 좌석으로 그리지 않습니다.** 총 31석이며, 손님이 있으면 캐릭터가, 없으면 빈 의자(스툴/테이블)만 표시되고 이름표는 `빈자리`가 됩니다.
- 좌석 가구(바 스툴 · 홀 테이블)는 픽셀 스프라이트를 캐릭터 앞에 겹쳐 그려 앉아 있는 모습을 만듭니다. 카운터 앞에는 직원 픽셀 캐릭터가 상시 서 있습니다.
- 착석 좌석은 `active_order_sheets` 기준이고, 이름표는 `order_sheets.table_nickname`(없으면 `손님`)을 사용합니다. 캐릭터 옷·머리·피부 색은 `order_sheets.character_style` 값을 따르고, 비어 있으면 테이블 번호 기준 기본 색입니다. 배치에 없는 번호의 주문은 좌석 없이 `외 N팀`으로만 집계합니다.
- 멀리서도 읽히도록 화면 전체가 큰 글씨 기준으로 맞춰져 있습니다(말풍선 26px, 최근 채팅 24px, 배너 30px). 맨 위 브랜드 영역만 기존 크기를 유지합니다. 말풍선은 `word-break: keep-all`로 단어 중간이 끊기지 않게 하고, 줄의 양 끝 좌석은 말풍선을 안쪽으로 붙여 화면 밖으로 잘리지 않게 정렬합니다.
- 여러 좌석이 동시에 말풍선을 띄우면 **가장 최근에 채팅한 좌석의 말풍선이 맨 앞**에 오도록 좌석·줄 `z-index`를 갱신합니다.
- 벽면은 네온 `BAR` + 병 진열장을 낮게 붙여 좌석 공간을 넓히고, 카운터와 직원 캐릭터는 작게 그려 좌석 가독성을 우선합니다. 색감은 매장 조명에 맞춘 다크 로즈/앰버 톤입니다.
- 전체 채팅(`GLOBAL`)만 표시합니다: 새 메시지가 오면 해당 테이블 캐릭터 위에 6초 말풍선이 뜨고, 우측 패널에 최근 8개가 쌓입니다. `SYSTEM` 메시지는 하단 배너로 표시합니다.
- 직원 메시지(`ADMIN`)는 우측 최근 채팅에 남는 것과 동시에, 화면 가운데에 큰 카드로 페이드인 → 8초 유지 → 페이드아웃으로 표시되고 알림음이 재생됩니다. 여러 건이 한꺼번에 들어오면 순서대로 하나씩 재생됩니다.
- 우측 사이드 패널은 `최근 채팅` 단일 목록입니다.
- 알림음은 `src/lib/notificationSound.js`의 Web Audio 차임을 쓰며, 브라우저 정책상 페이지를 한 번 터치/클릭해야 소리가 켜집니다. 잠겨 있는 동안 상단에 `🔇 화면을 한 번 터치하면 알림음이 켜져요` 안내가 뜨고, 소리가 켜지면 사라집니다. TV를 켤 때 Chrome을 `--autoplay-policy=no-user-gesture-required` 로 실행하면 터치 없이도 재생됩니다.
- **1:1(`DIRECT`)·직원(`STAFF`) 방은 조회 자체를 하지 않아 TV에 노출되지 않습니다.**
- 1920×1080 기준 화면을 뷰포트에 맞춰 축소(`transform: scale`)하므로 어떤 해상도의 TV에서도 잘리지 않습니다.
- 운영 편의: 5시 자동 새로고침, 20~60초 폴링 백업, 오프라인 시 `OFFLINE` 표시, 3초 뒤 마우스 커서 숨김.
- 하단 푸터에 `바 N · 홀 M` 형태로 존별 착석 수를 표시하고, 표시 한도를 넘으면 `외 N팀`으로 요약합니다.
- 캐릭터는 24×24 픽셀 스프라이트를 톤(머리/머리음영/피부/피부음영/옷/옷음영/눈/볼터치/입)별로 묶어 `<path>` 하나로 그리고(가로 픽셀 run 병합으로 DOM 최소화), 색상은 CSS 변수(`--hair`/`--hair-light`/`--skin`/`--skin-shadow`/`--shirt`/`--shirt-dark`)로 테이블 번호별 팔레트를 적용합니다.

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
