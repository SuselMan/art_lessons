import{it,expect}from'vitest'
import{sourceRgba8SeparableChannel,compositeRgba8,SOURCE_RGBA8_GENERIC_SC_PROFILE as profile,SOURCE_RGBA8_SCALAR4_Q_PROFILE}from'./sourceColorRgba8'
import{SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL as es1}from'../raster/sourceRgba8CompositeWebGL1'
import{SOURCE_RGBA8_COMPOSITE_GLSL as es3}from'../raster/sourceRgba8CompositeShader'
const Q=65535n,precision=10n**90n
const abs=(v:bigint)=>v<0n?-v:v
const nearest=(n:bigint,d:bigint)=>(n<0n?-1n:1n)*((2n*abs(n)+d)/(2n*d))
// Independent integer interval search, not production sqrt-trial implementation.
function root(n:bigint,degree:number,maximum:bigint):bigint{let lo=0n,hi=maximum+1n;while(hi-lo>1n){const mid=(lo+hi)/2n;if(mid**BigInt(degree)<=n)lo=mid;else hi=mid}return lo}
// Independently reconstruct mathematical coefficients in integer fixed precision.
// No import/read of the generated production table or native Math.cos/Math.PI.
function arctan(k:bigint):bigint{const x=precision/k,xx=x*x/precision;let term=x,sum=x,i=1n;for(;;i++){term=-term*xx/precision;const part=term/(2n*i+1n);if(part===0n)return sum;sum+=part}}
const pi=16n*arctan(5n)-4n*arctan(239n)
function cosWeight(byte:number):bigint{
 if(byte===85)return 32768n // Exact cos(pi/3)=1/2 half away, not finite-series sign.
 if(byte===170)return -32768n
 const x=pi*BigInt(byte)/255n;let term=precision,sum=precision,i=1n
 for(;;i++){term=-term*x*x/(precision*precision*(2n*i-1n)*(2n*i));if(term===0n)return nearest(sum*Q,precision);sum+=term}
}
const cos=Array.from({length:256},(_,i)=>cosWeight(i))
const interp=(s:number,d:number)=>Number(nearest((2n*Q-cos[s]-cos[d])*255n,4n*Q))
const tint=(s:number,d:number)=>{const x=BigInt(s)*257n,y=BigInt(d)*257n;const sqrt=root(y*Q,2,Q),sum=nearest(x*(Q-y),Q)+sqrt;return Number(nearest((sum>Q?Q:sum)*255n,Q))}
const fourth=(s:number,d:number)=>Number(root(BigInt(s)**4n+BigInt(d)**4n,4,303n)>255n?255n:root(BigInt(s)**4n+BigInt(d)**4n,4,303n))
it('defines immutable functional token and exact rational-angle cos ties without native Math intrinsics',()=>{
 expect(SOURCE_RGBA8_SCALAR4_Q_PROFILE).toBe('defined-scalar23-root-cos-q65535-v1')
 expect(cos[0]).toBe(Q);expect(cos[255]).toBe(-Q);expect(cos[85]).toBe(32768n);expect(cos[170]).toBe(-32768n)
 for(let s=0;s<256;s++){expect(cos[s]).toBe(-cos[255-s]);if(s)expect(cos[s]<=cos[s-1]).toBe(true)}
})
it('all65536pairs of each selectedscalar agree with independent BigInt integer-root/rational-cos reference',()=>{
 const cases=[['pNormB',fourth],['tintIfs',tint],['interpolation',interp],['interpolation2x',(s:number,d:number)=>{const inner=interp(s,d);return interp(inner,inner)}]]as const
 for(const[mode,reference]of cases){
  const actual=new Uint8Array(65536),expected=new Uint8Array(65536)
  for(let s=0;s<256;s++)for(let d=0;d<256;d++){const at=s*256+d;actual[at]=sourceRgba8SeparableChannel(mode,s,d);expected[at]=reference(s,d)}
  expect(actual).toEqual(expected)
 }
})
it('PNormB keeps exact fourth-power endpoints rather than driver pow below integer',()=>{
 for(let v=0;v<256;v++){expect(sourceRgba8SeparableChannel('pNormB',0,v)).toBe(v);expect(sourceRgba8SeparableChannel('pNormB',v,0)).toBe(v)}
})
it('interpolation2x retains materialized inner byte, not one unquantized trigonometric expression',()=>{
 for(let s=0;s<256;s++)for(const d of[0,1,76,127,128,170,254,255]){const inner=sourceRgba8SeparableChannel('interpolation',s,d);expect(sourceRgba8SeparableChannel('interpolation2x',s,d)).toBe(sourceRgba8SeparableChannel('interpolation',inner,inner))}
})
it('both actualshader modules contain identical resource-free helpers and route only4selected new IDs',()=>{
 const begin='// Defined scalar4 Q65535 browser law;',end='vec3 sourceRgba8VectorBlend('
 expect(es1.slice(es1.indexOf(begin),es1.indexOf(end))).toBe(es3.slice(es3.indexOf(begin),es3.indexOf(end)))
 for(const shader of[es1,es3]){
  expect(shader).toContain('if(mode==98.0)return sourceScalar4FourthRoot(s,d);')
  expect(shader).toContain('if(mode==102.0)return sourceScalar4Tint(s,d);')
  expect(shader).toContain('return sourceScalar4Interpolation(s,d)')
  expect(shader).toContain('sourceNormalIsqrt(sourceHsxProduct(root,1.0))')
  expect(shader).toContain('131070.0-sourceScalar4Cos(s)-sourceScalar4Cos(d)')
  expect(shader).not.toContain('floor(pow(pow(d,4.0)+pow(s,4.0),.25))')
 }
})
it('selectednewlaws keep existing GenericSC hiddenRGB/alpha shortcuts and maskopacity handling',()=>{
 for(const mode of['pNormB','tintIfs','interpolation','interpolation2x']as const){
  expect(compositeRgba8([1,254,127,255],[40,180,90,0],{mode,profile,opacity:1})).toEqual([1,254,127,255])
  expect(compositeRgba8([1,254,127,0],[40,180,90,160],{mode,profile,opacity:1})).toEqual([40,180,90,160])
  expect(compositeRgba8([1,254,127,255],[40,180,90,160],{mode,profile,opacity:1,mask:0})).toEqual([40,180,90,160])
 }
})
