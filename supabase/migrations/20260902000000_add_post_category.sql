alter table public.posts
add column if not exists category text not null default '';

update public.posts
set category = case
  when title ~ '^\s*\[[^]]+\]' then substring(title from '^\s*\[([^]]+)\]')
  when group_name ilike '%사설%' then '사설'
  when group_name ilike '%포토뉴스%' then '포토뉴스'
  when group_name ilike '%석탑%' then '주간 뉴스레터 석탑'
  else '보도'
end
where category = '';
