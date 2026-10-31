import {expect,it} from 'vitest'
import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE as D} from '@grafetto/shared'
import {freezeCanonicalSeededDefaultAutoPolicies,freezeCanonicalAutoPolicies} from './canonicalExecutionPolicy.js'
const policy={authorRasterProfile:G,allowedRecordedRasterProfiles:[G],fullHistoryFormat:'mixed-v2' as const,seededDefaultAuto:{coverageProfile:D,storedScale:1 as const},recordedSeededDefaultAutoProfile:D}
it('keeps old auto policy closed and requires explicit author/read profile closure',()=>{
 expect(freezeCanonicalSeededDefaultAutoPolicies({})).toEqual({})
 expect(()=>Reflect.apply(freezeCanonicalAutoPolicies,null,[{defaultAuto:{coverageProfile:D,storedScale:1}}])).toThrow()
 expect(freezeCanonicalSeededDefaultAutoPolicies(policy)).toEqual({seededDefaultAuto:policy.seededDefaultAuto,recordedSeededDefaultAutoProfile:D})
 for(const change of [{recordedSeededDefaultAutoProfile:undefined},{fullHistoryFormat:undefined},{allowedRecordedRasterProfiles:[]},{authorRasterProfile:undefined}])expect(()=>freezeCanonicalSeededDefaultAutoPolicies({...policy,...change})).toThrow()
 expect(freezeCanonicalSeededDefaultAutoPolicies({...policy,seededDefaultAuto:false})).toEqual({recordedSeededDefaultAutoProfile:D})
})
it('captures own data without invoking getters or accepting malformed policy',()=>{
 let calls=0
 for(const input of [{...policy,seededDefaultAuto:null},{...policy,seededDefaultAuto:{coverageProfile:D,storedScale:2}},{...policy,seededDefaultAuto:{coverageProfile:D,storedScale:1,extra:true}},Object.defineProperty({...policy},'seededDefaultAuto',{get(){calls++;return policy.seededDefaultAuto}})])expect(()=>Reflect.apply(freezeCanonicalSeededDefaultAutoPolicies,null,[input])).toThrow()
 const inherited=Object.create(policy);expect(()=>freezeCanonicalSeededDefaultAutoPolicies(inherited)).toThrow()
 expect(()=>Reflect.apply(freezeCanonicalSeededDefaultAutoPolicies,null,[{...policy,seededDefaultAuto:{...policy.seededDefaultAuto,[Symbol('extra')]:true}}])).toThrow()
 expect(calls).toBe(0)
 const frozen=freezeCanonicalSeededDefaultAutoPolicies(policy);expect(Object.isFrozen(frozen.seededDefaultAuto)).toBe(true)
})
