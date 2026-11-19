-- patch-014: 손님 캐릭터 기능 제거
-- order_sheets.character_style 은 손님 캐릭터(성별 · 마인크래프트 스킨) 기능이 쓰던 컬럼입니다.
-- 해당 기능을 앱에서 완전히 제거했으므로 컬럼도 함께 지웁니다.
-- 재실행해도 안전합니다.

alter table if exists public.order_sheets
  drop column if exists character_style;

-- 확인용: 결과가 0건이어야 정상입니다.
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'order_sheets'
  and column_name = 'character_style';
