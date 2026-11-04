import {describe,it,expect} from 'vitest'
import {compositeRgba8,SOURCE_RGBA8_GENERIC_SC_PROFILE} from './sourceColorRgba8'
import type {Rgba8} from './mixWeightedRgba8'
const s:Rgba8=[201,77,19,0],d:Rgba8=[31,117,229,173]
const run=(mode:'copy'|'destinationIn'|'destinationAtop',source:Rgba8=s,opacity=1,mask=255)=>compositeRgba8(source,d,{mode,profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity,mask})
describe('native destructive RGBA endpoints precede generic zero shortcuts',()=>{
 it('transparent full Copy replaces hidden RGB and clears alpha, but opacity or group-mask zero is a no-op',()=>{
  expect(run('copy')).toEqual(s)
  expect(run('copy',s,0)).toEqual(d)
  expect(run('copy',s,1,0)).toEqual(d)
 })
 it('DestinationIn clears with zero source alpha, zero presentation opacity, or zero group mask',()=>{
  for(const result of [run('destinationIn'),run('destinationIn',[201,77,19,255],0),run('destinationIn',[201,77,19,255],1,0)])expect(result).toEqual([31,117,229,0])
 })
 it('DestinationAtop preserves hidden destination RGB for raw transparent source while clearing alpha',()=>{
  expect(run('destinationAtop')).toEqual([31,117,229,0])
  // Raw source alpha controls the RGB branch even when presentation opacity is zero.
  expect(run('destinationAtop',[201,77,19,255],0)).toEqual([86,104,161,0])
  expect(run('destinationAtop',[201,77,19,255],1,0)).toEqual([86,104,161,0])
 })
})

it('keeps Marker destination-relative RGB weight distinct from raw AlphaDarken deposition',()=>{
 const source:Rgba8=[255,0,0,128],destination:Rgba8=[0,0,255,64]
 const controls={profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity:1,flow:1,averageOpacity:1}as const
 expect(compositeRgba8(source,destination,{...controls,mode:'marker'})).toEqual([255,0,0,160])
 expect(compositeRgba8(source,destination,{...controls,mode:'rawAlphaDarken',alphaDarken:'creamy'})).toEqual([128,0,127,160])
 expect(()=>compositeRgba8(source,destination,{...controls,mode:'rawAlphaDarken'})).toThrow()
})
it('Dissolve requires actual world execution context and preserves deterministic opaque/transparent endpoints',()=>{
 const control={mode:'dissolve',profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity:1,seed:123}as const
 expect(()=>compositeRgba8([201,77,19,255],d,control)).toThrow('worldPoint')
 for(const worldPoint of [[0,0],[-1,63],[64,-65]]as const){
  expect(compositeRgba8([201,77,19,255],d,control,{worldPoint})).toEqual([201,77,19,255])
  expect(compositeRgba8(s,d,control,{worldPoint})).toEqual(d)
 }
})

// Independent native U8 staging reference: KoCompositeOpAlphaDarken.h calculateAlpha,
// KoCompositeOpMarker.h and KoAlphaDarkenParamsWrapper.h at pinned bd6e8d0.
// Rational BigInt byte arithmetic deliberately does not call production helpers.
const nativeMul=(a:number,b:number)=>Number((BigInt(a)*BigInt(b)+127n)/255n)
const floorDiv=(n:bigint,d:bigint)=>n>=0n?n/d:-((-n+d-1n)/d)
const nativeLerp=(a:number,b:number,t:number)=>a+Number(floorDiv(BigInt(b-a)*BigInt(t)+127n,255n))
const nativeDivide=(a:number,b:number)=>Number((BigInt(a)*255n+BigInt(Math.floor(b/2)))/BigInt(b))
const nativeByte=(x:number)=>Math.floor(Math.fround(Math.fround(Math.fround(x)*255)+.5))
function nativeRawReference(source:Rgba8,destination:Rgba8,kind:'creamy'|'hard'|'marker',opacity:number,average:number,flow:number,mask:number):Rgba8{
 const f=Math.fround,hard=kind==='hard',op=nativeByte(hard?f(f(flow)*f(opacity)):opacity),av=nativeByte(hard?f(f(flow)*f(average)):average),fb=nativeByte(flow)
 const masked=nativeMul(mask,source[3]),sa=nativeMul(masked,op),da=destination[3]
 let full:number
 if(av>op){const reverse=nativeDivide(da,av);full=av>da?nativeLerp(sa,av,reverse):da}
 else full=op>da?nativeLerp(da,op,masked):da
 const zero=hard?sa+da-nativeMul(sa,da):da,alpha=f(flow)===1?full:nativeLerp(zero,full,fb)
 const weight=kind==='marker'&&da?Math.min(255,nativeDivide(sa,da)):sa
 return[da?nativeLerp(destination[0],source[0],weight):source[0],da?nativeLerp(destination[1],source[1],weight):source[1],da?nativeLerp(destination[2],source[2],weight):source[2],alpha]
}
it('matches independently staged native hard/creamy/Marker flow and average branches over72 byte vectors',()=>{
 let cases=0
 for(const kind of ['creamy','hard','marker']as const)for(const flow of [0,.333,.7,1])for(const da of [0,64,255])for(const [opacity,average]of [[.5,.91],[.8,.2]]as const){
  const source:Rgba8=[211,23,97,173],destination:Rgba8=[17,199,61,da],mask=127
  const control={mode:kind==='marker'?'marker':'rawAlphaDarken',profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity,averageOpacity:average,flow,mask,...kind==='marker'?{}:{alphaDarken:kind}}as const
  expect(compositeRgba8(source,destination,control)).toEqual(nativeRawReference(source,destination,kind,opacity,average,flow,mask));cases++
 }
 expect(cases).toBe(72)
 // Hard wrapper multiplies primitive float controls BEFORE converting to U8.
 expect(nativeByte(Math.fround(Math.fround(.333)*Math.fround(.5)))).toBe(42)
 expect(nativeMul(nativeByte(.333),nativeByte(.5))).toBe(43)
})
