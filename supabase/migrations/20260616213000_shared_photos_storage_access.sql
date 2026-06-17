drop policy if exists "zdjecia_select_shared" on public.zdjecia;
create policy "zdjecia_select_shared"
  on public.zdjecia
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_investment_member(investment_id)
  );

drop policy if exists "zdjecia_insert_shared" on public.zdjecia;
create policy "zdjecia_insert_shared"
  on public.zdjecia
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      investment_id is null
      or public.is_investment_member(investment_id)
    )
  );

drop policy if exists "zdjecia_update_shared" on public.zdjecia;
create policy "zdjecia_update_shared"
  on public.zdjecia
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

drop policy if exists "zdjecia_delete_shared" on public.zdjecia;
create policy "zdjecia_delete_shared"
  on public.zdjecia
  for delete
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_investment_owner(investment_id)
  );

drop policy if exists "buildiq_storage_select_own" on storage.objects;
create policy "buildiq_storage_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id in ('zdjecia', 'dokumenty', 'paragony', 'rzuty_projektu', 'dziennik', 'models', 'modele_projektu')
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[2] = auth.uid()::text
      or (
        bucket_id = 'zdjecia'
        and exists (
          select 1
          from public.zdjecia z
          where z.file_path = name
            and (auth.uid() = z.user_id or public.is_investment_member(z.investment_id))
        )
      )
      or (
        bucket_id = 'dokumenty'
        and exists (
          select 1
          from public.dokumenty d
          where d.plik_url = name
            and (auth.uid() = d.user_id or public.is_investment_member(d.investment_id))
        )
      )
      or (
        bucket_id = 'paragony'
        and exists (
          select 1
          from public.wydatki w
          where w.plik = name
            and (auth.uid() = w.user_id or public.is_investment_member(w.investment_id))
        )
      )
      or (
        bucket_id = 'dziennik'
        and exists (
          select 1
          from public.dziennik j
          where j.zdjecie_url = name
            and (auth.uid() = j.user_id or public.is_investment_member(j.investment_id))
        )
      )
    )
  );

drop policy if exists "buildiq_storage_delete_own" on storage.objects;
create policy "buildiq_storage_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id in ('zdjecia', 'dokumenty', 'paragony', 'rzuty_projektu', 'dziennik', 'models', 'modele_projektu')
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[2] = auth.uid()::text
      or (
        bucket_id = 'zdjecia'
        and exists (
          select 1
          from public.zdjecia z
          where z.file_path = name
            and (auth.uid() = z.user_id or public.is_investment_owner(z.investment_id))
        )
      )
      or (
        bucket_id = 'dokumenty'
        and exists (
          select 1
          from public.dokumenty d
          where d.plik_url = name
            and (auth.uid() = d.user_id or public.is_investment_owner(d.investment_id))
        )
      )
      or (
        bucket_id = 'paragony'
        and exists (
          select 1
          from public.wydatki w
          where w.plik = name
            and (auth.uid() = w.user_id or public.is_investment_owner(w.investment_id))
        )
      )
      or (
        bucket_id = 'dziennik'
        and exists (
          select 1
          from public.dziennik j
          where j.zdjecie_url = name
            and (auth.uid() = j.user_id or public.is_investment_owner(j.investment_id))
        )
      )
    )
  );
