// 영업일 시세 히스토리 — 태블릿이 5분마다 남긴 지수 샘플을 쌓고,
// 리포트에 쓸 곡선/요약으로 바꿔 줍니다.
//
// 가격 엔진은 (설정 + 메뉴 + 주문) 만으로 같은 값을 다시 계산할 수 있어서
// 기록이 비어 있는 구간도 곡선으로 복원할 수 있습니다. 그래서 저장은
// "지수 샘플"만 남기고 메뉴별 과거 가격은 저장하지 않습니다.
import { getCurrentBusinessDateInput } from "@/lib/businessDay";
import { fetchList, nowIso, upsertRow } from "@/lib/supabase";

export const MARKET_HISTORY_SAMPLE_MS = 5 * 60 * 1000;
export const MARKET_HISTORY_MAX_SAMPLES = 288;
export const MARKET_HISTORY_DAYS = 14;
export const MARKET_HISTORY_MAX_POINTS = 320;

function roundValue(value, digits = 1) {
  const factor = 10 ** digits;

  return Math.round(Number(value || 0) * factor) / factor;
}

function sampleBucket(ts) {
  return (
    Math.floor(Number(ts || 0) / MARKET_HISTORY_SAMPLE_MS) *
    MARKET_HISTORY_SAMPLE_MS
  );
}

export function currentMarketBusinessDate(date = new Date()) {
  return getCurrentBusinessDateInput(date);
}

// 지금 시점의 지수 한 점.
export function createIndexSample(engine, ts = Date.now()) {
  const index = engine.indexValueAt(ts);

  return {
    t: ts,
    i: roundValue(index.value, 1),
    c: roundValue(index.changePct, 2),
  };
}

// 지정 구간을 5분 간격으로 되짚어 곡선을 만듭니다 (기록이 없을 때 사용).
export function buildIndexSeries(engine, options = {}) {
  const {
    from,
    to = Date.now(),
    stepMs = MARKET_HISTORY_SAMPLE_MS,
    limit = MARKET_HISTORY_MAX_POINTS,
  } = options;
  const start = Number(from) || 0;
  const points = [];

  if (!engine || !Number.isFinite(start) || start >= to || stepMs <= 0) {
    return points;
  }

  for (let ts = start; ts <= to; ts += stepMs) {
    const index = engine.indexValueAt(ts);

    points.push({
      t: ts,
      i: roundValue(index.value, 1),
      c: roundValue(index.changePct, 2),
    });

    if (points.length >= limit) {
      break;
    }
  }

  return points;
}

// 같은 5분 칸의 샘플은 마지막 값으로 덮어씁니다.
export function mergeIndexSample(samples, sample) {
  const target = Number(sample?.t || 0);

  if (!target) {
    return Array.isArray(samples) ? samples : [];
  }

  const bucket = sampleBucket(target);
  const list = (Array.isArray(samples) ? samples : []).filter(
    (entry) => sampleBucket(entry?.t) !== bucket
  );

  list.push({ ...sample, t: bucket });
  list.sort((first, second) => first.t - second.t);

  return list.slice(-MARKET_HISTORY_MAX_SAMPLES);
}

// 실측 기록과 계산 복원 곡선을 시간순으로 합칩니다.
export function mergeIndexSeries(base, overlay) {
  const map = new Map();

  (Array.isArray(base) ? base : []).forEach((point) => {
    map.set(sampleBucket(point?.t), point);
  });
  (Array.isArray(overlay) ? overlay : []).forEach((point) => {
    map.set(sampleBucket(point?.t), point);
  });

  return [...map.values()]
    .filter((point) => Number.isFinite(Number(point?.t)))
    .sort((first, second) => Number(first.t) - Number(second.t))
    .slice(-MARKET_HISTORY_MAX_SAMPLES);
}

export function summarizeIndexSamples(samples) {
  const list = (Array.isArray(samples) ? samples : []).filter((entry) =>
    Number.isFinite(Number(entry?.i))
  );

  if (list.length === 0) {
    return null;
  }

  const values = list.map((entry) => Number(entry.i));
  const open = values[0];
  const close = values[values.length - 1];

  return {
    open: roundValue(open, 1),
    close: roundValue(close, 1),
    high: roundValue(Math.max(...values), 1),
    low: roundValue(Math.min(...values), 1),
    changePct: open > 0 ? roundValue(((close - open) / open) * 100, 2) : 0,
    points: list.length,
  };
}

function toHistoryEntry(row) {
  const samples = Array.isArray(row?.samples) ? row.samples : [];

  return {
    businessDate: row?.businessDate || row?.id || "",
    samples,
    summary: row?.summary || summarizeIndexSamples(samples),
    updatedAt: row?.updatedAt || "",
  };
}

export async function fetchMarketHistory(options = {}) {
  const { limit = MARKET_HISTORY_DAYS } = options;
  const rows = await fetchList("marketHistory", {
    columns: ["id", "samples", "summary", "updatedAt"],
    order: ["id", "desc"],
    limit,
  });

  return rows.map(toHistoryEntry).filter((entry) => entry.businessDate);
}

export async function saveMarketHistoryEntry(entry) {
  const samples = Array.isArray(entry?.samples) ? entry.samples : [];
  const payload = {
    id: String(entry?.businessDate || "").trim(),
    samples,
    summary: entry?.summary || summarizeIndexSamples(samples),
    updatedAt: nowIso(),
  };

  if (!payload.id) {
    throw new Error("시세 기록에 영업일이 없어요.");
  }

  return toHistoryEntry(await upsertRow("marketHistory", payload));
}
