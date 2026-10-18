import {RibbonStrokeScratch} from '../../../../apps/web/src/engine/src/buffers/RibbonStrokeScratch'
import type {NativeComponentPlanes} from './native-component-partition'
/** QA-only material fork: no carrier reconstruction or palette substitution. */
export function forkNativeComponent(engine:any,anchor:any,planes:NativeComponentPlanes,observe?:(label:string,wallMs:number)=>void){
 let boundary=observe?performance.now():0
 const mark=(label:string)=>{if(!observe)return;const next=performance.now();observe(label,next-boundary);boundary=next}
 const size=1024,source=new RibbonStrokeScratch(engine._ribbonScratchPool,true,true),entry=source.getOrCreate(anchor.tile.buffer),original=anchor.scratch
 mark('scratch-and-entry-allocation')
 try{
  for(const[key,buffer]of Object.entries({p:entry.inkLoad,c:entry.inkColor,coverage:entry.coverage,original:entry.original})){
   if(!buffer)throw Error('Missing fork plane '+key);buffer.restorePixelsRect(size,size,planes[key as keyof NativeComponentPlanes])
  }
  mark('upload-four-main-planes')
  entry.solventLoad=engine._ribbonScratchPool.acquire(size,size);entry.foreignSolventLoad=engine._ribbonScratchPool.acquire(size,size)
  entry.solventLoad.restorePixelsRect(size,size,planes.solvent);entry.foreignSolventLoad.restorePixelsRect(size,size,planes.foreign)
  mark('allocate-and-upload-two-water-planes')
  const metadata=original.captureFinishMetadata();if(!metadata.finish)throw Error('Actual native finish required')
  source.gesture=metadata.gesture;source.noteFinish(metadata.finish);source.dryCtx=metadata.dryCtx
  for(const paint of metadata.paints)source.paints.add(paint)
  source.brushTravel=metadata.brushTravel;source.wetContacts=metadata.wetContacts;source.foreignSources=metadata.foreignSources
  // Preserve cached geometric scalars and every non-material finish field, including seed/profile.
  for(const key of ['_composite','_dir','_dirSet','_dabSpacing','_brushEdgePx','_firstDab','_lastDab','_bounds','turnOffset','turnDirection','foreignImportedGestures']){
   if(key in original)(source as any)[key]=(original as any)[key]
  }
  mark('copy-finish-and-geometry-metadata')
  return{source,entry,destroy:()=>source.destroy()}
 }catch(error){source.destroy();throw error}
}
