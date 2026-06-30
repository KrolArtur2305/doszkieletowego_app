create or replace function public.check_ai_rate_limit(p_max_requests integer)
returns table(request_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_window timestamptz := date_trunc('minute', now());
  current_count integer;
  current_limit integer := greatest(coalesce(p_max_requests, 1), 1);
  existing_rate_limit_id uuid;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtext(current_user_id::text));

  delete from public.ai_rate_limits
  where window_start < current_window - interval '5 minutes';

  select rl.id, rl.request_count
  into existing_rate_limit_id, current_count
  from public.ai_rate_limits rl
  where rl.user_id = current_user_id
    and rl.window_start = current_window
  order by rl.created_at desc
  limit 1
  for update;

  if existing_rate_limit_id is null then
    insert into public.ai_rate_limits (
      user_id,
      window_start,
      request_count,
      updated_at
    )
    values (
      current_user_id,
      current_window,
      1,
      now()
    )
    returning public.ai_rate_limits.request_count into current_count;
  elsif current_count <= current_limit then
    update public.ai_rate_limits
    set request_count = public.ai_rate_limits.request_count + 1,
        updated_at = now()
    where id = existing_rate_limit_id
    returning public.ai_rate_limits.request_count into current_count;
  end if;

  return query select current_count;
end;
$$;

grant execute on function public.check_ai_rate_limit(integer) to authenticated;
