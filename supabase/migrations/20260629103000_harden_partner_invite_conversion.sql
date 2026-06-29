create or replace function public.create_investment_invite(
  p_investment_id uuid,
  p_view_budget boolean default true,
  p_view_documents boolean default true,
  p_add_photos boolean default true,
  p_add_journal boolean default true,
  p_add_expenses boolean default false,
  p_manage_tasks boolean default false
)
returns table(invite_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_plan text;
  generated_code text;
  expiry timestamptz := now() + interval '14 days';
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_investment_owner(p_investment_id) then
    raise exception 'not_investment_owner';
  end if;

  select p.plan
  into current_plan
  from public.profiles p
  where p.user_id = auth.uid()
  limit 1;

  if coalesce(current_plan, 'free') not in ('expert', 'pro_plus') then
    raise exception 'expert_plan_required';
  end if;

  update public.investment_invites
  set revoked_at = now()
  where investment_id = p_investment_id
    and revoked_at is null
    and accepted_uses < max_uses;

  loop
    generated_code := upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 10));
    exit when not exists (
      select 1
      from public.investment_invites i
      where i.invite_code = generated_code
    );
  end loop;

  insert into public.investment_invites (
    investment_id,
    invite_code,
    role,
    permissions,
    created_by,
    expires_at
  )
  values (
    p_investment_id,
    generated_code,
    'partner',
    jsonb_build_object(
      'view_budget', p_view_budget,
      'view_documents', p_view_documents,
      'add_photos', p_add_photos,
      'add_journal', p_add_journal,
      'add_expenses', p_add_expenses,
      'manage_tasks', p_manage_tasks
    ),
    auth.uid(),
    expiry
  );

  return query select generated_code, expiry;
end;
$$;

create or replace function public.accept_investment_invite(p_invite_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.investment_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  perform public.record_invite_accept_attempt(auth.uid());

  if exists (
    select 1
    from public.inwestycje i
    where i.user_id = auth.uid()
  ) or exists (
    select 1
    from public.investment_members m
    where m.user_id = auth.uid()
  ) then
    raise exception 'already_has_active_build';
  end if;

  select i.*
  into invite_row
  from public.investment_invites i
  where i.invite_code = upper(trim(p_invite_code))
    and i.revoked_at is null
    and i.expires_at > now()
    and i.accepted_uses < i.max_uses
  order by i.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'invalid_or_expired_invite';
  end if;

  insert into public.investment_members (
    investment_id,
    user_id,
    role,
    permissions,
    invited_by
  )
  values (
    invite_row.investment_id,
    auth.uid(),
    'partner',
    invite_row.permissions,
    invite_row.created_by
  );

  update public.investment_invites ii
  set accepted_uses = ii.accepted_uses + 1,
      accepted_at = coalesce(ii.accepted_at, now())
  where ii.id = invite_row.id;
end;
$$;

grant execute on function public.create_investment_invite(uuid, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.accept_investment_invite(text) to authenticated;

create table if not exists public.build_ai_daily_usage (
  scope_key text not null,
  usage_date date not null default current_date,
  message_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (scope_key, usage_date)
);

alter table public.build_ai_daily_usage enable row level security;

create or replace function public.get_build_ai_daily_usage(p_scope_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  investment_scope uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if nullif(trim(p_scope_key), '') is null then
    raise exception 'missing_usage_scope';
  end if;

  if p_scope_key like 'user:%' and substring(p_scope_key from 6) <> auth.uid()::text then
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

  return coalesce((
    select u.message_count
    from public.build_ai_daily_usage u
    where u.scope_key = p_scope_key
      and u.usage_date = current_date
    limit 1
  ), 0);
end;
$$;

create or replace function public.increment_build_ai_daily_usage(p_scope_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  investment_scope uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if nullif(trim(p_scope_key), '') is null then
    raise exception 'missing_usage_scope';
  end if;

  if p_scope_key like 'user:%' and substring(p_scope_key from 6) <> auth.uid()::text then
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

  insert into public.build_ai_daily_usage (
    scope_key,
    usage_date,
    message_count,
    updated_at
  )
  values (
    p_scope_key,
    current_date,
    1,
    now()
  )
  on conflict (scope_key, usage_date) do update
    set message_count = public.build_ai_daily_usage.message_count + 1,
        updated_at = now();
end;
$$;

grant execute on function public.get_build_ai_daily_usage(text) to authenticated;
grant execute on function public.increment_build_ai_daily_usage(text) to authenticated;
