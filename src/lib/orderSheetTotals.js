import { fetchList, nowIso, updateRow } from "@/lib/supabase";

function normalizeNumber(value) {
  return Number(value || 0);
}

function convertCreatedAtToTime(value) {
  if (!value) return 0;

  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function sortOrdersByCreatedAtAsc(orderList) {
  return [...orderList].sort((a, b) => {
    return (
      convertCreatedAtToTime(a.createdAt) - convertCreatedAtToTime(b.createdAt)
    );
  });
}

function isCountableOrder(order) {
  return String(order?.status || "") !== "CANCELLED";
}

function calculateOrderAmount(order) {
  if (Array.isArray(order?.items) && order.items.length > 0) {
    return order.items.reduce((acc, item) => {
      return acc + normalizeNumber(item.totalPrice);
    }, 0);
  }

  return normalizeNumber(order?.totalPrice);
}

function flattenPreviewItemsFromOrders(orderList) {
  const result = [];

  orderList.forEach((order) => {
    (order.items || []).forEach((item) => {
      result.push({
        productName: item.productName || "이름 없음",
        quantity: normalizeNumber(item.quantity),
        unitPrice: normalizeNumber(item.unitPrice),
        totalPrice: normalizeNumber(item.totalPrice),
      });
    });
  });

  return result;
}

function buildLatestOrderItemsPreview(orderList) {
  const flattened = flattenPreviewItemsFromOrders(orderList);

  return flattened.slice(-5).reverse();
}

function buildLatestOrderSummaryText(orderList) {
  const previewItems = buildLatestOrderItemsPreview(orderList);

  if (previewItems.length === 0) {
    return "";
  }

  return previewItems
    .map((item) => `${item.productName} ${normalizeNumber(item.quantity)}개`)
    .join(", ");
}

export async function recalculateOrderSheetTotals(orderSheetId) {
  const safeOrderSheetId = String(orderSheetId || "").trim();

  if (!safeOrderSheetId) {
    throw new Error("orderSheetId가 비어 있어요.");
  }

  const allOrders = await fetchList("orders", {
    filters: [["orderSheetId", safeOrderSheetId]],
  });

  const validOrders =
    sortOrdersByCreatedAtAsc(allOrders).filter(isCountableOrder);

  const totalAmount = validOrders.reduce((acc, order) => {
    return acc + calculateOrderAmount(order);
  }, 0);

  const latestOrderItemsPreview = buildLatestOrderItemsPreview(validOrders);
  const latestOrderSummaryText = buildLatestOrderSummaryText(validOrders);

  await updateRow("orderSheets", safeOrderSheetId, {
    totalAmount,
    orderCount: validOrders.length,
    latestOrderItemsPreview,
    latestOrderSummaryText,
    updatedAt: nowIso(),
  });

  return {
    orderSheetId: safeOrderSheetId,
    totalAmount,
    orderCount: validOrders.length,
    latestOrderItemsPreview,
    latestOrderSummaryText,
  };
}
