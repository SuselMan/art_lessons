import{describe,it,expect}from'vitest'
import{isBrushSourceContext,copyBrushSourceContext,brushSourceKey,createBrushSourceNonce,hasValidBrushSourceContext,type BrushSourceContext}from'./brushSource'
import{createBrushRandomStrokeId,hasValidBrushRandomContext}from'./brushRandom'
const source=():BrushSourceContext=>({version:1,projection:[{id:'bottom',opacity:.5},{id:'top',opacity:1}]})
const packet=()=>{const brushSource=source();return{tool:'digitalBrush',strokeId:createBrushRandomStrokeId(createBrushSourceNonce('nonce_012345',brushSource),{version:1,sequentialSeed:1,strokeSeed:2}),brushSource,brushRandom:{version:1 as const,sequentialSeed:1,strokeSeed:2}}}
describe('recorded external brush sources',()=>{
 it('binds sources and seeds independently to the same gesture',()=>{
  const p=packet();expect(hasValidBrushRandomContext(p)).toBe(true);expect(hasValidBrushSourceContext(p)).toBe(true)
  expect(hasValidBrushSourceContext({...p,brushSource:undefined})).toBe(false)
  expect(hasValidBrushSourceContext({...p,brushSource:{...p.brushSource,projection:[{id:'other',opacity:1}]}})).toBe(false)
  expect(hasValidBrushRandomContext({...p,brushRandom:{...p.brushRandom,strokeSeed:3}})).toBe(false)
 })
 it('is independent of object property order but preserves layer order',()=>{
  const s=source();expect(brushSourceKey(s)).toBe(brushSourceKey({projection:s.projection,version:1}))
  expect(brushSourceKey(s)).not.toBe(brushSourceKey({version:1,projection:[...s.projection!].reverse()}))
  const c=copyBrushSourceContext(s);expect(c).toEqual(s);expect(c.projection).not.toBe(s.projection);expect(c.projection![0]).not.toBe(s.projection![0])
 })
 it('rejects missing, duplicate, unbounded and unknown inputs',()=>{
  for(const v of [{version:1},{version:2,projection:[]},{version:1,projection:[{id:'x',opacity:NaN}]},{version:1,projection:[{id:'x',opacity:1},{id:'x',opacity:.5}]},{version:1,projection:[],extra:1},{version:1,gradient:'f'.repeat(2047)}])expect(isBrushSourceContext(v)).toBe(false)
  expect(isBrushSourceContext({version:1,projection:[]})).toBe(true)
  expect(isBrushSourceContext({version:1,gradient:'f'.repeat(2048)})).toBe(true)
 })
 it('does not require new metadata on historical gestures',()=>{
  expect(hasValidBrushSourceContext({tool:'pencil',strokeId:'old_nanoid'})).toBe(true)
  expect(hasValidBrushSourceContext({...packet(),strokeId:'old_nanoid'})).toBe(false)
 })
})

it('reuses trusted immutable contexts without cloning their palette per dab batch',()=>{
 const owned=copyBrushSourceContext({version:1,gradient:'f'.repeat(2048)})
 expect(copyBrushSourceContext(owned)).toBe(owned)
 expect(Object.isFrozen(owned)).toBe(true)
})
