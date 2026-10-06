-- Atomic publication edits; unchanged media is retained rather than downloaded/uploaded.
create or replace function public.save_distribution(
  p_publication_id uuid, p_issue_number text, p_title text, p_posts jsonb,
  p_share_token text default null, p_expected_updated_at timestamptz default null,
  p_expires_at timestamptz default null
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $function$
declare
  v_publication public.publications%rowtype;
  v_post jsonb;
  v_asset jsonb;
  v_post_id uuid;
  v_asset_id uuid;
  v_existing public.assets%rowtype;
  v_old_paths text[];
  v_new_paths text[];
  v_post_ids uuid[] := '{}';
  v_asset_ids uuid[] := '{}';
  v_root text;
  v_original text;
  v_thumb text;
  v_optimized text;
  v_original_key text;
  v_thumb_key text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;
  if p_posts is null or jsonb_typeof(p_posts) <> 'array' or jsonb_array_length(p_posts) < 1 or jsonb_array_length(p_posts) > 100 then
    raise exception '배포할 게시물을 확인해 주세요.';
  end if;
  if nullif(trim(p_title), '') is null or nullif(trim(p_issue_number), '') is null then
    raise exception '호수와 배포 제목이 필요합니다.';
  end if;
  select * into v_publication from public.publications where id = p_publication_id for update;
  if found then
    if p_expected_updated_at is null or v_publication.updated_at is distinct from p_expected_updated_at then
      raise exception 'EDIT_CONFLICT';
    end if;
  else
    if p_expected_updated_at is not null then raise exception 'EDIT_CONFLICT'; end if;
    if p_share_token is null or p_share_token !~ '^[A-Za-z0-9_-]{24,80}$' then
      raise exception '배포 토큰을 확인해 주세요.';
    end if;
    insert into public.publications(id,issue_number,title,share_token,share_token_hash,created_by,status)
      values(p_publication_id,p_issue_number,p_title,p_share_token,encode(sha256(convert_to(p_share_token,'UTF8')),'hex'),auth.uid(),'draft')
      returning * into v_publication;
  end if;
  select coalesce(array_agg(distinct path), '{}') into v_old_paths
    from public.assets a join public.posts p on p.id = a.post_id,
      lateral unnest(array[a.original_path,a.thumbnail_path,a.optimized_path]) path
    where p.publication_id = p_publication_id and path is not null;

  -- Validate the complete edit before touching any published records.
  for v_post in select value from jsonb_array_elements(p_posts) loop
    v_post_id := (v_post->>'id')::uuid;
    if v_post_id = any(v_post_ids) then raise exception '게시물 번호가 중복되었습니다.'; end if;
    v_post_ids := array_append(v_post_ids,v_post_id);
    if exists(select 1 from public.posts where id=v_post_id and publication_id<>p_publication_id) then
      raise exception '다른 배포의 게시물을 수정할 수 없습니다.';
    end if;
    if nullif(trim(v_post->>'title'),'') is null or nullif(trim(v_post->>'body'),'') is null then
      raise exception '게시물의 제목과 본문이 필요합니다.';
    end if;
    if jsonb_typeof(v_post->'assets') <> 'array' then raise exception '파일 목록을 확인해 주세요.'; end if;
    for v_asset in select value from jsonb_array_elements(v_post->'assets') loop
      v_asset_id := (v_asset->>'id')::uuid;
      if v_asset_id = any(v_asset_ids) then raise exception '파일 번호가 중복되었습니다.'; end if;
      v_asset_ids := array_append(v_asset_ids,v_asset_id);
      v_original := v_asset->>'original_path';
      v_thumb := v_asset->>'thumbnail_path';
      v_optimized := v_asset->>'optimized_path';
      select * into v_existing from public.assets where id=v_asset_id;
      if coalesce((v_asset->>'retained')::boolean,false) then
        if not found or not exists(select 1 from public.posts where id=v_existing.post_id and publication_id=p_publication_id)
          or v_existing.original_path is distinct from v_original
          or v_existing.thumbnail_path is distinct from v_thumb
          or v_existing.optimized_path is distinct from v_optimized then
          raise exception '기존 원본을 확인하지 못했습니다. 배포를 다시 열어 주세요.';
        end if;
      else
        if found then raise exception '새 파일 번호가 중복되었습니다.'; end if;
        v_root := auth.uid()::text || '/' || p_publication_id::text || '/' || v_post_id::text || '/' || v_asset_id::text || '/';
        v_original_key := case when left(v_original,3)='s3:' then substr(v_original,4) else v_original end;
        v_thumb_key := case when left(v_thumb,3)='s3:' then substr(v_thumb,4) else v_thumb end;
        if v_original is null or v_thumb is null
          or left(v_original_key,length(v_root)) <> v_root or left(v_thumb_key,length(v_root)) <> v_root
          or position('..' in v_original_key)>0 or position('..' in v_thumb_key)>0 or v_optimized is not null then
          raise exception '새 파일 경로를 확인해 주세요.';
        end if;
        if left(v_original,3)<>'s3:' and not exists(select 1 from storage.objects where bucket_id='sns-assets' and name=v_original) then
          raise exception '원본 업로드가 완료되지 않았습니다.';
        end if;
        if left(v_thumb,3)<>'s3:' and not exists(select 1 from storage.objects where bucket_id='sns-assets' and name=v_thumb) then
          raise exception '미리보기 업로드가 완료되지 않았습니다.';
        end if;
      end if;
    end loop;
  end loop;

  for v_post in select value from jsonb_array_elements(p_posts) loop
    v_post_id := (v_post->>'id')::uuid;
    insert into public.posts(id,publication_id,category,title,body,article_url,credits,group_name,match_confidence,position)
      values(v_post_id,p_publication_id,coalesce(nullif(v_post->>'category',''),'보도'),v_post->>'title',v_post->>'body',v_post->>'article_url',v_post->>'credits',coalesce(v_post->>'group_name',''),(v_post->>'match_confidence')::numeric,(v_post->>'position')::integer)
      on conflict(id) do update set category=excluded.category,title=excluded.title,body=excluded.body,
        article_url=excluded.article_url,credits=excluded.credits,group_name=excluded.group_name,
        match_confidence=excluded.match_confidence,position=excluded.position;
    for v_asset in select value from jsonb_array_elements(v_post->'assets') loop
      v_asset_id := (v_asset->>'id')::uuid;
      if coalesce((v_asset->>'retained')::boolean,false) then
        update public.assets set post_id=v_post_id,position=(v_asset->>'position')::integer where id=v_asset_id;
      else
        insert into public.assets(id,post_id,filename,mime_type,size_bytes,original_path,thumbnail_path,optimized_path,position)
          values(v_asset_id,v_post_id,v_asset->>'filename',v_asset->>'mime_type',(v_asset->>'size_bytes')::bigint,v_asset->>'original_path',v_asset->>'thumbnail_path',null,(v_asset->>'position')::integer);
      end if;
    end loop;
  end loop;
  delete from public.assets where post_id in(select id from public.posts where publication_id=p_publication_id) and not(id=any(v_asset_ids));
  delete from public.posts where publication_id=p_publication_id and not(id=any(v_post_ids));
  update public.publications set issue_number=p_issue_number,title=p_title,status='published',expires_at=p_expires_at,published_at=now()
    where id=p_publication_id;
  select coalesce(array_agg(distinct path),'{}') into v_new_paths
    from public.assets a join public.posts p on p.id=a.post_id,
      lateral unnest(array[a.original_path,a.thumbnail_path,a.optimized_path]) path
    where p.publication_id=p_publication_id and path is not null;
  return jsonb_build_object('share_token',v_publication.share_token,'obsolete_paths',
    coalesce((select jsonb_agg(path) from unnest(v_old_paths) path where not(path=any(v_new_paths))), '[]'::jsonb));
end;
$function$;
revoke all on function public.save_distribution(uuid,text,text,jsonb,text,timestamptz,timestamptz) from public, anon;
grant execute on function public.save_distribution(uuid,text,text,jsonb,text,timestamptz,timestamptz) to authenticated;
notify pgrst, 'reload schema';
