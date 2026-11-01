import {afterEach,expect,it,vi} from 'vitest'

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done});return{promise,resolve}}
async function fixture(){
 vi.resetModules()
 const stored=new Map<string,Response>(),cache={put:vi.fn(async(url:string,response:Response)=>{stored.set(url,response)}),delete:vi.fn(async(request:string|Request)=>stored.delete(typeof request==='string'?request:request.url)),keys:vi.fn(async()=>[] as Request[]),match:vi.fn(async(request:string|Request)=>stored.get(typeof request==='string'?request:request.url)?.clone())}
 const open=vi.fn(async()=>cache);vi.stubGlobal('location',{origin:'https://fixture.invalid'});vi.stubGlobal('caches',{open})
 return{...await import('./brushAssetCache'),cache,open,stored}
}
it.each(['open','put'] as const)('skips busy writes before copying while %s is held, with no delayed queue',async stage=>{
 const f=await fixture(),hold=deferred(),firstBytes=new Uint8Array([1,2,3,4])
 if(stage==='open')f.open.mockImplementationOnce(async()=>{await hold.promise;return f.cache})
 else f.cache.put.mockImplementationOnce(async(url,response)=>{await hold.promise;f.stored.set(url,response)})
 const first=f.cacheBrushAsset('first',firstBytes),pending:Promise<void>[]=[]
 try{
  if(stage==='put')await vi.waitFor(()=>expect(f.cache.put).toHaveBeenCalledOnce())
  const busy=new Uint8Array([9,8,7,6]),slice=vi.spyOn(busy,'slice')
  for(let i=0;i<64;i++)pending.push(f.cacheBrushAsset('busy'+i,busy))
  expect(slice).not.toHaveBeenCalled()
 }finally{hold.resolve();await Promise.all([first,...pending])}
 expect(f.open).toHaveBeenCalledOnce();expect(f.cache.put).toHaveBeenCalledOnce()
 await f.cacheBrushAsset('next',new Uint8Array([5,6,7,8]));expect(f.cache.put).toHaveBeenCalledTimes(2)
})
it('captures an accepted write snapshot before callers mutate the input',async()=>{
 const f=await fixture(),hold=deferred();f.open.mockImplementationOnce(async()=>{await hold.promise;return f.cache})
 const bytes=new Uint8Array([1,2,3,4]),work=f.cacheBrushAsset('snapshot',bytes);bytes.fill(9);hold.resolve();await work
 const response=f.stored.get('https://fixture.invalid/__brush_asset_cache/snapshot')!
 expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1,2,3,4]);expect(response.headers.get('Content-Length')).toBe('4')
})
it.each(['open','put','keys'] as const)('contains optional %s failure and admits the next write',async stage=>{
 const f=await fixture();
 if(stage==='open')f.open.mockRejectedValueOnce(Error('private mode'))
 else if(stage==='put')f.cache.put.mockRejectedValueOnce(Error('quota'))
 else f.cache.keys.mockRejectedValueOnce(Error('enumeration failed'))
 await expect(f.cacheBrushAsset('failed',new Uint8Array([1]))).resolves.toBeUndefined()
 await expect(f.cacheBrushAsset('next',new Uint8Array([2]))).resolves.toBeUndefined()
 expect(f.stored.has('https://fixture.invalid/__brush_asset_cache/next')).toBe(true)
})
it('keeps existing exact CAS backing when replacement put fails',async()=>{
 const f=await fixture(),url='https://fixture.invalid/__brush_asset_cache/existing';f.stored.set(url,new Response(new Uint8Array([1,2,3,4])))
 f.cache.put.mockRejectedValueOnce(Error('quota'))
 await f.cacheBrushAsset('existing',new Uint8Array([1,2,3,4]))
 expect(f.cache.delete).not.toHaveBeenCalled();expect([...new Uint8Array(await f.stored.get(url)!.arrayBuffer())]).toEqual([1,2,3,4])
})
it('contains snapshot-copy failure and releases writer admission',async()=>{
 const f=await fixture(),bytes=new Uint8Array([1]),slice=vi.spyOn(bytes,'slice').mockImplementation(()=>{throw Error('copy failed')})
 await expect(f.cacheBrushAsset('failed',bytes)).resolves.toBeUndefined();slice.mockRestore()
 await f.cacheBrushAsset('next',bytes);expect(f.cache.put).toHaveBeenCalledOnce()
})
it.each(['caches','location'] as const)('does not copy or access browser storage when %s is absent',async missing=>{
 const f=await fixture();vi.stubGlobal(missing,undefined);const bytes=new Uint8Array([1]),slice=vi.spyOn(bytes,'slice')
 await f.cacheBrushAsset('absent',bytes);expect(slice).not.toHaveBeenCalled();expect(f.open).not.toHaveBeenCalled();expect(await f.cachedBrushAsset('absent')).toBeNull()
})
it('keeps existing disk byte-limit eviction after successful publication',async()=>{
 const f=await fixture(),requests=['old-a','old-b','new'].map(hash=>new Request('https://fixture.invalid/__brush_asset_cache/'+hash))
 f.cache.keys.mockResolvedValueOnce(requests)
 f.cache.match.mockImplementation(async()=>new Response(null,{headers:{'Content-Length':String(100*1024*1024)}}))
 await f.cacheBrushAsset('new',new Uint8Array([1]))
 expect(f.cache.put).toHaveBeenCalledOnce();expect(f.cache.delete.mock.calls.map(([request])=>request)).toEqual(requests.slice(0,2))
})
