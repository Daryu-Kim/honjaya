<template>
  <div class="phone-dashboard-view">
    <header class="page-header">
      <p class="eyebrow">PHONE ADMIN DASHBOARD</p>
      <h1>운영 현황</h1>
      <p class="description">
        오늘 매출과 현재 대기 중인 요청을 빠르게 확인할 수 있어요.
      </p>
    </header>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">오늘 매출</span>
        <strong>{{ formatPrice(todaySalesAmount) }}원</strong>
      </article>

      <article class="summary-card">
        <span class="summary-label">오늘 주문</span>
        <strong>{{ todayOrderCount }}건</strong>
      </article>

      <article class="summary-card">
        <span class="summary-label">계산 대기</span>
        <strong>{{ waitingCheckoutCount }}건</strong>
      </article>

      <article class="summary-card">
        <span class="summary-label">영상 대기</span>
        <strong>{{ waitingYoutubeCount }}건</strong>
      </article>
    </section>

    <section class="quick-section">
      <div class="section-head">
        <h2>빠른 이동</h2>
      </div>

      <div class="quick-grid">
        <button
          type="button"
          class="quick-button"
          @click="goPage('/tablet/orders')"
        >
          주문 보기
        </button>
        <button
          type="button"
          class="quick-button"
          @click="goPage('/tablet/checkout')"
        >
          계산 요청
        </button>
        <button
          type="button"
          class="quick-button"
          @click="goPage('/tablet/youtube')"
        >
          영상 신청
        </button>
        <button
          type="button"
          class="quick-button"
          @click="goPage('/tablet/chat')"
        >
          채팅 보기
        </button>
      </div>
    </section>

    <section class="recent-section">
      <div class="section-head">
        <h2>최근 채팅</h2>
      </div>

      <div v-if="isLoadingMessages" class="empty-box">
        <p>채팅을 불러오는 중이에요.</p>
      </div>

      <div v-else-if="recentMessages.length === 0" class="empty-box">
        <p>최근 메시지가 없어요.</p>
      </div>

      <div v-else class="message-list">
        <article
          v-for="message in recentMessages"
          :key="message.id"
          class="message-card"
        >
          <div class="message-top">
            <span
              class="message-type"
              :class="message.messageType.toLowerCase()"
            >
              {{ message.messageType }}
            </span>
            <span class="message-time">{{
              formatDateTime(message.createdAt)
            }}</span>
          </div>

          <strong class="message-sender">
            {{ buildSenderLabel(message) }}
          </strong>

          <p class="message-text">{{ message.message }}</p>
        </article>
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
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const router = useRouter();

const isLoadingOrders = ref(true);
const isLoadingCheckout = ref(true);
const isLoadingYoutube = ref(true);
const isLoadingMessages = ref(true);

const orderList = ref([]);
const checkoutList = ref([]);
const youtubeList = ref([]);
const messageList = ref([]);

let unsubscribeOrders = null;
let unsubscribeCheckout = null;
let unsubscribeYoutube = null;
let unsubscribeMessages = null;

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
    const isDone = item.status === "DONE";

    if (!isToday || !isDone) return acc;
    return acc + Number(item.totalPrice || 0);
  }, 0);
});

const waitingCheckoutCount = computed(() => {
  return checkoutList.value.filter((item) =>
    ["REQUESTED", "CONFIRMED"].includes(item.status)
  ).length;
});

const waitingYoutubeCount = computed(() => {
  return youtubeList.value.filter((item) =>
    ["WAITING", "ACCEPTED"].includes(item.status)
  ).length;
});

const recentMessages = computed(() => {
  return messageList.value.slice(0, 6);
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

function formatPrice(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatDateTime(value) {
  const date = convertToDate(value);
  if (!date) return "";

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function buildSenderLabel(message) {
  if (message.messageType === "ADMIN") {
    return message.senderLabel || "직원";
  }

  if (message.messageType === "SYSTEM") {
    return "시스템";
  }

  if (message.tableNumber && message.nickname) {
    return `${message.tableNumber}번 테이블 · ${message.nickname}`;
  }

  return message.nickname || "알 수 없음";
}

function subscribeOrders() {
  const q = query(
    collection(db, "orders"),
    orderBy("createdAt", "desc"),
    limit(100)
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

function subscribeCheckout() {
  const q = query(
    collection(db, "checkoutRequests"),
    orderBy("createdAt", "desc"),
    limit(100)
  );
  unsubscribeCheckout = onSnapshot(
    q,
    (snapshot) => {
      checkoutList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      isLoadingCheckout.value = false;
    },
    () => {
      isLoadingCheckout.value = false;
    }
  );
}

function subscribeYoutube() {
  const q = query(
    collection(db, "youtubeRequests"),
    orderBy("createdAt", "desc"),
    limit(100)
  );
  unsubscribeYoutube = onSnapshot(
    q,
    (snapshot) => {
      youtubeList.value = snapshot.docs.map((docSnap) => ({
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
      messageList.value = snapshot.docs.map((docSnap) => ({
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

function goPage(path) {
  router.push(path);
}

onMounted(() => {
  subscribeOrders();
  subscribeCheckout();
  subscribeYoutube();
  subscribeMessages();
});

onUnmounted(() => {
  if (unsubscribeOrders) unsubscribeOrders();
  if (unsubscribeCheckout) unsubscribeCheckout();
  if (unsubscribeYoutube) unsubscribeYoutube();
  if (unsubscribeMessages) unsubscribeMessages();
});
</script>

<style scoped lang="scss">
.phone-dashboard-view {
  min-height: 100vh;
  padding: 16px;
  background: linear-gradient(180deg, #0f172a 0%, #111827 100%);
  color: #fff;
}

.page-header {
  margin-bottom: 18px;

  .eyebrow {
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.55);
  }

  h1 {
    margin: 0 0 8px;
    font-size: 28px;
    font-weight: 800;
  }

  .description {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.72);
  }
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.summary-card,
.quick-button,
.message-card,
.empty-box {
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
}

.summary-card {
  padding: 16px;

  .summary-label {
    display: block;
    margin-bottom: 8px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
  }

  strong {
    font-size: 22px;
    font-weight: 800;
  }
}

.quick-section,
.recent-section {
  margin-bottom: 18px;
}

.section-head {
  margin-bottom: 12px;

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
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
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.empty-box {
  padding: 22px 16px;
  text-align: center;

  p {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.72);
  }
}

.message-list {
  display: grid;
  gap: 10px;
}

.message-card {
  padding: 14px;
}

.message-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.message-type {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;

  &.user {
    background: rgba(96, 165, 250, 0.18);
    color: #bfdbfe;
  }

  &.admin {
    background: rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.88);
  }

  &.system {
    background: rgba(52, 211, 153, 0.18);
    color: #a7f3d0;
  }
}

.message-time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.48);
}

.message-sender {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 700;
}

.message-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.78);
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 420px) {
  .summary-grid,
  .quick-grid {
    grid-template-columns: 1fr;
  }
}
</style>
