import {installMiniPuddle as installBase} from './controller-v58'
/** Keep full-sheet detailed solve; remove legacy 1536px minimum allocation. */
export function installMiniPuddle(engine:any,size:number,mode:'morph'|'material',onStatus=(_message:string)=>{}){const old=engine.diagnosticNativeFieldMinimum;engine.diagnosticNativeFieldMinimum=1024;try{const api=installBase(engine,size,mode,onStatus),destroy=api.destroy;api.destroy=()=>{engine.diagnosticNativeFieldMinimum=old;destroy()};return api}catch(e){engine.diagnosticNativeFieldMinimum=old;throw e}}
