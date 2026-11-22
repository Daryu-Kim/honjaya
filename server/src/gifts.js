// P11 — 혼자야 기프티콘(코드 기반 1회용 교환권) 서비스.
//
// 규칙
//   * 코드를 가진 사람이 사용합니다(선불권과 반대 — 선불권은 회원 귀속 잔액형).
//   * 1회용입니다. 액면가가 결제 금액보다 크면 남은 차액은 소멸하고 forfeited_amount 에 기록만 남깁니다.
//   * ITEM(메뉴 교환권) / AMOUNT(금액권) 두 종류이지만 결제에서는 둘 다 액면가만큼 결제로 처리합니다.
//     어떤 메뉴를 교환했는지는 직원이 화면에서 확인합니다.
//   * 즉시 사용 가능(선불권의 "다음 방문부터" 규칙 없음). 만료는 조회 시점에 확정(lazy).
//   * 사용 금액 검증은 전부 서버에서 합니다(클라이언트 값을 믿지 않습니다).
import { randomUUID } from "node:crypto";

import { toBusinessDate } from "./businessDay.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { HttpError } from "./http/errors.js";
import { sendOne } from "./messaging.js";
import {
  earnPointsForPayment,
  formatPhone,
  normalizePhone,
} from "./points.js";

const MAX_NAME = 40;
const MAX_MEMO = 200;
const MAX_MESSAGE = 500;
const MAX_REASON = 200;
const MAX_LIST = 200;
const MAX_PRICE = 100_000_000;
const MAX_VALIDITY_DAYS = 3650;
const CODE_LENGTH = 8;
// 헷갈리는 글자(0/O, 1/I)를 뺀 32자. 직원이 전화로 불러 줄 수 있어야 합니다.
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export const GIFT_KINDS = ["ITEM", "AMOUNT"];
export const GIFT_STATUSES = ["ACTIVE", "USED", "EXPIRED", "VOID"];

export const GIFT_KIND_LABELS = {
  ITEM: "메뉴 교환권",
  AMOUNT: "금액권",
};

export const GIFT_STATUS_LABELS = {
  ACTIVE: "사용 가능",
  USED: "사용 완료",
  EXPIRED: "기간 만료",
  VOID: "취소됨",
};

export const GIFT_THEME_LABELS = {
  SOLO_NIGHT: "혼자야의 밤",
  CHEERS: "건배",
  BIRTHDAY: "생일 축하",
  THANKS: "고마워요",
};

function trimText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function toInt(value, fallback = 0) {
  const number = Number(value ?? fallback);

  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

export function generateGiftCode() {
  let body = "";

  for (let index = 0; index < CODE_LENGTH; index += 1) {
    body += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }

  return `G-${body}`;
}

// 손님이 "g-abcd1234", "GABCD1234", " g-abcd 1234 " 처럼 입력해도 찾을 수 있게 정규화합니다.
export function normalizeGiftCode(value) {
  const raw = String(value ?? "")
    .toUpperCase()
    .replace(/[\s\-_]/g, "");

  if (!raw) return "";

  const body = raw.startsWith("G") ? raw.slice(1) : raw;

  return `G-${body}`;
}

// 화면에서 상품 설정을 저장할 때 씁니다. partial=true 이면 넘어온 필드만 검사합니다.
export function normalizeGiftProductInput(body = {}, { partial = false } = {}) {
  const input = body && typeof body === "object" ? body : {};
  const output = {};

  if (!partial || input.name !== undefined) {
    const name = trimText(input.name, MAX_NAME);

    if (!name) {
      throw new HttpError(400, "HJ400", "기프티콘 이름을 입력해 주세요.");
    }

    output.name = name;
  }

  if (!partial || input.kind !== undefined) {
    const kind = trimText(input.kind, 20).toUpperCase() || "AMOUNT";

    if (!GIFT_KINDS.includes(kind)) {
      throw new HttpError(400, "HJ400", "기프티콘 종류를 확인해 주세요.");
    }

    output.kind = kind;
  }

  const kind = output.kind;

  if (!partial || input.productId !== undefined) {
    output.productId = trimText(input.productId, 100);
  }

  if (!partial || input.productName !== undefined) {
    output.productName = trimText(input.productName, MAX_NAME);
  }

  if (!partial || input.faceValue !== undefined) {
    const faceValue = toInt(input.faceValue, 0);

    if (faceValue <= 0 || faceValue > MAX_PRICE) {
      throw new HttpError(400, "HJ400", "액면가를 확인해 주세요.");
    }

    output.faceValue = faceValue;
  }

  if (!partial || input.price !== undefined) {
    const price = toInt(input.price, 0);

    if (price <= 0 || price > MAX_PRICE) {
      throw new HttpError(400, "HJ400", "판매가를 확인해 주세요.");
    }

    output.price = price;
  }

  if (!partial || input.validityDays !== undefined) {
    const validityDays = toInt(input.validityDays, 90);

    if (validityDays < 0 || validityDays > MAX_VALIDITY_DAYS) {
      throw new HttpError(400, "HJ400", "유효기간을 확인해 주세요.");
    }

    output.validityDays = validityDays;
  }

  if (!partial || input.theme !== undefined) {
    const theme = trimText(input.theme, 30).toUpperCase() || "SOLO_NIGHT";

    if (!GIFT_THEME_LABELS[theme]) {
      throw new HttpError(400, "HJ400", "테마를 확인해 주세요.");
    }

    output.theme = theme;
  }

  if (!partial || input.messageMaxLength !== undefined) {
    const maxLength = toInt(input.messageMaxLength, 100);

    output.messageMaxLength = Math.min(Math.max(maxLength, 0), MAX_MESSAGE);
  }

  if (!partial || input.isActive !== undefined) {
    output.isActive = input.isActive !== false;
  }

  if (!partial || input.sortOrder !== undefined) {
    output.sortOrder = toInt(input.sortOrder, 0);
  }

  if (!partial || input.memo !== undefined) {
    output.memo = trimText(input.memo, MAX_MEMO);
  }

  // 종류가 ITEM 이면 교환할 메뉴 이름이 있어야 화면에서 구분할 수 있습니다.
  if (kind === "ITEM" && !partial) {
    const productName = output.productName || "";

    if (!productName) {
      throw new HttpError(400, "HJ400", "메뉴 교환권은 교환할 메뉴를 선택해 주세요.");
    }
  }

  return output;
}

export function mapGiftProduct(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    kindLabel: GIFT_KIND_LABELS[row.kind] || row.kind,
    productId: row.product_id || "",
    productName: row.product_name || "",
    faceValue: Number(row.face_value || 0),
    price: Number(row.price || 0),
    validityDays: Number(row.validity_days || 0),
    theme: row.theme || "SOLO_NIGHT",
    themeLabel: GIFT_THEME_LABELS[row.theme] || row.theme,
    messageMaxLength: Number(row.message_max_length || 0),
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order || 0),
    memo: row.memo || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// 만료 여부를 조회 시점 기준으로 판단합니다(저장된 status 가 ACTIVE 여도 지났으면 만료).
export function giftBlockedReason(gift, { now = new Date() } = {}) {
  if (!gift) return "기프티콘을 찾을 수 없어요.";

  if (gift.status === "VOID") return "취소된 기프티콘이에요.";

  if (gift.status === "USED") return "이미 사용된 기프티콘이에요.";

  if (gift.expires_at && new Date(gift.expires_at).getTime() <= now.getTime()) {
    return "사용 기간이 지난 기프티콘이에요.";
  }

  if (gift.status === "EXPIRED") return "사용 기간이 지난 기프티콘이에요.";

  return "";
}

export function mapGift(row, { now = new Date() } = {}) {
  if (!row) return null;

  const status =
    row.status === "ACTIVE" && row.expires_at &&
    new Date(row.expires_at).getTime() <= now.getTime()
      ? "EXPIRED"
      : row.status;
  const faceValue = Number(row.face_value || 0);
  const forfeitedAmount = Number(row.forfeited_amount || 0);

  return {
    id: row.id,
    code: row.code || "",
    giftProductId: row.gift_product_id || "",
    productName: row.product_name || "",
    kind: row.kind,
    kindLabel: GIFT_KIND_LABELS[row.kind] || row.kind,
    faceValue,
    theme: row.theme || "SOLO_NIGHT",
    themeLabel: GIFT_THEME_LABELS[row.theme] || row.theme,
    status,
    statusLabel: GIFT_STATUS_LABELS[status] || status,
    blockedReason: giftBlockedReason({ ...row, status }, { now }),
    pricePaid: Number(row.price_paid || 0),
    paymentMethod: row.payment_method || "CARD",
    buyerCustomerId: row.buyer_customer_id || "",
    buyerName: row.buyer_name || "",
    buyerPhone: row.buyer_phone || "",
    buyerPhoneText: row.buyer_phone ? formatPhone(row.buyer_phone) : "",
    recipientName: row.recipient_name || "",
    recipientPhone: row.recipient_phone || "",
    recipientPhoneText: row.recipient_phone ? formatPhone(row.recipient_phone) : "",
    message: row.message || "",
    purchasedAt: row.purchased_at,
    purchaseBusinessDate: row.purchase_business_date,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    usedOrderSheetId: row.used_order_sheet_id || "",
    usedPaymentId: row.used_payment_id || "",
    forfeitedAmount,
    redeemedByEmployeeName: row.redeemed_by_employee_name || "",
    sentAt: row.sent_at,
    sentChannel: row.sent_channel || "",
    voidedAt: row.voided_at,
    voidedReason: row.voided_reason || "",
    soldByEmployeeName: row.sold_by_employee_name || "",
    createdAt: row.created_at,
  };
}

// 만료된 기프티콘을 EXPIRED 로 확정합니다(조회할 때마다 호출, 조건에 걸리는 행만 갱신).
export async function expireDueGifts(client = pool) {
  const { rowCount } = await client.query(
    `update public.gift_certificates
        set status = 'EXPIRED',
            updated_at = now()
      where status = 'ACTIVE'
        and expires_at is not null
        and expires_at <= now()`
  );

  return rowCount || 0;
}

// ── 상품 설정 ──────────────────────────────────────────────────────────

export async function listGiftProducts({ includeInactive = false } = {}) {
  const { rows } = await pool.query(
    `select *
       from public.gift_products
      where ($1::boolean or is_active = true)
      order by sort_order asc, price asc, name asc`,
    [includeInactive === true]
  );

  return rows.map(mapGiftProduct);
}

export async function createGiftProduct(body = {}) {
  const input = normalizeGiftProductInput(body);
  const id = randomUUID();

  const { rows } = await pool.query(
    `insert into public.gift_products
       (id, name, kind, product_id, product_name, face_value, price,
        validity_days, theme, message_max_length, is_active, sort_order, memo)
     values ($1, $2, $3, nullif($4, ''), $5, $6, $7, $8, $9, $10, $11, $12, $13)
     returning *`,
    [
      id,
      input.name,
      input.kind,
      input.productId || "",
      input.productName || "",
      input.faceValue,
      input.price,
      input.validityDays,
      input.theme,
      input.messageMaxLength,
      input.isActive,
      input.sortOrder,
      input.memo,
    ]
  );

  return mapGiftProduct(rows[0]);
}

export async function updateGiftProduct(productId, body = {}) {
  const safeId = trimText(productId, 100);
  const input = normalizeGiftProductInput(body, { partial: true });
  const columns = [];
  const values = [safeId];

  const mapping = [
    ["name", "name"],
    ["kind", "kind"],
    ["productId", "product_id"],
    ["productName", "product_name"],
    ["faceValue", "face_value"],
    ["price", "price"],
    ["validityDays", "validity_days"],
    ["theme", "theme"],
    ["messageMaxLength", "message_max_length"],
    ["isActive", "is_active"],
    ["sortOrder", "sort_order"],
    ["memo", "memo"],
  ];

  for (const [key, column] of mapping) {
    if (input[key] === undefined) continue;

    values.push(key === "productId" ? input[key] || null : input[key]);
    columns.push(`${column} = $${values.length}`);
  }

  if (columns.length === 0) {
    throw new HttpError(400, "HJ400", "변경할 내용을 입력해 주세요.");
  }

  const { rows } = await pool.query(
    `update public.gift_products
        set ${columns.join(", ")},
            updated_at = now()
      where id = $1
      returning *`,
    values
  );

  if (!rows[0]) {
    throw new HttpError(404, "HJ404", "기프티콘 상품을 찾을 수 없어요.");
  }

  return mapGiftProduct(rows[0]);
}

// ── 발급 ──────────────────────────────────────────────────────────────

export function giftLink(code) {
  const base = String(config.publicAppUrl || "").replace(/\/+$/, "");

  return `${base}/gift/${encodeURIComponent(code)}`;
}

export function giftMessageText(gift) {
  const lines = [
    `[혼자야] 선물이 도착했어요.`,
    `${gift.productName || GIFT_KIND_LABELS[gift.kind]} 교환권`,
    `코드: ${gift.code}`,
  ];

  if (gift.recipientName) {
    lines.splice(1, 0, `${gift.recipientName}님,`);
  }

  if (gift.expiresAt) {
    lines.push(`유효기간: ${new Date(gift.expiresAt).toLocaleDateString("ko-KR")} 까지`);
  }

  lines.push(
    `사용처: 혼자야 매장 (계산할 때 코드를 보여 주세요)`,
    giftLink(gift.code)
  );

  return lines.join("\n");
}

// 판매 대금을 받은 수단. 결제(payment) 행을 만들 수 없어서 기프티콘 행에 직접 남깁니다.
export const GIFT_SALE_METHODS = ["CARD", "CASH", "BANK", "OTHER"];

export function normalizeGiftSaleMethod(value) {
  const method = trimText(value, 20).toUpperCase();

  return GIFT_SALE_METHODS.includes(method) ? method : "CARD";
}

export async function issueGift({
  productId = "",
  buyerName = "",
  buyerPhone = "",
  recipientName = "",
  recipientPhone = "",
  message = "",
  paymentMethod = "CARD",
  send = false,
  channel = "SMS",
  employee = null,
} = {}) {
  const safeProductId = trimText(productId, 100);

  if (!safeProductId) {
    throw new HttpError(400, "HJ400", "기프티콘 상품을 선택해 주세요.");
  }

  const now = new Date();
  const businessDate = toBusinessDate(now);
  const client = await pool.connect();

  try {
    await client.query("begin");

    const { rows: productRows } = await client.query(
      `select * from public.gift_products where id = $1`,
      [safeProductId]
    );
    const product = productRows[0];

    if (!product) {
      throw new HttpError(404, "HJ404", "기프티콘 상품을 찾을 수 없어요.");
    }

    if (product.is_active === false) {
      throw new HttpError(409, "HJ409", "판매가 중지된 기프티콘이에요.");
    }

    const phone = normalizePhone(buyerPhone);
    let buyerCustomerId = null;

    if (phone) {
      const { rows: customerRows } = await client.query(
        `select id from public.customers where phone = $1`,
        [phone]
      );

      buyerCustomerId = customerRows[0]?.id || null;
    }

    const validityDays = toInt(product.validity_days, 0);
    const expiresAt =
      validityDays > 0
        ? new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000)
        : null;

    // 코드 충돌은 사실상 없지만, unique 제약에 걸리면 몇 번 재시도합니다.
    let inserted = null;

    for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
      try {
        const { rows } = await client.query(
          `insert into public.gift_certificates
             (id, code, gift_product_id, product_name, kind, face_value, theme,
              status, price_paid, payment_method, buyer_customer_id, buyer_name,
              buyer_phone, recipient_name, recipient_phone, message, purchased_at,
              purchase_business_date, expires_at, sold_by_employee_id,
              sold_by_employee_name)
           values ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, $9, $10, $11,
                   $12, $13, $14, $15, $16, $17::date, $18, $19, $20)
           returning *`,
          [
            randomUUID(),
            generateGiftCode(),
            product.id,
            product.product_name || product.name,
            product.kind,
            toInt(product.face_value, 0),
            product.theme,
            toInt(product.price, 0),
            normalizeGiftSaleMethod(paymentMethod),
            buyerCustomerId,
            trimText(buyerName, MAX_NAME),
            phone,
            trimText(recipientName, MAX_NAME),
            normalizePhone(recipientPhone),
            trimText(message, Number(product.message_max_length || MAX_MESSAGE)),
            now,
            businessDate,
            expiresAt,
            employee?.id || null,
            employee?.name || "",
          ]
        );

        inserted = rows[0];
      } catch (error) {
        if (error?.code !== "23505") throw error;
      }
    }

    if (!inserted) {
      throw new HttpError(500, "HJ500", "기프티콘 코드를 만들지 못했어요. 다시 시도해 주세요.");
    }

    // 적립은 기프티콘 판매(실제 입금) 시점의 판매가 기준입니다. 구매자가 회원일 때만 적립됩니다.
    // 사용 시점에 또 적립하면 같은 돈으로 두 번 적립되므로 결제 화면에서는 제외합니다.
    const earned = await earnPointsForPayment(client, {
      customerId: buyerCustomerId,
      amount: toInt(product.price, 0),
      orderSheetId: null,
      paymentId: null,
      employee,
      occurredAt: now,
    });

    await client.query("commit");

    const gift = {
      ...mapGift(inserted, { now }),
      pointsEarned: toInt(earned.points, 0),
    };

    // 문자 발송은 커밋 후에 합니다(발송 실패가 발급을 되돌리면 안 됩니다).
    if (send === true && gift.recipientPhone) {
      try {
        await sendGiftMessage({ gift, channel });
      } catch {
        // 발송 실패는 발급 결과를 막지 않습니다. 화면에서 다시 보낼 수 있습니다.
      }
    }

    return gift;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ── 조회 ──────────────────────────────────────────────────────────────

const GIFT_SELECT = `select g.*
   from public.gift_certificates g`;

export async function lookupGift({ code } = {}) {
  const safeCode = normalizeGiftCode(code);

  if (!safeCode || safeCode === "G-") {
    throw new HttpError(400, "HJ400", "기프티콘 코드를 입력해 주세요.");
  }

  await expireDueGifts();

  const { rows } = await pool.query(`${GIFT_SELECT} where g.code = $1`, [
    safeCode,
  ]);

  if (!rows[0]) {
    throw new HttpError(404, "HJ404", "기프티콘을 찾을 수 없어요. 코드를 확인해 주세요.");
  }

  return { gift: mapGift(rows[0]), link: giftLink(safeCode) };
}

// 공개 카드 페이지용. 개인정보를 최소한만 내려줍니다.
export async function lookupPublicGift({ code } = {}) {
  const safeCode = normalizeGiftCode(code);

  if (!safeCode || safeCode === "G-") {
    throw new HttpError(400, "HJ400", "기프티콘 코드를 확인해 주세요.");
  }

  await expireDueGifts();

  const { rows } = await pool.query(
    `select code, product_name, kind, face_value, theme, status, message,
            recipient_name, buyer_name, expires_at, used_at, purchased_at
       from public.gift_certificates
      where code = $1`,
    [safeCode]
  );
  const row = rows[0];

  if (!row) {
    throw new HttpError(404, "HJ404", "기프티콘을 찾을 수 없어요.");
  }

  const status =
    row.status === "ACTIVE" &&
    row.expires_at &&
    new Date(row.expires_at).getTime() <= Date.now()
      ? "EXPIRED"
      : row.status;

  return {
    gift: {
      code: row.code,
      productName: row.product_name || "",
      kind: row.kind,
      kindLabel: GIFT_KIND_LABELS[row.kind] || row.kind,
      faceValue: Number(row.face_value || 0),
      theme: row.theme || "SOLO_NIGHT",
      themeLabel: GIFT_THEME_LABELS[row.theme] || row.theme,
      status,
      statusLabel: GIFT_STATUS_LABELS[status] || status,
      message: row.message || "",
      recipientName: row.recipient_name || "",
      buyerName: row.buyer_name || "",
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      purchasedAt: row.purchased_at,
    },
  };
}

export async function listGifts({
  code = "",
  phone = "",
  status = "",
  from = "",
  to = "",
  limit = MAX_LIST,
} = {}) {
  await expireDueGifts();

  const conditions = [];
  const values = [];
  const safeCode = normalizeGiftCode(code);

  if (safeCode && safeCode !== "G-") {
    values.push(safeCode);
    conditions.push(`g.code = $${values.length}`);
  }

  const safePhone = normalizePhone(phone);

  if (safePhone) {
    values.push(safePhone);
    conditions.push(
      `(g.recipient_phone = $${values.length} or g.buyer_phone = $${values.length})`
    );
  }

  const safeStatus = trimText(status, 20).toUpperCase();

  if (safeStatus && GIFT_STATUSES.includes(safeStatus)) {
    values.push(safeStatus);
    conditions.push(`g.status = $${values.length}`);
  }

  const safeFrom = trimText(from, 10);

  if (/^\d{4}-\d{2}-\d{2}$/.test(safeFrom)) {
    values.push(safeFrom);
    conditions.push(`g.purchase_business_date >= $${values.length}::date`);
  }

  const safeTo = trimText(to, 10);

  if (/^\d{4}-\d{2}-\d{2}$/.test(safeTo)) {
    values.push(safeTo);
    conditions.push(`g.purchase_business_date <= $${values.length}::date`);
  }

  const safeLimit = Math.min(Math.max(toInt(limit, MAX_LIST), 1), MAX_LIST);

  values.push(safeLimit);

  const { rows } = await pool.query(
    `${GIFT_SELECT}
      ${conditions.length > 0 ? `where ${conditions.join(" and ")}` : ""}
      order by g.purchased_at desc
      limit $${values.length}`,
    values
  );

  return rows.map((row) => mapGift(row));
}

export async function listCustomerGifts(customerId) {
  const safeId = trimText(customerId, 100);

  if (!safeId) return [];

  await expireDueGifts();

  const { rows } = await pool.query(
    `${GIFT_SELECT}
      where g.buyer_customer_id = $1
      order by g.purchased_at desc
      limit 50`,
    [safeId]
  );

  return rows.map((row) => mapGift(row));
}

// ── 전달 ──────────────────────────────────────────────────────────────

export async function sendGiftMessage({ gift, channel = "SMS" } = {}) {
  if (!gift) {
    throw new HttpError(400, "HJ400", "기프티콘을 먼저 선택해 주세요.");
  }

  const to = gift.recipientPhone || gift.recipientPhoneText;

  if (!to) {
    throw new HttpError(400, "HJ400", "받는 분 전화번호가 없어요.");
  }

  const safeChannel = trimText(channel, 20).toUpperCase() || "SMS";
  const result = await sendOne({
    to,
    text: giftMessageText(gift),
    channel: safeChannel,
    title: "혼자야 기프티콘",
  });

  await pool.query(
    `update public.gift_certificates
        set sent_at = now(),
            sent_channel = $2,
            updated_at = now()
      where id = $1`,
    [gift.id, safeChannel]
  );

  return { id: result.id, provider: result.provider, channel: safeChannel };
}

export async function resendGift({ giftId } = {}) {
  const safeId = trimText(giftId, 100);

  if (!safeId) {
    throw new HttpError(400, "HJ400", "기프티콘을 선택해 주세요.");
  }

  const { rows } = await pool.query(
    `select * from public.gift_certificates where id = $1`,
    [safeId]
  );
  const gift = mapGift(rows[0]);

  if (!gift) {
    throw new HttpError(404, "HJ404", "기프티콘을 찾을 수 없어요.");
  }

  if (gift.status === "VOID") {
    throw new HttpError(409, "HJ409", "취소된 기프티콘은 보낼 수 없어요.");
  }

  return sendGiftMessage({ gift });
}

// ── 취소 ──────────────────────────────────────────────────────────────

export async function voidGift({ giftId, reason = "", employee = null } = {}) {
  const safeId = trimText(giftId, 100);

  if (!safeId) {
    throw new HttpError(400, "HJ400", "기프티콘을 선택해 주세요.");
  }

  const { rows } = await pool.query(
    `update public.gift_certificates
        set status = 'VOID',
            voided_at = now(),
            voided_reason = $2,
            updated_at = now()
      where id = $1
        and status = 'ACTIVE'
      returning *`,
    [safeId, trimText(reason, MAX_REASON) || "관리자 취소"]
  );

  if (!rows[0]) {
    const { rows: existsRows } = await pool.query(
      `select status from public.gift_certificates where id = $1`,
      [safeId]
    );

    if (!existsRows[0]) {
      throw new HttpError(404, "HJ404", "기프티콘을 찾을 수 없어요.");
    }

    throw new HttpError(409, "HJ409", "이미 사용했거나 취소된 기프티콘이에요.");
  }

  return { gift: mapGift(rows[0]), employee: employee?.name || "" };
}

// ── 결제 연동 ──────────────────────────────────────────────────────────

// 결제 트랜잭션 안에서 기프티콘 사용 가능 여부를 검증합니다.
export async function readGiftForPayment(
  client,
  { code, amount, now = new Date() }
) {
  const safeCode = normalizeGiftCode(code);

  if (!safeCode || safeCode === "G-") {
    throw new HttpError(400, "HJ400", "기프티콘 코드를 입력해 주세요.");
  }

  const { rows } = await client.query(
    `select * from public.gift_certificates where code = $1 for update`,
    [safeCode]
  );
  const gift = rows[0];

  if (!gift) {
    throw new HttpError(404, "HJ404", "기프티콘을 찾을 수 없어요. 코드를 확인해 주세요.");
  }

  const reason = giftBlockedReason(gift, { now });

  if (reason) {
    throw new HttpError(409, "HJ409", reason);
  }

  const requested = toInt(amount, 0);
  const faceValue = toInt(gift.face_value, 0);

  if (requested <= 0) {
    throw new HttpError(400, "HJ400", "기프티콘 사용 금액을 입력해 주세요.");
  }

  if (requested > faceValue) {
    throw new HttpError(
      400,
      "HJ400",
      `이 기프티콘의 액면가는 ${formatNumber(faceValue)}원이에요.`
    );
  }

  return gift;
}

// 상태를 USED 로 바꾸고 차액(소멸)을 기록합니다.
export async function applyGiftUse(
  client,
  {
    gift,
    amount,
    paymentId = null,
    orderSheetId = null,
    employee = null,
    occurredAt = new Date(),
  }
) {
  const used = toInt(amount, 0);
  const faceValue = toInt(gift.face_value, 0);

  if (used <= 0) {
    throw new HttpError(400, "HJ400", "기프티콘 사용 금액을 입력해 주세요.");
  }

  if (used > faceValue) {
    throw new HttpError(
      400,
      "HJ400",
      `이 기프티콘의 액면가는 ${formatNumber(faceValue)}원이에요.`
    );
  }

  const forfeited = faceValue - used;

  await client.query(
    `update public.gift_certificates
        set status = 'USED',
            used_at = $2,
            used_order_sheet_id = $3,
            used_payment_id = $4,
            forfeited_amount = $5,
            redeemed_by_employee_id = $6,
            redeemed_by_employee_name = $7,
            updated_at = now()
      where id = $1`,
    [
      gift.id,
      occurredAt,
      orderSheetId,
      paymentId,
      forfeited,
      employee?.id || null,
      employee?.name || "",
    ]
  );

  return { used, forfeited };
}

// 결제를 전액 환불하면 기프티콘을 다시 쓸 수 있게 되돌립니다.
// 부분 환불이면 되돌리지 않습니다 — 액면가가 그대로 살아나면 두 번 사용하는 셈이 되기 때문입니다.
export async function restoreGiftForRefund(
  client,
  { paymentId, refundAmount, employee = null }
) {
  if (!paymentId) return null;

  const { rows: giftRows } = await client.query(
    `select * from public.gift_certificates where used_payment_id = $1`,
    [paymentId]
  );
  const gift = giftRows[0];

  if (!gift) return null;

  const { rows: paidRows } = await client.query(
    `select amount from public.payments where id = $1`,
    [paymentId]
  );
  const paidAmount = toInt(paidRows[0]?.amount, 0);

  if (paidAmount <= 0 || toInt(refundAmount, 0) < paidAmount) {
    return { restored: false, reason: "부분 환불은 기프티콘을 되돌리지 않습니다." };
  }

  // 유효기간이 지난 기프티콘은 되살리지 않습니다.
  if (gift.expires_at && new Date(gift.expires_at).getTime() <= Date.now()) {
    return { restored: false, reason: "유효기간이 지나 되돌릴 수 없습니다." };
  }

  await client.query(
    `update public.gift_certificates
        set status = 'ACTIVE',
            used_at = null,
            used_order_sheet_id = null,
            used_payment_id = null,
            forfeited_amount = 0,
            redeemed_by_employee_id = null,
            redeemed_by_employee_name = '',
            updated_at = now()
      where id = $1`,
    [gift.id]
  );

  return { restored: true, giftId: gift.id, employee: employee?.name || "" };
}

// ── 통계 ──────────────────────────────────────────────────────────────

export async function giftSummary({ from = "", to = "" } = {}) {
  await expireDueGifts();

  const safeFrom = /^\d{4}-\d{2}-\d{2}$/.test(trimText(from, 10))
    ? trimText(from, 10)
    : "";
  const safeTo = /^\d{4}-\d{2}-\d{2}$/.test(trimText(to, 10))
    ? trimText(to, 10)
    : "";

  const { rows } = await pool.query(
    `select
        coalesce(sum(case when status <> 'VOID' then price_paid else 0 end), 0)::int as sold,
        coalesce(sum(case when status = 'USED' then face_value else 0 end), 0)::int as used,
        coalesce(sum(case when status = 'USED' then forfeited_amount else 0 end), 0)::int as forfeited,
        count(*) filter (where status <> 'VOID')::int as issued_count,
        count(*) filter (where status = 'USED')::int as used_count,
        count(*) filter (where status = 'ACTIVE')::int as active_count,
        count(*) filter (where status = 'EXPIRED')::int as expired_count,
        count(*) filter (where status = 'VOID')::int as voided_count,
        coalesce(sum(case when status = 'ACTIVE' then face_value else 0 end), 0)::int as liability
      from public.gift_certificates
      where ($1 = '' or purchase_business_date >= $1::date)
        and ($2 = '' or purchase_business_date <= $2::date)`,
    [safeFrom, safeTo]
  );
  const row = rows[0] || {};

  return {
    sold: Number(row.sold || 0),
    used: Number(row.used || 0),
    forfeited: Number(row.forfeited || 0),
    issuedCount: Number(row.issued_count || 0),
    usedCount: Number(row.used_count || 0),
    activeCount: Number(row.active_count || 0),
    expiredCount: Number(row.expired_count || 0),
    voidedCount: Number(row.voided_count || 0),
    liability: Number(row.liability || 0),
  };
}
