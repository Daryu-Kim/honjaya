// P14 — ARC SAFETY 사건 접수(INC) · AS-CARE 상세기록(P14C) 도메인 로직.
//
// 규칙
//   * 사건 헤더(arc_incidents)는 비식별 운영정보만 담습니다. 요약에는 주민등록번호·전화번호·
//     이메일 같은 식별 정보를 넣을 수 없고, 서버가 6자리 이상 숫자와 @ 를 거부합니다.
//   * 식별 가능한 건강정보는 arc_care_* 의 *_enc 컬럼에만 암호화해 넣고 뺍니다.
//   * 상세기록 저장은 동의/법적근거 확인이 끝나야 열립니다(F25=직원, F27=비응급 고객,
//     응급·119 인계만 '해당없음'). 비식별(DEIDENTIFIED) 건은 상세기록을 저장하지 않습니다.
//   * 저장 직후 작성자에게 그 사건의 열람 승인을 자동 발급합니다. 승인 없이는 작성자도
//     다시 열 수 없고, 자기 요청 자기 승인이 막혀 기록이 잠기는 것을 피하기 위한 장치입니다.
//   * 조회는 라우트에서 arc.sensitive + 사건별 승인 + 열람로그를 통과한 뒤에만 복호화합니다.
import { randomUUID } from "node:crypto";

import { decryptField, encryptField } from "./arcCrypto.js";
import {
  createArcNotification,
  findActiveArcConsent,
  getArcSettings,
  logArcSensitiveRead,
} from "./arc.js";
import { writeAuditLog } from "./auth/audit.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { badRequest, HttpError } from "./http/errors.js";

export const ARC_INCIDENT_KINDS = ["GUEST", "STAFF_OTC", "EMERGENCY"];
export const ARC_RECORD_MODES = ["ON_SITE", "OFF_SITE"];
export const ARC_INCIDENT_STATUSES = ["OPEN", "CLOSED"];
export const ARC_LEGAL_BASES = [
  "CONSENT_F25",
  "CONSENT_F27",
  "OTHER_LEGAL",
  "NOT_APPLICABLE",
  "DEIDENTIFIED",
];

const KIND_LABELS = {
  GUEST: "비응급 고객",
  STAFF_OTC: "직원 상비약 자가복용",
  EMERGENCY: "응급·119 인계",
};

const MEASURED_AT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// ── 공통 ────────────────────────────────────────────────────────────────────

function text(value, max = 200) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function toInt(value, fallback) {
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

/** 한국시간 기준 YYYYMMDD. 컨테이너 시간대와 무관하게 사건번호가 매일 같은 규칙을 갖습니다. */
function kstStamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const target = Number.isNaN(date.getTime()) ? new Date() : date;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(target)
    .replace(/-/g, "");
}

/** datetime-local 값은 한국시간으로 해석합니다(서버가 UTC 여도 현장 시각 그대로 저장). */
function parseKstDateTime(value) {
  if (value instanceof Date) {
    return value;
  }

  const raw = text(value, 40);

  if (!raw) {
    return new Date();
  }

  let iso = raw;

  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      iso = `${raw}T00:00:00`;
    } else if (/T\d{2}:\d{2}$/.test(raw)) {
      iso = `${raw}:00`;
    }

    iso = `${iso}+09:00`;
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    throw badRequest("발생 일시를 올바르게 입력해 주세요.");
  }

  return date;
}

/** 사건 요약은 비식별이어야 합니다(상세는 암호화 기록에만). */
function safeSummary(value, label = "사건 요약", max = 500) {
  const body = text(value, max);

  if (/\d{6,}/.test(body)) {
    throw badRequest(
      `${label}에는 전화번호·주민등록번호 같은 숫자를 넣을 수 없어요. 그런 내용은 상세기록에만 입력해 주세요.`
    );
  }

  if (body.includes("@")) {
    throw badRequest(
      `${label}에는 이메일 주소를 넣을 수 없어요. 그런 내용은 상세기록에만 입력해 주세요.`
    );
  }

  return body;
}

/** 기록 근거(동의/법적근거) 검증. 저장 시점에 실제 동의 상태를 다시 확인합니다. */
function normalizeLegalBasis(value, fallback = "NOT_APPLICABLE") {
  return oneOf(value, ARC_LEGAL_BASES, fallback);
}

async function assertCareBasisAllowed({ incident, basis, note }) {
  if (basis === "DEIDENTIFIED") {
    throw badRequest(
      "비식별 전환 건은 상세 건강기록을 저장할 수 없어요. 사건 요약까지만 남겨 주세요."
    );
  }

  if (basis === "OTHER_LEGAL") {
    if (text(note, 500).length < 5) {
      throw badRequest("'그 외 적법근거'를 선택하면 사유를 5자 이상 적어 주세요.");
    }

    return null;
  }

  if (basis === "NOT_APPLICABLE") {
    if (incident.kind !== "EMERGENCY") {
      throw badRequest(
        "응급·119 인계 건이 아니면 동의(F25/F27)나 다른 적법근거가 필요해요. 동의서를 먼저 등록해 주세요."
      );
    }

    return null;
  }

  const consent = await findActiveArcConsent(incident.incidentNo);

  if (!consent) {
    const form = basis === "CONSENT_F25" ? "F25(직원 민감정보)" : "F27(비응급 고객)";

    throw badRequest(
      `${form} 동의서가 아직 '동의 확인' 상태가 아니에요. 동의서를 먼저 등록하고 서명본을 확인해 주세요.`
    );
  }

  if (basis === "CONSENT_F25" && incident.kind === "GUEST") {
    throw badRequest("F25 는 직원 민감정보 동의서예요. 비응급 고객은 F27 을 사용해 주세요.");
  }

  if (basis === "CONSENT_F27" && incident.kind === "STAFF_OTC") {
    throw badRequest("F27 은 비응급 고객 동의서예요. 직원 상비약은 F25 를 사용해 주세요.");
  }

  return consent;
}

// ── 사건 헤더 ───────────────────────────────────────────────────────────────

function mapIncident(row) {
  return {
    id: row.id,
    incidentNo: row.incident_no,
    occurredAt: row.occurred_at,
    kind: row.kind,
    recordMode: row.record_mode,
    status: row.status,
    subjectLabel: row.subject_label,
    place: row.place,
    summary: row.summary,
    legalBasis: row.legal_basis,
    legalBasisNote: row.legal_basis_note,
    transferred119: Boolean(row.transferred_119),
    reporterName: row.reporter_name,
    handlerName: row.handler_name,
    closedAt: row.closed_at,
    closedByName: row.closed_by_name,
    closeNote: row.close_note,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasCare: Boolean(row.has_care),
    pendingAccess: toInt(row.pending_access, 0),
  };
}

const INCIDENT_SELECT = `
  select i.*,
         (c.id is not null) as has_care,
         coalesce(a.pending, 0) as pending_access
    from public.arc_incidents i
    left join public.arc_care_records c on c.incident_id = i.id
    left join (
      select incident_no, count(*)::int as pending
        from public.arc_sensitive_access
       where status = 'PENDING'
       group by incident_no
    ) a on a.incident_no = i.incident_no`;

export async function listArcIncidents({
  kind = null,
  status = null,
  search = "",
  from = null,
  to = null,
  limit = 100,
} = {}) {
  const keyword = text(search, 60);
  const { rows } = await pool.query(
    `${INCIDENT_SELECT}
      where ($1::text is null or i.kind = $1)
        and ($2::text is null or i.status = $2)
        and ($3::date is null or i.occurred_at >= $3::date)
        and ($4::date is null or i.occurred_at < ($4::date + interval '1 day'))
        and ($5 = '' or i.incident_no ilike '%' || $5 || '%'
             or i.place ilike '%' || $5 || '%'
             or i.summary ilike '%' || $5 || '%'
             or i.subject_label ilike '%' || $5 || '%')
      order by i.occurred_at desc
      limit $6`,
    [
      kind || null,
      status || null,
      from || null,
      to || null,
      keyword,
      Math.min(Math.max(toInt(limit, 100), 1), 300),
    ]
  );

  return rows.map(mapIncident);
}

export async function getArcIncident(incidentId) {
  const id = String(incidentId ?? "").trim();

  if (!id) {
    throw badRequest("사건을 찾을 수 없어요.");
  }

  const { rows } = await pool.query(`${INCIDENT_SELECT} where i.id = $1::uuid`, [id]);

  if (!rows[0]) {
    throw new HttpError(404, "HJ404", "사건을 찾을 수 없어요.");
  }

  return mapIncident(rows[0]);
}

async function nextIncidentNo(client, occurredAt) {
  const prefix = `INC-${kstStamp(occurredAt)}-`;
  const { rows } = await client.query(
    `select incident_no
       from public.arc_incidents
      where incident_no like $1
      order by incident_no desc
      limit 1`,
    [`${prefix}%`]
  );
  const last = rows[0]?.incident_no ?? "";
  const seq = Number.parseInt(last.slice(prefix.length), 10);

  return `${prefix}${String((Number.isFinite(seq) ? seq : 0) + 1).padStart(2, "0")}`;
}

async function insertIncident(payload, employee) {
  return withTransaction(async (client) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const incidentNo = await nextIncidentNo(client, payload.occurredAt);

      try {
        const { rows } = await client.query(
          `insert into public.arc_incidents
             (id, incident_no, occurred_at, kind, record_mode, subject_label, place, summary,
              legal_basis, legal_basis_note, transferred_119,
              reporter_id, reporter_name, handler_id, handler_name,
              created_by, created_by_name)
           values ($1, $2, $3::timestamptz, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
           returning *`,
          [
            randomUUID(),
            incidentNo,
            payload.occurredAt.toISOString(),
            payload.kind,
            payload.recordMode,
            payload.subjectLabel,
            payload.place,
            payload.summary,
            payload.legalBasis,
            payload.legalBasisNote,
            payload.transferred119,
            employee?.id ?? null,
            employee?.name ?? "",
            employee?.id ?? null,
            payload.handlerName || employee?.name || "",
            employee?.id ?? null,
            employee?.name ?? "",
          ]
        );

        return rows[0];
      } catch (error) {
        // 같은 초에 두 사람이 접수한 경우 번호가 겹칩니다. 다시 번호를 뽑습니다.
        if (!uniqueViolation(error) || attempt === 4) {
          throw error;
        }
      }
    }

    throw badRequest("사건 번호를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
  });
}

export async function createArcIncident(input = {}, employee = null) {
  const kind = oneOf(input.kind, ARC_INCIDENT_KINDS, "GUEST");
  const recordMode = oneOf(input.recordMode, ARC_RECORD_MODES, "ON_SITE");
  const legalBasis = normalizeLegalBasis(input.legalBasis, kind === "EMERGENCY" ? "NOT_APPLICABLE" : "CONSENT_F27");
  const legalBasisNote = text(input.legalBasisNote, 500);

  if (legalBasis === "CONSENT_F25" && kind !== "STAFF_OTC") {
    throw badRequest("F25(직원 민감정보) 동의는 '직원 상비약 자가복용' 사건에서만 쓸 수 있어요.");
  }

  if (legalBasis === "CONSENT_F27" && kind === "STAFF_OTC") {
    throw badRequest("직원 상비약 사건은 F25 동의서를 사용해요.");
  }

  if (legalBasis === "NOT_APPLICABLE" && kind !== "EMERGENCY") {
    throw badRequest("응급·119 인계가 아니면 동의(F25/F27)나 다른 적법근거를 선택해 주세요.");
  }

  if (legalBasis === "OTHER_LEGAL" && legalBasisNote.length < 5) {
    throw badRequest("'그 외 적법근거'를 선택하면 사유를 5자 이상 적어 주세요.");
  }

  const row = await insertIncident(
    {
      occurredAt: parseKstDateTime(input.occurredAt),
      kind,
      recordMode,
      subjectLabel: text(input.subjectLabel, 60),
      place: requireText(input.place, "발생 위치", 80),
      summary: safeSummary(input.summary),
      legalBasis,
      legalBasisNote,
      transferred119: flag(input.transferred119),
      handlerName: text(input.handlerName, 60),
    },
    employee
  );

  await writeAuditLog({
    employee,
    action: "arc.incident.create",
    targetType: "arc_incident",
    targetId: row.id,
    detail: { incidentNo: row.incident_no, kind: row.kind, transferred119: row.transferred_119 },
  });

  await createArcNotification({
    kind: "INCIDENT",
    level: kind === "EMERGENCY" ? "CRITICAL" : "WARN",
    title: `${KIND_LABELS[kind]} 사건이 접수되었어요`,
    body: [
      `사건번호: ${row.incident_no}`,
      `발생 위치: ${row.place}`,
      `접수: ${employee?.name || row.created_by_name || "직원"}`,
      "상세 내용은 응급안전관리센터에서 확인해 주세요.",
    ].join("\n"),
    link: "/admin/arc/incidents",
    incidentNo: row.incident_no,
    dedupeKey: `arc-incident:${row.id}`,
    createdBy: employee?.id ?? null,
  });

  return mapIncident({ ...row, has_care: false });
}

export async function updateArcIncident(incidentId, patch = {}, employee = null) {
  const current = await getArcIncident(incidentId);
  const status = oneOf(patch.status, ARC_INCIDENT_STATUSES, current.status);
  const closing = status === "CLOSED" && current.status !== "CLOSED";
  const reopening = status === "OPEN" && current.status === "CLOSED";
  const legalBasis = normalizeLegalBasis(patch.legalBasis, current.legalBasis);
  const legalBasisNote =
    patch.legalBasisNote === undefined ? current.legalBasisNote : text(patch.legalBasisNote, 500);

  if (legalBasis === "OTHER_LEGAL" && legalBasisNote.length < 5) {
    throw badRequest("'그 외 적법근거'를 선택하면 사유를 5자 이상 적어 주세요.");
  }

  const { rows } = await pool.query(
    `update public.arc_incidents
        set occurred_at = $2::timestamptz,
            subject_label = $3,
            place = $4,
            summary = $5,
            legal_basis = $6,
            legal_basis_note = $7,
            transferred_119 = $8,
            handler_name = $9,
            status = $10,
            closed_at = case when $10 = 'CLOSED' then coalesce(closed_at, now()) else null end,
            closed_by_name = case when $10 = 'CLOSED' then coalesce(nullif(closed_by_name, ''), $11) else '' end,
            close_note = case when $10 = 'CLOSED' then $12 else '' end,
            updated_at = now()
      where id = $1
      returning *`,
    [
      current.id,
      parseKstDateTime(patch.occurredAt ?? current.occurredAt).toISOString(),
      patch.subjectLabel === undefined ? current.subjectLabel : text(patch.subjectLabel, 60),
      requireText(patch.place ?? current.place, "발생 위치", 80),
      patch.summary === undefined ? current.summary : safeSummary(patch.summary),
      legalBasis,
      legalBasisNote,
      patch.transferred119 === undefined ? current.transferred119 : flag(patch.transferred119),
      patch.handlerName === undefined ? current.handlerName : text(patch.handlerName, 60),
      status,
      employee?.name ?? "",
      text(patch.closeNote, 500),
    ]
  );

  const careCheck = await pool.query(
    `select 1 from public.arc_care_records where incident_id = $1`,
    [current.id]
  );

  await writeAuditLog({
    employee,
    action: closing ? "arc.incident.close" : "arc.incident.update",
    targetType: "arc_incident",
    targetId: current.id,
    detail: {
      incidentNo: current.incidentNo,
      status,
      transferred119: rows[0].transferred_119,
      legalBasis,
    },
  });

  if (closing || reopening) {
    await createArcNotification({
      kind: "INCIDENT",
      level: "INFO",
      title: closing ? "사건이 종결 처리되었어요" : "사건이 다시 진행 중으로 바뀌었어요",
      body: `${current.incidentNo} · ${KIND_LABELS[rows[0].kind]}\n처리: ${employee?.name || "직원"}`,
      link: "/admin/arc/incidents",
      incidentNo: current.incidentNo,
      dedupeKey: `arc-incident-status:${current.id}:${status}:${Date.now()}`,
      createdBy: employee?.id ?? null,
    });
  }

  return mapIncident({ ...rows[0], has_care: careCheck.rowCount > 0 });
}

// ── AS-CARE 상세기록(암호화) ────────────────────────────────────────────────

function enc(value, max = 2000) {
  return encryptField(config.arc.fieldKey, text(value, max));
}

function dec(envelope) {
  if (!envelope) {
    return "";
  }

  const plain = decryptField(config.arc.fieldKey, envelope);

  return plain === null ? null : plain;
}

function hasAnyDecryptFailure(map) {
  return Object.values(map).some((value) => value === null);
}

function mapTimeline(row) {
  const fields = {
    temp: dec(row.temp_enc),
    bp: dec(row.bp_enc),
    pulse: dec(row.pulse_enc),
    spo2: dec(row.spo2_enc),
    condition: dec(row.condition_enc),
  };

  return {
    id: row.id,
    source: row.source,
    measuredAt: row.measured_at,
    ...fields,
    decryptFailed: hasAnyDecryptFailure(fields),
  };
}

function mapMed(row) {
  const fields = {
    name: dec(row.name_enc),
    qty: dec(row.qty_enc),
    category: dec(row.category_enc),
    education: dec(row.education_enc),
    note: dec(row.note_enc),
  };

  return {
    id: row.id,
    itemId: row.item_id,
    ...fields,
    decryptFailed: hasAnyDecryptFailure(fields),
  };
}

function mapAddendum(row) {
  const body = dec(row.body_enc);

  return {
    id: row.id,
    body,
    authorName: row.author_name,
    createdAt: row.created_at,
    decryptFailed: body === null,
  };
}

function mapCare(row) {
  const fields = {
    subjectName: dec(row.subject_name_enc),
    subjectPhone: dec(row.subject_phone_enc),
    subjectBirth: dec(row.subject_birth_enc),
    subjectGender: dec(row.subject_gender_enc),
    subjectAge: dec(row.subject_age_enc),
    chiefComplaint: dec(row.chief_complaint_enc),
    summary: dec(row.summary_enc),
    history: dec(row.history_enc),
    treatment: dec(row.treatment_enc),
    disposition: dec(row.disposition_enc),
    followup: dec(row.followup_enc),
    reportSource: dec(row.report_source_enc),
    unconfirmed: dec(row.unconfirmed_enc),
  };

  return {
    id: row.id,
    incidentId: row.incident_id,
    incidentNo: row.incident_no,
    legalBasis: row.legal_basis,
    legalBasisNote: row.legal_basis_note,
    consentId: row.consent_id,
    recordedByName: row.recorded_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...fields,
    decryptFailed: hasAnyDecryptFailure(fields),
  };
}

/** 비식별 메타만. 상세기록이 있는지만 화면에 알려줍니다(복호화 없음). */
export async function getArcCareStatus(incidentId) {
  const incident = await getArcIncident(incidentId);
  const { rows } = await pool.query(
    `select c.id, c.legal_basis, c.recorded_by_name, c.updated_at,
            (select count(*)::int from public.arc_care_addenda a where a.care_id = c.id) as addenda
       from public.arc_care_records c
      where c.incident_id = $1`,
    [incident.id]
  );

  return {
    exists: Boolean(rows[0]),
    legalBasis: rows[0]?.legal_basis ?? null,
    recordedByName: rows[0]?.recorded_by_name ?? "",
    updatedAt: rows[0]?.updated_at ?? null,
    addendaCount: rows[0]?.addenda ?? 0,
    incident,
  };
}

/** 반드시 assertArcSensitiveAccess 를 통과한 뒤에 호출합니다. */
export async function getArcCareDetail(incidentId) {
  const incident = await getArcIncident(incidentId);
  const { rows } = await pool.query(
    `select * from public.arc_care_records where incident_id = $1`,
    [incident.id]
  );

  if (!rows[0]) {
    return { incident, care: null, timeline: [], meds: [], addenda: [] };
  }

  const careId = rows[0].id;
  const [timeline, meds, addenda] = await Promise.all([
    pool.query(
      `select * from public.arc_care_timeline where care_id = $1 order by sort_order, created_at`,
      [careId]
    ),
    pool.query(
      `select * from public.arc_care_meds where care_id = $1 order by sort_order, created_at`,
      [careId]
    ),
    pool.query(
      `select * from public.arc_care_addenda where care_id = $1 order by created_at`,
      [careId]
    ),
  ]);

  return {
    incident,
    care: mapCare(rows[0]),
    timeline: timeline.rows.map(mapTimeline),
    meds: meds.rows.map(mapMed),
    addenda: addenda.rows.map(mapAddendum),
  };
}

function normalizeTimeline(rows) {
  const list = Array.isArray(rows) ? rows.slice(0, 40) : [];

  return list
    .map((row, index) => ({
      source: oneOf(row?.source, ["DIRECT", "REPORT"], "DIRECT"),
      measuredAt: text(row?.measuredAt, 5),
      temp: text(row?.temp, 20),
      bp: text(row?.bp, 30),
      pulse: text(row?.pulse, 20),
      spo2: text(row?.spo2, 20),
      condition: text(row?.condition, 500),
      sortOrder: index,
    }))
    .filter((row) => row.measuredAt || row.temp || row.bp || row.pulse || row.spo2 || row.condition)
    .map((row) => {
      if (row.measuredAt && !MEASURED_AT_PATTERN.test(row.measuredAt)) {
        throw badRequest("측정 시각은 24시간제 HH:MM 형식으로 입력해 주세요.");
      }

      return row;
    });
}

function normalizeMeds(rows) {
  const list = Array.isArray(rows) ? rows.slice(0, 40) : [];

  return list
    .map((row, index) => ({
      itemId: text(row?.itemId, 40) || null,
      name: text(row?.name, 120),
      qty: text(row?.qty, 40),
      category: text(row?.category, 60),
      education: text(row?.education, 500),
      note: text(row?.note, 300),
      sortOrder: index,
    }))
    .filter((row) => row.name);
}

async function ensureWriterAccess(client, { incidentNo, employee, ttlMinutes }) {
  const { rows: existing } = await client.query(
    `select id, expires_at
       from public.arc_sensitive_access
      where incident_no = $1
        and requested_by = $2
        and status = 'APPROVED'
        and expires_at > now()
      order by expires_at desc
      limit 1`,
    [incidentNo, employee?.id ?? null]
  );

  if (existing[0]) {
    return existing[0];
  }

  const { rows } = await client.query(
    `insert into public.arc_sensitive_access
       (id, incident_no, purpose, status, requested_by, requested_by_name,
        decided_by, decided_by_name, decided_at, decision_reason, expires_at)
     values ($1, $2, $3, 'APPROVED', $4, $5, $4, $5, now(), $6,
             now() + ($7::int || ' minutes')::interval)
     returning id, expires_at`,
    [
      randomUUID(),
      incidentNo,
      "기록 작성자 자동 승인(작성·확인 목적)",
      employee?.id ?? null,
      employee?.name ?? "",
      "자동: 기록 작성자",
      ttlMinutes,
    ]
  );

  await writeAuditLog({
    employee,
    action: "arc.access.auto",
    targetType: "arc_sensitive_access",
    targetId: rows[0].id,
    detail: { incidentNo, reason: "기록 작성자 자동 승인" },
  });

  return rows[0];
}

export async function saveArcCare(incidentId, input = {}, employee = null, { ip = "" } = {}) {
  const incident = await getArcIncident(incidentId);
  const basis = normalizeLegalBasis(input.legalBasis, incident.legalBasis);
  const note = text(input.legalBasisNote, 500);
  const consent = await assertCareBasisAllowed({ incident, basis, note });
  const timeline = normalizeTimeline(input.timeline);
  const meds = normalizeMeds(input.meds);

  const values = {
    subjectName: enc(input.subjectName, 60),
    subjectPhone: enc(input.subjectPhone, 40),
    subjectBirth: enc(input.subjectBirth, 20),
    subjectGender: enc(input.subjectGender, 20),
    subjectAge: enc(input.subjectAge, 20),
    chiefComplaint: enc(input.chiefComplaint, 500),
    summary: enc(input.summary, 4000),
    history: enc(input.history, 4000),
    treatment: enc(input.treatment, 4000),
    disposition: enc(input.disposition, 2000),
    followup: enc(input.followup, 2000),
    reportSource: enc(input.reportSource, 500),
    unconfirmed: enc(input.unconfirmed, 1000),
  };

  const settings = await getArcSettings();

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `insert into public.arc_care_records
         (id, incident_id, incident_no,
          subject_name_enc, subject_phone_enc, subject_birth_enc, subject_gender_enc, subject_age_enc,
          chief_complaint_enc, summary_enc, history_enc,
          treatment_enc, disposition_enc, followup_enc, report_source_enc, unconfirmed_enc,
          legal_basis, legal_basis_note, consent_id, recorded_by, recorded_by_name)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
               $17, $18, $19, $20, $21)
       on conflict (incident_id) do update
          set subject_name_enc = excluded.subject_name_enc,
              subject_phone_enc = excluded.subject_phone_enc,
              subject_birth_enc = excluded.subject_birth_enc,
              subject_gender_enc = excluded.subject_gender_enc,
              subject_age_enc = excluded.subject_age_enc,
              chief_complaint_enc = excluded.chief_complaint_enc,
              summary_enc = excluded.summary_enc,
              history_enc = excluded.history_enc,
              treatment_enc = excluded.treatment_enc,
              disposition_enc = excluded.disposition_enc,
              followup_enc = excluded.followup_enc,
              report_source_enc = excluded.report_source_enc,
              unconfirmed_enc = excluded.unconfirmed_enc,
              legal_basis = excluded.legal_basis,
              legal_basis_note = excluded.legal_basis_note,
              consent_id = excluded.consent_id,
              recorded_by = excluded.recorded_by,
              recorded_by_name = excluded.recorded_by_name,
              updated_at = now()
       returning *`,
      [
        randomUUID(),
        incident.id,
        incident.incidentNo,
        values.subjectName,
        values.subjectPhone,
        values.subjectBirth,
        values.subjectGender,
        values.subjectAge,
        values.chiefComplaint,
        values.summary,
        values.history,
        values.treatment,
        values.disposition,
        values.followup,
        values.reportSource,
        values.unconfirmed,
        basis,
        note,
        consent?.id ?? null,
        employee?.id ?? null,
        employee?.name ?? "",
      ]
    );
    const care = rows[0];
    const isNew = new Date(care.created_at).getTime() === new Date(care.updated_at).getTime();

    await client.query(`delete from public.arc_care_timeline where care_id = $1`, [care.id]);

    for (const row of timeline) {
      await client.query(
        `insert into public.arc_care_timeline
           (id, care_id, source, measured_at, temp_enc, bp_enc, pulse_enc, spo2_enc, condition_enc, sort_order)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          randomUUID(),
          care.id,
          row.source,
          row.measuredAt,
          enc(row.temp, 20),
          enc(row.bp, 30),
          enc(row.pulse, 20),
          enc(row.spo2, 20),
          enc(row.condition, 500),
          row.sortOrder,
        ]
      );
    }

    await client.query(`delete from public.arc_care_meds where care_id = $1`, [care.id]);

    for (const row of meds) {
      await client.query(
        `insert into public.arc_care_meds
           (id, care_id, item_id, name_enc, qty_enc, category_enc, education_enc, note_enc, sort_order)
         values ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9)`,
        [
          randomUUID(),
          care.id,
          row.itemId,
          enc(row.name, 120),
          enc(row.qty, 40),
          enc(row.category, 60),
          enc(row.education, 500),
          enc(row.note, 300),
          row.sortOrder,
        ]
      );
    }

    const access = await ensureWriterAccess(client, {
      incidentNo: incident.incidentNo,
      employee,
      ttlMinutes: settings.accessTtlMinutes,
    });

    return { care, access, isNew };
  });

  await logArcSensitiveRead({
    accessId: result.access.id,
    incidentNo: incident.incidentNo,
    employee,
    action: result.isNew ? "CREATE" : "UPDATE",
    ip,
  });

  await writeAuditLog({
    employee,
    action: result.isNew ? "arc.care.create" : "arc.care.update",
    targetType: "arc_care_record",
    targetId: result.care.id,
    detail: {
      incidentNo: incident.incidentNo,
      legalBasis: basis,
      timelineRows: timeline.length,
      medRows: meds.length,
    },
    ip,
  });

  if (result.isNew) {
    await createArcNotification({
      kind: "INCIDENT",
      level: incident.kind === "EMERGENCY" ? "CRITICAL" : "INFO",
      title: "상세 응급기록이 작성되었어요",
      body: [
        `사건번호: ${incident.incidentNo}`,
        `작성자: ${employee?.name || "직원"}`,
        "상세 내용은 열람 승인을 받은 직원만 볼 수 있어요.",
      ].join("\n"),
      link: `/admin/arc/incidents/${incident.id}`,
      incidentNo: incident.incidentNo,
      dedupeKey: `arc-care:${result.care.id}`,
      createdBy: employee?.id ?? null,
    });
  }

  return {
    ...(await getArcCareDetail(incident.id)),
    access: { id: result.access.id, expiresAt: result.access.expires_at },
  };
}

export async function addArcCareAddendum(incidentId, { body = "" } = {}, employee = null) {
  const incident = await getArcIncident(incidentId);
  const content = requireText(body, "추가 기록", 2000);

  const { rows: found } = await pool.query(
    `select id from public.arc_care_records where incident_id = $1`,
    [incident.id]
  );

  if (!found[0]) {
    throw badRequest("상세기록이 아직 없어요. 상세기록을 먼저 작성해 주세요.");
  }

  const { rows } = await pool.query(
    `insert into public.arc_care_addenda (id, care_id, incident_no, body_enc, author_id, author_name)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [
      randomUUID(),
      found[0].id,
      incident.incidentNo,
      enc(content, 2000),
      employee?.id ?? null,
      employee?.name ?? "",
    ]
  );

  await writeAuditLog({
    employee,
    action: "arc.care.addendum",
    targetType: "arc_care_record",
    targetId: found[0].id,
    detail: { incidentNo: incident.incidentNo, length: content.length },
  });

  return mapAddendum(rows[0]);
}

// ── 대시보드 요약 ───────────────────────────────────────────────────────────

export async function arcIncidentSummary() {
  const { rows } = await pool.query(
    `select
       count(*) filter (where status = 'OPEN')::int as open_count,
       count(*) filter (where occurred_at >= date_trunc('month', now()))::int as month_count,
       count(*) filter (where kind = 'EMERGENCY'
                          and occurred_at >= now() - interval '90 days')::int as emergency_90d,
       count(*) filter (where transferred_119
                          and occurred_at >= now() - interval '90 days')::int as transferred_90d,
       count(*)::int as total_count
     from public.arc_incidents`
  );
  const { rows: careRows } = await pool.query(
    `select count(*)::int as care_count from public.arc_care_records`
  );

  return {
    open: rows[0]?.open_count ?? 0,
    thisMonth: rows[0]?.month_count ?? 0,
    emergencyLast90Days: rows[0]?.emergency_90d ?? 0,
    transferredLast90Days: rows[0]?.transferred_90d ?? 0,
    total: rows[0]?.total_count ?? 0,
    withCare: careRows[0]?.care_count ?? 0,
  };
}