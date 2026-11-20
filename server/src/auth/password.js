// 직원 비밀번호 해시. 외부 의존성 없이 Node 내장 scrypt 를 씁니다.
//
// 저장 형식: scrypt$N$r$p$salt(hex)$derived(hex)
// 파라미터를 함께 저장하므로 나중에 비용을 올려도 기존 비밀번호를 검증할 수 있습니다.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const PARAMS = { N: 16384, r: 8, p: 1 };
const PREFIX = "scrypt";

export const MIN_PASSWORD_LENGTH = 8;

export function validatePasswordStrength(password) {
  const value = String(password ?? "");

  if (value.length < MIN_PASSWORD_LENGTH) {
    return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.`;
  }

  if (value.length > 200) {
    return "비밀번호가 너무 길어요.";
  }

  return null;
}

export async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derived = await scryptAsync(String(password), salt, KEY_LENGTH, PARAMS);

  return [PREFIX, PARAMS.N, PARAMS.r, PARAMS.p, salt, derived.toString("hex")].join("$");
}

export async function verifyPassword(password, stored) {
  const parts = String(stored ?? "").split("$");

  if (parts.length !== 6 || parts[0] !== PREFIX) {
    return false;
  }

  const [, rawN, rawR, rawP, salt, hash] = parts;
  const params = { N: Number(rawN), r: Number(rawR), p: Number(rawP) };

  if (!Number.isFinite(params.N) || !Number.isFinite(params.r) || !Number.isFinite(params.p)) {
    return false;
  }

  const expected = Buffer.from(hash, "hex");

  if (expected.length === 0) {
    return false;
  }

  let derived;

  try {
    derived = await scryptAsync(String(password ?? ""), salt, expected.length, params);
  } catch {
    return false;
  }

  if (derived.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(derived, expected);
}
