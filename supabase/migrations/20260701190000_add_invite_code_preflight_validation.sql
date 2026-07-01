create or replace function public.validate_investment_invite(p_invite_code text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.investment_invites i
    where i.invite_code = upper(trim(p_invite_code))
      and i.revoked_at is null
      and i.expires_at > now()
      and i.accepted_uses < i.max_uses
  );
$$;

grant execute on function public.validate_investment_invite(text) to anon, authenticated;
