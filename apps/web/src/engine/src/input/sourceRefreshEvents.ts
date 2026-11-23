import {KritaRandomSource,type KritaRandomSnapshot} from '../presets/nativeRandom'
export type SourceRefreshOption='size'|'rotation'|'mirror'|'spacing'|'rate'
export interface SourceRefreshQuery {readonly option:SourceRefreshOption;readonly draws:number}
export interface SourceRefreshInput {readonly inputOrdinal:number;readonly sourceTime:number;readonly phase:'spacing'|'timing';readonly queries:readonly SourceRefreshQuery[]}
export interface SourceRefreshState {readonly version:1;readonly nextEvent:number;readonly inputOrdinal:number;readonly sourceTime:number;readonly phase:'none'|'spacing'|'timing';readonly random:KritaRandomSnapshot}
export interface SourceRefreshEvent extends SourceRefreshInput {readonly version:1;readonly ordinal:number;readonly before:KritaRandomSnapshot;readonly after:KritaRandomSnapshot;readonly values:readonly number[]}
const order:readonly SourceRefreshOption[]=['size','rotation','mirror','spacing','rate']
const safe=(v:number)=>Number.isSafeInteger(v)&&v>=0
const snapshot=(s:KritaRandomSnapshot):KritaRandomSnapshot=>{const copy=KritaRandomSource.restore(s).snapshot();Object.freeze(copy.state);return Object.freeze(copy)}
export function beginSourceRefreshEvents(random:KritaRandomSnapshot):SourceRefreshState{return Object.freeze({version:1,nextEvent:0,inputOrdinal:0,sourceTime:0,phase:'none',random:snapshot(random)})}
/** Query facts only. The author scheduler decides whether a50ms refresh is due;
 * this helper never schedules a timer or creates/advances a paint dab. The RNG
 * snapshot MUST be the same source used by paint consumers, not a new seed. */
export function captureSourceRefreshEvent(state:SourceRefreshState,input:SourceRefreshInput):{state:SourceRefreshState;event:SourceRefreshEvent}{
 if(state.version!==1||!safe(state.nextEvent)||state.nextEvent===Number.MAX_SAFE_INTEGER||!safe(state.inputOrdinal)||!Number.isFinite(state.sourceTime)||state.sourceTime<0||!['none','spacing','timing'].includes(state.phase)||!safe(input.inputOrdinal)||input.inputOrdinal<state.inputOrdinal||!Number.isFinite(input.sourceTime)||input.sourceTime<state.sourceTime||!['spacing','timing'].includes(input.phase)||!Array.isArray(input.queries)||input.queries.length>5)throw RangeError('Invalid source refresh ordering')
 if(input.inputOrdinal===state.inputOrdinal&&state.phase!=='none'&&(state.phase==='timing'||input.phase==='spacing'))throw RangeError('Repeated or reordered source refresh phase')
 let previous=-1,total=0
 for(const q of input.queries){const at=order.indexOf(q.option);if(at<=previous||!safe(q.draws)||q.draws>16||(input.phase==='spacing'?at<0||at>3:at!==4))throw RangeError('Invalid source refresh query plan');previous=at;total+=q.draws}
 const before=snapshot(state.random),random=KritaRandomSource.restore(before),values:number[]=[]
 // generate() enforces source counter exhaustion; no caller state has mutated.
 for(let i=0;i<total;i++)values.push(random.generate())
 const after=snapshot(random.snapshot()),queries=Object.freeze(input.queries.map(q=>Object.freeze({...q}))),event:SourceRefreshEvent=Object.freeze({...input,queries,version:1,ordinal:state.nextEvent,before,after,values:Object.freeze(values)})
 return {event,state:Object.freeze({version:1,nextEvent:state.nextEvent+1,inputOrdinal:input.inputOrdinal,sourceTime:input.sourceTime,phase:input.phase,random:after})}
}
const same=(a:KritaRandomSnapshot,b:KritaRandomSnapshot)=>a.version===b.version&&a.draws===b.draws&&a.state.length===3&&b.state.length===3&&a.state.every((v,i)=>v===b.state[i])
/** Reference replay validation. This is not a wire/admission format grant.
 * Replaying never re-times inputs or rerolls against current UI settings. */
export function replaySourceRefreshEvent(state:SourceRefreshState,event:SourceRefreshEvent):SourceRefreshState{
 if(event.version!==1||event.ordinal!==state.nextEvent||!same(state.random,event.before))throw Error('Source refresh replay prefix mismatch')
 const result=captureSourceRefreshEvent(state,event)
 if(!Array.isArray(event.values)||event.values.length!==result.event.values.length||event.values.some((v,i)=>v!==result.event.values[i])||!same(event.after,result.event.after))throw Error('Source refresh replay draws mismatch')
 return result.state
}
