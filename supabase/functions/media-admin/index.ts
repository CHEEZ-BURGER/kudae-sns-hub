import { createClient } from 'npm:@supabase/supabase-js@2';
import { S3Client, PutObjectCommand, DeleteObjectsCommand } from 'npm:@aws-sdk/client-s3@3.1146.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.1146.0';
import { awsMediaConfigured, cloudFrontMediaUrl } from '../_shared/aws-media.ts';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async(request)=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(request.method!=='POST')return json({error:'허용되지 않은 요청입니다.'},405);
  try{
    const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
    const {data:user,error:authError}=await service.auth.getUser(jwt);
    if(authError||!user.user)return json({error:'관리자 로그인이 필요합니다.'},401);
    const {data:profile}=await service.from('profiles').select('is_admin').eq('id',user.user.id).single();
    if(!profile?.is_admin)return json({error:'관리자 권한이 필요합니다.'},403);
    if(!awsMediaConfigured())return json({error:'AWS 계정 연결이 완료되지 않았습니다.'},503);
    const input=await request.json();
    const bucket=Deno.env.get('SNS_S3_BUCKET')!;
    const s3=new S3Client({region:Deno.env.get('SNS_AWS_REGION')!,requestChecksumCalculation:'WHEN_REQUIRED',credentials:{accessKeyId:Deno.env.get('SNS_AWS_ACCESS_KEY_ID')!,secretAccessKey:Deno.env.get('SNS_AWS_SECRET_ACCESS_KEY')!}});
    if(input.action==='upload'){
      const path=String(input.path||'');
      if(!/^[a-z0-9/._-]+$/i.test(path)||path.includes('..')||!path.startsWith(user.user.id+'/')||path.split('/').length!==5)return json({error:'업로드 경로가 올바르지 않습니다.'},400);
      const size=Number(input.sizeBytes);
      if(!Number.isInteger(size)||size<=0||size>500*1024*1024)return json({error:'파일은 500MB 이하여야 합니다.'},400);
      const mime=String(input.contentType||'');
      if(!/^(image\/(jpeg|png|webp|gif|avif|svg\+xml)|video\/(mp4|webm|quicktime|x-m4v))$/.test(mime))return json({error:'지원하지 않는 파일 형식입니다.'},400);
      const uploadUrl=await getSignedUrl(s3,new PutObjectCommand({Bucket:bucket,Key:path,ContentType:mime,ContentLength:size,CacheControl:'public, max-age=86400, immutable'}),{expiresIn:900});
      return json({storedPath:'s3:'+path,uploadUrl});
    }
    const paths=Array.isArray(input.paths)?[...new Set(input.paths)] as string[]:[];
    if(!paths.length||paths.length>500||paths.some((path)=>typeof path!=='string'||!path.startsWith('s3:')||!/^[a-z0-9/._-]+$/i.test(path.slice(3))||path.includes('..')))return json({error:'파일 목록을 확인해 주세요.'},400);
    if(input.action==='preview'){
      const urls=[];
      for(const path of paths){
        const {data:asset,error}=await service.from('assets').select('id').eq('thumbnail_path',path).limit(1).maybeSingle();
        if(error)throw error;
        if(!asset)return json({error:'등록된 미리보기 파일이 아닙니다.'},404);
        urls.push({path,url:cloudFrontMediaUrl(path)});
      }
      return json({urls});
    }
    if(input.action==='delete'){
      // Only remove objects no longer referenced by any live publication.
      for(const path of paths){
        for(const column of ['original_path','thumbnail_path','optimized_path']){
          const {data:references,error}=await service.from('assets').select('id').eq(column,path).limit(1);
          if(error)throw error;
          if(references?.length)return json({error:'배포 중인 파일은 삭제할 수 없습니다.'},409);
        }
      }
      const response=await s3.send(new DeleteObjectsCommand({Bucket:bucket,Delete:{Objects:paths.map((path)=>({Key:path.slice(3)})),Quiet:true}}));
      if(response.Errors?.length)throw new Error('S3 객체 삭제 실패');
      return json({deleted:paths.length});
    }
    return json({error:'알 수 없는 요청입니다.'},400);
  }catch(error){console.error('Media admin failed',error);return json({error:'AWS 파일 처리를 완료하지 못했습니다.'},500);}
});
