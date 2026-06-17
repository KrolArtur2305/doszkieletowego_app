alter table public.zdjecia
  add column if not exists investment_id uuid references public.inwestycje(id) on delete cascade;

create index if not exists zdjecia_investment_id_idx on public.zdjecia (investment_id);

update public.zdjecia z
set investment_id = i.id
from public.inwestycje i
where z.investment_id is null
  and z.user_id = i.user_id;

alter table public.dziennik
  add column if not exists investment_id uuid references public.inwestycje(id) on delete cascade;

create index if not exists dziennik_investment_id_idx on public.dziennik (investment_id);

update public.dziennik d
set investment_id = i.id
from public.inwestycje i
where d.investment_id is null
  and d.user_id = i.user_id;

drop policy if exists "dziennik_select_shared" on public.dziennik;
create policy "dziennik_select_shared"
  on public.dziennik
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_investment_member(investment_id)
  );

drop policy if exists "dziennik_insert_shared" on public.dziennik;
create policy "dziennik_insert_shared"
  on public.dziennik
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      investment_id is null
      or public.is_investment_member(investment_id)
    )
  );

drop policy if exists "dziennik_update_shared" on public.dziennik;
create policy "dziennik_update_shared"
  on public.dziennik
  for update
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_investment_owner(investment_id)
  )
  with check (
    auth.uid() = user_id
    or public.is_investment_owner(investment_id)
  );

drop policy if exists "dziennik_delete_shared" on public.dziennik;
create policy "dziennik_delete_shared"
  on public.dziennik
  for delete
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_investment_owner(investment_id)
  );
