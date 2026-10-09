import {PaperWetness,quantizeWet} from './paperWetness'
export type WetClockStage = 'admission-touch'|'wash-join'|'checkpoint-wall'|'sample-batch'|'deposit-batch'|'wash-ended'|'pending-commit'
export interface WetClockRecord {readonly kind:'clock';readonly stage:WetClockStage;readonly value:number;readonly ordinal:number;readonly batch:number|null;readonly layerId:string|null;readonly strokeId:string|null}
export type WetTranscriptEvent =
 | WetClockRecord
 | {readonly kind:'any-near';readonly layerId:string;readonly x:number;readonly y:number;readonly radius:number;readonly now:number;readonly value:boolean}
 | {readonly kind:'any';readonly layerId:string;readonly now:number;readonly value:boolean}
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
  case 'any-near':if(fork.anyWetNear(event.layerId,event.x,event.y,event.radius,event.now)!==event.value)throw Error('Wet query mismatch');break
  case 'any':if(fork.anyWet(event.layerId,event.now)!==event.value)throw Error('Wet query mismatch');break
  case 'drop-pending':fork.dropPending();break
  case 'sample':{const actual=fork.sampleUnderNib(event.layerId,event.x,event.y,event.radius,event.now);if(!Object.is(actual,event.value))throw Error('Wet transcript sample mismatch');profiles.set(event.strokeId,(profiles.get(event.strokeId)??'')+quantizeWet(actual));break}
  case 'drain':fork.drain(event.layerId,event.x,event.y,event.radius,event.fraction);break
  case 'deposit':fork.deposit(event.layerId,event.x,event.y,event.radius,event.amount,event.now,true,event.pool);break
  case 'commit':fork.commitPending(event.now);break
 }}
 return profiles
}

/** Typed CPU cursor only: NEVER installed as Engine or global clock provider. */
export class WetClockCursor {
 private readonly clocks:readonly WetClockRecord[]
 private index=0
 private failed=false
 constructor(events:readonly WetTranscriptEvent[], completeness:{dropped:number;errors:number}){
  if(completeness.dropped!==0||completeness.errors!==0||events.length>65536)throw Error('Incomplete wet clock transcript')
  this.clocks=events.filter((event):event is WetClockRecord=>event.kind==='clock').map(event=>Object.freeze({...event}))
  for(let i=0;i<this.clocks.length;i++){
   const record=this.clocks[i],batchStage=record.stage==='sample-batch'||record.stage==='deposit-batch'
   if(!Number.isFinite(record.value)||!Number.isSafeInteger(record.ordinal)||record.ordinal<1
    ||i>0&&record.ordinal!==this.clocks[i-1].ordinal+1
    ||(batchStage ? !(typeof record.batch==='number'&&Number.isSafeInteger(record.batch)&&record.batch>0) : record.batch!==null))
    throw Error('Invalid wet clock ordinal/batch')
  }
 }
 next(stage:WetClockStage,batch:number|null=null):number{
  const record=this.clocks[this.index]
  if(this.failed||!record||record.stage!==stage||record.batch!==batch){this.failed=true;throw Error('Wet clock stage/order mismatch')}
  this.index++;return record.value
 }
 assertDone():void{if(this.failed||this.index!==this.clocks.length){this.failed=true;throw Error('Incomplete wet clock consumption')}}
}
