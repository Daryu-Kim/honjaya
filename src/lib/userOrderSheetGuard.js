import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export function isBlockedOrderSheetStatus(status) {
  const safeStatus = String(status || "").trim();
  return safeStatus === "PAID" || safeStatus === "CLOSED";
}

export function isUsableOrderSheetStatus(status) {
  const safeStatus = String(status || "").trim();
  return safeStatus === "OPEN" || safeStatus === "PAYMENT_REQUESTED";
}

export async function getOrderSheetStatus(orderSheetId) {
  const safeOrderSheetId = String(orderSheetId || "").trim();

  if (!safeOrderSheetId) {
    return {
      exists: false,
      status: "",
      data: null,
    };
  }

  const ref = doc(db, "orderSheets", safeOrderSheetId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return {
      exists: false,
      status: "",
      data: null,
    };
  }

  const data = snap.data();

  return {
    exists: true,
    status: String(data.status || "").trim(),
    data,
  };
}
