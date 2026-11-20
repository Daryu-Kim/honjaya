// P6 — CRM 기반 서비스.
//
// 방문 이력과 누적 결제는 payments.customer_id 로 계산합니다(집계 컬럼 없음 → 어긋날 일 없음).
// 보유 포인트는 "아직 만료되지 않은 적립 건의 남은 포인트" 합계입니다(point_ledger 부채 계산과 같은 식).
// 마케팅 수신 동의는 손님에게서 받은 사실만 저장하고, 철회도 같은 필드로 끕니다.
import { pool } from "./db.js";
import { HttpError } from "./http/errors.js";
import { formatPhone } from "./points.js";

const MAX_NAME = 30;
const MAX_NICKNAME = 30;
const MAX_MEMO = 200;
const MAX_QUERY = 30;
const MAX_VISITS = 50;

const SORTS = {
  recent: "v.last_visit_at desc nulls last, c.created_at desc",
  spent: "paid_total desc, v.last_visit_at desc nulls last",
  balance: "balance desc, v.last_visit_at desc nulls last",
  name: "c.name asc, c.phone asc",
};

function trimText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function readBool(value) {
  if (value === true || value === "true" || value === 1 || value === "1") {
    return true;
  }

  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }

  // 화면의 동의 필터는 yes/no 로 옵니다.
  if (value === "yes" || value === "y" || value === "on") return true;
  if (value === "no" || value === "n" || value === "off") return false;

  return null;
}

// 만료되지 않은 적립 건의 남은 포인트 합계. customers 별칭은 c 를 씁니다.
const ACTIVE_BALANCE_SQL = `
  coalesce((
    select sum(greatest(l.points - coalesce(a.used, 0), 0))::int
      from public.point_ledger l
      left join lateral (
        select sum(points)::int as used
          from public.point_allocations
         where earn_entry_id = l.id
      ) a on true
     where l.customer_id = c.id
       and l.points > 0
       and (l.expires_at is null or l.expires_at > now())
  ), 0)`;

const VISIT_STATS_SQL = `
  left join lateral (
    select count(distinct p.business_date)::int as visit_count,
           coalesce(sum(p.amount), 0)::int as paid_gross,
           max(p.occurred_at) as last_visit_at
      from public.payments p
     where p.customer_id = c.id
  ) v on true
  left join lateral (
    select coalesce(sum(r.amount), 0)::int as refunded_total
      from public.refunds r
      join public.payments p on p.id = r.payment_id
     where p.customer_id = c.id
  ) rf on true`;

function mapCustomer(row) {
  if (!row) return null;

  const paidGross = Number(row.paid_gross || 0);
  const refundedTotal = Number(row.refunded_total || 0);

  return {
    id: row.id,
    phone: row.phone,
    phoneText: formatPhone(row.phone),
    name: row.name || "",
    nickname: row.nickname || "",
    memo: row.memo || "",
    marketingConsent: Boolean(row.marketing_consent),
    marketingConsentAt: row.marketing_consent_at || null,
    balance: Number(row.balance || 0),
    visitCount: Number(row.visit_count || 0),
    paidTotal: paidGross - refundedTotal,
    refundedTotal,
    lastVisitAt: row.last_visit_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapVisit(row) {
  return {
    id: row.id,
    orderSheetId: row.order_sheet_id || "",
    tableNumber: row.table_number || "",
    businessDate: row.business_date || null,
    amount: Number(row.amount || 0),
    refundedAmount: Number(row.refunded_amount || 0),
    method: row.method || "",
    payerLabel: row.payer_label || "",
    memo: row.memo || "",
    employeeName: row.employee_name || "",
    occurredAt: row.occurred_at || null,
  };
}

export async function listCustomers({
  query = "",
  consent = "",
  sort = "recent",
  limit = 100,
  offset = 0,
} = {}) {
  const safeQuery = trimText(query, MAX_QUERY);
  const digits = safeQuery.replace(/[^0-9]/g, "");
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const orderBy = SORTS[String(sort || "recent")] || SORTS.recent;

  const conditions = [];
  const params = [];

  if (safeQuery) {
    params.push(`%${safeQuery}%`);
    const nameLike = `$${params.length}`;
    const clauses = [
      `c.name ilike ${nameLike}`,
      `c.nickname ilike ${nameLike}`,
    ];

    if (digits) {
      params.push(`%${digits}%`);
      clauses.push(`c.phone like $${params.length}`);
    }

    conditions.push(`(${clauses.join(" or ")})`);
  }

  const consentFilter = readBool(consent);

  if (consentFilter !== null) {
    conditions.push(`c.marketing_consent = ${consentFilter ? "true" : "false"}`);
  }

  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

  const { rows } = await pool.query(
    `select c.*,
            v.visit_count,
            v.paid_gross,
            v.last_visit_at,
            rf.refunded_total,
            ${ACTIVE_BALANCE_SQL} as balance
       from public.customers c
       ${VISIT_STATS_SQL}
       ${where}
      order by ${orderBy}
      limit $${params.length + 1}
      offset $${params.length + 2}`,
    [...params, safeLimit, safeOffset]
  );

  const { rows: countRows } = await pool.query(
    `select count(*)::int as total
       from public.customers c
       ${where}`,
    params
  );

  const { rows: summaryRows } = await pool.query(
    `select count(*)::int as total,
            count(*) filter (where s.marketing_consent)::int as consented,
            coalesce(sum(s.balance), 0)::int as liability
       from (
         select c.id, c.marketing_consent, ${ACTIVE_BALANCE_SQL} as balance
           from public.customers c
       ) s`
  );

  const summary = summaryRows[0] || {};

  return {
    customers: rows.map(mapCustomer),
    total: Number(countRows[0]?.total || 0),
    summary: {
      total: Number(summary.total || 0),
      consented: Number(summary.consented || 0),
      liability: Number(summary.liability || 0),
    },
  };
}

export async function getCustomerProfile({
  customerId,
  visitLimit = 20,
} = {}) {
  const safeId = String(customerId || "").trim();

  if (!safeId) {
    throw new HttpError(400, "HJ400", "고객 번호가 필요해요.");
  }

  const { rows } = await pool.query(
    `select c.*,
            v.visit_count,
            v.paid_gross,
            v.last_visit_at,
            rf.refunded_total,
            ${ACTIVE_BALANCE_SQL} as balance
       from public.customers c
       ${VISIT_STATS_SQL}
      where c.id = $1`,
    [safeId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "HJ404", "고객 정보를 찾을 수 없어요.");
  }

  const limit = Math.min(Math.max(Number(visitLimit) || 20, 1), MAX_VISITS);
  const { rows: visitRows } = await pool.query(
    `select p.*,
            coalesce((
              select sum(r.amount)
                from public.refunds r
               where r.payment_id = p.id
            ), 0)::int as refunded_amount
       from public.payments p
      where p.customer_id = $1
      order by p.occurred_at desc, p.id desc
      limit $2`,
    [safeId, limit]
  );

  return {
    customer: mapCustomer(rows[0]),
    visits: visitRows.map(mapVisit),
  };
}

// 관리자 화면에서 이름/메모/동의를 고칩니다. 넘기지 않은 값은 그대로 둡니다.
export async function updateCustomer({
  customerId,
  name,
  nickname,
  memo,
  marketingConsent,
  employee = null,
} = {}) {
  const safeId = String(customerId || "").trim();

  if (!safeId) {
    throw new HttpError(400, "HJ400", "고객 번호가 필요해요.");
  }

  const client = await pool.connect();
  let before = null;
  let consentChanged = false;

  try {
    await client.query("begin");

    const { rows } = await client.query(
      `select * from public.customers where id = $1 for update`,
      [safeId]
    );

    before = rows[0] || null;

    if (!before) {
      throw new HttpError(404, "HJ404", "고객 정보를 찾을 수 없어요.");
    }

    const nextName =
      name === undefined || name === null
        ? before.name
        : trimText(name, MAX_NAME);
    const nextNickname =
      nickname === undefined || nickname === null
        ? before.nickname || ""
        : trimText(nickname, MAX_NICKNAME);
    const nextMemo =
      memo === undefined || memo === null
        ? before.memo || ""
        : trimText(memo, MAX_MEMO);
    const consentInput = readBool(marketingConsent);
    const nextConsent =
      consentInput === null ? Boolean(before.marketing_consent) : consentInput;
    consentChanged = nextConsent !== Boolean(before.marketing_consent);

    await client.query(
      `update public.customers
          set name = $2,
              nickname = $3,
              memo = $4,
              marketing_consent = $5,
              marketing_consent_at = case
                when $6::boolean then now()
                else marketing_consent_at
              end,
              updated_at = now()
        where id = $1`,
      [safeId, nextName, nextNickname, nextMemo, nextConsent, consentChanged]
    );

    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const profile = await getCustomerProfile({ customerId: safeId, visitLimit: 20 });

  return {
    ...profile,
    employee: employee?.name || "",
    consentChanged,
  };
}

// 결제 트랜잭션 안에서 손님 동의를 켭니다(동의한 경우에만 호출).
export async function grantMarketingConsent(client, customerId) {
  const safeId = String(customerId || "").trim();

  if (!safeId) return false;

  const { rowCount } = await client.query(
    `update public.customers
        set marketing_consent = true,
            marketing_consent_at = case
              when marketing_consent then marketing_consent_at
              else now()
            end,
            updated_at = now()
      where id = $1
        and marketing_consent = false`,
    [safeId]
  );

  return Number(rowCount || 0) > 0;
}
