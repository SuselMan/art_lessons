import {expect,it,vi} from 'vitest'
import {inflateSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {canonicalImageSourceBinding,type BrushDescriptor} from '@grafetto/shared'
import fixture from '../presets/fixtures/sourcePngWholePath/guiStroke.native.json'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {nativeImageBank,nativeImageBankFromRect} from './NativeImageBank'
import {CanonicalMaskSourceBank,canonicalMaskSourceBankBudget} from './CanonicalMaskSourceBank'
import {BrushTextureCache} from './BrushTextureCache'
import {BrushMipCache} from './BrushMipCache'
const descriptor=fixture.descriptor as unknown as BrushDescriptor,asset=canonicalImageSourceBinding(descriptor,fixture.asset).assets[0]
const bytes=new Uint8Array(inflateSync(Buffer.from(fixture.asset.deflateBase64,'base64'),{maxOutputLength:65536}))
function owners(gpu=16*1048576,cpuBytes=4*1048576){const {gl}=recordingGL();return{gl,cache:new BrushTextureCache(gl,gpu),cpu:new BrushMipCache(cpuBytes)}}
it('reuses exact native rectangle planner keys, bounds and levels without adding a second cache',()=>{
 const old=nativeImageBank(asset.id as `asset:${string}`,descriptor.tip),rect={x:asset.x,y:asset.y,width:asset.width,height:asset.height}
 expect(nativeImageBankFromRect(asset.id as `asset:${string}`,rect)).toEqual(old)
 expect(nativeImageBank(asset.id as `asset:${string}`,descriptor.tip)).toBe(old)
 const fresh=nativeImageBankFromRect(asset.id as `asset:${string}`,rect)
 expect(nativeImageBankFromRect(asset.id as `asset:${string}`,rect)).not.toBe(fresh)
 rect.width=2;expect(fresh[0].rect.width).toBe(150)
})
it('uploads ALL actual Basic6 levels with exactly the same bytes and budgets from original asset data as legacy tip input',()=>{
 expect('asset:'+createHash('sha256').update(bytes).digest('hex')).toBe(asset.id)
 const a=owners(),b=owners(),read=()=>bytes
 const old=new CanonicalMaskSourceBank(a.gl,a.cache,a.cpu,[{id:asset.id as `asset:${string}`,tip:descriptor.tip,assetSide:asset.size,readOriginalCoverage:read}],{gpuBytes:0,cpuBytes:0})
 const bank=new CanonicalMaskSourceBank(b.gl,b.cache,b.cpu,[{asset,readOriginalCoverage:read}],{gpuBytes:0,cpuBytes:0})
 try{
  expect(bank.jobs).toEqual(old.jobs);expect(bank.gpuBytes).toBe(old.gpuBytes);expect(bank.maximumTransientCpuBytes).toBe(old.maximumTransientCpuBytes)
  old.jobs.forEach((_,i)=>old.prepareJob(i));bank.jobs.forEach((_,i)=>bank.prepareJob(i))
  const uploads=(gl:typeof a.gl)=>gl.texImage2D.mock.calls.map((call:unknown[])=>call[8])
  expect(uploads(b.gl)).toEqual(uploads(a.gl));expect(uploads(b.gl)).toHaveLength(bank.jobs.length)
  expect(bank.preparedResources()).toEqual(old.preparedResources())
  const generation=bank.assertSourceBinding(asset,b);bank.assertCurrentOwners(generation)
 }finally{old.reset();bank.reset();a.cache.clear();b.cache.clear()}
 expect(a.cpu.reservedBytes).toBe(0);expect(b.cpu.reservedBytes).toBe(0)
})
it('captures original asset scalars and read callback once without retaining mutable caller metadata',()=>{
 const o=owners(),mutable={...asset},read=vi.fn(()=>bytes)
 const input:{asset:typeof mutable;readOriginalCoverage:()=>Uint8Array}={asset:mutable,readOriginalCoverage:read}
 const bank=new CanonicalMaskSourceBank(o.gl,o.cache,o.cpu,[input],{gpuBytes:0,cpuBytes:0})
 mutable.width=2;mutable.size=2;input.readOriginalCoverage=()=>{throw Error('Replaced reader')}
 try{bank.jobs.forEach((_,i)=>bank.prepareJob(i));expect(bank.assertSourceBinding(asset,o)).toBeTypeOf('number');expect(read).toHaveBeenCalledTimes(bank.jobs.length)}finally{bank.reset();o.cache.clear()}
 expect(o.cpu.reservedBytes).toBe(0)
})
it.each(['crop','side','id','negativeZero','extra','mixed','assetGetter','readerGetter','fieldGetter','symbol','nonenumerable'] as const)('rejects %s data input before pixel read, texture allocation or GL query',kind=>{
 const o=owners(),read=vi.fn(()=>bytes),get=vi.fn(()=>asset),a={...asset}
 let input:object={asset:a,readOriginalCoverage:read}
 if(kind==='crop')a.x=200
 if(kind==='side')a.size=128
 if(kind==='id')a.id='asset:BAD'
 if(kind==='negativeZero')a.y=-0
 if(kind==='extra')Object.assign(a,{extra:1})
 if(kind==='mixed')input={asset:a,id:asset.id,tip:descriptor.tip,assetSide:asset.size,readOriginalCoverage:read}
 if(kind==='assetGetter')Object.defineProperty(input,'asset',{get})
 if(kind==='readerGetter')Object.defineProperty(input,'readOriginalCoverage',{get})
 if(kind==='fieldGetter')Object.defineProperty(a,'width',{get})
 if(kind==='symbol')Object.defineProperty(a,Symbol('extra'),{value:1})
 if(kind==='nonenumerable')Object.defineProperty(a,'extra',{value:1})
 const query=vi.spyOn(o.gl,'getParameter');query.mockClear();o.gl.createTexture.mockClear()
 expect(()=>Reflect.construct(CanonicalMaskSourceBank,[o.gl,o.cache,o.cpu,[input],{gpuBytes:0,cpuBytes:0}])).toThrow()
 expect(get).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();expect(o.gl.createTexture).not.toHaveBeenCalled();expect(o.cpu.reservedBytes).toBe(0)
})
it.each(['gpu','cpu'] as const)('keeps existing %s budget refusal before original image reads/uploads',kind=>{
 const o=owners(kind==='gpu'?1:16*1048576,kind==='cpu'?1:4*1048576),read=vi.fn(()=>bytes)
 expect(()=>new CanonicalMaskSourceBank(o.gl,o.cache,o.cpu,[{asset,readOriginalCoverage:read}],{gpuBytes:0,cpuBytes:0})).toThrow()
 expect(read).not.toHaveBeenCalled();expect(o.gl.createTexture).not.toHaveBeenCalled();expect(o.cpu.reservedBytes).toBe(0)
})
it('plans exact unique resource bytes and sequential CPU peak without GL or original reader invocation',()=>{
 const o=owners(),read=vi.fn(()=>bytes),inputs=[{asset,readOriginalCoverage:read},{asset:{...asset,id:'asset:'+'b'.repeat(64)},readOriginalCoverage:read},{asset,readOriginalCoverage:read}],query=vi.spyOn(o.gl,'getParameter')
 const planned=canonicalMaskSourceBankBudget(inputs)
 expect(read).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();expect(o.gl.createTexture).not.toHaveBeenCalled()
 const bank=new CanonicalMaskSourceBank(o.gl,o.cache,o.cpu,inputs,{gpuBytes:0,cpuBytes:0})
 try{
  expect(planned.gpuBytes).toBe(bank.gpuBytes);expect(planned.metadataCpuBytes).toBe(bank.metadataCpuBytes);expect(planned.maximumTransientCpuBytes).toBe(bank.maximumTransientCpuBytes)
  expect(planned.resources).toEqual(bank.jobs.map(({key,bytes})=>({key,bytes})));expect(new Set(planned.resources.map(r=>r.key)).size).toBe(planned.resources.length)
  expect(planned.maximumTransientCpuBytes).toBeLessThan(bank.jobs.reduce((n,j)=>n+j.transientCpuBytes,0));expect(planned.maximumSourceCpuBytes).toBe(asset.size*asset.size)
 }finally{bank.reset();o.cache.clear()}
})
