import {expect,it} from 'vitest'
import type {Operation,StrokeOperation} from '@grafetto/shared'
import {OperationLog} from './OperationLog'
import {effectiveWatercolorOperations} from './watercolorUndo'
const wet=(id:string,userId:string,x:number,extra:Partial<StrokeOperation>={}):StrokeOperation=>({id,type:'stroke',userId,layerId:'L',strokeId:id,washId:'m70:L',timestamp:100,tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',color:[0,0,1],dabs:[{x,y:0,size:4,aspectRatio:1,angle:0,opacity:1,pressure:1,tiltX:0,tiltY:0,t:0}],...extra})
// This unrelated author/layer cannot change any original effect. Its finite
// clock outlier disables the batch guard, exercising the unchanged slow proof.
const outlier=wet('outside-reference','outside-author',0,{layerId:'outside-layer',timestamp:1_000_000})
const material=(log:OperationLog)=>log.watercolorEffectiveOperations().filter(op=>op.id!==outlier.id).map(op=>({...op,seq:undefined}))
function rig(){
 const fast=new OperationLog(),slow=new OperationLog();slow.append(outlier,{serverSeq:1},false)
 let seq=0,controlId=0
 const push=(op:Operation,pending=false)=>{
  for(const log of [fast,slow]){
   log.append(op,pending?{pending:true}:{serverSeq:++seq},false)
   if(op.type==='operation_undo')log.applyUndo(op.targetOpId,op.userId)
   if(op.type==='operation_redo')log.applyRedo(op.targetOpId,op.userId)
   if(op.type==='operation_revoke')log.revoke(op.targetOpId)
  }
  expect(material(fast)).toEqual(material(slow))
 }
 const control=(type:'operation_undo'|'operation_redo',targetOpId:string,userId:string)=>push({id:`control-${++controlId}`,type,targetOpId,userId,timestamp:100})
 return{fast,slow,push,control}
}
for(const timestamp of [100,120_100,NaN,Infinity])it(`independent proof cycles preserve the complete slow material list with timestamp ${timestamp}`,()=>{
 const {fast,push,control}=rig()
 push(wet('a','A',0));push(wet('other-a','A',100))
 push({id:'dry',type:'paper_dry',userId:'C',layerId:'L',timestamp:100})
 push(wet('b','B',0,{timestamp}));push(wet('other-b','B',100,{timestamp}))
 control('operation_undo','dry','C');control('operation_undo','a','A');control('operation_undo','other-a','A')
 const before=material(fast).filter(op=>op.type==='stroke')
 for(let cycle=0;cycle<3;cycle++){control('operation_redo','dry','C');control('operation_undo','dry','C');expect(material(fast).filter(op=>op.type==='stroke')).toEqual(before)}
})
it('distant chunks of one whole gesture couple proofs, even when their footprints never overlap',()=>{
 const {push,control}=rig()
 push(wet('a','A',0));push(wet('other-a','A',100));push({id:'dry',type:'paper_dry',userId:'C',layerId:'L',timestamp:100})
 push(wet('b','B',0));push(wet('other-b','B',100));push(wet('c0','C',0,{strokeId:'far-chunk-bridge'}));push(wet('c1','C',100,{strokeId:'far-chunk-bridge'}))
 control('operation_undo','dry','C');control('operation_undo','a','A');control('operation_undo','other-a','A')
 for(let cycle=0;cycle<3;cycle++){control('operation_redo','dry','C');control('operation_undo','c1','C');control('operation_undo','dry','C');control('operation_redo','c0','C')}
})
it('batching other independent pools never gives a dormant pool a replacement connector',()=>{
 const {fast,push,control}=rig()
 for(const offset of [0,100])push(wet('a'+offset,'A',offset))
 push({id:'dry',type:'paper_dry',userId:'C',layerId:'L',timestamp:100})
 push(wet('b','B',20));push(wet('bridge','C',10,{dabs:[{x:10,y:0,size:20,aspectRatio:1,angle:0,opacity:1,pressure:1,tiltX:0,tiltY:0,t:0}]}));push(wet('b100','B',100))
 control('operation_undo','dry','C');control('operation_undo','a0','A');control('operation_undo','a100','A')
 control('operation_redo','dry','C');control('operation_undo','bridge','C')
 push(wet('replacement','B',10,{dabs:[{x:10,y:0,size:20,aspectRatio:1,angle:0,opacity:1,pressure:1,tiltX:0,tiltY:0,t:0}]}))
 control('operation_undo','dry','C')
 expect(material(fast).some(op=>op.id==='a0')).toBe(false)
 expect(material(fast).some(op=>op.id==='a100')).toBe(true)
})
it.each(Array.from({length:8},(_,index)=>index))('three-author prefix reference shard %i preserves every output including rejected controls',shard=>{
 let checks=0
 for(let seed=shard*30+1;seed<=(shard+1)*30;seed++){
  let state=seed;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296}
  const {fast,slow,push,control}=rig()
  push(wet('a','A',0));push(wet('other-a','A',100));push({id:'dry',type:'paper_dry',userId:'C',layerId:'L',timestamp:100});push(wet('b','B',0));push(wet('other-b','B',100))
  control('operation_undo','dry','C');control('operation_undo','a','A');control('operation_undo','other-a','A')
  for(let step=0;step<24;step++){
   const userId=['A','B','C'][Math.floor(random()*3)],choice=random(),target=choice<.35?fast.undoTarget(userId):choice<.6?fast.redoTarget(userId):null
   let op:Operation
   if(target)op={id:`s${seed}-${step}`,type:choice<.35?'operation_undo':'operation_redo',targetOpId:target.id,userId,timestamp:100}
   else if(choice>.9)op={id:`s${seed}-${step}`,type:'layer_visibility',layerId:'L',visible:false,userId,timestamp:100}
   else op=wet(`s${seed}-${step}`,userId,(random()<.5?0:100)+Math.floor(random()*3)*3)
   const reject=target&&random()<.2;push(op,Boolean(reject))
   if(reject){fast.rejectPending(op.id);slow.rejectPending(op.id);expect(material(fast)).toEqual(material(slow))}
   checks++
  }
 }
 expect(checks).toBe(720)
})

it('component-clock mode also preserves independent boundary proofs against forced slow fallback',()=>{
 const {fast,slow,push,control}=rig()
 const compare=()=>{
  const view=(log:OperationLog)=>effectiveWatercolorOperations(log.entries,{dryingScope:'component'}).filter(op=>op.id!==outlier.id).map(op=>({...op,seq:undefined}))
  expect(view(fast)).toEqual(view(slow))
 }
 push(wet('a','A',0));push(wet('other-a','A',100));push({id:'dry',type:'paper_dry',userId:'C',layerId:'L',timestamp:100});push(wet('b','B',0));push(wet('other-b','B',100))
 control('operation_undo','dry','C');control('operation_undo','a','A');control('operation_undo','other-a','A');compare()
 for(let cycle=0;cycle<3;cycle++){control('operation_redo','dry','C');compare();control('operation_undo','dry','C');compare()}
})
