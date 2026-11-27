<template>
  <div class="reservation-complete-view">
    <div v-if="!reservation" class="state-box">
      <p class="state-title">예약 정보를 찾을 수 없어요.</p>
      <p class="state-text">
        화면을 새로 고치면 예약 내용이 사라져요. 예약번호로 다시 확인해 주세요.
      </p>
      <router-link to="/reserve/lookup" class="primary-link"
        >예약 조회하기</router-link
      >
      <router-link to="/shop" class="secondary-link">상품 목록으로</router-link>
    </div>

    <template v-else>
      <header class="complete-header">
        <div class="check-mark">✓</div>
        <h1>예약이 접수됐어요</h1>
        <p class="subtitle">
          매장에서 확인 후 <strong>확정</strong>으로 바뀌면 알려드릴게요.<br />
          픽업 시간에 맞춰 방문해 주세요.
        </p>
      </header>

      <ReservationCard :reservation="reservation" />

      <div class="action-row">
        <router-link
          :to="{
            path: '/reserve/lookup',
            query: { no: reservation.reservationNo },
          }"
          class="secondary-button"
        >
          예약 조회
        </router-link>
        <router-link to="/shop" class="primary-button"
          >상품 더 보기</router-link
        >
      </div>

      <p class="foot-note">
        예약번호를 저장해 두시면 조회·취소할 때 편해요. 예약번호는 문자로도
        안내될 예정이에요.
      </p>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";

import ReservationCard from "@/components/shop/ReservationCard.vue";
import { lastReservation } from "@/lib/shop";

const reservation = ref(lastReservation.value);

onMounted(() => {
  reservation.value = lastReservation.value;
});
</script>

<style scoped lang="scss">
.reservation-complete-view {
  min-height: 100vh;
  padding: 28px 16px 48px;
  background: linear-gradient(180deg, #0f172a 0%, #111827 100%);
  color: #ffffff;
}

.complete-header {
  text-align: center;
  margin-bottom: 22px;
}

.check-mark {
  width: 52px;
  height: 52px;
  margin: 0 auto 12px;
  border-radius: 50%;
  background: rgba(34, 197, 94, 0.18);
  border: 1px solid rgba(34, 197, 94, 0.4);
  color: #86efac;
  font-size: 24px;
  line-height: 52px;
}

h1 {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 700;
}

.subtitle {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.62);

  strong {
    color: #93c5fd;
  }
}

.action-row {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}

.primary-button,
.secondary-button,
.primary-link,
.secondary-link {
  flex: 1;
  padding: 13px 16px;
  border-radius: 12px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}

.primary-button,
.primary-link {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
}

.secondary-button,
.secondary-link {
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.85);
}

.state-box {
  padding: 32px 18px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
  text-align: center;
}

.state-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 700;
}

.state-text {
  margin: 0 0 18px;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.6);
}

.primary-link {
  display: block;
  margin-bottom: 10px;
}

.secondary-link {
  display: block;
}

.foot-note {
  margin: 20px 2px 0;
  font-size: 11px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.4);
}
</style>
