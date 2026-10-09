/** DEV observation only: never submit, wait, wake or schedule owner work. */
export interface SchedulingPassport {fifoEpoch:number;requestId:number;ownerEpoch:number|null;requestKind:'source'|'material'}
export interface SchedulingRow extends SchedulingPassport {kind:'requestAdmitted'|'fifoPhase'|'schedulerResume'|'scopeSubmitted'|'scopeRelease';at:number;cancelled:boolean;phase?:string;queued?:number;quantumId?:number;outcome?:'fulfilled'|'rejected'|'encode-error';pendingBefore?:number;pendingAfter?:number;live?:boolean}
export type SchedulingRelease=((outcome:'fulfilled'|'rejected'|'encode-error',pendingBefore:number,pendingAfter:number,live:boolean)=>void)&{submitted():void}
export interface SchedulingRequest {readonly passport:Readonly<SchedulingPassport>;phase(phase:string,queued:number):void;cancel():void;resume(queued:number):void;bindRelease(quantumId:number,ownerEpoch:number):SchedulingRelease}
export function createBoundedSchedulingObserver(maxRows=2048,clock=()=>performance.now()){
 if(!Number.isInteger(maxRows)||maxRows<1||maxRows>8192)throw Error('Invalid observer row bound')
 const rows:SchedulingRow[]=[];let dropped=0,errors=0,closed=false
 const append=(row:Omit<SchedulingRow,'at'>)=>{if(closed)return;try{if(rows.length>=maxRows){dropped++;return}rows.push(Object.freeze({...row,at:clock()}))}catch{errors++}}
 return{
  bindRequest(input:SchedulingPassport):SchedulingRequest{
   for(const key of ['fifoEpoch','requestId'] as const)if(!Number.isSafeInteger(input[key])||input[key]<0)throw Error('Invalid request provenance')
   if(input.ownerEpoch!==null&&(!Number.isSafeInteger(input.ownerEpoch)||input.ownerEpoch<0))throw Error('Invalid owner provenance')
   if(!['source','material'].includes(input.requestKind))throw Error('Invalid request kind')
   const origin=Object.freeze({...input});let cancelled=false
   append({kind:'requestAdmitted',...origin,cancelled});
   return Object.freeze({passport:origin,phase(phase:string,queued:number){append({kind:'fifoPhase',...origin,phase,queued,cancelled})},cancel(){cancelled=true},resume(queued:number){append({kind:'schedulerResume',...origin,queued,cancelled})},bindRelease(quantumId:number,ownerEpoch:number){if(!Number.isSafeInteger(ownerEpoch)||ownerEpoch<0)throw Error('Actual encoded owner required');if(!Number.isSafeInteger(quantumId)||quantumId<0)throw Error('Invalid quantum provenance');let released=false,submitted=false;return Object.assign((outcome:'fulfilled'|'rejected'|'encode-error',pendingBefore:number,pendingAfter:number,live:boolean)=>{if(released)return;released=true;append({kind:'scopeRelease',...origin,ownerEpoch,quantumId,outcome,pendingBefore,pendingAfter,live,cancelled})},{submitted(){if(submitted)return;submitted=true;append({kind:'scopeSubmitted',...origin,ownerEpoch,quantumId,cancelled})}})}})
  },noteError(){errors++},snapshot(){return{rows:rows.slice(),dropped,observerErrors:errors,closed,maxRows}},close(){closed=true}
 }
}
export type BoundedSchedulingObserver=ReturnType<typeof createBoundedSchedulingObserver>
