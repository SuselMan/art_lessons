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
 await f.cacheBrushAsset('absent',bytes);expect(slice).not.toHaveBeenCalled();expect(f.open).not.toHaveBeenCalled();expect(await f.cachedBrushAsset('absent',4)).toBeNull()
})
it('keeps existing disk byte-limit eviction after successful publication',async()=>{
 const f=await fixture(),requests=['old-a','old-b','new'].map(hash=>new Request('https://fixture.invalid/__brush_asset_cache/'+hash))
 f.cache.keys.mockResolvedValueOnce(requests)
 f.cache.match.mockImplementation(async()=>new Response(null,{headers:{'Content-Length':String(100*1024*1024)}}))
 await f.cacheBrushAsset('new',new Uint8Array([1]))
 expect(f.cache.put).toHaveBeenCalledOnce();expect(f.cache.delete.mock.calls.map(([request])=>request)).toEqual(requests.slice(0,2))
})


it('rejects actual oversized cache body without invoking unbounded arrayBuffer',async()=>{
 const f=await fixture(),response=new Response(new Uint8Array([1,2,3,4,5])),unbounded=vi.spyOn(response,'arrayBuffer')
 f.cache.match.mockResolvedValueOnce(response)
 expect(await Reflect.apply(f.cachedBrushAsset,undefined,['oversize',4])).toBeNull()
 expect(unbounded).not.toHaveBeenCalled();expect(response.body!.locked).toBe(false)
})

function streamFixture(chunks:Uint8Array[],headers:Record<string,string>={}){
 let index=0,cancelled:unknown[]=[]
 const stream=new ReadableStream<Uint8Array>({pull(controller){if(index<chunks.length)controller.enqueue(chunks[index++]);else controller.close()},cancel(reason){cancelled.push(reason)}},{highWaterMark:0})
 const response=new Response(stream,{headers}),unbounded=vi.spyOn(response,'arrayBuffer')
 return{response,stream,cancelled,unbounded}
}
it.each([undefined,'999999999','1','invalid'])('reads exact chunked/view bytes to actual EOF with advisory Content-Length=%s',async header=>{
 const f=await fixture(),backing=new Uint8Array([8,1,2,3,4,9]),x=streamFixture([backing.subarray(1,3),new Uint8Array(0),backing.subarray(3,5)],header===undefined?{}:{'Content-Length':header})
 const data=await f.readExactBrushAssetBody(x.response,4);backing.fill(0)
 expect([...data]).toEqual([1,2,3,4]);expect(data.byteLength).toBe(4);expect(x.unbounded).not.toHaveBeenCalled();expect(x.cancelled).toHaveLength(0);expect(x.stream.locked).toBe(false)
})
it.each(['first-oversize','trailing','truncated','empty']as const)('rejects %s and cancels/unlocks actual stream',async kind=>{
 const f=await fixture(),chunks=kind==='first-oversize'?[new Uint8Array(5)]:kind==='trailing'?[new Uint8Array(4),new Uint8Array(1)]:kind==='truncated'?[new Uint8Array(3)]:[],x=streamFixture(chunks)
 await expect(f.readExactBrushAssetBody(x.response,4)).rejects.toThrow(/size mismatch/)
 // Cancellation after already-closed short EOF is still attempted by the
 // reader, but the underlying source cancel hook need not run on closed state.
 if(kind==='first-oversize'||kind==='trailing')expect(x.cancelled).toHaveLength(1)
 expect(x.stream.locked).toBe(false);expect(x.unbounded).not.toHaveBeenCalled()
})
it('does not mistake expected byte count for EOF',async()=>{
 const f=await fixture();let controller!:ReadableStreamDefaultController<Uint8Array>,settled=false
 const stream=new ReadableStream<Uint8Array>({start(c){controller=c}}),response=new Response(stream),work=f.readExactBrushAssetBody(response,4).finally(()=>{settled=true})
 controller.enqueue(new Uint8Array([1,2,3,4]));await Promise.resolve();await Promise.resolve();expect(settled).toBe(false)
 controller.enqueue(new Uint8Array([5]));await expect(work).rejects.toThrow(/size mismatch/);expect(stream.locked).toBe(false)
})
it('preserves actual read rejection and releases reader lock',async()=>{
 const f=await fixture(),fault=new DOMException('fetch timeout','AbortError'),stream=new ReadableStream<Uint8Array>({pull(c){c.error(fault)}}),response=new Response(stream)
 await expect(f.readExactBrushAssetBody(response,4)).rejects.toBe(fault);expect(stream.locked).toBe(false)
})
it.each(['throw','reject','pending']as const)('releases before awaiting %s cancellation and preserves original size failure',async mode=>{
 const f=await fixture(),hold=deferred(),cancelFault=Error('cancel failure'),cancel=vi.fn(()=>{if(mode==='throw')throw cancelFault;return mode==='reject'?Promise.reject(cancelFault):hold.promise}),releaseLock=vi.fn(),reader={read:vi.fn(async()=>({done:false,value:new Uint8Array(5)})),cancel,releaseLock},response=new Response(new Uint8Array(4))
 vi.spyOn(response.body!,'getReader').mockReturnValue(reader as unknown as ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>)
 const work=f.readExactBrushAssetBody(response,4),rejection=expect(work).rejects.toThrow('Brush asset size mismatch')
 try{await vi.waitFor(()=>expect(releaseLock).toHaveBeenCalledOnce());expect(cancel).toHaveBeenCalledOnce()}finally{hold.resolve()}
 await rejection
})
it('rejects missing/locked bodies and invalid bounds without an arrayBuffer fallback',async()=>{
 const f=await fixture(),none=new Response(null);await expect(f.readExactBrushAssetBody(none,4)).rejects.toThrow('body unavailable')
 const response=new Response(new Uint8Array(4)),reader=response.body!.getReader(),unbounded=vi.spyOn(response,'arrayBuffer')
 try{await expect(f.readExactBrushAssetBody(response,4)).rejects.toThrow()}finally{reader.releaseLock()}
 const get=vi.spyOn(response.body!,'getReader');for(const n of [0,3,NaN,Infinity,4.5,2048*2048+1])await expect(f.readExactBrushAssetBody(response,n)).rejects.toThrow(/Invalid brush asset/)
 expect(get).not.toHaveBeenCalled();expect(unbounded).not.toHaveBeenCalled()
})
it('turns truncated cached storage into null without deleting existing backing',async()=>{
 const f=await fixture(),x=streamFixture([new Uint8Array(3)]);f.cache.match.mockResolvedValueOnce(x.response)
 expect(await f.cachedBrushAsset('short',4)).toBeNull();expect(f.cache.delete).not.toHaveBeenCalled();expect(x.stream.locked).toBe(false)
})
