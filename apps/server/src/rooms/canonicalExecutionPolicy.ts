import { CANONICAL_STROKE_RASTER_PROFILE, type CanonicalAutoCoverageProfile, type CanonicalGaussianCoverageProfile } from '@grafetto/shared'
export interface CanonicalDefaultAutoExecutionPolicy { readonly coverageProfile:CanonicalAutoCoverageProfile; readonly storedScale:1 }
export interface CanonicalGaussianAutoExecutionPolicy { readonly coverageProfile:CanonicalGaussianCoverageProfile; readonly storedScale:1 }
/** One server-owned generator policy. Absence/false means disabled. */
export interface CanonicalAutoExecutionPolicies {
 readonly defaultAuto?:CanonicalDefaultAutoExecutionPolicy|false
 readonly gaussianAuto?:CanonicalGaussianAutoExecutionPolicy|false
}
export function freezeCanonicalAutoPolicies(value:CanonicalAutoExecutionPolicies|false|undefined):Readonly<CanonicalAutoExecutionPolicies> {
 if(value===undefined||value===false)return Object.freeze({})
 const fail=():never=>{throw new TypeError('invalid explicit auto policy')}
 if(!value||typeof value!=='object'||Array.isArray(value)
   || ![Object.prototype,null].includes(Object.getPrototypeOf(value))
   ||Object.keys(value).some(k=>!['defaultAuto','gaussianAuto'].includes(k)))return fail()
 for(const kind of ['defaultAuto','gaussianAuto'] as const){
  const p=value[kind]
  if(p===undefined||p===false)continue
  if(!p||typeof p!=='object'||Object.keys(p).length!==2||!['coverageProfile','storedScale'].every(k=>Object.hasOwn(p,k))||p.storedScale!==1
    ||!(kind==='defaultAuto'?['scalar-f64-fma-v1','neon64-f32-fma-v1']:['scalar-bionic-f64-fma-v1','neon64-f32-fma-v1']).includes(p.coverageProfile))return fail()
 }
 return Object.freeze({...(value.defaultAuto?{defaultAuto:Object.freeze({...value.defaultAuto})}:{}),...(value.gaussianAuto?{gaussianAuto:Object.freeze({...value.gaussianAuto})}:{})})
}
/** Execution config only. This does NOT open straight rooms or switch a renderer. */
export interface CanonicalRoomExecutionPolicy {
 readonly rasterProfile:typeof CANONICAL_STROKE_RASTER_PROFILE
 readonly alphaDarkenVariants:readonly('creamy'|'hard')[]
 readonly autoSources?:CanonicalAutoExecutionPolicies|false
}
export const CANONICAL_ROOM_EXECUTION_POLICY:CanonicalRoomExecutionPolicy = Object.freeze({rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,
 alphaDarkenVariants:Object.freeze(['creamy'] as const),autoSources:Object.freeze({})})
