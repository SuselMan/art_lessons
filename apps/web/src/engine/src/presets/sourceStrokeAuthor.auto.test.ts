import { describe, expect, it, vi } from 'vitest'
import type { BrushDescriptor } from '@grafetto/shared'
import stock from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import { sourceStrokeAuthorDescriptor } from './sourceStrokeAuthorDescriptor'
import { SourceStrokeAuthor, type SourceAuthorPacket, type SourceStrokeAuthorProgram, type SourceStrokeAuthorState, type SourceStrokeAuthorStep } from './sourceStrokeAuthor'
import { sourceDefaultAutoDab } from './sourceDefaultAutoDab'
import { sourceAutoGeometry } from './sourceAutoGeometry'
import { SourceCanonicalFrameEncoder } from './sourceCanonicalFrameEncoder'
import { SourceStrokeMaterialAdapter } from './sourceStrokeMaterialAdapter'
import { resolvedTransformedMaskPlan } from '../dabs/TransformedMaskPlan'
import { KritaRandomSource } from './nativeRandom'

const packet=(i:number):SourceAuthorPacket=>({x:-8+i*.8,y:-4+Math.sin(i/4)*5,t:i*17,pressure:.15+.8*(i%9)/8,
  tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,
  mirroredH:i>=12&&i<22,mirroredV:false,tiltDirectionOffset:0,hover:false})
function program(index=0):SourceStrokeAuthorProgram {
  const result=sourceStrokeAuthorDescriptor(stock.rows[index].descriptor as unknown as BrushDescriptor,
    {colorIdentity:'native-opaque-black',lodScale:1,scale:.2,coverageProfile:'neon64-f32-fma-v1'})
  if(!result.supported)throw new Error(result.reasons.join(','))
  return result.program
}
function run(p:SourceStrokeAuthorProgram,resumeEveryYield:boolean){
  let author=new SourceStrokeAuthor(p),state=author.createState(4321,7654,.3)
  const steps:SourceStrokeAuthorStep[]=[]
  for(let i=0;i<30;i++){
    let iterator=author.plan(state,packet(i))
    while(true){
      const next=iterator.next()
      if(next.done){state=next.value;break}
      steps.push(next.value)
      if(resumeEveryYield){
        const checkpoint=structuredClone(next.value.state)
        iterator.return(checkpoint)
        if(!checkpoint.cursor){state=checkpoint;break}
        author=new SourceStrokeAuthor(structuredClone(p))
        iterator=author.resume(checkpoint)
      }
    }
  }
  return{steps,state}
}
describe('real imported default auto through the one author/query/cache owner',()=>{
  it('uses all seven compiled descriptors without any CAS and resumes identically at EVERY yield for30pressure-varying inputs',()=>{
    for(let index=0;index<stock.rows.length;index++){
      const p=program(index),plain=run(p,false),resumed=run(p,true)
      expect(p.roles[0].geometry?.kind).toBe('defaultAuto')
      expect(p.roles[0].materialPolicy).toBe('default-auto-fixed1-rng-free')
      expect(p.roles[0].material.brushIdentity).toBe(stock.rows[index].descriptor.id+'@'+stock.rows[index].descriptor.version)
      expect(p.roles[0].material.brushIdentity).not.toMatch(/^asset:/)
      expect(resumed,stock.rows[index].name).toEqual(plain)
      expect(plain.state.inputOrdinal).toBe(30)
      const material=plain.steps.filter(s=>s.kind==='material')
      expect(material.length).toBeGreaterThan(0)
      for(const step of material){
        const m=step.result!.material!,saved=m.resolvedSource,g=saved.geometry
        if(g?.kind!=='defaultAuto')throw Error('Missing source auto generation')
        const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:g.source.diameter,ratio:g.source.ratio,spikes:2,
          scale:saved.brush.scale,angle:saved.brush.angle},saved.shape,saved.key.subPixelX,saved.key.subPixelY)
        expect(geometry.maskSize).toEqual([saved.width,saved.height])
        expect(Object.isFrozen(g.source)).toBe(true)
      }
      const events=(out:typeof plain)=>out.steps.flatMap(s=>(s.result?.events??[]).map(e=>[s.query,e.stage,e.option,e.value,e.drawsBefore,e.drawsAfter]))
      expect(events(resumed)).toEqual(events(plain))
    }
  })
  it('keeps saved generation values on actual cache hits, including raw negative angles and differing current request',()=>{
    const p=program(),base=p.roles[0]
    const fixed={...base,brush:{...base.brush,angle:-.37},material:{...base.material,precisionLevel:1,autoPrecision:false},
      options:{...base.options,Size:{...base.options.Size,useCurve:false,strength:1},Rotation:{...base.options.Rotation,checked:false},Mirror:{...base.options.Mirror,checked:false}},
      timing:{enabled:true,rate:100,ignoreDistance:true}}
    const author=new SourceStrokeAuthor({...p,roles:[fixed]})
    let state=author.createState(1,2,0),first:ReturnType<typeof sourceDefaultAutoDab>|undefined,hits=0,driftedHits=0
    for(let i=0;i<6;i++){
      const input={...packet(0),t:i*20,x:1+i*.02,y:2+i*.02,canvasRotation:i*.01}
      for(const step of author.plan(state,input)){
        state=step.state
        const m=step.result?.material
        if(!m)continue
        const s=m.resolvedSource,g=s.geometry
        if(g?.kind!=='defaultAuto')throw Error('Missing auto source')
        if(g.coverageProfile==='neon64-f32-fma-seeded-density-v1')throw Error('Old fixture coverage required')
        const dab=sourceDefaultAutoDab({dialect:'krita-default-auto-qt5-arm64-v1',tip:{kind:'auto',generator:'default',shape:g.source.shape,
          diameter:g.source.diameter,ratio:g.source.ratio,horizontalFade:g.source.horizontalFade,verticalFade:g.source.verticalFade,
          antialias:g.source.antialias,spikes:2,softness:1,randomness:0,density:1},storedScale:s.brush.scale,storedAngle:s.brush.angle,
          shape:s.shape,subpixelX:s.key.subPixelX,subpixelY:s.key.subPixelY,coverageProfile:g.coverageProfile,maxPixels:1048576,maxWorkSamples:16*1048576})
        expect(dab.coverageAngle).toBe(s.shape.rotation-.37)
        if(m.type==='Copy'){
          hits++;expect(s.sequence).toBe(0);expect(s.shape.rotation).toBe(0)
          if(m.key.angle!==s.key.angle)driftedHits++
          expect(dab.mask).toEqual(first!.mask)
        }else first=dab
      }
    }
    expect(hits).toBeGreaterThan(0)
    expect(driftedHits).toBeGreaterThan(0)
  })
  it('rejects image-only encoder/adapter/plan before assets or PNG geometry and restored auto profile changes before RNG',()=>{
    const p=program(),author=new SourceStrokeAuthor(p),initial=author.createState(1,2,0)
    expect(()=>new SourceStrokeMaterialAdapter(p,{assets:[],primaryAsset:'',budget:{workUnits:0,outputBytes:0,drawPixels:0}},initial)).toThrow('Default auto')
    const context={material:{geometry:p.roles[0].geometry}} as unknown as ConstructorParameters<typeof SourceCanonicalFrameEncoder>[0]
    expect(()=>new SourceCanonicalFrameEncoder(context)).toThrow('Default auto')
    let state:SourceStrokeAuthorState=initial
    for(const step of author.plan(initial,packet(0)))state=step.state
    const saved=state.roles[0].cache.saved!
    expect(()=>resolvedTransformedMaskPlan(saved)).toThrow('Default auto')
    const changes=[
      (s:SourceStrokeAuthorState)=>Object.assign(s.roles[0].cache.saved!.geometry!,{coverageProfile:'scalar-f64-fma-v1'}),
      (s:SourceStrokeAuthorState)=>Object.assign(s.roles[0].cache.saved!.brush,{angle:.123}),
      (s:SourceStrokeAuthorState)=>Object.assign(s.roles[0].cache.saved!.key,{width:999}),
      (s:SourceStrokeAuthorState)=>Object.assign(s.roles[0].cache.saved!.key,{angle:-.1}),
    ]
    const random=vi.spyOn(KritaRandomSource.prototype,'generate')
    try{for(const change of changes){const invalid=structuredClone(state);change(invalid);expect(()=>author.plan(invalid,packet(1)).next()).toThrow('checkpoint')}expect(random).not.toHaveBeenCalled()}finally{random.mockRestore()}
  })
})
