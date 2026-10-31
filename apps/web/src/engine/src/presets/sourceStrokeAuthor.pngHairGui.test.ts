import {describe,expect,it}from'vitest'
import {createHash}from'node:crypto'
import {inflateSync}from'node:zlib'
import {CANONICAL_MATERIAL_LIMITS,CANONICAL_STROKE_RASTER_PROFILE,canonicalSourceComposition,sourcePngRasterShape,type BrushDescriptor}from'@grafetto/shared'
import fixture from'./fixtures/sourcePngWholePath/hairGui.native.json'
import {sourceStrokeAuthorDescriptor}from'./sourceStrokeAuthorDescriptor'
import {SourceStrokeAuthor,type SourceStrokeAuthorState,type SourceStrokeAuthorStep}from'./sourceStrokeAuthor'
import {SourceStrokeMaterialAdapter}from'./sourceStrokeMaterialAdapter'
import {SourceCanonicalFrameEncoder}from'./sourceCanonicalFrameEncoder'
import {createSourcePrimaryComposition,advanceSourcePrimaryComposition}from'./sourcePrimaryComposition'
import {sourceCurveTransfer}from'./sourceCurve'
import {sourceImageTransformPixels}from'./sourceImageTransformPixels'
import {affineStraightMask}from'../raster/affineImageSpan16'
import {nativeImageBank,nativeImagePixels}from'../dabs/NativeImageBank'
import {canonicalTransformedMaskMetadata}from'../dabs/TransformedMaskPlan'
import {compositeSourceFused32}from'./sourceFused32'

const sha=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex')
const fromBits=(bits:number)=>new Float32Array(new Uint32Array([bits]).buffer)[0]
const descriptor=fixture.descriptor as unknown as BrushDescriptor
const {id,size,x,y,width,height}=fixture.asset,asset={id,size,x,y,width,height}
function run(resume:boolean){
 const compiled=sourceStrokeAuthorDescriptor(descriptor,{asset:{id,size},colorIdentity:'native-GUI-black',lodScale:1,inputProfile:'krita-freehand-no-smoothing-v1'})
 if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const p=compiled.program,author=new SourceStrokeAuthor(p),policy=canonicalSourceComposition(descriptor,CANONICAL_STROKE_RASTER_PROFILE)
 if(!policy)throw Error('Captured native source composition unavailable')
 const controls=fixture.nativeControls,creamy=controls.useCreamyAlphaDarken.value??controls.useCreamyAlphaDarken.defaultValue
 const composition={...policy,alphaDarken:creamy?'creamy' as const:'hard' as const,outerResourceOpacity:controls.uiResourceOpacityPercent/100}
 let state=author.createState(4321,7654,.3)
 const material={assets:[asset],primaryAsset:id,budget:CANONICAL_MATERIAL_LIMITS},adapter=new SourceStrokeMaterialAdapter(p,material,state),encoder=new SourceCanonicalFrameEncoder({rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:descriptor.id+'@'+descriptor.version,strokeId:'native-texture64',pigmentRgb8:[0,0,0],composition,material})
 let paint=createSourcePrimaryComposition(composition).state
 const frames:unknown[]=[],draws:ReturnType<typeof advanceSourcePrimaryComposition>['draws'][number][]=[],recipes:unknown[]=[],steps:SourceStrokeAuthorStep[]=[]
 const accept=(chunks:ReturnType<typeof adapter.finish>)=>{for(const chunk of chunks){const accepted=encoder.encode(chunk.packed),next=advanceSourcePrimaryComposition(paint,{ordinal:frames.length,frame:accepted.frame});paint=next.state;for(const draw of next.draws){draws.push(draw);recipes.push(accepted.frame.definitions[draw.definition])}frames.push(accepted.envelope)}}
 const consume=(iterator:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>)=>{
  while(true){const next=iterator.next();if(next.done){state=next.value;return}steps.push(next.value);accept(adapter.accept(next.value));const cut=adapter.flush();if(cut)accept([cut])
   if(resume){const saved=structuredClone(next.value.state);iterator.return(saved);if(!saved.cursor){state=saved;return}iterator=new SourceStrokeAuthor(structuredClone(p)).resume(saved)}
  }
 }
 const m=fixture.mapping
 for(const[xb,yb,t,pb]of fixture.packets.slice(0,-1)){
  accept(adapter.beginInput(state));consume(author.plan(state,{x:m.a*fromBits(xb)+m.c*fromBits(yb)+m.tx,y:m.b*fromBits(xb)+m.d*fromBits(yb)+m.ty,t,pressure:fromBits(pb),tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false}))
 }
 accept(adapter.beginInput(state));consume(author.finish(state));accept(adapter.finish(state))
 expect(encoder.ended&&paint.ended&&state.ended).toBe(true)
 return{state,steps,frames,draws,recipes,program:p}
}

describe('actual GUI PNG TextureHair original70 dynamicSizeOpacityFlow whole stroke',()=>{
 it('keeps native114x111/CAS128 geometry, originalARM curve and allRGBA through every-yield resume',()=>{
  const whole=run(false)
  expect(run(true)).toEqual(whole)
  expect(whole.program.roles[0].brush).toEqual({width:114,height:111,scale:.614035,angle:0})
  expect(fixture.descriptor.sourceStamp.compiled.profile).toBe(fixture.provider.profile)
  const bytes=(values:readonly number[])=>{const b=Buffer.alloc(values.length*8);values.forEach((v,i)=>b.writeDoubleLE(v,i*8));return b}
  for(const native of fixture.nativeCurves){
   if(native.option!=='Size'&&native.option!=='Opacity'&&native.option!=='Flow')throw Error('Unexpected captured option')
   const curve=whole.program.roles[0].options[native.option].sensors[0].curve
   expect(curve.arithmetic).toBe('installed-arm64-fused-v1')
   expect(sha(bytes(curve.coefficients!.flat()))).toBe(native.coefficientsF64LESHA256)
   expect(sha(bytes(sourceCurveTransfer({points:curve.points,coefficients:curve.coefficients!},{layout:'sensor',arithmetic:curve.arithmetic!})))).toBe(native.transfer256F64LESHA256)
  }
  const original=new Uint8Array(inflateSync(Buffer.from(fixture.asset.deflateBase64,'base64'),{maxOutputLength:fixture.asset.uncompressedBytes}))
  expect(original.length).toBe(size*size)
  expect('asset:'+sha(original)).toBe(id)
  const tipMask=descriptor.tip.mask
  if(!tipMask||tipMask!==id)throw Error('Descriptor tip differs from verified CAS asset')
  const bank=nativeImageBank(tipMask,descriptor.tip),levels=new Map<number,Uint8Array>()
  let output:Uint8Array=new Uint8Array(512*512*4)
  for(const[i,draw]of whole.draws.entries()){
   const r=whole.recipes[i] as {asset:string;brushScale:number;brushAngle:number;scale:number;ratio:number;rotation:number;subX:number;subY:number;width:number;height:number;mirrorH:boolean;mirrorV:boolean}
   const metadata=canonicalTransformedMaskMetadata(r,asset);let rgba=levels.get(metadata.index)
   if(!rgba){const resource=bank[metadata.index],coverage=nativeImagePixels(resource,original);rgba=new Uint8Array(coverage.length*4);for(let y=1;y<resource.height-1;y++)for(let x=1;x<resource.width-1;x++){const offset=y*resource.width+x,v=255-coverage[offset];rgba[offset*4]=rgba[offset*4+1]=rgba[offset*4+2]=v;rgba[offset*4+3]=255}levels.set(metadata.index,rgba)}
   const shape=sourcePngRasterShape({width:asset.width,height:asset.height,scale:r.brushScale,angle:r.brushAngle},{scale:r.scale,ratio:r.ratio,rotation:r.rotation}),mask=affineStraightMask(sourceImageTransformPixels(rgba,asset.width,asset.height,shape,r.subX,r.subY,{sourceDecode:'neon4',products:'summed',straightStore:'qt-wordsize64'}))
   expect(mask.length).toBe(r.width*r.height)
   const source=new Uint8Array(output.length)
   for(let y=Math.max(0,draw.y);y<Math.min(512,draw.y+r.height);y++)for(let x=Math.max(0,draw.x);x<Math.min(512,draw.x+r.width);x++){const mx=r.mirrorH?r.width-1-(x-draw.x):x-draw.x,my=r.mirrorV?r.height-1-(y-draw.y):y-draw.y;source[(y*512+x)*4+3]=mask[my*r.width+mx]}
   const c=draw.controls
   if(c.kind!=='localAlphaDarken'||c.variant!=='creamy')throw Error('Unexpected captured native composition')
   output=compositeSourceFused32({profile:'installed-arm64-vector32-fused-fpcr0-v1',operator:'alphaDarkenCreamy',source,destination:output,cols:512,rows:512,sourceStride:2048,destinationStride:2048,maskStride:512,sourceAlignment:0,destinationAlignment:0,opacity:c.opacity,averageOpacity:c.averageOpacity,flow:c.flow}).pixels
  }
  expect(sha(output)).toBe(fixture.nativeRGBA512SHA256)
  expect(whole.draws).toHaveLength(fixture.draws)
  expect(whole.frames).toHaveLength(fixture.frames)
  expect(whole.draws[0].controls).toEqual(fixture.firstControls)
  expect(whole.draws.at(-1)!.controls).toEqual(fixture.lastControls)
  const alpha=output.filter((_,i)=>i%4===3)
  expect(alpha.filter(v=>v>0)).toHaveLength(fixture.coverage.visiblePixels)
  expect(alpha.filter(v=>v>0&&v<255)).toHaveLength(fixture.coverage.partialPixels)
  expect(new Set(alpha).size).toBe(fixture.coverage.distinctAlpha)
 },30000)
})
