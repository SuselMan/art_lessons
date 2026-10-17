import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { MockGL } from '../../../testing/mockGL'
import { AccumulationBuffer } from '../../buffers/AccumulationBuffer'
import { MaterialFieldPages, type MaterialFieldSnapshot } from './MaterialFieldPages'
import { buildPagedTapAtlas, createPagedContrastPhase, type PagedBufferFactory } from './PagedContrastPhase'
import { createPagedBackgroundMix } from './PagedBackgroundMix'
import { puddleLowDimensions } from './PuddleDimensions'

function raw(width:number,height:number){
 const make=()=>new MaterialFieldPages({width,height,pageSize:7}).snapshot()
 return {p:make(),c:make(),water:make()}
}
function harness(){
 const mock=new MockGL(),gl=mock as unknown as WebGLRenderingContext
 const buffers:Array<AccumulationBuffer&{dead:boolean}>=[]
 let remaining=Infinity
 const factory:PagedBufferFactory=(width,height,filter)=>{
  if(remaining--===0)throw Error('allocation failed')
  // Control-flow/allocation tests only. This fake does not execute any shader.
  const b={width,height,filter,texture:{},dead:false,
   beginReplaceDraw(){},endDraw(){},writePixels:vi.fn(),readPixels:()=>new Uint8Array(width*height*4),
   destroy(){this.dead=true}}
  buffers.push(b as unknown as typeof buffers[number]);return b as unknown as AccumulationBuffer
 }
 return {gl,buffers,factory,fail(after=0){remaining=after}}
}
describe('paged global phase contracts (not GPU pixel verification)',()=>{
 it('preserves the original split, smoothing and reconstruction physics text with only sampler-space substitutions',()=>{
  const source=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8')
  const originalContrast=source('./ContrastPhase.ts'),pagedContrast=source('./PagedContrastPhase.ts')
  const split=(s:string)=>s.match(/const split=createProgram\(gl,[^,]+,common\+`([^`]+)`\)/)![1]!
  expect(split(pagedContrast)).toBe(split(originalContrast).replaceAll('texture2D(color,uv)','texture2D(color,localUV)').replaceAll('texture2D(pigment,uv)','texture2D(pigment,localUV)'))
  const originalBackground=source('./BackgroundMix.ts'),pagedBackground=source('./PagedBackgroundMix.ts')
  const smooth=(s:string)=>s.match(/const smooth=createProgram\(gl,[^,]+,'([^']+)'\)/)![1]!
  expect(smooth(pagedBackground)).toBe(smooth(originalBackground))
  const reconstruct=(s:string)=>s.match(/const reconstruct(?:Program)?=createProgram\(gl,[^,]+,`([^`]+)`\)/)![1]!
  expect(reconstruct(pagedBackground)).toBe(reconstruct(originalBackground)
   .replace('varying vec2 uv;','varying vec2 uv;varying vec2 localUV;')
   .replace('uniform vec2 worldSize;','uniform vec2 worldSize,windowOrigin,windowExtent;')
   .replaceAll('texture2D(source,uv)','texture2D(source,localUV)')
   .replaceAll('texture2D(coverage,uv)','texture2D(coverage,localUV)')
   .replaceAll('texture2D(coverage,shifted)','texture2D(coverage,(shifted*worldSize-windowOrigin)/windowExtent)'))
 })

 it('packs independent nearest taps at global centres across page edges and clamp boundaries',()=>{
  const width=29,height=19,grid={width:9,height:8},offsets=[-12,0,12],source=new MaterialFieldPages({width,height,pageSize:7})
  const pixels=Uint8Array.from({length:width*height*4},(_,i)=>(i*29+Math.floor(i/11))%256)
  source.writeRect({x:0,y:0,width,height},pixels)
  const atlas=buildPagedTapAtlas(source.snapshot(),grid,offsets)
  for(let gy=0;gy<grid.height;gy++)for(let gx=0;gx<grid.width;gx++)for(let oy=0;oy<3;oy++)for(let ox=0;ox<3;ox++){
   const x=Math.min(width-1,Math.max(0,Math.floor((gx+.5)/grid.width*width+offsets[ox]!)))
   const y=Math.min(height-1,Math.max(0,Math.floor((gy+.5)/grid.height*height+offsets[oy]!)))
   const at=((gy*3+oy)*grid.width*3+gx*3+ox)*4
   expect(atlas.subarray(at,at+4)).toEqual(pixels.subarray((y*width+x)*4,(y*width+x)*4+4))
  }
 })
 it('bounds snapshot requests to one page row even for a million-pixel sheet',()=>{
  const widths:number[]=[]
  const source:MaterialFieldSnapshot={width:1_000_003,height:3,pageSize:512,revision:0,readRect(rect){widths.push(rect.width);expect(rect.height).toBe(1);return new Uint8Array(rect.width*4)}}
  const grid=puddleLowDimensions(source)
  expect(buildPagedTapAtlas(source,grid,[-48,-24,0,24,48]).length).toBe(grid.width*grid.height*25*4)
  expect(Math.max(...widths)).toBeLessThanOrEqual(512)
 })
 it('contrast keeps prepared state on failed allocation, allocates no full sheet texture, and disposes all resources',()=>{
  const h=harness(),size={width:2480,height:3508},phase=createPagedContrastPhase(h.gl,()=>({minimumRegionArea:12}),size,h.factory)
  phase.prepare(raw(size.width,size.height),true)
  const selection=phase.selection
  h.fail(4);expect(()=>phase.prepare(raw(size.width,size.height),true)).toThrow('allocation failed')
  expect(phase.selection).toBe(selection)
  expect(h.buffers.every(b=>b.width<=1280&&b.height<=1280)).toBe(true)
  phase.destroy();expect(h.buffers.every(b=>b.dead)).toBe(true)
 })
 it('background preserves prepared coarse state and frees partially allocated replacement on failure',()=>{
  const h=harness(),size={width:31,height:47},r=raw(size.width,size.height)
  const phase=createPagedBackgroundMix(h.gl,size,()=>({}),false,h.factory)
  const capture={initialP:r.p,referenceP:r.p,coverage:r.c}
  phase.capture(capture);phase.prepareSolved(r)
  const before=phase.readback(),live=h.buffers.filter(b=>!b.dead)
  h.fail(4);expect(()=>phase.prepareSolved(r)).toThrow('allocation failed')
  expect(phase.readback().afterP.length).toBe(before.afterP.length)
  expect(h.buffers.filter(b=>!b.dead).length).toBe(live.length);live.forEach(b=>expect(b.dead).toBe(false))
  h.fail(2);expect(()=>phase.capture(capture)).toThrow('allocation failed')
  expect(phase.readback().afterP.length).toBe(before.afterP.length)
  expect(h.buffers.filter(b=>!b.dead).length).toBe(live.length);live.forEach(b=>expect(b.dead).toBe(false))
  phase.destroy();expect(h.buffers.every(b=>b.dead)).toBe(true)
 })
 it('background builds a single global grid, invalidates solved state on capture, and releases transient buffers',()=>{
  const h=harness(),size={width:3508,height:2480},r=raw(size.width,size.height)
  const phase=createPagedBackgroundMix(h.gl,size,()=>({backgroundDistortion:.6}),false,h.factory)
  expect(()=>phase.prepareSolved(r)).toThrow('not captured')
  phase.capture({initialP:r.p,referenceP:r.p,coverage:r.c});phase.prepareSolved(r)
  expect(phase.reconstructionHalo).toBe(21)
  expect(phase.readback().afterP.length).toBe(puddleLowDimensions(size).width*puddleLowDimensions(size).height*4)
  phase.capture({initialP:r.p,referenceP:r.p,coverage:r.c})
  expect(()=>phase.readback()).toThrow('not prepared')
  expect(h.buffers.every(b=>b.width<=768&&b.height<=768)).toBe(true)
  phase.destroy();expect(h.buffers.every(b=>b.dead)).toBe(true)
 })
})
