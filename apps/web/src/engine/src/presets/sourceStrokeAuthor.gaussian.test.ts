import { describe, expect, it, vi } from 'vitest'
import type { BrushDescriptor } from '@grafetto/shared'
import stock from '../../../../../../packages/shared/src/fixtures/sourceGaussianAutoData/stock.native'
import { sourceStrokeAuthorDescriptor } from './sourceStrokeAuthorDescriptor'
import { SourceStrokeAuthor, type SourceAuthorPacket, type SourceStrokeAuthorProgram, type SourceStrokeAuthorStep } from './sourceStrokeAuthor'
import { sourceGaussianDab } from './sourceGaussianDab'
import { sourceAutoGeometry } from './sourceAutoGeometry'
import { sourceDabGeometryEqual, sourceDabCharacteristicSize, sourceDabMaskExtent, type SourceDabGeometry } from './sourceDabCache'
import { SourceCanonicalFrameEncoder } from './sourceCanonicalFrameEncoder'
import { SourceStrokeMaterialAdapter } from './sourceStrokeMaterialAdapter'
import { resolvedTransformedMaskPlan } from '../dabs/TransformedMaskPlan'
import { KritaRandomSource } from './nativeRandom'

const ready = [2,5,6,7,10,11,22]
const packet = (i:number):SourceAuthorPacket => ({x:-8+i*.8,y:-4+Math.sin(i/4)*5,t:i*17,pressure:.15+.8*(i%9)/8,
  tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,
  mirroredH:i>=12&&i<22,mirroredV:false,tiltDirectionOffset:0,hover:false})
function program(index:number,coverageProfile:'scalar-bionic-f64-fma-v1'|'neon64-f32-fma-v1'='neon64-f32-fma-v1') {
  const row=stock.rows.find(r=>r.index===index)!
  const result=sourceStrokeAuthorDescriptor(row.descriptor as unknown as BrushDescriptor,{colorIdentity:'opaque-native-black',lodScale:1,coverageProfile})
  if(!result.supported)throw new Error(result.reasons.join(','))
  return result.program
}
function run(p:SourceStrokeAuthorProgram,resume:boolean) {
  let author=new SourceStrokeAuthor(p),state=author.createState(4321,7654,.3)
  const steps:SourceStrokeAuthorStep[]=[]
  for(let i=0;i<30;i++) {
    let iterator=author.plan(state,packet(i))
    while(true) {
      const next=iterator.next()
      if(next.done){state=next.value;break}
      steps.push(next.value)
      if(resume) {
        const saved=structuredClone(next.value.state);iterator.return(saved)
        if(!saved.cursor){state=saved;break}
        author=new SourceStrokeAuthor(structuredClone(p));iterator=author.resume(saved)
      }
    }
  }
  return {steps,state}
}
describe('Gaussian source data in the existing author/query/cache owner',()=>{
  it('runs actual ready7 at30pressure inputs identically across every-yield structured-clone resume',()=>{
    for(const index of ready)for(const profile of ['scalar-bionic-f64-fma-v1','neon64-f32-fma-v1'] as const) {
      const p=program(index,profile),whole=run(p,false),resumed=run(p,true)
      expect(resumed).toEqual(whole)
      expect(whole.state.inputOrdinal).toBe(30)
      expect(p.roles[0].materialPolicy).toBe('gaussian-auto-fixed1-rng-free')
      expect(p.roles[0].brush.scale).toBe(1) // actual descriptor setter state; no synthetic UI size override
      expect(p.roles[0].material.brushIdentity).not.toMatch(/^asset:/)
      const materials=whole.steps.flatMap(s=>s.result?.material?[s.result.material]:[])
      expect(materials.length).toBeGreaterThan(0)
      for(const m of materials) {
        const saved=m.resolvedSource,g=saved.geometry
        if(g?.kind!=='gaussianAuto')throw Error('missing Gaussian source')
        expect(g.coverageProfile).toBe(profile)
        expect(Object.isFrozen(g.source)).toBe(true)
        const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:g.source.diameter,ratio:g.source.ratio,spikes:2,scale:saved.brush.scale,angle:saved.brush.angle},saved.shape,saved.key.subPixelX,saved.key.subPixelY)
        expect(geometry.maskSize).toEqual([saved.width,saved.height])
      }
      const events=(r:typeof whole)=>r.steps.flatMap(s=>(s.result?.events??[]).map(e=>[s.query,e.stage,e.option,e.value,e.drawsBefore,e.drawsAfter]))
      expect(events(resumed)).toEqual(events(whole))
    }
  })
  it('retains real material/dual fences and rejects default-scalar profile before RNG',()=>{
    const draw=vi.spyOn(KritaRandomSource.prototype,'generateNormalized')
    for(const row of stock.rows)if(!ready.includes(row.index)) {
      const result=sourceStrokeAuthorDescriptor(row.descriptor as unknown as BrushDescriptor,{colorIdentity:'black',lodScale:1,coverageProfile:'neon64-f32-fma-v1'})
      expect(result.supported).toBe(false)
    }
    for(const index of ready)expect(sourceStrokeAuthorDescriptor(stock.rows.find(r=>r.index===index)!.descriptor as unknown as BrushDescriptor,
      {colorIdentity:'black',lodScale:1,coverageProfile:'scalar-f64-fma-v1'}).supported).toBe(false)
    const p=structuredClone(program(5)),geometry=p.roles[0].geometry
    if(geometry?.kind!=='gaussianAuto')throw Error('missing Gaussian')
    Object.assign(geometry.source,{ratio:1.2})
    expect(()=>new SourceStrokeAuthor(p)).toThrow('Unsupported source auto geometry')
    expect(draw).not.toHaveBeenCalled();draw.mockRestore()
  })
  it('shares the proved auto geometry law for all13 retained sources without granting fenced author material',()=>{
    for(const row of stock.rows) {
      const source=row.descriptor.sourceStamp.source
      const geometry={kind:'gaussianAuto',source,coverageProfile:'neon64-f32-fma-v1'} as SourceDabGeometry
      const brush=row.descriptor.sourceStamp.brush,shape={scale:.37,ratio:.83,rotation:-.4}
      const nativeLaw=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:source.diameter,ratio:source.ratio,spikes:2,scale:brush.scale,angle:brush.angle},shape,.2,.7)
      expect(sourceDabCharacteristicSize(brush,shape,geometry)).toEqual(nativeLaw.characteristicSize)
      expect(sourceDabMaskExtent(brush,shape,.2,.7,geometry)).toEqual(nativeLaw.maskSize)
    }
  })
  it('rejects forged Gaussian saved profile/source/window before restoring or consuming RNG',()=>{
    const p=program(5),author=new SourceStrokeAuthor(p)
    let state=author.createState(1,2,0)
    for(const step of author.plan(state,packet(0)))state=step.state
    expect(state.roles[0].cache.saved).toBeDefined()
    const draw=vi.spyOn(KritaRandomSource.prototype,'generate')
    try {
      for(const mutate of [
        (s:typeof state)=>Object.assign(s.roles[0].cache.saved!.geometry!,{coverageProfile:'scalar-bionic-f64-fma-v1'}),
        (s:typeof state)=>Object.assign(s.roles[0].cache.saved!.geometry!,{kind:'defaultAuto'}),
        (s:typeof state)=>Object.assign(s.roles[0].cache.saved!,{width:999}),
      ]) {
        const bad=structuredClone(state);mutate(bad)
        expect(()=>author.plan(bad,packet(1)).next()).toThrow('checkpoint')
      }
      expect(draw).not.toHaveBeenCalled()
    } finally {draw.mockRestore()}
  })
  it('keeps saved generation shape/raw angle on cache hit despite new pressure and request angle',()=>{
    const p=program(5),base=p.roles[0],fixed={...base,brush:{...base.brush,angle:-.37},material:{...base.material,precisionLevel:1,autoPrecision:false},
      options:{...base.options,Size:{...base.options.Size,useCurve:false,strength:1},Rotation:{...base.options.Rotation,checked:false},Mirror:{...base.options.Mirror,checked:false}},
      timing:{enabled:true,rate:100,ignoreDistance:true}}
    const author=new SourceStrokeAuthor({...p,roles:[fixed]})
    let state=author.createState(1,2,0),first:ReturnType<typeof sourceGaussianDab>|undefined,hits=0,drift=0
    for(let i=0;i<6;i++)for(const step of author.plan(state,{...packet(i),x:1+i*.02,y:2+i*.02,t:i*20,canvasRotation:i*.01})) {
      state=step.state
      const m=step.result?.material;if(!m)continue
      const s=m.resolvedSource,g=s.geometry;if(g?.kind!=='gaussianAuto')throw Error('missing Gaussian')
      const dab=sourceGaussianDab({dialect:'krita-gaussian-auto-qt5-arm64-v1',tip:{kind:'auto',generator:'gauss',shape:'circle',diameter:g.source.diameter,ratio:g.source.ratio,
        horizontalFade:g.source.horizontalFade,verticalFade:g.source.verticalFade,antialias:g.source.antialias,spikes:2,softness:1,randomness:0,density:1},
        storedScale:s.brush.scale,storedAngle:s.brush.angle,shape:s.shape,subpixelX:s.key.subPixelX,subpixelY:s.key.subPixelY,coverageProfile:g.coverageProfile,maxPixels:1048576,maxWorkSamples:16*1048576})
      if(m.type==='Copy') {hits++;if(m.key.angle!==s.key.angle)drift++;expect(s.sequence).toBe(0);expect(dab.mask).toEqual(first!.mask)}else first=dab
    }
    expect(hits).toBeGreaterThan(0);expect(drift).toBeGreaterThan(0)
  })
  it('rejects material/PNG fallthrough before asset reads and keeps generator/profile distinct in cache',()=>{
    const p=program(5),author=new SourceStrokeAuthor(p),state=author.createState(1,2,0),assetRead=vi.fn(()=>[])
    expect(()=>new SourceStrokeMaterialAdapter(p,{get assets(){return assetRead()},primaryAsset:'fake',budget:{workUnits:100000,outputBytes:100000,drawPixels:100000}},state)).toThrow(/Gaussian auto material integration/)
    expect(assetRead).not.toHaveBeenCalled()
    expect(()=>new SourceCanonicalFrameEncoder({material:{geometry:p.roles[0].geometry}} as never)).toThrow('trusted wire2')
    expect(()=>resolvedTransformedMaskPlan({geometry:p.roles[0].geometry} as never)).toThrow('typed procedural')
    const g=p.roles[0].geometry
    if(g?.kind!=='gaussianAuto')throw Error('missing Gaussian')
    expect(sourceDabGeometryEqual(g,{...g,coverageProfile:'scalar-bionic-f64-fma-v1'})).toBe(false)
    expect(sourceDabGeometryEqual(g,{kind:'defaultAuto',source:{...g.source,kind:'defaultAuto',generator:'default'},coverageProfile:'neon64-f32-fma-v1'})).toBe(false)
  })
})
