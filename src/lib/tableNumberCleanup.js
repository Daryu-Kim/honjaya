import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  startAfter,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  buildActiveOrderSheetKey,
  isReusableOrderSheetStatus,
  normalizeTableNumber,
} from "@/lib/orderSheet";

const PAGE_SIZE = 300;
const ACTIVE_COLLECTION = "activeOrderSheets";
const ACTIVE_KEY_PREFIX = "table_";
const ACTIVE_KEY_LABEL = "활성 키";

// "0" <= string < "1" matches digit strings with a leading zero (e.g. "01")
const LEADING_ZERO_LOWER = "0";
const LEADING_ZERO_UPPER = "1";

const CLEANUP_COLLECTIONS = [
  { key: "orderSheets", label: "주문서" },
  { key: "orders", label: "주문" },
  { key: "checkoutRequests", label: "결제 요청" },
  { key: "chatMessages", label: "채팅" },
];

function getCollectionLabel(key) {
  if (key === ACTIVE_COLLECTION) {
    return ACTIVE_KEY_LABEL;
  }

  return CLEANUP_COLLECTIONS.find((item) => item.key === key)?.label || key;
}

function buildFieldUpdate(data) {
  const raw = String(data?.tableNumber ?? "").trim();
  const normalized = normalizeTableNumber(raw);

  if (!normalized || normalized === raw) {
    return null;
  }

  const update = { tableNumber: normalized };

  if (String(data.displayName ?? "") === `No.${raw}`) {
    update.displayName = `No.${normalized}`;
  }

  return update;
}

async function fetchLeadingZeroDocs(collectionName) {
  const baseQuery = query(
    collection(db, collectionName),
    where("tableNumber", ">=", LEADING_ZERO_LOWER),
    where("tableNumber", "<", LEADING_ZERO_UPPER)
  );

  const result = [];
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    const pageQuery = cursor
      ? query(baseQuery, startAfter(cursor), limit(PAGE_SIZE))
      : query(baseQuery, limit(PAGE_SIZE));
    const snapshot = await getDocs(pageQuery);

    snapshot.docs.forEach((item) => result.push(item));

    hasMore = snapshot.size === PAGE_SIZE;

    if (hasMore) {
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }
  }

  return result;
}

async function fetchActiveOrderSheetTargets() {
  const snapshot = await getDocs(collection(db, ACTIVE_COLLECTION));
  const targets = [];

  snapshot.docs.forEach((item) => {
    const rawId = item.id;
    const idNumber = rawId.startsWith(ACTIVE_KEY_PREFIX)
      ? rawId.slice(ACTIVE_KEY_PREFIX.length)
      : "";
    const normalizedIdNumber = idNumber ? normalizeTableNumber(idNumber) : "";
    const needsKeyMove =
      Boolean(normalizedIdNumber) && normalizedIdNumber !== idNumber;

    if (!needsKeyMove && !buildFieldUpdate(item.data())) {
      return;
    }

    targets.push({
      id: rawId,
      targetKey: needsKeyMove
        ? buildActiveOrderSheetKey(normalizedIdNumber)
        : rawId,
      needsKeyMove,
    });
  });

  return targets;
}

function getTimeValue(value) {
  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }

  return 0;
}

async function getActiveDocReuseScore(data) {
  const orderSheetId = String(data?.orderSheetId || "").trim();

  if (!orderSheetId) {
    return -1;
  }

  const snapshot = await getDoc(doc(db, "orderSheets", orderSheetId));

  if (!snapshot.exists()) {
    return -1;
  }

  return isReusableOrderSheetStatus(String(snapshot.data().status || ""))
    ? 1
    : 0;
}

async function shouldSourceWinMigration(sourceData, targetData) {
  const [sourceScore, targetScore] = await Promise.all([
    getActiveDocReuseScore(sourceData),
    getActiveDocReuseScore(targetData),
  ]);

  if (sourceScore !== targetScore) {
    return sourceScore > targetScore;
  }

  return (
    getTimeValue(sourceData.updatedAt) > getTimeValue(targetData.updatedAt)
  );
}

async function migrateActiveOrderSheet(target) {
  const sourceRef = doc(db, ACTIVE_COLLECTION, target.id);
  const sourceSnap = await getDoc(sourceRef);

  if (!sourceSnap.exists()) {
    return;
  }

  const sourceData = sourceSnap.data() || {};
  const sourceUpdate = buildFieldUpdate(sourceData);

  if (!target.needsKeyMove) {
    if (sourceUpdate) {
      await updateDoc(sourceRef, sourceUpdate);
    }
    return;
  }

  const targetRef = doc(db, ACTIVE_COLLECTION, target.targetKey);
  const targetSnap = await getDoc(targetRef);

  if (targetSnap.exists()) {
    const targetData = targetSnap.data() || {};

    if (!(await shouldSourceWinMigration(sourceData, targetData))) {
      await deleteDoc(sourceRef);

      const targetUpdate = buildFieldUpdate(targetData);

      if (targetUpdate) {
        await updateDoc(targetRef, targetUpdate);
      }
      return;
    }
  }

  await setDoc(targetRef, { ...sourceData, ...(sourceUpdate || {}) });
  await deleteDoc(sourceRef);
}

export async function scanLegacyTableNumbers() {
  const collections = [];

  for (const target of CLEANUP_COLLECTIONS) {
    const docs = await fetchLeadingZeroDocs(target.key);
    const count = docs.filter((item) => buildFieldUpdate(item.data())).length;

    collections.push({ key: target.key, label: target.label, count });
  }

  const activeTargets = await fetchActiveOrderSheetTargets();

  collections.push({
    key: ACTIVE_COLLECTION,
    label: ACTIVE_KEY_LABEL,
    count: activeTargets.length,
  });

  return {
    collections,
    total: collections.reduce((acc, item) => acc + item.count, 0),
  };
}

export async function runLegacyTableNumberCleanup({ onProgress } = {}) {
  const jobs = [];

  for (const target of CLEANUP_COLLECTIONS) {
    const docs = await fetchLeadingZeroDocs(target.key);

    docs.forEach((item) => {
      const update = buildFieldUpdate(item.data());

      if (update) {
        jobs.push({ key: target.key, id: item.id, update });
      }
    });
  }

  const activeTargets = await fetchActiveOrderSheetTargets();

  activeTargets.forEach((target) => {
    jobs.push({ key: ACTIVE_COLLECTION, id: target.id, activeTarget: target });
  });

  const total = jobs.length;
  const updatedCounts = new Map();
  const failed = [];
  let processed = 0;

  // reads above are done before any write so pagination cursors stay stable
  if (typeof onProgress === "function") {
    onProgress({ processed: 0, total });
  }

  for (const job of jobs) {
    try {
      if (job.activeTarget) {
        await migrateActiveOrderSheet(job.activeTarget);
      } else {
        await updateDoc(doc(db, job.key, job.id), job.update);
      }

      updatedCounts.set(job.key, (updatedCounts.get(job.key) || 0) + 1);
    } catch (error) {
      failed.push({
        collection: job.key,
        label: getCollectionLabel(job.key),
        id: job.id,
        reason: String(error?.message || error),
      });
    }

    processed += 1;

    if (typeof onProgress === "function") {
      onProgress({ processed, total });
    }
  }

  const updated = [...updatedCounts.entries()].map(([key, count]) => ({
    key,
    label: getCollectionLabel(key),
    count,
  }));

  return { total, updated, failed };
}
