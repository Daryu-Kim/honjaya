import {
  deleteRow,
  fetchRow,
  insertRow,
  nowIso,
  reserveSequenceNo,
  updateRow,
  upsertRow,
} from "@/lib/supabase";
import { recordSheetPayment } from "@/lib/payments";

export async function finalizeOrderSheetCleanup({ orderSheetId, tableNumber }) {
  const safeOrderSheetId = String(orderSheetId || "").trim();

  if (!safeOrderSheetId) {
    throw new Error("orderSheetId가 비어 있어요.");
  }

  await updateRow("orderSheets", safeOrderSheetId, {
    status: "CLOSED",
    closedAt: nowIso(),
    updatedAt: nowIso(),
  });

  // 주문서를 닫아도 active_order_sheets 행이 남으면 손님 입장이 계속 이 주문서를
  // 가리키므로, 테이블 번호를 알 때는 매핑도 함께 정리합니다.
  const safeTableNumber = normalizeTableNumber(tableNumber);

  if (safeTableNumber) {
    await removeActiveOrderSheetForSheet({
      tableNumber: safeTableNumber,
      orderSheetId: safeOrderSheetId,
    });
  }
}

async function findReusableActiveOrderSheet(activeKeyCandidates) {
  for (const candidateKey of activeKeyCandidates) {
    const activeRow = await fetchRow("activeOrderSheets", candidateKey);
    const currentOrderSheetId = String(activeRow?.orderSheetId || "").trim();

    if (!currentOrderSheetId) {
      continue;
    }

    const currentOrderSheet = await fetchRow(
      "orderSheets",
      currentOrderSheetId
    );

    if (
      currentOrderSheet &&
      isReusableOrderSheetStatus(String(currentOrderSheet.status || ""))
    ) {
      return currentOrderSheet;
    }
  }

  return null;
}

async function removeActiveOrderSheetForSheet({ tableNumber, orderSheetId }) {
  const activeKeyCandidates = buildActiveOrderSheetKeyCandidates(tableNumber);

  for (const activeKey of activeKeyCandidates) {
    const activeRow = await fetchRow("activeOrderSheets", activeKey);

    if (String(activeRow?.orderSheetId || "") === orderSheetId) {
      await deleteRow("activeOrderSheets", activeKey);
    }
  }
}

function formatSequenceNo(sequenceNo) {
  return String(sequenceNo).padStart(6, "0");
}

export function normalizeTableNumber(value) {
  const digits = String(value ?? "")
    .trim()
    .replace(/[^\d]/g, "");

  return digits.replace(/^0+(?=\d)/, "");
}

export function buildActiveOrderSheetKey(tableNumber) {
  return `table_${normalizeTableNumber(tableNumber)}`;
}

function buildActiveOrderSheetKeyCandidates(tableNumber) {
  const digits = String(tableNumber ?? "")
    .trim()
    .replace(/[^\d]/g, "");
  const normalized = normalizeTableNumber(digits);

  if (!normalized) {
    return [];
  }

  // normalized first, then legacy zero-padded keys (e.g. "01", "001")
  const variants = new Set([
    normalized,
    normalized.padStart(2, "0"),
    normalized.padStart(3, "0"),
    digits,
  ]);

  return [...variants].map((variant) => `table_${variant}`);
}

export function isReusableOrderSheetStatus(status) {
  return status === "OPEN";
}

export const TABLE_NICKNAME_MAX_UNITS = 16;

const HANGUL_CHAR_PATTERN = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/;

export function countTableNicknameUnits(nickname) {
  return [...String(nickname || "").trim()].reduce(
    (total, char) => total + (HANGUL_CHAR_PATTERN.test(char) ? 2 : 1),
    0
  );
}

export function getTableNicknameErrorMessage(nickname) {
  if (countTableNicknameUnits(nickname) > TABLE_NICKNAME_MAX_UNITS) {
    return "닉네임은 한글 8자(영문·숫자 16자)까지 입력할 수 있어요.";
  }

  return "";
}

export async function getOrCreateOpenOrderSheet(tableNumber) {
  const safeTableNumber = normalizeTableNumber(tableNumber);

  if (!safeTableNumber) {
    throw new Error("테이블 번호가 없어요.");
  }

  const now = nowIso();
  const businessDate = now;
  const displayName = `No.${safeTableNumber}`;
  const activeKey = buildActiveOrderSheetKey(safeTableNumber);
  const activeKeyCandidates =
    buildActiveOrderSheetKeyCandidates(safeTableNumber);
  const reusableOrderSheet = await findReusableActiveOrderSheet(
    activeKeyCandidates
  );

  if (reusableOrderSheet) {
    return {
      orderSheetId: reusableOrderSheet.id,
      displayName,
      tableNickname: String(reusableOrderSheet.tableNickname || ""),
      reused: true,
      businessDate,
    };
  }

  const nextSequenceNo = await reserveSequenceNo("orderSheet");
  const orderSheetId = formatSequenceNo(nextSequenceNo);

  await insertRow("orderSheets", {
    id: orderSheetId,
    businessDate,
    sequenceNo: nextSequenceNo,
    tableNumber: safeTableNumber,
    displayName,
    tableNickname: "",
    status: "OPEN", // OPEN, CLOSED
    paymentStatus: "UNPAID", // UNPAID, COMPLETED
    paymentMethod: "",
    totalAmount: 0,
    orderCount: 0,
    latestOrderItemsPreview: [],
    latestOrderSummaryText: "",
    createdAt: now,
    updatedAt: now,
  });

  await upsertRow("activeOrderSheets", {
    id: activeKey,
    businessDate,
    tableNumber: safeTableNumber,
    displayName,
    orderSheetId,
    status: "OPEN",
    updatedAt: now,
  });

  return {
    orderSheetId,
    displayName,
    tableNickname: "",
    reused: false,
    businessDate,
  };
}

export async function getActiveOrderSheetInfo(tableNumber) {
  const activeKeyCandidates = buildActiveOrderSheetKeyCandidates(tableNumber);

  if (activeKeyCandidates.length === 0) {
    return null;
  }

  let fallbackInfo = null;

  for (const activeKey of activeKeyCandidates) {
    const activeRow = await fetchRow("activeOrderSheets", activeKey);
    const orderSheetId = String(activeRow?.orderSheetId || "").trim();

    if (!orderSheetId) {
      continue;
    }

    const orderSheetData = await fetchRow("orderSheets", orderSheetId);

    if (!orderSheetData) {
      continue;
    }

    const status = String(orderSheetData.status || "");
    const info = {
      orderSheetId,
      status,
      isReusable: isReusableOrderSheetStatus(status),
      tableNickname: String(orderSheetData.tableNickname || ""),
    };

    if (info.isReusable) {
      return info;
    }

    if (!fallbackInfo) {
      fallbackInfo = info;
    }
  }

  return fallbackInfo;
}

export async function updateOrderSheetNickname({ orderSheetId, nickname }) {
  const safeOrderSheetId = String(orderSheetId || "").trim();
  const safeNickname = String(nickname || "").trim();

  if (!safeOrderSheetId) {
    throw new Error("주문서 정보가 올바르지 않아요.");
  }

  const nicknameErrorMessage = getTableNicknameErrorMessage(safeNickname);

  if (nicknameErrorMessage) {
    throw new Error(nicknameErrorMessage);
  }

  await updateRow("orderSheets", safeOrderSheetId, {
    tableNickname: safeNickname,
    updatedAt: nowIso(),
  });

  return safeNickname;
}

export async function completeOrderSheetPayment({
  orderSheetId,
  tableNumber,
  originalAmount,
  totalAmount,
  discounts,
  paymentSplits,
  couponIds = [],
  memo,
  close = true,
  customerPhone = "",
  customerName = "",
  marketingConsent = false,
  pointsUsed = 0,
}) {
  const safeOrderSheetId = String(orderSheetId || "").trim();
  const safeTableNumber = normalizeTableNumber(tableNumber);

  if (!safeOrderSheetId || !safeTableNumber) {
    throw new Error("주문서 정보가 올바르지 않아요.");
  }

  const entries = (Array.isArray(paymentSplits) ? paymentSplits : [])
    .map((split) => ({
      method: String(split?.method || "").trim(),
      // 인원별로 나눠낼 때 누가 낸 금액인지 남깁니다.
      payerLabel: String(split?.payerLabel || "").trim(),
      amount: Number(split?.amount || 0),
    }))
    .filter((entry) => entry.method && entry.amount > 0);

  if (entries.length === 0) {
    throw new Error("결제 수단별 금액을 1개 이상 입력해주세요.");
  }

  // 할인/최종 금액 검증과 원장 기록은 서버(/api/payments)에서 처리합니다.
  return recordSheetPayment({
    orderSheetId: safeOrderSheetId,
    originalAmount: Number(
      originalAmount !== undefined && originalAmount !== null
        ? originalAmount
        : totalAmount || 0
    ),
    discounts: Array.isArray(discounts) ? discounts : [],
    couponIds: Array.isArray(couponIds) ? couponIds : [],
    entries,
    memo,
    close,
    customerPhone,
    customerName,
    marketingConsent: marketingConsent === true,
    pointsUsed: Number(pointsUsed || 0),
  });
}

export async function closeOrderSheet({ orderSheetId, tableNumber }) {
  const safeOrderSheetId = String(orderSheetId || "").trim();
  const safeTableNumber = normalizeTableNumber(tableNumber);

  if (!safeOrderSheetId || !safeTableNumber) {
    throw new Error("주문서 정보가 올바르지 않아요.");
  }

  await updateRow("orderSheets", safeOrderSheetId, {
    status: "CLOSED",
    updatedAt: nowIso(),
  });

  await removeActiveOrderSheetForSheet({
    tableNumber: safeTableNumber,
    orderSheetId: safeOrderSheetId,
  });
}
