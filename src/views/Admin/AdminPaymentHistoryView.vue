<template>
  <div class="admin-payment-history-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN PAYMENT HISTORY</p>
        <h1>결제 내역</h1>
        <p class="description">
          결제 완료된 주문서를 조회하고 조건별로 검색할 수 있어요.
        </p>
      </div>
    </header>

    <section class="filter-section">
      <div class="filter-card">
        <div class="filter-grid">
          <div class="filter-group wide">
            <label for="paymentKeyword">검색</label>
            <input
              id="paymentKeyword"
              v-model.trim="keyword"
              type="text"
              placeholder="주문서 번호, 테이블, 표시명 검색"
            />
          </div>

          <div class="filter-group">
            <label for="paymentStartDate">시작일</label>
            <input id="paymentStartDate" v-model="startDate" type="date" />
          </div>

          <div class="filter-group">
            <label for="paymentEndDate">종료일</label>
            <input id="paymentEndDate" v-model="endDate" type="date" />
          </div>

          <div class="filter-group">
            <label for="paymentMinAmount">최소 금액</label>
            <input
              id="paymentMinAmount"
              v-model.number="minAmount"
              type="number"
              min="0"
              placeholder="0"
            />
          </div>

          <div class="filter-group">
            <label for="paymentMaxAmount">최대 금액</label>
            <input
              id="paymentMaxAmount"
              v-model.number="maxAmount"
              type="number"
              min="0"
              placeholder="제한 없음"
            />
          </div>

          <div class="filter-group">
            <label for="paymentTag">태그</label>
            <select id="paymentTag" v-model="selectedTag">
              <option value="ALL">전체</option>
              <option v-for="tag in availableTags" :key="tag" :value="tag">
                {{ tag }}
              </option>
            </select>
          </div>

          <div class="filter-group">
            <label for="paymentWeekday">요일</label>
            <select id="paymentWeekday" v-model="selectedWeekday">
              <option value="ALL">전체</option>
              <option
                v-for="weekday in weekdayOptions"
                :key="weekday.value"
                :value="weekday.value"
              >
                {{ weekday.label }}
              </option>
            </select>
          </div>

          <div class="filter-group">
            <label for="paymentMethod">결제수단</label>
            <select id="paymentMethod" v-model="selectedPaymentMethod">
              <option value="ALL">전체</option>
              <option value="CARD">카드</option>
              <option value="BANK">계좌이체</option>
              <option value="CASH">현금</option>
              <option value="MIXED">부분 결제</option>
              <option value="DISCOUNT">할인 처리</option>
            </select>
          </div>
        </div>

        <div class="filter-actions">
          <button type="button" class="preset-button" @click="setToday">
            오늘
          </button>
          <button type="button" class="preset-button" @click="setThisWeek">
            이번주
          </button>
          <button type="button" class="preset-button" @click="setThisMonth">
            이번달
          </button>
          <button type="button" class="reset-button" @click="resetFilters">
            필터 초기화
          </button>
        </div>
      </div>
    </section>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">검색 결과</span>
        <strong>{{ filteredPaymentSheets.length }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">검색 결과 매출</span>
        <strong>{{ formatPrice(filteredTotalAmount) }}원</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">현재 페이지</span>
        <strong>{{ currentPage }} / {{ totalPages }}</strong>
      </article>
    </section>

    <section class="table-section">
      <div v-if="isLoadingSheets" class="empty-box">
        <p>결제 내역을 불러오는 중이에요.</p>
      </div>

      <div v-else-if="paginatedPaymentSheets.length === 0" class="empty-box">
        <p>조건에 맞는 결제 내역이 없어요.</p>
      </div>

      <div v-else class="table-wrap">
        <table class="payment-table">
          <thead>
            <tr>
              <th>결제일시</th>
              <th>주문서</th>
              <th>테이블</th>
              <th>태그</th>
              <th>결제수단</th>
              <th>결제금액</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="sheet in paginatedPaymentSheets"
              :key="sheet.id"
              class="clickable-row"
              @click="openPaymentSheetDetail(sheet)"
            >
              <td>{{ formatDateTime(sheet.paidAt || sheet.updatedAt) }}</td>
              <td>{{ sheet.orderSheetId || sheet.id }}</td>
              <td>{{ sheet.displayName || `No.${sheet.tableNumber}` }}</td>
              <td>
                <div
                  v-if="normalizeTags(sheet.internalTags).length > 0"
                  class="tag-list"
                >
                  <span
                    v-for="tag in normalizeTags(sheet.internalTags)"
                    :key="`${sheet.id}-${tag}`"
                    class="tag-chip"
                  >
                    {{ tag }}
                  </span>
                </div>
                <span v-else class="muted-text">-</span>
              </td>
              <td>{{ convertPaymentMethodText(sheet.paymentMethod) }}</td>
              <td>
                <strong>{{ formatPrice(sheet.totalAmount || 0) }}원</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <nav v-if="totalPages > 1" class="pagination" aria-label="결제 내역 페이지">
      <button
        type="button"
        :disabled="currentPage === 1"
        @click="currentPage -= 1"
      >
        이전
      </button>
      <button
        v-for="page in visiblePages"
        :key="page"
        type="button"
        :class="{ active: currentPage === page }"
        @click="currentPage = page"
      >
        {{ page }}
      </button>
      <button
        type="button"
        :disabled="currentPage === totalPages"
        @click="currentPage += 1"
      >
        다음
      </button>
    </nav>

    <transition name="fade">
      <div
        v-if="selectedPaymentSheet"
        class="modal-overlay"
        @click.self="closePaymentSheetDetail"
      >
        <div class="modal-card payment-detail-modal">
          <div class="modal-head">
            <div>
              <p class="eyebrow">ORDER DETAIL</p>
              <h2>
                {{
                  selectedPaymentSheet.displayName ||
                  `No.${selectedPaymentSheet.tableNumber}`
                }}
              </h2>
              <p class="modal-subtitle">
                {{
                  selectedPaymentSheet.orderSheetId || selectedPaymentSheet.id
                }}
              </p>
            </div>
            <button
              type="button"
              class="close-button"
              @click="closePaymentSheetDetail"
            >
              X
            </button>
          </div>

          <div class="detail-summary-grid">
            <div class="detail-summary-card">
              <span>Paid At</span>
              <strong>{{
                formatDateTime(
                  selectedPaymentSheet.paidAt || selectedPaymentSheet.updatedAt
                )
              }}</strong>
            </div>
            <div class="detail-summary-card">
              <span>Payment</span>
              <strong>{{
                convertPaymentMethodText(selectedPaymentSheet.paymentMethod)
              }}</strong>
            </div>
            <div class="detail-summary-card">
              <span>Total</span>
              <strong
                >{{
                  formatPrice(selectedPaymentSheet.totalAmount || 0)
                }}원</strong
              >
            </div>
          </div>

          <section class="detail-section">
            <h3>Orders</h3>

            <div
              v-if="selectedPaymentSheetOrders.length === 0"
              class="detail-empty"
            >
              No order items found.
            </div>

            <div v-else class="detail-order-list">
              <article
                v-for="order in selectedPaymentSheetOrders"
                :key="order.id"
                class="detail-order-card"
              >
                <div class="detail-order-head">
                  <div>
                    <strong>{{ formatDateTime(order.createdAt) }}</strong>
                    <p v-if="order.requestMessage">
                      {{ order.requestMessage }}
                    </p>
                  </div>
                  <span>{{ formatPrice(order.totalPrice || 0) }}원</span>
                </div>

                <div class="detail-item-list">
                  <div
                    v-for="(item, itemIndex) in order.items || []"
                    :key="`${order.id}-${itemIndex}`"
                    class="detail-item-row"
                  >
                    <div class="detail-item-main">
                      <strong>{{ item.productName }}</strong>
                      <p>
                        {{ formatPrice(item.unitPrice || 0) }}원 x
                        {{ item.quantity || 0 }}
                      </p>

                      <div
                        v-if="
                          item.selectedOptions &&
                          item.selectedOptions.length > 0
                        "
                        class="detail-option-list"
                      >
                        <span
                          v-for="(option, optionIndex) in item.selectedOptions"
                          :key="`${order.id}-${itemIndex}-${optionIndex}`"
                        >
                          {{ option.groupName ? `${option.groupName}: ` : ""
                          }}{{ option.optionName }}
                        </span>
                      </div>
                    </div>

                    <strong class="detail-item-total">
                      {{ formatPrice(item.totalPrice || 0) }}원
                    </strong>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { fetchList, subscribeTable, toTime } from "@/lib/supabase";
import {
  formatInputDate,
  getBusinessDate,
  getCurrentBusinessDateInput,
  parseBusinessDateEnd,
  parseBusinessDateStart,
} from "@/lib/businessDay";
import { normalizeOrderSheetTags } from "@/lib/orderSheetTags";

const PAGE_SIZE = 20;

const isLoadingSheets = ref(true);
const orderSheetList = ref([]);
const orderList = ref([]);
const selectedPaymentSheet = ref(null);
const keyword = ref("");
const startDate = ref("");
const endDate = ref("");
const minAmount = ref("");
const maxAmount = ref("");
const selectedTag = ref("ALL");
const selectedWeekday = ref("ALL");
const selectedPaymentMethod = ref("ALL");
const currentPage = ref(1);

let unsubscribeSheets = null;
let unsubscribeOrders = null;

const weekdayOptions = [
  { value: "1", label: "월요일" },
  { value: "2", label: "화요일" },
  { value: "3", label: "수요일" },
  { value: "4", label: "목요일" },
  { value: "5", label: "금요일" },
  { value: "6", label: "토요일" },
  { value: "0", label: "일요일" },
];

function normalizeTags(tags) {
  return normalizeOrderSheetTags(tags);
}

function convertToDate(value) {
  if (!value) return null;
  const parsed = new Date(toTime(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getSheetPaidDate(sheet) {
  return convertToDate(sheet.paidAt || sheet.updatedAt);
}

function isInDateRange(sheet) {
  const date = getSheetPaidDate(sheet);
  if (!date) return false;

  const rangeStart = parseBusinessDateStart(startDate.value);
  const rangeEnd = parseBusinessDateEnd(endDate.value);

  if (rangeStart && date < rangeStart) {
    return false;
  }
  if (rangeEnd && date > rangeEnd) {
    return false;
  }
  return true;
}

const paidSheets = computed(() => {
  return orderSheetList.value.filter((sheet) => {
    return sheet.paymentStatus === "COMPLETED";
  });
});

const availableTags = computed(() => {
  return [
    ...new Set(
      paidSheets.value.flatMap((sheet) => normalizeTags(sheet.internalTags))
    ),
  ].sort((a, b) => a.localeCompare(b, "ko"));
});

const filteredPaymentSheets = computed(() => {
  const safeKeyword = keyword.value.toLowerCase();

  return paidSheets.value
    .filter((sheet) => {
      const amount = Number(sheet.totalAmount || 0);
      const date = getSheetPaidDate(sheet);
      const tags = normalizeTags(sheet.internalTags);
      const searchTarget = [
        sheet.orderSheetId,
        sheet.id,
        sheet.tableNumber,
        sheet.displayName,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");

      if (safeKeyword && !searchTarget.includes(safeKeyword)) return false;
      if (!isInDateRange(sheet)) return false;
      if (minAmount.value !== "" && amount < Number(minAmount.value))
        return false;
      if (maxAmount.value !== "" && amount > Number(maxAmount.value))
        return false;
      if (selectedTag.value !== "ALL" && !tags.includes(selectedTag.value)) {
        return false;
      }
      if (
        selectedWeekday.value !== "ALL" &&
        String(getBusinessDate(date)?.getDay()) !== selectedWeekday.value
      ) {
        return false;
      }
      if (
        selectedPaymentMethod.value !== "ALL" &&
        !matchesPaymentMethod(sheet, selectedPaymentMethod.value)
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      return (
        (getSheetPaidDate(b)?.getTime() || 0) -
        (getSheetPaidDate(a)?.getTime() || 0)
      );
    });
});

const filteredTotalAmount = computed(() => {
  return filteredPaymentSheets.value.reduce(
    (acc, sheet) => acc + Number(sheet.totalAmount || 0),
    0
  );
});

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredPaymentSheets.value.length / PAGE_SIZE));
});

const paginatedPaymentSheets = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return filteredPaymentSheets.value.slice(start, start + PAGE_SIZE);
});

const selectedPaymentSheetOrders = computed(() => {
  const orderSheetId = String(
    selectedPaymentSheet.value?.orderSheetId ||
      selectedPaymentSheet.value?.id ||
      ""
  );

  if (!orderSheetId) return [];

  return orderList.value
    .filter((order) => String(order.orderSheetId || "") === orderSheetId)
    .sort((a, b) => {
      return (
        (convertToDate(a.createdAt)?.getTime() || 0) -
        (convertToDate(b.createdAt)?.getTime() || 0)
      );
    });
});

const visiblePages = computed(() => {
  const first = Math.max(1, currentPage.value - 2);
  const last = Math.min(totalPages.value, first + 4);
  const adjustedFirst = Math.max(1, last - 4);
  return Array.from(
    { length: last - adjustedFirst + 1 },
    (_, index) => adjustedFirst + index
  );
});

function setToday() {
  const value = getCurrentBusinessDateInput();
  startDate.value = value;
  endDate.value = value;
}

function setThisWeek() {
  const end = getBusinessDate();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const day = start.getDay();
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  startDate.value = formatInputDate(start);
  endDate.value = formatInputDate(end);
}

function setThisMonth() {
  const end = getBusinessDate();
  startDate.value = formatInputDate(
    new Date(end.getFullYear(), end.getMonth(), 1)
  );
  endDate.value = formatInputDate(end);
}

function resetFilters() {
  keyword.value = "";
  startDate.value = "";
  endDate.value = "";
  minAmount.value = "";
  maxAmount.value = "";
  selectedTag.value = "ALL";
  selectedWeekday.value = "ALL";
  selectedPaymentMethod.value = "ALL";
}

function openPaymentSheetDetail(sheet) {
  selectedPaymentSheet.value = sheet;
}

function closePaymentSheetDetail() {
  selectedPaymentSheet.value = null;
}

function formatDateTime(value) {
  const date = convertToDate(value);
  if (!date) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}.${month}.${day} ${hours}:${minutes}`;
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function convertPaymentMethodText(method) {
  if (method === "CARD") return "카드";
  if (method === "BANK") return "계좌이체";
  if (method === "CASH") return "현금";
  if (method === "MIXED") return "부분 결제";
  if (method === "DISCOUNT") return "할인 처리";
  return method || "-";
}

function matchesPaymentMethod(sheet, method) {
  if (sheet.paymentMethod === method) return true;

  if (Array.isArray(sheet.paymentSplits)) {
    return sheet.paymentSplits.some((split) => split.method === method);
  }

  return false;
}

function subscribeOrderSheets() {
  const loadOrderSheets = async () => {
    try {
      orderSheetList.value = await fetchList("orderSheets", {
        order: ["updatedAt", "desc"],
      });
    } catch (error) {
      console.error("주문서 조회 실패:", error);
    } finally {
      isLoadingSheets.value = false;
    }
  };

  unsubscribeSheets = subscribeTable("orderSheets", loadOrderSheets);
}

function subscribeOrders() {
  const loadOrders = async () => {
    try {
      orderList.value = await fetchList("orders", {
        order: ["createdAt", "desc"],
      });
    } catch (error) {
      console.error("주문 조회 실패:", error);
      orderList.value = [];
    }
  };

  unsubscribeOrders = subscribeTable("orders", loadOrders);
}

watch(
  [
    keyword,
    startDate,
    endDate,
    minAmount,
    maxAmount,
    selectedTag,
    selectedWeekday,
    selectedPaymentMethod,
  ],
  () => {
    currentPage.value = 1;
  }
);

watch(totalPages, () => {
  if (currentPage.value > totalPages.value)
    currentPage.value = totalPages.value;
});

onMounted(() => {
  subscribeOrderSheets();
  subscribeOrders();
});

onUnmounted(() => {
  if (unsubscribeSheets) unsubscribeSheets();
  if (unsubscribeOrders) unsubscribeOrders();
});
</script>

<style scoped lang="scss">
.admin-payment-history-view {
  min-height: 100%;
  padding: 24px;
  color: #fff;
}
.page-header {
  margin-bottom: 20px;
}
.eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.55);
}
h1 {
  margin: 0 0 8px;
  font-size: 34px;
}
.description {
  margin: 0;
  color: rgba(255, 255, 255, 0.72);
}
.filter-section,
.summary-grid {
  margin-bottom: 20px;
}
.filter-card,
.summary-card,
.empty-box,
.table-wrap {
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.08);
}
.filter-card {
  padding: 16px;
}
.filter-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.filter-group.wide {
  grid-column: span 2;
}
.filter-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 700;
}
.filter-group input,
.filter-group select {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  border: none;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.filter-actions,
.pagination,
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.filter-actions {
  margin-top: 14px;
}
.preset-button,
.reset-button,
.pagination button {
  min-height: 42px;
  padding: 0 14px;
  border: none;
  border-radius: 12px;
  background: #fff;
  color: #111827;
  font-weight: 800;
  cursor: pointer;
}
.reset-button {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.summary-card {
  padding: 18px;
}
.summary-label {
  display: block;
  margin-bottom: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}
.summary-card strong {
  font-size: 24px;
}
.empty-box {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.table-wrap {
  overflow-x: auto;
}
.payment-table {
  width: 100%;
  min-width: 880px;
  border-collapse: collapse;
}
.payment-table th,
.payment-table td {
  padding: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  text-align: left;
  font-size: 13px;
}
.payment-table th {
  color: rgba(255, 255, 255, 0.62);
}
.clickable-row {
  cursor: pointer;
}
.clickable-row:hover {
  background: rgba(255, 255, 255, 0.06);
}
.tag-chip {
  display: inline-flex;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(250, 204, 21, 0.14);
  color: #fde68a;
  font-size: 11px;
  font-weight: 800;
}
.muted-text {
  color: rgba(255, 255, 255, 0.42);
}
.pagination {
  justify-content: center;
  margin-top: 18px;
}
.pagination button.active {
  background: #f6c66a;
}
.pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(2, 6, 23, 0.82);
}
.modal-card {
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.98);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.36);
}
.payment-detail-modal {
  max-width: 760px;
  padding: 20px;
}
.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.modal-head h2 {
  margin: 0 0 6px;
  font-size: 26px;
}
.modal-subtitle {
  margin: 0;
  color: rgba(255, 255, 255, 0.62);
}
.close-button {
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  flex-shrink: 0;
}
.detail-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.detail-summary-card,
.detail-order-card,
.detail-empty {
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.07);
}
.detail-summary-card {
  padding: 14px;
}
.detail-summary-card span {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.58);
}
.detail-summary-card strong {
  font-size: 16px;
}
.detail-section h3 {
  margin: 0 0 12px;
  font-size: 18px;
}
.detail-empty {
  padding: 24px;
  text-align: center;
  color: rgba(255, 255, 255, 0.62);
}
.detail-order-list,
.detail-item-list,
.detail-option-list {
  display: grid;
  gap: 10px;
}
.detail-order-card {
  padding: 14px;
}
.detail-order-head,
.detail-item-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
.detail-order-head {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.detail-order-head p,
.detail-item-main p {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
}
.detail-order-head span,
.detail-item-total {
  flex-shrink: 0;
  font-size: 14px;
}
.detail-item-row {
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
}
.detail-item-main {
  min-width: 0;
}
.detail-option-list {
  gap: 6px;
  margin-top: 8px;
}
.detail-option-list span {
  display: inline-flex;
  width: fit-content;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(96, 165, 250, 0.16);
  color: #bfdbfe;
  font-size: 11px;
  font-weight: 800;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
@media (max-width: 900px) {
  .admin-payment-history-view {
    padding: 16px;
  }
  .filter-grid,
  .summary-grid,
  .detail-summary-grid {
    grid-template-columns: 1fr;
  }
  .filter-group.wide {
    grid-column: auto;
  }
  .modal-overlay {
    align-items: flex-end;
    padding: 10px;
  }
  .modal-card {
    max-height: 92vh;
    border-radius: 20px;
  }
  .detail-order-head,
  .detail-item-row {
    flex-direction: column;
  }
}
</style>
