insert into storage.buckets (id, name, public)
values
  ('zdjecia', 'zdjecia', false),
  ('dokumenty', 'dokumenty', false),
  ('paragony', 'paragony', false),
  ('rzuty_projektu', 'rzuty_projektu', false),
  ('dziennik', 'dziennik', false),
  ('models', 'models', true),
  ('modele_projektu', 'modele_projektu', false)
on conflict (id) do nothing;

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
    )
  );

drop policy if exists "buildiq_storage_insert_own" on storage.objects;
create policy "buildiq_storage_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id in ('zdjecia', 'dokumenty', 'paragony', 'rzuty_projektu', 'dziennik', 'models', 'modele_projektu')
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[2] = auth.uid()::text
    )
  );

drop policy if exists "buildiq_storage_update_own" on storage.objects;
create policy "buildiq_storage_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id in ('zdjecia', 'dokumenty', 'paragony', 'rzuty_projektu', 'dziennik', 'models', 'modele_projektu')
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[2] = auth.uid()::text
    )
  )
  with check (
    bucket_id in ('zdjecia', 'dokumenty', 'paragony', 'rzuty_projektu', 'dziennik', 'models', 'modele_projektu')
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[2] = auth.uid()::text
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
    )
  );

drop policy if exists "buildiq_models_public_select" on storage.objects;
create policy "buildiq_models_public_select"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'models');
