import type { DraftPost } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resizeImage } from './image-tools';
import { requireSupabase } from './supabase';
import { originalStoragePath } from './storage-path';
import { isVideoFile } from './workflow';
import { previewMedia, removeMedia, uploadMedia } from './media-storage';

export type PublishInput = {
  issueNumber: string; title: string; posts: DraftPost[]; expiresAt?: string | null;
  existingPublicationId?: string; expectedUpdatedAt?: string;
};
type PublicationRow = { id: string; created_at: string };
type StoredPostRow = { id: string; category: string; title: string; body: string; article_url: string | null; credits: string | null; group_name: string; match_confidence: number | null; position: number };
type StoredAssetRow = { id: string; post_id: string; filename: string; mime_type: string; size_bytes: number; original_path: string; thumbnail_path: string; optimized_path: string | null; position: number };
export type EditablePublication = { id: string; issueNumber: string; title: string; shareToken: string; updatedAt: string; expiresAt: string | null; posts: DraftPost[] };

export function publicationIdsToPrune(publications: PublicationRow[], keep = 3) {
  return [...publications].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(Math.max(0, keep)).map((publication) => publication.id);
}

async function publicationStoragePaths(client: SupabaseClient, publicationId: string) {
  const { data: posts, error } = await client.from('posts').select('id').eq('publication_id', publicationId);
  if (error) throw error;
  const ids = (posts ?? []).map((post) => post.id);
  if (!ids.length) return [];
  const { data: assets, error: assetError } = await client.from('assets').select('original_path, thumbnail_path, optimized_path').in('post_id', ids);
  if (assetError) throw assetError;
  return [...new Set((assets ?? []).flatMap((asset) => [asset.original_path, asset.thumbnail_path, asset.optimized_path].filter(Boolean) as string[]))];
}

async function deletePublicationWithClient(client: SupabaseClient, publicationId: string) {
  const paths = await publicationStoragePaths(client, publicationId);
  const { error } = await client.from('publications').delete().eq('id', publicationId);
  if (error) throw error;
  if (paths.length) await removeMedia(paths);
}

async function pruneOldPublications(client: SupabaseClient, keep = 3) {
  const { data, error } = await client.from('publications').select('id, created_at').order('created_at', { ascending: false });
  if (error) throw error;
  for (const id of publicationIdsToPrune((data ?? []) as PublicationRow[], keep)) await deletePublicationWithClient(client, id);
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function makeShareToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function loadAdminPublication(publicationId: string): Promise<EditablePublication> {
  const client = requireSupabase();
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) throw new Error('관리자 로그인이 필요합니다.');
  const { data: publication, error } = await client.from('publications').select('id, issue_number, title, share_token, updated_at, expires_at').eq('id', publicationId).single();
  if (error) throw error;
  const { data: posts, error: postsError } = await client.from('posts').select('id, category, title, body, article_url, credits, group_name, match_confidence, position').eq('publication_id', publicationId).order('position');
  if (postsError) throw postsError;
  const storedPosts = (posts ?? []) as StoredPostRow[];
  const ids = storedPosts.map((post) => post.id);
  const { data: assets, error: assetsError } = ids.length
    ? await client.from('assets').select('id, post_id, filename, mime_type, size_bytes, original_path, thumbnail_path, optimized_path, position').in('post_id', ids).order('position')
    : { data: [], error: null };
  if (assetsError) throw assetsError;
  const storedAssets = (assets ?? []) as StoredAssetRow[];
  // Editing loads image thumbnails only; originals and videos stay on the server.
  const previews = await previewMedia(storedAssets.filter((asset) => !asset.mime_type.startsWith('video/') && !isVideoFile(asset.filename)).map((asset) => asset.thumbnail_path));
  return {
    id: publication.id, issueNumber: publication.issue_number, title: publication.title, shareToken: publication.share_token, updatedAt: publication.updated_at, expiresAt: publication.expires_at ?? null,
    posts: storedPosts.map((post) => ({
      id: post.id, groupName: post.group_name, sectionId: '', confidence: Number(post.match_confidence ?? 1), category: post.category || '보도', title: post.title,
      body: post.body, articleUrl: post.article_url ?? '', credits: post.credits ?? '',
      assets: storedAssets.filter((asset) => asset.post_id === post.id).map((asset) => ({
        id: asset.id, order: asset.position, previewUrl: previews.get(asset.thumbnail_path) ?? '',
        stored: { filename: asset.filename, mimeType: asset.mime_type, sizeBytes: Number(asset.size_bytes), originalPath: asset.original_path, thumbnailPath: asset.thumbnail_path, optimizedPath: asset.optimized_path },
      })),
    })),
  };
}

export async function publishDistribution(input: PublishInput, onProgress?: (message: string, value: number) => void) {
  const client = requireSupabase();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error('관리자 로그인이 필요합니다.');
  if (!input.posts.length) throw new Error('배포할 게시물이 없습니다.');
  const publicationId = input.existingPublicationId ?? crypto.randomUUID();
  const token = input.existingPublicationId ? null : makeShareToken();
  const uploadedPaths: string[] = [];
  const totalNew = input.posts.reduce((sum, post) => sum + post.assets.filter((asset) => asset.file).length, 0);
  let processed = 0;
  let committed = false;
  try {
    const savedPosts = [];
    for (const [position, post] of input.posts.entries()) {
      const savedAssets = [];
      for (const [assetPosition, asset] of post.assets.entries()) {
        if (!asset.file) {
          if (!asset.stored) throw new Error('원본 파일 정보가 없습니다. 배포를 다시 열어 주세요.');
          savedAssets.push({ id: asset.id, retained: true, filename: asset.stored.filename, mime_type: asset.stored.mimeType, size_bytes: asset.stored.sizeBytes, original_path: asset.stored.originalPath, thumbnail_path: asset.stored.thumbnailPath, optimized_path: asset.stored.optimizedPath, position: assetPosition });
          continue;
        }
        const file = asset.file;
        const root = `${data.user.id}/${publicationId}/${post.id}/${asset.id}`;
        const video = file.type.startsWith('video/') || isVideoFile(file.name);
        onProgress?.(`${post.title} · 새 파일 ${processed + 1}/${totalNew} 업로드 중`, Math.round(processed / Math.max(1, totalNew) * 90));
        const originalPath = await uploadMedia(originalStoragePath(root, file.name, file.type), file, file.type || 'application/octet-stream');
        uploadedPaths.push(originalPath);
        let thumbPath = originalPath;
        if (!video) {
          thumbPath = await uploadMedia(`${root}/thumb.jpg`, await resizeImage(file, 640, .78), 'image/jpeg');
          uploadedPaths.push(thumbPath);
        }
        savedAssets.push({ id: asset.id, retained: false, filename: file.name, mime_type: file.type || 'application/octet-stream', size_bytes: file.size, original_path: originalPath, thumbnail_path: thumbPath, optimized_path: null, position: assetPosition });
        processed++;
      }
      savedPosts.push({ id: post.id, category: post.category.trim() || '보도', title: post.title, body: post.body, article_url: post.articleUrl || null, credits: post.credits || null, group_name: post.groupName, match_confidence: post.confidence, position, assets: savedAssets });
    }
    onProgress?.('변경 사항 저장 중', 93);
    const { data: saved, error } = await client.rpc('save_distribution', {
      p_publication_id: publicationId, p_issue_number: input.issueNumber, p_title: input.title, p_posts: savedPosts,
      p_share_token: token, p_expected_updated_at: input.expectedUpdatedAt || null, p_expires_at: input.expiresAt || null,
    });
    if (error) throw new Error(error.message.includes('EDIT_CONFLICT') ? '다른 관리자가 배포를 수정했습니다. 배포를 다시 열고 변경 내용을 적용해 주세요.' : error.message);
    committed = true;
    // Never roll back a committed database save because optional storage cleanup failed.
    try { if (saved.obsolete_paths?.length) await removeMedia(saved.obsolete_paths); }
    catch (error) { console.error('미사용 원본 정리가 필요합니다.', error); }
    try { await pruneOldPublications(client, 3); }
    catch (error) { console.error('오래된 배포 정리가 필요합니다.', error); }
    onProgress?.('배포 링크 생성 완료', 100);
    return { publicationId, token: saved.share_token as string };
  } catch (error) {
    if (!committed && uploadedPaths.length) {
      try { await removeMedia(uploadedPaths); } catch (cleanupError) { console.error('업로드 임시 파일 정리가 필요합니다.', cleanupError); }
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
  const { data, error } = await requireSupabase().from('publications').select('id, issue_number, title, share_token, status, published_at, created_at, expires_at').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
