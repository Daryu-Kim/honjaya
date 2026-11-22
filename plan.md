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
```

---

## 6. Known gotchas

- Global `onRequest` apikey guard in `server/src/app.js` covers **all paths except `/health`**;
  frontend must send `apikey` on staff/admin calls (handled in `src/lib/api.js`).
- Fastify JSON parser accepts empty bodies (postgrest-js sends `content-type: application/json` on DELETEs).
- CORS `allowedHeaders` must keep `accept-profile` / `content-profile` (supabase-js 2.116+).
- `apply-schema.mjs` handles `do $$ ... $$` blocks; `staff.sql` is safe.
- Do **not** add staff tables to `server/src/tables.js`.
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
