import {
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function finalizeOrderSheetCleanup({ orderSheetId }) {
  const safeOrderSheetId = String(orderSheetId || "").trim();

  if (!safeOrderSheetId) {
    throw new Error("orderSheetId가 비어 있어요.");
  }

  await updateDoc(doc(db, "orderSheets", safeOrderSheetId), {
    status: "CLOSED",
    closedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

function formatSequenceNo(sequenceNo) {
  return String(sequenceNo).padStart(6, "0");
}

function buildActiveOrderSheetKey(tableNumber) {
  return `table_${tableNumber}`;
}

function isReusableOrderSheetStatus(status) {
  return status === "OPEN" || status === "PAYMENT_REQUESTED";
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
  const safeTableNumber = String(tableNumber || "").trim();

  if (!safeTableNumber) {
    throw new Error("테이블 번호가 없어요.");
  }

  const businessDate = new Date();
  const displayName = `No.${safeTableNumber}`;
  const activeKey = buildActiveOrderSheetKey(safeTableNumber);

  const result = await runTransaction(db, async (transaction) => {
    const activeRef = doc(db, "activeOrderSheets", activeKey);
    const activeSnap = await transaction.get(activeRef);

    if (activeSnap.exists()) {
      const activeData = activeSnap.data();
      const currentOrderSheetId = String(activeData.orderSheetId || "").trim();

      if (currentOrderSheetId) {
        const currentOrderSheetRef = doc(
          db,
          "orderSheets",
          currentOrderSheetId
        );
        const currentOrderSheetSnap = await transaction.get(
          currentOrderSheetRef
        );

        if (currentOrderSheetSnap.exists()) {
          const currentOrderSheetData = currentOrderSheetSnap.data();
          const currentStatus = String(currentOrderSheetData.status || "");

          if (isReusableOrderSheetStatus(currentStatus)) {
            return {
              orderSheetId: currentOrderSheetId,
              displayName,
              tableNickname: String(currentOrderSheetData.tableNickname || ""),
              reused: true,
              businessDate,
            };
          }
        }
      }
    }

    const counterRef = doc(db, "counters", "orderSheet");
    const counterSnap = await transaction.get(counterRef);

    const lastSequenceNo = counterSnap.exists()
      ? Number(counterSnap.data().lastSequenceNo || 0)
      : 0;

    const nextSequenceNo = lastSequenceNo + 1;
    const orderSheetId = formatSequenceNo(nextSequenceNo);
    const orderSheetRef = doc(db, "orderSheets", orderSheetId);

    transaction.set(
      counterRef,
      {
        lastSequenceNo: nextSequenceNo,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    transaction.set(orderSheetRef, {
      orderSheetId,
      businessDate,
      sequenceNo: nextSequenceNo,
      tableNumber: safeTableNumber,
      displayName,
      tableNickname: "",
      status: "OPEN", // OPEN, PAYMENT_REQUESTED, CLOSED
      paymentStatus: "UNPAID", // UNPAID, REQUESTED, COMPLETED
      paymentMethod: "",
      totalAmount: 0,
      orderCount: 0,
      latestOrderItemsPreview: [],
      latestOrderSummaryText: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    transaction.set(activeRef, {
      businessDate,
      tableNumber: safeTableNumber,
      displayName,
      orderSheetId,
      status: "OPEN",
      updatedAt: serverTimestamp(),
    });

    return {
      orderSheetId,
      displayName,
      tableNickname: "",
      reused: false,
      businessDate,
    };
  });

  return result;
}

export async function getActiveOrderSheetInfo(tableNumber) {
  const safeTableNumber = String(tableNumber || "").trim();

  if (!safeTableNumber) {
    return null;
  }

  const activeRef = doc(
    db,
    "activeOrderSheets",
    buildActiveOrderSheetKey(safeTableNumber)
  );
  const activeSnap = await getDoc(activeRef);

  if (!activeSnap.exists()) {
    return null;
  }

  const orderSheetId = String(activeSnap.data().orderSheetId || "").trim();

  if (!orderSheetId) {
    return null;
  }

  const orderSheetSnap = await getDoc(doc(db, "orderSheets", orderSheetId));

  if (!orderSheetSnap.exists()) {
    return null;
  }

  const orderSheetData = orderSheetSnap.data();
  const status = String(orderSheetData.status || "");

  return {
    orderSheetId,
    status,
    isReusable: isReusableOrderSheetStatus(status),
    tableNickname: String(orderSheetData.tableNickname || ""),
  };
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

  await updateDoc(doc(db, "orderSheets", safeOrderSheetId), {
    tableNickname: safeNickname,
    updatedAt: serverTimestamp(),
  });

  return safeNickname;
}

export async function completeOrderSheetPayment({
  orderSheetId,
  tableNumber,
  paymentMethod,
  originalAmount,
  discountTotal,
  totalAmount,
  discounts,
  paymentSplits,
}) {
  const safeOrderSheetId = String(orderSheetId || "").trim();
  const safeTableNumber = String(tableNumber || "").trim();
  const safePaymentMethod = String(paymentMethod || "").trim();

  if (!safeOrderSheetId || !safeTableNumber) {
    throw new Error("주문서 정보가 올바르지 않아요.");
  }

  const activeKey = buildActiveOrderSheetKey(safeTableNumber);

  await updateDoc(doc(db, "orderSheets", safeOrderSheetId), {
    status: "CLOSED",
    paymentStatus: "COMPLETED",
    paymentMethod: safePaymentMethod,
    ...(originalAmount !== undefined
      ? { originalAmount: Number(originalAmount || 0) }
      : {}),
    ...(discountTotal !== undefined
      ? { discountTotal: Number(discountTotal || 0) }
      : {}),
    ...(totalAmount !== undefined
      ? { totalAmount: Number(totalAmount || 0) }
      : {}),
    ...(discounts !== undefined
      ? { discounts: Array.isArray(discounts) ? discounts : [] }
      : {}),
    ...(paymentSplits !== undefined
      ? { paymentSplits: Array.isArray(paymentSplits) ? paymentSplits : [] }
      : {}),
    paidAt: serverTimestamp(),
    closedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const activeRef = doc(db, "activeOrderSheets", activeKey);
  const activeSnap = await getDoc(activeRef);

  if (activeSnap.exists()) {
    const activeData = activeSnap.data();

    if (String(activeData.orderSheetId || "") === safeOrderSheetId) {
      await deleteDoc(activeRef);
    }
  }
}

export async function closeOrderSheet({ orderSheetId, tableNumber }) {
  const safeOrderSheetId = String(orderSheetId || "").trim();
  const safeTableNumber = String(tableNumber || "").trim();

  if (!safeOrderSheetId || !safeTableNumber) {
    throw new Error("주문서 정보가 올바르지 않아요.");
  }

  const activeKey = buildActiveOrderSheetKey(safeTableNumber);

  await updateDoc(doc(db, "orderSheets", safeOrderSheetId), {
    status: "CLOSED",
    updatedAt: serverTimestamp(),
  });

  const activeRef = doc(db, "activeOrderSheets", activeKey);
  const activeSnap = await getDoc(activeRef);

  if (activeSnap.exists()) {
    const activeData = activeSnap.data();

    if (String(activeData.orderSheetId || "") === safeOrderSheetId) {
      await deleteDoc(activeRef);
    }
  }
}
