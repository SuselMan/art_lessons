import {expect,it} from 'vitest'
import type {Operation,StrokeOperation} from '@grafetto/shared'
import {OperationLog} from './OperationLog'
import {effectiveWatercolorOperations} from './watercolorUndo'

it('keeps cached and cold replay equal across interleaved chunks, Dry, undo, redo and revoke',()=>{
  for(let seed=1;seed<=24;seed++){
    let random=seed
    const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random}
    const log=new OperationLog()
    for(let step=0;step<28;step++){
      const userId=['A','B','C'][next()%3],kind=next()%7,id=`${seed}-${step}`
      let op:Operation
      const target=kind===3?log.undoTarget(userId):kind===4?log.redoTarget(userId):null
      if(target)op={id,userId,timestamp:step,type:kind===3?'operation_undo':'operation_redo',targetOpId:target.id}
      else if(kind===5)op={id,type:'paper_dry',layerId:'L',userId,timestamp:step}
      else if(kind===6&&log.entries.some(e=>e.op.type==='stroke')){
        const sources=log.entries.filter(e=>e.op.type==='stroke')
        op={id,type:'operation_revoke',targetOpId:sources[next()%sources.length].op.id,userId:'teacher',timestamp:step}
      }else op={id,type:'stroke',userId,timestamp:step,layerId:'L',tool:'watercolor',
        strokeId:`gesture-${userId}-${Math.floor(step/5)}`,washId:'m70:L',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',color:[0,0,1],
        dabs:[{x:(next()%4)*8,y:0,size:12,aspectRatio:1,angle:0,opacity:1,pressure:1,tiltX:0,tiltY:0,t:0}]} as StrokeOperation
      log.append(op,{},false)
      if(op.type==='operation_undo')log.applyUndo(op.targetOpId,op.userId)
      if(op.type==='operation_redo')log.applyRedo(op.targetOpId,op.userId)
      if(op.type==='operation_revoke')log.revoke(op.targetOpId)
      const cached=effectiveWatercolorOperations(log.entries)
      const cold=effectiveWatercolorOperations(log.entries.map(entry=>({...entry})))
      const signature=(ops:Operation[])=>ops.map(op=>[op.id,op.type==='stroke'?op.preset:''])
      expect(signature(cached),`seed ${seed}, event ${step}`).toEqual(signature(cold))
    }
  }
})
