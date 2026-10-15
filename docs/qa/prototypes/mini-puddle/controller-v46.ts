import {installMiniPuddle as installBase} from './controller-v36'
/** Retain the brush's pools, tip, combs and depletion; reduce only pigment blot amplitude. */
export function installMiniPuddle(engine:any,size:number,mode:'morph'|'material',onStatus=(_message:string)=>{}){const passes=engine._ribbonPasses,old=passes.diagnosticPigmentBlot;passes.diagnosticPigmentBlot=.45;try{const api=installBase(engine,size,mode,onStatus),destroy=api.destroy;api.destroy=()=>{passes.diagnosticPigmentBlot=old;destroy()};return api}catch(e){passes.diagnosticPigmentBlot=old;throw e}}
