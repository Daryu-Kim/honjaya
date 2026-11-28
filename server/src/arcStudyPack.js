// P14S — 구두시험 「족보 교육자료」 (ARC 대표(RN) 전용).
//
// 최윤희 대표가 시험지를 뽑은 뒤, 시험 문항과 8개 영역 전체 지식을 한 부로 묶어
// 교육자료로 인쇄할 수 있게 만듭니다.
//
// 문제는 buildArcVerbalPaper 를 그대로 재사용하므로, 같은 seed 를 넣으면
// 시험지와 족보의 문항이 정확히 일치합니다.

import { collectArcTerms } from "./arcGlossary.js";
import { ARC_VERBAL_QUESTIONS, ARC_VERBAL_SECTIONS } from "./arcVerbal.js";
import { verbalDeep } from "./arcVerbalDeep.js";
import { buildArcVerbalPaper } from "./arcVerbalPaper.js";

// 응시자 전용(공부용)과 교육자 전용(채점용)을 나눕니다.
//  * CANDIDATE : 이번 시험에 무엇이 나오는지 알 수 없게 시험 문항 장을 아예 넣지 않고,
//                8개 영역 전체 지식을 자세히 풀어 쓴 공부용 자료만 만듭니다.
//  * TEACHER   : 이번 시험 문항 + 자세한 정답 해설 + 채점 기준표 + 판정 규칙.
export const ARC_STUDY_PACK_AUDIENCES = [
  {
    key: "CANDIDATE",
    label: "족보 · 응시자 전용",
    desc: "공부용 지식 교육자료 (시험 문항·채점표 없음)",
  },
  {
    key: "TEACHER",
    label: "족보 · 교육자 전용",
    desc: "이번 시험 정답 해설 · 채점 기준표 · 판정 규칙",
  },
];

function normalizeAudience(audience) {
  const key = String(audience ?? "").trim().toUpperCase();

  return key === "CANDIDATE" ? "CANDIDATE" : "TEACHER";
}

function rowToStudy(row, { includeCriteria = true } = {}) {
  const deep = verbalDeep(row.key);
  const mapped = {
    no: row.no,
    key: row.key,
    sectionKey: row.sectionKey,
    sectionLabel: row.sectionLabel,
    label: row.label,
    question: row.question,
    altQuestion: row.altQuestion ?? "",
    points: row.points,
    critical: row.critical === true,
    answer: row.answer ?? "",
    basis: row.basis ?? "",
    wrong: row.wrong ?? "",
    tail: row.tail ?? "",
    detail: deep.detail,
    scene: deep.scene,
    remember: deep.remember,
  };

  if (includeCriteria) {
    mapped.criteria = row.criteria ?? { perform: "", partial: "", none: "" };
    // 채점할 때 귀에 들어와야 하는 한 줄(수행 기준 그대로).
    mapped.scoreTip = row.criteria?.perform ?? "";
    return mapped;
  }

  // 응시자용은 채점표 대신 '자주 하는 실수'로 바꿔서 보여 줍니다.
  mapped.mistakes = [row.criteria?.partial, row.criteria?.none]
    .filter(Boolean)
    .join(" / ");

  return mapped;
}

/**
 * 족보 교육자료 한 부를 만듭니다.
 * kind/mode/seed/emphasis 의미는 시험지 생성기와 같습니다.
 */
export function buildArcStudyPack({
  kind = "REGULAR",
  seed = "",
  emphasis = "",
  targetName = "",
  reviewer = "",
  includeAllKnowledge = true,
  aiVaried = true,
  audience = "TEACHER",
} = {}) {
  const audienceKey = normalizeAudience(audience);
  const includeCriteria = audienceKey === "TEACHER";

  // TEACHER 모드로 뽑아야 모범답안·채점기준·이론근거가 함께 나옵니다.
  const paper = buildArcVerbalPaper({
    kind,
    mode: "TEACHER",
    seed,
    emphasis,
    targetName,
    reviewer,
    aiVaried,
  });

  // 응시자 전용은 이번 시험 문항을 아예 담지 않습니다(무엇이 나오는지 알 수 없게).
  const examRows = includeCriteria
    ? [
        ...paper.sections.flatMap((section) => section.rows),
        ...paper.bankRows,
        ...paper.customRows,
      ]
        .sort((a, b) => a.no - b.no)
        .map((row) => rowToStudy(row, { includeCriteria }))
    : [];

  const knowledgeSections = includeAllKnowledge
    ? ARC_VERBAL_SECTIONS.map((section) => ({
        key: section.key,
        label: section.label,
        desc: section.desc,
        minutes: section.minutes,
        items: section.items.map((item) => {
          const deep = verbalDeep(`${section.key}:${item.key}`);
          const mapped = {
            key: item.key,
            label: item.label,
            points: Number(item.points ?? 0),
            critical: item.critical === true,
            basis: item.basis ?? "",
            answer: item.answer ?? "",
            wrong: item.wrong ?? "",
            detail: deep.detail,
            scene: deep.scene,
            remember: deep.remember,
            ask: Array.isArray(item.ask) ? item.ask.filter(Boolean) : [],
          };

          if (includeCriteria) {
            mapped.criteria = item.criteria ?? {
              perform: "",
              partial: "",
              none: "",
            };
            mapped.scoreTip = item.criteria?.perform ?? "";
          } else {
            mapped.mistakes = [item.criteria?.partial, item.criteria?.none]
              .filter(Boolean)
              .join(" / ");
          }

          return mapped;
        }),
      }))
    : [];

  // "★이번 시험" 배지는 교육자 전용에서만 씁니다(응시자 전용은 시험 정보를 숨깁니다).
  const examKeys = new Set(examRows.map((row) => row.key));

  knowledgeSections.forEach((section) => {
    section.items.forEach((item) => {
      item.onExam =
        includeCriteria && examKeys.has(`${section.key}:${item.key}`);
    });
  });

  const bank = ARC_VERBAL_QUESTIONS.map((question) => {
    const deep = verbalDeep(question.key);

    return {
      key: question.key,
      tag: question.tag,
      level: question.level ?? "",
      question: question.q,
      answer: question.a ?? "",
      wrong: question.wrong ?? "",
      detail: deep.detail,
      remember: deep.remember,
      onExam: includeCriteria && examKeys.has(question.key),
    };
  });

  const glossaryTexts = [
    ...examRows.flatMap((row) => [
      row.question,
      row.answer,
      row.basis,
      row.criteria?.perform ?? "",
    ]),
    ...knowledgeSections.flatMap((section) =>
      section.items.flatMap((item) => [
        item.label,
        item.answer,
        item.basis,
        item.detail,
      ])
    ),
    ...bank.map((item) => `${item.question} ${item.answer} ${item.detail}`),
  ];
  const glossary = collectArcTerms(glossaryTexts);

  const isTeacherPack = audienceKey === "TEACHER";

  const totals = {
    examCount: examRows.length,
    examPoints: examRows.reduce((sum, row) => sum + row.points, 0),
    criticalCount: examRows.filter((row) => row.critical).length,
    knowledgeCount: knowledgeSections.reduce((sum, section) => sum + section.items.length, 0),
    bankCount: bank.length,
    glossaryCount: glossary.length,
    minutes: isTeacherPack ? paper.header.minutes : 0,
    cutline: isTeacherPack ? paper.header.cutline : 0,
  };

  return {
    kind: paper.kind,
    kindLabel: paper.kindLabel,
    kindShort: paper.kindShort,
    audience: audienceKey,
    audienceLabel: isTeacherPack ? "족보 · 교육자 전용" : "족보 · 응시자 전용",
    seed: paper.seed,
    seedLabel: isTeacherPack ? "시험지 번호" : "자료 번호",
    generatedAt: paper.generatedAt,
    header: {
      title: isTeacherPack
        ? `${paper.kindLabel} 족보 · 교육자 전용`
        : "족보 · 응시자 전용 (지식 교육자료)",
      subtitle: isTeacherPack
        ? "이번 시험 문제와 그 주변 지식을 함께 정리한 교육자용 자료입니다. 문제 → 모범답안 → 자세한 해설 → 채점기준 순서로 읽으면 그대로 채점이 됩니다."
        : "8개 영역 전체를 공부용으로 자세히 정리한 자료입니다. 이번 시험에 어떤 문항이 나오는지는 이 자료에 담겨 있지 않으니, 전체를 고르게 읽고 스스로 답해 보세요.",
      targetName: paper.header.targetName,
      reviewer: paper.header.reviewer,
      minutes: isTeacherPack ? paper.header.minutes : 0,
      cutline: isTeacherPack ? paper.header.cutline : 0,
      emphasis: isTeacherPack ? paper.header.emphasis : "",
      seed: paper.seed,
    },
    examSectionTitle: isTeacherPack
      ? "1. 이번 시험 문항 (문제 · 모범답안 · 자세한 해설 · 채점기준)"
      : "",
    examSectionHint: isTeacherPack ? "시험지와 같은 번호입니다." : "",
    chapterLabels: isTeacherPack
      ? {
          knowledge: "2. 8개 영역 전체 지식",
          bank: "3. 질문 은행 (즉답 · 심화)",
          glossary: "4. 어려운 말 풀이 (일반인 기준)",
        }
      : {
          knowledge: "1. 8개 영역 전체 지식 (자세히)",
          bank: "2. 질문 은행 — 스스로 점검",
          glossary: "3. 어려운 말 풀이 (일반인 기준)",
        },
    totals,
    exam: examRows,
    sections: knowledgeSections,
    bank,
    glossary,
    checklist: isTeacherPack
      ? [
          "인쇄 전에 시드(seed)를 확인하세요. 같은 시드를 쓰면 시험지와 족보의 문항이 정확히 같습니다.",
          "응시자에게 나눠 줄 때는 시험지(문제지)나 응시자 전용 족보만 주세요. 교육자용은 주지 마세요.",
          "족보에는 답이 그대로 들어 있습니다. 시험 전에 응시자에게 넘어가지 않게 보관하세요.",
          `커트라인은 ${paper.header.cutline}%입니다. 핵심술기 '미수행'은 총점과 관계없이 재교육 대상입니다.`,
          "교육자료는 ARC 대표(RN)만 인쇄할 수 있습니다.",
        ]
      : [
          "이 자료에는 이번 시험에 나오는 문항이 없습니다. 8개 영역을 순서대로 읽으며 스스로 답해 보세요.",
          "'자세히 알기'와 '혼자야에서는 이렇게 생깁니다'를 함께 읽으면 상황이 기억에 남습니다.",
          "각 항목의 '한 줄 정리'만 모아서 시험 전날 다시 읽어도 좋습니다.",
          "모르는 말이 나오면 3번 '어려운 말 풀이'를 먼저 확인하세요.",
          "출력·보관은 ARC 대표(RN)만 합니다. 받은 자료는 시험 전날까지 보고 필요 없어지면 돌려주세요.",
        ],
    footerNote: isTeacherPack
      ? "족보 교육자료에는 정답과 채점기준이 들어 있습니다. 시험 전 응시자에게 넘어가지 않게 보관하고, 필요 없어지면 파쇄해 주세요."
      : "응시자 학습용 자료입니다. 이 자료에는 이번 시험에 나오는 문항과 채점 기준표가 들어 있지 않습니다.",
    verdictRules: isTeacherPack ? paper.verdictRules : null,
  };
}
