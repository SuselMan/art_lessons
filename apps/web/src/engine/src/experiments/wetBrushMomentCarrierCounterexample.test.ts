import {it,expect} from 'vitest'
import {auditMomentRecords} from './wetBrushMomentGpu'
/** Literal Q8 oracle of current fieldOp mode1: fit(a+b), each record
 * independently normalized by its own maximum component. No proposed patch. */
function land(a:number[],b:number[]){const v=a.map((x,i)=>x+b[i]),peak=Math.max(255,...v);return new Uint8Array(v.map(x=>Math.round(x*255/peak)))}
it('unchanged coherent source fits preserve this fixture carrier; independent P/C fits after PB-only transport do not',()=>{
 const baseC=[40,90,30,100],filmC=[40,90,30,100],filmP=[100,100,100,100]
 const coherentP=[200,200,200,200],transportedP=[200,200,100,200]
 expect(auditMomentRecords(new Uint8Array(transportedP),new Uint8Array(baseC)).supported).toBe(true)
 expect(auditMomentRecords(new Uint8Array(filmP),new Uint8Array(filmC)).supported).toBe(true)
 const referenceP=land(coherentP,filmP),candidateP=land(transportedP,filmP),nextC=land(baseC,filmC)
 expect(referenceP).toEqual(new Uint8Array([255,255,255,255]));expect(candidateP).toEqual(new Uint8Array([255,255,170,255]));expect(nextC).toEqual(new Uint8Array([80,180,60,200]))
 expect(auditMomentRecords(referenceP,nextC).supported).toBe(true)
 expect(auditMomentRecords(candidateP,nextC)).toMatchObject({supported:false,violations:2,maxExcess:30})
 // RGB is optical moment normalized by its OWN C.A carrier, not P.B.
 expect([...nextC.subarray(0,3)].every(x=>x<=nextC[3])).toBe(true)
})
