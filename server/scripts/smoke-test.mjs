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

  // ---------------------------------------------------------------- kakao readiness (P4)
  const kakaoStatus = await app.inject({
    method: "GET",
    url: "/api/kakao/status",
    headers: { cookie: guestCookie },
  });
  check("P4 카카오 상태 → 200", kakaoStatus.statusCode === 200, kakaoStatus.body);

  const kakaoBody = kakaoStatus.json();
  check(
    "P4 카카오 상태 → 키 없으면 꺼진 상태(로그인 버튼 숨김)",
    kakaoBody.enabled === false
      ? kakaoBody.authorizeUrl === "" && kakaoBody.redirectUri === ""
      : String(kakaoBody.authorizeUrl).startsWith(
          "https://kauth.kakao.com/oauth/authorize?"
        ),
    kakaoStatus.body
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
