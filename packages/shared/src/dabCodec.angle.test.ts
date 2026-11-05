import { describe, expect, it } from 'vitest'
import { packDabs, unpackDabs, strokeDabs } from './dabCodec.js'
import { hasBrushSourceInputs, type BrushDescriptor } from './brushes.js'
import { isStrokeEndSample } from './strokeEndSample.js'
import type { Dab, StrokeOperation } from './stroke.js'

const dab:Dab={x:20,y:30,pressure:1,tiltX:0,tiltY:0,size:24,aspectRatio:1,angle:Math.PI/2,opacity:1,t:0}
const bytes=(packed:string)=>Uint8Array.from(atob(packed.split(':')[1]),c=>c.charCodeAt(0))
const packed=(raw:Uint8Array)=>'4:'+btoa(String.fromCharCode(...raw))
const brush={behavior:{version:2,strokeInput:{version:1,initialDirection:'cursorHistory'}}} as BrushDescriptor

describe('exact source direction wire channel',()=>{
 it('round-trips mixed optional angles as F64 while retaining legacy F32 angle',()=>{
  const input=[dab,...[0,-0,-1,Math.PI/2,Math.PI,-Math.PI,1e-12].map(sourceAngle=>({...dab,sourceAngle}))]
  const encoded=packDabs(input), out=unpackDabs(encoded)
  expect(encoded.startsWith('4:')).toBe(true)
  expect(bytes(encoded).length).toBe(input.length*60)
  expect(out[0].sourceAngle).toBeUndefined()
  input.slice(1).forEach((d,i)=>expect(Object.is(out[i+1].sourceAngle,d.sourceAngle)).toBe(true))
  expect(out[2].angle).toBe(Math.fround(dab.angle))
  expect(packDabs(out)).toBe(encoded)
 })
 it('preserves the integer allocation distinction demonstrated by a native fan angle',()=>{
  const extent=(angle:number)=>{const span=24*(Math.abs(Math.cos(angle))+Math.abs(Math.sin(angle))), near=Math.floor(span+.5);return Math.ceil(Math.abs(span-near)<1e-6?near:span)}
  const restored=unpackDabs(packDabs([{...dab,sourceAngle:Math.PI/2}]))[0]
  expect(extent(restored.angle)).toBe(25)
  expect(extent(restored.sourceAngle!)).toBe(24)
 })
 it.each([NaN,Infinity,-Infinity])('rejects invalid author/plain/endpoint angle %s',sourceAngle=>{
  expect(()=>packDabs([{...dab,sourceAngle}])).toThrow(/source angle/)
  expect(()=>strokeDabs({dabs:[{...dab,sourceAngle}]} as StrokeOperation)).toThrow(/source angle/)
  expect(isStrokeEndSample({...dab,baseSize:24,sourceAngle})).toBe(false)
 })
 it('rejects corrupt or truncated v4 before exposing any prefix',()=>{
  for(const invalid of [NaN,-Infinity]){
   const raw=bytes(packDabs([{...dab,sourceAngle:0}]));new DataView(raw.buffer).setFloat64(52,invalid,true)
   expect(()=>unpackDabs(packed(raw))).toThrow(/source angle/)
  }
  const raw=bytes(packDabs([{...dab,sourceAngle:0}]))
  expect(()=>unpackDabs(packed(raw.slice(0,-1)))).toThrow(/multiple of 60/)
  new DataView(raw.buffer).setFloat64(52,Infinity,true)
  expect(unpackDabs(packed(raw))[0].sourceAngle).toBeUndefined()
  expect(hasBrushSourceInputs(brush,unpackDabs(packed(raw)))).toBe(false)
 })
 it('requires angle for every opted-in request including endpoint-only and permits empty finals',()=>{
  expect(hasBrushSourceInputs(brush,[])).toBe(true)
  expect(hasBrushSourceInputs(brush,[{...dab,sourceAngle:0}])).toBe(true)
  expect(hasBrushSourceInputs(brush,[dab])).toBe(false)
  expect(hasBrushSourceInputs(brush,[],dab)).toBe(false)
  expect(hasBrushSourceInputs(brush,[],{...dab,sourceAngle:Math.PI})).toBe(true)
  expect(isStrokeEndSample({...dab,baseSize:24,sourceAngle:Math.PI})).toBe(true)
 })
})
