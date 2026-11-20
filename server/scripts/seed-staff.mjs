// 최초 사장(OWNER) 계정을 만드는 스크립트.
//
// 사용법:
//   npm run staff:seed                 # 계정이 없을 때만 생성하고 비밀번호를 한 번 출력
//   npm run staff:seed -- --reset-password  # 기존 사장 비밀번호 재발급
//
// 비밀번호는 저장소에 남기지 않습니다. 환경변수 STAFF_OWNER_PASSWORD 가 있으면 그 값을,
// 없으면 무작위 값을 만들어 화면에 한 번만 출력합니다.
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

import { hashPassword, validatePasswordStrength } from "../src/auth/password.js";
import { pool, closePool } from "../src/db.js";

const CHARSET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomPassword(length = 12) {
  const bytes = randomBytes(length);
  let result = "";

  for (let i = 0; i < length; i += 1) {
    result += CHARSET[bytes[i] % CHARSET.length];
  }

  return result;
}

async function tableExists(client) {
  const result = await client.query(`select to_regclass('public.employees') as name`);

  return Boolean(result.rows[0]?.name);
}

export async function seedStaff({ resetPassword = false, log = console } = {}) {
  const loginId = String(process.env.STAFF_OWNER_LOGIN || "owner").trim().toLowerCase();
  const name = String(process.env.STAFF_OWNER_NAME || "사장").trim();
  const envPassword = String(process.env.STAFF_OWNER_PASSWORD || "");

  if (!(await tableExists(pool))) {
    throw new Error("employees 테이블이 없습니다. 먼저 `npm run db:apply` 를 실행해 주세요.");
  }

  const existing = await pool.query(
    `select id, login_id, name from public.employees where role = 'OWNER' order by created_at limit 1`
  );

  const owner = existing.rows[0];

  if (owner && !resetPassword) {
    log.info?.(`[seed] 사장 계정이 이미 있습니다(아이디: ${owner.login_id}). 변경하지 않았습니다.`);
    return { created: false, loginId: owner.login_id };
  }

  const password = envPassword || randomPassword();
  const strengthError = validatePasswordStrength(password);

  if (strengthError) {
    throw new Error(`STAFF_OWNER_PASSWORD 값이 규칙에 맞지 않습니다: ${strengthError}`);
  }

  const passwordHash = await hashPassword(password);

  if (owner) {
    await pool.query(
      `update public.employees
          set password_hash = $2, is_active = true, updated_at = now()
        where id = $1`,
      [owner.id, passwordHash]
    );

    await pool.query(
      `update public.staff_sessions set revoked_at = now()
        where employee_id = $1 and revoked_at is null`,
      [owner.id]
    );

    log.info?.("[seed] 사장 계정 비밀번호를 재발급했습니다.");
    log.info?.(`  아이디: ${owner.login_id}`);
    log.info?.(`  비밀번호: ${password}`);
    log.info?.("  위 비밀번호는 다시 표시되지 않습니다. 지금 안전한 곳에 저장하세요.");

    return { created: false, reset: true, loginId: owner.login_id };
  }

  const inserted = await pool.query(
    `insert into public.employees (id, login_id, password_hash, name, role)
     values (gen_random_uuid()::text, $1, $2, $3, 'OWNER')
     returning id, login_id`,
    [loginId, passwordHash, name]
  );

  log.info?.("[seed] 사장 계정을 만들었습니다.");
  log.info?.(`  아이디: ${inserted.rows[0].login_id}`);
  log.info?.(`  비밀번호: ${password}`);
  log.info?.("  위 비밀번호는 다시 표시되지 않습니다. 지금 안전한 곳에 저장하세요.");

  return { created: true, loginId: inserted.rows[0].login_id };
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const resetPassword = process.argv.includes("--reset-password");

  try {
    await seedStaff({ resetPassword, log: console });
    await closePool();
  } catch (error) {
    console.error("[seed] 실패:", error.message);
    await closePool();
    process.exit(1);
  }
}
