-- 변경 알림 트리거: 앱이 쓰는 테이블이 바뀌면 NOTIFY honjaya_events 를 보냅니다.
-- SSE(/api/events) 엔드포인트가 이 채널을 LISTEN 해서 클라이언트에 밀어줍니다.
-- 재실행해도 안전합니다.

create or replace function public.honjaya_notify_change()
returns trigger
language plpgsql
as $$
declare
  payload text;
  row_id text;
begin
  row_id := coalesce(
    case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'id') else (to_jsonb(new) ->> 'id') end,
    -- id 컬럼이 없는 마스터 표(bar_tables)는 table_number 를 식별자로 씁니다.
    case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'table_number') else (to_jsonb(new) ->> 'table_number') end,
    ''
  );

  payload := json_build_object(
    'table', tg_table_name,
    'action', lower(tg_op),
    'id', row_id
  )::text;

  perform pg_notify('honjaya_events', payload);
  return null;
end;
$$;

do $$
declare
  target text;
begin
  foreach target in array array[
    'categories',
    'products',
    'order_sheets',
    'orders',
    'active_order_sheets',
    'counters',
    'app_settings',
    'bar_tables'
  ]
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = target
    ) then
      execute format('drop trigger if exists honjaya_notify_change on public.%I', target);
      execute format(
        'create trigger honjaya_notify_change after insert or update or delete on public.%I for each row execute function public.honjaya_notify_change()',
        target
      );
    end if;
  end loop;
end;
$$;
