import type { DraftPost } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resizeImage } from './image-tools';
import { requireSupabase } from './supabase';
import { originalStoragePath } from './storage-path';
import { isVideoFile } from './workflow';

export type PublishInput = {
  issueNumber: string;
  title: string;
  posts: DraftPost[];
  expiresAt?: string;
  existingPublicationId?: string;
};

type PublicationRow = { id: string; created_at: string };
type StoredPostRow = { id: string; category: string; title: string; body: string; article_url: string | null; credits: string | null; group_name: string; match_confidence: number | null; position: number };
type StoredAssetRow = { id: string; post_id: string; filename: string; mime_type: string; original_path: string; thumbnail_path: string; optimized_path: string | null; position: number };

export type EditablePublication = {
  id: string;
  issueNumber: string;
  title: string;
  shareToken: string;
  posts: DraftPost[];
};

export function publicationIdsToPrune(publications: PublicationRow[], keep = 3) {
  return [...publications]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(Math.max(0, keep))
    .map((publication) => publication.id);
}

async function deletePublicationWithClient(client: SupabaseClient, publicationId: string) {
  const { data: posts, error: postsError } = await client.from('posts').select('id').eq('publication_id', publicationId);
  if (postsError) throw postsError;
  const postIds = (posts ?? []).map((post) => post.id);
  const { data: assets, error: assetsError } = postIds.length
    ? await client.from('assets').select('original_path, thumbnail_path, optimized_path').in('post_id', postIds)
    : { data: [], error: null };
  if (assetsError) throw assetsError;

  const paths = [...new Set((assets ?? []).flatMap((asset) => [asset.original_path, asset.thumbnail_path, asset.optimized_path].filter(Boolean) as string[]))];
  if (paths.length) {
    const { error: storageError } = await client.storage.from('sns-assets').remove(paths);
    if (storageError) throw storageError;
  }
  const { error: deleteError } = await client.from('publications').delete().eq('id', publicationId);
  if (deleteError) throw deleteError;
}

async function pruneOldPublications(client: SupabaseClient, keep = 3) {
  const { data, error } = await client.from('publications').select('id, created_at').order('created_at', { ascending: false });
  if (error) throw error;
  for (const publicationId of publicationIdsToPrune((data ?? []) as PublicationRow[], keep)) {
    await deletePublicationWithClient(client, publicationId);
  }
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function makeShareToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function storedPublicationAssets(client: SupabaseClient, publicationId: string) {
  const { data: posts, error: postsError } = await client.from('posts').select('id').eq('publication_id', publicationId);
  if (postsError) throw postsError;
  const postIds = (posts ?? []).map((post) => post.id);
  const { data: assets, error: assetsError } = postIds.length
    ? await client.from('assets').select('original_path, thumbnail_path, optimized_path').in('post_id', postIds)
    : { data: [], error: null };
  if (assetsError) throw assetsError;
  return {
    postIds,
    paths: [...new Set((assets ?? []).flatMap((asset) => [asset.original_path, asset.thumbnail_path, asset.optimized_path].filter(Boolean) as string[]))],
  };
}

export async function loadAdminPublication(publicationId: string): Promise<EditablePublication> {
  const client = requireSupabase();
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) throw new Error('관리자 로그인이 필요합니다.');

  const { data: publication, error: publicationError } = await client.from('publications')
    .select('id, issue_number, title, share_token').eq('id', publicationId).single();
  if (publicationError) throw publicationError;
  const { data: postData, error: postsError } = await client.from('posts')
    .select('id, category, title, body, article_url, credits, group_name, match_confidence, position')
    .eq('publication_id', publicationId).order('position');
  if (postsError) throw postsError;
  const storedPosts = (postData ?? []) as StoredPostRow[];
  const postIds = storedPosts.map((post) => post.id);
  const { data: assetData, error: assetsError } = postIds.length
    ? await client.from('assets').select('id, post_id, filename, mime_type, original_path, thumbnail_path, optimized_path, position').in('post_id', postIds).order('position')
    : { data: [], error: null };
  if (assetsError) throw assetsError;
  const storedAssets = (assetData ?? []) as StoredAssetRow[];
  const signedByPath = new Map<string, string>();
  if (storedAssets.length) {
    const paths = storedAssets.map((asset) => asset.original_path);
    const { data: signed, error: signedError } = await client.storage.from('sns-assets').createSignedUrls(paths, 3600);
    if (signedError) throw signedError;
    signed?.forEach((item, index) => { if (item.signedUrl) signedByPath.set(paths[index], item.signedUrl); });
  }

  const assetsByPost = new Map<string, DraftPost['assets']>();
  for (const asset of storedAssets) {
    const signedUrl = signedByPath.get(asset.original_path);
    if (!signedUrl) throw new Error(`${asset.filename} 원본을 불러오지 못했습니다.`);
    const response = await fetch(signedUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${asset.filename} 원본을 불러오지 못했습니다.`);
    const blob = await response.blob();
    const file = new File([blob], asset.filename, { type: asset.mime_type || blob.type });
    const values = assetsByPost.get(asset.post_id) ?? [];
    values.push({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), order: asset.position });
    assetsByPost.set(asset.post_id, values);
  }

  return {
    id: publication.id,
    issueNumber: publication.issue_number,
    title: publication.title,
    shareToken: publication.share_token,
    posts: storedPosts.map((post) => ({
      id: crypto.randomUUID(),
      groupName: post.group_name,
      sectionId: '',
      confidence: Number(post.match_confidence ?? 1),
      category: post.category || '보도',
      title: post.title,
      body: post.body,
      articleUrl: post.article_url ?? '',
      credits: post.credits ?? '',
      assets: (assetsByPost.get(post.id) ?? []).sort((a, b) => a.order - b.order),
    })),
  };
}

export async function publishDistribution(input: PublishInput, onProgress?: (message: string, value: number) => void) {
  const client = requireSupabase();
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) throw new Error('관리자 로그인이 필요합니다.');
  if (!input.posts.length) throw new Error('배포할 게시물이 없습니다.');

  const publicationId = input.existingPublicationId ?? crypto.randomUUID();
  let token = makeShareToken();
  const tokenHash = await sha256(token);
  const storagePaths: string[] = [];
  const newPostIds: string[] = [];
  let previousPostIds: string[] = [];
  let previousStoragePaths: string[] = [];
  const totalAssets = input.posts.reduce((sum, post) => sum + post.assets.length, 0);
  let processed = 0;

  try {
    if (input.existingPublicationId) {
      const { data: existing, error } = await client.from('publications').select('share_token').eq('id', publicationId).single();
      if (error) throw error;
      token = existing.share_token;
      const previous = await storedPublicationAssets(client, publicationId);
      previousPostIds = previous.postIds;
      previousStoragePaths = previous.paths;
    } else {
      const { error } = await client.from('publications').insert({
        id: publicationId,
        issue_number: input.issueNumber,
        title: input.title,
        share_token: token,
        share_token_hash: tokenHash,
        expires_at: input.expiresAt || null,
        created_by: userData.user.id,
        status: 'published',
        published_at: new Date().toISOString(),
      });
      if (error) throw error;
    }

    for (let postIndex = 0; postIndex < input.posts.length; postIndex += 1) {
      const post = input.posts[postIndex];
      const postId = crypto.randomUUID();
      newPostIds.push(postId);
      const { error: postError } = await client.from('posts').insert({
        id: postId,
        publication_id: publicationId,
        category: post.category.trim() || '보도',
        title: post.title,
        body: post.body,
        article_url: post.articleUrl || null,
        credits: post.credits || null,
        group_name: post.groupName,
        match_confidence: post.confidence,
        position: postIndex,
      });
      if (postError) throw postError;

      for (let assetIndex = 0; assetIndex < post.assets.length; assetIndex += 1) {
        const asset = post.assets[assetIndex];
        const assetId = crypto.randomUUID();
        const root = `${userData.user.id}/${publicationId}/${postId}/${assetId}`;
        const originalPath = originalStoragePath(root, asset.file.name, asset.file.type);
        const thumbPath = `${root}/thumb.jpg`;
        const video = asset.file.type.startsWith('video/') || isVideoFile(asset.file.name);
        onProgress?.(`${post.title} · ${assetIndex + 1}번째 원본 업로드 중`, Math.round((processed / Math.max(1, totalAssets)) * 100));

        const uploads: Array<readonly [string, Blob, string]> = [
          [originalPath, asset.file, asset.file.type || 'application/octet-stream'],
        ];
        if (!video) {
          const thumb = await resizeImage(asset.file, 640, 0.78);
          uploads.push([thumbPath, thumb, 'image/jpeg']);
        }
        for (const [path, body, contentType] of uploads) {
          const { error } = await client.storage.from('sns-assets').upload(path, body, { contentType, upsert: false });
          if (error) throw error;
          storagePaths.push(path);
        }
        const { error: assetError } = await client.from('assets').insert({
          id: assetId,
          post_id: postId,
          filename: asset.file.name,
          mime_type: asset.file.type || 'application/octet-stream',
          size_bytes: asset.file.size,
          width: null,
          height: null,
          original_path: originalPath,
          thumbnail_path: video ? originalPath : thumbPath,
          position: assetIndex,
        });
        if (assetError) throw assetError;
        processed += 1;
      }
    }
    if (input.existingPublicationId) {
      const { error: updateError } = await client.from('publications').update({
        issue_number: input.issueNumber,
        title: input.title,
        expires_at: input.expiresAt || null,
        published_at: new Date().toISOString(),
      }).eq('id', publicationId);
      if (updateError) throw updateError;
      if (previousPostIds.length) {
        const { error: oldPostsError } = await client.from('posts').delete().in('id', previousPostIds);
        if (oldPostsError) throw oldPostsError;
      }
      if (previousStoragePaths.length) {
        const { error: oldStorageError } = await client.storage.from('sns-assets').remove(previousStoragePaths);
        if (oldStorageError) console.error('이전 원본 정리에 실패했습니다.', oldStorageError);
      }
    }
    onProgress?.('오래된 배포 정리 중', 99);
    try { await pruneOldPublications(client, 3); }
    catch (cleanupError) { console.error('오래된 배포 자동 정리에 실패했습니다.', cleanupError); }
    onProgress?.('배포 링크 생성 완료', 100);
    return { publicationId, token };
  } catch (error) {
    if (storagePaths.length) await client.storage.from('sns-assets').remove(storagePaths);
    if (input.existingPublicationId) {
      if (newPostIds.length) await client.from('posts').delete().in('id', newPostIds);
    } else {
      await client.from('publications').delete().eq('id', publicationId);
    }
    throw error;
  }
}

export async function deletePublication(publicationId: string) {
  const client = requireSupabase();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error('관리자 로그인이 필요합니다.');
  await deletePublicationWithClient(client, publicationId);
}

export async function listAdminPublications() {
  const client = requireSupabase();
  const { data, error } = await client.from('publications').select('id, issue_number, title, share_token, status, published_at, created_at, expires_at').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
