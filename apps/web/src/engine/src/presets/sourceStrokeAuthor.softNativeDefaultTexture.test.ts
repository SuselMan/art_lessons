import {createHash}from'node:crypto'
import {describe,it,expect,vi}from'vitest'
import actual from '../../../../../../packages/shared/src/fixtures/sourceSoftAutoData/texturePressure.native-default.compiled4.metadata.json' with{type:'json'}
import{buildCanonicalMaterial,canonicalSoftAutoCost,canonicalPrimaryTextureDrawWork,canonicalBrushDescriptorJSON,canonicalSoftAutoNativeDefaultTextureSourceBinding,canonicalPressureCurvePrimaryTexturePin,canonicalSoftNativeDefaultTexturedSourceMaterialContext,canonicalSourceComposition,extractCanonicalSoftAutoNativeDefaultTextureProgramData,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B,type BrushDescriptor,type CanonicalMaterialFrameV6}from'@grafetto/shared'
import{sourceStrokeAuthorDescriptor}from'./sourceStrokeAuthorDescriptor'
import{SourceStrokeAuthor,sourceNativeDefaultMaterialProgramCpuBytes,type SourceAuthorPacket,type SourceStrokeAuthorStep}from'./sourceStrokeAuthor'
import{SourceStrokeMaterialAdapter,type SourceStrokeMaterialChunk}from'./sourceStrokeMaterialAdapter'
import{SourceCanonicalFrameEncoder}from'./sourceCanonicalFrameEncoder'
import{BrushMipCache}from'../dabs/BrushMipCache'
import{AuthorInputFIFO}from'../input/AuthorInputFIFO'
import*as optionCompiler from'./sourceOptionProgram'
import{compileSourceOptionProgram}from'./sourceOptionProgram'
import{KritaRandomSource,KritaPerStrokeRandomSource}from'./nativeRandom'
import{sourceStandardOption}from'./sourceOption'
const packet=(x:number,t:number,pressure:number):SourceAuthorPacket=>({x,y:2,t,pressure,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false})
function setup(browser=false,budget=64*1048576){
 const descriptor=structuredClone(actual.descriptor)as unknown as BrushDescriptor,sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex'),rasterProfile=browser?B:G,coverageProfile=browser?'browser-number-coverage-v1' as const:'neon64-f32-fma-v1' as const
 const capability=extractCanonicalSoftAutoNativeDefaultTextureProgramData(descriptor,{pattern:actual.patternAsset});if(!capability.supported)throw Error(capability.reasons.join(','))
 const t=descriptor.texture!,asset={...capability.patternAsset,width:t.patternSize!.width,height:t.patternSize!.height}
 const context=canonicalSoftNativeDefaultTexturedSourceMaterialContext({version:6,assets:[asset],primarySource:canonicalSoftAutoNativeDefaultTextureSourceBinding(descriptor,sha,coverageProfile,actual.patternAsset,rasterProfile),primaryTexture:canonicalPressureCurvePrimaryTexturePin({kind:'canvasTexture',asset:t.id,law:'subtract-u8-v1',width:t.patternSize!.width,height:t.patternSize!.height,periodX:t.periodPx,periodY:t.periodPx,offsetX:t.offset!.x,offsetY:t.offset!.y,strength:'source-pressure-curve-v1'},[asset]),budget:{workUnits:budget,outputBytes:16*1048576,drawPixels:16*1048576}})
 const bytes=sourceNativeDefaultMaterialProgramCpuBytes(capability.program),cpu=new BrushMipCache(bytes),release=cpu.reserve(bytes)
 const compiled=sourceStrokeAuthorDescriptor(descriptor,{inputProfile:'krita-freehand-no-smoothing-v1',colorIdentity:'self',lodScale:1,coverageProfile,softPressurePrimaryTexture:{context,rasterProfile,materialCpuBudgetBytes:bytes}})
 if(!compiled.supported){release();throw Error(compiled.reasons.join(','))}
 return{descriptor,context,sha,rasterProfile,coverageProfile,capability,program:compiled.program,cpu,bytes,release}
}
function run(browser=false,fifo=false,cut=false,budget=64*1048576,constant=false){
 const s=setup(browser,budget),author=new SourceStrokeAuthor(s.program);let state=author.createState(123,456,0)
 const adapter=new SourceStrokeMaterialAdapter(s.program,s.context,state),chunks:SourceStrokeMaterialChunk<CanonicalMaterialFrameV6>[]=[],steps:SourceStrokeAuthorStep[]=[]
 function* consume(iterator:ReturnType<typeof author.plan>):Generator<void,void,void>{for(;;){const n=iterator.next();if(n.done){state=n.value;return}state=n.value.state;steps.push(n.value);chunks.push(...adapter.accept(n.value));if(cut){const chunk=adapter.flush();if(chunk)chunks.push(chunk)}yield}}
 const jobs=new Map<number,()=>void>();let now=0,id=0
 const queue=new AuthorInputFIFO({schedule:fn=>{jobs.set(++id,fn);return id},unschedule:key=>{jobs.delete(key)},now:()=>now+=.25,failed:error=>{throw error}},4,2)
 const input=(p:SourceAuthorPacket)=>function*(){chunks.push(...adapter.beginInput(state));yield*consume(author.plan(state,p))}
 const work=[input(packet(0,0,constant?.8:.2)),input(packet(96,10,.8)),input(packet(192,20,.8)),input(packet(288,30,constant?.8:.4)),function*(){chunks.push(...adapter.beginInput(state));yield*consume(author.finish(state));chunks.push(...adapter.finish(state))}]
 try{for(const job of work)if(fifo)queue.enqueue(job);else for(const _ of job())void _
  while(queue.pending){const entry=jobs.entries().next().value;if(!entry)throw Error('FIFO progress lost');jobs.delete(entry[0]);entry[1]()}
  const encoder=new SourceCanonicalFrameEncoder({materialVersion:6 as const,rasterProfile:s.rasterProfile,brush:'brush:'+s.descriptor.id+'@'+s.descriptor.version,strokeId:'self-pressure-reptile',pigmentRgb8:[12,34,56]as const,composition:{...canonicalSourceComposition(s.descriptor,s.rasterProfile)!,alphaDarken:'hard' as const,outerResourceOpacity:1},material:s.context})
  const encoded=chunks.map(c=>encoder.encode(c.packed));return{...s,state,chunks,steps,encoded,ended:encoder.ended}
 }finally{queue.cancel();s.release();expect(s.cpu.reservedBytes).toBe(0)}
}
const events=(frames:readonly CanonicalMaterialFrameV6[])=>frames.flatMap(f=>Array.from({length:f.draws.length+1},(_,i)=>[...f.fences.filter(v=>v.at===i).map(({at:_at,...v})=>({fence:v})),...i<f.draws.length?[{draw:{...f.draws[i],definition:undefined,recipe:f.definitions[f.draws[i].definition]}}]:[]]).flat())
describe('actual genuine compiled4 to explicit material6 author core only',()=>{
 it.each([false,true])('evaluates original native-default compiled curve for every actual material browser=%s',browser=>{
  const s=run(browser),material=s.steps.filter(v=>v.kind==='material'),draws=s.chunks.flatMap(c=>c.frame.draws),inputs=s.chunks.flatMap(c=>c.inputs)
  expect(material.length).toBeGreaterThan(3);expect(draws).toHaveLength(material.length)
  const curve=s.capability.program.curve,option=compileSourceOptionProgram({id:'TextureStrength',checked:true,useCurve:true,curveMode:0,strength:1,min:0,max:1,sensors:[{id:'pressure',curve:{points:curve.source.points,coefficients:curve.coefficients,arithmetic:'installed-arm64-fused-v1'}}]})
  material.forEach((step,i)=>{const pressure=step.packet!.pressure;const value=sourceStandardOption(option.bind({pressure,maxPressure:pressure,tangentialPressure:0,speed:0,drawingAngle:0,lockedDrawingAngle:0,rotation:0,xTilt:0,yTilt:0,tiltDirectionOffset:0,perspective:1,time:0,dabSequence:0,distance:0,hover:false}),{random:new KritaRandomSource(1),perStroke:new KritaPerStrokeRandomSource(2),hover:false});expect(step.materialStrength).toBe(value);expect(draws[i].grainDepth).toBe(value);expect(inputs[i].materialStrength).toBe(value)})
  expect(material.every(v=>['Dab','Postprocess','Copy'].includes(v.result!.material!.type))).toBe(true)
  expect(s.steps.filter(v=>v.kind!=='material').every(v=>v.materialStrength===undefined)).toBe(true)
  // Genuine native-default curve is identity here: compare original compiled evaluator above, never require invented nonlinearity.
  expect(s.chunks.every(c=>c.packed.startsWith('6|'))).toBe(true);expect(s.ended).toBe(true)
  expect(s.descriptor).toEqual(actual.descriptor)
 })
 it('keeps per-yield/chunk/FIFO semantics and final RNG exact',()=>{
  const a=run(),b=run(false,true),c=run(false,true,true)
  expect(events(a.chunks.map(c=>c.frame))).toEqual(events(b.chunks.map(c=>c.frame)));expect(events(a.chunks.map(c=>c.frame))).toEqual(events(c.chunks.map(c=>c.frame)))
  expect(a.state).toEqual(b.state);expect(a.state).toEqual(c.state)
 })
 it('rejects missing/insufficient extra CPU reservation before material table allocation',()=>{
  const s=setup();try{
   const common={colorIdentity:'self',lodScale:1,coverageProfile:s.coverageProfile}
   const bad=structuredClone(s.program);Reflect.deleteProperty(bad.roles[0],'materialCpuBudgetBytes')
   const compiler=vi.spyOn(optionCompiler,'compileSourceOptionProgram'),clone=vi.spyOn(globalThis,'structuredClone')
   try{
    expect(sourceStrokeAuthorDescriptor(s.descriptor,{...common,softPressurePrimaryTexture:{context:s.context,rasterProfile:G,materialCpuBudgetBytes:s.bytes-1}})).toMatchObject({supported:false})
    expect(Reflect.apply(sourceStrokeAuthorDescriptor,undefined,[s.descriptor,{...common,softPressurePrimaryTexture:{context:s.context,rasterProfile:G}}])).toMatchObject({supported:false})
    expect(()=>new SourceStrokeAuthor(bad)).toThrow('cpu-budget')
    expect(compiler).not.toHaveBeenCalled();expect(clone).not.toHaveBeenCalled()
   }finally{compiler.mockRestore();clone.mockRestore()}
   const cpu=new BrushMipCache(s.bytes-1);expect(()=>cpu.reserve(s.bytes)).toThrow();expect(cpu.reservedBytes).toBe(0)
  }finally{s.release();expect(s.cpu.reservedBytes).toBe(0)}
 })
 it('keeps explicit6 context and pending scalar checkpoint, rejects4 or changed scalar without prefix mutation',()=>{
  const s=setup();try{const author=new SourceStrokeAuthor(s.program);let state=author.createState(123,456,0);const adapter=new SourceStrokeMaterialAdapter(s.program,s.context,state)
   for(const p of[packet(0,0,.4),packet(12,10,.7)]){adapter.beginInput(state);const iter=author.plan(state,p);for(;;){const n=iter.next();if(n.done){state=n.value;break}state=n.value.state;adapter.accept(n.value);if(n.value.kind==='material'){
    const checkpoint=adapter.checkpoint();expect(checkpoint.version).toBe(6);expect(()=>new SourceStrokeMaterialAdapter(s.program,s.context,state,checkpoint)).not.toThrow()
    const old=structuredClone(checkpoint);Reflect.set(old,'version',4);expect(()=>new SourceStrokeMaterialAdapter(s.program,s.context,state,old)).toThrow()
    const altered=structuredClone(checkpoint);Reflect.set(altered.draws[0],'grainDepth',.999);expect(()=>new SourceStrokeMaterialAdapter(s.program,s.context,state,altered)).toThrow();expect(adapter.checkpoint()).toEqual(checkpoint);iter.return(state);return
   }}}
   throw Error('material checkpoint required')
  }finally{s.release()}
 })
 it('uses original context/pattern/profile and refuses cross-version/foreign program before authoring',()=>{
  const s=setup();try{
   const common={colorIdentity:'self',lodScale:1,coverageProfile:s.coverageProfile}
   expect(sourceStrokeAuthorDescriptor(s.descriptor,common).supported).toBe(false)
   const changed=canonicalSoftNativeDefaultTexturedSourceMaterialContext({...s.context,primaryTexture:canonicalPressureCurvePrimaryTexturePin({...s.context.primaryTexture,offsetX:1},s.context.assets)})
   expect(sourceStrokeAuthorDescriptor(s.descriptor,{...common,softPressurePrimaryTexture:{context:changed,rasterProfile:G,materialCpuBudgetBytes:s.bytes}}).supported).toBe(false)
   expect(sourceStrokeAuthorDescriptor(s.descriptor,{...common,softPressurePrimaryTexture:{context:s.context,rasterProfile:B,materialCpuBudgetBytes:s.bytes}}).supported).toBe(false)
   expect(sourceStrokeAuthorDescriptor(s.descriptor,{...common,softPressurePrimaryTexture:{context:s.context,rasterProfile:G,materialCpuBudgetBytes:s.bytes},compileCurve:()=>{throw Error('must not call foreign compiler')}}).supported).toBe(false)
   const program=structuredClone(s.capability.program),getter=vi.fn(()=>.2);Object.defineProperty(program.curve.source.points[0],'x',{get:getter})
   expect(()=>sourceNativeDefaultMaterialProgramCpuBytes(program)).toThrow();expect(getter).not.toHaveBeenCalled()
  }finally{s.release()}
 })
 it('helper and constructor reject point/coefficient array accessors BEFORE getters or clone',()=>{
  const s=setup();try{
   for(const part of['point-index','point-field','coefficient-index','coefficient-field']as const){
    const program=structuredClone(s.program),material=program.roles[0].materialProgram!,getter=vi.fn(()=>0)
    if(material.kind!=='texture-pressure-native-default-v1')throw Error('Native-default material required');if(part==='point-index')Object.defineProperty(material.curve.source.points,'0',{get:getter})
    if(part==='point-field')Object.defineProperty(material.curve.source.points[0],'x',{get:getter})
    if(part==='coefficient-index')Object.defineProperty(material.curve.coefficients,'0',{get:getter})
    if(part==='coefficient-field')Object.defineProperty(material.curve.coefficients[0],'0',{get:getter})
    expect(()=>sourceNativeDefaultMaterialProgramCpuBytes(material)).toThrow()
    const clone=vi.spyOn(globalThis,'structuredClone');try{expect(()=>new SourceStrokeAuthor(program)).toThrow();expect(clone).not.toHaveBeenCalled()}finally{clone.mockRestore()}
    expect(getter).not.toHaveBeenCalled()
   }
  }finally{s.release()}
 })
 it('adapter chunk work includes EACH actual draw full texture area',()=>{
  const whole=run(false,false,false,64*1048576,true),frames=whole.chunks.map(c=>c.frame),drawCount=frames.reduce((n,f)=>n+f.draws.length,0)
  expect(frames.filter(f=>f.draws.length)).toHaveLength(1)
  const frame=frames.find(f=>f.draws.length)!,geometry=frame.definitions.reduce((n,d)=>n+canonicalSoftAutoCost(d,whole.context.primarySource).workUnits,0),texture=frame.draws.reduce((n,d)=>{const r=frame.definitions[d.definition];return n+canonicalPrimaryTextureDrawWork(r.width,r.height)},0)
  expect(frame.definitions.length).toBeLessThanOrEqual(drawCount);expect(texture).toBeGreaterThan(0)
  const limited=run(false,false,false,geometry+texture-1,true)
  expect(limited.chunks.filter(c=>c.frame.draws.length).length).toBeGreaterThan(1)
  expect(events(limited.chunks.map(c=>c.frame))).toEqual(events(frames));expect(limited.state).toEqual(whole.state)
 })
 it('counts full texture work every DRAW independently from definition reuse and refuses cold overflow',()=>{
  const s=setup(false,0);try{const author=new SourceStrokeAuthor(s.program);let state=author.createState(123,456,0);const adapter=new SourceStrokeMaterialAdapter(s.program,s.context,state)
   for(const p of[packet(0,0,.4),packet(12,10,.7)]){adapter.beginInput(state);const iter=author.plan(state,p);for(;;){const n=iter.next();if(n.done){state=n.value;break}state=n.value.state;if(n.value.kind==='material'){const before=adapter.checkpoint();expect(()=>adapter.accept(n.value)).toThrow(/cold chunk/);expect(adapter.checkpoint()).toEqual(before);iter.return(state);return}adapter.accept(n.value)}}throw Error('overflow required')
  }finally{s.release()}
 })
})

it('refuses changed Soft geometry/radial or material kind before frame admission',()=>{const s=setup();try{for(const part of ['source','radial','kind']as const){const program=structuredClone(s.program),role=program.roles[0],g=role.geometry;if(!g||g.kind!=='softAuto')throw Error('Soft geometry required');if(part==='source')Reflect.set(g.source,'diameter',42);if(part==='radial')Reflect.set(g.source.softnessCurve,'text','0,0;1,0;');if(part==='kind')Reflect.set(role.materialProgram!,'kind','texture-pressure-curve-v1');expect(()=>new SourceStrokeMaterialAdapter(program,s.context,new SourceStrokeAuthor(s.program).createState(1,2,0))).toThrow()}}finally{s.release();expect(s.cpu.reservedBytes).toBe(0)}})

it('keeps old strength owner charged across candidate failure and successful coexistence on SAME cache',()=>{const s=setup();s.release();const cpu=new BrushMipCache(s.bytes*2),old=cpu.reserve(s.bytes);try{const held=cpu.reserve(s.bytes);expect(()=>cpu.reserve(1)).toThrow();expect(cpu.reservedBytes).toBe(s.bytes*2);const invalid=structuredClone(s.program);Reflect.deleteProperty(invalid.roles[0],'materialCpuBudgetBytes');try{expect(()=>new SourceStrokeAuthor(invalid)).toThrow()}finally{held()}expect(cpu.reservedBytes).toBe(s.bytes);const candidate=cpu.reserve(s.bytes);try{expect(()=>new SourceStrokeAuthor(s.program)).not.toThrow();expect(cpu.reservedBytes).toBe(s.bytes*2)}finally{candidate()}expect(cpu.reservedBytes).toBe(s.bytes);expect(()=>new SourceStrokeAuthor(s.program)).not.toThrow()}finally{old();expect(cpu.reservedBytes).toBe(0)}})

it('charges EVERY recorded draw on one repeated Soft recipe without claiming genuine author Copy',()=>{const s=run(),recipe=s.chunks.flatMap(c=>c.frame.definitions)[0],area=canonicalPrimaryTextureDrawWork(recipe.width,recipe.height),geometry=canonicalSoftAutoCost(recipe,s.context.primarySource).workUnits,draws=[0,.25,1].map((grainDepth,i)=>({recipe,role:'primary' as const,x:i*4,y:0,opacity:1,flow:1,grainDepth})),input={masked:false as const,entry:{phase:'between' as const},draws,fences:[{kind:'segmentBegin' as const,at:0,group:0},{kind:'primaryEnd' as const,at:3,group:0},{kind:'segmentEnd' as const,at:3,group:0},{kind:'gestureEnd' as const,at:3}]};const exact=canonicalSoftNativeDefaultTexturedSourceMaterialContext({...s.context,budget:{...s.context.budget,workUnits:geometry+area*3}});const built=buildCanonicalMaterial(input,exact);expect(built.frame.definitions).toHaveLength(1);expect(built.frame.draws.map(d=>d.grainDepth)).toEqual([0,.25,1]);const limited=canonicalSoftNativeDefaultTexturedSourceMaterialContext({...exact,budget:{...exact.budget,workUnits:geometry+area*3-1}});expect(()=>buildCanonicalMaterial(input,limited)).toThrow()})
