# 혼자야 Discord 관리봇 (P12)

Discord 서버(길드)의 구조·멤버·공지·백업을 관리하는 봇입니다.
`server/`(api) 와는 **별도 컨테이너**로 돌고, `DISCORD_BOT_TOKEN` 은 이 컨테이너에만 있습니다.

```
[브라우저] → /api/discord/*  (staff 쿠키 인증)
                 ↓
             api 컨테이너  ── x-internal-token ──→  bot 컨테이너 :4100 (compose 내부 전용)
                                                          ↓
                                                  Discord 게이트웨이 / PostgreSQL
```

* bot 포트는 **외부에 열지 않습니다**(`expose` 만, `ports` 없음). Vercel 리라이트도 없습니다.
* `BOT_INTERNAL_TOKEN` 이 비어 있으면 bot 은 인증이 필요한 모든 경로를 `503` 으로 거부합니다.
* 설정이 일부 비어 있어도 프로세스는 죽지 않고 `configured:false` 로 대기합니다(compose 재시작 루프 방지).

## 1. Discord Developer Portal 준비

1. <https://discord.com/developers/applications> → **New Application**
2. **Bot** 탭
   * `SERVER MEMBERS INTENT` → **ON** (필수. 꺼져 있으면 게이트웨이가 `4014` 로 끊습니다)
   * `MESSAGE CONTENT INTENT` → **OFF** (쓰지 않습니다)
3. **OAuth2 → URL Generator**
   * scopes: `bot`, `applications.commands`
   * permissions: `Manage Roles`, `Manage Channels`, `Kick Members`, `Ban Members`,
     `Moderate Members`, `Manage Messages`, `Manage Threads`, `Create Invite`,
     `Manage Webhooks`, `View Audit Log`, `Send Messages`, `Embed Links`, `Attach Files`
   * 생성된 URL 로 봇 초대
4. 서버 설정 → 역할에서 **봇 역할을 사장 역할 바로 아래**로 올립니다.
   **Administrator 는 주지 않습니다.** (봇 역할보다 높은 역할은 봇이 건드릴 수 없습니다)

> 봇을 만들고 돌리는 데 OAuth2 **로그인** 연동은 필요 없습니다. 위 2~4 단계만으로 동작합니다.
> (웹에서 Discord 계정으로 로그인하는 기능은 P12F 선택 사항입니다)

## 2. 환경변수

`server/.env` 에 아래를 채우고 `docker compose up -d --build` 하면 됩니다.
(`.env.example` 의 P12 절에 설명이 있습니다)

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `DISCORD_BOT_TOKEN` | ✅ | Bot 탭의 토큰. 재발급 시 즉시 갱신 |
| `DISCORD_GUILD_ID` | ✅ | 관리할 서버 ID |
| `DISCORD_OWNER_USER_ID` | ✅ | 슬래시 명령을 쓸 수 있는 본인 계정 ID |
| `BOT_INTERNAL_TOKEN` | ✅ | api ↔ bot 내부 토큰 (`openssl rand -hex 32`) |
| `DISCORD_APPLICATION_ID` | – | 표시용 |
| `DISCORD_BACKUP_CHANNEL_ID` | – | 백업 파일 업로드 채널 (P12B) |
| `DISCORD_ANNOUNCE_CHANNEL_ID` | – | 공지 기본 채널 (P12D) |
| `BACKUP_ENCRYPTION_KEY` | – | 백업 암호화 키 (P12B) |

## 3. 스키마

`server/sql/discord.sql` 이 필요합니다. 호스트에서:

```bash
cd /opt/honjaya/server
docker compose run --rm --build migrate
```

## 4. 동작 확인

```bash
# 봇 로그 (JSON 한 줄 = 1건)
docker compose logs -f bot

# 컨테이너 내부 상태
docker compose exec bot node -e "fetch('http://127.0.0.1:4100/internal/health').then(r=>r.json()).then(console.log)"

# api 프록시 (staff 쿠키 필요)
curl -s -b "hj_staff=<cookie>" https://api.honjaya-server.xyz/api/discord/status
```

## 5. 슬래시 명령 (P12A)

| 명령 | 설명 |
| --- | --- |
| `/상태` | 봇·게이트웨이·길드·대기 작업·최근 스냅샷 |
| `/구조` | 역할/채널/이모지/AutoMod/예약 이벤트 개수 요약 |
| `/스냅샷` | 현재 구조를 `discord_snapshots` 에 저장 |

명령은 **길드 전용**(`guild.commands.set`)으로 등록해 즉시 반영됩니다.
실행 권한은 `DISCORD_OWNER_USER_ID` 로 지정한 계정 + Discord `서버 관리` 권한을 동시에 만족해야 합니다.
응답은 항상 ephemeral(본인에게만 보임)입니다.

## 6. 작업 큐

Redis 없이 `discord_jobs` + `FOR UPDATE SKIP LOCKED` 로 처리합니다.

* 실패 시 백오프 `min(2^attempts * 5, 300)`초 후 재시도, `max_attempts` 초과 시 `FAILED`
* 부팅 시 10분 넘게 `RUNNING` 인 작업을 `QUEUED` 로 되돌립니다
* 봇 인스턴스를 늘려도 `SKIP LOCKED` 덕분에 중복 실행되지 않습니다

## 7. 다음 단계

| 단계 | 내용 |
| --- | --- |
| P12B | `pg_dump` → AES-256-GCM 암호화 → Discord 업로드 + 보존 정책 |
| P12C | `/admin/discord` 읽기 전용 대시보드 |
| P12D | 멤버/메시지/스레드/초대 실시간 관리 |
| P12E | 구조 편집기 + 3-way diff 적용(apply) 엔진 |
| P12F | 웹훅·AutoMod·예약 이벤트 + (선택) Discord OAuth2 로그인 |
