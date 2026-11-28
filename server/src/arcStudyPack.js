// P14S — 구두시험 「족보 교육자료」 (ARC 대표(RN) 전용).
//
// 최윤희 대표가 시험지를 뽑은 뒤, 그 시험에 나오는 문제 + 그 주변 지식을 한 부로 묶어
// 교육자료로 인쇄할 수 있게 만듭니다.
//   * 시험 문항(문제 + 모범답안 + 수행/부분수행/미수행 기준 + 이론 근거 + 자주 틀리는 답)
//   * 8개 영역 전체 지식(이번 시험에 안 나온 문항까지) — "왜 그렇게 하는지"까지
//   * 질문 은행(즉답·심화) 전체
//   * 어려운 용어 풀이(일반인 기준)
//   * 인쇄 전 확인 체크리스트
//
// 문제는 buildArcVerbalPaper 를 그대로 재사용하므로, 같은 seed 를 넣으면
// 시험지와 족보의 문항이 정확히 일치합니다.

import { collectArcTerms } from "./arcGlossary.js";
import { ARC_VERBAL_QUESTIONS, ARC_VERBAL_SECTIONS } from "./arcVerbal.js";
import { buildArcVerbalPaper } from "./arcVerbalPaper.js";

function rowToStudy(row) {
  return {
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
    criteria: row.criteria ?? { perform: "", partial: "", none: "" },
    basis: row.basis ?? "",
    wrong: row.wrong ?? "",
    tail: row.tail ?? "",
  };
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
} = {}) {
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

  const examRows = [...paper.sections.flatMap((section) => section.rows), ...paper.bankRows, ...paper.customRows]
    .sort((a, b) => a.no - b.no)
    .map(rowToStudy);

  const knowledgeSections = includeAllKnowledge
    ? ARC_VERBAL_SECTIONS.map((section) => ({
        key: section.key,
        label: section.label,
        desc: section.desc,
        minutes: section.minutes,
        items: section.items.map((item) => ({
          key: item.key,
          label: item.label,
          points: Number(item.points ?? 0),
          critical: item.critical === true,
          criteria: item.criteria ?? { perform: "", partial: "", none: "" },
          basis: item.basis ?? "",
          answer: item.answer ?? "",
          wrong: item.wrong ?? "",
          ask: Array.isArray(item.ask) ? item.ask.filter(Boolean) : [],
        })),
      }))
    : [];

  // 이번 시험에 실제로 나온 문항 표시(교육자료에서 "★이번 시험" 배지로 씁니다).
  const examKeys = new Set(examRows.map((row) => row.key));

  knowledgeSections.forEach((section) => {
    section.items.forEach((item) => {
      item.onExam = examKeys.has(`${section.key}:${item.key}`);
    });
  });

  const bank = ARC_VERBAL_QUESTIONS.map((question) => ({
    key: question.key,
    tag: question.tag,
    level: question.level ?? "",
    question: question.q,
    answer: question.a ?? "",
    wrong: question.wrong ?? "",
    onExam: examKeys.has(question.key),
  }));

  const glossaryTexts = [
    ...examRows.flatMap((row) => [row.question, row.answer, row.basis, row.criteria.perform]),
    ...knowledgeSections.flatMap((section) =>
      section.items.flatMap((item) => [item.label, item.answer, item.basis])
    ),
    ...bank.map((item) => `${item.question} ${item.answer}`),
  ];
  const glossary = collectArcTerms(glossaryTexts);

  const totals = {
    examCount: examRows.length,
    examPoints: examRows.reduce((sum, row) => sum + row.points, 0),
    criticalCount: examRows.filter((row) => row.critical).length,
    knowledgeCount: knowledgeSections.reduce((sum, section) => sum + section.items.length, 0),
    bankCount: bank.length,
    glossaryCount: glossary.length,
    minutes: paper.header.minutes,
    cutline: paper.header.cutline,
  };

  return {
    kind: paper.kind,
    kindLabel: paper.kindLabel,
    kindShort: paper.kindShort,
    seed: paper.seed,
    generatedAt: paper.generatedAt,
    header: {
      title: `${paper.kindLabel} 족보 교육자료`,
      subtitle:
        "이번 시험 문제와 그 주변 지식을 함께 정리한 교육자료입니다. 문제 → 모범답안 → 채점기준 → 이론 근거 순서로 읽으면 그대로 공부가 됩니다.",
      targetName: paper.header.targetName,
      reviewer: paper.header.reviewer,
      minutes: paper.header.minutes,
      cutline: paper.header.cutline,
      emphasis: paper.header.emphasis,
      seed: paper.seed,
    },
    totals,
    exam: examRows,
    sections: knowledgeSections,
    bank,
    glossary,
    checklist: [
      "인쇄 전에 시드(seed)를 확인하세요. 같은 시드를 쓰면 시험지와 족보의 문항이 정확히 같습니다.",
      "응시자에게 나눠 줄 때는 시험지(문제지)만, 채점용은 교육자용(답안지·평가표)만 인쇄하세요.",
      "족보에는 답이 그대로 들어 있습니다. 시험 전에 응시자에게 넘어가지 않게 보관하세요.",
      `커트라인은 ${paper.header.cutline}%입니다. 핵심술기 '미수행'은 총점과 관계없이 재교육 대상입니다.`,
      "교육자료는 ARC 대표(RN)만 인쇄할 수 있습니다.",
    ],
    verdictRules: paper.verdictRules,
  };
}
