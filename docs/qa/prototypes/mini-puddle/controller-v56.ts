import {installMiniPuddle as installBase} from './controller-v56-core'
/** One field goal: retain source brush detail, omit additional chronological brush-drag contacts. */
export function installMiniPuddle(engine:any,size:number,mode:'morph'|'material',onStatus=(_message:string)=>{}){
 const owner=engine._settlePlan,prepare=owner.prepare;owner.prepare=function(...args:any[]){const old=owner.diagnosticSkipBrushContacts;owner.diagnosticSkipBrushContacts=true;try{return prepare.apply(this,args)}finally{owner.diagnosticSkipBrushContacts=old}}
 try{const api=installBase(engine,size,mode,onStatus),destroy=api.destroy;api.destroy=()=>{try{destroy()}finally{owner.prepare=prepare}};return api}catch(e){owner.prepare=prepare;throw e}
}
