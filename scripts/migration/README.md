# Supabase migration

Firestore → Supabase 이전 도구 모음. 사진(이미지)은 이전하지 않고 새로 찍습니다.

## 순서

1. **스키마 적용** — Supabase Dashboard → SQL Editor에서 `supabase/schema.sql` 내용을 붙여넣고 실행.
2. **접속 정보 입력** — `scripts/migration/.env.migration.example`을 프로젝트 루트에
   `.env.migration` 이름으로 복사한 뒤 값을 채웁니다.
   - `SUPABASE_URL`: Dashboard → Settings → API → Project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: 같은 화면의 `service_role` secret
     (스크립트 전용. 클라이언트/앱 코드에 절대 넣지 마세요.)
3. **미리보기(쓰기 없음)**

   ```bash
   npm run migrate:import -- --dry-run
   ```

4. **실제 이전** (대상 테이블을 비우고 다시 채웁니다)

   ```bash
   npm run migrate:import
   ```

## 참고

- Firestore 원본은 `npm run migrate:export`로 다시 받을 수 있습니다
  (결과: `migration-data/firestore-export.json`, git 제외).
- 이전 시 정리되는 항목:
  - 테이블 번호 `01`, `001` → `1` 정규화, `No.01` 형태의 displayName 동기화
  - `activeOrderSheets` 키 정규화(`table_1`) 및 충돌 시 OPEN/PAYMENT_REQUESTED 주문서 우선
  - 레거시 주문서 상태 `PAID` → `CLOSED` (결제 완료 상태는 유지)
  - `products.imageUrl` 공란 처리(사진 재촬영 예정). 과거 주문 스냅샷의 이미지 URL은 기록 보존용으로 유지
  - `products.categoryIds`가 비어 있으면 `[categoryId]`로 채움(앱과 동일한 폴백 규칙)
- 실행 로그에 변환 건수, 상태값 분포, 경고(중복/참조 누락) 목록이 출력되고,
  마지막에 Supabase 실제 건수와 비교 검증합니다.
