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

  // ---------------------------------------------------------------- jsonb
  // node-postgres 는 JS 배열을 Postgres 배열 리터럴로 바꿔서 보냅니다.
  // jsonb 컬럼에 그대로 바인딩하면 22P02(invalid input syntax for type json) 가 납니다.
  const jsonbArrayInsert = await app.inject({
    method: "POST",
    url: "/rest/v1/orders?select=*",
    headers: { prefer: "return=representation", "content-type": "application/json" },
    payload: {
      id: "order-1",
      order_sheet_id: "000001",
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
    headers: { prefer: "return=representation", "content-type": "application/json" },
    payload: { id: "order-empty", order_sheet_id: "000001", items: [] },
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
    headers: { prefer: "return=representation", "content-type": "application/json" },
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
    headers: { prefer: "return=representation", "content-type": "application/json" },
    payload: { items: [] },
  });
  equal("PATCH orders(jsonb 빈 배열) → [] 로 저장", jsonbPatchEmpty.json()[0]?.items, []);

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
  const reservations = await Promise.all(
    Array.from({ length: 20 }, () =>
      app.inject({ method: "POST", url: "/api/rpc/reserve-sequence", payload: { counterId: "orderSheet" } })
    )
  );
  const numbers = reservations.map((response) => response.json().lastSequenceNo).sort((a, b) => a - b);
  equal(
    "reserve-sequence 20회 동시 호출 → 1..20 중복 없음",
    numbers,
    Array.from({ length: 20 }, (_, index) => index + 1)
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
