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

// 문제 표현을 조금씩 바꿔 주는 틀. 같은 항목이라도 매번 다른 말투로 나갑니다.
const STEM_TEMPLATES = {
  SURPRISE: [
    "{label} — 지금 바로, 한 문장으로 어떻게 하시겠습니까?",
    "갑자기 상황이 생겼습니다. {label} 절차를 순서대로 말해 보세요.",
    "{label}. 옆에서 후배가 지켜보고 있습니다. 무엇부터 하십니까?",
  ],
  REGULAR: [
    "{label} — 절차와 이유를 함께 설명하세요.",
    "{label}에서 초보 직원이 자주 틀리는 부분을 짚고, 올바른 방법을 설명하세요.",
    "{label} — 판단 기준과 금지 행동을 구분해서 설명하세요.",
  ],
};

const TAIL_QUESTIONS = [
  "왜 그렇게 해야 합니까? (근거 한 문장)",
  "그 판단이 틀렸다면 어떤 사고가 생깁니까?",
  "일반인이 하면 안 되는 부분은 어디이고, 누구에게 넘겨야 합니까?",
  "기록에는 무엇을 남겨야 합니까?",
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

function pickStem(item, templates, random, index) {
  const askList = Array.isArray(item.ask) ? item.ask.filter(Boolean) : [];
  const template = templates[index % templates.length];
  const stem = template.replace("{label}", item.label);

  if (askList.length === 0) {
    return [stem];
  }

  // 상황 제시형 ask 와 새로 만든 표현을 번갈아 씁니다.
  const useAsk = Math.floor(random() * (askList.length + 1)) === 0;

  return useAsk ? [askList[Math.floor(random() * askList.length)], stem] : [stem];
}

function buildRow(section, item, { mode, random, index, kind }) {
  const templates = STEM_TEMPLATES[kind] ?? STEM_TEMPLATES.REGULAR;
  const prompts = pickStem(item, templates, random, index);
  const tail = TAIL_QUESTIONS[Math.floor(random() * TAIL_QUESTIONS.length)];
  const question = prompts[0];

  const row = {
    key: `${section.key}:${item.key}`,
    sectionKey: section.key,
    sectionLabel: section.label,
    label: item.label,
    question,
    // 화면에서 보조 문장으로 띄우는 표현 (교육자용에서만 씁니다)
    altQuestion: prompts[1] ?? "",
    points: Number(item.points ?? 0),
    critical: item.critical === true,
  };

  if (mode === "EXAM") {
    return row;
  }

  return {
    ...row,
    tail,
    answer: item.answer ?? "",
    criteria: item.criteria ?? { perform: "", partial: "", none: "" },
    basis: item.basis ?? "",
    wrong: item.wrong ?? "",
  };
}

function buildQuestionRow(question, { mode, random, index, kind }) {
  const prefix = kind === "SURPRISE" ? "즉답" : "심화";

  const row = {
    key: question.key,
    sectionKey: "BANK",
    sectionLabel: "질문 은행",
    label: `${prefix} · ${question.tag}`,
    question: question.q,
    altQuestion: "",
    points: kind === "SURPRISE" ? 5 : 10,
    critical: false,
  };

  if (mode === "EXAM") {
    return row;
  }

  return {
    ...row,
    tail: TAIL_QUESTIONS[index % TAIL_QUESTIONS.length],
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

function customRow(custom, { mode, index }) {
  const row = {
    key: custom.key,
    sectionKey: "CUSTOM",
    sectionLabel: "총괄 지정 문항",
    label: "총괄 지정",
    question: custom.question,
    altQuestion: "",
    points: 10,
    critical: false,
  };

  if (mode === "EXAM") {
    return row;
  }

  return {
    ...row,
    tail: TAIL_QUESTIONS[index % TAIL_QUESTIONS.length],
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

    picked.forEach((entry, index) => {
      rows.push(buildRow(entry.section, entry.item, { mode: modeKey, random, index, kind: kindKey }));
    });

    const bankPool = shuffled(ARC_VERBAL_QUESTIONS, random);
    rows.push(
      buildQuestionRow(bankPool[0], { mode: modeKey, random, index: 0, kind: kindKey })
    );
  } else {
    // 정규: 8개 영역에서 2문항씩 = 16문항. 영역 순서는 그대로 두고 문항만 새로 고릅니다.
    ARC_VERBAL_SECTIONS.forEach((section) => {
      const pool = shuffled(section.items, random);
      const preferred = plan.focus.includes(section.key) ? 3 : 2;

      pool.slice(0, preferred).forEach((item, index) => {
        rows.push(buildRow(section, item, { mode: modeKey, random, index, kind: kindKey }));
      });
    });

    const bankPool = shuffled(ARC_VERBAL_QUESTIONS, random);

    bankPool.slice(0, 3).forEach((question, index) => {
      rows.push(
        buildQuestionRow(question, { mode: modeKey, random, index, kind: kindKey })
      );
    });
  }

  plan.custom.forEach((custom, index) => {
    rows.push(customRow(custom, { mode: modeKey, index }));
  });

  rows.forEach((row, index) => {
    row.no = index + 1;
  });

  const totalPoints = rows.reduce((sum, row) => sum + row.points, 0);
  const criticalCount = rows.filter((row) => row.critical).length;

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
