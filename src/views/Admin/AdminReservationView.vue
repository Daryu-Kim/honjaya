<template>
  <div class="admin-reservation-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN RESERVATION</p>
        <h1>전자담배 예약 관리</h1>
        <p class="description">
          손님이 예약한 전자담배 픽업 건을 확인하고 처리해요. 픽업완료로 바꾸면
          재고가 실제로 차감돼요.
        </p>
      </div>
      <router-link to="/admin/shop/products" class="link-button">
        상품 관리
      </router-link>
    </header>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">접수</span>
        <strong>{{ summary.counts.REQUESTED ?? 0 }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">확정</span>
        <strong>{{ summary.counts.CONFIRMED ?? 0 }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">준비완료</span>
        <strong>{{ summary.counts.READY ?? 0 }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">픽업완료</span>
        <strong>{{ summary.counts.PICKED_UP ?? 0 }}건</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: summary.adultCheckPending > 0 }"
      >
        <span class="summary-label">신분증 미확인</span>
        <strong>{{ summary.adultCheckPending }}건</strong>
      </article>
    </section>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>

    <section class="panel">
      <div class="panel-head">
        <h2>예약 목록</h2>
        <div class="panel-actions">
          <button
            type="button"
            class="preset-button"
            :disabled="isLoading"
            @click="loadAll"
          >
            새로고침
          </button>
        </div>
      </div>

      <div class="filter-row">
        <select v-model="filterStatus" class="filter-input">
          <option value="">전체 상태</option>
          <option
            v-for="status in RESERVATION_STATUSES"
            :key="status"
            :value="status"
          >
            {{ RESERVATION_STATUS_LABELS[status] }}
          </option>
        </select>
        <label class="filter-field">
          <span>픽업일</span>
          <input v-model="filterFrom" type="date" class="filter-input" />
        </label>
        <label class="filter-field">
          <span>~</span>
          <input v-model="filterTo" type="date" class="filter-input" />
        </label>
        <input
          v-model="filterKeyword"
          type="search"
          class="filter-input"
          placeholder="예약번호·이름·연락처"
          @keyup.enter="loadReservations"
        />
        <button
          type="button"
          class="preset-button"
          :disabled="isLoading"
          @click="loadReservations"
        >
          검색
        </button>
      </div>

      <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>

      <p v-else-if="!reservations.length" class="empty-box">
        조건에 맞는 예약이 없어요.
      </p>

      <ul v-else class="reservation-list">
        <li
          v-for="reservation in reservations"
          :key="reservation.id"
          class="reservation-row"
        >
          <div class="row-head">
            <div class="row-title">
              <p class="reservation-no">{{ reservation.reservationNo }}</p>
              <span
                class="status-chip"
                :class="RESERVATION_STATUS_TONES[reservation.status] ?? 'muted'"
              >
                {{ reservation.statusLabel }}
              </span>
              <span v-if="reservation.isAdultOrder" class="status-chip adult"
                >성인</span
              >
              <span
                v-if="reservation.isAdultOrder && !reservation.adultCheckedAt"
                class="status-chip warn"
              >
                신분증 미확인
              </span>
            </div>
            <div class="row-meta">
              <span>{{ formatShopPickup(reservation.pickupAt) }}</span>
              <span
                >{{ reservation.customerName }} · {{ reservation.phone }}</span
              >
              <strong>{{ formatShopWon(reservation.totalAmount) }}</strong>
            </div>
          </div>

          <ul class="item-list">
            <li v-for="item in reservation.items" :key="item.id">
              <span class="item-name">{{ item.productName }}</span>
              <span v-if="item.optionText" class="item-option">{{
                item.optionText
              }}</span>
              <span class="item-qty">{{ item.quantity }}개</span>
              <span class="item-amount">{{
                formatShopWon(item.lineAmount)
              }}</span>
            </li>
          </ul>

          <p v-if="reservation.memo" class="memo">
            요청사항: {{ reservation.memo }}
          </p>
          <p v-if="reservation.statusMemo" class="memo">
            메모: {{ reservation.statusMemo }}
          </p>

          <div class="row-actions">
            <label v-if="reservation.isAdultOrder" class="check-item">
              <input
                type="checkbox"
                :checked="Boolean(reservation.adultCheckedAt)"
                :disabled="Boolean(reservation.adultCheckedAt) || isUpdating"
                @change="checkAdult(reservation)"
              />
              <span>신분증 확인</span>
            </label>

            <button
              v-for="action in nextActions(reservation)"
              :key="action.status"
              type="button"
              class="small-button"
              :class="action.tone"
              :disabled="isUpdating"
              @click="changeStatus(reservation, action)"
            >
              {{ action.label }}
            </button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";

import {
  RESERVATION_STATUSES,
  RESERVATION_STATUS_LABELS,
  RESERVATION_STATUS_TONES,
  fetchReservationSummary,
  fetchReservations,
  formatShopPickup,
  formatShopWon,
  updateReservation,
} from "@/lib/shop";

const reservations = ref([]);
const summary = reactive({
  counts: {},
  total: 0,
  adultCheckPending: 0,
});

const isLoading = ref(false);
const isUpdating = ref(false);
const errorMessage = ref("");

const filterStatus = ref("");
const filterFrom = ref("");
const filterTo = ref("");
const filterKeyword = ref("");

// 서버가 허용하는 상태 전이만 버튼으로 노출합니다.
const ACTION_MAP = {
  REQUESTED: [
    { status: "CONFIRMED", label: "확정", tone: "primary" },
    { status: "READY", label: "준비완료", tone: "primary" },
    { status: "CANCELED", label: "취소", tone: "danger" },
  ],
  CONFIRMED: [
    { status: "READY", label: "준비완료", tone: "primary" },
    { status: "PICKED_UP", label: "픽업완료", tone: "primary" },
    { status: "CANCELED", label: "취소", tone: "danger" },
  ],
  READY: [
    { status: "PICKED_UP", label: "픽업완료", tone: "primary" },
    { status: "NO_SHOW", label: "노쇼", tone: "danger" },
    { status: "CANCELED", label: "취소", tone: "danger" },
  ],
};

function nextActions(reservation) {
  return ACTION_MAP[reservation.status] ?? [];
}

async function loadReservations() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    reservations.value = await fetchReservations({
      status: filterStatus.value,
      from: filterFrom.value,
      to: filterTo.value,
      q: filterKeyword.value.trim(),
    });
  } catch (error) {
    errorMessage.value = error?.message || "예약 목록을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function loadSummary() {
  try {
    const data = await fetchReservationSummary();

    summary.counts = data.counts ?? {};
    summary.total = data.total ?? 0;
    summary.adultCheckPending = data.adultCheckPending ?? 0;
  } catch {
    // 요약은 참고용이라 실패해도 화면을 막지 않습니다.
  }
}

async function loadAll() {
  await Promise.all([loadReservations(), loadSummary()]);
}

async function checkAdult(reservation) {
  if (isUpdating.value) return;

  isUpdating.value = true;
  errorMessage.value = "";

  try {
    await updateReservation(reservation.id, { adultChecked: true });
    await loadAll();
  } catch (error) {
    errorMessage.value = error?.message || "신분증 확인을 저장하지 못했어요.";
  } finally {
    isUpdating.value = false;
  }
}

async function changeStatus(reservation, action) {
  if (isUpdating.value) return;

  if (action.status === "CANCELED" || action.status === "NO_SHOW") {
    const confirmed = window.confirm(
      `${reservation.reservationNo} 예약을 ${action.label} 처리할까요?`
    );

    if (!confirmed) return;
  }

  if (
    action.status === "PICKED_UP" &&
    reservation.isAdultOrder &&
    !reservation.adultCheckedAt
  ) {
    errorMessage.value =
      "성인 상품 예약이에요. 신분증 확인을 먼저 체크해 주세요.";

    return;
  }

  isUpdating.value = true;
  errorMessage.value = "";

  try {
    await updateReservation(reservation.id, { status: action.status });
    await loadAll();
  } catch (error) {
    errorMessage.value = error?.message || "상태를 바꾸지 못했어요.";
  } finally {
    isUpdating.value = false;
  }
}

onMounted(loadAll);
</script>

<style scoped lang="scss">
.admin-reservation-view {
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
  max-width: 640px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.66);
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
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
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

.error-box {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(248, 113, 113, 0.14);
  color: #fca5a5;
  font-size: 13px;
}

.panel {
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 800;
  }
}

.preset-button {
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.filter-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.filter-input {
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: #ffffff;
  font-size: 13px;
  outline: none;

  &::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }
}

.empty-box {
  margin: 0;
  padding: 24px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.reservation-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.reservation-row {
  padding: 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.07);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row-head {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.row-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
}

.reservation-no {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #c7d2fe;
}

.row-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);

  strong {
    font-size: 14px;
    color: #ffffff;
  }
}

.status-chip {
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.8);

  &.pending {
    background: rgba(251, 191, 36, 0.18);
    color: #fcd34d;
  }

  &.active {
    background: rgba(59, 130, 246, 0.22);
    color: #93c5fd;
  }

  &.ready {
    background: rgba(34, 197, 94, 0.2);
    color: #86efac;
  }

  &.done {
    background: rgba(148, 163, 184, 0.22);
    color: #cbd5e1;
  }

  &.warn {
    background: rgba(248, 113, 113, 0.2);
    color: #fca5a5;
  }

  &.muted {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.7);
  }

  &.adult {
    background: rgba(168, 85, 247, 0.22);
    color: #d8b4fe;
  }
}

.item-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;

  li {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    align-items: baseline;
  }
}

.item-name {
  font-weight: 700;
}

.item-option {
  color: rgba(255, 255, 255, 0.45);
}

.item-qty {
  color: rgba(255, 255, 255, 0.6);
}

.item-amount {
  margin-left: auto;
  color: #c7d2fe;
  font-weight: 700;
}

.memo {
  margin: 0;
  padding: 8px 10px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 11px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.6);
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
}

.check-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 9px;
  background: rgba(168, 85, 247, 0.16);
  font-size: 12px;
  color: #d8b4fe;
  cursor: pointer;
}

.small-button {
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.85);

  &.primary {
    background: rgba(99, 102, 241, 0.28);
    color: #c7d2fe;
  }

  &.danger {
    background: rgba(248, 113, 113, 0.16);
    color: #fca5a5;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}
</style>
