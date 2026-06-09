alter table public.rzuty_projektu
  add column if not exists typ text not null default 'plan';

alter table public.rzuty_projektu
  drop constraint if exists rzuty_projektu_typ_check;

alter table public.rzuty_projektu
  add constraint rzuty_projektu_typ_check
  check (typ in ('plan', 'visualization'));

create index if not exists rzuty_projektu_user_project_type_created_idx
  on public.rzuty_projektu (user_id, projekt_id, typ, created_at desc);
