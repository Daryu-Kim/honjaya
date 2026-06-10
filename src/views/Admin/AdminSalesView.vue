<template>
  <div class="admin-sales-view">
    <header class="sales-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN SALES</p>
        <h1>매출 통계</h1>
        <p class="description">
          기간별 매출, 결제수단, 상품별 판매 현황을 확인할 수 있어요.
        </p>
      </div>
    </header>

    <section class="filter-section">
      <div class="filter-card">
        <div class="filter-row">
          <div class="filter-group">
            <label for="startDate">시작일</label>
            <input id="startDate" v-model="startDate" type="date" />
          </div>

          <div class="filter-group">
            <label for="endDate">종료일</label>
            <input id="endDate" v-model="endDate" type="date" />
          </div>

          <div class="filter-actions">
            <button type="button" class="preset-button" @click="setToday">
              오늘
            </button>
            <button type="button" class="preset-button" @click="setLast7Days">
              최근 7일
            </button>
            <button type="button" class="preset-button" @click="setThisMonth">
              이번달
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">결제 완료 주문서</span>
        <strong>{{ filteredPaidSheets.length }}건</strong>
      </article>

      <article class="summary-card">
        <span class="summary-label">총 매출</span>
        <strong>{{ formatPrice(totalSalesAmount) }}원</strong>
      </article>

      <article class="summary-card">
        <span class="summary-label">현금</span>
        <strong>{{ formatPrice(paymentMethodSummary.CASH) }}원</strong>
      </article>

      <article class="summary-card">
        <span class="summary-label">카드</span>
        <strong>{{ formatPrice(paymentMethodSummary.CARD) }}원</strong>
      </article>

      <article class="summary-card">
        <span class="summary-label">계좌이체</span>
        <strong>{{ formatPrice(paymentMethodSummary.BANK) }}원</strong>
      </article>

      <article class="summary-card">
        <span class="summary-label">판매 상품 수량</span>
        <strong>{{ totalSoldQuantity }}개</strong>
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
          <p>선택한 기간에 집계할 태그가 없어요.</p>
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

    <section class="sales-grid">
      <div class="left-column">
        <section class="panel-card">
          <div class="panel-head">
            <h2>일별 매출</h2>
            <p>선택한 기간의 날짜별 매출입니다.</p>
          </div>

          <div v-if="isLoadingSheets" class="empty-box">
            <p>매출 정보를 불러오는 중이에요.</p>
          </div>

          <div v-else-if="dailySalesList.length === 0" class="empty-box">
            <p>선택한 기간에 매출이 없어요.</p>
          </div>

          <div v-else class="list-table">
            <div class="list-head three">
              <span>날짜</span>
              <span>건수</span>
              <span>매출</span>
            </div>

            <div
              v-for="item in dailySalesList"
              :key="item.date"
              class="list-row three"
            >
              <span>{{ item.date }}</span>
              <span>{{ item.count }}건</span>
              <strong>{{ formatPrice(item.amount) }}원</strong>
            </div>
          </div>
        </section>

        <section class="panel-card">
          <div class="panel-head">
            <h2>요일별 매출</h2>
            <p>선택한 기간의 결제 완료 주문서를 요일별로 합산했어요.</p>
          </div>

          <div class="list-table">
            <div class="list-head three">
              <span>요일</span>
              <span>건수</span>
              <span>매출</span>
            </div>

            <div
              v-for="item in weekdaySalesList"
              :key="item.dayIndex"
              class="list-row three"
            >
              <span>{{ item.label }}</span>
              <span>{{ item.count }}건</span>
              <strong>{{ formatPrice(item.amount) }}원</strong>
            </div>
          </div>
        </section>

        <section class="panel-card">
          <div class="panel-head">
            <h2>상품별 매출</h2>
            <p>판매량과 매출 기준으로 집계했어요.</p>
          </div>

          <div v-if="isLoadingOrders" class="empty-box">
            <p>상품 통계를 불러오는 중이에요.</p>
          </div>

          <div v-else-if="productSalesList.length === 0" class="empty-box">
            <p>선택한 기간의 상품 판매 데이터가 없어요.</p>
          </div>

          <div v-else class="list-table">
            <div class="list-head four">
              <span>상품명</span>
              <span>수량</span>
              <span>주문건수</span>
              <span>매출</span>
            </div>

            <div
              v-for="item in productSalesList.slice(0, 20)"
              :key="item.productId"
              class="list-row four"
            >
              <span class="ellipsis">{{ item.productName }}</span>
              <span>{{ item.quantity }}개</span>
              <span>{{ item.orderCount }}건</span>
              <strong>{{ formatPrice(item.amount) }}원</strong>
            </div>
          </div>
        </section>
      </div>

      <div class="right-column">
        <section class="panel-card">
          <div class="panel-head">
            <h2>결제수단별 매출</h2>
            <p>결제 완료된 주문서를 기준으로 집계했어요.</p>
          </div>

          <div class="method-list">
            <div class="method-row">
              <span>카드</span>
              <strong>{{ formatPrice(paymentMethodSummary.CARD) }}원</strong>
            </div>
            <div class="method-row">
              <span>계좌이체</span>
              <strong>{{ formatPrice(paymentMethodSummary.BANK) }}원</strong>
            </div>
            <div class="method-row">
              <span>현금</span>
              <strong>{{ formatPrice(paymentMethodSummary.CASH) }}원</strong>
            </div>
            <div class="method-row total">
              <span>합계</span>
              <strong>{{ formatPrice(totalSalesAmount) }}원</strong>
            </div>
          </div>
        </section>

        <section class="panel-card">
          <div class="panel-head">
            <h2>최근 결제 완료</h2>
            <p>가장 최근에 결제 완료된 주문서입니다.</p>
          </div>

          <div v-if="isLoadingSheets" class="empty-box">
            <p>결제 완료 데이터를 불러오는 중이에요.</p>
          </div>

          <div v-else-if="recentPaidSheets.length === 0" class="empty-box">
            <p>최근 결제 완료 내역이 없어요.</p>
          </div>

          <div v-else class="card-list">
            <article
              v-for="sheet in recentPaidSheets"
              :key="sheet.id"
              class="mini-card"
            >
              <div class="mini-card-head">
                <div>
                  <strong>{{
                    sheet.displayName || `No.${sheet.tableNumber}`
                  }}</strong>
                  <p>{{ sheet.orderSheetId }}</p>
                </div>
                <span class="status-badge">
                  {{ convertPaymentMethodText(sheet.paymentMethod) }}
                </span>
              </div>

              <div class="mini-card-foot">
                <span>{{
                  formatDateTime(sheet.paidAt || sheet.updatedAt)
                }}</span>
                <strong
                  >{{
                    formatPrice(getRecognizedSheetSalesAmount(sheet))
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
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

const isLoadingSheets = ref(true);
const isLoadingOrders = ref(true);

const orderSheetList = ref([]);
const orderList = ref([]);

let unsubscribeSheets = null;
let unsubscribeOrders = null;

const startDate = ref("");
const endDate = ref("");

function formatInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setToday() {
  const now = new Date();
  const value = formatInputDate(now);
  startDate.value = value;
  endDate.value = value;
}

function setLast7Days() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 6);

  startDate.value = formatInputDate(start);
  endDate.value = formatInputDate(now);
}

function setThisMonth() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);

  startDate.value = formatInputDate(start);
  endDate.value = formatInputDate(now);
}

function convertToDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getStartDateTime() {
  if (!startDate.value) return null;
  return new Date(`${startDate.value}T00:00:00`);
}

function getEndDateTime() {
  if (!endDate.value) return null;
  return new Date(`${endDate.value}T23:59:59.999`);
}

function isInSelectedDateRange(value) {
  const date = convertToDate(value);
  if (!date) return false;

  const start = getStartDateTime();
  const end = getEndDateTime();

  if (start && date < start) return false;
  if (end && date > end) return false;

  return true;
}

const servedOrderSheetIdSet = computed(() => {
  return new Set(
    orderList.value
      .filter((item) => item.status === "SERVED")
      .map((item) => String(item.orderSheetId || ""))
  );
});

const filteredPaidSheets = computed(() => {
  return orderSheetList.value.filter((item) => {
    if (item.paymentStatus !== "COMPLETED") return false;
    if (
      !servedOrderSheetIdSet.value.has(
        String(item.orderSheetId || item.id || "")
      )
    )
      return false;
    return isInSelectedDateRange(item.paidAt || item.updatedAt);
  });
});

const totalSalesAmount = computed(() => {
  return filteredPaidSheets.value.reduce(
    (acc, item) => acc + getRecognizedSheetSalesAmount(item),
    0
  );
});

const paymentMethodSummary = computed(() => {
  const result = {
    CARD: 0,
    BANK: 0,
    CASH: 0,
  };

  filteredPaidSheets.value.forEach((item) => {
    const recognizedAmount = getRecognizedSheetSalesAmount(item);

    if (Array.isArray(item.paymentSplits) && item.paymentSplits.length > 0) {
      getRecognizedPaymentSplits(item, recognizedAmount).forEach((split) => {
        const method = String(split.method || "");
        if (method === "CARD") result.CARD += Number(split.amount || 0);
        if (method === "BANK") result.BANK += Number(split.amount || 0);
        if (method === "CASH") result.CASH += Number(split.amount || 0);
      });
      return;
    }

    const method = String(item.paymentMethod || "");
    if (method === "CARD") result.CARD += recognizedAmount;
    if (method === "BANK") result.BANK += recognizedAmount;
    if (method === "CASH") result.CASH += recognizedAmount;
  });

  return result;
});

const filteredOrders = computed(() => {
  const paidOrderSheetIdSet = new Set(
    filteredPaidSheets.value.map((item) =>
      String(item.orderSheetId || item.id || "")
    )
  );

  return orderList.value.filter((item) => {
    if (!paidOrderSheetIdSet.has(String(item.orderSheetId || ""))) return false;
    return item.status === "SERVED";
  });
});

const totalSoldQuantity = computed(() => {
  return filteredOrders.value.reduce((acc, order) => {
    return (
      acc +
      (Array.isArray(order.items)
        ? order.items.reduce(
            (itemAcc, item) => itemAcc + Number(item.quantity || 0),
            0
          )
        : 0)
    );
  }, 0);
});

const dailySalesList = computed(() => {
  const map = new Map();

  filteredPaidSheets.value.forEach((item) => {
    const date = convertToDate(item.paidAt || item.updatedAt);
    if (!date) return;

    const key = formatDisplayDate(date);
    const current = map.get(key) || { date: key, count: 0, amount: 0 };
    current.count += 1;
    current.amount += getRecognizedSheetSalesAmount(item);
    map.set(key, current);
  });

  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
});

const weekdaySalesList = computed(() => {
  const weekdays = [
    { dayIndex: 1, label: "월요일", count: 0, amount: 0 },
    { dayIndex: 2, label: "화요일", count: 0, amount: 0 },
    { dayIndex: 3, label: "수요일", count: 0, amount: 0 },
    { dayIndex: 4, label: "목요일", count: 0, amount: 0 },
    { dayIndex: 5, label: "금요일", count: 0, amount: 0 },
    { dayIndex: 6, label: "토요일", count: 0, amount: 0 },
    { dayIndex: 0, label: "일요일", count: 0, amount: 0 },
  ];

  filteredPaidSheets.value.forEach((item) => {
    const date = convertToDate(item.paidAt || item.updatedAt);
    if (!date) return;

    const found = weekdays.find(
      (weekday) => weekday.dayIndex === date.getDay()
    );
    if (!found) return;

    found.count += 1;
    found.amount += getRecognizedSheetSalesAmount(item);
  });

  return weekdays;
});

const productSalesList = computed(() => {
  const map = new Map();

  filteredOrders.value.forEach((order) => {
    (order.items || []).forEach((item) => {
      const productId = String(item.productId || item.productName || "");
      const current = map.get(productId) || {
        productId,
        productName: item.productName || "이름 없음",
        quantity: 0,
        orderCount: 0,
        amount: 0,
      };

      current.quantity += Number(item.quantity || 0);
      current.orderCount += 1;
      current.amount += Number(item.totalPrice || 0);

      map.set(productId, current);
    });
  });

  return [...map.values()].sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return b.quantity - a.quantity;
  });
});

const recentPaidSheets = computed(() => {
  return [...filteredPaidSheets.value]
    .sort((a, b) => {
      const aDate = convertToDate(a.paidAt || a.updatedAt)?.getTime() || 0;
      const bDate = convertToDate(b.paidAt || b.updatedAt)?.getTime() || 0;
      return bDate - aDate;
    })
    .slice(0, 8);
});

const tagRatioColors = ["#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa"];

const tagRatioGroups = [
  {
    key: "visit-repeat",
    title: "방문 반복 비율",
    description: "첫방문, 재방문, 확인 필요 기준 비율입니다.",
    tags: ["첫방문", "재방문"],
    fallbackLabel: "확인 필요",
  },
  {
    key: "visit-source",
    title: "방문 유입 비율",
    description: "체험단, 워크인, 지인 태그 기준 비율입니다.",
    tags: ["릴스체험단", "클립체험단", "블로그체험단", "워크인", "지인"],
  },
  {
    key: "gender",
    title: "성별 구성 비율",
    description: "남자, 여자, 혼성 태그 기준 비율입니다.",
    tags: ["남자", "여자", "혼성"],
  },
  {
    key: "age",
    title: "연령대 비율",
    description: "20대부터 50대 이상까지의 태그 기준 비율입니다.",
    tags: ["20대", "30대", "40대", "50대 이상"],
  },
];

const tagRatioCharts = computed(() => {
  return tagRatioGroups.map((group) => {
    const items = buildTagRatioItems(
      filteredPaidSheets.value,
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

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];

  return [
    ...new Set(
      tags
        .map((tag) => String(tag || "").trim())
        .filter((tag) => tag.length > 0)
    ),
  ];
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

function getOrderSheetKey(sheet) {
  return String(sheet?.orderSheetId || sheet?.id || "");
}

function calculateOrderAmount(order) {
  if (Array.isArray(order?.items)) {
    return order.items.reduce((acc, item) => {
      return acc + Number(item.totalPrice || 0);
    }, 0);
  }

  return Number(order?.totalPrice || 0);
}

function getServedOrderGrossAmount(orderSheetId) {
  const safeOrderSheetId = String(orderSheetId || "");

  return orderList.value.reduce((acc, order) => {
    if (String(order.orderSheetId || "") !== safeOrderSheetId) return acc;
    if (order.status !== "SERVED") return acc;
    return acc + calculateOrderAmount(order);
  }, 0);
}

function getRecognizedSheetSalesAmount(sheet) {
  const paidAmount = Number(sheet?.totalAmount || 0);
  const servedGrossAmount = getServedOrderGrossAmount(getOrderSheetKey(sheet));

  if (servedGrossAmount <= 0) return 0;
  return Math.min(paidAmount, servedGrossAmount);
}

function getRecognizedPaymentSplits(sheet, recognizedAmount) {
  const splits = Array.isArray(sheet.paymentSplits) ? sheet.paymentSplits : [];
  const splitTotal = splits.reduce(
    (acc, split) => acc + Number(split.amount || 0),
    0
  );

  if (splitTotal <= 0 || recognizedAmount <= 0) return [];
  if (splitTotal === recognizedAmount) return splits;

  const ratio = recognizedAmount / splitTotal;
  let allocatedAmount = 0;

  return splits.map((split, index) => {
    const isLast = index === splits.length - 1;
    const amount = isLast
      ? Math.max(0, recognizedAmount - allocatedAmount)
      : Math.floor(Number(split.amount || 0) * ratio);

    allocatedAmount += amount;

    return {
      ...split,
      amount,
    };
  });
}

function formatDisplayDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function formatDateTime(value) {
  const date = convertToDate(value);
  if (!date) return "";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${month}.${day} ${hours}:${minutes}`;
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

function subscribeOrderSheets() {
  const q = query(collection(db, "orderSheets"), orderBy("updatedAt", "desc"));

  unsubscribeSheets = onSnapshot(
    q,
    (snapshot) => {
      orderSheetList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      isLoadingSheets.value = false;
    },
    () => {
      isLoadingSheets.value = false;
    }
  );
}

function subscribeOrders() {
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));

  unsubscribeOrders = onSnapshot(
    q,
    (snapshot) => {
      orderList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      isLoadingOrders.value = false;
    },
    () => {
      isLoadingOrders.value = false;
    }
  );
}

onMounted(() => {
  setLast7Days();
  subscribeOrderSheets();
  subscribeOrders();
});

onUnmounted(() => {
  if (unsubscribeSheets) unsubscribeSheets();
  if (unsubscribeOrders) unsubscribeOrders();
});
</script>

<style scoped lang="scss">
.admin-sales-view {
  min-height: 100%;
  padding: 24px;
  color: #fff;
}

.sales-header {
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

.filter-section {
  margin-bottom: 20px;
}

.filter-card,
.summary-card,
.panel-card,
.mini-card,
.empty-box {
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.08);
}

.filter-card {
  padding: 16px;
}

.filter-row {
  display: flex;
  align-items: end;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-group {
  label {
    display: block;
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.72);
  }

  input {
    height: 44px;
    padding: 0 14px;
    border: none;
    outline: none;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 14px;
  }
}

.filter-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.preset-button {
  height: 44px;
  padding: 0 14px;
  border: none;
  border-radius: 14px;
  background: #ffffff;
  color: #111827;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 20px;
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
    font-size: 24px;
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

.sales-grid {
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

.empty-box {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;

  p {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.72);
  }
}

.list-table {
  display: grid;
  gap: 8px;
}

.list-head,
.list-row {
  display: grid;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 16px;
}

.list-head {
  background: rgba(255, 255, 255, 0.06);
  font-size: 12px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.6);
}

.list-row {
  background: rgba(255, 255, 255, 0.04);
  font-size: 13px;

  strong {
    font-size: 14px;
    font-weight: 800;
  }
}

.list-head.three,
.list-row.three {
  grid-template-columns: 1.2fr 0.8fr 1fr;
}

.list-head.four,
.list-row.four {
  grid-template-columns: 1.4fr 0.7fr 0.8fr 1fr;
}

.method-list {
  display: grid;
  gap: 10px;
}

.method-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);

  span {
    font-size: 14px;
  }

  strong {
    font-size: 16px;
    font-weight: 800;
  }

  &.total {
    background: rgba(255, 255, 255, 0.12);
  }
}

.card-list {
  display: grid;
  gap: 12px;
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
}

@media (max-width: 1400px) {
  .summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ratio-grid {
    grid-template-columns: 1fr;
  }

  .sales-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .list-head.four,
  .list-row.four {
    grid-template-columns: 1.2fr 0.7fr 0.8fr 1fr;
  }

  .ratio-body {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .ratio-list {
    width: 100%;
  }
}
</style>
