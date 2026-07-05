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
  current_count integer;
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
  into current_count
  from public.budget_scan_monthly_usage u
  where u.scope_key = p_scope_key
    and u.usage_month = current_month
  for update;

  if p_limit is not null and current_count >= p_limit then
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

    return query select
      null::uuid,
      current_count,
      0;
    return;
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

grant execute on function public.claim_budget_scan_ocr_usage(text, integer, uuid, text, integer, text) to authenticated;
