import adjustOriginals from './fixtures/pixelAdjustComposition.native.json'
import {canonicalDynamicAutoGeometryAuthorAdmission} from './sourceCanonicalAuthorAdmission'
import {sourceDynamicAutoAuthorProgram} from './sourceStrokeAuthorDescriptor'
import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import * as S from '@grafetto/shared'
import originals from './fixtures/pixelBrowserBindings.native.json'
import {sourcePixelTextureAuthorProgram,sourcePixelDualAuthorProgram} from './sourceStrokeAuthorDescriptor'
import {SourceStrokeAuthor} from './sourceStrokeAuthor'

const B=S.CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE
const budget={workUnits:S.CANONICAL_MATERIAL_LIMITS.workUnits,outputBytes:S.CANONICAL_MATERIAL_LIMITS.outputBytes,drawPixels:S.CANONICAL_MATERIAL_LIMITS.drawPixels}
const context={inputProfile:'krita-freehand-no-smoothing-v1' as const,colorIdentity:'captured-original-binding-regression',lodScale:1}
const sha=(d:S.BrushDescriptor)=>createHash('sha256').update(S.canonicalBrushDescriptorJSON(d)).digest('hex')

it('derives texture wrapper coverage from the original browser pin and rejects an explicit mismatch',()=>{
 const row=originals.rows[1],d=row.descriptor as unknown as S.BrushDescriptor,before=S.canonicalBrushDescriptorJSON(d)
 const binding=S.canonicalPixelTextureSourceBinding(d,sha(d),row.assets,'browser-number-coverage-v1',B)
 expect(binding.originalAssets).toEqual(S.brushAssetIds(d).map(id=>(()=>{const a=row.assets.find(a=>a.id===id);if(!a)throw Error('Missing original reference');return{id:a.id,size:a.size}})()))
 const program=sourcePixelTextureAuthorProgram(d,{...context,binding,rasterProfile:B})
 expect(program.supported).toBe(true);if(!program.supported)throw Error(program.reasons.join(','))
 expect(()=>new SourceStrokeAuthor(program.program)).not.toThrow()
 expect(sourcePixelTextureAuthorProgram(d,{...context,binding,rasterProfile:B,coverageProfile:'neon64-f32-fma-v1'})).toEqual({supported:false,reasons:['Pixel texture coverage mismatch']})
 expect(()=>S.canonicalPixelTextureSourceBinding(d,sha(d),[],'browser-number-coverage-v1',B)).toThrow()
 expect(S.canonicalBrushDescriptorJSON(d)).toBe(before)
})

it('retains the original Soft lookup across a dual image/Soft PREP rebind without making it a physical image asset',()=>{
 const row=originals.rows[0],d=row.descriptor as unknown as S.BrushDescriptor,before=S.canonicalBrushDescriptorJSON(d),hash=sha(d)
 const captured=S.extractCanonicalPixelDualSourceData(d,row.assets)
 expect(captured.supported).toBe(true);if(!captured.supported)throw Error(captured.reasons.join(','))
 const p=captured.primary,m=captured.mask
 if(!p.imageSource||!p.imageAssets||m.data.version!==2||m.data.source.kind!=='softAuto'||m.data.compiled?.version!==2||!m.data.compiled.radialCurve)throw Error('Original image/Soft role fixture changed')
 const pin=S.canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:1,descriptorId:m.descriptor.id,descriptorVersion:m.descriptor.version,descriptorSha256:hash,coverageProfile:'browser-number-coverage-v1',...S.canonicalSoftAutoStatic(m.data.source,m.effectiveBrushScale,m.data.brush.angle,'browser-number-coverage-v1'),reader:m.data.reader,compilerProfile:m.data.compiled.profile,buildId:m.data.compiled.buildId,radialCurve:m.data.compiled.radialCurve})
 const material=S.canonicalMaskedSourceMaterialContext({version:2,primarySource:p.imageSource,maskSource:pin,assets:p.imageAssets,imageFrameIndices:'source-image-pipe-frame-v1',maskingBlend:captured.blendMode,budget})
 const binding=S.canonicalPixelDualSourceBinding(d,hash,material,undefined,row.assets)
 expect(binding.originalAssets).toEqual(S.brushAssetIds(d).map(id=>(()=>{const a=row.assets.find(a=>a.id===id);if(!a)throw Error('Missing original reference');return{id:a.id,size:a.size}})()))
 expect(binding.originalAssets.length).toBeGreaterThan(binding.material.assets.length)
 expect(Object.isFrozen(binding.originalAssets)).toBe(true);expect(binding.originalAssets.every(Object.isFrozen)).toBe(true)
 expect(S.canonicalPixelDualSourcePreparationContext(binding)).toEqual(material)
 expect(()=>S.canonicalPixelDualSourceBinding(d,hash,material,undefined,material.assets)).toThrow()
 const program=sourcePixelDualAuthorProgram(d,{...context,assets:row.assets,binding,coverageProfile:'browser-number-coverage-v1'})
 expect(program.supported).toBe(true);if(!program.supported)throw Error(program.reasons.join(','))
 expect(()=>new SourceStrokeAuthor(program.program)).not.toThrow()
 expect(S.canonicalBrushDescriptorJSON(d)).toBe(before)
})

it('rejects an unknown original CompositeOp before Pixel author admission instead of inheriting the importer normal approximation',()=>{
 const row=originals.rows[1],d=structuredClone(row.descriptor) as unknown as S.BrushDescriptor
 if(!d.sourceStamp)throw Error('Original SOURCE fixture missing')
 d.sourceStamp.settings.CompositeOp='unknown-native-composite-regression'
 // Importer compatibility warnings belong to the catalog row, not the
 // descriptor. The retained original setting must close admission itself.
 expect(S.isSourceStampData(d.sourceStamp)).toBe(true)
 expect(S.canonicalPixelSourceComposition(d,B)).toBeUndefined()
 expect(()=>S.canonicalPixelTextureSourceBinding(d,sha(d),row.assets,'browser-number-coverage-v1',B)).toThrow()
})

it.each([['normal','normal','over'],['multiply','multiply','multiply'],['lighten','lighten','lighten'],['dodge','colorDodge','colorDodge'],['overlay','overlay','overlay'],['color','color','colorHsyBrowser']] as const)('preserves the original native %s alias and rejects a different mapped outer law', (raw,mapped,outer)=>{
 const d=structuredClone(originals.rows[1].descriptor) as unknown as S.BrushDescriptor
 if(!d.sourceStamp)throw Error('Original SOURCE fixture missing')
 d.sourceStamp.settings.CompositeOp=raw
 Object.assign(d.behavior!.rendering!,{blendMode:mapped})
 expect(S.canonicalPixelSourceComposition(d,B)).toEqual({mode:'wash',outerBlend:outer})
 d.sourceStamp.settings.CompositeOp='normal'
 if(raw!=='normal')expect(S.canonicalPixelSourceComposition(d,B)).toBeUndefined()
})

it.each(['normal','erase','destination-out'])('preserves the explicit eraser override with recognized raw %s',raw=>{
 const d=structuredClone(originals.rows[1].descriptor) as unknown as S.BrushDescriptor
 if(!d.sourceStamp)throw Error('Original SOURCE fixture missing')
 d.sourceStamp.settings.CompositeOp=raw
 Object.assign(d.behavior!,{erase:true})
 expect(S.canonicalPixelSourceComposition(d,B)).toEqual({mode:'wash',outerBlend:'erase'})
 d.sourceStamp.settings.CompositeOp='unknown-native-composite-regression'
 expect(S.canonicalPixelSourceComposition(d,B)).toBeUndefined()
})

it.each(adjustOriginals.rows)('preserves original Adjust composition without a historical raw CompositeOp: $name',row=>{
 const d=row.descriptor as unknown as S.BrushDescriptor
 if(!d.sourceStamp)throw Error('Original SOURCE fixture missing')
 expect(Object.hasOwn(d.sourceStamp.settings,'CompositeOp')).toBe(false)
 const mode=d.behavior?.rendering?.blendMode,expected=mode==='color'?'colorHsyBrowser':mode
 expect(S.canonicalPixelSourceComposition(d,B)).toEqual({mode:'wash',outerBlend:expected})
 const admitted=canonicalDynamicAutoGeometryAuthorAdmission(d,B,row.assets,{authorPlainAutoGeometrySource:'dynamic-auto-geometry-v1'})
 expect(admitted.supported).toBe(true);if(!admitted.supported)throw Error(admitted.reason)
 const pin=S.canonicalDynamicAutoSourceBinding(d,sha(d),'browser-number-coverage-v1',B,undefined,admitted.geometryCapability.originalAssets)
 const compiled=sourceDynamicAutoAuthorProgram(d,{...context,descriptorSha256:sha(d),geometryCapability:admitted.geometryCapability,coverageProfile:pin.coverageProfile})
 expect(compiled.supported).toBe(true);if(!compiled.supported)throw Error(compiled.reasons.join(','))
 expect(()=>new SourceStrokeAuthor(compiled.program)).not.toThrow()
})
