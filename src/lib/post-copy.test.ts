import { describe, expect, it } from 'vitest';
import { categorizedTitle, koreapasTitle, postBodyWithTitle } from './post-copy';
import { postBody, postContentParts } from '../../extension/shared/post-content.mjs';
import { splitManuscript } from './workflow';

describe('SNS 게시글 복사 형식', () => {
  const notice = '기사 전문은 고대신문 홈페이지나 고대신문 2046호에서 읽으실 수 있습니다.';
  const url = 'https://www.kunews.ac.kr/news/articleView.html?idxno=51212';
  const credits = '글 | 유지원 기자 press@\n인포그래픽 | 이지효 기자 jyo@\n카드뉴스 | 송민경 미디어부장 pull@';

  it('이미 배포된 본문 내부 크레딧도 안내문 → 링크 → 크레딧 순서로 옮긴다', () => {
    const post = { category: '보도', title: '탄소중립', body: `첫 문단\n\n${notice}\n\n${credits}`, articleUrl: url, credits: '' };
    expect(postBodyWithTitle(post)).toBe(`[보도] 탄소중립\n\n첫 문단\n\n${notice}\n\n${url}\n\n${credits}`);
    expect(postContentParts(post)).toEqual({ body: `첫 문단\n\n${notice}`, articleUrl: url, credits });
  });

  it('별도 필드에도 들어 있는 링크와 크레딧은 중복하지 않는다', () => {
    const body = `${notice}\n${url}\n\n${credits}`;
    expect(postBody({ body, articleUrl: url, credits })).toBe(`${notice}\n\n${url}\n\n${credits}`);
  });

  it('붙여넣은 원고의 마크다운 기사 링크를 온전한 URL로 정리한다', () => {
    const [section] = splitManuscript(`**[보도] 탄소중립**\n\n${notice}\n[${url}](${url})\n\n${credits}`);
    expect(section.title).toBe('탄소중립');
    expect(section.body).toBe(`${notice}\n\n${credits}`);
    expect(postBody(section)).toBe(`${notice}\n\n${url}\n\n${credits}`);
  });

  it('URL 필드가 없는 원고도 기사 링크와 크레딧을 정리한다', () => {
    expect(postBody({ body: `${notice}\n${credits}\n${url}` })).toBe(`${notice}\n\n${url}\n\n${credits}`);
  });

  it('본문 중간 참고 링크와 크레딧 없는 뉴스레터를 보존한다', () => {
    const body = '참고 자료 https://example.com 에서 확인하세요.\n\n전문은 학교 메일에서 확인해 보세요!';
    expect(postBody({ body })).toBe(body);
    expect(postBody({ body: '기사', articleUrl: url })).toBe(`기사\n\n${url}`);
  });

  it('윈도 줄바꿈과 들여쓴 복합 크레딧도 처리한다', () => {
    expect(postBody({ body: `${notice}\r\n  글·사진 ｜ 기자\r\n영상： 미디어부`, articleUrl: url }))
      .toBe(`${notice}\n\n${url}\n\n글·사진 ｜ 기자\n영상： 미디어부`);
  });

  it('일반 제목 앞에 원고 분류를 붙인다', () => {
    expect(categorizedTitle('보도', '탄소중립 반환점 돌았지만')).toBe('[보도] 탄소중립 반환점 돌았지만');
    expect(categorizedTitle('카메라사계', '안암의 여름')).toBe('[카메라사계] 안암의 여름');
  });

  it('이미 분류가 붙은 제목을 중복하지 않는다', () => {
    expect(categorizedTitle('보도', '[보도] 새 학기 시작')).toBe('[보도] 새 학기 시작');
  });

  it('분류값이 없던 기존 배포도 안전하게 표시한다', () => {
    expect(categorizedTitle(undefined, '[사설] 대학의 책무')).toBe('[사설] 대학의 책무');
    expect(categorizedTitle(undefined, '분류 없는 제목')).toBe('[보도] 분류 없는 제목');
  });

  it('고파스 제목에는 고대신문을 분류 앞에 붙인다', () => {
    expect(koreapasTitle('보도', '새 학기 시작')).toBe('[고대신문 보도] 새 학기 시작');
  });

  it('본문 맨 앞에 분류형 제목을 넣고 두 줄을 띄운다', () => {
    expect(postBodyWithTitle({ category: '사설', title: '대학의 책무', body: '첫 문단입니다.', articleUrl: 'https://example.com', credits: '글 | 기자' }))
      .toBe('[사설] 대학의 책무\n\n첫 문단입니다.\n\nhttps://example.com\n\n글 | 기자');
  });
});
