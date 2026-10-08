import type {SettlePlanTile} from '../../../../apps/web/src/engine/src/watercolor/SettlePlanContracts'
export const commonSourceRoles=['original','coverage','coverageFilm','inkLoad','inkSettled','inkColor','colorSettled','strokeInk','inkBase','strokeColor','colorBase','inkDry','colorDry','foreignSolventLoad','solventLoad','solventBase','strokeSolvent'] as const
export type CommonSourceRole=typeof commonSourceRoles[number]
export interface SourceBuffer {width:number;height:number;filter?:'nearest'|'linear';_baseFilter?:'nearest'|'linear'}
export interface CommonSourceField {role:CommonSourceRole|'target';presence:'absent'|'null'|'field';alias:number|null;width:number|null;height:number|null;filter:'nearest'|'linear'|null;bytes?:Uint8Array}
export interface CommonSourceShape {fields:CommonSourceField[];filmGesture:number;coverageFilmGesture:number|undefined;solventGesture:number|undefined;physicalBytes:number}
/** Read-only structural audit before either snapshot allocation or upload. */
export function commonSourceShape<B extends SourceBuffer>(entry:SettlePlanTile<B>,target:B):CommonSourceShape{
 const identities=new Map<B,number>(),fields:CommonSourceField[]=[];let physicalBytes=0
 for(const role of [...commonSourceRoles,'target'] as const){const value=role==='target'?target:entry[role],presence=value===undefined?'absent':value===null?'null':'field'
  if(!value){fields.push({role,presence,alias:null,width:null,height:null,filter:null});continue}
  if(value.width!==1024||value.height!==1024)throw Error('Common-source control supports only actual1024 tile')
  const filter=value.filter??value._baseFilter;if(filter!=='nearest'&&filter!=='linear')throw Error('Actual source filter metadata required')
  if(!identities.has(value)){identities.set(value,identities.size);physicalBytes+=value.width*value.height*4}
  fields.push({role,presence,alias:identities.get(value)!,width:value.width,height:value.height,filter})
 }
 if(physicalBytes>72*1024*1024)throw Error('Common-source snapshot budget exceeded')
 return{fields,filmGesture:entry.filmGesture,coverageFilmGesture:entry.coverageFilmGesture,solventGesture:entry.solventGesture,physicalBytes}
}
export function validateCommonSourcePayload(source:CommonSourceShape,recipient:CommonSourceShape){
 const shape=(s:CommonSourceShape)=>JSON.stringify({filmGesture:s.filmGesture,coverageFilmGesture:s.coverageFilmGesture,solventGesture:s.solventGesture,physicalBytes:s.physicalBytes,fields:s.fields.map(({bytes:_bytes,...field})=>field)})
 if(shape(source)!==shape(recipient))throw Error('Source ownership/null/alias/filter/film contract differs')
 for(const field of source.fields)if(field.presence==='field'&&(!field.bytes||field.bytes.length!==field.width!*field.height!*4))throw Error('Missing exact Q8 source payload')
}
