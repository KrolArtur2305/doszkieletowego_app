do $$
begin
  if to_regclass('public.wydatki') is not null then
    execute 'alter table public.wydatki enable row level security';
    execute 'drop policy if exists wydatki_select_shared on public.wydatki';
    execute 'create policy wydatki_select_shared on public.wydatki for select to authenticated using (auth.uid() = user_id or public.is_investment_member(investment_id))';
    execute 'drop policy if exists wydatki_insert_shared on public.wydatki';
    execute 'create policy wydatki_insert_shared on public.wydatki for insert to authenticated with check (auth.uid() = user_id and (investment_id is null or public.is_investment_member(investment_id)))';
    execute 'drop policy if exists wydatki_update_shared on public.wydatki';
    execute 'create policy wydatki_update_shared on public.wydatki for update to authenticated using (auth.uid() = user_id or public.is_investment_owner(investment_id)) with check (auth.uid() = user_id or public.is_investment_owner(investment_id))';
    execute 'drop policy if exists wydatki_delete_shared on public.wydatki';
    execute 'create policy wydatki_delete_shared on public.wydatki for delete to authenticated using (auth.uid() = user_id or public.is_investment_owner(investment_id))';
  end if;

  if to_regclass('public.dokumenty') is not null then
    execute 'alter table public.dokumenty enable row level security';
    execute 'drop policy if exists dokumenty_select_shared on public.dokumenty';
    execute 'create policy dokumenty_select_shared on public.dokumenty for select to authenticated using (auth.uid() = user_id or public.is_investment_member(investment_id))';
    execute 'drop policy if exists dokumenty_insert_shared on public.dokumenty';
    execute 'create policy dokumenty_insert_shared on public.dokumenty for insert to authenticated with check (auth.uid() = user_id and (investment_id is null or public.is_investment_member(investment_id)))';
    execute 'drop policy if exists dokumenty_update_shared on public.dokumenty';
    execute 'create policy dokumenty_update_shared on public.dokumenty for update to authenticated using (auth.uid() = user_id or public.is_investment_owner(investment_id)) with check (auth.uid() = user_id or public.is_investment_owner(investment_id))';
    execute 'drop policy if exists dokumenty_delete_shared on public.dokumenty';
    execute 'create policy dokumenty_delete_shared on public.dokumenty for delete to authenticated using (auth.uid() = user_id or public.is_investment_owner(investment_id))';
  end if;
end $$;
