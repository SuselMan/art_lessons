/** Exact representation change: capacity16, affinity9, wet1; no arithmetic model change. */
function once(source:string,from:string,to:string){if(source.split(from).length!==2)throw Error('Packed fine aux source drift: '+from);return source.replace(from,to)}
export function packFineAux(capacity:number,affinity:number,wet:number){
 if(!Number.isInteger(capacity)||capacity<0||capacity>65535||!Number.isInteger(affinity)||affinity<1||affinity>256||!Number.isInteger(wet)||wet<0||wet>1)throw Error('Invalid fine aux')
 return capacity|(affinity<<16)|(wet<<25)
}
export function unpackFineAux(word:number){return[word&65535,(word>>>16)&511,(word>>>25)&1,0]}
const pack=`fn packFineAux(capacity:u32,affinity:u32,wet:u32,unused:u32)->u32{return capacity|(affinity<<16u)|(wet<<25u);}\n`
const unpack=`fn unpackFineAux(word:u32)->vec4u{return vec4u(word&65535u,(word>>16u)&511u,(word>>25u)&1u,0u);}\n`
export function compactFineInit(source:string){
 let s=once(source,'var<storage,read_write> aux:array<vec4u>;','var<storage,read_write> aux:array<u32>;')
 if(s.split('aux[i]=vec4u(').length!==3)throw Error('Packed fine aux initialization drift')
 s=s.replaceAll('aux[i]=vec4u(','aux[i]=packFineAux(')
 return once(s,'@compute ',pack+'@compute ')
}
export function compactFinePair(source:string){
 const s=once(once(source,'var<storage,read> aux:array<vec4u>;','var<storage,read> aux:array<u32>;'),'let qa=aux[ia];let qb=aux[ib];','let qa=unpackFineAux(aux[ia]);let qb=unpackFineAux(aux[ib]);')
 return once(s,'@compute ',unpack+'@compute ')
}
