import type { DraftPost } from '../types';
import { resizeImage } from './image-tools';
import { requireSupabase } from './supabase';
import { originalStoragePath } from './storage-path';

export type PublishInput = {
  issueNumber: string;
  title: string;
  posts: DraftPost[];
  expiresAt?: string;
  existingPublicationId?: string;
};

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function makeShareToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function publishDistribution(input: PublishInput, onProgress?: (message: string, value: number) => void) {
  const client = requireSupabase();
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) throw new Error('관리자 로그인이 필요합니다.');
  if (!input.posts.length) throw new Error('배포할 게시물이 없습니다.');

  const publicationId = input.existingPublicationId ?? crypto.randomUUID();
  const token = makeShareToken();
  const tokenHash = await sha256(token);
  const storagePaths: string[] = [];
  const totalAssets = input.posts.reduce((sum, post) => sum + post.assets.length, 0);
  let processed = 0;

  try {
    if (input.existingPublicationId) {
      const { error } = await client.from('publications').update({
        issue_number: input.issueNumber,
        title: input.title,
        expires_at: input.expiresAt || null,
      }).eq('id', publicationId);
      if (error) throw error;
      await client.from('posts').delete().eq('publication_id', publicationId);
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
      const { error: postError } = await client.from('posts').insert({
        id: postId,
        publication_id: publicationId,
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
        const root = `${userData.user.id}/${publicationId}/${postId}/${asset.id}`;
        const originalPath = originalStoragePath(root, asset.file.name, asset.file.type);
        const optimizedPath = `${root}/optimized.jpg`;
        const thumbPath = `${root}/thumb.jpg`;
        onProgress?.(`${post.title} · ${assetIndex + 1}번째 이미지 처리 중`, Math.round((processed / Math.max(1, totalAssets)) * 100));

        const [optimized, thumb] = await Promise.all([
          resizeImage(asset.file, 2160, 0.9),
          resizeImage(asset.file, 640, 0.78),
        ]);
        const uploads = [
          [originalPath, asset.file, asset.file.type || 'application/octet-stream'],
          [optimizedPath, optimized, 'image/jpeg'],
          [thumbPath, thumb, 'image/jpeg'],
        ] as const;
        for (const [path, body, contentType] of uploads) {
          const { error } = await client.storage.from('sns-assets').upload(path, body, { contentType, upsert: false });
          if (error) throw error;
          storagePaths.push(path);
        }
        const { error: assetError } = await client.from('assets').insert({
          id: asset.id,
          post_id: postId,
          filename: asset.file.name,
          mime_type: asset.file.type || 'application/octet-stream',
          size_bytes: asset.file.size,
          width: null,
          height: null,
          original_path: originalPath,
          optimized_path: optimizedPath,
          thumbnail_path: thumbPath,
          position: assetIndex,
        });
        if (assetError) throw assetError;
        processed += 1;
      }
    }
    onProgress?.('배포 링크 생성 완료', 100);
    return { publicationId, token: input.existingPublicationId ? null : token };
  } catch (error) {
    if (!input.existingPublicationId) {
      if (storagePaths.length) await client.storage.from('sns-assets').remove(storagePaths);
      await client.from('publications').delete().eq('id', publicationId);
    }
    throw error;
  }
}

export async function listAdminPublications() {
  const client = requireSupabase();
  const { data, error } = await client.from('publications').select('id, issue_number, title, share_token, status, published_at, created_at, expires_at').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
