-- Honjaya patch-010 — 손님 캐릭터 꾸미기(피부·헤어·의상 색)
--
-- order_sheets.character_style 에 { "skin": "warm", "hair": "ink", "shirt": "peach" }
-- 형태의 색상 id만 저장합니다. 값이 비어 있으면 TV 화면이 기존처럼 테이블 번호로
-- 색을 정합니다. 여러 번 실행해도 안전합니다.

alter table public.order_sheets
  add column if not exists character_style jsonb not null default '{}'::jsonb;

comment on column public.order_sheets.character_style is
  '손님 픽셀 캐릭터 색상 id (skin / hair / shirt). 비어 있으면 테이블 번호 기준 기본값 사용';
