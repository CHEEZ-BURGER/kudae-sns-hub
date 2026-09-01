import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AlertCircle, Archive, ArrowDown, ArrowUp, Check, ChevronRight, CirclePlus, Clipboard, FileArchive, FileText, GripVertical, Images, Link2, LoaderCircle, Plus, Send, Sparkles, Trash2, UploadCloud, X } from 'lucide-react';
import type { DraftPost, SourceSection } from '../types';
import { AppHeader } from './AppHeader';
import { AdminUsersPanel } from './AdminUsersPanel';
import { expandFiles, extractManuscript, filesFromDataTransfer, partitionSupportedFiles } from '../lib/document-parser';
import { buildDraftPosts, confidenceLabel, formatBytes, groupImages, splitManuscript } from '../lib/workflow';
import { listAdminPublications, publishDistribution } from '../lib/publish';

type AdminStudioProps = { session: Session | null; demoMode?: boolean };
type Stage = 'upload' | 'edit' | 'publishing' | 'done';

const sampleManuscript = `[주간 뉴스레터 석탑] 정기고연전 폐막제, 참살이길 전통 유지한다
2026년 8월 31일자 <고대신문 주간 뉴스레터: 석탑>이 도착했어요.
전문은 학교 메일에서 확인해 보세요!

[보도] '탄소중립' 반환점 돌았지만 ··· 총배출량 감축은 과제
고려대 서울캠퍼스는 탄소중립 계획을 수립하고 온실가스 감축을 추진하고 있다. 목표 달성을 위해선 감축 노력을 다각화해야 한다는 지적이 나온다.
https://www.kunews.ac.kr/news/articleView.html?idxno=51212
글 | 유지원·원예지·전정현 기자 press@
인포그래픽 | 이지효 기자 jyo@
카드뉴스 | 송민경 미디어부장 pull@

[보도] 북원 마지막 대칸 계보 뒤집혀 … ‘아들도 동생도 아니다’
북원의 마지막 대칸 토구스 테무르가 방계 황족이었다는 새로운 해석이 나왔다.
글 | 김기자 기자

[포토뉴스] 주택 공급지 된 고려대 덕소농장
덕소농장의 오늘을 사진으로 전합니다.
사진 | 고대신문 사진부

[사설] 재조명 내세우는 뉴라이트 끊어내야
역사를 왜곡하는 뉴라이트식 재조명은 중단돼야 한다.`;

export function AdminStudio({ session, demoMode = false }: AdminStudioProps) {
  const [stage, setStage] = useState<Stage>('upload');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [issueNumber, setIssueNumber] = useState('2046호');
  const [publicationTitle, setPublicationTitle] = useState('2046호 카드뉴스');
  const [sections, setSections] = useState<SourceSection[]>([]);
  const [posts, setPosts] = useState<DraftPost[]>([]);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [message, setMessage] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [progress, setProgress] = useState({ label: '', value: 0 });
  const [shareUrl, setShareUrl] = useState('');
  const [dragAssetId, setDragAssetId] = useState('');
  const [recent, setRecent] = useState<Array<Record<string, string | null>>>([]);
  const [showAdminUsers, setShowAdminUsers] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const directoryInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (demoMode) return;
    listAdminPublications().then((data) => setRecent(data as Array<Record<string, string | null>>)).catch((error) => setMessage(error.message));
  }, [demoMode, stage]);

  async function receiveFiles(files: File[]) {
    if (!files.length) return;
    setBusy(true); setMessage(''); setWarnings([]);
    try {
      const expanded = await expandFiles(files);
      const partitioned = partitionSupportedFiles(expanded.files);
      const issue = expanded.files.map((file) => file.name.match(/\d+호/u)?.[0]).find(Boolean);
      if (issue) { setIssueNumber(issue); setPublicationTitle(`${issue} 카드뉴스`); }
      setPendingImages(partitioned.images);
      const nextWarnings = [...expanded.warnings];
      if (partitioned.unsupported.length) nextWarnings.push(`지원하지 않는 파일 ${partitioned.unsupported.length}개는 제외했습니다.`);
      if (!partitioned.images.length) nextWarnings.push('이미지 파일을 찾지 못했습니다.');
      let text = pasteText;
      if (partitioned.manuscripts.length) {
        if (partitioned.manuscripts.length > 1) nextWarnings.push('원고가 여러 개여서 첫 번째 문서를 사용했습니다.');
        try { text = await extractManuscript(partitioned.manuscripts[0]); setPasteText(text); }
        catch (error) {
          nextWarnings.push(`${partitioned.manuscripts[0].name}: ${error instanceof Error ? error.message : '본문 추출 실패'}`);
          setShowPaste(true);
        }
      } else {
        nextWarnings.push('원고 파일이 없습니다. 본문을 붙여넣을 수 있습니다.');
        setShowPaste(true);
      }
      setWarnings(nextWarnings);
      if (partitioned.images.length && text.trim()) analyse(partitioned.images, text);
    } catch (error) { setMessage(error instanceof Error ? error.message : '파일 처리 중 오류가 발생했습니다.'); }
    finally { setBusy(false); }
  }

  function analyse(images = pendingImages, text = pasteText) {
    const nextSections = splitManuscript(text);
    if (!images.length) { setMessage('이미지를 먼저 추가해 주세요.'); return; }
    if (!nextSections.length) { setMessage('`[보도] 제목` 같은 원고 섹션 헤더를 찾지 못했습니다. 원고를 확인해 주세요.'); setShowPaste(true); return; }
    setSections(nextSections);
    setPosts(buildDraftPosts(groupImages(images), nextSections));
    setStage('edit'); setMessage('');
  }

  async function drop(event: DragEvent) {
    event.preventDefault(); setDragging(false);
    await receiveFiles(await filesFromDataTransfer(event.dataTransfer));
  }

  function updatePost(id: string, patch: Partial<DraftPost>) {
    setPosts((current) => current.map((post) => post.id === id ? { ...post, ...patch } : post));
  }

  function selectSection(postId: string, sectionId: string) {
    const section = sections.find((item) => item.id === sectionId);
    if (!section) { updatePost(postId, { sectionId: '', confidence: 0 }); return; }
    updatePost(postId, { sectionId, confidence: 1, title: section.title, body: section.body, articleUrl: section.articleUrl, credits: section.credits });
  }

  function reorderAsset(postId: string, targetId: string) {
    if (!dragAssetId || dragAssetId === targetId) return;
    setPosts((current) => current.map((post) => {
      if (post.id !== postId) return post;
      const assets = [...post.assets];
      const from = assets.findIndex((asset) => asset.id === dragAssetId);
      const to = assets.findIndex((asset) => asset.id === targetId);
      if (from < 0 || to < 0) return post;
      const [moved] = assets.splice(from, 1); assets.splice(to, 0, moved);
      return { ...post, assets: assets.map((asset, order) => ({ ...asset, order })) };
    }));
    setDragAssetId('');
  }

  function moveAsset(postId: string, assetId: string, direction: -1 | 1) {
    setPosts((current) => current.map((post) => {
      if (post.id !== postId) return post;
      const index = post.assets.findIndex((asset) => asset.id === assetId);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= post.assets.length) return post;
      const assets = [...post.assets]; [assets[index], assets[next]] = [assets[next], assets[index]];
      return { ...post, assets: assets.map((asset, order) => ({ ...asset, order })) };
    }));
  }

  function addPost() {
    setPosts((current) => [...current, { id: crypto.randomUUID(), groupName: '새 게시물', sectionId: '', confidence: 0, title: '새 게시물', body: '', articleUrl: '', credits: '', assets: [] }]);
  }

  async function publish() {
    if (demoMode) { setMessage('샘플 모드에서는 배포할 수 없습니다. `.env.local`에 Supabase 정보를 연결하면 배포 버튼이 활성화됩니다.'); return; }
    if (posts.some((post) => !post.title.trim() || !post.body.trim())) { setMessage('제목이나 본문이 비어 있는 게시물을 확인해 주세요.'); return; }
    setStage('publishing'); setMessage('');
    try {
      const result = await publishDistribution({ issueNumber, title: publicationTitle, posts }, (label, value) => setProgress({ label, value }));
      if (!result.token) throw new Error('공유 토큰 생성에 실패했습니다.');
      setShareUrl(`${location.origin}${location.pathname}#/d/${result.token}`);
      setStage('done');
    } catch (error) { setMessage(error instanceof Error ? error.message : '배포에 실패했습니다.'); setStage('edit'); }
  }

  function startSample() {
    const names = ['석탑1','석탑2','석탑3','지속가능1','지속가능2','지속가능3','포스트몽골1','포스트몽골2','덕소농장 포토뉴스1','뉴라이트 사설1','뉴라이트 사설2'];
    const palette = ['#7a0019','#a31d3b','#d7a9b3','#183c64','#557ca5'];
    const files = names.map((name, index) => {
      const color = palette[index % palette.length];
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="${color}"/><text x="70" y="130" fill="white" font-family="sans-serif" font-size="42" font-weight="700">고대신문 · 2046호</text><text x="70" y="680" fill="white" font-family="sans-serif" font-size="76" font-weight="800">${name.replace(/\d+$/, '')}</text><text x="70" y="790" fill="white" font-family="sans-serif" font-size="38">샘플 카드뉴스 ${index + 1}</text></svg>`;
      return new File([svg], `2046호 ${name}.svg`, { type: 'image/svg+xml' });
    });
    setPasteText(sampleManuscript); setPendingImages(files); analyse(files, sampleManuscript);
  }

  const totalBytes = useMemo(() => posts.flatMap((post) => post.assets).reduce((sum, asset) => sum + asset.file.size, 0), [posts]);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <AppHeader username={session?.user.email?.split('@')[0]} onManageAdmins={demoMode ? undefined : ()=>setShowAdminUsers((value)=>!value)}/>
      {demoMode && <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-900">샘플 모드 · Supabase 연결 전에는 분석과 편집만 체험할 수 있습니다.</div>}
      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        {showAdminUsers && <AdminUsersPanel onClose={()=>setShowAdminUsers(false)}/>} 
        <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><p className="eyebrow">{stage === 'upload' ? '새 배포 만들기' : publicationTitle}</p><h1 className="mt-2 text-3xl font-black tracking-[-.035em] md:text-4xl">{stage === 'upload' ? '파일 한 번, 배포 준비 끝.' : stage === 'done' ? '배포 링크가 준비됐습니다.' : '자동 매칭을 확인해 주세요.'}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{stage === 'upload' ? '카드뉴스 폴더와 원고를 올리면 게시물별 이미지와 본문을 자동으로 연결합니다.' : stage === 'edit' ? `${posts.length}개 게시물 · 이미지 ${posts.flatMap((post)=>post.assets).length}장 · ${formatBytes(totalBytes)}` : '기자는 이 링크에서 이미지와 본문을 바로 가져갈 수 있습니다.'}</p></div>
          <Stepper stage={stage}/>
        </div>

        {message && <div className="error-banner mb-5"><AlertCircle/><p>{message}</p><button onClick={()=>setMessage('')}><X/></button></div>}
        {stage === 'upload' && <UploadStage busy={busy} dragging={dragging} setDragging={setDragging} drop={drop} fileInput={fileInput} directoryInput={directoryInput} receiveFiles={receiveFiles} warnings={warnings} showPaste={showPaste} setShowPaste={setShowPaste} pasteText={pasteText} setPasteText={setPasteText} analyse={()=>analyse()} startSample={startSample}/>} 
        {stage === 'edit' && <EditStage issueNumber={issueNumber} setIssueNumber={setIssueNumber} publicationTitle={publicationTitle} setPublicationTitle={setPublicationTitle} posts={posts} sections={sections} updatePost={updatePost} selectSection={selectSection} setDragAssetId={setDragAssetId} reorderAsset={reorderAsset} moveAsset={moveAsset} setPosts={setPosts} addPost={addPost} publish={publish} reset={()=>setStage('upload')} demoMode={demoMode}/>} 
        {stage === 'publishing' && <PublishingStage progress={progress}/>} 
        {stage === 'done' && <DoneStage shareUrl={shareUrl} reset={()=>{ setStage('upload'); setPosts([]); setSections([]); setPendingImages([]); setPasteText(''); }}/>} 

        {stage === 'upload' && recent.length > 0 && <RecentPublications data={recent}/>} 
      </main>
    </div>
  );
}

function Stepper({ stage }: { stage: Stage }) {
  const current = stage === 'upload' ? 1 : stage === 'edit' ? 2 : 3;
  return <ol className="flex items-center gap-1 self-start text-[11px] font-bold text-muted">{['파일 업로드','매칭 확인','배포'].map((label,index)=><span className="contents" key={label}><li className={`step ${current >= index+1 ? 'active' : ''}`}>{index+1} {label}</li>{index<2&&<ChevronRight size={13}/>}</span>)}</ol>;
}

type UploadProps = {
  busy: boolean; dragging: boolean; setDragging: (value: boolean) => void; drop: (event: DragEvent) => void;
  fileInput: React.RefObject<HTMLInputElement | null>; directoryInput: React.RefObject<HTMLInputElement | null>;
  receiveFiles: (files: File[]) => void; warnings: string[]; showPaste: boolean; setShowPaste: (value: boolean) => void;
  pasteText: string; setPasteText: (value: string) => void; analyse: () => void; startSample: () => void;
};

function UploadStage(props: UploadProps) {
  const directoryProps = { webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>;
  return <>
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
      <div className={`drop-zone min-h-[360px] ${props.dragging ? 'dragging' : ''}`} onDragOver={(event)=>{event.preventDefault();props.setDragging(true);}} onDragLeave={()=>props.setDragging(false)} onDrop={props.drop}>
        {props.busy ? <><LoaderCircle className="animate-spin text-crimson" size={36}/><b className="mt-5">파일을 분석하고 있습니다…</b><span className="mt-2 text-sm text-muted">ZIP 해제와 원고 추출은 파일 크기에 따라 잠시 걸릴 수 있어요.</span></> : <>
          <span className="icon-well"><UploadCloud size={29}/></span><b className="mt-5 text-xl">여기에 폴더나 파일을 놓으세요</b><span className="mt-2 text-center text-sm text-muted">이미지 · ZIP · HWP/HWPX · TXT · DOCX 지원</span>
          <div className="mt-6 flex flex-wrap justify-center gap-2"><button className="button secondary" type="button" onClick={()=>props.fileInput.current?.click()}><Images/>파일 선택</button><button className="button ghost" type="button" onClick={()=>props.directoryInput.current?.click()}><FileArchive/>폴더 선택</button></div>
          <input ref={props.fileInput} hidden type="file" multiple accept="image/*,.zip,.hwp,.hwpx,.txt,.docx" onChange={(event)=>props.receiveFiles([...event.target.files ?? []])}/>
          <input ref={props.directoryInput} hidden type="file" multiple {...directoryProps} onChange={(event)=>props.receiveFiles([...event.target.files ?? []])}/>
        </>}
      </div>
      <aside className="panel flex flex-col overflow-hidden">
        <div className="border-b border-line p-5"><p className="text-sm font-extrabold">자동 분석 항목</p><p className="mt-1 text-xs leading-5 text-muted">파일을 올리면 아래 순서로 정리합니다.</p></div>
        <div className="space-y-1 p-3">{[['이미지 묶음 찾기',Images],['원고 제목별 분리',FileText],['키워드 자동 연결',Sparkles],['공유용 이미지 준비',Archive]].map(([label,Icon],i)=><div className="analysis-row" key={String(label)}><span>{i+1}</span><p>{String(label)}</p>{typeof Icon !== 'string' && <Icon size={16}/>}</div>)}</div>
        <div className="mx-5 mt-auto mb-5 rounded-xl bg-warm p-4 text-xs leading-5 text-muted"><b className="text-ink">원본은 그대로 보관됩니다.</b><br/>기자 화면에는 가벼운 썸네일만 먼저 표시됩니다.</div>
      </aside>
    </section>
    {props.warnings.length > 0 && <div className="notice mt-4"><b>파일 확인 결과</b><ul className="mt-2 list-disc space-y-1 pl-5">{props.warnings.map((warning)=><li key={warning}>{warning}</li>)}</ul></div>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><button className="text-button" onClick={()=>props.setShowPaste(!props.showPaste)}><FileText/>원고 직접 붙여넣기</button><button className="text-button" onClick={props.startSample}><Sparkles/>2046호 샘플로 체험</button></div>
    {props.showPaste && <section className="panel mt-4 p-5"><label className="field"><span>원고 본문</span><textarea className="min-h-64" value={props.pasteText} onChange={(event)=>props.setPasteText(event.target.value)} placeholder="[보도] 기사 제목&#10;&#10;본문…&#10;&#10;https://…&#10;글 | 기자명"/></label><div className="mt-4 flex justify-end"><button className="button primary" onClick={props.analyse}><Sparkles/>원고 분석하기</button></div></section>}
  </>;
}

type EditProps = {
  issueNumber: string; setIssueNumber: (value:string)=>void; publicationTitle:string; setPublicationTitle:(value:string)=>void;
  posts: DraftPost[]; sections: SourceSection[]; updatePost:(id:string,patch:Partial<DraftPost>)=>void; selectSection:(postId:string,sectionId:string)=>void;
  setDragAssetId:(id:string)=>void; reorderAsset:(postId:string,targetId:string)=>void; moveAsset:(postId:string,assetId:string,direction:-1|1)=>void;
  setPosts:React.Dispatch<React.SetStateAction<DraftPost[]>>; addPost:()=>void; publish:()=>void; reset:()=>void; demoMode:boolean;
};

function EditStage(props: EditProps) {
  return <>
    <section className="panel mb-5 grid gap-4 p-5 sm:grid-cols-[180px_1fr]"><label className="field"><span>호수</span><input value={props.issueNumber} onChange={(e)=>props.setIssueNumber(e.target.value)}/></label><label className="field"><span>배포 제목</span><input value={props.publicationTitle} onChange={(e)=>props.setPublicationTitle(e.target.value)}/></label></section>
    <div className="space-y-5">{props.posts.map((post,index)=><article className="panel overflow-hidden" key={post.id}>
      <header className="flex items-center justify-between gap-4 border-b border-line bg-white px-4 py-3 sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-crimson text-xs font-black text-white">{index+1}</span><div className="min-w-0"><b className="block truncate text-sm">{post.groupName}</b><span className={`confidence ${post.confidence>=.7?'high':post.confidence>=.4?'medium':'low'}`}>매칭 {confidenceLabel(post.confidence)} · {Math.round(post.confidence*100)}%</span></div></div><button className="icon-button danger" title="게시물 삭제" onClick={()=>props.setPosts((current)=>current.filter((item)=>item.id!==post.id))}><Trash2/></button></header>
      <div className="grid gap-6 p-4 sm:p-5 xl:grid-cols-[minmax(280px,.8fr)_minmax(380px,1.2fr)]">
        <div><div className="mb-2 flex items-center justify-between"><b className="section-label">이미지 순서</b><span className="text-xs text-muted">{post.assets.length}장</span></div>{post.assets.length ? <div className="image-order-grid">{post.assets.map((asset,assetIndex)=><div className="image-order-item" draggable onDragStart={()=>props.setDragAssetId(asset.id)} onDragOver={(e)=>e.preventDefault()} onDrop={()=>props.reorderAsset(post.id,asset.id)} key={asset.id}><img src={asset.previewUrl} alt=""/><span>{assetIndex+1}</span><GripVertical className="grip"/><div className="move-buttons"><button onClick={()=>props.moveAsset(post.id,asset.id,-1)} title="앞으로"><ArrowUp/></button><button onClick={()=>props.moveAsset(post.id,asset.id,1)} title="뒤로"><ArrowDown/></button></div></div>)}</div> : <div className="empty-inline"><Images/><span>연결된 이미지가 없습니다.</span></div>}</div>
        <div className="space-y-4"><label className="field"><span>원고 연결</span><select value={post.sectionId} onChange={(e)=>props.selectSection(post.id,e.target.value)}><option value="">직접 입력 / 연결 안 함</option>{props.sections.map((section)=><option value={section.id} key={section.id}>{section.header}</option>)}</select></label><label className="field"><span>제목</span><input value={post.title} onChange={(e)=>props.updatePost(post.id,{title:e.target.value})}/></label><label className="field"><span>본문</span><textarea className="min-h-40" value={post.body} onChange={(e)=>props.updatePost(post.id,{body:e.target.value})}/></label><div className="grid gap-4 sm:grid-cols-2"><label className="field"><span>기사 URL</span><input type="url" value={post.articleUrl} onChange={(e)=>props.updatePost(post.id,{articleUrl:e.target.value})}/></label><label className="field"><span>크레딧</span><textarea className="min-h-20" value={post.credits} onChange={(e)=>props.updatePost(post.id,{credits:e.target.value})}/></label></div></div>
      </div>
    </article>)}</div>
    <button className="add-post mt-5" onClick={props.addPost}><CirclePlus/>게시물 직접 추가</button>
    <div className="sticky-actions"><button className="button ghost" onClick={props.reset}>처음부터</button><button className="button primary" onClick={props.publish} title={props.demoMode?'Supabase 연결 후 사용 가능':''}><Send/>{props.demoMode?'배포 설정 필요':'배포하기'}</button></div>
  </>;
}

function PublishingStage({ progress }: { progress: {label:string;value:number} }) {
  return <section className="panel mx-auto max-w-xl p-8 text-center sm:p-12"><LoaderCircle className="mx-auto animate-spin text-crimson" size={40}/><h2 className="mt-5 text-xl font-black">이미지를 안전하게 올리고 있습니다.</h2><p className="mt-2 text-sm text-muted">창을 닫지 말아 주세요.</p><div className="progress mt-7"><span style={{width:`${progress.value}%`}}/></div><div className="mt-3 flex justify-between text-xs text-muted"><span>{progress.label}</span><b>{progress.value}%</b></div></section>;
}

function DoneStage({ shareUrl, reset }: { shareUrl:string; reset:()=>void }) {
  const [copied,setCopied]=useState(false);
  async function copy(){await navigator.clipboard.writeText(shareUrl);setCopied(true);setTimeout(()=>setCopied(false),1600);}
  return <section className="panel mx-auto max-w-2xl p-7 text-center sm:p-10"><span className="success-icon"><Check/></span><p className="eyebrow mt-5">배포 완료</p><h2 className="mt-2 text-2xl font-black">기자들에게 이 링크를 보내세요.</h2><p className="mt-2 text-sm text-muted">링크를 받은 사람은 로그인 없이 이 배포만 읽을 수 있습니다.</p><div className="share-box mt-7"><Link2/><input readOnly value={shareUrl}/><button onClick={copy}>{copied?'복사됨':'링크 복사'}</button></div><div className="mt-6 flex flex-wrap justify-center gap-2"><a className="button secondary" href={`#/d/${shareUrl.split('/#/d/')[1]}`}>기자 화면 열기</a><button className="button ghost" onClick={reset}>새 배포 만들기</button></div></section>;
}

function RecentPublications({ data }: { data:Array<Record<string,string|null>> }) {
  async function copy(token:string){await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/d/${token}`);}
  return <section className="mt-10"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black">최근 배포</h2><span className="text-xs text-muted">{data.length}건</span></div><div className="panel divide-y divide-line overflow-hidden">{data.slice(0,5).map((item)=><div className="flex items-center justify-between gap-3 p-4" key={item.id}><div className="min-w-0"><b className="block truncate text-sm">{item.title}</b><span className="text-xs text-muted">{item.issue_number} · {item.published_at ? new Date(item.published_at).toLocaleString('ko-KR') : '작성 중'}</span></div>{item.share_token&&<button className="button tiny ghost" onClick={()=>copy(item.share_token!)}><Clipboard/>링크 복사</button>}</div>)}</div></section>;
}
