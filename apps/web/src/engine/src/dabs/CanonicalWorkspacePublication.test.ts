import {expect,it,vi} from 'vitest'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {CanonicalMaskSourceBank} from './CanonicalMaskSourceBank'
import {BrushTextureCache} from './BrushTextureCache'
import {BrushMipCache} from './BrushMipCache'
import {TransformedMaskPrepass} from './TransformedMaskPrepass'
import {CanonicalRgba8CompositePass} from './CanonicalRgba8CompositePass'
function input(c:string){return{asset:{id:`asset:${c.repeat(64)}`,size:16,x:0,y:0,width:4,height:5},readOriginalCoverage:()=>new Uint8Array(256)}}
function setup(){const {gl}=recordingGL(),cache=new BrushTextureCache(gl,16*1048576),cpu=new BrushMipCache(4*1048576)
 gl.getAttribLocation=()=>0
 const bank=new CanonicalMaskSourceBank(gl,cache,cpu,[input('a')],{gpuBytes:0,cpuBytes:0});bank.jobs.forEach((_,i)=>bank.prepareJob(i))
 const prepass=new TransformedMaskPrepass(gl,cache,cpu,'stage-mask'),composite=new CanonicalRgba8CompositePass(gl,cache,cpu,'stage-composite')
 prepass.prepare({width:16,height:16,slots:1},bank.preparedResources());composite.prepare({width:16,height:16},[...bank.preparedResources(),...prepass.preparedResources()])
 const cleanup=()=>{composite.reset();prepass.reset();bank.reset();cache.clear();expect(cpu.reservedBytes).toBe(0)}
 return{gl,cache,cpu,bank,prepass,composite,cleanup}}
it('stages union metadata while old maps stay live, then publishes without GL or cache queries',()=>{
 const s=setup(),old=s.prepass.brushGlBatchInfo().resources,oldComp=s.composite.brushGlBatchInfo().resources
 const ext=s.bank.beginExtension([input('b')],{gpuBytes:0,cpuBytes:0});ext.jobs.forEach((_,i)=>ext.prepareJob(i))
 const sources=ext.preparedResources(),a=s.prepass.prepareSourceUpdate(sources),b=s.composite.prepareCompanionUpdate([...sources,...s.prepass.preparedResources()])
 expect(s.prepass.brushGlBatchInfo().resources).toEqual(old);expect(s.composite.brushGlBatchInfo().resources).toEqual(oldComp);a.assertCurrent();b.assertCurrent()
 ext.assertPreparedPublication()
 const fail=()=>{throw Error('query in pure publication')},query=vi.spyOn(s.gl,'getParameter').mockImplementation(fail),precision=vi.spyOn(s.gl,'getShaderPrecisionFormat').mockImplementation(fail),cache=vi.spyOn(s.cache,'get').mockImplementation(fail),sizes=vi.spyOn(s.cache,'resourceBytes').mockImplementation(fail)
 ext.publish();a.publish();b.publish();expect(query).not.toHaveBeenCalled();expect(precision).not.toHaveBeenCalled();expect(cache).not.toHaveBeenCalled();expect(sizes).not.toHaveBeenCalled();cache.mockRestore();sizes.mockRestore();query.mockRestore();precision.mockRestore()
 const charge=s.cpu.reservedBytes;a.finalizeCleanup();b.finalizeCleanup();ext.finalizeCleanup();expect(s.cpu.reservedBytes).toBe(charge)
 expect(s.prepass.brushGlBatchInfo().resources.length).toBeGreaterThan(old.length);expect(s.composite.brushGlBatchInfo().resources.length).toBeGreaterThan(oldComp.length);s.cleanup()
})
it('cancelled and copied updates cannot mutate original maps or keep staged metadata charged',()=>{
 const s=setup(),old=s.prepass.brushGlBatchInfo().resources,charge=s.cpu.reservedBytes,a=s.prepass.prepareSourceUpdate(s.bank.preparedResources()),b=s.composite.prepareCompanionUpdate(s.prepass.preparedResources())
 expect(s.cpu.reservedBytes).toBeGreaterThan(charge);expect(()=>Reflect.apply(a.publish,{...a},[])).toThrow();expect(()=>Reflect.apply(b.cancel,{...b},[])).toThrow();a.cancel();b.cancel();expect(s.cpu.reservedBytes).toBe(charge);expect(s.prepass.brushGlBatchInfo().resources).toEqual(old);expect(()=>a.publish()).toThrow();s.cleanup()
})
it('reset owns both staged and published update charges and makes stale updates unusable',()=>{
 const s=setup(),a=s.prepass.prepareSourceUpdate(s.bank.preparedResources()),b=s.composite.prepareCompanionUpdate(s.prepass.preparedResources());a.publish();s.prepass.reset();s.composite.reset()
 expect(()=>a.assertCurrent()).toThrow();expect(()=>b.publish()).toThrow();a.finalizeCleanup();b.cancel();s.bank.reset();s.cache.clear();expect(s.cpu.reservedBytes).toBe(0)
})
it('superseded metadata retires only after coherent publication and adopted charge remains until reset',()=>{
 const s=setup(),one=s.prepass.prepareSourceUpdate(s.bank.preparedResources());one.publish();one.finalizeCleanup();const old=s.cpu.reservedBytes
 const two=s.prepass.prepareSourceUpdate(s.bank.preparedResources());expect(s.cpu.reservedBytes).toBeGreaterThan(old);two.publish();expect(s.cpu.reservedBytes).toBeGreaterThan(old);two.finalizeCleanup();expect(s.cpu.reservedBytes).toBe(old);s.cleanup()
})
it.each(['prepass','composite']as const)('preserves a newer %s update created by validation reentry',kind=>{
 const s=setup(),sources=s.bank.preparedResources(),companions=[...sources,...s.prepass.preparedResources()];let nested:ReturnType<TransformedMaskPrepass['prepareSourceUpdate']>|undefined,entered=false
 const resource=kind==='prepass'?sources[0]:companions[0],bad={...resource}
 Object.defineProperty(bad,'key',{get:()=>{
  if(!entered){entered=true
   if(kind==='prepass'){s.prepass.reset();s.prepass.prepare({width:16,height:16,slots:1},sources);nested=s.prepass.prepareSourceUpdate(sources)}
   else{s.composite.reset();s.composite.prepare({width:16,height:16},companions);nested=s.composite.prepareCompanionUpdate(companions)}
  }return resource.key
 }})
 if(kind==='prepass')expect(()=>s.prepass.prepareSourceUpdate([bad])).toThrow()
 else expect(()=>s.composite.prepareCompanionUpdate([bad])).toThrow()
 expect(nested).toBeDefined();nested!.assertCurrent();nested!.publish();nested!.finalizeCleanup();s.cleanup()
})
it.each(['prepass','composite']as const)('retains adopted %s metadata after superseded cleanup throws',kind=>{
 const s=setup(),reserve=s.cpu.reserve.bind(s.cpu),error=Error('old metadata cleanup'),spy=vi.spyOn(s.cpu,'reserve').mockImplementationOnce(bytes=>{const release=reserve(bytes);return()=>{release();throw error}})
 const first=kind==='prepass'?s.prepass.prepareSourceUpdate(s.bank.preparedResources()):s.composite.prepareCompanionUpdate(s.prepass.preparedResources());spy.mockRestore();first.publish();first.finalizeCleanup()
 const second=kind==='prepass'?s.prepass.prepareSourceUpdate(s.bank.preparedResources()):s.composite.prepareCompanionUpdate(s.prepass.preparedResources());second.publish();expect(()=>second.finalizeCleanup()).toThrow(error)
 expect(s.prepass.isReady()).toBe(true);expect(s.composite.isReady()).toBe(true);second.finalizeCleanup();s.cleanup()
})
it('refuses oversized staged maps before traversing attacker-controlled entries or reserving metadata',()=>{
 const s=setup(),get=vi.fn(),tooMany=Array(4106);Object.defineProperty(tooMany,'0',{get});const charge=s.cpu.reservedBytes
 expect(()=>s.prepass.prepareSourceUpdate(tooMany)).toThrow();expect(()=>s.composite.prepareCompanionUpdate(tooMany)).toThrow();expect(get).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(charge);s.cleanup()
})
