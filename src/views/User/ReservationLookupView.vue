<template>
  <div class="reservation-lookup-view">
    <header class="lookup-header">
      <button type="button" class="back-button" @click="goBack">←</button>
      <h1>예약 조회</h1>
    </header>

    <section class="form-card">
      <label class="field">
        <span>예약번호</span>
        <input
          v-model="reservationNo"
          type="text"
          maxlength="16"
          placeholder="예: R260126-A7K2"
          autocomplete="off"
          @keyup.enter="search"
        />
      </label>
      <label class="field">
        <span>예약할 때 입력한 연락처</span>
        <input
          v-model="phone"
          type="tel"
          inputmode="numeric"
          maxlength="13"
          placeholder="010-0000-0000"
          @keyup.enter="search"
        />
      </label>

      <button
        type="button"
        class="search-button"
        :disabled="!canSearch || isLoading"
        @click="search"
      >
        {{ isLoading ? "조회 중…" : "예약 조회" }}
      </button>
    </section>

    <div v-if="errorMessage" class="state-box error">{{ errorMessage }}</div>

    <template v-if="reservation">
      <ReservationCard :reservation="reservation" />

      <div v-if="canCancel" class="cancel-row">
        <button
          type="button"
          class="cancel-button"
          :disabled="isCanceling"
          @click="cancel"
        >
          {{ isCanceling ? "취소하는 중…" : "예약 취소" }}
        </button>
        <p class="cancel-hint">
          픽업 준비가 시작된 예약은 직접 취소할 수 없어요. 매장으로 문의해
          주세요.
        </p>
      </div>

      <router-link to="/shop" class="shop-link"
        >전자담배 상품 보러 가기</router-link
      >
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import ReservationCard from "@/components/shop/ReservationCard.vue";
import {
  CUSTOMER_CANCELABLE_STATUSES,
  cancelReservation,
  lookupReservation,
} from "@/lib/shop";

const route = useRoute();
const router = useRouter();

const reservationNo = ref(String(route.query.no ?? "").trim());
const phone = ref("");
const reservation = ref(null);
const isLoading = ref(false);
const isCanceling = ref(false);
const errorMessage = ref("");

const canSearch = computed(
  () =>
    reservationNo.value.trim().length > 0 &&
    phone.value.replace(/[^0-9]/g, "").length >= 10
);

const canCancel = computed(() =>
  CUSTOMER_CANCELABLE_STATUSES.includes(reservation.value?.status)
);

function goBack() {
  router.push("/shop");
}

async function search() {
  if (!canSearch.value || isLoading.value) return;

  isLoading.value = true;
  errorMessage.value = "";

  try {
    reservation.value = await lookupReservation({
      reservationNo: reservationNo.value,
      phone: phone.value,
    });
  } catch (error) {
    reservation.value = null;
    errorMessage.value = error?.message || "예약을 찾지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function cancel() {
  if (!canCancel.value || isCanceling.value) return;

  const confirmed = window.confirm(
    "이 예약을 취소할까요? 취소 후에는 되돌릴 수 없어요."
  );

  if (!confirmed) return;

  isCanceling.value = true;
  errorMessage.value = "";

  try {
    reservation.value = await cancelReservation({
      reservationNo: reservation.value.reservationNo,
      phone: phone.value,
      reason: "손님 직접 취소",
    });
  } catch (error) {
    errorMessage.value = error?.message || "예약을 취소하지 못했어요.";
  } finally {
    isCanceling.value = false;
  }
}
</script>

<style scoped lang="scss">
.reservation-lookup-view {
  min-height: 100vh;
  padding: 20px 16px 48px;
  background: linear-gradient(180deg, #0f172a 0%, #111827 100%);
  color: #ffffff;
}

.lookup-header {
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

.form-card {
  padding: 16px;
  margin-bottom: 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.field {
  display: block;
  margin-bottom: 12px;

  span {
    display: block;
    margin-bottom: 5px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.55);
  }

  input {
    width: 100%;
    padding: 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    font-size: 15px;
    letter-spacing: 0.03em;
    outline: none;

    &::placeholder {
      color: rgba(255, 255, 255, 0.3);
    }

    &:focus {
      border-color: rgba(96, 165, 250, 0.6);
    }
  }
}

.search-button {
  width: 100%;
  padding: 13px;
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

.state-box {
  padding: 18px;
  margin-bottom: 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 13px;
  text-align: center;
  color: rgba(255, 255, 255, 0.7);

  &.error {
    color: #fca5a5;
  }
}

.cancel-row {
  margin-top: 14px;
}

.cancel-button {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(248, 113, 113, 0.4);
  background: rgba(248, 113, 113, 0.12);
  color: #fca5a5;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.cancel-hint {
  margin: 8px 2px 0;
  font-size: 11px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.42);
}

.shop-link {
  display: block;
  margin-top: 18px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
}
</style>
