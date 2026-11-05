import { describe, expect, it } from 'vitest'
import { packDabs, unpackDabs, strokeDabs } from './dabCodec.js'
import { isStrokeEndSample } from './strokeEndSample.js'
import type { Dab, StrokeOperation } from './stroke.js'
const dab:Dab={x:20,y:30,pressure:1,tiltX:0,tiltY:0,size:48,aspectRatio:1,angle:0,opacity:1,t:0}
const bytes=(packed:string)=>Uint8Array.from(atob(packed.split(':')[1]),c=>c.charCodeAt(0))
const packed=(value:Uint8Array)=>'3:'+btoa(String.fromCharCode(...value))
describe('recorded source request geometry',()=>{
 it('retains the established little-endian v1/v2 wire fixtures exactly',()=>{
  expect(packDabs([dab])).toBe('1:AACgQQAA8EEAAIA/AAAAAAAAAAAAAEBCAACAPwAAAAAAAIA/AAAAAA==')
  expect(packDabs([{...dab,normalizedSpeed:0}])).toBe('2:AACgQQAA8EEAAIA/AAAAAAAAAAAAAEBCAACAPwAAAAAAAIA/AAAAAAAAAAA=')
  expect(unpackDabs('1:AACgQQAA8EEAAIA/AAAAAAAAAAAAAEBCAACAPwAAAAAAAIA/AAAAAA==')).toEqual([dab])
  expect(unpackDabs('2:AACgQQAA8EEAAIA/AAAAAAAAAAAAAEBCAACAPwAAAAAAAIA/AAAAAAAAAAA=')).toEqual([{...dab,normalizedSpeed:0}])
 })
 it('preserves absent channels, explicit zero scale/speed and fractional canonical input',()=>{
  const input=[dab,{...dab,sourceSize:1,sourceScale:0,normalizedSpeed:0},{...dab,sourceSize:24,sourceScale:.485944},{...dab,sourceSize:2.3,sourceScale:1}]
  const encoded=packDabs(input),out=unpackDabs(encoded)
  expect(encoded.startsWith('3:')).toBe(true)
  expect(bytes(encoded).length).toBe(52*input.length)
  expect(out[0]).toEqual(dab)
  expect(out[1]).toEqual(input[1])
  expect(out[2]).toEqual({...input[2],sourceScale:Math.fround(.485944)})
  expect(out[3].sourceSize).toBe(Math.fround(2.3))
  expect(packDabs(out)).toBe(encoded)
 })
 it.each([NaN,Infinity,-1,0,100001,Number.MIN_VALUE])('rejects unrepresentable source size %s',sourceSize=>{
  expect(()=>packDabs([{...dab,sourceSize}])).toThrow(/source size/)
  expect(()=>strokeDabs({dabs:[{...dab,sourceSize}]} as StrokeOperation)).toThrow(/source size/)
  expect(isStrokeEndSample({...dab,baseSize:48,sourceSize})).toBe(false)
 })
 it.each([NaN,Infinity,-1,1.01])('rejects malformed source scale %s',sourceScale=>{
  expect(()=>packDabs([{...dab,sourceScale}])).toThrow(/source scale/)
  expect(()=>strokeDabs({dabs:[{...dab,sourceScale}]} as StrokeOperation)).toThrow(/source scale/)
 })
 it('rejects corrupt source slots and truncated data before returning any prefix',()=>{
  const good=packDabs([{...dab,sourceSize:24,sourceScale:0}])
  for(const [offset,value]of [[44,0],[44,-2],[44,NaN],[48,-2],[48,Infinity],[48,2]]){
   const raw=bytes(good);new DataView(raw.buffer).setFloat32(offset,value,true)
   expect(()=>unpackDabs(packed(raw))).toThrow(/source/)
  }
  expect(()=>unpackDabs(packed(bytes(good).slice(0,-4)))).toThrow(/multiple of 52/)
 })
 it('does not confuse physical endpoint baseSize with quantized source allocation',()=>{
  const endpoint={...dab,size:.5,baseSize:.5,sourceSize:1,sourceScale:1}
  expect(isStrokeEndSample(endpoint)).toBe(true)
  const restored=unpackDabs(packDabs([endpoint]))[0]
  expect(restored.size).toBe(.5);expect(restored.sourceSize).toBe(1)
 })
})
