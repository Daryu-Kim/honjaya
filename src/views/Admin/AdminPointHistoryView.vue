<template>
  <div class="admin-point-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN POINTS</p>
        <h1>포인트 관리</h1>
        <p class="description">
          고객 적립·사용 내역을 조회하고, 필요하면 사장 권한으로 포인트를 조정할
          수 있어요.
        </p>
      </div>
    </header>

    <section class="filter-section">
      <div class="filter-card">
        <div class="filter-grid">
          <div class="filter-group wide">
            <label for="pointPhone">고객 전화번호</label>
            <input
              id="pointPhone"
              :value="phoneInput"
              type="tel"
              inputmode="numeric"
              maxlength="13"
              placeholder="010-0000-0000"
              @input="onPhoneInput"
              @keyup.enter="applyPhoneFilter"
            />
          </div>

          <div class="filter-group">
            <label for="pointStartDate">시작일</label>
            <input id="pointStartDate" v-model="startDate" type="date" />
          </div>

          <div class="filter-group">
            <label for="pointEndDate">종료일</label>
            <input id="pointEndDate" v-model="endDate" type="date" />
          </div>
        </div>

        <div class="filter-actions">
          <button type="button" class="preset-button" @click="setThisMonth">
            이번달
          </button>
          <button type="button" class="preset-button" @click="resetFilters">
            전체 기간
          </button>
          <button
            type="button"
            class="preset-button"
            :disabled="isLoadingLedger"
            @click="loadLedger"
          >
            조회
          </button>
        </div>
      </div>
    </section>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">총 적립</span>
        <strong>{{ formatPointValue(ledger.totals.earned) }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">총 사용</span>
        <strong>-{{ formatPointValue(ledger.totals.redeemed) }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">총 소멸</span>
        <strong>-{{ formatPointValue(ledger.totals.expired) }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">총 조정</span>
        <strong>{{ formatPointValue(ledger.totals.adjusted) }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">미사용 잔액(전체)</span>
        <strong>{{ formatPointValue(ledger.totals.liability) }}</strong>
      </article>
    </section>

    <section v-if="activePhone" class="customer-section">
      <div class="customer-card">
        <div class="customer-head">
          <div>
            <h2>고객 정보</h2>
            <p class="description">{{ activePhone }}</p>
          </div>
          <button
            type="button"
            class="preset-button"
            :disabled="isLoadingCustomer"
            @click="loadCustomer"
          >
            새로고침
          </button>
        </div>

        <p v-if="customerError" class="ledger-error">{{ customerError }}</p>

        <div v-if="isLoadingCustomer" class="empty-box">
          <p>고객 정보를 불러오는 중이에요.</p>
        </div>

        <template v-else>
          <div class="summary-grid customer-summary-grid">
            <article class="summary-card">
              <span class="summary-label">고객명</span>
              <strong>{{ customer.name || "미등록" }}</strong>
            </article>
            <article class="summary-card">
              <span class="summary-label">보유 포인트</span>
              <strong>{{ formatPointValue(customer.balance) }}</strong>
            </article>
            <article class="summary-card">
              <span class="summary-label">곧 소멸</span>
              <strong>{{ formatPointValue(expiringSoonTotal) }}</strong>
            </article>
          </div>

          <p v-if="customer.memo" class="customer-memo">
            메모: {{ customer.memo }}
          </p>

          <form
            v-if="canAdjust"
            class="adjust-form"
            @submit.prevent="submitAdjust"
          >
            <h3>포인트 조정 (사장 전용)</h3>
            <div class="adjust-grid">
              <div class="filter-group">
                <label for="adjustPoints">조정 포인트</label>
                <input
                  id="adjustPoints"
                  v-model.number="adjustForm.points"
                  type="number"
                  step="100"
                  placeholder="예: 5000 / -1000"
                />
              </div>
              <div class="filter-group wide">
                <label for="adjustReason">사유</label>
                <input
                  id="adjustReason"
                  v-model.trim="adjustForm.reason"
                  type="text"
                  maxlength="200"
                  placeholder="예: 이벤트 보상 지급"
                />
              </div>
            </div>
            <div class="filter-actions">
              <button
                type="submit"
                class="preset-button"
                :disabled="isAdjusting"
              >
                {{ isAdjusting ? "처리 중..." : "조정 적용" }}
              </button>
            </div>
            <p v-if="adjustMessage" class="adjust-message">
              {{ adjustMessage }}
            </p>
          </form>

          <div v-if="customer.history.length > 0" class="history-block">
            <h3>최근 내역</h3>
            <div class="table-wrap">
              <table class="payment-table">
                <thead>
                  <tr>
                    <th>일시</th>
                    <th>구분</th>
                    <th>포인트</th>
                    <th>잔액</th>
                    <th>사유</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="entry in customer.history" :key="entry.id">
                    <td>{{ formatDateTime(entry.occurredAt) }}</td>
                    <td>{{ getPointEntryLabel(entry.entryType) }}</td>
                    <td
                      :class="entry.points >= 0 ? 'point-plus' : 'point-minus'"
                    >
                      {{ entry.points >= 0 ? "+" : ""
                      }}{{ formatPointValue(entry.points) }}
                    </td>
                    <td>{{ formatPointValue(entry.balanceAfter) }}</td>
                    <td>{{ entry.reason || "-" }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>
    </section>

    <section class="ledger-section">
      <div class="ledger-head">
        <div>
          <h2>포인트 원장</h2>
          <p class="description">
            선택한 기간의 적립·사용·소멸·조정 기록이에요. (영업일 기준)
          </p>
        </div>
        <button
          type="button"
          class="preset-button"
          :disabled="isLoadingLedger"
          @click="loadLedger"
        >
          새로고침
        </button>
      </div>

      <p v-if="ledgerError" class="ledger-error">{{ ledgerError }}</p>

      <div v-if="isLoadingLedger" class="empty-box">
        <p>포인트 원장을 불러오는 중이에요.</p>
      </div>

      <div v-else-if="ledger.entries.length === 0" class="empty-box">
        <p>포인트 기록이 없어요.</p>
      </div>

      <div v-else class="table-wrap">
        <table class="payment-table">
          <thead>
            <tr>
              <th>일시</th>
              <th>고객</th>
              <th>구분</th>
              <th>포인트</th>
              <th>잔액</th>
              <th>사유</th>
              <th>주문서</th>
              <th>처리자</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in ledger.entries" :key="entry.id">
              <td>{{ formatDateTime(entry.occurredAt) }}</td>
              <td>
                {{ entry.customerName || "고객" }}
                <span class="phone-text">{{
                  formatPhoneNumber(entry.customerPhone)
                }}</span>
              </td>
              <td>{{ getPointEntryLabel(entry.entryType) }}</td>
              <td :class="entry.points >= 0 ? 'point-plus' : 'point-minus'">
                {{ entry.points >= 0 ? "+" : ""
                }}{{ formatPointValue(entry.points) }}
              </td>
              <td>{{ formatPointValue(entry.balanceAfter) }}</td>
              <td>{{ entry.reason || "-" }}</td>
              <td>{{ entry.orderSheetId || "-" }}</td>
              <td>{{ entry.employeeName || "-" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import {
  formatInputDate,
  getCurrentBusinessDateInput,
} from "@/lib/businessDay";
import {
  adjustCustomerPoints,
  fetchCustomerPoints,
  fetchPointLedger,
  formatPhoneInput,
  formatPointValue,
  getPointEntryLabel,
  normalizePhoneNumber,
} from "@/lib/points";
import { hasPermission } from "@/lib/staffAuth";

const POINT_ADJUST_PERMISSION = "point.adjust";

const route = useRoute();

const canAdjust = computed(() => hasPermission(POINT_ADJUST_PERMISSION));

const phoneInput = ref("");
const activePhone = ref("");
const startDate = ref("");
const endDate = ref("");

const isLoadingLedger = ref(false);
const ledgerError = ref("");
const ledger = ref({
  entries: [],
  customer: null,
  totals: {
    earned: 0,
    redeemed: 0,
    expired: 0,
    adjusted: 0,
    liability: 0,
  },
});

const isLoadingCustomer = ref(false);
const customerError = ref("");
const customer = ref({
  name: "",
  memo: "",
  balance: 0,
  expiringSoon: [],
  history: [],
});

const isAdjusting = ref(false);
const adjustMessage = ref("");
const adjustForm = ref({ points: null, reason: "" });

const expiringSoonTotal = computed(() =>
  customer.value.expiringSoon.reduce(
    (acc, lot) => acc + Number(lot.points || 0),
    0
  )
);

function formatPhoneNumber(value) {
  return formatPhoneInput(value);
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${month}.${day} ${hours}:${minutes}`;
}

function onPhoneInput(event) {
  const formatted = formatPhoneInput(event.target.value);

  phoneInput.value = formatted;

  if (event.target.value !== formatted) {
    event.target.value = formatted;
  }
}

function applyPhoneFilter() {
  activePhone.value = normalizePhoneNumber(phoneInput.value);

  if (!activePhone.value) {
    resetCustomer();
  }

  loadLedger();

  if (activePhone.value) {
    loadCustomer();
  }
}

function resetCustomer() {
  customerError.value = "";
  adjustMessage.value = "";
  customer.value = {
    name: "",
    memo: "",
    balance: 0,
    expiringSoon: [],
    history: [],
  };
}

async function loadCustomer() {
  const phone = activePhone.value;

  if (!phone) return;

  isLoadingCustomer.value = true;
  customerError.value = "";

  try {
    const result = await fetchCustomerPoints({ phone, historyLimit: 30 });

    customer.value = {
      name: result?.customer?.name || "",
      memo: result?.customer?.memo || "",
      balance: Number(result?.balance || 0),
      expiringSoon: Array.isArray(result?.expiringSoon)
        ? result.expiringSoon
        : [],
      history: Array.isArray(result?.history) ? result.history : [],
    };
  } catch (error) {
    console.error("고객 포인트 조회 실패:", error);
    customerError.value = error?.message || "고객 포인트를 불러오지 못했어요.";
    resetCustomer();
  } finally {
    isLoadingCustomer.value = false;
  }
}

async function loadLedger() {
  isLoadingLedger.value = true;
  ledgerError.value = "";

  try {
    ledger.value = await fetchPointLedger({
      from: startDate.value,
      to: endDate.value,
      phone: activePhone.value,
      limit: 200,
    });
  } catch (error) {
    console.error("포인트 원장 조회 실패:", error);
    ledgerError.value = error?.message || "포인트 원장을 불러오지 못했어요.";
    ledger.value = {
      entries: [],
      customer: null,
      totals: {
        earned: 0,
        redeemed: 0,
        expired: 0,
        adjusted: 0,
        liability: 0,
      },
    };
  } finally {
    isLoadingLedger.value = false;
  }
}

function setThisMonth() {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);

  startDate.value = formatInputDate(first);
  endDate.value = getCurrentBusinessDateInput();
  loadLedger();
}

function resetFilters() {
  startDate.value = "";
  endDate.value = "";
  loadLedger();
}

async function submitAdjust() {
  if (!activePhone.value) {
    adjustMessage.value = "고객 전화번호를 먼저 조회해 주세요.";
    return;
  }

  const points = Number(adjustForm.value.points || 0);
  const reason = String(adjustForm.value.reason || "").trim();

  if (!Number.isInteger(points) || points === 0) {
    adjustMessage.value = "조정할 포인트를 0이 아닌 정수로 입력해 주세요.";
    return;
  }

  if (!reason) {
    adjustMessage.value = "조정 사유를 입력해 주세요.";
    return;
  }

  const confirmed = window.confirm(
    `${activePhone.value} 고객 포인트를 ${
      points > 0 ? "+" : ""
    }${points.toLocaleString("ko-KR")}P 조정할까요?`
  );

  if (!confirmed) return;

  isAdjusting.value = true;
  adjustMessage.value = "";

  try {
    const result = await adjustCustomerPoints({
      phone: activePhone.value,
      points,
      reason,
    });

    adjustMessage.value = `조정 완료 · 남은 포인트 ${formatPointValue(
      result?.balance
    )}`;
    adjustForm.value = { points: null, reason: "" };
    await Promise.all([loadCustomer(), loadLedger()]);
  } catch (error) {
    console.error("포인트 조정 실패:", error);
    adjustMessage.value = error?.message || "포인트를 조정하지 못했어요.";
  } finally {
    isAdjusting.value = false;
  }
}

onMounted(() => {
  // 고객 관리 화면에서 ?phone= 으로 넘어오면 그 고객을 바로 조회합니다.
  const phoneQuery = String(route.query.phone || "");

  if (phoneQuery) {
    phoneInput.value = formatPhoneInput(phoneQuery);
    activePhone.value = normalizePhoneNumber(phoneQuery);
  }

  loadLedger();

  if (activePhone.value) {
    loadCustomer();
  }
});
</script>

<style scoped lang="scss">
.admin-point-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  min-height: 100%;
  color: #ffffff;
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
  color: #ffffff;
}
.description {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.66);
}
.filter-card,
.customer-card,
.ledger-section {
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
}
.filter-grid,
.adjust-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.filter-group label {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.72);
}
.filter-group input {
  height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}
.filter-group ::placeholder {
  color: rgba(255, 255, 255, 0.4);
}
.filter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.preset-button {
  height: 38px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.16);
  color: #c7d2fe;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.preset-button:disabled {
  opacity: 0.6;
  cursor: default;
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
}
.summary-label {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.66);
}
.summary-card strong {
  font-size: 20px;
  font-weight: 800;
  color: #ffffff;
}
.customer-head,
.ledger-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.customer-head h2,
.ledger-head h2 {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 800;
  color: #ffffff;
}
.customer-memo {
  margin: 12px 0 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}
.customer-summary-grid {
  margin-top: 12px;
}
.adjust-form {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px dashed rgba(255, 255, 255, 0.16);
}
.adjust-form h3 {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 800;
  color: #ffffff;
}
.adjust-message {
  margin: 10px 0 0;
  font-size: 13px;
  font-weight: 700;
  color: #c7d2fe;
}
.history-block {
  margin-top: 18px;
}
.history-block h3 {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 800;
  color: #ffffff;
}
.table-wrap {
  overflow-x: auto;
}
.payment-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.payment-table th,
.payment-table td {
  padding: 10px 12px;
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.payment-table th {
  font-size: 12px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.05);
}
.phone-text {
  margin-left: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.48);
}
.point-plus {
  color: #6ee7b7;
  font-weight: 800;
}
.point-minus {
  color: #fca5a5;
  font-weight: 800;
}
.ledger-error {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(248, 113, 113, 0.14);
  color: #fca5a5;
  font-size: 13px;
  font-weight: 700;
}
.empty-box {
  padding: 28px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  text-align: center;
  color: rgba(255, 255, 255, 0.66);
  font-size: 14px;
}
</style>
