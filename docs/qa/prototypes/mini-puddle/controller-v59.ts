import {installMiniPuddle as installBase} from './controller-v58'
/** Allocate the one required native field at load, without extra retained copies. */
export function installMiniPuddle(engine:any,size:number,mode:'morph'|'material',onStatus=(_message:string)=>{}){const api=installBase(engine,size,mode,onStatus);engine._diffuseFieldFor(size,size,1,'tight');return api}
