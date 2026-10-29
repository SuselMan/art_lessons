import { expect,it } from 'vitest'
import native from './fixtures/sourceVector32/whole-buffer.native.json'
import steps from './fixtures/sourceVector32/reciprocal-step.native.json'
import { compositeSourceVector32,sourceVector32Partition,sourceVector32ReciprocalStep,type SourceVector32Input } from './sourceVector32'
const input=(c:typeof native.cases[number]):SourceVector32Input=>({profile:'optimized32-neon64-vector4-no-fma-v1',operator:(['over','alphaDarkenCreamy','alphaDarkenHard']as const)[c.op],source:new Uint8Array(c.src),destination:new Uint8Array(c.dst),mask:c.mask===null?undefined:new Uint8Array(c.mask),cols:c.cols,rows:c.rows,sourceStride:c.constant?0:c.cols*4+4,destinationStride:c.cols*4+4,maskStride:c.cols,sourceAlignment:c.sourceOffset,destinationAlignment:c.offset,opacity:c.opacity,averageOpacity:c.averageOpacity,flow:c.flow})
const bytes=new DataView(new ArrayBuffer(4)),number=(bits:number)=>{bytes.setUint32(0,bits,true);return bytes.getFloat32(0,true)},bits=(v:number)=>{bytes.setFloat32(0,v,true);return bytes.getUint32(0,true)}
it('matches actual Samsung closed-domain FRECPS and refined product records, not a formula-generated expectation',()=>{
 expect(steps.cases.length).toBeGreaterThan(256)
 for(const c of steps.cases){const step=sourceVector32ReciprocalStep(number(c.inputBits),number(c.estimateBits));expect(bits(step),`instruction record${c.index}`).toBe(c.stepBits);expect(bits(Math.fround(step*number(c.estimateBits)))).toBe(c.refinedBits)}
})
it('matches unchanged native whole-buffer scalar/vector/partition bodies for all operators',()=>{
 expect(native.cases).toHaveLength(2688)
 for(const [id,c]of native.cases.entries()){
  const q=input(c),before=q.destination.slice(),result=compositeSourceVector32(q)
  expect([...result.pixels],`native buffer${id}/op${c.op}`).toEqual(c.result)
  expect(result.partitions.reduce((n,p)=>n+p.prefix+p.tail,0)).toBe(c.scalar)
  expect(result.partitions.reduce((n,p)=>n+p.vectors,0)).toBe(c.vector)
  expect(q.destination).toEqual(before)
 }
})
it('keeps all-zero AlphaDarken packet early-return different from scalar hiddenRGB copy',()=>{
 const base=input(native.cases[0]);const source=new Uint8Array(Array.from({length:4},()=>[100,50,25,0]).flat()),destination=new Uint8Array(Array.from({length:4},()=>[9,8,7,0]).flat())
 const q={...base,operator:'alphaDarkenCreamy' as const,source,destination,rows:1,cols:4,sourceStride:16,destinationStride:16,mask:undefined,maskStride:4,opacity:1,averageOpacity:1,flow:1,destinationAlignment:0}
 expect([...compositeSourceVector32(q).pixels]).toEqual([...destination])
 expect([...compositeSourceVector32({...q,destinationAlignment:4}).pixels]).toEqual([...source])
})
it('preserves native narrow/misaligned threshold and source-constant alignment',()=>{
 expect(sourceVector32Partition(8,4,0,false)).toEqual({prefix:8,vectors:0,tail:0,sourceAligned:false})
 expect(sourceVector32Partition(9,4,0,false)).toEqual({prefix:3,vectors:1,tail:2,sourceAligned:false})
 expect(sourceVector32Partition(9,4,0,true).sourceAligned).toBe(true)
})
it('rejects oversized/truncated/misaligned inputs before output allocation or paint',()=>{
 const q=input(native.cases[0])
 for(const patch of [{rows:4097},{cols:4097},{rows:4096,cols:4096},{destinationAlignment:1},{sourceStride:3},{destination:new Uint8Array(0)},{source:new Uint8Array(4194305)},{opacity:NaN},{flow:Infinity},{operator:'unknown'}])expect(()=>compositeSourceVector32({...q,...patch}as SourceVector32Input)).toThrow()
 for(const args of [[0,0,0],[4,3,0],[4097,0,0]])expect(()=>sourceVector32Partition(args[0],args[1],args[2],false)).toThrow()
 expect(()=>sourceVector32ReciprocalStep(0,1)).toThrow()
 expect(()=>sourceVector32ReciprocalStep(1,4)).toThrow()
 expect(()=>sourceVector32ReciprocalStep(1,NaN)).toThrow()
 expect(()=>sourceVector32ReciprocalStep(.1,10)).toThrow()
})
