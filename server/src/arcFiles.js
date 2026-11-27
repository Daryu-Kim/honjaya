// AS-CARE 외부 서식 파일 보관소.
//
//   * 손으로 적고 서명한 AS-CARE 원본(HWP·DOCX·PDF·스캔 이미지)을 올리는 자리입니다.
//   * 본문은 ARC_FILES_DIR(기본 ./arc-files) 아래 care/<incidentId>/ 에만 저장하고,
//     DB(arc_care_files)에는 파일명·해시·크기 같은 색인만 남깁니다.
//   * 업로드·삭제는 ARC 총괄(최윤희)만, 내려받기는 총괄 또는 그 기록의 열람 승인을 받은 직원만.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertArcSensitiveAccess, logArcSensitiveRead } from "./arc.js";
import { isArcDirector } from "./auth/permissions.js";
import { pool } from "./db.js";
import { HttpError, badRequest } from "./http/errors.js";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const ARC_CARE_FILE_KINDS = ["CARE_SHEET", "SIGNATURE", "PHOTO", "ETC"];

// 확장자 화이트리스트. 브라우저가 HWP/DOCX 에 octet-stream 을 붙이는 경우가 많아
// MIME 은 참고만 하고, 실제 판단은 확장자 + 파일 시그니처(매직바이트)로 합니다.
const EXTENSION_MIME = {
  pdf: "application/pdf",
  hwp: "application/x-hwp",
  hwpx: "application/vnd.hancom.hwpx",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  txt: "text/plain",
};

const ZIP_EXTENSIONS = new Set(["hwpx", "docx", "xlsx"]);
const OLE_EXTENSIONS = new Set(["doc", "xls"]);

function filesRoot() {
  const configured = String(process.env.ARC_FILES_DIR || "").trim();
  const root = configured || path.resolve(process.cwd(), "arc-files");

  return path.resolve(root, "care");
}

function normalizeExtension(fileName) {
  const ext = path.extname(String(fileName || "")).replace(/^\./, "").toLowerCase();

  if (!ext || !EXTENSION_MIME[ext]) {
    throw badRequest(
      `올릴 수 없는 파일 형식이에요. ${Object.keys(EXTENSION_MIME)
        .map((item) => item.toUpperCase())
        .join(" · ")} 만 올릴 수 있어요.`
    );
  }

  return ext;
}

function startsWith(buffer, signature) {
  if (buffer.length < signature.length) return false;

  return signature.every((byte, index) => buffer[index] === byte);
}

// 확장자와 실제 내용이 다르면 실행 파일 등을 서식으로 위장해 올릴 수 있으므로 거절합니다.
function assertFileSignature(ext, buffer) {
  if (ext === "pdf" && !buffer.subarray(0, 5).toString("latin1").startsWith("%PDF")) {
    throw badRequest("PDF 파일 내용을 확인할 수 없어요. 다른 파일로 다시 올려 주세요.");
  }

  if (ext === "jpg" || ext === "jpeg") {
    if (!startsWith(buffer, [0xff, 0xd8, 0xff])) {
      throw badRequest("JPG 파일 내용을 확인할 수 없어요. 다른 파일로 다시 올려 주세요.");
    }
  }

  if (ext === "png" && !startsWith(buffer, [0x89, 0x50, 0x4e, 0x47])) {
    throw badRequest("PNG 파일 내용을 확인할 수 없어요. 다른 파일로 다시 올려 주세요.");
  }

  if (ZIP_EXTENSIONS.has(ext) && !startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    throw badRequest(`${ext.toUpperCase()} 파일 내용을 확인할 수 없어요. 다시 저장해서 올려 주세요.`);
  }

  if (ext === "hwp") {
    const ole = startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const hwp5 = buffer.subarray(0, 40).toString("latin1").includes("HWP Document File");

    if (!ole && !hwp5) {
      throw badRequest("HWP 파일 내용을 확인할 수 없어요. 한글에서 다시 저장해 올려 주세요.");
    }
  }

  if (OLE_EXTENSIONS.has(ext) && !startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0])) {
    throw badRequest(`${ext.toUpperCase()} 파일 내용을 확인할 수 없어요. 다시 저장해서 올려 주세요.`);
  }
}

function sanitizeFileName(fileName) {
  const base = path.basename(String(fileName || "")).replace(/[\u0000-\u001f]/g, "").trim();
  const name = base || "AS-CARE";

  return name.slice(0, 160);
}

function mapFileRow(row) {
  return {
    id: row.id,
    incidentId: row.incident_id,
    careRecordId: row.care_record_id,
    kind: row.kind,
    fileName: row.file_name,
    ext: row.ext,
    mime: row.mime,
    bytes: Number(row.bytes ?? 0),
    note: row.note ?? "",
    uploadedByName: row.uploaded_by_name ?? "",
    createdAt: row.created_at,
  };
}

function requireDirector(employee) {
  if (!isArcDirector(employee?.loginId)) {
    throw new HttpError(
      403,
      "HJ403",
      "AS-CARE 서식 파일은 ARC 총괄만 올리거나 지울 수 있어요."
    );
  }
}

async function loadIncident(incidentId) {
  const id = String(incidentId ?? "").trim();

  if (!id) {
    throw badRequest("사건을 먼저 선택해 주세요.");
  }

  const { rows } = await pool.query(
    `select i.id, i.incident_no,
            (select r.id from public.arc_care_records r where r.incident_id = i.id) as care_record_id
       from public.arc_incidents i
      where i.id = $1`,
    [id]
  );

  if (!rows[0]) {
    throw new HttpError(404, "HJ404", "사건을 찾을 수 없어요.");
  }

  return rows[0];
}

export async function listArcCareFiles({ incidentId = null, careRecordId = null } = {}) {
  const { rows } = await pool.query(
    `select *
       from public.arc_care_files
      where ($1::uuid is null or incident_id = $1::uuid)
        and ($2::uuid is null or care_record_id = $2::uuid)
      order by created_at desc
      limit 200`,
    [incidentId || null, careRecordId || null]
  );

  return rows.map(mapFileRow);
}

export async function saveArcCareFile(
  {
    incidentId = "",
    careRecordId = null,
    kind = "CARE_SHEET",
    fileName = "",
    mime = "",
    dataBase64 = "",
    note = "",
  } = {},
  employee = null
) {
  requireDirector(employee);

  const incident = await loadIncident(incidentId);
  const name = sanitizeFileName(fileName);
  const ext = normalizeExtension(name);
  const rawBase64 = String(dataBase64 || "").replace(/^data:[^,]*,/, "");

  if (!rawBase64) {
    throw badRequest("올릴 파일을 선택해 주세요.");
  }

  const buffer = Buffer.from(rawBase64, "base64");

  if (!buffer.length) {
    throw badRequest("파일을 읽지 못했어요. 다시 선택해 주세요.");
  }

  if (buffer.length > MAX_FILE_BYTES) {
    throw badRequest(
      `파일은 한 개에 ${Math.round(MAX_FILE_BYTES / (1024 * 1024))}MB 까지만 올릴 수 있어요.`
    );
  }

  assertFileSignature(ext, buffer);

  const safeKind = ARC_CARE_FILE_KINDS.includes(kind) ? kind : "CARE_SHEET";
  const targetRecord = careRecordId || incident.care_record_id || null;
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  // 같은 사건에 같은 파일을 두 번 올리면 기존 행을 그대로 돌려줍니다.
  const { rows: duplicate } = await pool.query(
    `select *
       from public.arc_care_files
      where incident_id = $1
        and sha256 = $2
      limit 1`,
    [incident.id, sha256]
  );

  if (duplicate[0]) {
    return { file: mapFileRow(duplicate[0]), duplicated: true };
  }

  const storageName = path.join(incident.id, `${randomUUID()}.${ext}`);
  const absolute = path.join(filesRoot(), storageName);

  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, buffer, { mode: 0o640 });

  const { rows } = await pool.query(
    `insert into public.arc_care_files
       (id, incident_id, care_record_id, kind, file_name, ext, mime, bytes, sha256,
        storage_name, note, uploaded_by, uploaded_by_name)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     returning *`,
    [
      randomUUID(),
      incident.id,
      targetRecord,
      safeKind,
      name,
      ext,
      EXTENSION_MIME[ext] || String(mime || "application/octet-stream"),
      buffer.length,
      sha256,
      storageName,
      String(note ?? "").trim().slice(0, 300),
      employee?.id ?? null,
      employee?.name ?? "",
    ]
  );

  return { file: mapFileRow(rows[0]), duplicated: false };
}

export async function readArcCareFile(
  fileId,
  employee = null,
  { ip = "", action = "DOWNLOAD" } = {}
) {
  const { rows } = await pool.query(
    `select f.*, i.incident_no
       from public.arc_care_files f
       join public.arc_incidents i on i.id = f.incident_id
      where f.id = $1`,
    [String(fileId ?? "").trim() || null]
  );
  const row = rows[0];

  if (!row) {
    throw new HttpError(404, "HJ404", "파일을 찾을 수 없어요.");
  }

  if (isArcDirector(employee?.loginId)) {
    await logArcSensitiveRead({
      accessId: null,
      incidentNo: row.incident_no,
      employee,
      action,
      ip,
    });
  } else {
    // 사장 등 그 외 직원은 그 AS-CARE 기록에 대한 열람 승인이 있어야 내려받을 수 있습니다.
    await assertArcSensitiveAccess({
      incidentNo: row.incident_no,
      careRecordId: row.care_record_id,
      employee,
      action,
      ip,
    });
  }

  let buffer;

  try {
    buffer = await readFile(path.join(filesRoot(), row.storage_name));
  } catch {
    throw new HttpError(404, "HJ404", "저장된 파일이 없어요. 다시 올려 주세요.");
  }

  return {
    fileName: row.file_name,
    mime: row.mime || "application/octet-stream",
    buffer,
  };
}

export async function deleteArcCareFile(fileId, employee = null) {
  requireDirector(employee);

  const { rows } = await pool.query(
    `delete from public.arc_care_files where id = $1 returning *`,
    [String(fileId ?? "").trim() || null]
  );
  const row = rows[0];

  if (!row) {
    throw new HttpError(404, "HJ404", "파일을 찾을 수 없어요.");
  }

  try {
    await unlink(path.join(filesRoot(), row.storage_name));
  } catch {
    // 파일이 이미 지워졌어도 색인 정리는 끝난 것으로 봅니다.
  }

  return { file: mapFileRow(row) };
}

export function arcFilesHealth() {
  return {
    maxFileBytes: MAX_FILE_BYTES,
    extensions: Object.keys(EXTENSION_MIME),
    root: filesRoot(),
  };
}
