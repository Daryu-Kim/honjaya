// P14I — 응급안전관리센터 품질관리(사후검토·개선) 도메인 로직.
//
// AS-REC-001 「관리기록서식집」의 네 서식을 그대로 옮겼습니다.
//   F11 응급사건 사후검토회의록 / F12 Near Miss(근접오류)
//   F13 CAPA(시정·예방조치)      / F14 재고·AS-CARE 연계 이상 협의록
//
// 서식 문구·항목의 원본은 이 파일의 ARC_QUALITY_FORMS 입니다.
// 화면(src/views/Admin/AdminArcQualityView.vue)은 이 정의를 서버에서 받아
// 그대로 그리므로, 항목을 고칠 때는 이 파일만 고치면 됩니다.
//
// 원칙(AS-REC-001 01):
//   * 사실 / 의견 / 합의를 나눠 적습니다.
//   * 결정사항은 담당자·기한·완료 확인 방법까지 남깁니다.
//   * 상세 건강정보는 여기에 적지 않습니다. (AS-CARE 전용)
import { randomUUID } from "node:crypto";

import { pool } from "./db.js";
import { badRequest } from "./http/errors.js";

const MAX_TITLE = 160;
const MAX_LINE = 200;
const MAX_TEXT = 2000;
const MAX_ACTIONS = 30;
const MAX_LIMIT = 200;

export const ARC_QUALITY_KINDS = ["REVIEW", "NEAR_MISS", "CAPA", "STOCK_ISSUE"];

export const ARC_QUALITY_STATUSES = ["OPEN", "IN_PROGRESS", "VERIFIED", "CLOSED"];

export const ARC_QUALITY_VERDICTS = ["", "EFFECTIVE", "PARTIAL", "MORE"];

function text(value, max = MAX_LINE) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function longText(value, max = MAX_TEXT) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
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

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
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

// ── 서식 정의 ────────────────────────────────────────────────────────────
// type: "text"(한 줄) / "textarea"(여러 줄) / "check"(복수 선택)
export const ARC_QUALITY_FORMS = [
  {
    kind: "REVIEW",
    code: "F11",
    title: "응급사건 사후검토회의록",
    shortTitle: "사후검토",
    purpose:
      "사건이 끝난 뒤 타임라인을 그대로 되짚어 잘 된 점·개선점·재발방지 대책을 남깁니다.",
    cadence: "사건 종료 후 7일 이내 · 응급·119 사건은 100% 작성",
    guide: [
      "사실과 의견을 나눠 적고, 추측은 [의견]으로 표시해 주세요.",
      "결정사항은 담당자·기한·완료 확인 방법까지 적어야 다음 달에 확인할 수 있어요.",
      "손님·직원의 상세 건강정보는 여기 적지 않습니다. AS-CARE에만 남깁니다.",
    ],
    fields: [
      {
        key: "case_summary",
        label: "사건 개요",
        type: "textarea",
        rows: 4,
        required: true,
        hint: "발생 일시·장소·대상 구분·주호소·최초 발견자까지 한 문단으로 적어 주세요.",
      },
      {
        key: "timeline",
        label: "시각별 진행",
        type: "textarea",
        rows: 4,
        hint: "예) 21:10 발견 → 21:11 119 신고 → 21:19 구급대 도착 → 21:26 인계.",
      },
      {
        key: "did_well",
        label: "잘 된 점",
        type: "textarea",
        rows: 3,
        hint: "역할분담·119 신고 시점·장부 기록처럼 지켜진 것을 먼저 적습니다.",
      },
      {
        key: "improve",
        label: "개선이 필요한 점",
        type: "textarea",
        rows: 3,
      },
      {
        key: "handoff",
        label: "119·의료기관 인계 적절성",
        type: "textarea",
        rows: 3,
        hint: "인계 8항목(발생시각·연령/성별·주호소·반응/호흡·외상·시행 처치·상태변화·복용약) 중 빠진 항목이 있었는지 확인합니다.",
      },
      {
        key: "recurrence",
        label: "재발 방지 대책",
        type: "textarea",
        rows: 3,
      },
      {
        key: "share",
        label: "공유·반영 범위",
        type: "check",
        options: [
          { key: "STAFF_SHARE", label: "직원 공유" },
          { key: "EDU", label: "교육 반영" },
          { key: "FACILITY", label: "시설·물품 개선" },
          { key: "DOC", label: "문서·서식 개정" },
          { key: "STOCK", label: "구급상자 보충" },
          { key: "NONE", label: "해당 없음" },
        ],
      },
      {
        key: "evidence",
        label: "관련 증빙·연계 ID",
        type: "textarea",
        rows: 2,
        hint: "점검표·구매(SUP)·사진(PHO)·유효기간(EXP)·교육(EDU)·사건(INC) 번호를 적어 두면 연간 증빙 패키지에 바로 붙습니다.",
      },
      {
        key: "privacy",
        label: "개인정보 처리 확인",
        type: "check",
        options: [
          { key: "DEIDENTIFIED", label: "비식별로 기록함" },
          { key: "CARE_ONLY", label: "상세 건강정보는 AS-CARE에만 있음" },
          { key: "APPROVED", label: "열람 승인 절차를 거침" },
        ],
      },
    ],
  },
  {
    kind: "NEAR_MISS",
    code: "F12",
    title: "Near Miss(근접오류) 기록",
    shortTitle: "Near Miss",
    purpose:
      "사고로 이어지지 않은 아슬아슬한 상황을 남겨, 같은 상황이 실제 사고가 되기 전에 막습니다.",
    cadence: "발생 즉시 · 징계가 아니라 개선을 위한 기록입니다",
    guide: [
      "누가 실수했는지를 쓰는 기록이 아니라, 어떤 조건이 사고를 막았는지를 봅니다.",
      "방어요인(왜 사고가 안 났는지)을 반드시 적어 주세요. 그게 우리의 강점입니다.",
      "직원이 자유롭게 올릴 수 있어야 하므로 비난하는 표현은 쓰지 않습니다.",
    ],
    fields: [
      {
        key: "situation",
        label: "어떤 상황이었나",
        type: "textarea",
        rows: 4,
        required: true,
        hint: "무슨 일이 일어날 뻔했는지 시간 순서대로 적어 주세요.",
      },
      {
        key: "why_not",
        label: "왜 사고로 이어지지 않았나 (방어요인)",
        type: "textarea",
        rows: 3,
        hint: "예) 직원이 장부를 확인해 개봉일을 발견함 / 손님이 스스로 멈춤 / 119를 먼저 불렀음.",
      },
      {
        key: "potential",
        label: "잠재 결과",
        type: "textarea",
        rows: 3,
        hint: "최악의 경우 어디까지 갈 수 있었는지 적습니다.",
      },
      {
        key: "factors",
        label: "기여요인",
        type: "check",
        options: [
          { key: "STOCK", label: "물품 부족·위치" },
          { key: "LABEL", label: "표시·라벨" },
          { key: "EDU", label: "교육·숙지 부족" },
          { key: "STAFFING", label: "인력·혼잡" },
          { key: "COMM", label: "의사소통" },
          { key: "PROCESS", label: "절차·문서" },
          { key: "ENV", label: "환경·시설" },
          { key: "OTHER", label: "기타" },
        ],
      },
      {
        key: "idea",
        label: "개선 아이디어",
        type: "textarea",
        rows: 3,
      },
      {
        key: "repeat",
        label: "이전 유사 사례",
        type: "text",
        hint: "있었다면 사건번호·서식 ID를 적어 주세요. 반복되면 CAPA(F13)로 올립니다.",
      },
      {
        key: "share",
        label: "공유·교육 필요",
        type: "check",
        options: [
          { key: "STAFF_SHARE", label: "직원 공유" },
          { key: "EDU", label: "교육 반영" },
          { key: "FACILITY", label: "시설 개선" },
          { key: "DOC", label: "문서 개정" },
        ],
      },
    ],
  },
  {
    kind: "CAPA",
    code: "F13",
    title: "CAPA(시정·예방조치) 기록",
    shortTitle: "CAPA",
    purpose:
      "같은 문제가 반복될 때 원인을 찾아 시정하고, 조치가 실제로 효과가 있었는지 검증합니다.",
    cadence: "문제 확인 즉시 · 효과 검증까지 닫아야 종결",
    guide: [
      "즉시 조치(증상)와 예방조치(원인)를 구분해서 적습니다.",
      "효과 확인 방법은 숫자로 확인할 수 있게 적어 주세요. (예: 다음 달 실사 재고 차이 0건)",
      "검증 결과는 총괄이 확인한 뒤 기록합니다.",
    ],
    fields: [
      {
        key: "problem",
        label: "문제·부적합 내용",
        type: "textarea",
        rows: 4,
        required: true,
        hint: "무엇이 기준과 달랐는지, 얼마나·몇 번 반복됐는지 적습니다.",
      },
      {
        key: "immediate",
        label: "즉시 시정조치",
        type: "textarea",
        rows: 3,
        hint: "그 자리에서 한 일(회수·교체·격리·재교육).",
      },
      {
        key: "root_cause",
        label: "원인 분석",
        type: "textarea",
        rows: 4,
        hint: "직접 원인 → 간접 원인 → 근본 원인(5 Why).",
      },
      {
        key: "preventive",
        label: "예방조치",
        type: "textarea",
        rows: 3,
        hint: "절차·교육·표시·보관 위치 등 구조적으로 바꾸는 내용.",
      },
      {
        key: "verify_method",
        label: "효과 확인 방법",
        type: "textarea",
        rows: 3,
        hint: "무엇을, 언제, 어떻게 확인할지. 예) 다음 달 실사에서 재고 차이 0건 확인.",
      },
      {
        key: "related",
        label: "관련 사건·서식 ID",
        type: "text",
        hint: "F11·F12·F14 기록번호나 사건번호(INC-…)를 적습니다.",
      },
    ],
  },
  {
    kind: "STOCK_ISSUE",
    code: "F14",
    title: "재고·AS-CARE 연계 이상 협의록",
    shortTitle: "재고이상",
    purpose:
      "재고 차이·분실·파손·오남용·기록 누락처럼 물품과 기록이 어긋난 일을 확인하고 정리합니다.",
    cadence: "실사·월 점검에서 발견 즉시 · 비용 변상은 대표 확인",
    guide: [
      "발견 → 확인 → 조치 → 재발방지 순서로 적습니다.",
      "비용·변상이 걸리면 금액과 정산 방식을 반드시 적습니다.",
      "AS-CARE·F25 누락이면 해당 기록번호를 함께 적어 주세요.",
    ],
    fields: [
      {
        key: "issue_types",
        label: "이상 유형",
        type: "check",
        required: true,
        options: [
          { key: "DIFF", label: "재고 차이" },
          { key: "LOSS", label: "분실" },
          { key: "BROKEN", label: "파손" },
          { key: "CONTAMINATION", label: "오염" },
          { key: "MISUSE", label: "오남용" },
          { key: "DELAY", label: "보충 지연" },
          { key: "EXP", label: "EXP·개봉 관리" },
          { key: "OTC", label: "개인 상비약 보관·EXP" },
          { key: "CARE_MISSING", label: "AS-CARE·F25 누락" },
          { key: "PROVIDED", label: "고객·타직원 제공·권유" },
          { key: "OTHER", label: "기타" },
        ],
      },
      {
        key: "found",
        label: "발견 내용",
        type: "textarea",
        rows: 4,
        required: true,
        hint: "언제·누가·어떻게 발견했는지 적습니다.",
      },
      {
        key: "verify",
        label: "사용·기록·설명서 확인",
        type: "textarea",
        rows: 3,
        hint: "사용대장·실사 기록·현품 설명서를 대조한 결과.",
      },
      {
        key: "cause",
        label: "원인·경위",
        type: "textarea",
        rows: 3,
      },
      {
        key: "immediate",
        label: "즉시 조치",
        type: "textarea",
        rows: 3,
        hint: "회수·사용중지·폐기 격리·보충·비용 변상.",
      },
      {
        key: "prevent",
        label: "재발 방지",
        type: "textarea",
        rows: 3,
      },
      {
        key: "cost",
        label: "비용·변상 처리",
        type: "text",
        hint: "금액과 정산 방식(실비정산 대장 연결).",
      },
      {
        key: "parties",
        label: "관리책임·협력사 대표·관련 직원",
        type: "text",
      },
    ],
  },
];

const FORM_BY_KIND = new Map(ARC_QUALITY_FORMS.map((form) => [form.kind, form]));

export function arcQualityForms() {
  return ARC_QUALITY_FORMS;
}

function formByKind(kind) {
  return FORM_BY_KIND.get(String(kind ?? "").toUpperCase()) ?? null;
}

// ── 값 정리 ──────────────────────────────────────────────────────────────

function sanitizeDetail(form, input) {
  const source = input && typeof input === "object" ? input : {};
  const detail = {};

  for (const field of form.fields) {
    const value = source[field.key];

    if (field.type === "check") {
      const allowed = new Set((field.options ?? []).map((option) => option.key));
      const picked = Array.isArray(value) ? value : [];

      detail[field.key] = picked
        .map((item) => String(item ?? "").trim().toUpperCase())
        .filter((item, index, list) => allowed.has(item) && list.indexOf(item) === index);
    } else if (field.type === "textarea") {
      detail[field.key] = longText(value);
    } else {
      detail[field.key] = text(value);
    }
  }

  return detail;
}

function mergeDetail(form, current, input) {
  const base = current && typeof current === "object" ? current : {};
  const merged = {};

  for (const field of form.fields) {
    merged[field.key] = base[field.key] ?? (field.type === "check" ? [] : "");
  }

  return sanitizeDetail(form, { ...merged, ...(input && typeof input === "object" ? input : {}) });
}

function isFilled(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return Boolean(String(value ?? "").trim());
}

/** 서식이 얼마나 채워졌는지 (0~100). 화면의 진행 막대에 씁니다. */
function completenessOf(form, detail) {
  const filled = form.fields.filter((field) => isFilled(detail?.[field.key])).length;

  return form.fields.length ? Math.round((filled / form.fields.length) * 100) : 0;
}

function missingRequired(form, detail) {
  return form.fields
    .filter((field) => field.required && !isFilled(detail?.[field.key]))
    .map((field) => field.label);
}

function sanitizeActions(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .slice(0, MAX_ACTIONS)
    .map((row, index) => {
      const dueOn = text(row?.dueOn, 10);
      const doneOn = text(row?.doneOn ?? (row?.done ? kstDateString() : ""), 10);

      return {
        id: text(row?.id, 64) || "",
        seq: index + 1,
        action: longText(row?.action, 400),
        owner: text(row?.owner),
        dueOn: /^\d{4}-\d{2}-\d{2}$/.test(dueOn) ? dueOn : "",
        doneOn: /^\d{4}-\d{2}-\d{2}$/.test(doneOn) ? doneOn : "",
        doneNote: longText(row?.doneNote, 400),
      };
    })
    .filter((row) => row.action || row.owner);
}

async function nextRecordNo(client, code, heldOn) {
  const prefix = `${code}-${heldOn.replace(/-/g, "")}-`;
  const { rows } = await client.query(
    `select record_no
       from public.arc_quality_records
      where record_no like $1
      order by record_no desc
      limit 1`,
    [`${prefix}%`]
  );
  const last = rows[0]?.record_no ?? "";
  const seq = Number.parseInt(last.slice(prefix.length), 10);

  return `${prefix}${String((Number.isFinite(seq) ? seq : 0) + 1).padStart(2, "0")}`;
}

async function resolveIncident(incidentId, incidentNo) {
  const id = text(incidentId, 64);
  const no = text(incidentNo, 64);

  if (!id && !no) {
    return null;
  }

  const { rows } = await pool.query(
    `select id, incident_no, occurred_at, kind, status, place, summary,
            closed_at, transferred_119
       from public.arc_incidents
      where ($1 <> '' and id = $1::uuid) or ($2 <> '' and incident_no = $2)
      limit 1`,
    [id, no]
  ).catch(() => ({ rows: [] }));

  return rows[0] ?? null;
}

// ── 조회 ──────────────────────────────────────────────────────────────────

function mapAction(row) {
  return {
    id: row.id,
    seq: row.seq,
    action: row.action,
    owner: row.owner,
    dueOn: row.due_on ? kstDateString(row.due_on) : "",
    doneOn: row.done_on ? kstDateString(row.done_on) : "",
    doneNote: row.done_note ?? "",
    overdue: Boolean(row.due_on && !row.done_on && kstDateString(row.due_on) < kstDateString()),
  };
}

function actionStats(actions) {
  const total = actions.length;
  const done = actions.filter((action) => action.doneOn).length;
  const overdue = actions.filter((action) => action.overdue).length;

  return { total, done, overdue };
}

function mapRecord(row, actions = []) {
  const form = formByKind(row.kind);
  const detail = row.detail && typeof row.detail === "object" ? row.detail : {};

  return {
    id: row.id,
    recordNo: row.record_no,
    kind: row.kind,
    formCode: form?.code ?? "",
    formTitle: form?.title ?? "",
    kindLabel: form?.shortTitle ?? row.kind,
    title: row.title,
    heldOn: row.held_on ? kstDateString(row.held_on) : "",
    authorName: row.author_name ?? "",
    attendees: row.attendees ?? "",
    locationMethod: row.location_method ?? "",
    incidentId: row.incident_id,
    incidentNo: row.incident_no ?? "",
    relatedDocs: row.related_docs ?? "",
    detail,
    status: row.status,
    verdict: row.verdict ?? "",
    dueOn: row.due_on ? kstDateString(row.due_on) : "",
    verifiedOn: row.verified_on ? kstDateString(row.verified_on) : "",
    verifiedByName: row.verified_by_name ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completeness: form ? completenessOf(form, detail) : 0,
    missingRequired: form ? missingRequired(form, detail) : [],
    actions,
    actionStats: actionStats(actions),
  };
}

export async function listArcQuality(query = {}) {
  const kind = formByKind(query.kind)?.kind ?? "";
  const status = String(query.status ?? "").trim().toUpperCase();
  const incidentNo = text(query.incidentNo, 64);
  const search = text(query.q, 60);
  const limit = clampInt(query.limit, 1, MAX_LIMIT, 80);

  const conditions = [];
  const params = [];

  if (kind) {
    params.push(kind);
    conditions.push(`q.kind = $${params.length}`);
  }

  if (ARC_QUALITY_STATUSES.includes(status)) {
    params.push(status);
    conditions.push(`q.status = $${params.length}`);
  }

  if (incidentNo) {
    params.push(incidentNo);
    conditions.push(`q.incident_no = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(q.record_no ilike $${params.length} or q.title ilike $${params.length}
        or q.incident_no ilike $${params.length} or q.attendees ilike $${params.length}
        or q.related_docs ilike $${params.length} or q.detail::text ilike $${params.length})`
    );
  }

  params.push(limit);

  const { rows } = await pool.query(
    `select q.*,
            coalesce(act.total, 0) as action_total,
            coalesce(act.done, 0) as action_done,
            coalesce(act.overdue, 0) as action_overdue
       from public.arc_quality_records q
       left join (
         select record_id,
                count(*)::int as total,
                count(*) filter (where done_on is not null)::int as done,
                count(*) filter (where done_on is null and due_on < current_date)::int as overdue
           from public.arc_quality_actions
          group by record_id
       ) act on act.record_id = q.id
      ${conditions.length ? `where ${conditions.join(" and ")}` : ""}
      order by q.held_on desc, q.created_at desc
      limit $${params.length}`,
    params
  );

  // 목록에서는 본문 전체가 필요 없으므로 첫 항목만 미리보기로 실어 보냅니다.
  const records = rows.map((row) => {
    const form = formByKind(row.kind);
    const detail = row.detail && typeof row.detail === "object" ? row.detail : {};
    const previewField = form?.fields.find((field) => field.required) ?? form?.fields[0];

    return {
      ...mapRecord(row, []),
      preview: previewField ? String(detail[previewField.key] ?? "").slice(0, 160) : "",
      actionStats: {
        total: row.action_total ?? 0,
        done: row.action_done ?? 0,
        overdue: row.action_overdue ?? 0,
      },
    };
  });

  return { records, forms: ARC_QUALITY_FORMS };
}

export async function getArcQuality(id) {
  const recordId = text(id, 64);

  if (!recordId) {
    throw badRequest("품질관리 기록을 찾을 수 없어요.");
  }

  const { rows } = await pool.query(
    `select * from public.arc_quality_records where id = $1::uuid`,
    [recordId]
  ).catch(() => ({ rows: [] }));

  if (!rows[0]) {
    throw badRequest("품질관리 기록을 찾을 수 없어요.");
  }

  const [actions, incident] = await Promise.all([
    pool.query(
      `select * from public.arc_quality_actions where record_id = $1::uuid order by seq asc, created_at asc`,
      [recordId]
    ),
    rows[0].incident_no
      ? pool.query(
          `select id, incident_no, occurred_at, kind, status, place, summary, transferred_119, closed_at
             from public.arc_incidents where incident_no = $1 limit 1`,
          [rows[0].incident_no]
        )
      : Promise.resolve({ rows: [] }),
  ]);

  return {
    record: mapRecord(rows[0], actions.rows.map(mapAction)),
    incident: incident.rows[0]
      ? {
          id: incident.rows[0].id,
          incidentNo: incident.rows[0].incident_no,
          occurredAt: incident.rows[0].occurred_at,
          kind: incident.rows[0].kind,
          status: incident.rows[0].status,
          place: incident.rows[0].place ?? "",
          summary: incident.rows[0].summary ?? "",
          transferred119: Boolean(incident.rows[0].transferred_119),
          closedAt: incident.rows[0].closed_at,
        }
      : null,
  };
}

// ── 저장 ──────────────────────────────────────────────────────────────────

async function replaceActions(client, recordId, actions) {
  await client.query(`delete from public.arc_quality_actions where record_id = $1::uuid`, [
    recordId,
  ]);

  for (const action of actions) {
    await client.query(
      `insert into public.arc_quality_actions
         (id, record_id, seq, action, owner, due_on, done_on, done_note)
       values ($1, $2::uuid, $3, $4, $5, $6::date, $7::date, $8)`,
      [
        randomUUID(),
        recordId,
        action.seq,
        action.action,
        action.owner,
        action.dueOn || null,
        action.doneOn || null,
        action.doneNote,
      ]
    );
  }
}

export async function createArcQuality(input = {}, employee = null) {
  const form = formByKind(input.kind);

  if (!form) {
    throw badRequest("서식 종류를 선택해 주세요. (사후검토·Near Miss·CAPA·재고이상)");
  }

  const heldOn = kstDateString(parseKstDate(input.heldOn));
  const detail = sanitizeDetail(form, input.detail);
  const absent = missingRequired(form, detail);

  if (absent.length) {
    throw badRequest(`필수 항목을 적어 주세요: ${absent.join(", ")}`);
  }

  const incident = await resolveIncident(input.incidentId, input.incidentNo);
  const title = text(input.title, MAX_TITLE) || `${form.shortTitle} — ${heldOn}`;
  const dueOnRaw = text(input.dueOn, 10);
  const dueOn = /^\d{4}-\d{2}-\d{2}$/.test(dueOnRaw) ? dueOnRaw : "";

  return withTransaction(async (client) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const recordNo = await nextRecordNo(client, form.code, heldOn);

      try {
        const { rows } = await client.query(
          `insert into public.arc_quality_records
             (id, record_no, kind, title, held_on,
              author_id, author_name, attendees, location_method,
              incident_id, incident_no, related_docs, detail, status, due_on,
              created_by, created_by_name)
           values ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10::uuid, $11, $12, $13::jsonb, $14, $15::date, $16, $17)
           returning *`,
          [
            randomUUID(),
            recordNo,
            form.kind,
            title,
            heldOn,
            employee?.id ?? null,
            text(input.authorName, 60) || employee?.name || "",
            text(input.attendees, 300),
            text(input.locationMethod, 200),
            incident?.id ?? null,
            incident?.incident_no ?? text(input.incidentNo, 64),
            text(input.relatedDocs, 300),
            JSON.stringify(detail),
            "OPEN",
            dueOn || null,
            employee?.id ?? null,
            employee?.name ?? "",
          ]
        );

        await replaceActions(client, rows[0].id, sanitizeActions(input.actions));

        return rows[0].id;
      } catch (error) {
        if (uniqueViolation(error) && attempt < 4) {
          continue;
        }

        throw error;
      }
    }

    throw badRequest("품질관리 기록번호를 만들지 못했어요. 다시 시도해 주세요.");
  }).then((recordId) => getArcQuality(recordId));
}

export async function updateArcQuality(id, input = {}, employee = null) {
  const recordId = text(id, 64);

  if (!recordId) {
    throw badRequest("품질관리 기록을 찾을 수 없어요.");
  }

  const { rows: currentRows } = await pool.query(
    `select * from public.arc_quality_records where id = $1::uuid`,
    [recordId]
  ).catch(() => ({ rows: [] }));
  const current = currentRows[0];

  if (!current) {
    throw badRequest("품질관리 기록을 찾을 수 없어요.");
  }

  const form = formByKind(current.kind);
  const detail =
    input.detail === undefined
      ? current.detail && typeof current.detail === "object"
        ? current.detail
        : {}
      : mergeDetail(form, current.detail, input.detail);

  const absent = missingRequired(form, detail);

  if (absent.length) {
    throw badRequest(`필수 항목을 적어 주세요: ${absent.join(", ")}`);
  }

  const statusInput = String(input.status ?? "").trim().toUpperCase();
  const status = ARC_QUALITY_STATUSES.includes(statusInput) ? statusInput : current.status;
  const verdictInput = String(input.verdict ?? "").trim().toUpperCase();

  if (status !== current.status && status === "VERIFIED" && form.kind !== "CAPA") {
    throw badRequest("검증 완료는 CAPA 기록에서만 쓸 수 있어요.");
  }

  const verdict =
    form.kind === "CAPA" && ARC_QUALITY_VERDICTS.includes(verdictInput)
      ? verdictInput
      : form.kind === "CAPA"
        ? current.verdict
        : "";

  if (status === "VERIFIED" && form.kind === "CAPA" && !verdict) {
    throw badRequest("CAPA 검증 결과(효과 있음·부분 효과·추가조치 필요)를 선택해 주세요.");
  }

  const dueOnRaw = input.dueOn === undefined ? null : text(input.dueOn, 10);
  const dueOn =
    dueOnRaw === null
      ? current.due_on
      : /^\d{4}-\d{2}-\d{2}$/.test(dueOnRaw)
        ? dueOnRaw
        : null;

  const verified = status === "VERIFIED" || status === "CLOSED";
  const verifiedOn = verified ? kstDateString() : null;
  const verifiedByName = verified ? employee?.name ?? "" : "";

  const incident =
    input.incidentId || input.incidentNo
      ? await resolveIncident(input.incidentId, input.incidentNo)
      : null;

  return withTransaction(async (client) => {
    await client.query(
      `update public.arc_quality_records
          set title = $2,
              held_on = $3::date,
              author_name = $4,
              attendees = $5,
              location_method = $6,
              incident_id = $7::uuid,
              incident_no = $8,
              related_docs = $9,
              detail = $10::jsonb,
              status = $11,
              verdict = $12,
              due_on = $13::date,
              verified_on = $14::date,
              verified_by_name = $15,
              updated_at = now()
        where id = $1::uuid`,
      [
        recordId,
        input.title === undefined ? current.title : text(input.title, MAX_TITLE) || current.title,
        input.heldOn === undefined
          ? kstDateString(current.held_on)
          : kstDateString(parseKstDate(input.heldOn)),
        input.authorName === undefined
          ? current.author_name
          : text(input.authorName, 60) || current.author_name,
        input.attendees === undefined ? current.attendees : text(input.attendees, 300),
        input.locationMethod === undefined
          ? current.location_method
          : text(input.locationMethod, 200),
        incident ? incident.id : current.incident_id,
        incident ? incident.incident_no : current.incident_no,
        input.relatedDocs === undefined ? current.related_docs : text(input.relatedDocs, 300),
        JSON.stringify(detail),
        status,
        verdict,
        dueOn,
        verifiedOn,
        verifiedByName,
      ]
    );

    if (input.actions !== undefined) {
      await replaceActions(client, recordId, sanitizeActions(input.actions));
    }

    return recordId;
  }).then(() => getArcQuality(recordId));
}

export async function toggleArcQualityAction(recordId, actionId, input = {}) {
  const id = text(recordId, 64);
  const target = text(actionId, 64);

  if (!id || !target) {
    throw badRequest("조치 항목을 찾을 수 없어요.");
  }

  const done = input.done === undefined ? true : Boolean(input.done);
  const doneOn = done ? kstDateString(parseKstDate(input.doneOn)) : null;

  const { rowCount } = await pool.query(
    `update public.arc_quality_actions
        set done_on = $3::date,
            done_note = $4
      where id = $1::uuid and record_id = $2::uuid`,
    [target, id, doneOn, longText(input.doneNote, 400)]
  );

  if (!rowCount) {
    throw badRequest("조치 항목을 찾을 수 없어요.");
  }

  // 미완료 조치가 남아 있으면 진행 중으로 올립니다. (검증·종결은 건드리지 않습니다)
  const { rows } = await pool.query(
    `select count(*)::int as total,
            count(*) filter (where done_on is null)::int as open
       from public.arc_quality_actions where record_id = $1::uuid`,
    [id]
  );
  const stats = rows[0] ?? { total: 0, open: 0 };

  if ((stats.total ?? 0) > 0) {
    await pool.query(
      `update public.arc_quality_records
          set status = 'IN_PROGRESS', updated_at = now()
        where id = $1::uuid and status = 'OPEN'`,
      [id]
    );
  }

  return getArcQuality(id);
}

export async function deleteArcQualityAction(recordId, actionId) {
  const id = text(recordId, 64);
  const target = text(actionId, 64);

  if (!id || !target) {
    throw badRequest("조치 항목을 찾을 수 없어요.");
  }

  await pool.query(
    `delete from public.arc_quality_actions where id = $1::uuid and record_id = $2::uuid`,
    [target, id]
  );

  return getArcQuality(id);
}

// ── 요약(대시보드·KPI) ────────────────────────────────────────────────────

/** 사건이 끝났는데 사후검토(F11)가 없는 건 — 사후검토 100% 지표의 근거입니다. */
async function reviewPendingIncidents(limit = 5) {
  const { rows } = await pool.query(
    `select i.id, i.incident_no, i.occurred_at, i.closed_at, i.kind, i.place,
            greatest(0, (current_date - coalesce(i.closed_at, i.occurred_at)::date))::int
              as days_since
       from public.arc_incidents i
      where i.status = 'CLOSED'
        and not exists (
          select 1
            from public.arc_quality_records q
           where q.kind = 'REVIEW'
             and (q.incident_id = i.id
                  or (q.incident_no <> '' and q.incident_no = i.incident_no))
        )
      order by coalesce(i.closed_at, i.occurred_at) desc
      limit $1`,
    [clampInt(limit, 1, 20, 5)]
  );

  return rows.map((row) => ({
    incidentId: row.id,
    incidentNo: row.incident_no,
    occurredAt: row.occurred_at,
    closedAt: row.closed_at,
    kind: row.kind,
    place: row.place ?? "",
    daysSince: row.days_since ?? 0,
  }));
}

export async function arcQualitySummary(limit = 5) {
  const [counts, pending, dueActions, kpi] = await Promise.all([
    pool.query(
      `select
         (select count(*)::int from public.arc_quality_records
           where status in ('OPEN', 'IN_PROGRESS')) as open_records,
         (select count(*)::int from public.arc_quality_records
           where kind = 'CAPA' and status in ('OPEN', 'IN_PROGRESS')) as open_capa,
         (select count(*)::int from public.arc_quality_actions
           where done_on is null and due_on < current_date) as overdue_actions,
         (select count(*)::int from public.arc_quality_records
           where kind = 'NEAR_MISS' and held_on >= current_date - 30) as near_miss_30d,
         (select count(*)::int from public.arc_incidents i
           where i.status = 'CLOSED'
             and not exists (
               select 1 from public.arc_quality_records q
                where q.kind = 'REVIEW'
                  and (q.incident_id = i.id
                       or (q.incident_no <> '' and q.incident_no = i.incident_no)))) as review_pending`
    ),
    reviewPendingIncidents(limit),
    pool.query(
      `select a.id, a.action, a.owner, a.due_on, q.record_no, q.title
         from public.arc_quality_actions a
         join public.arc_quality_records q on q.id = a.record_id
        where a.done_on is null and a.due_on < current_date
        order by a.due_on asc
        limit $1`,
      [clampInt(limit, 1, 20, 5)]
    ),
    pool.query(
      `select
         (select count(*)::int from public.arc_stocktakes
           where counted_on >= current_date - interval '12 months') as stocktakes,
         (select count(*)::int from public.arc_training_sessions
           where status = 'DONE' and kind in ('REGULAR', 'OT', 'REFRESH')
             and scheduled_on >= current_date - interval '12 months') as trainings,
         (select count(*)::int from public.arc_training_sessions
           where status = 'DONE' and kind = 'DRILL'
             and scheduled_on >= current_date - interval '12 months') as drills,
         (select count(*)::int from public.arc_incidents
           where status = 'CLOSED'
             and coalesce(closed_at, occurred_at) >= current_date - interval '12 months')
           as incidents_closed,
         (select count(*)::int from public.arc_quality_records
           where kind = 'REVIEW' and held_on >= current_date - interval '12 months')
           as reviews`
    ),
  ]);

  const row = counts.rows[0] ?? {};
  const kpiRow = kpi.rows[0] ?? {};
  const closedIncidents = kpiRow.incidents_closed ?? 0;
  const reviews = kpiRow.reviews ?? 0;
  const reviewRate = closedIncidents
    ? Math.min(100, Math.round((reviews / closedIncidents) * 100))
    : 100;

  return {
    openRecords: row.open_records ?? 0,
    openCapa: row.open_capa ?? 0,
    overdueActions: row.overdue_actions ?? 0,
    nearMissLast30Days: row.near_miss_30d ?? 0,
    reviewPending: row.review_pending ?? 0,
    reviewPendingIncidents: pending,
    overdueActionList: dueActions.rows.map((item) => ({
      id: item.id,
      action: item.action,
      owner: item.owner,
      dueOn: item.due_on ? kstDateString(item.due_on) : "",
      recordNo: item.record_no,
      title: item.title,
    })),
    // AS-CAL-001 / AS-PRP-001 「연간 최소 성과기준」을 최근 12개월 기준으로 셉니다.
    kpi: {
      windowLabel: "최근 12개월",
      items: [
        {
          key: "stocktakes",
          label: "월간 실사·점검",
          value: kpiRow.stocktakes ?? 0,
          target: 12,
          unit: "회",
        },
        {
          key: "trainings",
          label: "정기교육·OT",
          value: kpiRow.trainings ?? 0,
          target: 4,
          unit: "회",
        },
        {
          key: "drills",
          label: "상황연습·모의훈련",
          value: kpiRow.drills ?? 0,
          target: 2,
          unit: "회",
        },
        {
          key: "reviewRate",
          label: "응급사건 사후검토",
          value: reviewRate,
          target: 100,
          unit: "%",
          detail: `종결 사건 ${closedIncidents}건 · 사후검토 ${reviews}건`,
        },
      ],
    },
  };
}
