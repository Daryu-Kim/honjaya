import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

function convertCreatedAtToTime(value) {
  if (!value) return 0;

  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export async function getPlayingYoutubeRequest() {
  const q = query(
    collection(db, "youtubeRequests"),
    where("status", "==", "PLAYING"),
    orderBy("updatedAt", "asc"),
    limit(1)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  const docSnap = snapshot.docs[0];
  return {
    id: docSnap.id,
    ...docSnap.data(),
  };
}

export async function startNextQueuedYoutubeRequest() {
  return await runTransaction(db, async (transaction) => {
    const queuedQuery = query(
      collection(db, "youtubeRequests"),
      where("status", "==", "QUEUED"),
      orderBy("createdAt", "asc"),
      limit(1)
    );

    const queuedSnapshot = await getDocs(queuedQuery);

    if (queuedSnapshot.empty) {
      return null;
    }

    const queuedDoc = queuedSnapshot.docs[0];
    const queuedRef = doc(db, "youtubeRequests", queuedDoc.id);

    transaction.update(queuedRef, {
      status: "PLAYING",
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      id: queuedDoc.id,
      ...queuedDoc.data(),
      status: "PLAYING",
    };
  });
}

export async function completeYoutubeRequest(requestId) {
  const safeRequestId = String(requestId || "").trim();

  if (!safeRequestId) {
    throw new Error("requestId가 비어 있어요.");
  }

  await runTransaction(db, async (transaction) => {
    const requestRef = doc(db, "youtubeRequests", safeRequestId);
    const requestSnap = await transaction.get(requestRef);

    if (!requestSnap.exists()) {
      return;
    }

    const requestData = requestSnap.data();

    if (String(requestData.status || "") !== "PLAYING") {
      return;
    }

    transaction.update(requestRef, {
      status: "DONE",
      endedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function cancelYoutubeRequest(requestId) {
  const safeRequestId = String(requestId || "").trim();

  if (!safeRequestId) {
    throw new Error("requestId가 비어 있어요.");
  }

  await runTransaction(db, async (transaction) => {
    const requestRef = doc(db, "youtubeRequests", safeRequestId);
    const requestSnap = await transaction.get(requestRef);

    if (!requestSnap.exists()) {
      return;
    }

    transaction.update(requestRef, {
      status: "CANCELLED",
      updatedAt: serverTimestamp(),
    });
  });
}

export async function normalizeYoutubeQueueState() {
  const playingQuery = query(
    collection(db, "youtubeRequests"),
    where("status", "==", "PLAYING")
  );

  const playingSnapshot = await getDocs(playingQuery);

  if (playingSnapshot.empty) {
    return await startNextQueuedYoutubeRequest();
  }

  const playingDocs = playingSnapshot.docs
    .map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }))
    .sort(
      (a, b) =>
        convertCreatedAtToTime(a.createdAt) -
        convertCreatedAtToTime(b.createdAt)
    );

  const keeper = playingDocs[0];
  const extras = playingDocs.slice(1);

  await runTransaction(db, async (transaction) => {
    extras.forEach((item) => {
      transaction.update(doc(db, "youtubeRequests", item.id), {
        status: "QUEUED",
        updatedAt: serverTimestamp(),
      });
    });
  });

  return keeper;
}

export async function forcePlayYoutubeRequest(requestId) {
  const safeRequestId = String(requestId || "").trim();

  if (!safeRequestId) {
    throw new Error("requestId가 비어 있어요.");
  }

  await runTransaction(db, async (transaction) => {
    const playingQuery = query(
      collection(db, "youtubeRequests"),
      where("status", "==", "PLAYING")
    );

    const playingSnapshot = await getDocs(playingQuery);

    playingSnapshot.docs.forEach((docSnap) => {
      transaction.update(doc(db, "youtubeRequests", docSnap.id), {
        status: "QUEUED",
        updatedAt: serverTimestamp(),
      });
    });

    const targetRef = doc(db, "youtubeRequests", safeRequestId);
    const targetSnap = await transaction.get(targetRef);

    if (!targetSnap.exists()) {
      throw new Error("대상 영상이 없어요.");
    }

    transaction.update(targetRef, {
      status: "PLAYING",
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}
