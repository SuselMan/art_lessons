import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { CANONICAL_STROKE_RASTER_PROFILE, canonicalSoftAutoSourceBinding, canonicalSourceComposition, type BrushDescriptor } from '@grafetto/shared'
import fixture from './fixtures/sourceStrokeStartup.native.json'
import { sourceStrokeAuthorDescriptor } from './sourceStrokeAuthorDescriptor'
import { SourceStrokeAuthor, type SourceAuthorPacket, type SourceStrokeAuthorState, type SourceStrokeAuthorStep } from './sourceStrokeAuthor'
import { SourceStrokeMaterialAdapter, type SourceStrokeMaterialContextV2 } from './sourceStrokeMaterialAdapter'
import { SourceCanonicalFrameEncoder } from './sourceCanonicalFrameEncoder'
import { createSourcePrimaryComposition, advanceSourcePrimaryComposition } from './sourcePrimaryComposition'
import { compileSourceSoftCircleProgram, sourceSoftCircleDab } from './sourceSoftCircleDab'
import { compositeSourceFused32 } from './sourceFused32'

const context={colorIdentity:'native-GUI-black',lodScale:1,coverageProfile:'neon64-f32-fma-v1' as const,inputProfile:'krita-freehand-no-smoothing-v1' as const}
function program(){
  const result=sourceStrokeAuthorDescriptor(fixture.row.descriptor as unknown as BrushDescriptor,context)
  if(!result.supported)throw Error(result.reasons.join(','))
  return result.program
}
function drain(iterator:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>){
  const steps:SourceStrokeAuthorStep[]=[]
  while(true){const next=iterator.next();if(next.done)return {steps,state:next.value};steps.push(next.value)}
}
const packet=(x=48.25,y=96.25,t=0):SourceAuthorPacket=>({x,y,t,pressure:1,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false})
const fromBits=(bits:number)=>new Float32Array(new Uint32Array([bits]).buffer)[0]
function nativeRun(row:typeof fixture.cases[number],resume=false){
  const p=program(),author=new SourceStrokeAuthor(p),descriptor=fixture.row.descriptor as unknown as BrushDescriptor
  let state=author.createState(4321,7654,.3)
  const pin=canonicalSoftAutoSourceBinding(descriptor,fixture.row.descriptorSHA256,'neon64-f32-fma-v1',0,CANONICAL_STROKE_RASTER_PROFILE)
  const policy=canonicalSourceComposition(descriptor,CANONICAL_STROKE_RASTER_PROFILE)
  if(!policy)throw Error('Missing composition')
  const composition={...policy,alphaDarken:'creamy' as const,outerResourceOpacity:1}
  const material:SourceStrokeMaterialContextV2={version:2,assets:[],primarySource:pin,targetGeometry:{pageBounds:{minX:0,minY:0,maxX:512,maxY:512},tileWidth:128,tileHeight:128,maxTargets:16},budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}
  const adapter=new SourceStrokeMaterialAdapter(p,material,state),encoder=new SourceCanonicalFrameEncoder({rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:descriptor.id+'@'+descriptor.version,strokeId:'startup-native',pigmentRgb8:[0,0,0],composition,material})
  let paint=createSourcePrimaryComposition(composition).state
  const steps:SourceStrokeAuthorStep[]=[],draws:ReturnType<typeof advanceSourcePrimaryComposition>['draws'][number][]=[],definitions:unknown[]=[],frames:unknown[]=[]
  const accept=(chunks:ReturnType<typeof adapter.finish>)=>{for(const chunk of chunks){const accepted=encoder.encode(chunk.packed),next=advanceSourcePrimaryComposition(paint,{ordinal:frames.length,frame:accepted.frame});paint=next.state;for(const draw of next.draws){draws.push(draw);definitions.push(accepted.frame.definitions[draw.definition])}frames.push(accepted.envelope)}}
  const consume=(iterator:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>)=>{
    while(true){const next=iterator.next();if(next.done){state=next.value;return}
      steps.push(next.value);accept(adapter.accept(next.value));const flush=adapter.flush();if(flush)accept([flush])
      if(resume){const saved=structuredClone(next.value.state);iterator.return(saved);if(!saved.cursor){state=saved;return}iterator=new SourceStrokeAuthor(structuredClone(p)).resume(saved)}
    }
  }
  for(const [xb,yb,t,pressure] of row.packets.slice(0,-1)){
    accept(adapter.beginInput(state));consume(author.plan(state,{...packet(fromBits(xb)+fixture.mapping.tx,fromBits(yb)+fixture.mapping.ty,t),pressure}))
  }
  accept(adapter.beginInput(state));consume(author.finish(state));accept(adapter.finish(state))
  expect(encoder.ended&&paint.ended).toBe(true)
  return {state,steps,draws,definitions,frames,pin}
}

describe('explicit native freehand startup, separate from historical paintAt inputs',()=>{
  it('defers nonairbrush DOWN without consuming option RNG or constructing a cached dab',()=>{
    const author=new SourceStrokeAuthor(program()),initial=author.createState(4321,7654,.3)
    const start=drain(author.plan(initial,packet()))
    expect(start.steps.filter(s=>s.kind==='material')).toHaveLength(0)
    expect(start.state.random).toEqual(initial.random)
    expect(start.state.roles[0].cache).toEqual({nextSequence:0})
    expect(start.state.inputOrdinal).toBe(1)
  })
  it.each(fixture.cases)('matches original-source placement and native GUI wholeRGBA: $id',row=>{
    const result=nativeRun(row),restarted=nativeRun(row,true)
    expect(restarted).toEqual(result)
    const painted=result.steps.filter(s=>s.kind==='material')
    expect(painted).toHaveLength(row.positions.length)
    painted.forEach((step,i)=>{expect(step.packet!.x).toBeCloseTo(row.positions[i][0],10);expect(step.packet!.y).toBeCloseTo(row.positions[i][1],10)})
    const q=result.pin.source,compiled=compileSourceSoftCircleProgram({kind:'auto',generator:'soft',shape:'circle',diameter:q.diameter,ratio:q.ratio,horizontalFade:q.horizontalFade,verticalFade:q.verticalFade,spikes:2,softness:1,randomness:0,density:1,antialias:false},{points:result.pin.radialCurve.source.points,coefficients:result.pin.radialCurve.coefficients},Math.floor(q.diameter*4+.5)+2)
    let output:Uint8Array=new Uint8Array(512*512*4)
    for(const [i,draw] of result.draws.entries()){
      const recipe=result.definitions[i] as {kind:string;brushScale:number;brushAngle:number;scale:number;ratio:number;rotation:number;subX:number;subY:number;width:number;height:number}
      expect(recipe.kind).toBe('softAuto')
      const dab=sourceSoftCircleDab({dialect:'krita-soft-circle-qt5-arm64-v1',program:compiled,storedScale:recipe.brushScale,storedAngle:recipe.brushAngle,shape:{scale:recipe.scale,ratio:recipe.ratio,rotation:recipe.rotation},subpixelX:recipe.subX,subpixelY:recipe.subY,coverageProfile:'neon64-f32-fma-v1',maxPixels:1048576,maxWorkSamples:16*1048576})
      const source=new Uint8Array(output.length)
      for(let y=Math.max(0,draw.y);y<Math.min(512,draw.y+recipe.height);y++)for(let x=Math.max(0,draw.x);x<Math.min(512,draw.x+recipe.width);x++)source[(y*512+x)*4+3]=dab.mask[(y-draw.y)*recipe.width+x-draw.x]
      const c=draw.controls
      if(c.kind!=='localAlphaDarken'||c.variant!=='creamy')throw Error('Unexpected native wash controls')
      output=compositeSourceFused32({profile:'installed-arm64-vector32-fused-fpcr0-v1',operator:'alphaDarkenCreamy',source,destination:output,cols:512,rows:512,sourceStride:2048,destinationStride:2048,maskStride:512,sourceAlignment:0,destinationAlignment:0,opacity:c.opacity,averageOpacity:c.averageOpacity,flow:c.flow}).pixels
    }
    expect(createHash('sha256').update(output).digest('hex')).toBe(row.nativeRGBA512SHA256)
    expect(result.state.ended).toBe(true)
  },30000)
  it('does not add an end dab after dispatched zero/subminimum MOVE and rejects events after end',()=>{
    const author=new SourceStrokeAuthor(program())
    let state=drain(author.plan(author.createState(1,2,0),packet())).state
    state=drain(author.plan(state,packet(48.25,96.25,10))).state
    state=drain(author.plan(state,packet(48.35,96.25,20))).state
    const end=drain(author.finish(state))
    expect(end.steps.filter(s=>s.kind==='material')).toHaveLength(0)
    expect(end.state.inputOrdinal).toBe(4)
    expect(()=>author.plan(end.state,packet()).next()).toThrow('ended')
    expect(()=>author.finish(end.state).next()).toThrow('finish')
    const zero=drain(author.plan(drain(author.plan(author.createState(1,2,0),packet())).state,packet(48.25,96.25,10))).state
    expect(drain(author.finish(zero)).steps.filter(s=>s.kind==='material')).toHaveLength(0)
  })
  it('retains eager airbrush initialization, rejects unproven dual native profiles and pins checkpoints',()=>{
    const p=program(),eager={...p,roles:[{...p.roles[0],timing:{enabled:true,rate:20,ignoreDistance:false}}]}
    const airbrush=new SourceStrokeAuthor(eager)
    const start=drain(airbrush.plan(airbrush.createState(1,2,0),packet()))
    expect(start.steps.filter(s=>s.kind==='material')).toHaveLength(1)
    expect(drain(airbrush.finish(start.state)).steps.filter(s=>s.kind==='material')).toHaveLength(0)
    expect(()=>new SourceStrokeAuthor({...p,roles:[p.roles[0],{...p.roles[0],id:'mask'}]})).toThrow('profile/roles')
    const legacy=new SourceStrokeAuthor({...p,inputProfile:undefined}),state=new SourceStrokeAuthor(p).createState(1,2,0)
    expect(()=>legacy.plan(state,packet()).next()).toThrow('checkpoint')
    const bad={...state,inputProfile:undefined}
    expect(()=>new SourceStrokeAuthor(p).plan(bad,packet()).next()).toThrow('checkpoint')
  })
  it('rejects finish before DOWN, during a suspended input, and corrupted end/profile checkpoints',()=>{
    const author=new SourceStrokeAuthor(program()),initial=author.createState(1,2,0)
    expect(()=>author.finish(initial).next()).toThrow('finish')
    const start=drain(author.plan(initial,packet())).state,iterator=author.plan(start,packet(52,99,10))
    const pending=iterator.next().value as SourceStrokeAuthorStep
    expect(pending.state.cursor).toBeDefined()
    expect(()=>author.finish(pending.state).next()).toThrow('finish')
    iterator.return(pending.state)
    expect(()=>author.resume({...pending.state,ended:true}).next()).toThrow('checkpoint')
    expect(()=>author.resume({...pending.state,inputProfile:undefined}).next()).toThrow('checkpoint')
    expect(()=>author.resume({...pending.state,cursor:{...pending.state.cursor!,kind:'finish',phase:'distance',requests:[]}}).next()).toThrow('checkpoint')
  })
})
