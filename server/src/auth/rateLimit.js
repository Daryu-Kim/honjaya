// 로그인 브루트포스 방지용 메모리 기반 제한기.
// 서버가 한 대(사장님 맥북)뿐이라 Redis 없이 메모리로 충분합니다.
// 서버를 재시작하면 초기화되지만, 그 정도면 공격 비용 대비 충분합니다.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const attempts = new Map();

function now() {
  return Date.now();
}

function prune() {
  const current = now();

  for (const [key, entry] of attempts) {
    if (entry.resetAt <= current) {
      attempts.delete(key);
    }
  }
}

export function checkLoginRate(key) {
  const entry = attempts.get(key);

  if (!entry || entry.resetAt <= now()) {
    return { blocked: false, remaining: MAX_ATTEMPTS };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { blocked: true, retryAfterMs: entry.resetAt - now(), remaining: 0 };
  }

  return { blocked: false, remaining: MAX_ATTEMPTS - entry.count };
}

export function recordLoginFailure(key) {
  prune();

  const current = now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt <= current) {
    attempts.set(key, { count: 1, resetAt: current + WINDOW_MS });
    return;
  }

  entry.count += 1;
}

export function clearLoginFailures(key) {
  attempts.delete(key);
}
