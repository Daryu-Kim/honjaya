import { fetchRow } from "@/lib/supabase";

export function isBlockedOrderSheetStatus(status) {
  const safeStatus = String(status || "").trim();
  return safeStatus === "PAID" || safeStatus === "CLOSED";
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

  const data = await fetchRow("orderSheets", safeOrderSheetId);

  if (!data) {
    return {
      exists: false,
      status: "",
      data: null,
    };
  }

  return {
    exists: true,
    status: String(data.status || "").trim(),
    data,
  };
}
