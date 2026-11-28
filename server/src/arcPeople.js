// P14Q — ARC 인사카드 (ARC 대표(RN) 전용 직원·사장 관리).
//
// 최윤희 대표가 혼자야 직원·사장을 한 표에서 관리합니다.
//   * 이름·직위·전화·비상연락·주소·입사일·고용형태·메모는 평문 컬럼.
//   * 주민등록번호와 건강 항목(혈액형·알레르기·지병·복용약·건강메모)은
//     arc_fields 의 *_enc 컬럼에 넣고, 화면에는 마스킹만 보입니다.
//     (원문 조회는 총괄이 '보기'를 눌렀을 때만 내려갑니다.)
//   * 이 카드는 AS-CARE 상세 건강기록을 대신하지 않습니다. 진료·투약·사고 기록은
//     기존 AS-CARE(동의·승인 절차)에 남기고, 여기에는 "알아 두면 현장에서 도움이 되는"
//     최소 정보만 둡니다.
//   * 조회·작성·수정·삭제 모두 총괄만 가능합니다(라우터에서 requireDirector).

import { randomUUID } from "node:crypto";

import { readField, storeField } from "./arcFields.js";
import { pool } from "./db.js";
import { badRequest, HttpError } from "./http/errors.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// P14S — 항목을 대폭 늘렸습니다. 전부 선택 입력이라 비워 두어도 저장됩니다.
// 건강(응급 대응에 바로 쓰는 정보)
export const ARC_HEALTH_FIELDS = [
  { key: "bloodType", label: "혈액형", hint: "A·B·O·AB. 모르면 비워 두세요." },
  { key: "allergies", label: "알레르기", hint: "약·음식·벌레 등. 예: 페니실린, 새우, 벌독" },
  { key: "conditions", label: "지병·기왕력", hint: "천식·당뇨·심장질환·간질·공황 등" },
  { key: "medications", label: "복용 중인 약", hint: "상비약과 겹치면 위험한 조합을 확인" },
  { key: "pregnancy", label: "임신·수유", hint: "해당되면 개월 수를 적어 주세요(응급처치 판단)" },
  { key: "surgeries", label: "수술·입원 이력", hint: "시기와 부위. 예: 2023년 충수절제" },
  { key: "vaccinations", label: "예방접종", hint: "파상풍·B형간염 등 최근 접종일" },
  { key: "disability", label: "장애·보조기기", hint: "안경·보청기·보조기 등" },
  { key: "vision", label: "시력·색각", hint: "안경 착용 여부, 색 구분이 어려운지" },
  { key: "vitals", label: "평소 신장·체중·혈압", hint: "예: 165cm / 55kg / 110-70" },
  { key: "smokingDrinking", label: "흡연·음주", hint: "응급 상황에서 의료진에게 전달할 정보" },
  { key: "doctor", label: "주치의·단골병원", hint: "연락처까지 있으면 좋아요" },
  { key: "note", label: "현장 참고 메모", hint: "쓰러졌을 때 먼저 알아야 할 것" },
];

// 인사(기본정보) — 급여·유니폼·연락 등 실무에 쓰는 정보
export const ARC_PROFILE_FIELDS = [
  { key: "englishName", label: "영문 이름", hint: "여권·서류와 맞출 때" },
  { key: "hometown", label: "출생지·고향", hint: "본인 확인이 필요할 때 활용" },
  { key: "education", label: "학력·전공", hint: "관련 자격·경력 정리에 도움" },
  { key: "career", label: "주요 경력", hint: "이전 근무지·기간·업무" },
  { key: "certificates", label: "자격·면허", hint: "간호조무사·위생교육·바리스타 등" },
  { key: "languages", label: "가능 외국어", hint: "외국인 손님 응대 가능 여부" },
  { key: "bankAccount", label: "급여 계좌", hint: "은행·예금주·계좌번호(정산용)" },
  { key: "family", label: "가족·비상 연락", hint: "부모·배우자 등 연락 우선순위" },
  { key: "addressDetail", label: "거주지 상세", hint: "건물·호수. 심야 귀가 확인에 사용" },
  { key: "transport", label: "통근 수단·소요 시간", hint: "막차·대리 여부 판단" },
  { key: "uniformSize", label: "유니폼·신발 사이즈", hint: "유니폼·안전화 지급용" },
  { key: "memo", label: "기타 메모", hint: "ARC 대표가 알아 두면 좋은 것" },
];

const ARC_EXTRA_FIELDS = [...ARC_HEALTH_FIELDS, ...ARC_PROFILE_FIELDS];

export const ARC_EMPLOYMENT_KINDS = [
  { key: "OWNER", label: "사장(대표)" },
  { key: "FULL", label: "정규직" },
  { key: "PART", label: "아르바이트" },
  { key: "CONTRACT", label: "계약직" },
  { key: "ETC", label: "기타" },
];

export const ARC_PEOPLE_TIPS = [
  "주민등록번호는 앞 6자리만 화면에 보이고, 원문은 총괄이 '보기'를 누를 때만 열립니다.",
  "건강 항목은 '현장에서 쓰러졌을 때 먼저 알아야 할 것'만 적습니다. 진단명·처방 내역은 AS-CARE에 남깁니다.",
  "모든 항목은 선택 입력입니다. 아는 것만 적고 비워 두어도 저장되니, 확인되는 대로 채워 주세요.",
  "이름·전화번호가 바뀌면 카드도 바로 고쳐 주세요. 사고 때 연락처가 틀리면 가장 위험합니다.",
  "입사일을 넣어 두면 신규직원 7일 교육·30일 실습 일정을 놓치지 않습니다.",
];

export function arcPeopleCatalog() {
  return {
    healthFields: ARC_HEALTH_FIELDS,
    profileFields: ARC_PROFILE_FIELDS,
    employmentKinds: ARC_EMPLOYMENT_KINDS,
    tips: ARC_PEOPLE_TIPS,
  };
}

function text(value, max = 200) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function dateOnly(value) {
  const raw = String(value ?? "").trim();

  if (!raw) return null;

  return DATE_PATTERN.test(raw) ? raw : null;
}

function toDateString(value) {
  if (!value) return "";

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  return String(value).slice(0, 10);
}

/**
 * 주민등록번호 마스킹.
 * "900101-1234567" → "900101-1******" (뒷자리는 첫 글자만 남깁니다)
 */
function maskResidentNo(raw) {
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");

  if (digits.length < 7) return "";

  const front = digits.slice(0, 6);
  const back = digits.slice(6);
  const head = back.slice(0, 1);

  return `${front}-${head}${"*".repeat(Math.max(back.length - 1, 0))}`;
}

function normalizeExtras(input) {
  const source = input && typeof input === "object" ? input : {};
  const extras = {};

  ARC_EXTRA_FIELDS.forEach((field) => {
    extras[field.key] = text(source[field.key], 600);
  });

  return extras;
}

function emptyExtras() {
  const extras = {};

  ARC_EXTRA_FIELDS.forEach((field) => {
    extras[field.key] = "";
  });

  return extras;
}

function readExtras(stored) {
  const plain = readField(stored);

  if (plain === null) {
    return { failed: true, ...emptyExtras() };
  }

  if (!plain) {
    return { failed: false, ...emptyExtras() };
  }

  try {
    const parsed = JSON.parse(plain);
    const extras = { failed: false };

    ARC_EXTRA_FIELDS.forEach((field) => {
      extras[field.key] = text(parsed?.[field.key], 600);
    });

    return extras;
  } catch {
    return { failed: true, ...emptyExtras() };
  }
}

function pickFields(source, fields) {
  const picked = {};

  fields.forEach((field) => {
    picked[field.key] = source[field.key] ?? "";
  });

  return picked;
}

function shapeCard(row) {
  const extras = readExtras(row.health_enc);

  return {
    id: row.id,
    employeeId: row.employee_id ?? "",
    loginId: row.login_id ?? "",
    name: row.name ?? "",
    roleLabel: row.role_label ?? "",
    residentMask: row.resident_mask ?? "",
    hasResidentNo: Boolean(row.resident_no_enc),
    birthOn: toDateString(row.birth_on),
    phone: row.phone ?? "",
    emergencyName: row.emergency_name ?? "",
    emergencyPhone: row.emergency_phone ?? "",
    address: row.address ?? "",
    health: pickFields(extras, ARC_HEALTH_FIELDS),
    profile: pickFields(extras, ARC_PROFILE_FIELDS),
    healthReady: !extras.failed,
    joinedOn: toDateString(row.joined_on),
    employment: row.employment ?? "FULL",
    employmentLabel:
      ARC_EMPLOYMENT_KINDS.find((item) => item.key === row.employment)?.label ?? row.employment,
    note: row.note ?? "",
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

/** 카드 목록 + 계정 목록(아직 카드가 없는 사람을 바로 만들 수 있게). */
export async function listArcPeople({ keyword = "" } = {}) {
  const search = text(keyword, 60);

  const { rows } = await pool.query(
    `select *
       from public.arc_people
      where ($1 = '' or name ilike '%' || $1 || '%' or login_id ilike '%' || $1 || '%'
             or phone ilike '%' || $1 || '%')
      order by
        case employment when 'OWNER' then 0 else 1 end,
        name asc`,
    [search]
  );

  const cards = rows.map(shapeCard);

  // 계정은 있지만 인사카드가 없는 사람 — "카드 만들기" 버튼으로 이어집니다.
  const { rows: accounts } = await pool.query(
    `select id, login_id, name, role, title
       from public.employees
      order by name asc`
  );
  const linked = new Set(cards.map((card) => card.loginId).filter(Boolean));

  return {
    cards,
    catalog: arcPeopleCatalog(),
    missing: accounts
      .filter((row) => !linked.has(row.login_id))
      .map((row) => ({
        employeeId: row.id,
        loginId: row.login_id,
        name: row.name,
        role: row.role,
        title: row.title,
      })),
    stats: {
      total: cards.length,
      owner: cards.filter((card) => card.employment === "OWNER").length,
      staff: cards.filter((card) => card.employment !== "OWNER").length,
      missing: accounts.filter((row) => !linked.has(row.login_id)).length,
      healthFilled: cards.filter((card) => Object.values(card.health).some(Boolean)).length,
      profileFilled: cards.filter((card) => Object.values(card.profile).some(Boolean)).length,
    },
  };
}

/** 카드 한 장(총괄이 주민등록번호 원문을 확인해야 할 때). */
export async function getArcPerson(personId, { revealResidentNo = false } = {}) {
  const target = text(personId, 40);

  if (!target) throw badRequest("인사카드를 찾을 수 없어요.");

  const { rows } = await pool.query(`select * from public.arc_people where id = $1`, [target]);

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "인사카드를 찾을 수 없어요.");
  }

  const card = shapeCard(rows[0]);

  if (!revealResidentNo) {
    return { card };
  }

  const plain = readField(rows[0].resident_no_enc);

  return {
    card: {
      ...card,
      residentNo: plain === null ? "" : plain,
      residentNoFailed: plain === null,
    },
  };
}

/** 새 카드. loginId 가 없으면 임시 카드(계정 없는 사람)로 만듭니다. */
export async function saveArcPerson(input, actor) {
  const name = text(input.name, 60);

  if (!name) throw badRequest("이름을 넣어 주세요.");

  const personId = text(input.personId, 40);
  let loginId = text(input.loginId, 60);
  let employeeId = text(input.employeeId, 60) || null;

  if (employeeId) {
    const { rows } = await pool.query(`select login_id from public.employees where id = $1`, [
      employeeId,
    ]);

    if (rows.length === 0) {
      employeeId = null;
    } else if (!loginId) {
      loginId = rows[0].login_id;
    }
  }

  if (!loginId) {
    // 계정 없는 사람도 카드를 만들 수 있게 임시 키를 씁니다.
    loginId = `manual:${randomUUID()}`;
  }

  const residentRaw = text(input.residentNo, 20);
  const mask = maskResidentNo(residentRaw);
  // 건강·인사 항목은 모두 선택 입력입니다(빈 값이면 빈 문자열로 저장).
  const extras = normalizeExtras({ ...(input.profile ?? {}), ...(input.health ?? {}) });
  const healthEnc = storeField(JSON.stringify(extras));

  const values = [
    employeeId,
    loginId,
    name,
    text(input.roleLabel, 40),
    mask ? storeField(residentRaw) : "",
    mask,
    dateOnly(input.birthOn),
    text(input.phone, 40),
    text(input.emergencyName, 60),
    text(input.emergencyPhone, 40),
    text(input.address, 300),
    healthEnc,
    dateOnly(input.joinedOn),
    ARC_EMPLOYMENT_KINDS.some((item) => item.key === input.employment)
      ? input.employment
      : "FULL",
    text(input.note, 1000),
  ];

  try {
    // 카드 수정 — id 로 바로 고칩니다(계정 없는 임시 카드도 그대로 유지).
    if (personId) {
      const { rows } = await pool.query(
        `update public.arc_people
            set employee_id = coalesce($1, employee_id),
                login_id = $2,
                name = $3,
                role_label = $4,
                resident_no_enc = case when $6 = '' then resident_no_enc else $5 end,
                resident_mask = case when $6 = '' then resident_mask else $6 end,
                birth_on = $7,
                phone = $8,
                emergency_name = $9,
                emergency_phone = $10,
                address = $11,
                health_enc = $12,
                joined_on = $13,
                employment = $14,
                note = $15,
                updated_at = now()
          where id = $16
          returning *`,
        [...values, personId]
      );

      if (rows.length === 0) {
        throw new HttpError(404, "HJ404", "인사카드를 찾을 수 없어요.");
      }

      return { card: shapeCard(rows[0]), actor: text(actor?.loginId, 60) };
    }

    const { rows } = await pool.query(
      `insert into public.arc_people
         (employee_id, login_id, name, role_label, resident_no_enc, resident_mask,
          birth_on, phone, emergency_name, emergency_phone, address, health_enc,
          joined_on, employment, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       on conflict (login_id) where login_id <> '' do update
         set name = excluded.name,
             role_label = excluded.role_label,
             employee_id = coalesce(excluded.employee_id, public.arc_people.employee_id),
             resident_no_enc = case when excluded.resident_mask = '' then public.arc_people.resident_no_enc else excluded.resident_no_enc end,
             resident_mask = case when excluded.resident_mask = '' then public.arc_people.resident_mask else excluded.resident_mask end,
             birth_on = excluded.birth_on,
             phone = excluded.phone,
             emergency_name = excluded.emergency_name,
             emergency_phone = excluded.emergency_phone,
             address = excluded.address,
             health_enc = excluded.health_enc,
             joined_on = excluded.joined_on,
             employment = excluded.employment,
             note = excluded.note,
             updated_at = now()
       returning *`,
      values
    );

    return { card: shapeCard(rows[0]), actor: text(actor?.loginId, 60) };
  } catch (error) {
    if (error?.code === "23505") {
      throw badRequest("그 계정에는 이미 인사카드가 있어요. 기존 카드를 열어 수정해 주세요.");
    }

    throw error;
  }
}

export async function deleteArcPerson(personId) {
  const target = text(personId, 40);

  if (!target) throw badRequest("삭제할 인사카드를 찾을 수 없어요.");

  const { rowCount } = await pool.query(`delete from public.arc_people where id = $1`, [target]);

  if (rowCount === 0) {
    throw new HttpError(404, "HJ404", "인사카드를 찾을 수 없어요.");
  }

  return { deleted: rowCount };
}

/**
 * 직원 관리 화면(계정)에서 불러온 기본값.
 * 사장이 계정을 만들면 총괄이 인사카드를 이어서 채울 수 있습니다.
 */
export async function arcPeopleAccountOptions() {
  const { rows } = await pool.query(
    `select e.id, e.login_id, e.name, e.role, e.title,
            p.id as card_id
       from public.employees e
       left join public.arc_people p on p.login_id = e.login_id
      order by e.name asc`
  );

  return rows.map((row) => ({
    employeeId: row.id,
    loginId: row.login_id,
    name: row.name,
    role: row.role,
    title: row.title ?? "",
    hasCard: Boolean(row.card_id),
  }));
}
