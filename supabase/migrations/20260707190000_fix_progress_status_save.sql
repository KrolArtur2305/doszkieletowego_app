create or replace function public.resolve_single_push_lifecycle_investment(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_investment_id uuid;
  investment_count integer;
begin
  if p_user_id is null then
    return null;
  end if;

  select count(*)
    into investment_count
  from public.inwestycje i
  where i.user_id = p_user_id;

  if investment_count = 1 then
    select i.id
      into target_investment_id
    from public.inwestycje i
    where i.user_id = p_user_id
    limit 1;

    return target_investment_id;
  end if;

  return null;
end;
$$;

update public.user_stages us
set investment_id = i.id
from public.inwestycje i
where us.investment_id is null
  and us.user_id = i.user_id;

update public.profiles p
set investment_id = i.id
from public.inwestycje i
where p.investment_id is null
  and p.user_id = i.user_id;

drop function if exists public.save_user_stage_statuses(jsonb, text);

create or replace function public.save_user_stage_statuses(
  p_items jsonb,
  p_next_stage_code text default null,
  p_investment_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_user_id uuid;
  target_investment_id uuid := p_investment_id;
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

  if target_investment_id is null then
    target_investment_id := public.resolve_single_push_lifecycle_investment(current_user_id);
  end if;

  if target_investment_id is not null then
    if not public.is_investment_member(target_investment_id) then
      raise exception 'not_investment_member' using errcode = '42501';
    end if;

    select i.user_id
      into target_user_id
    from public.inwestycje i
    where i.id = target_investment_id
    limit 1;
  end if;

  target_user_id := coalesce(target_user_id, current_user_id);

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
        and user_id = target_user_id
        and (target_investment_id is null or investment_id = target_investment_id or investment_id is null)
      limit 1;
    end if;

    if existing_id is null and item_template_id is not null then
      select id
        into existing_id
      from public.user_stages
      where user_id = target_user_id
        and workflow_code = item_workflow_code
        and template_id = item_template_id
        and (target_investment_id is null or investment_id = target_investment_id or investment_id is null)
      order by updated_at desc
      limit 1;
    end if;

    if existing_id is null and item_source = 'template' and item_stage_code is not null then
      select id
        into existing_id
      from public.user_stages
      where user_id = target_user_id
        and workflow_code = item_workflow_code
        and source = 'template'
        and stage_code = item_stage_code
        and (target_investment_id is null or investment_id = target_investment_id or investment_id is null)
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
        investment_id = coalesce(target_investment_id, investment_id),
        updated_at = now()
      where id = existing_id
        and user_id = target_user_id
      returning * into saved_row;
    else
      if item_workflow_code is null or item_stage_group_code is null then
        raise exception 'Missing workflow or stage group for new user stage' using errcode = '22023';
      end if;

      insert into public.user_stages (
        user_id,
        investment_id,
        template_id,
        workflow_code,
        stage_group_code,
        stage_code,
        source,
        status,
        order_index
      )
      values (
        target_user_id,
        target_investment_id,
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
    set current_stage_code = upper(next_stage_code),
        investment_id = coalesce(target_investment_id, investment_id)
    where user_id = target_user_id;
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

grant execute on function public.resolve_single_push_lifecycle_investment(uuid) to authenticated;
grant execute on function public.save_user_stage_statuses(jsonb, text, uuid) to authenticated;
