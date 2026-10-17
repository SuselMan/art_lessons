import type {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
/** QA candidate: a capture owns release functions, never a second array list.
 * Eviction transfers its proven bytes to the buffer's existing CPU backing. */
export class CapturedReadScope {
 private leases:Array<{release():void;retainedBytes():number}>=[]
 private closed=false
 read(buffer:AccumulationBuffer):Uint8Array {
  if(this.closed)throw new Error('Captured read scope is closed')
  const snapshot=buffer.captureReadPixels()
  this.leases.push({release:snapshot.release,retainedBytes:snapshot.retainedBytes})
  return snapshot.pixels
 }
 get retainedBytes():number{return this.leases.reduce((total,lease)=>total+lease.retainedBytes(),0)}
 dispose():void{if(this.closed)return;this.closed=true;for(const lease of this.leases)lease.release();this.leases=[]}
}
