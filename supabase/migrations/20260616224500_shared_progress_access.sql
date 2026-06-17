alter table public.profiles
  add column if not exists investment_id uuid references public.inwestycje(id) on delete cascade;

alter table public.user_stages
  add column if not exists investment_id uuid references public.inwestycje(id) on delete cascade;

alter table public.etapy
  add column if not exists investment_id uuid references public.inwestycje(id) on delete cascade;

create index if not exists profiles_investment_id_idx on public.profiles (investment_id);
create index if not exists user_stages_investment_id_idx on public.user_stages (investment_id);
create index if not exists etapy_investment_id_idx on public.etapy (investment_id);

update public.profiles p
set investment_id = i.id
from public.inwestycje i
where p.investment_id is null
  and p.user_id = i.user_id;

update public.user_stages us
set investment_id = i.id
from public.inwestycje i
where us.investment_id is null
  and us.user_id = i.user_id;

update public.etapy e
set investment_id = i.id
from public.inwestycje i
where e.investment_id is null
  and e.user_id = i.user_id;

drop policy if exists "profiles_select_shared" on public.profiles;
create policy "profiles_select_shared"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_investment_member(investment_id)
  );

drop policy if exists "user_stages_select_shared" on public.user_stages;
create policy "user_stages_select_shared"
  on public.user_stages
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_investment_member(investment_id)
  );

drop policy if exists "etapy_select_shared" on public.etapy;
create policy "etapy_select_shared"
  on public.etapy
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_investment_member(investment_id)
  );
