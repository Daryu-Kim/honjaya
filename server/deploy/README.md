# 혼자야 서버 배포 가이드 (프런트엔드 = Vercel)

집에 남는 노트북(i5-5300U / 16GB) 한 대에 **DB + API** 를 올리는 절차입니다.
프런트엔드(Vue)는 지금처럼 **Vercel** 이 서빙하고, 노트북의 API 를 HTTPS 로 호출합니다.
노트북에서는 `db`(Postgres) · `api`(Node) **2개 컨테이너만** 뜹니다.

```
   손님 폰 / 태블릿
        │
        │ HTTPS
        ├──────────────────▶ Vercel (프런트엔드 정적 파일)
        │                          │
        │                          │  HTTPS + apikey 헤더
        │                          ▼
        │                 ┌────────────────────────┐
        └────────────────▶│ Tailscale Funnel       │
                          │ https://<기기>.<tailnet>.ts.net │
                          └───────────┬────────────┘
                                      │ http://localhost:3000
                          ┌───────────▼────────────┐
                          │ 노트북 (Ubuntu 24.04)   │
                          │   api  (Node)  :3000   │
                          │   db   (Postgres 16)   │
                          └────────────────────────┘
```

- 프런트엔드는 `VUE_APP_SUPABASE_URL=https://<기기>.<tailnet>.ts.net` 으로 빌드되어 API 를 직접 호출합니다. 그래서 **CORS 허용**이 필요합니다(5단계).
- 노트북의 3000 포트는 `127.0.0.1` 에만 열립니다. 인터넷에는 **Tailscale Funnel 로만** 노출되므로 공유기 포트 개방이 필요 없습니다.
- API 응답은 `@fastify/compress` 로 **gzip 압축**되어 나갑니다. 폴링 구조라 같은 JSON 이 반복 전송되는데, 압축만으로 전송량이 6~10배 줄어듭니다(실측: `orders` 791KB → 93KB, `order_sheets` 347KB → 32KB).

> 아래 문서에서 `https://<기기>.<tailnet>.ts.net` 은 **예시 주소**입니다. 실제 값은 9단계에서 `tailscale funnel status` 로 확인한 주소를 쓰세요.
> Vercel 프런트엔드 주소는 확정입니다 → **`https://honjaya.vercel.app`** (5단계 `CORS_ORIGINS` 에 이 값을 넣습니다).

---

## 0. 준비물

| 항목 | 내용 |
| --- | --- |
| 노트북 | i5-5300U / 16GB (SSD 교체 권장) |
| OS | Ubuntu Server 24.04 LTS (설치 USB 필요) |
| 네트워크 | 공유기 LAN 케이블 연결 권장(Wi-Fi 보다 안정적) |
| 도메인 | **필요 없음** — 9단계의 Tailscale Funnel(`*.ts.net` 무료 주소)을 씁니다 |
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

> Tailscale Funnel 을 쓰면 IP 가 바뀌어도 외부 접속은 계속 됩니다. 다만 SSH 관리 편의를 위해 고정을 권장합니다.

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

최소한 아래 3개는 **반드시** 바꿉니다.

```dotenv
# DB 비밀번호 (영문+숫자만 사용 — URL 에 들어가므로 특수문자는 피하세요)
POSTGRES_PASSWORD=바꿔주세요1234

# 프런트엔드가 보낼 API 키 (아무 긴 문자열. 비우면 인증이 꺼집니다)
ANON_KEY=바꿔주세요-임의의긴문자열

# 프런트엔드가 떠 있는 오리진만 허용 (Vercel 도메인)
#   여러 개는 쉼표로 구분: https://honjaya.vercel.app,http://localhost:8080
#   로컬에서 `pnpm run serve` 로 개발할 때도 쓰려면 http://localhost:8080 을 추가
#   프리뷰 배포까지 다 허용하려면 * (권장하지 않음)
CORS_ORIGINS=https://honjaya.vercel.app
```

> `docker compose` 가 같은 폴더의 `.env` 를 자동으로 읽어 `${POSTGRES_PASSWORD}` 등을 채웁니다.
> `ANON_KEY` 값은 6단계 Vercel 환경변수에 **똑같이** 넣어야 합니다.

---

## 6. 컨테이너 기동

```bash
cd /opt/honjaya/server
docker compose up -d --build
docker compose ps
```

정상이면 `db`(healthy) · `api`(running) 2개가 보입니다.

```bash
docker compose logs -f api        # 로그 확인 (Ctrl+C 로 빠져나옴)
curl http://localhost:3000/health # {"ok":true,"db":"up",...}
```

---

## 7. 스키마 적용 + 데이터 이관 (최초 1회)

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
> 비밀번호를 바꾸려면 백업 후 `pgdata/` 를 지우고 7단계를 다시 실행하세요.

---

## 8. 로컬 동작 확인

```bash
ANON=$(grep '^ANON_KEY=' /opt/honjaya/server/.env | cut -d= -f2-)

curl http://localhost:3000/health
curl -s -H "apikey: $ANON" "http://localhost:3000/rest/v1/categories?select=id,name&limit=3"
```

데이터가 JSON 으로 나오면 서버는 준비 완료입니다.
(포트가 `127.0.0.1` 에만 열려 있으므로 다른 PC/폰에서는 이 주소로 접속할 수 없습니다. 정상입니다.)

---

## 9. 외부 공개 (Tailscale Funnel)

공유기 포트를 열지 않고 HTTPS 주소를 붙이는 방법입니다. **프런트엔드가 HTTPS 라서 API 도 HTTPS 여야** 합니다(HTTP 를 부르면 브라우저가 차단).
Tailscale Funnel 은 도메인 구입 없이 `https://<기기이름>.<tailnet이름>.ts.net` 이라는 **고정 주소**를 무료로 줍니다.

### 9-1. 설치

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

출력되는 URL 을 브라우저에서 열어 **Tailscale 계정으로 로그인**(무료 플랜 가능)하면 노트북이 tailnet 에 연결됩니다.

### 9-2. 관리 콘솔에서 2가지만 켜기

<https://login.tailscale.com/admin/dns> 에서:

1. **MagicDNS** 사용
2. **HTTPS Certificates** 사용 (Enable HTTPS)

> 이 두 개를 켜지 않으면 Funnel 이 인증서를 못 받아 실패합니다.
> ACL(`nodeAttrs`)로 `funnel` 을 막아둔 tailnet 이 아니라면 별도 설정은 필요 없습니다(기본 허용).

### 9-3. Funnel 켜기

```bash
# 로컬 3000 포트를 인터넷에 공개 (백그라운드로 유지)
sudo tailscale funnel --bg 3000

# 상태 + 공개 주소 확인
sudo tailscale funnel status
```

마지막 줄에 `https://<기기이름>.<tailnet이름>.ts.net` 이 나옵니다. **이 주소를 10단계에서 씁니다.**

```bash
curl https://<기기이름>.<tailnet이름>.ts.net/health
# {"ok":true,"db":"up",...}
```

- 첫 요청 때 Let's Encrypt 인증서를 자동 발급합니다. 발급에 실패하면 인증서 요청 제한(수 시간 잠금)에 걸릴 수 있으니, 9-2 를 먼저 확실히 켜 두세요.
- 재부팅 후에도 유지하려면: `sudo systemctl enable --now tailscaled` (설치 시 기본 enabled). `--bg` 로 켠 Funnel 설정은 tailscaled 가 기억합니다.
- 끄기: `sudo tailscale funnel reset`

> Funnel 은 현재 **beta** 이고 대역폭은 Tailscale 이 내부적으로 조절합니다(수치 비공개, 조정 불가). 이 앱은 gzip 적용 후 월 1GB 미만이라 문제되지 않지만, 대용량 파일을 이 경로로 서빙하지는 마세요.
> Funnel 은 `*.ts.net` 이름과 443/8443/10000 포트만 지원합니다. **보유 도메인을 붙일 수는 없습니다** — 필요해지면 그때 Cloudflare Tunnel 로 옮기면 됩니다(코드/환경변수만 주소 교체).
> Funnel 은 공개 인터넷에 열리므로 `/rest/v1/*` 보호는 전적으로 `ANON_KEY`(`apikey` 헤더) 검사에 의존합니다. 키를 바꾸면 Vercel 환경변수도 같이 바꿔야 합니다.

---

## 10. Vercel 설정 (프런트엔드)

프런트엔드는 이미 Vercel 에 배포되어 있으므로 **환경변수만 추가하고 재배포**하면 됩니다.
`VUE_APP_*` 값은 빌드 시점에 JS 번들에 박히기 때문에 재배포가 필수입니다.

Vercel 대시보드 → 프로젝트 → **Settings → Environment Variables**:

| Key | Value | 환경 |
| --- | --- | --- |
| `VUE_APP_SUPABASE_URL` | `https://<기기이름>.<tailnet이름>.ts.net` (9-3 에서 확인한 주소, 끝에 `/` 없이) | Production (필요 시 Preview 포함) |
| `VUE_APP_SUPABASE_PUBLISHABLE_KEY` | `server/.env` 의 `ANON_KEY` 와 **똑같은 값** | Production (필요 시 Preview 포함) |

저장 후 **Deployments → 최신 배포 → Redeploy** (환경변수는 재빌드해야 반영됩니다).

> 현재 운영 프런트엔드 오리진은 `https://honjaya.vercel.app` 이므로 5단계 `CORS_ORIGINS` 도 이 값으로 두면 됩니다.
> 커스텀 도메인을 추가로 붙였다면 그 오리진을 쉼표로 이어서 넣으세요.
> Vercel 프리뷰 배포(`xxx-git-branch-....vercel.app`)에서도 테스트하려면 해당 오리진을 추가하거나, 임시로 `CORS_ORIGINS=*` 로 두고 `docker compose up -d` 로 재생성합니다.

> 참고: `VUE_APP_SUPABASE_URL=/` 처럼 상대 경로를 넣으면 "접속한 오리진"을 쓰게 되는데, Vercel 에서는 그 오리진이 Vercel 자신이라 API 를 찾지 못합니다. Vercel 배포에서는 **반드시 절대 주소**를 넣으세요.

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

### 프런트엔드만 수정한 경우

Vercel 이 git push 를 감지해 자동으로 다시 빌드합니다. **노트북에서는 할 일이 없습니다.**

### 서버(API/DB)를 수정한 경우

```bash
cd /opt/honjaya
git pull
cd server
docker compose up -d --build
```

`.env` 를 바꿨다면 `docker compose up -d` 로 컨테이너를 **재생성**해야 반영됩니다(`restart` 로는 환경변수가 갱신되지 않습니다).

---

## 트러블슈팅

| 증상 | 원인 / 해결 |
| --- | --- |
| 브라우저 콘솔에 `blocked by CORS policy` | `CORS_ORIGINS` 에 Vercel 도메인 누락 → 5단계 수정 후 `docker compose up -d` |
| 콘솔에 `Mixed Content` / `ERR_SSL_PROTOCOL_ERROR` | `VUE_APP_SUPABASE_URL` 이 `http://` → `https://` 터널 주소로 바꾸고 Vercel 재배포 |
| API 가 `401` / `Invalid API key` | Vercel 의 `VUE_APP_SUPABASE_PUBLISHABLE_KEY` 와 `server/.env` 의 `ANON_KEY` 불일치 |
| `502` / 응답 없음 | `docker compose ps` 로 `api` 상태 확인, `docker compose logs api` |
| `https://<기기>.ts.net/health` 접속 불가 | `sudo tailscale funnel status` 로 3000 포트 매핑 확인, `sudo tailscale status` 로 연결 상태 확인 → `sudo tailscale funnel --bg 3000` 재실행 |
| Funnel 켤 때 `HTTPS is not enabled` / 인증서 오류 | 관리 콘솔에서 MagicDNS + HTTPS Certificates 를 켜고 재시도(9-2 단계) |
| `VUE_APP_SUPABASE_URL` 이 브라우저에서 열리는데 401 | Funnel 은 정상. `apikey` 헤더를 안 붙인 요청이라 그렇습니다(`/health` 는 예외) |
| 폰에서 `http://<노트북 IP>:3000` 접속 안 됨 | 포트가 `127.0.0.1` 에만 열려 있음(의도된 동작). 필요하면 compose 의 `ports` 를 `"3000:3000"` 으로 임시 변경 |
| DB 접속 실패(`password authentication failed`) | `pgdata/` 가 다른 비밀번호로 만들어짐 → 7단계 주의사항 참고 |
| 화면이 예전 버전 | Vercel Redeploy 후 강력 새로고침(Ctrl+Shift+R) 또는 서비스 워커 초기화 |
| `import` 실행 시 `executable file not found` | `docker compose run` 뒤 인자가 서비스 `command` 를 대체함 → 7단계의 전체 명령 사용 |
| `pnpm` 관련 빌드 오류 (Vercel) | 로컬과 동일하게 pnpm 10 필요 → Vercel 프로젝트의 `Install Command`/`PNPM_VERSION` 확인 |

자주 쓰는 명령:

```bash
docker compose ps
docker compose logs -f api
docker compose restart api
docker compose down            # 중지 (데이터는 pgdata/ 에 유지)
docker compose up -d           # 다시 시작
```
