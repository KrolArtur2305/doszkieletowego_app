do $$
declare
  current_table_name text;
  table_names text[] := array[
    'profiles',
    'inwestycje',
    'wydatki',
    'dokumenty',
    'zdjecia',
    'etapy_zdjecia',
    'etapy',
    'zadania',
    'kontakty',
    'dziennik',
    'zgloszenia',
    'push_devices',
    'rzuty_projektu',
    'projekty'
  ];
begin
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
      execute format('alter table public.%I enable row level security', current_table_name);

      execute format('drop policy if exists %I on public.%I', current_table_name || '_select_own', current_table_name);
      execute format(
        'create policy %I on public.%I for select to authenticated using (auth.uid() = user_id)',
        current_table_name || '_select_own',
        current_table_name
      );

      execute format('drop policy if exists %I on public.%I', current_table_name || '_insert_own', current_table_name);
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (auth.uid() = user_id)',
        current_table_name || '_insert_own',
        current_table_name
      );

      execute format('drop policy if exists %I on public.%I', current_table_name || '_update_own', current_table_name);
      execute format(
        'create policy %I on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
        current_table_name || '_update_own',
        current_table_name
      );

      execute format('drop policy if exists %I on public.%I', current_table_name || '_delete_own', current_table_name);
      execute format(
        'create policy %I on public.%I for delete to authenticated using (auth.uid() = user_id)',
        current_table_name || '_delete_own',
        current_table_name
      );
    end if;
  end loop;
end $$;
