import { describe,expect,it } from 'vitest'
import type { Dab,StrokeOperation } from './stroke.js'
import { packDabs,unpackDabs,strokeDabs } from './dabCodec.js'
const dab:Dab={x:20,y:30,pressure:1,tiltX:0,tiltY:0,size:48,aspectRatio:1,angle:0,opacity:1,t:0}
const fields=['x','y','pressure','tiltX','tiltY','size','aspectRatio','angle','opacity','t'] as const
function payload(dabs:Dab[]):string{return packDabs(dabs).split(':')[1]}
function base64(bytes:Uint8Array):string{return btoa(String.fromCharCode(...bytes))}
describe('captured normalized speed wire compatibility',()=>{
 it('preserves exact v1 bytes and absence for historical strokes',()=>{
  const expected=new Uint8Array(40),view=new DataView(expected.buffer)
  fields.forEach((key,i)=>view.setFloat32(i*4,dab[key],true))
  expect(packDabs([dab])).toBe('1:'+base64(expected))
  expect(unpackDabs(packDabs([dab]))).toEqual([dab])
 })
 it('round-trips explicit zero, one, float32 and mixed absent values in v2',()=>{
  const input=[dab,{...dab,normalizedSpeed:0},{...dab,normalizedSpeed:1},{...dab,normalizedSpeed:0.123456789}]
  const packed=packDabs(input);expect(packed.startsWith('2:')).toBe(true)
  const got=unpackDabs(packed)
  expect(got[0]).not.toHaveProperty('normalizedSpeed')
  expect(got.slice(1).map(d=>d.normalizedSpeed)).toEqual([0,1,Math.fround(.123456789)])
  expect(unpackDabs(packDabs(got))).toEqual(got)
 })
 it('rejects malformed v2 values/stride and invalid public input rather than dropping it',()=>{
  for(const value of [NaN,Infinity,-1,1.01])expect(()=>packDabs([{...dab,normalizedSpeed:value}])).toThrow(/normalized speed/)
  for(const value of [NaN,Infinity,-2,1.01]){
   const bytes=Uint8Array.from(atob(payload([{...dab,normalizedSpeed:0}])),c=>c.charCodeAt(0))
   new DataView(bytes.buffer).setFloat32(40,value,true)
   expect(()=>unpackDabs('2:'+base64(bytes))).toThrow(/normalized speed/)
  }
  expect(()=>unpackDabs('2:'+payload([dab]))).toThrow(/multiple of 44/)
  expect(()=>strokeDabs({dabs:[{...dab,normalizedSpeed:Infinity}]} as StrokeOperation)).toThrow(/normalized speed/)
 })
})
