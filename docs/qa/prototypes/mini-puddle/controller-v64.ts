import {installMiniPuddle as installBase} from './controller-v52'
/** Approximate synthetic lift with four recorded samples instead of eight. */
export function installMiniPuddle(engine:any,size:number,mode:'morph'|'material',onStatus=(_message:string)=>{}){const old=engine.diagnosticWatercolorLiftSteps;engine.diagnosticWatercolorLiftSteps=4;try{const api=installBase(engine,size,mode,onStatus),destroy=api.destroy;api.destroy=()=>{engine.diagnosticWatercolorLiftSteps=old;destroy()};return api}catch(e){engine.diagnosticWatercolorLiftSteps=old;throw e}}
