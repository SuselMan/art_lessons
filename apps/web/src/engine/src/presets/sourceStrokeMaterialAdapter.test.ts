import { SourceCanonicalFrameEncoder } from './sourceCanonicalFrameEncoder'
import { describe,expect,it,vi } from 'vitest'
import { assertPrimaryCanonicalMaterial,canonicalMaterialGeometryCost,unpackCanonicalMaterial,CANONICAL_STROKE_RASTER_PROFILE,decodeCanonicalStrokeFrame } from '@grafetto/shared'
import { SourceStrokeMaterialAdapter,type SourceStrokeMaterialChunk,type SourceStrokeMaterialContext } from './sourceStrokeMaterialAdapter'
import { SourceStrokeAuthor,type SourceStrokeAuthorProgram,type SourceAuthorPacket,type SourceAuthorRoleProgram,type SourceStrokeAuthorState,type SourceStrokeAuthorStep } from './sourceStrokeAuthor'
import type { SourceOptionProgramInput } from './sourceOptionProgram'
import { KritaRandomSource } from './nativeRandom'
const primary='asset:'+'a'.repeat(64),mask='asset:'+'b'.repeat(64)
const ctx=(extra:Partial<SourceStrokeMaterialContext>={}):SourceStrokeMaterialContext=>({assets:[{id:primary,size:8,x:1,y:2,width:3,height:5},{id:mask,size:8,x:0,y:0,width:3,height:5}],primaryAsset:primary,maskAsset:mask,budget:{workUnits:1000000,outputBytes:1000000,drawPixels:1000000},...extra})
const packet=(t:number,x=13,y=17,pressure=.5):SourceAuthorPacket=>({x,y,t,pressure,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false})
function role(id:'primary'|'mask'='primary'):SourceAuthorRoleProgram {
 const option=(id:string,strength:number,checked=true):SourceOptionProgramInput=>({id,strength,checked,useCurve:false,curveMode:0,min:0,max:1,sensors:[{id:'pressure',curve:{points:[{x:0,y:0},{x:1,y:1}]}}]})
 return{id,brush:{width:3,height:5,scale:1,angle:0},materialPolicy:'png-fixed1-rng-free',options:{Size:option('Size',1),Rotation:option('Rotation',0,false),Ratio:option('Ratio',1),Scatter:option('Scatter',0,false),Opacity:option('Opacity',.7567890123456789),Flow:option('Flow',.6123456789012345),Mirror:option('Mirror',0,false),Spacing:option('Spacing',1),Rate:option('Rate',1)},
  material:{brushIdentity:id==='primary'?primary:mask,color:'black',softness:1,lightness:1,precisionLevel:1,autoPrecision:false,imprecisePosition:true,disableSubpixel:false,supportsCaching:true,solidColor:true,textureEnabled:false,sharpnessChecked:false},lodScale:1,scatterX:false,scatterY:false,mirrorX:false,mirrorY:false,indirectPainting:false,
  spacing:{value:.2,automatic:false,coefficient:1,isotropic:false},timing:{enabled:false,rate:20,ignoreDistance:false},spacingRefreshMs:50,timingRefreshMs:50}
}
const program=(roles:readonly SourceAuthorRoleProgram[]=[role()]):SourceStrokeAuthorProgram=>({id:'adapter-test@1',roles})
function drain(iterator:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>){const steps:SourceStrokeAuthorStep[]=[];while(true){const n=iterator.next();if(n.done)return{steps,state:n.value};steps.push(n.value)}}
function trace(chunks:readonly SourceStrokeMaterialChunk[]){
 const draws:unknown[]=[],fences:unknown[]=[],inputs:unknown[]=[];let count=0
 for(const c of chunks){inputs.push(...c.inputs);for(const d of c.frame.draws)draws.push({...d,definition:undefined,recipe:c.frame.definitions[d.definition]});for(const f of c.frame.fences)fences.push({...f,at:f.at+count});count+=c.frame.draws.length}
 return{draws,fences,inputs}
}
function run(p:SourceStrokeAuthorProgram,packets:readonly SourceAuthorPacket[],context=ctx(),flushEveryYield=false){
 const author=new SourceStrokeAuthor(p);let state=author.createState(4321,7654,.3)
 const adapter=new SourceStrokeMaterialAdapter(p,context,state),chunks:SourceStrokeMaterialChunk[]=[],steps:SourceStrokeAuthorStep[]=[]
 for(const packet of packets){chunks.push(...adapter.beginInput(state));const out=drain(author.plan(state,packet));for(const s of out.steps){steps.push(s);chunks.push(...adapter.accept(s));if(flushEveryYield){const c=adapter.flush();if(c)chunks.push(c)}}state=out.state}
 chunks.push(...adapter.finish(state));return{chunks,steps,state}
}
describe('off-path actual source author to closed canonical material',()=>{
 it('preserves exact saved source, integer placement and F64 opacity/flow in decoded local chunks',()=>{
  const out=run(program(),[packet(0),packet(20,15,20)])
  const material=out.steps.filter(s=>s.kind==='material'),draws=trace(out.chunks).draws as {recipe:unknown;x:number;y:number;opacity:number;flow:number}[]
  expect(draws).toHaveLength(material.length);expect(draws.length).toBeGreaterThan(1)
  expect(trace(out.chunks).inputs).toEqual(material.map(s=>({packet:Object.fromEntries(Object.keys(packet(0)).map(k=>[k,s.packet![k as keyof SourceAuthorPacket]])),sourceAngle:s.sourceAngle,sourceTime:s.sourceTime,logicalSequence:s.logicalSequence,role:s.role})))
  for(const c of out.chunks){expect(c.inputs).toHaveLength(c.frame.draws.length);expect(Object.isFrozen(c.frame)).toBe(true);expect(Object.isFrozen(c.inputs)).toBe(true);for(const i of c.inputs)expect(Object.isFrozen(i.packet)).toBe(true)}
  material.forEach((s,i)=>{const r=s.result!,m=r.material!,saved=m.resolvedSource,d=draws[i]!
   expect(d.x).toBe(m.resolvedRect.x);expect(d.y).toBe(m.resolvedRect.y);expect(Object.is(d.opacity,r.opacity)).toBe(true);expect(Object.is(d.flow,r.flow)).toBe(true)
   expect(d.recipe).toEqual({asset:saved.brushIdentity,brushScale:saved.brush.scale,brushAngle:saved.brush.angle,scale:saved.shape.scale,ratio:saved.shape.ratio,rotation:saved.shape.rotation,subX:saved.key.subPixelX,subY:saved.key.subPixelY,width:saved.width,height:saved.height,mirrorH:saved.mirror.horizontal,mirrorV:saved.mirror.vertical})
  })
  for(const c of out.chunks){expect(unpackCanonicalMaterial(JSON.parse(JSON.stringify(c.packed)),{...ctx(),preflightDefinition:canonicalMaterialGeometryCost})).toEqual(c.frame);expect(()=>assertPrimaryCanonicalMaterial(c.frame,{...ctx(),preflightDefinition:canonicalMaterialGeometryCost})).not.toThrow()}
 })
 it('does not turn actual50ms nonpainting query yields into draw records or evaluate RNG again',()=>{
  const p=program(),author=new SourceStrokeAuthor(p),initial=author.createState(0,0,0),start=drain(author.plan(initial,packet(0))),refresh=drain(author.plan(start.state,packet(60)))
  expect(refresh.steps.filter(s=>s.kind==='query').map(s=>s.query)).toEqual(['spacing','timing'])
  const random=vi.spyOn(KritaRandomSource.prototype,'generate').mockImplementation(()=>{throw Error('adapter reran RNG')})
  try{const adapter=new SourceStrokeMaterialAdapter(p,ctx(),initial),chunks:SourceStrokeMaterialChunk[]=[];chunks.push(...adapter.beginInput(initial));for(const s of start.steps)chunks.push(...adapter.accept(s));chunks.push(...adapter.beginInput(start.state));for(const s of refresh.steps)chunks.push(...adapter.accept(s));chunks.push(...adapter.finish(refresh.state));expect(trace(chunks).draws).toHaveLength(start.steps.filter(s=>s.kind==='material').length);expect(random).not.toHaveBeenCalled()}finally{random.mockRestore()}
 })
 it('repeats saved MISS geometry on a later cache HIT without narrowing to current requested shape',()=>{
  const base=role(),r={...base,options:{...base.options,Size:{...base.options.Size,useCurve:true}},timing:{enabled:true,rate:20,ignoreDistance:true}}
  const out=run(program([r]),[packet(0,13,17,.5),packet(50,13,17,.5000000000000001)],ctx(),true)
  const hit=out.steps.find(s=>s.kind==='material'&&s.result!.material!.type==='Copy')
  expect(hit).toBeDefined();expect(hit!.result!.material!.shape.scale).not.toBe(hit!.result!.material!.resolvedSource.shape.scale)
  const recipes=out.chunks.flatMap(c=>c.frame.definitions)
  expect(recipes.every(d=>d.scale===.5)).toBe(true)
 })
 it('keeps all fences across cuts after every yield, including primaryEnd and empty final tail',()=>{
  const packets=[packet(0),packet(20,15,20),packet(80,15,20)],p=program(),whole=run(p,packets),cut=run(p,packets,ctx(),true)
  expect(trace(cut.chunks)).toEqual(trace(whole.chunks))
  const tail=cut.chunks.at(-1)!.frame
  expect(tail.draws).toEqual([]);expect(tail.fences).toEqual([{kind:'gestureEnd',at:0}])
  expect(cut.chunks.some(c=>c.frame.entry.phase==='mask'&&!c.frame.masked)).toBe(true)
 })
 it('preserves complete primary then mask passes structurally without admitting mask execution',()=>{
  const out=run(program([role(),role('mask')]),[packet(0),packet(20,15,20)],ctx(),true)
  const normal=trace(out.chunks),draws=normal.draws as {role:string}[]
  expect(draws.some(d=>d.role==='mask')).toBe(true)
  expect(normal.fences.filter(f=>(f as {kind:string}).kind==='primaryEnd')).toHaveLength(2)
  for(const c of out.chunks)expect(()=>assertPrimaryCanonicalMaterial(c.frame,{...ctx(),preflightDefinition:canonicalMaterialGeometryCost})).toThrow()
 })
 it('retains primaryEnd/segmentEnd when the real mask pass paints zero dabs',()=>{
  const base=role('mask'),child={...base,options:{...base.options,Size:{...base.options.Size,useCurve:true}}}
  const out=run(program([role(),child]),[packet(0,13,17,0)],ctx(),true),normal=trace(out.chunks)
  expect((normal.draws as {role:string}[]).map(d=>d.role)).toEqual(['primary'])
  expect(normal.fences).toEqual([{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:1,group:0},{kind:'segmentEnd',at:1,group:0},{kind:'gestureEnd',at:1}])
 })
 it('resumes every actual author-yield checkpoint without rerunning accepted requests or losing fences',()=>{
  const p=program([role(),role('mask')]),author=new SourceStrokeAuthor(p),initial=author.createState(4321,7654,.3),start=drain(author.plan(initial,packet(0))),segment=drain(author.plan(start.state,packet(20,15,20)))
  const uninterrupted=run(p,[packet(0),packet(20,15,20)])
  for(let cut=0;cut<segment.steps.length-1;cut++){
   const adapter=new SourceStrokeMaterialAdapter(p,ctx(),initial),chunks:SourceStrokeMaterialChunk[]=[]
   chunks.push(...adapter.beginInput(initial));for(const s of start.steps)chunks.push(...adapter.accept(s));chunks.push(...adapter.beginInput(start.state))
   for(const s of segment.steps.slice(0,cut+1))chunks.push(...adapter.accept(s))
   const source=structuredClone(segment.steps[cut]!.state),checkpoint=adapter.checkpoint()
   const resumed=new SourceStrokeMaterialAdapter(p,ctx(),source,structuredClone(checkpoint)),rest=drain(author.resume(source))
   for(const s of rest.steps)chunks.push(...resumed.accept(s));chunks.push(...resumed.finish(rest.state))
   expect(trace(chunks),`cut${cut}`).toEqual(trace(uninterrupted.chunks));expect(rest.state).toEqual(segment.state)
  }
 })
 it('makes bounded cuts from actual results without replaying author steps or dropping zero-opacity stamps',()=>{
  const base=role(),r={...base,options:{...base.options,Opacity:{...base.options.Opacity,strength:0}}}
  const p=program([r]),packets=[packet(0),packet(20,25,30)],whole=run(p,packets),small=run(p,packets,ctx({budget:{workUnits:1000000,outputBytes:1000000,drawPixels:30}}))
  expect(small.chunks.length).toBeGreaterThan(whole.chunks.length);expect(trace(small.chunks)).toEqual(trace(whole.chunks));expect(small.state).toEqual(whole.state)
  expect((trace(small.chunks).draws as {opacity:number}[]).every(d=>Object.is(d.opacity,0))).toBe(true)
 })
 it('rejects a cold impossible budget without flushing or advancing pending state',()=>{
  const p=program(),author=new SourceStrokeAuthor(p),initial=author.createState(0,0,0),steps=drain(author.plan(initial,packet(0))).steps,adapter=new SourceStrokeMaterialAdapter(p,ctx({budget:{workUnits:0,outputBytes:0,drawPixels:0}}),initial)
  adapter.beginInput(initial);const before=adapter.checkpoint()
  expect(()=>adapter.accept(steps.find(s=>s.kind==='material')!)).toThrow(/budget/);expect(adapter.checkpoint()).toEqual(before)
 })
 it('ties private resume state to author counters, program, phase and immutable asset binding',()=>{
  const p=program(),author=new SourceStrokeAuthor(p),initial=author.createState(0,0,0),adapter=new SourceStrokeMaterialAdapter(p,ctx(),initial)
  adapter.beginInput(initial);const step=author.plan(initial,packet(0)).next().value as SourceStrokeAuthorStep;adapter.accept(step)
  const checkpoint=adapter.checkpoint(),source=step.state
  expect(()=>new SourceStrokeMaterialAdapter(p,ctx(),source,{...checkpoint,eventOrdinal:checkpoint.eventOrdinal+1})).toThrow()
  expect(()=>new SourceStrokeMaterialAdapter(p,ctx(),source,{...checkpoint,current:{phase:'between'}})).toThrow()
  expect(()=>new SourceStrokeMaterialAdapter(p,ctx(),source,{...checkpoint,inputs:[]})).toThrow()
  expect(()=>new SourceStrokeMaterialAdapter(p,ctx(),source,{...checkpoint,inputs:checkpoint.inputs.map(i=>({...i,sourceTime:NaN}))})).toThrow()
  expect(()=>new SourceStrokeMaterialAdapter(p,ctx({primaryAsset:mask}),initial)).toThrow()
  expect(()=>adapter.accept(step)).toThrow();expect(()=>adapter.finish(source)).toThrow()
  const exposed=adapter.checkpoint();expect(()=>{(exposed.draws as unknown as {x:number}[])[0]!.x=999}).toThrow()
  expect(adapter.checkpoint().draws[0]!.x).not.toBe(999)
 })
 it('preserves full fan0t requests and author-precision directions in aligned local inputs',()=>{
  const r={...role(),fanStepDegrees:30},out=run(program([r]),[packet(0),packet(100,20,17),packet(200,20,24)],ctx(),true)
  const actual=out.steps.filter(s=>s.kind==='material'),inputs=out.chunks.flatMap(c=>c.inputs)
  expect(inputs).toHaveLength(actual.length)
  expect(inputs.some(i=>i.sourceAngle!==Math.fround(i.sourceAngle))).toBe(true)
  expect(inputs.some((i,n)=>n>0&&Object.is(i.sourceTime,inputs[n-1]!.sourceTime))).toBe(true)
  for(const [n,i] of inputs.entries()){expect(Object.is(i.sourceAngle,actual[n]!.sourceAngle)).toBe(true);expect(Object.is(i.sourceTime,actual[n]!.sourceTime)).toBe(true);expect(i.logicalSequence).toBe(actual[n]!.logicalSequence)}
 })
 it('preserves signed-zero sourceAngle and private input bits through checkpoint/resume',()=>{
  const p=program(),author=new SourceStrokeAuthor(p),initial=author.createState(0,0,-0),adapter=new SourceStrokeMaterialAdapter(p,ctx(),initial)
  adapter.beginInput(initial);const next=author.plan(initial,packet(0)).next().value as SourceStrokeAuthorStep;adapter.accept(next)
  expect(Object.is(adapter.checkpoint().inputs[0]!.sourceAngle,-0)).toBe(true)
  const resumed=new SourceStrokeMaterialAdapter(p,ctx(),next.state,structuredClone(adapter.checkpoint())),rest=drain(author.resume(next.state)),chunks:SourceStrokeMaterialChunk[]=[]
  for(const s of rest.steps)chunks.push(...resumed.accept(s));chunks.push(...resumed.finish(rest.state))
  expect(Object.is(chunks.flatMap(c=>c.inputs)[0]!.sourceAngle,-0)).toBe(true)
 })

})

// Exercise the live-frame boundary with the real author/adapter above. Explicit
// cuts happen while the source cursor is still inside the primary pass.
describe('source author chunks to pinned shared stroke envelopes', () => {
 const context=()=>({brush:'brush:adapter-test@1',strokeId:'gesture',pigmentRgb8:[17,29,41] as [number,number,number],
  composition:{mode:'wash' as const,alphaDarken:'hard' as const,outerResourceOpacity:.8,outerBlend:'over' as const},material:ctx()})
 it('emits before pen-up and preserves exact whole versus every-yield traces through JSON',()=>{
  const p=program(),packets=[packet(0),packet(20,15,20),packet(80,15,20)]
  const whole=run(p,packets),cut=run(p,packets,ctx(),true),pinned=context()
  const random=vi.spyOn(KritaRandomSource.prototype,'generate').mockImplementation(()=>{throw Error('encoder reran RNG')})
  try{
   const encode=(chunks:readonly SourceStrokeMaterialChunk[])=>{
    const encoder=new SourceCanonicalFrameEncoder(pinned)
    const encoded=chunks.map((chunk,i)=>{
     const accepted=encoder.encode(chunk.packed)
     expect(accepted.envelope.frameOrdinal).toBe(i)
     expect(accepted.envelope.rasterProfile).toBe(CANONICAL_STROKE_RASTER_PROFILE)
     const remote=decodeCanonicalStrokeFrame(JSON.parse(JSON.stringify(accepted.envelope)),{...pinned,frameOrdinal:i,material:{...pinned.material,preflightDefinition:canonicalMaterialGeometryCost}})
     expect(remote.frame).toEqual(accepted.frame)
     expect(Object.isFrozen(accepted.frame)).toBe(true)
     return {...chunk,frame:accepted.frame}
    })
    expect(encoder.ended).toBe(true)
    expect(encoder.nextFrameOrdinal).toBe(chunks.length)
    expect(()=>encoder.encode(chunks.at(-1)!.packed)).toThrow('ended')
    return encoded
   }
   expect(trace(encode(cut.chunks))).toEqual(trace(encode(whole.chunks)))
   expect(cut.chunks.some(c=>c.frame.entry.phase==='primary')).toBe(true)
   expect(cut.chunks.at(-1)!.frame.draws).toEqual([])
   expect(random).not.toHaveBeenCalled()
  }finally{random.mockRestore()}
 })
 it('keeps pinned colour/composition/CAS independent of later UI mutation and rejects bad bytes without advancing',()=>{
  const pinned=context(),encoder=new SourceCanonicalFrameEncoder(pinned),chunk=run(program(),[packet(0)]).chunks[0]
  pinned.pigmentRgb8[0]=255;pinned.composition.outerResourceOpacity=.1;Reflect.set(pinned.material.assets[0],'id','asset:'+'c'.repeat(64))
  expect(()=>encoder.encode(chunk.packed.slice(0,-1))).toThrow()
  expect(encoder.nextFrameOrdinal).toBe(0)
  const accepted=encoder.encode(chunk.packed)
  expect(accepted.envelope.pigmentRgb8).toEqual([17,29,41])
  expect(accepted.envelope.composition.outerResourceOpacity).toBe(.8)
  expect(accepted.envelope.frameOrdinal).toBe(0)
 })
 it('rejects reordered/repeated frames, unsupported mask capability and cold-budget violations atomically',()=>{
  const chunks=run(program(),[packet(0),packet(20,15,20)],ctx(),true).chunks,encoder=new SourceCanonicalFrameEncoder(context())
  expect(()=>encoder.encode(chunks[1].packed)).toThrow()
  expect(encoder.nextFrameOrdinal).toBe(0)
  encoder.encode(chunks[0].packed)
  expect(()=>encoder.encode(chunks[0].packed)).toThrow()
  expect(encoder.nextFrameOrdinal).toBe(1)
  const dual=run(program([role(),role('mask')]),[packet(0)]).chunks[0],other=new SourceCanonicalFrameEncoder(context())
  expect(()=>other.encode(dual.packed)).toThrow()
  expect(other.nextFrameOrdinal).toBe(0)
  const base=context(),low={...base,material:{...base.material,budget:{workUnits:0,outputBytes:0,drawPixels:0}}}
  const limited=new SourceCanonicalFrameEncoder(low)
  expect(()=>limited.encode(run(program(),[packet(0)]).chunks[0].packed)).toThrow()
  expect(limited.nextFrameOrdinal).toBe(0)
 })
})

it('cuts sparse logical requests by authoritative target union without dropping fences or draws',()=>{
 const r=role(),p=program([{...r,timing:{enabled:true,rate:20,ignoreDistance:true}}])
 const packets=Array.from({length:12},(_,i)=>packet(i*50,13+i*128,17))
 const unbounded=run(p,packets)
 const targetGeometry={pageBounds:null,tileWidth:64,tileHeight:64,maxTargets:2}
 const bounded=run(p,packets,ctx({targetGeometry}))
 expect(trace(bounded.chunks)).toEqual(trace(unbounded.chunks))
 expect(bounded.chunks.length).toBeGreaterThan(unbounded.chunks.length)
 for(const c of bounded.chunks){const keys=new Set(c.frame.draws.map(d=>Math.floor(d.x/64)+':'+Math.floor(d.y/64)));expect(keys.size).toBeLessThanOrEqual(2)}
})

it('pins room grid and rejects forged pending target checkpoint before replacing pending records',()=>{
 const p=program(),author=new SourceStrokeAuthor(p),initial=author.createState(4321,7654,.3)
 const geometry={pageBounds:null,tileWidth:64,tileHeight:64,maxTargets:64},context=ctx({targetGeometry:geometry})
 const adapter=new SourceStrokeMaterialAdapter(p,context,initial);adapter.beginInput(initial)
 const out=drain(author.plan(initial,packet(0)));for(const step of out.steps)adapter.accept(step)
 const checkpoint=adapter.checkpoint();expect(checkpoint.version).toBe(2)
 geometry.tileWidth=1
 const correct=ctx({targetGeometry:{pageBounds:null,tileWidth:64,tileHeight:64,maxTargets:64}})
 expect(()=>new SourceStrokeMaterialAdapter(p,correct,out.state,checkpoint)).not.toThrow()
 expect(()=>new SourceStrokeMaterialAdapter(p,context,out.state,checkpoint)).toThrow()
 expect(()=>new SourceStrokeMaterialAdapter(p,correct,out.state,{...checkpoint,pendingTargets:['forged']})).toThrow()
 expect(adapter.checkpoint()).toEqual(checkpoint)
})

it('rejects one oversized request before flushing previously accepted fences or advancing counters',()=>{
 const p=program(),author=new SourceStrokeAuthor(p),state=author.createState(4321,7654,.3)
 const adapter=new SourceStrokeMaterialAdapter(p,ctx({targetGeometry:{pageBounds:null,tileWidth:1,tileHeight:1,maxTargets:1}}),state)
 adapter.beginInput(state);const before=adapter.checkpoint(),step=drain(author.plan(state,packet(0))).steps.find(s=>s.kind==='material')!
 expect(()=>adapter.accept(step)).toThrow('tile fanout');expect(adapter.checkpoint()).toEqual(before)
})

it('rechecks encoder room union before advancing ordinal and preserves off-page logical records',()=>{
 const r=role(),p=program([{...r,timing:{enabled:true,rate:20,ignoreDistance:true}}]),packets=[packet(0),packet(50,2048,17)]
 const chunks=run(p,packets).chunks
 const encoder=new SourceCanonicalFrameEncoder({brush:'test@1',strokeId:'geometry-test',pigmentRgb8:[0,0,0],
   composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},
   material:ctx({targetGeometry:{pageBounds:null,tileWidth:64,tileHeight:64,maxTargets:2}})})
 expect(()=>encoder.encode(chunks[0].packed)).toThrow('target union');expect(encoder.nextFrameOrdinal).toBe(0)
 const outside=run(p,packets,ctx({targetGeometry:{pageBounds:{minX:10000,minY:10000,maxX:10001,maxY:10001},tileWidth:64,tileHeight:64,maxTargets:1}}))
 expect(trace(outside.chunks)).toEqual(trace(chunks))
})
