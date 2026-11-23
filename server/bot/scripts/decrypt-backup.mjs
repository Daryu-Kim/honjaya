#!/usr/bin/env node
// 암호화 백업 조각을 평문 pg_dump 파일로 되돌리는 운영자용 CLI.
//
//   node scripts/decrypt-backup.mjs --out /tmp/honjaya.pgdump \
//     --base honjaya-20250101T050000Z.dump.gz.enc --dir /backups
//
//   node scripts/decrypt-backup.mjs --out /tmp/honjaya.pgdump \
//     /backups/honjaya-....part-001-of-003 /backups/honjaya-....part-002-of-003 ...
//
// 키는 --key 또는 BACKUP_ENCRYPTION_KEY 환경변수로 받습니다(base64 또는 64자리 hex).
// 결과물은 `pg_restore` 로 바로 복원할 수 있는 custom-format 덤프입니다.
import { readdir, rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { decryptToDumpFile, parseKey, reassembleFiles, sha256File } from "../src/backupFiles.js";

const USAGE = `사용법:
  node scripts/decrypt-backup.mjs --out <출력.dump> [옵션] <part 파일...>

옵션:
  --out <path>       복호화된 pg_dump 파일 경로 (필수)
  --key <key>        BACKUP_ENCRYPTION_KEY (미지정 시 환경변수 사용)
  --dir <path>       조각 파일이 있는 디렉터리 (기본: 현재 디렉터리)
  --base <name>      조각 이름의 기준 파일명. --dir 과 함께 쓰면 조각을 자동으로 찾습니다.
  --sha256 <hex>     재조립 결과를 backup_runs.sha256 과 대조합니다.
  --keep             중간 산출물(재조립 파일)을 남깁니다.
`;

function parseArgs(argv) {
  const options = { dir: process.cwd(), base: "", sha256: "", keep: false, out: "", key: "" };
  const files = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--out":
      case "--key":
      case "--dir":
      case "--base":
      case "--sha256": {
        const value = argv[index + 1];

        if (!value) {
          throw new Error(`${arg} 값이 필요합니다.`);
        }

        options[arg.slice(2)] = value;
        index += 1;
        break;
      }

      case "--keep":
        options.keep = true;
        break;

      case "--help":
      case "-h":
        process.stdout.write(USAGE);
        process.exit(0);
        break;

      default:
        if (arg.startsWith("--")) {
          throw new Error(`알 수 없는 옵션: ${arg}`);
        }

        files.push(arg);
    }
  }

  return { options, files };
}

/** "name.part-002-of-010" → { partNo: 2, partCount: 10 } */
function parsePartName(name) {
  const match = /\.part-(\d+)-of-(\d+)$/.exec(name);

  if (!match) {
    return null;
  }

  return { partNo: Number(match[1]), partCount: Number(match[2]) };
}

async function collectParts({ options, files }) {
  let paths = files.map((file) => resolve(file));

  if (paths.length === 0) {
    if (!options.base) {
      throw new Error("조각 파일을 인자로 주거나 --base 로 기준 파일명을 지정해 주세요.");
    }

    const dir = resolve(options.dir);
    const entries = await readdir(dir);

    paths = entries
      .filter((name) => name.startsWith(`${options.base}.part-`))
      .map((name) => join(dir, name));
  }

  if (paths.length === 0) {
    throw new Error("조각 파일을 찾지 못했습니다.");
  }

  const parts = [];

  for (const path of paths) {
    const meta = parsePartName(basename(path));

    if (!meta) {
      throw new Error(`조각 파일 이름 규칙이 아닙니다: ${basename(path)}`);
    }

    const info = await stat(path).catch(() => null);

    if (!info) {
      throw new Error(`파일이 없습니다: ${path}`);
    }

    parts.push({ ...meta, path, sizeBytes: info.size });
  }

  parts.sort((a, b) => a.partNo - b.partNo);

  const expected = parts[0].partCount;

  if (parts.length !== expected) {
    throw new Error(`조각 수가 맞지 않습니다. 기대 ${expected}개, 실제 ${parts.length}개.`);
  }

  parts.forEach((part, index) => {
    if (part.partCount !== expected) {
      throw new Error(`조각마다 partCount 가 다릅니다: ${basename(part.path)}`);
    }

    if (part.partNo !== index + 1) {
      throw new Error(`조각 번호가 연속되지 않습니다: ${basename(part.path)}`);
    }
  });

  return parts;
}

async function main() {
  const { options, files } = parseArgs(process.argv.slice(2));

  if (!options.out) {
    throw new Error("--out 은 필수입니다.");
  }

  const rawKey = options.key || process.env.BACKUP_ENCRYPTION_KEY || "";

  if (!rawKey) {
    throw new Error("BACKUP_ENCRYPTION_KEY 가 없습니다. --key 로 넘겨주세요.");
  }

  const key = parseKey(rawKey);
  const parts = await collectParts({ options, files });
  const out = resolve(options.out);
  const joinedPath = `${out}.hjbk1`;

  process.stdout.write(`조각 ${parts.length}개를 이어 붙이는 중...\n`);

  const joined = await reassembleFiles({ parts, targetPath: joinedPath });

  process.stdout.write(`재조립 완료: ${joined.sizeBytes} bytes\n`);

  try {
    if (options.sha256) {
      const actual = await sha256File(joinedPath);

      if (actual.toLowerCase() !== String(options.sha256).toLowerCase()) {
        throw new Error(`sha256 불일치. 기대 ${options.sha256}, 실제 ${actual}`);
      }

      process.stdout.write("sha256 일치\n");
    }

    process.stdout.write("복호화 + 압축 해제 중...\n");

    const dump = await decryptToDumpFile({ sourcePath: joinedPath, targetPath: out, key });

    process.stdout.write(`완료: ${out} (${dump.sizeBytes} bytes)\n`);
    process.stdout.write(
      `복원 예시: pg_restore --no-owner --no-privileges --exit-on-error -d <db> ${basename(out)}\n`,
    );
  } finally {
    if (!options.keep) {
      await rm(joinedPath, { force: true }).catch(() => {});
    }
  }
}

main().catch((error) => {
  process.stderr.write(`실패: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
