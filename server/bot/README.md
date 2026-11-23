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
| `DISCORD_BACKUP_CHANNEL_ID` | – | 백업 파일 업로드 채널 (P12B). 비우면 로컬에만 남깁니다 |
| `DISCORD_ANNOUNCE_CHANNEL_ID` | – | 공지 기본 채널 (P12D) |
| `BACKUP_ENCRYPTION_KEY` | ✅ | 백업 암호화 키 (`openssl rand -base64 32`). 없으면 백업 불가 |
| `BACKUP_DIR` | – | 암호화 파일 보관 경로(기본 `/backups`, compose 볼륨 `./backups`) |
| `BACKUP_SOURCE_DIR` | – | 서버 코드·설정 백업 원본(compose 기본 `/src` = 저장소 루트 읽기 전용). 비우면 서버 백업을 건너뜁니다 |
| `DISCORD_MAX_UPLOAD_MB` | – | 조각 1개 최대 크기(기본 20) |
| `BACKUP_SCRATCH_DB` | – | 검증 복원용 임시 DB(기본 `honjaya_verify`). 운영 DB 이름과 같으면 거부 |
| `BACKUP_VERIFY_TIMEOUT_MS` | – | 검증 1회 제한 시간(기본 600000) |
| `BACKUP_SCHEDULER_POLL_MS` | – | 스케줄 확인 주기(기본 60000) |

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
| `/상태` | 봇·게이트웨이·길드·대기 작업·최근 스냅샷·최근 백업 |
| `/구조` | 역할/채널/이모지/AutoMod/예약 이벤트 개수 요약 |
| `/스냅샷` | 현재 구조를 `discord_snapshots` 에 저장 |
| `/백업` | 지금 DB 백업 실행(`BACKUP` 잡 등록) |
| `/백업목록` | 최근 5건의 크기·업로드·검증 상태 |
| `/검증` | 최근 성공 백업을 스크래치 DB 에 복원해 행 수까지 대조 |

명령은 **길드 전용**(`guild.commands.set`)으로 등록해 즉시 반영됩니다.
실행 권한은 `DISCORD_OWNER_USER_ID` 로 지정한 계정 + Discord `서버 관리` 권한을 동시에 만족해야 합니다.
응답은 항상 ephemeral(본인에게만 보임)입니다.

## 6. 작업 큐

Redis 없이 `discord_jobs` + `FOR UPDATE SKIP LOCKED` 로 처리합니다.

* 실패 시 백오프 `min(2^attempts * 5, 300)`초 후 재시도, `max_attempts` 초과 시 `FAILED`
* 부팅 시 10분 넘게 `RUNNING` 인 작업을 `QUEUED` 로 되돌립니다
* 봇 인스턴스를 늘려도 `SKIP LOCKED` 덕분에 중복 실행되지 않습니다

## 7. 백업 파이프라인 (P12B)

```
pg_dump -Fc ──▶ gzip ──▶ AES-256-GCM ──▶ 파일 1개 ──▶ 20MiB 조각 분할
      └─▶ backup_runs / backup_files 기록 ──▶ Discord 업로드(BACKUP_UPLOAD)
                                            └─▶ 보관 정책 정리(BACKUP_PRUNE)
                                            └─▶ 검증 복원(BACKUP_VERIFY, 수동)
```

| 잡 | 트리거 | 재시도 |
| --- | --- | --- |
| `BACKUP` | `/백업`, 스케줄(`discord_settings.backup_cron`, 기본 `0 5 * * *`), `POST /api/discord/backups` | 5 |
| `BACKUP_UPLOAD` | `BACKUP` 성공 직후 자동 | 6 |
| `BACKUP_SERVER` | `BACKUP` 성공 직후 자동 (`BACKUP_SOURCE_DIR` 없으면 건너뜀) | 2 |
| `BACKUP_PRUNE` | `BACKUP` 성공 직후 자동 | 2 |
| `BACKUP_VERIFY` | `/검증`, `POST /api/discord/backups/:id/verify` | 2 |

원칙:

* **업로드 실패 ≠ 백업 실패.** 덤프/암호화/분할까지 성공하면 `backup_runs.status = SUCCEEDED` 로 남고, 업로드는 큐에서 따로 재시도합니다.
* Discord 413 / `code 40005` 를 받으면 조각을 80% 크기로 다시 나누고 재시도합니다(`DISCORD_MAX_UPLOAD_MB` 이하).
* **키는 절대 밖으로 나가지 않습니다.** `BACKUP_ENCRYPTION_KEY` 는 봇 env 에만 있고, Discord 메시지·DB·API 응답 어디에도 넣지 않습니다.
* **운영 DB 덮어쓰기는 자동화하지 않습니다.** `BACKUP_VERIFY` 는 `BACKUP_SCRATCH_DB`(기본 `honjaya_verify`)에만 복원합니다. `BACKUP_SCRATCH_DB` 가 운영 DB 이름과 같으면 즉시 거부합니다.
* 검증 절차: 조각 재조립 → `sha256` 대조 → 복호화 → `pg_restore --list` 항목 수 → `dropdb/createdb` → `pg_restore --exit-on-error` → 테이블별 행 수 대조 → 스크래치 DB 삭제. 결과는 `backup_restores.verification` 에 JSON 으로 남습니다.

### 7-1. 서버(코드·설정) 백업 (P12B-1)

DB 백업과 **같은 잡 흐름 안에서 별도 run**(`backup_runs.kind = 'SERVER'`)으로 만들어집니다.
DB 백업이 실패해도, 서버 백업이 실패해도 서로를 막지 않습니다.

```
저장소 루트 ──▶ tar -czf (파일 목록 -T 사용) ──▶ encryptToFile(gzip 재적용) ──▶ AES-256-GCM
      └─▶ backup_runs(kind='SERVER', db_name='honjaya-app') ──▶ Discord 업로드 ──▶ 보관 정책
```

* 대상은 **코드·설정**입니다: `server/`(compose·Dockerfile·sql·deploy 스크립트), `src/`, `package*.json`, `vercel.json`, `.env.example` 등.
* **절대 포함하지 않는 것**: `.env` / `.env.*`(`.env.example` 제외), `*.local.json`(VAPID 개인키), `migration-data/`(고객 PII), `csv/`, `recipes-*`, `node_modules`, `.git`, `dist`, `coverage`, `backups/`, `pgdata/`, 로그.
  제외는 tar 의 `--exclude` 추측이 아니라 **먼저 만든 파일 목록**으로 강제합니다.
* 보관 정책은 **종류별로 따로** 셉니다(`kind` 별 최신 N개 유지) — 서버 백업이 DB 백업 슬롯을 잡아먹지 않습니다.
* `/검증`(pg_restore)은 DB 백업 전용이라 `SERVER` run 에서는 거부합니다. 무결성은 조각별 `sha256` 으로 확인합니다.
* 복원:

  ```bash
  node scripts/decrypt-backup.mjs <server-...tar.gz.enc> --out server.tar.gz   # 조각이면 먼저 이어붙이기
  tar -xzf server.tar.gz -C /opt/honjaya                                       # 코드·설정 복원
  # DB 는 DB 백업(.dump.enc)으로 따로 복원합니다. .env 는 백업에 없으니 직접 보관하세요.
  ```

파일 형식: `HJBK1 | iv(12) | tag(16) | ciphertext(gzip)`. 조각 이름 규칙은 `<filename>.part-001-of-004` 입니다.

복호화(호스트):

```bash
docker compose run --rm bot node scripts/decrypt-backup.mjs \
  --out /tmp/honjaya.dump --dir /backups --base <filename> --sha256 <backup_runs.sha256>
```

## 8. 다음 단계

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| P12A | 봇 부팅·슬래시 명령·스냅샷·작업 큐 | 완료 |
| P12B | 백업·암호화·Discord 업로드·보관 정책·검증 복원 | 완료 |
| P12B-1 | 서버 코드·설정 번들 백업(`kind='SERVER'`) | 완료 (마이그레이션·배포 대기) |
| P12C | `/admin/discord` 읽기 전용 대시보드 | 예정 |
| P12D | 멤버/메시지/스레드/초대 실시간 관리 | 예정 |
| P12E | 구조 편집기 + 3-way diff 적용(apply) 엔진 | 예정 |
| P12F | 웹훅·AutoMod·예약 이벤트 + (선택) Discord OAuth2 로그인 | 예정 |

