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
it('finite premultiplied optical base need not be a pointwise subset of fitted load',()=>{
 const base=[255,0,0,255],film=[0,255,0,255],load=land(base,film)
 expect([...load]).toEqual([128,128,0,255])
 expect(base[0]).toBeGreaterThan(load[0])
 expect(base.every(Number.isFinite)&&[...load].every(Number.isFinite)).toBe(true)
 expect(base.slice(0,3).every(x=>x<=base[3])).toBe(true)
 expect([...load.subarray(0,3)].every(x=>x<=load[3])).toBe(true)
 // A bounded nonnegative film over an unchanged red base cannot represent
 // a target whose red optical moment has been completely transported out.
 const target=[0,128,0,128]
 for(const green of [0,1,127,255])expect(land(base,[0,green,0,255])[0]).toBeGreaterThan(target[0])
})
it('conservative active transport does not justify declaring the whole current load settled',()=>{
 const beforeLoad=[100,0],settledSnapshot=[0,0],afterLoad=[75,25]
 expect(afterLoad.reduce((a,b)=>a+b,0)).toBe(beforeLoad.reduce((a,b)=>a+b,0))
 const mobile=afterLoad.map((x,i)=>Math.max(0,x-settledSnapshot[i]))
 const rebasedMobile=afterLoad.map((x,i)=>Math.max(0,x-afterLoad[i]))
 expect(mobile.reduce((a,b)=>a+b,0)).toBe(100)
 expect(rebasedMobile).toEqual([0,0])
})
it('a historical snapshot must be captured before FIRST transport, not refreshed per live chunk',()=>{
 const history=[20,0],load=[100,0],transported=[75,25]
 const mobile=(laid:number[],settled:number[])=>laid.map((v,i)=>Math.max(0,v-settled[i]))
 const snapshot=[...history]
 const continuation=[...transported]
 history[0]=continuation[0];history[1]=continuation[1] // technical continuation rebase
 expect(snapshot).toEqual([20,0])
 expect(mobile(transported,snapshot)).toEqual([55,25])
 expect(mobile(transported,history)).toEqual([0,0])
 // Changing chunk partition must not replace an already retained snapshot.
 const retain=(prior:number[]|null,current:number[])=>prior??[...current]
 expect(retain(snapshot,continuation)).toBe(snapshot)
 expect(retain(null,continuation)).toEqual([75,25]) // rejected late-capture example
 expect(load.reduce((a,b)=>a+b,0)).toBe(transported.reduce((a,b)=>a+b,0))
})
it('neither fixed nor jointly transported optical snapshots automatically conserve positive clamped mobile',()=>{
 const laid=[100,0],settled=[0,100]
 const positive=(a:number[],b:number[])=>a.reduce((sum,v,i)=>sum+Math.max(0,v-b[i]),0)
 const mixedLaid=[50,50],mixedSettled=[50,50]
 expect(laid.reduce((a,b)=>a+b,0)).toBe(mixedLaid.reduce((a,b)=>a+b,0))
 expect(settled.reduce((a,b)=>a+b,0)).toBe(mixedSettled.reduce((a,b)=>a+b,0))
 expect(positive(laid,settled)).toBe(100)
 expect(positive(mixedLaid,settled)).toBe(50)
 expect(positive(mixedLaid,mixedSettled)).toBe(0)
 // Signed differences sum to zero in BOTH states; clamp discards the negative
 // half. Conservation of raw records alone is not a mobile-budget proof.
 expect(laid.reduce((s,v,i)=>s+v-settled[i],0)).toBe(0)
 expect(mixedLaid.reduce((s,v,i)=>s+v-mixedSettled[i],0)).toBe(0)
})
