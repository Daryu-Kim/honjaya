<template>
  <div class="admin-arc-training-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>월간 교육·OT</h1>
        <p class="description">
          AS-CAL-001 「1년 업무달력」의 월 1회 정기교육·OT와 AS-KIT-001 직원
          정기교육을 한 화면에서 관리해요. 일정을 먼저 잡고, 출석·구두평가를
          남기면 교육일지·증빙까지 한 번에 정리돼요.
        </p>
      </div>
      <nav class="header-links">
        <router-link to="/admin/arc" class="link-button">
          응급안전 홈
        </router-link>
        <router-link to="/admin/arc/routine" class="link-button">
          월간 운영 루틴
        </router-link>
        <router-link to="/admin/arc/training/guide" class="link-button">
          교육자료·출력
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
        <span v-if="isCurrentPeriod"> 오늘 {{ today.day }}일 </span>
        <span v-else>지난·다음 달 기록을 보고 있어요.</span>
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

    <section class="stat-grid">
      <article class="stat-card">
        <p class="stat-label">이번 달 일정</p>
        <strong class="stat-value">{{ summary.total }}건</strong>
        <p class="stat-hint">
          완료 {{ summary.done }} · 예정 {{ summary.planned }}
        </p>
      </article>
      <article class="stat-card">
        <p class="stat-label">교육 시간</p>
        <strong class="stat-value">{{ summary.minutes }}분</strong>
        <p class="stat-hint">완료된 교육 기준</p>
      </article>
      <article class="stat-card">
        <p class="stat-label">참석 누적</p>
        <strong class="stat-value">{{ summary.attended }}명</strong>
        <p class="stat-hint">이번 달 출석 체크 기준</p>
      </article>
      <article class="stat-card warning">
        <p class="stat-label">보충·재교육 대상</p>
        <strong class="stat-value">{{ followups.length }}건</strong>
        <p class="stat-hint">불참은 14일 이내 보충</p>
      </article>
    </section>

    <section v-if="followups.length" class="followup-panel">
      <h2>보충·재교육 확인</h2>
      <ul>
        <li
          v-for="row in followups"
          :key="`${row.sessionNo}-${row.employeeName}`"
        >
          <strong>{{ row.employeeName }}</strong>
          <span>{{ resultLabel(row.result) }}</span>
          <span class="due" v-if="row.makeupDueOn">
            {{ row.makeupDueOn }}까지 보충
          </span>
          <span class="session-ref">{{ row.sessionNo }}</span>
        </li>
      </ul>
    </section>

    <nav class="tab-bar">
      <button
        v-for="item in TABS"
        :key="item.key"
        type="button"
        :class="['tab-button', { active: tab === item.key }]"
        @click="tab = item.key"
      >
        {{ item.label }}
      </button>
    </nav>

    <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>

    <!-- 달력 -->
    <section v-if="tab === 'calendar'" class="calendar-panel">
      <div class="calendar-legend">
        <span
          v-for="kind in catalog.kinds"
          :key="kind.key"
          :class="['legend-chip', kind.key.toLowerCase()]"
        >
          {{ kind.label }}
        </span>
        <span class="legend-chip routine">월간 운영 루틴</span>
      </div>

      <div class="calendar-weekhead">
        <span v-for="label in WEEKDAYS" :key="label">{{ label }}</span>
      </div>

      <div class="calendar-grid">
        <div
          v-for="cell in calendarCells"
          :key="cell.key"
          :class="[
            'calendar-cell',
            {
              empty: !cell.day,
              today: cell.isToday,
              selected: cell.iso && cell.iso === selectedIso,
            },
          ]"
          @click="selectDay(cell)"
        >
          <span v-if="cell.day" class="day-number">{{ cell.day }}</span>
          <ul v-if="cell.day" class="cell-chips">
            <li
              v-for="session in cell.sessions"
              :key="session.id"
              :class="[
                'chip',
                'session',
                session.kind.toLowerCase(),
                session.status.toLowerCase(),
              ]"
              :title="session.title"
              @click.stop="openSession(session.id)"
            >
              {{ kindShort(session.kind) }} · {{ session.title }}
            </li>
            <li
              v-for="chip in cell.routines"
              :key="chip.key"
              class="chip routine"
              :title="chip.windowLabel"
            >
              {{ chip.label }}
            </li>
          </ul>
        </div>
      </div>

      <div v-if="selectedDay" class="day-detail">
        <header>
          <strong>{{ selectedIso }}</strong>
          <span>일정 {{ selectedDay.sessions.length }}건</span>
          <button
            v-if="canWrite"
            type="button"
            class="mini-button"
            @click="startCreate(selectedIso)"
          >
            이 날짜로 일정 등록
          </button>
        </header>
        <ul v-if="selectedDay.sessions.length" class="day-session-list">
          <li v-for="session in selectedDay.sessions" :key="session.id">
            <strong>{{ session.startTime }} {{ session.title }}</strong>
            <span>
              {{ kindLabel(session.kind) }} · {{ session.durationMin }}분 ·
              {{ statusLabel(session.status) }}
            </span>
            <button
              type="button"
              class="mini-button"
              @click="openSession(session.id)"
            >
              출석 보기
            </button>
          </li>
        </ul>
        <p v-else class="empty-line">
          이 날은 잡힌 교육이 없어요. 루틴의 교육 창(16~20일)을 참고하세요.
        </p>
      </div>
    </section>

    <!-- 일정·출석 -->
    <section v-else-if="tab === 'sessions'" class="session-panel">
      <article v-if="canWrite" class="form-panel">
        <header class="form-head">
          <h2>새 교육·OT 일정 등록</h2>
          <span class="helper-text">
            등록은 ARC 총괄만 할 수 있어요. 자료는 교육 3일 전까지 준비해요.
          </span>
        </header>

        <div class="form-grid">
          <label>
            구분
            <select v-model="form.kind" @change="applyKindDefault">
              <option
                v-for="kind in catalog.kinds"
                :key="kind.key"
                :value="kind.key"
              >
                {{ kind.label }}
              </option>
            </select>
          </label>
          <label>
            교육일
            <input v-model="form.scheduledOn" type="date" />
          </label>
          <label>
            시작 시간
            <input v-model="form.startTime" type="time" />
          </label>
          <label>
            소요 시간(분)
            <input
              v-model.number="form.durationMin"
              type="number"
              min="5"
              max="480"
            />
          </label>
          <label>
            장소
            <input
              v-model="form.place"
              type="text"
              placeholder="예: 혼자야 2층"
            />
          </label>
          <label>
            교육자
            <input
              v-model="form.instructor"
              type="text"
              placeholder="예: 최윤희 (ARC 총괄)"
            />
          </label>
          <label class="span-2">
            일정 제목 (비우면 자동)
            <input
              v-model="form.title"
              type="text"
              placeholder="예: 11월 정기교육 — 출혈·화상"
            />
          </label>
          <label class="span-2">
            증빙ID (교육일지·사진)
            <input
              v-model="form.evidenceId"
              type="text"
              placeholder="예: EDU-20261118-01"
            />
          </label>
        </div>

        <p class="helper-text" v-if="form.kind">
          {{ kindDescription }}
        </p>

        <div class="module-picker">
          <div class="picker-head">
            <strong>교육 모듈</strong>
            <span class="helper-text">
              선택한 모듈 합계 {{ selectedModulesMinutes }}분
            </span>
          </div>
          <div
            v-for="group in moduleGroups"
            :key="group.phase"
            class="picker-group"
          >
            <p class="picker-phase">{{ group.phase }}</p>
            <label
              v-for="module in group.modules"
              :key="module.key"
              class="picker-item"
            >
              <input
                :checked="form.moduleKeys.includes(module.key)"
                type="checkbox"
                @change="toggleModule(module.key)"
              />
              <span>{{ module.title }}</span>
              <span class="minutes">{{ module.minutes }}분</span>
            </label>
          </div>
        </div>

        <details class="scenario-picker">
          <summary>
            상황연습 선택 ({{ form.scenarioKeys.length }}개) — AS-GDE-001 §15
          </summary>
          <label
            v-for="scenario in catalog.scenarios"
            :key="scenario.key"
            class="picker-item"
          >
            <input
              :checked="form.scenarioKeys.includes(scenario.key)"
              type="checkbox"
              @change="toggleScenario(scenario.key)"
            />
            <span>{{ scenario.no }}. {{ scenario.scene }}</span>
          </label>
        </details>

        <label class="note-field">
          메모
          <textarea
            v-model="form.note"
            rows="3"
            placeholder="준비물·변경 사항 등 남길 내용"
          ></textarea>
        </label>

        <div class="form-actions">
          <button
            type="button"
            class="primary-button"
            :disabled="isSaving"
            @click="submitForm"
          >
            일정 등록
          </button>
          <button type="button" class="ghost-button" @click="resetForm">
            초기화
          </button>
        </div>
      </article>

      <p v-else class="helper-text restricted">
        일정 등록·수정은 ARC 총괄(최윤희)만 할 수 있어요. 등록된 일정과 출석은
        확인할 수 있어요.
      </p>

      <p v-if="!sessions.length && !isLoading" class="empty-box">
        이 달에 잡힌 교육이 없어요. 정기교육은 루틴 16~20일 창에 잡는 것을
        권장해요.
      </p>

      <article
        v-for="session in sessions"
        :key="session.id"
        :class="['session-card', session.status.toLowerCase()]"
      >
        <header class="session-head">
          <div>
            <div class="session-title-row">
              <span :class="['kind-chip', session.kind.toLowerCase()]">
                {{ kindLabel(session.kind) }}
              </span>
              <h3>{{ session.title }}</h3>
              <span :class="['status-chip', session.status.toLowerCase()]">
                {{ statusLabel(session.status) }}
              </span>
            </div>
            <p class="session-meta">
              <span>{{ session.sessionNo }}</span>
              <span>{{ session.scheduledOn }} {{ session.startTime }}</span>
              <span>{{ session.durationMin }}분</span>
              <span v-if="session.place">장소 {{ session.place }}</span>
              <span v-if="session.instructor"
                >교육자 {{ session.instructor }}</span
              >
              <span v-if="session.evidenceId"
                >증빙 {{ session.evidenceId }}</span
              >
            </p>
          </div>
          <div class="session-actions">
            <button
              type="button"
              class="mini-button"
              @click="toggleOpen(session.id)"
            >
              {{ openIds.includes(session.id) ? "접기" : "출석·평가" }}
            </button>
          </div>
        </header>

        <div class="session-body">
          <div class="session-columns">
            <div>
              <p class="column-title">교육 모듈</p>
              <ul class="module-list">
                <li v-for="module in session.modules" :key="module.key">
                  <strong>{{ module.title }}</strong>
                  <span>{{ module.minutes }}분</span>
                </li>
              </ul>
            </div>
            <div v-if="session.scenarios.length">
              <p class="column-title">상황연습</p>
              <ul class="module-list">
                <li v-for="scenario in session.scenarios" :key="scenario.key">
                  <span>{{ scenario.no }}. {{ scenario.scene }}</span>
                </li>
              </ul>
            </div>
            <div v-if="session.note">
              <p class="column-title">메모</p>
              <p class="session-note">{{ session.note }}</p>
            </div>
          </div>

          <div v-if="openIds.includes(session.id)" class="attendance-panel">
            <div class="attendance-head">
              <strong>
                출석·구두평가 ({{ session.attendedCount }} /
                {{ session.attendeeCount }}명 참석)
              </strong>
              <div v-if="canWrite" class="attendance-tools">
                <button
                  type="button"
                  class="mini-button"
                  @click="markAll(session, true)"
                >
                  전원 참석
                </button>
                <button
                  type="button"
                  class="mini-button"
                  @click="markAll(session, false)"
                >
                  전원 해제
                </button>
              </div>
            </div>

            <table class="attendance-table">
              <thead>
                <tr>
                  <th>직원</th>
                  <th>참석</th>
                  <th>결과</th>
                  <th>점수</th>
                  <th>비고</th>
                  <th v-if="canWrite"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in draftRows(session)" :key="row.employeeId">
                  <td>
                    <strong>{{ row.employeeName }}</strong>
                    <span v-if="row.roleLabel" class="role-tag">
                      {{ row.roleLabel }}
                    </span>
                  </td>
                  <td>
                    <input
                      v-model="row.attended"
                      type="checkbox"
                      :disabled="!canWrite"
                      @change="syncResult(row)"
                    />
                  </td>
                  <td>
                    <select v-model="row.result" :disabled="!canWrite">
                      <option
                        v-for="result in catalog.results"
                        :key="result.key"
                        :value="result.key"
                      >
                        {{ result.label }}
                      </option>
                    </select>
                  </td>
                  <td>
                    <input
                      v-model="row.score"
                      type="number"
                      min="0"
                      max="100"
                      :disabled="!canWrite"
                    />
                  </td>
                  <td>
                    <input
                      v-model="row.note"
                      type="text"
                      :disabled="!canWrite"
                      placeholder="예: 2번 문항 오답"
                    />
                  </td>
                  <td v-if="canWrite">
                    <span v-if="makeupHint(row)" class="makeup-hint">
                      {{ makeupHint(row) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            <div v-if="canWrite" class="panel-actions">
              <button
                type="button"
                class="primary-button small"
                :disabled="isSaving"
                @click="saveAttendance(session)"
              >
                출석 저장
              </button>
              <label class="inline-field">
                진행 상태
                <select
                  :value="session.status"
                  @change="changeStatus(session, $event.target.value)"
                >
                  <option
                    v-for="status in catalog.statuses"
                    :key="status.key"
                    :value="status.key"
                  >
                    {{ status.label }}
                  </option>
                </select>
              </label>
              <label class="inline-field">
                증빙ID
                <input
                  :value="session.evidenceId"
                  type="text"
                  placeholder="교육일지·사진"
                  @change="saveEvidence(session, $event.target.value)"
                />
              </label>
              <button
                type="button"
                class="mini-button danger"
                @click="removeSession(session)"
              >
                일정 삭제
              </button>
            </div>
          </div>
        </div>
      </article>
    </section>

    <!-- 교육자료 -->
    <section v-else class="library-panel">
      <p class="helper-text">
        AS-GDE-001 「현장 응급처치 교육 가이드」와 AS-KIT-001 「구급상자 운영
        관리대장」에서 옮긴 교육 자료예요. 교육 3일 전에 이 화면을 그대로 읽으며
        준비하면 됩니다.
      </p>

      <div class="library-tabs">
        <button
          v-for="item in LIBRARY_TABS"
          :key="item.key"
          type="button"
          :class="['tab-button', { active: libraryTab === item.key }]"
          @click="libraryTab = item.key"
        >
          {{ item.label }}
        </button>
      </div>

      <div v-if="libraryTab === 'modules'" class="library-body">
        <article
          v-for="module in libraryModules"
          :key="module.key"
          class="library-card"
        >
          <header>
            <h3>{{ module.title }}</h3>
            <span class="minutes">
              {{ module.phase }} · {{ module.minutes }}분
            </span>
          </header>
          <p class="library-goal">목표: {{ module.goal }}</p>
          <ul>
            <li v-for="item in module.checklist" :key="item.key">
              {{ item.label }}
            </li>
          </ul>
          <p class="library-meta">준비물: {{ module.materials.join(" · ") }}</p>
          <p class="library-meta">평가: {{ module.evaluation.join(" / ") }}</p>
        </article>
      </div>

      <div v-else-if="libraryTab === 'scenarios'" class="library-body">
        <article
          v-for="scenario in catalog.scenarios"
          :key="scenario.key"
          class="scenario-card"
        >
          <p class="scenario-scene">{{ scenario.no }}. {{ scenario.scene }}</p>
          <p class="scenario-answer">정답: {{ scenario.answer }}</p>
        </article>
      </div>

      <div v-else class="library-body">
        <ol class="forbidden-list">
          <li v-for="row in catalog.forbidden" :key="row.key">
            {{ row.text }}
          </li>
        </ol>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import {
  ARC_TRAINING_KIND_LABELS,
  ARC_TRAINING_RESULT_LABELS,
  ARC_TRAINING_STATUS_LABELS,
  createArcTrainingSession,
  deleteArcTrainingSession,
  fetchArcRoutine,
  fetchArcTraining,
  saveArcTrainingAttendees,
  updateArcTrainingSession,
} from "@/lib/arc";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const TABS = [
  { key: "calendar", label: "달력" },
  { key: "sessions", label: "일정·출석" },
  { key: "library", label: "교육자료" },
];
const LIBRARY_TABS = [
  { key: "modules", label: "교육 모듈" },
  { key: "scenarios", label: "상황연습 21" },
  { key: "forbidden", label: "절대금지 30" },
];

const board = ref({
  period: "",
  sessions: [],
  summary: {
    total: 0,
    planned: 0,
    done: 0,
    canceled: 0,
    attended: 0,
    followup: 0,
  },
  stats: {
    period: "",
    today: "",
    total: 0,
    done: 0,
    planned: 0,
    minutes: 0,
    attended: 0,
    followups: [],
  },
  catalog: {
    kinds: [],
    statuses: [],
    results: [],
    modules: [],
    scenarios: [],
    forbidden: [],
  },
  staff: [],
  canWrite: false,
});
const routineSteps = ref([]);
const tab = ref("calendar");
const libraryTab = ref("modules");
const selectedIso = ref("");
const openIds = ref([]);
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const savedMessage = ref("");
const drafts = reactive({});

const form = reactive({
  kind: "REGULAR",
  scheduledOn: "",
  startTime: "15:00",
  durationMin: 45,
  place: "",
  instructor: "",
  title: "",
  evidenceId: "",
  note: "",
  moduleKeys: [],
  scenarioKeys: [],
});

const catalog = computed(() => board.value.catalog ?? {});
const staff = computed(() => board.value.staff ?? []);
const canWrite = computed(() => Boolean(board.value.canWrite));
const sessions = computed(() => board.value.sessions ?? []);
const summary = computed(() => ({
  total: 0,
  done: 0,
  planned: 0,
  minutes: 0,
  attended: 0,
  ...(board.value.summary ?? {}),
}));
const stats = computed(() => board.value.stats ?? {});
const followups = computed(() => stats.value.followups ?? []);
const today = computed(() => ({
  day: Number((stats.value.today ?? "").slice(8, 10)),
}));
const isCurrentPeriod = computed(
  () => board.value.period === (stats.value.today ?? "").slice(0, 7)
);

const libraryModules = computed(() =>
  (catalog.value.modules ?? []).map((module) => ({
    ...module,
    checklist: (module.items ?? []).map((item) => ({
      key: Array.isArray(item) ? item[0] : item.key,
      label: Array.isArray(item) ? item[1] : item.label,
    })),
  }))
);

const periodLabel = computed(() => {
  const period = board.value.period;

  if (!period) return "";

  return `${period.slice(0, 4)}년 ${Number(period.slice(5, 7))}월`;
});

const kindDescription = computed(
  () => catalog.value.kinds?.find((item) => item.key === form.kind)?.desc ?? ""
);

const moduleGroups = computed(() => {
  const groups = [];

  (catalog.value.modules ?? []).forEach((module) => {
    const last = groups[groups.length - 1];

    if (last && last.phase === module.phase) {
      last.modules.push(module);
      return;
    }

    groups.push({ phase: module.phase, modules: [module] });
  });

  return groups;
});

const selectedModulesMinutes = computed(() =>
  (catalog.value.modules ?? [])
    .filter((module) => form.moduleKeys.includes(module.key))
    .reduce((total, module) => total + module.minutes, 0)
);

const calendarCells = computed(() => {
  const period = board.value.period;
  const cells = [];

  if (!period) return cells;

  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayIso = board.value.stats?.today ?? "";

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({ key: `pad-${index}`, day: null });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${period}-${String(day).padStart(2, "0")}`;

    cells.push({
      key: iso,
      day,
      iso,
      isToday: iso === todayIso,
      sessions: sessions.value.filter((item) => item.scheduledOn === iso),
      routines: routineChipsFor(day, month),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `tail-${cells.length}`, day: null });
  }

  return cells;
});

const selectedDay = computed(() =>
  calendarCells.value.find((cell) => cell.iso && cell.iso === selectedIso.value)
);

function routineChipsFor(day, month) {
  return routineSteps.value
    .filter((step) => step.window && day === step.window.start)
    .filter((step) => !step.months || step.months.includes(month))
    .map((step) => ({
      key: step.key,
      label: step.title,
      windowLabel: step.windowLabel,
    }));
}

function kindLabel(key) {
  return ARC_TRAINING_KIND_LABELS[key] ?? key;
}

function kindShort(key) {
  if (key === "NEWBIE") return "신규";
  if (key === "REGULAR") return "교육";
  if (key === "REFRESH") return "보수";

  return kindLabel(key);
}

function statusLabel(key) {
  return ARC_TRAINING_STATUS_LABELS[key] ?? key;
}

function resultLabel(key) {
  return ARC_TRAINING_RESULT_LABELS[key] ?? key;
}

function periodShift(period, delta) {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const base = new Date(year, month - 1 + delta, 1);

  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function todayIso() {
  const now = new Date();
  const offset = -now.getTimezoneOffset();

  return new Date(now.getTime() + offset * 60_000).toISOString().slice(0, 10);
}

async function load(period = board.value.period) {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const target = period || todayIso().slice(0, 7);
    const data = await fetchArcTraining(target);

    board.value = { ...board.value, ...data, period: data.period ?? target };
    selectedIso.value = "";
    rebuildDrafts();
    await loadRoutine(board.value.period);
  } catch (error) {
    errorMessage.value = error?.message ?? "교육 자료를 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function loadRoutine(period) {
  try {
    const data = await fetchArcRoutine(period);

    routineSteps.value = Array.isArray(data?.steps) ? data.steps : [];
  } catch {
    routineSteps.value = [];
  }
}

function shiftPeriod(delta) {
  if (!board.value.period) return;

  const next = periodShift(board.value.period, delta);

  load(next);
}

function goCurrentPeriod() {
  load(todayIso().slice(0, 7));
}

function selectDay(cell) {
  if (!cell.day) return;

  selectedIso.value = cell.iso;
}

function flash(message) {
  savedMessage.value = message;
  window.setTimeout(() => {
    if (savedMessage.value === message) {
      savedMessage.value = "";
    }
  }, 3200);
}

function applyKindDefault() {
  const kind = catalog.value.kinds?.find((item) => item.key === form.kind);

  if (!kind) return;

  form.durationMin = kind.minutes;
  form.moduleKeys = [...kind.modules];
}

function toggleModule(key) {
  form.moduleKeys = form.moduleKeys.includes(key)
    ? form.moduleKeys.filter((item) => item !== key)
    : [...form.moduleKeys, key];
}

function toggleScenario(key) {
  form.scenarioKeys = form.scenarioKeys.includes(key)
    ? form.scenarioKeys.filter((item) => item !== key)
    : [...form.scenarioKeys, key];
}

function resetForm() {
  form.kind = "REGULAR";
  form.scheduledOn = selectedIso.value || todayIso();
  form.startTime = "15:00";
  form.place = "";
  form.instructor = "";
  form.title = "";
  form.evidenceId = "";
  form.note = "";
  form.scenarioKeys = [];
  applyKindDefault();
}

function startCreate(iso) {
  selectedIso.value = iso;
  form.scheduledOn = iso;
  tab.value = "sessions";
}

function autoMaterials() {
  return [
    ...new Set(
      (catalog.value.modules ?? [])
        .filter((module) => form.moduleKeys.includes(module.key))
        .flatMap((module) => module.materials)
    ),
  ];
}

async function submitForm() {
  if (!form.scheduledOn) {
    errorMessage.value = "교육일을 선택해 주세요.";
    return;
  }

  if (form.moduleKeys.length === 0) {
    errorMessage.value = "교육 모듈을 1개 이상 선택해 주세요.";
    return;
  }

  isSaving.value = true;
  errorMessage.value = "";

  try {
    await createArcTrainingSession({
      kind: form.kind,
      scheduledOn: form.scheduledOn,
      startTime: form.startTime,
      durationMin: form.durationMin,
      place: form.place,
      instructor: form.instructor,
      title: form.title,
      evidenceId: form.evidenceId,
      note: form.note,
      moduleKeys: form.moduleKeys,
      scenarioKeys: form.scenarioKeys,
      materials: autoMaterials(),
    });

    flash("교육 일정을 등록했어요.");
    resetForm();
    await load(board.value.period);
  } catch (error) {
    errorMessage.value = error?.message ?? "일정을 등록하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

function openSession(sessionId) {
  tab.value = "sessions";

  if (!openIds.value.includes(sessionId)) {
    openIds.value = [...openIds.value, sessionId];
  }

  const session = sessions.value.find((item) => item.id === sessionId);

  if (session) ensureDraft(session);
}

function toggleOpen(sessionId) {
  const session = sessions.value.find((item) => item.id === sessionId);

  if (openIds.value.includes(sessionId)) {
    openIds.value = openIds.value.filter((item) => item !== sessionId);
    return;
  }

  openIds.value = [...openIds.value, sessionId];

  if (session) ensureDraft(session);
}

function ensureDraft(session) {
  if (drafts[session.id]) return;

  drafts[session.id] = staff.value.map((member) => {
    const existing = (session.attendees ?? []).find(
      (item) => item.employeeId === member.id
    );

    return {
      employeeId: member.id,
      employeeName: member.name,
      roleLabel:
        member.role === "OWNER"
          ? "대표"
          : member.role === "MANAGER"
          ? "매니저"
          : "",
      attended: Boolean(existing?.attended),
      result: existing?.result ?? "PENDING",
      score: existing?.score ?? "",
      note: existing?.note ?? "",
    };
  });
}

function rebuildDrafts() {
  Object.keys(drafts).forEach((key) => {
    delete drafts[key];
  });

  sessions.value.forEach((session) => ensureDraft(session));
}

function draftRows(session) {
  return drafts[session.id] ?? [];
}

function syncResult(row) {
  if (row.attended && row.result === "PENDING") {
    row.result = "PASS";
  }

  if (!row.attended && row.result === "PASS") {
    row.result = "MAKEUP";
  }
}

function markAll(session, attended) {
  draftRows(session).forEach((row) => {
    row.attended = attended;
    row.result = attended ? "PASS" : "MAKEUP";
  });
}

function makeupHint(row) {
  if (row.attended && row.result === "PASS") return "";
  if (row.result === "EXCUSED") return "사유 불참";

  return "14일 내 보충";
}

async function saveAttendance(session) {
  isSaving.value = true;
  errorMessage.value = "";

  try {
    const rows = draftRows(session)
      .filter((row) => row.attended || row.result !== "PENDING")
      .map((row) => ({
        employeeId: row.employeeId,
        attended: row.attended,
        result: row.result,
        score: row.score === "" ? null : row.score,
        note: row.note,
      }));

    await saveArcTrainingAttendees(session.id, rows);
    flash("출석·평가를 저장했어요.");
    delete drafts[session.id];
    await load(board.value.period);
    openIds.value = [...new Set([...openIds.value, session.id])];
  } catch (error) {
    errorMessage.value = error?.message ?? "출석을 저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function changeStatus(session, status) {
  if (status === "DONE" && !session.evidenceId) {
    errorMessage.value =
      "완료 처리하려면 증빙ID(교육일지·사진)를 먼저 입력해 주세요.";
    return;
  }

  isSaving.value = true;
  errorMessage.value = "";

  try {
    await updateArcTrainingSession(session.id, { status });
    flash("진행 상태를 바꿨어요.");
    await load(board.value.period);
    openIds.value = [...new Set([...openIds.value, session.id])];
  } catch (error) {
    errorMessage.value = error?.message ?? "상태를 바꾸지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function saveEvidence(session, evidenceId) {
  if (evidenceId === session.evidenceId) return;

  isSaving.value = true;
  errorMessage.value = "";

  try {
    await updateArcTrainingSession(session.id, { evidenceId });
    flash("증빙ID를 저장했어요.");
    await load(board.value.period);
    openIds.value = [...new Set([...openIds.value, session.id])];
  } catch (error) {
    errorMessage.value = error?.message ?? "증빙ID를 저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function removeSession(session) {
  if (
    !window.confirm(
      `${session.sessionNo} 일정을 삭제할까요? 출석 기록도 함께 지워져요.`
    )
  ) {
    return;
  }

  isSaving.value = true;
  errorMessage.value = "";

  try {
    await deleteArcTrainingSession(session.id);
    flash("일정을 삭제했어요.");
    openIds.value = openIds.value.filter((item) => item !== session.id);
    delete drafts[session.id];
    await load(board.value.period);
  } catch (error) {
    errorMessage.value = error?.message ?? "일정을 삭제하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

onMounted(() => {
  resetForm();
  load(todayIso().slice(0, 7));
});
</script>

<style scoped>
.admin-arc-training-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
}

/* 관리자 셸이 어두운 배경(#0b1220)이라 흰 카드 안 글자가 흰색으로 상속됩니다.
   밝은 배경을 쓰는 박스는 글자색을 직접 지정해 가독성을 지킵니다. */
.stat-card,
.calendar-cell,
.day-detail,
.form-panel,
.session-card,
.library-card,
.scenario-card,
.attendance-panel,
.module-picker,
.followup-panel {
  color: #111827;
}

.page-header {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: space-between;
}

.eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #b45309;
}

.page-header h1 {
  margin: 0 0 8px;
  font-size: 24px;
}

.description {
  max-width: 720px;
  margin: 0;
  color: #4b5563;
  line-height: 1.6;
}

.header-links {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.link-button {
  padding: 8px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  color: #111827;
  font-size: 13px;
  text-decoration: none;
}

.link-button.small {
  padding: 4px 10px;
}

.period-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 12px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
}

.period-label {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 14px;
  color: #4b5563;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.stat-card {
  padding: 14px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}

.stat-card.warning {
  border-color: #fcd34d;
  background: #fffbeb;
}

.stat-label {
  margin: 0 0 6px;
  font-size: 12px;
  color: #6b7280;
}

.stat-value {
  font-size: 22px;
}

.stat-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: #6b7280;
}

.followup-panel {
  padding: 14px 16px;
  border: 1px solid #fcd34d;
  border-radius: 12px;
  background: #fffbeb;
}

.followup-panel h2 {
  margin: 0 0 8px;
  font-size: 15px;
}

.followup-panel ul {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.followup-panel li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  color: #7c2d12;
}

.followup-panel .due {
  font-weight: 600;
}

.followup-panel .session-ref {
  color: #9a3412;
}

.tab-bar,
.library-tabs {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid #e5e7eb;
}

.tab-button {
  padding: 8px 16px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #6b7280;
  font-size: 14px;
  cursor: pointer;
}

.tab-button.active {
  border-bottom-color: #b45309;
  color: #111827;
  font-weight: 600;
}

.calendar-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.calendar-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.legend-chip {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: #f3f4f6;
  color: #374151;
}

.legend-chip.ot {
  background: #e0e7ff;
  color: #3730a3;
}

.legend-chip.regular {
  background: #dcfce7;
  color: #166534;
}

.legend-chip.newbie {
  background: #fef3c7;
  color: #92400e;
}

.legend-chip.drill {
  background: #fee2e2;
  color: #991b1b;
}

.legend-chip.refresh {
  background: #e0f2fe;
  color: #075985;
}

.legend-chip.routine {
  border: 1px dashed #cbd5e1;
  background: #fff;
  color: #64748b;
}

.calendar-weekhead,
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.calendar-weekhead span {
  padding: 4px 0;
  font-size: 12px;
  color: #6b7280;
  text-align: center;
}

.calendar-cell {
  min-height: 92px;
  padding: 6px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
}

.calendar-cell.empty {
  border: none;
  background: transparent;
  cursor: default;
}

.calendar-cell.today {
  border-color: #b45309;
}

.calendar-cell.selected {
  box-shadow: 0 0 0 2px #fcd34d inset;
}

.day-number {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
}

.cell-chips {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.chip {
  overflow: hidden;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 11px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.chip.session.ot {
  background: #e0e7ff;
  color: #3730a3;
}

.chip.session.regular {
  background: #dcfce7;
  color: #166534;
}

.chip.session.newbie {
  background: #fef3c7;
  color: #92400e;
}

.chip.session.drill {
  background: #fee2e2;
  color: #991b1b;
}

.chip.session.refresh {
  background: #e0f2fe;
  color: #075985;
}

.chip.session.canceled {
  background: #f3f4f6;
  color: #9ca3af;
  text-decoration: line-through;
}

.chip.routine {
  border: 1px dashed #cbd5e1;
  color: #64748b;
}

.day-detail {
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
}

.day-detail header {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  font-size: 13px;
  color: #4b5563;
}

.day-session-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.day-session-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  font-size: 13px;
}

.session-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-panel {
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
}

.form-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
}

.form-head h2 {
  margin: 0;
  font-size: 16px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
  margin: 12px 0;
}

.form-grid label,
.note-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #4b5563;
}

.form-grid .span-2 {
  grid-column: span 2;
}

.form-grid input,
.form-grid select,
.note-field textarea,
.inline-field input,
.inline-field select,
.attendance-table input,
.attendance-table select {
  padding: 7px 9px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 13px;
  color: #111827;
}

.module-picker {
  padding: 12px;
  border: 1px dashed #d1d5db;
  border-radius: 12px;
  background: #f9fafb;
}

.picker-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
}

.picker-group {
  margin-top: 8px;
}

.picker-phase {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  color: #b45309;
}

.picker-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 3px 0;
  font-size: 13px;
  color: #374151;
}

.picker-item .minutes {
  margin-left: auto;
  color: #9ca3af;
}

.scenario-picker {
  margin-top: 12px;
}

.scenario-picker summary {
  padding: 8px 0;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
}

.form-actions,
.panel-actions,
.attendance-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.form-actions {
  margin-top: 14px;
}

.session-card {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
}

.session-card.canceled {
  opacity: 0.7;
}

.session-head {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #f3f4f6;
}

.session-title-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.session-title-row h3 {
  margin: 0;
  font-size: 16px;
}

.kind-chip,
.status-chip {
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.kind-chip.ot {
  background: #e0e7ff;
  color: #3730a3;
}

.kind-chip.regular {
  background: #dcfce7;
  color: #166534;
}

.kind-chip.newbie {
  background: #fef3c7;
  color: #92400e;
}

.kind-chip.drill {
  background: #fee2e2;
  color: #991b1b;
}

.kind-chip.refresh {
  background: #e0f2fe;
  color: #075985;
}

.status-chip.planned {
  background: #f3f4f6;
  color: #4b5563;
}

.status-chip.done {
  background: #dcfce7;
  color: #166534;
}

.status-chip.canceled {
  background: #fee2e2;
  color: #991b1b;
}

.session-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 6px 0 0;
  font-size: 12px;
  color: #6b7280;
}

.session-body {
  padding: 14px 16px;
}

.session-columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.column-title {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 700;
  color: #9ca3af;
}

.module-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
  color: #374151;
}

.module-list li {
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.module-list li span {
  color: #9ca3af;
}

.session-note {
  margin: 0;
  font-size: 13px;
  color: #4b5563;
  white-space: pre-line;
}

.attendance-panel {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed #e5e7eb;
}

.attendance-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 13px;
}

.attendance-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.attendance-table th {
  padding: 6px 8px;
  border-bottom: 1px solid #e5e7eb;
  color: #6b7280;
  font-size: 11px;
  font-weight: 600;
  text-align: left;
}

.attendance-table td {
  padding: 6px 8px;
  border-bottom: 1px solid #f3f4f6;
}

.attendance-table input[type="number"] {
  width: 66px;
}

.role-tag {
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 10px;
}

.makeup-hint {
  font-size: 11px;
  color: #b45309;
}

.panel-actions {
  margin-top: 12px;
}

.inline-field {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  color: #4b5563;
}

.library-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.library-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.library-card,
.scenario-card {
  padding: 14px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}

.library-card header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
}

.library-card h3 {
  margin: 0;
  font-size: 15px;
}

.library-goal {
  margin: 8px 0;
  font-size: 13px;
  color: #b45309;
}

.library-card ul {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #374151;
}

.library-meta {
  margin: 8px 0 0;
  font-size: 12px;
  color: #6b7280;
}

.scenario-scene {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.scenario-answer {
  margin: 0;
  font-size: 13px;
  color: #166534;
}

.forbidden-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 14px 16px 14px 34px;
  border: 1px solid #fecaca;
  border-radius: 12px;
  background: #fff1f2;
  font-size: 13px;
  color: #7f1d1d;
}

.primary-button,
.ghost-button,
.mini-button {
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}

.primary-button {
  padding: 9px 16px;
  border: none;
  background: #b45309;
  color: #fff;
  font-weight: 600;
}

.primary-button.small {
  padding: 6px 12px;
}

.primary-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ghost-button {
  padding: 7px 14px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #111827;
}

.mini-button {
  padding: 4px 10px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
}

.mini-button.danger {
  border-color: #fecaca;
  color: #b91c1c;
}

.helper-text {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
}

.helper-text.restricted {
  padding: 12px 14px;
  border: 1px dashed #d1d5db;
  border-radius: 12px;
  background: #f9fafb;
}

.empty-line {
  margin: 8px 0 0;
  font-size: 12px;
  color: #9ca3af;
}

.empty-box {
  padding: 24px;
  border: 1px dashed #d1d5db;
  border-radius: 12px;
  background: #f9fafb;
  color: #6b7280;
  font-size: 13px;
  text-align: center;
}

.error-box {
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 13px;
}

.ok-box {
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: #ecfdf5;
  color: #047857;
  font-size: 13px;
}

@media (max-width: 720px) {
  .admin-arc-training-view {
    padding: 16px;
  }

  .calendar-cell {
    min-height: 68px;
  }

  .form-grid .span-2 {
    grid-column: span 1;
  }
}
</style>
