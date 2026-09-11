-- Patch 004: remove the legacy '칵테일' category row for good.
-- Run once in the Supabase SQL Editor on an existing database.
-- The menu importer only deactivates categories that are missing from the menu file
-- (scripts/menu/import-menu.mjs, syncCategories), so deleting the row is a manual step.
-- Safe to re-run: matches by code/name and nothing in production references the row.
--
-- Pre-check (verified against production): no product keeps the '칵테일' category id in
-- category_id or category_ids, so sections 1) are no-ops there; they only guard against
-- leftovers in other environments. products.category_id is text, not a foreign key.
--
-- After this patch the menu has 9 active categories:
--   시그니처 / 라이트 / 미디엄 / 스트롱 / 인텐스 칵테일, 샷, 논알콜, 맥주, 푸드, 소프트드링크

-- 1) drop leftover references ---------------------------------------------------
update public.products p
   set category_ids = array_remove(p.category_ids, c.id),
       updated_at = now()
  from public.categories c
 where (c.code = 'cocktail' or c.name = '칵테일')
   and c.id = any (p.category_ids);

update public.products p
   set category_id = '',
       updated_at = now()
  from public.categories c
 where (c.code = 'cocktail' or c.name = '칵테일')
   and p.category_id = c.id;

-- 2) delete the category row ----------------------------------------------------
delete from public.categories
 where code = 'cocktail'
    or name = '칵테일';

-- 3) verification ---------------------------------------------------------------
select name, code, sort_order, is_active
  from public.categories
 order by sort_order;

select count(*) filter (where is_active and deleted_at is null) as exposed_products
  from public.products;
