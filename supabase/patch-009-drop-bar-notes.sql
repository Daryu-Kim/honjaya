-- Patch 009: drop the "today's one line" (bar_notes) feature.
-- The feature was removed from the app, so the table, policies and indexes are no longer used.
-- Safe to run multiple times.

drop table if exists public.bar_notes;
