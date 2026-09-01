import { describe, expect, it } from 'vitest';
import { bestSectionMatch, extractGroupName, groupImages, naturalSortFiles, splitManuscript } from './workflow';

const manuscript = `
[주간 뉴스레터 석탑] 정기고연전 폐막제, 참살이길 전통 유지한다
2026년 8월 31일자 석탑이 도착했어요.

[보도] '탄소중립' 반환점 돌았지만 ··· 총배출량 감축은 과제
고려대는 온실가스 감축을 추진하고 있다.
https://www.kunews.ac.kr/news/articleView.html?idxno=51212
글 | 유지원 기자 press@

[보도] 북원 마지막 대칸 계보 뒤집혀 … ‘아들도 동생도 아니다’
포스트 몽골 렉처 시리즈가 열렸다.

[포토뉴스] 주택 공급지 된 고려대 덕소농장
덕소농장의 오늘을 사진으로 전한다.

[사설] 재조명 내세우는 뉴라이트 끊어내야
뉴라이트 역사관을 비판한다.`;

function fakeFile(name: string) {
  return { name } as File;
}

describe('파일명 처리', () => {
  it('호수, 확장자, 말미 숫자를 제거해 그룹명을 만든다', () => {
    expect(extractGroupName('2046호 덕소농장 포토뉴스10.png')).toBe('덕소농장 포토뉴스');
  });

  it('1, 2, 10 순서로 자연 정렬한다', () => {
    const sorted = naturalSortFiles([fakeFile('2046호 석탑10.jpg'), fakeFile('2046호 석탑2.jpg'), fakeFile('2046호 석탑1.jpg')]);
    expect(sorted.map((file) => file.name)).toEqual(['2046호 석탑1.jpg', '2046호 석탑2.jpg', '2046호 석탑10.jpg']);
    expect([...groupImages(sorted).keys()]).toEqual(['석탑']);
  });
});

describe('원고 분할', () => {
  const sections = splitManuscript(manuscript);

  it('헤더 기준으로 모든 섹션을 분리한다', () => {
    expect(sections).toHaveLength(5);
    expect(sections[1].articleUrl).toContain('idxno=51212');
    expect(sections[1].credits).toContain('유지원');
  });

  it('본문에서 기사 URL만 분리하고 크레딧은 본문에 포함한다', () => {
    expect(sections[1].body).not.toContain('https://');
    expect(sections[1].body).toContain('글 | 유지원');
  });

  it('뉴스레터 안의 기사 목록을 별도 원고 섹션으로 잘못 나누지 않는다', () => {
    const hwpExtract = `2045호 카드뉴스 (月)\n\n📩 [주간 뉴스레터 석탑] 정기고연전 폐막제\n\n탄소중립 반환점\n몸짓으로 말하던 발레리나\n[사설] 재조명 내세우는 뉴라이트 끊어내야\n\n전문은 학교 메일에서 확인해 보세요!\n\n\n[보도] 탄소중립 반환점\n\n기사 본문\n\n글 | 유지원 기자\n\n\n[사설] 재조명 내세우는 뉴라이트 끊어내야\n\n사설 전체 본문`;
    const parsed = splitManuscript(hwpExtract);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].body).toContain('[사설] 재조명');
    expect(parsed[2].body).toBe('사설 전체 본문');
    expect(bestSectionMatch('뉴라이트 사설', parsed).section?.title).toBe('재조명 내세우는 뉴라이트 끊어내야');
  });
});

describe('자동 매칭', () => {
  const sections = splitManuscript(manuscript);
  const cases = [
    ['석탑', '주간 뉴스레터'],
    ['지속가능', '탄소중립'],
    ['포스트몽골', '북원'],
    ['덕소농장 포토뉴스', '덕소농장'],
    ['뉴라이트 사설', '뉴라이트'],
  ];

  it.each(cases)('%s 그룹을 올바른 섹션에 연결한다', (group, expected) => {
    const match = bestSectionMatch(group, sections);
    expect(match.section?.header).toContain(expected);
    expect(match.confidence).toBeGreaterThanOrEqual(0.4);
  });
});
