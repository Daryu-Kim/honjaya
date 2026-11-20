#!/usr/bin/env bash
# Auto-deploy: origin/master 가 앞서 있으면 pull + rebuild + health check.
# systemd timer(honjaya-deploy.timer)가 주기적으로 호출합니다.
set -uo pipefail

# 자기 자신을 /tmp 사본으로 실행합니다. git 이 이 파일을 교체할 때
# 실행 중인 스크립트를 덮어쓰면 Text file busy 가 나기 때문입니다.
if [ -z "${HONJAYA_SELF:-}" ]; then
  SELF_COPY="$(mktemp /tmp/honjaya-deploy.XXXXXX.sh)"
  cp "$0" "$SELF_COPY"
  HONJAYA_SELF=1 exec bash "$SELF_COPY" "$@"
fi
trap 'rm -f -- "$0"' EXIT

REPO_DIR="${REPO_DIR:-/opt/honjaya}"
BRANCH="${BRANCH:-master}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/health}"
FORCE="${FORCE:-0}"

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
die() { log "FAIL: $*"; exit 1; }

cd "$REPO_DIR" || die "repo 없음: $REPO_DIR"

# 로컬에서 파일을 고쳐둔 상태면 git pull 이 꼬이므로 건너뜁니다.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  die "추적 중인 파일이 수정되어 있음 - 정리 후 다시 시도하세요 (git status)"
fi

REMOTE_REV="$(git ls-remote origin "refs/heads/$BRANCH" 2>/dev/null | cut -f1)"
[ -n "$REMOTE_REV" ] || die "origin 에 접속할 수 없음 (네트워크/DNS 확인)"

LOCAL_REV="$(git rev-parse HEAD)"

if [ "$REMOTE_REV" = "$LOCAL_REV" ]; then
  [ "$FORCE" = "1" ] || exit 0
  log "강제 재배포 (변경 없음, HEAD ${LOCAL_REV:0:7})"
else
  log "변경 감지: ${LOCAL_REV:0:7} -> ${REMOTE_REV:0:7}"
fi
git fetch --prune --quiet origin "$BRANCH" || die "git fetch 실패"

# 새 커밋에 들어있는 파일과 이름이 같은 untracked 파일이 있으면 merge 가 막힙니다.
# 내용이 완전히 같을 때만 지우고, 다르면 손대지 않고 중단합니다.
while IFS= read -r f; do
  [ -n "$f" ] || continue
  git cat-file -e "origin/$BRANCH:$f" 2>/dev/null || continue
  if [ "$(git hash-object -- "$f" 2>/dev/null)" = "$(git rev-parse "origin/$BRANCH:$f")" ]; then
    rm -f -- "$f"
    log "동일 내용의 untracked 파일 정리: $f"
  else
    die "untracked 파일이 새 커밋과 충돌: $f (내용이 달라 자동 처리하지 않음)"
  fi
done < <(git ls-files --others --exclude-standard)

git merge --ff-only --quiet "origin/$BRANCH" || die "fast-forward 불가 (로컬 커밋 또는 파일 충돌?) - 수동 확인 필요"
log "소스 갱신 완료: $(git log --oneline -1)"

cd "$REPO_DIR/server" || die "server 디렉터리 없음"
log "이미지 빌드 + 재기동 시작"
docker compose up -d --build || die "docker compose 실패 (컨테이너는 이전 버전으로 계속 동작)"

# 최대 60초 대기하며 헬스체크
for _ in $(seq 1 12); do
  if curl -fsS -m 3 "$HEALTH_URL" >/dev/null 2>&1; then
    log "배포 완료 - 헬스체크 정상"
    exit 0
  fi
  sleep 5
done

die "헬스체크 실패 ($HEALTH_URL) - docker compose logs api 확인"