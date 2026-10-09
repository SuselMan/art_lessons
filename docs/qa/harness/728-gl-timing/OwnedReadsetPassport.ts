import type {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import type {OwnedLazyUpStatus} from './OwnedLazyUpTransaction'
/** Structural witness ONLY. AccumulationBuffer has no authoritative content revision. */
export function captureOwnedReadsetStructure(buffers:readonly AccumulationBuffer[]){
 return buffers.map(buffer=>({buffer,gl:buffer.gl,texture:buffer.texture,width:buffer.width,height:buffer.height,storageWidth:buffer.storageWidth,storageHeight:buffer.storageHeight}))
}
export function sameOwnedReadsetStructure(passport:ReturnType<typeof captureOwnedReadsetStructure>,buffers:readonly AccumulationBuffer[]):boolean{
 return passport.length===buffers.length&&passport.every((p,i)=>{
  const b=buffers[i];return b===p.buffer&&b.gl===p.gl&&b.texture===p.texture&&b.width===p.width&&b.height===p.height&&b.storageWidth===p.storageWidth&&b.storageHeight===p.storageHeight
 })
}
/** CPU prototype admission precondition, not automatic detection of foreign writes.
 * Every actual writer must respect this boundary or invalidate its generation. */
export function ownedReadsetWriteBlocked(passport:ReturnType<typeof captureOwnedReadsetStructure>,buffers:readonly AccumulationBuffer[],status:OwnedLazyUpStatus,canonicalPending:boolean):boolean{
 return status!=='published'||canonicalPending||!sameOwnedReadsetStructure(passport,buffers)
}
