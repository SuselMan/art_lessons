import { expect, it, vi } from 'vitest'
import {BrushMipCache} from './BrushMipCache'
import {BrushTextureCache} from './BrushTextureCache'
import {runBrushGlTurn,runBrushGlBatch,type BrushGlBatchParticipant} from './BrushGlBatch'
import {createBrushGlContextOwner} from './BrushGlState'
import { MockGL } from '../../testing/mockGL'
import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import { TiledLayerBuffer } from '../buffers/TiledLayerBuffer'
import { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import {attachContextStorage,snapshotContextStorage} from '../buffers/ContextStorageOwner'
import { bindCanonicalLayerTargets,prepareCanonicalLayerFrame,isCanonicalOwnedLifetime,createCanonicalRawLifetime } from './CanonicalLayerTargets'

it('binds actual straight tile handles to one validated batch lifetime, and rejects stale re-acquisition', () => {
  const gl = new MockGL() as unknown as WebGLRenderingContext
  const layer = new TiledLayerBuffer(gl, 4, 4, undefined, undefined, undefined, 'straight-rgba8')
  const input = layer.resolveForPaint({ minX: -1, minY: -1, maxX: 1, maxY: 1 })
  const bound = bindCanonicalLayerTargets(layer, input)
  expect(bound).toHaveLength(4)
  for (let i = 0; i < bound.length; i++) {
    expect(bound[i].texture).toBe(input[i].buffer.texture)
    expect(bound[i].framebuffer).toBe(input[i].buffer.fbo)
    expect(bound[i].originX).toBe(input[i].originX)
    expect(bound[i].originY).toBe(input[i].originY)
    expect(bound[i].lifetime).toBe(bound[0].lifetime)
  }
  const release = bound[0].lifetime.lease()
  expect(() => layer.clear()).toThrow('retained')
  release(); release()
  layer.clear()
  layer.resolveForPaint({ minX: -1, minY: -1, maxX: 1, maxY: 1 })
  expect(() => bound[0].lifetime.lease()).toThrow('stale')
  layer.destroy()
})
it('refuses PM storage and foreign tiles before creating a canonical binding', () => {
  const gl = new MockGL() as unknown as WebGLRenderingContext
  const pm = new TiledLayerBuffer(gl, 4, 4)
  const a = new TiledLayerBuffer(gl, 4, 4, undefined, undefined, undefined, 'straight-rgba8')
  const b = new TiledLayerBuffer(gl, 4, 4, undefined, undefined, undefined, 'straight-rgba8')
  const rect = { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  try {
    expect(() => bindCanonicalLayerTargets(pm, pm.resolveForPaint(rect))).toThrow('straight')
    expect(() => bindCanonicalLayerTargets(a, b.resolveForPaint(rect))).toThrow('Foreign')
    expect(() => a.clear()).not.toThrow()
  } finally { pm.destroy(); a.destroy(); b.destroy() }
})

it('publishes unique cold certificates only for actual retained targets',()=>{
  const gl=new MockGL() as unknown as WebGLRenderingContext,layer=new TiledLayerBuffer(gl,4,4,undefined,undefined,undefined,'straight-rgba8')
  try{
    const target=layer.resolveForPaint({minX:0,minY:0,maxX:1,maxY:1})[0],bound=bindCanonicalLayerTargets(layer,[target,target])
    const layouts=bound[0].lifetime.ownedFramebufferLayouts!
    expect(layouts).toHaveLength(1);expect(Object.isFrozen(layouts)).toBe(true);expect(Object.isFrozen(layouts[0])).toBe(true)
    expect(layouts[0].source).toBe(target.buffer);expect(layouts[0].certificate).toBe(target.buffer.verifiedFramebufferLayout)
    expect(layouts[0].originX).toBe(0);expect(layouts[0].originY).toBe(0)
    AccumulationBuffer.forgetContextStorage(gl) // isolated MockGL generation only
    expect(()=>bindCanonicalLayerTargets(layer,[target])).toThrow(/certificate/)
  }finally{layer.destroy()}
})

it('couples missing-only layer and same-pool admission without eager allocations or double physical charge',()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext,layer=new TiledLayerBuffer(gl,4,4,undefined,undefined,undefined,'straight-rgba8'),pool=new RibbonScratchPool(gl)
 attachContextStorage(gl,{limitBytes:192})
 const resident=layer.resolveForPaint({minX:0,minY:0,maxX:4,maxY:4})[0],idle=pool.acquire(4,4,'straight-rgba8');pool.release(idle)
 const plan=prepareCanonicalLayerFrame(layer,pool,[{minX:0,minY:0,maxX:8,maxY:4}],[{width:4,height:4,pixelEncoding:'straight-rgba8'}])
 expect(snapshotContextStorage(gl)).toMatchObject({residentBytes:128,reservedBytes:64})
 expect(plan.takeTarget(0).buffer).toBe(resident.buffer);expect(plan.takeScratch(0)).toBe(idle)
 plan.takeTarget(1);expect(snapshotContextStorage(gl)).toMatchObject({residentBytes:192,reservedBytes:0})
 plan.close();pool.destroy();layer.destroy();expect(snapshotContextStorage(gl)).toMatchObject({residentBytes:0,reservedBytes:0})
})

it('closes every coupled owner after a partial scratch failure and preserves the first exact cleanup error',()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext,layer=new TiledLayerBuffer(gl,4,4,undefined,undefined,undefined,'straight-rgba8'),pool=new RibbonScratchPool(gl)
 const plan=prepareCanonicalLayerFrame(layer,pool,[{minX:0,minY:0,maxX:4,maxY:4}],Array.from({length:2},()=>({width:4,height:4,pixelEncoding:'straight-rgba8' as const})))
 plan.takeTarget(0);plan.takeScratch(0);plan.takeScratch(1)
 const first=new Error('release first'),release=pool.release.bind(pool),spy=vi.spyOn(pool,'release').mockImplementation(buffer=>{release(buffer);throw first})
 expect(()=>plan.close()).toThrow(first);expect(spy).toHaveBeenCalledTimes(2);expect(()=>layer.clear()).not.toThrow()
 plan.close();spy.mockRestore();pool.destroy();layer.destroy()
})

it('tracks resident-only target and scratch takes in the same coupled ownership for cancellation',()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext,layer=new TiledLayerBuffer(gl,4,4,undefined,undefined,undefined,'straight-rgba8'),pool=new RibbonScratchPool(gl)
 attachContextStorage(gl,{limitBytes:192})
 const resident=layer.resolveForPaint({minX:0,minY:0,maxX:4,maxY:4})[0],idle=pool.acquire(4,4,'straight-rgba8');pool.release(idle)
 const plan=prepareCanonicalLayerFrame(layer,pool,[{minX:0,minY:0,maxX:8,maxY:4}],[{width:4,height:4,pixelEncoding:'straight-rgba8'}])
 try{
  expect(plan.takeResidentTarget(0)?.buffer).toBe(resident.buffer);expect(plan.takeResidentTarget(1)).toBeUndefined()
  expect(plan.takeResidentScratch(0)).toBe(idle);expect(plan.scratchAt(0)).toBe(idle)
  expect(()=>plan.takeResidentScratch(0)).toThrow();expect(snapshotContextStorage(gl)).toMatchObject({residentBytes:128,reservedBytes:64})
 }finally{plan.close();pool.destroy();layer.destroy()}
 expect(snapshotContextStorage(gl)).toMatchObject({residentBytes:0,reservedBytes:0})
})

it('marks only native factory leases; fake/custom layers stay functional without receiving closed-callback provenance',()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext,layer=new TiledLayerBuffer(gl,4,4,undefined,undefined,undefined,'straight-rgba8'),targets=layer.resolveForPaint({minX:0,minY:0,maxX:1,maxY:1})
 try{
  const genuine=bindCanonicalLayerTargets(layer,targets)[0].lifetime
  expect(isCanonicalOwnedLifetime(gl,genuine)).toBe(true);expect(isCanonicalOwnedLifetime(gl,{...genuine})).toBe(false)
  const fake={pixelEncoding:'straight-rgba8',retainTargets:vi.fn(()=>()=>{})} as unknown as TiledLayerBuffer
  const external=bindCanonicalLayerTargets(fake,targets)[0].lifetime
  expect(isCanonicalOwnedLifetime(gl,external)).toBe(false);expect(()=>external.lease()()).not.toThrow()
  const accessor=vi.fn(()=>TiledLayerBuffer.prototype.retainTargets)
  Object.defineProperty(layer,'retainTargets',{get:accessor})
  expect(()=>isCanonicalOwnedLifetime(gl,genuine)).not.toThrow();expect(isCanonicalOwnedLifetime(gl,genuine)).toBe(false);expect(accessor).not.toHaveBeenCalled()
 }finally{layer.destroy()}
})
it('native raw provenance requires real buffers and plain owned metadata; later owner accessors remove the optional trust',()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext,buffer=new AccumulationBuffer(gl,4,4,'nearest','straight-rgba8'),owner={alive:true,leases:0},position={x:0,y:0,width:4,height:4}
 try{
  const native=createCanonicalRawLifetime(gl,owner,buffer,position)
  expect(isCanonicalOwnedLifetime(gl,native)).toBe(true);const release=native.lease();expect(owner.leases).toBe(1);release();expect(owner.leases).toBe(0)
  Object.defineProperty(owner,'alive',{get:()=>true,configurable:true})
  expect(isCanonicalOwnedLifetime(gl,native)).toBe(false)
  const external=createCanonicalRawLifetime(gl,owner,buffer,position)
  expect(isCanonicalOwnedLifetime(gl,external)).toBe(false);external.lease()();expect(owner.leases).toBe(0)
 }finally{buffer.destroy()}
})

it('downgrades the whole turn before acquiring a native target whose later method became an accessor',()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext,layer=new TiledLayerBuffer(gl,4,4,undefined,undefined,undefined,'straight-rgba8'),cpu=new BrushMipCache(),cache=new BrushTextureCache(gl)
 try{
  const lifetime=bindCanonicalLayerTargets(layer,layer.resolveForPaint({minX:0,minY:0,maxX:1,maxY:1}))[0].lifetime,buffer=gl.createBuffer()!,texture=gl.createTexture()!
  const original=gl.getParameter.bind(gl)
  Object.assign(gl,{VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,isBuffer:()=>true,isTexture:()=>true,colorMask:()=>{}})
  vi.spyOn(gl,'getParameter').mockImplementation((p:number)=>p===gl.ARRAY_BUFFER_BINDING?buffer:p===gl.TEXTURE_BINDING_2D?texture:p===9001?[0,0,4,4]:p===9002?[0,0,0,0]:p===9003?[true,true,true,true]:original(p))
  const pair=createBrushGlContextOwner(gl,{bufferIsCurrent:b=>b===buffer,textureIsCurrent:t=>t===texture}),epoch={}
  const service:BrushGlBatchParticipant={brushGlBatchInfo:()=>({gl,cache,cpu,epoch,attributes:[],instancing:null,vertexArrays:null,resources:[],contextOwner:pair.owner}),enterBrushGlBatch:()=>()=>{}}
  const accessor=vi.fn(()=>{gl.deleteBuffer(buffer);gl.deleteTexture(texture);return TiledLayerBuffer.prototype.retainTargets})
  Object.defineProperty(layer,'retainTargets',{get:accessor})
  const buffers=vi.spyOn(gl,'isBuffer'),textures=vi.spyOn(gl,'isTexture')
  runBrushGlTurn({participants:[service],callbackScope:pair.callbackScope},turn=>runBrushGlBatch({turn,participants:[service],owners:[lifetime]},()=>{}))
  expect(accessor).not.toHaveBeenCalled();expect(buffers).toHaveBeenCalledWith(buffer);expect(textures).toHaveBeenCalledWith(texture);expect(cpu.reservedBytes).toBe(0)
 }finally{layer.destroy();vi.restoreAllMocks()}
})
