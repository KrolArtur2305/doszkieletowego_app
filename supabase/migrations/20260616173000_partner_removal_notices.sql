create table if not exists public.investment_member_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  investment_id uuid not null references public.inwestycje (id) on delete cascade,
  notice_type text not null default 'partner_removed',
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists investment_member_notices_user_id_idx
  on public.investment_member_notices (user_id);

create index if not exists investment_member_notices_investment_id_idx
  on public.investment_member_notices (investment_id);

alter table public.investment_member_notices enable row level security;

drop policy if exists "investment_member_notices_select_own" on public.investment_member_notices;
create policy "investment_member_notices_select_own"
  on public.investment_member_notices
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "investment_member_notices_update_own" on public.investment_member_notices;
create policy "investment_member_notices_update_own"
  on public.investment_member_notices
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, update on public.investment_member_notices to authenticated;
