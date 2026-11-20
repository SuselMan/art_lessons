import {describe,it,expect,vi} from 'vitest'
import {MockGL} from '../../testing/mockGL'
import {AccumulationBuffer} from './AccumulationBuffer'
import {RibbonScratchPool} from './RibbonScratchPool'
import {RibbonStrokeScratch} from './RibbonStrokeScratch'
const context=(gl:MockGL)=>gl as unknown as WebGLRenderingContext
function thrown(work:()=>unknown):{threw:boolean;value?:unknown}{try{work();return{threw:false}}catch(value){return{threw:true,value}}}

describe('137a unpublished framebuffer constructor ownership (MockGL, not GPU)',()=>{
 for(const step of ['textureNull','textureThrow','bindTexture','storage','parameter','fboNull','fboThrow','bindFbo','attachment','statusThrow','statusIncomplete','unbind'] as const){
  it('retires every created handle on '+step,()=>{
   const gl=new MockGL(),cause={step},textures=vi.spyOn(gl,'createTexture'),fbos=vi.spyOn(gl,'createFramebuffer'),deleteTexture=vi.spyOn(gl,'deleteTexture'),deleteFbo=vi.spyOn(gl,'deleteFramebuffer')
   if(step==='textureNull')textures.mockImplementationOnce(()=>null as unknown as object)
   if(step==='textureThrow')textures.mockImplementationOnce(()=>{throw cause})
   if(step==='bindTexture')vi.spyOn(gl,'bindTexture').mockImplementationOnce(()=>{throw cause})
   if(step==='storage')vi.spyOn(gl,'texImage2D').mockImplementationOnce(()=>{throw cause})
   if(step==='parameter')vi.spyOn(gl,'texParameteri').mockImplementationOnce(()=>{throw cause})
   if(step==='fboNull')fbos.mockImplementationOnce(()=>null as unknown as object)
   if(step==='fboThrow')fbos.mockImplementationOnce(()=>{throw cause})
   if(step==='bindFbo')vi.spyOn(gl,'bindFramebuffer').mockImplementationOnce(()=>{throw cause})
   if(step==='attachment')vi.spyOn(gl,'framebufferTexture2D').mockImplementationOnce(()=>{throw cause})
   if(step==='statusThrow')vi.spyOn(gl,'checkFramebufferStatus').mockImplementationOnce(()=>{throw cause})
   if(step==='statusIncomplete')vi.spyOn(gl,'checkFramebufferStatus').mockReturnValueOnce(-1)
   if(step==='unbind'){const bind=gl.bindFramebuffer.bind(gl);let calls=0;vi.spyOn(gl,'bindFramebuffer').mockImplementation((...args)=>{if(++calls===2)throw cause;return bind(...args)})}
   const failure=thrown(()=>new AccumulationBuffer(context(gl),4,3))
   expect(failure.threw).toBe(true)
   if(!['textureNull','fboNull','statusIncomplete'].includes(step))expect(failure.value).toBe(cause)
   const madeTextures=textures.mock.results.filter(r=>r.type==='return'&&r.value),madeFbos=fbos.mock.results.filter(r=>r.type==='return'&&r.value)
   expect(deleteTexture.mock.calls.map(c=>c[0])).toEqual(madeTextures.map(r=>r.value))
   expect(deleteFbo.mock.calls.map(c=>c[0])).toEqual(madeFbos.map(r=>r.value))
   textures.mockRestore();fbos.mockRestore();vi.restoreAllMocks()
   // A failed initial check must not falsely mark this context checked.
   const status=vi.spyOn(gl,'checkFramebufferStatus'),good=new AccumulationBuffer(context(gl),4,3)
   expect(status).toHaveBeenCalledTimes(1);good.destroy()
  })
 }
 it('preserves undefined primary even when framebuffer cleanup throws, and still retires texture',()=>{
  const gl=new MockGL(),textureDelete=vi.spyOn(gl,'deleteTexture')
  vi.spyOn(gl,'framebufferTexture2D').mockImplementationOnce(()=>{throw undefined})
  vi.spyOn(gl,'deleteFramebuffer').mockImplementationOnce(()=>{throw Error('cleanup')})
  expect(thrown(()=>new AccumulationBuffer(context(gl),2,2))).toEqual({threw:true,value:undefined});expect(textureDelete).toHaveBeenCalledTimes(1)
 })
 it('successful context checks once and owner destroys its own handles exactly once',()=>{
  const gl=new MockGL(),status=vi.spyOn(gl,'checkFramebufferStatus'),dt=vi.spyOn(gl,'deleteTexture'),df=vi.spyOn(gl,'deleteFramebuffer')
  const a=new AccumulationBuffer(context(gl),4,4),b=new AccumulationBuffer(context(gl),4,4);expect(status).toHaveBeenCalledTimes(1);a.destroy();b.destroy();expect(dt).toHaveBeenCalledTimes(2);expect(df).toHaveBeenCalledTimes(2)
 })
})

describe('137a actual Ribbon pool and scratch failure rollback',()=>{
 it('failed constructor does not charge pool; subsequent acquisition/reuse/destroy counters remain exact',()=>{
  const gl=new MockGL(),pool=new RibbonScratchPool(context(gl)),cause=Error('storage unavailable');vi.spyOn(gl,'texImage2D').mockImplementationOnce(()=>{throw cause})
  expect(thrown(()=>pool.acquire(4,3)).value).toBe(cause);expect(pool.bytes).toEqual({live:0,free:0})
  const a=pool.acquire(4,3);expect(pool.bytes).toEqual({live:48,free:0});pool.release(a);expect(pool.bytes).toEqual({live:0,free:48});expect(pool.acquire(4,3)).toBe(a);pool.release(a);pool.destroy();expect(pool.bytes).toEqual({live:0,free:0})
 })
 for(const step of ['acquire1','acquire2','acquire3','acquire4','copy','clear1','clear2','clear3'] as const){
  it('releases all unpublished planes on '+step+' while retaining an accepted tile',()=>{
   const gl=new MockGL(),pool=new RibbonScratchPool(context(gl)),scratch=new RibbonStrokeScratch(pool,true,true),tile=new AccumulationBuffer(context(gl),4,3),priorTile=new AccumulationBuffer(context(gl),4,3)
   const prior=scratch.getOrCreate(priorTile),baseline=pool.bytes.live,cause={step};const acquire=pool.acquire.bind(pool);let acquisitions=0
   vi.spyOn(pool,'acquire').mockImplementation((w,h)=>{acquisitions++;if(step==='acquire'+acquisitions)throw cause;return acquire(w,h)})
   if(step==='copy')vi.spyOn(tile,'copyTo').mockImplementationOnce(()=>{throw cause})
   const clear=gl.clear.bind(gl);let clears=0;vi.spyOn(gl,'clear').mockImplementation((...args)=>{if(step==='clear'+(++clears))throw cause;return clear(...args)})
   expect(thrown(()=>scratch.getOrCreate(tile))).toEqual({threw:true,value:cause});expect([...scratch.tileEntries()]).toEqual([[priorTile,prior]]);expect(scratch.getOrCreate(priorTile)).toBe(prior);expect(pool.bytes.live).toBe(baseline)
   vi.restoreAllMocks();const created=vi.spyOn(gl,'createTexture'),deleted=vi.spyOn(gl,'deleteTexture');const accepted=scratch.getOrCreate(tile);expect(accepted.original).toBeDefined();expect([...scratch.tileEntries()]).toHaveLength(2)
   // Previously released partial planes can be reused; no duplicate ownership.
   const owned=[...scratch.tileEntries()].flatMap(([,e])=>[e.original,e.coverage,e.inkLoad,e.inkColor]);expect(new Set(owned).size).toBe(8)
   scratch.destroy();expect(pool.bytes.live).toBe(0);const finalCount=pool.bytes.free/48;pool.destroy();expect(deleted).toHaveBeenCalledTimes(finalCount);expect(pool.bytes).toEqual({live:0,free:0});expect(created.mock.calls.length).toBeLessThanOrEqual(4);tile.destroy();priorTile.destroy()
  })
 }
 it('copy throwing undefined rolls back all partial buffers even if a release reports an error after returning ownership',()=>{
  const gl=new MockGL(),pool=new RibbonScratchPool(context(gl)),scratch=new RibbonStrokeScratch(pool),tile=new AccumulationBuffer(context(gl),4,3),release=pool.release.bind(pool)
  vi.spyOn(tile,'copyTo').mockImplementationOnce(()=>{throw undefined});vi.spyOn(pool,'release').mockImplementationOnce(b=>{release(b);throw Error('cleanup')})
  expect(thrown(()=>scratch.getOrCreate(tile))).toEqual({threw:true,value:undefined});expect([...scratch.tileEntries()]).toEqual([]);expect(pool.bytes.live).toBe(0);scratch.destroy();pool.destroy();tile.destroy()
 })
 it('clear failure of a new ceiling preserves the existing accepted entry and retries using the same pool',()=>{
  const gl=new MockGL(),pool=new RibbonScratchPool(context(gl)),scratch=new RibbonStrokeScratch(pool,false),tile=new AccumulationBuffer(context(gl),4,3),entry=scratch.getOrCreate(tile),baseline=pool.bytes.live
  vi.spyOn(gl,'clear').mockImplementationOnce(()=>{throw undefined});expect(thrown(()=>scratch.brushCeiling(tile))).toEqual({threw:true,value:undefined});expect(entry.inkLoad).toBeNull();expect(scratch.getOrCreate(tile)).toBe(entry);expect(pool.bytes.live).toBe(baseline)
  const ceiling=scratch.brushCeiling(tile);expect(entry.inkLoad).toBe(ceiling);expect(scratch.brushCeiling(tile)).toBe(ceiling);scratch.destroy();expect(pool.bytes.live).toBe(0);pool.destroy();tile.destroy()
 })
 it('a ceiling acquire failure never changes an accepted entry or pool accounting',()=>{
  const gl=new MockGL(),pool=new RibbonScratchPool(context(gl)),scratch=new RibbonStrokeScratch(pool,false),tile=new AccumulationBuffer(context(gl),4,3),entry=scratch.getOrCreate(tile),baseline={...pool.bytes},cause=Error('ceiling acquire')
  vi.spyOn(pool,'acquire').mockImplementationOnce(()=>{throw cause});expect(thrown(()=>scratch.brushCeiling(tile)).value).toBe(cause);expect(entry.inkLoad).toBeNull();expect(scratch.getOrCreate(tile)).toBe(entry);expect(pool.bytes).toEqual(baseline);scratch.destroy();pool.destroy();tile.destroy()
 })
 it('attempts every partial release after later clear failure, preserving the primary failure',()=>{
  const gl=new MockGL(),pool=new RibbonScratchPool(context(gl)),scratch=new RibbonStrokeScratch(pool,true,true),tile=new AccumulationBuffer(context(gl),4,3),release=pool.release.bind(pool),primary=Error('third clear');let clears=0,calls=0;const clear=gl.clear.bind(gl)
  vi.spyOn(gl,'clear').mockImplementation((...args)=>{if(++clears===3)throw primary;return clear(...args)})
  vi.spyOn(pool,'release').mockImplementation(b=>{release(b);if(++calls===1)throw Error('first cleanup')})
  expect(thrown(()=>scratch.getOrCreate(tile)).value).toBe(primary);expect(calls).toBe(4);expect(pool.bytes.live).toBe(0);expect([...scratch.tileEntries()]).toEqual([]);scratch.destroy();pool.destroy();tile.destroy()
 })
})
