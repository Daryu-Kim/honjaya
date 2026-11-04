-- Honjaya patch-011 — 실시간 칵테일 시세(market)
--
-- app_settings(id = 'market') 한 줄에 시세 설정 전체를 jsonb 로 저장합니다.
-- 지금까지 app_settings 는 읽기 전용(select 정책만)이었기 때문에,
-- 태블릿에서 on/off 및 세부 설정을 저장할 수 있도록 쓰기 권한을 추가합니다.
-- 여러 번 실행해도 안전합니다.

grant insert, update on public.app_settings to anon, authenticated;

drop policy if exists "app_settings: app write" on public.app_settings;

create policy "app_settings: app write"
  on public.app_settings for all to anon, authenticated
  using (true) with check (true);

comment on table public.app_settings is
  '앱 전역 설정. id = ''market'' 은 실시간 시세(가격 변동) 설정을 담습니다.';

-- 설정 변경이 다른 화면(TV/손님/태블릿)에 바로 전달되도록 realtime 에 추가합니다.
alter table public.app_settings replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_settings'
  ) then
    alter publication supabase_realtime add table public.app_settings;
  end if;
end
$$;

-- 기본값은 "꺼짐". 관리자가 태블릿에서 켜면 그때부터 가격이 움직입니다.
insert into public.app_settings (id, value, updated_at)
values (
  'market',
  jsonb_build_object(
    'enabled', false,
    'applyToOrders', true,
    'tickSeconds', 1,
    'maxChangePct', 60,
    'volatility', 1,
    'demandWeight', 1,
    'chainWeight', 1,
    'demandTarget', 4,
    'showIngredients', true,
    'categoryIds', '[]'::jsonb,
    'seed', 'honjaya-market',
    'startedAt', '',
    'businessDate', '',
    'frozenUntil', '',
    'aliases', '{}'::jsonb,
    'updatedAt', ''
  ),
  now()
)
on conflict (id) do nothing;
