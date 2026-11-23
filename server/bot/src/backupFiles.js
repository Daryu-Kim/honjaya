// 백업 파일의 암호화·분할·재조립. DB 나 Discord 와 무관한 순수 파일 처리만 담당합니다.
//
// 파일 레이아웃:  HJBK1 | iv(12) | tag(16) | ciphertext(gzip 한 pg_dump -Fc)
//   - 5바이트 매직으로 "이건 우리 백업"임을 식별합니다.
//   - GCM 태그가 헤더에 오지만 암호화가 끝나야 값이 나오므로,
//     먼저 0으로 채워 헤더를 쓰고 마지막에 16바이트만 덮어씁니다(파일 재작성 없음).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { once } from "node:events";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";

const MAGIC = Buffer.from("HJBK1", "ascii");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + IV_BYTES + TAG_BYTES;
const ALGORITHM = "aes-256-gcm";

export const BACKUP_FILE_SUFFIX = ".dump.gz.enc";

/** BACKUP_ENCRYPTION_KEY(base64 32바이트 또는 64자 hex)를 Buffer 로 변환합니다. */
export function parseKey(raw) {
  const value = String(raw ?? "").trim();

  if (!value) {
    throw new Error("BACKUP_ENCRYPTION_KEY 가 설정되지 않았습니다.");
  }

  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");

  if (key.length !== 32) {
    throw new Error(
      "BACKUP_ENCRYPTION_KEY 는 32바이트여야 합니다. `openssl rand -base64 32` 결과를 넣어 주세요.",
    );
  }

  return key;
}

export function generateKey() {
  return randomBytes(32).toString("base64");
}

export async function sha256File(path) {
  const hash = createHash("sha256");

  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

/**
 * 원본 스트림(pg_dump stdout)을 gzip + AES-256-GCM 으로 targetPath 에 저장합니다.
 * 반환값의 sha256 은 최종 파일 전체(헤더 포함)의 해시입니다.
 */
export async function encryptToFile({ source, targetPath, key }) {
  const iv = randomBytes(IV_BYTES);
  const header = Buffer.concat([MAGIC, iv, Buffer.alloc(TAG_BYTES)]);

  await writeFile(targetPath, header);

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });

  await pipeline(
    source,
    createGzip({ level: 9 }),
    cipher,
    createWriteStream(targetPath, { flags: "r+", start: HEADER_BYTES }),
  );

  const handle = await open(targetPath, "r+");

  try {
    await handle.write(cipher.getAuthTag(), 0, TAG_BYTES, MAGIC.length + IV_BYTES);
  } finally {
    await handle.close();
  }

  const info = await stat(targetPath);

  return {
    path: targetPath,
    sizeBytes: info.size,
    sha256: await sha256File(targetPath),
    ivHex: iv.toString("hex"),
  };
}

/** 암호화된 파일을 복호화 + gunzip 해서 평문 pg_dump 파일로 저장합니다. */
export async function decryptToDumpFile({ sourcePath, targetPath, key }) {
  const handle = await open(sourcePath, "r");
  const head = Buffer.alloc(HEADER_BYTES);

  try {
    const { bytesRead } = await handle.read(head, 0, HEADER_BYTES, 0);

    if (bytesRead < HEADER_BYTES || !head.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error("백업 파일 헤더가 HJBK1 이 아닙니다. 손상되었거나 다른 파일입니다.");
    }
  } finally {
    await handle.close();
  }

  const iv = head.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = head.subarray(MAGIC.length + IV_BYTES, HEADER_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });

  decipher.setAuthTag(tag);

  await pipeline(
    createReadStream(sourcePath, { start: HEADER_BYTES }),
    decipher,
    createGunzip(),
    createWriteStream(targetPath),
  );

  const info = await stat(targetPath);

  return { path: targetPath, sizeBytes: info.size };
}

export function partFilename(baseName, partNo, partCount) {
  const pad = Math.max(3, String(partCount).length);

  return `${baseName}.part-${String(partNo).padStart(pad, "0")}-of-${String(partCount).padStart(pad, "0")}`;
}

/** 암호화 파일을 partSizeBytes 단위로 잘라 dir 아래에 저장하고 조각 메타데이터를 반환합니다. */
export async function splitFile({ sourcePath, dir, partSizeBytes, baseName }) {
  const total = (await stat(sourcePath)).size;
  const size = Math.max(1, Math.trunc(partSizeBytes));
  const partCount = Math.max(1, Math.ceil(total / size));
  const parts = [];

  for (let index = 0; index < partCount; index += 1) {
    const start = index * size;
    const end = Math.min(start + size, total) - 1;
    const filename = partFilename(baseName, index + 1, partCount);
    const path = join(dir, filename);

    if (total === 0) {
      await writeFile(path, Buffer.alloc(0));
    } else {
      await pipeline(createReadStream(sourcePath, { start, end }), createWriteStream(path));
    }

    const info = await stat(path);

    parts.push({
      partNo: index + 1,
      partCount,
      filename,
      path,
      sizeBytes: info.size,
      sha256: await sha256File(path),
    });
  }

  return { partCount, parts };
}

/** 조각들을 part_no 순서로 이어 붙입니다. */
export async function reassembleFiles({ parts, targetPath }) {
  const out = createWriteStream(targetPath);

  try {
    for (const part of parts) {
      for await (const chunk of createReadStream(part.path)) {
        if (!out.write(chunk)) {
          await once(out, "drain");
        }
      }
    }

    out.end();
    await once(out, "finish");
  } catch (error) {
    out.destroy();
    throw error;
  }

  const info = await stat(targetPath);

  return { path: targetPath, sizeBytes: info.size };
}

/** 진행률 로그를 위해 스트림을 통과시키는 카운터(선택). */
export function byteCounter(onTick) {
  let total = 0;

  return new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      onTick?.(total);
      callback(null, chunk);
    },
  });
}
