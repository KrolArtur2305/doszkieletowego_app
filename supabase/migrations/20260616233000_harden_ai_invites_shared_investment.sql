alter table public.inwestycje
  enable row level security;

drop policy if exists "inwestycje_select_shared" on public.inwestycje;
create policy "inwestycje_select_shared"
  on public.inwestycje
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_investment_member(id)
  );

create table if not exists public.investment_invite_attempts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  attempt_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now()
);

alter table public.investment_invite_attempts enable row level security;

create or replace function public.record_invite_accept_attempt(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.investment_invite_attempts%rowtype;
  window_length interval := interval '10 minutes';
  max_attempts integer := 10;
begin
  if p_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into current_row
  from public.investment_invite_attempts
  where user_id = p_user_id
  for update;

  if not found or current_row.window_started_at <= now() - window_length then
    insert into public.investment_invite_attempts (
      user_id,
      attempt_count,
      window_started_at,
      last_attempt_at
    )
    values (
      p_user_id,
      1,
      now(),
      now()
    )
    on conflict (user_id) do update
      set attempt_count = excluded.attempt_count,
          window_started_at = excluded.window_started_at,
          last_attempt_at = excluded.last_attempt_at;
    return;
  end if;

  if current_row.attempt_count >= max_attempts then
    raise exception 'invite_accept_rate_limited';
  end if;

  update public.investment_invite_attempts
  set attempt_count = current_row.attempt_count + 1,
      last_attempt_at = now()
  where user_id = p_user_id;
end;
$$;

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
returns table(investment_id uuid, role text)
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

  select *
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
  )
  on conflict (investment_id, user_id) do update
    set role = 'partner',
        permissions = excluded.permissions,
        invited_by = excluded.invited_by,
        updated_at = now();

  update public.investment_invites
  set accepted_uses = accepted_uses + 1,
      accepted_at = coalesce(accepted_at, now())
  where id = invite_row.id;

  return query select invite_row.investment_id, 'partner'::text;
end;
$$;

grant execute on function public.record_invite_accept_attempt(uuid) to authenticated;
grant execute on function public.create_investment_invite(uuid, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.accept_investment_invite(text) to authenticated;
