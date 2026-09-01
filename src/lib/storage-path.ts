const mimeExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

export function safeImageExtension(filename: string, mimeType: string) {
  const extension = filename.match(/\.([a-z0-9]{1,8})$/i)?.[1].toLowerCase();
  if (extension && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg'].includes(extension)) {
    return extension === 'jpeg' ? 'jpg' : extension;
  }
  return mimeExtensions[mimeType.toLowerCase()] ?? 'bin';
}

export function originalStoragePath(root: string, filename: string, mimeType: string) {
  // Supabase object keys stay ASCII-only. The human-readable Korean filename
  // is preserved separately in public.assets.filename.
  return `${root}/original.${safeImageExtension(filename, mimeType)}`;
}
