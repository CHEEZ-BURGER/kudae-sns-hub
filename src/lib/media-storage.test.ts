import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({from:vi.fn(),remove:vi.fn(),upload:vi.fn(),signed:vi.fn()}));
vi.mock('./supabase',()=>({requireSupabase:()=>({from:mocks.from,auth:{getSession:async()=>({data:{session:{access_token:'test-admin-jwt'}}})},storage:{from:()=>({remove:mocks.remove,upload:mocks.upload,createSignedUrls:mocks.signed})}}),edgeFunctionUrl:()=> 'https://test.supabase.co/functions/v1/media-admin',publishableKey:()=> 'test-public-key'}));
import {previewMedia,removeMedia,uploadMedia} from './media-storage';
beforeEach(()=>{vi.clearAllMocks();mocks.remove.mockResolvedValue({error:null});});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('업로드 정리의 원본 보호',()=>{
  it('저장 응답이 유실되어도 DB에 연결된 원본은 삭제하지 않는다',async()=>{
    mocks.from.mockImplementation(()=>{
      const chain={select:()=>chain,eq:(_column:string,path:string)=>{chain.limit.mockResolvedValue({data:path==='live/original'?[{id:'live'}]:[],error:null});return chain;},limit:vi.fn()};
      return chain;
    });
    await removeMedia(['live/original','unused/original','unused/original']);
    expect(mocks.remove).toHaveBeenCalledWith(['unused/original']);
  });
  it('DB 참조 확인에 실패하면 파일 삭제를 시도하지 않는다',async()=>{
    mocks.from.mockReturnValue({select:()=>({eq:()=>({limit:async()=>({data:null,error:new Error('network')})})})});
    await expect(removeMedia(['maybe-committed'])).rejects.toThrow('network');
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe('R2와 기존 배포 호환',()=>{
  it('기본값은 기존 Supabase 업로드를 유지한다',async()=>{
    vi.stubEnv('VITE_MEDIA_BACKEND','supabase');
    mocks.upload.mockResolvedValue({error:null});
    const body=new Blob(['original']);
    expect(await uploadMedia('user/file.png',body,'image/png')).toBe('user/file.png');
    expect(mocks.upload).toHaveBeenCalledWith('user/file.png',body,{contentType:'image/png',upsert:false});
  });
  it('R2에는 원본 바이트를 직접 보내고 크기/형식 검증 후 경로를 반환한다',async()=>{
    vi.stubEnv('VITE_MEDIA_BACKEND','r2');
    const body=new Blob(['original-bytes']);
    const fetchMock=vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({storedPath:'r2:user/file.png',uploadUrl:'https://test.r2.cloudflarestorage.com/put'})))
      .mockResolvedValueOnce(new Response(null,{status:200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({verified:true})));
    vi.stubGlobal('fetch',fetchMock);
    expect(await uploadMedia('user/file.png',body,'image/png')).toBe('r2:user/file.png');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).backend).toBe('r2');
    expect(fetchMock.mock.calls[1][1].body).toBe(body);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({action:'verify',path:'r2:user/file.png',sizeBytes:body.size,contentType:'image/png'});
  });
  it('검증 실패 시 R2 파일이 정상 저장됐다고 반환하지 않는다',async()=>{
    vi.stubEnv('VITE_MEDIA_BACKEND','r2');
    vi.stubGlobal('fetch',vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({storedPath:'r2:user/file.png',uploadUrl:'https://test.r2.cloudflarestorage.com/put'})))
      .mockResolvedValueOnce(new Response())
      .mockResolvedValueOnce(new Response(JSON.stringify({error:'크기 불일치'}),{status:409})));
    await expect(uploadMedia('user/file.png',new Blob(['bytes']),'image/png')).rejects.toThrow('크기 불일치');
  });
  it('기존 썸네일만 Supabase에 요청하고 R2/AWS 썸네일은 외부 경로로 준비한다',async()=>{
    mocks.signed.mockResolvedValue({data:[{path:'old/thumb',signedUrl:'https://old/thumb'}],error:null});
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({urls:[{path:'r2:user/thumb',url:'https://r2/thumb'},{path:'s3:user/thumb',url:'https://aws/thumb'}]})));
    vi.stubGlobal('fetch',fetchMock);
    const urls=await previewMedia(['old/thumb','r2:user/thumb','s3:user/thumb']);
    expect(mocks.signed).toHaveBeenCalledWith(['old/thumb'],3600);
    expect(urls.size).toBe(3);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).paths).toEqual(['r2:user/thumb','s3:user/thumb']);
  });
});
