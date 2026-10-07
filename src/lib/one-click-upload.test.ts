import { describe, expect, it } from 'vitest';
import { uploadContent, nextPostAfterTransfer } from '../../extension/shared/upload-content.mjs';
import { buildSNSJob } from './extension-bridge';
import type { DistributionPost } from '../types';

const post = { id:'post-1', category:'보도', title:'[보도] 탄소중립 과제', body:'기사 본문\n\n전문을 읽으실 수 있습니다.\n글 | 기자', articleUrl:'https://www.kunews.ac.kr/news/test', credits:'',
  assets:[{ id:'asset-1',filename:'원본1.png',mimeType:'image/png',sizeBytes:100,originalUrl:'https://bcqqokdehkfaiuquktag.supabase.co/functions/v1/media-redirect?id=fixture',thumbUrl:'',position:0 }] } as DistributionPost;
const pending = { jobId:'job-1',count:2,index:0,postId:'post-1',currentPostId:'post-1' };
const complete = { type:'SNS_UPLOAD_COMPLETE',payload:{jobId:'job-1',count:2,contentInserted:true} };

describe('한 번에 글과 원본 전달',()=>{
  it('고파스 제목에는 고대신문 분류를 붙이고 본문과 분리한다',()=>{
    const result=uploadContent(post,'koreapas');
    expect(result.contentMode).toBe('separate');
    expect(result.title).toBe('[고대신문 보도] 탄소중립 과제');
    expect(result.body).not.toContain('[보도]');
    expect(result.body.indexOf(post.articleUrl)).toBeLessThan(result.body.indexOf('글 | 기자'));
  });
  it('분리형 에타/Studio와 통합형 Facebook/Instagram/X/YouTube를 구분한다',()=>{
    expect(uploadContent(post,'everytime').contentMode).toBe('separate');
    expect(uploadContent(post,'youtube',true).contentMode).toBe('separate');
    for(const target of ['instagram','facebook','x','youtube']) {
      expect(uploadContent(post,target).caption).toMatch(/^\[보도\] 탄소중립 과제\n\n기사 본문/);
      expect(uploadContent(post,target).contentMode).toBe('caption');
    }
  });
  it('원본 URL, 파일 수와 글 식별자를 유지한다',()=>{
    const job=buildSNSJob(post,'facebook');
    expect(job.assets[0].url).toBe(post.assets[0].originalUrl);
    expect(job.postId).toBe(post.id);
    expect(job.caption).toContain('글 | 기자');
  });
  it('플랫폼 한도를 넘는 파일이나 혼합 미디어를 조용히 누락하지 않는다',()=>{
    expect(()=>buildSNSJob({...post,assets:Array(5).fill(post.assets[0])},'x')).toThrow('4장');
    expect(()=>buildSNSJob({...post,assets:Array(11).fill(post.assets[0])},'youtube')).toThrow('10장');
    expect(()=>buildSNSJob({...post,assets:[...post.assets,{...post.assets[0],mimeType:'video/mp4'}]},'facebook')).toThrow('영상');
  });
});
describe('전달 성공 후 다음 글',()=>{
  it('이미지 수와 글 입력 성공을 확인한 일치 작업만 다음 글로 이동한다',()=>{
    expect(nextPostAfterTransfer(0,3,pending,complete)).toBe(1);
  });
  it.each(['SNS_UPLOAD_ACK','SNS_UPLOAD_PROGRESS','SNS_UPLOAD_ERROR'])('%s에서는 이동하지 않는다',(type)=>{
    expect(nextPostAfterTransfer(0,3,pending,{...complete,type})).toBe(0);
  });
  it('일부 파일, 본문 실패, 취소, 오래된 완료 이벤트를 무시한다',()=>{
    for(const payload of [{...complete.payload,count:1},{...complete.payload,contentInserted:false},{...complete.payload,jobId:'old-job'}]) {
      expect(nextPostAfterTransfer(0,3,pending,{...complete,payload})).toBe(0);
    }
    expect(nextPostAfterTransfer(0,3,null,complete)).toBe(0);
    expect(nextPostAfterTransfer(0,3,{...pending,currentPostId:'changed'},complete)).toBe(0);
  });
  it('마지막 글은 첫 글로 되돌아가지 않는다',()=>{
    expect(nextPostAfterTransfer(2,3,{...pending,index:2},complete)).toBe(2);
  });
});
