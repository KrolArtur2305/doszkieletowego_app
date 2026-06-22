drop function if exists public.accept_investment_invite(text);

create function public.accept_investment_invite(p_invite_code text)
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
  )
  on conflict (investment_id, user_id) do update
    set role = 'partner',
        permissions = excluded.permissions,
        invited_by = excluded.invited_by,
        updated_at = now();

  update public.investment_invites ii
  set accepted_uses = ii.accepted_uses + 1,
      accepted_at = coalesce(ii.accepted_at, now())
  where ii.id = invite_row.id;
end;
$$;

grant execute on function public.accept_investment_invite(text) to authenticated;
