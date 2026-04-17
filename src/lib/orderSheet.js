import {
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

function formatBusinessDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function formatSequenceNo(sequenceNo) {
  return String(sequenceNo).padStart(4, "0");
}

function buildActiveOrderSheetKey(businessDate, tableNumber) {
  return `${businessDate}_${tableNumber}`;
}

function isReusableOrderSheetStatus(status) {
  return status === "OPEN" || status === "PAYMENT_REQUESTED";
}

export async function getOrCreateOpenOrderSheet(tableNumber) {
  const safeTableNumber = String(tableNumber || "").trim();

  if (!safeTableNumber) {
    throw new Error("테이블 번호가 없어요.");
  }

  const businessDate = formatBusinessDate(new Date());
  const displayName = `No.${safeTableNumber}`;
  const activeKey = buildActiveOrderSheetKey(businessDate, safeTableNumber);

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
              reused: true,
              businessDate,
            };
          }
        }
      }
    }

    const counterRef = doc(db, "dailyCounters", businessDate);
    const counterSnap = await transaction.get(counterRef);

    const lastSequenceNo = counterSnap.exists()
      ? Number(counterSnap.data().lastSequenceNo || 0)
      : 0;

    const nextSequenceNo = lastSequenceNo + 1;
    const orderSheetId = `${businessDate}_${formatSequenceNo(nextSequenceNo)}`;
    const orderSheetRef = doc(db, "orderSheets", orderSheetId);

    transaction.set(
      counterRef,
      {
        businessDate,
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
      status: "OPEN", // OPEN, PAYMENT_REQUESTED, PAID, CLOSED
      paymentStatus: "UNPAID", // UNPAID, REQUESTED, COMPLETED
      paymentMethod: "",
      totalAmount: 0,
      orderCount: 0,
      youtubeRequestCount: 0,
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
      reused: false,
      businessDate,
    };
  });

  return result;
}

export async function completeOrderSheetPayment({
  orderSheetId,
  tableNumber,
  paymentMethod,
}) {
  const safeOrderSheetId = String(orderSheetId || "").trim();
  const safeTableNumber = String(tableNumber || "").trim();
  const safePaymentMethod = String(paymentMethod || "").trim();

  if (!safeOrderSheetId || !safeTableNumber) {
    throw new Error("주문서 정보가 올바르지 않아요.");
  }

  const businessDate = formatBusinessDate(new Date());
  const activeKey = buildActiveOrderSheetKey(businessDate, safeTableNumber);

  await updateDoc(doc(db, "orderSheets", safeOrderSheetId), {
    status: "PAID",
    paymentStatus: "COMPLETED",
    paymentMethod: safePaymentMethod,
    paidAt: serverTimestamp(),
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

  const businessDate = formatBusinessDate(new Date());
  const activeKey = buildActiveOrderSheetKey(businessDate, safeTableNumber);

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
