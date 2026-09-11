import {
  deleteRow,
  fetchList,
  fetchRow,
  toTime,
  updateRow,
  upsertRow,
} from "@/lib/supabase";
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

async function fetchLeadingZeroRows(collectionName) {
  const result = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const pageRows = await fetchList(collectionName, {
      filters: [
        ["tableNumber", "gte", LEADING_ZERO_LOWER],
        ["tableNumber", "lt", LEADING_ZERO_UPPER],
      ],
      order: ["tableNumber", "asc"],
      limit: PAGE_SIZE,
      offset,
    });

    pageRows.forEach((row) => result.push(row));

    hasMore = pageRows.length === PAGE_SIZE;
    offset += pageRows.length;
  }

  return result;
}

async function fetchActiveOrderSheetTargets() {
  const rows = await fetchList(ACTIVE_COLLECTION);
  const targets = [];

  rows.forEach((row) => {
    const rawId = String(row.id || "");
    const idNumber = rawId.startsWith(ACTIVE_KEY_PREFIX)
      ? rawId.slice(ACTIVE_KEY_PREFIX.length)
      : "";
    const normalizedIdNumber = idNumber ? normalizeTableNumber(idNumber) : "";
    const needsKeyMove =
      Boolean(normalizedIdNumber) && normalizedIdNumber !== idNumber;

    if (!needsKeyMove && !buildFieldUpdate(row)) {
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
  return toTime(value);
}

async function getActiveDocReuseScore(data) {
  const orderSheetId = String(data?.orderSheetId || "").trim();

  if (!orderSheetId) {
    return -1;
  }

  const orderSheet = await fetchRow("orderSheets", orderSheetId);

  if (!orderSheet) {
    return -1;
  }

  return isReusableOrderSheetStatus(String(orderSheet.status || "")) ? 1 : 0;
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
  const sourceData = await fetchRow(ACTIVE_COLLECTION, target.id);

  if (!sourceData) {
    return;
  }

  const sourceUpdate = buildFieldUpdate(sourceData);

  if (!target.needsKeyMove) {
    if (sourceUpdate) {
      await updateRow(ACTIVE_COLLECTION, target.id, sourceUpdate);
    }
    return;
  }

  const targetData = await fetchRow(ACTIVE_COLLECTION, target.targetKey);

  if (targetData) {
    if (!(await shouldSourceWinMigration(sourceData, targetData))) {
      await deleteRow(ACTIVE_COLLECTION, target.id);

      const targetUpdate = buildFieldUpdate(targetData);

      if (targetUpdate) {
        await updateRow(ACTIVE_COLLECTION, target.targetKey, targetUpdate);
      }
      return;
    }
  }

  await upsertRow(ACTIVE_COLLECTION, {
    ...sourceData,
    id: target.targetKey,
    ...(sourceUpdate || {}),
  });
  await deleteRow(ACTIVE_COLLECTION, target.id);
}

export async function scanLegacyTableNumbers() {
  const collections = [];

  for (const target of CLEANUP_COLLECTIONS) {
    const rows = await fetchLeadingZeroRows(target.key);
    const count = rows.filter((row) => buildFieldUpdate(row)).length;

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
    const rows = await fetchLeadingZeroRows(target.key);

    rows.forEach((row) => {
      const update = buildFieldUpdate(row);

      if (update) {
        jobs.push({ key: target.key, id: row.id, update });
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
        await updateRow(job.key, job.id, job.update);
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
