import {expect,it}from'vitest'
import {planSourceNative64FixedDab as plan,type SourceNative64Input}from'./sourceNative64Plan'
import {compositeSourceFused32}from'./sourceFused32'
import native from'./fixtures/sourceNative64Plan/packet-boundary.native.json'
const input=(x=125,y=0,width=7,height=1):SourceNative64Input=>({profile:'native64-fixed-rgba8-v1',channelMode:'all-unlocked',selection:'none',wrap:'none',source:{rect:{x,y,width,height},rowStride:width*4,byteLength:width*height*4,memory:{kind:'android-lp64-new-array-v1'}},destination:{offsetX:0,offsetY:0,memory:{kind:'krita-native64-pool16-v1'}},workerRects:[{x:0,y:0,width:128,height:128},{x:128,y:0,width:128,height:128}]})
it('preserves world worker fences and the actual offset0 versus offset1 packet counterexample',()=>{
 const zero=plan(input()),shift=plan({...input(),destination:{...input().destination,offsetX:1}})
 expect(zero.calls.map(c=>[c.x,c.cols,c.partitions[0].prefix,c.partitions[0].vectors,c.partitions[0].tail])).toEqual([[125,3,3,0,0],[128,4,0,1,0]])
 expect(shift.calls.map(c=>[c.x,c.cols,c.partitions[0].prefix,c.partitions[0].vectors,c.partitions[0].tail])).toEqual([[125,3,0,0,3],[128,1,1,0,0],[129,3,0,0,3]])
 expect(zero.calls[1].sourceByteOffset).toBe(12);expect(zero.calls[1].sourceRowStride).toBe(28);expect(zero.calls[1].partitions[0].sourceAligned).toBe(false)
 expect(zero.scope).toBe('source-zero-origin');expect(shift.scope).toBe('source-explicit-offset')
 expect(zero.workers).toEqual([{ordinal:0,firstCall:0,callCount:1},{ordinal:1,firstCall:1,callCount:1}])
})
it('uses floor tile coordinates and original odd-width source strides across negative rows',()=>{
 const q=input(-66,-65,9,3),p=plan({...q,workerRects:[{x:-128,y:-128,width:128,height:128}]})
 expect(p.calls.map(c=>[c.x,c.y,c.cols,c.rows,c.tileOriginX,c.tileOriginY])).toEqual([[-66,-65,2,1,-128,-128],[-64,-65,7,1,-64,-128],[-66,-64,2,2,-128,-64],[-64,-64,7,2,-64,-64]])
 expect(p.costs).toEqual({pixels:27,calls:4,rows:6})
 expect(p.calls[2].partitions.map(r=>[r.sourceByteOffset,r.sourceResidue,r.destinationResidue])).toEqual([[36,4,8],[72,8,8]])
 for(const c of p.calls){expect(c.sourceRowStride).toBe(36);expect(c.destinationRowStride).toBe(256);for(const r of c.partitions){expect(r.prefix+r.vectors*4+r.tail).toBe(c.cols);expect(r.destinationByteOffset+c.cols*4).toBeLessThanOrEqual(16384)}}
})
it('world64-aligned patch cuts preserve zero-origin tile partitions, including empty tails',()=>{
 const q=input(-1,0,130,66),single=plan({...q,workerRects:[{x:-128,y:0,width:384,height:128}]}),split=plan({...q,workerRects:[{x:-128,y:0,width:128,height:128},{x:0,y:0,width:128,height:128},{x:128,y:0,width:128,height:128},{x:999,y:999,width:0,height:0}]})
 const rows=(p:ReturnType<typeof plan>)=>p.calls.flatMap(c=>c.partitions.map(r=>[c.x,r.y,c.cols,r.prefix,r.vectors,r.tail,r.sourceByteOffset])).sort((a,b)=>a[1]-b[1]||a[0]-b[0])
 expect(rows(split)).toEqual(rows(single));expect(split.costs).toEqual({pixels:8580,calls:8,rows:264});expect(split.workers.at(-1)).toEqual({ordinal:3,firstCall:8,callCount:0})
})
it('requires explicit diagnostic memory/stride and validates original buffer extent',()=>{
 const q=input(0,0,4,2),padded={...q,source:{...q.source,rowStride:20,byteLength:36},workerRects:[{x:0,y:0,width:4,height:2}]}
 expect(()=>plan(padded)).toThrow();const p=plan({...padded,profile:'diagnostic-native64-fixed-rgba8-v1',source:{...padded.source,memory:{kind:'diagnostic-residue',residue:8}}})
 expect(p.scope).toBe('diagnostic-memory-or-stride');expect(p.calls[0].partitions.map(r=>r.sourceResidue)).toEqual([8,12])
 expect(p.sourceMinimumAllocationBytes).toBe(36);expect(p.sourceFreshPooledBytes).toBe(43)
 expect(()=>plan({...padded,profile:'diagnostic-native64-fixed-rgba8-v1',source:{...padded.source,byteLength:35}})).toThrow()
 const tiny=plan({...input(0,0,1,1),workerRects:[{x:0,y:0,width:1,height:1}]});expect(tiny.sourceVectorAlignmentRelevant).toBe(false);expect(tiny.sourceAlignmentKnown).toBe(false);expect(tiny.calls[0].partitions[0].sourceResidue).toBeNull();expect(tiny.calls[0].partitions[0].sourceAligned).toBeNull();expect(tiny.calls[0].partitions[0].vectors).toBe(0)
})
it('preflights budgets, overlapping paint regions and unsupported flags before span enumeration',()=>{
 const q=input(0,0,4096,4096);expect(()=>plan({...q,workerRects:[q.source.rect]})).toThrow()
 const small=input();expect(()=>plan({...small,budget:{rows:0}})).toThrow();expect(()=>plan({...small,budget:{calls:NaN}})).toThrow()
 expect(()=>plan({...small,workerRects:[small.source.rect,small.source.rect]})).toThrow()
 for(const bad of [{selection:'present'},{wrap:'around'},{channelMode:'alpha-locked'}])expect(()=>plan({...small,...bad}as SourceNative64Input)).toThrow()
 expect(()=>plan({...small,source:{...small.source,memory:{kind:'diagnostic-residue',residue:0}}})).toThrow()
 const outside=plan({...small,workerRects:[{x:999,y:999,width:5,height:5},{x:999,y:999,width:5,height:5}],budget:{rows:0,calls:0,pixels:0}});expect(outside.calls).toEqual([])
})
it('dispatches independent original ISA short/scalar and four-lane boundary outputs',()=>{
 for(const witness of native.cases){const c=witness.input,x=c.offset/4,q=input(x,0,c.cols,1),p=plan({...q,workerRects:[q.source.rect]});expect(p.calls).toHaveLength(1);const call=p.calls[0],row=call.partitions[0]
  const actual=compositeSourceFused32({profile:'installed-arm64-vector32-fused-fpcr0-v1',operator:'alphaDarkenCreamy',source:Uint8Array.from(c.src),destination:Uint8Array.from(c.dst),cols:c.cols,rows:1,sourceStride:call.sourceRowStride,destinationStride:256,maskStride:0,sourceAlignment:row.sourceResidue!,destinationAlignment:row.destinationResidue,opacity:c.opacity,averageOpacity:c.averageOpacity,flow:c.flow}).pixels
  expect([...actual]).toEqual(witness.pixels)
 }
 const vector=native.cases[2].pixels.slice(0,4),scalar=native.cases[1].pixels.slice(0,4);expect(vector).toEqual([235,78,85,0]);expect(scalar).toEqual([199,122,145,0])
})

it('matches 114 independently executed installed calls for planned native64 clips and odd source rows',async()=>{
 const directed=(await import('./fixtures/sourceNative64Plan/directed.native.json')).default
 expect(directed.proof.wrong).toBe(0);expect(directed.cases).toHaveLength(114)
 for(const group of directed.groups){const p=plan(group.input as SourceNative64Input);expect(p.calls).toHaveLength(group.caseIds.length)
  p.calls.forEach((call,k)=>{const {input:c,pixels}=directed.cases[group.caseIds[k]],actual=compositeSourceFused32({profile:'installed-arm64-vector32-fused-fpcr0-v1',operator:c.op===0?'over':c.op===1?'alphaDarkenCreamy':'alphaDarkenHard',source:Uint8Array.from(c.src),destination:Uint8Array.from(c.dst),cols:call.cols,rows:call.rows,sourceStride:call.sourceRowStride,destinationStride:call.destinationRowStride,maskStride:0,sourceAlignment:c.sourceOffset,destinationAlignment:c.offset,opacity:c.opacity,averageOpacity:c.averageOpacity,flow:c.flow})
   expect(call.cols).toBe(c.cols);expect(call.rows).toBe(c.rows);expect(actual.pixels).toEqual(Uint8Array.from(pixels))
   call.partitions.forEach((r,i)=>{expect(r.prefix).toBe(actual.partitions[i].prefix);expect(r.vectors).toBe(actual.partitions[i].vectors);expect(r.tail).toBe(actual.partitions[i].tail)})
  })
 }
 const assemble=(shapeIndex:number)=>{const g=directed.groups.find(g=>g.shapeIndex===shapeIndex&&g.op===1&&g.pattern===0)!,p=plan(g.input as SourceNative64Input),output=new Uint8Array(g.input.source.rect.width*4)
  p.calls.forEach((call,i)=>{const pixels=directed.cases[g.caseIds[i]].pixels;if(call.y===g.input.source.rect.y)output.set(pixels.slice(0,call.cols*4),(call.x-g.input.source.rect.x)*4)});return [...output]
 }
 expect(assemble(0)).toEqual([...Array(3).fill([199,122,145,0]).flat(),...Array(4).fill([235,78,85,0]).flat()])
 expect(assemble(1)).toEqual(Array(7).fill([199,122,145,0]).flat())
})
