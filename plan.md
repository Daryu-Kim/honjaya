# HONJAYA — Roadmap & Task Status

Primary context source for the current work. Keep this file short (target 200–300 lines).
Write in English. UI strings stay Korean.

---

## 0. Confirmed decisions

| Area | Decision |
| --- | --- |
| Tables | 30 total. No. 1–10 = bar (`BAR`), No. 11–30 = large table (`LARGE`) |
| Points earn | 1% of paid amount, floored to integer |
| Points expiry | 3 calendar months from earn date, end of day KST |
| Points redeem | min 1,000 points, in 1,000-point increments, only when payment ≥ ₩30,000 |
| Points basis | earn = 1% of cash actually collected (after discount and point use); the ₩30,000 redeem minimum uses the amount after discount, before point deduction |
| Staff | 3 people, 3 roles: `OWNER` / `MANAGER` / `STAFF`; the role supplies defaults and the owner can override permissions per employee (`employees.permissions`) |
| Frontend origin | `https://honjaya.vercel.app` (operational) |
| API origin (target) | `https://api.honjaya-server.xyz` via Cloudflare Tunnel — **LIVE** (`/health` → db up) |
| API origin (backup) | Tailscale Funnel `https://<device>.<tailnet>.ts.net` |
| Auth transport | HttpOnly + SameSite=Lax first-party cookie via `vercel.json` rewrites for `/rest/v1/*`, `/api/staff/*`, `/api/admin/*`, `/api/guest/*` |
| Payment scope | Split / partial payment included in phase 1 |
| Tablet console | Keep and extend (not replaced) |
| Customer identity | **Phone number only** — no Kakao login, no member signup. `customers` is created at the tablet payment screen |
| Marketing channel | 문자(SMS/LMS) + 카카오 알림톡 through a provider. Default `MESSAGING_PROVIDER=dryrun` (records logs, sends nothing) |
| Marketing consent | Collected at the tablet payment screen + admin CRM page; customers can opt out via a tokenized link in every message |
| Coupons | Phone-keyed, single-use, 사장만 발급/취소, redeemed at the tablet payment screen; percent or amount with an optional 최소 결제금액 |
| Guest entry | No `?table=` needed — the root URL shows a 자리 선택 screen |
| Removed from original spec | Supabase hosted, chat, hearts, market, character, push, gift — already gone |

### Out of scope / explicitly dropped

- Supabase as the backend (self-hosted Fastify + Postgres instead).
- Real-time WebSocket (Supabase Realtime) → replaced by SSE `/api/events`.
- **Kakao login** (P4 scaffold) — dropped. Members are identified by phone number; Kakao is only a message channel.

---

## 1. Architecture

```
Guest phone / staff tablet
      │ HTTPS
      ├──────────────▶ Vercel  https://honjaya.vercel.app
      │                  │
      │                  │  vercel.json rewrite:
      │                  │    /rest/v1/*, /api/guest/*, /api/staff/*, /api/admin/*
      │                  │  → same-origin → first-party cookie (hj_guest, hj_staff)
      │                  ▼
      └──────────────▶ Cloudflare Tunnel  https://api.honjaya-server.xyz
                         │   (backup: Tailscale Funnel)
                         ▼
                 Laptop (Ubuntu 24.04)
                   api  Node/Fastify :3000
                   db   Postgres 16
```

- `/rest/v1/*` is now **same-origin** (rewritten) so the `hj_guest` cookie is sent; `src/lib/supabase.js`
  resolves the URL to `window.location.origin` in the browser.
- SSE `/api/events` stays **absolute** (`VUE_APP_SUPABASE_URL` / `VUE_APP_EVENTS_BASE_URL`) — streaming
  through a Vercel rewrite risks buffering and timeouts.
- `VUE_APP_SUPABASE_URL` may stay absolute; the browser ignores it for REST.
- `trustProxy: true` is already enabled, so `X-Forwarded-Proto` drives the `Secure` cookie flag.

---

## 2. Phase roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| **P0** | Staff auth (login/logout/me/password), role permissions, admin employee API, audit log, cookie infra, deploy config, frontend login + route guard | **DONE (verified)** |
| **P1** | Table master (`bar_tables`, 30 tables: 1–10 bar / 11–30 large), admin table settings page, tablet layout driven by the master | **DONE (verified)** |
| **P2** | Guest table session cookie + per-guest attribution + order ownership (guest sees only own table sheet; staff any) | **DONE (verified)** |
| **P3** | Payment ledger (`payments`, `payment_allocations`, `refunds`), split/partial payment, refunds | **DONE (verified)** |
| **P4** | Kakao login readiness (`/api/kakao/status` + console checklist) | **DROPPED** — members are identified by phone number; the scaffold was removed in P7 |
| **P5** | Points ledger (earn / redeem / expire / adjust), FEFO deduction | **DONE (verified: smoke 169/169, lint, build)** |
| **P6** | CRM & consent (customer profile, marketing consent, visit history) | **DONE (verified: smoke 201/201, lint, build, deployed live)** |
| **P7** | Marketing & messaging (segments, campaigns, 문자/알림톡 send, opt-out link, CSV export) | **DONE (verified: smoke 242/242, lint, build, deployed live)** |
| **P8** | Revisit coupons (`coupons` table, issue/void, redemption at the tablet payment screen, admin coupon panel) | **DONE (verified: smoke 269/269, lint, build)** |
| **P9** | 직원 계정·권한 관리 (사장 전용 메뉴, 역할 + 직원별 세부 권한 override) | **DONE (verified: smoke 292/292, lint, build)** |
| **P10** | 선불권 (member-bound balance, 다음 영업일부터 사용, 모든 조건을 관리자가 설정) | **DONE (lint/build 통과, 커밋·배포 완료 — 서버 마이그레이션 대기)** |
| **P11** | 혼자야 기프티콘 (code-based single-use gift, 링크/문자 전달, 태블릿 사용) | **DONE (lint/build 통과, 커밋 완료 — 서버 마이그레이션 대기)** |
| **Ops** | Cloudflare cutover (`api.honjaya-server.xyz` live, Tailscale → backup, `vercel.json` rewrite swapped) | **DONE** |
| **P12** | Discord 통합 관리 시스템: 봇(서버 전체 관리) + 암호화 자동 백업 → Discord 업로드 + 웹 관리자 `/admin/discord` | **IN PROGRESS** — P12A~P12E 커밋 완료(`333dafa`), see §3-13 |

---

## 3. P0 — Staff auth & security (DONE)

### Schema — `server/sql/staff.sql`

- `employees` — `login_id` (unique, case-insensitive), `name`, `role`, `password_hash`, `is_active`, timestamps.
- `staff_sessions` — token stored as **sha256 hash only**, `expires_at`, `revoked_at`, `ip`, `user_agent`.
- `admin_audit_logs` — `employee_id`, `action`, `target_type`, `target_id`, `detail` jsonb, `ip`.
- **Not** registered in `server/src/tables.js`, so `/rest/v1` cannot reach these tables.

### Backend

| File | Purpose |
| --- | --- |
| `server/src/auth/password.js` | scrypt hash/verify, `validatePasswordStrength` |
| `server/src/auth/cookies.js` | cookie parse/serialize (no `@fastify/cookie` dependency) |
| `server/src/auth/permissions.js` | role → permission map |
| `server/src/auth/sessions.js` | session lifecycle, cookie helpers, `createStaffGuard(perm)` |
| `server/src/auth/rateLimit.js` | login attempt limiter (5 / 10 min per `loginId|ip`) |
| `server/src/auth/audit.js` | audit writer (never throws) |
| `server/src/routes/api/staffAuth.js` | `/api/staff/login`, `/logout`, `/me`, `/password` |
| `server/src/routes/api/admin.js` | employee CRUD + audit log list |

Guards implemented:

- Constant-time dummy hash for unknown `loginId` (no user enumeration).
- Last `OWNER` cannot be demoted or deactivated.
- `MANAGER` cannot create or assign `OWNER`.
- Nobody can deactivate themselves.
- Role change / deactivation revokes that employee's live sessions.
- Password change revokes other sessions but keeps the current one.

### Roles & permissions

| Role | Label | Highlights |
| --- | --- | --- |
| `OWNER` | 사장 | everything + `menu.price`, `employee.manage`, `point.adjust`, `settings.manage` |
| `MANAGER` | 매니저 | orders, payment/refund, sales/crm/audit view |
| `STAFF` | 알바 | order accept/status, table manage, payment, `menu.toggle` |

Role defaults are defined in `server/src/auth/permissions.js`. Since P9 the owner can override them per employee
(`employees.permissions`); `OWNER` accounts always keep the full role defaults.

### Frontend

| File | Purpose |
| --- | --- |
| `src/lib/api.js` | `apiGet/apiPost/apiPatch`, `credentials: "include"`, sends `apikey` |
| `src/lib/staffAuth.js` | reactive auth state, `staffLogin/staffLogout`, `hasPermission` |
| `src/views/Staff/StaffLoginView.vue` | Korean dark-gold login page |
| `src/router/index.js` | `/staff/login`, `meta.requiresStaff` on `/admin` + `/tablet` |
| `src/layouts/AdminLayout.vue` | staff name + role chip, logout button |
| `src/views/Tablet/TabletAdminView.vue` | header logout button |
| `vercel.json` | rewrite `/api/staff/(.*)`, `/api/admin/(.*)` → `https://bar.taild838e4.ts.net` (swap to `honjaya-server.xyz` at P7) |
| `vue.config.js` | `devServer.proxy` for the same two paths |

### Ops

- `server/scripts/seed-staff.mjs` + `npm run staff:seed` — idempotent OWNER bootstrap,
  `--reset-password` flag, random password printed once.
- `server/deploy/README.md` — Cloudflare Tunnel plan, `10-1` cookie section, `7-1` staff account section.
- `server/README.md` — folder map, env table, API table updated.

### Verification

Temporary script `server/scripts/tmp-verify-p0.mjs` (already deleted) ran against embedded Postgres
on port 55441: **44/44 checks passed**, including `/rest/v1` read/write regression.

Not yet run (project Rule 15 — only on request): `pnpm lint`, `pnpm build`, `npm run smoke`.

---

## 3-1. P1 — Table master (DONE)

### Schema — `server/sql/tables.sql`

- `bar_tables` — `table_number` int PK (1..999), `zone` (`BAR` | `LARGE`), `seat_capacity`, `display_name`,
  `is_active`, `sort_order`, `note`, timestamps.
- Seed: `generate_series(1,30)` with `on conflict (table_number) do nothing`
  → 1–10 `BAR` / 4 seats, 11–30 `LARGE` / 8 seats, `sort_order = table_number`, `display_name` empty.
- Reachable **read-only** through `/rest/v1` (public tablet/guest reads); writes are blocked server-side.

### Backend

| File | Purpose |
| --- | --- |
| `server/sql/tables.sql` | new table + constraints + 30-row seed |
| `server/scripts/apply-schema.mjs` | applies `tables.sql` **before** `events.sql` (trigger needs the table) |
| `server/sql/events.sql` | `bar_tables` added to the trigger target list; `row_id` falls back to `table_number` |
| `server/src/tables.js` | `bar_tables: { pk: "table_number", readOnly: true }` + `assertWritable()` |
| `server/src/routes/rest.js` | insert/update/delete call `assertWritable()` → **403** |
| `server/src/routes/api/admin.js` | `GET /api/admin/tables` (table.view), `PATCH /api/admin/tables/:tableNumber` (**settings.manage = OWNER**), `TABLE_UPDATE` audit log |

### Frontend

| File | Purpose |
| --- | --- |
| `src/lib/supabase.js` | `barTables` / `bar_tables` in `TABLE_MAPS`, `FIELD_MAPS` for snake_case |
| `src/lib/tableMaster.js` | `fetchTableMaster`, `subscribeTableMaster`, `updateTableMaster`, `tableLabelOf`, `zoneLabel` |
| `src/views/Tablet/TabletAdminView.vue` | `tableLayoutList` merges the master + latest order sheets → empty tables render as non-interactive `손님 없음` cards |
| `src/views/Admin/AdminTableView.vue` | new page: 30-row table list, zone/seat/name/sort/active/note editor |
| `src/router/index.js` / `src/layouts/AdminLayout.vue` | `/admin/tables` route + `테이블 관리` menu |

### Verification

- `server/scripts/tmp-verify-tables.mjs` (temporary, deleted): embedded Postgres 55434 → **32/32 passed**
  (seed 30 rows, `/rest/v1` read OK + POST/PATCH/DELETE 403, admin GET 401→200, PATCH validation 400s,
  404, audit log, STAFF 403 on PATCH, SSE `bar_tables` change frame).
- `npm run smoke` → **55/55 passed** (no regression).
- `pnpm lint` / `pnpm build`: not run yet (project Rule 15 — only on request).

---

## 3-2. P2 — Guest table session & order ownership (DONE)

Decision: **table-level shared visibility** (every guest at the table sees the table's orders, unchanged UX)
**plus per-guest attribution** ("누가 어떤 주문했는지") and server-side ownership enforcement.
`order_sheet_members` from the original draft is **not** needed — one session row per device covers it.

### Schema — `server/sql/guest.sql`

- `guest_sessions` — `id` uuid PK, `table_number`, `order_sheet_id`, `nickname`, `token_hash` (unique, sha256),
  `user_agent`, `ip`, `created_at`, `last_seen_at`, `expires_at`, `revoked_at` + 3 indexes.
- `orders.guest_session_id uuid` (nullable) + `orders.guest_nickname text` + index.
- Applied **after** `schema.sql`/`staff.sql` in `server/scripts/apply-schema.mjs`.

### Backend

| File | Purpose |
| --- | --- |
| `server/src/auth/guestSessions.js` | create/resolve/update/revoke/purge session, `hj_guest` cookie (HttpOnly, Lax, 12h) |
| `server/src/guest.js` | `openTableOrderSheet` (transaction: validate `bar_tables`, reuse OPEN sheet or create), `readOrderSheetById`, `readTableEntryInfo`, `validateGuestNickname` (Hangul = 2 units, max 16) |
| `server/src/routes/api/guest.js` | `GET /api/guest/table`, `POST/GET/PATCH /api/guest/session`, `POST /api/guest/logout` |
| `server/src/auth/restIdentity.js` | `resolveRestIdentity` → staff / guest / anon, plus the scoping policy |
| `server/src/routes/rest.js` | all 4 handlers apply the scope; closing an `order_sheets` row revokes that sheet's guest sessions |
| `server/src/config.js` | `guestCookieName: "hj_guest"`, `guestSessionHours: 12` |

Scope policy on `/rest/v1`:

| Table | guest | anon |
| --- | --- | --- |
| `orders` | SELECT forced `order_sheet_id = eq.<own>`; INSERT forces `order_sheet_id`/`table_number`/`display_name`/`guest_session_id`/`guest_nickname`/`status='REQUESTED'`; PATCH/DELETE 403 | 403 |
| `order_sheets` | SELECT forced `id = eq.<own>`; INSERT 403; PATCH whitelist (`table_nickname`, `total_amount`, `order_count`, `latest_*`, `updated_at`); DELETE 403 | 403 |
| `active_order_sheets` | SELECT forced `order_sheet_id = eq.<own>`; writes 403 | 403 |
| `products`, `categories`, `bar_tables`, `app_settings`, `counters` | unchanged (public) | unchanged |

### Frontend

| File | Purpose |
| --- | --- |
| `src/lib/guestAuth.js` | reactive guest state, `startGuestSession`, `loadGuestSession`, `updateGuestNickname`, `endGuestSession`, `saveEntryInfo` (sessionStorage `userEntryInfo` incl. `guestSessionId`) |
| `src/lib/supabase.js` | REST is same-origin now; `EVENTS_URL` kept absolute; `orders` FIELD_MAPS gained `guestSessionId` / `guestNickname` |
| `src/views/HomeView.vue` | entry screen calls `POST /api/guest/session` (no more client-side sheet creation); label **주문자 닉네임** |
| `src/views/User/UserMainView.vue` | **내 닉네임** editor → `PATCH /api/guest/session`; restores the cookie session on mount |
| `src/views/User/UserOrderHistoryView.vue` | per-order nickname chip + **내 주문** badge (`order.guestSessionId === mine`) |
| `src/views/Tablet/TabletAdminView.vue` | order cards show `guestNickname` next to the sheet id |
| `vercel.json` / `vue.config.js` | rewrites + dev proxy for `/rest/v1` and `/api/guest` |

### Deploy checklist (server first, then Vercel)

1. `docker compose --profile tools build migrate && docker compose run --rm migrate` (applies `guest.sql`)
2. `docker compose up -d --force-recreate api`
3. Vercel redeploy (new `vercel.json` rewrites must exist before the frontend is used)

### Verification (local)

- `npm run smoke` → **75/75** (P2 added 20 checks: staff login, guest join, forced columns, guest 403s, sheet scoping).
  - The `reserve-sequence` check now reads the live counter first, because `POST /api/guest/session` consumes
    one sequence number before that test runs.
- `pnpm lint` → clean (auto-formatted `src/lib/guestAuth.js`, `UserOrderHistoryView.vue`).
- `pnpm build` → OK (only the pre-existing 722 KiB entrypoint size warning).

---

## 3-3. P3 — Payment ledger, split/partial payment, refunds (DONE)

Decision: a **real ledger** replaces the single `order_sheets.payment_status` flag. One `payments` row per
(payment method × payer), so split-by-method and split-by-person are the same mechanism.
All three modes are supported: **partial payment**, **split by method**, **split by person**.

Money rules (server-authoritative):

- `order_sheets.original_amount` = gross, `discount_total` / `discounts` = server-recomputed discounts,
  `total_amount` = payable (`original − discount`). The client's `totalAmount` is **ignored**.
- `order_sheets.paid_amount` = **net settled** (paid − refunded). `payment_status` is derived:
  `UNPAID` (0) / `PARTIAL` (<total) / `COMPLETED` (>=total).
- `remaining = total_amount − paid_amount`; overpay is rejected with 400, paying a closed sheet with 409.
- Refunds reverse allocations newest-first and re-derive the sheet state (a fully refunded sheet returns to
  `UNPAID`). The sheet `status` (OPEN/CLOSED) is **not** reopened by a refund.

### Schema — `server/sql/payments.sql`

- `payments` — `id` text PK, `order_sheet_id`, `table_number`, `business_date date` (KST 15:00 rollback),
  `amount > 0`, `method`, `payer_label`, `guest_session_id`, `employee_id` → `employees(id) on delete set null`,
  `employee_name`, `memo`, `occurred_at`, `created_at` + 3 indexes.
- `payment_allocations` — `payment_id` → `payments on delete cascade`, `order_id` (nullable), `amount` + 2 indexes.
- `refunds` — `payment_id` → `payments on delete restrict`, `order_sheet_id`, `business_date`, `amount > 0`,
  `method`, `reason`, `employee_id`/`employee_name`, `occurred_at` + 3 indexes.
- `order_sheets.paid_amount integer not null default 0`.
- Idempotent legacy backfill: existing `payment_splits` jsonb → `payments` rows (`legacy_<sheet>_<nn>`), a
  `legacy_<sheet>` fallback from `payment_method`, then `paid_amount = total_amount` for `COMPLETED` sheets.

### Backend

| File | Purpose |
| --- | --- |
| `server/src/payments.js` | `toBusinessDate`, `computeDiscountTotal`, `normalizeEntries`, `allocatePaymentAmount` (FIFO by order creation, leftover → `order_id null`), `syncSheetPaymentState` (keeps `payment_splits`/`payment_method`/`paid_at` compatible), `getSheetLedger`, `recordPayment`, `refundPayment`, `listPayments` |
| `server/src/routes/api/payments.js` | `GET /api/payments`, `GET /api/payments/sheet/:orderSheetId`, `POST /api/payments`, `POST /api/payments/:paymentId/refund` (+ audit `payment.record` / `payment.refund`) |
| `server/src/app.js` | registers the payment routes |
| `server/scripts/apply-schema.mjs` | applies `sql/payments.sql` after `guest.sql` |

Permissions: `payment.view` (STAFF+), `payment.manage` (STAFF+), `payment.refund` (MANAGER+).
The ledger tables are **not** in `server/src/tables.js`, so `/rest/v1/payments` returns 404 — writes only via `/api/payments`.

### Frontend

| File | Purpose |
| --- | --- |
| `src/lib/payments.js` | method labels (7 methods + `MIXED`), `fetchSheetLedger`, `fetchPaymentLedger`, `recordSheetPayment`, `refundSheetPayment` |
| `src/lib/orderSheet.js` | `completeOrderSheetPayment` now delegates to `POST /api/payments` (splits → entries with `method`/`payerLabel`/`amount`) |
| `src/views/Tablet/TabletAdminView.vue` | 결제 모달: 결제된 금액 / 이번 결제 필요 금액, per-row method select + 결제자 label + 남은 금액, "일부 결제 처리" confirm; 결제 완료 모달 shows 이번 결제 / 남은 금액; table detail shows 결제된 금액 + 남은 금액 |
| `src/views/Admin/AdminPaymentHistoryView.vue` | 결제 원장 section (총 결제 / 총 환불 / 순 매출, method chips, ledger table, 환불 기록) + 환불 modal (`payment.refund` only) |
| `src/lib/supabase.js` | `order_sheets` FIELD_MAP gained `paidAmount` |
| `vercel.json` / `vue.config.js` | `/api/payments` rewrite + dev proxy |

### Deploy checklist (server first, then Vercel)

1. `docker compose --profile tools build migrate && docker compose run --rm migrate` (applies `payments.sql` + backfill)
2. `docker compose up -d --force-recreate api`
3. Vercel redeploy (new `/api/payments` rewrites)

### Verification (local)

- `npm run smoke` → **109/109** (P3 added 34 checks: partial payment, ledger read, overpay 400, split payers, close,
  409 on closed sheet, partial refund, over-refund 400, ledger totals, staff-only 401s).
- `pnpm lint` → clean (auto-formatted `src/lib/payments.js`, `AdminPaymentHistoryView.vue`, `TabletAdminView.vue`).
- `pnpm build` → OK (only the pre-existing bundle-size warning).

### Known nuances

- Second-round billing: the tablet sends the sheet's current `total_amount` as `originalAmount`, so an earlier
  discount is baked into `original_amount` and `discount_total` resets unless new discounts are added. `due` is
  always `total_amount − paid_amount`, so amounts stay consistent.
- `payment_splits` keeps **gross** per-method totals (refunds are tracked in `refunds`, mirrored in `paid_amount`).
  Legacy views filter `paymentStatus === 'COMPLETED'`, so a refunded sheet drops out of their revenue.

---

## 3-4. P4 — Kakao login readiness (DROPPED)

Originally a P4 scaffold (`/api/kakao/status`, `KAKAO_*` env, console checklist). **Removed in P7.**

- Why: Kakao login bought nothing here — guests are bar customers, not app users. A phone number is the
  natural identity and it is already collected at the tablet payment screen (P5/P6).
- Kakao is still used as a **message channel** (알림톡), which needs only a 카카오 채널 + 발신 프로필,
  not a login app.
- Deleted: `server/src/kakao.js`, `server/src/routes/api/kakao.js`, `KAKAO_*` env keys, the
  `/api/kakao/(.*)` rewrite/proxy, and the P4 smoke checks (replaced by a "404" regression check).
- `customers.kakao_id` column is kept but **unused** (no migration risk); nothing reads or writes it.

---

## 3-5. P5 — Points ledger (DONE)

Points are **staff-driven**: there is no customer login yet, so the tablet payment screen asks for the guest's phone
number, looks up (or creates) the customer, then applies earn/redeem inside the same `POST /api/payments`
transaction. Identity is the phone number — there is no customer login (Kakao was dropped in P7), so the ledger
does not change.

### Schema — `server/sql/points.sql`

- `customers` — minimal profile keyed by the normalized mobile number (`phone` unique) plus `name`, `memo`.
  P6 adds `kakao_id`, marketing consent and visit history to this same row.
- `point_ledger` — one row per movement. `points` is signed (`+` EARN, `−` REDEEM / EXPIRE / ADJUST), `balance_after`
  is stored for audit, `expires_at` exists only on EARN lots. Balance = `sum(points)`.
- `point_allocations` — which earn lot a debit consumed (FEFO: soonest expiry first), so expiry runs per lot.
- `order_sheets.points_used` — points consumed by that sheet, kept separate from `discount_total`.

Applied by `npm run db:apply` (and the `migrate` container) after `payments.sql`.

### Rules

`POINT_RULES` in `server/src/points.js` is the single source of truth and is mirrored to the UI through
`GET /api/points/rules`.

| Rule | Value |
| --- | --- |
| Earn | 1% of the cash actually collected (`floor`), after discount and point deduction |
| Expiry | same day 3 calendar months later, 23:59:59 KST |
| Redeem minimum | 1,000P |
| Redeem step | 1,000P |
| Redeem payment floor | ₩30,000, measured **after discount, before point deduction** |
| Refund clawback | `floor(refund × 1%)`, capped by the current balance |

### Backend

- `server/src/points.js` — `getCustomerPoints`, `earnPointsForPayment`, `redeemPointsForPayment`, `adjustPoints`,
  `clawbackForRefund`, `listPointLedger`, the FEFO allocator and lazy expiry (`materializeExpiry` writes the missing
  `EXPIRE` rows on read — no cron).
- `server/src/businessDay.js` — `toBusinessDate` extracted from `payments.js` so point rows inherit the payment's
  business date (15:00 KST rollover).
- `server/src/payments.js` — `recordPayment` accepts `customerPhone` / `customerName` / `pointsUsed` and runs
  discount → redeem → insert payments → earn (basis = `entryTotal`). `refundPayment` claws back earned points inside a
  `points_clawback` savepoint, so a points problem can never block the refund.
- `server/src/routes/api/points.js` — `GET /api/points/rules`, `GET|POST /api/points/customer` (`point.use`),
  `GET /api/points/ledger` (`customer.view`), `POST /api/points/adjust` (`point.adjust`, OWNER only). Every other
  movement happens inside `POST /api/payments`, so no extra endpoint can move points.
- Audit: `customer.upsert`, `point.adjust`, and `payment.record` (now carrying `pointsUsed` / `pointsEarned` /
  `customerPhone`, plus `pointsReclaimed` on refunds).

### Frontend

- `src/lib/points.js` — API wrappers, `maxUsablePoints`, phone formatting/normalizing, entry labels.
- `src/views/Tablet/TabletAdminView.vue` — the payment modal gains a 포인트 section (phone lookup → balance →
  사용 포인트 with a 최대 button → earn preview); the 결제 금액 math subtracts used points, and the completion modal
  shows 사용 / 적립 / 남은 포인트.
- `src/views/Admin/AdminPointHistoryView.vue` (`/admin/points`, "포인트 관리") — phone/date filters, summary cards
  (적립 / 사용 / 소멸 / 조정 / 미사용 잔액), customer card with memo, OWNER-only 조정 form, and the ledger table.

### Deploy checklist

1. `docker compose --profile tools build migrate && docker compose run --rm migrate` (applies `points.sql`)
2. `docker compose up -d --force-recreate api`
3. Vercel redeploy (new `/api/points` rewrites)

### Verification (local)

- `npm run smoke` (server, embedded Postgres) — **169/169 통과**, including the new `points ledger (P5)` block:
  rules, permission matrix (STAFF can read/adjust → 403), earn on a 50,000원 card payment, redemption guards
  (미만 / 단위 / 3만원 미만 / 잔액 초과 / 전화번호 없음), 성공 사용 (3,000P + 37,000원 카드), ledger totals,
  refund clawback, and lazy expiry writing an `EXPIRE` row.
- `pnpm lint` — 통과 (3 files auto-fixed).
- `pnpm build` — 성공 (기존 bundle-size warning 3건만 존재).

### Known nuances

- Expiry only materializes when the customer is read or a balance changes; the liability card filters
  `expires_at > now()`, so totals stay correct without a cron.
- A refund claws back earned points but **does not restore points that were spent** on that payment
  (open question #5).
- The phone number is the only customer key right now — a typo creates a second customer row instead of merging.

---

## 3-6. P6 — CRM foundation: profile, marketing consent, visit history (DONE)

Scope decision: build the CRM base **without Kakao login** (user choice). Member identity is the phone number;
`kakao_id` exists in the table but is never read or written.

### Schema — `server/sql/crm.sql`

- `customers` += `marketing_consent boolean not null default false`, `marketing_consent_at timestamptz`,
  `nickname text not null default ''`, `kakao_id text` (+ partial unique index `customers_kakao_id_key`).
- `payments` += `customer_id text references customers(id) on delete set null` (+ `payments_customer_idx`).
- Backfill: `payments.customer_id` filled once from `point_ledger` for P5-era rows.
- **No denormalized counters**: 방문 횟수 = `count(distinct payments.business_date)`, 누적 결제 =
  `sum(payments.amount) - sum(refunds.amount)`, 최근 방문 = `max(payments.occurred_at)`.

### Backend

- `server/src/crm.js` — `listCustomers` (검색/동의 필터/정렬 + 전체 요약), `getCustomerProfile`
  (고객 + 방문 이력), `updateCustomer` (이름·닉네임·메모·동의), `grantMarketingConsent` (결제 트랜잭션용).
  보유 포인트는 로트 기준(미만료 적립 − 사용) 합계.
- `server/src/routes/api/crm.js` — `GET /api/crm/customers`, `GET /api/crm/customers/:id`,
  `PATCH /api/crm/customers/:id`, guard `crm.view` (MANAGER+), audit `customer.update` / `customer.consent`.
- `server/src/payments.js` — `recordPayment` now stores `payments.customer_id` and accepts
  `marketingConsent` (켜기만; 철회는 관리자 화면). Response `customer.marketingConsent`.
- `vercel.json` + `vue.config.js` — `/api/crm` rewrite/proxy.

### Frontend

- `src/lib/crm.js` — API wrappers + formatters (reuses `formatPointValue`, `getPaymentMethodLabel`).
- `src/views/Admin/AdminCustomerView.vue` at `/admin/customers` ("고객 관리"): 검색·동의 필터·정렬,
  요약 카드(전체/동의/미사용 포인트), 고객 목록, 상세(요약·동의 토글·이름/닉네임/메모 저장·방문 이력),
  "포인트 관리에서 보기" 이동. AdminLayout 메뉴에 `고객 관리` 추가.
- `AdminPointHistoryView` accepts `?phone=` so the CRM detail page can deep-link.
- Tablet payment modal: 마케팅 수신 동의 checkbox (전화번호 입력 시) → `marketingConsent` 전송.

### Deploy checklist

1. `docker compose --profile tools build migrate && docker compose run --rm migrate` (applies `crm.sql`)
2. `docker compose up -d --build api` — **`--build` 필수** (`--force-recreate` 만으로는 코드가 반영되지 않음)
3. Vercel redeploy (new `/api/crm` rewrites)

### Verification (local & live)

- `npm run smoke` — **201/201 통과** (P6 블록 36개 추가: 목록/권한(STAFF 403, 비로그인 401)/상세 방문 이력/
  정보 수정/동의 설정·필터·요약/결제 시 동의 저장/`payments.customer_id` 연결/`customer.consent` 감사 로그).
- `pnpm lint` — 통과 (3 files auto-fixed). `pnpm build` — 성공.
- 라이브: `crm.sql` 6개 적용 → `GET /api/crm/customers` 200(사장 쿠키) / 401(미로그인),
  `https://honjaya.vercel.app/api/crm/customers` rewrite 동작 확인.

---

## 3-7. P7 — Marketing & messaging: segments, campaigns, 문자/알림톡 (DONE)

Goal: message customers whose phone number we already have, **without Kakao login**. A phone number is the member
identity; Kakao is only a delivery channel for 알림톡.

### Schema — `server/sql/marketing.sql`

- `customers` += `marketing_opt_out_token text` (+ partial unique index), `marketing_consent_source text`
  (`TABLET` / `ADMIN` / `CUSTOMER`). Tokens backfilled with `md5(...)` (no pgcrypto dependency).
- `message_campaigns` — `title`, `body`, `channel` (`SMS`/`LMS`/`ALIMTALK`), `segment`, `target_count`,
  `sent_count`, `failed_count`, `status` (`DRAFT`/`SENT`/`CANCELED`), `provider`, `provider_note`,
  `created_by` → `employees`, timestamps.
- `message_logs` — per-recipient row (`PENDING`/`SENT`/`FAILED`/`SKIPPED`), `attempts`, `error`,
  `provider_message_id`; unique partial index `(campaign_id, customer_id)` so re-sends are idempotent.

### Backend

- `server/src/messaging.js` — provider adapter. `MESSAGING_PROVIDER=dryrun` (default, returns a `dry-…` id and
  sends nothing), `none` (feature off), `solapi` (real `POST /messages/v4/send`, HMAC-SHA256 auth header, auto
  SMS/LMS by body length, `ALIMTALK` → 503 until a 카카오 채널 + 발신 프로필 exists).
- `server/src/marketing.js` — `SEGMENTS` (`CONSENTED` / `DORMANT` 60d / `NEW` 30d / `POINTS` ≥1,000P),
  `AUDIENCE_CTE` (consent + valid phone 9–11 digits + points balance + visit stats), `previewAudience`,
  `createCampaign`, `materializeLogs`, `deliverPending`, `refreshCampaignStats`, `sendCampaign`, `retryCampaign`,
  `unsubscribeByToken`, `exportAudienceCsv` (UTF-8 BOM, Korean headers). Placeholders `#{이름}` / `#{포인트}`
  are resolved at send time.
- `server/src/routes/api/marketing.js` — 12 endpoints. Staff: settings/segments/audience/campaigns/CSV guarded by
  `marketing.view` (MANAGER+); create/send/retry by `marketing.manage` (OWNER). Public:
  `GET/POST /api/marketing/unsubscribe` (token in the query/body, masked phone in the response).
- `server/src/crm.js` — consent writes now also stamp `marketing_consent_source` and mint the opt-out token.
- Kakao login removed end-to-end (see §3-4).

### Frontend

- `src/views/Admin/AdminMarketingView.vue` at `/admin/marketing` ("마케팅"): dry-run banner, segment summary cards,
  composer (segment/channel/title/body with placeholder hints), audience preview, campaign table (상세/발송/재발송),
  recipient log list, CSV download.
- `src/views/User/UnsubscribeView.vue` at `/unsubscribe?token=…` — public opt-out page (Korean, masked phone).
- `src/lib/marketing.js` + `apiText()` in `src/lib/api.js` (non-JSON responses for the CSV).
- `vercel.json` / `vue.config.js` — `/api/kakao` rewrite/proxy replaced by `/api/marketing`.

### Rules

- Only `marketing_consent = true` **and** a 9–11 digit phone number is a valid recipient.
- A campaign becomes `SENT` after any send attempt; failed rows stay `FAILED` and `retry` resets them to `PENDING`.
  Resending a `SENT` campaign returns **409**.
- Every message body gets the opt-out link `https://honjaya.vercel.app/unsubscribe?token=…` appended.

### Deploy checklist

1. Backup: `BACKUP_DIR=/home/bar/backups-honjaya ./deploy/backup-db.sh`
2. `docker compose --profile tools build migrate && docker compose run --rm migrate` (applies `marketing.sql`)
3. `docker compose up -d --build api` — **`--build` 필수**
4. Vercel redeploy (new `/api/marketing` rewrites + the `/unsubscribe` page)

### Verification (local)

- `npm run smoke` — **242/242 통과** (P7 block ~40 checks: dry-run defaults, 권한 403/401, segment counts,
  audience preview, 201 create, send 2/0, resend 409, retry, log detail, `marketing.send` audit row, opt-out
  token → 미동의 전환, CSV BOM + Korean header; plus a "카카오 로그인 제거 → 404" regression check).
- Live (2026-11-21): `marketing.sql` 8개 적용 → `/api/marketing/settings` 200(사장 쿠키) / 401(미로그인),
  `/api/marketing/segments` 200, `/api/kakao/status` 404, 잘못된 수신거부 토큰 404,
  `https://honjaya.vercel.app/api/marketing/*` rewrite 동작 + `/unsubscribe` 페이지 200.

### 실사용 모드 전환 (dry-run → real send)

- **Root cause of "still 검수용 모드"**: `server/docker-compose.yml` listed each api env var explicitly and
  never forwarded `MESSAGING_*` / `SOLAPI_*`; `server/.env` is `.dockerignore`d so it never lands in the
  image. Keys added to `.env` were therefore invisible and the container kept falling back to `dryrun`.
- Fix: `api.environment` now passes `MESSAGING_PROVIDER` / `MESSAGING_SENDER` / `SOLAPI_API_KEY` /
  `SOLAPI_API_SECRET` (plus `LOG_LEVEL`, which was documented but never forwarded either).
- `messagingReadiness()` in `server/src/messaging.js` → `{provider, dryRun, credentialsReady, missing[]}`
  with **env names only** (never values). `GET /api/marketing/settings` exposes `provider`, `sender`,
  `senderText`, `credentialsReady`, `missing`; `server/src/index.js` logs the same verdict at boot
  (`[messaging] 실사용 모드` / `검수용 모드` / `발송 설정 누락: …`).
- Admin banner now has 4 states: dry-run + keys present (⇒ flip `MESSAGING_PROVIDER`), dry-run + missing
  names listed, real mode but missing names (error), real mode ready (shows the sender number).
- **Vercel needs no change** — sending is server-side. Verified against the live bundle
  `app.*.js`: `VUE_APP_SUPABASE_URL=https://api.honjaya-server.xyz`, discord invite present, `supabase.co`
  and `*.ts.net` absent.

---

## 3-8. P8 — Revisit coupons (DONE)

Goal: the bar can hand a specific customer a coupon ("다음에 오시면 5,000원 할인") and the tablet redeems it at payment.
Coupons belong to a **phone number** (same identity as points/CRM), so no login is required.

### Schema — `server/sql/coupons.sql`

- `public.coupons` — `code` (unique), `customer_id` → `customers`, `phone`, `title`, `discount_type`
  (`AMOUNT` / `PERCENT`), `discount_value`, `min_amount` (default 0), `status`
  (`ACTIVE` / `USED` / `EXPIRED` / `VOID`), `expires_at`, `used_at`, `used_payment_id`, `used_order_sheet_id`,
  `issued_by` → `employees`, `memo`, timestamps. Indexes: `(phone, status)`, `(status, expires_at)`, `code`.
- Registered in `apply-schema.mjs` (applied last). **Not** added to `server/src/tables.js` (that registry governs
  `/rest/v1` only).

### Backend

- `server/src/coupons.js` — `mapCoupon` (derives `ACTIVE` → `EXPIRED` on read, exposes `usable`),
  `discountAmountOf` (`PERCENT` → `min(base, floor(base*min(value,100)/100))`, `AMOUNT` → `min(base, value)`),
  `issueCoupon`, `voidCoupon`, `listCustomerCoupons`, `listUsableCouponsByPhone`, `redeemCouponsForPayment`.
- `server/src/routes/api/crm.js` — `GET /api/crm/customers/:phone/coupons` (`crm.view`),
  `POST … /coupons` (`marketing.manage`, audit `coupon.issue`), `POST … /coupons/:id/void` (`marketing.manage`,
  audit `coupon.void`).
- `server/src/routes/api/payments.js` — `GET /api/payments/coupons?phone=&baseAmount=` (`payment.view`);
  `POST /api/payments` passes `couponIds` through.
- `server/src/payments.js` — `recordPayment({ couponIds })`: resolves the coupons server-side, adds them to
  `discounts` as `{type:'COUPON'}`, marks them `USED` with the payment/order-sheet ids, returns `coupons: [...]`.
  Rejects coupons without `originalAmount` (400) or without a resolvable `customerId` (400); an already used
  coupon → **409**.

### Frontend

- Tablet payment modal (`TabletAdminView.vue`): 휴대폰 번호로 재방문 쿠폰 조회 → checkbox list → summary/receipt rows
  → `completePayment` sends `couponIds` (discount math mirrored client-side **for display only**).
- `AdminCustomerView.vue`: coupon issue form (제목/할인 유형/값/최소 금액/유효기간) + coupon list with 취소.
- `src/lib/payments.js` (`couponIds`, `fetchUsableCoupons`), `src/lib/orderSheet.js` (`couponIds` passthrough),
  `src/lib/crm.js` (coupon constants + CRUD + `formatCouponDiscount`).

### Rules

- A coupon is single-use: `ACTIVE → USED` in the same transaction as the payment. `USED` / `VOID` / `EXPIRED`
  coupons never show up in `GET /api/payments/coupons`.
- Coupon discount is capped by the remaining base amount and is added **after** manual discounts.
- Refunds do not restore coupons (sheet totals/discounts are not reverted on refund either).
- Issuing/voiding is 사장 전용 (`marketing.manage`).

### Deploy checklist

1. Backup: `BACKUP_DIR=/home/bar/backups-honjaya ./deploy/backup-db.sh`
2. `npm run db:apply` (or the `migrate` profile) — applies `coupons.sql`
3. `docker compose up -d --build api` — **`--build` 필수** (새 `/api/crm/customers/:phone/coupons`, `/api/payments/coupons`)
4. Vercel redeploy (tablet 쿠폰 UI + 관리자 고객 화면)

### Verification (local)

- `npm run smoke` — **269/269 통과** (P8 block ~27 checks: issue → 201, 권한 403/401, 목록, 결제 조회 할인 금액,
  쿠폰 결제 → `discount_total`/`total_amount`/`discounts` 기록, 쿠폰 → 결제·주문서 연결, 재사용 409, 취소 후 상태,
  취소/사용 쿠폰 조회 제외, 전화번호 없는 쿠폰 결제 400).
- `pnpm lint` / `pnpm build` 통과.

---

## 3-9. UI polish & tablet fixes (DONE)

- **Admin dark theme** — `AdminPointHistoryView.vue`, `AdminCustomerView.vue`, `AdminMarketingView.vue` were still on the
  light palette; they now share the dark admin tokens. `.admin-layout` sets `color-scheme: dark`, and
  `AdminTableView.vue` `select option` is dark so dropdowns stop rendering white-on-white.
- **Root table picker** — `HomeView.vue` shows a 자리 선택 screen (zone groups 바 / 큰 테이블, 52px tiles,
  loading / error / empty states) when the URL has no `?table=`. Choosing a table calls `/api/guest/session` and
  `router.replace` strips `?table=`, so 손님 can just open the root URL. A "다른 자리 선택" button returns to the picker.
- **테이블별 매출** — `AdminSalesView.vue` aggregates payments per table (매출 / 건수 / 객단가) for the selected range.
- **Tablet payment bug fixes** — `completePayment` recalculates the sheet totals before billing (the modal used to send
  a stale amount that the server then wrote into `order_sheets.total_amount`), and "테이블 정리 완료" now deletes the
  `active_order_sheets` row (`finalizeOrderSheetCleanup({ orderSheetId, tableNumber })`).
- **Open follow-ups** from the tablet flow audit (not fixed yet): duplicate order on `UserCartView` retry (no
  idempotency), unguarded `guardOrderSheetUsable()` calls outside `try` (silent no-op / endless loading), guest
  session recovery only on `UserMainView`, order history total includes `CANCELLED`, fetch failures rendering as an
  empty menu, tablet order list filtered by business-day start breaking midnight-spanning sheets, 주문 관리
  showing only `REQUESTED` with no undo, `buildLatestSheetMap` possibly picking a `CLOSED` sheet.

---

## 3-10. P9 — 직원 계정·권한 관리 (DONE)

Goal: the owner needs one screen to create staff accounts, reset passwords, switch roles, and fine-tune what each
person can see — without touching SQL.

### Model

- Two layers: `employees.role` (`OWNER` / `MANAGER` / `STAFF`) supplies a default permission set, and the optional
  `employees.permissions text[]` overrides it per employee.
- `permissions = null` → role defaults; `permissions = '{}'` → **no** permissions; `permissions = '{...}'` → exactly
  those.
- **OWNER is always forced to role defaults** — the API stores `null` and ignores overrides. This is the
  lockout-prevention mechanism (nobody can strip `employee.manage` from the last owner), so the owner account can
  never lock itself out.
- Unknown permission strings are silently dropped and the array is normalised to `ALL_PERMISSIONS` order, so the UI
  can never persist a permission the server does not check.
- Any change to `permissions` revokes all sessions of that employee (the caller keeps their own), so the tablet must
  log in again — the UI warns "다시 로그인해야 합니다".
- A `MANAGER` can be *granted* `employee.manage`, but still cannot create or modify an `OWNER` account (403).

### Schema — `server/sql/staff.sql`

- `alter table public.employees add column if not exists permissions text[];` (idempotent, safe to re-apply).

### Backend

- `server/src/auth/permissions.js` — `PERMISSION_LABELS` (Korean), `PERMISSION_GROUPS` (주문 / 테이블 / 결제·포인트 /
  고객·마케팅 / 메뉴·매장 / 직원·보안), `ALL_PERMISSIONS`, `normalizePermissions()`, `permissionsForEmployee()`
  (the single source of truth for the effective set), `permissionCatalog()`.
- `server/src/auth/sessions.js` — `resolveStaffSession` selects `e.permissions` and resolves the effective set through
  `permissionsForEmployee()`; `toPublicEmployee` exposes both `permissions` (effective) and `permissionOverrides`
  (raw, `null` when defaulted).
- `server/src/routes/api/admin.js` — `GET /api/admin/permissions` (catalogue for the checkbox UI);
  `POST/PATCH /api/admin/employees` accept `permissions` (`undefined` = untouched, `null` = reset, array = set);
  OWNER targets are rejected for non-OWNER callers; every permission change is audited.
- `server/src/routes/api/staffAuth.js` — login `select` includes `permissions`.

### Frontend

- `src/lib/adminEmployees.js` — API helper (`fetchPermissionCatalog`, `fetchEmployees`, `createEmployee`,
  `updateEmployee`, `resetEmployeePassword`).
- `src/views/Admin/AdminEmployeeView.vue` — 사장 전용 page: 직원 추가 form, 직원 목록 (아이디 / 이름 / 역할 / 권한 /
  상태 / 마지막 로그인 / 관리), 인라인 수정 card (이름·역할·계정 상태·권한 체크박스 그룹), 비밀번호 변경 card.
- `src/router/index.js` — `/admin/employees` with `meta: { permission: "employee.manage" }`; `beforeEach` reads
  `to.matched` meta and redirects to `/admin/dashboard` when the permission is missing.
- `src/layouts/AdminLayout.vue` — every menu item now carries a `permission`, and only `visibleMenuList` is rendered,
  so 매출 / 결제 / 포인트 / CRM / 마케팅 / 메뉴 / 테이블 / 직원 관리 / 태블릿 entries appear per employee.

### Deploy checklist

1. `npm run db:apply` on the server — adds `employees.permissions` **and** re-applies `coupons.sql`.
   **Mandatory before the API rebuild**: the API selects `employees.permissions`, so without the column every staff
   login and session resolution fails.
2. `docker compose up -d --build api`.
3. Vercel redeploy (the frontend is served from `dist/`).

### Verification (local)

- `npm run smoke` — **292/292 통과** (P9 block ~23 checks: catalogue 200/401, create with a bogus permission dropped,
  effective vs override, 부여된 권한만 200 / 나머지 403, 권한 변경 시 기존 세션 401, `null` reset 복원, OWNER 강제
  기본값, 위임받은 매니저의 사장 계정 403 / 직원 생성 200).
- `pnpm lint` / `pnpm build` 통과.

---

## 3-11. P10 — 선불권 (DONE — code complete, pending deploy)

Goal: a member (phone-keyed `customers`) pre-pays at the bar and spends the balance on later visits. Every condition
an operator may tune — price, credited amount, validity, minimum spend, per-use limits, usable days/time — is a row
in an admin-managed plan table, so no code change is needed to add a new 선불권.

### Rules (proposed defaults)

- **Member-bound**: a pass belongs to `customers.id` (phone). Not transferable, no code/link (that is P11).
- **Next visit only**: usable from the **business day after the purchase business day**
  (`usable_from_business_date = purchase_business_date + 1`). A purchase at 00:30 still belongs to the previous
  business day (15:00 KST cut-over), so the same night stays blocked.
- **Balance type (confirmed by owner)**: amount-based **only**. Count-based packages (e.g. "하이볼 5잔") are not
  implemented here — they are covered by P11 `ITEM` gift certificates.
  `price` (paid) may differ from `face_value` (credited) — bonus allowed,
  e.g. pay ₩100,000 → ₩120,000 balance.
- Expiry is lazy (same as points): an `EXPIRE` ledger row is written when a pass is read after `expires_at`.
- Redemption = payment method `PREPAID` on the tablet payment screen (cash was collected at purchase, so it is
  **not** a discount). Refunding that payment restores the balance.
- **Points (decided)**: earn 1% of `price` **at sale time** only. `PREPAID` amounts are excluded from the point base
  when a bill is paid with the pass, so the same money never earns twice. There is no `payments` row at sale time
  (`payments.order_sheet_id` is `not null`), so the earn is written with `payment_id = null`.
- Sale is recorded as `prepaid_transactions(PURCHASE)` with the payment method; the sales screen shows
  판매(입금) / 사용(매출 인식) / 미사용 잔액(부채) separately so revenue is not double counted.

### Schema — `server/sql/prepaid.sql`

- `prepaid_plans` (admin templates): `id`, `name`, `price`, `face_value`, `validity_months` (0 = 무제한),
  `min_payment_amount`, `min_use_amount`, `max_use_percent`, `usable_days smallint[]`,
  `usable_from_time` / `usable_to_time`, `usable_from_next_visit boolean default true`,
  `allow_multiple boolean`, `is_active`, `sort_order`, `memo`, timestamps.
- `prepaid_passes`: `id`, `code`, `customer_id` → `customers`, plan snapshot (`plan_id`, `plan_name`, `face_value`),
  `balance`, `price_paid`, `purchased_at`, `purchase_business_date`, `usable_from`, `expires_at`,
  `status` (`ACTIVE` / `EXHAUSTED` / `EXPIRED` / `VOID`), `payment_method`, `memo`,
  `issued_by_employee_id/name`.
- `prepaid_transactions`: `id`, `pass_id`, `customer_id`, `entry_type`
  (`PURCHASE` / `USE` / `ADJUST` / `EXPIRE` / `RESTORE`), `amount` (signed), `balance_after`, `payment_id`,
  `refund_id`, `order_sheet_id`, `business_date`, `employee_id/name`, `reason`, `occurred_at`.
- Registered in `apply-schema.mjs` right after `coupons.sql`. **Not** in `server/src/tables.js`.

### Backend

- `server/src/prepaid.js` — `mapPlan`, `mapPass` (lazy expire), `passBlockedReason`, `maxUsableAmount`, `listPlans`,
  `createPlan`, `updatePlan`, `expireDuePasses`, `issuePass`, `listCustomerPasses`, `listPasses`, `getPassLedger`,
  `readPassForPayment`, `applyPassUse`, `restorePassForRefund`, `adjustPass`, `voidPass`, `prepaidSummary`.
- `server/src/routes/api/prepaid.js` — `GET/POST /api/prepaid/plans`, `PATCH /api/prepaid/plans/:planId`,
  `POST /api/prepaid/passes`, `GET /api/prepaid/customer?phone=`, `GET /api/prepaid/passes`,
  `GET /api/prepaid/passes/:id/ledger`, `POST /api/prepaid/passes/:id/adjust`, `POST /api/prepaid/passes/:id/void`,
  `GET /api/prepaid/summary`.
- `server/src/payments.js` — `PREPAID` in `PAYMENT_METHODS`, `prepaidPassId` per split (same-pass rows merged),
  validation before insert, `applyPassUse` inside the payment transaction, earn base excludes `PREPAID`, and
  `restorePassForRefund` on refund.
- Audit actions: `prepaid.plan.create` / `prepaid.plan.update` / `prepaid.issue` / `prepaid.adjust` / `prepaid.void`.

### Permissions (`server/src/auth/permissions.js`, new group 선불권·기프티콘)

- `prepaid.view` — MANAGER default (admin screens).
- `prepaid.issue` — STAFF default (staff must sell and redeem at the bar; unlike coupons, which stay owner-only).
- `prepaid.manage` — OWNER only (plan CRUD, manual adjust, void).

### Frontend

- `src/lib/prepaid.js` — API helper + labels/formatters + `computePassMaxUsable` (mirrors the server rule).
- `TabletAdminView.vue` — 결제 수단에 `선불권` 추가(결제 분할별 선불권 선택 + 사용 가능 금액 안내) + 헤더 `선불권 판매` 버튼.
- `src/components/tablet/PrepaidSellModal.vue` — 판매(발급) 모달. `TabletAdminView.vue`가 이미 5.4k 줄이라 분리했습니다.
- `src/views/Admin/AdminPrepaidView.vue` — 탭 1 상품 설정(CRUD), 탭 2 발급·잔액 현황(검색/조정/취소/원장).
- `AdminCustomerView.vue` — 고객 상세에 보유 선불권 카드.
- `AdminSalesView.vue` — 선불권 판매/사용/미사용 잔액 카드.
- `AdminLayout.vue` + `router/index.js` — `/admin/prepaid` with `meta.permission = "prepaid.view"`.

### Verification

- `pnpm lint` — PASS (fixed one unused import in `TabletAdminView.vue`).
- `pnpm build` — PASS (32 s; only the pre-existing bundle-size warnings).
- `node --check` on all new/changed server files — PASS.
- Smoke test — **not run** (needs a live DB). Run on the server after migrate: plan CRUD 403/200, issue,
  사용 가능일 이전 400, 잔액 차감 + `payment_splits` `PREPAID`, 잔액 부족 400, `min_payment_amount` 400,
  `max_use_percent` 400, 사용 요일 위반 400, 만료 `EXPIRE`, 환불 시 잔액 복원, adjust/void 권한 403, summary 합계.

### Deploy checklist

1. `deploy/backup-db.sh`
2. `docker compose run --rm --build migrate` — applies `prepaid.sql`
3. `docker compose up -d --build api`
4. Vercel redeploy

Status: frontend committed + pushed (`7a2edf4`) → Vercel auto-deploy. Server steps 1–3 still pending (run on the host).

---

## 3-12. P11 — 혼자야 기프티콘 (DONE — code complete, lint/build PASS, pending migrate)

Goal: a customer buys a HONJAYA-branded gift certificate at the bar and sends it to someone (카톡 링크 / 문자).
The recipient shows the code; staff redeems it at the tablet payment screen.

### Rules (proposed defaults)

- **Code-based, not member-bound**: whoever holds the code redeems it. Buyer/recipient are metadata only.
- **Single use, one shot**: the whole face value is consumed at once, no partial balance (that is what 선불권 is for).
  When the face value exceeds the bill, the remainder is forfeited — the UI must warn before redeeming.
- Two kinds, one table: `ITEM` (menu exchange; face value = menu price snapshot at issue) and `AMOUNT` (금액권).
- Usable immediately (no next-visit rule) until `expires_at`; expiry lazy like points.
- Redemption uses payment method `GIFT_CERT` (distinct from the legacy external `GIFT_CARD`).
- Delivery: (1) copy link for 카톡, (2) 문자 via `messaging.js#sendOne` (Solapi / dryrun), (3) staff reads the code.
- Public card page `/gift/:code` — no login; codes are random 10-char tokens; response is minimal
  (name, face value, theme, message, recipient name, expiry, status) and rate limited against enumeration.
- Sale recorded at issue time (`price_paid`), revenue recognised at redemption.

### Schema — `server/sql/gifts.sql`

- `gift_products` (templates): `id`, `name`, `kind` (`ITEM` / `AMOUNT`), `product_id`, `product_name`,
  `face_value`, `price`, `validity_days` (0 = 무제한, default 90), `min_payment_amount`,
  `theme` (`SOLO_NIGHT` / `CHEERS` / `BIRTHDAY` / `THANKS`), `message_max_length` (default 100),
  `is_active`, `sort_order`, `memo`.
- `gift_certificates`: `id`, `code` (unique), `gift_product_id`, snapshots (`product_name`, `kind`, `face_value`,
  `theme`), `status` (`ACTIVE` / `USED` / `EXPIRED` / `VOID`), `price_paid`, `payment_method`, `buyer_customer_id`,
  `buyer_name`, `buyer_phone`, `recipient_name`, `recipient_phone`, `message`, `purchased_at`, `business_date`,
  `expires_at`, `used_at`, `used_order_sheet_id`, `used_payment_id`, `forfeited_amount`,
  `redeemed_by_employee_id/name`, `sent_at`, `sent_channel`, `voided_at`, `voided_reason`,
  `sold_by_employee_id/name`.
- Registered in `apply-schema.mjs` after `prepaid.sql`.

### Backend

- `server/src/gifts.js` — `listGiftProducts` / product CRUD (`createGiftProduct`, `updateGiftProduct`), `issueGift`
  (code generation `G-XXXXXXXX` with collision retry), `lookupGiftCode`, `lookupPublicGift`, `listGifts`,
  `listCustomerGifts`, `giftSummary`, `sendGiftMessage`, `resendGift`, `voidGift`, `expireDueGifts` (lazy),
  `readGiftForPayment` / `applyGiftUse` / `restoreGiftForRefund` (payment layer).
- `server/src/routes/api/gifts.js` — staff: `GET|POST /api/gifts/products`, `POST /api/gifts/products/:productId`,
  `POST /api/gifts`, `GET /api/gifts/lookup`, `GET /api/gifts`, `GET /api/gifts/customer/:customerId`,
  `GET /api/gifts/summary`, `POST /api/gifts/:giftId/resend`, `POST /api/gifts/:giftId/void`;
  public: `GET /api/public/gifts/:code` (staff cookie 없이, 전역 API key만).
- `server/src/payments.js` — `giftCode`를 entry에 받아 트랜잭션 안에서 검증 후 `USED` 처리, 중복 코드 거부,
  부분 환불 시 복원하지 않고 전액 환불 + 미만료일 때만 `ACTIVE` 복원.
- Audit actions: `gift.issue` / `gift.resend` / `gift.void`.

### Permissions

- `gift.view` — MANAGER default; `gift.issue` — STAFF default (sell + redeem); `gift.manage` — OWNER (templates, void).

### Frontend

- `src/lib/gifts.js` — API helper + theme/label constants + `normalizeGiftCodeInput`, `computeGiftUsable`.
- `src/components/tablet/GiftSellModal.vue` — 발급 모달 (상품 선택 / 받는 분 / 메시지 / 결제수단 / 문자 발송 / 발급 완료 + 링크 복사·재발송).
  (`GiftPanel.vue` was replaced by this modal + the payment-split GIFT_CERT row.)
- `TabletAdminView.vue` — 헤더 `기프티콘 판매` 버튼, 결제 분할 `+ 기프티콘 추가` 행(코드 입력 → 확인 → 액면/차액 경고),
  결제 수단 `혼자야 기프티콘`, `GIFT_CERT`는 적립 대상에서 제외.
- `src/views/Admin/AdminGiftView.vue` — 상품 설정 CRUD + 발급 내역(조회/링크 복사/재발송/취소) + 요약 카드.
- `src/views/User/GiftCardView.vue` — `/gift/:code` 공개 카드 페이지 (테마 배경, 큰 코드, 상태/유효기간, 코드 복사).
- `AdminCustomerView.vue` — 구매한 기프티콘 목록 (`gift.view` 필요).
- `AdminLayout.vue` + `router/index.js` — `/admin/gifts` (permission `gift.view`), `/gift/:code` public route.
- `src/lib/orderSheet.js` — `completeOrderSheetPayment` entries에 `prepaidPassId` / `giftCode` 전달
  (P10 선불권 결제가 서버에서 거부되던 버그도 함께 수정).

### Verification

- `pnpm lint` PASS (auto-fix 후 재실행 → No lint errors found)
- `pnpm build` PASS (36 s, 기존 bundle-size 경고 3건만)
- `node --check` PASS (`gifts.js`, `routes/api/gifts.js`, `payments.js`, `config.js`, `permissions.js`, `app.js`)
- smoke P11 블록은 아직 없음 (`p11-gift-smoke` todo). 실 DB 검증은 배포 후 `migrate` 실행 뒤에 가능합니다.

### Deploy status

- 코드 커밋 완료(`3fb2981`). **서버 마이그레이션은 아직 실행하지 않았습니다.**
  호스트에서 `bash deploy/backup-db.sh` → `docker compose run --rm --build migrate` → `docker compose up -d --build api` 순서로 적용해야
  `gift_products` / `gift_certificates` / `payment_method` 컬럼이 생깁니다. 그 뒤 Vercel redeploy.

### Deploy checklist

1. `deploy/backup-db.sh`
2. `docker compose run --rm --build migrate` — applies `gifts.sql`
3. `docker compose up -d --build api`
4. Vercel redeploy

---

## 3-13. P12 — Discord 통합 관리 시스템 (IN PROGRESS)

Source: ChatGPT-authored spec ("혼자야 Discord 통합 관리 시스템", 16 sections) + owner direction
(2026-11-23): *"이 봇은 서버에 관한 전체적인 관리를 대신 해주기 위해 만들려는 거야. 그냥 그 디스코드 내에
모든 항목에 대해서 관리가 가능하게 해야 해."*

**The first-draft MVP cut is reverted.** Structure editor, permission matrix, moderation and the apply
engine are all back in scope. What remains rejected is only what is technically wrong for this codebase
(Nuxt, Redis, microservices, second DB). Status: **plan only, no code written.**

### A. Clarification — bot app vs Discord OAuth2

| Item | Needed? | Note |
| --- | --- | --- |
| Developer Portal **Application** (client id + secret) | **Yes** | Every bot is an application; this is the container. |
| **Bot** tab → reset/copy **Bot Token** | **Yes** | The *only* runtime credential the bot needs. |
| **OAuth2 login flow** (`/oauth2/authorize` → `code` → token exchange) | **No** | Not required to create or run a bot. The spec's OAuth2 section is a *separate* feature: "log in to the web admin with a Discord account". Moved to **P12F (optional)**. |
| Privileged intent **GUILD_MEMBERS** | **Yes** | Required by `GET /guilds/{id}/members` (member list + moderation). Must be toggled ON in the portal — sending it unapproved closes the gateway with **`4014`**. A 1-guild app needs no verification/approval. |
| Privileged intent **MESSAGE_CONTENT** | **No** | We post/edit/delete our own messages; we never read other people's message text. Skipping it avoids the gated-intent approval path. |
| `GUILD_PRESENCES` | **No** | Not used. |

So: **creating the bot app in the portal is required; the OAuth2 authorize/login flow is not.** If we later
want "Discord로 관리자 로그인", it uses the same application's OAuth2 credentials — nothing has to be
created twice. Design for that option: add `employees.discord_user_id`, verify guild membership +
`ManageGuild` via `GET /users/@me/guilds`, then still issue **our own** session cookie. Permission checks
stay in `server/src/auth/permissions.js` — Discord OAuth2 is only an authentication method, never an
authorization source. A password login must always remain as a fallback (Discord outage ≠ locked out).

### B. Capability matrix — what "manage everything" covers

| # | Resource | Operations | Discord endpoint | Bot permission | Phase |
| --- | --- | --- | --- | --- | --- |
| 1 | Server settings | name, icon/banner, description, verification level, content filter, system/AFK channel, notifications default, locale | `PATCH /guilds/{id}` | MANAGE_GUILD | P12E |
| 2 | Category / channel | create, edit (name, topic, nsfw, slowmode, bitrate, user limit, archive duration, type), delete, reorder, re-parent | `POST/PATCH/DELETE /guilds/{id}/channels`, `PATCH /guilds/{id}/channels` (bulk position) | MANAGE_CHANNELS | P12E |
| 3 | Channel permission overwrites | add/edit/remove per role & per member; 3-state (inherit / allow / deny) | `PUT/DELETE /channels/{id}/permissions/{overwrite_id}` | MANAGE_ROLES | P12E |
| 4 | Roles | create, edit (name, color, hoist, mentionable, icon), **permission bitfield**, position, delete | `POST/PATCH/DELETE /guilds/{id}/roles`, `PATCH /guilds/{id}/roles` (bulk position) | MANAGE_ROLES | P12E |
| 5 | Members | nickname, role add/remove, timeout (`communication_disabled_until`), kick, ban, unban, ban list, voice move/mute/deafen/disconnect | `PATCH /guilds/{id}/members/{user}`, `.../roles/{role}`, `PUT/DELETE /guilds/{id}/bans/{user}`, `PATCH /guilds/{id}/members/{user}` (channel_id) | MANAGE_NICKNAMES, MANAGE_ROLES, MODERATE_MEMBERS, KICK_MEMBERS, BAN_MEMBERS, MOVE/MUTE/DEAFEN_MEMBERS | P12D |
| 6 | Messages | send (embed builder), edit, delete, bulk delete 2–100, pin/unpin | `POST/PATCH/DELETE /channels/{id}/messages/*`, `PUT /channels/{id}/pins/{msg}` | MANAGE_MESSAGES | P12D |
| 7 | Threads | create, archive, lock, add/remove member | `POST /channels/{id}/threads`, `PATCH /channels/{id}` | MANAGE_THREADS | P12D |
| 8 | Invites | create (max_age/max_uses/temporary), list, revoke | `POST/GET/DELETE /channels/{id}/invites`, `/invites/{code}` | CREATE_INSTANT_INVITE, MANAGE_GUILD | P12D |
| 9 | Audit log | read + filter by action/user, paginated | `GET /guilds/{id}/audit-logs` | VIEW_AUDIT_LOG | P12C |
| 10 | Emoji / sticker / soundboard | list, upload, rename, delete | `/guilds/{id}/emojis`, `/stickers`, `/soundboard-sounds` | MANAGE_GUILD_EXPRESSIONS | P12F |
| 11 | Webhooks | create, edit, delete, execute (our API → Discord alerts) | `/channels/{id}/webhooks`, `/webhooks/{id}` | MANAGE_WEBHOOKS | P12F |
| 12 | AutoMod | rule create/edit/delete (keyword, mention spam, profanity), actions block/alert/timeout | `/guilds/{id}/auto-moderation/rules` | MANAGE_GUILD | P12F |
| 13 | Scheduled events | create/edit/delete, member list | `/guilds/{id}/scheduled-events` | MANAGE_EVENTS | P12F |
| 14 | Guild template | export current structure as a template (structure backup) | `POST /guilds/{id}/templates` | MANAGE_GUILD | P12C |

Priority is value-first: everything in #1–#9 ships in P12C–P12E; #10–#13 are routine additions in P12F.

### C. Architecture — bot owns the token, nothing else does

```mermaid
flowchart TB
  OWNER[사장님 · 직원] -->|HTTPS| V[Vercel /admin/discord]
  V -->|"/api/discord/*"| API
  subgraph host["자체 서버 · docker compose"]
    API["api (Fastify)<br/>staff cookie + permission"]
    BOT["bot (Fastify + discord.js)<br/>DISCORD_BOT_TOKEN"]
    DB[(postgres 16)]
    VOL[(/backups)]
    API -->|"x-internal-token<br/>http://bot:4100"| BOT
    API --> DB
    BOT --> DB
    BOT --> VOL
  end
  BOT <-->|gateway + REST| D[DISCORD]
  BOT -->|암호화 백업 업로드| CH[#시스템-백업]
```

- **bot** = new compose service (`server/bot/`), `node:22-alpine` + `postgresql-client`. Holds the only copy of
  `DISCORD_BOT_TOKEN`. Listens on `bot:4100` **inside the compose network only — no published port, no
  Vercel rewrite, no Cloudflare route**. Dies independently of ordering.
- **api** = keeps staff auth and becomes the authenticated proxy: `/api/discord/*` → verify session +
  permission → forward to `http://bot:4100` with `x-internal-token: BOT_INTERNAL_TOKEN`. The api container
  never receives the bot token.
- **DB** = one Postgres. All Discord writes go through `discord_jobs` with **concurrency 1 per guild**, so
  rate limits are respected by construction and every operation is resumable.
- **No Redis, no Nuxt, no second DB.**

### D. Apply engine — the core of "manage everything"

Editing Discord *is* the risky part; the design exists to make it boring.

1. **Draft, not live.** The web editor mutates a `discord_struct_docs` row (desired state JSONB), never Discord.
2. **Preview.** `POST /api/discord/apply/preview` fetches live state, computes a 3-way diff
   (desired / actual / last-synced) and returns an ordered operation list with human labels, e.g.
   `역할 생성 · "단골"`, `채널 이동 · #공지 → 카테고리 정보`, `권한 변경 · @직원 #주문 (+ViewChannel)`.
   Destructive ops are flagged `DESTRUCTIVE`.
3. **Approve.** `POST /api/discord/apply` requires `discord.manage` + explicit confirmation; destructive ops
   require typing the target name.
4. **Pre-snapshot.** A full structure snapshot is captured automatically before the first op.
5. **Execution order** (fixed — order matters):
   `roles:create → roles:patch → roles:position(bottom-up) → categories:create → channels:create(children
   after parents) → channels:position/parent(batch) → overwrites → renames(batched, last) → deletes`.
6. **Isolation.** One `discord_jobs` row per op, `discord_apply_runs` as the parent. Each op stores
   `before`/`after`, HTTP status, Discord error code. A failure **stops the run** (`403` = permission
   problem — never keep hammering), while `429` waits `retry_after` and retries.
7. **Rollback.** Inverse ops generated from the pre-snapshot; only for the most recent run; requires
   `discord.manage`; warns that manual edits made in between will be lost.
8. **Guardrails — hard-coded rejects:**
   - delete guild / transfer ownership / leave guild
   - delete or edit the `@everyone` role's identity (permissions editable only via the matrix, with a warning)
   - create/edit/move a role **at or above** the bot's highest role (Discord will `403`; we refuse locally)
   - kick/ban the guild owner, or the bot itself
   - grant `Administrator` without an explicit extra confirmation
   - more than `MAX_OPS_PER_RUN` (default 60) in one run
9. **Permission pre-check.** Before each call we compute the bot's effective permission for the target and
   skip+report if it will fail. This matters: Discord blocks an IP for **10,000 invalid requests per 10
   minutes** (`401`/`403`/`429`), so "try and see" is not an option
   (https://docs.discord.com/developers/topics/rate-limits.md).

### E. Data model (`server/sql/discord.sql`, applied last in `scripts/apply-schema.mjs`)

| Table | Key columns | Purpose |
| --- | --- | --- |
| `discord_guilds` | `id text pk` (snowflake), `name`, `owner_user_id`, `bot_role_id`, `joined_at` | the single managed guild |
| `discord_settings` | `id int pk check (id = 1)`, `backup_channel_id`, `announce_channel_id`, `owner_discord_id`, `backup_cron`, `keep_daily/weekly/monthly`, `max_upload_mb`, `max_ops_per_run`, `next_backup_at` | bot config, editable in the admin page |
| `discord_snapshots` | `id uuid pk`, `guild_id`, `captured_at`, `structure jsonb`, `structure_hash text`, `channel_count`, `role_count`, `member_count`, `reason` (`MANUAL`/`PRE_APPLY`/`SCHEDULED`) | full guild state; diffing two blobs in JS, no child tables |
| `discord_struct_docs` | `id uuid pk`, `guild_id`, `version int`, `desired jsonb`, `note`, `updated_by`, `updated_at` | draft desired state |
| `discord_apply_runs` | `id uuid pk`, `guild_id`, `doc_version`, `status`, `op_total`, `op_ok`, `op_failed`, `pre_snapshot_id`, `started_at`, `finished_at`, `rollback_of`, `error` | one apply attempt |
| `discord_apply_ops` | `id uuid pk`, `run_id fk`, `seq`, `op`, `target_type`, `target_id`, `before jsonb`, `after jsonb`, `status`, `http_status`, `discord_code`, `error` | per-operation audit trail |
| `discord_jobs` | `id uuid pk`, `kind`, `payload jsonb`, `status` (QUEUED/RUNNING/SUCCEEDED/FAILED), `attempts`, `max_attempts`, `run_after`, `last_error`, `result jsonb` | queue: apply_op, upload, announce, dm, snapshot |
| `discord_messages` | `id uuid pk`, `channel_id`, `message_id text`, `kind`, `embed jsonb`, `created_by`, `deleted_at` | posted announcements |
| `discord_mod_actions` | `id uuid pk`, `target_user_id text`, `action` (TIMEOUT/KICK/BAN/UNBAN/NICK/ROLE), `reason`, `expires_at`, `actor_employee_id`, `created_at` | moderation history (Discord's audit log also kept as source of truth) |
| `backup_runs` | `id uuid pk`, `kind`, `status`, `started_at`, `finished_at`, `size_bytes`, `sha256`, `key_id`, `encrypted`, `part_count`, `local_path`, `app_version`, `app_commit`, `row_counts jsonb`, `error` | one row per dump |
| `backup_files` | `id uuid pk`, `run_id fk`, `part_no`, `part_count`, `filename`, `size_bytes`, `sha256`, `discord_channel_id`, `discord_message_id`, `upload_status`, `uploaded_at`, `error` | split parts + upload state |
| `backup_restores` | `id uuid pk`, `run_id fk`, `mode` (VERIFY/PROD), `target_db`, `status`, `verification jsonb`, `started_at`, `finished_at`, `error` | verification / restore history |

- Indexes: `discord_jobs(status, run_after)`, `discord_snapshots(guild_id, captured_at desc)`,
  `discord_apply_ops(run_id, seq)`, `backup_runs(finished_at desc)`, `backup_files(run_id)`.
- Snowflakes stay **`text`** — never `bigint`/number (JS precision).
- **None of these tables go into `server/src/tables.js`** (the `/rest/v1` allowlist).
- Admin actions reuse `admin_audit_logs` (`action = 'discord.apply'`, `discord.backup.run`, …). Bot-initiated
  rows use `employee_id = null`, `employee_name = 'discord:bot'`. No duplicate audit table.

### F. API surface (`/api/discord/*` — covered by the existing `/api/(.*)` Vercel rewrite)

| Endpoint | Permission | Purpose |
| --- | --- | --- |
| `GET /api/discord/status` | `discord.view` | bot online, gateway latency, queue depth, rate-limit headroom |
| `GET /api/discord/guild` | `discord.view` | server settings (edit fields prefilled) |
| `PATCH /api/discord/guild` | `discord.manage` | update server settings |
| `GET /api/discord/channels` | `discord.view` | categories + channels tree with overwrites |
| `POST/PATCH/DELETE /api/discord/channels[/:id]` | `discord.manage` | channel CRUD (draft-based) |
| `GET/PUT/DELETE /api/discord/channels/:id/permissions/:overwriteId` | `discord.manage` | overwrites |
| `GET /api/discord/roles` | `discord.view` | roles + permission bitfields decoded to names |
| `POST/PATCH/DELETE /api/discord/roles[/:id]` | `discord.manage` | role CRUD |
| `GET /api/discord/members?query=&role=` | `discord.view` | member list (paginated) |
| `PATCH /api/discord/members/:userId` | `discord.member` / `discord.manage` | nickname, roles, timeout |
| `POST /api/discord/members/:userId/{kick,ban}` / `DELETE .../ban` | `discord.manage` | kick / ban / unban |
| `GET /api/discord/audit-logs` | `discord.view` | Discord audit log (paginated, filtered) |
| `POST /api/discord/messages` / `DELETE /api/discord/messages/:id` | `discord.manage` | 공지/메시지 |
| `GET/POST/DELETE /api/discord/invites` | `discord.manage` | invites |
| `GET /api/discord/structure` | `discord.view` | full live structure + hash + bot position + permission catalog + saved draft |
| `GET /api/discord/draft` | `discord.view` | latest saved draft (`{draft}` or `{draft:null}`) |
| `PUT`/`POST` `/api/discord/draft` | `discord.manage` | save draft (`{desired, note}`) — versions capped at 5 |
| `DELETE /api/discord/draft` | `discord.manage` | drop every draft version for the guild |
| `POST /api/discord/apply/preview` | `discord.view` | diff / execute plan (`{desired?}` → ops, blocked, warnings, conflicts, counts) |
| `POST /api/discord/apply` | `discord.manage` | run plan (`{desired?, confirmName, allowAdministrator, allowDangerous, allowDeletes}`) |
| `POST /api/discord/apply/:runId/rollback` | `discord.manage` | build inverse ops of a finished run and execute them |
| `GET /api/discord/apply/runs` | `discord.view` | apply history (`{total, limit, offset, runs}`) |
| `GET /api/discord/apply/runs/:runId` | `discord.view` | run + per-op rows |
| `GET /api/discord/snapshots` + `/diff` | `discord.view` | structure history + diff |
| `GET/POST /api/discord/backups`, `POST .../verify`, `GET .../download` | `discord.backup` | backups |
| `PATCH /api/discord/settings` | `discord.settings` | channels, cron, retention |

New permission codes in `server/src/auth/permissions.js`:

| Code | Default roles | Covers |
| --- | --- | --- |
| `discord.view` | OWNER, MANAGER, STAFF | read-only status, structure, members, audit log, backup list |
| `discord.member` | OWNER, MANAGER | nickname / role assign / timeout |
| `discord.manage` | OWNER | structure edit + apply, kick/ban, messages, invites, settings |
| `discord.backup` | OWNER | run backup, verify, download |

### G. Web admin UX (`/admin/discord`)

Tabs: **개요 · 채널 · 역할 · 멤버 · 공지 · 초대 · 감사로그 · 백업 · 설정**

> P12C ships the read-only subset: **개요 · 채널 · 역할 · 멤버 · 감사로그 · 백업 · 스냅샷**.
> P12D adds **공지 · 초대** plus inline member moderation. 설정 lands in P12F.

- 개요 — 봇 온라인/게이트웨이 지연, 큐 길이, 마지막 백업·마지막 스냅샷, 미해결 실패 작업.
- 채널 — 트리 + 드래그 재정렬 → **초안(draft)** 상태로 보관. 상단에 `미리보기` / `초안 버리기` / `적용`.
- 역할 — 목록 + 드래그 순서 + 권한 매트릭스(역할 × 권한). 위험 권한(`Administrator`, `Manage Guild`,
  `Manage Roles`, `Ban Members`, `Manage Webhooks`)은 붉게 강조하고 확인을 한 번 더 받습니다.
- 채널 권한 — 역할/멤버별 3-state(상속 / 허용 / 거부) 매트릭스, 카테고리 상속 표시.
- 멤버 — 검색 + 역할 필터, 역할 칩 토글, 닉네임 변경, 타임아웃(사유 필수), 강퇴/차단(이름 입력 확인).
- 감사로그 — Discord audit log를 그대로 읽어 표시(누가 무엇을 언제), 우리 `discord_apply_ops`와 나란히.
- 백업 — 이력/부품 상태/다운로드/검증. `지금 백업` 버튼.
- 파괴적 작업은 전부 **이름 입력 확인 + 사전 스냅샷 자동 생성**.

**Slash commands** (모바일에서 사장님이 쓰는 빠른 경로 — 전체 편집은 웹이 담당):

`/상태` · `/백업` · `/백업목록` · `/검증` · `/구조` · `/구조비교` · `/공지` · `/초대` · `/타임아웃` ·
`/역할` · `/감사로그` · `/봇설정`

Owner gate = `DISCORD_OWNER_USER_ID` **and** Discord's own `ManageGuild` check. Sensitive output is
ephemeral (`flags: 64`) or DM.

### H. Backup pipeline

1. **Dump** — `pg_dump -Fc -h db -U postgres -d honjaya` (same command the existing script uses) plus
   `row_counts` for `customers/orders/payments/points_*` so verification means something.
2. **Compress** — gzip stream.
3. **Encrypt** — Node `crypto` AES-256-GCM. Layout `HJBK1 | iv(12) | tag(16) | ciphertext`. Key =
   `BACKUP_ENCRYPTION_KEY` (32 bytes base64) **host `.env` only** — never in the DB, never in Discord, never
   in the browser bundle. A `key_id` column allows future rotation.
4. **Checksum** — SHA-256 of the encrypted file → `backup_runs.sha256`.
5. **Split** — if a part exceeds `max_upload_mb` (default **20**, the verified default limit; read
   `attachment_size_limit` when available instead of hardcoding) → `part-001-of-NNN` + per-part SHA-256.
6. **Upload** — fixed `backup_channel_id` (stored ID, never a name search). Message body: backup ID, 생성 시각,
   DB, 파일명, 크기, 압축/암호화 여부, SHA-256, 업로드 상태, 검증 결과. **Never** a password, key,
   connection string or env value.
7. **Failure** — an upload failure never fails the backup: local file stays, `upload_status='PENDING'`, retry
   job queued. A `413` re-splits with a smaller part size before retrying.
8. **Retention** — default daily 14 / weekly 8 / monthly 12 (local + Discord message pruning), configurable.
9. **Schedule** — `discord_settings.backup_cron` evaluated by the bot every minute against `next_backup_at`
   (restart-safe). `deploy/backup-db.sh` stays as the pre-deploy safety net; it is not replaced.

**Key custody:** if `BACKUP_ENCRYPTION_KEY` is lost, every uploaded backup is unrecoverable. One offline copy
(password manager / printed, stored off-site) is mandatory. The key is never uploaded next to the backup.

### I. Restore policy

- **Automated (P12B):** verify-restore into a scratch database `honjaya_verify` — download/decrypt →
  SHA-256 check → `pg_restore --list` sanity → restore into scratch → compare `row_counts` → report →
  drop scratch.
- **Production restore — never automated.** Runbook in `server/deploy/README.md`: maintenance mode → fresh
  encrypted backup → `docker compose stop api bot` → restore → `migrate` → health check → start. Owner
  confirmation required; prod overwrite is never a default action.

### J. Rate limits & safety budget

| Rule | Value | Source |
| --- | --- | --- |
| Global bot limit | **50 req/s** | https://docs.discord.com/developers/topics/rate-limits.md |
| Our pacing | ≤ 10 req/s, **1 write chain** per guild | design choice |
| Invalid-request ban threshold | **10,000 per 10 min** (`401`/`403`/`429` count) | same doc |
| Per-route buckets | keyed by `X-RateLimit-Bucket`, never hardcode | same doc |
| Upload size | 20 MiB default, higher with boost; read `attachment_size_limit` | https://docs.discord.com/developers/reference |
| Privileged intent | ON in portal or gateway closes with `4014` | https://docs.discord.com/developers/events/gateway |
| Unverified — measure in P12A | channel name/topic edits use a much stricter bucket; measure and batch behind a delay, report progress, keep the run resumable | — |

Bot role: a dedicated **혼자야 관리봇** role placed directly below the owner's top role, with an explicit
permission list (Manage Channels, Manage Roles, Manage Nicknames, Manage Messages, Manage Threads, Manage
Guild, Manage Webhooks, Manage Events, Manage Expressions, View Audit Log, Kick/Ban/Moderate Members,
Move/Mute/Deafen Members, Send Messages, Attach Files, Embed Links, Read History, Create Invite) —
**`Administrator` deliberately NOT granted**, so the token cannot delete the guild or transfer ownership.

### K. Risks

| Risk | Mitigation |
| --- | --- |
| Bot token = full guild control | Token only in the non-exposed `bot` container; api proxies with `x-internal-token`; rotate in the portal on suspicion. |
| Bad apply breaks the server | Draft → preview → approve, pre-snapshot, per-op logging, rollback from snapshot, `MAX_OPS_PER_RUN`. |
| 403 storms → temporary API ban | Local permission pre-check before every mutating call; stop the run on first `403`. |
| Channel rename bucket causes long waits | Renames batched last with visible progress; run is resumable. |
| Backup contains customer phone numbers | Mandatory AES-256-GCM + owner-only channel; plaintext upload is impossible by construction. |
| Key loss | Offline key copy + documented "backups unrecoverable" limit. |
| Discord outage | Ordering/POS unaffected (separate container, separate code path); admin page shows `봇 오프라인`. |
| Owner locks themselves out via role edit | Guardrail blocks edits to roles at/above the bot; `@everyone` identity immutable; password login stays available. |

### L. Phases

| Phase | Scope | Size | Depends on | Status |
| --- | --- | --- | --- | --- |
| **P12A** | Bot foundation: `bot` compose service, token isolation, internal API + api proxy + `BOT_INTERNAL_TOKEN`, `discord.sql`, gateway with GUILD_MEMBERS, `/상태`, job queue, snapshot capture, structured logging, graceful shutdown | M | Discord app + portal intents | **DONE (code) — 호스트 env + 배포 대기** |
| **P12B** | Encrypted backup pipeline + Discord upload + retention + retry queue + verify-restore to scratch DB | M | P12A | **DONE — 커밋 `aa3d831`** |
| **P12B-1** | 메인 서버 백업: 저장소 코드·설정을 tar.gz 로 묶어 같은 AES-256-GCM 파이프라인으로 암호화·분할·업로드. `kind='SERVER'` run 을 DB 백업과 분리(보존 정책·검증 대상도 종류별) | S | P12B | **DONE (code)** — 마이그레이션·배포 대기 |
| **P12C** | Read-only dashboard: `/admin/discord` 개요·채널 트리·역할·멤버·감사로그·스냅샷 diff·백업 이력 | M | P12B | **DONE — 커밋 `540bb39`** |
| **P12D** | Live editing (non-structure): members (nickname/roles/timeout/kick/ban), messages & 공지, threads, invites, voice move | M | P12C | **DONE — 커밋 `8988084`** |
| **P12E** | Structure editing + apply engine: 채널·카테고리·역할 CRUD, 순서 변경, 권한 편집, diff → 적용 → 롤백, 서버 설정 | L | P12D | **DONE — lint/build 통과, 커밋 `333dafa`** |
| **P12E-1** | 혼자야 기본 구조 프리셋: 서버 구조를 한 번에 채우는 원클릭 초안 생성(역할 4 · 카테고리 4 · 채널 14, 운영진 카테고리에 `#백업` 포함). 이름 매칭으로 멱등 · 추가 전용(기존 항목 수정/삭제 없음) | S | P12E | **DONE (code)** — lint/build 대기 |
| **P12F** | 자동화 & extras: webhook alerts (주문/예약 → Discord), AutoMod rules, scheduled events, emoji/sticker, reserved announcements; **optional** Discord OAuth2 web login | M | P12E | PLANNED |

S/M/L are relative effort, not calendar estimates. P12A+P12B is the part with immediate operational value;
P12E is the part with the highest risk and must not start before P12C/P12D are stable.

### M. Env additions (host `server/.env` only, never committed)

`DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`, `DISCORD_GUILD_ID`, `DISCORD_OWNER_USER_ID`,
`DISCORD_BACKUP_CHANNEL_ID`, `DISCORD_ANNOUNCE_CHANNEL_ID`, `BACKUP_ENCRYPTION_KEY`,
`BACKUP_DIR=/backups`, `DISCORD_MAX_UPLOAD_MB=20`, `BOT_INTERNAL_TOKEN`, `BOT_API_URL=http://bot:4100`.

### N. Out of scope

Multi-guild / managing other servers, Discord billing & boost management, bot marketplace distribution,
reading other members' message content (`MESSAGE_CONTENT`), and any operation that would delete the guild or
transfer ownership.

### O. P12A implementation notes (DONE)

Files created:

| Path | Role |
| --- | --- |
| `server/sql/discord.sql` | 12 tables (`discord_guilds`, `discord_settings` single row, `discord_snapshots`, `discord_struct_docs`, `discord_apply_runs`, `discord_apply_ops`, `discord_jobs`, `discord_messages`, `discord_mod_actions`, `backup_runs`, `backup_files`, `backup_restores`) |
| `server/bot/package.json` + `package-lock.json` | separate package; `discord.js ^14.28.1`, `pg ^8.23.1` |
| `server/bot/Dockerfile` | `node:22-alpine` + `postgresql-client` (pg_dump for P12B), `npm ci --omit=dev` |
| `server/bot/src/config.js` | manual `.env` loader (same pattern as `server/src/config.js`) + `configProblems()` |
| `server/bot/src/logger.js` | JSON-lines logger (`ts/level/service/msg`) |
| `server/bot/src/db.js` | pg pool factory |
| `server/bot/src/jobs.js` | `discord_jobs` queue (`FOR UPDATE SKIP LOCKED`), backoff `min(2^n*5, 300)`s, stale requeue, worker loop |
| `server/bot/src/structure.js` | `readStructure()` (roles/channels/emojis/stickers/AutoMod/events), `stableStringify`, `hashStructure`, `summarizeStructure` |
| `server/bot/src/snapshot.js` | `captureSnapshot()` + `SNAPSHOT` job handler |
| `server/bot/src/discordService.js` | gateway client (Guilds + GuildMembers only), ready hooks, `requireGuild()`, `describe()` |
| `server/bot/src/commands.js` | guild-scoped `/상태`, `/구조`, `/스냅샷`; owner gate = `DISCORD_OWNER_USER_ID` + `ManageGuild` |
| `server/bot/src/internalApi.js` | `node:http` internal API on `bot:4100`; `x-internal-token` (timing-safe) |
| `server/bot/src/index.js` | bootstrap, job worker, graceful shutdown |
| `server/bot/README.md` | portal setup (SERVER MEMBERS INTENT ON, no Administrator), env table, commands |
| `server/src/routes/api/discord.js` | `GET /api/discord/status`, `GET /api/discord/snapshots`, `GET /api/discord/snapshots/:id`, `POST /api/discord/snapshots` |

Files edited: `server/src/app.js` (register + endpoint list), `server/src/auth/permissions.js`
(`discord.view|member|manage|backup|settings` + labels + `discord` group), `server/src/config.js`
(`config.discord{botUrl,internalToken,timeoutMs}`), `server/scripts/apply-schema.mjs` (`discord.sql` last),
`server/docker-compose.yml` (`bot` service + `BOT_*` on api), `server/.env.example`, `server/.gitignore` (`backups/`).

Key behaviours decided during implementation:

- **Never crash on missing config.** No token → boot in unconfigured mode (`configured:false`, HTTP alive).
  No `BOT_INTERNAL_TOKEN` → every authenticated internal route answers `503` (never an open door).
- **`/internal/health` is the only unauthenticated route** and exposes only `ok/service/uptimeSec/configured/ready`.
- **Commands are guild-scoped** (`guild.commands.set`) so changes apply instantly; replies are always ephemeral.
- **Snapshots and the snapshot list are served differently on purpose**: `POST` needs the live gateway (→ bot),
  but list/detail read `discord_snapshots` straight from the DB so the admin page still works when the bot is down.
- **api never depends on bot** in compose; bot downtime only breaks `POST /api/discord/*`.
- Verified locally: full `applySchema` on an ephemeral embedded Postgres (12/12 tables, settings defaults
  20/14/8/12/60), snapshot insert, queue enqueue→claim→succeed, retry scheduling, dedupe, `depth()`,
  `discord_settings` single-row check constraint, internal API auth matrix (health 200 / no token 401 /
  bad token 401 / good token 200 / unknown route 404), and Fastify route registration for all 4 endpoints.

---

### P. P12B implementation notes (DONE)

Files created:

| Path | Role |
| --- | --- |
| `server/bot/src/backupFiles.js` | crypto/split primitives: `parseKey`, `generateKey`, `sha256File`, `encryptToFile` (gzip→AES-256-GCM), `decryptToDumpFile`, `splitFile`, `reassembleFiles`, `partFilename`, `byteCounter` |
| `server/bot/src/backup.js` | the engine (~1030 lines): `createBackupService({pool,log,service,queue})` → `ensureSchedule/getRun/listRuns/partPath/prune/runBackup/tick/uploadRun/verifyRun`; `registerBackupJobs()`; `pickRunIdsToKeep()` (GFS) |
| `server/bot/src/cron.js` | dependency-free 5-field cron (`parseCron`, `nextCronTime`, `isValidCron`); comma lists, ranges, steps, `sun`–`sat`, `7`=Sunday |
| `server/bot/scripts/decrypt-backup.mjs` | host-side operator CLI (`--out --key --dir --base --sha256 --keep`) |

Files edited: `server/bot/src/internalApi.js` (rewritten as a param router with 6 backup routes + streamed
download), `server/bot/src/index.js` (service wiring + scheduler interval + shutdown), `server/bot/src/commands.js`
(`/백업 /백업목록 /검증`, generalized `defer`), `server/bot/src/config.js` (`backup.*`),
`server/src/routes/api/discord.js` (`callBotStream` + 6 endpoints + `assertUuid`), `server/bot/Dockerfile`
(`COPY scripts`), `server/docker-compose.yml`, `server/.env.example`, `server/bot/README.md`,
`server/deploy/README.md` (§11-1, §11-2 restore runbook).

Key behaviours decided during implementation:

- **Dump → gzip → encrypt → split → record, then enqueue.** The `BACKUP` job never uploads. It writes
  `backup_runs`/`backup_files` and enqueues `BACKUP_UPLOAD` (maxAttempts 6) and `BACKUP_PRUNE` (maxAttempts 2)
  with `dedupe:true`. Upload failure therefore never loses a backup.
- **File layout** `HJBK1 | iv(12) | tag(16) | ciphertext` = `HEADER_BYTES 33`; the GCM tag is patched after
  streaming via `handle.write(tag, 0, 16, 17)`. Part naming `<filename>.part-001-of-004`.
- **Key only in the bot env.** `BACKUP_ENCRYPTION_KEY` (base64 or 64-char hex → 32 bytes) is never returned by
  any API, never written to the DB, never posted to Discord.
- **413 / discord.js `code 40005`** → re-split at `floor(partSize*0.8)` and throw so the job retries.
- **`verifyRun` refuses if `BACKUP_SCRATCH_DB` equals the live DB name.** Restore path is
  reassemble → sha256 → decrypt → `pg_restore --list` → dropdb/createdb → `pg_restore --exit-on-error` → row-count
  diff → drop scratch. Result JSON goes to `backup_restores.verification`. Requires `CREATEDB` on the `DATABASE_URL` role.
- **Scheduler**: `setInterval(tick, BACKUP_SCHEDULER_POLL_MS)` with `unref()` + re-entrancy guard, plus one
  immediate tick after `service.start()` so a restart doesn't skip a due backup. `next_backup_at` stored in `discord_settings`.
- Verified with a throwaway 56-check harness (then deleted) on an ephemeral embedded Postgres 18: cron parse/validate,
  key parse/reject, encrypt→split(4)→reassemble→decrypt byte-identical on 3.4 MB, `sizeBytes === gzip+33`,
  wrong-key GCM rejection, GFS keep set, full `applySchema`, real `backup_runs`/`backup_files` SQL, `getRun`/`listRuns`,
  `verifyRun` reaching pg_restore after sha256 match (recording FAILED + `verification.sha256Match=true`, temp dir cleaned),
  `prune` (rows + files), internal-API auth matrix + list/POST/verify/upload/download/404, and all 4 job handlers.
  All 8 api routes confirmed registered via Fastify.
- **Not verified here:** real `pg_dump`/`pg_restore`/`psql` execution (no client binaries on the Windows dev box)
  and `uploadRun` against a live Discord channel (no token). Must be smoke-tested on the host after deploy.

---

### Q. P12C implementation notes (DONE — code)

Files created:

| Path | Role |
| --- | --- |
| `server/bot/src/guildView.js` | bot-side read layer (~410 lines) that **consumes** `readStructure()` without changing its byte-stable output: `decodePermissions`, `permissionLabelKo`, `readGuildView(guild,log)` (guild meta + roles/channels/overwrites + emojis/stickers/automod/events), `listMembers`, `listAuditLogs`, Korean `PERMISSION_LABELS_KO` / `AUDIT_LABELS_KO`, `DANGEROUS` set |
| `server/src/discordDiff.js` | `diffStructures(before, after)` → `{same, totalChanges, guild[], roles/channels/emojis/stickers/autoModeration/scheduledEvents{added,removed,changed,counts}, channelKinds}` |
| `src/lib/discord.js` | label maps (`BACKUP_STATUS_LABELS`, `VERIFY_STATUS_LABELS`, `SNAPSHOT_REASON_LABELS`, `UPLOAD_STATUS_LABELS`, `CHANNEL_TYPE_LABELS`, `DIFF_FIELD_LABELS`), formatters (`formatDiscordDateTime`, `formatBytes`, `roleColorStyle`), ~14 API helpers, `downloadDiscordBackup` |
| `src/views/Admin/AdminDiscordView.vue` | 7-tab read-only dashboard (개요·채널·역할·멤버·감사로그·백업·스냅샷), reuses AdminGiftView's dark card CSS vocabulary |

Files edited: `server/bot/src/internalApi.js` (`GET /internal/guild`, `/internal/members`,
`/internal/audit-logs` + `guildOr503()`), `server/src/routes/api/discord.js` (4 read routes:
`/guild`, `/members`, `/audit-logs`, `/snapshots/:snapshotId/diff`, plus a `requireBackup` guard),
`src/lib/api.js` (`apiBlob()`), `src/router/index.js` (`/admin/discord`, `meta.permission = "discord.view"`),
`src/layouts/AdminLayout.vue` (`Discord 관리` menu entry).

Key behaviours decided during implementation:

- **View layer is strictly additive.** `readStructure()` output is SHA-256 hashed into
  `discord_snapshots.structure_hash`, so enrichment (member counts, permission labels, parent names,
  overwrite kinds) lives in `guildView.js` and is only used by the dashboard routes.
- **Diff runs server-side.** `/snapshots/:snapshotId/diff` loads two `structure` JSONB docs by
  `captured_at` (default base = previous snapshot) and returns only the diff, so the browser never
  receives two full structure documents.
- **`apiBlob()` instead of `<a href>`** for backup download: the global apikey guard rejects plain
  navigations, so the download goes through `fetch` with the `apikey` header + `credentials:"include"`,
  then creates an object URL for the anchor click (revoked after 2 s).
- **Guard alignment:** backup mutating routes now use `discord.backup` (§3-13 F), snapshots use
  `discord.manage`, and all read routes use `discord.view`. All three are OWNER/MANAGER/STAFF-appropriate
  and were changed before P12B ever shipped, so there is no compatibility risk.
- Members list and audit log are loaded **lazily** on tab activation (they are the two Discord endpoints
  with real rate-limit cost); status/snapshots/backups load on mount.
- Verified with a throwaway harness (then deleted): Vue SFC compile (`vue/compiler-sfc` parse →
  compileScript → compileTemplate) on the new view, `node --check` on 5 JS files, `diffStructures`
  unit probe, `decodePermissions('8')` → `['Administrator']` + 41 flags decoded, `guildView`
  Korean label resolution, bot internal-API live smoke test on a random port (`/internal/health` 200
  without token; `/internal/guild|members|audit-logs` 503 with Korean message when the guild is
  unavailable; 401 without token), real embedded-Postgres run of the snapshot diff SQL
  (two snapshots → guild name changed + role changed + channel removed), and Fastify's route tree
  confirming all 6 `/api/discord/*` groups registered.
- **Not verified here:** the three new bot endpoints have never run against a live Discord gateway
  (no token on the dev box), so response shapes were validated against `guildView.js` source and a
  fake-guild 503 path only. Must be smoke-tested on the host after deploy.

---

### R. P12D implementation notes (DONE — code)

Three layers, all additive — no migration needed (`discord_mod_actions` / `discord_messages` already
shipped in P12A's `server/sql/discord.sql`).

| Path | Role |
| --- | --- |
| `server/bot/src/discordErrors.js` | **NEW.** `opError()` + `toKoreanDiscordError()` — maps 11 Discord JSON error codes to Korean messages and HTTP status (`403` when `httpStatus===403` **or** code ∈ `{50013,50001}`; `404` when `httpStatus===404` **or** code ∈ `{10007,10008,10013,10014}`; `429`; `>=500 → 502`; unknown → `502`) |
| `server/bot/src/memberOps.js` | **NEW** (~394 lines). `updateMember`, `timeoutMember`, `clearTimeout`, `kickMember`, `banMember`, `unbanMember`, `moveMemberVoice`, `recordModAction`, `assertConfirmName`, `MAX_TIMEOUT_MINUTES`. Enforces role hierarchy (`assertCanActOn`), assignable-role check (`assertRoleAssignable`), bot permission check (`requireBotPermission`) and snowflake validation **in the bot**, not the api |
| `server/bot/src/publishOps.js` | **NEW** (~388 lines). `sendMessage`, `deleteMessage`, `listThreads`, `createThread`, `archiveThread`, `listInvites`, `createInvite`, `deleteInvite`, `recordMessage` |
| `server/bot/src/guildView.js` | `memberToPlain` is now `export function` so the member routes reuse the dashboard shape |
| `server/bot/src/internalApi.js` | 15 new internal routes under `/internal/members/*`, `/internal/messages`, `/internal/threads*`, `/internal/invites*`; `actorFields()` casts `actorEmployeeId` to UUID |
| `server/src/routes/api/discord.js` | 17 proxy routes + `requireMember` guard, `assertSnowflake()`, `actorPayload()`, `reasonText()`, `auditAction()` |
| `src/lib/discord.js` | `MOD_ACTION_LABELS` (8 keys, matches the SQL CHECK), `MESSAGE_KIND_LABELS`, `getModActionLabel`, `getMessageKindLabel` + 17 API helpers |
| `src/views/Admin/AdminDiscordView.vue` | 멤버 탭 관리 패널, 신규 **공지**·**초대** 탭, 관련 SCSS |

Key behaviours decided during implementation:

- **Discord rules stay in the bot.** The api only checks staff permissions; hierarchy, owner
  protection, role assignability and name confirmation live next to the Discord client. The api is a
  pure proxy and cannot be tricked into a privilege escalation that the bot would reject anyway.
- **`discord_mod_actions.action` has no slot for voice/thread/invite actions** (CHECK allows only
  `TIMEOUT, TIMEOUT_CLEAR, KICK, BAN, UNBAN, NICK, ROLE_ADD, ROLE_REMOVE`). So voice moves, thread
  create/archive and invite create/delete are recorded **only** in `admin_audit_logs`
  (`discord.member.voice`, `discord.thread.*`, `discord.invite.*`). This is a deliberate deviation
  from §G.
- **No auto-snapshot before member actions.** §G promised a pre-action snapshot for destructive edits,
  but member actions never touch guild structure, so a snapshot would add nothing. Structure-affecting
  changes in P12E will still snapshot first.
- **Guard split:** `discord.view` → member history, message list, thread list; `discord.member` →
  PATCH member, timeout apply/clear; `discord.manage` → kick/ban/unban/voice, message send/delete,
  invite list/create/delete (invite listing is `discord.manage` because Discord's
  `GET /invites` needs Manage Guild).
- **Lazy tabs:** 공지 and 초대 load on first tab activation; 초대 is skipped entirely when the
  employee lacks `discord.manage` (no pointless 403 toast).
- Verified with throwaway harnesses (then deleted): `node --check` on 6 files; bot internal-API smoke
  on port 4199 — all 18 route hits non-404 and all 3 unauthenticated probes 401; Fastify `onRoute`
  hook — 45 routes registered, all 17 P12D routes present with the expected guards; Vue SFC compile
  (`parse` → `compileScript` → `compileTemplate`) with 170 script bindings and 407 template
  expressions, zero unresolved identifiers; the `scss` block compiles through `sass`; all 37
  `@/lib/discord` imports resolve to real exports.
- **Not verified here:** nothing has run against a live Discord gateway (no bot token on the dev
  box). Response shapes were validated against `memberOps.js` / `publishOps.js` source. Must be
  smoke-tested on the host after deploy.

### S. P12E implementation notes (DONE — lint/build 통과, 커밋 `333dafa`)

The apply engine is **draft → preview → apply → rollback**, not per-resource CRUD endpoints. The
browser holds one editable `desired` document, the server diffs it against the live guild and turns
the diff into an ordered op list.

| Path | Role |
| --- | --- |
| `server/src/discordApply.js` | **NEW** (~1300 lines, pure). `normalizeDesired()` validates the draft; `planApply()` produces `{ops, blocked, warnings, conflicts, requiresAdministratorConfirm, dangerousOverwrite, requiresDeleteConfirm, counts}`; `buildRollbackOps()` builds the inverse plan; `resolveTempIds()` rewrites `new:*` ids to real ones |
| `server/src/discordRunner.js` | **NEW** (~640 lines). `readLiveStructure`, `loadDraft`/`saveDraft`/`clearDraft` (5 versions), `buildPlan`, `captureSnapshot`, `insertRun`/`insertOps`, `runOps`, `executeApply`, `loadRun`, `rollbackRun`, `listRuns`, `markStaleRuns` |
| `server/bot/src/structOps.js` | **NEW.** The only place that mutates Discord. 11 op handlers + guardrails (`assertRoleWritable`, `botTopPosition`, `requireChannel`, `overwriteTypeOf`) |
| `server/bot/src/structure.js` | `NON_STRUCTURE_CHANNEL_TYPES` filter in `readStructure()` — see gotcha below |
| `server/bot/src/guildView.js` | `permissionCatalog()` (~53 permissions, memoized) served through `/internal/permissions` |
| `server/bot/src/internalApi.js` | `GET /internal/permissions`, `POST /internal/struct/op`, `PATCH /internal/guild` |
| `server/src/routes/api/discord.js` | the 10 P12E endpoints listed in §F |
| `src/lib/discord.js` | label maps for ops/phases/statuses/blocked reasons, temp-id helpers, `decodePermissionNames`/`encodePermissionNames`, `desiredFromStructure()` (live → draft), 11 API helpers |
| `src/components/admin/DiscordStructureEditor.vue` | **NEW.** 5 sub-tabs (역할 / 채널 / 서버 설정 / 미리보기 / 적용 이력) mounted from the `구조 편집` tab of `AdminDiscordView.vue` |

Key behaviours decided during implementation:

- **Ops run inline, not through `discord_jobs`.** This deviates from §D.6. The job queue is for
  background work with retry; an apply is a foreground transaction whose result the admin must see
  immediately, and `runOps` stops at the first failure (remaining ops are `SKIPPED`) so a retry would
  need the whole plan rebuilt anyway. The queue stays for backups (P12B) and scheduled jobs.
- **Threads and directory channels are excluded from `readStructure()`.** Discord returns
  `PublicThread` / `PrivateThread` / `AnnouncementThread` / `GuildDirectory` in the same cache.
  Snapshots, diffs and drafts must only contain real structure — otherwise seeding a draft from live
  throws `지원하지 않는 채널 종류예요`, and a "delete what is not in the draft" plan would target
  conversation threads. The dashboard channel tab inherits the same filtering.
- **Managed (bot-owned) roles stay in the draft.** Dropping them makes `planApply` treat them as
  delete candidates → `ROLE_MANAGED` blocked entry → apply impossible. They are rendered read-only
  in the editor instead.
- **Null numeric guild settings mean "leave unchanged".** `normalizeGuild` skips `null`, so the
  frontend may send `verificationLevel: null` for values the bot did not report.
- **Temp ids.** The browser mints `new:role-<uuid>` / `new:channel-<uuid>`. Roles are created before
  channels; `resolveTempIds()` rewrites `targetId`, `payload.parentId`, `payload.overwriteId` and
  `payload.permissionOverwrites[].id` from `tempMap`.
- **Guard flags are explicit.** `allowAdministrator` (any `Administrator` bit delta),
  `allowDangerous` (dangerous permission added by a channel overwrite) and `allowDeletes`
  (`counts.destructive > 0`) are separate booleans; `confirmName` must equal the live guild name. All
  guards fire before anything executes.
- **Deletion semantics.** Anything live that is absent from the draft is a delete candidate;
  `@everyone`, managed roles and the protected channels (`backup_channel_id`, `announce_channel_id`,
  `log_channel_id`) are blocked instead.
- **Rollback limits.** Recreated channels/roles get new snowflakes and lose member role assignments.
  Rollback refuses `RUNNING` runs, runs that are themselves a rollback, and runs already rolled back;
  the original is marked `ROLLED_BACK` only when 0 ops fail.
- **Post-apply snapshot uses `reason='MANUAL'` with `created_by='discord:apply'`** because the
  `discord_snapshots.reason` CHECK has no `POST_APPLY`. This snapshot becomes the 3-way "last synced"
  baseline for the conflicts warning.
- **P12E-1 혼자야 기본 구조 프리셋** (`buildHonjayaPreset()` in `src/lib/discord.js`, button + confirm
  modal in `DiscordStructureEditor.vue`). Frontend-only: it fills the *draft* (roles 4 / categories 4 /
  channels 14, including `#백업` under 운영진), then reuses `preview`/`apply` unchanged — no new
  endpoint, no new op type.
  Additive and idempotent: existing roles/channels are matched by normalized name + alias list
  (emoji/punctuation stripped), never renamed, re-permissioned or deleted, so a second run creates 0
  ops. New roles are positioned under the bot role (`botHighestPosition - 1 - index`) and are skipped
  when the position is unknown. `Administrator` is deliberately not granted (`allowAdministrator` would
  otherwise be required). Baseline plan on a clean guild: 26 ops, 0 destructive, 0 blocked
  (cap is 60). Live validation still must go through `미리보기`.
- **구조 편집 다중 선택 삭제** — the 역할/채널 subtabs now carry a per-row checkbox
  (`selectedRoleIds` / `selectedChannelIds`) plus a panel-level `전체 선택` and a
  `선택 삭제 (N)` button that loops the existing `removeRole()` / `removeChannel()` calls, so
  deletions still land in the `삭제 예정` box as restorable chips and nothing is applied until
  `미리보기` → `적용`. `@everyone` and bot-managed roles get no checkbox (same rule as the old
  per-row `삭제`). Protected (백업/공지) channels stay selectable here; the server still blocks
  them at preview time (`PROTECTED_CHANNEL`).
- **P12B-1 서버(코드·설정) 백업** — `runServerBackup()` in `server/bot/src/backup.js` +
  `server/bot/src/serverBundle.js`. The `BACKUP` job enqueues a separate `BACKUP_SERVER` job
  between the DB upload and prune (single sequential worker ⇒ order is guaranteed), so a failing
  or missing source dir can never fail the DB backup. The bundle is `tar -czf` over an explicit
  file list, with a blocklist applied *before* tar: `.env`/`.env.*` (except `.env.example`),
  `*.local.json` (VAPID private key), `recipes-*`, logs, `node_modules`, `.git`, `dist`,
  `coverage`, `backups`, `pgdata`, `csv`, `migration-data` (Firestore export = customer PII).
  `BACKUP_SOURCE_DIR=/src` with a read-only `../:/src:ro` mount; ~1,530 files → ~11.7 MiB
  archive → 1 Discord part. Runs are `kind='SERVER'` (filename `server-<stamp>.tar.gz.enc`),
  so `uploadRun`/`prune`/the admin table keep working; retention is bucketed **per kind** and
  `verifyRun` refuses SERVER runs (no `pg_restore` target). Restore = `decrypt-backup.mjs --out
  server.tar.gz` → `tar -xzf`; the DB still comes from its own dump. Requires the widened
  `backup_runs_kind_check` constraint, i.e. `docker compose run --rm --build migrate` (auto-deploy
  does not migrate). `backupChannelId()` also falls back to the first text channel named
  `*백업*`/`*backup*`, which is the preset's `#백업`.
- **서버 설정 edits the draft's `desired.guild`** (preview/apply like everything else) instead of
  calling `PATCH /api/discord/guild` immediately — an immediate patch would let a stale draft revert
  a manual Discord rename later. `PATCH /api/discord/guild` stays registered as an ops/script-level
  endpoint.
- **Known gap:** nothing prevents two admins from running applies concurrently. It relies on
  `discord.manage` being owner-only. Guarding it needs a `guild_id`-scoped advisory lock or a
  "one RUNNING run per guild" unique index — deferred to P12F.
- Verified with throwaway harnesses (then deleted): planner smoke (13 ops in phase order, rollback
  13 inverse ops, delete scenario `{total:4, destructive:2, remove:3}`); bot guardrail smoke (53
  permissions, 11 op types, 6 rejection paths, 5 happy paths); route probe via Fastify `onRoute`
  (60 discord routes, no conflicts); `node --check` on 7 files; Vue SFC compile (`parse` →
  `compileScript` → `compileTemplate`) with 125 script bindings and zero unresolved template
  identifiers; `sass` compiles the style block.
- **Not verified here:** the whole flow has never touched a real guild. Must be smoke-tested on the
  host: seed a draft, preview it, apply a 1-role rename, then roll it back.

---

## 4. Open questions

1. ~~**₩30,000 point-redemption threshold**: before or after discount?~~ → **resolved in P5**: after discount, before point deduction.
2. ~~Kakao app/channel from scratch?~~ → **resolved**: Kakao **login dropped**. For 알림톡 we still need a
   카카오 채널 + 발신 프로필 + template review, but no Kakao app.
3. P3: should a refund mark the sheet `REFUNDED` instead of deriving back to `UNPAID`? (current: `status` untouched)
4. P3: is per-order allocation (`orderIds`) needed, or is FIFO by order creation enough?
5. P5: when a payment is fully refunded, should the points spent on it be restored? (current: no)
6. P5: should point expiry be materialized by a daily job instead of lazily on read? (current: lazy)
7. P7: **which messaging provider** (솔라피 / 알리고 / 비즈뿌리오 …)? → **partially resolved**: 솔라피 implemented
   (`MESSAGING_PROVIDER=solapi`), still needs 사업자등록 + a registered 발신번호 + `SOLAPI_API_KEY/SECRET/FROM`.
   알림톡 additionally needs a 카카오 채널 + 발신 프로필 + template review (currently honest 503).
8. P7: is the 1,000-character body limit enough for LMS/알림톡, or do we need MMS/이미지? (current: text only)
9. ~~**P10**: 선불권 형태~~ → **확정: 금액 충전형(잔액)만**. 횟수형은 P11 기프티콘 `ITEM`(메뉴 교환권)으로 커버.
10. ~~**P10**: 선불권 판매가 ≠ 충전가(보너스) 허용?~~ → **확정: 허용**. `price`와 `face_value`를 따로 입력합니다.
11. ~~**P11**: 기프티콘 종류~~ → **확정: `ITEM`(메뉴 교환권) + `AMOUNT`(금액권) 둘 다**.
12. ~~**P11**: 액면가 > 결제 금액일 때 차액 처리~~ → **확정: 차액 소멸** (기프티콘 관례). 사용 전 UI 경고 필수.
13. **P10/P11**: 판매 경로 — PG 미연동이라 **매장에서 직원이 결제 후 발급**이 기본. 온라인 선결제는 PG 도입 별도 단계.
14. **P10/P11**: 기본 유효기간 — 선불권 3개월, 기프티콘 90일 (관리자가 상품별로 변경 가능)
15. **P10**: 선불권 적립 — 판매 시 판매가의 1% 적립, 사용 시에는 적립 대상에서 제외(중복 적립 방지). 변경하려면
    `server/src/prepaid.js#issuePass` 와 `server/src/payments.js`의 `earnableTotal` 두 곳만 고치면 됩니다.
16. **P11**: 기프티콘 적립 — 판매 시 구매자 전화번호가 기존 회원과 일치할 때만 판매가의 1% 적립
    (`issueGift`의 `buyer_customer_id`). `GIFT_CERT` 사용은 적립 대상 제외.
17. **P11**: 기프티콘은 **회원 귀속이 아님**(코드 소지자 사용). 구매자/수령인은 기록용 메타데이터.
    회원과 연결되는 것은 "내가 구매한 내역"뿐이며 `AdminCustomerView`에서만 조회합니다.
18. **P12**: Developer Portal에 봇 애플리케이션을 이미 만드셨나요? 필요한 값은 `DISCORD_BOT_TOKEN`,
    `DISCORD_APPLICATION_ID`, `DISCORD_GUILD_ID`, `DISCORD_OWNER_USER_ID`, `DISCORD_BACKUP_CHANNEL_ID`,
    `DISCORD_ANNOUNCE_CHANNEL_ID` 입니다. 포털에서 **GUILD_MEMBERS 특권 인텐트만 ON**으로 켜 주세요
    (`MESSAGE_CONTENT`는 쓰지 않습니다).
19. **P12**: 백업 보관 정책 기본값(일간 14 / 주간 8 / 월간 12)이 적절한가요? Discord 메시지도 같이 지울까요?
20. **P12**: `/공지`는 즉시 전송만 할까요, 예약 전송까지 필요할까요?
21. **P12**: **Discord OAuth2 웹 로그인** — 봇 생성에는 불필요합니다(개발자 포털 앱 + Bot 토큰이면 끝).
    원하시면 P12F에서 "Discord로 관리자 로그인"으로 추가합니다(기존 비밀번호 로그인은 유지).
22. ~~**P12**: P12E(구조 편집·적용 엔진)까지 전부 진행할지, P12D(멤버·메시지 편집)에서 한 번 멈추고
    실제 사용감을 본 뒤 진행할지 결정이 필요합니다.~~ → **resolved**: P12E 까지 연속 진행 (코드 완료).
23. **P12**: 봇 역할을 사장님 역할 바로 아래에 두고 **Administrator 없이** 명시적 권한 목록으로 줄 계획입니다.
    길드 삭제·소유권 이전은 원천 차단됩니다. 동의하시나요?

---

## 5. SQL todos

```
done     p1-table-master        bar_tables master (30 tables) + seed + tablet layout from master + /admin/tables
done     p7-cloudflare-cutover  api.honjaya-server.xyz live via Cloudflare Tunnel, vercel.json rewrite swapped, Tailscale = backup
done     p2-guest-session       guest table session cookie (guest_sessions) + /api/guest/session + hj_guest cookie
done     p2-order-ownership     enforce order ownership on /rest/v1 (staff/guest/anon scope) + per-guest attribution
done     p3-payment-ledger      payments / payment_allocations / refunds schema + API
done     p3-split-payment       UI + API for split and partial payment
done     p4-kakao-readiness     DROPPED — Kakao login removed in P7; members are identified by phone number
done     p5-points-ledger       point_ledger + earn/redeem/expire/adjust + FEFO
done     p5-customer-min        customers table (phone key) + staff-driven attribution at the tablet payment screen
done     p6-crm-consent         customer profile + marketing consent + visit history
done     p7-marketing           segments + campaigns + 문자/알림톡 adapter (dryrun) + opt-out link + CSV export
done     p7-provider            솔라피 real send implemented (MESSAGING_PROVIDER=solapi); 알림톡 대기
done     p8-coupons             coupons table + issue/void + tablet redemption + admin panel
done     p9-employee-admin      사장 전용 직원 계정 관리 화면 (생성/수정/비밀번호/활성) + 메뉴·라우터 권한 게이팅
done     p9-permissions         employees.permissions text[] override + /api/admin/permissions 카탈로그 + 세션 반영
done     dark-admin-theme       point-history / customer / marketing 관리자 화면을 다크 테마로 통일
done     root-table-picker      손님이 ?table= 없이 루트로 들어와 자리 선택 (HomeView)
done     p5-point-basis         redemption threshold counted AFTER discount, BEFORE point deduction (confirmed)
done     p3-table-sales-panel   AdminSalesView 에 테이블별 매출 패널 추가
todo     tablet-audit-followup  tablet-flow-audit 잔여 항목 (#2~#10, #13~#16) 순차 수정
done     p10-prepaid-plans     prepaid_plans 상품 템플릿 CRUD (판매가/충전가/유효기간/최소결제/사용요일·시간)
done     p10-prepaid-issue     선불권 판매·발급 + 원장 + 회원 귀속 (다음 영업일부터 사용)
done     p10-prepaid-redeem    결제 수단 PREPAID 연동 (잔액 검증·차감·환불 복원)
done     p10-prepaid-admin     /admin/prepaid 관리 화면 (상품 설정 / 발급·잔액 현황 / 조정·취소)
done     p11-gift-products     gift_products 템플릿 CRUD (ITEM/AMOUNT, 테마, 유효기간, 판매가)
done     p11-gift-issue        기프티콘 발급 + 코드 생성 + 링크/문자 전달
done     p11-gift-redeem       결제 수단 GIFT_CERT 연동 + 1회 사용 처리
done     p11-gift-card-page    공개 카드 페이지 /gift/:code (최소 필드만 노출)
done     p11-gift-admin        /admin/gifts 관리 화면 (템플릿 / 발급 내역 / 재발송·취소)
todo     p11-gift-smoke       smoke 스크립트에 P11 블록 추가 (발급/조회/재사용 409/만료/취소/public)
done     p12a-bot-foundation   bot compose 서비스 + 토큰 격리 + 내부 API/api 프록시 + discord.sql + /상태·/구조·/스냅샷 + 스냅샷 API
done     p12b-backup-pipeline  pg_dump→gzip→AES-256-GCM→sha256→split→Discord 업로드 + 보관정책 + 검증복원
done     p12c-discord-readonly /admin/discord 읽기 전용: 개요·채널 트리·역할·멤버·감사로그·스냅샷 diff·백업 이력
done     p12d-discord-live     라이브 편집: 멤버(역할/닉네임/타임아웃/킥/밴)·메시지·스레드·초대·음성
done     p12e-discord-struct   구조 편집 + apply 엔진: 채널/카테고리/역할 CRUD·재정렬·권한 매트릭스·diff·적용·롤백
                              → 코드 완료 (discordApply/discordRunner/structOps + 구조 편집 탭). 실 서버 스모크 대기
todo     p12f-discord-extras   웹훅 알림·AutoMod·예약 이벤트·이모지·(선택) Discord OAuth2 로그인
```

---

## 6. Known gotchas

- Global `onRequest` apikey guard in `server/src/app.js` covers **all paths except `/health`**;
  frontend must send `apikey` on staff/admin calls (handled in `src/lib/api.js`).
- Fastify JSON parser accepts empty bodies (postgrest-js sends `content-type: application/json` on DELETEs).
- CORS `allowedHeaders` must keep `accept-profile` / `content-profile` (supabase-js 2.116+).
- `apply-schema.mjs` handles `do $$ ... $$` blocks; `staff.sql` is safe.
- Do **not** add staff tables to `server/src/tables.js` (same for `prepaid_*`, `gift_*`, and the future `discord_*` / `backup_*`).
- `process.exit()` with embedded-postgres prints a benign termination notice and a non-zero exit code.
- Console output of Korean text is CP949 mojibake; read files with `-Encoding UTF8`.
- `order_sheets` doubles as the visit session (`active_order_sheets` unique index on `table_number`).
- `bar_tables` has **no `id` column** → `events.sql` uses `table_number` as `row_id` fallback, and
  `server/src/tables.js` declares `pk: "table_number"`.
- `bar_tables` is `readOnly` in `server/src/tables.js`; `/rest/v1` writes return **403**.
  Master settings go through `PATCH /api/admin/tables/:tableNumber` (`settings.manage`, OWNER only).
- Tablet `tableLayoutList` now merges `bar_tables` (master) with the latest order sheet per table.
  If the master list is empty (old DB), it falls back to the legacy order-sheet-only derivation.
- **P2:** `/rest/v1` on `orders` / `order_sheets` / `active_order_sheets` now needs the `hj_guest` or
  `hj_staff` cookie; anon gets **403**. Don't add those tables to unscoped paths.
- **P2:** the browser must call `/rest/v1` on `window.location.origin`. If it hits the API host directly,
  the first-party cookie is not sent and every guest read fails with 403.
- **P2:** guests cannot PATCH/DELETE `orders` and cannot close/pay a sheet — those stay staff/tablet only.
- **P2:** closing an `order_sheets` row (`status = 'CLOSED'`) auto-revokes that sheet's guest sessions.
- **P9:** the API selects `employees.permissions`, so `npm run db:apply` **must** run before `--build api` on deploy.
- **P9:** `employees.permissions = null` means "역할 기본값", `'{}'` means "권한 없음". `OWNER` overrides are ignored
  and stored as `null` on purpose (lockout prevention).
- **P9:** any `permissions` change revokes that employee's sessions; the UI must tell them to log in again.
- **products.option_groups** is `jsonb`, so legacy rows can hold `{}` instead of `[]` (3 rows did, and
  `[...optionGroups]` crashed the order sheet). `toAppRow()` now forces an array for `products`; the live
  rows were normalized with `update products set option_groups = '[]'::jsonb where jsonb_typeof(option_groups) = 'object'`.
- **P10:** 선불권 판매는 `payments` 행을 만들지 않습니다(`payments.order_sheet_id`가 `not null`). 판매 기록은
  `prepaid_transactions(PURCHASE).paid_amount` 이고, 매출 인식은 사용 시점(`USE`)입니다.
- **P10:** `prepaid_plans` / `prepaid_passes` / `prepaid_transactions` 는 `/rest/v1` 허용 목록
  (`server/src/tables.js`)에 **추가하면 안 됩니다**. 전부 `/api/prepaid/*` 로만 접근합니다.
- **P10:** 선불권 사용 요일은 ISO(1=월 … 7=일), 영업일 경계는 15:00 KST 컷오버(`businessDay.js`)를 그대로 씁니다.
- **P10:** `payments.method` 에 CHECK 제약이 없어서 `PREPAID` 추가에 마이그레이션이 필요 없습니다.
- **P11:** `gift_products` / `gift_certificates` 도 `/rest/v1` 허용 목록에 **추가하면 안 됩니다**.
  전부 `/api/gifts/*` 로만 접근합니다.
- **P11:** `payments.order_sheet_id` 가 `NOT NULL` 이므로 **기프티콘 "판매"는 `payments` 행을 만들 수 없습니다**.
  판매 대금은 `gift_certificates.price_paid` + `payment_method` 에 기록하고, 매출 인식은 사용(`GIFT_CERT` 결제) 시점입니다.
- **P11:** 기프티콘 사용은 결제 분할 entry의 `giftCode` 로 전달됩니다. 코드 중복은 서버가 400으로 거부합니다.
  전액 환불 + 미만료일 때만 `ACTIVE` 로 복원되고, 부분 환불은 복원하지 않습니다(차액 소멸 규칙).
- **P11:** `AdminGiftView.vue` 는 `gift.view` 권한이 필요합니다. STAFF 는 `gift.issue` 만 갖고 있으므로
  관리자 화면에 들어갈 수 없고, 태블릿에서만 판매/사용합니다.
- **P11:** `src/lib/orderSheet.js#completeOrderSheetPayment` 는 결제 분할을 서버 entry로 변환할 때
  `prepaidPassId` / `giftCode` 를 반드시 함께 넘겨야 합니다. 누락되면 서버가 400으로 거부합니다.
- **P11 (405 incident):** `vercel.json` 의 rewrite 를 API prefix 별로 하나씩 적어 두면 새 prefix
  (`/api/prepaid/*`, `/api/gifts/*`, `/api/public/gifts/*`) 를 추가할 때마다 빠뜨려서 브라우저 요청이
  Vercel 정적 호스팅으로 흘러갑니다. 증상은 **GET 은 200 + `text/html`(index.html), POST 는 405**.
  지금은 `/api/(.*)` 단일 catch-all 로 통합했으니 새 API 를 추가해도 vercel.json 수정이 필요 없습니다.
  (SSE `/api/events` 는 버퍼링 때문에 절대 주소를 그대로 쓰므로 rewrite 대상이 아닙니다.)
- **P12A:** `server/bot/` is its own npm package with its own `package-lock.json`. Run
  `npm ci` **inside `server/bot`**, not `server/`; `docker compose build` uses `./bot` as the build context.
- **P12A:** `DISCORD_BOT_TOKEN` must exist **only** in the `bot` service env. Never add it to the `api`
  service or to any `VUE_APP_*` variable — the browser bundle is public.
- **P12A:** `BOT_INTERNAL_TOKEN` empty ⇒ the bot answers `503` to every authenticated internal route by design.
  Set it (`openssl rand -hex 32`) or `/api/discord/*` will always fail with `HJ503`.
- **P12A:** the bot port (`4100`) is `expose`-only. Do not add it to `ports:` or to `vercel.json`; the api
  container is the only client and it reaches the bot at `http://bot:4100`.
- **P12A:** SERVER MEMBERS INTENT must be ON in the Developer Portal. If it is off the gateway closes with
  `4014` and the bot logs `discord login failed` — this is a portal setting, not a code bug.
- **P12A:** Korean slash-command names (`/상태`, `/구조`, `/스냅샷`) are valid; they are registered
  **guild-scoped**, so they appear instantly and never need the 1-hour global propagation.
- **P12A:** `discord.sql` must be applied (`docker compose run --rm --build migrate`) **before** `bot` starts,
  otherwise the bot's snapshot/job inserts fail with `42P01`.
- **P12B:** the Windows dev box has **no `pg_dump`/`pg_restore`/`psql`**. `@embedded-postgres/windows-x64` ships
  only `initdb/pg_ctl/postgres`, and `.cmd` shims are unusable (`spawn` → `ENOENT`). So `verifyRun` and
  `uploadRun` can only be smoke-tested **on the host**. Verify the SQL and schema locally with embedded Postgres.
- **P12B:** `verifyRun` runs `createdb`/`dropdb`, so the `DATABASE_URL` role needs `CREATEDB`.
  `BACKUP_SCRATCH_DB` default is `honjaya_verify`; if it ever equals the live DB name the run is refused.
- **P12B:** `Dockerfile` must `COPY scripts ./scripts` — `scripts/decrypt-backup.mjs` is part of the operator
  runbook and is executed with `docker compose run --rm bot node scripts/decrypt-backup.mjs`.
- **P12B:** encryption is `HJBK1 | iv(12) | tag(16) | ciphertext(gzip)`; the auth tag is patched at offset 17
  *after* streaming, so `sizeBytes === gzipSize + 33`. Losing `BACKUP_ENCRYPTION_KEY` makes every backup unreadable —
  keep an offline copy.
- **P12B:** upload failures are isolated. `BACKUP` only dumps/encrypts/splits and enqueues `BACKUP_UPLOAD`;
  a Discord outage leaves `backup_runs.status = SUCCEEDED` with `backup_files.upload_status = PENDING`.
- **P12B:** local `server/bot/.env` is loaded before `process.env` reads, so ad-hoc test scripts must set
  `ENV_FILE` to a nonexistent path and assign `process.env.*` **before** dynamically importing bot modules.
- **P12C:** validate Vue SFC syntax locally without a build:
  `require('vue/compiler-sfc')` → `parse()` → `compileScript()` → `compileTemplate({compilerOptions:{bindingMetadata}})`.
  Vue 3.5 has **no** top-level `@vue/compiler-sfc` package — it lives at `node_modules/vue/compiler-sfc`.
- **P12C:** Fastify `printRoutes({commonPrefix:false})` prints a tree **without** a leading `/` and nests
  children, so full-path substring assertions falsely fail. Assert on individual segments (`verify`,
  `download`, `diff`) or print the whole tree.
- **P12C:** the global apikey guard also applies to downloads. Binary fetches must use `apiBlob()` in
  `src/lib/api.js`; an `<a href>`/`window.open` to `/api/discord/backups/:runId/download` returns 401.
- **P12C:** guard names are not interchangeable — `discord.view` (read), `discord.manage` (snapshots),
  `discord.backup` (backup runs), `discord.member` (member edits), `discord.settings`. §3-13 F is the authority.
- **P12C:** `embedded-postgres` (the wrapper, not `@embedded-postgres/windows-x64`) is the import that exposes
  a default `EmbeddedPostgres` class; the platform package only exports `initdb`/`pg_ctl`/`postgres`.
- **P12D:** `clearTimeout` from `node:timers` shadows the member-ops export — import it as
  `clearTimeout as clearMemberTimeout` in `internalApi.js`.
- **P12D:** bot return shapes differ per op — `createThread`/`archiveThread` return `{ thread }` (no
  `channel`), `createInvite` returns `{ invite: { code, url, channelId, maxAge, maxUses, … } }`,
  `moveMemberVoice` returns `{ userId, action, fromChannelId, toChannelId }`. Audit `detail` must read
  those exact paths.
- **P12D:** `ChannelType.GuildForum === 15`, `GuildMedia === 16` — forum/media channels must be included
  in the 공지 channel filter or announcements silently can't reach them.
- **P12D:** PowerShell `(Get-Content f) -replace … | Set-Content -NoNewline` **destroys every newline**
  and adds a UTF-8 BOM. Never use it on multi-line source files; use the `edit` tool or
  `[System.IO.File]::WriteAllText($p,$t,(New-Object System.Text.UTF8Encoding($false)))`.
- **P12D:** verify file integrity by **bytes**, not lines — `Measure-Object -Line` on a CRLF file
  under-counts (1507 LF bytes vs 1393 reported lines). Check `LF == CR` and `bytes[0] -ne 239`.
- **P12D:** the SFC identifier scan must strip object-literal keys before flagging unresolved names,
  otherwise `:class="{ selected: x }"`, `{ disconnect: true }` and `{ backgroundColor: … }` produce
  false positives.
- **P12E:** `readStructure()` returns **every** `guild.channels.cache` entry, including threads
  (`PublicThread`/`PrivateThread`/`AnnouncementThread`) and `GuildDirectory`. `structure.js` filters
  them with `NON_STRUCTURE_CHANNEL_TYPES` — remove that filter and seeding a draft from live throws
  `지원하지 않는 채널 종류예요`, and a delete plan starts targeting conversation threads.
- **P12E:** managed (bot-owned) roles must stay in the draft. Removing one makes `planApply` see a
  live role that the draft lacks → `ROLE_MANAGED` **blocked** entry → apply refuses to run. Render
  them read-only instead.
- **P12E:** any live role/channel the draft omits is a **delete candidate**. Do not build the draft by
  listing only the rows the admin touched; always start from `desiredFromStructure(structure)`.
- **P12E:** `null` numeric guild settings mean "leave unchanged" in `normalizeGuild`, so a bot that
  reports `afkTimeout: null` will not break preview.
- **P12E:** `discord_snapshots.reason` CHECK has no `POST_APPLY`; the post-apply snapshot is `MANUAL`
  with `created_by = 'discord:apply'`. It is what `collectConflicts()` uses as the 3-way baseline.
- **P12E:** `saveDraft()` returns a **snake_case** row (`updated_at`), `loadDraft()` returns camelCase
  (`updatedAt`). The editor reads both.
- **P12E:** `PATCH /api/discord/guild` bypasses the draft/apply engine. Only use it from scripts/ops;
  UI edits go through `desired.guild` so preview and rollback still cover them.
- **P12E:** no concurrency guard on `discord_apply_runs` — two admins can apply at the same time.
  Acceptable only while `discord.manage` is OWNER-only; add a guild-scoped advisory lock before
  granting it to MANAGER.
