// P14Q — 구두시험 시험지·교육자용 자료 생성기 (ARC 대표(RN) 전용).
//
// 최윤희 대표가 "시험지 뽑기"를 누를 때마다 문제를 새로 조합합니다.
//   * seed 가 같으면 같은 문제지가 다시 나옵니다(다시 뽑으면 새 seed).
//   * 최윤희 의견(emphasis)을 넣으면 그 범위・주제를 우선으로 뽑고,
//     직접 쓴 문항(?로 시작하는 줄)은 그대로 시험지에 들어갑니다.
//
// 네 가지 출력:
//   1) 불시 · 실시        → SURPRISE / SCREEN
//   2) 정규 · 실시        → REGULAR  / SCREEN
//   3) 불시 · 시험지 인쇄 → SURPRISE / EXAM
//   4) 정규 · 시험지 인쇄 → REGULAR  / EXAM
//   (+ 교육자용 답안지·평가표 = TEACHER)
//
// 내용 차이:
//   * 불시: 5분, 핵심술기(critical) 5문항 + 즉답 질문 1개. 커트라인 70%.
//   * 정규: 20분, 8개 영역에서 영역별 2문항 + 질문은행 3문항. 커트라인 80%.
//   * 시험지(EXAM)에는 모범답안・채점기준・이론근거를 넣지 않습니다.
//     교육자용(TEACHER)에만 수행/부분수행/미수행 기준과 근거, 꼬리질문을 넣습니다.

import { randomUUID } from "node:crypto";

import { ARC_VERBAL_QUESTIONS, ARC_VERBAL_SECTIONS } from "./arcVerbal.js";
import { badRequest } from "./http/errors.js";

export const ARC_VERBAL_PAPER_KINDS = [
  {
    key: "SURPRISE",
    label: "불시 구두시험",
    short: "불시",
    minutes: 5,
    cutline: 70,
    desc: "예고 없이 영업 중 5분 안에 끝내는 확인 시험. 핵심술기 5문항 + 즉답 1문항.",
    color: "#b45309",
  },
  {
    key: "REGULAR",
    label: "정규 구두시험",
    short: "정규",
    minutes: 20,
    cutline: 80,
    desc: "예고한 날짜에 8개 영역을 고루 보는 정식 시험. 영역별 2문항 + 심화 3문항.",
    color: "#1d4ed8",
  },
];

export const ARC_VERBAL_PAPER_MODES = [
  {
    key: "EXAM",
    label: "시험지(문제지)",
    desc: "응시자에게 주는 문제지. 모범답안·채점기준 없이 문제와 답변 여백만 인쇄합니다.",
  },
  {
    key: "TEACHER",
    label: "교육자용(답안지·평가표)",
    desc: "채점자용. 모범답안·수행/부분수행/미수행 기준·이론근거·꼬리질문·판정규칙까지 인쇄합니다.",
  },
];

const KIND_MAP = new Map(ARC_VERBAL_PAPER_KINDS.map((item) => [item.key, item]));
const MODE_KEYS = new Set(ARC_VERBAL_PAPER_MODES.map((item) => item.key));

// 문제를 묻는 "각도". 같은 항목이라도 절차·이유·판단·금지·실수·상황·우선순위·
// 인계·기록·물품·권한 중 어느 각도로 묻느냐에 따라 답의 형태가 달라집니다.
// seed 가 바뀌면 각도와 문장 틀이 함께 바뀌므로 매번 다른 시험지가 나옵니다.
const STEM_ANGLES = [
  {
    key: "procedure",
    label: "절차",
    focus: "순서를 빠뜨리지 않고, 각 단계에서 하는 행동을 구체적으로 말한다.",
    templates: [
      "{label} — 순서대로 설명하세요.",
      "{label}. 지금 바로 해야 합니다. 무엇부터 하십니까?",
      "{label} — 처음 배우는 직원에게 가르친다고 생각하고 차근차근 설명하세요.",
      "{label}의 첫 단계와 마지막 단계를 반드시 포함해 설명하세요.",
    ],
  },
  {
    key: "reason",
    label: "이유·근거",
    focus: "행동과 함께, 왜 그렇게 해야 하는지 근거를 한 문장으로 붙인다.",
    templates: [
      "{label} — 왜 그렇게 해야 하는지 근거와 함께 설명하세요.",
      "{label}. '그냥 그렇게 배웠다'가 아니라 이유를 말해야 합니다.",
      "{label} — 이 원칙을 지키지 않으면 어떤 사고가 생기는지 포함해 설명하세요.",
      "{label} — 몸에서 실제로 어떤 일이 일어나기 때문에 그렇게 합니까?",
    ],
  },
  {
    key: "judgment",
    label: "판단 기준",
    focus: "판단에 쓰는 관찰 소견과 기준(수치·시간·상태)을 제시한다.",
    templates: [
      "{label} — 무엇을 보고 판단합니까? 기준을 말하세요.",
      "{label}. 애매한 상황입니다. 무엇을 근거로 결정하시겠습니까?",
      "{label} — 스스로 처리할지 119에 넘길지, 그 선을 설명하세요.",
      "{label} — 정상과 비정상을 가르는 기준을 숫자로 제시하세요.",
    ],
  },
  {
    key: "forbidden",
    label: "금지 행동",
    focus: "금지 행동을 구체적으로 짚고, 왜 위험한지 이유를 댄다.",
    templates: [
      "{label} — 하면 안 되는 행동과 그 이유를 함께 말하세요.",
      "{label}. 후배가 반대로 알고 있습니다. 무엇이 잘못인지 짚어 주세요.",
      "{label} — 일반인이 해서는 안 되는 선을 그어 설명하세요.",
      "{label} — 사람들이 흔히 하는 잘못된 처치를 예로 들어 설명하세요.",
    ],
  },
  {
    key: "mistake",
    label: "흔한 실수",
    focus: "실수 유형을 구체적으로 말하고, 올바른 방법을 대비해 설명한다.",
    templates: [
      "{label} — 초보 직원이 가장 자주 틀리는 부분을 짚고 올바른 방법을 설명하세요.",
      "{label}. 지난 교육에서 틀렸던 부분이 있습니다. 무엇이며 어떻게 고쳐야 합니까?",
      "{label} — 틀리기 쉬운 지점을 두 가지 이상 말해 보세요.",
      "{label} — 잘못 알고 있으면 사고로 이어지는 부분을 집어 설명하세요.",
    ],
  },
  {
    key: "scene",
    label: "상황 적용",
    focus: "상황에 맞는 행동을 순서대로 말하고, 주변 사람에게 무엇을 요청할지 포함한다.",
    templates: [
      "{label} — 실제 영업 중 이런 상황이 생겼습니다. 어떻게 하시겠습니까?",
      "{label}. 손님이 지켜보고 있습니다. 행동과 말을 함께 설명하세요.",
      "{label} — 지금 이 자리에서 바로 해야 한다면 무엇부터 하십니까?",
      "{label} — 옆에 사람이 하나 있습니다. 그 사람에게 무엇을 시키시겠습니까?",
    ],
  },
  {
    key: "priority",
    label: "우선순위",
    focus: "무엇을 먼저 할지 순서를 정하고, 그 이유와 남에게 부탁할 일을 구분한다.",
    templates: [
      "{label} — 여러 가지가 동시에 급합니다. 무엇을 먼저 하시겠습니까?",
      "{label} — '먼저 · 다음 · 마지막'으로 나누어 설명하세요.",
      "{label}. 인원이 부족합니다. 혼자 할 일과 부탁할 일을 나눠 말하세요.",
      "{label} — 하지 말아야 할 일을 먼저 정하고, 그다음 할 일을 설명하세요.",
    ],
  },
  {
    key: "handover",
    label: "보고·인계",
    focus: "누가·언제·어디서·무엇을·어떻게(5하)를 빠뜨리지 않고 전달한다.",
    templates: [
      "{label} — 119에 무엇을 어떤 순서로 말하시겠습니까?",
      "{label} — 교대 근무자에게 인계할 내용을 정리해 말하세요.",
      "{label}. 총괄에게 보고하는 상황입니다. 한 번에 정리해 말하세요.",
      "{label} — 인수인계에서 빠지면 안 되는 항목을 말하세요.",
    ],
  },
  {
    key: "record",
    label: "기록",
    focus: "기록 항목(시간·대상·조치·경과)과 기록의 목적을 함께 말한다.",
    templates: [
      "{label} — 기록지에 무엇을 남겨야 합니까?",
      "{label}. 나중에 확인할 수 있게 남겨야 할 항목을 말하세요.",
      "{label} — 기록이 없을 때 생기는 문제를 포함해 설명하세요.",
      "{label} — 나중에 사후검토에서 확인할 수 있게 무엇을 적어 두겠습니까?",
    ],
  },
  {
    key: "equipment",
    label: "물품·장비",
    focus: "사용할 물품, 사용 전 확인 사항, 없을 때의 대안을 제시한다.",
    templates: [
      "{label} — 어떤 물품을 쓰고, 무엇을 확인한 뒤 쓰십니까?",
      "{label}. 상자에서 물품을 꺼내는 순간부터 설명하세요.",
      "{label} — 물품이 없을 때의 대안까지 말해 보세요.",
      "{label} — 물품을 쓰기 전에 유효기간·포장 상태를 어떻게 확인합니까?",
    ],
  },
  {
    key: "scope",
    label: "권한·책임",
    focus: "직원 권한의 한계와 넘겨야 하는 시점을 명확히 구분해 말한다.",
    templates: [
      "{label} — 직원이 할 수 있는 일과 ARC 대표에게 넘겨야 할 일을 나눠 설명하세요.",
      "{label}. 일반직원이 판단해도 되는 범위는 어디까지입니까?",
      "{label} — 내 권한을 넘어서는 순간은 언제입니까?",
      "{label} — 혼자 판단했다가 문제가 생기면 누구 책임이 됩니까?",
    ],
  },
];

const ANGLE_MAP = new Map(STEM_ANGLES.map((angle) => [angle.key, angle]));

// 영역마다 어울리는 각도만 씁니다(예: 물품 영역에 '119 인계'를 묻지 않습니다).
const SECTION_ANGLES = {
  SAFE: ["procedure", "reason", "judgment", "priority", "record", "scene"],
  CPR: ["procedure", "reason", "judgment", "mistake", "scene", "equipment"],
  CHOKE: ["procedure", "judgment", "forbidden", "mistake", "scene", "priority"],
  BLEED: ["procedure", "reason", "judgment", "forbidden", "scene", "equipment"],
  BURN: ["procedure", "reason", "judgment", "forbidden", "mistake", "equipment"],
  SUDDEN: ["procedure", "judgment", "forbidden", "mistake", "scene", "priority"],
  REPORT: ["record", "handover", "reason", "scope", "mistake", "priority"],
  KIT_OTC: ["equipment", "record", "scope", "reason", "judgment"],
};

const ALL_ANGLE_KEYS = STEM_ANGLES.map((angle) => angle.key);

// 질문 은행 문항은 완성된 문장이라 그대로 쓰거나, 앞뒤에 상황을 붙여 다시 묻습니다.
const QUESTION_WRAPS = [
  "{q}",
  "{q} — 이유까지 붙여 답하세요.",
  "후배가 물어봤습니다. {q}",
  "{q} 답만 말하지 말고, 그렇게 해야 하는 이유를 함께 말하세요.",
  "교육 시간입니다. {q} 설명해 주세요.",
];

const TAIL_QUESTIONS = [
  "왜 그렇게 해야 합니까? (근거 한 문장)",
  "그 판단이 틀렸다면 어떤 사고가 생깁니까?",
  "일반인이 하면 안 되는 부분은 어디이고, 누구에게 넘겨야 합니까?",
  "기록에는 무엇을 남겨야 합니까?",
  "그렇게 하지 않고 넘어가면 나중에 어떤 문제가 남습니까?",
  "옆에 신입 직원이 있습니다. 그 사람에게 무엇부터 알려 주시겠습니까?",
  "반대로 알고 있는 직원을 어떻게 설득하시겠습니까?",
  "이 상황에서 시간이 없다면 무엇을 생략하고 무엇은 생략할 수 없습니까?",
  "방금 한 판단이 틀렸다면 어느 시점에 알 수 있었습니까?",
  "총괄에게 한 문장으로 보고한다면 어떻게 말하시겠습니까?",
  "그 처치를 하지 말아야 하는 경우는 언제입니까?",
  "그 상황을 겪은 손님이 항의하면 무엇을 근거로 설명하시겠습니까?",
];

/** 문자열 → 32bit 해시. 같은 seed 면 항상 같은 순서가 나오게 합니다. */
function hashCode(input) {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createRandom(seedText) {
  let state = hashCode(seedText) || 1;

  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;

    return state / 4294967296;
  };
}

function shuffled(list, random) {
  const items = [...list];

  for (let index = items.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));

    [items[index], items[pick]] = [items[pick], items[index]];
  }

  return items;
}

function makeSeed() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;

  return `${stamp}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

/**
 * 최윤희 의견 해석.
 *   * "화상 위주로" / "CPR" / "출혈" 처럼 영역 이름이 있으면 그 영역을 먼저 뽑습니다.
 *   * "? 소화기 출혈에서 119를 부르는 기준" 처럼 ?로 시작하는 줄은 그대로 문항이 됩니다.
 */
function parseEmphasis(raw, { kind }) {
  const lines = String(raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const focus = [];
  const custom = [];

  lines.forEach((line) => {
    if (/^[?-]/.test(line)) {
      const question = line.replace(/^[?\-]\s*/, "").trim();

      if (question.length >= 5) {
        custom.push({
          key: `C${custom.length + 1}`,
          question,
          source: "총괄 지정",
        });
      }

      return;
    }

    const lowered = line.toLowerCase();
    const hit = ARC_VERBAL_SECTIONS.find((section) => {
      const label = section.label.toLowerCase();

      return (
        lowered.includes(section.key.toLowerCase()) ||
        label.includes(lowered) ||
        lowered.includes(label.replace(/^[0-9.]+\s*/, "").split(" ")[0])
      );
    });

    if (hit) {
      focus.push(hit.key);
    }
  });

  return {
    focus: [...new Set(focus)],
    custom,
    note: lines.filter((line) => !/^[?-]/.test(line)).join(" · "),
    kind,
  };
}

function renderStem(angle, item, random) {
  const templates = angle.templates;
  const picked = templates[Math.floor(random() * templates.length)];

  return picked.replace("{label}", item.label);
}

/**
 * 문항 하나의 질문 문장을 만듭니다.
 *  * aiVaried 가 켜져 있으면 각도·문장 틀·보조 표현을 모두 seed 로 새로 고릅니다.
 *  * 꺼져 있으면 index 기준으로 고정해 같은 문장이 재현되게 합니다.
 */
function pickStem(item, sectionKey, { random, index, aiVaried, usedAngles }) {
  const allowed = SECTION_ANGLES[sectionKey] ?? ALL_ANGLE_KEYS;
  let angleKey;

  if (aiVaried) {
    // 같은 영역 안에서 각도가 겹치지 않게 먼저 걸러 냅니다.
    const fresh = allowed.filter((key) => !usedAngles.has(key));
    const pool = fresh.length ? fresh : allowed;

    angleKey = pool[Math.floor(random() * pool.length)];
  } else {
    angleKey = allowed[index % allowed.length];
  }

  usedAngles.add(angleKey);

  const angle = ANGLE_MAP.get(angleKey);
  const primary = renderStem(angle, item, random);
  const secondary = renderStem(angle, item, random);
  const askList = Array.isArray(item.ask) ? item.ask.filter(Boolean) : [];
  const useAsk = aiVaried
    ? askList.length > 0 && random() < 0.3
    : askList.length > 0 && index % 4 === 3;
  const question = useAsk
    ? askList[Math.floor(random() * askList.length)]
    : primary;

  return {
    question,
    alt: useAsk ? primary : secondary,
    angle,
  };
}

function pickTail(random, aiVaried, index) {
  const at = aiVaried
    ? Math.floor(random() * TAIL_QUESTIONS.length)
    : index % TAIL_QUESTIONS.length;

  return TAIL_QUESTIONS[at];
}

function buildRow(
  section,
  item,
  { mode, random, index, aiVaried = true, usedAngles = new Set() }
) {
  const { question, alt, angle } = pickStem(item, section.key, {
    random,
    index,
    aiVaried,
    usedAngles,
  });
  const tail = pickTail(random, aiVaried, index);

  const row = {
    key: `${section.key}:${item.key}`,
    sectionKey: section.key,
    sectionLabel: section.label,
    label: item.label,
    question,
    points: Number(item.points ?? 0),
    critical: item.critical === true,
  };

  if (mode === "EXAM") {
    return row;
  }

  return {
    ...row,
    // 화면에서 보조 문장으로 띄우는 다른 표현 (교육자용에서만 씁니다)
    altQuestion: alt,
    angle: angle.key,
    angleLabel: angle.label,
    // 이 각도로 물었을 때 답에 꼭 들어가야 하는 것
    answerFocus: angle.focus,
    tail,
    answer: item.answer ?? "",
    criteria: item.criteria ?? { perform: "", partial: "", none: "" },
    basis: item.basis ?? "",
    wrong: item.wrong ?? "",
  };
}

function buildQuestionRow(question, { mode, random, index, kind, aiVaried = true }) {
  const prefix = kind === "SURPRISE" ? "즉답" : "심화";
  const wrapped = QUESTION_WRAPS[Math.floor(random() * QUESTION_WRAPS.length)]
    .replace("{q}", question.q)
    .trim();
  const tail = pickTail(random, aiVaried, index);

  const row = {
    key: question.key,
    sectionKey: "BANK",
    sectionLabel: "질문 은행",
    label: `${prefix} · ${question.tag}`,
    question: wrapped,
    points: kind === "SURPRISE" ? 5 : 10,
    critical: false,
  };

  if (mode === "EXAM") {
    return row;
  }

  return {
    ...row,
    altQuestion: wrapped === question.q ? "" : question.q,
    angle: "bank",
    angleLabel: prefix,
    answerFocus: "결론을 먼저 말하고, 그 근거와 예외 상황까지 덧붙인다.",
    tail,
    answer: question.a ?? "",
    criteria: {
      perform: "핵심 단어를 포함해 스스로 완전한 문장으로 답한다.",
      partial: "방향은 맞지만 핵심 근거가 빠지거나 말끝이 흐려진다.",
      none: "답하지 못하거나 반대로 위험한 답을 한다.",
    },
    basis: question.a ?? "",
    wrong: question.wrong ?? "",
  };
}

function customRow(custom, { mode, index, random, aiVaried = true }) {
  const tail = pickTail(random, aiVaried, index);
  const row = {
    key: custom.key,
    sectionKey: "CUSTOM",
    sectionLabel: "총괄 지정 문항",
    label: "총괄 지정",
    question: custom.question,
    points: 10,
    critical: false,
  };

  if (mode === "EXAM") {
    return row;
  }

  return {
    ...row,
    altQuestion: "",
    angle: "custom",
    angleLabel: "총괄 지정",
    answerFocus: "총괄이 기대한 핵심 요소를 모두 담아 답한다.",
    tail,
    answer: "",
    criteria: {
      perform: "총괄이 기대한 핵심 요소를 모두 말한다.",
      partial: "일부만 말한다.",
      none: "답하지 못한다.",
    },
    basis: "총괄이 직접 지정한 문항입니다. 채점 기준을 확인하고 인쇄해 주세요.",
    wrong: "",
  };
}

/**
 * 시험지/교육자용 자료 한 부를 만듭니다.
 * mode: EXAM | TEACHER
 * kind: SURPRISE | REGULAR
 */
export function buildArcVerbalPaper({
  kind = "REGULAR",
  mode = "EXAM",
  seed = "",
  emphasis = "",
  targetName = "",
  reviewer = "",
  aiVaried = true,
} = {}) {
  const kindKey = String(kind).toUpperCase();
  const modeKey = String(mode).toUpperCase();

  if (!KIND_MAP.has(kindKey)) {
    throw badRequest("구두시험 종류는 불시(SURPRISE)·정규(REGULAR) 중에서 골라 주세요.");
  }

  if (!MODE_KEYS.has(modeKey)) {
    throw badRequest("출력 종류는 시험지(EXAM)·교육자용(TEACHER) 중에서 골라 주세요.");
  }

  const kindInfo = KIND_MAP.get(kindKey);
  const effectiveSeed = String(seed ?? "").trim() || makeSeed();
  const random = aiVaried ? createRandom(effectiveSeed) : () => 0.5;
  const plan = parseEmphasis(emphasis, { kind: kindKey });

  const flattened = ARC_VERBAL_SECTIONS.flatMap((section) =>
    section.items.map((item) => ({ section, item }))
  );

  const rows = [];

  if (kindKey === "SURPRISE") {
    // 불시: 핵심술기(critical) 중에서 5문항. 총괄이 지목한 영역이 있으면 그쪽을 먼저 씁니다.
    const criticalPool = shuffled(
      flattened.filter((entry) => entry.item.critical),
      random
    );
    const favoured = criticalPool.filter((entry) => plan.focus.includes(entry.section.key));
    const rest = criticalPool.filter((entry) => !plan.focus.includes(entry.section.key));
    const picked = [...favoured, ...rest].slice(0, 5);
    const usedAngles = new Set();

    picked.forEach((entry, index) => {
      rows.push(
        buildRow(entry.section, entry.item, {
          mode: modeKey,
          random,
          index,
          aiVaried,
          usedAngles,
        })
      );
    });

    const bankPool = shuffled(ARC_VERBAL_QUESTIONS, random);
    rows.push(
      buildQuestionRow(bankPool[0], {
        mode: modeKey,
        random,
        index: 0,
        kind: kindKey,
        aiVaried,
      })
    );
  } else {
    // 정규: 8개 영역에서 2문항씩 = 16문항. 영역 순서는 그대로 두고 문항·각도만 새로 고릅니다.
    ARC_VERBAL_SECTIONS.forEach((section) => {
      const pool = shuffled(section.items, random);
      const preferred = plan.focus.includes(section.key) ? 3 : 2;
      const usedAngles = new Set();

      pool.slice(0, preferred).forEach((item, index) => {
        rows.push(
          buildRow(section, item, {
            mode: modeKey,
            random,
            index,
            aiVaried,
            usedAngles,
          })
        );
      });
    });

    const bankPool = shuffled(ARC_VERBAL_QUESTIONS, random);

    bankPool.slice(0, 3).forEach((question, index) => {
      rows.push(
        buildQuestionRow(question, {
          mode: modeKey,
          random,
          index,
          kind: kindKey,
          aiVaried,
        })
      );
    });
  }

  plan.custom.forEach((custom, index) => {
    rows.push(customRow(custom, { mode: modeKey, index, random, aiVaried }));
  });

  rows.forEach((row, index) => {
    row.no = index + 1;
  });

  const totalPoints = rows.reduce((sum, row) => sum + row.points, 0);
  const criticalCount = rows.filter((row) => row.critical).length;

  // 교육자용에서 "이번 시험은 절차 6 · 이유 5 · 판단 4 …" 처럼 한눈에 보여 줍니다.
  const angleSummary = [];
  rows.forEach((row) => {
    const label = row.angleLabel;

    if (!label) return;

    const found = angleSummary.find((item) => item.label === label);

    if (found) found.count += 1;
    else angleSummary.push({ label, count: 1 });
  });

  return {
    kind: kindKey,
    kindLabel: kindInfo.label,
    kindShort: kindInfo.short,
    mode: modeKey,
    modeLabel: ARC_VERBAL_PAPER_MODES.find((item) => item.key === modeKey).label,
    seed: effectiveSeed,
    aiVaried: aiVaried !== false,
    generatedAt: new Date().toISOString(),
    header: {
      title:
        modeKey === "EXAM"
          ? `${kindInfo.label} 문제지`
          : `${kindInfo.label} 교육자용 · 답안지 · 평가표`,
      subtitle: kindInfo.desc,
      targetName: String(targetName ?? "").trim(),
      reviewer: String(reviewer ?? "").trim(),
      minutes: kindInfo.minutes,
      cutline: kindInfo.cutline,
      totalPoints,
      questionCount: rows.length,
      criticalCount,
      emphasis: plan.note.slice(0, 300),
      seed: effectiveSeed,
    },
    // 이번 시험지가 어떤 각도로 몇 문항씩 물었는지(교육자용 요약에 씁니다).
    angleSummary: modeKey === "TEACHER" ? angleSummary : [],
    // 교육자용에서만 채점 규칙을 내려 줍니다(시험지에는 넣지 않습니다).
    verdictRules:
      modeKey === "TEACHER"
        ? {
            cutline: kindInfo.cutline,
            rules: [
              `총점 ${kindInfo.cutline}% 이상이면 통과입니다.`,
              kindKey === "SURPRISE"
                ? "핵심술기(critical) 문항에서 '미수행'이 하나라도 있으면 총점과 관계없이 재교육입니다."
                : "핵심술기(critical) 문항에서 '미수행'이 2개 이상이면 총점과 관계없이 재교육입니다.",
              "위험한 답(금지 행동)을 말하면 그 문항은 0점 처리하고 즉시 그 자리에서 바로잡습니다.",
              "결과는 통과·보충 필요·재교육 중 하나로 남기고, 보충·재교육은 14일 안에 다시 봅니다.",
            ],
          }
        : null,
    customQuestions: plan.custom.map((item) => item.question),
    sections: ARC_VERBAL_SECTIONS.map((section) => ({
      key: section.key,
      label: section.label,
      desc: section.desc,
      minutes: section.minutes,
      rows: rows.filter((row) => row.sectionKey === section.key),
    })).filter((section) => section.rows.length > 0),
    bankRows: rows.filter((row) => row.sectionKey === "BANK"),
    customRows: rows.filter((row) => row.sectionKey === "CUSTOM"),
    totals: {
      questionCount: rows.length,
      totalPoints,
      criticalCount,
      minutes: kindInfo.minutes,
      cutline: kindInfo.cutline,
    },
  };
}

/** 화면 상단에 띄우는 안내. */
export function arcVerbalPaperCatalog() {
  return {
    kinds: ARC_VERBAL_PAPER_KINDS,
    modes: ARC_VERBAL_PAPER_MODES,
    tips: [
      "인쇄할 때마다 문제 순서와 표현이 새로 바뀝니다. 같은 시험지를 다시 뽑으려면 '시드 고정'을 켜세요.",
      "'의견' 칸에 영역 이름(예: 화상, CPR, 출혈)을 적으면 그 영역에서 더 많이 출제됩니다.",
      "'의견' 칸에 ?로 시작하는 줄을 적으면 그 문장이 그대로 문항으로 들어갑니다.",
      "시험지(문제지)에는 답이 없습니다. 채점은 교육자용(답안지·평가표)으로 하세요.",
      "교육자용·시험지는 ARC 대표(RN)만 인쇄할 수 있습니다.",
    ],
  };
}

export const ARC_VERBAL_PAPER_TYPES = {
  SURPRISE_SCREEN: "불시 · 실시",
  REGULAR_SCREEN: "정규 · 실시",
  SURPRISE_EXAM: "불시 · 시험지 인쇄",
  REGULAR_EXAM: "정규 · 시험지 인쇄",
  SURPRISE_TEACHER: "불시 · 교육자용",
  REGULAR_TEACHER: "정규 · 교육자용",
};
