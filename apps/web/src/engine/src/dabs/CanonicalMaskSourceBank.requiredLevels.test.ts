import {expect,it,vi} from 'vitest'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {CanonicalMaskSourceBank,canonicalMaskSourceBankBudget} from './CanonicalMaskSourceBank'
import {BrushMipCache} from './BrushMipCache'
import {BrushTextureCache} from './BrushTextureCache'
const companion={gpuBytes:0,cpuBytes:0}
function input(letter='a',width=150,height=150,size=256,x=53,y=53){
 const asset={id:'asset:'+letter.repeat(64),size,x,y,width,height}
 const pixels=Uint8Array.from({length:size*size},(_,i)=>(i*37+Math.floor(i/size)*53)%256)
 return{asset,readOriginalCoverage:vi.fn(()=>pixels)}
}
function owners(){const {gl}=recordingGL(),cache=new BrushTextureCache(gl),cpu=new BrushMipCache();return{gl,cache,cpu}}
function close(s:ReturnType<typeof owners>,...banks:CanonicalMaskSourceBank[]){for(const bank of banks)bank.reset();s.cache.clear();expect(s.cpu.reservedBytes).toBe(0)}
it('plans only selected original Basic6/Graphite indexes without pixel reads and leaves defaults unchanged',()=>{
 const a=input(),selected=[{asset:a.asset,indexes:[9,5,8,6,7]}]
 expect(canonicalMaskSourceBankBudget([a]).gpuBytes).toBe(489928)
 expect(canonicalMaskSourceBankBudget([a],selected).gpuBytes).toBe(816)
 const graphite=Array.from({length:7},(_,i)=>input(i.toString(16),128,128,128,0,0))
 const budget=canonicalMaskSourceBankBudget(graphite,graphite.map(a=>({asset:a.asset,indexes:[5,6,7,8,9,10]})))
 expect(budget.resources).toHaveLength(42);expect(budget.gpuBytes).toBe(13832)
 expect(a.readOriginalCoverage).not.toHaveBeenCalled();for(const source of graphite)expect(source.readOriginalCoverage).not.toHaveBeenCalled()
})
it('uploads identical selected/full RGBA pixels and reports original indexes rather than subset positions',()=>{
 const a=input(),s=owners(),images=new Map<unknown,Uint8Array>(),upload=s.gl.texImage2D
 s.gl.texImage2D=(...args:unknown[])=>{images.set(s.gl.getParameter(s.gl.TEXTURE_BINDING_2D),new Uint8Array(args[8] as Uint8Array));upload(...args)}
 const full=new CanonicalMaskSourceBank(s.gl,s.cache,s.cpu,[a],companion),fullImages=new Map<string,Uint8Array>()
 try{full.jobs.forEach((job,i)=>{full.prepareJob(i);fullImages.set(job.key,images.get(s.cache.get(job.key))!)})}finally{full.reset()}
 const subset=new CanonicalMaskSourceBank(s.gl,s.cache,s.cpu,[a],companion,[{asset:a.asset,indexes:[9,7,5,8,6]}])
 try{subset.jobs.forEach((job,i)=>{subset.prepareJob(i);expect(images.get(s.cache.get(job.key))).toEqual(fullImages.get(job.key))})
  expect(subset.preparedResources().map(r=>r.canonical?.index)).toEqual([5,6,7,8,9])
  expect(()=>subset.assertSourceBinding(a.asset,s)).toThrow()
  expect(subset.assertRequiredSourceBinding(a.asset,[5,9],s)).toBeTypeOf('number')
  expect(()=>subset.assertRequiredSourceBinding(a.asset,[0],s)).toThrow()
 }finally{close(s,subset)}
})
it('extends a subset with a legal recorded high level while preserving old keys, readers and generation',()=>{
 const a=input(),s=owners(),bank=new CanonicalMaskSourceBank(s.gl,s.cache,s.cpu,[a],companion,[{asset:a.asset,indexes:[5,6,7,8,9]}])
 try{bank.jobs.forEach((_,i)=>bank.prepareJob(i));const old=bank.resources(),generation=bank.assertRequiredSourceBinding(a.asset,[5],s),calls=a.readOriginalCoverage.mock.calls.length
  const replacement={...a,readOriginalCoverage:vi.fn(()=>a.readOriginalCoverage.getMockImplementation()!())},extension=bank.beginExtension([replacement],companion,[{asset:a.asset,indexes:[0,5]}])
  expect(extension.jobs).toHaveLength(1);expect(extension.jobs[0].bytes).toBe(364816)
  extension.prepareJob(0);extension.commit();bank.assertCurrentOwners(generation)
  expect(a.readOriginalCoverage).toHaveBeenCalledTimes(calls);expect(replacement.readOriginalCoverage).toHaveBeenCalledOnce()
  for(const resource of old)expect(s.cache.get(resource.key)).toBe(resource.texture)
  const unused={...a,readOriginalCoverage:vi.fn(()=>{throw Error('must retain old readers')})},reuse=bank.beginExtension([unused],companion,[{asset:a.asset,indexes:[5,0]}])
  expect(reuse.jobs).toHaveLength(0);reuse.commit();expect(unused.readOriginalCoverage).not.toHaveBeenCalled()
  // Rebuild an explicitly retired old texture: the published extension must not
  // have replaced the lexical reader belonging to that original key.
  s.cache.discard(old[0].key);const oldIndex=bank.jobs.findIndex(job=>job.key===old[0].key)
  bank.prepareJob(oldIndex);expect(a.readOriginalCoverage).toHaveBeenCalledTimes(calls+1);expect(unused.readOriginalCoverage).not.toHaveBeenCalled();expect(replacement.readOriginalCoverage).toHaveBeenCalledOnce()
 }finally{close(s,bank)}
})
it('rejects malformed, unknown, conflicting and accessor selections before work',()=>{
 const a=input(),s=owners(),get=vi.fn(()=>a.asset),getter=Object.defineProperty({indexes:[5]},'asset',{get,enumerable:true})
 const invalid:unknown[]=[[],[{asset:a.asset,indexes:[]}],[{asset:a.asset,indexes:[5,5]}],[{asset:a.asset,indexes:[-0]}],[{asset:a.asset,indexes:[.5]}],[{asset:a.asset,indexes:[10]}],[{asset:{...a.asset,x:52},indexes:[5]}],[{asset:a.asset,indexes:[5]},{asset:a.asset,indexes:[6]}],[getter]]
 for(const value of invalid)expect(()=>Reflect.apply(canonicalMaskSourceBankBudget,undefined,[[a],value])).toThrow()
 expect(get).not.toHaveBeenCalled();expect(a.readOriginalCoverage).not.toHaveBeenCalled();expect(s.gl.createTexture).not.toHaveBeenCalled();s.cache.clear()
})
it('retains the old subset on cancelled/failed/budget-rejected growth and retires loss without GL deletion',()=>{
 const a=input(),s=owners(),bank=new CanonicalMaskSourceBank(s.gl,s.cache,s.cpu,[a],companion,[{asset:a.asset,indexes:[5]}])
 try{bank.prepareJob(0);const old=bank.resources(),reserved=s.cpu.reservedBytes,generation=bank.assertRequiredSourceBinding(a.asset,[5],s)
  const b={...a,readOriginalCoverage:vi.fn(()=>a.readOriginalCoverage.getMockImplementation()!())}
  expect(()=>bank.beginExtension([b],{gpuBytes:s.cache.budgetBytes,cpuBytes:0},[{asset:a.asset,indexes:[0]}])).toThrow('budgets')
  expect(b.readOriginalCoverage).not.toHaveBeenCalled()
  const cancelled=bank.beginExtension([b],companion,[{asset:a.asset,indexes:[0]}]);cancelled.prepareJob(0);cancelled.cancel();cancelled.cancel()
  expect(bank.resources()).toEqual(old);expect(s.cpu.reservedBytes).toBe(reserved);bank.assertCurrentOwners(generation)
  const error=Error('read failed'),failed=bank.beginExtension([{...a,readOriginalCoverage:()=>{throw error}}],companion,[{asset:a.asset,indexes:[1]}])
  expect(()=>failed.prepareJob(0)).toThrow(error);failed.cancel();expect(bank.resources()).toEqual(old)
  const upload=bank.beginExtension([b],companion,[{asset:a.asset,indexes:[1]}]),uploadError=Error('upload failed'),originalUpload=s.gl.texImage2D.getMockImplementation()
  s.gl.texImage2D.mockImplementation(()=>{throw uploadError});expect(()=>upload.prepareJob(0)).toThrow(uploadError);s.gl.texImage2D.mockImplementation(originalUpload!);upload.cancel()
  expect(bank.resources()).toEqual(old);expect(s.cpu.reservedBytes).toBe(reserved)
  const lost=bank.beginExtension([b],companion,[{asset:a.asset,indexes:[0]}]);lost.prepareJob(0);s.gl.deleteTexture.mockClear();bank.reset(true)
  expect(s.gl.deleteTexture).not.toHaveBeenCalled();expect(()=>bank.assertCurrentOwners(generation)).toThrow();lost.cancel(true);expect(s.cpu.reservedBytes).toBe(0)
 }finally{close(s,bank)}
})
