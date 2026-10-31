import {expect,it} from 'vitest'
import {advanceCanonicalMaterialPrefix,CANONICAL_MATERIAL_PREFIX_START,verifyCanonicalRecordedPrefix,type CanonicalRecordedPrefixFrame} from './canonicalRecordedPrefix.js'
function frames():CanonicalRecordedPrefixFrame[]{return[
 {operationId:'a',sequence:1,frameOrdinal:0,decoded:{entry:{phase:'between'},fences:[{at:0,kind:'segmentBegin',group:0}]}},
 {operationId:'b',sequence:50,frameOrdinal:1,decoded:{entry:{phase:'primary',group:0},fences:[{at:0,kind:'primaryEnd',group:0},{at:0,kind:'segmentEnd',group:0}]}},
 {operationId:'c',sequence:70,frameOrdinal:2,decoded:{entry:{phase:'between'},fences:[{at:0,kind:'gestureEnd'}]}},
]}
it('verifies open and closed decoded prefixes, allowing interleaved room seq without closing open ink',()=>{
 const rows=frames(),open=verifyCanonicalRecordedPrefix(rows.slice(0,1)),closed=verifyCanonicalRecordedPrefix(rows)
 expect(open).toMatchObject({recordedNext:1,ended:false,entry:{phase:'primary',group:0},firstSeq:1,lastSeq:1})
 expect(closed).toMatchObject({recordedNext:3,ended:true,firstOperationId:'a',lastOperationId:'c',endSeq:70,lastGroup:0})
 expect(Object.isFrozen(closed)).toBe(true);expect(Object.isFrozen(closed.entry)).toBe(true)
 expect(rows[0].decoded.entry).toEqual({phase:'between'})
})
it.each(['empty','first','middle','duplicateId','order','ordinal','phase','group','afterEnd'] as const)('rejects incomplete/conflicting %s prefix',kind=>{
 let rows=frames()
 if(kind==='empty')rows=[]
 if(kind==='first')rows=rows.slice(1)
 if(kind==='middle')rows.splice(1,1)
 if(kind==='duplicateId')rows[1]={...rows[1],operationId:'a'}
 if(kind==='order')rows[1]={...rows[1],sequence:1}
 if(kind==='ordinal')rows[1]={...rows[1],frameOrdinal:2}
 if(kind==='phase')rows[1]={...rows[1],decoded:{...rows[1].decoded,entry:{phase:'between'}}}
 if(kind==='group')rows[0]={...rows[0],decoded:{entry:{phase:'between'},fences:[{at:0,kind:'segmentBegin',group:1}]}}
 if(kind==='afterEnd')rows.push({...rows[2],operationId:'d',sequence:71,frameOrdinal:3})
 expect(()=>verifyCanonicalRecordedPrefix(rows)).toThrow('recorded prefix')
})
it('has no lifetime32 frame cap and matches incremental transition for 202 legal structural cuts',()=>{
 const rows:CanonicalRecordedPrefixFrame[]=Array.from({length:202},(_,n)=>({operationId:'cut'+n,sequence:2*n+1,frameOrdinal:n,decoded:{entry:{phase:'between'},fences:n===201?[{at:0,kind:'gestureEnd'}]:[]}}))
 let state=CANONICAL_MATERIAL_PREFIX_START
 for(const row of rows)state=advanceCanonicalMaterialPrefix(state,row.frameOrdinal,row.decoded)
 expect(verifyCanonicalRecordedPrefix(rows)).toMatchObject({...state,recordedNext:202,ended:true,endSeq:403})
})
