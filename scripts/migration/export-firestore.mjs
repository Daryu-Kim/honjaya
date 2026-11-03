/**
 * Firestore -> JSON export (read-only, legacy source DB)
 *
 * Discovers root collections via Firestore REST API and dumps every document
 * to migration-data/firestore-export.json so it can be imported into Supabase.
 *
 * Auth model: uses the public web apiKey of the old Firebase project. Requires
 * the deployed Firestore rules to allow unauthenticated reads for the app
 * collections.
 *
 * Usage:
 *   1. Fill .env.migration with FIREBASE_PROJECT_ID and FIREBASE_API_KEY.
 *   2. node scripts/migration/export-firestore.mjs
 *
 * Env overrides (optional, take precedence over .env.migration):
 *   FIREBASE_PROJECT_ID, FIREBASE_API_KEY
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const outputDir = path.join(repoRoot, "migration-data");
const outputFile = path.join(outputDir, "firestore-export.json");
const envPath = path.join(repoRoot, ".env.migration");

const PAGE_SIZE = 300;

// Fallback list used when the listCollectionIds discovery API is denied by
// security rules (collection queries themselves are still evaluable).
const DEFAULT_COLLECTIONS = [
  "products",
  "categories",
  "orders",
  "orderSheets",
  "activeOrderSheets",
  "counters",
  "chatMessages",
];

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const result = {};

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");

    if (eq === -1) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

const fileEnv = loadEnvFile(envPath);

function pickEnv(names) {
  for (const name of names) {
    const value = String(process.env[name] || fileEnv[name] || "").trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function decodeValue(value) {
  if (value === null || value === undefined) return null;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(decodeValue);
  }
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  if ("geoPointValue" in value) {
    return {
      latitude: value.geoPointValue.latitude,
      longitude: value.geoPointValue.longitude,
    };
  }
  if ("referenceValue" in value) return value.referenceValue;
  if ("bytesValue" in value) {
    return { __type: "bytes", base64: value.bytesValue };
  }
  return null;
}

function decodeFields(fields) {
  const result = {};
  for (const [key, value] of Object.entries(fields || {})) {
    result[key] = decodeValue(value);
  }
  return result;
}

function buildBaseUrl(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

async function callFirestore(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Firestore 요청 실패 (${response.status}): ${url}\n${body.slice(0, 500)}`
    );
  }

  return response.json();
}

async function listRootCollections(projectId, apiKey) {
  const url = `${buildBaseUrl(projectId)}:listCollectionIds?key=${apiKey}`;
  const data = await callFirestore(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return data.collectionIds || [];
}

function extractDocId(documentName) {
  const marker = "/documents/";
  const index = documentName.lastIndexOf(marker);
  const pathAfterMarker = documentName.slice(index + marker.length);
  const parts = pathAfterMarker.split("/");
  return parts[parts.length - 1];
}

async function exportCollection(projectId, apiKey, collectionId) {
  const documents = [];
  let pageToken = null;

  do {
    const params = new URLSearchParams({
      key: apiKey,
      pageSize: String(PAGE_SIZE),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `${buildBaseUrl(projectId)}/${encodeURIComponent(
      collectionId
    )}?${params.toString()}`;
    const data = await callFirestore(url);

    for (const doc of data.documents || []) {
      documents.push({
        _id: extractDocId(doc.name),
        ...decodeFields(doc.fields),
      });
    }

    pageToken = data.nextPageToken || null;

    if (documents.length > 0 && documents.length % (PAGE_SIZE * 5) === 0) {
      console.log(`  ... ${documents.length}건`);
    }
  } while (pageToken);

  return documents;
}

async function main() {
  const projectId = pickEnv(["FIREBASE_PROJECT_ID"]);
  const apiKey = pickEnv(["FIREBASE_API_KEY"]);

  if (!projectId || !apiKey) {
    throw new Error(
      `Firebase 설정이 없어요. ${envPath} 파일에 FIREBASE_PROJECT_ID/FIREBASE_API_KEY를 추가하거나 같은 이름의 환경변수를 설정해주세요.`
    );
  }

  console.log(`Firestore 프로젝트: ${projectId}`);

  let collectionIds = [];
  try {
    collectionIds = await listRootCollections(projectId, apiKey);
  } catch (error) {
    console.warn(
      `컬렉션 목록 조회 실패 → 알려진 컬렉션 목록으로 진행해요.\n  (${error.message.split("\n")[0]})`
    );
  }

  if (collectionIds.length === 0) {
    collectionIds = DEFAULT_COLLECTIONS;
  }

  console.log(`컬렉션 ${collectionIds.length}개 발견: ${collectionIds.join(", ")}`);

  const collections = {};
  const summary = [];
  const failures = [];

  for (const collectionId of [...collectionIds].sort()) {
    process.stdout.write(`- ${collectionId} 내보내는 중...`);
    try {
      const documents = await exportCollection(projectId, apiKey, collectionId);
      collections[collectionId] = documents;
      summary.push({ collectionId, count: documents.length });
      process.stdout.write(` ${documents.length}건\n`);
    } catch (error) {
      failures.push({ collectionId, message: error.message.split("\n")[0] });
      process.stdout.write(" 실패\n");
    }
  }

  if (summary.length === 0) {
    throw new Error(
      `모든 컬렉션 읽기에 실패했어요. Firestore 규칙을 확인해주세요.\n${failures
        .map((item) => `  - ${item.collectionId}: ${item.message}`)
        .join("\n")}`
    );
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    outputFile,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        projectId,
        collections,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`\n완료: ${path.relative(repoRoot, outputFile)}`);
  console.log("수집 요약:");
  for (const item of summary) {
    console.log(`  - ${item.collectionId}: ${item.count}건`);
  }

  if (failures.length > 0) {
    console.log("읽기 실패한 컬렉션:");
    for (const item of failures) {
      console.log(`  - ${item.collectionId}: ${item.message}`);
    }
  }
}

main().catch((error) => {
  console.error("\n내보내기 실패:", error.message);
  process.exit(1);
});
