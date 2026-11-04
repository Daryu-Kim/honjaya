// 레시피 재료 그래프.
// products[].recipeInfo.ingredients = [{ name, amount }] 를 이용해
// "어떤 재료가 어떤 메뉴에 얼마만큼 들어가는지" 를 계산합니다.
// 시세 엔진이 재료 시세를 메뉴 가격으로 전파(연쇄 작용)할 때 사용합니다.

const DEFAULT_ML_PER_UNIT = 15;
const FULL_AMOUNT_ML = 30;

// 단위별 ml 환산. 순서가 중요합니다(먼저 걸리는 단위 사용).
const UNIT_TABLE = [
  { pattern: /oz|온스/, ml: 29.5735 },
  { pattern: /ml|밀리리터/, ml: 1 },
  { pattern: /cc/, ml: 1 },
  { pattern: /cl/, ml: 10 },
  { pattern: /바스푼|barspoon|bsp/, ml: 5 },
  { pattern: /티스푼|tsp/, ml: 5 },
  { pattern: /테이블스푼|tbsp|스푼|spoon/, ml: 15 },
  { pattern: /대시|dash/, ml: 3 },
  { pattern: /방울|drop/, ml: 0.05 },
  { pattern: /장|잎|leaf|leaves/, ml: 2 },
  { pattern: /조각|슬라이스|slice/, ml: 8 },
  { pattern: /개|pc|piece/, ml: 8 },
  { pattern: /그램|g\b/, ml: 1 },
  { pattern: /cm|센티/, ml: 3 },
];

// 브랜드/표기 차이를 하나의 재료로 묶습니다. (관리자가 app_settings 로 덮어쓸 수 있음)
export const DEFAULT_INGREDIENT_ALIASES = {
  바톤보드카: "보드카",
  바톤진: "진",
  스미노프: "보드카",
  스미노프애플: "애플보드카",
  앱솔루트: "보드카",
  봄베이사파이어: "진",
  봄베이: "진",
  소다수: "탄산수",
  클럽소다: "탄산수",
};

// "0.75 oz", "1 바스푼 ~ 0.25 oz", "8-10장", "full" 같은 자유 문자열을 ml 근사치로 바꿉니다.
export function parseIngredientAmount(rawText) {
  const text = String(rawText || "")
    .toLowerCase()
    .replace(/[~〜]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return { ml: DEFAULT_ML_PER_UNIT, unitKnown: false };
  }

  if (/full|가득|풀/.test(text)) {
    return { ml: FULL_AMOUNT_ML, unitKnown: true };
  }

  const numbers = text.match(/\d+(?:[.,]\d+)?/g);

  if (!numbers || numbers.length === 0) {
    // "약간", "적당량" 처럼 수치가 없는 경우
    return { ml: 3, unitKnown: false };
  }

  const values = numbers
    .slice(0, 2)
    .map((value) => Number(String(value).replace(",", ".")))
    .filter((value) => Number.isFinite(value));

  const amount =
    values.length > 1 ? (values[0] + values[1]) / 2 : values[0] || 0;
  const unit = UNIT_TABLE.find((entry) => entry.pattern.test(text));
  const ml = amount * (unit ? unit.ml : DEFAULT_ML_PER_UNIT);

  return {
    ml: Math.max(ml, 0.1),
    unitKnown: Boolean(unit),
  };
}

// 공백/별칭 차이를 제거한 재료 키를 만듭니다. ("심플 시럽" === "심플시럽")
export function canonicalIngredientName(name, aliases = {}) {
  const trimmed = String(name || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!trimmed) {
    return "";
  }

  const compact = trimmed.replace(/\s+/g, "");
  const merged = { ...DEFAULT_INGREDIENT_ALIASES, ...(aliases || {}) };
  const alias = merged[trimmed] || merged[compact];

  return alias ? String(alias).replace(/\s+/g, "") : compact;
}

// 상품 목록 -> { byProduct: Map<productId, [{ name, share, ml }]>, byIngredient: Map<name, [{ productId, share }]> }
export function buildRecipeGraph(products, options = {}) {
  const aliases = options.aliases || {};
  const byProduct = new Map();
  const byIngredient = new Map();

  (products || []).forEach((product) => {
    const productId = product?.id;

    if (!productId) {
      return;
    }

    const ingredients = Array.isArray(product?.recipeInfo?.ingredients)
      ? product.recipeInfo.ingredients
      : [];

    const parsed = [];

    ingredients.forEach((ingredient) => {
      const name = canonicalIngredientName(ingredient?.name, aliases);

      if (!name) {
        return;
      }

      parsed.push({ name, ml: parseIngredientAmount(ingredient?.amount).ml });
    });

    const totalMl = parsed.reduce(
      (accumulator, item) => accumulator + item.ml,
      0
    );
    const entries = parsed.map((item) => ({
      name: item.name,
      ml: item.ml,
      share: totalMl > 0 ? item.ml / totalMl : 0,
    }));

    byProduct.set(productId, entries);

    entries.forEach((entry) => {
      if (!byIngredient.has(entry.name)) {
        byIngredient.set(entry.name, []);
      }

      byIngredient.get(entry.name).push({
        productId,
        share: entry.share,
      });
    });
  });

  return { byProduct, byIngredient };
}
