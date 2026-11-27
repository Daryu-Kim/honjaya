<template>
  <div class="admin-arc-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>응급안전관리센터</h1>
        <p class="description">
          구급상자·응급처치·사건 기록을 한 곳에서 관리해요. 민감한 건강정보는
          암호화해서 저장하고, 열람할 때는 사건별 승인을 받아요.
        </p>
      </div>
      <nav class="header-links">
        <router-link to="/admin/arc/routine" class="link-button">
          월간 루틴
        </router-link>
        <router-link to="/admin/arc/training" class="link-button">
          교육·OT
        </router-link>
        <router-link to="/admin/arc/stock" class="link-button">
          재고·유효기간
        </router-link>
        <router-link to="/admin/arc/stocktakes" class="link-button">
          월 실사
        </router-link>
        <router-link to="/admin/arc/purchases" class="link-button">
          보충·정산
        </router-link>
        <router-link to="/admin/arc/otc" class="link-button">
          개인 상비약
        </router-link>
        <router-link to="/admin/arc/incidents" class="link-button">
          사건·응급기록
        </router-link>
        <router-link to="/admin/arc/usages" class="link-button">
          사용대장
        </router-link>
        <router-link to="/admin/arc/expenses" class="link-button">
          실비정산
        </router-link>
        <router-link to="/admin/arc/quality" class="link-button">
          사후검토·개선
        </router-link>
        <router-link to="/admin/arc/events" class="link-button">
          행사·의료지원
        </router-link>
        <router-link to="/admin/arc/consents" class="link-button">
          동의서 관리
        </router-link>
        <router-link
          v-if="canApprove"
          to="/admin/arc/access"
          class="link-button"
        >
          열람 승인
        </router-link>
        <router-link
          v-if="canAdmin"
          to="/admin/arc/settings"
          class="link-button"
        >
          설정
        </router-link>
      </nav>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">안 읽은 알림</span>
        <strong>{{ summary.unreadNotifications ?? 0 }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">유효 동의서</span>
        <strong>{{ summary.activeConsents ?? 0 }}건</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (summary.pendingAccess ?? 0) > 0 }"
      >
        <span class="summary-label">열람 승인 대기</span>
        <strong>{{ summary.pendingAccess ?? 0 }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">최근 30일 열람</span>
        <strong>{{ summary.readsLast30Days ?? 0 }}건</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (stock.expired ?? 0) > 0 }"
      >
        <span class="summary-label">유효기간 지난 품목</span>
        <strong>{{ stock.expired ?? 0 }}개</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (stock.expiring30 ?? 0) > 0 }"
      >
        <span class="summary-label">30일 내 만료</span>
        <strong>{{ stock.expiring30 ?? 0 }}개</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (stock.lowStock ?? 0) > 0 }"
      >
        <span class="summary-label">재고 부족</span>
        <strong>{{ stock.lowStock ?? 0 }}개</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (stock.openedOverdue ?? 0) > 0 }"
      >
        <span class="summary-label">개봉 후 기한 초과</span>
        <strong>{{ stock.openedOverdue ?? 0 }}개</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (incidents.open ?? 0) > 0 }"
      >
        <span class="summary-label">진행 중 사건</span>
        <strong>{{ incidents.open ?? 0 }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">이번 달 사건</span>
        <strong>{{ incidents.thisMonth ?? 0 }}건</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (incidents.emergencyLast90Days ?? 0) > 0 }"
      >
        <span class="summary-label">90일 응급·119</span>
        <strong>{{ incidents.emergencyLast90Days ?? 0 }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">이번 달 소모금액</span>
        <strong>{{ formatArcMoney(usage.monthAmount) }}</strong>
        <small class="dim">{{ usage.monthCount ?? 0 }}건 사용</small>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (usage.unbilledCount ?? 0) > 0 }"
      >
        <span class="summary-label">아직 청구 전</span>
        <strong>{{ formatArcMoney(usage.unbilledAmount) }}</strong>
        <small class="dim">{{ usage.unbilledCount ?? 0 }}건</small>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (expense.openAmount ?? 0) > 0 }"
      >
        <span class="summary-label">미정산 금액</span>
        <strong>{{ formatArcMoney(expense.openAmount) }}</strong>
        <small class="dim">{{ expense.openCount ?? 0 }}건</small>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (expense.overdueCount ?? 0) > 0 }"
      >
        <span class="summary-label">정산 기한 지남</span>
        <strong>{{ expense.overdueCount ?? 0 }}건</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (quality.reviewPending ?? 0) > 0 }"
      >
        <span class="summary-label">사후검토 대기</span>
        <strong>{{ quality.reviewPending ?? 0 }}건</strong>
        <small class="dim">종결 사건 F11 미작성</small>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (quality.openCapa ?? 0) > 0 }"
      >
        <span class="summary-label">열린 CAPA</span>
        <strong>{{ quality.openCapa ?? 0 }}건</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (quality.overdueActions ?? 0) > 0 }"
      >
        <span class="summary-label">기한 지난 개선조치</span>
        <strong>{{ quality.overdueActions ?? 0 }}건</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (events.needsAttention ?? 0) > 0 }"
      >
        <span class="summary-label">예정 행사</span>
        <strong>{{ events.upcoming ?? 0 }}건</strong>
        <small class="dim">이번 주 {{ events.thisWeek ?? 0 }}건</small>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (events.needsAttention ?? 0) > 0 }"
      >
        <span class="summary-label">준비 미달 행사</span>
        <strong>{{ events.needsAttention ?? 0 }}건</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (events.noticeMissing ?? 0) > 0 }"
      >
        <span class="summary-label">고지서 미교부</span>
        <strong>{{ events.noticeMissing ?? 0 }}명</strong>
        <small class="dim">AS-NOT-001 외부 인력</small>
      </article>
    </section>

    <section class="panel routine-panel">
      <div class="panel-head">
        <h2>
          이번 달 운영 루틴
          <span class="dim">({{ routine.period || "-" }})</span>
        </h2>
        <div class="panel-actions">
          <span class="routine-progress">
            {{ routine.done ?? 0 }} / {{ routine.total ?? 0 }} 완료 ·
            {{ routine.percent ?? 0 }}%
          </span>
          <router-link to="/admin/arc/routine" class="text-link">
            루틴 열기
          </router-link>
        </div>
      </div>

      <div class="routine-track">
        <div
          class="routine-fill"
          :style="{ width: `${routine.percent ?? 0}%` }"
        ></div>
      </div>

      <p v-if="(routine.overdue ?? 0) > 0" class="routine-overdue">
        기한이 지난 루틴 {{ routine.overdue }}건이 있어요. 루틴 화면에서 처리해
        주세요.
      </p>

      <ul
        v-if="routine.active?.length || routine.next?.length"
        class="routine-list"
      >
        <li
          v-for="item in routine.active"
          :key="`active-${item.key}`"
          class="routine-row active"
        >
          <span class="routine-chip">지금</span>
          <strong>{{ item.title }}</strong>
          <span class="dim"
            >기한 {{ item.windowLabel }} · {{ item.owner }}</span
          >
        </li>
        <li
          v-for="item in routine.next"
          :key="`next-${item.key}`"
          class="routine-row"
        >
          <span class="routine-chip">예정</span>
          <strong>{{ item.title }}</strong>
          <span class="dim">기한 {{ item.windowLabel }}</span>
        </li>
      </ul>
      <p v-else class="empty-box">
        이번 달 루틴이 모두 끝났어요. 다음 달 루틴은 1일이 되면 자동으로 생겨요.
      </p>
    </section>

    <section v-if="!isKeyReady" class="warn-box">
      <strong>민감정보 암호화 키(ARC_FIELD_KEY)가 설정되지 않았어요.</strong>
      <p>
        동의서·상세 건강기록 기능은 키가 없으면 열리지 않아요. 서버
        <code>server/.env</code>에 32바이트 키를 넣고
        <code>docker compose up -d</code>로 다시 올려 주세요. 키를 잃으면 기존
        기록을 복구할 수 없으니 오프라인 사본을 꼭 보관해 주세요.
      </p>
    </section>

    <section v-else-if="!summary.alertChannelConfigured" class="warn-box">
      <strong>디스코드 알림 채널이 아직 지정되지 않았어요.</strong>
      <p>
        설정에서 <code>#응급안전</code> 채널 ID를 넣으면 유효기간·재고·사건
        알림이 디스코드로도 함께 나가요.
      </p>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>알림함</h2>
        <div class="panel-actions">
          <label class="checkbox-field">
            <input v-model="unreadOnly" type="checkbox" @change="loadAll" />
            <span>안 읽은 알림만</span>
          </label>
          <button
            type="button"
            class="preset-button"
            :disabled="isLoading"
            @click="loadAll"
          >
            새로고침
          </button>
          <button
            type="button"
            class="preset-button"
            :disabled="isLoading || !notifications.length"
            @click="readAll"
          >
            모두 읽음
          </button>
        </div>
      </div>

      <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>
      <p v-else-if="!notifications.length" class="empty-box">알림이 없어요.</p>

      <ul v-else class="notification-list">
        <li
          v-for="item in notifications"
          :key="item.id"
          class="notification-row"
          :class="{ unread: !item.readAt }"
        >
          <div class="row-head">
            <span class="level-chip" :class="ARC_LEVEL_TONES[item.level]">
              {{ ARC_LEVEL_LABELS[item.level] ?? item.level }}
            </span>
            <span class="kind-chip">
              {{ ARC_KIND_LABELS[item.kind] ?? item.kind }}
            </span>
            <strong class="row-title">{{ item.title }}</strong>
            <time class="row-time">{{
              formatArcDateTime(item.createdAt)
            }}</time>
          </div>
          <p class="row-body">{{ item.body }}</p>
          <div class="row-actions">
            <span v-if="item.incidentNo" class="incident-no">
              사건 {{ item.incidentNo }}
            </span>
            <router-link v-if="item.link" :to="item.link" class="text-link">
              바로가기
            </router-link>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";

import {
  ARC_KIND_LABELS,
  ARC_LEVEL_LABELS,
  ARC_LEVEL_TONES,
  fetchArcDashboard,
  fetchArcHealth,
  fetchArcNotifications,
  formatArcDateTime,
  formatArcMoney,
  markArcNotificationsRead,
} from "@/lib/arc";
import { hasPermission } from "@/lib/staffAuth";

const summary = ref({});
const routine = ref({});
const stock = ref({});
const incidents = ref({});
const usage = ref({});
const expense = ref({});
const quality = ref({});
const events = ref({});
const notifications = ref([]);
const isKeyReady = ref(true);
const unreadOnly = ref(false);
const isLoading = ref(false);
const errorMessage = ref("");

const canApprove = computed(() => hasPermission("arc.approve"));
const canAdmin = computed(() => hasPermission("arc.admin"));

async function loadSummary() {
  try {
    const data = await fetchArcDashboard();

    summary.value = data?.summary ?? {};
    routine.value = data?.routine ?? {};
    stock.value = data?.stock ?? {};
    incidents.value = data?.incidents ?? {};
    usage.value = data?.usage ?? {};
    expense.value = data?.expense ?? {};
    quality.value = data?.quality ?? {};
    events.value = data?.events ?? {};
  } catch (error) {
    errorMessage.value = error?.message || "현황을 불러오지 못했어요.";
  }
}

async function loadHealth() {
  try {
    const health = await fetchArcHealth();

    isKeyReady.value = Boolean(health?.fieldKeyConfigured);
  } catch {
    // 상태 확인 실패는 화면을 막지 않습니다.
  }
}

async function loadNotifications() {
  notifications.value = await fetchArcNotifications({
    unreadOnly: unreadOnly.value,
    limit: 30,
  });
}

async function loadAll() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    await Promise.all([loadSummary(), loadHealth(), loadNotifications()]);
  } catch (error) {
    errorMessage.value = error?.message || "알림을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function readAll() {
  if (isLoading.value) return;

  isLoading.value = true;
  errorMessage.value = "";

  try {
    await markArcNotificationsRead([]);
    await loadAll();
  } catch (error) {
    errorMessage.value = error?.message || "알림을 읽음 처리하지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadAll);
</script>

<style scoped lang="scss">
.admin-arc-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  min-height: 100%;
  color: #ffffff;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
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
  max-width: 660px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.66);
}

.header-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.link-button {
  flex-shrink: 0;
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

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);

  &.alert {
    background: rgba(251, 191, 36, 0.16);
  }

  strong {
    font-size: 20px;
    font-weight: 800;
  }
}

.summary-label {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.66);
}

.summary-card .dim {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.error-box {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(248, 113, 113, 0.14);
  color: #fca5a5;
  font-size: 13px;
}

.warn-box {
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(251, 191, 36, 0.14);
  color: #fcd34d;
  font-size: 13px;

  strong {
    display: block;
    margin-bottom: 6px;
    font-size: 14px;
  }

  p {
    margin: 0;
    line-height: 1.6;
  }

  code {
    padding: 1px 5px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.3);
    font-size: 12px;
  }
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 800;
  }
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.checkbox-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}

.preset-button {
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.empty-box {
  margin: 0;
  padding: 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.62);
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.notification-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid transparent;

  &.unread {
    border-color: rgba(99, 102, 241, 0.35);
    background: rgba(99, 102, 241, 0.1);
  }
}

.row-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.row-title {
  font-size: 14px;
  font-weight: 800;
}

.row-time {
  margin-left: auto;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.row-body {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.72);
  white-space: pre-wrap;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}

.incident-no {
  font-family: monospace;
  color: rgba(255, 255, 255, 0.6);
}

.text-link {
  color: #c7d2fe;
  font-weight: 700;
  text-decoration: none;
}

.level-chip {
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;

  &.info {
    background: rgba(96, 165, 250, 0.18);
    color: #93c5fd;
  }

  &.warn {
    background: rgba(251, 191, 36, 0.18);
    color: #fcd34d;
  }

  &.critical {
    background: rgba(248, 113, 113, 0.2);
    color: #fca5a5;
  }
}

.kind-chip {
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.72);
}

.routine-panel {
  display: grid;
  gap: 12px;
}

.routine-progress {
  font-size: 12px;
  font-weight: 800;
  color: #7dd3fc;
}

.routine-track {
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.routine-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #38bdf8, #22d3ee);
  transition: width 0.3s ease;
}

.routine-overdue {
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(248, 113, 113, 0.12);
  border: 1px solid rgba(248, 113, 113, 0.35);
  font-size: 12px;
  font-weight: 700;
  color: #fca5a5;
}

.routine-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.routine-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 13px;

  &.active {
    background: rgba(56, 189, 248, 0.12);
    border-color: rgba(56, 189, 248, 0.35);
  }
}

.routine-chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 11px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.8);
}
</style>
