-- Patch 003: hide every menu item so a new menu board can be imported from scratch.
-- Run once in the Supabase SQL Editor on an existing database.
-- Data-only patch: it changes products.is_active, nothing else.
-- Categories, soft-deleted rows, images and order history snapshots stay untouched.
-- Safe to re-run: only rows that are still exposed are updated.

-- 1) hide every exposed product ----------------------------------------------
update public.products
   set is_active = false,
       updated_at = now()
 where is_active = true
   and deleted_at is null;

-- 2) verification -------------------------------------------------------------
select count(*) filter (where is_active)              as exposed_products,
       count(*) filter (where is_active = false)      as hidden_products,
       count(*) filter (where deleted_at is not null) as soft_deleted_products,
       count(*)                                       as total_products
  from public.products;
