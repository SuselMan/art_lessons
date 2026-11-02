import {expect,it,vi} from 'vitest'
import actual from './fixtures/sourceGaussianAutoData/pencil3.texture-pressure.compiled3.metadata.json' with {type:'json'}
import reptile from './fixtures/sourceDefaultAutoData/textureReptile.pressure.compiled3.metadata.json' with {type:'json'}
import soft from './fixtures/sourceSoftAutoData/texturePressure.native-default.compiled4.metadata.json' with {type:'json'}
import type {BrushDescriptor} from './brushes.js'
import {isSourceStampData,captureSourceGaussianTexturePressureProgram,captureSourceTexturePressureProgram,captureSourceTextureNativeDefaultProgram} from './sourceStampData.js'
import {extractCanonicalGaussianAutoTexturePressureProgramData,extractGaussianAutoSourceDataCapability,extractCanonicalDefaultAutoPressureTextureProgramData,hasCanonicalSourceCurvePrograms} from './canonicalBrushCapability.js'
import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G} from './canonicalStrokeFrame.js'
import {canonicalGaussianAutoSourceBinding,canonicalDefaultAutoPressureTextureSourceBinding} from './canonicalDefaultAutoMaterial.js'
const descriptor=actual.descriptor as unknown as BrushDescriptor
const pattern=actual.patternAsset
it('accepts whole genuine normal Gaussian compiled3 through existing public schema',()=>{
 expect(isSourceStampData(actual.descriptor.sourceStamp)).toBe(true)
 expect(actual.descriptor.id).toBe('imported-be07efd434bb093a00561794')
 expect(actual.descriptor.version).toBe(37)
})
it('captures separate Gaussian pressure DATA and preserves original unresolved phase with no ordinary grants',()=>{
 const before=JSON.stringify(actual),cap=extractCanonicalGaussianAutoTexturePressureProgramData(descriptor,{pattern})
 expect(cap.supported).toBe(true);if(!cap.supported)throw Error(cap.reasons.join(','))
 expect(cap.rasterReady).toBe(false);expect(cap.status).toBe('source-data-only')
 expect(cap.phase).toEqual({kind:'unresolved-original-random-phase-v1',x:1,y:65,randomX:true,randomY:true})
 expect(cap.patternAsset).toMatchObject(pattern);expect(cap.patternAsset).toMatchObject({x:0,y:0,width:51,height:51});expect(cap.program.curve.source.text).toBe('0,0;0.129397,0.0648241;0.513819,0.714071;0.758794,0.768844;')
 expect(Object.isFrozen(cap.data)).toBe(true);expect(Object.isFrozen(cap.program.curve.coefficients)).toBe(true)
 expect(cap).not.toHaveProperty('primaryTexture');expect(cap).not.toHaveProperty('material');expect(JSON.stringify(actual)).toBe(before)
 expect(extractGaussianAutoSourceDataCapability(descriptor).supported).toBe(false)
 expect(extractCanonicalDefaultAutoPressureTextureProgramData(descriptor,{pattern}).supported).toBe(false)
 expect(hasCanonicalSourceCurvePrograms(cap.data)).toBe(false)
 expect(()=>captureSourceTexturePressureProgram(actual.descriptor.sourceStamp)).toThrow('DefaultAuto')
 expect(()=>canonicalGaussianAutoSourceBinding(descriptor,'a'.repeat(64),'neon64-f32-fma-v1',G)).toThrow()
 expect(()=>canonicalDefaultAutoPressureTextureSourceBinding(descriptor,'a'.repeat(64),'neon64-f32-fma-v1',pattern,G)).toThrow()
})
it('keeps Default3 and Soft4 pressure readers closed and unchanged',()=>{
 expect(captureSourceTexturePressureProgram(reptile.descriptor.sourceStamp).program.curve).toEqual(reptile.descriptor.sourceStamp.compiled.textureStrength.curve)
 expect(captureSourceTextureNativeDefaultProgram(soft.descriptor.sourceStamp).program.curve).toEqual(soft.descriptor.sourceStamp.compiled.textureStrength.curve)
 expect(()=>captureSourceGaussianTexturePressureProgram(reptile.descriptor.sourceStamp)).toThrow('Gaussian')
 expect(()=>captureSourceGaussianTexturePressureProgram(soft.descriptor.sourceStamp)).toThrow()
})
it('rejects unknown source/effects/phase and wrong actual asset without mutating original settings',()=>{
 for(const change of[(d:BrushDescriptor)=>{Reflect.set(d.sourceStamp!.flags,'materialFixed1',false)},(d:BrushDescriptor)=>{Reflect.set(d.texture!.offset!,'randomX',false)},(d:BrushDescriptor)=>{Reflect.set(d.texture!.application!,'mode','multiply')},(d:BrushDescriptor)=>{Reflect.set(d.texture!.offset!,'x',-0)},(d:BrushDescriptor)=>{Reflect.set(d,'wet',{})},(d:BrushDescriptor)=>{Reflect.set(d.sourceStamp!.settings,'Texture/Strength/Sensor','<params id="fade"><curve>0,0;1,1;</curve></params>')}]){
  const d=structuredClone(descriptor);change(d);expect(extractCanonicalGaussianAutoTexturePressureProgramData(d,{pattern}).supported).toBe(false)
 }
 expect(extractCanonicalGaussianAutoTexturePressureProgramData(descriptor,{pattern:{...pattern,id:'asset:'+'a'.repeat(64)}}).supported).toBe(false)
 expect(extractCanonicalGaussianAutoTexturePressureProgramData(descriptor,{pattern:{...pattern,size:32}}).supported).toBe(false)
})
it('never invokes new source/index/curve/version or metadata accessors',()=>{
 for(const site of['settings','point','coefficient','version']as const){
  const raw=structuredClone(actual.descriptor.sourceStamp),getter=vi.fn(()=>{throw Error('getter ran')})
  if(site==='settings')Object.defineProperty(raw,'settings',{get:getter})
  if(site==='point')Object.defineProperty(raw.compiled.textureStrength.curve.source.points,'0',{get:getter})
  if(site==='coefficient')Object.defineProperty(raw.compiled.textureStrength.curve.coefficients[0],'0',{get:getter})
  if(site==='version')Object.defineProperty(raw.compiled,'version',{get:getter})
  expect(isSourceStampData(raw)).toBe(false);expect(()=>captureSourceGaussianTexturePressureProgram(raw)).toThrow();expect(getter).not.toHaveBeenCalled()
 }
 const d=structuredClone(descriptor),getter=vi.fn(()=>({}));Object.defineProperty(d,'sourceStamp',{get:getter});expect(extractCanonicalGaussianAutoTexturePressureProgramData(d,{pattern}).supported).toBe(false);expect(getter).not.toHaveBeenCalled()
 const metadata={};Object.defineProperty(metadata,'pattern',{get:getter});expect(extractCanonicalGaussianAutoTexturePressureProgramData(descriptor,metadata as {pattern:typeof pattern}).supported).toBe(false);expect(getter).not.toHaveBeenCalled()
})
it('rejects new inherited compiled DATA and budget overflows before interpreting any program',()=>{
 const raw=structuredClone(actual.descriptor.sourceStamp),{compiled,...rest}=raw,inherited=Object.assign(Object.create({compiled}),rest)
 expect(isSourceStampData(inherited)).toBe(false);expect(()=>captureSourceGaussianTexturePressureProgram(inherited)).toThrow()
 const huge=structuredClone(raw);Reflect.set(huge.settings,'unexpected','x'.repeat(65537))
 expect(isSourceStampData(huge)).toBe(false);expect(()=>captureSourceGaussianTexturePressureProgram(huge)).toThrow()
})
