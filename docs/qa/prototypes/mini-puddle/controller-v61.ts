import {installMiniPuddle as installBase} from './controller-v52'
/** Only display wet-paper map resolution; pigment/solver inputs untouched. */
export function installMiniPuddle(engine:any,size:number,mode:'morph'|'material',onStatus=(_message:string)=>{}){const old=engine.diagnosticWetOverlayCap;engine.diagnosticWetOverlayCap=80;try{const api=installBase(engine,size,mode,onStatus),destroy=api.destroy;api.destroy=()=>{engine.diagnosticWetOverlayCap=old;destroy()};return api}catch(e){engine.diagnosticWetOverlayCap=old;throw e}}
