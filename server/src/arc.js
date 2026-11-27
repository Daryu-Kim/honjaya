// P14 — ARC SAFETY 기반 도메인 로직.
//
// P14A 범위: 설정 · 알림함(+디스코드 #응급안전) · 동의서 · 민감정보 접근 승인/열람 로그.
// 개인정보를 저장하는 단계(P14C)보다 이 장치들이 먼저 있어야 하므로 여기서 시작합니다.
//
// 규칙
//   * 민감 컬럼은 반드시 encryptField/decryptField 를 통해서만 넣고 뺍니다.
//   * 원문은 로그·에러 메시지에 남기지 않습니다.
//   * 알림 전송 실패(봇 꺼짐)는 업무 기록을 막지 않습니다.
import { randomUUID } from "node:crypto";

import { decryptField, encryptField, hasArcKey } from "./arcCrypto.js";
import { writeAuditLog } from "./auth/audit.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { callBot } from "./discordBot.js";
import { badRequest, HttpError } from "./http/errors.js";

export const ARC_NOTIFICATION_KINDS = [
  "EXPIRY",
  "STOCK",
  "OTC",
  "CHECK",
  "EDU",
  "INCIDENT",
  "USAGE",
  "EXPENSE",
  "PURGE",
  "GENERAL",
];

export const ARC_NOTIFICATION_LEVELS = ["INFO", "WARN", "CRITICAL"];

export const ARC_CONSENT_KINDS = ["PAPER", "ELECTRONIC"];

function fail(message) {
  return new HttpError(503, "HJ503", message);
}

/** 민감정보를 다루는 경로는 키가 없으면 아예 열리지 않습니다. */
export function requireArcFieldKey() {
  if (!hasArcKey(config.arc.fieldKey)) {
    throw fail(
      "민감정보 암호화 키(ARC_FIELD_KEY)가 설정되지 않아 응급안전 기록 기능을 사용할 수 없어요."
    );
  }
}

export function arcHealth() {
  return {
    fieldKeyConfigured: hasArcKey(config.arc.fieldKey),
    filesDir: config.arc.filesDir,
  };
}

function toInt(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function clampInt(value, min, max, fallback) {
  const number = toInt(value, fallback);

  return Math.min(max, Math.max(min, number));
}

function mapSettings(row) {
  return {
    alertChannelId: row?.alert_channel_id ?? "",
    discordAlertEnabled: row?.discord_alert_enabled ?? true,
    appAlertEnabled: row?.app_alert_enabled ?? true,
    recordRetentionYears: row?.record_retention_years ?? 3,
    sensitiveRetentionYears: row?.sensitive_retention_years ?? 2,
    accessTtlMinutes: row?.access_ttl_minutes ?? 480,
    updatedByName: row?.updated_by_name ?? "",
    updatedAt: row?.updated_at ?? null,
  };
}

export async function getArcSettings() {
  const { rows } = await pool.query(
    `select * from public.arc_settings where id = 1`
  );

  return mapSettings(rows[0]);
}

export async function updateArcSettings(patch = {}, employee = null) {
  const current = await getArcSettings();
  const alertChannelId = String(patch.alertChannelId ?? current.alertChannelId ?? "").trim();

  if (alertChannelId && !/^\d{5,25}$/.test(alertChannelId)) {
    throw badRequest("디스코드 채널 ID 는 숫자만 입력해 주세요.");
  }

  const { rows } = await pool.query(
    `update public.arc_settings
        set alert_channel_id = $1,
            discord_alert_enabled = $2,
            app_alert_enabled = $3,
            record_retention_years = $4,
            sensitive_retention_years = $5,
            access_ttl_minutes = $6,
            updated_by = $7,
            updated_by_name = $8,
            updated_at = now()
      where id = 1
      returning *`,
    [
      alertChannelId,
      patch.discordAlertEnabled === undefined
        ? current.discordAlertEnabled
        : Boolean(patch.discordAlertEnabled),
      patch.appAlertEnabled === undefined
        ? current.appAlertEnabled
        : Boolean(patch.appAlertEnabled),
      clampInt(patch.recordRetentionYears ?? current.recordRetentionYears, 1, 30, 3),
      clampInt(patch.sensitiveRetentionYears ?? current.sensitiveRetentionYears, 1, 30, 2),
      clampInt(patch.accessTtlMinutes ?? current.accessTtlMinutes, 5, 10080, 480),
      employee?.id ?? null,
      employee?.name ?? "",
    ]
  );

  return mapSettings(rows[0]);
}

// ── 알림 ─────────────────────────────────────────────────────────────

async function pushArcNotificationToDiscord({ settings, title, body, level }) {
  if (!settings.alertChannelId || !settings.discordAlertEnabled) {
    return;
  }

  const prefix = level === "CRITICAL" ? "🚨" : level === "WARN" ? "⚠️" : "ℹ️";

  try {
    await callBot({
      method: "POST",
      path: "/internal/messages",
      body: {
        channelId: settings.alertChannelId,
        title: `${prefix} ${title}`.slice(0, 250),
        body: String(body ?? "").slice(0, 3800),
        createdBy: "arc",
      },
    });
  } catch (error) {
    // 봇이 꺼져 있어도 업무 기록은 남아야 합니다.
    if (!(error instanceof HttpError)) {
      throw error;
    }
  }
}

/**
 * 알림 1건 생성. dedupeKey 가 이미 있으면 아무 것도 하지 않고 null 을 돌려줍니다.
 * 앱 알림함과 디스코드 #응급안전에 같은 내용이 나갑니다.
 */
export async function createArcNotification({
  kind = "GENERAL",
  level = "INFO",
  title = "",
  body = "",
  link = "",
  incidentNo = "",
  targetEmployeeId = null,
  dedupeKey = null,
  createdBy = null,
} = {}) {
  const safeKind = ARC_NOTIFICATION_KINDS.includes(kind) ? kind : "GENERAL";
  const safeLevel = ARC_NOTIFICATION_LEVELS.includes(level) ? level : "INFO";
  const settings = await getArcSettings();

  if (!settings.appAlertEnabled && !settings.discordAlertEnabled) {
    return null;
  }

  const { rows } = await pool.query(
    `insert into public.arc_notifications
       (id, kind, level, title, body, link, incident_no, target_employee_id, dedupe_key, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (dedupe_key) do nothing
     returning *`,
    [
      randomUUID(),
      safeKind,
      safeLevel,
      String(title ?? "").slice(0, 200),
      String(body ?? "").slice(0, 2000),
      String(link ?? "").slice(0, 200),
      String(incidentNo ?? "").slice(0, 60),
      targetEmployeeId || null,
      dedupeKey ? String(dedupeKey).slice(0, 200) : null,
      createdBy || null,
    ]
  );

  const row = rows[0] ?? null;

  if (row && settings.discordAlertEnabled) {
    await pushArcNotificationToDiscord({ settings, title, body, level: safeLevel });
  }

  return row ? mapNotification(row) : null;
}

function mapNotification(row) {
  return {
    id: row.id,
    kind: row.kind,
    level: row.level,
    title: row.title,
    body: row.body,
    link: row.link,
    incidentNo: row.incident_no,
    targetEmployeeId: row.target_employee_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function listArcNotifications({
  employeeId = null,
  unreadOnly = false,
  limit = 30,
} = {}) {
  const { rows } = await pool.query(
    `select *
       from public.arc_notifications
      where (target_employee_id is null or target_employee_id = $1)
        and ($2::boolean is false or read_at is null)
      order by created_at desc
      limit $3`,
    [employeeId, Boolean(unreadOnly), clampInt(limit, 1, 200, 30)]
  );

  return rows.map(mapNotification);
}

export async function countUnreadArcNotifications(employeeId = null) {
  const { rows } = await pool.query(
    `select count(*)::int as count
       from public.arc_notifications
      where (target_employee_id is null or target_employee_id = $1)
        and read_at is null`,
    [employeeId]
  );

  return rows[0]?.count ?? 0;
}

/** ids 가 비어 있으면 내가 볼 수 있는 알림 전체를 읽음 처리합니다. */
export async function markArcNotificationsRead({ employeeId = null, ids = [] } = {}) {
  const list = Array.isArray(ids) ? ids.filter(Boolean).slice(0, 200) : [];

  const { rowCount } = await pool.query(
    `update public.arc_notifications
        set read_at = now(), read_by = $1
      where read_at is null
        and (target_employee_id is null or target_employee_id = $1)
        and (cardinality($2::uuid[]) = 0 or id = any($2::uuid[]))`,
    [employeeId, list]
  );

  return { updated: rowCount ?? 0 };
}

// ── 동의서 ───────────────────────────────────────────────────────────

function requireText(value, label, max = 200) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw badRequest(`${label}을(를) 입력해 주세요.`);
  }

  return text.slice(0, max);
}

function mapConsent(row, { revealSensitive }) {
  return {
    id: row.id,
    incidentNo: row.incident_no,
    subjectLabel: row.subject_label,
    // 민감 상세(성명·연락처)는 arc.sensitive 권한 + 접근승인이 있을 때만 내려줍니다.
    subjectName: revealSensitive ? decryptField(config.arc.fieldKey, row.subject_name_enc) : null,
    subjectPhone: revealSensitive ? decryptField(config.arc.fieldKey, row.subject_phone_enc) : null,
    kind: row.kind,
    purpose: row.purpose,
    scope: row.scope,
    confirmedByName: row.confirmed_by_name,
    confirmedAt: row.confirmed_at,
    retentionUntil: row.retention_until,
    status: row.status,
    withdrawnAt: row.withdrawn_at,
    withdrawnReason: row.withdrawn_reason,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  };
}

export async function listArcConsents({
  incidentNo = null,
  includeInactive = false,
  revealSensitive = false,
  limit = 100,
} = {}) {
  const { rows } = await pool.query(
    `select *
       from public.arc_consents
      where ($1::text is null or incident_no = $1)
        and ($2::boolean is true or status <> 'WITHDRAWN')
      order by created_at desc
      limit $3`,
    [incidentNo || null, Boolean(includeInactive), clampInt(limit, 1, 300, 100)]
  );

  return rows.map((row) => mapConsent(row, { revealSensitive }));
}

export async function createArcConsent(input = {}, employee = null) {
  requireArcFieldKey();

  const kind = ARC_CONSENT_KINDS.includes(input.kind) ? input.kind : "PAPER";
  const subjectLabel = requireText(input.subjectLabel ?? input.subjectName, "동의 대상 표시명", 80);
  const retentionUntil = String(input.retentionUntil ?? "").trim() || null;

  if (retentionUntil && !/^\d{4}-\d{2}-\d{2}$/.test(retentionUntil)) {
    throw badRequest("보존기간 만료일은 YYYY-MM-DD 형식으로 입력해 주세요.");
  }

  const { rows } = await pool.query(
    `insert into public.arc_consents
       (id, incident_no, subject_label, subject_name_enc, subject_phone_enc,
        kind, purpose, scope, retention_until, created_by, created_by_name)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning *`,
    [
      randomUUID(),
      String(input.incidentNo ?? "").trim().slice(0, 60),
      subjectLabel,
      encryptField(config.arc.fieldKey, input.subjectName),
      encryptField(config.arc.fieldKey, input.subjectPhone),
      kind,
      String(input.purpose ?? "").trim().slice(0, 300),
      String(input.scope ?? "").trim().slice(0, 300),
      retentionUntil,
      employee?.id ?? null,
      employee?.name ?? "",
    ]
  );

  await writeAuditLog({
    employee,
    action: "arc.consent.create",
    targetType: "arc_consent",
    targetId: rows[0].id,
    detail: { incidentNo: rows[0].incident_no, kind },
  });

  return mapConsent(rows[0], { revealSensitive: false });
}

async function loadArcConsent(id) {
  const { rows } = await pool.query(`select * from public.arc_consents where id = $1`, [id]);

  if (!rows[0]) {
    throw new HttpError(404, "HJ404", "동의서를 찾을 수 없어요.");
  }

  return rows[0];
}

/** 종이 서식에 서명을 받은 뒤 직원이 '동의 확인'을 눌렀을 때 호출합니다. */
export async function confirmArcConsent(id, employee = null) {
  const before = await loadArcConsent(id);

  if (before.status === "WITHDRAWN") {
    throw badRequest("철회된 동의서는 다시 확인할 수 없어요. 새로 등록해 주세요.");
  }

  const { rows } = await pool.query(
    `update public.arc_consents
        set status = 'ACTIVE',
            confirmed_by = $2,
            confirmed_by_name = $3,
            confirmed_at = now(),
            updated_at = now()
      where id = $1
      returning *`,
    [id, employee?.id ?? null, employee?.name ?? ""]
  );

  await writeAuditLog({
    employee,
    action: "arc.consent.confirm",
    targetType: "arc_consent",
    targetId: id,
    detail: { incidentNo: rows[0].incident_no },
  });

  return mapConsent(rows[0], { revealSensitive: false });
}

export async function withdrawArcConsent(id, employee = null, reason = "") {
  const { rows } = await pool.query(
    `update public.arc_consents
        set status = 'WITHDRAWN',
            withdrawn_at = now(),
            withdrawn_reason = $2,
            updated_at = now()
      where id = $1 and status <> 'WITHDRAWN'
      returning *`,
    [id, String(reason ?? "").slice(0, 300)]
  );

  if (!rows[0]) {
    throw badRequest("이미 철회되었거나 찾을 수 없는 동의서예요.");
  }

  await writeAuditLog({
    employee,
    action: "arc.consent.withdraw",
    targetType: "arc_consent",
    targetId: id,
    detail: { incidentNo: rows[0].incident_no, reason: rows[0].withdrawn_reason },
  });

  return mapConsent(rows[0], { revealSensitive: false });
}

/** 유효한 동의(활성 + 보존기간 미경과)가 있는지. P14C 상세기록 저장 게이트입니다. */
export async function hasValidArcConsent(incidentNo = "") {
  const key = String(incidentNo ?? "").trim();

  if (!key) {
    return false;
  }

  const { rows } = await pool.query(
    `select 1
       from public.arc_consents
      where incident_no = $1
        and status = 'ACTIVE'
        and (retention_until is null or retention_until >= current_date)
      limit 1`,
    [key]
  );

  return rows.length > 0;
}

// ── 민감정보 접근 승인 / 열람 로그 ───────────────────────────────────

function mapAccess(row) {
  return {
    id: row.id,
    incidentNo: row.incident_no,
    purpose: row.purpose,
    status: row.status,
    requestedById: row.requested_by,
    requestedByName: row.requested_by_name,
    requestedAt: row.requested_at,
    decidedByName: row.decided_by_name,
    decidedAt: row.decided_at,
    decisionReason: row.decision_reason,
    expiresAt: row.expires_at,
  };
}

export async function listArcSensitiveAccess({
  incidentNo = null,
  employeeId = null,
  status = null,
  limit = 100,
} = {}) {
  const { rows } = await pool.query(
    `select *
       from public.arc_sensitive_access
      where ($1::text is null or incident_no = $1)
        and ($2::text is null or requested_by = $2)
        and ($3::text is null or status = $3)
      order by requested_at desc
      limit $4`,
    [
      incidentNo || null,
      employeeId || null,
      status || null,
      clampInt(limit, 1, 300, 100),
    ]
  );

  return rows.map(mapAccess);
}

/** 승인 대기 목록(사건 번호 기준). 승인자는 arc.approve 권한이 있어야 합니다. */
export async function pendingArcSensitiveAccessCount() {
  const { rows } = await pool.query(
    `select count(*)::int as count
       from public.arc_sensitive_access
      where status = 'PENDING'`
  );

  return rows[0]?.count ?? 0;
}

export async function requestArcSensitiveAccess({ incidentNo = "", purpose = "" } = {}, employee = null) {
  const incident = requireText(incidentNo, "사건 번호", 60);
  const reason = requireText(purpose, "열람 사유", 300);

  // 이미 유효한 승인이 있으면 재사용합니다(같은 사건을 반복 승인받지 않도록).
  const { rows: existing } = await pool.query(
    `select *
       from public.arc_sensitive_access
      where incident_no = $1
        and requested_by = $2
        and status = 'APPROVED'
        and expires_at > now()
      order by expires_at desc
      limit 1`,
    [incident, employee?.id ?? null]
  );

  if (existing[0]) {
    return mapAccess(existing[0]);
  }

  const { rows } = await pool.query(
    `insert into public.arc_sensitive_access
       (id, incident_no, purpose, requested_by, requested_by_name)
     values ($1, $2, $3, $4, $5)
     returning *`,
    [randomUUID(), incident, reason, employee?.id ?? null, employee?.name ?? ""]
  );

  await writeAuditLog({
    employee,
    action: "arc.access.request",
    targetType: "arc_sensitive_access",
    targetId: rows[0].id,
    detail: { incidentNo: incident, purpose: reason },
  });

  await createArcNotification({
    kind: "INCIDENT",
    level: "WARN",
    title: "민감정보 열람 승인 요청",
    body: `${employee?.name || "직원"}님이 ${incident} 상세기록 열람을 요청했어요.\n사유: ${reason}`,
    link: "/admin/arc/access",
    incidentNo: incident,
    dedupeKey: `arc-access-request:${rows[0].id}`,
    createdBy: employee?.id ?? null,
  });

  return mapAccess(rows[0]);
}

/**
 * 승인/거부.
 * 자기 요청은 원칙적으로 자기가 승인할 수 없습니다(사장 계정만 예외 — 사장이 유일한 승인자일 때 막히지 않도록).
 */
export async function decideArcSensitiveAccess(
  id,
  { approve = false, reason = "" } = {},
  employee = null
) {
  const { rows: found } = await pool.query(
    `select * from public.arc_sensitive_access where id = $1`,
    [id]
  );
  const row = found[0];

  if (!row) {
    throw new HttpError(404, "HJ404", "열람 요청을 찾을 수 없어요.");
  }

  if (row.status !== "PENDING") {
    throw badRequest("이미 처리된 요청이에요.");
  }

  if (row.requested_by && row.requested_by === employee?.id && employee?.role !== "OWNER") {
    throw badRequest("본인이 요청한 열람은 본인이 승인할 수 없어요.");
  }

  const settings = await getArcSettings();
  const decision = String(reason ?? "").slice(0, 300);

  const { rows } = await pool.query(
    `update public.arc_sensitive_access
        set status = $2,
            decided_by = $3,
            decided_by_name = $4,
            decided_at = now(),
            decision_reason = $5,
            expires_at = case when $2 = 'APPROVED'
                              then now() + ($6::int || ' minutes')::interval
                              else null end
      where id = $1
      returning *`,
    [
      id,
      approve ? "APPROVED" : "DENIED",
      employee?.id ?? null,
      employee?.name ?? "",
      decision,
      settings.accessTtlMinutes,
    ]
  );

  await writeAuditLog({
    employee,
    action: approve ? "arc.access.approve" : "arc.access.deny",
    targetType: "arc_sensitive_access",
    targetId: id,
    detail: { incidentNo: row.incident_no, ttlMinutes: settings.accessTtlMinutes },
  });

  await createArcNotification({
    kind: "INCIDENT",
    level: approve ? "INFO" : "WARN",
    title: approve ? "민감정보 열람 승인됨" : "민감정보 열람 거부됨",
    body: `${row.incident_no} 상세기록 열람 요청이 ${approve ? "승인" : "거부"}되었어요.${
      decision ? `\n사유: ${decision}` : ""
    }`,
    link: "/admin/arc/access",
    incidentNo: row.incident_no,
    dedupeKey: `arc-access-decision:${id}`,
    createdBy: employee?.id ?? null,
  });

  return mapAccess(rows[0]);
}

/**
 * 유효한 승인인지 확인하고 열람 로그를 1행 남깁니다.
 * P14C 이후 상세기록 조회/저장 경로가 모두 이 함수를 통과해야 합니다.
 */
export async function assertArcSensitiveAccess({
  accessId = null,
  incidentNo = "",
  employee = null,
  action = "VIEW",
  ip = "",
} = {}) {
  const incident = String(incidentNo ?? "").trim();
  const { rows } = await pool.query(
    `select *
       from public.arc_sensitive_access
      where ($1::uuid is not null and id = $1::uuid)
         or ($1::uuid is null and incident_no = $2 and requested_by = $3
             and status = 'APPROVED' and expires_at > now())
      order by expires_at desc nulls last
      limit 1`,
    [accessId || null, incident, employee?.id ?? null]
  );
  const row = rows[0];

  if (!row || row.status !== "APPROVED" || !row.expires_at || new Date(row.expires_at) <= new Date()) {
    throw new HttpError(
      403,
      "HJ403",
      "상세 건강기록을 열람하려면 사건별 접근 승인이 필요해요. 열람 사유를 적어 승인을 요청해 주세요."
    );
  }

  if (row.requested_by && row.requested_by !== employee?.id) {
    throw new HttpError(403, "HJ403", "다른 직원의 열람 승인으로는 기록을 볼 수 없어요.");
  }

  await logArcSensitiveRead({
    accessId: row.id,
    incidentNo: row.incident_no,
    employee,
    action,
    ip,
  });

  return mapAccess(row);
}

export async function logArcSensitiveRead({
  accessId = null,
  incidentNo = "",
  employee = null,
  action = "VIEW",
  ip = "",
} = {}) {
  await pool.query(
    `insert into public.arc_sensitive_reads
       (id, access_id, incident_no, employee_id, employee_name, action, ip)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      randomUUID(),
      accessId || null,
      String(incidentNo ?? "").slice(0, 60),
      employee?.id ?? null,
      employee?.name ?? "",
      String(action ?? "VIEW").slice(0, 20),
      String(ip ?? "").slice(0, 100),
    ]
  );
}

export async function listArcSensitiveReads({ incidentNo = null, limit = 200 } = {}) {
  const { rows } = await pool.query(
    `select id, access_id, incident_no, employee_name, action, ip, created_at
       from public.arc_sensitive_reads
      where ($1::text is null or incident_no = $1)
      order by created_at desc
      limit $2`,
    [incidentNo || null, clampInt(limit, 1, 500, 200)]
  );

  return rows.map((row) => ({
    id: row.id,
    accessId: row.access_id,
    incidentNo: row.incident_no,
    employeeName: row.employee_name,
    action: row.action,
    ip: row.ip,
    createdAt: row.created_at,
  }));
}

// ── 대시보드 요약(P14A 범위) ─────────────────────────────────────────

export async function arcDashboardSummary(employeeId = null) {
  const [notifications, settings] = await Promise.all([
    countUnreadArcNotifications(employeeId),
    getArcSettings(),
  ]);

  const { rows } = await pool.query(
    `select
       (select count(*)::int from public.arc_consents where status = 'ACTIVE') as active_consents,
       (select count(*)::int from public.arc_sensitive_access where status = 'PENDING') as pending_access,
       (select count(*)::int from public.arc_sensitive_reads where created_at > now() - interval '30 days')
         as reads_30d`
  );

  return {
    unreadNotifications: notifications,
    activeConsents: rows[0]?.active_consents ?? 0,
    pendingAccess: rows[0]?.pending_access ?? 0,
    readsLast30Days: rows[0]?.reads_30d ?? 0,
    fieldKeyConfigured: hasArcKey(config.arc.fieldKey),
    alertChannelConfigured: Boolean(settings.alertChannelId),
  };
}
