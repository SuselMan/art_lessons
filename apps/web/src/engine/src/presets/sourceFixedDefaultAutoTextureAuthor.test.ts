/// <reference types="node" />
import {createHash} from 'node:crypto'
import {describe,expect,it} from 'vitest'
import actual from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/screentonesRegular.texture.native.json' with {type:'json'}
import {canonicalBrushDescriptorJSON,canonicalFixedPrimaryTexturePin,canonicalTexturedSourceMaterialContext,canonicalDefaultAutoFixedTextureSourceBinding,canonicalSourceComposition,buildCanonicalMaterial,extractCanonicalDefaultAutoFixedTextureCapability,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B,CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE,type BrushDescriptor,type CanonicalMaterialContextV4,type CanonicalMaterialFrameV4} from '@grafetto/shared'
import {canonicalSourceAuthorAdmission} from './sourceCanonicalAuthorAdmission'
import {sourceStrokeAuthorDescriptor} from './sourceStrokeAuthorDescriptor'
import {SourceStrokeAuthor,type SourceAuthorPacket} from './sourceStrokeAuthor'
import {SourceStrokeMaterialAdapter,type SourceStrokeMaterialChunk} from './sourceStrokeMaterialAdapter'
import {SourceCanonicalFrameEncoder} from './sourceCanonicalFrameEncoder'
const packet=(x:number,t:number,pressure:number):SourceAuthorPacket=>({x,y:2,t,pressure,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false})
function setup(browser=false,change?:(context:CanonicalMaterialContextV4)=>CanonicalMaterialContextV4){
 const descriptor=structuredClone(actual.descriptor) as unknown as BrushDescriptor,sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex'),rasterProfile=browser?B:G,coverageProfile=browser?CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE:'neon64-f32-fma-v1' as const
 const capability=extractCanonicalDefaultAutoFixedTextureCapability(descriptor,{pattern:actual.patternAsset});if(!capability.supported)throw Error('Genuine Regular fixed semantic capability required')
 const source=canonicalDefaultAutoFixedTextureSourceBinding(descriptor,sha,coverageProfile,actual.patternAsset,rasterProfile)
 let context=canonicalTexturedSourceMaterialContext({version:4,assets:[capability.capability.patternAsset],primarySource:source,primaryTexture:capability.capability.primaryTexture,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}})
 if(change)context=canonicalTexturedSourceMaterialContext(change(context))
 const compiled=sourceStrokeAuthorDescriptor(descriptor,{inputProfile:'krita-freehand-no-smoothing-v1',colorIdentity:'self-authored',lodScale:1,coverageProfile,fixedPrimaryTexture:{context,rasterProfile}})
 if(!compiled.supported)throw Error(compiled.reasons.join(','))
 return{descriptor,sha,rasterProfile,coverageProfile,context,program:compiled.program}
}
function run(browser=false,cut=false){
 const s=setup(browser),author=new SourceStrokeAuthor(s.program);let state=author.createState(123,456,0)
 const adapter=new SourceStrokeMaterialAdapter(s.program,s.context,state),chunks:SourceStrokeMaterialChunk<CanonicalMaterialFrameV4>[]=[]
 const consume=(iterator:ReturnType<typeof author.plan>)=>{for(;;){const step=iterator.next();if(step.done){state=step.value;break}state=step.value.state;chunks.push(...adapter.accept(step.value));if(cut){const pending=adapter.flush();if(pending)chunks.push(pending)}}}
 for(const input of [packet(0,0,.2),packet(10,10,.9),packet(20,20,.4)]){chunks.push(...adapter.beginInput(state));consume(author.plan(state,input))}
 chunks.push(...adapter.beginInput(state));consume(author.finish(state));chunks.push(...adapter.finish(state))
 const encoder=new SourceCanonicalFrameEncoder({materialVersion:4 as const,rasterProfile:s.rasterProfile,brush:'brush:'+s.descriptor.id+'@'+s.descriptor.version,strokeId:'self-authored-fixed-regular',pigmentRgb8:[12,34,56] as const,composition:{...canonicalSourceComposition(s.descriptor,s.rasterProfile)!,alphaDarken:'hard' as const,outerResourceOpacity:1},material:s.context})
 const encoded=chunks.map(c=>{const encoded=encoder.encode(c.packed);expect(encoded.frame).toEqual(c.frame);return encoded})
 return{...s,author,state,adapter,chunks,encoded,encoder}
}
const events=(frames:readonly CanonicalMaterialFrameV4[])=>frames.flatMap(f=>Array.from({length:f.draws.length+1},(_,i)=>[...f.fences.filter(v=>v.at===i).map(({at:_at,...v})=>({fence:v})),...i<f.draws.length?[{draw:{...f.draws[i],definition:undefined,recipe:f.definitions[f.draws[i].definition]}}]:[]]).flat())
describe('actual original Regular author to explicit general material4 first subset',()=>{
 it.each([false,true])('changes real pressure geometry while fixed grain stays1; same source/FIFO-independent cuts browser=%s',browser=>{
  const whole=run(browser),cut=run(browser,true),draws=whole.chunks.flatMap(c=>c.frame.draws),recipes=whole.chunks.flatMap(c=>c.frame.definitions),inputs=whole.chunks.flatMap(c=>c.inputs)
  expect(draws.length).toBeGreaterThan(2);expect(draws.every(d=>d.grainDepth===1&&d.role==='primary')).toBe(true)
  expect(new Set(recipes.map(r=>r.scale)).size).toBeGreaterThan(1);expect(new Set(inputs.map(i=>i.packet.pressure)).size).toBeGreaterThan(2)
  expect(whole.context.assets).toHaveLength(1);expect(whole.context.assets[0].id).toBe(actual.patternAsset.id)
  expect(whole.chunks.every(c=>c.packed.startsWith('4|')&&c.frame.masked===false)).toBe(true)
  expect(events(cut.chunks.map(c=>c.frame))).toEqual(events(whole.chunks.map(c=>c.frame)));expect(cut.state).toEqual(whole.state)
  expect(whole.encoded.map(e=>e.envelope.frameOrdinal)).toEqual(whole.encoded.map((_,i)=>i));expect(whole.encoder.ended).toBe(true)
  expect(whole.chunks.flatMap(c=>c.frame.fences).filter(f=>f.kind==='gestureEnd')).toHaveLength(1)
  expect(whole.descriptor).toEqual(actual.descriptor)
 })
 it('requires independent opt-in leaf and explicit closed4 compiler context, never normalizes original texture flags',()=>{
  const s=setup(),before=structuredClone(s.descriptor),metadata=[actual.patternAsset]
  expect(canonicalSourceAuthorAdmission(s.descriptor,G,metadata).supported).toBe(false)
  expect(canonicalSourceAuthorAdmission(s.descriptor,G,metadata,{primaryTextureSource:'pressure-identity-subtract-v3'}).supported).toBe(false)
  expect(canonicalSourceAuthorAdmission(s.descriptor,G,metadata,{texturedSource:'fixed-default-auto-texture-v4'})).toMatchObject({supported:true,material:{kind:'autoTexture'}})
  expect(sourceStrokeAuthorDescriptor(s.descriptor,{colorIdentity:'self',lodScale:1,coverageProfile:s.coverageProfile}).supported).toBe(false)
  const changed=canonicalTexturedSourceMaterialContext({...s.context,primaryTexture:canonicalFixedPrimaryTexturePin({...s.context.primaryTexture,offsetX:1},s.context.assets[0])})
  expect(sourceStrokeAuthorDescriptor(s.descriptor,{colorIdentity:'self',lodScale:1,coverageProfile:s.coverageProfile,fixedPrimaryTexture:{context:changed,rasterProfile:G}}).supported).toBe(false)
  const browser=setup(true)
  expect(sourceStrokeAuthorDescriptor(browser.descriptor,{colorIdentity:'self',lodScale:1,coverageProfile:s.coverageProfile,fixedPrimaryTexture:{context:browser.context,rasterProfile:B}})).toMatchObject({supported:false,reasons:['fixed-texture-source-context-mismatch']})
  expect(s.descriptor).toEqual(before)
 })
 it('binds program4 context and checkpoint4; rejects foreign version/phase/grain without changing the accepted prefix',()=>{
  const s=setup(),author=new SourceStrokeAuthor(s.program);let state=author.createState(123,456,0);const adapter=new SourceStrokeMaterialAdapter(s.program,s.context,state)
  adapter.beginInput(state);let iterator=author.plan(state,packet(0,0,.4));for(;;){const step=iterator.next();if(step.done){state=step.value;break}adapter.accept(step.value);state=step.value.state}
  adapter.beginInput(state);iterator=author.plan(state,packet(10,10,.8));for(;;){const step=iterator.next();if(step.done)throw Error('Real material checkpoint required');adapter.accept(step.value);state=step.value.state;if(step.value.kind==='material')break}
  const checkpoint=adapter.checkpoint();expect(checkpoint.version).toBe(4);expect(checkpoint.materialVersion).toBe(4);expect(checkpoint.draws.length).toBeGreaterThan(0)
  expect(()=>new SourceStrokeMaterialAdapter(s.program,s.context,state,checkpoint)).not.toThrow()
  const changed=canonicalTexturedSourceMaterialContext({...s.context,primaryTexture:canonicalFixedPrimaryTexturePin({...s.context.primaryTexture,offsetX:1},s.context.assets[0])})
  expect(()=>new SourceStrokeMaterialAdapter(s.program,changed,state,checkpoint)).toThrow()
  for(const version of [1,2,3]){const bad=structuredClone(checkpoint);Reflect.set(bad,'version',version);expect(()=>new SourceStrokeMaterialAdapter(s.program,s.context,state,bad)).toThrow()}
  const bad=structuredClone(checkpoint);Reflect.set(bad.draws[0],'grainDepth',.5);expect(()=>new SourceStrokeMaterialAdapter(s.program,s.context,state,bad)).toThrow();expect(adapter.checkpoint()).toEqual(checkpoint)
  iterator.return(state)
 })
 it('rejects actual material beyond a cold work budget without mutating the pending prefix',()=>{
  const s=setup(false,c=>({...c,budget:{...c.budget,workUnits:0}})),author=new SourceStrokeAuthor(s.program);let state=author.createState(123,456,0);const adapter=new SourceStrokeMaterialAdapter(s.program,s.context,state)
  for(const input of [packet(0,0,.4),packet(10,10,.8)]){adapter.beginInput(state);const iterator=author.plan(state,input);for(;;){const step=iterator.next();if(step.done){state=step.value;break}if(step.value.kind==='material'){const before=adapter.checkpoint();expect(()=>adapter.accept(step.value)).toThrow(/cold chunk/);expect(adapter.checkpoint()).toEqual(before);iterator.return(step.value.state);return}adapter.accept(step.value);state=step.value.state}}
  throw Error('Genuine material budget witness missing')
 })
 it('uses real shared decode and rejects version2/4 cross-encoding before ordinal mutation',()=>{
  const s=setup(),common={rasterProfile:G,brush:'brush:'+s.descriptor.id+'@'+s.descriptor.version,strokeId:'self-foreign-version',pigmentRgb8:[1,2,3] as const,composition:{mode:'wash' as const,alphaDarken:'hard' as const,outerResourceOpacity:1,outerBlend:'over' as const}},c2={version:2 as const,assets:[],primarySource:s.context.primarySource,budget:s.context.budget},empty={masked:false as const,entry:{phase:'between' as const},draws:[],fences:[]}
  const e4=new SourceCanonicalFrameEncoder({...common,materialVersion:4 as const,material:s.context}),e2=new SourceCanonicalFrameEncoder({...common,materialVersion:2 as const,material:c2})
  expect(()=>e4.encode(buildCanonicalMaterial(empty,c2).packed)).toThrow();expect(e4.nextFrameOrdinal).toBe(0)
  expect(()=>e2.encode(buildCanonicalMaterial(empty,s.context).packed)).toThrow();expect(e2.nextFrameOrdinal).toBe(0)
  const wrong={...common,material:s.context};expect(()=>Reflect.construct(SourceCanonicalFrameEncoder,[wrong])).toThrow()
 })
})
