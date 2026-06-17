drop policy if exists "projekty_select_shared" on public.projekty;
create policy "projekty_select_shared"
  on public.projekty
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_investment_member(investment_id)
  );

drop policy if exists "rzuty_projektu_select_shared" on public.rzuty_projektu;
create policy "rzuty_projektu_select_shared"
  on public.rzuty_projektu
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_investment_member(investment_id)
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
      or (
        bucket_id = 'rzuty_projektu'
        and exists (
          select 1
          from public.rzuty_projektu r
          where r.url = name
            and (auth.uid() = r.user_id or public.is_investment_member(r.investment_id))
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
      or (
        bucket_id = 'rzuty_projektu'
        and exists (
          select 1
          from public.rzuty_projektu r
          where r.url = name
            and (auth.uid() = r.user_id or public.is_investment_owner(r.investment_id))
        )
      )
    )
  );
