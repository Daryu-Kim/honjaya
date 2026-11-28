// P14O — 응급안전관리센터 요청 게시판.
//
// 사장·직원 누구나 ARC 화면에서 ARC 대표(RN)에게 글을 남깁니다.
//   * 상태: PENDING(대기중) → READ(읽음) → DONE(완료)
//   * 총괄이 글을 열면 서버가 자동으로 읽음 처리(읽었는지 바로 보임)
//   * 완료는 반드시 완료 사유(done_note)가 있어야 합니다.
//   * 직원은 자기 글과 총괄 답글만 볼 수 있습니다(다른 직원 글은 보이지 않음).

import { randomUUID } from "node:crypto";

import { pool } from "./db.js";
import { badRequest, HttpError } from "./http/errors.js";

const CATEGORY_KEYS = new Set([
  "QUESTION",
  "NEAR_MISS",
  "HAZARD",
  "COMPLAINT",
  "SUPPLY",
  "EDUCATION",
  "FACILITY",
  "HEALTH",
  "ETC",
]);
const STATUS_KEYS = new Set(["PENDING", "READ", "DONE"]);
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const ARC_REQUEST_CATEGORIES = [
  {
    key: "QUESTION",
    label: "질문",
    desc: "응급처치·절차·권한이 헷갈릴 때. 답을 기다리는 동안 급하면 119·ARC 대표에게 먼저 연락하세요.",
    guide: [
      "무엇이 헷갈렸는지 한 문장으로 적어 주세요.",
      "상황(언제·어디서·누구와)을 함께 적으면 정확한 답을 받을 수 있어요.",
    ],
  },
  {
    key: "NEAR_MISS",
    label: "근접사고(아차사고)",
    desc:
      "다칠 뻔했지만 실제로 다치지 않은 일. '별일 아니었다'고 넘기면 다음에 진짜 사고가 됩니다. " +
      "이 분류는 기본이 익명이고, 작성자 이름은 화면 어디에도 표시되지 않습니다.",
    anonymousByDefault: true,
    guide: [
      "언제·몇 시쯤, 어디서(바 앞·테이블 번호·화장실 앞 등) 일어났는지 적어 주세요.",
      "누가(손님·직원·본인) 어떤 상태였는지 적어 주세요. 이름은 적지 않아도 됩니다.",
      "무엇이 어떻게 진행됐고, 어디까지 갔는지(다칠 뻔한 지점) 적어 주세요.",
      "왜 다치지 않았는지(누가 잡았다·넘어지지 않았다 등)도 적으면 재발 방지에 큰 도움이 됩니다.",
      "같은 일이 다시 생기지 않게 하려면 무엇이 필요한지 한 줄 적어 주세요.",
      "혼내기 위한 기록이 아닙니다. 원인을 없애기 위한 기록입니다.",
    ],
  },
  {
    key: "HAZARD",
    label: "위험요인·위험사고",
    desc:
      "사고로 이어질 수 있는 환경·설비·동선 위험, 또는 실제로 다친 사고. " +
      "이 분류도 기본이 익명이며 작성자 이름은 표시되지 않습니다. " +
      "사람이 다친 사고는 글보다 119와 ARC 대표에게 먼저 알려 주세요.",
    anonymousByDefault: true,
    guide: [
      "위험한 것이 무엇인지(깨진 유리·젖은 바닥·노출된 전선·계단 조명 등) 적어 주세요.",
      "위치를 구체적으로(홀 3번 테이블 옆·화장실 입구 등) 적어 주세요.",
      "언제부터 그 상태였는지, 지금도 그대로인지 적어 주세요.",
      "실제로 다친 사람이 있으면 시간·상태·조치 내용을 적어 주세요(AS-CARE 기록과 별개로 남겨 주세요).",
      "지금 바로 막아 둔 조치(테이프·안내판·치움 등)를 적어 주세요.",
      "원인으로 보이는 것을 적어 주세요(파손·미끄럼·조명·배치 등).",
    ],
  },
  {
    key: "COMPLAINT",
    label: "불만·건의",
    desc: "업무·근무·소통에서 아쉬웠던 점. 익명으로 남겨도 처리 결과는 여기에 남습니다.",
    guide: [
      "무엇이 불편했는지 사실만 적어 주세요.",
      "원하는 개선 방향을 한 줄 적어 주면 처리 속도가 빨라집니다.",
    ],
  },
  {
    key: "SUPPLY",
    label: "응급물품·비품",
    desc: "구급상자·개인 상비약·소모품이 부족하거나 교체가 필요할 때.",
    guide: [
      "품목명과 남은 수량을 적어 주세요.",
      "유효기간이 지난 품목이면 함께 적어 주세요.",
    ],
  },
  {
    key: "EDUCATION",
    label: "교육·훈련 요청",
    desc: "배우고 싶은 주제, 다시 받고 싶은 교육, 상황연습 희망 장면.",
    guide: [
      "배우고 싶은 주제나 상황을 적어 주세요.",
      "혼자 연습하고 싶은지, 단체 연습이 좋은지도 적어 주세요.",
    ],
  },
  {
    key: "FACILITY",
    label: "안전시설·환경",
    desc: "미끄럼·조명·출입구·계단·구급대 진입 동선처럼 사고를 키울 수 있는 환경.",
    guide: [
      "위치와 문제를 적어 주세요.",
      "가능하면 사진을 남기고, 이 글에는 사진을 찍은 위치를 적어 주세요.",
    ],
  },
  {
    key: "HEALTH",
    label: "건강·컨디션",
    desc: "본인 건강 상태·컨디션 때문에 배려가 필요할 때. 상세 내용은 AS-CARE에만 남깁니다.",
    guide: [
      "필요한 배려(근무 조정·휴식 등)를 구체적으로 적어 주세요.",
      "진단명 같은 민감한 내용은 여기 대신 ARC 대표에게 직접 전해 주세요.",
    ],
  },
  {
    key: "ETC",
    label: "기타",
    desc: "위 항목에 넣기 어려운 이야기.",
    guide: ["위 분류에 맞는 것이 없을 때 사용해 주세요."],
  },
];

export const ARC_REQUEST_STATUSES = [
  { key: "PENDING", label: "대기중", desc: "아직 ARC 대표가 열어 보지 않았습니다." },
  { key: "READ", label: "읽음", desc: "ARC 대표가 확인했습니다. 처리 중입니다." },
  { key: "DONE", label: "완료", desc: "처리가 끝났고 완료 사유가 남아 있습니다." },
];

export const ARC_REQUEST_TIPS = [
  "급한 상황(사람이 다친 경우)은 글보다 119와 전화가 먼저입니다.",
  "한 글에는 한 가지만 쓰면 처리 속도가 빨라집니다.",
  "언제·어디서·어떤 상황이었는지 시간과 장소를 적어 주세요.",
  "근접사고·위험요인은 '익명'으로 남길 수 있고, 작성자 이름은 화면에 표시되지 않습니다.",
  "완료된 글에는 ARC 대표가 '왜 그렇게 처리했는지'를 남깁니다. 다시 열어 확인할 수 있습니다.",
];

export const ARC_REQUEST_ANONYMITY_NOTE =
  "익명으로 남기면 작성자 이름이 목록·상세 화면 어디에도 표시되지 않습니다. " +
  "ARC 대표 화면에도 '익명'으로만 보이며, 누가 썼는지로 불이익을 주지 않습니다. " +
  "다만 본인이 쓴 글은 '내가 남긴 요청'에서 계속 확인할 수 있습니다.";

export function arcRequestCatalog() {
  return {
    categories: ARC_REQUEST_CATEGORIES,
    statuses: ARC_REQUEST_STATUSES,
    tips: ARC_REQUEST_TIPS,
    anonymityNote: ARC_REQUEST_ANONYMITY_NOTE,
  };
}

function text(value, max = 200) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function isoDateTime(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function isoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapReply(row) {
  return {
    id: row.id,
    authorName: row.author_name,
    authorRole: row.author_role,
    isDirector: row.is_director,
    body: row.body,
    createdAt: isoDateTime(row.created_at),
  };
}

function mapRequest(row, replies = []) {
  const anonymous = Boolean(row.anonymous);

  return {
    id: row.id,
    requestNo: row.request_no,
    category: row.category,
    title: row.title,
    body: row.body,
    urgent: row.urgent,
    anonymous,
    status: row.status,
    // 익명 글은 작성자 정보를 아예 내려보내지 않습니다(총괄 화면 포함).
    authorEmployeeId: anonymous ? null : row.author_employee_id,
    authorName: anonymous ? "익명" : row.author_name,
    authorRole: anonymous ? "" : row.author_role,
    readAt: isoDateTime(row.read_at),
    readBy: row.read_by,
    doneAt: isoDateTime(row.done_at),
    doneBy: row.done_by,
    doneNote: row.done_note,
    createdAt: isoDateTime(row.created_at),
    updatedAt: isoDateTime(row.updated_at),
    replies,
    replyCount: replies.length,
    // 직원 화면에서 "총괄이 읽었는지" 한눈에 보이도록 파생값을 함께 내려 줍니다.
    seen: row.status !== "PENDING",
  };
}

async function loadReplies(requestIds = []) {
  if (requestIds.length === 0) return new Map();

  const { rows } = await pool.query(
    `select id, request_id, author_name, author_role, is_director, body, created_at
       from public.arc_request_replies
      where request_id = any($1::uuid[])
      order by created_at`,
    [requestIds]
  );

  const grouped = new Map();
  for (const row of rows) {
    const list = grouped.get(row.request_id) ?? [];
    list.push(mapReply(row));
    grouped.set(row.request_id, list);
  }

  return grouped;
}

export async function listArcRequests({
  isDirector = false,
  employeeId = "",
  status = "",
  category = "",
  period = "",
  limit = 80,
} = {}) {
  const safeStatus = STATUS_KEYS.has(text(status, 20).toUpperCase())
    ? text(status, 20).toUpperCase()
    : "";
  const safeCategory = CATEGORY_KEYS.has(text(category, 20).toUpperCase())
    ? text(category, 20).toUpperCase()
    : "";
  const safePeriod = PERIOD_PATTERN.test(text(period, 7)) ? text(period, 7) : "";
  const safeLimit = Math.min(Math.max(Number(limit) || 80, 1), 200);

  const { rows } = await pool.query(
    `select *
       from public.arc_requests
      where ($1::boolean or author_employee_id = $2)
        and ($3::text = '' or status = $3)
        and ($4::text = '' or category = $4)
        and ($5::text = '' or to_char(created_at, 'YYYY-MM') = $5)
      order by
        case when status = 'PENDING' then 0 when status = 'READ' then 1 else 2 end,
        urgent desc,
        created_at desc
      limit $6`,
    [Boolean(isDirector), text(employeeId, 60) || null, safeStatus, safeCategory, safePeriod, safeLimit]
  );

  const replies = await loadReplies(rows.map((row) => row.id));
  const requests = rows.map((row) => mapRequest(row, replies.get(row.id) ?? []));

  const statusCounts = requests.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    },
    { PENDING: 0, READ: 0, DONE: 0 }
  );

  return {
    requests,
    catalog: arcRequestCatalog(),
    summary: {
      total: requests.length,
      pending: statusCounts.PENDING,
      read: statusCounts.READ,
      done: statusCounts.DONE,
      urgent: requests.filter((item) => item.urgent && item.status !== "DONE").length,
      // 총괄 화면에서 "아직 안 읽은 글" 배지로 씁니다.
      unread: statusCounts.PENDING,
    },
  };
}

export async function getArcRequest(requestId, { isDirector = false, employeeId = "", employee = null } = {}) {
  const { rows } = await pool.query(`select * from public.arc_requests where id = $1`, [requestId]);

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "요청 글을 찾을 수 없어요.");
  }

  const row = rows[0];

  if (!isDirector && row.author_employee_id !== (text(employeeId, 60) || null)) {
    throw new HttpError(403, "HJ403", "본인이 쓴 글만 볼 수 있어요.");
  }

  // 총괄이 열어 보면 그 순간 '읽음'으로 바뀝니다(직원 화면에 즉시 반영).
  if (isDirector && row.status === "PENDING") {
    const { rows: updated } = await pool.query(
      `update public.arc_requests
          set status = 'READ', read_at = now(), read_by = $2, updated_at = now()
        where id = $1 and status = 'PENDING'
        returning *`,
      [requestId, text(employee?.name, 60)]
    );

    if (updated[0]) Object.assign(row, updated[0]);
  }

  const replies = await loadReplies([row.id]);

  return mapRequest(row, replies.get(row.id) ?? []);
}

async function nextRequestNo(now = new Date()) {
  const stamp = now.toISOString().slice(0, 10).replaceAll("-", "");
  const { rows } = await pool.query(
    `select count(*)::int as used
       from public.arc_requests
      where request_no like $1`,
    [`REQ-${stamp}-%`]
  );
  const used = Number(rows[0]?.used ?? 0);

  return `REQ-${stamp}-${String(used + 1).padStart(2, "0")}`;
}

export async function createArcRequest(input = {}, employee = null) {
  const category = text(input.category, 20).toUpperCase() || "QUESTION";

  if (!CATEGORY_KEYS.has(category)) {
    throw badRequest("요청 분류를 선택해 주세요.");
  }

  const title = text(input.title, 160);
  const body = text(input.body, 4000);

  if (!title) {
    throw badRequest("제목을 적어 주세요.");
  }

  if (!body) {
    throw badRequest("내용을 적어 주세요. 상황·시간·장소를 함께 적으면 도움이 됩니다.");
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const { rows } = await pool.query(
        `insert into public.arc_requests
           (id, request_no, category, title, body, urgent,
            author_employee_id, author_name, author_role, anonymous)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning *`,
        [
          randomUUID(),
          await nextRequestNo(),
          category,
          title,
          body,
          Boolean(input.urgent),
          text(employee?.id, 60) || null,
          text(employee?.name, 60) || text(employee?.loginId, 60),
          text(employee?.role, 20),
          Boolean(input.anonymous),
        ]
      );

      return mapRequest(rows[0], []);
    } catch (error) {
      if (error?.code === "23505") continue;
      throw error;
    }
  }

  throw badRequest("요청 번호를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
}

export async function replyToArcRequest(requestId, input = {}, employee = null, { isDirector = false } = {}) {
  const body = text(input.body, 4000);

  if (!body) {
    throw badRequest("답글 내용을 적어 주세요.");
  }

  // 권한·존재 확인(없으면 404/403).
  await getArcRequest(requestId, {
    isDirector,
    employeeId: employee?.id ?? "",
    employee,
  });

  await pool.query(
    `insert into public.arc_request_replies
       (request_id, author_employee_id, author_name, author_role, is_director, body)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      requestId,
      text(employee?.id, 60) || null,
      text(employee?.name, 60) || text(employee?.loginId, 60),
      text(employee?.role, 20),
      Boolean(isDirector),
      body,
    ]
  );

  // 총괄 답글이 달리면 자동으로 읽음 처리합니다.
  if (isDirector) {
    await pool.query(
      `update public.arc_requests
          set status = case when status = 'PENDING' then 'READ' else status end,
              read_at = coalesce(read_at, now()),
              read_by = case when read_by = '' then $2 else read_by end,
              updated_at = now()
        where id = $1`,
      [requestId, text(employee?.name, 60)]
    );
  }

  return getArcRequest(requestId, {
    isDirector: true,
    employeeId: employee?.id ?? "",
    employee,
  });
}

/** 완료 처리 — 완료 사유가 반드시 있어야 합니다. */
export async function completeArcRequest(requestId, input = {}, employee = null) {
  const doneNote = text(input.doneNote, 2000);

  if (doneNote.length < 5) {
    throw badRequest(
      "완료하려면 어떤 이유로 완료했는지(어떻게 처리했는지)를 5자 이상 적어 주세요."
    );
  }

  const { rows } = await pool.query(
    `update public.arc_requests
        set status = 'DONE',
            done_at = now(),
            done_by = $2,
            done_note = $3,
            read_at = coalesce(read_at, now()),
            read_by = case when read_by = '' then $2 else read_by end,
            updated_at = now()
      where id = $1
      returning *`,
    [requestId, text(employee?.name, 60), doneNote]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "요청 글을 찾을 수 없어요.");
  }

  const replies = await loadReplies([requestId]);

  return mapRequest(rows[0], replies.get(requestId) ?? []);
}

/** 완료 취소(다시 처리 중으로 되돌리기). 사유를 함께 남깁니다. */
export async function reopenArcRequest(requestId, input = {}, employee = null) {
  const note = text(input.note, 1000);
  const { rows } = await pool.query(
    `update public.arc_requests
        set status = 'READ',
            done_at = null,
            done_by = '',
            done_note = '',
            updated_at = now()
      where id = $1
      returning *`,
    [requestId]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "요청 글을 찾을 수 없어요.");
  }

  if (note) {
    await pool.query(
      `insert into public.arc_request_replies
         (request_id, author_employee_id, author_name, author_role, is_director, body)
       values ($1, $2, $3, $4, true, $5)`,
      [
        requestId,
        text(employee?.id, 60) || null,
        text(employee?.name, 60) || "ARC 대표(RN)",
        text(employee?.role, 20),
        `[완료 취소] ${note}`,
      ]
    );
  }

  const replies = await loadReplies([requestId]);

  return mapRequest(rows[0], replies.get(requestId) ?? []);
}

export async function deleteArcRequest(requestId, { isDirector = false, employeeId = "" } = {}) {
  const { rows } = await pool.query(
    `select author_employee_id, status from public.arc_requests where id = $1`,
    [requestId]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "요청 글을 찾을 수 없어요.");
  }

  // 직원은 자기 글을, 총괄은 모든 글을 지울 수 있습니다. 완료된 글은 총괄만 지웁니다.
  const mine = rows[0].author_employee_id === (text(employeeId, 60) || null);

  if (!isDirector && (!mine || rows[0].status === "DONE")) {
    throw new HttpError(403, "HJ403", "본인이 쓴 글만 삭제할 수 있어요.");
  }

  await pool.query(`delete from public.arc_requests where id = $1`, [requestId]);

  return { deleted: true };
}

/** 다른 화면(비서 대시보드)에서 쓰는 안 읽은 글 수. */
export async function arcRequestUnreadCount() {
  const { rows } = await pool.query(
    `select count(*)::int as pending from public.arc_requests where status = 'PENDING'`,
    []
  );

  return Number(rows[0]?.pending ?? 0);
}

/** 총괄이 마지막으로 확인한 시각(직원 화면 안내용). */
export async function arcRequestSummaryFor({ isDirector = false, employeeId = "" } = {}) {
  const { rows } = await pool.query(
    `select status, count(*)::int as count
       from public.arc_requests
      where ($1::boolean or author_employee_id = $2)
      group by status`,
    [Boolean(isDirector), text(employeeId, 60) || null]
  );

  const counts = { PENDING: 0, READ: 0, DONE: 0 };
  for (const row of rows) counts[row.status] = Number(row.count ?? 0);

  return {
    total: counts.PENDING + counts.READ + counts.DONE,
    ...counts,
    unread: counts.PENDING,
    lastSeen: isoDate(new Date()),
  };
}
