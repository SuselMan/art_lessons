import {describe,it,expect} from 'vitest'
import {compositeRgba8,SOURCE_RGBA8_COMPOSITE_MODES,SOURCE_RGBA8_GENERIC_SC_PROFILE as profile} from './sourceColorRgba8'
import type {Rgba8} from './mixWeightedRgba8'
import {SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL as es1} from '../raster/sourceRgba8CompositeWebGL1'
import {SOURCE_RGBA8_COMPOSITE_GLSL as es3} from '../raster/sourceRgba8CompositeShader'
const modes=SOURCE_RGBA8_COMPOSITE_MODES.slice(63,92)
const Q=65535n
// Independent exact BigInt rational implementation, no imports of production helpers.
const nearest=(n:bigint,d:bigint):bigint=>{const a=n<0n?-n:n;return(n<0n?-1n:1n)*((2n*a+d)/(2n*d))}
const low=(v:readonly bigint[])=>v.reduce((a,b)=>a<b?a:b)
const high=(v:readonly bigint[])=>v.reduce((a,b)=>a>b?a:b)
function referenceCf(index:number,s:Rgba8,d:Rgba8):number[]{
 const model=index<5?0:Math.floor((index-5)/8)+1,operation=index<5?[-1,3,4,6,7][index]:(index-5)%8
 const src=s.slice(0,3).map(x=>BigInt(x)*257n),dst=d.slice(0,3).map(x=>BigInt(x)*257n)
 const l=(v:readonly bigint[])=>model===0?low(v)+nearest((v[0]-low(v))*299n+(v[1]-low(v))*587n+(v[2]-low(v))*114n,1000n):model===1?nearest(high(v)+low(v),2n):model===2?high(v):nearest(v[0]+v[1]+v[2],3n)
 const saturation=(v:readonly bigint[])=>{
  const c=high(v)-low(v),sum=high(v)+low(v),den=Q-(sum>Q?sum-Q:Q-sum)
  if(model===0)return c
  if(model===1)return den>0n?nearest(c*Q,den):0n
  if(model===2)return high(v)>0n?nearest(c*Q,high(v)):0n
  return c>0n?Q-nearest(3n*low(v)*Q,v[0]+v[1]+v[2]):0n
 }
 const encode=(v:readonly bigint[])=>v.map(x=>Number(nearest((x<0n?0n:x>Q?Q:x)*255n,Q)))
 const sl=l(src),dl=l(dst)
 if(operation<0)return encode(src.map(x=>dl+nearest(x*(Q-dl),Q)))
 let v=operation===0||operation===1?[...src]:[...dst]
 if(operation>=1&&operation<=4){
  const ss=saturation(src),ds=saturation(dst),target=operation===1?ds:operation===2?ss:operation===3?ds+nearest((Q-ds)*ss,Q):nearest(ds*ss,Q)
  const minimum=low(v),span=high(v)-minimum;v=span>0n?v.map(x=>nearest((x-minimum)*target,span)):[0n,0n,0n]
 }
 const shift=operation<=4?dl-l(v):operation===5?sl-dl:operation===6?sl:sl-Q
 v=v.map(x=>x+shift)
 const L=l(v),minimum=low(v),maximum=high(v)
 if(minimum<0n)v=L<=0n||L-minimum<=0n?[0n,0n,0n]:v.map(x=>L+nearest((x-L)*L,L-minimum))
 if(maximum>Q)v=L>Q||maximum-L<=0n?(model===2?v.map(x=>x>Q?Q:x):[Q,Q,Q]):v.map(x=>L+nearest((x-L)*(Q-L),maximum-L))
 return encode(v)
}
const mul=(a:number,b:number)=>{const n=a*b+128;return Math.floor((Math.floor(n/256)+n)/256)}
const m3=(a:number,b:number,c:number)=>{const n=a*b*c+32603;return Math.floor((Math.floor(n/128)+n)/65536)}
function referencePixel(index:number,s:Rgba8,d:Rgba8,opacity=255,mask=255):number[]{
 const sa=m3(s[3],mask,opacity);if(!sa)return [...d]
 const alpha=sa+d[3]-mul(sa,d[3]),cf=referenceCf(index,s,d)
 return[...cf.map((v,i)=>{const n=(m3(255-sa,d[3],d[i])+m3(255-d[3],sa,s[i])+m3(d[3],sa,v))%256;return Math.floor((n*255+Math.floor(alpha/2))/alpha)%256}),alpha]
}
const colors:readonly Rgba8[]=[[0,0,0,255],[255,255,255,255],[128,128,128,255],[255,0,0,255],[0,255,0,255],[0,0,255,255],[255,255,0,255],[1,2,3,255],[254,1,127,255],[40,180,90,255],[180,40,220,255],[1,1,2,255],[2,1,1,255],[1,2,1,255],[254,254,255,255],[255,254,254,255]]
describe('HSX29 Q65535 staged deterministic browser law',()=>{
 it('matches independent rational BigInt graph across all29 and RGB/low-chroma endpoints',()=>{
  for(const [index,mode]of modes.entries())for(const s of colors)for(const d of colors)expect(compositeRgba8(s,d,{mode,profile,opacity:1})).toEqual(referencePixel(index,s,d))
 })
 it('retains exact shared vector-alpha shell under opacity/mask and hidden RGB',()=>{
  for(const [index,mode]of modes.entries())for(const s of colors.slice(7))for(const d of colors.slice(7)){
   const a:Rgba8=[s[0],s[1],s[2],128],b:Rgba8=[d[0],d[1],d[2],160]
   expect(compositeRgba8(a,b,{mode,profile,opacity:128/255,mask:127})).toEqual(referencePixel(index,a,b,128,127))
   expect(compositeRgba8([s[0],s[1],s[2],0],b,{mode,profile,opacity:1})).toEqual(b)
  }
 })
 it('uses identical exact-limb implementation in BOTH real shader modules, only newIDdispatch',()=>{
  const start='// HSX29-only deterministic Q65535 law:',end='// Functional normal4 Q65535,'
  for(const shader of[es1,es3]){expect(shader.indexOf(start)).toBeGreaterThanOrEqual(0);expect(shader.indexOf(end)).toBeGreaterThan(shader.indexOf(start))}
  expect(es1.slice(es1.indexOf(start),es1.indexOf(end))).toBe(es3.slice(es3.indexOf(start),es3.indexOf(end)))
  for(const text of [es1,es3]){
   expect(text).toContain('sourceHsxProduct')
   expect(text).toContain('float r=(n.x-p.x)*65536.0+(n.y-p.y)')
   expect(text).toContain('3.0*lo,65535.0,c.r+c.g+c.b')
   expect(text).toContain('65535.0-abs(hi+lo-65535.0)')
   expect(text).toContain('source*257.0')
   expect(text).toContain('if(mode>=63.0&&mode<=91.0)return sourceHsxQuantized')
   expect(text).not.toContain('sourceRgba8HsxExtended')
  }
 })
})
// Emulate actual highp trial division, keeping all product/residual operations exact limbs.
function limbProduct(a:number,b:number):readonly[number,number]{const ah=Math.floor(a/256),al=a-ah*256,bh=Math.floor(b/256),bl=b-bh*256,cross=ah*bl+al*bh,carry=Math.floor(cross/256),low=al*bl+(cross-carry*256)*256,high=ah*bh+carry,c=Math.floor(low/65536);return[high+c,low-c*65536]}
function pairedRound(a:number,b:number,d:number):number{
 const n=limbProduct(a,b);let q=Math.floor(Math.fround(Math.fround(Math.fround(n[0]*65536)+n[1])/d));const p=limbProduct(q,d);let r=(n[0]-p[0])*65536+n[1]-p[1]
 if(r<0){q--;r+=d}else if(r>=d){q++;r-=d}
 return q+(r*2>=d?1:0)
}
it('exact limb products and f32 trial correction preserve quotient/ties through full bounded numerator domain samples',()=>{
 const edges=[0,1,2,255,256,257,32767,32768,65534,65535,65536,131069,196605]
 for(const a of edges)for(const b of edges)if(a<=196605&&b<=65535){const p=limbProduct(a,b);expect(BigInt(p[0])*65536n+BigInt(p[1])).toBe(BigInt(a)*BigInt(b))
  for(const d of edges.filter(x=>x>0))if(a*b/d<=196605)expect(pairedRound(a,b,d)).toBe(Number(nearest(BigInt(a)*BigInt(b),BigInt(d))))
 }
 let state=1234567
 for(let i=0;i<4096;i++){
  state=(Math.imul(state,1664525)+1013904223)>>>0;const a=state%196606
  state=(Math.imul(state,1664525)+1013904223)>>>0;const b=state%65536
  state=(Math.imul(state,1664525)+1013904223)>>>0;const d=1+state%196605
  if(a*b/d<=196605)expect(pairedRound(a,b,d)).toBe(Number(nearest(BigInt(a)*BigInt(b),BigInt(d))))
 }
})
