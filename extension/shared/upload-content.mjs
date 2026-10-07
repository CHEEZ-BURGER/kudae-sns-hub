import { postBody } from './post-content.mjs';

export function uploadContent(post, target, studio = false) {
  const match = (post.title || '').trim().match(/^\[([^\]]+)\]\s*(.*)$/u);
  const category = post.category?.trim() || match?.[1]?.trim() || '보도';
  const headline = (match?.[2] || post.title || '').trim();
  const label = target === 'koreapas' && !category.startsWith('고대신문 ') ? `고대신문 ${category}` : category;
  const title = `[${label}] ${headline}`.trim();
  const body = postBody(post);
  const separate = ['koreapas', 'everytime'].includes(target) || (target === 'youtube' && studio);
  return { contentMode: separate ? 'separate' : 'caption', title, body,
    caption: [title, body].filter(Boolean).join('\n\n'), postId: post.id || '' };
}

export function nextPostAfterTransfer(current, total, pending, event) {
  // Matching, fully verified completion only. Never advance on ACK, error or a stale event.
  const ok = pending && event?.type === 'SNS_UPLOAD_COMPLETE' && event.payload?.jobId === pending.jobId
    && event.payload?.contentInserted === true && event.payload?.count === pending.count
    && current === pending.index && pending.postId === pending.currentPostId;
  return ok ? Math.min(current + 1, Math.max(0, total - 1)) : current;
}
