alter table public.dokumenty
  add column if not exists document_date date,
  add column if not exists amount numeric(12,2);

create index if not exists dokumenty_user_document_date_idx
  on public.dokumenty (user_id, document_date desc);
