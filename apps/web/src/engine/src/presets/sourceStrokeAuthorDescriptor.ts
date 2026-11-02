import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE} from '@grafetto/shared'
import {captureTexturedAutoProgramBinding,canonicalTexturedAutoProgramBinding,extractCanonicalTexturedAutoProgramData,type CanonicalTexturedAutoProgramBinding} from '@grafetto/shared'
import { SOURCE_LONG_TIME } from '../dabs/sourceDistanceTiming'
import {canonicalBrushDescriptorJSON,type CanonicalMaterialContextV6,canonicalSoftNativeDefaultTexturedSourceMaterialContext,canonicalSoftAutoNativeDefaultTextureSourceBinding,extractCanonicalSoftAutoNativeDefaultTextureProgramData, type CanonicalMaterialContextV5, canonicalPressureTexturedSourceMaterialContext, canonicalDefaultAutoPressureTextureSourceBinding, canonicalPressureCurvePrimaryTexturePin, extractCanonicalDefaultAutoPressureTextureProgramData, type CanonicalStrokeRasterProfile, canonicalTexturedSourceMaterialContext, canonicalDefaultAutoFixedTextureSourceBinding, extractCanonicalDefaultAutoFixedTextureCapability, type CanonicalMaterialContextV4, CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE, extractCanonicalPrimaryTextureCapability, extractSeededDensityDefaultAutoSourceDataCapability, extractCanonicalSinglePngCapability, extractCanonicalIncrementalImagePipeCapability, extractCanonicalRandomImagePipeCapability, extractDefaultAutoSourceDataCapability, extractGaussianAutoSourceDataCapability, extractSoftAutoSourceDataCapability, type BrushDescriptor, type SourceStampCurveData } from '@grafetto/shared'
import { sourceCurveIsIdentity, type SourceCurvePolynomial } from './sourceCurve'
import { compileSourceOptionProgram, type SourceOptionProgramInput } from './sourceOptionProgram'
import {sourceTexturedAutoProgramCpuBytes,sourceNativeDefaultMaterialProgramCpuBytes, sourcePressureMaterialProgramCpuBytes, SourceStrokeAuthor, type SourceAuthorRoleProgram, type SourceStrokeAuthorProgram } from './sourceStrokeAuthor'

/** No XML parsing, asset loading, stock table, or approximate curve solver here. */
export interface SourceAuthorDescriptorContext {
  /** Explicit GUI input law; absent means historical explicit paintAt inputs. */
  readonly inputProfile?: 'krita-freehand-no-smoothing-v1'
  readonly colorIdentity: string
  readonly lodScale: number
  /** Native effective brush scale captured at pen-down, if user changed size. */
  readonly scale?: number
  readonly coverageProfile?: 'scalar-f64-fma-v1' | 'scalar-bionic-f64-fma-v1' | 'neon64-f32-fma-v1' | 'browser-number-coverage-v1' | typeof CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE
  /** Explicit material3 semantic path; not a room/BEGIN permission. */
  readonly primaryTexture?:{readonly pattern:{readonly id:string;readonly size:number}}
  /** Explicit captured material4; semantic capability alone is insufficient. */
  readonly fixedPrimaryTexture?:{readonly context:CanonicalMaterialContextV4;readonly rasterProfile:CanonicalStrokeRasterProfile}
  readonly softPressurePrimaryTexture?:{readonly context:CanonicalMaterialContextV6;readonly rasterProfile:CanonicalStrokeRasterProfile;readonly materialCpuBudgetBytes:number}
  readonly pressurePrimaryTexture?:{readonly context:CanonicalMaterialContextV5;readonly rasterProfile:CanonicalStrokeRasterProfile;readonly materialCpuBudgetBytes:number}
  readonly asset?: { readonly id: string; readonly size: number }
  readonly assets?: readonly {readonly id:string;readonly size:number}[]
  /** Explicit compiler capability; absence rejects nonidentity curves.
   * Caller must bind its result to these exact points/corners/source reader. */
  readonly compileCurve?: (curve: SourceStampCurveData) => { readonly version: 'native-sparselu-v1' | 'mapped-arm64-v3'; readonly coefficients: SourceCurvePolynomial['coefficients'] } | undefined
}
export type SourceAuthorDescriptorResult = { readonly supported: true; readonly program: SourceStrokeAuthorProgram }
  | { readonly supported: false; readonly reasons: readonly string[] }
export function sourceStrokeAuthorDescriptor(descriptor: BrushDescriptor, context: SourceAuthorDescriptorContext): SourceAuthorDescriptorResult {
  return compileDescriptor(descriptor,context)
}
export function sourceTexturedAutoAuthorProgram(descriptor:BrushDescriptor,context:Omit<SourceAuthorDescriptorContext,'primaryTexture'|'fixedPrimaryTexture'|'pressurePrimaryTexture'|'softPressurePrimaryTexture'|'asset'|'assets'|'compileCurve'>&{readonly binding:CanonicalTexturedAutoProgramBinding;readonly rasterProfile:CanonicalStrokeRasterProfile;readonly materialCpuBudgetBytes:number}):SourceAuthorDescriptorResult {
 try {
  assertTexturedAutoOwnData(descriptor)
  assertTexturedAutoOwnData(context)
 } catch {return {supported:false,reasons:['textured-auto-own-data-required']}}
 return compileDescriptor(descriptor,context,context.binding,context.rasterProfile,context.materialCpuBudgetBytes)
}
/** New named boundary only. Validate original object in place: no normalized
 * clone, getter evaluation or semantic bypass. Proxies are not sandboxed. */
function assertTexturedAutoOwnData(input:unknown):void {
 let nodes=0,bytes=0
 const visit=(value:unknown,depth:number):void=>{
  if(++nodes>16384||depth>24)throw new TypeError('Textured Auto descriptor bound')
  if(typeof value==='string'){bytes+=value.length*2;if(value.length>65536||bytes>1048576)throw new TypeError('Textured Auto descriptor text bound');return}
  if(value===null||typeof value==='number'||typeof value==='boolean'||value===undefined)return
  if(typeof value!=='object')throw new TypeError('Textured Auto descriptor DATA')
  const array=Array.isArray(value),prototype=Object.getPrototypeOf(value),keys=Reflect.ownKeys(value)
  if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)throw new TypeError('Textured Auto descriptor prototype')
  const length=array?Object.getOwnPropertyDescriptor(value,'length'):undefined
  if(array&&(!length||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value>4096||keys.length!==length.value+1)||!array&&keys.length>256)throw new TypeError('Textured Auto descriptor fields')
  for(const key of keys){if(typeof key!=='string'||key.length>128)throw new TypeError('Textured Auto descriptor key');bytes+=key.length*2;if(bytes>1048576)throw new TypeError('Textured Auto descriptor text bound');if(array&&key==='length')continue;if(array&&!/^(0|[1-9][0-9]*)$/.test(key))throw new TypeError('Textured Auto descriptor key');const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!Object.hasOwn(field,'value'))throw new TypeError('Textured Auto descriptor accessor');visit(field.value,depth+1)}
 }
 visit(input,0)
}
function compileDescriptor(descriptor:BrushDescriptor,context:SourceAuthorDescriptorContext,generic?:CanonicalTexturedAutoProgramBinding,rasterProfile?:CanonicalStrokeRasterProfile,materialCpuBudgetBytes?:number):SourceAuthorDescriptorResult {
  let data=descriptor.sourceStamp!
  const reject=(reason:string):SourceAuthorDescriptorResult=>({supported:false,reasons:[reason]})
  const soft=data?.version===2 && data.source?.kind==='softAuto'
  const gaussian=data?.version===2 && data.source?.kind==='gaussianAuto'
  const auto=data?.version===2 && (data.source?.kind==='defaultAuto'||gaussian||soft)
  const seededDensity=context.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE
  if(seededDensity&&(!data||data.version!==2||data.source.kind!=='defaultAuto'))return reject('seeded-density-default-auto-only')
  const pipe=descriptor.tip.animation?.mode==='incremental'||descriptor.tip.animation?.mode==='random'
  const texture=context.primaryTexture
  let pressure:CanonicalMaterialContextV5|CanonicalMaterialContextV6|undefined
  const nativeTexture=!!context.softPressurePrimaryTexture
  if(nativeTexture&&context.pressurePrimaryTexture)return reject('multiple-pressure-texture-contexts')
  try{if(context.softPressurePrimaryTexture)pressure=canonicalSoftNativeDefaultTexturedSourceMaterialContext(context.softPressurePrimaryTexture.context);else if(context.pressurePrimaryTexture)pressure=canonicalPressureTexturedSourceMaterialContext(context.pressurePrimaryTexture.context)}catch{return reject('invalid-pressure-texture-context')}
  if(pressure&&(context.fixedPrimaryTexture||texture||!auto||(nativeTexture?!soft:soft)||gaussian||pipe||context.asset||context.assets||seededDensity))return reject('pressure-texture-default-auto-only')
  let fixed:CanonicalMaterialContextV4|undefined
  try{if(context.fixedPrimaryTexture)fixed=canonicalTexturedSourceMaterialContext(context.fixedPrimaryTexture.context)}catch{return reject('invalid-fixed-texture-context')}
  if(fixed&&(texture||!auto||soft||gaussian||pipe||context.asset||context.assets||seededDensity))return reject('fixed-texture-default-auto-only')
  if(texture&&(auto||pipe||!context.asset))return reject('primary-texture-image-only')
  let genericData:ReturnType<typeof extractCanonicalTexturedAutoProgramData>|undefined
  if(generic){try{const programField=Object.getOwnPropertyDescriptor(generic,'strengthProgram');if(!programField||!Object.hasOwn(programField,'value'))return reject('generic-textured-auto-binding-accessor');const cost=sourceTexturedAutoProgramCpuBytes(programField.value);if(!Number.isSafeInteger(materialCpuBudgetBytes)||materialCpuBudgetBytes!<cost)return reject('pressure-material-cpu-budget');generic=captureTexturedAutoProgramBinding(generic);if(context.compileCurve||context.primaryTexture||context.fixedPrimaryTexture||context.pressurePrimaryTexture||context.softPressurePrimaryTexture||context.asset||context.assets||context.scale!==undefined||context.lodScale!==1||!auto||pipe||seededDensity||!rasterProfile||context.coverageProfile!==generic.source.coverageProfile)return reject('invalid-generic-textured-auto-context');const expected=canonicalTexturedAutoProgramBinding(descriptor,generic.descriptorSha256,generic.source.coverageProfile,{id:generic.patternAsset.id,size:generic.patternAsset.size},rasterProfile);if(canonicalBrushDescriptorJSON(expected)!==canonicalBrushDescriptorJSON(generic))return reject('generic-textured-auto-binding-mismatch');genericData=extractCanonicalTexturedAutoProgramData(descriptor,{pattern:{id:generic.patternAsset.id,size:generic.patternAsset.size}});if(!genericData.supported)return genericData;data=genericData.data;const bytes=sourceTexturedAutoProgramCpuBytes(generic.strengthProgram);if(!Number.isSafeInteger(materialCpuBudgetBytes)||materialCpuBudgetBytes!<bytes)return reject('pressure-material-cpu-budget')}catch{return reject('generic-textured-auto-binding-mismatch')}}
  const pressureData=pressure?(pressure.version===6?extractCanonicalSoftAutoNativeDefaultTextureProgramData(descriptor,{pattern:{id:pressure.assets[0].id,size:pressure.assets[0].size}}):extractCanonicalDefaultAutoPressureTextureProgramData(descriptor,{pattern:{id:pressure.assets[0].id,size:pressure.assets[0].size}})):undefined
  if(pressureData&&!pressureData.supported)return pressureData
  const material = genericData?.supported ? genericData : pressureData?.supported ? pressureData : fixed ? extractCanonicalDefaultAutoFixedTextureCapability(descriptor,{pattern:{id:fixed.assets[0].id,size:fixed.assets[0].size}}) : texture&&context.asset ? extractCanonicalPrimaryTextureCapability(descriptor,{primary:context.asset,pattern:texture.pattern}) : soft ? extractSoftAutoSourceDataCapability(descriptor) : gaussian ? extractGaussianAutoSourceDataCapability(descriptor) : auto ? (seededDensity?extractSeededDensityDefaultAutoSourceDataCapability(descriptor):extractDefaultAutoSourceDataCapability(descriptor))
    : pipe && context.assets ? (descriptor.tip.animation!.mode==='random'?extractCanonicalRandomImagePipeCapability(descriptor,context.assets):extractCanonicalIncrementalImagePipeCapability(descriptor,context.assets)) : context.asset ? extractCanonicalSinglePngCapability(descriptor, context.asset) : reject('image-source-asset-required')
  if (!material.supported) return material
  if(pressure){
    if(context.compileCurve)return reject('pressure-original-compiled-only')
    try{
      if(!pressureData?.supported||context.coverageProfile!==pressure.primarySource.coverageProfile)return reject('pressure-texture-source-context-mismatch')
      data=pressureData.data
      const cpu=pressureData.program.kind==='texture-pressure-native-default-v1'?sourceNativeDefaultMaterialProgramCpuBytes(pressureData.program):sourcePressureMaterialProgramCpuBytes(pressureData.program),budget=(context.softPressurePrimaryTexture??context.pressurePrimaryTexture)!.materialCpuBudgetBytes
      if(!Number.isSafeInteger(budget)||budget<cpu)return reject('pressure-material-cpu-budget')
      const expected=pressure.version===6?canonicalSoftAutoNativeDefaultTextureSourceBinding(descriptor,pressure.primarySource.descriptorSha256,pressure.primarySource.coverageProfile,{id:pressure.assets[0].id,size:pressure.assets[0].size},context.softPressurePrimaryTexture!.rasterProfile):canonicalDefaultAutoPressureTextureSourceBinding(descriptor,pressure.primarySource.descriptorSha256,pressure.primarySource.coverageProfile,{id:pressure.assets[0].id,size:pressure.assets[0].size},context.pressurePrimaryTexture!.rasterProfile)
      const actual=pressure.primarySource
      if(pressure.version===6&&canonicalBrushDescriptorJSON(expected)!==canonicalBrushDescriptorJSON(actual))return reject('native-default-source-context-mismatch')
      if(pressure.version!==6&&(!['descriptorId','descriptorVersion','descriptorSha256','brushScale','brushAngle','coverageProfile'].every(k=>Object.is(Reflect.get(expected,k),Reflect.get(actual,k)))
        ||!Object.keys(expected.source).every(k=>Object.is(Reflect.get(expected.source,k),Reflect.get(actual.source,k)))))return reject('pressure-texture-source-context-mismatch')
      const t=descriptor.texture!
      const pin=canonicalPressureCurvePrimaryTexturePin({kind:'canvasTexture',asset:t.id,law:'subtract-u8-v1',width:t.patternSize!.width,height:t.patternSize!.height,
        periodX:t.periodPx,periodY:t.periodPx,offsetX:t.offset!.x,offsetY:t.offset!.y,strength:'source-pressure-curve-v1'},pressure.assets)
      if(!Object.keys(pin).every(k=>Object.is(Reflect.get(pin,k),Reflect.get(pressure.primaryTexture,k))))return reject('pressure-texture-pattern-context-mismatch')
    }catch{return reject('pressure-texture-source-context-mismatch')}
  }
  if(fixed){
    try{
      if(context.coverageProfile!==fixed.primarySource.coverageProfile)return reject('fixed-texture-source-context-mismatch')
      const expected=canonicalDefaultAutoFixedTextureSourceBinding(descriptor,fixed.primarySource.descriptorSha256,fixed.primarySource.coverageProfile,{id:fixed.assets[0].id,size:fixed.assets[0].size},context.fixedPrimaryTexture!.rasterProfile)
      const actual=fixed.primarySource
      if(!['descriptorId','descriptorVersion','descriptorSha256','brushScale','brushAngle','coverageProfile'].every(k=>Object.is(Reflect.get(expected,k),Reflect.get(actual,k)))
        ||!Object.keys(expected.source).every(k=>Object.is(Reflect.get(expected.source,k),Reflect.get(actual.source,k))))return reject('fixed-texture-source-context-mismatch')
      if(!('capability'in material)||!('primaryTexture'in material.capability))return reject('fixed-texture-pattern-context-mismatch')
      const primaryTexture=material.capability.primaryTexture
      if(!Object.keys(primaryTexture).every(k=>Object.is(Reflect.get(primaryTexture,k),Reflect.get(fixed.primaryTexture,k))))return reject('fixed-texture-pattern-context-mismatch')
    }catch{return reject('fixed-texture-source-context-mismatch')}
  }
  if(auto && !(gaussian?['scalar-bionic-f64-fma-v1','neon64-f32-fma-v1','browser-number-coverage-v1']:['scalar-f64-fma-v1','neon64-f32-fma-v1','browser-number-coverage-v1',CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE]).includes(context.coverageProfile??''))return reject('explicit-auto-coverage-profile-required')
  if (!Number.isFinite(context.lodScale) || context.lodScale <= 0 || typeof context.colorIdentity !== 'string' || !context.colorIdentity.length
    || context.scale !== undefined && (!Number.isFinite(context.scale) || context.scale <= 0)) return reject('invalid-author-context')
  let spacingRefreshMs=50,timingRefreshMs=50
  if(context.inputProfile==='krita-freehand-no-smoothing-v1'){
    const spacingFlag=data.settings['PaintOpSettings/updateSpacingBetweenDabs']
    const airbrushFlag=data.settings['PaintOpSettings/isAirbrushing']
    if([spacingFlag,airbrushFlag].some(value=>value!==undefined&&value!=='true'&&value!=='false'))return reject('invalid-author-refresh-setting')
    const airbrushing=airbrushFlag==='true'
    if(airbrushing!==data.timing.enabled)return reject('inconsistent-author-airbrush-setting')
    spacingRefreshMs=spacingFlag==='true'?50:SOURCE_LONG_TIME
    timingRefreshMs=airbrushing?50:SOURCE_LONG_TIME
  }
  const programs:Record<string,SourceOptionProgramInput>={}
  try {
    for (const option of data.options) {
      const sensors=option.sensors.map(sensor=>{
        const needed=option.checked && option.useCurve && !sourceCurveIsIdentity(sensor.curve.points)
        // Native apply guards skip unchecked/disabled curve consumers entirely.
        const saved=data.compiled?.curves.find(c=>c.source.text===sensor.curve.text)
        const compiled=needed ? context.compileCurve?.(sensor.curve) ?? (saved && {version:(data.compiled?.version===2||(pressure||generic)&&(data.compiled?.version===3||data.compiled?.version===4))?'mapped-arm64-v3' as const:'native-sparselu-v1' as const,coefficients:saved.coefficients}) : undefined
        if (needed && (!compiled || !['native-sparselu-v1','mapped-arm64-v3'].includes(compiled.version))) throw new RangeError('native-curve-compiler-unavailable:'+option.id+':'+sensor.sourceSlot)
        return {id:sensor.id,length:sensor.length,periodic:sensor.periodic,angleOffset:sensor.angleOffset,lockedAngle:sensor.lockedAngle,
          curve:{points:sensor.curve.points,coefficients:compiled?.coefficients,...(compiled?.version==='mapped-arm64-v3'?{arithmetic:'installed-arm64-fused-v1' as const}:{})}}
      })
      const program={id:option.id,checked:option.checked,useCurve:option.useCurve,curveMode:option.curveMode,strength:option.strength,min:option.min,max:option.max,sensors}
      compileSourceOptionProgram(program)
      programs[option.id]=program
    }
    if (Object.keys(programs).length !== 9) return reject('native-option-program-unavailable')
    const rotation=data.options.find(o=>o.id==='Rotation')!
    const fan=rotation.checked && rotation.useCurve ? rotation.sensors.find(s=>s.id==='drawingAngle' && s.fanCorners) : undefined
    const brush={...data.brush,scale:context.scale ?? data.brush.scale}
    const role:SourceAuthorRoleProgram={id:'primary',...(pipe?{imagePipe:{mode:descriptor.tip.animation!.mode,frames:descriptor.tip.animation!.frames}}:{}),options:programs as unknown as SourceAuthorRoleProgram['options'],brush,
      ...(data.version===2 && data.source.kind==='softAuto'?{geometry:{kind:'softAuto' as const,source:data.source,coverageProfile:context.coverageProfile as 'scalar-f64-fma-v1'|'neon64-f32-fma-v1'|'browser-number-coverage-v1'}}:data.version===2 && data.source.kind==='gaussianAuto'?{geometry:{kind:'gaussianAuto' as const,source:data.source,coverageProfile:context.coverageProfile as 'scalar-bionic-f64-fma-v1'|'neon64-f32-fma-v1'|'browser-number-coverage-v1'}}:data.version===2 && data.source.kind==='defaultAuto'?{geometry:{kind:'defaultAuto' as const,source:data.source,coverageProfile:context.coverageProfile as 'scalar-f64-fma-v1'|'neon64-f32-fma-v1'|'browser-number-coverage-v1'|typeof CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE}}:data.version===2?{geometry:{kind:'image' as const}}:{}),
      ...(generic?{materialProgram:generic.strengthProgram,materialCpuBytes:sourceTexturedAutoProgramCpuBytes(generic.strengthProgram),materialCpuBudgetBytes:materialCpuBudgetBytes!,textureProgram:{strength:'recorded-grain-v1' as const,binding:generic}}:pressure&&pressureData?.supported?{materialProgram:pressureData.program,materialCpuBytes:pressureData.program.kind==='texture-pressure-native-default-v1'?sourceNativeDefaultMaterialProgramCpuBytes(pressureData.program):sourcePressureMaterialProgramCpuBytes(pressureData.program),materialCpuBudgetBytes:(context.softPressurePrimaryTexture??context.pressurePrimaryTexture)!.materialCpuBudgetBytes,textureProgram:{strength:'source-pressure-curve-v1' as const,context:pressure}}:fixed?{textureProgram:{strength:'fixed-one-v1' as const,context:fixed}}:texture?{textureProgram:{strength:'pressure-identity-v1' as const}}:{}),
      materialPolicy:generic?'textured-auto-program-v1':pressure?(pressure.version===6?'soft-auto-native-default-texture-v1':'default-auto-pressure-texture-v1'):fixed?'default-auto-fixed-texture-v1':texture?'png-pressure-texture-v1':soft?'soft-auto-fixed1-rng-free':gaussian?'gaussian-auto-fixed1-rng-free':auto?seededDensity?'default-auto-fixed1-seeded-density-v1':'default-auto-fixed1-rng-free':'png-fixed1-rng-free',lodScale:context.lodScale,
      scatterX:data.flags.scatterX,scatterY:data.flags.scatterY,mirrorX:data.flags.mirrorX,mirrorY:data.flags.mirrorY,indirectPainting:data.flags.indirectPainting,
      spacing:data.spacing,timing:data.timing,fanStepDegrees:fan?.fanStep,spacingRefreshMs,timingRefreshMs,
      material:{brushIdentity:auto?descriptor.id+'@'+descriptor.version:descriptor.tip.mask!,color:context.colorIdentity,softness:1,lightness:1,
        precisionLevel:data.precision.level,autoPrecision:data.precision.automatic,
        imprecisePosition:programs.Mirror.checked || programs.Scatter.checked || programs.Rotation.checked || data.timing.enabled,
        disableSubpixel:false,supportsCaching:!(seededDensity&&data.version===2&&data.source.kind==='defaultAuto'&&data.source.density!==1),solidColor:true,textureEnabled:data.flags.textureEnabled,sharpnessChecked:false}}
    const legacyId=descriptor.id+':'+descriptor.version+(generic?':textured-auto-program-v1':pressure?(pressure.version===6?':soft-auto-native-default-texture-v1:':':default-auto-pressure-texture-v1:')+pressure.primarySource.descriptorSha256:fixed?':default-auto-fixed-texture-v1':texture?':primary-texture-pressure-identity-v1':'')+(seededDensity?':'+CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE:'')
    const profileTag=rasterProfile===CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE?'n':rasterProfile===CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE?'b':undefined
    if(generic&&!profileTag)return reject('generic-textured-auto-raster-profile')
    const id=generic?['ta7',generic.descriptorSha256,generic.patternAsset.id.slice(6),generic.patternAsset.size,generic.patternAsset.width,generic.patternAsset.height,profileTag,generic.source.coverageProfile,generic.source.kind,generic.strengthProgram.kind].join(':'):legacyId
    if(generic&&id.length>256)return reject('generic-textured-auto-program-id-bound')
    const program={id,...(context.inputProfile!==undefined?{inputProfile:context.inputProfile}:{}),roles:[role]}
    // Same owner preflight as the eventual caller; no RNG/state mutation.
    new SourceStrokeAuthor(program)
    return {supported:true,program}
  } catch(error) { return reject(error instanceof Error ? error.message : 'unsupported-native-author-program') }
}
