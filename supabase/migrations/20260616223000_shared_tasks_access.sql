alter table public.zadania
  add column if not exists investment_id uuid references public.inwestycje(id) on delete cascade;

create index if not exists zadania_investment_id_idx on public.zadania (investment_id);

update public.zadania z
set investment_id = i.id
from public.inwestycje i
where z.investment_id is null
  and z.user_id = i.user_id;

drop policy if exists "zadania_select_shared" on public.zadania;
create policy "zadania_select_shared"
  on public.zadania
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_investment_member(investment_id)
  );

drop policy if exists "zadania_insert_shared" on public.zadania;
create policy "zadania_insert_shared"
  on public.zadania
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      investment_id is null
      or public.is_investment_member(investment_id)
    )
  );

drop policy if exists "zadania_update_shared" on public.zadania;
create policy "zadania_update_shared"
  on public.zadania
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

drop policy if exists "zadania_delete_shared" on public.zadania;
create policy "zadania_delete_shared"
  on public.zadania
  for delete
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_investment_owner(investment_id)
  );
