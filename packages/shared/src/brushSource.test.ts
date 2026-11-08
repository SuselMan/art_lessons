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

it('captures and binds the author hatching background independently of receiver UI',()=>{
 const color:[number,number,number,number]=[12,34,56,128],raw:BrushSourceContext={version:1,background:color}
 const owned=copyBrushSourceContext(raw),key=brushSourceKey(owned);color[0]=99
 expect(owned.background).toEqual([12,34,56,128]);expect(Object.isFrozen(owned.background)).toBe(true)
 expect(key).not.toBe(brushSourceKey(raw));expect(isBrushSourceContext(owned)).toBe(true)
 for(const c of [[0,0,0],[0,0,0,256],[0,0,NaN,0],[0,0,.5,0]])expect(isBrushSourceContext({version:1,background:c})).toBe(false)
})


it('accepts only the immediate rotation-double persistence neighbour without changing source or seed integrity',()=>{
 const brushSource:BrushSourceContext={version:1,normalRotation:-0.0001621773962222628}
 expect(brushSourceKey(brushSource)).toBe('e3a9ade88089b464')
 const original:BrushSourceContext={version:1,normalRotation:-0.00016217739622226282}
 expect(brushSourceKey(original)).toBe('f87c3238926e9eb4')
 const packets=[
  {strokeId:'br1.bs1_f87c3238926e9eb4_9r5XUjeU2K.b77cef00.9cfb1d19',brushRandom:{version:1,sequentialSeed:3078418176,strokeSeed:2633702681}},
  {strokeId:'br1.bs1_f87c3238926e9eb4_0R7bKtbaqu.8c0af572.c380e582',brushRandom:{version:1,sequentialSeed:2349528434,strokeSeed:3280004482}},
 ]
 for(const values of packets){
  const op={type:'stroke',tool:'digitalBrush',...values,brushSource}
  expect(hasValidBrushSourceContext(op)).toBe(true);expect(hasValidBrushRandomContext(op)).toBe(true)
  expect(hasValidBrushRandomContext({...op,brushRandom:{...op.brushRandom,strokeSeed:0}})).toBe(false)
  expect(hasValidBrushSourceContext({...op,brushSource:{...brushSource,normalRotation:-0.00016217739622226277}})).toBe(false)
  expect(hasValidBrushSourceContext({...op,brushSource:{...brushSource,normalRotation:0}})).toBe(false)
  expect(hasValidBrushSourceContext({...op,brushSource:{...brushSource,background:[0,0,0,255]}})).toBe(false)
  expect(hasValidBrushSourceContext({...op,strokeId:values.strokeId.replace('f87c3238926e9eb4','0000000000000000')})).toBe(false)
 }
 expect(brushSource.normalRotation).toBe(-0.0001621773962222628)
 expect(brushSourceKey(brushSource)).toBe('e3a9ade88089b464')
})

it('keeps the one-ULP rotation exception symmetric and never applies it to projection opacity',()=>{
 const original:BrushSourceContext={version:1,normalRotation:.25,projection:[{id:'L',opacity:.5}]}
 const strokeId=createBrushSourceNonce('rotation_0123',original),op={tool:'digitalBrush',strokeId,brushSource:original}
 const bytes=new DataView(new ArrayBuffer(8));bytes.setFloat64(0,.25);const bits=bytes.getBigUint64(0)
 for(const delta of[-1n,1n]){bytes.setBigUint64(0,bits+delta);expect(hasValidBrushSourceContext({...op,brushSource:{...original,normalRotation:bytes.getFloat64(0)}})).toBe(true)}
 for(const delta of[-2n,2n]){bytes.setBigUint64(0,bits+delta);expect(hasValidBrushSourceContext({...op,brushSource:{...original,normalRotation:bytes.getFloat64(0)}})).toBe(false)}
 expect(hasValidBrushSourceContext({...op,brushSource:{...original,projection:[{id:'L',opacity:.5000000000000001}]}})).toBe(false)
})
