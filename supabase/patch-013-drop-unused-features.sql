-- Honjaya patch-013 — 채팅 / 선물 / 하트 / 실시간 시세 / 웹푸시 기능 제거
--
-- 앱에서 아래 기능을 모두 들어냈기 때문에, 더 이상 쓰이지 않는 테이블과 컬럼을 정리합니다.
--   1) chat_messages   : 테이블 채팅(전체/직원/1:1)
--   2) hearts          : 익명 하트
--   3) market_history  : 영업일 시세 히스토리
--   4) push_subscriptions : 웹 푸시 구독
--   5) orders.is_gift / gift_to_table_number / gift_to_nickname : 선물 주문
--
-- schema.sql 에는 예전 정의가 남아 있습니다(fresh install 이 patch 체인을 그대로 타도록).
-- 이 파일이 마지막에 실행되면서 두 환경(Supabase / 자체 서버) 모두 같은 최종 상태가 됩니다.
-- 여러 번 실행해도 안전합니다. 되돌릴 수 없으니 필요한 데이터는 먼저 백업하세요.

-- ---------------------------------------------------------------------------
-- 1) Realtime publication 에서 먼저 뺀다 (테이블 drop 전에 정리)
-- ---------------------------------------------------------------------------
do $$
declare
  target text;
begin
  foreach target in array array['chat_messages', 'hearts', 'market_history', 'push_subscriptions']
  loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', target);
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 2) 테이블 제거
-- ---------------------------------------------------------------------------
drop table if exists public.chat_messages cascade;
drop table if exists public.hearts cascade;
drop table if exists public.market_history cascade;
drop table if exists public.push_subscriptions cascade;

-- 웹 푸시 전송용 트리거 함수도 함께 정리합니다.
drop function if exists public.notify_chat_push();

-- ---------------------------------------------------------------------------
-- 3) 선물 주문 컬럼 제거
-- ---------------------------------------------------------------------------
alter table public.orders drop column if exists is_gift;
alter table public.orders drop column if exists gift_to_table_number;
alter table public.orders drop column if exists gift_to_nickname;

-- ---------------------------------------------------------------------------
-- 4) 시세 / 웹푸시 설정 행 제거
--    (app_settings 자체는 범용 설정 저장소로 남겨둡니다)
-- ---------------------------------------------------------------------------
delete from public.app_settings where id in ('market', 'web_push');

comment on table public.app_settings is
  '앱 전역 설정 저장소. id 별로 jsonb 한 줄씩 저장합니다.';

-- ---------------------------------------------------------------------------
-- 5) 확인용
-- ---------------------------------------------------------------------------
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('chat_messages', 'hearts', 'market_history', 'push_subscriptions')
 order by table_name;
