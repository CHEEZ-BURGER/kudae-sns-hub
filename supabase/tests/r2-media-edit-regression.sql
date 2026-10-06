-- Metadata-only authoring regression. Fake file references never leave this rolled-back transaction.
begin;
do $claims$
declare v_admin uuid;
begin
  select id into v_admin from public.profiles where is_admin order by created_at limit 1;
  if v_admin is null then raise exception 'An existing administrator is required'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
end;
$claims$;
set local role authenticated;
do $test$
declare
  v_publication uuid := gen_random_uuid();
  v_post uuid := gen_random_uuid();
  v_first uuid := gen_random_uuid();
  v_second uuid := gen_random_uuid();
  v_root text;
  v_first_file jsonb;
  v_second_file jsonb;
  v_post_json jsonb;
  v_revision timestamptz;
  v_result jsonb;
begin
  v_root := 'r2:'||auth.uid()||'/'||v_publication||'/'||v_post||'/';
  v_first_file := jsonb_build_object('id',v_first,'filename','original.png','mime_type','image/png','size_bytes',1,
    'original_path',v_root||v_first||'/original.png','thumbnail_path',v_root||v_first||'/thumb.webp','position',0,'retained',false);
  v_second_file := jsonb_build_object('id',v_second,'filename','replacement.mp4','mime_type','video/mp4','size_bytes',2,
    'original_path',v_root||v_second||'/original.mp4','thumbnail_path',v_root||v_second||'/thumb.webp','position',1,'retained',false);
  v_post_json := jsonb_build_object('id',v_post,'category','보도','title','R2 회귀 테스트','body','트랜잭션 안에서만 사용하는 원고입니다.','position',0,
    'assets',jsonb_build_array(v_first_file));
  perform public.save_distribution(v_publication,'R2검증','R2 트랜잭션 테스트',jsonb_build_array(v_post_json),
    replace(gen_random_uuid()::text,'-',''),null,null);
  if not exists(select 1 from public.assets where id=v_first and original_path=v_first_file->>'original_path') then raise exception 'R2 insert failed'; end if;
  select updated_at into v_revision from public.publications where id=v_publication;
  v_first_file := v_first_file||jsonb_build_object('retained',true);
  v_post_json := v_post_json||jsonb_build_object('assets',jsonb_build_array(v_first_file,v_second_file));
  perform public.save_distribution(v_publication,'R2검증','R2 트랜잭션 테스트',jsonb_build_array(v_post_json),null,v_revision,null);
  if (select count(*) from public.assets where post_id=v_post)<>2 then raise exception 'Single-file addition failed'; end if;
  select updated_at into v_revision from public.publications where id=v_publication;
  v_second_file := v_second_file||jsonb_build_object('retained',true,'position',0);
  v_post_json := v_post_json||jsonb_build_object('assets',jsonb_build_array(v_second_file));
  v_result := public.save_distribution(v_publication,'R2검증','R2 트랜잭션 테스트',jsonb_build_array(v_post_json),null,v_revision,null);
  if exists(select 1 from public.assets where id=v_first) or not exists(select 1 from public.assets where id=v_second and position=0) then
    raise exception 'Single-file replacement/removal failed';
  end if;
  if not (v_result->'obsolete_paths') ? (v_first_file->>'original_path') then raise exception 'Obsolete original not reported'; end if;
end;
$test$;
reset role;
select 'R2 create, retain, add video, replace/remove one file, and obsolete-path reporting passed; rollback follows' as result;
rollback;
