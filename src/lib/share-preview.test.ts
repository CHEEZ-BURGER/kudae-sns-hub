import { describe, expect, it } from 'vitest';
import { distributionShareUrl, previewForTitle, previewHtml, titleFromManuscript } from '../../shared/share-preview.mjs';

const app = 'https://cheez-burger.github.io/kudae-sns-hub/';
const token = 'example_token_12345678901234567890';

describe('카톡 미리보기 주소', () => {
  it('원고 파일명의 호수와 요일을 우선 보존한다', () => {
    expect(titleFromManuscript('자료/2045호_카드뉴스_(木).hwpx', '2046호 카드뉴스 (月)', '2046호')).toBe('2045호 카드뉴스 (木)');
    expect(titleFromManuscript('원고.txt', '2045호 카드뉴스 (목)\n\n[보도] 제목')).toBe('2045호 카드뉴스 (木)');
    expect(titleFromManuscript('원고.docx', '', '2046호')).toBe('2046호 카드뉴스');
    expect(titleFromManuscript('2045호 카드뉴스.hwp')).toBe('2045호 카드뉴스');
  });

  it('메타데이터 경로와 비공개 해시 토큰을 분리한다', () => {
    const link = distributionShareUrl(app, token, '2045호 카드뉴스 (木)');
    expect(link).toBe(`${app}share/2045-thu.html#/d/${token}`);
    expect(new URL(link).hash).toBe(`#/d/${token}`);
    expect(previewForTitle('2045호 카드뉴스 (목요일)')).toEqual({ title: '2045호 카드뉴스 (木)', path: 'share/2045-thu.html' });
    expect(distributionShareUrl(app, token, '2045호 카드뉴스')).toBe(`${app}share/2045.html#/d/${token}`);
  });

  it('범위 밖 호수·자유 제목은 기존 링크로 안전하게 돌아간다', () => {
    expect(distributionShareUrl(app, token, '특별 배포')).toBe(`${app}#/d/${token}`);
    expect(previewForTitle('1999호 카드뉴스')).toBeNull();
    expect(previewForTitle('2500호 카드뉴스')).toBeNull();
    expect(() => distributionShareUrl(app, '<script>', '2045호 카드뉴스')).toThrow();
  });

  it('JS 실행 전 HTML에 제목과 로고가 있고 기존 앱을 그대로 제공한다', () => {
    const html = previewHtml('<html><head><title>기본</title><script type="module" src="/kudae-sns-hub/assets/app.js"></script></head><body><div id="root"></div></body></html>', '2045호 카드뉴스 (木)', app);
    expect(html).toContain('<meta property="og:title" content="2045호 카드뉴스 (木)"');
    expect(html).toContain(`${app}branding/ku-weekly-mark.png`);
    expect(html).toContain('/kudae-sns-hub/assets/app.js');
    expect(html).not.toContain(token);
    expect(html).not.toContain('og:url'); // Do not replace the clicked bearer link with a token-free canonical URL.
    expect(html).not.toContain('http-equiv="refresh"');
  });

  it('메타데이터에 HTML을 삽입할 수 없다', () => {
    const html = previewHtml('<head><title>기본</title></head>', '"><script>alert(1)</script>', app);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
  });
});
