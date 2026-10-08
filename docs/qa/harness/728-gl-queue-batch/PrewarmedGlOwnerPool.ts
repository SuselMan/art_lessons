import type { AccumulationBuffer } from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import {createOwnedGlSourceFields,type OwnedGlRole,type OwnedGlSourceFields} from './OwnedGlSourceFields'
const ownerBytes=52*1024*1024
const roles:readonly OwnedGlRole[]=['presentation','original','coverage','coverageFilm','pigmentLoad','pigmentBase','pigmentFilm','colourLoad','colourBase','colourFilm','solventLoad','solventBase','solventFilm']
/** Setup allocates all textures before pointer admission. take() never allocates GPU storage. */
export class PrewarmedGlOwnerPool {
 readonly bytes:number
 private readonly owners:OwnedGlSourceFields[]=[]
 private readonly available:OwnedGlSourceFields[]=[]
 private readonly leased=new Set<OwnedGlSourceFields>()
 private disposed=false
 constructor(gl:WebGLRenderingContext,capacity:number,budgetBytes:number){
  if(!Number.isInteger(capacity)||capacity<1||capacity>3||!Number.isSafeInteger(budgetBytes)||budgetBytes<capacity*ownerBytes)throw Error('Explicit prewarm owner budget required')
  this.bytes=capacity*ownerBytes
  const empty=Object.fromEntries(roles.map(role=>[role,null]))as Record<OwnedGlRole,AccumulationBuffer|null>
  try{for(let n=0;n<capacity;n++){const owner=createOwnedGlSourceFields(gl,empty,fields=>{for(const field of fields)field.destroy()});this.owners.push(owner);this.available.push(owner)}}catch(error){for(const owner of this.owners)owner.release();throw error}
 }
 get physicalIdentities():ReadonlySet<object>{return new Set(this.owners.flatMap(owner=>owner.resources.map(resource=>resource.identity)))}
 get free():number{return this.available.length}
 take(initial:Readonly<Record<OwnedGlRole,AccumulationBuffer|null>>):OwnedGlSourceFields|null{
  if(this.disposed)throw Error('Disposed owner pool')
  // Validate all borrowed fields before mutating/removing any prewarmed slot.
  for(const role of roles){const f=initial[role];if(f&&(f.width!==1024||f.height!==1024))throw Error('Owner requires bounded1024 source')}
  const slot=this.available.pop();if(!slot)return null
  this.leased.add(slot)
  try{for(const role of roles){const source=initial[role],destination=slot.fields[role];if(source?.texture===destination.texture)throw Error('Owner admission feedback alias');if(source)source.copyTo(destination);else destination.clear()}}
  catch(error){this.leased.delete(slot);this.available.push(slot);throw error}
  let released=false
  return Object.freeze({fields:slot.fields,resources:slot.resources,bytes:slot.bytes,release:()=>{if(released)return;released=true;this.leased.delete(slot);if(!this.disposed)this.available.push(slot)}})
 }
 /** Caller must first stop producers/cancel FIFO and establish GPU-safe ownership fence. */
 disposeAfterFence():void{
  if(this.disposed)return
  if(this.leased.size)throw Error('Cannot destroy active owner leases')
  this.disposed=true;this.available.length=0
  for(const owner of this.owners)owner.release()
 }
}
