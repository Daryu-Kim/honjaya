<template>
  <div class="user-cart-view">
    <div v-if="!isMobile" class="desktop-block">
      <div class="desktop-card">
        <p class="desktop-eyebrow">MOBILE ONLY</p>
        <h1>모바일로 이용해주세요</h1>
        <p>장바구니는 모바일 환경에서만 사용할 수 있어요.</p>
      </div>
    </div>

    <div v-else class="cart-container">
      <header class="cart-header">
        <div class="header-top">
          <button type="button" class="back-button" @click="goBack">←</button>

          <div class="header-title">
            <p class="eyebrow">CART</p>
            <h1>장바구니</h1>
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

      <section class="cart-section">
        <div v-if="cartList.length === 0" class="empty-box">
          <div class="empty-icon">🛒</div>
          <h2>장바구니가 비어 있어요</h2>
          <p>원하는 상품을 담아보세요.</p>
          <button type="button" class="empty-button" @click="goOrder">
            상품 보러가기
          </button>
        </div>

        <div v-else class="cart-list">
          <article
            v-for="item in cartList"
            :key="item.cartItemKey || item.cartItemId"
            class="cart-card"
          >
            <div class="cart-card-top">
              <div class="image-wrap">
                <img
                  v-if="item.imageUrl"
                  :src="item.imageUrl"
                  :alt="item.productName"
                />
                <div v-else class="image-empty">이미지 없음</div>
              </div>

              <div class="item-content">
                <div class="item-title-row">
                  <h2>{{ item.productName }}</h2>
                  <button
                    type="button"
                    class="delete-button"
                    @click="removeCartItem(item.cartItemKey || item.cartItemId)"
                  >
                    삭제
                  </button>
                </div>

                <div
                  v-if="item.selectedOptions && item.selectedOptions.length > 0"
                  class="option-list"
                >
                  <div
                    v-for="(option, optionIndex) in item.selectedOptions"
                    :key="`${item.cartItemKey || item.cartItemId}-${
                      option.groupId
                    }-${option.optionId}-${optionIndex}`"
                    class="option-row"
                  >
                    <span class="option-group">{{ option.groupName }}</span>
                    <span class="option-name">{{ option.optionName }}</span>
                    <span class="option-price">
                      {{
                        Number(option.additionalPrice || 0) > 0
                          ? `+${formatPrice(option.additionalPrice)}원`
                          : "+0원"
                      }}
                    </span>
                  </div>
                </div>

                <div class="price-row">
                  <span>개당 {{ formatPrice(item.unitPrice || 0) }}원</span>
                  <strong>{{ formatPrice(item.totalPrice || 0) }}원</strong>
                </div>
              </div>
            </div>

            <div class="cart-card-bottom">
              <div class="quantity-controller">
                <button
                  type="button"
                  @click="decreaseQuantity(item.cartItemKey || item.cartItemId)"
                >
                  -
                </button>
                <span>{{ item.quantity }}</span>
                <button
                  type="button"
                  @click="increaseQuantity(item.cartItemKey || item.cartItemId)"
                >
                  +
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section v-if="cartList.length > 0" class="request-section">
        <div class="request-card">
          <label for="requestMessage">요청사항</label>
          <textarea
            id="requestMessage"
            v-model.trim="requestMessage"
            placeholder="예: 얼음 적게, 빨대 2개 부탁드려요"
            maxlength="300"
          ></textarea>
        </div>
      </section>

      <div class="bottom-space"></div>

      <section v-if="cartList.length > 0" class="bottom-bar">
        <div class="bottom-card">
          <div class="summary-text">
            <strong>{{ totalCartCount }}개</strong>
            <p>총 {{ formatPrice(totalCartPrice) }}원</p>
          </div>

          <button
            type="button"
            class="submit-button"
            :disabled="isSubmitting"
            @click="submitOrder"
          >
            {{ isSubmitting ? "주문 요청 중..." : "주문 요청하기" }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { recalculateOrderSheetTotals } from "@/lib/orderSheetTotals";
import {
  getOrderSheetStatus,
  isBlockedOrderSheetStatus,
} from "@/lib/userOrderSheetGuard";

const router = useRouter();

const isMobile = ref(false);
const tableNumber = ref("");
const displayName = ref("");
const orderSheetId = ref("");
const cartList = ref([]);
const requestMessage = ref("");
const isSubmitting = ref(false);

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

const totalCartCount = computed(() => {
  return cartList.value.reduce(
    (acc, item) => acc + Number(item.quantity || 0),
    0
  );
});

const totalCartPrice = computed(() => {
  return cartList.value.reduce(
    (acc, item) => acc + Number(item.totalPrice || 0),
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

function loadCart() {
  try {
    const saved = JSON.parse(sessionStorage.getItem("userCart") || "[]");
    cartList.value = Array.isArray(saved) ? saved : [];
  } catch (error) {
    cartList.value = [];
  }
}

function loadRequestMessage() {
  try {
    requestMessage.value =
      sessionStorage.getItem("userCartRequestMessage") || "";
  } catch (error) {
    requestMessage.value = "";
  }
}

function saveCart() {
  sessionStorage.setItem("userCart", JSON.stringify(cartList.value));
}

function saveRequestMessage() {
  sessionStorage.setItem("userCartRequestMessage", requestMessage.value || "");
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function goBack() {
  router.push("/user/order");
}

function goOrder() {
  router.push("/user/order");
}

function increaseQuantity(cartItemKey) {
  const found = cartList.value.find(
    (item) => (item.cartItemKey || item.cartItemId) === cartItemKey
  );
  if (!found) return;

  found.quantity = Number(found.quantity || 0) + 1;
  found.totalPrice = Number(found.unitPrice || 0) * Number(found.quantity || 0);
  saveCart();
}

function decreaseQuantity(cartItemKey) {
  const found = cartList.value.find(
    (item) => (item.cartItemKey || item.cartItemId) === cartItemKey
  );
  if (!found) return;

  found.quantity = Number(found.quantity || 0) - 1;

  if (found.quantity <= 0) {
    cartList.value = cartList.value.filter(
      (item) => (item.cartItemKey || item.cartItemId) !== cartItemKey
    );
  } else {
    found.totalPrice =
      Number(found.unitPrice || 0) * Number(found.quantity || 0);
  }

  saveCart();
}

function removeCartItem(cartItemKey) {
  cartList.value = cartList.value.filter(
    (item) => (item.cartItemKey || item.cartItemId) !== cartItemKey
  );
  saveCart();
}

async function submitOrder() {
  if (!tableNumber.value || !displayName.value || !orderSheetId.value) return;
  if (cartList.value.length === 0 || isSubmitting.value) return;

  const canUse = await guardOrderSheetUsable();
  if (!canUse) return;

  isSubmitting.value = true;
  saveRequestMessage();

  try {
    const orderItems = cartList.value.map((item) => ({
      orderSheetId: orderSheetId.value,
      tableNumber: tableNumber.value,
      displayName: displayName.value,
      productId: item.productId,
      productName: item.productName,
      basePrice: Number(item.basePrice || 0),
      unitPrice: Number(item.unitPrice || 0),
      totalPrice: Number(item.totalPrice || 0),
      quantity: Number(item.quantity || 0),
      imageUrl: item.imageUrl || "",
      selectedOptions: Array.isArray(item.selectedOptions)
        ? item.selectedOptions.map((option) => ({
            groupId: option.groupId,
            groupName: option.groupName,
            optionId: option.optionId,
            optionName: option.optionName,
            additionalPrice: Number(option.additionalPrice || 0),
          }))
        : [],
    }));

    const orderPayload = {
      orderSheetId: orderSheetId.value,
      tableNumber: tableNumber.value,
      displayName: displayName.value,
      requestMessage: requestMessage.value,
      items: orderItems,
      totalCount: totalCartCount.value,
      totalPrice: totalCartPrice.value,
      status: "REQUESTED",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const orderRef = await addDoc(collection(db, "orders"), orderPayload);

    await recalculateOrderSheetTotals(orderSheetId.value);

    sessionStorage.setItem("lastRequestedOrderId", orderRef.id);
    sessionStorage.removeItem("userCart");
    sessionStorage.removeItem("userCartRequestMessage");

    cartList.value = [];
    requestMessage.value = "";

    router.push({
      path: "/user/order-complete",
      query: {
        orderId: orderRef.id,
      },
    });
  } catch (error) {
    console.error("주문 요청 실패:", error);
    alert("주문 요청 중 문제가 발생했어요. 다시 시도해주세요.");
  } finally {
    isSubmitting.value = false;
  }
}

async function guardOrderSheetUsable() {
  const result = await getOrderSheetStatus(orderSheetId.value);

  if (!result.exists) {
    alert("주문서를 찾을 수 없어 다시 입장이 필요해요.");
    sessionStorage.removeItem("userEntryInfo");
    sessionStorage.removeItem("userCart");
    sessionStorage.removeItem("userCartRequestMessage");
    router.replace("/enter");
    return false;
  }

  if (isBlockedOrderSheetStatus(result.status)) {
    alert("이미 결제가 완료된 주문서라 더 이상 주문할 수 없어요.");
    sessionStorage.removeItem("userCart");
    sessionStorage.removeItem("userCartRequestMessage");
    router.replace("/enter");
    return false;
  }

  return true;
}

onMounted(async () => {
  detectMobile();
  loadEntryInfo();
  loadCart();
  loadRequestMessage();

  if (!tableNumber.value || !displayName.value || !orderSheetId.value) {
    router.replace("/enter");
    return;
  }

  const canUse = await guardOrderSheetUsable();
  if (!canUse) return;
});
</script>

<style scoped lang="scss">
.user-cart-view {
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

.cart-container {
  min-height: 100dvh;
  padding: 16px 16px 0;
}

.cart-header {
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
.cart-card,
.empty-box,
.bottom-card {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 20px;
}

.session-card {
  padding: 16px;

  .session-row {
    display: flex;
    align-items: center;
    justify-content: space-between;

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
}

.cart-section {
  margin-bottom: 16px;
}

.empty-box {
  padding: 32px 20px;
  text-align: center;

  .empty-icon {
    font-size: 40px;
    margin-bottom: 10px;
  }

  h2 {
    margin: 0 0 10px;
    font-size: 24px;
    font-weight: 800;
  }

  p {
    margin: 0 0 14px;
    font-size: 14px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.72);
  }
}

.empty-button {
  height: 46px;
  padding: 0 18px;
  border: none;
  border-radius: 14px;
  background: #ffffff;
  color: #111827;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.cart-list {
  display: grid;
  gap: 14px;
}

.cart-card {
  padding: 14px;
}

.cart-card-top {
  display: flex;
  gap: 12px;
}

.image-wrap {
  width: 88px;
  height: 88px;
  border-radius: 16px;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.08);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.image-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  text-align: center;
}

.item-content {
  min-width: 0;
  flex: 1;
}

.item-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 800;
    line-height: 1.4;
  }
}

.delete-button {
  flex-shrink: 0;
  height: 32px;
  padding: 0 10px;
  border: none;
  border-radius: 10px;
  background: rgba(252, 165, 165, 0.14);
  color: #fecaca;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.option-list {
  display: grid;
  gap: 6px;
  margin-bottom: 10px;
}

.option-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  font-size: 12px;

  .option-group {
    color: rgba(255, 255, 255, 0.58);
  }

  .option-name {
    color: rgba(255, 255, 255, 0.88);
    word-break: break-word;
  }

  .option-price {
    color: rgba(255, 255, 255, 0.62);
  }
}

.price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  span {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  strong {
    font-size: 15px;
    font-weight: 800;
  }
}

.cart-card-bottom {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.quantity-controller {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.12);

  button {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
  }

  span {
    min-width: 18px;
    text-align: center;
    font-size: 13px;
    font-weight: 800;
  }
}

.request-section {
  margin-bottom: 16px;
}

.request-card {
  padding: 16px;

  label {
    display: block;
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.72);
  }

  textarea {
    width: 100%;
    min-height: 100px;
    resize: none;
    border: none;
    outline: none;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    padding: 14px;
    font-size: 14px;
    line-height: 1.6;

    &::placeholder {
      color: rgba(255, 255, 255, 0.45);
    }
  }
}

.bottom-space {
  height: 98px;
}

.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: linear-gradient(
    180deg,
    rgba(15, 23, 42, 0) 0%,
    rgba(15, 23, 42, 0.88) 20%,
    rgba(15, 23, 42, 0.96) 100%
  );
}

.bottom-card {
  max-width: 560px;
  margin: 0 auto;
  padding: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.summary-text {
  strong {
    display: block;
    margin-bottom: 4px;
    font-size: 15px;
    font-weight: 800;
  }

  p {
    margin: 0;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.72);
  }
}

.submit-button {
  min-width: 132px;
  height: 46px;
  padding: 0 18px;
  border: none;
  border-radius: 14px;
  background: #ffffff;
  color: #111827;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

@media (min-width: 768px) {
  .cart-container {
    max-width: 560px;
    margin: 0 auto;
    padding-top: 20px;
  }
}
</style>
