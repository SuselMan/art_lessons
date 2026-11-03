import {createHash} from 'node:crypto'
import {describe,it,expect,vi} from 'vitest'
import imageFixture from '../../../apps/web/src/engine/src/presets/fixtures/sourcePngWholePath/guiStroke.native.json'
import {isBrushLibrary,type BrushDescriptor} from './brushes.js'
import {canonicalBrushDescriptorJSON} from './canonicalBrushDescriptor.js'
import {canonicalPixelImageSourceBinding,canonicalPixelImagePreparationContext,canonicalPixelImageMaterialContext} from './canonicalPixelTextureSourceBinding.js'
import {canonicalSourceTipGradient} from './canonicalSourceTipGradient.js'
import {canonicalSourceMaterialContext,canonicalSourceMaterialTipGradient,canonicalImageFrameAsset,buildCanonicalMaterial,CANONICAL_MATERIAL_LIMITS,type CanonicalMaterialRecipe} from './canonicalMaterialCodec.js'
import {decodeCanonicalStrokeFrame,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G} from './canonicalStrokeFrame.js'
import {sourcePngRasterShape} from './sourcePngGeometry.js'
import {sourceImageTransformMetadata} from './sourceImageTransformMetadata.js'

const budget={workUnits:CANONICAL_MATERIAL_LIMITS.workUnits,outputBytes:CANONICAL_MATERIAL_LIMITS.outputBytes,drawPixels:CANONICAL_MATERIAL_LIMITS.drawPixels}
const alpha={id:'asset:'+'11'.repeat(32),size:16,x:1,y:2,width:8,height:6}
const gray={...alpha,id:'asset:'+'22'.repeat(32)}
const rgba=()=>Array.from({length:1024},(_,i)=>{const n=Math.floor(i/4);return [n,255-n,(n*37)%256,(n*17+13)%256][i%4]})
const table=()=>canonicalSourceTipGradient({kind:'captured-tip-gradient-rgba8-v1',rgba:rgba()})
const empty={masked:false as const,entry:{phase:'between' as const},draws:[],fences:[]}
function material(application:'plain-gradient'|'spatial-mask'='plain-gradient'){
 return canonicalSourceMaterialContext({version:2,assets:[alpha,gray],imageFrameIndices:'source-image-pipe-frame-v1',primarySource:{kind:'image',asset:alpha.id,brushScale:1,brushAngle:0,frameBounds:[{x:1,y:2,width:8,height:6}],imageMaterial:{kind:'gradient-map-v1',grayAsset:gray.id,gradient:table(),application}},...application==='spatial-mask'?{sourceColorFields:{primary:{kind:'total-random-rgb8-hash-v1'}}}:{},budget:budget})
}
function envelope(ctx:ReturnType<typeof material>){
 const composition={mode:'wash' as const,alphaDarken:'creamy' as const,outerResourceOpacity:.6,outerBlend:'over' as const}
 const trusted={materialVersion:2 as const,rasterProfile:G,brush:'brush:structural-gradient@1',strokeId:'stroke-gradient',frameOrdinal:0,pigmentRgb8:[12,34,56] as const,composition,material:ctx}
 const value={version:2,rasterProfile:G,brush:trusted.brush,strokeId:trusted.strokeId,frameOrdinal:0,pigmentRgb8:trusted.pigmentRgb8,composition,materialPacked:buildCanonicalMaterial(empty,ctx).packed,sourceTipGradient:canonicalSourceMaterialTipGradient(ctx),...ctx.sourceColorFields?{sourceColorFields:ctx.sourceColorFields}:{}}
 return {trusted,value}
}
function binding(){
 // Existing compiled2 curve programs are reused; this is an explicit descriptor
 // variant for the mechanism contract, not a claim of a genuine Gradient preset.
 const original=structuredClone(imageFixture.descriptor)
 expect(isBrushLibrary({schemaVersion:1,brushes:[{descriptor:original,name:'',source:'',warnings:[]}],assets:[{id:imageFixture.asset.id,size:imageFixture.asset.size,file:imageFixture.asset.id.slice(6)+'.bin'}],skipped:[]}), 'original compiled fixture library valid').toBe(true)
 const descriptor=structuredClone(imageFixture.descriptor) as unknown as BrushDescriptor
 descriptor.tip.material={kind:'gradient',gray:gray.id as `asset:${string}`}
 // Paired original planes use their own source grid; integer inverse-gray
 // alpha sampling is a mutually exclusive legacy image path.
 delete descriptor.tip.imageSampling
 if(!descriptor.sourceStamp)throw Error('Fixture source program missing')
 const originalXml=descriptor.sourceStamp.settings.brush_definition
 Object.assign(descriptor.sourceStamp.settings,{brush_definition:originalXml.replace(/brushApplication="[^"]*"/,'').replace(/<Brush\b/,'<Brush brushApplication="3"')})
 const available=[imageFixture.asset,{id:gray.id,size:imageFixture.asset.size}]
 expect(isBrushLibrary({schemaVersion:1,brushes:[{descriptor,name:'',source:'',warnings:[]}],assets:available.map(a=>({id:a.id,size:a.size,file:a.id.slice(6)+'.bin'})),skipped:[]}), 'derived fixture library valid').toBe(true)
 const sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex')
 return canonicalPixelImageSourceBinding(descriptor,sha,[imageFixture.asset,{id:gray.id,size:imageFixture.asset.size}],G)
}

describe('Pixel tip GradientMap START and recorded resource closure',()=>{
 it('PREP owns only alpha and never fabricates a LUT; strict START requires the selected resource',()=>{
  const b=binding(),prep=canonicalPixelImagePreparationContext(b,budget)
  expect(b.gradientMapTemplate?.kind).toBe('gradient-map-template-v1')
  expect(prep.primarySource).not.toHaveProperty('imageMaterial')
  expect(prep.assets.map(a=>a.id)).toEqual([b.source.asset])
  expect(()=>canonicalPixelImageMaterialContext(b,budget)).toThrow()
  const started=canonicalPixelImageMaterialContext(b,budget,{sourceTipGradient:table()})
  expect(canonicalSourceMaterialTipGradient(started)).toEqual(table())
  expect(started.assets.map(a=>a.id)).toContain(gray.id)
  expect(canonicalPixelImagePreparationContext(b,budget)).toEqual(prep)
 })
 it('captures nontrivial RGB and alpha independently of caller mutation and rejects accessors before invocation',()=>{
  const input={kind:'captured-tip-gradient-rgba8-v1',rgba:rgba()},captured=canonicalSourceTipGradient(input)
  input.rgba[3]=255;expect(captured.rgba[3]).toBe(13)
  expect(Object.isFrozen(captured.rgba)).toBe(true)
  expect(captured.rgba.slice(4,8)).toEqual([1,254,37,30])
  const get=vi.fn(()=>rgba());expect(()=>canonicalSourceTipGradient({kind:input.kind,get rgba(){return get()}})).toThrow();expect(get).not.toHaveBeenCalled()
  for(const bad of [{...input,rgba:rgba().slice(1)},{...input,rgba:rgba().map((v,i)=>i===17?256:v)},{...input,kind:'captured-texture-gradient-rgba8-v1'}])expect(()=>canonicalSourceTipGradient(bad)).toThrow()
 })
 it('requires the exact immutable tip table on every frame and rejects legacy unexpected metadata',()=>{
  const f=envelope(material()),decoded=decodeCanonicalStrokeFrame(f.value,f.trusted)
  expect(decoded.envelope.sourceTipGradient).toEqual(table())
  const {sourceTipGradient:omitted,...missing}=f.value;expect(omitted).toBeDefined()
  expect(()=>decodeCanonicalStrokeFrame(missing,f.trusted)).toThrow()
  const changed=rgba();changed[7]^=1
  expect(()=>decodeCanonicalStrokeFrame({...f.value,sourceTipGradient:{kind:'captured-tip-gradient-rgba8-v1',rgba:changed}},f.trusted)).toThrow()
  const legacy=canonicalSourceMaterialContext({version:2,assets:[alpha],primarySource:{kind:'image',asset:alpha.id,brushScale:1,brushAngle:0},budget:budget})
  expect(()=>decodeCanonicalStrokeFrame({...f.value,materialPacked:buildCanonicalMaterial(empty,legacy).packed},{...f.trusted,material:legacy})).toThrow()
 })
 it('requires native spatial precedence explicitly instead of silently applying the tip LUT',()=>{
  const plain=material(),spatial=material('spatial-mask')
  expect(canonicalSourceMaterialTipGradient(spatial)).toEqual(canonicalSourceMaterialTipGradient(plain))
  const source=spatial.primarySource;if(source.kind!=='image'||source.imageMaterial?.kind!=='gradient-map-v1')throw Error('Gradient fixture')
  expect(source.imageMaterial.application).toBe('spatial-mask')
  expect(()=>canonicalSourceMaterialContext({...spatial,sourceColorFields:undefined})).toThrow()
  expect(()=>canonicalSourceMaterialContext({...spatial,primarySource:{...source,imageMaterial:{...source.imageMaterial,application:'plain-gradient'}}})).toThrow()
 })
 it('requires one global selected table across primary and mask roles',()=>{
  const ctx=material(),primary=ctx.primarySource
  const dual=canonicalSourceMaterialContext({...ctx,maskSource:primary,maskingBlend:'multiply'})
  expect(canonicalSourceMaterialTipGradient(dual)).toEqual(table())
  if(primary.kind!=='image'||primary.imageMaterial?.kind!=='gradient-map-v1')throw Error('Gradient fixture')
  const values=rgba();values[0]^=1
  expect(()=>canonicalSourceMaterialContext({...dual,maskSource:{...primary,imageMaterial:{...primary.imageMaterial,gradient:canonicalSourceTipGradient({kind:'captured-tip-gradient-rgba8-v1',rgba:values})}}})).toThrow()
 })
 it('validates recorded frame index against authoritative same-CAS rect rather than representative storage crop',()=>{
  const source={kind:'image' as const,asset:alpha.id,frames:[alpha.id,alpha.id],frameBounds:[{x:1,y:2,width:8,height:6},{x:3,y:4,width:4,height:9}],brushScale:1,brushAngle:0}
  const ctx=canonicalSourceMaterialContext({version:2,assets:[alpha],primarySource:source,imageFrameIndices:'source-image-pipe-frame-v1',budget:budget})
  const selected=canonicalImageFrameAsset(ctx.primarySource.kind==='image'?ctx.primarySource:source,ctx.assets,1)
  expect(selected).toEqual({...alpha,x:3,y:4,width:4,height:9})
  const shape=sourcePngRasterShape({width:4,height:9,scale:1,angle:0},{scale:1,ratio:1,rotation:0}),m=sourceImageTransformMetadata(4,9,shape,0,0)
  const recipe:CanonicalMaterialRecipe={kind:'image',asset:alpha.id,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:m.width,height:m.height,mirrorH:false,mirrorV:false,imageFrameIndex:1,sourceSlot:0}
  const input={...empty,draws:[{recipe,role:'primary' as const,x:0,y:0,opacity:1,flow:1}],fences:[{at:0,kind:'segmentBegin' as const,group:1},{at:1,kind:'primaryEnd' as const,group:1},{at:1,kind:'segmentEnd' as const,group:1},{at:1,kind:'gestureEnd' as const}]} 
  expect(buildCanonicalMaterial(input,ctx).frame.definitions[0]).toEqual(recipe)
  expect(()=>buildCanonicalMaterial({...input,draws:[{...input.draws[0],recipe:{...recipe,imageFrameIndex:0}}]},ctx)).toThrow()
 })
})
