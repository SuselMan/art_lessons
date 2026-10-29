import { expect,it } from 'vitest'
import native from './fixtures/sourceArmFmaF32/host-fma.native.json'
import actual from './fixtures/sourceArmFmaF32/actual-frecps.native.json'
import { arm64FusedMultiplyAddF32,arm64FusedMultiplyAddF32Bits } from './sourceArmFmaF32'
it('matches independent host true-fmaf output bits for all adversarial and random finite triples',()=>{
 expect(native.cases.length).toBeGreaterThan(10000)
 for(const [index,c]of native.cases.entries())expect(arm64FusedMultiplyAddF32Bits(c[0],c[1],c[2]),`host std::fma record${index}`).toBe(c[3])
})
it('matches actual Samsung finite FRECPS outputs as fma(-denominator,estimate,2)',()=>{
 expect(actual.checked).toBe(147392);expect(actual.wrong).toBe(0)
 for(const [index,c]of actual.cases.entries())expect(arm64FusedMultiplyAddF32Bits(c[0],c[1],0x40000000),`actual Samsung record${index}`).toBe(c[2])
})
it('rounds exactly once, rather than multiply-then-add or double-precision fma substitutes',()=>{
 const a=1+2**-23,b=1-2**-23
 expect(arm64FusedMultiplyAddF32(a,b,-1)).toBe(-(2**-46))
 expect(Math.fround(Math.fround(a*b)-1)).toBe(0)
 // Exact product is an F32 midpoint; tiny c changes which neighbor wins,
 // although binary64 loses c before the final binary32 rounding.
 expect(arm64FusedMultiplyAddF32Bits(0x3fc00000,0x3f800001,0x80000001)).toBe(0x3fc00001)
 expect(arm64FusedMultiplyAddF32(1.5,1+2**-23,-(2**-149))).toBe(1.5+2**-23)
 expect(Math.fround(1.5*(1+2**-23)-2**-149)).toBe(1.5+2**-22)
})
it('preserves cancellation, signed zero, underflow ties and overflow',()=>{
 expect(Object.is(arm64FusedMultiplyAddF32(-0,1,-0),-0)).toBe(true)
 expect(Object.is(arm64FusedMultiplyAddF32(-0,1,0),0)).toBe(true)
 expect(arm64FusedMultiplyAddF32Bits(0x3f800000,0x3f800000,0xbf800000)).toBe(0)
 expect(arm64FusedMultiplyAddF32Bits(1,0x3f000000,0)).toBe(0)
 expect(arm64FusedMultiplyAddF32Bits(3,0x3f000000,0)).toBe(2)
 expect(arm64FusedMultiplyAddF32Bits(0x80000001,0x3f000000,0x80000000)).toBe(0x80000000)
 expect(arm64FusedMultiplyAddF32Bits(0x007fffff,0x3f800000,1)).toBe(0x00800000)
 expect(arm64FusedMultiplyAddF32Bits(0x7f7fffff,0x40000000,0)).toBe(0x7f800000)
 expect(arm64FusedMultiplyAddF32Bits(0x7f7fffff,0x40000000,0xff7fffff)).toBe(0x7f7fffff)
 expect(arm64FusedMultiplyAddF32Bits(0x7f7fffff,0x3f800000,0x73000000)).toBe(0x7f800000)
 expect(arm64FusedMultiplyAddF32Bits(0x7f7fffff,0x3f800000,0x72ffffff)).toBe(0x7f7fffff)
})
it('rejects malformed raw values and all nonfinite inputs; numeric helper narrows only numbers',()=>{
 for(const invalid of [-1,.5,0x100000000,NaN,Infinity,0x7f800000,0xff800000,0x7fc00000])for(const position of [0,1,2]){const args:[number,number,number]=[0,0,0];args[position]=invalid;expect(()=>arm64FusedMultiplyAddF32Bits(...args)).toThrow(RangeError)}
 for(const value of [NaN,Infinity,1e100,'1'])expect(()=>arm64FusedMultiplyAddF32(value as number,1,0)).toThrow(RangeError)
})
