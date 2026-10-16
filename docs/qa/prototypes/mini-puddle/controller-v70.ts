import {installInteractivePuddle} from './interactive-controller'
import {createNativePuddleTarget} from './native-target-v70'
export function installMiniPuddle(engine:any,size:number,mode:'morph'|'material',onStatus=(_message:string)=>{}){return installInteractivePuddle(engine,size,mode,onStatus,createNativePuddleTarget)}
