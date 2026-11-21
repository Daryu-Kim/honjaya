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
| Staff | 3 people, 3 roles: `OWNER` / `MANAGER` / `STAFF` |
| Frontend origin | `https://honjaya.vercel.app` (operational) |
| API origin (target) | `https://api.honjaya-server.xyz` via Cloudflare Tunnel — **LIVE** (`/health` → db up) |
| API origin (backup) | Tailscale Funnel `https://<device>.<tailnet>.ts.net` |
| Auth transport | HttpOnly + SameSite=Lax first-party cookie via `vercel.json` rewrites for `/rest/v1/*`, `/api/staff/*`, `/api/admin/*`, `/api/guest/*` |
| Payment scope | Split / partial payment included in phase 1 |
| Tablet console | Keep and extend (not replaced) |
| Customer identity | **Phone number only** — no Kakao login, no member signup. `customers` is created at the tablet payment screen |
| Marketing channel | 문자(SMS/LMS) + 카카오 알림톡 through a provider. Default `MESSAGING_PROVIDER=dryrun` (records logs, sends nothing) |
| Marketing consent | Collected at the tablet payment screen + admin CRM page; customers can opt out via a tokenized link in every message |
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
| **P7** | Marketing & messaging (segments, campaigns, 문자/알림톡 send, opt-out link, CSV export) | **DONE (code + smoke 242/242)** — deploy pending |
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

## 3-7. P7 — Marketing & messaging: segments, campaigns, 문자/알림톡 (DONE — deploy pending)

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
  sends nothing), `none` (feature off), `solapi` (**stub**: honest 503 until a provider is contracted).
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
- Deploy/live verification pending.

---

## 4. Open questions

1. ~~**₩30,000 point-redemption threshold**: before or after discount?~~ → **resolved in P5**: after discount, before point deduction.
2. ~~Kakao app/channel from scratch?~~ → **resolved**: Kakao **login dropped**. For 알림톡 we still need a
   카카오 채널 + 발신 프로필 + template review, but no Kakao app.
3. P3: should a refund mark the sheet `REFUNDED` instead of deriving back to `UNPAID`? (current: `status` untouched)
4. P3: is per-order allocation (`orderIds`) needed, or is FIFO by order creation enough?
5. P5: when a payment is fully refunded, should the points spent on it be restored? (current: no)
6. P5: should point expiry be materialized by a daily job instead of lazily on read? (current: lazy)
7. P7: **which messaging provider** (솔라피 / 알리고 / 비즈뿌리오 …)? Does the bar have 사업자등록 +
   a registered 발신번호 (needed for both 문자 and 알림톡)? Until then `MESSAGING_PROVIDER=dryrun`.
8. P7: is the 1,000-character body limit enough for LMS/알림톡, or do we need MMS/이미지? (current: text only)

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
pending  p7-provider            choose messaging provider (solapi/aligo/bizppurio), fill sendViaSolapi(), set MESSAGING_*
done     p5-point-basis         redemption threshold counted AFTER discount, BEFORE point deduction (confirmed)
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
