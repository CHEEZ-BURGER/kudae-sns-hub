import type { DistributionPost } from '../types';

function titleParts(category: string | undefined, title: string) {
  const match = title.trim().match(/^\[([^\]]+)\]\s*(.*)$/u);
  return {
    category: category?.trim() || match?.[1]?.trim() || '보도',
    title: (match?.[2] || title).trim(),
  };
}

export function categorizedTitle(category: string | undefined, title: string) {
  const parts = titleParts(category, title);
  return `[${parts.category}] ${parts.title}`.trim();
}

export function koreapasTitle(category: string | undefined, title: string) {
  const parts = titleParts(category, title);
  const label = parts.category.startsWith('고대신문 ') ? parts.category : `고대신문 ${parts.category}`;
  return `[${label}] ${parts.title}`.trim();
}

export function postBodyWithTitle(post: Pick<DistributionPost, 'category' | 'title' | 'body' | 'articleUrl' | 'credits'>) {
  return [categorizedTitle(post.category, post.title), post.body, post.articleUrl, post.credits]
    .filter((value) => value.trim())
    .join('\n\n');
}
