import type { CanonicalGpuField } from './types'

/** QA-only resource owner. It receives no Room, journal, delivery state or GL
 * target. A packet callback may encode original commands into these fields. */
export interface DetachedWarmupOwner {
 createField(label:string,width:number,height:number,filter:'nearest'|'linear'):CanonicalGpuField
 destroyField(field:CanonicalGpuField):void
 whenIdle():Promise<void>
}
export interface DetachedWarmupResult {
 readonly allocatedBytes:number
 readonly peakBytes:number
 readonly fields:readonly {label:string;width:number;height:number;filter:'nearest'|'linear';bytes:number}[]
}
export class DetachedWarmupScope {
 private readonly owner:DetachedWarmupOwner
 private readonly cap:number
 private readonly fields:CanonicalGpuField[]=[]
 private bytes=0
 private peak=0
 private retired=false
 constructor(owner:DetachedWarmupOwner,capBytes=96*1024*1024){
  if(!Number.isSafeInteger(capBytes)||capBytes<1)throw new Error('Invalid detached warmup cap')
  this.owner=owner;this.cap=capBytes
 }
 create(label:string,width:number,height:number,filter:'nearest'|'linear'='nearest'){
  if(this.retired)throw new Error('Detached warmup retired')
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)throw new Error('Invalid detached warmup dimensions')
  const bytes=width*height*4
  if(!Number.isSafeInteger(bytes)||bytes>this.cap-this.bytes)throw new Error('Detached warmup allocation cap exceeded')
  const field=this.owner.createField(label,width,height,filter)
  if(field.width!==width||field.height!==height||field.format!=='rgba8unorm'||field.filter!==filter){this.owner.destroyField(field);throw new Error('Detached warmup field contract mismatch')}
  this.fields.push(field);this.bytes+=bytes;this.peak=Math.max(this.peak,this.bytes)
  return field
 }
 assertCurrent(){if(this.retired)throw new Error('Detached warmup retired')}
 snapshot():DetachedWarmupResult{return {allocatedBytes:this.bytes,peakBytes:this.peak,fields:this.fields.map(f=>({label:f.label,width:f.width,height:f.height,filter:f.filter,bytes:f.width*f.height*4}))}}
 /** Call only after the encoded packet has submitted. Completion failure still
  * retires this scope; the shared device and authoritative owners stay intact. */
 async close(){
  if(this.retired)return
  this.retired=true
  try{await this.owner.whenIdle()}finally{for(const f of this.fields.splice(0))this.owner.destroyField(f);this.bytes=0}
 }
}
export async function runDetachedWarmup(owner:DetachedWarmupOwner,encode:(scope:DetachedWarmupScope)=>void|Promise<void>,capBytes?:number):Promise<DetachedWarmupResult>{
 const scope=new DetachedWarmupScope(owner,capBytes)
 try{await encode(scope);scope.assertCurrent();return scope.snapshot()}finally{await scope.close()}
}

/** Minimal first experiment: warm only the literal raw canvas pipeline. No
 * source packet, composite, dry planner or physical model is exercised here. */
export async function warmDetachedRawCanvas(
 owner:DetachedWarmupOwner & {clearField(field:CanonicalGpuField):void},
 bridge:{warmDetachedCanvas(field:CanonicalGpuField):Promise<void>},
 width=1024,height=1024,
):Promise<DetachedWarmupResult>{
 return runDetachedWarmup(owner,async scope=>{
  const field=scope.create('QA detached zero raw canvas warmup',width,height)
  owner.clearField(field)
  scope.assertCurrent()
  await bridge.warmDetachedCanvas(field)
  scope.assertCurrent()
 },width*height*4)
}
