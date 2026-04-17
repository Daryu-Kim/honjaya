<template>
  <div class="user-order-complete-view">
    <div v-if="!isMobile" class="desktop-block">
      <div class="desktop-card">
        <p class="desktop-eyebrow">MOBILE ONLY</p>
        <h1>모바일로 이용해주세요</h1>
        <p>주문 완료 화면은 모바일 환경에서만 확인할 수 있어요.</p>
      </div>
    </div>

    <div v-else class="complete-container">
      <section class="complete-card">
        <div class="icon-wrap">✅</div>

        <p class="eyebrow">ORDER COMPLETE</p>
        <h1>주문 요청이 전달되었어요</h1>
        <p class="description">
          직원이 주문 내용을 확인한 뒤 순서대로 도와드릴게요.
        </p>

        <div class="info-box">
          <div class="info-row">
            <span>테이블</span>
            <strong>{{ tableText }}</strong>
          </div>
          <div class="info-row">
            <span>표시명</span>
            <strong>{{ displayNameText }}</strong>
          </div>
          <div class="info-row">
            <span>주문서 번호</span>
            <strong>{{ orderSheetIdText }}</strong>
          </div>
        </div>

        <div v-if="isLoadingOrder" class="summary-box">
          <div class="summary-head">
            <h2>주문 요약</h2>
          </div>
          <p class="description">주문 정보를 불러오는 중이에요.</p>
        </div>

        <div v-else-if="orderInfo" class="summary-box">
          <div class="summary-head">
            <h2>주문 요약</h2>
            <strong>{{ orderInfo.totalCount || 0 }}개</strong>
          </div>

          <div class="summary-list">
            <div
              v-for="(item, index) in orderInfo.items || []"
              :key="`${item.productId}-${index}`"
              class="summary-item"
            >
              <div class="summary-item-left">
                <p class="product-name">{{ item.productName }}</p>
                <p class="product-meta">
                  {{ formatPrice(item.unitPrice || item.price || 0) }}원 ×
                  {{ item.quantity || 0 }}개
                </p>

                <div
                  v-if="item.selectedOptions && item.selectedOptions.length > 0"
                  class="item-option-list"
                >
                  <div
                    v-for="(option, optionIndex) in item.selectedOptions"
                    :key="`${item.productId}-${option.groupId}-${option.optionId}-${optionIndex}`"
                    class="item-option-row"
                  >
                    <span class="item-option-group">{{
                      option.groupName
                    }}</span>
                    <span class="item-option-name">{{
                      option.optionName
                    }}</span>
                    <span class="item-option-price">
                      {{
                        Number(option.additionalPrice || 0) > 0
                          ? `+${formatPrice(option.additionalPrice)}원`
                          : "+0원"
                      }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="product-total">
                {{
                  formatPrice(
                    item.totalPrice ||
                      Number(item.unitPrice || item.price || 0) *
                        Number(item.quantity || 0)
                  )
                }}원
              </div>
            </div>
          </div>

          <div v-if="orderInfo.requestMessage" class="request-box">
            <span class="request-label">요청사항</span>
            <p>{{ orderInfo.requestMessage }}</p>
          </div>

          <div class="summary-total">
            <span>총 {{ orderInfo.totalCount || 0 }}개</span>
            <strong>{{ formatPrice(orderInfo.totalPrice || 0) }}원</strong>
          </div>
        </div>

        <div v-else class="summary-box">
          <div class="summary-head">
            <h2>주문 요약</h2>
          </div>
          <p class="description">주문 정보를 찾을 수 없어요.</p>
        </div>

        <div class="button-group">
          <button type="button" class="primary-button" @click="goOrder">
            다시 주문하러 가기
          </button>
          <button type="button" class="secondary-button" @click="goMain">
            메인으로 돌아가기
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const router = useRouter();
const route = useRoute();

const isMobile = ref(false);
const tableNumber = ref("");
const displayName = ref("");
const orderSheetId = ref("");
const orderInfo = ref(null);
const isLoadingOrder = ref(true);

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

async function loadOrder() {
  const orderId =
    String(route.query.orderId || "").trim() ||
    String(sessionStorage.getItem("lastRequestedOrderId") || "").trim();

  if (!orderId) {
    isLoadingOrder.value = false;
    orderInfo.value = null;
    return;
  }

  try {
    const snapshot = await getDoc(doc(db, "orders", orderId));

    if (!snapshot.exists()) {
      orderInfo.value = null;
      return;
    }

    const data = snapshot.data();

    orderInfo.value = {
      id: snapshot.id,
      ...data,
    };
  } catch (error) {
    console.error("주문 조회 실패:", error);
    orderInfo.value = null;
  } finally {
    isLoadingOrder.value = false;
  }
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function goOrder() {
  router.push("/user/order");
}

function goMain() {
  router.push("/user/main");
}

onMounted(async () => {
  detectMobile();
  loadEntryInfo();

  if (!tableNumber.value || !displayName.value || !orderSheetId.value) {
    router.replace("/enter");
    return;
  }

  await loadOrder();
});
</script>

<style scoped lang="scss">
.user-order-complete-view {
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

.complete-container {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 16px;
}

.complete-card {
  width: 100%;
  max-width: 560px;
  padding: 28px 20px 20px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.24);

  .icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    margin: 0 auto 16px;
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.12);
    font-size: 34px;
  }

  .eyebrow {
    margin: 0 0 8px;
    text-align: center;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.6);
  }

  h1 {
    margin: 0;
    text-align: center;
    font-size: 28px;
    font-weight: 800;
    line-height: 1.25;
  }

  .description {
    margin: 12px 0 20px;
    text-align: center;
    font-size: 14px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.75);
  }
}

.info-box,
.summary-box {
  margin-bottom: 16px;
}

.info-box {
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
}

.info-row {
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
    text-align: right;
    word-break: break-all;
  }
}

.summary-box {
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
}

.summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;

  h2 {
    margin: 0;
    font-size: 19px;
    font-weight: 800;
  }

  strong {
    font-size: 15px;
    font-weight: 800;
  }
}

.summary-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-bottom: 14px;
}

.summary-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
}

.summary-item-left {
  min-width: 0;
  flex: 1;
}

.product-name {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.5;
}

.product-meta {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.65);
}

.item-option-list {
  display: grid;
  gap: 4px;
  margin-top: 8px;
}

.item-option-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}

.item-option-group {
  color: rgba(255, 255, 255, 0.5);
}

.item-option-name {
  color: rgba(255, 255, 255, 0.84);
  word-break: break-word;
}

.item-option-price {
  color: rgba(255, 255, 255, 0.58);
}

.product-total {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 800;
}

.summary-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);

  span {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.68);
  }

  strong {
    font-size: 20px;
    font-weight: 800;
  }
}

.request-box {
  margin-top: 14px;
  margin-bottom: 14px;
  padding: 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);

  .request-label {
    display: block;
    margin-bottom: 8px;
    font-size: 12px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.62);
  }

  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.8);
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.button-group {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.primary-button,
.secondary-button {
  width: 100%;
  height: 52px;
  border: none;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}

.primary-button {
  background: #ffffff;
  color: #111827;
}

.secondary-button {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

@media (max-width: 480px) {
  .complete-card {
    padding: 24px 16px 16px;

    h1 {
      font-size: 24px;
    }
  }

  .summary-item {
    flex-direction: column;
  }

  .product-total {
    align-self: flex-end;
  }

  .item-option-row {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
</style>
