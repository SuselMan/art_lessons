/// <reference types="node" />
import{describe,it,expect}from'vitest'
import{createHash}from'node:crypto'
import def from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/textureReptile.pressure.compiled3.metadata.json' with{type:'json'}
import soft from '../../../../../../packages/shared/src/fixtures/sourceSoftAutoData/texturePressure.native-default.compiled4.metadata.json' with{type:'json'}
import gauss from '../../../../../../packages/shared/src/fixtures/sourceGaussianAutoData/pencil3.texture-pressure.compiled3.metadata.json' with{type:'json'}
import{packCanonicalTexturedAutoMaterial,unpackCanonicalTexturedAutoMaterial,canonicalTexturedAutoProgramBinding,captureTexturedAutoProgramBinding,assertTexturedAutoProgramContext,canonicalBrushDescriptorJSON,resolveCanonicalTexturePhase,canonicalTexturedAutoMaterialContext,canonicalSourceComposition,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B,type BrushDescriptor,type CanonicalMaterialFrameV7}from'@grafetto/shared'
import{sourceTexturedAutoAuthorProgram}from'./sourceStrokeAuthorDescriptor'
import{SourceStrokeAuthor,sourceTexturedAutoProgramCpuBytes,type SourceAuthorPacket,type SourceStrokeAuthorStep}from'./sourceStrokeAuthor'
import{createTexturedAutoMaterialAdapter,SourceStrokeMaterialAdapter,copySourceMaterialContext,type SourceStrokeMaterialContextV7,type SourceStrokeMaterialChunk}from'./sourceStrokeMaterialAdapter'
import{createTexturedAutoFrameEncoder,SourceCanonicalFrameEncoder}from'./sourceCanonicalFrameEncoder'
const fixtures=[def,soft,gauss],hash=(d:BrushDescriptor)=>createHash('sha256').update(canonicalBrushDescriptorJSON(d)).digest('hex')
function setup(f:typeof def|typeof soft|typeof gauss,browser=false,phaseWord=0){const d=f.descriptor as unknown as BrushDescriptor,profile=browser?B:G,coverage=browser?'browser-number-coverage-v1' as const:'neon64-f32-fma-v1' as const,binding=canonicalTexturedAutoProgramBinding(d,hash(d),coverage,f.patternAsset,profile),r=sourceTexturedAutoAuthorProgram(d,{binding,rasterProfile:profile,coverageProfile:coverage,materialCpuBudgetBytes:sourceTexturedAutoProgramCpuBytes(binding.strengthProgram),inputProfile:'krita-freehand-no-smoothing-v1',colorIdentity:'canonical-pigment',lodScale:1});if(!r.supported)throw Error(r.reasons.join(','));const author=new SourceStrokeAuthor(r.program),phase=resolveCanonicalTexturePhase(binding.phasePolicy,()=>phaseWord),context:SourceStrokeMaterialContextV7={...canonicalTexturedAutoMaterialContext({version:7,assets:[binding.patternAsset],primarySource:binding.source,primaryTexture:{...binding.textureGeometry,phase,strength:'recorded-grain-v1'},budget:{workUnits:64000000,outputBytes:16000000,drawPixels:16000000}}),targetGeometry:{pageBounds:{minX:0,minY:0,maxX:512,maxY:512},tileWidth:512,tileHeight:512,maxTargets:1}},stroke={materialVersion:7 as const,material:context,rasterProfile:profile,brush:'brush:'+d.id+'@'+d.version,strokeId:'stroke7',pigmentRgb8:[14,71,199]as const,composition:{...canonicalSourceComposition(d,profile)!,alphaDarken:'hard' as const,outerResourceOpacity:1}};return{d,profile,binding,author,program:r.program,context,stroke}}
const packet=(x:number,t:number,pressure:number):SourceAuthorPacket=>({x,y:16,t,pressure,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false})
function run(f:typeof def|typeof soft|typeof gauss,browser=false,cut=false,copy=false){const s=setup(f,browser);let state=s.author.createState(11,22,0);const adapter=createTexturedAutoMaterialAdapter(s.program,s.context,state),chunks:SourceStrokeMaterialChunk<CanonicalMaterialFrameV7>[]=[],steps:SourceStrokeAuthorStep[]=[];const consume=(iterator:ReturnType<typeof s.author.plan>)=>{let n=iterator.next();while(!n.done){state=n.value.state;let step=n.value;if(copy&&step.kind==='material')step={...step,result:{...step.result!,material:{...step.result!.material!,type:'Copy'}}};steps.push(step);chunks.push(...adapter.accept(step));if(cut){const c=adapter.flush();if(c)chunks.push(c)}n=iterator.next()}state=n.value};for(const p of[packet(0,0,.2),packet(120,30,.7),packet(240,60,.9)]){chunks.push(...adapter.beginInput(state));consume(s.author.plan(state,p))}chunks.push(...adapter.beginInput(state));consume(s.author.finish(state));chunks.push(...adapter.finish(state));const encoder=createTexturedAutoFrameEncoder(s.stroke),encoded=chunks.map(c=>encoder.encode(c.packed));return{...s,state,chunks,steps,encoded,encoder,adapter}}
const semantics=(s:ReturnType<typeof run>)=>s.encoded.flatMap(c=>c.frame.draws.map(d=>({...d,definition:undefined,recipe:c.frame.definitions[d.definition]})))
describe('explicit standalone7 phase-bound material adapter and encoder',()=>{
 it.each(fixtures)('uses genuine reusable program and every actual interpolated materialStrength browser/native',f=>{for(const browser of[false,true]){const s=run(f,browser),materials=s.steps.filter(x=>x.kind==='material'),draws=s.encoded.flatMap(c=>c.frame.draws),inputs=s.chunks.flatMap(c=>c.inputs);expect(s.encoder.ended).toBe(true);expect(materials.length).toBeGreaterThan(0);expect(draws).toHaveLength(materials.length);materials.forEach((step,i)=>{expect(draws[i].grainDepth).toBe(step.materialStrength);expect(inputs[i].materialStrength).toBe(step.materialStrength)});expect(new Set(draws.map(d=>d.grainDepth)).size).toBeGreaterThan(1);expect(s.encoded.every(x=>x.frame.profile==='canonical-textured-auto-material-v7')).toBe(true)}})
 it('preserves state/RNG/semantic draws across cuts and structurally labeled Copy input',()=>{const a=run(gauss),b=run(gauss,false,true),c=run(gauss,false,false,true);expect(semantics(b)).toEqual(semantics(a));expect(b.state).toEqual(a.state);expect(semantics(c)).toEqual(semantics(a));expect(c.steps.filter(v=>v.kind==='material').every(v=>v.result!.material!.type==='Copy')).toBe(true);expect(a.steps.filter(v=>v.kind==='material').every(v=>['Dab','Postprocess'].includes(v.result!.material!.type))).toBe(true)})
 it('retains same reusable program/pressure coefficients across phase candidates and public capture still copies',()=>{const s=setup(gauss),program=s.program,binding=program.roles[0].textureProgram;if(binding?.strength!=='recorded-grain-v1')throw Error('binding');const coefficients=binding.binding.strengthProgram.curve.coefficients,captured=captureTexturedAutoProgramBinding(binding.binding);expect(captured).not.toBe(binding.binding);expect(captured.strengthProgram.curve.coefficients).not.toBe(coefficients);const a=createTexturedAutoMaterialAdapter(program,s.context,s.author.createState(11,22,0)),phase=resolveCanonicalTexturePhase(s.binding.phasePolicy,()=>1),other={...s.context,primaryTexture:{...s.context.primaryTexture,phase}},b=createTexturedAutoMaterialAdapter(program,other,s.author.createState(11,22,0));expect(a.checkpoint().materialIdentity).not.toBe(b.checkpoint().materialIdentity);expect(program.roles[0].textureProgram).toBe(binding);expect(binding.binding.strengthProgram.curve.coefficients).toBe(coefficients);expect(assertTexturedAutoProgramContext(binding.binding,(()=>{const{targetGeometry:_target,...material}=s.context;return material})())).toBeDefined()})
 it('roundtrips private checkpoint and rejects foreign phase/targets without damaging old state',()=>{const s=setup(gauss),state=s.author.createState(11,22,0),a=createTexturedAutoMaterialAdapter(s.program,s.context,state);const checkpoint=a.checkpoint(),copy=createTexturedAutoMaterialAdapter(s.program,s.context,state,checkpoint);expect(copy.checkpoint()).toEqual(checkpoint);const bad={...s.context,primaryTexture:{...s.context.primaryTexture,phase:{...s.context.primaryTexture.phase,x:1}}};expect(()=>createTexturedAutoMaterialAdapter(s.program,bad,state,checkpoint)).toThrow();expect(()=>createTexturedAutoMaterialAdapter(s.program,{...s.context,targetGeometry:{...s.context.targetGeometry!,tileWidth:256}},state,checkpoint)).toThrow();expect(a.checkpoint()).toEqual(checkpoint)})
 it.each([gauss,soft])('restores genuine active pending DRAW/fences/targets and continues exactly',f=>{
 const execute=(restore:boolean)=>{const s=setup(f);let state=s.author.createState(11,22,0),adapter=createTexturedAutoMaterialAdapter(s.program,s.context,state),didRestore=false;const chunks:SourceStrokeMaterialChunk<CanonicalMaterialFrameV7>[]=[];
 const consume=(iterator:ReturnType<typeof s.author.plan>)=>{let n=iterator.next();while(!n.done){state=n.value.state;chunks.push(...adapter.accept(n.value));const c=adapter.checkpoint();if(!didRestore&&c.active&&c.draws.length>0&&c.fences.length>0&&(c.pendingTargets?.length??0)>0){didRestore=true;expect(c.inputs).toHaveLength(c.draws.length);if(restore){const before=adapter.checkpoint(),badPhase={...s.context,primaryTexture:{...s.context.primaryTexture,phase:{...s.context.primaryTexture.phase,x:(s.context.primaryTexture.phase.x+1)%s.context.primaryTexture.width}}};expect(()=>createTexturedAutoMaterialAdapter(s.program,badPhase,state,c)).toThrow();expect(()=>createTexturedAutoMaterialAdapter(s.program,{...s.context,targetGeometry:{...s.context.targetGeometry!,tileWidth:256}},state,c)).toThrow();expect(adapter.checkpoint()).toEqual(before);const next=createTexturedAutoMaterialAdapter(s.program,s.context,state,c);expect(next.checkpoint()).toEqual(c);adapter=next}}n=iterator.next()}state=n.value};
 for(const p of[packet(0,0,.2),packet(120,30,.7),packet(240,60,.9)]){chunks.push(...adapter.beginInput(state));consume(s.author.plan(state,p))}chunks.push(...adapter.beginInput(state));consume(s.author.finish(state));chunks.push(...adapter.finish(state));expect(didRestore).toBe(true);const encoder=createTexturedAutoFrameEncoder(s.stroke),encoded=chunks.map(c=>encoder.encode(c.packed));expect(encoder.ended).toBe(true);return{packed:chunks.map(c=>c.packed),semantic:encoded.map(c=>c.frame),state,checkpoint:adapter.checkpoint()}};
 const uninterrupted=execute(false),restored=execute(true);expect(restored.packed).toEqual(uninterrupted.packed);expect(restored.semantic).toEqual(uninterrupted.semantic);expect(restored.state).toEqual(uninterrupted.state);expect(restored.checkpoint).toEqual(uninterrupted.checkpoint)
 })
 it.each(['capture','assert'] as const)('rejects sparse coefficient tuple hidden by numeric non-index key through %s',api=>{const s=setup(gauss),binding=structuredClone(s.binding),row=binding.strengthProgram.curve.coefficients[0];Reflect.deleteProperty(row,'0');Object.defineProperty(row,'4294967295',{value:0,enumerable:true});expect(row.length).toBe(4);expect(Reflect.ownKeys(row)).toHaveLength(5);const {targetGeometry:_target,...material}=s.context;if(api==='capture')expect(()=>captureTexturedAutoProgramBinding(binding)).toThrow();else expect(()=>assertTexturedAutoProgramContext(binding,material)).toThrow()})
 it('old constructors and copy helpers remain7 closed at runtime and in types',()=>{const s=setup(def),state=s.author.createState(1,2,0);expect(()=>Reflect.construct(SourceStrokeMaterialAdapter,[s.program,s.context,state])).toThrow();expect(()=>Reflect.apply(copySourceMaterialContext,null,[s.context])).toThrow();expect(()=>Reflect.construct(SourceCanonicalFrameEncoder,[s.stroke])).toThrow();function types(){
 // @ts-expect-error standalone7 excluded old adapter generic
 new SourceStrokeMaterialAdapter(s.program,s.context,state)
 // @ts-expect-error standalone7 excluded old encoder generic
 new SourceCanonicalFrameEncoder(s.stroke)
 // @ts-expect-error legacy copy helper excludes7
 copySourceMaterialContext(s.context)
 }expect(types).toBeTypeOf('function')})
 it('rejects own-data target/context/encoder callbacks before consuming state and fails encode atomically',()=>{const s=setup(def),state=s.author.createState(1,2,0),bad=structuredClone(s.context);let calls=0;Object.defineProperty(bad.targetGeometry!,'tileWidth',{get(){calls++;return 512}});expect(()=>createTexturedAutoMaterialAdapter(s.program,bad,state)).toThrow();const outer={...s.stroke};Object.defineProperty(outer,'composition',{get(){calls++;return s.stroke.composition}});expect(()=>createTexturedAutoFrameEncoder(outer)).toThrow();expect(calls).toBe(0);const encoder=createTexturedAutoFrameEncoder(s.stroke);expect(()=>encoder.encode('6|AAAA')).toThrow();expect(encoder.nextFrameOrdinal).toBe(0);expect(encoder.ended).toBe(false)})
})


/** Original Pencil3 DATA flows through the same named7 author and codec.
 * Expected scale endpoints and quarter turns come from retained original
 * curve endpoints / pinned native scalar laws, not sensor-helper self-calls. */
function pencil3CpuStream(packets:readonly SourceAuthorPacket[],browser=false,restore=false){
 const s=setup(gauss,browser)
 let state=s.author.createState(11,22,0)
 let adapter=createTexturedAutoMaterialAdapter(s.program,s.context,state)
 const chunks:SourceStrokeMaterialChunk<CanonicalMaterialFrameV7>[]=[]
 let restored=false
 const consume=(initial:ReturnType<typeof s.author.plan>)=>{
  let iterator=initial,next=iterator.next()
  while(!next.done){
   state=next.value.state
   chunks.push(...adapter.accept(next.value))
   const checkpoint=adapter.checkpoint()
   if(restore&&!restored&&next.value.kind==='material'&&state.cursor&&checkpoint.active&&checkpoint.draws.length>0){
    restored=true
    const savedState=structuredClone(state),savedAdapter=structuredClone(checkpoint)
    iterator.return(state)
    state=savedState
    adapter=createTexturedAutoMaterialAdapter(s.program,s.context,state,savedAdapter)
    expect(adapter.checkpoint()).toEqual(checkpoint)
    iterator=s.author.resume(state)
   }
   next=iterator.next()
  }
  state=next.value
 }
 for(const input of packets){chunks.push(...adapter.beginInput(state));consume(s.author.plan(state,input))}
 chunks.push(...adapter.beginInput(state));consume(s.author.finish(state));chunks.push(...adapter.finish(state))
 const encoder=createTexturedAutoFrameEncoder(s.stroke),encoded=chunks.map(chunk=>encoder.encode(chunk.packed))
 expect(encoder.ended).toBe(true)
 const recipes=encoded.flatMap(frame=>frame.frame.draws.map(draw=>frame.frame.definitions[draw.definition]))
 expect(recipes.length).toBeGreaterThan(0)
 for(const recipe of recipes)expect(recipe.kind).toBe('gaussianAuto')
 return{...s,state,chunks,encoded,recipes,restored,checkpoint:adapter.checkpoint()}
}
const pencil3ConstantPackets=(pressure:number,tiltX:number,tiltY:number)=>[
 {...packet(0,0,pressure),tiltX,tiltY},
 {...packet(120,40,pressure),tiltX,tiltY}
]
describe('genuine Pencil3 pressure Size and tiltDirection named7 CPU closure only',()=>{
 it.each([false,true])('keeps original nonidentity pressure Size endpoints (browser=%s)',browser=>{
  const before=canonicalBrushDescriptorJSON(setup(gauss,browser).d)
  const low=pencil3CpuStream(pencil3ConstantPackets(0,30,0),browser)
  const high=pencil3CpuStream(pencil3ConstantPackets(1,30,0),browser)
  const size=gauss.descriptor.sourceStamp.options.find(option=>option.id==='Size')!
  expect(size.sensors.map(sensor=>sensor.id)).toEqual(['pressure'])
  expect(size.sensors[0].curve.points.map(point=>[point.x,point.y])).toEqual([[0,.487437],[1,1]])
  for(const recipe of low.recipes)expect(recipe.scale).toBeCloseTo(.487437,12)
  for(const recipe of high.recipes)expect(recipe.scale).toBeCloseTo(1,12)
  expect(Math.max(...low.recipes.map(recipe=>recipe.width))).toBeLessThan(Math.max(...high.recipes.map(recipe=>recipe.width)))
  expect(canonicalBrushDescriptorJSON(low.d)).toBe(before)
  expect(canonicalBrushDescriptorJSON(high.d)).toBe(before)
 })
 it.each([false,true])('resolves cardinal and neutral tilt at identical pressure without new sensor math (browser=%s)',browser=>{
  const cases=[
   {tiltX:30,tiltY:0,rotation:1.5*Math.PI},
   {tiltX:-30,tiltY:0,rotation:.5*Math.PI},
   {tiltX:0,tiltY:30,rotation:Math.PI},
   {tiltX:0,tiltY:-30,rotation:0},
   {tiltX:0,tiltY:0,rotation:1.5*Math.PI},
   {tiltX:-0,tiltY:-0,rotation:1.5*Math.PI}
  ]
  const rotations:number[]=[]
  for(const input of cases){
   const s=pencil3CpuStream(pencil3ConstantPackets(.6,input.tiltX,input.tiltY),browser)
   for(const recipe of s.recipes)expect(recipe.rotation).toBeCloseTo(input.rotation,14)
   rotations.push(s.recipes[0].rotation)
  }
  expect(new Set(rotations.slice(0,4)).size).toBe(4)
  expect(rotations[4]).toBe(rotations[0]);expect(rotations[5]).toBe(rotations[4])
 })
 it.each([false,true])('preserves resolved DRAW/phase through named7 codec and active author/material checkpoint (browser=%s)',browser=>{
  const inputs=[{...packet(0,0,.2),tiltX:30,tiltY:0},{...packet(120,40,.8),tiltX:0,tiltY:30},{...packet(240,80,.4),tiltX:-30,tiltY:0}]
  const direct=pencil3CpuStream(inputs,browser),restored=pencil3CpuStream(inputs,browser,true)
  expect(restored.restored).toBe(true)
  expect(restored.chunks.map(chunk=>chunk.packed)).toEqual(direct.chunks.map(chunk=>chunk.packed))
  expect(restored.encoded.map(frame=>frame.frame)).toEqual(direct.encoded.map(frame=>frame.frame))
  expect(restored.state).toEqual(direct.state);expect(restored.checkpoint).toEqual(direct.checkpoint)
  const{targetGeometry:_target,...material}=direct.context
  direct.chunks.forEach((chunk,index)=>{
   const decoded=unpackCanonicalTexturedAutoMaterial(chunk.packed,material)
   expect(decoded).toEqual(direct.encoded[index].frame)
   expect(packCanonicalTexturedAutoMaterial(decoded,material)).toBe(chunk.packed)
   expect(direct.encoded[index].envelope.texturePhase).toEqual(material.primaryTexture.phase)
  })
  expect(new Set(direct.recipes.map(recipe=>recipe.scale)).size).toBeGreaterThan(1)
  expect(new Set(direct.recipes.map(recipe=>recipe.rotation)).size).toBeGreaterThan(1)
 })
})

import{Camera}from'../raster/Camera'
import{sourceSensorValue}from'./sourceSensors'
import{prepareSourceGaussianDab}from'./sourceGaussianDab'
import{sourceGaussianResolvedMaskReference}from'./sourceGaussianResolvedMaskReference'
describe('Pencil3 native canvas rotation law and independent screen-axis oracle',()=>{
 it.each([false,true])('records +camera native recipe delta, pressure0 and near-vertical tilt without changing source browser=%s',browser=>{
  const wrap=(a:number)=>(a%(2*Math.PI)+2*Math.PI)%(2*Math.PI)
  // Pinned KisRotationOption + KisCurveOption body: normalizedBase=-camera/360,
  // additive theta/pi, wrap[-1,1], then normalize((1-value)*pi).
  const native=(x:number,y:number,c:number)=>{const theta=Math.abs(x)<=1e-12&&Math.abs(y)<=1e-12?-Math.PI/2:Math.atan2(-x,y);const v=-c/180+theta/Math.PI;return wrap((1-((v+1)%2+2)%2+1)*Math.PI)}
  for(const [tiltX,tiltY]of[[30,0],[0,30],[-30,0],[0,-30],[0,0],[-0,-0],[1e-13,1e-13],[-1e-13,1e-13],[1e-9,-1e-9],[90,-90]]){
   const theta=Math.abs(tiltX)<=1e-12&&Math.abs(tiltY)<=1e-12?-(tiltX>=0?1:-1)*(tiltY>=0?1:-1)*Math.PI/2:Math.atan2(-tiltX,tiltY)
   const sensor=sourceSensorValue({id:'tiltDirection'},{pressure:0,maxPressure:0,tangentialPressure:0,speed:0,drawingAngle:0,lockedDrawingAngle:0,rotation:0,xTilt:tiltX,yTilt:tiltY,tiltDirectionOffset:0,perspective:1,time:0,dabSequence:0,distance:0,hover:false})
   expect(sensor).toBeCloseTo(theta/Math.PI,13)
  }
  const short=(pressure:number)=>[{...packet(0,0,pressure),tiltX:30,tiltY:0},{...packet(16,40,pressure),tiltX:30,tiltY:0}]
  for(const camera of[0,90,-90,45,180]){
   const inputs=short(0).map(p=>({...p,canvasRotation:(camera+360)%360})),stream=pencil3CpuStream(inputs,browser)
   for(const r of stream.recipes){expect(Math.sin(r.rotation)).toBeCloseTo(Math.sin(native(30,0,(camera+360)%360)),11);expect(Math.cos(r.rotation)).toBeCloseTo(Math.cos(native(30,0,(camera+360)%360)),11);expect(r.scale).toBeCloseTo(.487437,12)}
  }
  // Pure packet mirror mechanism, not an online mirrored viewport grant.
  for(const mirroredH of[false,true])for(const mirroredV of[false,true]){
   const stream=pencil3CpuStream(short(.6).map(p=>({...p,canvasRotation:45,mirroredH,mirroredV})),browser)
   for(const r of stream.recipes){expect(r.mirrorH).toBe(mirroredH);expect(r.mirrorV).toBe(mirroredV);expect(Math.sin(r.rotation)).toBeCloseTo(Math.sin(native(30,0,45)),11)}
  }
  const zero=pencil3CpuStream(short(.6),browser),ninety=pencil3CpuStream(short(.6).map(p=>({...p,canvasRotation:90})),browser)
  expect(wrap(ninety.recipes[0].rotation-zero.recipes[0].rotation)).toBeCloseTo(Math.PI/2,13)
 })
 it('independently preserves physical screen coverage using actual Camera inverse and Gaussian sampler; wrong sign/double transform differ at45',()=>{
  const source=gauss.descriptor.sourceStamp.source;if(source.kind!=='gaussianAuto')throw Error('Gaussian fixture required')
  const sample=(cameraAngle:number,recipeAngle:number)=>{
   const camera=new Camera({canvas:{width:64,height:64},infinite:false,pageWidth:64,pageHeight:64,measureRect:()=>({left:0,top:0,width:64,height:64})}),inverse=camera.boundedPointerTransform(32,32,1,cameraAngle),brush=gauss.descriptor.sourceStamp.brush
   const prepared=prepareSourceGaussianDab({dialect:'krita-gaussian-auto-qt5-arm64-v1',tip:{kind:'auto',generator:'gauss',shape:'circle',diameter:source.diameter,ratio:source.ratio,horizontalFade:source.horizontalFade,verticalFade:source.verticalFade,spikes:2,softness:1,randomness:0,density:1,antialias:source.antialias},storedScale:brush.scale,storedAngle:brush.angle,shape:{scale:1,ratio:1,rotation:recipeAngle},subpixelX:0,subpixelY:0,coverageProfile:'browser-number-coverage-v1',maxPixels:1048576,maxWorkSamples:16777216})
   const bytes:number[]=[]
   for(let y=-20;y<=20;y++)for(let x=-20;x<=20;x++){
    const world=inverse(32+x/4,32+y/4),r=sourceGaussianResolvedMaskReference({profile:'browser-number-coverage-v1',coefficients:prepared.coefficients,effectiveWidth:source.diameter,effectiveHeight:source.diameter*source.ratio,antialias:false,centerX:32-world.x,centerY:32-world.y,cos:Math.cos(prepared.coverageAngle),sin:Math.sin(prepared.coverageAngle),width:1,height:1,maxPixels:1,maxWorkSamples:36})
    bytes.push(r.mask[0])
   }
   return bytes
  }
  const base=sample(0,1.5*Math.PI);expect(new Set(base).size).toBeGreaterThanOrEqual(2)
  for(const a of[Math.PI/4,Math.PI/2]){const correct=sample(a,1.5*Math.PI+a);correct.forEach((b,i)=>expect(Math.abs(b-base[i])).toBeLessThanOrEqual(1))}
  // At90 the ellipse's180-degree symmetry hides sign errors:45 is mandatory.
  expect(sample(Math.PI/4,1.5*Math.PI-Math.PI/4)).not.toEqual(base)
  expect(sample(Math.PI/4,1.5*Math.PI+2*Math.PI/4)).not.toEqual(base)
 })
})
