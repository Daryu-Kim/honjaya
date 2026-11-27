<template>
  <div class="shop-detail-view">
    <header class="shop-header">
      <button type="button" class="back-button" @click="goBack">←</button>
      <h1>예약하기</h1>
    </header>

    <div v-if="isLoading" class="state-box">상품 정보를 불러오는 중이에요.</div>

    <div v-else-if="errorMessage" class="state-box error">
      <p>{{ errorMessage }}</p>
      <button type="button" class="retry-button" @click="loadProduct">
        다시 시도
      </button>
    </div>

    <template v-else-if="product">
      <section class="product-card">
        <div class="thumb">
          <img
            v-if="product.imageUrl"
            :src="product.imageUrl"
            :alt="product.name"
          />
          <span v-else class="thumb-fallback">🛍️</span>
        </div>
        <div class="product-body">
          <p v-if="product.brand" class="brand">{{ product.brand }}</p>
          <p class="name">{{ product.name }}</p>
          <div class="tags">
            <span v-if="product.flavorProfile" class="tag">{{
              product.flavorProfile
            }}</span>
            <span v-if="product.nicotineType" class="tag">{{
              product.nicotineType
            }}</span>
            <span v-if="product.isNicotineFree" class="tag highlight"
              >무니코틴</span
            >
          </div>
          <p class="price">{{ formatShopWon(product.price) }}</p>
        </div>
      </section>

      <p v-if="product.description" class="description">
        {{ product.description }}
      </p>

      <section
        v-for="group in product.optionGroups"
        :key="group.groupId"
        class="block"
      >
        <div class="block-head">
          <p class="block-title">{{ group.groupName }}</p>
          <span class="block-hint">
            {{ group.isRequired ? "필수" : "선택" }}
            <template v-if="group.isMultiple"> · 복수 선택</template>
          </span>
        </div>
        <div class="option-grid">
          <button
            v-for="option in group.options"
            :key="option.optionId"
            type="button"
            class="option-chip"
            :class="{ active: isSelected(group.groupId, option.optionId) }"
            :disabled="option.isActive === false || option.isSoldOut === true"
            @click="toggleOption(group, option)"
          >
            <span>{{ option.optionName }}</span>
            <span v-if="option.additionalPrice" class="option-price">
              +{{ formatShopWon(option.additionalPrice) }}
            </span>
          </button>
        </div>
      </section>

      <section class="block">
        <div class="block-head">
          <p class="block-title">수량</p>
          <span class="block-hint">최대 {{ maxQuantity }}개</span>
        </div>
        <div class="quantity-row">
          <button
            type="button"
            class="quantity-button"
            @click="decreaseQuantity"
          >
            −
          </button>
          <span class="quantity-value">{{ quantity }}</span>
          <button
            type="button"
            class="quantity-button"
            @click="increaseQuantity"
          >
            +
          </button>
        </div>
      </section>

      <section class="block">
        <div class="block-head">
          <p class="block-title">픽업 희망 시간</p>
          <span class="block-hint">영업시간 15:00 ~ 05:00</span>
        </div>
        <div class="slot-grid">
          <button
            v-for="slot in pickupSlots"
            :key="slot.value"
            type="button"
            class="slot-chip"
            :class="{ active: pickupAt === slot.value }"
            @click="pickupAt = slot.value"
          >
            {{ slot.label }}
          </button>
        </div>
      </section>

      <section class="block">
        <div class="block-head">
          <p class="block-title">예약자 정보</p>
        </div>
        <label class="field">
          <span>이름</span>
          <input
            v-model="customerName"
            type="text"
            maxlength="30"
            placeholder="예: 홍길동"
          />
        </label>
        <label class="field">
          <span>연락처</span>
          <input
            v-model="phone"
            type="tel"
            inputmode="numeric"
            maxlength="13"
            placeholder="010-0000-0000"
          />
        </label>
        <label class="field">
          <span>요청사항 (선택)</span>
          <input
            v-model="memo"
            type="text"
            maxlength="200"
            placeholder="예: 입고되면 문자 주세요"
          />
        </label>
      </section>

      <section class="block adult-block">
        <label class="check-row">
          <input v-model="adultConfirmed" type="checkbox" />
          <span>
            본인은 만 19세 이상이며, 픽업 시 신분증 확인에 동의합니다.
          </span>
        </label>
      </section>

      <div v-if="submitErrorMessage" class="state-box error">
        {{ submitErrorMessage }}
      </div>

      <div class="summary-bar">
        <div class="summary-text">
          <span>예상 결제 금액</span>
          <strong>{{ formatShopWon(totalAmount) }}</strong>
        </div>
        <button
          type="button"
          class="submit-button"
          :disabled="!canSubmit || isSubmitting"
          @click="submitReservation"
        >
          {{ isSubmitting ? "예약하는 중…" : "예약하기" }}
        </button>
      </div>

      <p class="foot-note">
        결제는 매장에서 이루어져요. 예약 후 매장에서 신분증 확인 → 결제 → 수령
        순서로 진행돼요.
      </p>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import {
  buildPickupSlots,
  createReservation,
  fetchShopProduct,
  formatShopWon,
  lastReservation,
} from "@/lib/shop";

const route = useRoute();
const router = useRouter();

const product = ref(null);
const isLoading = ref(false);
const isSubmitting = ref(false);
const errorMessage = ref("");
const submitErrorMessage = ref("");

const selectedOptions = ref({});
const quantity = ref(1);
const pickupAt = ref("");
const customerName = ref("");
const phone = ref("");
const memo = ref("");
const adultConfirmed = ref(false);

const pickupSlots = buildPickupSlots({ days: 3 }).map((slot) => {
  const date = new Date(slot);
  const label = `${date.getMonth() + 1}/${date.getDate()} ${String(
    date.getHours()
  ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

  return { value: toLocalInput(date), label };
});

function toLocalInput(date) {
  const pad = (value) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

const maxQuantity = computed(() => {
  const available = Number(product.value?.availableStock ?? 0);

  return Math.max(1, Math.min(20, available));
});

const selectedOptionList = computed(() => {
  const groups = product.value?.optionGroups ?? [];
  const picked = [];

  groups.forEach((group) => {
    const ids = selectedOptions.value[group.groupId] ?? [];

    ids.forEach((optionId) => {
      const option = (group.options ?? []).find(
        (item) => item.optionId === optionId
      );

      if (option) picked.push({ group, option });
    });
  });

  return picked;
});

const unitPrice = computed(() => {
  const base = Number(product.value?.price ?? 0);
  const extra = selectedOptionList.value.reduce(
    (sum, entry) => sum + Number(entry.option.additionalPrice ?? 0),
    0
  );

  return base + extra;
});

const totalAmount = computed(() => unitPrice.value * quantity.value);

const missingRequiredGroup = computed(() => {
  const groups = product.value?.optionGroups ?? [];

  return groups.find((group) => {
    if (!group.isRequired) return false;

    const ids = selectedOptions.value[group.groupId] ?? [];
    const minSelect = Math.max(1, Number(group.minSelectCount ?? 0));

    return ids.length < minSelect;
  });
});

const canSubmit = computed(
  () =>
    Boolean(product.value) &&
    !missingRequiredGroup.value &&
    Boolean(pickupAt.value) &&
    customerName.value.trim().length > 0 &&
    phone.value.replace(/[^0-9]/g, "").length >= 10 &&
    adultConfirmed.value &&
    Number(product.value?.availableStock ?? 0) > 0
);

function isSelected(groupId, optionId) {
  return (selectedOptions.value[groupId] ?? []).includes(optionId);
}

function toggleOption(group, option) {
  if (option.isActive === false || option.isSoldOut === true) return;

  const current = [...(selectedOptions.value[group.groupId] ?? [])];

  if (group.isMultiple) {
    const index = current.indexOf(option.optionId);

    if (index >= 0) {
      current.splice(index, 1);
    } else {
      const max = Number(group.maxSelectCount ?? 0);

      if (max > 0 && current.length >= max) return;
      current.push(option.optionId);
    }
  } else {
    selectedOptions.value = {
      ...selectedOptions.value,
      [group.groupId]: current.includes(option.optionId)
        ? []
        : [option.optionId],
    };

    return;
  }

  selectedOptions.value = {
    ...selectedOptions.value,
    [group.groupId]: current,
  };
}

function increaseQuantity() {
  if (quantity.value < maxQuantity.value) quantity.value += 1;
}

function decreaseQuantity() {
  if (quantity.value > 1) quantity.value -= 1;
}

function goBack() {
  router.push("/shop");
}

async function loadProduct() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    product.value = await fetchShopProduct(route.params.productId);

    if (!product.value) {
      errorMessage.value = "상품을 찾을 수 없어요.";
    }
  } catch (error) {
    errorMessage.value = error?.message || "상품을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function submitReservation() {
  if (!canSubmit.value || isSubmitting.value) return;

  isSubmitting.value = true;
  submitErrorMessage.value = "";

  try {
    const reservation = await createReservation({
      customerName: customerName.value.trim(),
      phone: phone.value.trim(),
      pickupAt: pickupAt.value,
      memo: memo.value.trim(),
      items: [
        {
          productId: product.value.id,
          quantity: quantity.value,
          optionIds: selectedOptionList.value.map(
            (entry) => entry.option.optionId
          ),
        },
      ],
    });

    lastReservation.value = reservation;

    router.push("/reserve/complete");
  } catch (error) {
    submitErrorMessage.value =
      error?.message || "예약하지 못했어요. 잠시 후 다시 시도해 주세요.";
  } finally {
    isSubmitting.value = false;
  }
}

onMounted(loadProduct);
</script>

<style scoped lang="scss">
.shop-detail-view {
  min-height: 100vh;
  padding: 20px 16px 140px;
  background: linear-gradient(180deg, #0f172a 0%, #111827 100%);
  color: #ffffff;
}

.shop-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.back-button {
  width: 36px;
  height: 36px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-size: 16px;
  cursor: pointer;
}

h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.product-card {
  display: flex;
  gap: 12px;
  padding: 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.thumb {
  width: 84px;
  height: 84px;
  flex-shrink: 0;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.thumb-fallback {
  font-size: 30px;
}

.product-body {
  flex: 1;
  min-width: 0;
}

.brand {
  margin: 0 0 2px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.name {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.tag {
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.72);

  &.highlight {
    background: rgba(34, 197, 94, 0.16);
    color: #86efac;
  }
}

.price {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #93c5fd;
}

.description {
  margin: 12px 2px 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.6);
  white-space: pre-line;
}

.block {
  margin-top: 18px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.block-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.block-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
}

.option-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.option-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 13px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
  cursor: pointer;

  &.active {
    border-color: rgba(96, 165, 250, 0.7);
    background: rgba(96, 165, 250, 0.2);
    color: #fff;
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
}

.option-price {
  font-size: 11px;
  color: #93c5fd;
}

.quantity-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.quantity-button {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
}

.quantity-value {
  min-width: 28px;
  text-align: center;
  font-size: 16px;
  font-weight: 700;
}

.slot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
  max-height: 210px;
  overflow-y: auto;
}

.slot-chip {
  padding: 9px 6px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  cursor: pointer;

  &.active {
    border-color: rgba(96, 165, 250, 0.7);
    background: rgba(96, 165, 250, 0.2);
    color: #fff;
  }
}

.field {
  display: block;
  margin-bottom: 10px;

  span {
    display: block;
    margin-bottom: 5px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.55);
  }

  input {
    width: 100%;
    padding: 11px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    font-size: 14px;
    outline: none;

    &::placeholder {
      color: rgba(255, 255, 255, 0.3);
    }

    &:focus {
      border-color: rgba(96, 165, 250, 0.6);
    }
  }

  &:last-child {
    margin-bottom: 0;
  }
}

.adult-block {
  background: rgba(251, 191, 36, 0.08);
  border-color: rgba(251, 191, 36, 0.24);
}

.check-row {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;

  input {
    margin-top: 2px;
    width: 17px;
    height: 17px;
    flex-shrink: 0;
  }
}

.state-box {
  padding: 26px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);

  &.error {
    color: #fca5a5;
  }
}

.retry-button {
  margin-top: 12px;
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.summary-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: rgba(15, 23, 42, 0.96);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(8px);
}

.summary-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;

  span {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
  }

  strong {
    font-size: 17px;
    color: #93c5fd;
  }
}

.submit-button {
  padding: 13px 24px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.foot-note {
  margin: 18px 2px 0;
  font-size: 11px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.4);
}
</style>
