import {CanonicalRoomTileBridge} from './roomTileBridge'
import type {CanonicalGpuField} from './types'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'

/** Unconnected CPU-tested proposal factory. No admission/source scheduling authority.
 * Two independent canvas contexts, using the exact existing raw publication shader.
 * 2*w*h*4 counts logical RGBA backing only, not physical swapchain/driver memory. */
export class PrivatePublicationFactory {
 private readonly slots:Array<{bridge:CanonicalRoomTileBridge;busy:boolean}>=[]
 private disposed=false
 private readonly device:GPUDevice
 private readonly width:number
 private readonly height:number
 private readonly canvasFactory:()=>HTMLCanvasElement
 constructor(device:GPUDevice,width:number,height:number,canvasFactory:()=>HTMLCanvasElement){
  this.device=device;this.width=width;this.height=height;this.canvasFactory=canvasFactory
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1024||height>1024)throw Error('Private publication logical budget exceeded')
 }
 get logicalMaxBytes(){return 2*this.width*this.height*4}
 acquire(){
  if(this.disposed)throw Error('Private publication factory disposed')
  let slot=this.slots.find(x=>!x.busy)
  if(!slot){
   if(this.slots.length===2)throw Error('Private publication capacity exhausted')
   const canvas=this.canvasFactory()
   if(this.slots.some(x=>x.bridge.canvas===canvas))throw Error('Private publication canvas aliases')
   const bridge=new CanonicalRoomTileBridge(this.device,canvas,this.width,this.height)
   slot={bridge,busy:false};this.slots.push(slot)
  }
  slot.busy=true;let consumed=false,released=false
  const release=()=>{if(released)return;released=true;slot.busy=false;if(this.disposed)slot.bridge.destroy()}
  return {
   canvas:slot.bridge.canvas,
   publish:async(field:CanonicalGpuField,target:AccumulationBuffer,current:()=>boolean)=>{
    if(consumed||released)throw Error('Private publication lease consumed')
    consumed=true
    try{await slot.bridge.copyByCanvas(field,target,()=>!this.disposed&&!released&&current())}finally{release()}
   },
   // Before publish only. An in-flight lease belongs to publish's finally.
   abandon:()=>{if(consumed&&!released)throw Error('Private publication pending');release()}
  }
 }
 dispose(){if(this.disposed)return;this.disposed=true;for(const slot of this.slots)if(!slot.busy)slot.bridge.destroy()}
}
