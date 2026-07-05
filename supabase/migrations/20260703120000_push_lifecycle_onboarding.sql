create extension if not exists pgcrypto;

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_push_token text not null,
  installation_id text not null,
  platform text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, installation_id)
);

alter table public.push_devices
  add column if not exists app_language text,
  add column if not exists timezone text,
  add column if not exists disabled_at timestamptz;

create index if not exists push_devices_active_user_idx
  on public.push_devices (user_id)
  where disabled_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_index i
    join pg_attribute a1 on a1.attrelid = i.indrelid and a1.attnum = i.indkey[0]
    join pg_attribute a2 on a2.attrelid = i.indrelid and a2.attnum = i.indkey[1]
    where i.indrelid = 'public.push_devices'::regclass
      and i.indisunique
      and a1.attname = 'user_id'
      and a2.attname = 'installation_id'
  ) then
    alter table public.push_devices
      add constraint push_devices_user_installation_unique unique (user_id, installation_id);
  end if;
end $$;

alter table public.push_devices enable row level security;

drop policy if exists "push_devices_select_own" on public.push_devices;
create policy "push_devices_select_own"
  on public.push_devices
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "push_devices_insert_own" on public.push_devices;
create policy "push_devices_insert_own"
  on public.push_devices
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "push_devices_update_own" on public.push_devices;
create policy "push_devices_update_own"
  on public.push_devices
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "push_devices_delete_own" on public.push_devices;
create policy "push_devices_delete_own"
  on public.push_devices
  for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.push_lifecycle_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  investment_id uuid not null references public.inwestycje (id) on delete cascade,
  user_registered_at timestamptz not null default now(),
  last_activity_at timestamptz,
  push_onboarding_24h_sent_at timestamptz,
  push_onboarding_72h_sent_at timestamptz,
  push_onboarding_7d_sent_at timestamptz,
  push_inactivity_14d_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, investment_id)
);

create index if not exists push_lifecycle_state_due_idx
  on public.push_lifecycle_state (user_id, investment_id, last_activity_at);

create table if not exists public.push_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  investment_id uuid not null references public.inwestycje (id) on delete cascade,
  push_type text not null,
  activity_anchor_at timestamptz not null,
  status text not null default 'claimed' check (status in ('claimed', 'sent', 'failed')),
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  expo_ticket_ids text[],
  receipt_checked_at timestamptz,
  receipt_status text,
  receipt_error_message text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_lifecycle_events
  add column if not exists receipt_checked_at timestamptz,
  add column if not exists receipt_status text,
  add column if not exists receipt_error_message text;

create unique index if not exists push_lifecycle_events_active_uidx
  on public.push_lifecycle_events (user_id, investment_id, push_type, activity_anchor_at)
  where status in ('claimed', 'sent');

create index if not exists push_lifecycle_events_user_idx
  on public.push_lifecycle_events (user_id, created_at desc);

create index if not exists push_lifecycle_events_receipts_idx
  on public.push_lifecycle_events (sent_at)
  where status = 'sent'
    and receipt_checked_at is null
    and expo_ticket_ids is not null;

alter table public.push_lifecycle_state enable row level security;

alter table public.push_lifecycle_events enable row level security;

drop policy if exists "push_lifecycle_state_select_own" on public.push_lifecycle_state;
create policy "push_lifecycle_state_select_own"
  on public.push_lifecycle_state
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "push_lifecycle_events_select_own" on public.push_lifecycle_events;
create policy "push_lifecycle_events_select_own"
  on public.push_lifecycle_events
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.ensure_push_lifecycle_state(
  p_user_id uuid,
  p_investment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  registered_at timestamptz;
begin
  if p_user_id is null or p_investment_id is null then
    return;
  end if;

  select u.created_at
    into registered_at
  from auth.users u
  where u.id = p_user_id
  limit 1;

  insert into public.push_lifecycle_state (
    user_id,
    investment_id,
    user_registered_at
  )
  values (
    p_user_id,
    p_investment_id,
    coalesce(registered_at, now())
  )
  on conflict (user_id, investment_id) do update
    set user_registered_at = least(
          public.push_lifecycle_state.user_registered_at,
          excluded.user_registered_at
        ),
        updated_at = now();
end;
$$;

create or replace function public.touch_push_lifecycle_activity(
  p_user_id uuid,
  p_investment_id uuid,
  p_activity_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_investment_id is null then
    return;
  end if;

  perform public.ensure_push_lifecycle_state(p_user_id, p_investment_id);

  update public.push_lifecycle_state
  set last_activity_at = greatest(coalesce(last_activity_at, p_activity_at), p_activity_at),
      updated_at = now()
  where user_id = p_user_id
    and investment_id = p_investment_id;
end;
$$;

create or replace function public.resolve_single_push_lifecycle_investment(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_investment_id uuid;
  investment_count integer;
begin
  if p_user_id is null then
    return null;
  end if;

  select min(i.id), count(*)
    into target_investment_id, investment_count
  from public.inwestycje i
  where i.user_id = p_user_id;

  if investment_count = 1 then
    return target_investment_id;
  end if;

  return null;
end;
$$;

create or replace function public.push_lifecycle_member_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_push_lifecycle_state(new.user_id, new.investment_id);
  return new;
end;
$$;

drop trigger if exists push_lifecycle_member_touch on public.investment_members;
create trigger push_lifecycle_member_touch
  after insert or update of user_id, investment_id on public.investment_members
  for each row
  execute function public.push_lifecycle_member_trigger();

create or replace function public.push_lifecycle_activity_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_investment_id uuid;
begin
  target_investment_id := new.investment_id;

  if target_investment_id is null then
    target_investment_id := public.resolve_single_push_lifecycle_investment(new.user_id);
  end if;

  perform public.touch_push_lifecycle_activity(new.user_id, target_investment_id, now());
  return new;
end;
$$;

create or replace function public.push_lifecycle_stage_activity_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_investment_id uuid;
begin
  if coalesce(new.status, '') <> 'done'
    or (tg_op = 'UPDATE' and coalesce(old.status, '') = 'done') then
    return new;
  end if;

  target_investment_id := new.investment_id;

  if target_investment_id is null then
    target_investment_id := public.resolve_single_push_lifecycle_investment(new.user_id);
  end if;

  perform public.touch_push_lifecycle_activity(new.user_id, target_investment_id, now());
  return new;
end;
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array['zdjecia', 'wydatki', 'dokumenty', 'zadania', 'dziennik'] loop
    if to_regclass(format('public.%I', target_table)) is not null
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = target_table
          and column_name = 'user_id'
      )
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = target_table
          and column_name = 'investment_id'
      )
    then
      execute format('drop trigger if exists %I on public.%I', 'push_lifecycle_activity_touch', target_table);
      execute format(
        'create trigger %I after insert on public.%I for each row execute function public.push_lifecycle_activity_trigger()',
        'push_lifecycle_activity_touch',
        target_table
      );
    end if;
  end loop;

  if to_regclass('public.user_stages') is not null then
    drop trigger if exists push_lifecycle_stage_activity_touch on public.user_stages;
    create trigger push_lifecycle_stage_activity_touch
      after insert or update of status on public.user_stages
      for each row
      execute function public.push_lifecycle_stage_activity_trigger();
  end if;
end $$;

insert into public.push_lifecycle_state (user_id, investment_id, user_registered_at, last_activity_at)
select
  m.user_id,
  m.investment_id,
  coalesce(u.created_at, m.created_at, now()),
  null
from public.investment_members m
left join auth.users u on u.id = m.user_id
on conflict (user_id, investment_id) do nothing;

create or replace function public.claim_push_lifecycle_event(
  p_user_id uuid,
  p_investment_id uuid,
  p_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_event_id uuid;
  anchor_at timestamptz;
begin
  update public.push_lifecycle_events
  set status = 'failed',
      failed_at = now(),
      next_retry_at = now(),
      error_message = coalesce(error_message, 'claim expired before send'),
      updated_at = now()
  where user_id = p_user_id
    and investment_id = p_investment_id
    and push_type = p_type
    and status = 'claimed'
    and claimed_at < now() - interval '30 minutes';

  if p_type = 'push_onboarding_24h' then
    select user_registered_at
      into anchor_at
    from public.push_lifecycle_state
    where user_id = p_user_id
      and investment_id = p_investment_id
      and last_activity_at is null
      and user_registered_at <= now() - interval '24 hours'
      and user_registered_at > now() - interval '72 hours'
      and push_onboarding_24h_sent_at is null
      and not exists (
        select 1
        from public.push_lifecycle_state s
        where s.user_id = p_user_id
          and s.push_onboarding_24h_sent_at is not null
      );
  elsif p_type = 'push_onboarding_72h' then
    select user_registered_at
      into anchor_at
    from public.push_lifecycle_state
    where user_id = p_user_id
      and investment_id = p_investment_id
      and last_activity_at is null
      and user_registered_at <= now() - interval '72 hours'
      and user_registered_at > now() - interval '7 days'
      and push_onboarding_72h_sent_at is null
      and not exists (
        select 1
        from public.push_lifecycle_state s
        where s.user_id = p_user_id
          and s.push_onboarding_72h_sent_at is not null
      );
  elsif p_type = 'push_onboarding_7d' then
    select user_registered_at
      into anchor_at
    from public.push_lifecycle_state
    where user_id = p_user_id
      and investment_id = p_investment_id
      and last_activity_at is null
      and user_registered_at <= now() - interval '7 days'
      and push_onboarding_7d_sent_at is null
      and not exists (
        select 1
        from public.push_lifecycle_state s
        where s.user_id = p_user_id
          and s.push_onboarding_7d_sent_at is not null
      );
  elsif p_type = 'push_inactivity_14d' then
    select last_activity_at
      into anchor_at
    from public.push_lifecycle_state
    where user_id = p_user_id
      and investment_id = p_investment_id
      and last_activity_at is not null
      and last_activity_at <= now() - interval '14 days'
      and (
        push_inactivity_14d_sent_at is null
        or push_inactivity_14d_sent_at < last_activity_at
      );
  else
    raise exception 'unknown_push_lifecycle_type';
  end if;

  if anchor_at is null then
    return null;
  end if;

  if exists (
    select 1
    from public.push_lifecycle_events e
    where e.user_id = p_user_id
      and e.investment_id = p_investment_id
      and e.push_type = p_type
      and e.activity_anchor_at = anchor_at
      and e.status = 'failed'
      and coalesce(e.next_retry_at, now()) > now()
  ) then
    return null;
  end if;

  if (
    select count(*)
    from public.push_lifecycle_events e
    where e.user_id = p_user_id
      and e.investment_id = p_investment_id
      and e.push_type = p_type
      and e.activity_anchor_at = anchor_at
      and e.status = 'failed'
  ) >= 3 then
    return null;
  end if;

  insert into public.push_lifecycle_events (
    user_id,
    investment_id,
    push_type,
    activity_anchor_at,
    status,
    claimed_at
  )
  values (
    p_user_id,
    p_investment_id,
    p_type,
    anchor_at,
    'claimed',
    now()
  )
  on conflict do nothing
  returning id into claimed_event_id;

  return claimed_event_id;
end;
$$;

create or replace function public.mark_push_lifecycle_event_sent(
  p_event_id uuid,
  p_ticket_ids text[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  event_row public.push_lifecycle_events%rowtype;
begin
  select *
    into event_row
  from public.push_lifecycle_events
  where id = p_event_id
  for update;

  if not found then
    return;
  end if;

  update public.push_lifecycle_events
  set status = 'sent',
      sent_at = now(),
      failed_at = null,
      error_message = null,
      expo_ticket_ids = p_ticket_ids,
      updated_at = now()
  where id = p_event_id;

  if event_row.push_type = 'push_onboarding_24h' then
    update public.push_lifecycle_state
    set push_onboarding_24h_sent_at = now(),
        updated_at = now()
    where user_id = event_row.user_id
      and investment_id = event_row.investment_id;
  elsif event_row.push_type = 'push_onboarding_72h' then
    update public.push_lifecycle_state
    set push_onboarding_72h_sent_at = now(),
        updated_at = now()
    where user_id = event_row.user_id
      and investment_id = event_row.investment_id;
  elsif event_row.push_type = 'push_onboarding_7d' then
    update public.push_lifecycle_state
    set push_onboarding_7d_sent_at = now(),
        updated_at = now()
    where user_id = event_row.user_id
      and investment_id = event_row.investment_id;
  elsif event_row.push_type = 'push_inactivity_14d' then
    update public.push_lifecycle_state
    set push_inactivity_14d_sent_at = now(),
        updated_at = now()
    where user_id = event_row.user_id
      and investment_id = event_row.investment_id;
  end if;
end;
$$;

create or replace function public.mark_push_lifecycle_event_failed(
  p_event_id uuid,
  p_error_message text,
  p_retry_delay interval default interval '6 hours'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.push_lifecycle_events
  set status = 'failed',
      failed_at = now(),
      retry_count = retry_count + 1,
      next_retry_at = now() + p_retry_delay,
      error_message = left(coalesce(p_error_message, 'unknown push error'), 1000),
      updated_at = now()
  where id = p_event_id
    and status = 'claimed';
end;
$$;

create or replace function public.get_pending_push_lifecycle_receipts(
  p_limit integer default 100
)
returns table (
  event_id uuid,
  user_id uuid,
  expo_ticket_ids text[]
)
language sql
security definer
set search_path = public
as $$
  select
    e.id as event_id,
    e.user_id,
    e.expo_ticket_ids
  from public.push_lifecycle_events e
  where e.status = 'sent'
    and e.receipt_checked_at is null
    and e.expo_ticket_ids is not null
    and cardinality(e.expo_ticket_ids) > 0
    and e.sent_at <= now() - interval '15 minutes'
  order by e.sent_at asc
  limit greatest(1, least(coalesce(p_limit, 100), 300));
$$;

create or replace function public.mark_push_lifecycle_receipt_checked(
  p_event_id uuid,
  p_receipt_status text,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.push_lifecycle_events
  set receipt_checked_at = now(),
      receipt_status = left(coalesce(p_receipt_status, 'unknown'), 64),
      receipt_error_message = left(nullif(p_error_message, ''), 1000),
      updated_at = now()
  where id = p_event_id;
end;
$$;

create or replace function public.get_due_push_lifecycle_candidates(
  p_now timestamptz default now(),
  p_respect_local_morning boolean default true
)
returns table (
  user_id uuid,
  investment_id uuid,
  expo_push_token text,
  installation_id text,
  app_language text,
  timezone text,
  push_type text,
  user_name text,
  ai_name text
)
language sql
security definer
set search_path = public
as $$
  with due as (
    select
      s.user_id,
      s.investment_id,
      case
        when s.last_activity_at is null
          and s.push_onboarding_24h_sent_at is null
          and s.user_registered_at <= p_now - interval '24 hours'
          and s.user_registered_at > p_now - interval '72 hours'
          and not exists (
            select 1
            from public.push_lifecycle_state sx
            where sx.user_id = s.user_id
              and sx.push_onboarding_24h_sent_at is not null
          )
          then 'push_onboarding_24h'
        when s.last_activity_at is null
          and s.push_onboarding_72h_sent_at is null
          and s.user_registered_at <= p_now - interval '72 hours'
          and s.user_registered_at > p_now - interval '7 days'
          and not exists (
            select 1
            from public.push_lifecycle_state sx
            where sx.user_id = s.user_id
              and sx.push_onboarding_72h_sent_at is not null
          )
          then 'push_onboarding_72h'
        when s.last_activity_at is null
          and s.push_onboarding_7d_sent_at is null
          and s.user_registered_at <= p_now - interval '7 days'
          and not exists (
            select 1
            from public.push_lifecycle_state sx
            where sx.user_id = s.user_id
              and sx.push_onboarding_7d_sent_at is not null
          )
          then 'push_onboarding_7d'
        when s.last_activity_at is not null
          and s.last_activity_at <= p_now - interval '14 days'
          and (
            s.push_inactivity_14d_sent_at is null
            or s.push_inactivity_14d_sent_at < s.last_activity_at
          )
          then 'push_inactivity_14d'
        else null
      end as push_type
    from public.push_lifecycle_state s
    where exists (
      select 1
      from public.investment_members m
      where m.user_id = s.user_id
        and m.investment_id = s.investment_id
    )
  ),
  ranked_due as (
    select
      d.*,
      row_number() over (
        partition by d.user_id
        order by case d.push_type
          when 'push_onboarding_24h' then 1
          when 'push_onboarding_72h' then 2
          when 'push_onboarding_7d' then 3
          when 'push_inactivity_14d' then 4
          else 9
        end, d.investment_id
      ) as rn
    from due d
    where d.push_type is not null
  )
  select
    d.user_id,
    d.investment_id,
    pd.expo_push_token,
    pd.installation_id,
    coalesce(nullif(pd.app_language, ''), 'en') as app_language,
    nullif(pd.timezone, '') as timezone,
    d.push_type,
    nullif(p.imie, '') as user_name,
    nullif(p.ai_buddy_name, '') as ai_name
  from ranked_due d
  join public.push_devices pd
    on pd.user_id = d.user_id
   and pd.disabled_at is null
   and nullif(pd.expo_push_token, '') is not null
  left join public.profiles p
    on p.user_id = d.user_id
  where d.rn = 1;
$$;

grant execute on function public.ensure_push_lifecycle_state(uuid, uuid) to authenticated, service_role;
grant execute on function public.touch_push_lifecycle_activity(uuid, uuid, timestamptz) to authenticated, service_role;
grant execute on function public.resolve_single_push_lifecycle_investment(uuid) to service_role;
grant execute on function public.claim_push_lifecycle_event(uuid, uuid, text) to service_role;
grant execute on function public.mark_push_lifecycle_event_sent(uuid, text[]) to service_role;
grant execute on function public.mark_push_lifecycle_event_failed(uuid, text, interval) to service_role;
grant execute on function public.get_pending_push_lifecycle_receipts(integer) to service_role;
grant execute on function public.mark_push_lifecycle_receipt_checked(uuid, text, text) to service_role;
grant execute on function public.get_due_push_lifecycle_candidates(timestamptz, boolean) to service_role;

create or replace function public.delete_user_completely(uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_table_name text;
  table_names text[] := array[
    'push_devices',
    'push_lifecycle_events',
    'push_lifecycle_state',
    'zgloszenia',
    'kontakty',
    'dziennik',
    'zadania',
    'zdjecia',
    'etapy_zdjecia',
    'dokumenty',
    'wydatki',
    'etapy',
    'user_stages',
    'rzuty_projektu',
    'projekty',
    'inwestycje',
    'profiles'
  ];
begin
  if auth.uid() is null or auth.uid() <> uid then
    raise exception 'not_authorized';
  end if;

  foreach current_table_name in array table_names loop
    if to_regclass(format('public.%I', current_table_name)) is not null
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = current_table_name
          and column_name = 'user_id'
      )
    then
      execute format('delete from public.%I where user_id = $1', current_table_name) using uid;
    end if;
  end loop;
end;
$$;

grant execute on function public.delete_user_completely(uuid) to authenticated;
