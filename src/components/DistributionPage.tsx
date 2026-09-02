import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Clipboard, Copy, Download, ExternalLink, Film, ImageDown, Images, LoaderCircle, MonitorSmartphone, RefreshCw, RotateCcw, Share2 } from 'lucide-react';
import type { Distribution, DistributionPost } from '../types';
import { AppHeader } from './AppHeader';
import { copyImageToClipboard, downloadAsset, downloadZip, isVideoAsset, originalFiles, shareFiles } from '../lib/image-tools';
import { loadDistribution } from '../lib/public-api';
import { buildPlatformBatches, platformNotice, SHARE_PLATFORMS, type SharePlatform } from '../lib/platform-share';
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
      <header className="reporter-hero"><div><p className="eyebrow">{data.issueNumber} SNS 배포</p><h1 className="mt-2 text-3xl font-black tracking-[-.035em] sm:text-4xl">{data.title}</h1><p className="mt-3 text-sm text-muted">게시물 {data.posts.length}개 · 이미지 {imageCount}장 · 영상 {videoCount}개 · {new Date(data.publishedAt).toLocaleDateString('ko-KR')} 배포</p></div><div className="reporter-tip"><MonitorSmartphone/><p><b>올릴 플랫폼을 먼저 선택하세요.</b><br/>휴대폰에서는 원본 공유창을 열고, 지원되지 않으면 순차 복사와 원본 저장을 안내합니다.</p></div></header>
      <div className="mt-6 space-y-6">{data.posts.map((post,index)=><ReporterPost key={post.id} post={post} index={index} notify={notify}/>)}</div>
      <footer className="py-10 text-center text-xs text-muted">고대신문 SNS 배포실 · 링크가 만료되면 배포 담당자에게 문의해 주세요.</footer>
    </main>{toast&&<div className="toast"><Check/>{toast}</div>}
  </div>;
}

type ReporterPostProps = { post: DistributionPost; index:number; notify:(value:string)=>void };

function ReporterPost({ post,index,notify }: ReporterPostProps) {
  const [working,setWorking]=useState('');
  const [preparedFiles,setPreparedFiles]=useState<File[] | null>(null);
  const [prepareError,setPrepareError]=useState('');
  const [pasteMode,setPasteMode]=useState(false);
  const [pasteIndex,setPasteIndex]=useState(0);
  const [platform,setPlatform]=useState<SharePlatform | null>(null);
  const totalSize=useMemo(()=>post.assets.reduce((sum,asset)=>sum+asset.sizeBytes,0),[post.assets]);
  const videoCount=post.assets.filter(isVideoAsset).length;
  const imageCount=post.assets.length-videoCount;

  async function action(key:string,task:()=>Promise<void>,success:string){setWorking(key);try{await task();notify(success);return true;}catch(error){notify(error instanceof Error?error.message:'작업에 실패했습니다.');return false;}finally{setWorking('');}}
  async function copyTitle(){await navigator.clipboard.writeText(post.title);notify('게시 제목을 복사했습니다.');}
  async function copyBody(){const body=[post.body,post.articleUrl,post.credits].filter(Boolean).join('\n\n');await navigator.clipboard.writeText(body);notify('게시 본문을 복사했습니다.');}
  async function prepareOriginals(silent = false){
    setWorking('prepare');
    setPrepareError('');
    try { setPreparedFiles(await originalFiles(post.assets)); if(!silent) notify(`${post.assets.length}개 원본이 준비됐습니다.`); }
    catch(error){const message=error instanceof Error?error.message:'원본 파일 준비에 실패했습니다.';setPrepareError(message);if(!silent)notify(message);}
    finally{setWorking('');}
  }

  useEffect(()=>{
    let active=true;
    if(!post.assets.length) return ()=>{ active=false; };
    setWorking('prepare');
    setPrepareError('');
    originalFiles(post.assets)
      .then((files)=>{ if(active) setPreparedFiles(files); })
      .catch((error)=>{ if(active) setPrepareError(error instanceof Error?error.message:'원본 파일 준비에 실패했습니다.'); })
      .finally(()=>{ if(active) setWorking(''); });
    return ()=>{ active=false; };
  },[post.id]);

  const pasteAssets=post.assets.filter((asset)=>!isVideoAsset(asset));
  async function copyForPaste(index:number){
    const asset=pasteAssets[index];
    if(!asset) return;
    const copied=await action(`paste-${asset.id}`,()=>copyImageToClipboard(asset.originalUrl),`${index+1}번 이미지를 복사했습니다. SNS 작성창에 붙여넣으세요.`);
    if(!copied) return;
    setPasteMode(true);
    setPasteIndex(index+1);
  }
  async function startPaste(){
    if(!pasteAssets.length){notify('복사할 이미지가 없습니다.');return;}
    await copyForPaste(0);
  }

  const shareBatches = platform ? buildPlatformBatches(platform, post.assets) : [];
  async function shareBatch(batchIndex:number){
    const batch=shareBatches[batchIndex];
    if(!batch) return;
    await action(`platform-share-${batch.id}`,async()=>{
      const files=preparedFiles ?? await originalFiles(post.assets);
      const selected=batch.assetIndexes.map((assetIndex)=>files[assetIndex]).filter(Boolean);
      await shareFiles(selected,`${post.title} · ${batch.label}`);
    },`${batch.label} 공유창을 열었습니다.`);
  }

  return <article className="reporter-card">
    <header className="border-b border-line p-4 sm:p-6"><div className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-crimson text-xs font-black text-white">{index+1}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><h2 className="text-lg font-black leading-7 sm:text-xl">{post.title}</h2><button className="button tiny secondary shrink-0" onClick={copyTitle}><Clipboard/>제목 복사</button></div><p className="mt-1 text-xs text-muted">이미지 {imageCount}장 · 영상 {videoCount}개 · 원본 {formatBytes(totalSize)}</p></div></div></header>
    <div className="p-4 sm:p-6">
      {post.assets.length>0?<div className="image-rail">{post.assets.map((asset,assetIndex)=>{const video=isVideoAsset(asset);return <figure key={asset.id} className="reporter-image"><div className={`image-frame ${video?'video-frame':''}`}>{video?<video controls preload="metadata" src={asset.originalUrl} aria-label={`${post.title} ${assetIndex+1}번째 영상`}/>:<img loading="lazy" src={asset.thumbUrl} alt={`${post.title} ${assetIndex+1}번째 카드`}/>}<span>{assetIndex+1}</span>{video&&<i className="media-badge"><Film/>영상</i>}</div><div className={video?'grid':'grid grid-cols-2 gap-1.5'}>{!video&&<button className="button tiny ghost" onClick={()=>action(`copy-${asset.id}`,()=>copyImageToClipboard(asset.originalUrl),'이미지를 복사했습니다.')} disabled={working===`copy-${asset.id}`}><Copy/>복사</button>}<button className="button tiny ghost" onClick={()=>action(`down-${asset.id}`,()=>downloadAsset(asset),'원본 저장을 시작했습니다.')}><Download/>원본 저장</button></div></figure>})}</div>:<div className="empty-inline"><Images/><span>이 게시물에는 이미지나 영상이 없습니다.</span></div>}

      <section className="platform-delivery mt-4" aria-label="플랫폼 맞춤 배포">
        <div className="platform-heading"><div><b>어디에 올리나요?</b><span>플랫폼에 맞춰 원본 공유 순서를 자동으로 준비합니다.</span></div>{platform&&<strong>{SHARE_PLATFORMS.find((item)=>item.id===platform)?.label}</strong>}</div>
        <div className="platform-tabs" role="list" aria-label="SNS 플랫폼 선택">{SHARE_PLATFORMS.map((item)=><button key={item.id} type="button" className={platform===item.id?'selected':''} aria-pressed={platform===item.id} onClick={()=>setPlatform(item.id)}><i aria-hidden="true">{item.badge}</i><span>{item.label}</span></button>)}</div>
        {platform?<div className="platform-plan">
          <div className="platform-plan-copy"><div><b>{SHARE_PLATFORMS.find((item)=>item.id===platform)?.description}</b><p>{platformNotice(platform,post.assets)}</p></div><a className="button tiny ghost" href={SHARE_PLATFORMS.find((item)=>item.id===platform)?.website} target="_blank" rel="noreferrer"><ExternalLink/>열기</a></div>
          <div className="platform-copy-actions"><button className="button secondary" onClick={copyTitle}><Clipboard/>제목 복사</button><button className="button secondary" onClick={copyBody}><Clipboard/>{platform==='youtube'?'설명 복사':'본문 복사'}</button></div>
          {shareBatches.length>0?<div className="share-batch-list">{shareBatches.map((batch,batchIndex)=><div className="share-batch" key={batch.id}><span className={batch.mediaType}><b>{batch.label}</b><small>{batch.detail}</small></span><button className="button primary" onClick={()=>shareBatch(batchIndex)} disabled={working===`platform-share-${batch.id}`||working==='prepare'}>{working===`platform-share-${batch.id}`?<LoaderCircle className="animate-spin"/>:<Share2/>}{batch.mediaType==='video'?'영상 공유':'원본 공유'}</button></div>)}</div>:<div className="platform-empty"><Film/><span>공유할 영상이 없습니다. 다른 플랫폼을 선택해 주세요.</span></div>}
          <p className="platform-fallback">공유 앱에서 여러 원본을 받지 못하면 아래의 순차 복사 또는 개별 원본 저장을 이용하세요.</p>
        </div>:<div className="platform-placeholder"><Share2/><span>페이스북·고파스·인스타·유튜브·X·에타 중 하나를 선택하세요.</span></div>}
      </section>

      {pasteAssets.length>0&&<div className="paste-transfer mt-4">
        {!pasteMode?<div className="paste-start"><Copy/><div><b>이미지 순차 복사</b><span>전체 공유가 되지 않을 때 1번 이미지부터 순서대로 이어갑니다.</span></div><button className="button primary" onClick={startPaste} disabled={working.startsWith('paste-')}><Copy/>순차 복사 시작</button></div>
        :<div className="paste-sequence">
          <div className="paste-progress"><div><b>{pasteIndex>=pasteAssets.length?'모든 이미지를 복사했습니다.':`${pasteIndex+1}번 이미지를 복사할 차례입니다.`}</b><span>{pasteIndex>=pasteAssets.length?'SNS 작성창에서 마지막 이미지를 붙여넣으세요.':'SNS에 붙여넣고 이 페이지로 돌아와 다음 버튼을 누르세요.'}</span></div><strong>{Math.min(pasteIndex,pasteAssets.length)} / {pasteAssets.length}</strong></div>
          <div className="paste-thumbs">{pasteAssets.map((asset,assetIndex)=><button className={`${assetIndex<pasteIndex?'copied':''} ${assetIndex===pasteIndex?'current':''}`} onClick={()=>copyForPaste(assetIndex)} key={asset.id} title={`${assetIndex+1}번 이미지 복사`}><img src={asset.thumbUrl} alt=""/><i>{assetIndex<pasteIndex?<Check/>:assetIndex+1}</i></button>)}</div>
          <div className="paste-next">{pasteIndex<pasteAssets.length?<button className="button primary" onClick={()=>copyForPaste(pasteIndex)} disabled={working.startsWith('paste-')}><Copy/>{pasteIndex+1}번 이미지 복사</button>:<button className="button secondary" onClick={()=>{setPasteIndex(0);void copyForPaste(0);}}><RotateCcw/>처음부터 다시</button>}<button className="button ghost" onClick={()=>{setPasteMode(false);setPasteIndex(0);}}>복붙 모드 닫기</button></div>
        </div>}
        <p className="paste-note">한 번에 여러 이미지를 복사하면 운영체제가 첫 이미지만 유지합니다. 이 모드는 이미지를 한 장씩 복사하되 순서를 자동으로 기억합니다.</p>
      </div>}

      {post.assets.length>0&&<div className="original-status mt-3">{working==='prepare'?<LoaderCircle className="animate-spin"/>:<Check/>}<span>{preparedFiles?`${preparedFiles.length}개 원본을 임시 메모리에 준비했습니다.`:'원본을 임시 메모리에 준비하고 있습니다.'}</span>{prepareError&&<button className="text-button" onClick={()=>prepareOriginals()}>다시 준비</button>}</div>}

      <div className="asset-actions mt-4"><div className="origin-only">공유가 어려운 기기에서는 원본 ZIP이나 개별 저장을 이용할 수 있습니다.</div><div className="flex flex-1 flex-wrap justify-end gap-2"><button className="button ghost" disabled={!post.assets.length||working==='zip'} onClick={()=>action('zip',()=>downloadZip(post.assets,post.title),'ZIP 다운로드를 시작했습니다.')}><ImageDown/>전체 ZIP</button></div></div>

      <section className="copy-block mt-5"><div className="flex items-center justify-between gap-2"><b className="section-label">게시 본문</b><button className="button tiny secondary" onClick={copyBody}><Clipboard/>본문 복사</button></div><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{post.body}</p>{post.articleUrl&&<a className="article-link" href={post.articleUrl} target="_blank" rel="noreferrer"><ExternalLink/>기사 원문 열기</a>}{post.credits&&<p className="mt-4 whitespace-pre-wrap border-t border-line pt-4 text-xs leading-6 text-muted">{post.credits}</p>}</section>
    </div>
  </article>;
}

function PageState({icon,title,description,action}:{icon:React.ReactNode;title:string;description:string;action?:React.ReactNode}){return <main className="grid min-h-screen place-items-center bg-canvas p-5"><section className="panel max-w-md p-8 text-center"><span className="state-icon">{icon}</span><h1 className="mt-5 text-xl font-black">{title}</h1><p className="mt-2 text-sm leading-6 text-muted">{description}</p>{action&&<div className="mt-5">{action}</div>}</section></main>}
