const DEMOGRAPHIC_ORDER_SHEET_TAGS = [
  "남자",
  "여자",
  "혼성",
  "20대",
  "30대",
  "40대",
  "50대 이상",
];

export function isDemographicOrderSheetTag(tag) {
  return DEMOGRAPHIC_ORDER_SHEET_TAGS.includes(String(tag || "").trim());
}

export function normalizeOrderSheetTags(tags) {
  if (!Array.isArray(tags)) return [];

  return [
    ...new Set(
      tags
        .map((tag) => String(tag || "").trim())
        .filter((tag) => tag && !isDemographicOrderSheetTag(tag))
    ),
  ];
}
