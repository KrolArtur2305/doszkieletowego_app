create table if not exists public.app_error_reports (
  id uuid primary key default gen_random_uuid(),
  client_report_id text not null unique,
  user_id uuid null references auth.users(id) on delete set null,
  investment_id uuid null references public.inwestycje(id) on delete set null,
  platform text null,
  app_version text null,
  build_version text null,
  route text null,
  feature text null,
  action text null,
  severity text not null default 'error' check (severity in ('fatal', 'error', 'warning', 'info')),
  message text not null,
  error_name text null,
  error_code text null,
  stack text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_error_reports_created_at_idx
  on public.app_error_reports (created_at desc);

create index if not exists app_error_reports_user_created_at_idx
  on public.app_error_reports (user_id, created_at desc);

create index if not exists app_error_reports_investment_created_at_idx
  on public.app_error_reports (investment_id, created_at desc);

alter table public.app_error_reports enable row level security;

drop policy if exists "app_error_reports_insert_own" on public.app_error_reports;
create policy "app_error_reports_insert_own"
  on public.app_error_reports
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "app_error_reports_select_own" on public.app_error_reports;
create policy "app_error_reports_select_own"
  on public.app_error_reports
  for select
  to authenticated
  using (auth.uid() = user_id);
