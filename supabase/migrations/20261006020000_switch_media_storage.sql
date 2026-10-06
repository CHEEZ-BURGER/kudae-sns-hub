-- Only a trusted migration runner can switch verified files. No source files are deleted.
create or replace function public.switch_distribution_media(p_manifest jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_item jsonb;
  v_file jsonb;
  v_publication public.publications%rowtype;
  v_asset public.assets%rowtype;
  v_ids uuid[] := '{}';
  v_file_ids uuid[];
  v_id uuid;
  v_expected_count integer;
  v_paths text[];
begin
  if p_manifest is null or jsonb_typeof(p_manifest)<>'array' or jsonb_array_length(p_manifest)<>3 then
    raise exception 'EXACTLY_THREE_PUBLICATIONS_REQUIRED';
  end if;
  -- Stable lock order. Only these three publications are in scope.
  for v_item in select value from jsonb_array_elements(p_manifest) order by value->>'id' loop
    v_id := (v_item->>'id')::uuid;
    if v_id=any(v_ids) then raise exception 'DUPLICATE_PUBLICATION'; end if;
    v_ids := array_append(v_ids,v_id);
    select * into v_publication from public.publications where id=v_id for update;
    if not found or v_publication.status<>'published' or
      v_publication.updated_at is distinct from (v_item->>'updated_at')::timestamptz then
      raise exception 'EDIT_CONFLICT';
    end if;
    if jsonb_typeof(v_item->'assets') is distinct from 'array' then raise exception 'INVALID_ASSET_LIST'; end if;
    v_file_ids := '{}';
    select count(*) into v_expected_count from public.assets a join public.posts p on p.id=a.post_id where p.publication_id=v_id;
    if v_expected_count<>jsonb_array_length(v_item->'assets') then raise exception 'EDIT_CONFLICT'; end if;
    for v_file in select value from jsonb_array_elements(v_item->'assets') loop
      if (v_file->>'id')::uuid=any(v_file_ids) then raise exception 'DUPLICATE_ASSET'; end if;
      v_file_ids := array_append(v_file_ids,(v_file->>'id')::uuid);
      select a.* into v_asset from public.assets a join public.posts p on p.id=a.post_id
        where a.id=(v_file->>'id')::uuid and p.publication_id=v_id for update of a;
      if not found or v_asset.original_path is distinct from v_file->>'old_original_path' or
        v_asset.thumbnail_path is distinct from v_file->>'old_thumbnail_path' or
        v_asset.optimized_path is distinct from v_file->>'old_optimized_path' then raise exception 'EDIT_CONFLICT'; end if;
      v_paths := array[v_file->>'original_path',v_file->>'thumbnail_path',v_file->>'optimized_path'];
      if v_paths[1] is null or v_paths[2] is null or exists(
        select 1 from unnest(v_paths) path where path is not null and
          (path !~ '^r2:[a-zA-Z0-9/._-]+$' or position('..' in path)>0 or
           split_part(substr(path,4),'/',2)<>v_id::text or split_part(substr(path,4),'/',3)<>v_asset.post_id::text or
           split_part(substr(path,4),'/',4)<>v_asset.id::text or array_length(string_to_array(substr(path,4),'/'),1)<>5)
      ) then raise exception 'INVALID_R2_PATH'; end if;
    end loop;
  end loop;
  -- Validate all three snapshots before updating anything.
  for v_item in select value from jsonb_array_elements(p_manifest) loop
    for v_file in select value from jsonb_array_elements(v_item->'assets') loop
      update public.assets set original_path=v_file->>'original_path',thumbnail_path=v_file->>'thumbnail_path',
        optimized_path=v_file->>'optimized_path' where id=(v_file->>'id')::uuid;
    end loop;
    update public.publications set updated_at=now() where id=(v_item->>'id')::uuid;
  end loop;
  return jsonb_build_object('migrated_publications',3);
end;
$function$;
revoke all on function public.switch_distribution_media(jsonb) from public,anon,authenticated;
grant execute on function public.switch_distribution_media(jsonb) to service_role;
notify pgrst,'reload schema';
