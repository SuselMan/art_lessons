import {describe,it,expect}from'vitest'
import {inflateSync}from'node:zlib'
import {createHash}from'node:crypto'
import {CANONICAL_MATERIAL_LIMITS,CANONICAL_STROKE_RASTER_PROFILE,canonicalSourceComposition,type BrushDescriptor}from'@grafetto/shared'
import fixture from'./fixtures/sourceImagePipe/pencilRandom.native.json'
import {sourceStrokeAuthorDescriptor}from'./sourceStrokeAuthorDescriptor'
import {KritaRandomSource}from'./nativeRandom'
import {SourceStrokeAuthor,type SourceStrokeAuthorState,type SourceStrokeAuthorStep}from'./sourceStrokeAuthor'
import {SourceStrokeMaterialAdapter}from'./sourceStrokeMaterialAdapter'
import {SourceCanonicalFrameEncoder}from'./sourceCanonicalFrameEncoder'
import {nativeImageBank,nativeImagePixels}from'../dabs/NativeImageBank'
const descriptor=fixture.descriptor as unknown as BrushDescriptor
const packet=(x:number,t:number)=>({x,y:80,t,pressure:1,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false})
function run(resume:boolean){
 const compiled=sourceStrokeAuthorDescriptor(descriptor,{assets:fixture.assets,colorIdentity:'black',lodScale:1,inputProfile:'krita-freehand-no-smoothing-v1'})
 if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const p=compiled.program,author=new SourceStrokeAuthor(p);let state=author.createState(1,2,0)
 const frames=descriptor.tip.animation!.frames,assets=fixture.assets.map(({id,size,x,y,width,height})=>({id,size,x,y,width,height})),context={assets,primaryAsset:frames[0],primaryImageFrames:frames,budget:CANONICAL_MATERIAL_LIMITS},adapter=new SourceStrokeMaterialAdapter(p,context,state),policy=canonicalSourceComposition(descriptor)!
 const encoder=new SourceCanonicalFrameEncoder({rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:descriptor.id+'@'+descriptor.version,strokeId:'actual-incremental-pipe',pigmentRgb8:[0,0,0],composition:{...policy,alphaDarken:'creamy',outerResourceOpacity:1},material:context})
 const steps:SourceStrokeAuthorStep[]=[],accepted:ReturnType<typeof encoder.encode>[]=[]
 const accept=(chunks:ReturnType<typeof adapter.finish>)=>{for(const c of chunks)accepted.push(encoder.encode(c.packed))}
 const consume=(iter:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>)=>{while(true){const n=iter.next();if(n.done){state=n.value;return}steps.push(n.value);accept(adapter.accept(n.value));const c=adapter.flush();if(c)accept([c]);if(resume){const saved=structuredClone(n.value.state);iter.return(saved);if(!saved.cursor){state=saved;return}iter=new SourceStrokeAuthor(structuredClone(p)).resume(saved)}}}
 for(const input of[packet(40,0),packet(240,1000)]){accept(adapter.beginInput(state));consume(author.plan(state,input))}
 accept(adapter.beginInput(state));consume(author.finish(state));accept(adapter.finish(state))
 return{state,steps,accepted,program:p}
}
describe('original Pencil Soft seven-frame random GIH mechanism',()=>{
 it('normal import data drives random frames through unchanged image encoder and native image bank',()=>{
  const whole=run(false);expect(run(true)).toEqual(whole)
  const frames=descriptor.tip.animation!.frames,material=whole.steps.filter(s=>s.kind==='material')
  expect(material.length).toBeGreaterThan(14)
  expect(whole.program.roles[0].brush).toEqual({width:128,height:128,scale:.125,angle:1.5708})
  const rng=new KritaRandomSource(1),selected=material.map(()=>frames[rng.generate(0,6)])
  material.forEach((s,i)=>expect(s.result!.material!.resolvedSource.brushIdentity).toBe(selected[i]))
  expect(whole.state.random.draws).toBe(material.length)
  const recipes=whole.accepted.flatMap(a=>a.frame.draws.map(d=>a.frame.definitions[d.definition]))
  expect(recipes.map(r=>'asset'in r?r.asset:undefined)).toEqual(selected)
  const pixelHashes=fixture.assets.map(a=>{const bytes=inflateSync(Buffer.from(a.deflateBase64,'base64'),{maxOutputLength:128*128});expect('asset:'+createHash('sha256').update(bytes).digest('hex')).toBe(a.id);const tip={...descriptor.tip,mask:a.id as typeof descriptor.tip.mask};const mask=tip.mask;if(!mask)throw Error('Missing frame');const bank=nativeImageBank(mask,tip),pixels=nativeImagePixels(bank[0],bytes);return createHash('sha256').update(pixels).digest('hex')})
  expect(new Set(pixelHashes).size).toBe(7)
  expect(new Set(selected).size).toBe(7)
  expect(run(false).accepted).toEqual(whole.accepted)
 })
})
