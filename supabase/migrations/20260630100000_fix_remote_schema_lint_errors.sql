create or replace function public.get_my_name()
returns text
language sql
security definer
set search_path = public
as $$
  select p.imie
  from public.profiles p
  where p.user_id = auth.uid()
  limit 1;
$$;

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
set search_path = public, extensions
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

grant execute on function public.get_my_name() to authenticated;
grant execute on function public.delete_user_completely(uuid) to authenticated;
grant execute on function public.create_investment_invite(uuid, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
