create or replace function public.save_user_stage_statuses(
  p_items jsonb,
  p_next_stage_code text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  item jsonb;
  item_id uuid;
  item_template_id uuid;
  item_workflow_code text;
  item_stage_group_code text;
  item_stage_code text;
  item_source text;
  item_status text;
  item_order_index integer;
  existing_id uuid;
  saved_row user_stages%rowtype;
  saved_rows jsonb := '[]'::jsonb;
  next_stage_code text := nullif(btrim(coalesce(p_next_stage_code, '')), '');
begin
  if current_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_id := nullif(btrim(coalesce(item->>'id', '')), '')::uuid;
    item_template_id := nullif(btrim(coalesce(item->>'template_id', '')), '')::uuid;
    item_workflow_code := nullif(btrim(coalesce(item->>'workflow_code', '')), '');
    item_stage_group_code := nullif(btrim(coalesce(item->>'stage_group_code', '')), '');
    item_stage_code := nullif(btrim(coalesce(item->>'stage_code', '')), '');
    item_source := coalesce(nullif(btrim(coalesce(item->>'source', '')), ''), 'template');
    item_status := nullif(btrim(coalesce(item->>'status', '')), '');
    item_order_index := coalesce(nullif(btrim(coalesce(item->>'order_index', '')), '')::integer, 0);

    if item_status is null then
      raise exception 'Missing stage status' using errcode = '22023';
    end if;

    existing_id := null;

    if item_id is not null then
      select id
        into existing_id
      from public.user_stages
      where id = item_id
        and user_id = current_user_id
      limit 1;
    end if;

    if existing_id is null and item_template_id is not null then
      select id
        into existing_id
      from public.user_stages
      where user_id = current_user_id
        and workflow_code = item_workflow_code
        and template_id = item_template_id
      order by updated_at desc
      limit 1;
    end if;

    if existing_id is null and item_source = 'template' and item_stage_code is not null then
      select id
        into existing_id
      from public.user_stages
      where user_id = current_user_id
        and workflow_code = item_workflow_code
        and source = 'template'
        and stage_code = item_stage_code
      order by updated_at desc
      limit 1;
    end if;

    if existing_id is not null then
      update public.user_stages
      set
        status = item_status,
        template_id = coalesce(item_template_id, template_id),
        workflow_code = coalesce(item_workflow_code, workflow_code),
        stage_group_code = coalesce(item_stage_group_code, stage_group_code),
        stage_code = coalesce(item_stage_code, stage_code),
        updated_at = now()
      where id = existing_id
        and user_id = current_user_id
      returning * into saved_row;
    else
      if item_workflow_code is null or item_stage_group_code is null then
        raise exception 'Missing workflow or stage group for new user stage' using errcode = '22023';
      end if;

      insert into public.user_stages (
        user_id,
        template_id,
        workflow_code,
        stage_group_code,
        stage_code,
        source,
        status,
        order_index
      )
      values (
        current_user_id,
        item_template_id,
        item_workflow_code,
        item_stage_group_code,
        item_stage_code,
        item_source,
        item_status,
        item_order_index
      )
      returning * into saved_row;
    end if;

    saved_rows := saved_rows || to_jsonb(saved_row);
  end loop;

  if next_stage_code is not null then
    update public.profiles
    set current_stage_code = upper(next_stage_code)
    where user_id = current_user_id;
  end if;

  return jsonb_build_object(
    'saved_rows',
    saved_rows,
    'advanced',
    next_stage_code is not null,
    'next_stage_code',
    upper(next_stage_code)
  );
end;
$$;
