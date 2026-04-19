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
        <span class="summary-label">결제 요청</span>
        <strong>{{ paymentRequestCount }}건</strong>
      </article>

      <article class="summary-card">
        <span class="summary-label">영상 신청</span>
        <strong>{{ queuedYoutubeCount }}건</strong>
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

        <section class="panel-card">
          <div class="panel-head">
            <h2>영상 신청</h2>
            <p>현재 재생 큐에 올라간 신청 영상입니다.</p>
          </div>

          <div v-if="isLoadingYoutube" class="empty-box">
            <p>영상 신청을 불러오는 중이에요.</p>
          </div>

          <div v-else-if="youtubeRequestList.length === 0" class="empty-box">
            <p>대기 중인 영상 신청이 없어요.</p>
          </div>

          <div v-else class="card-list compact">
            <article
              v-for="request in youtubeRequestList.slice(0, 5)"
              :key="request.id"
              class="mini-card"
            >
              <div class="mini-card-head">
                <div>
                  <strong>{{
                    request.displayName || `No.${request.tableNumber}`
                  }}</strong>
                  <p class="ellipsis">{{ request.title }}</p>
                </div>
                <span class="status-badge">
                  {{ convertYoutubeStatusText(request.status) }}
                </span>
              </div>

              <div class="mini-card-foot">
                <span>{{ formatDateTime(request.createdAt) }}</span>
              </div>
            </article>
          </div>
        </section>

        <section class="panel-card">
          <div class="panel-head">
            <h2>최근 채팅</h2>
            <p>실시간 분위기를 빠르게 확인할 수 있어요.</p>
          </div>

          <div v-if="isLoadingMessages" class="empty-box">
            <p>채팅을 불러오는 중이에요.</p>
          </div>

          <div v-else-if="chatMessageList.length === 0" class="empty-box">
            <p>최근 채팅이 없어요.</p>
          </div>

          <div v-else class="chat-list">
            <div
              v-for="message in chatMessageList.slice(0, 6)"
              :key="message.id"
              class="chat-row"
            >
              <div class="chat-meta">
                <strong>{{ buildChatSender(message) }}</strong>
                <span>{{ formatDateTime(message.createdAt) }}</span>
              </div>
              <p>{{ message.message }}</p>
            </div>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const router = useRouter();

const isLoadingOrders = ref(true);
const isLoadingPayments = ref(true);
const isLoadingYoutube = ref(true);
const isLoadingMessages = ref(true);
const isLoadingOrderSheets = ref(true);

const orderList = ref([]);
const paymentRequestList = ref([]);
const youtubeRequestList = ref([]);
const chatMessageList = ref([]);
const orderSheetList = ref([]);

let unsubscribeOrders = null;
let unsubscribePayments = null;
let unsubscribeYoutube = null;
let unsubscribeMessages = null;
let unsubscribeOrderSheets = null;

const currentDateText = computed(() => {
  const now = new Date();
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
  const todayStart = getTodayStart();

  return orderList.value.reduce((acc, item) => {
    const date = convertToDate(item.createdAt);
    const isToday = date && date >= todayStart;
    const isPaid =
      item.status !== "CANCELLED" &&
      orderSheetList.value.find(
        (sheet) => sheet.orderSheetId === item.orderSheetId
      )?.paymentStatus === "COMPLETED";

    if (!isToday || !isPaid) return acc;
    return acc + Number(item.totalPrice || 0);
  }, 0);
});

const paymentRequestCount = computed(() => {
  return paymentRequestList.value.length;
});

const queuedYoutubeCount = computed(() => {
  return youtubeRequestList.value.filter((item) =>
    ["QUEUED", "PLAYING"].includes(String(item.status || ""))
  ).length;
});

const recentOrders = computed(() => {
  return orderList.value.slice(0, 5);
});

function getTodayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function convertToDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function convertYoutubeStatusText(status) {
  if (status === "QUEUED") return "신청됨";
  if (status === "PLAYING") return "재생중";
  if (status === "DONE") return "완료";
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

function buildChatSender(message) {
  if (message.messageType === "SYSTEM") return "시스템";
  if (message.messageType === "ADMIN") return message.senderLabel || "직원";
  if (message.displayName) return message.displayName;
  if (message.tableNumber) return `No.${message.tableNumber}`;
  return "알 수 없음";
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
  const q = query(
    collection(db, "orders"),
    orderBy("createdAt", "desc"),
    limit(20)
  );

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

function subscribePayments() {
  const q = query(
    collection(db, "checkoutRequests"),
    where("status", "in", ["REQUESTED", "CONFIRMED"]),
    orderBy("createdAt", "desc"),
    limit(20)
  );

  unsubscribePayments = onSnapshot(
    q,
    (snapshot) => {
      paymentRequestList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      isLoadingPayments.value = false;
    },
    () => {
      isLoadingPayments.value = false;
    }
  );
}

function subscribeYoutube() {
  const q = query(
    collection(db, "youtubeRequests"),
    where("status", "in", ["QUEUED", "PLAYING"]),
    orderBy("createdAt", "asc"),
    limit(20)
  );

  unsubscribeYoutube = onSnapshot(
    q,
    (snapshot) => {
      youtubeRequestList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      isLoadingYoutube.value = false;
    },
    () => {
      isLoadingYoutube.value = false;
    }
  );
}

function subscribeMessages() {
  const q = query(
    collection(db, "chatMessages"),
    orderBy("createdAt", "desc"),
    limit(20)
  );

  unsubscribeMessages = onSnapshot(
    q,
    (snapshot) => {
      chatMessageList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      isLoadingMessages.value = false;
    },
    () => {
      isLoadingMessages.value = false;
    }
  );
}

function subscribeOrderSheets() {
  const q = query(
    collection(db, "orderSheets"),
    orderBy("updatedAt", "desc"),
    limit(50)
  );

  unsubscribeOrderSheets = onSnapshot(
    q,
    (snapshot) => {
      orderSheetList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      isLoadingOrderSheets.value = false;
    },
    () => {
      isLoadingOrderSheets.value = false;
    }
  );
}

onMounted(() => {
  subscribeOrders();
  subscribePayments();
  subscribeYoutube();
  subscribeMessages();
  subscribeOrderSheets();
});

onUnmounted(() => {
  if (unsubscribeOrders) unsubscribeOrders();
  if (unsubscribePayments) unsubscribePayments();
  if (unsubscribeYoutube) unsubscribeYoutube();
  if (unsubscribeMessages) unsubscribeMessages();
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

.chat-list {
  display: grid;
  gap: 10px;
}

.chat-row {
  padding: 12px 14px;

  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.chat-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;

  strong {
    font-size: 13px;
    font-weight: 800;
  }

  span {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.52);
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

  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}
</style>
