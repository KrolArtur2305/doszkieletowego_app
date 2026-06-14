alter table public.wydatki
  add column if not exists source text;

create index if not exists wydatki_user_source_idx
  on public.wydatki (user_id, source);
