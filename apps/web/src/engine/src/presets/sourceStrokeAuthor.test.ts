import { describe, expect, it, vi } from 'vitest'
import sourceTime from '../dabs/fixtures/sourceDistanceTiming.json'
import { sourceDrawingDirection } from '../input/kritaStrokeInput'
import nativeTrace from './fixtures/sourceStrokeAuthor.native.json'
import stock from './fixtures/sourceOptionPrograms.stock.json'
import curves from './fixtures/sourceCurves.native.json'
import { SourceStrokeAuthor, type SourceStrokeAuthorProgram, type SourceAuthorPacket, type SourceAuthorRoleProgram, type SourceStrokeAuthorState, type SourceStrokeAuthorStep } from './sourceStrokeAuthor'
import type { SourceSensorId } from './sourceOption'
import type { SourceOptionProgramInput } from './sourceOptionProgram'
import { SourceStampQueryExecutor } from './sourceStampQuery'
import { KritaRandomSource } from './nativeRandom'

const packet=(t:number,x=13,y=17):SourceAuthorPacket=>({x,y,t,pressure:.5,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,
  canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false})
function role(index=84,id:'primary'|'mask'='primary'):SourceAuthorRoleProgram {
  const preset=stock.presets.find(p=>p.index===index)!
  const options=Object.fromEntries(preset.options.map(option=>[option.id,{...option,sensors:option.sensors.map(sensor=>{
    const curve=curves.curves[sensor.curveIndex]
    return {...sensor,id:sensor.id as SourceSensorId,curve:{points:curve.points.map(p=>({x:p[0] as number,y:p[1] as number})),coefficients:curve.coefficients as [number,number,number,number][]}}
  })} satisfies SourceOptionProgramInput])) as unknown as SourceAuthorRoleProgram['options']
  return {id,options,brush:{width:105,height:108,scale:.761905,angle:0},materialPolicy:'png-fixed1-rng-free',
    material:{brushIdentity:'freckles.png',color:'native-black',softness:1,lightness:1,precisionLevel:1,autoPrecision:false,
      imprecisePosition:true,disableSubpixel:false,supportsCaching:true,solidColor:true,textureEnabled:false,sharpnessChecked:false},
    lodScale:1,scatterX:true,scatterY:true,mirrorX:true,mirrorY:true,indirectPainting:false,
    spacing:{value:.06,automatic:false,coefficient:1,isotropic:false},timing:{enabled:false,rate:20,ignoreDistance:false},spacingRefreshMs:50,timingRefreshMs:50}
}
const program=(roles:readonly SourceAuthorRoleProgram[]=[role()]):SourceStrokeAuthorProgram=>({id:'source-author-test-v1',roles})
function drain(iterator:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>){
  const steps:SourceStrokeAuthorStep[]=[]
  while(true){const next=iterator.next();if(next.done)return {steps,state:next.value};steps.push(next.value)}
}
function input(author:SourceStrokeAuthor,state:SourceStrokeAuthorState,p:SourceAuthorPacket){return drain(author.plan(state,p))}

describe('one source author query/cache/distance/sensor owner',()=>{
  it('matches independent compiled native whole input query schedule/component values with explicit material/geometry shims',()=>{
    const base=role(),options={...base.options,
      Opacity:{...base.options.Opacity,useCurve:false,strength:1},Flow:{...base.options.Flow,useCurve:false,strength:1}}
    const author=new SourceStrokeAuthor(program([{...base,options,brush:{...base.brush,scale:.1}}]))
    let state=author.createState(0,0,.3)
    const events:(string|number)[][]=[]
    for(const p of nativeTrace.inputs){
      const result=input(author,state,packet(p.t,p.x,p.y));state=result.state
      for(const step of result.steps)for(const event of step.result?.events??[]){
        const stage=event.stage==='material'?'material':event.stage==='spacing'||event.option==='Spacing'?'spacing':step.query==='spacing'?'refresh':step.query==='timing'?'timing':'paint'
        events.push([stage,event.option,event.drawsBefore,event.drawsAfter,event.value])
      }
    }
    expect(events).toEqual(nativeTrace.events)
    expect(state.random.draws).toBe(nativeTrace.draws)
    expect(state.roles[0].sequence).toBe(nativeTrace.sequence)
  })
  it('runs the nine existing audited primary PNG option programs through the same owner without a preset branch',()=>{
    expect(stock.presets.map(p=>p.index)).toEqual([84,103,105,108,110,111,112,113,114])
    for(const preset of stock.presets){
      const author=new SourceStrokeAuthor(program([role(preset.index)]))
      const first=input(author,author.createState(4321,7654,.3),packet(0))
      const next=input(author,first.state,packet(70,30,25))
      expect(next.state.lastInput!.t).toBe(70)
      expect(next.state.roles[0].sequence).toBeGreaterThanOrEqual(1)
      expect(structuredClone(next.state)).toEqual(next.state)
    }
  })
  it('executes nonpainting50ms refresh on the SAME source before the next paint request',()=>{
    const author=new SourceStrokeAuthor(program()),initial=author.createState(0,0,.3)
    const start=input(author,initial,packet(0)),refresh=input(author,start.state,packet(60))
    expect(refresh.steps.filter(s=>s.query).map(s=>s.query)).toEqual(['spacing','timing'])
    expect(refresh.steps[0].result!.events.map(e=>[e.option,e.drawsBefore,e.drawsAfter])).toEqual([
      ['Size',7,8],['Rotation',8,9],['Mirror',9,10],['Spacing',10,11]])
    expect(refresh.state.random.draws).toBe(11)
    expect(refresh.state.roles[0].sequence).toBe(1)
    const move=input(author,refresh.state,packet(61,14,18))
    const first=move.steps.find(s=>s.query==='paint')!
    expect(first.result!.events[0].drawsBefore).toBe(11)
    expect(first.result!.material).toBeDefined()
    expect(initial.random.draws).toBe(0)
    expect(Object.isFrozen(refresh.state.roles[0].cache)).toBe(true)
  })
  it('resumes/forks every atomic boundary without replaying draws, caches, clock or registration',()=>{
    const author=new SourceStrokeAuthor(program()),start=input(author,author.createState(4321,7654,.3),packet(0))
    const expected=input(author,start.state,packet(80,80,70))
    const iterator=author.plan(start.state,packet(80,80,70));const prefix:SourceStrokeAuthorStep[]=[]
    for(let i=0;i<3;i++){const next=iterator.next();expect(next.done).toBe(false);prefix.push(next.value as SourceStrokeAuthorStep)}
    const checkpoint=structuredClone(prefix.at(-1)!.state)
    iterator.return(checkpoint)
    const resumed=drain(author.resume(checkpoint))
    expect([...prefix,...resumed.steps]).toEqual(expected.steps)
    expect(resumed.state).toEqual(expected.state)
    expect(drain(new SourceStrokeAuthor(program()).resume(structuredClone(checkpoint)))).toEqual(resumed)
    expect(()=>author.plan(checkpoint,packet(81)).next()).toThrow('Pending')
  })
  it('runs whole primary segment then mask segment with shared mutable/keyed sources and independent role cache/distance',()=>{
    //108 ownership topology, not actual108 child size/master-size pixel admission.
    const primary={...role(108),scatterX:false,scatterY:false}
    const maskBase=role(108,'mask')
    const childSize={...maskBase.options.Size,sensors:maskBase.options.Size.sensors.map(sensor=>sensor.id==='time'?{...sensor,length:6340}:sensor)}
    const mask={...maskBase,options:{...maskBase.options,Size:childSize},brush:{width:40,height:39,scale:.25,angle:0},scatterX:false,scatterY:false}
    const author=new SourceStrokeAuthor(program([primary,mask]))
    const down=input(author,author.createState(4321,7654,.3),packet(0))
    const segment=input(author,down.state,packet(500,100,40))
    const events=segment.steps.filter(s=>s.query)
    const firstMask=events.findIndex(s=>s.role==='mask')
    expect(firstMask).toBeGreaterThan(1)
    expect(events.slice(0,firstMask).every(s=>s.role==='primary')).toBe(true)
    expect(events.slice(firstMask).every(s=>s.role==='mask')).toBe(true)
    const firstMaskQuery=events[firstMask].result!.events[0]
    expect(firstMaskQuery.drawsBefore).toBe(events[firstMask-1].state.random.draws)
    expect(segment.state.roles[0].sequence).not.toBe(segment.state.roles[1].sequence)
    expect(segment.state.roles[0].cache.saved!.brushIdentity).toBe('freckles.png')
    expect(segment.state.roles[0].cache.saved).not.toBe(segment.state.roles[1].cache.saved)
    const next=input(author,segment.state,packet(510,101,41))
    expect(next.steps.find(s=>s.query)!.result!.events[0].drawsBefore).toBe(segment.state.random.draws)
    const alone=new SourceStrokeAuthor(program([primary]))
    const aloneDown=input(alone,alone.createState(4321,7654,.3),packet(0))
    const aloneSegment=input(alone,aloneDown.state,packet(500,100,40))
    const aloneNext=input(alone,aloneSegment.state,packet(510,101,41))
    expect(next.steps.find(s=>s.query)!.result!.events[0].value).not.toBe(aloneNext.steps.find(s=>s.query)!.result!.events[0].value)
  })
  it('shares keyed per-stroke option identity between primary and mask without consuming the mutable source',()=>{
    const primary=role(111),mask={...role(111,'mask'),brush:{width:40,height:40,scale:.25,angle:0}}
    const author=new SourceStrokeAuthor(program([primary,mask]))
    const first=input(author,author.createState(4321,7654,.3),packet(0))
    const segment=input(author,first.state,packet(100,80,60))
    const rotations=[...first.steps,...segment.steps].flatMap(s=>s.result?.events.filter(e=>e.option==='Rotation')??[])
    expect(new Set(rotations.map(e=>e.value)).size).toBe(1)
    expect(rotations.every(e=>e.drawsBefore===e.drawsAfter)).toBe(true)
    expect(segment.state.perStroke.cache.filter(([key])=>key==='RotationFuzzyStroke')).toHaveLength(1)
  })
  it('uses native weighted scalar/time mixture for fans while reusing explicit fan point geometry',()=>{
    const base=role(),options=Object.fromEntries(Object.entries(base.options).map(([id,o])=>[id,{...o,useCurve:false,strength:1,
      checked:!['Rotation','Ratio','Scatter','Mirror','Spacing','Rate'].includes(id)}])) as unknown as SourceAuthorRoleProgram['options']
    const simple={...base,options,brush:{width:24,height:24,scale:1,angle:0},spacing:{value:1,automatic:false,coefficient:1,isotropic:true},fanStepDegrees:45}
    const author=new SourceStrokeAuthor(program([simple]))
    const finalAngle=sourceDrawingDirection({x:0,y:0},{x:-24,y:0},0)
    const initialAngle=finalAngle-Math.PI
    const first=input(author,author.createState(0,0,initialAngle),{...packet(.1,0,0),pressure:.1})
    const segment=input(author,first.state,{...packet(.3,-24,0),pressure:.3})
    const paints=segment.steps.filter(s=>s.query==='paint')
    expect(paints.length).toBeGreaterThanOrEqual(4)
    const secondFan=paints[1].packet!
    expect(secondFan.x).toBe(-6)
    expect(secondFan.t).toBe(sourceTime.sourceTimeMix[0].result)
    expect(secondFan.pressure).toBe(sourceTime.sourceTimeMix[0].result)
    expect(secondFan.t).not.toBe(.1+.25*(.3-.1))
  })
  it('retains the generated PNG source on cache hit while consuming BOTH material and spacing Mirror queries',()=>{
    const base=role(), options=structuredClone(base.options) as Record<string,SourceOptionProgramInput>
    for(const [id,option] of Object.entries(options)) options[id]={...option,useCurve:false,checked:!['Rotation','Ratio','Scatter','Spacing','Rate'].includes(id)}
    options.Mirror={...base.options.Mirror,strength:0}
    const author=new SourceStrokeAuthor(program([{...base,options:options as unknown as SourceAuthorRoleProgram['options']}]))
    const first=input(author,author.createState(4321,7654,0),packet(0))
    const move=input(author,first.state,packet(10,19,17))
    const paint=move.steps.find(s=>s.query==='paint')!
    expect(paint.result!.material!.type).toBe('Copy')
    expect(paint.result!.material!.sourceSequence).toBe(0)
    expect(paint.result!.events.filter(e=>e.option==='Mirror').map(e=>[e.stage,e.drawsBefore,e.drawsAfter]))
      .toEqual([['material',2,3],['spacing',3,4]])
    expect(paint.result!.material!.resolvedRect).not.toEqual(first.steps[0].result!.material!.resolvedRect)
  })
  it('bounds a large timed catchup by atomic yields and preserves every captured dispatch boundary',()=>{
    const base=role(),timed={...base,timing:{enabled:true,rate:1000,ignoreDistance:true}}
    const author=new SourceStrokeAuthor(program([timed]))
    const first=input(author,author.createState(4321,7654,0),packet(0))
    const all=input(author,first.state,packet(1000))
    expect(all.steps.filter(s=>s.query==='paint')).toHaveLength(1000)
    const iterator=author.plan(first.state,packet(1000))
    const one=iterator.next();expect(one.done).toBe(false)
    const checkpoint=(one.value as SourceStrokeAuthorStep).state
    expect(checkpoint.roles[0].sequence).toBe(2)
    expect(checkpoint.lastInput!.t).toBe(0)
    iterator.return(checkpoint)
    const remaining=drain(author.resume(structuredClone(checkpoint)))
    expect([one.value,...remaining.steps]).toEqual(all.steps)
    expect(remaining.state.lastInput!.t).toBe(1000)
    expect(first.state.roles[0].sequence).toBe(1)
  })
  it('registers every paint request and keeps current maxPressure/native time/fade inputs role-local',()=>{
    const primary=role(108)
    const author=new SourceStrokeAuthor(program([primary]))
    const first=input(author,author.createState(4321,7654,.7),packet(0))
    const held=input(author,first.state,packet(360))
    expect(held.state.roles[0].sequence).toBe(1)
    expect(held.state.roles[0].maxPressure).toBe(.5)
    expect(held.state.roles[0].totalDistance).toBe(0)
    expect(held.steps[0].packet!.t).toBe(360)
    expect(held.state.roles[0].lockedAngle).toBe(.7)
    const moved=input(author,held.state,{...packet(361,14,17),pressure:.8})
    expect(moved.state.roles[0].maxPressure).toBe(.5) // unpainted endpoint is not registered
    const longer=input(author,moved.state,{...packet(400,100,17),pressure:.8})
    const expected=Math.max(.5,...longer.steps.filter(s=>s.query==='paint').map(s=>s.packet!.pressure))
    expect(longer.state.roles[0].maxPressure).toBe(expected)
    expect(expected).toBeGreaterThan(.5)
  })
  it('rejects malformed private checkpoints before querying or advancing the sequential source',()=>{
    const author=new SourceStrokeAuthor(program())
    const initial=input(author,author.createState(4321,7654,.3),packet(0)).state
    const iterator=author.plan(initial,packet(80,70,40))
    const checkpoint=(iterator.next().value as SourceStrokeAuthorStep).state
    iterator.return(checkpoint)
    const roleState=checkpoint.roles[0],cursor=checkpoint.cursor!
    const withRole=(patch:Partial<typeof roleState>):SourceStrokeAuthorState=>({...checkpoint,roles:[{...roleState,...patch}]})
    const malformed:SourceStrokeAuthorState[]=[
      {...checkpoint,eventOrdinal:NaN},{...checkpoint,inputOrdinal:-1},{...checkpoint,roles:[]},
      {...checkpoint,cursor:{...cursor,phase:'unknown' as never}},
      {...checkpoint,cursor:{...cursor,kind:'unknown' as never}},
      {...checkpoint,cursor:{...cursor,roleIndex:2}},
      {...checkpoint,cursor:{...cursor,phase:'paint',requests:[]}},
      {...checkpoint,cursor:{...cursor,phase:'paint',requests:Array(66).fill(roleState.lastPaint!)}},
      {...checkpoint,cursor:{...cursor,current:{...cursor.current,t:NaN}}},
      {...checkpoint,cursor:{...cursor,endpoint:{...cursor.endpoint,t:-1}}},
      withRole({distance:{...roleState.distance,x:NaN}}),withRole({distance:{...roleState.distance,spacingElapsed:-1}}),
      withRole({spacing:{...roleState.spacing,x:Infinity}}),withRole({totalDistance:NaN}),
      withRole({sequence:1.5}),withRole({maxPressure:2}),withRole({cache:{...roleState.cache,nextSequence:NaN}}),
      {...checkpoint,random:{...checkpoint.random,draws:NaN}},
      {...checkpoint,perStroke:{...checkpoint.perStroke,cache:[['bad',NaN]]}},
    ]
    const execute=vi.spyOn(SourceStampQueryExecutor.prototype,'execute'),generate=vi.spyOn(KritaRandomSource.prototype,'generate')
    try{
      for(const bad of malformed)expect(()=>author.resume(bad).next()).toThrow()
      expect(execute).not.toHaveBeenCalled();expect(generate).not.toHaveBeenCalled()
    }finally{execute.mockRestore();generate.mockRestore()}
    expect(author.resume(structuredClone(checkpoint)).next().done).toBe(false)
  })
  it('does not freeze or mutate caller-owned cloneable checkpoints or input packets',()=>{
    const author=new SourceStrokeAuthor(program())
    const initial=input(author,author.createState(4321,7654,.3),packet(0)).state
    const caller=structuredClone(initial),point=packet(80,70,40),before=structuredClone(caller)
    const generator=author.plan(caller,point);const first=generator.next()
    expect(first.done).toBe(false)
    expect(caller).toEqual(before)
    expect(Object.isFrozen(caller.roles)).toBe(false)
    expect(Object.isFrozen(caller.random)).toBe(false)
    expect(Object.isFrozen(point)).toBe(false)
    generator.return(caller)
  })
  it('rejects unsupported programs and nonmonotonic clocks before affecting an immutable source checkpoint',()=>{
    const bad={...role(),materialPolicy:'unknown'} as unknown as SourceAuthorRoleProgram
    expect(()=>new SourceStrokeAuthor(program([bad]))).toThrow('Unsupported')
    const author=new SourceStrokeAuthor(program()),state=input(author,author.createState(0,0,0),packet(10)).state
    const saved=structuredClone(state)
    expect(()=>author.plan(state,packet(9)).next()).toThrow('clock')
    expect(()=>author.plan(state,{...packet(11),rotation:1}).next()).toThrow('rotation')
    expect(()=>author.plan(state,{...packet(11),pressure:NaN}).next()).toThrow('packet')
    expect(state).toEqual(saved)
    expect(KritaRandomSource.restore(state.random).snapshot()).toEqual(state.random)
  })
})
