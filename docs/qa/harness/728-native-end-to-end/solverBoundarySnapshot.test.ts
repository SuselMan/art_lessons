import {describe,it,expect} from 'vitest'
import {packBoundarySnapshot,validateBoundarySnapshot,compareBoundarySnapshot} from './solverBoundarySnapshot'
describe('bounded actual1536 solver checkpoint codec',()=>{
 it('retains every Q8 channel and rejects dimension/checksum mutations before GPU allocation',async()=>{
  const bytes=new Uint8Array(1536*1536*4);bytes[300]=17;bytes[301]=243;bytes[302]=1;bytes[303]=255
  const actual={index:0 as const,trace:[{kind:'copyRegionInto',args:[0,0,0,0,128,128]}],roles:['a','ca'].map(role=>({role,w:1536 as const,h:1536 as const,filter:'nearest' as const,bytes}))}
  const packed=await packBoundarySnapshot(actual);await validateBoundarySnapshot(packed);expect((await compareBoundarySnapshot(actual,packed)).rows.every(r=>r.exact)).toBe(true)
  await expect(validateBoundarySnapshot({...packed,roles:[{...packed.roles[0],w:1024 as never},packed.roles[1]]})).rejects.toThrow('Strict')
  await expect(validateBoundarySnapshot({...packed,roles:[{...packed.roles[0],sha256:'0'.repeat(64)},packed.roles[1]]})).rejects.toThrow('raw checksum')
  await expect(compareBoundarySnapshot({...actual,trace:[]},packed)).rejects.toThrow('dimensions/filter/rect/mode')
 },15000)
})
