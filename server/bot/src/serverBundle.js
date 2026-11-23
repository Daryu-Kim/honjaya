// P12B-1 — 메인 서버(애플리케이션) 번들.
// 저장소의 코드·설정 파일을 tar.gz 하나로 묶습니다.
// 이 결과물은 Discord 로 나가므로 절대 포함하면 안 되는 것을 먼저 걸러냅니다.
//   - 비밀값: .env, .env.*(단 .env.example 은 문서라 포함)
//   - 의존성·빌드 산출물: node_modules, dist, coverage
//   - 런타임 데이터: backups, pgdata, csv, 로그
import { spawn } from "node:child_process";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  ".nuxt",
  ".output",
  ".vercel",
  ".cache",
  "backups",
  "pgdata",
  "csv",
  "migration-data",
  "__pycache__",
]);

const SKIP_FILE_PATTERNS = [
  /^\.env$/i,
  /^\.env\.(?!example$)/i,
  // .vapid.local.json 처럼 *.local.json 에는 개발용 비밀키가 들어갑니다.
  /\.local\.json$/i,
  /\.log$/i,
  /^recipes-/i,
  /^\.DS_Store$/i,
  /\.tmp$/i,
];

// 저장소가 통째로 잘못 마운트돼도 봇이 디스크를 채우지 않도록 상한을 둡니다.
const MAX_FILES = 20000;
const MAX_BYTES = 512 * 1024 * 1024;

function shouldSkipFile(name) {
  return SKIP_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * root 아래에서 백업할 파일 목록을 상대 경로로 모읍니다.
 * tar 는 이 목록만 그대로 받으므로, 여기서 제외한 것은 결과물에 들어가지 않습니다.
 */
export async function collectSourceEntries(root) {
  const rootInfo = await stat(root).catch(() => null);

  if (!rootInfo || !rootInfo.isDirectory()) {
    throw new Error(`서버 소스 폴더를 찾을 수 없습니다: ${root}`);
  }

  const entries = [];
  const skipped = { dirs: 0, files: 0 };
  let totalBytes = 0;

  async function walk(dir) {
    const dirents = await readdir(dir, { withFileTypes: true }).catch(() => []);

    dirents.sort((a, b) => a.name.localeCompare(b.name));

    for (const dirent of dirents) {
      const path = join(dir, dirent.name);

      if (dirent.isDirectory()) {
        if (SKIP_DIRS.has(dirent.name)) {
          skipped.dirs += 1;
          continue;
        }

        await walk(path);
        continue;
      }

      if (!dirent.isFile() || shouldSkipFile(dirent.name)) {
        skipped.files += 1;
        continue;
      }

      const info = await stat(path).catch(() => null);

      if (!info) {
        skipped.files += 1;
        continue;
      }

      entries.push({
        // 윈도우에서 작업해도 tar 안에서는 항상 '/' 구분자를 씁니다.
        path: relative(root, path).split(sep).join("/"),
        sizeBytes: info.size,
      });
      totalBytes += info.size;

      if (entries.length > MAX_FILES || totalBytes > MAX_BYTES) {
        const mb = Math.round(totalBytes / 1024 / 1024);

        throw new Error(
          `서버 백업 대상이 너무 큽니다(파일 ${entries.length}개, ${mb}MB). ` +
            "BACKUP_SOURCE_DIR 마운트를 확인해 주세요.",
        );
      }
    }
  }

  await walk(root);

  return { entries, totalBytes, skipped };
}

function runTar(root, targetPath, listPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-czf", targetPath, "-C", root, "-T", listPath], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-2000);
    });

    child.on("error", (error) => {
      reject(new Error(`tar 실행 실패: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`tar 실패 (exit ${code}): ${stderr.trim() || "출력 없음"}`));
    });
  });
}

/** root 를 tar.gz 로 묶고 실제로 만들어진 파일 크기를 돌려줍니다. */
export async function bundleSource({ root, targetPath, listPath }) {
  const { entries, totalBytes, skipped } = await collectSourceEntries(root);

  if (entries.length === 0) {
    throw new Error("백업할 서버 파일이 없습니다. BACKUP_SOURCE_DIR 를 확인해 주세요.");
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(listPath, `${entries.map((entry) => entry.path).join("\n")}\n`);

  await runTar(root, targetPath, listPath);

  const info = await stat(targetPath).catch(() => null);

  if (!info || info.size === 0) {
    throw new Error("tar 결과물이 비어 있습니다.");
  }

  return {
    skipped,
    fileCount: entries.length,
    sourceBytes: totalBytes,
    archiveBytes: info.size,
  };
}
