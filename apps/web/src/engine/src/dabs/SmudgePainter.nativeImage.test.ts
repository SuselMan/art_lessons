import { expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { MockGL } from '../../testing/mockGL'
import { SmudgePainter, type SmudgeContext } from './SmudgePainter'
import { BrushMipCache } from './BrushMipCache'
import { nativeImageDomain, nativeImageDomainUniform, nativeImageResource } from './NativeImageBank'
import { brushPreparationResources } from './BrushPreparation'
import { installBrushPixels } from '../presets/importedBrushes'
import { digitalBrushFromPreset } from '../presets/digitalBrushPresets'
import { WET_TRANSFER_FRAG, wetTransferFragment } from '../raster/wetMixShaders'

const id=`asset:${'a9'.repeat(32)}` as const
function brush() {
  installBrushPixels(id,new Uint8Array(8*8).fill(255))
  const b=structuredClone(digitalBrushFromPreset('hard-round'))
  b.model='mixer'
  b.tip={kind:'bitmap',mask:id,hardness:1,aspect:1,angle:0,rotation:'fixed',imageSampling:{kind:'integer-pyramid',signal:'inverse-gray',sourceRect:{x:1,y:1,width:3,height:5}}}
  return b
}
function fixture(pool?:BrushMipCache) {
  const gl=new MockGL()
  const painter=new SmudgePainter({gl:gl as unknown as WebGLRenderingContext,brushMipCache:pool} as SmudgeContext)
  return {gl,painter}
}
it('prewarms the finite wet NPOT bank and reuses all selected views without hot uploads',()=>{
  const {gl,painter}=fixture(),b=brush(),group=brushPreparationResources(b)
  const upload=vi.spyOn(gl,'texImage2D'),parameters=vi.spyOn(gl,'texParameteri')
  for(const r of group)painter.prepareTexture(group,r)
  expect(group.every(r=>painter.hasPreparedTexture(r))).toBe(true)
  const count=upload.mock.calls.length
  const lookup=Reflect.get(painter,'wetTexture') as (id:string,grain:boolean,discrete:boolean,image:unknown)=>unknown
  for(let n=0;n<80;n++)lookup.call(painter,id,false,false,nativeImageResource(id,b.tip,[.1,1,2.5,5,10,20,40][n%7]))
  expect(upload).toHaveBeenCalledTimes(count)
  expect(count).toBe(group.length)
  expect(parameters).toHaveBeenCalledWith(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR)
  expect(parameters).not.toHaveBeenCalledWith(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR)
  const calls=upload.mock.calls as unknown as unknown[][]
  expect(calls.some(c=>c[3]===5&&c[4]===7&&c[2]===gl.ALPHA)).toBe(true)
  painter.destroy()
})
it('rejects complete oversized banks before allocating or uploading any derivative',()=>{
  const {gl,painter}=fixture(),b=brush();b.tip.imageSampling!.sourceRect={x:0,y:0,width:2048,height:2048}
  const upload=vi.spyOn(gl,'texImage2D'),group=brushPreparationResources(b)
  expect(()=>painter.prepareTexture(group,group[0])).toThrow('texture budget')
  expect(upload).not.toHaveBeenCalled()
  painter.destroy()
})
it('shares CPU derivatives without clearing their owner on context loss or wet destruction',()=>{
  const pool=new BrushMipCache(),{painter}=fixture(pool),b=brush(),group=brushPreparationResources(b)
  painter.prepareTexture(group,group[0]);expect(pool.bytes).toBeGreaterThan(0)
  const bytes=pool.bytes;painter.forget();expect(pool.bytes).toBe(bytes)
  painter.destroy();expect(pool.bytes).toBe(bytes)
  pool.clear()
})
it('keeps both old compiler inputs immutable and lazily adds bounded native-domain sampling',()=>{
  expect(wetTransferFragment()).toBe(WET_TRANSFER_FRAG)
  // Pinned before this native-image change, including whitespace/compiler input.
  expect(createHash('sha256').update(WET_TRANSFER_FRAG).digest('hex')).toBe('8e2762ab38881dc6d04c06ef53cc4edf1c7723ea2be6b0962fe574f758c36de6')
  const procedural=wetTransferFragment(true),image=wetTransferFragment(true,true)
  expect(procedural).not.toContain('u_tipImageEnabled')
  expect(image).toContain('integerImageSample(u_tip,')
  expect(image).toContain('integerImageSample(u_dual,')
  expect(image).toContain('u_dualImageEnabled<0.5 && (abs(uv.x)>1.0')
  expect(image).toContain('pixel/u_dualProceduralGeometry.xy')
})

it('uses the separate image program and selected main/child bounds in independent physical frames',()=>{
  const {gl,painter}=fixture(),b=brush(),child=brush()
  child.tip={...child.tip,aspect:2,rotation:'fixed',angle:.73}
  b.behavior={version:2,dual:{brush:child,blendMode:'multiply'}}
  const texture=gl.createTexture(),buffer={width:64,height:64,beginReplaceDraw:vi.fn(),endDraw:vi.fn()}
  Reflect.set(painter,'ctx',{paper:{texture,worldSize:()=>({w:64,h:64}),scale:1,fillThreshold:0,fillCap:0},quadBuf:()=>gl.createBuffer()})
  painter.initGL()
  const compile=vi.spyOn(gl,'createProgram'),upload=vi.spyOn(gl,'texImage2D')
  painter.prepareIntegerImages();painter.prepareIntegerImages();expect(compile).toHaveBeenCalledTimes(1)
  const stamp={aspect:1,angle:-.3,edgeSoftness:0,opacityScale:1}
  const wet={stamp,paint:{brush:b,strength:1},seed:1}
  const draw=Reflect.get(painter,'drawTransferDab') as (...args:unknown[])=>void
  draw.call(painter,{buffer,originX:-16,originY:-32},{x:-2.25,y:-3.25,pressure:1,opacity:1},2.5,{texture},0,0,8,'lay',1,wet)
  const binding=Reflect.get(painter,'imageTransfer') as {program:{uniforms:Map<string,unknown>}}
  const u=binding.program.uniforms
  expect(u.get('u_tipImageEnabled')).toBe(1);expect(u.get('u_dualImageEnabled')).toBe(1)
  const main=nativeImageResource(id,b.tip,5)!,secondary=nativeImageResource(id,child.tip,5)!
  expect(u.get('u_tipBounds')).toEqual(Object.values(main.bounds))
  expect(u.get('u_dualBounds')).toEqual(Object.values(secondary.bounds))
  expect(u.get('u_dualProceduralGeometry')).toEqual([2.5,1.25,1,0])
  expect(u.get('u_dualProceduralAngle')).toBe(.73)
  expect(u.get('u_dualImageDomain')).toEqual(nativeImageDomainUniform(nativeImageDomain(child.tip,-2.25,-3.25,2.5,1.25,.73),-16,-32,64))
  expect(u.get('u_wickPx')).toBe(Math.SQRT2)
  const warmed=upload.mock.calls.length
  draw.call(painter,{buffer,originX:-16,originY:-32},{x:-2.25,y:-3.25,pressure:1,opacity:1},2.5,{texture},0,0,8,'lay',1,wet)
  expect(upload).toHaveBeenCalledTimes(warmed)
  expect(compile).toHaveBeenCalledTimes(1)
  painter.destroy()
})
