update public.stage_templates
set stage_group_code = case
  when upper(coalesce(stage_code, '')) ~ '^[AB]0[12]_' then 'stan_zero'
  when upper(coalesce(stage_code, '')) ~ '^[AB]03_' then 'sso'
  when upper(coalesce(stage_code, '')) ~ '^[AB]04_' then 'ssz'
  when upper(coalesce(stage_code, '')) ~ '^[AB]0[56]_' then 'instalacje'
  else 'wykonczenie'
end
where workflow_code in ('masonry', 'timber_frame');

update public.user_stages us
set stage_group_code = case
  when lower(coalesce(us.stage_group_code, '')) in ('stan_zero', 'stan zero', 'zero', 'foundations', 'fundamenty') then 'stan_zero'
  when lower(coalesce(us.stage_group_code, '')) in ('sso', 'open_shell', 'stan surowy otwarty', 'surowy otwarty', 'otwarty') then 'sso'
  when lower(coalesce(us.stage_group_code, '')) in ('ssz', 'closed_shell', 'stan surowy zamkniety', 'stan surowy zamknięty', 'surowy zamkniety', 'zamkniety') then 'ssz'
  when lower(coalesce(us.stage_group_code, '')) in ('installations', 'instalacje', 'instalacja', 'roof', 'dach') then 'instalacje'
  when lower(coalesce(us.stage_group_code, '')) in ('wykonczenie', 'wykończenie', 'developer_state', 'stan deweloperski', 'deweloperski', 'finish', 'finishing') then 'wykonczenie'
  when upper(coalesce(us.stage_code, '')) ~ '^[AB]0[12]_' then 'stan_zero'
  when upper(coalesce(us.stage_code, '')) ~ '^[AB]03_' then 'sso'
  when upper(coalesce(us.stage_code, '')) ~ '^[AB]04_' then 'ssz'
  when upper(coalesce(us.stage_code, '')) ~ '^[AB]0[56]_' then 'instalacje'
  when upper(coalesce(us.stage_code, '')) ~ '^[AB](0[7-9]|1[0-3])_' then 'wykonczenie'
  else coalesce(us.stage_group_code, 'stan_zero')
end;

update public.wydatki w
set stage_group_code = case
  when lower(coalesce(w.stage_group_code, '')) in ('stan_zero', 'stan zero', 'zero', 'foundations', 'fundamenty') then 'stan_zero'
  when lower(coalesce(w.stage_group_code, '')) in ('sso', 'open_shell', 'stan surowy otwarty', 'surowy otwarty', 'otwarty') then 'sso'
  when lower(coalesce(w.stage_group_code, '')) in ('ssz', 'closed_shell', 'stan surowy zamkniety', 'stan surowy zamknięty', 'surowy zamkniety', 'zamkniety') then 'ssz'
  when lower(coalesce(w.stage_group_code, '')) in ('installations', 'instalacje', 'instalacja', 'roof', 'dach') then 'instalacje'
  when lower(coalesce(w.stage_group_code, '')) in ('wykonczenie', 'wykończenie', 'developer_state', 'stan deweloperski', 'deweloperski', 'finish', 'finishing') then 'wykonczenie'
  when upper(coalesce(w.stage_code, '')) ~ '^[AB]0[12]_' then 'stan_zero'
  when upper(coalesce(w.stage_code, '')) ~ '^[AB]03_' then 'sso'
  when upper(coalesce(w.stage_code, '')) ~ '^[AB]04_' then 'ssz'
  when upper(coalesce(w.stage_code, '')) ~ '^[AB]0[56]_' then 'instalacje'
  when upper(coalesce(w.stage_code, '')) ~ '^[AB](0[7-9]|1[0-3])_' then 'wykonczenie'
  else coalesce(w.stage_group_code, 'stan_zero')
end;
