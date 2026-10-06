import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks=vi.hoisted(()=>({
  client:{auth:{getUser:vi.fn()},from:vi.fn(),rpc:vi.fn()},
  upload:vi.fn(),remove:vi.fn(),previews:vi.fn(),resize:vi.fn(),
}));
vi.mock('./supabase',()=>({requireSupabase:()=>mocks.client}));
vi.mock('./media-storage',()=>({uploadMedia:mocks.upload,removeMedia:mocks.remove,previewMedia:mocks.previews}));
vi.mock('./image-tools',()=>({resizeImage:mocks.resize}));
import { loadAdminPublication, publishDistribution } from './publish';
import type { DraftPost } from '../types';

const unchanged={id:'asset-keep',order:0,previewUrl:'/thumb',stored:{filename:'keep.jpg',mimeType:'image/jpeg',sizeBytes:5000000,originalPath:'keep/original.jpg',thumbnailPath:'keep/thumb.jpg',optimizedPath:null}};
const post=():DraftPost=>({id:'post-1',groupName:'보도',category:'보도',sectionId:'',confidence:1,title:'제목',body:'본문',articleUrl:'',credits:'',assets:[unchanged]});
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.client.auth.getUser.mockResolvedValue({data:{user:{id:'admin'}}});
  mocks.client.from.mockReturnValue({select:()=>({order:()=>Promise.resolve({data:[],error:null})})});
  mocks.client.rpc.mockResolvedValue({data:{share_token:'same-share-token',obsolete_paths:[]},error:null});
  mocks.upload.mockImplementation(async(path:string)=>path);
  mocks.remove.mockResolvedValue(undefined);
  mocks.resize.mockResolvedValue(new Blob(['thumb'],{type:'image/jpeg'}));
});

describe('사진 편집의 전송량과 저장 실패 보호',()=>{
  it('기존 원본만 있는 수정은 업로드·원본 다운로드 없이 같은 링크로 저장한다',async()=>{
    const result=await publishDistribution({issueNumber:'2047호',title:'카드뉴스',posts:[post()],existingPublicationId:'publication',expectedUpdatedAt:'revision'});
    expect(result.token).toBe('same-share-token');
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.resize).not.toHaveBeenCalled();
    expect(mocks.client.rpc.mock.calls[0][1].p_posts[0].assets[0]).toMatchObject({id:'asset-keep',retained:true,original_path:'keep/original.jpg'});
    expect(mocks.client.rpc.mock.calls[0][1].p_expected_updated_at).toBe('revision');
  });
  it('한 장 추가 시 새 원본과 썸네일만 업로드하고 삭제된 원본만 정리한다',async()=>{
    const value=post();
    value.assets.push({id:'asset-new',file:new File(['photo'],'new.jpg',{type:'image/jpeg'}),previewUrl:'blob:new',order:1});
    mocks.client.rpc.mockResolvedValue({data:{share_token:'same-share-token',obsolete_paths:['old/original.jpg','old/thumb.jpg']},error:null});
    await publishDistribution({issueNumber:'2047호',title:'카드뉴스',posts:[value],existingPublicationId:'publication',expectedUpdatedAt:'revision'});
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.upload.mock.calls.every(([path])=>path.includes('/asset-new/'))).toBe(true);
    expect(mocks.remove).toHaveBeenCalledWith(['old/original.jpg','old/thumb.jpg']);
    expect(mocks.client.rpc.mock.calls[0][1].p_posts[0].assets).toHaveLength(2);
  });
  it('충돌하면 새 업로드만 정리하고 기존 파일은 보존한다',async()=>{
    const value=post();
    value.assets.push({id:'asset-new',file:new File(['photo'],'new.jpg',{type:'image/jpeg'}),previewUrl:'blob:new',order:1});
    mocks.client.rpc.mockResolvedValue({data:null,error:{message:'EDIT_CONFLICT'}});
    await expect(publishDistribution({issueNumber:'2047호',title:'카드뉴스',posts:[value],existingPublicationId:'publication',expectedUpdatedAt:'revision'})).rejects.toThrow('다른 관리자가');
    const cleaned=mocks.remove.mock.calls[0][0];
    expect(cleaned).toHaveLength(2);
    expect(cleaned.every((path:string)=>path.includes('/asset-new/'))).toBe(true);
    expect(cleaned).not.toContain('keep/original.jpg');
  });
  it('수정 화면은 썸네일만 요청하고 원본·영상을 내려받지 않는다',async()=>{
    const queue=[
      {data:{id:'pub',issue_number:'2047호',title:'카드뉴스',share_token:'token',updated_at:'rev'},error:null},
      {data:[{id:'post-1',category:'보도',title:'제목',body:'본문',group_name:'그룹',position:0}],error:null},
      {data:[{id:'a',post_id:'post-1',filename:'photo.jpg',mime_type:'image/jpeg',size_bytes:999999,original_path:'large/photo',thumbnail_path:'small/thumb',position:0},{id:'v',post_id:'post-1',filename:'video.mp4',mime_type:'video/mp4',size_bytes:50000000,original_path:'large/video',thumbnail_path:'large/video',position:1}],error:null},
    ];
    mocks.client.from.mockImplementation(()=>{
      const result=queue.shift();
      const chain={select:()=>chain,eq:()=>chain,in:()=>chain,order:()=>Promise.resolve(result),single:()=>Promise.resolve(result)};
      return chain;
    });
    mocks.previews.mockResolvedValue(new Map([['small/thumb','https://preview']]));
    const editable=await loadAdminPublication('pub');
    expect(mocks.previews).toHaveBeenCalledWith(['small/thumb']);
    expect(editable.posts[0].assets[0].file).toBeUndefined();
    expect(editable.posts[0].assets[0].stored?.sizeBytes).toBe(999999);
    expect(editable.posts[0].assets[1].previewUrl).toBe('');
    expect(editable.updatedAt).toBe('rev');
  });
});
