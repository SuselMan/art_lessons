import { SOURCE_LONG_TIME } from '../dabs/sourceDistanceTiming'
import { type CanonicalStrokeRasterProfile, canonicalTexturedSourceMaterialContext, canonicalDefaultAutoFixedTextureSourceBinding, extractCanonicalDefaultAutoFixedTextureCapability, type CanonicalMaterialContextV4, CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE, extractCanonicalPrimaryTextureCapability, extractSeededDensityDefaultAutoSourceDataCapability, extractCanonicalSinglePngCapability, extractCanonicalIncrementalImagePipeCapability, extractCanonicalRandomImagePipeCapability, extractDefaultAutoSourceDataCapability, extractGaussianAutoSourceDataCapability, extractSoftAutoSourceDataCapability, type BrushDescriptor, type SourceStampCurveData } from '@grafetto/shared'
import { sourceCurveIsIdentity, type SourceCurvePolynomial } from './sourceCurve'
import { compileSourceOptionProgram, type SourceOptionProgramInput } from './sourceOptionProgram'
import { SourceStrokeAuthor, type SourceAuthorRoleProgram, type SourceStrokeAuthorProgram } from './sourceStrokeAuthor'

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
  readonly asset?: { readonly id: string; readonly size: number }
  readonly assets?: readonly {readonly id:string;readonly size:number}[]
  /** Explicit compiler capability; absence rejects nonidentity curves.
   * Caller must bind its result to these exact points/corners/source reader. */
  readonly compileCurve?: (curve: SourceStampCurveData) => { readonly version: 'native-sparselu-v1' | 'mapped-arm64-v3'; readonly coefficients: SourceCurvePolynomial['coefficients'] } | undefined
}
export type SourceAuthorDescriptorResult = { readonly supported: true; readonly program: SourceStrokeAuthorProgram }
  | { readonly supported: false; readonly reasons: readonly string[] }
export function sourceStrokeAuthorDescriptor(descriptor: BrushDescriptor, context: SourceAuthorDescriptorContext): SourceAuthorDescriptorResult {
  const data=descriptor.sourceStamp!
  const reject=(reason:string):SourceAuthorDescriptorResult=>({supported:false,reasons:[reason]})
  const soft=data?.version===2 && data.source?.kind==='softAuto'
  const gaussian=data?.version===2 && data.source?.kind==='gaussianAuto'
  const auto=data?.version===2 && (data.source?.kind==='defaultAuto'||gaussian||soft)
  const seededDensity=context.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE
  if(seededDensity&&(!data||data.version!==2||data.source.kind!=='defaultAuto'))return reject('seeded-density-default-auto-only')
  const pipe=descriptor.tip.animation?.mode==='incremental'||descriptor.tip.animation?.mode==='random'
  const texture=context.primaryTexture
  let fixed:CanonicalMaterialContextV4|undefined
  try{if(context.fixedPrimaryTexture)fixed=canonicalTexturedSourceMaterialContext(context.fixedPrimaryTexture.context)}catch{return reject('invalid-fixed-texture-context')}
  if(fixed&&(texture||!auto||soft||gaussian||pipe||context.asset||context.assets||seededDensity))return reject('fixed-texture-default-auto-only')
  if(texture&&(auto||pipe||!context.asset))return reject('primary-texture-image-only')
  const material = fixed ? extractCanonicalDefaultAutoFixedTextureCapability(descriptor,{pattern:{id:fixed.assets[0].id,size:fixed.assets[0].size}}) : texture&&context.asset ? extractCanonicalPrimaryTextureCapability(descriptor,{primary:context.asset,pattern:texture.pattern}) : soft ? extractSoftAutoSourceDataCapability(descriptor) : gaussian ? extractGaussianAutoSourceDataCapability(descriptor) : auto ? (seededDensity?extractSeededDensityDefaultAutoSourceDataCapability(descriptor):extractDefaultAutoSourceDataCapability(descriptor))
    : pipe && context.assets ? (descriptor.tip.animation!.mode==='random'?extractCanonicalRandomImagePipeCapability(descriptor,context.assets):extractCanonicalIncrementalImagePipeCapability(descriptor,context.assets)) : context.asset ? extractCanonicalSinglePngCapability(descriptor, context.asset) : reject('image-source-asset-required')
  if (!material.supported) return material
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
        const compiled=needed ? context.compileCurve?.(sensor.curve) ?? (saved && {version:data.compiled?.version===2?'mapped-arm64-v3' as const:'native-sparselu-v1' as const,coefficients:saved.coefficients}) : undefined
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
      ...(fixed?{textureProgram:{strength:'fixed-one-v1' as const,context:fixed}}:texture?{textureProgram:{strength:'pressure-identity-v1' as const}}:{}),
      materialPolicy:fixed?'default-auto-fixed-texture-v1':texture?'png-pressure-texture-v1':soft?'soft-auto-fixed1-rng-free':gaussian?'gaussian-auto-fixed1-rng-free':auto?seededDensity?'default-auto-fixed1-seeded-density-v1':'default-auto-fixed1-rng-free':'png-fixed1-rng-free',lodScale:context.lodScale,
      scatterX:data.flags.scatterX,scatterY:data.flags.scatterY,mirrorX:data.flags.mirrorX,mirrorY:data.flags.mirrorY,indirectPainting:data.flags.indirectPainting,
      spacing:data.spacing,timing:data.timing,fanStepDegrees:fan?.fanStep,spacingRefreshMs,timingRefreshMs,
      material:{brushIdentity:auto?descriptor.id+'@'+descriptor.version:descriptor.tip.mask!,color:context.colorIdentity,softness:1,lightness:1,
        precisionLevel:data.precision.level,autoPrecision:data.precision.automatic,
        imprecisePosition:programs.Mirror.checked || programs.Scatter.checked || programs.Rotation.checked || data.timing.enabled,
        disableSubpixel:false,supportsCaching:!(seededDensity&&data.version===2&&data.source.kind==='defaultAuto'&&data.source.density!==1),solidColor:true,textureEnabled:data.flags.textureEnabled,sharpnessChecked:false}}
    const program={id:descriptor.id+':'+descriptor.version+(fixed?':default-auto-fixed-texture-v1':texture?':primary-texture-pressure-identity-v1':'')+(seededDensity?':'+CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE:''),...(context.inputProfile!==undefined?{inputProfile:context.inputProfile}:{}),roles:[role]}
    // Same owner preflight as the eventual caller; no RNG/state mutation.
    new SourceStrokeAuthor(program)
    return {supported:true,program}
  } catch(error) { return reject(error instanceof Error ? error.message : 'unsupported-native-author-program') }
}
