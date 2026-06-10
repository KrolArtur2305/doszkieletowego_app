alter table public.dokumenty
  add column if not exists stage_group_code text,
  add column if not exists stage_code text;

create index if not exists dokumenty_user_stage_group_idx
  on public.dokumenty (user_id, stage_group_code, created_at desc);
