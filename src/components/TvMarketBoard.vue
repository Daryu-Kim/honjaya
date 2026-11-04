<template>
  <section class="market-board">
    <header class="board-head">
      <div class="head-title">
        <span class="head-tag">LIVE MARKET</span>
        <h2 class="head-name">혼자야 지수</h2>
      </div>

      <div class="head-index" :class="indexToneClass">
        <span class="index-value">{{ formatNumber(index.value) }}</span>
        <span class="index-change">
          {{ arrowOf(index.changePct) }} {{ formatPct(index.changePct) }}
        </span>
        <svg
          class="index-spark"
          viewBox="0 0 100 30"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline :points="indexPoints" :class="`spark-${indexTone}`" />
        </svg>
      </div>

      <div class="head-meta">
        <span class="meta-pill" :class="{ 'is-frozen': frozen }">
          {{ frozen ? "거래 정지" : "실시간 체결" }}
        </span>
        <span class="meta-text">메뉴 {{ rows.length }}종</span>
        <span class="meta-text">갱신 {{ tickSeconds }}초</span>
      </div>
    </header>

    <div class="board-grid">
      <article
        v-for="(row, position) in rows"
        :key="row.productId"
        class="board-card"
        :class="row.changePct >= 0 ? 'is-up' : 'is-down'"
      >
        <span class="card-rank">{{ position + 1 }}</span>

        <div class="card-main">
          <span class="card-name">{{ row.productName }}</span>
          <span class="card-price">
            {{ formatNumber(row.price) }}<span class="price-unit">원</span>
          </span>
        </div>

        <div class="card-side">
          <span class="card-change">
            {{ arrowOf(row.changePct) }} {{ formatPct(row.changePct) }}
          </span>
          <span class="card-diff">{{ formatDiff(row.changeAmount) }}</span>
          <svg
            class="card-spark"
            viewBox="0 0 100 30"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline
              :points="sparkPointsOf(row.productId)"
              :class="row.changePct >= 0 ? 'spark-up' : 'spark-down'"
            />
          </svg>
        </div>
      </article>

      <p v-if="rows.length === 0" class="board-empty">
        아직 시세가 열리지 않았어요.
      </p>
    </div>

    <footer class="board-foot">
      <div v-if="ingredients.length > 0" class="foot-ingredients">
        <span class="ing-label">재료 시세</span>
        <span
          v-for="ingredient in ingredients"
          :key="ingredient.name"
          class="ing-chip"
          :class="ingredient.changePct >= 0 ? 'is-up' : 'is-down'"
        >
          {{ ingredient.name }}
          <b>{{ arrowOf(ingredient.changePct) }}</b>
          {{ Math.abs(ingredient.changePct).toFixed(0) }}%
        </span>
      </div>

      <div class="foot-ticker">
        <span class="ticker-label">{{
          frozen ? "거래 정지" : "방금 체결"
        }}</span>
        <div class="ticker-window">
          <div class="ticker-track">
            <span
              v-for="trade in tickerTrades"
              :key="trade.key"
              class="ticker-item"
            >
              <b>{{ trade.tableLabel }}</b>
              {{ trade.productName }}
              {{ trade.quantity }}잔
              <em>{{ formatNumber(trade.unitPrice) }}원</em>
            </span>
            <span v-if="tickerTrades.length === 0" class="ticker-item">
              아직 체결된 주문이 없어요.
            </span>
          </div>
        </div>
      </div>
    </footer>
  </section>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  rows: {
    type: Array,
    default: () => [],
  },
  index: {
    type: Object,
    default: () => ({ value: 1000, changePct: 0 }),
  },
  indexSparkline: {
    type: Array,
    default: () => [],
  },
  ingredients: {
    type: Array,
    default: () => [],
  },
  trades: {
    type: Array,
    default: () => [],
  },
  sparklineOf: {
    type: Function,
    default: null,
  },
  frozen: {
    type: Boolean,
    default: false,
  },
  tickSeconds: {
    type: Number,
    default: 1,
  },
});

const numberFormatter = new Intl.NumberFormat("ko-KR");

const indexTone = computed(() => (props.index.changePct >= 0 ? "up" : "down"));
const indexToneClass = computed(() =>
  indexTone.value === "up" ? "is-up" : "is-down"
);
const indexPoints = computed(() => sparkPoints(props.indexSparkline));

const tickerTrades = computed(() =>
  props.trades.map((trade) => ({
    ...trade,
    tableLabel: trade.tableNumber ? `${trade.tableNumber}번` : "단골",
  }))
);

function sparkPoints(values) {
  if (!Array.isArray(values) || values.length < 2) {
    return "0,26 100,26";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  return values
    .map((value, position) => {
      const x = (position / (values.length - 1)) * 100;
      const y = 26 - ((value - min) / span) * 22;

      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function sparkPointsOf(productId) {
  if (typeof props.sparklineOf !== "function") {
    return "0,26 100,26";
  }

  return sparkPoints(props.sparklineOf(productId));
}

function formatNumber(value) {
  return numberFormatter.format(Math.round(Number(value) || 0));
}

function formatPct(value) {
  const safe = Number(value) || 0;

  return `${safe >= 0 ? "+" : ""}${safe.toFixed(1)}%`;
}

function formatDiff(value) {
  const safe = Math.round(Number(value) || 0);

  if (safe === 0) {
    return "0원";
  }

  return `${safe > 0 ? "+" : ""}${numberFormatter.format(safe)}원`;
}

function arrowOf(value) {
  return (Number(value) || 0) >= 0 ? "▲" : "▼";
}
</script>

<style scoped>
.market-board {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  box-sizing: border-box;
  background: #100b08;
  box-shadow: inset 0 0 0 6px #120b10;
  font-family: inherit;
  color: #f6ecd8;
}

.board-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 14px 20px;
  background: #1b1209;
  box-shadow: inset 0 0 0 4px #4a341f;
}

.head-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 220px;
}

.head-tag {
  font-size: 14px;
  letter-spacing: 0.32em;
  color: #c9a26a;
}

.head-name {
  margin: 0;
  font-size: 38px;
  color: #ffd166;
  text-shadow: 3px 3px 0 #6d3f00;
}

.head-index {
  display: flex;
  align-items: center;
  gap: 18px;
  flex: 1 1 auto;
}

.index-value {
  font-size: 60px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  text-shadow: 3px 3px 0 rgba(0, 0, 0, 0.45);
}

.head-index.is-up .index-value,
.head-index.is-up .index-change {
  color: #7cf29c;
}

.head-index.is-down .index-value,
.head-index.is-down .index-change {
  color: #ff8a8a;
}

.index-change {
  font-size: 30px;
  font-variant-numeric: tabular-nums;
}

.index-spark {
  width: 220px;
  height: 62px;
  overflow: visible;
}

.spark-up {
  fill: none;
  stroke: #7cf29c;
  stroke-width: 2.5;
  stroke-linejoin: miter;
  vector-effect: non-scaling-stroke;
}

.spark-down {
  fill: none;
  stroke: #ff8a8a;
  stroke-width: 2.5;
  stroke-linejoin: miter;
  vector-effect: non-scaling-stroke;
}

.head-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.meta-pill {
  padding: 5px 12px;
  font-size: 16px;
  color: #06210f;
  background: #7cf29c;
  box-shadow: 3px 3px 0 #1c6b36;
}

.meta-pill.is-frozen {
  color: #2b0c0c;
  background: #ff8a8a;
  box-shadow: 3px 3px 0 #7a2020;
}

.meta-text {
  font-size: 15px;
  color: #c9a26a;
}

.board-grid {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 12px;
  min-height: 0;
}

.board-card {
  display: flex;
  align-items: stretch;
  gap: 12px;
  padding: 12px 16px;
  box-sizing: border-box;
  background: #17100a;
  box-shadow: inset 0 0 0 3px #3a2818;
  overflow: hidden;
}

.board-card.is-up {
  box-shadow: inset 0 0 0 3px #2f5b3c;
}

.board-card.is-down {
  box-shadow: inset 0 0 0 3px #6a2c2c;
}

.card-rank {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  font-size: 22px;
  color: #8a6a44;
}

.card-main {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  min-width: 0;
}

.card-name {
  font-size: 26px;
  color: #ffe9c2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-price {
  font-size: 34px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: #f6ecd8;
}

.price-unit {
  margin-left: 2px;
  font-size: 20px;
  color: #c9a26a;
}

.card-side {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
}

.card-change {
  font-size: 24px;
  font-variant-numeric: tabular-nums;
}

.board-card.is-up .card-change {
  color: #7cf29c;
}

.board-card.is-down .card-change {
  color: #ff8a8a;
}

.card-diff {
  font-size: 15px;
  color: #a98b64;
  font-variant-numeric: tabular-nums;
}

.card-spark {
  width: 124px;
  height: 40px;
  margin-top: 4px;
  overflow: visible;
}

.board-empty {
  grid-column: 1 / -1;
  align-self: center;
  margin: 0;
  text-align: center;
  font-size: 28px;
  color: #c9a26a;
}

.board-foot {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.foot-ingredients {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 4px;
  overflow: hidden;
}

.ing-label {
  flex: 0 0 auto;
  font-size: 16px;
  color: #c9a26a;
  letter-spacing: 0.1em;
}

.ing-chip {
  flex: 0 0 auto;
  padding: 5px 12px;
  font-size: 16px;
  background: #1b1209;
  box-shadow: inset 0 0 0 3px #3a2818;
  font-variant-numeric: tabular-nums;
}

.ing-chip.is-up {
  color: #7cf29c;
}

.ing-chip.is-down {
  color: #ff8a8a;
}

.ing-chip b {
  margin: 0 2px;
  font-weight: 400;
}

.foot-ticker {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 52px;
  padding: 0 16px;
  box-sizing: border-box;
  background: #0a0603;
  box-shadow: inset 0 0 0 3px #3a2818;
  overflow: hidden;
}

.ticker-label {
  flex: 0 0 auto;
  padding: 4px 10px;
  font-size: 15px;
  color: #100b08;
  background: #ffd166;
}

.ticker-window {
  flex: 1 1 auto;
  overflow: hidden;
  white-space: nowrap;
}

.ticker-track {
  display: inline-flex;
  align-items: center;
  gap: 28px;
  animation: ticker-scroll 34s linear infinite;
}

.ticker-item {
  font-size: 17px;
  color: #d8c6a6;
  font-variant-numeric: tabular-nums;
}

.ticker-item b {
  color: #ffd166;
  font-weight: 400;
}

.ticker-item em {
  font-style: normal;
  color: #7cf29c;
}

@keyframes ticker-scroll {
  0% {
    transform: translateX(0);
  }

  100% {
    transform: translateX(-50%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ticker-track {
    animation: none;
  }
}
</style>
