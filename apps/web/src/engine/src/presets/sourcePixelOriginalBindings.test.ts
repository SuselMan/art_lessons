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
