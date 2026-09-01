-- Keep only original upload files for SNS delivery and accept common card-video formats.
-- Existing image thumbnails remain valid; optimized_path stays nullable for compatibility.
update storage.buckets
set file_size_limit = 524288000,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif',
      'image/heic',
      'image/svg+xml',
      'video/mp4',
      'video/quicktime',
      'video/x-m4v',
      'video/webm'
    ]
where id = 'sns-assets';
