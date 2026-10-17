import {expect,it} from 'vitest'
import type {Operation,StrokeOperation} from '@grafetto/shared'
import {OperationLog} from './OperationLog'
const wet=(id:string,userId:string,x:number,extra:Partial<StrokeOperation>={}):StrokeOperation=>({id,type:'stroke',userId,layerId:'L',strokeId:id,washId:'m70:L',timestamp:100,tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',color:[0,0,1],dabs:[{x,y:0,size:10,aspectRatio:1,angle:0,opacity:1,pressure:1,tiltX:0,tiltY:0,t:0}],...extra})
const material=(log:OperationLog)=>log.watercolorEffectiveOperations().filter(op=>op.type==='stroke').map(op=>[op.id,op.preset])
function rig(){
 const log=new OperationLog(),history:Operation[]=[]
 let count=0
 const apply=(op:Operation)=>{history.push({...op,seq:++count});log.append(op,{serverSeq:count},false);if(op.type==='operation_undo')log.applyUndo(op.targetOpId,op.userId);if(op.type==='operation_redo')log.applyRedo(op.targetOpId,op.userId);log.watercolorEffectiveOperations()}
 const control=(type:'operation_undo'|'operation_redo',targetOpId:string,userId:string)=>apply({id:`control${count}`,type,targetOpId,userId,timestamp:count})
 return {log,history,apply,control}
}
for(const kind of ['dry','hide'] as const)for(const author of ['A','C'])it(`${kind} authored by ${author} restores whole-water protection over repeated Undo/Redo cycles and page rehydration`,()=>{
 const {log,history,apply,control}=rig()
 apply(wet('a','A',0,{strokeId:'whole'}))
 apply(kind==='dry'?{id:'boundary',type:'paper_dry',layerId:'L',userId:author,timestamp:200}:{id:'boundary',type:'layer_visibility',layerId:'L',userId:author,timestamp:200,visible:false})
 apply(wet('b','B',5,{timestamp:300}));apply(wet('a2','A',40,{strokeId:'whole',timestamp:400}))
 control('operation_undo','boundary',author);control('operation_undo','a2','A')
 const before=material(log)
 expect(before.map(([id])=>id)).toEqual(['a','b','a2'])
 for(let cycle=0;cycle<3;cycle++){
  control('operation_redo','boundary',author);expect(material(log).map(([id])=>id)).toEqual(['b'])
  control('operation_undo','boundary',author);expect(material(log)).toEqual(before)
  const cold=new OperationLog();cold.absorbHistorical(history);expect(material(cold)).toEqual(before)
  const paged=new OperationLog();paged.absorbHistorical(history.slice(3));paged.absorbHistorical(history.slice(0,3));expect(material(paged)).toEqual(before)
 }
})
it('two reopened historical dry barriers restore protection only after both are absent',()=>{
 const {log,apply,control}=rig()
 apply(wet('a','A',0))
 for(const id of ['d1','d2'])apply({id,type:'paper_dry',layerId:'L',userId:'C',timestamp:200})
 apply(wet('b','B',5,{timestamp:300}))
 for(const id of ['d1','d2'])control('operation_undo',id,'C')
 control('operation_undo','a','A');const before=material(log)
 for(const id of ['d1','d2'])control('operation_redo',id,'C')
 control('operation_undo','d1','C');expect(material(log).map(([id])=>id)).toEqual(['b'])
 control('operation_undo','d2','C');expect(material(log)).toEqual(before)
})
for(const absentConsumer of [false,true])it(`reopening Dry does not adopt a new consumer or bypass natural expiry (consumerUndone=${absentConsumer})`,()=>{
 const {log,apply,control}=rig()
 apply(wet('a','A',0));apply({id:'dry',type:'paper_dry',layerId:'L',userId:'A',timestamp:200})
 apply(wet('b','B',5,{timestamp:absentConsumer?300:120300}))
 control('operation_undo','dry','A');control('operation_undo','a','A')
 if(absentConsumer)control('operation_undo','b','B')
 expect(material(log).some(([id])=>id==='a')).toBe(false)
 apply(wet('new-c','C',5,{timestamp:120400}))
 control('operation_redo','dry','A');control('operation_undo','dry','A')
 expect(material(log).some(([id])=>id==='a')).toBe(false)
})
it('reopening an unrelated layer boundary cannot revive water whose original bridge was removed',()=>{
 const {log,apply,control}=rig()
 apply(wet('a','A',0));apply(wet('b','B',20));apply(wet('bridge','C',10))
 control('operation_undo','a','A');control('operation_undo','bridge','C')
 apply({id:'other-dry',type:'paper_dry',layerId:'M',userId:'B',timestamp:200})
 apply(wet('new-bridge','B',10))
 control('operation_undo','other-dry','B')
 expect(material(log).some(([id])=>id==='a')).toBe(false)
})
it('Undo Dry cannot adopt a replacement bridge after its historical connector was removed',()=>{
 const {log,apply,control}=rig()
 apply(wet('a','A',0));apply({id:'dry',type:'paper_dry',layerId:'L',userId:'A',timestamp:200});apply(wet('b','B',20));apply(wet('bridge','C',10))
 control('operation_undo','dry','A');control('operation_undo','a','A')
 expect(material(log).some(([id])=>id==='a')).toBe(true)
 control('operation_redo','dry','A');control('operation_undo','bridge','C')
 apply(wet('replacement','B',10))
 control('operation_undo','dry','A')
 expect(material(log).some(([id])=>id==='a')).toBe(false)
})
for(const kind of ['pencil','shape','layer_clear','layer_delete','global-dry','multi-hide'] as const)it(`${kind} also restores an already established dependency after a reversible boundary cycle`,()=>{
 const {log,apply,control}=rig()
 apply(wet('a','A',0))
 const base={id:'boundary',userId:'C',timestamp:200}
 let boundary:Operation
 if(kind==='pencil')boundary={...wet('boundary','C',100),tool:'pencil',preset:'HB',timestamp:200}
 else if(kind==='shape')boundary={...base,type:'shape',layerId:'L',geometry:{kind:'rectangle',cornerRadius:0},frame:{x:0,y:0,width:8,height:8,angle:0},stroke:null,fill:{color:[1,0,0]}}
 else if(kind==='layer_clear')boundary={...base,type:'layer_clear',layerId:'L'}
 else if(kind==='layer_delete')boundary={...base,type:'layer_delete',layerIds:['L','M']}
 else if(kind==='global-dry')boundary={...base,type:'paper_dry'}
 else boundary={...base,type:'layer_visibility',layerIds:['L','M'],visible:false}
 apply(boundary);control('operation_undo','boundary','C')
 apply(wet('b','B',5,{timestamp:300}));control('operation_undo','a','A')
 const before=material(log);expect(before.some(([id])=>id==='a')).toBe(true)
 control('operation_redo','boundary','C');expect(material(log).some(([id])=>id==='a')).toBe(false)
 control('operation_undo','boundary','C');expect(material(log)).toEqual(before)
})
it('historical proof preserves the layer clock refreshed by a distant, nonconnecting gesture',()=>{
 const {log,apply,control}=rig()
 apply(wet('a','A',0,{timestamp:100}));apply({id:'dry',type:'paper_dry',layerId:'L',userId:'C',timestamp:200})
 apply(wet('b','B',5,{timestamp:300}));apply(wet('far-clock','C',1000,{timestamp:119500}));apply(wet('later-consumer','C',5,{timestamp:121000}))
 control('operation_undo','dry','C');control('operation_undo','a','A');control('operation_undo','b','B')
 const before=material(log);expect(before.some(([id])=>id==='a')).toBe(true)
 control('operation_redo','dry','C');expect(material(log).some(([id])=>id==='a')).toBe(false)
 control('operation_undo','dry','C');expect(material(log)).toEqual(before)
})
it('removing one historical bridge still restores water through an alternative original connector',()=>{
 const {log,apply,control}=rig()
 apply(wet('a','A',0));apply({id:'dry',type:'paper_dry',layerId:'L',userId:'A',timestamp:200});apply(wet('b','B',20));apply(wet('bridge1','C',10));apply(wet('bridge2','C',10))
 control('operation_undo','dry','A');control('operation_undo','a','A')
 const before=material(log)
 control('operation_redo','dry','A');control('operation_undo','bridge1','C');control('operation_undo','dry','A')
 expect(material(log).filter(([id])=>id!=='bridge1')).toEqual(before.filter(([id])=>id!=='bridge1'))
 expect(material(log).some(([id])=>id==='a')).toBe(true)
})
it('a whole gesture connector chunk after Dry can protect its earlier chunk through a foreign stroke before Dry',()=>{
 const {log,apply,control}=rig()
 apply(wet('a','A',0,{strokeId:'whole'}));apply(wet('b','B',20))
 apply({id:'dry',type:'paper_dry',layerId:'L',userId:'C',timestamp:200})
 apply(wet('a2','A',10,{strokeId:'whole',timestamp:300}))
 control('operation_undo','dry','C');control('operation_undo','a2','A')
 const before=material(log);expect(before.map(([id])=>id)).toEqual(['a','b','a2'])
 control('operation_redo','dry','C');expect(material(log).map(([id])=>id)).toEqual(['b'])
 control('operation_undo','dry','C');expect(material(log)).toEqual(before)
})
it('a historical connector before Dry can protect a later source and later foreign consumer',()=>{
 const {log,apply,control}=rig()
 apply(wet('connector','C',10));apply({id:'dry',type:'paper_dry',layerId:'L',userId:'C',timestamp:200})
 apply(wet('a','A',0,{timestamp:300}));apply(wet('b','B',20,{timestamp:400}))
 control('operation_undo','dry','C');control('operation_undo','a','A')
 const before=material(log);expect(before.some(([id])=>id==='a')).toBe(true)
 control('operation_redo','dry','C');expect(material(log).some(([id])=>id==='a')).toBe(false)
 control('operation_undo','dry','C');expect(material(log)).toEqual(before)
})
