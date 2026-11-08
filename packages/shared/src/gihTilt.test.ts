import{describe,it,expect}from'vitest'
import{gihTiltIndex}from'./gihTilt.js'
describe('native-safe captured tilt arithmetic',()=>{
 it('accepts actual Catmull overshoot without clamping and keeps Qt5 ties',()=>{
  expect(gihTiltIndex(91.93536376953125,8)).toBe(372)
  expect(gihTiltIndex(-96.094,8)).toBe(-380)
  expect(gihTiltIndex(101.520,8)).toBe(410)
  expect(gihTiltIndex(-1,3)).toBe(0);expect(gihTiltIndex(1,3)).toBe(3)
 })
 it('checks F32 narrowing, qRound internal endpoints, shifted index and signed multiplication separately',()=>{
  expect(gihTiltIndex(16777214.25,256)).toBe(2147483520)
  for(const x of[16777214.75,16777216,-16777216,NaN,Infinity,-Infinity])expect(gihTiltIndex(x,256)).toBeUndefined()
  expect(gihTiltIndex(-16777215,256)).toBe(-2147483392)
  expect(gihTiltIndex(1073741824,2)).toBe(1073741825)
  expect(gihTiltIndex(1073741824,2,2)).toBeUndefined()
  expect(gihTiltIndex(1073741760,2,2)).toBe(1073741761)
  expect(gihTiltIndex(20000000,2)).toBeDefined();expect(gihTiltIndex(20000000,256)).toBeUndefined()
 })
})

it('rejects malformed non-number raw axes before float coercion',()=>{for(const axis of ['91',null,true,{},[]])expect(Reflect.apply(gihTiltIndex,undefined,[axis,8])).toBeUndefined()})
