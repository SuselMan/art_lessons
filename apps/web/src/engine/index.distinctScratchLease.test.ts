import { afterEach, expect, it, vi } from 'vitest'
import { DistinctScratchLease, RibbonStrokeScratch } from './src/buffers/RibbonStrokeScratch'
import { createTestEngine, makeLayerAdd, paperReady, simulateStroke } from './testing/engineTestUtils'
import type { PencilEngine } from './index'
import type { AccumulationBuffer } from './src/buffers/AccumulationBuffer'
function pixels(b: AccumulationBuffer) { const gl=b.gl, out=new Uint8Array(b.width*b.height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,b.fbo);gl.readPixels(0,0,b.width,b.height,gl.RGBA,gl.UNSIGNED_BYTE,out);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return out }
function fill(b: AccumulationBuffer, v:number) {const gl=b.gl;gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,b.width,b.height,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(b.width*b.height*4).fill(v))}
const engines: PencilEngine[] = []
afterEach(() => { for (const e of engines.splice(0)) e.destroy() })
async function setup() {
 const {engine:e}=createTestEngine({userId:'lease'}, {width:64,height:64});engines.push(e)
 e.appendOperation(makeLayerAdd('lease','L'));e.setCompositeOrder([{id:'L',opacity:1}]);e.setActiveLayer('L');await paperReady(e)
 e.setTool('watercolor');e.setPencil('normal:100:100:PB29:round');e.setSize(8)
 simulateStroke(e,[{x:8,y:32},{x:24,y:32},{x:40,y:32}]);expect(e['_settle']).not.toBeNull()
 const job=e['_settle']!,release=vi.fn(),retain=vi.fn()
 const options={enabled:true,job,scratch:job.scratch,epoch:1,layerId:'L',reservedFutureBytes:64*64*4*16,liveBytes:0,byteCap:1024*1024,retain,release}
 return {e,job,release,retain,options}
}
it('real Plan complete precedes actual tile→future.original copy, preserving every future material/import buffer identity and no source reset',async()=>{
 const {e,job,options,release}=await setup();const lease=new DistinctScratchLease(options)
 const future=new RibbonStrokeScratch(e['_ribbonScratchPool'],true,true)
 const tile=[...job.scratch.tileEntries()][0][0], entry=future.getOrCreate(tile)
 // A retained import lives in the recipient, not the temporary donor.
 entry.foreignSolventLoad=e['_ribbonScratchPool'].acquire(tile.width,tile.height)
 const material=[entry.coverage,entry.inkLoad!,entry.inkColor!,entry.foreignSolventLoad]
 material.forEach((b,i)=>fill(b,33+i*17));const arrays=material.map(pixels)
 const sourceCalls=material.map(b=>vi.spyOn(b,'clear')), sourceCopies=material.map(b=>vi.spyOn(b,'copyTo'))
 lease.bindFuture(future,'L',()=>{},()=>{});const copy=vi.spyOn(tile,'copyTo');const futureComposite=vi.fn()
 const originalBefore=entry.original;const oldFinish=vi.spyOn(e as unknown as {_completeSettle():void},'_completeSettle')
 e['_completeSettle']();expect(oldFinish).toHaveBeenCalled();expect(e['_settle']).toBeNull()
 const sequentialOriginal=pixels(tile);expect(sequentialOriginal.some(v=>v>0)).toBe(true)
 copy.mockClear();expect(lease.afterComposite(job,1,'L',true,futureComposite)).toBe(true)
 expect(copy).toHaveBeenCalledExactlyOnceWith(originalBefore);expect(futureComposite).toHaveBeenCalledOnce()
 expect(pixels(entry.original)).toEqual(sequentialOriginal);material.forEach((b,i)=>expect(pixels(b)).toEqual(arrays[i]))
 for(const spy of [...sourceCalls,...sourceCopies]) expect(spy).not.toHaveBeenCalled()
 expect(entry.coverage).toBe(material[0]);expect(entry.foreignSolventLoad).toBe(material[3]);expect(release).toHaveBeenCalledExactlyOnceWith(false)
 expect(lease.afterComposite(job,1,'L',true,futureComposite)).toBe(false);future.destroy()
})
it('pre-admission budget/OFF never retains; stale epoch/layer/job and loss never copy canonical tiles',async()=>{
 const {e,job,options,retain,release}=await setup()
 expect(()=>new DistinctScratchLease({...options,byteCap:1})).toThrow(/budget/);expect(retain).not.toHaveBeenCalled()
 const off=new DistinctScratchLease({...options,enabled:false});expect(off.blocksPublication).toBe(false);expect(retain).not.toHaveBeenCalled()
 const lease=new DistinctScratchLease(options),future=new RibbonStrokeScratch(e['_ribbonScratchPool'],true,true)
 const tile=[...job.scratch.tileEntries()][0][0];future.getOrCreate(tile);lease.bindFuture(future,'L',()=>{},()=>{})
 const copy=vi.spyOn(tile,'copyTo'),cb=vi.fn()
 expect(lease.afterComposite({},1,'L',true,cb)).toBe(false);expect(lease.afterComposite(job,2,'L',true,cb)).toBe(false);expect(lease.afterComposite(job,1,'other',true,cb)).toBe(false)
 expect(()=>lease.afterComposite(job,1,'L',false,cb)).toThrow(/not ready/)
 expect(copy).not.toHaveBeenCalled();expect(lease.cancel(true)).toBe(true);expect(lease.cancel()).toBe(false)
 expect(lease.afterComposite(job,1,'L',true,cb)).toBe(false);expect(release).toHaveBeenCalledExactlyOnceWith(true);future.forget()
})

it('distinct layer keeps its original; release failure never releases either owner twice and remains blocked until cancel',async()=>{
 const {e,job,options}=await setup();const release=vi.fn(()=>{throw Error('release failure')}),futureRelease=vi.fn(),futureRetain=vi.fn()
 const lease=new DistinctScratchLease({...options,release}),future=new RibbonStrokeScratch(e['_ribbonScratchPool'],true,true)
 expect(()=>lease.bindFuture(future,'B',futureRetain,futureRelease)).toThrow(/future owner/)
 const tile=[...job.scratch.tileEntries()][0][0],entry=future.getOrCreate(tile);fill(entry.original,57);const before=pixels(entry.original)
 lease.bindFuture(future,'B',futureRetain,futureRelease);const copy=vi.spyOn(tile,'copyTo');e['_completeSettle']();copy.mockClear()
 expect(()=>lease.afterComposite(job,1,'L',true,()=>{})).toThrow(/release failure/);expect(lease.blocksPublication).toBe(true)
 expect(copy).not.toHaveBeenCalled();expect(pixels(entry.original)).toEqual(before);expect(futureRetain).toHaveBeenCalledOnce();expect(futureRelease).toHaveBeenCalledOnce()
 expect(lease.cancel()).toBe(true);expect(lease.blocksPublication).toBe(true);expect(lease.acknowledgeRecovery({},1)).toBe(false);expect(lease.acknowledgeRecovery(job,1)).toBe(true);expect(lease.blocksPublication).toBe(false);expect(release).toHaveBeenCalledOnce();expect(futureRelease).toHaveBeenCalledOnce();future.destroy()
})
