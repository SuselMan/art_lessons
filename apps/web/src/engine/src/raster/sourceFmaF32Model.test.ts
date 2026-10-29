import {expect,it} from 'vitest'
import native from '../presets/fixtures/sourceArmFmaF32/host-fma.native.json'
import actual from '../presets/fixtures/sourceArmFmaF32/actual-frecps.native.json'
import {arm64FusedMultiplyAddF32Bits} from '../presets/sourceArmFmaF32'
import {sourceFiniteF32Components as d,sourceFmaF32Model as model,sourceFmaF32CompactModel as compact} from './sourceFmaF32Model'
const run=(a:number,b:number,c:number)=>{const expected=model(d(a),d(b),d(c));expect(compact(d(a),d(b),d(c)),`compact ${a}/${b}/${c}`).toBe(expected);return expected}
it('matches independent host true-fmaf finite output bits, including exact cancellation and double-round witnesses',()=>{for(const c of native.cases)expect(run(c[0],c[1],c[2]),JSON.stringify(c)).toBe(c[3])})
it('matches retained physical Samsung finite reciprocal-step subset',()=>{for(const c of actual.cases)expect(run(c[0],c[1],0x40000000)).toBe(c[2])})
it('matches exact integer oracle for deterministic raw finite random inputs and exponent extremes',()=>{
 let state=0x64ab1234;const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state}
 for(let i=0;i<12000;i++){const q=[next(),next(),next()].map(v=>(v&0x7f800000)===0x7f800000?(v^0x00800000)>>>0:v);expect(run(q[0],q[1],q[2])).toBe(arm64FusedMultiplyAddF32Bits(q[0],q[1],q[2]))}
 const edges=[0,0x80000000,1,0x80000001,0x007fffff,0x00800000,0x3f000000,0x3f800000,0xbf800000,0x7f7fffff,0xff7fffff]
 for(const a of edges)for(const b of edges)for(const c of edges)expect(run(a,b,c)).toBe(arm64FusedMultiplyAddF32Bits(a,b,c))
})
it('rejects nonfinite and malformed component inputs',()=>{expect(()=>d(0x7f800000)).toThrow();expect(()=>model({...d(0),significand:.5},d(0),d(0))).toThrow()})

it('covers every finite exponent bin at cancellation and tiny signed-tail midpoint boundaries',()=>{
 const view=new DataView(new ArrayBuffer(4))
 const bits=(n:number)=>{view.setFloat32(0,n,true);return view.getUint32(0,true)}
 const number=(n:number)=>{view.setUint32(0,n,true);return view.getFloat32(0,true)}
 for(let e=1;e<255;e++)for(const frac of [0,1,0x3fffff,0x7fffff]){
  const a=e*8388608+frac,b=0x3f800001,rounded=bits(number(a)*number(b))
  if(rounded<0x7f800000)for(const delta of [-1,0,1]){const c=rounded+delta;if(c>=0&&c<0x7f800000)expect(run(a,b,(c+0x80000000)>>>0)).toBe(arm64FusedMultiplyAddF32Bits(a,b,(c+0x80000000)>>>0))}
  for(const c of [1,0x80000001])expect(run(a,0x3fc00000,c)).toBe(arm64FusedMultiplyAddF32Bits(a,0x3fc00000,c))
 }
})
