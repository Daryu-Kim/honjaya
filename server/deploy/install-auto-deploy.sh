#!/usr/bin/env bash
# honjaya 자동 배포 설치 (systemd timer). root 로 실행하세요:
#   sudo bash /opt/honjaya/server/deploy/install-auto-deploy.sh
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/honjaya}"
RUN_USER="${RUN_USER:-bar}"
INTERVAL="${INTERVAL:-2min}"

[ "$(id -u)" -eq 0 ] || { echo "root 로 실행하세요: sudo bash $0" >&2; exit 1; }
[ -d "$REPO_DIR/.git" ] || { echo "git 저장소가 아닙니다: $REPO_DIR" >&2; exit 1; }
id "$RUN_USER" >/dev/null 2>&1 || { echo "사용자 없음: $RUN_USER" >&2; exit 1; }

chmod +x "$REPO_DIR/server/deploy/auto-deploy.sh"

cat > /etc/systemd/system/honjaya-deploy.service <<UNIT
[Unit]
Description=honjaya auto deploy (git pull + docker compose up)
Wants=network-online.target
After=network-online.target docker.service

[Service]
Type=oneshot
User=$RUN_USER
WorkingDirectory=$REPO_DIR
Environment=HOME=/home/$RUN_USER
Environment=REPO_DIR=$REPO_DIR
ExecStart=/usr/bin/bash $REPO_DIR/server/deploy/auto-deploy.sh
Nice=10
UNIT

cat > /etc/systemd/system/honjaya-deploy.timer <<UNIT
[Unit]
Description=honjaya auto deploy - git 변경 확인

[Timer]
OnBootSec=2min
OnUnitActiveSec=$INTERVAL
AccuracySec=20s
Unit=honjaya-deploy.service

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now honjaya-deploy.timer

echo "설치 완료. 확인:"
systemctl list-timers honjaya-deploy.timer --no-pager
echo
echo "지금 한 번 실행:  sudo systemctl start honjaya-deploy.service"
echo "로그 보기:        journalctl -u honjaya-deploy.service -n 50 --no-pager"