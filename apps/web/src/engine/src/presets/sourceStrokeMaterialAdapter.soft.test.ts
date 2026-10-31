import {expect,it} from 'vitest'
import {SOURCE_STAMP_MAPPED_COMPILER_PROFILE,sourceStampRequiredCurves,type BrushDescriptor,type SourceStampData,type CanonicalSoftAutoSource} from '@grafetto/shared'
import soft from '../../../../../../packages/shared/src/fixtures/sourceSoftAutoData/stock.native'
import stock from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import {sourceStrokeAuthorDescriptor} from './sourceStrokeAuthorDescriptor'
import {SourceStrokeAuthor,type SourceAuthorPacket} from './sourceStrokeAuthor'
import {SourceStrokeMaterialAdapter,copySourceMaterialContext,type SourceStrokeMaterialContextV2} from './sourceStrokeMaterialAdapter'
import {SourceCanonicalFrameEncoder} from './sourceCanonicalFrameEncoder'

// Synthetic mapped coefficients exercise the boundary; no native compiler or
// whole-stroke rendering equivalence is claimed by this fixture.
function fixture(){
  const data=structuredClone(soft.rows.find(r=>r.index===72)!.sourceStamp) as unknown as SourceStampData
  if(data.version!==2||data.source.kind!=='softAuto')throw Error('soft fixture')
  const radial={...data.source.softnessCurve}
  const entry=(source:typeof radial)=>({source,coefficients:Array.from({length:source.points.length-1},()=>[0,0,0,0] as const)})
  const source={...data.source,ratio:1,spikes:2,antialias:false,randomness:0,density:1} as const
  const compiled={version:2,reader:data.reader,profile:SOURCE_STAMP_MAPPED_COMPILER_PROFILE,buildId:'b'.repeat(64),curves:sourceStampRequiredCurves(data.options).map(entry),radialCurve:entry(radial)} as const
  const descriptor={...stock.rows[0].descriptor,sourceStamp:{...data,source,compiled,unsupported:[],role:'primary',brush:{...data.brush,scale:1},flags:{...data.flags,materialFixed1:true,textureEnabled:false}}} as unknown as BrushDescriptor
  const pin:CanonicalSoftAutoSource={kind:'softAuto',sourceSlot:0,descriptorId:descriptor.id,descriptorVersion:descriptor.version,descriptorSha256:'a'.repeat(64),source,brushScale:1,brushAngle:data.brush.angle,coverageProfile:'neon64-f32-fma-v1',reader:data.reader,compilerProfile:compiled.profile,buildId:compiled.buildId,radialCurve:compiled.radialCurve}
  const context:SourceStrokeMaterialContextV2={version:2,assets:[],primarySource:pin,budget:{workUnits:1e6,outputBytes:4e6,drawPixels:1e6}}
  return {descriptor,context,pin}
}
it('requires explicit soft profile and preserves historical unsupported frontier',()=>{
  const {descriptor}=fixture()
  expect(sourceStrokeAuthorDescriptor(descriptor,{colorIdentity:'black',lodScale:1}).supported).toBe(false)
  const fenced=structuredClone(descriptor);Object.assign(fenced.sourceStamp!,{unsupported:['soft-auto-raster-author-unavailable']})
  expect(sourceStrokeAuthorDescriptor(fenced,{colorIdentity:'black',lodScale:1,coverageProfile:'neon64-f32-fma-v1'})).toEqual({supported:false,reasons:['soft-auto-raster-author-unavailable']})
})
it('pins radial coefficients deeply and rejects a wrong role before author input',()=>{
  const {descriptor,context,pin}=fixture(),result=sourceStrokeAuthorDescriptor(descriptor,{colorIdentity:'black',lodScale:1,coverageProfile:'neon64-f32-fma-v1'})
  if(!result.supported)throw Error(result.reasons.join(','))
  const copy=copySourceMaterialContext(context)
  if(!('version' in copy)||copy.primarySource.kind!=='softAuto')throw Error('soft pin')
  expect(copy.primarySource.radialCurve).not.toBe(pin.radialCurve)
  expect(Object.isFrozen(copy.primarySource.radialCurve.coefficients[0])).toBe(true)
  const author=new SourceStrokeAuthor(result.program),state=author.createState(1,2,0)
  expect(()=>new SourceStrokeMaterialAdapter(result.program,{...context,primarySource:{...pin,sourceSlot:1}},state)).toThrow()
})
it('feeds saved soft generations through adapter checkpoints and the common encoder',()=>{
  const {descriptor,context}=fixture(),result=sourceStrokeAuthorDescriptor(descriptor,{colorIdentity:'black',lodScale:1,coverageProfile:'neon64-f32-fma-v1'})
  if(!result.supported)throw Error(result.reasons.join(','))
  expect(result.program.roles[0].materialPolicy).toBe('soft-auto-fixed1-rng-free')
  const author=new SourceStrokeAuthor(result.program);let state=author.createState(1,2,0)
  let adapter=new SourceStrokeMaterialAdapter(result.program,context,state)
  const encoder=new SourceCanonicalFrameEncoder({brush:descriptor.id+'@'+descriptor.version,strokeId:'soft',pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},material:context})
  let draws=0
  const submit=(chunks:ReturnType<typeof adapter.finish>)=>{for(const chunk of chunks){expect(encoder.encode(chunk.packed).frame).toEqual(chunk.frame);draws+=chunk.frame.draws.length;for(const recipe of chunk.frame.definitions){expect(recipe.kind).toBe('softAuto');if(recipe.kind==='softAuto')expect(recipe.sourceSlot).toBe(0)}}}
  for(let i=0;i<4;i++){
    submit(adapter.beginInput(state))
    const packet:SourceAuthorPacket={x:i*4,y:0,t:i*20,pressure:.5,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false}
    const iterator=author.plan(state,packet)
    while(true){const next=iterator.next();if(next.done){state=next.value;break}submit(adapter.accept(next.value));adapter=new SourceStrokeMaterialAdapter(result.program,context,next.value.state,adapter.checkpoint())}
  }
  submit(adapter.finish(state));expect(draws).toBeGreaterThan(0);expect(encoder.ended).toBe(true)
})
