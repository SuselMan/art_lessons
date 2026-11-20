import { describe, expect, it } from 'vitest'
import type { BrushDescriptor, Dab } from '@grafetto/shared'
import { beginBrushBehavior, behaviorStampsForDab, brushSourceSpacingAxes } from './brushBehavior'
import { brushExecutionContext } from './brushExecutionContext'
import { digitalBrushFromPreset } from './digitalBrushPresets'
import { KritaRandomSource } from './nativeRandom'
import { brushRequestGeometry } from './brushRequestGeometry'
const seeds={version:1 as const,sequentialSeed:123456,strokeSeed:98765}
const brush:BrushDescriptor={...digitalBrushFromPreset('hard-round'),
  tip:{kind:'round',aspect:1,hardness:1,angle:0,rotation:'fixed',profile:{kind:'gaussian',fade:1e-6,antialias:false}},
  model:'stamp',paperInteraction:0,texture:undefined,wet:undefined,mixer:undefined,
  flow:1,flowPer:'stamp',flowSpan:undefined,opacity:1,pressureSmoothingPx:0,
  sizeByPressure:[[0,.485944],[1,1]],opacityByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],
  scatter:{count:1,radius:.09,scale:1,sizeJitter:0,angleJitter:0,flowJitter:0},
  behavior:{version:2,sequentialRandom:{version:1,kind:'qt5Taus88',policy:'scatterXY'},
    scatter:{placement:'xyUniform',bothAxes:true,countJitter:0},spacing:{mode:'diameter',coefficient:.2}}}
function dab(i=0,sourceScale=1):Dab{return {x:20+i*5,y:30,size:24*sourceScale,sourceSize:24,sourceScale,pressure:1,aspectRatio:1,angle:0,tiltX:0,tiltY:0,opacity:1,t:i*8}}
function state(d=dab()){return beginBrushBehavior(d,brushExecutionContext(seeds))}
const rgb:[number,number,number]=[1,0,0]
describe('explicit per-request sequential XY',()=>{
  it('uses integer rotated allocation extent and exactly two native sequential draws',()=>{
    const d={...dab(),angle:.8},s=state(d),random=new KritaRandomSource(seeds.sequentialSeed)
    const geometry=brushRequestGeometry(24,1,.8)
    const x=d.x+(2*random.generateNormalized()-1)*geometry.maskWidth*.09
    const y=d.y+(2*random.generateNormalized()-1)*geometry.maskHeight*.09
    const placed=behaviorStampsForDab(brush,d,s,rgb)[0]
    expect(placed.x).toBe(x);expect(placed.y).toBe(y)
    expect(placed.size).toBe(24)
    expect(s.sequentialRandom).toEqual(random.snapshot())
  })
  it('does not spend draws for too-small requests but spends them for zero effects',()=>{
    const s=state()
    expect(behaviorStampsForDab(brush,dab(0,0),s,rgb)).toEqual([])
    expect(s.sequentialRandom).toBeUndefined()
    const zero={...brush,scatter:{...brush.scatter!,radius:0},flow:0,opacity:0}
    const placed=behaviorStampsForDab(zero,{...dab(1),opacity:0},s,rgb)[0]
    expect(placed.x).toBe(25);expect(placed.y).toBe(30)
    expect(s.sequentialRandom?.draws).toBe(2)
    const tiny={...dab(2),sourceSize:1,size:.1}
    expect(behaviorStampsForDab(brush,tiny,s,rgb)[0].size).toBe(.1)
    expect(s.sequentialRandom?.draws).toBe(4)
  })
  it('probes source spacing without moving the placement cursor or gesture state',()=>{
    const d={...dab(),size:2.3,sourceSize:2},s=state(d),before=structuredClone(s)
    for(let i=0;i<10;i++) {
      const axes=brushSourceSpacingAxes(brush,d,s,{mode:'diameter',coefficient:1},1,0)
      expect(axes.x).toBe(2);expect(axes.y).toBe(2)
    }
    expect(s).toEqual(before)
    expect(behaviorStampsForDab(brush,d,s,rgb)).toEqual(behaviorStampsForDab(brush,d,state(d),rgb))
  })
  it('keeps source state through chunks and cloneable speculative previews',()=>{
    const input=Array.from({length:12},(_,i)=>dab(i,i===3?0:1))
    const whole=state(),chunk=state()
    const expected=input.flatMap(d=>behaviorStampsForDab(brush,d,whole,rgb))
    const actual=[]
    let current=chunk
    for(let i=0;i<input.length;i+=3){
      const preview=structuredClone(current)
      behaviorStampsForDab(brush,{...dab(90),sourceScale:.5},preview,rgb)
      actual.push(...input.slice(i,i+3).flatMap(d=>behaviorStampsForDab(brush,d,current,rgb)))
      current=structuredClone(current)
    }
    expect(actual).toEqual(expected)
    expect(current.sequentialRandom).toEqual(whole.sequentialRandom)
    expect(current.sequentialRandom?.draws).toBe(22)
  })
  it('rejects missing recorded geometry before any state advancement',()=>{
    const s=state(),before=structuredClone(s)
    const invalid={...dab(),sourceScale:undefined}
    expect(()=>behaviorStampsForDab(brush,invalid,s,rgb)).toThrow(/sourceScale/)
    expect(s).toEqual(before)
  })
  it('leaves historical coordinate-hash placement unchanged by unrelated explicit seeds',()=>{
    const old={...brush,behavior:{...brush.behavior!,sequentialRandom:undefined}}
    const a=beginBrushBehavior(dab(),brushExecutionContext(seeds)),b=beginBrushBehavior(dab(),brushExecutionContext({...seeds,sequentialSeed:0}))
    expect(behaviorStampsForDab(old,dab(),a,rgb)).toEqual(behaviorStampsForDab(old,dab(),b,rgb))
    expect(a.sequentialRandom).toBeUndefined()
    expect(b.sequentialRandom).toBeUndefined()
  })
})
