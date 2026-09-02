import { describe, expect, it } from 'vitest';
import { categorizedTitle, koreapasTitle, postBodyWithTitle } from './post-copy';

describe('SNS 게시글 복사 형식', () => {
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
