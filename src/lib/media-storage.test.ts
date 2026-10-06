import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({from:vi.fn(),remove:vi.fn()}));
vi.mock('./supabase',()=>({requireSupabase:()=>({from:mocks.from,storage:{from:()=>({remove:mocks.remove})}}),edgeFunctionUrl:vi.fn(),publishableKey:vi.fn()}));
import {removeMedia} from './media-storage';
beforeEach(()=>{vi.clearAllMocks();mocks.remove.mockResolvedValue({error:null});});
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
