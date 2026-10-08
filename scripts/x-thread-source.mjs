import twitterText from 'twitter-text';

// Bundled official weighted-length parser; no remote code or API subscription.
export function buildXThread(caption, assetCount, mode = 'article') {
  if (!Number.isInteger(assetCount) || assetCount < 1 || assetCount > 80) throw new Error('X 자동 댓글은 원본 80개까지 준비합니다. 파일을 나눠 배포해 주세요.');
  if (!['article', 'media'].includes(mode)) throw new Error('X 작성 흐름을 확인해 주세요.');
  const text = String(caption || '').trim();
  if (mode === 'article' && !twitterText.parseTweet(text).valid) throw new Error('X 첫 글의 제목·링크가 글자 수 제한을 넘거나 비어 있습니다. 제목을 줄이거나 기사 링크를 확인해 주세요.');
  const replies = Array.from({length:Math.ceil(assetCount / 4)}, (_, index) => ({
    caption: '',
    assetOrders: Array.from({length:Math.min(4, assetCount - index * 4)}, (_, offset) => index * 4 + offset),
  }));
  return mode === 'media' ? replies : [{caption:text, assetOrders:[]}, ...replies];
}
globalThis.KudaeXThread={buildXThread};
