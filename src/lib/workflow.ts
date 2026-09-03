import type { DraftPost, SourceSection } from '../types';
import { extractArticleUrl, postContentParts } from '../../extension/shared/post-content.mjs';

const imageExtensions = /\.(?:jpe?g|png|webp|gif|avif|heic|svg)$/i;
const videoExtensions = /\.(?:mp4|mov|m4v|webm)$/i;
const manuscriptExtensions = /\.(?:hwp|hwpx|txt|docx)$/i;
// Real section headers in newsroom HWP files are separated by a blank line.
// Requiring that boundary prevents newsletter teaser lines such as
// "[사설] ..." from being mistaken for a second full article section.
const headerPattern = /(?:^|\n{2,})(?:\*\*)?[ \t]*(?:📩[ \t]*)?\[([^\]\r\n]{1,40})\][ \t]*([^\r\n]*?)(?:\*\*)?[ \t]*(?=\n|$)/gu;
const naturalCollator = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' });

export function isImageFile(name: string) {
  return imageExtensions.test(name);
}

export function isVideoFile(name: string) {
  return videoExtensions.test(name);
}

export function isMediaFile(name: string) {
  return isImageFile(name) || isVideoFile(name);
}

export function isManuscriptFile(name: string) {
  return manuscriptExtensions.test(name);
}

export function naturalSortFiles<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => naturalCollator.compare(a.name, b.name));
}

export function extractGroupName(filename: string): string {
  return filename
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]+$/, '')
    .replace(/^\s*\d+\s*호\s*/u, '')
    .replace(/[\s_-]*\d+\s*$/u, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function groupMedia(files: File[]): Map<string, File[]> {
  const groups = new Map<string, File[]>();
  for (const file of naturalSortFiles(files.filter((item) => isMediaFile(item.name)))) {
    const group = extractGroupName(file.name) || '이름 없는 미디어';
    groups.set(group, [...(groups.get(group) ?? []), file]);
  }
  return groups;
}

export const groupImages = groupMedia;

function cleanupExtractedText(text: string) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/&#x20;|&nbsp;/gi, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function splitManuscript(input: string): SourceSection[] {
  const text = cleanupExtractedText(input);
  const matches = [...text.matchAll(headerPattern)].map((match) => {
    const matchedText = match[0];
    const leadingBreaks = matchedText.match(/^\n+/)?.[0].length ?? 0;
    return {
      start: (match.index ?? 0) + leadingBreaks,
      category: match[1].trim(),
      title: match[2].replace(/\*\*/g, '').trim(),
      headerLine: matchedText.slice(leadingBreaks).trim(),
    };
  });
  if (!matches.length) return [];

  return matches.map((match, index) => {
    const end = matches[index + 1]?.start ?? text.length;
    const raw = text.slice(match.start, end).trim().replace(/^\*\*|\*\*$/g, '');
    const category = match.category;
    const title = match.title || `[${category}]`;
    const content = text.slice(match.start, end).trim().slice(match.headerLine.length).trim();
    const articleUrl = extractArticleUrl(content);
    const parts = postContentParts({ body: content, articleUrl });
    const credits = parts.credits;
    // Keep credits editable as body text; every copy/preview places the URL before them.
    const body = [parts.body, credits].filter(Boolean).join('\n\n');

    return {
      id: `section-${index + 1}`,
      header: `[${category}] ${title}`.trim(),
      category,
      title,
      body,
      articleUrl,
      credits,
      raw,
    };
  });
}

const aliases: Record<string, string[]> = {
  석탑: ['석탑', '주간뉴스레터', '뉴스레터'],
  지속가능: ['지속가능', '탄소중립', '온실가스', '배출량'],
  포스트몽골: ['포스트몽골', '북원', '대칸', '토구스', '몽골'],
  덕소농장: ['덕소농장', '농장', '주택공급지'],
  뉴라이트: ['뉴라이트', '사설', '재조명'],
};

function normalize(value: string) {
  return value.toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]/gu, '');
}

function tokens(value: string) {
  return (value.toLocaleLowerCase('ko-KR').match(/[가-힣]{2,}|[a-z0-9]{3,}/g) ?? [])
    .filter((token) => !['보도', '기사', '카드뉴스', '포토뉴스', '사설'].includes(token));
}

export function matchScore(groupName: string, section: SourceSection): number {
  const group = normalize(groupName);
  const sectionText = normalize(`${section.category} ${section.title} ${section.raw.slice(0, 500)}`);
  let score = 0;
  for (const [key, words] of Object.entries(aliases)) {
    if (group.includes(normalize(key))) {
      const hitCount = words.filter((word) => sectionText.includes(normalize(word))).length;
      score += Math.min(0.82, hitCount * 0.24);
    }
  }
  const groupTokens = tokens(groupName);
  const overlap = groupTokens.filter((token) => sectionText.includes(normalize(token))).length;
  score += groupTokens.length ? (overlap / groupTokens.length) * 0.55 : 0;
  const category = normalize(section.category);
  if (group.includes('사설')) score = category.includes('사설') ? score + 0.45 : score * 0.35;
  if (group.includes('포토뉴스')) score = category.includes('포토뉴스') ? score + 0.45 : score * 0.35;
  if (group.includes('석탑') && (category.includes('뉴스레터') || category.includes('석탑'))) score += 0.35;
  return Math.min(1, Number(score.toFixed(2)));
}

export function bestSectionMatch(groupName: string, sections: SourceSection[]) {
  const ranked = sections
    .map((section) => ({ section, score: matchScore(groupName, section) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 0.2) return { section: null, confidence: 0 };
  return { section: best.section, confidence: best.score };
}

export function buildDraftPosts(groups: Map<string, File[]>, sections: SourceSection[]): DraftPost[] {
  return [...groups.entries()].map(([groupName, files]) => {
    const { section, confidence } = bestSectionMatch(groupName, sections);
    return {
      id: crypto.randomUUID(),
      groupName,
      sectionId: section?.id ?? '',
      confidence,
      category: section?.category ?? '보도',
      title: section?.title ?? groupName,
      body: section?.body ?? '',
      articleUrl: section?.articleUrl ?? '',
      // Newsroom copy treats credit lines as part of the post body. Keep the
      // separate field empty to avoid duplicating them on copy/download.
      credits: '',
      assets: files.map((file, index) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        order: index,
      })),
    };
  });
}

export function confidenceLabel(value: number) {
  if (value >= 0.7) return '높음';
  if (value >= 0.4) return '보통';
  return '확인 필요';
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}
