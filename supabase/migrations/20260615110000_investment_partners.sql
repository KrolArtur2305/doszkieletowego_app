create extension if not exists pgcrypto;

alter table public.inwestycje
  add column if not exists id uuid default gen_random_uuid();

update public.inwestycje
set id = gen_random_uuid()
where id is null;

alter table public.inwestycje
  alter column id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inwestycje_id_key'
      and conrelid = 'public.inwestycje'::regclass
  ) then
    alter table public.inwestycje
      add constraint inwestycje_id_key unique (id);
  end if;
end $$;

create table if not exists public.investment_members (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.inwestycje (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'partner' check (role in ('owner', 'partner')),
  permissions jsonb not null default '{}'::jsonb,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (investment_id, user_id)
);

create index if not exists investment_members_user_id_idx
  on public.investment_members (user_id);

create index if not exists investment_members_investment_id_idx
  on public.investment_members (investment_id);

create table if not exists public.investment_invites (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.inwestycje (id) on delete cascade,
  invite_code text not null unique,
  role text not null default 'partner' check (role = 'partner'),
  permissions jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  max_uses integer not null default 1 check (max_uses > 0),
  accepted_uses integer not null default 0 check (accepted_uses >= 0),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists investment_invites_investment_id_idx
  on public.investment_invites (investment_id);

create index if not exists investment_invites_created_by_idx
  on public.investment_invites (created_by);

insert into public.investment_members (investment_id, user_id, role, permissions)
select
  i.id,
  i.user_id,
  'owner',
  jsonb_build_object(
    'view_budget', true,
    'view_documents', true,
    'add_photos', true,
    'add_journal', true,
    'manage_tasks', true
  )
from public.inwestycje i
where i.user_id is not null
on conflict (investment_id, user_id) do nothing;

create or replace function public.ensure_investment_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    insert into public.investment_members (investment_id, user_id, role, permissions)
    values (
      new.id,
      new.user_id,
      'owner',
      jsonb_build_object(
        'view_budget', true,
        'view_documents', true,
        'add_photos', true,
        'add_journal', true,
        'manage_tasks', true
      )
    )
    on conflict (investment_id, user_id) do update
      set role = 'owner',
          permissions = excluded.permissions,
          updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_investment_owner_member_trigger on public.inwestycje;
create trigger ensure_investment_owner_member_trigger
  after insert or update of user_id on public.inwestycje
  for each row
  execute function public.ensure_investment_owner_member();

do $$
declare
  target_table text;
  constraint_name text;
begin
  foreach target_table in array array[
    'wydatki',
    'dokumenty',
    'zdjecia',
    'zadania',
    'kontakty',
    'dziennik',
    'projekty',
    'rzuty_projektu',
    'etapy',
    'user_stages',
    'ai_conversations'
  ] loop
    if to_regclass(format('public.%I', target_table)) is not null
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = target_table
          and column_name = 'user_id'
      )
    then
      execute format('alter table public.%I add column if not exists investment_id uuid', target_table);
      execute format('create index if not exists %I on public.%I (investment_id)', target_table || '_investment_id_idx', target_table);
      execute format(
        'update public.%I t set investment_id = i.id from public.inwestycje i where t.investment_id is null and t.user_id = i.user_id',
        target_table
      );

      constraint_name := target_table || '_investment_id_fkey';
      if not exists (
        select 1
        from pg_constraint
        where conname = constraint_name
          and conrelid = format('public.%I', target_table)::regclass
      ) then
        execute format(
          'alter table public.%I add constraint %I foreign key (investment_id) references public.inwestycje (id) on delete cascade not valid',
          target_table,
          constraint_name
        );
      end if;
    end if;
  end loop;
end $$;

create or replace function public.is_investment_member(p_investment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.investment_members m
    where m.investment_id = p_investment_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_investment_owner(p_investment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.investment_members m
    where m.investment_id = p_investment_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

create or replace function public.create_investment_invite(
  p_investment_id uuid,
  p_view_budget boolean default true,
  p_view_documents boolean default true,
  p_add_photos boolean default true,
  p_add_journal boolean default true,
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

  if coalesce(current_plan, 'free') <> 'expert' then
    raise exception 'expert_plan_required';
  end if;

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

alter table public.investment_members enable row level security;
alter table public.investment_invites enable row level security;

drop policy if exists "investment_members_select_member" on public.investment_members;
create policy "investment_members_select_member"
  on public.investment_members
  for select
  to authenticated
  using (public.is_investment_member(investment_id));

drop policy if exists "investment_members_owner_insert" on public.investment_members;
create policy "investment_members_owner_insert"
  on public.investment_members
  for insert
  to authenticated
  with check (public.is_investment_owner(investment_id));

drop policy if exists "investment_members_owner_update" on public.investment_members;
create policy "investment_members_owner_update"
  on public.investment_members
  for update
  to authenticated
  using (public.is_investment_owner(investment_id))
  with check (public.is_investment_owner(investment_id));

drop policy if exists "investment_members_owner_delete" on public.investment_members;
create policy "investment_members_owner_delete"
  on public.investment_members
  for delete
  to authenticated
  using (public.is_investment_owner(investment_id) and role <> 'owner');

drop policy if exists "investment_invites_owner_select" on public.investment_invites;
create policy "investment_invites_owner_select"
  on public.investment_invites
  for select
  to authenticated
  using (public.is_investment_owner(investment_id));

drop policy if exists "investment_invites_owner_update" on public.investment_invites;
create policy "investment_invites_owner_update"
  on public.investment_invites
  for update
  to authenticated
  using (public.is_investment_owner(investment_id))
  with check (public.is_investment_owner(investment_id));

drop policy if exists "investment_invites_owner_delete" on public.investment_invites;
create policy "investment_invites_owner_delete"
  on public.investment_invites
  for delete
  to authenticated
  using (public.is_investment_owner(investment_id));

grant execute on function public.is_investment_member(uuid) to authenticated;
grant execute on function public.is_investment_owner(uuid) to authenticated;
grant execute on function public.create_investment_invite(uuid, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.accept_investment_invite(text) to authenticated;
