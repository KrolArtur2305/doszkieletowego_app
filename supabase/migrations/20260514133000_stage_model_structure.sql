create extension if not exists pgcrypto;

create table if not exists public.stage_templates (
  id uuid primary key default gen_random_uuid(),
  workflow_code text not null,
  stage_group_code text not null,
  stage_code text not null,
  name_key text not null,
  order_index integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint stage_templates_workflow_code_check
    check (workflow_code in ('masonry', 'timber_frame'))
);

create unique index if not exists stage_templates_workflow_code_stage_code_uidx
  on public.stage_templates (workflow_code, stage_code);

create index if not exists stage_templates_workflow_code_order_index_idx
  on public.stage_templates (workflow_code, order_index);

alter table public.stage_templates enable row level security;

drop policy if exists "stage_templates_select_authenticated" on public.stage_templates;
create policy "stage_templates_select_authenticated"
  on public.stage_templates
  for select
  to authenticated
  using (auth.uid() is not null);

create table if not exists public.user_stages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid null,
  template_id uuid null references public.stage_templates (id) on delete set null,
  workflow_code text not null,
  stage_group_code text not null,
  stage_code text null,
  source text not null default 'template',
  status text not null default 'pending',
  custom_name text null,
  custom_name_key text null,
  order_index integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint user_stages_workflow_code_check
    check (workflow_code in ('masonry', 'timber_frame')),
  constraint user_stages_source_check
    check (source in ('template', 'custom')),
  constraint user_stages_status_check
    check (status in ('pending', 'done', 'skipped', 'hidden', 'not_applicable')),
  constraint user_stages_custom_stage_check
    check (source <> 'custom' or btrim(coalesce(custom_name, '')) <> '')
);

create index if not exists user_stages_user_id_idx
  on public.user_stages (user_id);

create index if not exists user_stages_user_project_id_idx
  on public.user_stages (user_id, project_id);

create index if not exists user_stages_user_status_idx
  on public.user_stages (user_id, status);

create index if not exists user_stages_user_workflow_stage_code_idx
  on public.user_stages (user_id, workflow_code, stage_code);

create index if not exists user_stages_template_id_idx
  on public.user_stages (template_id);

alter table public.user_stages enable row level security;

drop policy if exists "user_stages_select_own" on public.user_stages;
create policy "user_stages_select_own"
  on public.user_stages
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_stages_insert_own" on public.user_stages;
create policy "user_stages_insert_own"
  on public.user_stages
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_stages_update_own" on public.user_stages;
create policy "user_stages_update_own"
  on public.user_stages
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_stages_delete_own" on public.user_stages;
create policy "user_stages_delete_own"
  on public.user_stages
  for delete
  to authenticated
  using (auth.uid() = user_id);

alter table public.wydatki
  add column if not exists expense_category_code text,
  add column if not exists stage_group_code text,
  add column if not exists stage_code text,
  add column if not exists expense_type text;

alter table public.wydatki
  drop constraint if exists wydatki_expense_type_check;

alter table public.wydatki
  add constraint wydatki_expense_type_check
  check (expense_type is null or expense_type in ('material', 'service', 'mixed', 'other'));

create index if not exists wydatki_user_expense_category_code_idx
  on public.wydatki (user_id, expense_category_code);

create index if not exists wydatki_user_stage_group_code_idx
  on public.wydatki (user_id, stage_group_code);

create index if not exists wydatki_user_stage_code_idx
  on public.wydatki (user_id, stage_code);

create index if not exists wydatki_user_expense_type_idx
  on public.wydatki (user_id, expense_type);

insert into public.stage_templates (
  workflow_code,
  stage_group_code,
  stage_code,
  name_key,
  order_index,
  is_active
)
values
  ('masonry', 'foundations', 'A01_01', 'stageTemplates.masonry.A01_01', 10, true),
  ('masonry', 'foundations', 'A02_01', 'stageTemplates.masonry.A02_01', 20, true),
  ('masonry', 'open_shell', 'A03_01', 'stageTemplates.masonry.A03_01', 30, true),
  ('masonry', 'open_shell', 'A03_02', 'stageTemplates.masonry.A03_02', 40, true),
  ('masonry', 'closed_shell', 'A04_01', 'stageTemplates.masonry.A04_01', 50, true),
  ('masonry', 'roof', 'A05_01', 'stageTemplates.masonry.A05_01', 60, true),
  ('masonry', 'roof', 'A06_01', 'stageTemplates.masonry.A06_01', 70, true),
  ('masonry', 'installations', 'A07_01', 'stageTemplates.masonry.A07_01', 80, true),
  ('masonry', 'installations', 'A08_01', 'stageTemplates.masonry.A08_01', 90, true),
  ('masonry', 'developer_state', 'A09_01', 'stageTemplates.masonry.A09_01', 100, true),
  ('masonry', 'developer_state', 'A10_01', 'stageTemplates.masonry.A10_01', 110, true),
  ('masonry', 'developer_state', 'A11_01', 'stageTemplates.masonry.A11_01', 120, true),
  ('masonry', 'developer_state', 'A12_01', 'stageTemplates.masonry.A12_01', 130, true),
  ('masonry', 'developer_state', 'A13_01', 'stageTemplates.masonry.A13_01', 140, true),
  ('timber_frame', 'foundations', 'B01_01', 'stageTemplates.timberFrame.B01_01', 10, true),
  ('timber_frame', 'foundations', 'B02_01', 'stageTemplates.timberFrame.B02_01', 20, true),
  ('timber_frame', 'open_shell', 'B03_01', 'stageTemplates.timberFrame.B03_01', 30, true),
  ('timber_frame', 'open_shell', 'B03_02', 'stageTemplates.timberFrame.B03_02', 40, true),
  ('timber_frame', 'closed_shell', 'B04_01', 'stageTemplates.timberFrame.B04_01', 50, true),
  ('timber_frame', 'roof', 'B05_01', 'stageTemplates.timberFrame.B05_01', 60, true),
  ('timber_frame', 'roof', 'B06_01', 'stageTemplates.timberFrame.B06_01', 70, true),
  ('timber_frame', 'installations', 'B07_01', 'stageTemplates.timberFrame.B07_01', 80, true),
  ('timber_frame', 'installations', 'B08_01', 'stageTemplates.timberFrame.B08_01', 90, true),
  ('timber_frame', 'developer_state', 'B09_01', 'stageTemplates.timberFrame.B09_01', 100, true),
  ('timber_frame', 'developer_state', 'B10_01', 'stageTemplates.timberFrame.B10_01', 110, true),
  ('timber_frame', 'developer_state', 'B11_01', 'stageTemplates.timberFrame.B11_01', 120, true),
  ('timber_frame', 'developer_state', 'B12_01', 'stageTemplates.timberFrame.B12_01', 130, true),
  ('timber_frame', 'developer_state', 'B13_01', 'stageTemplates.timberFrame.B13_01', 140, true)
on conflict (workflow_code, stage_code) do nothing;
