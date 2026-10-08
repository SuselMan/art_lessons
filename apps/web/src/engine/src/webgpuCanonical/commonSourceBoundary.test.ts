import {it,expect} from'vitest'
import {installCommonSourceImport} from'../../../../../../docs/qa/harness/728-native-end-to-end/commonSourceBoundary'
import {commonSourceShape} from'../../../../../../docs/qa/harness/728-native-end-to-end/commonSourceContract'
function fixture(){
 let id=0;const buffer=()=>({width:1024,height:1024,filter:'linear' as const,field:{id:id++}}),target=buffer(),entry={original:buffer(),coverage:buffer(),inkLoad:buffer(),inkSettled:null,inkColor:buffer(),colorSettled:null,strokeInk:null,inkBase:null,strokeColor:null,colorBase:null,inkDry:null,colorDry:null,filmGesture:1}
 const scratch={peek:()=>entry,gesture:1,materialGesture:1,pigmentInputsKnownZero:false,paints:new Set(['color']),brushTravel:[],wetContacts:[],foreignSources:null,dryCtx:null},args=[scratch,[{originX:0,originY:0,buffer:target}],{minX:1,minY:1,maxX:3,maxY:3},1,12,1,0,1,0,0,undefined,false,scratch,true]
 const fields=commonSourceShape(entry,target);for(const f of fields.fields)if(f.presence==='field')f.bytes=new Uint8Array(4194304)
 const payload={...fields,origin:[0,0] as const,scalarsJson:JSON.stringify(args.slice(2,10)),metadataJson:JSON.stringify({gesture:1,paints:['color'],brushTravel:[],wetContacts:[],foreignSources:null,dryCtx:null}),materialGesture:1,pigmentInputsKnownZero:false},uploads:unknown[]=[],calls:unknown[]=[],runner={backend:{upload:(...v:unknown[])=>uploads.push(v)},planner:{prepare:(...v:unknown[])=>calls.push(v)}}
 return{payload,runner,args,uploads,calls}
}
it('uploads every unique named input before one unchanged planner call',()=>{const f=fixture(),control=installCommonSourceImport(f.runner as never,f.payload);f.runner.planner.prepare(...f.args);expect(f.uploads).toHaveLength(5);expect(f.calls).toHaveLength(1);expect(control.uploadedBytes).toBe(5*4194304);control.detach()})
it('rejects full CPU metadata mismatch before ANY upload or planner dispatch',()=>{const f=fixture();f.payload.metadataJson='changed';const control=installCommonSourceImport(f.runner as never,f.payload);expect(()=>f.runner.planner.prepare(...f.args)).toThrow(/metadata/);expect(f.uploads).toHaveLength(0);expect(f.calls).toHaveLength(0);control.detach()})
