import {expect,it,vi} from 'vitest'
import {canonicalPrimaryTexturePin} from '@grafetto/shared'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {CanonicalMaskSourceBank,assertCanonicalPatternResourceCurrent,type CanonicalPatternSourceInput} from './CanonicalMaskSourceBank'
import {BrushMipCache} from './BrushMipCache'
import {BrushTextureCache} from './BrushTextureCache'
const companion={gpuBytes:0,cpuBytes:0}
function fixture(cpuBytes=4*1024*1024){const{gl,snapshot}=recordingGL();gl.LUMINANCE=0x1909;const cache=new BrushTextureCache(gl),cpu=new BrushMipCache(cpuBytes),bank=new CanonicalMaskSourceBank(gl,cache,cpu,[],companion,undefined,'root-residency');return{gl,cache,cpu,bank,snapshot}}
function input(side=256,offset=0):CanonicalPatternSourceInput{
 const asset=Object.freeze({id:'asset:'+'a'.repeat(64),size:side,x:0,y:0,width:side-4,height:side-4})
 const pin=canonicalPrimaryTexturePin({kind:'canvasTexture',asset:asset.id,law:'subtract-u8-v1',width:asset.width,height:asset.height,periodX:asset.width,periodY:asset.height,offsetX:offset,offsetY:0,strength:'pressure-identity-v1'},asset)
 return{kind:'raw-pattern-l8',asset,pin,readOriginalGray:vi.fn(()=>Uint8Array.from({length:side*side},(_,i)=>i%256))}
}
function prepare(s:ReturnType<typeof fixture>,a=input()) {const p=s.bank.prepareRoot([a],companion);p.jobs.forEach((_,i)=>expect(p.prepareJob(i)).toBe('ready'));p.assertPreparedPublication();const root=p.publish();p.finalizeCleanup();return root}
function cleanup(s:ReturnType<typeof fixture>){s.bank.reset();s.cache.clear();expect(s.cpu.reservedBytes).toBe(0)}
it('uploads one unchanged original square L8 at both NEAREST filters without exposing a NativeImage resource',()=>{
 const s=fixture(),a=input(),before=s.snapshot();try{
  const root=prepare(s,a),job=s.bank.jobs[0],view=root.patternResource(a.pin,a.asset,s)
  expect(job.kind).toBe('raw-pattern-l8');expect(Object.hasOwn(job,'resource')).toBe(false);expect(s.bank.jobs).toHaveLength(1);expect(job.bytes).toBe(262144)
  expect(root.resources()).toEqual([]);expect(root.preparedResources()).toEqual([]);expect(()=>root.assertRequiredSourceBinding(a.asset,[0],s)).toThrow()
  expect(s.gl.texImage2D).toHaveBeenCalledTimes(1);const call=s.gl.texImage2D.mock.calls[0]
  expect(call.slice(0,8)).toEqual([s.gl.TEXTURE_2D,0,s.gl.LUMINANCE,256,256,0,s.gl.LUMINANCE,s.gl.UNSIGNED_BYTE]);expect(call[8]).toEqual(a.readOriginalGray())
  for(const name of [s.gl.TEXTURE_MIN_FILTER,s.gl.TEXTURE_MAG_FILTER])expect(s.gl.texParameteri).toHaveBeenCalledWith(s.gl.TEXTURE_2D,name,s.gl.NEAREST)
  for(const name of [s.gl.TEXTURE_WRAP_S,s.gl.TEXTURE_WRAP_T])expect(s.gl.texParameteri).toHaveBeenCalledWith(s.gl.TEXTURE_2D,name,s.gl.CLAMP_TO_EDGE)
  expect(s.snapshot()).toEqual(before);expect(view.width).toBe(256);expect(view.asset.width).toBe(252);assertCanonicalPatternResourceCurrent(view,s)
  expect(()=>assertCanonicalPatternResourceCurrent({...view},s)).toThrow(/Unknown/)
  root.release();expect(()=>assertCanonicalPatternResourceCurrent(view,s)).toThrow()
 }finally{cleanup(s)}
})
it('shares exact raw storage across phase-distinct roots and independent retained handle lifetimes',()=>{
 const s=fixture(),a=input(),b=input(256,9);try{
  const first=prepare(s,a),view=first.patternResource(a.pin,a.asset,s),second=prepare(s,b),child=second.retain()
  expect(s.gl.texImage2D).toHaveBeenCalledTimes(1);expect(b.readOriginalGray).not.toHaveBeenCalled();expect(second.patternResource(b.pin,b.asset,s).texture).toBe(view.texture)
  first.release();expect(()=>assertCanonicalPatternResourceCurrent(view,s)).toThrow();expect(second.isReady()).toBe(true);expect(s.bank.jobs).toHaveLength(1)
  second.release();expect(child.patternResource(b.pin,b.asset,s).texture).toBe(view.texture);child.release();expect(s.bank.jobs).toHaveLength(0);expect(s.bank['inputs'].size).toBe(0)
  const c={...a,readOriginalGray:vi.fn(()=>{throw Error('cache hit cannot read stale provider')})},last=prepare(s,c);expect(c.readOriginalGray).not.toHaveBeenCalled();last.release()
 }finally{cleanup(s)}
})
it('requires genuine root owner, exact role/asset, current storage and a noncopied view',()=>{
 const s=fixture(),a=input();try{const root=prepare(s,a),view=root.patternResource(a.pin,a.asset,s)
  expect(()=>root.patternResource(a.pin,a.asset,{...s,cpu:new BrushMipCache()})).toThrow(/owner/)
  const other={...a.asset,id:'asset:'+'b'.repeat(64)};expect(()=>root.patternResource(a.pin,other,s)).toThrow()
  s.cache.discard(view.key);expect(()=>assertCanonicalPatternResourceCurrent(view,s)).toThrow();expect(()=>root.patternResource(a.pin,a.asset,s)).toThrow();root.release()
 }finally{cleanup(s)}
})
it('reserves the borrowed original CPU workspace before reader or GL allocation',()=>{
 const s=fixture(96*1024),a=input(512);try{const p=s.bank.prepareRoot([a],companion);expect(()=>p.prepareJob(0)).toThrow(/CPU budget/);expect(a.readOriginalGray).not.toHaveBeenCalled();expect(s.gl.createTexture).not.toHaveBeenCalled();p.cancel()
 }finally{cleanup(s)}
})
it.each(['cancel','reset']as const)('revalidates after a provider %s without uploading or retaining bytes',mode=>{
 const s=fixture(),a={...input()};let p:ReturnType<CanonicalMaskSourceBank['prepareRoot']>
 a.readOriginalGray=vi.fn(()=>{if(mode==='cancel')p.cancel();else s.bank.reset();return new Uint8Array(65536)})
 try{p=s.bank.prepareRoot([a],companion);expect(p.prepareJob(0)).toBe('cancelled');expect(s.gl.createTexture).not.toHaveBeenCalled();expect(s.bank.jobs).toHaveLength(0);p.cancel()}finally{cleanup(s)}
})
it('releases failed upload ownership and can retry the same prepared job',()=>{
 const s=fixture(),a=input();try{const p=s.bank.prepareRoot([a],companion),baseline=s.cpu.reservedBytes
  s.gl.texImage2D.mockImplementationOnce(()=>{throw Error('upload failed')});expect(()=>p.prepareJob(0)).toThrow('upload failed');expect(s.cpu.reservedBytes).toBe(baseline);expect(s.cache.bytes).toBe(0);expect(s.gl.deleteTexture).toHaveBeenCalledTimes(1)
  expect(p.prepareJob(0)).toBe('ready');p.assertPreparedPublication();const root=p.publish();root.release()
 }finally{cleanup(s)}
})
it('rejects old handles/views on context-loss reset and cleans each retained root once',()=>{
 const s=fixture(),a=input();try{const root=prepare(s,a),child=root.retain(),view=child.patternResource(a.pin,a.asset,s);s.gl.isContextLost=()=>true;s.bank.reset(true)
  expect(()=>child.patternResource(a.pin,a.asset,s)).toThrow();expect(()=>assertCanonicalPatternResourceCurrent(view,s)).toThrow();root.release(true);child.release(true);expect(s.bank['inputs'].size).toBe(0)
 }finally{cleanup(s)}
})
it('protects and retains the complete image plus pattern publication group',()=>{
 const s=fixture(),a=input(),asset={id:'asset:'+'b'.repeat(64),size:8,x:0,y:0,width:8,height:8};try{
  const p=s.bank.prepareRoot([{asset,readOriginalCoverage:()=>new Uint8Array(64)},a],companion,[{asset,indexes:[0]}]);p.jobs.forEach((_,i)=>p.prepareJob(i));p.assertPreparedPublication();const root=p.publish()
  expect(root.resources()).toHaveLength(1);expect(root.preparedResources()).toHaveLength(1);expect(root.patternResource(a.pin,a.asset,s).asset).toEqual(a.asset);expect(s.cache.bytes).toBe(p.jobs.reduce((n,j)=>n+j.bytes,0));root.release()
 }finally{cleanup(s)}
})
it('rejects getter metadata without calling it or retaining root planning reservations',()=>{
 const s=fixture(),a=input(),getter=vi.fn(()=>a.pin.asset),bad={...a,pin:Object.defineProperty({...a.pin},'asset',{enumerable:true,get:getter})};try{
  const bytes=s.cpu.reservedBytes;expect(()=>s.bank.prepareRoot([bad],companion)).toThrow();expect(getter).not.toHaveBeenCalled();expect(a.readOriginalGray).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(bytes)
 }finally{cleanup(s)}
})
it('retires an uploaded but unpublished texture when cancellation happens inside its native upload',()=>{
 const s=fixture(),a=input();try{const p=s.bank.prepareRoot([a],companion);s.gl.texImage2D.mockImplementationOnce(()=>p.cancel())
  expect(p.prepareJob(0)).toBe('cancelled');expect(s.cache.bytes).toBe(0);expect(s.gl.deleteTexture).toHaveBeenCalledTimes(1);expect(s.cpu.reservedBytes).toBe(512)
 }finally{cleanup(s)}
})
it('rejects wrong original byte layout and pattern lookup from a genuine image-only root',()=>{
 const s=fixture(),a=input();try{
  const p=s.bank.prepareRoot([{...a,readOriginalGray:()=>new Uint8Array(252*252)}],companion);expect(()=>p.prepareJob(0)).toThrow(/layout/);expect(s.gl.texImage2D).not.toHaveBeenCalled();p.cancel()
  const asset={...a.asset,id:'asset:'+'b'.repeat(64),size:8,width:8,height:8},q=s.bank.prepareRoot([{asset,readOriginalCoverage:()=>new Uint8Array(64)}],companion,[{asset,indexes:[0]}]);q.prepareJob(0);q.assertPreparedPublication();const root=q.publish();expect(()=>root.patternResource(a.pin,a.asset,s)).toThrow(/binding/);root.release()
 }finally{cleanup(s)}
})
it('refuses raw patterns at legacy full constructor and extension before readers, reservations or GL callbacks',()=>{
 const s=fixture(),a=input(),asset={id:'asset:'+'b'.repeat(64),size:8,x:0,y:0,width:8,height:8};let full:CanonicalMaskSourceBank|undefined
 try{
  const reserve=vi.spyOn(s.cpu,'reserve'),query=vi.spyOn(s.gl,'getParameter')
  expect(()=>new CanonicalMaskSourceBank(s.gl,s.cache,s.cpu,[a],companion)).toThrow(/root residency/)
  expect(reserve).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();expect(a.readOriginalGray).not.toHaveBeenCalled();reserve.mockRestore();query.mockRestore()
  full=new CanonicalMaskSourceBank(s.gl,s.cache,s.cpu,[{asset,readOriginalCoverage:()=>new Uint8Array(64)}],companion,[{asset,indexes:[0]}]);full.prepareJob(0)
  const bytes=s.cpu.reservedBytes,again=vi.spyOn(s.cpu,'reserve'),glQuery=vi.spyOn(s.gl,'getParameter'),owned=full.jobs
  expect(()=>full!.beginExtension([a],companion)).toThrow(/root residency/);expect(again).not.toHaveBeenCalled();expect(glQuery).not.toHaveBeenCalled();expect(a.readOriginalGray).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(bytes);expect(full.jobs).toBe(owned)
  expect(()=>full!.beginExtension(new Array(257),companion)).toThrow(/plan/)
 }finally{full?.reset();cleanup(s)}
})
