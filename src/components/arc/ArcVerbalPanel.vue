<template>
  <section class="verbal-panel">
    <header class="panel-head">
      <div>
        <h2>구두시험 — ARC 대표(RN) 전용</h2>
        <p class="panel-desc">
          직원·사장을 상대로 정기·불시 구두시험을 보고 채점하는 화면이에요. 이
          탭은 ARC 대표(RN)만 볼 수 있고, 아래 평가표·질문·이론 근거도 최윤희
          선생님만 조회·수정할 수 있어요.
        </p>
      </div>
      <div class="head-actions">
        <router-link to="/admin/arc/verbal-paper" class="paper-link-button">
          시험지·교육자용 출력
        </router-link>
        <button type="button" class="ghost-button" @click="toggleGuide">
          {{ showGuide ? "평가 안내 접기" : "평가 안내·질문 은행 펼치기" }}
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="savedMessage" class="ok-box">{{ savedMessage }}</p>

    <div class="verbal-stats">
      <article>
        <p class="stat-label">이번 달 응시</p>
        <strong class="stat-value">{{ summary.total }}건</strong>
        <p class="stat-hint">
          통과 {{ summary.pass }} · 재시험 {{ summary.retake }} · 재교육
          {{ summary.fail }}
        </p>
      </article>
      <article>
        <p class="stat-label">채점 전</p>
        <strong class="stat-value">{{ summary.pending }}건</strong>
        <p class="stat-hint">응시 등록만 하고 점수를 안 넣은 건</p>
      </article>
      <article>
        <p class="stat-label">불시 시험</p>
        <strong class="stat-value">{{ summary.surprise }}건</strong>
        <p class="stat-hint">사전 예고 없이 진행한 건</p>
      </article>
      <article class="warn">
        <p class="stat-label">재평가 대상</p>
        <strong class="stat-value">{{ retests.length }}명</strong>
        <p class="stat-hint">재시험·재교육 판정 누적</p>
      </article>
    </div>

    <ul v-if="retests.length" class="retest-list">
      <li v-for="row in retests" :key="row.examNo">
        <strong>{{ row.employeeName }}</strong>
        <span class="tag">
          {{ ARC_VERBAL_VERDICT_LABELS[row.verdict] ?? row.verdict }}
        </span>
        <span v-if="row.retestOn">재평가 {{ row.retestOn }}</span>
        <span v-else class="muted">재평가 날짜 미정</span>
        <span class="muted">{{ row.examNo }}</span>
      </li>
    </ul>

    <!-- 평가 안내 · 질문 은행 -->
    <section v-if="showGuide && template" class="guide-block">
      <h3>이렇게 평가하세요</h3>
      <ul class="rule-list">
        <li>
          <strong>난이도는 높게</strong> — 정답 암기가 아니라 "왜 그렇게
          하는지"를 반드시 함께 물어보세요. 이유를 설명하지 못하면 부분수행으로
          봅니다.
        </li>
        <li>
          <strong>수행</strong> = 순서를 지키고 이유까지 설명함 ·
          <strong>부분수행</strong> = 순서는 맞지만 이유가 빠짐 ·
          <strong>미수행</strong> = 순서가 틀리거나 위험한 행동을 함
        </li>
        <li>
          <strong>핵심 항목(★)</strong>을 하나라도 미수행하면 총점과 상관없이
          재교육입니다. 생명과 직결되는 항목이에요.
        </li>
        <li>
          통과 {{ template.verdictRules.pass }}점 이상 · 재시험
          {{ template.verdictRules.retake }}점 이상 · 그 아래는 재교육
        </li>
        <li>
          합계 {{ template.totals.items }}개 항목 · 만점
          {{ template.totals.maxScore }}점 · 예상 소요
          {{ template.totals.minutes }}분
        </li>
      </ul>

      <h3>질문 항목 · 이론적 근거 ({{ template.totals.items }}개)</h3>
      <div
        v-for="section in template.sections"
        :key="section.key"
        class="guide-section"
      >
        <header>
          <h4>{{ section.label }}</h4>
          <span class="minutes">{{ section.minutes }}분</span>
        </header>
        <p class="section-desc">{{ section.desc }}</p>
        <div
          v-for="item in section.items"
          :key="item.key"
          class="guide-item"
          :class="{ critical: item.critical }"
        >
          <p class="guide-item-title">
            <span v-if="item.critical" class="star">★</span>
            {{ item.label }}
            <span class="points">{{ item.points }}점</span>
          </p>
          <p class="guide-criteria">
            <span>수행: {{ item.criteria.perform }}</span>
            <span>부분: {{ item.criteria.partial }}</span>
            <span>미수행: {{ item.criteria.none }}</span>
          </p>
          <p v-if="item.ask?.length" class="guide-ask">
            <strong>물어볼 것</strong>
            <span v-for="ask in item.ask" :key="ask">· {{ ask }}</span>
          </p>
          <p class="guide-basis"><strong>이론 근거</strong> {{ item.basis }}</p>
          <p class="guide-answer">
            <strong>정답 요지</strong> {{ item.answer }}
          </p>
        </div>
      </div>

      <h3>난이도 상 질문 은행 ({{ template.questions.length }}문)</h3>
      <ol class="question-bank">
        <li v-for="question in template.questions" :key="question.q">
          <p class="q">{{ question.q }}</p>
          <p class="a">정답: {{ question.a }}</p>
          <p class="w">자주 틀리는 답: {{ question.wrong }}</p>
        </li>
      </ol>
    </section>

    <!-- 응시 등록 -->
    <section class="form-card">
      <h3>구두시험 일정 잡기</h3>
      <p class="form-hint">
        달력에도 함께 올라가요. 불시 시험은 달력에 "불시 구두시험"으로만
        표시되니, 직원이 달력을 봐도 실제 질문은 그때 하시면 됩니다.
      </p>
      <div class="form-grid">
        <label>
          구분
          <select v-model="form.kind">
            <option value="REGULAR">정규 구두시험</option>
            <option value="SURPRISE">불시 구두시험</option>
          </select>
        </label>
        <label>
          날짜
          <input v-model="form.scheduledOn" type="date" />
        </label>
        <label>
          시간
          <input v-model="form.startTime" type="time" />
        </label>
        <label>
          대상
          <select v-model="form.employeeName">
            <option value="">선택해 주세요</option>
            <option
              v-for="member in staff"
              :key="member.id"
              :value="member.name"
            >
              {{ member.name }} {{ member.title ? `· ${member.title}` : "" }}
            </option>
          </select>
        </label>
        <label>
          장소
          <input
            v-model="form.place"
            type="text"
            placeholder="예: 카운터 안쪽"
          />
        </label>
        <label class="wide">
          메모(선택)
          <input
            v-model="form.note"
            type="text"
            placeholder="예: 지난달 음료 오인 사고 후 재점검"
          />
        </label>
      </div>
      <button
        type="button"
        class="primary-button"
        :disabled="isSaving"
        @click="submitExam"
      >
        응시 등록
      </button>
    </section>

    <!-- 응시 목록 -->
    <section class="exam-list">
      <h3>응시 기록</h3>
      <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>
      <p v-else-if="!exams.length" class="empty-box">
        이번 달 구두시험 기록이 아직 없어요.
      </p>
      <article v-for="exam in exams" :key="exam.id" class="exam-card">
        <header class="exam-head" @click="toggleExam(exam.id)">
          <div>
            <p class="exam-no">
              {{ exam.examNo }}
              <span class="tag">
                {{ ARC_VERBAL_KIND_LABELS[exam.kind] ?? exam.kind }}
              </span>
              <span :class="['tag', ARC_VERBAL_VERDICT_TONES[exam.verdict]]">
                {{ ARC_VERBAL_VERDICT_LABELS[exam.verdict] ?? exam.verdict }}
              </span>
            </p>
            <p class="exam-meta">
              {{ exam.scheduledOn }} · {{ exam.employeeName }} · 평가자
              {{ exam.examinerName }}
            </p>
          </div>
          <div class="exam-score">
            <strong>{{ exam.totalScore }}</strong>
            <span>/ {{ exam.maxScore || "—" }}점</span>
            <span class="percent">{{ exam.percent }}%</span>
          </div>
        </header>

        <div v-if="openIds.includes(exam.id)" class="exam-body">
          <div
            v-for="section in template?.sections ?? []"
            :key="section.key"
            class="score-section"
          >
            <h4>
              {{ section.label }}
              <span class="minutes">{{ sectionScore(exam, section) }}</span>
            </h4>
            <div
              v-for="item in section.items"
              :key="item.key"
              class="score-row"
              :class="{ critical: item.critical }"
            >
              <div class="score-label">
                <span v-if="item.critical" class="star">★</span>
                {{ item.label }}
                <span class="points">{{ item.points }}점</span>
              </div>
              <div class="score-buttons">
                <button
                  v-for="option in ARC_VERBAL_RESULTS"
                  :key="option.key"
                  type="button"
                  :class="[
                    'score-button',
                    option.key.toLowerCase(),
                    {
                      active:
                        scoreDraft(exam.id, section.key, item.key) ===
                        option.key,
                    },
                  ]"
                  @click="setScore(exam.id, section.key, item.key, option.key)"
                >
                  {{ option.label }}
                </button>
              </div>
              <input
                class="score-note"
                type="text"
                placeholder="메모(선택)"
                :value="noteDraft(exam.id, section.key, item.key)"
                @change="
                  setNote(exam.id, section.key, item.key, $event.target.value)
                "
              />
            </div>
          </div>

          <div class="grade-footer">
            <p class="preview">
              현재 입력 기준 <strong>{{ preview(exam).percent }}%</strong> ·
              예상 판정
              <strong>
                {{
                  ARC_VERBAL_VERDICT_LABELS[preview(exam).verdict] ??
                  preview(exam).verdict
                }}
              </strong>
              <span v-if="preview(exam).criticalNone">
                (핵심 항목 미수행 {{ preview(exam).criticalNone }}개)
              </span>
            </p>
            <div class="grade-grid">
              <label>
                재평가 날짜
                <input v-model="gradeForm[exam.id].retestOn" type="date" />
              </label>
              <label class="wide">
                총평
                <input
                  v-model="gradeForm[exam.id].feedback"
                  type="text"
                  placeholder="예: 압박 지혈 위치는 정확하나 이유 설명이 부족함"
                />
              </label>
            </div>
            <div class="grade-actions">
              <button
                type="button"
                class="primary-button"
                :disabled="isSaving"
                @click="saveGrade(exam)"
              >
                채점 저장
              </button>
              <button
                type="button"
                class="mini-button"
                @click="resetDraft(exam)"
              >
                입력 초기화
              </button>
              <button
                type="button"
                class="mini-button danger"
                @click="removeExam(exam)"
              >
                기록 삭제
              </button>
            </div>
          </div>
        </div>
      </article>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";

import {
  ARC_VERBAL_KIND_LABELS,
  ARC_VERBAL_RESULT_LABELS,
  ARC_VERBAL_VERDICT_LABELS,
  ARC_VERBAL_VERDICT_TONES,
  createArcVerbalExam,
  deleteArcVerbalExam,
  fetchArcVerbal,
  gradeArcVerbalExam,
} from "@/lib/arc";

const props = defineProps({
  period: { type: String, default: "" },
});

const ARC_VERBAL_RESULTS = [
  { key: "PERFORM", label: ARC_VERBAL_RESULT_LABELS.PERFORM },
  { key: "PARTIAL", label: ARC_VERBAL_RESULT_LABELS.PARTIAL },
  { key: "NONE", label: ARC_VERBAL_RESULT_LABELS.NONE },
];

const WEIGHT = { PERFORM: 1, PARTIAL: 0.5, NONE: 0 };

const board = ref({ exams: [], template: null, staff: [], summary: {} });
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const savedMessage = ref("");
const showGuide = ref(false);
const openIds = ref([]);
const drafts = reactive({});
const gradeForm = reactive({});

const form = reactive({
  kind: "REGULAR",
  scheduledOn: "",
  startTime: "15:00",
  employeeName: "",
  place: "",
  note: "",
});

const exams = computed(() => board.value.exams ?? []);
const template = computed(() => board.value.template ?? null);
const staff = computed(() => board.value.staff ?? []);
const summary = computed(() => ({
  total: 0,
  pass: 0,
  retake: 0,
  fail: 0,
  pending: 0,
  surprise: 0,
  ...(board.value.summary ?? {}),
}));
const retests = computed(() => summary.value.retests ?? []);

function flash(message) {
  savedMessage.value = message;

  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      savedMessage.value = "";
    }, 3200);
  }
}

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date()
  );
}

async function load() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const data = await fetchArcVerbal({ period: props.period || "" });
    board.value = data;
    (data.exams ?? []).forEach((exam) => ensureDraft(exam));
  } catch (error) {
    errorMessage.value = error?.message ?? "구두시험 기록을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

function ensureDraft(exam) {
  if (!drafts[exam.id]) {
    drafts[exam.id] = {};
  }

  if (!gradeForm[exam.id]) {
    gradeForm[exam.id] = {
      retestOn: exam.retestOn || "",
      feedback: exam.feedback || "",
    };
  }

  (exam.scores ?? []).forEach((score) => {
    drafts[exam.id][`${score.sectionKey}:${score.itemKey}`] = {
      result: score.result,
      note: score.note || "",
    };
  });
}

function scoreDraft(examId, sectionKey, itemKey) {
  return drafts[examId]?.[`${sectionKey}:${itemKey}`]?.result ?? "";
}

function noteDraft(examId, sectionKey, itemKey) {
  return drafts[examId]?.[`${sectionKey}:${itemKey}`]?.note ?? "";
}

function setScore(examId, sectionKey, itemKey, result) {
  const key = `${sectionKey}:${itemKey}`;
  drafts[examId] = drafts[examId] ?? {};
  drafts[examId][key] = { result, note: drafts[examId][key]?.note ?? "" };
}

function setNote(examId, sectionKey, itemKey, note) {
  const key = `${sectionKey}:${itemKey}`;
  drafts[examId] = drafts[examId] ?? {};
  drafts[examId][key] = {
    result: drafts[examId][key]?.result ?? "",
    note,
  };
}

function resetDraft(exam) {
  drafts[exam.id] = {};
  gradeForm[exam.id] = { retestOn: "", feedback: "" };
  flash("입력을 초기화했어요. 저장을 눌러야 서버에 반영돼요.");
}

function entriesOf(examId) {
  return Object.entries(drafts[examId] ?? {})
    .filter(([, value]) => value?.result)
    .map(([key, value]) => {
      const [sectionKey, itemKey] = key.split(":");
      return { sectionKey, itemKey, result: value.result, note: value.note };
    });
}

// 서버와 같은 규칙으로 미리 계산해 화면에 보여 줍니다(저장 시 서버가 다시 계산).
function preview(exam) {
  const entries = entriesOf(exam.id);
  const itemIndex = new Map();

  for (const section of template.value?.sections ?? []) {
    for (const item of section.items) {
      itemIndex.set(`${section.key}:${item.key}`, item);
    }
  }

  let score = 0;
  let maxScore = 0;
  let criticalNone = 0;

  for (const entry of entries) {
    const item = itemIndex.get(`${entry.sectionKey}:${entry.itemKey}`);
    if (!item) continue;

    maxScore += Number(item.points ?? 0);
    score += Number(item.points ?? 0) * WEIGHT[entry.result];

    if (entry.result === "NONE" && item.critical) criticalNone += 1;
  }

  const percent =
    maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0;
  const rules = template.value?.verdictRules ?? { pass: 85, retake: 70 };
  let verdict = "PENDING";

  if (maxScore > 0) {
    if (percent >= rules.pass && criticalNone === 0) verdict = "PASS";
    else if (percent >= rules.retake && criticalNone < 2) verdict = "RETAKE";
    else verdict = "FAIL";
  }

  return { score, maxScore, percent, verdict, criticalNone };
}

function sectionScore(exam, section) {
  const entries = entriesOf(exam.id).filter(
    (entry) => entry.sectionKey === section.key
  );

  if (!entries.length) return `${section.minutes}분 · 미채점`;

  let score = 0;
  let max = 0;

  for (const item of section.items) {
    const found = entries.find((entry) => entry.itemKey === item.key);
    max += Number(item.points ?? 0);

    if (found) score += Number(item.points ?? 0) * WEIGHT[found.result];
  }

  return `${Math.round(score * 100) / 100} / ${max}점`;
}

function toggleExam(examId) {
  openIds.value = openIds.value.includes(examId)
    ? openIds.value.filter((item) => item !== examId)
    : [...openIds.value, examId];
}

function toggleGuide() {
  showGuide.value = !showGuide.value;
}

async function submitExam() {
  if (!form.scheduledOn) {
    errorMessage.value = "구두시험 날짜를 선택해 주세요.";
    return;
  }

  if (!form.employeeName) {
    errorMessage.value = "누구를 평가하는지 선택해 주세요.";
    return;
  }

  isSaving.value = true;
  errorMessage.value = "";

  try {
    await createArcVerbalExam({ ...form });
    flash("구두시험 일정을 등록했어요.");
    form.employeeName = "";
    form.note = "";
    await load();
  } catch (error) {
    errorMessage.value = error?.message ?? "일정을 등록하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function saveGrade(exam) {
  isSaving.value = true;
  errorMessage.value = "";

  try {
    await gradeArcVerbalExam(exam.id, {
      entries: entriesOf(exam.id),
      retestOn: gradeForm[exam.id]?.retestOn || "",
      feedback: gradeForm[exam.id]?.feedback || "",
    });
    flash("채점을 저장했어요.");
    await load();
    openIds.value = [...new Set([...openIds.value, exam.id])];
  } catch (error) {
    errorMessage.value = error?.message ?? "채점을 저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function removeExam(exam) {
  if (!window.confirm(`${exam.examNo} 구두시험 기록을 삭제할까요?`)) return;

  isSaving.value = true;

  try {
    await deleteArcVerbalExam(exam.id);
    flash("기록을 삭제했어요.");
    await load();
  } catch (error) {
    errorMessage.value = error?.message ?? "기록을 삭제하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

watch(
  () => props.period,
  () => load()
);

onMounted(() => {
  form.scheduledOn = todayIso();
  load();
});
</script>

<style scoped>
.verbal-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #f8fafc;
  color: #111827;
}

.panel-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.paper-link-button {
  padding: 8px 14px;
  border: 1px solid #1d4ed8;
  border-radius: 9px;
  background: #1d4ed8;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}

.paper-link-button:hover {
  background: #1e40af;
}

.panel-head h2 {
  margin: 0 0 6px;
  font-size: 18px;
}

.panel-desc {
  max-width: 720px;
  margin: 0;
  color: #4b5563;
  font-size: 13px;
  line-height: 1.6;
}

.verbal-stats {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.verbal-stats article {
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}

.verbal-stats .warn {
  border-color: #fcd34d;
  background: #fffbeb;
}

.stat-label {
  margin: 0 0 4px;
  color: #6b7280;
  font-size: 12px;
}

.stat-value {
  font-size: 20px;
}

.stat-hint {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 12px;
}

.retest-list {
  margin: 0;
  padding: 12px 16px;
  border: 1px solid #fcd34d;
  border-radius: 12px;
  background: #fffbeb;
  list-style: none;
}

.retest-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 4px 0;
  font-size: 13px;
}

.guide-block,
.form-card,
.exam-list {
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}

.guide-block h3,
.form-card h3,
.exam-list h3 {
  margin: 0 0 8px;
  font-size: 15px;
}

.rule-list {
  margin: 0 0 14px;
  padding-left: 18px;
  color: #374151;
  font-size: 13px;
  line-height: 1.7;
}

.guide-section {
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
}

.guide-section header {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
}

.guide-section h4 {
  margin: 0;
  font-size: 14px;
}

.section-desc {
  margin: 4px 0 10px;
  color: #6b7280;
  font-size: 12px;
}

.guide-item {
  padding: 10px 0;
  border-top: 1px dashed #e5e7eb;
}

.guide-item.critical {
  border-left: 3px solid #dc2626;
  padding-left: 10px;
}

.guide-item-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
}

.star {
  color: #dc2626;
}

.points {
  margin-left: 6px;
  color: #6b7280;
  font-size: 11px;
  font-weight: 500;
}

.guide-criteria {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin: 0 0 4px;
  color: #374151;
  font-size: 12px;
}

.guide-ask,
.guide-basis,
.guide-answer {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin: 2px 0;
  color: #4b5563;
  font-size: 12px;
  line-height: 1.6;
}

.guide-basis strong,
.guide-ask strong,
.guide-answer strong {
  color: #111827;
}

.question-bank {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.6;
}

.question-bank .q {
  margin: 8px 0 2px;
  font-weight: 600;
}

.question-bank .a {
  margin: 0;
  color: #047857;
}

.question-bank .w {
  margin: 0 0 6px;
  color: #b45309;
}

.form-hint {
  margin: 0 0 10px;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.6;
}

.form-grid,
.grade-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  margin-bottom: 12px;
}

.form-grid .wide,
.grade-grid .wide {
  grid-column: 1 / -1;
}

.form-grid label,
.grade-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #374151;
  font-size: 12px;
}

.form-grid input,
.form-grid select,
.grade-grid input {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 13px;
}

.exam-card {
  margin-bottom: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
}

.exam-head {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: #f9fafb;
  cursor: pointer;
}

.exam-no {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin: 0 0 2px;
  font-size: 13px;
  font-weight: 600;
}

.exam-meta {
  margin: 0;
  color: #6b7280;
  font-size: 12px;
}

.exam-score {
  display: flex;
  gap: 6px;
  align-items: baseline;
  font-size: 13px;
  color: #6b7280;
}

.exam-score strong {
  color: #111827;
  font-size: 18px;
}

.exam-body {
  padding: 14px;
  border-top: 1px solid #e5e7eb;
}

.score-section {
  margin-bottom: 14px;
}

.score-section h4 {
  display: flex;
  gap: 8px;
  margin: 0 0 6px;
  font-size: 13px;
}

.score-row {
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(180px, 1.4fr) auto minmax(120px, 1fr);
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px dashed #f1f5f9;
}

.score-row.critical .score-label {
  border-left: 3px solid #dc2626;
  padding-left: 8px;
}

.score-label {
  font-size: 12px;
  line-height: 1.5;
}

.score-buttons {
  display: flex;
  gap: 4px;
}

.score-button {
  padding: 5px 9px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  font-size: 12px;
  cursor: pointer;
}

.score-button.perform.active {
  border-color: #047857;
  background: #ecfdf5;
  color: #047857;
  font-weight: 600;
}

.score-button.partial.active {
  border-color: #b45309;
  background: #fffbeb;
  color: #b45309;
  font-weight: 600;
}

.score-button.none.active {
  border-color: #b91c1c;
  background: #fef2f2;
  color: #b91c1c;
  font-weight: 600;
}

.score-note {
  padding: 6px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 12px;
}

.grade-footer {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #e5e7eb;
}

.preview {
  margin: 0 0 10px;
  font-size: 13px;
}

.grade-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  padding: 2px 7px;
  border-radius: 999px;
  background: #e5e7eb;
  color: #374151;
  font-size: 11px;
  font-weight: 600;
}

.tag.ok {
  background: #d1fae5;
  color: #047857;
}

.tag.warn {
  background: #fef3c7;
  color: #b45309;
}

.tag.danger {
  background: #fee2e2;
  color: #b91c1c;
}

.tag.info {
  background: #dbeafe;
  color: #1d4ed8;
}

.tag.muted {
  background: #e5e7eb;
  color: #6b7280;
}

.minutes {
  color: #6b7280;
  font-size: 11px;
  font-weight: 500;
}

.muted {
  color: #9ca3af;
}

.primary-button {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: #b45309;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.mini-button {
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  color: #374151;
  font-size: 12px;
  cursor: pointer;
}

.mini-button.danger {
  border-color: #fca5a5;
  color: #b91c1c;
}

.ghost-button {
  padding: 7px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  color: #374151;
  font-size: 12px;
  cursor: pointer;
}

.error-box {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #fecaca;
  border-radius: 10px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 13px;
}

.ok-box {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  background: #ecfdf5;
  color: #047857;
  font-size: 13px;
}

.empty-box {
  margin: 0;
  padding: 16px;
  border: 1px dashed #d1d5db;
  border-radius: 10px;
  color: #6b7280;
  font-size: 13px;
  text-align: center;
}
</style>
