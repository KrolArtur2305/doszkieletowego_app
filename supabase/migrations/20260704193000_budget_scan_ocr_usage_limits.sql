create table if not exists public.budget_scan_monthly_usage (
  scope_key text not null,
  usage_month date not null,
  scan_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (scope_key, usage_month)
);

alter table public.budget_scan_monthly_usage enable row level security;

create table if not exists public.budget_scan_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_id uuid null references public.inwestycje(id) on delete set null,
  scope_key text not null,
  plan text not null default 'free',
  status text not null default 'claimed',
  reason text null,
  model text null,
  input_size_bytes integer null,
  items_count integer null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.budget_scan_events enable row level security;

create index if not exists budget_scan_events_user_created_idx
  on public.budget_scan_events(user_id, created_at desc);

create index if not exists budget_scan_events_scope_created_idx
  on public.budget_scan_events(scope_key, created_at desc);

create or replace function public.claim_budget_scan_ocr_usage(
  p_scope_key text,
  p_limit integer,
  p_investment_id uuid default null,
  p_plan text default 'free',
  p_input_size_bytes integer default null,
  p_model text default null
)
returns table(event_id uuid, used_count integer, remaining_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_month date := date_trunc('month', now())::date;
  investment_scope uuid;
  next_count integer;
  new_event_id uuid;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if nullif(trim(p_scope_key), '') is null then
    raise exception 'missing_usage_scope';
  end if;

  if coalesce(p_limit, 0) < 0 then
    raise exception 'invalid_usage_limit';
  end if;

  if p_scope_key like 'user:%' and substring(p_scope_key from 6) <> current_user_id::text then
    raise exception 'not_usage_scope_owner';
  end if;

  if p_scope_key like 'investment:%' then
    investment_scope := substring(p_scope_key from 12)::uuid;
    if not public.is_investment_member(investment_scope) then
      raise exception 'not_usage_scope_member';
    end if;
  elsif p_scope_key not like 'user:%' then
    raise exception 'invalid_usage_scope';
  end if;

  perform pg_advisory_xact_lock(hashtext('budget_scan:' || p_scope_key || ':' || current_month::text));

  insert into public.budget_scan_monthly_usage (
    scope_key,
    usage_month,
    scan_count,
    updated_at
  )
  values (
    p_scope_key,
    current_month,
    0,
    now()
  )
  on conflict (scope_key, usage_month) do nothing;

  select u.scan_count
  into next_count
  from public.budget_scan_monthly_usage u
  where u.scope_key = p_scope_key
    and u.usage_month = current_month
  for update;

  if p_limit is not null and next_count >= p_limit then
    insert into public.budget_scan_events (
      user_id,
      investment_id,
      scope_key,
      plan,
      status,
      reason,
      model,
      input_size_bytes
    )
    values (
      current_user_id,
      p_investment_id,
      p_scope_key,
      coalesce(nullif(trim(p_plan), ''), 'free'),
      'rejected',
      'quota_reached',
      p_model,
      p_input_size_bytes
    );

    raise exception 'scanner_quota_reached';
  end if;

  update public.budget_scan_monthly_usage
  set scan_count = scan_count + 1,
      updated_at = now()
  where scope_key = p_scope_key
    and usage_month = current_month
  returning scan_count into next_count;

  insert into public.budget_scan_events (
    user_id,
    investment_id,
    scope_key,
    plan,
    status,
    model,
    input_size_bytes
  )
  values (
    current_user_id,
    p_investment_id,
    p_scope_key,
    coalesce(nullif(trim(p_plan), ''), 'free'),
    'claimed',
    p_model,
    p_input_size_bytes
  )
  returning id into new_event_id;

  return query select
    new_event_id,
    next_count,
    case
      when p_limit is null then null
      else greatest(p_limit - next_count, 0)
    end;
end;
$$;

create or replace function public.mark_budget_scan_ocr_event(
  p_event_id uuid,
  p_status text,
  p_items_count integer default null,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_status text := lower(trim(coalesce(p_status, '')));
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if normalized_status not in ('success', 'failed') then
    raise exception 'invalid_scan_event_status';
  end if;

  update public.budget_scan_events
  set status = normalized_status,
      items_count = p_items_count,
      error_message = left(nullif(trim(coalesce(p_error_message, '')), ''), 500),
      updated_at = now()
  where id = p_event_id
    and user_id = current_user_id;

  if not found then
    raise exception 'scan_event_not_found';
  end if;
end;
$$;

grant execute on function public.claim_budget_scan_ocr_usage(text, integer, uuid, text, integer, text) to authenticated;
grant execute on function public.mark_budget_scan_ocr_event(uuid, text, integer, text) to authenticated;
grant all on table public.budget_scan_monthly_usage to service_role;
grant all on table public.budget_scan_events to service_role;
