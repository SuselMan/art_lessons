import type {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
/** QA candidate: a capture owns release functions, never a second array list.
 * Eviction transfers its proven bytes to the buffer's existing CPU backing. */
export class CapturedReadScope {
 private leases:Array<{release():void;retainedBytes():number;persistent?:boolean}>=[]
 private reservedBytes=0
 private closed=false
 constructor(privateOptions:{persistUntilRelease?:boolean;maxRetainedBytes?:number}={}){this.options={...privateOptions};if(privateOptions.maxRetainedBytes!==undefined&&(!Number.isSafeInteger(privateOptions.maxRetainedBytes)||privateOptions.maxRetainedBytes<0))throw new RangeError('Invalid captured CPU byte limit')}
 private readonly options:{persistUntilRelease?:boolean;maxRetainedBytes?:number}
 read(buffer:AccumulationBuffer):Uint8Array {
  if(this.closed)throw new Error('Captured read scope is closed')
  const bytes=buffer.width*buffer.height*4,persistent=this.canRetain(bytes);if(persistent)this.reservedBytes+=bytes;let snapshot;try{snapshot=buffer.captureReadPixels({persistUntilRelease:persistent})}finally{if(persistent)this.reservedBytes-=bytes}
  if(this.closed){snapshot.release();throw new Error('Captured read scope closed during read')}this.leases.push({release:snapshot.release,retainedBytes:snapshot.retainedBytes,persistent})
  return snapshot.pixels
 }
 private canRetain(bytes:number):boolean{return this.options.persistUntilRelease===true&&bytes<=((this.options.maxRetainedBytes??64*1024*1024)-this.persistentRetainedBytes-this.reservedBytes)}
 upload(buffer:AccumulationBuffer,pixels:Uint8Array):void {
  if(this.closed)throw new Error('Captured read scope is closed')
  if(!(pixels instanceof Uint8Array)||!(pixels.buffer instanceof ArrayBuffer)||pixels.byteOffset!==0||pixels.buffer.byteLength!==pixels.byteLength||pixels.byteLength!==buffer.width*buffer.height*4)throw new RangeError('Upload requires exact owned RGBA8 array')
  const revision=buffer.contentRevision
  buffer.restorePixels(pixels)
  if(this.closed)throw new Error('Captured read scope closed during upload')
  if(buffer.contentRevision!==revision+1||!this.canRetain(pixels.byteLength))return
  const lease=buffer.retainCapturedPixels(pixels,{persistUntilRelease:true,expectedRevision:revision+1})
  this.leases.push({...lease,persistent:true})
 }
 get persistentRetainedBytes():number{return this.leases.reduce((total,lease)=>total+(lease.persistent?lease.retainedBytes():0),0)}
 get retainedBytes():number{return this.leases.reduce((total,lease)=>total+lease.retainedBytes(),0)}
 dispose():void{if(this.closed)return;this.closed=true;for(const lease of this.leases)lease.release();this.leases=[]}
}
