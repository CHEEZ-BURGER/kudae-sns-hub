import type { Distribution } from '../types';
import { edgeFunctionUrl, isSupabaseConfigured, publishableKey } from './supabase';

async function invoke(body: Record<string, unknown>) {
  const response = await fetch(edgeFunctionUrl('public-distribution'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: publishableKey() },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '배포 정보를 불러오지 못했습니다.');
  return payload;
}

export async function loadDistribution(token: string): Promise<Distribution> {
  if (token === 'demo' && !isSupabaseConfigured) return demoDistribution();
  return invoke({ action: 'read', token });
}

function cardDataUrl(label: string, number: number, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="${color}"/><text x="70" y="120" fill="white" font-family="sans-serif" font-size="38" font-weight="700">고대신문 · 2046호</text><text x="70" y="650" fill="white" font-family="sans-serif" font-size="70" font-weight="800">${label}</text><text x="70" y="750" fill="white" font-family="sans-serif" font-size="34">카드뉴스 ${number}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function demoDistribution(): Distribution {
  const asset = (id: string, label: string, number: number, color: string) => {
    const url = cardDataUrl(label, number, color);
    return { id, filename: `2046호 ${label}${number}.svg`, sizeBytes: 1_240_000, mimeType: 'image/svg+xml', thumbUrl: url, originalUrl: url, position: number - 1 };
  };
  return {
    id: 'demo-publication', issueNumber: '2046호', title: '2046호 SNS 카드뉴스', publishedAt: new Date().toISOString(), expiresAt: null,
    posts: [
      { id: 'demo-post-1', position: 0, title: "'탄소중립' 반환점 돌았지만 ··· 총배출량 감축은 과제", body: '고려대 서울캠퍼스는 탄소중립 계획을 수립하고 온실가스 감축을 추진하고 있다. 목표 달성을 위해선 감축 노력을 다각화해야 한다는 지적이 나온다.', articleUrl: 'https://www.kunews.ac.kr/news/articleView.html?idxno=51212', credits: '글 | 유지원·원예지·전정현 기자\n인포그래픽 | 이지효 기자\n카드뉴스 | 송민경 미디어부장', assets: [asset('a1','지속가능',1,'#1d1d1d'),asset('a2','지속가능',2,'#ff205c'),asset('a3','지속가능',3,'#623446')] },
      { id: 'demo-post-2', position: 1, title: '재조명 내세우는 뉴라이트 끊어내야', body: '역사를 왜곡하는 뉴라이트식 재조명은 중단돼야 한다.', articleUrl: '', credits: '사설 | 고대신문 편집국', assets: [asset('b1','뉴라이트 사설',1,'#ff205c'),asset('b2','뉴라이트 사설',2,'#ff8bad')] },
    ],
  };
}
