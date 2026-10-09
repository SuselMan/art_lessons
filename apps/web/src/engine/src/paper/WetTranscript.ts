import {PaperWetness,quantizeWet} from './paperWetness'
export type WetTranscriptEvent =
 | {readonly kind:'drop-pending'}
 | {readonly kind:'sample';readonly strokeId:string;readonly layerId:string;readonly x:number;readonly y:number;readonly radius:number;readonly now:number;readonly value:number;readonly batch:number}
 | {readonly kind:'drain';readonly strokeId:string;readonly layerId:string;readonly x:number;readonly y:number;readonly radius:number;readonly fraction:number}
 | {readonly kind:'deposit';readonly strokeId:string;readonly layerId:string;readonly x:number;readonly y:number;readonly radius:number;readonly amount:number;readonly now:number;readonly pool:number;readonly batch:number}
 | {readonly kind:'commit';readonly strokeId:string;readonly now:number}
/** Bounded CPU witness. Observer failure or overflow makes completeness invalid. */
export class WetTranscript {
 readonly events:WetTranscriptEvent[]=[]
 dropped=0
 readonly capacity:number
 constructor(capacity=8192){this.capacity=capacity;if(!Number.isSafeInteger(capacity)||capacity<0||capacity>65536)throw Error('Invalid wet transcript capacity')}
 readonly observe=(event:WetTranscriptEvent)=>{if(this.events.length===this.capacity){this.dropped++;return}this.events.push(Object.freeze({...event}))}
}
/** Recorded clocks and exact action order only; no live Engine restore/merge. */
export function replayWetTranscript(fork:PaperWetness,events:readonly WetTranscriptEvent[], completeness:{dropped:number;errors:number}):Map<string,string>{
 if(completeness.dropped!==0||completeness.errors!==0)throw Error('Incomplete wet transcript')
 const profiles=new Map<string,string>()
 for(const event of events){switch(event.kind){
  case 'drop-pending':fork.dropPending();break
  case 'sample':{const actual=fork.sampleUnderNib(event.layerId,event.x,event.y,event.radius,event.now);if(!Object.is(actual,event.value))throw Error('Wet transcript sample mismatch');profiles.set(event.strokeId,(profiles.get(event.strokeId)??'')+quantizeWet(actual));break}
  case 'drain':fork.drain(event.layerId,event.x,event.y,event.radius,event.fraction);break
  case 'deposit':fork.deposit(event.layerId,event.x,event.y,event.radius,event.amount,event.now,true,event.pool);break
  case 'commit':fork.commitPending(event.now);break
 }}
 return profiles
}
