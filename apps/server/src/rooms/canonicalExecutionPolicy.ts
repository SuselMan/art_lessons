import { CANONICAL_STROKE_RASTER_PROFILE, CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE,canonicalStrokeCoverageMatches,canonicalRecordedRasterProfiles, type CanonicalStrokeRasterProfile, type CanonicalAutoCoverageProfile, type CanonicalGaussianCoverageProfile } from '@grafetto/shared'
export interface CanonicalDefaultAutoExecutionPolicy { readonly coverageProfile:CanonicalAutoCoverageProfile; readonly storedScale:1 }
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
/** Execution config only. This does NOT open straight rooms or switch a renderer. */
export interface CanonicalRoomExecutionPolicy {
 readonly fullHistoryFormat?:'frames-v1'|'mixed-v2'
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

export function freezeCanonicalFullHistoryFormat(value:CanonicalRoomExecutionPolicy['fullHistoryFormat']):'frames-v1'|'mixed-v2'{
 if(value===undefined)return 'frames-v1'
 if(value!=='frames-v1'&&value!=='mixed-v2')throw TypeError('invalid explicit full history format')
 return value
}
