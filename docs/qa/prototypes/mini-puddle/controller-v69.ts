import {installInteractivePuddle} from './interactive-controller'
import {createNativePuddleTarget} from './native-target-v69'
export function installMiniPuddle(engine:any,size:number,mode:'morph'|'material',onStatus=(_message:string)=>{}){return installInteractivePuddle(engine,size,mode,onStatus,createNativePuddleTarget)}
