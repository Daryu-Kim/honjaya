<template>
  <div v-if="open" class="prepaid-sell-overlay" @click.self="emit('close')">
    <div class="prepaid-sell-modal">
      <div class="prepaid-sell-head">
        <h3>선불권 판매</h3>
        <button type="button" class="close-button" @click="emit('close')">
          닫기
        </button>
      </div>

      <div class="prepaid-sell-body">
        <div class="field">
          <label>고객 전화번호</label>
          <input
            :value="phoneInput"
            type="tel"
            inputmode="numeric"
            maxlength="13"
            placeholder="010-0000-0000"
            @input="onPhoneInput"
          />
          <p class="helper">선불권은 전화번호 기준으로 회원에게 귀속돼요.</p>
        </div>

        <div class="field">
          <label>선불권 상품</label>
          <div v-if="loading" class="helper">상품을 불러오는 중이에요...</div>
          <div v-else-if="plans.length === 0" class="helper">
            판매 중인 선불권 상품이 없어요. 관리자 페이지에서 먼저 만들어
            주세요.
          </div>
          <div v-else class="plan-list">
            <button
              v-for="plan in plans"
              :key="plan.id"
              type="button"
              class="plan-item"
              :class="{ active: selectedPlanId === plan.id }"
              @click="selectedPlanId = plan.id"
            >
              <span class="plan-name">{{ plan.name }}</span>
              <span class="plan-price">
                {{ formatWon(plan.price) }} 결제 →
                {{ formatWon(plan.faceValue) }} 충전
              </span>
              <span class="plan-rule">{{ describePlanRule(plan) }}</span>
            </button>
          </div>
        </div>

        <div class="field">
          <label>결제 수단</label>
          <select v-model="paymentMethod">
            <option
              v-for="option in PREPAID_PAYMENT_METHODS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="field">
          <label>메모 (선택)</label>
          <input
            v-model="memo"
            type="text"
            maxlength="200"
            placeholder="예: 현금 결제"
          />
        </div>

        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

        <div v-if="issuedPass" class="issued-box">
          <p class="issued-title">발급 완료</p>
          <p>
            {{ issuedPass.customerPhoneText || phoneInput }} ·
            {{ issuedPass.planName }}
          </p>
          <p>
            잔액 {{ formatWon(issuedPass.balance) }} ·
            {{ issuedPass.usableFromDate }}부터 사용 가능
          </p>
          <p v-if="issuedPass.expiresAt">
            유효기간 {{ formatPrepaidDate(issuedPass.expiresAt) }}까지
          </p>
          <p
            v-if="Number(issuedPass.pointsEarned || 0) > 0"
            class="issued-points"
          >
            포인트
            {{ Number(issuedPass.pointsEarned).toLocaleString("ko-KR") }}P 적립
          </p>
        </div>
      </div>

      <div class="prepaid-sell-foot">
        <button type="button" class="ghost-button" @click="emit('close')">
          닫기
        </button>
        <button
          type="button"
          class="primary-button"
          :disabled="submitting || !selectedPlanId"
          @click="submit"
        >
          {{
            submitting
              ? "등록 중..."
              : issuedPass
              ? "한 장 더 등록"
              : "판매 등록"
          }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";

import { formatPhoneInput, normalizePhoneNumber } from "@/lib/points";
import {
  PREPAID_PAYMENT_METHODS,
  describePlanRule,
  fetchPrepaidPlans,
  formatPrepaidDate,
  formatWon,
  issuePrepaidPass,
} from "@/lib/prepaid";

const props = defineProps({
  open: { type: Boolean, default: false },
  defaultPhone: { type: String, default: "" },
});

const emit = defineEmits(["close", "issued"]);

const plans = ref([]);
const loading = ref(false);
const submitting = ref(false);
const selectedPlanId = ref("");
const paymentMethod = ref("CARD");
const memo = ref("");
const phoneInput = ref("");
const errorMessage = ref("");
const issuedPass = ref(null);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;

    errorMessage.value = "";
    issuedPass.value = null;
    memo.value = "";
    paymentMethod.value = "CARD";
    phoneInput.value = formatPhoneInput(props.defaultPhone || "");

    loadPlans();
  },
  { immediate: true }
);

async function loadPlans() {
  loading.value = true;

  try {
    const result = await fetchPrepaidPlans();
    const list = Array.isArray(result?.plans) ? result.plans : [];

    plans.value = list.filter((plan) => plan.isActive);

    if (!plans.value.some((plan) => plan.id === selectedPlanId.value)) {
      selectedPlanId.value = plans.value[0]?.id || "";
    }
  } catch (error) {
    console.error("선불권 상품 조회 실패:", error);
    errorMessage.value = error?.message || "선불권 상품을 불러오지 못했어요.";
  } finally {
    loading.value = false;
  }
}

function onPhoneInput(event) {
  const formatted = formatPhoneInput(event.target.value);

  phoneInput.value = formatted;

  if (event.target.value !== formatted) {
    event.target.value = formatted;
  }
}

async function submit() {
  if (submitting.value) return;

  const phone = normalizePhoneNumber(phoneInput.value);

  if (phone.length < 10) {
    errorMessage.value = "고객 전화번호를 정확히 입력해 주세요.";
    return;
  }

  if (!selectedPlanId.value) {
    errorMessage.value = "선불권 상품을 선택해 주세요.";
    return;
  }

  submitting.value = true;
  errorMessage.value = "";

  try {
    const result = await issuePrepaidPass({
      phone,
      planId: selectedPlanId.value,
      paymentMethod: paymentMethod.value,
      memo: memo.value,
    });

    issuedPass.value = result?.pass || null;
    memo.value = "";
    emit("issued", result?.pass || null);
  } catch (error) {
    console.error("선불권 발급 실패:", error);
    errorMessage.value = error?.message || "선불권을 등록하지 못했어요.";
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped lang="scss">
.prepaid-sell-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(4, 6, 20, 0.72);
  backdrop-filter: blur(6px);
}

.prepaid-sell-modal {
  width: min(560px, 100%);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: #10142c;
  color: #e8ecff;
}

.prepaid-sell-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 22px 12px;

  h3 {
    margin: 0;
    font-size: 18px;
  }
}

.close-button {
  border: none;
  border-radius: 10px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.1);
  color: #cbd5ff;
  cursor: pointer;
}

.prepaid-sell-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 22px 12px;
  display: grid;
  gap: 16px;
}

.field {
  display: grid;
  gap: 8px;

  label {
    font-size: 13px;
    color: rgba(226, 232, 255, 0.7);
  }

  input,
  select {
    width: 100%;
    padding: 11px 12px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.06);
    color: #e8ecff;
    font-size: 14px;
  }
}

.helper {
  margin: 0;
  font-size: 12px;
  color: rgba(226, 232, 255, 0.55);
}

.plan-list {
  display: grid;
  gap: 8px;
}

.plan-item {
  display: grid;
  gap: 4px;
  text-align: left;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  cursor: pointer;

  &.active {
    border-color: rgba(129, 140, 248, 0.9);
    background: rgba(99, 102, 241, 0.18);
  }
}

.plan-name {
  font-weight: 600;
}

.plan-price {
  font-size: 13px;
  color: #a5b4fc;
}

.plan-rule {
  font-size: 12px;
  color: rgba(226, 232, 255, 0.55);
}

.error-text {
  margin: 0;
  font-size: 13px;
  color: #fda4af;
}

.issued-box {
  padding: 14px;
  border-radius: 14px;
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.35);
  font-size: 13px;
  display: grid;
  gap: 4px;

  p {
    margin: 0;
  }
}

.issued-title {
  font-weight: 700;
  color: #86efac;
}

.issued-points {
  color: #86efac;
}

.prepaid-sell-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.ghost-button,
.primary-button {
  padding: 11px 18px;
  border-radius: 12px;
  border: none;
  font-size: 14px;
  cursor: pointer;
}

.ghost-button {
  background: rgba(255, 255, 255, 0.1);
  color: #cbd5ff;
}

.primary-button {
  background: #c7d2fe;
  color: #1e1b4b;
  font-weight: 600;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
