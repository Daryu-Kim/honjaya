// P14O — 교육자료 총괄 수정 + 작성 도우미.
//
// 원칙
//   * 교육자료 원문은 코드가 원본입니다. 총괄이 고친 부분만 DB에 남깁니다.
//   * 저장은 ARC 대표(RN)만 할 수 있습니다(라우트에서 requireDirector).
//   * 도우미는 "몇 줄만 입력하면 교육자료가 완성되는" 자동 문장 생성기입니다.
//     모델 호출 없이 정해진 틀로 만들기 때문에 결과가 예측 가능하고 근거가 흔들리지 않습니다.

import { pool } from "./db.js";
import { badRequest, HttpError } from "./http/errors.js";
import { ARC_TRAINING_DEEP_MODULES } from "./arcTrainingDeep.js";

const SCOPES = new Set(["MODULE", "SCENARIO", "FORBIDDEN"]);
const MAX_TEXT = 4000;

function text(value, max = 400) {
  return String(value ?? "").trim().slice(0, max);
}

function list(values, max = 12) {
  if (!Array.isArray(values)) return undefined;
  return values
    .map((item) => text(item, 400))
    .filter(Boolean)
    .slice(0, max);
}

function objectList(values, keys, max = 12) {
  if (!Array.isArray(values)) return undefined;
  return values
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const mapped = {};
      for (const key of keys) {
        const value = text(item[key], 600);
        if (value) mapped[key] = value;
      }
      return Object.keys(mapped).length ? mapped : null;
    })
    .filter(Boolean)
    .slice(0, max);
}

function itemMap(values) {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return undefined;
  }

  const mapped = {};
  for (const [key, value] of Object.entries(values)) {
    const field = text(key, 40);
    if (!field) continue;
    mapped[field] = text(value, 2000);
  }
  return Object.keys(mapped).length ? mapped : {};
}

/** scope 별로 저장 가능한 필드만 남깁니다(그 밖의 키는 버립니다). */
export function sanitizeTrainingPayload(scope, payload = {}) {
  const input = payload && typeof payload === "object" ? payload : {};

  if (scope === "MODULE") {
    return {
      title: text(input.title, 160),
      goal: text(input.goal, 400),
      summary: text(input.summary, MAX_TEXT),
      why: text(input.why, MAX_TEXT),
      basis: list(input.basis),
      materials: list(input.materials),
      evaluation: list(input.evaluation),
      checklist: list(input.checklist),
      pitfalls: objectList(input.pitfalls, ["text", "why"]),
      quiz: objectList(input.quiz, ["q", "a"]),
      items: itemMap(input.items),
      helperNote: text(input.helperNote, MAX_TEXT),
    };
  }

  if (scope === "SCENARIO") {
    return {
      scene: text(input.scene, 600),
      answer: text(input.answer, 2000),
      why: text(input.why, MAX_TEXT),
      steps: list(input.steps),
      wrong: text(input.wrong, 800),
      basis: text(input.basis, 400),
      helperNote: text(input.helperNote, MAX_TEXT),
    };
  }

  return {
    text: text(input.text, 600),
    why: text(input.why, MAX_TEXT),
    instead: text(input.instead, 800),
    risk: text(input.risk, 800),
    signs: text(input.signs, 800),
    drill: text(input.drill, 800),
    basis: text(input.basis, 400),
    helperNote: text(input.helperNote, MAX_TEXT),
  };
}

/** 비어 있는 필드는 저장하지 않습니다(= 원문·심화를 그대로 씁니다). */
function compact(payload) {
  const result = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }
    result[key] = value;
  }
  return result;
}

/** 저장된 총괄 수정 내용을 scope 별 map 으로 읽습니다. */
export async function loadTrainingOverrides() {
  const { rows } = await pool.query(
    `select scope, content_key, payload, helper_input, updated_by, updated_at
       from public.arc_training_content
      order by scope, content_key`
  );

  const grouped = { MODULE: {}, SCENARIO: {}, FORBIDDEN: {} };
  const rows2 = [];

  for (const row of rows) {
    if (!grouped[row.scope]) continue;
    grouped[row.scope][row.content_key] = row.payload ?? {};
    rows2.push({
      scope: row.scope,
      key: row.content_key,
      payload: row.payload ?? {},
      helperInput: row.helper_input ?? {},
      updatedBy: row.updated_by ?? "",
      updatedAt: row.updated_at ?? null,
    });
  }

  return { grouped, rows: rows2 };
}

export async function listTrainingContent() {
  const { rows } = await loadTrainingOverrides();
  return rows;
}

/**
 * 총괄이 고친 내용을 저장합니다.
 * payload 가 비면 그 항목의 수정본을 지워 원문으로 되돌립니다.
 */
export async function saveTrainingContent(body = {}, employee) {
  const scope = text(body.scope, 20).toUpperCase();
  const key = text(body.key, 40).toUpperCase();

  if (!SCOPES.has(scope)) {
    throw badRequest("교육자료 구분이 올바르지 않아요.");
  }

  if (!key) {
    throw badRequest("어떤 교육자료를 고칠지 선택해 주세요.");
  }

  const payload = compact(sanitizeTrainingPayload(scope, body.payload));
  const helperInput =
    body.helperInput && typeof body.helperInput === "object"
      ? {
          month: text(body.helperInput.month, 10),
          incident: text(body.helperInput.incident, 600),
          product: text(body.helperInput.product, 400),
          mistake: text(body.helperInput.mistake, 600),
          emphasis: text(body.helperInput.emphasis, 600),
          audience: text(body.helperInput.audience, 200),
        }
      : {};

  if (Object.keys(payload).length === 0) {
    await pool.query(
      `delete from public.arc_training_content
        where scope = $1 and content_key = $2`,
      [scope, key]
    );

    return { scope, key, payload: {}, restored: true };
  }

  const { rows } = await pool.query(
    `insert into public.arc_training_content
       (scope, content_key, payload, helper_input, updated_by)
     values ($1, $2, $3::jsonb, $4::jsonb, $5)
     on conflict (scope, content_key) do update
       set payload = excluded.payload,
           helper_input = excluded.helper_input,
           updated_by = excluded.updated_by,
           updated_at = now()
     returning scope, content_key, payload, helper_input, updated_by, updated_at`,
    [scope, key, JSON.stringify(payload), JSON.stringify(helperInput), text(employee?.name, 60)]
  );

  const row = rows[0];

  return {
    scope: row.scope,
    key: row.content_key,
    payload: row.payload ?? {},
    helperInput: row.helper_input ?? {},
    updatedBy: row.updated_by ?? "",
    updatedAt: row.updated_at ?? null,
    restored: false,
  };
}

export async function deleteTrainingContent(body = {}) {
  const scope = text(body.scope, 20).toUpperCase();
  const key = text(body.key, 40).toUpperCase();

  if (!SCOPES.has(scope) || !key) {
    throw new HttpError(400, "HJ400", "되돌릴 교육자료를 선택해 주세요.");
  }

  await pool.query(
    `delete from public.arc_training_content
      where scope = $1 and content_key = $2`,
    [scope, key]
  );

  return { scope, key };
}

const EMPTY_INPUT = "아직 입력하지 않았어요";

/**
 * 작성 도우미.
 *
 * 총괄이 짧게 적은 메모(이번 달 사건·새로 산 품목·직원 실수·강조점)를
 * 교육자료에 바로 붙일 수 있는 문장으로 만들어 줍니다. 결과는
 *   ① 이번 달 보강 포인트(인쇄용 블록)
 *   ② 요약(summary) 초안
 *   ③ 흔한 실수(pitfalls) 초안
 *   ④ 구두 질문(quiz) 초안
 * 네 덩어리이고, 총괄은 필요한 것만 골라 적용하면 됩니다.
 */
export function buildTrainingHelper(body = {}) {
  const scope = text(body.scope, 20).toUpperCase() || "MODULE";
  const key = text(body.key, 40).toUpperCase();
  const input = body.input && typeof body.input === "object" ? body.input : {};

  const month = text(input.month, 10) || new Date().toISOString().slice(0, 7);
  const incident = text(input.incident, 600);
  const product = text(input.product, 400);
  const mistake = text(input.mistake, 600);
  const emphasis = text(input.emphasis, 600);
  const audience = text(input.audience, 200) || "사장·직원";
  const deep = ARC_TRAINING_DEEP_MODULES[key] ?? {};
  // 모듈 제목은 호출한 쪽(라우트)이 알고 있으므로 그대로 받아 씁니다.
  const title = text(body.title, 120) || key;

  const focus = [];
  if (incident) {
    focus.push(
      `이번 달 실제 사례: ${incident}. 이 상황에서 우리가 먼저 할 일은 ` +
        `"안전한 자리 만들기 → 119 → 처치" 순서를 지키는 것입니다. ` +
        `사례를 그대로 다시 말해 보게 하고, 그때 무엇을 먼저 했어야 하는지 확인하세요.`
    );
  }
  if (mistake) {
    focus.push(
      `직원이 반복한 실수: ${mistake}. 이 실수는 대개 "확인하지 않고 넘어가서" 생깁니다. ` +
        `교육에서는 실수를 지적하기보다, 실수를 막는 한 가지 행동(예: 장갑 먼저, 기록 먼저, ` +
        `위험신호 먼저 확인)을 정해 함께 소리 내어 연습하세요.`
    );
  }
  if (product) {
    focus.push(
      `새로 들여온 품목·변경 사항: ${product}. 위치와 사용 조건을 실제로 걸어가며 확인하고, ` +
        `사용하면 사용대장에 남긴다는 원칙을 다시 안내하세요. ` +
        `RN 제한 품목(Level C)이면 일반직원 사용 금지도 함께 강조합니다.`
    );
  }
  if (emphasis) {
    focus.push(
      `이번 달 강조점: ${emphasis}. 교육 마지막에 "${emphasis}"를 한 문장으로 다시 말하게 하고, ` +
        `모두가 같은 문장으로 기억하는지 확인하세요.`
    );
  }
  if (focus.length === 0) {
    focus.push(
      `${EMPTY_INPUT}. 도우미에 이번 달 사건·실수·새 품목·강조점 중 하나만 적어도 ` +
        `교육자료에 붙일 문장이 자동으로 만들어집니다.`
    );
  }

  const helperNote = [
    `[${month} ${title} 보강 포인트]`,
    ...focus.map((line, index) => `${index + 1}. ${line}`),
    `대상: ${audience} · 진행: 설명(10분) → 상황연습(10분) → 구두확인(5분)`,
  ].join("\n");

  const summaryParts = [];
  if (deep.summary) summaryParts.push(deep.summary);
  if (emphasis || incident) {
    summaryParts.push(
      `이번 달에는 ${[incident ? `실제 사례(${incident})` : "", emphasis]
        .filter(Boolean)
        .join(" 와 ")}를 함께 짚습니다.`
    );
  }
  if (mistake) {
    summaryParts.push(`특히 "${mistake}"를 예방하는 행동을 몸에 익히는 것이 목표입니다.`);
  }

  const pitfalls = [];
  if (mistake) {
    pitfalls.push({
      text: mistake,
      why:
        `이 실수는 대개 시간에 쫓기거나 "괜찮겠지"라고 판단할 때 생깁니다. ` +
        `그래서 교육에서는 한 가지 행동을 정해 소리 내어 확인하는 방식으로 연습합니다.`,
    });
  }

  const quiz = [];
  if (incident) {
    quiz.push({
      q: `지난달 실제 사례(${incident})에서 우리가 가장 먼저 했어야 하는 행동은 무엇인가요?`,
      a: "안전한 자리 확보 → 119 신고 → 가능한 처치(가슴압박·직접압박·냉각) → 인계 순서입니다.",
    });
  }
  if (emphasis) {
    quiz.push({
      q: `이번 달 우리가 지키기로 한 원칙("${emphasis}")을 한 문장으로 말해 보세요.`,
      a: `${emphasis} — 언제, 어떤 상황에서도 같은 원칙을 적용합니다.`,
    });
  }
  if (product) {
    quiz.push({
      q: `새로 들여온 품목(${product})의 위치와 사용 후 해야 할 일은 무엇인가요?`,
      a: "위치를 실제로 확인하고, 사용 후에는 사용대장에 육하원칙으로 기록합니다. Level C 는 RN 전용입니다.",
    });
  }
  if (quiz.length === 0 && Array.isArray(deep.quiz)) {
    quiz.push(...deep.quiz.slice(0, 3));
  }

  return {
    scope,
    key,
    month,
    helperNote,
    focus,
    summary: summaryParts.join(" ").trim(),
    pitfalls,
    quiz,
    audience,
  };
}
