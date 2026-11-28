// P14Q — ARC 대표(RN) 번표(근무표) 달력.
//
// 최윤희 대표는 본업이 간호사라서, 병원 근무(D/E/N/S)를 혼자야 달력에 올려 두고
// 김원재 사장에게 "언제 매장에 올 수 있는지"를 시간으로 보여 줍니다.
//
// 원칙 (2026-11-29 지시):
//   * 등록·수정·삭제는 ARC 대표(RN)만 합니다.
//   * 사장은 전체를 볼 수 있고, 그 외 계정은 응급안전 권한 관리에서 허용된 경우에만
//     "시간"만 봅니다(근무 코드 D/E/N/S 와 메모는 총괄·사장에게만 보입니다).
//   * 혼자야 매장까지 1시간이 걸리므로, 근무 시작 1시간 전을 "출발 시각"으로 계산해
//     항상 같이 보여 줍니다. (N 근무는 전날 밤에 출발해야 합니다)
//   * 근무 외에 "올 수 있음(AVAILABLE)" / "올 수 없음(UNAVAILABLE)" 도 등록해
//     사장이 매장에 부를 수 있는 시간을 바로 알 수 있게 합니다.

import { randomUUID } from "node:crypto";

import { pool } from "./db.js";
import { badRequest, HttpError } from "./http/errors.js";

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 혼자야 매장까지 걸리는 시간(분). 이 시간만큼 일찍 출발해야 합니다. */
export const ARC_SHIFT_COMMUTE_MINUTES = 60;

export const ARC_SHIFT_CODES = [
  {
    code: "D",
    label: "D · 데이",
    startTime: "06:30",
    endTime: "15:30",
    overnight: false,
    desc: "데이 근무 06:30~15:30. 근무가 끝나면 그날 저녁 매장에 올 수 있습니다.",
  },
  {
    code: "E",
    label: "E · 이브닝",
    startTime: "14:00",
    endTime: "22:00",
    overnight: false,
    desc: "이브닝 근무 14:00~22:00. 그날은 매장에 오기 어렵습니다.",
  },
  {
    code: "N",
    label: "N · 나이트",
    startTime: "20:50",
    endTime: "08:00",
    overnight: true,
    desc: "나이트 근무 20:50~다음날 08:00. 다음 날 오전까지 쉬어야 합니다.",
  },
  {
    code: "S",
    label: "S · 스탠다드",
    startTime: "09:00",
    endTime: "17:00",
    overnight: false,
    desc: "스탠다드 근무 09:00~17:00. 저녁 시간대에 매장에 올 수 있습니다.",
  },
];

export const ARC_SHIFT_KINDS = [
  {
    key: "SHIFT",
    label: "근무",
    desc: "병원 근무조(D·E·N·S)를 등록합니다. 출발 시각은 자동으로 계산됩니다.",
  },
  {
    key: "AVAILABLE",
    label: "올 수 있음",
    desc: "근무와 별개로 매장에 올 수 있는 시간을 추가로 알려 줍니다(예: 18:00~21:00).",
  },
  {
    key: "UNAVAILABLE",
    label: "올 수 없음",
    desc: "근무 외에 매장에 올 수 없는 시간을 막아 둡니다(병원 교육·개인 일정 등).",
  },
];

export const ARC_SHIFT_TIPS = [
  "출발 시각은 근무 시작 1시간 전으로 자동 계산됩니다(혼자야 매장까지 1시간).",
  "N 근무 다음 날은 오전까지 쉬는 날로 보고, 사장에게는 '올 수 없음'으로 보입니다.",
  "사장이 매장에 부를 수 있는 시간을 정확히 알려면 '올 수 있음'을 꼭 남겨 주세요.",
  "번표는 월간 교육·OT 달력 안에 있지만, 다른 사람에게는 시간만 보입니다.",
];

const KIND_KEYS = new Set(ARC_SHIFT_KINDS.map((item) => item.key));
const CODE_MAP = new Map(ARC_SHIFT_CODES.map((item) => [item.code, item]));

export function arcShiftCatalog() {
  return {
    codes: ARC_SHIFT_CODES,
    kinds: ARC_SHIFT_KINDS,
    tips: ARC_SHIFT_TIPS,
    commuteMinutes: ARC_SHIFT_COMMUTE_MINUTES,
    weekdays: ["일", "월", "화", "수", "목", "금", "토"],
  };
}

function text(value, max = 200) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function toMinutes(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? ""));

  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
}

function fromMinutes(total) {
  // 자정을 넘어가는 값(예: 06:30 - 60분)은 하루를 더해 24시간제로 되돌립니다.
  const wrapped = ((total % 1440) + 1440) % 1440;

  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(
    wrapped % 60
  ).padStart(2, "0")}`;
}

/** 근무 시작 시각 → 출발 시각(1시간 전). N 근무는 전날 밤 출발이라 previousDay 를 표시합니다. */
export function arcShiftDepart(startTime, commuteMinutes = ARC_SHIFT_COMMUTE_MINUTES) {
  const start = toMinutes(startTime);

  if (start === null) return { departTime: "", previousDay: false };

  const raw = start - commuteMinutes;

  return {
    departTime: fromMinutes(raw),
    previousDay: raw < 0,
  };
}

function endDepart(endTime) {
  const end = toMinutes(endTime);

  if (end === null) return { returnDepartTime: "", nextDay: false };

  // 근무가 끝난 뒤 매장까지 다시 1시간 걸립니다(도착 예정 시각).
  return { returnDepartTime: fromMinutes(end + ARC_SHIFT_COMMUTE_MINUTES), nextDay: end + 60 >= 1440 };
}

function periodOf(period) {
  const value = text(period, 7);

  return PERIOD_PATTERN.test(value) ? value : null;
}

function monthBounds(period) {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const start = `${period}-01`;
  const lastDay = new Date(year, month, 0).getDate();

  return { start, end: `${period}-${String(lastDay).padStart(2, "0")}`, lastDay };
}

function currentPeriod() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function dateOnly(value) {
  if (!value) return null;

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  const raw = String(value).trim();

  return DATE_PATTERN.test(raw) ? raw : null;
}

/**
 * 한 줄을 화면용으로 바꿉니다.
 * maskTimesOnly=true 이면 근무 코드·메모를 지우고 시간만 남깁니다(총괄·사장 외 계정).
 */
function shapeEntry(row, { maskTimesOnly }) {
  const code = CODE_MAP.get(row.shift_code) ?? null;
  const startTime = text(row.start_time, 5);
  const endTime = text(row.end_time, 5);
  const depart = arcShiftDepart(startTime);
  const back = endDepart(endTime);

  const base = {
    id: row.id,
    workOn: dateOnly(row.work_on),
    kind: row.kind,
    startTime,
    endTime,
    overnight: row.overnight === true,
    departTime: depart.departTime,
    departPreviousDay: depart.previousDay,
    returnTime: back.returnDepartTime,
    returnNextDay: back.nextDay,
  };

  if (maskTimesOnly) {
    return {
      ...base,
      shiftCode: "",
      label: "근무",
      note: "",
      masked: true,
    };
  }

  return {
    ...base,
    shiftCode: row.shift_code,
    label:
      row.kind === "SHIFT"
        ? code?.label ?? row.shift_code
        : ARC_SHIFT_KINDS.find((item) => item.key === row.kind)?.label ?? row.kind,
    note: row.note ?? "",
    masked: false,
  };
}

/**
 * 한 달치 번표.
 * viewer: { isArcDirector, canWrite, loginId }
 */
export async function listArcShifts({ period, viewer = {}, ownerLoginId = "" }) {
  const target = periodOf(period) ?? currentPeriod();
  const { start, end } = monthBounds(target);
  const owner = text(ownerLoginId, 60);
  const isDirector = viewer.isArcDirector === true;
  const maskTimesOnly = !isDirector && !viewer.isOwner;

  const { rows } = await pool.query(
    `select id, work_on, kind, shift_code, start_time, end_time, overnight, note
       from public.arc_shifts
      where work_on between $1 and $2
        and ($3 = '' or owner_login_id = $3)
      order by work_on asc,
               case kind when 'SHIFT' then 0 when 'AVAILABLE' then 1 else 2 end,
               start_time asc`,
    [start, end, owner]
  );

  const days = new Map();
  const entries = rows.map((row) => shapeEntry(row, { maskTimesOnly }));

  entries.forEach((entry) => {
    if (!days.has(entry.workOn)) days.set(entry.workOn, []);
    days.get(entry.workOn).push(entry);
  });

  const summary = {
    shiftDays: entries.filter((item) => item.kind === "SHIFT").length,
    availableDays: entries.filter((item) => item.kind === "AVAILABLE").length,
    unavailableDays: entries.filter((item) => item.kind === "UNAVAILABLE").length,
    byCode: {},
    // 사장이 "이번 달에 언제 부를 수 있는지" 한눈에 보도록 계산합니다.
    callableDays: 0,
  };

  entries.forEach((entry) => {
    if (entry.kind === "SHIFT" && entry.shiftCode) {
      summary.byCode[entry.shiftCode] = (summary.byCode[entry.shiftCode] ?? 0) + 1;
    }
  });

  // 근무가 없거나, 근무가 있어도 올 수 있는 시간이 따로 있는 날 = 부를 수 있는 날
  const callable = new Set();

  entries.forEach((entry) => {
    if (entry.kind === "AVAILABLE") callable.add(entry.workOn);
  });
  days.forEach((list, day) => {
    const hasShift = list.some((item) => item.kind === "SHIFT");
    const blocked = list.some((item) => item.kind === "UNAVAILABLE");

    if (!hasShift && !blocked) callable.add(day);
  });
  summary.callableDays = callable.size;

  return {
    period: target,
    canWrite: viewer.canWrite === true,
    masked: maskTimesOnly,
    entries,
    days: [...days.entries()]
      .map(([date, list]) => ({ date, entries: list }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    summary: {
      ...summary,
      callableDates: [...callable].sort(),
    },
    catalog: arcShiftCatalog(),
  };
}

function pickCode(shiftCode) {
  const code = text(shiftCode, 4).toUpperCase();

  if (!code) return null;

  const entry = CODE_MAP.get(code);

  if (!entry) {
    throw badRequest("근무 코드는 D·E·N·S 중에서 골라 주세요.");
  }

  return entry;
}

function normalizeEntry(input) {
  const kind = text(input.kind, 20).toUpperCase() || "SHIFT";

  if (!KIND_KEYS.has(kind)) {
    throw badRequest("번표 종류는 근무·올 수 있음·올 수 없음 중에서 골라 주세요.");
  }

  const workOn = dateOnly(input.workOn);

  if (!workOn) {
    throw badRequest("번표 날짜를 YYYY-MM-DD 형식으로 넣어 주세요.");
  }

  if (kind === "SHIFT") {
    const code = pickCode(input.shiftCode);

    if (!code) {
      throw badRequest("근무 코드(D·E·N·S)를 골라 주세요.");
    }

    return {
      workOn,
      kind,
      shiftCode: code.code,
      startTime: code.startTime,
      endTime: code.endTime,
      overnight: code.overnight,
      note: text(input.note, 200),
    };
  }

  const startTime = text(input.startTime, 5) || "00:00";
  const endTime = text(input.endTime, 5) || "23:59";

  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    throw badRequest("시간은 24시간제 HH:MM 형식으로 넣어 주세요.");
  }

  if (toMinutes(startTime) === toMinutes(endTime)) {
    throw badRequest("올 수 있는 시간은 시작과 끝이 달라야 해요.");
  }

  return {
    workOn,
    kind,
    shiftCode: "",
    startTime,
    endTime,
    overnight: toMinutes(endTime) < toMinutes(startTime),
    note: text(input.note, 200),
  };
}

async function upsertEntry(entry, actor) {
  const loginId = text(actor?.loginId, 60) || "unknown";
  const ownerName = text(actor?.name, 60);

  // 같은 날 근무는 하나만 남깁니다. 코드를 잘못 눌렀을 때 두 줄이 쌓이지 않게요.
  if (entry.kind === "SHIFT") {
    await pool.query(
      `delete from public.arc_shifts
        where owner_login_id = $1
          and work_on = $2
          and kind = 'SHIFT'
          and shift_code <> $3`,
      [loginId, entry.workOn, entry.shiftCode]
    );
  }

  const { rows } = await pool.query(
    `insert into public.arc_shifts
       (owner_login_id, owner_name, work_on, kind, shift_code,
        start_time, end_time, overnight, note, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (owner_login_id, work_on, kind, shift_code) do update
       set start_time = excluded.start_time,
           end_time = excluded.end_time,
           overnight = excluded.overnight,
           note = excluded.note,
           owner_name = excluded.owner_name,
           updated_at = now()
     returning id`,
    [
      loginId,
      ownerName,
      entry.workOn,
      entry.kind,
      entry.shiftCode,
      entry.startTime,
      entry.endTime,
      entry.overnight,
      entry.note,
      loginId,
    ]
  );

  return rows[0]?.id ?? randomUUID();
}

/** 번표 한 건 등록(같은 날 같은 코드면 덮어쓰기). */
export async function saveArcShift(input, actor) {
  const entry = normalizeEntry(input);
  const id = await upsertEntry(entry, actor);

  return {
    entry: {
      ...entry,
      id,
      departTime: arcShiftDepart(entry.startTime).departTime,
      departPreviousDay: arcShiftDepart(entry.startTime).previousDay,
    },
  };
}

/**
 * 여러 날짜를 한 번에 등록합니다.
 * dates: ["2026-11-03", ...] 또는 기간(startOn~endOn) 중 선택한 요일만.
 */
export async function bulkSaveArcShifts(input, actor) {
  const dates = Array.isArray(input.dates)
    ? input.dates.map(dateOnly).filter(Boolean)
    : [];

  if (dates.length === 0) {
    throw badRequest("등록할 날짜를 하나 이상 골라 주세요.");
  }

  if (dates.length > 92) {
    throw badRequest("한 번에 92일까지만 등록할 수 있어요.");
  }

  const template = normalizeEntry({ ...input, workOn: dates[0] });
  const saved = [];

  for (const workOn of dates) {
    const id = await upsertEntry({ ...template, workOn }, actor);

    saved.push({ ...template, workOn, id });
  }

  return {
    saved,
    count: saved.length,
    summary: {
      shiftCode: template.shiftCode,
      kind: template.kind,
      firstDate: saved[0]?.workOn ?? "",
      lastDate: saved[saved.length - 1]?.workOn ?? "",
    },
  };
}

export async function deleteArcShift(id, actor) {
  const target = text(id, 40);

  if (!target) {
    throw badRequest("삭제할 번표를 찾을 수 없어요.");
  }

  const { rowCount } = await pool.query(
    `delete from public.arc_shifts
      where id = $1
        and ($2 = '' or owner_login_id = $2)`,
    [target, text(actor?.loginId, 60)]
  );

  if (rowCount === 0) {
    throw new HttpError(404, "HJ404", "번표를 찾을 수 없어요. 이미 지워졌을 수 있어요.");
  }

  return { deleted: rowCount };
}

/** 사장 화면용 요약 — "이번 주에 언제 올 수 있는지"만 짧게. */
export async function arcShiftBriefing({ period, viewer = {}, ownerLoginId = "" }) {
  const board = await listArcShifts({ period, viewer, ownerLoginId });
  const today = dateOnly(new Date());
  const upcoming = board.entries
    .filter((item) => item.workOn >= today)
    .slice(0, 12)
    .map((item) => ({
      workOn: item.workOn,
      kind: item.kind,
      startTime: item.startTime,
      endTime: item.endTime,
      departTime: item.departTime,
      label: item.label,
      masked: item.masked,
    }));

  return {
    period: board.period,
    summary: board.summary,
    upcoming,
    masked: board.masked,
  };
}
