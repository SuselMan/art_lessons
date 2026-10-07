/// <reference types="@webgpu/types" />
import type { CanonicalWatercolorWebGpu } from './backend'
import type { CanonicalGpuField } from './types'

/** Backend-neutral buffer operations used by the canonical settle planner.
 * No GL context/FBO emulation. Q8 extent is immutable. */
export class CanonicalFieldBuffer {
 readonly owner: CanonicalWatercolorWebGpu
 readonly field: CanonicalGpuField
 readonly width: number
 readonly height: number
 readonly filter: 'nearest' | 'linear'
 private released = false
 constructor(owner:CanonicalWatercolorWebGpu,width:number,height:number,filter:'nearest'|'linear'='nearest',label='canonical scratch') {
  this.owner=owner;this.width=width;this.height=height;this.filter=filter
  this.field=owner.createField(label,width,height)
 }
 get texture():GPUTexture {this.assertLive();return this.field.texture}
 get view():GPUTextureView {this.assertLive();return this.field.view}
 get destroyed() {return this.released}
 private assertLive() {if(this.released)throw new Error('Canonical field buffer use after destroy')}
 clear(rect?:readonly[number,number,number,number]) {this.assertLive();this.owner.clearField(this.field,rect)}
 copyTo(dest:CanonicalFieldBuffer) {this.assertLive();dest.assertLive();if(dest.owner!==this.owner)throw new Error('Canonical buffer copy crosses devices');this.owner.copyField(this.field,dest.field)}
 /** SAME contract as AccumulationBuffer.copyRegionInto: both source and
  * destination arguments are canonical GL-bottom-up coordinates. Convert
  * at this explicit seam into WebGPU row-zero-at-world-top coordinates. */
 copyRegionInto(dest:CanonicalFieldBuffer,srcGlX:number,srcGlY:number,destGlX:number,destGlY:number,w:number,h:number) {
  this.assertLive();dest.assertLive();if(w<=0||h<=0)return
  if(dest.owner!==this.owner)throw new Error('Canonical buffer region copy crosses devices')
  this.owner.copyRegion(this.field,dest.field,[srcGlX,this.height-srcGlY-h],[destGlX,dest.height-destGlY-h],[w,h])
 }
 readBytes() {this.assertLive();return this.owner.readField(this.field)}
 upload(bytes:Uint8Array) {this.assertLive();this.owner.upload(this.field,bytes)}
 destroy() {if(this.released)return;this.released=true;this.owner.destroyField(this.field)}
}

/** Same scratch free-list ceilings as production, and explicit lease checking.
 * Every reused scratch must still be cleared/copied before reading. */
export class CanonicalScratchPool {
 readonly owner:CanonicalWatercolorWebGpu
 holding=false
 private readonly free=new Map<string,CanonicalFieldBuffer[]>()
 private readonly all=new Set<CanonicalFieldBuffer>()
 private readonly idle=new Set<CanonicalFieldBuffer>()
 private disposed=false
 constructor(owner:CanonicalWatercolorWebGpu) {this.owner=owner}
 get bytes() {let live=0,free=0;for(const b of this.all){if(this.idle.has(b))free+=b.width*b.height*4;else live+=b.width*b.height*4}return{live,free}}
 acquire(width:number,height:number):CanonicalFieldBuffer {
  if(this.disposed)throw new Error('Canonical scratch pool destroyed')
  const key=`${width}x${height}`,buffer=this.free.get(key)?.pop()
  if(buffer){this.idle.delete(buffer);return buffer}
  const created=new CanonicalFieldBuffer(this.owner,width,height,'nearest');this.all.add(created);return created
 }
 release(buffer:CanonicalFieldBuffer) {
  if(!this.all.has(buffer)||this.idle.has(buffer)||buffer.destroyed)throw new Error('Invalid canonical scratch lease release')
  const key=`${buffer.width}x${buffer.height}`,list=this.free.get(key)??[]
  this.free.set(key,list);list.push(buffer);this.idle.add(buffer)
  if(!this.holding)this.trimToCeiling()
 }
 trimToCeiling() {
  for(const [key,list] of this.free){while(list.length&&(list.length>24||this.bytes.free>64*1024*1024)){const b=list.pop()!;this.idle.delete(b);this.all.delete(b);b.destroy()}if(!list.length)this.free.delete(key)}
 }
 trimFree() {for(const b of this.idle){this.all.delete(b);b.destroy()}this.idle.clear();this.free.clear()}
 destroy() {if(this.disposed)return;this.disposed=true;for(const b of this.all)b.destroy();this.all.clear();this.idle.clear();this.free.clear()}
}

export interface CanonicalSettleField {
 w:number;h:number
 a:CanonicalFieldBuffer;b:CanonicalFieldBuffer;c:CanonicalFieldBuffer;coverage:CanonicalFieldBuffer
 ca:CanonicalFieldBuffer;cb:CanonicalFieldBuffer;cc:CanonicalFieldBuffer
 mask:CanonicalFieldBuffer;pressure:CanonicalFieldBuffer;band:CanonicalFieldBuffer
}
export function createCanonicalSettleField(owner:CanonicalWatercolorWebGpu,w:number,h:number):CanonicalSettleField {
 const make=(name:string)=>new CanonicalFieldBuffer(owner,w,h,name==='mask'||name==='pressure'?'linear':'nearest',`settle ${name}`)
 return{w,h,a:make('a'),b:make('b'),c:make('c'),coverage:make('coverage'),ca:make('ca'),cb:make('cb'),cc:make('cc'),mask:make('mask'),pressure:make('pressure'),band:make('band')}
}
export function destroyCanonicalSettleField(field:CanonicalSettleField) {for(const k of ['a','b','c','coverage','ca','cb','cc','mask','pressure','band'] as const)field[k].destroy()}
