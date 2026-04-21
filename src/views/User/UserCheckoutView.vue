<template>
  <div class="user-checkout-view">
    <div v-if="!isMobile" class="desktop-block">
      <div class="desktop-card">
        <p class="desktop-eyebrow">MOBILE ONLY</p>
        <h1>모바일로 이용해주세요</h1>
        <p>결제 요청은 모바일 환경에서만 사용할 수 있어요.</p>
      </div>
    </div>

    <div v-else class="checkout-container">
      <header class="checkout-header">
        <div class="header-top">
          <button type="button" class="back-button" @click="goBack">←</button>

          <div class="header-title">
            <p class="eyebrow">PAYMENT REQUEST</p>
            <h1>결제 요청</h1>
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

      <section class="checkout-section">
        <div v-if="isLoadingRequest" class="empty-box">
          <p>결제 요청 상태를 불러오는 중이에요.</p>
        </div>

        <div v-else-if="activePaymentRequest" class="status-card">
          <div class="status-icon">💳</div>
          <h2>이미 결제 요청이 접수되어 있어요</h2>
          <p>직원이 확인 후 결제를 도와드릴게요.</p>

          <div class="status-info-box">
            <div class="status-info-row">
              <span>현재 상태</span>
              <strong>{{
                convertStatusText(activePaymentRequest.status)
              }}</strong>
            </div>
            <div class="status-info-row">
              <span>요청 시각</span>
              <strong>{{
                formatDateTime(activePaymentRequest.createdAt)
              }}</strong>
            </div>
          </div>

          <button
            v-if="canCancelRequest(activePaymentRequest)"
            type="button"
            class="cancel-button"
            :disabled="isSubmitting"
            @click="cancelCheckoutRequest"
          >
            {{ isSubmitting ? "처리 중..." : "결제 요청 취소" }}
          </button>
        </div>

        <div v-else class="request-card">
          <div class="request-icon">🧾</div>
          <h2>직원에게 결제를 요청할까요?</h2>
          <p>결제 요청을 보내면 직원이 테이블로 방문해 결제를 도와드려요.</p>

          <button
            type="button"
            class="request-button"
            :disabled="isSubmitting"
            @click="createCheckoutRequest"
          >
            {{ isSubmitting ? "요청 중..." : "결제 요청하기" }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createSystemChatMessage } from "@/lib/chat";
import { getOrderSheetStatus, isBlockedOrderSheetStatus } from "@/lib/userOrderSheetGuard";

const router = useRouter();

const isMobile = ref(false);
const tableNumber = ref("");
const displayName = ref("");
const orderSheetId = ref("");

const isLoadingRequest = ref(true);
const isSubmitting = ref(false);
const activePaymentRequest = ref(null);

let unsubscribePaymentRequest = null;

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

function subscribeActivePaymentRequest() {
  if (!orderSheetId.value) {
    isLoadingRequest.value = false;
    return;
  }

  const requestQuery = query(
    collection(db, "checkoutRequests"),
    where("orderSheetId", "==", orderSheetId.value),
    orderBy("createdAt", "desc")
  );

  unsubscribePaymentRequest = onSnapshot(
    requestQuery,
    (snapshot) => {
      const allRequests = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      activePaymentRequest.value =
        allRequests.find((item) =>
          ["REQUESTED", "CONFIRMED"].includes(String(item.status || ""))
        ) || null;

      isLoadingRequest.value = false;
    },
    (error) => {
      console.error("결제 요청 조회 실패:", error);
      isLoadingRequest.value = false;
    }
  );
}

function convertStatusText(status) {
  if (status === "REQUESTED") return "요청됨";
  if (status === "CONFIRMED") return "확인됨";
  if (status === "DONE") return "결제완료";
  if (status === "CANCELLED") return "취소됨";
  return status || "알 수 없음";
}

function canCancelRequest(request) {
  return request?.status === "REQUESTED";
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

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${month}.${day} ${hours}:${minutes}`;
}

async function createCheckoutRequest() {
  if (!tableNumber.value || !displayName.value || !orderSheetId.value) return;
  if (isSubmitting.value || activePaymentRequest.value) return;

  const canUse = await guardOrderSheetUsableForCheckout();
  if (!canUse) return;

  isSubmitting.value = true;

  try {
    await addDoc(collection(db, "checkoutRequests"), {
      orderSheetId: orderSheetId.value,
      tableNumber: tableNumber.value,
      displayName: displayName.value,
      status: "REQUESTED",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "orderSheets", orderSheetId.value), {
      status: "PAYMENT_REQUESTED",
      paymentStatus: "REQUESTED",
      updatedAt: serverTimestamp(),
    });

    await createSystemChatMessage({
      orderSheetId: orderSheetId.value,
      tableNumber: tableNumber.value,
      displayName: displayName.value,
      message: `${displayName.value}에서 결제를 요청했어요.`,
    });

    alert("결제 요청이 접수되었어요.");
  } catch (error) {
    console.error("결제 요청 생성 실패:", error);
    alert("결제 요청 중 문제가 발생했어요.");
  } finally {
    isSubmitting.value = false;
  }
}

async function cancelCheckoutRequest() {
  if (!activePaymentRequest.value?.id || isSubmitting.value) return;

  isSubmitting.value = true;

  try {
    await updateDoc(
      doc(db, "checkoutRequests", activePaymentRequest.value.id),
      {
        status: "CANCELLED",
        updatedAt: serverTimestamp(),
      }
    );

    await updateDoc(doc(db, "orderSheets", orderSheetId.value), {
      status: "OPEN",
      paymentStatus: "UNPAID",
      updatedAt: serverTimestamp(),
    });

    await createSystemChatMessage({
      orderSheetId: orderSheetId.value,
      tableNumber: tableNumber.value,
      displayName: displayName.value,
      message: `${displayName.value}에서 결제 요청을 취소했어요.`,
    });
  } catch (error) {
    console.error("결제 요청 취소 실패:", error);
    alert("결제 요청 취소 중 문제가 발생했어요.");
  } finally {
    isSubmitting.value = false;
  }
}

function goBack() {
  router.push("/user/main");
}

async function guardOrderSheetUsableForCheckout() {
  const result = await getOrderSheetStatus(orderSheetId.value);

  if (!result.exists) {
    alert("주문서를 찾을 수 없어 다시 입장이 필요해요.");
    sessionStorage.removeItem("userEntryInfo");
    router.replace("/enter");
    return false;
  }

  if (isBlockedOrderSheetStatus(result.status)) {
    alert("이미 결제가 완료된 주문서예요.");
    router.replace("/enter");
    return false;
  }

  return true;
}

onMounted(async () => {
  detectMobile();
  loadEntryInfo();

  if (!tableNumber.value || !displayName.value || !orderSheetId.value) {
    router.replace("/enter");
    return;
  }

  const canUse = await guardOrderSheetUsableForCheckout();
  if (!canUse) return;

  subscribeActivePaymentRequest();
});

onUnmounted(() => {
  if (unsubscribePaymentRequest) {
    unsubscribePaymentRequest();
    unsubscribePaymentRequest = null;
  }
});
</script>

<style scoped lang="scss">
.user-checkout-view {
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

.checkout-container {
  min-height: 100dvh;
  padding: 16px;
}

.checkout-header {
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

.session-card,
.request-card,
.status-card,
.empty-box {
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
}

.session-card {
  padding: 16px;
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

.checkout-section {
  margin-top: 16px;
}

.request-card,
.status-card {
  padding: 24px 18px;
  text-align: center;

  h2 {
    margin: 0 0 10px;
    font-size: 24px;
    font-weight: 800;
    line-height: 1.35;
  }

  p {
    margin: 0 0 16px;
    font-size: 14px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.74);
  }
}

.request-icon,
.status-icon {
  font-size: 42px;
  margin-bottom: 12px;
}

.status-info-box {
  margin-bottom: 16px;
  padding: 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
}

.status-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  &:not(:last-child) {
    margin-bottom: 8px;
  }

  span {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.58);
  }

  strong {
    font-size: 13px;
    font-weight: 800;
  }
}

.request-button,
.cancel-button {
  width: 100%;
  height: 50px;
  border: none;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.request-button {
  background: #ffffff;
  color: #111827;
}

.cancel-button {
  background: rgba(252, 165, 165, 0.14);
  color: #fecaca;
}

.empty-box {
  padding: 28px 16px;
  text-align: center;

  p {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.7);
  }
}

@media (min-width: 768px) {
  .checkout-container {
    max-width: 560px;
    margin: 0 auto;
    padding-top: 20px;
  }
}
</style>
