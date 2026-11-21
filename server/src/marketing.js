// P7 — 휴대폰 번호 회원 기반 마케팅(문자/알림톡).
//
// 회원 식별자는 customers.phone 하나입니다. 카카오 로그인은 쓰지 않습니다.
// 대상은 "마케팅 수신에 동의했고 번호가 살아 있는 고객"으로만 한정합니다.
import { randomUUID } from "node:crypto";
import { writeAuditLog } from "./auth/audit.js";
import { ACTIVE_BALANCE_SQL, VISIT_STATS_SQL } from "./crm.js";
import { pool } from "./db.js";
import { HttpError } from "./http/errors.js";
import {
  channelLabel,
  isDryRun,
  messagingProvider,
  messagingSender,
  sendOne,
} from "./messaging.js";
import { formatPhone } from "./points.js";

const MAX_TITLE = 60;
const MAX_BODY = 1000;
const SEND_BATCH = 200;
const SAMPLE_SIZE = 5;

export const CHANNELS = ["SMS", "LMS", "ALIMTALK"];

// base CTE 컬럼만으로 조건을 씁니다(목록/집계 양쪽에서 같은 문자열을 재사용).
export const SEGMENTS = {
  CONSENTED: {
    label: "수신 동의 전체",
    description: "마케팅 수신에 동의한 모든 회원",
    where: "true",
  },
  DORMANT: {
    label: "휴면 (60일 이상 미방문)",
    description: "마지막 방문이 60일 넘은 회원 — 재방문 유도용",
    where: "last_visit_at is not null and last_visit_at < now() - interval '60 days'",
  },
  NEW: {
    label: "신규 (30일 이내 등록)",
    description: "최근 30일 안에 처음 등록한 회원 — 환영 메시지용",
    where: "created_at >= now() - interval '30 days'",
  },
  POINTS: {
    label: "포인트 보유 (1,000P 이상)",
    description: "쓸 수 있는 포인트가 1,000P 이상 쌓인 회원 — 소멸 안내용",
    where: "balance >= 1000",
  },
};

const AUDIENCE_CTE = `
  with base as (
    select c.id,
           c.phone,
           c.name,
           c.nickname,
           c.created_at,
           v.visit_count,
           v.last_visit_at,
           ${ACTIVE_BALANCE_SQL} as balance
      from public.customers c
      ${VISIT_STATS_SQL}
     where c.marketing_consent = true
       and length(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g')) between 9 and 11
  )`;

function segmentOf(segment) {
  const key = String(segment || "CONSENTED").toUpperCase();

  return SEGMENTS[key] ? key : null;
}

function trimText(value, max) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function trimBody(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, MAX_BODY);
}

function maskPhone(phone) {
  const text = formatPhone(phone);
  const parts = text.split("-");

  if (parts.length === 3) return `${parts[0]}-****-${parts[2]}`;

  return text.slice(0, 3) + "****";
}

function resolveBody(body, row) {
  return String(body || "")
    .replace(/#\{이름\}/g, row.name || "고객님")
    .replace(/#\{포인트\}/g, String(Number(row.balance || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ","));
}

function mapCampaign(row) {
  if (!row) return null;

  return {
    id: row.id,
    title: row.title || "",
    body: row.body || "",
    channel: row.channel || "SMS",
    channelLabel: channelLabel(row.channel),
    segment: row.segment || "CONSENTED",
    segmentLabel: SEGMENTS[row.segment]?.label || row.segment || "",
    targetCount: Number(row.target_count || 0),
    sentCount: Number(row.sent_count || 0),
    failedCount: Number(row.failed_count || 0),
    status: row.status || "DRAFT",
    provider: row.provider || "",
    providerNote: row.provider_note || "",
    createdByName: row.created_by_name || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    sentAt: row.sent_at || null,
  };
}

function mapLog(row) {
  return {
    id: row.id,
    customerId: row.customer_id || null,
    name: row.name || "",
    phoneText: formatPhone(row.phone),
    status: row.status || "PENDING",
    attempts: Number(row.attempts || 0),
    error: row.error || "",
    sentAt: row.sent_at || null,
  };
}

// ---------------------------------------------------------------- 설정/세그먼트

export function getMarketingSettings() {
  const provider = messagingProvider();

  return {
    provider,
    dryRun: isDryRun(),
    sender: messagingSender(),
    channels: CHANNELS.map((value) => ({ value, label: channelLabel(value) })),
    segments: Object.entries(SEGMENTS).map(([value, meta]) => ({
      value,
      label: meta.label,
      description: meta.description,
    })),
    maxTitle: MAX_TITLE,
    maxBody: MAX_BODY,
  };
}

export async function getSegmentCounts() {
  const { rows } = await pool.query(`
    ${AUDIENCE_CTE}
    select count(*)::int as consented,
           count(*) filter (where ${SEGMENTS.DORMANT.where})::int as dormant,
           count(*) filter (where ${SEGMENTS.NEW.where})::int as new,
           count(*) filter (where ${SEGMENTS.POINTS.where})::int as points
      from base`);

  const row = rows[0] || {};

  return Object.keys(SEGMENTS).map((value) => ({
    value,
    label: SEGMENTS[value].label,
    description: SEGMENTS[value].description,
    count: Number(row[value.toLowerCase()] || 0),
  }));
}

// ---------------------------------------------------------------- 대상 미리보기

export async function previewAudience({ segment = "CONSENTED" } = {}) {
  const key = segmentOf(segment);

  if (!key) {
    throw new HttpError(400, "HJ400", "발송 대상을 다시 선택해 주세요.");
  }

  const { rows } = await pool.query(
    `${AUDIENCE_CTE}
     select id, phone, name, nickname, balance, visit_count, last_visit_at, created_at
       from base
      where ${SEGMENTS[key].where}
      order by last_visit_at desc nulls last, created_at desc`,
    []
  );

  return {
    segment: key,
    segmentLabel: SEGMENTS[key].label,
    total: rows.length,
    sample: rows.slice(0, SAMPLE_SIZE).map((row) => ({
      id: row.id,
      name: row.name || "",
      phoneText: formatPhone(row.phone),
      balance: Number(row.balance || 0),
      visitCount: Number(row.visit_count || 0),
      lastVisitAt: row.last_visit_at || null,
    })),
  };
}

// ---------------------------------------------------------------- 캠페인

export async function createCampaign({
  title,
  body,
  channel = "SMS",
  segment = "CONSENTED",
  employee = null,
} = {}) {
  const safeTitle = trimText(title, MAX_TITLE);
  const safeBody = trimBody(body);
  const safeChannel = String(channel || "SMS").toUpperCase();
  const key = segmentOf(segment);

  if (!safeTitle) {
    throw new HttpError(400, "HJ400", "발송 제목을 입력해 주세요.");
  }

  if (!safeBody) {
    throw new HttpError(400, "HJ400", "발송 내용을 입력해 주세요.");
  }

  if (!CHANNELS.includes(safeChannel)) {
    throw new HttpError(400, "HJ400", "발송 방식을 다시 선택해 주세요.");
  }

  if (!key) {
    throw new HttpError(400, "HJ400", "발송 대상을 다시 선택해 주세요.");
  }

  // 글자수 기준(SMS 90byte)은 안내만 하고 실제 차단은 하지 않습니다.
  const audience = await previewAudience({ segment: key });
  const provider = messagingProvider();
  const note = isDryRun()
    ? "검수용 모드 — 실제로 발송되지 않습니다."
    : "";

  const { rows } = await pool.query(
    `insert into public.message_campaigns
       (id, title, body, channel, segment, target_count, status, provider, provider_note,
        created_by, created_by_name)
     values ($1, $2, $3, $4, $5, $6, 'DRAFT', $7, $8, $9, $10)
     returning *`,
    [
      randomUUID(),
      safeTitle,
      safeBody,
      safeChannel,
      key,
      audience.total,
      provider,
      note,
      employee?.id || null,
      employee?.name || "",
    ]
  );

  return mapCampaign(rows[0]);
}

export async function listCampaigns({ limit = 30, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const { rows } = await pool.query(
    `select * from public.message_campaigns
      order by created_at desc
      limit $1 offset $2`,
    [safeLimit, safeOffset]
  );

  const { rows: countRows } = await pool.query(
    `select count(*)::int as total from public.message_campaigns`
  );

  return {
    campaigns: rows.map(mapCampaign),
    total: Number(countRows[0]?.total || 0),
  };
}

export async function getCampaign({ campaignId, logLimit = 50 } = {}) {
  const safeId = String(campaignId || "").trim();
  const safeLimit = Math.min(Math.max(Number(logLimit) || 50, 1), 200);

  const { rows } = await pool.query(
    `select * from public.message_campaigns where id = $1`,
    [safeId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "HJ404", "캠페인을 찾을 수 없어요.");
  }

  const { rows: logs } = await pool.query(
    `select l.*, c.name
       from public.message_logs l
       left join public.customers c on c.id = l.customer_id
      where l.campaign_id = $1
      order by l.created_at asc
      limit $2`,
    [safeId, safeLimit]
  );

  return {
    campaign: mapCampaign(rows[0]),
    logs: logs.map(mapLog),
  };
}

// 대상자 명단을 message_logs 로 굳힙니다(이미 있는 건 건너뜀 → 재발송해도 중복 없음).
async function materializeLogs(client, campaignId, segment) {
  await client.query(
    `insert into public.message_logs (id, campaign_id, customer_id, phone)
     ${AUDIENCE_CTE}
     select gen_random_uuid()::text, $1, base.id, base.phone
       from base
      where ${SEGMENTS[segment].where}
     on conflict do nothing`,
    [campaignId]
  );
}

async function deliverPending({ client, campaignId, limit = SEND_BATCH }) {
  const { rows: campaignRows } = await client.query(
    `select title, body, channel from public.message_campaigns where id = $1`,
    [campaignId]
  );
  const campaign = campaignRows[0];

  if (!campaign) {
    throw new HttpError(404, "HJ404", "캠페인을 찾을 수 없어요.");
  }

  let sent = 0;
  let failed = 0;

  // 한 번에 다 보내면 요청이 길어지므로 배치로 끊습니다. 실패 건은 상태가 FAILED 로
  // 바뀌어 다음 조회에서 빠지므로 무한 반복되지 않습니다.
  for (let batch = 0; batch < 5; batch += 1) {
    const { rows: pending } = await client.query(
      `select l.id, l.phone, c.name, ${ACTIVE_BALANCE_SQL} as balance
         from public.message_logs l
         left join public.customers c on c.id = l.customer_id
        where l.campaign_id = $1
          and l.status = 'PENDING'
        order by l.created_at asc
        limit $2`,
      [campaignId, limit]
    );

    if (pending.length === 0) break;

    for (const log of pending) {
      try {
        const result = await sendOne({
          to: log.phone,
          title: campaign.title,
          text: resolveBody(campaign.body, log),
          channel: campaign.channel,
        });

        await client.query(
          `update public.message_logs
              set status = 'SENT',
                  attempts = attempts + 1,
                  error = '',
                  provider_message_id = $2,
                  sent_at = now()
            where id = $1`,
          [log.id, result?.id || ""]
        );
        sent += 1;
      } catch (error) {
        await client.query(
          `update public.message_logs
              set status = 'FAILED',
                  attempts = attempts + 1,
                  error = $2
            where id = $1`,
          [log.id, String(error?.message || "발송 실패").slice(0, 300)]
        );
        failed += 1;
      }
    }
  }

  return { sent, failed };
}

// 발송을 한 번이라도 시도한 캠페인은 SENT 로 둡니다(실패 건은 retry 로 다시 보냅니다).
async function refreshCampaignStats(client, campaignId) {
  const { rows } = await client.query(
    `update public.message_campaigns mc
        set target_count = stats.total,
            sent_count = stats.sent,
            failed_count = stats.failed,
            status = 'SENT',
            sent_at = coalesce(mc.sent_at, now()),
            updated_at = now()
       from (
         select count(*)::int as total,
                count(*) filter (where status = 'SENT')::int as sent,
                count(*) filter (where status = 'FAILED')::int as failed
           from public.message_logs
          where campaign_id = $1
       ) stats
      where mc.id = $1
      returning mc.*`,
    [campaignId]
  );

  return mapCampaign(rows[0]);
}

export async function sendCampaign({ campaignId, employee = null, ip = "", log = null } = {}) {
  const safeId = String(campaignId || "").trim();
  const client = await pool.connect();
  let campaign = null;
  let result = { sent: 0, failed: 0 };

  try {
    await client.query("begin");

    const { rows } = await client.query(
      `select * from public.message_campaigns where id = $1 for update`,
      [safeId]
    );

    if (!rows[0]) {
      throw new HttpError(404, "HJ404", "캠페인을 찾을 수 없어요.");
    }

    if (rows[0].status === "SENT") {
      throw new HttpError(409, "HJ409", "이미 발송한 캠페인이에요.");
    }

    await materializeLogs(client, safeId, rows[0].segment);
    result = await deliverPending({ client, campaignId: safeId });
    campaign = await refreshCampaignStats(client, safeId);

    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await writeAuditLog({
    employee,
    action: "marketing.send",
    targetType: "campaign",
    targetId: safeId,
    detail: {
      title: campaign?.title || "",
      segment: campaign?.segment || "",
      sent: result.sent,
      failed: result.failed,
      targetCount: campaign?.targetCount || 0,
      provider: campaign?.provider || "",
    },
    ip,
    log,
  });

  return { campaign, sent: result.sent, failed: result.failed };
}

// 실패/미발송 건만 다시 보냅니다. 이미 보낸 건은 건드리지 않습니다.
export async function retryCampaign({ campaignId, employee = null, ip = "", log = null } = {}) {
  const safeId = String(campaignId || "").trim();
  const client = await pool.connect();
  let campaign = null;
  let result = { sent: 0, failed: 0 };

  try {
    await client.query("begin");

    const { rows } = await client.query(
      `select * from public.message_campaigns where id = $1 for update`,
      [safeId]
    );

    if (!rows[0]) {
      throw new HttpError(404, "HJ404", "캠페인을 찾을 수 없어요.");
    }

    if (rows[0].status !== "SENT") {
      throw new HttpError(409, "HJ409", "아직 발송하지 않은 캠페인이에요.");
    }

    // 실패했던 건을 대기 상태로 되돌린 뒤 다시 보냅니다.
    await client.query(
      `update public.message_logs
          set status = 'PENDING'
        where campaign_id = $1
          and status = 'FAILED'`,
      [safeId]
    );

    result = await deliverPending({ client, campaignId: safeId });
    campaign = await refreshCampaignStats(client, safeId);

    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await writeAuditLog({
    employee,
    action: "marketing.retry",
    targetType: "campaign",
    targetId: safeId,
    detail: { sent: result.sent, failed: result.failed },
    ip,
    log,
  });

  return { campaign, sent: result.sent, failed: result.failed };
}

// ---------------------------------------------------------------- 수신거부

export async function getUnsubscribeInfo({ token } = {}) {
  const safeToken = String(token || "").trim();

  if (!safeToken) {
    throw new HttpError(400, "HJ400", "수신거부 링크가 올바르지 않아요.");
  }

  const { rows } = await pool.query(
    `select id, phone, name, marketing_consent
       from public.customers
      where marketing_opt_out_token = $1`,
    [safeToken]
  );

  if (!rows[0]) {
    throw new HttpError(404, "HJ404", "수신거부 링크가 올바르지 않아요.");
  }

  return {
    phoneText: maskPhone(rows[0].phone),
    name: rows[0].name || "",
    marketingConsent: Boolean(rows[0].marketing_consent),
  };
}

export async function unsubscribeByToken({ token } = {}) {
  const safeToken = String(token || "").trim();

  if (!safeToken) {
    throw new HttpError(400, "HJ400", "수신거부 링크가 올바르지 않아요.");
  }

  const { rows } = await pool.query(
    `update public.customers
        set marketing_consent = false,
            marketing_consent_source = 'CUSTOMER',
            updated_at = now()
      where marketing_opt_out_token = $1
      returning id, phone, name, marketing_consent`,
    [safeToken]
  );

  if (!rows[0]) {
    throw new HttpError(404, "HJ404", "수신거부 링크가 올바르지 않아요.");
  }

  return {
    phoneText: maskPhone(rows[0].phone),
    name: rows[0].name || "",
  };
}

// ---------------------------------------------------------------- 명단 내려받기

function csvCell(value) {
  const text = String(value ?? "");

  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportAudienceCsv({ segment = "CONSENTED" } = {}) {
  const key = segmentOf(segment);

  if (!key) {
    throw new HttpError(400, "HJ400", "발송 대상을 다시 선택해 주세요.");
  }

  const { rows } = await pool.query(
    `${AUDIENCE_CTE}
     select phone, name, nickname, created_at, visit_count, last_visit_at, balance
       from base
      where ${SEGMENTS[key].where}
      order by last_visit_at desc nulls last, created_at desc`
  );

  const header = [
    "휴대폰번호",
    "이름",
    "닉네임",
    "방문횟수",
    "최근방문일",
    "보유포인트",
  ];

  const lines = rows.map((row) =>
    [
      formatPhone(row.phone),
      row.name || "",
      row.nickname || "",
      Number(row.visit_count || 0),
      row.last_visit_at ? new Date(row.last_visit_at).toISOString().slice(0, 10) : "",
      Number(row.balance || 0),
    ]
      .map(csvCell)
      .join(",")
  );

  // 엑셀이 한글을 깨뜨리지 않도록 BOM 을 붙입니다.
  return `\uFEFF${[header.join(","), ...lines].join("\n")}\n`;
}
