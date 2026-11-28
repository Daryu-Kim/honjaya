<template>
  <div class="admin-arc-assistant-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY · 비서</p>
        <h1>ARC 비서</h1>
        <p class="description">
          {{ viewer.headline || "오늘 챙겨야 할 일만 모았어요." }}
          급한 것부터 위에 있고, 카드를 누르면 바로 그 화면으로 이동합니다.
        </p>
        <p class="helper-text">{{ viewer.hint }}</p>
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
      <section class="summary-grid">
        <article class="summary-card">
          <p class="summary-label">오늘</p>
          <strong class="summary-value">{{
            formatKoreanDate(briefing.today)
          }}</strong>
          <p class="summary-note">{{ viewer.kindLabel }}</p>
        </article>
        <article class="summary-card">
          <p class="summary-label">즉시 조치</p>
          <strong class="summary-value danger">{{ briefing.counts.p0 }}</strong>
          <p class="summary-note">오늘 안에 처리</p>
        </article>
        <article class="summary-card">
          <p class="summary-label">이번 주 확인</p>
          <strong class="summary-value warn">{{ briefing.counts.p1 }}</strong>
          <p class="summary-note">이번 주 안에 처리</p>
        </article>
        <article class="summary-card">
          <p class="summary-label">참고</p>
          <strong class="summary-value">{{ briefing.counts.p2 }}</strong>
          <p class="summary-note">여유 있을 때</p>
        </article>
        <article class="summary-card">
          <p class="summary-label">내 권한</p>
          <strong class="summary-value">
            {{ myPermissions.grantedCount
            }}<small>/{{ myPermissions.total }}</small>
          </strong>
          <p class="summary-note">
            {{
              myPermissions.isDirector ? "전체 권한 고정" : "권한 관리에서 조정"
            }}
          </p>
        </article>
      </section>

      <section class="panel">
        <header class="panel-head">
          <div>
            <h2>내 응급안전 권한</h2>
            <p class="helper-text">
              {{ permissionIntro }}
            </p>
          </div>
          <router-link
            v-if="myPermissions.isDirector"
            to="/admin/arc/permissions"
            class="inline-link"
          >
            권한 관리로 이동 →
          </router-link>
        </header>

        <div class="perm-groups">
          <article
            v-for="group in myPermissions.groups"
            :key="group.name"
            class="perm-group"
          >
            <h3 class="perm-group-title">
              {{ group.name }}
              <span class="perm-count">
                {{ groupGranted(group) }}/{{ groupTotal(group) }}
              </span>
            </h3>

            <ul class="perm-list">
              <li
                v-for="item in group.items"
                :key="item.permission"
                class="perm-row"
              >
                <span class="perm-chip" :class="item.granted ? 'on' : 'off'">
                  {{ item.label }}
                </span>

                <template v-if="item.actions?.length">
                  <span
                    v-for="action in item.actions"
                    :key="action.permission"
                    class="perm-action-chip"
                    :class="{
                      on: action.granted,
                      off: !action.granted,
                      locked: action.directorOnly,
                    }"
                  >
                    {{ action.label }}
                  </span>
                </template>
              </li>
            </ul>
          </article>
        </div>
      </section>

      <section v-if="briefing.routine" class="panel routine-panel">
        <header class="panel-head">
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
        </header>

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
        <header class="panel-head">
          <div>
            <h2>오늘 챙길 일</h2>
            <p class="helper-text">
              내 권한으로 처리할 수 있는 일만 모았어요. 권한이 바뀌면 이 목록도
              다음 새로고침부터 바로 바뀝니다.
            </p>
          </div>
        </header>

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
              <span v-if="item.count" class="task-count">
                {{ item.count }}{{ item.unit }}
              </span>
              <p class="task-detail">{{ item.detail }}</p>
            </div>
            <router-link :to="item.link" class="task-action">
              {{ item.action }} →
            </router-link>
          </li>
        </ul>
      </section>

      <section v-if="canSeeReport" class="panel">
        <header class="panel-head">
          <div>
            <h2>사장 보고용 3줄 요약</h2>
            <p class="helper-text">
              정산·재고 금액이 걸린 항목은 '금액'까지 함께 보고하면 확인이
              빨라요.
            </p>
          </div>
          <button type="button" class="ghost-button" @click="copyBriefing">
            복사하기
          </button>
        </header>
        <ol class="briefing-list">
          <li v-for="(line, index) in briefing.briefing" :key="index">
            {{ line }}
          </li>
        </ol>
      </section>

      <section v-else class="panel">
        <header class="panel-head">
          <div>
            <h2>필요한 권한이 있으면 요청해 주세요</h2>
            <p class="helper-text">
              응급안전 권한은 ARC 대표(RN)만 바꿀 수 있어요. 업무에 필요한
              메뉴나 동작이 잠겨 있으면 요청 게시판에 남겨 주세요. 확인·처리
              상태도 여기서 볼 수 있습니다.
            </p>
          </div>
          <router-link to="/admin/arc/requests" class="link-button">
            요청 게시판
          </router-link>
        </header>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";

import { fetchArcAssistant, formatArcDate } from "@/lib/arc";

const briefing = ref(null);
const isLoading = ref(false);
const errorMessage = ref("");

const EMPTY_SNAPSHOT = {
  groups: [],
  total: 0,
  grantedCount: 0,
  granted: [],
  isDirector: false,
};

const PRIORITY_LABELS = {
  P0: "즉시",
  P1: "이번 주",
  P2: "참고",
};

const VIEWER_KIND_LABELS = {
  DIRECTOR: "ARC 대표(RN) 시점",
  OWNER: "사장 시점",
  STAFF: "직원 시점",
  GUEST: "권한 안내",
};

const viewer = computed(() => {
  const raw = briefing.value?.viewer ?? {};

  return {
    kind: raw.kind || "STAFF",
    kindLabel: VIEWER_KIND_LABELS[raw.kind] || "내 시점",
    headline: raw.headline || "",
    hint: raw.hint || "",
  };
});

const myPermissions = computed(() => ({
  ...EMPTY_SNAPSHOT,
  ...(briefing.value?.myPermissions ?? {}),
}));

const canSeeReport = computed(() => Boolean(briefing.value?.briefing?.length));

const permissionIntro = computed(() => {
  if (myPermissions.value.isDirector) {
    return "ARC 대표(RN)는 메뉴와 동작 권한이 항상 전부 열려 있어요. 다른 사람의 권한은 '권한 관리'에서 조정합니다.";
  }

  return "지금 내가 가진 권한이에요. 회색 칩은 아직 없는 권한이고, 필요한 권한은 요청 게시판으로 ARC 대표(RN)에게 요청하면 됩니다.";
});

function priorityLabel(priority) {
  return PRIORITY_LABELS[priority] || priority;
}

function formatKoreanDate(value) {
  return value ? formatArcDate(value) || value : "";
}

function groupTotal(group) {
  return group.items.reduce(
    (sum, item) => sum + 1 + (item.actions?.length ?? 0),
    0
  );
}

function groupGranted(group) {
  return group.items.reduce(
    (sum, item) =>
      sum +
      (item.granted ? 1 : 0) +
      (item.actions ?? []).filter((action) => action.granted).length,
    0
  );
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
@use "../../scss/_arc-ui" as *;
.admin-arc-assistant-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  min-height: 100%;
  color: #ffffff;
}

.header-actions {
  flex-shrink: 0;
}

.summary-value small {
  margin-left: 2px;
  font-size: 13px;
  font-weight: 700;
  opacity: 0.6;
}

.summary-value.danger {
  color: var(--arc-danger, #fca5a5);
}

.summary-value.warn {
  color: var(--arc-warn, #fcd34d);
}

.perm-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 14px;
}

.perm-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--arc-line, rgba(255, 255, 255, 0.12));
  border-radius: var(--arc-radius, 14px);
  background: var(--arc-surface-2, rgba(255, 255, 255, 0.05));
}

.perm-group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--arc-line, rgba(255, 255, 255, 0.12));
  font-size: 13px;
  font-weight: 800;
}

.perm-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.perm-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.perm-chip,
.perm-action-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1.5;
  white-space: nowrap;
}

.perm-chip {
  font-size: 12px;

  &.on {
    color: #fcd34d;
    background: var(--arc-brand-soft, rgba(251, 191, 36, 0.14));
    border: 1px solid var(--arc-brand-line, rgba(251, 191, 36, 0.36));
  }

  &.off {
    color: var(--arc-ink-3, rgba(255, 255, 255, 0.74));
    background: rgba(255, 255, 255, 0.06);
    border: 1px dashed var(--arc-line-2, rgba(255, 255, 255, 0.16));
    text-decoration: line-through;
  }
}

.perm-action-chip {
  &.on {
    color: var(--arc-ok, #6ee7b7);
    background: var(--arc-ok-bg, rgba(52, 211, 153, 0.14));
    border: 1px solid var(--arc-ok-line, rgba(52, 211, 153, 0.36));
  }

  &.off {
    color: var(--arc-ink-3, rgba(255, 255, 255, 0.74));
    background: rgba(255, 255, 255, 0.08);
    border: 1px dashed var(--arc-line-2, rgba(255, 255, 255, 0.16));
  }

  &.locked {
    opacity: 0.75;
  }
}

.routine-percent {
  font-size: 24px;
  font-weight: 800;
  color: var(--arc-ok, #6ee7b7);
}

.progress-track {
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #10b981, #0ea5e9);
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
    padding: 11px 13px;
    border: 1px solid var(--arc-line, rgba(255, 255, 255, 0.12));
    border-radius: 12px;
    background: var(--arc-surface-2, rgba(255, 255, 255, 0.05));
    color: inherit;
    text-decoration: none;
  }

  strong {
    font-size: 14px;
  }

  &.muted a {
    opacity: 0.75;
  }
}

.routine-window {
  font-size: 12px;
  font-weight: 700;
  color: var(--arc-info, #93c5fd);
}

.routine-check {
  font-size: 12px;
  color: var(--arc-ink-3, rgba(255, 255, 255, 0.74));
}

.inline-link {
  align-self: flex-start;
  font-size: 13px;
  font-weight: 700;
  color: var(--arc-info, #93c5fd);
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
  border: 1px solid var(--arc-line, rgba(255, 255, 255, 0.12));
  border-left: 4px solid var(--arc-line-2, rgba(255, 255, 255, 0.16));
  border-radius: 14px;
  background: var(--arc-surface-2, rgba(255, 255, 255, 0.05));

  &.p0 {
    border-left-color: var(--arc-danger, #b91c1c);
    background: var(--arc-danger-bg, rgba(248, 113, 113, 0.14));
  }

  &.p1 {
    border-left-color: var(--arc-warn, #f59e0b);
    background: var(--arc-warn-bg, rgba(251, 191, 36, 0.14));
  }

  &.p2 {
    border-left-color: var(--arc-info, rgba(96, 165, 250, 0.6));
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
  border: 1px solid var(--arc-line-2, rgba(255, 255, 255, 0.16));
  background: rgba(255, 255, 255, 0.08);
  font-size: 11px;
  font-weight: 800;
  color: var(--arc-ink-2, rgba(255, 255, 255, 0.86));
}

.task-title {
  font-size: 15px;
}

.task-count {
  font-size: 12px;
  font-weight: 800;
  color: var(--arc-warn, #fcd34d);
}

.task-detail {
  flex-basis: 100%;
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--arc-ink-2, rgba(255, 255, 255, 0.86));
}

.task-action {
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--arc-info-line, rgba(96, 165, 250, 0.36));
  background: var(--arc-info-bg, rgba(96, 165, 250, 0.16));
  color: #93c5fd;
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
}
</style>
