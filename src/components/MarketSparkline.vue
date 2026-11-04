<template>
  <svg
    class="market-sparkline"
    :class="trend"
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    role="img"
    aria-hidden="true"
  >
    <line
      v-if="baselineY !== null"
      class="market-sparkline-baseline"
      :x1="0"
      :x2="width"
      :y1="baselineY"
      :y2="baselineY"
      stroke-dasharray="4 4"
    />
    <polyline
      v-if="linePoints"
      :points="linePoints"
      fill="none"
      :stroke-width="strokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  values: { type: Array, default: () => [] },
  width: { type: Number, default: 56 },
  height: { type: Number, default: 18 },
  strokeWidth: { type: Number, default: 1.6 },
  baseline: { type: Number, default: null },
});

const series = computed(() =>
  (Array.isArray(props.values) ? props.values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
);

const trend = computed(() => {
  const list = series.value;

  if (list.length < 2) {
    return "";
  }

  return list[list.length - 1] >= list[0] ? "up" : "down";
});

const baselineValue = computed(() => {
  const { baseline } = props;

  if (baseline === null || baseline === undefined || baseline === "") {
    return NaN;
  }

  return Number(baseline);
});

const scale = computed(() => {
  const list = series.value;

  if (list.length < 2) {
    return null;
  }

  const baseline = baselineValue.value;
  const numbers = Number.isFinite(baseline) ? [...list, baseline] : list;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const span = max - min || 1;
  const pad = Math.max(1, Number(props.strokeWidth) || 1);
  const innerWidth = Math.max(1, props.width - pad * 2);
  const innerHeight = Math.max(1, props.height - pad * 2);

  return {
    pad,
    innerWidth,
    innerHeight,
    toY: (value) => pad + innerHeight - ((value - min) / span) * innerHeight,
  };
});

const linePoints = computed(() => {
  const geometry = scale.value;

  if (!geometry) {
    return "";
  }

  return series.value
    .map((value, index) => {
      const x =
        geometry.pad +
        (geometry.innerWidth * index) / (series.value.length - 1);

      return `${x.toFixed(1)},${geometry.toY(value).toFixed(1)}`;
    })
    .join(" ");
});

const baselineY = computed(() => {
  const geometry = scale.value;
  const baseline = baselineValue.value;

  if (!geometry || !Number.isFinite(baseline)) {
    return null;
  }

  return Number(geometry.toY(baseline).toFixed(1));
});
</script>

<style scoped>
.market-sparkline {
  display: block;
  overflow: visible;
}

.market-sparkline.up {
  stroke: #4ade80;
}

.market-sparkline.down {
  stroke: #f87171;
}

.market-sparkline-baseline {
  stroke: rgba(148, 163, 184, 0.45);
  stroke-width: 1;
}
</style>
