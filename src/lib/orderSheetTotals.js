import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

function normalizeNumber(value) {
  return Number(value || 0);
}

function sortByCreatedAtAsc(list) {
  return [...list].sort((a, b) => {
    const aTime =
      typeof a.createdAt?.toDate === "function"
        ? a.createdAt.toDate().getTime()
        : 0;
    const bTime =
      typeof b.createdAt?.toDate === "function"
        ? b.createdAt.toDate().getTime()
        : 0;

    return aTime - bTime;
  });
}

function isCountableOrder(order) {
  return String(order.status || "") !== "CANCELLED";
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

  const ordersQuery = query(
    collection(db, "orders"),
    where("orderSheetId", "==", safeOrderSheetId)
  );

  const snapshot = await getDocs(ordersQuery);
  const allOrders = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));

  const validOrders = sortByCreatedAtAsc(allOrders).filter(isCountableOrder);

  const totalAmount = validOrders.reduce(
    (acc, order) => acc + normalizeNumber(order.totalPrice),
    0
  );

  const latestOrderItemsPreview = buildLatestOrderItemsPreview(validOrders);
  const latestOrderSummaryText = buildLatestOrderSummaryText(validOrders);

  await updateDoc(doc(db, "orderSheets", safeOrderSheetId), {
    totalAmount,
    orderCount: validOrders.length,
    latestOrderItemsPreview,
    latestOrderSummaryText,
    updatedAt: serverTimestamp(),
  });

  return {
    orderSheetId: safeOrderSheetId,
    totalAmount,
    orderCount: validOrders.length,
    latestOrderItemsPreview,
    latestOrderSummaryText,
  };
}
