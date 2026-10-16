import {installMiniPuddle as installBase} from './controller-v47'
/** Skip a byte-identical CPU copy only for origin-zero tile band uploads. */
export function installMiniPuddle(engine:any,size:number,mode:'morph'|'material',onStatus=(_message:string)=>{}){const passes=engine._ribbonPasses,old=passes.diagnosticZeroOriginBands;passes.diagnosticZeroOriginBands=true;try{const api=installBase(engine,size,mode,onStatus),destroy=api.destroy;api.destroy=()=>{passes.diagnosticZeroOriginBands=old;destroy()};return api}catch(e){passes.diagnosticZeroOriginBands=old;throw e}}
