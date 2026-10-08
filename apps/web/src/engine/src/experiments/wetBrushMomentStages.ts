import {exchangeMomentVector,type MomentVector,type VectorExchange} from './wetBrushMomentVector'
/** Diagnostic decomposition using the SAME production candidate oracle.
 * GPU currently performs both operations inside one pair dispatch. */
export function exchangeMomentStages(a:MomentVector,b:MomentVector,flow:VectorExchange){
 const mixed=exchangeMomentVector(a,b,{...flow,advectionRate:0})
 const final=exchangeMomentVector(mixed.a as unknown as MomentVector,mixed.b as unknown as MomentVector,{...flow,mixRate:0})
 return{input:{a:[...a],b:[...b]},mixed,final}
}
