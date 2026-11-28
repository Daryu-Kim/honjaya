<template>
  <div class="admin-arc-routine-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>월간 운영 루틴</h1>
        <p class="description">
          AS-CAL-001 「1년 업무달력」의 월간 업무를 날짜 순서대로 모았어요. 월초
          준비 → 현장 점검 → 보충·정산 → 교육 → 검토·마감 순서로 진행하고, 끝낸
          항목만 기록으로 남겨요.
        </p>
      </div>
      <nav class="header-links">
        <router-link to="/admin/arc" class="link-button">
          응급안전 홈
        </router-link>
      </nav>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="savedMessage" class="ok-box">{{ savedMessage }}</p>

    <section class="period-bar">
      <button type="button" class="ghost-button" @click="shiftPeriod(-1)">
        ← 이전 달
      </button>
      <div class="period-label">
        <strong>{{ periodLabel }}</strong>
        <span v-if="today.day"> 오늘 {{ today.day }}일 · {{ todayHint }} </span>
        <span v-else>이번 달이 아니에요. 기록만 확인할 수 있어요.</span>
      </div>
      <button type="button" class="ghost-button" @click="shiftPeriod(1)">
        다음 달 →
      </button>
      <button
        v-if="!isCurrentPeriod"
        type="button"
        class="ghost-button"
        @click="goCurrentPeriod"
      >
        이번 달로
      </button>
    </section>

    <section class="progress-panel">
      <div class="progress-head">
        <strong
          >{{ routine.progress.done }} /
          {{ routine.progress.total }} 완료</strong
        >
        <span>{{ routine.progress.percent }}%</span>
      </div>
      <div class="progress-track">
        <div
          class="progress-fill"
          :style="{ width: `${routine.progress.percent}%` }"
        ></div>
      </div>

      <ul v-if="routine.alerts.length" class="alert-list">
        <li
          v-for="alert in routine.alerts"
          :key="alert.message"
          :class="['alert-item', alert.level.toLowerCase()]"
        >
          {{ alert.message }}
        </li>
      </ul>
      <p v-else class="helper-text">
        이번 달 루틴이 모두 정리됐어요. 다음 달 루틴은 1일이 되면 자동으로
        만들어져요.
      </p>
    </section>

    <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>

    <section
      v-for="group in groupedSteps"
      :key="group.phase"
      class="phase-panel"
    >
      <h2>{{ group.phase }}</h2>

      <article
        v-for="step in group.steps"
        :key="step.key"
        :class="['step-card', step.state.toLowerCase()]"
      >
        <header class="step-head">
          <div class="step-title-row">
            <h3>{{ step.title }}</h3>
            <span :class="['state-chip', step.state.toLowerCase()]">
              {{ stateLabel(step) }}
            </span>
          </div>
          <p class="step-meta">
            <span>기한 {{ step.windowLabel }}</span>
            <span>담당 {{ step.owner }}</span>
            <span v-if="step.requiresSignature" class="sign-badge">
              대표 확인·서명
            </span>
          </p>
          <p class="step-outputs">산출물: {{ step.outputs }}</p>
        </header>

        <ul class="checklist">
          <li v-for="item in step.items" :key="item.key">
            <label>
              <input
                v-model="drafts[step.key].checklist[item.key]"
                type="checkbox"
              />
              <span>{{ item.label }}</span>
            </label>
          </li>
          <li v-if="!step.items.length" class="empty-line">
            이 달은 체크 항목이 없어요. 아래에서 항목을 추가할 수 있어요.
          </li>
        </ul>

        <div v-if="isDirector" class="item-editor">
          <div class="editor-head">
            <strong>체크리스트 문구·항목 편집</strong>
            <button
              type="button"
              class="mini-button"
              @click="toggleItemEditor(step)"
            >
              {{ itemEditorOpen[step.key] ? "편집 닫기" : "편집 열기" }}
            </button>
          </div>

          <template v-if="itemEditorOpen[step.key]">
            <p class="helper-text">
              ARC 대표만 고칠 수 있어요. 이 달에만 적용되고, 다음 달은 원래
              항목으로 다시 시작해요.
            </p>

            <div
              v-for="item in step.items"
              :key="`item-edit-${item.key}`"
              class="item-row"
            >
              <input
                v-model="itemDrafts[itemDraftKey(step.key, item.key)]"
                type="text"
                maxlength="160"
                class="item-label-input"
              />
              <button
                type="button"
                class="mini-button"
                :disabled="itemBusy[step.key]"
                @click="renameItem(step, item)"
              >
                문구 저장
              </button>
              <button
                type="button"
                class="mini-button danger"
                :disabled="itemBusy[step.key]"
                @click="removeItem(step, item)"
              >
                {{ isCustomItem(item) ? "삭제" : "숨기기" }}
              </button>
            </div>

            <div class="item-row">
              <input
                v-model="newItemDrafts[step.key]"
                type="text"
                maxlength="160"
                class="item-label-input"
                placeholder="예: 냉장고 온도 기록지 교체 확인"
                @keyup.enter="addItem(step)"
              />
              <button
                type="button"
                class="mini-button"
                :disabled="itemBusy[step.key]"
                @click="addItem(step)"
              >
                항목 추가
              </button>
            </div>

            <div v-if="step.hiddenItems && step.hiddenItems.length">
              <p class="helper-text">숨긴 기본 항목</p>
              <div
                v-for="item in step.hiddenItems"
                :key="`item-hidden-${item.key}`"
                class="item-row"
              >
                <span class="hidden-item-label">{{ item.label }}</span>
                <button
                  type="button"
                  class="mini-button"
                  :disabled="itemBusy[step.key]"
                  @click="restoreItem(step, item)"
                >
                  되돌리기
                </button>
              </div>
            </div>
          </template>
        </div>

        <div class="step-actions-editor">
          <div class="editor-head">
            <strong>보완·교체 필요품 / 후속조치</strong>
            <button type="button" class="mini-button" @click="addAction(step)">
              + 한 줄 추가
            </button>
          </div>

          <p v-if="!drafts[step.key].actions.length" class="empty-line">
            없으면 비워 두세요. 점검 중 나온 보완 사항만 적어요.
          </p>

          <div
            v-for="(action, index) in drafts[step.key].actions"
            :key="`${step.key}-action-${index}`"
            class="action-row"
          >
            <input
              v-model="action.item"
              type="text"
              placeholder="품목"
              class="action-item"
            />
            <input
              v-model="action.reason"
              type="text"
              placeholder="사유"
              class="action-reason"
            />
            <input
              v-model="action.qty"
              type="text"
              placeholder="수량"
              class="action-qty"
            />
            <input v-model="action.dueDate" type="date" class="action-due" />
            <label class="action-done">
              <input v-model="action.done" type="checkbox" />
              완료
            </label>
            <button
              type="button"
              class="mini-button danger"
              @click="removeAction(step, index)"
            >
              삭제
            </button>
          </div>
        </div>

        <label class="note-field">
          <span>메모</span>
          <textarea
            v-model="drafts[step.key].note"
            rows="2"
            placeholder="예: Site C 보충 완료(영수증 EVI-2026-1104), 임시은 교육 참석"
          ></textarea>
        </label>

        <footer class="step-foot">
          <div class="foot-buttons">
            <button
              type="button"
              class="primary-button"
              :disabled="isSaving[step.key]"
              @click="save(step, 'DONE')"
            >
              {{ step.status === "DONE" ? "수정 저장" : "완료로 저장" }}
            </button>
            <button
              v-if="step.status !== 'SKIPPED'"
              type="button"
              class="ghost-button"
              :disabled="isSaving[step.key]"
              @click="save(step, 'SKIPPED')"
            >
              이번 달 건너뜀
            </button>
            <button
              v-if="step.status !== 'PENDING'"
              type="button"
              class="ghost-button"
              :disabled="isSaving[step.key]"
              @click="reopen(step)"
            >
              되돌리기
            </button>
            <router-link
              v-if="step.link"
              :to="step.link"
              class="link-button small"
            >
              관련 화면
            </router-link>
          </div>
          <span class="checked-count">
            체크 {{ countChecked(step) }} / {{ step.items.length }}
            <template v-if="step.doneAt">
              · {{ step.doneByName || "기록자" }}
              {{ formatArcDateTime(step.doneAt) }}
            </template>
          </span>
        </footer>
      </article>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import {
  fetchArcRoutine,
  formatArcDateTime,
  saveArcRoutineItem,
  saveArcRoutineStep,
} from "@/lib/arc";
import { staffAuthState } from "@/lib/staffAuth";

const routine = ref({
  period: "",
  month: 0,
  daysInMonth: 0,
  today: { period: "", day: null },
  steps: [],
  progress: { done: 0, total: 0, percent: 0 },
  alerts: [],
});
const drafts = reactive({});
const itemDrafts = reactive({});
const newItemDrafts = reactive({});
const itemEditorOpen = reactive({});
const itemBusy = reactive({});
const isSaving = reactive({});
const isLoading = ref(false);
const errorMessage = ref("");
const savedMessage = ref("");

// 체크리스트 문구·항목 편집은 ARC 대표(총괄)만 할 수 있어요.
const isDirector = computed(() =>
  Boolean(staffAuthState.employee?.isArcDirector)
);

const today = computed(() => routine.value.today ?? { period: "", day: null });
const isCurrentPeriod = computed(
  () => Boolean(today.value.day) && routine.value.period === today.value.period
);

const periodLabel = computed(() => {
  const period = routine.value.period;

  if (!period) return "";

  return `${period.slice(0, 4)}년 ${Number(period.slice(5, 7))}월`;
});

const todayHint = computed(() => {
  const day = today.value.day;
  const active = routine.value.steps.filter((step) => step.state === "ACTIVE");

  if (!day) return "";

  if (active.length) {
    return `지금 할 일 ${active.length}건`;
  }

  const upcoming = routine.value.steps.find(
    (step) => step.state === "UPCOMING"
  );

  return upcoming ? `다음: ${upcoming.title}` : "남은 항목 없음";
});

const groupedSteps = computed(() => {
  const groups = [];

  routine.value.steps.forEach((step) => {
    const last = groups[groups.length - 1];

    if (last && last.phase === step.phase) {
      last.steps.push(step);
      return;
    }

    groups.push({ phase: step.phase, steps: [step] });
  });

  return groups;
});

function stateLabel(step) {
  if (step.status === "DONE") return "완료";
  if (step.status === "SKIPPED") return "건너뜀";
  if (step.state === "ACTIVE") return "진행 기간";
  if (step.state === "OVERDUE") return "기한 지남";
  if (step.state === "UPCOMING") return "예정";

  return "미완료";
}

function buildDraft(step) {
  const checklist = {};

  step.items.forEach((item) => {
    checklist[item.key] = Boolean(step.checklist?.[item.key]);
  });

  return {
    status: step.status,
    checklist,
    note: step.note ?? "",
    actions: (step.actions ?? []).map((row) => ({ ...row })),
  };
}

function syncDrafts(steps) {
  Object.keys(drafts).forEach((key) => {
    delete drafts[key];
  });

  steps.forEach((step) => {
    drafts[step.key] = buildDraft(step);
    resetItemDrafts(step);
  });
}

function itemDraftKey(stepKey, itemKey) {
  return `${stepKey}::${itemKey}`;
}

function isCustomItem(item) {
  return String(item?.key ?? "").startsWith("custom-");
}

function toggleItemEditor(step) {
  itemEditorOpen[step.key] = !itemEditorOpen[step.key];
}

function resetItemDrafts(step) {
  step.items.forEach((item) => {
    itemDrafts[itemDraftKey(step.key, item.key)] = item.label;
  });
}

async function submitItemEdit(step, payload) {
  if (itemBusy[step.key]) return false;

  itemBusy[step.key] = true;
  errorMessage.value = "";
  savedMessage.value = "";

  try {
    const result = await saveArcRoutineItem({
      period: routine.value.period,
      stepKey: step.key,
      ...payload,
    });

    applySavedStep(result, { keepDraft: true });
    savedMessage.value = `'${step.title}' 체크리스트를 수정했어요.`;
    return true;
  } catch (error) {
    errorMessage.value = error?.message || "체크리스트를 수정하지 못했어요.";
    return false;
  } finally {
    itemBusy[step.key] = false;
  }
}

function renameItem(step, item) {
  const label = String(
    itemDrafts[itemDraftKey(step.key, item.key)] ?? ""
  ).trim();

  if (!label) {
    errorMessage.value = "항목 내용을 적어 주세요.";
    return;
  }

  submitItemEdit(step, { action: "rename", itemKey: item.key, label });
}

function removeItem(step, item) {
  submitItemEdit(step, { action: "remove", itemKey: item.key });
}

function restoreItem(step, item) {
  submitItemEdit(step, { action: "restore", itemKey: item.key });
}

function addItem(step) {
  const label = String(newItemDrafts[step.key] ?? "").trim();

  if (!label) {
    errorMessage.value = "추가할 항목 내용을 적어 주세요.";
    return;
  }

  submitItemEdit(step, { action: "add", label }).then((ok) => {
    if (ok) {
      newItemDrafts[step.key] = "";
    }
  });
}

function countChecked(step) {
  const draft = drafts[step.key];

  if (!draft) return 0;

  return step.items.filter((item) => draft.checklist[item.key]).length;
}

function addAction(step) {
  drafts[step.key].actions.push({
    item: "",
    reason: "",
    qty: "",
    dueDate: "",
    done: false,
  });
}

function removeAction(step, index) {
  drafts[step.key].actions.splice(index, 1);
}

function shiftPeriod(delta) {
  const period = routine.value.period;

  if (!period) return;

  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const shifted = new Date(year, month - 1 + delta, 1);
  const next = `${shifted.getFullYear()}-${String(
    shifted.getMonth() + 1
  ).padStart(2, "0")}`;

  loadRoutine(next);
}

function goCurrentPeriod() {
  loadRoutine(today.value.period);
}

async function loadRoutine(period = "") {
  isLoading.value = true;
  errorMessage.value = "";
  savedMessage.value = "";

  try {
    const data = await fetchArcRoutine(period);

    routine.value = {
      period: data?.period ?? "",
      month: data?.month ?? 0,
      daysInMonth: data?.daysInMonth ?? 0,
      today: data?.today ?? { period: "", day: null },
      steps: Array.isArray(data?.steps) ? data.steps : [],
      progress: data?.progress ?? { done: 0, total: 0, percent: 0 },
      alerts: Array.isArray(data?.alerts) ? data.alerts : [],
    };
    syncDrafts(routine.value.steps);
  } catch (error) {
    errorMessage.value = error?.message || "운영 루틴을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function save(step, status) {
  if (isSaving[step.key]) return;

  const draft = drafts[step.key];

  isSaving[step.key] = true;
  errorMessage.value = "";
  savedMessage.value = "";

  try {
    const result = await saveArcRoutineStep(step.key, {
      period: routine.value.period,
      status,
      checklist: draft.checklist,
      actions: draft.actions,
      note: draft.note,
    });

    applySavedStep(result);
    savedMessage.value =
      status === "SKIPPED"
        ? `'${step.title}'을(를) 이번 달 건너뜀으로 표시했어요.`
        : `'${step.title}' 기록을 저장했어요.`;
  } catch (error) {
    errorMessage.value = error?.message || "루틴 기록을 저장하지 못했어요.";
  } finally {
    isSaving[step.key] = false;
  }
}

async function reopen(step) {
  if (isSaving[step.key]) return;

  isSaving[step.key] = true;
  errorMessage.value = "";
  savedMessage.value = "";

  try {
    const result = await saveArcRoutineStep(step.key, {
      period: routine.value.period,
      status: "PENDING",
    });

    applySavedStep(result);
    savedMessage.value = `'${step.title}'을(를) 미완료로 되돌렸어요.`;
  } catch (error) {
    errorMessage.value = error?.message || "루틴 기록을 되돌리지 못했어요.";
  } finally {
    isSaving[step.key] = false;
  }
}

function applySavedStep(result, { keepDraft = false } = {}) {
  if (!result?.step) {
    loadRoutine(routine.value.period);
    return;
  }

  const previous = drafts[result.step.key];

  routine.value.steps = routine.value.steps.map((row) =>
    row.key === result.step.key ? result.step : row
  );
  routine.value.progress = result.progress ?? routine.value.progress;
  routine.value.alerts = Array.isArray(result.alerts)
    ? result.alerts
    : routine.value.alerts;
  drafts[result.step.key] = buildDraft(result.step);
  resetItemDrafts(result.step);

  // 항목 문구만 고쳤을 때는 작성 중이던 체크·메모·후속조치를 그대로 둡니다.
  if (keepDraft && previous) {
    result.step.items.forEach((item) => {
      drafts[result.step.key].checklist[item.key] = Boolean(
        previous.checklist[item.key]
      );
    });
    drafts[result.step.key].note = previous.note;
    drafts[result.step.key].actions = previous.actions;
  }
}

onMounted(() => loadRoutine());
</script>

<style scoped lang="scss">
@use "../../scss/_arc-ui" as *;
.admin-arc-routine-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  min-height: 100%;
  color: #ffffff;
}

.header-links {
  flex-shrink: 0;
}

.link-button {
  &.small {
    padding: 7px 12px;
    font-size: 12px;
  }
}

.period-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 18px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
}

.period-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 200px;

  strong {
    font-size: 17px;
    font-weight: 800;
  }

  span {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
  }
}

.ghost-button {
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.progress-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 18px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
}

.progress-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 14px;

  span {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.6);
  }
}

.progress-track {
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #34d399, #22d3ee);
  transition: width 0.2s ease;
}

.alert-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.alert-item {
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 12.5px;
  line-height: 1.5;

  &.critical {
    background: rgba(248, 113, 113, 0.16);
    color: #fca5a5;
  }

  &.warn {
    background: rgba(251, 191, 36, 0.14);
    color: #fcd34d;
  }

  &.info {
    background: rgba(56, 189, 248, 0.14);
    color: #7dd3fc;
  }
}

.phase-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;

  h2 {
    margin: 6px 0 0;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.78);
  }
}

.step-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.07);

  &.active {
    border-color: rgba(56, 189, 248, 0.5);
    box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.12);
  }

  &.overdue {
    border-color: rgba(248, 113, 113, 0.45);
  }

  &.done {
    background: rgba(52, 211, 153, 0.08);
  }

  &.skipped {
    opacity: 0.75;
  }
}

.step-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 800;
  }
}

.state-chip {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.78);

  &.active {
    background: rgba(56, 189, 248, 0.22);
    color: #bae6fd;
  }

  &.overdue {
    background: rgba(248, 113, 113, 0.22);
    color: #fecaca;
  }

  &.done {
    background: rgba(52, 211, 153, 0.22);
    color: #a7f3d0;
  }

  &.upcoming {
    background: rgba(148, 163, 184, 0.2);
    color: #e2e8f0;
  }
}

.step-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 8px 0 0;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.62);
}

.sign-badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(251, 191, 36, 0.18);
  color: #fcd34d;
  font-weight: 700;
}

.step-outputs {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.48);
}

.checklist {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 8px 16px;
  margin: 0;
  padding: 0;
  list-style: none;

  label {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 13px;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.82);
    cursor: pointer;
  }

  input[type="checkbox"] {
    margin-top: 3px;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    accent-color: #34d399;
  }
}

.step-actions-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.18);
}

.item-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 1px dashed rgba(129, 140, 248, 0.45);
  background: rgba(99, 102, 241, 0.08);
}

.item-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 6px;
  align-items: center;
}

.item-label-input {
  padding: 7px 9px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: #ffffff;
  font-size: 12px;
  min-width: 0;
}

.hidden-item-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  text-decoration: line-through;
}

.editor-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.7);
}

.mini-button {
  &.danger {
    border-color: rgba(248, 113, 113, 0.35);
    color: #fca5a5;
  }
}

.empty-line {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.action-row {
  display: grid;
  grid-template-columns: 1.2fr 2fr 0.6fr 1fr auto auto;
  gap: 6px;
  align-items: center;

  input[type="text"],
  input[type="date"] {
    padding: 7px 9px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.06);
    color: #ffffff;
    font-size: 12px;
    min-width: 0;
  }
}

.action-done {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
}

.note-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.7);

  textarea {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.06);
    color: #ffffff;
    font-size: 13px;
    font-family: inherit;
    resize: vertical;
  }
}

.step-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.foot-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.checked-count {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.5);
}

@media (max-width: 900px) {
  .action-row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
