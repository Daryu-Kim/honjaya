// 실시간 시세(주식형) 엔진 — 순수 계산 모듈.
//
// 설계 원칙
//  * DB 쓰기 없이 "시각 + seed + 최근 주문" 만으로 가격이 결정됩니다.
//    => TV / 손님 / 태블릿이 같은 초에 같은 가격을 계산합니다.
//  * 파동 = 저주파 노이즈(완만한 추세) + 중/고주파 노이즈(픽셀처럼 툭툭 튀는 움직임)
//  * 압력 = 최근 판매량(수요) + 레시피 재료 시세 전파(연쇄 작용)
//  * 100원 단위 반올림, base_price 대비 maxChangePct 범위로 제한
import { buildRecipeGraph } from "./recipeGraph.js";

const DEMAND_LOOKBACK_MS = 30 * 60 * 1000;
const DEMAND_DECAY_MS = 12 * 60 * 1000;
const DEMAND_BUCKET_MS = 60 * 1000;

export const DEFAULT_MARKET_CONFIG = {
  enabled: false,
  applyToOrders: true,
  tickSeconds: 1,
  maxChangePct: 60,
  volatility: 1,
  demandWeight: 1,
  chainWeight: 1,
  demandTarget: 4,
  showIngredients: true,
  categoryIds: [],
  seed: "honjaya-market",
  startedAt: "",
  businessDate: "",
  frozenUntil: "",
  aliases: {},
  updatedAt: "",
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function numberIn(value, fallback, min, max) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return clamp(parsed, min, max);
}

export function normalizeMarketConfig(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const aliases =
    source.aliases && typeof source.aliases === "object" ? source.aliases : {};

  return {
    enabled: source.enabled === true,
    applyToOrders: source.applyToOrders !== false,
    tickSeconds: numberIn(source.tickSeconds, 1, 1, 10),
    maxChangePct: numberIn(source.maxChangePct, 60, 5, 200),
    volatility: numberIn(source.volatility, 1, 0.2, 3),
    demandWeight: numberIn(source.demandWeight, 1, 0, 3),
    chainWeight: numberIn(source.chainWeight, 1, 0, 3),
    demandTarget: numberIn(source.demandTarget, 4, 1, 40),
    showIngredients: source.showIngredients !== false,
    categoryIds: Array.isArray(source.categoryIds)
      ? source.categoryIds.map((id) => String(id)).filter(Boolean)
      : [],
    seed: String(source.seed || DEFAULT_MARKET_CONFIG.seed),
    startedAt: String(source.startedAt || ""),
    businessDate: String(source.businessDate || ""),
    frozenUntil: String(source.frozenUntil || ""),
    aliases: { ...aliases },
    updatedAt: String(source.updatedAt || ""),
  };
}

export function getProductCategoryIds(product) {
  const ids = new Set();

  if (Array.isArray(product?.categoryIds)) {
    product.categoryIds.forEach((id) => {
      if (id) {
        ids.add(String(id));
      }
    });
  }

  if (product?.categoryId) {
    ids.add(String(product.categoryId));
  }

  return [...ids];
}

export function isMarketProduct(product, config = DEFAULT_MARKET_CONFIG) {
  if (!product) {
    return false;
  }

  if (product.isActive === false || product.isDeleted === true) {
    return false;
  }

  if (Number(product.basePrice || 0) <= 0) {
    return false;
  }

  const categoryIds = config.categoryIds || [];

  if (categoryIds.length === 0) {
    return true;
  }

  return getProductCategoryIds(product).some((id) => categoryIds.includes(id));
}

/* ------------------------------------------------------------------ */
/* 결정론적 노이즈                                                    */
/* ------------------------------------------------------------------ */

export function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function random01(seed) {
  return hashString(seed) / 4294967296;
}

// 정수 격자 사이를 부드럽게 잇는 값 노이즈 (0~1)
export function smoothNoise(seed, position) {
  const base = Math.floor(position);
  const fraction = position - base;
  const from = random01(`${seed}:${base}`);
  const to = random01(`${seed}:${base + 1}`);
  const eased = fraction * fraction * (3 - 2 * fraction);

  return from + (to - from) * eased;
}

function octave(seed, position) {
  return (smoothNoise(seed, position) - 0.5) * 2;
}

function toMillis(value) {
  if (!value) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

/* ------------------------------------------------------------------ */
/* 엔진                                                               */
/* ------------------------------------------------------------------ */

export function createMarketEngine({
  config,
  products = [],
  orders = [],
} = {}) {
  const settings = normalizeMarketConfig(config);
  const tradableProducts = (products || []).filter((product) =>
    isMarketProduct(product, settings)
  );
  const productMap = new Map(
    tradableProducts.map((product) => [product.id, product])
  );
  const graph = buildRecipeGraph(tradableProducts, {
    aliases: settings.aliases,
  });
  const demandCache = new Map();

  function isFrozen(ts) {
    if (!settings.frozenUntil) {
      return false;
    }

    const until = toMillis(settings.frozenUntil);

    return until > ts;
  }

  function isActive(ts) {
    return settings.enabled && !isFrozen(ts);
  }

  function demandSnapshot(ts) {
    const bucket = Math.floor(ts / DEMAND_BUCKET_MS) * DEMAND_BUCKET_MS;
    const cached = demandCache.get(bucket);

    if (cached) {
      return cached;
    }

    const windowStart = bucket - DEMAND_LOOKBACK_MS;
    const byProduct = new Map();
    let total = 0;

    (orders || []).forEach((order) => {
      const created = toMillis(order?.createdAt);

      if (!created || created < windowStart || created > bucket) {
        return;
      }

      const weight = Math.exp(-(bucket - created) / DEMAND_DECAY_MS);
      const items = Array.isArray(order?.items) ? order.items : [];

      items.forEach((item) => {
        const productId = item?.productId;
        const quantity = Number(item?.quantity || 0);

        if (!productId || !quantity) {
          return;
        }

        byProduct.set(
          productId,
          (byProduct.get(productId) || 0) + quantity * weight
        );
        total += quantity * weight;
      });
    });

    const ingredientHeat = new Map();
    let heatTotal = 0;
    let heatCount = 0;

    graph.byIngredient.forEach((entries, name) => {
      let score = 0;

      entries.forEach((entry) => {
        score += (byProduct.get(entry.productId) || 0) * entry.share;
      });

      ingredientHeat.set(name, score);

      if (score > 0) {
        heatTotal += score;
        heatCount += 1;
      }
    });

    // 사용 중인 재료 사이의 상대 수요로 정규화합니다.
    // 아예 안 팔린 재료는 0(압력 없음)으로 두어, 조용한 재료만 쓰는 메뉴가
    // 부당하게 하락하지 않도록 합니다.
    const averageHeat = heatTotal / (heatCount || 1);
    const ingredientZ = new Map();

    ingredientHeat.forEach((score, name) => {
      if (score <= 0) {
        ingredientZ.set(name, 0);
        return;
      }

      ingredientZ.set(
        name,
        clamp((score - averageHeat) / (averageHeat + 1.2), -1, 1)
      );
    });

    const snapshot = {
      byProduct,
      total,
      ingredientHeat,
      ingredientZ,
    };

    if (demandCache.size > 96) {
      demandCache.clear();
    }

    demandCache.set(bucket, snapshot);

    return snapshot;
  }

  function pressureOf(product, demand) {
    const soldQty = demand.byProduct.get(product.id) || 0;
    const target = Math.max(1, Number(settings.demandTarget || 4));
    const demandZ = clamp((soldQty - target) / (target + 2), 0, 1);
    const entries = graph.byProduct.get(product.id) || [];
    let chainZ = 0;

    entries.forEach((entry) => {
      chainZ += entry.share * (demand.ingredientZ.get(entry.name) || 0);
    });

    return (
      0.11 * settings.demandWeight * demandZ +
      0.12 * settings.chainWeight * clamp(chainZ, -1, 1)
    );
  }

  function priceAt(product, ts) {
    const basePrice = Number(product?.basePrice || 0);

    if (basePrice <= 0) {
      return 0;
    }

    if (!isActive(ts)) {
      return basePrice;
    }

    const seed = `${settings.seed}:${product.id}`;
    const seconds = ts / 1000;
    const wave =
      0.58 * octave(`${seed}:slow`, seconds / 210) +
      0.27 * octave(`${seed}:mid`, seconds / 37) +
      0.15 * octave(`${seed}:fast`, seconds / 7);
    const jitter =
      (random01(`${seed}:jitter:${Math.floor(seconds)}`) - 0.5) * 2;
    const demand = demandSnapshot(ts);
    const pressure = pressureOf(product, demand);
    const factor =
      1 + (0.26 * wave + 0.008 * jitter) * settings.volatility + pressure;
    const limit = settings.maxChangePct / 100;
    const bounded = clamp(factor, 1 - limit, 1 + limit);
    const price = Math.round((basePrice * bounded) / 100) * 100;

    return Math.max(100, price);
  }

  function buildRow(product, ts) {
    const basePrice = Number(product.basePrice || 0);
    const price = priceAt(product, ts);
    const changeAmount = price - basePrice;
    const changePct = basePrice > 0 ? (changeAmount / basePrice) * 100 : 0;

    return {
      productId: product.id,
      productName: product.productName || "메뉴",
      basePrice,
      price,
      changeAmount,
      changePct,
    };
  }

  function priceOf(productId, basePrice, ts = Date.now()) {
    const product = productMap.get(productId);

    if (!product) {
      return Number(basePrice || 0);
    }

    return priceAt(product, ts);
  }

  function rows(ts = Date.now(), options = {}) {
    const { limit } = options;
    const list = tradableProducts
      .map((product) => buildRow(product, ts))
      .sort((first, second) => second.changePct - first.changePct);

    return Number.isFinite(limit) && limit > 0 ? list.slice(0, limit) : list;
  }

  function rowOf(productId, ts = Date.now()) {
    const product = productMap.get(productId);

    return product ? buildRow(product, ts) : null;
  }

  function indexValueAt(ts) {
    if (!isActive(ts)) {
      return { value: 1000, changePct: 0 };
    }

    let priceSum = 0;
    let baseSum = 0;

    tradableProducts.forEach((product) => {
      priceSum += priceAt(product, ts);
      baseSum += Number(product.basePrice || 0);
    });

    const value = baseSum > 0 ? (priceSum / baseSum) * 1000 : 1000;

    return {
      value,
      changePct: baseSum > 0 ? ((priceSum - baseSum) / baseSum) * 100 : 0,
    };
  }

  function sparkline(productId, ts = Date.now(), options = {}) {
    const { points = 24, stepMs = 15000 } = options;
    const product = productMap.get(productId);

    if (!product) {
      return [];
    }

    const result = [];

    for (let index = points - 1; index >= 0; index -= 1) {
      result.push(priceAt(product, ts - index * stepMs));
    }

    return result;
  }

  function indexSparkline(ts = Date.now(), options = {}) {
    const { points = 24, stepMs = 15000 } = options;
    const result = [];

    for (let index = points - 1; index >= 0; index -= 1) {
      result.push(indexValueAt(ts - index * stepMs).value);
    }

    return result;
  }

  function ingredientRows(ts = Date.now(), options = {}) {
    const { limit = 4 } = options;

    if (!settings.enabled) {
      return [];
    }

    const demand = demandSnapshot(ts);

    return [...graph.byIngredient.keys()]
      .map((name) => {
        const heatZ = demand.ingredientZ.get(name) || 0;
        const seed = `${settings.seed}:ingredient:${name}`;
        const seconds = ts / 1000;
        const wave =
          0.7 * octave(`${seed}:slow`, seconds / 150) +
          0.3 * octave(`${seed}:mid`, seconds / 23);
        const factor = clamp(
          1 +
            0.18 * wave * settings.volatility +
            0.16 * settings.chainWeight * heatZ,
          0.55,
          1.8
        );

        return {
          name,
          factor,
          changePct: (factor - 1) * 100,
        };
      })
      .sort(
        (first, second) =>
          Math.abs(second.changePct) - Math.abs(first.changePct)
      )
      .slice(0, limit);
  }

  function recentTrades(options = {}) {
    const { limit = 8 } = options;
    const trades = [];

    (orders || []).forEach((order) => {
      const created = toMillis(order?.createdAt);

      if (!created) {
        return;
      }

      const items = Array.isArray(order?.items) ? order.items : [];

      items.forEach((item, index) => {
        const unitPrice = Number(item?.unitPrice || 0);

        if (!item?.productName) {
          return;
        }

        trades.push({
          key: `${order.id || created}-${index}`,
          tableNumber: String(order.tableNumber || ""),
          productName: String(item.productName),
          quantity: Number(item.quantity || 0),
          unitPrice,
          createdAt: created,
        });
      });
    });

    return trades
      .sort((first, second) => second.createdAt - first.createdAt)
      .slice(0, limit);
  }

  return {
    config: settings,
    products: tradableProducts,
    isActive,
    isFrozen,
    isEligible: (productId) => productMap.has(productId),
    priceAt: (product, ts = Date.now()) => priceAt(product, ts),
    priceOf,
    rowOf,
    rows,
    indexValueAt,
    sparkline,
    indexSparkline,
    ingredientRows,
    recentTrades,
  };
}
