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

    <div class="board-body">
      <template v-if="rows.length > 0">
        <section
          v-for="group in groups"
          :key="group.key"
          class="board-group"
          :class="`is-${group.tone}`"
        >
          <header class="group-head">
            <span class="group-tag">{{ group.tag }}</span>
            <span class="group-name">{{ group.name }}</span>
            <span class="group-count">{{ group.rows.length }}종</span>
          </header>

          <div class="group-grid">
            <template
              v-for="(slot, index) in group.slots"
              :key="slotKey(group.key, slot, index)"
            >
              <article
                v-if="slot"
                class="board-card"
                :class="`is-${toneOf(slot.row.changePct)}`"
              >
                <div class="card-top">
                  <span class="card-rank">{{ slot.rank }}</span>
                  <span class="card-name">{{ slot.row.productName }}</span>
                </div>

                <span class="card-price">
                  {{ formatNumber(slot.row.price)
                  }}<span class="price-unit">원</span>
                </span>

                <div class="card-side">
                  <span class="card-change">
                    {{ arrowOf(slot.row.changePct) }}
                    {{ formatPct(slot.row.changePct) }}
                  </span>
                  <span class="card-diff">
                    {{ formatDiff(slot.row.changeAmount) }}
                  </span>
                </div>

                <svg
                  class="card-spark"
                  viewBox="0 0 100 30"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <polyline
                    :points="sparkPointsOf(slot.row.productId)"
                    :class="`spark-${toneOf(slot.row.changePct)}`"
                  />
                </svg>
              </article>

              <div v-else class="board-card is-empty">
                <span class="card-empty-text">—</span>
              </div>
            </template>
          </div>
        </section>
      </template>

      <p v-else class="board-empty">아직 시세가 열리지 않았어요.</p>
    </div>

    <footer class="board-foot">
      <div v-if="ingredients.length > 0" class="foot-ingredients">
        <span class="ing-label">재료 시세</span>
        <span
          v-for="ingredient in ingredients"
          :key="ingredient.name"
          class="ing-chip"
          :class="`is-${toneOf(ingredient.changePct)}`"
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

// TV 보드는 4열 × 4행(16칸)입니다. 위 2행 = 상승장, 아래 2행 = 하락장.
const GROUP_SIZE = 8;

const indexTone = computed(() => (props.index.changePct >= 0 ? "up" : "down"));
const indexToneClass = computed(() =>
  indexTone.value === "up" ? "is-up" : "is-down"
);
const indexPoints = computed(() => sparkPoints(props.indexSparkline));

function buildSlots(rows) {
  return Array.from({ length: GROUP_SIZE }, (unused, position) => {
    const row = rows[position];

    return row ? { row, rank: position + 1 } : null;
  });
}

const groups = computed(() => {
  const rising = props.rows
    .filter((row) => (Number(row.changePct) || 0) >= 0)
    .sort((first, second) => second.changePct - first.changePct)
    .slice(0, GROUP_SIZE);
  const falling = props.rows
    .filter((row) => (Number(row.changePct) || 0) < 0)
    .sort((first, second) => first.changePct - second.changePct)
    .slice(0, GROUP_SIZE);

  return [
    {
      key: "rise",
      tone: "up",
      tag: "▲",
      name: "상승장",
      rows: rising,
      slots: buildSlots(rising),
    },
    {
      key: "fall",
      tone: "down",
      tag: "▼",
      name: "하락장",
      rows: falling,
      slots: buildSlots(falling),
    },
  ];
});

function slotKey(groupKey, slot, index) {
  return slot ? slot.row.productId : `${groupKey}-empty-${index}`;
}

// 상승=빨강, 하락=파랑, 보합=중립 (국내 증시 표기와 동일)
function toneOf(changePct) {
  const safe = Number(changePct) || 0;

  if (safe > 0) {
    return "up";
  }

  return safe < 0 ? "down" : "flat";
}

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

  if (safe === 0) {
    return "0.0%";
  }

  return `${safe > 0 ? "+" : ""}${safe.toFixed(1)}%`;
}

function formatDiff(value) {
  const safe = Math.round(Number(value) || 0);

  if (safe === 0) {
    return "0원";
  }

  return `${safe > 0 ? "+" : ""}${numberFormatter.format(safe)}원`;
}

function arrowOf(value) {
  const safe = Number(value) || 0;

  if (safe > 0) {
    return "▲";
  }

  return safe < 0 ? "▼" : "–";
}
</script>

<style scoped>
.market-board {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  box-sizing: border-box;
  background: #100b08;
  box-shadow: inset 0 0 0 6px #120b10;
  font-family: inherit;
  color: #f6ecd8;
  /* 국내 증시 표기: 상승 = 빨강, 하락 = 파랑 */
  --up: #ff5555;
  --up-soft: #ff9a9a;
  --up-frame: #7a2222;
  --down: #4d94ff;
  --down-soft: #9cc4ff;
  --down-frame: #1f4a8a;
  --flat: #b9a78c;
  --flat-frame: #4a3a26;
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
  color: var(--up);
}

.head-index.is-down .index-value,
.head-index.is-down .index-change {
  color: var(--down);
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
  stroke: var(--up);
  stroke-width: 2.5;
  stroke-linejoin: miter;
  vector-effect: non-scaling-stroke;
}

.spark-down {
  fill: none;
  stroke: var(--down);
  stroke-width: 2.5;
  stroke-linejoin: miter;
  vector-effect: non-scaling-stroke;
}

.spark-flat {
  fill: none;
  stroke: var(--flat);
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
  color: #2b1c05;
  background: #ffd166;
  box-shadow: 3px 3px 0 #7a5714;
}

.meta-text {
  font-size: 15px;
  color: #c9a26a;
}

.board-body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

/* 위 2행 = 상승장, 아래 2행 = 하락장 (4열 × 4행) */
.board-group {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.group-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 12px;
  background: #16100a;
  box-shadow: inset 0 0 0 3px #3a2818;
}

.group-tag {
  font-size: 18px;
  line-height: 1;
}

.group-name {
  font-size: 19px;
  letter-spacing: 0.08em;
}

.group-count {
  margin-left: auto;
  font-size: 14px;
  color: #a98b64;
}

.board-group.is-up .group-head {
  box-shadow: inset 0 0 0 3px var(--up-frame);
}

.board-group.is-up .group-tag,
.board-group.is-up .group-name {
  color: var(--up);
}

.board-group.is-down .group-head {
  box-shadow: inset 0 0 0 3px var(--down-frame);
}

.board-group.is-down .group-tag,
.board-group.is-down .group-name {
  color: var(--down);
}

.group-grid {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 8px;
  min-height: 0;
}

.board-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px 0;
  box-sizing: border-box;
  background: #17100a;
  box-shadow: inset 0 0 0 3px #3a2818;
  overflow: hidden;
}

.board-card.is-up {
  background: #1b0e0e;
  box-shadow: inset 0 0 0 3px var(--up-frame);
}

.board-card.is-down {
  background: #0c1220;
  box-shadow: inset 0 0 0 3px var(--down-frame);
}

.board-card.is-empty {
  align-items: center;
  justify-content: center;
  padding: 0;
  box-shadow: inset 0 0 0 3px var(--flat-frame);
}

.card-empty-text {
  font-size: 22px;
  color: #55452f;
}

.card-top {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.card-rank {
  flex: 0 0 auto;
  font-size: 14px;
  color: #8a6a44;
  font-variant-numeric: tabular-nums;
}

.card-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 19px;
  color: #ffe9c2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-price {
  font-size: 27px;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  color: #f6ecd8;
}

.price-unit {
  margin-left: 2px;
  font-size: 16px;
  color: #c9a26a;
}

.card-side {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-variant-numeric: tabular-nums;
}

.card-change {
  font-size: 18px;
}

.board-card.is-up .card-change {
  color: var(--up-soft);
}

.board-card.is-down .card-change {
  color: var(--down-soft);
}

.board-card.is-flat .card-change {
  color: var(--flat);
}

.card-diff {
  font-size: 13px;
  color: #a98b64;
}

.card-spark {
  width: calc(100% + 20px);
  height: 32px;
  margin: auto -10px 0;
  overflow: visible;
}

.board-empty {
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
  color: var(--up-soft);
}

.ing-chip.is-down {
  color: var(--down-soft);
}

.ing-chip.is-flat {
  color: var(--flat);
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
  color: #ffd166;
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
