import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {ownedBrushFixture} from '../../testing/ownedBrushFixture'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {CanonicalMaskSourceBank} from './CanonicalMaskSourceBank'
import {BrushTextureCache} from './BrushTextureCache'
import {BrushMipCache} from './BrushMipCache'
import {BrushPreparation} from './BrushPreparation'
import type {CanonicalMaskSourceExtension} from './CanonicalMaskSourceBank'
let frames:Map<number,FrameRequestCallback>,ordinal:number
const tick=()=>{const jobs=[...frames.values()];frames.clear();for(const job of jobs)job(0)}
beforeEach(()=>{frames=new Map();ordinal=0;vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++ordinal,cb);return ordinal});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id))})
afterEach(()=>vi.unstubAllGlobals())
function input(letter:string,x=0,side=16){return{asset:{id:`asset:${letter.repeat(64)}`,size:side,x,y:0,width:4,height:5},readOriginalCoverage:vi.fn(()=>new Uint8Array(side*side))}}
function setup(){const {gl}=recordingGL(),cache=new BrushTextureCache(gl,16*1048576),cpu=new BrushMipCache(4*1048576),a=input('a')
 const bank=new CanonicalMaskSourceBank(gl,cache,cpu,[a],{gpuBytes:0,cpuBytes:0});bank.jobs.forEach((_,i)=>bank.prepareJob(i));return{gl,cache,cpu,a,bank}}
it('keeps committed resources and generation ready until complete additive publication',()=>{
 const s=setup(),old=s.bank.preparedResources(),gen=s.bank.assertSourceBinding(s.a.asset,s),b=input('b'),oldReserved=s.cpu.reservedBytes
 const ext=s.bank.beginExtension([b],{gpuBytes:0,cpuBytes:0})
 try{expect(s.bank.preparedResources()).toEqual(old);ext.jobs.forEach((_,i)=>ext.prepareJob(i));expect(ext.preparedResources()).toHaveLength(old.length+ext.jobs.length)
  s.bank.assertCurrentOwners(gen);expect(s.bank.preparedResources()).toEqual(old);ext.commit();expect(()=>s.bank.assertCurrentOwners(gen)).toThrow();expect(s.bank.assertSourceBinding(b.asset,s)).toBeTypeOf('number')
  ext.cancel();expect(s.bank.isReady()).toBe(true);expect(s.cpu.reservedBytes).toBeGreaterThan(oldReserved)
 }finally{s.bank.reset();s.cache.clear()}expect(s.cpu.reservedBytes).toBe(0)
})
it('rolls back only new keys and reuses old keys without calling replacement readers',()=>{
 const s=setup(),old=s.bank.jobs.map(j=>({key:j.key,texture:s.cache.get(j.key)})),gen=s.bank.assertSourceBinding(s.a.asset,s),reserve=s.cpu.reservedBytes,b=input('b')
 const ext=s.bank.beginExtension([b],{gpuBytes:0,cpuBytes:0});ext.prepareJob(0);ext.cancel();ext.cancel()
 expect(s.cpu.reservedBytes).toBe(reserve);s.bank.assertCurrentOwners(gen);for(const r of old)expect(s.cache.get(r.key)).toBe(r.texture)
 const replacement={...s.a,readOriginalCoverage:vi.fn(()=>{throw Error('must reuse')})},reuse=s.bank.beginExtension([replacement],{gpuBytes:0,cpuBytes:0})
 expect(reuse.jobs).toHaveLength(0);reuse.commit();expect(replacement.readOriginalCoverage).not.toHaveBeenCalled();s.bank.reset();s.cache.clear();expect(s.cpu.reservedBytes).toBe(0)
})
it('allows same asset distinct crop but refuses conflicting side and overlapping transaction before pixels',()=>{
 const s=setup(),b=input('a',5),ext=s.bank.beginExtension([b],{gpuBytes:0,cpuBytes:0})
 expect(ext.jobs.length).toBeGreaterThan(0);expect(()=>s.bank.beginExtension([input('c')],{gpuBytes:0,cpuBytes:0})).toThrow();ext.cancel()
 const conflict=input('a',0,32);expect(()=>s.bank.beginExtension([conflict],{gpuBytes:0,cpuBytes:0})).toThrow();expect(conflict.readOriginalCoverage).not.toHaveBeenCalled();s.bank.reset();s.cache.clear()
})
it('rejects aggregate peak budget before pixel reads and keeps original owner intact',()=>{
 const s=setup(),b=input('b'),old=s.cpu.reservedBytes
 expect(()=>s.bank.beginExtension([b],{gpuBytes:s.cache.budgetBytes,cpuBytes:0})).toThrow();expect(()=>s.bank.beginExtension([b],{gpuBytes:0,cpuBytes:s.cpu.budgetBytes})).toThrow()
 expect(b.readOriginalCoverage).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(old);expect(s.bank.isReady()).toBe(true);s.bank.reset();s.cache.clear()
})
it('source-reader reset invalidates pending upload and cannot publish or retain metadata',()=>{
 const s=setup(),b=input('b');b.readOriginalCoverage.mockImplementation(()=>{s.bank.reset();return new Uint8Array(256)})
 const ext=s.bank.beginExtension([b],{gpuBytes:0,cpuBytes:0});expect(ext.prepareJob(0)).toBe('cancelled');expect(()=>ext.commit()).toThrow();ext.cancel();expect(s.cpu.reservedBytes).toBe(0);expect(s.cache.bytes).toBe(0);s.cache.clear()
})
it('rejects copied receivers and incomplete commit without touching old resources',()=>{
 const s=setup(),ext=s.bank.beginExtension([input('b')],{gpuBytes:0,cpuBytes:0})
 expect(()=>Reflect.apply(ext.prepareJob,{...ext},[0])).toThrow();expect(()=>Reflect.apply(ext.preparedResources,{...ext},[])).toThrow();expect(()=>Reflect.apply(ext.commit,{...ext},[])).toThrow();ext.assertCurrent();expect(()=>ext.assertPreparedPublication()).toThrow();expect(()=>ext.commit()).toThrow();expect(s.bank.isReady()).toBe(true);ext.cancel();s.bank.reset();s.cache.clear()
})
it('attempts all candidate deletion after a fault, preserving old keys and the first error',()=>{
 const s=setup(),ext=s.bank.beginExtension([input('b')],{gpuBytes:0,cpuBytes:0}),old=s.bank.resources(),reserve=s.cpu.reservedBytes-ext.jobs.length*512
 ext.jobs.forEach((_,i)=>ext.prepareJob(i));const error=Error('delete failed'),original=s.gl.deleteTexture.getMockImplementation();let attempts=0
 s.gl.deleteTexture.mockImplementation((...args:unknown[])=>{attempts++;original?.(...args);if(attempts===1)throw error})
 expect(()=>ext.cancel()).toThrow(error);expect(attempts).toBe(ext.jobs.length);expect(s.bank.resources()).toEqual(old);expect(s.cpu.reservedBytes).toBe(reserve)
 s.gl.deleteTexture.mockImplementation(original!);s.bank.reset();s.cache.clear();expect(s.cpu.reservedBytes).toBe(0)
})
it('post-publication lease-release failure cannot roll back the committed union',()=>{
 const s=setup(),error=Error('lease release failed'),lease=s.cache.lease.bind(s.cache)
 const spy=vi.spyOn(s.cache,'lease').mockImplementationOnce(resources=>{const release=lease(resources);return()=>{release();throw error}})
 const ext=s.bank.beginExtension([input('b')],{gpuBytes:0,cpuBytes:0});spy.mockRestore();ext.jobs.forEach((_,i)=>ext.prepareJob(i))
 expect(()=>ext.commit()).toThrow(error);ext.cancel();expect(s.bank.preparedResources().length).toBeGreaterThan(ext.jobs.length);expect(s.bank.isReady()).toBe(true)
 s.bank.reset();s.cache.clear();expect(s.cpu.reservedBytes).toBe(0)
})
it('shares one lazily created transaction across subscribers and commits before the surviving promise',async()=>{
 const s=setup(),worker=new BrushPreparation(),a=new AbortController(),b=input('b'),begin=vi.spyOn(s.bank,'beginExtension');let ext:CanonicalMaskSourceExtension|undefined
 const planned=s.bank.jobs.length // same dimensions => same finite level count
 const jobs=[()=>{ext=s.bank.beginExtension([b],{gpuBytes:0,cpuBytes:0})},...Array.from({length:planned},(_,i)=>()=>{ext!.prepareJob(i)})]
 const first=worker.run(jobs,{signal:a.signal},()=>true,'new-image',outcome=>{if('result'in outcome&&outcome.result.status==='ready')ext?.commit();else ext?.cancel()})
 tick();const second=worker.run([()=>{throw Error('ignored caller jobs')}],{},()=>true,'new-image',()=>{throw Error('ignored caller finalizer')})
 a.abort();await expect(first).resolves.toEqual({status:'cancelled'});expect(s.bank.assertSourceBinding(s.a.asset,s)).toBeTypeOf('number')
 for(let i=0;i<planned;i++)tick();await expect(second).resolves.toEqual({status:'ready'});expect(begin).toHaveBeenCalledOnce();expect(s.bank.assertSourceBinding(b.asset,s)).toBeTypeOf('number');s.bank.reset();s.cache.clear();expect(s.cpu.reservedBytes).toBe(0)
})
it('final progress cancellation rolls back new keys while original ready resources and generation survive',async()=>{
 const s=setup(),worker=new BrushPreparation(),a=new AbortController(),b=input('b'),gen=s.bank.assertSourceBinding(s.a.asset,s),old=s.bank.resources();let ext:CanonicalMaskSourceExtension|undefined
 const n=s.bank.jobs.length,jobs=[()=>{ext=s.bank.beginExtension([b],{gpuBytes:0,cpuBytes:0})},...Array.from({length:n},(_,i)=>()=>{ext!.prepareJob(i)})]
 const pending=worker.run(jobs,{signal:a.signal,onProgress:(done,total)=>{if(done===total)a.abort()}},()=>true,'new-image',outcome=>{if('result'in outcome&&outcome.result.status==='ready')ext?.commit();else ext?.cancel()})
 for(let i=0;i<jobs.length;i++)tick();await expect(pending).resolves.toEqual({status:'cancelled'});s.bank.assertCurrentOwners(gen);expect(s.bank.resources()).toEqual(old);s.bank.reset();s.cache.clear();expect(s.cpu.reservedBytes).toBe(0)
})
it('rejects extension getters before reading pixels or allocating GPU resources',()=>{
 const s=setup(),b=input('b'),get=vi.fn(()=>b.asset),bad={readOriginalCoverage:b.readOriginalCoverage};Object.defineProperty(bad,'asset',{get,enumerable:true})
 const allocated=s.gl.createTexture.mock.calls.length,reserve=s.cpu.reservedBytes
 expect(()=>Reflect.apply(s.bank.beginExtension,s.bank,[[bad],{gpuBytes:0,cpuBytes:0}])).toThrow();expect(get).not.toHaveBeenCalled();expect(b.readOriginalCoverage).not.toHaveBeenCalled();expect(s.gl.createTexture).toHaveBeenCalledTimes(allocated);expect(s.cpu.reservedBytes).toBe(reserve);s.bank.reset();s.cache.clear()
})
it('context-loss reset retires both committed and pending resources and metadata exactly once',()=>{
 const s=setup(),ext=s.bank.beginExtension([input('b')],{gpuBytes:0,cpuBytes:0});ext.prepareJob(0)
 s.gl.deleteTexture.mockClear();s.bank.reset(true);expect(s.gl.deleteTexture).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(0);expect(s.cache.bytes).toBe(0);expect(()=>ext.assertCurrent()).toThrow();ext.cancel(true);s.bank.reset(true);s.cache.clear(true)
})
it('early aborted preparation never allocates an ignored transaction',async()=>{
 const s=setup(),worker=new BrushPreparation(),abort=new AbortController(),begin=vi.spyOn(s.bank,'beginExtension');abort.abort()
 await expect(worker.run([()=>{s.bank.beginExtension([input('b')],{gpuBytes:0,cpuBytes:0})}],{signal:abort.signal},()=>true,'image',()=>{throw Error('no work created')})).resolves.toEqual({status:'cancelled'})
 expect(begin).not.toHaveBeenCalled();s.bank.reset();s.cache.clear()
})
it('does not adopt or discard a matching pre-existing cache key when an extension rolls back',()=>{
 const s=setup(),b=input('b'),ext=s.bank.beginExtension([b],{gpuBytes:0,cpuBytes:0}),job=ext.jobs[0]
 s.cache.protect([...s.bank.jobs.map(j=>j.key),job.key]);s.cache.putOwned(job.key,ownedBrushFixture(s.gl,job.bytes))
 const texture=s.cache.get(job.key);expect(ext.prepareJob(0)).toBe('ready');expect(b.readOriginalCoverage).not.toHaveBeenCalled();ext.cancel()
 expect(s.cache.get(job.key)).toBe(texture);s.bank.reset();expect(s.cache.get(job.key)).toBe(texture);s.cache.clear();expect(s.cpu.reservedBytes).toBe(0)
})
it('retains union lease through pure publication until explicit cleanup and keeps old commit wrapper semantics',()=>{
 const s=setup(),lease=s.cache.lease.bind(s.cache),released=vi.fn(),spy=vi.spyOn(s.cache,'lease').mockImplementationOnce(resources=>{const release=lease(resources);return()=>{released();release()}})
 const ext=s.bank.beginExtension([input('b')],{gpuBytes:0,cpuBytes:0});spy.mockRestore();ext.jobs.forEach((_,i)=>ext.prepareJob(i));expect(ext.status).toBe('pending');ext.assertCurrent()
 ext.assertPreparedPublication();ext.publish();expect(ext.status).toBe('committed');expect(released).not.toHaveBeenCalled();ext.cancel();expect(released).not.toHaveBeenCalled();s.cache.protect([]);expect(s.bank.isReady()).toBe(true)
 ext.finalizeCleanup();ext.finalizeCleanup();expect(released).toHaveBeenCalledOnce();s.bank.reset();s.cache.clear();expect(s.cpu.reservedBytes).toBe(0)
})
it('reset owns a published-but-not-cleaned union lease and copied cleanup receivers cannot release it',()=>{
 const s=setup(),lease=s.cache.lease.bind(s.cache),released=vi.fn(),spy=vi.spyOn(s.cache,'lease').mockImplementationOnce(resources=>{const release=lease(resources);return()=>{released();release()}})
 const ext=s.bank.beginExtension([input('b')],{gpuBytes:0,cpuBytes:0});spy.mockRestore();ext.jobs.forEach((_,i)=>ext.prepareJob(i));ext.assertPreparedPublication();ext.publish()
 expect(()=>Reflect.apply(ext.finalizeCleanup,{...ext},[])).toThrow();expect(released).not.toHaveBeenCalled();s.bank.reset();expect(released).toHaveBeenCalledOnce();ext.finalizeCleanup();expect(s.cpu.reservedBytes).toBe(0);expect(s.cache.bytes).toBe(0);s.cache.clear()
})
