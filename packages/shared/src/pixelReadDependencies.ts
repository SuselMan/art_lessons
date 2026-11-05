import type {Operation} from './operations.js'
import {paintedLayerIds} from './operations.js'
import type {BrushSourceContext} from './brushSource.js'

/** Also usable for a database metadata projection that omits heavy dab arrays. */
export interface PixelReadMetadata {
 readonly type:string
 readonly layerId?:string
 readonly sources?:readonly {readonly id:string}[]
 readonly sourceId?:string
 readonly brushSource?:BrushSourceContext
}
export function operationReadLayerIds(op:PixelReadMetadata):string[] {
 if(op.type==='layer_merge')return (op.sources ?? []).map(source=>source.id)
 if(op.type==='layer_duplicate')return op.sourceId ? [op.sourceId] : []
 if(op.type==='stroke')return (op.brushSource?.projection ?? []).map(source=>source.id).filter(id=>id!==op.layerId)
 return []
}
function writes(op:Operation):string[] {
 if(op.type==='layer_merge'||op.type==='layer_duplicate'||op.type==='layer_add')return[op.layerId]
 if(op.type==='layer_delete')return op.layerIds
 return paintedLayerIds(op)
}

/** Propagate changes forward through read edges, not through current layer
 * adjacency. L→R→L is finite because each edge moves to a later operation. */
export function dependentReadOperations(operations:readonly Operation[],roots:readonly Operation[]):Operation[] {
 const changed=new Map<string,number>(),out:Operation[]=[]
 const mark=(id:string,seq:number)=>changed.set(id,Math.min(changed.get(id)??Infinity,seq))
 for(const root of roots)for(const id of writes(root))mark(id,root.seq??0)
 for(const op of [...operations].sort((a,b)=>(a.seq??0)-(b.seq??0))){
  const seq=op.seq??0
  if(!operationReadLayerIds(op).some(id=>(changed.get(id)??Infinity)<seq))continue
  out.push(op)
  for(const id of writes(op))mark(id,seq)
 }
 return out
}
