// P14 — ARC SAFETY 민감 컬럼 암복호화.
//
// 디스코드 백업에 ARC 테이블이 그대로 포함되기로 했으므로(사장 확정),
// 보호는 백업 설정이 아니라 데이터 자체에 둡니다. 즉 상세 건강정보는 앱에서
// 암호화해서 *_enc 컬럼에만 저장하고, DB 덤프·백업에는 암호문만 남습니다.
//
// 저장 형식:  v1:<base64(iv(12) | tag(16) | ciphertext)>
//   - 앞의 v1: 이 키 버전입니다. 나중에 키를 교체하면 v2: 로 공존시킬 수 있습니다.
//   - 키는 ARC_FIELD_KEY(32바이트 base64 또는 64자 hex) 이며 server/.env 에만 있습니다.
//     백업(.env 제외)으로 복구되지 않으므로 오프라인 사본을 따로 보관해야 합니다.
//   - 봉투 구현은 server/bot/src/backupFiles.js 와 같은 방식(AES-256-GCM)입니다.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { HttpError } from "./http/errors.js";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey = null;
let cachedRaw = null;

/** ARC_FIELD_KEY → Buffer. 값이 바뀌면 다시 파싱합니다. */
export function parseArcKey(raw) {
  const value = String(raw ?? "").trim();

  if (!value) {
    throw new HttpError(
      503,
      "HJ503",
      "민감정보 암호화 키(ARC_FIELD_KEY)가 설정되지 않았어요. 서버 관리자에게 문의해 주세요."
    );
  }

  if (cachedKey && cachedRaw === value) {
    return cachedKey;
  }

  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");

  if (key.length !== 32) {
    throw new HttpError(
      503,
      "HJ503",
      "민감정보 암호화 키(ARC_FIELD_KEY)는 32바이트여야 해요. `openssl rand -base64 32` 결과를 넣어 주세요."
    );
  }

  cachedKey = key;
  cachedRaw = value;

  return key;
}

export function hasArcKey(rawFieldKey) {
  try {
    parseArcKey(rawFieldKey);

    return true;
  } catch {
    return false;
  }
}

/** 평문 → v1 봉투 문자열. 빈 값은 그대로 빈 문자열로 둡니다(컬럼 default ''). */
export function encryptField(rawFieldKey, plain) {
  const text = String(plain ?? "");

  if (!text) {
    return "";
  }

  const key = parseArcKey(rawFieldKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${VERSION}:${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
}

/**
 * v1 봉투 → 평문.
 * 키가 바뀌었거나 값이 손상되면 null 을 돌려줍니다. 화면에는 "복호화 실패"로 표시하고
 * 원문을 절대 로그에 남기지 않습니다.
 */
export function decryptField(rawFieldKey, envelope) {
  const text = String(envelope ?? "").trim();

  if (!text) {
    return "";
  }

  if (!text.startsWith(`${VERSION}:`)) {
    return null;
  }

  let key;

  try {
    key = parseArcKey(rawFieldKey);
  } catch {
    return null;
  }

  const payload = Buffer.from(text.slice(VERSION.length + 1), "base64");

  if (payload.length <= IV_BYTES + TAG_BYTES) {
    return null;
  }

  const iv = payload.subarray(0, IV_BYTES);
  const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });

    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
