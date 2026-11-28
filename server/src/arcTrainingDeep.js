// P14O — 교육자료 심화 콘텐츠 병합.
//
// 순서: 원문(arcTraining.js) → 심화(Deep*) → 총괄 수정(arc_training_content).
// 총괄이 고치지 않은 항목은 원문·심화가 그대로 내려가므로, 원문이 개선되면
// 자동으로 따라옵니다.

import {
  ARC_TRAINING_DEEP_BASICS,
} from "./arcTrainingDeepBasics.js";
import {
  ARC_TRAINING_DEEP_INJURY,
} from "./arcTrainingDeepInjury.js";
import {
  ARC_TRAINING_DEEP_OPS,
} from "./arcTrainingDeepOps.js";
import {
  ARC_TRAINING_DEEP_FORBIDDEN,
  ARC_TRAINING_DEEP_SCENARIOS,
} from "./arcTrainingDeepCases.js";

export const ARC_TRAINING_DEEP_MODULES = {
  ...ARC_TRAINING_DEEP_BASICS,
  ...ARC_TRAINING_DEEP_INJURY,
  ...ARC_TRAINING_DEEP_OPS,
};

export const ARC_TRAINING_DEEP = {
  modules: ARC_TRAINING_DEEP_MODULES,
  scenarios: ARC_TRAINING_DEEP_SCENARIOS,
  forbidden: ARC_TRAINING_DEEP_FORBIDDEN,
};

// 오버라이드는 "이 필드만 바꾼다"는 뜻이라 배열도 통째로 교체합니다.
// 빈 배열/빈 문자열을 보내면 그 항목을 지운 것으로 봅니다.
function pickText(value, fallback) {
  if (typeof value !== "string") return fallback;
  return value.trim() ? value : "";
}

function pickList(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function pickValueList(value, fallback, keys) {
  if (!Array.isArray(value)) return fallback;
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const mapped = {};
      for (const key of keys) {
        const raw = String(item[key] ?? "").trim();
        if (raw) mapped[key] = raw;
      }
      return Object.keys(mapped).length ? mapped : null;
    })
    .filter(Boolean);
}

function applyModule(module, override) {
  const merged = { ...module };
  if (!override) return merged;

  merged.title = pickText(override.title, merged.title) || merged.title;
  merged.goal = pickText(override.goal, merged.goal);
  merged.summary = pickText(override.summary, merged.summary ?? "");
  merged.why = pickText(override.why, merged.why ?? "");
  merged.helperNote = pickText(override.helperNote, merged.helperNote ?? "");

  if (Array.isArray(override.basis)) merged.basis = pickList(override.basis, []);
  if (Array.isArray(override.checklist)) {
    merged.checklist = pickList(override.checklist, []);
  }
  if (Array.isArray(override.pitfalls)) {
    merged.pitfalls = pickValueList(override.pitfalls, [], ["text", "why"]);
  }
  if (Array.isArray(override.quiz)) {
    merged.quiz = pickValueList(override.quiz, [], ["q", "a"]);
  }
  if (Array.isArray(override.materials)) {
    merged.materials = pickList(override.materials, []);
  }
  if (Array.isArray(override.evaluation)) {
    merged.evaluation = pickList(override.evaluation, []);
  }

  // 항목별 설명은 키 단위로만 덮어씁니다(다른 항목은 그대로).
  if (override.items && typeof override.items === "object") {
    merged.itemDetails = { ...(merged.itemDetails ?? {}) };
    for (const [key, value] of Object.entries(override.items)) {
      const line = String(value ?? "").trim();
      if (line) merged.itemDetails[key] = line;
      else delete merged.itemDetails[key];
    }
  }

  return merged;
}

function applyScenario(scenario, override) {
  const merged = { ...scenario };
  if (!override) return merged;

  merged.scene = pickText(override.scene, merged.scene) || merged.scene;
  merged.answer = pickText(override.answer, merged.answer) || merged.answer;
  merged.why = pickText(override.why, merged.why ?? "");
  merged.wrong = pickText(override.wrong, merged.wrong ?? "");
  merged.basis = pickText(override.basis, merged.basis ?? "");
  merged.helperNote = pickText(override.helperNote, merged.helperNote ?? "");
  if (Array.isArray(override.steps)) merged.steps = pickList(override.steps, []);

  return merged;
}

function applyForbidden(item, override) {
  const merged = { ...item };
  if (!override) return merged;

  merged.text = pickText(override.text, merged.text) || merged.text;
  merged.why = pickText(override.why, merged.why ?? "");
  merged.instead = pickText(override.instead, merged.instead ?? "");
  merged.risk = pickText(override.risk, merged.risk ?? "");
  merged.signs = pickText(override.signs, merged.signs ?? "");
  merged.drill = pickText(override.drill, merged.drill ?? "");
  merged.basis = pickText(override.basis, merged.basis ?? "");
  merged.helperNote = pickText(override.helperNote, merged.helperNote ?? "");

  return merged;
}

/**
 * 원문 + 심화 + 총괄 수정을 합칩니다.
 * overrides 는 { MODULE: {ROLE: payload}, SCENARIO: {...}, FORBIDDEN: {...} } 형태입니다.
 */
export function mergeTrainingContent(
  { modules = [], scenarios = [], forbidden = [] },
  overrides = {}
) {
  const moduleOverrides = overrides.MODULE ?? {};
  const scenarioOverrides = overrides.SCENARIO ?? {};
  const forbiddenOverrides = overrides.FORBIDDEN ?? {};

  return {
    modules: modules.map((module) => {
      const deep = ARC_TRAINING_DEEP_MODULES[module.key] ?? {};
      const base = {
        ...module,
        summary: deep.summary ?? "",
        why: deep.why ?? "",
        basis: deep.basis ?? [],
        items: module.items ?? [],
        itemDetails: { ...(deep.items ?? {}) },
        pitfalls: deep.pitfalls ?? [],
        quiz: deep.quiz ?? [],
        checklist: deep.checklist ?? [],
      };
      return applyModule(base, moduleOverrides[module.key]);
    }),
    scenarios: scenarios.map((scenario) => {
      const deep = ARC_TRAINING_DEEP_SCENARIOS[scenario.key] ?? {};
      return applyScenario({ ...scenario, ...deep }, scenarioOverrides[scenario.key]);
    }),
    forbidden: forbidden.map((item) => {
      const deep = ARC_TRAINING_DEEP_FORBIDDEN[item.key] ?? {};
      return applyForbidden({ ...item, ...deep }, forbiddenOverrides[item.key]);
    }),
  };
}

/** 화면에서 '고칠 수 있는 항목' 안내용 — 기본값을 그대로 되돌릴 때 씁니다. */
export function arcTrainingDeepDefaults() {
  return {
    modules: ARC_TRAINING_DEEP_MODULES,
    scenarios: ARC_TRAINING_DEEP_SCENARIOS,
    forbidden: ARC_TRAINING_DEEP_FORBIDDEN,
  };
}
