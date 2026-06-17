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
  )
  or exists (
    select 1
    from public.inwestycje i
    where i.id = p_investment_id
      and i.user_id = auth.uid()
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
  )
  or exists (
    select 1
    from public.inwestycje i
    where i.id = p_investment_id
      and i.user_id = auth.uid()
  );
$$;

