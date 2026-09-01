import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Clipboard, Copy, Download, ExternalLink, Film, GripVertical, ImageDown, Images, LoaderCircle, RefreshCw, Share2 } from 'lucide-react';
import type { Distribution, DistributionPost } from '../types';
import { AppHeader } from './AppHeader';
import { copyImageToClipboard, downloadAsset, downloadZip, isVideoAsset, originalFiles, shareAssets } from '../lib/image-tools';
import { loadDistribution } from '../lib/public-api';
import { formatBytes } from '../lib/workflow';

export function DistributionPage({ token }: { token: string }) {
  const [data, setData] = useState<Distribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  async function reload() {
    setLoading(true); setError('');
    try { setData(await loadDistribution(token)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '배포 정보를 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { reload(); }, [token]);
  function notify(value: string) { setToast(value); setTimeout(()=>setToast(''), 2500); }

  if (loading) return <PageState icon={<LoaderCircle className="animate-spin"/>} title="배포 자료를 불러오는 중" description="원본 파일은 필요한 순간에만 불러옵니다."/>;
  if (error || !data) return <PageState icon={<AlertCircle/>} title="링크를 열 수 없습니다" description={error || '만료되었거나 올바르지 않은 배포 링크입니다.'} action={<button className="button secondary" onClick={reload}><RefreshCw/>다시 시도</button>}/>;

  const assets = data.posts.flatMap((post) => post.assets);
  const videoCount = assets.filter(isVideoAsset).length;
  const imageCount = assets.length - videoCount;
  return <div className="min-h-screen bg-canvas text-ink"><AppHeader reporter/>
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-9 lg:px-8">
      <header className="reporter-hero"><div><p className="eyebrow">{data.issueNumber} SNS 배포</p><h1 className="mt-2 text-3xl font-black tracking-[-.035em] sm:text-4xl">{data.title}</h1><p className="mt-3 text-sm text-muted">게시물 {data.posts.length}개 · 이미지 {imageCount}장 · 영상 {videoCount}개 · {new Date(data.publishedAt).toLocaleDateString('ko-KR')} 배포</p></div><div className="reporter-tip"><Share2/><p><b>원본은 페이지에서 자동으로 준비합니다.</b><br/>기기에 저장하지 않고 현재 페이지의 임시 메모리에만 두며, 나가면 사라집니다.</p></div></header>
      <div className="mt-6 space-y-6">{data.posts.map((post,index)=><ReporterPost key={post.id} post={post} index={index} notify={notify}/>)}</div>
      <footer className="py-10 text-center text-xs text-muted">고대신문 SNS 배포실 · 링크가 만료되면 배포 담당자에게 문의해 주세요.</footer>
    </main>{toast&&<div className="toast"><Check/>{toast}</div>}
  </div>;
}

type ReporterPostProps = { post: DistributionPost; index:number; notify:(value:string)=>void };

function ReporterPost({ post,index,notify }: ReporterPostProps) {
  const [working,setWorking]=useState('');
  const [dragFiles,setDragFiles]=useState<File[] | null>(null);
  const [prepareError,setPrepareError]=useState('');
  const totalSize=useMemo(()=>post.assets.reduce((sum,asset)=>sum+asset.sizeBytes,0),[post.assets]);
  const videoCount=post.assets.filter(isVideoAsset).length;
  const imageCount=post.assets.length-videoCount;

  async function action(key:string,task:()=>Promise<void>,success:string){setWorking(key);try{await task();notify(success);}catch(error){notify(error instanceof Error?error.message:'작업에 실패했습니다.');}finally{setWorking('');}}
  async function copyTitle(){await navigator.clipboard.writeText(post.title);notify('게시 제목을 복사했습니다.');}
  async function copyBody(){const body=[post.body,post.articleUrl,post.credits].filter(Boolean).join('\n\n');await navigator.clipboard.writeText(body);notify('게시 본문을 복사했습니다.');}
  async function prepareDrag(silent = false){
    setWorking('drag');
    setPrepareError('');
    try { setDragFiles(await originalFiles(post.assets)); if(!silent) notify(`${post.assets.length}개 원본이 준비됐습니다.`); }
    catch(error){const message=error instanceof Error?error.message:'원본 파일 준비에 실패했습니다.';setPrepareError(message);if(!silent)notify(message);}
    finally{setWorking('');}
  }

  useEffect(()=>{
    let active=true;
    if(!post.assets.length) return ()=>{ active=false; };
    setWorking('drag');
    setPrepareError('');
    originalFiles(post.assets)
      .then((files)=>{ if(active) setDragFiles(files); })
      .catch((error)=>{ if(active) setPrepareError(error instanceof Error?error.message:'원본 파일 준비에 실패했습니다.'); })
      .finally(()=>{ if(active) setWorking(''); });
    return ()=>{ active=false; };
  },[post.id]);
  function startDrag(event: React.DragEvent<HTMLDivElement>){
    if(!dragFiles){event.preventDefault();notify('먼저 원본 파일을 준비해 주세요.');return;}
    event.dataTransfer.effectAllowed='copy';
    try {
      dragFiles.forEach((file)=>event.dataTransfer.items.add(file));
      notify(`${dragFiles.length}개 원본을 끌고 있습니다.`);
    } catch {
      event.preventDefault();
      notify('이 브라우저에서는 파일 드래그를 지원하지 않습니다. 전체 공유를 이용해 주세요.');
    }
  }

  return <article className="reporter-card">
    <header className="border-b border-line p-4 sm:p-6"><div className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-crimson text-xs font-black text-white">{index+1}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><h2 className="text-lg font-black leading-7 sm:text-xl">{post.title}</h2><button className="button tiny secondary shrink-0" onClick={copyTitle}><Clipboard/>제목 복사</button></div><p className="mt-1 text-xs text-muted">이미지 {imageCount}장 · 영상 {videoCount}개 · 원본 {formatBytes(totalSize)}</p></div></div></header>
    <div className="p-4 sm:p-6">
      {post.assets.length>0?<div className="image-rail">{post.assets.map((asset,assetIndex)=>{const video=isVideoAsset(asset);return <figure key={asset.id} className="reporter-image"><div className={`image-frame ${video?'video-frame':''}`}>{video?<video controls preload="metadata" src={asset.originalUrl} aria-label={`${post.title} ${assetIndex+1}번째 영상`}/>:<img loading="lazy" src={asset.thumbUrl} alt={`${post.title} ${assetIndex+1}번째 카드`}/>}<span>{assetIndex+1}</span>{video&&<i className="media-badge"><Film/>영상</i>}</div><div className={video?'grid':'grid grid-cols-2 gap-1.5'}>{!video&&<button className="button tiny ghost" onClick={()=>action(`copy-${asset.id}`,()=>copyImageToClipboard(asset.originalUrl),'이미지를 복사했습니다.')} disabled={working===`copy-${asset.id}`}><Copy/>복사</button>}<button className="button tiny ghost" onClick={()=>action(`down-${asset.id}`,()=>downloadAsset(asset),'원본 저장을 시작했습니다.')}><Download/>원본 저장</button></div></figure>})}</div>:<div className="empty-inline"><Images/><span>이 게시물에는 이미지나 영상이 없습니다.</span></div>}

      {post.assets.length>0&&<div className="media-transfer mt-4">
        <div className={`drag-to-sns ${dragFiles?'ready':''}`} draggable={Boolean(dragFiles)} onDragStart={startDrag}>
          {working==='drag'?<LoaderCircle className="animate-spin"/>:<GripVertical/>}
          <div><b>{dragFiles?`${dragFiles.length}개 원본 자동 준비 완료`:'원본을 자동으로 준비하는 중'}</b><span>{dragFiles?'다중 파일 공유에 바로 사용할 수 있습니다. 지원하는 사이트에서는 이 영역을 끌어놓을 수 있습니다.':'파일을 기기에 저장하지 않고 임시 메모리에 불러오고 있습니다.'}</span></div>
          {prepareError&&<button className="button tiny secondary" onClick={()=>prepareDrag()} disabled={working==='drag'}>다시 준비</button>}
        </div>
        <p className="drag-note">{prepareError?prepareError:'페이스북 웹은 브라우저 보안 정책상 다중 붙여넣기·외부 드롭을 받지 않습니다. 모바일은 ‘전체 공유’, PC 페이스북은 ‘전체 ZIP’을 이용해 주세요.'}</p>
      </div>}

      <div className="asset-actions mt-4"><div className="origin-only">원본은 현재 페이지의 임시 메모리에만 준비됩니다.</div><div className="flex flex-1 flex-wrap justify-end gap-2"><button className="button secondary" disabled={!post.assets.length||working==='share'||working==='drag'} onClick={()=>action('share',()=>shareAssets(post.assets,post.title,dragFiles??undefined),'공유창을 열었습니다.')}><Share2/>전체 공유</button><button className="button ghost" disabled={!post.assets.length||working==='zip'} onClick={()=>action('zip',()=>downloadZip(post.assets,post.title),'ZIP 다운로드를 시작했습니다.')}><ImageDown/>전체 ZIP</button></div></div>

      <section className="copy-block mt-5"><div className="flex items-center justify-between gap-2"><b className="section-label">게시 본문</b><button className="button tiny secondary" onClick={copyBody}><Clipboard/>본문 복사</button></div><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{post.body}</p>{post.articleUrl&&<a className="article-link" href={post.articleUrl} target="_blank" rel="noreferrer"><ExternalLink/>기사 원문 열기</a>}{post.credits&&<p className="mt-4 whitespace-pre-wrap border-t border-line pt-4 text-xs leading-6 text-muted">{post.credits}</p>}</section>
    </div>
  </article>;
}

function PageState({icon,title,description,action}:{icon:React.ReactNode;title:string;description:string;action?:React.ReactNode}){return <main className="grid min-h-screen place-items-center bg-canvas p-5"><section className="panel max-w-md p-8 text-center"><span className="state-icon">{icon}</span><h1 className="mt-5 text-xl font-black">{title}</h1><p className="mt-2 text-sm leading-6 text-muted">{description}</p>{action&&<div className="mt-5">{action}</div>}</section></main>}
