-- Gold currency: add gold column to profiles
-- Run after schema.sql in your Supabase project

alter table public.profiles
  add column if not exists gold integer not null default 100 check (gold >= 0);
