const mimeExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
  'video/webm': 'webm',
};

export function safeMediaExtension(filename: string, mimeType: string) {
  const extension = filename.match(/\.([a-z0-9]{1,8})$/i)?.[1].toLowerCase();
  if (extension && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'svg', 'mp4', 'mov', 'm4v', 'webm'].includes(extension)) {
    return extension === 'jpeg' ? 'jpg' : extension;
  }
  return mimeExtensions[mimeType.toLowerCase()] ?? 'bin';
}

export const safeImageExtension = safeMediaExtension;

export function originalStoragePath(root: string, filename: string, mimeType: string) {
  // Supabase object keys stay ASCII-only. The human-readable Korean filename
  // is preserved separately in public.assets.filename.
  return `${root}/original.${safeMediaExtension(filename, mimeType)}`;
}
