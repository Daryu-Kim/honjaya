<template>
  <section class="reservation-card">
    <div class="card-head">
      <div>
        <p class="eyebrow">예약번호</p>
        <p class="reservation-no">{{ reservation.reservationNo }}</p>
      </div>
      <span class="status-badge" :class="statusTone">{{
        reservation.statusLabel
      }}</span>
    </div>

    <div class="info-grid">
      <div class="info-row">
        <span>예약자</span>
        <strong>{{ reservation.customerName }}</strong>
      </div>
      <div class="info-row">
        <span>연락처</span>
        <strong>{{ reservation.phone }}</strong>
      </div>
      <div class="info-row">
        <span>픽업 시간</span>
        <strong>{{ formatShopPickup(reservation.pickupAt) }}</strong>
      </div>
      <div class="info-row">
        <span>예약 접수</span>
        <strong>{{ formatShopDateTime(reservation.createdAt) }}</strong>
      </div>
    </div>

    <ul class="item-list">
      <li v-for="item in reservation.items" :key="item.id" class="item">
        <div class="item-main">
          <p class="item-name">{{ item.productName }}</p>
          <p v-if="item.optionText" class="item-option">
            {{ item.optionText }}
          </p>
          <p class="item-price">
            {{ formatShopWon(item.unitPrice) }} × {{ item.quantity }}
          </p>
        </div>
        <span class="item-amount">{{ formatShopWon(item.lineAmount) }}</span>
      </li>
    </ul>

    <div class="total-row">
      <span>결제 예정 금액</span>
      <strong>{{ formatShopWon(reservation.totalAmount) }}</strong>
    </div>

    <p v-if="reservation.memo" class="memo">요청사항: {{ reservation.memo }}</p>
    <p v-if="reservation.statusMemo" class="memo">
      매장 메모: {{ reservation.statusMemo }}
    </p>

    <p class="foot-note">
      결제는 매장에서 이루어져요. 픽업 시 신분증을 꼭 지참해 주세요.
    </p>
  </section>
</template>

<script setup>
import { computed } from "vue";

import {
  RESERVATION_STATUS_TONES,
  formatShopDateTime,
  formatShopPickup,
  formatShopWon,
} from "@/lib/shop";

const props = defineProps({
  reservation: {
    type: Object,
    required: true,
  },
});

const statusTone = computed(
  () => `tone-${RESERVATION_STATUS_TONES[props.reservation?.status] ?? "muted"}`
);
</script>

<style scoped lang="scss">
.reservation-card {
  padding: 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.eyebrow {
  margin: 0 0 3px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
}

.reservation-no {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #93c5fd;
}

.status-badge {
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);

  &.tone-pending {
    background: rgba(251, 191, 36, 0.18);
    color: #fcd34d;
  }

  &.tone-active {
    background: rgba(59, 130, 246, 0.2);
    color: #93c5fd;
  }

  &.tone-ready {
    background: rgba(34, 197, 94, 0.18);
    color: #86efac;
  }

  &.tone-done {
    background: rgba(148, 163, 184, 0.2);
    color: #cbd5e1;
  }

  &.tone-warn {
    background: rgba(248, 113, 113, 0.18);
    color: #fca5a5;
  }
}

.info-grid {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}

.info-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;

  span {
    color: rgba(255, 255, 255, 0.5);
  }

  strong {
    color: rgba(255, 255, 255, 0.9);
    font-weight: 600;
  }
}

.item-list {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.item-main {
  min-width: 0;
}

.item-name {
  margin: 0 0 3px;
  font-size: 13px;
  font-weight: 600;
}

.item-option {
  margin: 0 0 3px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
}

.item-price {
  margin: 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
}

.item-amount {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  color: #93c5fd;
}

.total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);

  span {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  strong {
    font-size: 17px;
    color: #93c5fd;
  }
}

.memo {
  margin: 12px 0 0;
  padding: 9px 11px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  font-size: 11px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.6);
}

.foot-note {
  margin: 14px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.4);
}
</style>
