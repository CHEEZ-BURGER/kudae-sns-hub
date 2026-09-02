import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Clipboard, Copy, Download, ExternalLink, Film, Images, LoaderCircle, RefreshCw, RotateCcw } from 'lucide-react';
import type { Distribution, DistributionPost } from '../types';
import { AppHeader } from './AppHeader';
import { copyImageToClipboard, downloadAsset, downloadAssetsIndividually, isVideoAsset } from '../lib/image-tools';
import { loadDistribution } from '../lib/public-api';
import { categorizedTitle, koreapasTitle, postBodyWithTitle } from '../lib/post-copy';
import { formatBytes } from '../lib/workflow';

export function DistributionPage({ token }: { token: string }) {
  const [data, setData] = useState<Distribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const cardStartRef = useRef<HTMLDivElement>(null);

  async function reload() {
    setLoading(true); setError('');
    try { setData(await loadDistribution(token)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '배포 정보를 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { reload(); }, [token]);
  useEffect(() => { setActiveIndex(0); }, [data?.id]);
  function notify(value: string) { setToast(value); setTimeout(()=>setToast(''), 2500); }
  function movePost(nextIndex: number) {
    if (!data) return;
    setActiveIndex(Math.max(0, Math.min(nextIndex, data.posts.length - 1)));
    requestAnimationFrame(() => cardStartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  if (loading) return <PageState icon={<LoaderCircle className="animate-spin"/>} title="배포 자료를 불러오는 중" description="썸네일만 먼저 불러오고 원본은 필요한 순간에 가져옵니다."/>;
  if (error || !data) return <PageState icon={<AlertCircle/>} title="링크를 열 수 없습니다" description={error || '만료되었거나 올바르지 않은 배포 링크입니다.'} action={<button className="button secondary" onClick={reload}><RefreshCw/>다시 시도</button>}/>;

  const assets = data.posts.flatMap((post) => post.assets);
  const videoCount = assets.filter(isVideoAsset).length;
  const imageCount = assets.length - videoCount;
  const activePost = data.posts[activeIndex];
  return <div className="min-h-screen bg-canvas text-ink"><AppHeader reporter/>
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-9 lg:px-8">
      <header className="reporter-hero"><div><p className="eyebrow">{data.issueNumber} SNS 배포</p><h1 className="mt-2 text-3xl font-black tracking-[-.035em] sm:text-4xl">{data.title}</h1><p className="mt-3 text-sm text-muted">게시물 {data.posts.length}개 · 이미지 {imageCount}장 · 영상 {videoCount}개 · {new Date(data.publishedAt).toLocaleDateString('ko-KR')} 배포</p></div><div className="reporter-tip"><Copy/><p><b>글을 하나씩 확인하세요.</b><br/>제목과 제목이 포함된 본문을 복사한 뒤, 이미지는 순차 복사하거나 원본으로 한꺼번에 받으면 됩니다.</p></div></header>
      {activePost?<div className="mt-6" ref={cardStartRef}>
        <div className="post-pager-top"><span>{activeIndex+1} / {data.posts.length}</span><strong>{categorizedTitle(activePost.category,activePost.title)}</strong></div>
        <ReporterPost key={activePost.id} post={activePost} index={activeIndex} notify={notify}/>
        <PostPager current={activeIndex} total={data.posts.length} onMove={movePost}/>
      </div>:<div className="empty-inline mt-6"><Images/><span>배포된 게시물이 없습니다.</span></div>}
      <footer className="py-10 text-center text-xs text-muted">고대신문 SNS 배포실 · 링크가 만료되면 배포 담당자에게 문의해 주세요.</footer>
    </main>{toast&&<div className="toast"><Check/>{toast}</div>}
  </div>;
}

type ReporterPostProps = { post: DistributionPost; index:number; notify:(value:string)=>void };

function ReporterPost({ post,index,notify }: ReporterPostProps) {
  const [working,setWorking]=useState('');
  const [pasteMode,setPasteMode]=useState(false);
  const [pasteIndex,setPasteIndex]=useState(0);
  const totalSize=useMemo(()=>post.assets.reduce((sum,asset)=>sum+asset.sizeBytes,0),[post.assets]);
  const videoCount=post.assets.filter(isVideoAsset).length;
  const imageAssets=post.assets.filter((asset)=>!isVideoAsset(asset));
  const displayTitle=categorizedTitle(post.category,post.title);

  async function action(key:string,task:()=>Promise<void>,success:string){setWorking(key);try{await task();notify(success);return true;}catch(error){notify(error instanceof Error?error.message:'작업에 실패했습니다.');return false;}finally{setWorking('');}}
  async function copyText(value:string,success:string){try{await navigator.clipboard.writeText(value);notify(success);}catch{notify('텍스트를 복사하지 못했습니다. 길게 눌러 직접 복사해 주세요.');}}
  async function copyTitle(){await copyText(displayTitle,'분류가 포함된 제목을 복사했습니다.');}
  async function copyKoreapasTitle(){await copyText(koreapasTitle(post.category,post.title),'고파스용 제목을 복사했습니다.');}
  async function copyBody(){await copyText(postBodyWithTitle(post),'제목이 포함된 전체 본문을 복사했습니다.');}

  async function copyForPaste(assetIndex:number){
    const asset=imageAssets[assetIndex];
    if(!asset) return;
    const copied=await action(`paste-${asset.id}`,()=>copyImageToClipboard(asset.originalUrl),`${assetIndex+1}번 이미지를 복사했습니다. SNS 작성창에 붙여넣으세요.`);
    if(!copied) return;
    setPasteMode(true);
    setPasteIndex(assetIndex+1);
  }
  async function startPaste(){
    if(!imageAssets.length){notify('복사할 이미지가 없습니다.');return;}
    await copyForPaste(0);
  }

  return <article className="reporter-card">
    <header className="border-b border-line p-4 sm:p-6"><div className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-crimson text-xs font-black text-white">{index+1}</span><div className="min-w-0 flex-1"><h2 className="text-lg font-black leading-7 sm:text-xl">{displayTitle}</h2><p className="mt-1 text-xs text-muted">이미지 {imageAssets.length}장 · 영상 {videoCount}개 · 원본 {formatBytes(totalSize)}</p></div></div></header>
    <div className="p-4 sm:p-6">
      {post.assets.length>0?<div className="image-rail">{post.assets.map((asset,assetIndex)=>{const video=isVideoAsset(asset);return <figure key={asset.id} className="reporter-image"><div className={`image-frame ${video?'video-frame':''}`}>{video?<video controls preload="metadata" src={asset.originalUrl} aria-label={`${displayTitle} ${assetIndex+1}번째 영상`}/>:<img loading="lazy" src={asset.thumbUrl} alt={`${displayTitle} ${assetIndex+1}번째 카드`}/>}<span>{assetIndex+1}</span>{video&&<i className="media-badge"><Film/>영상</i>}</div><div className={video?'grid':'grid grid-cols-2 gap-1.5'}>{!video&&<button className="button tiny ghost" onClick={()=>action(`copy-${asset.id}`,()=>copyImageToClipboard(asset.originalUrl),'이미지를 복사했습니다.')} disabled={working===`copy-${asset.id}`}><Copy/>복사</button>}<button className="button tiny ghost" onClick={()=>action(`down-${asset.id}`,()=>downloadAsset(asset),'원본 저장을 시작했습니다.')}><Download/>원본 저장</button></div></figure>})}</div>:<div className="empty-inline"><Images/><span>이 게시물에는 이미지나 영상이 없습니다.</span></div>}

      <section className="copy-tools mt-4" aria-label="제목과 본문 복사">
        <div className="copy-preview"><span>복사될 제목</span><strong>{displayTitle}</strong><small>본문 복사 시 이 제목 뒤에 두 줄을 띄우고 본문·기사 링크·크레딧이 이어집니다.</small></div>
        <div className="copy-tool-buttons"><button className="button secondary" onClick={copyTitle}><Clipboard/>SNS 제목 복사</button><button className="button secondary" onClick={copyKoreapasTitle}><Clipboard/>고파스 제목 복사</button><button className="button primary" onClick={copyBody}><Clipboard/>제목+본문 복사</button></div>
      </section>

      {imageAssets.length>0&&<div className="paste-transfer mt-4">
        {!pasteMode?<div className="paste-start"><Copy/><div><b>이미지 순차 복사</b><span>1번 이미지부터 복사하고 다음 순서를 기억합니다.</span></div><button className="button primary" onClick={startPaste} disabled={working.startsWith('paste-')}><Copy/>순차 복사 시작</button></div>
        :<div className="paste-sequence">
          <div className="paste-progress"><div><b>{pasteIndex>=imageAssets.length?'모든 이미지를 복사했습니다.':`${pasteIndex+1}번 이미지를 복사할 차례입니다.`}</b><span>{pasteIndex>=imageAssets.length?'SNS 작성창에서 마지막 이미지를 붙여넣으세요.':'SNS에 붙여넣고 이 페이지로 돌아와 다음 버튼을 누르세요.'}</span></div><strong>{Math.min(pasteIndex,imageAssets.length)} / {imageAssets.length}</strong></div>
          <div className="paste-thumbs">{imageAssets.map((asset,assetIndex)=><button className={`${assetIndex<pasteIndex?'copied':''} ${assetIndex===pasteIndex?'current':''}`} onClick={()=>copyForPaste(assetIndex)} key={asset.id} title={`${assetIndex+1}번 이미지 복사`}><img src={asset.thumbUrl} alt=""/><i>{assetIndex<pasteIndex?<Check/>:assetIndex+1}</i></button>)}</div>
          <div className="paste-next">{pasteIndex<imageAssets.length?<button className="button primary" onClick={()=>copyForPaste(pasteIndex)} disabled={working.startsWith('paste-')}><Copy/>{pasteIndex+1}번 이미지 복사</button>:<button className="button secondary" onClick={()=>{setPasteIndex(0);void copyForPaste(0);}}><RotateCcw/>처음부터 다시</button>}<button className="button ghost" onClick={()=>{setPasteMode(false);setPasteIndex(0);}}>복사 모드 닫기</button></div>
        </div>}
        <p className="paste-note">클립보드는 이미지 여러 장을 독립 항목으로 유지하지 못해 한 장씩 복사합니다.</p>
      </div>}

      {imageAssets.length>0&&<section className="bulk-download mt-4"><div><Download/><p><b>이미지 원본 전체 다운로드</b><span>ZIP으로 묶지 않고 {imageAssets.length}개 원본을 순서대로 내려받습니다.</span></p></div><button className="button primary" disabled={working==='download-images'} onClick={()=>action('download-images',()=>downloadAssetsIndividually(imageAssets),`${imageAssets.length}개 원본 다운로드를 시작했습니다.`)}>{working==='download-images'?<LoaderCircle className="animate-spin"/>:<Download/>}전체 다운로드</button></section>}

      <section className="copy-block mt-5"><div className="flex items-center justify-between gap-2"><b className="section-label">게시 본문 미리보기</b><button className="button tiny secondary" onClick={copyBody}><Clipboard/>제목+본문 복사</button></div><strong className="body-copy-title">{displayTitle}</strong><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{post.body}</p>{post.articleUrl&&<a className="article-link" href={post.articleUrl} target="_blank" rel="noreferrer"><ExternalLink/>기사 원문 열기</a>}{post.credits&&<p className="mt-4 whitespace-pre-wrap border-t border-line pt-4 text-xs leading-6 text-muted">{post.credits}</p>}</section>
    </div>
  </article>;
}

function PostPager({current,total,onMove}:{current:number;total:number;onMove:(index:number)=>void}) {
  return <nav className="post-pager" aria-label="게시물 이동"><button className="button secondary" disabled={current===0} onClick={()=>onMove(current-1)}><ArrowLeft/>이전 글</button><span><b>{current+1}</b> / {total}</span><button className="button primary" disabled={current>=total-1} onClick={()=>onMove(current+1)}>다음 글<ArrowRight/></button></nav>;
}

function PageState({icon,title,description,action}:{icon:React.ReactNode;title:string;description:string;action?:React.ReactNode}){return <main className="grid min-h-screen place-items-center bg-canvas p-5"><section className="panel max-w-md p-8 text-center"><span className="state-icon">{icon}</span><h1 className="mt-5 text-xl font-black">{title}</h1><p className="mt-2 text-sm leading-6 text-muted">{description}</p>{action&&<div className="mt-5">{action}</div>}</section></main>}
