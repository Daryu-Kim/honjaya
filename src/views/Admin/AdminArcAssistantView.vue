<template>
  <div class="admin-arc-assistant-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY · 비서</p>
        <h1>ARC 비서</h1>
        <p class="description">
          오늘 챙겨야 할 일만 모았어요. 급한 것부터 위에 있고, 카드를 누르면
          바로 그 화면으로 이동합니다. 사장 보고용 3줄 요약은 복사해서 그대로
          쓰시면 돼요.
        </p>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="ghost-button"
          :disabled="isLoading"
          @click="load"
        >
          새로고침
        </button>
        <router-link to="/admin/arc" class="link-button"
          >응급안전 홈</router-link
        >
      </div>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="isLoading && !briefing" class="empty-box">불러오는 중이에요.</p>

    <template v-if="briefing">
      <section class="summary-strip">
        <div class="summary-cell">
          <span class="summary-label">오늘</span>
          <strong class="summary-value">{{ briefing.today }}</strong>
        </div>
        <div class="summary-cell">
          <span class="summary-label">즉시 조치</span>
          <strong class="summary-value danger">{{ briefing.counts.p0 }}</strong>
        </div>
        <div class="summary-cell">
          <span class="summary-label">이번 주 확인</span>
          <strong class="summary-value warn">{{ briefing.counts.p1 }}</strong>
        </div>
        <div class="summary-cell">
          <span class="summary-label">참고</span>
          <strong class="summary-value">{{ briefing.counts.p2 }}</strong>
        </div>
      </section>

      <section class="panel routine-panel">
        <div class="routine-head">
          <div>
            <h2>{{ briefing.routine.period }} 월간 운영 루틴</h2>
            <p class="helper-text">
              오늘은 {{ briefing.routine.todayDay }}일 ·
              {{ briefing.routine.done }}/{{ briefing.routine.total }}건 완료
              <template v-if="briefing.routine.overdue > 0">
                · 기한 초과 {{ briefing.routine.overdue }}건
              </template>
            </p>
          </div>
          <span class="routine-percent">{{ briefing.routine.percent }}%</span>
        </div>

        <div class="progress-track">
          <div
            class="progress-bar"
            :style="{ width: `${briefing.routine.percent}%` }"
          ></div>
        </div>

        <div v-if="briefing.routine.active.length" class="routine-block">
          <h3>지금 할 일</h3>
          <ul class="routine-list">
            <li v-for="step in briefing.routine.active" :key="step.key">
              <router-link :to="step.link || '/admin/arc/routine'">
                <strong>{{ step.title }}</strong>
                <span class="routine-window">{{ step.windowLabel }}</span>
                <span class="routine-check">
                  체크 {{ step.checkedCount }}/{{ step.itemCount }}
                  <template v-if="step.requiresSignature">
                    · 대표 확인 필요</template
                  >
                </span>
              </router-link>
            </li>
          </ul>
        </div>

        <div v-if="briefing.routine.next.length" class="routine-block">
          <h3>곧 시작</h3>
          <ul class="routine-list muted">
            <li v-for="step in briefing.routine.next" :key="step.key">
              <router-link :to="step.link || '/admin/arc/routine'">
                <strong>{{ step.title }}</strong>
                <span class="routine-window">{{ step.windowLabel }}</span>
              </router-link>
            </li>
          </ul>
        </div>

        <router-link to="/admin/arc/routine" class="inline-link">
          루틴 전체 보기 →
        </router-link>
      </section>

      <section class="panel">
        <h2>오늘 챙길 일</h2>
        <p v-if="!briefing.cards.length" class="empty-box ok">
          지금 급한 일은 없어요. 기록 정리나 다음 달 준비를 해 보세요.
        </p>

        <ul v-else class="card-list">
          <li
            v-for="item in briefing.cards"
            :key="item.key"
            class="task-card"
            :class="item.priority.toLowerCase()"
          >
            <div class="task-main">
              <span class="priority-badge">{{
                priorityLabel(item.priority)
              }}</span>
              <strong class="task-title">{{ item.title }}</strong>
              <span v-if="item.count" class="task-count"
                >{{ item.count }}{{ item.unit }}</span
              >
              <p class="task-detail">{{ item.detail }}</p>
            </div>
            <router-link :to="item.link" class="task-action">
              {{ item.action }} →
            </router-link>
          </li>
        </ul>
      </section>

      <section class="panel">
        <div class="routine-head">
          <h2>사장 보고용 3줄 요약</h2>
          <button type="button" class="ghost-button" @click="copyBriefing">
            복사하기
          </button>
        </div>
        <ol class="briefing-list">
          <li v-for="(line, index) in briefing.briefing" :key="index">
            {{ line }}
          </li>
        </ol>
        <p class="helper-text">
          정산·재고 금액이 걸린 항목은 '금액'까지 함께 보고하면 확인이 빨라요.
        </p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";

import { fetchArcAssistant } from "@/lib/arc";

const briefing = ref(null);
const isLoading = ref(false);
const errorMessage = ref("");

const PRIORITY_LABELS = {
  P0: "즉시",
  P1: "이번 주",
  P2: "참고",
};

function priorityLabel(priority) {
  return PRIORITY_LABELS[priority] || priority;
}

async function load() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    briefing.value = await fetchArcAssistant();
  } catch (error) {
    errorMessage.value = error?.message || "브리핑을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function copyBriefing() {
  const text = (briefing.value?.briefing ?? []).join("\n");

  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    window.alert("보고용 요약을 복사했어요.");
  } catch {
    window.prompt("아래 내용을 복사해 주세요.", text);
  }
}

onMounted(load);
</script>

<style scoped lang="scss">
.admin-arc-assistant-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  min-height: 100%;
  color: #ffffff;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.page-header .eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.55);
}

.page-header h1 {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 800;
}

.description {
  margin: 0;
  max-width: 720px;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.72);
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.link-button {
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid rgba(99, 102, 241, 0.4);
  background: rgba(99, 102, 241, 0.16);
  color: #c7d2fe;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.ghost-button {
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.88);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}

.summary-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.55);
}

.summary-label {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.6);
}

.summary-value {
  font-size: 22px;
  font-weight: 800;

  &.danger {
    color: #fca5a5;
  }

  &.warn {
    color: #fcd34d;
  }
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 800;
  }

  h3 {
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 800;
    color: rgba(255, 255, 255, 0.8);
  }
}

.routine-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.routine-percent {
  font-size: 24px;
  font-weight: 800;
  color: #6ee7b7;
}

.helper-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.66);
}

.progress-track {
  height: 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.6);
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #34d399, #22d3ee);
  transition: width 0.3s ease;
}

.routine-block {
  display: flex;
  flex-direction: column;
}

.routine-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;

  a {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    padding: 12px 14px;
    border-radius: 14px;
    background: rgba(15, 23, 42, 0.5);
    color: inherit;
    text-decoration: none;
  }

  strong {
    font-size: 14px;
  }

  &.muted a {
    opacity: 0.72;
  }
}

.routine-window {
  font-size: 12px;
  font-weight: 700;
  color: #a5b4fc;
}

.routine-check {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
}

.inline-link {
  align-self: flex-start;
  font-size: 13px;
  font-weight: 700;
  color: #7dd3fc;
  text-decoration: none;
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.task-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.55);
  border-left: 4px solid rgba(148, 163, 184, 0.5);

  &.p0 {
    border-left-color: #f87171;
  }

  &.p1 {
    border-left-color: #fbbf24;
  }

  &.p2 {
    border-left-color: #38bdf8;
  }
}

.task-main {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}

.priority-badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 11px;
  font-weight: 800;
}

.task-title {
  font-size: 15px;
}

.task-count {
  font-size: 12px;
  font-weight: 800;
  color: #fcd34d;
}

.task-detail {
  flex-basis: 100%;
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.72);
}

.task-action {
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid rgba(56, 189, 248, 0.4);
  background: rgba(56, 189, 248, 0.14);
  color: #bae6fd;
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.briefing-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding-left: 20px;
  font-size: 14px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.85);
}

.error-box {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(248, 113, 113, 0.16);
  color: #fecaca;
  font-size: 13px;
  font-weight: 700;
}

.empty-box {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;

  &.ok {
    background: rgba(52, 211, 153, 0.14);
    color: #a7f3d0;
    font-weight: 700;
  }
}
</style>
