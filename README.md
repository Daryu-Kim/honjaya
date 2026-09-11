# honjaya

Supabase(Postgres + Realtime) 백엔드를 사용하는 Vue 3 주문 앱입니다.

## Environment

`.env.local` (git 에 커밋하지 않음):

```
VUE_APP_SUPABASE_URL=https://<project-ref>.supabase.co
VUE_APP_SUPABASE_PUBLISHABLE_KEY=<anon or publishable key>
```

마이그레이션 스크립트용 `.env.migration` (`FIREBASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

## Project setup

```
pnpm install
```

### Compiles and hot-reloads for development

```
pnpm serve
```

### Compiles and minifies for production

```
pnpm build
```

### Lints and fixes files

```
pnpm lint
```

### Database schema

- [supabase/schema.sql](supabase/schema.sql) — 새 프로젝트용 전체 스키마 (테이블/RLS/Realtime)
- [supabase/patch-001-soft-delete-realtime.sql](supabase/patch-001-soft-delete-realtime.sql) — 이미 만들어진 프로젝트용 소프트 삭제 + Realtime 패치

### Data migration

```
pnpm migrate:export
pnpm migrate:import
```

### Customize configuration

See [Configuration Reference](https://cli.vuejs.org/config/).
