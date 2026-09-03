// Static OG pages work on free GitHub Pages without disclosing any share tokens.
export const firstPreviewIssue = 2000;
export const lastPreviewIssue = 2499;
export const previewDays = ['', '月', '火', '水', '木', '金', '土', '日'];
const daySlugs = ['', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const koreanDays = '월화수목금토일';

function standardTitle(issue, day = '') {
  const normalized = koreanDays.includes(day) && day ? previewDays[koreanDays.indexOf(day) + 1] : day;
  return `${Number(issue)}호 카드뉴스${normalized ? ` (${normalized})` : ''}`;
}

export function titleFromManuscript(filename = '', text = '', fallbackIssue = '') {
  const pattern = /(\d{4})\s*호\s*카드뉴스(?:\s*[（(]\s*([月火水木金土日월화수목금토일])(?:요일)?\s*[)）])?/u;
  const name = filename.replace(/^.*[\\/]/u, '').replace(/_/g, ' ');
  const match = name.match(pattern) || text.split(/\r?\n/u).slice(0, 6).join('\n').match(pattern);
  return match ? standardTitle(match[1], match[2]) : (fallbackIssue ? `${fallbackIssue} 카드뉴스` : '');
}

export function previewForTitle(title) {
  const match = title.trim().match(/^(\d{4})\s*호\s*카드뉴스(?:\s*[（(]\s*([月火水木金土日월화수목금토일])(?:요일)?\s*[)）])?$/u);
  if (!match || +match[1] < firstPreviewIssue || +match[1] > lastPreviewIssue) return null;
  const normalized = standardTitle(match[1], match[2]);
  const day = normalized.match(/\((.)\)/u)?.[1] || '';
  return { title: normalized, path: `share/${+match[1]}${day ? `-${daySlugs[previewDays.indexOf(day)]}` : ''}.html` };
}

export function distributionShareUrl(appUrl, token, title) {
  if (!/^[A-Za-z0-9_-]{24,80}$/u.test(token)) throw new Error('배포 링크 토큰을 확인해 주세요.');
  const url = new URL(appUrl);
  url.search = ''; url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  const preview = previewForTitle(title);
  if (preview) url.pathname += preview.path;
  url.hash = `/d/${token}`;
  return url.href;
}

const escapeAttribute = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function previewHtml(appHtml, title, appUrl) {
  const safeTitle = escapeAttribute(title);
  const image = escapeAttribute(new URL('branding/ku-weekly-mark.png', appUrl).href);
  // Serve the app itself: no crawler-sensitive redirect, and #/d/token still works.
  return appHtml.replace(/<title>[^<]*<\/title>/u, `<title>${safeTitle}</title>`).replace('</head>', `
    <meta name="robots" content="noindex, nofollow" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="고대신문 SNS 배포실" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="고대신문 카드뉴스 배포 · 제목과 본문 복사 · 원본 이미지·영상 받기" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="800" />
    <meta property="og:image:height" content="800" />
  </head>`);
}
