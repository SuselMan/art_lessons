import native from './fixtures/sourceRgbFmaByte/instruction.native.json'
import over from './fixtures/sourceRgbFmaByte/over.native.json'
import {arm64ReciprocalEstimateF32} from '../presets/sourceArmFrecpe'
import{expect,it}from'vitest'
import{arm64FusedMultiplyAddF32}from'../presets/sourceArmFmaF32'
import{sourceRgbFmaByteModel as model,sourceRgbFmaBytesModel}from'./sourceRgbFmaByteModel'
const view=new DataView(new ArrayBuffer(4)),bits=(v:number)=>{view.setFloat32(0,v,true);return view.getUint32(0,true)},number=(v:number)=>{view.setUint32(0,v,true);return view.getFloat32(0,true)}
const expected=(t:number,s:number,d:number)=>{const v=arm64FusedMultiplyAddF32(t,s-d,d),lo=Math.floor(v),frac=v-lo,q=frac<.5?lo:frac>.5?lo+1:lo+(lo-2*Math.floor(lo/2));return q-256*Math.floor(q/256)}
it('matches exact FMA then byte at every RGB pair and neighboring normal/extrapolated half-byte transitions',()=>{
 for(let s=0;s<256;s++)for(let d=0;d<256;d++){if(s===d)continue;for(const target of [(s+d)/2,(3*s-d)/2]){
  const k=Math.floor(target),t=(k+.5-d)/(s-d);if(t<0||t>2)continue;const center=bits(t)
  for(const delta of[-1,0,1]){const raw=center+delta;if(raw<0||raw>0x40000000)continue;{const actual=model(raw,s,d),wanted=expected(number(raw),s,d);if(actual!==wanted)throw Error(`${raw}/${s}/${d}: ${actual} != ${wanted}`)}}
 }}
},30000)
it('preserves double-rounding, +/-half boundaries, tiny coefficients and native low8 wrap',()=>{
 const coefficients=[0,0x80000000,1,0x7fffff,0x800000,0x3effffff,0x3f000000,0x3f000001,0x3f7fffff,0x3f800000,0x3f8038e0,0x3fc00000,0x40000000]
 for(const t of coefficients)for(const s of[0,1,2,127,128,254,255])for(const d of[0,1,2,127,128,254,255])expect(model(t,s,d)).toBe(expected(number(t),s,d))
 expect(sourceRgbFmaBytesModel(bits(2),[0,255,1],[255,0,254])).toEqual([1,254,4])
})
it('rejects malformed coefficients and channels',()=>{for(const t of[0xbf800000,0x40000001,0x7f800000,NaN,-1])expect(()=>model(t,0,0)).toThrow();for(const c of[-1,256,.5,NaN])expect(()=>model(0,c,0)).toThrow()})

it('matches independent original FMADD/FRINTI/FCVTNS instruction outputs and original whole Over overshoot cases',()=>{
 expect(native.caseCount).toBe(7961);expect(native.arithmeticHooks).toBe(0)
 for(const[t,s,d,wanted]of native.cases)expect(model(t,s,d)).toBe(wanted)
 let overshoots=0
 for(const{input:q,pixels}of over.cases){const f=Math.fround,S=f(q.src[3]*f(q.opacity)),alpha=arm64FusedMultiplyAddF32(f(S*f(255-q.dst[3])),f(1/255),q.dst[3]),t=f(S*arm64ReciprocalEstimateF32(alpha));if(t>1)overshoots++;expect(sourceRgbFmaBytesModel(bits(t),q.src.slice(0,3)as[number,number,number],q.dst.slice(0,3)as[number,number,number])).toEqual(pixels.slice(0,3))}
 expect(overshoots).toBeGreaterThan(0)
})
it('matches exact FMA at deterministic random raw coefficients and dense ordinary/extrapolated values',()=>{
 let state=0x52a3b891;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state}
 for(let i=0;i<30000;i++){const t=i%2?random()%0x40000001:bits(random()/2147483648),s=random()%256,d=random()%256;expect(model(t,s,d)).toBe(expected(number(t),s,d))}
})
