import {it,expect}from'vitest'
import{compositeRgba8,sourceRgba8SeparableChannel,sourceRgba8CompositeModeId,SOURCE_RGBA8_GENERIC_SC_PROFILE as profile}from'./sourceColorRgba8'
import{SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL as es1}from'../raster/sourceRgba8CompositeWebGL1'
import{SOURCE_RGBA8_COMPOSITE_GLSL as es3}from'../raster/sourceRgba8CompositeShader'
const modes=['lambertLighting','lambertLightingGamma22','combineNormal','tangentNormalmap']as const
it('appends vector IDs115..118 with both actual shaders and refuses scalar fallback',()=>{
 for(const[i,mode]of modes.entries()){
  expect(sourceRgba8CompositeModeId(mode)).toBe(115+i)
  expect(()=>sourceRgba8SeparableChannel(mode,64,192)).toThrow(RangeError)
  expect(()=>sourceRgba8SeparableChannel(mode,64,192)).toThrow('Normal vector mode requires RGB channels')
 }
 for(const shader of[es1,es3]){expect(shader).toContain('sourceNormalQuantized');expect(shader).toContain('sourceNormalIsqrt');expect(shader).toContain('sourceHsxProduct(q+1.0,q+1.0)')}
})
it('tangent normal retains exact native half offset instead of rounding Qhalf first',()=>{
 expect(compositeRgba8([0,0,0,255],[128,128,255,255],{mode:'tangentNormalmap',profile,opacity:1})).toEqual([1,1,0,255])
 expect(compositeRgba8([255,0,255,255],[0,255,0,255],{mode:'tangentNormalmap',profile,opacity:1})).toEqual([128,128,0,255])
})
it('reoriented vectors preserve source-height-zero guard and known diagonal directions',()=>{
 const dst=[40,180,90,255]as const
 expect(compositeRgba8([251,17,0,255],dst,{mode:'combineNormal',profile,opacity:1})).toEqual(dst)
 // Native real direction(1,1,-1)/sqrt3: normalized bytes201,201,54.
 expect(compositeRgba8([255,255,255,255],[255,255,255,255],{mode:'combineNormal',profile,opacity:1})).toEqual([201,201,54,255])
 // Native real direction(-1,-1,3)/sqrt11.
 expect(compositeRgba8([0,0,255,255],[255,255,255,255],{mode:'combineNormal',profile,opacity:1})).toEqual([89,89,243,255])
})
it('Lambert HSI ToneMapping retains black and white extremes',()=>{
 for(const mode of modes.slice(0,2)){
  expect(compositeRgba8([0,0,0,255],[255,255,255,255],{mode,profile,opacity:1})).toEqual([0,0,0,255])
  expect(compositeRgba8([255,255,255,255],[255,255,255,255],{mode,profile,opacity:1})).toEqual([255,255,255,255])
 }
})
it('all4 retain common vector alpha rather than scalar empty-destination shortcuts',()=>{
 for(const mode of modes){
  expect(compositeRgba8([1,254,127,255],[40,180,90,0],{mode,profile,opacity:1,mask:128})).toEqual([2,253,128,128])
  expect(compositeRgba8([1,254,127,0],[40,180,90,160],{mode,profile,opacity:1})).toEqual([40,180,90,160])
  expect(compositeRgba8([1,254,127,255],[40,180,90,160],{mode,profile,opacity:0})).toEqual([40,180,90,160])
 }
})

it('reoriented homogeneous normalization agrees with independent BigInt ratios and binary-search root',()=>{
 const Q=65535n,ratio=(n:bigint,d:bigint)=>{const negative=n<0n,a=negative?-n:n;const q=a/d,r=a%d;return(negative?-1n:1n)*(q+(2n*r>=d?1n:0n))}
 const root=(n:bigint)=>{let lo=0n,hi=131071n;while(hi-lo>1n){const mid=(lo+hi)/2n;if(mid*mid<=n)lo=mid;else hi=mid}return lo}
 const colors=[[0,0,0],[255,255,255],[128,128,128],[255,0,0],[0,255,0],[0,0,255],[1,2,3],[254,1,127],[40,180,90],[180,40,220]]as const
 for(const sc of colors)for(const dc of colors){
  const a=sc.map(v=>BigInt(v)*257n),b=dc.map(v=>BigInt(v)*257n);let expected:number[]=[...dc]
  if(a[2]!==0n){const t=[2n*a[0]-Q,2n*a[1]-Q,2n*a[2]],u=[Q-2n*b[0],Q-2n*b[1],2n*b[2]-Q];const dot=t.reduce((sum,v,i)=>sum+ratio(v*u[i],Q),0n);let h=t.map((v,i)=>ratio(v*dot,Q)-ratio(u[i]*t[2],Q));const max=h.reduce((m,v)=>{const a=v<0n?-v:v;return a>m?a:m},0n);if(max!==0n){h=h.map(v=>ratio(v*Q,max));const len=root(h.reduce((sum,v)=>sum+v*v,0n));expected=h.map(v=>{const c=ratio(v*Q,len)+Q;return Number(ratio((c<0n?0n:c>2n*Q?2n*Q:c)*255n,2n*Q))})}}
  expect(compositeRgba8([...sc,255],[...dc,255],{mode:'combineNormal',profile,opacity:1})).toEqual([...expected,255])
 }
})
