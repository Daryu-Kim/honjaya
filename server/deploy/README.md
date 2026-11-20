# 혼자야 서버 배포 가이드 (프런트엔드 = Vercel)

집에 남는 노트북(i5-5300U / 16GB) 한 대에 **DB + API** 를 올리는 절차입니다.
프런트엔드(Vue)는 지금처럼 **Vercel** 이 서빙하고, 노트북의 API 를 HTTPS 로 호출합니다.
노트북에서는 `db`(Postgres) · `api`(Node) **2개 컨테이너만** 뜹니다.

```
   손님 폰 / 태블릿
        │
        │ HTTPS
        ├──────────────────▶ Vercel (프런트엔드) https://honjaya.vercel.app
        │                          │
        │                          │  /api/staff/*, /api/admin/* 는 vercel.json rewrite
        │                          │  (그 외 /rest/v1, SSE 는 절대 주소로 직접 호출)
        │                          ▼
        │                 ┌──────────────────────────────┐
        └────────────────▶│ Cloudflare Tunnel (운영 중)   │
                          │ api.honjaya-server.xyz       │
                          │ (백업: Tailscale Funnel)      │
                          └───────────┬──────────────────┘
                                      │ http://localhost:3000
                          ┌───────────▼────────────┐
                          │ 노트북 (Ubuntu 24.04)   │
                          │   api  (Node)  :3000   │
                          │   db   (Postgres 16)   │
                          └────────────────────────┘
```

- 프런트엔드는 `VUE_APP_SUPABASE_URL` 로 API 를 직접 호출합니다. 그래서 **CORS 허용**이 필요합니다(5단계).
- 직원 로그인 쿠키는 [10-1](#10-1-직원-로그인-쿠키-중요) 의 rewrite 덕분에 **1st-party** 로 유지됩니다.
- 노트북의 3000 포트는 `127.0.0.1` 에만 열립니다. 인터넷에는 **터널로만** 노출되므로 공유기 포트 개방이 필요 없습니다.
- API 응답은 `@fastify/compress` 로 **gzip 압축**되어 나갑니다. 폴링 구조라 같은 JSON 이 반복 전송되는데, 압축만으로 전송량이 6~10배 줄어듭니다(실측: `orders` 791KB → 93KB, `order_sheets` 347KB → 32KB).

> 아래 문서에서 `https://<기기>.<tailnet>.ts.net` 은 **예시 주소(백업 경로)** 입니다. 실제 값은 9단계에서 `tailscale funnel status` 로 확인한 주소를 쓰세요.
> Vercel 프런트엔드 주소는 확정입니다 → **`https://honjaya.vercel.app`** (5단계 `CORS_ORIGINS` 에 이 값을 넣습니다).

---

## 0. 준비물

| 항목 | 내용 |
| --- | --- |
| 노트북 | i5-5300U / 16GB (SSD 교체 권장) |
| OS | Ubuntu Server 24.04 LTS (설치 USB 필요) |
| 네트워크 | 공유기 LAN 케이블 연결 권장(Wi-Fi 보다 안정적) |
| 도메인 | `honjaya-server.xyz` (가비아에서 구입 → 네임서버를 Cloudflare 로 위임) — API 는 `https://api.honjaya-server.xyz` (Cloudflare Tunnel). Tailscale Funnel 은 백업 |
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

**가장 쉬운 방법은 공유기 관리 화면에서 DHCP 고정 할당(MAC 주소 기준)을 거는 것입니다.**
우분투 설정을 건드리지 않으므로 실패해도 네트워크가 끊기지 않습니다.

> **랜선을 꽂을 수 있으면 유선을 쓰세요.** 서버는 유선이 훨씬 안정적이고, 무선 설정 문제를 통째로 건너뛸 수 있습니다
> (유선은 대부분 꽂으면 DHCP 로 바로 붙습니다).
>
> 무선 상태 확인은 `iw` 같은 추가 패키지 없이 아래로 가능합니다.
>
> ```bash
> networkctl status wlp2s0                                     # 주소/게이트웨이/DHCP 상태
> ip -4 a show wlp2s0 ; ip -4 route                            # IPv4 주소와 기본 경로
> cat /proc/net/wireless                                       # 링크 품질(연결 여부)
> sudo journalctl -u systemd-networkd -b --no-pager | tail -30  # DHCP 실패 원인
> sudo journalctl -u wpa_supplicant -b --no-pager | tail -30    # Wi-Fi 접속(SSID) 실패 원인
> ```

> **무선이면 라우터 DHCP 고정을 쓰세요.** `ip a` 에서 `wlp2s0` 처럼 `wl` 로 시작하면 무선입니다.
> 무선은 `ethernets:` 가 아니라 **`wifis:`** 절에 넣어야 하고, `access-points`(SSID/비밀번호)를 함께 적지 않으면
> `netplan apply` 하는 순간 Wi-Fi 가 내려가서 **SSH 가 끊깁니다.**
>
> **주소와 게이트웨이는 같은 대역이어야 합니다.** (예: 게이트웨이가 `192.168.219.55` 이면 주소도 `192.168.219.x`)
> 대역이 다르면 IP 가 붙어도 인터넷이 안 됩니다.
> 게이트웨이 확인: `ip route | grep default`

#### 유선(`en...`)인 경우

```bash
ls /etc/netplan/                     # 실제 파일 이름 확인
sudo nano /etc/netplan/50-cloud-init.yaml
```

```yaml
network:
  version: 2
  ethernets:
    enp3s0:                     # ip a 로 실제 인터페이스 이름 확인
      dhcp4: false
      addresses: [192.168.219.50/24]     # 게이트웨이와 같은 대역
      routes:
        - to: default
          via: 192.168.219.55              # ip route | grep default 로 확인한 공유기 IP
      nameservers:
        addresses: [1.1.1.1, 8.8.8.8]
```

#### 무선(`wl...`)인 경우

```yaml
network:
  version: 2
  wifis:                            # ethernets 가 아닙니다
    wlp2s0:
      dhcp4: false
      access-points:                # 이 블록이 없으면 Wi-Fi 가 올라오지 않습니다
        "우리집공유기SSID":
          password: "와이파이비밀번호"
      addresses: [192.168.219.50/24]
      routes:
        - to: default
          via: 192.168.219.55
      nameservers:
        addresses: [1.1.1.1, 8.8.8.8]
```

```bash
sudo chmod 600 /etc/netplan/50-cloud-init.yaml
sudo netplan try      # apply 대신 try — 120초 안에 Enter 를 누르지 않으면 자동으로 되돌아갑니다
```

> **설정이 잘못돼서 접속이 끊겼다면** 노트북 앞에서 콘솔로 들어가 아래 중 하나로 복구하세요.
>
> ```bash
> # (a) 원래대로 되돌리기: dhcp4: true 로 바꾸고
> sudo nano /etc/netplan/50-cloud-init.yaml
> sudo netplan apply
>
> # (b) NetworkManager 를 쓰는 경우 즉시 복구
> sudo nmcli device wifi connect "SSID" password "비밀번호"
> ```
>
> `nmcli device status` 에서 `wlp2s0` 이 `connected` 로 보이면 **NetworkManager** 가 관리하는 것이므로
> netplan 이 무시됩니다. 이때는 netplan 대신 아래를 쓰세요.
>
> ```bash
> sudo nmcli connection modify "<연결이름>" ipv4.method manual \
>   ipv4.addresses 192.168.219.50/24 ipv4.gateway 192.168.219.55 ipv4.dns "1.1.1.1 8.8.8.8"
> sudo nmcli connection up "<연결이름>"
> ```

> Tailscale Funnel 을 쓰면 **LAN IP 가 바뀌어도 외부 접속은 계속 됩니다.** 고정 IP 는 SSH 관리 편의용일 뿐이니,
> 설정이 꼬이면 그냥 DHCP 로 두고 다음 단계로 넘어가도 됩니다.

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

> **`curl: (6) Could not resolve host: get.docker.com` 이 뜨면 Docker 문제가 아니라 이 PC 가 인터넷을 못 쓰는 상태입니다.**
> 아래 순서로 원인을 좁히세요.
>
> ```bash
> ip route | grep default          # default via 가 있는지
> ping -c 3 <게이트웨이IP>          # 공유기까지 통하는지 (예: 192.168.219.55)
> ping -c 3 8.8.8.8               # DNS 없이 외부까지 통하는지
> resolvectl status | head -30     # 현재 DNS 서버
> ```
>
> | 결과 | 원인 / 해결 |
> | --- | --- |
> | 게이트웨이 ping 실패 | IP/대역 설정 오류 → 2-2 의 "같은 대역" 확인. 확실치 않으면 `dhcp4: true` 로 되돌리고 `sudo netplan apply` |
> | 게이트웨이는 되는데 `8.8.8.8` 실패 | 라우팅 문제 → `ip route` 에 `default via ...` 가 있는지 확인 |
> | `apt update` 가 IPv6 주소로만 접속 시도하며 `101: Network is unreachable` | 이 PC 에 **IPv4 주소 또는 기본 경로가 없음** → `ip -4 a show <인터페이스>`, `ip -4 route` 확인 후 DHCP 로 복구. `... no longer has a Release file` 는 연결 실패의 부산물이므로 `sources.list` 는 건드리지 마세요 |
> | `8.8.8.8` 은 되는데 `curl` 만 실패 | **DNS 문제** → `sudo resolvectl dns <인터페이스> 8.8.8.8 168.126.63.1` 후 `sudo resolvectl flush-caches` |
>
> DNS 를 영구 반영하려면 netplan 에 `nameservers:` 를 넣고 `sudo netplan apply`.
> 가장 안전한 방법은 DHCP 로 두는 것입니다(공유기가 DNS 를 알려줍니다).

> 설치 스크립트 대신 우분투 저장소 패키지를 써도 됩니다(기능 동일, 버전만 조금 낮음).
>
> ```bash
> sudo apt update
> sudo apt install -y docker.io docker-compose-v2
> ```

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

직원 로그인(`/admin`, `/tablet`)에 쓰는 쿠키 설정도 함께 넣어 두세요. 기본값으로 충분하지만, 명시해 두면 나중에 헷갈리지 않습니다.

```dotenv
# 직원 세션 유지 시간 (로그인 유지 체크 해제 시 / 체크 시)
STAFF_SESSION_HOURS=12
STAFF_REMEMBER_DAYS=30

# auto = https 요청일 때만 Secure 쿠키 (로컬 http 개발에서는 자동으로 꺼짐)
COOKIE_SECURE=auto

# 비워두면 요청 호스트 전용 쿠키 (권장)
STAFF_COOKIE_DOMAIN=
```

> `docker compose` 가 같은 폴더의 `.env` 를 자동으로 읽어 `${POSTGRES_PASSWORD}` 등을 채웁니다.
> `ANON_KEY` 값은 6단계 Vercel 환경변수에 **똑같이** 넣어야 합니다.
>
> **가장 간단한 방법**: 지금 쓰던 PC 의 `server/.env` 파일을 노트북의 같은 위치(`/opt/honjaya/server/.env`)로
> 그대로 복사하세요. `ANON_KEY` / `SERVICE_KEY` 가 자동으로 같아져서 Vercel 환경변수를 다시 맞출 필요가 없습니다.
> (`.env` 는 git 에 올라가지 않으므로 `git clone` 으로는 안 옮겨집니다 — `scp`/USB 로 직접 복사해야 합니다.)
> 단, 그 파일에는 `POSTGRES_PASSWORD` 줄이 없으니 **`POSTGRES_PASSWORD=원하는비밀번호` 한 줄을 직접 추가**하세요.

### 5-1. 카카오 로그인 (P4 — 준비만, 선택)

지금은 비워 두어도 됩니다. 값을 넣으면 `/api/kakao/status` 가 `enabled:true` 를 돌려주고, 비어 있으면
프런트엔드가 카카오 로그인 버튼을 숨깁니다. 실제 로그인 연결은 P6(고객/CRM)에서 붙입니다.

```dotenv
# 카카오 developers > 내 애플리케이션 > 앱 키 > REST API 키 (JavaScript 키 아님)
KAKAO_REST_API_KEY=

# 카카오 developers > 보안 > Client Secret (코드 발급을 "사용함" 으로 켰을 때만)
KAKAO_CLIENT_SECRET=

# 카카오 로그인 > Redirect URI 에 등록한 값과 글자 단위로 같아야 합니다
KAKAO_REDIRECT_URI=https://honjaya.vercel.app/kakao/callback
```

> `KAKAO_REST_API_KEY` 와 `KAKAO_REDIRECT_URI` 가 **둘 다** 있어야 켜집니다.
> 콘솔에서 등록할 Web 플랫폼 도메인은 `https://honjaya.vercel.app` (+ 개발용 `http://localhost:8080`) 입니다.
> 동의항목은 닉네임(필수) + 프로필 사진(선택)만 쓰세요. 이메일은 비즈 앱 심사가 필요합니다.

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
ls csv/                                   # 파일 개수 확인 (아래 설명 참고)
docker compose run --rm import
```

**`(1)` 이 붙은 파일도 그대로 가져가야 합니다.** Supabase Table Editor 는 한 번에 **1000행까지만**
내려주기 때문에, 행이 1000개를 넘는 테이블은 나머지가 `orders_rows (1).csv` 처럼 **이어지는 페이지**로
저장됩니다. 지우면 그 행들이 통째로 사라집니다.

그래서 실제 파일은 6개가 아니라 **7개**입니다:
`categories_rows.csv`, `products_rows.csv`, `order_sheets_rows.csv`, `orders_rows.csv`(1000행),
`orders_rows (1).csv`(나머지 16행), `active_order_sheets_rows.csv`, `counters_rows.csv`.

스크립트는 같은 테이블의 CSV 를 **이어 붙여서** 넣고, 로그에 어느 파일을 합쳤는지 남깁니다.

```
[import] orders: 1016건 반영 (orders_rows.csv, orders_rows (1).csv)
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

> `migrate`(=`npm run db:apply`)는 `tables.sql` → `events.sql` → `staff.sql` 순서로 적용합니다.
> `tables.sql` 이 테이블 마스터(`bar_tables`) 1~30번을 자동으로 채우므로 CSV 백업에는 넣지 마세요.

### 7-1. 직원(사장) 계정 만들기

`/admin`, `/tablet` 은 직원 로그인 없이는 열리지 않습니다. 최초 1회 사장 계정을 만들어야 합니다.

```bash
cd /opt/honjaya/server

# 계정이 없을 때만 생성하고, 무작위 비밀번호를 화면에 한 번만 출력합니다.
docker compose run --rm api node scripts/seed-staff.mjs

# 비밀번호를 직접 정하고 싶으면 .env 에 STAFF_OWNER_PASSWORD 를 넣고 실행하세요.
# 비밀번호를 잊었을 때는 아래처럼 재발급합니다.
docker compose run --rm api node scripts/seed-staff.mjs --reset-password
```

출력된 아이디/비밀번호를 안전한 곳에 보관하세요. **다시 표시되지 않습니다.**

나머지 직원(매니저·알바)은 사장으로 로그인한 뒤 화면에서 추가하거나,
`POST /api/admin/employees` 로 만들 수 있습니다.

| 권한 | 할 수 있는 일 |
| --- | --- |
| `OWNER` (사장) | 전부 + 상품 가격 수정, 직원 관리, 포인트 수동 조정, 테이블 마스터(구역/좌석/이름) 설정 |
| `MANAGER` (매니저) | 주문·결제·환불, 매출/고객/CRM 조회, 감사 로그 조회 |
| `STAFF` (알바) | 주문 접수/상태 변경, 테이블 관리, 결제, 상품 판매중지 토글 |

> 테이블 마스터(`/admin/tables`)의 좌석 수 기본값은 바 4석 / 큰 테이블 8석으로 들어갑니다.
> 매장 실정과 다르면 사장 계정으로 로그인해 `/admin/tables` 에서 바로 수정하세요.

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

## 9. 외부 공개 (Cloudflare Tunnel = 운영, Tailscale Funnel = 백업)

> **현재 위치**: 서버 API 는 `https://api.honjaya-server.xyz` (**Cloudflare Tunnel**) 로 **동작 중**이고,
> Tailscale Funnel 은 **백업 경로**로 켜 둡니다. 남은 작업은 Vercel 의 `VUE_APP_SUPABASE_URL` 과
> `vercel.json` rewrite 주소를 새 주소로 바꾸고 **재배포**하는 것뿐입니다(서버 코드 수정 없음).
>
> | 구분 | 주소 | 상태 |
> | --- | --- | --- |
> | 고객/직원이 접속하는 화면 | `https://honjaya.vercel.app` | 운영 중 |
> | 서버 API (운영) | `https://api.honjaya-server.xyz` | **Cloudflare Tunnel — 동작 중** (9-0) |
> | 서버 API (백업) | `https://bar.taild838e4.ts.net` | 켜 둠 (9-1 ~ 9-3) |
>
> 전환 절차 · 검증 결과 · 되돌리기는 아래 **9-0** 에 정리했습니다.
> 서버 쪽 추가 설정은 없습니다(`trustProxy` 가 이미 켜져 있어 `X-Forwarded-Proto` 로 https 를 인식합니다).

공유기 포트를 열지 않고 HTTPS 주소를 붙이는 방법입니다. **프런트엔드가 HTTPS 라서 API 도 HTTPS 여야** 합니다(HTTP 를 부르면 브라우저가 차단).
지금은 **9-0(Cloudflare Tunnel)** 이 운영 경로이고, 9-1 ~ 9-3 은 **백업 경로(Tailscale Funnel)** 설명입니다.

### 9-0. Cloudflare Tunnel (현재 운영 경로)

> **2026-11-20 전환 완료.** `https://api.honjaya-server.xyz` → `http://localhost:3000`.
> Tailscale Funnel 은 백업으로 계속 켜 둡니다.

토큰 방식(대시보드 관리형) 터널입니다. **대시보드에서 터널과 Public Hostname 을 먼저 만들고**, 그 토큰으로 노트북에 서비스를 설치합니다.

1. Cloudflare 대시보드 → **Networks → Tunnels → Create a tunnel** (Cloudflared) → 이름 예: `honjaya-api`
2. **Public Hostname** 탭에서 추가하고 저장
   - Subdomain `api` / Domain `honjaya-server.xyz` / Type `HTTP` / URL `localhost:3000`
   - 저장하면 `api.honjaya-server.xyz` CNAME 이 `<터널ID>.cfargotunnel.com` 으로 **자동 생성**됩니다.
3. 노트북에 설치 + 서비스 등록

```bash
# 저장소 등록
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared

# 서비스 등록 (토큰은 대시보드에서 복사)
sudo cloudflared service install <TUNNEL_TOKEN>
```

확인:

```bash
systemctl is-enabled cloudflared   # enabled
systemctl is-active  cloudflared   # active
journalctl -u cloudflared -n 50 --no-pager | grep "Registered tunnel connection"   # 4개 연결
curl -s http://localhost:3000/health                                              # {"ok":true,...}
curl -s https://api.honjaya-server.xyz/health                                     # 같은 응답
```

- 토큰은 `/etc/cloudflared/token` 에 `600 root:root` 로 저장되고, 서비스는
  `cloudflared --no-autoupdate tunnel run --token-file /etc/cloudflared/token` 으로 뜹니다.
- **대시보드에 Public Hostname 을 저장하지 않으면** 로그에
  `WRN No ingress rules were defined ... will return 503` 이 찍히고 모든 요청이 503 이 됩니다.
  저장하면 곧바로 `INF Updated to new configuration config=...` 가 찍히는데, 이 로그가 보여야 실제 반영된 것입니다.
- 설정을 바꾸면 **재시작 없이 자동 반영**됩니다. Cloudflare 가 열려 있는 연결로 밀어 넣습니다.

#### 왜 Cloudflare 로 옮겼나 (2026-11-20 실측, 매장 Wi-Fi 에서 10회씩)

| 항목 | Tailscale Funnel | Cloudflare Tunnel |
| --- | --- | --- |
| 새 연결 TLS 완료 | 0.94 ~ 4.76 초 | **0.28 ~ 0.70 초** |
| 새 연결 첫 응답(TTFB) | 1.34 ~ 5.49 초 | **0.60 ~ 0.96 초** |
| 연결 재사용 시 중위값 | 92 ~ 234 ms | 313 ~ 349 ms |
| 5개 동시 요청 | 682 ~ 758 ms | 704 ~ 832 ms |

브라우저는 페이지를 열 때마다 **새 연결**을 맺으므로 위쪽 두 줄이 실제 체감 속도입니다.
Tailscale 은 연결을 재사용하면 빠르지만 새 연결에서 최대 5초까지 튀는 반면, Cloudflare 는 편차가 작습니다.

> 더 중요한 이유는 **안정성**입니다. Tailscale Funnel 은 공인 IP 가 바뀌면(ISP 재할당) 조용히 끊깁니다.
> 2026-11-20 에 실제로 겪었고 `sudo systemctl restart tailscaled` 로 복구했습니다.
> Cloudflare Tunnel 은 노트북에서 **바깥으로만** 연결하므로 IP 가 바뀌어도 영향이 없습니다.

#### 알아 둘 점

- **도메인 위임 반영에 시간이 걸립니다.** 가비아에서 네임서버를 `aitana.ns.cloudflare.com` / `clay.ns.cloudflare.com` 로 바꿔도
  WHOIS/RDAP 는 몇 분 만에 갱신되지만 **실제 DNS 위임은 30~40분** 걸렸습니다. 그동안 공인 리졸버에서는 NXDOMAIN 이 납니다.
- Cloudflare 존이 **Active** 가 되기 전에는 TLS 핸드셰이크가 `ssl/tls alert handshake failure` 로 실패합니다.
  대시보드에 **"Your domain is now protected by Cloudflare"** 가 보이면 준비된 것입니다.
- 지금 엣지 위치는 **HKG/NRT**(홍콩/도쿄)로 잡힙니다. 서울(ICN)보다 멀지만 위 표처럼 Tailscale 보다는 훨씬 빠릅니다.
- REST 는 `apikey` 를 **헤더**로 보내야 합니다. 쿼리 파라미터(`?apikey=`)로 보내면 **401** 입니다 —
  `/rest/v1` 에서 쿼리 파라미터는 곧 컬럼 필터라서 일부러 읽지 않습니다. SSE(`/api/events`)만 쿼리 파라미터를 허용합니다.
- SSE 는 서버가 25초마다 `: ping` 을 보내므로 Cloudflare 의 유휴 연결 끊김(100초)에 걸리지 않습니다(60초 테스트에서 ping 2회 수신 확인).

#### 되돌리기 (Cloudflare 장애 시)

Vercel 환경변수와 `vercel.json` 을 백업 주소로 되돌리고 재배포하면 끝입니다. 서버 코드는 그대로 둡니다.

```dotenv
VUE_APP_SUPABASE_URL=https://bar.taild838e4.ts.net
```

```json
{ "source": "/api/staff/(.*)", "destination": "https://bar.taild838e4.ts.net/api/staff/$1" }
{ "source": "/api/admin/(.*)", "destination": "https://bar.taild838e4.ts.net/api/admin/$1" }
```

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
# https://bar.taild838e4.ts.net (Funnel on)

```bash
curl https://<기기이름>.<tailnet이름>.ts.net/health
# {"ok":true,"db":"up",...}
```

- 첫 요청 때 Let's Encrypt 인증서를 자동 발급합니다. 발급에 실패하면 인증서 요청 제한(수 시간 잠금)에 걸릴 수 있으니, 9-2 를 먼저 확실히 켜 두세요.
- 재부팅 후에도 유지하려면: `sudo systemctl enable --now tailscaled` (설치 시 기본 enabled). `--bg` 로 켠 Funnel 설정은 tailscaled 가 기억합니다.
- 끄기: `sudo tailscale funnel reset`

> Funnel 은 현재 **beta** 이고 대역폭은 Tailscale 이 내부적으로 조절합니다(수치 비공개, 조정 불가). 이 앱은 gzip 적용 후 월 1GB 미만이라 문제되지 않지만, 대용량 파일을 이 경로로 서빙하지는 마세요.
> Funnel 은 `*.ts.net` 이름과 443/8443/10000 포트만 지원합니다. **보유 도메인을 붙일 수는 없습니다** — 그래서 운영은 `honjaya-server.xyz` + Cloudflare Tunnel 로 가고, Funnel 은 백업 전용으로 둡니다.
> Funnel 은 공개 인터넷에 열리므로 `/rest/v1/*` 보호는 전적으로 `ANON_KEY`(`apikey` 헤더) 검사에 의존합니다. 키를 바꾸면 Vercel 환경변수도 같이 바꿔야 합니다.

---

## 10. Vercel 설정 (프런트엔드)

프런트엔드는 이미 Vercel 에 배포되어 있으므로 **환경변수만 추가하고 재배포**하면 됩니다.
`VUE_APP_*` 값은 빌드 시점에 JS 번들에 박히기 때문에 재배포가 필수입니다.

Vercel 대시보드 → 프로젝트 → **Settings → Environment Variables**:

| Key | Value | 환경 |
| --- | --- | --- |
| `VUE_APP_SUPABASE_URL` | `https://api.honjaya-server.xyz` (운영 · 9-0, 끝에 `/` 없이) — 백업은 9-3 에서 확인한 `https://<기기이름>.<tailnet이름>.ts.net` | Production (필요 시 Preview 포함) |
| `VUE_APP_SUPABASE_PUBLISHABLE_KEY` | `server/.env` 의 `ANON_KEY` 와 **똑같은 값** | Production (필요 시 Preview 포함) |

> `VUE_APP_API_BASE_URL` 은 **비워 두세요**. 비우면 같은 오리진(→ `vercel.json` rewrite)으로 직원/관리자 API 를 부르므로 쿠키가 1st-party 로 유지됩니다.
> 로컬에서 `pnpm run serve` 로 띄울 때는 `.env.local` 에 `VUE_APP_API_PROXY_TARGET=http://localhost:3000` 만 넣으면 `vue.config.js` 프록시가 같은 역할을 합니다.

저장 후 **Deployments → 최신 배포 → Redeploy** (환경변수는 재빌드해야 반영됩니다).

> 현재 운영 프런트엔드 오리진은 `https://honjaya.vercel.app` 이므로 5단계 `CORS_ORIGINS` 도 이 값으로 두면 됩니다.
> 커스텀 도메인을 추가로 붙였다면 그 오리진을 쉼표로 이어서 넣으세요.
> Vercel 프리뷰 배포(`xxx-git-branch-....vercel.app`)에서도 테스트하려면 해당 오리진을 추가하거나, 임시로 `CORS_ORIGINS=*` 로 두고 `docker compose up -d` 로 재생성합니다.

> 참고: `VUE_APP_SUPABASE_URL=/` 처럼 상대 경로를 넣으면 "접속한 오리진"을 쓰게 되는데, Vercel 에서는 그 오리진이 Vercel 자신이라 API 를 찾지 못합니다. Vercel 배포에서는 **반드시 절대 주소**를 넣으세요.

### 10-1. 직원 로그인 쿠키 (중요)

직원 로그인은 **쿠키**로 유지됩니다. 브라우저가 `honjaya.vercel.app` 에서 `api.honjaya-server.xyz` 를 직접 부르면
`SameSite=Lax` 쿠키가 전송되지 않아 로그인이 계속 풀립니다(Safari/iOS 는 더 엄격합니다).
그래서 저장소 루트의 `vercel.json` 이 아래 두 경로만 서버로 **되돌려 보냅니다(rewrite)**.

```json
{ "source": "/api/staff/(.*)", "destination": "https://<서버주소>/api/staff/$1" }
{ "source": "/api/admin/(.*)", "destination": "https://<서버주소>/api/admin/$1" }
```

> 현재 `vercel.json` 은 **백업 경로(`https://bar.taild838e4.ts.net`)** 를 가리키고 있습니다.
> Cloudflare Tunnel 은 `https://api.honjaya-server.xyz` 로 **이미 동작 중**이므로, 위 두 줄의 주소만 그 값으로 바꾸고
> Vercel 을 재배포하면 전환됩니다. (코드 수정 없음)

- 브라우저 입장에서는 같은 오리진 호출이므로 **1st-party 쿠키**가 됩니다. `SameSite=None` 이 필요 없습니다.
- `/rest/v1/*` 와 SSE(`/api/events`)는 **일부러 제외**했습니다. 이 둘은 `VUE_APP_SUPABASE_URL` 절대 주소를 그대로 씁니다.
  SSE 는 rewrite 를 거치면 스트리밍이 끊길 수 있어 절대 주소를 유지해야 합니다.
- 서버 도메인이 바뀌면 `vercel.json` 의 두 줄도 같이 바꾸고 재배포하세요. (전환·되돌리기는 9-0 참고)

> Vercel 프리뷰 배포도 `vercel.json` 을 그대로 쓰므로 rewrite 는 동작합니다.
> 다만 서버의 `CORS_ORIGINS` 에 그 프리뷰 오리진을 추가해야 API 호출이 통과합니다.
> (same-origin rewrite 는 CORS 검사를 하지 않지만, `/rest/v1` 직접 호출은 검사합니다.)

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

### DB 스키마까지 바뀐 경우 (payments / points / guest / tables 등)

`server/sql/*.sql` 이 추가·수정된 커밋을 받았다면 API 만 재시작해서는 테이블이 생기지 않습니다.
`migrate` 서비스는 `tools` 프로필에 들어 있어서 **`--profile tools` 를 붙여야** 실행됩니다.

```bash
cd /opt/honjaya
git pull
cd server
docker compose --profile tools build migrate   # 이미지에 새 SQL 을 구워 넣기
docker compose run --rm migrate                # apply-schema.mjs 실행 (여러 번 돌려도 안전)
docker compose up -d --force-recreate api      # 새 스키마를 쓰는 API 재생성
```

확인:

```bash
curl -s http://127.0.0.1:3000/health
docker compose exec db psql -U postgres -d honjaya -c "\dt"
```

> `docker compose run --rm db psql ...` 은 **DB 서버가 없는 일회용 컨테이너**를 띄우므로 소켓 오류가 납니다.
> psql 은 반드시 `docker compose exec db psql ...` 로 실행하세요.
> 마이그레이션 전에 `/opt/honjaya/server/deploy/backup-db.sh`(11단계)로 한 번 백업해 두면 안전합니다.
> P5 부터는 `server/sql/points.sql`(customers / point_ledger / point_allocations + `order_sheets.points_used`)도
> 같은 `migrate` 실행에 포함됩니다. 적용 여부는
> `docker compose exec db psql -U postgres -d honjaya -c "select count(*) from point_ledger;"` 로 확인하세요.

### 자동 배포 (선택)

위 세 줄을 손으로 치지 않아도 되게 만들 수 있습니다. `origin/master` 를 **2분마다** 확인해서
새 커밋이 있으면 `git pull` → `docker compose up -d --build` → 헬스체크까지 자동으로 수행합니다.

```bash
# 최초 1회만 (root)
sudo bash /opt/honjaya/server/deploy/install-auto-deploy.sh
```

끝입니다. 이후로는 PC 에서 `git push` 만 하면 노트북이 알아서 갱신합니다.

```bash
# 타이머 상태
systemctl list-timers honjaya-deploy.timer --no-pager

# 로그 (최근 50줄)
journalctl -u honjaya-deploy.service -n 50 --no-pager

# 기다리지 않고 즉시 한 번 실행
sudo systemctl start honjaya-deploy.service

# 끄기 / 다시 켜기
sudo systemctl disable --now honjaya-deploy.timer
sudo systemctl enable --now honjaya-deploy.timer
```

동작 규칙:

- 원격과 커밋이 같으면 **아무 일도 하지 않고 종료**합니다.
- `git pull` 은 **fast-forward 전용**입니다. 노트북에서 파일을 직접 고쳐 커밋했다면 실패하고 로그만 남깁니다(자동 병합하지 않음).
- 추적 중인 파일이 수정된 상태(`git status` 에 `M`)면 안전하게 **건너뜁니다**. 정리 후 다음 주기에 다시 시도합니다.
- 새 커밋에 포함된 파일과 이름이 같은 **untracked 파일**이 있으면, 내용이 완전히 같을 때만 지우고 merge 합니다. 내용이 다르면 손대지 않고 **중단**합니다.
- 스크립트 자신이 갱신되는 경우를 대비해 `/tmp` 사본으로 실행됩니다. 실행 중에 `auto-deploy.sh` 가 교체되어도 안전합니다.
- 빌드에 실패하면 새 버전으로 교체되지 않으므로 **기존 컨테이너가 계속 서비스**합니다. `journalctl` 로 원인 확인 후 고치면 다음 주기에 자동 재시도합니다.
- `.env` 는 git 에 없으므로 자동 배포가 **덮어쓰지 않습니다.** 값을 바꿀 때는 노트북에서 직접 수정하세요.

> 주기(`2min`)를 바꾸려면: `sudo INTERVAL=5min bash /opt/honjaya/server/deploy/install-auto-deploy.sh`
> 변경이 없어도 강제로 한 번 더 빌드하려면: `sudo -u bar env FORCE=1 bash /opt/honjaya/server/deploy/auto-deploy.sh`

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
| `curl: (6) Could not resolve host` (Docker 설치 등) | 이 PC 가 인터넷을 못 쓰는 상태 → 3단계의 네트워크 점검 표 참고(대부분 DNS 또는 default route 문제) |
| `apt` 가 IPv6 주소만 시도하며 `101: Network is unreachable` | IPv4 주소/기본 경로 없음 → `ip -4 a`, `ip -4 route` 확인 후 DHCP 복구(`sudo dhclient -4 <인터페이스>` 또는 netplan `dhcp4: true`). 함께 나오는 `no longer has a Release file` 는 연결 실패의 부산물입니다 |
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
