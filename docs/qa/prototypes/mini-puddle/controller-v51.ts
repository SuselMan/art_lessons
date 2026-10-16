import {installMiniPuddle as installBase} from './controller-v46'
/** Input priority: refresh display-only wet shading on the next display, not inside DOWN. */
export function installMiniPuddle(engine:any,size:number,mode:'morph'|'material',onStatus=(_message:string)=>{}){
 const api=installBase(engine,size,mode,onStatus),start=engine._onStart,update=engine._updateWetTexture,destroy=api.destroy;let entering=false
 engine._onStart=function(...args:any[]){entering=true;try{return start.apply(this,args)}finally{entering=false}}
 engine._updateWetTexture=function(...args:any[]){if(entering)return;return update.apply(this,args)}
 api.destroy=()=>{engine._onStart=start;engine._updateWetTexture=update;destroy()};return api
}
