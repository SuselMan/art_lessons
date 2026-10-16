import {installMiniPuddle as installBase} from './controller-v52'
/** Reuse adjacent interpolated nib poses without changing vertex bytes. */
export function installMiniPuddle(engine:any,size:number,mode:'morph'|'material',onStatus=(_message:string)=>{}){const painter=engine._ribbonPainter,old=painter.diagnosticReuseBandPoses;painter.diagnosticReuseBandPoses=true;try{const api=installBase(engine,size,mode,onStatus),destroy=api.destroy;api.destroy=()=>{painter.diagnosticReuseBandPoses=old;destroy()};return api}catch(e){painter.diagnosticReuseBandPoses=old;throw e}}
