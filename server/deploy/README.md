# 혼자야 노트북 서버 배포 가이드

집에 남는 노트북(i5-5300U / 16GB) 한 대에 **DB + API + 프런트엔드**를 모두 올리는 절차입니다.
Docker Compose 하나로 3개 컨테이너(`db`, `api`, `web`)가 뜨고, `web`(nginx)이 정적 파일과 API를 같은 오리진에서 함께 서빙합니다.

```
                        ┌──────────────── 노트북 (Ubuntu 24.04) ────────────────┐
   손님 폰 / 태블릿      │                                                      │
        │               │   ┌─────────────┐        ┌──────────────┐            │
        └── HTTPS ──────┼──▶│ web (nginx) │───────▶│  api (Node)  │            │
            (Cloudflare │   │  :80        │  /rest/v1  :3000     │            │
             Tunnel)    │   │  dist 정적   │  /api      │        │            │
                        │   └─────────────┘        └──────┬───────┘            │
                        │                                 │                    │
                        │                          ┌──────▼───────┐            │
                        │                          │ db (postgres)│            │
                        │                          │ ./pgdata     │            │
                        │                          └──────────────┘            │
                        └──────────────────────────────────────────────────────┘
```

`web` 이 `/rest/v1` 과 `/api` 를 프록시하므로 **프런트엔드는 API 주소를 몰라도 됩니다**(`VUE_APP_SUPABASE_URL=/`).
그래서 같은 `dist` 로 `http://localhost`, `http://192.168.x.x`, `https://bar.example.com` 어디서든 동작하고,
도메인이 바뀌어도 다시 빌드할 필요가 없습니다.

---

## 0. 준비물

| 항목 | 내용 |
| --- | --- |
| 노트북 | i5-5300U / 16GB (SSD 교체 권장) |
| OS | Ubuntu Server 24.04 LTS (설치 USB 필요) |
| 네트워크 | 공유기 LAN 케이블 연결 권장(Wi-Fi보다 안정적) |
| 도메인 | 외부 접속 시 필요 (Cloudflare 무료 계정) |
| 백업 | Supabase CSV 백업 폴더 |

---

## 1. Ubuntu Server 설치

1. [Ubuntu Server 24.04 LTS](https://ubuntu.com/download/server) ISO 로 설치 USB를 만듭니다.
2. 설치 중 **OpenSSH server** 를 반드시 체크합니다.
3. 사용자 이름은 `bar` 등 기억하기 쉬운 것으로 만들고, 이후 명령은 모두 이 계정 기준입니다.

설치 후 SSH 접속:

```bash
ssh bar@<노트북 IP>
```

---

## 2. OS 기본 설정 (가장 중요)

### 2-1. 절전/덮개 닫힘 끄기

노트북이 잠들면 매장 전체가 멈춥니다.

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

덮개를 닫아도 계속 돌리려면:

```bash
sudo sed -i 's/^#\?HandleLidSwitch=.*/HandleLidSwitch=ignore/' /etc/systemd/logind.conf
sudo sed -i 's/^#\?HandleLidSwitchExternalPower=.*/HandleLidSwitchExternalPower=ignore/' /etc/systemd/logind.conf
sudo systemctl restart systemd-logind
```

### 2-2. IP 고정

공유기 관리 화면에서 **DHCP 고정 할당**(MAC 주소 기준)을 걸어두는 방법을 권장합니다.
우분투에서 직접 고정하려면:

```bash
sudo nano /etc/netplan/50-cloud-init.yaml
```

```yaml
network:
  version: 2
  ethernets:
    enp3s0:                     # ip a 로 실제 인터페이스 이름 확인
      dhcp4: false
      addresses: [192.168.0.50/24]
      routes:
        - to: default
          via: 192.168.0.1      # 공유기 IP
      nameservers:
        addresses: [1.1.1.1, 8.8.8.8]
```

```bash
sudo chmod 600 /etc/netplan/50-cloud-init.yaml
sudo netplan apply
```

### 2-3. 자동 시간 동기화

```bash
sudo timedatectl set-timezone Asia/Seoul
sudo timedatectl set-ntp true
```

### 2-4. BIOS 설정

- **AC 전원 연결 시 자동 켜짐** 활성화 (정전 후 자동 복구)
- 배터리 걱정이 없으면 배터리 제거 가능

---

## 3. Docker 설치

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker                 # 또는 재로그인
docker --version
docker compose version
```

---

## 4. 코드 가져오기

```bash
sudo mkdir -p /opt && sudo chown $USER:$USER /opt
cd /opt
git clone https://github.com/Daryu-Kim/honjaya.git
cd honjaya
```

---

## 5. 서버 환경변수 설정

```bash
cd /opt/honjaya/server
cp .env.example .env
nano .env
```

최소한 아래 2개는 **반드시** 바꿉니다.

```dotenv
# DB 비밀번호 (영문+숫자만 사용 — URL 에 들어가므로 특수문자는 피하세요)
POSTGRES_PASSWORD=바꿔주세요1234

# 프런트엔드가 보낼 API 키 (아무 긴 문자열. 비우면 인증이 꺼집니다)
ANON_KEY=바꿔주세요-임의의긴문자열

# 배포 도메인만 허용 (터널 도메인이 없으면 * 로 두고 나중에 바꾸세요)
CORS_ORIGINS=https://bar.example.com
```

> `docker compose` 가 같은 폴더의 `.env` 를 자동으로 읽어 `${POSTGRES_PASSWORD}` 등을 채웁니다.
> `ANON_KEY` 값은 6단계 프런트엔드 빌드에 그대로 다시 씁니다.

---

## 6. 프런트엔드 빌드 (`dist`)

`VUE_APP_*` 값은 **빌드 시점에 박히므로** 반드시 빌드를 거쳐야 합니다.

### 방법 A — 이 Windows PC에서 빌드해서 복사 (권장)

빌드 도구를 노트북에 설치할 필요가 없어 가장 빠릅니다.

```powershell
# 1) API 주소를 "/" (같은 오리진) 로 두고 빌드
cd C:\dev\honjaya
$env:VUE_APP_SUPABASE_URL = "/"
$env:VUE_APP_SUPABASE_PUBLISHABLE_KEY = "<server/.env 의 ANON_KEY 값>"

pnpm run build
```

```powershell
# 2) dist 를 노트북으로 복사 (dist 폴더가 새로 생깁니다)
scp -r dist bar@<노트북 IP>:/opt/honjaya/
```

> 환경변수는 셸에 직접 넣어도 빌드에 그대로 반영됩니다(`VUE_APP_` 접두사만 맞추면 됨).
> `.env.production.local` 파일로 만들고 싶다면 VS Code/메모장에서 **UTF-8(BOM 없이)** 로 저장하세요.
> Windows PowerShell 5.1 의 `Set-Content -Encoding utf8` 은 BOM 을 붙여서 첫 키를 망칩니다.

### 방법 B — 노트북에서 직접 빌드

```bash
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pnpm@10          # 저장소가 pnpm-lock.yaml 을 사용합니다

cd /opt/honjaya
pnpm install --frozen-lockfile

cat > .env.production.local <<'EOF'
VUE_APP_SUPABASE_URL=/
VUE_APP_SUPABASE_PUBLISHABLE_KEY=<5단계의 ANON_KEY>
EOF

pnpm run build
```

> `VUE_APP_SUPABASE_URL=/` 로 두면 접속한 오리진을 그대로 씁니다.
> nginx 를 거치지 않고 API 를 직접 호출하려면 `http://<노트북 IP>:3000` 처럼 절대 주소를 넣습니다.

빌드 결과는 `/opt/honjaya/dist` 에 생깁니다. `server/docker-compose.yml` 의 `web` 서비스가 이 폴더를 그대로 물려서 서빙합니다.

---

## 7. 컨테이너 기동

```bash
cd /opt/honjaya/server
docker compose up -d --build
docker compose ps
```

정상이면 `db`(healthy), `api`, `web` 3개가 `running` 으로 보입니다.

```bash
docker compose logs -f api        # 로그 확인 (Ctrl+C 로 빠져나옴)
```

---

## 8. 스키마 적용 + 데이터 이관 (최초 1회)

```bash
cd /opt/honjaya/server

# 1) 스키마 + 패치 적용 (여러 번 실행해도 안전)
docker compose run --rm migrate

# 2) Supabase CSV 백업 가져오기
mkdir -p csv
cp ~/supabase-export/*_rows*.csv csv/     # 또는 scp 로 PC 에서 복사
docker compose run --rm import
```

`import` 는 마지막에 아래처럼 검증 결과를 출력합니다.

```
categories             13
products               112        (recipe_info 77)
order_sheets          384
orders               1016
active_order_sheets     5
counters              384
orders(끊긴 주문서)         0
매출합계(마감분)       16360500
```

미리 확인만 하려면 (`docker compose run` 뒤에 인자를 주면 서비스의 `command:` 가 **통째로 바뀌므로** 전체 명령을 적어야 합니다):

```bash
docker compose run --rm import node scripts/import-supabase-export.mjs --dir /csv --dry-run
```

> `pgdata/` 폴더가 이미 있는 상태에서 `POSTGRES_PASSWORD` 를 바꾸면 DB 에 접속할 수 없습니다.
> 비밀번호를 바꾸려면 백업 후 `pgdata/` 를 지우고 8단계를 다시 실행하세요.

---

## 9. 동작 확인

```bash
# nginx → api 프록시까지 한 번에 확인
curl http://localhost/health
# {"ok":true,"db":"up",...}

# 실제 데이터
ANON=$(grep '^ANON_KEY=' /opt/honjaya/server/.env | cut -d= -f2-)
curl -s -H "apikey: $ANON" "http://localhost/rest/v1/categories?select=id,name&limit=3"

# 프런트엔드
curl -s -o /dev/null -w "%{http_code}\n" http://localhost/     # 200

# 다른 PC/폰에서 (같은 Wi-Fi)
#   http://<노트북 IP>/
```

같은 네트워크의 폰에서 열었을 때 화면이 나오면 1차 성공입니다.

---

## 10. 외부 접속 (Cloudflare Tunnel)

공유기 포트를 열지 않고 HTTPS 를 붙이는 방법입니다.

```bash
# 1) 설치
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# 2) 로그인 + 터널 생성
cloudflared tunnel login
cloudflared tunnel create honjaya
cloudflared tunnel route dns honjaya bar.example.com
```

`/etc/cloudflared/config.yml`:

```yaml
tunnel: <위에서 출력된 TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: bar.example.com
    service: http://localhost:80
  - service: http_status:404
```

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

이제 `https://bar.example.com` 으로 접속됩니다.
프런트엔드가 `/` 기준으로 API를 호출하므로 **도메인이 바뀌어도 재빌드가 필요 없습니다**(`CORS_ORIGINS` 만 갱신).

> Cloudflare Tunnel 은 SSE(`/api/events`)를 그대로 통과시킵니다.

---

## 11. 자동 백업

```bash
sudo mkdir -p /var/backups/honjaya
sudo chown $USER:$USER /var/backups/honjaya
chmod +x /opt/honjaya/server/deploy/backup-db.sh

# 수동 1회 테스트
/opt/honjaya/server/deploy/backup-db.sh
```

cron 등록 (`crontab -e`):

```cron
# 매일 05:00 백업, 14일 보관
0 5 * * * /opt/honjaya/server/deploy/backup-db.sh >> /var/log/honjaya-backup.log 2>&1
```

복구:

```bash
cd /opt/honjaya/server
docker compose exec -T db pg_restore -U postgres -d honjaya --clean --if-exists \
  < /var/backups/honjaya/honjaya-20261120-050000.dump
```

> 백업 파일은 **다른 기기**에도 복사해 두세요(`scp`, 외장하드, Syncthing 등).
> 같은 노트북에만 있으면 디스크 고장 시 함께 사라집니다.

---

## 12. 업데이트(재배포)

```bash
cd /opt/honjaya
git pull

# 프런트엔드를 수정했다면 6단계대로 다시 빌드 (dist 갱신)
cd server
docker compose up -d --build
```

`dist` 는 볼륨으로 물려 있으므로 **재빌드만 하면 nginx 재시작 없이** 반영됩니다.
(단, 브라우저는 `index.html` 을 no-cache 로 받고 서비스 워커가 새 번들을 받아옵니다.)

---

## 트러블슈팅

| 증상 | 원인 / 해결 |
| --- | --- |
| `web` 접속 시 403 / 404 | `../dist` 가 비어 있음 → 6단계 빌드 확인 |
| 502 Bad Gateway | `api` 컨테이너 비정상 → `docker compose logs api` |
| `/health` 는 되는데 데이터가 안 나옴 | `ANON_KEY` 불일치 → `server/.env` 와 프런트 빌드 값 확인 |
| 브라우저 콘솔에 CORS 에러 | `CORS_ORIGINS` 에 접속 도메인 추가 후 `docker compose up -d` |
| DB 접속 실패(`password authentication failed`) | `pgdata/` 가 다른 비밀번호로 만들어짐 → 8단계 주의사항 참고 |
| 폰에서 `localhost` 로 접속 안 됨 | 폰에서는 `localhost` 가 폰 자신입니다. 노트북 IP 또는 터널 도메인을 쓰세요 |
| 같은 Wi-Fi 인데 폰에서 접속 안 됨 | `sudo ufw status` 로 방화벽 확인 → `sudo ufw allow 80/tcp` |
| 화면이 예전 버전 | 강력 새로고침(Ctrl+Shift+R) 또는 서비스 워커 초기화 |
| `docker compose run --rm import --dry-run` 이 "executable file not found" | 인자가 서비스 `command` 를 대체함 → 8단계의 전체 명령 사용 |
| `pnpm run build` 가 `packages field missing or empty` 로 실패 | pnpm 9 이하 → `npm i -g pnpm@10` |

자주 쓰는 명령:

```bash
docker compose ps
docker compose logs -f api
docker compose restart api
docker compose down            # 중지 (데이터는 pgdata/ 에 유지)
docker compose up -d           # 다시 시작
```
