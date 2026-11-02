import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,canonicalStrokeRasterContract} from '@grafetto/shared'
import { CANONICAL_STROKE_RASTER_PROFILE, CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE,canonicalStrokeCoverageMatches,canonicalRecordedRasterProfiles, type CanonicalStrokeRasterProfile, type CanonicalAutoCoverageProfile, type CanonicalGaussianCoverageProfile } from '@grafetto/shared'
/** Seeded density requires a separately admitted consumer; keep current policy closed. */
export interface CanonicalDefaultAutoExecutionPolicy { readonly coverageProfile:Exclude<CanonicalAutoCoverageProfile,'neon64-f32-fma-seeded-density-v1'>; readonly storedScale:1 }
export interface CanonicalGaussianAutoExecutionPolicy { readonly coverageProfile:CanonicalGaussianCoverageProfile; readonly storedScale:1 }
/** One server-owned generator policy. Absence/false means disabled. */
export interface CanonicalAutoExecutionPolicies {
 readonly defaultAuto?:CanonicalDefaultAutoExecutionPolicy|false
 readonly gaussianAuto?:CanonicalGaussianAutoExecutionPolicy|false
 readonly softAuto?:CanonicalDefaultAutoExecutionPolicy|false
}
export function freezeCanonicalAutoPolicies(value:CanonicalAutoExecutionPolicies|false|undefined):Readonly<CanonicalAutoExecutionPolicies> {
 if(value===undefined||value===false)return Object.freeze({})
 const fail=():never=>{throw new TypeError('invalid explicit auto policy')}
 if(!value||typeof value!=='object'||Array.isArray(value)
   || ![Object.prototype,null].includes(Object.getPrototypeOf(value))
   ||Object.keys(value).some(k=>!['defaultAuto','gaussianAuto','softAuto'].includes(k)))return fail()
 for(const kind of ['defaultAuto','gaussianAuto','softAuto'] as const){
  const p=value[kind]
  if(p===undefined||p===false)continue
  if(!p||typeof p!=='object'||Object.keys(p).length!==2||!['coverageProfile','storedScale'].every(k=>Object.hasOwn(p,k))||p.storedScale!==1
    ||!(kind!=='gaussianAuto'?['scalar-f64-fma-v1','neon64-f32-fma-v1',CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE]:['scalar-bionic-f64-fma-v1','neon64-f32-fma-v1',CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE]).includes(p.coverageProfile))return fail()
 }
 return Object.freeze({...(value.defaultAuto?{defaultAuto:Object.freeze({...value.defaultAuto})}:{}),...(value.gaussianAuto?{gaussianAuto:Object.freeze({...value.gaussianAuto})}:{}),...(value.softAuto?{softAuto:Object.freeze({...value.softAuto})}:{})})
}
export type CanonicalFullHistoryFormat='frames-v1'|'mixed-v2'|'mixed-indexed-v1'

/** Execution config only. This does NOT open straight rooms or switch a renderer. */
export interface CanonicalRoomExecutionPolicy {
 readonly seededDefaultAuto?:false|Readonly<{coverageProfile:typeof CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE;storedScale:1}>
 readonly recordedSeededDefaultAutoProfile?:false|typeof CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE
 readonly primaryImageSource?:'single-inverse-gray-v2'|false
 readonly primaryTextureSource?:'pressure-identity-subtract-v3'|false
 readonly authorPrimaryTextureSource?:'pressure-identity-subtract-v3'|false
 readonly texturedAutoSource?:'textured-auto-material-v7'|false
 readonly authorTexturedAutoSource?:'textured-auto-material-v7'|false
 readonly softPressureTexturedSource?:'pressure-soft-auto-texture-v6'|false
 readonly authorSoftPressureTexturedSource?:'pressure-soft-auto-texture-v6'|false
 readonly pressureTexturedSource?:'pressure-default-auto-texture-v5'|false
 readonly authorPressureTexturedSource?:'pressure-default-auto-texture-v5'|false
 readonly texturedSource?:'fixed-default-auto-texture-v4'|false
 readonly authorTexturedSource?:'fixed-default-auto-texture-v4'|false
 readonly allowedRecordedImagePipeSources?:readonly CanonicalImagePipeSource[]
 readonly authorImagePipeSources?:readonly CanonicalImagePipeSource[]
 readonly fullHistoryFormat?:CanonicalFullHistoryFormat
 readonly rasterProfile?:CanonicalStrokeRasterProfile
 readonly authorRasterProfile?:CanonicalStrokeRasterProfile
 readonly allowedRecordedRasterProfiles?:readonly CanonicalStrokeRasterProfile[]
 readonly alphaDarkenVariants:readonly('creamy'|'hard')[]
 readonly autoSources?:CanonicalAutoExecutionPolicies|false
}
export const CANONICAL_ROOM_EXECUTION_POLICY:CanonicalRoomExecutionPolicy = Object.freeze({authorRasterProfile:CANONICAL_STROKE_RASTER_PROFILE,allowedRecordedRasterProfiles:Object.freeze([CANONICAL_STROKE_RASTER_PROFILE]),
 alphaDarkenVariants:Object.freeze(['creamy'] as const),autoSources:Object.freeze({})})

/** Legacy rasterProfile is a singleton author selector, never received data. */
export function freezeCanonicalRasterPolicy(value:Pick<CanonicalRoomExecutionPolicy,'rasterProfile'|'authorRasterProfile'|'allowedRecordedRasterProfiles'|'autoSources'>):Readonly<{authorRasterProfile:CanonicalStrokeRasterProfile;allowedRecordedRasterProfiles:readonly CanonicalStrokeRasterProfile[]}> {
 if(value.rasterProfile!==undefined&&value.authorRasterProfile!==undefined)throw TypeError('ambiguous explicit raster execution policy')
 const authorRasterProfile=value.authorRasterProfile===undefined?value.rasterProfile:value.authorRasterProfile
 if(authorRasterProfile===undefined)throw TypeError('missing explicit raster execution policy')
 const allowedRecordedRasterProfiles=canonicalRecordedRasterProfiles({allowedRasterProfiles:value.allowedRecordedRasterProfiles===undefined?[authorRasterProfile]:value.allowedRecordedRasterProfiles})
 if(!allowedRecordedRasterProfiles.includes(authorRasterProfile))throw TypeError('author raster profile unavailable')
 for(const source of Object.values(freezeCanonicalAutoPolicies(value.autoSources)))if(source&&!canonicalStrokeCoverageMatches(authorRasterProfile,source.coverageProfile))throw TypeError('raster/coverage execution policy mismatch')
 return Object.freeze({authorRasterProfile,allowedRecordedRasterProfiles})
}

export function freezeCanonicalFullHistoryFormat(value:CanonicalRoomExecutionPolicy['fullHistoryFormat']):CanonicalFullHistoryFormat{
 if(value===undefined)return 'frames-v1'
 if(value!=='frames-v1'&&value!=='mixed-v2'&&value!=='mixed-indexed-v1')throw TypeError('invalid explicit full history format')
 return value
}

/** Absence preserves historical image V1; no startup activation. */
export function freezeCanonicalPrimaryImagePolicy(value:CanonicalRoomExecutionPolicy['primaryImageSource']):'single-inverse-gray-v2'|false{
 if(value===undefined||value===false)return false
 if(value!=='single-inverse-gray-v2')throw TypeError('invalid explicit primary image execution policy')
 return value
}

/** Explicit server-only source subset; does not install the compatibility gate.
 * Keep DEFAULT OFF until whole-client minimum-protocol cutover before live3. */
export function freezeCanonicalPrimaryTexturePolicy(value:Pick<CanonicalRoomExecutionPolicy,'primaryTextureSource'|'primaryImageSource'|'authorRasterProfile'|'rasterProfile'|'allowedRecordedRasterProfiles'>):CanonicalRoomExecutionPolicy['primaryTextureSource'] {
 const field=Object.getOwnPropertyDescriptor(value,'primaryTextureSource')
 if(!field){if('primaryTextureSource'in value)throw TypeError('invalid explicit primary texture policy');return false}
 if(!Object.hasOwn(field,'value'))throw TypeError('invalid explicit primary texture policy')
 const selected=field.value
 if(selected===undefined||selected===false)return false
 if(selected!=='pressure-identity-subtract-v3'||value.primaryImageSource!=='single-inverse-gray-v2')throw TypeError('invalid explicit primary texture policy')
 const raster=freezeCanonicalRasterPolicy(value)
 if(raster.authorRasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE||!raster.allowedRecordedRasterProfiles.includes(CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE))throw TypeError('invalid explicit primary texture policy')
 return selected
}

/** Author selection is independently OFF; a configured read consumer is necessary. */
export function freezeCanonicalAuthorPrimaryTexturePolicy(value:Pick<CanonicalRoomExecutionPolicy,'authorPrimaryTextureSource'|'primaryTextureSource'|'primaryImageSource'|'authorRasterProfile'|'rasterProfile'|'allowedRecordedRasterProfiles'>):CanonicalRoomExecutionPolicy['authorPrimaryTextureSource'] {
 const field=Object.getOwnPropertyDescriptor(value,'authorPrimaryTextureSource')
 if(!field){if('authorPrimaryTextureSource'in value)throw TypeError('invalid explicit author primary texture policy');return false}
 if(!Object.hasOwn(field,'value'))throw TypeError('invalid explicit author primary texture policy')
 if(field.value===undefined||field.value===false)return false
 if(field.value!=='pressure-identity-subtract-v3'||freezeCanonicalPrimaryTexturePolicy(value)!==field.value)throw TypeError('invalid explicit author primary texture policy')
 return field.value
}

/** Independent fixed-auto read4/author4 gates, frozen once at startup. */
export function freezeCanonicalTexturedPolicies(value:CanonicalRoomExecutionPolicy):Readonly<Pick<CanonicalRoomExecutionPolicy,'texturedSource'|'authorTexturedSource'>> {
 const flag=(key:'texturedSource'|'authorTexturedSource')=>{
  const d=Object.getOwnPropertyDescriptor(value,key)
  if(!d){if(key in value)throw TypeError('invalid explicit material4 policy');return false as const}
  if(!Object.hasOwn(d,'value'))throw TypeError('invalid explicit material4 policy')
  if(d.value===undefined||d.value===false)return false as const
  if(d.value!=='fixed-default-auto-texture-v4')throw TypeError('invalid explicit material4 policy')
  return d.value as 'fixed-default-auto-texture-v4'
 }
 const texturedSource=flag('texturedSource'),authorTexturedSource=flag('authorTexturedSource')
 if(authorTexturedSource&&!texturedSource)throw TypeError('material4 author requires read consumer')
 if(texturedSource){
  const raster=freezeCanonicalRasterPolicy(value)
  if(!raster.allowedRecordedRasterProfiles.some(p=>canonicalStrokeRasterContract(p).genericSC))throw TypeError('material4 recorded raster unavailable')
  if(authorTexturedSource){
   const source=freezeCanonicalAutoPolicies(value.autoSources).defaultAuto
   if(!source||!canonicalStrokeRasterContract(raster.authorRasterProfile).genericSC||!canonicalStrokeCoverageMatches(raster.authorRasterProfile,source.coverageProfile))throw TypeError('material4 author source/raster unavailable')
  }
 }
 return Object.freeze({texturedSource,authorTexturedSource})
}

/** Separate read5/author5; old4 permission remains independent. */
export function freezeCanonicalPressureTexturedPolicies(value:CanonicalRoomExecutionPolicy):Readonly<Pick<CanonicalRoomExecutionPolicy,'pressureTexturedSource'|'authorPressureTexturedSource'>> {
 const flag=(key:'pressureTexturedSource'|'authorPressureTexturedSource')=>{
  const d=Object.getOwnPropertyDescriptor(value,key)
  if(!d){if(key in value)throw TypeError('invalid explicit material5 policy');return false as const}
  if(!Object.hasOwn(d,'value'))throw TypeError('invalid explicit material5 policy')
  if(d.value===undefined||d.value===false)return false as const
  if(d.value!=='pressure-default-auto-texture-v5')throw TypeError('invalid explicit material5 policy')
  return d.value as 'pressure-default-auto-texture-v5'
 }
 const pressureTexturedSource=flag('pressureTexturedSource'),authorPressureTexturedSource=flag('authorPressureTexturedSource')
 if(authorPressureTexturedSource&&!pressureTexturedSource)throw TypeError('material5 author requires read consumer')
 if(pressureTexturedSource){
  const raster=freezeCanonicalRasterPolicy(value)
  if(!raster.allowedRecordedRasterProfiles.some(p=>canonicalStrokeRasterContract(p).genericSC))throw TypeError('material5 recorded raster unavailable')
  if(authorPressureTexturedSource){
   const source=freezeCanonicalAutoPolicies(value.autoSources).defaultAuto
   if(!source||!canonicalStrokeRasterContract(raster.authorRasterProfile).genericSC||!canonicalStrokeCoverageMatches(raster.authorRasterProfile,source.coverageProfile))throw TypeError('material5 author source/raster unavailable')
  }
 }
 return Object.freeze({pressureTexturedSource,authorPressureTexturedSource})
}
export function freezeCanonicalSoftPressureTexturedPolicies(value:CanonicalRoomExecutionPolicy):Readonly<Pick<CanonicalRoomExecutionPolicy,'softPressureTexturedSource'|'authorSoftPressureTexturedSource'>> {
 const flag=(key:'softPressureTexturedSource'|'authorSoftPressureTexturedSource')=>{
  const d=Object.getOwnPropertyDescriptor(value,key)
  if(!d){if(key in value)throw TypeError('invalid explicit material6 policy');return false as const}
  if(!Object.hasOwn(d,'value'))throw TypeError('invalid explicit material6 policy')
  if(d.value===undefined||d.value===false)return false as const
  if(d.value!=='pressure-soft-auto-texture-v6')throw TypeError('invalid explicit material6 policy')
  return d.value as 'pressure-soft-auto-texture-v6'
 }
 const softPressureTexturedSource=flag('softPressureTexturedSource'),authorSoftPressureTexturedSource=flag('authorSoftPressureTexturedSource')
 if(authorSoftPressureTexturedSource&&!softPressureTexturedSource)throw TypeError('material6 author requires read consumer')
 if(softPressureTexturedSource){
  const raster=freezeCanonicalRasterPolicy(value)
  if(!raster.allowedRecordedRasterProfiles.some(p=>canonicalStrokeRasterContract(p).genericSC))throw TypeError('material6 recorded raster unavailable')
  if(authorSoftPressureTexturedSource){
   const source=freezeCanonicalAutoPolicies(value.autoSources).softAuto
   if(!source||!canonicalStrokeRasterContract(raster.authorRasterProfile).genericSC||!canonicalStrokeCoverageMatches(raster.authorRasterProfile,source.coverageProfile))throw TypeError('material6 author source/raster unavailable')
  }
 }
 return Object.freeze({softPressureTexturedSource,authorSoftPressureTexturedSource})
}

export type CanonicalImagePipeSource='incremental-inverse-gray-v2'|'random-inverse-gray-v2'
/** Server config only. Read permission never implicitly enables an author. */
export function freezeCanonicalImagePipePolicies(value:Pick<CanonicalRoomExecutionPolicy,'primaryImageSource'|'allowedRecordedImagePipeSources'|'authorImagePipeSources'>):Readonly<{allowedRecordedImagePipeSources:readonly CanonicalImagePipeSource[];authorImagePipeSources:readonly CanonicalImagePipeSource[]}>{
 const fail=():never=>{throw TypeError('invalid explicit image pipe policy')}
 const list=(field:'allowedRecordedImagePipeSources'|'authorImagePipeSources'):readonly CanonicalImagePipeSource[]=>{
  const descriptor=Object.getOwnPropertyDescriptor(value,field)
  if(!descriptor){if(field in value)return fail();return Object.freeze([])}
  if(!Object.hasOwn(descriptor,'value'))return fail()
  const input:unknown=descriptor.value
  if(input===undefined)return Object.freeze([])
  if(!Array.isArray(input)||input.length>2)return fail()
  const keys=Reflect.ownKeys(input)
  if(keys.length!==input.length+1||keys.some(k=>typeof k!=='string'||k!=='length'&&!/^(0|[1-9][0-9]*)$/.test(k)))return fail()
  const out:CanonicalImagePipeSource[]=[]
  for(let i=0;i<input.length;i++){
   const d=Object.getOwnPropertyDescriptor(input,String(i));if(!d||!Object.hasOwn(d,'value'))return fail()
   const item:unknown=d.value
   if(item!=='incremental-inverse-gray-v2'&&item!=='random-inverse-gray-v2'||out.includes(item))return fail()
   out.push(item)
  }
  return Object.freeze(out)
 }
 const allowedRecordedImagePipeSources=list('allowedRecordedImagePipeSources'),authorImagePipeSources=list('authorImagePipeSources')
 if((allowedRecordedImagePipeSources.length||authorImagePipeSources.length)&&value.primaryImageSource!=='single-inverse-gray-v2'
  ||authorImagePipeSources.some(item=>!allowedRecordedImagePipeSources.includes(item)))return fail()
 return Object.freeze({allowedRecordedImagePipeSources,authorImagePipeSources})
}

/** Separate opt-in. Source eligibility never implies a coverage grant. */
export function freezeCanonicalSeededDefaultAutoPolicies(value:Pick<CanonicalRoomExecutionPolicy,'seededDefaultAuto'|'recordedSeededDefaultAutoProfile'|'authorRasterProfile'|'rasterProfile'|'allowedRecordedRasterProfiles'|'fullHistoryFormat'>):Readonly<Pick<CanonicalRoomExecutionPolicy,'seededDefaultAuto'|'recordedSeededDefaultAutoProfile'>> {
 const fail=():never=>{throw TypeError('invalid explicit seeded default-auto policy')}
 const capture=(key:'seededDefaultAuto'|'recordedSeededDefaultAutoProfile'):unknown=>{const d=Object.getOwnPropertyDescriptor(value,key);if(!d){if(key in value)return fail();return undefined}if(!Object.hasOwn(d,'value'))return fail();return d.value}
 const author=capture('seededDefaultAuto'),recorded=capture('recordedSeededDefaultAutoProfile')
 if(author!==undefined&&author!==false){
  if(!author||typeof author!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(author))||Reflect.ownKeys(author).length!==2)return fail()
  const coverage=Object.getOwnPropertyDescriptor(author,'coverageProfile'),scale=Object.getOwnPropertyDescriptor(author,'storedScale')
  if(!coverage||!scale||!Object.hasOwn(coverage,'value')||!Object.hasOwn(scale,'value')||coverage.value!==CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE||scale.value!==1)return fail()
 }
 if(recorded!==undefined&&recorded!==false&&recorded!==CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE)return fail()
 if(author||recorded){
  if(value.fullHistoryFormat!=='mixed-v2'&&value.fullHistoryFormat!=='mixed-indexed-v1'||!value.allowedRecordedRasterProfiles?.includes(CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE))return fail()
  if(author&&(recorded!==CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE||(value.authorRasterProfile??value.rasterProfile)!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE))return fail()
 }
 return Object.freeze({...(author?{seededDefaultAuto:Object.freeze({coverageProfile:CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,storedScale:1 as const})}:{}),...(recorded?{recordedSeededDefaultAutoProfile:CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE}:{})})
}

/** Explicit independent generic Auto7 consumer/author configuration. */
export function freezeCanonicalTexturedAutoPolicies(value:CanonicalRoomExecutionPolicy):Readonly<Pick<CanonicalRoomExecutionPolicy,'texturedAutoSource'|'authorTexturedAutoSource'>> {
 const flag=(key:'texturedAutoSource'|'authorTexturedAutoSource')=>{
  const d=Object.getOwnPropertyDescriptor(value,key)
  if(!d){if(key in value)throw TypeError('invalid explicit material7 policy');return false as const}
  if(!Object.hasOwn(d,'value'))throw TypeError('invalid explicit material7 policy')
  if(d.value===undefined||d.value===false)return false as const
  if(d.value!=='textured-auto-material-v7')throw TypeError('invalid explicit material7 policy')
  return d.value as 'textured-auto-material-v7'
 }
 const texturedAutoSource=flag('texturedAutoSource'),authorTexturedAutoSource=flag('authorTexturedAutoSource')
 if(authorTexturedAutoSource&&!texturedAutoSource)throw TypeError('material7 author requires read consumer')
 if(texturedAutoSource){
  const raster=freezeCanonicalRasterPolicy(value)
  if(!raster.allowedRecordedRasterProfiles.some(p=>canonicalStrokeRasterContract(p).genericSC))throw TypeError('material7 recorded raster unavailable')
  if(authorTexturedAutoSource){
   const sources=freezeCanonicalAutoPolicies(value.autoSources)
   if(!canonicalStrokeRasterContract(raster.authorRasterProfile).genericSC||!Object.values(sources).some(source=>source&&canonicalStrokeCoverageMatches(raster.authorRasterProfile,source.coverageProfile)))throw TypeError('material7 author source/raster unavailable')
  }
 }
 return Object.freeze({texturedAutoSource,authorTexturedAutoSource})
}
