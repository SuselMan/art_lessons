import {describe,it,expect} from'vitest'
import {commonSourceShape,validateCommonSourcePayload} from'../../../../../../docs/qa/harness/728-native-end-to-end/commonSourceContract'
import type {SettlePlanTile} from'../watercolor/SettlePlanContracts'
const buffer=()=>({width:1024,height:1024,filter:'linear' as const})
function entry(){return{original:buffer(),coverage:buffer(),inkLoad:buffer(),inkSettled:null,inkColor:buffer(),colorSettled:null,strokeInk:null,inkBase:null,strokeColor:null,colorBase:null,inkDry:null,colorDry:null,filmGesture:1} satisfies SettlePlanTile<ReturnType<typeof buffer>>}
describe('full common-source audit before upload',()=>{
 it('accounts only unique physical buffers and all named null roles',()=>{const e=entry(),s=commonSourceShape(e,e.original);expect(s.physicalBytes).toBe(16*1024*1024);expect(s.fields).toHaveLength(18);expect(s.fields.at(-1)?.alias).toBe(s.fields[0].alias)})
 it('requires full Q8 data and exact filters/nulls/film ownership',()=>{const a=commonSourceShape(entry(),buffer()),b=commonSourceShape(entry(),buffer());expect(()=>validateCommonSourcePayload(a,b)).toThrow(/payload/);for(const f of a.fields)if(f.presence==='field')f.bytes=new Uint8Array(4194304);expect(()=>validateCommonSourcePayload(a,b)).not.toThrow();b.filmGesture=2;expect(()=>validateCommonSourcePayload(a,b)).toThrow(/contract/)})
 it('rejects unknown sampler and out-of-bounds dimensions before snapshot',()=>{const e=entry();e.coverage.width=1536;expect(()=>commonSourceShape(e,buffer())).toThrow(/1024/);e.coverage.width=1024;(e.coverage as {filter?:string}).filter=undefined;expect(()=>commonSourceShape(e,buffer())).toThrow(/filter/)})
})
