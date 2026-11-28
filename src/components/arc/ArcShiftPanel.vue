<template>
  <div class="arc-shift-panel">
    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="okMessage" class="ok-box">{{ okMessage }}</p>

    <section class="intro-card">
      <div class="intro-head">
        <h2>근무 번표 — 김원재 사장님께 "언제 올 수 있는지" 알려 주는 달력</h2>
        <span class="intro-badge">{{
          canWrite ? "등록 가능" : "보기 전용"
        }}</span>
      </div>
      <p class="intro-text">
        병원 근무조(D·E·N·S)를 넣으면 <strong>출발 시각</strong>과
        <strong>매장 도착 예정 시각</strong>이 자동으로 계산됩니다. 근무가 없는
        날은 물론, 근무가 있어도 잠깐 올 수 있는 시간이 있으면
        <strong>‘올 수 있음’</strong>으로 따로 남겨 주세요.
      </p>
      <ul class="tip-list">
        <li v-for="tip in catalog.tips || []" :key="tip">{{ tip }}</li>
      </ul>
    </section>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">근무일</span>
        <strong>{{ summary.shiftDays ?? 0 }}일</strong>
        <span class="summary-sub">이번 달 병원 근무</span>
      </article>
      <article class="summary-card ok">
        <span class="summary-label">올 수 있는 날</span>
        <strong>{{ summary.callableDays ?? 0 }}일</strong>
        <span class="summary-sub">사장님이 부를 수 있는 날</span>
      </article>
      <article class="summary-card">
        <span class="summary-label">올 수 있음</span>
        <strong>{{ summary.availableDays ?? 0 }}건</strong>
        <span class="summary-sub">따로 알린 시간</span>
      </article>
      <article class="summary-card danger">
        <span class="summary-label">올 수 없음</span>
        <strong>{{ summary.unavailableDays ?? 0 }}건</strong>
        <span class="summary-sub">막아 둔 시간</span>
      </article>
    </section>

    <div class="layout">
      <!-- 달력 -->
      <section class="panel calendar-panel">
        <div class="panel-head">
          <div class="period-nav">
            <button type="button" class="mini-button" @click="movePeriod(-1)">
              ‹ 이전 달
            </button>
            <strong class="period-label">{{ periodLabel }}</strong>
            <button type="button" class="mini-button" @click="movePeriod(1)">
              다음 달 ›
            </button>
          </div>
          <button
            type="button"
            class="mini-button"
            :disabled="isLoading"
            @click="reload"
          >
            새로고침
          </button>
        </div>

        <div class="weekday-row">
          <span
            v-for="(day, index) in catalog.weekdays || []"
            :key="day"
            class="weekday"
            :class="{ sunday: index === 0, saturday: index === 6 }"
            >{{ day }}</span
          >
        </div>

        <div class="day-grid">
          <button
            v-for="cell in calendarCells"
            :key="cell.date"
            type="button"
            class="day-cell"
            :class="{
              blank: !cell.inMonth,
              today: cell.isToday,
              selected: selectedDates.includes(cell.date),
              callable: cell.callable,
              blocked: cell.blocked,
            }"
            :disabled="!canWrite || !cell.inMonth"
            @click="toggleDate(cell.date)"
          >
            <span class="day-number">{{ cell.day }}</span>
            <span
              v-for="entry in cell.entries"
              :key="entry.id"
              class="entry-chip"
              :class="`kind-${entry.kind.toLowerCase()}`"
              :title="entryTitle(entry)"
            >
              {{ entryChipLabel(entry) }}
            </span>
          </button>
        </div>

        <p class="panel-note">
          날짜를 누르면 선택됩니다. 여러 날짜를 골라 한 번에 등록할 수 있어요.
          <span v-if="!canWrite"
            >(등록은 ARC 대표(RN)만 할 수 있고, 지금은 보기 전용입니다.)</span
          >
        </p>
      </section>

      <!-- 등록 -->
      <section class="panel form-panel">
        <div class="panel-head">
          <h2>번표 등록</h2>
          <span class="panel-note"
            >선택한 날짜 {{ selectedDates.length }}개</span
          >
        </div>

        <template v-if="canWrite">
          <div class="field">
            <span>종류</span>
            <div class="choice-row">
              <button
                v-for="kind in catalog.kinds || []"
                :key="kind.key"
                type="button"
                class="choice"
                :class="{ active: form.kind === kind.key }"
                @click="form.kind = kind.key"
              >
                {{ kind.label }}
              </button>
            </div>
            <small class="field-hint">{{ kindHint }}</small>
          </div>

          <template v-if="form.kind === 'SHIFT'">
            <div class="field">
              <span>근무 코드</span>
              <div class="code-row">
                <button
                  v-for="code in catalog.codes || []"
                  :key="code.code"
                  type="button"
                  class="code-button"
                  :class="{ active: form.shiftCode === code.code }"
                  @click="pickCode(code)"
                >
                  <strong>{{ code.code }}</strong>
                  <span>{{ code.startTime }}~{{ code.endTime }}</span>
                </button>
              </div>
            </div>
            <p v-if="selectedCode" class="code-detail">
              {{ selectedCode.desc }}<br />
              <strong>출발 {{ departText(selectedCode.startTime) }}</strong>
              · 매장 도착 예정 {{ arriveText(selectedCode.endTime) }}
            </p>
          </template>

          <template v-else>
            <div class="time-row">
              <label class="field">
                <span>시작</span>
                <input v-model="form.startTime" type="time" />
              </label>
              <label class="field">
                <span>끝</span>
                <input v-model="form.endTime" type="time" />
              </label>
            </div>
            <p class="field-hint">
              예: 18:00~21:00 — 근무가 끝난 뒤 매장에 올 수 있는 시간을 적어
              주세요.
            </p>
          </template>

          <label class="field">
            <span>메모 (사장·총괄만 보입니다)</span>
            <input
              v-model="form.note"
              type="text"
              maxlength="200"
              placeholder="예: 병원 야간 후 오전까지 휴식 / 저녁 6시쯤 도착 가능"
            />
          </label>

          <p v-if="selectedDates.length" class="selected-list">
            {{ selectedSummary }}
          </p>

          <div class="form-actions">
            <button
              type="button"
              class="primary-button"
              :disabled="isSaving || !selectedDates.length"
              @click="submit"
            >
              {{
                selectedDates.length > 1
                  ? "선택한 날짜에 한 번에 등록"
                  : "선택한 날짜에 등록"
              }}
            </button>
            <button
              type="button"
              class="mini-button"
              :disabled="isSaving"
              @click="clearSelection"
            >
              선택 해제
            </button>
          </div>

          <div class="quick-month">
            <span class="field-hint">자주 쓰는 빠른 등록</span>
            <div class="quick-row">
              <button
                type="button"
                class="mini-button"
                :disabled="isSaving"
                @click="selectAllWeekday(1)"
              >
                이번 달 월요일 전부
              </button>
              <button
                type="button"
                class="mini-button"
                :disabled="isSaving"
                @click="selectAllWeekday(0)"
              >
                일요일 전부
              </button>
              <button
                type="button"
                class="mini-button"
                :disabled="isSaving"
                @click="selectWeek"
              >
                이번 주
              </button>
            </div>
          </div>
        </template>

        <p v-else class="panel-note">
          번표 등록은 ARC 대표(RN)만 할 수 있어요. 사장님은 이 달력을 보고
          직원이 올 수 있는 시간을 확인하시면 됩니다.
        </p>
      </section>
    </div>

    <section v-if="callableDates.length" class="panel">
      <div class="panel-head">
        <h2>사장님이 부를 수 있는 날</h2>
        <span class="panel-note">근무가 없거나, 올 수 있는 시간을 남긴 날</span>
      </div>
      <div class="callable-list">
        <span
          v-for="item in callableDateLabels"
          :key="item"
          class="callable-chip"
        >
          {{ item }}
        </span>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>이번 달 번표 전체</h2>
        <span class="panel-note">{{ entries.length }}건</span>
      </div>
      <div v-if="entries.length" class="entry-table">
        <div v-for="entry in entries" :key="entry.id" class="entry-row">
          <span class="entry-date">{{ formatArcDate(entry.workOn) }}</span>
          <span
            class="entry-kind"
            :class="`kind-${entry.kind.toLowerCase()}`"
            >{{ entry.label }}</span
          >
          <span class="entry-time">
            {{ entry.startTime }}~{{ entry.endTime }}
            <template v-if="entry.departTime">
              · 출발 {{ entry.departTime
              }}<template v-if="entry.departPreviousDay"> (전날)</template>
            </template>
          </span>
          <span class="entry-note">{{ entry.note }}</span>
          <button
            v-if="canWrite"
            type="button"
            class="delete-button"
            :disabled="isSaving"
            @click="remove(entry)"
          >
            삭제
          </button>
        </div>
      </div>
      <p v-else class="panel-note">
        이번 달에 등록된 번표가 아직 없어요. 위 달력에서 날짜를 골라 D·E·N·S
        근무조를 넣어 주세요.
      </p>
    </section>
  </div>
</template>

<script>
import { computed, onMounted, reactive, ref } from "vue";
import {
  bulkSaveArcShifts,
  deleteArcShift,
  fetchArcShifts,
  formatArcDate,
  formatArcPeriod,
  saveArcShift,
} from "@/lib/arc";

function todayPeriod() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftPeriod(period, delta) {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7)) + delta;
  const date = new Date(year, month - 1, 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
}

function clockAfter(time, minutes) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time || ""));

  if (!match) return "";

  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  const wrapped = ((total % 1440) + 1440) % 1440;

  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(
    wrapped % 60
  ).padStart(2, "0")}`;
}

export default {
  name: "ArcShiftPanel",
  setup() {
    const period = ref(todayPeriod());
    const board = ref({
      entries: [],
      days: [],
      summary: {},
      catalog: { codes: [], kinds: [], tips: [], weekdays: [] },
      canWrite: false,
      masked: false,
    });
    const isLoading = ref(false);
    const isSaving = ref(false);
    const errorMessage = ref("");
    const okMessage = ref("");
    const selectedDates = ref([]);
    const form = reactive({
      kind: "SHIFT",
      shiftCode: "D",
      startTime: "18:00",
      endTime: "21:00",
      note: "",
    });

    const catalog = computed(() => board.value.catalog ?? {});
    const summary = computed(() => board.value.summary ?? {});
    const entries = computed(() => board.value.entries ?? []);
    const canWrite = computed(() => board.value.canWrite === true);
    const periodLabel = computed(() => formatArcPeriod(period.value));
    const commuteMinutes = computed(
      () => Number(catalog.value.commuteMinutes ?? 60) || 60
    );

    const selectedCode = computed(
      () =>
        (catalog.value.codes ?? []).find(
          (item) => item.code === form.shiftCode
        ) ?? null
    );

    const kindHint = computed(
      () =>
        (catalog.value.kinds ?? []).find((item) => item.key === form.kind)
          ?.desc ?? ""
    );

    const entriesByDate = computed(() => {
      const map = new Map();

      entries.value.forEach((entry) => {
        if (!map.has(entry.workOn)) map.set(entry.workOn, []);
        map.get(entry.workOn).push(entry);
      });

      return map;
    });

    const callableSet = computed(
      () => new Set(summary.value.callableDates ?? [])
    );

    const todayIso = computed(() => {
      const now = new Date();

      return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
    });

    const calendarCells = computed(() => {
      const year = Number(period.value.slice(0, 4));
      const month = Number(period.value.slice(5, 7));
      const first = new Date(year, month - 1, 1);
      const lastDay = new Date(year, month, 0).getDate();
      const leading = first.getDay();
      const cells = [];

      for (let index = 0; index < leading; index += 1) {
        cells.push({
          date: `blank-${index}`,
          inMonth: false,
          day: "",
          entries: [],
        });
      }

      for (let day = 1; day <= lastDay; day += 1) {
        const date = isoDate(year, month, day);
        const dayEntries = entriesByDate.value.get(date) ?? [];

        cells.push({
          date,
          inMonth: true,
          day,
          entries: dayEntries,
          isToday: date === todayIso.value,
          callable: callableSet.value.has(date),
          blocked: dayEntries.some((item) => item.kind === "UNAVAILABLE"),
        });
      }

      return cells;
    });

    const callableDates = computed(() => summary.value.callableDates ?? []);

    const callableDateLabels = computed(() =>
      callableDates.value.map((date) => formatArcDate(date))
    );

    const selectedSummary = computed(() => {
      const sorted = [...selectedDates.value].sort();

      if (sorted.length <= 4) {
        return sorted.map((date) => formatArcDate(date)).join(", ");
      }

      return `${formatArcDate(sorted[0])} 외 ${sorted.length - 1}일`;
    });

    function departText(startTime) {
      return `${clockAfter(startTime, -commuteMinutes.value)} (매장까지 ${
        commuteMinutes.value / 60
      }시간)`;
    }

    function arriveText(endTime) {
      return clockAfter(endTime, commuteMinutes.value);
    }

    function entryChipLabel(entry) {
      if (entry.kind === "SHIFT") {
        return board.value.masked || !entry.shiftCode
          ? `${entry.startTime}`
          : entry.shiftCode;
      }

      return entry.kind === "AVAILABLE" ? "가능" : "불가";
    }

    function entryTitle(entry) {
      const parts = [`${entry.startTime}~${entry.endTime}`];

      if (entry.label) parts.unshift(entry.label);
      if (entry.note) parts.push(entry.note);

      return parts.join(" · ");
    }

    function pickCode(code) {
      form.shiftCode = code.code;
    }

    function toggleDate(date) {
      if (!canWrite.value) return;

      if (selectedDates.value.includes(date)) {
        selectedDates.value = selectedDates.value.filter(
          (item) => item !== date
        );
        return;
      }

      selectedDates.value = [...selectedDates.value, date];
    }

    function clearSelection() {
      selectedDates.value = [];
    }

    function selectAllWeekday(weekday) {
      const year = Number(period.value.slice(0, 4));
      const month = Number(period.value.slice(5, 7));
      const lastDay = new Date(year, month, 0).getDate();
      const picked = [];

      for (let day = 1; day <= lastDay; day += 1) {
        const date = new Date(year, month - 1, day);

        if (date.getDay() === weekday) picked.push(isoDate(year, month, day));
      }

      selectedDates.value = picked;
    }

    function selectWeek() {
      const base = new Date(`${todayIso.value}T00:00:00`);
      const start = new Date(base);
      start.setDate(base.getDate() - base.getDay());

      const picked = [];

      for (let index = 0; index < 7; index += 1) {
        const date = new Date(start);
        date.setDate(start.getDate() + index);

        const iso = isoDate(
          date.getFullYear(),
          date.getMonth() + 1,
          date.getDate()
        );

        if (iso.slice(0, 7) === period.value) picked.push(iso);
      }

      selectedDates.value = picked;
    }

    function movePeriod(delta) {
      period.value = shiftPeriod(period.value, delta);
      clearSelection();
      reload();
    }

    async function reload() {
      isLoading.value = true;
      errorMessage.value = "";

      try {
        board.value = await fetchArcShifts({ period: period.value });
      } catch (error) {
        errorMessage.value =
          error?.response?.data?.message ||
          error?.message ||
          "번표를 불러오지 못했어요.";
      } finally {
        isLoading.value = false;
      }
    }

    async function submit() {
      if (!selectedDates.value.length) {
        errorMessage.value = "달력에서 날짜를 먼저 골라 주세요.";
        return;
      }

      isSaving.value = true;
      errorMessage.value = "";
      okMessage.value = "";

      const payload = {
        kind: form.kind,
        shiftCode: form.shiftCode,
        startTime: form.startTime,
        endTime: form.endTime,
        note: form.note,
      };

      try {
        if (selectedDates.value.length === 1) {
          await saveArcShift({ ...payload, workOn: selectedDates.value[0] });
        } else {
          await bulkSaveArcShifts({ ...payload, dates: selectedDates.value });
        }

        okMessage.value = `${selectedDates.value.length}일치 번표를 저장했어요.`;
        clearSelection();
        await reload();
      } catch (error) {
        errorMessage.value =
          error?.response?.data?.message ||
          error?.message ||
          "번표를 저장하지 못했어요.";
      } finally {
        isSaving.value = false;
      }
    }

    async function remove(entry) {
      isSaving.value = true;
      errorMessage.value = "";
      okMessage.value = "";

      try {
        await deleteArcShift(entry.id);
        okMessage.value = `${formatArcDate(entry.workOn)} 번표를 지웠어요.`;
        await reload();
      } catch (error) {
        errorMessage.value =
          error?.response?.data?.message ||
          error?.message ||
          "번표를 지우지 못했어요.";
      } finally {
        isSaving.value = false;
      }
    }

    onMounted(reload);

    return {
      period,
      periodLabel,
      board,
      catalog,
      summary,
      entries,
      canWrite,
      isLoading,
      isSaving,
      errorMessage,
      okMessage,
      selectedDates,
      selectedCode,
      selectedSummary,
      kindHint,
      form,
      calendarCells,
      callableDates,
      callableDateLabels,
      formatArcDate,
      departText,
      arriveText,
      entryChipLabel,
      entryTitle,
      pickCode,
      toggleDate,
      clearSelection,
      selectAllWeekday,
      selectWeek,
      movePeriod,
      reload,
      submit,
      remove,
    };
  },
};
</script>

<style scoped>
.arc-shift-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #334155;
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

.intro-card {
  padding: 16px 18px;
  border: 1px solid #dbeafe;
  border-radius: 16px;
  background: #f8fbff;
}

.intro-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.intro-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
}

.intro-badge {
  padding: 4px 10px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 700;
}

.intro-text {
  margin: 10px 0 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: #334155;
}

.tip-list {
  margin: 10px 0 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.7;
  color: #1e40af;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
}

.summary-card.ok {
  border-color: #a7f3d0;
  background: #f0fdf9;
}

.summary-card.danger {
  border-color: #fecaca;
  background: #fff5f5;
}

.summary-label {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
}

.summary-card strong {
  font-size: 19px;
  font-weight: 800;
  color: #0f172a;
}

.summary-sub {
  font-size: 11px;
  color: #94a3b8;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 1fr);
  gap: 16px;
}

@media (max-width: 980px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

.panel {
  padding: 16px 18px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
}

.panel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.panel-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
}

.panel-note {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: #64748b;
  line-height: 1.6;
}

.period-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.period-label {
  font-size: 14px;
  font-weight: 800;
  color: #0f172a;
}

.mini-button {
  padding: 7px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 9px;
  background: #fff;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.mini-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 6px;
}

.weekday {
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
}

.weekday.sunday {
  color: #dc2626;
}

.weekday.saturday {
  color: #2563eb;
}

.day-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.day-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 62px;
  padding: 6px 5px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  color: #334155;
  text-align: left;
  cursor: pointer;
}

.day-cell.blank {
  border: none;
  background: transparent;
  cursor: default;
}

.day-cell.today {
  border-color: #2563eb;
  box-shadow: inset 0 0 0 1px #2563eb;
}

.day-cell.callable {
  background: #f0fdf9;
}

.day-cell.blocked {
  background: #fff5f5;
}

.day-cell.selected {
  border-color: #f59e0b;
  background: #fffbeb;
  box-shadow: inset 0 0 0 1px #f59e0b;
}

.day-number {
  font-size: 11.5px;
  font-weight: 800;
  color: #0f172a;
}

.entry-chip {
  padding: 1px 4px;
  border-radius: 5px;
  font-size: 9.5px;
  font-weight: 700;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-chip.kind-shift {
  background: #dbeafe;
  color: #1d4ed8;
}

.entry-chip.kind-available {
  background: #d1fae5;
  color: #047857;
}

.entry-chip.kind-unavailable {
  background: #fee2e2;
  color: #b91c1c;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 12px;
  font-weight: 700;
  color: #334155;
}

.field input {
  padding: 9px 11px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 400;
  font-family: inherit;
  color: #0f172a;
}

.field-hint {
  font-size: 11px;
  font-weight: 400;
  color: #64748b;
  line-height: 1.6;
}

.choice-row,
.code-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.choice {
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.choice.active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
}

.code-button {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  color: #334155;
  font-size: 10.5px;
  cursor: pointer;
}

.code-button strong {
  font-size: 14px;
  color: #0f172a;
}

.code-button.active {
  border-color: #2563eb;
  background: #eff6ff;
}

.code-button.active strong {
  color: #1d4ed8;
}

.code-detail {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f1f5f9;
  font-size: 11.5px;
  line-height: 1.7;
  color: #334155;
}

.time-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.selected-list {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fffbeb;
  color: #92400e;
  font-size: 12px;
  font-weight: 700;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.primary-button {
  padding: 10px 18px;
  border: none;
  border-radius: 10px;
  background: #2563eb;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.primary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.quick-month {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed #e2e8f0;
}

.quick-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.callable-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.callable-chip {
  padding: 5px 10px;
  border-radius: 999px;
  background: #d1fae5;
  color: #047857;
  font-size: 11.5px;
  font-weight: 700;
}

.entry-table {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.entry-row {
  display: grid;
  grid-template-columns: 130px 90px minmax(0, 1fr) minmax(0, 1fr) 60px;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #eef2f7;
  border-radius: 10px;
  font-size: 12px;
}

.entry-date {
  font-weight: 700;
  color: #0f172a;
}

.entry-kind {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  text-align: center;
}

.entry-kind.kind-shift {
  background: #dbeafe;
  color: #1d4ed8;
}

.entry-kind.kind-available {
  background: #d1fae5;
  color: #047857;
}

.entry-kind.kind-unavailable {
  background: #fee2e2;
  color: #b91c1c;
}

.entry-time {
  color: #334155;
}

.entry-note {
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delete-button {
  padding: 5px 8px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fff;
  color: #b91c1c;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

@media (max-width: 720px) {
  .entry-row {
    grid-template-columns: 1fr 1fr;
  }

  .entry-note {
    grid-column: 1 / -1;
  }
}
</style>
