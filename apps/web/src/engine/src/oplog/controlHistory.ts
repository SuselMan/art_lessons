import type {Operation} from '@grafetto/shared'
export type HistoryGoneReason = 'branch' | 'revoke' | 'reject'
export interface ControlBeforeState {
  id: string
  state: 'done' | 'undone' | 'gone'
  goneReason?: HistoryGoneReason
}
export interface ControlHistoryEntry {
  op: Operation
  state: ControlBeforeState['state']
  goneReason?: HistoryGoneReason
  controlBefore?: readonly ControlBeforeState[]
  branchBefore?: readonly ControlBeforeState[]
}
function indexHistory(entries: readonly ControlHistoryEntry[]) {
  const byId = new Map(entries.map((entry,index) => [entry.op.id,{entry,index}]))
  const groups = new Map<string, Array<{entry:ControlHistoryEntry;index:number}>>()
  for (const [index,entry] of entries.entries()) if(entry.op.type==='stroke' && entry.op.strokeId){
    const key=JSON.stringify([entry.op.userId,entry.op.strokeId]), group=groups.get(key)??[]
    group.push({entry,index});groups.set(key,group)
  }
  return (op:Operation,before:number) => {
    if(op.type!=='operation_undo' && op.type!=='operation_redo' && op.type!=='operation_revoke')return []
    const target=byId.get(op.targetOpId)
    if(!target || target.index>=before || op.type!=='operation_revoke' && target.entry.op.userId!==op.userId)return []
    const source=target.entry.op
    if(op.type==='operation_revoke' || source.type!=='stroke' || !source.strokeId)return [target.entry]
    return (groups.get(JSON.stringify([source.userId,source.strokeId]))??[]).filter(item=>item.index<before).map(item=>item.entry)
  }
}
/** Scalar state only, captured before applying one optimistic control. */
export function captureControlBefore(entries:readonly ControlHistoryEntry[],op:Operation):readonly ControlBeforeState[]{
  return indexHistory(entries)(op,Infinity).map(entry=>({id:entry.op.id,state:entry.state,goneReason:entry.goneReason}))
}
/** A locally observed first control may start from a resolved legacy state
 * whose original event is outside the available window. Later controls cannot
 * overwrite that starting state with effects of other optimistic controls. */
export function initialControlStates(entries:readonly ControlHistoryEntry[]):Map<string,ControlBeforeState>{
  if(!entries.some(entry=>entry.controlBefore?.length || entry.branchBefore?.length))return new Map()
  const targets=indexHistory(entries),seen=new Set<string>(),initial=new Map<string,ControlBeforeState>()
  for(const [index,entry]of entries.entries()){
    if(entry.op.type!=='operation_undo' && entry.op.type!=='operation_redo' && entry.op.type!=='operation_revoke')continue
    const prior=new Map(entry.controlBefore?.map(state=>[state.id,state]))
    for(const target of targets(entry.op,index))if(!seen.has(target.op.id)){
      seen.add(target.op.id)
      const state=prior.get(target.op.id)
      if(state)initial.set(state.id,state)
    }
  }
  for(const entry of entries)for(const state of entry.branchBefore??[])if(!seen.has(state.id) || initial.get(state.id)?.goneReason==='branch'){seen.add(state.id);initial.set(state.id,state)}
  return initial
}
