/** DEV contract A: independently normalized canonical PB and C optical moments.
 * A COMMON fraction moves all five components. No C<=PB or RGB<=CA admission.
 * Source/settle fit formulas are unchanged. Every component total stays exact. */
export type MomentVector=readonly [number,number,number,number,number]
export interface VectorExchange {wet:number;mixRate:number;advectionRate:number;direction:number}
function validate(v:MomentVector){if(v.length!==5||v.some(x=>!Number.isInteger(x)||x<0||x>255))throw Error('Five Q8 canonical moments required')}
export function exchangeMomentVector(a:MomentVector,b:MomentVector,flow:VectorExchange):{a:number[];b:number[];mixFraction:number;advFraction:number}{
 validate(a);validate(b)
 if(![flow.wet,flow.mixRate,flow.advectionRate,flow.direction].every(Number.isInteger)||[flow.wet,flow.mixRate,flow.advectionRate].some(x=>x<0||x>255)||Math.abs(flow.direction)>256)throw Error('Bounded integer vector flow required')
 const mixFraction=Math.floor(flow.wet*flow.mixRate/255)
 const aa=a.map((v,i)=>Math.floor(((255-mixFraction)*v+mixFraction*b[i])/255)),bb=b.map((v,i)=>a[i]+v-aa[i])
 const forward=flow.direction>=0,source=forward?aa:bb,target=forward?bb:aa
 let advFraction=Math.floor(Math.floor(flow.wet*flow.advectionRate/255)*Math.abs(flow.direction)/256)
 for(let j=0;j<5;j++)if(source[j]>0){
  // floor(source*lambda/255)<=room iff source*lambda<255*(room+1).
  advFraction=Math.min(advFraction,Math.floor((255*(256-target[j])-1)/source[j]))
 }
 for(let j=0;j<5;j++){const moved=Math.floor(source[j]*advFraction/255);source[j]-=moved;target[j]+=moved}
 return{a:aa,b:bb,mixFraction,advFraction}
}
