<template>
  <section class="arc-exam-print-panel">
    <header class="panel-head no-print">
      <div class="panel-head-text">
        <h2>시험지 · 교육자용 · 족보 교육자료 출력</h2>
        <p class="helper-text">
          뽑을 때마다 문제 순서와 표현이 새로 바뀝니다. 같은 시험지를 다시
          뽑으려면
          <strong>시드</strong>를 그대로 두세요. 족보는 같은 시드로 뽑으면 이번
          시험 문항과 정확히 같은 문제로 교육자료가 만들어집니다. 자료와 시험
          종류는 <strong>여러 개를 함께 골라</strong> 한 번에 인쇄할 수 있고, 한
          부씩 페이지가 나뉩니다.
        </p>
      </div>
      <span class="director-badge">ARC 대표(RN) 전용</span>
    </header>

    <div class="control-panel no-print">
      <div class="control-block wide">
        <span class="control-label">1. 출력할 자료 (여러 개 선택 가능)</span>
        <div class="choice-row">
          <button
            v-for="item in OUTPUTS"
            :key="item.key"
            type="button"
            class="choice-button"
            :class="{ active: form.outputs.includes(item.key) }"
            @click="toggleOutput(item.key)"
          >
            <span class="choice-check">{{
              form.outputs.includes(item.key) ? "✓" : "+"
            }}</span>
            <strong>{{ item.label }}</strong>
            <small>{{ item.desc }}</small>
          </button>
        </div>
        <small class="control-hint">
          시험지·교육자용·족보(응시자 전용)·족보(교육자 전용)를 한 번에 뽑아도
          됩니다. 최소 한 개는 선택해야 해요.
        </small>
      </div>

      <div class="control-block">
        <span class="control-label">2. 시험 종류 (여러 개 선택 가능)</span>
        <div class="choice-row compact">
          <button
            v-for="kind in kinds"
            :key="kind.key"
            type="button"
            class="choice-button"
            :class="{ active: form.kinds.includes(kind.key) }"
            @click="toggleKind(kind.key)"
          >
            <span class="choice-check">{{
              form.kinds.includes(kind.key) ? "✓" : "+"
            }}</span>
            <strong>{{ kind.label }}</strong>
            <small>{{ kind.minutes }}분 · 커트라인 {{ kind.cutline }}%</small>
          </button>
        </div>
        <small class="control-hint">
          불시·정규를 함께 선택하면 두 시험지가 모두 나옵니다(같은 시험지 번호).
        </small>
      </div>

      <div class="control-block">
        <label class="field">
          <span>응시자 이름 (선택)</span>
          <input
            v-model="form.targetName"
            type="text"
            maxlength="40"
            placeholder="비우면 빈칸으로 인쇄"
          />
        </label>
        <label class="field">
          <span>시드 (시험지 번호)</span>
          <input
            v-model="form.seed"
            type="text"
            maxlength="40"
            placeholder="비우면 매번 새로 뽑기"
          />
        </label>
        <label class="switch-row">
          <input v-model="form.aiVaried" type="checkbox" />
          <span>AI가 문제를 바꿔서 출제</span>
        </label>
      </div>

      <div class="control-block wide">
        <span class="control-label">3. 내 의견 (선택)</span>
        <textarea
          v-model="form.emphasis"
          rows="4"
          maxlength="600"
          placeholder="예) 화상·출혈 위주로 내고, CPR은 꼬리질문 강하게.&#10;? 손님이 술에 취해 넘어졌습니다. 직원이 가장 먼저 할 일은?"
        ></textarea>
        <small class="control-hint">
          영역 이름(화상, CPR, 출혈, 기도폐쇄, 실신 …)을 적으면 그 영역에서 더
          많이 나옵니다. <code>?</code> 또는 <code>-</code>로 시작하는 줄은
          그대로 문항이 됩니다.
        </small>
      </div>

      <div class="action-row">
        <button
          type="button"
          class="primary-button"
          :disabled="isLoading"
          @click="shuffle"
        >
          새로 뽑기
        </button>
        <button
          type="button"
          class="mini-button"
          :disabled="isLoading"
          @click="load()"
        >
          그대로 다시 불러오기
        </button>
        <button
          type="button"
          class="mini-button"
          :disabled="!ready"
          @click="printPaper"
        >
          인쇄 / PDF 저장
        </button>
        <span v-if="form.seed" class="seed-chip"
          >시험지 번호 {{ form.seed }}</span
        >
        <span v-if="docs.length" class="bundle-chip"
          >자료 {{ docs.length }}부 · 페이지마다 한 부씩</span
        >
      </div>

      <ul v-if="tips.length" class="tip-list">
        <li v-for="tip in tips" :key="tip">{{ tip }}</li>
      </ul>
    </div>

    <p v-if="errorMessage" class="error-box no-print">{{ errorMessage }}</p>
    <p v-if="isLoading" class="empty-box no-print">자료를 만드는 중이에요.</p>

    <!-- 시험지(문제지) / 교육자용(답안지·평가표) -->
    <article v-for="paper in examPapers" :key="paper.key" class="paper-sheet">
      <header class="paper-head">
        <div class="paper-title">
          <p class="paper-eyebrow">혼자야 · ARC SAFETY</p>
          <h2>{{ paper.header.title }}</h2>
          <p class="paper-sub">{{ paper.header.subtitle }}</p>
        </div>
        <div class="paper-meta">
          <span
            >응시자 <b>{{ paper.header.targetName || "____________" }}</b></span
          >
          <span
            >채점자 <b>{{ paper.header.reviewer || "____________" }}</b></span
          >
          <span>시험일 <b>____년 __월 __일</b></span>
          <span>
            문항 <b>{{ paper.header.questionCount }}개</b> / 총점
            <b>{{ paper.header.totalPoints }}점</b>
          </span>
          <span>
            제한시간 <b>{{ paper.header.minutes }}분</b> / 커트라인
            <b>{{ paper.header.cutline }}%</b>
          </span>
          <span class="paper-seed"
            >시험지 번호 <b>{{ paper.seed }}</b></span
          >
        </div>
      </header>

      <p v-if="paper.header.emphasis" class="paper-note">
        출제 방향: {{ paper.header.emphasis }}
      </p>

      <p
        v-if="paper.teacher && paper.angleSummary && paper.angleSummary.length"
        class="angle-summary"
      >
        <b>출제 각도</b>
        <span
          v-for="item in paper.angleSummary"
          :key="item.label"
          class="angle-chip"
          >{{ item.label }} {{ item.count }}</span
        >
      </p>

      <section
        v-for="section in paper.sections"
        :key="section.key"
        class="paper-section"
      >
        <h3 class="section-head">
          {{ section.label }}
          <small>{{ section.desc }}</small>
        </h3>
        <ol class="question-list">
          <li v-for="row in section.rows" :key="row.key" class="question-item">
            <div class="question-line">
              <span class="question-no">{{ row.no }}.</span>
              <span class="question-text">
                {{ row.question }}
                <span v-if="row.critical" class="critical-tag">핵심술기</span>
                <span
                  v-if="paper.teacher && row.angleLabel"
                  class="angle-tag"
                  >{{ row.angleLabel }}</span
                >
              </span>
              <span class="question-points">{{ row.points }}점</span>
            </div>

            <p v-if="paper.teacher && row.altQuestion" class="question-alt">
              다른 표현: {{ row.altQuestion }}
            </p>

            <div v-if="!paper.teacher" class="answer-lines">
              <span></span><span></span><span></span>
            </div>

            <template v-else>
              <p v-if="row.answerFocus" class="teacher-focus">
                <b>답에 꼭 들어가야 할 것</b> {{ row.answerFocus }}
              </p>
              <p class="teacher-answer">
                <b>모범답안</b> {{ row.answer || "—" }}
              </p>
              <table class="criteria-table">
                <thead>
                  <tr>
                    <th>수행</th>
                    <th>부분수행</th>
                    <th>미수행</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{{ row.criteria.perform || "—" }}</td>
                    <td>{{ row.criteria.partial || "—" }}</td>
                    <td>{{ row.criteria.none || "—" }}</td>
                  </tr>
                  <tr class="score-row">
                    <td>□ {{ row.points }}점</td>
                    <td>□ {{ Math.round(row.points / 2) }}점</td>
                    <td>□ 0점</td>
                  </tr>
                </tbody>
              </table>
              <p v-if="row.basis" class="teacher-basis">
                <b>이론 근거</b> {{ row.basis }}
              </p>
              <p v-if="row.tail" class="teacher-tail">
                <b>꼬리질문</b> {{ row.tail }}
              </p>
              <p v-if="row.wrong" class="teacher-wrong">
                <b>위험한 답</b> {{ row.wrong }}
              </p>
            </template>
          </li>
        </ol>
      </section>

      <section v-if="paper.bankRows.length" class="paper-section">
        <h3 class="section-head">질문 은행</h3>
        <ol class="question-list">
          <li
            v-for="row in paper.bankRows"
            :key="row.key"
            class="question-item"
          >
            <div class="question-line">
              <span class="question-no">{{ row.no }}.</span>
              <span class="question-text">
                {{ row.question }}
                <span class="bank-tag">{{ row.label }}</span>
              </span>
              <span class="question-points">{{ row.points }}점</span>
            </div>
            <div v-if="!paper.teacher" class="answer-lines">
              <span></span><span></span>
            </div>
            <template v-else>
              <p class="teacher-answer">
                <b>모범답안</b> {{ row.answer || "—" }}
              </p>
              <p v-if="row.tail" class="teacher-tail">
                <b>꼬리질문</b> {{ row.tail }}
              </p>
              <p v-if="row.wrong" class="teacher-wrong">
                <b>위험한 답</b> {{ row.wrong }}
              </p>
            </template>
          </li>
        </ol>
      </section>

      <section v-if="paper.customRows.length" class="paper-section">
        <h3 class="section-head">총괄 지정 문항</h3>
        <ol class="question-list">
          <li
            v-for="row in paper.customRows"
            :key="row.key"
            class="question-item"
          >
            <div class="question-line">
              <span class="question-no">{{ row.no }}.</span>
              <span class="question-text">{{ row.question }}</span>
              <span class="question-points">{{ row.points }}점</span>
            </div>
            <div v-if="!paper.teacher" class="answer-lines">
              <span></span><span></span>
            </div>
          </li>
        </ol>
      </section>

      <section v-if="paper.teacher && paper.verdictRules" class="verdict-box">
        <h3>판정 규칙 (커트라인 {{ paper.verdictRules.cutline }}%)</h3>
        <ul>
          <li v-for="rule in paper.verdictRules.rules" :key="rule">
            {{ rule }}
          </li>
        </ul>
      </section>

      <footer class="paper-foot">
        <div class="sign-row">
          <span>응시자 서명 ____________</span>
          <span>채점자 서명 ____________</span>
          <span>결과 □ 통과 □ 보충 필요 □ 재교육</span>
        </div>
        <p class="paper-fineprint">
          ARC 대표(RN) 전용 자료입니다. 인쇄물은 보관 장소를 정해 두고, 필요
          없어지면 파쇄해 주세요.
        </p>
      </footer>
    </article>

    <!-- 족보 교육자료 (응시자 전용 / 교육자 전용) -->
    <article
      v-for="pack in studyPacks"
      :key="pack.key"
      class="paper-sheet study-sheet"
    >
      <header class="paper-head">
        <div class="paper-title">
          <p class="paper-eyebrow">혼자야 · ARC SAFETY</p>
          <h2>{{ pack.header.title }}</h2>
          <p class="paper-sub">{{ pack.header.subtitle }}</p>
        </div>
        <div class="paper-meta">
          <span
            >대상자 <b>{{ pack.header.targetName || "____________" }}</b></span
          >
          <span v-if="pack.audience === 'TEACHER'">
            시험 <b>{{ pack.kindLabel }}</b> · {{ pack.totals.minutes }}분 ·
            커트라인
            <b>{{ pack.totals.cutline }}%</b>
          </span>
          <span v-if="pack.audience === 'TEACHER'">
            시험 문항 <b>{{ pack.totals.examCount }}개</b> /
            {{ pack.totals.examPoints }}점
          </span>
          <span>
            전체 지식 <b>{{ pack.totals.knowledgeCount }}항목</b> · 질문 은행
            <b>{{ pack.totals.bankCount }}개</b>
          </span>
          <span class="paper-seed"
            >{{ pack.seedLabel || "자료 번호" }} <b>{{ pack.seed }}</b></span
          >
          <span class="audience-chip">{{ pack.audienceLabel }}</span>
        </div>
      </header>

      <p
        v-if="pack.angleSummary && pack.angleSummary.length"
        class="angle-summary"
      >
        <b>출제 각도</b>
        <span
          v-for="item in pack.angleSummary"
          :key="item.label"
          class="angle-chip"
          >{{ item.label }} {{ item.count }}</span
        >
      </p>

      <section v-if="pack.exam.length" class="study-block">
        <h3 class="section-head">
          {{ pack.examSectionTitle }}
          <small>
            {{ pack.examSectionHint }}
          </small>
        </h3>
        <ol class="question-list">
          <li v-for="row in pack.exam" :key="row.key" class="question-item">
            <div class="question-line">
              <span class="question-no">{{ row.no }}.</span>
              <span class="question-text">
                {{ row.question }}
                <span v-if="row.critical" class="critical-tag">핵심술기</span>
                <span v-if="row.angleLabel" class="angle-tag">{{
                  row.angleLabel
                }}</span>
                <span class="section-tag">{{ row.sectionLabel }}</span>
              </span>
              <span class="question-points">{{ row.points }}점</span>
            </div>
            <p v-if="row.altQuestion" class="question-alt">
              다른 표현: {{ row.altQuestion }}
            </p>
            <p v-if="row.answerFocus" class="teacher-focus">
              <b>답에 꼭 들어가야 할 것</b> {{ row.answerFocus }}
            </p>
            <p class="teacher-answer">
              <b>모범답안</b> {{ row.answer || "—" }}
            </p>
            <p v-if="row.detail" class="teacher-detail">
              <b>자세한 해설</b> {{ row.detail }}
            </p>
            <p v-if="row.scoreTip" class="teacher-score-tip">
              <b>채점 포인트</b> {{ row.scoreTip }}
            </p>
            <table v-if="pack.audience === 'TEACHER'" class="criteria-table">
              <thead>
                <tr>
                  <th>수행</th>
                  <th>부분수행</th>
                  <th>미수행</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{{ row.criteria.perform || "—" }}</td>
                  <td>{{ row.criteria.partial || "—" }}</td>
                  <td>{{ row.criteria.none || "—" }}</td>
                </tr>
              </tbody>
            </table>
            <p v-if="row.basis" class="teacher-basis">
              <b>이론 근거</b> {{ row.basis }}
            </p>
            <p v-if="row.tail" class="teacher-tail">
              <b>꼬리질문</b> {{ row.tail }}
            </p>
            <p v-if="row.wrong" class="teacher-wrong">
              <b>위험한 답</b> {{ row.wrong }}
            </p>
          </li>
        </ol>
      </section>

      <section class="study-block">
        <h3 class="section-head">
          {{ pack.chapterLabels.knowledge }}
          <small v-if="pack.audience === 'TEACHER'">
            이번 시험에 나오지 않은 항목까지 모두 담았습니다.
            <span class="on-exam-tag">★이번 시험</span> 표시가 있는 항목은 이번
            시험지에 그대로 나온 문항입니다.
          </small>
          <small v-else>
            8개 영역 전체를 순서대로 읽으며 스스로 답해 보세요. 이번 시험에 어떤
            문항이 나오는지는 이 자료에 담겨 있지 않습니다.
          </small>
        </h3>
        <div
          v-for="section in pack.sections"
          :key="section.key"
          class="study-section"
        >
          <h4 class="study-section-head">
            {{ section.label }}
            <small>{{ section.desc }}</small>
          </h4>
          <ul class="knowledge-list">
            <li
              v-for="item in section.items"
              :key="item.key"
              class="knowledge-item"
              :class="{ 'is-exam': item.onExam }"
            >
              <div class="knowledge-line">
                <strong>{{ item.label }}</strong>
                <span v-if="item.onExam" class="on-exam-tag">★이번 시험</span>
                <span v-if="item.critical" class="critical-tag">핵심술기</span>
                <span class="knowledge-points">{{ item.points }}점</span>
              </div>
              <p class="teacher-answer">
                <b>정답 요약</b> {{ item.answer || "—" }}
              </p>
              <p v-if="item.detail" class="teacher-detail">
                <b>자세히 알기</b> {{ item.detail }}
              </p>
              <p v-if="item.scene" class="teacher-scene">
                <b>혼자야에서는 이렇게 생깁니다</b> {{ item.scene }}
              </p>
              <p v-if="item.remember" class="teacher-remember">
                <b>한 줄 정리</b> {{ item.remember }}
              </p>
              <table v-if="pack.audience === 'TEACHER'" class="criteria-table">
                <thead>
                  <tr>
                    <th>수행</th>
                    <th>부분수행</th>
                    <th>미수행</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{{ item.criteria.perform || "—" }}</td>
                    <td>{{ item.criteria.partial || "—" }}</td>
                    <td>{{ item.criteria.none || "—" }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-if="item.basis" class="teacher-basis">
                <b>이론 근거</b> {{ item.basis }}
              </p>
              <p v-if="item.mistakes" class="teacher-wrong">
                <b>자주 하는 실수</b> {{ item.mistakes }}
              </p>
              <ul v-if="item.ask.length" class="ask-list">
                <li v-for="(ask, index) in item.ask" :key="index">{{ ask }}</li>
              </ul>
              <p v-if="item.wrong" class="teacher-wrong">
                <b>위험한 답</b> {{ item.wrong }}
              </p>
            </li>
          </ul>
        </div>
      </section>

      <section class="study-block">
        <h3 class="section-head">{{ pack.chapterLabels.bank }}</h3>
        <ul class="knowledge-list">
          <li v-for="item in pack.bank" :key="item.key" class="knowledge-item">
            <div class="knowledge-line">
              <strong>{{ item.question }}</strong>
              <span class="section-tag">{{ item.tag }}</span>
              <span v-if="item.onExam" class="on-exam-tag">★이번 시험</span>
            </div>
            <p class="teacher-answer"><b>정답</b> {{ item.answer || "—" }}</p>
            <p v-if="item.detail" class="teacher-detail">
              <b>자세히 알기</b> {{ item.detail }}
            </p>
            <p v-if="item.remember" class="teacher-remember">
              <b>한 줄 정리</b> {{ item.remember }}
            </p>
            <p v-if="item.wrong" class="teacher-wrong">
              <b>위험한 답</b> {{ item.wrong }}
            </p>
          </li>
        </ul>
      </section>

      <section v-if="pack.glossary.length" class="study-block">
        <h3 class="section-head">
          {{ pack.chapterLabels.glossary }}
          <small v-if="pack.audience === 'TEACHER'"
            >시험에 나온 단어 위주로 쉬운 말로 풀었습니다.</small
          >
          <small v-else>자료에 나온 어려운 말을 쉬운 말로 풀었습니다.</small>
        </h3>
        <dl class="glossary-grid">
          <div
            v-for="term in pack.glossary"
            :key="term.term"
            class="glossary-row"
          >
            <dt>{{ term.term }}</dt>
            <dd>{{ term.plain }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="pack.verdictRules" class="verdict-box">
        <h3>판정 규칙 (커트라인 {{ pack.verdictRules.cutline }}%)</h3>
        <ul>
          <li v-for="rule in pack.verdictRules.rules" :key="rule">
            {{ rule }}
          </li>
        </ul>
      </section>

      <section class="study-block">
        <h3 class="section-head">인쇄 전 확인</h3>
        <ul class="checklist">
          <li v-for="item in pack.checklist" :key="item">□ {{ item }}</li>
        </ul>
      </section>

      <footer class="paper-foot">
        <div class="sign-row">
          <span>작성자 ARC 대표(RN) ____________</span>
          <span>확인일 ____년 __월 __일</span>
        </div>
        <p class="paper-fineprint">{{ pack.footerNote }}</p>
      </footer>
    </article>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import {
  fetchArcStudyPack,
  fetchArcVerbalPaper,
  fetchArcVerbalPaperCatalog,
} from "@/lib/arc";

const OUTPUTS = [
  {
    key: "EXAM",
    label: "시험지 (문제지)",
    desc: "응시자에게 나누는 문제지",
  },
  {
    key: "TEACHER",
    label: "교육자용 (답안지·평가표)",
    desc: "모범답안·채점기준·이론 근거",
  },
  {
    key: "STUDY_CANDIDATE",
    label: "족보 · 응시자 전용",
    desc: "8개 영역 전체 지식 (시험 문항 없음)",
  },
  {
    key: "STUDY_TEACHER",
    label: "족보 · 교육자 전용",
    desc: "이번 시험 정답 해설 · 채점표 · 판정규칙",
  },
];

const FALLBACK_KINDS = [
  { key: "SURPRISE", label: "불시 구두시험", minutes: 5, cutline: 70 },
  { key: "REGULAR", label: "정규 구두시험", minutes: 20, cutline: 80 },
];

const catalog = ref({ kinds: [], modes: [], tips: [] });
const docs = ref([]);
const isLoading = ref(false);
const errorMessage = ref("");

const form = reactive({
  outputs: ["EXAM"],
  kinds: ["REGULAR"],
  emphasis: "",
  targetName: "",
  seed: "",
  aiVaried: true,
});

const kinds = computed(() =>
  catalog.value.kinds?.length ? catalog.value.kinds : FALLBACK_KINDS
);
const tips = computed(() => catalog.value.tips ?? []);
// 인쇄는 시험지·교육자용을 먼저, 족보를 뒤에 놓습니다.
const examPapers = computed(() =>
  docs.value.filter((doc) => doc.type === "paper")
);
const studyPacks = computed(() =>
  docs.value.filter((doc) => doc.type === "pack")
);
const ready = computed(() => docs.value.length > 0);

function makeSeed() {
  return Math.random().toString(36).slice(2, 10);
}

async function loadCatalog() {
  try {
    catalog.value = await fetchArcVerbalPaperCatalog();
  } catch {
    catalog.value = { kinds: FALLBACK_KINDS, modes: [], tips: [] };
  }
}

async function load({ newSeed = false } = {}) {
  isLoading.value = true;
  errorMessage.value = "";

  if (newSeed || (!form.seed && form.aiVaried)) {
    form.seed = makeSeed();
  }

  const shared = {
    seed: form.seed,
    emphasis: form.emphasis,
    targetName: form.targetName,
    aiVaried: form.aiVaried ? "true" : "false",
  };

  const pickedKinds = kinds.value.filter((kind) =>
    form.kinds.includes(kind.key)
  );
  const pickedOutputs = OUTPUTS.filter((output) =>
    form.outputs.includes(output.key)
  );
  const built = [];

  try {
    for (const kind of pickedKinds) {
      for (const output of pickedOutputs) {
        const key = `${kind.key}-${output.key}`;

        if (
          output.key === "STUDY_CANDIDATE" ||
          output.key === "STUDY_TEACHER"
        ) {
          // 응시자 전용 족보는 시험 종류와 상관없이 같은 지식 자료라 한 부만 넣습니다.
          if (
            output.key === "STUDY_CANDIDATE" &&
            built.some((doc) => doc.audience === "CANDIDATE")
          ) {
            continue;
          }

          const pack = await fetchArcStudyPack({
            ...shared,
            kind: kind.key,
            audience:
              output.key === "STUDY_CANDIDATE" ? "CANDIDATE" : "TEACHER",
          });

          built.push({ ...pack, key, type: "pack" });
        } else {
          const paper = await fetchArcVerbalPaper({
            ...shared,
            kind: kind.key,
            mode: output.key,
          });

          built.push({
            ...paper,
            key,
            type: "paper",
            teacher: output.key === "TEACHER",
          });
        }
      }
    }

    docs.value = built;
  } catch (error) {
    docs.value = [];
    errorMessage.value =
      error?.response?.data?.message ||
      error?.message ||
      "자료를 만들지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

function shuffle() {
  form.seed = makeSeed();
  load();
}

// 최소 한 개는 남겨 둡니다(모두 끄면 인쇄할 게 없어집니다).
function toggleOutput(key) {
  if (form.outputs.includes(key)) {
    if (form.outputs.length === 1) return;

    form.outputs = form.outputs.filter((item) => item !== key);
  } else {
    form.outputs = OUTPUTS.filter(
      (item) => form.outputs.includes(item.key) || item.key === key
    ).map((item) => item.key);
  }

  load();
}

function toggleKind(key) {
  if (form.kinds.includes(key)) {
    if (form.kinds.length === 1) return;

    form.kinds = form.kinds.filter((item) => item !== key);
  } else {
    form.kinds = kinds.value
      .filter((item) => form.kinds.includes(item.key) || item.key === key)
      .map((item) => item.key);
  }

  load();
}

function printPaper() {
  if (typeof window === "undefined" || !ready.value) return;

  document.body.classList.add("arc-study-open");

  window.setTimeout(() => {
    window.print();
    window.setTimeout(() => {
      document.body.classList.remove("arc-study-open");
    }, 600);
  }, 60);
}

function clearBodyClass() {
  if (typeof document !== "undefined") {
    document.body.classList.remove("arc-study-open");
  }
}

onMounted(async () => {
  window.addEventListener("afterprint", clearBodyClass);
  await loadCatalog();
  await load({ newSeed: true });
});

onBeforeUnmount(() => {
  window.removeEventListener("afterprint", clearBodyClass);
  clearBodyClass();
});
</script>

<style scoped lang="scss">
@use "../../scss/_arc-ui" as *;
.arc-exam-print-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-head-text {
  max-width: 760px;
}

.director-badge {
  flex-shrink: 0;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid var(--arc-brand-line, rgba(251, 191, 36, 0.36));
  background: var(--arc-brand-soft, rgba(251, 191, 36, 0.14));
  color: #fcd34d;
  font-size: 11.5px;
  font-weight: 800;
}

.control-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--arc-line, rgba(255, 255, 255, 0.12));
  border-radius: var(--arc-radius, 14px);
  background: var(--arc-surface, rgba(255, 255, 255, 0.08));
}

.control-grid,
.control-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-label {
  font-size: 12.5px;
  font-weight: 800;
  color: var(--arc-ink-2, rgba(255, 255, 255, 0.86));
}

.choice-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;

  &.compact {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }
}

.choice-button {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid var(--arc-line-2, rgba(255, 255, 255, 0.16));
  border-radius: 12px;
  background: var(--arc-surface-2, rgba(255, 255, 255, 0.05));
  color: var(--arc-ink, #ffffff);
  text-align: left;
  cursor: pointer;

  strong {
    font-size: 13.5px;
  }

  small {
    font-size: 11.5px;
    color: var(--arc-ink-3, rgba(255, 255, 255, 0.74));
  }

  &.active {
    border-color: var(--arc-brand, #f59e0b);
    background: var(--arc-brand-soft, rgba(251, 191, 36, 0.14));
    box-shadow: inset 0 0 0 1px var(--arc-brand-line, rgba(251, 191, 36, 0.36));
  }
}

.choice-check {
  align-self: flex-start;
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
  border: 1px solid var(--arc-line-2, rgba(255, 255, 255, 0.16));
  background: rgba(255, 255, 255, 0.08);
  font-size: 11px;
  font-weight: 800;
  line-height: 16px;
  text-align: center;
  color: var(--arc-ink-3, rgba(255, 255, 255, 0.64));
}

.choice-button.active .choice-check {
  border-color: var(--arc-brand, #f59e0b);
  background: var(--arc-brand, rgba(217, 119, 6, 0.85));
  color: #fff;
}

.field {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--arc-ink-2, rgba(255, 255, 255, 0.86));

  input {
    font-weight: 500;
  }
}

.switch-row {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--arc-ink-2, rgba(255, 255, 255, 0.86));
}

textarea {
  padding: 10px 12px;
  border: 1px solid var(--arc-line-2, rgba(255, 255, 255, 0.16));
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 13px;
  line-height: 1.6;
  color: var(--arc-ink, #ffffff);
  resize: vertical;
}

.control-hint {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--arc-ink-3, rgba(255, 255, 255, 0.74));
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.seed-chip {
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid var(--arc-line-2, rgba(255, 255, 255, 0.16));
  background: var(--arc-surface-3, rgba(255, 255, 255, 0.06));
  font-size: 11.5px;
  font-weight: 700;
  color: var(--arc-ink-2, rgba(255, 255, 255, 0.86));
}

.bundle-chip {
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid rgba(96, 165, 250, 0.36);
  background: rgba(96, 165, 250, 0.16);
  font-size: 11.5px;
  font-weight: 700;
  color: #93c5fd;
}

.audience-chip {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  font-size: 11px;
  font-weight: 800;
  color: #3730a3;
}

.tip-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--arc-ink-2, rgba(255, 255, 255, 0.86));
}

/* ── 출력물(종이) 모양 ────────────────────────────────── */
.paper-sheet {
  padding: 26px 30px 30px;
  border: 1px solid var(--arc-line, #e2e8f0);
  border-radius: var(--arc-radius, 14px);
  background: #fff;
  color: #111827;
}

.paper-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 12px;
  border-bottom: 2px solid #0f172a;
}

.paper-eyebrow {
  margin: 0 0 4px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.16em;
  color: #64748b;
}

.paper-title h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
}

.paper-sub {
  margin: 5px 0 0;
  max-width: 460px;
  font-size: 11.5px;
  line-height: 1.6;
  color: #475569;
}

.paper-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 230px;
  font-size: 11.5px;
  color: #334155;

  b {
    font-weight: 800;
  }
}

.paper-seed {
  color: #64748b;
}

.paper-note {
  margin: 12px 0 0;
  padding: 8px 12px;
  border-left: 3px solid #0f172a;
  background: #f1f5f9;
  font-size: 11.5px;
  line-height: 1.6;
}

.paper-section,
.study-block {
  margin-top: 18px;
}

.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 8px;
  padding-bottom: 5px;
  border-bottom: 1px solid #cbd5e1;
  font-size: 14px;
  font-weight: 800;

  small {
    font-size: 11px;
    font-weight: 500;
    color: #64748b;
  }
}

.question-list {
  margin: 0;
  padding-left: 0;
  list-style: none;
}

.question-item {
  padding: 9px 0;
  border-bottom: 1px dashed #e2e8f0;
  break-inside: avoid;
}

.question-line {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: 12.5px;
  line-height: 1.65;
}

.question-no {
  flex-shrink: 0;
  font-weight: 800;
}

.question-text {
  flex: 1;
}

.question-points {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 800;
  color: #475569;
}

.critical-tag,
.bank-tag,
.section-tag,
.angle-tag,
.on-exam-tag {
  display: inline-flex;
  align-items: center;
  margin-left: 5px;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  font-size: 10px;
  font-weight: 800;
  color: #334155;
  white-space: nowrap;
}

.critical-tag {
  border-color: #fca5a5;
  background: #fef2f2;
  color: #b91c1c;
}

.angle-tag {
  border-color: #c7d2fe;
  background: #eef2ff;
  color: #3730a3;
}

.angle-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin: 0 0 10px;
  font-size: 11px;
  color: #334155;

  b {
    font-weight: 800;
  }
}

.angle-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  font-size: 10px;
  font-weight: 800;
  color: #3730a3;
  white-space: nowrap;
}

.on-exam-tag {
  border-color: #86efac;
  background: #f0fdf4;
  color: #15803d;
}

.teacher-focus {
  margin: 6px 0 0;
  padding: 6px 9px;
  border-left: 3px solid #6366f1;
  border-radius: 0 6px 6px 0;
  background: #eef2ff;
  font-size: 11.5px;
  line-height: 1.65;
  color: #312e81;

  b {
    font-weight: 800;
  }
}

.answer-lines {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 8px;

  span {
    display: block;
    height: 1px;
    background: #e2e8f0;
  }
}

.question-alt {
  margin: 5px 0 0;
  font-size: 11px;
  color: #64748b;
}

.teacher-answer,
.teacher-basis,
.teacher-tail,
.teacher-wrong,
.teacher-detail,
.teacher-scene,
.teacher-remember,
.teacher-score-tip {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.65;
  color: #1f2937;

  b {
    font-weight: 800;
  }
}

.teacher-basis {
  padding: 6px 9px;
  border-radius: 6px;
  background: #f8fafc;
}

.teacher-detail {
  padding: 6px 9px;
  border-left: 3px solid #1d4ed8;
  border-radius: 0 6px 6px 0;
  background: #f5f8ff;
}

.teacher-scene {
  padding: 6px 9px;
  border-left: 3px solid #0f766e;
  border-radius: 0 6px 6px 0;
  background: #f0fdfa;
  color: #134e4a;
}

.teacher-remember {
  font-weight: 700;
  color: #7c2d12;
}

.teacher-score-tip {
  padding: 6px 9px;
  border-left: 3px solid #b45309;
  border-radius: 0 6px 6px 0;
  background: #fffbeb;
  color: #78350f;
}

.teacher-wrong {
  color: #b91c1c;
}

.criteria-table {
  width: 100%;
  margin-top: 7px;
  border-collapse: collapse;
  font-size: 10.5px;

  th,
  td {
    padding: 5px 7px;
    border: 1px solid #cbd5e1;
    vertical-align: top;
    text-align: left;
    line-height: 1.55;
  }

  th {
    background: #f1f5f9;
    font-weight: 800;
  }

  .score-row td {
    text-align: center;
    font-weight: 800;
  }
}

.ask-list {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 11.5px;
  line-height: 1.7;
  color: #334155;
}

.verdict-box {
  margin-top: 16px;
  padding: 12px 16px;
  border: 2px solid #0f172a;
  border-radius: 6px;
  break-inside: avoid;

  h3 {
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 800;
  }

  ul {
    margin: 0;
    padding-left: 18px;
    font-size: 11.5px;
    line-height: 1.7;
  }
}

.paper-foot {
  margin-top: 22px;
  padding-top: 12px;
  border-top: 1px solid #cbd5e1;
}

.sign-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  font-size: 11.5px;
  font-weight: 600;
}

.paper-fineprint {
  margin: 10px 0 0;
  font-size: 10px;
  line-height: 1.6;
  color: #94a3b8;
}

/* ── 족보 교육자료 ───────────────────────────── */
.study-section {
  margin-top: 12px;
  break-inside: avoid-page;
}

.study-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 7px;
  margin: 0 0 6px;
  font-size: 12.5px;
  font-weight: 800;
  color: #0f172a;

  small {
    font-size: 10.5px;
    font-weight: 500;
    color: #64748b;
  }
}

.knowledge-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding-left: 0;
  list-style: none;
}

.knowledge-item {
  padding: 9px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  break-inside: avoid;

  &.is-exam {
    border-color: #86efac;
    background: #f7fef9;
  }
}

.knowledge-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;

  strong {
    font-size: 12.5px;
    font-weight: 800;
  }
}

.knowledge-points {
  margin-left: auto;
  font-size: 10.5px;
  font-weight: 800;
  color: #475569;
}

.glossary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 6px 16px;
  margin: 0;
}

.glossary-row {
  padding: 5px 0;
  border-bottom: 1px dashed #e2e8f0;
  font-size: 11.5px;

  dt {
    font-weight: 800;
  }

  dd {
    margin: 2px 0 0;
    color: #334155;
  }
}

.checklist {
  margin: 0;
  padding-left: 4px;
  list-style: none;
  font-size: 11.5px;
  line-height: 1.8;
}
</style>

<style>
/* 인쇄용 — scoped 로 두면 body·레이아웃 선택자에 닿지 않아 따로 둡니다. */
@media print {
  @page {
    size: A4;
    margin: 12mm 10mm;
  }

  body.arc-study-open .admin-sidebar,
  body.arc-study-open .admin-topbar,
  body.arc-study-open .mobile-menu-backdrop,
  body.arc-study-open .no-print {
    display: none !important;
  }

  body.arc-study-open .admin-main {
    display: block;
    margin: 0;
    padding: 0;
  }

  body.arc-study-open .admin-content {
    padding: 0;
    background: rgba(255, 255, 255, 0.08);
  }

  body.arc-study-open .arc-exam-print-panel {
    gap: 0;
    padding: 0 !important;
  }

  body.arc-study-open .admin-arc-training-view {
    padding: 0 !important;
  }

  body.arc-study-open .paper-sheet {
    padding: 0;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  /* 여러 부를 한 번에 뽑을 때 한 부씩 새 페이지에서 시작합니다. */
  body.arc-study-open .paper-sheet + .paper-sheet {
    break-before: page;
    page-break-before: always;
  }

  body.arc-study-open .question-item,
  body.arc-study-open .knowledge-item,
  body.arc-study-open .criteria-table,
  body.arc-study-open .verdict-box,
  body.arc-study-open .paper-head,
  body.arc-study-open .study-section {
    break-inside: avoid;
  }

  body.arc-study-open .answer-lines {
    gap: 18px;
  }
}
</style>
