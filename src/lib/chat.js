import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function createSystemChatMessage({
  orderSheetId = "",
  tableNumber = "",
  displayName = "",
  message = "",
}) {
  const safeOrderSheetId = String(orderSheetId || "").trim();
  const safeTableNumber = String(tableNumber || "").trim();
  const safeDisplayName =
    String(displayName || "").trim() ||
    (safeTableNumber ? `No.${safeTableNumber}` : "");
  const safeMessage = String(message || "").trim();

  if (!safeMessage) {
    throw new Error("시스템 메시지 내용이 비어 있어요.");
  }

  await addDoc(collection(db, "chatMessages"), {
    orderSheetId: safeOrderSheetId,
    tableNumber: safeTableNumber,
    displayName: safeDisplayName,
    senderLabel: "시스템",
    message: safeMessage,
    messageType: "SYSTEM",
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
