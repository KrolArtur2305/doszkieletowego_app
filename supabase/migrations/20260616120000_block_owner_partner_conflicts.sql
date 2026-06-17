create or replace function public.has_partner_membership(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.investment_members m
    where m.user_id = p_user_id
      and m.role = 'partner'
  );
$$;

create or replace function public.prevent_partner_conflicting_own_build()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    return new;
  end if;

  if public.has_partner_membership(new.user_id) then
    raise exception 'partner_cannot_create_own_build';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_partner_conflicting_own_build_trigger on public.inwestycje;
create trigger prevent_partner_conflicting_own_build_trigger
  before insert or update of user_id on public.inwestycje
  for each row
  execute function public.prevent_partner_conflicting_own_build();

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

grant execute on function public.has_partner_membership(uuid) to authenticated;
