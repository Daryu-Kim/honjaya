import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import EmbeddedPostgres from "embedded-postgres";

const PG_PORT = 55432;
const results = [];
const silentLog = { info: () => {}, warn: () => {}, error: () => {} };

function pass(name) {
  results.push({ name, ok: true });
  console.log(`  [OK]   ${name}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.log(`  [FAIL] ${name} :: ${detail}`);
}

function check(name, condition, detail = "") {
  if (condition) {
    pass(name);
  } else {
    fail(name, detail || "조건 불충족");
  }
}

function equal(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, ok, `기대값 ${JSON.stringify(expected)} / 실제값 ${JSON.stringify(actual)}`);
}

function toCookieHeader(response) {
  const raw = response.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : [raw];

  return list
    .filter(Boolean)
    .map((value) => String(value).split(";")[0])
    .join("; ");
}

function sseCollect(port, tables) {
  return new Promise((resolve, reject) => {
    const frames = [];
    const request = http.get(
      { host: "127.0.0.1", port, path: `/api/events?tables=${tables}`, headers: { accept: "text/event-stream" } },
      (response) => {
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          frames.push(chunk);

          if (chunk.includes("event: change")) {
            request.destroy();
            resolve(frames.join(""));
          }
        });
      }
    );

    request.on("error", (error) => {
      if (error.code !== "ECONNRESET") {
        reject(error);
      }
    });
    request.setTimeout(8000, () => {
      request.destroy();
      reject(new Error("SSE 타임아웃"));
    });
  });
}

function sseFirstFrame(port, path) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) {
        return;
      }

      settled = true;
      request.destroy();
      resolve(value);
    };

    const request = http.get(
      { host: "127.0.0.1", port, path, headers: { accept: "text/event-stream" } },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;

          if (body.includes("event: ready") || response.statusCode !== 200) {
            done({ status: response.statusCode, body });
          }
        });
        response.on("end", () => done({ status: response.statusCode, body }));
      }
    );

    request.on("error", (error) => {
      if (error.code !== "ECONNRESET") {
        done({ status: 0, body: error.message });
      }
    });
    request.setTimeout(5000, () => done({ status: 0, body: "SSE 타임아웃" }));
  });
}

function sseQuiet(port, tables, windowMs) {
  return new Promise((resolve) => {
    let sawChange = false;
    const request = http.get(
      { host: "127.0.0.1", port, path: `/api/events?tables=${tables}`, headers: { accept: "text/event-stream" } },
      (response) => {
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          if (chunk.includes("event: change")) {
            sawChange = true;
          }
        });
      }
    );
    request.on("error", () => {});

    setTimeout(() => {
      request.destroy();
      resolve(!sawChange);
    }, windowMs);
  });
}

const dataDir = mkdtempSync(join(tmpdir(), "honjaya-pg-"));
const postgres = new EmbeddedPostgres({
  databaseDir: dataDir,
  port: PG_PORT,
  user: "postgres",
  password: "postgres",
  persistent: false,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: () => {},
});

let app = null;
let stopEventBroadcast = null;
let closePool = null;

try {
  console.log(`[smoke] 임베디드 Postgres 준비 (${dataDir})`);
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase("honjaya");

  const connectionString = `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/honjaya`;

  process.env.DATABASE_URL = connectionString;
  process.env.LOG_LEVEL = "silent";

  const { applySchema } = await import("./apply-schema.mjs");

  console.log("[smoke] 스키마 적용");
  await applySchema(connectionString, silentLog);

  const { buildApp } = await import("../src/app.js");
  const events = await import("../src/routes/events.js");
  const db = await import("../src/db.js");
  const { config } = await import("../src/config.js");

  stopEventBroadcast = events.stopEventBroadcast;
  closePool = db.closePool;

  // server/.env 에 실제 ANON_KEY 가 들어 있어도 테스트가 영향받지 않도록 인증을 끕니다
  // (키 검증은 아래 'api key' 구간에서 따로 확인합니다).
  config.anonKey = "";
  config.serviceKey = "";

  app = await buildApp({ logger: false });
  await app.ready();

  // ---------------------------------------------------------------- health
  const health = await app.inject({ method: "GET", url: "/health" });
  check("GET /health → 200", health.statusCode === 200, health.body);
  check("GET /health → db up", health.json().db === "up", health.body);

  // ---------------------------------------------------------------- cors preflight
  // supabase-js 는 db.schema 기본값(public)을 Accept-Profile 로 항상 보냅니다.
  // 이 헤더가 CORS 목록에 없으면 브라우저가 모든 요청을 막습니다.
  const preflight = await app.inject({
    method: "OPTIONS",
    url: "/rest/v1/categories",
    headers: {
      origin: "https://honjaya.vercel.app",
      "access-control-request-method": "GET",
      "access-control-request-headers": "accept-profile,apikey,authorization,x-client-info",
    },
  });
  const allowedHeaders = String(preflight.headers["access-control-allow-headers"] || "");

  for (const header of ["accept-profile", "content-profile", "x-client-info"]) {
    check(
      `CORS preflight → ${header} 허용`,
      allowedHeaders.toLowerCase().includes(header),
      allowedHeaders || "(access-control-allow-headers 없음)"
    );
  }

  // ---------------------------------------------------------------- insert
  const insert = await app.inject({
    method: "POST",
    url: "/rest/v1/categories?select=*",
    headers: { prefer: "return=representation", "content-type": "application/json" },
    payload: { id: "cat-1", name: "시그니처", code: "SIG", sort_order: 30 },
  });
  check("POST categories → 201", insert.statusCode === 201, insert.body);
  equal("POST categories → 반환 행 1개", insert.json().length, 1);
  equal("POST categories → 저장된 값", insert.json()[0].name, "시그니처");

  await app.inject({
    method: "POST",
    url: "/rest/v1/categories",
    headers: { "content-type": "application/json" },
    payload: [
      { id: "cat-2", name: "위스키", code: "WSK", sort_order: 10 },
      { id: "cat-3", name: "음료", code: "DRK", sort_order: 20 },
    ],
  });

  const productInsert = await app.inject({
    method: "POST",
    url: "/rest/v1/products?select=*",
    headers: { prefer: "return=representation", "content-type": "application/json" },
    payload: {
      id: "prod-1",
      product_name: "테스트 칵테일",
      category_id: "cat-1",
      category_ids: ["cat-1", "cat-3"],
      base_price: 12000,
      is_active: true,
    },
  });
  check("POST products(text[] 컬럼) → 201", productInsert.statusCode === 201, productInsert.body);
  equal("POST products → 배열 값 보존", productInsert.json()[0].category_ids, ["cat-1", "cat-3"]);

  // ---------------------------------------------------------------- staff session
  // P2 부터 /rest/v1 의 주문 관련 표(orders, order_sheets, active_order_sheets)는
  // 직원 또는 손님 세션이 있어야 접근할 수 있습니다. 아래 검사는 직원 세션으로 진행합니다.
  const { hashPassword } = await import("../src/auth/password.js");
  const staffPassword = "smoke-test-password";

  await db.pool.query(
    `insert into public.employees (id, login_id, password_hash, name, role, is_active)
     values ('smoke-owner', 'smoke-owner', $1, '스모크', 'OWNER', true)`,
    [await hashPassword(staffPassword)]
  );

  const staffLogin = await app.inject({
    method: "POST",
    url: "/api/staff/login",
    headers: { "content-type": "application/json" },
    payload: { loginId: "smoke-owner", password: staffPassword },
  });
  check("POST /api/staff/login → 200", staffLogin.statusCode === 200, staffLogin.body);

  const staffCookie = toCookieHeader(staffLogin);
  check("직원 로그인 → 세션 쿠키 발급", Boolean(staffCookie), staffLogin.body);

  // ---------------------------------------------------------------- jsonb
  // node-postgres 는 JS 배열을 Postgres 배열 리터럴로 바꿔서 보냅니다.
  // jsonb 컬럼에 그대로 바인딩하면 22P02(invalid input syntax for type json) 가 납니다.
  const jsonbArrayInsert = await app.inject({
    method: "POST",
    url: "/rest/v1/orders?select=*",
    headers: {
      prefer: "return=representation",
      "content-type": "application/json",
      cookie: staffCookie,
    },
    payload: {
      id: "order-1",
      order_sheet_id: "sheet-staff",
      items: [
        { productName: "진 토닉", quantity: 2, unitPrice: 9000 },
        { productName: "모히토", quantity: 1, unitPrice: 11000 },
      ],
    },
  });
  check("POST orders(jsonb 배열) → 201", jsonbArrayInsert.statusCode === 201, jsonbArrayInsert.body);
  equal(
    "POST orders(jsonb 배열) → 배열 그대로 저장",
    jsonbArrayInsert.json()[0]?.items?.map((item) => item.productName),
    ["진 토닉", "모히토"]
  );

  const jsonbEmptyArray = await app.inject({
    method: "POST",
    url: "/rest/v1/orders?select=*",
    headers: {
      prefer: "return=representation",
      "content-type": "application/json",
      cookie: staffCookie,
    },
    payload: { id: "order-empty", order_sheet_id: "sheet-staff", items: [] },
  });
  equal(
    "POST orders(jsonb 빈 배열) → [] 로 저장 ({} 아님)",
    jsonbEmptyArray.json()[0]?.items,
    []
  );

  const jsonbObjectInsert = await app.inject({
    method: "POST",
    url: "/rest/v1/products?select=*",
    headers: { prefer: "return=representation", "content-type": "application/json" },
    payload: {
      id: "prod-jsonb",
      product_name: "옵션 테스트",
      option_groups: [{ id: "g1", name: "얼음", options: [{ id: "o1", name: "각얼음" }] }],
      recipe_info: { description: "설명", ingredients: ["진"], steps: [], tips: [] },
    },
  });
  check("POST products(jsonb 배열+객체) → 201", jsonbObjectInsert.statusCode === 201, jsonbObjectInsert.body);
  equal(
    "POST products(jsonb 배열) → 배열 그대로 저장",
    jsonbObjectInsert.json()[0]?.option_groups?.[0]?.name,
    "얼음"
  );

  const jsonbStringInsert = await app.inject({
    method: "POST",
    url: "/rest/v1/products?select=*",
    headers: { prefer: "return=representation", "content-type": "application/json" },
    payload: { id: "prod-jsonb-str", product_name: "문자열 테스트", option_groups: '[{"id":"g2"}]' },
  });
  equal(
    "POST products(미리 stringify 한 JSON) → 계속 동작",
    jsonbStringInsert.json()[0]?.option_groups,
    [{ id: "g2" }]
  );

  const jsonbPatch = await app.inject({
    method: "PATCH",
    url: "/rest/v1/orders?id=eq.order-1&select=*",
    headers: {
      prefer: "return=representation",
      "content-type": "application/json",
      cookie: staffCookie,
    },
    payload: { items: [{ productName: "블랙 러시안", quantity: 1, unitPrice: 12000 }] },
  });
  check("PATCH orders(jsonb 배열) → 200", jsonbPatch.statusCode === 200, jsonbPatch.body);
  equal(
    "PATCH orders(jsonb 배열) → 배열 교체",
    jsonbPatch.json()[0]?.items?.map((item) => item.productName),
    ["블랙 러시안"]
  );

  const jsonbPatchEmpty = await app.inject({
    method: "PATCH",
    url: "/rest/v1/orders?id=eq.order-1&select=*",
    headers: {
      prefer: "return=representation",
      "content-type": "application/json",
      cookie: staffCookie,
    },
    payload: { items: [] },
  });
  equal("PATCH orders(jsonb 빈 배열) → [] 로 저장", jsonbPatchEmpty.json()[0]?.items, []);

  // ---------------------------------------------------------------- guest scoping (P2)
  const anonOrders = await app.inject({
    method: "GET",
    url: "/rest/v1/orders?select=id",
  });
  check("세션 없이 orders 조회 → 403", anonOrders.statusCode === 403, anonOrders.body);

  const guestJoin = await app.inject({
    method: "POST",
    url: "/api/guest/session",
    headers: { "content-type": "application/json", "user-agent": "smoke-test" },
    payload: { tableNumber: "1", nickname: "테스터" },
  });
  check("POST /api/guest/session → 200", guestJoin.statusCode === 200, guestJoin.body);

  const guestCookie = toCookieHeader(guestJoin);
  const guestSheetId = String(guestJoin.json().orderSheet?.orderSheetId || "");
  check("손님 입장 → 주문서 발급", Boolean(guestSheetId), guestJoin.body);
  check("손님 입장 → 세션 쿠키 발급", Boolean(guestCookie), guestJoin.body);

  const guestInsert = await app.inject({
    method: "POST",
    url: "/rest/v1/orders?select=*",
    headers: {
      prefer: "return=representation",
      "content-type": "application/json",
      cookie: guestCookie,
    },
    payload: {
      id: "order-guest",
      order_sheet_id: "sheet-staff",
      table_number: "99",
      guest_nickname: "해커",
      status: "SERVED",
      items: [{ productName: "하이볼", quantity: 1, unitPrice: 9000 }],
    },
  });
  check("손님 주문 생성 → 201", guestInsert.statusCode === 201, guestInsert.body);
  equal("손님 주문 → 주문서 강제 지정", guestInsert.json()[0]?.order_sheet_id, guestSheetId);
  equal("손님 주문 → 테이블 번호 강제", guestInsert.json()[0]?.table_number, "1");
  equal("손님 주문 → 닉네임 강제", guestInsert.json()[0]?.guest_nickname, "테스터");
  equal("손님 주문 → 상태는 항상 REQUESTED", guestInsert.json()[0]?.status, "REQUESTED");

  const guestList = await app.inject({
    method: "GET",
    url: "/rest/v1/orders?select=id",
    headers: { cookie: guestCookie },
  });
  check("손님 주문 조회 → 200", guestList.statusCode === 200, guestList.body);
  equal("손님 주문 조회 → 우리 테이블 것만", guestList.json().map((row) => row.id), ["order-guest"]);

  const guestPatchOrder = await app.inject({
    method: "PATCH",
    url: "/rest/v1/orders?id=eq.order-guest",
    headers: { "content-type": "application/json", cookie: guestCookie },
    payload: { status: "SERVED" },
  });
  check("손님 주문 수정 → 403", guestPatchOrder.statusCode === 403, guestPatchOrder.body);

  const guestCloseSheet = await app.inject({
    method: "PATCH",
    url: `/rest/v1/order_sheets?id=eq.${guestSheetId}`,
    headers: { "content-type": "application/json", cookie: guestCookie },
    payload: { status: "CLOSED" },
  });
  check("손님 주문서 마감 → 403", guestCloseSheet.statusCode === 403, guestCloseSheet.body);

  const guestTotals = await app.inject({
    method: "PATCH",
    url: `/rest/v1/order_sheets?id=eq.${guestSheetId}&select=*`,
    headers: {
      prefer: "return=representation",
      "content-type": "application/json",
      cookie: guestCookie,
    },
    payload: { total_amount: 9000, order_count: 1 },
  });
  check("손님 주문서 합계 갱신 → 200", guestTotals.statusCode === 200, guestTotals.body);
  equal("손님 주문서 합계 갱신 → 반영", guestTotals.json()[0]?.total_amount, 9000);

  const guestOtherSheet = await app.inject({
    method: "GET",
    url: "/rest/v1/order_sheets?select=id&id=eq.sheet-staff",
    headers: { cookie: guestCookie },
  });
  check("손님 다른 주문서 조회 → 200 이지만 0건", guestOtherSheet.statusCode === 200 && guestOtherSheet.json().length === 0, guestOtherSheet.body);

  const staffSeesGuest = await app.inject({
    method: "GET",
    url: "/rest/v1/orders?select=id,guest_nickname",
    headers: { cookie: staffCookie },
  });
  check("직원은 모든 주문 조회 → 200", staffSeesGuest.statusCode === 200, staffSeesGuest.body);
  equal(
    "직원 화면에 손님 닉네임이 보임",
    staffSeesGuest.json().find((row) => row.id === "order-guest")?.guest_nickname,
    "테스터"
  );

  // ---------------------------------------------------------------- payment ledger (P3)
  const p3SheetInsert = await app.inject({
    method: "POST",
    url: "/rest/v1/order_sheets?select=*",
    headers: {
      prefer: "return=representation",
      "content-type": "application/json",
      cookie: staffCookie,
    },
    payload: {
      id: "sheet-p3",
      sequence_no: 9001,
      business_date: new Date().toISOString(),
      table_number: "7",
      display_name: "No.7",
      total_amount: 50000,
      order_count: 2,
    },
  });
  check("P3 주문서 생성 → 201", p3SheetInsert.statusCode === 201, p3SheetInsert.body);

  for (const [id, price] of [
    ["order-p3-a", 30000],
    ["order-p3-b", 20000],
  ]) {
    const orderInsert = await app.inject({
      method: "POST",
      url: "/rest/v1/orders?select=*",
      headers: {
        prefer: "return=representation",
        "content-type": "application/json",
        cookie: staffCookie,
      },
      payload: {
        id,
        order_sheet_id: "sheet-p3",
        table_number: "7",
        total_price: price,
        total_count: 1,
        items: [{ productName: id, quantity: 1, unitPrice: price }],
      },
    });
    equal(`P3 주문 생성(${id}) → 201`, orderInsert.statusCode, 201);
  }

  const partialPayment = await app.inject({
    method: "POST",
    url: "/api/payments",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      orderSheetId: "sheet-p3",
      originalAmount: 50000,
      discounts: [],
      entries: [{ method: "CARD", amount: 20000, payerLabel: "지민" }],
      close: false,
    },
  });
  check("P3 일부 결제 → 200", partialPayment.statusCode === 200, partialPayment.body);
  equal("P3 일부 결제 → 부분결제 상태", partialPayment.json().paymentStatus, "PARTIAL");
  equal("P3 일부 결제 → 남은 금액", partialPayment.json().remainingAmount, 30000);
  equal("P3 일부 결제 → 마감하지 않음", partialPayment.json().closed, false);

  const p3SheetAfterPartial = await app.inject({
    method: "GET",
    url: "/rest/v1/order_sheets?select=*&id=eq.sheet-p3",
    headers: { cookie: staffCookie },
  });
  const p3Row = p3SheetAfterPartial.json()[0] || {};
  equal("P3 일부 결제 → 주문서는 OPEN 유지", p3Row.status, "OPEN");
  equal("P3 일부 결제 → payment_status PARTIAL", p3Row.payment_status, "PARTIAL");
  equal("P3 일부 결제 → paid_amount 반영", p3Row.paid_amount, 20000);

  const p3SheetLedger = await app.inject({
    method: "GET",
    url: "/api/payments/sheet/sheet-p3",
    headers: { cookie: staffCookie },
  });
  check("P3 주문서 원장 조회 → 200", p3SheetLedger.statusCode === 200, p3SheetLedger.body);
  equal("P3 주문서 원장 → 결제 1건", p3SheetLedger.json().payments.length, 1);
  equal("P3 주문서 원장 → 결제자 기록", p3SheetLedger.json().payments[0]?.payerLabel, "지민");
  check(
    "P3 주문서 원장 → 정산 금액/잔액",
    p3SheetLedger.json().settledAmount === 20000 &&
      p3SheetLedger.json().remainingAmount === 30000,
    p3SheetLedger.body
  );

  const overPayment = await app.inject({
    method: "POST",
    url: "/api/payments",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      orderSheetId: "sheet-p3",
      originalAmount: 50000,
      entries: [{ method: "CASH", amount: 40000 }],
      close: true,
    },
  });
  check("P3 남은 금액 초과 결제 → 400", overPayment.statusCode === 400, overPayment.body);

  const finalPayment = await app.inject({
    method: "POST",
    url: "/api/payments",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      orderSheetId: "sheet-p3",
      originalAmount: 50000,
      entries: [
        { method: "CASH", amount: 15000, payerLabel: "수현" },
        { method: "BANK", amount: 15000, payerLabel: "민수" },
      ],
      close: true,
    },
  });
  check("P3 잔액 결제 → 200", finalPayment.statusCode === 200, finalPayment.body);
  equal("P3 잔액 결제 → 결제완료", finalPayment.json().paymentStatus, "COMPLETED");
  equal("P3 잔액 결제 → 주문서 마감", finalPayment.json().closed, true);
  equal("P3 잔액 결제 → 남은 금액 0", finalPayment.json().remainingAmount, 0);

  const p3SheetAfterFull = await app.inject({
    method: "GET",
    url: "/rest/v1/order_sheets?select=*&id=eq.sheet-p3",
    headers: { cookie: staffCookie },
  });
  const p3ClosedRow = p3SheetAfterFull.json()[0] || {};
  equal("P3 잔액 결제 → 주문서 CLOSED", p3ClosedRow.status, "CLOSED");
  equal("P3 잔액 결제 → 여러 수단 표시", p3ClosedRow.payment_method, "MIXED");
  equal("P3 잔액 결제 → paid_amount 합계", p3ClosedRow.paid_amount, 50000);
  check("P3 잔액 결제 → paid_at 기록", Boolean(p3ClosedRow.paid_at), p3ClosedRow.paid_at);

  const closedPayment = await app.inject({
    method: "POST",
    url: "/api/payments",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      orderSheetId: "sheet-p3",
      originalAmount: 50000,
      entries: [{ method: "CARD", amount: 1000 }],
      close: true,
    },
  });
  check("P3 마감된 주문서 추가 결제 → 409", closedPayment.statusCode === 409, closedPayment.body);

  const p3FirstPaymentId = partialPayment.json().payments[0]?.id || "";
  const partialRefund = await app.inject({
    method: "POST",
    url: `/api/payments/${p3FirstPaymentId}/refund`,
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: { amount: 5000, reason: "주문 착오" },
  });
  check("P3 부분 환불 → 200", partialRefund.statusCode === 200, partialRefund.body);
  equal("P3 부분 환불 → 정산 금액 차감", partialRefund.json().settledAmount, 45000);
  equal("P3 부분 환불 → 남은 금액 복구", partialRefund.json().remainingAmount, 5000);
  equal("P3 부분 환불 → 상태 되돌림", partialRefund.json().paymentStatus, "PARTIAL");

  const overRefund = await app.inject({
    method: "POST",
    url: `/api/payments/${p3FirstPaymentId}/refund`,
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: { amount: 20000, reason: "초과 환불" },
  });
  check("P3 환불 가능 금액 초과 → 400", overRefund.statusCode === 400, overRefund.body);

  const p3LedgerList = await app.inject({
    method: "GET",
    url: "/api/payments?limit=50",
    headers: { cookie: staffCookie },
  });
  check("P3 결제 원장 목록 → 200", p3LedgerList.statusCode === 200, p3LedgerList.body);
  check(
    "P3 결제 원장 목록 → 결제/환불 집계",
    p3LedgerList.json().totalPaid === 50000 && p3LedgerList.json().totalRefunded === 5000,
    p3LedgerList.body
  );

  const anonPayments = await app.inject({ method: "GET", url: "/api/payments" });
  check("P3 비로그인 결제 원장 조회 → 401", anonPayments.statusCode === 401, anonPayments.body);

  const guestPayments = await app.inject({
    method: "GET",
    url: "/api/payments",
    headers: { cookie: guestCookie },
  });
  check("P3 손님 결제 원장 조회 → 401", guestPayments.statusCode === 401, guestPayments.body);

  const guestRecordPayment = await app.inject({
    method: "POST",
    url: "/api/payments",
    headers: { "content-type": "application/json", cookie: guestCookie },
    payload: {
      orderSheetId: guestSheetId,
      entries: [{ method: "CARD", amount: 1000 }],
    },
  });
  check("P3 손님 결제 기록 → 401", guestRecordPayment.statusCode === 401, guestRecordPayment.body);

  // ---------------------------------------------------------------- kakao login (P4 → DROPPED)
  // 회원은 휴대폰 번호로만 식별합니다. 카카오 로그인 경로는 제거했습니다.
  const kakaoStatus = await app.inject({
    method: "GET",
    url: "/api/kakao/status",
    headers: { cookie: guestCookie },
  });
  check(
    "P4 카카오 로그인 제거 → 404",
    kakaoStatus.statusCode === 404,
    kakaoStatus.body
  );

  // ---------------------------------------------------------------- points ledger (P5)
  // 규칙: 적립 1%(원 단위 버림) · 사용은 1,000P 이상 1,000P 단위 · 결제 3만원 이상 · 유효기간 3개월
  const pointRules = await app.inject({
    method: "GET",
    url: "/api/points/rules",
    headers: { cookie: staffCookie },
  });
  check("P5 포인트 규칙 조회 → 200", pointRules.statusCode === 200, pointRules.body);
  equal("P5 포인트 규칙 → 적립률 1%", pointRules.json().earnRate, 0.01);
  equal("P5 포인트 규칙 → 최소 사용 1,000P", pointRules.json().minRedeem, 1000);
  equal("P5 포인트 규칙 → 1,000P 단위", pointRules.json().redeemStep, 1000);
  equal("P5 포인트 규칙 → 결제 3만원 이상", pointRules.json().redeemMinPayment, 30000);
  equal("P5 포인트 규칙 → 유효기간 3개월", pointRules.json().expiryMonths, 3);

  const anonPoints = await app.inject({
    method: "GET",
    url: "/api/points/customer?phone=01055556666",
  });
  check("P5 비로그인 포인트 조회 → 401", anonPoints.statusCode === 401, anonPoints.body);

  const guestPoints = await app.inject({
    method: "GET",
    url: "/api/points/customer?phone=01055556666",
    headers: { cookie: guestCookie },
  });
  check("P5 손님 포인트 조회 → 401", guestPoints.statusCode === 401, guestPoints.body);

  const noPhoneLookup = await app.inject({
    method: "GET",
    url: "/api/points/customer",
    headers: { cookie: staffCookie },
  });
  check("P5 전화번호 없이 조회 → 400", noPhoneLookup.statusCode === 400, noPhoneLookup.body);

  const unknownPhoneLookup = await app.inject({
    method: "GET",
    url: "/api/points/customer?phone=01099998888",
    headers: { cookie: staffCookie },
  });
  check(
    "P5 없는 고객 조회 → 빈 잔액",
    unknownPhoneLookup.statusCode === 200 &&
      unknownPhoneLookup.json().customer === null &&
      unknownPhoneLookup.json().balance === 0,
    unknownPhoneLookup.body
  );

  const p5EarnSheet = await app.inject({
    method: "POST",
    url: "/rest/v1/order_sheets?select=*",
    headers: {
      prefer: "return=representation",
      "content-type": "application/json",
      cookie: staffCookie,
    },
    payload: {
      id: "sheet-p5-earn",
      sequence_no: 9101,
      business_date: new Date().toISOString(),
      table_number: "9",
      display_name: "No.9",
      total_amount: 50000,
      order_count: 1,
    },
  });
  check("P5 주문서 생성 → 201", p5EarnSheet.statusCode === 201, p5EarnSheet.body);

  const p5EarnPayment = await app.inject({
    method: "POST",
    url: "/api/payments",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      orderSheetId: "sheet-p5-earn",
      originalAmount: 50000,
      entries: [{ method: "CARD", amount: 50000 }],
      close: true,
      customerPhone: "010-5555-6666",
      customerName: "포인트손님",
    },
  });
  check("P5 적립 결제 → 200", p5EarnPayment.statusCode === 200, p5EarnPayment.body);
  equal("P5 적립 결제 → 1% 적립", p5EarnPayment.json().pointsEarned, 500);
  equal("P5 적립 결제 → 잔액 500P", p5EarnPayment.json().pointsBalance, 500);
  equal(
    "P5 적립 결제 → 전화번호 정규화",
    p5EarnPayment.json().customer?.phone,
    "01055556666"
  );

  const p5CustomerLookup = await app.inject({
    method: "GET",
    url: "/api/points/customer?phone=01055556666",
    headers: { cookie: staffCookie },
  });
  check("P5 고객 포인트 조회 → 200", p5CustomerLookup.statusCode === 200, p5CustomerLookup.body);
  equal("P5 고객 포인트 조회 → 잔액", p5CustomerLookup.json().balance, 500);
  equal("P5 고객 포인트 조회 → 이름 저장", p5CustomerLookup.json().customer?.name, "포인트손님");
  equal("P5 고객 포인트 조회 → 최근 이력", p5CustomerLookup.json().history[0]?.entryType, "EARN");
  check(
    "P5 고객 포인트 조회 → 만료일 3개월 뒤",
    Boolean(p5CustomerLookup.json().history[0]?.expiresAt),
    p5CustomerLookup.body
  );

  // 권한: 조회는 STAFF 가능, 조정/전체 원장은 불가
  await db.pool.query(
    `insert into public.employees (id, login_id, password_hash, name, role, is_active)
     values ('smoke-staff', 'smoke-staff', $1, '스모크직원', 'STAFF', true)`,
    [await hashPassword(staffPassword)]
  );

  const staffOnlyLogin = await app.inject({
    method: "POST",
    url: "/api/staff/login",
    headers: { "content-type": "application/json" },
    payload: { loginId: "smoke-staff", password: staffPassword },
  });
  const staffOnlyCookie = toCookieHeader(staffOnlyLogin);
  check("P5 직원(STAFF) 로그인 → 200", staffOnlyLogin.statusCode === 200, staffOnlyLogin.body);

  const staffPointLookup = await app.inject({
    method: "GET",
    url: "/api/points/customer?phone=01055556666",
    headers: { cookie: staffOnlyCookie },
  });
  check("P5 직원(STAFF) 포인트 조회 → 200", staffPointLookup.statusCode === 200, staffPointLookup.body);

  const staffLedgerList = await app.inject({
    method: "GET",
    url: "/api/points/ledger?phone=01055556666",
    headers: { cookie: staffOnlyCookie },
  });
  check("P5 직원(STAFF) 전체 원장 조회 → 403", staffLedgerList.statusCode === 403, staffLedgerList.body);

  const staffAdjust = await app.inject({
    method: "POST",
    url: "/api/points/adjust",
    headers: { "content-type": "application/json", cookie: staffOnlyCookie },
    payload: { phone: "01055556666", points: 1000, reason: "권한 테스트" },
  });
  check("P5 직원(STAFF) 포인트 조정 → 403", staffAdjust.statusCode === 403, staffAdjust.body);

  const ownerAdjust = await app.inject({
    method: "POST",
    url: "/api/points/adjust",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: { phone: "01055556666", points: 5000, reason: "테스트 지급" },
  });
  check("P5 사장 포인트 조정 → 200", ownerAdjust.statusCode === 200, ownerAdjust.body);
  equal("P5 사장 포인트 조정 → 잔액 5,500P", ownerAdjust.json().balance, 5500);

  const adjustWithoutReason = await app.inject({
    method: "POST",
    url: "/api/points/adjust",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: { phone: "01055556666", points: 1000, reason: "" },
  });
  check("P5 조정 사유 없음 → 400", adjustWithoutReason.statusCode === 400, adjustWithoutReason.body);

  const p5RedeemSheet = await app.inject({
    method: "POST",
    url: "/rest/v1/order_sheets?select=*",
    headers: {
      prefer: "return=representation",
      "content-type": "application/json",
      cookie: staffCookie,
    },
    payload: {
      id: "sheet-p5-redeem",
      sequence_no: 9102,
      business_date: new Date().toISOString(),
      table_number: "12",
      display_name: "No.12",
      total_amount: 40000,
      order_count: 1,
    },
  });
  check("P5 사용 주문서 생성 → 201", p5RedeemSheet.statusCode === 201, p5RedeemSheet.body);

  const p5SmallSheet = await app.inject({
    method: "POST",
    url: "/rest/v1/order_sheets?select=*",
    headers: {
      prefer: "return=representation",
      "content-type": "application/json",
      cookie: staffCookie,
    },
    payload: {
      id: "sheet-p5-small",
      sequence_no: 9103,
      business_date: new Date().toISOString(),
      table_number: "13",
      display_name: "No.13",
      total_amount: 25000,
      order_count: 1,
    },
  });
  check("P5 소액 주문서 생성 → 201", p5SmallSheet.statusCode === 201, p5SmallSheet.body);

  const belowMinRedeem = await app.inject({
    method: "POST",
    url: "/api/payments",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      orderSheetId: "sheet-p5-redeem",
      originalAmount: 40000,
      entries: [{ method: "CARD", amount: 39500 }],
      close: true,
      customerPhone: "01055556666",
      pointsUsed: 500,
    },
  });
  check("P5 1,000P 미만 사용 → 400", belowMinRedeem.statusCode === 400, belowMinRedeem.body);

  const notStepRedeem = await app.inject({
    method: "POST",
    url: "/api/payments",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      orderSheetId: "sheet-p5-redeem",
      originalAmount: 40000,
      entries: [{ method: "CARD", amount: 38500 }],
      close: true,
      customerPhone: "01055556666",
      pointsUsed: 1500,
    },
  });
  check("P5 1,000P 단위 아님 → 400", notStepRedeem.statusCode === 400, notStepRedeem.body);

  const smallPaymentRedeem = await app.inject({
    method: "POST",
    url: "/api/payments",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      orderSheetId: "sheet-p5-small",
      originalAmount: 25000,
      entries: [{ method: "CARD", amount: 22000 }],
      close: true,
      customerPhone: "01055556666",
      pointsUsed: 3000,
    },
  });
  check("P5 3만원 미만 결제 + 포인트 사용 → 400", smallPaymentRedeem.statusCode === 400, smallPaymentRedeem.body);

  const overBalanceRedeem = await app.inject({
    method: "POST",
    url: "/api/payments",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      orderSheetId: "sheet-p5-redeem",
      originalAmount: 40000,
      entries: [{ method: "CARD", amount: 31000 }],
      close: true,
      customerPhone: "01055556666",
      pointsUsed: 9000,
    },
  });
  check("P5 보유 포인트 초과 사용 → 400", overBalanceRedeem.statusCode === 400, overBalanceRedeem.body);

  const noPhoneRedeem = await app.inject({
    method: "POST",
    url: "/api/payments",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      orderSheetId: "sheet-p5-redeem",
      originalAmount: 40000,
      entries: [{ method: "CARD", amount: 37000 }],
      close: true,
      pointsUsed: 3000,
    },
  });
  check("P5 전화번호 없이 포인트 사용 → 400", noPhoneRedeem.statusCode === 400, noPhoneRedeem.body);

  const p5RedeemPayment = await app.inject({
    method: "POST",
    url: "/api/payments",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      orderSheetId: "sheet-p5-redeem",
      originalAmount: 40000,
      entries: [{ method: "CARD", amount: 37000 }],
      close: true,
      customerPhone: "01055556666",
      pointsUsed: 3000,
    },
  });
  check("P5 포인트 사용 결제 → 200", p5RedeemPayment.statusCode === 200, p5RedeemPayment.body);
  equal("P5 포인트 사용 결제 → 사용 포인트", p5RedeemPayment.json().pointsUsed, 3000);
  equal("P5 포인트 사용 결제 → 차감 후 결제 금액", p5RedeemPayment.json().totalAmount, 37000);
  equal("P5 포인트 사용 결제 → 실결제액 기준 적립", p5RedeemPayment.json().pointsEarned, 370);
  equal("P5 포인트 사용 결제 → 잔액 2,870P", p5RedeemPayment.json().pointsBalance, 2870);
  equal("P5 포인트 사용 결제 → 결제완료", p5RedeemPayment.json().paymentStatus, "COMPLETED");

  const p5RedeemSheetRow = await app.inject({
    method: "GET",
    url: "/rest/v1/order_sheets?select=*&id=eq.sheet-p5-redeem",
    headers: { cookie: staffCookie },
  });
  const p5RedeemRow = p5RedeemSheetRow.json()[0] || {};
  equal("P5 포인트 사용 → 주문서 points_used", p5RedeemRow.points_used, 3000);
  equal("P5 포인트 사용 → 주문서 total_amount", p5RedeemRow.total_amount, 37000);
  equal("P5 포인트 사용 → 주문서 paid_amount", p5RedeemRow.paid_amount, 37000);

  const p5CustomerAfterRedeem = await app.inject({
    method: "GET",
    url: "/api/points/customer?phone=01055556666",
    headers: { cookie: staffCookie },
  });
  equal("P5 사용 후 잔액", p5CustomerAfterRedeem.json().balance, 2870);
  check(
    "P5 사용 이력 기록(REDEEM −3,000P)",
    p5CustomerAfterRedeem
      .json()
      .history.some((entry) => entry.entryType === "REDEEM" && entry.points === -3000),
    p5CustomerAfterRedeem.body
  );

  const p5Ledger = await app.inject({
    method: "GET",
    url: "/api/points/ledger?phone=01055556666",
    headers: { cookie: staffCookie },
  });
  check("P5 포인트 원장 조회 → 200", p5Ledger.statusCode === 200, p5Ledger.body);
  equal("P5 포인트 원장 → 총 적립", p5Ledger.json().totals.earned, 870);
  equal("P5 포인트 원장 → 총 사용", p5Ledger.json().totals.redeemed, 3000);
  equal("P5 포인트 원장 → 총 조정", p5Ledger.json().totals.adjusted, 5000);
  equal("P5 포인트 원장 → 미사용 잔액(부채)", p5Ledger.json().totals.liability, 2870);

  // 환불 시 적립 포인트 회수(환불액의 1%, 잔액 범위 안)
  const p5PaymentId = p5RedeemPayment.json().payments[0]?.id || "";
  const p5Refund = await app.inject({
    method: "POST",
    url: `/api/payments/${p5PaymentId}/refund`,
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: { amount: 10000, reason: "포인트 회수 테스트" },
  });
  check("P5 환불 → 200", p5Refund.statusCode === 200, p5Refund.body);
  equal("P5 환불 → 적립 포인트 회수", p5Refund.json().pointsReclaimed, 100);

  const p5CustomerAfterRefund = await app.inject({
    method: "GET",
    url: "/api/points/customer?phone=01055556666",
    headers: { cookie: staffCookie },
  });
  equal("P5 환불 후 잔액", p5CustomerAfterRefund.json().balance, 2770);
  check(
    "P5 환불 회수 이력(ADJUST −100P)",
    p5CustomerAfterRefund
      .json()
      .history.some((entry) => entry.entryType === "ADJUST" && entry.points === -100),
    p5CustomerAfterRefund.body
  );

  // 만료: 조회 시점에 EXPIRE 행으로 확정(별도 크론 없음)
  const p5CustomerId = p5CustomerAfterRefund.json().customer?.id || "";

  await db.pool.query(
    `insert into public.point_ledger
       (id, customer_id, entry_type, points, balance_after, reason, expires_at, occurred_at)
     values ('ledger-p5-expired', $1, 'EARN', 400, 0, '만료 테스트',
             now() - interval '1 day', now() - interval '4 months')`,
    [p5CustomerId]
  );

  const p5AfterExpiry = await app.inject({
    method: "GET",
    url: "/api/points/customer?phone=01055556666",
    headers: { cookie: staffCookie },
  });
  check("P5 만료 처리 → 200", p5AfterExpiry.statusCode === 200, p5AfterExpiry.body);
  equal("P5 만료 처리 → 만료분 반영된 잔액", p5AfterExpiry.json().balance, 2770);
  check(
    "P5 만료 처리 → EXPIRE 행 기록",
    p5AfterExpiry
      .json()
      .history.some((entry) => entry.entryType === "EXPIRE" && entry.points === -400),
    p5AfterExpiry.body
  );
  check(
    "P5 만료된 포인트는 소멸 예정에서 제외",
    !p5AfterExpiry.json().expiringSoon.some((row) => row.points === 400),
    p5AfterExpiry.body
  );

  // ---------------------------------------------------------------- CRM (P6)
  // 고객 관리 화면은 crm.view(매니저 이상) 권한이 필요합니다.
  const crmList = await app.inject({
    method: "GET",
    url: "/api/crm/customers?q=01055556666",
    headers: { cookie: staffCookie },
  });
  check("P6 고객 목록 조회 → 200", crmList.statusCode === 200, crmList.body);

  const p6Customer = crmList.json().customers[0] || {};
  check("P6 고객 목록 → 기존 고객 검색", Boolean(p6Customer.id), crmList.body);
  equal("P6 고객 목록 → 보유 포인트(만료 반영)", p6Customer.balance, 2770);
  equal("P6 고객 목록 → 방문 횟수", p6Customer.visitCount, 1);
  equal("P6 고객 목록 → 누적 결제(환불 차감)", p6Customer.paidTotal, 77000);
  equal("P6 고객 목록 → 최초 마케팅 미동의", p6Customer.marketingConsent, false);

  const crmStaffList = await app.inject({
    method: "GET",
    url: "/api/crm/customers",
    headers: { cookie: staffOnlyCookie },
  });
  check("P6 직원(STAFF) 고객 목록 → 403", crmStaffList.statusCode === 403, crmStaffList.body);

  const crmAnonList = await app.inject({
    method: "GET",
    url: "/api/crm/customers",
  });
  check("P6 비로그인 고객 목록 → 401", crmAnonList.statusCode === 401, crmAnonList.body);

  const crmProfile = await app.inject({
    method: "GET",
    url: `/api/crm/customers/${p6Customer.id}`,
    headers: { cookie: staffCookie },
  });
  check("P6 고객 상세 → 200", crmProfile.statusCode === 200, crmProfile.body);
  equal("P6 고객 상세 → 방문 이력 2건", crmProfile.json().visits.length, 2);
  equal("P6 고객 상세 → 최근 방문 금액", crmProfile.json().visits[0]?.amount, 37000);
  equal("P6 고객 상세 → 최근 방문 환불액", crmProfile.json().visits[0]?.refundedAmount, 10000);

  const crmUpdate = await app.inject({
    method: "PATCH",
    url: `/api/crm/customers/${p6Customer.id}`,
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: { name: "스모크단골", memo: "매운 안주 선호" },
  });
  check("P6 고객 정보 수정 → 200", crmUpdate.statusCode === 200, crmUpdate.body);
  equal("P6 고객 정보 수정 → 이름", crmUpdate.json().customer.name, "스모크단골");
  equal("P6 고객 정보 수정 → 메모", crmUpdate.json().customer.memo, "매운 안주 선호");
  equal("P6 고객 정보 수정 → 동의는 그대로", crmUpdate.json().customer.marketingConsent, false);

  const crmConsent = await app.inject({
    method: "PATCH",
    url: `/api/crm/customers/${p6Customer.id}`,
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: { marketingConsent: true },
  });
  check("P6 마케팅 동의 설정 → 200", crmConsent.statusCode === 200, crmConsent.body);
  equal("P6 마케팅 동의 설정 → 동의", crmConsent.json().customer.marketingConsent, true);
  check(
    "P6 마케팅 동의 설정 → 동의 시각 기록",
    Boolean(crmConsent.json().customer.marketingConsentAt),
    crmConsent.body
  );

  const crmConsentList = await app.inject({
    method: "GET",
    url: "/api/crm/customers?consent=yes",
    headers: { cookie: staffCookie },
  });
  check(
    "P6 동의 고객 필터 → 포함",
    crmConsentList.json().customers.some((row) => row.id === p6Customer.id),
    crmConsentList.body
  );
  check("P6 동의 고객 요약", crmConsentList.json().summary.consented >= 1, crmConsentList.body);

  const crmNoConsentList = await app.inject({
    method: "GET",
    url: "/api/crm/customers?consent=no",
    headers: { cookie: staffCookie },
  });
  check(
    "P6 미동의 고객 필터 → 제외",
    !crmNoConsentList.json().customers.some((row) => row.id === p6Customer.id),
    crmNoConsentList.body
  );

  // 결제하면서 받은 마케팅 동의는 결제 트랜잭션 안에서 저장됩니다.
  const p6Sheet = await app.inject({
    method: "POST",
    url: "/rest/v1/order_sheets?select=*",
    headers: {
      prefer: "return=representation",
      "content-type": "application/json",
      cookie: staffCookie,
    },
    payload: {
      id: "sheet-p6-consent",
      sequence_no: 9201,
      business_date: new Date().toISOString(),
      table_number: "21",
      display_name: "No.21",
      total_amount: 30000,
      order_count: 1,
    },
  });
  check("P6 동의 결제 주문서 생성 → 201", p6Sheet.statusCode === 201, p6Sheet.body);

  const p6Payment = await app.inject({
    method: "POST",
    url: "/api/payments",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      orderSheetId: "sheet-p6-consent",
      originalAmount: 30000,
      entries: [{ method: "CARD", amount: 30000 }],
      close: true,
      customerPhone: "01099990000",
      customerName: "신규동의",
      marketingConsent: true,
    },
  });
  check("P6 결제 + 마케팅 동의 → 200", p6Payment.statusCode === 200, p6Payment.body);
  equal("P6 결제 + 마케팅 동의 → 적립", p6Payment.json().pointsEarned, 300);
  equal("P6 결제 + 마케팅 동의 → 응답 동의", p6Payment.json().customer?.marketingConsent, true);

  const p6NewCustomerList = await app.inject({
    method: "GET",
    url: "/api/crm/customers?q=01099990000",
    headers: { cookie: staffCookie },
  });
  const p6NewCustomer = p6NewCustomerList.json().customers[0] || {};
  equal("P6 결제 고객 → 방문 횟수", p6NewCustomer.visitCount, 1);
  equal("P6 결제 고객 → 누적 결제", p6NewCustomer.paidTotal, 30000);
  equal("P6 결제 고객 → 보유 포인트", p6NewCustomer.balance, 300);
  equal("P6 결제 고객 → 마케팅 동의 저장", p6NewCustomer.marketingConsent, true);

  const p6PaymentId = p6Payment.json().payments[0]?.id || "";
  const { rows: p6PaymentRows } = await db.pool.query(
    `select customer_id from public.payments where id = $1`,
    [p6PaymentId]
  );
  equal("P6 결제 → payments.customer_id 연결", p6PaymentRows[0]?.customer_id, p6NewCustomer.id);

  const { rows: p6AuditRows } = await db.pool.query(
    `select action, target_type from public.admin_audit_logs
      where action = 'customer.consent' and target_id = $1`,
    [p6Customer.id]
  );
  check("P6 마케팅 동의 감사 로그", p6AuditRows.length === 1, p6AuditRows);

  // ---------------------------------------------------------------- marketing (P7)
  // 회원 식별자는 휴대폰 번호입니다. 카카오 로그인 없이 문자/알림톡만 발송합니다.
  const mktSettings = await app.inject({
    method: "GET",
    url: "/api/marketing/settings",
    headers: { cookie: staffCookie },
  });
  check("P7 마케팅 설정 → 200", mktSettings.statusCode === 200, mktSettings.body);
  equal("P7 마케팅 설정 → 기본 검수용 모드", mktSettings.json().dryRun, true);
  equal("P7 마케팅 설정 → 발송 방식 3종", mktSettings.json().channels.length, 3);

  const mktStaffSettings = await app.inject({
    method: "GET",
    url: "/api/marketing/settings",
    headers: { cookie: staffOnlyCookie },
  });
  check(
    "P7 직원(STAFF) 마케팅 설정 → 403",
    mktStaffSettings.statusCode === 403,
    mktStaffSettings.body
  );

  const mktAnon = await app.inject({
    method: "GET",
    url: "/api/marketing/campaigns",
  });
  check("P7 비로그인 캠페인 목록 → 401", mktAnon.statusCode === 401, mktAnon.body);

  const mktSegments = await app.inject({
    method: "GET",
    url: "/api/marketing/segments",
    headers: { cookie: staffCookie },
  });
  check("P7 발송 대상 집계 → 200", mktSegments.statusCode === 200, mktSegments.body);

  const mktConsented = mktSegments
    .json()
    .segments.find((row) => row.value === "CONSENTED") || { count: 0 };
  equal("P7 동의 회원 수", mktConsented.count, 2);

  const mktPointsSegments = mktSegments
    .json()
    .segments.find((row) => row.value === "POINTS") || { count: 0 };
  check("P7 포인트 보유(1,000P↑) 대상 포함", mktPointsSegments.count >= 1, mktSegments.body);

  const mktAudience = await app.inject({
    method: "GET",
    url: "/api/marketing/audience?segment=CONSENTED",
    headers: { cookie: staffCookie },
  });
  check("P7 발송 대상 미리보기 → 200", mktAudience.statusCode === 200, mktAudience.body);
  equal("P7 발송 대상 미리보기 → 인원", mktAudience.json().total, 2);
  check(
    "P7 발송 대상 미리보기 → 번호는 보기 좋게",
    /^010-\d{4}-\d{4}$/.test(mktAudience.json().sample[0]?.phoneText || ""),
    mktAudience.body
  );

  const mktBadSegment = await app.inject({
    method: "GET",
    url: "/api/marketing/audience?segment=NOPE",
    headers: { cookie: staffCookie },
  });
  check("P7 잘못된 대상 → 400", mktBadSegment.statusCode === 400, mktBadSegment.body);

  const mktNoTitle = await app.inject({
    method: "POST",
    url: "/api/marketing/campaigns",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: { title: "", body: "내용", channel: "SMS", segment: "CONSENTED" },
  });
  check("P7 제목 없는 캠페인 → 400", mktNoTitle.statusCode === 400, mktNoTitle.body);

  const mktStaffCreate = await app.inject({
    method: "POST",
    url: "/api/marketing/campaigns",
    headers: { "content-type": "application/json", cookie: staffOnlyCookie },
    payload: { title: "권한없음", body: "내용", channel: "SMS", segment: "CONSENTED" },
  });
  check(
    "P7 직원(STAFF) 캠페인 생성 → 403",
    mktStaffCreate.statusCode === 403,
    mktStaffCreate.body
  );

  const mktCreate = await app.inject({
    method: "POST",
    url: "/api/marketing/campaigns",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      title: "스모크 재방문 안내",
      body: "#{이름}님, 보유 포인트 #{포인트}P 예요.",
      channel: "SMS",
      segment: "CONSENTED",
    },
  });
  check("P7 캠페인 저장 → 201", mktCreate.statusCode === 201, mktCreate.body);
  equal("P7 캠페인 저장 → 작성 중", mktCreate.json().status, "DRAFT");
  equal("P7 캠페인 저장 → 대상 인원", mktCreate.json().targetCount, 2);

  const mktCampaignId = mktCreate.json().id;

  const mktSend = await app.inject({
    method: "POST",
    url: `/api/marketing/campaigns/${mktCampaignId}/send`,
    headers: { cookie: staffCookie },
  });
  check("P7 캠페인 발송 → 200", mktSend.statusCode === 200, mktSend.body);
  equal("P7 캠페인 발송 → 성공 건수", mktSend.json().sent, 2);
  equal("P7 캠페인 발송 → 실패 건수", mktSend.json().failed, 0);
  equal("P7 캠페인 발송 → 상태", mktSend.json().campaign.status, "SENT");
  equal("P7 캠페인 발송 → 성공 = 대상", mktSend.json().campaign.sentCount, 2);
  equal("P7 캠페인 발송 → 실패 0", mktSend.json().campaign.failedCount, 0);

  const mktSendAgain = await app.inject({
    method: "POST",
    url: `/api/marketing/campaigns/${mktCampaignId}/send`,
    headers: { cookie: staffCookie },
  });
  check("P7 같은 캠페인 재발송 → 409", mktSendAgain.statusCode === 409, mktSendAgain.body);

  const mktRetry = await app.inject({
    method: "POST",
    url: `/api/marketing/campaigns/${mktCampaignId}/retry`,
    headers: { cookie: staffCookie },
  });
  check("P7 실패 건 없을 때 재발송 → 200", mktRetry.statusCode === 200, mktRetry.body);
  equal("P7 재발송 → 새로 보낸 건 없음", mktRetry.json().sent, 0);

  const mktDetail = await app.inject({
    method: "GET",
    url: `/api/marketing/campaigns/${mktCampaignId}`,
    headers: { cookie: staffCookie },
  });
  check("P7 캠페인 상세 → 200", mktDetail.statusCode === 200, mktDetail.body);
  equal("P7 캠페인 상세 → 발송 기록 2건", mktDetail.json().logs.length, 2);
  check(
    "P7 캠페인 상세 → 모두 발송 완료",
    mktDetail.json().logs.every((row) => row.status === "SENT"),
    mktDetail.body
  );

  const { rows: mktAuditRows } = await db.pool.query(
    `select action from public.admin_audit_logs
      where action = 'marketing.send' and target_id = $1`,
    [mktCampaignId]
  );
  check("P7 발송 감사 로그", mktAuditRows.length === 1, mktAuditRows);

  // 수신거부 링크는 손님이 로그인 없이 엽니다.
  const { rows: mktTokenRows } = await db.pool.query(
    `select marketing_opt_out_token as token, marketing_consent_source as source
       from public.customers where id = $1`,
    [p6Customer.id]
  );
  check("P7 수신거부 토큰 발급", Boolean(mktTokenRows[0]?.token), mktTokenRows);
  equal("P7 동의 경로 기록", mktTokenRows[0]?.source, "ADMIN");

  const mktUnsubInfo = await app.inject({
    method: "GET",
    url: `/api/marketing/unsubscribe?token=${mktTokenRows[0].token}`,
  });
  check("P7 수신거부 안내 → 200", mktUnsubInfo.statusCode === 200, mktUnsubInfo.body);
  check(
    "P7 수신거부 안내 → 번호 가림",
    String(mktUnsubInfo.json().phoneText).includes("****"),
    mktUnsubInfo.body
  );

  const mktUnsubBad = await app.inject({
    method: "GET",
    url: "/api/marketing/unsubscribe?token=nope",
  });
  check("P7 잘못된 수신거부 링크 → 404", mktUnsubBad.statusCode === 404, mktUnsubBad.body);

  const mktUnsub = await app.inject({
    method: "POST",
    url: "/api/marketing/unsubscribe",
    headers: { "content-type": "application/json" },
    payload: { token: mktTokenRows[0].token },
  });
  check("P7 수신거부 처리 → 200", mktUnsub.statusCode === 200, mktUnsub.body);

  const { rows: mktAfterUnsub } = await db.pool.query(
    `select marketing_consent as consent, marketing_consent_source as source
       from public.customers where id = $1`,
    [p6Customer.id]
  );
  equal("P7 수신거부 → 동의 해제", mktAfterUnsub[0]?.consent, false);
  equal("P7 수신거부 → 경로 기록", mktAfterUnsub[0]?.source, "CUSTOMER");

  const mktSegmentsAfter = await app.inject({
    method: "GET",
    url: "/api/marketing/segments",
    headers: { cookie: staffCookie },
  });
  equal(
    "P7 수신거부 고객은 대상에서 제외",
    mktSegmentsAfter.json().segments.find((row) => row.value === "CONSENTED").count,
    1
  );

  const mktCsv = await app.inject({
    method: "GET",
    url: "/api/marketing/audience/export?segment=CONSENTED",
    headers: { cookie: staffCookie },
  });
  check("P7 명단 CSV → 200", mktCsv.statusCode === 200, mktCsv.body);
  check(
    "P7 명단 CSV → 헤더",
    mktCsv.body.startsWith("\uFEFF휴대폰번호,"),
    mktCsv.body.slice(0, 40)
  );
  equal("P7 명단 CSV → 헤더 + 1명", mktCsv.body.trim().split("\n").length, 2);

  // ---------------------------------------------------------------- coupons (P8)
  // 재방문 쿠폰은 사장(marketing.manage)만 발급/취소하고, 사용은 결제 화면에서 합니다.
  const p8Issue = await app.inject({
    method: "POST",
    url: `/api/crm/customers/${p6NewCustomer.id}/coupons`,
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      title: "재방문 3,000원 할인",
      discountType: "AMOUNT",
      discountValue: 3000,
      minAmount: 0,
      expiresInDays: 30,
    },
  });
  check("P8 쿠폰 발급 → 200", p8Issue.statusCode === 200, p8Issue.body);
  equal("P8 쿠폰 발급 → 이름", p8Issue.json().coupon?.title, "재방문 3,000원 할인");
  equal("P8 쿠폰 발급 → 상태", p8Issue.json().coupon?.status, "ACTIVE");

  const p8CouponId = p8Issue.json().coupon?.id || "";

  const p8IssueStaff = await app.inject({
    method: "POST",
    url: `/api/crm/customers/${p6NewCustomer.id}/coupons`,
    headers: { "content-type": "application/json", cookie: staffOnlyCookie },
    payload: { title: "권한 테스트", discountType: "AMOUNT", discountValue: 1000 },
  });
  check("P8 직원(STAFF) 쿠폰 발급 → 403", p8IssueStaff.statusCode === 403, p8IssueStaff.body);

  const p8BadPercent = await app.inject({
    method: "POST",
    url: `/api/crm/customers/${p6NewCustomer.id}/coupons`,
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: { title: "말도 안 되는 할인", discountType: "PERCENT", discountValue: 150 },
  });
  check("P8 정률 100% 초과 → 400", p8BadPercent.statusCode === 400, p8BadPercent.body);

  const p8List = await app.inject({
    method: "GET",
    url: `/api/crm/customers/${p6NewCustomer.id}/coupons`,
    headers: { cookie: staffCookie },
  });
  check("P8 쿠폰 목록 → 200", p8List.statusCode === 200, p8List.body);
  equal("P8 쿠폰 목록 → 1건", p8List.json().coupons.length, 1);

  const p8Lookup = await app.inject({
    method: "GET",
    url: "/api/payments/coupons?phone=01099990000&baseAmount=30000",
    headers: { cookie: staffCookie },
  });
  check("P8 결제 쿠폰 조회 → 200", p8Lookup.statusCode === 200, p8Lookup.body);
  equal("P8 결제 쿠폰 조회 → 할인 금액", p8Lookup.json().coupons[0]?.discountAmount, 3000);

  const p8Sheet = await app.inject({
    method: "POST",
    url: "/rest/v1/order_sheets?select=*",
    headers: {
      prefer: "return=representation",
      "content-type": "application/json",
      cookie: staffCookie,
    },
    payload: {
      id: "sheet-p8-coupon",
      sequence_no: 9301,
      business_date: new Date().toISOString(),
      table_number: "22",
      display_name: "No.22",
      total_amount: 30000,
      order_count: 1,
    },
  });
  check("P8 쿠폰 결제 주문서 생성 → 201", p8Sheet.statusCode === 201, p8Sheet.body);

  const p8NoPhone = await app.inject({
    method: "POST",
    url: "/api/payments",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      orderSheetId: "sheet-p8-coupon",
      originalAmount: 30000,
      couponIds: [p8CouponId],
      entries: [{ method: "CARD", amount: 27000 }],
      close: true,
    },
  });
  check("P8 전화번호 없이 쿠폰 사용 → 400", p8NoPhone.statusCode === 400, p8NoPhone.body);

  const p8Payment = await app.inject({
    method: "POST",
    url: "/api/payments",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      orderSheetId: "sheet-p8-coupon",
      originalAmount: 30000,
      couponIds: [p8CouponId],
      entries: [{ method: "CARD", amount: 27000 }],
      close: true,
      customerPhone: "01099990000",
    },
  });
  check("P8 쿠폰 결제 → 200", p8Payment.statusCode === 200, p8Payment.body);
  equal("P8 쿠폰 결제 → 응답 쿠폰 수", p8Payment.json().coupons?.length, 1);
  equal("P8 쿠폰 결제 → 쿠폰 할인 금액", p8Payment.json().coupons?.[0]?.amount, 3000);

  const { rows: p8SheetRows } = await db.pool.query(
    `select original_amount, discount_total, total_amount, discounts
       from public.order_sheets where id = 'sheet-p8-coupon'`
  );
  equal("P8 쿠폰 결제 → 주문 금액", p8SheetRows[0]?.original_amount, 30000);
  equal("P8 쿠폰 결제 → 할인 합계", p8SheetRows[0]?.discount_total, 3000);
  equal("P8 쿠폰 결제 → 최종 금액", p8SheetRows[0]?.total_amount, 27000);
  check(
    "P8 쿠폰 결제 → discounts 에 쿠폰 기록",
    Array.isArray(p8SheetRows[0]?.discounts) && p8SheetRows[0].discounts.length === 1,
    p8SheetRows[0]?.discounts
  );

  const { rows: p8CouponRows } = await db.pool.query(
    `select used_at, used_order_sheet_id, used_payment_id from public.coupons where id = $1`,
    [p8CouponId]
  );
  check("P8 쿠폰 사용 처리", Boolean(p8CouponRows[0]?.used_at), p8CouponRows[0]);
  equal("P8 쿠폰 → 주문서 연결", p8CouponRows[0]?.used_order_sheet_id, "sheet-p8-coupon");
  check("P8 쿠폰 → 결제 연결", Boolean(p8CouponRows[0]?.used_payment_id), p8CouponRows[0]);

  const p8ReuseSheet = await app.inject({
    method: "POST",
    url: "/rest/v1/order_sheets?select=*",
    headers: {
      prefer: "return=representation",
      "content-type": "application/json",
      cookie: staffCookie,
    },
    payload: {
      id: "sheet-p8-reuse",
      sequence_no: 9302,
      business_date: new Date().toISOString(),
      table_number: "23",
      display_name: "No.23",
      total_amount: 30000,
      order_count: 1,
    },
  });
  check("P8 재사용 확인용 주문서 생성 → 201", p8ReuseSheet.statusCode === 201, p8ReuseSheet.body);

  const p8Reuse = await app.inject({
    method: "POST",
    url: "/api/payments",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      orderSheetId: "sheet-p8-reuse",
      originalAmount: 30000,
      couponIds: [p8CouponId],
      entries: [{ method: "CARD", amount: 27000 }],
      close: true,
      customerPhone: "01099990000",
    },
  });
  check("P8 사용한 쿠폰 재사용 → 409", p8Reuse.statusCode === 409, p8Reuse.body);

  const p8VoidIssue = await app.inject({
    method: "POST",
    url: `/api/crm/customers/${p6NewCustomer.id}/coupons`,
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: { title: "취소 테스트", discountType: "PERCENT", discountValue: 10 },
  });
  const p8VoidId = p8VoidIssue.json().coupon?.id || "";

  const p8Void = await app.inject({
    method: "POST",
    url: `/api/crm/coupons/${p8VoidId}/void`,
    headers: { "content-type": "application/json", cookie: staffCookie },
  });
  check("P8 쿠폰 취소 → 200", p8Void.statusCode === 200, p8Void.body);
  equal("P8 쿠폰 취소 → 상태", p8Void.json().coupon?.status, "VOID");

  const p8LookupAfterVoid = await app.inject({
    method: "GET",
    url: "/api/payments/coupons?phone=01099990000&baseAmount=30000",
    headers: { cookie: staffCookie },
  });
  equal("P8 취소/사용한 쿠폰은 결제 조회에서 제외", p8LookupAfterVoid.json().coupons.length, 0);

  const p8AnonLookup = await app.inject({
    method: "GET",
    url: "/api/payments/coupons?phone=01099990000",
  });
  check("P8 비로그인 쿠폰 조회 → 401", p8AnonLookup.statusCode === 401, p8AnonLookup.body);

  // ---------------------------------------------------------------- employees (P9)
  const p9Catalog = await app.inject({
    method: "GET",
    url: "/api/admin/permissions",
    headers: { cookie: staffCookie },
  });
  check("P9 권한 목록 → 200", p9Catalog.statusCode === 200, p9Catalog.body);
  check(
    "P9 권한 목록 → 그룹/권한 포함",
    Array.isArray(p9Catalog.json().groups) &&
      p9Catalog.json().groups.length > 0 &&
      p9Catalog.json().roles.length === 3,
    p9Catalog.body
  );

  const p9AnonCatalog = await app.inject({
    method: "GET",
    url: "/api/admin/permissions",
  });
  check("P9 비로그인 권한 목록 → 401", p9AnonCatalog.statusCode === 401, p9AnonCatalog.body);

  // 사장이 직원을 만들면서 결제 조회 권한만 직접 부여합니다.
  // 알 수 없는 권한 문자열은 서버가 조용히 버립니다.
  const p9Create = await app.inject({
    method: "POST",
    url: "/api/admin/employees",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      loginId: "smoke-staff-p9",
      name: "스모크직원",
      password: "smoke-staff-password",
      role: "STAFF",
      permissions: ["payment.view", "bogus.permission"],
    },
  });
  check("P9 직원 생성 → 200", p9Create.statusCode === 200, p9Create.body);
  equal(
    "P9 직원 생성 → 직접 설정 권한만 저장",
    p9Create.json().employee?.permissions,
    ["payment.view"]
  );
  equal(
    "P9 직원 생성 → 직접 설정 표시",
    p9Create.json().employee?.permissionOverrides,
    ["payment.view"]
  );

  const p9List = await app.inject({
    method: "GET",
    url: "/api/admin/employees",
    headers: { cookie: staffCookie },
  });
  check(
    "P9 직원 목록 → 새 직원 포함",
    p9List.json().employees.some((row) => row.loginId === "smoke-staff-p9"),
    p9List.body
  );

  const p9StaffLogin = await app.inject({
    method: "POST",
    url: "/api/staff/login",
    headers: { "content-type": "application/json" },
    payload: { loginId: "smoke-staff-p9", password: "smoke-staff-password" },
  });
  check("P9 부여된 권한으로 로그인 → 200", p9StaffLogin.statusCode === 200, p9StaffLogin.body);
  const p9StaffCookie = toCookieHeader(p9StaffLogin);

  const p9Me = await app.inject({
    method: "GET",
    url: "/api/staff/me",
    headers: { cookie: p9StaffCookie },
  });
  equal("P9 세션 권한 = 직접 설정값", p9Me.json().employee?.permissions, ["payment.view"]);

  const p9Allowed = await app.inject({
    method: "GET",
    url: "/api/payments/coupons?phone=01011112222",
    headers: { cookie: p9StaffCookie },
  });
  check("P9 부여된 권한의 API → 200", p9Allowed.statusCode === 200, p9Allowed.body);

  const p9DeniedEmployee = await app.inject({
    method: "GET",
    url: "/api/admin/employees",
    headers: { cookie: p9StaffCookie },
  });
  check("P9 권한 없는 직원 관리 → 403", p9DeniedEmployee.statusCode === 403, p9DeniedEmployee.body);

  const p9DeniedMarketing = await app.inject({
    method: "GET",
    url: "/api/marketing/settings",
    headers: { cookie: p9StaffCookie },
  });
  check("P9 권한 없는 마케팅 → 403", p9DeniedMarketing.statusCode === 403, p9DeniedMarketing.body);

  const p9StaffId = p9Create.json().employee.id;

  const p9Patch = await app.inject({
    method: "PATCH",
    url: `/api/admin/employees/${p9StaffId}`,
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: { permissions: ["payment.view", "sales.view"] },
  });
  check("P9 권한 수정 → 200", p9Patch.statusCode === 200, p9Patch.body);
  equal(
    "P9 권한 수정 → 반영",
    p9Patch.json().employee?.permissionOverrides,
    ["payment.view", "sales.view"]
  );

  const p9StaleSession = await app.inject({
    method: "GET",
    url: "/api/staff/me",
    headers: { cookie: p9StaffCookie },
  });
  check("P9 권한 변경 → 기존 세션 무효화", p9StaleSession.statusCode === 401, p9StaleSession.body);

  const p9StaffLogin2 = await app.inject({
    method: "POST",
    url: "/api/staff/login",
    headers: { "content-type": "application/json" },
    payload: { loginId: "smoke-staff-p9", password: "smoke-staff-password" },
  });
  const p9StaffCookie2 = toCookieHeader(p9StaffLogin2);
  const p9DeniedMarketing2 = await app.inject({
    method: "GET",
    url: "/api/marketing/settings",
    headers: { cookie: p9StaffCookie2 },
  });
  check("P9 재로그인 후에도 없는 권한은 403", p9DeniedMarketing2.statusCode === 403, p9DeniedMarketing2.body);

  const p9Reset = await app.inject({
    method: "PATCH",
    url: `/api/admin/employees/${p9StaffId}`,
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: { permissions: null },
  });
  equal("P9 역할 기본값으로 되돌리기", p9Reset.json().employee?.permissionOverrides, null);
  check(
    "P9 역할 기본값 권한 수 복원",
    (p9Reset.json().employee?.permissions || []).length > 1,
    p9Reset.body
  );

  const p9OwnerPatch = await app.inject({
    method: "PATCH",
    url: "/api/admin/employees/smoke-owner",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: { permissions: ["order.view"] },
  });
  check(
    "P9 사장 계정 권한은 직접 설정 불가",
    p9OwnerPatch.statusCode === 200 &&
      p9OwnerPatch.json().employee?.permissionOverrides === null &&
      p9OwnerPatch.json().employee?.permissions?.includes("employee.manage"),
    p9OwnerPatch.body
  );

  // 직원 관리 권한을 위임받은 매니저라도 사장 계정은 건드릴 수 없어야 합니다.
  const p9ManagerCreate = await app.inject({
    method: "POST",
    url: "/api/admin/employees",
    headers: { "content-type": "application/json", cookie: staffCookie },
    payload: {
      loginId: "smoke-manager-p9",
      name: "스모크매니저",
      password: "smoke-manager-password",
      role: "MANAGER",
      permissions: ["employee.manage"],
    },
  });
  check("P9 매니저 생성 + 직원 관리 위임 → 200", p9ManagerCreate.statusCode === 200, p9ManagerCreate.body);

  const p9ManagerLogin = await app.inject({
    method: "POST",
    url: "/api/staff/login",
    headers: { "content-type": "application/json" },
    payload: { loginId: "smoke-manager-p9", password: "smoke-manager-password" },
  });
  const p9ManagerCookie = toCookieHeader(p9ManagerLogin);

  const p9ManagerOwnerPatch = await app.inject({
    method: "PATCH",
    url: "/api/admin/employees/smoke-owner",
    headers: { "content-type": "application/json", cookie: p9ManagerCookie },
    payload: { isActive: false },
  });
  check(
    "P9 매니저는 사장 계정 변경 불가 → 403",
    p9ManagerOwnerPatch.statusCode === 403,
    p9ManagerOwnerPatch.body
  );

  const p9ManagerCreateStaff = await app.inject({
    method: "POST",
    url: "/api/admin/employees",
    headers: { "content-type": "application/json", cookie: p9ManagerCookie },
    payload: {
      loginId: "smoke-staff2",
      name: "스모크직원2",
      password: "smoke-staff2-password",
      role: "STAFF",
    },
  });
  equal("P9 위임받은 매니저는 직원 생성 가능 → 기본 권한", p9ManagerCreateStaff.statusCode, 200);
  equal(
    "P9 기본 권한으로 만든 직원은 직접 설정 없음",
    p9ManagerCreateStaff.json().employee?.permissionOverrides,
    null
  );

  // ---------------------------------------------------------------- select
  const list = await app.inject({
    method: "GET",
    url: "/rest/v1/categories?select=id,name&order=sort_order.desc&limit=2",
  });
  check("GET categories → 200", list.statusCode === 200, list.body);
  equal("GET categories → 정렬/개수", list.json().map((row) => row.id), ["cat-1", "cat-3"]);

  const eq = await app.inject({ method: "GET", url: "/rest/v1/categories?select=*&id=eq.cat-2" });
  equal("필터 eq → maybeSingle 형태(배열 1건)", eq.json().length, 1);

  const none = await app.inject({ method: "GET", url: "/rest/v1/categories?select=*&id=eq.nope" });
  equal("필터 eq(없음) → 빈 배열", none.json(), []);

  const inFilter = await app.inject({
    method: "GET",
    url: "/rest/v1/categories?select=id&id=in.(cat-1,cat-2)",
  });
  equal("필터 in → 2건", inFilter.json().length, 2);

  const likeFilter = await app.inject({
    method: "GET",
    url: "/rest/v1/categories?select=id&code=like.*S*",
  });
  equal("필터 like(*→%) → 2건", likeFilter.json().length, 2);

  const contains = await app.inject({
    method: "GET",
    url: "/rest/v1/products?select=id&category_ids=cs.{cat-3}",
  });
  equal("필터 contains(array) → 1건", contains.json().length, 1);

  await app.inject({
    method: "POST",
    url: "/rest/v1/products",
    headers: { "content-type": "application/json" },
    payload: { id: "prod-soldout", product_name: "품절 테스트", is_active: true, is_sold_out: true },
  });
  const isFilter = await app.inject({
    method: "GET",
    url: "/rest/v1/products?select=id&is_sold_out=is.false",
  });
  check("필터 is.false → 품절 상품 제외", !isFilter.json().some((row) => row.id === "prod-soldout"), isFilter.body);

  const range = await app.inject({
    method: "GET",
    url: "/rest/v1/categories?select=id&order=id.asc",
    headers: { range: "1-1", "range-unit": "items" },
  });
  equal("Range 헤더(1-1) → offset 1 / 1건", range.json().map((row) => row.id), ["cat-2"]);

  const single = await app.inject({
    method: "GET",
    url: "/rest/v1/categories?select=id&id=eq.cat-1",
    headers: { accept: "application/vnd.pgrst.object+json" },
  });
  check("Accept object+json → 객체 1건", single.statusCode === 200 && single.json().id === "cat-1", single.body);

  const singleTooMany = await app.inject({
    method: "GET",
    url: "/rest/v1/categories?select=id",
    headers: { accept: "application/vnd.pgrst.object+json" },
  });
  check("Accept object+json (2건 이상) → 406", singleTooMany.statusCode === 406, String(singleTooMany.statusCode));

  const counted = await app.inject({
    method: "GET",
    url: "/rest/v1/categories?select=id&limit=1",
    headers: { prefer: "count=exact" },
  });
  check(
    "Prefer count=exact → content-range 총계",
    String(counted.headers["content-range"] || "").endsWith("/3"),
    String(counted.headers["content-range"])
  );

  // ---------------------------------------------------------------- update
  const patch = await app.inject({
    method: "PATCH",
    url: "/rest/v1/categories?id=eq.cat-3&select=*",
    headers: { prefer: "return=representation", "content-type": "application/json" },
    payload: { name: "소프트드링크" },
  });
  check("PATCH → 200", patch.statusCode === 200, patch.body);
  equal("PATCH → 변경 반영", patch.json()[0].name, "소프트드링크");

  const patchMinimal = await app.inject({
    method: "PATCH",
    url: "/rest/v1/categories?id=eq.cat-3",
    headers: { "content-type": "application/json" },
    payload: { name: "음료" },
  });
  check("PATCH(minimal) → 204", patchMinimal.statusCode === 204, String(patchMinimal.statusCode));

  // ---------------------------------------------------------------- upsert
  const upsert = await app.inject({
    method: "POST",
    url: "/rest/v1/categories?on_conflict=id&select=*",
    headers: {
      prefer: "return=representation,resolution=merge-duplicates",
      "content-type": "application/json",
    },
    payload: { id: "cat-1", name: "시그니처 칵테일", code: "SIG", sort_order: 30 },
  });
  check("UPSERT → 201", upsert.statusCode === 201, upsert.body);
  equal("UPSERT → 값 갱신", upsert.json()[0].name, "시그니처 칵테일");

  const afterUpsert = await app.inject({ method: "GET", url: "/rest/v1/categories?select=id" });
  equal("UPSERT → 행 수 변화 없음", afterUpsert.json().length, 3);

  const mergeInsert = await app.inject({
    method: "POST",
    url: "/rest/v1/categories?on_conflict=id",
    headers: { "content-type": "application/json" },
    payload: { id: "cat-1", name: "시그니처 칵테일" },
  });
  check("UPSERT(초기화 후 재삽입) → 201", mergeInsert.statusCode === 201, mergeInsert.body);

  // ---------------------------------------------------------------- delete
  const delMinimal = await app.inject({ method: "DELETE", url: "/rest/v1/products?id=eq.prod-soldout" });
  check("DELETE(minimal) → 204", delMinimal.statusCode === 204, String(delMinimal.statusCode));

  await app.inject({
    method: "POST",
    url: "/rest/v1/products",
    headers: { "content-type": "application/json" },
    payload: { id: "prod-2", product_name: "삭제 테스트", base_price: 5000 },
  });
  const delRepresentation = await app.inject({
    method: "DELETE",
    url: "/rest/v1/products?id=eq.prod-2&select=id",
    headers: { prefer: "return=representation" },
  });
  equal("DELETE(representation) → 삭제된 id 반환", delRepresentation.json(), [{ id: "prod-2" }]);

  // postgrest-js 는 본문이 없는 DELETE 에도 content-type: application/json 을 붙입니다.
  // 이때 400(FST_ERR_CTP_EMPTY_JSON_BODY) 이 나면 브라우저에서 삭제가 전부 실패합니다.
  await app.inject({
    method: "POST",
    url: "/rest/v1/products",
    headers: { "content-type": "application/json" },
    payload: { id: "prod-4", product_name: "빈 본문 삭제", base_price: 1000 },
  });
  const delEmptyJsonBody = await app.inject({
    method: "DELETE",
    url: "/rest/v1/products?id=eq.prod-4",
    headers: { "content-type": "application/json" },
  });
  check(
    "DELETE(빈 본문 + content-type json) → 204",
    delEmptyJsonBody.statusCode === 204,
    delEmptyJsonBody.body
  );

  const insertEmptyBody = await app.inject({
    method: "POST",
    url: "/rest/v1/products",
    headers: { "content-type": "application/json" },
  });
  check("POST(빈 본문) → 400", insertEmptyBody.statusCode === 400, insertEmptyBody.body);

  const invalidJson = await app.inject({
    method: "POST",
    url: "/rest/v1/products",
    headers: { "content-type": "application/json" },
    payload: "{not json",
  });
  check("POST(깨진 JSON) → 400", invalidJson.statusCode === 400, invalidJson.body);

  // ---------------------------------------------------------------- errors
  const unknownTable = await app.inject({ method: "GET", url: "/rest/v1/not_a_table?select=*" });
  check("없는 테이블 → 404", unknownTable.statusCode === 404, String(unknownTable.statusCode));

  const unknownColumn = await app.inject({ method: "GET", url: "/rest/v1/categories?nope=eq.1" });
  check("없는 컬럼 → 400", unknownColumn.statusCode === 400, String(unknownColumn.statusCode));

  const duplicate = await app.inject({
    method: "POST",
    url: "/rest/v1/categories",
    headers: { "content-type": "application/json" },
    payload: { id: "cat-1", name: "중복" },
  });
  check("중복 PK → 409", duplicate.statusCode === 409, String(duplicate.statusCode));

  // ------------------------------------------------------- reserve sequence
  // 앞선 테스트(손님 입장 등)가 이미 시퀀스를 소비했을 수 있으므로 현재 값부터 계산한다.
  const counterBefore = await app.inject({
    method: "GET",
    url: "/rest/v1/counters?id=eq.orderSheet&select=last_sequence_no",
  });
  const startNo = Number(counterBefore.json()?.[0]?.last_sequence_no ?? 0);

  const reservations = await Promise.all(
    Array.from({ length: 20 }, () =>
      app.inject({ method: "POST", url: "/api/rpc/reserve-sequence", payload: { counterId: "orderSheet" } })
    )
  );
  const numbers = reservations.map((response) => response.json().lastSequenceNo).sort((a, b) => a - b);
  equal(
    `reserve-sequence 20회 동시 호출 → ${startNo + 1}..${startNo + 20} 중복 없음`,
    numbers,
    Array.from({ length: 20 }, (_, index) => startNo + index + 1)
  );

  // ---------------------------------------------------------------- events
  await events.startEventBroadcast(silentLog);
  await app.listen({ port: 0, host: "127.0.0.1" });
  const port = app.server.address().port;
  const ssePromise = sseCollect(port, "products,categories");

  await new Promise((resolve) => setTimeout(resolve, 300));
  await app.inject({
    method: "POST",
    url: "/rest/v1/products",
    headers: { "content-type": "application/json" },
    payload: { id: "prod-2", product_name: "SSE 테스트", base_price: 9000 },
  });

  const frames = await ssePromise;
  const eventPayloads = frames
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => {
      try {
        return JSON.parse(line.slice(6));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  check(
    "SSE: products 변경 이벤트 수신",
    eventPayloads.some((payload) => payload.table === "products" && payload.action === "insert"),
    frames
  );

  const quietPromise = sseQuiet(port, "orders", 1200);

  await new Promise((resolve) => setTimeout(resolve, 250));
  await app.inject({
    method: "POST",
    url: "/rest/v1/products",
    headers: { "content-type": "application/json" },
    payload: { id: "prod-3", product_name: "SSE 필터 테스트", base_price: 1000 },
  });

  check("SSE: tables 필터가 다른 테이블 이벤트를 막음", await quietPromise, "orders 만 구독 중인데 변경 프레임 수신");

  // ------------------------------------------------------------- api key
  config.anonKey = "test-anon-key";
  const guardedApp = await buildApp({ logger: false });
  await guardedApp.ready();

  const unauthorized = await guardedApp.inject({ method: "GET", url: "/rest/v1/categories?select=id" });
  check("ANON_KEY 설정 시 키 없으면 401", unauthorized.statusCode === 401, String(unauthorized.statusCode));

  const guardedHealth = await guardedApp.inject({ method: "GET", url: "/health" });
  check("ANON_KEY 설정 시에도 /health 는 키 없이 200", guardedHealth.statusCode === 200, String(guardedHealth.statusCode));

  const authorized = await guardedApp.inject({
    method: "GET",
    url: "/rest/v1/categories?select=id",
    headers: { apikey: "test-anon-key" },
  });
  check("ANON_KEY 설정 시 키가 맞으면 200", authorized.statusCode === 200, authorized.body);

  // EventSource 는 헤더를 못 넣으므로 SSE 만 쿼리 파라미터 키를 허용합니다.
  // REST 경로의 쿼리 파라미터는 컬럼 필터라서 여기서 키를 읽으면 400 이 납니다.
  const restQueryKey = await guardedApp.inject({
    method: "GET",
    url: "/rest/v1/categories?select=id&apikey=test-anon-key",
  });
  check(
    "REST 는 쿼리 파라미터 키를 인정하지 않음 → 401",
    restQueryKey.statusCode === 401,
    String(restQueryKey.statusCode)
  );

  await guardedApp.listen({ port: 0, host: "127.0.0.1" });
  const guardedPort = guardedApp.server.address().port;

  const authorizedSse = await sseFirstFrame(
    guardedPort,
    "/api/events?tables=categories&apikey=test-anon-key"
  );
  check(
    "SSE 는 쿼리 파라미터 키로 연결 → 200",
    authorizedSse.status === 200 && authorizedSse.body.includes("event: ready"),
    `${authorizedSse.status} ${authorizedSse.body.slice(0, 80)}`
  );

  const unauthorizedSse = await sseFirstFrame(
    guardedPort,
    "/api/events?tables=categories&apikey=wrong-key"
  );
  check(
    "SSE 쿼리 파라미터 키가 틀리면 401",
    unauthorizedSse.status === 401,
    String(unauthorizedSse.status)
  );

  await guardedApp.close();
  config.anonKey = "";
} catch (error) {
  fail("실행 중 예외", error.stack || error.message);
} finally {
  try {
    if (app) {
      await app.close();
    }

    if (stopEventBroadcast) {
      await stopEventBroadcast();
    }

    if (closePool) {
      await closePool();
    }

    await postgres.stop();
  } catch (error) {
    console.log(`[smoke] 정리 중 오류: ${error.message}`);
  }

  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // 임시 폴더 정리 실패는 무시합니다.
  }

  const failed = results.filter((result) => !result.ok);

  console.log(`\n[smoke] ${results.length - failed.length}/${results.length} 통과`);

  if (failed.length > 0) {
    console.log("[smoke] 실패 목록:");
    failed.forEach((result) => console.log(`  - ${result.name}: ${result.detail}`));
    process.exit(1);
  }

  console.log("[smoke] 전체 통과");
}
