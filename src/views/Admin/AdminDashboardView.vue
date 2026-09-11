<template>
  <div class="admin-dashboard-view">
    <header class="dashboard-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN DASHBOARD</p>
        <h1>운영 대시보드</h1>
        <p class="description">
          오늘 운영 현황과 주요 메뉴를 한눈에 확인할 수 있어요.
        </p>
      </div>

      <div class="header-right">
        <div class="today-chip">{{ currentDateText }}</div>
      </div>
    </header>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">오늘 주문</span>
        <strong>{{ todayOrderCount }}건</strong>
      </article>

      <article class="summary-card">
        <span class="summary-label">오늘 매출</span>
        <strong>{{ formatPrice(todaySalesAmount) }}원</strong>
      </article>

      <article class="summary-card">
        <span class="summary-label">이번주 매출</span>
        <strong>{{ formatPrice(thisWeekSalesAmount) }}원</strong>
      </article>

      <article class="summary-card">
        <span class="summary-label">이번달 매출</span>
        <strong>{{ formatPrice(thisMonthSalesAmount) }}원</strong>
      </article>

      <article class="summary-card">
        <span class="summary-label">결제 요청</span>
        <strong>{{ paymentRequestCount }}건</strong>
      </article>
    </section>

    <section class="ratio-grid">
      <article
        v-for="chart in tagRatioCharts"
        :key="chart.key"
        class="panel-card ratio-card"
      >
        <div class="panel-head">
          <h2>{{ chart.title }}</h2>
          <p>{{ chart.description }}</p>
        </div>

        <div v-if="chart.total === 0" class="empty-box ratio-empty">
          <p>이번 달에 집계할 태그가 없어요.</p>
        </div>

        <div v-else class="ratio-body">
          <div
            class="pie-chart"
            :style="{ background: buildPieGradient(chart.items) }"
          >
            <span>{{ chart.total }}건</span>
          </div>

          <div class="ratio-list">
            <div
              v-for="item in chart.items"
              :key="item.label"
              class="ratio-row"
            >
              <span
                class="ratio-dot"
                :style="{ backgroundColor: item.color }"
              ></span>
              <span class="ratio-label">{{ item.label }}</span>
              <strong>{{ item.percent }}%</strong>
              <em>{{ item.count }}건</em>
            </div>
          </div>
        </div>
      </article>
    </section>

    <section class="dashboard-grid">
      <div class="left-column">
        <section class="panel-card quick-panel">
          <div class="panel-head">
            <h2>빠른 메뉴</h2>
            <p>자주 사용하는 관리 화면으로 바로 이동할 수 있어요.</p>
          </div>

          <div class="quick-grid">
            <button
              type="button"
              class="quick-button"
              @click="goPage('/admin/products')"
            >
              상품 관리
            </button>
            <button
              type="button"
              class="quick-button"
              @click="goPage('/admin/categories')"
            >
              카테고리 관리
            </button>
            <button
              type="button"
              class="quick-button"
              @click="goPage('/admin/sales')"
            >
              매출 통계
            </button>
            <button
              type="button"
              class="quick-button"
              @click="goPage('/admin/payments')"
            >
              결제 내역
            </button>
            <button
              type="button"
              class="quick-button"
              @click="goPage('/tablet')"
            >
              태블릿 운영판
            </button>
          </div>
        </section>

        <section class="panel-card">
          <div class="panel-head">
            <h2>최근 주문</h2>
            <p>가장 최근 주문 5건을 확인할 수 있어요.</p>
          </div>

          <div v-if="isLoadingOrders" class="empty-box">
            <p>주문 정보를 불러오는 중이에요.</p>
          </div>

          <div v-else-if="recentOrders.length === 0" class="empty-box">
            <p>오늘 주문이 없어요.</p>
          </div>

          <div v-else class="card-list">
            <article
              v-for="order in recentOrders"
              :key="order.id"
              class="mini-card"
            >
              <div class="mini-card-head">
                <div>
                  <strong>{{
                    order.displayName || `No.${order.tableNumber}`
                  }}</strong>
                  <p>{{ order.orderSheetId }}</p>
                </div>
                <span class="status-badge">
                  {{ convertOrderStatusText(order.status) }}
                </span>
              </div>

              <div class="mini-card-body">
                <p class="summary-text">
                  {{ buildOrderSummary(order.items || []) }}
                </p>
              </div>

              <div class="mini-card-foot">
                <span>{{ formatDateTime(order.createdAt) }}</span>
                <strong>{{ formatPrice(order.totalPrice || 0) }}원</strong>
              </div>
            </article>
          </div>
        </section>
      </div>

      <div class="right-column">
        <section class="panel-card">
          <div class="panel-head">
            <h2>결제 요청</h2>
            <p>대기 중인 결제 요청을 빠르게 확인해요.</p>
          </div>

          <div v-if="isLoadingPayments" class="empty-box">
            <p>결제 요청을 불러오는 중이에요.</p>
          </div>

          <div v-else-if="paymentRequestList.length === 0" class="empty-box">
            <p>대기 중인 결제 요청이 없어요.</p>
          </div>

          <div v-else class="card-list compact">
            <article
              v-for="request in paymentRequestList.slice(0, 5)"
              :key="request.id"
              class="mini-card"
            >
              <div class="mini-card-head">
                <div>
                  <strong>{{
                    request.displayName || `No.${request.tableNumber}`
                  }}</strong>
                  <p>{{ request.orderSheetId }}</p>
                </div>
                <span class="status-badge">
                  {{ convertPaymentRequestStatusText(request.status) }}
                </span>
              </div>

              <div class="mini-card-foot">
                <span>{{ formatDateTime(request.createdAt) }}</span>
                <strong
                  >{{
                    getOrderSheetTotalAmount(request.orderSheetId)
                  }}원</strong
                >
              </div>
            </article>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { fetchList, subscribeTable, toTime } from "@/lib/supabase";
import {
  getBusinessDate,
  getBusinessDayStart,
  getBusinessMonthStart,
  getBusinessWeekStart,
} from "@/lib/businessDay";
import { normalizeOrderSheetTags } from "@/lib/orderSheetTags";

const router = useRouter();

const isLoadingOrders = ref(true);
const isLoadingPayments = ref(true);
const isLoadingOrderSheets = ref(true);

const orderList = ref([]);
const paymentRequestList = ref([]);
const orderSheetList = ref([]);

let unsubscribeOrders = null;
let unsubscribePayments = null;
let unsubscribeOrderSheets = null;

const currentDateText = computed(() => {
  const now = getBusinessDate();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
});

const todayOrderCount = computed(() => {
  const todayStart = getTodayStart();

  return orderList.value.filter((item) => {
    const date = convertToDate(item.createdAt);
    return date && date >= todayStart;
  }).length;
});

const todaySalesAmount = computed(() => {
  return getPaidSheetSalesAmount(getTodayStart());
});

const thisWeekSalesAmount = computed(() => {
  return getPaidSheetSalesAmount(getThisWeekStart());
});

const thisMonthSalesAmount = computed(() => {
  return getPaidSheetSalesAmount(getThisMonthStart());
});

const paymentRequestCount = computed(() => {
  return paymentRequestList.value.length;
});

const recentOrders = computed(() => {
  return orderList.value.slice(0, 5);
});

const thisMonthPaidSheets = computed(() => {
  const monthStart = getThisMonthStart();

  return orderSheetList.value.filter((sheet) => {
    if (sheet.paymentStatus !== "COMPLETED") return false;

    const paidDate = convertToDate(sheet.paidAt || sheet.updatedAt);
    return paidDate && paidDate >= monthStart;
  });
});

const tagRatioColors = ["#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa"];

const tagRatioGroups = [
  {
    key: "visit-repeat",
    title: "이번 달 방문 반복",
    description: "첫방문, 재방문, 확인 필요 기준 비율입니다.",
    tags: ["첫방문", "재방문"],
    fallbackLabel: "확인 필요",
  },
  {
    key: "visit-source",
    title: "이번 달 방문 유입",
    description: "체험단, 워크인, 지인 태그 기준 비율입니다.",
    tags: ["릴스체험단", "클립체험단", "블로그체험단", "워크인", "지인"],
  },
];

const tagRatioCharts = computed(() => {
  return tagRatioGroups.map((group) => {
    const items = buildTagRatioItems(
      thisMonthPaidSheets.value,
      group.tags,
      group.fallbackLabel
    );
    const total = items.reduce((acc, item) => acc + item.count, 0);

    return {
      ...group,
      items,
      total,
    };
  });
});

function getTodayStart() {
  return getBusinessDayStart();
}

function getThisWeekStart() {
  return getBusinessWeekStart();
}

function getThisMonthStart() {
  return getBusinessMonthStart();
}

function getPaidSheetSalesAmount(startDate) {
  return orderSheetList.value.reduce((acc, sheet) => {
    if (sheet.paymentStatus !== "COMPLETED") return acc;

    const paidDate = convertToDate(sheet.paidAt || sheet.updatedAt);
    if (!paidDate || paidDate < startDate) return acc;

    return acc + Number(sheet.totalAmount || 0);
  }, 0);
}

function convertToDate(value) {
  if (!value) return null;

  const parsed = new Date(toTime(value));

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeTags(tags) {
  return normalizeOrderSheetTags(tags);
}

function buildTagRatioItems(sheets, tags, fallbackLabel = "") {
  const counts = new Map(tags.map((tag) => [tag, 0]));
  const labels = fallbackLabel ? [...tags, fallbackLabel] : tags;
  if (fallbackLabel) counts.set(fallbackLabel, 0);

  sheets.forEach((sheet) => {
    const sheetTags = normalizeTags(sheet.internalTags);
    const hasAnyGroupTag = tags.some((tag) => sheetTags.includes(tag));

    tags.forEach((tag) => {
      if (sheetTags.includes(tag)) {
        counts.set(tag, Number(counts.get(tag) || 0) + 1);
      }
    });

    if (fallbackLabel && !hasAnyGroupTag) {
      counts.set(fallbackLabel, Number(counts.get(fallbackLabel) || 0) + 1);
    }
  });

  const total = [...counts.values()].reduce((acc, count) => acc + count, 0);

  return labels.map((tag, index) => {
    const count = Number(counts.get(tag) || 0);

    return {
      label: tag,
      count,
      percent: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      color: tagRatioColors[index % tagRatioColors.length],
    };
  });
}

function buildPieGradient(items) {
  let cursor = 0;
  const segments = items
    .filter((item) => item.count > 0)
    .map((item) => {
      const start = cursor;
      cursor += item.percent;
      return `${item.color} ${start}% ${cursor}%`;
    });

  return segments.length
    ? `conic-gradient(${segments.join(", ")})`
    : "rgba(255, 255, 255, 0.12)";
}

function formatDateTime(value) {
  const date = convertToDate(value);
  if (!date) return "";

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function convertOrderStatusText(status) {
  if (status === "REQUESTED") return "주문접수";
  if (status === "PREPARING") return "준비중";
  if (status === "SERVED") return "제공완료";
  if (status === "CANCELLED") return "취소";
  return status || "알 수 없음";
}

function convertPaymentRequestStatusText(status) {
  if (status === "REQUESTED") return "요청됨";
  if (status === "CONFIRMED") return "확인됨";
  if (status === "DONE") return "결제완료";
  if (status === "CANCELLED") return "취소";
  return status || "알 수 없음";
}

function buildOrderSummary(items) {
  if (!Array.isArray(items) || items.length === 0) return "주문 항목 없음";

  const preview = items.slice(0, 3).map((item) => {
    return `${item.productName} ${Number(item.quantity || 0)}개`;
  });

  if (items.length > 3) {
    preview.push(`외 ${items.length - 3}개`);
  }

  return preview.join(", ");
}

function getOrderSheetTotalAmount(orderSheetId) {
  const found = orderSheetList.value.find(
    (item) => item.orderSheetId === orderSheetId
  );
  return formatPrice(found?.totalAmount || 0);
}

function goPage(path) {
  router.push(path);
}

function subscribeOrders() {
  const loadOrders = async () => {
    try {
      orderList.value = await fetchList("orders", {
        order: ["createdAt", "desc"],
        limit: 20,
      });
    } catch (error) {
      console.error("주문 조회 실패:", error);
    } finally {
      isLoadingOrders.value = false;
    }
  };

  unsubscribeOrders = subscribeTable("orders", loadOrders);
}

function subscribePayments() {
  const loadPayments = async () => {
    try {
      paymentRequestList.value = await fetchList("checkoutRequests", {
        filters: [["status", "in", ["REQUESTED", "CONFIRMED"]]],
        order: ["createdAt", "desc"],
        limit: 20,
      });
    } catch (error) {
      console.error("결제 요청 조회 실패:", error);
    } finally {
      isLoadingPayments.value = false;
    }
  };

  unsubscribePayments = subscribeTable("checkoutRequests", loadPayments);
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
      isLoadingOrderSheets.value = false;
    }
  };

  unsubscribeOrderSheets = subscribeTable("orderSheets", loadOrderSheets);
}

onMounted(() => {
  subscribeOrders();
  subscribePayments();
  subscribeOrderSheets();
});

onUnmounted(() => {
  if (unsubscribeOrders) unsubscribeOrders();
  if (unsubscribePayments) unsubscribePayments();
  if (unsubscribeOrderSheets) unsubscribeOrderSheets();
});
</script>

<style scoped lang="scss">
.admin-dashboard-view {
  min-height: 100%;
  padding: 24px;
  color: #fff;
}

.dashboard-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.header-left {
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
    font-weight: 800;
  }

  .description {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.72);
  }
}

.today-chip {
  min-width: 140px;
  height: 48px;
  padding: 0 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 800;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.summary-card,
.panel-card,
.mini-card,
.empty-box,
.chat-row {
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.08);
}

.summary-card {
  padding: 18px;

  .summary-label {
    display: block;
    margin-bottom: 10px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
  }

  strong {
    font-size: 26px;
    font-weight: 800;
  }
}

.ratio-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.ratio-card {
  min-height: 280px;
}

.ratio-body {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  align-items: center;
  gap: 18px;
}

.pie-chart {
  width: 150px;
  aspect-ratio: 1;
  border-radius: 50%;
  display: grid;
  place-items: center;
  box-shadow: inset 0 0 0 16px rgba(17, 24, 39, 0.48);

  span {
    width: 82px;
    height: 82px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: rgba(17, 24, 39, 0.92);
    font-size: 15px;
    font-weight: 800;
  }
}

.ratio-list {
  display: grid;
  gap: 10px;
}

.ratio-row {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  font-size: 13px;

  strong {
    font-size: 14px;
    font-weight: 800;
  }

  em {
    min-width: 34px;
    font-style: normal;
    color: rgba(255, 255, 255, 0.52);
    text-align: right;
  }
}

.ratio-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.ratio-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ratio-empty {
  min-height: 170px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.9fr;
  gap: 16px;
}

.left-column,
.right-column {
  display: grid;
  gap: 16px;
  align-content: start;
}

.panel-card {
  padding: 18px;
}

.panel-head {
  margin-bottom: 14px;

  h2 {
    margin: 0 0 6px;
    font-size: 22px;
    font-weight: 800;
  }

  p {
    margin: 0;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.66);
  }
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.quick-button {
  height: 56px;
  border: none;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.empty-box {
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;

  p {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.72);
  }
}

.card-list {
  display: grid;
  gap: 12px;

  &.compact .mini-card {
    padding: 14px;
  }
}

.mini-card {
  padding: 16px;
}

.mini-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;

  strong {
    display: block;
    margin-bottom: 4px;
    font-size: 16px;
    font-weight: 800;
  }

  p {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.58);
  }
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 11px;
  font-weight: 800;
}

.mini-card-body {
  margin-bottom: 10px;
}

.summary-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.8);
}

.mini-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  span {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.52);
  }

  strong {
    font-size: 14px;
    font-weight: 800;
  }
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}

@media (max-width: 1280px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ratio-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .ratio-body {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .ratio-list {
    width: 100%;
  }
}
</style>
