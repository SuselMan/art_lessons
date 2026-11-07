import {describe,it,expect} from 'vitest'
import {createBristleInkProfile} from './brushBristleInk'
import {prepareBristleSaturationTable,copyBristleSaturationTable,loadBristleSaturationTable,retireBristleSaturationTable,createBristleSaturationTableBinding,acquireBristleSaturationTableBinding,bristleSaturationTableValue,writeBristleSaturationGpuStripe} from './brushBristleSaturationTable'
const profile=()=>createBristleInkProfile({depletion:[0,.125,.25,.375,.5,.625,.75,1],useOpacity:true,useSaturation:true,useWeights:true,pressureWeight:.5,bristleLengthWeight:.5,bristleInkAmountWeight:.5,inkDepletionWeight:.5})
function fixture(){
 const p=profile(),compiled=prepareBristleSaturationTable(p)
 if(compiled.kind!=='ready')throw Error(compiled.reason)
 const bytes=copyBristleSaturationTable(compiled.table);let side=2;while(side*side<bytes.length)side*=2
 const plane=new Uint8Array(side*side);plane.set(bytes)
 return{p,compiled:compiled.table,plane,size:bytes.length}
}
const span={counter:0,initialInk:.8,samples:20,pressure:1.2,length:.7}
describe('compiled Bristle93 lookup, no client construction',()=>{
 it('loads the real compiled payload without inventing compiler quality and preserves arbitrary-counter queries',()=>{
  const f=fixture(),table=loadBristleSaturationTable(f.p,f.plane,f.size)
  expect('quality' in table).toBe(false);expect('quality' in f.compiled).toBe(true)
  for(const counter of [0,1,3,8,100000])for(const pressure of [0,.2,1,2])for(const index of [0,1,3,7,19]){
   const s={...span,counter,pressure}
   expect(bristleSaturationTableValue(table,f.p,s,index,.65)).toBe(bristleSaturationTableValue(f.compiled,f.p,s,index,.65))
  }
  const gpu=new Uint8Array(512*1024);writeBristleSaturationGpuStripe(table,0,128,gpu)
  const expected=new Uint8Array(gpu.length);writeBristleSaturationGpuStripe(f.compiled,0,128,expected)
  expect(gpu.byteLength).toBe(expected.byteLength)
  expect(gpu.every((byte,index)=>byte===expected[index])).toBe(true)
 })
 it('keeps only metadata in the validated binding and requires the exact raw owner on reacquisition',()=>{
  const f=fixture(),table=loadBristleSaturationTable(f.p,f.plane,f.size),binding=createBristleSaturationTableBinding(table)
  retireBristleSaturationTable(table)
  expect(()=>bristleSaturationTableValue(table,f.p,span,3,.7)).toThrow('issued')
  expect(()=>acquireBristleSaturationTableBinding(binding,f.plane.slice())).toThrow('resident')
  const next=acquireBristleSaturationTableBinding(binding,f.plane)
  expect(bristleSaturationTableValue(next,f.p,span,3,.7)).toBe(bristleSaturationTableValue(f.compiled,f.p,span,3,.7))
 })
 it('rejects wrong offsets, NaNs, positive infinity, noncanonical padding and non-F32 profiles',()=>{
  const f=fixture()
  for(const mutate of [(v:DataView)=>v.setUint32(44,72,true),(v:DataView)=>v.setFloat64(24,NaN,true),(v:DataView)=>v.setFloat32(v.getUint32(52,true),Infinity,true)]){
   const raw=f.plane.slice();mutate(new DataView(raw.buffer));expect(()=>loadBristleSaturationTable(f.p,raw,f.size)).toThrow('compiled')
  }
  const raw=f.plane.slice();raw[f.size]=1;expect(()=>loadBristleSaturationTable(f.p,raw,f.size)).toThrow('compiled')
  expect(()=>loadBristleSaturationTable(Object.freeze({...f.p,depletion:Object.freeze([0,.1,.25,.375,.5,.625,.75,1])}),f.plane,f.size)).toThrow('compiled')
 })
 it('retains absorbing negative-infinity nodes without NaNs at both parameter endpoints',()=>{
  const f=fixture(),v=new DataView(f.plane.buffer),rows=v.getUint32(8,true),segments=v.getUint32(12,true),base=v.getUint32(16,true),offset=v.getUint32(52,true)
  expect(segments).toBeGreaterThanOrEqual(3);expect(rows).toBeGreaterThan(1)
  // Rehashed/CAS-authenticated server bytes can legally contain absorbing logs.
  // Exercise genuine compiled layout; only internal node coefficients change.
  for(let row=0;row<rows;row++)for(let node=1;node<base;node++){
   v.setFloat32(offset+(row*(base-1)+node-1)*8,-Infinity,true)
   v.setFloat32(offset+(row*(base-1)+node-1)*8+4,-Infinity,true)
  }
  const table=loadBristleSaturationTable(f.p,f.plane,f.size)
  for(const pressure of [0,2])for(const length of [0,1])for(const index of [5,6]){
   const result=bristleSaturationTableValue(table,f.p,{...span,pressure,length},index,.9)
   expect(Number.isFinite(result)).toBe(true);expect(result).toBe(0)
  }
 })
})
