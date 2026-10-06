import { edgeFunctionUrl, requireSupabase, publishableKey } from './supabase';
import { isExternalMediaPath } from '../../supabase/functions/_shared/media-paths';

async function mediaAdmin(input: Record<string, unknown>) {
  const client = requireSupabase();
  const { data } = await client.auth.getSession();
  if (!data.session) throw new Error('관리자 로그인이 필요합니다.');
  const response = await fetch(edgeFunctionUrl('media-admin'), {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: publishableKey(), Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '파일 저장소에 연결하지 못했습니다.');
  return result;
}

export async function uploadMedia(path: string, body: Blob, contentType: string) {
  const backend = import.meta.env.VITE_MEDIA_BACKEND || 'supabase';
  if (!['supabase', 'aws', 'r2'].includes(backend)) throw new Error('파일 저장소 설정을 확인해 주세요.');
  if (backend === 'supabase') {
    const { error } = await requireSupabase().storage.from('sns-assets').upload(path, body, { contentType, upsert: false });
    if (error) throw error;
    return path;
  }
  const result = await mediaAdmin({ action: 'upload', backend, path, contentType, sizeBytes: body.size });
  const response = await fetch(result.uploadUrl, { method: 'PUT', body, headers: { 'Content-Type': contentType } });
  if (!response.ok) throw new Error('원본 업로드에 실패했습니다. 파일을 유지한 채 다시 시도해 주세요.');
  await mediaAdmin({ action: 'verify', path: result.storedPath, sizeBytes: body.size, contentType });
  return result.storedPath as string;
}

export async function previewMedia(paths: string[]) {
  const result = new Map<string, string>();
  const supabasePaths = [...new Set(paths.filter((path) => !isExternalMediaPath(path)))];
  const externalPaths = [...new Set(paths.filter(isExternalMediaPath))];
  if (supabasePaths.length) {
    const { data, error } = await requireSupabase().storage.from('sns-assets').createSignedUrls(supabasePaths, 3600);
    if (error) throw error;
    data?.forEach((item) => { if (item.path && item.signedUrl) result.set(item.path, item.signedUrl); });
  }
  if (externalPaths.length) {
    const response = await mediaAdmin({ action: 'preview', paths: externalPaths });
    for (const item of response.urls) result.set(item.path, item.url);
  }
  return result;
}

export async function removeMedia(paths: string[]) {
  // A database save may have committed even if its HTTP response was lost.
  const safe: string[] = [];
  for (const path of [...new Set(paths)]) {
    let retained = false;
    for (const column of ['original_path', 'thumbnail_path', 'optimized_path']) {
      const { data, error } = await requireSupabase().from('assets').select('id').eq(column,path).limit(1);
      if (error) throw error;
      if (data?.length) { retained = true; break; }
    }
    if (!retained) safe.push(path);
  }
  const supabasePaths = safe.filter((path) => !isExternalMediaPath(path));
  const externalPaths = safe.filter(isExternalMediaPath);
  if (supabasePaths.length) {
    const { error } = await requireSupabase().storage.from('sns-assets').remove(supabasePaths);
    if (error) throw error;
  }
  if (externalPaths.length) await mediaAdmin({ action: 'delete', paths: externalPaths });
}
