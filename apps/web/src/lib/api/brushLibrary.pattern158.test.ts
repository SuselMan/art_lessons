import{it,expect,vi,afterEach}from'vitest'
import{createHash}from'node:crypto'
import type{BrushPattern}from'@grafetto/shared'
import{library158}from'../../../../../packages/shared/src/experimentPattern158.testFixture'
const request=vi.hoisted(()=>vi.fn())
vi.mock('./api',()=>({apiResponse:async()=>Response.json(await request()),apiPath:(_key:string,options:{params:{hash:string}})=>`/assets/${options.params.hash}`}))
afterEach(()=>vi.unstubAllGlobals())
it('known preset still refreshes and fetches NEW source CAS through same verifier, warm repeated context needs no download',async()=>{
 vi.resetModules();const library=library158(),pixels=new Uint8Array(16);pixels[4]=255;const hash=createHash('sha256').update(pixels).digest('hex'),id=`asset:${hash}`as const,pattern:BrushPattern={version:1,kind:'rgba',alpha:id,planes:[id,id,id],side:4,sourceRect:{x:0,y:1,width:3,height:2},sampling:'world-repeat-nearest-v1'},next={...library,assets:[{id,size:4,file:hash+'.bin'}]}
 request.mockResolvedValueOnce(library).mockResolvedValueOnce(next);const fetch=vi.fn(async()=>new Response(pixels));vi.stubGlobal('fetch',fetch)
 const api=await import('./brushLibrary');api.setBrushRoomScope('pattern-own');await api.loadBrushLibrary();const preset=`brush:${library.brushes[0].descriptor.id}@158`;expect(api.prepareBrushPresets([preset])).toBeNull()
 await api.prepareBrushPresets([preset],[{version:1,pattern}]);expect(request).toHaveBeenCalledTimes(2);expect(fetch).toHaveBeenCalledOnce();expect(api.prepareBrushPresets([preset],[{version:1,pattern}])).toBeNull();expect(fetch).toHaveBeenCalledOnce();api.setBrushRoomScope(undefined)
})
