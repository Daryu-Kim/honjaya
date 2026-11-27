// P14 — ARC SAFETY 비용·실비정산 대장(EXP) · 부분입금(P14D).
//
// 규칙
//   * AS-OPS-001 §20-2 "비용 사전승인·실비정산서" 구조를 따릅니다:
//     정산기간 · 일자 · 구분 · 목적/품목 · 금액 · 사전승인 · 영수증 · 대표확인.
//   * 정산 원칙(§06-B-3): 월말 또는 청구 후 14일 이내. 그래서 생성 시 기본 지급기한을 14일로 둡니다.
//   * 입금은 여러 번 나눠 받을 수 있고(부분입금), 정산상태는 입금 합계로 다시 계산합니다.
//     입금 이력이 원본이고 settled_amount/settle_status 는 캐시입니다.
//   * 월 소모금액 일괄 정산(USAGE_MONTH)으로 만든 정산서는 대상 사용대장에 expense_id 를 찍어
//     같은 사용 건을 두 번 청구하지 못하게 막습니다.
//   * 구매대장(arc_purchases)의 정산 상태는 그대로 두고, 여기서는 참조(source_type=PURCHASE)만 남깁니다.
import { randomUUID } from "node:crypto";

import { createArcNotification } from "./arc.js";
import { listBillableUsagesForPeriod } from "./arcUsage.js";
import { writeAuditLog } from "./auth/audit.js";
import { pool } from "./db.js";
import { badRequest, HttpError } from "./http/errors.js";

export const ARC_EXPENSE_CATEGORIES = [
  "SUPPLY",
  "PRINT",
  "TRANSPORT",
  "SERVICE",
  "EQUIPMENT",
  "OTHER",
];
export const ARC_PAYMENT_METHODS = ["TRANSFER", "CASH", "CARD", "ETC"];
export const ARC_EXPENSE_STATUSES = ["UNSETTLED", "PARTIAL", "SETTLED"];
export const ARC_EXPENSE_SOURCES = ["MANUAL", "USAGE_MONTH", "PURCHASE"];

const CATEGORY_LABELS = {
  SUPPLY: "소모품",
  PRINT: "인쇄·교구",
  TRANSPORT: "교통",
  SERVICE: "자문·활동비",
  EQUIPMENT: "장비·자재",
  OTHER: "기타",
};

/** 정산 원칙: 청구 후 14일 이내. */
const DUE_DAYS = 14;

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

// ── 공통 ────────────────────────────────────────────────────────────────────

function text(value, max = 200) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function toInt(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function oneOf(value, allowed, fallback) {
  const raw = String(value ?? "").toUpperCase();

  return allowed.includes(raw) ? raw : fallback;
}

function requireText(value, label, max = 200) {
  const body = text(value, max);

  if (!body) {
    throw badRequest(`${label}을(를) 입력해 주세요.`);
  }

  return body;
}

function flag(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function parseKstDate(value, fallback = new Date()) {
  const raw = text(value, 20);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return fallback;
  }

  const date = new Date(`${raw}T00:00:00+09:00`);

  return Number.isNaN(date.getTime()) ? fallback : date;
}

function kstDateString(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const target = Number.isNaN(date.getTime()) ? new Date() : date;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(target);
}

function kstStamp(value = new Date()) {
  return kstDateString(value).replace(/-/g, "");
}

function currentKstPeriod() {
  return kstDateString().slice(0, 7);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00+09:00`);
  date.setDate(date.getDate() + days);

  return kstDateString(date);
}

function normalizePeriod(value) {
  const raw = text(value, 7);

  return PERIOD_PATTERN.test(raw) ? raw : "";
}

async function withTransaction(run) {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const result = await run(client);

    await client.query("commit");

    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function uniqueViolation(error) {
  return error?.code === "23505";
}

// ── 매핑 ────────────────────────────────────────────────────────────────────

function mapExpense(row) {
  return {
    id: row.id,
    expenseNo: row.expense_no,
    period: row.period,
    spentOn: row.spent_on,
    category: row.category,
    categoryLabel: CATEGORY_LABELS[row.category] ?? row.category,
    purpose: row.purpose,
    amount: toInt(row.amount),
    claimant: row.claimant,
    paidBy: row.paid_by,
    vendor: row.vendor,
    receiptNo: row.receipt_no,
    preApproved: Boolean(row.pre_approved),
    approvedByName: row.approved_by_name,
    approvedAt: row.approved_at,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    settleStatus: row.settle_status,
    settledAmount: toInt(row.settled_amount),
    remainingAmount: Math.max(toInt(row.amount) - toInt(row.settled_amount), 0),
    dueOn: row.due_on,
    note: row.note,
    employeeName: row.employee_name,
    paymentCount: toInt(row.payment_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPayment(row) {
  return {
    id: row.id,
    expenseId: row.expense_id,
    paidOn: row.paid_on,
    amount: toInt(row.amount),
    method: row.method,
    note: row.note,
    employeeName: row.employee_name,
    createdAt: row.created_at,
  };
}
const EXPENSE_SELECT = `
  select e.*,
         coalesce(p.payment_count, 0)::int as payment_count
    from public.arc_expenses e
    left join lateral (
      select count(*)::int as payment_count
        from public.arc_expense_payments pay
       where pay.expense_id = e.id
    ) p on true
`;

// ── 조회 ────────────────────────────────────────────────────────────────────

export async function listArcExpenses(query = {}) {
  const period = normalizePeriod(query.period);
  const status = oneOf(query.status, ARC_EXPENSE_STATUSES, "");
  const limit = Math.min(Math.max(toInt(query.limit, 100), 1), 300);

  const { rows } = await pool.query(
    `${EXPENSE_SELECT}
      where ($1::text = '' or e.period = $1
             or to_char(e.spent_on, 'YYYY-MM') = $1)
        and ($2::text = '' or e.settle_status = $2)
      order by e.spent_on desc, e.created_at desc
      limit $3`,
    [period, status, limit]
  );

  return rows.map(mapExpense);
}

export async function getArcExpense(id) {
  const expenseId = text(id, 40);

  if (!expenseId) throw badRequest("정산 항목을 찾을 수 없어요.");

  const { rows } = await pool.query(`${EXPENSE_SELECT} where e.id = $1::uuid`, [
    expenseId,
  ]);

  if (!rows[0]) {
    throw new HttpError(404, "HJ404", "정산 항목을 찾을 수 없어요.");
  }

  const { rows: payments } = await pool.query(
    `select *
       from public.arc_expense_payments
      where expense_id = $1::uuid
      order by paid_on, created_at`,
    [expenseId]
  );

  return { expense: mapExpense(rows[0]), payments: payments.map(mapPayment) };
}

// ── 정산상태 재계산 ─────────────────────────────────────────────────────────

async function recalcSettlement(client, expenseId) {
  const { rows } = await client.query(
    `select e.amount,
            coalesce((
              select sum(p.amount)
                from public.arc_expense_payments p
               where p.expense_id = e.id
            ), 0)::int as paid
       from public.arc_expenses e
      where e.id = $1::uuid`,
    [expenseId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "HJ404", "정산 항목을 찾을 수 없어요.");
  }

  const amount = toInt(rows[0].amount);
  const paid = toInt(rows[0].paid);
  const status = paid <= 0 ? "UNSETTLED" : paid >= amount ? "SETTLED" : "PARTIAL";

  await client.query(
    `update public.arc_expenses
        set settled_amount = $2,
            settle_status = $3,
            updated_at = now()
      where id = $1::uuid`,
    [expenseId, paid, status]
  );

  return { amount, paid, status };
}

async function nextExpenseNo(client, spentOn) {
  const prefix = `EXP-${kstStamp(spentOn)}-`;
  const { rows } = await client.query(
    `select expense_no
       from public.arc_expenses
      where expense_no like $1
      order by expense_no desc
      limit 1`,
    [`${prefix}%`]
  );
  const last = rows[0]?.expense_no ?? "";
  const seq = Number.parseInt(last.slice(prefix.length), 10);

  return `${prefix}${String((Number.isFinite(seq) ? seq : 0) + 1).padStart(2, "0")}`;
}

// ── 등록 ────────────────────────────────────────────────────────────────────

export async function createArcExpense(input = {}, employee = null) {
  const spentOn = kstDateString(parseKstDate(input.spentOn));
  const dueOn = input.dueOn
    ? kstDateString(parseKstDate(input.dueOn))
    : addDays(spentOn, DUE_DAYS);
  const category = oneOf(input.category, ARC_EXPENSE_CATEGORIES, "SUPPLY");
  const purpose = requireText(input.purpose, "목적·품목", 300);
  const amount = toInt(input.amount, 0);

  if (amount <= 0) {
    throw badRequest("금액은 0보다 커야 해요.");
  }

  const created = await withTransaction(async (client) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const expenseNo = await nextExpenseNo(client, parseKstDate(spentOn));

      try {
        const { rows } = await client.query(
          `insert into public.arc_expenses
             (id, expense_no, period, spent_on, category, purpose, amount, claimant,
              paid_by, vendor, receipt_no, pre_approved, source_type, source_ref,
              due_on, note, employee_id, employee_name)
           values ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                   $15::date, $16, $17, $18)
           returning id, expense_no`,
          [
            randomUUID(),
            expenseNo,
            normalizePeriod(input.period) || spentOn.slice(0, 7),
            spentOn,
            category,
            purpose,
            amount,
            text(input.claimant, 60) || text(employee?.name, 60),
            oneOf(input.paidBy, ["SHOP", "RN", "OWNER", "OTHER"], "RN"),
            text(input.vendor, 120),
            text(input.receiptNo, 60),
            flag(input.preApproved),
            "MANUAL",
            "",
            dueOn,
            text(input.note, 500),
            employee?.id ?? null,
            text(employee?.name, 60),
          ]
        );

        return rows[0];
      } catch (error) {
        if (!uniqueViolation(error) || attempt === 4) {
          throw error;
        }
      }
    }

    throw badRequest("정산 번호를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
  });

  await writeAuditLog({
    employee,
    action: "arc.expense.create",
    targetType: "arc_expense",
    targetId: created.id,
    detail: { expenseNo: created.expense_no, amount, category },
  });

  return getArcExpense(created.id);
}
// ── 입금(부분입금) ──────────────────────────────────────────────────────────

export async function addArcExpensePayment(id, input = {}, employee = null) {
  const expenseId = text(id, 40);
  const amount = toInt(input.amount, 0);

  if (amount <= 0) {
    throw badRequest("입금액은 0보다 커야 해요.");
  }

  const paidOn = kstDateString(parseKstDate(input.paidOn));
  const method = oneOf(input.method, ARC_PAYMENT_METHODS, "TRANSFER");

  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `select * from public.arc_expenses where id = $1::uuid for update`,
      [expenseId]
    );

    if (!rows[0]) {
      throw new HttpError(404, "HJ404", "정산 항목을 찾을 수 없어요.");
    }

    const remaining = Math.max(
      toInt(rows[0].amount) - toInt(rows[0].settled_amount),
      0
    );

    if (remaining <= 0) {
      throw badRequest("이미 정산이 끝난 항목이에요.");
    }

    if (amount > remaining) {
      throw badRequest(
        `남은 금액은 ${remaining.toLocaleString("ko-KR")}원이에요. 그 금액 이하로 입력해 주세요.`
      );
    }

    await client.query(
      `insert into public.arc_expense_payments
         (id, expense_id, paid_on, amount, method, note, employee_id, employee_name)
       values ($1, $2, $3::date, $4, $5, $6, $7, $8)`,
      [
        randomUUID(),
        expenseId,
        paidOn,
        amount,
        method,
        text(input.note, 300),
        employee?.id ?? null,
        text(employee?.name, 60),
      ]
    );

    await recalcSettlement(client, expenseId);
  });

  await writeAuditLog({
    employee,
    action: "arc.expense.payment",
    targetType: "arc_expense",
    targetId: expenseId,
    detail: { amount, method, paidOn },
  });

  return getArcExpense(expenseId);
}

export async function removeArcExpensePayment(id, paymentId, employee = null) {
  const expenseId = text(id, 40);
  const targetId = text(paymentId, 40);

  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `select * from public.arc_expenses where id = $1::uuid for update`,
      [expenseId]
    );

    if (!rows[0]) {
      throw new HttpError(404, "HJ404", "정산 항목을 찾을 수 없어요.");
    }

    const { rowCount } = await client.query(
      `delete from public.arc_expense_payments
        where id = $1::uuid
          and expense_id = $2::uuid`,
      [targetId, expenseId]
    );

    if (rowCount === 0) {
      throw new HttpError(404, "HJ404", "입금 기록을 찾을 수 없어요.");
    }

    await recalcSettlement(client, expenseId);
  });

  await writeAuditLog({
    employee,
    action: "arc.expense.payment.remove",
    targetType: "arc_expense",
    targetId: expenseId,
    detail: { paymentId: targetId },
  });

  return getArcExpense(expenseId);
}

// ── 수정·승인 ───────────────────────────────────────────────────────────────

export async function updateArcExpense(id, input = {}, employee = null) {
  const expenseId = text(id, 40);
  const approve = flag(input.approve);

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `select * from public.arc_expenses where id = $1::uuid for update`,
      [expenseId]
    );

    if (!rows[0]) {
      throw new HttpError(404, "HJ404", "정산 항목을 찾을 수 없어요.");
    }

    const row = rows[0];
    const patch = {
      category: oneOf(input.category, ARC_EXPENSE_CATEGORIES, row.category),
      purpose: input.purpose === undefined ? row.purpose : text(input.purpose, 300),
      claimant: input.claimant === undefined ? row.claimant : text(input.claimant, 60),
      paidBy: oneOf(input.paidBy, ["SHOP", "RN", "OWNER", "OTHER"], row.paid_by),
      vendor: input.vendor === undefined ? row.vendor : text(input.vendor, 120),
      receiptNo:
        input.receiptNo === undefined ? row.receipt_no : text(input.receiptNo, 60),
      note: input.note === undefined ? row.note : text(input.note, 500),
      preApproved:
        input.preApproved === undefined ? row.pre_approved : flag(input.preApproved),
      dueOn: input.dueOn === undefined ? row.due_on : kstDateString(parseKstDate(input.dueOn)),
      amount: toInt(row.amount),
    };

    if (input.amount !== undefined) {
      if (toInt(row.settled_amount) > 0) {
        throw badRequest("입금이 시작된 항목은 금액을 바꿀 수 없어요.");
      }

      patch.amount = toInt(input.amount, 0);

      if (patch.amount <= 0) {
        throw badRequest("금액은 0보다 커야 해요.");
      }
    }

    // 승인(대표확인)은 한 번만 찍고 이후 덮어쓰지 않습니다.
    const approvedByName = approve && !row.approved_at ? text(employee?.name, 60) : row.approved_by_name;
    const approvedBy = approve && !row.approved_at ? (employee?.id ?? null) : row.approved_by;

    await client.query(
      `update public.arc_expenses
          set category = $2,
              purpose = $3,
              claimant = $4,
              paid_by = $5,
              vendor = $6,
              receipt_no = $7,
              note = $8,
              pre_approved = $9,
              due_on = $10::date,
              amount = $11,
              approved_by = $12,
              approved_by_name = $13,
              approved_at = case when $14::boolean then coalesce(approved_at, now()) else approved_at end,
              updated_at = now()
        where id = $1::uuid`,
      [
        expenseId,
        patch.category,
        patch.purpose,
        patch.claimant,
        patch.paidBy,
        patch.vendor,
        patch.receiptNo,
        patch.note,
        patch.preApproved,
        patch.dueOn,
        patch.amount,
        approvedBy,
        approvedByName,
        approve,
      ]
    );

    await recalcSettlement(client, expenseId);

    return { expenseNo: row.expense_no, approved: approve };
  });

  await writeAuditLog({
    employee,
    action: approve ? "arc.expense.approve" : "arc.expense.update",
    targetType: "arc_expense",
    targetId: expenseId,
    detail: { expenseNo: result.expenseNo },
  });

  return getArcExpense(expenseId);
}
// ── 월 소모금액 일괄 정산 ───────────────────────────────────────────────────

export async function createArcExpenseFromUsageMonth(input = {}, employee = null) {
  const period = normalizePeriod(input.period) || currentKstPeriod();

  const created = await withTransaction(async (client) => {
    const usages = await listBillableUsagesForPeriod(client, period);

    if (usages.length === 0) {
      throw badRequest("해당 기간에 청구할 미정산 사용 기록이 없어요.");
    }

    const total = usages.reduce((sum, usage) => sum + toInt(usage.total_amount), 0);

    if (total <= 0) {
      throw badRequest(
        "청구할 금액이 없어요. 내구재만 사용한 기록은 정산 대상이 아니에요."
      );
    }

    const today = kstDateString();
    const usageIds = usages.map((usage) => usage.id);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const expenseNo = await nextExpenseNo(client, new Date());

      try {
        const { rows } = await client.query(
          `insert into public.arc_expenses
             (id, expense_no, period, spent_on, category, purpose, amount, claimant,
              paid_by, receipt_no, source_type, source_ref, due_on, note,
              employee_id, employee_name)
           values ($1, $2, $3, $4::date, 'SUPPLY', $5, $6, $7, $8, '', 'USAGE_MONTH', $9,
                   $10::date, $11, $12, $13)
           returning id, expense_no`,
          [
            randomUUID(),
            expenseNo,
            period,
            today,
            `${period} 구급상자 사용대장 정산 ${usages.length}건`,
            total,
            text(input.claimant, 60) || text(employee?.name, 60),
            oneOf(input.paidBy, ["SHOP", "RN", "OWNER", "OTHER"], "RN"),
            period,
            addDays(today, DUE_DAYS),
            text(input.note, 500),
            employee?.id ?? null,
            text(employee?.name, 60),
          ]
        );

        await client.query(
          `update public.arc_usages
              set expense_id = $1::uuid
            where id = any($2::uuid[])
              and expense_id is null`,
          [rows[0].id, usageIds]
        );

        return {
          id: rows[0].id,
          expenseNo: rows[0].expense_no,
          usageCount: usages.length,
          total,
        };
      } catch (error) {
        if (!uniqueViolation(error) || attempt === 4) {
          throw error;
        }
      }
    }

    throw badRequest("정산 번호를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
  });

  await writeAuditLog({
    employee,
    action: "arc.expense.fromUsageMonth",
    targetType: "arc_expense",
    targetId: created.id,
    detail: {
      expenseNo: created.expenseNo,
      period,
      usageCount: created.usageCount,
      total: created.total,
    },
  });

  await createArcNotification({
    kind: "ARC_EXPENSE",
    level: "INFO",
    title: "월 소모금액 정산서를 만들었어요",
    body: [
      `정산번호: ${created.expenseNo}`,
      `정산기간: ${period}`,
      `대상: 사용대장 ${created.usageCount}건 / ${created.total.toLocaleString("ko-KR")}원`,
      "영수증을 확인하고 입금이 들어오면 부분입금으로 기록해 주세요.",
    ].join("\n"),
    link: "/admin/arc/expenses",
  }).catch(() => {});

  return {
    ...(await getArcExpense(created.id)),
    applied: { usageCount: created.usageCount, total: created.total, period },
  };
}

/** 아직 정산서로 묶지 않은 사용대장 미리보기. */
export async function previewUsageMonth(period) {
  const target = normalizePeriod(period) || currentKstPeriod();

  const usages = await listBillableUsagesForPeriod(pool, target);
  const total = usages.reduce((sum, usage) => sum + toInt(usage.total_amount), 0);

  return {
    period: target,
    usageCount: usages.length,
    total,
    usages: usages.map((usage) => ({
      id: usage.id,
      usageNo: usage.usage_no,
      usedAt: usage.used_at,
      targetKind: usage.target_kind,
      totalAmount: toInt(usage.total_amount),
    })),
  };
}

// ── 요약 ────────────────────────────────────────────────────────────────────

export async function arcExpenseSummary() {
  const period = currentKstPeriod();

  const { rows } = await pool.query(
    `select
        coalesce(sum(amount - settled_amount) filter (where settle_status <> 'SETTLED'), 0)::int as open_amount,
        count(*) filter (where settle_status <> 'SETTLED')::int as open_count,
        coalesce(sum(amount) filter (where to_char(spent_on, 'YYYY-MM') = $1), 0)::int as month_amount,
        count(*) filter (
          where settle_status <> 'SETTLED'
            and due_on is not null
            and due_on < current_date
        )::int as overdue_count,
        max(created_at) as last_created_at
      from public.arc_expenses`,
    [period]
  );

  const { rows: paid } = await pool.query(
    `select coalesce(sum(amount), 0)::int as paid_amount
       from public.arc_expense_payments
      where to_char(paid_on, 'YYYY-MM') = $1`,
    [period]
  );

  return {
    period,
    openAmount: toInt(rows[0]?.open_amount),
    openCount: toInt(rows[0]?.open_count),
    monthAmount: toInt(rows[0]?.month_amount),
    overdueCount: toInt(rows[0]?.overdue_count),
    paidThisMonth: toInt(paid[0]?.paid_amount),
    lastCreatedAt: rows[0]?.last_created_at ?? null,
  };
}