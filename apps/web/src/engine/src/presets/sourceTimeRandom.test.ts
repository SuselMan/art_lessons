import {expect,it} from 'vitest'
import {sourceTimeRandomValue,type SourceTimeRandomSource} from './sourceTimeRandom'
const size=Object.freeze({kind:'grafettoSourceTime-v1',key:'primary/Size/fuzzy/0'}as const)
it('varies on stationary consecutive paint times rather than only20Hz generations',()=>{
 const values=[0,1,2,16.5,49.9,50,50.1].map(t=>sourceTimeRandomValue(size,123,t))
 expect(new Set(values).size).toBe(values.length);expect(values.every(v=>v>=0&&v<1)).toBe(true)
})
it('is replay/query-order independent and separates seed, component and query role',()=>{
 const keys=['primary/Size/fuzzy/0','primary/Rotation/fuzzy/0','primary/Rate/fuzzy/0','child/Size/fuzzy/0'].map(key=>Object.freeze({kind:'grafettoSourceTime-v1',key}as const))
 const values=keys.map(key=>sourceTimeRandomValue(key,42,123.456)),replayed=[...keys].reverse().map(key=>sourceTimeRandomValue(structuredClone(key),42,123.456)).reverse()
 expect(replayed).toEqual(values);expect(new Set(values).size).toBe(4);expect(sourceTimeRandomValue(size,43,123.456)).not.toBe(values[0])
})
it('uses fullF64 time bits, canonicalizes signed zero and does not cache mutable role names',()=>{
 expect(sourceTimeRandomValue(size,1,1)).not.toBe(sourceTimeRandomValue(size,1,1+Number.EPSILON))
 expect(sourceTimeRandomValue(size,1,0)).toBe(sourceTimeRandomValue(size,1,-0))
 const mutable={kind:'grafettoSourceTime-v1' as const,key:'Size'},first=sourceTimeRandomValue(mutable,1,10);mutable.key='Spacing';expect(sourceTimeRandomValue(mutable,1,10)).not.toBe(first)
 expect(sourceTimeRandomValue(size,0,Number.MAX_SAFE_INTEGER)).toBeGreaterThanOrEqual(0)
})
it('rejects absent/unrecorded time, seed and invalid role data',()=>{
 for(const time of [undefined,NaN,Infinity,-1,Number.MAX_SAFE_INTEGER+1])expect(()=>sourceTimeRandomValue(size,1,time)).toThrow('recorded')
 for(const seed of [undefined,-1,.5,4294967296])expect(()=>sourceTimeRandomValue(size,seed,0)).toThrow('seed')
 for(const key of ['', '\0', 'x'.repeat(129)])expect(()=>sourceTimeRandomValue({kind:'grafettoSourceTime-v1',key},1,0)).toThrow('role')
 expect(()=>sourceTimeRandomValue({kind:'old',key:'Size'}as unknown as SourceTimeRandomSource,1,0)).toThrow('role')
})
