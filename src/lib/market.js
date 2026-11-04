// 실시간 칵테일 시세 — Supabase 연동 + 화면 공용 피드.
//
// 시세 자체는 marketEngine.js 가 순수 계산으로 만들고, 이 파일은
//   * app_settings(id="market") 에 저장된 설정을 읽고 쓰고,
//   * 1초 틱으로 화면을 다시 그릴 수 있게 신호를 주고,
//   * products / orders 변경을 구독해 수요·연쇄 작용을 갱신합니다.
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  createMarketEngine,
  DEFAULT_MARKET_CONFIG,
  isMarketProduct,
  normalizeMarketConfig,
} from "@/lib/marketEngine";
import {
  fetchList,
  fetchRow,
  nowIso,
  subscribeTable,
  upsertRow,
} from "@/lib/supabase";

export const MARKET_SETTINGS_ID = "market";
export const MARKET_LOOKBACK_MS = 30 * 60 * 1000;

export { isMarketProduct, DEFAULT_MARKET_CONFIG, normalizeMarketConfig };

export async function fetchMarketConfig() {
  const row = await fetchRow("appSettings", MARKET_SETTINGS_ID);

  return normalizeMarketConfig(row?.value);
}

export async function saveMarketConfig(patch, options = {}) {
  const { baseConfig } = options;
  const base = baseConfig
    ? normalizeMarketConfig(baseConfig)
    : await fetchMarketConfig();
  const merged = normalizeMarketConfig({ ...base, ...(patch || {}) });
  const updatedAt = nowIso();

  // 저장 시각을 값 안에도 남겨 다른 기기가 변경을 감지할 수 있게 합니다.
  merged.updatedAt = updatedAt;

  try {
    const saved = await upsertRow("appSettings", {
      id: MARKET_SETTINGS_ID,
      value: merged,
      updatedAt,
    });

    return normalizeMarketConfig(saved?.value || merged);
  } catch (error) {
    throw new Error(
      `${
        error?.message || "시세 설정을 저장하지 못했어요."
      } (supabase/patch-011-market.sql 적용 여부를 확인해주세요.)`
    );
  }
}

function fetchMarketOrders() {
  const cutoff = new Date(Date.now() - MARKET_LOOKBACK_MS).toISOString();

  return fetchList("orders", {
    columns: ["id", "tableNumber", "items", "createdAt"],
    filters: [["createdAt", "gte", cutoff]],
    order: ["createdAt", "desc"],
    limit: 300,
  });
}

function fetchMarketProducts() {
  return fetchList("products", {
    columns: [
      "id",
      "productName",
      "categoryId",
      "categoryIds",
      "basePrice",
      "isActive",
      "isSoldOut",
      "recipeInfo",
      "deletedAt",
    ],
  });
}

// TV / 손님 / 태블릿이 함께 쓰는 시세 피드.
// 모든 화면이 같은 초에 같은 가격을 계산하므로 별도 동기화가 필요 없습니다.
export function useMarketFeed(options = {}) {
  const {
    configPollMs = 5000,
    dataPollMs = 30000,
    realtime = true,
    autoStart = true,
    minTickMs = 0,
  } = options;
  const config = ref(normalizeMarketConfig(null));
  const products = ref([]);
  const orders = ref([]);
  const nowTick = ref(Date.now());
  const loading = ref(true);
  const error = ref("");
  const stopHandlers = [];
  let tickTimer = null;

  const engine = computed(() =>
    createMarketEngine({
      config: config.value,
      products: products.value,
      orders: orders.value,
    })
  );

  const enabled = computed(() => config.value.enabled);
  const isActive = computed(() => engine.value.isActive(nowTick.value));
  const isFrozen = computed(() => engine.value.isFrozen(nowTick.value));
  const productCount = computed(() => engine.value.products.length);

  async function loadConfig() {
    try {
      config.value = await fetchMarketConfig();
      error.value = "";
    } catch (loadError) {
      error.value = loadError?.message || "시세 설정을 불러오지 못했어요.";
    }
  }

  async function loadProducts() {
    try {
      products.value = await fetchMarketProducts();
    } catch (loadError) {
      error.value = loadError?.message || "메뉴를 불러오지 못했어요.";
    }
  }

  async function loadOrders() {
    try {
      orders.value = await fetchMarketOrders();
    } catch (loadError) {
      error.value = loadError?.message || "주문을 불러오지 못했어요.";
    }
  }

  async function refresh() {
    await Promise.all([loadConfig(), loadProducts(), loadOrders()]);
    loading.value = false;
  }

  function priceOf(productId, basePrice) {
    return engine.value.priceOf(productId, basePrice, nowTick.value);
  }

  // 손님 화면/수동 주문에서 쓰는 최종 단가.
  // 시세가 꺼져 있거나 실제 주문 반영이 꺼져 있으면 기존 가격을 그대로 씁니다.
  function priceFor(product) {
    const basePrice = Number(product?.basePrice || 0);

    if (!product?.id || !config.value.applyToOrders || !isActive.value) {
      return basePrice;
    }

    return engine.value.priceOf(product.id, basePrice, nowTick.value);
  }

  // 주문 확정 시점의 단가. 화면 갱신 주기와 무관하게 "지금" 시각으로 계산합니다.
  function livePriceFor(product) {
    const basePrice = Number(product?.basePrice || 0);

    if (!product?.id || !config.value.applyToOrders || !isActive.value) {
      return basePrice;
    }

    return engine.value.priceOf(product.id, basePrice, Date.now());
  }

  // 장바구니 항목은 옵션 추가금이 이미 unitPrice에 포함되어 있으므로
  // 기본가만 시세로 갈아끼웁니다.
  function cartItemPrice(item, resolver) {
    const basePrice = Number(item?.basePrice || 0);
    const optionExtra = Number(item?.unitPrice || 0) - basePrice;

    return (
      resolver({ id: item?.productId, basePrice }) + Math.max(0, optionExtra)
    );
  }

  function priceForCartItem(item) {
    return cartItemPrice(item, priceFor);
  }

  function livePriceForCartItem(item) {
    return cartItemPrice(item, livePriceFor);
  }

  function rows(limit) {
    return engine.value.rows(nowTick.value, { limit });
  }

  function rowOf(productId) {
    return engine.value.rowOf(productId, nowTick.value);
  }

  function index() {
    return engine.value.indexValueAt(nowTick.value);
  }

  function sparkline(productId, points, stepMs) {
    return engine.value.sparkline(productId, nowTick.value, {
      points,
      stepMs,
    });
  }

  function indexSparkline(points, stepMs) {
    return engine.value.indexSparkline(nowTick.value, { points, stepMs });
  }

  function ingredients(limit) {
    return engine.value.ingredientRows(nowTick.value, { limit });
  }

  function trades(limit) {
    return engine.value.recentTrades({ limit });
  }

  if (autoStart) {
    onMounted(() => {
      // 설정 반영이 늦어도 화면이 멈추지 않도록 1초 고정 타이머로 틱을 돌립니다.
      tickTimer = setInterval(() => {
        const stepMs = Math.max(minTickMs, config.value.tickSeconds * 1000);

        if (Date.now() - nowTick.value >= stepMs) {
          nowTick.value = Date.now();
        }
      }, 1000);

      if (realtime) {
        stopHandlers.push(
          subscribeTable("appSettings", loadConfig, {
            filter: ["id", MARKET_SETTINGS_ID],
            pollMs: configPollMs,
          }),
          subscribeTable("products", loadProducts, { pollMs: dataPollMs }),
          subscribeTable("orders", loadOrders, { pollMs: dataPollMs })
        );
        loading.value = false;
      } else {
        refresh();
      }
    });

    onUnmounted(() => {
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
      }

      stopHandlers.splice(0).forEach((stop) => stop());
    });
  }

  return {
    config,
    products,
    orders,
    nowTick,
    loading,
    error,
    engine,
    enabled,
    isActive,
    isFrozen,
    productCount,
    refresh,
    priceOf,
    priceFor,
    livePriceFor,
    priceForCartItem,
    livePriceForCartItem,
    rows,
    rowOf,
    index,
    sparkline,
    indexSparkline,
    ingredients,
    trades,
  };
}
