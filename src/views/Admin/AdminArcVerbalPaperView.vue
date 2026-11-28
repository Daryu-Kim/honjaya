<template>
  <div class="admin-arc-verbal-paper-view">
    <header class="page-header no-print">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY · ARC 대표(RN) 전용</p>
        <h1>구두시험 시험지·교육자용 출력</h1>
        <p class="description">
          뽑을 때마다 문제 순서와 표현이 새로 바뀝니다. 같은 시험지를 다시
          뽑으려면 <strong>시드 고정</strong>을 켜세요. 내 의견을 넣으면 그
          영역에서 더 많이 출제되고, <code>?</code>로 시작하는 줄은 그대로
          문항이 됩니다.
        </p>
      </div>
      <nav class="header-links">
        <router-link to="/admin/arc/training" class="link-button">
          월간 교육·OT
        </router-link>
        <router-link to="/admin/arc" class="link-button">
          응급안전 홈
        </router-link>
      </nav>
    </header>

    <p v-if="errorMessage" class="error-box no-print">{{ errorMessage }}</p>

    <section class="control-panel no-print">
      <div class="control-grid">
        <div class="control-block">
          <span class="control-label">1. 시험 종류</span>
          <div class="choice-row">
            <button
              v-for="kind in kinds"
              :key="kind.key"
              type="button"
              class="choice-button"
              :class="{ active: form.kind === kind.key }"
              @click="form.kind = kind.key"
            >
              <strong>{{ kind.label }}</strong>
              <small>{{ kind.minutes }}분 · 커트라인 {{ kind.cutline }}%</small>
              <small>{{ kind.desc }}</small>
            </button>
          </div>
        </div>

        <div class="control-block">
          <span class="control-label">2. 출력 종류</span>
          <div class="choice-row">
            <button
              v-for="mode in modes"
              :key="mode.key"
              type="button"
              class="choice-button"
              :class="{ active: form.mode === mode.key }"
              @click="form.mode = mode.key"
            >
              <strong>{{ mode.label }}</strong>
              <small>{{ mode.desc }}</small>
            </button>
          </div>
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
        </div>

        <div class="control-block">
          <label class="field">
            <span>시드</span>
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
      </div>

      <div class="action-row">
        <button
          type="button"
          class="primary-button"
          :disabled="isLoading"
          @click="shuffle"
        >
          다시 뽑기
        </button>
        <button
          type="button"
          class="mini-button"
          :disabled="isLoading"
          @click="reload"
        >
          그대로 다시 불러오기
        </button>
        <button
          type="button"
          class="mini-button"
          :disabled="!paper"
          @click="printPaper"
        >
          인쇄 / PDF 저장
        </button>
      </div>

      <p v-if="tips.length" class="tip-box">
        <strong>알아 두세요</strong>
        <span v-for="tip in tips" :key="tip" class="tip-line">{{ tip }}</span>
      </p>
    </section>

    <p v-if="isLoading" class="empty-box no-print">시험지를 만드는 중이에요.</p>

    <article v-if="paper" class="paper-sheet">
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
              </span>
              <span class="question-points">{{ row.points }}점</span>
            </div>

            <p v-if="isTeacher && row.altQuestion" class="question-alt">
              다른 표현: {{ row.altQuestion }}
            </p>

            <div v-if="!isTeacher" class="answer-lines">
              <span></span><span></span>
            </div>

            <template v-else>
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
            <div v-if="!isTeacher" class="answer-lines">
              <span></span><span></span>
            </div>
            <template v-else>
              <p class="teacher-answer">
                <b>모범답안</b> {{ row.answer || "—" }}
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
            <div v-if="!isTeacher" class="answer-lines">
              <span></span><span></span>
            </div>
          </li>
        </ol>
      </section>

      <section v-if="isTeacher && paper.verdictRules" class="verdict-box">
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
          ARC 대표(RN) 전용 자료입니다. 개인정보가 들어 있으니 인쇄물은 보관
          장소를 정해 두고, 필요 없어지면 파쇄해 주세요.
        </p>
      </footer>
    </article>
  </div>
</template>

<script>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { fetchArcVerbalPaper, fetchArcVerbalPaperCatalog } from "@/lib/arc";

const FALLBACK_KINDS = [
  {
    key: "SURPRISE",
    label: "불시 구두시험",
    minutes: 5,
    cutline: 70,
    desc: "",
  },
  {
    key: "REGULAR",
    label: "정규 구두시험",
    minutes: 20,
    cutline: 80,
    desc: "",
  },
];

const FALLBACK_MODES = [
  { key: "EXAM", label: "시험지(문제지)", desc: "" },
  { key: "TEACHER", label: "교육자용(답안지·평가표)", desc: "" },
];

function makeSeed() {
  return Math.random().toString(36).slice(2, 10);
}

export default {
  name: "AdminArcVerbalPaperView",
  setup() {
    const catalog = ref({ kinds: [], modes: [], tips: [] });
    const paper = ref(null);
    const isLoading = ref(false);
    const errorMessage = ref("");

    const form = reactive({
      kind: "REGULAR",
      mode: "EXAM",
      emphasis: "",
      targetName: "",
      seed: "",
      aiVaried: true,
    });

    const kinds = computed(() => catalog.value.kinds ?? FALLBACK_KINDS);
    const modes = computed(() => catalog.value.modes ?? FALLBACK_MODES);
    const tips = computed(() => catalog.value.tips ?? []);
    const isTeacher = computed(() => paper.value?.mode === "TEACHER");

    async function loadCatalog() {
      try {
        catalog.value = await fetchArcVerbalPaperCatalog();
      } catch {
        catalog.value = {
          kinds: FALLBACK_KINDS,
          modes: FALLBACK_MODES,
          tips: [],
        };
      }
    }

    async function load({ newSeed = false } = {}) {
      isLoading.value = true;
      errorMessage.value = "";

      if (newSeed || form.aiVaried) {
        form.seed = makeSeed();
      }

      try {
        paper.value = await fetchArcVerbalPaper({
          kind: form.kind,
          mode: form.mode,
          seed: form.seed,
          emphasis: form.emphasis,
          targetName: form.targetName,
          aiVaried: form.aiVaried ? "true" : "false",
        });
      } catch (error) {
        errorMessage.value =
          error?.response?.data?.message ||
          error?.message ||
          "시험지를 만들지 못했어요.";
      } finally {
        isLoading.value = false;
      }
    }

    function shuffle() {
      form.seed = makeSeed();
      load();
    }

    function reload() {
      load();
    }

    function printPaper() {
      if (typeof window !== "undefined") window.print();
    }

    onMounted(async () => {
      document.body.classList.add("arc-verbal-paper-open");
      await loadCatalog();
      await load({ newSeed: true });
    });

    onBeforeUnmount(() => {
      document.body.classList.remove("arc-verbal-paper-open");
    });

    return {
      catalog,
      paper,
      isLoading,
      errorMessage,
      form,
      kinds,
      modes,
      tips,
      isTeacher,
      shuffle,
      reload,
      printPaper,
    };
  },
};
</script>

<style lang="scss" scoped>
@use "../../scss/_arc-ui" as *;
.admin-arc-verbal-paper-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  min-height: 100%;
  color: #ffffff;
}

.control-panel {
  padding: 18px 20px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
}

.control-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}

.control-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-block.wide {
  grid-column: 1 / -1;
}

.control-label {
  font-size: 12px;
  font-weight: 800;
  color: #ffffff;
}

.choice-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.choice-button {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 11px 13px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  text-align: left;
  cursor: pointer;
}

.choice-button strong {
  font-size: 13px;
  font-weight: 800;
  color: #ffffff;
}

.choice-button small {
  font-size: 11px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.64);
}

.choice-button.active {
  border-color: rgba(96, 165, 250, 0.6);
  background: rgba(96, 165, 250, 0.16);
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.25);
}

.control-block textarea,
.field input {
  padding: 9px 11px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  font-family: inherit;
  font-size: 13px;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
  resize: vertical;
}

.control-hint {
  font-size: 11px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.64);
}

.field {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.86);
}

.switch-row {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.86);
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}

.primary-button:disabled,
.mini-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tip-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 14px 0 0;
  padding: 12px 14px;
  border: 1px solid rgba(96, 165, 250, 0.36);
  border-radius: 12px;
  background: rgba(96, 165, 250, 0.16);
  font-size: 11.5px;
  color: #93c5fd;
}

.paper-sheet {
  padding: 26px 30px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #0f172a;
}

.paper-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 12px;
  border-bottom: 2px solid #0f172a;
}

.paper-eyebrow {
  margin: 0 0 2px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #1d4ed8;
}

.paper-title h2 {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 800;
}

.paper-sub {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: #475569;
}

.paper-meta {
  display: grid;
  gap: 3px;
  font-size: 11.5px;
  color: #334155;
}

.paper-meta b {
  font-weight: 800;
}

.paper-seed {
  color: #94a3b8;
}

.paper-note {
  margin: 12px 0 0;
  padding: 8px 12px;
  border-left: 3px solid #1d4ed8;
  background: #f8fafc;
  font-size: 11.5px;
  line-height: 1.6;
}

.paper-section {
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
}

.section-head small {
  font-size: 10.5px;
  font-weight: 500;
  color: #64748b;
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
  align-items: flex-start;
  gap: 7px;
  font-size: 12.5px;
  line-height: 1.65;
}

.question-no {
  flex: 0 0 auto;
  font-weight: 800;
  color: #1d4ed8;
}

.question-text {
  flex: 1 1 auto;
  font-weight: 600;
}

.question-points {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
}

.critical-tag,
.bank-tag {
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  font-size: 9.5px;
  font-weight: 800;
}

.bank-tag {
  background: #e0e7ff;
  color: #3730a3;
}

.answer-lines {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 8px 0 2px 20px;
}

.answer-lines span {
  display: block;
  border-bottom: 1px solid #cbd5e1;
}

.question-alt {
  margin: 4px 0 0 20px;
  font-size: 10.5px;
  color: #64748b;
}

.teacher-answer {
  margin: 6px 0 0 20px;
  font-size: 11.5px;
  line-height: 1.65;
  color: #166534;
}

.teacher-answer b,
.teacher-basis b,
.teacher-tail b,
.teacher-wrong b {
  display: inline-block;
  margin-right: 5px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #166534;
}

.criteria-table {
  width: calc(100% - 20px);
  margin: 7px 0 0 20px;
  border-collapse: collapse;
  font-size: 10.5px;
}

.criteria-table th,
.criteria-table td {
  padding: 5px 7px;
  border: 1px solid #cbd5e1;
  text-align: left;
  vertical-align: top;
  line-height: 1.5;
}

.criteria-table th {
  background: #f1f5f9;
  font-weight: 800;
  color: #0f172a;
}

.score-row td {
  text-align: center;
  font-weight: 700;
  color: #334155;
  background: #f8fafc;
}

.teacher-basis,
.teacher-tail,
.teacher-wrong {
  margin: 5px 0 0 20px;
  font-size: 11px;
  line-height: 1.6;
  color: #475569;
}

.teacher-wrong {
  color: #b91c1c;
}

.teacher-wrong b {
  color: #b91c1c;
}

.verdict-box {
  margin-top: 20px;
  padding: 12px 16px;
  border: 2px solid #0f172a;
  border-radius: 6px;
  break-inside: avoid;
}

.verdict-box h3 {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 800;
}

.verdict-box ul {
  margin: 0;
  padding-left: 18px;
  font-size: 11.5px;
  line-height: 1.7;
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
</style>

<style>
/* 인쇄용 — scoped 로 두면 body·레이아웃 선택자에 닿지 않아 따로 둡니다. */
@media print {
  @page {
    size: A4;
    margin: 12mm 10mm;
  }

  body.arc-verbal-paper-open .admin-sidebar,
  body.arc-verbal-paper-open .admin-topbar,
  body.arc-verbal-paper-open .mobile-menu-backdrop,
  body.arc-verbal-paper-open .no-print {
    display: none !important;
  }

  body.arc-verbal-paper-open .admin-main {
    display: block;
    margin: 0;
  }

  body.arc-verbal-paper-open .admin-content {
    padding: 0;
    background: rgba(255, 255, 255, 0.08);
  }

  body.arc-verbal-paper-open .admin-arc-verbal-paper-view {
    gap: 0;
  }

  body.arc-verbal-paper-open .paper-sheet {
    padding: 0;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  body.arc-verbal-paper-open .question-item,
  body.arc-verbal-paper-open .criteria-table,
  body.arc-verbal-paper-open .verdict-box,
  body.arc-verbal-paper-open .paper-head {
    break-inside: avoid;
  }

  body.arc-verbal-paper-open .answer-lines {
    gap: 18px;
  }
}
</style>
