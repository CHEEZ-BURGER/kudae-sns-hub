import { createClient } from 'npm:@supabase/supabase-js@2';
import { mediaSignature } from '../_shared/aws-media.ts';
import { externalMediaUrl } from '../_shared/external-media.ts';
import { isExternalMediaPath } from '../_shared/media-paths.ts';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'range, content-type'};
const error=(message:string,status:number)=>new Response(JSON.stringify({error:message}),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async(request)=>{
  if(request.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(!['GET','HEAD'].includes(request.method))return error('허용되지 않은 요청입니다.',405);
  const url=new URL(request.url);
  const id=url.searchParams.get('id')||'';
  const kind=url.searchParams.get('kind')||'';
  const expires=Number(url.searchParams.get('expires'));
  const sig=url.searchParams.get('sig')||'';
  const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if(!/^[0-9a-f-]{36}$/i.test(id)||!['original','thumb'].includes(kind)||!Number.isInteger(expires)||expires<Math.floor(Date.now()/1000)||expires>Math.floor(Date.now()/1000)+3660||!/^[a-f0-9]{64}$/.test(sig))return error('원본 링크가 만료됐습니다. 배포를 다시 열어 주세요.',403);
  const expected=await mediaSignature(secret,id,kind,expires);
  let difference=0; for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^sig.charCodeAt(i);
  if(difference)return error('파일 접근 권한이 없습니다.',403);
  try{
    const client=createClient(Deno.env.get('SUPABASE_URL')!,secret);
    const {data:asset,error:assetError}=await client.from('assets').select('post_id,original_path,thumbnail_path').eq('id',id).maybeSingle();
    if(assetError)throw assetError;
    if(!asset)return error('삭제된 파일입니다.',404);
    const {data:post,error:postError}=await client.from('posts').select('publication_id').eq('id',asset.post_id).single();
    if(postError)throw postError;
    const {data:publication,error:publicationError}=await client.from('publications').select('status,expires_at').eq('id',post.publication_id).single();
    if(publicationError)throw publicationError;
    if(publication.status!=='published'||(publication.expires_at&&new Date(publication.expires_at).getTime()<Date.now()))return error('만료된 배포입니다.',410);
    const path=kind==='original'?asset.original_path:asset.thumbnail_path;
    if(!path || !isExternalMediaPath(path))return error('외부 저장소 파일이 아닙니다.',404);
    // Return only a redirect. Image/video bytes must never pass through Supabase.
    return new Response(null,{status:302,headers:{...cors,Location:await externalMediaUrl(path),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }catch(err){console.error('Media redirect failed',err);return error('원본을 불러오지 못했습니다.',503);}
});
