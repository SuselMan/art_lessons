import { expect,it } from 'vitest'
import inputCorpus from './fixtures/sourceVector32/whole-buffer.native.json'
import machine from './fixtures/sourceFused32/machine-corpus.native.json'
import witnesses from './fixtures/sourceFused32/witness-inputs.json'
import machineWitness from './fixtures/sourceFused32/machine-witness.native.json'
import alphaInputs from './fixtures/sourceFused32/alpha-boundary-inputs.json'
import machineAlpha from './fixtures/sourceFused32/machine-alpha.native.json'
import { compositeSourceFused32,type SourceFused32Input } from './sourceFused32'
import { compositeSourceVector32 } from './sourceVector32'
type Input={op:number;src:number[];dst:number[];mask:number[]|null;cols:number;rows:number;constant:number;offset:number;sourceOffset:number;opacity:number;averageOpacity:number;flow:number}
const input=(c:Input):SourceFused32Input=>({profile:'installed-arm64-vector32-fused-fpcr0-v1',operator:(['over','alphaDarkenCreamy','alphaDarkenHard']as const)[c.op],source:new Uint8Array(c.src),destination:new Uint8Array(c.dst),mask:c.mask===null?undefined:new Uint8Array(c.mask),cols:c.cols,rows:c.rows,sourceStride:c.constant?0:c.cols*4+4,destinationStride:c.cols*4+4,maskStride:c.cols,sourceAlignment:c.sourceOffset,destinationAlignment:c.offset,opacity:c.opacity,averageOpacity:c.averageOpacity,flow:c.flow})
it('matches every original installed kernel whole-buffer output, including prefix/tail and both wrappers',()=>{
 expect(machine.cases).toHaveLength(2688)
 expect(machine.librarySHA256).toBe('230ccf905226f4324ffdf8c7239e8be90f0506cfadda25393d1ba014ab0bb783')
 for(const c of machine.cases){const q=input(inputCorpus.cases[c.id]),before=q.destination.slice();expect([...compositeSourceFused32(q).pixels],`machine case${c.id}`).toEqual(c.pixels);expect(q.destination).toEqual(before)}
})
it('matches all discriminating installed-byte witnesses and preserves the distinct noFMA baseline',()=>{
 expect(machineWitness.cases).toHaveLength(72)
 let changedBytes=0
 for(const c of machineWitness.cases){
  const q=input(witnesses.cases[c.id]),actual=compositeSourceFused32(q),noFma=compositeSourceVector32({...q,profile:'optimized32-neon64-vector4-no-fma-v1'})
  expect([...actual.pixels],`fused witness${c.id}`).toEqual(c.pixels)
  expect(actual.partitions).toEqual(noFma.partitions)
  changedBytes+=actual.pixels.reduce((n,b,i)=>n+Number(b!==noFma.pixels[i]),0)
 }
 expect(changedBytes).toBe(1008)
})
it('matches independent installed-code alpha-boundary outputs across mask/average/flow/scalar/vector branches',()=>{
 expect(machineAlpha.cases).toHaveLength(137)
 let differingAlphaBytes=0
 for(const c of machineAlpha.cases){
  const q=input(alphaInputs.cases[c.id]),actual=compositeSourceFused32(q),noFma=compositeSourceVector32({...q,profile:'optimized32-neon64-vector4-no-fma-v1'})
  expect([...actual.pixels],`independent alpha case${c.id}/op${alphaInputs.cases[c.id].op}`).toEqual(c.pixels)
  differingAlphaBytes+=actual.pixels.reduce((n,b,i)=>n+Number(i%4===3&&b!==noFma.pixels[i]),0)
 }
 expect(differingAlphaBytes).toBeGreaterThan(137)
})
it('keeps profile admission explicit and shares bounded preflight',()=>{
 const q=input(inputCorpus.cases[0])
 expect(()=>compositeSourceFused32({...q,profile:'optimized32-neon64-vector4-no-fma-v1'as never})).toThrow()
 for(const patch of [{rows:4097},{cols:4097},{flow:NaN},{sourceStride:3},{destination:new Uint8Array(0)},{sourceAlignment:1}])expect(()=>compositeSourceFused32({...q,...patch})).toThrow()
})
