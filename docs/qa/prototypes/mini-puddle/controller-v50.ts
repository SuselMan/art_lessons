import {installMiniPuddle as installBase} from './controller-v46'
/** Preserve all encoded vertex bytes; avoid copying each used array prefix. */
export function installMiniPuddle(engine:any,size:number,mode:'morph'|'material',onStatus=(_message:string)=>{}){const painter=engine._ribbonPainter,old=painter.diagnosticBandViews;painter.diagnosticBandViews=true;try{const api=installBase(engine,size,mode,onStatus),destroy=api.destroy;api.destroy=()=>{painter.diagnosticBandViews=old;destroy()};return api}catch(e){painter.diagnosticBandViews=old;throw e}}
