import {expect,it} from 'vitest'
import type {Operation,StrokeOperation} from '@grafetto/shared'
import {OperationLog} from './OperationLog'

function append(log:OperationLog,op:Operation){
  log.append(op,{},false)
  if(op.type==='operation_undo')log.applyUndo(op.targetOpId,op.userId)
  else if(op.type==='operation_redo')log.applyRedo(op.targetOpId,op.userId)
  else if(op.type==='operation_revoke')log.revoke(op.targetOpId)
}
const signature=(log:OperationLog)=>({
  states:log.entries.map(e=>[e.op.id,e.state,e.goneReason]),
  material:log.watercolorEffectiveOperations().map(op=>[op.id,op.type==='stroke'?op.preset:'']),
})
it('resolves every historical cut as independent replay under future three-author controls',()=>{
  for(let seed=1;seed<=16;seed++){
    let random=seed
    const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random}
    const log=new OperationLog()
    for(let step=0;step<24;step++){
      const userId=['A','B','C'][next()%3],kind=next()%6,id=`${seed}-${step}`
      const target=kind===2?log.undoTarget(userId):kind===3?log.redoTarget(userId):undefined
      let op:Operation
      if(target)op={id,type:kind===2?'operation_undo':'operation_redo',targetOpId:target.id,userId,timestamp:step}
      else if(kind===4)op={id,type:'paper_dry',layerId:'L',userId,timestamp:step}
      else if(kind===5&&log.entries.some(e=>e.op.type==='stroke')){
        const strokes=log.entries.filter(e=>e.op.type==='stroke')
        op={id,type:'operation_revoke',targetOpId:strokes[next()%strokes.length].op.id,userId:'teacher',timestamp:step}
      }else op={id,type:'stroke',userId,timestamp:step,layerId:'L',tool:'watercolor',strokeId:`gesture-${userId}-${Math.floor(step/4)}`,
        washId:'m70:L',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',color:[0,0,1],
        dabs:[{x:(next()%4)*8,y:0,size:12,aspectRatio:1,angle:0,opacity:1,pressure:1,tiltX:0,tiltY:0,t:0}]} as StrokeOperation
      append(log,op)
    }
    for(let cut=0;cut<=log.entries.length;cut++){
      const independent=new OperationLog()
      for(const entry of log.entries.slice(0,cut))append(independent,entry.op)
      expect(signature(log.historicalPrefix(cut)),`seed ${seed}, cut ${cut}`).toEqual(signature(independent))
    }
  }
})
