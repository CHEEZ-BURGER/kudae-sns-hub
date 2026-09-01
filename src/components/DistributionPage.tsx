import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Clipboard, Copy, Download, ExternalLink, ImageDown, Images, LoaderCircle, RefreshCw, Share2, UserRound } from 'lucide-react';
import type { CompletionRecord, Distribution, DistributionPost } from '../types';
import { AppHeader } from './AppHeader';
import { copyImageToClipboard, downloadAsset, downloadZip, shareAssets } from '../lib/image-tools';
import { loadDistribution, saveCompletion } from '../lib/public-api';
import { formatBytes } from '../lib/workflow';

const platforms = ['Instagram', 'Facebook', 'X'];

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
  function notify(value: string) { setToast(value); setTimeout(()=>setToast(''), 2200); }

  if (loading) return <PageState icon={<LoaderCircle className="animate-spin"/>} title="배포 자료를 불러오는 중" description="이미지는 아직 내려받지 않고 목록만 확인하고 있습니다."/>;
  if (error || !data) return <PageState icon={<AlertCircle/>} title="링크를 열 수 없습니다" description={error || '만료되었거나 올바르지 않은 배포 링크입니다.'} action={<button className="button secondary" onClick={reload}><RefreshCw/>다시 시도</button>}/>;

  const imageCount = data.posts.reduce((sum, post) => sum + post.assets.length, 0);
  return <div className="min-h-screen bg-canvas text-ink"><AppHeader reporter/>
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-9 lg:px-8">
      <header className="reporter-hero"><div><p className="eyebrow">{data.issueNumber} SNS 배포</p><h1 className="mt-2 text-3xl font-black tracking-[-.035em] sm:text-4xl">{data.title}</h1><p className="mt-3 text-sm text-muted">게시물 {data.posts.length}개 · 이미지 {imageCount}장 · {new Date(data.publishedAt).toLocaleDateString('ko-KR')} 배포</p></div><div className="reporter-tip"><CheckCircle2/><p><b>업로드 후 완료 표시를 남겨주세요.</b><br/>담당자와 완료 시각이 편집부에 공유됩니다.</p></div></header>
      <div className="mt-6 space-y-6">{data.posts.map((post,index)=><ReporterPost key={post.id} post={post} index={index} token={token} completions={data.completions} setData={setData} notify={notify}/>)}</div>
      <footer className="py-10 text-center text-xs text-muted">고대신문 SNS 배포실 · 링크가 만료되면 배포 담당자에게 문의해 주세요.</footer>
    </main>{toast&&<div className="toast"><Check/>{toast}</div>}
  </div>;
}

type ReporterPostProps = { post: DistributionPost; index:number; token:string; completions:CompletionRecord[]; setData:React.Dispatch<React.SetStateAction<Distribution|null>>; notify:(value:string)=>void };

function ReporterPost({ post,index,token,completions,setData,notify }: ReporterPostProps) {
  const [optimized,setOptimized]=useState(true);
  const [working,setWorking]=useState('');
  const [names,setNames]=useState<Record<string,string>>({});
  const totalSize=useMemo(()=>post.assets.reduce((sum,asset)=>sum+asset.sizeBytes,0),[post.assets]);
  const postCompletions=completions.filter((record)=>record.postId===post.id);

  async function action(key:string,task:()=>Promise<void>,success:string){setWorking(key);try{await task();notify(success);}catch(error){notify(error instanceof Error?error.message:'작업에 실패했습니다.');}finally{setWorking('');}}
  async function copyText(){const full=[post.title,post.body,post.articleUrl,post.credits].filter(Boolean).join('\n\n');await navigator.clipboard.writeText(full);notify('본문을 복사했습니다.');}
  async function toggle(platform:string,completed:boolean){
    const existing=postCompletions.find((record)=>record.platform===platform);
    const assignee=names[platform]||existing?.assignee||'';
    if(completed&&!assignee.trim()){notify('담당자 이름을 먼저 입력해 주세요.');return;}
    setWorking(`complete-${platform}`);
    try{
      const result=await saveCompletion(token,post.id,platform,assignee,completed);
      setData((current)=>current?{...current,completions:result.completions}:current);notify(completed?`${platform} 업로드 완료를 기록했습니다.`:`${platform} 완료 표시를 취소했습니다.`);
    }catch(error){notify(error instanceof Error?error.message:'완료 기록에 실패했습니다.');}finally{setWorking('');}
  }

  return <article className="reporter-card">
    <header className="border-b border-line p-4 sm:p-6"><div className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-crimson text-xs font-black text-white">{index+1}</span><div><h2 className="text-lg font-black leading-7 sm:text-xl">{post.title}</h2><p className="mt-1 text-xs text-muted">이미지 {post.assets.length}장 · 원본 {formatBytes(totalSize)}</p></div></div></header>
    <div className="p-4 sm:p-6">
      {post.assets.length>0?<div className="image-rail">{post.assets.map((asset,assetIndex)=><figure key={asset.id} className="reporter-image"><div className="image-frame"><img loading="lazy" src={asset.thumbUrl} alt={`${post.title} ${assetIndex+1}번째 카드`}/><span>{assetIndex+1}</span></div><div className="grid grid-cols-2 gap-1.5"><button className="button tiny ghost" onClick={()=>action(`copy-${asset.id}`,()=>copyImageToClipboard(optimized&&asset.optimizedUrl?asset.optimizedUrl:asset.originalUrl),'이미지를 복사했습니다.')} disabled={working===`copy-${asset.id}`}><Copy/>복사</button><button className="button tiny ghost" onClick={()=>action(`down-${asset.id}`,()=>downloadAsset(asset,optimized),'다운로드를 시작했습니다.')}><Download/>저장</button></div></figure>)}</div>:<div className="empty-inline"><Images/><span>이 게시물에는 이미지가 없습니다.</span></div>}

      <div className="asset-actions mt-4"><div className="segmented"><button className={optimized?'active':''} onClick={()=>setOptimized(true)}>SNS 최적화</button><button className={!optimized?'active':''} onClick={()=>setOptimized(false)}>원본</button></div><div className="flex flex-1 flex-wrap justify-end gap-2"><button className="button secondary" disabled={!post.assets.length||working==='share'} onClick={()=>action('share',()=>shareAssets(post.assets,optimized,post.title),'공유창을 열었습니다.')}><Share2/>전체 공유</button><button className="button ghost" disabled={!post.assets.length||working==='zip'} onClick={()=>action('zip',()=>downloadZip(post.assets,optimized,post.title),'ZIP 다운로드를 시작했습니다.')}><ImageDown/>전체 ZIP</button></div></div>

      <section className="copy-block mt-5"><div className="flex items-center justify-between gap-2"><b className="section-label">게시 본문</b><button className="button tiny secondary" onClick={copyText}><Clipboard/>본문 복사</button></div><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{post.body}</p>{post.articleUrl&&<a className="article-link" href={post.articleUrl} target="_blank" rel="noreferrer"><ExternalLink/>기사 원문 열기</a>}{post.credits&&<p className="mt-4 whitespace-pre-wrap border-t border-line pt-4 text-xs leading-6 text-muted">{post.credits}</p>}</section>

      <section className="completion-block mt-5"><div className="mb-3"><b className="section-label">업로드 완료 기록</b><p className="mt-1 text-xs text-muted">플랫폼별 담당자 이름을 적고 완료를 체크해 주세요.</p></div><div className="space-y-2">{platforms.map((platform)=>{const record=postCompletions.find((item)=>item.platform===platform);return <div className={`completion-row ${record?'completed':''}`} key={platform}><span className="platform-name">{platform}</span><label className="assignee"><UserRound/><input value={names[platform]??record?.assignee??''} disabled={Boolean(record)} onChange={(event)=>setNames((current)=>({...current,[platform]:event.target.value}))} placeholder="담당자"/></label><label className="check-label"><input type="checkbox" checked={Boolean(record)} disabled={working===`complete-${platform}`} onChange={(event)=>toggle(platform,event.target.checked)}/><span>{record?'완료':'미완료'}</span></label>{record&&<time>{new Date(record.completedAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time>}</div>})}</div></section>
    </div>
  </article>;
}

function PageState({icon,title,description,action}:{icon:React.ReactNode;title:string;description:string;action?:React.ReactNode}){return <main className="grid min-h-screen place-items-center bg-canvas p-5"><section className="panel max-w-md p-8 text-center"><span className="state-icon">{icon}</span><h1 className="mt-5 text-xl font-black">{title}</h1><p className="mt-2 text-sm leading-6 text-muted">{description}</p>{action&&<div className="mt-5">{action}</div>}</section></main>}
