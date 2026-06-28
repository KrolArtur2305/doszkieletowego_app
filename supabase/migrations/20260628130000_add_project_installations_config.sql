alter table public.projekty
  add column if not exists installations_config jsonb not null default '{}'::jsonb;
