-- Read-only failure-path regression: each attempted switch must fail before any writes.
begin;
do $test$
declare
  v_before jsonb;
  v_after jsonb;
  v_manifest jsonb;
  v_rejected boolean;
begin
  select jsonb_agg(to_jsonb(a) order by a.id) into v_before from public.assets a;
  select jsonb_agg(jsonb_build_object('id',p.id,'updated_at',p.updated_at,'assets',
    (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,
      'old_original_path',a.original_path,'old_thumbnail_path',a.thumbnail_path,'old_optimized_path',a.optimized_path,
      'original_path',a.original_path,'thumbnail_path',a.thumbnail_path,'optimized_path',a.optimized_path) order by a.id),'[]'::jsonb)
      from public.assets a join public.posts s on s.id=a.post_id where s.publication_id=p.id)) order by p.id)
    into v_manifest from (select * from public.publications where status='published' and issue_number<>'R2검증' order by created_at desc limit 3) p;
  if jsonb_array_length(v_manifest)<>3 then raise exception 'Regression scope is not exactly three publications'; end if;
  v_rejected := false;
  begin
    perform public.switch_distribution_media('[]'::jsonb);
  exception when others then
    if sqlerrm<>'EXACTLY_THREE_PUBLICATIONS_REQUIRED' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'Invalid scope accepted'; end if;
  v_rejected := false;
  begin
    perform public.switch_distribution_media(jsonb_set(v_manifest,'{0,updated_at}','"2000-01-01T00:00:00Z"'::jsonb));
  exception when others then
    if sqlerrm<>'EDIT_CONFLICT' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'Stale revision accepted'; end if;
  v_rejected := false;
  begin
    perform public.switch_distribution_media(v_manifest);
  exception when others then
    if sqlerrm<>'INVALID_R2_PATH' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'Unverified paths accepted'; end if;
  select jsonb_agg(to_jsonb(a) order by a.id) into v_after from public.assets a;
  if v_before is distinct from v_after then raise exception 'Failure path changed source metadata'; end if;
  if has_function_privilege('anon','public.switch_distribution_media(jsonb)','execute') or
     has_function_privilege('authenticated','public.switch_distribution_media(jsonb)','execute') then
    raise exception 'Migration RPC is exposed to clients';
  end if;
end;
$test$;
select 'Scope, stale revision, invalid paths, unchanged metadata, and RPC permissions passed' as result;
rollback;
