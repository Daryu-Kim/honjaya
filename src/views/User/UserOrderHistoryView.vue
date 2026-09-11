<template>
  <div class="user-order-history-view">
    <div v-if="!isMobile" class="desktop-block">
      <div class="desktop-card">
        <p class="desktop-eyebrow">MOBILE ONLY</p>
        <h1>모바일로 이용해주세요</h1>
        <p>주문 내역 조회는 모바일 환경에서만 사용할 수 있어요.</p>
      </div>
    </div>

    <div v-else class="order-history-container">
      <header class="order-history-header">
        <div class="header-top">
          <button type="button" class="back-button" @click="goBack">←</button>

          <div class="header-title">
            <p class="eyebrow">ORDER HISTORY</p>
            <h1>주문 내역</h1>
          </div>
        </div>

        <div class="session-card">
          <div class="session-row">
            <span>테이블</span>
            <strong>{{ tableText }}</strong>
          </div>
          <div class="session-row">
            <span>표시명</span>
            <strong>{{ displayNameText }}</strong>
          </div>
          <div class="session-row">
            <span>주문서 번호</span>
            <strong>{{ orderSheetIdText }}</strong>
          </div>
        </div>
      </header>

      <section class="order-history-section">
        <div v-if="isLoading" class="empty-box">
          <p>주문 내역을 불러오는 중이에요.</p>
        </div>

        <div v-else-if="orderList.length === 0" class="empty-box">
          <p>주문 내역이 없어요.</p>
        </div>

        <div v-else>
          <div class="total-info-card">
            <div class="total-info-row">
              <span>총 주문 건수</span>
              <strong>{{ orderList.length }}건</strong>
            </div>
            <div class="total-info-row highlight">
              <span>총 주문 금액</span>
              <strong>{{ formatPrice(totalOrderAmount) }}원</strong>
            </div>
          </div>

          <div class="order-list">
            <article
              v-for="order in orderList"
              :key="order.id"
              class="order-card"
            >
              <div class="order-card-head">
                <div class="order-time">
                  <span class="order-time-label">주문 시간</span>
                  <strong>{{ formatDateTime(order.createdAt) }}</strong>
                </div>
                <span class="status-badge" :class="order.status">
                  {{ convertOrderStatusText(order.status) }}
                </span>
              </div>

              <div class="order-items-section">
                <h4>주문 상품</h4>
                <div
                  v-if="order.items && order.items.length > 0"
                  class="order-items-list"
                >
                  <div
                    v-for="(item, itemIndex) in order.items"
                    :key="`${order.id}-${itemIndex}`"
                    class="order-item-row"
                  >
                    <div class="order-item-left">
                      <strong>{{ item.productName }}</strong>
                      <p class="item-quantity">{{ item.quantity }}개</p>
                      <div
                        v-if="
                          item.selectedOptions &&
                          item.selectedOptions.length > 0
                        "
                        class="item-options"
                      >
                        <div
                          v-for="(option, optionIndex) in item.selectedOptions"
                          :key="`${order.id}-${itemIndex}-${optionIndex}`"
                          class="option-tag"
                        >
                          {{ option.optionName }}
                        </div>
                      </div>
                    </div>
                    <div class="order-item-right">
                      <p class="item-price">
                        {{ formatPrice(item.unitPrice || 0) }}원
                      </p>
                      <p class="item-total">
                        {{ formatPrice(item.totalPrice || 0) }}원
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div class="order-card-footer">
                <strong>{{ formatPrice(order.totalPrice || 0) }}원</strong>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { fetchList, subscribeTable, toTime } from "@/lib/supabase";

const router = useRouter();

const isMobile = ref(false);
const tableNumber = ref("");
const displayName = ref("");
const orderSheetId = ref("");

const isLoading = ref(true);
const orderList = ref([]);

let unsubscribeOrders = null;

const tableText = computed(() => {
  return tableNumber.value
    ? `${tableNumber.value}번 테이블`
    : "테이블 정보 없음";
});

const displayNameText = computed(() => {
  return displayName.value || "표시명 없음";
});

const orderSheetIdText = computed(() => {
  return orderSheetId.value || "주문서 없음";
});

const totalOrderAmount = computed(() => {
  return orderList.value.reduce(
    (acc, order) => acc + Number(order.totalPrice || 0),
    0
  );
});

function detectMobile() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  isMobile.value =
    /android|iphone|ipad|ipod|mobile|windows phone/i.test(ua) ||
    window.innerWidth <= 1024;
}

function loadEntryInfo() {
  try {
    const entryInfo = JSON.parse(
      sessionStorage.getItem("userEntryInfo") || "{}"
    );
    tableNumber.value = entryInfo.tableNumber || "";
    displayName.value = entryInfo.displayName || "";
    orderSheetId.value = entryInfo.orderSheetId || "";
  } catch (error) {
    tableNumber.value = "";
    displayName.value = "";
    orderSheetId.value = "";
  }
}

function subscribeOrders() {
  if (!orderSheetId.value) {
    isLoading.value = false;
    return;
  }

  const loadOrders = async () => {
    try {
      orderList.value = await fetchList("orders", {
        filters: [["orderSheetId", orderSheetId.value]],
        order: ["createdAt", "desc"],
      });
    } catch (error) {
      console.error("주문 내역 조회 실패:", error);
    } finally {
      isLoading.value = false;
    }
  };

  unsubscribeOrders = subscribeTable("orders", loadOrders, {
    filter: ["orderSheetId", orderSheetId.value],
  });
}

function convertOrderStatusText(status) {
  if (status === "REQUESTED") return "주문접수";
  if (status === "PREPARING") return "준비중";
  if (status === "SERVED") return "제공완료";
  if (status === "CANCELLED") return "취소";
  return status || "알 수 없음";
}

function convertToDate(value) {
  if (!value) return null;

  const parsed = new Date(toTime(value));

  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function goBack() {
  router.push("/user/main");
}

onMounted(() => {
  detectMobile();
  loadEntryInfo();

  if (!tableNumber.value || !displayName.value || !orderSheetId.value) {
    router.replace("/enter");
    return;
  }

  subscribeOrders();
});

onUnmounted(() => {
  if (unsubscribeOrders) {
    unsubscribeOrders();
    unsubscribeOrders = null;
  }
});
</script>

<style scoped lang="scss">
.user-order-history-view {
  min-height: 100dvh;
  background: linear-gradient(180deg, #0f172a 0%, #111827 100%);
  color: #ffffff;
}

.desktop-block {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.desktop-card {
  width: 100%;
  max-width: 420px;
  padding: 28px 24px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.08);
  text-align: center;

  .desktop-eyebrow {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.6);
  }

  h1 {
    margin: 0 0 12px;
    font-size: 28px;
    font-weight: 800;
  }

  p {
    margin: 0;
    font-size: 15px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.76);
  }
}

.order-history-container {
  min-height: 100dvh;
  padding: 16px 16px 80px;
}

.order-history-header {
  margin-bottom: 16px;
}

.header-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.back-button {
  width: 42px;
  height: 42px;
  border: none;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 18px;
  font-weight: 800;
  cursor: pointer;
  flex-shrink: 0;
}

.header-title {
  .eyebrow {
    margin: 0 0 4px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.6);
  }

  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 800;
    line-height: 1.2;
  }
}

.session-card {
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
}

.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  &:not(:last-child) {
    margin-bottom: 10px;
  }

  span {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.65);
  }

  strong {
    font-size: 15px;
    font-weight: 800;
    text-align: right;
    word-break: break-all;
  }
}

.order-history-section {
  margin-top: 16px;
}

.empty-box {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);

  p {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.72);
  }
}

.total-info-card {
  margin-bottom: 16px;
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
}

.total-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  &:not(:last-child) {
    margin-bottom: 10px;
  }

  span {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.65);
  }

  strong {
    font-size: 16px;
    font-weight: 800;
  }

  &.highlight {
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);

    strong {
      color: #60a5fa;
      font-size: 18px;
    }
  }
}

.order-list {
  display: grid;
  gap: 12px;
}

.order-card {
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.order-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.order-time {
  display: flex;
  align-items: center;
  gap: 8px;
}

.order-time-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
}

.order-time strong {
  font-size: 14px;
  font-weight: 800;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 10px;
  font-weight: 800;
  flex-shrink: 0;

  &.REQUESTED {
    background: rgba(59, 130, 246, 0.15);
    color: #93c5fd;
  }

  &.PREPARING {
    background: rgba(251, 191, 36, 0.15);
    color: #fcd34d;
  }

  &.SERVED {
    background: rgba(34, 197, 94, 0.15);
    color: #86efac;
  }

  &.CANCELLED {
    background: rgba(239, 68, 68, 0.15);
    color: #fca5a5;
  }
}

.order-items-section {
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);

  h4 {
    margin: 0 0 10px;
    font-size: 13px;
    font-weight: 800;
    color: rgba(255, 255, 255, 0.8);
  }
}

.order-items-list {
  display: grid;
  gap: 8px;
}

.order-item-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
}

.order-item-left {
  min-width: 0;
  flex: 1;

  strong {
    display: block;
    margin-bottom: 4px;
    font-size: 14px;
    font-weight: 800;
  }

  p {
    margin: 0 0 6px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.65);
  }
}

.item-quantity {
  color: rgba(255, 255, 255, 0.75) !important;
}

.item-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.option-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(96, 165, 250, 0.2);
  color: #93c5fd;
  font-size: 10px;
  font-weight: 700;
}

.order-item-right {
  text-align: right;
  flex-shrink: 0;

  p {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.65);
  }

  .item-total {
    margin-top: 2px;
    font-size: 13px;
    font-weight: 800;
    color: #fff;
  }
}

.order-card-footer {
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: flex-end;

  strong {
    font-size: 16px;
    font-weight: 800;
    color: #60a5fa;
  }
}

@media (min-width: 768px) {
  .order-history-container {
    max-width: 560px;
    margin: 0 auto;
  }
}
</style>
