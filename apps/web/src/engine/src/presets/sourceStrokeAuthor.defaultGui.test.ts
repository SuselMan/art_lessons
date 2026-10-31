import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { CANONICAL_STROKE_RASTER_PROFILE, canonicalDefaultAutoSourceBinding, canonicalSourceComposition, type BrushDescriptor } from '@grafetto/shared'
import stock from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import fixture from './fixtures/sourceDefaultAutoWholePath/guiStroke.native.json'
import { sourceStrokeAuthorDescriptor } from './sourceStrokeAuthorDescriptor'
import { SourceStrokeAuthor, type SourceStrokeAuthorState, type SourceStrokeAuthorStep } from './sourceStrokeAuthor'
import { SourceStrokeMaterialAdapter, type SourceStrokeMaterialContextV2 } from './sourceStrokeMaterialAdapter'
import { SourceCanonicalFrameEncoder } from './sourceCanonicalFrameEncoder'
import { createSourcePrimaryComposition, advanceSourcePrimaryComposition } from './sourcePrimaryComposition'
import { sourceDefaultAutoDab } from './sourceDefaultAutoDab'
import { compositeSourceFused32 } from './sourceFused32'

const fromBits=(bits:number)=>new Float32Array(new Uint32Array([bits]).buffer)[0]
function run(resume:boolean){
  const row=stock.rows.find(r=>r.index===fixture.sourceIndex)!,descriptor=row.descriptor as unknown as BrushDescriptor
  expect(row.kppSHA256).toBe(fixture.kppSHA256)
  expect(createHash('sha256').update(JSON.stringify(descriptor)).digest('hex')).toBe(fixture.descriptorSHA256)
  const compiled=sourceStrokeAuthorDescriptor(descriptor,{colorIdentity:'native-GUI-black',lodScale:1,coverageProfile:'neon64-f32-fma-v1',inputProfile:'krita-freehand-no-smoothing-v1'})
  if(!compiled.supported)throw Error(compiled.reasons.join(','))
  const p=compiled.program,author=new SourceStrokeAuthor(p),pin=canonicalDefaultAutoSourceBinding(descriptor,fixture.descriptorSHA256,'neon64-f32-fma-v1')
  const policy=canonicalSourceComposition(descriptor,CANONICAL_STROKE_RASTER_PROFILE)
  if(!policy)throw Error('Source composition unavailable')
  const n=fixture.nativeControls,creamy=n.useCreamyAlphaDarken.value??n.useCreamyAlphaDarken.defaultValue
  const composition={...policy,alphaDarken:creamy?'creamy' as const:'hard' as const,outerResourceOpacity:n.uiResourceOpacityPercent/100}
  let state=author.createState(4321,7654,.3)
  const material:SourceStrokeMaterialContextV2={version:2,assets:[],primarySource:pin,targetGeometry:{pageBounds:{minX:0,minY:0,maxX:512,maxY:512},tileWidth:128,tileHeight:128,maxTargets:16},budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}
  const adapter=new SourceStrokeMaterialAdapter(p,material,state),encoder=new SourceCanonicalFrameEncoder({rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:descriptor.id+'@'+descriptor.version,strokeId:'native-default58',pigmentRgb8:[0,0,0],composition,material})
  let paint=createSourcePrimaryComposition(composition).state
  const frames:unknown[]=[],draws:ReturnType<typeof advanceSourcePrimaryComposition>['draws'][number][]=[],recipes:unknown[]=[],steps:SourceStrokeAuthorStep[]=[]
  const accept=(chunks:ReturnType<typeof adapter.finish>)=>{for(const chunk of chunks){const accepted=encoder.encode(chunk.packed),next=advanceSourcePrimaryComposition(paint,{ordinal:frames.length,frame:accepted.frame});paint=next.state;for(const draw of next.draws){draws.push(draw);recipes.push(accepted.frame.definitions[draw.definition])}frames.push(accepted.envelope)}}
  const consume=(iterator:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>)=>{
    while(true){const next=iterator.next();if(next.done){state=next.value;return}steps.push(next.value);accept(adapter.accept(next.value));const cut=adapter.flush();if(cut)accept([cut])
      if(resume){const saved=structuredClone(next.value.state);iterator.return(saved);if(!saved.cursor){state=saved;return}iterator=new SourceStrokeAuthor(structuredClone(p)).resume(saved)}
    }
  }
  for(const [xb,yb,t,pb] of fixture.packets.slice(0,-1)){
    accept(adapter.beginInput(state));consume(author.plan(state,{x:fromBits(xb)+fixture.mapping.tx,y:fromBits(yb)+fixture.mapping.ty,t,pressure:fromBits(pb),tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false}))
  }
  accept(adapter.beginInput(state));consume(author.finish(state));accept(adapter.finish(state))
  expect(encoder.ended&&paint.ended&&state.ended).toBe(true)
  return {state,steps,frames,draws,recipes,pin}
}

describe('actual GUI Default Auto original40 whole stroke with pressure',()=>{
  it('matches all native512RGBA bytes through SAME author/adapter/encoder and survives every-yield resume',()=>{
    const whole=run(false)
    expect(run(true)).toEqual(whole)
    expect(whole.frames).toHaveLength(fixture.frames)
    expect(whole.draws).toHaveLength(fixture.draws)
    expect(whole.pin.source.diameter).toBe(fixture.nativeControls.generatorDiameter)
    let output:Uint8Array=new Uint8Array(512*512*4)
    const q=whole.pin.source,tip={kind:'auto' as const,generator:'default' as const,shape:q.shape,diameter:q.diameter,ratio:q.ratio,horizontalFade:q.horizontalFade,verticalFade:q.verticalFade,antialias:q.antialias,spikes:2 as const,softness:1 as const,randomness:0 as const,density:1 as const}
    for(const [i,draw] of whole.draws.entries()){
      const r=whole.recipes[i] as {kind:string;brushScale:number;brushAngle:number;scale:number;ratio:number;rotation:number;subX:number;subY:number;width:number;height:number}
      expect(r.kind).toBe('defaultAuto')
      const dab=sourceDefaultAutoDab({dialect:'krita-default-auto-qt5-arm64-v1',tip,storedScale:r.brushScale,storedAngle:r.brushAngle,shape:{scale:r.scale,ratio:r.ratio,rotation:r.rotation},subpixelX:r.subX,subpixelY:r.subY,coverageProfile:'neon64-f32-fma-v1',maxPixels:1048576,maxWorkSamples:16*1048576})
      const source=new Uint8Array(output.length)
      for(let y=Math.max(0,draw.y);y<Math.min(512,draw.y+r.height);y++)for(let x=Math.max(0,draw.x);x<Math.min(512,draw.x+r.width);x++)source[(y*512+x)*4+3]=dab.mask[(y-draw.y)*r.width+x-draw.x]
      const c=draw.controls
      if(c.kind!=='localAlphaDarken'||c.variant!=='creamy')throw Error('Unexpected captured native composition')
      output=compositeSourceFused32({profile:'installed-arm64-vector32-fused-fpcr0-v1',operator:'alphaDarkenCreamy',source,destination:output,cols:512,rows:512,sourceStride:2048,destinationStride:2048,maskStride:512,sourceAlignment:0,destinationAlignment:0,opacity:c.opacity,averageOpacity:c.averageOpacity,flow:c.flow}).pixels
    }
    expect(createHash('sha256').update(output).digest('hex')).toBe(fixture.nativeRGBA512SHA256)
    const alpha=output.filter((_,i)=>i%4===3)
    expect(alpha.filter(v=>0<v&&v<255)).toHaveLength(fixture.coverage.partialPixels)
    expect(new Set(alpha).size).toBe(fixture.coverage.distinctAlpha)
  },30000)
})
