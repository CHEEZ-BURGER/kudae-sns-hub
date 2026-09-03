// Used by both the website and the side panel, including previously published posts.
const creditLine = /^(?:\*\*)?[ \t]*(?:글|사진|취재|인포그래픽|카드뉴스|디자인|일러스트|영상|편집|제작)(?:\s*[·ㆍ/&]\s*(?:글|사진|취재|영상|편집|제작))*[ \t]*[|｜:：]/u;
const clean = (value) => (typeof value === 'string' ? value : '').replace(/\r\n?/g, '\n').trim();

function standaloneUrl(line) {
  const value = line.trim();
  const markdown = value.match(/^\[[^\]]*\]\((https?:\/\/[^\s]+)\)$/u);
  if (markdown) return markdown[1];
  return /^https?:\/\/\S+$/u.test(value) ? value : '';
}

export function extractArticleUrl(body) {
  // Inline references are part of the prose, not a detachable article footer.
  return clean(body).split('\n').map(standaloneUrl).filter(Boolean).at(-1) || '';
}

export function postContentParts(post) {
  const bodyLines = clean(post.body).split('\n');
  const articleUrl = clean(post.articleUrl) || extractArticleUrl(post.body);
  const body = [];
  const credits = [];
  for (const line of bodyLines) {
    if (articleUrl && standaloneUrl(line) === articleUrl) continue;
    if (creditLine.test(line)) credits.push(line.trim());
    else body.push(line);
  }
  credits.push(...clean(post.credits).split('\n').filter((line) => line.trim()));
  return {
    body: body.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    articleUrl,
    credits: [...new Set(credits.map((line) => line.trim()))].join('\n'),
  };
}

export function postBody(post) {
  const parts = postContentParts(post);
  return [parts.body, parts.articleUrl, parts.credits].filter(Boolean).join('\n\n');
}
