import {installMiniPuddle as installBase} from './controller-v24'
/** Existing exact shared geometry walk; material and draw order remain unchanged. */
export function installMiniPuddle(engine:any,size:number,mode:'morph'|'material',onStatus=(_message:string)=>{}){const painter=engine._ribbonPainter,old=painter.diagnosticBandBatch;painter.diagnosticBandBatch=true;try{const api=installBase(engine,size,mode,onStatus),destroy=api.destroy;api.destroy=()=>{painter.diagnosticBandBatch=old;destroy()};return api}catch(error){painter.diagnosticBandBatch=old;throw error}}
