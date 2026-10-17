import {expect,it} from 'vitest'
import type {Operation,StrokeOperation} from '@grafetto/shared'
import {OperationLog} from './OperationLog'
const wet=(id:string,userId:string,x:number):StrokeOperation=>({id,type:'stroke',userId,layerId:'L',strokeId:id,washId:'m70:L',timestamp:100,tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',color:[0,0,1],dabs:[{x,y:0,size:10,aspectRatio:1,angle:0,opacity:1,pressure:1,tiltX:0,tiltY:0,t:0}]})
const material=(log:OperationLog)=>log.watercolorEffectiveOperations().filter(op=>op.type==='stroke').map(op=>[op.id,op.preset])
function apply(log:OperationLog,op:Operation){
 log.append(op,{serverSeq:op.seq},false)
 if(op.type==='operation_undo')log.applyUndo(op.targetOpId,op.userId)
 if(op.type==='operation_redo')log.applyRedo(op.targetOpId,op.userId)
}
for(const kind of ['dry','hide'] as const)for(const author of ['A','C'])it(`#775/#779 ${kind}/${author}: rejected and late-confirmed boundary controls preserve prior eligibility`,()=>{
 const log=new OperationLog(),accepted:Operation[]=[];let seq=0,id=0
 const accept=(op:Operation)=>{const confirmed={...op,seq:++seq};accepted.push(confirmed);apply(log,confirmed)}
 const control=(type:'operation_undo'|'operation_redo',targetOpId:string,userId=author):Operation=>({id:`control-${++id}`,type,targetOpId,userId,timestamp:100})
 const compare=()=>{
  const oracle=new OperationLog();for(const op of accepted)apply(oracle,op)
  expect(material(log)).toEqual(material(oracle))
  const cold=new OperationLog();cold.absorbHistorical(log.entries.filter(entry=>entry.serverSeq!==undefined).map(entry=>({...entry.op,seq:entry.serverSeq})))
  expect(material(cold)).toEqual(material(oracle))
 }
 const optimistic=(op:Operation)=>{log.append(op,{pending:true},false);if(op.type==='operation_undo')log.applyUndo(op.targetOpId,op.userId);if(op.type==='operation_redo')log.applyRedo(op.targetOpId,op.userId)}
 accept(wet('a','A',0))
 accept(kind==='dry'?{id:'boundary',type:'paper_dry',layerId:'L',userId:author,timestamp:110}:{id:'boundary',type:'layer_visibility',layerId:'L',userId:author,timestamp:110,visible:false})
 accept({...wet('b','B',5),timestamp:120})
 accept(control('operation_undo','boundary'));accept(control('operation_undo','a','A'))
 const protectedMaterial=material(log);expect(protectedMaterial.map(([opId])=>opId)).toEqual(['a','b'])
 for(let cycle=0;cycle<3;cycle++){
  const rejectedRedo=control('operation_redo','boundary');optimistic(rejectedRedo);log.rejectPending(rejectedRedo.id);compare();expect(material(log)).toEqual(protectedMaterial)
  accept(control('operation_redo','boundary'));compare();expect(material(log).map(([opId])=>opId)).toEqual(['b'])
  const rejectedUndo=control('operation_undo','boundary');optimistic(rejectedUndo);log.rejectPending(rejectedUndo.id);compare();expect(material(log).map(([opId])=>opId)).toEqual(['b'])
  // An authoritative late ACK wins the local reject marker; the accepted-only
  // reference records this event only now, exactly as the server would.
  const late={...rejectedUndo,seq:++seq};accepted.push(late);log.confirm(late.id,late.seq);compare();expect(material(log)).toEqual(protectedMaterial)
 }
})
